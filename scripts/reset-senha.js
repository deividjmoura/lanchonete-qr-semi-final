#!/usr/bin/env node
/**
 * Redefine a senha dos logins de staff legados para STAFF_SEED_PASSWORD.
 *
 * Uso:
 *   STAFF_SEED_PASSWORD='senha-forte-temporaria' node scripts/reset-senha.js
 *
 * A senha nunca deve ser impressa em logs nem embutida em comandos de teste.
 */
require('dotenv').config();

async function main() {
  const senha = process.env.STAFF_SEED_PASSWORD || process.env.ADMIN_PASSWORD;
  if (typeof senha !== 'string' || senha.length < 12) {
    console.error('Defina STAFF_SEED_PASSWORD (preferencial) ou ADMIN_PASSWORD com pelo menos 12 caracteres.');
    process.exitCode = 1;
    return;
  }

  const { hashSenha, garantirStaffSeed } = require('../db/auth');
  const pool = require('../db/pool');

  try {
    const seed = await garantirStaffSeed();
    if (seed.created) {
      console.log('Staff criado agora (estava vazio).');
    }

    const hash = await hashSenha(senha);
    const { rows } = await pool.query(
      `UPDATE staff
       SET senha_hash = $1, ativo = true, deve_trocar_senha = true
       WHERE lower(login) IN ('admin', 'cozinha', 'bar', 'caixa')
       RETURNING login, papel, ativo`,
      [hash]
    );

    if (!rows.length) {
      console.error('Nenhum usuário admin/cozinha/bar/caixa encontrado na tabela staff.');
      process.exitCode = 1;
      return;
    }

    console.log('Senha atualizada com sucesso para os logins legados:');
    for (const u of rows) {
      console.log(`  · ${u.login} (${u.papel}) ativo=${u.ativo}`);
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    // Do not print arbitrary error objects that could contain query parameters/secrets.
    console.error('Falha ao redefinir a senha de staff.');
    process.exitCode = 1;
  });
}

module.exports = { main };
