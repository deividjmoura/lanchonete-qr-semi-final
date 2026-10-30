'use strict';

// Issue #55 — regressões sem banco: política de senha, regra de troca obrigatória e contrato da rota.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:5432/qradmin_test';
const {
  validarPoliticaSenha,
  trocaObrigatoriaAtiva,
  exigeTrocaDeSenha,
  CODIGO_TROCA_OBRIGATORIA,
  ErroAuth,
} = require('../db/auth');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '0024_staff_troca_senha.sql'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'TrocarSenha.tsx'), 'utf8');
const apiClient = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'api.ts'), 'utf8');

test('política: aceita senha longa e variada', () => {
  assert.equal(validarPoliticaSenha('Cafe-com-Leite#2026'), null);
});

test('política: rejeita curta, longa, repetitiva, comum e contendo o usuário', () => {
  assert.match(validarPoliticaSenha('curta'), /pelo menos 12/);
  assert.match(validarPoliticaSenha('a'.repeat(129)), /no máximo 128/);
  assert.match(validarPoliticaSenha('aaaaaaaaaaaaaaaa'), /repetitiva/);
  assert.match(validarPoliticaSenha('Senha123456'), /pelo menos 12|comum/);
  assert.match(validarPoliticaSenha('xx-caixa-forte-99', { login: 'caixa' }), /usuário/);
  assert.match(validarPoliticaSenha(undefined), /nova senha/);
});

test('troca obrigatória: padrão ligado só em produção, com override explícito', () => {
  assert.equal(trocaObrigatoriaAtiva({ NODE_ENV: 'production' }), true);
  assert.equal(trocaObrigatoriaAtiva({ NODE_ENV: 'development' }), false);
  assert.equal(trocaObrigatoriaAtiva({ NODE_ENV: 'development', STAFF_FORCE_PASSWORD_CHANGE: 'true' }), true);
  assert.equal(trocaObrigatoriaAtiva({ NODE_ENV: 'production', STAFF_FORCE_PASSWORD_CHANGE: 'false' }), false);
});

test('troca obrigatória: marcada OU senha compartilhada entre contas ativas', () => {
  const env = { STAFF_FORCE_PASSWORD_CHANGE: 'true' };
  assert.equal(exigeTrocaDeSenha({ deve_trocar_senha: true, senha_compartilhada: false }, env), true);
  assert.equal(exigeTrocaDeSenha({ deve_trocar_senha: false, senha_compartilhada: true }, env), true);
  assert.equal(exigeTrocaDeSenha({ deve_trocar_senha: false, senha_compartilhada: false }, env), false);
  assert.equal(exigeTrocaDeSenha({ deve_trocar_senha: true }, { NODE_ENV: 'development' }), false);
});

test('ErroAuth carrega o código usado pelo front para abrir a troca obrigatória', () => {
  const e = new ErroAuth(403, 'x', CODIGO_TROCA_OBRIGATORIA);
  assert.equal(e.code, 'SENHA_TROCA_OBRIGATORIA');
  assert.equal(new ErroAuth(401, 'y').code, undefined);
});

test('rota POST /api/me/senha exige sessão+CSRF, limita tentativas e rotaciona o cookie', () => {
  const i = server.indexOf("p === '/api/me/senha'");
  assert.ok(i > 0, 'rota ausente');
  const fim = server.indexOf("if (p === '/api/config/pix'", i);
  assert.ok(fim > i, 'delimitador da rota seguinte não encontrado');
  const bloco = server.slice(i, fim);
  assert.match(bloco, /exigirSessao\(req\)/);
  assert.match(bloco, /golpePermitido\(`senha:\$\{staff\.id\}`/);
  assert.match(bloco, /429/);
  assert.match(bloco, /trocarSenha\(staff\.id/);
  assert.match(bloco, /cookieDeSessao\(r\.token\)/);
  assert.doesNotMatch(bloco, /console\.(log|warn|error)/, 'a rota não pode logar corpo/segredos');
});

test('migration é aditiva e a trilha não tem coluna para segredos nem IP', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS deve_trocar_senha/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS staff_credencial_eventos/);
  assert.doesNotMatch(migration, /\b(DROP|TRUNCATE)\b/i);
  const tabela = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS staff_credencial_eventos'));
  const colunas = tabela
    .slice(tabela.indexOf('(') + 1, tabela.indexOf(');'))
    .split('\n')
    .map((l) => l.trim().split(/\s+/)[0])
    .filter((c) => /^[a-z_]+$/.test(c) && !['check', 'references'].includes(c.toLowerCase()));
  for (const c of colunas) assert.doesNotMatch(c, /hash|token|senha|^ip|ip_/, `coluna suspeita: ${c}`);
  assert.deepEqual(
    colunas.filter((c) => ['id', 'staff_id', 'login', 'evento', 'sessoes_revogadas', 'criado_em'].includes(c)).length,
    6
  );
});

test('front: o cliente HTTP envia o CSRF na troca de senha e a UI não persiste senhas', () => {
  assert.match(apiClient, /path === "\/api\/me\/senha"/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|console\./);
  assert.match(ui, /autoComplete="current-password"/);
  assert.match(ui, /autoComplete="new-password"/);
});

test('reset de senha legado inclui todos os quatro perfis de bootstrap', () => {
  const reset = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'reset-senha.js'), 'utf8');
  assert.match(reset, /lower\(login\) IN \('admin', 'cozinha', 'bar', 'caixa'\)/);
  assert.match(reset, /deve_trocar_senha = true/);
  assert.doesNotMatch(reset, /ativo\s*=\s*true/, 'reset de senha não pode reativar contas desabilitadas');
});

