'use strict';

// Navegador e servidor reais, sempre com dados sintéticos em banco descartável.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL descartável');
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname), 'PostgreSQL local/CI obrigatório');
assert.equal(databaseUrl.pathname, '/qradmin_test');
assert.equal(process.env.NODE_ENV, 'test');
const ROOT = path.join(__dirname, '..', '..');
const pool = require('../../db/pool');
const auth = require('../../db/auth');
const { chromium: pw } = require('playwright-core');
const chromium = require('@sparticuz/chromium').default;

function portaLivre() {
  return new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.on('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const porta = servidor.address().port;
      servidor.close(() => resolve(porta));
    });
  });
}
async function esperarServidor(base) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/healthz'); if (r.ok || r.status === 503) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Servidor não iniciou');
}

async function main() {
  const tag = randomUUID().slice(0, 8);
  const ids = { staff: [], mesa: null, sessoes: [], pedidos: [], produto: null, categoria: null };
  let servidor, browser;
  try {
    async function staff(papel) {
      const nome = `${papel} paginação ${tag}`;
      const login = `${papel}-pag-${tag}`;
      const senha = await auth.hashSenha(`Senha-Fixture-${papel}-${tag}`);
      const row = (await pool.query(`INSERT INTO staff(nome,login,senha_hash,papel,ativo,deve_trocar_senha)
        VALUES($1,$2,$3,$4,TRUE,FALSE) RETURNING id,nome,login,papel`, [nome, login, senha, papel])).rows[0];
      ids.staff.push(row.id);
      return { ...row, sessao: await auth.criarSessao(row.id) };
    }
    const admin = await staff('admin');
    const cozinha = await staff('cozinha');
    const caixa = await staff('caixa');
    const numero = 100000 + Math.floor(Math.random() * 800000);
    ids.mesa = (await pool.query('INSERT INTO mesas(numero) VALUES($1) RETURNING id', [numero])).rows[0].id;
    const sessoes = await pool.query(`INSERT INTO mesa_sessoes(mesa_id,status,fechada_em,cliente_nome,valor_total)
      SELECT $1,'fechada','2042-06-02 12:00:00.123456+00'::timestamptz + n*interval '1 microsecond',
        $2, 20 FROM generate_series(1,32) n RETURNING id`, [ids.mesa, `Cliente ${tag}`]);
    ids.sessoes.push(...sessoes.rows.map((r) => r.id));
    ids.categoria = (await pool.query('INSERT INTO categorias(nome,ordem) VALUES($1,0) RETURNING id', [`Categoria ${tag}`])).rows[0].id;
    ids.produto = (await pool.query('INSERT INTO produtos(categoria_id,nome,preco) VALUES($1,$2,20) RETURNING id', [ids.categoria, `Item ${tag}`])).rows[0].id;
    const pedidos = await pool.query(`INSERT INTO pedidos(sessao_id,status,cliente_nome,criado_em)
      SELECT id,'entregue',$2,'2042-06-02 12:00:00.123456+00'::timestamptz + id*interval '1 microsecond'
      FROM mesa_sessoes WHERE id=ANY($1::int[]) RETURNING id`, [ids.sessoes, `Cliente ${tag}`]);
    ids.pedidos.push(...pedidos.rows.map((r) => r.id));
    await pool.query(`INSERT INTO itens_pedido(pedido_id,produto_id,quantidade,preco_unitario,status)
      SELECT unnest($1::int[]),$2,1,20,'entregue'`, [ids.pedidos, ids.produto]);

    const port = await portaLivre();
    const base = `http://127.0.0.1:${port}`;
    servidor = spawn(process.execPath, ['server.js'], {
      cwd: ROOT, env: { ...process.env, PORT: String(port), NODE_ENV: 'test', STAFF_FORCE_PASSWORD_CHANGE: 'false', STAFF_SEED_PASSWORD: `Senha-Seed-${tag}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    servidor.stdout.on('data', (d) => { logs += d; });
    servidor.stderr.on('data', (d) => { logs += d; });
    await esperarServidor(base);
    browser = await pw.launch({
      executablePath: await chromium.executablePath(),
      args: [...chromium.args.filter((a) => a !== '--single-process' && a !== '--no-zygote'), '--no-sandbox'],
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addCookies([{ name: 'lqr_session', value: admin.sessao, url: base, httpOnly: true, sameSite: 'Lax' }]);
    await context.addInitScript((dados) => {
      try { sessionStorage.setItem('pub-auth', JSON.stringify({ role: 'admin', nome: dados.nome, login: dados.login, deveTrocar: false })); } catch (_) {}
      const original = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...args) => original(fn, ms === 20000 ? 1000 : ms, ...args);
    }, admin);
    const page = await context.newPage();
    const erros = [], requisicoes = [];
    page.on('pageerror', (e) => erros.push(e.message));
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (u.pathname === '/api/caixa/comprovantes' || u.pathname === '/api/admin/pedidos') requisicoes.push(u);
    });
    await page.goto(base + '/#/admin/funcoes', { waitUntil: 'load' });
    await page.getByRole('heading', { name: 'Funções', level: 1 }).waitFor();
    await page.getByRole('button', { name: 'Relatório', exact: true }).click();
    await page.getByRole('button', { name: 'Comprovantes recentes', exact: true }).click();
    const comprovantes = page.getByRole('region', { name: 'Comprovantes de contas fechadas' });
    await comprovantes.getByRole('button', { name: 'Imprimir' }).nth(4).waitFor();
    assert.equal(await comprovantes.getByRole('button', { name: 'Imprimir' }).count(), 5);
    await comprovantes.getByRole('button', { name: 'Carregar mais' }).click();
    await comprovantes.getByRole('button', { name: 'Imprimir' }).nth(9).waitFor();
    assert.equal(await comprovantes.getByRole('button', { name: 'Imprimir' }).count(), 10);
    assert.ok(requisicoes.some((u) => u.pathname === '/api/caixa/comprovantes' && u.searchParams.get('cursor') && u.searchParams.get('limit') === '5'));

    // Enquanto a lista está expandida, o polling não desloca as páginas já
    // consultadas: sinaliza a alteração, e Atualizar volta ao começo.
    const nova = (await pool.query(`INSERT INTO mesa_sessoes(mesa_id,status,fechada_em,cliente_nome,valor_total)
      VALUES($1,'fechada','2099-01-01T12:00:00Z',$2,25) RETURNING id`, [ids.mesa, `Novo ${tag}`])).rows[0];
    ids.sessoes.push(nova.id);
    await comprovantes.getByText(/Há alterações nos comprovantes recentes/i).waitFor({ timeout: 10000 });
    assert.equal(await comprovantes.getByRole('button', { name: 'Imprimir' }).count(), 10);
    assert.equal(await comprovantes.getByText(`Conta #${nova.id}`).count(), 0);
    await comprovantes.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await comprovantes.getByText(`Conta #${nova.id}`).waitFor();
    assert.equal(await comprovantes.getByRole('button', { name: 'Imprimir' }).count(), 5);
    console.log('  ✓ comprovantes buscam páginas reais; polling preserva a posição');

    await page.getByRole('button', { name: 'Histórico', exact: true }).click();
    const historico = page.getByRole('region', { name: 'Histórico de pedidos' });
    await historico.getByLabel('De', { exact: true }).fill('2042-06-02');
    await historico.getByLabel('Até', { exact: true }).fill('2042-06-02');
    await historico.getByRole('button', { name: 'Buscar', exact: true }).click();
    await historico.locator('button[aria-expanded]').nth(9).waitFor();
    assert.equal(await historico.locator('button[aria-expanded]').count(), 10);
    await historico.locator('button[aria-expanded]').first().click();
    await historico.getByText(`Item ${tag}`).waitFor();
    await historico.getByRole('button', { name: 'Carregar mais' }).click();
    await historico.locator('button[aria-expanded]').nth(19).waitFor();
    assert.equal(await historico.locator('button[aria-expanded]').count(), 20);
    assert.ok(requisicoes.some((u) => u.pathname === '/api/admin/pedidos' && u.searchParams.get('cursor') && u.searchParams.get('limit') === '10'));
    await historico.getByRole('button', { name: 'Mostrar menos' }).click();
    assert.equal(await historico.locator('button[aria-expanded]').count(), 10);
    await historico.getByLabel('De', { exact: true }).fill('2042-06-03');
    await historico.getByLabel('Até', { exact: true }).fill('2042-06-03');
    await historico.getByRole('button', { name: 'Buscar', exact: true }).click();
    await historico.getByText('Nenhum pedido neste período.').waitFor();
    await historico.getByLabel('De', { exact: true }).fill('2042-06-04');
    await historico.getByLabel('Até', { exact: true }).fill('2042-06-03');
    await historico.getByRole('button', { name: 'Buscar', exact: true }).click();
    await historico.getByRole('alert').getByText(/data inicial não pode ser posterior/i).waitFor();
    console.log('  ✓ histórico pagina no servidor, expande itens, recolhe e valida filtros');

    const adminHttp = await page.evaluate(async () => {
      const get = async (url) => { const r = await fetch(url); return { status: r.status, body: await r.json() }; };
      return {
        invalido: await get('/api/admin/pedidos?paginado=1&limit=500'),
        cursor: await get('/api/caixa/comprovantes?paginado=1&cursor=invalido'),
        legado: await get('/api/caixa/comprovantes'),
      };
    });
    assert.equal(adminHttp.invalido.status, 400);
    assert.equal(adminHttp.cursor.status, 400);
    assert.ok(Array.isArray(adminHttp.legado.body));
    assert.ok(adminHttp.legado.body.length <= 25);
    for (const pessoa of [cozinha, caixa]) {
      const ctx = await browser.newContext();
      await ctx.addCookies([{ name: 'lqr_session', value: pessoa.sessao, url: base, httpOnly: true, sameSite: 'Lax' }]);
      const outra = await ctx.newPage();
      await outra.goto(base + '/#/' + pessoa.papel);
      const status = await outra.evaluate(async () => ({
        historico: (await fetch('/api/admin/pedidos?paginado=1')).status,
        comprovantes: (await fetch('/api/caixa/comprovantes?paginado=1')).status,
      }));
      assert.equal(status.historico, 403);
      assert.equal(status.comprovantes, pessoa.papel === 'caixa' ? 200 : 403);
      await ctx.close();
    }
    assert.deepEqual(erros, [], `sem erros de JavaScript; logs: ${logs.slice(-1500)}`);
    console.log('  ✓ limites, contrato legado e permissões de admin/caixa/cozinha');
  } finally {
    const falhas = [];
    if (browser) { try { await browser.close(); } catch (e) { falhas.push(e.message); } }
    if (servidor && servidor.exitCode === null && servidor.signalCode === null) {
      await new Promise((resolve) => { servidor.once('exit', resolve); servidor.kill('SIGTERM'); });
    }
    async function limpar(sql, params) { try { await pool.query(sql, params); } catch (e) { falhas.push(e.message); } }
    if (ids.pedidos.length) await limpar('DELETE FROM pedidos WHERE id=ANY($1::int[])', [ids.pedidos]);
    if (ids.sessoes.length) await limpar('DELETE FROM mesa_sessoes WHERE id=ANY($1::int[])', [ids.sessoes]);
    if (ids.mesa) await limpar('DELETE FROM mesas WHERE id=$1', [ids.mesa]);
    if (ids.produto) await limpar('DELETE FROM produtos WHERE id=$1', [ids.produto]);
    if (ids.categoria) await limpar('DELETE FROM categorias WHERE id=$1', [ids.categoria]);
    if (ids.staff.length) await limpar('DELETE FROM staff WHERE id=ANY($1::int[])', [ids.staff]);
    await pool.end();
    if (falhas.length) { console.error('Falha ao limpar fixtures:', falhas.join('; ')); process.exitCode = 1; }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
