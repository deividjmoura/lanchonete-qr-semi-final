const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'../public/garcom-pwa');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const js=fs.readFileSync(path.join(root,'app.js'),'utf8');
test('PWA mantém quatro áreas operacionais sem aba Início redundante',()=>{for(const tab of ['tables','orders','deliveries','billing']){assert.match(html,new RegExp('data-page="'+tab+'"'));assert.match(html,new RegExp('data-tab="'+tab+'"'))}assert.doesNotMatch(html,/data-tab="home"|data-page="home"/);});
test('Novo pedido abre modal e mantém campos usados pela lógica offline',()=>{for(const id of ['orderModal','modalTable','modalCustomer','search','products','cart','orderNote','saveOrder','total'])assert.match(html,new RegExp('id="'+id+'"'));assert.match(js,/showModal\(\)/);assert.match(js,/\$\('#modalTable'\)/);assert.match(js,/\$\('#modalCustomer'\)/);});
test('QR da mesa e PIX de cobrança geram QR local com confirmação manual',()=>{assert.match(html,/id="qrModal"/);assert.match(js,/function openQr\(/);assert.match(html,/id="page-billing"/);assert.match(html,/id="billingSession"/);assert.match(html,/id="billingAmount"/);assert.match(html,/id="billingMethod"/);assert.match(html,/id="billingReceivedConfirm"/);assert.match(html,/id="pixQrPanel"/);assert.match(html,/id="pixQrImage"/);assert.match(html,/id="pixCopyPaste"/);assert.match(html,/O QR apenas inicia o pagamento/);assert.match(js,/LQRPix/);assert.match(js,/Confirmei o crédito PIX no aplicativo bancário/);assert.match(js,/resumo-pagamento/);assert.match(js,/idempotencyKey:pendingWaiterPayment/);});
test('Nenhum controle de pagamento ativo em interface de garçom',()=>{assert.doesNotMatch(js,/registrarPagamento|api\/caixa\/sessoes\/.*\/pagamentos/);});

test('CSS crítico impede exibir todas as abas e quebra dos atalhos',()=>{assert.match(html,/id="critical-pwa-layout"/);assert.match(html,/\.page\{display:none!important\}/);assert.match(html,/\.page\.active\{display:block!important\}/);assert.match(html,/\.quick-grid\{display:grid!important/);assert.doesNotMatch(html,/class="hero-mascot"/)});
test('Service worker não responde HTML a requisições de CSS e usa network-first',()=>{const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');assert.match(sw,/fetch\(req\)\.then/);assert.match(sw,/req\.mode==='navigate'/);assert.match(sw,/Response\.error\(\)/)});

test('Consentimento explica requisitos e só solicita permissão por ação explícita',()=>{
 assert.match(html,/id="notificationConsent"/);
 assert.match(html,/instalado quando a plataforma exigir/);
 assert.match(html,/servidor ainda não tem subscrição Web Push/);
 assert.match(js,/requestNotificationPermission/);
 assert.match(js,/addEventListener\('click',async\(\)=>\{/);
 assert.match(js,/Notification\.requestPermission\(\)/);
 assert.match(js,/garcom-notification-intro-v1-/);
 assert.match(js,/Você recusou as notificações e não receberá avisos/);
 assert.match(js,/garcom-notifications-declined-/);
});
test('Instalação contextual preserva instruções manuais e detecta PWA instalado',()=>{
 assert.doesNotMatch(html,/id="installBtn"/);
 assert.match(html,/id="installAppBtn"/);
 assert.match(js,/beforeinstallprompt/);
 assert.match(js,/Adicionar à Tela de Início/);
 assert.match(js,/display-mode: standalone/);
 assert.match(js,/appinstalled/);
});

test('Ações de mesa ficam no modal e respeitam origem do pedido e responsável atual',()=>{
 assert.match(html,/id="tableDetailsModal"/);
 assert.doesNotMatch(html,/Escolha uma mesa<select id="tableSelect"/);
 assert.match(js,/pedidoClienteQr/);
 assert.match(js,/if\(!m\.garcomResponsavelId&&m\.pedidoClienteQr\)/);
 assert.match(js,/Number\(m\.garcomResponsavelId\)===Number\(currentWaiterId\)/);
 assert.match(js,/function openTableDetails\(/);
 assert.match(js,/if\(m\.token\)/);
 assert.match(js,/QR só pode ser exibido pelo garçom responsável atual/);
 assert.match(js,/Acrescentar itens ao pedido atual/);
 assert.match(js,/pedidoPaiId:order\.parentOrderId\|\|undefined/);
 assert.match(js,/pedidos-ativos/);
 assert.match(js,/async function transferTable\(/);
});
