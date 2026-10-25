const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'../public/garcom-pwa');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const js=fs.readFileSync(path.join(root,'app.js'),'utf8');
test('PWA mantém quatro áreas operacionais sem aba Início redundante',()=>{for(const tab of ['tables','orders','deliveries','billing']){assert.match(html,new RegExp('data-page="'+tab+'"'));assert.match(html,new RegExp('data-tab="'+tab+'"'))}assert.doesNotMatch(html,/data-tab="home"|data-page="home"/);});
test('Novo pedido abre modal e mantém campos usados pela lógica offline',()=>{for(const id of ['orderModal','modalTable','modalCustomer','search','products','cart','orderNote','saveOrder','total'])assert.match(html,new RegExp('id="'+id+'"'));assert.match(js,/showModal\(\)/);assert.match(js,/\$\('#modalTable'\)/);assert.match(js,/\$\('#modalCustomer'\)/);});
test('QR exibido sob demanda e cobrança em aba separada',()=>{assert.match(html,/id="qrModal"/);assert.match(js,/function openQr\(/);assert.match(html,/id="page-billing"/);assert.match(html,/Cobrança pelo garçom — em breve/);});
test('Nenhum controle de pagamento ativo em interface de garçom',()=>{assert.doesNotMatch(js,/registrarPagamento|api\/caixa\/sessoes\/.*\/pagamentos/);});

test('CSS crítico impede exibir todas as abas e quebra dos atalhos',()=>{assert.match(html,/id="critical-pwa-layout"/);assert.match(html,/\.page\{display:none!important\}/);assert.match(html,/\.page\.active\{display:block!important\}/);assert.match(html,/\.quick-grid\{display:grid!important/);assert.doesNotMatch(html,/class="hero-mascot"/)});
test('Service worker não responde HTML a requisições de CSS e usa network-first',()=>{const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');assert.match(sw,/fetch\(req\)\.then/);assert.match(sw,/req\.mode==='navigate'/);assert.match(sw,/Response\.error\(\)/)});
test('Tela do garçom usa o mesmo tema do QR Admin e não quebra sem o contador',()=>{
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert.match(html,/qradmin-tema/);
  assert.match(html,/id="themeToggle"/);
  assert.match(html,/id="queueCount"/);
  assert.match(html,/qradmin-horizontal\.png/);
  assert.match(js,/if\(qc\)qc\.textContent/);
  assert.match(js,/localStorage\.setItem\('qradmin-tema'/);
  assert.doesNotMatch(html,/theme-color" content="#3157a4"/);
  assert.match(css,/--coral:#00b3a5/);
  assert.match(css,/data-theme="escuro"/);
});

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
