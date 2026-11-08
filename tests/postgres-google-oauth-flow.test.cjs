'use strict';

// Exercita o callback completo com PostgreSQL real e respostas Google simuladas.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { subirServidor, exigirAmbienteDeTeste } = require('./helpers/public-table-server.cjs');
const { codigoGoogleSintetico } = require('./fixtures/google-oauth-provider.cjs');

assert.equal(new URL(process.env.DATABASE_URL || 'postgres://x/none').pathname, '/qradmin_test',
  'Integração bloqueada: database deve ser qradmin_test');

const ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_OAUTH_STATE_SECRET', 'NODE_ENV', 'STAFF_FORCE_PASSWORD_CHANGE'];
const previousEnv = Object.fromEntries(ENV.map((key) => [key, process.env[key]]));
Object.assign(process.env, {
  GOOGLE_CLIENT_ID: 'client-id-ficticio',
  GOOGLE_CLIENT_SECRET: 'client-secret-ficticio',
  GOOGLE_REDIRECT_URI: 'https://qradmin.up.railway.app/api/auth/google/callback',
  GOOGLE_OAUTH_STATE_SECRET: 'segredo-de-teste-oauth-google-com-mais-de-32-bytes',
  NODE_ENV: 'test',
  STAFF_FORCE_PASSWORD_CHANGE: 'true',
});

exigirAmbienteDeTeste();
const pool = require('../db/pool');
const auth = require('../db/auth');
const oauth = require('../db/oauth-google');
const run = `oauthflow${process.pid}${crypto.randomBytes(4).toString('hex')}`;
const ids = [];
let servidorHttp;

async function criarStaff(sufixo, email, papel = 'caixa', { deveTrocarSenha = true, ativo = true, senhaHash } = {}) {
  const login = `${run}-${sufixo}`;
  const { rows } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, email, deve_trocar_senha, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [`OAuth ${sufixo}`, login, senhaHash || `hash-ficticio-${login}`, papel, email, deveTrocarSenha, ativo]
  );
  ids.push(rows[0].id);
  return rows[0].id;
}

function prepararInicio() {
  const inicio = oauth.iniciarOAuth();
  const valor = inicio.cookie.split(';', 1)[0].slice('qr_google_oauth='.length);
  const state = new URL(inicio.url).searchParams.get('state');
  return { req: { headers: { cookie: `qr_google_oauth=${valor}` } }, state };
}

function respostaGoogle(profile) {
  let chamada = 0;
  return async (url, options) => {
    chamada += 1;
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      assert.equal(options.method, 'POST');
      assert.match(String(options.body), /code_verifier=/);
      return { ok: true, json: async () => ({ access_token: 'access-token-ficticio', token_type: 'Bearer' }) };
    }
    assert.equal(String(url), 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.equal(options.headers.Authorization, 'Bearer access-token-ficticio');
    return { ok: true, json: async () => profile };
  };
}

test.before(async () => {
  servidorHttp = await subirServidor({
    preCarregamentoExtra: path.join(__dirname, 'fixtures', 'google-oauth-provider.cjs'),
    env: {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
      GOOGLE_OAUTH_STATE_SECRET: process.env.GOOGLE_OAUTH_STATE_SECRET,
      STAFF_FORCE_PASSWORD_CHANGE: 'true',
    },
  });
});

test.after(async () => {
  if (servidorHttp) await servidorHttp.encerrar();
  await pool.query('DELETE FROM staff_sessoes WHERE staff_id = ANY($1::int[])', [ids]);
  if (ids.length) await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [ids]);
  await pool.end();
  for (const key of ENV) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});

