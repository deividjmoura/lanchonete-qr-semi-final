const test = require('node:test');
const assert = require('node:assert/strict');

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://regress:regress@127.0.0.1:5432/regress';
}
const pool = require('../db/pool');
const { transferirMesa, assumirMesa, iniciarAtendimentoGarcom, listarPedidosProntosGarcom } = require('../db/atendimento');
const { entregarComoGarcom } = require('../db/garcons');

const originalQuery = pool.query;
const originalConnect = pool.connect;
const tokens = {
  '00000000-0000-4000-8000-000000000001': { id: 1, nome: 'Ana', token: '00000000-0000-4000-8000-000000000001', ativo: true },
  '00000000-0000-4000-8000-000000000002': { id: 2, nome: 'Bruno', token: '00000000-0000-4000-8000-000000000002', ativo: true },
};

function stubTokenLookup() {
  pool.query = async (sql, params = []) => {
    if (/FROM garcons WHERE token = \$1/i.test(sql)) {
      const row = tokens[params[0]];
      return { rows: row ? [row] : [] };
    }
    throw new Error('Query inesperada no teste: ' + sql);
  };
}

test.afterEach(() => {
  pool.query = originalQuery;
  pool.connect = originalConnect;
});

test('fila de retirada é compartilhada e as permissões são por item, não por dono da mesa', async () => {
  // Regressão do bug original: a fila era filtrada por garcom_responsavel_id e
  // escondia itens prontos de qualquer outro garçom (inclusive o da própria mesa
  // quando o pedido tinha origem 'garcom'). Agora a fila é compartilhada e cada
  // item informa quem pode aceitá-lo/retirá-lo/entregá-lo.
  const itensProntos = [
    { id: 1501, pedido_id: 501, nome: 'Item pronto', quantidade: 1, status: 'concluido', setor: 'cozinha',
      aceito_por_id: null, retirado_por_id: null, entregue_por_id: null },
    { id: 1502, pedido_id: 501, nome: 'Item aceito por Ana', quantidade: 1, status: 'aceito', setor: 'bar',
      aceito_por_id: 1, aceito_por_nome: 'Ana', retirado_por_id: null, entregue_por_id: null },
  ];
  pool.query = async (sql, params = []) => {
    if (/FROM garcons WHERE token = \$1/i.test(sql)) {
      const row = tokens[params[0]];
      return { rows: row ? [row] : [] };
    }
    if (/SELECT DISTINCT p\.id/i.test(sql)) {
      assert.match(sql, /s\.status='aberta'/);
      assert.match(sql, /ip\.status IN \('concluido','aceito','retirado'\)/);
      assert.doesNotMatch(sql, /s\.garcom_responsavel_id=\$1/, 'fila não pode ser restrita ao dono da mesa');
      assert.doesNotMatch(sql, /origem_pedido\s*=\s*'cliente'/, 'fila não pode esconder pedido lançado pelo garçom');
      return { rows: [{ id: 501, status: 'concluido', criado_em: new Date(0), mesa: 4, sessao_id: 90, garcom_responsavel_id: 1, garcom_responsavel_nome: 'Ana' }] };
    }
    if (/SELECT ip\.id,ip\.pedido_id,pr\.nome/i.test(sql)) return { rows: itensProntos.map(i => ({ ...i })) };
    if (/FROM itens_pedido_adicionais/i.test(sql) || /FROM itens_pedido_remocoes/i.test(sql)) return { rows: [] };
    throw new Error('Query inesperada no teste de fila: ' + sql);
  };

  const [ana, bruno] = await Promise.all([
    listarPedidosProntosGarcom('00000000-0000-4000-8000-000000000001'),
    listarPedidosProntosGarcom('00000000-0000-4000-8000-000000000002'),
  ]);

  // Ambos enxergam os itens prontos da mesa 4, mesmo Bruno não sendo o responsável.
  assert.deepEqual(ana.map(p => p.id), [501]);
  assert.deepEqual(bruno.map(p => p.id), [501]);
  assert.equal(ana[0].itensProntos, 1);
  assert.equal(bruno[0].responsavelMesaNome, 'Ana');
  for (const fila of [ana, bruno]) {
    const pronto = fila[0].itens.find(i => i.id === 1501);
    const aceito = fila[0].itens.find(i => i.id === 1502);
    assert.equal(pronto.podeAceitar, true, 'item pronto pode ser aceito por qualquer garçom ativo');
    assert.equal(aceito.podeAceitar, false, 'item já aceito não pode ser tomado de novo');
    assert.equal(aceito.garcomAceitoNome, 'Ana');
  }
  // Só quem aceitou pode retirar/entregar aquele item.
  assert.equal(ana[0].itens.find(i => i.id === 1502).podeRetirar, true);
  assert.equal(bruno[0].itens.find(i => i.id === 1502).podeRetirar, false);
  assert.equal(bruno[0].itens.find(i => i.id === 1502).podeEntregar, false);
});

