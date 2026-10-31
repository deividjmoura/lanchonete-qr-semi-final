// Panorama operacional de mesas (admin).
//
// Uma linha por mesa habilitada — inclusive as livres — com sessão, garçom,
// pedidos ativos, consumo em aberto e faixa de tempo de ocupação. O panorama
// não substitui os cards individuais por números agregados: o resumo é apenas
// um apoio de leitura no topo da tela.
//
// Regras financeiras (mesma fonte do caixa, db/conta.js):
//  * "consumo" = itens ENTREGUES, com adicionais, sem abater pagamentos;
//  * "pago" = lançamentos em sessao_pagamentos (pagamentos parciais);
//  * "saldo" = consumo - pago (nunca negativo). Consumo em aberto NÃO é
//    receita: só contas fechadas entram em vendas do período.
//
// Tempos do fluxo usam somente horários reais gravados na operação. Item sem
// início/pronto/retirada/entrega não entra na média; nenhuma duração é
// inferida a partir do status atual. Entregas diretas (concluído → entregue)
// não têm retirada registrada e por isso aparecem como indisponíveis nessa
// etapa, em vez de receber um tempo inventado.

const pool = require('./pool');
const { ErroAdmin } = require('./admin');

const TZ = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
const LIMITE_MESAS = 70;
const PERIODOS = new Set(['hoje', 'semana', 'mes']);
const JANELA_FLUXO_HORAS = 24;
const AMOSTRA_MINIMA = 5;
// Fronteira de sanidade: um passo do fluxo acima de 12h é dado antigo/errado
// (tablet dormindo, item legado), não um tempo de preparo real.
const LIMITE_ETAPA_HORAS = 12;

const FAIXAS_PADRAO = Object.freeze({ atencaoMinutos: 45, criticoMinutos: 90 });

/** Normaliza as faixas vindas do banco (snake_case) ou da API (camelCase). */
function normalizarFaixas(origem = {}) {
  const atencao = Number(origem.atencaoMinutos ?? origem.atencao_minutos ?? FAIXAS_PADRAO.atencaoMinutos);
  const critico = Number(origem.criticoMinutos ?? origem.critico_minutos ?? FAIXAS_PADRAO.criticoMinutos);
  const atencaoValida = Number.isFinite(atencao) && atencao > 0 ? Math.floor(atencao) : FAIXAS_PADRAO.atencaoMinutos;
  const criticoValido = Number.isFinite(critico) && critico > atencaoValida ? Math.floor(critico) : Math.max(atencaoValida + 1, FAIXAS_PADRAO.criticoMinutos);
  return { atencaoMinutos: atencaoValida, criticoMinutos: criticoValido };
}

/**
 * Faixa de ocupação da mesa. Função pura (testada em tests/mesas-panorama).
 * `abertaEm` ausente/inválida => sem faixa (mesa livre ou sessão sem horário).
 */
function faixaOcupacao(abertaEm, agora = Date.now(), faixas = FAIXAS_PADRAO) {
  const inicio = abertaEm ? new Date(abertaEm).getTime() : NaN;
  if (!Number.isFinite(inicio)) return null;
  const referencia = Number(agora);
  if (!Number.isFinite(referencia)) return null;
  const minutos = Math.max(0, Math.floor((referencia - inicio) / 60000));
  const { atencaoMinutos, criticoMinutos } = normalizarFaixas(faixas);
  const id = minutos < atencaoMinutos ? 'recente' : minutos < criticoMinutos ? 'atencao' : 'critica';
  return { id, minutos, atencaoMinutos, criticoMinutos };
}

const ETAPAS_FLUXO = Object.freeze([
  {
    id: 'recebimento_inicio',
    rotulo: 'Recebimento → início do preparo',
    descricao: 'Da criação do pedido até o item entrar em produção.',
    setores: ['cozinha', 'bar'],
  },
  {
    id: 'inicio_pronto',
    rotulo: 'Início → pronto',
    descricao: 'Do início do preparo até o item ficar pronto no setor.',
    setores: ['cozinha', 'bar'],
  },
  {
    id: 'pronto_retirada',
    rotulo: 'Pronto → retirada',
    descricao: 'Do item pronto até o garçom retirá-lo do setor.',
    setores: ['cozinha', 'bar', 'garcom'],
  },
  {
    id: 'retirada_entrega',
    rotulo: 'Retirada → entrega',
    descricao: 'Do item retirado até a confirmação de entrega na mesa.',
    setores: ['cozinha', 'bar', 'garcom'],
  },
]);

