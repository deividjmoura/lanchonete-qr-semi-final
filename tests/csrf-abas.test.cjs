'use strict';

/**
 * Regressão do "Token CSRF ausente ou inválido" em Cozinha/Bar.
 *
 * Causa: o cookie de sessão tem Path=/, então um login em outra aba troca a
 * sessão de TODAS as abas. A aba antiga mantinha em memória o token derivado da
 * sessão anterior, o servidor recusava com 403 e a tela só mostrava o erro —
 * o item voltava para "Na fila" e o operador tinha de recarregar a página.
 *
 * Estes testes executam o src/lib/api.ts REAL (transpilado), com um servidor
 * falso que valida CSRF antes de escrever, como o db/auth.js.
 */

require('dotenv').config();
/* Nenhum teste daqui conecta ao banco: o valor só evita o exit(1) do pool.js
   quando db/auth.js é importado para checar verificarProtecaoCSRF (função pura). */
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgres://regress:regress@127.0.0.1:5432/regress';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { carregar, servidor, hub, csrfDe } = require('./helpers/api-harness.cjs');

test('aba antiga se recupera sozinha quando outra aba troca a sessão', async () => {
  const { Canal } = hub();
  const serv = servidor();
  const aba1 = carregar(serv, { BroadcastChannel: Canal });

  // aba 1 aprende o token e faz uma escrita normal
  await aba1.apiSend('/api/cozinha/itens/1/status', 'PATCH', { status: 'em_producao' });
  assert.equal(serv.escritas.length, 1, 'primeira escrita passou');

  // outra aba entra: o cookie muda para o navegador inteiro, mas a aba 1
  // continua com o token velho em memória (não recebeu aviso nenhum)
  serv.sessao = 'sessao-outra-aba';
  const antes = serv.chamadas.length;

  await aba1.apiSend('/api/cozinha/itens/2/status', 'PATCH', { status: 'em_producao' });

  assert.equal(serv.escritas.length, 2, 'a escrita foi concluída sem o operador recarregar');
  const novas = serv.chamadas.slice(antes);
  assert.ok(novas.some((c) => c.url === '/api/me'), 'buscou o token atual');
  assert.equal(novas.filter((c) => c.url === '/api/cozinha/itens/2/status').length, 2, 'repetiu uma vez');
  assert.equal(novas[novas.length - 1].csrf, csrfDe('sessao-outra-aba'), 'reenviou com o token novo');
});

test('retry acontece no máximo uma vez, sem laço infinito', async () => {
  const { Canal } = hub();
  const serv = servidor();
  const aba = carregar(serv, { BroadcastChannel: Canal });
  await aba.apiSend('/api/cozinha/itens/1/status', 'PATCH', { status: 'em_producao' });

  // servidor sempre devolve token diferente do que aceita: retry não resolve
  let tentativas = 0;
  serv.override = ({ url, headers }) => {
    if (url === '/api/me') {
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ staff: { papel: 'cozinha' }, csrfToken: 'token-que-nunca-serve' }), clone() { return this; } };
    }
    if (url.startsWith('/api/cozinha/')) {
      tentativas++;
      return { ok: false, status: 403, statusText: 'Erro', json: async () => ({ error: 'Token CSRF ausente ou inválido', code: 'CSRF_INVALIDO' }), clone() { return this; } };
    }
    return null;
  };

  await assert.rejects(
    () => aba.apiSend('/api/cozinha/itens/9/status', 'PATCH', { status: 'em_producao' }),
    /Token CSRF/
  );
  assert.equal(tentativas, 2, 'uma tentativa original + um único retry');
});

test('403 sem o código CSRF_INVALIDO não é repetido (permissão continua negada)', async () => {
  const { Canal } = hub();
  const serv = servidor();
  const aba = carregar(serv, { BroadcastChannel: Canal });
  await aba.apiSend('/api/cozinha/itens/1/status', 'PATCH', { status: 'em_producao' });

  let tentativas = 0;
  serv.override = ({ url }) => {
    if (!url.startsWith('/api/caixa/')) return null;
    tentativas++;
    return { ok: false, status: 403, statusText: 'Erro', json: async () => ({ error: 'Sem permissão para esta área' }), clone() { return this; } };
  };

  await assert.rejects(() => aba.apiSend('/api/caixa/sessoes/1/fechar', 'POST', {}), /Sem permissão/);
  assert.equal(tentativas, 1, 'não repete quando o problema é permissão');
});

test('401 de sessão encerrada não vira retry nem sucesso silencioso', async () => {
  const { Canal } = hub();
  const serv = servidor();
  const aba = carregar(serv, { BroadcastChannel: Canal });
  await aba.apiSend('/api/cozinha/itens/1/status', 'PATCH', { status: 'em_producao' });

  serv.logado = false;
  serv.sessao = null;
  await assert.rejects(() => aba.apiSend('/api/cozinha/itens/2/status', 'PATCH', { status: 'em_producao' }));
  assert.equal(serv.escritas.length, 1, 'nada foi escrito depois do logout');
});

test('login em outra aba invalida o token da aba antiga por BroadcastChannel', async () => {
  const { Canal } = hub();
  const serv = servidor();
  const aba1 = carregar(serv, { BroadcastChannel: Canal });
  const aba2 = carregar(serv, { BroadcastChannel: Canal });

  await aba1.apiSend('/api/cozinha/itens/1/status', 'PATCH', { status: 'em_producao' });
  await aba2.api.login('operador', 'senha-ficticia-de-teste');

  const antes = serv.chamadas.length;
  await aba1.apiSend('/api/cozinha/itens/2/status', 'PATCH', { status: 'em_producao' });
  const novas = serv.chamadas.slice(antes);

  assert.equal(serv.escritas.length, 2, 'aba antiga continuou funcionando');
  // avisada, a aba busca o token novo ANTES de enviar: não chega a tomar 403
  assert.equal(novas.filter((c) => c.url === '/api/cozinha/itens/2/status').length, 1, 'sem ida e volta de 403');
  assert.equal(novas[0].url, '/api/me', 'renovou o token antes do envio');
});