test('PostgreSQL real: callback Google valida identidade, vincula sub e cria sessão lqr_session', async () => {
  const email = `${run}@example.com`;
  const staffId = await criarStaff('caixa', email, 'caixa');
  const inicio = prepararInicio();
  const anterior = global.fetch;
  global.fetch = respostaGoogle({ sub: `google-sub-${run}`, email: email.toUpperCase(), email_verified: true });
  let resultado;
  try {
    resultado = await oauth.concluirOAuth(inicio.req, 'codigo-ficticio', inicio.state);
  } finally {
    global.fetch = anterior;
  }

  assert.equal(resultado.staff.id, staffId);
  assert.equal(resultado.staff.papel, 'caixa');
  assert.equal(resultado.staff.deveTrocarSenha, true);
  assert.equal(resultado.home, '/caixa');
  assert.match(resultado.token, /^[a-f0-9]{64}$/);

  const vinculo = await pool.query('SELECT google_sub FROM staff WHERE id = $1', [staffId]);
  assert.equal(vinculo.rows[0].google_sub, `google-sub-${run}`);
  const sessao = await pool.query(
    `SELECT staff_id, token_hash, mfa_pendente, expira_em > now() AS valida,
            expira_em <= now() + interval '12 hours' AS ttl_correto
       FROM staff_sessoes WHERE token = $1`, [resultado.token]
  );
  assert.equal(sessao.rowCount, 1);
  assert.equal(sessao.rows[0].staff_id, staffId);
  assert.equal(sessao.rows[0].token_hash, crypto.createHash('sha256').update(resultado.token).digest('hex'));
  assert.equal(sessao.rows[0].mfa_pendente, false);
  assert.equal(sessao.rows[0].valida, true);
  assert.equal(sessao.rows[0].ttl_correto, true);
  const autenticado = await auth.getStaffDaRequisicao({ headers: { cookie: `lqr_session=${resultado.token}` } });
  assert.equal(autenticado.id, staffId);
  assert.equal(autenticado.papel, 'caixa');
  await auth.destruirSessao(resultado.token);
});

test('PostgreSQL real: e-mail Google não verificado não vincula conta nem cria sessão', async () => {
  const email = `${run}-nao-verificado@example.com`;
  const staffId = await criarStaff('nao-verificado', email);
  const inicio = prepararInicio();
  const anterior = global.fetch;
  global.fetch = respostaGoogle({ sub: `unverified-${run}`, email, email_verified: false });
  try {
    await assert.rejects(
      oauth.concluirOAuth(inicio.req, 'codigo-ficticio', inicio.state),
      (error) => error.status === 403
    );
  } finally {
    global.fetch = anterior;
  }
  const row = await pool.query('SELECT google_sub FROM staff WHERE id = $1', [staffId]);
  assert.equal(row.rows[0].google_sub, null);
  const sessions = await pool.query('SELECT 1 FROM staff_sessoes WHERE staff_id = $1', [staffId]);
  assert.equal(sessions.rowCount, 0);
});


async function concluirComPerfil(profile, inicio = prepararInicio(), mock = respostaGoogle(profile)) {
  const anterior = global.fetch;
  global.fetch = mock;
  try {
    return await oauth.concluirOAuth(inicio.req, 'codigo-ficticio', inicio.state);
  } finally {
    global.fetch = anterior;
  }
}

function inicioComVerifier(verifier) {
  const inicio = prepararInicio();
  const valor = inicio.req.headers.cookie.slice('qr_google_oauth='.length);
  const [payload] = valor.split('.');
  const dados = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  dados.verifier = verifier;
  const novoPayload = Buffer.from(JSON.stringify(dados)).toString('base64url');
  const assinatura = crypto.createHmac('sha256', process.env.GOOGLE_OAUTH_STATE_SECRET).update(novoPayload).digest('base64url');
  return { ...inicio, req: { headers: { cookie: `qr_google_oauth=${novoPayload}.${assinatura}` } } };
}

test('PostgreSQL real: conta Google já vinculada entra de novo; outra identidade é recusada', async () => {
  const email = `${run}-vinculada@example.com`;
  const sub = `sub-vinculado-${run}`;
  const staffId = await criarStaff('vinculada', email);
  await pool.query('UPDATE staff SET google_sub=$2 WHERE id=$1', [staffId, sub]);
  const resultado = await concluirComPerfil({ sub, email, email_verified: true });
  assert.equal(resultado.staff.id, staffId);
  assert.equal(resultado.home, '/caixa');
  assert.ok(await auth.getStaffDaRequisicao({ headers: { cookie: `lqr_session=${resultado.token}` } }));
  await assert.rejects(
    concluirComPerfil({ sub: `outro-sub-${run}`, email, email_verified: true }),
    (e) => e.status === 403
  );
  const vinculo = await pool.query('SELECT google_sub FROM staff WHERE id=$1', [staffId]);
  assert.equal(vinculo.rows[0].google_sub, sub);
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE staff_id=$1', [staffId])).rowCount, 1);
});

test('PostgreSQL real: mesmo sub não pode ser reivindicado por outro funcionário', async () => {
  const sub = `sub-disputado-${run}`;
  const dono = await criarStaff('dono-sub', `${run}-dono@example.com`);
  await pool.query('UPDATE staff SET google_sub=$2 WHERE id=$1', [dono, sub]);
  const outro = await criarStaff('outro-sub', `${run}-outro@example.com`);
  await assert.rejects(
    concluirComPerfil({ sub, email: `${run}-outro@example.com`, email_verified: true }),
    (e) => e.status === 403
  );
  assert.equal((await pool.query('SELECT google_sub FROM staff WHERE id=$1', [outro])).rows[0].google_sub, null);
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE staff_id=$1', [outro])).rowCount, 0);
});

