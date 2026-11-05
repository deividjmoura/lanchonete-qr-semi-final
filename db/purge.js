// Purga do histórico: ANONIMIZA sessões fechadas antigas, sem apagar o registro
// financeiro.
//
// Decisão do responsável na issue #44: a purga remove dados pessoais
// (`cliente_nome`, observações livres) e PRESERVA valor, forma de pagamento e
// data. Antes esta função apagava sessões, pedidos, itens e pagamentos — o que
// destruía exatamente a evidência de conciliação e de disputa que a operação
// precisa manter.
//
// O que a purga NÃO faz, de propósito:
//   - não inventa prazo de retenção (o `before` é sempre informado por quem
//     executa; nada roda em agendamento automático);
//   - não toca em sessão aberta nem em pedido de mesa ativa;
//   - não apaga autoria: `operador_id`, `garcom_*`, valores, formas e datas
//     continuam intactos. Autoria não é dado do cliente.
//   - não presume base legal: o que é "dado pessoal" aqui é só o que foi
//     digitado pelo cliente ou sobre ele.
const pool = require('./pool');
const { registrarEvento } = require('./auditoria');
const { colunaExiste } = require('./conta');

class ErroPurge extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Sentinela do que sobrou. Não é string vazia: NULL significaria "cliente não
// informou" e apagaria a diferença entre "nunca teve nome" e "foi anonimizado".
const ANONIMIZADO = '[anonimizado]';

const SESSOES_ALVO = `s.status = 'fechada' AND s.fechada_em::date < $1::date`;

/**
 * Conta o que seria anonimizado (dry-run) ou executa a anonimização.
 *
 * Só toca em sessões **fechadas** com `fechada_em::date < before`.
 * `before` = YYYY-MM-DD, exclusivo.
 *
 * @param {{ before: string, confirm?: boolean, dryRun?: boolean,
 *           ator?: {id:number, nome?:string}, requestId?: string }} opts
 */
