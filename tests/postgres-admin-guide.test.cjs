'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { subirServidor } = require('./helpers/public-table-server.cjs');

assert.equal(
  new URL(process.env.DATABASE_URL || 'postgres://x/none').pathname,
  '/qradmin_test',
  'Integração bloqueada: database deve ser qradmin_test'
);

let servidor;

test.before(async () => {
  servidor = await subirServidor({ servirSpa: true });
});

test.after(async () => {
  await servidor?.encerrar();
});

test('GET /guia-sistema.html serve o guia sem login e não limpa uma sessão existente', async () => {
  for (const cookie of [undefined, 'lqr_session=token-de-sessao-para-teste']) {
    const resposta = await servidor.request('GET', '/guia-sistema.html', {
      headers: cookie ? { cookie } : {},
    });

    assert.equal(resposta.status, 200);
    assert.match(resposta.headers['content-type'] || '', /text\/html/i);
    assert.equal(resposta.headers.location, undefined, 'o servidor não deve redirecionar para login ou Home');
    assert.equal(resposta.headers['set-cookie'], undefined, 'a página estática não deve alterar a sessão');
    assert.match(resposta.texto, /<title>Guia do sistema · QR Admin<\/title>/);
  }
});
