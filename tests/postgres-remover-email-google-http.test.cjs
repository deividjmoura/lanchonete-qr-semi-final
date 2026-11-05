// Integração HTTP real da remoção do e-mail Google pré-cadastrado (#239).
//
// Cobre o caminho que os testes de unidade/DB não alcançam: a rota e a trilha
// de auditoria vistas de fora, com servidor de produção e PostgreSQL descartável.
//
//   DELETE /api/admin/contas/:id/email (admin)        → 200, email limpo, auditoria 'sucesso'
//   ... repetido (conta já sem e-mail)               → 409 + auditoria 'negado' (conta_sem_email)
//   ... conta já vinculada ao Google                 → 409 (conta_vinculada_google), nada muda
//   ... conta inativa                                → 409 (conta_inativa)
//   ... conta inexistente                            → 404 (conta_inexistente)
//   ... id inválido (:id = 0)                        → 400, sem evento
//   ... sem sessão / papel não-admin / CSRF errado / origem hostil
//                                                    → 401/403 no gate, sem evento e sem escrita
//   ... duas requisições simultâneas                  → exatamente um 200 e um 409
//
//   DATABASE_URL=postgres://.../qradmin_test NODE_ENV=test \
//     node --test tests/postgres-remover-email-google-http.test.cjs

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { subirServidor, exigirAmbienteDeTeste } = require('./helpers/public-table-server.cjs');

exigirAmbienteDeTeste();
const pool = require('../db/pool');
const auth = require('../db/auth');

const SUFIXO = crypto.randomBytes(4).toString('hex');
const criadas = [];
let servidor;

