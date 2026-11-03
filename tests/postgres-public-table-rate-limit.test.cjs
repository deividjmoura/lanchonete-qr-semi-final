// Integração HTTP real do rate limit das mutações públicas de mesa (PR #196).
//
// Cobre `POST /api/mesas/:token/checkin`            → 5  / 5 min
//       `POST /api/mesas/:token/pix-informado`      → 6  / 5 min
//       `DELETE /api/mesas/:token/pedidos/:id`      → 5  / 5 min
//       `PUT /api/mesas/:token/pedidos/:id`         → 10 / 5 min
//
// O servidor é o `server.js` de produção, sem nenhuma alteração, subido pelo
// harness `tests/helpers/public-table-server.cjs` em cópia isolada; o banco é
// o PostgreSQL descartável de teste; os dados são sintéticos e removidos no
// fim. Cada teste usa a própria mesa/token, então nenhum depende do estado
// deixado pelo anterior — dá para rodar um só com `--test-name-pattern`.
//
// Roda no CI (postgres:16) e localmente com embedded-postgres:
//
//   DATABASE_URL=postgres://.../qradmin_test NODE_ENV=test \
//     node --test tests/postgres-public-table-rate-limit.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { subirServidor, exigirAmbienteDeTeste } = require('./helpers/public-table-server.cjs');

exigirAmbienteDeTeste();
const pool = require('../db/pool');

/** Limites publicados pela PR #196. Se a implementação divergir, a suíte falha. */
const JANELA_MS = 5 * 60 * 1000;
const LIMITES = {
  checkin: { max: 5, erro: /Muitas tentativas de check-in/ },
  pix: { max: 6, erro: /Muitos avisos de PIX/ },
  cancelamento: { max: 5, erro: /Muitas tentativas de cancelamento/ },
  edicao: { max: 10, erro: /Muitas tentativas de edição/ },
};

/** Dois endereços do loopback = dois IPs observados distintos pelo servidor. */
const IP_A = '127.0.0.1';
const IP_B = '127.0.0.2';

const SUFIXO = randomUUID().slice(0, 8);
let proximoNumeroMesa = 150000 + Math.floor(Math.random() * 50000);

const estado = {
  categoria: null,
  produto: null,
  produtoSemEstoque: null,
  mesas: [], // ids criados — usados na limpeza
};

let servidor;

const chamar = (metodo, caminho, opcoes) => servidor.request(metodo, caminho, opcoes);

async function contar(sql, params) {
  const { rows } = await pool.query(sql, params);
  return Number(rows[0].contagem);
}

// ---------------------------------------------------------------------------
// Dados sintéticos
// ---------------------------------------------------------------------------

/** Cria uma mesa livre com token próprio (e um rótulo legível para depuração). */
async function criarMesa(rotulo) {
  const token = randomUUID();
  const { rows } = await pool.query(
    "INSERT INTO mesas (numero, token, status) VALUES ($1, $2, 'livre') RETURNING id, numero",
    [proximoNumeroMesa++, token]
  );
  estado.mesas.push(rows[0].id);
  return { id: rows[0].id, numero: rows[0].numero, token, rotulo };
}

/** Cria um pedido pela rota pública real e devolve o id. */
async function criarPedido(mesa, { ip = IP_A, qty = 1, produto } = {}) {
  const r = await chamar('POST', `/api/mesas/${mesa.token}/pedidos`, {
    corpo: { items: [{ productId: produto || estado.produto, qty }], clienteNome: `Cliente ${SUFIXO}` },
    ip,
  });
  assert.equal(r.status, 201, `pedido de preparação deveria ser criado: ${r.texto}`);
  return r.json.id;
}

/**
 * Deixa um pedido pronto para aviso de PIX: item e pedido em `entregue` e
 * sessão com consumo (o total da sessão sai dos itens entregues, db/conta.js).
 * A entrega é feita por SQL porque o caminho público de entrega exige garçom;
 * o alvo aqui é a rota de PIX.
 */
async function criarPedidoEntregue(mesa) {
  const pedidoId = await criarPedido(mesa);
  await pool.query("UPDATE itens_pedido SET status = 'entregue' WHERE pedido_id = $1", [pedidoId]);
  await pool.query("UPDATE pedidos SET status = 'entregue' WHERE id = $1", [pedidoId]);
  await pool.query(
    `UPDATE mesa_sessoes SET valor_total = 25.00
     WHERE id = (SELECT sessao_id FROM pedidos WHERE id = $1)`,
    [pedidoId]
  );
  return pedidoId;
}

/** Envia exatamente `quantidade` requisições e exige que todas sejam aceitas. */
async function enviarAceitas(enviar, { quantidade, rotulo }) {
  const aceitas = [];
  for (let i = 1; i <= quantidade; i += 1) {
    const r = await enviar(i);
    assert.equal(
      r.status,
      200,
      `${rotulo}: requisição ${i}/${quantidade} deveria ser aceita (recebido ${r.status}: ${r.texto})`
    );
    aceitas.push(r);
  }
  return aceitas;
}

