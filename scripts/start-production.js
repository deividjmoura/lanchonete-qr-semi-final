require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');

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

if (result.error) {
  console.error('❌ Não foi possível executar as migrations de produção:', result.error.message || result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`❌ Migrations de produção falharam (exit ${result.status ?? 'desconhecido'}).`);
  process.exit(result.status || 1);
}

console.log('✅ Migrations verificadas. Iniciando servidor de produção...');
require('../server.js');
