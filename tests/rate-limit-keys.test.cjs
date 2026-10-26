'use strict';

// Issue #50: chaves de rate limit do login. O limite combina IP e CONTA,
// sem confiar em X-Forwarded-For e sem transformar o NAT compartilhado da
// lanchonete em uma trava global da equipe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  loginRateLimitKey,
  loginUserRateLimitKey,
  orderRateLimitKey,
} = require('../security/client-ip');
const { golpePermitido } = require('../db/rateLimit');

test('chave de login por IP é estável e normaliza IP inválido', () => {
  assert.equal(loginRateLimitKey('198.51.100.7'), 'login:198.51.100.7');
  assert.equal(loginRateLimitKey('198.51.100.7'), loginRateLimitKey('198.51.100.7'));
  assert.equal(loginRateLimitKey('not-an-ip'), 'login:unknown');
  assert.equal(loginRateLimitKey(undefined), 'login:unknown');
});

test('chave por conta normaliza o login sem aceitar caracteres largos', () => {
  assert.equal(loginUserRateLimitKey('Caixa'), 'login-user:caixa');
  assert.equal(loginUserRateLimitKey('  admin '), 'login-user:admin');
  assert.equal(loginUserRateLimitKey('cozinha_01'), 'login-user:cozinha_01');
  // caracteres fora do conjunto permitido são removidos, nunca usados como chave
  assert.equal(loginUserRateLimitKey('ad/min?'), 'login-user:admin');
  assert.equal(loginUserRateLimitKey(''), 'login-user:desconhecido');
  assert.equal(loginUserRateLimitKey(null), 'login-user:desconhecido');
  // limitação de tamanho protege o mapa em memória
  const longo = loginUserRateLimitKey('a'.repeat(200));
  assert.ok(longo.length <= 'login-user:'.length + 64);
});

test('chave por conta independe do IP e a chave por IP independe da conta', () => {
  const ipA = loginRateLimitKey('198.51.100.7');
  const ipB = loginRateLimitKey('198.51.100.8');
  const userA = loginUserRateLimitKey('caixa');
  const userB = loginUserRateLimitKey('admin');
  assert.notEqual(ipA, userA);
  assert.notEqual(userA, userB);
  // dois clientes no mesmo IP têm chaves de conta distintas
  assert.notEqual(userA, userB);
  assert.equal(ipA, loginRateLimitKey('198.51.100.7'));
  // a mesma conta em IPs distintos conserva a chave de conta
  assert.equal(loginUserRateLimitKey('admin'), loginUserRateLimitKey('ADMIN'));
  assert.notEqual(ipA, ipB);
});

test('limite por IP e por conta são independentes: estourar um não marca o outro', () => {
  const ip = '203.0.113.10';
  const ipKey = loginRateLimitKey(ip);
  const userKey = loginUserRateLimitKey('cozinha');
  for (let i = 0; i < 8; i += 1) {
    assert.equal(golpePermitido(ipKey, { janelaMs: 60_000, max: 8 }), true);
  }
  // o IP estourou, mas a conta ainda tem o próprio orçamento
  assert.equal(golpePermitido(ipKey, { janelaMs: 60_000, max: 8 }), false);
  for (let i = 0; i < 10; i += 1) {
    assert.equal(golpePermitido(userKey, { janelaMs: 60_000, max: 10 }), true);
  }
  assert.equal(golpePermitido(userKey, { janelaMs: 60_000, max: 10 }), false);
});

test('pedidos continuam com chave composta por IP e token de mesa opaco', () => {
  const key = orderRateLimitKey('198.51.100.7', 'mesa-1');
  assert.equal(key, orderRateLimitKey('198.51.100.7', 'mesa-1'));
  assert.notEqual(key, orderRateLimitKey('198.51.100.7', 'mesa-2'));
  assert.notEqual(key, orderRateLimitKey('198.51.100.8', 'mesa-1'));
});

test('limites são por processo: um processo novo volta a aceitar a primeira tentativa', () => {
  // Documenta o limite real da implementação em memória (issue #50): não há
  // estado global entre instâncias nem persistência após reinício.
  const script =
    "const {golpePermitido}=require('./db/rateLimit');" +
    "process.stdout.write(String(golpePermitido(process.argv[2],{janelaMs:60000,max:1})));";
  const key = `login-user:processo-${process.pid}`;
  const primeira = execFileSync(process.execPath, ['-e', script, key], { cwd: path.join(__dirname, '..') });
  const segunda = execFileSync(process.execPath, ['-e', script, key], { cwd: path.join(__dirname, '..') });
  assert.equal(primeira.toString(), 'true');
  assert.equal(segunda.toString(), 'true', 'novo processo não herda buckets do anterior');
});

test('rota de login aplica tanto o limite por IP quanto o limite por conta', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const bloco = server.slice(server.indexOf("p === '/api/login'"), server.indexOf("p === '/api/logout'"));
  assert.match(bloco, /golpePermitido\(`login:\$\{ip\}`/);
  assert.match(bloco, /loginUserRateLimitKey\(loginInformado\)/);
  // o limite por conta roda depois da leitura do corpo, que é onde o login existe
  assert.ok(
    bloco.indexOf('await body(req)') < bloco.indexOf('loginUserRateLimitKey'),
    'o corpo da requisição precisa ser lido antes de montar a chave por conta'
  );
});
