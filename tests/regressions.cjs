require('dotenv').config();
/* Nenhum teste conecta ao banco de verdade; o valor só evita o exit(1)
   do pool.js na importação dos módulos db/*. */
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgres://regress:regress@127.0.0.1:5432/regress';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const { eventAccess } = require('../db/event-access');
const { subscribe, broadcast, clientCount } = require('../db/events');
const { validarDestinoRemoto } = require('../db/foto');
const { verificarOrigemRequisicao } = require('../db/auth');
const { ErroValidacao, numeroFinito, numeroInteiroPositivo } = require('../db/validacao');
const { getOuAbrirSessao, getProdutoComRegras } = require('../db/queries');
const { ErroGarcom, removerGarcom, setGarcomAtivo, entregarComoGarcom } = require('../db/garcons');
const { ErroPedido, setStatusPedido, setStatusItem } = require('../db/pedidos');

/* Mock mínimo de <html> que espelha o DOM real:
   dataset ↔ data-theme ficam sincronizados com getAttribute/setAttribute. */
function criarRoot() {
  const classes = new Set();
  return {
    _attrs: {},
    style: { values: {}, setProperty(k, v) { this.values[k] = v; } },
    get dataset() { return { theme: this._attrs['data-theme'] }; },
    set dataset(v) { this._attrs['data-theme'] = v.theme; },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains: (name) => classes.has(name),
    },
  };
}

