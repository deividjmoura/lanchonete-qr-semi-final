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
module.exports={ ErroAtendimento, listarMesasGarcom, assumirMesa, metricasGarcons };
