#!/usr/bin/env node
/**
 * Redefine a senha de admin / cozinha / caixa para o valor de STAFF_SEED_PASSWORD.
 *
 * Uso:
 *   STAFF_SEED_PASSWORD='senha-forte' node scripts/reset-senha.js
 *   ADMIN_PASSWORD='senha-forte' node scripts/reset-senha.js
 *
 * Por segurança, o script nunca imprime a senha nem gera um comando curl contendo-a.
 */
require('dotenv').config();
const { hashSenha, garantirStaffSeed } = require('../db/auth');
const pool = require('../db/pool');

function resolveResetPassword(env = process.env) {
  const senha = env.STAFF_SEED_PASSWORD || env.ADMIN_PASSWORD;
  if (!senha || senha === 'troque-esta-senha') {
    throw new Error('Defina STAFF_SEED_PASSWORD (preferencial) ou ADMIN_PASSWORD com uma senha forte antes de executar este script.');
  }
  return senha;
}

async function main() {
  const senha = resolveResetPassword();

  // Garante que os 3 usuários existam (idempotente)
  const seed = await garantirStaffSeed();
  if (seed.created) {
    console.log('Staff criado agora (estava vazio).');
  }

  const hash = await hashSenha(senha);
  const { rows } = await pool.query(
    `UPDATE staff
     SET senha_hash = $1, ativo = true
     WHERE lower(login) IN ('admin', 'cozinha', 'caixa')
     RETURNING login, papel, ativo`,
    [hash]
  );

  if (!rows.length) {
    throw new Error('Nenhum usuário admin/cozinha/caixa encontrado na tabela staff.');
  }

  console.log('Senha atualizada para as contas de staff solicitadas. O segredo não será exibido.');
  for (const u of rows) {
    console.log(`  · ${u.login} (${u.papel}) ativo=${u.ativo}`);
  }
  console.log('\nPara validar, use o fluxo normal de login local sem colocar a senha em argumentos de terminal ou logs.');
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e.message || 'Falha ao redefinir senha.');
      process.exitCode = 1;
    })
    .finally(() => pool.end().catch(() => {}));
}

module.exports = { resolveResetPassword };
