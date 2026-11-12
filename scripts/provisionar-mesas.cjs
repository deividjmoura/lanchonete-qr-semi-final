'use strict';

/**
 * Provisiona as mesas que faltam sem apagar nem alterar registros existentes.
 * Execução única de release: node scripts/provisionar-mesas.cjs
 */
require('dotenv').config();
const pool = require('../db/pool');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO configuracao_mesas (id, quantidade) VALUES (1, 20) ON CONFLICT (id) DO NOTHING'
    );
    const { rows } = await client.query(
      'SELECT quantidade FROM configuracao_mesas WHERE id = 1 FOR UPDATE'
    );
    if (!rows[0]) throw new Error('Configuração de mesas não encontrada.');
    const quantidade = Number(rows[0].quantidade);
    if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 70) {
      throw new Error('Quantidade configurada fora do limite seguro (1 a 70).');
    }
    const result = await client.query(
      `INSERT INTO mesas (numero)
       SELECT serie.numero
         FROM generate_series(1, $1::int) AS serie(numero)
        WHERE NOT EXISTS (
          SELECT 1 FROM mesas m WHERE m.numero = serie.numero
        )`,
      [quantidade]
    );
    const total = await client.query(
      'SELECT COUNT(*)::int AS total FROM mesas WHERE numero BETWEEN 1 AND $1',
      [quantidade]
    );
    if (Number(total.rows[0].total) < quantidade) {
      throw new Error('A conferência encontrou menos mesas que a quantidade configurada.');
    }
    await client.query('COMMIT');
    console.log(`✅ Mesas provisionadas: ${quantidade} habilitadas; ${result.rowCount} registros novos; ${total.rows[0].total} conferidos.`);
    console.log('Nenhuma mesa, sessão, pedido ou outro dado existente foi removido ou alterado.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error('❌ Falha ao provisionar mesas:', error.message || error);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
