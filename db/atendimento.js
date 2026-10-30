const pool = require('./pool');
const { getGarcomPorToken } = require('./garcons');
const { totalEntregueDaSessao, totalPagoDaSessao } = require('./conta');
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
async function listarMesasGarcom(token) {
  const garcom = await validarGarcom(token);
  const { rows } = await pool.query(`
    SELECT m.id, m.numero, m.token, s.id AS sessao_id, s.cliente_nome,
           s.garcom_responsavel_id, g.nome AS garcom_responsavel_nome,
           EXISTS (
             SELECT 1 FROM pedidos p
              WHERE p.sessao_id = s.id AND p.origem_pedido = 'cliente'
           ) AS pedido_cliente_qr
      FROM mesas m
      LEFT JOIN mesa_sessoes s ON s.mesa_id = m.id AND s.status = 'aberta'
      LEFT JOIN garcons g ON g.id = s.garcom_responsavel_id
     WHERE m.numero <= COALESCE((SELECT quantidade FROM configuracao_mesas WHERE id=1), 20)
     ORDER BY m.numero`);
  return { garcom: { id: garcom.id, nome: garcom.nome }, mesas: rows.map(r => ({
    id: r.id, numero: r.numero,
    // O token QR é uma credencial bearer. Um garçom só recebe o token das
    // mesas sob sua responsabilidade atual, não de todas as mesas do salão.
    token: Number(r.garcom_responsavel_id) === Number(garcom.id) ? r.token : null,
    sessaoId: r.sessao_id, clienteNome: r.cliente_nome,
    garcomResponsavelId: r.garcom_responsavel_id,
    garcomResponsavelNome: r.garcom_responsavel_nome,
    pedidoClienteQr: r.pedido_cliente_qr === true,
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
    const { rows: config } = await client.query('SELECT quantidade FROM configuracao_mesas WHERE id=1');
    if (numero > Number(config[0]?.quantidade || 20)) throw new ErroAtendimento(409, 'Mesa ainda não habilitada pelo administrador');
    const { rows: mesaRows } = await client.query(
      'SELECT id, numero FROM mesas WHERE numero=$1 FOR UPDATE', [numero]);
    const mesa = mesaRows[0];
    if (!mesa) throw new ErroAtendimento(404, 'Mesa não encontrada');
    const { rows: sessoes } = await client.query(
      `SELECT id, garcom_responsavel_id, cliente_nome
         FROM mesa_sessoes
        WHERE mesa_id=$1 AND status='aberta'
        ORDER BY id DESC LIMIT 1 FOR UPDATE`, [mesa.id]);
    let sessaoId;
    let anterior = null;
    let criada = false;
    if (sessoes[0]) {
      const sessao = sessoes[0];
      anterior = sessao.garcom_responsavel_id;
      if (anterior && Number(anterior) !== Number(garcom.id)) {
        throw new ErroAtendimento(409, 'Mesa já está sob responsabilidade de outro garçom. Peça ao responsável para transferir.');
      }
      sessaoId = sessao.id;
      await client.query(
        'UPDATE mesa_sessoes SET garcom_responsavel_id=$2, cliente_nome=COALESCE($3, cliente_nome) WHERE id=$1',
        [sessaoId, garcom.id, clienteNome]);
    } else {
      const { rows: novas } = await client.query(
        'INSERT INTO mesa_sessoes (mesa_id, cliente_nome, garcom_responsavel_id) VALUES ($1,$2,$3) RETURNING id',
        [mesa.id, clienteNome, garcom.id]);
      sessaoId = novas[0].id;
      criada = true;
    }
    await client.query("UPDATE mesas SET status='ocupada' WHERE id=$1 AND status <> 'ocupada'", [mesa.id]);
    if (Number(anterior) !== Number(garcom.id)) {
      await client.query(
        `INSERT INTO mesa_atendimento_historico
          (sessao_id,garcom_anterior_id,garcom_novo_id,alterado_por_id)
         VALUES ($1,$2,$3,$4)`, [sessaoId, anterior, garcom.id, garcom.id]);
      await registrarEvento(client, {
        atorTipo: 'garcom', atorId: Number(garcom.id), atorNome: garcom.nome,
        acao: criada ? 'mesa_iniciada' : 'mesa_assumida',
        alvoTipo: 'mesa_sessao', alvoId: sessaoId, resultado: 'sucesso', requestId,
        contexto: { mesa: numero, sessaoId, origem: 'pwa_garcom', sessaoCriada: criada },
      });
    }
    await client.query('COMMIT');
    return { mesa: numero, sessaoId, garcom: { id: garcom.id, nome: garcom.nome }, iniciada: true, idempotentReplay: Number(anterior) === Number(garcom.id) };
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
      `SELECT id, garcom_responsavel_id, cliente_nome
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
    const anterior = sessao.garcom_responsavel_id;
    // Iniciar atendimento nunca é uma transferência implícita. Só o responsável
    // atual pode transferir, usando o endpoint explícito e auditado.
    if (anterior && Number(anterior) !== Number(garcom.id)) {
      throw new ErroAtendimento(409, 'Mesa já está sob responsabilidade de outro garçom. Peça ao responsável para transferir.');
    }
    await client.query(`
      UPDATE mesa_sessoes SET garcom_responsavel_id=$2,
        cliente_nome=COALESCE($3, cliente_nome)
      WHERE id=$1`, [sessaoId, garcom.id, clienteNome]);
    if (Number(anterior) !== Number(garcom.id)) {
      await client.query(`
        INSERT INTO mesa_atendimento_historico
          (sessao_id,garcom_anterior_id,garcom_novo_id,alterado_por_id)
        VALUES ($1,$2,$3,$4)`, [sessaoId, anterior, garcom.id, garcom.id]);
      await registrarEvento(client, {
        atorTipo: 'garcom', atorId: Number(garcom.id), atorNome: garcom.nome,
        acao: 'mesa_assumida', alvoTipo: 'mesa_sessao', alvoId: sessaoId,
        resultado: 'sucesso', requestId,
        contexto: { mesa: numero, sessaoId, pedidoClienteId: Number(pedidosCliente[0].id) },
      });
    }
    await client.query('COMMIT');
    return { mesa: numero, mesaToken: mesa.token, sessaoId,
      garcom: { id: garcom.id, nome: garcom.nome }, transferida: false };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { client.release(); }
}

async function listarGarconsAtivos(token) {
  await validarGarcom(token);
  const { rows } = await pool.query(
    'SELECT id, nome FROM garcons WHERE ativo=TRUE ORDER BY nome ASC, id ASC');
  return rows;
}

async function transferirMesa(token, numeroBruto, garcomDestinoBruto, requestId = null) {
  const origem = await validarGarcom(token);
  const numero = Number(numeroBruto);
  const destinoId = Number(garcomDestinoBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 70) {
    throw new ErroAtendimento(400, 'Número de mesa inválido');
  }
  if (!Number.isSafeInteger(destinoId) || destinoId < 1) {
    throw new ErroAtendimento(400, 'Garçom de destino inválido');
  }
  if (destinoId === Number(origem.id)) {
    throw new ErroAtendimento(400, 'Escolha outro garçom para transferir a mesa');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Não bloqueamos a linha da mesa aqui: fechamento/início podem usar a ordem
    // mesa → sessão. A transferência bloqueia somente a sessão para evitar deadlocks.
    const { rows: mesaRows } = await client.query(
      'SELECT id FROM mesas WHERE numero=$1 FOR UPDATE', [numero]);
    const mesa = mesaRows[0];
    if (!mesa) throw new ErroAtendimento(404, 'Mesa não encontrada');

    const { rows: sessoes } = await client.query(
      `SELECT id, garcom_responsavel_id FROM mesa_sessoes
        WHERE mesa_id=$1 AND status='aberta'
        ORDER BY id DESC LIMIT 1 FOR UPDATE`, [mesa.id]);
    const sessao = sessoes[0];
    if (!sessao) throw new ErroAtendimento(409, 'Não há atendimento aberto para transferir');
    if (Number(sessao.garcom_responsavel_id) !== Number(origem.id)) {
      throw new ErroAtendimento(403, 'Somente o responsável atual pode transferir esta mesa');
    }

    // FOR SHARE (como em transferirMesaAdmin): FOR UPDATE colidia com o
    // FOR SHARE que a entrega do próprio destino mantém sobre a própria
    // linha enquanto espera a sessão — deadlock 40P01 sob carga (#158).
    const { rows: destinos } = await client.query(
      'SELECT id, nome, ativo FROM garcons WHERE id=$1 FOR SHARE', [destinoId]);
    const destino = destinos[0];
    if (!destino) throw new ErroAtendimento(404, 'Garçom de destino não encontrado');
    if (!destino.ativo) throw new ErroAtendimento(409, 'O garçom de destino não está ativo');

    await client.query(
      'UPDATE mesa_sessoes SET garcom_responsavel_id=$2 WHERE id=$1',
      [sessao.id, destino.id]);
    await client.query(`
      INSERT INTO mesa_atendimento_historico
        (sessao_id,garcom_anterior_id,garcom_novo_id,alterado_por_id)
      VALUES ($1,$2,$3,$4)`,
      [sessao.id, origem.id, destino.id, origem.id]);
    await registrarEvento(client, {
      atorTipo: 'garcom', atorId: Number(origem.id), atorNome: origem.nome,
      acao: 'mesa_transferida', alvoTipo: 'mesa_sessao', alvoId: sessao.id,
      resultado: 'sucesso', requestId,
      contexto: {
        mesa: numero, sessaoId: sessao.id,
        garcomAnteriorId: Number(origem.id), garcomAnteriorNome: origem.nome,
        garcomNovoId: Number(destino.id), garcomNovoNome: destino.nome,
      },
    });

    await client.query('COMMIT');
    return {
      mesa: numero,
      sessaoId: sessao.id,
      transferida: true,
      de: { id: origem.id, nome: origem.nome },
      para: { id: destino.id, nome: destino.nome },
      pedidosProntosMantidos: true,
    };
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
      `SELECT s.id, s.status, s.garcom_responsavel_id, m.numero AS mesa
         FROM mesa_sessoes s
         JOIN mesas m ON m.id = s.mesa_id
        WHERE s.id = $1`,
      [sessaoId]
    );
    const sessao = rows[0];
    if (!sessao) throw new ErroAtendimento(404, 'Sessão não encontrada');
    if (sessao.status !== 'aberta') throw new ErroAtendimento(409, 'Sessão já está fechada');
    if (Number(sessao.garcom_responsavel_id) !== Number(garcom.id)) {
      throw new ErroAtendimento(403, 'Somente o garçom responsável atual pode consultar a cobrança desta mesa');
    }

    const valorTotal = await totalEntregueDaSessao(client, sessaoId);
    const valorPago = await totalPagoDaSessao(client, sessaoId);
    await client.query('COMMIT');
    return {
      sessaoId,
      mesa: sessao.mesa,
      valorTotal,
      valorPago,
      valorRestante: Number(Math.max(0, valorTotal - valorPago).toFixed(2)),
    };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}
async function deixarMesa(token, numeroBruto, requestId = null) {
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
      WHERE p.sessao_id=$1 AND COALESCE(ip.status,'recebido') NOT IN ('entregue','cancelado')`,[sessoes[0].id]);
    if(pendentes[0].total>0)throw new ErroAtendimento(409,'Existem itens ainda não entregues. Entregue-os ou transfira a mesa para outro garçom antes de deixá-la.');
    await client.query('UPDATE mesa_sessoes SET garcom_responsavel_id=NULL WHERE id=$1',[sessoes[0].id]);
    await registrarEvento(client, {
      atorTipo: 'garcom', atorId: Number(garcom.id), atorNome: garcom.nome,
      acao: 'mesa_liberada', alvoTipo: 'mesa_sessao', alvoId: sessoes[0].id,
      resultado: 'sucesso', requestId,
      contexto: { mesa: numero, sessaoId: sessoes[0].id },
    });
    await client.query('COMMIT');
    return {mesa:numero,liberada:true,sessaoId:sessoes[0].id};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
async function criarPedidoGarcom(token, numeroBruto, body, requestId=null) {
  const garcom = await validarGarcom(token);
  const numero = Number(numeroBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 70) {
    throw new ErroAtendimento(400, 'Número de mesa inválido');
  }
  const { rows: mesas } = await pool.query('SELECT token FROM mesas WHERE numero=$1', [numero]);
  if (!mesas[0]) throw new ErroAtendimento(404, 'Mesa não encontrada');
  // Qualquer garçom ativo pode acrescentar itens a uma sessão aberta que
  // já tem responsável. A responsabilidade da mesa continua com o titular;
  // assumir/transferir é uma ação separada e nunca deve ocorrer implicitamente.
  const { rows: atribuidas } = await pool.query(
    `SELECT s.id FROM mesa_sessoes s JOIN mesas m ON m.id=s.mesa_id
      WHERE m.numero=$1 AND s.status='aberta' AND s.garcom_responsavel_id IS NOT NULL`,
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
    throw new ErroAtendimento(409, 'A mesa precisa ter um atendimento aberto com garçom responsável');
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
       AND s.garcom_responsavel_id IS NOT NULL
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
           m.numero AS mesa,s.id AS sessao_id,s.garcom_responsavel_id,gr.nome AS garcom_responsavel_nome,
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
    LEFT JOIN garcons gr ON gr.id=s.garcom_responsavel_id
    LEFT JOIN itens_pedido ip ON ip.pedido_id=p.id LEFT JOIN produtos pr ON pr.id=ip.produto_id
    LEFT JOIN garcons ga ON ga.id=ip.aceito_por_id LEFT JOIN garcons gret ON gret.id=ip.retirado_por_id
    LEFT JOIN garcons ge ON ge.id=ip.entregue_por_id
    WHERE s.status='aberta' AND (s.garcom_responsavel_id=$1 OR EXISTS (
      SELECT 1 FROM itens_pedido mine WHERE mine.pedido_id=p.id AND (mine.aceito_por_id=$1 OR mine.retirado_por_id=$1)
    ))
    GROUP BY p.id,m.numero,s.id,gr.nome ORDER BY p.criado_em DESC LIMIT 250`,[garcom.id]);
  return rows.map(x=>({id:x.id,mesa:x.mesa,sessaoId:x.sessao_id,status:x.status,
    garcomResponsavelId:x.garcom_responsavel_id,garcomResponsavelNome:x.garcom_responsavel_nome,
    pedidoPaiId:x.pedido_pai_id||null,criadoEm:x.criado_em,editadoEm:x.editado_em,clienteNome:x.cliente_nome,
    note:x.observacao_geral,itens:x.itens,
    podeEditar:Number(x.garcom_responsavel_id)===Number(garcom.id)&&x.status==='recebido'&&x.itens.every(i=>i.status==='recebido')}));
}

async function editarPedidoGarcom(token,pedidoId,body,requestId=null){
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
  return editarPedidoCliente(rows[0].token,id,body,garcom.id,requestId);
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
     AND (s.fechada_em AT TIME ZONE $2)::date = $1::date
    GROUP BY g.id, g.nome, g.ativo
    ORDER BY vendas DESC, g.nome ASC`, [dia, process.env.APP_TIMEZONE || 'America/Sao_Paulo']);
  return { data: dia, criterio: 'contas fechadas atribuídas ao responsável pela sessão',
    garcons: rows.map(x=>({ id:x.id, nome:x.nome, ativo:x.ativo, atendimentos:x.atendimentos,
      vendas:Number(x.vendas), ticketMedio:Number(x.ticket_medio) })) };
}
async function transferirMesaAdmin(staff,numeroBruto,destinoBruto,requestId=null) {
  const numero=Number(numeroBruto),destinoId=Number(destinoBruto);
  if(!Number.isSafeInteger(numero)||numero<1||numero>70||!Number.isSafeInteger(destinoId)||destinoId<1)throw new ErroAtendimento(400,'Mesa ou garçom de destino inválido');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows:mesas}=await client.query('SELECT id FROM mesas WHERE numero=$1 FOR UPDATE',[numero]);
    if(!mesas[0])throw new ErroAtendimento(404,'Mesa não encontrada');
    const {rows:sessoes}=await client.query("SELECT id,garcom_responsavel_id FROM mesa_sessoes WHERE mesa_id=$1 AND status='aberta' FOR UPDATE",[mesas[0].id]);
    if(!sessoes[0])throw new ErroAtendimento(409,'Não há atendimento aberto para transferir');
    const {rows:destinos}=await client.query('SELECT id,nome,ativo FROM garcons WHERE id=$1 FOR SHARE',[destinoId]);
    if(!destinos[0]?.ativo)throw new ErroAtendimento(409,'O garçom de destino não está ativo');
    const anterior=sessoes[0].garcom_responsavel_id;
    if(Number(anterior)===destinoId)throw new ErroAtendimento(409,'Este garçom já é o responsável pela mesa');
    await client.query('UPDATE mesa_sessoes SET garcom_responsavel_id=$2 WHERE id=$1',[sessoes[0].id,destinoId]);
    await client.query(`INSERT INTO mesa_atendimento_historico
      (sessao_id,garcom_anterior_id,garcom_novo_id,alterado_por_staff_id) VALUES ($1,$2,$3,$4)`,[sessoes[0].id,anterior,destinoId,staff.id]);
    await registrarEvento(client,{atorTipo:'staff',atorId:staff.id,atorNome:staff.nome,acao:'mesa_transferida',alvoTipo:'mesa_sessao',alvoId:sessoes[0].id,
      requestId,contexto:{mesa:numero,garcomAnteriorId:anterior,garcomNovoId:destinoId,origem:'admin'}});
    await client.query('COMMIT');
    return {mesa:numero,sessaoId:sessoes[0].id,garcomResponsavelId:destinoId,garcomResponsavelNome:destinos[0].nome,transferida:true};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}

// Transferências concorrem com entregas/fechamentos que travam mesa e
// sessão; mesmo com a ordem de locks alinhada, um deadlock residual
// (40P01) é transitório e seguro de repetir — a vítima abortou antes do
// COMMIT. Sem o retry, ele vazava como HTTP 500 para o garçom.
const comRetryTransferencia = (fn) => (...args) => comRetryConcorrencia(() => fn(...args), { rotulo: fn.name });

module.exports={ ErroAtendimento, transferirMesaAdmin: comRetryTransferencia(transferirMesaAdmin), listarMesasGarcom, iniciarAtendimentoGarcom, assumirMesa, listarGarconsAtivos, transferirMesa: comRetryTransferencia(transferirMesa), listarPedidosProntosGarcom, resumoPagamentoSessao, deixarMesa, criarPedidoGarcom, listarPedidosAtivosMesa, listarAtendimentosGarcom, editarPedidoGarcom, metricasGarcons };
