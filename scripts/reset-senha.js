#!/usr/bin/env node
/**
 * Redefine a senha das contas operacionais legadas.
 *
 * Requer STAFF_SEED_PASSWORD ou ADMIN_PASSWORD explicitamente.
 * Nunca imprime a senha nem monta comandos de teste que contenham credenciais.
 */
require('dotenv').config();

function resolvePassword(env = process.env) {
  const senha = env.STAFF_SEED_PASSWORD || env.ADMIN_PASSWORD;
  if (typeof senha !== 'string' || !senha.trim()) {
    throw new Error('Defina STAFF_SEED_PASSWORD ou ADMIN_PASSWORD explicitamente.');
  }
  return senha;
}

async function main(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;

  let senha;
  try {
    senha = resolvePassword(env);
  } catch (error) {
    logger.error(error.message);
    process.exitCode = 1;
    return false;
  }

  // Carrega acesso ao banco só depois de validar a configuração, para que uma
  // execução sem segredo explícito falhe antes de tocar no banco.
  const { hashSenha, garantirStaffSeed } = options.auth || require('../db/auth');
  const pool = options.pool || require('../db/pool');

  try {
    const seed = await garantirStaffSeed();
    if (seed.created) logger.log('Staff criado agora (estava vazio).');

    const hash = await hashSenha(senha);
    const { rows } = await pool.query(
      `UPDATE staff
       SET senha_hash = $1, ativo = true
       WHERE lower(login) IN ('admin', 'cozinha', 'caixa')
       RETURNING login, papel, ativo`,
      [hash]
    );

    if (!rows.length) {
      logger.error('Nenhum usuário admin/cozinha/caixa encontrado na tabela staff.');
      process.exitCode = 1;
      return false;
    }

    logger.log('Senha atualizada para as contas operacionais:');
    for (const user of rows) {
      logger.log(`  · ${user.login} (${user.papel}) ativo=${user.ativo}`);
    }
    logger.log('Não foi exibida a senha. Use o fluxo de login para validar a configuração.');
    return true;
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch(() => {
    // Não imprimir objetos de erro de banco/driver que possam incluir dados de conexão.
    console.error('Falha ao redefinir senha do staff. Verifique a conexão e os logs protegidos do banco.');
    process.exitCode = 1;
  });
}

module.exports = { resolvePassword, main };
