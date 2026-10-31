/** Cliente HTTP para a API Node (server.js). credentials: include para cookie de staff. */

let csrfToken: string | null = null;

/**
 * Sincronismo do token CSRF entre abas.
 *
 * `criarSessao()` sempre emite um cookie novo com `Path=/`. Como o cookie vale
 * para o domínio inteiro, um login em outra aba troca a sessão desta aba também,
 * mas o token em memória continua derivado da sessão antiga — daí o
 * "Token CSRF ausente ou inválido" em Cozinha/Bar. Avisar as outras abas evita o
 * erro na maioria dos casos; o retry abaixo cobre a corrida em que o aviso
 * ainda não chegou.
 */
const CSRF_CHANNEL = "qradmin-sessao";
type AvisoSessao = { tipo: "csrf-invalidado" };
let canalSessao: BroadcastChannel | null = null;
const ouvintesSessao = new Set<() => void>();

function canalDaSessao(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!canalSessao) {
    canalSessao = new BroadcastChannel(CSRF_CHANNEL);
    canalSessao.onmessage = (ev: MessageEvent<AvisoSessao>) => {
      if (ev?.data?.tipo !== "csrf-invalidado") return;
      // Não buscamos o token aqui: cada aba resolve no próximo envio, evitando
      // uma rajada de /api/me em todas as abas abertas.
      csrfToken = null;
      ouvintesSessao.forEach((fn) => { try { fn(); } catch { /* UI não pode quebrar o cliente HTTP */ } });
    };
  }
  return canalSessao;
}

/** Registra callback chamado quando outra aba troca a sessão. Retorna o cancelamento. */
export function aoTrocarSessao(fn: () => void): () => void {
  canalDaSessao();
  ouvintesSessao.add(fn);
  return () => { ouvintesSessao.delete(fn); };
}

function avisarTrocaDeSessao() {
  try { canalDaSessao()?.postMessage({ tipo: "csrf-invalidado" } satisfies AvisoSessao); } catch { /* aba anônima/sem suporte */ }
}

// Escuta desde o carregamento, para a aba antiga reagir mesmo sem enviar nada.
canalDaSessao();

function requiresStaffCsrf(path: string, method: string) {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  return path === "/api/logout" ||
    path === "/api/me/senha" ||
    path.startsWith("/api/admin/") ||
    path.startsWith("/api/caixa/") ||
    path.startsWith("/api/cozinha/") ||
    path.startsWith("/api/bar/") ||
    /^\/api\/pedidos\/\d+\/status$/.test(path);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || res.statusText || "Erro na API", data && data.code);
  }
  return data;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  const data: any = await parse(res);
  if (path === "/api/me" && typeof data?.csrfToken === "string") csrfToken = data.csrfToken;
  return data as T;
}

