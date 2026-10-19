const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não definida. Copie .env.example para .env e ajuste.');
  process.exit(1);
}

/**
 * Neon / Render colocam ?sslmode=require na URL.
 * O driver pg emite SECURITY WARNING porque trata require como verify-full.
 *
 * Estratégia:
 * 1. Remove qualquer sslmode=require|prefer|verify-ca da string
 * 2. Força sslmode=verify-full (mesmo comportamento de hoje, sem warning)
 * 3. Se DATABASE_SSL_REJECT_UNAUTHORIZED=false, usa ssl explícito sem verificação
 */
function buildPoolConfig() {
  let connectionString = String(process.env.DATABASE_URL).trim();

  // Remove sslmode problemático (funciona mesmo com senha especial / URL “suja”)
  connectionString = connectionString.replace(
    /([?&])sslmode=(require|prefer|verify-ca)(&|$)/gi,
    (_, sep, _mode, end) => (end === '&' ? sep : '')
  );
  // Limpa ? ou & sobrando no final
  connectionString = connectionString
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');

  const wantsNoVerify = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false';
  const hasSslHint =
    process.env.DATABASE_SSL === 'true' ||
    /[?&]sslmode=/i.test(process.env.DATABASE_URL) ||
    /neon\.tech|render\.com|amazonaws\.com|supabase\.co/i.test(process.env.DATABASE_URL || '');

  if (wantsNoVerify) {
    // Provedor com cert que o Node não confia — SSL sem validar hostname/CA
    return {
      connectionString,
      ssl: { rejectUnauthorized: false },
    };
  }

  if (hasSslHint || /[?&]sslmode=/i.test(connectionString)) {
    // Garante verify-full na string (silencia o warning)
    const join = connectionString.includes('?') ? '&' : '?';
    if (!/[?&]sslmode=/i.test(connectionString)) {
      connectionString = `${connectionString}${join}sslmode=verify-full`;
    }
  }

  return { connectionString };
}

const base = buildPoolConfig();

function inteiroPositivoOuPadrao(nome, padrao) {
  const n = Number(process.env[nome]);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : padrao;
}

// Orçamentos de tempo do lado do servidor: uma transação travada não pode
// segurar lock de mesa/produto (nem uma conexão do pool) para sempre no pico.
// São tetos folgados para operação normal (consulta legítima é milissegundos);
// servem para transformar "travou e ninguém sabe" em erro visível e lock
// liberado. Ajustáveis por ambiente; 0/inválido cai no padrão.
const statementTimeoutMs = inteiroPositivoOuPadrao('PG_STATEMENT_TIMEOUT_MS', 30_000);
const lockTimeoutMs = inteiroPositivoOuPadrao('PG_LOCK_TIMEOUT_MS', 15_000);
const idleTxTimeoutMs = inteiroPositivoOuPadrao('PG_IDLE_TX_TIMEOUT_MS', 30_000);

const pool = new Pool({
  ...base,
  // 70 mesas simultâneas não significam 70 conexões: cada pedido segura uma
  // conexão por poucos ms. O padrão 10 é conservador (planos pequenos de PG).
  // No teste de carga de 70 mesas, PG_POOL_MAX=20 NÃO deu ganho mensurável
  // (431 vs 428 req/s): o gargalo era CPU/latência de commit, não o pool.
  // Só aumente observando conexões ativas/espera (pg_stat_activity); pool
  // maior que a capacidade do Postgres só move a fila para dentro do banco.
  max: inteiroPositivoOuPadrao('PG_POOL_MAX', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: inteiroPositivoOuPadrao('PG_CONNECT_TIMEOUT_MS', 10_000),
  keepAlive: true,
  statement_timeout: statementTimeoutMs,
  lock_timeout: lockTimeoutMs,
  idle_in_transaction_session_timeout: idleTxTimeoutMs,
  query_timeout: statementTimeoutMs,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err.message || err);
});

module.exports = pool;
