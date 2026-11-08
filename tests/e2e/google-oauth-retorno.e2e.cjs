'use strict';

// Regressão do retorno EXTERNO do Google: Chromium + build real + server.js +
// PostgreSQL descartável. Só Token/UserInfo são fictícios; o navegador mantém
// cookies reais e percorre início -> origem externa -> callback -> SPA.
// Execute npm run build antes; npm run test:e2e prepara o restante.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const http = require('node:http');
const { Pool } = require('pg');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;
const { subirServidor, exigirAmbienteDeTeste } = require('../helpers/public-table-server.cjs');
const { codigoGoogleSintetico } = require('../fixtures/google-oauth-provider.cjs');

process.env.NODE_ENV = 'test';
exigirAmbienteDeTeste();
const auth = require('../../db/auth');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const run = crypto.randomBytes(5).toString('hex');
const ids = [];
let servidor;
let browser;
let provedor;
let contaAtual;

async function aguardarHome(page, home) {
  await page.waitForFunction((esperado) => location.hash.split('?')[0] === '#' + esperado, home, { timeout: 6000 });
}

async function main() {
  const contas = [];
  for (const papel of ['cozinha', 'bar', 'caixa', 'admin']) {
    const login = `oauth-e2e-${run}-${papel}`;
    const email = `${login}@example.test`;
    const { rows } = await pool.query(
      `INSERT INTO staff (nome, login, senha_hash, papel, email, deve_trocar_senha)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [`Funcionário ${papel} ${run}`, login, await auth.hashSenha(`Senha-Sintetica-${run}-${papel}`), papel, email, papel === 'cozinha']
    );
    ids.push(rows[0].id);
    contas.push({ id: rows[0].id, papel, email, home: '/' + papel, sub: `google-e2e-${run}-${papel}`, senhaAtual: `Senha-Sintetica-${run}-${papel}` });
  }
  servidor = await subirServidor({
    servirSpa: true,
    preCarregamentoExtra: path.join(__dirname, '..', 'fixtures', 'google-oauth-provider.cjs'),
    env: {
      GOOGLE_CLIENT_ID: 'client-id-sintetico',
      GOOGLE_CLIENT_SECRET: 'client-secret-sintetico',
      GOOGLE_OAUTH_STATE_SECRET: 'state-secret-sintetico-com-mais-de-32-bytes',
      GOOGLE_REDIRECT_URI: 'https://qradmin.up.railway.app/api/auth/google/callback',
      STAFF_FORCE_PASSWORD_CHANGE: 'true',
    },
  });

  // IP de loopback distinto do app: navegação realmente cross-site, sem tocar
  // na internet. Só o endereço do provedor é substituído no transporte; o
  // Location original, state, desafio PKCE e Set-Cookie vêm do servidor real.
  provedor = http.createServer((req, res) => {
    const inicio = new URL(req.url, 'http://127.0.0.2');
    assert.equal(inicio.searchParams.get('redirect_uri'), 'https://qradmin.up.railway.app/api/auth/google/callback');
    const code = codigoGoogleSintetico({ ...contaAtual, codeChallenge: inicio.searchParams.get('code_challenge') });
    const retorno = new URL('/api/auth/google/callback', servidor.base);
    retorno.search = new URLSearchParams({ code, state: inicio.searchParams.get('state') }).toString();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><html lang="pt-BR"><title>Google fictício</title><a id="retornar" href="${retorno.href}">Concluir autenticação e voltar ao QRAdmin</a></html>`);
  });
  await new Promise((resolve, reject) => { provedor.once('error', reject); provedor.listen(0, '127.0.0.2', resolve); });

  browser = await chromium.launch({
    executablePath: await binary.executablePath(),
    args: [...binary.args.filter((a) => a !== '--single-process' && a !== '--no-zygote'), '--no-sandbox'],
    headless: true,
  });

  for (const conta of contas) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    contaAtual = conta;
    // Não intercepta callback nem /api/me: cookies e respostas vêm do servidor.
    await context.route('**/api/auth/google', async (route) => {
      const resposta = await route.fetch({ maxRedirects: 0 });
      const headers = resposta.headers();
      const destino = new URL('http://127.0.0.2:' + provedor.address().port + '/authorize');
      destino.search = new URL(headers.location).search;
      await route.fulfill({ response: resposta, headers: { ...headers, location: destino.href } });
    });
    const page = await context.newPage();
    const erros = [];
    const naoAutenticados = [];
    page.on('pageerror', (e) => erros.push(e.message));
    page.on('response', (r) => {
      if (r.status() === 401 && new URL(r.url()).pathname.startsWith('/api/')) naoAutenticados.push(new URL(r.url()).pathname);
    });
    await page.goto(servidor.base + '/#/login');
    await page.getByRole('button', { name: conta.papel[0].toUpperCase() + conta.papel.slice(1), exact: true }).click();
    await page.getByRole('button', { name: 'Continuar com Google', exact: true }).click();
    try {
      await page.getByRole('link', { name: 'Concluir autenticação e voltar ao QRAdmin' }).click({ timeout: 8000 });
    } catch (error) {
      const endereco = new URL(page.url());
      throw new Error(`Esperando provedor externo; navegador em ${endereco.origin}${endereco.pathname}. ${error.message}`);
    }
    try {
      await aguardarHome(page, conta.home);
    } catch (error) {
      const hash = await page.evaluate(() => location.hash);
      const cookie = (await context.cookies()).some((c) => c.name === 'lqr_session');
      const vinculo = await pool.query('SELECT google_sub IS NOT NULL AS ok FROM staff WHERE id=$1', [conta.id]);
      throw new Error(`Retorno Google caiu em ${hash}; cookie presente=${cookie}, vínculo gravado=${vinculo.rows[0].ok}. ${error.message}`);
    }
    try {
      await page.locator('.ops-topbar').waitFor({ timeout: 6000 });
    } catch (error) {
      const hash = await page.evaluate(() => location.hash);
      const cookie = (await context.cookies()).some((c) => c.name === 'lqr_session');
      const vinculo = await pool.query('SELECT google_sub IS NOT NULL AS ok FROM staff WHERE id=$1', [conta.id]);
      throw new Error(`Retorno Google terminou em ${hash}; cookie presente=${cookie}, vínculo gravado=${vinculo.rows[0].ok}, mas a tela autenticada não abriu. ${error.message}`);
    }
    const me = await page.evaluate(async () => {
      const r = await fetch('/api/me', { credentials: 'include' });
      const j = await r.json();
      return { status: r.status, id: j.staff?.id, papel: j.staff?.papel };
    });
    assert.deepEqual(me, { status: 200, id: conta.id, papel: conta.papel });
    const cookies = await context.cookies();
    const sessao = cookies.find((c) => c.name === 'lqr_session');
    assert.ok(sessao?.httpOnly);
    assert.equal(sessao.sameSite, 'Lax');
    assert.equal(sessao.path, '/');
    assert.ok(!cookies.some((c) => c.name === 'qr_google_oauth'));
    const hashSessao = crypto.createHash('sha256').update(sessao.value).digest('hex');
    const persistida = await pool.query(
      'SELECT staff_id, mfa_pendente, expira_em > now() AS valida FROM staff_sessoes WHERE token_hash=$1', [hashSessao]
    );
    assert.equal(persistida.rowCount, 1);
    assert.equal(persistida.rows[0].staff_id, conta.id);
    assert.equal(persistida.rows[0].mfa_pendente, false);
    assert.equal(persistida.rows[0].valida, true);

    if (conta.papel === 'cozinha') {
      // Conta recém-cadastrada: o primeiro login Google NÃO dispensa a política
      // de senha inicial. A sessão existe, mas a operação fica bloqueada até a
      // troca pelo modal já existente; depois a mesma rota é liberada.
      const bloqueada = await page.evaluate(async () => {
        const r = await fetch('/api/cozinha/pedidos', { credentials: 'include' });
        return { status: r.status, corpo: await r.json() };
      });
      assert.equal(bloqueada.status, 403);
      assert.equal(bloqueada.corpo.code, 'SENHA_TROCA_OBRIGATORIA');
      const dialogo = page.getByRole('dialog');
      await dialogo.getByRole('heading', { name: 'Defina uma nova senha' }).waitFor();
      await dialogo.locator('input[name="current-password"]').fill(conta.senhaAtual);
      await dialogo.locator('input[name="new-password"]').fill(`Nova-Senha-Sintetica-${run}`);
      await dialogo.locator('input[name="confirm-password"]').fill(`Nova-Senha-Sintetica-${run}`);
      await dialogo.getByRole('button', { name: 'Salvar nova senha' }).click();
      await page.waitForFunction(() => {
        const auth = JSON.parse(sessionStorage.getItem('pub-auth') || 'null');
        return auth?.deveTrocar === false && !document.querySelector('#trocar-senha-titulo');
      });
      await page.locator('.ops-topbar').waitFor();
      assert.equal(await page.evaluate(() => location.hash), '#/cozinha');
      console.log('  ✓ Primeiro login com senha inicial: modal obrigatório preservado, troca rotaciona sessão e libera Cozinha.');
    }

    if (conta.papel !== 'admin') {
      await page.goto(servidor.base + '/#/admin');
      await aguardarHome(page, conta.home);
      await page.locator('.ops-topbar').waitFor();
      assert.deepEqual(naoAutenticados, [], 'perfil sem acesso não deve montar Admin nem chamar /api/mesas');
    }

    // Recarga e deep link são novas navegações: a sessão não pode depender da
    // memória deixada pelo formulário de login por senha.
    await page.reload();
    await aguardarHome(page, conta.home);
    await page.locator('.ops-topbar').waitFor();
    const destinoProtegido = conta.papel === 'admin' ? '/admin/mesas' : conta.home;
    await page.goto(servidor.base + '/#' + destinoProtegido);
    await aguardarHome(page, destinoProtegido);
    await page.locator('.ops-topbar').waitFor();
    const protegidas = await page.evaluate(async (papel) => {
      const propria = papel === 'admin' ? '/api/mesas' : papel === 'caixa' ? '/api/caixa/sessoes' : `/api/${papel}/pedidos`;
      const propriaResposta = await fetch(propria, { credentials: 'include' });
      const administrativa = await fetch('/api/mesas', { credentials: 'include' });
      return { propria: propriaResposta.status, administrativa: administrativa.status };
    }, conta.papel);
    assert.equal(protegidas.propria, 200);
    assert.equal(protegidas.administrativa, conta.papel === 'admin' ? 200 : 403);

    if (conta.papel === 'cozinha') {
      // Mantém a falha até o usuário pedir nova tentativa. Assim uma segunda
      // chamada concorrente de /api/me não mascara o estado indisponível no CI.
      let liberar = false;
      await context.route('**/api/me', (route) => {
        if (!liberar) return route.abort('failed');
        return route.fallback();
      });
      await page.reload();
      await page.getByRole('button', { name: 'Tentar novamente', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => location.hash), '#/cozinha');
      liberar = true;
      await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
      await page.locator('.ops-topbar').waitFor();
      assert.equal(await page.evaluate(() => location.hash), '#/cozinha');
      console.log('  ✓ Falha transitória de /api/me não vira logout; recuperação na mesma rota.');
    }

    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await aguardarHome(page, '/login');
    await page.goto(servidor.base + conta.home);
    await aguardarHome(page, '/login');
    assert.equal((await context.cookies()).filter((c) => c.name === 'lqr_session').length, 0);
    assert.deepEqual(naoAutenticados, ['/api/me']);
    assert.deepEqual(erros, []);
    console.log(`  ✓ ${conta.papel}: Google -> ${conta.home}; cookie aceito, sessão persistida, reload/deep link e API protegida OK; logout invalida.`);
    await context.close();
  }
  console.log('✓ Retorno Google confirmado em Chromium para os quatro perfis, sem retornar ao login com sessão válida.');
}

main().catch((e) => { console.error(e.stack); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (provedor) await new Promise((resolve) => provedor.close(resolve));
  if (servidor) await servidor.encerrar();
  if (ids.length) {
    await pool.query('DELETE FROM staff_sessoes WHERE staff_id=ANY($1::int[])', [ids]);
    await pool.query('DELETE FROM staff WHERE id=ANY($1::int[])', [ids]);
  }
  await pool.end();
});
