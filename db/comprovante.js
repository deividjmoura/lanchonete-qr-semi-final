const pool = require('./pool');
const { colunaExiste } = require('./conta');
const { limitePagina, criarCursor, lerCursor } = require('./paginacao');
const pagamentosTemOperadorNome = colunaExiste('sessao_pagamentos', 'operador_nome');
class ErroComprovante extends Error { constructor(status,message){super(message);this.status=status;} }
async function comprovanteSessao(idBruto) {
  const id=Number(idBruto);
  if(!Number.isSafeInteger(id)||id<1) throw new ErroComprovante(400,'Sessão inválida');
  const client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const {rows:sr}=await client.query(`
      SELECT s.id,s.aberta_em,s.fechada_em,s.cliente_nome,s.status,
             s.desconto,s.taxa_servico,s.valor_total,s.valor_cobrado,
             m.numero AS mesa,g.nome AS garcom_nome
      FROM mesa_sessoes s JOIN mesas m ON m.id=s.mesa_id
      LEFT JOIN garcons g ON g.id=s.garcom_responsavel_id WHERE s.id=$1`,[id]);
    const s=sr[0];
    if(!s) throw new ErroComprovante(404,'Conta não encontrada');
    if(s.status!=='fechada') throw new ErroComprovante(409,'O comprovante final está disponível após o fechamento');
    const {rows:itens}=await client.query(`
      SELECT p.id AS pedido_id,p.observacao_geral,ip.id,ip.quantidade,pr.nome,
             pr.descricao AS descricao_produto,ip.observacao,
             ip.preco_unitario,
             COALESCE((SELECT SUM(a.preco_unitario) FROM itens_pedido_adicionais a WHERE a.item_pedido_id=ip.id),0) AS adicionais,
             COALESCE((SELECT STRING_AGG(ad.nome, ', ' ORDER BY ad.nome)
               FROM itens_pedido_adicionais ia JOIN adicionais ad ON ad.id=ia.adicional_id
               WHERE ia.item_pedido_id=ip.id),'') AS adicionais_nomes,
             COALESCE((SELECT STRING_AGG(r.ingrediente, ', ' ORDER BY r.ingrediente)
               FROM itens_pedido_remocoes r WHERE r.item_pedido_id=ip.id),'') AS removidos
      FROM pedidos p JOIN itens_pedido ip ON ip.pedido_id=p.id
      JOIN produtos pr ON pr.id=ip.produto_id
      WHERE p.sessao_id=$1 AND ip.status='entregue'
      ORDER BY p.criado_em,p.id,ip.id`,[id]);
    const temOperadorPagamento=await pagamentosTemOperadorNome(client).catch(()=>false);
    const {rows:pagamentos}=await client.query(`
      SELECT id,valor,forma_pagamento,criado_em,
             ${temOperadorPagamento?'operador_nome':'NULL::text AS operador_nome'}
      FROM sessao_pagamentos
      WHERE sessao_id=$1 ORDER BY criado_em,id`,[id]);
    await client.query('COMMIT');
    const cobrado=Number(s.valor_cobrado ?? s.valor_total ?? 0);
    const pago=pagamentos.reduce((a,p)=>a+Number(p.valor),0);
    return { id:s.id,mesa:s.mesa,clienteNome:s.cliente_nome,garcomNome:s.garcom_nome,
      abertaEm:s.aberta_em,fechadaEm:s.fechada_em,
      itens:itens.map(i=>({pedidoId:i.pedido_id,nome:i.nome,descricao:i.descricao_produto||'',
        observacao:i.observacao||'',observacaoPedido:i.observacao_geral||'',
        removidos:i.removidos||'',quantidade:i.quantidade,
        precoUnitario:Number(i.preco_unitario),adicionais:Number(i.adicionais),
        adicionaisNomes:i.adicionais_nomes,
        total:Number((i.quantidade*(Number(i.preco_unitario)+Number(i.adicionais))).toFixed(2))})),
      desconto:Number(s.desconto||0),taxa:Number(s.taxa_servico||0),
      totalConsumo:Number(s.valor_total||0),valorCobrado:cobrado,
      pagamentos:pagamentos.map(p=>({id:p.id,valor:Number(p.valor),forma:p.forma_pagamento,criadoEm:p.criado_em,operadorNome:p.operador_nome||null})),
      valorPago:Number(pago.toFixed(2)),saldo:Number((cobrado-pago).toFixed(2)),
      documentoFiscal:false };
  }catch(e){try{await client.query('ROLLBACK')}catch(_){} throw e}
  finally{client.release()}
}
async function listarComprovantesRecentes() {
  const {rows}=await pool.query(`
    SELECT s.id,m.numero AS mesa,s.fechada_em,s.cliente_nome,
      COALESCE(s.valor_cobrado,s.valor_total)::numeric(12,2) AS total
    FROM mesa_sessoes s JOIN mesas m ON m.id=s.mesa_id
    WHERE s.status='fechada'
    ORDER BY s.fechada_em DESC,s.id DESC LIMIT 25`);
  return rows.map(r=>({id:r.id,mesa:r.mesa,fechadaEm:r.fechada_em,
    clienteNome:r.cliente_nome,total:Number(r.total)}));
}
// Versão paginada opt-in; a rota legada continua retornando um array de 25.
async function paginaComprovantes({ limite = null, cursor = null } = {}) {
  const tamanho = limitePagina(limite, 5);
  const anterior = lerCursor(cursor, 'comprovantes', [], { permiteDataNula: true });
  const params = [];
  let condicao = '';
  if (anterior?.data === null) {
    params.push(anterior.id);
    condicao = `AND s.fechada_em IS NULL AND s.id < $${params.length}`;
  } else if (anterior) {
    params.push(anterior.data, anterior.id);
    condicao = `AND (s.fechada_em IS NULL OR (s.fechada_em, s.id) < ($1::timestamptz, $2::int))`;
  }
  params.push(tamanho + 1);
  const { rows } = await pool.query(`
    SELECT s.id,m.numero AS mesa,s.fechada_em,s.cliente_nome,
      COALESCE(s.valor_cobrado,s.valor_total)::numeric(12,2) AS total,
      to_char(s.fechada_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_data
    FROM mesa_sessoes s JOIN mesas m ON m.id=s.mesa_id
    WHERE s.status='fechada' ${condicao}
    ORDER BY s.fechada_em DESC NULLS LAST, s.id DESC LIMIT $${params.length}`, params);
  const temMais = rows.length > tamanho;
  const pagina = rows.slice(0, tamanho);
  const ultimo = pagina[pagina.length - 1];
  return {
    itens: pagina.map((r) => ({ id: r.id, mesa: r.mesa, fechadaEm: r.fechada_em,
      clienteNome: r.cliente_nome, total: Number(r.total) })),
    proximoCursor: temMais ? criarCursor('comprovantes', ultimo.cursor_data, ultimo.id) : null,
  };
}
module.exports={comprovanteSessao,listarComprovantesRecentes,paginaComprovantes,ErroComprovante};
