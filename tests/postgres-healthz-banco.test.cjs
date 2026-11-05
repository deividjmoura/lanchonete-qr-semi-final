'use strict';

// Issue #43 — comportamento real do /healthz com banco saudável e banco fora.
//
// A decisão anterior proibia qualquer acesso ao banco no health check, o que
// fazia um banco fora do ar passar no monitoring. O teste estático garante a
// forma; este garante o COMPORTAMENTO, que é o que fecha a lacuna.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const PORTA = 4611 + (process.pid % 200);

function subirServidor(env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['server.js'], {
      cwd: root,
      env: { ...process.env, ...env, PORT: String(PORTA), NODE_ENV: 'test', DISABLE_CRON: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let saiu = '';
    const limite = setTimeout(() => reject(new Error('servidor não subiu: ' + saiu)), 30_000);
    const aoSair = () => {
      clearTimeout(limite);
      reject(new Error('servidor encerrou antes de responder: ' + saiu));
    };
    proc.stdout.on('data', (b) => {
      saiu += b;
      if (/listen|http|rodando|porta|ouvindo/i.test(saiu)) {
        clearTimeout(limite);
        resolve(proc);
      }
    });
    proc.stderr.on('data', (b) => {
      saiu += b;
      // alguns servidores logam em stderr
      if (/listen|rodando|porta|ouvindo/i.test(saiu)) {
        clearTimeout(limite);
        resolve(proc);
      }
    });
    proc.on('exit', aoSair);
  });
}

async function esperarHttp(tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA}/healthz`);
      return r;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error('o servidor não respondeu em /healthz');
}

test('com banco saudável, /healthz responde 200 e confirma o banco', async (t) => {
  const proc = await subirServidor({});
  t.after(() => proc.kill('SIGKILL'));

  const resp = await esperarHttp();
  assert.equal(resp.status, 200);
  const corpo = await resp.json();
  assert.equal(corpo.status, 'ok');
  assert.equal(corpo.db, 'ok');
});

test('com banco indisponível, /healthz responde 503 (não finge que está ok)', async (t) => {
  // Porta fechada: a sondagem precisa falhar rápido, não pendurar a requisição.
  const proc = await subirServidor({
    DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:59999/inexistente',
    HEALTH_DB_TIMEOUT_MS: '1000',
  });
  t.after(() => proc.kill('SIGKILL'));

  const inicio = Date.now();
  const resp = await esperarHttp();
  const duracao = Date.now() - inicio;

  assert.equal(resp.status, 503, 'banco fora do ar precisa reprovar o health check');
  const corpo = await resp.json();
  assert.equal(corpo.status, 'degraded');
  assert.equal(corpo.db, 'unavailable');

  // Não pode vazar detalhe interno (host, usuário, driver) na resposta.
  const texto = JSON.stringify(corpo);
  assert.doesNotMatch(texto, /59999|postgres:\/\/|ECONNREFUSED|password/i);

  assert.ok(duracao < 25_000, 'a falha precisa ser informada rápido, não por timeout externo');
});
