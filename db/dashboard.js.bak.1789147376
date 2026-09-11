// Resumo do dia para o admin (faturamento, ticket, top produtos).
const pool = require('./pool');

/**
 * @param {{ from?: string|null, to?: string|null }} [opts]
 * from/to em YYYY-MM-DD (opcional). Default: hoje (timezone do servidor / DB).
 */
async function resumoDia(opts = {}) {
  const from = opts.from || null;
  const to = opts.to || null;

  const rangeSql = from && to
    ? { start: from, end: to }
    : null;

  const sessoesQ = rangeSql
    ? await pool.query(
        `SELECT id, valor_total, desconto, taxa_servico, valor_cobrado, forma_pagamento, fechada_em, aberta_em
         FROM mesa_sessoes
         WHERE status = 'fechada'
           AND fechada_em::date >= $1::date
           AND fechada_em::date <= $2::date`,
        [rangeSql.start, rangeSql.end]
      )
    : await pool.query(
        `SELECT id, valor_total, desconto, taxa_servico, valor_cobrado, forma_pagamento, fechada_em, aberta_em
         FROM mesa_sessoes
         WHERE status = 'fechada'
           AND fechada_em::date = CURRENT_DATE`
      );

  const sessoes = sessoesQ.rows;
  const valorSessao = (r) =>
    r.valor_cobrado != null && r.valor_cobrado !== ''
      ? Number(r.valor_cobrado)
      : Number(r.valor_total || 0);
  const faturamento = sessoes.reduce((s, r) => s + valorSessao(r), 0);
  const contasFechadas = sessoes.length;
  const ticketMedio = contasFechadas ? faturamento / contasFechadas : 0;

  const porForma = {};
  for (const s of sessoes) {
    const k = s.forma_pagamento || 'outro';
    porForma[k] = (porForma[k] || 0) + valorSessao(s);
  }

  const pedidosQ = rangeSql
    ? await pool.query(
        `SELECT status, COUNT(*)::int AS n
         FROM pedidos
         WHERE criado_em::date >= $1::date AND criado_em::date <= $2::date
         GROUP BY status`,
        [rangeSql.start, rangeSql.end]
      )
    : await pool.query(
        `SELECT status, COUNT(*)::int AS n
         FROM pedidos
         WHERE criado_em::date = CURRENT_DATE
         GROUP BY status`
      );

  const pedidosPorStatus = {
    recebido: 0,
    em_producao: 0,
    concluido: 0,
    entregue: 0,
  };
  let pedidosTotal = 0;
  for (const r of pedidosQ.rows) {
    pedidosPorStatus[r.status] = r.n;
    pedidosTotal += r.n;
  }

  const { rows: mesaRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM mesas GROUP BY status`
  );
  const mesas = { livre: 0, ocupada: 0 };
  for (const r of mesaRows) mesas[r.status] = r.n;

  const { rows: abertas } = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(valor_total), 0)::float AS total
     FROM mesa_sessoes WHERE status = 'aberta'`
  );
  const emAberto = {
    sessoes: abertas[0].n,
    valorEntregue: Number(abertas[0].total || 0),
  };

  const topQ = rangeSql
    ? await pool.query(
        `SELECT pr.nome,
                SUM(ip.quantidade)::int AS qtd,
                SUM(
                  ip.quantidade * (
                    ip.preco_unitario + COALESCE(ad.total_ad, 0)
                  )
                )::float AS receita
         FROM itens_pedido ip
         JOIN produtos pr ON pr.id = ip.produto_id
         JOIN pedidos p ON p.id = ip.pedido_id
         LEFT JOIN (
           SELECT item_pedido_id, SUM(preco_unitario) AS total_ad
           FROM itens_pedido_adicionais
           GROUP BY item_pedido_id
         ) ad ON ad.item_pedido_id = ip.id
         WHERE p.criado_em::date >= $1::date AND p.criado_em::date <= $2::date
         GROUP BY pr.nome
         ORDER BY qtd DESC
         LIMIT 8`,
        [rangeSql.start, rangeSql.end]
      )
    : await pool.query(
        `SELECT pr.nome,
                SUM(ip.quantidade)::int AS qtd,
                SUM(
                  ip.quantidade * (
                    ip.preco_unitario + COALESCE(ad.total_ad, 0)
                  )
                )::float AS receita
         FROM itens_pedido ip
         JOIN produtos pr ON pr.id = ip.produto_id
         JOIN pedidos p ON p.id = ip.pedido_id
         LEFT JOIN (
           SELECT item_pedido_id, SUM(preco_unitario) AS total_ad
           FROM itens_pedido_adicionais
           GROUP BY item_pedido_id
         ) ad ON ad.item_pedido_id = ip.id
         WHERE p.criado_em::date = CURRENT_DATE
         GROUP BY pr.nome
         ORDER BY qtd DESC
         LIMIT 8`
      );

  const topProdutos = topQ.rows.map((r) => ({
    nome: r.nome,
    quantidade: r.qtd,
    receita: Number(Number(r.receita || 0).toFixed(2)),
  }));

  return {
    periodo: rangeSql
      ? { from: rangeSql.start, to: rangeSql.end }
      : { from: null, to: null, label: 'hoje' },
    faturamento: Number(faturamento.toFixed(2)),
    contasFechadas,
    ticketMedio: Number(ticketMedio.toFixed(2)),
    porFormaPagamento: porForma,
    pedidosTotal,
    pedidosPorStatus,
    mesas,
    emAberto,
    topProdutos,
  };
}


/** Top produtos do dia (público — só id, nome, qtd). */
async function topProdutosHoje(limit = 6) {
  const lim = Math.min(12, Math.max(1, Number(limit) || 6));
  const { rows } = await pool.query(
    `SELECT pr.id,
            pr.nome,
            pr.descricao,
            pr.preco,
            pr.foto_url AS "fotoUrl",
            SUM(ip.quantidade)::int AS quantidade
     FROM itens_pedido ip
     JOIN produtos pr ON pr.id = ip.produto_id
     JOIN pedidos p ON p.id = ip.pedido_id
     WHERE p.criado_em::date = CURRENT_DATE
       AND p.status <> 'cancelado'
     GROUP BY pr.id, pr.nome, pr.descricao, pr.preco, pr.foto_url
     ORDER BY quantidade DESC, pr.nome ASC
     LIMIT $1`,
    [lim]
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    descricao: r.descricao || '',
    preco: Number(r.preco || 0),
    fotoUrl: r.fotoUrl || null,
    quantidade: r.quantidade,
  }));
}

module.exports = { resumoDia, topProdutosHoje };

