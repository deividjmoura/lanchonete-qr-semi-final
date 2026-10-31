'use strict';

// Fluxo real de UI + autorização/CSRF com PostgreSQL descartável.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do banco descartável');
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname), 'PostgreSQL local/CI obrigatório');
assert.strictEqual(databaseUrl.pathname, '/qradmin_test', 'Banco de teste obrigatório');
assert.strictEqual(process.env.NODE_ENV, 'test', 'NODE_ENV=test obrigatório');
const ROOT = path.join(__dirname, '..', '..');
const pool = require('../../db/pool');
const auth = require('../../db/auth');
const { chromium: pw } = require('playwright-core');
const chromium = require('@sparticuz/chromium').default;

function portaLivre() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
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
  const ids = { staff: [], garcons: [], mesa: null, sessao: null };
  let servidor, browser;
  try {
    const criarStaff = async (papel) => {
      const nome = `${papel} remoção ${tag}`;
      const login = `${papel}-remocao-${tag}`;
      const hash = await auth.hashSenha(`Senha-Sintetica-${papel}-${tag}`);
      const r = await pool.query(
        `INSERT INTO staff(nome,login,senha_hash,papel,ativo,deve_trocar_senha)
         VALUES($1,$2,$3,$4,TRUE,FALSE) RETURNING id,nome,login,papel`, [nome, login, hash, papel]
      );
      ids.staff.push(r.rows[0].id);
      return { ...r.rows[0], sessao: await auth.criarSessao(r.rows[0].id) };
    };
    const criarGarcom = async (nome) => {
      const r = await pool.query('INSERT INTO garcons(nome,token) VALUES($1,$2) RETURNING id,nome,token', [`${nome} ${tag}`, randomUUID()]);
      ids.garcons.push(r.rows[0].id);
      return r.rows[0];
    };
    const admin = await criarStaff('admin');
    const caixa = await criarStaff('caixa');
    const ocupado = await criarGarcom('Garçom ocupado');
    const livre = await criarGarcom('Garçom livre');
    const destino = await criarGarcom('Garçom destino');
    for (let numero = 1; numero <= 20 && !ids.mesa; numero++) {
      const r = await pool.query("INSERT INTO mesas(numero,status) VALUES($1,'ocupada') ON CONFLICT(numero) DO NOTHING RETURNING id,numero", [numero]);
      if (r.rows[0]) ids.mesa = r.rows[0];
    }
    assert.ok(ids.mesa, 'mesa de fixture disponível');
    ids.sessao = (await pool.query(
      "INSERT INTO mesa_sessoes(mesa_id,status,garcom_responsavel_id) VALUES($1,'aberta',$2) RETURNING id", [ids.mesa.id, ocupado.id]
    )).rows[0].id;

    const port = await portaLivre();
    const base = `http://127.0.0.1:${port}`;
    servidor = spawn(process.execPath, ['server.js'], {
      cwd: ROOT, env: { ...process.env, PORT: String(port), NODE_ENV: 'test', STAFF_FORCE_PASSWORD_CHANGE: 'false', STAFF_SEED_PASSWORD: `Senha-fixture-${tag}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    servidor.stdout.on('data', (d) => { logs += d; });
    servidor.stderr.on('data', (d) => { logs += d; });
    await esperarServidor(base);
    // O modo single-process do Chromium empacotado pode encerrar com SIGTRAP
    // ao criar múltiplos contextos; a suíte visual usa o mesmo filtro.
    browser = await pw.launch({
      executablePath: await chromium.executablePath(),
      args: [...chromium.args.filter((arg) => arg !== '--single-process' && arg !== '--no-zygote'), '--no-sandbox'],
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'lqr_session', value: admin.sessao, url: base, httpOnly: true, sameSite: 'Lax' }]);
    await context.addInitScript((dados) => {
      try { sessionStorage.setItem('pub-auth', JSON.stringify({ role: 'admin', nome: dados.nome, login: dados.login, deveTrocar: false })); } catch (_) {}
    }, admin);
    const page = await context.newPage();
    const erros = [], confirmacoes = [];
    page.on('pageerror', (e) => erros.push(String(e)));
    page.on('dialog', async (dialog) => { confirmacoes.push(dialog.message()); await dialog.accept(); });
    await page.goto(base + '/#/admin/garcons', { waitUntil: 'load' });
    await page.getByRole('heading', { name: 'Garçons', level: 1 }).waitFor();
    const secao = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Credenciais de garçom' }) });
    await secao.getByRole('button', { name: `Remover ${ocupado.nome}` }).waitFor();

    // Páginas legadas aceitam sem header quando Origin/Referer é same-origin;
    // sem ambos, e também com um token explicitamente inválido, devem negar.
    const semCsrf = await fetch(`${base}/api/admin/garcons/${livre.id}`, {
      method: 'DELETE', headers: { Cookie: `lqr_session=${admin.sessao}` },
    });
    assert.equal(semCsrf.status, 403, 'DELETE sem CSRF e sem origem confiável é bloqueado');
    const csrfInvalido = await page.evaluate(async (id) => (await fetch(`/api/admin/garcons/${id}`, {
      method: 'DELETE', headers: { 'X-CSRF-Token': '0'.repeat(64) },
    })).status, livre.id);
    assert.equal(csrfInvalido, 403, 'CSRF inválido é bloqueado mesmo com origem same-origin');
    await secao.getByRole('button', { name: `Remover ${ocupado.nome}` }).click();
    await secao.getByRole('alert').getByText(/atendimento aberto nas mesas/i).waitFor();
    assert.equal(await secao.getByRole('button', { name: `Remover ${ocupado.nome}` }).count(), 1);
    await secao.getByRole('button', { name: `Desativar ${ocupado.nome}` }).click();
    await secao.getByRole('alert').getByText(/não é possível desativar/i).waitFor();
    console.log('  ✓ remoção/desativação com mesa aberta explicam o bloqueio');

    await secao.getByRole('button', { name: `Desativar ${livre.nome}` }).click();
    await secao.getByRole('status').getByText(/pode ser reativado/i).waitFor();
    await secao.getByRole('button', { name: `Desativar ${livre.nome}` }).waitFor({ state: 'hidden' });
    await secao.locator('summary').click();
    await secao.getByRole('button', { name: `Ativar ${livre.nome}` }).click();
    await secao.getByRole('button', { name: `Desativar ${livre.nome}` }).waitFor();
    await secao.getByRole('button', { name: `Remover ${livre.nome}` }).click();
    await secao.getByRole('status').getByText(/link foi invalidado/i).waitFor();
    await secao.getByRole('button', { name: `Remover ${livre.nome}` }).waitFor({ state: 'hidden' });
    assert.match(confirmacoes.at(-1), /definitivamente.*histórico será preservado/i);
    // Sem cookie staff: com sessão admin o SSE é autorizado independentemente
    // do token do garçom, o que não exercitaria a revogação do link.
    const linkRevogado = await fetch(`${base}/api/garcom/${livre.token}/me`);
    const eventosRevogados = await fetch(`${base}/api/events?garcom=${livre.token}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(linkRevogado.status, 401);
    assert.equal(eventosRevogados.status, 401);
    await eventosRevogados.body.cancel();
    console.log('  ✓ inativação é reversível; remoção é definitiva e revoga o link');

    const transferida = await page.evaluate(async ({ numero, destino }) => {
      const me = await (await fetch('/api/me')).json();
      const r = await fetch(`/api/admin/mesas/${numero}/transferir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
        body: JSON.stringify({ garcomDestinoId: destino }),
      });
      return { status: r.status, body: await r.json() };
    }, { numero: ids.mesa.numero, destino: destino.id });
    assert.equal(transferida.status, 200, JSON.stringify(transferida.body));
    await secao.getByRole('button', { name: `Remover ${ocupado.nome}` }).click();
    await secao.getByRole('status').getByText(/histórico foi preservado/i).waitFor();
    await secao.getByRole('button', { name: `Remover ${ocupado.nome}` }).waitFor({ state: 'hidden' });
    const auditoria = (await pool.query(
      "SELECT ator_tipo,ator_id,contexto FROM auditoria_eventos WHERE acao='garcom_removido' AND alvo_id=$1 ORDER BY id DESC LIMIT 1", [String(ocupado.id)]
    )).rows[0];
    assert.equal(auditoria.ator_tipo, 'staff');
    assert.equal(Number(auditoria.ator_id), admin.id);
    assert.equal(JSON.stringify(auditoria).includes(ocupado.token), false);
    console.log('  ✓ após transferência, remoção funciona e registra o administrador');

    const outroContexto = await browser.newContext();
    await outroContexto.addCookies([{ name: 'lqr_session', value: caixa.sessao, url: base, httpOnly: true, sameSite: 'Lax' }]);
    const outro = await outroContexto.newPage();
    await outro.goto(base + '/#/caixa');
    const proibido = await outro.evaluate(async (id) => {
      const me = await (await fetch('/api/me')).json();
      return (await fetch(`/api/admin/garcons/${id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': me.csrfToken } })).status;
    }, destino.id);
    assert.equal(proibido, 403, 'Caixa não pode remover garçom');
    assert.equal((await pool.query('SELECT removido_em FROM garcons WHERE id=$1', [destino.id])).rows[0].removido_em, null);
    assert.deepEqual(erros, [], `sem erros de JavaScript: ${logs.slice(-1500)}`);
    console.log('  ✓ role não-admin continua sem permissão e não há erro JavaScript');
  } finally {
    const falhasLimpeza = [];
    if (browser) {
      try { await browser.close(); } catch (e) { falhasLimpeza.push(e.message); }
    }
    if (servidor && servidor.exitCode === null && servidor.signalCode === null) {
      await new Promise((resolve) => { servidor.once('exit', resolve); servidor.kill('SIGTERM'); });
    }
    // Não esconder falhas de limpeza: mesmo quando uma operação falha,
    // tentamos as demais e marcamos o teste como falho.
    const limpar = async (sql, params) => {
      try { await pool.query(sql, params); } catch (e) { falhasLimpeza.push(e.message); }
    };
    if (ids.garcons.length) await limpar("DELETE FROM auditoria_eventos WHERE alvo_tipo='garcom' AND alvo_id=ANY($1::text[])", [ids.garcons.map(String)]);
    if (ids.sessao) {
      await limpar("DELETE FROM auditoria_eventos WHERE alvo_tipo='mesa_sessao' AND alvo_id=$1", [String(ids.sessao)]);
      await limpar('DELETE FROM mesa_atendimento_historico WHERE sessao_id=$1', [ids.sessao]);
      await limpar('DELETE FROM mesa_sessoes WHERE id=$1', [ids.sessao]);
    }
    if (ids.mesa) await limpar('DELETE FROM mesas WHERE id=$1', [ids.mesa.id]);
    if (ids.garcons.length) await limpar('DELETE FROM garcons WHERE id=ANY($1::int[])', [ids.garcons]);
    if (ids.staff.length) await limpar('DELETE FROM staff WHERE id=ANY($1::int[])', [ids.staff]);
    await pool.end();
    if (falhasLimpeza.length) {
      console.error('Falha ao limpar fixtures:', falhasLimpeza.join('; '));
      process.exitCode = 1;
    }
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
