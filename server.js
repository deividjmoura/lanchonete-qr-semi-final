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
  definirEmailGoogleStaff,
  removerEmailGoogleStaff,
  listMesas,
  listarPracas,
  criarPraca,
  atualizarPraca,
  removerPraca,
  definirPracaMesa,
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
  ErroImportCardapio,
  lerCsvCardapio,
  importarCardapio,
  modeloCsv: MODELO_CSV_CARDAPIO,
} = require('./db/cardapio-import');
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
  completarSessaoPendente,
  sessaoPendenteDaRequisicao,
  destruirSessao,
  getStaffDaRequisicao,
  exigirAcesso,
  exigirSessao,
  trocarSenha,
  redefinirSenhaStaff,
  listarContasStaff,
  criarContaStaff,
  desativarContaStaff,
  homeDoPapel,
  garantirStaffSeed,
  csrfTokenParaSessao,
  verificarProtecaoCSRF,
  verificarOrigemRequisicao,
} = require('./db/auth');
const { golpePermitido } = require('./db/rateLimit');
const oauthGoogle = require('./db/oauth-google');
const { registrarEventoIndependente } = require('./db/auditoria');
const { resolveClientIp, loginUserRateLimitKey } = require('./security/client-ip');
const { ErroAtendimento, transferirMesaAdmin, listarMesasGarcom, iniciarAtendimentoGarcom, assumirMesa, listarGarconsAtivos, transferirMesa, listarPedidosProntosGarcom, resumoPagamentoSessao, deixarMesa, criarPedidoGarcom, listarPedidosAtivosMesa, listarAtendimentosGarcom, editarPedidoGarcom, metricasGarcons } = require('./db/atendimento');
const { panoramaMesas, mesaDetalhe } = require('./db/mesas-panorama');
const { normalizarChavePix, inspecionarChavePix } = require('./db/pix-normaliza');
const { subscribe, broadcast, closeAccess } = require('./db/events');
const pool = require('./db/pool');
const { comprovanteSessao, listarComprovantesRecentes, paginaComprovantes, ErroComprovante } = require('./db/comprovante');
const { getMesaPorToken } = require('./db/queries');
const { eventAccess } = require('./db/event-access');
const { emitirTicketSse, consumirTicketSse, hashCredencialSse, SSE_TICKET_TTL_MS } = require('./db/sse-tickets');
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
const { dashboardGeral } = require('./db/dashboard-geral');
const { relatorioVendas } = require('./db/relatorio');
const { purgeHistorico, ErroPurge } = require('./db/purge');
const totp = require('./db/totp');
const totpContas = require('./db/totp-contas');
const { processarUploadFoto, ErroFoto } = require('./db/foto');
const { carregarFotoProduto } = require('./db/foto-serve');
const { cancelarItem, liberarAceite } = require('./db/itens-operacoes');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
/* Importação de cardápio: 2 MB é folgado para ~2000 linhas em CSV. */
const MAX_IMPORT_CARDAPIO_BYTES = Number(process.env.CARDAPIO_CSV_MAX_BYTES || 2 * 1024 * 1024);
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

/**
 * Limita mutações públicas autenticadas pelo token opaco da mesa.
 * A chave inclui IP e token, seguindo o mesmo modelo já usado na criação
 * de pedidos. O limite é por operação para não bloquear fluxos legítimos
 * diferentes da mesma mesa.
 */
function mesaMutationPermitida(req, token, operacao, max) {
  const chave = `mesa-mut:${operacao}:${clientIp(req)}:${String(token)}`;
  return golpePermitido(chave, { janelaMs: 5 * 60 * 1000, max });
}

/** Corpo JSON de um ErroAuth; inclui `code` quando existe (ex.: SENHA_TROCA_OBRIGATORIA). */
function erroAuthJson(e) {
  return e.code ? { error: e.message, code: e.code } : { error: e.message };
}



