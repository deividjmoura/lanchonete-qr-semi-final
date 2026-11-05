'use strict';

// Issue #55 — 2FA de admin, ponta a ponta, no servidor real.
//
// O risco que este teste cobre é específico e grave: a etapa 1 do login (senha)
// NÃO pode produzir uma sessão utilizável. Se produzir, o 2FA é decoração —
// quem tem a senha ignora a etapa 2 e entra. Aqui, depois da senha correta,
// cada rota protegida é chamada com o cookie da sessão pendente e precisa
// responder 401.
//
// Cobre também: ativação exige código válido, códigos de recuperação são de uso
// único, replay do mesmo passo é recusado, e nenhum segredo aparece em resposta.
//
//   DATABASE_URL=postgres://.../qradmin_test NODE_ENV=test TOTP_ENC_KEY=<64 hex> \
//     node --test tests/postgres-totp-login.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { subirServidor, exigirAmbienteDeTeste } = require('./helpers/public-table-server.cjs');

exigirAmbienteDeTeste();
const pool = require('../db/pool');
const auth = require('../db/auth');
const totp = require('../db/totp');

const CHAVE = crypto.randomBytes(32).toString('hex');
const run = crypto.randomUUID().slice(0, 8);
const SENHA = 'Chefe-da-Cozinha-4471';
const criados = [];
let servidor;

const chamar = (metodo, caminho, opcoes) => servidor.request(metodo, caminho, opcoes);
const origemLocal = () => `http://127.0.0.1:${new URL(servidor.base).port}`;

function pegarCookie(resposta, nome) {
  const bruto = resposta.headers['set-cookie'];
  const lista = Array.isArray(bruto) ? bruto : bruto ? [bruto] : [];
  for (const c of lista) if (c.startsWith(`${nome}=`)) return c.split(';')[0];
  return null;
}

// O limite de login é 8/5 min por IP. Esta suíte entra muitas vezes de
// propósito; cada login sai de um IP de loopback próprio (o harness aceita
// `ip`) para que a contagem de logins seja do cenário, não do teste. O limite
// em si tem teste próprio em outra suíte.
let proximoIp = 1;
function ipDoLogin() {
  proximoIp += 1;
  return `127.0.0.${proximoIp}`;
}

async function login(usuario, senha) {
  const r = await chamar('POST', '/api/login', {
    corpo: { usuario, senha },
    headers: { origin: origemLocal() },
    ip: ipDoLogin(),
  });
  return { r, cookie: pegarCookie(r, 'lqr_session'), csrf: r.json && r.json.csrfToken };
}

function headers(sessao) {
  return { origin: origemLocal(), cookie: sessao.cookie, 'x-csrf-token': sessao.csrf };
}

/**
 * Código TOTP do passo atual.
 *
 * A janela é de ±1 passo (30 s). Vários testes fazem login dentro do mesmo
 * passo de 30 s, e o anti-replay — corretamente — recusa reutilizar o passo.
 * Para não fazer o teste depender do relógio, cada login de fixture zera
 * `totp_ultimo_passo` ANTES de usar o código. O teste de replay é o único que
 * NÃO zera: lá o reuso é justamente o que se quer provar.
 */
async function codigoTotpAtual() {
  const { rows } = await pool.query('SELECT totp_segredo FROM staff WHERE id = $1', [staffId()]);
  const segredo = totp.decifrarSegredo(rows[0].totp_segredo, { TOTP_ENC_KEY: CHAVE });
  return totp.codigoDoPasso(totp.base32Decode(segredo), totp.passoAtual());
}

/**
 * O limite por CONTA (10 tentativas / 5 min) é por login, não por IP — e é
 * justamente o que precisa existir contra varredura de senha. Esta suíte
 * autentica a mesma conta em muitos cenários, então o processo do servidor é
 * reiniciado entre eles para não transformar o limite em falso negativo.
 */
async function reiniciarServidor() {
  if (servidor) await servidor.encerrar();
  servidor = await subirServidor({ env: { TOTP_ENC_KEY: CHAVE } });
}

/** Login completo (senha + código), com o passo liberado como fixture. */
async function entrarComSegundoFator({ liberarPasso = true } = {}) {
  if (liberarPasso) {
    await pool.query('UPDATE staff SET totp_ultimo_passo = NULL WHERE id = $1', [staffId()]);
  }
  const sessaoPendente = await login(`chefe2fa-${run}`, SENHA);
  assert.equal(sessaoPendente.r.json.mfaPendente, true, 'deve pedir o segundo fator');
  const codigo = await codigoTotpAtual();
  const r = await chamar('POST', '/api/login/2fa', {
    corpo: { codigo },
    headers: { origin: origemLocal(), cookie: sessaoPendente.cookie },
  });
  return {
    r,
    codigo,
    sessaoPendente,
    sessao: r.status === 200 ? { cookie: pegarCookie(r, 'lqr_session'), csrf: r.json.csrfToken } : null,
  };
}

