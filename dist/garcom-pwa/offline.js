/**
 * Fila offline persistente do garçom. Não depende de navigator.onLine.
 * A confirmação só acontece depois de resposta HTTP de sucesso do backend.
 * Nenhuma rotina apaga pedidos pendentes; replay usa a mesma chave e payload.
 */
export const DB_NAME = 'garcom-pwa-v1';
export const DB_VERSION = 2;
export const ORDER_STORE = 'orders';
export const META_STORE = 'meta';
export const LEASE_STORE = 'leases';
export const LEASE_TTL_MS = 45000;

export function openOfflineDb(factory = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new Error('IndexedDB indisponível neste navegador')); return; }
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ORDER_STORE)) db.createObjectStore(ORDER_STORE, { keyPath: 'localId' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(LEASE_STORE)) db.createObjectStore(LEASE_STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Falha ao abrir armazenamento local'));
    req.onblocked = () => reject(new Error('Feche outras abas antigas do aplicativo para atualizar o armazenamento local'));
  });
}

function complete(tx, result) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
    tx.onerror = () => reject(tx.error || new Error('Falha de armazenamento local'));
    tx.onabort = () => reject(tx.error || new Error('Gravação local cancelada'));
  });
}

export class OfflineStore {
  constructor(db, ownerToken) { this.db = db; this.ownerToken = ownerToken; }
  all() {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(ORDER_STORE).objectStore(ORDER_STORE).getAll();
      req.onsuccess = () => resolve(req.result.filter(o => o.ownerToken === this.ownerToken).sort((a,b) => b.createdAt-a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }
  async get(localId) { return (await this.all()).find(o => o.localId === localId) || null; }
  put(order) {
    if (order.ownerToken !== this.ownerToken) return Promise.reject(new Error('Pedido pertence a outro garçom'));
    const tx = this.db.transaction(ORDER_STORE, 'readwrite');
    tx.objectStore(ORDER_STORE).put(order);
    return complete(tx);
  }
  getMeta(key) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(META_STORE).objectStore(META_STORE).get(this.ownerToken + ':' + key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    });
  }
  setMeta(key, value) {
    const tx = this.db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key: this.ownerToken + ':' + key, value, updatedAt: Date.now() });
    return complete(tx);
  }
  /** Lease gravado em transação readwrite: duas abas não enviam a mesma fila. */
  acquireLease(key, holder, ttl = LEASE_TTL_MS, now = Date.now()) {
    const tx = this.db.transaction(LEASE_STORE, 'readwrite');
    const store = tx.objectStore(LEASE_STORE);
    const req = store.get(key);
    let acquired = false;
    req.onsuccess = () => {
      const current = req.result;
      if (!current || current.expiresAt <= now || current.holder === holder) {
        acquired = true;
        store.put({ key, holder, expiresAt: now + ttl });
      }
    };
    return complete(tx, () => acquired);
  }
  releaseLease(key, holder) {
    const tx = this.db.transaction(LEASE_STORE, 'readwrite');
    const store = tx.objectStore(LEASE_STORE);
    const req = store.get(key);
    req.onsuccess = () => { if (req.result?.holder === holder) store.delete(key); };
    return complete(tx);
  }
  async leaseActive(key, now = Date.now()) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(LEASE_STORE).objectStore(LEASE_STORE).get(key);
      req.onsuccess = () => resolve(Boolean(req.result && req.result.expiresAt > now));
      req.onerror = () => reject(req.error);
    });
  }
}

export function backoffDelay(attempts, random = Math.random) {
  const exponent = Math.min(8, Math.max(0, Number(attempts) - 1));
  return Math.min(300000, 2000 * (2 ** exponent)) + Math.floor(random() * 1000);
}

export function classifySyncError(error) {
  const status = Number(error?.status || 0);
  if (status === 408 || status === 425 || status === 429 || status >= 500 || !status) return 'retry';
  return 'conflict';
}

export async function probeBackend(url, fetchImpl = globalThis.fetch, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) { const e = new Error('Link do garçom inválido ou desativado'); e.status = res.status; throw e; }
    return res.ok;
  } finally { clearTimeout(timer); }
}

