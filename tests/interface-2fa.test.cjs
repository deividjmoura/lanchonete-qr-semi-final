'use strict';

// Issue #55 — contrato da INTERFACE de 2FA.
//
// O comportamento (etapa 1 não autentica, replay, uso único) é provado no teste
// HTTP contra o servidor real. Aqui o alvo é outro: garantir que a interface
// não reintroduza, por descuido de edição, os erros que só aparecem na mão do
// usuário —
//
//   - tratar `mfaPendente` como login bem-sucedido (tela entraria num loop);
//   - guardar identidade antes do segundo fator;
//   - esconder o aviso de servidor sem TOTP_ENC_KEY;
//   - exibir os códigos de recuperação sem exigir confirmação de que foram
//     salvos (a partir daí eles não existem mais em lugar nenhum).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');

const login = ler('src', 'screens', 'Login.tsx');
const painel = ler('src', 'screens', 'admin', 'SegurancaConta.tsx');
const admin = ler('src', 'screens', 'Admin.tsx');
const api = ler('src', 'lib', 'api.ts');
const store = ler('src', 'store', 'usePub.ts');

test('#55 login distingue "senha ok, falta 2FA" de credencial inválida', () => {
  // O servidor responde { ok: false, mfaPendente: true } — NÃO é erro de senha.
  assert.match(store, /if \(out\.mfaPendente\) return \{ ok: false, motivo: "mfa", pendente: true \};/);
  assert.match(login, /resultado\.motivo === "mfa"/);
  // E o caminho da etapa 2 não pode marcar "senha incorreta".
  // Recorta só o `if (…) { … }` do caso mfa, até o `return` que o fecha.
  const inicio = login.indexOf('resultado.motivo === "mfa"');
  assert.ok(inicio > 0, 'o caso mfa precisa existir');
  const fimDoBloco = login.indexOf('return;', inicio);
  const blocoMfa = login.slice(inicio, fimDoBloco + 'return;'.length);
  assert.match(blocoMfa, /setEtapa\("segundo-fator"\)/);
  assert.doesNotMatch(blocoMfa, /setErro\(true\)/, '2FA pendente não é senha errada');
});

test('#55 nada de identidade é gravado antes do segundo fator', () => {
  // loginApi só toca sessionStorage/auth quando recebe staff de verdade.
  const inicio = store.indexOf('loginApi: async');
  // O bloco termina no fechamento da ação, antes da próxima (`concluirSegundoFatorApi:`).
  const fim = store.indexOf('concluirSegundoFatorApi:', inicio);
  assert.ok(inicio > 0 && fim > inicio);
  const trecho = store.slice(inicio, fim);
  const linhaMfa = trecho.indexOf('out.mfaPendente');
  const linhaStorage = trecho.indexOf('sessionStorage.setItem');
  assert.ok(linhaMfa > -1, 'loginApi precisa tratar mfaPendente');
  assert.ok(linhaStorage > -1, 'o caminho de sucesso grava auth');
  assert.ok(linhaMfa < linhaStorage, 'mfaPendente é tratado ANTES de gravar auth');
  assert.match(trecho, /if \(out\.mfaPendente\) return/);
});

test('#55 etapa 2 oferece código do app E código de recuperação', () => {
  assert.match(login, /Código do autenticador/);
  assert.match(login, /Código de recuperação/);
  assert.match(login, /viaRecuperacao/);
  // Um erro de código não pode virar "credencial inválida" genérico.
  assert.match(login, /setErro2fa\(r\.erro\)/);
  // Precisa haver saída: sem isso, erro no segundo fator prenderia a pessoa.
  assert.match(login, /voltarParaCredencial/);
  assert.match(login, /cancelarSegundoFatorApi/);
});

test('#55 a etapa 2 esconde a grade de setores', () => {
  assert.match(login, /etapa !== "credencial" && "hidden"/);
  assert.match(login, /etapa === "credencial" && papel && ativo/);
});

test('#55 painel expõe o estado, o aviso de chave ausente e a desativação com senha', () => {
  assert.match(painel, /estado2fa/);
  assert.match(painel, /TOTP_ENC_KEY/, 'precisa avisar quando o servidor não tem a chave');
  assert.match(painel, /!estado\?\.disponivel/);
  // Desativar exige a senha atual (não só um clique).
  assert.match(painel, /desativar2fa\(senha\)/);
  assert.match(painel, /autoComplete="current-password"/);
  // Códigos restantes precisam ser visíveis: é o que evita ficar sem saída.
  assert.match(painel, /codigosRestantes/);
});

test('#55 os códigos de recuperação exigem confirmação explícita de que foram salvos', () => {
  assert.match(painel, /salveiCodigos/);
  assert.match(painel, /disabled=\{!salveiCodigos\}/);
  assert.match(painel, /aparecem só agora|não há como vê-los de novo/);
  assert.match(painel, /type="checkbox"/);
});

test('#55 o QR usa o componente que o projeto já tem (sem dependência nova)', () => {
  assert.match(painel, /import \{ QRCodeSVG \} from "qrcode\.react";/);
  const pkg = JSON.parse(ler('package.json'));
  assert.ok(pkg.dependencies['qrcode.react'], 'qrcode.react já é dependência do projeto');
  // O segredo em texto também é oferecido, para quem não consegue escanear.
  assert.match(painel, /passo\.segredo/);
});

test('#55 o painel aparece na área de Logins do admin', () => {
  assert.match(admin, /import \{ SegurancaConta \} from "\.\/admin\/SegurancaConta";/);
  const inicio = admin.indexOf('{sub === "senhas" && (');
  assert.ok(inicio > 0);
  const trecho = admin.slice(inicio, inicio + 600);
  assert.match(trecho, /<SegurancaConta \/>/);
});

test('#55 o cliente trata /api/login/2fa como troca de sessão (CSRF novo)', () => {
  const trecho = api.slice(api.indexOf('requiresStaffCsrf'), api.indexOf('requiresStaffCsrf') + 400);
  assert.match(trecho, /path\.startsWith\("\/api\/admin\/"\)/);
  // Ao concluir o segundo fator o servidor emite sessão nova + csrfToken novo.
  assert.match(api, /path === "\/api\/login\/2fa"/);
});
