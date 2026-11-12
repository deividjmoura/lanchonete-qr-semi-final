'use strict';

/**
 * E2E em Chromium real da sincronização de sessão e autenticação entre abas (#300).
 *
 * Exercita em um único browserContext (cookie HttpOnly compartilhado, como abas reais)
 * contra `server.js` + PostgreSQL descartável (`qradmin_test`):
 *  1. Login na Aba 1 -> Aba 2 aberta em `#/cozinha` e Aba 3 aberta em `#/login`
 *     reconhecem a sessão sem pedir novo login.
 *  2. Recarregar aba autenticada preserva a sessão enquanto o cookie é válido.
 *  3. Falha transitória de rede em `/api/me` exibe estado de tentativa sem
 *     encerrar a sessão e recupera ao clicar em "Tentar novamente".
 *  4. Troca de conta em outra aba (`#/login?trocar=1` -> Caixa) atualiza as
 *     demais abas e aplica isolamento de perfil (`#/cozinha` -> `#/caixa`).
 *  5. Troca de senha rotaciona cookie + CSRF e a outra aba executa escrita
 *     protegida por CSRF sem precisar recarregar.
 *  6. Expiração/revogação da sessão no servidor invalida o acesso nas abas abertas.
 *  7. Novo login na Aba 1 tira automaticamente a Aba 2 de `#/login` para o setor.
 *  8. Logout na Aba 1 encerra o cookie real e leva a Aba 2 para `#/login`.
 *  9. Nenhum token de sessão ou CSRF é gravado em `localStorage` ou `sessionStorage`.
 */

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATABASE_URL = process.env.DATABASE_URL;
assert.ok(DATABASE_URL, 'Defina DATABASE_URL do banco descartável');
assert.strictEqual(new URL(DATABASE_URL).pathname, '/qradmin_test', 'E2E bloqueado fora de qradmin_test');