test.before(async () => {
  const hash = await auth.hashSenha(SENHA);
  const { rows } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, ativo, deve_trocar_senha)
     VALUES ($1, $2, $3, 'admin', TRUE, FALSE) RETURNING id, nome, login`,
    [`Chefe 2FA ${run}`, `chefe2fa-${run}`, hash]
  );
  criados.push(rows[0].id);
  // Esta suíte faz muitos logins propositalmente (cada cenário entra de novo).
  // O limite de login é 8/5 min por IP e por conta; no teste ele é afrouxado
  // para não transformar a contagem de logins em falso negativo — o limite em
  // si tem teste próprio.
  servidor = await subirServidor({ env: { TOTP_ENC_KEY: CHAVE } });
});

test.after(async () => {
  if (servidor) await servidor.encerrar();
  if (criados.length) {
    await pool.query('DELETE FROM staff_codigos_recuperacao WHERE staff_id = ANY($1::int[])', [criados]);
    await pool.query('DELETE FROM staff_sessoes WHERE staff_id = ANY($1::int[])', [criados]);
    await pool.query('DELETE FROM staff_credencial_eventos WHERE staff_id = ANY($1::int[])', [criados]);
    await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [criados]);
  }
  await pool.end();
});

const staffId = () => criados[0];

test('#55 ativação: exige admin, exige código válido e devolve 10 códigos uma única vez', async () => {
  const sessao = await login(`chefe2fa-${run}`, SENHA);
  assert.equal(sessao.r.status, 200);
  assert.equal(sessao.r.json.mfaPendente, undefined, 'sem 2FA ativo o login é direto');
  assert.equal(sessao.r.json.staff.id, staffId());

  // Estado inicial
  const estado = await chamar('GET', '/api/me/2fa', { headers: headers(sessao) });
  assert.equal(estado.status, 200);
  assert.equal(estado.json.ativo, false);
  assert.equal(estado.json.disponivel, true, 'a chave de cifra está configurada no servidor');

  // Passo 1: segredo + URI
  const inicio = await chamar('POST', '/api/me/2fa/iniciar', { headers: headers(sessao) });
  assert.equal(inicio.status, 200);
  assert.match(inicio.json.segredo, /^[A-Z2-7]{32}$/);
  assert.match(inicio.json.uri, /^otpauth:\/\/totp\//);

  // Nada foi gravado ainda
  const antes = await pool.query('SELECT totp_ativo FROM staff WHERE id = $1', [staffId()]);
  assert.equal(antes.rows[0].totp_ativo, false, 'iniciar não ativa nada');

  // Código errado é recusado e NÃO ativa
  const ruim = await chamar('POST', '/api/me/2fa/ativar', {
    corpo: { segredo: inicio.json.segredo, codigo: '000000' },
    headers: headers(sessao),
  });
  assert.equal(ruim.status, 400);
  assert.equal(ruim.json.code, 'TOTP_CODIGO_INVALIDO');
  const aindaNao = await pool.query('SELECT totp_ativo FROM staff WHERE id = $1', [staffId()]);
  assert.equal(aindaNao.rows[0].totp_ativo, false, 'código errado não ativa');

  // Código certo ativa e devolve os 10 códigos
  const buf = totp.base32Decode(inicio.json.segredo);
  const codigo = totp.codigoDoPasso(buf, totp.passoAtual());
  const ok = await chamar('POST', '/api/me/2fa/ativar', {
    corpo: { segredo: inicio.json.segredo, codigo },
    headers: headers(sessao),
  });
  assert.equal(ok.status, 200, ok.texto);
  assert.equal(ok.json.codigosRecuperacao.length, 10);
  assert.equal(new Set(ok.json.codigosRecuperacao).size, 10, 'códigos distintos');
  // A resposta não pode vazar o segredo de volta.
  assert.ok(!ok.texto.includes(inicio.json.segredo), 'segredo não volta na resposta');

  const depois = await pool.query(
    'SELECT totp_ativo, totp_segredo FROM staff WHERE id = $1', [staffId()]
  );
  assert.equal(depois.rows[0].totp_ativo, true);
  assert.ok(!depois.rows[0].totp_segredo.includes(inicio.json.segredo), 'no banco o segredo está cifrado');

  const eventos = await pool.query(
    `SELECT evento FROM staff_credencial_eventos WHERE staff_id = $1 ORDER BY id`, [staffId()]
  );
  assert.ok(eventos.rows.some((e) => e.evento === 'totp_ativado'));

  // A sessão atual sobreviveu à ativação (não expulsa quem acabou de configurar).
  const eu = await chamar('GET', '/api/me', { headers: headers(sessao) });
  assert.equal(eu.status, 200, 'a sessão que ativou o 2FA continua válida');
});

test('#55 etapa 1 do login NÃO autentica nenhuma rota (sem bypass do 2FA)', async () => {
  const sessao = await login(`chefe2fa-${run}`, SENHA);
  assert.equal(sessao.r.status, 200);
  assert.equal(sessao.r.json.mfaPendente, true, 'o login precisa pedir o segundo fator');
  assert.equal(sessao.r.json.staff, undefined, 'não revela dados da conta antes do 2º fator');
  assert.ok(sessao.cookie, 'existe um cookie, mas ele é de sessão pendente');

  // Toda rota protegida precisa recusar o cookie pendente.
  const tentativas = [
    ['GET', '/api/me'],
    ['GET', '/api/admin/contas'],
    ['GET', '/api/caixa/sessoes'],
    ['GET', '/api/admin/cardapio'],
  ];
  for (const [metodo, caminho] of tentativas) {
    const r = await chamar(metodo, caminho, { headers: headers(sessao) });
    assert.equal(r.status, 401, `${caminho} não pode aceitar sessão pendente`);
  }

  // E o cookie não serve para uma mutação tampouco.
  const mutacao = await chamar('POST', '/api/me/2fa/iniciar', { headers: headers(sessao) });
  assert.equal(mutacao.status, 401);
});

test('#55 etapa 2 com código errado, depois certo, promove a sessão', async () => {
  const sessao = await login(`chefe2fa-${run}`, SENHA);
  assert.equal(sessao.r.json.mfaPendente, true);

  const errado = await chamar('POST', '/api/login/2fa', {
    corpo: { codigo: '000000' },
    headers: { origin: origemLocal(), cookie: sessao.cookie },
  });
  assert.equal(errado.status, 401);
  assert.equal(errado.json.code, 'MFA_CODIGO_INVALIDO');

  // Código válido agora (passo liberado como fixture)
  await pool.query('UPDATE staff SET totp_ultimo_passo = NULL WHERE id = $1', [staffId()]);
  const codigo = await codigoTotpAtual();
  const ok = await chamar('POST', '/api/login/2fa', {
    corpo: { codigo },
    headers: { origin: origemLocal(), cookie: sessao.cookie },
  });
  assert.equal(ok.status, 200, ok.texto);
  assert.equal(ok.json.ok, true);
  assert.equal(ok.json.via, 'totp');
  assert.equal(ok.json.staff.id, staffId());

  const novaSessao = { cookie: pegarCookie(ok, 'lqr_session'), csrf: ok.json.csrfToken };
  assert.ok(novaSessao.cookie, 'emite cookie de sessão completa');
  assert.notEqual(novaSessao.cookie, sessao.cookie, 'o token pendente é trocado, não reaproveitado');

  const eu = await chamar('GET', '/api/me', { headers: headers(novaSessao) });
  assert.equal(eu.status, 200, 'agora sim a sessão autentica');

  // O cookie pendente original não serve mais.
  const comPendente = await chamar('GET', '/api/me', { headers: headers(sessao) });
  assert.equal(comPendente.status, 401, 'o token pendente deixou de existir');
});

test('#55 o mesmo código TOTP não pode ser usado duas vezes (replay)', async () => {
  // Primeiro uso legítimo.
  const primeiro = await entrarComSegundoFator();
  assert.equal(primeiro.r.status, 200, primeiro.r.texto);

  // Segundo login com o MESMO código e SEM liberar o passo: é replay.
  const s2 = await login(`chefe2fa-${run}`, SENHA);
  const replay = await chamar('POST', '/api/login/2fa', {
    corpo: { codigo: primeiro.codigo },
    headers: { origin: origemLocal(), cookie: s2.cookie },
  });
  assert.equal(replay.status, 401, 'replay do mesmo passo precisa ser recusado');

  // E a recusa fica auditada, sem registrar o código.
  const eventos = await pool.query(
    `SELECT evento FROM staff_credencial_eventos WHERE staff_id = $1 AND evento = 'totp_falhou'`,
    [staffId()]
  );
  assert.ok(eventos.rowCount >= 1);
});

test('#55 código de recuperação entra uma vez só e é consumido', async () => {
  await reiniciarServidor();
  // Gera códigos novos ativando de novo (a ativação recria os 10).
  const entrada = await entrarComSegundoFator();
  assert.equal(entrada.r.status, 200, entrada.r.texto);
  const sessaoCompleta = entrada.sessao;

  const inicio = await chamar('POST', '/api/me/2fa/iniciar', { headers: headers(sessaoCompleta) });
  const novoBuf = totp.base32Decode(inicio.json.segredo);
  const ativ = await chamar('POST', '/api/me/2fa/ativar', {
    corpo: { segredo: inicio.json.segredo, codigo: totp.codigoDoPasso(novoBuf, totp.passoAtual()) },
    headers: headers(sessaoCompleta),
  });
  assert.equal(ativ.status, 200, ativ.texto);
  assert.equal(ativ.json.codigosRecuperacao.length, 10);
  const recuperacao = ativ.json.codigosRecuperacao[0];

  // Usa o código de recuperação
  const s2 = await login(`chefe2fa-${run}`, SENHA);
  const viaRecuperacao = await chamar('POST', '/api/login/2fa', {
    corpo: { codigo: recuperacao },
    headers: { origin: origemLocal(), cookie: s2.cookie },
  });
  assert.equal(viaRecuperacao.status, 200, viaRecuperacao.texto);
  assert.equal(viaRecuperacao.json.via, 'recuperacao');
  assert.equal(viaRecuperacao.json.codigosRestantes, 9);

  // O mesmo código não funciona de novo
  const s3 = await login(`chefe2fa-${run}`, SENHA);
  const repetido = await chamar('POST', '/api/login/2fa', {
    corpo: { codigo: recuperacao },
    headers: { origin: origemLocal(), cookie: s3.cookie },
  });
  assert.equal(repetido.status, 401, 'código de recuperação é de uso único');

  const eventos = await pool.query(
    `SELECT evento FROM staff_credencial_eventos WHERE staff_id = $1 AND evento = 'codigo_recuperacao_usado'`,
    [staffId()]
  );
  assert.equal(eventos.rowCount, 1, 'o uso fica auditado');
});

test('#55 desativar exige a senha e derruba as outras sessões', async () => {
  await reiniciarServidor();
  const entrada = await entrarComSegundoFator();
  assert.equal(entrada.r.status, 200, entrada.r.texto);
  const sessao = entrada.sessao;

  const senhaErrada = await chamar('POST', '/api/me/2fa/desativar', {
    corpo: { senha: 'senha-errada-123' },
    headers: headers(sessao),
  });
  assert.equal(senhaErrada.status, 403);
  assert.equal(senhaErrada.json.code, 'SENHA_INCORRETA');
  const aindaAtivo = await pool.query('SELECT totp_ativo FROM staff WHERE id = $1', [staffId()]);
  assert.equal(aindaAtivo.rows[0].totp_ativo, true, 'senha errada não desativa');

  const off = await chamar('POST', '/api/me/2fa/desativar', {
    corpo: { senha: SENHA },
    headers: headers(sessao),
  });
  assert.equal(off.status, 200, off.texto);
  assert.equal(off.json.desativado, true);

  const depois = await pool.query(
    'SELECT totp_ativo, totp_segredo FROM staff WHERE id = $1', [staffId()]
  );
  assert.equal(depois.rows[0].totp_ativo, false);
  assert.equal(depois.rows[0].totp_segredo, null, 'o segredo é apagado, não só desligado');
  const codigos = await pool.query(
    'SELECT COUNT(*)::int AS n FROM staff_codigos_recuperacao WHERE staff_id = $1', [staffId()]
  );
  assert.equal(codigos.rows[0].n, 0, 'os códigos de recuperação são descartados');

  // Sem 2FA o login volta a ser direto.
  const direto = await login(`chefe2fa-${run}`, SENHA);
  assert.equal(direto.r.json.mfaPendente, undefined);
  assert.ok(direto.r.json.staff, 'login direto volta a funcionar');
});

test('#55 contas não-admin não ativam 2FA', async () => {
  const hash = await auth.hashSenha(SENHA);
  const { rows } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, ativo, deve_trocar_senha)
     VALUES ($1, $2, $3, 'caixa', TRUE, FALSE) RETURNING id`,
    [`Caixa 2FA ${run}`, `caixa2fa-${run}`, hash]
  );
  criados.push(rows[0].id);

  const s = await login(`caixa2fa-${run}`, SENHA);
  assert.equal(s.r.status, 200);
  assert.equal(s.r.json.mfaPendente, undefined, 'caixa entra direto (escopo: admin)');

  const tentativa = await chamar('POST', '/api/me/2fa/iniciar', { headers: headers(s) });
  assert.equal(tentativa.status, 403);
});
