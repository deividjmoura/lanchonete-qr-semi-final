require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const { getCardapio, invalidarCardapio } = require('./db/cardapio');
const {
  criarPedido,
  getSessao,
  getFilaCozinha,
  getFilaBar,
  getFilaGarcom,
  checkinCliente,
  cancelarPedidoCliente,
  editarPedidoCliente,
  setStatusItem,
  setStatusPedido,
  avancarStatusItem,
  ErroPedido,
} = require('./db/pedidos');
const { informarPixPago, ErroPixCliente } = require('./db/pix-cliente');
const {
  ErroAdmin,
  listMesas,
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
  criarSessao,
  destruirSessao,
  getStaffDaRequisicao,
  exigirAcesso,
  homeDoPapel,
  garantirStaffSeed,
} = require('./db/auth');
const { golpePermitido } = require('./db/rateLimit');
const { subscribe, broadcast } = require('./db/events');
const pool = require('./db/pool');
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
  listPedidosRecentes,
} = require('./db/garcons');
const { resumoDia, topProdutosHoje } = require('./db/dashboard');
const { relatorioVendas } = require('./db/relatorio');
const { purgeHistorico, ErroPurge } = require('./db/purge');
const { processarUploadFoto, ErroFoto } = require('./db/foto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 128 * 1024);

function clientIp(req) {
  if (process.env.NODE_ENV === 'production') {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) {
      return xff.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    }
  }
  return req.socket.remoteAddress || 'unknown';
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

function send(res, status, type, body, extraHeaders) {
  applySecurityHeaders(res);
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (extraHeaders && typeof extraHeaders === 'object') {
    Object.assign(headers, extraHeaders);
  } else {
    try {
      const prev = res.getHeader('Cache-Control');
      if (prev) headers['Cache-Control'] = prev;
    } catch (_) {}
  }
  res.writeHead(status, headers);
  res.end(body);
}
function json(res, status, obj, extraHeaders) {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj), extraHeaders);
}
function body(req, opts) {
  const limit = (opts && opts.maxBytes) || MAX_BODY_BYTES;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        const err = new Error('Payload too large');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const s = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(s || '{}'));
      } catch (e) {
        const err = new Error('JSON inválido');
        err.status = 400;
        reject(err);
      }
    });
    req.on('error', reject);
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
};

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const p = u.pathname;

    if (p === '/api/cardapio' && req.method === 'GET') {
      return json(res, 200, await getCardapio(), {
        'Cache-Control': 'public, max-age=15, stale-while-revalidate=60',
      });
    }
    if (p === '/api/cardapio/destaques' && req.method === 'GET') {
      const limit = Number(u.searchParams.get('limit') || 6);
      return json(res, 200, { itens: await topProdutosHoje(limit) });
    }

    let m;
    if (p === '/api/events' && req.method === 'GET') {
      const access = await eventAccess(u.searchParams, {
        staff: await getStaffDaRequisicao(req),
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
        const pedido = await criarPedido(m[1], await body(req));
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
        if (e && e.status === 413) return json(res, 413, { error: e.message });
        if (e && e.status === 400) return json(res, 400, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/pedidos\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        const out = await cancelarPedidoCliente(m[1], Number(m[2]));
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
      return json(res, 200, await getFilaGarcom());
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos\/(\d+)\/entregar$/)) && req.method === 'POST') {
      try {
        const payload = await body(req).catch(() => ({}));
        const itemIds = payload && (payload.itemIds || payload.itens || payload.ids);
        const out = await entregarComoGarcom(Number(m[2]), m[1], itemIds || null);
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
        throw e;
      }
    }

    if (p === '/api/login' && req.method === 'POST') {
      const ip = clientIp(req);
      if (!golpePermitido(`login:${ip}`, { janelaMs: 5 * 60 * 1000, max: 8 })) {
        return json(res, 429, { error: 'Muitos tentativas. Aguarde alguns minutos.' });
      }
      try {
        await garantirStaffSeed();
        const b = await body(req);
        const staff = await autenticar(b.usuario || b.login || b.user, b.senha);
        const token = await criarSessao(staff.id);
        res.setHeader('Set-Cookie', cookieDeSessao(token));
        return json(res, 200, {
          ok: true,
          staff,
          home: homeDoPapel(staff.papel),
        });
      } catch (e) {
        if (e instanceof ErroAuth) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/logout' && req.method === 'POST') {
      await destruirSessao(parseCookies(req)[SESSION_COOKIE]);
      res.setHeader('Set-Cookie', cookieDeLogout());
      return json(res, 200, { ok: true });
    }
    if (p === '/api/me' && req.method === 'GET') {
      const staff = await getStaffDaRequisicao(req);
      if (!staff) return json(res, 200, { staff: null });
      return json(res, 200, { staff });
    }

    /* Rotas autenticadas: cada bloco abaixo chama exigirAcesso antes da ação. */
    if (p.startsWith('/api/admin')) {
      try { await exigirAcesso(req, 'admin'); }
      catch (e) { if (e instanceof ErroAuth) return json(res, e.status, { error: e.message }); throw e; }
    }

    if (p === '/api/admin/mesas' && req.method === 'GET') return json(res, 200, await listMesas());
    if (p === '/api/admin/garcons' && req.method === 'GET') return json(res, 200, await listGarcons());
    if (p === '/api/admin/garcons' && req.method === 'POST') {
      try {
        const out = await criarGarcom(await body(req));
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/garcons\/(\d+)\/ativo$/)) && req.method === 'PATCH') {
      try {
        const out = await setGarcomAtivo(Number(m[1]), (await body(req)).ativo);
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroGarcom || e.name === 'ErroValidacao') return json(res, e.status || 400, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/garcons\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        const out = await removerGarcom(Number(m[1]));
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroGarcom || e.name === 'ErroValidacao') return json(res, e.status || 400, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/garcons/recentes' && req.method === 'GET') return json(res, 200, await listPedidosRecentes());
    if (p === '/api/admin/dashboard' && req.method === 'GET') return json(res, 200, { resumo: await resumoDia(), top: await topProdutosHoje(10) });
    if (p === '/api/admin/relatorio' && req.method === 'GET') {
      try {
        const dataInicio = u.searchParams.get('inicio') || u.searchParams.get('from') || null;
        const dataFim = u.searchParams.get('fim') || u.searchParams.get('to') || null;
        return json(res, 200, await relatorioVendas(dataInicio, dataFim));
      } catch (e) {
        return json(res, e.status || 500, { error: e.message });
      }
    }
    if (p === '/api/admin/historico/purge' && req.method === 'POST') {
      try { return json(res, 200, await purgeHistorico(await body(req))); }
      catch (e) { if (e instanceof ErroPurge) return json(res, e.status, { error: e.message }); throw e; }
    }
    if (p === '/api/admin/cardapio' && req.method === 'GET') return json(res, 200, await getCardapioAdmin());
    if (p === '/api/admin/categorias' && req.method === 'GET') return json(res, 200, await getCardapioAdmin());
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
    if (p === '/api/admin/foto-url' && req.method === 'POST') {
      try {
        const out = await processarUploadFoto(await body(req, { maxBytes: Number(process.env.FOTO_MAX_BODY_BYTES || 8 * 1024 * 1024) }));
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroFoto) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/upload-foto' && req.method === 'POST') {
      try {
        const out = await processarUploadFoto(await body(req, { maxBytes: Number(process.env.FOTO_MAX_BODY_BYTES || 8 * 1024 * 1024) }));
        invalidarCardapio();
        return json(res, 201, out);
      } catch (e) {
        if (e instanceof ErroFoto) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/categorias\/(\d+)\/ordem$/)) && req.method === 'PATCH') {
      try {
        const out = await reordenarCategorias([{ id: Number(m[1]), ordem: (await body(req)).ordem }]);
        invalidarCardapio();
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/produtos' && req.method === 'GET') return json(res, 200, await getCardapioAdmin());
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

    const spaIndexPath = path.join(ROOT, 'dist', 'index.html');
    const hasSpa = fs.existsSync(spaIndexPath);

    const hashHome = (papel) => {
      if (papel === 'cozinha') return '/#/cozinha';
      if (papel === 'caixa') return '/#/caixa';
      if (papel === 'bar') return '/#/bar';
      if (papel === 'admin') return '/#/admin';
      if (papel === 'garcom') return '/#/garcom';
      return '/';
    };

    if (hasSpa) {
      const rel = p === '/' ? 'index.html' : p.replace(/^\//, '');
      const file = path.resolve(ROOT, 'dist', rel);
      const distRoot = path.resolve(ROOT, 'dist');
      if (file === distRoot || file.startsWith(distRoot + path.sep)) {
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          const ext = path.extname(file).toLowerCase();
          const data = fs.readFileSync(file);
          return send(res, 200, mime[ext] || 'application/octet-stream', data, {
            'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
          });
        }
      }
      const staff = await getStaffDaRequisicao(req);
      if (staff && (p === '/' || p === '/login')) {
        return res.writeHead(302, { Location: hashHome(staff.papel) }) || res.end();
      }
      const indexData = fs.readFileSync(spaIndexPath);
      return send(res, 200, 'text/html; charset=utf-8', indexData);
    }

    let publicPath = p;
    if (publicPath === '/' || publicPath === '/login') publicPath = '/login.html';
    const file = path.resolve(ROOT, 'public', publicPath.replace(/^\//, ''));
    const publicRoot = path.resolve(ROOT, 'public');
    if (!file.startsWith(publicRoot + path.sep)) return json(res, 403, { error: 'Acesso negado' });
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file).toLowerCase();
      return send(res, 200, mime[ext] || 'application/octet-stream', fs.readFileSync(file));
    }

    return json(res, 404, { error: 'Rota não encontrada' });
  } catch (e) {
    console.error('Erro HTTP:', e);
    if (!res.headersSent) {
      return json(res, e && e.status ? e.status : 500, { error: e?.message || 'Erro interno' });
    }
    try { res.end(); } catch (_) {}
  }
});

async function ensureDb() {
  try {
    const { migrar } = require('./db/migrate');
    await migrar();
  } catch (e) {
    console.warn('⚠️ Migração automática indisponível:', e.message);
  }
}

if (require.main === module) {
  ensureDb().finally(() => {
    server.listen(PORT, () => console.log(`🚀 Lanchonete QR ouvindo em http://localhost:${PORT}`));
  });
}

module.exports = { server, body, applySecurityHeaders };
