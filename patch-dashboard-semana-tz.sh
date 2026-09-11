#!/usr/bin/env bash
# =============================================================================
# Patch: Dashboard — timezone Brasil + histórico real da semana (7 dias)
# Execute na RAIZ do projeto.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f db/dashboard.js ]]; then
  echo "❌ Rode na raiz (precisa de db/dashboard.js)"
  exit 1
fi

echo "▶ Aplicando timezone + histórico semanal real..."

# ---------------------------------------------------------------------------
# 1) db/dashboard.js — timezone America/Sao_Paulo + porDia (últimos 7 dias)
# ---------------------------------------------------------------------------
cp -n db/dashboard.js "db/dashboard.js.bak.$(date +%s)" 2>/dev/null || true

cat > db/dashboard.js << 'JS'
// Resumo do dia para o admin (faturamento, ticket, top produtos).
// Timezone fixo: America/Sao_Paulo (Neon/Postgres costuma rodar em UTC).
const pool = require('./pool');

const TZ = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

/** Expressão SQL: data local do estabelecimento a partir de um timestamptz/timestamp. */
function sqlDateLocal(col) {
  return `(${col} AT TIME ZONE '${TZ}')::date`;
}

/**
 * @param {{ from?: string|null, to?: string|null }} [opts]
 * from/to em YYYY-MM-DD (opcional). Default: hoje no fuso do pub.
 */
