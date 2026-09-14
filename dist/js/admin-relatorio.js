function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}
function defaultRelDates() {
  const to = hojeISO();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const f = from.toISOString().slice(0, 10);
  const a = document.getElementById('relFrom');
  const b = document.getElementById('relTo');
  if (a && !a.value) a.value = f;
  if (b && !b.value) b.value = to;
  const p = document.getElementById('purgeBefore');
  if (p && !p.value) {
    const x = new Date();
    x.setDate(x.getDate() - 90);
    p.value = x.toISOString().slice(0, 10);
  }
}
var FORMAS_REL = { dinheiro: 'Dinheiro', pix: 'PIX', cartao_debito: 'Débito', cartao_credito: 'Crédito', outro: 'Outro' };
async function gerarRelatorioPdf() {
  const from = document.getElementById('relFrom').value;
  const to = document.getElementById('relTo').value;
  if (!from || !to) return toast('Informe De e Até');
  try {
    const r = await fetch('/api/admin/relatorio?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to));
    const data = await r.json();
    if (!r.ok) return toast(data.error || 'Erro no relatório');
    const brl = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
    const rs = data.resumo || {};
    const formas = Object.entries(rs.porFormaPagamento || {})
      .map(([k, v]) => '<tr><td>' + esc(FORMAS_REL[k] || k) + '</td><td style="text-align:right">' + brl(v) + '</td></tr>')
      .join('') || '<tr><td colspan="2">—</td></tr>';
    const top = (rs.topProdutos || [])
      .map((p) => '<tr><td>' + esc(p.nome) + '</td><td style="text-align:right">' + p.quantidade + '×</td><td style="text-align:right">' + brl(p.receita) + '</td></tr>')
      .join('') || '<tr><td colspan="3">—</td></tr>';
    const dias = (data.porDia || [])
      .map((d) => '<tr><td>' + esc(d.dia) + '</td><td style="text-align:right">' + d.contas + '</td><td style="text-align:right">' + brl(d.faturamento) + '</td></tr>')
      .join('') || '<tr><td colspan="3">—</td></tr>';
    const contas = (data.contas || []).slice(0, 200)
      .map((c) => '<tr><td>' + esc(String(c.mesa)) + '</td><td>' + esc(c.cliente || '—') + '</td><td>' + esc(FORMAS_REL[c.forma] || c.forma) + '</td><td style="text-align:right">' + brl(c.valor) + '</td></tr>')
      .join('') || '<tr><td colspan="4">—</td></tr>';
    const w = window.open('', '_blank');
    if (!w) return toast('Permita pop-ups para o relatório');
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ' + from + ' a ' + to + '</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:800px;margin:0 auto}' +
      'h1{font-size:1.4rem;margin:0 0 4px}h2{font-size:1.1rem;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}' +
      '.muted{color:#666;font-size:.9rem}table{width:100%;border-collapse:collapse;font-size:.9rem;margin-top:8px}' +
      'th,td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}th{background:#f5f5f5}' +
      '.kpi{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}' +
      '.kpi div{border:1px solid #e5e5e5;border-radius:8px;padding:12px 16px;min-width:120px}' +
      '.kpi b{display:block;font-size:1.2rem;margin-top:4px}@media print{button{display:none}}</style></head><body>' +
      '<button onclick="window.print()" style="padding:10px 16px;font-weight:600;cursor:pointer;margin-bottom:16px">Imprimir / Salvar PDF</button>' +
      '<h1>Relatório de vendas</h1>' +
      '<p class="muted">Período: <b>' + from + '</b> a <b>' + to + '</b> · Gerado em ' + new Date(data.geradoEm).toLocaleString('pt-BR') + '</p>' +
      '<div class="kpi"><div>Faturamento<b>' + brl(rs.faturamento) + '</b></div>' +
      '<div>Contas fechadas<b>' + (rs.contasFechadas || 0) + '</b></div>' +
      '<div>Ticket médio<b>' + brl(rs.ticketMedio) + '</b></div>' +
      '<div>Pedidos<b>' + (rs.pedidosTotal || 0) + '</b></div></div>' +
      '<h2>Por forma de pagamento</h2><table><thead><tr><th>Forma</th><th style="text-align:right">Total</th></tr></thead><tbody>' + formas + '</tbody></table>' +
      '<h2>Top produtos</h2><table><thead><tr><th>Produto</th><th style="text-align:right">Qtd</th><th style="text-align:right">Receita</th></tr></thead><tbody>' + top + '</tbody></table>' +
      '<h2>Por dia</h2><table><thead><tr><th>Dia</th><th style="text-align:right">Contas</th><th style="text-align:right">Faturamento</th></tr></thead><tbody>' + dias + '</tbody></table>' +
      '<h2>Contas fechadas (até 200)</h2><table><thead><tr><th>Mesa</th><th>Cliente</th><th>Pagamento</th><th style="text-align:right">Valor</th></tr></thead><tbody>' + contas + '</tbody></table>' +
      '<p class="muted" style="margin-top:32px">Major Pub</p></body></html>');
    w.document.close();
  } catch (e) {
    toast('Erro ao gerar relatório');
  }
}
async function previewPurge() {
  const before = document.getElementById('purgeBefore').value;
  const msg = document.getElementById('purgeMsg');
  if (!before) return toast('Informe a data limite');
  msg.textContent = 'Consultando…';
  try {
    const r = await fetch('/api/admin/historico/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ before: before, dryRun: true }),
    });
    const d = await r.json();
    if (!r.ok) { msg.textContent = ''; return toast(d.error || 'Erro'); }
    msg.textContent =
      'Prévia (será apagado de TODOS os lugares): ' +
      d.sessoes + ' sessão(ões), ' +
      d.pedidos + ' pedido(s), ' +
      d.itens + ' item(ns)' +
      (d.pagamentos != null ? ', ' + d.pagamentos + ' pagamento(s)' : '') +
      ' com fechamento ANTES de ' + before + '.';
  } catch (e) {
    msg.textContent = '';
    toast('Erro na prévia');
  }
}
async function executarPurge() {
  const before = document.getElementById('purgeBefore').value;
  const msg = document.getElementById('purgeMsg');
  if (!before) return toast('Informe a data limite');

  const aviso1 =
    '⚠️ APAGAR HISTÓRICO — leia com calma\n\n' +
    'Serão removidos permanentemente TODOS os dados de contas FECHADAS com data de fechamento ANTES de ' + before + ':\n\n' +
    '• Sessões / comandas fechadas\n' +
    '• Pedidos e itens dessas sessões\n' +
    '• Pagamentos parciais (divisão de conta)\n\n' +
    'Isso some do Histórico de pedidos, do Relatório PDF e dos totais antigos do Dashboard.\n\n' +
    'NÃO apaga: mesas abertas, pedidos em andamento, cardápio, staff.\n\n' +
    'Esta ação NÃO pode ser desfeita. Continuar?';
  if (!confirm(aviso1)) return;

  const digite = prompt(
    'Para confirmar, digite APAGAR (em maiúsculas):\n\n' +
      'Tudo antes de ' + before + ' será removido de todos os lugares.'
  );
  if (digite !== 'APAGAR') {
    toast('Purge cancelado — texto de confirmação não confere');
    return;
  }

  msg.textContent = 'Apagando de todos os lugares…';
  try {
    const r = await fetch('/api/admin/historico/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ before: before, confirm: true }),
    });
    const d = await r.json();
    if (!r.ok) { msg.textContent = ''; return toast(d.error || 'Erro'); }
    msg.textContent = d.message || ('Removidas ' + d.sessoes + ' sessão(ões).');
    toast('Histórico limpo em todos os lugares');
    if (typeof loadDashboard === 'function') loadDashboard();
    // limpa painel de histórico na tela
    const hist = document.getElementById('pedidosHistorico');
    if (hist) hist.innerHTML = '<p class="muted">Histórico apagado. Busque de novo se quiser conferir o que restou.</p>';
    window.__histPedidos = [];
    // se havia filtros de data, rebusca para mostrar lista vazia/atualizada
    if (typeof buscarHistorico === 'function') {
      const from = document.getElementById('histFrom');
      const to = document.getElementById('histTo');
      if ((from && from.value) || (to && to.value)) buscarHistorico();
    }
  } catch (e) {
    msg.textContent = '';
    toast('Erro ao apagar');
  }
}
