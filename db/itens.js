// Regras compartilhadas do ciclo de vida de CADA item. O pedido é uma projeção
// destes estados, nunca a fonte que sobrescreve o trabalho de outro setor.
const { registrarEvento } = require('./auditoria');

const STATUS_PREPARACAO = Object.freeze(['recebido', 'em_producao']);
const STATUS_RETIRADA = Object.freeze(['concluido', 'aceito', 'retirado']);
const STATUS_TERMINAIS = Object.freeze(['entregue', 'cancelado']);
const TRANSICOES_PRODUCAO = Object.freeze({ recebido: ['em_producao', 'concluido'], em_producao: ['concluido'] });

function calcularStatusPedido(statuses) {
  if (!statuses.length) return null;
  if (statuses.every((s) => s === 'cancelado')) return 'cancelado';
  if (statuses.every((s) => STATUS_TERMINAIS.includes(s))) return 'entregue';
  if (statuses.every((s) => !STATUS_PREPARACAO.includes(s))) return 'concluido';
  if (statuses.some((s) => s !== 'recebido' && s !== 'cancelado')) return 'em_producao';
  return 'recebido';
}

async function sincronizarStatusPedido(client, pedidoId) {
  const { rows } = await client.query(
    `SELECT COALESCE(status,'recebido') AS status FROM itens_pedido WHERE pedido_id=$1`, [pedidoId]
  );
  const status = calcularStatusPedido(rows.map((r) => r.status));
  if (!status) return null;
  const result = await client.query(
    `UPDATE pedidos SET status=$2 WHERE id=$1
     RETURNING id,status,criado_em,editado_em,cliente_nome,sessao_id`, [pedidoId, status]
  );
  return result.rows[0] || null;
}

/** Ordem global: mesa → sessão → pedido → itens. Chamador mantém a transação. */
async function travarContextoPedido(client, pedidoId) {
  const { rows: refs } = await client.query('SELECT sessao_id FROM pedidos WHERE id=$1', [pedidoId]);
  if (!refs[0]) return null;
  const { rows: sessRef } = await client.query('SELECT mesa_id FROM mesa_sessoes WHERE id=$1', [refs[0].sessao_id]);
  if (!sessRef[0]) return null;
  await client.query('SELECT id FROM mesas WHERE id=$1 FOR UPDATE', [sessRef[0].mesa_id]);
  const { rows: sessoes } = await client.query('SELECT * FROM mesa_sessoes WHERE id=$1 FOR UPDATE', [refs[0].sessao_id]);
  const { rows: pedidos } = await client.query('SELECT * FROM pedidos WHERE id=$1 FOR UPDATE', [pedidoId]);
  const { rows: itens } = await client.query(
    `SELECT ip.*, COALESCE(ip.setor,pr.setor,'cozinha') AS setor
     FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.produto_id
     WHERE ip.pedido_id=$1 ORDER BY ip.id FOR UPDATE OF ip`, [pedidoId]
  );
  return { sessao: sessoes[0], pedido: pedidos[0], itens };
}

async function registrarHistoricoItem(client, item, statusAnterior, status, ator = {}, requestId = null, motivo = null) {
  const tipo = ator.tipo || 'sistema';
  await client.query(
    `INSERT INTO itens_pedido_historico
      (item_pedido_id,pedido_id,status_anterior,status,ator_tipo,garcom_id,staff_id,request_id,motivo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [item.id, item.pedido_id, statusAnterior, status, tipo,
      tipo === 'garcom' ? ator.id || null : null,
      tipo === 'staff' ? ator.id || null : null, requestId, motivo]
  );
  await registrarEvento(client, {
    atorTipo: tipo, atorId: ator.id || null, atorNome: ator.nome || null,
    acao: 'item_status', alvoTipo: 'item_pedido', alvoId: String(item.id), requestId,
    contexto: { pedidoId: Number(item.pedido_id), statusAnterior: statusAnterior || 'criado', status, motivo },
  });
}

/** O chamador já validou a transição e possui os locks do contexto. */
async function gravarStatusItem(client, item, status, ator = {}, requestId = null, motivo = null) {
  const campos = {
    iniciado_em: status === 'em_producao' ? 'now()' : null,
    pronto_em: status === 'concluido' ? 'now()' : null,
    aceito_em: status === 'aceito' ? 'now()' : null,
    retirado_em: status === 'retirado' ? 'now()' : null,
    entregue_em: status === 'entregue' ? 'now()' : null,
    cancelado_em: status === 'cancelado' ? 'now()' : null,
  };
  const sets = ['status=$2'];
  const params = [item.id, status];
  for (const [campo, valor] of Object.entries(campos)) {
    if (valor) sets.push(`${campo}=COALESCE(${campo},now())`);
  }
  if (status === 'concluido' && ator.tipo === 'staff') sets.push(`preparado_por_staff_id=COALESCE(preparado_por_staff_id,$${params.push(ator.id)})`);
  if (status === 'aceito') sets.push(`aceito_por_id=$${params.push(ator.id)}`);
  if (status === 'retirado') sets.push(`retirado_por_id=$${params.push(ator.id)}`);
  if (status === 'entregue' && ator.tipo === 'garcom') sets.push(`entregue_por_id=$${params.push(ator.id)}`);
  if (status === 'cancelado') {
    sets.push(`cancelamento_motivo=$${params.push(motivo)}`);
    if (ator.tipo === 'staff') sets.push(`cancelado_por_staff_id=$${params.push(ator.id)}`);
    if (ator.tipo === 'garcom') sets.push(`cancelado_por_garcom_id=$${params.push(ator.id)}`);
  }
  await client.query(`UPDATE itens_pedido SET ${sets.join(',')} WHERE id=$1`, params);
  await registrarHistoricoItem(client, item, item.status, status, ator, requestId, motivo);
}

async function listarHistoricoPedido(client, pedidoId) {
  const { rows } = await client.query(
    `SELECT h.id,h.item_pedido_id AS "itemId",h.status_anterior AS "statusAnterior",h.status,
            h.ator_tipo AS "atorTipo",h.garcom_id AS "garcomId",h.staff_id AS "staffId",
            COALESCE(g.nome,s.nome,h.ator_tipo) AS "atorNome",h.criado_em AS "em",h.request_id AS "requestId",h.motivo
     FROM itens_pedido_historico h
     LEFT JOIN garcons g ON g.id=h.garcom_id LEFT JOIN staff s ON s.id=h.staff_id
     WHERE h.pedido_id=$1 ORDER BY h.criado_em,h.id`, [pedidoId]
  );
  return rows;
}

module.exports = { STATUS_PREPARACAO, STATUS_RETIRADA, STATUS_TERMINAIS, TRANSICOES_PRODUCAO,
  calcularStatusPedido, sincronizarStatusPedido, travarContextoPedido,
  gravarStatusItem, registrarHistoricoItem, listarHistoricoPedido };
