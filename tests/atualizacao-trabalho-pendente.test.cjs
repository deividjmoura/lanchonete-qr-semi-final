'use strict';

/**
 * Proteção contra perda de trabalho antes de atualizar (#301).
 *
 * A issue é explícita: "a proteção deve considerar também operações
 * assíncronas em andamento, não apenas campos de formulário alterados".
 * Estes testes exercitam o cliente HTTP REAL (`src/lib/api.ts`, via harness que
 * já roda o módulo transpilado) e a detecção REAL (`src/lib/trabalhoPendente.ts`).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { carregar, hub } = require('./helpers/api-harness.cjs');

const RAIZ = path.join(__dirname, '..');

function transpilar(relativo) {
  return ts.transpileModule(fs.readFileSync(path.join(RAIZ, relativo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

/**
 * Carrega `trabalhoPendente.ts` num contexto próprio, com classes de DOM
 * mínimas (o módulo usa `instanceof`) e o MESMO `operacoes` da aba testada.
 */
function carregarTrabalhoPendente(operacoes) {
  const modulo = { exports: {} };
  const contexto = {
    module: modulo,
    exports: modulo.exports,
    require: (pedido) => (pedido.includes('operacoes') ? operacoes : require(pedido)),
    console,
    HTMLInputElement: class HTMLInputElement {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    HTMLSelectElement: class HTMLSelectElement {},
  };
  vm.createContext(contexto);
  vm.runInContext(transpilar('src/lib/trabalhoPendente.ts'), contexto, { filename: 'trabalhoPendente.ts' });
  return { ...modulo.exports, classes: contexto };
}

/** DOM falso mínimo: só o que a detecção consulta. */
function domFalso({ campos = [], marcador = false } = {}) {
  return {
    querySelectorAll: () => campos,
    querySelector: (seletor) => (marcador && seletor.includes('aria-busy') ? {} : null),
  };
}

function aba(servidor) {
  const api = carregar(servidor, { BroadcastChannel: hub().Canal });
  return { api, operacoes: api.operacoes, trabalho: carregarTrabalhoPendente(api.operacoes) };
}

test('escrita em voo conta como operação pendente do começo ao fim', async () => {
  let liberar;
  const promessaFetch = new Promise((resolve) => { liberar = resolve; });
  const { api, operacoes, trabalho } = aba({ fetch: () => promessaFetch });

  const vazio = trabalho.estadoDoTrabalho(domFalso());
  assert.equal(vazio.pendente, false);

  const envio = api.apiSend('/api/cozinha/itens/1/status', 'PATCH', { status: 'em_producao' });
  assert.equal(operacoes.operacoesEmAndamento(), 1, 'PATCH em voo precisa ser visível para o aviso');
  const durante = trabalho.estadoDoTrabalho(domFalso());
  assert.equal(durante.pendente, true, 'sem campo sujo, a operação em voo já protege');
  assert.equal(durante.operacoes, 1);
  assert.equal(durante.formulario, false);

  liberar({ ok: true, status: 200, statusText: 'OK', json: async () => ({ ok: true }) });
  await envio;
  assert.equal(operacoes.operacoesEmAndamento(), 0, 'contador precisa zerar no fim');
  assert.equal(trabalho.estadoDoTrabalho(domFalso()).pendente, false);
});

test('operação que falha também libera o contador (aviso não fica travado)', async () => {
  const servidor = {
    fetch: async () => ({
      ok: false,
      status: 500,
      statusText: 'Erro',
      json: async () => ({ error: 'boom' }),
      clone() { return this; },
    }),
  };
  const { api, operacoes } = aba(servidor);
  await assert.rejects(() => api.apiSend('/api/caixa/sessoes/7/fechar', 'POST'));
  assert.equal(operacoes.operacoesEmAndamento(), 0);
});

test('leitura (apiGet) e login não marcam trabalho pendente', async () => {
  const servidor = { fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }) };
  const { api, operacoes } = aba(servidor);
  await api.apiGet('/api/cozinha/fila');
  await api.apiSend('/api/login', 'POST', { setor: 'caixa', senha: 'x' });
  assert.equal(operacoes.operacoesEmAndamento(), 0, 'GET e login não precisam proteger contra reload');
});

