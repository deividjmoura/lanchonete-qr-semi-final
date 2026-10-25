const pool = require('./pool');
const { getGarcomPorToken } = require('./garcons');
const { getOuAbrirSessao } = require('./queries');

class ErroAtendimento extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function validarGarcom(token) {
  const g = await getGarcomPorToken(token);
  if (!g || !g.ativo) throw new ErroAtendimento(401, 'Link do garçom inválido ou desativado');
  return g;
}
async function listarMesasGarcom(token) {
  const garcom = await validarGarcom(token);
  const { rows } = await pool.query(`
    SELECT m.id, m.numero, m.token, s.id AS sessao_id, s.cliente_nome,
           s.garcom_responsavel_id, g.nome AS garcom_responsavel_nome
      FROM mesas m
      LEFT JOIN mesa_sessoes s ON s.mesa_id = m.id AND s.status = 'aberta'
      LEFT JOIN garcons g ON g.id = s.garcom_responsavel_id
     WHERE m.numero <= COALESCE((SELECT quantidade FROM configuracao_mesas WHERE id=1), 20)
     ORDER BY m.numero`);
  return { garcom: { id: garcom.id, nome: garcom.nome }, mesas: rows.map(r => ({
    id: r.id, numero: r.numero, token: r.token,
    sessaoId: r.sessao_id, clienteNome: r.cliente_nome,
    garcomResponsavelId: r.garcom_responsavel_id,
    garcomResponsavelNome: r.garcom_responsavel_nome,
  })) };
}
async function assumirMesa(token, numeroBruto, body = {}) {
  const garcom = await validarGarcom(token);
  const numero = Number(numeroBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 70) {
    throw new ErroAtendimento(400, 'Número de mesa inválido');
  }
  const clienteNome = body.clienteNome == null ? null : String(body.clienteNome).trim();
  if (clienteNome != null && (clienteNome.length < 1 || clienteNome.length > 100)) {
    throw new ErroAtendimento(400, 'Nome do cliente deve ter entre 1 e 100 caracteres');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: config } = await client.query('SELECT quantidade FROM configuracao_mesas WHERE id=1');
    if (numero > Number(config[0]?.quantidade || 20)) {
      throw new ErroAtendimento(409, 'Mesa ainda não habilitada pelo administrador');
    }
    const { rows: mesaRows } = await client.query('SELECT id, numero, token FROM mesas WHERE numero=$1 FOR UPDATE', [numero]);
    const mesa = mesaRows[0];
    if (!mesa) throw new ErroAtendimento(404, 'Mesa não encontrada');
    const sessaoId = await getOuAbrirSessao(client, mesa.id);
    const { rows } = await client.query(
      "SELECT garcom_responsavel_id, cliente_nome FROM mesa_sessoes WHERE id=$1 FOR UPDATE", [sessaoId]);
    const anterior = rows[0].garcom_responsavel_id;
    if (anterior && anterior !== garcom.id && body.transferir !== true) {
      throw new ErroAtendimento(409, 'Mesa já atribuída a outro garçom; confirme a transferência');
    }
    await client.query(`
      UPDATE mesa_sessoes SET garcom_responsavel_id=$2,
        cliente_nome=COALESCE($3, cliente_nome)
      WHERE id=$1`, [sessaoId, garcom.id, clienteNome]);
    if (anterior !== garcom.id) {
      await client.query(`
        INSERT INTO mesa_atendimento_historico(sessao_id,garcom_anterior_id,garcom_novo_id)
        VALUES ($1,$2,$3)`, [sessaoId, anterior, garcom.id]);
    }
    await client.query('COMMIT');
    return { mesa: numero, mesaToken: mesa.token, sessaoId,
      garcom: { id: garcom.id, nome: garcom.nome },
      transferida: anterior != null && anterior !== garcom.id };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { client.release(); }
}
async function deixarMesa(token, numeroBruto) {
  const garcom = await validarGarcom(token);
  const numero = Number(numeroBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 70) throw new ErroAtendimento(400,'Mesa inválida');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows:mesas}=await client.query('SELECT id FROM mesas WHERE numero=$1 FOR UPDATE',[numero]);
    if(!mesas.length)throw new ErroAtendimento(404,'Mesa não encontrada');
    const {rows:sessoes}=await client.query("SELECT id,garcom_responsavel_id FROM mesa_sessoes WHERE mesa_id=$1 AND status='aberta' FOR UPDATE",[mesas[0].id]);
    if(!sessoes.length||sessoes[0].garcom_responsavel_id!==garcom.id)throw new ErroAtendimento(409,'Esta mesa não está atribuída a você');
    // Não deixar pedidos em preparo ou prontos sem responsável.
    const {rows:pendentes}=await client.query(`
      SELECT COUNT(*)::int AS total FROM pedidos p
      JOIN itens_pedido ip ON ip.pedido_id=p.id
      WHERE p.sessao_id=$1 AND COALESCE(ip.status,'recebido') <> 'entregue'`,[sessoes[0].id]);
    if(pendentes[0].total>0)throw new ErroAtendimento(409,'Existem itens ainda não entregues. Entregue-os ou transfira a mesa para outro garçom antes de deixá-la.');
    await client.query('UPDATE mesa_sessoes SET garcom_responsavel_id=NULL WHERE id=$1',[sessoes[0].id]);
    await client.query('COMMIT');
    return {mesa:numero,liberada:true,sessaoId:sessoes[0].id};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
