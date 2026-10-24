require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');

const MIGRATION_TIMEOUT_MS = 30_000;

/**
 * Fail closed: the HTTP server must not receive traffic when migrations fail,
 * time out, or cannot be started. Keep the migration step isolated so CI can
 * exercise failure paths without importing server.js or connecting to a DB.
 */
function runProductionStartup({
  spawn = spawnSync,
  startServer = () => require('../server.js'),
  env = process.env,
  logger = console,
} = {}) {
  const result = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'db', 'migrate.js')],
    {
      encoding: 'utf8',
      timeout: MIGRATION_TIMEOUT_MS,
      stdio: 'inherit',
      env,
    }
  );

  if (result.error || result.status !== 0) {
    const timedOut = result.error?.code === 'ETIMEDOUT';
    const reason = timedOut
      ? 'tempo limite excedido'
      : result.error
        ? 'não foi possível executar o runner'
        : `runner terminou com status ${result.status ?? 'indisponível'}`;
    logger.error(`Falha no gate de migrations: ${reason}. Servidor não será iniciado.`);
    return false;
  }

  logger.log('Migrations verificadas. Iniciando servidor de produção...');
  startServer();
  return true;
}

if (require.main === module && !runProductionStartup()) {
  process.exitCode = 1;
}

module.exports = { runProductionStartup, MIGRATION_TIMEOUT_MS };
