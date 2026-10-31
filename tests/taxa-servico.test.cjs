// #153 — regra pura da taxa de serviço: percentual configurável e valor
// padrão sobre o consumo bruto. Não toca o banco (DATABASE_URL fake só
// para o pool carregar sem conectar).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://fake:fake@127.0.0.1:1/fake';

const test = require('node:test');
const assert = require('node:assert/strict');

const { percentualServicoPadrao, taxaServicoPadraoPara } = require('../db/caixa');

const ORIGINAL = process.env.TAXA_SERVICO_PERCENTUAL;

test.after(() => {
  if (ORIGINAL === undefined) delete process.env.TAXA_SERVICO_PERCENTUAL;
  else process.env.TAXA_SERVICO_PERCENTUAL = ORIGINAL;
});

function comPercentual(valor, fn) {
  if (valor === undefined) delete process.env.TAXA_SERVICO_PERCENTUAL;
  else process.env.TAXA_SERVICO_PERCENTUAL = valor;
  try {
    return fn();
  } finally {
    if (ORIGINAL === undefined) delete process.env.TAXA_SERVICO_PERCENTUAL;
    else process.env.TAXA_SERVICO_PERCENTUAL = ORIGINAL;
  }
}

test('percentual padrão é 10% sem configuração', () => {
  comPercentual(undefined, () => {
    assert.equal(percentualServicoPadrao(), 10);
  });
});

test('percentual respeita TAXA_SERVICO_PERCENTUAL válida', () => {
  comPercentual('8', () => assert.equal(percentualServicoPadrao(), 8));
  comPercentual('12,5', () => assert.equal(percentualServicoPadrao(), 12.5));
  comPercentual('0', () => assert.equal(percentualServicoPadrao(), 0));
});

test('percentual inválido ou fora de 0–100 cai para 10%', () => {
  comPercentual('abc', () => assert.equal(percentualServicoPadrao(), 10));
  comPercentual('-5', () => assert.equal(percentualServicoPadrao(), 10));
  comPercentual('150', () => assert.equal(percentualServicoPadrao(), 10));
  comPercentual('  ', () => assert.equal(percentualServicoPadrao(), 10));
});

test('serviço padrão incide sobre o consumo bruto, com arredondamento de 2 casas', () => {
  comPercentual(undefined, () => {
    assert.equal(taxaServicoPadraoPara(100), 10);
    assert.equal(taxaServicoPadraoPara(33.33), 3.33);
    assert.equal(taxaServicoPadraoPara(0), 0);
    assert.equal(taxaServicoPadraoPara(-5), 0);
    assert.equal(taxaServicoPadraoPara(Number.NaN), 0);
  });
  comPercentual('5', () => {
    assert.equal(taxaServicoPadraoPara(200), 10);
  });
});
