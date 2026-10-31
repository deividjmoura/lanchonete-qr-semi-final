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
module.exports = { criarDashboard };