async function purgeHistorico(opts = {}) {
  const before = opts.before;
  const confirm = opts.confirm === true;
  const dryRun = opts.dryRun === true || !confirm;

  if (!before || !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    throw new ErroPurge('Informe before (YYYY-MM-DD)');
  }

  const client = await pool.connect();
  try {
    // A coluna `pix_avisos.cliente_nome` pode não existir em bancos antigos;
    // a purga degrada limpo em vez de estourar.
    const temPixCliente = await colunaExiste('pix_avisos', 'cliente_nome')(client).catch(() => false);

    const { rows: counts } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM mesa_sessoes s
           WHERE ${SESSOES_ALVO} AND s.cliente_nome IS NOT NULL
             AND s.cliente_nome <> $2) AS sessoes,
         (SELECT COUNT(*)::int FROM pedidos p
           JOIN mesa_sessoes s ON s.id = p.sessao_id
           WHERE ${SESSOES_ALVO}
             AND (p.cliente_nome IS NOT NULL AND p.cliente_nome <> $2
                  OR p.observacao_geral IS NOT NULL AND p.observacao_geral <> $2)) AS pedidos,
         (SELECT COUNT(*)::int FROM itens_pedido ip
           JOIN pedidos p ON p.id = ip.pedido_id
           JOIN mesa_sessoes s ON s.id = p.sessao_id
           WHERE ${SESSOES_ALVO} AND ip.observacao IS NOT NULL
             AND ip.observacao <> $2) AS itens,
         (SELECT COUNT(*)::int FROM mesa_sessoes s
           WHERE ${SESSOES_ALVO}) AS "contasPreservadas",
         (SELECT COUNT(*)::int FROM sessao_pagamentos sp
           JOIN mesa_sessoes s ON s.id = sp.sessao_id
           WHERE ${SESSOES_ALVO}) AS "pagamentosPreservados"`,
      [before, ANONIMIZADO]
    );

    const preview = {
      before,
      sessoes: counts[0].sessoes,
      pedidos: counts[0].pedidos,
      itens: counts[0].itens,
      contasPreservadas: counts[0].contasPreservadas,
      pagamentosPreservados: counts[0].pagamentosPreservados,
    };

    if (dryRun) {
      return { dryRun: true, anonimizado: false, ...preview };
    }

    if (preview.contasPreservadas === 0) {
      return {
        dryRun: false,
        anonimizado: false,
        ...preview,
        message: 'Nada para anonimizar neste período.',
      };
    }

    await client.query('BEGIN');

    // Observação do item: pode conter nome, telefone ou recado do cliente.
    const itens = await client.query(
      `UPDATE itens_pedido ip
          SET observacao = $2
        FROM pedidos p
        JOIN mesa_sessoes s ON s.id = p.sessao_id
       WHERE ip.pedido_id = p.id
         AND ${SESSOES_ALVO}
         AND ip.observacao IS NOT NULL
         AND ip.observacao <> $2
       RETURNING ip.id`,
      [before, ANONIMIZADO]
    );

    // Pedido: nome e observação geral. `observacao_geral` é campo livre — é o
    // lugar mais provável de alguém ter escrito um telefone.
    const pedidos = await client.query(
      `UPDATE pedidos p
          SET cliente_nome = CASE WHEN p.cliente_nome IS NOT NULL THEN $2 ELSE NULL END,
              observacao_geral = CASE WHEN p.observacao_geral IS NOT NULL THEN $2 ELSE NULL END
         FROM mesa_sessoes s
       WHERE s.id = p.sessao_id
         AND ${SESSOES_ALVO}
         AND (p.cliente_nome IS NOT NULL AND p.cliente_nome <> $2
              OR p.observacao_geral IS NOT NULL AND p.observacao_geral <> $2)
       RETURNING p.id`,
      [before, ANONIMIZADO]
    );

    // Sessão: nome do cliente. Valor, forma, desconto, taxa e datas ficam.
    const sessoes = await client.query(
      `UPDATE mesa_sessoes s
          SET cliente_nome = $2
        WHERE ${SESSOES_ALVO}
          AND s.cliente_nome IS NOT NULL
          AND s.cliente_nome <> $2
       RETURNING s.id`,
      [before, ANONIMIZADO]
    );

    // Avisos de PIX do cliente: nome informado no "já paguei".
    let pixAvisos = 0;
    if (temPixCliente) {
      const r = await client.query(
        `UPDATE pix_avisos pa
            SET cliente_nome = $2
           FROM mesa_sessoes s
          WHERE s.id = pa.sessao_id
            AND ${SESSOES_ALVO}
            AND pa.cliente_nome IS NOT NULL
            AND pa.cliente_nome <> $2
         RETURNING pa.id`,
        [before, ANONIMIZADO]
      );
      pixAvisos = r.rowCount;
    }

    const ator = opts.ator && Number.isInteger(opts.ator.id) ? opts.ator : null;
    await registrarEvento(client, {
      atorTipo: ator ? 'staff' : 'sistema',
      atorId: ator ? ator.id : null,
      atorNome: ator ? ator.nome || null : null,
      acao: 'historico_anonimizado',
      alvoTipo: 'historico',
      alvoId: before,
      requestId: opts.requestId || null,
      contexto: {
        before,
        sessoesAnonimizadas: sessoes.rowCount,
        pedidosAnonimizados: pedidos.rowCount,
        itensAnonimizados: itens.rowCount,
        pixAvisosAnonimizados: pixAvisos,
        // Prova de que nada financeiro foi removido nesta operação.
        contasPreservadas: preview.contasPreservadas,
        pagamentosPreservados: preview.pagamentosPreservados,
      },
    });

    await client.query('COMMIT');

    return {
      dryRun: false,
      anonimizado: true,
      before,
      sessoes: sessoes.rowCount,
      pedidos: pedidos.rowCount,
      itens: itens.rowCount,
      pixAvisos,
      contasPreservadas: preview.contasPreservadas,
      pagamentosPreservados: preview.pagamentosPreservados,
      message:
        `Anonimizado: ${sessoes.rowCount} sessão(ões), ${pedidos.rowCount} pedido(s), ` +
        `${itens.rowCount} item(ns) e ${pixAvisos} aviso(s) de PIX fechados antes de ${before}. ` +
        `Valor, forma de pagamento, datas e autoria foram preservados — ` +
        `${preview.contasPreservadas} conta(s) continuam em Relatório e Comprovantes.`,
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { purgeHistorico, ErroPurge, ANONIMIZADO };
