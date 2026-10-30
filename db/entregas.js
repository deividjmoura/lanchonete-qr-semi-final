const pool = require('./pool');
const { getGarcomPorToken, ErroGarcom } = require('./garcons');
const { travarContextoPedido, gravarStatusItem, sincronizarStatusPedido, listarHistoricoPedido } = require('./itens');
const { sincronizarValorTotalSessao } = require('./conta');
const { registrarEvento } = require('./auditoria');
const { comRetryConcorrencia } = require('./retry');

function selecionarIds(raw) {
  if (raw == null) return null;
  if (!Array.isArray(raw) || !raw.length || raw.length > 100) throw new ErroGarcom(400,'Selecione de 1 a 100 itens válidos');
  const ids=raw.map(Number);
  if(ids.some(id=>!Number.isSafeInteger(id)||id<1))throw new ErroGarcom(400,'itemIds inválidos');
  return [...new Set(ids)];
}

async function movimentarEntrega(pedidoId,token,{itemIds=null,etapa='aceitar'}={},requestId=null) {
  const pid=Number(pedidoId);
  if(!Number.isSafeInteger(pid)||pid<1)throw new ErroGarcom(400,'Pedido inválido');
  const autenticado=await getGarcomPorToken(token);
  if(!autenticado?.ativo)throw new ErroGarcom(401,'Link de garçom inválido ou desativado');
  const ids=selecionarIds(itemIds);
  const etapas={aceitar:['concluido','aceito'],retirar:['aceito','retirado'],entregar:['retirado','entregue'],entrega_direta:[null,'entregue']};
  if(!Object.hasOwn(etapas,etapa))throw new ErroGarcom(400,'Etapa de entrega inválida');
  const [origem,destino]=etapas[etapa];
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows:garcons}=await client.query('SELECT id,nome,ativo FROM garcons WHERE id=$1 FOR SHARE',[autenticado.id]);
    const garcom=garcons[0];
    if(!garcom?.ativo)throw new ErroGarcom(401,'Link de garçom inválido ou desativado');
    const ctx=await travarContextoPedido(client,pid);
    if(!ctx)throw new ErroGarcom(404,'Pedido não encontrado');
    const {pedido,sessao,itens}=ctx;
    if(sessao.status!=='aberta')throw new ErroGarcom(409,'A sessão desta entrega não está mais aberta');
    const candidatos=itens.filter(i=>ids?ids.includes(Number(i.id)):(etapa==='entrega_direta'?['concluido','aceito','retirado'].includes(i.status):i.status===origem));
    if(ids&&candidatos.length!==ids.length)throw new ErroGarcom(404,'Um ou mais itens não pertencem a este pedido');
    if(!candidatos.length)throw new ErroGarcom(409,'Nenhum item disponível para esta etapa; atualize a fila');
    for(const item of candidatos) {
      if(etapa==='aceitar'&&item.status!=='concluido')throw new ErroGarcom(409,'Outro garçom já assumiu estes itens ou eles não estão prontos');
      if(etapa==='retirar') {
        if(item.status!=='aceito')throw new ErroGarcom(409,'O item precisa estar aceito antes da retirada');
        if(Number(item.aceito_por_id)!==Number(garcom.id))throw new ErroGarcom(403,'Estes itens foram aceitos por outro garçom');
      }
      if(etapa==='entregar') {
        if(item.status!=='retirado')throw new ErroGarcom(409,'Retire os itens antes de confirmar a entrega');
        if(Number(item.retirado_por_id)!==Number(garcom.id))throw new ErroGarcom(403,'Estes itens foram retirados por outro garçom');
      }
      if(etapa==='entrega_direta') {
        if(!['concluido','aceito','retirado'].includes(item.status))throw new ErroGarcom(409,'O item não está pronto para entrega');
        const dono=item.status==='retirado'?item.retirado_por_id:item.aceito_por_id;
        if(dono&&Number(dono)!==Number(garcom.id))throw new ErroGarcom(403,'Outro garçom está responsável por esta retirada');
      }
    }
    // A mesa e a retirada são responsabilidades diferentes. Somente a primeira
    // atribuição preenche o responsável; colaboração nunca transfere a mesa.
    let atribuida=false;
    let responsavelId=sessao.garcom_responsavel_id;
    let responsavelNome=null;
    if(!responsavelId) {
      const {rows}=await client.query(
        `UPDATE mesa_sessoes SET garcom_responsavel_id=$2 WHERE id=$1 AND garcom_responsavel_id IS NULL RETURNING id`,
        [sessao.id,garcom.id]);
      if(rows[0]) {
        atribuida=true;responsavelId=garcom.id;responsavelNome=garcom.nome;
        await client.query(`INSERT INTO mesa_atendimento_historico
          (sessao_id,garcom_anterior_id,garcom_novo_id,alterado_por_id) VALUES ($1,NULL,$2,$2)`,[sessao.id,garcom.id]);
        await registrarEvento(client,{atorTipo:'garcom',atorId:garcom.id,atorNome:garcom.nome,
          acao:'mesa_assumida',alvoTipo:'mesa_sessao',alvoId:sessao.id,requestId,
          contexto:{pedidoId:pid,origem:'aceite_itens',sessaoId:sessao.id}});
      }
    }
    if(!atribuida) {
      const {rows}=await client.query('SELECT g.id,g.nome FROM garcons g JOIN mesa_sessoes s ON s.garcom_responsavel_id=g.id WHERE s.id=$1',[sessao.id]);
      responsavelId=rows[0]?.id||null;responsavelNome=rows[0]?.nome||null;
    }
    const ator={tipo:'garcom',id:garcom.id,nome:garcom.nome};
    for(const item of candidatos)await gravarStatusItem(client,item,destino,ator,requestId);
    await client.query(`UPDATE pedidos SET garcom_id=COALESCE(garcom_id,$2),garcom_nome=COALESCE(garcom_nome,$3),
      claimed_at=COALESCE(claimed_at,now()) WHERE id=$1`,[pid,garcom.id,garcom.nome]);
    let valorEntregue=0;
    if(destino==='entregue') {
      const {rows}=await client.query(`SELECT COALESCE(SUM(ip.quantidade*(ip.preco_unitario+COALESCE(
        (SELECT SUM(preco_unitario) FROM itens_pedido_adicionais WHERE item_pedido_id=ip.id),0))),0)::float AS total
        FROM itens_pedido ip WHERE ip.id=ANY($1::int[])`,[candidatos.map(i=>i.id)]);
      valorEntregue=Number(rows[0].total.toFixed(2));
      await sincronizarValorTotalSessao(client,pedido.sessao_id);
      await client.query('UPDATE pedidos SET garcom_entregou_id=$2 WHERE id=$1',[pid,garcom.id]);
    }
    const atualizado=await sincronizarStatusPedido(client,pid);
    const acao=destino==='aceito'?'entrega_assumida':destino==='retirado'?'itens_retirados':'itens_entregues';
    await registrarEvento(client,{atorTipo:'garcom',atorId:garcom.id,atorNome:garcom.nome,acao,
      alvoTipo:'pedido',alvoId:pid,requestId,contexto:{itemIds:candidatos.map(i=>i.id).join(','),
        quantidadeItens:candidatos.length,
        ...(destino==='entregue'?{quantidadeItensEntregues:candidatos.length}:{}),
        sessaoId:pedido.sessao_id,valorEntregue,responsavelMesaId:responsavelId,responsabilidadeAtribuida:atribuida}});
    await client.query('COMMIT');
    return {id:pid,assumido:destino==='aceito',status:atualizado.status,itensEntregues:destino==='entregue'?candidatos.map(i=>i.id):[],
      itensAfetados:candidatos.map(i=>i.id),valorEntregue,parcial:atualizado.status!=='entregue',garcom,
      responsavelMesa:{id:responsavelId,nome:responsavelNome},responsabilidadeAtribuida:atribuida,
      aviso:atribuida?'Você assumiu a mesa.':responsavelId===garcom.id?'Você é o responsável pela mesa.':`Mesa sob responsabilidade de ${responsavelNome||'outro garçom'}; sua retirada foi registrada sem transferir a mesa.`};
  } catch(e) {await client.query('ROLLBACK').catch(()=>{});throw e;} finally {client.release();}
}

async function historicoPedidoGarcom(token,pedidoId) {
  const g=await getGarcomPorToken(token);
  if(!g?.ativo)throw new ErroGarcom(401,'Link de garçom inválido ou desativado');
  const id=Number(pedidoId);
  if(!Number.isSafeInteger(id)||id<1)throw new ErroGarcom(400,'Pedido inválido');
  return {pedidoId:id,itens:await listarHistoricoPedido(pool,id)};
}

const retry=fn=>(...args)=>comRetryConcorrencia(()=>fn(...args),{rotulo:fn.name});
module.exports={
  assumirEntregaComoGarcom:retry((pid,token,reqId=null,itemIds=null)=>movimentarEntrega(pid,token,{etapa:'aceitar',itemIds},reqId)),
  retirarComoGarcom:retry((pid,token,reqId=null,itemIds=null)=>movimentarEntrega(pid,token,{etapa:'retirar',itemIds},reqId)),
  entregarComoGarcom:retry((pid,token,itemIds=null,reqId=null,etapa='entrega_direta')=>movimentarEntrega(pid,token,{etapa,itemIds},reqId)),
  historicoPedidoGarcom,
};