test('SSE não mantém acesso operacional de staff com troca obrigatória pendente', () => {
  const i = server.indexOf("p === '/api/events'");
  const fim = server.indexOf("if ((m = p.match(", i + 10);
  assert.ok(i >= 0 && fim > i, 'rota SSE não encontrada');
  const bloco = server.slice(i, fim);
  assert.match(bloco, /staff\.deveTrocarSenha/);
  assert.match(bloco, /SENHA_TROCA_OBRIGATORIA/);
  assert.match(bloco, /json\(res, 403/);
});

// ── Redefinição pelo admin (senha esquecida) ─────────────────────────────────

const migrationReset = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '0028_admin_redefine_senha.sql'), 'utf8');
const store = fs.readFileSync(path.join(__dirname, '..', 'src', 'store', 'usePub.ts'), 'utf8');

test('migration 0028 é aditiva: registra o ator, amplia o CHECK e não cria colunas de segredo/IP', () => {
  assert.match(migrationReset, /ADD COLUMN IF NOT EXISTS ator_staff_id/);
  assert.match(migrationReset, /ADD COLUMN IF NOT EXISTS ator_login/);
  assert.match(migrationReset, /senha_redefinida/);
  assert.match(migrationReset, /senha_redefinicao_rejeitada/);
  // Preserva os eventos antigos da troca própria.
  assert.match(migrationReset, /senha_alterada/);
  assert.match(migrationReset, /senha_troca_falhou/);
  assert.match(migrationReset, /senha_troca_rejeitada/);
  assert.doesNotMatch(migrationReset, /\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i);
  // Comentários podem citar "token"/"hash" para documentar a ausência; o que
  // não pode existir é coluna/identificador SQL com esses nomes.
  const sqlSemComentarios = migrationReset.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sqlSemComentarios, /\b(senha_hash|token|ip_address|client_ip)\b/i);
});

test('rotas de recuperação do admin exigem sessão+CSRF+papel admin, mas não o bloqueio de troca obrigatória', () => {
  const i = server.indexOf('const recuperacaoAdmin =');
  assert.ok(i > 0, 'gate de recuperação ausente');
  const inicioIf = server.indexOf('if (recuperacaoAdmin) {', i);
  const fimIf = server.indexOf('} else if (p.startsWith', inicioIf);
  assert.ok(inicioIf > i && fimIf > inicioIf);
  const bloco = server.slice(i, fimIf);
  assert.match(bloco, /p === '\/api\/admin\/contas'/);
  assert.match(bloco, /p === '\/api\/admin\/contas\/senha'/);
  assert.match(bloco, /exigirSessao\(req\)/);
  assert.match(bloco, /staff\.papel !== 'admin'/);
  assert.doesNotMatch(bloco, /exigirAcesso\(req,\s*'admin'\)/, 'recuperação não pode ficar trancada pela troca obrigatória');
});

test('POST /api/admin/contas/senha limita tentativas, não pede senha antiga e só rotaciona cookie na própria conta', () => {
  const i = server.indexOf("p === '/api/admin/contas/senha'");
  assert.ok(i > 0, 'rota ausente');
  const fim = server.indexOf("if (p === '/api/admin/mesas'", i);
  assert.ok(fim > i);
  const bloco = server.slice(i, fim);
  assert.match(bloco, /golpePermitido\(`reset-senha:\$\{ator\.id\}`/);
  assert.match(bloco, /429/);
  assert.match(bloco, /redefinirSenhaStaff\(/);
  assert.match(bloco, /parseCookies\(req\)\[SESSION_COOKIE\]/);
  assert.match(bloco, /r\.propriaConta && r\.token/);
  assert.match(bloco, /cookieDeSessao\(r\.token\)/);
  assert.doesNotMatch(bloco, /senhaAtual/);
  assert.doesNotMatch(bloco, /console\.(log|warn|error)/);
});

test('GET /api/admin/contas usa listarContasStaff e não expõe hash', () => {
  const i = server.indexOf("p === '/api/admin/contas'");
  assert.ok(i > 0);
  const bloco = server.slice(i, server.indexOf("if (p === '/api/admin/contas/senha'", i));
  assert.match(bloco, /listarContasStaff\(\)/);
  assert.doesNotMatch(bloco, /senha_hash/);
});

test('UI: admin escolhe o setor e não vê senha atual; não-admin mantém a troca própria com senha atual', () => {
  assert.match(ui, /role === "admin"/);
  assert.match(ui, /api\.contasStaff\(\)/);
  assert.match(ui, /<select/);
  assert.match(ui, /Setor/);
  assert.match(ui, /redefinirSenhaApi\(alvo, nova\)/);
  assert.match(ui, /trocarSenhaApi\(atual, nova\)/);
  assert.match(ui, /autoComplete="current-password"/);
  assert.match(ui, /Não é necessário informar a senha antiga/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|console\./);
});

test('cliente HTTP adota o novo CSRF quando o admin redefine a própria senha', () => {
  assert.match(apiClient, /path === "\/api\/admin\/contas\/senha"/);
  assert.match(apiClient, /contasStaff:/);
  assert.match(apiClient, /redefinirSenha:/);
});

test('store: redefinirSenhaApi reidrata a sessão e só limpa troca obrigatória na própria conta', () => {
  const i = store.indexOf('redefinirSenhaApi: async');
  assert.ok(i > 0);
  const bloco = store.slice(i, store.indexOf('logout:', i));
  assert.match(bloco, /api\.redefinirSenha\(login, senhaNova\)/);
  assert.match(bloco, /hydrateMe\(\)/);
  assert.match(bloco, /out\?\.propriaConta && atual/);
  assert.match(bloco, /deveTrocar: false/);
});
