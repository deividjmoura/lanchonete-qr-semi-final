// Trilha de auditoria persistente (issue #48). Eventos são gravados na MESMA
// transação da operação quando o chamador passa o client, para nunca existir
// evento sem operação nem operação sem evento. O módulo também oferece um
// caminho com conexão própria apenas para rotinas sem transação aberta.
//
// Política de conteúdo: sem senha, hash, token bearer, segredo PIX ou dado
// pessoal sensível. Chaves suspeitas no contexto são removidas e o payload
// JSON é limitado; o teste tests/auditoria.test.cjs trava esse contrato.

const pool = require('./pool');

const ATORES = new Set(['staff', 'garcom', 'cliente_mesa', 'sistema']);
const RESULTADOS = new Set(['sucesso', 'negado', 'falha']);
const CHAVE_PROIBIDA = /(senha|password|hash|token|segredo|secret|pix.?chave|cookie|credencial)/i;
const MAX_CONTEXTO_BYTES = 4096;
const MAX_TEXTO = 200;

function textoLimitado(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  if (!s) return fallback;
  return s.slice(0, MAX_TEXTO);
}

function limparContexto(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const saida = {};
  for (const [chave, valor] of Object.entries(obj)) {
    if (CHAVE_PROIBIDA.test(chave)) continue;
    if (valor === null || ['string', 'number', 'boolean'].includes(typeof valor)) {
      saida[chave] = typeof valor === 'string' ? valor.slice(0, MAX_TEXTO) : valor;
    }
    // objetos aninhados não são suportados de propósito: contexto mínimo e
    // previsível, sem carteira de dados pessoais.
  }
  let json = JSON.stringify(saida);
  if (json.length > MAX_CONTEXTO_BYTES) {
    const reduzido = { aviso: 'contexto reduzido pelo limite de tamanho' };
    json = JSON.stringify(reduzido);
    return reduzido;
  }
  return saida;
}

function normalizarEvento(evento = {}) {
  const atorTipo = String(evento.atorTipo || 'sistema');
  if (!ATORES.has(atorTipo)) {
    throw new Error(`ator de auditoria inválido: ${atorTipo}`);
  }
  const resultado = String(evento.resultado || 'sucesso');
  if (!RESULTADOS.has(resultado)) {
    throw new Error(`resultado de auditoria inválido: ${resultado}`);
  }
  const acao = textoLimitado(evento.acao);
  if (!acao) throw new Error('evento de auditoria exige ação');
  return {
    atorTipo,
    atorId: Number.isInteger(evento.atorId) ? evento.atorId : null,
    atorNome: textoLimitado(evento.atorNome),
    acao,
    alvoTipo: textoLimitado(evento.alvoTipo),
    alvoId: textoLimitado(evento.alvoId),
    resultado,
    contexto: limparContexto(evento.contexto),
    requestId: textoLimitado(evento.requestId),
  };
}

const INSERT_SQL = `
  INSERT INTO auditoria_eventos
    (ator_tipo, ator_id, ator_nome, acao, alvo_tipo, alvo_id, resultado, contexto, request_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
  RETURNING id`;

async function registrarEvento(client, evento) {
  const e = normalizarEvento(evento);
  const { rows } = await client.query(INSERT_SQL, [
    e.atorTipo, e.atorId, e.atorNome, e.acao, e.alvoTipo, e.alvoId,
    e.resultado, JSON.stringify(e.contexto), e.requestId,
  ]);
  return { id: rows[0].id, ...e };
}

/** Apenas para rotinas sem transação própria (ex.: scripts e eventos do sistema). */
async function registrarEventoIndependente(evento) {
  const client = await pool.connect();
  try {
    return await registrarEvento(client, evento);
  } finally {
    client.release();
  }
}

module.exports = {
  registrarEvento,
  registrarEventoIndependente,
  limparContexto,
  normalizarEvento,
};