/**
 * Envia `esperadas` requisições aceitas e confirma que a seguinte é bloqueada.
 * Se a rota nunca bloquear, o teste falha em vez de passar silenciosamente.
 */
async function enviarAteBloquear(enviar, { esperadas, rotulo }) {
  const aceitas = [];
  for (let i = 1; i <= esperadas; i += 1) {
    const r = await enviar(i);
    assert.equal(
      r.status,
      200,
      `${rotulo}: requisição ${i}/${esperadas} deveria ser aceita (recebido ${r.status}: ${r.texto})`
    );
    aceitas.push(r);
  }
  const bloqueada = await enviar(esperadas + 1);
  assert.equal(
    bloqueada.status,
    429,
    `${rotulo}: a requisição ${esperadas + 1} deveria ser 429 (recebido ${bloqueada.status}: ${bloqueada.texto})`
  );
  return { aceitas, bloqueada };
}

// ---------------------------------------------------------------------------
// Servidor e ciclo de vida
// ---------------------------------------------------------------------------

test.before(async () => {
  estado.categoria = (
    await pool.query('INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id', [
      'Rate limit mesa ' + SUFIXO,
    ])
  ).rows[0].id;
  // Sem controle de estoque: um cenário não consome o saldo do outro.
  estado.produto = (
    await pool.query(
      `INSERT INTO produtos (categoria_id, nome, preco, disponivel, setor, controla_estoque)
       VALUES ($1, $2, 25.00, TRUE, 'cozinha', FALSE) RETURNING id`,
      [estado.categoria, 'Produto rate limit ' + SUFIXO]
    )
  ).rows[0].id;
  estado.produtoSemEstoque = (
    await pool.query(
      `INSERT INTO produtos (categoria_id, nome, preco, disponivel, setor, controla_estoque, estoque)
       VALUES ($1, $2, 7.00, TRUE, 'cozinha', TRUE, 0) RETURNING id`,
      [estado.categoria, 'Produto esgotado rate limit ' + SUFIXO]
    )
  ).rows[0].id;

  servidor = await subirServidor();
});

test.after(async () => {
  if (servidor) await servidor.encerrar();
  try {
    if (estado.mesas.length) {
      const sessoes = 'SELECT id FROM mesa_sessoes WHERE mesa_id = ANY($1::int[])';
      await pool.query(`DELETE FROM pix_avisos WHERE sessao_id IN (${sessoes})`, [estado.mesas]);
      await pool.query(`DELETE FROM sessao_pagamentos WHERE sessao_id IN (${sessoes})`, [estado.mesas]);
      await pool.query(
        `DELETE FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id IN (${sessoes}))`,
        [estado.mesas]
      );
      await pool.query(`DELETE FROM pedidos WHERE sessao_id IN (${sessoes})`, [estado.mesas]);
      await pool.query('DELETE FROM mesa_sessoes WHERE mesa_id = ANY($1::int[])', [estado.mesas]);
      await pool.query('DELETE FROM mesas WHERE id = ANY($1::int[])', [estado.mesas]);
    }
    const produtos = [estado.produto, estado.produtoSemEstoque].filter(Boolean);
    if (produtos.length) await pool.query('DELETE FROM produtos WHERE id = ANY($1::int[])', [produtos]);
    if (estado.categoria) await pool.query('DELETE FROM categorias WHERE id = $1', [estado.categoria]);
  } catch (erro) {
    // Falha de limpeza não pode esconder o resultado dos testes.
    console.error('[postgres-public-table-rate-limit] falha na limpeza:', erro.message);
  }
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. Check-in — 5 requisições por janela de 5 minutos
// ---------------------------------------------------------------------------

test('check-in: as 5 requisições da janela são processadas normalmente', async () => {
  const mesa = await criarMesa('checkin-ok');
  const aceitas = await enviarAceitas(
    (i) =>
      chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
        corpo: { clienteNome: `Cliente ${i} ${SUFIXO}` },
        ip: IP_A,
      }),
    { quantidade: LIMITES.checkin.max, rotulo: 'check-in' }
  );

  assert.equal(aceitas.length, LIMITES.checkin.max, 'o limite de check-in é 5 por janela');
  for (const [indice, r] of aceitas.entries()) {
    assert.equal(r.json.ok, true);
    assert.equal(r.json.clienteNome, `Cliente ${indice + 1} ${SUFIXO}`);
    assert.equal(r.json.mesa, mesa.numero);
    assert.equal(r.headers['x-request-id'] !== undefined, true, 'resposta traz X-Request-Id');
  }

  // A mutação persistiu e reaproveitou a mesma comanda.
  const { rows } = await pool.query('SELECT cliente_nome FROM mesa_sessoes WHERE mesa_id = $1', [mesa.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cliente_nome, `Cliente ${LIMITES.checkin.max} ${SUFIXO}`);
});

test('check-in: a requisição acima do limite responde 429 e não executa a mutação', async () => {
  const mesa = await criarMesa('checkin-429');
  const { aceitas, bloqueada } = await enviarAteBloquear(
    (i) =>
      chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
        corpo: { clienteNome: `Cliente ${i} ${SUFIXO}` },
        ip: IP_A,
      }),
    { esperadas: LIMITES.checkin.max, rotulo: 'check-in' }
  );
  assert.equal(aceitas.length, LIMITES.checkin.max);

  assert.equal(bloqueada.status, 429, 'a 6ª requisição de check-in deve ser 429');
  assert.match(bloqueada.json.error, LIMITES.checkin.erro);
  assert.equal(typeof bloqueada.headers['x-request-id'], 'string', 'o 429 mantém o X-Request-Id');

  const nomeAceito = `Cliente ${LIMITES.checkin.max} ${SUFIXO}`;
  const { rows } = await pool.query('SELECT cliente_nome FROM mesa_sessoes WHERE mesa_id = $1', [mesa.id]);
  assert.equal(rows[0].cliente_nome, nomeAceito, 'a mutação bloqueada não pode gravar o nome enviado');

  // Nenhuma comanda extra foi aberta pela tentativa barrada.
  assert.equal(
    await contar('SELECT COUNT(*)::int AS contagem FROM mesa_sessoes WHERE mesa_id = $1', [mesa.id]),
    1,
    'o check-in bloqueado não pode abrir uma segunda comanda'
  );

  // E continua bloqueada: 429 não é uma resposta de uso único.
  const insistente = await chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
    corpo: { clienteNome: 'Insistente ' + SUFIXO },
    ip: IP_A,
  });
  assert.equal(insistente.status, 429, 'dentro da janela o bloqueio persiste');
});

