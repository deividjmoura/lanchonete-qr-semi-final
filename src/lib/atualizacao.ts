/**
 * Vigia de versão publicada (#301).
 *
 * Este módulo concentra TODA a lógica de detecção/adiamento do aviso de nova
 * versão, sem React e sem ler globais do navegador diretamente. Isso permite
 * exercitar o comportamento real em Node (múltiplas abas, falha de rede,
 * adiamento sincronizado) sem depender de um navegador — o componente
 * `AvisoAtualizacao` é só a camada visual.
 *
 * Regras de segurança da issue:
 *  - o vigia NUNCA recarrega a página; quem recarrega é o operador, depois de
 *    confirmar;
 *  - falha de rede/HTTP é silenciosa: não muda estado, não gera aviso;
 *  - a versão comparada é a do bundle EM EXECUÇÃO (injetada no build), não a
 *    primeira resposta da API — por isso uma aba aberta antes do deploy
 *    detecta a mudança;
 *  - adiamento vale para a versão detectada e é propagado às outras abas;
 *    não existe reload automático posterior.
 */

export type EstadoAtualizacao = "ocioso" | "disponivel" | "dispensado";

export type MensagemAba =
  | { tipo: "atualizacao-disponivel"; versao: string }
  | { tipo: "atualizacao-dispensada"; versao: string };

export type CanalDeAbas = {
  postMessage: (mensagem: MensagemAba) => void;
  onmessage: ((evento: { data?: unknown }) => void) | null;
  close?: () => void;
};

export type DependenciasVigia = {
  /** Versão embutida no bundle que a aba está executando (__BUILD_VERSION__). */
  versaoEmExecucao: string;
  /** Consulta a versão publicada. Deve resolver `null` em qualquer falha. */
  consultarVersao: () => Promise<string | null>;
  aoMudar: (estado: EstadoAtualizacao, versao: string | null) => void;
  intervaloMs?: number;
  criarCanal?: () => CanalDeAbas | null;
  /** A aba está visível? Abas em segundo plano não consultam a API. */
  visivel?: () => boolean;
  agendar?: (fn: () => void, ms: number) => unknown;
  cancelarAgendamento?: (id: unknown) => void;
  /** Registra ouvintes (visibilitychange/focus/online) e devolve o cancelamento. */
  registrarGatilhos?: (verificar: () => void) => () => void;
  /**
   * Marca de adiamento por versão, compartilhada por todas as abas do mesmo
   * navegador. Guarda SÓ o identificador da versão adiada (nada de dado de
   * usuário). Sem storage disponível (aba privada, cota), o adiamento vale só
   * para a aba — o comportamento degrada, nunca quebra.
   */
  lerAdiamento?: () => string | null;
  gravarAdiamento?: (versao: string) => void;
};

export const INTERVALO_VERIFICACAO_MS = 60_000;

function mensagemValida(dados: unknown): MensagemAba | null {
  if (!dados || typeof dados !== "object") return null;
  const d = dados as { tipo?: unknown; versao?: unknown };
  if (typeof d.versao !== "string" || !d.versao) return null;
  if (d.tipo === "atualizacao-disponivel") return { tipo: d.tipo, versao: d.versao };
  if (d.tipo === "atualizacao-dispensada") return { tipo: d.tipo, versao: d.versao };
  return null;
}

export function criarVigiaDeVersao(deps: DependenciasVigia) {
  const {
    versaoEmExecucao,
    consultarVersao,
    aoMudar,
    intervaloMs = INTERVALO_VERIFICACAO_MS,
    criarCanal = () => null,
    visivel = () => true,
    agendar = (fn, ms) => setTimeout(fn, ms),
    cancelarAgendamento = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    registrarGatilhos = () => () => {},
    lerAdiamento = () => null,
    gravarAdiamento = () => {},
  } = deps;

  let estado: EstadoAtualizacao = "ocioso";
  let versaoNotificada: string | null = null;
  let canal: CanalDeAbas | null = null;
  let emVoo = false;

  function aplicar(novo: EstadoAtualizacao, versao: string | null) {
    if (estado === novo) return;
    estado = novo;
    aoMudar(novo, versao);
  }

  function detectar(versao: string) {
    // Mesma versão já avisada (ou já adiada) não gera aviso novo: sem loop.
    if (versaoNotificada === versao) return;
    versaoNotificada = versao;
    // Adiamento anterior para ESTA versão (outra aba, ou antes de recarregar)
    // continua valendo: nunca reabrir o aviso sozinho.
    if (lerAdiamento() === versao) {
      aplicar("dispensado", versao);
      return;
    }
    aplicar("disponivel", versao);
    try {
      canal?.postMessage({ tipo: "atualizacao-disponivel", versao });
    } catch {
      /* Canal indisponível: as outras abas continuam consultando sozinhas. */
    }
  }

  async function verificar(): Promise<void> {
    if (emVoo || !visivel()) return;
    emVoo = true;
    try {
      const versaoPublicada = await consultarVersao();
      if (!versaoPublicada || versaoPublicada === versaoEmExecucao) return;
      detectar(versaoPublicada);
    } catch {
      // Mesmo que a consulta escape (rede, CORS, resposta estranha), a falha é
      // silenciosa: o operador não pode ver erro nem ter a tela bloqueada.
    } finally {
      emVoo = false;
    }
  }

  function adiar() {
    if (estado !== "disponivel" || !versaoNotificada) return;
    try {
      gravarAdiamento(versaoNotificada);
    } catch {
      /* Storage bloqueado: adiamento só nesta aba. */
    }
    aplicar("dispensado", versaoNotificada);
    try {
      canal?.postMessage({ tipo: "atualizacao-dispensada", versao: versaoNotificada });
    } catch {
      /* Sem canal: o adiamento vale só nesta aba. */
    }
  }

  /** Avisa as outras abas; usado depois de recarregar para não repetir o aviso. */
  function receber(dados: unknown) {
    const mensagem = mensagemValida(dados);
    if (!mensagem) return;
    if (mensagem.versao === versaoEmExecucao) return;
    if (mensagem.tipo === "atualizacao-disponivel") {
      if (versaoNotificada === mensagem.versao && estado !== "ocioso") return;
      versaoNotificada = mensagem.versao;
      aplicar("disponivel", mensagem.versao);
      return;
    }
    // Adiamento só vale para a versão que esta aba já conhece.
    if (mensagem.versao === versaoNotificada) aplicar("dispensado", mensagem.versao);
  }

  function iniciar(): () => void {
    try {
      canal = criarCanal();
    } catch {
      canal = null;
    }
    if (canal) {
      canal.onmessage = (evento: { data?: unknown }) => receber(evento?.data);
    }
    const cancelarGatilhos = registrarGatilhos(() => void verificar());
    let agendamento: unknown = null;
    let parado = false;
    const agendarProxima = () => {
      if (parado) return;
      agendamento = agendar(() => {
        void verificar();
        agendarProxima();
      }, intervaloMs);
    };
    agendarProxima();
    void verificar();
    return () => {
      parado = true;
      cancelarGatilhos();
      if (agendamento !== null) cancelarAgendamento(agendamento);
      try {
        canal?.close?.();
      } catch {
        /* nada a fazer */
      }
      canal = null;
    };
  }

  return {
    iniciar,
    verificar,
    adiar,
    receber,
    estado: (): EstadoAtualizacao => estado,
    versaoNotificada: (): string | null => versaoNotificada,
  };
}