function portaLivre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function esperarServidor(base, tentativas = 80) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(base + '/healthz');
      if (r.ok || r.status === 503) return;
    } catch {
      /* subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Servidor não subiu a tempo');
}

async function main() {
  const { chromium: pw } = require('playwright-core');
  const chromium = require('@sparticuz/chromium').default;
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DATABASE_URL });

  const port = await portaLivre();
  const base = `http://127.0.0.1:${port}`;
  const sufixo = randomUUID().slice(0, 8);
  const senhaCozinha = `Fogao-Seguro-E2E-${sufixo}-1`;
  const senhaCaixa = `Balcao-Seguro-E2E-${sufixo}-2`;
  const senhaCaixaNova = `Balcao-Rotado-E2E-${sufixo}-3`;
  const ids = {};
  let servidor;
  let browser;
  const errosPagina = [];

  const ok = (msg) => console.log('  ✓ ' + msg);

  try {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = DATABASE_URL;
    const auth = require('../../db/auth');

    for (const [nome, login, papel, senhaCrua] of [
      ['Cozinha', 'cozinha', 'cozinha', senhaCozinha],
      ['Caixa', 'caixa', 'caixa', senhaCaixa],
    ]) {
      const r = await pool.query(
        `INSERT INTO staff (nome, login, senha_hash, papel, deve_trocar_senha, ativo)
         VALUES ($1, $2, $3, $4, FALSE, TRUE)
         ON CONFLICT (login) DO UPDATE
           SET nome = EXCLUDED.nome,
               senha_hash = EXCLUDED.senha_hash,
               papel = EXCLUDED.papel,
               deve_trocar_senha = FALSE,
               ativo = TRUE
         RETURNING id`,
        [nome, login, await auth.hashSenha(senhaCrua), papel]
      );
      ids[login] = r.rows[0].id;
    }

    // Cria um pedido real na cozinha para exercitar escrita protegida por CSRF entre abas.
    ids.categoria = (
      await pool.query('INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id', [`E2E abas ${sufixo}`])
    ).rows[0].id;
    ids.produto = (
      await pool.query(
        "INSERT INTO produtos (categoria_id, nome, preco, disponivel, setor) VALUES ($1, $2, 30.00, TRUE, 'cozinha') RETURNING id",
        [ids.categoria, `Prato abas ${sufixo}`]
      )
    ).rows[0].id;
    for (let n = 25; n <= 70 && !ids.mesa; n++) {
      try {
        const tok = randomUUID();
        ids.mesa = (
          await pool.query("INSERT INTO mesas (numero, token, status) VALUES ($1, $2, 'livre') RETURNING id", [n, tok])
        ).rows[0].id;
        ids.tokenMesa = tok;
      } catch (e) {
        if (e.code !== '23505') throw e;
      }
    }
    assert.ok(ids.mesa, 'sem mesa disponível para o E2E');
    await pool.query('UPDATE configuracao_mesas SET quantidade = 70 WHERE id = 1');

    const { criarPedido } = require('../../db/pedidos');
    const ped = await criarPedido(ids.tokenMesa, {
      clienteNome: `Cliente abas ${sufixo}`,
      items: [{ productId: ids.produto, qty: 1 }],
      idempotencyKey: randomUUID(),
    });
    ids.pedido = ped.id;
    ids.sessao = ped.sessaoId;

    servidor = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        DATABASE_URL,
        STAFF_SEED_PASSWORD: senhaCozinha,
        STAFF_FORCE_PASSWORD_CHANGE: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await esperarServidor(base);
    ok('servidor real no ar');

    browser = await pw.launch({
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, '--no-sandbox'],
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    const abrirAba = async () => {
      const p = await context.newPage();
      p.on('pageerror', (e) => errosPagina.push(String(e)));
      return p;
    };

    const entrarComo = async (p, rotuloSetor, senha, hashEsperado, sufixoRota = '') => {
      await p.goto(`${base}/#/login${sufixoRota}`, { waitUntil: 'load' });
      await p.locator(`button:has-text("${rotuloSetor}")`).first().click();
      await p.waitForSelector('#login-senha, input[type="password"]', { timeout: 15000 });
      await p.locator('input[type="password"]').first().fill(senha);
      await p.locator('button[type="submit"]').first().click();
      await p.waitForFunction((alvo) => location.hash.startsWith(`#/${alvo}`), hashEsperado, { timeout: 20000 });
    };

    const verificarSemTokensEmStorage = async (p) => {
      const dump = await p.evaluate(() => ({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
      }));
      const serializado = JSON.stringify(dump);
      assert.doesNotMatch(serializado, /csrfToken|lqr_session|[0-9a-f]{64}/i, 'nenhum token em web storage');
    };

    // 1. Login na Aba 1 -> Aba 2 (#/cozinha) e Aba 3 (#/login) reconhecem a sessão sem novo login.
    const aba1 = await abrirAba();
    await entrarComo(aba1, 'Cozinha', senhaCozinha, 'cozinha');
    ok('aba 1 entrou como Cozinha');

    const aba2 = await abrirAba();
    await aba2.goto(`${base}/#/cozinha`, { waitUntil: 'load' });
    await aba2.getByRole('button', { name: 'Sair' }).waitFor({ timeout: 15000 });
    assert.ok(aba2.url().includes('#/cozinha'), 'aba 2 permaneceu autenticada em #/cozinha sem pedir login');

    const aba3 = await abrirAba();
    await aba3.goto(`${base}/#/login`, { waitUntil: 'load' });
    await aba3.waitForFunction(() => location.hash.startsWith('#/cozinha'), null, { timeout: 15000 });
    ok('abas 2 e 3 reconheceram a sessão ativa sem exigir novo login');

    // 2. Reload da aba autenticada preserva a sessão.
    await aba2.reload({ waitUntil: 'load' });
    await aba2.getByRole('button', { name: 'Sair' }).waitFor({ timeout: 15000 });
    assert.ok(aba2.url().includes('#/cozinha'));
    ok('reload preservou a sessão válida');

    // 3. Falha transitória de rede em /api/me durante revalidação NÃO faz logout.
    let bloquearMe = true;
    await aba2.route('**/api/me', async (route) => {
      if (bloquearMe) {
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    // Limpa cache de apresentação de sessionStorage da aba 2 para forçar RotaStaff a aguardar /api/me no reload.
    await aba2.evaluate(() => sessionStorage.removeItem('pub-auth'));
    await aba2.reload({ waitUntil: 'load' });
    await aba2.getByText('Não foi possível confirmar sua sessão').waitFor({ timeout: 15000 });
    assert.ok(aba2.url().includes('#/cozinha'), 'falha de rede não redirecionou para #/login');
    bloquearMe = false;
    await aba2.getByRole('button', { name: 'Tentar novamente' }).click();
    await aba2.getByRole('button', { name: 'Sair' }).waitFor({ timeout: 15000 });
    await aba2.unroute('**/api/me');
    ok('falha transitória de rede não derrubou a sessão e recuperou ao tentar novamente');

    // 4. Troca de conta na Aba 3 (#/login?trocar=1 -> Caixa) sincroniza Aba 1 e aplica isolamento de perfil.
    await entrarComo(aba3, 'Caixa', senhaCaixa, 'caixa', '?trocar=1');
    await aba1.waitForFunction(() => location.hash.startsWith('#/caixa'), null, { timeout: 15000 });
    await aba2.waitForFunction(() => location.hash.startsWith('#/caixa'), null, { timeout: 15000 });
    ok('troca de conta para Caixa redirecionou automaticamente as abas de Cozinha para #/caixa');

    // 5. Troca de senha na Aba 3 rotaciona cookie + CSRF; Aba 1 faz chamada CSRF sem precisar recarregar.
    const csrfCaixaAntes = await aba1.evaluate(async () => (await (await fetch('/api/me', { credentials: 'include' })).json()).csrfToken);
    await aba3.getByRole('button', { name: 'Alterar senha', exact: true }).click();
    const dlg = aba3.getByRole('dialog');
    await dlg.waitFor({ timeout: 10000 });
    await dlg.locator('input[autocomplete="current-password"]').fill(senhaCaixa);
    await dlg.locator('input[name="new-password"]').fill(senhaCaixaNova);
    await dlg.locator('input[name="confirm-password"]').fill(senhaCaixaNova);
    await dlg.locator('button[type="submit"]').click();
    await dlg.getByRole('status').waitFor({ timeout: 15000 });
    await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    const csrfCaixaDepois = await aba3.evaluate(async () => (await (await fetch('/api/me', { credentials: 'include' })).json()).csrfToken);
    assert.notEqual(csrfCaixaDepois, csrfCaixaAntes, 'troca de senha rotacionou o token CSRF');

    // Aba 1 dispara uma ação protegida por CSRF através do cliente real da aplicação (alterar de volta para senhaCaixa).
    await aba1.getByRole('button', { name: 'Alterar senha', exact: true }).click();
    const dlgAba1 = aba1.getByRole('dialog');
    await dlgAba1.waitFor({ timeout: 10000 });
    await dlgAba1.locator('input[autocomplete="current-password"]').fill(senhaCaixaNova);
    await dlgAba1.locator('input[name="new-password"]').fill(senhaCaixa);
    await dlgAba1.locator('input[name="confirm-password"]').fill(senhaCaixa);
    await dlgAba1.locator('button[type="submit"]').click();
    await dlgAba1.getByRole('status').waitFor({ timeout: 15000 });
    ok('rotação de senha/CSRF sincronizou entre abas sem precisar recarregar');

    await verificarSemTokensEmStorage(aba1);
    await verificarSemTokensEmStorage(aba2);
    await verificarSemTokensEmStorage(aba3);
    ok('nenhum token de sessão ou CSRF em localStorage/sessionStorage');

    // 6. Revogação da sessão no servidor invalida as abas abertas quando qualquer aba consulta rota staff.
    await pool.query('DELETE FROM staff_sessoes WHERE staff_id = $1', [ids.caixa]);
    // Força foco/visibilidade para revalidar sessão e propagar expiração.
    await aba1.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await aba1.waitForFunction(() => location.hash.startsWith('#/login'), null, { timeout: 15000 });
    ok('revogação da sessão no servidor invalidou o acesso e levou para #/login');

    // Sincroniza aba2 também em #/login.
    await aba2.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await aba2.waitForFunction(() => location.hash.startsWith('#/login'), null, { timeout: 15000 });

    // 7. Login na Aba 1 tira automaticamente a Aba 2 de #/login para o setor autenticado.
    await entrarComo(aba1, 'Cozinha', senhaCozinha, 'cozinha');
    await aba2.waitForFunction(() => location.hash.startsWith('#/cozinha'), null, { timeout: 15000 });
    ok('login na aba 1 autenticou automaticamente a aba 2 aberta em #/login');

    // 8. Logout na Aba 1 encerra o cookie no servidor e leva a Aba 2 para #/login.
    await aba1.getByRole('button', { name: 'Sair' }).click();
    await aba1.waitForFunction(() => location.hash.startsWith('#/login'), null, { timeout: 15000 });
    await aba2.waitForFunction(() => location.hash.startsWith('#/login'), null, { timeout: 15000 });

    const statusMeAposLogout = await aba2.evaluate(async () => (await fetch('/api/me', { credentials: 'include' })).status);
    assert.equal(statusMeAposLogout, 401, 'cookie de sessão foi realmente invalidado no servidor após Sair');
    ok('logout propagou para todas as abas e encerrou a sessão no servidor');

    assert.deepEqual(errosPagina, [], 'nenhum erro JS não tratado nas abas');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (servidor) servidor.kill('SIGTERM');
    try {
      if (ids.pedido) {
        await pool.query('DELETE FROM itens_pedido WHERE pedido_id = $1', [ids.pedido]).catch(() => {});
        await pool.query('DELETE FROM pedidos WHERE id = $1', [ids.pedido]).catch(() => {});
      }
      if (ids.sessao) await pool.query('DELETE FROM mesa_sessoes WHERE id = $1', [ids.sessao]).catch(() => {});
      if (ids.produto) await pool.query('DELETE FROM produtos WHERE id = $1', [ids.produto]).catch(() => {});
      if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id = $1', [ids.categoria]).catch(() => {});
      if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id = $1', [ids.mesa]).catch(() => {});
    } finally {
      await pool.end().catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
