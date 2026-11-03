'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  applySecurityHeaders,
  CSP_REPORT_ONLY,
} = require('../server/security-headers');
const {
  normalizarRelatoriosCsp,
  formatarMensagemCsp,
} = require('../server/csp-report');

function responseFake(initial = {}) {
  const headers = { ...initial };
  return {
    headers,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
  };
}

test('CSP Report-Only é opt-in e não altera a política efetiva atual', () => {
  const disabled = responseFake();
  applySecurityHeaders(disabled, { NODE_ENV: 'test' });
  assert.equal(disabled.getHeader('Content-Security-Policy-Report-Only'), undefined);
  assert.match(disabled.getHeader('Content-Security-Policy'), /script-src 'self' 'unsafe-inline'/);

  const enabled = responseFake();
  applySecurityHeaders(enabled, { NODE_ENV: 'test', CSP_REPORT_ONLY: '1' });
  const reportOnly = enabled.getHeader('Content-Security-Policy-Report-Only');
  assert.equal(reportOnly, CSP_REPORT_ONLY);
  assert.match(reportOnly, /script-src 'self'/);
  assert.match(reportOnly, /style-src 'self' https:\/\/fonts\.googleapis\.com/);
  assert.match(reportOnly, /report-uri \/api\/csp-report/);
  assert.doesNotMatch(reportOnly, /unsafe-inline/);
  assert.match(enabled.getHeader('Content-Security-Policy'), /unsafe-inline/);
});

test('preserva CSP efetiva customizada e mantém HSTS apenas em produção', () => {
  const res = responseFake({ 'content-security-policy': "default-src 'none'" });
  applySecurityHeaders(res, { NODE_ENV: 'production', CSP_REPORT_ONLY: '0' });
  assert.equal(res.getHeader('Content-Security-Policy'), "default-src 'none'");
  assert.equal(res.getHeader('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains');
  assert.equal(res.getHeader('Content-Security-Policy-Report-Only'), undefined);
});

test('normaliza relatório legado sem preservar paths, queries ou tokens', () => {
  const reports = normalizarRelatoriosCsp({
    'csp-report': {
      'document-uri': 'https://qradmin.example/garcom-pwa/?token=SECRET_BEARER',
      'blocked-uri': 'https://evil.example/payload.js?token=SECRET_BEARER',
      'effective-directive': 'script-src-elem',
      disposition: 'report',
      'status-code': 200,
      'script-sample': 'window.secret = "SECRET_BEARER"',
    },
  });
  assert.deepEqual(reports, [{
    directive: 'script-src-elem',
    blockedOrigin: 'https://evil.example',
    documentOrigin: 'https://qradmin.example',
    disposition: 'report',
    statusCode: 200,
  }]);
  const mensagem = formatarMensagemCsp(reports[0]);
  assert.match(mensagem, /directive=script-src-elem/);
  assert.doesNotMatch(mensagem, /SECRET_BEARER|garcom-pwa|payload\.js/);
});

test('normaliza Reporting API, valores inline e ignora payloads inválidos', () => {
  const reports = normalizarRelatoriosCsp([
    {
      type: 'csp-violation',
      body: {
        documentURL: 'https://qradmin.example/#/admin',
        blockedURL: 'inline',
        effectiveDirective: 'style-src-attr',
        disposition: 'report',
        statusCode: 200,
      },
    },
    { type: 'unsupported', body: null },
    null,
  ]);
  assert.deepEqual(reports, [{
    directive: 'style-src-attr',
    blockedOrigin: 'inline',
    documentOrigin: 'https://qradmin.example',
    disposition: 'report',
    statusCode: 200,
  }]);
});

test('limita a dez relatórios por payload e descarta diretivas inválidas', () => {
  const reports = normalizarRelatoriosCsp(Array.from({ length: 20 }, (_, i) => ({
    'csp-report': {
      'effective-directive': i === 0 ? '<script>' : 'img-src',
      'blocked-uri': 'data:image/png;base64,AAAA',
      'document-uri': 'https://qradmin.example/path?token=secret',
      disposition: 'enforce',
      'status-code': 200,
    },
  })));
  assert.equal(reports.length, 10);
  assert.equal(reports[0].directive, 'unknown');
  assert.equal(reports[1].directive, 'img-src');
  assert.equal(reports[1].blockedOrigin, 'data:');
});

test('rota CSP exige opt-in, limita corpo e registra somente campos normalizados', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /p === '\/api\/csp-report' && req\.method === 'POST'/);
  assert.match(server, /process\.env\.CSP_REPORT_ONLY !== '1'/);
  assert.match(server, /maxBytes: 16 \* 1024/);
  assert.match(server, /golpePermitido\(`csp-report:\$\{clientIp\(req\)\}`/);
  assert.match(server, /formatarMensagemCsp\(report\)/);
  assert.match(server, /alvo: '\/api\/csp-report'/);
});