const SETORES_FLUXO = Object.freeze([
  { id: 'cozinha', rotulo: 'Cozinha' },
  { id: 'bar', rotulo: 'Bar' },
  { id: 'garcom', rotulo: 'Garçom' },
]);

function arred1(valor) {
  return Number(Number(valor).toFixed(1));
}

/**
 * Monta o painel de tempos a partir das linhas agregadas do SQL.
 * Cada etapa expõe `minutos`, `amostras`, `disponivel` e `aproximado`.
 * `aproximado` marca amostra pequena — nunca um tempo estimado.
 */
function montarFluxo(linhas = [], { horas = JANELA_FLUXO_HORAS, desde = null, ate = null, amostraMinima = AMOSTRA_MINIMA } = {}) {
  const porChave = new Map();
  for (const linha of linhas || []) {
    const chave = String(linha.chave || linha.setor || '').toLowerCase();
    if (chave) porChave.set(chave, linha);
  }
  const setores = {};
  for (const setor of SETORES_FLUXO) {
    const linha = porChave.get(setor.id) || {};
    const etapas = {};
    for (const etapa of ETAPAS_FLUXO) {
      const amostras = Number(linha[`n_${etapa.id}`] || 0);
      const media = linha[`m_${etapa.id}`];
      const aplicavel = etapa.setores.includes(setor.id);
      const minutos = aplicavel && amostras > 0 && Number.isFinite(Number(media)) ? arred1(Number(media)) : null;
      etapas[etapa.id] = {
        aplicavel,
        minutos,
        amostras: aplicavel ? amostras : 0,
        disponivel: minutos !== null,
        // Amostra pequena é sinalizada como aproximada; não escondemos o dado.
        aproximado: minutos !== null && amostras < amostraMinima,
      };
    }
    setores[setor.id] = { id: setor.id, rotulo: setor.rotulo, etapas };
  }
  return {
    janela: { horas, desde, ate },
    amostraMinima,
    limiteEtapaHoras: LIMITE_ETAPA_HORAS,
    etapas: ETAPAS_FLUXO.map(({ id, rotulo, descricao, setores: aplicaveis }) => ({
      id,
      rotulo,
      descricao,
      setores: [...aplicaveis],
    })),
    setores,
  };
}

function validarPeriodo(periodo) {
  if (!PERIODOS.has(periodo)) {
    throw new ErroAdmin(400, 'Período inválido. Use hoje, semana ou mes.');
  }
  return periodo;
}

