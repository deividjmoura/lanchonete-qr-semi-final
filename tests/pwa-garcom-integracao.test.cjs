const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const root=path.join(__dirname,'..','public','garcom-pwa');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
test('PWA JavaScript e Service Worker têm sintaxe válida',()=>{
 cp.execFileSync(process.execPath,['--check',path.join(root,'app.js')]);
 cp.execFileSync(process.execPath,['--check',path.join(root,'sw.js')]);
});
test('PWA acessa rotas reais, não endpoint genérico de demonstração',()=>{
 assert.match(app,/\/api\/cardapio/);
 assert.match(app,/\/api\/garcom\//);
 assert.match(app,/\/pedidos/);
 assert.doesNotMatch(app,/fetch\('\/api\/orders'/);
 assert.match(app,/mock=false/);
});
test('Fila de sincronização preserva uma chave por operação e isola garçom',()=>{
 assert.match(app,/idempotencyKey:uid\(\)/);
 assert.match(app,/order\.idempotencyKey/);
 assert.match(app,/ownerToken:waiterToken/);
 assert.match(app,/o\.ownerToken===waiterToken/);
 assert.match(app,/err\.status&&err\.status<500\?'conflict'/);
});
test('QR usa token da mesa e não o número no endereço do cliente',()=>{
 assert.match(app,/mesa\.token/);
 assert.match(app,/#\/mesa\//);
 assert.doesNotMatch(app,/new URL\('\/mesa\/'\+n/);
});
test('Manifesto instalável com icones PNG e Service Worker sem cache de API',()=>{
 assert.equal(manifest.display,'standalone');
 for(const size of [192,512]){
  const icon=manifest.icons.find(i=>i.sizes===size+'x'+size && i.type==='image/png');
  assert.ok(icon,'icon '+size);
  assert.ok(fs.existsSync(path.join(root,icon.src)));
 }
 assert.match(sw,/pathname\.startsWith\('\/api\/'\)/);
});
