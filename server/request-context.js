'use strict';

// Correlação de logs por requisição (issue #43). O identificador é gerado
// pela aplicação e devolvido em `X-Request-Id`; quando um edge confiável
// enviar um cabeçalho de correlação em formato estrito, ele é preservado para
// permitir cruzar logs do proxy com os da aplicação. Cabeçalhos malformados
// são sempre substituídos por um ID novo — nunca confiados no log.

const crypto = require('node:crypto');

// UUID, ULID ou token alfanumérico/hífen entre 8 e 128 caracteres. Qualquer
// outra coisa (espaços, pontuação, barras, segredos longos) é rejeitada.
const FORMATO_ACEITO = /^[a-z0-9][a-z0-9-]{7,127}$/i;

function gerarRequestId() {
  return crypto.randomUUID();
}

function normalizarRequestIdRecebido(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > 128) return null;
  return FORMATO_ACEITO.test(id) ? id : null;
}

function requestIdDaRequisicao(req) {
  const headers = (req && req.headers) || {};
  // Ordem: edge do provedor primeiro, cabeçalho genérico depois.
  const recebido =
    normalizarRequestIdRecebido(headers['x-railway-request-id']) ||
    normalizarRequestIdRecebido(headers['x-request-id']);
  return recebido || gerarRequestId();
}

/**
 * Linha de log estruturada em uma única linha JSON. `alvo` já deve chegar
 * sanitizado (ver db/log-sanitizer): aqui nenhuma URL crua é serializada.
 */
function linhaDeLog(level, { reqId, method, alvo, status, mensagem }) {
  const entrada = {
    ts: new Date().toISOString(),
    level,
    reqId: reqId || null,
    method: typeof method === 'string' ? method.slice(0, 10) : null,
    alvo: alvo || null,
    status: Number.isInteger(status) ? status : null,
    mensagem: typeof mensagem === 'string' ? mensagem.slice(0, 500) : String(mensagem || ''),
  };
  return JSON.stringify(entrada);
}

module.exports = {
  gerarRequestId,
  normalizarRequestIdRecebido,
  requestIdDaRequisicao,
  linhaDeLog,
};
