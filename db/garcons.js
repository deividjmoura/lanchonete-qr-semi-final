const pool = require('./pool');
const { numeroInteiroPositivo } = require('./validacao');
const { sincronizarValorTotalSessao } = require('./conta');
const { comRetryConcorrencia } = require('./retry');
const { registrarEvento } = require('./auditoria');

class ErroGarcom extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function listGarcons() {
  const { rows } = await pool.query(
    `SELECT g.id, g.nome, g.token, g.ativo, g.criado_em,
            COUNT(p.id) FILTER (WHERE p.status = 'entregue')::int AS entregas
     FROM garcons g
     LEFT JOIN pedidos p ON p.garcom_id = g.id
     GROUP BY g.id
     ORDER BY g.ativo DESC, g.nome ASC`
  );
  return rows;
}

async function removerGarcom(id) {
  // Exclusão lógica: as métricas e a autoria financeira históricas devem permanecer.
  const gid = numeroInteiroPositivo(id, 'id do garçom');
  const { rows } = await pool.query(
    'UPDATE garcons SET ativo = FALSE WHERE id = $1 RETURNING id, nome',
    [gid]
  );
  if (!rows[0]) throw new ErroGarcom(404, 'Garçom não encontrado');
  return { ...rows[0], desativado: true };
}

async function criarGarcom(body) {
  const nome = String(body.nome || '').trim().slice(0, 80);
  if (!nome) throw new ErroGarcom(400, 'Informe o nome do garçom');
  const { rows } = await pool.query(
    `INSERT INTO garcons (nome) VALUES ($1)
     RETURNING id, nome, token, ativo, criado_em`,
    [nome]
  );
  return rows[0];
}

async function setGarcomAtivo(id, ativo) {
  const gid = numeroInteiroPositivo(id, 'id do garçom');
  const { rows } = await pool.query(
    `UPDATE garcons SET ativo = $2 WHERE id = $1
     RETURNING id, nome, token, ativo, criado_em`,
    [gid, !!ativo]
  );
  if (!rows[0]) throw new ErroGarcom(404, 'Garçom não encontrado');
  return rows[0];
}

async function getGarcomPorToken(token) {
  if (!token) return null;
  const t = String(token).trim();
  // token de garçom no banco é UUID; evita crash 22P02 com tokens demo
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) {
    return null;
  }
  const { rows } = await pool.query(
    `SELECT id, nome, token, ativo FROM garcons WHERE token = $1`,
    [t]
  );
  return rows[0] || null;
}

async function listPedidosRecentes({ limit = 50, ativos = false, from = null, to = null } = {}) {
  const rawLimit = Number(limit);
  const lim = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.trunc(rawLimit))) : 50;
  const where = [];
  const params = [];
  let idx = 1;

  if (ativos) {
    where.push(`p.status = ANY($${idx}::text[])`);
    params.push(['recebido', 'em_producao', 'concluido']);
    idx += 1;
  }
  if (from) {
    where.push(`p.criado_em >= $${idx}::date`);
    params.push(from);
    idx += 1;
  }
  if (to) {
    where.push(`p.criado_em < ($${idx}::date + interval '1 day')`);
    params.push(to);
    idx += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(lim);

  const { rows: pedidos } = await pool.query(
    `SELECT p.id, p.status, p.criado_em, p.cliente_nome, p.garcom_nome, p.claimed_at,
            p.observacao_geral,
            m.numero AS mesa
     FROM pedidos p
     JOIN mesa_sessoes s ON s.id = p.sessao_id
     JOIN mesas m ON m.id = s.mesa_id
     ${whereSql}
     ORDER BY p.criado_em DESC
     LIMIT $${idx}`,
    params
  );
  if (!pedidos.length) return [];

  const ids = pedidos.map((p) => p.id);
  const { rows: itensRows } = await pool.query(
    `SELECT ip.id, ip.pedido_id, pr.nome, ip.quantidade, ip.preco_unitario, ip.ponto_carne, ip.observacao, ip.status, ip.setor
     FROM itens_pedido ip
     JOIN produtos pr ON pr.id = ip.produto_id
     WHERE ip.pedido_id = ANY($1::int[])
     ORDER BY ip.id`,
    [ids]
  );

  const itemIds = itensRows.map((i) => i.id);
  let adicionaisRows = [];
  let remocoesRows = [];
  if (itemIds.length) {
    const [adRes, remRes] = await Promise.all([
      pool.query(
        `SELECT ipa.item_pedido_id, a.nome, ipa.preco_unitario
         FROM itens_pedido_adicionais ipa
         JOIN adicionais a ON a.id = ipa.adicional_id
         WHERE ipa.item_pedido_id = ANY($1::int[])`,
        [itemIds]
      ),
      pool.query(
        `SELECT item_pedido_id, ingrediente
         FROM itens_pedido_remocoes
         WHERE item_pedido_id = ANY($1::int[])`,
        [itemIds]
      ),
    ]);
    adicionaisRows = adRes.rows;
    remocoesRows = remRes.rows;
  }

  const addByItem = new Map();
  for (const a of adicionaisRows) {
    if (!addByItem.has(a.item_pedido_id)) addByItem.set(a.item_pedido_id, []);
    addByItem.get(a.item_pedido_id).push({ nome: a.nome, preco: Number(a.preco_unitario) });
  }
  const remByItem = new Map();
  for (const r of remocoesRows) {
    if (!remByItem.has(r.item_pedido_id)) remByItem.set(r.item_pedido_id, []);
    remByItem.get(r.item_pedido_id).push(r.ingrediente);
  }

  const itensByPedido = new Map();
  for (const item of itensRows) {
    const adicionais = addByItem.get(item.id) || [];
    const remocoes = remByItem.get(item.id) || [];
    const totalAdicionais = adicionais.reduce((s, a) => s + a.preco, 0);
    const linha = (Number(item.preco_unitario) + totalAdicionais) * item.quantidade;
    const packed = {
      id: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      ponto_carne: item.ponto_carne,
      observacao: item.observacao,
      status: item.status,
      setor: item.setor,
      adicionais,
      remocoes,
      totalLinha: Number(linha.toFixed(2)),
    };
    if (!itensByPedido.has(item.pedido_id)) itensByPedido.set(item.pedido_id, []);
    itensByPedido.get(item.pedido_id).push(packed);
  }

  return pedidos.map((p) => {
    const itens = itensByPedido.get(p.id) || [];
    const totalPedido = itens.reduce((s, i) => s + i.totalLinha, 0);
    return {
      ...p,
      itens,
      totalPedido: Number(totalPedido.toFixed(2)),
    };
  });
}

module.exports = {
  ErroGarcom,
  listGarcons,
  criarGarcom,
  setGarcomAtivo,
  removerGarcom,
  getGarcomPorToken,
  assumirEntregaComoGarcom: (...args) => require('./entregas').assumirEntregaComoGarcom(...args),
  retirarComoGarcom: (...args) => require('./entregas').retirarComoGarcom(...args),
  entregarComoGarcom: (...args) => require('./entregas').entregarComoGarcom(...args),
  historicoPedidoGarcom: (...args) => require('./entregas').historicoPedidoGarcom(...args),
  listPedidosRecentes,
};
