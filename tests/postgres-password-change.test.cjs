'use strict';

// Issue #55 — integração real com PostgreSQL descartável. Usa só usuários sintéticos criados aqui.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.STAFF_FORCE_PASSWORD_CHANGE = 'true';

const pool = require('../db/pool');
const auth = require('../db/auth');

const run = `pw${process.pid}${crypto.randomBytes(3).toString('hex')}`;
const SENHA_INICIAL = 'inicial-compartilhada-ficticia-1';
const created = [];

async function criarStaff(sufixo, senha, { papel = 'caixa', deveTrocar = false } = {}) {
  const login = `${run}-${sufixo}`;
  const { rows } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, deve_trocar_senha)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, login`,
    [`Teste ${sufixo}`, login, await auth.hashSenha(senha), papel, deveTrocar]
  );
  created.push(rows[0].id);
  return rows[0];
}

function reqComSessao(token, { metodo = 'POST' } = {}) {
  return {
    method: metodo,
    headers: {
      cookie: `${auth.SESSION_COOKIE}=${token}`,
      'x-csrf-token': auth.csrfTokenParaSessao(token),
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
    socket: {},
  };
}

const contagemEventos = async (staffId, evento) =>
  Number((await pool.query('SELECT count(*) AS n FROM staff_credencial_eventos WHERE staff_id = $1 AND evento = $2', [staffId, evento])).rows[0].n);

test.after(async () => {
  await pool.query('DELETE FROM staff_credencial_eventos WHERE login LIKE $1', [`${run}-%`]);
  if (created.length) await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [created]);
  await pool.end();
});

test('PostgreSQL real: senha atual errada é recusada, auditada e não altera nada', async () => {
  const u = await criarStaff('errada', 'senha-atual-ficticia-77');
  const antes = (await pool.query('SELECT senha_hash FROM staff WHERE id = $1', [u.id])).rows[0].senha_hash;
  const s = await auth.criarSessao(u.id);

  await assert.rejects(() => auth.trocarSenha(u.id, 'nao-e-a-senha-atual', 'Nova-Senha-Forte#2026'), /Senha atual incorreta/);

  assert.equal((await pool.query('SELECT senha_hash FROM staff WHERE id = $1', [u.id])).rows[0].senha_hash, antes);
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE token = $1', [s])).rowCount, 1, 'sessão preservada');
  assert.equal(await contagemEventos(u.id, 'senha_troca_falhou'), 1);
  assert.equal(await contagemEventos(u.id, 'senha_alterada'), 0);
});

test('PostgreSQL real: política, repetir a atual e senha de outra conta são recusadas', async () => {
  const a = await criarStaff('pol-a', 'senha-conta-a-ficticia-1');
  await criarStaff('pol-b', 'senha-conta-b-ficticia-2');

  await assert.rejects(() => auth.trocarSenha(a.id, 'senha-conta-a-ficticia-1', 'curta'), /pelo menos 12/);
  await assert.rejects(() => auth.trocarSenha(a.id, 'senha-conta-a-ficticia-1', 'senha-conta-a-ficticia-1'), /diferente da atual/);
  await assert.rejects(() => auth.trocarSenha(a.id, 'senha-conta-a-ficticia-1', 'senha-conta-b-ficticia-2'), /outra conta/);
  assert.equal(await contagemEventos(a.id, 'senha_troca_rejeitada'), 3);
  // a senha original continua valendo
  await assert.doesNotReject(() => auth.autenticar(a.login, 'senha-conta-a-ficticia-1'));
});

test('PostgreSQL real: troca bem-sucedida revoga TODAS as sessões, emite sessão nova e audita sem segredos', async () => {
  const u = await criarStaff('ok', 'senha-conta-ok-ficticia-1');
  const outra = await criarStaff('ok-outra', 'senha-conta-ok-ficticia-2');
  const s1 = await auth.criarSessao(u.id);
  const s2 = await auth.criarSessao(u.id);
  const sOutra = await auth.criarSessao(outra.id);

  const r = await auth.trocarSenha(u.id, 'senha-conta-ok-ficticia-1', 'Nova-Senha-Forte#2026');
  assert.equal(r.sessoesRevogadas, 2);
  assert.ok(r.token && r.token !== s1 && r.token !== s2);
  assert.equal(r.csrfToken, auth.csrfTokenParaSessao(r.token));

  const vivas = (await pool.query('SELECT token FROM staff_sessoes WHERE staff_id = $1', [u.id])).rows.map((x) => x.token);
  assert.deepEqual(vivas, [r.token], 'só a sessão nova sobrevive');
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE token = $1', [sOutra])).rowCount, 1, 'outras contas não são afetadas');

  await assert.rejects(() => auth.autenticar(u.login, 'senha-conta-ok-ficticia-1'), /incorretos/);
  await assert.doesNotReject(() => auth.autenticar(u.login, 'Nova-Senha-Forte#2026'));

  const ev = (await pool.query('SELECT * FROM staff_credencial_eventos WHERE staff_id = $1 AND evento = $2', [u.id, 'senha_alterada'])).rows;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].sessoes_revogadas, 2);
  const dump = JSON.stringify(ev) + JSON.stringify((await pool.query('SELECT * FROM staff_credencial_eventos WHERE login LIKE $1', [`${run}-%`])).rows);
  for (const segredo of ['senha-conta-ok-ficticia', 'Nova-Senha-Forte', r.token, r.csrfToken]) {
    assert.ok(!dump.includes(segredo), 'trilha de auditoria não pode conter segredos');
  }
  const row = (await pool.query('SELECT senha_alterada_em, deve_trocar_senha FROM staff WHERE id = $1', [u.id])).rows[0];
  assert.ok(row.senha_alterada_em);
  assert.equal(row.deve_trocar_senha, false);
});

test('PostgreSQL real: conta marcada fica bloqueada em exigirAcesso até trocar a senha', async () => {
  const u = await criarStaff('forcada', 'senha-temporaria-ficticia-1', { papel: 'admin', deveTrocar: true });
  const t0 = await auth.criarSessao(u.id);

  const staff = await auth.autenticar(u.login, 'senha-temporaria-ficticia-1');
  assert.equal(staff.deveTrocarSenha, true);

  await assert.rejects(
    () => auth.exigirAcesso(reqComSessao(t0), 'admin'),
    (e) => e.status === 403 && e.code === auth.CODIGO_TROCA_OBRIGATORIA
  );
  // a própria troca é permitida: exigirSessao não aplica o bloqueio
  const sessao = await auth.exigirSessao(reqComSessao(t0));
  assert.equal(sessao.id, u.id);

  const r = await auth.trocarSenha(u.id, 'senha-temporaria-ficticia-1', 'Definitiva-Forte#2026');
  const liberado = await auth.exigirAcesso(reqComSessao(r.token), 'admin');
  assert.equal(liberado.deveTrocarSenha, false);
  // sessão antiga (revogada) não vale mais
  await assert.rejects(() => auth.exigirAcesso(reqComSessao(t0), 'admin'), (e) => e.status === 401);
});

test('PostgreSQL real: senha compartilhada entre contas ativas força troca; ao trocar, só a conta trocada é liberada', async () => {
  const hash = await auth.hashSenha('senha-igual-para-todos-1');
  const ids = [];
  for (const suf of ['comp-a', 'comp-b']) {
    const { rows } = await pool.query(
      `INSERT INTO staff (nome, login, senha_hash, papel) VALUES ($1, $2, $3, 'bar') RETURNING id, login`,
      [`Teste ${suf}`, `${run}-${suf}`, hash]
    );
    created.push(rows[0].id);
    ids.push(rows[0]);
  }
  assert.equal((await auth.autenticar(ids[0].login, 'senha-igual-para-todos-1')).deveTrocarSenha, true);
  assert.equal((await auth.autenticar(ids[1].login, 'senha-igual-para-todos-1')).deveTrocarSenha, true);

  await auth.trocarSenha(ids[0].id, 'senha-igual-para-todos-1', 'Exclusiva-Da-Conta-A#1');
  assert.equal((await auth.autenticar(ids[0].login, 'Exclusiva-Da-Conta-A#1')).deveTrocarSenha, false);
  // a outra conta deixou de compartilhar hash com alguém, então a regra derivada também se desfaz
  assert.equal((await auth.autenticar(ids[1].login, 'senha-igual-para-todos-1')).deveTrocarSenha, false);
});

test('PostgreSQL real: trocas concorrentes na mesma conta são serializadas (uma vence, a outra falha na senha atual)', async () => {
  const u = await criarStaff('conc', 'senha-concorrente-ficticia-1');
  const resultados = await Promise.allSettled([
    auth.trocarSenha(u.id, 'senha-concorrente-ficticia-1', 'Concorrente-Forte-A#1'),
    auth.trocarSenha(u.id, 'senha-concorrente-ficticia-1', 'Concorrente-Forte-B#2'),
  ]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.filter((r) => r.status === 'rejected').length, 1);
  assert.equal(await contagemEventos(u.id, 'senha_alterada'), 1);
});
