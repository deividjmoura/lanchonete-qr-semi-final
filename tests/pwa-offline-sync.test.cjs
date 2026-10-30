'use strict';

/**
 * Testes comportamentais da fila offline do garçom (public/garcom-pwa/offline.js).
 *
 * Usam fake-indexeddb: exercitam o código REAL de persistência/sincronização,
 * não uma cópia. Cobrem os requisitos que causavam perda de pedido:
 *  - sobreviver a fechamento/reabertura do aplicativo;
 *  - nunca confirmar sem resposta do servidor;
 *  - replay com a MESMA chave de idempotência (sem duplicar);
 *  - backoff progressivo e reenvio após a conexão voltar;
 *  - conflito visível (4xx) em vez de descarte silencioso;
 *  - duas abas não enviarem a mesma fila (lease).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { IDBFactory } = require('fake-indexeddb');

const OFFLINE_URL = pathToFileURL(path.join(__dirname, '..', 'public', 'garcom-pwa', 'offline.js')).href;
const TOKEN_A = '00000000-0000-4000-8000-0000000000a1';
const TOKEN_B = '00000000-0000-4000-8000-0000000000b2';

let modulo;
async function carregar() {
  if (!modulo) modulo = await import(OFFLINE_URL);
  return modulo;
}

function pedido(overrides = {}) {
  return {
    localId: 'local-' + Math.random().toString(36).slice(2),
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    ownerToken: TOKEN_A,
    table: 4,
    customerName: 'Cliente offline',
    items: [{ productId: 1, qty: 2, note: 'sem cebola' }],
    note: 'observação geral',
    status: 'offline',
    attempts: 0,
    createdAt: Date.now(),
    clientCreatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('pedido salvo sobrevive a fechar e reabrir o armazenamento (reinício do app)', async () => {
  const { openOfflineDb, OfflineStore } = await carregar();
  const factory = new IDBFactory();
  const db1 = await openOfflineDb(factory);
  const store1 = new OfflineStore(db1, TOKEN_A);
  const original = pedido();
  await store1.put(original);
  db1.close();

  // Novo handle = novo processo/aba. Nada pode ter sido perdido.
  const db2 = await openOfflineDb(factory);
  const store2 = new OfflineStore(db2, TOKEN_A);
  const lidos = await store2.all();
  assert.equal(lidos.length, 1);
  assert.equal(lidos[0].localId, original.localId);
  assert.equal(lidos[0].idempotencyKey, original.idempotencyKey, 'a chave precisa ser a mesma no replay');
  assert.equal(lidos[0].status, 'offline');
  assert.deepEqual(lidos[0].items, original.items);
  assert.equal(lidos[0].clientCreatedAt, original.clientCreatedAt);
  db2.close();
});

test('fila é isolada por garçom e não vaza pedido de outro link no mesmo aparelho', async () => {
  const { openOfflineDb, OfflineStore } = await carregar();
  const db = await openOfflineDb(new IDBFactory());
  const a = new OfflineStore(db, TOKEN_A);
  const b = new OfflineStore(db, TOKEN_B);
  await a.put(pedido({ localId: 'de-a' }));
  await b.put(pedido({ localId: 'de-b', ownerToken: TOKEN_B }));
  assert.deepEqual((await a.all()).map(o => o.localId), ['de-a']);
  assert.deepEqual((await b.all()).map(o => o.localId), ['de-b']);
  await assert.rejects(() => a.put(pedido({ localId: 'intruso', ownerToken: TOKEN_B })), /outro garçom/);
  db.close();
});

test('sem conexão o pedido permanece pendente e nunca vira confirmado', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine } = await carregar();
  const db = await openOfflineDb(new IDBFactory());
  const store = new OfflineStore(db, TOKEN_A);
  await store.put(pedido({ localId: 'sem-rede' }));
  let envios = 0;
  const engine = new SyncEngine({
    store,
    probe: async () => false,
    send: async () => { envios++; return { id: 1 }; },
  });
  await engine.flush();
  const [salvo] = await store.all();
  assert.equal(envios, 0, 'offline não deve nem tentar enviar');
  assert.equal(salvo.status, 'offline');
  assert.equal(salvo.serverOrderId, undefined);
  assert.equal(engine.connection, 'offline');
  db.close();
});

test('falha de rede mantém a chave, conta tentativa e agenda backoff crescente', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine, backoffDelay } = await carregar();
  const db = await openOfflineDb(new IDBFactory());
  const store = new OfflineStore(db, TOKEN_A);
  const chave = '22222222-2222-4222-8222-222222222222';
  await store.put(pedido({ localId: 'retry', idempotencyKey: chave }));
  const chavesEnviadas = [];
  let agora = 1_000_000;
  const engine = new SyncEngine({
    store,
    now: () => agora,
    random: () => 0,
    probe: async () => true,
    send: async (o) => { chavesEnviadas.push(o.idempotencyKey); throw new TypeError('Failed to fetch'); },
  });

  await engine.flush();
  let [salvo] = await store.all();
  assert.equal(salvo.status, 'offline');
  assert.equal(salvo.attempts, 1);
  assert.ok(salvo.nextAttemptAt > agora, 'próxima tentativa fica no futuro');
  assert.ok(salvo.lastError);

  // Antes do prazo não reenvia (evita tempestade de requisições).
  await engine.flush();
  assert.equal(chavesEnviadas.length, 1);

  // Depois do prazo reenvia com a MESMA chave.
  agora = salvo.nextAttemptAt + 1;
  await engine.flush();
  assert.deepEqual(chavesEnviadas, [chave, chave]);
  [salvo] = await store.all();
  assert.equal(salvo.attempts, 2);
  assert.ok(salvo.nextAttemptAt > agora);
  assert.ok(backoffDelay(5, () => 0) > backoffDelay(2, () => 0), 'backoff é progressivo');
  assert.ok(backoffDelay(99, () => 0) <= 301000, 'backoff tem teto');
  db.close();
});

test('só confirma depois de resposta do servidor com id; replay não duplica pedido', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine } = await carregar();
  const db = await openOfflineDb(new IDBFactory());
  const store = new OfflineStore(db, TOKEN_A);
  await store.put(pedido({ localId: 'confirma' }));
  let envios = 0;
  const engine = new SyncEngine({
    store,
    probe: async () => true,
    // Primeira chamada derruba a conexão DEPOIS de o servidor gravar: o cliente
    // não pode confirmar. O replay devolve o mesmo id.
    send: async () => {
      envios++;
      if (envios === 1) throw new TypeError('Failed to fetch');
      return { id: 4242, sessaoId: 77, idempotentReplay: envios > 1 };
    },
  });
  await engine.flush();
  let [salvo] = await store.all();
  assert.notEqual(salvo.status, 'confirmed', 'sem resposta não há confirmação');

  await engine.flush({ force: true });
  [salvo] = await store.all();
  assert.equal(salvo.status, 'confirmed');
  assert.equal(salvo.serverOrderId, 4242);
  assert.equal(salvo.serverSessaoId, 77);
  assert.ok(salvo.confirmedAt);
  assert.equal(salvo.lastError, null);

  // Confirmado não é reenviado nunca mais.
  await engine.flush({ force: true });
  assert.equal(envios, 2);
  assert.equal((await store.all()).length, 1, 'registro confirmado é preservado, não duplicado');
  db.close();
});

test('resposta sem identificador não é tratada como confirmação', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine } = await carregar();
  const db = await openOfflineDb(new IDBFactory());
  const store = new OfflineStore(db, TOKEN_A);
  await store.put(pedido({ localId: 'sem-id' }));
  const engine = new SyncEngine({ store, probe: async () => true, send: async () => ({ ok: true }) });
  await engine.flush();
  const [salvo] = await store.all();
  assert.notEqual(salvo.status, 'confirmed');
  assert.ok(salvo.lastError);
  db.close();
});

test('4xx vira conflito visível e preservado; 5xx continua tentando', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine, classifySyncError } = await carregar();
  assert.equal(classifySyncError({ status: 409 }), 'conflict');
  assert.equal(classifySyncError({ status: 400 }), 'conflict');
  assert.equal(classifySyncError({ status: 404 }), 'conflict');
  assert.equal(classifySyncError({ status: 500 }), 'retry');
  assert.equal(classifySyncError({ status: 429 }), 'retry');
  assert.equal(classifySyncError({ status: 408 }), 'retry');
  assert.equal(classifySyncError(new TypeError('Failed to fetch')), 'retry');

  const db = await openOfflineDb(new IDBFactory());
  const store = new OfflineStore(db, TOKEN_A);
  await store.put(pedido({ localId: 'conflito' }));
  const erro = Object.assign(new Error('Mesa assumida por outro garçom'), { status: 409, code: 'RESPONSAVEL_EXISTENTE' });
  const engine = new SyncEngine({ store, probe: async () => true, send: async () => { throw erro; } });
  await engine.flush();
  const [salvo] = await store.all();
  assert.equal(salvo.status, 'conflict');
  assert.equal(salvo.errorCode, 'RESPONSAVEL_EXISTENTE');
  assert.match(salvo.lastError, /outro garçom/);
  assert.equal(salvo.nextAttemptAt, null, 'conflito exige decisão humana, não retry automático');
  assert.deepEqual(salvo.items, [{ productId: 1, qty: 2, note: 'sem cebola' }], 'conteúdo original preservado');

  // Revisado pelo operador: volta a enviar com a mesma chave.
  salvo.status = 'offline';
  salvo.collaborationApproved = true;
  await store.put(salvo);
  let enviado = null;
  const engine2 = new SyncEngine({ store, probe: async () => true, send: async (o) => { enviado = o; return { id: 9 }; } });
  await engine2.flush({ force: true });
  assert.equal(enviado.idempotencyKey, salvo.idempotencyKey);
  assert.equal((await store.all())[0].status, 'confirmed');
  db.close();
});

test('link inválido (401/403) marca conflito de autenticação em vez de sumir com a fila', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine } = await carregar();
  const db = await openOfflineDb(new IDBFactory());
  const store = new OfflineStore(db, TOKEN_A);
  await store.put(pedido({ localId: 'auth' }));
  const engine = new SyncEngine({
    store,
    probe: async () => { throw Object.assign(new Error('Link do garçom inválido ou desativado'), { status: 401 }); },
    send: async () => { throw new Error('não deveria enviar'); },
  });
  await engine.flush();
  const [salvo] = await store.all();
  assert.equal(engine.connection, 'auth');
  assert.equal(salvo.status, 'conflict');
  assert.equal(salvo.idempotencyKey, '11111111-1111-4111-8111-111111111111');
  db.close();
});

test('envio interrompido é recuperado no boot sem duplicar a operação', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine } = await carregar();
  const factory = new IDBFactory();
  const db1 = await openOfflineDb(factory);
  const store1 = new OfflineStore(db1, TOKEN_A);
  // Estado deixado por um envio que morreu no meio (app fechado/aba travada).
  await store1.put(pedido({ localId: 'interrompido', status: 'sync', attempts: 1 }));
  db1.close();

  const db2 = await openOfflineDb(factory);
  const store2 = new OfflineStore(db2, TOKEN_A);
  const engine = new SyncEngine({ store: store2, probe: async () => false, send: async () => ({ id: 1 }) });
  await engine.recoverInterrupted();
  const [salvo] = await store2.all();
  assert.equal(salvo.status, 'offline', 'sync órfão volta para a fila, não é descartado');
  assert.equal(salvo.idempotencyKey, '11111111-1111-4111-8111-111111111111');
  assert.match(salvo.lastError, /interrompido/i);
  db2.close();
});

test('lease impede que duas abas enviem a mesma fila ao mesmo tempo', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine } = await carregar();
  const db = await openOfflineDb(new IDBFactory());
  const store = new OfflineStore(db, TOKEN_A);
  await store.put(pedido({ localId: 'duas-abas' }));

  let resolver;
  const porta = new Promise((r) => { resolver = r; });
  let enviosA = 0;
  let enviosB = 0;
  const abaA = new SyncEngine({
    store, holder: 'aba-a', probe: async () => true,
    send: async () => { enviosA++; await porta; return { id: 1 }; },
  });
  const abaB = new SyncEngine({
    store, holder: 'aba-b', probe: async () => true,
    send: async () => { enviosB++; return { id: 2 }; },
  });

  const flushA = abaA.flush();
  // Espera a aba A adquirir o lease e chegar no envio.
  for (let i = 0; i < 200 && enviosA === 0; i++) await new Promise((r) => setImmediate(r));
  assert.equal(enviosA, 1);
  const conseguiuB = await abaB.flush();
  assert.equal(conseguiuB, false, 'segunda aba não envia enquanto a primeira detém o lease');
  assert.equal(enviosB, 0);
  resolver();
  await flushA;
  assert.equal((await store.all())[0].status, 'confirmed');

  // Lease expirado (aba morta) libera a fila para outra aba.
  assert.equal(await store.leaseActive('sync:' + TOKEN_A), false);
  await store.acquireLease('sync:' + TOKEN_A, 'aba-morta', 1000, 0);
  assert.equal(await store.leaseActive('sync:' + TOKEN_A, 500), true);
  assert.equal(await store.leaseActive('sync:' + TOKEN_A, 2000), false);
  db.close();
});

test('probeBackend trata 401/403 como erro de credencial e 5xx como offline', async () => {
  const { probeBackend } = await carregar();
  assert.equal(await probeBackend('/api/x', async () => ({ ok: true, status: 200 })), true);
  assert.equal(await probeBackend('/api/x', async () => ({ ok: false, status: 503 })), false);
  await assert.rejects(
    () => probeBackend('/api/x', async () => ({ ok: false, status: 401 })),
    (e) => e.status === 401
  );
  await assert.rejects(
    () => probeBackend('/api/x', async () => { throw new TypeError('Failed to fetch'); }),
    /Failed to fetch/
  );
});

test('navigator.onLine=false não bloqueia o envio quando o backend responde de verdade', async () => {
  // Regressão: o app antigo usava navigator.onLine e nunca reenviava em redes
  // que reportam "offline" mesmo com o servidor acessível (Wi-Fi sem internet
  // detectada pelo SO, proxy, dados móveis). A verdade agora é a resposta HTTP.
  const { openOfflineDb, OfflineStore, SyncEngine } = await carregar();
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  try {
    const db = await openOfflineDb(new IDBFactory());
    const store = new OfflineStore(db, TOKEN_A);
    await store.put(pedido({ localId: 'online-falso-negativo' }));
    const engine = new SyncEngine({ store, probe: async () => true, send: async () => ({ id: 5 }) });
    await engine.flush();
    assert.equal((await store.all())[0].status, 'confirmed');
    db.close();
  } finally {
    if (anterior) Object.defineProperty(globalThis, 'navigator', anterior);
    else delete globalThis.navigator;
  }
});

/* ------------------------------------------------------------------ */
/* Pedido preso em "SINCRONIZANDO" (envio interrompido)                */
/* ------------------------------------------------------------------ */

