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
 const start=app.indexOf('async function sendOrderToServer(');
 const end=app.indexOf('async function syncOne(',start);
 const block=app.slice(start,end);
 assert.match(block,/root\+'\/iniciar'/);
 assert.match(block,/idempotencyKey:order\.idempotencyKey/);
 assert.match(block,/await loadMesas\(\)/);
 const offline=fs.readFileSync(path.join(root,'public/garcom-pwa/offline.js'),'utf8');
 assert.match(offline,/order\.status = kind === 'conflict' \? 'conflict'/);
});
test('salvar pedido evita duplo clique e falha de armazenamento sem confirmação falsa',()=>{
 const start=app.indexOf('async function saveOrder()');
 const end=app.indexOf('async function syncOne(',start);
 const save=app.slice(start,end);
 assert.match(save,/if\(savingOrder\)return/);
 assert.match(save,/if\(!offlineStore\)/);
 assert.match(save,/finally\{savingOrder=false;saveButton\.disabled=false;\}/);
 assert.match(save,/idempotencyKey:uid\(\)/);
});
test('carregamento de mesas não depende de IndexedDB nem da recuperação da fila',()=>{
 const boot=app.slice(app.indexOf('async function boot()'),app.indexOf('void boot();'));
 assert.match(boot,/await openOfflineDb\(\)/);
 assert.match(boot,/await syncEngine\.recoverInterrupted\(\)/);
 assert.match(boot,/syncEngine\.start\(15000\)/);
 assert.match(boot,/Promise\.allSettled\(\[loadProducts\(\),loadMesas\(\)\]\)/);
 assert.match(app,/probe:\(\)=>probeBackend/);
});
test('401 do link de garçom permanece visível no estado de conexão',()=>{
 assert.match(app,/let waiterAuthInvalid=false/);
 assert.match(app,/waiterAuthInvalid=true;setConnection\('auth'\)/);
 assert.match(app,/waiterAuthInvalid\|\|syncEngine\?\.connection==='offline'/);
});
test('fila de pedidos não quebra quando o contador visual não existe',()=>{
 assert.match(app,/const queueCount=\$\('#queueCount'\);if\(queueCount\)queueCount\.textContent/);
});
test('pedidos diretos prontos ficam visíveis para todos e são assumidos uma única vez',()=>{
 const pedidos=fs.readFileSync(path.join(root,'db/pedidos.js'),'utf8');
 const garcons=fs.readFileSync(path.join(root,'db/garcons.js'),'utf8');
 assert.match(pedidos,/ip\.status IN \('concluido','aceito','retirado'\)/);
 assert.match(garcons,/assumirEntregaComoGarcom: \(\.\.\.args\) => require\('\.\/entregas'\)\.assumirEntregaComoGarcom/);
 const entregas=fs.readFileSync(path.join(root,'db/entregas.js'),'utf8');
 assert.match(entregas,/Outro garçom já assumiu estes itens/);
 assert.match(server,/assumir-entrega/);
 assert.match(app,/Retirar item/);
 assert.doesNotMatch(app,/Aceitar item/);
 assert.match(app,/Confirmar entrega/);
});
test('Service Worker não reaproveita shell anterior às correções',()=>{
 // Piso de versão, não valor exato: cada correção do shell precisa subir o
 // cache, e travar o número quebraria o teste a cada bump legítimo.
 const versao=sw.match(/garcom-pwa-shell-v(\d+)/);
 assert.ok(versao,'cache do shell precisa ser versionado');
 assert.ok(Number(versao[1])>=18,'shell antigo ao fluxo por item não pode ser reutilizado');
 assert.match(sw,/pathname\.startsWith\('\/api\/'\)/);
});
