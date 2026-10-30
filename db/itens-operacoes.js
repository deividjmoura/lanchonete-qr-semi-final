const pool=require('./pool');
const {travarContextoPedido,gravarStatusItem,sincronizarStatusPedido}=require('./itens');
const {invalidarCardapio}=require('./cardapio');
const {registrarEvento}=require('./auditoria');
const {comRetryConcorrencia}=require('./retry');

class ErroItem extends Error {constructor(status,message){super(message);this.status=status;}}

async function cancelarItem(itemId,ator,motivoBruto,requestId=null) {
  const id=Number(itemId);
  if(!Number.isSafeInteger(id)||id<1)throw new ErroItem(400,'Item inválido');
  if(!ator||!['staff','garcom'].includes(ator.tipo)||!Number.isSafeInteger(ator.id))throw new ErroItem(403,'Autorização inválida');
  const motivo=String(motivoBruto||'').trim();
  if(motivo.length<3||motivo.length>300)throw new ErroItem(400,'Informe o motivo do cancelamento (3 a 300 caracteres)');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows:refs}=await client.query('SELECT pedido_id FROM itens_pedido WHERE id=$1',[id]);
    if(!refs[0])throw new ErroItem(404,'Item não encontrado');
    const ctx=await travarContextoPedido(client,refs[0].pedido_id);
    if(ctx.sessao.status!=='aberta')throw new ErroItem(409,'A comanda já foi encerrada');
    const item=ctx.itens.find(i=>Number(i.id)===id);
    if(item.status==='cancelado'){await client.query('COMMIT');return {itemId:id,status:'cancelado',pedidoId:item.pedido_id,idempotentReplay:true};}
    if(item.status==='entregue')throw new ErroItem(409,'Item entregue não pode ser cancelado; use o procedimento financeiro de estorno');
    const {restaurarEstoqueDoPedido}=require('./pedidos');
    const estoque=await restaurarEstoqueDoPedido(client,item.pedido_id,[id]);
    await gravarStatusItem(client,item,'cancelado',ator,requestId,motivo);
    const pedido=await sincronizarStatusPedido(client,item.pedido_id);
    await registrarEvento(client,{atorTipo:ator.tipo,atorId:ator.id,atorNome:ator.nome,acao:'item_cancelado',alvoTipo:'item_pedido',alvoId:id,
      requestId,contexto:{pedidoId:item.pedido_id,motivo,statusAnterior:item.status}});
    await client.query('COMMIT');
    if(estoque.mudouDisponibilidade)invalidarCardapio();
    return {itemId:id,status:'cancelado',pedidoId:item.pedido_id,pedidoStatus:pedido.status,idempotentReplay:false};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}

async function liberarAceite(itemId,ator,requestId=null) {
  const id=Number(itemId);
  if(!Number.isSafeInteger(id)||id<1)throw new ErroItem(400,'Item inválido');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows:refs}=await client.query('SELECT pedido_id FROM itens_pedido WHERE id=$1',[id]);
    if(!refs[0])throw new ErroItem(404,'Item não encontrado');
    const ctx=await travarContextoPedido(client,refs[0].pedido_id);
    const item=ctx.itens.find(i=>Number(i.id)===id);
    if(ctx.sessao.status!=='aberta'||item.status!=='aceito')throw new ErroItem(409,'Somente aceite ainda não retirado pode ser devolvido à fila');
    await client.query('UPDATE itens_pedido SET status=\'concluido\',aceito_por_id=NULL,aceito_em=NULL WHERE id=$1',[id]);
    const {registrarHistoricoItem}=require('./itens');
    await registrarHistoricoItem(client,item,'aceito','concluido',ator,requestId,'Aceite liberado pelo administrador');
    const pedido=await sincronizarStatusPedido(client,item.pedido_id);
    await client.query('COMMIT');
    return {itemId:id,status:'concluido',pedidoId:item.pedido_id,pedidoStatus:pedido.status};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}
module.exports={ErroItem,cancelarItem:(...a)=>comRetryConcorrencia(()=>cancelarItem(...a),{rotulo:'cancelarItem'}),liberarAceite:(...a)=>comRetryConcorrencia(()=>liberarAceite(...a),{rotulo:'liberarAceite'})};
