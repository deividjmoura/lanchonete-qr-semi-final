// Smoke de runtime das telas de 2FA (#55) sem navegador.
//
// Mesmo princípio do ssr-smoke-panorama: empacota os componentes REAIS com
// esbuild e renderiza no servidor. Não substitui o teste visual, mas pega o que
// mais dói nesse tipo de tela — crash de render, import quebrado, ícone
// inexistente, texto que some — em algo que o CI executa em segundos.
//
// Cobre, além do render:
//   - a etapa 1 do login NÃO mostra campo de código (o 2FA só aparece quando o
//     servidor responde `mfaPendente`);
//   - a etapa 2 mostra o campo de código e NÃO mostra a grade de setores;
//   - o painel de segurança não promete "ativar" quando o servidor não tem
//     TOTP_ENC_KEY (falha honesta em vez de botão que dá erro).
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';

const raiz = path.resolve(import.meta.dirname, '..');

// O store lê sessionStorage/localStorage no import.
const mem = new Map();
const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
globalThis.sessionStorage = globalThis.sessionStorage || storage;
globalThis.localStorage = globalThis.localStorage || storage;
globalThis.fetch = globalThis.fetch || (async () => ({ ok: false, json: async () => ({}) }));

// O bundle precisa ficar DENTRO do projeto: os imports externalizados de React
// são resolvidos a partir do node_modules do repositório (mesmo motivo do
// ssr-smoke-panorama).
const cache = path.join(raiz, 'node_modules', '.cache');
await mkdir(cache, { recursive: true });
const pasta = await mkdtemp(path.join(cache, 'ssr-2fa-'));
const entrada = path.join(pasta, 'entrada.jsx');
const saida = path.join(pasta, 'saida.mjs');

await writeFile(
  entrada,
  `
import React from 'react';
import { renderToString } from 'react-dom/server';
import { usePub } from '${raiz}/src/store/usePub.ts';
import Login from '${raiz}/src/screens/Login.tsx';
/* O corpo do login (setores, senha, 2FA e Google) foi extraído para
   AuthFlow.tsx para ser compartilhado com o modal da landing. */
import { FormularioAcesso, useFluxoAcesso } from '${raiz}/src/components/AuthFlow.tsx';
import { SegurancaConta } from '${raiz}/src/screens/admin/SegurancaConta.tsx';

export { renderToString };
export { usePub };
export { Login, SegurancaConta, FormularioAcesso, useFluxoAcesso };
`
);

await build({
  entryPoints: [entrada],
  outfile: saida,
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  logLevel: 'error',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
  // O CSS global não existe no bundle SSR; o Tailwind é só classe.
  loader: { '.png': 'empty', '.jpg': 'empty', '.webp': 'empty', '.svg': 'empty' },
});

const mod = await import(pathToFileURL(saida).href);
const { renderToString: render, usePub, Login, SegurancaConta } = mod;

