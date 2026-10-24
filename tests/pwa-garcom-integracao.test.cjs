const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const root=path.join(__dirname,'..','public','garcom-pwa');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const qrGenerator=require(path.join(root,'qrcode-generator.js'));
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
test('PWA JavaScript e Service Worker têm sintaxe válida',()=>{
 cp.execFileSync(process.execPath,['--check',path.join(root,'app.js')]);
 cp.execFileSync(process.execPath,['--check',path.join(root,'sw.js')]);
 cp.execFileSync(process.execPath,['--check',path.join(root,'qrcode-generator.js')]);
});
test('Rotas de assumir mesa e criar pedido aceitam números reais de mesa',()=>{
 assert.ok(server.includes('mesas\\/(\\d+)\\/assumir'),'rota assumir usa \\d+, não barra invertida literal');
 assert.ok(server.includes('mesas\\/(\\d+)\\/pedidos'),'rota pedidos usa \\d+, não barra invertida literal');
 assert.equal(server.includes('mesas\\/(\\\\d+)\\/assumir'),false,'não usar \\\\d na regex da rota assumir');
 assert.equal(server.includes('mesas\\/(\\\\d+)\\/pedidos'),false,'não usar \\\\d na regex da rota pedidos');
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
test('QR da mesa é gerado localmente e nunca envia o token a um serviço externo',()=>{\n assert.doesNotMatch(app,/api\\.qrserver\\.com/);\n assert.match(app,/qrcode\\(0,'M'\\)/);\n assert.match(html,/qrcode-generator\\.js/);\n assert.match(sw,/qrcode-generator\\.js/);\n const qr=qrGenerator(0,'M');\n qr.addData('https://example.test/#/mesa/token-de-teste');\n qr.make();\n assert.ok(qr.getModuleCount()>0);\n assert.match(qr.createSvgTag({cellSize:4,margin:2,scalable:true}),/<svg/);\n});\ntest('QR usa token da mesa e não o número no endereço do cliente',()=>{
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
