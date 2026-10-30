// Auth de staff: usuários no Postgres (papéis) + sessão persistente (cookie httpOnly).
const crypto = require('crypto');
const { promisify } = require('util');
const pool = require('./pool');

const scrypt = promisify(crypto.scrypt);

const SESSION_COOKIE = 'lqr_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;

const PAPEIS = Object.freeze(['admin', 'cozinha', 'bar', 'caixa']);

// admin acessa tudo; cozinha, bar e caixa só o próprio domínio
const ACESSO = Object.freeze({
  admin: new Set(['admin', 'cozinha', 'bar', 'caixa']),
  cozinha: new Set(['cozinha']),
  bar: new Set(['bar']),
  caixa: new Set(['caixa']),
});

const HOME_POR_PAPEL = Object.freeze({
  admin: '/admin',
  cozinha: '/cozinha',
  bar: '/bar',
  caixa: '/caixa',
});

class ErroAuth extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

const CODIGO_TROCA_OBRIGATORIA = 'SENHA_TROCA_OBRIGATORIA';

/**
 * Token CSRF que não corresponde ao cookie de sessão atual.
 *
 * Acontece legitimamente quando outra aba fez login: `criarSessao()` emite um
 * cookie novo com `Path=/`, então o cookie passa a valer para todas as abas, mas
 * a aba antiga continua com o token derivado da sessão anterior em memória.
 * O cliente usa este código para buscar o token atual e repetir a chamada uma
 * única vez — a checagem de CSRF roda ANTES de qualquer escrita, portanto a
 * requisição recusada não alterou nada e repeti-la não duplica efeito.
 *
 * É distinto de 401 (sessão inexistente) e de 403 sem código (sem permissão):
 * nesses casos repetir não resolveria.
 */
const CODIGO_CSRF_INVALIDO = 'CSRF_INVALIDO';

/**
 * Troca obrigatória ativa por padrão em produção. `STAFF_FORCE_PASSWORD_CHANGE=true|false`
 * força o comportamento em qualquer ambiente (útil para testar/ desligar conscientemente).
 */
function trocaObrigatoriaAtiva(env = process.env) {
  const v = String(env.STAFF_FORCE_PASSWORD_CHANGE || '').trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return env.NODE_ENV === 'production';
}

const SENHA_MIN = 12;
const SENHA_MAX = 128;
const SENHAS_FRACAS = new Set([
  'senha123456', 'password1234', '123456789012', 'qwertyuiop12', 'admin1234567', 'lanchonete123',
]);

