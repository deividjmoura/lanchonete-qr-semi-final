import { spawnSync } from "node:child_process";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
// Módulo CommonJS da fórmula única, com tipos em `lib/build-version.d.ts`.
import {
  ARQUIVO_VERSAO,
  calcularVersaoDoPwa,
  calcularVersaoDoShell,
  versaoLegivel,
} from "./lib/build-version.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Identificadores de build publicados (#301) — ver `lib/build-version.js`.
 *
 * São hashes de CONTEÚDO das duas superfícies do navegador (SPA React e
 * aplicativo do garçom), não o SHA do commit nem `Date.now()`. Consequências
 * que importam:
 *
 *  - duas máquinas que compilam a mesma árvore chegam ao MESMO identificador,
 *    então o valor commitado em `dist/` continua válido em produção (o deploy
 *    serve o `dist/` do repositório, não recompila);
 *  - um deploy que só muda servidor/migrations não muda o que o navegador baixa
 *    e portanto NÃO gera aviso de atualização — não há arquivo novo para buscar;
 *  - qualquer mudança em `src/`, `index.html` ou `public/garcom-pwa/` muda o
 *    identificador daquela superfície.
 *
 * O servidor usa exatamente as mesmas funções; se divergirem, o aviso ou nunca
 * aparece ou aparece para sempre — por isso a fórmula mora em `lib/`.
 */
const BUILD_VERSION: string = calcularVersaoDoShell(__dirname);
const PWA_VERSION: string = calcularVersaoDoPwa(__dirname);
const APP_VERSION: string = versaoLegivel(__dirname) ?? "0.0.0";

function pluginVersaoBuild(): Plugin {
  return {
    name: "qr-admin-build-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: ARQUIVO_VERSAO,
        source:
          JSON.stringify({ version: BUILD_VERSION, pwa: PWA_VERSION, versao: APP_VERSION }) + "\n",
      });
    },
    /* O PWA do garçom não passa pelo bundler: ele lê o próprio identificador de
       `public/garcom-pwa/versao.json`. Gravar aqui garante que o `dist/` nunca
       saia com manifesto velho, mesmo em build de CI que não roda o script
       antes. `--check` só avisa: build nunca falha por causa do changelog. */
    buildStart() {
      const r = spawnSync(
        process.execPath,
        [path.join(__dirname, "scripts", "gerar-versoes.cjs")],
        { cwd: __dirname, encoding: "utf8" },
      );
      if (r.status !== 0) {
        this.warn(
          "Não foi possível gerar public/garcom-pwa/versao.json: " +
            String(r.stderr || r.error || "").trim(),
        );
      } else if (r.stderr) {
        this.warn(String(r.stderr).trim());
      }
    },
  };
}

export default defineConfig({
  define: {
    // Mesmo valor que o servidor publica em /api/version (dist/build-version.json).
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
    // Versão legível deste bundle (notas de versão e rodapé do aviso).
    __APP_VERSION__: JSON.stringify(APP_VERSION),
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
