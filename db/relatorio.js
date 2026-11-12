// Relatório de vendas por período (dados para tela, CSV e PDF / impressão).
const pool = require('./pool');
const { resumoDia } = require('./dashboard');

const MAX_PAGE_LIMIT = 5000;
const DEFAULT_PAGE_LIMIT = 500;

/** Só permite nomes de fuso seguros (evita injection em literal SQL). */
function tzSeguro() {
  const raw = String(process.env.APP_TIMEZONE || 'America/Sao_Paulo').trim();
  if (/^[A-Za-z0-9_+\-\/]+$/.test(raw) && raw.length <= 64) return raw;
  return 'America/Sao_Paulo';
}

/** Valida formato YYYY-MM-DD e existência real no calendário (ex.: rejeita 2026-02-31). */
function validarDataCalendario(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
  );
}

/** Normaliza paginação opcional; sem page/limit devolve todas as contas do período. */
function normalizarPaginacao({ page, limit } = {}) {
  const temPage = page !== undefined && page !== null && page !== '';
  const temLimit = limit !== undefined && limit !== null && limit !== '';
  if (!temPage && !temLimit) {
    return { paginado: false, page: 1, limit: null, offset: 0 };
  }
  const p = temPage ? Number(page) : 1;
  const l = temLimit ? Number(limit) : DEFAULT_PAGE_LIMIT;
  if (!Number.isInteger(p) || p < 1 || !Number.isInteger(l) || l < 1 || l > MAX_PAGE_LIMIT) {
    const err = new Error(`Paginação inválida. Use page >= 1 e limit entre 1 e ${MAX_PAGE_LIMIT}`);
    err.status = 400;
    throw err;
  }
  return { paginado: true, page: p, limit: l, offset: (p - 1) * l };
}

/**
 * Intervalo [from 00:00, to+1 00:00) no fuso do pub, como timestamptz.
 * `to` é inclusivo até 23:59:59.999999 do dia civil em `tz`.
 */
function sqlRangeParams(from, to, tz) {
  return {
    textStart: `($1::timestamp AT TIME ZONE '${tz}')`,
    textEnd: `((($2::date + 1)::timestamp) AT TIME ZONE '${tz}')`,
    values: [from, to],
  };
}

const SQL_VALOR_BASE = `COALESCE(s.valor_total, COALESCE(s.valor_cobrado, 0) + COALESCE(s.desconto, 0) - COALESCE(s.taxa_servico, 0))`;
const SQL_VALOR_COBRADO = `COALESCE(s.valor_cobrado, s.valor_total, 0)`;

/**
 * @param {{ from: string, to: string, page?: number|string|null, limit?: number|string|null }} opts
 */
