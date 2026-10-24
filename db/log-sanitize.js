'use strict';

const UUID_TOKEN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

/**
 * Reduz uma URL de requisição para logging sem query string e sem segmentos
 * UUID, usados como tokens bearer nos caminhos de mesa/garçom.
 * Não registra host, query params nem fragmento.
 */
function sanitizarCaminhoParaLog(requestUrl) {
  const raw = typeof requestUrl === 'string' && requestUrl ? requestUrl : '/';
  let pathname;
  try {
    pathname = new URL(raw, 'http://localhost').pathname;
  } catch (_) {
    pathname = raw.split(/[?#]/, 1)[0] || '/';
  }
  return pathname.replace(UUID_TOKEN, '[redacted]').slice(0, 300);
}

module.exports = { sanitizarCaminhoParaLog };
