const pool = require('./pool');
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
      SELECT p.id AS pedido_id,ip.id,ip.quantidade,pr.nome,
             ip.preco_unitario,
             COALESCE((SELECT SUM(a.preco_unitario) FROM itens_pedido_adicionais a WHERE a.item_pedido_id=ip.id),0) AS adicionais,
             COALESCE((SELECT STRING_AGG(ad.nome, ', ' ORDER BY ad.nome)
               FROM itens_pedido_adicionais ia JOIN adicionais ad ON ad.id=ia.adicional_id
               WHERE ia.item_pedido_id=ip.id),'') AS adicionais_nomes
      FROM pedidos p JOIN itens_pedido ip ON ip.pedido_id=p.id
      JOIN produtos pr ON pr.id=ip.produto_id
      WHERE p.sessao_id=$1 AND ip.status='entregue'
      ORDER BY p.criado_em,p.id,ip.id`,[id]);
    const {rows:pagamentos}=await client.query(`
      SELECT id,valor,forma_pagamento,criado_em FROM sessao_pagamentos
      WHERE sessao_id=$1 ORDER BY criado_em,id`,[id]);
    await client.query('COMMIT');
    const cobrado=Number(s.valor_cobrado ?? s.valor_total ?? 0);
    const pago=pagamentos.reduce((a,p)=>a+Number(p.valor),0);
    return { id:s.id,mesa:s.mesa,clienteNome:s.cliente_nome,garcomNome:s.garcom_nome,
      abertaEm:s.aberta_em,fechadaEm:s.fechada_em,
      itens:itens.map(i=>({pedidoId:i.pedido_id,nome:i.nome,quantidade:i.quantidade,
        precoUnitario:Number(i.preco_unitario),adicionais:Number(i.adicionais),
        adicionaisNomes:i.adicionais_nomes,
        total:Number((i.quantidade*(Number(i.preco_unitario)+Number(i.adicionais))).toFixed(2))})),
      desconto:Number(s.desconto||0),taxa:Number(s.taxa_servico||0),
      totalConsumo:Number(s.valor_total||0),valorCobrado:cobrado,
      pagamentos:pagamentos.map(p=>({id:p.id,valor:Number(p.valor),forma:p.forma_pagamento,criadoEm:p.criado_em})),
      valorPago:Number(pago.toFixed(2)),saldo:Number((cobrado-pago).toFixed(2)),
      documentoFiscal:false };
  }catch(e){try{await client.query('ROLLBACK')}catch(_){} throw e}
  finally{client.release()}
}
module.exports={comprovanteSessao,ErroComprovante};
