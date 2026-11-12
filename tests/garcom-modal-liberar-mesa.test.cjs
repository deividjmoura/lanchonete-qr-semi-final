'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('atendimento colaborativo não oferece deixar ou transferir mesa', () => {
  const backend = read('db/atendimento.js');
  const server = read('server.js');
  const pwa = read('public/garcom-pwa/app.js');
  const html = read('public/garcom-pwa/index.html');
  assert.doesNotMatch(backend, /function deixarMesa|function transferirMesa/);
  assert.doesNotMatch(server, /\/deixar\$|\/transferir\$/);
  assert.doesNotMatch(pwa, /leaveTable|transferTable|transferModal/);
  assert.doesNotMatch(html, /transferModal|Deixar mesa|Transferir mesa/);
});

test('sessão aberta continua disponível à equipe sem gravar garçom titular', () => {
  const backend = read('db/atendimento.js');
  assert.match(backend, /INSERT INTO mesa_sessoes \(mesa_id, cliente_nome\)/);
  assert.doesNotMatch(backend, /UPDATE mesa_sessoes SET garcom_responsavel_id/);
  assert.match(backend, /async function criarPedidoGarcom/);
  assert.match(backend, /A mesa precisa ter um atendimento aberto/);
});