async function resumoDia(opts = {}) {
  const from = opts.from || null;
  const to = opts.to || null;

  const rangeSql = from && to ? { start: from, end: to } : null;

  // Sessões fechadas no período (faturamento real)
  const sessoesQ = rangeSql
    ? await pool.query(
        `SELECT id, valor_total, desconto, taxa_servico, valor_cobrado, forma_pagamento, fechada_em, aberta_em
         FROM mesa_sessoes
         WHERE status = 'fechada'
           AND ${sqlDateLocal('fechada_em')} >= $1::date
           AND ${sqlDateLocal('fechada_em')} <= $2::date`,
        [rangeSql.start, rangeSql.end]
      )
    : await pool.query(
        `SELECT id, valor_total, desconto, taxa_servico, valor_cobrado, forma_pagamento, fechada_em, aberta_em
         FROM mesa_sessoes
         WHERE status = 'fechada'
           AND ${sqlDateLocal('fechada_em')} = (CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date`
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

  // Pedidos criados no período
  const pedidosQ = rangeSql
    ? await pool.query(
        `SELECT status, COUNT(*)::int AS n
         FROM pedidos
         WHERE ${sqlDateLocal('criado_em')} >= $1::date
           AND ${sqlDateLocal('criado_em')} <= $2::date
         GROUP BY status`,
        [rangeSql.start, rangeSql.end]
      )
    : await pool.query(
        `SELECT status, COUNT(*)::int AS n
         FROM pedidos
         WHERE ${sqlDateLocal('criado_em')} = (CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date
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

  // Top produtos do período
  const topQ = rangeSql
    ? await pool.query(
        `SELECT pr.nome,
                COALESCE(pr.setor, 'cozinha') AS setor,
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
         WHERE ${sqlDateLocal('p.criado_em')} >= $1::date
           AND ${sqlDateLocal('p.criado_em')} <= $2::date
         GROUP BY pr.nome, pr.setor
         ORDER BY qtd DESC
         LIMIT 8`,
        [rangeSql.start, rangeSql.end]
      )
    : await pool.query(
        `SELECT pr.nome,
                COALESCE(pr.setor, 'cozinha') AS setor,
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
         WHERE ${sqlDateLocal('p.criado_em')} = (CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date
         GROUP BY pr.nome, pr.setor
         ORDER BY qtd DESC
         LIMIT 8`
      );

  const topProdutos = topQ.rows.map((r) => ({
    nome: r.nome,
    setor: r.setor || 'cozinha',
    quantidade: r.qtd,
    receita: Number(Number(r.receita || 0).toFixed(2)),
  }));

  // Histórico dos últimos 7 dias (sempre no fuso do pub) — para o gráfico da semana
  const { rows: porDiaRows } = await pool.query(
    `WITH dias AS (
       SELECT generate_series(
         ((CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date - 6),
         (CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date,
         '1 day'::interval
       )::date AS dia
     )
     SELECT d.dia,
            COUNT(s.id)::int AS contas,
            COALESCE(SUM(COALESCE(s.valor_cobrado, s.valor_total)), 0)::float AS faturamento
     FROM dias d
     LEFT JOIN mesa_sessoes s
       ON s.status = 'fechada'
      AND ${sqlDateLocal('s.fechada_em')} = d.dia
     GROUP BY d.dia
     ORDER BY d.dia`
  );

  const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const hojeLocal = porDiaRows.length
    ? String(porDiaRows[porDiaRows.length - 1].dia).slice(0, 10)
    : null;

  const porDia = porDiaRows.map((r) => {
    const diaStr =
      r.dia instanceof Date
        ? r.dia.toISOString().slice(0, 10)
        : String(r.dia).slice(0, 10);
    // weekday a partir da data YYYY-MM-DD em UTC noon para evitar shift
    const wd = new Date(diaStr + 'T12:00:00Z').getUTCDay();
    const label = diaStr === hojeLocal ? 'Hoje' : DIAS_PT[wd];
    return {
      dia: diaStr,
      label,
      contas: r.contas,
      faturamento: Number(Number(r.faturamento || 0).toFixed(2)),
    };
  });

  return {
    periodo: rangeSql
      ? { from: rangeSql.start, to: rangeSql.end }
      : { from: null, to: null, label: 'hoje', timezone: TZ },
    faturamento: Number(faturamento.toFixed(2)),
    contasFechadas,
    ticketMedio: Number(ticketMedio.toFixed(2)),
    porFormaPagamento: porForma,
    pedidosTotal,
    pedidosPorStatus,
    mesas,
    emAberto,
    topProdutos,
    porDia, // últimos 7 dias — gráfico da semana
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
     WHERE ${sqlDateLocal('p.criado_em')} = (CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date
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
JS
echo "  ✓ db/dashboard.js (timezone + porDia 7 dias)"

# ---------------------------------------------------------------------------
# 2) db/relatorio.js — mesmo fuso
# ---------------------------------------------------------------------------
if [[ -f db/relatorio.js ]]; then
  cp -n db/relatorio.js "db/relatorio.js.bak.$(date +%s)" 2>/dev/null || true
  python3 << 'PY'
from pathlib import Path
p = Path("db/relatorio.js")
text = p.read_text(encoding="utf-8")
# Troca fechada_em::date por AT TIME ZONE se ainda não tiver
if "AT TIME ZONE" not in text:
    text = text.replace(
        "fechada_em::date",
        "(fechada_em AT TIME ZONE 'America/Sao_Paulo')::date"
    )
    p.write_text(text, encoding="utf-8")
    print("  ✓ db/relatorio.js timezone")
else:
    print("  ✓ db/relatorio.js já tem timezone ou não precisou")
PY
fi

# ---------------------------------------------------------------------------
# 3) Frontend — usa dash.porDia no gráfico da semana
# ---------------------------------------------------------------------------
if [[ -f src/screens/Admin.tsx ]]; then
  cp -n src/screens/Admin.tsx "src/screens/Admin.tsx.bak.semana.$(date +%s)" 2>/dev/null || true
  python3 << 'PY'
from pathlib import Path
import re

p = Path("src/screens/Admin.tsx")
text = p.read_text(encoding="utf-8")

# Substitui o trecho que monta "semana" a partir de faturamentoSemana
old = '''  // Semana: por enquanto só preenche "Hoje" com dado real (histórico diário exige endpoint extra)
  const semana = faturamentoSemana(sessoes).map((d) =>
    d.dia === "Hoje" ? { ...d, valor: fatHoje + emAberto } : d
  );
  const maxSemana = Math.max(1, ...semana.map((d) => d.valor));'''

new = '''  // Semana real: últimos 7 dias vindos da API (dash.porDia)
  const semanaApi: { dia: string; label: string; faturamento: number; contas: number }[] =
    Array.isArray(dash?.porDia) ? dash.porDia : [];
  const semana =
    semanaApi.length > 0
      ? semanaApi.map((d) => ({
          dia: d.label || d.dia,
          valor: Number(d.faturamento || 0),
        }))
      : faturamentoSemana(sessoes).map((d) =>
          d.dia === "Hoje" ? { ...d, valor: fatHoje + emAberto } : d
        );
  const maxSemana = Math.max(1, ...semana.map((d) => d.valor));'''

if old in text:
    text = text.replace(old, new)
    p.write_text(text, encoding="utf-8")
    print("  ✓ Admin.tsx: gráfico usa porDia da API")
else:
    # tentativa mais frouxa
    if "dash?.porDia" in text or "dash.porDia" in text:
        print("  ✓ Admin.tsx já usa porDia")
    else:
        # injeta depois de fatHoje / ticket
        needle = "const maxSemana = Math.max"
        if "faturamentoSemana(sessoes)" in text and needle in text:
            text2 = re.sub(
                r"const semana = faturamentoSemana\(sessoes\)[\s\S]*?const maxSemana = Math\.max\(1, \.\.\.semana\.map\(\(d\) => d\.valor\)\);",
                new.strip(),
                text,
                count=1,
            )
            if text2 != text:
                p.write_text(text2, encoding="utf-8")
                print("  ✓ Admin.tsx: gráfico substituído (regex)")
            else:
                print("  ⚠ não consegui trocar o bloco da semana automaticamente")
                print("    Cole manualmente o trecho 'semanaApi' no Painel()")
        else:
            print("  ⚠ bloco da semana não encontrado — aplique o patch-dashboard-real.sh antes")

# Remove nota de placeholder se existir
text = p.read_text(encoding="utf-8")
text = text.replace(
    '<p className="mt-3 text-[10px] text-stone-600">\n            Histórico dos outros dias ainda é placeholder — use a aba Relatório para período real.\n          </p>',
    "",
)
text = text.replace(
    "Histórico dos outros dias ainda é placeholder — use a aba Relatório para período real.",
    "",
)
p.write_text(text, encoding="utf-8")
print("  ✓ nota de placeholder removida")
PY
else
  echo "  ⚠ src/screens/Admin.tsx não encontrado — só backend foi atualizado"
fi

# ---------------------------------------------------------------------------
# 4) .env.example — documenta APP_TIMEZONE
# ---------------------------------------------------------------------------
if [[ -f .env.example ]] && ! grep -q APP_TIMEZONE .env.example 2>/dev/null; then
  echo "" >> .env.example
  echo "# Fuso do estabelecimento (dashboard / relatórios)" >> .env.example
  echo "APP_TIMEZONE=America/Sao_Paulo" >> .env.example
  echo "  ✓ .env.example atualizado"
fi

echo ""
echo "✅ Pronto."
echo ""
echo "Reinicie o servidor (npm start) e, se SPA:"
echo "  npm run build"
echo ""
echo "Opcional no .env:"
echo "  APP_TIMEZONE=America/Sao_Paulo"
echo ""
echo "Agora o dashboard mostra:"
echo "  • Faturamento / pedidos / ticket no fuso de Brasília"
echo "  • Gráfico da semana com os últimos 7 dias reais"
echo "  • Campeões com quantidade vendida de verdade"
