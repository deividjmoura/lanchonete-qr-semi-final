require('dotenv').config();

// These contract tests reject malformed requests before acquiring a DB client.
// The URL is deliberately local and is never contacted by these cases.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://regress:regress@127.0.0.1:5432/regress';
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarPedido, ErroPedido } = require('../db/pedidos');

function rejeicao400(promise) {
  return assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErroPedido);
    assert.equal(error.status, 400);
    return true;
  });
}

test('criação de pedido rejeita corpo ausente, não objeto e array', async () => {
  await rejeicao400(criarPedido('token-mesa', null));
  await rejeicao400(criarPedido('token-mesa', 'pedido'));
  await rejeicao400(criarPedido('token-mesa', []));
});

test('criação de pedido rejeita carrinho ausente ou vazio antes de abrir conexão', async () => {
  await rejeicao400(criarPedido('token-mesa', {}));
  await rejeicao400(criarPedido('token-mesa', { items: [] }));
  await rejeicao400(criarPedido('token-mesa', { items: 'produto' }));
});

test('criação de pedido rejeita chave de idempotência malformada antes do banco', async () => {
  await rejeicao400(criarPedido('token-mesa', {
    idempotencyKey: 'bad key!',
    items: [{ productId: 1, qty: 1 }],
  }));
  await rejeicao400(criarPedido('token-mesa', {
    idempotency_key: 42,
    items: [{ productId: 1, qty: 1 }],
  }));
});

test('normalização de idempotência aceita chave válida não-UUID e rejeita formatos inválidos', () => {
  const { idempotencyKeyDoCorpo } = require('../db/conta');

  assert.equal(idempotencyKeyDoCorpo({ idempotencyKey: 'order-key-123' }), 'order-key-123');
  assert.equal(idempotencyKeyDoCorpo({ idempotencyKey: 'bad key!' }), false);
  assert.equal(idempotencyKeyDoCorpo({ idempotency_key: 42 }), false);
  assert.equal(idempotencyKeyDoCorpo({}), null);
});


const { totalEntregueDaSessao, sincronizarValorTotalSessao } = require('../db/conta');
const { comRetryConcorrencia } = require('../db/retry');
const { registrarPagamento, fecharSessao, ErroCaixa } = require('../db/caixa');
const { sincronizarStatusPedido, setStatusPedido } = require('../db/pedidos');

test('status agregado acompanha itens mistos e entrega parcial sem marcar pedido como entregue cedo', async () => {
  const cases = [
    { items: ['recebido', 'recebido'], expected: 'recebido' },
    { items: ['em_producao', 'recebido'], expected: 'em_producao' },
    { items: ['concluido', 'recebido'], expected: 'em_producao' },
    { items: ['concluido', 'entregue'], expected: 'concluido' },
    { items: ['entregue', 'entregue'], expected: 'entregue' },
  ];

  for (const scenario of cases) {
    const calls = [];
    const client = {
      async query(sql, params) {
        calls.push({ sql, params });
        if (sql.includes('SELECT COALESCE(status, \'recebido\') AS status FROM itens_pedido')) {
          return { rows: scenario.items.map((status) => ({ status })) };
        }
        if (sql.includes('UPDATE pedidos SET status = $2')) {
          return { rows: [{ id: 81, status: params[1] }] };
        }
        throw new Error('Consulta inesperada no teste de status agregado');
      },
    };

    const result = await sincronizarStatusPedido(client, 81);
    assert.equal(result.status, scenario.expected, scenario.items.join(','));
    assert.equal(calls.length, 2);
    assert.equal(calls[1].params[0], 81);
    assert.equal(calls[1].params[1], scenario.expected);
  }
});

test('total devido do caixa é recomputado dos itens entregues, não do acumulador antigo', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT COALESCE(SUM(') && sql.includes('itens_pedido')) {
        return { rows: [{ total: '17.35' }] };
      }
      if (sql.includes('UPDATE mesa_sessoes SET valor_total = $2')) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error('Consulta inesperada no teste de consistência do caixa');
    },
  };

  assert.equal(await totalEntregueDaSessao(client, 44), 17.35);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /COALESCE\(ip\.status, 'recebido'\) = 'entregue'/);
  assert.deepEqual(calls[0].params, [44]);

  calls.length = 0;
  assert.equal(await sincronizarValorTotalSessao(client, 44), 17.35);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params, [44, 17.35]);
  assert.match(calls[1].sql, /status = 'aberta'/);
});

