// Criação de pedido, avanço de status, cancelar/editar (cliente) e leitura de sessão/fila.
const pool = require('./pool');
const {
  TRANSICOES,
  getMesaPorToken,
  getOuAbrirSessao,
  getProdutosComRegras,
  travarProdutosEmOrdem,
} = require('./queries');
const { idempotencyKeyDoCorpo, colunaExiste, sincronizarValorTotalSessao } = require('./conta');
const { comRetryConcorrencia } = require('./retry');
const { invalidarCardapio } = require('./cardapio');
const { registrarEvento } = require('./auditoria');
const { fingerprintPedido, dataCliente } = require('./pedido-identidade');
const { sincronizarStatusPedido, travarContextoPedido, gravarStatusItem, registrarHistoricoItem, TRANSICOES_PRODUCAO } = require('./itens');

const pedidosTemIdempotencyKey = colunaExiste('pedidos', 'idempotency_key');

class ErroPedido extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function restaurarEstoqueDoPedido(client, pedidoId, itemIds = null) {
  const { rows: itens } = await client.query(
    `SELECT ip.produto_id, ip.quantidade, pr.controla_estoque, pr.disponivel, pr.estoque
     FROM itens_pedido ip
     JOIN produtos pr ON pr.id = ip.produto_id
     WHERE ip.pedido_id = $1 AND ($2::int[] IS NULL OR ip.id=ANY($2::int[]))
     ORDER BY ip.produto_id`,
    [pedidoId, itemIds]
  );
  // Agrega por produto e atualiza em ordem crescente de id (ordem global de
  // locks): o mesmo produto em 2 itens vira 1 update, e carrinhos de mesas
  // diferentes nunca travam produtos em ordens opostas.
  const porProduto = new Map();
  for (const it of itens) {
    if (!it.controla_estoque) continue;
    const atual = porProduto.get(it.produto_id) || { quantidade: 0, disponivel: it.disponivel, estoque: it.estoque };
    atual.quantidade += it.quantidade;
    porProduto.set(it.produto_id, atual);
  }
  let mudouDisponibilidade = false;
  for (const [produtoId, it] of porProduto) {
    // Só volta a ficar disponivel quem estava indisponivel POR FALTA de estoque
    // (estoque <= 0 antes da devolucao). Produto pausado manualmente pelo admin
    // com estoque positivo nao pode "ressuscitar" porque um cliente cancelou.
    await client.query(
      `UPDATE produtos
       SET estoque = COALESCE(estoque, 0) + $1,
           disponivel = CASE WHEN COALESCE(estoque, 0) <= 0 THEN true ELSE disponivel END
       WHERE id = $2 AND controla_estoque = true`,
      [it.quantidade, produtoId]
    );
    if (it.disponivel === false && (it.estoque == null || Number(it.estoque) <= 0)) {
      mudouDisponibilidade = true;
    }
  }
  return { mudouDisponibilidade };
}

/** Reconstroi a resposta de um pedido ja gravado (replay idempotente). */
async function carregarPedidoGravado(client, pedidoId) {
  const { rows: pedRows } = await client.query(
    `SELECT id, status, criado_em, cliente_nome, editado_em, observacao_geral
     FROM pedidos WHERE id = $1`,
    [pedidoId]
  );
  const pedido = pedRows[0];
  if (!pedido) return null;
  const { rows: itensRows } = await client.query(
    `SELECT ip.id, ip.produto_id, pr.nome, ip.quantidade, ip.preco_unitario, ip.ponto_carne, ip.observacao
     FROM itens_pedido ip
     JOIN produtos pr ON pr.id = ip.produto_id
     WHERE ip.pedido_id = $1 ORDER BY ip.id`,
    [pedidoId]
  );
  const itemIds = itensRows.map((i) => i.id);
  const adPorItem = new Map();
  const remPorItem = new Map();
  if (itemIds.length) {
    const { rows: adRows } = await client.query(
      `SELECT ipa.item_pedido_id, a.id AS adicional_id, a.nome, ipa.preco_unitario
       FROM itens_pedido_adicionais ipa
       JOIN adicionais a ON a.id = ipa.adicional_id
       WHERE ipa.item_pedido_id = ANY($1::int[])`,
      [itemIds]
    );
    for (const a of adRows) {
      if (!adPorItem.has(a.item_pedido_id)) adPorItem.set(a.item_pedido_id, []);
      adPorItem.get(a.item_pedido_id).push({ id: a.adicional_id, nome: a.nome, preco: Number(a.preco_unitario) });
    }
    const { rows: remRows } = await client.query(
      `SELECT item_pedido_id, ingrediente FROM itens_pedido_remocoes WHERE item_pedido_id = ANY($1::int[])`,
      [itemIds]
    );
    for (const r of remRows) {
      if (!remPorItem.has(r.item_pedido_id)) remPorItem.set(r.item_pedido_id, []);
      remPorItem.get(r.item_pedido_id).push(r.ingrediente);
    }
  }
  let total = 0;
  const itens = itensRows.map((i) => {
    const adicionais = adPorItem.get(i.id) || [];
    const unitTotal = Number(i.preco_unitario) + adicionais.reduce((sum, a) => sum + a.preco, 0);
    total += unitTotal * i.quantidade;
    return {
      id: i.id,
      produtoId: i.produto_id,
      nome: i.nome,
      quantidade: i.quantidade,
      precoUnitario: Number(i.preco_unitario),
      adicionais,
      removals: remPorItem.get(i.id) || [],
      pontoCarne: i.ponto_carne,
      observacao: i.observacao,
      unitTotal: Number(unitTotal.toFixed(2)),
    };
  });
  return {
    id: pedido.id,
    status: pedido.status,
    criadoEm: pedido.criado_em,
    editadoEm: pedido.editado_em || null,
    clienteNome: pedido.cliente_nome || null,
    observacaoGeral: pedido.observacao_geral,
    itens,
    total: Number(total.toFixed(2)),
  };
}

