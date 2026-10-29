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

test('dois garçons em dispositivos distintos recebem somente a fila de suas próprias mesas', async () => {
  const mainQueries = [];
  pool.query = async (sql, params = []) => {
    if (/FROM garcons WHERE token = \$1/i.test(sql)) {
      const row = tokens[params[0]];
      return { rows: row ? [row] : [] };
    }
    if (/SELECT DISTINCT p\.id/i.test(sql)) {
      mainQueries.push({ sql, id: params[0] });
      assert.match(sql, /s\.status\s*=\s*'aberta'/);
      assert.match(sql, /s\.garcom_responsavel_id\s*=\s*\$1/);
      return { rows: [{ id: params[0] === 1 ? 501 : 502, status: 'concluido', criado_em: new Date(0), mesa: params[0] === 1 ? 4 : 8 }] };
    }
    if (/SELECT ip\.id, ip\.pedido_id, pr\.nome/i.test(sql)) {
      const orderId = params[0][0];
      return { rows: [{ id: orderId + 1000, pedido_id: orderId, nome: 'Item pronto', quantidade: 1, status: 'concluido', setor: 'cozinha' }] };
    }
    if (/FROM itens_pedido_adicionais/i.test(sql) || /FROM itens_pedido_remocoes/i.test(sql)) return { rows: [] };
    throw new Error('Query inesperada no teste de fila: ' + sql);
  };

  const [ana, bruno] = await Promise.all([
    listarPedidosProntosGarcom('00000000-0000-4000-8000-000000000001'),
    listarPedidosProntosGarcom('00000000-0000-4000-8000-000000000002'),
  ]);

  assert.deepEqual(ana.map(p => p.id), [501]);
  assert.deepEqual(bruno.map(p => p.id), [502]);
  assert.deepEqual(mainQueries.map(q => q.id).sort(), [1, 2]);
  assert.ok(ana.every(p => p.mesa === 4));
  assert.ok(bruno.every(p => p.mesa === 8));
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

test('garçom anterior recebe 403 ao tentar entregar após a transferência', async () => {
  stubTokenLookup();
  const calls = [];
  pool.connect = async () => ({
    async query(sql, params = []) {
      calls.push(sql);
      if (/SELECT sessao_id FROM pedidos/i.test(sql)) return { rows: [{ sessao_id: 90 }] };
      if (/SELECT id, status, garcom_responsavel_id FROM mesa_sessoes/i.test(sql)) return { rows: [{ id: 90, status: 'aberta', garcom_responsavel_id: 2 }] };
      return { rows: [] };
    },
    release() {},
  });
  await assert.rejects(() => entregarComoGarcom(501, '00000000-0000-4000-8000-000000000001'), err => err.status === 403);
  assert.equal(calls.some(sql => /UPDATE itens_pedido/i.test(sql)), false);
  assert.equal(calls.some(sql => /COMMIT/i.test(sql)), false);
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
      if (/SELECT id, garcom_responsavel_id, cliente_nome[\\s\\S]*FROM mesa_sessoes/i.test(sql)) return { rows: [] };
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
      if (/SELECT id, garcom_responsavel_id, cliente_nome[\\s\\S]*FROM mesa_sessoes/i.test(sql)) return { rows: [{ id: 91, garcom_responsavel_id: 2, cliente_nome: 'Cliente' }] };
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