test('pagamento e fechamento rejeitam entradas inválidas antes de conectar ao banco', async () => {
  await assert.rejects(
    () => registrarPagamento(44, { formaPagamento: 'bitcoin', valor: 10 }),
    (error) => error instanceof ErroCaixa && error.status === 400
  );
  await assert.rejects(
    () => registrarPagamento(44, { formaPagamento: 'pix', valor: 0 }),
    (error) => error instanceof ErroCaixa && error.status === 400
  );
  await assert.rejects(
    () => fecharSessao(44, { formaPagamento: 'dinheiro', desconto: -1 }),
    (error) => error instanceof ErroCaixa && error.status === 400
  );
  await assert.rejects(
    () => fecharSessao(44, { formaPagamento: 'dinheiro', taxaServico: 'NaN' }),
    (error) => error instanceof ErroCaixa && error.status === 400
  );
  await assert.rejects(
    () => registrarPagamento(0, { formaPagamento: 'pix', valor: 10 }),
    (error) => error instanceof ErroCaixa && error.status === 400
  );
});

test('retry de concorrência repete apenas deadlock/serialization e retorna resultado da tentativa seguinte', async () => {
  let attempts = 0;
  const sleeps = [];
  const result = await comRetryConcorrencia(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('deadlock sintético'), { code: '40P01' });
    return { ok: true, attempt: attempts };
  }, {
    tentativas: 3,
    atrasoBaseMs: 0,
    dormir: async (ms) => sleeps.push(ms),
  });

  assert.deepEqual(result, { ok: true, attempt: 2 });
  assert.equal(attempts, 2);
  assert.equal(sleeps.length, 1);
});

test('retry não repete erro de negócio e respeita limite de tentativas de concorrência', async () => {
  let businessAttempts = 0;
  await assert.rejects(
    () => comRetryConcorrencia(async () => {
      businessAttempts += 1;
      throw Object.assign(new Error('conflito de negócio'), { status: 409 });
    }, { dormir: async () => {} }),
    /conflito de negócio/
  );
  assert.equal(businessAttempts, 1);

  let deadlockAttempts = 0;
  await assert.rejects(
    () => comRetryConcorrencia(async () => {
      deadlockAttempts += 1;
      throw Object.assign(new Error('deadlock sintético'), { code: '40P01' });
    }, { tentativas: 3, atrasoBaseMs: 0, dormir: async () => {} }),
    /deadlock sintético/
  );
  assert.equal(deadlockAttempts, 3);
});


// Transaction-level order tests use a scripted fake client. They exercise the
// real service function while ensuring no PostgreSQL connection is opened.
const poolPedidos = require('../db/pool');
const TOKEN_MESA_TESTE = '123e4567-e89b-42d3-a456-426614174000';