test('check-in: o limite é isolado por token de mesa', async () => {
  const mesaA = await criarMesa('checkin-token-a');
  const mesaB = await criarMesa('checkin-token-b');
  await enviarAteBloquear(
    () =>
      chamar('POST', `/api/mesas/${mesaA.token}/checkin`, {
        corpo: { clienteNome: 'A ' + SUFIXO },
        ip: IP_A,
      }),
    { esperadas: LIMITES.checkin.max, rotulo: 'check-in token A' }
  );

  const outraMesa = await chamar('POST', `/api/mesas/${mesaB.token}/checkin`, {
    corpo: { clienteNome: 'Cliente mesa B ' + SUFIXO },
    ip: IP_A,
  });
  assert.equal(outraMesa.status, 200, 'estourar o token A não pode bloquear o token B');

  const aindaBloqueada = await chamar('POST', `/api/mesas/${mesaA.token}/checkin`, {
    corpo: { clienteNome: 'Ainda bloqueada ' + SUFIXO },
    ip: IP_A,
  });
  assert.equal(aindaBloqueada.status, 429, 'o token estourado continua bloqueado');
});

test('check-in: o limite é isolado por IP de origem', async () => {
  const mesa = await criarMesa('checkin-ip');
  await enviarAteBloquear(
    () =>
      chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
        corpo: { clienteNome: 'IP A ' + SUFIXO },
        ip: IP_A,
      }),
    { esperadas: LIMITES.checkin.max, rotulo: 'check-in IP A' }
  );

  const outroIp = await chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
    corpo: { clienteNome: 'Cliente outro IP ' + SUFIXO },
    ip: IP_B,
  });
  assert.equal(outroIp.status, 200, 'o mesmo token vindo de outro IP tem orçamento próprio');

  const mesmoIp = await chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
    corpo: { clienteNome: 'Mesmo IP ' + SUFIXO },
    ip: IP_A,
  });
  assert.equal(mesmoIp.status, 429, 'o IP estourado continua bloqueado');
});

test('check-in: o limite é isolado por operação (não trava a mesa)', async () => {
  const mesa = await criarMesa('checkin-operacao');
  await enviarAteBloquear(
    () =>
      chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
        corpo: { clienteNome: 'Operação ' + SUFIXO },
        ip: IP_A,
      }),
    { esperadas: LIMITES.checkin.max, rotulo: 'check-in operação' }
  );

  const pedido = await chamar('POST', `/api/mesas/${mesa.token}/pedidos`, {
    corpo: { items: [{ productId: estado.produto, qty: 1 }] },
    ip: IP_A,
  });
  assert.equal(pedido.status, 201, 'criar pedido é outra operação e segue disponível');

  const sessao = await chamar('GET', `/api/mesas/${mesa.token}/sessao`, { ip: IP_A });
  assert.equal(sessao.status, 200, 'a leitura da comanda não é limitada nem bloqueada');

  const edicao = await chamar('PUT', `/api/mesas/${mesa.token}/pedidos/${pedido.json.id}`, {
    corpo: { items: [{ productId: estado.produto, qty: 2 }] },
    ip: IP_A,
  });
  assert.equal(edicao.status, 200, 'a edição tem o próprio orçamento mesmo com o check-in estourado');
});

// ---------------------------------------------------------------------------
// 2. Aviso de PIX — 6 requisições por janela de 5 minutos
// ---------------------------------------------------------------------------