export class SyncEngine {
  constructor({ store, send, probe, onChange = () => {}, now = Date.now, random = Math.random, holder = uid(), leaseTtl = LEASE_TTL_MS }) {
    Object.assign(this, { store, send, probe, onChange, now, random, holder, leaseTtl });
    this.running = false;
    this.stopped = false;
    this.timer = null;
    this.heartbeat = null;
    this.connection = 'checking';
  }
  get leaseKey() { return 'sync:' + this.store.ownerToken; }
  async recoverInterrupted() {
    if (await this.store.leaseActive(this.leaseKey, this.now())) return;
    for (const order of await this.store.all()) {
      if (order.status === 'sync') {
        order.status = 'offline';
        order.nextAttemptAt = this.now();
        order.lastError = 'Envio interrompido; a mesma chave será reenviada com segurança.';
        await this.store.put(order);
      }
    }
  }
  async flush({ force = false, localId = null } = {}) {
    if (this.running || this.stopped) return false;
    this.running = true;
    let acquired = false;
    try {
      acquired = await this.store.acquireLease(this.leaseKey, this.holder, this.leaseTtl, this.now());
      if (!acquired) return false;
      this.heartbeat = setInterval(() => {
        void this.store.acquireLease(this.leaseKey, this.holder, this.leaseTtl, this.now()).catch(() => {});
      }, Math.max(1000, Math.floor(this.leaseTtl / 3)));
      let online = false;
      try { online = await this.probe(); this.connection = online ? 'online' : 'offline'; }
      catch (error) {
        this.connection = error.status === 401 || error.status === 403 ? 'auth' : 'offline';
        if (this.connection === 'auth') {
          for (const order of await this.store.all()) {
            if (['offline','sync','error'].includes(order.status)) { order.status = 'conflict'; order.lastError = error.message; await this.store.put(order); }
          }
        }
      }
      this.onChange(this.connection);
      if (!online) return false;
      const pending = (await this.store.all()).filter(o =>
        (!localId || o.localId === localId) &&
        (force ? ['offline','error','conflict'].includes(o.status) : ['offline','error'].includes(o.status) && (!o.nextAttemptAt || o.nextAttemptAt <= this.now()))
      ).sort((a,b) => a.createdAt-b.createdAt);
      for (const current of pending) {
        if (this.stopped) break;
        const order = await this.store.get(current.localId);
        if (!order || order.status === 'confirmed' || order.status === 'sync') continue;
        order.status = 'sync';
        order.attempts = Number(order.attempts || 0) + 1;
        order.lastAttemptAt = this.now();
        order.sentAt = order.sentAt || this.now();
        await this.store.put(order);
        this.onChange(this.connection);
        try {
          const data = await this.send(structuredClone(order));
          if (!data || !Number.isSafeInteger(Number(data.id))) throw new Error('Resposta do servidor sem identificador do pedido');
          order.status = 'confirmed';
          order.serverOrderId = Number(data.id);
          order.serverSessaoId = data.sessaoId ?? order.serverSessaoId ?? null;
          order.confirmedAt = this.now();
          order.lastError = null;
          order.nextAttemptAt = null;
        } catch (error) {
          const kind = classifySyncError(error);
          order.status = kind === 'conflict' ? 'conflict' : order.attempts >= 6 ? 'error' : 'offline';
          order.lastError = String(error.message || 'Falha de conexão');
          order.errorCode = error.code || null;
          order.nextAttemptAt = kind === 'retry' ? this.now() + backoffDelay(order.attempts, this.random) : null;
          if (error.status === 401 || error.status === 403) this.connection = 'auth';
        }
        // Se esta gravação falhar, o registro anterior permanece e o replay é seguro.
        await this.store.put(order);
        this.onChange(this.connection);
      }
      return true;
    } finally {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
      if (acquired) await this.store.releaseLease(this.leaseKey, this.holder).catch(() => {});
      this.running = false;
    }
  }
  start(intervalMs = 15000) {
    this.stopped = false;
    this.stopTimer();
    this.timer = setInterval(() => { void this.flush().catch(e => { this.connection = 'storage'; this.onChange(this.connection, e); }); }, intervalMs);
    void this.flush().catch(e => { this.connection = 'storage'; this.onChange(this.connection, e); });
  }
  stopTimer() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  stop() { this.stopped = true; this.stopTimer(); }
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
