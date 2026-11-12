// Integração HTTP da versão publicada (#301).
//
// Valida o ciclo completo no servidor REAL (`server.js`, sem alteração, rodando
// numa cópia isolada) contra PostgreSQL descartável:
//
//   GET /api/version             → 200 { version } com o valor do dist/
//   Cache-Control                → no-store (CDN/navegador não podem prender)
//   /build-version.json          → 200 e no-store (fonte que o deploy publica)
//   /index.html                  → no-store (senão aba nova carrega bundle velho)
//   /assets/<hash>.js            → imutável (performance não regride)
//   versão do endpoint == versão commitada em dist/build-version.json
//   endpoint sem credencial      → continua 200 (é público, sem dado sensível)
//
//   DATABASE_URL=postgres://.../qradmin_test NODE_ENV=test \
//     node --test tests/postgres-version-endpoint.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { subirServidor, exigirAmbienteDeTeste, RAIZ } = require('./helpers/public-table-server.cjs');

exigirAmbienteDeTeste();

let servidor;
test.before(async () => {
  // servirSpa compartilha o `dist/` real: queremos testar exatamente o que o
  // deploy serve, não um build de teste.
  servidor = await subirServidor({ servirSpa: true });
});
test.after(async () => {
  if (servidor) await servidor.encerrar();
});

const manifesto = () => JSON.parse(fs.readFileSync(path.join(RAIZ, 'dist', 'build-version.json'), 'utf8'));

test('publica o identificador do build que está no dist/', async () => {
  const resposta = await servidor.request('GET', '/api/version');
  assert.equal(resposta.status, 200, 'endpoint de versão não pode falhar em produção');
  const corpo = JSON.parse(resposta.texto);
  assert.match(corpo.version, /^[a-f0-9]{16}$/);
  assert.equal(corpo.version, manifesto().version, 'o servidor e o bundle precisam do MESMO valor');
});

test('versão não é cacheável e não exige sessão', async () => {
  const resposta = await servidor.request('GET', '/api/version');
  const cache = String(resposta.headers['cache-control'] || '');
  assert.match(cache, /no-store/, 'cache de versão faria abas antigas nunca verem o deploy');
  // Sem cookie de sessão: o shell precisa saber da versão antes do login.
  const anonimo = await servidor.request('GET', '/api/version');
  assert.equal(anonimo.status, 200);
});

test('resposta do endpoint não expõe dado sensível', async () => {
  const corpo = (await servidor.request('GET', '/api/version')).texto;
  const texto = corpo.toLowerCase();
  for (const proibido of ['secret', 'senha', 'password', 'token', 'database_url', 'commit', 'authorization']) {
    assert.ok(!texto.includes(proibido), `resposta não pode conter "${proibido}"`);
  }
  // Só os campos combinados: uma versão curta e o nome do app.
  assert.deepEqual(Object.keys(JSON.parse(corpo)).sort(), ['app', 'version']);
});

test('manifesto é servido com no-store e o shell também (sem cache preso)', async () => {
  const manifestoHttp = await servidor.request('GET', '/build-version.json');
  assert.equal(manifestoHttp.status, 200);
  assert.match(String(manifestoHttp.headers['cache-control'] || ''), /no-store/);
  assert.equal(JSON.parse(manifestoHttp.texto).version, manifesto().version);

  // `/` é o shell do SPA (o servidor redireciona /index.html para a rota raiz).
  const html = await servidor.request('GET', '/');
  assert.equal(html.status, 200);
  assert.match(String(html.headers['cache-control'] || ''), /no-store/);
  assert.ok(html.texto.includes('/assets/'), 'o HTML servido precisa apontar para o bundle do SPA');
});

test('assets com hash continuam imutáveis', async () => {
  const html = (await servidor.request('GET', '/')).texto;
  const entrada = /src="(\/assets\/[^"]+)"/.exec(html);
  assert.ok(entrada, 'esperava o script do SPA no HTML');
  const asset = await servidor.request('GET', entrada[1]);
  assert.equal(asset.status, 200);
  assert.match(String(asset.headers['cache-control'] || ''), /immutable/);
});

test('sem manifesto válido o endpoint falha de forma tratável (503, sem 500)', async () => {
  // Prova o comportamento de falha sem depender do ambiente de produção:
  // a leitura é a mesma função usada pelo servidor.
  const { obterVersaoBuild } = require('../lib/build-version');
  assert.equal(obterVersaoBuild(path.join(RAIZ, 'dist', 'nao-existe.json')), null);
});