/**
 * Regressão do relato "o PWA não está enviando o novo pedido ao sistema".
 *
 * O pedido era gravado como `sync` antes do POST. Se o app fosse fechado ou
 * morto no meio do envio, ele ficava nesse estado para sempre:
 *  - recoverInterrupted() desistia quando o lease ainda estava válido (45s),
 *    e só rodava uma vez, na abertura;
 *  - flush() nunca selecionava `sync` e ainda tinha um `continue` para ele;
 *  - o cartão não mostrava botão de reenvio nesse estado.
 * Agora a recuperação roda a cada flush, já com o lease na mão.
 */

test('envio interrompido é reenviado sozinho mesmo se o app reabriu dentro do lease', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine, LEASE_TTL_MS } = await carregar();
  const db = await openOfflineDb(new IDBFactory());
  const store = new OfflineStore(db, TOKEN_A);
  const t = 1_000_000;
  const original = pedido({ status: 'sync', attempts: 1, createdAt: t });
  await store.put(original);
  // A aba que morreu deixou o lease gravado e ainda válido.
  await store.acquireLease('sync:' + TOKEN_A, 'aba-que-morreu', LEASE_TTL_MS, t);

  const envios = [];
  const abertura = new SyncEngine({
    store, send: async (o) => { envios.push(o); return { id: 4242 }; },
    probe: async () => true, now: () => t,
  });
  await abertura.recoverInterrupted();
  assert.equal((await store.get(original.localId)).status, 'sync', 'com lease de outra aba ativo, não mexe');

  // O lease expira e o timer roda: precisa destravar sem ação do garçom.
  const depois = new SyncEngine({
    store, send: async (o) => { envios.push(o); return { id: 4242 }; },
    probe: async () => true, now: () => t + LEASE_TTL_MS + 1000,
  });
  await depois.flush();

  const final = await store.get(original.localId);
  assert.equal(final.status, 'confirmed', 'o pedido chegou ao servidor');
  assert.equal(final.serverOrderId, 4242);
  assert.equal(envios.length, 1, 'enviado exatamente uma vez');
  assert.equal(envios[0].idempotencyKey, original.idempotencyKey, 'replay usa a MESMA chave, não duplica');
  db.close();
});

