'use strict';

// Issue #39 (critério APP_TIMEZONE): caracteriza a regra atual de "dia
// operacional". Hoje os relatórios usam a meia-noite civil no fuso
// APP_TIMEZONE (default America/Sao_Paulo); uma virada configurável (ex.:
// 05:00) continua sendo decisão de negócio pendente e é tratada em docs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function diaLocalPara(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

test('instantes em volta da meia-noite de São Paulo caem no dia civil correto', () => {
  const tz = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
  // 2026-10-26 02:59 UTC = 2026-10-25 23:59 em São Paulo (UTC-3, sem DST)
  const antes = new Date('2026-10-26T02:59:00Z');
  const depois = new Date('2026-10-26T03:01:00Z');
  assert.equal(diaLocalPara(antes, tz), '2026-10-25');
  assert.equal(diaLocalPara(depois, tz), '2026-10-26');
});

test('sem APP_TIMEZONE os módulos de relatório convergem no default America/Sao_Paulo', () => {
  const dashboard = fs.readFileSync(path.join(__dirname, '..', 'db', 'dashboard.js'), 'utf8');
  const atendimento = fs.readFileSync(path.join(__dirname, '..', 'db', 'atendimento.js'), 'utf8');
  const relatorio = fs.readFileSync(path.join(__dirname, '..', 'db', 'relatorio.js'), 'utf8');
  for (const fonte of [dashboard, atendimento, relatorio]) {
    assert.match(fonte, /APP_TIMEZONE \|\| 'America\/Sao_Paulo'/);
  }
  // o fuso usado em SQL é sanitizado contra injeção de literal
  assert.match(relatorio, /function tzSeguro/);
});

test('a regra de meia-noite civil está documentada junto da decisão pendente de virada às 05:00', () => {
  const plano = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'engineering', 'production-readiness-plan.md'),
    'utf8'
  );
  assert.match(plano, /05:00/);
  assert.match(plano, /APP_TIMEZONE/);
});
