// A fila é dividida por ITEM e por SETOR: a comanda de burger + caipirinha
// aparece pela metade na cozinha e pela metade no bar — nunca inteira nas duas.
// Cobre também o vai-e-vem caixa → cozinha/bar, que fazia comandas já
// entregues reaparecerem como pendentes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function carregarModulo(caminho) {
  const fonte = fs.readFileSync(caminho, 'utf8');
  const js = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', 'require', js)(mod.exports, mod, (id) => {
    throw new Error(`import inesperado em ${caminho}: ${id}`);
  });
  return mod.exports;
}

const fila = carregarModulo('src/lib/filaProducao.ts');
const mappers = carregarModulo('src/lib/mappers.ts');

const item = (id, nome, status, setor) => ({
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
  setor,
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

test('comanda mista: cada setor vê só os itens que produz', () => {
  const mista = pedido(40, 1000, [
    item(1, 'Burger', 'recebido', 'cozinha'),
    item(2, 'Batata', 'em_producao', 'cozinha'),
    item(3, 'Caipirinha', 'recebido', 'bar'),
    item(4, 'Chopp', 'recebido', 'bar'),
  ]);

  const naCozinha = fila.cardsDaEtapa([mista], 'na_fila', 'cozinha');
  const emProducaoCozinha = fila.cardsDaEtapa([mista], 'em_producao', 'cozinha');
  const noBar = fila.cardsDaEtapa([mista], 'na_fila', 'bar');

  assert.deepEqual(naCozinha[0].itens.map((i) => i.nome), ['Burger'], 'cozinha não vê os drinks');
  assert.deepEqual(emProducaoCozinha[0].itens.map((i) => i.nome), ['Batata']);
  assert.deepEqual(noBar[0].itens.map((i) => i.nome), ['Caipirinha', 'Chopp'], 'bar não vê a comida');
  assert.deepEqual(fila.contarItensPorEtapa([mista], 'cozinha'), { em_producao: 1, na_fila: 1 });
  assert.deepEqual(fila.contarItensPorEtapa([mista], 'bar'), { em_producao: 0, na_fila: 2 });
});

test('comanda sem nenhum item do setor não vira cartão vazio', () => {
  const soComida = pedido(41, 1000, [item(1, 'Burger', 'recebido', 'cozinha')]);
  assert.equal(fila.cardsDaEtapa([soComida], 'na_fila', 'bar').length, 0);
  assert.equal(fila.pedidosDoSetor([soComida], 'bar').length, 0);
  assert.equal(fila.pedidosDoSetor([soComida], 'cozinha').length, 1);
});

test('sem setor informado nada é filtrado (garçom, caixa e mesa usam a lista inteira)', () => {
  const mista = pedido(42, 1000, [
    item(1, 'Burger', 'recebido', 'cozinha'),
    item(2, 'Caipirinha', 'recebido', 'bar'),
  ]);
  assert.equal(fila.cardsDaEtapa([mista], 'na_fila')[0].itens.length, 2);
  assert.deepEqual(fila.pedidosDoSetor([mista]), [mista]);
});

test('comanda vinda do caixa não reaparece como pendente na cozinha nem no bar', () => {
  // A API do caixa devolve pedidosEntregues SEM status e SEM setor do item.
  const payload = [
    {
      id: 7,
      mesa: 9,
      mesaId: 9,
      abertaEm: new Date().toISOString(),
      valorTotal: 64,
      valorPago: 0,
      valorRestante: 64,
      pagamentos: [],
      taxaServicoPercentual: 10,
      taxaServicoSugerida: 6.4,
      pedidosPendentes: 0,
      pedidosCancelados: 0,
      pedidosEntregues: [
        {
          id: 27,
          criadoEm: new Date().toISOString(),
          clienteNome: 'Cliente M9',
          itens: [{ id: 38, nome: 'Aperol Summer 43', quantidade: 2, preco_unitario: '32.00', subtotal: 64 }],
          total: 64,
        },
      ],
    },
  ];

  const { pedidos } = mappers.mapCaixaSessoes(payload);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].status, 'entregue');
  assert.deepEqual(pedidos[0].itens.map((i) => i.status), ['entregue'], 'item sem status é entregue, nunca "recebido"');
  assert.equal(fila.cardsDaEtapa(pedidos, 'na_fila', 'cozinha').length, 0);
  assert.equal(fila.cardsDaEtapa(pedidos, 'em_producao', 'cozinha').length, 0);
  assert.equal(fila.cardsDaEtapa(pedidos, 'na_fila', 'bar').length, 0);
});

test('a fila da cozinha/bar não herda comandas de outra tela', () => {
  const store = fs.readFileSync('src/store/usePub.ts', 'utf8');
  for (const nome of ['hydrateCozinha', 'hydrateBar']) {
    const inicio = store.indexOf(`${nome}: async () => {`);
    assert.ok(inicio > 0, `${nome} precisa existir no store`);
    const corpo = store.slice(inicio, store.indexOf('\n  },', inicio));
    assert.doesNotMatch(
      corpo,
      /p\.status === "entregue"/,
      `${nome} não deve preservar comandas "entregues" de outras telas`,
    );
    assert.doesNotMatch(corpo, /\.\.\.rest/, `${nome} deve usar só a lista do próprio setor`);
  }
});

test('a tela passa o setor para contar e montar os cartões', () => {
  const tela = fs.readFileSync('src/components/FilaProducao.tsx', 'utf8');
  assert.match(tela, /contarItensPorEtapa\(pedidos, setor\)/);
  assert.match(tela, /cardsDaEtapa\(pedidos, "em_producao", setor\)/);
  assert.match(tela, /cardsDaEtapa\(pedidos, "na_fila", setor\)/);
});