/** Política de senha (função pura). Retorna mensagem de erro ou null se aceita. */
function validarPoliticaSenha(nova, { login = '' } = {}) {
  if (typeof nova !== 'string') return 'Informe a nova senha.';
  if (nova.length < SENHA_MIN) return `A nova senha deve ter pelo menos ${SENHA_MIN} caracteres.`;
  if (nova.length > SENHA_MAX) return `A nova senha deve ter no máximo ${SENHA_MAX} caracteres.`;
  if (new Set(nova).size < 5) return 'A nova senha é repetitiva demais. Use caracteres variados.';
  const baixa = nova.toLowerCase();
  if (SENHAS_FRACAS.has(baixa)) return 'Essa senha é muito comum. Escolha outra.';
  const l = String(login || '').trim().toLowerCase();
  if (l.length >= 3 && baixa.includes(l)) return 'A nova senha não pode conter o seu usuário.';
  return null;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function cookieDeSessao(token) {
  const partes = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (process.env.NODE_ENV === 'production') partes.push('Secure');
  return partes.join('; ');
}

function cookieDeLogout() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

async function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(String(senha), salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${Buffer.from(derived).toString('hex')}`;
}

async function verificarSenha(senha, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const esperado = Buffer.from(hashHex, 'hex');
    const derived = await scrypt(String(senha || ''), salt, SCRYPT_KEYLEN);
    const atual = Buffer.from(derived);
    if (atual.length !== esperado.length) return false;
    return crypto.timingSafeEqual(atual, esperado);
  } catch {
    return false;
  }
}

/** Senha inicial/temporária marcada, ou hash idêntico ao de outra conta ativa (senha compartilhada). */
function exigeTrocaDeSenha(row, env = process.env) {
  if (!row || !trocaObrigatoriaAtiva(env)) return false;
  return Boolean(row.deve_trocar_senha) || Boolean(row.senha_compartilhada);
}

function staffPublico(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    login: row.login,
    papel: row.papel,
    deveTrocarSenha: exigeTrocaDeSenha(row),
  };
}

// Colunas lidas via to_jsonb para tolerar execução de testes/ferramentas fora do entrypoint
// de produção. O startup oficial é fail-closed e exige migrations aplicadas antes de iniciar.
const SQL_FLAGS_SENHA = `
  COALESCE((to_jsonb(s)->>'deve_trocar_senha')::boolean, FALSE) AS deve_trocar_senha,
  (SELECT COUNT(*) FROM staff o WHERE o.ativo AND o.senha_hash = s.senha_hash) > 1 AS senha_compartilhada`;

async function contarStaff() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM staff');
  return rows[0].n;
}

/** Garante usuários iniciais (idempotente). */
async function garantirStaffSeed() {
  const n = await contarStaff();
  if (n > 0) return { created: false, count: n };

  const senhaConfigurada = process.env.STAFF_SEED_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!senhaConfigurada) {
    if (process.env.NODE_ENV === 'production') {
      throw new ErroAuth(503, 'Bootstrap de staff não configurado. Defina STAFF_SEED_PASSWORD antes do primeiro acesso.');
    }
    return { created: false, count: 0, skipped: true, reason: 'senha de bootstrap ausente' };
  }

  const senhaPadrao = String(senhaConfigurada);
  if (senhaPadrao.length < 12) {
    throw new ErroAuth(503, 'A senha de bootstrap deve ter pelo menos 12 caracteres.');
  }

  const hash = await hashSenha(senhaPadrao);
  const users = [
    { nome: 'Administrador', login: 'admin', papel: 'admin' },
    { nome: 'Cozinha', login: 'cozinha', papel: 'cozinha' },
    { nome: 'Bar', login: 'bar', papel: 'bar' },
    { nome: 'Caixa', login: 'caixa', papel: 'caixa' },
  ];
  for (const u of users) {
    // Credencial de bootstrap é temporária: marcada para troca obrigatória (#55).
    await pool.query(
      `INSERT INTO staff (nome, login, senha_hash, papel, deve_trocar_senha)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (login) DO NOTHING`,
      [u.nome, u.login, hash, u.papel]
    );
  }
  return { created: true, count: users.length, senhaPadraoUsada: true };
}

async function autenticar(login, senha) {
  const user = String(login || '').trim().toLowerCase();
  if (!user || !senha) {
    throw new ErroAuth(400, 'Informe usuário e senha');
  }

  const { rows } = await pool.query(
    `SELECT s.id, s.nome, s.login, s.senha_hash, s.papel, s.ativo, ${SQL_FLAGS_SENHA}
     FROM staff s WHERE lower(s.login) = $1 LIMIT 1`,
    [user]
  );
  const row = rows[0];
  if (!row || !row.ativo) {
    throw new ErroAuth(401, 'Usuário ou senha incorretos');
  }
  const ok = await verificarSenha(senha, row.senha_hash);
  if (!ok) {
    throw new ErroAuth(401, 'Usuário ou senha incorretos');
  }
  return staffPublico(row);
}

async function criarSessao(staffId, db = pool) {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + SESSION_TTL_MS);
  await db.query(
    `INSERT INTO staff_sessoes (token, staff_id, expira_em)
     VALUES ($1, $2, $3)`,
    [token, staffId, expira]
  );
  return token;
}

async function destruirSessao(token) {
  if (!token) return;
  await pool.query('DELETE FROM staff_sessoes WHERE token = $1', [token]);
}

async function getStaffDaRequisicao(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;

  const { rows } = await pool.query(
    `SELECT s.id, s.nome, s.login, s.papel, s.ativo, ss.expira_em, ${SQL_FLAGS_SENHA}
     FROM staff_sessoes ss
     JOIN staff s ON s.id = ss.staff_id
     WHERE ss.token = $1`,
    [token]
  );
  const row = rows[0];
  if (!row || !row.ativo) {
    if (token) await destruirSessao(token);
    return null;
  }
  if (new Date(row.expira_em).getTime() <= Date.now()) {
    await destruirSessao(token);
    return null;
  }

  // Touch leve (não bloqueia se falhar)
  pool
    .query('UPDATE staff_sessoes SET ultimo_uso = now() WHERE token = $1', [token])
    .catch(() => {});

  return staffPublico(row);
}

async function estaAutenticado(req) {
  const staff = await getStaffDaRequisicao(req);
  return Boolean(staff);
}

function papelPodeAcessar(papel, recurso) {
  const set = ACESSO[papel];
  return Boolean(set && set.has(recurso));
}

function verificarOrigemRequisicao(req) {
  const metodo = String(req.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return;

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const hostsPermitidos = new Set(
    String(process.env.CSRF_ALLOWED_ORIGINS || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  );

  const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
  const host = req.headers.host;
  const origemLocal = host ? `${proto}://${host}` : null;
  if (origemLocal) hostsPermitidos.add(origemLocal);

  const candidato = origin || (referer ? (() => {
    try { return new URL(referer).origin; } catch { return null; }
  })() : null);

  // Navegadores modernos enviam Origin em métodos inseguros. Quando ambos
  // estão ausentes, mantemos compatibilidade com clientes não-browser.
  if (candidato && !hostsPermitidos.has(candidato)) {
    throw new ErroAuth(403, 'Origem da requisição não permitida');
  }
}

function csrfTokenParaSessao(sessionToken) {
  if (!sessionToken || typeof sessionToken !== 'string') return null;
  return crypto
    .createHmac('sha256', sessionToken)
    .update('qradmin-csrf-v1')
    .digest('hex');
}

function verificarProtecaoCSRF(req) {
  const metodo = String(req.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return;

  const sessionToken = parseCookies(req)[SESSION_COOKIE];
  const esperado = csrfTokenParaSessao(sessionToken);
  const recebido = req.headers['x-csrf-token'];
  if (!esperado || typeof recebido !== 'string') {
    // Compatibilidade com páginas legadas que ainda usam fetch direto:
    // só aceitamos o fallback quando há Origin/Referer válido e a validação
    // existente confirma que a origem é a mesma da aplicação/allowlist.
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    let refererOrigin = '';
    if (!origin && typeof req.headers.referer === 'string') {
      try { refererOrigin = new URL(req.headers.referer).origin; } catch {}
    }
    if (!origin && !refererOrigin) {
      throw new ErroAuth(403, 'Token CSRF ausente ou inválido', CODIGO_CSRF_INVALIDO);
    }
    verificarOrigemRequisicao(req);
    return;
  }

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recebido, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new ErroAuth(403, 'Token CSRF ausente ou inválido', CODIGO_CSRF_INVALIDO);
  }
}

/** recurso: 'admin' | 'cozinha' | 'bar' | 'caixa' */
async function exigirAcesso(req, recurso) {
  const staff = await getStaffDaRequisicao(req);
  if (!staff) {
    const err = new ErroAuth(401, 'Não autenticado');
    throw err;
  }
  verificarOrigemRequisicao(req);
  verificarProtecaoCSRF(req);
  if (staff.deveTrocarSenha) {
    throw new ErroAuth(403, 'Troca de senha obrigatória antes de continuar.', CODIGO_TROCA_OBRIGATORIA);
  }
  if (!papelPodeAcessar(staff.papel, recurso)) {
    throw new ErroAuth(403, 'Sem permissão para esta área');
  }
  return staff;
}

/** Sessão válida + origem + CSRF, sem checar papel nem troca obrigatória (usada para trocar a própria senha). */
async function exigirSessao(req) {
  const staff = await getStaffDaRequisicao(req);
  if (!staff) throw new ErroAuth(401, 'Não autenticado');
  verificarOrigemRequisicao(req);
  verificarProtecaoCSRF(req);
  return staff;
}

async function registrarEventoCredencial(db, { staffId, login, evento, sessoesRevogadas = 0, atorStaffId = null, atorLogin = null }) {
  await db.query(
    `INSERT INTO staff_credencial_eventos (staff_id, login, evento, sessoes_revogadas, ator_staff_id, ator_login)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [staffId, login, evento, sessoesRevogadas, atorStaffId, atorLogin]
  );
}

/**
 * Redefinição de senha por um administrador — cobre o caso "esqueci a senha".
 *
 * Diferente de trocarSenha(), NÃO exige a senha antiga: quem autoriza é o papel
 * admin da sessão, validado na rota pelo gate de recuperação (exigirSessao +
 * papel admin). Serve para qualquer setor (admin, cozinha, bar, caixa),
 * inclusive a própria conta do admin.
 *
 * O que continua obrigatório, para a facilidade não virar buraco:
 *  - a política de senha (tamanho, variedade, não conter o login, não ser comum);
 *  - senha exclusiva: não pode ser igual à de outra conta ativa;
 *  - revogação de TODAS as sessões da conta afetada;
 *  - auditoria com o ator (quem redefiniu) e o alvo, sem nunca gravar segredo.
 *
 * Tudo em uma transação, com o mesmo lock que serializa as trocas.
 */
async function redefinirSenhaStaff(atorStaffId, loginAlvo, senhaNova, tokenSessao = null) {
  if (typeof senhaNova !== 'string' || !senhaNova) throw new ErroAuth(400, 'Informe a nova senha.');
  if (typeof loginAlvo !== 'string' || !loginAlvo.trim() || loginAlvo.trim().length > 64) {
    throw new ErroAuth(400, 'Informe de qual setor a senha será redefinida.');
  }
  const alvo = loginAlvo.trim().toLowerCase();

  const client = await pool.connect();
  let rejeicao = null;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(741928350112)');

    // O ator precisa ser admin ATIVO no instante da transação: o papel não pode
    // ter sido rebaixado entre a checagem da rota e esta escrita.
    const { rows: atores } = await client.query(
      'SELECT id, login, papel, ativo FROM staff WHERE id = $1 FOR SHARE',
      [atorStaffId]
    );
    const ator = atores[0];
    if (!ator || !ator.ativo) {
      await client.query('ROLLBACK');
      throw new ErroAuth(401, 'Não autenticado');
    }
    if (ator.papel !== 'admin') {
      await client.query('ROLLBACK');
      throw new ErroAuth(403, 'Apenas o administrador pode redefinir senhas de outros setores.');
    }
    // A rota já validou a sessão, mas outra redefinição concorrente pode tê-la
    // revogado enquanto esperávamos o lock. Revalidamos o cookie dentro da
    // transação para não autorizar escrita com sessão morta.
    if (tokenSessao) {
      const { rows: sessoes } = await client.query(
        'SELECT 1 FROM staff_sessoes WHERE token = $1 AND staff_id = $2 AND expira_em > now()',
        [tokenSessao, ator.id]
      );
      if (!sessoes.length) {
        await client.query('ROLLBACK');
        throw new ErroAuth(401, 'Não autenticado');
      }
    }

    const { rows } = await client.query(
      'SELECT id, nome, login, papel, ativo, senha_hash FROM staff WHERE lower(login) = $1 FOR UPDATE',
      [alvo]
    );
    const row = rows[0];
    if (!row || !row.ativo) {
      await client.query('ROLLBACK');
      throw new ErroAuth(404, 'Conta não encontrada ou desativada.');
    }

    const politica = validarPoliticaSenha(senhaNova, { login: row.login });
    if (politica) {
      rejeicao = { evento: 'senha_redefinicao_rejeitada', erro: new ErroAuth(400, politica), alvo: row };
    } else if (await verificarSenha(senhaNova, row.senha_hash)) {
      rejeicao = {
        evento: 'senha_redefinicao_rejeitada',
        erro: new ErroAuth(400, 'A nova senha deve ser diferente da senha atual dessa conta.'),
        alvo: row,
      };
    } else {
      const { rows: outros } = await client.query(
        'SELECT senha_hash FROM staff WHERE ativo AND id <> $1',
        [row.id]
      );
      for (const o of outros) {
        if (await verificarSenha(senhaNova, o.senha_hash)) {
          rejeicao = {
            evento: 'senha_redefinicao_rejeitada',
            erro: new ErroAuth(400, 'Essa senha já é usada por outra conta. Escolha uma senha exclusiva.'),
            alvo: row,
          };
          break;
        }
      }
    }

    if (rejeicao) {
      await registrarEventoCredencial(client, {
        staffId: rejeicao.alvo.id,
        login: rejeicao.alvo.login,
        evento: rejeicao.evento,
        atorStaffId: ator.id,
        atorLogin: ator.login,
      });
      await client.query('COMMIT'); // preserva a trilha da tentativa recusada
      throw rejeicao.erro;
    }

    // Mesma regra da troca própria: se a credencial era compartilhada, as outras
    // contas continuam obrigadas a trocar antes de o hash antigo deixar de existir.
    await client.query(
      'UPDATE staff SET deve_trocar_senha = TRUE WHERE ativo AND id <> $1 AND senha_hash = $2',
      [row.id, row.senha_hash]
    );

    const novoHash = await hashSenha(senhaNova);
    await client.query(
      `UPDATE staff
          SET senha_hash = $2, senha_alterada_em = now(), deve_trocar_senha = FALSE
        WHERE id = $1`,
      [row.id, novoHash]
    );
    const revogadas = await client.query('DELETE FROM staff_sessoes WHERE staff_id = $1', [row.id]);

    // Se o admin redefiniu a própria senha, a sessão dele também foi revogada.
    // A sessão de substituição nasce DENTRO da transação: ou a troca inteira
    // (hash + revogação + sessão nova + auditoria) confirma, ou nada muda.
    const propriaConta = Number(row.id) === Number(ator.id);
    const token = propriaConta ? await criarSessao(row.id, client) : null;

    await registrarEventoCredencial(client, {
      staffId: row.id,
      login: row.login,
      evento: 'senha_redefinida',
      sessoesRevogadas: revogadas.rowCount,
      atorStaffId: ator.id,
      atorLogin: ator.login,
    });
    await client.query('COMMIT');

    return {
      login: row.login,
      papel: row.papel,
      nome: row.nome,
      sessoesRevogadas: revogadas.rowCount,
      propriaConta,
      token,
      csrfToken: token ? csrfTokenParaSessao(token) : null,
    };
  } catch (e) {
    if (!rejeicao) await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Contas que o admin pode ter como alvo da redefinição (sem expor hash). */
async function listarContasStaff() {
  const { rows } = await pool.query(
    `SELECT s.id, s.nome, s.login, s.papel, s.ativo, ${SQL_FLAGS_SENHA}
       FROM staff s WHERE s.ativo ORDER BY s.papel, s.login`
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    login: r.login,
    papel: r.papel,
    deveTrocarSenha: exigeTrocaDeSenha(r),
  }));
}

/**
 * Troca a PRÓPRIA senha do staff autenticado.
 *  - exige a senha atual (reautenticação);
 *  - aplica a política de senha, recusa repetir a atual e recusa senha já usada por outra conta ativa;
 *  - tudo (novo hash, limpeza da troca obrigatória, revogação de TODAS as sessões do usuário e auditoria)
 *    acontece em UMA transação;
 *  - emite uma sessão nova (token rotacionado) para o dispositivo que trocou.
 * Nunca registra senhas, hashes ou tokens.
 */
async function trocarSenha(staffId, senhaAtual, senhaNova) {
  if (typeof senhaAtual !== 'string' || !senhaAtual) throw new ErroAuth(400, 'Informe a senha atual.');
  if (typeof senhaNova !== 'string' || !senhaNova) throw new ErroAuth(400, 'Informe a nova senha.');

  const client = await pool.connect();
  let rejeicao = null; // { evento, erro }
  try {
    await client.query('BEGIN');
    // Serializa trocas entre contas diferentes: a checagem de reutilização de senha
    // não pode ser burlada por duas trocas concorrentes que escolham a mesma senha.
    await client.query("SELECT pg_advisory_xact_lock(741928350112)");
    const { rows } = await client.query(
      'SELECT id, login, senha_hash, ativo FROM staff WHERE id = $1 FOR UPDATE',
      [staffId]
    );
    const row = rows[0];
    if (!row || !row.ativo) {
      await client.query('ROLLBACK');
      throw new ErroAuth(401, 'Não autenticado');
    }

    if (!(await verificarSenha(senhaAtual, row.senha_hash))) {
      rejeicao = { evento: 'senha_troca_falhou', erro: new ErroAuth(400, 'Senha atual incorreta.') };
    } else {
      const politica = validarPoliticaSenha(senhaNova, { login: row.login });
      if (politica) {
        rejeicao = { evento: 'senha_troca_rejeitada', erro: new ErroAuth(400, politica) };
      } else if (senhaNova === senhaAtual) {
        rejeicao = { evento: 'senha_troca_rejeitada', erro: new ErroAuth(400, 'A nova senha deve ser diferente da atual.') };
      } else {
        const { rows: outros } = await client.query(
          'SELECT senha_hash FROM staff WHERE ativo AND id <> $1',
          [staffId]
        );
        for (const o of outros) {
          if (await verificarSenha(senhaNova, o.senha_hash)) {
            rejeicao = {
              evento: 'senha_troca_rejeitada',
              erro: new ErroAuth(400, 'Essa senha já é usada por outra conta. Escolha uma senha exclusiva.'),
            };
            break;
          }
        }
      }
    }

    if (rejeicao) {
      await registrarEventoCredencial(client, { staffId, login: row.login, evento: rejeicao.evento });
      await client.query('COMMIT'); // mantém a trilha da tentativa recusada; nada mais foi alterado
      throw rejeicao.erro;
    }

    // Se esta credencial era compartilhada, persistir a obrigação nas outras
    // contas antes de trocar o hash. Sem isso, a última conta remanescente deixaria
    // de parecer compartilhada e poderia escapar da troca obrigatória.
    await client.query(
      `UPDATE staff
          SET deve_trocar_senha = TRUE
        WHERE ativo AND id <> $1 AND senha_hash = $2`,
      [staffId, row.senha_hash]
    );

    const novoHash = await hashSenha(senhaNova);
    await client.query(
      `UPDATE staff
          SET senha_hash = $2, senha_alterada_em = now(), deve_trocar_senha = FALSE
        WHERE id = $1`,
      [staffId, novoHash]
    );
    const revogadas = await client.query('DELETE FROM staff_sessoes WHERE staff_id = $1', [staffId]);
    await registrarEventoCredencial(client, {
      staffId,
      login: row.login,
      evento: 'senha_alterada',
      sessoesRevogadas: revogadas.rowCount,
    });
    await client.query('COMMIT');

    const token = await criarSessao(staffId);
    return { token, csrfToken: csrfTokenParaSessao(token), sessoesRevogadas: revogadas.rowCount };
  } catch (e) {
    if (!rejeicao) await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

function homeDoPapel(papel) {
  return HOME_POR_PAPEL[papel] || '/admin';
}

// Limpa sessões expiradas de tempos em tempos
setInterval(() => {
  pool
    .query('DELETE FROM staff_sessoes WHERE expira_em < now()')
    .catch(() => {});
}, 30 * 60 * 1000).unref();

module.exports = {
  ErroAuth,
  SESSION_COOKIE,
  PAPEIS,
  parseCookies,
  cookieDeSessao,
  cookieDeLogout,
  hashSenha,
  verificarSenha,
  autenticar,
  criarSessao,
  destruirSessao,
  getStaffDaRequisicao,
  estaAutenticado,
  exigirAcesso,
  exigirSessao,
  trocarSenha,
  redefinirSenhaStaff,
  listarContasStaff,
  validarPoliticaSenha,
  trocaObrigatoriaAtiva,
  exigeTrocaDeSenha,
  CODIGO_TROCA_OBRIGATORIA,
  CODIGO_CSRF_INVALIDO,
  papelPodeAcessar,
  homeDoPapel,
  garantirStaffSeed,
  contarStaff,
  verificarOrigemRequisicao,
  csrfTokenParaSessao,
  verificarProtecaoCSRF,
};
