// Dashboard interativo. Contrato opt-in: o resumo legado e os relatórios usam
// db/dashboard.js sem alterações. Datas civis pertencem ao fuso da casa.
const pool = require('./pool');

const TZ = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
const PERIODOS = new Set(['hoje', 'semana', 'mes']);
const arred2 = (valor) => Number(Number(valor || 0).toFixed(2));

function validarPeriodoDashboard(periodo) {
  if (!PERIODOS.has(periodo)) {
    const erro = new Error('Período inválido. Use hoje, semana ou mes.');
    erro.status = 400;
    throw erro;
  }
  return periodo;
}

// A comparação usa o intervalo imediatamente anterior com a mesma quantidade
// de dias civis. Não compara uma semana/mês ainda incompleto com outro inteiro.
// `agora` é somente uma injeção de relógio para testes, nunca vem da rota HTTP.
async function intervaloDashboard(client, periodo, timezone = TZ, agora = null) {
  validarPeriodoDashboard(periodo);
  const { rows } = await client.query(`
    WITH relogio AS (
      SELECT (COALESCE($3::timestamptz, CURRENT_TIMESTAMP) AT TIME ZONE $1)::date AS hoje
    ), limites AS (
      SELECT hoje,
             CASE $2::text
               WHEN 'hoje' THEN hoje
               WHEN 'semana' THEN date_trunc('week', hoje::timestamp)::date
               WHEN 'mes' THEN date_trunc('month', hoje::timestamp)::date
             END AS inicio
      FROM relogio
    )
    SELECT to_char(inicio, 'YYYY-MM-DD') AS "from",
           to_char(hoje, 'YYYY-MM-DD') AS "to",
           (hoje - inicio + 1)::int AS dias,
           to_char(inicio - (hoje - inicio + 1), 'YYYY-MM-DD') AS anterior_from,
           to_char(inicio - 1, 'YYYY-MM-DD') AS anterior_to,
           to_char(hoje - 6, 'YYYY-MM-DD') AS historico_from
    FROM limites`, [timezone, periodo, agora]);
  const r = rows[0];
  return {
    chave: periodo, from: r.from, to: r.to, dias: r.dias, timezone,
    anterior: { from: r.anterior_from, to: r.anterior_to, dias: r.dias },
    historicoFrom: r.historico_from,
  };
}

// Cada fronteira é convertida da meia-noite local para um instante. Isso
// também mantém utilizáveis os índices em fechada_em/criado_em/entregue_em e
// funciona em fusos com mudança de horário de verão.
const INICIO = "($1::date::timestamp AT TIME ZONE $3)";
const FIM = "(($2::date + 1)::timestamp AT TIME ZONE $3)";