async function criarPedidoGarcom(token, numeroBruto, body) {
  const garcom = await validarGarcom(token);
  const numero = Number(numeroBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 70) {
    throw new ErroAtendimento(400, 'Número de mesa inválido');
  }
  const { rows } = await pool.query(
    `SELECT m.token, s.id AS sessao_id FROM mesas m
      JOIN mesa_sessoes s ON s.mesa_id=m.id AND s.status='aberta'
      WHERE m.numero=$1`,
    [numero]
  );
  if (!rows[0]) throw new ErroAtendimento(409, 'A mesa não tem sessão aberta. Abra o atendimento antes de enviar o pedido.');
  const { criarPedido } = require('./pedidos');
  return criarPedido(rows[0].token, body, {
    garcomId:garcom.id, garcomNome:garcom.nome,
    permitirResponsavelDiferente:true, sessaoIdEsperada:rows[0].sessao_id
  });
}

async function listarPedidosAtivosMesaGarcom(token, numeroBruto) {
  await validarGarcom(token);
  const numero = Number(numeroBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 70) throw new ErroAtendimento(400, 'Número de mesa inválido');
  const { rows: sessaoRows } = await pool.query(
    `SELECT s.id AS sessao_id FROM mesas m
       JOIN mesa_sessoes s ON s.mesa_id=m.id AND s.status='aberta' WHERE m.numero=$1`, [numero]);
  if (!sessaoRows[0]) return [];
  const { rows } = await pool.query(
    `SELECT p.id,p.status,p.cliente_nome,p.garcom_nome,p.criado_em,
       COALESCE(json_agg(json_build_object('id',ip.id,'nome',pr.nome,'qty',ip.quantidade,
         'status',COALESCE(ip.status,'recebido'),'setor',COALESCE(pr.setor,'cozinha'))
         ORDER BY ip.id) FILTER (WHERE ip.id IS NOT NULL),'[]'::json) AS itens
       FROM pedidos p LEFT JOIN itens_pedido ip ON ip.pedido_id=p.id
       LEFT JOIN produtos pr ON pr.id=ip.produto_id
      WHERE p.sessao_id=$1 AND EXISTS (SELECT 1 FROM itens_pedido active
        WHERE active.pedido_id=p.id AND COALESCE(active.status,'recebido') <> 'entregue')
      GROUP BY p.id ORDER BY p.criado_em DESC`, [sessaoRows[0].sessao_id]);
  return rows.map(p=>({id:p.id,status:p.status,clienteNome:p.cliente_nome||null,
    garcomNome:p.garcom_nome||null,criadoEm:p.criado_em,itens:p.itens}));
}

