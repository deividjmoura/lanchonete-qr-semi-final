#!/usr/bin/env node
'use strict';

/**
 * Gera os arquivos de versão do aplicativo do garçom (#301).
 *
 * O PWA do garçom é código estático (`public/garcom-pwa/`), servido como está e
 * sem passar pelo Vite. Ele precisa saber duas coisas que o build do SPA calcula:
 *
 *   - `public/garcom-pwa/versao.json`   → identificador do próprio PWA, para
 *     comparar com `GET /api/version` (campo `pwa`) e avisar sobre atualização;
 *   - `public/garcom-pwa/novidades.json` → as MESMAS notas de versão do painel,
 *     copiadas de `public/novidades.json` (fonte única).
 *
 * A versão legível (`versao`) sai de `package.json` e é a mesma da nota mais
 * recente do changelog. O app.js do garçom mantém essa versão embutida e o
 * gerador valida a igualdade: uma aba antiga compara sua versão em execução
 * com a versão publicada pela API, mesmo quando o service worker não muda.
 *
 * Roda em dois momentos:
 *   - `npm run build:versoes` (manual, depois de mexer em `public/garcom-pwa/`);
 *   - `vite build` (plugin `qr-admin-build-version`, para o `dist/` nunca sair
 *     com manifesto velho).
 *
 * `dist/garcom-pwa/` é uma cópia de `public/garcom-pwa/`; este script também
 * sincroniza a cópia, porque `npm run build` não copia `public/` para `dist/`.
 *
 * Uso:
 *   node scripts/gerar-versoes.cjs           # grava e sincroniza
 *   node scripts/gerar-versoes.cjs --check   # só confere (testes)
 */

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const { calcularVersaoDoPwa, versaoLegivel } = require('../lib/build-version');

const DIR_PUBLIC = path.join(RAIZ, 'public', 'garcom-pwa');
const DIR_DIST = path.join(RAIZ, 'dist', 'garcom-pwa');
const ARQ_VERSAO = path.join(DIR_PUBLIC, 'versao.json');
const ARQ_NOVIDADES = path.join(DIR_PUBLIC, 'novidades.json');
const FONTE_NOVIDADES = path.join(RAIZ, 'public', 'novidades.json');

const SEMVER = /^\d+\.\d+\.\d+$/;

/** Nomes de cache do service worker — precisam subir quando o shell muda. */
function lerCacheDoServiceWorker() {
  const sw = fs.readFileSync(path.join(DIR_PUBLIC, 'sw.js'), 'utf8');
  const m = /const CACHE='(garcom-pwa-shell-v(\d+))'/.exec(sw);
  return m ? { nome: m[1], numero: Number(m[2]) } : null;
}

/**
 * Versão legível que o shell do garçom carrega.
 *
 * É a versão de `package.json`, a mesma da nota mais recente do changelog (ver
 * validação abaixo). Não derivamos do nome do cache do service worker nem da
 * data: dois deles mudam por motivos que não são entrega para o operador.
 */
function versaoDoPwa() {
  return versaoLegivel(RAIZ);
}

function conteudoDeVersao() {
  return (
    JSON.stringify(
      {
        pwa: calcularVersaoDoPwa(RAIZ),
        versao: versaoDoPwa(),
        cache: lerCacheDoServiceWorker()?.nome || null,
      },
      null,
      0,
    ) + '\n'
  );
}