test('formulário alterado, operação em voo e tela ocupada somam no mesmo retrato', () => {
  const { trabalho } = aba({ fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  const { HTMLInputElement } = trabalho.classes;
  const campo = (props) => Object.assign(new HTMLInputElement(), { type: 'text', disabled: false, ...props });

  assert.equal(trabalho.estadoDoTrabalho(domFalso()).pendente, false, 'nada alterado = nada pendente');
  assert.equal(trabalho.estadoDoTrabalho(domFalso({ campos: [campo({ value: 'novo', defaultValue: 'antigo' })] })).pendente, true);
  assert.equal(trabalho.estadoDoTrabalho(domFalso({ marcador: true })).pendente, true, 'aria-busy/data-operation-pending conta');
  assert.equal(trabalho.formularioAlterado(domFalso({ campos: [campo({ value: 'antigo', defaultValue: 'antigo' })] })), false);
  assert.equal(trabalho.formularioAlterado(domFalso({ campos: [campo({ value: 'x', defaultValue: 'y', disabled: true })] })), false, 'campo desabilitado não é trabalho');
});

test('checkbox e select alterados são detectados (select não tem defaultValue)', () => {
  const { trabalho } = aba({ fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  const { HTMLInputElement, HTMLSelectElement } = trabalho.classes;

  const checkbox = Object.assign(new HTMLInputElement(), {
    type: 'checkbox', checked: true, defaultChecked: false, disabled: false,
  });
  assert.equal(trabalho.formularioAlterado(domFalso({ campos: [checkbox] })), true);

  const opcoes = (marcada) => [
    { value: 'mesa-1', defaultSelected: false, selected: marcada === 'mesa-1' },
    { value: 'mesa-3', defaultSelected: true, selected: marcada === 'mesa-3' },
  ];
  const select = Object.assign(new HTMLSelectElement(), {
    value: 'mesa-3', size: 1, multiple: false, options: opcoes('mesa-3'), disabled: false,
  });
  assert.equal(trabalho.formularioAlterado(domFalso({ campos: [select] })), false, 'mesma opção inicial');
  select.value = 'mesa-1'; // só é trabalho se o valor DIFERIR do inicial
  assert.equal(trabalho.formularioAlterado(domFalso({ campos: [select] })), true, 'opção diferente da inicial');

  // Sem `defaultSelected` no HTML, um select de tamanho 1 começa na 1ª opção.
  const semMarcacao = Object.assign(new HTMLSelectElement(), {
    value: 'a', size: 1, multiple: false, disabled: false,
    options: [{ value: 'a', defaultSelected: false }, { value: 'b', defaultSelected: false }],
  });
  assert.equal(trabalho.formularioAlterado(domFalso({ campos: [semMarcacao] })), false);
  semMarcacao.options[1].selected = true;
  semMarcacao.value = 'b'; // no DOM real, marcar a opção também atualiza o value
  assert.equal(trabalho.formularioAlterado(domFalso({ campos: [semMarcacao] })), true);

  // Select múltiplo: compara o CONJUNTO marcado com o HTML (#308 já cobre isso).
  const multiplo = Object.assign(new HTMLSelectElement(), {
    value: 'x', size: 4, multiple: true, disabled: false,
    options: [
      { value: 'x', defaultSelected: true, selected: true },
      { value: 'y', defaultSelected: false, selected: false },
    ],
  });
  assert.equal(trabalho.formularioAlterado(domFalso({ campos: [multiplo] })), false);
  multiplo.options[1].selected = true;
  assert.equal(trabalho.formularioAlterado(domFalso({ campos: [multiplo] })), true, 'nova opção marcada conta');
});

test('componente do aviso usa confirmação modal, nunca confirm() nativo', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'src/components/AvisoAtualizacao.tsx'), 'utf8');
  assert.doesNotMatch(fonte, /\bwindow\.confirm\s*\(/, 'confirmação nativa é proibida no produto');
  assert.match(fonte, /confirmarAcao\(/);
  assert.match(fonte, /Continuar por enquanto/);
  assert.match(fonte, /Atualizar agora/);
  // Só recarrega depois da escolha explícita do operador.
  assert.match(fonte, /window\.location\.reload\(\)/);
  const trabalho = fs.readFileSync(path.join(RAIZ, 'src/lib/trabalhoPendente.ts'), 'utf8');
  assert.match(trabalho, /operacoesEmAndamento/);
});
