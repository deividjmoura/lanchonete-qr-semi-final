import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
// @ts-expect-error -- módulo CommonJS sem tipos; a fonte da fórmula é única (lib/).
import { ARQUIVO_VERSAO, calcularVersaoDoShell } from "./lib/build-version.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Identificador de build publicado (#301) — ver `lib/build-version.js`.
 *
 * É um hash do CONTEÚDO do shell estático (fontes do SPA + index.html), não do
 * SHA do commit nem de `Date.now()`. Consequências que importam:
 *
 *  - duas máquinas que compilam a mesma árvore chegam ao MESMO identificador,
 *    então o valor commitado em `dist/` continua válido em produção (o deploy
 *    serve o `dist/` do repositório, não recompila);
 *  - um deploy que só muda servidor/migrations não muda o shell do navegador e
 *    portanto NÃO gera aviso de atualização — não há bundle novo para buscar;
 *  - qualquer mudança em `src/` ou no `index.html` muda o identificador, e a
 *    aba antiga percebe a diferença na comparação com o próprio bundle.
 *
 * O servidor usa exatamente a mesma função; se as duas divergirem, o aviso ou
 * nunca aparece ou aparece para sempre — por isso a fórmula mora em `lib/`.
 */
const BUILD_VERSION: string = calcularVersaoDoShell(__dirname);

function pluginVersaoBuild(): Plugin {
  return {
    name: "qr-admin-build-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: ARQUIVO_VERSAO,
        source: JSON.stringify({ version: BUILD_VERSION }) + "\n",
      });
    },
  };
}

export default defineConfig({
  define: {
    // Mesmo valor que o servidor publica em /api/version (dist/build-version.json).
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  plugins: [react(), tailwindcss(), pluginVersaoBuild()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    /* db/pix-normaliza.js é CommonJS compartilhado com o server.js. O plugin
       commonjs do Rollup só olha node_modules por padrão; sem incluí-lo aqui o
       import nomeado no front quebra no build. */
    commonjsOptions: {
      include: [/node_modules/, /db[\\/]pix-normaliza\.js$/],
    },
    /* separa vendors grandes — evita bundle único > 500 kB */
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          motion: ["framer-motion"],
          icons: ["@phosphor-icons/react"],
        },
      },
    },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
  preview: {
    allowedHosts: true,
  },
});
