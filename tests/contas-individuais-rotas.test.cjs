'use strict';

// Issue #48 — guarda estática das rotas de conta individual.
// Complementa o teste de integração: aqui garantimos que a rota existe, exige
// sessão (origem + CSRF) e nunca devolve a senha recebida.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('#48 existe rota POST /api/admin/contas para criar conta individual', () => {
  assert.match(server, /if \(p === '\/api\/admin\/contas' && req\.method === 'POST'\)/);
  const bloco = server.slice(
    server.indexOf("if (p === '/api/admin/contas' && req.method === 'POST')")
  ).slice(0, 700);
  assert.match(bloco, /exigirSessao\(req\)/, 'a rota precisa passar por exigirSessao (origem + CSRF)');
  assert.match(bloco, /criarContaStaff\(/);
  // A senha é repassada para criarContaStaff (correto) mas nunca devolvida:
  // a resposta é o objeto retornado, que não contém senha nem hash.
  // A senha é repassada a criarContaStaff (necessário). O que não pode existir
  // é eco dela na RESPOSTA: a rota devolve apenas o objeto `out`.
  assert.match(bloco, /return json\(res, 201, out\)/);
  assert.doesNotMatch(bloco, /json\(res, 201, \{\s*\.\.\.b/, 'não devolver o corpo recebido');
  const authSrc = fs.readFileSync(path.join(root, 'db/auth.js'), 'utf8');
  const fn = authSrc.slice(authSrc.indexOf('async function criarContaStaff('));
  const retorno = fn.slice(fn.indexOf('return {'), fn.indexOf('return {') + 320);
  assert.doesNotMatch(retorno, /senha:\s*(hash|senha)/, 'o retorno não pode conter senha nem hash');
});

test('#48 existe rota de desativação de conta', () => {
  assert.match(server, /\/\^\\\/api\\\/admin\\\/contas\\\/\(\\d\+\)\\\/desativar\$\//);
  const idx = server.indexOf('/desativar$');
  const bloco = server.slice(idx - 200, idx + 500);
  assert.match(bloco, /exigirSessao\(req\)/);
  assert.match(bloco, /desativarContaStaff\(/);
});

test('#48 exigirSessao valida origem e CSRF', () => {
  const auth = fs.readFileSync(path.join(root, 'db/auth.js'), 'utf8');
  const inicio = auth.indexOf('async function exigirSessao(req)');
  const bloco = auth.slice(inicio, inicio + 320);
  assert.match(bloco, /verificarOrigemRequisicao\(req\)/);
  assert.match(bloco, /verificarProtecaoCSRF\(req\)/);
});

test('#48 criação de conta aplica política de senha e exige papel admin', () => {
  const auth = fs.readFileSync(path.join(root, 'db/auth.js'), 'utf8');
  const inicio = auth.indexOf('async function criarContaStaff(');
  const bloco = auth.slice(inicio, inicio + 2600);
  assert.match(bloco, /ator\.papel !== 'admin'/, 'só admin cria conta');
  assert.match(bloco, /validarPoliticaSenha\(/, 'a política de senha vale na criação');
  assert.match(auth, /INSERT INTO staff \(nome, login, senha_hash, papel, ativo, deve_trocar_senha\)/);
  assert.match(auth, /VALUES \(\$1, \$2, \$3, \$4, TRUE, TRUE\)/, 'a conta nasce ativa e exigindo troca');
  assert.match(bloco, /pg_advisory_xact_lock\(/, 'criação concorrente precisa ser serializada');
});

test('#48 desativação preserva a linha em vez de apagar', () => {
  const auth = fs.readFileSync(path.join(root, 'db/auth.js'), 'utf8');
  const inicio = auth.indexOf('async function desativarContaStaff(');
  const bloco = auth.slice(inicio, inicio + 2600);
  assert.match(bloco, /SET ativo = FALSE/);
  assert.doesNotMatch(bloco, /DELETE FROM staff\b(?!_)/, 'apagar a conta quebraria a rastreabilidade');
  assert.match(bloco, /DELETE FROM staff_sessoes/, 'as sessões precisam ser revogadas');
  assert.match(bloco, /última conta de administrador/, 'não pode remover o último admin');
  assert.match(bloco, /própria conta/, 'não pode desativar a si mesmo');
});