test('PostgreSQL real: e-mail não cadastrado não cria funcionário nem sessão', async () => {
  const antes = await pool.query('SELECT count(*)::int AS n FROM staff');
  await assert.rejects(
    concluirComPerfil({ sub: `sem-cadastro-${run}`, email: `${run}-nao-existe@example.com`, email_verified: true }),
    (e) => e.status === 403
  );
  const depois = await pool.query('SELECT count(*)::int AS n FROM staff');
  assert.equal(depois.rows[0].n, antes.rows[0].n);
  assert.equal((await pool.query('SELECT 1 FROM staff WHERE email=$1', [`${run}-nao-existe@example.com`])).rowCount, 0);
});

test('PostgreSQL real: funcionário desativado não vincula nem recebe sessão', async () => {
  const email = `${run}-inativo@example.com`;
  const staffId = await criarStaff('inativo', email, 'caixa', { ativo: false });
  await assert.rejects(
    concluirComPerfil({ sub: `inativo-${run}`, email, email_verified: true }),
    (e) => e.status === 403
  );
  assert.equal((await pool.query('SELECT google_sub FROM staff WHERE id=$1', [staffId])).rows[0].google_sub, null);
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE staff_id=$1', [staffId])).rowCount, 0);
});

test('PostgreSQL real: email_verified precisa ser booleano true, não string', async () => {
  const email = `${run}-verified-string@example.com`;
  const staffId = await criarStaff('verified-string', email);
  await assert.rejects(
    concluirComPerfil({ sub: `verified-string-${run}`, email, email_verified: 'true' }),
    (e) => e.status === 403
  );
  assert.equal((await pool.query('SELECT google_sub FROM staff WHERE id=$1', [staffId])).rows[0].google_sub, null);
});

test('PostgreSQL real: PKCE adulterado é enviado na troca e a recusa do Google não cria sessão', async () => {
  const email = `${run}-pkce@example.com`;
  const staffId = await criarStaff('pkce', email);
  const inicio = inicioComVerifier('verifier-ficticio-adulterado-com-tamanho-suficiente');
  let verifierRecebido;
  const mock = async (url, options) => {
    assert.equal(String(url), 'https://oauth2.googleapis.com/token');
    verifierRecebido = new URLSearchParams(String(options.body)).get('code_verifier');
    return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
  };
  await assert.rejects(
    concluirComPerfil({ sub: `pkce-${run}`, email, email_verified: true }, inicio, mock),
    (e) => e.status === 401
  );
  assert.equal(verifierRecebido, 'verifier-ficticio-adulterado-com-tamanho-suficiente');
  assert.equal((await pool.query('SELECT google_sub FROM staff WHERE id=$1', [staffId])).rows[0].google_sub, null);
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE staff_id=$1', [staffId])).rowCount, 0);
});

test('PostgreSQL real: sessão OAuth expirada é recusada e removida pelo mesmo validador do login tradicional', async () => {
  const email = `${run}-expirada@example.com`;
  const staffId = await criarStaff('expirada', email);
  const resultado = await concluirComPerfil({ sub: `expirada-${run}`, email, email_verified: true });
  await pool.query("UPDATE staff_sessoes SET expira_em = now() - interval '1 second' WHERE token=$1", [resultado.token]);
  const req = { headers: { cookie: `lqr_session=${resultado.token}` } };
  assert.equal(await auth.getStaffDaRequisicao(req), null);
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE token=$1', [resultado.token])).rowCount, 0);
});

// --------------------------------------------------------------------------
// HTTP real: não basta concluirOAuth() devolver token; o callback precisa enviar
// Set-Cookie e o navegador/cliente precisa conseguir usar esse cookie depois.
// --------------------------------------------------------------------------
function cookieHttp(resposta, nome) {
  const lista = resposta.headers['set-cookie'] || [];
  return lista.find((c) => c.startsWith(`${nome}=`)) || null;
}

function valorCookie(cookie) {
  return cookie.split(';', 1)[0].split('=').slice(1).join('=');
}

async function inicioHttp() {
  const resposta = await servidorHttp.request('GET', '/api/auth/google');
  assert.equal(resposta.status, 302);
  const url = new URL(resposta.headers.location);
  const cookie = cookieHttp(resposta, 'qr_google_oauth');
  assert.ok(cookie);
  return { cookie, state: url.searchParams.get('state'), codeChallenge: url.searchParams.get('code_challenge') };
}

