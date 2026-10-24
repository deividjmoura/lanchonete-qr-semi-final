require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');

function migrationFailure(result) {
  if (result.error) {
    return `Não foi possível executar migrations: ${result.error.message || result.error}`;
  }
  if (result.status !== 0) {
    const detail = result.signal
      ? `sinal ${result.signal}`
      : `exit ${result.status ?? '?'}`;
    return `Migrations falharam (${detail}). O servidor não será iniciado.`;
  }
  return null;
}

function startProduction() {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'db', 'migrate.js')],
    {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: 'inherit',
      env: process.env,
    }
  );

  const failure = migrationFailure(result);
  if (failure) {
    console.error(`❌ ${failure}`);
    process.exitCode = 1;
    return false;
  }

  console.log('✅ Migrations verificadas. Iniciando servidor de produção...');
  require('../server.js');
  return true;
}

if (require.main === module) {
  startProduction();
}

module.exports = { migrationFailure, startProduction };
