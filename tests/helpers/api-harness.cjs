'use strict';

/**
 * Carrega o cliente HTTP REAL (src/lib/api.ts) em Node.
 *
 * O arquivo é TypeScript, então é transpilado com o `typescript` que já é
 * dependência do projeto — nada de copiar a lógica para o teste. Cada chamada
 * de `carregar()` devolve um módulo independente, o que representa uma ABA
 * diferente do navegador: cada aba tem seu próprio `csrfToken` em memória,
 * exatamente como no produto.
 *
 * O `fetch` é stubado por um servidor falso que guarda o cookie de sessão
 * "do navegador" (compartilhado entre as abas, como um cookie Path=/ real) e
 * valida o CSRF do mesmo jeito que db/auth.js: HMAC do token de sessão.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const API_PATH = path.join(__dirname, '..', '..', 'src', 'lib', 'api.ts');

function codigoJs() {
  const ts_src = fs.readFileSync(API_PATH, 'utf8');
  return ts.transpileModule(ts_src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

/** HMAC igual ao csrfTokenParaSessao() do servidor. */
const csrfDe = (sessao) =>
  sessao ? crypto.createHmac('sha256', sessao).update('qradmin-csrf-v1').digest('hex') : null;

/**
 * Servidor falso com cookie compartilhado entre abas.
 * `papel` muda quando outra aba entra, para simular troca de identidade.
 */
function servidor({ sessao = 'sessao-aba-1', papel = 'cozinha', logado = true } = {}) {
  const estado = {
    sessao,
    papel,
    logado,
    chamadas: [],
    escritas: [],
    // permite forçar respostas para testar limites do retry
    override: null,
  };

  const resposta = (status, corpo) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Erro',
    json: async () => corpo,
    clone() { return resposta(status, corpo); },
  });

  estado.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    const headers = opts.headers || {};
    estado.chamadas.push({ url, method, csrf: headers['X-CSRF-Token'] || null });

    if (estado.override) {
      const r = estado.override({ url, method, headers, estado });
      if (r) return r;
    }

    if (url === '/api/me') {
      if (!estado.logado) return resposta(401, { error: 'Não autenticado' });
      return resposta(200, {
        staff: { id: 7, papel: estado.papel, nome: 'Operador' },
        csrfToken: csrfDe(estado.sessao),
      });
    }

    if (url === '/api/login') {
      estado.logado = true;
      estado.sessao = 'sessao-' + crypto.randomBytes(4).toString('hex');
      return resposta(200, { ok: true, staff: { papel: estado.papel }, csrfToken: csrfDe(estado.sessao) });
    }

    if (url === '/api/logout') {
      estado.logado = false;
      estado.sessao = null;
      return resposta(200, { ok: true });
    }

    // rota protegida: valida o CSRF antes de escrever, como o servidor real
    const esperado = csrfDe(estado.sessao);
    const recebido = headers['X-CSRF-Token'];
    if (!estado.logado) return resposta(401, { error: 'Não autenticado' });
    if (!esperado || recebido !== esperado) {
      return resposta(403, { error: 'Token CSRF ausente ou inválido', code: 'CSRF_INVALIDO' });
    }
    estado.escritas.push({ url, method, body: opts.body ? JSON.parse(opts.body) : null });
    return resposta(200, { ok: true });
  };

  return estado;
}

/** Hub de BroadcastChannel para as abas conversarem, como no navegador. */
function hub() {
  const canais = new Set();
  class Canal {
    constructor(nome) { this.nome = nome; this.onmessage = null; canais.add(this); }
    postMessage(data) {
      for (const c of canais) {
        if (c === this || c.nome !== this.nome) continue;
        if (typeof c.onmessage === 'function') c.onmessage({ data });
      }
    }
    close() { canais.delete(this); }
  }
  return { Canal, canais };
}

/**
 * Cria uma aba: módulo api.ts próprio + fetch ligado ao servidor compartilhado.
 * Sem BroadcastChannel quando `BroadcastChannel` é undefined (navegador antigo).
 */
function carregar(serv, { BroadcastChannel } = {}) {
  const modulo = { exports: {} };
  const contexto = {
    module: modulo,
    exports: modulo.exports,
    require,
    console,
    fetch: serv.fetch,
    BroadcastChannel,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    EventSource: undefined,
  };
  vm.createContext(contexto);
  vm.runInContext(codigoJs(), contexto, { filename: 'api.ts' });
  return modulo.exports;
}

module.exports = { carregar, servidor, hub, csrfDe, API_PATH };
