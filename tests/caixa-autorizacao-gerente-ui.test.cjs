const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const caixa = fs.readFileSync('src/screens/Caixa.tsx', 'utf8');

test('credenciais do gerente têm ação explícita para autorizar e fechar', () => {
  const inicio = caixa.indexOf('Autorização do gerente (obrigatória)');
  assert.ok(inicio >= 0, 'bloco de autorização do gerente deve existir');
  const fim = caixa.indexOf('className="mt-5 pt-4 border-t border-dashed', inicio);
  const bloco = caixa.slice(inicio, fim > inicio ? fim : inicio + 3000);
  assert.match(bloco, /Autorizar desconto e fechar conta/);
  assert.match(bloco, /onClick=\{fechar\}/);
  assert.match(bloco, /disabled=\{!podeEncerrar\}/);
  assert.match(bloco, /validados pelo servidor/);
});

test('fechamento comum não duplica a ação quando gerente é obrigatório', () => {
  assert.match(caixa, /\{!precisaGerente && \([\s\S]*?Fechar conta/);
});