function clientePedidoFake({ estoqueDisponivel = true, falharNoInsertAdicional = false, produtoDisponivel = true, produtoExiste = true } = {}) {
  const calls = [];
  let nextItemId = 700;
  const client = {
    released: false,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id, numero, status FROM mesas WHERE token = $1')) {
        return { rows: [{ id: 10, numero: 4, status: 'livre' }] };
      }
      if (sql.includes('SELECT id FROM mesas WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 10 }] };
      }
      if (sql.includes("SELECT id FROM mesa_sessoes WHERE mesa_id = $1 AND status = 'aberta'")) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO mesa_sessoes (mesa_id)')) return { rows: [{ id: 55 }] };
      if (sql.includes('UPDATE mesas SET status')) return { rows: [], rowCount: 1 };
      if (sql.includes('SELECT id FROM produtos WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE')) {
        return { rows: [{ id: 8 }] };
      }
      if (sql.includes('SELECT id, nome, preco, disponivel, pede_ponto_carne, controla_estoque, estoque FROM produtos')) {
        return { rows: [{
          id: 8, nome: 'Hambúrguer teste', preco: '10.25', disponivel: true,
          pede_ponto_carne: true, controla_estoque: true, estoque: 5,
        }] };
      }
      if (sql.includes('SELECT id, produto_id, nome, preco FROM adicionais')) {
        return { rows: [{ id: 3, produto_id: 8, nome: 'Queijo extra', preco: '2.50' }] };
      }
      if (sql.includes('SELECT produto_id, ingrediente FROM produtos_ingredientes_removiveis')) {
        return { rows: [{ produto_id: 8, ingrediente: 'cebola' }] };
      }
      if (sql.includes('INSERT INTO pedidos (sessao_id, observacao_geral, cliente_nome)')) {
        return { rows: [{ id: 90, status: 'recebido', criado_em: '2026-01-01T12:00:00Z', cliente_nome: params[2], editado_em: null }] };
      }
      if (sql.includes('UPDATE mesa_sessoes SET cliente_nome = COALESCE(cliente_nome, $2)')) return { rows: [], rowCount: 1 };
      if (sql.includes('UPDATE mesa_sessoes SET pix_informado_em = NULL')) return { rows: [], rowCount: 1 };
      if (sql.includes('INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, ponto_carne, observacao)')) {
        return { rows: [{ id: nextItemId++ }] };
      }
      if (sql.includes('INSERT INTO itens_pedido_adicionais')) {
        if (falharNoInsertAdicional) throw new Error('falha sintética ao gravar adicional');
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO itens_pedido_remocoes')) return { rows: [], rowCount: 1 };
      if (sql.includes('UPDATE produtos') && sql.includes('SET estoque = estoque - $1')) {
        return estoqueDisponivel
          ? { rows: [{ estoque: 3, disponivel: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      throw new Error('Consulta inesperada no teste de criação: ' + sql);
    },
    release() { this.released = true; },
  };
  return { client, calls };
}

async function comPoolDePedidoFake(fake, fn) {
  const originalConnect = poolPedidos.connect;
  poolPedidos.connect = async () => fake.client;
  try {
    return await fn();
  } finally {
    poolPedidos.connect = originalConnect;
  }
}

test('criação transacional usa preço do servidor, deduplica adicional e calcula total com quantidade', async () => {
  const fake = clientePedidoFake();
  const result = await comPoolDePedidoFake(fake, () => criarPedido(TOKEN_MESA_TESTE, {
    clienteNome: '  Cliente teste  ',
    note: ' sem cebola ',
    items: [{
      productId: 8,
      qty: 2,
      price: 0.01,
      additions: [{ id: 3 }, { id: 3 }, { id: 999 }],
      removals: ['cebola', 'cebola', 'ingrediente-nao-permitido'],
      meatPoint: 'AO_PONTO',
      note: '  sem picles  ',
    }],
  }));

  assert.equal(result.id, 90);
  assert.equal(result.sessaoId, 55);
  assert.equal(result.mesa, 4);
  assert.equal(result.total, 25.5);
  assert.equal(result.idempotentReplay, false);
  assert.equal(result.clienteNome, 'Cliente teste');
  assert.equal(result.itens[0].quantidade, 2);
  assert.equal(result.itens[0].precoUnitario, 10.25);
  assert.equal(result.itens[0].unitTotal, 12.75);
  assert.deepEqual(result.itens[0].adicionais, [{ id: 3, nome: 'Queijo extra', preco: 2.5 }]);
  assert.deepEqual(result.itens[0].removals, ['cebola']);
  assert.equal(result.itens[0].pontoCarne, 'AO_PONTO');
  assert.equal(result.itens[0].observacao, 'sem picles');
  assert.ok(fake.calls.some((c) => c.sql.includes('UPDATE produtos') && c.sql.includes('SET estoque = estoque - $1') && c.params[0] === 2));
  assert.ok(fake.calls.some((c) => c.sql === 'COMMIT'));
  assert.equal(fake.calls.some((c) => c.sql === 'ROLLBACK'), false);
  assert.equal(fake.client.released, true);
});

test('criação rejeita quantidade fracionária e desfaz a transação sem commit', async () => {
  const fake = clientePedidoFake();
  await comPoolDePedidoFake(fake, () => assert.rejects(
    criarPedido(TOKEN_MESA_TESTE, { items: [{ productId: 8, qty: 1.5 }] }),
    (error) => error instanceof ErroPedido && error.status === 400
  ));

  assert.ok(fake.calls.some((c) => c.sql === 'ROLLBACK'));
  assert.equal(fake.calls.some((c) => c.sql === 'COMMIT'), false);
  assert.equal(fake.client.released, true);
  assert.equal(fake.calls.some((c) => c.sql.includes('INSERT INTO itens_pedido (')), false);
});

test('criação detecta corrida de estoque esgotado e reverte o pedido inteiro', async () => {
  const fake = clientePedidoFake({ estoqueDisponivel: false });
  await comPoolDePedidoFake(fake, () => assert.rejects(
    criarPedido(TOKEN_MESA_TESTE, { items: [{ productId: 8, qty: 2 }] }),
    (error) => error instanceof ErroPedido && error.status === 409 && /esgotou durante o pedido/.test(error.message)
  ));

  assert.ok(fake.calls.some((c) => c.sql.includes('INSERT INTO pedidos')));
  assert.ok(fake.calls.some((c) => c.sql === 'ROLLBACK'));
  assert.equal(fake.calls.some((c) => c.sql === 'COMMIT'), false);
  assert.equal(fake.client.released, true);
});

test('falha ao gravar adicional aciona rollback e não confirma pedido parcial', async () => {
  const fake = clientePedidoFake({ falharNoInsertAdicional: true });
  await comPoolDePedidoFake(fake, () => assert.rejects(
    criarPedido(TOKEN_MESA_TESTE, {
      items: [{ productId: 8, qty: 1, additions: [{ id: 3 }] }],
    }),
    /falha sintética ao gravar adicional/
  ));

  assert.ok(fake.calls.some((c) => c.sql.includes('INSERT INTO itens_pedido_adicionais')));
  assert.ok(fake.calls.some((c) => c.sql === 'ROLLBACK'));
  assert.equal(fake.calls.some((c) => c.sql === 'COMMIT'), false);
  assert.equal(fake.client.released, true);
});


// Preflight transition checks must reject invalid/unauthorized transitions
// before acquiring a pool connection; no PostgreSQL is involved.
test('status de pedido inválido e entrega solicitada por cozinha/bar são rejeitados antes do banco', async () => {
  const originalConnect = poolPedidos.connect;
  let connections = 0;
  poolPedidos.connect = async () => { connections += 1; throw new Error('não deveria conectar'); };
  try {
    await assert.rejects(
      () => setStatusPedido(90, 'status-inexistente'),
      (error) => error instanceof ErroPedido && error.status === 400
    );
    await assert.rejects(
      () => setStatusPedido(90, 'entregue', 'cozinha'),
      (error) => error instanceof ErroPedido && error.status === 403
    );
    await assert.rejects(
      () => setStatusPedido(90, 'entregue', 'bar'),
      (error) => error instanceof ErroPedido && error.status === 403
    );
    assert.equal(connections, 0);
  } finally {
    poolPedidos.connect = originalConnect;
  }
});

test('pedido entregue não pode regredir para produção e a transação termina em rollback', async () => {
  const calls = [];
  const originalConnect = poolPedidos.connect;
  const client = {
    released: false,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id, status, sessao_id FROM pedidos WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 90, status: 'entregue', sessao_id: 55 }] };
      }
      throw new Error('consulta inesperada: ' + sql);
    },
    release() { this.released = true; },
  };
  poolPedidos.connect = async () => client;
  try {
    await assert.rejects(
      () => setStatusPedido(90, 'em_producao'),
      (error) => error instanceof ErroPedido && error.status === 409
    );
    assert.ok(calls.some((c) => c.sql === 'BEGIN'));
    assert.ok(calls.some((c) => c.sql === 'ROLLBACK'));
    assert.equal(calls.some((c) => c.sql === 'COMMIT'), false);
    assert.equal(client.released, true);
  } finally {
    poolPedidos.connect = originalConnect;
  }
});

