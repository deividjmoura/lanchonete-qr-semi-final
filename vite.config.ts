import path from "path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Railway/GitHub fornecem SHA estável por deploy. O fallback também cria um
// identificador novo a cada build local, sem expor o valor original ao cliente.
const origemVersao = process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.SOURCE_VERSION ||
  `local-${Date.now()}-${process.pid}`;
const BUILD_VERSION = createHash("sha256").update(origemVersao).digest("hex").slice(0, 16);

function pluginVersaoBuild(): Plugin {
  return {
    name: "qr-admin-build-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-version.json",
        source: JSON.stringify({ version: BUILD_VERSION }),
      });
    },
  };
}

export default defineConfig({
  define: {
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
