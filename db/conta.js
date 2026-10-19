// Conta da sessão: fonte única para "quanto a mesa deve".
//
// Historicamente existiam DUAS verdades:
//   - a tela do cliente somava os itens com status='entregue' (getSessao);
//   - o caixa confiava em mesa_sessoes.valor_total, um acumulador incremental
//     que só o fluxo do garçom incrementava.
// Qualquer outro caminho que marcasse item como entregue (ex.: override de
// admin em setStatusPedido) divergia as duas — reproduzido em teste: cliente
// devia R$ 12, caixa fechou por R$ 0; e uma regressão de status fazia o
// garçom somar o mesmo item duas vezes (R$ 18 cobrados por R$ 12 devidos).
//
// Regra a partir daqui: o total devido é SEMPRE recomputado dos itens
// entregues dentro da transação que vai cobrar/pagar, e valor_total é apenas
// um espelho sincronizado desse cálculo (auto-cura de drift histórico).

const SQL_TOTAL_ENTREGUE_UMA = `
  SELECT COALESCE(SUM(
    ip.quantidade * (
      ip.preco_unitario + COALESCE((
        SELECT SUM(ipa.preco_unitario)
        FROM itens_pedido_adicionais ipa
        WHERE ipa.item_pedido_id = ip.id
      ), 0)
    )
  ), 0)::float AS total
  FROM itens_pedido ip
  JOIN pedidos p ON p.id = ip.pedido_id
  WHERE p.sessao_id = $1
    AND COALESCE(ip.status, 'recebido') = 'entregue'`;

function arred2(n) {
  return Number(Number(n || 0).toFixed(2));
}

/** Total devido (itens entregues) de UMA sessão, recomputado do zero. */
async function totalEntregueDaSessao(client, sessaoId) {
  const { rows } = await client.query(SQL_TOTAL_ENTREGUE_UMA, [sessaoId]);
  return arred2(rows[0] ? rows[0].total : 0);
}

/** Mapa sessaoId -> total entregue, em UMA consulta (listagem do caixa). */
async function totaisEntreguesPorSessao(client, sessaoIds) {
  const mapa = new Map();
  if (!sessaoIds || !sessaoIds.length) return mapa;
  const { rows } = await client.query(
    `SELECT p.sessao_id,
            COALESCE(SUM(
              ip.quantidade * (
                ip.preco_unitario + COALESCE((
                  SELECT SUM(ipa.preco_unitario)
                  FROM itens_pedido_adicionais ipa
                  WHERE ipa.item_pedido_id = ip.id
                ), 0)
              )
            ), 0)::float AS total
     FROM itens_pedido ip
     JOIN pedidos p ON p.id = ip.pedido_id
     WHERE p.sessao_id = ANY($1::int[])
       AND COALESCE(ip.status, 'recebido') = 'entregue'
     GROUP BY p.sessao_id`,
    [sessaoIds]
  );
  for (const r of rows) mapa.set(r.sessao_id, arred2(r.total));
  return mapa;
}

/**
 * Recomputa o total e espelha em mesa_sessoes.valor_total (só sessão aberta).
 * Devolve o total autoritativo para a transação chamadora usar.
 */
async function sincronizarValorTotalSessao(client, sessaoId) {
  const total = await totalEntregueDaSessao(client, sessaoId);
  await client.query(
    `UPDATE mesa_sessoes SET valor_total = $2 WHERE id = $1 AND status = 'aberta'`,
    [sessaoId, total]
  );
  return total;
}

/** Soma dos pagamentos já lançados numa sessão (dentro da transação atual). */
async function totalPagoDaSessao(client, sessaoId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(valor), 0)::float AS pago
     FROM sessao_pagamentos WHERE sessao_id = $1`,
    [sessaoId]
  );
  return arred2(rows[0] ? rows[0].pago : 0);
}

/* ------------------------------------------------------------------------- *
 * Idempotência (migration 0018).
 * A chave é opcional no corpo JSON: clientes atuais não a enviam e seguem
 * funcionando; clientes que passarem a enviar (UUID por tentativa) ganham
 * proteção contra duplo toque/retry sem nenhuma mudança de rota.
 * ------------------------------------------------------------------------- */
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

/**
 * Normaliza uma chave candidata:
 *  - ausente/vazia  -> null (operação sem idempotência, comportamento atual)
 *  - válida         -> string normalizada
 *  - presente mas inválida -> false (quem chama converte para seu erro 400)
 */
function normalizarIdempotencyKey(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return false;
  const chave = raw.trim();
  if (chave === '') return null;
  return IDEMPOTENCY_KEY_RE.test(chave) ? chave : false;
}

/** Lê a primeira chave presente entre os nomes aceitos no corpo da requisição. */
function idempotencyKeyDoCorpo(body) {
  if (!body || typeof body !== 'object') return null;
  for (const nome of ['idempotencyKey', 'idempotency_key', 'clientRequestId', 'client_request_id']) {
    if (body[nome] !== undefined) return normalizarIdempotencyKey(body[nome]);
  }
  return null;
}

/**
 * Detector de coluna com cache por processo, para degradar com elegância se
 * o código novo entrar em produção antes da migration 0018 ser aplicada
 * (auto-migrate é best-effort no Railway): neste caso as operações seguem
 * SEM idempotência em vez de virar 500 em todo pedido/pagamento.
 * `reset` existe para testes.
 */
const detectores = new Map();
function colunaExiste(tabela, coluna) {
  const chave = `${tabela}.${coluna}`;
  if (!detectores.has(chave)) {
    let cache = null;
    const verificar = async (client) => {
      if (cache !== null) return cache;
      try {
        const { rows } = await client.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
           LIMIT 1`,
          [tabela, coluna]
        );
        cache = rows.length > 0;
        if (!cache) {
          console.warn(
            `[transacional] coluna ${chave} ausente — rode npm run db:migrate (0018). ` +
            'Operações seguem sem essa proteção até lá.'
          );
        }
      } catch (_) {
        cache = false;
      }
      return cache;
    };
    verificar.reset = () => { cache = null; };
    detectores.set(chave, verificar);
  }
  return detectores.get(chave);
}

module.exports = {
  totalEntregueDaSessao,
  totaisEntreguesPorSessao,
  sincronizarValorTotalSessao,
  totalPagoDaSessao,
  normalizarIdempotencyKey,
  idempotencyKeyDoCorpo,
  IDEMPOTENCY_KEY_RE,
  colunaExiste,
};
