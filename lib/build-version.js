'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Identificadores de versão publicados (#301).
 *
 * Fonte única: o build grava `dist/build-version.json` e injeta o MESMO valor
 * em `__BUILD_VERSION__` no bundle. O servidor lê o arquivo para responder
 * `/api/version`; o navegador compara com o valor embutido no código que está
 * executando.
 *
 * Existem DUAS superfícies independentes, cada uma com o seu identificador:
 *
 *  - **`version`** — o SPA React (`src/**` + `index.html`): painel, login,
 *    cardápio do cliente. É o valor de `__BUILD_VERSION__`;
 *  - **`pwa`** — o aplicativo do garçom (`public/garcom-pwa/**`), que é código
 *    estático servido como está e não passa pelo Vite. É o valor de
 *    `public/garcom-pwa/versao.json`.
 *
 * Por que separar: cada cliente só pode avisar sobre o que ele próprio executa.
 * Se as duas superfícies dividissem um hash só, o garçom levaria aviso de deploy
 * que não mudou nada na tela dele — e o inverso também.
 *
 * Correção de 11/2026: antes, `public/` não entrava em conta nenhuma. Um deploy
 * que mexia APENAS no aplicativo do garçom mantinha `version` idêntica, então
 * `/api/version` respondia o mesmo valor que a aba já tinha e nenhum aviso de
 * atualização aparecia. A superfície `pwa` fecha esse buraco.
 *
 * Os identificadores são hashes de CONTEÚDO, não do SHA do commit:
 *
 *  - build reproduzível entre máquinas diferentes;
 *  - deploy que só muda servidor/migrations não gera aviso (o navegador não
 *    recebe arquivo novo);
 *  - mudança em qualquer arquivo da superfície gera identificador novo.
 */

const ARQUIVO_VERSAO = 'build-version.json';
const FORMATO_VERSAO = /^[a-f0-9]{16}$/;

/**
 * Manifests gerados pelo build/script. Ficam FORA do hash: são saída do
 * cálculo, não entrada. Sem esta exclusão, `versao.json` do PWA mudaria o
 * próprio hash a cada gravação (referência circular: nunca estabilizaria).
 */
const ARQUIVOS_GERADOS = new Set([
  'public/garcom-pwa/versao.json',
  'public/garcom-pwa/novidades.json',
]);

function ehArquivoGerado(relativo) {
  return ARQUIVOS_GERADOS.has(relativo);
}

/** Ordem estável: o hash não pode depender da ordem de leitura do diretório. */
function ordenar(saida) {
  return saida.sort();
}

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
  return ordenar(saida);
}

/**
 * Arquivos que compõem o aplicativo do garçom: tudo o que é servido de
 * `public/garcom-pwa/`, menos os manifests gerados.
 */
function arquivosDoPwa(raiz) {
  const base = path.join(raiz, 'public', 'garcom-pwa');
  const saida = [];
  if (!fs.existsSync(base)) return saida;
  const visitar = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      const relativo = path.relative(raiz, completo).split(path.sep).join('/');
      if (entrada.isDirectory()) visitar(completo);
      else if (!ehArquivoGerado(relativo)) saida.push(completo);
    }
  };
  visitar(base);
  return ordenar(saida);
}

function hashDe(raiz, arquivos, extras = []) {
  const hash = crypto.createHash('sha256');
  for (const arquivo of arquivos) {
    const relativo = path.relative(raiz, arquivo).split(path.sep).join('/');
    hash.update(relativo);
    hash.update('\0');
    hash.update(fs.readFileSync(arquivo));
    hash.update('\0');
  }
  for (const extra of extras) {
    hash.update(extra);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * O changelog é um recurso publicado fora de src/ e também faz parte das duas
 * superfícies: o painel o busca em /novidades.json e o PWA em
 * /garcom-pwa/novidades.json. Se ele mudar, ambas precisam detectar a entrega.
 * O arquivo copiado para o PWA é gerado e fica fora do hash; usamos a fonte.
 */
function extrasDoChangelog(raiz) {
  const arquivo = path.join(raiz, 'public', 'novidades.json');
  if (!fs.existsSync(arquivo)) return [];
  return ['public/novidades.json', fs.readFileSync(arquivo)];
}

/** Identificador do SPA (painel, login, cardápio e changelog). */
function calcularVersaoDoShell(raiz) {
  return hashDe(raiz, arquivosDoShell(raiz), extrasDoChangelog(raiz));
}

/** Identificador do aplicativo do garçom (`public/garcom-pwa/` + changelog). */
function calcularVersaoDoPwa(raiz) {
  return hashDe(raiz, arquivosDoPwa(raiz), extrasDoChangelog(raiz));
}

/**
 * Versão legível da entrega (`package.json`), a mesma que aparece nas notas de
 * versão. É texto público; nunca identificou instalação nem usuário.
 */
function versaoLegivel(raiz) {
  try {
    const dados = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
    return typeof dados.version === 'string' && /^\d+\.\d+\.\d+/.test(dados.version)
      ? dados.version
      : null;
  } catch (_) {
    return null;
  }
}

/** Identificadores que o deploy publica hoje, calculados da árvore atual. */
function calcularVersoesPublicadas(raiz) {
  return {
    version: calcularVersaoDoShell(raiz),
    pwa: calcularVersaoDoPwa(raiz),
    versao: versaoLegivel(raiz),
  };
}

/**
 * Lê o identificador gerado pelo mesmo build que injeta __BUILD_VERSION__ no
 * bundle do navegador. Arquivo ausente, JSON inválido ou valor fora do formato
 * devolvem `null`: o endpoint responde 503 e o cliente simplesmente não avisa.
 */
function obterVersaoBuild(versionPath) {
  const registro = obterVersoesPublicadas(versionPath);
  return registro ? registro.version : null;
}

/**
 * Registro completo publicado no disco (`{version, pwa, versao}`).
 *
 * `pwa` e `versao` são opcionais: um manifesto antigo (só `version`) continua
 * válido — o cliente simplesmente não recebe identificador daquela superfície e
 * não avisa sobre ela. Isso evita transformar um deploy parcial em tela quebrada.
 */
function obterVersoesPublicadas(versionPath) {
  try {
    const dados = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    if (typeof dados.version !== 'string' || !FORMATO_VERSAO.test(dados.version)) return null;
    const pwa = typeof dados.pwa === 'string' && FORMATO_VERSAO.test(dados.pwa) ? dados.pwa : null;
    const versao =
      typeof dados.versao === 'string' && /^\d+\.\d+\.\d+/.test(dados.versao) ? dados.versao : null;
    return { version: dados.version, pwa, versao };
  } catch (_) {
    return null;
  }
}

module.exports = {
  ARQUIVO_VERSAO,
  FORMATO_VERSAO,
  calcularVersaoDoShell,
  calcularVersaoDoPwa,
  calcularVersoesPublicadas,
  obterVersaoBuild,
  obterVersoesPublicadas,
  versaoLegivel,
  _arquivosDoShell: arquivosDoShell,
  _arquivosDoPwa: arquivosDoPwa,
};
