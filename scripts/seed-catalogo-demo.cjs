'use strict';

/**
 * Insere somente o catálogo fictício de demonstração.
 * Não limpa, substitui, arquiva ou atualiza registros existentes.
 *
 * Uso: CONFIRMAR_CATALOGO_DEMO=SIM npm run seed:catalogo-demo
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../db/pool');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(__dirname, 'seed-apresentacao.cjs');

function carregarCatalogo() {
  const source = fs.readFileSync(SOURCE, 'utf8');
  const match = source.match(/const catalogo = (\[[\s\S]*?\n\]);/);
  if (!match) throw new Error('Não foi possível localizar o catálogo de referência.');
  // O array é código estático versionado no próprio repositório.
  return Function('"use strict"; return (' + match[1] + ');')();
}

function validarFotos(catalogo) {
  const validos = [];
  const ausentes = [];
  for (const item of catalogo) {
    const relativo = String(item.foto || '');
    const arquivo = path.resolve(ROOT, 'public', relativo.replace(/^\/+/, ''));
    if (!relativo.startsWith('/assets/demo/') || !arquivo.startsWith(path.join(ROOT, 'public', 'assets', 'demo') + path.sep) || !fs.existsSync(arquivo) || !fs.statSync(arquivo).isFile()) {
      ausentes.push(item.nome);
      continue;
    }
    validos.push(item);
  }
  return { validos, ausentes };
}

async function main() {
  if (process.env.CONFIRMAR_CATALOGO_DEMO !== 'SIM') {
    throw new Error('Carga não iniciada. Para confirmar, defina CONFIRMAR_CATALOGO_DEMO=SIM.');
  }

  const catalogo = carregarCatalogo();
  const { validos, ausentes } = validarFotos(catalogo);
  if (ausentes.length) {
    console.warn('Itens ignorados porque a foto não existe ou não é válida:');
    for (const nome of ausentes) console.warn(' - ' + nome);
  }
  if (!validos.length) throw new Error('Nenhum item possui foto válida; nada foi gravado.');

  const client = await pool.connect();
  let inseridos = 0;
  let existentes = 0;
  let adicionaisInseridos = 0;
  let removiveisInseridos = 0;
  try {
    await client.query('BEGIN');

    const categorias = [...new Set(validos.map((p) => p.cat))];
    const idsCategoria = new Map();
    for (const [ordem, nome] of categorias.entries()) {
      const atual = await client.query(
        'SELECT id FROM categorias WHERE lower(nome) = lower($1) ORDER BY id LIMIT 1',
        [nome]
      );
      if (atual.rows[0]) {
        idsCategoria.set(nome, atual.rows[0].id);
      } else {
        const novo = await client.query(
          'INSERT INTO categorias (nome, ordem) VALUES ($1, $2) RETURNING id',
          [nome, ordem + 1]
        );
        idsCategoria.set(nome, novo.rows[0].id);
      }
    }

    for (const [ordem, item] of validos.entries()) {
      const categoriaId = idsCategoria.get(item.cat);
      const existente = await client.query(
        'SELECT id FROM produtos WHERE categoria_id = $1 AND lower(nome) = lower($2) ORDER BY id LIMIT 1',
        [categoriaId, item.nome]
      );
      if (existente.rows[0]) {
        existentes++;
        console.log('Já existe; mantido sem alterações: ' + item.nome);
        continue;
      }

      const novo = await client.query(
        `INSERT INTO produtos
          (categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne,
           controla_estoque, estoque, estoque_minimo, ordem, setor, arquivado)
         VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8,6,$9,$10,FALSE)
         RETURNING id`,
        [categoriaId, item.nome, item.descricao, item.preco, item.foto,
          Boolean(item.ponto), item.estoque != null, item.estoque ?? null,
          ordem + 1, item.setor]
      );
      const produtoId = novo.rows[0].id;
      inseridos++;

      for (const [nome, preco] of item.adicionais || []) {
        await client.query(
          'INSERT INTO adicionais (produto_id, nome, preco) VALUES ($1,$2,$3)',
          [produtoId, nome, preco]
        );
        adicionaisInseridos++;
      }
      for (const ingrediente of item.removiveis || []) {
        await client.query(
          'INSERT INTO produtos_ingredientes_removiveis (produto_id, ingrediente) VALUES ($1,$2)',
          [produtoId, ingrediente]
        );
        removiveisInseridos++;
      }
    }

    await client.query('COMMIT');
    console.log('Carga de catálogo demo concluída.');
    console.log(`Produtos inseridos: ${inseridos}; já existentes e preservados: ${existentes}; sem foto: ${ausentes.length}.`);
    console.log(`Adicionais inseridos: ${adicionaisInseridos}; ingredientes removíveis: ${removiveisInseridos}.`);
    console.log('Nenhum registro existente foi atualizado ou removido.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error('Falha na carga do catálogo demo:', error.message || error);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