test('PIX: os 6 avisos da janela são registrados normalmente', async () => {
  const mesa = await criarMesa('pix-ok');
  const pedidoId = await criarPedidoEntregue(mesa);
  const aceitas = await enviarAceitas(
    (i) =>
      chamar('POST', `/api/mesas/${mesa.token}/pix-informado`, {
        corpo: { pedidoId, valor: i },
        ip: IP_A,
      }),
    { quantidade: LIMITES.pix.max, rotulo: 'aviso de PIX' }
  );

  assert.equal(aceitas.length, LIMITES.pix.max, 'o limite de PIX é 6 por janela');
  for (const r of aceitas) {
    assert.equal(r.json.ok, true);
    assert.ok(Number(r.json.avisoId) > 0, 'cada aviso aceito devolve um id de aviso');
  }
  assert.equal(
    await contar("SELECT COUNT(*)::int AS contagem FROM pix_avisos WHERE sessao_id = (SELECT id FROM mesa_sessoes WHERE mesa_id = $1) AND status = 'pendente'", [mesa.id]),
    LIMITES.pix.max,
    'os 6 avisos aceitos existem no banco'
  );
});

test('PIX: o aviso acima do limite responde 429 e não cria aviso nem toca a comanda', async () => {
  const mesa = await criarMesa('pix-429');
  const pedidoId = await criarPedidoEntregue(mesa);
  const { aceitas, bloqueada } = await enviarAteBloquear(
    (i) =>
      chamar('POST', `/api/mesas/${mesa.token}/pix-informado`, {
        corpo: { pedidoId, valor: i },
        ip: IP_A,
      }),
    { esperadas: LIMITES.pix.max, rotulo: 'aviso de PIX' }
  );
  assert.equal(aceitas.length, LIMITES.pix.max);
  assert.equal(bloqueada.status, 429, 'o 7º aviso de PIX deve ser 429');
  assert.match(bloqueada.json.error, LIMITES.pix.erro);

  const sessaoId = (await pool.query('SELECT id FROM mesa_sessoes WHERE mesa_id = $1', [mesa.id])).rows[0].id;
  const antes = (
    await pool.query('SELECT status, valor_total, pix_informado_em FROM mesa_sessoes WHERE id = $1', [sessaoId])
  ).rows[0];
  const avisosAntes = await contar('SELECT COUNT(*)::int AS contagem FROM pix_avisos WHERE sessao_id = $1', [sessaoId]);

  const nova = await chamar('POST', `/api/mesas/${mesa.token}/pix-informado`, {
    corpo: { pedidoId, valor: 99 },
    ip: IP_A,
  });
  assert.equal(nova.status, 429);

  const depois = (
    await pool.query('SELECT status, valor_total, pix_informado_em FROM mesa_sessoes WHERE id = $1', [sessaoId])
  ).rows[0];
  assert.equal(depois.status, antes.status);
  assert.equal(Number(depois.valor_total), Number(antes.valor_total));
  assert.deepEqual(depois.pix_informado_em, antes.pix_informado_em, 'a comanda não foi tocada');
  assert.equal(
    await contar('SELECT COUNT(*)::int AS contagem FROM pix_avisos WHERE sessao_id = $1', [sessaoId]),
    avisosAntes,
    'a requisição bloqueada não pode inserir aviso de PIX'
  );

  // O pedido continua intacto.
  const { rows } = await pool.query('SELECT status FROM pedidos WHERE id = $1', [pedidoId]);
  assert.equal(rows[0].status, 'entregue');
});

test('PIX: o limite é isolado por token e por IP', async () => {
  const mesaA = await criarMesa('pix-token-a');
  const mesaB = await criarMesa('pix-token-b');
  const pedidoA = await criarPedidoEntregue(mesaA);
  const pedidoB = await criarPedidoEntregue(mesaB);
  await enviarAteBloquear(
    (i) =>
      chamar('POST', `/api/mesas/${mesaA.token}/pix-informado`, { corpo: { pedidoId: pedidoA, valor: i }, ip: IP_A }),
    { esperadas: LIMITES.pix.max, rotulo: 'aviso de PIX token A' }
  );

  const outroToken = await chamar('POST', `/api/mesas/${mesaB.token}/pix-informado`, {
    corpo: { pedidoId: pedidoB, valor: 5 },
    ip: IP_A,
  });
  assert.equal(outroToken.status, 200, 'outro token não herda o bloqueio de PIX');

  const outroIp = await chamar('POST', `/api/mesas/${mesaA.token}/pix-informado`, {
    corpo: { pedidoId: pedidoA, valor: 5 },
    ip: IP_B,
  });
  assert.equal(outroIp.status, 200, 'outro IP não herda o bloqueio de PIX');

  const mesmoPar = await chamar('POST', `/api/mesas/${mesaA.token}/pix-informado`, {
    corpo: { pedidoId: pedidoA, valor: 6 },
    ip: IP_A,
  });
  assert.equal(mesmoPar.status, 429, 'token+IP estourado continua bloqueado');
});

