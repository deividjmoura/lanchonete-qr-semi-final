const pool = require('./pool');
const { getGarcomPorToken } = require('./garcons');
const { totalEntregueDaSessao, totalPagoDaSessao } = require('./conta');
const { percentualServicoPadrao, taxaServicoPadraoPara } = require('./caixa');
const { registrarEvento } = require('./auditoria');
const { comRetryConcorrencia } = require('./retry');

class ErroAtendimento extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function validarGarcom(token) {
  const g = await getGarcomPorToken(token);
  if (!g || !g.ativo) throw new ErroAtendimento(401, 'Link do garçom inválido ou desativado');
  return g;
}

// A verificação anterior ao BEGIN não basta: uma remoção concorrente poderia
// invalidar o garçom antes que a mesa seja atribuída. O lock é mantido até o
// commit, serializando essa atribuição com remoção/desativação.
async function travarGarcomAtivo(client, garcom, token) {
  const { rows } = await client.query(
    `SELECT id, ativo FROM garcons
      WHERE id=$1 AND token=$2 AND removido_em IS NULL FOR SHARE`, [garcom.id, token]
  );
  if (!rows[0]?.ativo) throw new ErroAtendimento(401, 'Link do garçom inválido ou desativado');
}
async function listarMesasGarcom(token) {
  const garcom = await validarGarcom(token);
  const { rows } = await pool.query(`
    SELECT m.id, m.numero, m.token, s.id AS sessao_id, s.cliente_nome,
           
           EXISTS (
             SELECT 1 FROM pedidos p
              WHERE p.sessao_id = s.id AND p.origem_pedido = 'cliente'
           ) AS pedido_cliente_qr,
           -- Campos ADITIVOS de leitura (#305): praça cadastrada e horário do
           -- primeiro pedido válido (não cancelado) da sessão aberta. Nenhuma
           -- transição depende deles; servem só para o card do salão.
           mp.id AS praca_id, mp.nome AS praca_nome, mp.ordem AS praca_ordem,
           (SELECT MIN(p.criado_em) FROM pedidos p
             WHERE p.sessao_id = s.id AND p.status <> 'cancelado') AS primeiro_pedido_em,
           (SELECT COUNT(*)::int FROM pedidos p
             WHERE p.sessao_id = s.id AND p.status <> 'cancelado') AS pedidos_validos
      FROM mesas m
      LEFT JOIN mesa_sessoes s ON s.mesa_id = m.id AND s.status = 'aberta'
      
      LEFT JOIN mesa_pracas mp ON mp.id = m.praca_id
     WHERE m.numero <= COALESCE((SELECT quantidade FROM configuracao_mesas WHERE id=1), 20)
     ORDER BY m.numero`);
  return { garcom: { id: garcom.id, nome: garcom.nome }, mesas: rows.map(r => ({
    id: r.id, numero: r.numero,
    // Token QR disponível aos garçons autenticados e ativos.
    token: r.token,
    sessaoId: r.sessao_id, clienteNome: r.cliente_nome,
    pedidoClienteQr: r.pedido_cliente_qr === true,
    // Praça: nome vem do cadastro (mesa_pracas); null = "Sem praça".
    pracaId: r.praca_id != null ? Number(r.praca_id) : null,
    pracaNome: r.praca_nome || null,
    pracaOrdem: r.praca_ordem != null ? Number(r.praca_ordem) : null,
    // Tempo de atendimento começa no PRIMEIRO PEDIDO VÁLIDO, nunca na abertura
    // da sessão: uma mesa aberta que ainda não pediu está "Aguardando pedido".
    primeiroPedidoEm: r.primeiro_pedido_em ? new Date(r.primeiro_pedido_em).toISOString() : null,
    pedidosValidos: Number(r.pedidos_validos || 0),
    // Estado derivado (só apresentação): a autoridade continua no servidor.
    situacao: r.sessao_id == null
      ? 'livre'
      : (r.primeiro_pedido_em ? 'em_atendimento' : 'aguardando_pedido'),
  })) };
}
async function iniciarAtendimentoGarcom(token, numeroBruto, body = {}, requestId = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ErroAtendimento(400, 'Corpo de início de atendimento inválido');
  const garcom = await validarGarcom(token);
  const numero = Number(numeroBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 70) throw new ErroAtendimento(400, 'Número de mesa inválido');
  const clienteNome = body.clienteNome == null ? null : String(body.clienteNome).trim();
  if (clienteNome != null && (clienteNome.length < 1 || clienteNome.length > 100)) {
    throw new ErroAtendimento(400, 'Nome do cliente deve ter entre 1 e 100 caracteres');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await travarGarcomAtivo(client, garcom, token);
    const { rows: config } = await client.query('SELECT quantidade FROM configuracao_mesas WHERE id=1');
    if (numero > Number(config[0]?.quantidade || 20)) throw new ErroAtendimento(409, 'Mesa ainda não habilitada pelo administrador');
    const { rows: mesaRows } = await client.query(
      'SELECT id, numero FROM mesas WHERE numero=$1 FOR UPDATE', [numero]);
    const mesa = mesaRows[0];
    if (!mesa) throw new ErroAtendimento(404, 'Mesa não encontrada');
    const { rows: sessoes } = await client.query(
      `SELECT id, cliente_nome
         FROM mesa_sessoes
        WHERE mesa_id=$1 AND status='aberta'
        ORDER BY id DESC LIMIT 1 FOR UPDATE`, [mesa.id]);
    let sessaoId;
    let criada = false;
    if (sessoes[0]) {
      sessaoId = sessoes[0].id;
      await client.query(
        'UPDATE mesa_sessoes SET cliente_nome=COALESCE($2, cliente_nome) WHERE id=$1',
        [sessaoId, clienteNome]);
    } else {
      const { rows: novas } = await client.query(
        'INSERT INTO mesa_sessoes (mesa_id, cliente_nome) VALUES ($1,$2) RETURNING id',
        [mesa.id, clienteNome]);
      sessaoId = novas[0].id;
      criada = true;
    }
    await client.query("UPDATE mesas SET status='ocupada' WHERE id=$1 AND status <> 'ocupada'", [mesa.id]);
    await registrarEvento(client, {
      atorTipo: 'garcom', atorId: Number(garcom.id), atorNome: garcom.nome,
      acao: criada ? 'atendimento_iniciado' : 'atendimento_acessado',
      alvoTipo: 'mesa_sessao', alvoId: sessaoId, resultado: 'sucesso', requestId,
      contexto: { mesa: numero, sessaoId, origem: 'pwa_garcom', sessaoCriada: criada },
    });
    await client.query('COMMIT');
    return { mesa: numero, sessaoId, garcom: { id: garcom.id, nome: garcom.nome }, iniciada: true, idempotentReplay: !criada };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { client.release(); }
}

async function assumirMesa(token, numeroBruto, body = {}, requestId = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ErroAtendimento(400, 'Corpo de início de atendimento inválido');
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
    await travarGarcomAtivo(client, garcom, token);
    const { rows: config } = await client.query('SELECT quantidade FROM configuracao_mesas WHERE id=1');
    if (numero > Number(config[0]?.quantidade || 20)) {
      throw new ErroAtendimento(409, 'Mesa ainda não habilitada pelo administrador');
    }
    const { rows: mesaRows } = await client.query(
      'SELECT id, numero, token FROM mesas WHERE numero=$1 FOR UPDATE', [numero]);
    const mesa = mesaRows[0];
    if (!mesa) throw new ErroAtendimento(404, 'Mesa não encontrada');
    // Só uma sessão aberta criada pelo fluxo do cliente pode ser assumida.
    // Não use getOuAbrirSessao aqui: isso criaria sessão para mesa vazia antes
    // de validar a origem do pedido e deixaria um registro sem atendimento QR.
    const { rows: sessoes } = await client.query(
      `SELECT id, cliente_nome
         FROM mesa_sessoes
        WHERE mesa_id=$1 AND status='aberta'
        ORDER BY id DESC LIMIT 1
        FOR UPDATE`,
      [mesa.id]
    );
    const sessao = sessoes[0];
    if (!sessao) {
      throw new ErroAtendimento(409, 'Não existe pedido QR de cliente aguardando atendimento nesta mesa');
    }

    const { rows: pedidosCliente } = await client.query(
      `SELECT id FROM pedidos
        WHERE sessao_id=$1 AND origem_pedido='cliente'
        ORDER BY id
        LIMIT 1`,
      [sessao.id]
    );
    if (!pedidosCliente[0]) {
      throw new ErroAtendimento(409, 'Não existe pedido QR de cliente aguardando atendimento nesta mesa');
    }

    const sessaoId = sessao.id;
    await client.query(
      'UPDATE mesa_sessoes SET cliente_nome=COALESCE($2, cliente_nome) WHERE id=$1',
      [sessaoId, clienteNome]);
    await registrarEvento(client, {
      atorTipo: 'garcom', atorId: Number(garcom.id), atorNome: garcom.nome,
      acao: 'pedido_qr_assumido', alvoTipo: 'mesa_sessao', alvoId: sessaoId,
      resultado: 'sucesso', requestId,
      contexto: { mesa: numero, sessaoId, pedidoClienteId: Number(pedidosCliente[0].id) },
    });
    await client.query('COMMIT');
    return { mesa: numero, mesaToken: mesa.token, sessaoId,
      garcom: { id: garcom.id, nome: garcom.nome } };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { client.release(); }
}

async function listarPedidosProntosGarcom(token) {
  const garcom = await validarGarcom(token);
  const { getFilaGarcom } = require('./pedidos');
  return getFilaGarcom(Number(garcom.id));
}

async function resumoPagamentoSessao(token, sessaoIdBruto) {
  const garcom = await validarGarcom(token);
  const sessaoId = Number(sessaoIdBruto);
  if (!Number.isSafeInteger(sessaoId) || sessaoId < 1) {
    throw new ErroAtendimento(400, 'Sessão inválida');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows } = await client.query(
      `SELECT s.id, s.status, m.numero AS mesa
         FROM mesa_sessoes s
         JOIN mesas m ON m.id = s.mesa_id
        WHERE s.id = $1`,
      [sessaoId]
    );
    const sessao = rows[0];
    if (!sessao) throw new ErroAtendimento(404, 'Sessão não encontrada');
    if (sessao.status !== 'aberta') throw new ErroAtendimento(409, 'Sessão já está fechada');


    const valorTotal = await totalEntregueDaSessao(client, sessaoId);
    const valorPago = await totalPagoDaSessao(client, sessaoId);
    await client.query('COMMIT');
    // O garçom cobra o mesmo valor que o caixa fecharia: consumo entregue +
    // serviço padrão (TAXA_SERVICO_PERCENTUAL, 10% por padrão). Antes o resumo
    // trazia só o consumo e a conta "quitava" sem a taxa — o cliente pagava
    // menos do que a casa cobra, e o fechamento ficava sem serviço registrado.
    const taxaServicoPercentual = percentualServicoPadrao();
    const taxaServico = taxaServicoPadraoPara(valorTotal);
    const valorTotalComServico = Number((valorTotal + taxaServico).toFixed(2));
    return {
      sessaoId,
      mesa: sessao.mesa,
      // Consumo bruto entregue (sem serviço) — mantido para consumidores antigos.
      valorTotal,
      valorPago,
      valorRestante: Number(Math.max(0, valorTotal - valorPago).toFixed(2)),
      taxaServicoPercentual,
      taxaServico,
      valorTotalComServico,
      valorRestanteComServico: Number(
        Math.max(0, valorTotalComServico - valorPago).toFixed(2)
      ),
    };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}
async function criarPedidoGarcom(token, numeroBruto, body, requestId=null) {
  const garcom = await validarGarcom(token);
  const numero = Number(numeroBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 70) {
    throw new ErroAtendimento(400, 'Número de mesa inválido');
  }
  const { rows: mesas } = await pool.query('SELECT token FROM mesas WHERE numero=$1', [numero]);
  if (!mesas[0]) throw new ErroAtendimento(404, 'Mesa não encontrada');
  // Qualquer garçom ativo pode acrescentar itens a uma sessão aberta.
  const { rows: atribuidas } = await pool.query(
    `SELECT s.id FROM mesa_sessoes s JOIN mesas m ON m.id=s.mesa_id
      WHERE m.numero=$1 AND s.status='aberta'`,
    [numero]
  );
  // Replay tardio: o celular pode reenviar um pedido já gravado depois de a
  // comanda ter sido fechada. Exigir sessão aberta ANTES do replay devolvia
  // 409 para um pedido que o servidor já tinha aceito, e o aparelho ficava com
  // uma pendência eterna em conflito. Com chave de idempotência deixamos o
  // criarPedido resolver: replay devolve o original; pedido realmente novo
  // ainda é recusado lá dentro (a sessão criada é desfeita no rollback).
  const temChave = Boolean(body && typeof body === 'object' && (body.idempotencyKey || body.idempotency_key));
  if (!atribuidas[0] && !temChave) {
    throw new ErroAtendimento(409, 'A mesa precisa ter um atendimento aberto');
  }
  const { criarPedido } = require('./pedidos');
  return criarPedido(mesas[0].token, body, {
    garcomId: garcom.id,
    garcomNome: garcom.nome,
    pedidoPaiId: body && body.pedidoPaiId,
  }, requestId);
}

async function listarPedidosAtivosMesa(token, numeroBruto) {
  await validarGarcom(token);
  const numero = Number(numeroBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 70) {
    throw new ErroAtendimento(400, 'Número de mesa inválido');
  }
  const { rows } = await pool.query(`
    SELECT p.id, p.status, p.criado_em,
           COALESCE(json_agg(json_build_object(
             'nome', pr.nome,
             'quantidade', ip.quantidade,
             'status', COALESCE(ip.status, 'recebido')
           ) ORDER BY ip.id) FILTER (WHERE ip.id IS NOT NULL), '[]'::json) AS itens
      FROM mesas m
      JOIN mesa_sessoes s ON s.mesa_id=m.id AND s.status='aberta'
      JOIN pedidos p ON p.sessao_id=s.id
      LEFT JOIN itens_pedido ip ON ip.pedido_id=p.id
      LEFT JOIN produtos pr ON pr.id=ip.produto_id
     WHERE m.numero=$1
       AND p.status NOT IN ('entregue','cancelado')
     GROUP BY p.id
     ORDER BY p.criado_em DESC
     LIMIT 50`, [numero]);
  return rows.map(p => ({
    id: p.id,
    status: p.status,
    criadoEm: p.criado_em,
    itens: p.itens || [],
    label: (p.itens || []).slice(0, 3).map(i => (i.quantidade || 1) + '× ' + i.nome).join(', '),
  }));
}

async function listarAtendimentosGarcom(token) {
  const garcom=await validarGarcom(token);
  const {rows}=await pool.query(`
    SELECT p.id,p.status,p.criado_em,p.editado_em,p.cliente_nome,p.observacao_geral,p.pedido_pai_id,
           m.numero AS mesa,s.id AS sessao_id,
           COALESCE(json_agg(json_build_object(
             'id',ip.id,'productId',ip.produto_id,'nome',pr.nome,'qty',ip.quantidade,'unitPrice',ip.preco_unitario,
             'status',ip.status,'setor',ip.setor,'note',ip.observacao,'pontoCarne',ip.ponto_carne,
             'garcomAceitoId',ip.aceito_por_id,'garcomAceitoNome',ga.nome,'garcomRetirouId',ip.retirado_por_id,
             'garcomRetirouNome',gret.nome,'garcomEntregouId',ip.entregue_por_id,'garcomEntregouNome',ge.nome,
             'prontoEm',ip.pronto_em,'aceitoEm',ip.aceito_em,'retiradoEm',ip.retirado_em,'entregueEm',ip.entregue_em,
             'additions',(SELECT COALESCE(json_agg(json_build_object('id',a.adicional_id,'nome',ad.nome)),'[]'::json)
               FROM itens_pedido_adicionais a JOIN adicionais ad ON ad.id=a.adicional_id WHERE a.item_pedido_id=ip.id),
             'removals',(SELECT COALESCE(json_agg(ing.ingrediente),'[]'::json) FROM itens_pedido_remocoes ing WHERE ing.item_pedido_id=ip.id)
           ) ORDER BY ip.id) FILTER(WHERE ip.id IS NOT NULL),'[]'::json) AS itens
    FROM mesa_sessoes s JOIN mesas m ON m.id=s.mesa_id JOIN pedidos p ON p.sessao_id=s.id
    LEFT JOIN itens_pedido ip ON ip.pedido_id=p.id LEFT JOIN produtos pr ON pr.id=ip.produto_id
    LEFT JOIN garcons ga ON ga.id=ip.aceito_por_id LEFT JOIN garcons gret ON gret.id=ip.retirado_por_id
    LEFT JOIN garcons ge ON ge.id=ip.entregue_por_id
    WHERE s.status='aberta'
    GROUP BY p.id,m.numero,s.id,gr.nome ORDER BY p.criado_em DESC LIMIT 250`,[garcom.id]);
  return rows.map(x=>({id:x.id,mesa:x.mesa,sessaoId:x.sessao_id,status:x.status,
    pedidoPaiId:x.pedido_pai_id||null,criadoEm:x.criado_em,editadoEm:x.editado_em,clienteNome:x.cliente_nome,
    note:x.observacao_geral,itens:x.itens,
    podeEditar:x.status==='recebido'&&x.itens.every(i=>i.status==='recebido')}));
}

async function editarPedidoGarcom(token,pedidoId,body,requestId=null){
  const garcom=await validarGarcom(token);
  const id=Number(pedidoId);
  if(!Number.isSafeInteger(id)||id<1)throw new ErroAtendimento(400,'Pedido inválido');
  const {rows}=await pool.query(`
    SELECT m.token FROM pedidos p
    JOIN mesa_sessoes s ON s.id=p.sessao_id
    JOIN mesas m ON m.id=s.mesa_id
    WHERE p.id=$1 AND s.status='aberta'`,[id]);
   if(!rows[0])throw new ErroAtendimento(404,'Pedido não encontrado em atendimento aberto');
  const {editarPedidoCliente}=require('./pedidos');
  return editarPedidoCliente(rows[0].token,id,body,garcom.id,requestId);
}
async function metricasGarcons({ data } = {}) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'America/Sao_Paulo',
    year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  // Compatibilidade: data única continua aceita; intervalo usa "início..fim".
  const partes = typeof data === 'string' && data.includes('..') ? data.split('..') : [data || hoje, data || hoje];
  const [from, to] = partes;
  const formatoValido = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor || '') && !Number.isNaN(Date.parse(valor));
  if (partes.length !== 2 || !formatoValido(from) || !formatoValido(to) || from > to) {
    throw new ErroAtendimento(400, 'Informe um período válido em YYYY-MM-DD');
  }
  const tz = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
  const { rows } = await pool.query(`
    SELECT g.id, g.nome, g.ativo, (g.removido_em IS NOT NULL) AS removido,
      (SELECT COUNT(DISTINCT p.sessao_id)::int FROM pedidos p
        WHERE p.garcom_registrou_id=g.id
          AND (p.criado_em AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date) AS atendimentos,
      (SELECT COALESCE(SUM(ip.quantidade * (ip.preco_unitario + COALESCE(
          (SELECT SUM(a.preco_unitario) FROM itens_pedido_adicionais a WHERE a.item_pedido_id=ip.id), 0
        ))), 0)::numeric(12,2)
         FROM itens_pedido ip JOIN pedidos p ON p.id=ip.pedido_id
        WHERE ip.entregue_por_id=g.id AND ip.entregue_em IS NOT NULL
          AND (ip.entregue_em AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date) AS vendas,
      (SELECT CASE WHEN COUNT(DISTINCT p.sessao_id)=0 THEN 0
          ELSE ROUND((
            SELECT COALESCE(SUM(ip.quantidade * (ip.preco_unitario + COALESCE(
              (SELECT SUM(a.preco_unitario) FROM itens_pedido_adicionais a WHERE a.item_pedido_id=ip.id), 0
            ))), 0)
              FROM itens_pedido ip JOIN pedidos p2 ON p2.id=ip.pedido_id
             WHERE ip.entregue_por_id=g.id AND ip.entregue_em IS NOT NULL
               AND (ip.entregue_em AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
          ) / COUNT(DISTINCT p.sessao_id), 2)
         END
         FROM pedidos p WHERE p.garcom_registrou_id=g.id
           AND (p.criado_em AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date)::numeric(12,2) AS ticket_medio,
      (SELECT COUNT(DISTINCT p.id)::int FROM pedidos p
        WHERE p.garcom_registrou_id=g.id AND (p.criado_em AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date) AS pedidos_registrados,
      (SELECT COUNT(DISTINCT ip.pedido_id)::int FROM itens_pedido ip
        WHERE ip.entregue_por_id=g.id AND ip.entregue_em IS NOT NULL
          AND (ip.entregue_em AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date) AS pedidos_com_entrega_registrada,
      (SELECT COUNT(*)::int FROM itens_pedido ip
        WHERE ip.aceito_por_id=g.id AND ip.aceito_em IS NOT NULL
          AND (ip.aceito_em AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date) AS itens_assumidos,
      (SELECT COUNT(*)::int FROM itens_pedido ip
        WHERE ip.retirado_por_id=g.id AND ip.retirado_em IS NOT NULL
          AND (ip.retirado_em AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date) AS itens_retirados,
      (SELECT COUNT(*)::int FROM itens_pedido ip
        WHERE ip.entregue_por_id=g.id AND ip.entregue_em IS NOT NULL
          AND (ip.entregue_em AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date) AS itens_entregues,
      (SELECT COALESCE(json_agg(json_build_object('acao', ev.acao, 'quantidade', ev.total) ORDER BY ev.acao), '[]'::json)
         FROM (
           SELECT ae.acao, COUNT(*)::int AS total
             FROM auditoria_eventos ae
            WHERE ae.ator_tipo='garcom' AND ae.ator_id=g.id AND ae.resultado='sucesso'
              AND (ae.criado_em AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
              AND ae.acao NOT IN ('mesa_iniciada','mesa_assumida','mesa_transferida',
                'entrega_assumida','itens_retirados','itens_entregues','item_status','sessao_fechada')
            GROUP BY ae.acao
         ) ev) AS outros_eventos
    FROM garcons g
    WHERE g.removido_em IS NULL
       OR EXISTS (SELECT 1 FROM pedidos p WHERE p.garcom_registrou_id=g.id)
       OR EXISTS (SELECT 1 FROM itens_pedido ip WHERE ip.entregue_por_id=g.id)
    GROUP BY g.id, g.nome, g.ativo, g.removido_em
    ORDER BY vendas DESC, pedidos_registrados DESC, g.nome ASC
  `, [from, to, tz]);

  // Atribuição operacional agora usa o ator real: pedidos registrados por garçom
  // e valor dos itens entregues por garçom. Taxa/desconto da conta não são
  // atribuídos a um titular de mesa inexistente.
  return {
    periodo: { from, to, timezone: tz },
    criterio: 'pedidos registrados e itens efetivamente entregues por cada garçom no período e fuso selecionados; não há atribuição financeira por titularidade de mesa',
    garcons: rows.map(x => {
      const valorItensEntregues = Number(x.vendas || 0);
      const contas = Number(x.atendimentos);
      return {
        id:x.id, nome:x.nome, ativo:x.ativo, removido:x.removido,
        atendimentos:contas, pedidosRegistrados:x.pedidos_registrados,
        pedidosComEntregaRegistrada:x.pedidos_com_entrega_registrada,
        valorItensEntregues,

        itensAssumidos:x.itens_assumidos,
        itensRetirados:x.itens_retirados,
        itensEntregues:x.itens_entregues,
        outrosEventos:x.outros_eventos || []
      };
    })
  };
}
module.exports={ ErroAtendimento, listarMesasGarcom, iniciarAtendimentoGarcom, assumirMesa, listarPedidosProntosGarcom, resumoPagamentoSessao, criarPedidoGarcom, listarPedidosAtivosMesa, listarAtendimentosGarcom, editarPedidoGarcom, metricasGarcons };
