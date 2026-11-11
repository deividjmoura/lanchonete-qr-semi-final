'use strict';

const fs = require('node:fs');

/**
 * Lê o identificador gerado pelo mesmo build que injeta __BUILD_VERSION__
 * no bundle do navegador. O servidor e o cliente comparam, portanto, a
 * mesma versão mesmo quando a primeira consulta ocorre após um deploy.
 */
function obterVersaoBuild(versionPath) {
  try {
    const dados = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    return typeof dados.version === 'string' && /^[a-f0-9]{16}$/.test(dados.version)
      ? dados.version
      : null;
  } catch (_) {
    return null;
  }
}

module.exports = { obterVersaoBuild };
