require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { sanitizarAlvoRequisicao, sanitizarDetalheErro } = require('./db/log-sanitizer');

const { getCardapio, invalidarCardapio } = require('./db/cardapio');
const {
  criarPedido,
  getSessao,
  getFilaCozinha,
  getFilaBar,
  checkinCliente,
  cancelarPedidoCliente,
  editarPedidoCliente,
  setStatusItem,
  setStatusPedido,
  avancarStatusItem,
  listarHistoricoPedido,
  ErroPedido,
} = require('./db/pedidos');
const { informarPixPago, ErroPixCliente } = require('./db/pix-cliente');
const {
  ErroAdmin,
  listMesas,
  quantidadeMesasAtivas,
  ativarMesas,
  getCardapioAdmin,
  criarCategoria,
  atualizarCategoria,
  removerCategoria,
  reordenarCategorias,
  criarProduto,
  atualizarProduto,
  reordenarProdutos,
  criarAdicional,
  removerAdicional,
  setRemoviveis,
  removerProduto,
} = require('./db/admin');
const {
  listSessoesAbertas,
  fecharSessao,
  registrarPagamento,
  confirmarPixAviso,
  ErroCaixa,
} = require('./db/caixa');
const {
  SESSION_COOKIE,
  ErroAuth,
  parseCookies,
  cookieDeSessao,
  cookieDeLogout,
  autenticar,
  autorizarGerente,
  criarSessao,
  destruirSessao,
  getStaffDaRequisicao,
  exigirAcesso,
  exigirSessao,
  trocarSenha,
  redefinirSenhaStaff,
  listarContasStaff,
  homeDoPapel,
  garantirStaffSeed,
  csrfTokenParaSessao,
  verificarProtecaoCSRF,
} = require('./db/auth');
const { golpePermitido } = require('./db/rateLimit');
const { registrarEventoIndependente } = require('./db/auditoria');
const { resolveClientIp, loginUserRateLimitKey } = require('./security/client-ip');
const { ErroAtendimento, transferirMesaAdmin, listarMesasGarcom, iniciarAtendimentoGarcom, assumirMesa, listarGarconsAtivos, transferirMesa, listarPedidosProntosGarcom, resumoPagamentoSessao, deixarMesa, criarPedidoGarcom, listarPedidosAtivosMesa, listarAtendimentosGarcom, editarPedidoGarcom, metricasGarcons } = require('./db/atendimento');
const { normalizarChavePix, inspecionarChavePix } = require('./db/pix-normaliza');
const { subscribe, broadcast } = require('./db/events');
const pool = require('./db/pool');
const { comprovanteSessao, listarComprovantesRecentes, paginaComprovantes, ErroComprovante } = require('./db/comprovante');
const { getMesaPorToken } = require('./db/queries');
const { eventAccess } = require('./db/event-access');
const {
  ErroGarcom,
  listGarcons,
  criarGarcom,
  setGarcomAtivo,
  removerGarcom,
  getGarcomPorToken,
  entregarComoGarcom,
  assumirEntregaComoGarcom,
  retirarComoGarcom,
  historicoPedidoGarcom,
  listPedidosRecentes,
} = require('./db/garcons');
const { resumoDia, topProdutosHoje } = require('./db/dashboard');
const { relatorioVendas } = require('./db/relatorio');
const { purgeHistorico, ErroPurge } = require('./db/purge');
const { processarUploadFoto, ErroFoto } = require('./db/foto');
const { carregarFotoProduto } = require('./db/foto-serve');
const { cancelarItem, liberarAceite } = require('./db/itens-operacoes');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 128 * 1024);

function clientIp(req) {
  // Default is deliberately zero: X-Forwarded-For is untrusted until the
  // deployment topology and proxy append behavior have been verified.
  const configuredHops = Number(process.env.TRUSTED_PROXY_HOPS || 0);
  const trustedProxyHops = Number.isSafeInteger(configuredHops) && configuredHops > 0
    ? configuredHops
    : 0;
  // Opt-in: cabeçalho de IP único do provedor (Railway: X-Real-IP). Vazio = ignora.
  const clientIpHeader = process.env.CLIENT_IP_HEADER || '';
  return resolveClientIp(req, { trustedProxyHops, clientIpHeader });
}

/** Corpo JSON de um ErroAuth; inclui `code` quando existe (ex.: SENHA_TROCA_OBRIGATORIA). */
function erroAuthJson(e) {
  return e.code ? { error: e.message, code: e.code } : { error: e.message };
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data: blob: https:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "script-src 'self' 'unsafe-inline'",
        "connect-src 'self'",
        "frame-src 'self' blob:",
        "child-src 'self' blob:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
  }
}

const { compressResponse, cacheControlForStaticAsset } = require('./server/http-response');
const { requestIdDaRequisicao, linhaDeLog } = require('./server/request-context');