/** Valida o changelog: formato, ordem, e se alguma nota moveu a versão do PWA. */
function validarNovidades() {
  const problemas = [];
  let dados;
  try {
    dados = JSON.parse(fs.readFileSync(FONTE_NOVIDADES, 'utf8'));
  } catch (erro) {
    return [`public/novidades.json ilegível: ${erro.message}`];
  }
  const notas = Array.isArray(dados.notas) ? dados.notas : null;
  if (!notas) return ['public/novidades.json precisa de um array "notas"'];
  if (!notas.length) problemas.push('public/novidades.json está vazio: registre ao menos uma nota');

  const doPacote = versaoLegivel(RAIZ);
  const appPwa = fs.readFileSync(path.join(DIR_PUBLIC, 'app.js'), 'utf8');
  const versaoEmbutida = /const VERSAO_PWA_EM_EXECUCAO = ['"]([^'"]+)['"]/.exec(appPwa)?.[1] || null;
  if (doPacote && versaoEmbutida !== doPacote) {
    problemas.push(
      `public/garcom-pwa/app.js está em ${versaoEmbutida || 'sem versão'} e package.json está em ${doPacote}: ` +
        'atualize VERSAO_PWA_EM_EXECUCAO para que o garçom detecte a próxima publicação',
    );
  }
  const vistos = new Set();
  let anterior = null;
  notas.forEach((nota, indice) => {
    const onde = `public/novidades.json › notas[${indice}]`;
    if (!SEMVER.test(String(nota.versao))) {
      problemas.push(`${onde}: "versao" precisa ser semver (x.y.z), achei ${JSON.stringify(nota.versao)}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(nota.data))) {
      problemas.push(`${onde}: "data" precisa ser AAAA-MM-DD`);
    }
    for (const campo of ['titulo', 'resumo']) {
      if (typeof nota[campo] !== 'string' || !nota[campo].trim()) {
        problemas.push(`${onde}: "${campo}" é obrigatório`);
      }
    }
    if (nota.itens !== undefined && !Array.isArray(nota.itens)) {
      problemas.push(`${onde}: "itens" precisa ser uma lista`);
    }
    for (const item of nota.itens || []) {
      if (typeof item !== 'string' || !item.trim()) problemas.push(`${onde}: item vazio`);
    }
    if (vistos.has(nota.versao)) problemas.push(`${onde}: versão ${nota.versao} repetida`);
    vistos.add(nota.versao);
    if (anterior !== null && !(anterior > nota.versao)) {
      problemas.push(`${onde}: a ordem precisa ser da mais nova para a mais antiga (${nota.versao})`);
    }
    anterior = nota.versao;
    if (doPacote && SEMVER.test(nota.versao) && nota.versao > doPacote) {
      problemas.push(`${onde}: cita ${nota.versao}, mais nova que a versão do package.json (${doPacote})`);
    }
  });

  /* A versão do shell do garçom é a de `package.json`; a nota mais recente
     precisa ser dela, senão o PWA calcula as novidades a partir de uma versão
     que não é a que está na tela. Subiu a versão do pacote = registre a nota. */
  if (doPacote && notas.length && notas[0].versao !== doPacote) {
    problemas.push(
      `a nota mais recente é ${notas[0].versao}, mas package.json está em ${doPacote}: ` +
        'suba a versão do pacote e registre a nota na mesma entrega',
    );
  }

  return problemas;
}

function escrever(arquivo, conteudo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const atual = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : null;
  if (atual === conteudo) return false;
  fs.writeFileSync(arquivo, conteudo);
  return true;
}

/** `dist/garcom-pwa/` é cópia fiel de `public/garcom-pwa/`. */
function sincronizarDist() {
  if (!fs.existsSync(DIR_DIST)) return [];
  const copiados = [];
  const visitar = (origem, destino) => {
    fs.mkdirSync(destino, { recursive: true });
    for (const entrada of fs.readdirSync(origem, { withFileTypes: true })) {
      const de = path.join(origem, entrada.name);
      const para = path.join(destino, entrada.name);
      if (entrada.isDirectory()) {
        visitar(de, para);
        continue;
      }
      const conteudo = fs.readFileSync(de);
      if (fs.existsSync(para) && fs.readFileSync(para).equals(conteudo)) continue;
      fs.writeFileSync(para, conteudo);
      copiados.push(path.relative(RAIZ, para).split(path.sep).join('/'));
    }
  };
  visitar(DIR_PUBLIC, DIR_DIST);
  return copiados;
}

function main(argv = process.argv.slice(2)) {
  const conferir = argv.includes('--check');

  if (conferir) {
    const problemas = validarNovidades();
    const versao = conteudoDeVersao();
    const novidades = fs.readFileSync(FONTE_NOVIDADES, 'utf8');
    const divergencias = [];
    for (const [arquivo, esperado] of [
      [ARQ_VERSAO, versao],
      [ARQ_NOVIDADES, novidades],
    ]) {
      const atual = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : null;
      if (atual !== esperado) divergencias.push(path.relative(RAIZ, arquivo).split(path.sep).join('/'));
    }
    if (divergencias.length) {
      console.error('❌ Desatualizados: ' + divergencias.join(', ') + '\n   Rode `npm run build:versoes`.');
    }
    if (problemas.length) {
      console.error('❌ Notas de versão inválidas:');
      for (const problema of problemas) console.error('   - ' + problema);
    }
    return divergencias.length || problemas.length ? 1 : 0;
  }

  const problemas = validarNovidades();
  if (problemas.length) {
    console.error('❌ Notas de versão inválidas:');
    for (const problema of problemas) console.error('   - ' + problema);
    // No build, changelog inválido não pode derrubar o deploy do sistema: o
    // aviso aparece sem a lista de novidades, o painel continua funcionando.
    console.error('   (seguindo: o aviso aparecerá sem a lista de novidades)');
  }

  const versao = conteudoDeVersao();
  const novidades = fs.readFileSync(FONTE_NOVIDADES, 'utf8');
  const mudou = [escrever(ARQ_VERSAO, versao), escrever(ARQ_NOVIDADES, novidades)];
  const copiados = sincronizarDist();
  if (mudou[0]) console.log('✔ public/garcom-pwa/versao.json');
  if (mudou[1]) console.log('✔ public/garcom-pwa/novidades.json');
  if (copiados.length) console.log(`✔ ${copiados.length} arquivo(s) sincronizado(s) em dist/garcom-pwa/`);
  if (!mudou[0] && !mudou[1] && !copiados.length) console.log('Nada a atualizar: versões já em dia.');
  return problemas.length ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  main,
  validarNovidades,
  conteudoDeVersao,
  versaoDoPwa,
  sincronizarDist,
  ARQ_VERSAO,
  ARQ_NOVIDADES,
};
