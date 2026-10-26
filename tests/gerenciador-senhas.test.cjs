'use strict';

// Regressão: o gerenciador de senhas do navegador só salva a credencial com o
// usuário certo se o formulário tiver um campo de usuário (autocomplete="username")
// junto dos campos de senha.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ler = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('diálogo de troca de senha envia o usuário da sessão ao gerenciador de senhas', () => {
  const src = ler('src/components/TrocarSenha.tsx');
  assert.match(src, /autoComplete="username"/);
  assert.match(src, /value=\{login\}/);
  assert.match(src, /autoComplete="current-password"/);
  assert.equal((src.match(/autoComplete="new-password"/g) || []).length, 2);
  // usuário vem da sessão, não de texto fixo
  assert.match(src, /s\.auth\?\.login/);
});

test('troca de senha não limpa os campos antes do navegador capturar o envio com sucesso', () => {
  const src = ler('src/components/TrocarSenha.tsx');
  const depoisDoApi = src.split('await trocarSenhaApi(atual, nova);')[1] || '';
  const iClear = depoisDoApi.indexOf('setAtual("")');
  const iErro = depoisDoApi.indexOf('if (msg)');
  assert.ok(iErro >= 0 && iClear > iErro, 'limpeza dos campos deve ficar dentro do ramo de erro');
});

test('login em React usa <form> com usuário (perfil) e senha identificáveis', () => {
  const src = ler('src/screens/Login.tsx');
  assert.match(src, /<form/);
  assert.match(src, /autoComplete="username"/);
  assert.match(src, /value=\{papel\}/);
  assert.match(src, /autoComplete="current-password"/);
  assert.match(src, /type="submit"/);
});

test('login estático (public/login.html) mantém usuário e senha com autocomplete correto', () => {
  const src = ler('public/login.html');
  assert.match(src, /autocomplete="username"/);
  assert.match(src, /autocomplete="current-password"/);
});

test('o estado de autenticação guarda o login devolvido pelo servidor', () => {
  const src = ler('src/store/usePub.ts');
  assert.match(src, /login\?: string/);
  assert.match(src, /login: me\.login/);
  assert.match(src, /login: out\.staff\?\.login/);
});