function iso(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function numeroMesa(numeroBruto) {
  const numero = Number(numeroBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > LIMITE_MESAS) {
    throw new ErroAdmin(400, 'Informe o número de uma mesa entre 1 e 70');
  }
  return numero;
}

async function lerConfiguracao(client) {
  const { rows } = await client.query(
    'SELECT quantidade, atencao_minutos, critico_minutos FROM configuracao_mesas WHERE id = 1'
  );
  const linha = rows[0] || {};
  return {
    quantidade: Number(linha.quantidade ?? 20),
    faixas: normalizarFaixas(linha),
  };
}

const SQL_MESAS = `
  WITH ativas AS (
    SELECT m.id, m.numero, m.token, m.status, m.praca_id
      FROM mesas m
     WHERE m.numero <= COALESCE((SELECT quantidade FROM configuracao_mesas WHERE id = 1), 20)
       AND ($1::int IS NULL OR m.numero = $1::int)
  ),
  sessao AS (
    SELECT s.id, s.mesa_id, s.aberta_em, s.cliente_nome, s.garcom_responsavel_id,
           g.nome AS garcom_nome
      FROM mesa_sessoes s
      LEFT JOIN garcons g ON g.id = s.garcom_responsavel_id
     WHERE s.status = 'aberta'
  ),
  consumo AS (
    SELECT p.sessao_id,
           COALESCE(SUM(
             ip.quantidade * (
               ip.preco_unitario + COALESCE((
                 SELECT SUM(a.preco_unitario)
                   FROM itens_pedido_adicionais a
                  WHERE a.item_pedido_id = ip.id
               ), 0)
             )
           ), 0)::float AS valor
      FROM pedidos p
      JOIN itens_pedido ip ON ip.pedido_id = p.id
     WHERE COALESCE(ip.status, 'recebido') = 'entregue'
     GROUP BY p.sessao_id
  ),
  pago AS (
    SELECT sp.sessao_id, COALESCE(SUM(sp.valor), 0)::float AS valor
      FROM sessao_pagamentos sp
     GROUP BY sp.sessao_id
  ),
  pedidos_ativos AS (
    SELECT p.sessao_id,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE p.status = 'recebido')::int AS recebidos,
           COUNT(*) FILTER (WHERE p.status = 'em_producao')::int AS preparo,
           COUNT(*) FILTER (WHERE p.status = 'concluido')::int AS prontos
      FROM pedidos p
     WHERE p.status NOT IN ('entregue', 'cancelado')
     GROUP BY p.sessao_id
  ),
  itens_fila AS (
    SELECT p.sessao_id,
           COUNT(*) FILTER (WHERE ip.status IN ('recebido', 'em_producao'))::int AS na_fila,
           COUNT(*) FILTER (WHERE ip.status IN ('concluido', 'aceito', 'retirado'))::int AS prontos_retirada
      FROM pedidos p
      JOIN itens_pedido ip ON ip.pedido_id = p.id
     WHERE COALESCE(ip.status, 'recebido') NOT IN ('entregue', 'cancelado')
     GROUP BY p.sessao_id
  )
  SELECT a.numero, a.id, a.token, a.status AS mesa_status,
         a.praca_id, pr.nome AS praca_nome, pr.ordem AS praca_ordem,
         s.id AS sessao_id, s.aberta_em, s.cliente_nome,
         s.garcom_responsavel_id, s.garcom_nome,
         COALESCE(c.valor, 0)::float AS consumo,
         COALESCE(pg.valor, 0)::float AS pago,
         COALESCE(pa.total, 0)::int AS pedidos_ativos,
         COALESCE(pa.recebidos, 0)::int AS pedidos_recebidos,
         COALESCE(pa.preparo, 0)::int AS pedidos_preparo,
         COALESCE(pa.prontos, 0)::int AS pedidos_prontos,
         COALESCE(f.na_fila, 0)::int AS itens_na_fila,
         COALESCE(f.prontos_retirada, 0)::int AS itens_prontos_retirada
    FROM ativas a
    LEFT JOIN mesa_pracas pr ON pr.id = a.praca_id
    LEFT JOIN sessao s ON s.mesa_id = a.id
    LEFT JOIN consumo c ON c.sessao_id = s.id
    LEFT JOIN pago pg ON pg.sessao_id = s.id
    LEFT JOIN pedidos_ativos pa ON pa.sessao_id = s.id
    LEFT JOIN itens_fila f ON f.sessao_id = s.id
   ORDER BY a.numero`;

function mapearMesa(linha, faixas, agora) {
  const abertaEm = iso(linha.aberta_em);
  const consumo = Number(linha.consumo || 0);
  const pago = Number(linha.pago || 0);
  const ocupada = Boolean(linha.sessao_id);
  return {
    id: Number(linha.id),
    numero: Number(linha.numero),
    token: linha.token,
    status: ocupada ? 'ocupada' : 'livre',
    pracaId: linha.praca_id != null ? Number(linha.praca_id) : null,
    pracaNome: linha.praca_nome || null,
    pracaOrdem: linha.praca_ordem != null ? Number(linha.praca_ordem) : null,
    sessaoId: linha.sessao_id ? Number(linha.sessao_id) : null,
    abertaEm,
    tempo: ocupada ? faixaOcupacao(abertaEm, agora, faixas) : null,
    clienteNome: linha.cliente_nome || null,
    garcomResponsavelId: linha.garcom_responsavel_id != null ? Number(linha.garcom_responsavel_id) : null,
    garcomResponsavelNome: linha.garcom_nome || null,
    consumo: Number(consumo.toFixed(2)),
    pago: Number(pago.toFixed(2)),
    saldo: Number(Math.max(0, consumo - pago).toFixed(2)),
    pedidosAtivos: Number(linha.pedidos_ativos || 0),
    pedidosRecebidos: Number(linha.pedidos_recebidos || 0),
    pedidosPreparo: Number(linha.pedidos_preparo || 0),
    pedidosProntos: Number(linha.pedidos_prontos || 0),
    itensNaFila: Number(linha.itens_na_fila || 0),
    itensProntosRetirada: Number(linha.itens_prontos_retirada || 0),
  };
}

async function carregarMesas(client, { numero = null, faixas, agora }) {
  const { rows } = await client.query(SQL_MESAS, [numero]);
  return rows.map((linha) => mapearMesa(linha, faixas, agora));
}

async function carregarVendas(client, periodo) {
  const { rows: limites } = await client.query(
    `WITH relogio AS (
       SELECT (CURRENT_TIMESTAMP AT TIME ZONE $1)::date AS hoje
     )
     SELECT to_char(hoje, 'YYYY-MM-DD') AS ate,
            to_char(CASE $2::text
                      WHEN 'hoje' THEN hoje
                      WHEN 'semana' THEN date_trunc('week', hoje::timestamp)::date
                      WHEN 'mes' THEN date_trunc('month', hoje::timestamp)::date
                    END, 'YYYY-MM-DD') AS desde
       FROM relogio`,
    [TZ, periodo]
  );
  const desde = limites[0]?.desde;
  const ate = limites[0]?.ate;
  const { rows } = await client.query(
    `SELECT m.numero,
            COUNT(*)::int AS contas,
            COALESCE(SUM(COALESCE(s.valor_cobrado, s.valor_total, 0)), 0)::float AS total
       FROM mesa_sessoes s
       JOIN mesas m ON m.id = s.mesa_id
      WHERE s.status = 'fechada'
        AND s.fechada_em >= ($1::date::timestamp AT TIME ZONE $3)
        AND s.fechada_em < (($2::date + 1)::timestamp AT TIME ZONE $3)
      GROUP BY m.numero
      ORDER BY m.numero`,
    [desde, ate, TZ]
  );
  return {
    periodo,
    timezone: TZ,
    desde,
    ate,
    porMesa: rows.map((r) => ({
      numero: Number(r.numero),
      contas: Number(r.contas),
      total: Number(Number(r.total).toFixed(2)),
    })),
  };
}

async function carregarFluxo(client, horas = JANELA_FLUXO_HORAS) {
  const { rows } = await client.query(
    `WITH janela AS (
       SELECT CURRENT_TIMESTAMP - ($1::int * interval '1 hour') AS desde,
              CURRENT_TIMESTAMP AS ate
     ),
     base AS (
       SELECT COALESCE(ip.setor, pr.setor, 'cozinha') AS setor,
              CASE WHEN ip.iniciado_em IS NOT NULL
                    AND ip.iniciado_em >= ped.criado_em
                    AND ip.iniciado_em <= ped.criado_em + ($2::int * interval '1 hour')
                   THEN EXTRACT(EPOCH FROM (ip.iniciado_em - ped.criado_em)) / 60 END AS recebimento_inicio,
              CASE WHEN ip.iniciado_em IS NOT NULL AND ip.pronto_em IS NOT NULL
                    AND ip.pronto_em >= ip.iniciado_em
                    AND ip.pronto_em <= ip.iniciado_em + ($2::int * interval '1 hour')
                   THEN EXTRACT(EPOCH FROM (ip.pronto_em - ip.iniciado_em)) / 60 END AS inicio_pronto,
              CASE WHEN ip.pronto_em IS NOT NULL AND ip.retirado_em IS NOT NULL
                    AND ip.retirado_em >= ip.pronto_em
                    AND ip.retirado_em <= ip.pronto_em + ($2::int * interval '1 hour')
                   THEN EXTRACT(EPOCH FROM (ip.retirado_em - ip.pronto_em)) / 60 END AS pronto_retirada,
              CASE WHEN ip.retirado_em IS NOT NULL AND ip.entregue_em IS NOT NULL
                    AND ip.entregue_em >= ip.retirado_em
                    AND ip.entregue_em <= ip.retirado_em + ($2::int * interval '1 hour')
                   THEN EXTRACT(EPOCH FROM (ip.entregue_em - ip.retirado_em)) / 60 END AS retirada_entrega
         FROM itens_pedido ip
         JOIN pedidos ped ON ped.id = ip.pedido_id
         JOIN produtos pr ON pr.id = ip.produto_id
        WHERE COALESCE(ip.status, 'recebido') <> 'cancelado'
          AND GREATEST(ip.entregue_em, ip.retirado_em, ip.aceito_em, ip.pronto_em,
                       ip.iniciado_em, ped.criado_em) >= (SELECT desde FROM janela)
     ),
     agregado AS (
       SELECT setor AS chave,
              COUNT(*) FILTER (WHERE recebimento_inicio IS NOT NULL)::int AS n_recebimento_inicio,
              AVG(recebimento_inicio)::float AS m_recebimento_inicio,
              COUNT(*) FILTER (WHERE inicio_pronto IS NOT NULL)::int AS n_inicio_pronto,
              AVG(inicio_pronto)::float AS m_inicio_pronto,
              COUNT(*) FILTER (WHERE pronto_retirada IS NOT NULL)::int AS n_pronto_retirada,
              AVG(pronto_retirada)::float AS m_pronto_retirada,
              COUNT(*) FILTER (WHERE retirada_entrega IS NOT NULL)::int AS n_retirada_entrega,
              AVG(retirada_entrega)::float AS m_retirada_entrega
         FROM base GROUP BY setor
       UNION ALL
       SELECT 'garcom' AS chave,
              COUNT(*) FILTER (WHERE recebimento_inicio IS NOT NULL)::int,
              AVG(recebimento_inicio)::float,
              COUNT(*) FILTER (WHERE inicio_pronto IS NOT NULL)::int,
              AVG(inicio_pronto)::float,
              COUNT(*) FILTER (WHERE pronto_retirada IS NOT NULL)::int,
              AVG(pronto_retirada)::float,
              COUNT(*) FILTER (WHERE retirada_entrega IS NOT NULL)::int,
              AVG(retirada_entrega)::float
         FROM base
     )
     SELECT a.*, j.desde, j.ate
       FROM agregado a CROSS JOIN janela j`,
    [horas, LIMITE_ETAPA_HORAS]
  );
  const janela = { desde: iso(rows[0]?.desde), ate: iso(rows[0]?.ate) };
  return montarFluxo(rows, { horas, ...janela });
}

async function listarPracasComUso(client) {
  const { rows } = await client.query(
    `SELECT p.id, p.nome, p.ordem,
            COUNT(m.id) FILTER (
              WHERE m.numero BETWEEN 1 AND COALESCE((
                SELECT quantidade FROM configuracao_mesas WHERE id = 1
              ), 20)
            )::int AS mesas
       FROM mesa_pracas p
       LEFT JOIN mesas m ON m.praca_id = p.id
      GROUP BY p.id, p.nome, p.ordem
      ORDER BY p.ordem, lower(p.nome), p.id`
  );
  return rows.map((r) => ({ id: Number(r.id), nome: r.nome, ordem: Number(r.ordem), mesas: Number(r.mesas) }));
}

/** Painel completo consumido pela aba Mesas do admin. */
async function panoramaMesas({ periodo = 'hoje', agora = Date.now() } = {}) {
  validarPeriodo(periodo);
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const config = await lerConfiguracao(client);
    const mesas = await carregarMesas(client, {
      faixas: config.faixas,
      agora: Number(agora),
    });
    const pracas = await listarPracasComUso(client);
    const vendas = await carregarVendas(client, periodo);
    const fluxo = await carregarFluxo(client);
    const { rows: relogio } = await client.query('SELECT CURRENT_TIMESTAMP AS agora');
    await client.query('COMMIT');
    return {
      config: { quantidade: config.quantidade, limite: LIMITE_MESAS, faixas: config.faixas },
      pracas,
      mesas,
      vendas,
      fluxo,
      atualizadoEm: iso(relogio[0]?.agora) || new Date(Number(agora)).toISOString(),
    };
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    client.release();
  }
}

