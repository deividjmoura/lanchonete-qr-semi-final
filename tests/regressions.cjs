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
const { ErroPedido, criarPedido, setStatusPedido, setStatusItem } = require('../db/pedidos');
const { sanitizarAlvoRequisicao, sanitizarDetalheErro } = require('../db/log-sanitizer');

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

test('logs HTTP omitem tokens bearer de caminho, query e mensagens de erro', () => {
  const token = '12345678-1234-4234-8234-123456789abc';
  assert.equal(
    sanitizarAlvoRequisicao(`/api/garcom/${token}/pedidos?token=${token}`),
    '/api/garcom/[REDACTED]/pedidos'
  );
  assert.equal(
    sanitizarAlvoRequisicao(`/mesa/${token}?mesa=${token}`),
    '/mesa/[REDACTED]'
  );
  assert.equal(
    sanitizarAlvoRequisicao(`/api/events?garcom=${token}&mesa=${token}`),
    '/api/events'
  );
  assert.doesNotMatch(sanitizarDetalheErro(new Error(`Falha para token ${token}`)), new RegExp(token));
});

test('upload de foto rejeita destinos SSRF locais', async () => {
  await assert.rejects(() => validarDestinoRemoto('http://127.0.0.1/segredo'), /Destino de rede não permitido/);
  await assert.rejects(() => validarDestinoRemoto('http://10.0.0.1/segredo'), /Destino de rede não permitido/);
  await assert.rejects(() => validarDestinoRemoto('file:///etc/passwd'), /http:\/\/ ou https:\/\//);
});

/* A reescrita de db/foto.js (sharp lazy) quase levou embora estas defesas. Elas
   voltaram e ficam travadas aqui, porque o padrão de "aparece corrigido, some no
   próximo refactor" já aconteceu três vezes neste repo. */
test('SSRF: IPv6 reservado e IPv4 mapeado não passam', async () => {
  for (const alvo of [
    'http://[::1]/x', 'http://[fc00::1]/x', 'http://[fd12:3456::1]/x',
    'http://[fe80::1]/x', 'http://[ff02::1]/x', 'http://[::ffff:127.0.0.1]/x',
    'http://[::]/x',
  ]) {
    await assert.rejects(() => validarDestinoRemoto(alvo), /rede não permitido|URL de imagem inválida/, alvo);
  }
});

test('SSRF: alcance IPv4 reservados além do básico', async () => {
  for (const alvo of [
    'http://169.254.169.254/latest/meta-data/', 'http://192.0.2.1/x', 'http://198.18.0.1/x',
    'http://100.64.0.1/x', 'http://0.0.0.0/x', 'http://224.0.0.1/x',
  ]) {
    await assert.rejects(() => validarDestinoRemoto(alvo), /rede não permitido/, alvo);
  }
});

test('SSRF: credencial embutida na URL é rejeitada', async () => {
  await assert.rejects(() => validarDestinoRemoto('http://admin:segredo@10.0.0.9/foto.png'), /URL de imagem inválida/);
  await assert.rejects(() => validarDestinoRemoto('http://user@127.0.0.1/foto.png'), /URL de imagem inválida|rede não permitido/);
});

test('upload aceita o corpo { data } / { url } que o server.js envia', async () => {
  // Regressão da reescrita: processarUploadFoto passou a aceitar só string/Buffer
  // e o endpoint manda o objeto do body → todo upload do admin daria 400.
  const { processarUploadFoto } = require('../db/foto');
  await assert.rejects(() => processarUploadFoto({ url: 'http://127.0.0.1/interno.png' }), /Destino de rede não permitido/);
  await assert.rejects(() => processarUploadFoto({}), /Envie data-URL base64, Buffer ou URL https/);
  await assert.rejects(() => processarUploadFoto({ data: 'data:image/png;base64,@@@' }), /base64 inválido|[Ii]magem vazia|corrompido/);
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

test('criação de pedido rejeita carrinho malformado antes de abrir conexão', async () => {
  const pool = require('../db/pool');
  const originalConnect = pool.connect;
  let connections = 0;
  pool.connect = async () => { connections += 1; throw new Error('não deveria conectar'); };
  try {
    for (const items of [
      [{ id: 1, qty: 1 }, null],
      [{ id: 1, qty: 1 }, { id: 'abc', qty: 1 }],
      [{ id: 1, qty: 1 }, []],
    ]) {
      await assert.rejects(
        () => criarPedido('12345678-1234-4234-8234-123456789abc', { items }),
        (e) => e instanceof ErroPedido && e.status === 400
      );
    }
    assert.equal(connections, 0);
  } finally {
    pool.connect = originalConnect;
  }
});

test('criação de pedido rejeita produto inexistente sem persistir subconjunto do carrinho', async () => {
  const pool = require('../db/pool');
  const originalConnect = pool.connect;
  const calls = [];
  let released = false;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT id, numero, status FROM mesas WHERE token')) {
        return { rows: [{ id: 7, numero: 3, status: 'ocupada' }] };
      }
      if (sql.includes('SELECT id FROM mesas WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 7 }] };
      }
      if (sql.includes("SELECT id FROM mesa_sessoes WHERE mesa_id = $1 AND status = 'aberta'")) {
        return { rows: [{ id: 42 }] };
      }
      if (sql.includes('INSERT INTO pedidos')) {
        return { rows: [{ id: 99, status: 'recebido', criado_em: new Date(), cliente_nome: null, editado_em: null }] };
      }
      if (sql.includes('SELECT id, nome, preco, disponivel, pede_ponto_carne, controla_estoque, estoque FROM produtos')) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 1 };
    },
    release() { released = true; },
  };
  pool.connect = async () => client;
  try {
    await assert.rejects(
      () => criarPedido('12345678-1234-4234-8234-123456789abc', {
        items: [{ id: 1, qty: 1 }, { id: 999999, qty: 1 }],
      }),
      (e) => e instanceof ErroPedido && e.status === 409
    );
    assert.ok(calls.some((c) => c.sql === 'ROLLBACK'), 'a transação inteira deve ser desfeita');
    assert.equal(calls.some((c) => c.sql.includes('INSERT INTO itens_pedido ')), false);
    assert.equal(calls.some((c) => c.sql.includes('UPDATE produtos')), false);
    assert.equal(calls.some((c) => c.sql === 'COMMIT'), false);
    assert.equal(released, true);
  } finally {
    pool.connect = originalConnect;
  }
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

/* ---------- PIX do cliente (hardening do colega, porta do ab9fa34) ----------
   Os testes dele eram regex no fonte; aqui viram comportamentais — mesma proteção,
   sem quebrar na próxima formatação. */

const { informarPixPago, ErroPixCliente, validarUuid } = require('../db/pix-cliente');

test('PIX rejeita token fora do formato UUID antes de tocar no PostgreSQL', async () => {
  for (const token of ['', '  ', 'nao-existe', '../etc/passwd', '00000000-0000-0000-0000-000000000000', null, 42]) {
    await assert.rejects(() => informarPixPago(token, {}), (e) => e instanceof ErroPixCliente && e.status === 400, String(token));
  }
  assert.equal(validarUuid('00000000-0000-4000-8000-000000000000'), '00000000-0000-4000-8000-000000000000');
});

test('PIX rejeita payload não-objeto e campos explícitos inválidos', async () => {
  const uuid = '00000000-0000-4000-8000-000000000000';
  // undefined é omissão legítima (vira {}); null/string/número/array são payload quebrado.
  for (const corpo of [null, 'x', 42, []]) {
    await assert.rejects(() => informarPixPago(uuid, corpo), /Dados do PIX inválidos/, String(corpo));
  }
  for (const pedidoId of ['abc', 1.5, 0, -3, true, {}]) {
    await assert.rejects(() => informarPixPago(uuid, { pedidoId }), /Pedido (inválido|deve ser inteiro)/);
  }
  for (const valor of ['abc', 0, -1, true, NaN, Infinity, {}]) {
    await assert.rejects(() => informarPixPago(uuid, { valor }), /Valor inválido/);
  }
});

test('rotas de PIX e entrega não mascaram JSON inválido em payload vazio', () => {
  const source = fs.readFileSync('server.js', 'utf8');
  // body() já resolve {} para corpo ausente; engolir erro de parse virava
  // "PIX com payload inventado" e "entregar todos os itens".
  assert.doesNotMatch(source, /await body\(req\)\.catch\(\(\) => \(\{\}\)\)/);
  assert.match(source, /const payload = await body\(req\);\s*const out = await informarPixPago/);
  assert.equal((source.match(/await body\(req\);/g) || []).length >= 2, true);
});

/* ------------------------------------------------------------------ *
 * PIX: normalização de chave (fonte única) e payload EMV/BR Code
 * ------------------------------------------------------------------ */
const { normalizarChavePix, inspecionarChavePix, cpfValido, cnpjValido } = require('../db/pix-normaliza');

test('chave aleatória (EVP) sobrevive à normalização — bug que destruía 1,18% das chaves', () => {
  // O server.js antigo não checava letras: um UUID com 11/14 dígitos virava
  // "CPF"/"telefone" e o QR passava a apontar para uma chave inexistente,
  // mesmo com PIX_CHAVE correta no provedor.
  const destruidasAntes = [
    '7a064d54-edbe-49fd-b675-eaff2b5ce6bb', // 14 dígitos
    'df0c7f27-c606-40cd-9dba-ffeadda63f01', // 14 dígitos
    'a4984f0b-15f0-4efb-bcba-413bfe3fdbb4', // 14 dígitos
    'b139cfb3-cae4-4e9d-9ade-7b1eb021b3de', // 14 dígitos
  ];
  for (const k of destruidasAntes) {
    assert.equal(normalizarChavePix(k), k.toLowerCase(), k);
  }
  // varredura: nenhum UUID v4 aleatório pode ser reescrito
  for (let i = 0; i < 3000; i++) {
    const b = require('node:crypto').randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString('hex');
    const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    assert.equal(normalizarChavePix(uuid), uuid, `UUID reescrito: ${uuid} → ${normalizarChavePix(uuid)}`);
  }
});

test('normalização resolve CPF x celular pelos dígitos verificadores', () => {
  // 11 dígitos são ambíguos (CPF ou DDD+número). Só o dígito verificador decide.
  assert.equal(cpfValido('52998224725'), true);
  assert.equal(cpfValido('11111111111'), false, 'sequência repetida não é CPF');
  assert.equal(cpfValido('52998224726'), false, 'dígito verificador errado');
  assert.equal(normalizarChavePix('529.982.247-25'), '52998224725', 'CPF válido vira só dígitos');
  assert.equal(normalizarChavePix('21987654321'), '+5521987654321', '11 dígitos que não são CPF viram celular E.164');
  assert.equal(normalizarChavePix('(21) 98765-4321'), '+5521987654321');
  assert.equal(cnpjValido('11222333000181'), true);
  assert.equal(cnpjValido('00000000000000'), false, 'CNPJ de zeros não é válido');
  assert.equal(normalizarChavePix('11.222.333/0001-81'), '11222333000181');
});

test('normalização preserva e-mail, E.164 e remove aspas de .env', () => {
  assert.equal(normalizarChavePix('Pagamentos@MajorPub.com.br'), 'pagamentos@majorpub.com.br');
  assert.equal(normalizarChavePix('+55 21 98765-4321'), '+5521987654321');
  assert.equal(normalizarChavePix('"21987654321"'), '+5521987654321', 'aspas de .env/painel não podem virar parte da chave');
  assert.equal(normalizarChavePix('"Pag@MajorPub.com.br"'), 'pag@majorpub.com.br');
  assert.equal(normalizarChavePix('   '), '');
  assert.equal(normalizarChavePix(undefined), '');
});

test('inspeção de chave sinaliza chave ausente/placeholder em vez de QR inválido', () => {
  assert.deepEqual(inspecionarChavePix(''), { ok: false, tipo: 'vazia', motivo: 'PIX_CHAVE não está definida no servidor' });
  assert.equal(inspecionarChavePix('00000000000').tipo, 'placeholder');
  assert.equal(inspecionarChavePix('00000000000000').ok, false);
  assert.equal(inspecionarChavePix('21987654321').tipo, 'telefone');
  assert.equal(inspecionarChavePix('pag@x.com').tipo, 'email');
  assert.equal(inspecionarChavePix('f47ac10b-58cc-4372-a567-0e02b2c3d479').tipo, 'aleatoria');
});

test('server.js usa a fonte única de normalização (sem segunda cópia)', () => {
  const source = fs.readFileSync('server.js', 'utf8');
  assert.match(source, /require\('\.\/db\/pix-normaliza'\)/);
  // a lógica duplicada que causava o bug não pode voltar
  assert.doesNotMatch(source, /digits\.length === 11 \|\| digits\.length === 14/);
  const front = fs.readFileSync('src/lib/utils.ts', 'utf8');
  assert.match(front, /from "\.\.\/\.\.\/db\/pix-normaliza\.js"/, 'front deve importar a mesma implementação');
});

test('payload PIX (BR Code) é TLV válido com CRC16 correto', () => {
  const code = ts.transpileModule(fs.readFileSync('src/lib/utils.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  // utils.ts importa ../../db/pix-normaliza.js — o require do contexto precisa
  // resolver a partir de src/lib/, não a partir de tests/.
  const requireDeSrc = require('node:module').createRequire(
    require('node:path').join(process.cwd(), 'src', 'lib', 'utils.ts')
  );
  const ctx = { exports: {}, console: { warn() {} }, require: requireDeSrc };
  vm.runInNewContext(code, ctx);
  const { montarPixEMV } = ctx.exports;

  const crc16 = (s) => {
    let crc = 0xffff;
    for (const ch of s) {
      crc ^= ch.charCodeAt(0) << 8;
      for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  };
  const parseTLV = (s) => {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const id = s.substr(i, 2);
      const len = Number(s.substr(i + 2, 2));
      assert.match(id, /^\d{2}$/, `id de campo inválido em ${i}`);
      out.push({ id, len, val: s.substr(i + 4, len) });
      i += 4 + len;
    }
    assert.equal(i, s.length, 'payload tem bytes fora de TLV');
    return out;
  };

  const casos = [
    { chave: '21987654321', nome: 'MAJOR PUB', cidade: 'SAO PAULO', valor: 147.9, txid: 'SESSAO12' },
    { chave: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', nome: 'MAJOR PUB', cidade: 'SP', valor: 50, txid: 'SESSAO1' },
    { chave: 'pag@majorpub.com.br', nome: 'MAJOR PUB', cidade: 'SP', valor: 0.01, txid: 'SESSAO1' },
    { chave: '21987654321', nome: 'AÇAITERIA SÃO JOSÉ', cidade: 'RIO DE JANEIRO', txid: 'SESSAO-9/26!' },
  ];
  for (const opts of casos) {
    const payload = montarPixEMV(opts);
    assert.match(payload, /^[\x20-\x7E]+$/, 'payload com caractere não-ASCII');
    assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)), `CRC inválido para ${opts.chave}`);
    const tlvs = parseTLV(payload);
    const ids = tlvs.map((t) => t.id);
    for (const obrigatorio of ['00', '26', '52', '53', '58', '59', '60', '63']) {
      assert.ok(ids.includes(obrigatorio), `campo obrigatório ${obrigatorio} ausente`);
    }
    const nums = tlvs.map((t) => Number(t.id));
    for (let i = 1; i < nums.length; i++) assert.ok(nums[i] > nums[i - 1], 'campos fora de ordem crescente');
    assert.ok(tlvs.find((t) => t.id === '59').val.length <= 25, 'nome acima de 25 chars');
    assert.ok(tlvs.find((t) => t.id === '60').val.length <= 15, 'cidade acima de 15 chars');
    const mai = parseTLV(tlvs.find((t) => t.id === '26').val);
    assert.equal(mai[0].val, 'BR.GOV.BCB.PIX');
    assert.ok(mai[1].val.length > 0, 'campo 26 sem chave');
  }
});

/* ------------------------------------------------------------------ *
 * Transacional 70 mesas: retry, idempotência, lote e locks ordenados
 * ------------------------------------------------------------------ */
const { comRetryConcorrencia, ehErroConcorrenciaTransitorio } = require('../db/retry');
const { normalizarIdempotencyKey, idempotencyKeyDoCorpo } = require('../db/conta');
const queriesModulo = require('../db/queries');
const caixaModulo = require('../db/caixa');
const pedidosModulo = require('../db/pedidos');

test('retry só repete deadlock/serialização (40P01/40001), nunca erro de negócio', async () => {
  const semDormir = async () => {};
  let tentativas = 0;
  const resultado = await comRetryConcorrencia(
    async () => {
      tentativas += 1;
      if (tentativas < 3) { const e = new Error('deadlock'); e.code = '40P01'; throw e; }
      return 'ok';
    },
    { dormir: semDormir }
  );
  assert.equal(resultado, 'ok');
  assert.equal(tentativas, 3);

  let uma = 0;
  await assert.rejects(
    () => comRetryConcorrencia(async () => { uma += 1; throw new ErroPedido(409, 'conflito'); }, { dormir: semDormir }),
    (e) => e instanceof ErroPedido && e.status === 409
  );
  assert.equal(uma, 1);
  assert.equal(ehErroConcorrenciaTransitorio(Object.assign(new Error('x'), { code: '40001' })), true);
  assert.equal(ehErroConcorrenciaTransitorio(new Error('x')), false);
});

test('chave de idempotência: ausente é opcional, presente inválida é rejeitada', () => {
  assert.equal(normalizarIdempotencyKey(undefined), null);
  assert.equal(normalizarIdempotencyKey(''), null);
  assert.equal(normalizarIdempotencyKey('   '), null);
  assert.equal(normalizarIdempotencyKey('f47ac10b-58cc-4372-a567-0e02b2c3d479'), 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
  assert.equal(normalizarIdempotencyKey('curta'), false);
  assert.equal(normalizarIdempotencyKey('tem espaço aqui'), false);
  assert.equal(normalizarIdempotencyKey(42), false);
  assert.equal(idempotencyKeyDoCorpo({ clientRequestId: 'abcd1234-ef' }), 'abcd1234-ef');
  assert.equal(idempotencyKeyDoCorpo({}), null);
  assert.equal(idempotencyKeyDoCorpo(null), null);
});

test('produtos com regras em LOTE: 3 consultas para o carrinho inteiro', async () => {
  let consultas = 0;
  const client = {
    async query(sql) {
      consultas += 1;
      if (/produtos_ingredientes_removiveis/.test(sql)) return { rows: [{ produto_id: 1, ingrediente: 'cebola' }] };
      if (/FROM produtos/.test(sql)) {
        return { rows: [
          { id: 1, nome: 'A', preco: 10, disponivel: true, pede_ponto_carne: false, controla_estoque: false, estoque: null },
          { id: 2, nome: 'B', preco: 20, disponivel: true, pede_ponto_carne: false, controla_estoque: true, estoque: 5 },
        ] };
      }
      if (/FROM adicionais/.test(sql)) return { rows: [{ id: 9, produto_id: 2, nome: 'Extra', preco: 3 }] };
      if (/removiveis/.test(sql)) return { rows: [{ produto_id: 1, ingrediente: 'cebola' }] };
      return { rows: [] };
    },
  };
  const mapa = await queriesModulo.getProdutosComRegras(client, [1, 2, 2, 999]);
  assert.equal(consultas, 3);
  assert.equal(mapa.get(2).adicionaisPermitidos.length, 1);
  assert.deepEqual(mapa.get(1).removiveisPermitidos, ['cebola']);
  assert.equal(mapa.has(999), false);
});

test('trava de produtos dedupa e ordena ids (ordem global anti-deadlock)', async () => {
  let params = null;
  let sqlUsado = '';
  const client = { async query(sql, p) { sqlUsado = sql; params = p; return { rows: [] }; } };
  const travados = await queriesModulo.travarProdutosEmOrdem(client, [9, 2, 5, 2, 0, -1]);
  assert.deepEqual(travados, [2, 5, 9]);
  assert.deepEqual(params[0], [2, 5, 9]);
  assert.match(sqlUsado, /ORDER BY id FOR UPDATE/);
});

test('migration 0018 cria unicidades de idempotência e vínculo PIX 1:1', () => {
  const sql = fs.readFileSync('db/migrations/0018_transacional_idempotencia.sql', 'utf8');
  for (const trecho of [
    'uq_pedidos_sessao_idempotency',
    'uq_pagamentos_sessao_idempotency',
    'uq_sessoes_fechamento_idempotency',
    'uq_pagamentos_pix_aviso',
    'pix_aviso_id',
    'idx_pedidos_sessao_status',
  ]) {
    assert.match(sql, new RegExp(trecho), trecho);
  }
});

test('caixa/pedidos rejeitam ids e corpos inválidos antes de abrir conexão', async () => {
  const ehCaixa400 = (e) => e instanceof caixaModulo.ErroCaixa && e.status === 400;
  await assert.rejects(() => caixaModulo.registrarPagamento('abc', { valor: 1, formaPagamento: 'pix' }), ehCaixa400);
  await assert.rejects(() => caixaModulo.registrarPagamento(1, null), ehCaixa400);
  await assert.rejects(() => caixaModulo.fecharSessao(NaN, { formaPagamento: 'pix' }), ehCaixa400);
  await assert.rejects(() => caixaModulo.confirmarPixAviso(1, 'x'), ehCaixa400);
  await assert.rejects(
    () => pedidosModulo.criarPedido('00000000-0000-4000-8000-000000000000', null),
    (e) => e instanceof ErroPedido && e.status === 400
  );
  await assert.rejects(
    () => pedidosModulo.criarPedido('00000000-0000-4000-8000-000000000000', { items: [{}], idempotencyKey: 'x' }),
    /idempotência inválida/
  );
});

test('SSE público é coalescido (1 aviso/janela); staff recebe tudo na hora', async () => {
  const staff = new EventEmitter();
  const publico = new EventEmitter();
  let staffWrites = 0;
  let publicWrites = 0;
  staff.write = () => { staffWrites += 1; };
  publico.write = () => { publicWrites += 1; };
  subscribe(staff);
  subscribe(publico, { publicClient: true });
  for (let i = 0; i < 5; i++) broadcast('update', { i });
  assert.equal(staffWrites, 5, 'staff não pode perder evento');
  assert.equal(publicWrites, 1, 'público recebe o primeiro na hora e colapsa a rajada');
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(publicWrites, 2, 'e um último aviso ao fim da janela');
  staff.emit('close');
  publico.emit('close');
  assert.equal(clientCount(), 0);
});


test('sharp usa versão corrigida e continua convertendo uploads para WebP', async () => {
  const sharpPackage = require('../node_modules/sharp/package.json');
  const semver = require('semver');
  assert.ok(
    semver.gte(sharpPackage.version, '0.35.5'),
    `sharp vulnerável: ${sharpPackage.version}; esperado >= 0.35.5`
  );

  const { processarUploadFoto } = require('../db/foto');
  // PNG 1x1 sintético: sem arquivos externos, rede ou banco de dados.
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const result = await processarUploadFoto({ data: `data:image/png;base64,${png}` });
  assert.match(result.fotoUrl, /^data:image\/webp;base64,/);
  assert.ok(result.bytes > 0);
});

test('seed de garçom não imprime nem retorna token bearer', () => {
  const seed = fs.readFileSync('db/seed.js', 'utf8');
  assert.doesNotMatch(
    seed,
    /console\.log\([^;]*token[^;]*ins\[0\]\.token/i,
    'o seed não deve imprimir o token de garçom'
  );
  assert.doesNotMatch(seed, /RETURNING id, nome, token/i, 'o seed não deve buscar o token sem necessidade');
  assert.doesNotMatch(
    seed,
    /return\s*\{\s*created:\s*true,\s*count:\s*1,\s*token:\s*ins\[0\]\.token\s*\}/,
    'o seed não deve propagar o token em seu resultado'
  );
});