test('PIX: o bloqueio não vaza para as outras mutações do mesmo token', async () => {
  const mesa = await criarMesa('pix-operacao');
  const pedidoEntregue = await criarPedidoEntregue(mesa);
  await enviarAteBloquear(
    (i) =>
      chamar('POST', `/api/mesas/${mesa.token}/pix-informado`, {
        corpo: { pedidoId: pedidoEntregue, valor: i },
        ip: IP_A,
      }),
    { esperadas: LIMITES.pix.max, rotulo: 'aviso de PIX operação' }
  );

  // Pedido novo + edição: operações distintas, orçamentos próprios.
  const novo = await criarPedido(mesa);
  const edicao = await chamar('PUT', `/api/mesas/${mesa.token}/pedidos/${novo}`, {
    corpo: { items: [{ productId: estado.produto, qty: 3 }] },
    ip: IP_A,
  });
  assert.equal(edicao.status, 200, 'PIX estourado não pode bloquear a edição');

  const checkin = await chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
    corpo: { clienteNome: 'Check-in após PIX ' + SUFIXO },
    ip: IP_A,
  });
  assert.equal(checkin.status, 200, 'PIX estourado não pode bloquear o check-in');
});

// ---------------------------------------------------------------------------
// 3. Cancelamento de pedido — 5 requisições por janela de 5 minutos
// ---------------------------------------------------------------------------

test('cancelamento: os 5 cancelamentos da janela são processados normalmente', async () => {
  const mesa = await criarMesa('cancelar-ok');
  const pedidos = [];
  for (let i = 0; i < LIMITES.cancelamento.max; i += 1) pedidos.push(await criarPedido(mesa));

  const aceitas = await enviarAceitas(
    (i) => chamar('DELETE', `/api/mesas/${mesa.token}/pedidos/${pedidos[i - 1]}`, { ip: IP_A }),
    { quantidade: LIMITES.cancelamento.max, rotulo: 'cancelamento' }
  );

  assert.equal(aceitas.length, LIMITES.cancelamento.max, 'o limite de cancelamento é 5 por janela');
  for (const r of aceitas) assert.equal(r.json.cancelado, true);

  const { rows } = await pool.query('SELECT id, status FROM pedidos WHERE id = ANY($1::int[])', [pedidos]);
  assert.equal(rows.length, pedidos.length);
  for (const linha of rows) assert.equal(linha.status, 'cancelado', `pedido ${linha.id} deveria estar cancelado`);
});

test('cancelamento: o pedido acima do limite responde 429 e continua ativo no banco', async () => {
  const mesa = await criarMesa('cancelar-429');
  // Consome o orçamento de cancelamento com pedidos descartáveis.
  for (let i = 0; i < LIMITES.cancelamento.max; i += 1) {
    const descartavel = await criarPedido(mesa);
    const r = await chamar('DELETE', `/api/mesas/${mesa.token}/pedidos/${descartavel}`, { ip: IP_A });
    assert.equal(r.status, 200, `cancelamento ${i + 1} de preparação deveria ser aceito`);
  }

  const protegido = await criarPedido(mesa);
  const bloqueada = await chamar('DELETE', `/api/mesas/${mesa.token}/pedidos/${protegido}`, { ip: IP_A });
  assert.equal(bloqueada.status, 429, 'o 6º cancelamento deve ser 429');
  assert.match(bloqueada.json.error, LIMITES.cancelamento.erro);

  const { rows } = await pool.query('SELECT status FROM pedidos WHERE id = $1', [protegido]);
  assert.equal(rows[0].status, 'recebido', 'o pedido barrado pelo limite não pode ser cancelado');

  const itensAtivos = await contar(
    "SELECT COUNT(*)::int AS contagem FROM itens_pedido WHERE pedido_id = $1 AND status <> 'cancelado'",
    [protegido]
  );
  const itensTotal = await contar('SELECT COUNT(*)::int AS contagem FROM itens_pedido WHERE pedido_id = $1', [
    protegido,
  ]);
  assert.ok(itensTotal > 0, 'o pedido tem itens');
  assert.equal(itensAtivos, itensTotal, 'nenhum item do pedido barrado foi cancelado');

  assert.equal(
    await contar(
      `SELECT COUNT(*)::int AS contagem FROM itens_pedido_historico
       WHERE pedido_id = $1 AND status = 'cancelado'`,
      [protegido]
    ),
    0,
    'a mutação bloqueada não deixa histórico de cancelamento'
  );
});

test('cancelamento: o limite é isolado por token e por IP', async () => {
  const mesaA = await criarMesa('cancelar-token-a');
  const mesaB = await criarMesa('cancelar-token-b');
  for (let i = 0; i < LIMITES.cancelamento.max; i += 1) {
    const descartavel = await criarPedido(mesaA);
    const r = await chamar('DELETE', `/api/mesas/${mesaA.token}/pedidos/${descartavel}`, { ip: IP_A });
    assert.equal(r.status, 200, `cancelamento ${i + 1} de preparação deveria ser aceito`);
  }

  const pedidoB = await criarPedido(mesaB);
  const outroToken = await chamar('DELETE', `/api/mesas/${mesaB.token}/pedidos/${pedidoB}`, { ip: IP_A });
  assert.equal(outroToken.status, 200, 'outro token não herda o limite de cancelamento');

  const pedidoA2 = await criarPedido(mesaA);
  const outroIp = await chamar('DELETE', `/api/mesas/${mesaA.token}/pedidos/${pedidoA2}`, { ip: IP_B });
  assert.equal(outroIp.status, 200, 'outro IP não herda o limite de cancelamento');

  const pedidoA3 = await criarPedido(mesaA);
  const mesmoPar = await chamar('DELETE', `/api/mesas/${mesaA.token}/pedidos/${pedidoA3}`, { ip: IP_A });
  assert.equal(mesmoPar.status, 429, 'token+IP estourado continua bloqueado');
});

