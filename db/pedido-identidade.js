const crypto = require('node:crypto');

/** Hash do comando, não do preço enviado pelo navegador. Nunca inclui o token. */
function fingerprintPedido({ mesa, body, pedidoPaiId = null }) {
  const canonical = {
    mesa: Number(mesa),
    clienteNome: String(body.clienteNome || body.cliente_nome || '').trim(),
    note: String(body.note || '').trim(),
    pedidoPaiId: pedidoPaiId == null ? null : Number(pedidoPaiId),
    items: (Array.isArray(body.items) ? body.items : []).map((i) => ({
      productId: Number(i.productId ?? i.id),
      qty: i.qty == null || i.qty === '' ? 1 : Number(i.qty),
      meatPoint: i.meatPoint || null,
      note: String(i.note || '').trim(),
      additions: [...new Set((Array.isArray(i.additions) ? i.additions : []).map((a) => Number(a.id ?? a)))].sort((a,b) => a-b),
      removals: [...new Set((Array.isArray(i.removals) ? i.removals : []).filter((x) => typeof x === 'string').map((x) => x.trim()))].sort(),
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function dataCliente(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return false;
  const time = typeof raw === 'number' ? raw : Date.parse(raw);
  if (!Number.isFinite(time) || time < 0 || time > 8640000000000000) return false;
  return new Date(time).toISOString();
}

module.exports = { fingerprintPedido, dataCliente };
