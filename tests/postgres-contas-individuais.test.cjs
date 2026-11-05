'use strict';

// Issue #48 — contas individuais de staff (criação e desativação).
// Integração real com PostgreSQL descartável: as garantias dependem de
// transação, advisory lock e UNIQUE, então um pool falso não provaria nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do banco descartável');
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname), 'PostgreSQL local/CI obrigatório');
assert.strictEqual(databaseUrl.pathname, '/qradmin_test', 'Banco de teste obrigatório');
assert.strictEqual(process.env.NODE_ENV, 'test', 'NODE_ENV=test obrigatório');

const pool = require('../db/pool');
const auth = require('../db/auth');

const run = crypto.randomUUID().slice(0, 8);
const criados = [];
// staff_credencial_eventos.ator_staff_id tem FK para staff: o ator precisa ser
// uma conta real. Criamos as duas contas de ator no banco antes dos testes.
let atorAdminReal = null;
let atorCaixaReal = null;

const SENHA_FORTE = 'Aveia-Crocante-9182';

test.before(async () => {
  const hash = await auth.hashSenha('Ator-Fixo-0001');
  const { rows } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, ativo)
     VALUES ($1, $2, $3, 'admin', TRUE), ($4, $5, $3, 'caixa', TRUE)
     RETURNING id, login, papel`,
    [`Ator admin ${run}`, `ator-admin-${run}`, hash, `Ator caixa ${run}`, `ator-caixa-${run}`]
  );
  atorAdminReal = rows.find((r) => r.papel === 'admin');
  atorCaixaReal = rows.find((r) => r.papel === 'caixa');
  criados.push(atorAdminReal.id, atorCaixaReal.id);
});

function atorAdmin() {
  return atorAdminReal;
}

function atorCaixa() {
  return atorCaixaReal;
}

test.after(async () => {
  if (criados.length) {
    await pool.query('DELETE FROM staff_sessoes WHERE staff_id = ANY($1::int[])', [criados]);
    await pool.query('DELETE FROM staff_credencial_eventos WHERE staff_id = ANY($1::int[]) OR ator_staff_id = ANY($1::int[])', [criados]);
    await pool.query('UPDATE staff SET desativado_por = NULL WHERE desativado_por = ANY($1::int[])', [criados]);
    await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [criados]);
  }
  await pool.end();
});

async function criar(dados, ator, sufixo) {
  const out = await auth.criarContaStaff(dados, ator);
  criados.push(out.id);
  assert.ok(sufixo, 'uso interno do teste');
  return out;
}

test('#48 cria conta individual e nasce exigindo troca de senha', async () => {
  const login = `joao-${run}`;
  const conta = await criar(
    { nome: 'João da Silva', login, senha: SENHA_FORTE, papel: 'caixa' },
    atorAdmin(),
    run
  );

  assert.equal(conta.login, login);
  assert.equal(conta.papel, 'caixa');
  assert.equal(conta.ativo, true);
  assert.equal(conta.deveTrocarSenha, true, 'admin não deve conhecer a senha definitiva do funcionário');

  // A senha em si nunca volta na resposta.
  assert.equal(conta.senha, undefined);
  assert.equal(conta.senha_hash, undefined);

  const { rows } = await pool.query(
    'SELECT deve_trocar_senha, ativo, senha_hash FROM staff WHERE id = $1',
    [conta.id]
  );
  assert.equal(rows[0].deve_trocar_senha, true);
  assert.equal(rows[0].ativo, true);
  assert.equal(await auth.verificarSenha(SENHA_FORTE, rows[0].senha_hash), true);
});

test('#48 registra conta_criada com o ator, sem gravar segredo', async () => {
  const login = `auditado-${run}`;
  const conta = await criar(
    { nome: 'Maria Souza', login, senha: 'Cobre-Fresco-5521', papel: 'cozinha' },
    atorAdmin(),
    run
  );

  const { rows } = await pool.query(
    'SELECT evento, ator_login, login FROM staff_credencial_eventos WHERE staff_id = $1',
    [conta.id]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].evento, 'conta_criada');
  assert.equal(rows[0].ator_login, `ator-admin-${run}`);
  assert.equal(rows[0].login, login);

  // Nenhuma coluna da trilha pode conter a senha.
  const texto = JSON.stringify(rows[0]);
  assert.doesNotMatch(texto, /Cobre-Fresco-5521/);
});

test('#48 recusa login duplicado em conta ativa e audita a recusa', async () => {
  const login = `duplicado-${run}`;
  await criar({ nome: 'Primeiro', login, senha: 'Janela-Aberta-4417', papel: 'caixa' }, atorAdmin(), run);

  await assert.rejects(
    () => auth.criarContaStaff(
      { nome: 'Segundo', login, senha: 'Tapete-Macio-8823', papel: 'caixa' },
      atorAdmin()
    ),
    (e) => e.status === 409 && /já existe/i.test(e.message)
  );

  const { rows } = await pool.query(
    `SELECT evento FROM staff_credencial_eventos
      WHERE login = $1 AND evento = 'conta_criacao_rejeitada'`,
    [login]
  );
  assert.ok(rows.length >= 1, 'a tentativa recusada precisa ficar registrada');
});

test('#48 recusa senha já usada por outra conta ativa', async () => {
  await criar({ nome: 'Titular da senha', login: `dona-${run}`, senha: 'Chuva-Leve-3341', papel: 'caixa' }, atorAdmin(), run);

  await assert.rejects(
    () => auth.criarContaStaff(
      { nome: 'Outra pessoa', login: `copia-${run}`, senha: 'Chuva-Leve-3341', papel: 'bar' },
      atorAdmin()
    ),
    (e) => e.status === 400 && /outra conta/i.test(e.message)
  );
});

test('#48 aplica a política de senha na criação (não só na troca)', async () => {
  await assert.rejects(
    () => auth.criarContaStaff(
      { nome: 'Senha fraca', login: `fraca-${run}`, senha: 'senha123456', papel: 'bar' },
      atorAdmin()
    ),
    (e) => e.status === 400 && /comum|12 caracteres/i.test(e.message)
  );

  await assert.rejects(
    () => auth.criarContaStaff(
      { nome: 'Senha curta', login: `curta-${run}`, senha: 'Ab3-cd', papel: 'bar' },
      atorAdmin()
    ),
    (e) => e.status === 400 && /12 caracteres/i.test(e.message)
  );
});

test('#48 recusa login inválido e papel inexistente', async () => {
  await assert.rejects(
    () => auth.criarContaStaff(
      { nome: 'Login ruim', login: 'João Silva!', senha: SENHA_FORTE, papel: 'caixa' },
      atorAdmin()
    ),
    (e) => e.status === 400 && /Usuário inválido/i.test(e.message)
  );

  await assert.rejects(
    () => auth.criarContaStaff(
      { nome: 'Papel ruim', login: `papel-${run}`, senha: SENHA_FORTE, papel: 'gerente' },
      atorAdmin()
    ),
    (e) => e.status === 400 && /Papel inválido/i.test(e.message)
  );
});

test('#48 não-admin não cria nem desativa conta', async () => {
  await assert.rejects(
    () => auth.criarContaStaff(
      { nome: 'Tentativa', login: `naoadmin-${run}`, senha: SENHA_FORTE, papel: 'caixa' },
      atorCaixa()
    ),
    (e) => e.status === 403
  );

  const alvo = await criar({ nome: 'Alvo', login: `alvo-${run}`, senha: 'Pedra-Firme-7712', papel: 'bar' }, atorAdmin(), run);
  await assert.rejects(
    () => auth.desativarContaStaff(alvo.id, atorCaixa()),
    (e) => e.status === 403
  );
});

test('#48 desativar revoga sessões, bloqueia reuso do login e preserva a linha', async () => {
  const login = `desligado-${run}`;
  const conta = await criar(
    { nome: 'Funcionário que saiu', login, senha: 'Mesa-Vazia-6634', papel: 'caixa' },
    atorAdmin(),
    run
  );

  const token = await auth.criarSessao(conta.id);
  const antes = await pool.query('SELECT count(*)::int AS n FROM staff_sessoes WHERE staff_id = $1', [conta.id]);
  assert.equal(antes.rows[0].n, 1);

  const out = await auth.desativarContaStaff(conta.id, atorAdmin());
  assert.equal(out.ok, true);
  assert.equal(out.sessoesRevogadas, 1);

  const depois = await pool.query('SELECT count(*)::int AS n FROM staff_sessoes WHERE staff_id = $1', [conta.id]);
  assert.equal(depois.rows[0].n, 0, 'sessões da conta desativada precisam ser revogadas');

  // A linha continua existindo: pedidos e auditoria apontam para staff.id.
  const linha = await pool.query('SELECT ativo, desativado_em, desativado_por FROM staff WHERE id = $1', [conta.id]);
  assert.equal(linha.rows[0].ativo, false);
  assert.ok(linha.rows[0].desativado_em instanceof Date);

  // Sessão revogada não autentica.
  const staff = await auth.getStaffDaRequisicao({
    method: 'GET',
    headers: { cookie: `lqr_session=${encodeURIComponent(token)}` },
    socket: { encrypted: false },
  });
  assert.equal(staff, null);

  // Login NÃO pode ser reutilizado: a trilha usa o login como identidade,
  // então reaproveitar o nome de quem saiu tornaria a auditoria ambígua.
  await assert.rejects(
    () => auth.criarContaStaff(
      { nome: 'Substituto', login, senha: 'Porta-Nova-9915', papel: 'caixa' },
      atorAdmin()
    ),
    (e) => e.status === 409 && /desativada/i.test(e.message) && /identidade/i.test(e.message)
  );

  // O substituto entra com um login próprio e continua rastreável.
  const substituto = await auth.criarContaStaff(
    { nome: 'Substituto', login: `${login}-2`, senha: 'Porta-Nova-9915', papel: 'caixa' },
    atorAdmin()
  );
  criados.push(substituto.id);
  assert.equal(substituto.login, `${login}-2`);
});

test('#48 desativar audita o ator com o evento conta_desativada', async () => {
  const conta = await criar(
    { nome: 'Auditado desligamento', login: `auddes-${run}`, senha: 'Fivela-Dourada-2287', papel: 'bar' },
    atorAdmin(),
    run
  );
  await auth.desativarContaStaff(conta.id, atorAdmin());

  const { rows } = await pool.query(
    `SELECT evento, ator_login, sessoes_revogadas FROM staff_credencial_eventos
      WHERE staff_id = $1 AND evento = 'conta_desativada'`,
    [conta.id]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ator_login, `ator-admin-${run}`);
});

test('#48 recusa desativar a própria conta e conta já inativa', async () => {
  const conta = await criar(
    { nome: 'Auto desativação', login: `auto-${run}`, senha: 'Relogio-Antigo-5561', papel: 'admin' },
    atorAdmin(),
    run
  );

  await assert.rejects(
    () => auth.desativarContaStaff(conta.id, { id: conta.id, login: conta.login, papel: 'admin' }),
    (e) => e.status === 400 && /própria conta/i.test(e.message)
  );

  await auth.desativarContaStaff(conta.id, atorAdmin());
  await assert.rejects(
    () => auth.desativarContaStaff(conta.id, atorAdmin()),
    (e) => e.status === 409 && /já está desativada/i.test(e.message)
  );
});
