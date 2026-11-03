'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizarAlvoRequisicao,
  sanitizarDetalheErro,
} = require('../db/log-sanitizer');
const { linhaDeLog } = require('../server/request-context');

test('SSE, PWA e caminhos bearer nunca expõem tokens em logs de aplicação', () => {
  const mesaToken = '11111111-1111-4111-8111-111111111111';
  const garcomToken = '22222222-2222-4222-8222-222222222222';
  const pwaToken = '33333333-3333-4333-8333-333333333333';
  const urls = [
    `/api/events?mesa=${mesaToken}`,
    `/api/events?garcom=${garcomToken}`,
    `/garcom-pwa/?token=${pwaToken}`,
    `/api/mesas/${mesaToken}/pedidos`,
    `/api/garcom/${garcomToken}/pedidos`,
  ];

  for (const url of urls) {
    const alvo = sanitizarAlvoRequisicao(url);
    const log = linhaDeLog('warn', {
      reqId: 'req-security-test',
      method: 'GET',
      alvo,
      status: 401,
      mensagem: sanitizarDetalheErro(new Error(`token rejeitado: ${mesaToken} ${garcomToken} ${pwaToken}`)),
    });
    for (const token of [mesaToken, garcomToken, pwaToken]) {
      assert.equal(alvo.includes(token), false, 'alvo não pode conter bearer');
      assert.equal(log.includes(token), false, 'linha de log não pode conter bearer');
    }
    assert.equal(alvo.includes('?'), false, 'query string não deve chegar ao log');
  }
});

test('sanitizador redige UUIDs em mensagem e stack de erro', () => {
  const token = '44444444-4444-4444-8444-444444444444';
  const detalhe = sanitizarDetalheErro(new Error(`falha em /api/garcom/${token}/pedidos`));
  assert.equal(detalhe.includes(token), false);
  assert.match(detalhe, /\[REDACTED\]/);
});