test('pedido inexistente não avança status e libera conexão após rollback', async () => {
  const calls = [];
  const originalConnect = poolPedidos.connect;
  const client = {
    released: false,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id, status, sessao_id FROM pedidos WHERE id = $1 FOR UPDATE')) return { rows: [] };
      throw new Error('consulta inesperada: ' + sql);
    },
    release() { this.released = true; },
  };
  poolPedidos.connect = async () => client;
  try {
    await assert.rejects(
      () => setStatusPedido(987654, 'em_producao'),
      (error) => error instanceof ErroPedido && error.status === 404
    );
    assert.ok(calls.some((c) => c.sql === 'ROLLBACK'));
    assert.equal(calls.some((c) => c.sql === 'COMMIT'), false);
    assert.equal(client.released, true);
  } finally {
    poolPedidos.connect = originalConnect;
  }
});


test('criação rejeita produto inexistente e produto indisponível sem confirmar pedido', async () => {
  for (const options of [{ produtoExiste: false }, { produtoDisponivel: false }]) {
    const fake = clientePedidoFake(options);
    await comPoolDePedidoFake(fake, () => assert.rejects(
      criarPedido(TOKEN_MESA_TESTE, { items: [{ productId: 8, qty: 1 }] }),
      (error) => error instanceof ErroPedido && error.status === 400 && /Nenhum item válido/.test(error.message)
    ));
    assert.ok(fake.calls.some((c) => c.sql === 'ROLLBACK'));
    assert.equal(fake.calls.some((c) => c.sql === 'COMMIT'), false);
    assert.equal(fake.client.released, true);
  }
});

test('criação rejeita quantidades zero e acima do limite sem inserir itens', async () => {
  for (const qty of [0, 100, -1]) {
    const fake = clientePedidoFake();
    await comPoolDePedidoFake(fake, () => assert.rejects(
      criarPedido(TOKEN_MESA_TESTE, { items: [{ productId: 8, qty }] }),
      (error) => error instanceof ErroPedido && error.status === 400 && /Quantidade inválida/.test(error.message)
    ));
    assert.ok(fake.calls.some((c) => c.sql === 'ROLLBACK'));
    assert.equal(fake.calls.some((c) => c.sql === 'COMMIT'), false);
    assert.equal(fake.calls.some((c) => c.sql.includes('INSERT INTO itens_pedido (')), false);
  }
});
