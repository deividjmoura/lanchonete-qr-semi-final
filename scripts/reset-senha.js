#!/usr/bin/env node
/**
 * Redefine a senha de logins de staff para STAFF_SEED_PASSWORD e exige troca no próximo acesso.
 *
 * Uso:
 *   # os 4 logins legados (admin, cozinha, bar, caixa)
 *   STAFF_SEED_PASSWORD='senha-forte-temporaria' node scripts/reset-senha.js
 *
 *   # somente um login (não toca nos demais)
 *   STAFF_SEED_PASSWORD='senha-forte-temporaria' node scripts/reset-senha.js --login=caixa
 *
 * A senha nunca deve ser impressa em logs nem embutida em comandos de teste.
 */
require('dotenv').config();

const LOGIN_VALIDO = /^[a-z0-9._-]{1,64}$/i;

/** Lê --login=<nome> ou --login <nome>. Retorna { login } ou { erro }. */
function lerLogin(argv) {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    let valor;
    if (a === '--login') {
      valor = args[i + 1];
    } else if (a.startsWith('--login=')) {
      valor = a.slice('--login='.length);
    } else {
      continue;
    }
    if (typeof valor !== 'string' || !LOGIN_VALIDO.test(valor)) {
      return { erro: 'Login inválido. Use --login=<nome> com letras, números, ponto, hífen ou sublinhado.' };
    }
    return { login: valor.toLowerCase() };
  }
  return { login: null };
}

async function main(argv = process.argv) {
  const alvo = lerLogin(argv);
  if (alvo.erro) {
    console.error(alvo.erro);
    process.exitCode = 1;
    return;
  }

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
    const { rows } = alvo.login
      ? await pool.query(
        `UPDATE staff
         SET senha_hash = $1, deve_trocar_senha = true
         WHERE lower(login) = $2
         RETURNING login, papel, ativo`,
        [hash, alvo.login]
      )
      : await pool.query(
        `UPDATE staff
         SET senha_hash = $1, deve_trocar_senha = true
         WHERE lower(login) IN ('admin', 'cozinha', 'bar', 'caixa')
         RETURNING login, papel, ativo`,
        [hash]
      );

    if (!rows.length) {
      console.error(alvo.login
        ? `Login "${alvo.login}" não encontrado na tabela staff.`
        : 'Nenhum usuário admin/cozinha/bar/caixa encontrado na tabela staff.');
      process.exitCode = 1;
      return;
    }

    console.log(alvo.login
      ? 'Senha atualizada com sucesso para o login informado:'
      : 'Senha atualizada com sucesso para os logins legados:');
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

module.exports = { main, lerLogin };