export async function apiSend<T = unknown>(
  path: string,
  method: string,
  body?: unknown
): Promise<T> {
  const upperMethod = method.toUpperCase();
  const needsCsrf = requiresStaffCsrf(path, upperMethod);
  if (needsCsrf && !csrfToken) {
    await apiGet("/api/me");
  }

  const enviar = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (needsCsrf && csrfToken) headers["X-CSRF-Token"] = csrfToken;
    return fetch(path, {
      method,
      credentials: "include",
      headers: Object.keys(headers).length ? headers : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await enviar();

  /* Token velho: outra aba entrou e o cookie de sessão mudou. O servidor
     valida o CSRF ANTES de qualquer escrita, então a chamada recusada não
     alterou nada e é seguro repeti-la uma única vez com o token atual.
     Um único retry evita laço quando o problema é outro (permissão, sessão
     revogada), e não se aplica a login/logout, que não usam o token antigo. */
  if (needsCsrf && res.status === 403 && path !== "/api/login" && path !== "/api/logout") {
    const corpo: any = await res.clone().json().catch(() => ({}));
    if (corpo?.code === "CSRF_INVALIDO") {
      const anterior = csrfToken;
      csrfToken = null;
      try {
        await apiGet("/api/me");
      } catch {
        /* sessão realmente encerrada: mantém o erro original para a tela */
      }
      if (csrfToken && csrfToken !== anterior) res = await enviar();
    }
  }

  const data: any = await parse(res);
  if ((path === "/api/login" || path === "/api/me/senha" || path === "/api/admin/contas/senha") && typeof data?.csrfToken === "string") {
    csrfToken = data.csrfToken;
    // A sessão mudou para todas as abas deste navegador.
    avisarTrocaDeSessao();
  }
  if (path === "/api/logout") {
    csrfToken = null;
    avisarTrocaDeSessao();
  }
  return data as T;
}

export const api = {
  cardapio: () => apiGet<any[]>("/api/cardapio"),
  login: (usuario: string, senha: string) =>
    apiSend<{ ok?: boolean; staff?: { papel: string; nome?: string; login?: string; deveTrocarSenha?: boolean }; home?: string; csrfToken?: string }>(
      "/api/login",
      "POST",
      { usuario, senha }
    ),
  logout: () => apiSend("/api/logout", "POST"),
  me: () =>
    apiGet<{
      staff?: { id?: number; papel?: string; nome?: string; login?: string; deveTrocarSenha?: boolean };
      home?: string;
      csrfToken?: string;
    }>("/api/me"),
  trocarSenha: (senhaAtual: string, senhaNova: string) =>
    apiSend<{ ok: boolean; csrfToken?: string; sessoesRevogadas?: number }>("/api/me/senha", "POST", { senhaAtual, senhaNova }),
  /** Contas que o admin pode redefinir (admin, cozinha, bar, caixa). */
  contasStaff: () =>
    apiGet<Array<{ id: number; nome: string; login: string; papel: string; deveTrocarSenha?: boolean }>>("/api/admin/contas"),
  /** Redefinição pelo admin: não pede a senha antiga, porque ela foi esquecida. */
  redefinirSenha: (login: string, senhaNova: string) =>
    apiSend<{ ok: boolean; login: string; papel: string; propriaConta: boolean; sessoesRevogadas?: number; csrfToken?: string | null }>(
      "/api/admin/contas/senha",
      "POST",
      { login, senhaNova }
    ),

  mesaSessao: (token: string) => apiGet<any>(`/api/mesas/${token}/sessao`),
  checkin: (token: string, clienteNome: string) =>
    apiSend(`/api/mesas/${token}/checkin`, "POST", { clienteNome }),
  criarPedido: (token: string, body: unknown) =>
    apiSend(`/api/mesas/${token}/pedidos`, "POST", body),
  cancelarPedido: (token: string, pedidoId: number) =>
    apiSend(`/api/mesas/${token}/pedidos/${pedidoId}`, "DELETE"),
  editarPedido: (token: string, pedidoId: number, body: unknown) =>
    apiSend(`/api/mesas/${token}/pedidos/${pedidoId}`, "PUT", body),
  configPix: () =>
    apiGet<{
      chave: string;
      nome: string;
      cidade: string;
      chaveValida?: boolean;
      tipoChave?: string;
      aviso?: string | null;
    }>("/api/config/pix"),
  pixInformado: (token: string, body?: unknown) =>
    apiSend(`/api/mesas/${token}/pix-informado`, "POST", body || {}),

  statusPedido: (pedidoId: number, status: string, setor?: "cozinha" | "bar") =>
    apiSend(`/api/pedidos/${pedidoId}/status`, "PATCH", { status, ...(setor ? { setor } : {}) }),

  statusItem: (setor: "cozinha" | "bar", itemId: number, status: string) =>
    apiSend(`/api/${setor}/itens/${itemId}/status`, "PATCH", { status }),
  cancelarItem: (itemId: number, motivo: string, escopo: "admin" | "caixa" = "admin") =>
    apiSend(`/api/${escopo}/itens/${itemId}/cancelar`, "POST", { motivo }),
  historicoPedido: (pedidoId: number) => apiGet<any>(`/api/admin/pedidos/${pedidoId}/historico`),
  transferirMesaAdmin: (numero: number, garcomDestinoId: number) =>
    apiSend(`/api/admin/mesas/${numero}/transferir`, "POST", { garcomDestinoId }),

  cozinhaPedidos: () => apiGet<any[]>("/api/cozinha/pedidos"),
  barPedidos: () => apiGet<any[]>("/api/bar/pedidos"),
  garcomPedidos: (token: string) => apiGet<any[]>(`/api/garcom/${token}/pedidos`),
  garcomEntregar: (token: string, pedidoId: number, itemIds?: number[], etapa?: string) =>
    apiSend(`/api/garcom/${token}/pedidos/${pedidoId}/entregar`, "POST", { ...(itemIds?.length ? { itemIds } : {}), ...(etapa ? { etapa } : {}) }),

  caixaSessoes: () => apiGet<any[]>("/api/caixa/sessoes"),
  comprovantesRecentes: () => apiGet<Array<{id:number;mesa:number;fechadaEm:string;clienteNome:string|null;total:number}>>("/api/caixa/comprovantes"),
  comprovanteSessao: (id: number) => apiGet<any>(`/api/caixa/sessoes/${id}/comprovante`),
  comprovanteSessaoAdmin: (id: number) => apiGet<any>(`/api/admin/sessoes/${id}/comprovante`),
  registrarPagamento: (sessaoId: number, valor: number, formaPagamento: string, idempotencyKey: string) =>
    apiSend(`/api/caixa/sessoes/${sessaoId}/pagamentos`, "POST", { valor, formaPagamento, idempotencyKey }),
  fecharSessao: (sessaoId: number, body?: unknown) =>
    apiSend(`/api/caixa/sessoes/${sessaoId}/fechar`, "POST", body || {}),

  mesasPublic: () => apiGet<any[]>("/api/mesas"),
  adminMesas: () => apiGet<any[]>("/api/admin/mesas"),
  adminMesasConfig: () => apiGet<{ quantidade: number; limite: number }>("/api/admin/mesas/config"),
  ativarMesas: (quantidade: number) =>
    apiSend<{ quantidade: number }>("/api/admin/mesas/ativar", "POST", { quantidade }),
  adminCardapio: () => apiGet<any[]>("/api/admin/cardapio"),
  // (duplicata removida — ver adminDashboard(params) mais abaixo, que substituía
  // esta silenciosamente em runtime; TS só acusa o conflito com checagem estrita)
  reorderCategorias: (ids: number[]) =>
    apiSend("/api/admin/categorias/ordem", "PUT", { ids }),
  reorderProdutos: (categoriaId: number, ids: number[]) =>
    apiSend("/api/admin/produtos/ordem", "PUT", { categoriaId, ids }),

  criarCategoria: (body: { nome: string; ordem?: number }) =>
    apiSend<{ id: number; nome: string; ordem: number }>("/api/admin/categorias", "POST", body),
  atualizarCategoria: (id: number, body: { nome?: string; ordem?: number }) =>
    apiSend(`/api/admin/categorias/${id}`, "PATCH", body),
  removerCategoria: (id: number) =>
    apiSend<{ ok: boolean; nome?: string; produtosRemovidos?: number }>(`/api/admin/categorias/${id}`, "DELETE"),

  criarProduto: (body: unknown) => apiSend<any>("/api/admin/produtos", "POST", body),
  atualizarProduto: (id: number, body: unknown) =>
    apiSend<any>(`/api/admin/produtos/${id}`, "PATCH", body),
  removerProdutoApi: (id: number) => apiSend(`/api/admin/produtos/${id}`, "DELETE"),

  criarAdicional: (produtoId: number, body: { nome: string; preco: number }) =>
    apiSend(`/api/admin/produtos/${produtoId}/adicionais`, "POST", body),
  removerAdicional: (id: number) => apiSend(`/api/admin/adicionais/${id}`, "DELETE"),
  setRemoviveis: (produtoId: number, ingredientes: string[]) =>
    apiSend(`/api/admin/produtos/${produtoId}/removiveis`, "PUT", { ingredientes }),

  metricasGarcons: (data?: string) =>
    apiGet<{ data: string; criterio: string; garcons: Array<{ id: number; nome: string; ativo: boolean; removido: boolean; atendimentos: number; vendas: number; ticketMedio: number }> }>(
      `/api/admin/garcons/metricas${data ? "?data=" + encodeURIComponent(data) : ""}`
    ),
    listGarcons: () =>
    apiGet<{ id: number; nome: string; token: string; ativo: boolean; criado_em?: string; entregas?: number }[]>(
      "/api/admin/garcons"
    ),
  criarGarcom: (nome: string) =>
    apiSend<{ id: number; nome: string; token: string; ativo: boolean }>("/api/admin/garcons", "POST", { nome }),
  setGarcomAtivo: (id: number, ativo: boolean) =>
    apiSend(`/api/admin/garcons/${id}`, "PATCH", { ativo }),
  removerGarcom: (id: number) => apiSend(`/api/admin/garcons/${id}`, "DELETE"),

  adminDashboard: (params?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const s = q.toString();
    return apiGet<any>(`/api/admin/dashboard${s ? `?${s}` : ""}`);
  },
  adminRelatorio: (from: string, to: string) =>
    apiGet<any>(`/api/admin/relatorio?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  adminPedidos: (from?: string, to?: string, ativos?: boolean) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (ativos) q.set("ativos", "1");
    const s = q.toString();
    return apiGet<any[]>(`/api/admin/pedidos${s ? `?${s}` : ""}`);
  },
  purgeHistorico: (body: { before: string; confirm?: boolean; dryRun?: boolean }) =>
    apiSend<any>("/api/admin/historico/purge", "POST", body),
};

/** SSE — invalida/recarrega quando o servidor emite update. */
export function connectEvents(onUpdate: () => void, acesso?: { mesa?: string; garcom?: string }): () => void {
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let failures = 0;
  const bounce = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; onUpdate(); }, 350);
  };
  const start = () => {
    if (closed || typeof EventSource === "undefined") return;
    try {
      if (es) es.close();
      const query = new URLSearchParams();
      if (acesso?.mesa) query.set("mesa", acesso.mesa);
      if (acesso?.garcom) query.set("garcom", acesso.garcom);
      const qs = query.toString();
      es = new EventSource(`/api/events${qs ? `?${qs}` : ""}`);
      es.addEventListener("hello", () => { failures = 0; bounce(); });
      es.addEventListener("update", bounce);
      es.onerror = () => {
        if (closed) return;
        if (es) es.close();
        es = null;
        failures++;
        if (reconnect) clearTimeout(reconnect);
        reconnect = setTimeout(start, Math.min(30000, 1000 * 2 ** Math.min(failures, 5)));
        bounce();
      };
    } catch { bounce(); }
  };
  start();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    if (reconnect) clearTimeout(reconnect);
    if (es) es.close();
  };
}
