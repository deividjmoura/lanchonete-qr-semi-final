#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  timeout: 120_000,
  maxBuffer: 10 * 1024 * 1024,
});

if (result.error) {
  console.error('Falha ao executar npm audit:', result.error.message);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(result.stdout || '');
} catch {
  console.error('npm audit não retornou JSON válido.');
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(2);
}

if (!report || !report.metadata || !report.metadata.vulnerabilities) {
  console.error('Relatório npm audit incompleto; não é possível confirmar o estado de sharp.');
  process.exit(2);
}

const sharp = report.vulnerabilities && report.vulnerabilities.sharp;
if (sharp) {
  console.error(
    `npm audit ainda reporta sharp: severity=${sharp.severity}, range=${sharp.range}, fixAvailable=${JSON.stringify(sharp.fixAvailable)}`
  );
  process.exit(1);
}

const counts = report.metadata.vulnerabilities;
console.log(
  `npm audit --omit=dev: nenhum advisory reportado para sharp; total de advisories em dependências de produção: ${counts.total} (critical=${counts.critical}, high=${counts.high}, moderate=${counts.moderate}, low=${counts.low}).`
);
if (result.status !== 0 && counts.total === 0) {
  console.error('npm audit terminou com status não-zero sem vulnerabilidades listadas.');
  process.exit(2);
}
