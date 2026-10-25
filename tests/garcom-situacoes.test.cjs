const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Qualquer garçom ativo pode criar pedido na sessão aberta sem transferir a mesa',()=>{
 const api=read('db/atendimento.js'),ped=read('db/pedidos.js');
 assert.match(api,/permitirResponsavelDiferente:true/);
 assert.match(api,/sessaoIdEsperada/);
 assert.match(ped,/!atendimento\.permitirResponsavelDiferente/);
 assert.match(ped,/Number\(atendimento\.sessaoIdEsperada\)/);
});
test('Ao tocar numa mesa a PWA oferece novo pedido ou acréscimo sem assumir mesa alheia',()=>{
 const pwa=read('public/garcom-pwa/app.js'),html=read('public/garcom-pwa/index.html'),server=read('server.js');
 assert.match(pwa,/openTableActions\(m\.numero\)/);
 assert.match(html,/Novo pedido/);
 assert.match(html,/Acrescentar itens ao pedido atual/);
 assert.match(pwa,/pedidos-ativos/);
 assert.match(server,/listarPedidosAtivosMesaGarcom/);
 assert.match(pwa,/if\(!tableInfo\?\.sessaoId\|\|!tableInfo\.garcomResponsavelId\)/);
});
test('PWA tem JavaScript valido apos edicao de pedidos e notificacoes',()=>{cp.execFileSync(process.execPath,['--check',path.join(root,'public/garcom-pwa/app.js')]);});
test('Garcom consulta status de todas as suas mesas, nao apenas entregas',()=>{
 const api=read('db/atendimento.js');const pwa=read('public/garcom-pwa/app.js');
 assert.match(api,/s\.garcom_responsavel_id=\$1/);assert.match(api,/s\.status='aberta'/);
 assert.match(pwa,/\/atendimentos/);assert.match(pwa,/renderMyTables/);
});
test('Edicao valida pertencimento e so pode ocorrer antes do preparo',()=>{
 const api=read('db/atendimento.js'),ped=read('db/pedidos.js');
 assert.match(api,/editarPedidoGarcom/);assert.match(api,/garcom\.id\)/);
 assert.match(ped,/garcomResponsavelId/);assert.match(ped,/status !== 'recebido'/);
});
test('Pedidos offline preservam idempotencyKey quando editados',()=>{
 const pwa=read('public/garcom-pwa/app.js');
 assert.match(pwa,/editingDraftId/);assert.match(pwa,/await putOrder\(o\)/);
 assert.match(pwa,/o\.status!=='offline'/);
});
test('Avisos iniciais da cozinha e bar nao reproduzem fila antiga',()=>{
 const src=read('src/store/usePub.ts'),shell=read('src/components/OpsShell.tsx');
 assert.match(src,/anuncioBarPronto/);assert.match(src,/cozinhaIdsVistos/);
 assert.match(shell,/visto\.current === null/);
});
test('Bar recebe agua e notificacao aparece no PWA',()=>{
 const mig=read('db/migrations/0020_bebidas_setor_bar.sql');
 assert.match(mig,/UPDATE produtos SET setor='bar'/);
 assert.match(mig,/água\|agua/);
 assert.match(read('public/garcom-pwa/index.html'),/id="readyToast"/);
});