function theme({ blocked = false, dark = false, saved = null } = {}) {
  const root = criarRoot();
  const meta = {};
  const context = {
    exports: {},
    document: { documentElement: root, querySelector: () => ({ setAttribute: (k, v) => meta[k] = v }) },
    window: { matchMedia: () => ({ matches: dark }), dispatchEvent: () => {} },
    localStorage: {
      getItem: () => { if (blocked) throw Error('Blocked'); return saved; },
      setItem: (_, v) => { if (blocked) throw Error('Blocked'); saved = v; },
    },
    CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail; } },
  };
  const code = ts.transpileModule(fs.readFileSync('src/lib/tema.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, context);
  return { ...context.exports, root, meta, saved: () => saved };
}

test('tema alterna repetidamente mesmo com armazenamento bloqueado', () => {
  const t = theme({ blocked: true });
  t.aplicarTema(t.temaAtual());
  for (const expected of ['escuro', 'claro', 'escuro', 'claro']) {
    t.alternarTema();
    assert.equal(t.root.dataset.theme, expected);
    assert.equal(t.temaAtual(), expected);
  }
});
test('tema respeita sistema sem armazenamento e preferência salva', () => {
  assert.equal(theme({ blocked: true, dark: true }).temaAtual(), 'escuro');
  assert.equal(theme({ saved: 'claro', dark: true }).temaAtual(), 'claro');
  const t = theme();
  t.aplicarTema('escuro');
  assert.equal(t.saved(), 'escuro');
  assert.equal(t.meta.content, '#0b1524');
  assert.equal(theme({ saved: t.saved() }).temaAtual(), 'escuro');
});
test('tema claro usa superfície suave e não branco agressivo', () => {
  const t = theme();
  t.aplicarTema('claro');
  assert.equal(t.root.style.values['--qr-page'], '#e9eef3');
  assert.equal(t.root.style.values['--qr-white'], '#f7f9fb');
  assert.equal(t.meta.content, '#e9eef3');
});
test('inicialização antes do React respeita sistema com armazenamento bloqueado', () => {
  const script = fs.readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const context = { document: { documentElement: criarRoot() }, localStorage: { getItem() { throw Error(); } }, window: { matchMedia: () => ({ matches: true }) } };
  vm.runInNewContext(script, context);
  assert.equal(context.document.documentElement.dataset.theme, 'escuro');
  assert.equal(context.document.documentElement.classList.contains('dark'), true);
  assert.equal(context.document.documentElement.style.values['--qr-page'], '#0b1524');
});
test('inicialização antes do React aplica o tema claro sem flash branco agressivo', () => {
  const script = fs.readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const context = { document: { documentElement: criarRoot() }, localStorage: { getItem() { return 'claro'; } }, window: { matchMedia: () => ({ matches: false }) } };
  vm.runInNewContext(script, context);
  assert.equal(context.document.documentElement.dataset.theme, 'claro');
  assert.equal(context.document.documentElement.style.values['--qr-page'], '#e9eef3');
  assert.equal(context.document.documentElement.style.values['--qr-white'], '#f7f9fb');
});
test('tema normaliza valores legados light/dark de builds anteriores', () => {
  assert.equal(theme({ saved: 'dark', dark: false }).temaAtual(), 'escuro');
  assert.equal(theme({ saved: 'light', dark: true }).temaAtual(), 'claro');
  const t = theme();
  t.aplicarTema('escuro');
  assert.equal(t.root.dataset.theme, 'escuro');
  assert.equal(t.root.classList.contains('dark'), true);
  t.aplicarTema('claro');
  assert.equal(t.root.dataset.theme, 'claro');
  assert.equal(t.root.classList.contains('dark'), false);
});
test('SSE exige token existente ou staff e rejeita garçom inativo', async () => {
  const token = '12345678-1234-4234-8234-123456789abc';
  const deps = { staff: null, findMesa: async () => null, findGarcom: async () => null };
  assert.equal(await eventAccess(new URLSearchParams(), deps), null);
  assert.equal(await eventAccess(new URLSearchParams({ mesa: token }), deps), null);
  assert.equal(await eventAccess(new URLSearchParams({ mesa: token }), { ...deps, findMesa: async () => ({ id: 1 }) }), 'public');
  assert.equal(await eventAccess(new URLSearchParams({ garcom: token }), { ...deps, findGarcom: async () => ({ ativo: false }) }), null);
  assert.equal(await eventAccess(new URLSearchParams({ garcom: token }), { ...deps, findGarcom: async () => ({ ativo: true }) }), 'public');
  assert.equal(await eventAccess(new URLSearchParams(), { ...deps, staff: { id: 1 } }), 'staff');
});
test('SSE público não divulga nome, token ou pagamento de outra mesa', () => {
  const staff = new EventEmitter(); const publicRes = new EventEmitter();
  let staffData = ''; let publicData = '';
  staff.write = s => staffData += s; publicRes.write = s => publicData += s;
  subscribe(staff); subscribe(publicRes, { publicClient: true });
  broadcast('update', { clienteNome: 'Privado', mesaToken: 'segredo', valor: 20 });
  assert.match(staffData, /Privado/);
  assert.equal(publicData, 'event: update\ndata: {}\n\n');
  staff.emit('close'); publicRes.emit('close');
  assert.equal(clientCount(), 0);
});
test('cliente SSE envia token e encerra conexão no cleanup', () => {
  let url; let closed = false;
  const context = { exports: {}, URLSearchParams, setTimeout, clearTimeout, EventSource: class {
    constructor(value) { url = value; } addEventListener() {} close() { closed = true; }
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/api.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  const stop = context.exports.connectEvents(() => {}, { mesa: 'a&b' });
  assert.equal(url, '/api/events?mesa=a%26b'); stop(); assert.equal(closed, true);
  context.exports.connectEvents(() => {}, { garcom: 'abc' })();
  assert.equal(url, '/api/events?garcom=abc');
  context.exports.connectEvents(() => {})(); assert.equal(url, '/api/events');
});

test('upload de foto rejeita destinos SSRF locais', async () => {
  await assert.rejects(() => validarDestinoRemoto('http://127.0.0.1/segredo'), /Destino de rede não permitido/);
  await assert.rejects(() => validarDestinoRemoto('http://10.0.0.1/segredo'), /Destino de rede não permitido/);
  await assert.rejects(() => validarDestinoRemoto('file:///etc/passwd'), /http:\/\/ ou https:\/\//);
});

test('requisições autenticadas rejeitam Origin externo', () => {
  assert.doesNotThrow(() => verificarOrigemRequisicao({
    method: 'POST',
    headers: { host: 'app.local', origin: 'http://app.local' },
    socket: { encrypted: false },
  }));
  assert.throws(() => verificarOrigemRequisicao({
    method: 'POST',
    headers: { host: 'app.local', origin: 'https://evil.example' },
    socket: { encrypted: false },
  }), /Origem da requisição não permitida/);
});

/* ---------- Regressões vindas de hardening/pre-sale-audit (PR #7) ----------
   Esses casos existiam lá e se perderam na resolução de conflito do PR #8. */

test('validação numérica do admin rejeita NaN, Infinity, vazios e tipos inválidos', () => {
  for (const value of [NaN, Infinity, -Infinity, '', '   ', true, false, {}, [], 'abc']) {
    assert.throws(
      () => numeroFinito(value, 'Preço', { minimo: 0 }),
      (error) => error instanceof ErroValidacao && error.status === 400
    );
  }
  assert.equal(numeroFinito('12.50', 'Preço', { minimo: 0 }), 12.5);
  assert.equal(numeroFinito(0, 'Estoque', { inteiro: true, minimo: 0 }), 0);
  assert.equal(numeroFinito(null, 'Estoque', { allowNull: true }), null);
  assert.equal(numeroInteiroPositivo('7', 'categoriaId'), 7);
  assert.throws(() => numeroFinito(1.5, 'Estoque', { inteiro: true, minimo: 0 }), /deve ser inteiro/);
  assert.throws(() => numeroFinito(-1, 'Estoque', { minimo: 0 }), /inválido/);
  assert.throws(() => numeroInteiroPositivo('0', 'categoriaId'), /inválido/);
});

test('abertura de sessão trava a mesa antes de criar sessão (ADR-005)', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT id FROM mesas')) return { rows: [{ id: 7 }] };
      if (sql.includes("SELECT id FROM mesa_sessoes")) return { rows: [] };
      if (sql.includes('INSERT INTO mesa_sessoes')) return { rows: [{ id: 42 }] };
      return { rows: [] };
    },
  };
  assert.equal(await getOuAbrirSessao(client, 7), 42);
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.match(calls[1].sql, /status = 'aberta'/);
  assert.match(calls[2].sql, /INSERT INTO mesa_sessoes/);
});

test('produto com id inválido não dispara consulta ao PostgreSQL', async () => {
  let called = false;
  const client = { query: async () => { called = true; return { rows: [] }; } };
  assert.equal(await getProdutoComRegras(client, NaN), null);
  assert.equal(await getProdutoComRegras(client, Infinity), null);
  assert.equal(await getProdutoComRegras(client, 0), null);
  assert.equal(called, false);
});

test('admin de garçom rejeita IDs não inteiros antes do banco', async () => {
  // Funções são async: o erro vira rejeição, não exception síncrona.
  await assert.rejects(() => removerGarcom(Infinity), (e) => e instanceof ErroValidacao && e.status === 400);
  await assert.rejects(() => setGarcomAtivo(NaN, true), (e) => e instanceof ErroValidacao && e.status === 400);
  await assert.rejects(
    () => entregarComoGarcom(-1, '00000000-0000-4000-8000-000000000000'),
    (e) => e instanceof ErroValidacao && e.status === 400
  );
  assert.equal(ErroGarcom.prototype instanceof Error, true);
});

test('cozinha/bar não podem concluir entrega pelo endpoint genérico (ADR-007)', async () => {
  // O guard roda antes de qualquer conexão com o banco, então o teste é herético.
  await assert.rejects(() => setStatusPedido(1, 'entregue', 'cozinha'), (e) => e instanceof ErroPedido && e.status === 403);
  await assert.rejects(() => setStatusPedido(1, 'entregue', 'bar'), (e) => e instanceof ErroPedido && e.status === 403);
  await assert.rejects(() => setStatusItem(1, 'entregue'), (e) => e instanceof ErroPedido && e.status === 400);
});

/* ---------- Schema: DDL não pode morar no caminho da requisição ---------- */

test('migrations incluem a tabela pix_avisos com índice', () => {
  const sql = fs.readFileSync('db/migrations/0016_pix_avisos.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pix_avisos/);
  assert.match(sql, /idx_pix_avisos_sessao_status/);
});

test('handlers de pedido e caixa não disparam DDL em tempo de requisição', () => {
  for (const file of ['db/caixa.js', 'db/pedidos.js', 'server.js']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /CREATE TABLE/, `${file} não deveria criar tabela`);
    assert.doesNotMatch(source, /ensurePixAvisosTable\(/, `${file} não deveria chamar o DDL legado`);
  }
});

test('relação ausente vira 503 acionável em vez de erro cru do PostgreSQL', () => {
  const { erroDeSchema, ErroPixCliente } = require('../db/pix-cliente');
  const marcado = erroDeSchema(Object.assign(new Error('relation "pix_avisos" does not exist'), { code: '42P01' }));
  assert.ok(marcado instanceof ErroPixCliente);
  assert.equal(marcado.status, 503);
  const outro = new Error('outra coisa');
  assert.equal(erroDeSchema(outro), outro);
});
