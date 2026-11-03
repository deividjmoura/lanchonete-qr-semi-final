'use strict';

const crypto = require('crypto');
const pool = require('./pool');

const SSE_TICKET_TTL_MS = 60_000;
const MAX_TICKET_LENGTH = 64;

function hashCredencialSse(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function emitirTicketSse({ tipo, recursoId, credencial, ttlMs = SSE_TICKET_TTL_MS }) {
  if (!['staff', 'mesa', 'garcom'].includes(tipo)) throw new TypeError('Tipo de acesso SSE inválido');
  if (!Number.isSafeInteger(Number(recursoId)) || Number(recursoId) < 1) throw new TypeError('Identificador SSE inválido');
  if (typeof credencial !== 'string' || !credencial || credencial.length > 256) throw new TypeError('Credencial SSE inválida');

  const ticket = crypto.randomBytes(32).toString('base64url');
  const ticketHash = hashCredencialSse(ticket);
  const expiresAt = new Date(Date.now() + Math.min(Math.max(Number(ttlMs) || SSE_TICKET_TTL_MS, 1_000), SSE_TICKET_TTL_MS));

  // Limpeza oportunista e limitada; nunca apaga tickets ainda válidos.
  await pool.query(
    `DELETE FROM sse_tickets
      WHERE expires_at < now() - interval '10 minutes'
         OR used_at < now() - interval '10 minutes'`
  );
  await pool.query(
    `INSERT INTO sse_tickets (ticket_hash, access_type, resource_id, credential_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [ticketHash, tipo, Number(recursoId), hashCredencialSse(credencial), expiresAt]
  );
  return ticket;
}

async function consumirTicketSse(ticket) {
  if (typeof ticket !== 'string' || ticket.length > MAX_TICKET_LENGTH || !/^[A-Za-z0-9_-]{40,50}$/.test(ticket)) {
    return null;
  }
  const ticketHash = hashCredencialSse(ticket);
  const { rows } = await pool.query(
    `UPDATE sse_tickets
        SET used_at = now()
      WHERE ticket_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING access_type, resource_id, credential_hash`,
    [ticketHash]
  );
  return rows[0] || null;
}

module.exports = {
  SSE_TICKET_TTL_MS,
  hashCredencialSse,
  emitirTicketSse,
  consumirTicketSse,
};
