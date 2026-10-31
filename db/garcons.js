const pool = require('./pool');
const { numeroInteiroPositivo } = require('./validacao');
const { comRetryConcorrencia } = require('./retry');
const { registrarEvento } = require('./auditoria');
const { limitePagina, validarPeriodo, criarCursor, lerCursor } = require('./paginacao');

class ErroGarcom extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function listGarcons() {
  const { rows } = await pool.query(
    `SELECT g.id, g.nome, g.token, g.ativo, g.criado_em,
            COUNT(p.id) FILTER (WHERE p.status = 'entregue')::int AS entregas
     FROM garcons g
     LEFT JOIN pedidos p ON p.garcom_id = g.id
     WHERE g.removido_em IS NULL
     GROUP BY g.id
     ORDER BY g.ativo DESC, g.nome ASC`
  );
  return rows;
}

// O lock exclusivo do cadastro serializa remoção/desativação com as ações que
// atribuem mesas ou entregas: elas mantêm FOR SHARE no garçom até o commit.
// Não travar mesas aqui evita inverter a ordem dos locks de transferência.
async function verificarResponsabilidades(client, gid, verbo) {
  const { rows: mesas } = await client.query(
    `SELECT m.numero FROM mesa_sessoes s JOIN mesas m ON m.id=s.mesa_id
     WHERE s.status='aberta' AND s.garcom_responsavel_id=$1
     ORDER BY m.numero LIMIT 10`, [gid]
  );
  const { rows: pendentes } = await client.query(
    `SELECT COUNT(*)::int AS total
       FROM itens_pedido ip
       JOIN pedidos p ON p.id=ip.pedido_id
       JOIN mesa_sessoes s ON s.id=p.sessao_id
      WHERE s.status='aberta'
        AND ((ip.status='aceito' AND ip.aceito_por_id=$1)
          OR (ip.status='retirado' AND ip.retirado_por_id=$1))`, [gid]
  );
  const motivos = [];
  if (mesas.length) {
    motivos.push(`há atendimento aberto nas mesas ${mesas.map((m) => m.numero).join(', ')}. Transfira ou encerre esses atendimentos`);
  }
  if (pendentes[0].total) {
    motivos.push(`há ${pendentes[0].total} item(ns) aceito(s) ou retirado(s). Conclua as entregas ou libere os aceites não retirados`);
  }
  if (motivos.length) {
    throw new ErroGarcom(409, `Não é possível ${verbo}: ${motivos.join('; ')}. Se necessário, reative o garçom para concluir as entregas.`);
  }
}

