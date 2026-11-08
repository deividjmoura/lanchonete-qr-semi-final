'use strict';

// Pré-carregamento exclusivo dos testes: substitui APENAS Token/UserInfo do
// Google. OAuth, state, PKCE, banco, cookies e rotas continuam sendo o código
// real. O código sintético leva a identidade e o desafio emitidos pelo teste;
// a troca falha se o code_verifier não corresponder ao desafio S256.
if (process.env.NODE_ENV !== 'test' ||
    new URL(process.env.DATABASE_URL || 'postgres://invalid/none').pathname !== '/qradmin_test') {
  throw new Error('Provedor Google fictício exige NODE_ENV=test e banco qradmin_test.');
}

const crypto = require('node:crypto');
const fetchReal = global.fetch;
const TOKEN = 'https://oauth2.googleapis.com/token';
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const PREFIXO = 'codigo-sintetico.';

function resposta(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function identidade(code) {
  if (!String(code).startsWith(PREFIXO)) throw new Error('Código fora do fixture');
  return JSON.parse(Buffer.from(code.slice(PREFIXO.length), 'base64url').toString('utf8'));
}

global.fetch = async (url, options = {}) => {
  const endereco = String(url);
  if (endereco !== TOKEN && endereco !== USERINFO) return fetchReal(url, options);
  try {
    if (endereco === TOKEN) {
      const dados = new URLSearchParams(String(options.body));
      const perfil = identidade(dados.get('code'));
      const desafio = crypto.createHash('sha256').update(dados.get('code_verifier') || '').digest('base64url');
      if (desafio !== perfil.codeChallenge) return resposta(400, { error: 'invalid_grant' });
      return resposta(200, { access_token: dados.get('code'), token_type: 'Bearer' });
    }
    const code = String(options.headers.Authorization || '').replace(/^Bearer /, '');
    return resposta(200, identidade(code));
  } catch {
    return resposta(400, { error: 'invalid_request' });
  }
};

module.exports = {
  codigoGoogleSintetico({ sub, email, emailVerified = true, codeChallenge }) {
    return PREFIXO + Buffer.from(JSON.stringify({
      sub, email, email_verified: emailVerified, codeChallenge,
    })).toString('base64url');
  },
};
