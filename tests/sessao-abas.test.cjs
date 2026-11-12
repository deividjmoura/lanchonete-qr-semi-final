'use strict';

/**
 * Testes unitários de sincronização de sessão e autenticação entre abas (#300).
 *
 * Complementa `tests/csrf-abas.test.cjs` validando:
 *  - retry único de `POST /api/logout` quando o token CSRF em memória ficou velho
 *    após rotação de sessão em outra aba;
 *  - detecção de 401 em rotas staff (expiração/revogação) via `aoExpirarSessao`,
 *    sem afetar rotas públicas de mesa/garçom ou `/api/login`;
 *  - revalidação local em 403 `SENHA_TROCA_OBRIGATORIA`;
 *  - registro único de `aoTrocarSessao` e `aoExpirarSessao` no topo de `usePub.ts`
 *    (fora de `hydrateGarcom`), preservando `auth` quando `/api/me` está indisponível;
 *  - ausência de tokens de sessão/CSRF em `localStorage`/`sessionStorage`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { carregar, hub } = require('./helpers/api-harness.cjs');

const RAIZ = path.join(__dirname, '..');

function criarClienteApi(fetchImpl, opts = {}) {
  return carregar({ fetch: fetchImpl }, opts);
}
function criarBarramentoBroadcast() {
  return hub().Canal;
}

function respostaJson(status, obj) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    clone() {
      return respostaJson(status, obj);
    },
    async json() {
      return obj;
    },
  };
}

test('#300: POST /api/logout com CSRF defasado atualiza o token em /api/me e encerra a sessão real', async () => {
  let sessaoAtiva = { id: 'sessao-nova', csrf: 'b'.repeat(64) };
  const chamadas = [];
  const BroadcastChannel = criarBarramentoBroadcast();

  const fetchImpl = async (url, init = {}) => {
    const metodo = (init.method || 'GET').toUpperCase();
    const csrf = init.headers && init.headers['X-CSRF-Token'];
    chamadas.push({ url, metodo, csrf });

    if (url === '/api/me') {
      if (!sessaoAtiva) return respostaJson(401, { error: 'Sessão inválida ou expirada' });
      return respostaJson(200, {
        staff: { id: 1, nome: 'Cozinha', papel: 'cozinha' },
        csrfToken: sessaoAtiva.csrf,
      });
    }
    if (url === '/api/logout' && metodo === 'POST') {
      if (!sessaoAtiva) return respostaJson(200, { ok: true });
      if (csrf !== sessaoAtiva.csrf) {
        return respostaJson(403, { error: 'Token CSRF ausente ou inválido', code: 'CSRF_INVALIDO' });
      }
      sessaoAtiva = null;
      return respostaJson(200, { ok: true });
    }
    throw new Error('rota inesperada: ' + metodo + ' ' + url);
  };

  // Aba 1 carregou antes com um token antigo; outra aba sem BroadcastChannel trocou a sessão.
  let tokenInicial = 'a'.repeat(64);
  const aba1 = criarClienteApi(async (url, init = {}) => {
    if (url === '/api/me' && tokenInicial) {
      const t = tokenInicial;
      tokenInicial = null;
      return respostaJson(200, { staff: { id: 1, nome: 'Cozinha', papel: 'cozinha' }, csrfToken: t });
    }
    return fetchImpl(url, init);
  }, { BroadcastChannel });

  const aba2 = criarClienteApi(fetchImpl, { BroadcastChannel });
  let avisosAba2 = 0;
  aba2.aoTrocarSessao(() => { avisosAba2++; });

  await aba1.api.me();
  const out = await aba1.api.logout();
  assert.deepEqual(out, { ok: true });
  assert.equal(sessaoAtiva, null, 'o cookie/sessão do servidor precisa ter sido realmente encerrado');
  assert.equal(avisosAba2, 1, 'demais abas recebem o aviso de encerramento');
  assert.deepEqual(
    chamadas.map((c) => [c.metodo, c.url, c.csrf || null]),
    [
      ['POST', '/api/logout', 'a'.repeat(64)],
      ['GET', '/api/me', null],
      ['POST', '/api/logout', 'b'.repeat(64)],
    ]
  );
});

test('#300: 401 em rota staff dispara aoExpirarSessao e propaga às outras abas; rotas públicas não disparam', async () => {
  const BroadcastChannel = criarBarramentoBroadcast();
  let expirouAba1 = 0;
  let avisouAba2 = 0;

  const aba1 = criarClienteApi(async (url) => {
    if (url === '/api/me') {
      return respostaJson(200, { staff: { id: 2, nome: 'Caixa', papel: 'caixa' }, csrfToken: 'c'.repeat(64) });
    }
    if (url.startsWith('/api/caixa/')) {
      return respostaJson(401, { error: 'Sessão inválida ou expirada' });
    }
    if (url.startsWith('/api/garcom/') || url === '/api/login') {
      return respostaJson(401, { error: 'Credenciais inválidas' });
    }
    throw new Error('rota inesperada: ' + url);
  }, { BroadcastChannel });

  const aba2 = criarClienteApi(async () => respostaJson(401, { error: 'Sessão encerrada' }), { BroadcastChannel });
  aba1.aoExpirarSessao(() => { expirouAba1++; });
  aba2.aoTrocarSessao(() => { avisouAba2++; });

  // Falha de login ou token de garçom inválido NÃO é expiração de sessão staff.
  await assert.rejects(() => aba1.api.login('caixa', 'errada'), { status: 401 });
  await assert.rejects(() => aba1.api.garcomPedidos('token-invalido'), { status: 401 });
  assert.equal(expirouAba1, 0);
  assert.equal(avisouAba2, 0);

  // Sessão staff ativa expira e uma chamada de setor recebe 401.
  await aba1.api.me();
  await assert.rejects(() => aba1.api.caixaSessoes(), { status: 401 });
  assert.equal(expirouAba1, 1, 'aba onde ocorreu o 401 limpa imediatamente a sessão local');
  assert.equal(avisouAba2, 1, 'outras abas são notificadas para revalidar /api/me');
});

test('#300: 403 SENHA_TROCA_OBRIGATORIA aciona revalidação local da sessão', async () => {
  let revalidacoes = 0;
  const cliente = criarClienteApi(async (url) => {
    if (url === '/api/cozinha/pedidos') {
      return respostaJson(403, { error: 'Troca de senha obrigatória', code: 'SENHA_TROCA_OBRIGATORIA' });
    }
    throw new Error('inesperada: ' + url);
  });
  cliente.aoTrocarSessao(() => { revalidacoes++; });
  await assert.rejects(() => cliente.api.cozinhaPedidos(), { status: 403, code: 'SENHA_TROCA_OBRIGATORIA' });
  assert.equal(revalidacoes, 1);
});

test('#300: usePub, Login e AuthModal sincronizam sessão entre abas sem vazar tokens em storage', () => {
  const storeSrc = fs.readFileSync(path.join(RAIZ, 'src/store/usePub.ts'), 'utf8');
  const loginSrc = fs.readFileSync(path.join(RAIZ, 'src/screens/Login.tsx'), 'utf8');
  const modalSrc = fs.readFileSync(path.join(RAIZ, 'src/components/AuthModal.tsx'), 'utf8');
  const apiSrc = fs.readFileSync(path.join(RAIZ, 'src/lib/api.ts'), 'utf8');

  // aoTrocarSessao não pode ficar preso dentro de hydrateGarcom: precisa rodar no nível do módulo.
  const idxGarcom = storeSrc.indexOf('hydrateGarcom:');
  const idxHydrateMe = storeSrc.indexOf('hydrateMe:');
  assert.ok(idxGarcom > 0 && idxHydrateMe > idxGarcom);
  assert.doesNotMatch(
    storeSrc.slice(idxGarcom, idxHydrateMe),
    /aoTrocarSessao\(/,
    'aoTrocarSessao não deve ser registrado dentro de hydrateGarcom'
  );
  assert.match(storeSrc.slice(idxHydrateMe), /aoTrocarSessao\(/, 'aoTrocarSessao registrado no escopo global da store');
  assert.match(storeSrc.slice(idxHydrateMe), /aoExpirarSessao\(/, 'aoExpirarSessao registrado no escopo global da store');
  assert.match(storeSrc, /logoutPendente/, 'hydrateMe aguarda logout em voo para evitar corrida ao voltar para #/login');
  assert.match(storeSrc, /visibilitychange/, 'abas revalidam sessão ao retomar foco em rotas staff');

  // Login e AuthModal reconhecem sessão existente via hydrateMe() e respeitam destinoDoPapel.
  assert.match(loginSrc, /hydrateMe\(\)/);
  assert.match(loginSrc, /destinoDoPapel\(/);
  assert.match(loginSrc, /params\.get\("trocar"\) === "1"/);
  assert.match(modalSrc, /hydrateMe\(\)/);
  assert.match(modalSrc, /destinoDoPapel\(role\)/);

  // Nenhum token de sessão ou CSRF vai para localStorage/sessionStorage.
  assert.doesNotMatch(apiSrc, /localStorage|sessionStorage/);
  assert.doesNotMatch(storeSrc, /csrfToken/);
});