async function relatorioVendas({ from, to, page, limit } = {}) {
  if (!from || !to) {
    const err = new Error('Informe from e to (YYYY-MM-DD)');
    err.status = 400;
    throw err;
  }
  if (!validarDataCalendario(from) || !validarDataCalendario(to)) {
    const err = new Error('Datas inválidas. Use YYYY-MM-DD');
    err.status = 400;
    throw err;
  }
  if (from > to) {
    const err = new Error('"De" não pode ser depois de "Até"');
    err.status = 400;
    throw err;
  }

  const pag = normalizarPaginacao({ page, limit });
  const tz = tzSeguro();
  const range = sqlRangeParams(from, to, tz);

  let resumo;
  try {
    resumo = await resumoDia({ from, to });
  } catch (e) {
    console.error('[relatorio] resumoDia falhou:', e.message || e);
    resumo = {
      faturamento: 0,
      vendasBrutas: 0,
      servicoTotal: 0,
      descontosTotal: 0,
      totalCobrado: 0,
      contasFechadas: 0,
      ticketMedio: 0,
      porFormaPagamento: {},
      pedidosTotal: 0,
      pedidosPorStatus: {},
      topProdutos: [],
    };
  }

  const round2 = (n) => Number(Number(n || 0).toFixed(2));
  const mapPorDia = (rows) => rows.map((r) => ({
    dia: r.dia instanceof Date ? r.dia.toISOString().slice(0, 10) : String(r.dia).slice(0, 10),
    contas: Number(r.contas || 0),
    faturamento: round2(r.faturamento),
    // #154/#299: breakdown diário reconciliável com resumo, contas e porGarcom.
    vendasBrutas: round2(r.vendas),
    servicoTotal: round2(r.servico),
    descontosTotal: round2(r.descontos),
    totalCobrado: round2(r.faturamento),
  }));

  let porDia = [];
  try {
    const q = await pool.query(
      `SELECT (s.fechada_em AT TIME ZONE '${tz}')::date AS dia,
              COUNT(*)::int AS contas,
              COALESCE(SUM(${SQL_VALOR_COBRADO}), 0)::numeric(14,2) AS faturamento,
              COALESCE(SUM(${SQL_VALOR_BASE}), 0)::numeric(14,2) AS vendas,
              COALESCE(SUM(COALESCE(s.taxa_servico, 0)), 0)::numeric(14,2) AS servico,
              COALESCE(SUM(COALESCE(s.desconto, 0)), 0)::numeric(14,2) AS descontos
       FROM mesa_sessoes s
       WHERE s.status = 'fechada'
         AND s.fechada_em >= ${range.textStart}
         AND s.fechada_em < ${range.textEnd}
       GROUP BY 1
       ORDER BY 1`,
      range.values
    );
    porDia = mapPorDia(q.rows);
  } catch (e) {
    console.error('[relatorio] porDia falhou:', e.message || e);
    try {
      const q = await pool.query(
        `SELECT s.fechada_em::date AS dia,
                COUNT(*)::int AS contas,
                COALESCE(SUM(${SQL_VALOR_COBRADO}), 0)::numeric(14,2) AS faturamento,
                COALESCE(SUM(${SQL_VALOR_BASE}), 0)::numeric(14,2) AS vendas,
                COALESCE(SUM(COALESCE(s.taxa_servico, 0)), 0)::numeric(14,2) AS servico,
                COALESCE(SUM(COALESCE(s.desconto, 0)), 0)::numeric(14,2) AS descontos
         FROM mesa_sessoes s
         WHERE s.status = 'fechada'
           AND s.fechada_em::date >= $1::date
           AND s.fechada_em::date <= $2::date
         GROUP BY 1
         ORDER BY 1`,
        [from, to]
      );
      porDia = mapPorDia(q.rows);
    } catch (e2) {
      console.error('[relatorio] porDia fallback falhou:', e2.message || e2);
    }
  }

  // #154/#299: serviço por garçom responsável agregado no banco sobre TODAS as
  // contas fechadas do período — nunca truncado mesmo quando `contas` usa paginação.
  const mapPorGarcom = (rows) =>
    rows
      .map((r) => ({
        garcomId: r.garcom_id != null ? Number(r.garcom_id) : null,
        garcomNome: r.garcom_nome || 'Sem responsável atribuído',
        contas: Number(r.contas || 0),
        vendasBrutas: round2(r.vendas),
        servicoTotal: round2(r.servico),
        descontosTotal: round2(r.descontos),
        totalCobrado: round2(r.cobrado),
      }))
      .sort((a, b) => b.servicoTotal - a.servicoTotal || b.totalCobrado - a.totalCobrado);

  let porGarcom = null;
  try {
    const q = await pool.query(
      `SELECT s.garcom_responsavel_id AS garcom_id,
              g.nome AS garcom_nome,
              COUNT(*)::int AS contas,
              COALESCE(SUM(${SQL_VALOR_BASE}), 0)::numeric(14,2) AS vendas,
              COALESCE(SUM(COALESCE(s.taxa_servico, 0)), 0)::numeric(14,2) AS servico,
              COALESCE(SUM(COALESCE(s.desconto, 0)), 0)::numeric(14,2) AS descontos,
              COALESCE(SUM(${SQL_VALOR_COBRADO}), 0)::numeric(14,2) AS cobrado
       FROM mesa_sessoes s
       LEFT JOIN garcons g ON g.id = s.garcom_responsavel_id
       WHERE s.status = 'fechada'
         AND s.fechada_em >= ${range.textStart}
         AND s.fechada_em < ${range.textEnd}
       GROUP BY s.garcom_responsavel_id, g.nome`,
      range.values
    );
    porGarcom = mapPorGarcom(q.rows);
  } catch (e) {
    console.error('[relatorio] porGarcom falhou:', e.message || e);
    try {
      const q = await pool.query(
        `SELECT s.garcom_responsavel_id AS garcom_id,
                g.nome AS garcom_nome,
                COUNT(*)::int AS contas,
                COALESCE(SUM(${SQL_VALOR_BASE}), 0)::numeric(14,2) AS vendas,
                COALESCE(SUM(COALESCE(s.taxa_servico, 0)), 0)::numeric(14,2) AS servico,
                COALESCE(SUM(COALESCE(s.desconto, 0)), 0)::numeric(14,2) AS descontos,
                COALESCE(SUM(${SQL_VALOR_COBRADO}), 0)::numeric(14,2) AS cobrado
         FROM mesa_sessoes s
         LEFT JOIN garcons g ON g.id = s.garcom_responsavel_id
         WHERE s.status = 'fechada'
           AND s.fechada_em::date >= $1::date
           AND s.fechada_em::date <= $2::date
         GROUP BY s.garcom_responsavel_id, g.nome`,
        [from, to]
      );
      porGarcom = mapPorGarcom(q.rows);
    } catch (e2) {
      console.error('[relatorio] porGarcom fallback falhou:', e2.message || e2);
    }
  }

  // #299: sem teto fixo silencioso — retorna todas as contas fechadas do período
  // (ou a fatia determinística quando `page`/`limit` são solicitados explicitamente).
  const sqlPaginacao = pag.paginado ? ' LIMIT $3 OFFSET $4' : '';
  const valoresSessoes = pag.paginado ? [...range.values, pag.limit, pag.offset] : range.values;

  let sessoes = [];
  try {
    const q = await pool.query(
      `SELECT s.id, s.valor_total, s.desconto, s.taxa_servico, s.valor_cobrado,
              s.forma_pagamento, s.fechada_em, s.cliente_nome,
              s.garcom_responsavel_id,
              g.nome AS garcom_nome,
              m.numero AS mesa
       FROM mesa_sessoes s
       JOIN mesas m ON m.id = s.mesa_id
       LEFT JOIN garcons g ON g.id = s.garcom_responsavel_id
       WHERE s.status = 'fechada'
         AND s.fechada_em >= ${range.textStart}
         AND s.fechada_em < ${range.textEnd}
       ORDER BY s.fechada_em DESC, s.id DESC${sqlPaginacao}`,
      valoresSessoes
    );
    sessoes = q.rows;
  } catch (e) {
    console.error('[relatorio] sessoes falhou:', e.message || e);
    try {
      const q = await pool.query(
        `SELECT s.id, s.valor_total, s.desconto, s.taxa_servico, s.valor_cobrado,
                s.forma_pagamento, s.fechada_em, s.cliente_nome,
                s.garcom_responsavel_id,
                g.nome AS garcom_nome,
                m.numero AS mesa
         FROM mesa_sessoes s
         JOIN mesas m ON m.id = s.mesa_id
         LEFT JOIN garcons g ON g.id = s.garcom_responsavel_id
         WHERE s.status = 'fechada'
           AND s.fechada_em::date >= $1::date
           AND s.fechada_em::date <= $2::date
         ORDER BY s.fechada_em DESC, s.id DESC${sqlPaginacao}`,
        valoresSessoes
      );
      sessoes = q.rows;
    } catch (e2) {
      console.error('[relatorio] sessoes fallback falhou:', e2.message || e2);
      const err = new Error('Falha ao consultar contas fechadas: ' + (e2.message || e.message));
      err.status = 500;
      throw err;
    }
  }

  const contas = sessoes.map((s) => {
    const cobradoRaw =
      s.valor_cobrado != null && s.valor_cobrado !== ''
        ? Number(s.valor_cobrado)
        : Number(s.valor_total || 0);
    const descontoRaw = Number(s.desconto || 0);
    const servicoRaw = Number(s.taxa_servico || 0);
    const baseRaw =
      s.valor_total != null && s.valor_total !== ''
        ? Number(s.valor_total)
        : round2(cobradoRaw + descontoRaw - servicoRaw);
    return {
      id: s.id,
      mesa: s.mesa,
      cliente: s.cliente_nome || null,
      valor: round2(baseRaw),
      desconto: round2(descontoRaw),
      taxaServico: round2(servicoRaw),
      valorCobrado: round2(cobradoRaw),
      forma: s.forma_pagamento || 'outro',
      fechadaEm: s.fechada_em,
      // #154: comissão/serviço atribuído ao responsável pela sessão.
      garcomResponsavelId: s.garcom_responsavel_id || null,
      garcomResponsavel: s.garcom_nome || null,
    };
  });

  // Fallback em memória caso `porGarcom` SQL tenha falhado num mock parcial.
  if (!porGarcom) {
    const porGarcomMap = new Map();
    for (const conta of contas) {
      const chave = conta.garcomResponsavelId || 'sem-responsavel';
      if (!porGarcomMap.has(chave)) {
        porGarcomMap.set(chave, {
          garcomId: conta.garcomResponsavelId,
          garcomNome: conta.garcomResponsavel || 'Sem responsável atribuído',
          contas: 0,
          vendasBrutas: 0,
          servicoTotal: 0,
          descontosTotal: 0,
          totalCobrado: 0,
        });
      }
      const grupo = porGarcomMap.get(chave);
      grupo.contas += 1;
      grupo.vendasBrutas = round2(grupo.vendasBrutas + conta.valor);
      grupo.servicoTotal = round2(grupo.servicoTotal + conta.taxaServico);
      grupo.descontosTotal = round2(grupo.descontosTotal + conta.desconto);
      grupo.totalCobrado = round2(grupo.totalCobrado + conta.valorCobrado);
    }
    porGarcom = [...porGarcomMap.values()].sort(
      (a, b) => b.servicoTotal - a.servicoTotal || b.totalCobrado - a.totalCobrado
    );
  }

  const totalContas = Number(
    resumo.contasFechadas || porDia.reduce((acc, d) => acc + d.contas, 0) || contas.length
  );
  const paginacao = pag.paginado
    ? {
        paginado: true,
        page: pag.page,
        limit: pag.limit,
        total: totalContas,
        totalPages: Math.max(1, Math.ceil(totalContas / pag.limit)),
        hasMore: pag.offset + contas.length < totalContas,
      }
    : {
        paginado: false,
        page: 1,
        limit: totalContas,
        total: totalContas,
        totalPages: 1,
        hasMore: false,
      };

  const porFormaNormalizado = {};
  for (const [k, v] of Object.entries(resumo.porFormaPagamento || {})) {
    porFormaNormalizado[k] = round2(v);
  }

  return {
    geradoEm: new Date().toISOString(),
    periodo: { from, to, timezone: tz },
    paginacao,
    resumo: {
      faturamento: round2(resumo.faturamento),
      // #154: breakdown — vendas brutas − descontos + serviço = total.
      vendasBrutas: round2(resumo.vendasBrutas),
      servicoTotal: round2(resumo.servicoTotal),
      descontosTotal: round2(resumo.descontosTotal),
      totalCobrado: round2(resumo.totalCobrado ?? resumo.faturamento),
      contasFechadas: totalContas,
      ticketMedio: round2(resumo.ticketMedio),
      porFormaPagamento: porFormaNormalizado,
      pedidosTotal: resumo.pedidosTotal || 0,
      pedidosPorStatus: resumo.pedidosPorStatus || {},
      topProdutos: resumo.topProdutos || [],
    },
    porDia,
    porGarcom,
    contas,
  };
}

module.exports = {
  relatorioVendas,
  MAX_PAGE_LIMIT,
  DEFAULT_PAGE_LIMIT,
  _internos: { tzSeguro, validarDataCalendario, normalizarPaginacao, sqlRangeParams },
};