async function alterarCadastroGarcom(id, { ativo, remover = false, ator = null, requestId = null }) {
  const gid = numeroInteiroPositivo(id, 'id do garçom');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let admin = null;
    if (ator) {
      const result = await client.query('SELECT id, nome, papel, ativo FROM staff WHERE id=$1 FOR SHARE', [ator.id]);
      admin = result.rows[0];
      if (!admin?.ativo || admin.papel !== 'admin') {
        throw new ErroGarcom(403, 'Apenas um administrador ativo pode alterar o cadastro de garçons.');
      }
    }
    const { rows } = await client.query(
      'SELECT id, nome, ativo, removido_em FROM garcons WHERE id=$1 FOR UPDATE', [gid]
    );
    const garcom = rows[0];
    if (!garcom || garcom.removido_em) throw new ErroGarcom(404, 'Garçom não encontrado ou já removido');
    if (remover || (!ativo && garcom.ativo)) {
      await verificarResponsabilidades(client, gid, remover ? 'remover' : 'desativar');
    }
    let atualizado;
    if (remover) {
      // Trocar o token invalida o link antigo definitivamente; nenhuma FK muda.
      const result = await client.query(
        `UPDATE garcons SET ativo=FALSE, removido_em=now(), token=gen_random_uuid()
         WHERE id=$1 RETURNING id, nome`, [gid]
      );
      atualizado = { ...result.rows[0], removido: true };
    } else {
      const result = await client.query(
        `UPDATE garcons SET ativo=$2 WHERE id=$1
         RETURNING id, nome, token, ativo, criado_em`, [gid, !!ativo]
      );
      atualizado = result.rows[0];
    }
    if (remover || Boolean(garcom.ativo) !== Boolean(ativo)) {
      await registrarEvento(client, {
        atorTipo: admin ? 'staff' : 'sistema',
        atorId: admin ? Number(admin.id) : null,
        atorNome: admin?.nome || null,
        acao: remover ? 'garcom_removido' : (ativo ? 'garcom_ativado' : 'garcom_desativado'),
        alvoTipo: 'garcom', alvoId: gid, requestId,
        contexto: { garcomId: gid, garcomNome: garcom.nome },
      });
    }
    await client.query('COMMIT');
    return atualizado;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function removerGarcom(id, ator = null, requestId = null) {
  return comRetryConcorrencia(
    () => alterarCadastroGarcom(id, { ativo: false, remover: true, ator, requestId }),
    { rotulo: 'removerGarcom' }
  );
}

async function criarGarcom(body) {
  const nome = String(body.nome || '').trim().slice(0, 80);
  if (!nome) throw new ErroGarcom(400, 'Informe o nome do garçom');
  const { rows } = await pool.query(
    `INSERT INTO garcons (nome) VALUES ($1)
     RETURNING id, nome, token, ativo, criado_em`,
    [nome]
  );
  return rows[0];
}

async function setGarcomAtivo(id, ativo, ator = null, requestId = null) {
  return comRetryConcorrencia(
    () => alterarCadastroGarcom(id, { ativo: !!ativo, ator, requestId }),
    { rotulo: 'setGarcomAtivo' }
  );
}

async function getGarcomPorToken(token) {
  if (!token) return null;
  const t = String(token).trim();
  // token de garçom no banco é UUID; evita crash 22P02 com tokens demo
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) {
    return null;
  }
  const { rows } = await pool.query(
    `SELECT id, nome, token, ativo FROM garcons WHERE token = $1 AND removido_em IS NULL`,
    [t]
  );
  return rows[0] || null;
}

