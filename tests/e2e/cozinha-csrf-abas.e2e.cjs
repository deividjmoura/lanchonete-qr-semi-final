'use strict';

/**
 * E2E em Chromium real do "Token CSRF ausente ou inválido" em Cozinha/Bar.
 *
 * Reproduz o cenário do operador: a Cozinha está aberta numa aba, alguém entra
 * de novo em outra aba (o cookie de sessão tem Path=/ e vale para o navegador
 * inteiro) e a primeira aba tenta avançar um item. Antes da correção o servidor
 * respondia 403, o item voltava para "Na fila" e era preciso recarregar a página.
 *
 * Duas páginas no MESMO context = mesmo cookie, como duas abas de verdade.
 * Sobe o servidor Node real contra PostgreSQL descartável:
 *   NODE_ENV=test DATABASE_URL=...qradmin_test node tests/e2e/cozinha-csrf-abas.e2e.cjs
 */

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
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
  const sufixo = randomUUID().slice(0, 8);
  const login = 'cozinha';
  const senha = 'Senha-Ficticia-E2E-1';
  const ids = {};
  let servidor, browser;
  const passos = [];
  const ok = (m) => { passos.push(m); console.log('  ✓ ' + m); };

  try {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = DATABASE_URL;
    const auth = require('../../db/auth');

    /* A tela de login usa os perfis fixos (admin/cozinha/bar/caixa). Usamos o
       seed real 'cozinha' com senha de teste, para exercer o fluxo verdadeiro
       em vez de criar um usuário que a tela não consegue usar. */
    await pool.query(
      `INSERT INTO staff (nome,login,senha_hash,papel,deve_trocar_senha)
       VALUES ('Cozinha','cozinha',$1,'cozinha',FALSE)
       ON CONFLICT (login) DO UPDATE
         SET senha_hash=EXCLUDED.senha_hash, deve_trocar_senha=FALSE, ativo=TRUE`,
      [await auth.hashSenha(senha)]
    );
    ids.staff = (await pool.query("SELECT id FROM staff WHERE login='cozinha'")).rows[0].id;

    ids.categoria = (await pool.query('INSERT INTO categorias (nome,ordem) VALUES ($1,0) RETURNING id', ['E2E csrf ' + sufixo])).rows[0].id;
    ids.produto = (await pool.query(
      `INSERT INTO produtos (categoria_id,nome,preco,disponivel,setor) VALUES ($1,$2,25.00,TRUE,'cozinha') RETURNING id`,
      [ids.categoria, 'Prato csrf ' + sufixo]
    )).rows[0].id;
    const tokenMesa = randomUUID();
    for (let n = 20; n <= 70 && !ids.mesa; n++) {
      try {
        ids.mesa = (await pool.query("INSERT INTO mesas (numero,token,status) VALUES ($1,$2,'livre') RETURNING id", [n, tokenMesa])).rows[0].id;
        ids.numero = n;
        ids.tokenMesa = tokenMesa;
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    assert.ok(ids.mesa, 'sem mesa livre');
    await pool.query('UPDATE configuracao_mesas SET quantidade=70 WHERE id=1');

    // Pedido criado pelas funções reais do backend, direto na fila de produção.
    const { criarPedido } = require('../../db/pedidos');
    const pedido = await criarPedido(ids.tokenMesa, {
      clienteNome: 'Cliente csrf',
      items: [{ productId: ids.produto, qty: 2 }],
      idempotencyKey: randomUUID(),
    });
    ids.pedido = pedido.id;
    ids.sessao = pedido.sessaoId;
    ids.itens = (await pool.query("SELECT id FROM itens_pedido WHERE pedido_id=$1 AND setor='cozinha' ORDER BY id", [ids.pedido])).rows.map((r) => r.id);
    assert.ok(ids.itens.length >= 1, 'pedido sem item de cozinha');

    servidor = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL, STAFF_SEED_PASSWORD: senha, STAFF_FORCE_PASSWORD_CHANGE: 'false' },
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
    // Um único context: as duas páginas compartilham o cookie, como abas reais.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const errosPagina = [];
    const alertas = [];
    const respostas403 = [];

    const abrirAba = async () => {
      const p = await context.newPage();
      p.on('pageerror', (e) => errosPagina.push(String(e)));
      p.on('dialog', async (d) => { alertas.push(d.message()); await d.dismiss(); });
      p.on('response', (r) => {
        if (r.status() === 403 && r.url().includes('/api/')) respostas403.push(r.url());
      });
      return p;
    };

    const entrar = async (p) => {
      await p.goto(base + '/#/login', { waitUntil: 'load' });
      // escolhe o perfil Cozinha, o que revela o formulário
      await p.locator('button:has-text("Cozinha")').first().click();
      await p.waitForSelector('#login-senha, input[type="password"]', { timeout: 15000 });
      await p.locator('input[type="password"]').first().fill(senha);
      await p.locator('button[type="submit"]').first().click();
      await p.waitForFunction(() => location.hash.includes('cozinha'), null, { timeout: 20000 });
    };

    const abaCozinha = await abrirAba();
    await entrar(abaCozinha);
    ok('aba 1 entrou como cozinha e caiu na tela da cozinha');

    // A aba 1 precisa ter feito uma escrita com o token atual, para depois
    // ficar com um token velho em memória quando a sessão trocar.
    const csrfAba1 = await abaCozinha.evaluate(async () => {
      const r = await fetch('/api/me', { credentials: 'include' });
      const j = await r.json();
      return j.csrfToken;
    });
    assert.ok(csrfAba1 && csrfAba1.length === 64, 'aba 1 tem token CSRF');

    /* Segunda aba entra por fetch direto, sem passar pelo cliente HTTP.
       É o caso real das páginas legadas (o servidor ainda aceita esse
       fallback) e também equivale à aba que foi suspensa e perdeu o aviso:
       o cookie muda para o navegador inteiro sem nenhum BroadcastChannel.
       Assim o teste exercita o RETRY, não só o aviso entre abas. */
    const aba2 = await abrirAba();
    await aba2.goto(base + '/#/login', { waitUntil: 'load' });
    const login2 = await aba2.evaluate(async ({ usuario, senha }) => {
      const r = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });
      return r.status;
    }, { usuario: login, senha });
    assert.equal(login2, 200, 'segunda aba autenticou');
    ok('aba 2 entrou de novo e trocou o cookie de sessão do navegador');

    const csrfDepois = await abaCozinha.evaluate(async () => {
      const r = await fetch('/api/me', { credentials: 'include' });
      const j = await r.json();
      return j.csrfToken;
    });
    assert.notEqual(csrfDepois, csrfAba1, 'o token da sessão realmente mudou');
    ok('confirmado: o token em memória da aba 1 ficou velho');

    /* O ponto do teste: a aba 1 clicou no botão da tela com o token velho em
       memória. Antes da correção isso dava 403, o item voltava para "Na fila"
       e aparecia um alert. Agora o cliente renova o token e repete sozinho. */
    await abaCozinha.bringToFront();
    await abaCozinha.goto(base + '/#/cozinha', { waitUntil: 'load' });
    await abaCozinha.waitForSelector('text=Iniciar este item', { timeout: 20000 });
    const antes403 = respostas403.length;
    await abaCozinha.locator('button:has-text("Iniciar este item")').first().click();

    // O item precisa avançar no banco, não só parecer avançado na tela.
    let avancou = false;
    for (let i = 0; i < 40; i++) {
      const r = await pool.query('SELECT status FROM itens_pedido WHERE id=$1', [ids.itens[0]]);
      if (r.rows[0].status === 'em_producao') { avancou = true; break; }
      await new Promise((r2) => setTimeout(r2, 250));
    }
    assert.ok(avancou, 'o clique da aba antiga avançou o item no banco');
    ok('aba antiga avançou o item clicando no botão, sem recarregar a página');

    const faixaErro = await abaCozinha.locator('text=/Token CSRF/').count();
    assert.equal(faixaErro, 0, 'não sobrou mensagem de CSRF na tela');
    ok('nenhuma mensagem de CSRF sobrou na tela');
    if (respostas403.length > antes403) {
      ok('houve 403 e o cliente se recuperou sozinho (retry observável)');
    }

    const status = (await pool.query('SELECT status FROM itens_pedido WHERE id=$1', [ids.itens[0]])).rows[0].status;
    assert.equal(status, 'em_producao', 'o item avançou no banco');
    ok('item gravado como em produção no banco');

    // A proteção continua valendo: sem token e com origem estranha, recusa.
    const semToken = await abaCozinha.evaluate(async (itemId) => {
      const r = await fetch(`/api/cozinha/itens/${itemId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': '0'.repeat(64) },
        body: JSON.stringify({ status: 'concluido' }),
      });
      return r.status;
    }, ids.itens[0]);
    assert.equal(semToken, 403, 'token forjado continua sendo recusado');
    ok('token forjado segue recusado com 403');

    assert.deepEqual(alertas, [], 'nenhum alert nativo bloqueou a operação');
    assert.deepEqual(errosPagina, [], 'sem erro de JavaScript: ' + errosPagina.join(' | '));
    ok('nenhum alert nativo e nenhum erro de JavaScript');

    console.log(`\nE2E OK — ${passos.length} verificações em Chromium real`);
  } catch (e) {
    console.error('\nFALHOU:', e && e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (servidor) servidor.kill('SIGTERM');
    if (ids.pedido) await pool.query('DELETE FROM itens_pedido WHERE pedido_id=$1', [ids.pedido]).catch(() => {});
    if (ids.pedido) await pool.query('DELETE FROM pedidos WHERE id=$1', [ids.pedido]).catch(() => {});
    if (ids.sessao) await pool.query('DELETE FROM mesa_sessoes WHERE id=$1', [ids.sessao]).catch(() => {});
    if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id=$1', [ids.mesa]).catch(() => {});
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id=$1', [ids.produto]).catch(() => {});
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id=$1', [ids.categoria]).catch(() => {});
    if (ids.staff) {
      await pool.query('DELETE FROM staff_sessoes WHERE staff_id=$1', [ids.staff]).catch(() => {});
      await pool.query('DELETE FROM staff_credencial_eventos WHERE staff_id=$1', [ids.staff]).catch(() => {});
    }
    await pool.end().catch(() => {});
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
