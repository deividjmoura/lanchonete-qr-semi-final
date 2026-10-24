'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runProductionStartup, MIGRATION_TIMEOUT_MS } = require('../scripts/start-production');
function run(result) {
  const events = [];
  const logger = { log: m => events.push(['log',m]), error: m => events.push(['error',m]) };
  const started = runProductionStartup({ spawn: (...args) => { events.push(['spawn',args]); return result; }, startServer: () => events.push(['server']), env: {}, logger });
  return { events, started };
}
test('starts server only after successful migrations', () => {
  const {events,started}=run({status:0,error:null});
  assert.equal(started,true);
  assert.equal(events.filter(([t])=>t==='server').length,1);
  assert.equal(events.find(([t])=>t==='spawn')[1][2].timeout,MIGRATION_TIMEOUT_MS);
});
test('does not start server when migrations exit non-zero', () => {
  const {events,started}=run({status:1,error:null});
  assert.equal(started,false); assert.equal(events.some(([t])=>t==='server'),false);
});
test('does not start server when migration process cannot start', () => {
  const {events,started}=run({status:null,error:Object.assign(new Error('spawn failed'),{code:'ENOENT'})});
  assert.equal(started,false); assert.equal(events.some(([t])=>t==='server'),false);
});
test('does not start server when migrations time out', () => {
  const {events,started}=run({status:null,error:Object.assign(new Error('timed out'),{code:'ETIMEDOUT'})});
  assert.equal(started,false); assert.equal(events.some(([t])=>t==='server'),false);
  assert.match(events.find(([t])=>t==='error')[1],/tempo limite excedido/);
});