function datasEntre(from, to) {
  const datas = [];
  const d = new Date(`${from}T00:00:00Z`);
  while (d.toISOString().slice(0, 10) <= to) {
    datas.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return datas;
}

function linhaVazia(dia, hoje) {
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return {
    dia,
    label: dia === hoje ? 'Hoje' : dias[new Date(`${dia}T12:00:00Z`).getUTCDay()],
    faturamento: 0, vendasBrutas: 0, servicoTotal: 0, descontosTotal: 0,
    contas: 0, pedidos: 0, pedidosPorStatus: {},
  };
}

function somarPeriodo(linhas) {
  const somar = (campo) => arred2(linhas.reduce((total, linha) => total + Number(linha[campo] || 0), 0));
  const contasFechadas = somar('contas');
  const faturamento = somar('faturamento');
  const pedidosPorStatus = {};
  for (const linha of linhas) {
    for (const [status, quantidade] of Object.entries(linha.pedidosPorStatus)) {
      pedidosPorStatus[status] = (pedidosPorStatus[status] || 0) + quantidade;
    }
  }
  return {
    faturamento,
    vendasBrutas: somar('vendasBrutas'),
    servicoTotal: somar('servicoTotal'),
    descontosTotal: somar('descontosTotal'),
    contasFechadas,
    ticketMedio: contasFechadas ? arred2(faturamento / contasFechadas) : 0,
    pedidosTotal: somar('pedidos'),
    pedidosPorStatus,
  };
}

async function dashboardGeral({ periodo = 'hoje' } = {}) {
  validarPeriodoDashboard(periodo);
  const client = await pool.connect();
  try {
    // Um único snapshot evita que fechamento/pagamento concorrente provoque
    // totais, formas e histórico de momentos diferentes na mesma resposta.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const intervalo = await intervaloDashboard(client, periodo);
    const { historicoFrom, ...periodoResposta } = intervalo;
    const fromDados = intervalo.anterior.from < historicoFrom ? intervalo.anterior.from : historicoFrom;
    const valores = [fromDados, intervalo.to, TZ];
    const { rows: sessoes } = await client.query(`
      SELECT to_char((fechada_em AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS dia,
             COUNT(*)::int AS contas,
             COALESCE(SUM(COALESCE(valor_cobrado, valor_total, 0)), 0)::float AS faturamento,
             COALESCE(SUM(COALESCE(valor_total,
               COALESCE(valor_cobrado, 0) + COALESCE(desconto, 0) - COALESCE(taxa_servico, 0))), 0)::float AS vendas_brutas,
             COALESCE(SUM(COALESCE(taxa_servico, 0)), 0)::float AS servico,
             COALESCE(SUM(COALESCE(desconto, 0)), 0)::float AS descontos
      FROM mesa_sessoes
      WHERE status = 'fechada' AND fechada_em >= ${INICIO} AND fechada_em < ${FIM}
      GROUP BY 1`, valores);
    const { rows: pedidos } = await client.query(`
      SELECT to_char((criado_em AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS dia,
             status, COUNT(*)::int AS quantidade
      FROM pedidos
      WHERE criado_em >= ${INICIO} AND criado_em < ${FIM}
      GROUP BY 1, status`, valores);

    const dias = new Map(datasEntre(fromDados, intervalo.to).map((dia) => [dia, linhaVazia(dia, intervalo.to)]));
    for (const r of sessoes) {
      const d = dias.get(r.dia);
      if (d) Object.assign(d, {
        contas: r.contas, faturamento: arred2(r.faturamento), vendasBrutas: arred2(r.vendas_brutas),
        servicoTotal: arred2(r.servico), descontosTotal: arred2(r.descontos),
      });
    }
    for (const r of pedidos) {
      const d = dias.get(r.dia);
      if (d) {
        d.pedidos += r.quantidade;
        d.pedidosPorStatus[r.status] = r.quantidade;
      }
    }
    const selecionar = (from, to) => datasEntre(from, to).map((dia) => dias.get(dia));
    const porDia = selecionar(intervalo.from, intervalo.to);
    const anterior = selecionar(intervalo.anterior.from, intervalo.anterior.to);
    const historico = selecionar(historicoFrom, intervalo.to);

    // Pagamentos são de contas FECHADAS no período (inclusive parciais de
    // outros dias). Não atribuir toda a conta à última forma: uma mesma conta
    // pode ser dividida. Registros antigos sem lançamentos ficam explicitamente
    // sem detalhamento; pagamentos excedentes são sinalizados, nunca ajustados.
    const parametrosPeriodo = [intervalo.from, intervalo.to, TZ];
    const { rows: formasRows } = await client.query(`
      WITH fechadas AS (
        SELECT id, COALESCE(valor_cobrado, valor_total, 0) AS cobrado
        FROM mesa_sessoes
        WHERE status = 'fechada' AND fechada_em >= ${INICIO} AND fechada_em < ${FIM}
      ), por_sessao AS (
        SELECT f.id, f.cobrado, COALESCE(SUM(p.valor), 0) AS pago
        FROM fechadas f LEFT JOIN sessao_pagamentos p ON p.sessao_id = f.id
        GROUP BY f.id, f.cobrado
      ), formas AS (
        SELECT p.forma_pagamento AS forma, SUM(p.valor)::float AS valor
        FROM fechadas f JOIN sessao_pagamentos p ON p.sessao_id = f.id
        GROUP BY p.forma_pagamento
      )
      SELECT COALESCE((SELECT json_agg(formas ORDER BY valor DESC, forma) FROM formas), '[]'::json) AS formas,
             COALESCE((SELECT SUM(GREATEST(cobrado - pago, 0)) FROM por_sessao), 0)::float AS sem_detalhamento,
             COALESCE((SELECT SUM(GREATEST(pago - cobrado, 0)) FROM por_sessao), 0)::float AS excedente`, parametrosPeriodo);
    const pagamentos = {
      formas: formasRows[0].formas.map((f) => ({ forma: f.forma, valor: arred2(f.valor) })),
      semDetalhamento: arred2(formasRows[0].sem_detalhamento),
      excedente: arred2(formasRows[0].excedente),
    };

    const { rows: topProdutos } = await client.query(`
      SELECT pr.id, pr.nome, COALESCE(pr.setor, 'cozinha') AS setor,
             SUM(ip.quantidade)::int AS quantidade
      FROM pedidos p JOIN itens_pedido ip ON ip.pedido_id = p.id
      JOIN produtos pr ON pr.id = ip.produto_id
      WHERE p.criado_em >= ${INICIO} AND p.criado_em < ${FIM}
        AND p.status <> 'cancelado' AND COALESCE(ip.status, 'recebido') <> 'cancelado'
      GROUP BY pr.id, pr.nome, pr.setor
      ORDER BY quantidade DESC, pr.nome ASC, pr.id ASC LIMIT 50`, parametrosPeriodo);

    // Consumo de abertas segue a mesma fonte autoritativa do caixa:
    // itens efetivamente entregues, com adicionais e sem pagamentos abatidos.
    const { rows: snapshot } = await client.query(`
      WITH abertas AS (SELECT id FROM mesa_sessoes WHERE status = 'aberta'),
      consumo AS (
        SELECT p.sessao_id, SUM(ip.quantidade * (ip.preco_unitario + COALESCE((
          SELECT SUM(a.preco_unitario) FROM itens_pedido_adicionais a WHERE a.item_pedido_id = ip.id
        ), 0))) AS valor
        FROM abertas s JOIN pedidos p ON p.sessao_id = s.id
        JOIN itens_pedido ip ON ip.pedido_id = p.id
        WHERE COALESCE(ip.status, 'recebido') = 'entregue' GROUP BY p.sessao_id
      ), pagos AS (
        SELECT p.sessao_id, SUM(p.valor) AS valor
        FROM abertas s JOIN sessao_pagamentos p ON p.sessao_id = s.id GROUP BY p.sessao_id
      ), totais AS (
        SELECT COUNT(*)::int AS sessoes,
               COALESCE(SUM(c.valor), 0)::float AS consumo,
               COALESCE(SUM(p.valor), 0)::float AS pago,
               COALESCE(SUM(GREATEST(COALESCE(c.valor, 0) - COALESCE(p.valor, 0), 0)), 0)::float AS saldo
        FROM abertas s LEFT JOIN consumo c ON c.sessao_id = s.id LEFT JOIN pagos p ON p.sessao_id = s.id
      ), mesas_ativas AS (
        SELECT m.id, (m.status = 'ocupada' OR EXISTS (
          SELECT 1 FROM mesa_sessoes s WHERE s.mesa_id = m.id AND s.status = 'aberta'
        )) AS ocupada FROM mesas m
        WHERE m.numero BETWEEN 1 AND COALESCE((SELECT quantidade FROM configuracao_mesas WHERE id = 1), 20)
      ), fila AS (
        SELECT COALESCE(SUM(ip.quantidade) FILTER (WHERE ip.status = 'recebido'), 0)::int AS aguardando,
               COALESCE(SUM(ip.quantidade) FILTER (WHERE ip.status = 'em_producao'), 0)::int AS preparo,
               COALESCE(SUM(ip.quantidade) FILTER (WHERE ip.status IN ('concluido', 'aceito')), 0)::int AS prontos,
               COALESCE(SUM(ip.quantidade) FILTER (WHERE ip.status = 'retirado'), 0)::int AS retirados
        FROM abertas s JOIN pedidos p ON p.sessao_id = s.id JOIN itens_pedido ip ON ip.pedido_id = p.id
      )
      SELECT totais.*, fila.*,
             (SELECT COUNT(*)::int FROM mesas_ativas) AS mesas_total,
             (SELECT COUNT(*)::int FROM mesas_ativas WHERE ocupada) AS mesas_ocupadas,
             (SELECT COUNT(*)::int FROM garcons WHERE ativo = TRUE AND removido_em IS NULL) AS garcons
      FROM totais CROSS JOIN fila`);
    const a = snapshot[0];
    const atual = {
      sessoesAbertas: a.sessoes, consumoEntregue: arred2(a.consumo),
      pagamentosParciais: arred2(a.pago), saldoPendente: arred2(a.saldo),
      mesas: { total: a.mesas_total, ocupadas: a.mesas_ocupadas, livres: a.mesas_total - a.mesas_ocupadas },
      garconsAtivos: a.garcons,
      itens: { aguardando: a.aguardando, preparo: a.preparo, prontos: a.prontos, retirados: a.retirados },
    };

    // Timestamps de entrega não foram inferidos para itens legados. A média é
    // ponderada por unidade e só considera entregas com horário real e válido.
    const { rows: entregas } = await client.query(`
      SELECT CASE WHEN ip.entregue_em >= ($4::date::timestamp AT TIME ZONE $3)
                  THEN 'atual' ELSE 'anterior' END AS periodo,
             SUM(ip.quantidade)::int AS unidades,
             (SUM(ip.quantidade * EXTRACT(EPOCH FROM (ip.entregue_em - p.criado_em))) /
               NULLIF(SUM(ip.quantidade), 0) / 60)::float AS minutos
      FROM itens_pedido ip JOIN pedidos p ON p.id = ip.pedido_id
      WHERE ip.status = 'entregue' AND ip.entregue_em IS NOT NULL
        AND ip.entregue_em >= ${INICIO} AND ip.entregue_em < ${FIM}
        AND ip.entregue_em >= p.criado_em
      GROUP BY 1`, [intervalo.anterior.from, intervalo.to, TZ, intervalo.from]);
    const entregaPara = (chave) => {
      const r = entregas.find((item) => item.periodo === chave);
      return r ? { mediaMinutos: Number(Number(r.minutos).toFixed(1)), unidades: r.unidades }
        : { mediaMinutos: null, unidades: 0 };
    };

    const { rows: relogio } = await client.query('SELECT CURRENT_TIMESTAMP AS agora');
    await client.query('COMMIT');
    return {
      periodo: periodoResposta,
      resumo: somarPeriodo(porDia), anterior: somarPeriodo(anterior),
      porDia, historico, pagamentos, topProdutos, atual,
      entrega: entregaPara('atual'), entregaAnterior: entregaPara('anterior'),
      atualizadoEm: relogio[0].agora.toISOString(),
    };
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    client.release();
  }
}

module.exports = { dashboardGeral, intervaloDashboard, validarPeriodoDashboard };
