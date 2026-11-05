// Issue #55 — operações de 2FA que tocam o banco.
//
// Separado de `db/totp.js` (que é puro e testável com vetores RFC) para deixar
// explícito onde está a transação. Todas as funções devolvem apenas dados
// públicos: nenhuma devolve segredo, hash ou token.
const pool = require('./pool');
const totp = require('./totp');

/** 2FA é exigido no login? Só admin ativo com 2FA ativo. */
async function exigeSegundoFator(db, staffId) {
  const { rows } = await db.query(
    'SELECT papel, ativo, totp_ativo FROM staff WHERE id = $1',
    [staffId]
  );
  const row = rows[0];
  return Boolean(row && row.ativo && row.papel === 'admin' && row.totp_ativo);
}

/** Estado de 2FA para a tela: ativo? quantos códigos de recuperação restam? */
async function estadoTotp(db, staffId) {
  const { rows } = await db.query(
    `SELECT totp_ativo, totp_ativado_em,
            (SELECT COUNT(*)::int FROM staff_codigos_recuperacao c
              WHERE c.staff_id = s.id AND c.usado_em IS NULL) AS restantes
       FROM staff s WHERE s.id = $1`,
    [staffId]
  );
  const row = rows[0];
  if (!row) return { ativo: false, ativadoEm: null, codigosRestantes: 0 };
  return {
    ativo: Boolean(row.totp_ativo),
    ativadoEm: row.totp_ativado_em || null,
    codigosRestantes: Number(row.restantes || 0),
  };
}

