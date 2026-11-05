'use strict';

/**
 * Issue #43 — testes do notificador de alerta.
 *
 * Cobrem o que pode vazar credencial ou silenciar um alerta:
 *   - redação de token do Telegram, webhook, credenciais de banco e segredos longos;
 *   - escolha e prioridade dos canais;
 *   - falha de entrega NÃO propaga (senão mascara a falha original);
 *   - ausência de canal configurado não quebra o job.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { montarMensagem, redigir, notificar } = require('../scripts/notificar-alerta');

function limparEnv() {
  for (const k of [
    'ALERTA_TELEGRAM_TOKEN', 'ALERTA_TELEGRAM_CHAT_ID', 'ALERTA_WEBHOOK_URL',
    'GITHUB_SERVER_URL', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID',
  ]) {
    delete process.env[k];
  }
}

test('redige token de bot do Telegram', () => {
  const texto = 'falha ao chamar https://api.telegram.org/bot123456789:AAHfakeTokenValueWithEnoughLength/sendMessage';
  const saida = redigir(texto);
  assert.doesNotMatch(saida, /AAHfakeTokenValueWithEnoughLength/);
  assert.match(saida, /bot<TOKEN>/);
});

test('redige URL de webhook de Slack e Discord', () => {
  assert.match(redigir('https://hooks.slack.com/services/T00/B00/segredo'), /<WEBHOOK>/);
  assert.match(redigir('https://discord.com/api/webhooks/123/abc'), /<WEBHOOK>/);
});

test('redige credenciais de connection string de banco', () => {
  const saida = redigir('postgres://usuario:senhaSecreta@host:5432/db');
  assert.doesNotMatch(saida, /senhaSecreta/);
  assert.match(saida, /<CREDENCIAIS>/);
});

test('redige segredo longo isolado', () => {
  const segredo = 'a'.repeat(40);
  assert.doesNotMatch(redigir(`token=${segredo}`), new RegExp(segredo));
});

test('mensagem inclui serviço, motivo e link da execução', () => {
  const msg = montarMensagem({
    url: 'https://exemplo.test/healthz',
    motivo: 'HTTP 503',
    execucao: 'https://github.com/o/r/actions/runs/1',
  });
  assert.match(msg, /FALHOU/);
  assert.match(msg, /https:\/\/exemplo\.test\/healthz/);
  assert.match(msg, /HTTP 503/);
  assert.match(msg, /actions\/runs\/1/);
  assert.match(msg, /somente leitura/);
});

test('mensagem não expõe credencial presente na URL', () => {
  const msg = montarMensagem({
    url: 'postgres://user:senhaTop@host/db',
    motivo: 'timeout',
  });
  assert.doesNotMatch(msg, /senhaTop/);
});

test('sem canal configurado, notificar devolve canal nulo e não lança', async () => {
  limparEnv();
  const r = await notificar({ url: 'https://x.test/healthz', motivo: 'x' });
  assert.equal(r.canal, null);
  assert.match(r.texto, /FALHOU/);
});

test('webhook é o canal usado quando só ele está configurado', async () => {
  limparEnv();
  const chamadas = [];
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    chamadas.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, status: 200 };
  };
  try {
    process.env.ALERTA_WEBHOOK_URL = 'https://hooks.example.test/abc';
    const r = await notificar({ url: 'https://x.test/healthz', motivo: 'HTTP 500' });
    assert.equal(r.canal, 'webhook');
    assert.equal(chamadas.length, 1);
    assert.match(chamadas[0].body.text, /HTTP 500/);
  } finally {
    global.fetch = original;
    limparEnv();
  }
});

test('Telegram tem prioridade sobre webhook quando ambos estão configurados', async () => {
  limparEnv();
  const chamadas = [];
  const original = global.fetch;
  global.fetch = async (url) => {
    chamadas.push(String(url));
    return { ok: true, status: 200 };
  };
  try {
    process.env.ALERTA_TELEGRAM_TOKEN = '123:abc';
    process.env.ALERTA_TELEGRAM_CHAT_ID = '999';
    process.env.ALERTA_WEBHOOK_URL = 'https://hooks.example.test/abc';
    const r = await notificar({ url: 'https://x.test/healthz', motivo: 'x' });
    assert.equal(r.canal, 'telegram');
    assert.match(chamadas[0], /api\.telegram\.org/);
  } finally {
    global.fetch = original;
    limparEnv();
  }
});

test('falha de entrega não propaga erro (não mascara a falha original)', async () => {
  limparEnv();
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500 });
  try {
    process.env.ALERTA_WEBHOOK_URL = 'https://hooks.example.test/abc';
    const r = await notificar({ url: 'https://x.test/healthz', motivo: 'x' });
    assert.equal(r.canal, null);
  } finally {
    global.fetch = original;
    limparEnv();
  }
});
