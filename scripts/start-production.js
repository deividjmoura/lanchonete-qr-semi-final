#!/usr/bin/env node
/**
 * Startup seguro para produção.
 * O servidor só é carregado depois que todas as migrations obrigatórias passam.
 */
require('dotenv').config();

const { spawnSync } = require('child_process');
const path = require('path');

const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'db', 'migrate.js')], {
  encoding: 'utf8',
  timeout: 30_000,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('❌ Falha ao executar migrations:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`❌ Migrations falharam (exit ${result.status}). Servidor não será iniciado.`);
  process.exit(result.status || 1);
}

console.log('✅ Migrations verificadas. Iniciando servidor de produção...');
require('../server.js');