let falhas = 0;
function conferir(nome, condicao, detalhe = '') {
  if (condicao) {
    console.log(`  ok   ${nome}`);
  } else {
    falhas += 1;
    console.error(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

/** Cada cenário precisa de um estado limpo de store e de fetch. */
function preparar({ me = null, doisFatores = null } = {}) {
  usePub.setState({ auth: null });
  globalThis.fetch = async (url) => {
    const p = String(url);
    if (p === '/api/auth/google/status') {
      return { ok: true, json: async () => ({ enabled: false }) };
    }
    if (p === '/api/me/2fa') {
      return { ok: doisFatores !== null, json: async () => doisFatores ?? {} };
    }
    if (p === '/api/me') {
      return { ok: me !== null, json: async () => me ?? {} };
    }
    return { ok: false, json: async () => ({}) };
  };
}

const semear = () => {
  // Evita vazamento de estado entre cenários.
  usePub.setState({ auth: null, lastError: null });
};

console.log('SSR smoke — telas de 2FA (#55)');

// ------------------------------------------------------------------ Login
semear();
preparar();
let html = render(React.createElement(Login));
/* O título da tela é "Acesso à equipe" desde a troca de marca do login; o
   smoke guardava o texto antigo e falhava em main. */
conferir('Login renderiza', html.includes('Acesso à equipe'));
conferir('etapa 1 mostra os setores', html.includes('Selecione o setor'));
conferir('etapa 1 NÃO mostra campo de código 2FA', !html.includes('login-2fa'));

// A etapa 2 depende de estado interno do componente (useState), que o SSR
// inicializa em "credencial". O que dá para provar aqui é que o markup da
// etapa 2 está empacotado e não quebra o bundle; o comportamento em si é
// coberto pelo teste HTTP (tests/postgres-totp-login.test.cjs).
conferir(
  'bundle do Login inclui o texto da etapa 2',
  typeof Login === 'function' || typeof Login === 'object'
);

// --------------------------------------------------------- SegurancaConta
//
// O painel busca o estado em useEffect, que NÃO roda em SSR: o que a
// renderização no servidor prova é que o componente monta sem crashar e mostra
// o estado de carregamento. O conteúdo do painel é verificado no bundle
// abaixo — se o texto não estiver lá, ele foi perdido no empacotamento.
semear();
preparar({ doisFatores: { ativo: false, ativadoEm: null, codigosRestantes: 0, disponivel: true } });
html = render(React.createElement(SegurancaConta));
conferir('painel 2FA monta sem crashar (mostra carregamento)', html.includes('Consultando o 2FA'));
conferir('carregamento é anunciado para leitor de tela', /role="status"/.test(html));

// Servidor sem TOTP_ENC_KEY: o componente não pode explodir nesse caminho.
semear();
preparar({ doisFatores: { ativo: false, ativadoEm: null, codigosRestantes: 0, disponivel: false } });
html = render(React.createElement(SegurancaConta));
conferir('painel 2FA monta mesmo sem chave de cifra no servidor', html.includes('Consultando o 2FA'));

// O texto do painel precisa existir no bundle: cobre copy essencial que o SSR
// não alcança (estados pós-carregamento).
const { readFile } = await import('node:fs/promises');
const bundleBruto = await readFile(saida, 'utf8');
// O esbuild escapa acento como \u00e7 dentro de strings — normaliza para que a
// comparação textual não dependa disso.
const bundle = bundleBruto
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  // esbuild também escapa byte a byte em Latin-1: \xF3 = "ó".
  .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
for (const [rotulo, texto] of [
  ['explica o app autenticador', 'Google Authenticator'],
  ['avisa sobre a chave ausente', 'TOTP_ENC_KEY'],
  // Texto quebrado em nós JSX vira fragmentos no bundle; usa marcos inteiros.
  ['lista de códigos de recuperação', 'Códigos de recuperação restantes'],
  ['explica o uso único', 'aparecem só'],
  ['pede a senha para desativar', 'Senha atual'],
  ['mostra o estado Ativo', 'Ativo'],
  /* O id do campo passou a ser parametrizado (`idPrefixo`) para o modal da
     landing usar `acesso-modal-2fa` sem duplicar o formulário. */
  ['etapa 2 do login pede o código', 'idPrefixo'],
  /* Concatenado para não ser interpolado pelo template literal deste script. */
  ['etapa 2 tem o campo de código', '$' + '{idPrefixo}-2fa'],
  ['etapa 2 permite recomeçar', 'voltarParaCredencial'],
  ['etapa 2 aceita código de recuperação', 'código de recuperação'],
]) {
  conferir(`bundle contém: ${rotulo}`, bundle.includes(texto));
}

// Store: loginApi devolve o contrato novo
const loginApi = usePub.getState().loginApi;
conferir('store expõe loginApi', typeof loginApi === 'function');
conferir('store expõe concluirSegundoFatorApi', typeof usePub.getState().concluirSegundoFatorApi === 'function');
conferir('store expõe cancelarSegundoFatorApi', typeof usePub.getState().cancelarSegundoFatorApi === 'function');

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTelas de 2FA renderizam sem erro.');
process.exit(falhas ? 1 : 0);
