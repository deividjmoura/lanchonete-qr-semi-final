'use strict';

// Issue #55 — integração real com PostgreSQL descartável. Usa só usuários sintéticos criados aqui.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Mesma trava dos demais testes de integração: nunca roda fora do banco descartável de CI.
assert.equal(new URL(process.env.DATABASE_URL || 'postgres://x/none').pathname, '/qradmin_test',
  'Integração bloqueada: database deve ser qradmin_test');

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
  // A obrigação fica persistida; a última conta remanescente não pode escapar
  // só porque o hash deixou de aparecer em mais de uma conta ativa.
  assert.equal((await auth.autenticar(ids[1].login, 'senha-igual-para-todos-1')).deveTrocarSenha, true);
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


test('PostgreSQL real: trocas concorrentes em contas diferentes não podem reutilizar a mesma senha nova', async () => {
  const a = await criarStaff('reuse-conc-a', 'senha-inicial-conta-a-77');
  const b = await criarStaff('reuse-conc-b', 'senha-inicial-conta-b-88');
  const senhaCompartilhadaNova = 'Nova-Senha-Unica-Concor#2026';

  const resultados = await Promise.allSettled([
    auth.trocarSenha(a.id, 'senha-inicial-conta-a-77', senhaCompartilhadaNova),
    auth.trocarSenha(b.id, 'senha-inicial-conta-b-88', senhaCompartilhadaNova),
  ]);

  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.filter((r) => r.status === 'rejected').length, 1);
  const rejeitado = resultados.find((r) => r.status === 'rejected');
  assert.match(String(rejeitado.reason?.message), /outra conta/);
});

// ── Redefinição pelo admin (senha esquecida, sem exigir a senha antiga) ──────

test('PostgreSQL real: admin redefine senha de outro setor sem a antiga, revoga sessões e audita o ator', async () => {
  const admin = await criarStaff('reset-admin', 'senha-admin-ficticia-1', { papel: 'admin' });
  const alvo = await criarStaff('reset-alvo', 'senha-esquecida-ficticia-1', { papel: 'cozinha', deveTrocar: true });
  const s1 = await auth.criarSessao(alvo.id);
  const s2 = await auth.criarSessao(alvo.id);
  const sAdmin = await auth.criarSessao(admin.id);

  const r = await auth.redefinirSenhaStaff(admin.id, alvo.login, 'Nova-Senha-Cozinha#2026', sAdmin);
  assert.equal(r.propriaConta, false);
  assert.equal(r.token, null);
  assert.equal(r.sessoesRevogadas, 2);
  assert.equal(r.login, alvo.login);
  assert.equal(r.papel, 'cozinha');

  // A senha antiga (esquecida) deixa de valer; a nova entra sem troca obrigatória.
  await assert.rejects(() => auth.autenticar(alvo.login, 'senha-esquecida-ficticia-1'), /incorretos/);
  const staff = await auth.autenticar(alvo.login, 'Nova-Senha-Cozinha#2026');
  assert.equal(staff.deveTrocarSenha, false);

  const vivas = await pool.query('SELECT token FROM staff_sessoes WHERE staff_id = $1', [alvo.id]);
  assert.equal(vivas.rowCount, 0, 'todas as sessões do alvo foram revogadas');
  assert.equal((await pool.query('SELECT 1 FROM staff_sessoes WHERE token = $1', [sAdmin])).rowCount, 1, 'sessão do admin permanece');

  const ev = (await pool.query(
    "SELECT * FROM staff_credencial_eventos WHERE staff_id = $1 AND evento = 'senha_redefinida'",
    [alvo.id]
  )).rows;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].ator_staff_id, admin.id);
  assert.equal(ev[0].ator_login, admin.login);
  assert.equal(ev[0].sessoes_revogadas, 2);
  const dump = JSON.stringify(ev);
  for (const segredo of ['senha-esquecida-ficticia', 'Nova-Senha-Cozinha', s1, s2, sAdmin]) {
    assert.ok(!dump.includes(segredo), 'auditoria não pode conter segredos');
  }
});