test('transferência grava origem, destino e ator; pedidos prontos não são alterados', async () => {
  stubTokenLookup();
  const calls = [];
  pool.connect = async () => ({
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT id FROM mesas WHERE numero/i.test(sql)) return { rows: [{ id: 40, numero: 4 }] };
      if (/SELECT id, garcom_responsavel_id FROM mesa_sessoes/i.test(sql)) return { rows: [{ id: 90, garcom_responsavel_id: 1 }] };
      if (/SELECT id, nome, ativo FROM garcons/i.test(sql)) return { rows: [{ id: 2, nome: 'Bruno', ativo: true }] };
      if (/INSERT INTO auditoria_eventos/i.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    },
    release() {},
  });

  const result = await transferirMesa('00000000-0000-4000-8000-000000000001', 4, 2);
  assert.equal(result.transferida, true);
  assert.equal(result.pedidosProntosMantidos, true);
  assert.deepEqual(result.de, { id: 1, nome: 'Ana' });
  assert.deepEqual(result.para, { id: 2, nome: 'Bruno' });
  const update = calls.find(c => /UPDATE mesa_sessoes SET garcom_responsavel_id/i.test(c.sql));
  assert.deepEqual(update.params, [90, 2]);
  const history = calls.find(c => /INSERT INTO mesa_atendimento_historico/i.test(c.sql));
  assert.deepEqual(history.params, [90, 1, 2, 1]);
  assert.equal(calls.some(c => /UPDATE (itens_pedido|pedidos)\b/i.test(c.sql)), false);
});

test('transferência é recusada se o solicitante não for o responsável atual', async () => {
  stubTokenLookup();
  const calls = [];
  pool.connect = async () => ({
    async query(sql, params = []) {
      calls.push(sql);
      if (/SELECT id FROM mesas WHERE numero/i.test(sql)) return { rows: [{ id: 40, numero: 4 }] };
      if (/SELECT id, garcom_responsavel_id FROM mesa_sessoes/i.test(sql)) return { rows: [{ id: 90, garcom_responsavel_id: 2 }] };
      if (/SELECT id, nome, ativo FROM garcons/i.test(sql)) return { rows: [{ id: 2, nome: 'Bruno', ativo: true }] };
      return { rows: [] };
    },
    release() {},
  });
  await assert.rejects(() => transferirMesa('00000000-0000-4000-8000-000000000001', 4, 2), err => err.status === 403);
  assert.equal(calls.some(sql => /UPDATE mesa_sessoes SET garcom_responsavel_id/i.test(sql)), false);
  assert.equal(calls.some(sql => /INSERT INTO mesa_atendimento_historico/i.test(sql)), false);
});

test('transferência rejeita um destino desativado', async () => {
  stubTokenLookup();
  const calls = [];
  pool.connect = async () => ({
    async query(sql, params = []) {
      calls.push(sql);
      if (/SELECT id FROM mesas WHERE numero/i.test(sql)) return { rows: [{ id: 40, numero: 4 }] };
      if (/SELECT id, garcom_responsavel_id FROM mesa_sessoes/i.test(sql)) return { rows: [{ id: 90, garcom_responsavel_id: 1 }] };
      if (/SELECT id, nome, ativo FROM garcons/i.test(sql)) return { rows: [{ id: 2, nome: 'Bruno', ativo: false }] };
      return { rows: [] };
    },
    release() {},
  });
  await assert.rejects(() => transferirMesa('00000000-0000-4000-8000-000000000001', 4, 2), err => err.status === 409);
  assert.equal(calls.some(sql => /UPDATE mesa_sessoes SET garcom_responsavel_id/i.test(sql)), false);
  assert.equal(calls.some(sql => /INSERT INTO mesa_atendimento_historico/i.test(sql)), false);
});

