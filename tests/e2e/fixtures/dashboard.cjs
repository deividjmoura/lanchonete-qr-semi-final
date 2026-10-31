'use strict';

// Resposta realista do novo contrato opt-in, compartilhada pelos E2E sem banco.
function criarDashboard(opcoes = {}) {
  const chave = opcoes.periodo || 'hoje';
  const hoje = '2026-10-30';
  const from = chave === 'mes' ? '2026-10-01' : chave === 'semana' ? '2026-10-26' : hoje;
  const qtdDias = chave === 'mes' ? 30 : chave === 'semana' ? 5 : 1;
  const faturamento = opcoes.faturamento ?? 1284.5;
  const contas = opcoes.contasFechadas ?? 24;
  const pedidos = opcoes.pedidosTotal ?? 42;
  const resumo = {
    faturamento, vendasBrutas: opcoes.vendasBrutas ?? faturamento,
    servicoTotal: opcoes.servicoTotal ?? 0, descontosTotal: opcoes.descontosTotal ?? 0,
    contasFechadas: contas, ticketMedio: opcoes.ticketMedio ?? (contas ? faturamento / contas : 0),
    pedidosTotal: pedidos, pedidosPorStatus: opcoes.pedidosPorStatus || { entregue: pedidos },
  };
  const historico = (opcoes.historico || ['Sáb', 'Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Hoje'].map((label, i) => ({
    dia: `2026-10-${String(24 + i).padStart(2, '0')}`, label,
    faturamento: [800, 1200, 0, 680, 900, 1500, faturamento][i], contas: 5,
  }))).map((d) => ({ vendasBrutas: d.faturamento, servicoTotal: 0, descontosTotal: 0, pedidos: 0, pedidosPorStatus: {}, ...d }));
  const porDia = Array.from({ length: qtdDias }, (_, i) => ({
    dia: chave === 'mes' ? `2026-10-${String(i + 1).padStart(2, '0')}` : chave === 'semana' ? `2026-10-${26 + i}` : hoje,
    label: i === qtdDias - 1 ? 'Hoje' : ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][i % 7],
    faturamento: i === qtdDias - 1 ? faturamento : 0,
    vendasBrutas: i === qtdDias - 1 ? resumo.vendasBrutas : 0,
    servicoTotal: i === qtdDias - 1 ? resumo.servicoTotal : 0,
    descontosTotal: i === qtdDias - 1 ? resumo.descontosTotal : 0,
    contas: i === qtdDias - 1 ? contas : 0,
    pedidos: i === qtdDias - 1 ? pedidos : 0,
    pedidosPorStatus: i === qtdDias - 1 ? resumo.pedidosPorStatus : {},
  }));
  return {
    periodo: { chave, from, to: hoje, dias: qtdDias, timezone: 'America/Sao_Paulo',
      anterior: { from: chave === 'hoje' ? '2026-10-29' : chave === 'semana' ? '2026-10-21' : '2026-09-01',
        to: chave === 'hoje' ? '2026-10-29' : chave === 'semana' ? '2026-10-25' : '2026-09-30', dias: qtdDias } },
    resumo, anterior: { ...resumo, faturamento: 1000, contasFechadas: 20, ticketMedio: 50, pedidosTotal: 30 },
    porDia, historico,
    pagamentos: opcoes.pagamentos || { formas: [{ forma: 'pix', valor: faturamento }], semDetalhamento: 0, excedente: 0 },
    topProdutos: (opcoes.topProdutos || []).map((p, i) => ({ id: i + 1, setor: 'cozinha', ...p })),
    atual: opcoes.atual || { sessoesAbertas: 4, consumoEntregue: 428.8, pagamentosParciais: 50, saldoPendente: 378.8,
      mesas: { total: 12, ocupadas: 4, livres: 8 }, garconsAtivos: 3,
      itens: { aguardando: 2, preparo: 3, prontos: 2, retirados: 1 } },
    entrega: opcoes.entrega || { mediaMinutos: 18.5, unidades: 12 },
    entregaAnterior: { mediaMinutos: 20, unidades: 10 },
    atualizadoEm: '2026-10-30T15:20:00Z',
  };
}
// headless Chromium pode devolver setViewportSize antes de aplicar todas as
// media queries (inclusive a margem do shell); aguardar o layout real evita
// inspecionar um estado transitório de desktop comprimido no viewport móvel.
async function aguardarLayoutDashboard(page, width) {
  let detalhe;
  for (let tentativa = 0; tentativa < 150; tentativa++) {
    // Avaliar por CDP também força o Chromium a aplicar as media queries após
    // o resize; callbacks em requestAnimationFrame podem ficar suspensos.
    detalhe = await page.evaluate((largura) => {
      const grid = document.querySelector('.dashboard-grid');
      const valor = document.querySelector('.card-neon .metric-value');
      const main = document.querySelector('.ops-main');
      const colunas = grid && getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
      const fonte = valor && parseFloat(getComputedStyle(valor).fontSize);
      const margem = main && parseFloat(getComputedStyle(main).marginLeft);
      return { inner: innerWidth, colunas, fonte, margem,
        pronto: innerWidth === largura && colunas === (largura <= 1050 ? 2 : 4) &&
          (largura > 420 || (fonte != null && fonte <= 18)) &&
          (largura >= 1024 ? margem != null && margem >= 70 : margem === 0) };
    }, width);
    if (detalhe.pronto) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Layout de ${width}px não estabilizou: ${JSON.stringify(detalhe)}`);
}

module.exports = { criarDashboard, aguardarLayoutDashboard };