async function listarAtendimentosGarcom(token) {
  const garcom=await validarGarcom(token);
  const {rows}=await pool.query(`
    SELECT p.id,p.status,p.criado_em,p.editado_em,p.cliente_nome,p.observacao_geral,
           m.numero AS mesa,s.id AS sessao_id,
           COALESCE(json_agg(json_build_object(
             'id',ip.id,'productId',ip.produto_id,'nome',pr.nome,
             'qty',ip.quantidade,'unitPrice',ip.preco_unitario,
             'status',COALESCE(ip.status,'recebido'),'setor',COALESCE(pr.setor,'cozinha'),
             'note',ip.observacao,
             'additions',(SELECT COALESCE(json_agg(json_build_object('id',a.adicional_id)),'[]'::json) FROM itens_pedido_adicionais a WHERE a.item_pedido_id=ip.id),
             'removals',(SELECT COALESCE(json_agg(ing.ingrediente),'[]'::json) FROM itens_pedido_remocoes ing WHERE ing.item_pedido_id=ip.id)
           ) ORDER BY ip.id) FILTER(WHERE ip.id IS NOT NULL),'[]'::json) AS itens
    FROM mesa_sessoes s
    JOIN mesas m ON m.id=s.mesa_id
    JOIN pedidos p ON p.sessao_id=s.id
    LEFT JOIN itens_pedido ip ON ip.pedido_id=p.id
    LEFT JOIN produtos pr ON pr.id=ip.produto_id
    WHERE s.status='aberta' AND (s.garcom_responsavel_id=$1 OR p.garcom_id=$1)
    GROUP BY p.id,m.numero,s.id
    ORDER BY p.criado_em DESC LIMIT 250`,[garcom.id]);
  return rows.map(x=>({id:x.id,mesa:x.mesa,sessaoId:x.sessao_id,status:x.status,
    criadoEm:x.criado_em,editadoEm:x.editado_em,clienteNome:x.cliente_nome,
    note:x.observacao_geral,itens:x.itens,
    podeEditar:x.status==='recebido'&&x.itens.every(i=>i.status==='recebido')}));
}
async function editarPedidoGarcom(token,pedidoId,body){
  const garcom=await validarGarcom(token);
  const id=Number(pedidoId);
  if(!Number.isSafeInteger(id)||id<1)throw new ErroAtendimento(400,'Pedido inválido');
  const {rows}=await pool.query(`
    SELECT m.token FROM pedidos p
    JOIN mesa_sessoes s ON s.id=p.sessao_id
    JOIN mesas m ON m.id=s.mesa_id
    WHERE p.id=$1 AND s.status='aberta' AND s.garcom_responsavel_id=$2`,[id,garcom.id]);
  if(!rows[0])throw new ErroAtendimento(403,'Pedido não pertence às suas mesas em atendimento');
  const {editarPedidoCliente}=require('./pedidos');
  return editarPedidoCliente(rows[0].token,id,body,garcom.id);
}
async function metricasGarcons({ data } = {}) {
  const dia = data || new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo',
    year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(Date.parse(dia))) {
    throw new ErroAtendimento(400, 'Informe data em YYYY-MM-DD');
  }
  // Receita: somente contas FECHADAS; atribuição ao responsável pela sessão.
  // Nunca somar pedidos e contas juntos, pois isso duplica receita.
  const { rows } = await pool.query(`
    SELECT g.id, g.nome, g.ativo,
      COUNT(s.id)::int AS atendimentos,
      COALESCE(SUM(COALESCE(s.valor_cobrado, s.valor_total)), 0)::numeric(12,2) AS vendas,
      COALESCE(ROUND(AVG(COALESCE(s.valor_cobrado, s.valor_total))::numeric, 2), 0)::numeric(12,2) AS ticket_medio
    FROM garcons g
    LEFT JOIN mesa_sessoes s
      ON s.garcom_responsavel_id=g.id AND s.status='fechada'
     AND (s.fechada_em AT TIME ZONE 'America/Sao_Paulo')::date = $1::date
    GROUP BY g.id, g.nome, g.ativo
    ORDER BY vendas DESC, g.nome ASC`, [dia]);
  return { data: dia, criterio: 'contas fechadas atribuídas ao responsável pela sessão',
    garcons: rows.map(x=>({ id:x.id, nome:x.nome, ativo:x.ativo, atendimentos:x.atendimentos,
      vendas:Number(x.vendas), ticketMedio:Number(x.ticket_medio) })) };
}
module.exports={ ErroAtendimento, listarMesasGarcom, assumirMesa, deixarMesa, criarPedidoGarcom, listarPedidosAtivosMesaGarcom, listarAtendimentosGarcom, editarPedidoGarcom, metricasGarcons };
