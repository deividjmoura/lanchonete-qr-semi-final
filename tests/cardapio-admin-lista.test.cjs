'use strict';

/**
 * Lista do cardápio no admin (Admin → Cardápio).
 *
 * Regressão da importação por CSV: a consulta de categorias de
 * `getCardapioAdmin` foi invertida e o admin passou a receber só as categorias
 * *sem* produto ativo — como a tela agrupa os produtos por categoria, a lista
 * de produtos sumia. Estes testes travam a regra certa:
 *
 *   - categoria com produto ativo  → aparece;
 *   - categoria só com arquivados  → não aparece (nada para editar);
 *   - categoria vazia (criada à mão) → aparece, esperando produtos;
 *   - banco sem a migration 0033 (coluna `arquivado`) → lista mesmo assim.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:5432/qradmin_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pool = require('../db/pool');
const { getCardapioAdmin } = require('../db/admin');

const codigoAdmin = fs.readFileSync(path.join(__dirname, '..', 'db', 'admin.js'), 'utf8');

const PRODUTO_ATIVO = {
  id: 11, categoria_id: 1, nome: 'X-Burger', descricao: 'Pão e carne', preco: '25.90',
  foto_url: null, disponivel: true, pede_ponto_carne: false, controla_estoque: false,
  estoque: null, estoque_minimo: 0, ordem: 1, setor: 'cozinha',
};

/**
 * Pool falso: responde por tipo de consulta e registra o SQL executado.
 * `categorias` é a lista que a consulta de categorias devolveria.
 */
function poolFalso({ categorias, produtos = [], falharCategorias = null }) {
  const chamadas = [];
  return {
    chamadas,
    query: async (sql) => {
      chamadas.push(sql);
      if (/FROM categorias/.test(sql)) {
        if (falharCategorias) throw falharCategorias;
        return { rows: categorias };
      }
      if (/FROM produtos/.test(sql)) return { rows: produtos };
      if (/FROM adicionais/.test(sql)) return { rows: [] };
      if (/FROM produtos_ingredientes_removiveis/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
}

function comPool(falso, fn) {
  const original = pool.query;
  pool.query = falso.query;
  return Promise.resolve()
    .then(fn)
    .finally(() => { pool.query = original; });
}

test('consulta de categorias do admin tem a condição na ordem certa (produto ativo aparece)', () => {
  const match = codigoAdmin.match(/const SQL_CATEGORIAS_ADMIN = `([\s\S]*?)`;/);
  assert.ok(match, 'consulta de categorias do admin precisa existir como constante');
  const sql = match[1];

  // Categoria com produto ativo: EXISTS (não NOT EXISTS).
  assert.match(
    sql,
    /WHERE EXISTS \(\s*SELECT 1 FROM produtos p\s*WHERE p\.categoria_id = c\.id AND p\.arquivado = FALSE/,
    'categoria com produto ativo precisa entrar na lista',
  );
  // Categoria vazia criada à mão continua visível.
  assert.match(sql, /OR NOT EXISTS \(\s*SELECT 1 FROM produtos p WHERE p\.categoria_id = c\.id/);
  // O texto invertido (que escondia as categorias com produto) não volta.
  assert.doesNotMatch(
    sql,
    /WHERE NOT EXISTS \(\s*SELECT 1 FROM produtos p\s*WHERE p\.categoria_id = c\.id AND p\.arquivado = FALSE/,
  );
  // Produtos arquivados continuam fora da lista de edição.
  assert.match(codigoAdmin, /FROM produtos WHERE arquivado = FALSE/);
});

test('admin recebe cada produto dentro da sua categoria (lista editável item a item)', async () => {
  const falso = poolFalso({
    categorias: [{ id: 1, nome: 'Lanches', ordem: 0 }, { id: 2, nome: 'Bebidas', ordem: 1 }],
    produtos: [PRODUTO_ATIVO],
  });

  const lista = await comPool(falso, () => getCardapioAdmin());

  assert.equal(lista.length, 2, 'as duas categorias com produto ativo/vazia aparecem');
  assert.deepEqual(lista.map((c) => c.nome), ['Lanches', 'Bebidas']);
  assert.equal(lista[0].produtos.length, 1, 'o produto volta na categoria dele');
  assert.equal(lista[0].produtos[0].nome, 'X-Burger');
  assert.equal(lista[0].produtos[0].preco, 25.9);
  assert.deepEqual(lista[1].produtos, []);
  assert.deepEqual(lista[0].produtos[0].adicionais, []);
  assert.deepEqual(lista[0].produtos[0].removiveis, []);
});

test('banco sem a coluna arquivado (migration 0033 pendente) não derruba a lista', async () => {
  const erroDeColuna = Object.assign(new Error('column "arquivado" does not exist'), { code: '42703' });
  const falso = poolFalso({ categorias: [{ id: 1, nome: 'Lanches', ordem: 0 }] });
  let primeira = true;
  const original = pool.query;
  pool.query = async (sql, params) => {
    if (primeira && /FROM categorias/.test(sql)) {
      primeira = false;
      throw erroDeColuna;
    }
    return falso.query(sql, params);
  };

  try {
    const lista = await getCardapioAdmin();
    assert.equal(lista.length, 1);
    assert.equal(lista[0].nome, 'Lanches');
    assert.equal(lista[0].produtos.length, 0);
  } finally {
    pool.query = original;
  }
});

test('erro que não é de coluna ausente continua subindo (não esconde falha real)', async () => {
  const falha = Object.assign(new Error('conexão perdida'), { code: 'ECONNRESET' });
  const falso = poolFalso({ categorias: [], falharCategorias: falha });

  await assert.rejects(() => comPool(falso, () => getCardapioAdmin()), /conexão perdida/);
});
