'use strict';

/**
 * `server.js` serve o SPA a partir de `dist/` **se ele existir**; quando não
 * existe, cai silenciosamente nos HTML legados de `public/`. Essa queda foi
 * aceitável enquanto o `dist/` era versionado — ele sempre estava lá.
 *
 * A partir da limpeza de 13/11/2026 o `dist/` deixou de ser versionado (só o
 * bundle com hash e o shell do garçom continuam, porque o `vite preview` dos
 * E2E e `verificar-cardapio-intacto.mjs` servem o diretório como raiz). Um
 * deploy que esqueça de rodar o build passaria a servir a interface ANTIGA
 * com HTTP 200 — nada nos logs, nada no health check, ninguém percebe.
 *
 * Este módulo fecha esse buraco: em produção, a ausência do build é erro de
 * inicialização. O servidor recusa subir em vez de servir a tela errada.
 *
 * Por que só em `NODE_ENV=production`:
 *
 *  - as suítes de integração (`tests/postgres-*.test.cjs`, que sobem o
 *    `server.js` real) exercitam rotas de API e não precisam do SPA — a
 *    suíte roda com `NODE_ENV=test` e a degradação continua permitida;
 *  - desenvolvimento e `npm run dev` usam o Vite, sem build prévio;
 *  - em produção não existe usabilidade que justifique a interface errada:
 *    é melhor não servir nada do que servir o sistema velho.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Arquivo cuja ausência significa "não há build". */
const ENTRADA_DO_SPA = path.join('dist', 'index.html');

/**
 * @param {{ root?: string, env?: NodeJS.ProcessEnv }} [opcoes]
 * @returns {boolean} `true` quando é seguro seguir (a build existe, ou o
 *   ambiente tolera não existir).
 */
function exigirBuildDoFrontend({ root = path.join(__dirname, '..'), env = process.env } = {}) {
  const entrada = path.join(root, ENTRADA_DO_SPA);
  if (fs.existsSync(entrada)) return true;

  if (env.NODE_ENV !== 'production') return true;

  console.error(
    '❌ Build do frontend ausente: dist/index.html não existe.\n' +
      '   Em produção o servidor serve o SPA a partir de dist/. Sem ele, o\n' +
      '   fallback entregaria as páginas legadas de public/ — a interface\n' +
      '   antiga — com HTTP 200, sem erro visível.\n' +
      '   Rode `npm ci && npm run build` no deploy (Build Command) antes de\n' +
      '   iniciar, ou defina FRONTEND_BUILD_REQUIRED=0 para aceitar a\n' +
      '   degradação conscientemente.',
  );
  return false;
}

module.exports = { exigirBuildDoFrontend, ENTRADA_DO_SPA };
