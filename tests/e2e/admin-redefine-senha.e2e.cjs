'use strict';

/**
 * E2E em Chromium real da redefinição de senha pelo admin.
 *
 * Cobre o pedido do operador: a senha da Cozinha foi esquecida; o Admin deve
 * conseguir definir uma nova senha para qualquer setor (inclusive a própria)
 * sem digitar a senha antiga. O fluxo não-admin continua exigindo a senha atual.
 *
 * Sobe o servidor Node real contra PostgreSQL descartável:
 *   NODE_ENV=test DATABASE_URL=...qradmin_test node tests/e2e/admin-redefine-senha.e2e.cjs
 */

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

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
    } catch (_) {}
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
  const senhaAdmin = 'Senha-Ficticia-Admin-E2E-1';
  const senhaCozinhaAntiga = 'Senha-Ficticia-Cozinha-E2E-1';
  const senhaCozinhaNova = 'Nova-Senha-Preparo-E2E-2026';
  const senhaAdminNova = 'Nova-Senha-Gestao-E2E-2026';
  const ids = {};
  let servidor, browser;
  const passos = [];
  const ok = (m) => { passos.push(m); console.log('  ✓ ' + m); };

  try {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = DATABASE_URL;
    const auth = require('../../db/auth');

    // Perfis fixos da tela de login, com senhas sintéticas e sem troca obrigatória.
    for (const [login, papel, senha] of [
      ['admin', 'admin', senhaAdmin],
      ['cozinha', 'cozinha', senhaCozinhaAntiga],
      ['bar', 'bar', 'Senha-Ficticia-Bar-E2E-1'],
      ['caixa', 'caixa', 'Senha-Ficticia-Caixa-E2E-1'],
    ]) {
      await pool.query(
        `INSERT INTO staff (nome, login, senha_hash, papel, deve_trocar_senha, ativo)
         VALUES ($1, $2, $3, $4, FALSE, TRUE)
         ON CONFLICT (login) DO UPDATE
           SET senha_hash = EXCLUDED.senha_hash, papel = EXCLUDED.papel,
               deve_trocar_senha = FALSE, ativo = TRUE`,
        [login === 'admin' ? 'Administrador' : login[0].toUpperCase() + login.slice(1), login, await auth.hashSenha(senha), papel]
      );
      ids[login] = (await pool.query('SELECT id FROM staff WHERE login = $1', [login])).rows[0].id;
    }
    // Uma sessão antiga da Cozinha para provar a revogação.
    await auth.criarSessao(ids.cozinha);

    servidor = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        DATABASE_URL,
        STAFF_SEED_PASSWORD: senhaAdmin,
        STAFF_FORCE_PASSWORD_CHANGE: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logServidor = '';
    servidor.stdout.on('data', (d) => { logServidor += d; });
    servidor.stderr.on('data', (d) => { logServidor += d; });
    await esperarServidor(base);
    ok('servidor real no ar');

    browser = await pw.launch({
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, '--no-sandbox'],
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errosPagina = [];
    const alertas = [];
    page.on('pageerror', (e) => errosPagina.push(String(e)));
    page.on('dialog', async (d) => { alertas.push(d.message()); await d.dismiss(); });

    const entrar = async (papel, senha) => {
      await page.goto(base + '/#/login', { waitUntil: 'load' });
      await page.locator(`button:has-text("${papel}")`).first().click();
      await page.waitForSelector('#login-senha, input[type="password"]', { timeout: 15000 });
      await page.locator('input[type="password"]').first().fill(senha);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForFunction((p) => location.hash.includes(p), papel.toLowerCase(), { timeout: 20000 });
    };

    await entrar('Admin', senhaAdmin);
    ok('admin entrou pela tela real de login');

    const csrfAntes = await page.evaluate(async () => {
      const r = await fetch('/api/me', { credentials: 'include' });
      return (await r.json()).csrfToken;
    });

    // Abre o diálogo pelo botão do shell e escolhe a Cozinha.
    await page.getByRole('button', { name: 'Redefinir senha de um setor' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.locator('input[autocomplete="current-password"]').count(), 0, 'admin não deve ver senha atual');
    const seletor = dialog.getByLabel('Setor');
    await seletor.waitFor();
    await page.waitForFunction(() => {
      const s = document.querySelector('select[name="setor"]');
      return s && [...s.options].some((o) => o.value === 'cozinha');
    }, null, { timeout: 15000 });
    ok('diálogo do admin pergunta o setor e não pede a senha antiga');

    await seletor.selectOption('cozinha');
    await dialog.locator('input[name="new-password"]').fill(senhaCozinhaNova);
    await dialog.locator('input[name="confirm-password"]').fill(senhaCozinhaNova);
    await dialog.locator('button[type="submit"]').click();
    await dialog.getByRole('status').waitFor({ timeout: 15000 });
    ok('redefinição da Cozinha confirmada na tela');

    // Confirma no banco: hash novo, senha antiga inválida, sessões revogadas, auditoria com ator.
    const rowCozinha = (await pool.query('SELECT senha_hash FROM staff WHERE id = $1', [ids.cozinha])).rows[0];
    assert.equal(await auth.verificarSenha(senhaCozinhaNova, rowCozinha.senha_hash), true);
    assert.equal(await auth.verificarSenha(senhaCozinhaAntiga, rowCozinha.senha_hash), false);
    assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE staff_id = $1', [ids.cozinha])).rowCount, 0);
    const evCozinha = (await pool.query(
      "SELECT ator_staff_id, ator_login, sessoes_revogadas FROM staff_credencial_eventos WHERE staff_id = $1 AND evento = 'senha_redefinida' ORDER BY id DESC LIMIT 1",
      [ids.cozinha]
    )).rows[0];
    assert.equal(evCozinha.ator_staff_id, ids.admin);
    assert.equal(evCozinha.ator_login, 'admin');
    assert.ok(evCozinha.sessoes_revogadas >= 1);
    ok('banco confirma nova senha da Cozinha, sessões revogadas e auditoria do ator');

    // Admin redefine a própria senha e não perde o acesso.
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: 'Redefinir senha de um setor' }).click();
    await dialog.waitFor();
    await page.waitForFunction(() => {
      const s = document.querySelector('select[name="setor"]');
      return s && [...s.options].some((o) => o.value === 'admin');
    }, null, { timeout: 15000 });
    await dialog.getByLabel('Setor').selectOption('admin');
    await dialog.locator('input[name="new-password"]').fill(senhaAdminNova);
    await dialog.locator('input[name="confirm-password"]').fill(senhaAdminNova);
    await dialog.locator('button[type="submit"]').click();
    await dialog.getByRole('status').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => location.hash.includes('admin'), null, { timeout: 10000 });
    const meDepois = await page.evaluate(async () => {
      const r = await fetch('/api/me', { credentials: 'include' });
      return { status: r.status, body: await r.json() };
    });
    assert.equal(meDepois.status, 200);
    assert.equal(meDepois.body.staff.papel, 'admin');
    assert.notEqual(meDepois.body.csrfToken, csrfAntes, 'cookie/sessão do admin rotacionou');
    const rowAdmin = (await pool.query('SELECT senha_hash FROM staff WHERE id = $1', [ids.admin])).rows[0];
    assert.equal(await auth.verificarSenha(senhaAdminNova, rowAdmin.senha_hash), true);
    assert.equal(await auth.verificarSenha(senhaAdmin, rowAdmin.senha_hash), false);
    ok('admin redefiniu a própria senha sem a antiga e continuou autenticado');

    // Sai e entra como Cozinha com a senha nova; o diálogo dela ainda pede a senha atual.
    await page.getByRole('button', { name: 'Sair' }).click();
    await entrar('Cozinha', senhaCozinhaNova);
    ok('Cozinha entrou com a senha redefinida pelo admin');

    // Não-admin não pode usar as rotas de recuperação do admin.
    const negado = await page.evaluate(async () => {
      const me = await (await fetch('/api/me', { credentials: 'include' })).json();
      const lista = await fetch('/api/admin/contas', { credentials: 'include' });
      const reset = await fetch('/api/admin/contas/senha', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
        body: JSON.stringify({ login: 'bar', senhaNova: 'Tentativa-Indevida-E2E-2026' }),
      });
      return { lista: lista.status, reset: reset.status };
    });
    assert.equal(negado.lista, 403);
    assert.equal(negado.reset, 403);
    ok('setor não-admin continua sem permissão para redefinir senhas');

    await page.getByRole('button', { name: 'Alterar senha', exact: true }).click();
    await dialog.waitFor();
    assert.equal(await dialog.locator('input[autocomplete="current-password"]').count(), 1, 'não-admin ainda informa a senha atual');
    assert.equal(await dialog.locator('select[name="setor"]').count(), 0, 'não-admin não escolhe setor');
    ok('troca de senha do não-admin permanece com senha atual');

    assert.deepEqual(alertas, [], 'nenhum alert nativo');
    assert.deepEqual(errosPagina, [], 'sem erro de JavaScript: ' + errosPagina.join(' | '));
    ok('nenhum alert nativo e nenhum erro de JavaScript');

    console.log(`\nE2E OK — ${passos.length} verificações em Chromium real`);
  } catch (e) {
    console.error('\nFALHOU:', e && e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (servidor) servidor.kill('SIGTERM');
    for (const id of Object.values(ids)) {
      await pool.query('DELETE FROM staff_sessoes WHERE staff_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM staff_credencial_eventos WHERE staff_id = $1 OR ator_staff_id = $1', [id]).catch(() => {});
    }
    await pool.end().catch(() => {});
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
