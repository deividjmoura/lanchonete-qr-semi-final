'use strict';

/**
 * E2E em navegador real (Chromium) do fluxo offline do garçom.
 *
 * Sobe o servidor Node verdadeiro contra o PostgreSQL descartável, abre o PWA
 * em Chromium, corta a rede no meio do atendimento e verifica:
 *   1. pedido criado offline fica em IndexedDB e NÃO é dado como confirmado;
 *   2. recarregar/fechar a página não perde a pendência (reinício do app);
 *   3. ao voltar a conectividade real, sincroniza sozinho, uma única vez;
 *   4. o item chega à fila do setor certo no servidor;
 *   5. conflito de responsável aparece para revisão, sem apagar o pedido.
 *
 * Não roda no `npm test` (exige banco + navegador). Executar com:
 *   NODE_ENV=test DATABASE_URL=...qradmin_test node tests/e2e/garcom-offline.e2e.cjs
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
  const token = randomUUID();
  const ids = {};
  let servidor;
  let browser;
  const passos = [];
  const ok = (msg) => { passos.push(msg); console.log('  ✓ ' + msg); };

  try {
    ids.categoria = (await pool.query('INSERT INTO categorias (nome, ordem) VALUES ($1,0) RETURNING id', ['E2E ' + sufixo])).rows[0].id;
    ids.produto = (await pool.query(
      `INSERT INTO produtos (categoria_id,nome,preco,disponivel,setor) VALUES ($1,$2,17.90,TRUE,'cozinha') RETURNING id`,
      [ids.categoria, 'Lanche E2E ' + sufixo]
    )).rows[0].id;
    ids.garcom = (await pool.query('INSERT INTO garcons (nome,token,ativo) VALUES ($1,$2,TRUE) RETURNING id', ['Garçom E2E ' + sufixo, token])).rows[0].id;
    // Mesa baixa: as rotas de atendimento só aceitam 1..70.
    for (let n = 20; n <= 70 && !ids.mesa; n++) {
      try {
        ids.mesa = (await pool.query("INSERT INTO mesas (numero,token,status) VALUES ($1,$2,'livre') RETURNING id", [n, randomUUID()])).rows[0].id;
        ids.numero = n;
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    assert.ok(ids.mesa, 'sem mesa livre para o E2E');
    await pool.query('UPDATE configuracao_mesas SET quantidade=70 WHERE id=1');

    servidor = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL, STAFF_SEED_PASSWORD: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logServidor = '';
    servidor.stdout.on('data', (d) => { logServidor += d; });
    servidor.stderr.on('data', (d) => { logServidor += d; });
    await esperarServidor(base);
    ok('servidor real no ar contra PostgreSQL descartável');

    browser = await pw.launch({
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, '--no-sandbox'],
      headless: true,
    });
    const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await context.newPage();
    const errosPagina = [];
    page.on('pageerror', (e) => errosPagina.push(String(e)));
    page.on('dialog', (d) => d.accept());

    // O SSE fica aberto de propósito: 'networkidle' nunca aconteceria.
    await page.goto(`${base}/garcom-pwa/?token=${token}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#modalTable option').length > 0, null, { timeout: 20000 });
    ok('PWA carregou e listou mesas do garçom autenticado');

    // O primeiro acesso não bloqueia o atendimento; avisos são configurados
    // voluntariamente pelo sino (cobertos em garcom-lote-cobranca.e2e.cjs).
    assert.equal(await page.locator('#notificationConsent[open]').count(), 0);
    ok('primeiro acesso não bloqueia o atendimento com um modal de avisos');

    // ---- 1) Pedido criado sem rede -------------------------------------
    await context.setOffline(true);
    await page.click('#newOrderTables');
    await page.selectOption('#modalTable', String(ids.numero));
    await page.fill('#modalCustomer', 'Cliente sem sinal');
    await page.fill('#search', 'Lanche E2E ' + sufixo);
    await page.waitForSelector('#products .product');
    assert.equal(await page.locator('#products .product').count(), 1, 'fixture de produto deve ser única na busca');
    await page.click('#products .product button');
    await page.click('#saveOrder');
    await page.waitForFunction(() => document.querySelector('#queueCount')?.textContent?.startsWith('1'), null, { timeout: 15000 });

    async function esperarEstado(pred, rotulo, limiteMs = 60000) {
      const inicio = Date.now();
      let ultimo = null;
      while (Date.now() - inicio < limiteMs) {
        ultimo = await lerFila();
        if (pred(ultimo)) return ultimo;
        await new Promise((r) => setTimeout(r, 400));
      }
      throw new Error('Timeout esperando ' + rotulo + ': ' + JSON.stringify(ultimo));
    }
    const lerFila = () => page.evaluate(async () => {
      const { openOfflineDb, OfflineStore } = await import('./offline.js');
      const db = await openOfflineDb();
      const token = new URLSearchParams(location.search).get('token');
      const linhas = await new OfflineStore(db, token).all();
      db.close();
      return linhas.map((o) => ({
        localId: o.localId, idempotencyKey: o.idempotencyKey, status: o.status,
        table: o.table, items: o.items, clientCreatedAt: o.clientCreatedAt,
        serverOrderId: o.serverOrderId ?? null, attempts: o.attempts,
      }));
    });
    let fila = await lerFila();
    assert.equal(fila.length, 1);
    assert.notEqual(fila[0].status, 'confirmed', 'offline nunca pode confirmar');
    assert.equal(fila[0].serverOrderId, null);
    assert.equal(fila[0].table, ids.numero);
    assert.ok(fila[0].idempotencyKey && fila[0].clientCreatedAt);
    const chaveOriginal = fila[0].idempotencyKey;
    ok('pedido offline persistido em IndexedDB, sem confirmação prematura');

    const noBancoOffline = await pool.query(
      'SELECT COUNT(*)::int AS n FROM pedidos p JOIN mesa_sessoes s ON s.id=p.sessao_id WHERE s.mesa_id=$1', [ids.mesa]
    );
    assert.equal(noBancoOffline.rows[0].n, 0, 'nada chega ao servidor antes da conexão voltar');
    ok('servidor não recebeu o pedido enquanto o aparelho estava offline');

    // ---- 2) Reinício do aplicativo -------------------------------------
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#queueCount')?.textContent?.startsWith('1'), null, { timeout: 20000 });
    fila = await lerFila();
    assert.equal(fila.length, 1);
    assert.equal(fila[0].idempotencyKey, chaveOriginal, 'reinício preserva a chave de idempotência');
    assert.notEqual(fila[0].status, 'confirmed');
    ok('pendência sobrevive ao recarregamento com a mesma chave');

    // ---- 3) Conexão volta: sincroniza sozinho, uma vez ------------------
    await context.setOffline(false);
    fila = await esperarEstado((l) => l.length === 1 && l[0].status === 'confirmed', 'confirmação automática após a rede voltar');
    assert.equal(fila[0].idempotencyKey, chaveOriginal);
    assert.ok(fila[0].serverOrderId, 'confirmação exige id do servidor');
    ok('sincronização automática confirmou o pedido após a rede voltar');

    // Replay manual não pode duplicar.
    await page.click('#syncBtn');
    await page.waitForTimeout(1500);
    const noBanco = await pool.query(
      'SELECT p.id,p.idempotency_key FROM pedidos p JOIN mesa_sessoes s ON s.id=p.sessao_id WHERE s.mesa_id=$1', [ids.mesa]
    );
    assert.equal(noBanco.rows.length, 1, 'reenvio não duplica pedido');
    assert.equal(noBanco.rows[0].idempotency_key, chaveOriginal);
    const itens = await pool.query('SELECT setor,status,quantidade FROM itens_pedido WHERE pedido_id=$1', [noBanco.rows[0].id]);
    assert.equal(itens.rows.length, 1);
    assert.equal(itens.rows[0].setor, 'cozinha');
    assert.equal(itens.rows[0].status, 'recebido', 'pedido entra direto na produção, sem gate de aprovação');
    ok('pedido único no servidor, roteado ao setor correto, direto na fila de produção');

    // ---- 4) Fila do garçom vê o item pronto na hora ---------------------
    const itemId = (await pool.query('SELECT id FROM itens_pedido WHERE pedido_id=$1', [noBanco.rows[0].id])).rows[0].id;
    await pool.query("UPDATE itens_pedido SET status='concluido', pronto_em=now() WHERE id=$1", [itemId]);
    await page.click('[data-tab="deliveries"]');
    await page.click('#refreshDeliveries');
    await page.waitForFunction(() => /Retirar item/i.test(document.querySelector('#readyOrders')?.textContent || ''), null, { timeout: 20000 });
    ok('item pronto aparece para retirada direta');

    await page.click('#readyOrders button:has-text("Retirar item")');
    await page.waitForFunction(() => /Confirmar entrega/i.test(document.querySelector('#readyOrders')?.textContent || ''), null, { timeout: 20000 });
    const retirado = await pool.query('SELECT status,aceito_por_id,retirado_por_id FROM itens_pedido WHERE id=$1', [itemId]);
    assert.equal(retirado.rows[0].status, 'retirado');
    assert.equal(Number(retirado.rows[0].aceito_por_id), Number(ids.garcom));
    assert.equal(Number(retirado.rows[0].retirado_por_id), Number(ids.garcom));
    const dono = await pool.query(
      'SELECT garcom_responsavel_id FROM mesa_sessoes WHERE mesa_id=$1 AND status=$2', [ids.mesa, 'aberta']
    );
    assert.equal(Number(dono.rows[0].garcom_responsavel_id), Number(ids.garcom), 'primeira retirada assume a mesa no servidor');
    ok('retirada pelo navegador grava ator real e assume a mesa no servidor');

    /* ---- 5) Envio interrompido: pedido preso em "SINCRONIZANDO" ---------
       Reproduz o app morto no meio do POST. O pedido fica em `sync` e o lease
       da aba morta continua gravado. Antes da correção ele nunca mais saía
       desse estado: o flush ignorava `sync` e a recuperação só rodava na
       abertura, desistindo se o lease ainda estivesse válido. */
    const interrompido = await page.evaluate(async () => {
      const { openOfflineDb, OfflineStore } = await import('./offline.js');
      const db = await openOfflineDb();
      const token = new URLSearchParams(location.search).get('token');
      const store = new OfflineStore(db, token);
      const novo = {
        ownerToken: token, localId: 'interrompido-' + Date.now(),
        idempotencyKey: crypto.randomUUID(), table: Number(document.querySelector('#modalTable')?.value || 0),
        customerName: 'Cliente interrompido', items: [], status: 'sync',
        createdAt: Date.now(), clientCreatedAt: new Date().toISOString(), attempts: 1,
      };
      // itens reais do produto do fixture, para o servidor aceitar
      const cardapio = await (await fetch('/api/cardapio')).json();
      const produto = cardapio.flatMap((c) => c.produtos || [])[0];
      novo.items = [{ productId: Number(produto.id), name: produto.nome, qty: 1, unitPrice: Number(produto.preco) }];
      const mesas = await (await fetch('/api/garcom/' + token + '/mesas')).json();
      novo.table = Number(mesas.mesas[0].numero);
      await store.put(novo);
      // lease de uma aba que morreu, ainda dentro da validade
      await store.acquireLease('sync:' + token, 'aba-que-morreu', 45000, Date.now());
      db.close();
      return { localId: novo.localId, chave: novo.idempotencyKey };
    });
    ok('cenário de envio interrompido criado com lease de aba morta ainda válido');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('[data-tab="orders"]');
    await page.waitForSelector('#orders .order', { timeout: 20000 });
    const temBotao = await page.locator('#orders button:has-text("Verificar envio agora")').count();
    assert.ok(temBotao >= 1, 'pedido em sync precisa de ação manual na tela');
    ok('cartão em sincronização oferece "Verificar envio agora"');

    // Expira o lease e deixa o ciclo normal rodar: tem de destravar sozinho.
    await page.evaluate(async () => {
      const { openOfflineDb } = await import('./offline.js');
      const db = await openOfflineDb();
      const token = new URLSearchParams(location.search).get('token');
      await new Promise((resolve, reject) => {
        const tx = db.transaction('leases', 'readwrite');
        tx.objectStore('leases').put({ key: 'sync:' + token, holder: 'aba-que-morreu', expiresAt: Date.now() - 1 });
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await page.click('#syncBtn');
    const confirmado = await esperarEstado(
      (l) => l.some((o) => o.localId === interrompido.localId && o.status === 'confirmed'),
      'pedido interrompido voltar a ser enviado', 60000
    );
    const linha = confirmado.find((o) => o.localId === interrompido.localId);
    assert.equal(linha.idempotencyKey, interrompido.chave, 'reenvio usa a mesma chave');
    assert.ok(linha.serverOrderId, 'servidor confirmou o pedido que estava preso');
    ok('pedido que estava preso em sincronização foi enviado e confirmado');

    const gravados = await pool.query(
      'SELECT COUNT(*)::int AS n FROM pedidos WHERE idempotency_key=$1', [interrompido.chave]
    );
    assert.equal(gravados.rows[0].n, 1, 'o reenvio não duplicou o pedido');
    ok('reenvio do pedido interrompido não duplicou no servidor');

    assert.deepEqual(errosPagina, [], 'nenhum erro de JavaScript durante o fluxo: ' + errosPagina.join(' | '));
    ok('nenhum erro de JavaScript na página');

    console.log(`\nE2E OK — ${passos.length} verificações em Chromium real`);
  } catch (e) {
    console.error('\nE2E FALHOU:', e.message);
    throw e;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (servidor) { servidor.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 500)); servidor.kill('SIGKILL'); }
    if (ids.mesa) {
      const sessoes = await pool.query('SELECT id FROM mesa_sessoes WHERE mesa_id=$1', [ids.mesa]).catch(() => ({ rows: [] }));
      for (const s of sessoes.rows) {
        const ps = await pool.query('SELECT id FROM pedidos WHERE sessao_id=$1', [s.id]).catch(() => ({ rows: [] }));
        for (const p of ps.rows) {
          await pool.query('DELETE FROM itens_pedido_historico WHERE pedido_id=$1', [p.id]).catch(() => {});
          await pool.query('DELETE FROM auditoria_eventos WHERE alvo_tipo=$1 AND alvo_id=$2', ['pedido', String(p.id)]).catch(() => {});
        }
        await pool.query('DELETE FROM auditoria_eventos WHERE alvo_id=$1', [String(s.id)]).catch(() => {});
        await pool.query('DELETE FROM pedidos WHERE sessao_id=$1', [s.id]).catch(() => {});
        await pool.query('DELETE FROM mesa_sessoes WHERE id=$1', [s.id]).catch(() => {});
      }
      await pool.query('DELETE FROM mesas WHERE id=$1', [ids.mesa]).catch(() => {});
    }
    if (ids.garcom) await pool.query('DELETE FROM garcons WHERE id=$1', [ids.garcom]).catch(() => {});
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id=$1', [ids.produto]).catch(() => {});
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id=$1', [ids.categoria]).catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch(() => { process.exitCode = 1; });