const { compressResponse, cacheControlForStaticAsset } = require('./server/http-response');
const { requestIdDaRequisicao, linhaDeLog } = require('./server/request-context');
const { applySecurityHeaders } = require('./server/security-headers');
const { normalizarRelatoriosCsp, formatarMensagemCsp } = require('./server/csp-report');

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

    // Health check (#43): processo HTTP + conectividade do banco.
    //
    // Mudança de decisão registrada em 05/11/2026. Antes este endpoint respondia
    // 'ok' sem tocar o banco, então um banco fora do ar passava no monitoring —
    // exatamente o cenário em que o alerta precisava disparar.
    //
    // Continua read-only e barato por construção:
    //   - único comando: SELECT 1 (sem tabela, sem join, sem escrita);
    //   - statement_timeout de 1s, para não segurar conexão;
    //   - se o pool não responder em HEALTH_DB_TIMEOUT_MS, responde 503 em vez
    //     de pendurar a requisição;
    //   - nada de versão, configuração ou detalhe interno na resposta.
    if (p === '/healthz' && req.method === 'GET') {
      const timeoutMs = Number(process.env.HEALTH_DB_TIMEOUT_MS || 1000);
      let client = null;
      try {
        client = await pool.connect();
        await client.query(`SET LOCAL statement_timeout = ${Math.max(1, timeoutMs)}`);
        await client.query('SELECT 1');
        return json(res, 200, { status: 'ok', db: 'ok' });
      } catch {
        // Detalhe do erro não vai para a resposta: só para o log do processo.
        console.error(`[healthz] banco indisponível (request ${reqId})`);
        return json(res, 503, { status: 'degraded', db: 'unavailable' });
      } finally {
        if (client) client.release();
      }
    }

    // CSP reports são opt-in e só ficam ativos quando o proprietário habilitar
    // CSP_REPORT_ONLY=1 em ambiente de teste/staging. O corpo nunca é logado.
    if (p === '/api/csp-report' && req.method === 'POST') {
      if (process.env.CSP_REPORT_ONLY !== '1') {
        req.resume();
        return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
      }
      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!['application/csp-report', 'application/reports+json', 'application/json'].includes(contentType)) {
        req.resume();
        return json(res, 415, { error: 'Tipo de relatório inválido' });
      }
      let payload;
      try {
        payload = await body(req, { maxBytes: 16 * 1024 });
      } catch (e) {
        return json(res, e.status === 413 ? 413 : 400, { error: 'Relatório CSP inválido' });
      }
      const reports = normalizarRelatoriosCsp(payload);
      if (!golpePermitido(`csp-report:${clientIp(req)}`, { janelaMs: 60_000, max: 60 })) {
        return send(res, 204, 'text/plain; charset=utf-8', '');
      }
      for (const report of reports) {
        console.warn(linhaDeLog('warn', {
          reqId,
          method: 'POST',
          alvo: '/api/csp-report',
          status: 204,
          mensagem: formatarMensagemCsp(report),
        }));
      }
      return send(res, 204, 'text/plain; charset=utf-8', '');
    }

    // Login Google: o callback cria a mesma sessão persistente do login por senha.
    if (p === '/api/auth/google/status' && req.method === 'GET') {
      return json(res, 200, oauthGoogle.statusOAuth());
    }
    if (p === '/api/auth/google' && req.method === 'GET') {
      try {
        const inicio = oauthGoogle.iniciarOAuth();
        res.setHeader('Set-Cookie', inicio.cookie);
        res.writeHead(302, { Location: inicio.url, 'Cache-Control': 'no-store' });
        return res.end();
      } catch (e) {
        return json(res, e.status || 503, { error: e.message || 'Login Google indisponível.' });
      }
    }
    if (p === '/api/auth/google/callback' && req.method === 'GET') {
      const falhaGoogle = u.searchParams.get('error');
      if (falhaGoogle) {
        res.setHeader('Set-Cookie', oauthGoogle.limparCookieEstado());
        res.writeHead(302, { Location: '/#/login?google_error=access_denied', 'Cache-Control': 'no-store' });
        return res.end();
      }
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      try {
        if (!code || code.length > 4096 || !state || state.length > 256) {
          const error = new Error('Retorno do Google inválido.');
          error.status = 400;
          throw error;
        }
        const resultado = await oauthGoogle.concluirOAuth(req, code, state);
        res.setHeader('Set-Cookie', [oauthGoogle.limparCookieEstado(), cookieDeSessao(resultado.token)]);
        res.writeHead(302, { Location: resultado.home, 'Cache-Control': 'no-store' });
        return res.end();
      } catch (e) {
        console.warn(linhaDeLog('warn', { reqId, method: req.method, alvo: '/api/auth/google/callback', status: e.status || 401, mensagem: sanitizarDetalheErro(e.message || 'falha OAuth') }));
        res.setHeader('Set-Cookie', oauthGoogle.limparCookieEstado());
        res.writeHead(302, { Location: '/#/login?google_error=login_failed', 'Cache-Control': 'no-store' });
        return res.end();
      }
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

    if (p === '/api/events/ticket' && req.method === 'POST') {
      // Emissão de ticket é mutação autenticada: rejeita origem cross-site,
      // inclusive POST simples que tente abusar do cookie HttpOnly de staff.
      verificarOrigemRequisicao(req);
      const payload = await body(req, { maxBytes: 4096 });
      const staff = await getStaffDaRequisicao(req);
      let grant;
      if (staff) {
        if (staff.deveTrocarSenha) {
          return json(res, 403, {
            error: 'Troca de senha obrigatória antes de continuar.',
            code: 'SENHA_TROCA_OBRIGATORIA',
          });
        }
        const cookieToken = parseCookies(req)[SESSION_COOKIE];
        if (!cookieToken) return json(res, 401, { error: 'Sessão staff inválida' });
        grant = { tipo: 'staff', id: staff.id, credencial: cookieToken };
      } else {
        if (payload.mesa && payload.garcom) {
          return json(res, 400, { error: 'Informe apenas uma credencial de acesso SSE' });
        }
        if (payload.mesa) {
          if (typeof payload.mesa !== 'string' || payload.mesa.length > 256) {
            return json(res, 400, { error: 'Credencial de mesa inválida' });
          }
          const mesa = await getMesaPorToken(pool, payload.mesa);
          if (!mesa) return json(res, 401, { error: 'Token de mesa inválido' });
          grant = { tipo: 'mesa', id: mesa.id, credencial: payload.mesa };
        } else if (payload.garcom) {
          if (typeof payload.garcom !== 'string' || payload.garcom.length > 256) {
            return json(res, 400, { error: 'Credencial de garçom inválida' });
          }
          const garcom = await getGarcomPorToken(payload.garcom);
          if (!garcom || !garcom.ativo || garcom.removido_em) {
            return json(res, 401, { error: 'Token de garçom inválido ou inativo' });
          }
          grant = { tipo: 'garcom', id: garcom.id, credencial: payload.garcom };
        } else {
          return json(res, 401, { error: 'SSE requer sessão staff ou credencial de mesa/garçom' });
        }
      }

      if (!golpePermitido(`sse-ticket:${grant.tipo}:${grant.id}:${clientIp(req)}`, {
        janelaMs: 60 * 1000,
        max: 30,
      })) {
        return json(res, 429, { error: 'Muitas solicitações de conexão ao vivo. Aguarde e tente novamente.' });
      }
      const ticket = await emitirTicketSse({
        tipo: grant.tipo,
        recursoId: grant.id,
        credencial: grant.credencial,
      });
      return json(res, 201, { ticket, expiresInMs: SSE_TICKET_TTL_MS }, {
        'Cache-Control': 'no-store',
      });
    }

    let m;
    if (p === '/api/events' && req.method === 'GET') {
      let access = null;
      let accessIdentity = null;
      const ticket = u.searchParams.get('ticket');
      if (ticket) {
        const grant = await consumirTicketSse(ticket);
        if (!grant) return json(res, 401, { error: 'Ticket SSE expirado ou já utilizado' });

        if (grant.access_type === 'staff') {
          const staff = await getStaffDaRequisicao(req);
          const cookieToken = parseCookies(req)[SESSION_COOKIE];
          if (staff && staff.deveTrocarSenha) {
            return json(res, 403, {
              error: 'Troca de senha obrigatória antes de continuar.',
              code: 'SENHA_TROCA_OBRIGATORIA',
            });
          }
          if (!staff || Number(staff.id) !== Number(grant.resource_id) ||
              hashCredencialSse(cookieToken) !== grant.credential_hash) {
            return json(res, 401, { error: 'Sessão staff não corresponde ao ticket SSE' });
          }
          access = 'staff';
          accessIdentity = { type: 'staff', id: Number(staff.id) };
        } else if (grant.access_type === 'mesa') {
          const { rows } = await pool.query('SELECT token FROM mesas WHERE id = $1 LIMIT 1', [grant.resource_id]);
          if (!rows[0] || hashCredencialSse(rows[0].token) !== grant.credential_hash) {
            return json(res, 401, { error: 'Credencial de mesa revogada' });
          }
          access = 'public';
          accessIdentity = { type: 'mesa', id: Number(grant.resource_id) };
        } else if (grant.access_type === 'garcom') {
          const { rows } = await pool.query(
            'SELECT token, ativo, removido_em FROM garcons WHERE id = $1 LIMIT 1',
            [grant.resource_id]
          );
          if (!rows[0] || !rows[0].ativo || rows[0].removido_em ||
              hashCredencialSse(rows[0].token) !== grant.credential_hash) {
            return json(res, 401, { error: 'Credencial de garçom revogada ou inativa' });
          }
          access = 'public';
          accessIdentity = { type: 'garcom', id: Number(grant.resource_id) };
        }
      } else {
        // Compatibilidade temporária: clientes antigos ainda podem usar
        // ?mesa= ou ?garcom=. Os clientes atualizados usam tickets POST.
        //
        // Este ramo é a última superfície que ainda aceita bearer permanente
        // na URL. O aviso abaixo é a telemetria que decide quando removê-lo:
        // a janela de compatibilidade só se encerra quando este log parar de
        // aparecer. Ver docs/security/TICKETS-SSE-CURTOS-2026-11-03.md.
        if (u.searchParams.has('mesa') || u.searchParams.has('garcom')) {
          console.warn(linhaDeLog('warn', {
            reqId,
            method: req.method,
            alvo: sanitizarAlvoRequisicao(req.url),
            status: 200,
            legado_sse_fallback: true,
            mensagem: 'SSE autorizado por query legada (mesa/garcom) sem ticket de uso único',
          }));
        }
        const staff = await getStaffDaRequisicao(req);
        if (staff && staff.deveTrocarSenha) {
          return json(res, 403, {
            error: 'Troca de senha obrigatória antes de continuar.',
            code: 'SENHA_TROCA_OBRIGATORIA',
          });
        }
        access = await eventAccess(u.searchParams, {
          staff,
          findMesa: (token) => getMesaPorToken(pool, token),
          findGarcom: getGarcomPorToken,
        });
        if (staff) {
          accessIdentity = { type: 'staff', id: Number(staff.id) };
        } else if (access === 'public') {
          const mesaToken = (u.searchParams.get('mesa') || u.searchParams.get('token') || '').trim();
          const garcomToken = (u.searchParams.get('garcom') || '').trim();
          if (mesaToken) {
            const mesa = await getMesaPorToken(pool, mesaToken);
            if (mesa) accessIdentity = { type: 'mesa', id: Number(mesa.id) };
          } else if (garcomToken) {
            const garcom = await getGarcomPorToken(garcomToken);
            if (garcom) accessIdentity = { type: 'garcom', id: Number(garcom.id) };
          }
        }
      }
      if (!access) {
        return json(res, 401, { error: 'SSE requer staff autenticado ou ticket válido de mesa/garçom' });
      }

      applySecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (req.socket && typeof req.socket.setTimeout === 'function') {
        req.socket.setTimeout(0);
      }
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, at: Date.now() })}\n\n`);
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      subscribe(res, {
        publicClient: access === 'public',
        accessType: accessIdentity?.type,
        accessId: accessIdentity?.id,
      });
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
      if (!mesaMutationPermitida(req, m[1], 'checkin', 5)) {
        return json(res, 429, { error: 'Muitas tentativas de check-in. Aguarde alguns minutos.' });
      }
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
      if (!mesaMutationPermitida(req, m[1], 'pix', 6)) {
        return json(res, 429, { error: 'Muitos avisos de PIX. Aguarde alguns minutos.' });
      }
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
      if (!mesaMutationPermitida(req, m[1], 'cancelar-pedido', 5)) {
        return json(res, 429, { error: 'Muitas tentativas de cancelamento. Aguarde alguns minutos.' });
      }
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
      if (!mesaMutationPermitida(req, m[1], 'editar-pedido', 10)) {
        return json(res, 429, { error: 'Muitas tentativas de edição. Aguarde alguns minutos.' });
      }
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
          // A PWA cobra o mesmo total do caixa: consumo + serviço padrão.
          incluirServico: payload?.incluirServico === true,
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
        // #55: admin com 2FA ativo NÃO recebe sessão utilizável nesta etapa.
        // Ganha uma sessão PENDENTE (mfa_pendente = TRUE) que não abre nenhuma
        // rota; só /api/login/2fa a promove, e ela dura 5 minutos.
        if (await totpContas.exigeSegundoFator(pool, staff.id)) {
          const tokenPendente = await criarSessao(staff.id, pool, { mfaPendente: true });
          res.setHeader('Set-Cookie', cookieDeSessao(tokenPendente));
          return json(res, 200, {
            ok: false,
            mfaPendente: true,
            // Sem nome/papel: antes do segundo fator não se revela nada sobre a conta.
            csrfToken: csrfTokenParaSessao(tokenPendente),
          });
        }
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
    // ---------------------------------------------------------------- #55 2FA
    // Etapa 2 do login: consome a sessão PENDENTE (não autenticada) e só então
    // emite a sessão completa. Rate limit próprio por conta pendente.
    if (p === '/api/login/2fa' && req.method === 'POST') {
      const pendente = await sessaoPendenteDaRequisicao(req);
      if (!pendente) {
        res.setHeader('Set-Cookie', cookieDeLogout());
        return json(res, 401, {
          error: 'Verificação expirada. Entre novamente.',
          code: 'MFA_SESSAO_EXPIRADA',
        });
      }
      if (!golpePermitido(`mfa:${pendente.staff.id}`, { janelaMs: 5 * 60 * 1000, max: 5 })) {
        return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const b = await body(req);
      let resultado;
      try {
        resultado = await totpContas.verificarSegundoFator(pendente.staff.id, b && b.codigo);
      } catch (e) {
        if (e instanceof totp.ErroTotp) {
          if (e.status === 503) return json(res, 503, { error: e.message, code: e.code });
          // Segredo ilegível/chave trocada: a conta não pode entrar, mas a
          // mensagem não expõe detalhe de cripto.
          return json(res, e.status, { error: e.message, code: e.code || null });
        }
        throw e;
      }
      if (!resultado.ok) {
        return json(res, 401, {
          error: 'Código inválido. Use o código do app ou um código de recuperação.',
          code: 'MFA_CODIGO_INVALIDO',
          via: resultado.via,
        });
      }
      const token = await completarSessaoPendente(pendente.token, pendente.staff.id);
      const staff = await getStaffDaRequisicao({
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      });
      res.setHeader('Set-Cookie', cookieDeSessao(token));
      return json(res, 200, {
        ok: true,
        staff,
        home: homeDoPapel(staff.papel),
        csrfToken: csrfTokenParaSessao(token),
        via: resultado.via,
        codigosRestantes: resultado.via === 'recuperacao' ? resultado.restantes : undefined,
      });
    }
    if (p === '/api/login/2fa/cancelar' && req.method === 'POST') {
      await destruirSessao(parseCookies(req)[SESSION_COOKIE]);
      res.setHeader('Set-Cookie', cookieDeLogout());
      return json(res, 200, { ok: true });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      verificarProtecaoCSRF(req);
      const staff = await getStaffDaRequisicao(req);
      await destruirSessao(parseCookies(req)[SESSION_COOKIE]);
      if (staff) closeAccess('staff', staff.id);
      res.setHeader('Set-Cookie', cookieDeLogout());
      return json(res, 200, { ok: true });
    }
    if (p === '/api/me' && req.method === 'GET') {
      const staff = await getStaffDaRequisicao(req);
      if (!staff) return json(res, 401, { error: 'Não autenticado' });
      const sessionToken = parseCookies(req)[SESSION_COOKIE];
      return json(res, 200, { staff, home: homeDoPapel(staff.papel), csrfToken: csrfTokenParaSessao(sessionToken) });
    }

    // ---------------------------------------------------- #55 2FA (própria conta)
    if (p === '/api/me/2fa' && req.method === 'GET') {
      const staff = await exigirSessao(req);
      return json(res, 200, {
        ...(await totpContas.estadoTotp(pool, staff.id)),
        // Só é possível configurar com a chave de cifra presente no servidor.
        disponivel: Boolean(String(process.env.TOTP_ENC_KEY || '').trim()),
      });
    }

    // Passo 1 da ativação: gera o segredo e devolve o que o QR precisa.
    // NADA é gravado — quem não confirmar o código não muda o estado da conta.
    if (p === '/api/me/2fa/iniciar' && req.method === 'POST') {
      const staff = await exigirSessao(req);
      if (staff.papel !== 'admin') {
        return json(res, 403, { error: '2FA está disponível apenas para administradores.' });
      }
      if (!golpePermitido(`2fa-iniciar:${staff.id}`, { janelaMs: 10 * 60 * 1000, max: 10 })) {
        return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      let inicio;
      try {
        inicio = totp.iniciarAtivacao(staff.login);
      } catch (e) {
        if (e instanceof totp.ErroTotp) return json(res, e.status, { error: e.message, code: e.code });
        throw e;
      }
      return json(res, 200, {
        segredo: inicio.segredo,
        uri: inicio.uri,
        emissor: 'Lanchonete QR',
        digitos: totp.DIGITOS,
        periodo: totp.PASSO_SEGUNDOS,
      });
    }

    // Passo 2: confirma o código e só então liga o 2FA.
    if (p === '/api/me/2fa/ativar' && req.method === 'POST') {
      const staff = await exigirSessao(req);
      if (!golpePermitido(`2fa-ativar:${staff.id}`, { janelaMs: 10 * 60 * 1000, max: 10 })) {
        return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const b = await body(req);
      try {
        const out = await totpContas.ativarTotp(staff.id, b && b.segredo, b && b.codigo, {
          tokenSessaoAtual: parseCookies(req)[SESSION_COOKIE],
        });
        return json(res, 200, {
          ok: true,
          // Texto em claro UMA vez: só o hash fica no banco.
          codigosRecuperacao: out.codigosRecuperacao,
          sessoesRevogadas: out.sessoesRevogadas,
        });
      } catch (e) {
        if (e instanceof totp.ErroTotp) return json(res, e.status, { error: e.message, code: e.code });
        throw e;
      }
    }

    // Desativar exige a senha de novo: é o mesmo princípio de reautenticação
    // da troca de senha (o segundo fator já foi exigido no login).
    if (p === '/api/me/2fa/desativar' && req.method === 'POST') {
      const staff = await exigirSessao(req);
      if (!golpePermitido(`2fa-desativar:${staff.id}`, { janelaMs: 10 * 60 * 1000, max: 5 })) {
        return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const b = await body(req);
      try {
        await autenticar(staff.login, b && b.senha);
      } catch {
        return json(res, 403, { error: 'Senha incorreta.', code: 'SENHA_INCORRETA' });
      }
      try {
        const out = await totpContas.desativarTotp(staff.id, {
          tokenSessaoAtual: parseCookies(req)[SESSION_COOKIE],
        });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof totp.ErroTotp) return json(res, e.status, { error: e.message, code: e.code });
        throw e;
      }
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
      closeAccess('staff', staff.id);
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
          // O caixa exibe e recebe consumo + serviço padrão; o teto do backend
          // precisa usar a mesma composição para não rejeitar os 10% como excesso.
          incluirServico: true,
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

    /* Issue #48 — conta individual por funcionário.
       Substitui os logins genéricos por papel (admin/cozinha/bar/caixa), que
       tornavam impossível dizer quem lançou pagamento ou concedeu desconto.
       A senha nunca é devolvida; a conta nasce exigindo troca. */
    if (p === '/api/admin/contas' && req.method === 'POST') {
      const ator = await exigirSessao(req);
      const b = await body(req);
      const out = await criarContaStaff(
        { nome: b.nome, login: b.login, senha: b.senha, papel: b.papel },
        ator
      );
      return json(res, 201, out);
    }

    /* Desativação lógica: preserva a rastreabilidade de quem operou no passado. */
    {
      const mDesativa = p.match(/^\/api\/admin\/contas\/(\d+)\/desativar$/);
      if (mDesativa && req.method === 'POST') {
        const ator = await exigirSessao(req);
        return json(res, 200, await desativarContaStaff(Number(mDesativa[1]), ator));
      }
    }

    // Cadastro prévio do e-mail autorizado para login Google. Conta já vinculada
    // não pode trocar o e-mail por esta rota, evitando sequestro de identidade.
    if (p === '/api/admin/contas/email' && req.method === 'PUT') {
      const ator = await exigirSessao(req);
      if (ator.papel !== 'admin') return json(res, 403, { error: 'Apenas o administrador pode vincular e-mails.' });
      const b = await body(req);
      const id = Number(b && b.id);
      const email = String(b && b.email || '').trim().toLowerCase();
      if (!Number.isSafeInteger(id) || id <= 0 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(res, 400, { error: 'Informe um funcionário e um e-mail válido.' });
      }
      try {
        const staff = await definirEmailGoogleStaff(id, email, ator, reqId);
        return json(res, 200, { ok: true, staff });
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        if (e.code === '23505') return json(res, 409, { error: 'Este e-mail já está vinculado a outro funcionário.' });
        throw e;
      }
    }
    // Remove o e-mail pré-autorizado e desvincula a identidade Google, se houver.
    // exigirAcesso aplica sessão, papel, origem e CSRF; a transação revalida o admin.
    const emailGoogleStaffMatch = p.match(/^\/api\/admin\/contas\/(\d+)\/email$/);
    if (emailGoogleStaffMatch && req.method === 'DELETE') {
      const ator = await exigirAcesso(req, 'admin');
      const id = Number(emailGoogleStaffMatch[1]);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return json(res, 400, { error: 'Funcionário inválido.' });
      }
      try {
        const staff = await removerEmailGoogleStaff(id, ator, reqId);
        return json(res, 200, { ok: true, staff });
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
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
        const alvoSessao = await pool.query('SELECT id FROM staff WHERE login = $1 LIMIT 1', [r.login]);
        if (alvoSessao.rows[0]) closeAccess('staff', alvoSessao.rows[0].id);
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
        const staff = await exigirAcesso(req, 'admin');
        const out = await ativarMesas(payload.quantidade, staff, reqId);
        broadcast('update', { type: 'mesas_ativadas' });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    /* Panorama operacional: uma entrada por mesa habilitada, inclusive livres,
       com tempos reais do fluxo. Só o admin chega aqui (gate /api/admin). */
    if (p === '/api/admin/mesas/panorama' && req.method === 'GET') {
      try {
        const q = new URL(req.url, 'http://localhost').searchParams;
        return json(res, 200, await panoramaMesas({ periodo: q.get('periodo') || 'hoje' }));
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/pracas' && req.method === 'GET') {
      return json(res, 200, await listarPracas());
    }
    if (p === '/api/admin/pracas' && req.method === 'POST') {
      try {
        const payload = await body(req);
        const out = await criarPraca(payload || {});
        broadcast('update', { type: 'praca_criada', pracaId: out.id });
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/pracas\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        const out = await atualizarPraca(Number(m[1]), (await body(req)) || {});
        broadcast('update', { type: 'praca_atualizada', pracaId: out.id });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    /* Exclusão de praça: as mesas vinculadas voltam para “Sem praça”
       (ON DELETE SET NULL). Nenhuma mesa é removida — só o vínculo. */
    if ((m = p.match(/^\/api\/admin\/pracas\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        const staff = await getStaffDaRequisicao(req);
        const out = await removerPraca(Number(m[1]), staff, reqId);
        broadcast('update', { type: 'praca_removida', pracaId: out.id });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/mesas\/(\d+)\/praca$/)) && req.method === 'PUT') {
      try {
        const payload = await body(req);
        const staff = await getStaffDaRequisicao(req);
        const out = await definirPracaMesa(Number(m[1]), payload?.pracaId, staff, reqId);
        if (out.alterada) broadcast('update', { type: 'mesa_praca_alterada', mesa: out.mesa });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/mesas\/(\d+)$/)) && req.method === 'GET') {
      try {
        return json(res, 200, await mesaDetalhe(Number(m[1])));
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
        const staff = await exigirAcesso(req, 'admin');
        return json(res, 201, await criarGarcom(await body(req), staff, reqId));
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
        if (b.ativo === false) closeAccess('garcom', out.id);
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
        closeAccess('garcom', out.id);
        broadcast('update', { type: 'garcom_removido', garcomId: out.id });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/dashboard' && req.method === 'GET') {
      const q = new URL(req.url, 'http://localhost').searchParams;
      if (q.has('periodo')) return json(res, 200, await dashboardGeral({ periodo: q.get('periodo') }));
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
        const staff = await getStaffDaRequisicao(req);
        // #44: a purga ANONIMIZA (remove dados pessoais) e preserva valor,
        // forma de pagamento, data e autoria. Não existe caminho nesta rota
        // para apagar registro financeiro.
        return json(res, 200, await purgeHistorico({
          before: b.before,
          confirm: b.confirm === true,
          dryRun: b.dryRun === true,
          ator: staff,
          requestId: reqId,
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

    /* Modelo do CSV de importação (mesmo texto usado nos testes e na doc). */
    if (p === '/api/admin/cardapio/modelo.csv' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="cardapio_completo.csv"',
        'Cache-Control': 'no-store',
      });
      // BOM para o Excel abrir os acentos corretamente em pt-BR.
      return res.end('\uFEFF' + MODELO_CSV_CARDAPIO);
    }

    /* Etapa 1 da importação: só lê e valida. Nada é gravado aqui. */
    if (p === '/api/admin/cardapio/importar/previa' && req.method === 'POST') {
      try {
        const b = await body(req, { maxBytes: MAX_IMPORT_CARDAPIO_BYTES });
        return json(res, 200, lerCsvCardapio(b.csv ?? b.texto ?? ''));
      } catch (e) {
        if (e instanceof ErroImportCardapio) {
          return json(res, e.status, { error: e.message, ...e.detalhes });
        }
        if (e && e.status === 413) return json(res, 413, { error: 'Arquivo maior que 2 MB.' });
        throw e;
      }
    }

    /* Etapa 2: substitui (ou atualiza) o cardápio em uma única transação. */
    if (p === '/api/admin/cardapio/importar' && req.method === 'POST') {
      try {
        const staff = await getStaffDaRequisicao(req);
        const b = await body(req, { maxBytes: MAX_IMPORT_CARDAPIO_BYTES });
        if (b.confirmar !== true) {
          return json(res, 400, { error: 'Confirme a importação antes de substituir o cardápio.' });
        }
        const out = await importarCardapio({
          texto: b.csv ?? b.texto ?? '',
          modo: b.modo === 'atualizar' ? 'atualizar' : 'substituir',
          ator: staff,
          requestId: reqId,
        });
        invalidarCardapio();
        broadcast('update', { type: 'cardapio_importado' });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroImportCardapio) {
          return json(res, e.status, { error: e.message, ...e.detalhes });
        }
        if (e && e.status === 413) return json(res, 413, { error: 'Arquivo maior que 2 MB.' });
        throw e;
      }
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
        const staff = await exigirAcesso(req, 'admin');
        const out = await criarCategoria(await body(req), staff, reqId);
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/categorias\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        const staff = await exigirAcesso(req, 'admin');
        const out = await atualizarCategoria(Number(m[1]), await body(req), staff, reqId);
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
        const ator = await getStaffDaRequisicao(req);
        const out = await reordenarProdutos(b.categoriaId, b.ids || b.ordem || [], ator, reqId);
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/produtos' && req.method === 'POST') {
      try {
        const ator = await getStaffDaRequisicao(req);
        const out = await criarProduto(
          await body(req, { maxBytes: Number(process.env.FOTO_MAX_BODY_BYTES || 8 * 1024 * 1024) }),
          ator,
          reqId
        );
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        const ator = await getStaffDaRequisicao(req);
        const out = await atualizarProduto(
          Number(m[1]),
          await body(req, { maxBytes: Number(process.env.FOTO_MAX_BODY_BYTES || 8 * 1024 * 1024) }),
          ator,
          reqId
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
        const ator = await getStaffDaRequisicao(req);
        const out = await removerProduto(Number(m[1]), ator, reqId);
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)\/adicionais$/)) && req.method === 'POST') {
      try {
        const ator = await getStaffDaRequisicao(req);
        const out = await criarAdicional(Number(m[1]), await body(req), ator, reqId);
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/adicionais\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        const ator = await getStaffDaRequisicao(req);
        const out = await removerAdicional(Number(m[1]), ator, reqId);
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
        const ator = await getStaffDaRequisicao(req);
        const out = await setRemoviveis(Number(m[1]), b.ingredientes || b.removiveis || [], ator, reqId);
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
        return send(res, 200, 'text/html; charset=utf-8', data, {
          // Links legados podem conter o bearer do garçom em ?token=.
          'Referrer-Policy': 'no-referrer',
        });
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
