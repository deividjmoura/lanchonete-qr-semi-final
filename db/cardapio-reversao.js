'use strict';
const pool = require('./pool');
const { randomUUID } = require('node:crypto');

// Locks de catálogo também bloqueiam edições/baixas de estoque enquanto o
// snapshot é criado ou restaurado. O advisory serializa mesmo catálogo vazio.
async function bloquearCatalogo(client) {
  await client.query('SELECT pg_advisory_xact_lock(4040040)');
  await client.query('LOCK TABLE categorias, produtos, adicionais, produtos_ingredientes_removiveis IN SHARE ROW EXCLUSIVE MODE');
}
// xmin detects later UPDATEs even when a quantity is changed back to the same value.
async function snapshot(client) {
  const { rows } = await client.query(`SELECT jsonb_build_object(
    'categorias', COALESCE((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object('_versaoLinha', c.xmin::text) ORDER BY c.id) FROM categorias c), '[]'::jsonb),
    'produtos', COALESCE((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('_versaoLinha', p.xmin::text) ORDER BY p.id) FROM produtos p), '[]'::jsonb),
    'adicionais', COALESCE((SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('_versaoLinha', a.xmin::text) ORDER BY a.id) FROM adicionais a), '[]'::jsonb),
    'removiveis', COALESCE((SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('_versaoLinha', r.xmin::text) ORDER BY r.produto_id, r.ingrediente) FROM produtos_ingredientes_removiveis r), '[]'::jsonb)
  ) AS estado`);
  return rows[0]?.estado;
}
async function guardarReversao(client, anterior) {
  const posterior = await snapshot(client);
  const versao = randomUUID();
  await client.query(`INSERT INTO cardapio_import_reversao (id, versao, anterior, posterior)
    VALUES (1, $1, $2::jsonb, $3::jsonb)
    ON CONFLICT (id) DO UPDATE SET versao=EXCLUDED.versao, anterior=EXCLUDED.anterior,
      posterior=EXCLUDED.posterior, criado_em=now(), revertido_em=NULL`,
  [versao, JSON.stringify(anterior), JSON.stringify(posterior)]);
  return versao;
}
async function statusReversao() {
  const { rows } = await pool.query(`SELECT versao, criado_em AS "criadoEm", revertido_em IS NULL AS disponivel
    FROM cardapio_import_reversao WHERE id=1`);
  return rows[0] || { disponivel: false };
}
function conflito(mensagem) {
  return Object.assign(new Error(mensagem), { status: 409 });
}
async function reverterCardapio({ versao, ator = null, requestId = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await bloquearCatalogo(client);
    const { rows } = await client.query('SELECT * FROM cardapio_import_reversao WHERE id=1 FOR UPDATE');
    const ponto = rows[0];
    if (!ponto || ponto.revertido_em || ponto.versao !== versao) {
      throw conflito('A última importação não está mais disponível para reversão. Reabra a janela.');
    }
    const atual = await snapshot(client);
    const { rows: comparacao } = await client.query('SELECT $1::jsonb = $2::jsonb AS igual',
      [JSON.stringify(atual), JSON.stringify(ponto.posterior)]);
    if (!comparacao[0].igual) {
      throw conflito('O cardápio ou estoque mudou após a importação. Reversão bloqueada para preservar as alterações e baixas de estoque.');
    }
    // Categorias vazias removidas pela importação precisam voltar com o mesmo ID.
    for (const c of ponto.anterior.categorias) {
      await client.query(`INSERT INTO categorias (id, nome, ordem) VALUES ($1,$2,$3)
        ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome, ordem=EXCLUDED.ordem`, [c.id, c.nome, c.ordem]);
    }
    const idsAnteriores = ponto.anterior.produtos.map((p) => p.id);
    // Nunca apaga produtos novos: podem estar referenciados por pedidos.
    await client.query(`UPDATE produtos SET arquivado=TRUE, disponivel=FALSE
      WHERE NOT (id = ANY($1::int[]))`, [idsAnteriores]);
    for (const p of ponto.anterior.produtos) {
      await client.query(`UPDATE produtos SET categoria_id=$2, nome=$3, descricao=$4,
        preco=$5, foto_url=$6, disponivel=$7, ordem=$8, controla_estoque=$9,
        estoque=$10, arquivado=$11 WHERE id=$1`,
      [p.id, p.categoria_id, p.nome, p.descricao, p.preco, p.foto_url, p.disponivel,
        p.ordem, p.controla_estoque, p.estoque, p.arquivado]);
    }
    await client.query(`DELETE FROM categorias c WHERE NOT (id = ANY($1::int[]))
      AND NOT EXISTS (SELECT 1 FROM produtos p WHERE p.categoria_id=c.id)`,
    [ponto.anterior.categorias.map((c) => c.id)]);
    await client.query('UPDATE cardapio_import_reversao SET revertido_em=now() WHERE id=1');
    if (ator && Number.isInteger(ator.id)) {
      await require('./auditoria').registrarEvento(client, {
        atorTipo: 'staff', atorId: ator.id, atorNome: ator.nome || null,
        acao: 'cardapio_importacao_revertida', alvoTipo: 'cardapio', alvoId: null,
        requestId, contexto: { versao },
      });
    }
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}
module.exports = { bloquearCatalogo, snapshot, guardarReversao, statusReversao, reverterCardapio };