async function listPedidosRecentes({ limit = null, ativos = false, from = null, to = null, paginado = false, cursor = null } = {}) {
  const rawLimit = limit == null ? 50 : Number(limit);
  const lim = paginado ? limitePagina(limit, 10) :
    (Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.trunc(rawLimit))) : 50);
  if (paginado) ({ from, to } = validarPeriodo(from, to));
  const filtros = [from, to, Boolean(ativos)];
  const anterior = paginado ? lerCursor(cursor, 'pedidos', filtros) : null;
  const where = [];
  const params = [];
  let idx = 1;

  if (ativos) {
    where.push(`p.status = ANY($${idx}::text[])`);
    params.push(['recebido', 'em_producao', 'concluido']);
    idx += 1;
  }
  if (from) {
    where.push(`p.criado_em >= $${idx}::date`);
    params.push(from);
    idx += 1;
  }
  if (to) {
    where.push(`p.criado_em < ($${idx}::date + interval '1 day')`);
    params.push(to);
    idx += 1;
  }
  if (anterior) {
    where.push(`(p.criado_em, p.id) < ($${idx}::timestamptz, $${idx + 1}::int)`);
    params.push(anterior.data, anterior.id);
    idx += 2;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(paginado ? lim + 1 : lim);

  const { rows: consultados } = await pool.query(
    `SELECT p.id, p.status, p.criado_em, p.cliente_nome, p.garcom_nome, p.claimed_at,
            p.observacao_geral, m.numero AS mesa,
            to_char(p.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_data
     FROM pedidos p
     JOIN mesa_sessoes s ON s.id = p.sessao_id
     JOIN mesas m ON m.id = s.mesa_id
     ${whereSql}
     ORDER BY p.criado_em DESC, p.id DESC
     LIMIT $${idx}`,
    params
  );
  const temMais = paginado && consultados.length > lim;
  const pedidos = paginado ? consultados.slice(0, lim) : consultados;
  const ultimo = pedidos[pedidos.length - 1];
  const proximoCursor = temMais ? criarCursor('pedidos', ultimo.cursor_data, ultimo.id, filtros) : null;
  if (!pedidos.length) return paginado ? { itens: [], proximoCursor: null } : [];

  const ids = pedidos.map((p) => p.id);
  const { rows: itensRows } = await pool.query(
    `SELECT ip.id, ip.pedido_id, pr.nome, ip.quantidade, ip.preco_unitario, ip.ponto_carne, ip.observacao, ip.status, ip.setor
     FROM itens_pedido ip
     JOIN produtos pr ON pr.id = ip.produto_id
     WHERE ip.pedido_id = ANY($1::int[])
     ORDER BY ip.id`,
    [ids]
  );

  const itemIds = itensRows.map((i) => i.id);
  let adicionaisRows = [];
  let remocoesRows = [];
  if (itemIds.length) {
    const [adRes, remRes] = await Promise.all([
      pool.query(
        `SELECT ipa.item_pedido_id, a.nome, ipa.preco_unitario
         FROM itens_pedido_adicionais ipa
         JOIN adicionais a ON a.id = ipa.adicional_id
         WHERE ipa.item_pedido_id = ANY($1::int[])`,
        [itemIds]
      ),
      pool.query(
        `SELECT item_pedido_id, ingrediente
         FROM itens_pedido_remocoes
         WHERE item_pedido_id = ANY($1::int[])`,
        [itemIds]
      ),
    ]);
    adicionaisRows = adRes.rows;
    remocoesRows = remRes.rows;
  }

  const addByItem = new Map();
  for (const a of adicionaisRows) {
    if (!addByItem.has(a.item_pedido_id)) addByItem.set(a.item_pedido_id, []);
    addByItem.get(a.item_pedido_id).push({ nome: a.nome, preco: Number(a.preco_unitario) });
  }
  const remByItem = new Map();
  for (const r of remocoesRows) {
    if (!remByItem.has(r.item_pedido_id)) remByItem.set(r.item_pedido_id, []);
    remByItem.get(r.item_pedido_id).push(r.ingrediente);
  }

  const itensByPedido = new Map();
  for (const item of itensRows) {
    const adicionais = addByItem.get(item.id) || [];
    const remocoes = remByItem.get(item.id) || [];
    const totalAdicionais = adicionais.reduce((s, a) => s + a.preco, 0);
    const linha = (Number(item.preco_unitario) + totalAdicionais) * item.quantidade;
    const packed = {
      id: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      ponto_carne: item.ponto_carne,
      observacao: item.observacao,
      status: item.status,
      setor: item.setor,
      adicionais,
      remocoes,
      totalLinha: Number(linha.toFixed(2)),
    };
    if (!itensByPedido.has(item.pedido_id)) itensByPedido.set(item.pedido_id, []);
    itensByPedido.get(item.pedido_id).push(packed);
  }

  const resultado = pedidos.map(({ cursor_data: _cursorData, ...p }) => {
    const itens = itensByPedido.get(p.id) || [];
    const totalPedido = itens.reduce((s, i) => s + i.totalLinha, 0);
    return {
      ...p,
      itens,
      totalPedido: Number(totalPedido.toFixed(2)),
    };
  });
  return paginado ? { itens: resultado, proximoCursor } : resultado;
}

module.exports = {
  ErroGarcom,
  listGarcons,
  criarGarcom,
  setGarcomAtivo,
  removerGarcom,
  getGarcomPorToken,
  assumirEntregaComoGarcom: (...args) => require('./entregas').assumirEntregaComoGarcom(...args),
  retirarComoGarcom: (...args) => require('./entregas').retirarComoGarcom(...args),
  entregarComoGarcom: (...args) => require('./entregas').entregarComoGarcom(...args),
  historicoPedidoGarcom: (...args) => require('./entregas').historicoPedidoGarcom(...args),
  listPedidosRecentes,
};
