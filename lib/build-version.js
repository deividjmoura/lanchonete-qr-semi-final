'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

/**
 * Identificador público e não sensível do build ativo.
 * O HTML compilado contém os nomes hash dos assets do Vite; seu digest muda
 * quando o build publicado muda, sem expor SHA do Git ou variáveis de ambiente.
 */
function obterVersaoBuild(indexPath) {
  try {
    const html = fs.readFileSync(indexPath);
    return crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);
  } catch (_) {
    return null;
  }
}

module.exports = { obterVersaoBuild };
