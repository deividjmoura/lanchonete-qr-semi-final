// Sanitização defensiva para logs da aplicação. Nunca registrar query string:
 // tokens de mesa também podem ser enviados como parâmetros de SSE.
function sanitizarAlvoRequisicao(rawUrl) {
  try {
    const url = new URL(String(rawUrl || '/'), 'http://localhost');
    let pathname = url.pathname;
    pathname = pathname.replace(/(\/api\/(?:garcom|mesas)\/)[^/]+/gi, '$1[REDACTED]');
    pathname = pathname.replace(/(\/(?:garcom|mesa)\/)[^/]+/gi, '$1[REDACTED]');
    return pathname;
  } catch (_) {
    return '[caminho inválido]';
  }
}

function sanitizarDetalheErro(error) {
  const detalhe = error && (error.stack || error.message)
    ? String(error.stack || error.message)
    : String(error || 'erro desconhecido');
  // Tokens bearer deste sistema são UUIDs. Redigir UUIDs em erros evita que
  // uma mensagem/stack que incorpore URL vaze a credencial por outro caminho.
  return detalhe.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    '[REDACTED]'
  );
}

module.exports = { sanitizarAlvoRequisicao, sanitizarDetalheErro };
