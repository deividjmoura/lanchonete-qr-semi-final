'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Identificador de versão/build publicado (#301).
 *
 * Fonte única: o build do Vite grava `dist/build-version.json` e injeta o
 * MESMO valor em `__BUILD_VERSION__` no bundle. O servidor lê o arquivo para
 * responder `/api/version`; o navegador compara com a versão embutida no
 * código que está executando.
 *
 * O identificador é um hash do conteúdo do shell estático (arquivos de `src/`
 * + `index.html`), e não do SHA do commit. Assim:
 *
 *  - build reproduzível entre máquinas diferentes;
 *  - deploy que só muda servidor/migrations não gera aviso (não há bundle novo);
 *  - mudança em qualquer fonte do SPA gera identificador novo.
 */

const ARQUIVO_VERSAO = 'build-version.json';
const FORMATO_VERSAO = /^[a-f0-9]{16}$/;

/** Arquivos que compõem o shell React do navegador. */
function arquivosDoShell(raiz) {
  const saida = [];
  const visitar = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) visitar(completo);
      else if (/\.(tsx?|css)$/.test(entrada.name)) saida.push(completo);
    }
  };
  visitar(path.join(raiz, 'src'));
  saida.push(path.join(raiz, 'index.html'));
  // Ordem estável: o hash não pode depender da ordem de leitura do diretório.
  return saida.sort();
}

/** Calcula o identificador a partir da árvore de fontes do SPA. */
function calcularVersaoDoShell(raiz) {
  const hash = crypto.createHash('sha256');
  for (const arquivo of arquivosDoShell(raiz)) {
    const relativo = path.relative(raiz, arquivo).split(path.sep).join('/');
    hash.update(relativo);
    hash.update('\0');
    hash.update(fs.readFileSync(arquivo));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Lê o identificador gerado pelo mesmo build que injeta __BUILD_VERSION__ no
 * bundle do navegador. Arquivo ausente, JSON inválido ou valor fora do formato
 * devolvem `null`: o endpoint responde 503 e o cliente simplesmente não avisa.
 */
function obterVersaoBuild(versionPath) {
  try {
    const dados = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    return typeof dados.version === 'string' && FORMATO_VERSAO.test(dados.version)
      ? dados.version
      : null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  ARQUIVO_VERSAO,
  FORMATO_VERSAO,
  calcularVersaoDoShell,
  obterVersaoBuild,
  _arquivosDoShell: arquivosDoShell,
};
