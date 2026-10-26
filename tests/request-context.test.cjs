'use strict';

// Issue #43: correlation ID e logs estruturados. O módulo é puro e não toca
// rede/banco; o cabeamento no servidor é verificado por teste estrutural.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  gerarRequestId,
  normalizarRequestIdRecebido,
  requestIdDaRequisicao,
  linhaDeLog,
} = require('../server/request-context');

test('gera UUIDs únicos como request ID', () => {
  const a = gerarRequestId();
  const b = gerarRequestId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(a, b);
});

test('aceita só cabeçalhos de correlação em formato estrito', () => {
  assert.equal(normalizarRequestIdRecebido('01JABCDEFGHJKMNPQRSTVWXYZ0'), '01JABCDEFGHJKMNPQRSTVWXYZ0');
  assert.equal(normalizarRequestIdRecebido('  abc12345  '), 'abc12345');
  for (const invalido of ['', ' ', 'com espaços', 'x'.repeat(129), '../etc/passwd', 'a;b', null, 42]) {
    assert.equal(normalizarRequestIdRecebido(invalido), null, `deveria rejeitar: ${String(invalido)}`);
  }
});

test('preserva ID do edge quando bem formado e gera novo quando ausente/forjado', () => {
  const doEdge = requestIdDaRequisicao({ headers: { 'x-railway-request-id': 'edge-1234abcd' } });
  assert.equal(doEdge, 'edge-1234abcd');
  const generico = requestIdDaRequisicao({ headers: { 'x-request-id': 'generic-987654' } });
  assert.equal(generico, 'generic-987654');
  const forjado = requestIdDaRequisicao({ headers: { 'x-request-id': 'id com espaço' } });
  assert.match(forjado, /^[0-9a-f]{8}-/);
  const semCabecalho = requestIdDaRequisicao({ headers: {} });
  assert.match(semCabecalho, /^[0-9a-f]{8}-/);
});

test('linha de log é JSON único, estruturada e sem dados sem limite', () => {
  const linha = linhaDeLog('warn', {
    reqId: 'req-1',
    method: 'POST',
    alvo: '/api/mesas/[REDACTED]/pedidos',
    status: 429,
    mensagem: 'Muitos pedidos em pouco tempo.',
  });
  const parsed = JSON.parse(linha);
  assert.equal(parsed.level, 'warn');
  assert.equal(parsed.reqId, 'req-1');
  assert.equal(parsed.method, 'POST');
  assert.equal(parsed.alvo, '/api/mesas/[REDACTED]/pedidos');
  assert.equal(parsed.status, 429);
  assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T/);
  // não há segunda linha que quebre o coletor de logs
  assert.equal(linha.includes('\n'), false);
});

test('linha de log tolera campos ausentes e corta mensagens longas', () => {
  const linha = JSON.parse(linhaDeLog('error', { mensagem: 'x'.repeat(900) }));
  assert.equal(linha.reqId, null);
  assert.equal(linha.status, null);
  assert.equal(linha.mensagem.length, 500);
});

test('servidor emite X-Request-Id e usa log estruturado com o ID da requisição', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /requestIdDaRequisicao\(req\)/);
  assert.match(server, /res\.setHeader\('X-Request-Id', reqId\)/);
  assert.match(server, /linhaDeLog\('warn'/);
  assert.match(server, /linhaDeLog\('error'/);
  // o alvo do log continua passando pelo sanitizador de tokens
  assert.match(server, /alvo: sanitizarAlvoRequisicao\(req\.url\)/);
});
