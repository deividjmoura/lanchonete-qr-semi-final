const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public/garcom-pwa/app.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const backend=fs.readFileSync(path.join(root,'db/atendimento.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'public/garcom-pwa/sw.js'),'utf8');

test('PWA e backend têm rota explícita para iniciar mesa vazia',()=>{
 assert.match(backend,/async function iniciarAtendimentoGarcom/);
 assert.ok(server.includes('mesas\\/(\\d+)\\/iniciar'));
 assert.match(app,/base\+'\/iniciar'/);
 assert.match(backend,/INSERT INTO mesa_sessoes \(mesa_id, cliente_nome, garcom_responsavel_id\)/);
});
test('início de mesa preserva exclusividade e não substitui responsável existente',()=>{
 assert.match(backend,/FOR UPDATE/);
 assert.match(backend,/Mesa já está sob responsabilidade de outro garçom/);
 assert.match(backend,/mesa_atendimento_historico/);
 assert.match(backend,/mesa_iniciada/);
});
test('falha ao listar garçons não bloqueia o carregamento das mesas',()=>{
 const start=app.indexOf('async function loadMesas()');
 const end=app.indexOf('function extrairProdutosCardapio',start);
 const block=app.slice(start,end);
 assert.match(block,/try\{await loadActiveWaiters\(\);\}/);
 assert.match(block,/catch\(e\)\{activeWaiters=\[\]/);
 assert.ok(block.indexOf('populateTables()')>block.indexOf('catch(e)'));
});
test('sincronização inicia sessão quando mesa está vazia e mantém chave idempotente',()=>{
 const start=app.indexOf('async function syncOne(');
 const end=app.indexOf('async function syncPending',start);
 const block=app.slice(start,end);
 assert.match(block,/root\+'\/iniciar'/);
 assert.match(block,/idempotencyKey:order\.idempotencyKey/);
 assert.match(block,/await loadMesas\(\)/);
 assert.match(block,/status='conflict'/);
});
test('Service Worker não reaproveita shell anterior às correções',()=>{
 assert.match(sw,/garcom-pwa-shell-v15/);
 assert.match(sw,/pathname\.startsWith\('\/api\/'\)/);
});
