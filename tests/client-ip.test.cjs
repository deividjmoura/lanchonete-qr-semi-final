'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeIp,
  resolveClientIp,
  loginRateLimitKey,
  orderRateLimitKey,
} = require('../security/client-ip');

function request(remoteAddress, xff) {
  return {
    socket: { remoteAddress },
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
  };
}

test('ignores client-supplied XFF when trusted proxy hops are not configured', () => {
  assert.equal(resolveClientIp(request('10.0.0.8', '203.0.113.66')), '10.0.0.8');
});

test('uses the only forwarded address when exactly one trusted proxy is configured', () => {
  assert.equal(resolveClientIp(request('10.0.0.8', '198.51.100.7'), { trustedProxyHops: 1 }), '198.51.100.7');
});

test('does not trust a forged leftmost XFF value when trusted proxy appends observed client IP', () => {
  assert.equal(
    resolveClientIp(request('10.0.0.8', '203.0.113.66, 198.51.100.7'), { trustedProxyHops: 1 }),
    '198.51.100.7'
  );
});

test('selects the client address before two trusted appended proxy hops', () => {
  assert.equal(
    resolveClientIp(request('10.0.0.8', '198.51.100.7, 10.0.0.7'), { trustedProxyHops: 2 }),
    '198.51.100.7'
  );
});

test('falls back to socket peer when XFF is absent, malformed, or shorter than configured chain', () => {
  assert.equal(resolveClientIp(request('10.0.0.8'), { trustedProxyHops: 1 }), '10.0.0.8');
  assert.equal(resolveClientIp(request('10.0.0.8', 'attacker-value'), { trustedProxyHops: 1 }), '10.0.0.8');
  assert.equal(resolveClientIp(request('10.0.0.8', '198.51.100.7'), { trustedProxyHops: 2 }), '10.0.0.8');
  assert.equal(resolveClientIp(request('10.0.0.8', '198.51.100.7, not-an-ip'), { trustedProxyHops: 1 }), '10.0.0.8');
});

test('normalizes IPv4-mapped IPv6 and accepts valid IPv6 addresses', () => {
  assert.equal(normalizeIp('::ffff:192.0.2.4'), '192.0.2.4');
  assert.equal(normalizeIp('2001:DB8::1'), '2001:db8::1');
  assert.equal(resolveClientIp(request('::ffff:192.0.2.4')), '192.0.2.4');
});

test('login limits share a key for one IP; order limits scope by IP and mesa token', () => {
  assert.equal(loginRateLimitKey('198.51.100.7'), loginRateLimitKey('198.51.100.7'));
  assert.equal(orderRateLimitKey('198.51.100.7', 'mesa-a'), orderRateLimitKey('198.51.100.7', 'mesa-a'));
  assert.notEqual(orderRateLimitKey('198.51.100.7', 'mesa-a'), orderRateLimitKey('198.51.100.7', 'mesa-b'));
  assert.notEqual(orderRateLimitKey('198.51.100.7', 'mesa-a'), orderRateLimitKey('198.51.100.8', 'mesa-a'));
});

test('invalid client IP never becomes an attacker-controlled rate-limit identity', () => {
  assert.equal(loginRateLimitKey('not-an-ip'), 'login:unknown');
  assert.equal(orderRateLimitKey('not-an-ip', 'mesa-a'), 'pedido:unknown:mesa-a');
});

const { spawnSync } = require('node:child_process');
const { golpePermitido } = require('../db/rateLimit');

test('rate limit atual compartilha a chave IP/mesa dentro do mesmo processo', () => {
  const suffix = `issue50-${process.pid}-${Date.now()}`;
  const mesaA = orderRateLimitKey('198.51.100.7', `mesa-a-${suffix}`);
  const mesaB = orderRateLimitKey('198.51.100.7', `mesa-b-${suffix}`);
  assert.equal(golpePermitido(mesaA, { janelaMs: 60_000, max: 1 }), true);
  assert.equal(golpePermitido(mesaA, { janelaMs: 60_000, max: 1 }), false);
  assert.equal(golpePermitido(mesaB, { janelaMs: 60_000, max: 1 }), true);
});

test('rate limit atual é independente entre processos e recomeça após reinício', () => {
  const key = `issue50-restart-${Date.now()}`;
  const script = `const {golpePermitido}=require('./db/rateLimit'); process.stdout.write(String(golpePermitido(process.argv[1], {janelaMs:60000,max:1})));`;
  const run = () => spawnSync(process.execPath, ['-e', script, key], { cwd: process.cwd(), encoding: 'utf8', timeout: 5_000 });
  const first = run();
  const secondProcess = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(secondProcess.status, 0, secondProcess.stderr);
  assert.equal(first.stdout, 'true');
  assert.equal(secondProcess.stdout, 'true');
});

test('server de produção usa resolver seguro e configuração explícita de hops confiáveis', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /require\(['"]\.\/security\/client-ip['"]\)/);
  assert.match(server, /resolveClientIp\(req, \{ trustedProxyHops \}\)/);
  assert.doesNotMatch(server, /xff\.split\(['"],['"]\)\[0\]/);
});
