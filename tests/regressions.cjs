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

function theme({ blocked = false, dark = false, saved = null } = {}) {
  const root = { dataset: {}, style: { values: {}, setProperty(k, v) { this.values[k] = v; } } };
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
  const context = { document: { documentElement: { dataset: {} } }, localStorage: { getItem() { throw Error(); } }, window: { matchMedia: () => ({ matches: true }) } };
  vm.runInNewContext(script, context);
  assert.equal(context.document.documentElement.dataset.theme, 'escuro');
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

test('abertura de sessão trava a mesa antes de criar sessão', async () => {
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

test('produto inválido não dispara consulta ao PostgreSQL', async () => {
  let called = false;
  const client = { query: async () => { called = true; return { rows: [] }; } };
  assert.equal(await getProdutoComRegras(client, NaN), null);
  assert.equal(await getProdutoComRegras(client, Infinity), null);
  assert.equal(await getProdutoComRegras(client, 0), null);
  assert.equal(called, false);
});
