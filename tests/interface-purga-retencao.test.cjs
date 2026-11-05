'use strict';

/**
 * Issue #240 (rodada 3) — contrato da interface de anonimização de histórico.
 *
 * A decisão de retenção existe no papel (Política §8 e
 * `docs/engineering/data-policy-proposal.md` §3.1), mas quem opera o painel
 * precisa encontrá-la onde executa a ação. Este teste garante que:
 *
 *   - o painel `Limpar` explica os prazos num ícone de informação acessível
 *     (aria-expanded/aria-controls), e não só num `title` invisível no toque;
 *   - a explicação diz que a operação é **manual**, que a revisão é a cada
 *     **90 dias** e que **não pode ser desfeita**;
 *   - o texto continua avisando que valor, forma de pagamento, data e autoria
 *     são preservados — a promessa que a #265 tornou verdadeira no código;
 *   - `Ver prévia` continua existindo antes de `Anonimizar`.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');

const admin = ler('src', 'screens', 'Admin.tsx');

/** Recorta o bloco `sub === "purge"` da tela de administração. */
function painelPurga() {
  const inicio = admin.indexOf('{sub === "purge" && (');
  assert.ok(inicio > 0, 'a tela precisa manter a aba de anonimização');
  const fim = admin.indexOf('{sub ===', inicio + 10);
  return admin.slice(inicio, fim > inicio ? fim : undefined);
}

test('painel de anonimização explica os prazos num botão de informação acessível', () => {
  const painel = painelPurga();
  assert.match(painel, /aria-expanded=\{purgeInfo\}/, 'o botão precisa expor o estado');
  assert.match(painel, /aria-controls="purgeRetentionInfo"/, 'o botão precisa apontar o painel que abre');
  assert.match(painel, /id="purgeRetentionInfo"/, 'o painel de explicação precisa existir');
  assert.match(
    painel,
    /aria-label="Prazos de retenção e o que esta anonimização faz"/,
    'o ícone precisa de rótulo: um "i" solto não é lido por leitor de tela',
  );
  // Um `title` sozinho não abre no toque no celular; a explicação é um bloco real.
  assert.match(painel, /\{purgeInfo && \(/, 'a explicação precisa ser um bloco alternável');
});

test('a explicação repete os prazos aprovados e as regras da operação', () => {
  const painel = painelPurga();
  for (const prazo of [
    /até 12 meses após o fechamento/,
    /até 5 anos/,
    /até 24 meses/,
    /até 90 dias/,
    /até sincronizar ou limpar os dados/,
  ]) {
    assert.match(painel, prazo, 'prazo ausente no painel: ' + prazo);
  }
  assert.match(painel, /recomendado|revise a cada\s*\n?\s*90 dias/, 'revisão periódica precisa aparecer');
  assert.match(painel, /<strong>manual<\/strong>|é manual/, 'a operação é manual — não é agendada');
  assert.match(painel, /não pode ser\s*\n?\s*desfeito|Não pode ser\s*\n?\s*desfeito/i, 'irreversibilidade precisa ser dita');
  assert.match(painel, /não são anonimizados aqui/, 'registro financeiro fica fora desta operação');
});

test('prévia continua sendo o caminho antes de anonimizar', () => {
  const painel = painelPurga();
  assert.match(painel, /Ver prévia/, 'a prévia é obrigatória na prática');
  // Compara os botões de ação, não o título da seção ("Anonimizar histórico antigo").
  const previa = painel.indexOf('void previewPurge()');
  const executa = painel.indexOf('void executarPurge()');
  assert.ok(previa > 0 && executa > 0, 'os dois botões precisam existir');
  assert.ok(previa < executa, 'a prévia aparece antes do botão que executa');
  assert.match(painel, /Valor, forma de pagamento, data e autoria são\s*\n?\s*preservados/);
});

test('os documentos que registram as decisões continuam existindo e citados', () => {
  const proposta = ler('docs', 'engineering', 'data-policy-proposal.md');
  for (const arquivo of ['procedimento-titulares.md', 'ciclo-de-vida-contas-staff.md']) {
    assert.ok(
      fs.existsSync(path.join(raiz, 'docs', 'engineering', arquivo)),
      'documento ausente: ' + arquivo,
    );
    assert.match(proposta, new RegExp(arquivo.replace('.', '\\.')), 'proposta precisa citar ' + arquivo);
  }
  assert.match(proposta, /90 dias/, 'a cadência de revisão precisa estar registrada');
});
