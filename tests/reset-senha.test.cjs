'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const scriptPath = path.join(__dirname,'..','scripts','reset-senha.js');
const source = fs.readFileSync(scriptPath,'utf8');
test('script não imprime senha nem constrói comando curl com segredo', () => {
  assert.doesNotMatch(source,/console\.log\([^\n]*senha/i);
  assert.doesNotMatch(source,/curl[^\n]*senha/i);
  assert.doesNotMatch(source,/troque-esta-senha/);
});
test('sem senha explícita, falha antes de alterar contas', () => {
  const r=spawnSync(process.execPath,[scriptPath],{encoding:'utf8',env:{...process.env,STAFF_SEED_PASSWORD:'',ADMIN_PASSWORD:''},timeout:5000});
  assert.equal(r.status,1); assert.match(r.stderr,/Defina STAFF_SEED_PASSWORD/);
  assert.doesNotMatch(r.stdout+r.stderr,/troque-esta-senha/);
});