test('iniciar atendimento não permite tomar mesa já atribuída, mesmo com transferir:true', async () => {
  stubTokenLookup();
  const calls = [];
  pool.connect = async () => ({
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT quantidade FROM configuracao_mesas/i.test(sql)) return { rows: [{ quantidade: 20 }] };
      if (/SELECT id, numero, token FROM mesas WHERE numero/i.test(sql)) return { rows: [{ id: 40, numero: 4, token: 'mesa-token' }] };
      if (/SELECT id FROM mesas WHERE id = \$1 FOR UPDATE/i.test(sql)) return { rows: [{ id: 40 }] };
      if (/SELECT id FROM mesa_sessoes WHERE mesa_id = \$1 AND status = 'aberta'/i.test(sql)) return { rows: [{ id: 90 }] };
      if (/SELECT garcom_responsavel_id, cliente_nome FROM mesa_sessoes/i.test(sql)) return { rows: [{ garcom_responsavel_id: 2, cliente_nome: 'Cliente' }] };
      return { rows: [] };
    },
    release() {},
  });
  await assert.rejects(() => assumirMesa('00000000-0000-4000-8000-000000000001', 4, { transferir: true }), err => err.status === 409);
  assert.equal(calls.some(c => /UPDATE mesa_sessoes SET garcom_responsavel_id/i.test(c.sql)), false);
  assert.equal(calls.some(c => /INSERT INTO mesa_atendimento_historico/i.test(c.sql)), false);
});

test('após transferência, ex-responsável não avança item aceito por outro garçom', async () => {
  const { criarEstado, install } = require('./helpers/fake-pool-itens.cjs');
  const estado = criarEstado({
    garcons: [tokens['00000000-0000-4000-8000-000000000001'], tokens['00000000-0000-4000-8000-000000000002']],
    sessao: { id: 90, garcom_responsavel_id: 2 },
    pedido: { id: 501, sessao_id: 90, status: 'aceito' },
    itens: [{ id: 1501, pedido_id: 501, status: 'aceito', aceito_por_id: 2 }],
  });
  const restore = install(pool, estado);
  try {
    await assert.rejects(
      () => entregarComoGarcom(501, '00000000-0000-4000-8000-000000000001', [1501], null, 'retirar'),
      err => err.status === 403
    );
    assert.equal(estado.commits, 0);
    assert.equal(estado.rollbacks, 1);
    assert.equal(estado.itens[0].status, 'aceito');
    assert.equal(estado.historico.filter(h => h.tipo === 'item').length, 0);
  } finally { restore(); }
});

test('garçom colaborador assume item pronto sem transferir a mesa do responsável', async () => {
  const { criarEstado, install } = require('./helpers/fake-pool-itens.cjs');
  const { assumirEntregaComoGarcom } = require('../db/garcons');
  const estado = criarEstado({
    garcons: [tokens['00000000-0000-4000-8000-000000000001'], tokens['00000000-0000-4000-8000-000000000002']],
    sessao: { id: 90, garcom_responsavel_id: 1 },
    pedido: { id: 501, sessao_id: 90, status: 'concluido' },
    itens: [{ id: 1501, pedido_id: 501, status: 'concluido' }],
  });
  const restore = install(pool, estado);
  try {
    const out = await assumirEntregaComoGarcom(501, '00000000-0000-4000-8000-000000000002', 'req-helper', [1501]);
    assert.equal(out.responsabilidadeAtribuida, false);
    assert.equal(Number(out.responsavelMesa.id), 1, 'responsabilidade da mesa permanece com Ana');
    assert.equal(estado.sessao.garcom_responsavel_id, 1);
    assert.equal(estado.itens[0].status, 'aceito');
    assert.equal(Number(estado.itens[0].aceito_por_id), 2, 'posse do item é de quem aceitou');
    assert.equal(estado.commits, 1);
  } finally { restore(); }
});

