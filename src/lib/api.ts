/** Cliente HTTP para a API Node (server.js). credentials: include para cookie de staff. */

let csrfToken: string | null = null;

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

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (needsCsrf && csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: Object.keys(headers).length ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data: any = await parse(res);
  if ((path === "/api/login" || path === "/api/me/senha") && typeof data?.csrfToken === "string") csrfToken = data.csrfToken;
  if (path === "/api/logout") csrfToken = null;
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

  cozinhaPedidos: () => apiGet<any[]>("/api/cozinha/pedidos"),
  barPedidos: () => apiGet<any[]>("/api/bar/pedidos"),
  garcomPedidos: (token: string) => apiGet<any[]>(`/api/garcom/${token}/pedidos`),
  garcomEntregar: (token: string, pedidoId: number, itemIds?: number[]) =>
    apiSend(`/api/garcom/${token}/pedidos/${pedidoId}/entregar`, "POST", itemIds?.length ? { itemIds } : {}),

  caixaSessoes: () => apiGet<any[]>("/api/caixa/sessoes"),
  comprovantesRecentes: () => apiGet<Array<{id:number;mesa:number;fechadaEm:string;clienteNome:string|null;total:number}>>("/api/caixa/comprovantes"),
  comprovanteSessao: (id: number) => apiGet<any>(`/api/caixa/sessoes/${id}/comprovante`),
  comprovanteSessaoAdmin: (id: number) => apiGet<any>(`/api/admin/sessoes/${id}/comprovante`),
  registrarPagamento: (sessaoId: number, valor: number, formaPagamento: string) =>
    apiSend(`/api/caixa/sessoes/${sessaoId}/pagamentos`, "POST", { valor, formaPagamento }),
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
    apiGet<{ data: string; criterio: string; garcons: Array<{ id: number; nome: string; ativo: boolean; atendimentos: number; vendas: number; ticketMedio: number }> }>(
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
  const bounce = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onUpdate(), 350);
  };
  try {
    const query = new URLSearchParams();
    if (acesso?.mesa) query.set("mesa", acesso.mesa);
    if (acesso?.garcom) query.set("garcom", acesso.garcom);
    es = new EventSource(`/api/events${query.size ? `?${query}` : ""}`);
    es.addEventListener("update", bounce);
    es.onerror = () => {
      /* browser reconecta sozinho */
    };
  } catch (_) {
    /* ignore */
  }
  return () => {
    if (timer) clearTimeout(timer);
    if (es) es.close();
  };
}