test('PostgreSQL real: admin redefine a própria senha sem a antiga e recebe sessão nova na mesma transação', async () => {
  const admin = await criarStaff('reset-self', 'senha-admin-propria-ficticia-1', { papel: 'admin', deveTrocar: true });
  const s1 = await auth.criarSessao(admin.id);
  const s2 = await auth.criarSessao(admin.id);

  const r = await auth.redefinirSenhaStaff(admin.id, admin.login, 'Nova-Senha-Admin#2026', s1);
  assert.equal(r.propriaConta, true);
  assert.ok(r.token && r.token !== s1 && r.token !== s2);
  assert.equal(r.csrfToken, auth.csrfTokenParaSessao(r.token));
  assert.equal(r.sessoesRevogadas, 2);

  const vivas = (await pool.query('SELECT token FROM staff_sessoes WHERE staff_id = $1', [admin.id])).rows.map((x) => x.token);
  assert.deepEqual(vivas, [r.token], 'só a sessão de substituição sobrevive');
  const liberado = await auth.exigirAcesso(reqComSessao(r.token), 'admin');
  assert.equal(liberado.deveTrocarSenha, false);
  await assert.rejects(() => auth.exigirAcesso(reqComSessao(s1), 'admin'), (e) => e.status === 401);
  await assert.rejects(() => auth.autenticar(admin.login, 'senha-admin-propria-ficticia-1'), /incorretos/);
  await assert.doesNotReject(() => auth.autenticar(admin.login, 'Nova-Senha-Admin#2026'));
});

test('PostgreSQL real: não-admin, admin inativo e alvo inativo são recusados na redefinição', async () => {
  const admin = await criarStaff('reset-guard-admin', 'senha-guard-admin-ficticia-1', { papel: 'admin' });
  const caixa = await criarStaff('reset-guard-caixa', 'senha-guard-caixa-ficticia-1', { papel: 'caixa' });
  const alvo = await criarStaff('reset-guard-alvo', 'senha-guard-alvo-ficticia-1', { papel: 'bar' });

  await assert.rejects(
    () => auth.redefinirSenhaStaff(caixa.id, alvo.login, 'Nova-Senha-Guard#2026'),
    (e) => e.status === 403
  );
  await assert.rejects(
    () => auth.redefinirSenhaStaff(caixa.id, caixa.login, 'Nova-Senha-Guard#2026'),
    (e) => e.status === 403,
    'não-admin também não pode usar a rota de recuperação para a própria conta'
  );

  await pool.query('UPDATE staff SET ativo = FALSE WHERE id = $1', [admin.id]);
  await assert.rejects(
    () => auth.redefinirSenhaStaff(admin.id, alvo.login, 'Nova-Senha-Guard#2026'),
    (e) => e.status === 401
  );
  await pool.query('UPDATE staff SET ativo = TRUE WHERE id = $1', [admin.id]);

  await pool.query('UPDATE staff SET ativo = FALSE WHERE id = $1', [alvo.id]);
  await assert.rejects(
    () => auth.redefinirSenhaStaff(admin.id, alvo.login, 'Nova-Senha-Guard#2026'),
    (e) => e.status === 404
  );
  await pool.query('UPDATE staff SET ativo = TRUE WHERE id = $1', [alvo.id]);

  // Nada foi alterado nas tentativas recusadas.
  await assert.doesNotReject(() => auth.autenticar(alvo.login, 'senha-guard-alvo-ficticia-1'));
  assert.equal(await contagemEventos(alvo.id, 'senha_redefinida'), 0);
});

test('PostgreSQL real: redefinição recusa política fraca, repetir a atual e senha de outra conta, auditando o ator', async () => {
  const admin = await criarStaff('reset-pol-admin', 'senha-pol-admin-ficticia-1', { papel: 'admin' });
  const a = await criarStaff('reset-pol-a', 'senha-pol-conta-a-ficticia-1', { papel: 'cozinha' });
  await criarStaff('reset-pol-b', 'senha-pol-conta-b-ficticia-2', { papel: 'bar' });

  await assert.rejects(() => auth.redefinirSenhaStaff(admin.id, a.login, 'curta'), /pelo menos 12/);
  await assert.rejects(() => auth.redefinirSenhaStaff(admin.id, a.login, 'senha-pol-conta-a-ficticia-1'), /diferente da senha atual/);
  await assert.rejects(() => auth.redefinirSenhaStaff(admin.id, a.login, 'senha-pol-conta-b-ficticia-2'), /outra conta/);
  assert.equal(await contagemEventos(a.id, 'senha_redefinicao_rejeitada'), 3);
  assert.equal(await contagemEventos(a.id, 'senha_redefinida'), 0);
  await assert.doesNotReject(() => auth.autenticar(a.login, 'senha-pol-conta-a-ficticia-1'));

  const ev = (await pool.query(
    "SELECT ator_staff_id, ator_login FROM staff_credencial_eventos WHERE staff_id = $1 AND evento = 'senha_redefinicao_rejeitada'",
    [a.id]
  )).rows;
  assert.ok(ev.every((e) => e.ator_staff_id === admin.id && e.ator_login === admin.login));
});