async function criarConta(sufixo, { papel = 'caixa', email = null, googleSub = null, ativo = true } = {}) {
  const login = `rm-${SUFIXO}-${sufixo}`;
  const { rows } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, ativo, deve_trocar_senha, email, google_sub)
     VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)
     RETURNING id, login, nome, papel`,
    [`Remoção ${sufixo}`, login, await auth.hashSenha(`senha-ficticia-${sufixo}-2026`), papel, ativo, email, googleSub]
  );
  criadas.push(rows[0].id);
  return rows[0];
}

async function sessao(staffId) {
  const token = await auth.criarSessao(staffId);
  return { token, cookie: `${auth.SESSION_COOKIE}=${token}`, csrf: auth.csrfTokenParaSessao(token) };
}

const origemLocal = () => servidor.base;

function remover(id, { sessao: s, csrf, origin = origemLocal(), reqId } = {}) {
  const headers = {};
  if (origin !== null) headers.origin = origin;
  if (s) headers.cookie = s.cookie;
  const enviarCsrf = csrf === undefined ? s && s.csrf : csrf;
  if (enviarCsrf !== undefined && enviarCsrf !== null) headers['x-csrf-token'] = enviarCsrf;
  if (reqId) headers['x-request-id'] = reqId;
  return servidor.request('DELETE', `/api/admin/contas/${id}/email`, { headers });
}

async function eventos(acao, alvoId) {
  const { rows } = await pool.query(
    `SELECT ator_id, ator_nome, acao, alvo_tipo, alvo_id, resultado, contexto, request_id
       FROM auditoria_eventos
      WHERE acao = $1 AND alvo_tipo = 'staff' AND alvo_id = $2
      ORDER BY id`,
    [acao, String(alvoId)]
  );
  return rows;
}

async function contaNoBanco(id) {
  const { rows } = await pool.query(
    'SELECT id, email, google_sub, ativo, senha_hash, papel FROM staff WHERE id = $1',
    [id]
  );
  return rows[0];
}

/** Verifica que nenhuma trilha guardou o endereço removido. */
async function trilhaSemEmail(id, emailAntigo) {
  const { rows } = await pool.query(
    `SELECT contexto::text AS contexto, ator_nome, alvo_id
       FROM auditoria_eventos WHERE alvo_tipo = 'staff' AND alvo_id = $1`,
    [String(id)]
  );
  const dump = JSON.stringify(rows);
  assert.ok(!dump.includes(emailAntigo), 'auditoria não pode conter o e-mail');
}

test.before(async () => {
  servidor = await subirServidor();
});

test.after(async () => {
  if (servidor) await servidor.encerrar();
  if (criadas.length) {
    const ids = criadas.map(String);
    await pool.query('DELETE FROM auditoria_eventos WHERE alvo_id = ANY($1::text[])', [ids]).catch(() => {});
    await pool.query('DELETE FROM auditoria_eventos WHERE ator_id = ANY($1::int[])', [criadas]).catch(() => {});
    await pool.query('DELETE FROM staff_sessoes WHERE staff_id = ANY($1::int[])', [criadas]).catch(() => {});
    await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [criadas]).catch(() => {});
  }
  await pool.end();
});

test('HTTP real: admin remove o e-mail e a auditoria correlaciona requisição, ator e alvo', async () => {
  const admin = await criarConta('ok-admin', { papel: 'admin' });
  const s = await sessao(admin.id);
  const emailAntigo = `remover-${SUFIXO}@example.com`;
  const alvo = await criarConta('ok-alvo', { email: emailAntigo });
  const antes = await contaNoBanco(alvo.id);
  const reqId = `req-remocao-${SUFIXO}-ok`;

  const r = await remover(alvo.id, { sessao: s, reqId });

  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.ok, true);
  assert.equal(Number(r.json.staff.id), alvo.id);
  assert.equal(r.json.staff.email, null);
  assert.equal(r.headers['x-request-id'], reqId);
  assert.ok(!r.texto.includes(emailAntigo), 'resposta não devolve o e-mail removido');

  const depois = await contaNoBanco(alvo.id);
  assert.equal(depois.email, null);
  assert.equal(depois.google_sub, null);
  assert.equal(depois.ativo, true);
  assert.equal(depois.papel, antes.papel);
  assert.equal(depois.senha_hash, antes.senha_hash, 'senha preservada');

  const [evento] = await eventos('email_google_removido', alvo.id);
  assert.ok(evento, 'evento de sucesso gravado');
  assert.equal(evento.resultado, 'sucesso');
  assert.equal(Number(evento.ator_id), admin.id);
  assert.equal(evento.ator_nome, admin.nome);
  assert.equal(evento.request_id, reqId);
  assert.deepEqual(evento.contexto, { emailRemovido: true, googleVinculado: false });
  await trilhaSemEmail(alvo.id, emailAntigo);
});

test('HTTP real: repetir a remoção é 409 e fica registrado como negado, sem tocar a conta', async () => {
  const admin = await criarConta('rep-admin', { papel: 'admin' });
  const s = await sessao(admin.id);
  const alvo = await criarConta('rep-alvo', { email: `repetir-${SUFIXO}@example.com` });

  assert.equal((await remover(alvo.id, { sessao: s })).status, 200);
  const r = await remover(alvo.id, { sessao: s });

  assert.equal(r.status, 409, r.texto);
  assert.ok(r.json.error);
  assert.equal((await contaNoBanco(alvo.id)).email, null);

  const negados = await eventos('email_google_remocao_negada', alvo.id);
  assert.equal(negados.length, 1);
  assert.equal(negados[0].resultado, 'negado');
  assert.equal(Number(negados[0].ator_id), admin.id);
  assert.equal(negados[0].contexto.motivo, 'conta_sem_email');
  assert.equal(negados[0].contexto.statusHttp, 409);
  assert.equal((await eventos('email_google_removido', alvo.id)).length, 1, 'uma única remoção efetiva');
});

test('HTTP real: conta já vinculada ao Google não perde o e-mail e a recusa é auditada', async () => {
  const admin = await criarConta('goog-admin', { papel: 'admin' });
  const s = await sessao(admin.id);
  const email = `vinculada-${SUFIXO}@example.com`;
  const sub = `sub-vinculado-${SUFIXO}`;
  const alvo = await criarConta('goog-alvo', { email, googleSub: sub });

  const r = await remover(alvo.id, { sessao: s });

  assert.equal(r.status, 409, r.texto);
  const conta = await contaNoBanco(alvo.id);
  assert.equal(conta.email, email);
  assert.equal(conta.google_sub, sub);
  assert.equal((await eventos('email_google_removido', alvo.id)).length, 0);
  const [negado] = await eventos('email_google_remocao_negada', alvo.id);
  assert.equal(negado.contexto.motivo, 'conta_vinculada_google');
  await trilhaSemEmail(alvo.id, email);
});

test('HTTP real: conta inativa é 409 e mantém o e-mail pré-cadastrado', async () => {
  const admin = await criarConta('inativa-admin', { papel: 'admin' });
  const s = await sessao(admin.id);
  const email = `inativa-${SUFIXO}@example.com`;
  const alvo = await criarConta('inativa-alvo', { email, ativo: false });

  const r = await remover(alvo.id, { sessao: s });

  assert.equal(r.status, 409, r.texto);
  assert.equal((await contaNoBanco(alvo.id)).email, email);
  const [negado] = await eventos('email_google_remocao_negada', alvo.id);
  assert.equal(negado.contexto.motivo, 'conta_inativa');
});

test('HTTP real: conta inexistente é 404 e id inválido é 400, sem evento', async () => {
  const admin = await criarConta('inv-admin', { papel: 'admin' });
  const s = await sessao(admin.id);

  const inexistente = await remover(987654321, { sessao: s });
  assert.equal(inexistente.status, 404, inexistente.texto);
  assert.equal((await eventos('email_google_remocao_negada', 987654321)).length, 1);

  const invalido = await remover(0, { sessao: s });
  assert.equal(invalido.status, 400, invalido.texto);
  assert.equal((await eventos('email_google_remocao_negada', 0)).length, 0);
  assert.equal((await eventos('email_google_removido', 0)).length, 0);
});

test('HTTP real: gates de sessão, papel, CSRF e origem recusam antes de qualquer escrita', async () => {
  const admin = await criarConta('gate-admin', { papel: 'admin' });
  const caixa = await criarConta('gate-caixa', { papel: 'caixa' });
  const email = `gate-${SUFIXO}@example.com`;
  const alvo = await criarConta('gate-alvo', { email });
  const sAdmin = await sessao(admin.id);
  const sCaixa = await sessao(caixa.id);

  const semSessao = await remover(alvo.id, {});
  assert.equal(semSessao.status, 401, semSessao.texto);

  const outroPapel = await remover(alvo.id, { sessao: sCaixa });
  assert.equal(outroPapel.status, 403, outroPapel.texto);

  const csrfErrado = await remover(alvo.id, { sessao: sAdmin, csrf: 'a'.repeat(64) });
  assert.equal(csrfErrado.status, 403, csrfErrado.texto);

  const origemHostil = await remover(alvo.id, { sessao: sAdmin, origin: 'http://evil.example' });
  assert.equal(origemHostil.status, 403, origemHostil.texto);

  const semOrigem = await remover(alvo.id, { sessao: sAdmin, origin: null });
  assert.ok([403, 400].includes(semOrigem.status), `sem Origin: ${semOrigem.status}`);

  assert.equal((await contaNoBanco(alvo.id)).email, email, 'e-mail intacto após as recusas');
  assert.equal((await eventos('email_google_removido', alvo.id)).length, 0);
  assert.equal((await eventos('email_google_remocao_negada', alvo.id)).length, 0,
    'recusa no gate de acesso não gera evento da operação');
});

test('HTTP real: duas remoções concorrentes produzem exatamente um sucesso', async () => {
  const admin = await criarConta('race-admin', { papel: 'admin' });
  const s = await sessao(admin.id);
  const alvo = await criarConta('race-alvo', { email: `corrida-${SUFIXO}@example.com` });

  const [a, b] = await Promise.all([
    remover(alvo.id, { sessao: s }),
    remover(alvo.id, { sessao: s }),
  ]);
  const status = [a.status, b.status].sort();
  assert.deepEqual(status, [200, 409], `${a.status}/${b.status}`);

  assert.equal((await contaNoBanco(alvo.id)).email, null);
  assert.equal((await eventos('email_google_removido', alvo.id)).length, 1);
  const negados = await eventos('email_google_remocao_negada', alvo.id);
  assert.equal(negados.length, 1);
  assert.equal(negados[0].contexto.motivo, 'conta_sem_email');
});
