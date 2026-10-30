'use strict';

/**
 * E2E em Chromium real das três correções pedidas pelo operador:
 *
 *  1. o diálogo de notificações FECHA depois de conceder a permissão;
 *  2. o lote por pedido cobre aceite, retirada e entrega (não item por item);
 *  3. o botão de registrar recebimento funciona quando há saldo, e quando
 *     está bloqueado mostra o motivo em vez de ficar mudo.
 *
 * Sobe o servidor Node verdadeiro contra PostgreSQL descartável. Não roda no
 * `npm test` (exige banco + navegador). Executar com:
 *   NODE_ENV=test DATABASE_URL=...qradmin_test node tests/e2e/garcom-lote-cobranca.e2e.cjs
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
  const ids = { itens: [] };
  let servidor, browser;
  const passos = [];
  const ok = (m) => { passos.push(m); console.log('  ✓ ' + m); };

  try {
    ids.categoria = (await pool.query('INSERT INTO categorias (nome,ordem) VALUES ($1,0) RETURNING id', ['E2E lote ' + sufixo])).rows[0].id;
    ids.produto = (await pool.query(
      `INSERT INTO produtos (categoria_id,nome,preco,disponivel,setor) VALUES ($1,$2,30.00,TRUE,'cozinha') RETURNING id`,
      [ids.categoria, 'Prato lote ' + sufixo]
    )).rows[0].id;
    ids.garcom = (await pool.query('INSERT INTO garcons (nome,token,ativo) VALUES ($1,$2,TRUE) RETURNING id', ['Garçom lote ' + sufixo, token])).rows[0].id;
    for (let n = 20; n <= 70 && !ids.mesa; n++) {
      try {
        ids.mesa = (await pool.query("INSERT INTO mesas (numero,token,status) VALUES ($1,$2,'livre') RETURNING id", [n, randomUUID()])).rows[0].id;
        ids.numero = n;
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    assert.ok(ids.mesa, 'sem mesa livre');
    await pool.query('UPDATE configuracao_mesas SET quantidade=70 WHERE id=1');

    // Cria o atendimento/pedido pelas funções REAIS do backend, para não
    // depender de um INSERT que possa divergir do schema vigente.
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = DATABASE_URL;
    const { criarPedidoGarcom, iniciarAtendimentoGarcom } = require('../../db/atendimento');
    await iniciarAtendimentoGarcom(token, ids.numero, { clienteNome: 'Cliente lote' }, randomUUID());
    const criado = await criarPedidoGarcom(token, ids.numero, {
      clienteNome: 'Cliente lote',
      items: [{ productId: ids.produto, qty: 3 }],
      idempotencyKey: randomUUID(),
    }, randomUUID());
    ids.pedido = criado.id;
    ids.sessao = criado.sessaoId;
    // Um item por linha, para o lote ter o que agrupar.
    await pool.query('UPDATE itens_pedido SET quantidade=1 WHERE pedido_id=$1', [ids.pedido]);
    const linha = (await pool.query('SELECT id,quantidade FROM itens_pedido WHERE pedido_id=$1', [ids.pedido])).rows[0];
    for (let i = 1; i < 3; i++) {
      await pool.query(
        `INSERT INTO itens_pedido (pedido_id,produto_id,quantidade,preco_unitario,setor,status)
         SELECT pedido_id,produto_id,1,preco_unitario,setor,status FROM itens_pedido WHERE id=$1`,
        [linha.id]
      );
    }
    await pool.query("UPDATE itens_pedido SET status='concluido', pronto_em=now() WHERE pedido_id=$1", [ids.pedido]);
    ids.itens = (await pool.query('SELECT id FROM itens_pedido WHERE pedido_id=$1 ORDER BY id', [ids.pedido])).rows.map((r) => r.id);
    assert.equal(ids.itens.length, 3);

    servidor = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL, STAFF_SEED_PASSWORD: '' },
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
    const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await context.newPage();
    // LIMITAÇÃO DO AMBIENTE: o Chromium empacotado (@sparticuz) reporta
    // Notification.permission === 'denied' e ignora tanto
    // context.grantPermissions quanto Browser.setPermission via CDP. Só a
    // permissão do navegador é simulada aqui; o diálogo, o handler, o
    // localStorage e o servidor são reais. O gesto de conceder em um aparelho
    // verdadeiro continua precisando de verificação manual.
    await page.addInitScript(() => {
      try {
        Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
        Notification.requestPermission = async () => 'granted';
      } catch (_) {}
    });
    const errosPagina = [];
    page.on('pageerror', (e) => errosPagina.push(String(e)));
    page.on('dialog', (d) => d.accept());

    await page.goto(`${base}/garcom-pwa/?token=${token}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#modalTable option').length > 0, null, { timeout: 20000 });

    /* ---- 1) consentimento só abre sob demanda e fecha após conceder --- */
    assert.equal(await page.locator('#notificationConsent[open]').count(), 0);
    await page.click('#openNotificationSettings');
    await page.waitForSelector('#notificationConsent[open]', { timeout: 10000 });
    await page.click('#requestNotificationPermission');
    await page.waitForFunction(() => !document.querySelector('#notificationConsent')?.open, null, { timeout: 10000 });
    assert.equal(await page.locator('#notificationConsent[open]').count(), 0);
    const aviso = await page.textContent('#notificationFeedback');
    assert.match(aviso || '', /Avisos de item pronto ativados/i);
    assert.equal(await page.locator('#notificationFeedback').isVisible(), true);
    ok('diálogo de notificações fecha após conceder e mostra confirmação temporária');

    /* ---- 2) lote nas três etapas -------------------------------------- */
    await page.click('[data-tab="deliveries"]');
    await page.click('#refreshDeliveries');
    await page.waitForFunction(
      () => /Aceitar todos os prontos \(3\)/.test(document.querySelector('#readyOrders')?.textContent || ''),
      null, { timeout: 20000 }
    );
    ok('lote de aceite oferecido para os 3 itens prontos do pedido');

    await page.click('#readyOrders button:has-text("Aceitar todos os prontos")');
    await page.waitForFunction(async () => true, null, { timeout: 1000 }).catch(() => {});
    await esperarBanco(async () => {
      const r = await pool.query('SELECT status,aceito_por_id FROM itens_pedido WHERE pedido_id=$1', [ids.pedido]);
      return r.rows.length === 3 && r.rows.every((x) => x.status === 'aceito' && Number(x.aceito_por_id) === Number(ids.garcom));
    }, 'aceite em lote dos 3 itens');
    ok('um clique aceitou os 3 itens e gravou o garçom como ator');

    await page.click('#refreshDeliveries');
    await page.waitForFunction(
      () => /Confirmar retirada de todos \(3\)/.test(document.querySelector('#readyOrders')?.textContent || ''),
      null, { timeout: 20000 }
    );
    await page.click('#readyOrders button:has-text("Confirmar retirada de todos")');
    await esperarBanco(async () => {
      const r = await pool.query('SELECT status FROM itens_pedido WHERE pedido_id=$1', [ids.pedido]);
      return r.rows.every((x) => x.status === 'retirado');
    }, 'retirada em lote');
    ok('lote de retirada avançou os 3 itens de uma vez');

    await page.click('#refreshDeliveries');
    await page.waitForFunction(
      () => /Confirmar entrega de todos \(3\)/.test(document.querySelector('#readyOrders')?.textContent || ''),
      null, { timeout: 20000 }
    );
    await page.click('#readyOrders button:has-text("Confirmar entrega de todos")');
    await esperarBanco(async () => {
      const r = await pool.query('SELECT status,entregue_por_id FROM itens_pedido WHERE pedido_id=$1', [ids.pedido]);
      return r.rows.every((x) => x.status === 'entregue' && Number(x.entregue_por_id) === Number(ids.garcom));
    }, 'entrega em lote');
    ok('lote de entrega concluiu os 3 itens e gravou quem entregou');

    /* ---- 3) cobrança: botão funciona com saldo ------------------------ */
    await page.click('[data-tab="billing"]');
    await page.click('#refreshBilling');
    await page.waitForFunction(
      () => document.querySelector('#registerPayment')?.disabled === false,
      null, { timeout: 20000 }
    );
    assert.equal(await page.locator('#billingBlocked').isVisible(), false, 'com saldo não deve haver bloqueio');
    const resumo = await page.textContent('#billingSummary');
    assert.match(resumo, /Saldo: R\$\s*90,00/);
    ok('com saldo de R$ 90 o botão de recebimento fica habilitado');

    /* ---- 3a) sem item entregue explica a causa ------------------------ */
    await pool.query("UPDATE itens_pedido SET status='retirado', entregue_por_id=NULL, entregue_em=NULL WHERE pedido_id=$1", [ids.pedido]);
    await page.click('#refreshBilling');
    await page.waitForFunction(
      () => /Nenhum item desta mesa foi marcado como entregue/.test(document.querySelector('#billingBlocked')?.textContent || ''),
      null, { timeout: 20000 }
    );
    assert.equal(await page.locator('#registerPayment').isDisabled(), true);
    ok('sem item entregue o motivo aparece e aponta a aba Entregas');
    // devolve os itens para entregue e segue com a cobrança real
    await pool.query("UPDATE itens_pedido SET status='entregue', entregue_por_id=$2, entregue_em=now() WHERE pedido_id=$1", [ids.pedido, ids.garcom]);
    await page.click('#refreshBilling');
    await page.waitForFunction(() => document.querySelector('#registerPayment')?.disabled === false, null, { timeout: 20000 });

    await page.fill('#billingAmount', '90');
    await page.selectOption('#billingMethod', 'pix');
    await page.check('#billingReceivedConfirm');
    await page.click('#registerPayment');
    await esperarBanco(async () => {
      const r = await pool.query('SELECT COALESCE(SUM(valor),0)::float AS pago FROM sessao_pagamentos WHERE sessao_id=$1', [ids.sessao]);
      return Number(r.rows[0].pago) === 90;
    }, 'pagamento registrado').catch(async (e) => {
      console.error('  billingMessage:', await page.textContent('#billingMessage'));
      console.error('  billingBlocked:', await page.textContent('#billingBlocked'));
      console.error('  billingSummary:', await page.textContent('#billingSummary'));
      console.error('  amount/method/confirm:', await page.inputValue('#billingAmount'), await page.inputValue('#billingMethod'), await page.isChecked('#billingReceivedConfirm'));
      console.error('  errosPagina:', errosPagina);
      console.error('  temListener:', await page.evaluate(()=>{const b=document.querySelector('#registerPayment');return {disabled:b.disabled,onclick:typeof b.onclick};}));
      console.error('  servidor:', logServidor.slice(-800));
      throw e;
    });
    const confirmacao = await page.textContent('#billingMessage');
    assert.match(confirmacao, /registrado/i);
    ok('confirmar pagamento pelo PWA gravou R$ 90 no servidor');

    /* ---- 3b) conta quitada explica o bloqueio ------------------------- */
    // O pagamento integral quita a conta: o servidor encerra a sessão e
    // libera a mesa, então ela sai da lista do garçom de forma legítima.
    const confirmouEncerramento = /Conta quitada, atendimento encerrado e mesa liberada/i.test(confirmacao);
    assert.ok(confirmouEncerramento, 'garçom precisa saber que a conta foi encerrada: ' + confirmacao);
    const estadoFinal = await pool.query('SELECT status FROM mesa_sessoes WHERE id=$1', [ids.sessao]);
    assert.equal(estadoFinal.rows[0].status, 'fechada', 'pagamento integral deve encerrar a sessão');
    const mesaFinal = await pool.query('SELECT status FROM mesas WHERE id=$1', [ids.mesa]);
    assert.equal(mesaFinal.rows[0].status, 'livre', 'mesa deve ser liberada');
    ok('pagamento integral encerrou a sessão, liberou a mesa e avisou o garçom');

    assert.deepEqual(errosPagina, [], 'erros de JS na página: ' + errosPagina.join(' | '));
    ok('nenhum erro de JavaScript na página');

    console.log(`\nE2E OK — ${passos.length} verificações em Chromium real`);
  } catch (e) {
    console.error('\nE2E FALHOU:', e.message);
    throw e;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (servidor) { servidor.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 500)); servidor.kill('SIGKILL'); }
    if (ids.pedido) {
      await pool.query('DELETE FROM itens_pedido_historico WHERE pedido_id=$1', [ids.pedido]).catch(() => {});
      await pool.query('DELETE FROM auditoria_eventos WHERE alvo_tipo=$1 AND alvo_id=$2', ['pedido', String(ids.pedido)]).catch(() => {});
      await pool.query('DELETE FROM itens_pedido WHERE pedido_id=$1', [ids.pedido]).catch(() => {});
      await pool.query('DELETE FROM pedidos WHERE id=$1', [ids.pedido]).catch(() => {});
    }
    if (ids.sessao) {
      await pool.query('DELETE FROM sessao_pagamentos WHERE sessao_id=$1', [ids.sessao]).catch(() => {});
      await pool.query('DELETE FROM auditoria_eventos WHERE alvo_id=$1', [String(ids.sessao)]).catch(() => {});
      await pool.query('DELETE FROM mesa_sessoes WHERE id=$1', [ids.sessao]).catch(() => {});
    }
    if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id=$1', [ids.mesa]).catch(() => {});
    if (ids.garcom) await pool.query('DELETE FROM garcons WHERE id=$1', [ids.garcom]).catch(() => {});
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id=$1', [ids.produto]).catch(() => {});
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id=$1', [ids.categoria]).catch(() => {});
    await pool.end().catch(() => {});
  }
}

async function esperarBanco(pred, rotulo, limiteMs = 20000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('timeout esperando: ' + rotulo);
}

main().catch(() => { process.exitCode = 1; });
