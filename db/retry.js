// Retry estreito para erros de concorrência transitórios do PostgreSQL.
//
// Com ordem global de locks (mesa → sessão → pedido → itens → produtos por
// id), deadlock (40P01) e abort por serialização (40001) devem ser raríssimos.
// Mas com 70 mesas, "raríssimo" ainda acontece no pico — e a transação vítima
// é, por definição, segura para repetir: ela foi abortada ANTES do COMMIT,
// então nada foi gravado duas vezes. Qualquer outro erro (400/409 de negócio,
// violação de unicidade, 500 genérico) NÃO é repetido.

const CODIGOS_REPETIVEIS = new Set(['40P01', '40001']);

function ehErroConcorrenciaTransitorio(err) {
  return !!(err && CODIGOS_REPETIVEIS.has(String(err.code || '')));
}

const dormirPadrao = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @template T
 * @param {(tentativa: number) => Promise<T>} fn  operação transacional completa
 * @param {{ tentativas?: number, atrasoBaseMs?: number, dormir?: Function, rotulo?: string }} [opts]
 * @returns {Promise<T>}
 */
async function comRetryConcorrencia(fn, opts = {}) {
  const tentativas = Math.max(1, Math.min(5, Math.trunc(opts.tentativas || 3)));
  const base = Math.max(0, Number(opts.atrasoBaseMs ?? 25));
  const dormir = typeof opts.dormir === 'function' ? opts.dormir : dormirPadrao;

  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      return await fn(tentativa);
    } catch (err) {
      ultimoErro = err;
      if (tentativa === tentativas || !ehErroConcorrenciaTransitorio(err)) throw err;
      // backoff exponencial com jitter: 25-50ms, 50-100ms, ... (bem abaixo de
      // qualquer timeout de cliente; o pedido continua "instantâneo")
      const teto = base * 2 ** (tentativa - 1);
      await dormir(teto + Math.random() * teto);
      if (opts.rotulo) {
        console.warn(`[transacional] retry ${tentativa}/${tentativas} em ${opts.rotulo} (${err.code})`);
      }
    }
  }
  throw ultimoErro;
}

module.exports = { comRetryConcorrencia, ehErroConcorrenciaTransitorio, CODIGOS_REPETIVEIS };
