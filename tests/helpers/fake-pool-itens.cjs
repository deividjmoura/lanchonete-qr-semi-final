'use strict';

/**
 * Fake transacional do contrato de itens/entregas (migration 0027).
 *
 * Substitui os mocks antigos, que respondiam ao SQL de entrega por PEDIDO
 * (`UPDATE itens_pedido SET status='entregue' WHERE pedido_id=...`). O fluxo
 * atual trabalha por ITEM, com trava de contexto, atores por etapa, histórico
 * e status do pedido derivado. Este helper mantém estado em memória e responde
 * às consultas reais, para que os testes continuem verificando comportamento
 * (e não apenas texto de fonte).
 *
 * Não abre conexão: `install(pool)` troca query/connect e devolve restaurador.
 */

const { calcularStatusPedido } = require('../../db/itens');

function criarEstado({ garcons = [], sessao, pedido, itens = [], mesaId = 10 } = {}) {
  return {
    garcons: garcons.map((g) => ({ ativo: true, ...g })),
    mesa: { id: mesaId, numero: 4 },
    sessao: { id: 1, mesa_id: mesaId, status: 'aberta', garcom_responsavel_id: null, valor_total: 0, ...sessao },
    pedido: { id: 10, sessao_id: 1, status: 'concluido', garcom_id: null, garcom_nome: null, claimed_at: null, ...pedido },
    itens: itens.map((i) => ({
      quantidade: 1, preco_unitario: 10, setor: 'cozinha', status: 'concluido',
      aceito_por_id: null, retirado_por_id: null, entregue_por_id: null,
      pedido_id: 10, ...i,
    })),
    historico: [],
    auditoria: [],
    sql: [],
    commits: 0,
    rollbacks: 0,
    released: 0,
  };
}