test('primeiro aceite de mesa sem responsável atribui a mesa no servidor', async () => {
  const { criarEstado, install } = require('./helpers/fake-pool-itens.cjs');
  const { assumirEntregaComoGarcom } = require('../db/garcons');
  const estado = criarEstado({
    garcons: [tokens['00000000-0000-4000-8000-000000000002']],
    sessao: { id: 90, garcom_responsavel_id: null },
    pedido: { id: 501, sessao_id: 90, status: 'concluido' },
    itens: [{ id: 1501, pedido_id: 501, status: 'concluido' }],
  });
  const restore = install(pool, estado);
  try {
    const out = await assumirEntregaComoGarcom(501, '00000000-0000-4000-8000-000000000002', 'req-first', [1501]);
    assert.equal(out.responsabilidadeAtribuida, true);
    assert.equal(Number(estado.sessao.garcom_responsavel_id), 2);
    assert.ok(estado.historico.some(h => h.tipo === 'mesa'));
    assert.ok(estado.auditoria.some(a => a.acao === 'mesa_assumida'));
  } finally { restore(); }
});

test('A lista de mesas identifica pedido iniciado pelo cliente via QR', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../db/atendimento.js'), 'utf8');
  assert.match(source, /p\.origem_pedido = 'cliente'/);
  assert.match(source, /pedidoClienteQr: r\.pedido_cliente_qr === true/);
});

test('garçom consegue iniciar sessão de mesa vazia com atribuição e auditoria atômicas', async () => {
  stubTokenLookup();
  const calls = [];
  pool.connect = async () => ({
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT quantidade FROM configuracao_mesas/i.test(sql)) return { rows: [{ quantidade: 20 }] };
      if (/SELECT id, numero FROM mesas WHERE numero/i.test(sql)) return { rows: [{ id: 40, numero: 4 }] };
      if (/SELECT id, garcom_responsavel_id, cliente_nome/i.test(sql)) return { rows: [] };
      if (/INSERT INTO mesa_sessoes/i.test(sql)) return { rows: [{ id: 91 }] };
      if (/INSERT INTO auditoria_eventos/i.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    },
    release() {},
  });
  const result = await iniciarAtendimentoGarcom(
    '00000000-0000-4000-8000-000000000001', 4, { clienteNome: 'Cliente balcão' }, 'req-start-empty'
  );
  assert.equal(result.mesa, 4);
  assert.equal(result.sessaoId, 91);
  assert.equal(result.iniciada, true);
  assert.equal(result.idempotentReplay, false);
  const create = calls.find(c => /INSERT INTO mesa_sessoes/i.test(c.sql));
  assert.deepEqual(create.params, [40, 'Cliente balcão', 1]);
  const history = calls.find(c => /INSERT INTO mesa_atendimento_historico/i.test(c.sql));
  assert.deepEqual(history.params, [91, null, 1, 1]);
  assert.ok(calls.some(c => /UPDATE mesas SET status='ocupada'/i.test(c.sql)));
  assert.ok(calls.some(c => /INSERT INTO auditoria_eventos/i.test(c.sql)));
  assert.ok(calls.some(c => /COMMIT/i.test(c.sql)));
});

test('iniciar atendimento não toma sessão que já pertence a outro garçom', async () => {
  stubTokenLookup();
  const calls = [];
  pool.connect = async () => ({
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT quantidade FROM configuracao_mesas/i.test(sql)) return { rows: [{ quantidade: 20 }] };
      if (/SELECT id, numero FROM mesas WHERE numero/i.test(sql)) return { rows: [{ id: 40, numero: 4 }] };
      if (/SELECT id, garcom_responsavel_id, cliente_nome/i.test(sql)) return { rows: [{ id: 91, garcom_responsavel_id: 2, cliente_nome: 'Cliente' }] };
      return { rows: [] };
    },
    release() {},
  });
  await assert.rejects(
    () => iniciarAtendimentoGarcom('00000000-0000-4000-8000-000000000001', 4, {}),
    err => err.status === 409
  );
  assert.equal(calls.some(c => /UPDATE mesa_sessoes/i.test(c.sql)), false);
  assert.equal(calls.some(c => /INSERT INTO mesa_sessoes/i.test(c.sql)), false);
  assert.equal(calls.some(c => /INSERT INTO mesa_atendimento_historico/i.test(c.sql)), false);
  assert.ok(calls.some(c => /ROLLBACK/i.test(c.sql)));
});