test('cancelamento: o bloqueio não vaza para a edição do mesmo token', async () => {
  const mesa = await criarMesa('cancelar-operacao');
  for (let i = 0; i < LIMITES.cancelamento.max; i += 1) {
    const descartavel = await criarPedido(mesa);
    const r = await chamar('DELETE', `/api/mesas/${mesa.token}/pedidos/${descartavel}`, { ip: IP_A });
    assert.equal(r.status, 200, `cancelamento ${i + 1} de preparação deveria ser aceito`);
  }

  const novo = await criarPedido(mesa);
  const edicao = await chamar('PUT', `/api/mesas/${mesa.token}/pedidos/${novo}`, {
    corpo: { items: [{ productId: estado.produto, qty: 2 }] },
    ip: IP_A,
  });
  assert.equal(edicao.status, 200, 'cancelamento estourado não pode bloquear a edição');
});

// ---------------------------------------------------------------------------
// 4. Edição de pedido — 10 requisições por janela de 5 minutos
// ---------------------------------------------------------------------------

test('edição: as 10 edições da janela são processadas normalmente', async () => {
  const mesa = await criarMesa('editar-ok');
  const pedidoId = await criarPedido(mesa);
  const aceitas = await enviarAceitas(
    (i) =>
      chamar('PUT', `/api/mesas/${mesa.token}/pedidos/${pedidoId}`, {
        corpo: { items: [{ productId: estado.produto, qty: i }] },
        ip: IP_A,
      }),
    { quantidade: LIMITES.edicao.max, rotulo: 'edição' }
  );

  assert.equal(aceitas.length, LIMITES.edicao.max, 'o limite de edição é 10 por janela');
  for (const r of aceitas) assert.equal(r.json.editado, true);

  const { rows } = await pool.query('SELECT quantidade FROM itens_pedido WHERE pedido_id = $1', [pedidoId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantidade, LIMITES.edicao.max, 'a última edição aceita é a que vale');
});

test('edição: a requisição acima do limite responde 429 e não altera o pedido', async () => {
  const mesa = await criarMesa('editar-429');
  const pedidoId = await criarPedido(mesa);
  const { aceitas, bloqueada } = await enviarAteBloquear(
    (i) =>
      chamar('PUT', `/api/mesas/${mesa.token}/pedidos/${pedidoId}`, {
        corpo: { items: [{ productId: estado.produto, qty: i }] },
        ip: IP_A,
      }),
    { esperadas: LIMITES.edicao.max, rotulo: 'edição' }
  );
  assert.equal(aceitas.length, LIMITES.edicao.max);
  assert.equal(bloqueada.status, 429, 'a 11ª edição deve ser 429');
  assert.match(bloqueada.json.error, LIMITES.edicao.erro);

  const antes = (
    await pool.query('SELECT quantidade, preco_unitario FROM itens_pedido WHERE pedido_id = $1 ORDER BY id', [pedidoId])
  ).rows;

  const nova = await chamar('PUT', `/api/mesas/${mesa.token}/pedidos/${pedidoId}`, {
    corpo: { items: [{ productId: estado.produto, qty: 99 }] },
    ip: IP_A,
  });
  assert.equal(nova.status, 429);

  const depois = (
    await pool.query('SELECT quantidade, preco_unitario FROM itens_pedido WHERE pedido_id = $1 ORDER BY id', [pedidoId])
  ).rows;
  assert.deepEqual(
    depois.map((r) => [r.quantidade, Number(r.preco_unitario)]),
    antes.map((r) => [r.quantidade, Number(r.preco_unitario)]),
    'a edição bloqueada não pode alterar os itens'
  );
  assert.equal(
    await contar('SELECT COUNT(*)::int AS contagem FROM pedidos WHERE id = $1', [pedidoId]),
    1,
    'o pedido continua existindo uma única vez'
  );
});

test('edição: o limite é isolado por token e por IP', async () => {
  const mesaA = await criarMesa('editar-token-a');
  const mesaB = await criarMesa('editar-token-b');
  const pedidoA = await criarPedido(mesaA);
  const pedidoB = await criarPedido(mesaB);
  await enviarAteBloquear(
    (i) =>
      chamar('PUT', `/api/mesas/${mesaA.token}/pedidos/${pedidoA}`, {
        corpo: { items: [{ productId: estado.produto, qty: i }] },
        ip: IP_A,
      }),
    { esperadas: LIMITES.edicao.max, rotulo: 'edição token A' }
  );

  const outroToken = await chamar('PUT', `/api/mesas/${mesaB.token}/pedidos/${pedidoB}`, {
    corpo: { items: [{ productId: estado.produto, qty: 2 }] },
    ip: IP_A,
  });
  assert.equal(outroToken.status, 200, 'outro token não herda o limite de edição');

  const outroIp = await chamar('PUT', `/api/mesas/${mesaA.token}/pedidos/${pedidoA}`, {
    corpo: { items: [{ productId: estado.produto, qty: 2 }] },
    ip: IP_B,
  });
  assert.equal(outroIp.status, 200, 'outro IP não herda o limite de edição');

  const mesmoPar = await chamar('PUT', `/api/mesas/${mesaA.token}/pedidos/${pedidoA}`, {
    corpo: { items: [{ productId: estado.produto, qty: 2 }] },
    ip: IP_A,
  });
  assert.equal(mesmoPar.status, 429, 'token+IP estourado continua bloqueado');
});

test('edição: as demais validações da rota continuam valendo dentro do orçamento', async () => {
  const mesa = await criarMesa('editar-validacoes');
  const outraMesa = await criarMesa('editar-validacoes-outra');
  const pedidoId = await criarPedido(mesa);

  const vazio = await chamar('PUT', `/api/mesas/${mesa.token}/pedidos/${pedidoId}`, {
    corpo: { items: [] },
    ip: IP_A,
  });
  assert.equal(vazio.status, 400, 'payload sem itens continua 400');

  const semEstoque = await chamar('PUT', `/api/mesas/${mesa.token}/pedidos/${pedidoId}`, {
    corpo: { items: [{ productId: estado.produtoSemEstoque, qty: 1 }] },
    ip: IP_A,
  });
  assert.equal(semEstoque.status, 400, 'estoque insuficiente continua 400');

  const mesaErrada = await chamar('PUT', `/api/mesas/${outraMesa.token}/pedidos/${pedidoId}`, {
    corpo: { items: [{ productId: estado.produto, qty: 1 }] },
    ip: IP_A,
  });
  assert.equal(mesaErrada.status, 404, 'pedido de outra mesa continua 404');

  const pedidoInexistente = await chamar('PUT', `/api/mesas/${mesa.token}/pedidos/99999999`, {
    corpo: { items: [{ productId: estado.produto, qty: 1 }] },
    ip: IP_A,
  });
  assert.equal(pedidoInexistente.status, 404, 'pedido inexistente continua 404');
});

// ---------------------------------------------------------------------------
// 5. Janela de 5 minutos
// ---------------------------------------------------------------------------

test('a janela não expira antes do tempo: 1 segundo a menos no relógio ainda bloqueia', async () => {
  const mesa = await criarMesa('janela-antes');
  await enviarAteBloquear(
    () =>
      chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
        corpo: { clienteNome: 'Janela ' + SUFIXO },
        ip: IP_A,
      }),
    { esperadas: LIMITES.checkin.max, rotulo: 'check-in janela' }
  );

  // Faltando 1 s para o fim da janela deslizante, o bloqueio continua.
  await servidor.avancarRelogio(JANELA_MS - 1000);
  const aindaDentro = await chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
    corpo: { clienteNome: 'Ainda dentro ' + SUFIXO },
    ip: IP_A,
  });
  assert.equal(aindaDentro.status, 429, 'a janela deslizante ainda não expirou');
});