test('sync órfão é recuperado mesmo sem conexão, para não ficar preso na tela', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine } = await carregar();
  const db = await openOfflineDb(new IDBFactory());
  const store = new OfflineStore(db, TOKEN_A);
  const t = 2_000_000;
  const original = pedido({ status: 'sync', attempts: 1, createdAt: t });
  await store.put(original);

  let envios = 0;
  const eng = new SyncEngine({
    store, send: async () => { envios++; return { id: 1 }; },
    probe: async () => false, now: () => t,
  });
  await eng.flush();

  const final = await store.get(original.localId);
  assert.equal(envios, 0, 'offline não envia');
  assert.equal(final.status, 'offline', 'volta para a fila em vez de ficar em sync');
  assert.ok(final.lastError, 'o motivo fica visível no cartão');
  db.close();
});

test('aba com lease válido não tem seu envio interrompido roubado por outra aba', async () => {
  const { openOfflineDb, OfflineStore, SyncEngine, LEASE_TTL_MS } = await carregar();
  const db = await openOfflineDb(new IDBFactory());
  const store = new OfflineStore(db, TOKEN_A);
  const t = 3_000_000;
  const original = pedido({ status: 'sync', createdAt: t });
  await store.put(original);
  await store.acquireLease('sync:' + TOKEN_A, 'aba-dona-do-envio', LEASE_TTL_MS, t);

  let envios = 0;
  const intrusa = new SyncEngine({
    store, send: async () => { envios++; return { id: 7 }; },
    probe: async () => true, now: () => t + 1000, holder: 'aba-intrusa',
  });
  const rodou = await intrusa.flush();

  assert.equal(rodou, false, 'sem o lease, a segunda aba não roda');
  assert.equal(envios, 0, 'não envia em paralelo');
  assert.equal((await store.get(original.localId)).status, 'sync', 'o envio da dona permanece intacto');
  db.close();
});

test('botão de verificar envio aparece para pedido em sincronização', async () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'garcom-pwa', 'app.js'), 'utf8');
  assert.match(src, /\['offline','conflict','error','sync'\]\.includes\(o\.status\)/,
    'sync precisa de ação manual, senão o garçom fica sem saída');
  assert.match(src, /Verificar envio agora/);
});

test('recuperação de sync roda dentro do flush, sob o lease, e não só na abertura', async () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'garcom-pwa', 'offline.js'), 'utf8');
  const flush = src.slice(src.indexOf('async flush('), src.indexOf('start(intervalMs'));
  assert.match(flush, /recoverOrphanedSync\(\)/, 'flush precisa recuperar o órfão a cada ciclo');
  assert.doesNotMatch(flush, /order\.status === 'sync'\) continue/, 'sync não pode ser descartado da fila');
  // a recuperação sem lease continua protegida, para uso na abertura
  const recover = src.slice(src.indexOf('async recoverInterrupted('), src.indexOf('async flush('));
  assert.match(recover, /leaseActive/, 'na abertura ainda respeita o lease de outra aba');
});
