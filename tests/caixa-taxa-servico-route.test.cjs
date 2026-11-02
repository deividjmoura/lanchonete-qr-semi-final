// Regressão: a tela do caixa calcula consumo + serviço e a rota precisa
// usar o mesmo teto ao registrar pagamentos parciais.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server.js', 'utf8');
const inicio = server.indexOf("p.match(/^\\/api\\/caixa\\/sessoes\\/(\\d+)\\/pagamentos$/)");
assert.ok(inicio >= 0, 'rota de pagamentos do caixa deve existir');
const fim = server.indexOf("if ((m = p.match", inicio + 10);
const rota = server.slice(inicio, fim > inicio ? fim : inicio + 1600);

test('pagamentos do caixa aplicam o mesmo serviço padrão exibido na tela', () => {
  assert.match(rota, /incluirServico:\s*true/);
});
