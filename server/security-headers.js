'use strict';

const CSP_ENFORCE = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// Observação apenas: remove unsafe-inline para revelar dependências existentes
// sem bloquear o site. Só é enviado quando CSP_REPORT_ONLY=1.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/csp-report",
].join('; ');

function applySecurityHeaders(res, env = process.env) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader('Content-Security-Policy', CSP_ENFORCE);
  }
  if (env.CSP_REPORT_ONLY === '1') {
    res.setHeader('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
  }
}

module.exports = { applySecurityHeaders, CSP_ENFORCE, CSP_REPORT_ONLY };