test('logout em outra aba também invalida o token das demais', async () => {
  const { Canal } = hub();
  const serv = servidor();
  const aba1 = carregar(serv, { BroadcastChannel: Canal });
  const aba2 = carregar(serv, { BroadcastChannel: Canal });
  await aba1.apiSend('/api/cozinha/itens/1/status', 'PATCH', { status: 'em_producao' });

  let avisou = false;
  aba1.aoTrocarSessao(() => { avisou = true; });
  await aba2.apiSend('/api/logout', 'POST');

  assert.equal(avisou, true, 'a aba antiga foi notificada');
  await assert.rejects(() => aba1.apiSend('/api/cozinha/itens/3/status', 'PATCH', { status: 'em_producao' }));
  assert.equal(serv.escritas.length, 1);
});

test('funciona em navegador sem BroadcastChannel, via retry', async () => {
  const serv = servidor();
  const aba = carregar(serv, { BroadcastChannel: undefined });
  await aba.apiSend('/api/cozinha/itens/1/status', 'PATCH', { status: 'em_producao' });
  serv.sessao = 'sessao-trocada-sem-canal';
  await aba.apiSend('/api/cozinha/itens/2/status', 'PATCH', { status: 'em_producao' });
  assert.equal(serv.escritas.length, 2, 'o retry cobre a ausência do canal');
});

test('GET não exige CSRF e leituras não são afetadas', async () => {
  const serv = servidor();
  const aba = carregar(serv);
  const me = await aba.apiGet('/api/me');
  assert.equal(me.staff.papel, 'cozinha');
  assert.ok(serv.chamadas.every((c) => c.csrf === null), 'GET não envia token');
});

/* ------------------------------------------------------------------ */
/* Guardas de servidor e de tela                                       */
/* ------------------------------------------------------------------ */

test('servidor marca o CSRF inválido com código próprio, distinto de 401 e de falta de permissão', () => {
  const auth = require('../db/auth.js');
  assert.equal(auth.CODIGO_CSRF_INVALIDO, 'CSRF_INVALIDO');
  const sessao = 'sessao-canary-nao-e-credencial';

  const pega = (req) => { try { auth.verificarProtecaoCSRF(req); return null; } catch (e) { return e; } };

  const errado = pega({ method: 'PATCH', headers: { cookie: `lqr_session=${sessao}`, 'x-csrf-token': '0'.repeat(64) } });
  assert.equal(errado.status, 403);
  assert.equal(errado.code, 'CSRF_INVALIDO', 'cliente precisa distinguir para poder renovar');

  const ausente = pega({ method: 'POST', headers: { cookie: `lqr_session=${sessao}` } });
  assert.equal(ausente.code, 'CSRF_INVALIDO');

  // sem permissão e troca obrigatória NÃO podem carregar o código de CSRF,
  // senão o cliente repetiria uma chamada que nunca vai passar
  const src = fs.readFileSync(path.join(__dirname, '..', 'db', 'auth.js'), 'utf8');
  assert.match(src, /'Sem permissão para esta área'\);/);
  assert.match(src, /CODIGO_TROCA_OBRIGATORIA\);/);
});

test('CSRF é validado antes de qualquer escrita, o que torna o retry seguro', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'db', 'auth.js'), 'utf8');
  const corpo = src.slice(src.indexOf('async function exigirAcesso'));
  const ordem = corpo.indexOf('verificarProtecaoCSRF(req);');
  assert.ok(ordem > 0, 'exigirAcesso valida CSRF');
  assert.ok(ordem < corpo.indexOf('papelPodeAcessar'), 'CSRF vem antes da decisão de permissão');
  // exigirAcesso só valida; não escreve. As rotas escrevem depois do await.
  const trecho = corpo.slice(0, corpo.indexOf('\n}'));
  assert.doesNotMatch(trecho, /pool\.query|client\.query/, 'exigirAcesso não escreve no banco');
});

test('Cozinha e Bar mostram o erro na tela em vez de alert nativo', () => {
  for (const tela of ['Cozinha', 'Bar']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', `${tela}.tsx`), 'utf8');
    assert.doesNotMatch(src, /alert\(/, `${tela} não bloqueia a operação com alert`);
    assert.match(src, /reportarErro\(/, `${tela} publica o erro na faixa da tela`);
    assert.match(src, /const lastError = usePub\(\(s\) => s\.lastError\)/, `${tela} exibe lastError`);
  }
});

test('documentação e testes não são fonte de classes do Tailwind', () => {
  // O Tailwind v4 varre o projeto inteiro por padrão. Um relatório citando uma
  // classe como exemplo gerava essa classe no CSS de produção e mudava o hash
  // do bundle sem nenhuma mudança de tela.
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');
  assert.match(css, /@import "tailwindcss" source\(none\)/, 'varredura automática desligada');
  assert.match(css, /@source "\.\/\*\*\/\*\.\{ts,tsx\}"/, 'código de aplicação é fonte');
  assert.doesNotMatch(css, /@source[^;]*docs/, 'docs não pode ser fonte de classes');
  assert.doesNotMatch(css, /@source[^;]*tests/, 'tests não podem ser fonte de classes');
});
