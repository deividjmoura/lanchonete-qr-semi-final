#!/usr/bin/env node
'use strict';

// Read-only HTTP smoke test. It must target only an explicitly supplied URL;
// never create orders, payments, sessions, or other application data.
const target = process.env.HEALTHCHECK_URL || process.argv[2];

if (!target) {
  console.error('Uso: HEALTHCHECK_URL=https://seu-host/healthz npm run health:smoke');
  process.exit(2);
}

(async () => {
  let url;
  try {
    url = new URL(target);
  } catch {
    throw new Error('HEALTHCHECK_URL precisa ser uma URL absoluta válida');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('HEALTHCHECK_URL deve usar HTTP(S) e não conter credenciais');
  }
  if (!url.pathname.endsWith('/healthz')) {
    throw new Error('O smoke test aceita somente uma URL terminada em /healthz');
  }

  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
    headers: { accept: 'application/json' },
  });
  if (response.status !== 200) {
    throw new Error(`Esperado HTTP 200; recebido HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Resposta não é application/json');
  }
  const payload = await response.json();
  if (!payload || payload.status !== 'ok') {
    throw new Error('Payload de saúde inesperado');
  }
  console.log('Health smoke OK (GET /healthz; somente leitura).');
})().catch((error) => {
  console.error(`Health smoke falhou: ${error.message}`);
  process.exitCode = 1;
});
