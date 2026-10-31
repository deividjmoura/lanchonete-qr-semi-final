// Unidade pura da fila de produção: a tela é por ITEM, não por comanda.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function carregarModulo() {
  const fonte = fs.readFileSync('src/lib/filaProducao.ts', 'utf8');
  const js = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', 'require', js)(mod.exports, mod, () => ({}));
  return mod.exports;
}

const fila = carregarModulo();

const item = (id, nome, status) => ({
  id: String(id),
  produtoId: Number(id),
  nome,
  qtd: 1,
  precoBase: 10,
  adicionais: [],
  removidos: [],
  escolha: null,
  obs: '',
  totalUnit: 10,
  status,
});

const pedido = (id, criadoEm, itens) => ({
  id,
  sessaoId: 1,
  mesaId: id,
  mesaNome: 'Mesa ' + id,
  clienteNome: 'Cliente ' + id,
  itens,
  status: 'em_producao',
  criadoEm,
  total: 0,
});

test('a comanda de 3 itens aparece nas duas etapas com apenas os itens de cada uma', () => {
  const comanda = pedido(10, 1000, [
    item(1, 'Burger', 'em_producao'),
    item(2, 'Fritas', 'recebido'),
    item(3, 'Suco', 'recebido'),
  ]);

  const producao = fila.cardsDaEtapa([comanda], 'em_producao');
  const naFila = fila.cardsDaEtapa([comanda], 'na_fila');

  assert.equal(producao.length, 1);
  assert.equal(naFila.length, 1);
  assert.deepEqual(producao[0].itens.map((i) => i.id), ['1']);
  assert.deepEqual(naFila[0].itens.map((i) => i.id), ['2', '3']);
  assert.deepEqual(fila.contarItensPorEtapa([comanda]), { em_producao: 1, na_fila: 2 });
});

test('item concluído sai da fila do setor e não cria "prontos"', () => {
  const comanda = pedido(11, 1000, [
    item(1, 'Burger', 'concluido'),
    item(2, 'Fritas', 'recebido'),
  ]);
  assert.equal(fila.cardsDaEtapa([comanda], 'em_producao').length, 0);
  assert.deepEqual(fila.cardsDaEtapa([comanda], 'na_fila')[0].itens.map((i) => i.id), ['2']);
  assert.equal(fila.ETAPAS_FILA.length, 2, 'só existem as duas etapas: em produção e na fila');
  assert.deepEqual(
    fila.ETAPAS_FILA.map((e) => e.titulo),
    ['Em produção', 'Na fila']
  );
  assert.ok(!fila.ETAPAS_FILA.some((e) => /pronto/i.test(e.titulo) || /pronto/i.test(e.id)));
});

test('comandas são ordenadas pela mais antiga e comandas sem itens na etapa não viram cartão', () => {
  const antiga = pedido(20, 1000, [item(1, 'Velha', 'recebido')]);
  const nova = pedido(21, 5000, [item(2, 'Nova', 'recebido')]);
  const soPronta = pedido(22, 500, [item(3, 'Pronta', 'concluido')]);
  const cards = fila.cardsDaEtapa([nova, antiga, soPronta], 'na_fila');
  assert.deepEqual(cards.map((c) => c.pedido.id), [20, 21]);
});

test('alerta de 15 minutos vale só acima do limite', () => {
  const agora = 10_000_000;
  const c = pedido(30, agora - 15 * 60_000, [item(1, 'X', 'recebido')]);
  assert.equal(fila.pedidoAtrasado(c, agora), false, 'exatamente 15 min ainda não alerta');
  assert.equal(fila.pedidoAtrasado(c, agora + 1), true);
  assert.equal(fila.LIMITE_ATRASO_MINUTOS, 15);
});

test('rótulos deixam explícito que a ação de comanda atinge só a etapa atual', () => {
  assert.equal(fila.rotuloAcaoComanda('na_fila', 3), 'Iniciar os 3 itens desta etapa');
  assert.equal(fila.rotuloAcaoComanda('na_fila', 1), 'Iniciar o item desta etapa');
  assert.equal(fila.rotuloAcaoComanda('em_producao', 2), 'Liberar os 2 itens desta etapa');
  const filaEtapa = fila.ETAPAS_FILA.find((e) => e.id === 'na_fila');
  const producao = fila.ETAPAS_FILA.find((e) => e.id === 'em_producao');
  assert.equal(filaEtapa.proximo, 'em_producao');
  assert.equal(producao.proximo, 'concluido');
  assert.equal(filaEtapa.acaoItem, 'Iniciar este item');
  assert.equal(producao.acaoItem, 'Liberar este item');
});
