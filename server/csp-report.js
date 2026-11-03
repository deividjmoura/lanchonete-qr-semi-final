'use strict';

function texto(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function origemSegura(value) {
  const raw = texto(value);
  if (!raw) return 'unknown';
  if (raw === 'inline' || raw === 'eval' || raw === 'self') return raw;
  if (raw.startsWith('data:')) return 'data:';
  if (raw.startsWith('blob:')) return 'blob:';
  try {
    return new URL(raw).origin;
  } catch (_) {
    return 'opaque';
  }
}

function diretivaSegura(value) {
  const raw = texto(value).toLowerCase();
  return /^[a-z][a-z0-9-]{0,63}$/.test(raw) ? raw : 'unknown';
}

function normalizarUmRelatorio(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const source = entry['csp-report'] || entry.body || entry;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;

  const directive = diretivaSegura(
    source['effective-directive'] || source.effectiveDirective ||
    source['violated-directive'] || source.violatedDirective
  );
  const blockedOrigin = origemSegura(
    source['blocked-uri'] || source.blockedURL || source.blockedUri
  );
  const documentOrigin = origemSegura(
    source['document-uri'] || source.documentURL || source.documentUri
  );
  const rawDisposition = texto(source.disposition).toLowerCase();
  const disposition = rawDisposition === 'report' || rawDisposition === 'enforce'
    ? rawDisposition
    : 'unknown';
  const rawStatus = Number(source['status-code'] ?? source.statusCode);
  const statusCode = Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599
    ? rawStatus
    : null;

  if (directive === 'unknown' && blockedOrigin === 'unknown' && documentOrigin === 'unknown') {
    return null;
  }
  return { directive, blockedOrigin, documentOrigin, disposition, statusCode };
}

function normalizarRelatoriosCsp(payload) {
  const entries = Array.isArray(payload) ? payload.slice(0, 10) : [payload];
  return entries.map(normalizarUmRelatorio).filter(Boolean);
}

function formatarMensagemCsp(report) {
  return [
    'csp_violation',
    'directive=' + report.directive,
    'blocked=' + report.blockedOrigin,
    'document=' + report.documentOrigin,
    'disposition=' + report.disposition,
    'status=' + (report.statusCode == null ? 'unknown' : report.statusCode),
  ].join(' ');
}

module.exports = { normalizarRelatoriosCsp, formatarMensagemCsp };
