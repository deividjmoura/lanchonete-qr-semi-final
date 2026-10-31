'use strict';

// Resposta de `GET /api/admin/mesas/panorama` para os E2E sem banco.
// Mantém o formato do contrato: config, praças, mesas (inclusive livres),
// vendas de contas fechadas e tempos do fluxo com uma etapa indisponível.
function criarPanorama() {
  const agora = Date.now();
  const iso = (minutosAtras) => new Date(agora - minutosAtras * 60000).toISOString();
  const pracas = [
    { id: 1, nome: 'Praia', ordem: 1, mesas: 2 },
    { id: 2, nome: 'Salão', ordem: 2, mesas: 0 },
  ];
  const mesa = (numero, dados = {}) => ({
    id: numero,
    numero,
    token: `token-mesa-${numero}`,
    status: 'livre',
    pracaId: null,
    pracaNome: null,
    pracaOrdem: null,
    sessaoId: null,
    abertaEm: null,
    tempo: null,
    clienteNome: null,
    garcomResponsavelId: null,
    garcomResponsavelNome: null,
    consumo: 0,
    pago: 0,
    saldo: 0,
    pedidosAtivos: 0,
    pedidosRecebidos: 0,
    pedidosPreparo: 0,
    pedidosProntos: 0,
    itensNaFila: 0,
    itensProntosRetirada: 0,
    ...dados,
  });
  const etapa = (minutos, amostras) => ({
    aplicavel: true,
    minutos,
    amostras,
    disponivel: minutos !== null,
    aproximado: minutos !== null && amostras < 5,
  });
  const naoAplicavel = { aplicavel: false, minutos: null, amostras: 0, disponivel: false, aproximado: false };
  return {
    config: { quantidade: 2, limite: 70, faixas: { atencaoMinutos: 45, criticoMinutos: 90 } },
    pracas,
    mesas: [
      mesa(1, {
        status: 'ocupada',
        pracaId: 1,
        pracaNome: 'Praia',
        pracaOrdem: 1,
        sessaoId: 101,
        abertaEm: iso(100),
        tempo: { id: 'critica', minutos: 100, atencaoMinutos: 45, criticoMinutos: 90 },
        clienteNome: 'Cliente 1',
        garcomResponsavelId: 1,
        garcomResponsavelNome: 'Ana',
        consumo: 80,
        pago: 20,
        saldo: 60,
        pedidosAtivos: 1,
        pedidosPreparo: 1,
        itensNaFila: 2,
        itensProntosRetirada: 1,
      }),
      mesa(2),
    ],
    vendas: {
      periodo: 'hoje',
      timezone: 'America/Sao_Paulo',
      desde: '2026-10-30',
      ate: '2026-10-30',
      porMesa: [{ numero: 1, contas: 1, total: 80 }],
    },
    fluxo: {
      janela: { horas: 24, desde: iso(24 * 60), ate: new Date(agora).toISOString() },
      amostraMinima: 5,
      limiteEtapaHoras: 12,
      etapas: [
        { id: 'recebimento_inicio', rotulo: 'Recebimento → início do preparo', descricao: 'x', setores: ['cozinha', 'bar'] },
        { id: 'inicio_pronto', rotulo: 'Início → pronto', descricao: 'x', setores: ['cozinha', 'bar'] },
        { id: 'pronto_retirada', rotulo: 'Pronto → retirada', descricao: 'x', setores: ['cozinha', 'bar', 'garcom'] },
        { id: 'retirada_entrega', rotulo: 'Retirada → entrega', descricao: 'x', setores: ['cozinha', 'bar', 'garcom'] },
      ],
      setores: {
        cozinha: {
          id: 'cozinha',
          rotulo: 'Cozinha',
          etapas: {
            recebimento_inicio: etapa(2.5, 8),
            inicio_pronto: etapa(7, 8),
            pronto_retirada: etapa(3, 3),
            retirada_entrega: etapa(null, 0),
          },
        },
        bar: {
          id: 'bar',
          rotulo: 'Bar',
          etapas: {
            recebimento_inicio: etapa(1, 8),
            inicio_pronto: etapa(2, 8),
            pronto_retirada: etapa(1, 8),
            retirada_entrega: etapa(3, 8),
          },
        },
        garcom: {
          id: 'garcom',
          rotulo: 'Garçom',
          etapas: {
            recebimento_inicio: naoAplicavel,
            inicio_pronto: naoAplicavel,
            pronto_retirada: etapa(5, 8),
            retirada_entrega: etapa(2, 8),
          },
        },
      },
    },
    atualizadoEm: new Date(agora).toISOString(),
  };
}

function criarMesaDetalhe(numero = 1) {
  const panorama = criarPanorama();
  const mesa = panorama.mesas.find((m) => m.numero === numero) || panorama.mesas[0];
  return {
    ...mesa,
    faixas: panorama.config.faixas,
    pedidos: mesa.sessaoId
      ? [{
          id: 900,
          status: 'em_producao',
          criadoEm: mesa.abertaEm,
          editadoEm: null,
          clienteNome: mesa.clienteNome,
          garcomNome: mesa.garcomResponsavelNome,
          itens: [{
            id: 1,
            nome: 'Hambúrguer',
            quantidade: 2,
            status: 'em_producao',
            setor: 'cozinha',
            prontoEm: null,
            retiradoEm: null,
            entregueEm: null,
          }],
        }]
      : [],
    pagamentos: mesa.pago
      ? [{ id: 1, valor: mesa.pago, forma: 'pix', criadoEm: mesa.abertaEm }]
      : [],
    atualizadoEm: panorama.atualizadoEm,
  };
}

module.exports = { criarPanorama, criarMesaDetalhe };
