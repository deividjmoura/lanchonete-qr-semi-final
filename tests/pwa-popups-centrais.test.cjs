const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.join(__dirname, '..', 'public', 'garcom-pwa');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
// Normaliza apenas a formatação, preservando as verificações de layout.
const css = fs.readFileSync(path.join(root,'styles.css'),'utf8').replace(/\s*([{}:;,])\s*/g, '$1');
const js = fs.readFileSync(path.join(root,'app.js'),'utf8');

test('modais de pedido, acompanhamento e QR usam popup nativo',()=>{
 for (const id of ['orderModal','ordersModal','qrModal']) {
   assert.match(html,new RegExp('<dialog id="'+id+'" class="sheet(?: small-sheet)?"'));
   assert.match(html,new RegExp('id="close'+(id==='orderModal'?'Order':id==='ordersModal'?'OrdersModal':'Qr')+'"'));
 }
});
test('popups sao centrados e limitados, inclusive sem CSS externo',()=>{
 assert.match(html,/dialog\.sheet\[open\]\{position:fixed!important;inset:0!important;margin:auto!important/);
 assert.match(html,/width:min\(calc\(100vw - 32px\),520px\)!important/);
 assert.match(html,/max-height:min\(82dvh,690px\)!important/);
 assert.match(css,/dialog\.sheet\[open\]\{position:fixed;inset:0;margin:auto/);
 assert.doesNotMatch(css,/\.sheet\{margin:0;max-height:100dvh;height:100dvh;width:100%;border-radius:0\}/);
 assert.doesNotMatch(html,/\.sheet\{width:100%;height:100dvh;max-height:100dvh;border-radius:0\}/);
});
test('corpo rola internamente e botoes seguem acessiveis',()=>{
 assert.match(html,/\.sheet-body\{padding:17px;min-height:0;max-height:none!important;overflow-y:auto/);
 assert.match(css,/\.sheet-body\{padding:18px 20px;min-height:0;flex:1 1 auto;max-height:none;overflow-y:auto/);
});
test('abertura do modal nao abre teclado sozinha',()=>{
 assert.doesNotMatch(js,/\$\('#orderModal'\)\.showModal\(\);\$\('#modalCustomer'\)\.focus\(\)/);
 assert.match(html,/id="closeOrder"[^>]*autofocus/);
});
test('codigo do PWA tem sintaxe valida',()=>{
 cp.execFileSync(process.execPath,['--check',path.join(root,'app.js')]);
 cp.execFileSync(process.execPath,['--check',path.join(root,'sw.js')]);
});