function send(res, status, type, body, extraHeaders) {
  applySecurityHeaders(res);
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  // Permite sobrescrever Cache-Control (ex.: cardápio público com max-age curto)
  if (extraHeaders && typeof extraHeaders === 'object') {
    Object.assign(headers, extraHeaders);
  } else {
    try {
      const prev = res.getHeader('Cache-Control');
      if (prev) headers['Cache-Control'] = prev;
    } catch (_) {}
  }
  const compressed = compressResponse({
    requestHeaders: res.req ? res.req.headers : {},
    status,
    contentType: type,
    body,
    headers,
  });
  res.writeHead(status, compressed.headers);
  res.end(compressed.body);
}
function json(res, status, obj, extraHeaders) {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj), extraHeaders);
}
function body(req, opts) {
  const limit = (opts && opts.maxBytes) || MAX_BODY_BYTES;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let estourou = false;
    let resolvida = false;

    req.on('data', (c) => {
      if (estourou) return; // já rejeitado: só drena o resto sem guardar
      size += c.length;
      if (size > limit) {
        /* Antes isto chamava req.destroy(): o socket morria ANTES do handler
           escrever a resposta e o cliente via "conexão resetada" em vez de
           413 — e a escrita seguinte caía num socket morto. Agora liberamos o
           corpo sem reter memória e deixamos o handler responder direito. */
        estourou = true;
        chunks.length = 0;
        resolvida = true;
        const err = new Error('Payload too large');
        err.status = 413;
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (resolvida) return;
      resolvida = true;
      try {
        const s = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(s || '{}'));
      } catch (e) {
        const err = new Error('JSON inválido');
        err.status = 400;
        reject(err);
      }
    });
    req.on('error', (e) => {
      if (resolvida) return;
      resolvida = true;
      reject(e);
    });
  });
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  // Declarado fora do try para o catch de erros conseguir correlacionar o log.
  let reqId = null;
  try {
    // Railway encerra TLS no proxy. A conexao Node interna permanece HTTP,
    // mas clientes publicos nunca devem navegar em HTTP.
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const host = String(req.headers.host || '');
    if (process.env.NODE_ENV === 'production' &&
        forwardedProto === 'http' && /^[a-z0-9.-]+(?::\\d{1,5})?$/i.test(host)) {
      res.writeHead(308, {
        Location: 'https://' + host + (req.url || '/'),
        'Cache-Control': 'no-store'
      });
      return res.end();
    }
    const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const p = u.pathname;

    // Correlação de logs (#43): toda resposta carrega o identificador da
    // requisição, inclusive erros, para o atendimento reportar com precisão.
    reqId = requestIdDaRequisicao(req);
    res.setHeader('X-Request-Id', reqId);

    // Liveness check: confirma apenas que o processo HTTP está respondendo.
    // Intencionalmente não consulta o banco nem expõe versão/configuração.
    if (p === '/healthz' && req.method === 'GET') {
      return json(res, 200, { status: 'ok' });
    }


    if (p === '/api/cardapio' && req.method === 'GET') {
      return json(res, 200, await getCardapio(), {
        'Cache-Control': 'public, max-age=15, stale-while-revalidate=60',
      });
    }
    if (p === '/api/cardapio/destaques' && req.method === 'GET') {
      const limit = Number(u.searchParams.get('limit') || 6);
      return json(res, 200, { itens: await topProdutosHoje(limit) });
    }

    // Issue #53: serve a foto do cardápio fora do JSON. É read-only, público
    // (o cardápio da mesa também é), não expõe metadados e responde 404 para
    // id inválido, produto sem foto ou representação desconhecida.
    const fotoMatch = p.match(/^\/api\/cardapio\/fotos\/(\d+)$/);
    if (fotoMatch && req.method === 'GET') {
      const foto = await carregarFotoProduto(fotoMatch[1]);
      if (!foto) return json(res, 404, { error: 'Foto não encontrada' });
      if (foto.kind === 'redirect') {
        res.writeHead(302, {
          Location: foto.location,
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        });
        return res.end();
      }
      res.writeHead(200, {
        'Content-Type': foto.contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Accept-Encoding',
      });
      return res.end(foto.buffer);
    }

    let m;
    if (p === '/api/events' && req.method === 'GET') {
      const staff = await getStaffDaRequisicao(req);
      // A sessão pode continuar válida para abrir /api/me e trocar a senha,
      // mas não deve manter acesso ao stream operacional durante a troca obrigatória.
      if (staff && staff.deveTrocarSenha) {
        return json(res, 403, {
          error: 'Troca de senha obrigatória antes de continuar.',
          code: 'SENHA_TROCA_OBRIGATORIA',
        });
      }
      const access = await eventAccess(u.searchParams, {
        staff,
        findMesa: (token) => getMesaPorToken(pool, token),
        findGarcom: getGarcomPorToken,
      });
      if (!access) {
        return json(res, 401, { error: 'SSE requer staff autenticado ou token válido de mesa/garçom' });
      }

      applySecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (req.socket && typeof req.socket.setTimeout === 'function') {
        req.socket.setTimeout(0);
      }
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, at: Date.now() })}\n\n`);
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      subscribe(res, { publicClient: access === 'public' });
      const hb = setInterval(() => {
        try {
          res.write(`: ping ${Date.now()}\n\n`);
        } catch (_) {
          clearInterval(hb);
        }
      }, 15000);
      req.on('close', () => {
        clearInterval(hb);
      });
      return;
    }

    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/pedidos$/)) && req.method === 'POST') {
      const ip = clientIp(req);
      if (!golpePermitido(`pedido:${ip}:${m[1]}`, { janelaMs: 5 * 60 * 1000, max: 10 })) {
        return json(res, 429, { error: 'Muitos pedidos em pouco tempo. Aguarde um instante.' });
      }
      try {
        const pedido = await criarPedido(m[1], await body(req), null, reqId);
        broadcast('update', { type: 'pedido_criado', pedidoId: pedido.id, mesaToken: m[1] });
        return json(res, 201, pedido);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/checkin$/)) && req.method === 'POST') {
      try {
        const out = await checkinCliente(m[1], await body(req));
        broadcast('update', { type: 'checkin', mesaToken: m[1], clienteNome: out.clienteNome });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/sessao$/)) && req.method === 'GET') {
      try {
        return json(res, 200, await getSessao(m[1]));
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/pix-informado$/)) && req.method === 'POST') {
      try {
        /* JSON malformado é erro do cliente: sem este catch voraz a rota
           executava a lógica de PIX com payload inventado ({}). */
        const payload = await body(req);
        const out = await informarPixPago(m[1], payload);
        broadcast('update', {
          type: 'pix_informado',
          mesaToken: m[1],
          sessaoId: out.sessaoId,
          avisoId: out.avisoId,
          pedidoId: out.pedidoId,
          valorAvisado: out.valorAvisado,
        });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPixCliente) return json(res, e.status, { error: e.message });
        // ErroValidacao (400) e corpo acima do limite (413) também saem como erro de cliente.
        if (e && (e.status === 400 || e.status === 413)) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/pedidos\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        const out = await cancelarPedidoCliente(m[1], Number(m[2]), null, { requestId: reqId });
        broadcast('update', { type: 'pedido_cancelado', pedidoId: Number(m[2]), mesaToken: m[1] });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/pedidos\/(\d+)$/)) && req.method === 'PUT') {
      try {
        const out = await editarPedidoCliente(m[1], Number(m[2]), await body(req));
        broadcast('update', { type: 'pedido_editado', pedidoId: Number(m[2]), mesaToken: m[1] });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/garcom/pedidos' && req.method === 'GET') {
      return json(res, 401, { error: 'Use /api/garcom/:token/pedidos com o link do garçom' });
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/me$/)) && req.method === 'GET') {
      const g = await getGarcomPorToken(m[1]);
      if (!g || !g.ativo) return json(res, 401, { error: 'Link inválido ou desativado' });
      return json(res, 200, { id: g.id, nome: g.nome });
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos$/)) && req.method === 'GET') {
      const g = await getGarcomPorToken(m[1]);
      if (!g || !g.ativo) return json(res, 401, { error: 'Link inválido ou desativado' });
      return json(res, 200, await listarPedidosProntosGarcom(m[1]));
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos\/(\d+)\/assumir-entrega$/)) && req.method === 'POST') {
      try {
        const payload = await body(req);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(res,400,{error:'Corpo de aceite inválido'});
        const out = await assumirEntregaComoGarcom(Number(m[2]), m[1], reqId, payload.itemIds ?? null);
        broadcast('update', { type: 'entrega_assumida', pedidoId: Number(m[2]), itens: out.itensAfetados, responsavelMesaId: out.responsavelMesa?.id });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        if (e && (e.status === 400 || e.status === 413)) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos\/(\d+)\/retirar$/)) && req.method === 'POST') {
      try {
        const payload=await body(req);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(res,400,{error:'Corpo de retirada inválido'});
        const out=await retirarComoGarcom(Number(m[2]),m[1],reqId,payload.itemIds??null);
        broadcast('update',{type:'itens_retirados',pedidoId:out.id,itens:out.itensAfetados});
        return json(res,200,out);
      } catch(e) {if(e.status>=400&&e.status<500)return json(res,e.status,{error:e.message});throw e;}
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos\/(\d+)\/historico$/)) && req.method === 'GET') {
      try { return json(res,200,await historicoPedidoGarcom(m[1],Number(m[2]))); }
      catch(e) { if(e instanceof ErroGarcom)return json(res,e.status,{error:e.message}); throw e; }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos\/(\d+)\/entregar$/)) && req.method === 'POST') {
      try {
        /* body(req) já devolve {} quando não há corpo; o catch voraz transformava
           JSON quebrado em "entregar tudo". Sem ele, 400 honesto. */
        const payload = await body(req);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(res,400,{error:'Corpo de entrega inválido'});
        const itemIds = payload.itemIds ?? payload.itens ?? payload.ids ?? null;
        const etapa = payload.etapa === 'entregar' ? 'entregar' : 'entrega_direta';
        const out = await entregarComoGarcom(Number(m[2]), m[1], itemIds, reqId, etapa);
        broadcast('update', {
          type: 'status_alterado',
          pedidoId: Number(m[2]),
          status: out.status,
          itensEntregues: out.itensEntregues,
          parcial: out.parcial,
          garcom: out.garcom?.nome,
        });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        if (e && (e.status === 400 || e.status === 413)) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    // Atendimento móvel: identidade pelo token individual e ativo do garçom.
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/atendimentos$/)) && req.method === 'GET') {
      try { return json(res,200,await listarAtendimentosGarcom(m[1])); }
      catch(e){ if(e instanceof ErroAtendimento)return json(res,e.status,{error:e.message});throw e; }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos\/(\d+)$/)) && req.method === 'PUT') {
      try {
        const out=await editarPedidoGarcom(m[1],m[2],await body(req),reqId);
        broadcast('update',{type:'pedido_editado',pedidoId:out.id,mesa:out.mesa});
        return json(res,200,out);
      }catch(e){
        if(e instanceof ErroAtendimento||e instanceof ErroPedido)return json(res,e.status,{error:e.message});
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/garcons-ativos$/)) && req.method === 'GET') {
      try { return json(res, 200, { garcons: await listarGarconsAtivos(m[1]) }); }
      catch (e) { if (e instanceof ErroAtendimento) return json(res, e.status, { error: e.message }); throw e; }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/mesas\/(\d+)\/transferir$/)) && req.method === 'POST') {
      try {
        const payload = await body(req);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return json(res, 400, { error: 'Corpo de transferência inválido' });
        }
        const out = await transferirMesa(m[1], m[2], payload.garcomDestinoId, reqId);
        broadcast('update', { type: 'mesa_transferida', mesa: out.mesa, de: out.de.id, para: out.para.id });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAtendimento) return json(res, e.status, { error: e.message });
        if (e && (e.status === 400 || e.status === 413)) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/sessoes\/(\d+)\/resumo-pagamento$/)) && req.method === 'GET') {
      try { return json(res, 200, await resumoPagamentoSessao(m[1], m[2])); }
      catch (e) { if (e instanceof ErroAtendimento) return json(res, e.status, { error: e.message }); throw e; }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/sessoes\/(\d+)\/pagamentos$/)) && req.method === 'POST') {
      try {
        const garcom = await getGarcomPorToken(m[1]);
        if (!garcom || !garcom.ativo) return json(res, 401, { error: 'Link do garçom inválido ou desativado' });
        const payload = await body(req);
        const out = await registrarPagamento(Number(m[2]), payload, garcom.nome, garcom.id, {
          atorTipo: 'garcom', atorId: garcom.id, requestId: reqId,
        });
        if (!out.idempotentReplay) broadcast('update', { type: 'pagamento_parcial', sessaoId: Number(m[2]) });
        return json(res, out.idempotentReplay ? 200 : 201, out);
      } catch (e) {
        if (e instanceof ErroCaixa || e instanceof ErroAtendimento) return json(res, e.status, { error: e.message });
        if (e && (e.status === 400 || e.status === 413)) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/mesas$/)) && req.method === 'GET') {
      try { return json(res, 200, await listarMesasGarcom(m[1])); }
      catch (e) { if (e instanceof ErroAtendimento) return json(res, e.status, { error: e.message }); throw e; }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/mesas\/(\d+)\/deixar$/)) && req.method === 'POST') {
      try {
        const out=await deixarMesa(m[1],m[2],reqId);
        broadcast('update',{type:'mesa_liberada',mesa:out.mesa});
        return json(res,200,out);
      }catch(e){if(e instanceof ErroAtendimento)return json(res,e.status,{error:e.message});throw e}
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/mesas\/(\d+)\/iniciar$/)) && req.method === 'POST') {
      try {
        const out = await iniciarAtendimentoGarcom(m[1], m[2], await body(req), reqId);
        broadcast('update', { type: 'mesa_iniciada', mesa: out.mesa });
        return json(res, out.idempotentReplay ? 200 : 201, out);
      } catch (e) {
        if (e instanceof ErroAtendimento) return json(res, e.status, { error: e.message });
        if (e && (e.status === 400 || e.status === 413)) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/mesas\/(\d+)\/assumir$/)) && req.method === 'POST') {
      try {
        const out = await assumirMesa(m[1], m[2], await body(req), reqId);
        broadcast('update', { type: 'mesa_assumida', mesa: out.mesa });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAtendimento) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/mesas\/(\d+)\/pedidos-ativos$/)) && req.method === 'GET') {
      try { return json(res, 200, await listarPedidosAtivosMesa(m[1], m[2])); }
      catch (e) { if (e instanceof ErroAtendimento) return json(res, e.status, { error: e.message }); throw e; }
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/mesas\/(\d+)\/pedidos$/)) && req.method === 'POST') {
      try {
        const pedido = await criarPedidoGarcom(m[1], m[2], await body(req), reqId);
        if (!pedido.idempotentReplay) broadcast('update', { type: 'pedido_novo', mesa: pedido.mesa });
        return json(res, pedido.idempotentReplay ? 200 : 201, pedido);
      } catch (e) {
        if (e instanceof ErroAtendimento || e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/login' && req.method === 'POST') {
      const ip = clientIp(req);
      // O corpo precisa ser lido antes do limite por conta; o limite por IP
      // continua protegendo inclusive tentativas sem login identificável.
      const b = await body(req);
      const loginInformado = b.usuario || b.login || b.user || '';
      // Duas chaves independentes (#50): IP protege o patrimônio geral e não
      // dispara sozinho para a equipe atrás de um NAT compartilhado; a chave
      // por conta impede varredura de senha contra um login específico.
      if (!golpePermitido(`login:${ip}`, { janelaMs: 5 * 60 * 1000, max: 8 })) {
        return json(res, 429, { error: 'Muitos tentativas. Aguarde alguns minutos.' });
      }
      if (!golpePermitido(loginUserRateLimitKey(loginInformado), { janelaMs: 5 * 60 * 1000, max: 10 })) {
        return json(res, 429, { error: 'Muitas tentativas para esta conta. Aguarde alguns minutos.' });
      }
      try {
        await garantirStaffSeed();
        const staff = await autenticar(loginInformado, b.senha);
        const token = await criarSessao(staff.id);
        res.setHeader('Set-Cookie', cookieDeSessao(token));
        return json(res, 200, {
          ok: true,
          staff,
          home: homeDoPapel(staff.papel),
          csrfToken: csrfTokenParaSessao(token),
        });
      } catch (e) {
        if (e instanceof ErroAuth) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/logout' && req.method === 'POST') {
      verificarProtecaoCSRF(req);
      await destruirSessao(parseCookies(req)[SESSION_COOKIE]);
      res.setHeader('Set-Cookie', cookieDeLogout());
      return json(res, 200, { ok: true });
    }
    if (p === '/api/me' && req.method === 'GET') {
      const staff = await getStaffDaRequisicao(req);
      if (!staff) return json(res, 401, { error: 'Não autenticado' });
      const sessionToken = parseCookies(req)[SESSION_COOKIE];
      return json(res, 200, { staff, home: homeDoPapel(staff.papel), csrfToken: csrfTokenParaSessao(sessionToken) });
    }

    if (p === '/api/me/senha' && req.method === 'POST') {
      // Troca da própria senha: sessão + origem + CSRF; reautentica com a senha atual (#55).
      const staff = await exigirSessao(req);
      const ip = clientIp(req);
      if (
        !golpePermitido(`senha:${staff.id}`, { janelaMs: 15 * 60 * 1000, max: 5 }) ||
        !golpePermitido(`senha-ip:${ip}`, { janelaMs: 15 * 60 * 1000, max: 20 })
      ) {
        return json(res, 429, { error: 'Muitas tentativas de troca de senha. Aguarde alguns minutos.' });
      }
      const b = await body(req);
      const r = await trocarSenha(staff.id, b && b.senhaAtual, b && b.senhaNova);
      res.setHeader('Set-Cookie', cookieDeSessao(r.token));
      return json(res, 200, { ok: true, csrfToken: r.csrfToken, sessoesRevogadas: r.sessoesRevogadas });
    }

    if (p === '/api/config/pix' && req.method === 'GET') {
      /* Normalização é a MESMA do front (db/pix-normaliza.js é fonte única).
         Havia uma cópia divergente aqui que reescrevia chave aleatória (EVP)
         como CPF/telefone — 1,18% das chaves saíam destruídas e o QR apontava
         para uma chave inexistente mesmo com PIX_CHAVE correta no provedor. */
      const chave = normalizarChavePix(process.env.PIX_CHAVE);
      const inspecao = inspecionarChavePix(process.env.PIX_CHAVE);
      if (!inspecao.ok) {
        console.warn(`[PIX] ${inspecao.motivo} (tipo detectado: ${inspecao.tipo})`);
      }
      let nome = String(process.env.PIX_NOME || 'LANCHONETE').trim().toUpperCase();
      nome = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      nome = nome.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 25) || 'LANCHONETE';
      let cidade = String(process.env.PIX_CIDADE || 'BRASIL').trim().toUpperCase();
      cidade = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      cidade = cidade.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 15) || 'BRASIL';
      /* `chaveValida`/`tipoChave`/`aviso` são diagnósticos para o operador:
         permitem mostrar "PIX não configurado" na tela em vez de um QR que o
         banco recusa. Campos novos — clientes antigos continuam funcionando. */
      return json(res, 200, {
        chave,
        nome,
        cidade,
        chaveValida: inspecao.ok,
        tipoChave: inspecao.tipo,
        aviso: inspecao.ok ? null : inspecao.motivo,
      });
    }

    try {
      /* Recuperação de credencial pelo admin: sessão + origem + CSRF + papel
         admin, mas sem o bloqueio operacional de troca obrigatória. É o mesmo
         princípio de /api/me/senha: quem precisa trocar a senha não pode ficar
         trancado do lado de fora da própria recuperação. O papel admin continua
         obrigatório e é revalidado dentro da transação. */
      const recuperacaoAdmin =
        (p === '/api/admin/contas' && req.method === 'GET') ||
        (p === '/api/admin/contas/senha' && req.method === 'POST');
      if (recuperacaoAdmin) {
        const staff = await exigirSessao(req);
        if (staff.papel !== 'admin') {
          throw new ErroAuth(403, 'Apenas o administrador pode redefinir senhas de outros setores.');
        }
      } else if (p.startsWith('/api/admin')) {
        await exigirAcesso(req, 'admin');
      } else if (p.startsWith('/api/caixa')) {
        await exigirAcesso(req, 'caixa');
      } else if (p.startsWith('/api/cozinha')) {
        await exigirAcesso(req, 'cozinha');
      } else if (p.startsWith('/api/bar')) {
        await exigirAcesso(req, 'bar');
      }
    } catch (e) {
      if (e instanceof ErroAuth) return json(res, e.status, erroAuthJson(e));
      throw e;
    }

    if (p === '/api/cozinha/pedidos' && req.method === 'GET') {
      return json(res, 200, await getFilaCozinha());
    }
    if (p === '/api/bar/pedidos' && req.method === 'GET') {
      return json(res, 200, await getFilaBar());
    }

    /* Avanço de status por ITEM (HTML legado cozinha/bar) */
    if ((m = p.match(/^\/api\/(cozinha|bar)\/itens\/(\d+)\/status$/)) && req.method === 'PATCH') {
      try {
        const setor = m[1];
        const staff=await getStaffDaRequisicao(req);
        const out = await setStatusItem(Number(m[2]), (await body(req)).status, setor, {tipo:'staff',id:staff.id,nome:staff.nome}, reqId);
        broadcast('update', {
          type: 'item_status',
          itemId: out.itemId,
          status: out.status,
          pedidoId: out.pedidoId,
          pedidoStatus: out.pedidoStatus,
          setor: out.setor,
        });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    /* Avanço de status do PEDIDO (React Cozinha/Bar/Admin) */
    if ((m = p.match(/^\/api\/pedidos\/(\d+)\/status$/)) && req.method === 'PATCH') {
      try {
        await exigirAcesso(req, 'cozinha'); // admin também passa (ACESSO.admin inclui cozinha)
      } catch (e) {
        // bar também pode — tenta bar se cozinha falhou com 403
        if (e instanceof ErroAuth && e.status === 403) {
          try {
            await exigirAcesso(req, 'bar');
          } catch (e2) {
            if (e2 instanceof ErroAuth) return json(res, e2.status, erroAuthJson(e2));
            throw e2;
          }
        } else if (e instanceof ErroAuth) {
          return json(res, e.status, erroAuthJson(e));
        } else {
          throw e;
        }
      }
      try {
        const payload = await body(req);
        const staff = await getStaffDaRequisicao(req);
        const papel = staff && staff.papel;
        // bar só mexe em itens do bar; cozinha só cozinha; admin mexe em tudo
        let setor = null;
        if (papel === 'bar') setor = 'bar';
        else if (papel === 'cozinha') setor = 'cozinha';
        // SPA manda setor explícito (admin na tela cozinha/bar)
        if (payload.setor === 'bar' || payload.setor === 'cozinha') {
          if (papel === 'admin' || papel === payload.setor) setor = payload.setor;
        }
        const out = await setStatusPedido(Number(m[1]), payload.status, setor, {tipo:'staff',id:staff.id,nome:staff.nome}, reqId);
        broadcast('update', {
          type: 'status_alterado',
          pedidoId: Number(m[1]),
          status: out.status,
        });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    if ((m = p.match(/^\/api\/caixa\/sessoes\/(\d+)\/comprovante$/)) && req.method === 'GET') {
      try { return json(res, 200, await comprovanteSessao(m[1])); }
      catch(e) { if(e instanceof ErroComprovante) return json(res,e.status,{error:e.message}); throw e; }
    }
    if ((m = p.match(/^\/api\/admin\/sessoes\/(\d+)\/comprovante$/)) && req.method === 'GET') {
      try { return json(res, 200, await comprovanteSessao(m[1])); }
      catch(e) { if(e instanceof ErroComprovante) return json(res,e.status,{error:e.message}); throw e; }
    }
    if (p === '/api/caixa/comprovantes' && req.method === 'GET') {
      const q = u.searchParams;
      if (q.get('paginado') === '1') {
        return json(res, 200, await paginaComprovantes({ limite: q.get('limit'), cursor: q.get('cursor') }));
      }
      return json(res, 200, await listarComprovantesRecentes());
    }
    if (p === '/api/caixa/sessoes' && req.method === 'GET') {
      return json(res, 200, await listSessoesAbertas());
    }
    if ((m = p.match(/^\/api\/caixa\/sessoes\/(\d+)\/pagamentos$/)) && req.method === 'POST') {
      try {
        const operador = await getStaffDaRequisicao(req);
        const out = await registrarPagamento(Number(m[1]), await body(req), operador?.nome || null, null, {
          atorTipo: 'staff', atorId: Number.isInteger(operador?.id) ? operador.id : null, requestId: reqId,
        });
        if (!out.idempotentReplay) broadcast('update', { type: 'pagamento_parcial', sessaoId: Number(m[1]) });
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroCaixa) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/caixa\/sessoes\/(\d+)\/pix-avisos\/(\d+)\/confirmar$/)) && req.method === 'POST') {
      try {
        const operador = await getStaffDaRequisicao(req);
        const out = await confirmarPixAviso(
          Number(m[1]), Number(m[2]), operador?.nome || null, {
            atorTipo: 'staff', atorId: Number.isInteger(operador?.id) ? operador.id : null, requestId: reqId,
          }
        );
        broadcast('update', {
          type: 'pix_confirmado',
          sessaoId: Number(m[1]),
          avisoId: Number(m[2]),
        });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroCaixa) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/caixa\/sessoes\/(\d+)\/fechar$/)) && req.method === 'POST') {
      try {
        const operador = await getStaffDaRequisicao(req);
        const dados = await body(req);
        // Issue #48: desconto ou ajuste/remoção da taxa de serviço exige
        // gerente (admin) reautenticado neste aparelho. A credencial é
        // validada aqui e a autorização é repassada; o banco mantém a
        // trava final dentro da transação do fechamento.
        const motivoTaxa = String(dados?.taxaServicoMotivo ?? dados?.motivoTaxaServico ?? '').trim();
        let autorizacaoGerente = null;
        if (Number(dados?.desconto) > 0 || motivoTaxa.length > 0) {
          if (!golpePermitido(`gerente:${clientIp(req)}`, { janelaMs: 5 * 60 * 1000, max: 10 })) {
            return json(res, 429, { error: 'Muitas tentativas de autorização do gerente. Aguarde alguns minutos.' });
          }
          const gerente = await autorizarGerente(dados?.gerenteLogin, dados?.gerenteSenha);
          if (!gerente) {
            try {
              await registrarEventoIndependente({
                atorTipo: 'staff',
                atorId: Number.isInteger(operador?.id) ? operador.id : null,
                atorNome: operador?.nome || null,
                acao: 'gerente_autorizacao_negada',
                alvoTipo: 'sessao',
                alvoId: String(Number(m[1])),
                resultado: 'negado',
                contexto: { operacao: 'fechar_sessao' },
                requestId: reqId,
              });
            } catch (_) {
              // Auditoria não pode mascarar a negação da autorização.
            }
            return json(res, 403, {
              error: 'Autorização do gerente inválida. Confira o login e a senha do gerente.',
              code: 'GERENTE_NAO_AUTORIZADO',
            });
          }
          autorizacaoGerente = { id: gerente.id, nome: gerente.nome };
        }
        const out = await fecharSessao(Number(m[1]), dados, operador?.nome || null, {
          atorTipo: 'staff', atorId: Number.isInteger(operador?.id) ? operador.id : null, requestId: reqId,
          autorizacaoGerente,
        });
        broadcast('update', { type: 'sessao_fechada', sessaoId: Number(m[1]) });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroCaixa) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    if (p === '/api/mesas' && req.method === 'GET') {
      try {
        await exigirAcesso(req, 'admin');
        const rows = await listMesas();
        return json(res, 200, rows.map((m) => ({
          id: m.id,
          numero: m.numero,
          token: m.token,
          status: m.status,
          sessaoAberta: m.sessaoAberta,
        })));
      } catch (e) {
        if (e instanceof ErroAuth) return json(res, e.status, erroAuthJson(e));
        throw e;
      }
    }
    if ((m=p.match(/^\/api\/admin\/mesas\/(\d+)\/transferir$/)) && req.method==='POST') {
      try {
        const payload=await body(req);
        const staff=await getStaffDaRequisicao(req);
        const out=await transferirMesaAdmin(staff,Number(m[1]),payload?.garcomDestinoId,reqId);
        broadcast('update',{type:'mesa_transferida',mesa:out.mesa,para:out.garcomResponsavelId});
        return json(res,200,out);
      } catch(e) { if(e instanceof ErroAtendimento)return json(res,e.status,{error:e.message}); throw e; }
    }
    if ((m=p.match(/^\/api\/admin\/pedidos\/(\d+)\/historico$/)) && req.method==='GET') {
      return json(res,200,{pedidoId:Number(m[1]),itens:await listarHistoricoPedido(pool,Number(m[1]))});
    }
    if ((m=p.match(/^\/api\/admin\/itens\/(\d+)\/liberar-aceite$/)) && req.method==='POST') {
      try {
        const staff=await getStaffDaRequisicao(req);
        const out=await liberarAceite(Number(m[1]),{tipo:'staff',id:staff.id,nome:staff.nome},reqId);
        broadcast('update',{type:'item_status',itemId:out.itemId,pedidoId:out.pedidoId,status:out.status});
        return json(res,200,out);
      } catch(e) { if(e.status>=400&&e.status<500)return json(res,e.status,{error:e.message}); throw e; }
    }
    if ((m=p.match(/^\/api\/(admin|caixa)\/itens\/(\d+)\/cancelar$/)) && req.method==='POST') {
      try {
        const payload=await body(req);
        const staff=await getStaffDaRequisicao(req);
        const out=await cancelarItem(Number(m[2]),{tipo:'staff',id:staff.id,nome:staff.nome},payload?.motivo,reqId);
        if(!out.idempotentReplay)broadcast('update',{type:'item_cancelado',itemId:out.itemId,pedidoId:out.pedidoId,status:out.status});
        return json(res,200,out);
      } catch(e) { if(e.status>=400&&e.status<500)return json(res,e.status,{error:e.message}); throw e; }
    }
    if (p === '/api/admin/garcons/metricas' && req.method === 'GET') {
      try { return json(res, 200, await metricasGarcons({ data: u.searchParams.get('data') })); }
      catch (e) { if (e instanceof ErroAtendimento) return json(res, e.status, { error: e.message }); throw e; }
    }
    /* Contas que o admin pode ter como alvo na redefinição de senha.
       O gate de recuperação acima já exigiu sessão + origem + CSRF + papel
       admin, sem bloquear a própria recuperação por troca obrigatória. */
    if (p === '/api/admin/contas' && req.method === 'GET') {
      return json(res, 200, await listarContasStaff());
    }
    /* Redefinição de senha de qualquer setor, sem exigir a senha antiga
       (o caso de uso é justamente a senha esquecida). A autorização é o papel
       admin, revalidado dentro da transação em redefinirSenhaStaff(). */
    if (p === '/api/admin/contas/senha' && req.method === 'POST') {
      const ator = await getStaffDaRequisicao(req);
      if (!ator) return json(res, 401, { error: 'Não autenticado' });
      const ip = clientIp(req);
      if (
        !golpePermitido(`reset-senha:${ator.id}`, { janelaMs: 15 * 60 * 1000, max: 10 }) ||
        !golpePermitido(`reset-senha-ip:${ip}`, { janelaMs: 15 * 60 * 1000, max: 30 })
      ) {
        return json(res, 429, { error: 'Muitas redefinições de senha. Aguarde alguns minutos.' });
      }
      try {
        const b = await body(req);
        const r = await redefinirSenhaStaff(
          ator.id,
          b && b.login,
          b && b.senhaNova,
          parseCookies(req)[SESSION_COOKIE]
        );
        // A própria conta do admin teve as sessões revogadas: rotaciona o cookie
        // para ele não perder o acesso logo após redefinir a própria senha.
        if (r.propriaConta && r.token) res.setHeader('Set-Cookie', cookieDeSessao(r.token));
        return json(res, 200, {
          ok: true,
          login: r.login,
          papel: r.papel,
          propriaConta: r.propriaConta,
          sessoesRevogadas: r.sessoesRevogadas,
          csrfToken: r.csrfToken,
        });
      } catch (e) {
        if (e instanceof ErroAuth) return json(res, e.status, erroAuthJson(e));
        throw e;
      }
    }
    if (p === '/api/admin/mesas' && req.method === 'GET') {
      return json(res, 200, await listMesas());
    }
    if (p === '/api/admin/mesas/config' && req.method === 'GET') {
      return json(res, 200, { quantidade: await quantidadeMesasAtivas(), limite: 70 });
    }
    if (p === '/api/admin/mesas/ativar' && req.method === 'POST') {
      try {
        const payload = await body(req);
        const out = await ativarMesas(payload.quantidade);
        broadcast('update', { type: 'mesas_ativadas' });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/garcons' && req.method === 'GET') {
      return json(res, 200, await listGarcons());
    }
    if (p === '/api/admin/garcons' && req.method === 'POST') {
      try {
        return json(res, 201, await criarGarcom(await body(req)));
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/garcons\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        const b = await body(req);
        const staff = await exigirAcesso(req, 'admin');
        const out = await setGarcomAtivo(Number(m[1]), b.ativo !== false, staff, reqId);
        broadcast('update', { type: 'garcom_atualizado', garcomId: out.id });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/garcons\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        const staff = await exigirAcesso(req, 'admin');
        const out = await removerGarcom(Number(m[1]), staff, reqId);
        broadcast('update', { type: 'garcom_removido', garcomId: out.id });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/dashboard' && req.method === 'GET') {
      const q = new URL(req.url, 'http://localhost').searchParams;
      return json(res, 200, await resumoDia({ from: q.get('from') || null, to: q.get('to') || null }));
    }
    if (p === '/api/admin/relatorio' && req.method === 'GET') {
      try {
        const q = new URL(req.url, 'http://localhost').searchParams;
        return json(res, 200, await relatorioVendas({ from: q.get('from'), to: q.get('to') }));
      } catch (e) {
        console.error('[api/admin/relatorio]', e && e.stack ? e.stack : e);
        const status = (e && e.status) || 500;
        return json(res, status, { error: (e && e.message) || 'Erro interno no relatório' });
      }
    }
    if (p === '/api/admin/historico/purge' && req.method === 'POST') {
      try {
        const b = await body(req);
        return json(res, 200, await purgeHistorico({
          before: b.before,
          confirm: b.confirm === true,
          dryRun: b.dryRun === true,
        }));
      } catch (e) {
        if (e instanceof ErroPurge || e.status) return json(res, e.status || 400, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/pedidos' && req.method === 'GET') {
      const q = new URL(req.url, 'http://localhost').searchParams;
      const ativos = q.get('ativos') === '1' || q.get('ativos') === 'true';
      const paginado = q.get('paginado') === '1';
      return json(res, 200, await listPedidosRecentes({
        limit: paginado ? q.get('limit') : (Number(q.get('limit')) || (ativos ? 100 : 80)),
        ativos,
        from: q.get('from') || null,
        to: q.get('to') || null,
        paginado,
        cursor: paginado ? q.get('cursor') : null,
      }));
    }
    if (p === '/api/admin/cardapio' && req.method === 'GET') {
      return json(res, 200, await getCardapioAdmin());
    }

    if (p === '/api/admin/upload-foto' && req.method === 'POST') {
      try {
        const b = await body(req, { maxBytes: Number(process.env.FOTO_MAX_BODY_BYTES || 8 * 1024 * 1024) });
        const out = await processarUploadFoto(b);
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroFoto || e.status) {
          return json(res, e.status || 400, { error: e.message });
        }
        throw e;
      }
    }
    if (p === '/api/admin/categorias' && req.method === 'POST') {
      try {
        const out = await criarCategoria(await body(req));
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/categorias\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        const out = await atualizarCategoria(Number(m[1]), await body(req));
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    if ((m = p.match(/^\/api\/admin\/categorias\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        const out = await removerCategoria(Number(m[1]));
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    if (p === '/api/admin/categorias/ordem' && req.method === 'PUT') {
      try {
        const b = await body(req);
        const out = await reordenarCategorias(b.ids || b.ordem || []);
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/produtos/ordem' && req.method === 'PUT') {
      try {
        const b = await body(req);
        const out = await reordenarProdutos(b.categoriaId, b.ids || b.ordem || []);
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/produtos' && req.method === 'POST') {
      try {
        const out = await criarProduto(await body(req, { maxBytes: Number(process.env.FOTO_MAX_BODY_BYTES || 8 * 1024 * 1024) }));
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        const out = await atualizarProduto(
          Number(m[1]),
          await body(req, { maxBytes: Number(process.env.FOTO_MAX_BODY_BYTES || 8 * 1024 * 1024) })
        );
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        const out = await removerProduto(Number(m[1]));
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)\/adicionais$/)) && req.method === 'POST') {
      try {
        const out = await criarAdicional(Number(m[1]), await body(req));
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/adicionais\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        const out = await removerAdicional(Number(m[1]));
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)\/removiveis$/)) && req.method === 'PUT') {
      try {
        const b = await body(req);
        const out = await setRemoviveis(Number(m[1]), b.ingredientes || b.removiveis || []);
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    /* ---- UI: SPA React (dist/) se existir; senão HTML legado em public/ ---- */
    const spaIndexPath = path.join(ROOT, 'dist', 'index.html');
    const hasSpa = fs.existsSync(spaIndexPath);

    const hashHome = (papel) => {
      if (papel === 'cozinha') return '/#/cozinha';
      if (papel === 'caixa') return '/#/caixa';
      if (papel === 'bar') return '/#/bar';
      return '/#/admin';
    };

    /* caminhos legados sem hash → redireciona para o router hash do React */
    if (hasSpa) {
      if (p === '/login') {
        res.writeHead(302, { Location: '/#/login' });
        return res.end();
      }
      if (p === '/cozinha') {
        res.writeHead(302, { Location: '/#/cozinha' });
        return res.end();
      }
      if (p === '/bar') {
        res.writeHead(302, { Location: '/#/bar' });
        return res.end();
      }
      if (p === '/caixa') {
        res.writeHead(302, { Location: '/#/caixa' });
        return res.end();
      }
      if (p === '/admin') {
        res.writeHead(302, { Location: '/#/admin' });
        return res.end();
      }
      if (p.startsWith('/mesa/')) {
        const token = p.slice('/mesa/'.length).split('/')[0];
        res.writeHead(302, { Location: '/#/mesa/' + encodeURIComponent(token) });
        return res.end();
      }
      if (p === '/garcom' || /^\/garcom\/[0-9a-f-]{36}$/i.test(p)) {
        const token = p.startsWith('/garcom/') ? p.slice('/garcom/'.length) : '';
        res.writeHead(302, { Location: token ? '/#/garcom/' + encodeURIComponent(token) : '/#/' });
        return res.end();
      }
      /* HTMLs legados continuam acessíveis direto por arquivo; com a SPA ativa
         eles são versões antigas SEM o seletor de tema — redireciona para a
         rota equivalente do React e evita relato de "tema não funciona". */
      const legacyParaSpa = {
        '/admin.html': '/#/admin',
        '/cozinha.html': '/#/cozinha',
        '/bar.html': '/#/bar',
        '/caixa.html': '/#/caixa',
        '/login.html': '/#/login',
        '/garcom.html': '/#/',
        '/mesa.html': '/#/',
        '/pedido.html': '/#/',
        '/index.html': '/',
      };
      if (legacyParaSpa[p]) {
        res.writeHead(302, { Location: legacyParaSpa[p] });
        return res.end();
      }
      /* GET / sempre serve o index — o hash (#/admin) NÃO vai ao servidor.
         Redirecionar / → /#/admin causaria loop infinito. */
      if (p === '/') {
        try {
          const data = await fs.promises.readFile(spaIndexPath);
          return send(res, 200, 'text/html; charset=utf-8', data);
        } catch {
          /* fall through to legacy */
        }
      }
    }

    /* auth de páginas legadas (só quando NÃO há SPA) */
    if (!hasSpa && (p === '/admin' || p === '/caixa' || p === '/cozinha')) {
      const recurso = p.slice(1);
      try {
        await exigirAcesso(req, recurso);
      } catch (e) {
        if (e instanceof ErroAuth && e.status === 401) {
          res.writeHead(302, { Location: `/login?next=${encodeURIComponent(p)}` });
          return res.end();
        }
        if (e instanceof ErroAuth && e.status === 403) {
          const staff = await getStaffDaRequisicao(req);
          const dest = staff ? homeDoPapel(staff.papel) : '/login';
          res.writeHead(302, { Location: dest });
          return res.end();
        }
        throw e;
      }
    }
    if (!hasSpa && p === '/') {
      const staff = await getStaffDaRequisicao(req);
      res.writeHead(302, { Location: staff ? homeDoPapel(staff.papel) : '/login' });
      return res.end();
    }

    /*
     * Fotos locais do cardápio: sirva diretamente de public/ antes do fallback da SPA.
     * Isso evita que uma publicação com build parcial/antigo deixe os caminhos
     * /assets/demo/*.webp sem imagem, mesmo que o HTML do cardápio esteja acessível.
     * O nome do arquivo é allowlisted para impedir traversal e extensões arbitrárias.
     */
    const demoAssetMatch = p.match(/^\/assets\/demo\/([a-z0-9][a-z0-9._-]*\.(?:webp|jpe?g|png))$/i);
    if (demoAssetMatch) {
      const demoRoot = path.resolve(ROOT, 'public', 'assets', 'demo');
      const demoPath = path.resolve(demoRoot, demoAssetMatch[1]);
      if (demoPath.startsWith(demoRoot + path.sep)) {
        try {
          const data = await fs.promises.readFile(demoPath);
          return send(res, 200, mime[path.extname(demoPath).toLowerCase()] || 'application/octet-stream', data, {
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          });
        } catch (_) {
          // Deixa a rota de assets do build tentar servir o arquivo, se houver.
        }
      }
    }

    /* assets da SPA (se build multi-file no futuro) */
    if (hasSpa && (p.startsWith('/assets/') || p === '/index.html')) {
      const distRoot = path.resolve(ROOT, 'dist');
      const fp = path.resolve(distRoot, '.' + (p === '/index.html' ? '/index.html' : p));
      if (fp.startsWith(distRoot + path.sep) || fp === path.join(distRoot, 'index.html')) {
        try {
          const data = await fs.promises.readFile(fp);
          return send(res, 200, mime[path.extname(fp)] || 'application/octet-stream', data, {
            'Cache-Control': cacheControlForStaticAsset(p),
          });
        } catch (_) {}
      }
    }

    // O shell instalável do garçom vive em /public/garcom-pwa/.
    // Sem esta exceção o fallback SPA captura /garcom-pwa/ e entrega o React principal.
    if (p === '/garcom-pwa' || p === '/garcom-pwa/') {
      try {
        const data = await fs.promises.readFile(path.join(ROOT, 'public', 'garcom-pwa', 'index.html'));
        return send(res, 200, 'text/html; charset=utf-8', data);
      } catch (_) {
        return send(res, 404, 'text/plain', 'PWA indisponível');
      }
    }

    /* GET / com SPA já tratado; qualquer path sem extensão → index SPA (deep link) */
    if (hasSpa && !path.extname(p) && !p.startsWith('/api')) {
      try {
        const data = await fs.promises.readFile(spaIndexPath);
        return send(res, 200, 'text/html; charset=utf-8', data);
      } catch (_) {}
    }

    let file = p;
    if (!hasSpa) {
      if (file.startsWith('/mesa/')) file = '/mesa.html';
      if (file.startsWith('/pedido/')) file = '/pedido.html';
      if (file === '/cozinha') file = '/cozinha.html';
      if (file === '/garcom' || /^\/garcom\/[0-9a-f-]{36}$/i.test(file)) file = '/garcom.html';
      if (file === '/caixa') file = '/caixa.html';
      if (file === '/admin') file = '/admin.html';
      if (file === '/login') file = '/login.html';
    }
    const publicRoot = path.resolve(ROOT, 'public');
    const fp = path.resolve(publicRoot, '.' + (file.startsWith('/') ? file : '/' + file));
    if (!fp.startsWith(publicRoot + path.sep) && fp !== publicRoot) {
      return send(res, 400, 'text/plain', 'Bad path');
    }
    try {
      const data = await fs.promises.readFile(fp);
      return send(res, 200, mime[path.extname(fp)] || 'application/octet-stream', data);
    } catch {
      return send(res, 404, 'text/plain', '404');
    }
  } catch (e) {
    /* 4xx é erro do cliente (JSON malformado, corpo grande demais, validação):
       não merece stack trace no log — em produção isso polui o log do provedor
       e dispara alerta de erro para algo que é comportamento esperado.
       ATENÇÃO: `p` (u.pathname) é declarado DENTRO do try; aqui só existe
       req.url, e usá-lo sem esse cuidado derruba o processo. */
    if (e && e.status && e.status >= 400 && e.status < 500) {
      console.warn(linhaDeLog('warn', {
        reqId,
        method: req.method,
        alvo: sanitizarAlvoRequisicao(req.url),
        status: e.status,
        mensagem: sanitizarDetalheErro(e.message || 'rejeitado'),
      }));
      return json(res, e.status, e.code ? { error: e.message || 'Erro', code: e.code } : { error: e.message || 'Erro' });
    }
    console.error(linhaDeLog('error', {
      reqId,
      method: req.method,
      alvo: sanitizarAlvoRequisicao(req.url),
      status: (e && e.status) || 500,
      mensagem: sanitizarDetalheErro(e),
    }));
    if (e && e.status) {
      return json(res, e.status, { error: e.message || 'Erro' });
    }
    const msg =
      process.env.NODE_ENV === 'production'
        ? 'Erro interno do servidor'
        : (e && e.message) || 'Erro interno';
    json(res, 500, { error: msg });
  }
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🍔 Lanchonete QR V2: http://0.0.0.0:${PORT}`);
  // Auto-migrate best-effort: aplica migrations pendentes na inicialização
  // (idempotente — já aplicadas são puladas). Nunca derruba o servidor.
  try {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [require('path').join(__dirname, 'db', 'migrate.js')], {
      encoding: 'utf8',
      timeout: 30000,
    });
    if (r.status === 0) {
      console.log('🧬 Migrations verificadas/aplicadas na inicialização.');
    } else {
      console.warn('⚠️ Auto-migrate pulado:', String(r.stderr || r.stdout || '').slice(0, 200));
    }
  } catch (e) {
    console.warn('⚠️ Auto-migrate indisponível:', (e && e.message) || e);
  }
  try {
    const seed = await garantirStaffSeed();
    if (seed.created) {
      console.log('Staff inicial criado (admin / cozinha / caixa). Troque as senhas em produção.');
    }
  } catch (e) {
    console.error('Aviso: não foi possível garantir seed de staff:', e.message || e);
  }
});