test('PostgreSQL real: redefinir senha compartilhada mantém as outras contas obrigadas a trocar', async () => {
  const admin = await criarStaff('reset-comp-admin', 'senha-comp-admin-ficticia-1', { papel: 'admin' });
  const hash = await auth.hashSenha('senha-compartilhada-reset-1');
  const ids = [];
  for (const suf of ['reset-comp-a', 'reset-comp-b']) {
    const { rows } = await pool.query(
      `INSERT INTO staff (nome, login, senha_hash, papel) VALUES ($1, $2, $3, 'caixa') RETURNING id, login`,
      [`Teste ${suf}`, `${run}-${suf}`, hash]
    );
    created.push(rows[0].id);
    ids.push(rows[0]);
  }
  await auth.redefinirSenhaStaff(admin.id, ids[0].login, 'Exclusiva-Reset-Comp-A#1');
  assert.equal((await auth.autenticar(ids[0].login, 'Exclusiva-Reset-Comp-A#1')).deveTrocarSenha, false);
  assert.equal((await auth.autenticar(ids[1].login, 'senha-compartilhada-reset-1')).deveTrocarSenha, true);
});

test('PostgreSQL real: redefinições concorrentes não podem reutilizar a mesma senha nova', async () => {
  const admin = await criarStaff('reset-conc-admin', 'senha-conc-admin-ficticia-1', { papel: 'admin' });
  const a = await criarStaff('reset-conc-a', 'senha-conc-conta-a-ficticia-1', { papel: 'cozinha' });
  const b = await criarStaff('reset-conc-b', 'senha-conc-conta-b-ficticia-2', { papel: 'bar' });
  const nova = 'Nova-Senha-Unica-Reset#2026';

  const resultados = await Promise.allSettled([
    auth.redefinirSenhaStaff(admin.id, a.login, nova),
    auth.redefinirSenhaStaff(admin.id, b.login, nova),
  ]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.filter((r) => r.status === 'rejected').length, 1);
  assert.match(String(resultados.find((r) => r.status === 'rejected').reason?.message), /outra conta/);
});

test('PostgreSQL real: sessão do admin revogada enquanto esperava o lock não autoriza a redefinição', async () => {
  const admin = await criarStaff('reset-rev-admin', 'senha-rev-admin-ficticia-1', { papel: 'admin' });
  const alvo = await criarStaff('reset-rev-alvo', 'senha-rev-alvo-ficticia-1', { papel: 'cozinha' });
  const tokenMorto = await auth.criarSessao(admin.id);
  await pool.query('DELETE FROM staff_sessoes WHERE token = $1', [tokenMorto]);

  await assert.rejects(
    () => auth.redefinirSenhaStaff(admin.id, alvo.login, 'Nova-Senha-Rev#2026', tokenMorto),
    (e) => e.status === 401
  );
  assert.equal(await contagemEventos(alvo.id, 'senha_redefinida'), 0);
  await assert.doesNotReject(() => auth.autenticar(alvo.login, 'senha-rev-alvo-ficticia-1'));
});

test('PostgreSQL real: listarContasStaff devolve apenas contas ativas e nunca expõe hash', async () => {
  const admin = await criarStaff('reset-list-admin', 'senha-list-admin-ficticia-1', { papel: 'admin' });
  const ativo = await criarStaff('reset-list-ativo', 'senha-list-ativo-ficticia-1', { papel: 'bar' });
  const inativo = await criarStaff('reset-list-inativo', 'senha-list-inativo-ficticia-1', { papel: 'caixa' });
  await pool.query('UPDATE staff SET ativo = FALSE WHERE id = $1', [inativo.id]);

  const contas = await auth.listarContasStaff();
  const logins = contas.map((c) => c.login);
  assert.ok(logins.includes(admin.login));
  assert.ok(logins.includes(ativo.login));
  assert.ok(!logins.includes(inativo.login));
  const dump = JSON.stringify(contas);
  assert.ok(!dump.includes('senha_hash'));
  assert.ok(!dump.includes('senha-list-ativo-ficticia'));
  for (const c of contas) {
    assert.deepEqual(Object.keys(c).sort(), ['deveTrocarSenha', 'id', 'login', 'nome', 'papel']);
  }
});