test('passado o fim da janela as requisições voltam a ser processadas', async () => {
  const mesa = await criarMesa('janela-depois');
  const { bloqueada } = await enviarAteBloquear(
    (i) =>
      chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
        corpo: { clienteNome: `Cliente ${i} ${SUFIXO}` },
        ip: IP_A,
      }),
    { esperadas: LIMITES.checkin.max, rotulo: 'check-in janela' }
  );
  assert.equal(bloqueada.status, 429, 'pré-condição: limite estourado');

  // Avança só o relógio consultado pelo rate limit no processo do servidor.
  await servidor.avancarRelogio(JANELA_MS + 1000);

  const depois = await chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
    corpo: { clienteNome: 'Depois da janela ' + SUFIXO },
    ip: IP_A,
  });
  assert.equal(depois.status, 200, 'passada a janela, o check-in volta a ser aceito');
  assert.equal(depois.json.clienteNome, 'Depois da janela ' + SUFIXO);

  // O orçamento novo tem exatamente o mesmo tamanho do original.
  for (let i = 2; i <= LIMITES.checkin.max; i += 1) {
    const r = await chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
      corpo: { clienteNome: `Janela nova ${i} ${SUFIXO}` },
      ip: IP_A,
    });
    assert.equal(r.status, 200, `check-in ${i} da nova janela deveria ser aceito`);
  }
  const estourouDeNovo = await chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
    corpo: { clienteNome: 'Estouro novo ' + SUFIXO },
    ip: IP_A,
  });
  assert.equal(estourouDeNovo.status, 429, 'a janela renovada aplica o mesmo limite');

  const { rows } = await pool.query('SELECT cliente_nome FROM mesa_sessoes WHERE mesa_id = $1', [mesa.id]);
  assert.equal(rows[0].cliente_nome, `Janela nova ${LIMITES.checkin.max} ${SUFIXO}`);
});