function normalizar(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

function criarCliente(estado) {
  async function query(sqlBruto, params = []) {
    const sql = normalizar(sqlBruto);
    estado.sql.push({ sql, params });
    const lower = sql.toLowerCase();

    if (lower === 'begin' || lower.startsWith('begin isolation')) return { rows: [], rowCount: 0 };
    if (lower === 'commit') { estado.commits++; return { rows: [], rowCount: 0 }; }
    if (lower === 'rollback') { estado.rollbacks++; return { rows: [], rowCount: 0 }; }

    // --- identidade do garçom ---
    if (lower.includes('from garcons where token = $1')) {
      const g = estado.garcons.find((x) => x.token === params[0]);
      return { rows: g ? [g] : [], rowCount: g ? 1 : 0 };
    }
    if (lower.includes('from garcons where id=$1 for share') || lower.includes('from garcons where id = $1 for share')) {
      const g = estado.garcons.find((x) => Number(x.id) === Number(params[0]));
      return { rows: g ? [g] : [], rowCount: g ? 1 : 0 };
    }
    if (lower.includes('select g.id,g.nome from garcons g join mesa_sessoes')) {
      const g = estado.garcons.find((x) => Number(x.id) === Number(estado.sessao.garcom_responsavel_id));
      return { rows: g ? [{ id: g.id, nome: g.nome }] : [], rowCount: g ? 1 : 0 };
    }
    if (lower.includes('select id, nome from garcons where id=$1')) {
      const g = estado.garcons.find((x) => Number(x.id) === Number(params[0]));
      return { rows: g ? [{ id: g.id, nome: g.nome }] : [], rowCount: g ? 1 : 0 };
    }

    // --- travarContextoPedido: mesa → sessão → pedido → itens ---
    if (lower.includes('select sessao_id from pedidos where id=$1')) {
      return { rows: [{ sessao_id: estado.pedido.sessao_id }], rowCount: 1 };
    }
    if (lower.includes('select mesa_id from mesa_sessoes where id=$1')) {
      return { rows: [{ mesa_id: estado.sessao.mesa_id }], rowCount: 1 };
    }
    if (lower.includes('select id from mesas where id=$1 for update')) {
      return { rows: [{ id: estado.mesa.id }], rowCount: 1 };
    }
    if (lower.includes('select * from mesa_sessoes where id=$1 for update')) {
      return { rows: [{ ...estado.sessao }], rowCount: 1 };
    }
    if (lower.includes('select * from pedidos where id=$1 for update')) {
      return { rows: [{ ...estado.pedido }], rowCount: 1 };
    }
    if (lower.includes('from itens_pedido ip join produtos pr') && lower.includes('for update of ip')) {
      return { rows: estado.itens.map((i) => ({ ...i })), rowCount: estado.itens.length };
    }
    if (lower.includes('select pedido_id from itens_pedido where id=$1')) {
      const item = estado.itens.find((i) => Number(i.id) === Number(params[0]));
      return { rows: item ? [{ pedido_id: item.pedido_id }] : [], rowCount: item ? 1 : 0 };
    }

    // --- posse da mesa ---
    if (lower.includes('update mesa_sessoes set garcom_responsavel_id=$2 where id=$1 and garcom_responsavel_id is null')) {
      if (estado.sessao.garcom_responsavel_id) return { rows: [], rowCount: 0 };
      estado.sessao.garcom_responsavel_id = params[1];
      return { rows: [{ id: estado.sessao.id }], rowCount: 1 };
    }
    if (lower.includes('insert into mesa_atendimento_historico')) {
      estado.historico.push({ tipo: 'mesa', params });
      return { rows: [{ id: estado.historico.length }], rowCount: 1 };
    }

    // --- escrita por item ---
    if (lower.startsWith('update itens_pedido set')) {
      const item = estado.itens.find((i) => Number(i.id) === Number(params[0]));
      if (!item) return { rows: [], rowCount: 0 };
      item.status = params[1];
      let idx = 2;
      if (sql.includes('preparado_por_staff_id=')) item.preparado_por_staff_id = params[idx++];
      if (sql.includes('aceito_por_id=')) { item.aceito_por_id = params[idx++]; item.aceito_em = new Date(); }
      if (sql.includes('retirado_por_id=')) { item.retirado_por_id = params[idx++]; item.retirado_em = new Date(); }
      if (sql.includes('entregue_por_id=')) { item.entregue_por_id = params[idx++]; item.entregue_em = new Date(); }
      if (sql.includes('cancelamento_motivo=')) {
        item.cancelamento_motivo = params[idx++];
        if (sql.includes('cancelado_por_staff_id=')) item.cancelado_por_staff_id = params[idx++];
        if (sql.includes('cancelado_por_garcom_id=')) item.cancelado_por_garcom_id = params[idx++];
      }
      return { rows: [], rowCount: 1 };
    }
    if (lower.includes('insert into itens_pedido_historico')) {
      estado.historico.push({
        tipo: 'item', itemId: params[0], pedidoId: params[1], de: params[2], para: params[3],
        atorTipo: params[4], garcomId: params[5], staffId: params[6], requestId: params[7], motivo: params[8],
      });
      return { rows: [{ id: estado.historico.length }], rowCount: 1 };
    }
    if (lower.includes('insert into auditoria_eventos')) {
      estado.auditoria.push({
        atorTipo: params[0], atorId: params[1], atorNome: params[2], acao: params[3],
        alvoTipo: params[4], alvoId: params[5], resultado: params[6],
        contexto: JSON.parse(params[7]), requestId: params[8],
      });
      return { rows: [{ id: estado.auditoria.length }], rowCount: 1 };
    }

    // --- projeção do pedido e espelho financeiro ---
    if (lower.includes('update pedidos set garcom_id=coalesce')) {
      if (!estado.pedido.garcom_id) { estado.pedido.garcom_id = params[1]; estado.pedido.garcom_nome = params[2]; }
      return { rows: [], rowCount: 1 };
    }
    if (lower.includes('update pedidos set garcom_entregou_id=$2')) {
      estado.pedido.garcom_entregou_id = params[1];
      return { rows: [], rowCount: 1 };
    }
    if (lower.includes('select coalesce(sum(ip.quantidade') && lower.includes('where ip.id=any($1::int[])')) {
      const ids = params[0].map(Number);
      const total = estado.itens.filter((i) => ids.includes(Number(i.id)))
        .reduce((s, i) => s + Number(i.preco_unitario) * Number(i.quantidade), 0);
      return { rows: [{ total }], rowCount: 1 };
    }
    if (lower.includes('select coalesce(sum(') && lower.includes("coalesce(ip.status, 'recebido') = 'entregue'")) {
      const total = estado.itens.filter((i) => i.status === 'entregue')
        .reduce((s, i) => s + Number(i.preco_unitario) * Number(i.quantidade), 0);
      return { rows: [{ total }], rowCount: 1 };
    }
    if (lower.includes('update mesa_sessoes set valor_total = $2')) {
      estado.sessao.valor_total = params[1];
      return { rows: [], rowCount: 1 };
    }
    if (lower.includes("select coalesce(status,'recebido') as status from itens_pedido")) {
      return { rows: estado.itens.map((i) => ({ status: i.status })), rowCount: estado.itens.length };
    }
    if (lower.includes('update pedidos set status=$2 where id=$1')) {
      estado.pedido.status = params[1] || calcularStatusPedido(estado.itens.map((i) => i.status));
      return {
        rows: [{
          id: estado.pedido.id, status: estado.pedido.status, criado_em: new Date(0),
          editado_em: null, cliente_nome: 'Cliente', sessao_id: estado.pedido.sessao_id,
        }],
        rowCount: 1,
      };
    }
    throw new Error('Consulta inesperada no fake de itens: ' + sql);
  }

  return { query, release() { estado.released++; } };
}

/** Instala o fake no pool real (sem abrir conexão) e devolve restaurador. */
function install(pool, estado) {
  const origQuery = pool.query;
  const origConnect = pool.connect;
  const client = criarCliente(estado);
  pool.query = client.query;
  pool.connect = async () => client;
  return () => { pool.query = origQuery; pool.connect = origConnect; };
}

module.exports = { criarEstado, criarCliente, install };
