#!/usr/bin/env node
/**
 * Marca produtos de bebida com setor = 'bar'.
 * Motivo: migration 0013 deixa default 'cozinha'; seed antigo não grava setor;
 * sem isso a fila do Bar fica vazia e tudo cai na Cozinha.
 *
 * Uso (na raiz do projeto, com DATABASE_URL no .env):
 *   node scripts/fix-setor-produtos.js
 *   node scripts/fix-setor-produtos.js --dry-run
 */
require('dotenv').config();
const pool = require('../db/pool');

const dry = process.argv.includes('--dry-run');

const CAT_PATTERNS = [
  '%bebida%',
  '%drink%',
  '%cerveja%',
  '%chopp%',
  '%chop%',
  '%suco%',
  '%refriger%',
  '%refri%',
  '%long neck%',
  '%longneck%',
  '%dose%',
  '%caipi%',
  '%coquetel%',
  '%cocktail%',
  '%vinho%',
  '%whisky%',
  '%whiskey%',
  '%vodka%',
  '%gin%',
  '%bar%',
  '%shake%',
  '%smoothie%',
  '%energet%',
  '%agua%',
  '%água%',
];

const NOME_PATTERNS = [
  '%coca%',
  '%guaraná%',
  '%guarana%',
  '%fanta%',
  '%sprite%',
  '%pepsi%',
  '%heineken%',
  '%budweiser%',
  '%stella%',
  '%corona%',
  '%brahma%',
  '%skol%',
  '%antarctica%',
  '%água%',
  '%agua mineral%',
  '%suco%',
  '%caipirinha%',
  '%caipi%',
  '%drink%',
  '%coquetel%',
  '%cocktail%',
  '%cerveja%',
  '%chopp%',
  '%long neck%',
  '%refrigerante%',
  '%refri%',
  '%milk%shake%',
  '%milkshake%',
  '%energetico%',
  '%energético%',
  '%red bull%',
  '%vinho%',
  '%whisky%',
  '%vodka%',
  '%gin t%',
];

async function main() {
  const client = await pool.connect();
  try {
    // Garante coluna (migration 0013)
    await client.query(`
      ALTER TABLE produtos
        ADD COLUMN IF NOT EXISTS setor TEXT NOT NULL DEFAULT 'cozinha'
    `);
    // CHECK pode falhar se já existe com outro nome — ignore
    try {
      await client.query(`
        ALTER TABLE produtos DROP CONSTRAINT IF EXISTS produtos_setor_check
      `);
      await client.query(`
        ALTER TABLE produtos
          ADD CONSTRAINT produtos_setor_check CHECK (setor IN ('cozinha', 'bar'))
      `);
    } catch (e) {
      console.warn('Aviso constraint setor:', e.message || e);
    }

    await client.query(`
      ALTER TABLE itens_pedido
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'recebido'
    `);

    const { rows: antes } = await client.query(`
      SELECT COALESCE(setor, 'cozinha') AS setor, COUNT(*)::int AS n
      FROM produtos GROUP BY 1 ORDER BY 1
    `);
    console.log('Antes:', antes);

    const catClause = CAT_PATTERNS.map((_, i) => `c.nome ILIKE $${i + 1}`).join(' OR ');
    const nomeClause = NOME_PATTERNS.map(
      (_, i) => `p.nome ILIKE $${CAT_PATTERNS.length + i + 1}`
    ).join(' OR ');
    const params = [...CAT_PATTERNS, ...NOME_PATTERNS];

    const sql = `
      UPDATE produtos p
         SET setor = 'bar'
        FROM categorias c
       WHERE c.id = p.categoria_id
         AND COALESCE(p.setor, 'cozinha') <> 'bar'
         AND (${catClause} OR ${nomeClause})
    `;

    if (dry) {
      const { rows } = await client.query(
        `
        SELECT p.id, p.nome, c.nome AS categoria, COALESCE(p.setor, 'cozinha') AS setor
          FROM produtos p
          JOIN categorias c ON c.id = p.categoria_id
         WHERE COALESCE(p.setor, 'cozinha') <> 'bar'
           AND (${catClause} OR ${nomeClause})
         ORDER BY c.nome, p.nome
        `,
        params
      );
      console.log(`[dry-run] ${rows.length} produto(s) passariam a setor=bar:`);
      for (const r of rows) {
        console.log(`  #${r.id}  [${r.categoria}]  ${r.nome}  (hoje: ${r.setor})`);
      }
    } else {
      const { rowCount } = await client.query(sql, params);
      console.log(`✅ ${rowCount} produto(s) atualizados para setor=bar`);
    }

    const { rows: depois } = await client.query(`
      SELECT COALESCE(setor, 'cozinha') AS setor, COUNT(*)::int AS n
      FROM produtos GROUP BY 1 ORDER BY 1
    `);
    console.log('Depois:', depois);

    const { rows: amostra } = await client.query(`
      SELECT p.id, p.nome, c.nome AS categoria, p.setor
        FROM produtos p
        JOIN categorias c ON c.id = p.categoria_id
       WHERE p.setor = 'bar'
       ORDER BY c.nome, p.nome
       LIMIT 30
    `);
    console.log('Amostra bar (até 30):');
    for (const r of amostra) {
      console.log(`  #${r.id}  [${r.categoria}]  ${r.nome}`);
    }

    if (!amostra.length) {
      console.log(`
⚠️  Nenhum produto com setor=bar.
    No Admin → Cardápio, abra cada bebida e marque Setor = Bar, depois Salvar.
    Ou ajuste os padrões em scripts/fix-setor-produtos.js para os nomes das suas categorias.
`);
    } else {
      console.log(`
Pronto. Faça um pedido novo (ou use mesa com pedido aberto):
  • itens de comida → /#/cozinha
  • itens de bebida → /#/bar
`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
