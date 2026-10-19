const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const root=path.join(__dirname,'../public/garcom-pwa');const js=fs.readFileSync(path.join(root,'app.js'),'utf8');
test('PWA tem JS valido',()=>cp.execFileSync(process.execPath,['--check',path.join(root,'app.js')]));
test('Busca evita lista extensa sem consulta',()=>{assert.match(js,/q\.length>=2/);assert.match(js,/\.slice\(0,12\)/)});
test('Status sao por item e distinguem entregue de pronto',()=>{assert.match(js,/state-.*item\.status/);assert.match(js,/Pronto para entregar/);assert.match(js,/Entregue/)});
test('Notificacoes so sao emitidas para itens concluidos',()=>{assert.match(js,/i\.status==='concluido'/);assert.match(js,/!firstLiveLoad&&newReady\.length&&readyAlertsEnabled/);assert.match(js,/READY_STORAGE/);assert.doesNotMatch(js,/SpeechSynthesisUtterance\('Avisos ativados'\)/)});