test('a expiração é por operação: cada rota recupera o próprio orçamento', async () => {
  const mesa = await criarMesa('janela-operacao');
  const pedidoId = await criarPedidoEntregue(mesa);
  await enviarAteBloquear(
    (i) =>
      chamar('POST', `/api/mesas/${mesa.token}/pix-informado`, {
        corpo: { pedidoId, valor: i },
        ip: IP_A,
      }),
    { esperadas: LIMITES.pix.max, rotulo: 'aviso de PIX janela' }
  );

  // A edição do mesmo token/IP tem orçamento próprio e não é atingida.
  const novo = await criarPedido(mesa);
  const edicao = await chamar('PUT', `/api/mesas/${mesa.token}/pedidos/${novo}`, {
    corpo: { items: [{ productId: estado.produto, qty: 1 }] },
    ip: IP_A,
  });
  assert.equal(edicao.status, 200, 'o bloqueio de uma operação não marca as outras');

  await servidor.avancarRelogio(JANELA_MS + 1000);
  const depois = await chamar('POST', `/api/mesas/${mesa.token}/pix-informado`, {
    corpo: { pedidoId, valor: 2 },
    ip: IP_A,
  });
  assert.equal(depois.status, 200, 'passada a janela, o aviso de PIX volta a ser aceito');
});

// ---------------------------------------------------------------------------
// 6. Sem efeitos colaterais em pedidos, mesas e pagamentos
// ---------------------------------------------------------------------------

test('o limite de criação de pedidos (pré-existente) segue funcionando e não vaza para as mutações', async () => {
  const mesa = await criarMesa('pedido-limite');
  const criados = [];
  for (let i = 1; i <= 10; i += 1) {
    const r = await chamar('POST', `/api/mesas/${mesa.token}/pedidos`, {
      corpo: { items: [{ productId: estado.produto, qty: 1 }] },
      ip: IP_A,
    });
    assert.equal(r.status, 201, `pedido ${i} deveria ser criado (limite pré-existente de 10)`);
    criados.push(r.json.id);
  }

  const bloqueado = await chamar('POST', `/api/mesas/${mesa.token}/pedidos`, {
    corpo: { items: [{ productId: estado.produto, qty: 1 }] },
    ip: IP_A,
  });
  assert.equal(bloqueado.status, 429, 'o limite de criação de pedidos segue aplicado');
  assert.match(bloqueado.json.error, /Muitos pedidos em pouco tempo/);

  assert.equal(
    await contar('SELECT COUNT(*)::int AS contagem FROM pedidos WHERE id = ANY($1::int[])', [criados]),
    10,
    'a tentativa bloqueada não criou pedido'
  );

  // As mutações de mesa do mesmo par token+IP têm orçamentos independentes.
  const checkin = await chamar('POST', `/api/mesas/${mesa.token}/checkin`, {
    corpo: { clienteNome: 'Check-in após limite de pedidos ' + SUFIXO },
    ip: IP_A,
  });
  assert.equal(checkin.status, 200, 'o limite de pedidos não pode bloquear o check-in');

  const cancelamento = await chamar('DELETE', `/api/mesas/${mesa.token}/pedidos/${criados[0]}`, { ip: IP_A });
  assert.equal(cancelamento.status, 200, 'o limite de pedidos não pode bloquear o cancelamento');
});

test('bloqueios não deixam comanda duplicada nem pedido órfão', async () => {
  const duplicadas = await pool.query(
    `SELECT mesa_id, COUNT(*)::int AS abertas FROM mesa_sessoes
     WHERE mesa_id = ANY($1::int[]) AND status = 'aberta'
     GROUP BY mesa_id HAVING COUNT(*) > 1`,
    [estado.mesas]
  );
  assert.equal(duplicadas.rowCount, 0, 'nenhuma mesa da suíte pode terminar com duas comandas abertas');

  const orfaos = await contar(
    `SELECT COUNT(*)::int AS contagem FROM pedidos p
     LEFT JOIN mesa_sessoes s ON s.id = p.sessao_id
     WHERE p.sessao_id IN (SELECT id FROM mesa_sessoes WHERE mesa_id = ANY($1::int[]))
       AND s.id IS NULL`,
    [estado.mesas]
  );
  assert.equal(orfaos, 0, 'nenhum pedido órfão criado pela suíte');

  // Nenhum aviso de PIX ficou apontando para pedido de outra mesa.
  const avisosCruzados = await contar(
    `SELECT COUNT(*)::int AS contagem
     FROM pix_avisos a
     JOIN mesa_sessoes s ON s.id = a.sessao_id
     JOIN pedidos p ON p.id = a.pedido_id
     WHERE s.id IN (SELECT id FROM mesa_sessoes WHERE mesa_id = ANY($1::int[]))
       AND p.sessao_id <> a.sessao_id`,
    [estado.mesas]
  );
  assert.equal(avisosCruzados, 0, 'avisos de PIX pertencem à mesma comanda do pedido');
});