/** Dados completos de uma mesa para o modal do mapa. */
async function mesaDetalhe(numeroBruto, { agora = Date.now() } = {}) {
  const numero = numeroMesa(numeroBruto);
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const config = await lerConfiguracao(client);
    if (numero > config.quantidade) {
      throw new ErroAdmin(409, 'Mesa ainda não habilitada pelo administrador');
    }
    const [mesa] = await carregarMesas(client, { numero, faixas: config.faixas, agora: Number(agora) });
    if (!mesa) throw new ErroAdmin(404, 'Mesa não encontrada');
    const pedidos = [];
    const pagamentos = [];
    if (mesa.sessaoId) {
      const { rows } = await client.query(
        `SELECT p.id, p.status, p.criado_em, p.editado_em, p.cliente_nome, p.garcom_nome,
                COALESCE(json_agg(json_build_object(
                  'id', ip.id, 'nome', pr.nome, 'quantidade', ip.quantidade,
                  'status', COALESCE(ip.status, 'recebido'),
                  'setor', COALESCE(ip.setor, pr.setor, 'cozinha'),
                  'prontoEm', ip.pronto_em, 'retiradoEm', ip.retirado_em, 'entregueEm', ip.entregue_em
                ) ORDER BY ip.id) FILTER (WHERE ip.id IS NOT NULL), '[]'::json) AS itens
           FROM pedidos p
           LEFT JOIN itens_pedido ip ON ip.pedido_id = p.id
           LEFT JOIN produtos pr ON pr.id = ip.produto_id
          WHERE p.sessao_id = $1
          GROUP BY p.id
          ORDER BY p.criado_em DESC, p.id DESC
          LIMIT 30`,
        [mesa.sessaoId]
      );
      for (const pedido of rows) {
        pedidos.push({
          id: Number(pedido.id),
          status: pedido.status,
          criadoEm: iso(pedido.criado_em),
          editadoEm: iso(pedido.editado_em),
          clienteNome: pedido.cliente_nome || null,
          garcomNome: pedido.garcom_nome || null,
          itens: (pedido.itens || []).map((item) => ({
            id: Number(item.id),
            nome: item.nome,
            quantidade: Number(item.quantidade),
            status: item.status,
            setor: item.setor === 'bar' ? 'bar' : 'cozinha',
            prontoEm: iso(item.prontoEm),
            retiradoEm: iso(item.retiradoEm),
            entregueEm: iso(item.entregueEm),
          })),
        });
      }
      const { rows: pagos } = await client.query(
        `SELECT id, valor, forma_pagamento, criado_em
           FROM sessao_pagamentos
          WHERE sessao_id = $1
          ORDER BY criado_em, id`,
        [mesa.sessaoId]
      );
      for (const pago of pagos) {
        pagamentos.push({
          id: Number(pago.id),
          valor: Number(Number(pago.valor).toFixed(2)),
          forma: pago.forma_pagamento,
          criadoEm: iso(pago.criado_em),
        });
      }
    }
    await client.query('COMMIT');
    return { ...mesa, faixas: config.faixas, pedidos, pagamentos, atualizadoEm: new Date(Number(agora)).toISOString() };
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    client.release();
  }
}

module.exports = {
  FAIXAS_PADRAO,
  LIMITE_MESAS,
  ETAPAS_FLUXO,
  SETORES_FLUXO,
  normalizarFaixas,
  faixaOcupacao,
  montarFluxo,
  panoramaMesas,
  mesaDetalhe,
  _internos: { lerConfiguracao, carregarVendas, carregarFluxo, mapearMesa },
};
