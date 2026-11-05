'use strict';

/**
 * Complemento de regressão da remoção de e-mail Google pré-cadastrado (#239).
 *
 * A implementação base (rota, escrita condicionada a `google_sub IS NULL`,
 * botão na tela) já está coberta por tests/auditoria.test.cjs e
 * tests/postgres-google-oauth.test.cjs. Este arquivo trava o que faltava:
 *
 *  - a NEGATIVA também vai para a trilha da #48 (`resultado: 'negado'` com
 *    motivo), distinguível de operação concluída e sem PII/segredo;
 *  - a documentação descreve o ciclo de vida do e-mail, as restrições de conta
 *    vinculada e o que segue pendente de decisão do responsável.
 *
 * Roda sem PostgreSQL (a integração HTTP está em
 * tests/postgres-remover-email-google-http.test.cjs, executada no CI).
 */

require('dotenv').config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://regress:regress@127.0.0.1:5432/regress';
}

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

const admin = ler('db/admin.js');
const auditoria = ler('db/auditoria.js');
const docs = ler('docs/engineering/google-oauth-setup.md');

function blocoRemocao() {
  const inicio = admin.indexOf('async function removerEmailGoogleStaff(');
  assert.ok(inicio > 0, 'removerEmailGoogleStaff existe');
  const fim = admin.indexOf('async function listMesas()', inicio);
  return admin.slice(inicio, fim);
}

test('toda recusa da remoção é auditada como negado, com motivo e sem e-mail', () => {
  const bloco = blocoRemocao();

  assert.match(bloco, /registrarEventoIndependente\(\{/, 'negativa é gravada fora da transação desfeita');
  assert.match(bloco, /acao: 'email_google_remocao_negada'/);
  assert.match(bloco, /resultado: 'negado'/);
  assert.match(bloco, /atorTipo: 'staff'/);
  assert.match(bloco, /alvoId: String\(id\)/);
  assert.match(bloco, /requestId/);
  assert.match(bloco, /motivo: negado/);
  assert.match(bloco, /statusHttp/);
  // Nenhum endereço ou segredo no evento de recusa.
  const evento = bloco.slice(bloco.indexOf("acao: 'email_google_remocao_negada'"));
  const contexto = evento.slice(evento.indexOf('contexto:'), evento.indexOf('})'));
  assert.doesNotMatch(contexto, /email/i, 'contexto da negativa não carrega e-mail');
  assert.doesNotMatch(contexto, /senha|token|hash/i);

  for (const motivo of [
    'ator_sem_permissao',
    'conta_inexistente',
    'conta_inativa',
    'conta_vinculada_google',
    'conta_sem_email',
    'concorrencia',
  ]) {
    assert.match(bloco, new RegExp(`negado = '${motivo}'`), 'motivo registrado: ' + motivo);
  }

  // A negativa reaproveita a trilha existente e os resultados aceitos por ela.
  assert.match(auditoria, /const RESULTADOS = new Set\(\['sucesso', 'negado', 'falha'\]\)/);
});

test('o sucesso continua na mesma transação da escrita (evento antes do COMMIT)', () => {
  const bloco = blocoRemocao();
  const escrita = bloco.indexOf('SET email = NULL');
  const evento = bloco.indexOf("acao: 'email_google_removido'");
  const commit = bloco.indexOf("await client.query('COMMIT')");
  assert.ok(escrita > 0 && evento > escrita && commit > evento, 'escrita → evento → COMMIT');
  assert.match(bloco, /WHERE id = \$1 AND ativo = TRUE AND google_sub IS NULL AND email IS NOT NULL/);
  assert.match(bloco, /FOR UPDATE/);
});

test('documentação descreve o ciclo do e-mail, restrição de conta vinculada e pendências', () => {
  assert.match(docs, /## Ciclo de vida do e-mail pré-cadastrado/);
  assert.match(docs, /pré-autorização/);
  assert.match(docs, /google_sub/);
  assert.match(docs, /DELETE \/api\/admin\/contas\/:id\/email/);
  assert.match(docs, /email_google_remocao_negada/);
  assert.match(docs, /### Desvincular uma conta Google \(fora do escopo\)/);
  assert.match(docs, /### Pendente de decisão do responsável/);
  assert.match(docs, /issue #48/);
  assert.match(docs, /issue #44/);
  // Não inventar prazo: a doc diz explicitamente que nada é automático.
  assert.match(docs, /não existe expiração, tarefa periódica nem remoção automática/);
});