async function registrarEventoCredencial(db, { staffId, evento, sessoesRevogadas = 0, atorStaffId = null }) {
  const { rows } = await db.query('SELECT login FROM staff WHERE id = $1', [staffId]);
  await db.query(
    `INSERT INTO staff_credencial_eventos (staff_id, login, evento, sessoes_revogadas, ator_staff_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [staffId, (rows[0] && rows[0].login) || '(removido)', evento, sessoesRevogadas, atorStaffId]
  );
}

/**
 * Ativa o 2FA: confere o código contra o segredo recém-gerado, grava o segredo
 * CIFRADO, liga o 2FA e emite os 10 códigos de recuperação — cujo texto em
 * claro é devolvido UMA vez (só o hash fica no banco).
 *
 * `tokenSessaoAtual` é poupado da revogação: quem acabou de ativar continua
 * logado (os outros dispositivos caem, como na troca de senha).
 */
async function ativarTotp(staffId, segredoBase32, codigo, { tokenSessaoAtual = null } = {}) {
  const passo = totp.passoDoCodigoValido(segredoBase32, codigo);
  if (passo === null) {
    throw new totp.ErroTotp(
      'Código inválido. Confira o relógio do aparelho e tente de novo.',
      400,
      'TOTP_CODIGO_INVALIDO'
    );
  }
  const cifrado = totp.cifrarSegredo(segredoBase32);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const alvo = await client.query(
      'SELECT id, papel, login FROM staff WHERE id = $1 AND ativo = TRUE FOR UPDATE',
      [staffId]
    );
    if (!alvo.rows[0]) throw new totp.ErroTotp('Conta não encontrada.', 404);
    if (alvo.rows[0].papel !== 'admin') {
      throw new totp.ErroTotp('2FA está disponível apenas para administradores.', 403);
    }

    // `totp_ultimo_passo` fica NULL: o código da ativação NÃO é um login, e o
    // primeiro login legítimo costuma cair no mesmo passo de 30 s. Gravá-lo
    // aqui trancaria a pessoa para fora até o passo virar.
    await client.query(
      `UPDATE staff
          SET totp_segredo = $2, totp_ativo = TRUE, totp_ativado_em = now(),
              totp_ultimo_passo = NULL
        WHERE id = $1`,
      [staffId, cifrado]
    );

    // Recriar o 2FA invalida os códigos antigos (não acumula validade).
    await client.query('DELETE FROM staff_codigos_recuperacao WHERE staff_id = $1', [staffId]);

    const codigos = [];
    for (let i = 0; i < totp.QTD_CODIGOS; i += 1) {
      const texto = totp.gerarCodigoRecuperacao();
      codigos.push(texto);
      await client.query(
        'INSERT INTO staff_codigos_recuperacao (staff_id, codigo_hash) VALUES ($1, $2)',
        [staffId, totp.hashCodigoRecuperacao(texto)]
      );
    }

    const revogadas = await client.query(
      `DELETE FROM staff_sessoes WHERE staff_id = $1 AND token_hash <> $2 AND token <> $3`,
      [staffId, hashToken(tokenSessaoAtual), tokenSessaoAtual || '\u0000']
    );

    await registrarEventoCredencial(client, {
      staffId,
      evento: 'totp_ativado',
      sessoesRevogadas: revogadas.rowCount,
    });
    await client.query('COMMIT');
    return { codigosRecuperacao: codigos, sessoesRevogadas: revogadas.rowCount };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Mesmo hash usado em db/auth.js para o token de sessão (sha256 hex).
function hashToken(token) {
  const crypto = require('node:crypto');
  if (!token) return '\u0000';
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Verifica o segundo fator no login: TOTP ou código de recuperação.
 * Marca o passo usado (anti-replay) e consome o código de recuperação.
 * Devolve `{ ok, via }` — nunca o segredo.
 */
async function verificarSegundoFator(staffId, codigo, agora = Date.now()) {
  const { rows } = await pool.query(
    'SELECT totp_segredo, totp_ativo, totp_ultimo_passo FROM staff WHERE id = $1',
    [staffId]
  );
  const row = rows[0];
  if (!row || !row.totp_ativo || !row.totp_segredo) {
    throw new totp.ErroTotp('2FA não está ativo nesta conta.', 400, 'TOTP_INATIVO');
  }

  const texto = String(codigo || '').trim();

  // 1) TOTP
  if (/^\d{6}$/.test(texto.replace(/\s+/g, ''))) {
    const segredo = totp.decifrarSegredo(row.totp_segredo);
    const passo = totp.passoDoCodigoValido(segredo, texto, agora);
    if (passo === null) {
      await registrarEventoCredencial(pool, { staffId, evento: 'totp_falhou' });
      return { ok: false, via: 'totp' };
    }
    const ultimo = row.totp_ultimo_passo == null ? null : Number(row.totp_ultimo_passo);
    if (ultimo !== null && passo <= ultimo) {
      // Código correto, mas de um passo já usado: replay.
      await registrarEventoCredencial(pool, { staffId, evento: 'totp_falhou' });
      return { ok: false, via: 'totp', motivo: 'reuso' };
    }
    const atualizado = await pool.query(
      `UPDATE staff SET totp_ultimo_passo = $2
        WHERE id = $1 AND (totp_ultimo_passo IS NULL OR totp_ultimo_passo < $2)`,
      [staffId, passo]
    );
    if (atualizado.rowCount === 0) {
      // Corrida: outra requisição consumiu o mesmo passo primeiro.
      await registrarEventoCredencial(pool, { staffId, evento: 'totp_falhou' });
      return { ok: false, via: 'totp', motivo: 'reuso' };
    }
    await registrarEventoCredencial(pool, { staffId, evento: 'totp_verificado' });
    return { ok: true, via: 'totp' };
  }

  // 2) Código de recuperação — uso único, consumido com UPDATE condicional.
  const consumo = await pool.query(
    `UPDATE staff_codigos_recuperacao
        SET usado_em = now()
      WHERE staff_id = $1 AND codigo_hash = $2 AND usado_em IS NULL
      RETURNING id`,
    [staffId, totp.hashCodigoRecuperacao(texto)]
  );
  if (consumo.rowCount === 0) {
    await registrarEventoCredencial(pool, { staffId, evento: 'totp_falhou' });
    return { ok: false, via: 'recuperacao' };
  }
  const restantes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM staff_codigos_recuperacao
      WHERE staff_id = $1 AND usado_em IS NULL`,
    [staffId]
  );
  // Revoga as sessões COMPLETAS (o código de recuperação existia para abrir uma
  // porta; usá-lo não deve manter os outros acessos vivos). A sessão PENDENTE
  // deste login é poupada — apagá-la agora invalidaria a própria entrada que
  // está sendo concluída.
  const revogadas = await pool.query(
    'DELETE FROM staff_sessoes WHERE staff_id = $1 AND mfa_pendente = FALSE',
    [staffId]
  );
  await registrarEventoCredencial(pool, {
    staffId,
    evento: 'codigo_recuperacao_usado',
    sessoesRevogadas: revogadas.rowCount,
  });
  return { ok: true, via: 'recuperacao', restantes: restantes.rows[0].n };
}

/**
 * Desativa o 2FA. Chamada pelo próprio admin (com o segundo fator válido, que
 * a rota já exigiu) ou por outro admin pela redefinição.
 */
async function desativarTotp(staffId, { atorStaffId = null, tokenSessaoAtual = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE staff
          SET totp_segredo = NULL, totp_ativo = FALSE, totp_ativado_em = NULL,
              totp_ultimo_passo = NULL
        WHERE id = $1 AND totp_ativo = TRUE`,
      [staffId]
    );
    if (rowCount === 0) {
      throw new totp.ErroTotp('2FA não estava ativo nesta conta.', 409, 'TOTP_INATIVO');
    }
    await client.query('DELETE FROM staff_codigos_recuperacao WHERE staff_id = $1', [staffId]);
    const revogadas = await client.query(
      `DELETE FROM staff_sessoes WHERE staff_id = $1 AND token_hash <> $2 AND token <> $3`,
      [staffId, hashToken(tokenSessaoAtual), tokenSessaoAtual || '\u0000']
    );
    await registrarEventoCredencial(client, {
      staffId,
      evento: 'totp_desativado',
      sessoesRevogadas: revogadas.rowCount,
      atorStaffId,
    });
    await client.query('COMMIT');
    return { desativado: true, sessoesRevogadas: revogadas.rowCount };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  exigeSegundoFator,
  estadoTotp,
  ativarTotp,
  verificarSegundoFator,
  desativarTotp,
};