async function callbackHttp(inicio, conta, { state, cookie, code } = {}) {
  const codigo = code || codigoGoogleSintetico({ ...conta, codeChallenge: inicio.codeChallenge });
  const caminho = '/api/auth/google/callback?' + new URLSearchParams({ code: codigo, state: state || inicio.state });
  return servidorHttp.request('GET', caminho, { headers: { cookie: cookie || inicio.cookie } });
}

function atributosCookie(cookie) {
  return cookie.split(';').slice(1).map((p) => p.trim());
}

test('HTTP real: callback Google envia cookie utilizável e cada perfil acessa sua rota protegida', async () => {
  for (const papel of ['admin', 'cozinha', 'bar', 'caixa']) {
    const email = `${run}-http-${papel}@example.com`;
    const staffId = await criarStaff(`http-${papel}`, email, papel, { deveTrocarSenha: false });
    const inicio = await inicioHttp();
    const retorno = await callbackHttp(inicio, { sub: `http-${papel}-${run}`, email });
    assert.equal(retorno.status, 302);
    assert.equal(retorno.headers.location, auth.homeDoPapel(papel));
    assert.equal(retorno.headers['cache-control'], 'no-store');
    const cookie = cookieHttp(retorno, 'lqr_session');
    assert.ok(cookie, 'callback precisa enviar lqr_session');
    assert.ok(cookieHttp(retorno, 'qr_google_oauth').includes('Max-Age=0'));
    const atributos = atributosCookie(cookie);
    for (const esperado of ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=43200']) assert.ok(atributos.includes(esperado));
    assert.ok(!atributos.some((a) => /^Domain=/i.test(a)));
    const token = valorCookie(cookie);
    const headers = { cookie: `lqr_session=${token}` };
    const me = await servidorHttp.request('GET', '/api/me', { headers });
    assert.equal(me.status, 200);
    assert.equal(me.json.staff.id, staffId);
    assert.equal(me.json.staff.papel, papel);
    assert.equal(me.json.home, auth.homeDoPapel(papel));
    assert.equal(me.json.csrfToken, auth.csrfTokenParaSessao(token));
    const registro = await pool.query(
      'SELECT staff_id, mfa_pendente, expira_em > now() AS valida FROM staff_sessoes WHERE token_hash=$1',
      [crypto.createHash('sha256').update(token).digest('hex')]
    );
    assert.equal(registro.rowCount, 1);
    assert.equal(registro.rows[0].staff_id, staffId);
    assert.equal(registro.rows[0].mfa_pendente, false);
    assert.equal(registro.rows[0].valida, true);

    const propria = papel === 'admin' ? '/api/mesas' : papel === 'caixa' ? '/api/caixa/sessoes' : `/api/${papel}/pedidos`;
    assert.equal((await servidorHttp.request('GET', propria, { headers })).status, 200);
    assert.equal((await servidorHttp.request('GET', '/api/mesas', { headers })).status, papel === 'admin' ? 200 : 403);
    // Uma segunda requisição independente reutiliza o cookie, como uma recarga.
    assert.equal((await servidorHttp.request('GET', '/api/me', { headers })).status, 200);

    const logout = await servidorHttp.request('POST', '/api/logout', {
      headers: { ...headers, origin: servidorHttp.base, 'x-csrf-token': me.json.csrfToken },
    });
    assert.equal(logout.status, 200);
    assert.ok(cookieHttp(logout, 'lqr_session').includes('Max-Age=0'));
    assert.equal((await servidorHttp.request('GET', '/api/me', { headers })).status, 401);
    assert.equal((await servidorHttp.request('GET', propria, { headers })).status, 401);
  }
});

test('HTTP real: Google e login tradicional emitem o mesmo cookie e resolvem a mesma identidade', async () => {
  const email = `${run}-comparacao@example.com`;
  const senha = `Senha-Sintetica-${run}`;
  const staffId = await criarStaff('comparacao', email, 'caixa', { deveTrocarSenha: false, senhaHash: await auth.hashSenha(senha) });
  const login = await servidorHttp.request('POST', '/api/login', {
    corpo: { usuario: `${run}-comparacao`, senha },
    headers: { origin: servidorHttp.base },
    ip: '127.0.0.201',
  });
  assert.equal(login.status, 200);
  const cookieSenha = cookieHttp(login, 'lqr_session');
  const inicio = await inicioHttp();
  const retorno = await callbackHttp(inicio, { sub: `comparacao-${run}`, email });
  assert.equal(retorno.status, 302);
  const cookieGoogle = cookieHttp(retorno, 'lqr_session');
  assert.ok(cookieSenha && cookieGoogle);
  assert.deepEqual(atributosCookie(cookieGoogle), atributosCookie(cookieSenha));
  assert.ok(valorCookie(cookieGoogle) !== valorCookie(cookieSenha));
  const meSenha = await servidorHttp.request('GET', '/api/me', { headers: { cookie: `lqr_session=${valorCookie(cookieSenha)}` } });
  const meGoogle = await servidorHttp.request('GET', '/api/me', { headers: { cookie: `lqr_session=${valorCookie(cookieGoogle)}` } });
  assert.equal(meSenha.status, 200);
  assert.equal(meGoogle.status, 200);
  assert.deepEqual(meGoogle.json.staff, meSenha.json.staff);
  assert.equal(meGoogle.json.staff.id, staffId);
});

test('HTTP real: state inválido no callback não emite sessão e volta ao login com erro', async () => {
  const email = `${run}-http-state@example.com`;
  const staffId = await criarStaff('http-state', email);
  const inicio = await inicioHttp();
  const retorno = await callbackHttp(inicio, { sub: `http-state-${run}`, email }, { state: 'state-adulterado' });
  assert.equal(retorno.status, 302);
  assert.equal(retorno.headers.location, '/#/login?google_error=login_failed');
  assert.equal(cookieHttp(retorno, 'lqr_session'), null);
  assert.ok(cookieHttp(retorno, 'qr_google_oauth').includes('Max-Age=0'));
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE staff_id=$1', [staffId])).rowCount, 0);
});

test('HTTP real: provedor recusa PKCE inválido no callback sem criar sessão', async () => {
  const email = `${run}-http-pkce@example.com`;
  const staffId = await criarStaff('http-pkce', email);
  const inicio = await inicioHttp();
  const adulterado = inicioComVerifier('verifier-http-adulterado-com-tamanho-suficiente');
  const retorno = await callbackHttp(inicio, { sub: `http-pkce-${run}`, email }, { cookie: adulterado.req.headers.cookie });
  assert.equal(retorno.status, 302);
  assert.equal(retorno.headers.location, '/#/login?google_error=login_failed');
  assert.equal(cookieHttp(retorno, 'lqr_session'), null);
  assert.equal((await pool.query('SELECT google_sub FROM staff WHERE id=$1', [staffId])).rows[0].google_sub, null);
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE staff_id=$1', [staffId])).rowCount, 0);
});

test('HTTP real: primeiro login Google mantém troca obrigatória e depois libera a rota protegida', async () => {
  const email = `${run}-http-troca@example.com`;
  const senhaAtual = `Senha-Inicial-${run}`;
  const senhaNova = `Senha-Nova-Exclusiva-${run}`;
  const staffId = await criarStaff('http-troca', email, 'cozinha', { senhaHash: await auth.hashSenha(senhaAtual) });
  const inicio = await inicioHttp();
  const retorno = await callbackHttp(inicio, { sub: `http-troca-${run}`, email });
  assert.equal(retorno.status, 302);
  const cookie = cookieHttp(retorno, 'lqr_session');
  const headers = { cookie: `lqr_session=${valorCookie(cookie)}` };
  const me = await servidorHttp.request('GET', '/api/me', { headers });
  assert.equal(me.status, 200);
  assert.equal(me.json.staff.deveTrocarSenha, true);
  const bloqueada = await servidorHttp.request('GET', '/api/cozinha/pedidos', { headers });
  assert.equal(bloqueada.status, 403);
  assert.equal(bloqueada.json.code, 'SENHA_TROCA_OBRIGATORIA');
  const troca = await servidorHttp.request('POST', '/api/me/senha', {
    corpo: { senhaAtual, senhaNova },
    headers: { ...headers, origin: servidorHttp.base, 'x-csrf-token': me.json.csrfToken },
  });
  assert.equal(troca.status, 200);
  const novoCookie = cookieHttp(troca, 'lqr_session');
  assert.ok(novoCookie);
  assert.equal((await servidorHttp.request('GET', '/api/me', { headers })).status, 401);
  const novosHeaders = { cookie: `lqr_session=${valorCookie(novoCookie)}` };
  const depois = await servidorHttp.request('GET', '/api/me', { headers: novosHeaders });
  assert.equal(depois.status, 200);
  assert.equal(depois.json.staff.id, staffId);
  assert.equal(depois.json.staff.deveTrocarSenha, false);
  assert.equal((await servidorHttp.request('GET', '/api/cozinha/pedidos', { headers: novosHeaders })).status, 200);
});