async function gravarItensPedido(client, pedidoId, itensInput, ator = { tipo: 'cliente_mesa' }, requestId = null) {
  const itensGravados = [];
  let total = 0;
  let mudouDisponibilidade = false;

  // Limite defensivo: payload abusivo vira erro 400 em vez de loop longo dentro
  // da transação (segura lock de estoque por mais tempo do que o necessário).
  if (!Array.isArray(itensInput) || itensInput.length > 100) {
    throw new ErroPedido(400, 'Quantidade de itens do pedido inválida');
  }

  // Produtos travados em ordem crescente de id e lidos em 3 consultas no total
  // (antes: 3 consultas POR ITEM, segurando o lock da mesa e a conexão). A
  // trava prévia em ordem global é também o que impede deadlock entre
  // carrinhos simultâneos de mesas diferentes com itens em ordens opostas.
  // O payload inteiro já foi validado antes de abrir a transação. Mantemos
  // IDs estritos aqui como defesa em profundidade: nenhum item enviado pode
  // desaparecer silenciosamente do pedido.
  const idsSolicitados = itensInput.map((item) => Number(item.productId ?? item.id));
  await travarProdutosEmOrdem(client, idsSolicitados);
  const produtosPorId = await getProdutosComRegras(client, idsSolicitados);

  for (const item of itensInput) {
    const produtoId = Number(item.productId ?? item.id);
    const produto = produtosPorId.get(produtoId);
    if (!produto || !produto.disponivel) {
      throw new ErroPedido(409, `Produto ${produtoId} inexistente ou indisponível; nenhum item foi pedido`);
    }

    // Fora de 1–99 é rejeitado explicitamente; antes era clamp silencioso
    // (Math.max/Math.min), que escondia cliente quebrado e teste abusivo.
    const rawQuantidade = item.qty;
    const quantidade =
      rawQuantidade === undefined || rawQuantidade === null || rawQuantidade === ''
        ? 1
        : Number(rawQuantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) {
      throw new ErroPedido(400, `Quantidade inválida para "${produto.nome}"`);
    }

    if (produto.controla_estoque) {
      const disp = produto.estoque == null ? 0 : Number(produto.estoque);
      if (!Number.isFinite(disp) || disp < quantidade) {
        throw new ErroPedido(400, `Estoque insuficiente para "${produto.nome}" (disponível: ${disp})`);
      }
    }

    const adicionaisSelecionados = Array.isArray(item.additions) ? item.additions.slice(0, 50) : [];
    const adicionaisValidos = [];
    const adicionaisVistos = new Set();
    for (const a of adicionaisSelecionados) {
      if (!a || typeof a !== 'object') continue;
      const adicionalId = Number(a.id);
      if (!Number.isInteger(adicionalId) || adicionalId < 1) continue;
      // O mesmo adicional 2x no payload violava a PK (item, adicional) e o
      // pedido inteiro caia com 500. Duplicado de cliente não é erro de
      // servidor: deduplica e segue.
      if (adicionaisVistos.has(adicionalId)) continue;
      adicionaisVistos.add(adicionalId);
      const permitido = produto.adicionaisPermitidos.find((x) => x.id === adicionalId);
      if (permitido) adicionaisValidos.push(permitido);
    }

    const remocoesSolicitadas = Array.isArray(item.removals) ? item.removals.slice(0, 50) : [];
    const remocoesValidas = [
      ...new Set(
        remocoesSolicitadas
          .filter((r) => typeof r === 'string')
          .map((r) => r.trim())
          .filter((r) => produto.removiveisPermitidos.includes(r))
      ),
    ];

    const pontoCarne =
      produto.pede_ponto_carne && ['MAL_PASSADO', 'AO_PONTO', 'BEM_PASSADO'].includes(item.meatPoint)
        ? item.meatPoint
        : null;

    const observacao = String(item.note || '').trim().slice(0, 300) || null;

    const { rows: itemRows } = await client.query(
      `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, ponto_carne, observacao, setor)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [pedidoId, produto.id, quantidade, produto.preco, pontoCarne, observacao, produto.setor || 'cozinha']
    );
    const itemId = itemRows[0].id;
    await registrarHistoricoItem(client, { id: itemId, pedido_id: pedidoId }, null, 'recebido', ator, requestId);

    if (adicionaisValidos.length) {
      const params = [];
      const valores = adicionaisValidos.map((a) => {
        params.push(itemId, a.id, a.preco);
        const b = params.length - 3;
        return `($${b + 1}, $${b + 2}, $${b + 3})`;
      });
      await client.query(
        `INSERT INTO itens_pedido_adicionais (item_pedido_id, adicional_id, preco_unitario)
         VALUES ${valores.join(', ')}`,
        params
      );
    }
    if (remocoesValidas.length) {
      const params = [];
      const valores = remocoesValidas.map((ingrediente) => {
        params.push(itemId, ingrediente);
        const b = params.length - 2;
        return `($${b + 1}, $${b + 2})`;
      });
      await client.query(
        `INSERT INTO itens_pedido_remocoes (item_pedido_id, ingrediente) VALUES ${valores.join(', ')}`,
        params
      );
    }

    if (produto.controla_estoque) {
      // Decremento atômico com guarda: sob corrida, quem perde recebe 409 e a
      // transação inteira desfaz — o estoque nunca fica negativo. A trava
      // ordenada adquirida acima serializa este ponto sem deadlock.
      const { rows: baixas, rowCount } = await client.query(
        `UPDATE produtos
         SET estoque = estoque - $1,
             disponivel = CASE WHEN estoque - $1 <= 0 THEN false ELSE disponivel END
         WHERE id = $2 AND controla_estoque = true AND estoque >= $1
         RETURNING estoque, disponivel`,
        [quantidade, produto.id]
      );
      if (!rowCount) {
        throw new ErroPedido(409, `Estoque de "${produto.nome}" esgotou durante o pedido`);
      }
      produto.estoque = Number(baixas[0].estoque);
      if (baixas[0].disponivel === false) mudouDisponibilidade = true;
    }

    const precoAdicionais = adicionaisValidos.reduce((soma, a) => soma + Number(a.preco), 0);
    const unitTotal = Number(produto.preco) + precoAdicionais;
    total += unitTotal * quantidade;

    itensGravados.push({
      id: itemId,
      produtoId: produto.id,
      nome: produto.nome,
      quantidade,
      precoUnitario: Number(produto.preco),
      adicionais: adicionaisValidos.map((a) => ({ id: a.id, nome: a.nome, preco: Number(a.preco) })),
      removals: remocoesValidas,
      pontoCarne,
      observacao,
      unitTotal: Number(unitTotal.toFixed(2)),
    });
  }

  if (!itensGravados.length) throw new ErroPedido(400, 'Nenhum item válido no pedido');
  return { itensGravados, total: Number(total.toFixed(2)), mudouDisponibilidade };
}

async function criarPedido(token, body, atendimento = null, requestId = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ErroPedido(400, 'Dados do pedido inválidos');
  }
  if (!atendimento && body.pedidoPaiId !== undefined && body.pedidoPaiId !== null) {
    throw new ErroPedido(400, 'Pedido relacionado só pode ser informado pelo atendimento do garçom');
  }
  const chaveIdempotencia = idempotencyKeyDoCorpo(body);
  if (chaveIdempotencia === false) throw new ErroPedido(400, 'Chave de idempotência inválida');
  const createdAt_cliente = dataCliente(body.clientCreatedAt ?? body.criadoEmCliente);
  if (createdAt_cliente === false) throw new ErroPedido(400, 'Data de criação local inválida');
  if (atendimento && chaveIdempotencia && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chaveIdempotencia)) {
    throw new ErroPedido(400, 'Pedido do garçom exige idempotencyKey UUID v4');
  }
  const itensInput = Array.isArray(body.items) ? body.items : [];
  if (!itensInput.length) throw new ErroPedido(400, 'O pedido está vazio');

  // Rejeita o carrinho completo antes de reservar conexão ou criar o pedido.
  // Ignorar um item malformado faria a API confirmar um subconjunto do carrinho.
  for (const [index, item] of itensInput.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ErroPedido(400, `Item ${index + 1} inválido no pedido`);
    }
    const produtoId = Number(item.productId ?? item.id);
    if (!Number.isInteger(produtoId) || produtoId < 1) {
      throw new ErroPedido(400, `Produto inválido no item ${index + 1}`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Replay global do garçom ANTES de abrir outra sessão: a mesa pode ter
    // sido fechada entre o commit original e o retry do celular.
    if (atendimento) {
      const { rows: autores } = await client.query('SELECT id,nome,ativo FROM garcons WHERE id=$1 FOR SHARE', [atendimento.garcomId]);
      if (!autores[0]?.ativo) throw new ErroPedido(401, 'Link do garçom inválido ou desativado');
      if (chaveIdempotencia) {
        const { rows: anteriores } = await client.query(
          `SELECT p.id,p.sessao_id,p.payload_hash,m.numero AS mesa
           FROM pedidos p JOIN mesa_sessoes s ON s.id=p.sessao_id JOIN mesas m ON m.id=s.mesa_id
           WHERE p.garcom_registrou_id=$1 AND p.idempotency_key=$2`,
          [atendimento.garcomId, chaveIdempotencia]
        );
        if (anteriores[0]) {
          const anterior=anteriores[0];
          const hash=fingerprintPedido({mesa:anterior.mesa,body,pedidoPaiId:atendimento.pedidoPaiId});
          if (anterior.payload_hash && anterior.payload_hash!==hash) {
            throw new ErroPedido(409, 'Esta chave já identificou outro pedido. O original foi preservado; revise a pendência local.');
          }
          const replay=await carregarPedidoGravado(client,anterior.id);
          await client.query('COMMIT');
          return {...replay,sessaoId:anterior.sessao_id,mesa:anterior.mesa,idempotentReplay:true};
        }
      }
    }
    const mesa = await getMesaPorToken(client, token);
    if (!mesa) throw new ErroPedido(404, 'Mesa não encontrada');
    const payloadHash=fingerprintPedido({mesa:mesa.numero,body,pedidoPaiId:atendimento?.pedidoPaiId});
    const sessaoId = await getOuAbrirSessao(client, mesa.id);

    // Pedido lançado por garçom: o servidor valida autoria dentro da mesma
    // transação, sob o lock da mesa, inclusive durante uma transferência.
    if (atendimento) {
      const { rows: atribuidos } = await client.query(
        'SELECT garcom_responsavel_id FROM mesa_sessoes WHERE id = $1 FOR UPDATE',
        [sessaoId]
      );
      // Um garçom pode lançar um pedido adicional para a mesa de outro
      // responsável, mas nunca pode assumir a mesa implicitamente. Exigimos
      // que exista um responsável no instante da transação; se a mesa foi
      // liberada/fechada em paralelo, o pedido não cria sessão órfã.
      if (!atribuidos[0]?.garcom_responsavel_id) {
        throw new ErroPedido(409, 'A mesa precisa ter um atendimento aberto com garçom responsável');
      }
    }

    // Idempotência: a mesa está travada (getOuAbrirSessao) desde o início da
    // transação, então "verifica e insere" aqui é livre de corrida para esta
    // sessão; o índice único parcial da migration 0018 é a segunda trava.
    // Um retry (timeout no celular, duplo toque) devolve o pedido original
    // em vez de criar um segundo pedido e baixar o estoque de novo.
    const usarChave = chaveIdempotencia ? await pedidosTemIdempotencyKey(client) : false;
    if (usarChave) {
      const { rows: existentes } = await client.query(
        'SELECT id FROM pedidos WHERE sessao_id = $1 AND idempotency_key = $2 LIMIT 1',
        [sessaoId, chaveIdempotencia]
      );
      if (existentes[0]) {
        const replay = await carregarPedidoGravado(client, existentes[0].id);
        await client.query('COMMIT');
        return { ...replay, sessaoId, mesa: mesa.numero, idempotentReplay: true };
      }
    }

    let pedidoPaiId = null;
    if (atendimento && atendimento.pedidoPaiId !== undefined && atendimento.pedidoPaiId !== null) {
      const paiId = Number(atendimento.pedidoPaiId);
      if (!Number.isSafeInteger(paiId) || paiId < 1) {
        throw new ErroPedido(400, 'Pedido de referência inválido');
      }
      const { rows: pais } = await client.query(
        'SELECT id, sessao_id, status FROM pedidos WHERE id = $1',
        [paiId]
      );
      const pai = pais[0];
      if (!pai || Number(pai.sessao_id) !== Number(sessaoId)) {
        throw new ErroPedido(404, 'Pedido selecionado não pertence à comanda desta mesa');
      }
      if (['entregue','cancelado'].includes(pai.status)) {
        throw new ErroPedido(409, 'O pedido selecionado já foi concluído ou cancelado; atualize a mesa e escolha um pedido ativo');
      }
      pedidoPaiId = Number(pai.id);
    }

    const clienteNome = String(body.clienteNome || body.cliente_nome || '')
      .trim()
      .slice(0, 80) || null;
    if (clienteNome) {
      await client.query(
        `UPDATE mesa_sessoes SET cliente_nome = COALESCE(cliente_nome, $2) WHERE id = $1`,
        [sessaoId, clienteNome]
      );
    }

    const observacaoGeral = String(body.note || '').trim().slice(0, 500) || null;
    const { rows: pedidoRows } = usarChave
      ? await client.query(
          `INSERT INTO pedidos (sessao_id, observacao_geral, cliente_nome, idempotency_key, pedido_pai_id, payload_hash, cliente_criado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, status, criado_em, cliente_nome, editado_em, pedido_pai_id`,
          [sessaoId, observacaoGeral, clienteNome, chaveIdempotencia, pedidoPaiId, payloadHash, createdAt_cliente]
        )
      : await client.query(
          `INSERT INTO pedidos (sessao_id, observacao_geral, cliente_nome, pedido_pai_id, payload_hash, cliente_criado_em)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status, criado_em, cliente_nome, editado_em, pedido_pai_id`,
          [sessaoId, observacaoGeral, clienteNome, pedidoPaiId, payloadHash, createdAt_cliente]
        );
    const pedido = pedidoRows[0];
    if (atendimento) {
      await client.query(
        `UPDATE pedidos
           SET garcom_registrou_id=$2, garcom_id=$2, garcom_nome=$3,
               origem_pedido='garcom', claimed_at=now()
          WHERE id=$1`,
        [pedido.id, atendimento.garcomId, atendimento.garcomNome]
      );
    }

    await client.query(
      `UPDATE mesa_sessoes SET pix_informado_em = NULL WHERE id = $1`,
      [sessaoId]
    );

    const { itensGravados, total, mudouDisponibilidade } = await gravarItensPedido(
      client, pedido.id, itensInput,
      atendimento ? {tipo:'garcom',id:atendimento.garcomId,nome:atendimento.garcomNome} : {tipo:'cliente_mesa',id:mesa.id}, requestId
    );
    if (!itensGravados.length) {
      throw new ErroPedido(400, 'Nenhum item válido no pedido (produto indisponível ou id inválido)');
    }

    await client.query('COMMIT');
    // Produto esgotou neste pedido: o cardápio em cache não pode continuar
    // oferecendo o que acabou por mais 30s.
    if (mudouDisponibilidade) invalidarCardapio();

    return {
      id: pedido.id,
      sessaoId,
      pedidoPaiId,
      mesa: mesa.numero,
      status: pedido.status,
      criadoEm: pedido.criado_em,
      editadoEm: pedido.editado_em || null,
      clienteNome: pedido.cliente_nome || clienteNome,
      observacaoGeral,
      itens: itensGravados,
      total,
      idempotentReplay: false,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cliente/garçom cancela o pedido inteiro só enquanto todos os itens estão em
 * 'recebido' (nada entrou em preparo). Depois disso o cancelamento é por item.
 *
 * O cancelamento é LÓGICO e deixa evidência na mesma transação (#48): pedido e
 * itens permanecem com status 'cancelado', com histórico por item, motivo e
 * auditoria. Repetir a chamada é replay idempotente: devolve o mesmo resultado
 * sem restaurar estoque de novo nem gravar evento duplicado.
 */
async function cancelarPedidoCliente(token,pedidoId,garcomResponsavelId=null,opcoes={}) {
  const id=Number(pedidoId);
  if(!Number.isSafeInteger(id)||id<1)throw new ErroPedido(400,'Pedido inválido');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const mesa=await getMesaPorToken(client,token);
    if(!mesa)throw new ErroPedido(404,'Mesa não encontrada');
    const ctx=await travarContextoPedido(client,id);
    if(!ctx||Number(ctx.sessao.mesa_id)!==Number(mesa.id)||ctx.sessao.status!=='aberta')throw new ErroPedido(404,'Pedido não encontrado nesta mesa');
    if(garcomResponsavelId&&Number(ctx.sessao.garcom_responsavel_id)!==Number(garcomResponsavelId))throw new ErroPedido(403,'Mesa sob responsabilidade de outro garçom');
    if(ctx.itens.length&&ctx.itens.every(i=>i.status==='cancelado')) {
      await client.query('COMMIT');
      return {ok:true,id,cancelado:true,status:ctx.pedido.status,mesa:mesa.numero,idempotentReplay:true};
    }
    if(ctx.itens.some(i=>i.status!=='recebido'))throw new ErroPedido(409,'Só é possível cancelar o pedido inteiro antes do preparo; solicite cancelamento por item à equipe');
    const motivo=String(opcoes.motivo||'Cancelado antes do preparo').trim().slice(0,300);
    const ator=garcomResponsavelId?{tipo:'garcom',id:Number(garcomResponsavelId)}:{tipo:'cliente_mesa',id:Number(mesa.id)};
    const restaurou=await restaurarEstoqueDoPedido(client,id);
    for(const item of ctx.itens)await gravarStatusItem(client,item,'cancelado',ator,opcoes.requestId||null,motivo);
    const pedido=await sincronizarStatusPedido(client,id);
    await registrarEvento(client,{atorTipo:ator.tipo,atorId:ator.id,acao:'pedido_cancelado',alvoTipo:'pedido',alvoId:id,
      requestId:opcoes.requestId||null,contexto:{mesaNumero:mesa.numero,motivo,itens:ctx.itens.length}});
    await client.query('COMMIT');
    if(restaurou.mudouDisponibilidade)invalidarCardapio();
    return {ok:true,id,cancelado:true,status:pedido.status,mesa:mesa.numero,idempotentReplay:false};
  } catch(e) {await client.query('ROLLBACK').catch(()=>{});throw e;} finally {client.release();}
}

/** Cliente edita itens do pedido só enquanto status = recebido. Marca editado_em. */
async function editarPedidoCliente(token, pedidoId, body, garcomResponsavelId = null, requestId = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ErroPedido(400, 'Dados do pedido inválidos');
  }
  const itensInput = Array.isArray(body.items) ? body.items : [];
  if (!itensInput.length) throw new ErroPedido(400, 'O pedido editado está vazio — cancele se quiser remover');
  const pedidoNumerico = Number(pedidoId);
  if (!Number.isInteger(pedidoNumerico) || pedidoNumerico < 1) {
    throw new ErroPedido(400, 'Pedido inválido');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mesa = await getMesaPorToken(client, token);
    if (!mesa) throw new ErroPedido(404, 'Mesa não encontrada');

    const contexto=await travarContextoPedido(client,Number(pedidoId));
    if (!contexto||Number(contexto.sessao.mesa_id)!==Number(mesa.id)||contexto.sessao.status!=='aberta') throw new ErroPedido(404, 'Pedido não encontrado nesta mesa');
    const pedido=contexto.pedido;
    if (garcomResponsavelId&&Number(contexto.sessao.garcom_responsavel_id)!==Number(garcomResponsavelId)) throw new ErroPedido(403,'Mesa sob responsabilidade de outro garçom');
    if (pedido.status !== 'recebido'||contexto.itens.some(i=>i.status!=='recebido')) {
      throw new ErroPedido(
        409,
        'Só é possível editar enquanto o pedido ainda não entrou em preparo na cozinha'
      );
    }

    const { rows: totalAnteriorRows } = await client.query(
      `SELECT COALESCE(SUM(
         ip.quantidade * (ip.preco_unitario + COALESCE(ad.total_adicionais, 0))
       ), 0)::numeric(12,2) AS total,
       COUNT(ip.id)::int AS quantidade
       FROM itens_pedido ip
       LEFT JOIN (
         SELECT item_pedido_id, SUM(preco_unitario) AS total_adicionais
         FROM itens_pedido_adicionais GROUP BY item_pedido_id
       ) ad ON ad.item_pedido_id = ip.id
       WHERE ip.pedido_id = $1`,
      [pedido.id]
    );
    const totalAnterior = Number(totalAnteriorRows[0]?.total) || 0;
    const quantidadeAnterior = Number(totalAnteriorRows[0]?.quantidade) || 0;
    const restaurou = await restaurarEstoqueDoPedido(client, pedido.id);

    await client.query(
      `DELETE FROM itens_pedido_adicionais
       WHERE item_pedido_id IN (SELECT id FROM itens_pedido WHERE pedido_id = $1)`,
      [pedido.id]
    );
    await client.query(
      `DELETE FROM itens_pedido_remocoes
       WHERE item_pedido_id IN (SELECT id FROM itens_pedido WHERE pedido_id = $1)`,
      [pedido.id]
    );
    await client.query(`DELETE FROM itens_pedido WHERE pedido_id = $1`, [pedido.id]);

    const observacaoGeral =
      body.note !== undefined
        ? String(body.note || '').trim().slice(0, 500) || null
        : pedido.observacao_geral;

    const { itensGravados, total, mudouDisponibilidade } = await gravarItensPedido(
      client, pedido.id, itensInput,
      garcomResponsavelId?{tipo:'garcom',id:garcomResponsavelId}:{tipo:'cliente_mesa',id:mesa.id},requestId
    );

    const { rows: updated } = await client.query(
      `UPDATE pedidos
       SET editado_em = now(),
           observacao_geral = $2
       WHERE id = $1
       RETURNING id, status, criado_em, editado_em, cliente_nome, observacao_geral`,
      [pedido.id, observacaoGeral]
    );

    if (garcomResponsavelId) {
      const { rows: atores } = await client.query('SELECT id, nome FROM garcons WHERE id=$1', [garcomResponsavelId]);
      await registrarEvento(client, {
        atorTipo: 'garcom',
        atorId: Number(garcomResponsavelId),
        atorNome: atores[0]?.nome || null,
        acao: 'pedido_editado',
        alvoTipo: 'pedido',
        alvoId: pedido.id,
        resultado: 'sucesso',
        requestId,
        contexto: {
          sessaoId: Number(pedido.sessao_id),
          mesa: mesa.numero,
          totalAnterior,
          totalNovo: total,
          itensAnteriores: quantidadeAnterior,
          itensNovos: itensGravados.length,
          observacaoAlterada: body.note !== undefined,
        },
      });
    }
    await client.query('COMMIT');
    if (mudouDisponibilidade || restaurou.mudouDisponibilidade) invalidarCardapio();

    return {
      id: updated[0].id,
      status: updated[0].status,
      criadoEm: updated[0].criado_em,
      editadoEm: updated[0].editado_em,
      clienteNome: updated[0].cliente_nome,
      observacaoGeral: updated[0].observacao_geral,
      mesa: mesa.numero,
      itens: itensGravados,
      total,
      editado: true,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}
/**
 * Avanço de status de UM item (cozinha/bar). O setor autorizado precisa ser o
 * setor congelado no item; edição posterior do produto não reroteia produção.
 * Transições são lineares e idempotentes; nunca regressam nem tocam terminais.
 */
async function setStatusItem(itemId, statusAlvo, setorAuth = null, ator = null, requestId = null) {
  const alvo = String(statusAlvo || '').trim();
  if (!['recebido', 'em_producao', 'concluido'].includes(alvo)) throw new ErroPedido(400, 'Status de item inválido');
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || id < 1) throw new ErroPedido(400, 'Item inválido');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: refs } = await client.query('SELECT pedido_id FROM itens_pedido WHERE id=$1', [id]);
    if (!refs[0]) throw new ErroPedido(404, 'Item não encontrado');
    const ctx = await travarContextoPedido(client, refs[0].pedido_id);
    if (ctx.sessao.status !== 'aberta') throw new ErroPedido(409, 'A comanda já foi encerrada');
    const item = ctx.itens.find(i => Number(i.id) === id);
    if (setorAuth && item.setor !== setorAuth) throw new ErroPedido(403, `Item pertence ao setor ${item.setor}`);
    if (alvo === item.status) {
      await client.query('COMMIT');
      return { itemId: id, status: item.status, statusAnterior: item.status, setor: item.setor, pedidoId: item.pedido_id, pedidoStatus: ctx.pedido.status, idempotentReplay: true };
    }
    const esperados = TRANSICOES_PRODUCAO[item.status] || [];
    if (!esperados.includes(alvo)) throw new ErroPedido(409, `Item em "${item.status}" não pode ir para "${alvo}"`);
    await gravarStatusItem(client, item, alvo, ator || { tipo: 'sistema' }, requestId);
    const pedido = await sincronizarStatusPedido(client, item.pedido_id);
    await client.query('COMMIT');
    return { itemId: id, status: alvo, statusAnterior: item.status, setor: item.setor, pedidoId: item.pedido_id, pedidoStatus: pedido.status, idempotentReplay: false };
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
}

/**
 * Compatibilidade do PATCH por pedido: avança apenas itens do setor autorizado
 * (ou todos, em override administrativo) e recalcula o pai a partir dos itens.
 * Nunca revive cancelados, nunca regressa trabalho de outro setor e nunca
 * transforma seleção vazia em update global. Entrega administrativa exige que
 * não reste produção pendente e registra histórico/valor na mesma transação.
 */
async function setStatusPedido(pedidoId, statusAlvo, setor = null, ator = null, requestId = null) {
  const alvo = String(statusAlvo || '').trim();
  if (!['recebido', 'em_producao', 'concluido', 'entregue'].includes(alvo)) throw new ErroPedido(400, 'Status inválido');
  const id = Number(pedidoId);
  if (!Number.isSafeInteger(id) || id < 1) throw new ErroPedido(400, 'Pedido inválido');
  if (alvo === 'entregue' && setor) throw new ErroPedido(403, 'Entrega deve ser registrada pelo garçom');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ctx = await travarContextoPedido(client, id);
    if (!ctx) throw new ErroPedido(404, 'Pedido não encontrado');
    if (ctx.sessao.status !== 'aberta') throw new ErroPedido(409, 'A comanda já foi encerrada');
    const { pedido, itens } = ctx;
    if (setor && !itens.some(i => i.setor === setor)) throw new ErroPedido(403, 'Pedido não possui itens do setor autorizado');
    const afetados = setor ? itens.filter(i => i.setor === setor) : itens;
    const vivos = afetados.filter(i => i.status !== 'cancelado');
    if (alvo === 'recebido') {
      if (vivos.some(i => i.status !== 'recebido')) throw new ErroPedido(409, 'Não é permitido regredir o pedido: já há itens avançados');
    } else if (alvo === 'entregue') {
      if (vivos.some(i => ['recebido', 'em_producao'].includes(i.status))) throw new ErroPedido(409, 'Ainda há itens em produção; conclua ou cancele antes da entrega administrativa');
      for (const item of vivos) {
        if (item.status !== 'entregue') await gravarStatusItem(client, item, 'entregue', ator || { tipo: 'sistema' }, requestId, 'Entrega administrativa');
      }
      await sincronizarValorTotalSessao(client, pedido.sessao_id);
    } else {
      const origens = alvo === 'em_producao' ? ['recebido'] : ['recebido', 'em_producao'];
      const ordem = { recebido: 0, em_producao: 1, concluido: 2, aceito: 2, retirado: 2, entregue: 3 };
      const moviveis = vivos.filter(i => origens.includes(i.status));
      if (!moviveis.length && vivos.some(i => (ordem[i.status] ?? 0) > (ordem[alvo] ?? 0))) {
        throw new ErroPedido(409, `Não é permitido regredir o pedido para "${alvo}"; já há itens mais avançados`);
      }
      for (const item of moviveis) await gravarStatusItem(client, item, alvo, ator || { tipo: 'sistema' }, requestId);
    }
    const atualizado = await sincronizarStatusPedido(client, id);
    await client.query('COMMIT');
    return { ...(atualizado || { id, status: pedido.status }), statusAnterior: pedido.status, setorAplicado: setor };
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
}

/** Avança o pedido para o próximo status do fluxo (TRANSICOES). Usado pela cozinha/bar. */
async function avancarStatusItem(pedidoId, setor = null) {
  const id = Number(pedidoId);
  if (!Number.isInteger(id) || id < 1) throw new ErroPedido(400, 'Pedido inválido');
  const { rows } = await pool.query(`SELECT status FROM pedidos WHERE id = $1`, [id]);
  const pedido = rows[0];
  if (!pedido) throw new ErroPedido(404, 'Pedido não encontrado');
  const proximo = TRANSICOES[pedido.status];
  if (!proximo) {
    throw new ErroPedido(409, `Pedido em status "${pedido.status}" não pode avançar`);
  }
  return setStatusPedido(pedidoId, proximo, setor);
}

// Leitura da sessão num snapshot único (REPEATABLE READ READ ONLY): sem isso,
// pedidos/itens/pagamentos vinham de consultas separadas em momentos
// diferentes e, com a mesa pedindo enquanto o caixa lança pagamento, a tela
// podia mostrar restante que nunca existiu em nenhum instante real.
async function getSessao(token) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const resultado = await lerSessao(client, token);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function lerSessao(client, token) {
    const mesa = await getMesaPorToken(client, token);
    if (!mesa) throw new ErroPedido(404, 'Mesa não encontrada');

    const { rows: sessaoRows } = await client.query(
      "SELECT id, aberta_em, cliente_nome, pix_informado_em FROM mesa_sessoes WHERE mesa_id = $1 AND status = 'aberta'",
      [mesa.id]
    );
    const sessao = sessaoRows[0];
    if (!sessao)
      return { mesa: mesa.numero, sessaoAberta: false, pedidos: [], totalDevido: 0, clienteNome: null };

    const { rows: pedidos } = await client.query(
      `SELECT id, status, criado_em, observacao_geral, cliente_nome, garcom_nome, claimed_at, editado_em
       FROM pedidos
       WHERE sessao_id = $1 ORDER BY criado_em`,
      [sessao.id]
    );
    if (!pedidos.length) {
      return {
        mesa: mesa.numero,
        sessaoAberta: true,
        sessaoId: sessao.id,
        abertaEm: sessao.aberta_em,
        clienteNome: sessao.cliente_nome || null,
        pixInformadoEm: sessao.pix_informado_em || null,
        pixAvisos: [],
        pedidos: [],
        totalDevido: 0,
        valorPago: 0,
        valorRestante: 0,
      };
    }

    const ids = pedidos.map((p) => p.id);
    const { rows: itensRows } = await client.query(
      `SELECT ip.id, ip.pedido_id, pr.nome, ip.quantidade, ip.preco_unitario, ip.ponto_carne, ip.observacao, ip.produto_id,
              COALESCE(ip.status, 'recebido') AS status,
              COALESCE(ip.setor, pr.setor, 'cozinha') AS setor,
              ip.pronto_em,ip.aceito_por_id,ip.aceito_em,ip.retirado_por_id,ip.retirado_em,ip.entregue_por_id,ip.entregue_em
       FROM itens_pedido ip
       JOIN produtos pr ON pr.id = ip.produto_id
       WHERE ip.pedido_id = ANY($1::int[])
       ORDER BY ip.id`,
      [ids]
    );

    const itemIds = itensRows.map((i) => i.id);
    let adRows = [];
    let remRows = [];
    if (itemIds.length) {
      const [adRes, remRes] = await Promise.all([
        client.query(
          `SELECT ipa.item_pedido_id, a.id AS adicional_id, a.nome, ipa.preco_unitario
           FROM itens_pedido_adicionais ipa
           JOIN adicionais a ON a.id = ipa.adicional_id
           WHERE ipa.item_pedido_id = ANY($1::int[])`,
          [itemIds]
        ),
        client.query(
          `SELECT item_pedido_id, ingrediente
           FROM itens_pedido_remocoes
           WHERE item_pedido_id = ANY($1::int[])`,
          [itemIds]
        ),
      ]);
      adRows = adRes.rows;
      remRows = remRes.rows;
    }

    const addByItem = new Map();
    for (const a of adRows) {
      if (!addByItem.has(a.item_pedido_id)) addByItem.set(a.item_pedido_id, []);
      addByItem.get(a.item_pedido_id).push({
        id: a.adicional_id,
        nome: a.nome,
        preco: Number(a.preco_unitario),
      });
    }
    const remByItem = new Map();
    for (const r of remRows) {
      if (!remByItem.has(r.item_pedido_id)) remByItem.set(r.item_pedido_id, []);
      remByItem.get(r.item_pedido_id).push(r.ingrediente);
    }

    const itensByPedido = new Map();
    for (const item of itensRows) {
      const adicionais = addByItem.get(item.id) || [];
      const remocoes = remByItem.get(item.id) || [];
      const totalAdicionais = adicionais.reduce((sum, a) => sum + a.preco, 0);
      const linha = (Number(item.preco_unitario) + totalAdicionais) * item.quantidade;
      const packed = {
        id: item.id,
        produtoId: item.produto_id,
        nome: item.nome,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        ponto_carne: item.ponto_carne,
        observacao: item.observacao,
        status: item.status || 'recebido',
        setor: item.setor || 'cozinha',
        adicionais,
        remocoes,
        totalLinha: Number(linha.toFixed(2)),
      };
      if (!itensByPedido.has(item.pedido_id)) itensByPedido.set(item.pedido_id, []);
      itensByPedido.get(item.pedido_id).push(packed);
    }

    let totalDevido = 0;
    const pedidosComItens = pedidos.map((p) => {
      const itens = itensByPedido.get(p.id) || [];
      const totalPedido = itens.reduce((sum, i) => sum + i.totalLinha, 0);
      // Conta na conta o que já foi ENTREGUE (parcial ou total)
      for (const i of itens) {
        if (i.status === 'entregue') totalDevido += i.totalLinha;
      }
      return {
        ...p,
        editadoEm: p.editado_em || null,
        itens,
        totalPedido: Number(totalPedido.toFixed(2)),
        podeEditar: p.status === 'recebido',
      };
    });
    totalDevido = Number(totalDevido.toFixed(2));

    const { rows: pagRows } = await client.query(
      `SELECT COALESCE(SUM(valor), 0)::float AS pago
       FROM sessao_pagamentos WHERE sessao_id = $1`,
      [sessao.id]
    );
    const valorPago = Number(Number(pagRows[0].pago || 0).toFixed(2));
    const valorRestante = Number(Math.max(0, totalDevido - valorPago).toFixed(2));

    const { rows: avisoRows } = await client.query(
      `SELECT id, pedido_id, valor, cliente_nome, status, criado_em, confirmado_em
       FROM pix_avisos
       WHERE sessao_id = $1 AND status = 'pendente'
       ORDER BY criado_em DESC`,
      [sessao.id]
    );
    const pixAvisos = avisoRows.map(function (a) {
      return {
        id: a.id,
        pedidoId: a.pedido_id,
        valor: Number(a.valor),
        clienteNome: a.cliente_nome || null,
        status: a.status,
        criadoEm: a.criado_em,
        confirmadoEm: a.confirmado_em || null,
      };
    });

    return {
      mesa: mesa.numero,
      sessaoAberta: true,
      sessaoId: sessao.id,
      abertaEm: sessao.aberta_em,
      clienteNome: sessao.cliente_nome || null,
      pixInformadoEm: sessao.pix_informado_em || null,
      pixAvisos: pixAvisos,
      pedidos: pedidosComItens,
      totalDevido,
      valorPago,
      valorRestante,
    };
}

async function anexarExtrasAosItens(itens) {
  if (!itens.length) return itens;
  const itemIds = itens.map((i) => i.id);
  const [adRes, remRes] = await Promise.all([
    pool.query(
      `SELECT ipa.item_pedido_id, a.nome
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
  const addByItem = new Map();
  for (const a of adRes.rows) {
    if (!addByItem.has(a.item_pedido_id)) addByItem.set(a.item_pedido_id, []);
    addByItem.get(a.item_pedido_id).push({ nome: a.nome });
  }
  const remByItem = new Map();
  for (const r of remRes.rows) {
    if (!remByItem.has(r.item_pedido_id)) remByItem.set(r.item_pedido_id, []);
    remByItem.get(r.item_pedido_id).push(r.ingrediente);
  }
  for (const item of itens) {
    item.adicionais = addByItem.get(item.id) || [];
    item.remocoes = remByItem.get(item.id) || [];
  }
  return itens;
}

/** Produção lê apenas seus itens pendentes. Pronto já pertence à fila de retirada. */
async function listarPedidosPorStatus(statuses,setor=null) {
  const params=[statuses];
  let filtroSetor='';
  if (setor) {params.push(setor);filtroSetor=`AND ip.setor=$${params.length} AND ip.status IN ('recebido','em_producao')`;}
  const {rows:pedidos}=await pool.query(
    `SELECT DISTINCT p.id,p.status,p.criado_em,p.observacao_geral,p.cliente_nome,p.garcom_nome,
            p.editado_em,p.origem_pedido,m.numero AS mesa
     FROM pedidos p JOIN mesa_sessoes s ON s.id=p.sessao_id JOIN mesas m ON m.id=s.mesa_id
     JOIN itens_pedido ip ON ip.pedido_id=p.id
     WHERE s.status='aberta' AND p.status=ANY($1::text[]) ${filtroSetor}
     ORDER BY p.criado_em`,params);
  if (!pedidos.length) return [];
  const ids=pedidos.map(p=>p.id);
  const {rows:itens}=await pool.query(
    `SELECT ip.id,ip.pedido_id,pr.nome,ip.quantidade,ip.ponto_carne,ip.observacao,ip.status,ip.setor,
            ip.iniciado_em,ip.pronto_em
     FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.produto_id
     WHERE ip.pedido_id=ANY($1::int[]) ${setor?'AND ip.setor=$2':''}
     ORDER BY ip.id`,setor?[ids,setor]:[ids]);
  // criado_em do item não existe no schema histórico: o horário do pedido é a referência.
  await anexarExtrasAosItens(itens);
  const byPedido=new Map();
  for (const item of itens) {if(!byPedido.has(item.pedido_id))byPedido.set(item.pedido_id,[]);byPedido.get(item.pedido_id).push(item);}
  return pedidos.map(p=>{
    const lista=byPedido.get(p.id)||[];
    const status=setor?(lista.some(i=>i.status==='em_producao')?'em_producao':'recebido'):p.status;
    return {...p,status,editadoEm:p.editado_em||null,itens:lista};
  }).filter(p=>!setor||p.itens.length>0);
}
async function getFilaCozinha(){return listarPedidosPorStatus(['recebido','em_producao'],'cozinha');}
async function getFilaBar(){return listarPedidosPorStatus(['recebido','em_producao'],'bar');}

/** Fila compartilhada: nunca esconde itens prontos por causa do dono da mesa,
 * da origem do pedido ou de uma retirada anterior de outro funcionário. */
async function getFilaGarcom(garcomId) {
  const id=Number(garcomId);
  if(!Number.isSafeInteger(id)||id<1)throw new TypeError('É obrigatório informar um garçom válido para consultar a fila');
  const {rows:pedidos}=await pool.query(
    `SELECT DISTINCT p.id,p.status,p.criado_em,p.observacao_geral,p.cliente_nome,p.garcom_nome,
            p.garcom_id,p.origem_pedido,p.editado_em,m.numero AS mesa,s.id AS sessao_id,
            s.garcom_responsavel_id,gr.nome AS garcom_responsavel_nome
     FROM pedidos p JOIN mesa_sessoes s ON s.id=p.sessao_id JOIN mesas m ON m.id=s.mesa_id
     LEFT JOIN garcons gr ON gr.id=s.garcom_responsavel_id
     WHERE s.status='aberta' AND EXISTS (
       SELECT 1 FROM itens_pedido ip WHERE ip.pedido_id=p.id AND ip.status IN ('concluido','aceito','retirado')
     ) ORDER BY p.criado_em`);
  if(!pedidos.length)return [];
  const {rows:itens}=await pool.query(
    `SELECT ip.id,ip.pedido_id,pr.nome,ip.quantidade,ip.ponto_carne,ip.observacao,ip.status,ip.setor,
            ip.pronto_em,ip.aceito_por_id,ip.aceito_em,ip.retirado_por_id,ip.retirado_em,
            ip.entregue_por_id,ip.entregue_em,ga.nome AS aceito_por_nome,gr.nome AS retirado_por_nome,ge.nome AS entregue_por_nome
     FROM itens_pedido ip JOIN produtos pr ON pr.id=ip.produto_id
     LEFT JOIN garcons ga ON ga.id=ip.aceito_por_id LEFT JOIN garcons gr ON gr.id=ip.retirado_por_id
     LEFT JOIN garcons ge ON ge.id=ip.entregue_por_id
     WHERE ip.pedido_id=ANY($1::int[]) ORDER BY ip.id`,[pedidos.map(p=>p.id)]);
  await anexarExtrasAosItens(itens);
  const byPedido=new Map();
  for(const item of itens){
    item.garcomAceitoId=item.aceito_por_id;item.garcomRetirouId=item.retirado_por_id;item.garcomEntregouId=item.entregue_por_id;
    item.garcomAceitoNome=item.aceito_por_nome;item.garcomRetirouNome=item.retirado_por_nome;item.garcomEntregouNome=item.entregue_por_nome;
    item.prontoEm=item.pronto_em;item.aceitoEm=item.aceito_em;item.retiradoEm=item.retirado_em;item.entregueEm=item.entregue_em;
    item.podeAceitar=item.status==='concluido';
    item.podeRetirar=item.status==='concluido'||(item.status==='aceito'&&Number(item.aceito_por_id)===id);
    item.podeEntregar=item.status==='retirado'&&Number(item.retirado_por_id)===id;
    if(!byPedido.has(item.pedido_id))byPedido.set(item.pedido_id,[]);byPedido.get(item.pedido_id).push(item);
  }
  return pedidos.map(p=>{
    const lista=byPedido.get(p.id)||[];
    return {...p,sessaoId:p.sessao_id,responsavelMesaId:p.garcom_responsavel_id,responsavelMesaNome:p.garcom_responsavel_nome,
      status:'concluido',editadoEm:p.editado_em||null,itens:lista,
      itensProntos:lista.filter(i=>i.status==='concluido').length,
      itensPendentesProducao:lista.filter(i=>['recebido','em_producao'].includes(i.status)).length};
  });
}


async function checkinCliente(token, body) {
  const dados = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const nome = String(dados.clienteNome || dados.cliente_nome || dados.nome || '')
    .trim()
    .slice(0, 80);
  if (!nome) throw new ErroPedido(400, 'Informe um nome');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mesa = await getMesaPorToken(client, token);
    if (!mesa) throw new ErroPedido(404, 'Mesa não encontrada');
    const sessaoId = await getOuAbrirSessao(client, mesa.id);
    await client.query(`UPDATE mesa_sessoes SET cliente_nome = $2 WHERE id = $1`, [sessaoId, nome]);
    await client.query('COMMIT');
    return { ok: true, mesa: mesa.numero, sessaoId, clienteNome: nome };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

// Mutações exportadas com retry estreito de deadlock (40P01) / abort de
// serialização (40001): a transação abortada não gravou nada, então repetir a
// operação inteira é seguro — e some com os 500 esporádicos de pico.
function comRetry(rotulo, fn) {
  return (...args) => comRetryConcorrencia(() => fn(...args), { rotulo });
}

module.exports = {
  criarPedido: comRetry('criarPedido', criarPedido),
  avancarStatusItem,
  setStatusItem: comRetry('setStatusItem', setStatusItem),
  setStatusPedido: comRetry('setStatusPedido', setStatusPedido),
  sincronizarStatusPedido,
  getSessao,
  getFilaCozinha,
  getFilaBar,
  getFilaGarcom,
  checkinCliente: comRetry('checkinCliente', checkinCliente),
  cancelarPedidoCliente: comRetry('cancelarPedidoCliente', cancelarPedidoCliente),
  editarPedidoCliente: comRetry('editarPedidoCliente', editarPedidoCliente),
  ErroPedido,
  restaurarEstoqueDoPedido,
  listarHistoricoPedido: (...args) => require('./itens').listarHistoricoPedido(...args),
};
