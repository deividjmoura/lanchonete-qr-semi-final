'use strict';

const net = require('node:net');

/**
 * Resolve the client address only from the socket unless the deployment has
 * explicitly established how many trusted proxies append X-Forwarded-For.
 *
 * IMPORTANT: trustedProxyHops is safe only when direct/untrusted access to the
 * application origin is prevented and each trusted proxy appends the observed
 * peer address to the RIGHT side of X-Forwarded-For. Do not infer this value
 * from the header itself or enable it before confirming the deployment path.
 */
function normalizeIp(value) {
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  if (!ip || net.isIP(ip) === 0) return null;
  if (ip.startsWith('::ffff:') && net.isIP(ip.slice(7)) === 4) {
    return ip.slice(7);
  }
  return ip.toLowerCase();
}

function resolveClientIp(req, { trustedProxyHops = 0 } = {}) {
  const socketIp = normalizeIp(req?.socket?.remoteAddress) || 'unknown';

  if (!Number.isSafeInteger(trustedProxyHops) || trustedProxyHops < 1) {
    return socketIp;
  }

  const header = req?.headers?.['x-forwarded-for'];
  if (typeof header !== 'string' || !header.trim()) return socketIp;

  const chain = header.split(',').map(normalizeIp);
  // Fail closed to the socket peer for malformed or too-short chains.
  if (chain.some((ip) => ip === null) || chain.length < trustedProxyHops) {
    return socketIp;
  }

  // Each trusted proxy appends the peer it observed. Walk back past the
  // configured number of trusted hops; never blindly trust the leftmost item.
  return chain[chain.length - trustedProxyHops];
}

function loginRateLimitKey(ip) {
  return `login:${normalizeIp(ip) || 'unknown'}`;
}

function orderRateLimitKey(ip, mesaToken) {
  // Mesa tokens are opaque path credentials; do not log or normalize them here.
  return `pedido:${normalizeIp(ip) || 'unknown'}:${String(mesaToken)}`;
}

module.exports = { normalizeIp, resolveClientIp, loginRateLimitKey, orderRateLimitKey };
