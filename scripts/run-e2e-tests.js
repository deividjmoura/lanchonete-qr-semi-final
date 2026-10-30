#!/usr/bin/env node
'use strict';

/**
 * Roda os E2E em Chromium real.
 *
 *   DATABASE_URL=postgres://.../qradmin_test npm run test:e2e
 *
 * Existem duas famílias de E2E e cada uma precisa de um ambiente diferente:
 *
 *  - PWA do garçom (offline, lote/cobrança): sobem o próprio server.js contra um
 *    banco descartável. Exigem DATABASE_URL com nome contendo "test".
 *  - Sistema visual (PR #141): usa o build de produção servido por `vite preview`
 *    com a API simulada por rotas do Playwright. Não toca no banco.
 *
 * O runner detecta a família pelo conteúdo do arquivo, exige DATABASE_URL apenas
 * quando há teste que usa banco, e sobe/encerra o `vite preview` sozinho para o
 * teste visual — assim `npm run test:e2e` roda a pasta inteira sem passo manual.
 *
 * O Chromium empacotado (@sparticuz) extrai bibliotecas compartilhadas que
 * precisam estar no LD_LIBRARY_PATH. Se a variável não vier definida, o runner
 * aponta o caminho padrão usado na extração, em vez de falhar com um erro
 * obscuro de dynamic linker.
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const DIR = path.join(RAIZ, 'tests', 'e2e');

function portaLivre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Sobe o `vite preview` e devolve a base junto do encerrador. */
async function subirPreview(env) {
  const porta = await portaLivre();
  const base = `http://127.0.0.1:${porta}`;
  const filho = spawn(
    process.execPath,
    [path.join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(porta), '--strictPort'],
    { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let saida = '';
  filho.stdout.on('data', (d) => { saida += d; });
  filho.stderr.on('data', (d) => { saida += d; });

  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    if (filho.exitCode !== null) {
      throw new Error(`vite preview encerrou cedo (code ${filho.exitCode}):\n${saida}`);
    }
    try {
      const r = await fetch(base + '/', { signal: AbortSignal.timeout(2000) });
      if (r.ok) return { base, encerrar: () => filho.kill('SIGTERM') };
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  filho.kill('SIGTERM');
  throw new Error(`vite preview não respondeu em 60s:\n${saida}`);
}

async function main() {
  if (!fs.existsSync(DIR)) {
    console.error('Nenhum diretório tests/e2e encontrado.');
    process.exit(1);
  }

  const arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.e2e.cjs')).sort();
  if (!arquivos.length) {
    console.error('Nenhum E2E encontrado em tests/e2e.');
    process.exit(1);
  }

  const testes = arquivos.map((arquivo) => {
    const src = fs.readFileSync(path.join(DIR, arquivo), 'utf8');
    return {
      arquivo,
      usaBanco: /process\.env\.DATABASE_URL/.test(src),
      usaPreview: /VISUAL_BASE_URL/.test(src),
    };
  });

  const env = { ...process.env, NODE_ENV: 'test' };
  if (!env.LD_LIBRARY_PATH) {
    const candidatos = ['/tmp/al2023/lib', '/tmp/al2023/usr/lib'].filter((d) => fs.existsSync(d));
    if (candidatos.length) env.LD_LIBRARY_PATH = candidatos.join(':');
  }

  // O guard do banco vale só para quem realmente fala com o banco.
  if (testes.some((t) => t.usaBanco)) {
    const url = env.DATABASE_URL;
    if (!url) {
      console.error('Defina DATABASE_URL apontando para um banco descartável de teste.');
      process.exit(1);
    }
    let nome;
    try {
      nome = new URL(url).pathname.replace(/^\//, '');
    } catch {
      console.error('DATABASE_URL inválida.');
      process.exit(1);
    }
    if (!/(^|_)test($|_)/.test(nome)) {
      console.error(`Recusando executar contra o banco "${nome}". O nome precisa conter "test".`);
      process.exit(1);
    }
  }

  let preview = null;
  if (testes.some((t) => t.usaPreview) && !env.VISUAL_BASE_URL) {
    if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
      console.error('O E2E visual usa o build de produção. Rode `npm run build` antes.');
      process.exit(1);
    }
    preview = await subirPreview(env);
    env.VISUAL_BASE_URL = preview.base;
    console.log(`vite preview em ${preview.base}`);
  }

  let falhas = 0;
  try {
    for (const teste of testes) {
      console.log(`\n▶ ${teste.arquivo}`);
      const r = spawnSync(process.execPath, [path.join('tests', 'e2e', teste.arquivo)], {
        cwd: RAIZ,
        stdio: 'inherit',
        env,
      });
      if (r.status !== 0) falhas++;
    }
  } finally {
    if (preview) preview.encerrar();
  }

  console.log(`\n${testes.length - falhas}/${testes.length} E2E passaram.`);
  if (falhas) process.exit(1);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
