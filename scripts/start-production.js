require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');

/**
 * Fail closed: la aplicación no puede recibir tráfico si las migrations
 * fallaron, expiraron o no se pudieron iniciar. La recuperación de una falla
 * del banco debe ocurrir en la etapa de release/orquestación, no sirviendo una
 * versión potencialmente incompatible con el esquema.
 */
function startProduction({
  spawn = spawnSync,
  loadServer = () => require('../server.js'),
  logger = console,
  env = process.env,
} = {}) {
  const result = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'db', 'migrate.js')],
    {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: 'inherit',
      env,
    }
  );

  if (result.error || result.status !== 0) {
    if (result.error) {
      logger.error('❌ Não foi possível concluir migrations:', result.error.message || result.error);
    } else {
      logger.error(`❌ Migrations falharam (exit ${result.status ?? '?'}).`);
    }
    logger.error('Servidor NÃO iniciado. Corrija a falha de migration antes de liberar tráfego.');
    process.exitCode = 1;
    return false;
  }

  logger.log('✅ Migrations verificadas. Iniciando servidor de produção...');
  loadServer();
  return true;
}

if (require.main === module) {
  startProduction();
}

module.exports = { startProduction };
