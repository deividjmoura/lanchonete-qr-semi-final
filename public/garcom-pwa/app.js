import { openOfflineDb, OfflineStore, SyncEngine, probeBackend, uid } from './offline.js';

const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
let products=[],cart=new Map(),mesas=[],activeWaiters=[],currentWaiterId=null,liveOrders=[];
const tables=[];
let waiterToken=new URLSearchParams(location.search).get('token')||localStorage.getItem('waiter-token')||'';
let waiterAuthInvalid=false,offlineStore=null,syncEngine=null,realtimeOff=null;
let editingDraftId=null,editingServerId=null,pendingParentOrderId=null,selectedOrdersTable=null;
let firstLiveLoad=true,savingOrder=false,deferredInstall=null;
const READY_STORAGE='garcom-ready-announced-'+waiterToken;
let announcedReady=new Set();
try{announcedReady=new Set(JSON.parse(localStorage.getItem(READY_STORAGE)||'[]'))}catch{}
let readyAlertsEnabled=localStorage.getItem('garcom-ready-alerts-'+waiterToken)==='1';
const pendingPaymentStorageKey='garcom-pending-payment-'+waiterToken;
let pendingWaiterPayment=null;
try{pendingWaiterPayment=JSON.parse(localStorage.getItem(pendingPaymentStorageKey)||'null')}catch{}
if(waiterToken)localStorage.setItem('waiter-token',waiterToken);

async function allOrders(){if(!offlineStore)throw new Error('Armazenamento local indisponível');return offlineStore.all();}
async function putOrder(order){if(!offlineStore)throw new Error('Armazenamento local indisponível');return offlineStore.put(order);}
function statusText(s){return ({offline:'AGUARDANDO SINCRONIZAÇÃO',sync:'SINCRONIZANDO',confirmed:'SINCRONIZADO',conflict:'CONFLITO — REVISAR',error:'ERRO DE SINCRONIZAÇÃO'})[s]||s;}
function populateTables(){for(const sel of [$('#tableSelect'),$('#qrTable'),$('#modalTable')]){if(!sel)continue;const old=sel.value;sel.replaceChildren();tables.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent='Mesa '+n;sel.append(o)});if(tables.includes(Number(old)))sel.value=old;}}
async function getJson(url,opts={}){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),opts.timeoutMs||12000);
 let res;
 try{res=await fetch(url,{cache:'no-store',...opts,signal:opts.signal||controller.signal});}
 finally{clearTimeout(timer);}
 const data=await res.json().catch(()=>({}));
 if(!res.ok){const err=new Error(data.error||'HTTP '+res.status);err.status=res.status;err.code=data.code;if(res.status===401&&url.includes('/api/garcom/')){waiterAuthInvalid=true;setConnection('auth');}throw err;}
 return data;
}
async function loadActiveWaiters(){
 const data=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/garcons-ativos');
 activeWaiters=Array.isArray(data.garcons)?data.garcons:[];
}
async function loadMesas(){
 if(!waiterToken)throw Error('Abra o link individual do garçom fornecido pelo administrador');
 const data=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/mesas');
 mesas=Array.isArray(data.mesas)?data.mesas:[];
 if(offlineStore)await offlineStore.setMeta('mesas',{garcom:data.garcom,mesas});
 tables.splice(0,tables.length,...mesas.map(x=>Number(x.numero)));
 currentWaiterId=Number(data.garcom.id);
 // A lista de garçons é auxiliar (transferência). Sua falha não pode impedir
 // que o garçom veja as mesas nem que registre pedidos.
 try{await loadActiveWaiters();}
 catch(e){activeWaiters=[];$('#tableMessage').textContent='Mesas carregadas. A lista de garçons está temporariamente indisponível para transferências.';}
 populateTables();updateQr();renderTableGrid();
 $('#identity').textContent='Garçom: '+data.garcom.nome;
 renderMyTables();
 renderBillingSessions();
}
function extrairProdutosCardapio(data){
 const categorias=Array.isArray(data)?data:Array.isArray(data?.categorias)?data.categorias:Array.isArray(data?.data)?data.data:Array.isArray(data?.itens)?data.itens:[];
 const saida=[];
 for(const cat of categorias){
  const itens=Array.isArray(cat?.produtos)?cat.produtos:Array.isArray(cat?.items)?cat.items:[];
  for(const p of itens){
   if(!p||p.id==null)continue;
   saida.push({...p,name:p.nome||p.name||'',price:Number(p.preco??p.price??0),description:p.descricao||p.description||'',categoria:cat.nome||cat.name||p.categoria||p.category||''});
  }
 }
 // Compatibilidade com respostas que já entregam a lista plana.
 if(!saida.length&&Array.isArray(data))for(const p of data){if(p&&p.id!=null&&(p.nome||p.name))saida.push({...p,name:p.nome||p.name,price:Number(p.preco??p.price??0),description:p.descricao||p.description||''});}
 return saida;
}
async function loadProducts(){
 let erro=null;
 try{
  const data=await getJson('/api/cardapio');
  products=extrairProdutosCardapio(data);
  if(products.length&&offlineStore)await offlineStore.setMeta('cardapio',products);
  else erro='O cardápio foi recebido, mas nenhum produto disponível foi encontrado.';
 }catch(e){
  erro=e.message||'Não foi possível carregar o cardápio.';
  try{const cached=offlineStore?await offlineStore.getMeta('cardapio'):null;products=Array.isArray(cached)?cached:[]}catch{products=[]}
 }
 renderProducts();
 if(!products.length){
  $('#products').innerHTML='<p class="empty">'+(erro||'Nenhum produto disponível no cardápio.')+'</p>';
  $('#connection').textContent='Cardápio indisponível';
  console.error('[garcom-pwa] Falha ao carregar produtos:',erro);
 }
 return products.length;
}
function normalizarBusca(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim()}
function renderProducts(){
 const q=normalizarBusca($('#search').value);
 const root=$('#products');root.replaceChildren();
 const filtrados=products.filter(p=>{
  if(!q)return true;
  const texto=normalizarBusca([p.name||p.nome,p.description||p.descricao,p.categoria||p.categoriaNome].filter(Boolean).join(' '));
  return texto.includes(q);
 }).slice(0,20);
 filtrados.forEach(p=>{
  const name=p.name||p.nome;
  const price=Number(p.price??p.preco??0);
  const card=document.createElement('article');card.className='product';
  card.innerHTML='<h3></h3><p></p><div class="product-foot"><span class="price"></span><button type="button">Adicionar</button></div>';
  card.querySelector('h3').textContent=name;
  card.querySelector('p').textContent=p.description||p.descricao||p.categoria||'Produto do cardápio';
  card.querySelector('.price').textContent=money(price);
  card.querySelector('button').onclick=()=>{
   const old=cart.get(String(p.id));
   cart.set(String(p.id),{product:p,qty:(old?.qty||0)+1,additions:old?.additions||[],removals:old?.removals||[],note:old?.note||''});
   renderCart();
  };
  root.append(card);
 });
 if(!root.children.length)root.innerHTML=!q?'<p class="muted">Digite o nome ou a categoria para buscar produtos.</p>':'<p class="empty">Nenhum produto encontrado. Tente outro nome.</p>';
}
function renderCart(){const root=$('#cart');root.replaceChildren();let total=0;if(!cart.size)root.innerHTML='<p class="muted">Adicione produtos ao pedido.</p>';for(const [id,item] of cart){const p=item.product;const name=p.name||p.nome;const price=Number(p.price??p.preco??0);const adicionaisPreco=(item.additions||[]).reduce((sum,sel)=>sum+Number((p.adicionais||[]).find(a=>Number(a.id)===Number(sel.id||sel))?.preco||0),0);const precoComAdicionais=price+adicionaisPreco;total+=precoComAdicionais*item.qty;const row=document.createElement('div');row.className='cart-item';row.innerHTML='<div class="cart-row"><strong class="item-name"></strong><div class="qty"><button data-act="minus" aria-label="Diminuir quantidade">−</button><span></span><button data-act="plus" aria-label="Aumentar quantidade">+</button></div><strong class="line-price"></strong></div><div class="cart-details"><label>Adicionais<input data-field="additions" placeholder="Ex.: bacon, queijo extra"></label><label>Remover ingredientes<input data-field="removals" placeholder="Ex.: sem cebola"></label><label>Observação do item<input data-field="note" placeholder="Ponto da carne, etc."></label></div>';row.querySelector('.item-name').textContent=name;row.querySelector('.qty span').textContent=item.qty;row.querySelector('.line-price').textContent=money(precoComAdicionais*item.qty);row.querySelector('[data-act="minus"]').onclick=()=>{if(item.qty<=1)cart.delete(id);else item.qty--;renderCart()};row.querySelector('[data-act="plus"]').onclick=()=>{item.qty=Math.min(99,item.qty+1);renderCart()};const opts=p.adicionais||[];
const addInput=row.querySelector('[data-field="additions"]');
const addWrap=document.createElement('div');addWrap.className='addon-options';
if(opts.length){const caption=document.createElement('span');caption.textContent='Adicionais (opcionais)';addWrap.append(caption);for(const a of opts){const label=document.createElement('label');label.className='addon-choice';const cb=document.createElement('input');cb.type='checkbox';cb.checked=(item.additions||[]).some(x=>Number(x.id||x)===Number(a.id));cb.onchange=()=>{const selected=new Set((item.additions||[]).map(x=>Number(x.id||x)));if(cb.checked)selected.add(Number(a.id));else selected.delete(Number(a.id));item.additions=[...selected].map(id=>({id}));renderCart();};const title=document.createElement('span');title.textContent=a.nome+' · '+money(Number(a.preco||0));label.append(cb,title);addWrap.append(label);}}else addWrap.textContent='Sem adicionais disponíveis';
addInput.closest('label').replaceWith(addWrap);
for(const f of ['removals','note']){const input=row.querySelector('[data-field="'+f+'"]');input.value=Array.isArray(item[f])?item[f].join(', '):item[f];input.onchange=()=>{item[f]=f==='note'?input.value:input.value.split(',').map(x=>x.trim()).filter(Boolean)}}root.append(row)}$('#total').textContent=money(total)}
async function renderOrders(){
 const orders=await allOrders();const queueCount=$('#queueCount');if(queueCount)queueCount.textContent=orders.filter(o=>o.status!=='confirmed').length+' pendentes';
 const root=$('#orders');root.replaceChildren();
 if(!orders.length){root.innerHTML='<p class="muted">Nenhum pedido salvo neste aparelho.</p>';return;}
 for(const o of orders){
  const card=document.createElement('article');card.className='order';card.dataset.localId=o.localId;
  const head=document.createElement('div');head.className='order-head';const title=document.createElement('strong');title.textContent='Mesa '+o.table+' · '+o.customerName;
  const badge=document.createElement('span');badge.className='status '+o.status;badge.textContent=statusText(o.status);head.append(title,badge);
  const details=document.createElement('p');details.className='muted';details.textContent=o.items.map(i=>i.qty+'× '+i.name).join(', ')+' · '+money(o.total);
  const times=document.createElement('p');times.className='muted small-copy';times.textContent='Criado: '+new Date(o.createdAt).toLocaleString('pt-BR')+(o.confirmedAt?' · Confirmado: '+new Date(o.confirmedAt).toLocaleString('pt-BR'):' · Ainda não confirmado pelo servidor')+(o.serverOrderId?' · Pedido #'+o.serverOrderId:'');
  card.append(head,details,times);
  if(o.lastError){const error=document.createElement('p');error.className='sync-error';error.setAttribute('role','alert');error.textContent=o.lastError+(o.nextAttemptAt?' Nova tentativa automática após '+new Date(o.nextAttemptAt).toLocaleTimeString('pt-BR'):'');card.append(error);}
  if(['offline','conflict','error'].includes(o.status)){const retry=document.createElement('button');retry.className='secondary';retry.textContent=o.status==='conflict'?'Revisar conflito':'Tentar sincronizar';retry.onclick=()=>o.status==='conflict'?reviewConflict(o.localId):syncOne(o.localId,true);card.append(retry);}
  if(o.status==='offline'&&!o.attempts){const edit=document.createElement('button');edit.className='secondary';edit.textContent='Editar rascunho';edit.onclick=()=>openEditDraft(o);card.append(edit);}
  root.append(card);
 }
}
async function saveOrder(){
 if(savingOrder)return;
 savingOrder=true;const saveButton=$('#saveOrder');saveButton.disabled=true;
 try{
  if(editingDraftId){await updateDraft();return;}
  if(!waiterToken){alert('Abra o link individual do garçom antes de registrar pedidos.');return;}
  if(!offlineStore){alert('O armazenamento local não está disponível. O pedido NÃO foi salvo nem enviado.');return;}
  if(!cart.size){alert('Adicione pelo menos um produto.');return;}
  const customerName=$('#modalCustomer').value.trim();
  if(!customerName){$('#modalCustomer').focus();alert('Informe o nome do cliente.');return;}
  const table=Number($('#modalTable').value);
  if(!Number.isSafeInteger(table)||!tables.includes(table)){alert('Selecione uma mesa válida.');return;}
  const items=[...cart.values()].map(i=>({productId:Number(i.product.id),name:i.product.name||i.product.nome,qty:i.qty,unitPrice:Number(i.product.price??i.product.preco??0),additions:(i.additions||[]).map(x=>({id:Number(x.id||x)})).filter(x=>Number.isSafeInteger(x.id)),removals:i.removals||[],note:i.note||'',meatPoint:i.meatPoint||undefined}));
  if(editingServerId){
   try{
    await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/pedidos/'+editingServerId,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({items,note:$('#orderNote').value.trim()})});
    editingServerId=null;cart.clear();renderCart();$('#orderModal').close();switchTab('orders');await loadOrderStatuses();
   }catch(e){alert(e.message||'Não foi possível editar o pedido.');}
   return;
  }
  const createdAt=Date.now();
  const order={ownerToken:waiterToken,localId:uid(),idempotencyKey:uid(),table,parentOrderId:pendingParentOrderId,customerName,items,note:$('#orderNote').value.trim(),
    total:[...cart.values()].reduce((sum,it)=>sum+it.qty*(Number(it.product.preco??it.product.price??0)+(it.additions||[]).reduce((v,x)=>v+Number((it.product.adicionais||[]).find(a=>Number(a.id)===Number(x.id||x))?.preco||0),0)),0),
    status:'offline',createdAt,clientCreatedAt:new Date(createdAt).toISOString(),attempts:0,nextAttemptAt:0};
  await putOrder(order);
  cart.clear();$('#orderNote').value='';renderCart();await renderOrders();$('#orderModal').close();switchTab('orders');
  void syncEngine?.flush({localId:order.localId});
 }catch(e){alert('Não foi possível salvar o pedido neste aparelho. O pedido não foi enviado: '+(e.message||'erro de armazenamento'));}
 finally{savingOrder=false;saveButton.disabled=false;}
}

async function sendOrderToServer(order){
 const root='/api/garcom/'+encodeURIComponent(waiterToken)+'/mesas/'+order.table;
 await loadMesas();
 const mesaAtual=mesas.find(m=>Number(m.numero)===Number(order.table));
 if(!mesaAtual)throw new Error('Mesa não encontrada na lista de mesas habilitadas.');
 if(mesaAtual.sessaoId&&mesaAtual.garcomResponsavelId&&Number(mesaAtual.garcomResponsavelId)!==Number(currentWaiterId)&&!order.collaborationApproved){
  const e=new Error('Mesa assumida por '+mesaAtual.garcomResponsavelNome+'. Revise a pendência e confirme o envio como colaborador, sem transferir a responsabilidade.');e.status=409;e.code='RESPONSAVEL_EXISTENTE';throw e;
 }
 if(!mesaAtual.sessaoId||!mesaAtual.garcomResponsavelId){
  try{await getJson(root+'/iniciar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clienteNome:order.customerName})});}
  catch(err){
   if(err.status===409){await loadMesas();const e=new Error('Outro garçom assumiu a mesa durante a sincronização. O pedido local foi preservado; revise antes de enviar como colaborador.');e.status=409;e.code='RESPONSAVEL_EXISTENTE';throw e;}
   throw err;
  }
 }
 const body={clienteNome:order.customerName,items:order.items,note:order.note,idempotencyKey:order.idempotencyKey,pedidoPaiId:order.parentOrderId||undefined,clientCreatedAt:order.clientCreatedAt};
 return getJson(root+'/pedidos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}
async function syncOne(localId,force=false){return syncEngine?.flush({localId,force});}
async function syncPending(){return syncEngine?.flush();}
function setConnection(state){
 const el=$('#connection');if(!el)return;
 const effective=waiterAuthInvalid?'auth':state||syncEngine?.connection||'checking';
 const labels={online:'ONLINE · servidor acessível',offline:'OFFLINE · pedidos ficam neste aparelho',checking:'VERIFICANDO CONEXÃO…',auth:'LINK INVÁLIDO OU DESATIVADO',storage:'ERRO NO ARMAZENAMENTO LOCAL'};
 el.textContent=labels[effective]||labels.checking;
 el.style.color=effective==='online'?'#166534':effective==='offline'||effective==='checking'?'#a16207':'#b91c1c';
}
async function reviewConflict(localId){
 const order=await offlineStore.get(localId);if(!order)return;
 if(order.errorCode==='RESPONSAVEL_EXISTENTE'){
  if(!confirm((order.lastError||'Mesa com outro responsável')+'\nEnviar exatamente este pedido como colaborador?'))return;
  order.collaborationApproved=true;
 }else if(!confirm('Reenviar o pedido original sem alterar produtos ou chave? Isso não cria uma cópia se o servidor já tiver confirmado.'))return;
 order.status='offline';order.nextAttemptAt=0;await putOrder(order);await renderOrders();await syncOne(localId,true);
}
function exportPending(){
 void allOrders().then(orders=>{
  const pending=orders.filter(o=>o.status!=='confirmed');
  const safe=pending.map(({ownerToken,...rest})=>rest);
  const blob=new Blob([JSON.stringify({exportadoEm:new Date().toISOString(),pedidos:safe},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='pedidos-pendentes-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }).catch(e=>alert(e.message));
}
function updateQr(){const n=Number($('#qrTable').value);const mesa=mesas.find(x=>Number(x.numero)===n);if(!mesa?.token){$('#qrImage').textContent='QR disponível apenas para o responsável atual da mesa.';return;}const url=new URL('../',location.href).href+'#/mesa/'+mesa.token;$('#qrUrl').value=url;try{const qr=window.qrcode(0,'M');qr.addData(url);qr.make();$('#qrImage').innerHTML=qr.createSvgTag({cellSize:4,margin:2,scalable:true,title:'QR Code da mesa '+n})}catch(e){$('#qrImage').textContent='Não foi possível gerar o QR desta mesa';console.error('Falha ao gerar QR local',e)}}$('#search').addEventListener('input',renderProducts);$('#saveOrder').addEventListener('click',saveOrder);$('#syncBtn').addEventListener('click',syncPending);$('#qrTable').addEventListener('change',updateQr);
/* Ligações dos controles do shell.
 * Estes botões existiam no HTML sem nenhum handler: "＋ Novo pedido" não abria
 * o formulário e os "×" não fechavam as folhas modais, o que travava o
 * atendimento no celular. Encontrado pelo E2E em navegador real. */
/* Navegação inferior: os botões existiam sem handler, então o garçom ficava
 * preso na aba Mesas e nunca alcançava Entregas/Cobrança pelo toque. */
for (const btn of document.querySelectorAll('[data-tab]')) {
  btn.addEventListener('click',()=>switchTab(btn.dataset.tab));
}
$('#newOrderTables')?.addEventListener('click',()=>openOrder());
$('#newOrderOrders')?.addEventListener('click',()=>openOrder());
$('#refreshTables')?.addEventListener('click',async()=>{
 const btn=$('#refreshTables');btn.disabled=true;
 try{await loadMesas();$('#tableMessage').textContent='Mesas atualizadas.';}
 catch(e){$('#tableMessage').textContent=e.message||'Não foi possível atualizar as mesas.';}
 finally{btn.disabled=false;}
});
$('#closeOrder')?.addEventListener('click',()=>$('#orderModal').close());
$('#closeQr')?.addEventListener('click',()=>$('#qrModal').close());
$('#closeTableDetails')?.addEventListener('click',()=>$('#tableDetailsModal').close());
$('#modalQr')?.addEventListener('click',()=>openQr(Number($('#modalTable').value)));
// Bloco legado oculto: mantido funcional para não deixar controle morto no DOM.
$('#startAttendance')?.addEventListener('click',async()=>{
 try{await iniciarAtendimento(Number($('#tableSelect').value),$('#customerName').value.trim());$('#tableMessage').textContent='Atendimento iniciado.';}
 catch(e){$('#tableMessage').textContent=e.message||'Não foi possível iniciar o atendimento.';}
});
$('#showQr')?.addEventListener('click',()=>openQr(Number($('#tableSelect').value)));
$('#exportPending')?.addEventListener('click',exportPending);
$('#copyQr').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#qrUrl').value);$('#copyQr').textContent='Endereço copiado';setTimeout(()=>$('#copyQr').textContent='Copiar endereço',1500)}catch{$('#qrUrl').select();document.execCommand('copy')}});
window.addEventListener('online',()=>{void syncEngine?.flush();void refreshLiveData();});
window.addEventListener('offline',()=>setConnection('offline'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden){void syncEngine?.flush();void refreshLiveData();}});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('[garcom-pwa] Service Worker indisponível:',e.message));
async function refreshLiveData(){
 if(!waiterToken||!syncEngine||syncEngine.connection==='offline'||waiterAuthInvalid)return;
 await Promise.allSettled([loadMesas(),loadDeliveries(),loadOrderStatuses()]);
}
async function boot(){
 setConnection('checking');
 try{
  const db=await openOfflineDb();offlineStore=new OfflineStore(db,waiterToken);
  syncEngine=new SyncEngine({store:offlineStore,send:sendOrderToServer,probe:()=>probeBackend('/api/garcom/'+encodeURIComponent(waiterToken)+'/me'),
   onChange:(state,error)=>{setConnection(state);void renderOrders().catch(()=>{});if(error)console.error('[garcom-pwa] fila local:',error.message);}});
  await syncEngine.recoverInterrupted();await renderOrders();syncEngine.start(15000);
  if(navigator.storage?.persist)void navigator.storage.persist().catch(()=>{});
 }catch(e){console.error('[garcom-pwa] armazenamento:',e);setConnection('storage');$('#identity').textContent='Armazenamento offline indisponível: pedidos não podem ser salvos com segurança neste navegador.';}
 await Promise.allSettled([loadProducts(),loadMesas()]);
 if(!mesas.length&&offlineStore){try{const cached=await offlineStore.getMeta('mesas');if(cached?.mesas){mesas=cached.mesas;currentWaiterId=Number(cached.garcom?.id);tables.splice(0,tables.length,...mesas.map(m=>Number(m.numero)));populateTables();renderTableGrid();renderMyTables();$('#identity').textContent='Garçom: '+(cached.garcom?.nome||'')+' · dados locais';}}catch{}}
 if(waiterToken&&window.LQRRealtime){realtimeOff=window.LQRRealtime.connect(()=>{void refreshLiveData();void syncEngine?.flush();},{garcom:waiterToken,fallbackMs:20000,debounceMs:200}).close;}
}
void boot();
const installBtn=$('#installAppBtn');
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function refreshInstallState(){
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
 if(isStandalone()){installBtn.hidden=true;$('#installHelp').hidden=true;return}
 installBtn.hidden=!deferredInstall;
 $('#installHelp').hidden=!!deferredInstall;
 if(!deferredInstall){
   $('#installHelp').hidden=false;
   $('#installHelp').textContent=ios?'Para instalar no iPhone/iPad: abra esta página no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.':'Este navegador não ofereceu instalação automática. Abra o menu do navegador e procure “Instalar aplicativo” ou “Adicionar à tela inicial”.';
 }
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;refreshInstallState()});
installBtn?.addEventListener('click',async()=>{
 if(!deferredInstall)return;
 const prompt=deferredInstall;deferredInstall=null;
 try{await prompt.prompt();await prompt.userChoice;}catch{}
 refreshInstallState();
});
window.addEventListener('appinstalled',()=>{deferredInstall=null;refreshInstallState();updateNotificationStatus()});
refreshInstallState();


const ITEM_LABELS={recebido:'Aguardando preparação',em_producao:'Em preparação',concluido:'Pronto para retirada',aceito:'Aceito por garçom',retirado:'Retirado — levar à mesa',entregue:'Entregue ao cliente',cancelado:'Cancelado'};
function itemStateText(item){return ITEM_LABELS[item.status]||item.status;}
/** Aviso inline da área de entregas: não bloqueia a operação como o alert(). */
function avisarEntrega(msg){const alvo=$('#alertMessage');if(alvo)alvo.textContent=msg;}
async function deliveryAction(orderId,action,itemIds){
 const qtd=Array.isArray(itemIds)?itemIds.length:0;
 const plural=qtd>1;
 const labels={
  assumir:plural?'Aceitar estes '+qtd+' itens para retirada?':'Aceitar este item para retirada?',
  retirar:plural?'Confirmar que retirou estes '+qtd+' itens no setor?':'Confirmar que retirou este item no setor?',
  entregar:plural?'Confirmar que entregou estes '+qtd+' itens ao cliente?':'Confirmar que entregou este item ao cliente?'
 };
 if(!confirm(labels[action]))return;
 const suffix=action==='assumir'?'assumir-entrega':action;
 const out=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/pedidos/'+orderId+'/'+suffix,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({itemIds,etapa:action==='assumir'?'aceitar':action})});
 if(out.aviso)$('#alertMessage').textContent=out.aviso;
 await refreshLiveData();
}
async function loadDeliveries(){
 if(!waiterToken)return;
 const root=$('#readyOrders');
 try{
  const orders=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/pedidos');
  root.replaceChildren();
  const active=(Array.isArray(orders)?orders:[]).filter(p=>(p.itens||[]).some(i=>['concluido','aceito','retirado'].includes(i.status)));
  if(!active.length){root.innerHTML='<p class="muted">Nenhum item aguardando retirada ou entrega.</p>';return;}
  for(const order of active){
   const card=document.createElement('article');card.className='order';card.dataset.orderId=order.id;
   const head=document.createElement('div');head.className='order-head';
   const name=document.createElement('strong');name.textContent='Mesa '+String(order.mesa).padStart(2,'0')+' · Pedido #'+order.id;
   const owner=document.createElement('span');owner.className='muted small-copy';owner.textContent='Responsável da mesa: '+(order.responsavelMesaNome||'a definir no primeiro aceite');
   head.append(name,owner);card.append(head);
   if(order.observacao_geral){const note=document.createElement('p');note.className='muted';note.textContent='Observação: '+order.observacao_geral;card.append(note);}
   const list=document.createElement('div');list.className='order-items';
   // Um conjunto por etapa: o lote nunca mistura etapas nem inclui item que
   // pertence a outro garçom, porque o servidor exige o mesmo ator em cada uma.
   const lotes={assumir:[],retirar:[],entregar:[]};
   for(const item of order.itens||[]){
    const line=document.createElement('div');line.className='order-item-line';line.dataset.itemId=item.id;
    const desc=document.createElement('span');desc.textContent=(item.quantidade||1)+'× '+item.nome+' · '+(item.setor==='bar'?'Bar':'Cozinha');
    const state=document.createElement('strong');state.className='item-state state-'+item.status;state.textContent=itemStateText(item)+(item.garcomAceitoNome&&['aceito','retirado'].includes(item.status)?' · '+item.garcomAceitoNome:'');
    line.append(desc,state);
    const extras=[...(item.adicionais||[]).map(a=>'+ '+a.nome),...(item.remocoes||[]).map(r=>'sem '+r),item.observacao].filter(Boolean);
    if(extras.length){const ex=document.createElement('small');ex.className='item-extras';ex.textContent=extras.join(' · ');line.append(ex);}
    const actor=item.garcomEntregouId?item.entregue_por_nome:item.garcomRetirouId?item.retirado_por_nome:item.garcomAceitoId?item.aceito_por_nome:null;
    if(actor){const who=document.createElement('small');who.className='muted';who.textContent='Garçom: '+actor;line.append(who);}
    let action=null,label='';
    if(item.status==='concluido'){action='assumir';label='Aceitar item';}
    else if(item.status==='aceito'&&Number(item.garcomAceitoId)===Number(currentWaiterId)){action='retirar';label='Confirmar retirada';}
    else if(item.status==='retirado'&&Number(item.garcomRetirouId)===Number(currentWaiterId)){action='entregar';label='Confirmar entrega';}
    if(action){lotes[action].push(Number(item.id));const btn=document.createElement('button');btn.type='button';btn.className='secondary small';btn.textContent=label;btn.onclick=async()=>{btn.disabled=true;try{await deliveryAction(order.id,action,[Number(item.id)]);}catch(e){avisarEntrega(e.message||'Não foi possível atualizar a entrega.');btn.disabled=false;void loadDeliveries();}};line.append(btn);}
    else if(['aceito','retirado'].includes(item.status)){const locked=document.createElement('small');locked.className='muted';locked.textContent='Em andamento por outro garçom';line.append(locked);}
    list.append(line);
   }
   card.append(list);
   // Lote por pedido e por etapa. Aparece mesmo com um item só, para o garçom
   // ter sempre o mesmo gesto, e fica desabilitado durante o envio para não
   // disparar duas vezes o mesmo conjunto.
   const rotulos={assumir:'Aceitar todos os prontos',retirar:'Confirmar retirada de todos',entregar:'Confirmar entrega de todos'};
   const barra=document.createElement('div');barra.className='action-row';
   for(const etapa of ['assumir','retirar','entregar']){
    const ids=lotes[etapa];
    if(!ids.length)continue;
    const all=document.createElement('button');all.type='button';all.className=etapa==='assumir'?'primary':'secondary';
    all.textContent=rotulos[etapa]+' ('+ids.length+')';
    all.onclick=async()=>{
     const botoes=[...barra.querySelectorAll('button')];botoes.forEach(b=>{b.disabled=true});
     try{await deliveryAction(order.id,etapa,ids);}
     catch(e){avisarEntrega(e.message||'Não foi possível atualizar as entregas.');botoes.forEach(b=>{b.disabled=false});void loadDeliveries();}
    };
    barra.append(all);
   }
   if(barra.childElementCount)card.append(barra);
   const history=document.createElement('button');history.type='button';history.className='text-button';history.textContent='Histórico de movimentação';history.onclick=()=>showOrderHistory(order.id);card.append(history);
   root.append(card);
  }
 }catch(e){root.textContent='Não foi possível consultar as entregas: '+e.message;}
}
async function showOrderHistory(orderId){
 const dialog=$('#historyModal'),body=$('#historyContent');body.textContent='Carregando histórico…';dialog.showModal();
 try{const data=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/pedidos/'+orderId+'/historico');body.replaceChildren();
  if(!data.itens.length){body.textContent='Sem movimentações registradas após a atualização do sistema.';return;}
  for(const h of data.itens){const row=document.createElement('p');row.className='history-line';row.textContent=new Date(h.em).toLocaleString('pt-BR')+' · Item #'+h.itemId+' · '+(h.statusAnterior?itemStateText({status:h.statusAnterior})+' → ':'')+itemStateText({status:h.status})+' · '+(h.atorNome||h.atorTipo)+(h.motivo?' · '+h.motivo:'');body.append(row);}
 }catch(e){body.textContent=e.message;}
}
$('#closeHistory')?.addEventListener('click',()=>$('#historyModal').close());
document.querySelector('#refreshDeliveries')?.addEventListener('click',loadDeliveries);

/* QR Admin · navegação de páginas e fluxo sob demanda */
const pageCopy={
 tables:['Cada mesa, bem cuidada.','Inicie um atendimento ou transfira uma mesa já atribuída.'],
 orders:['Pedidos sob controle.','Veja o que está salvo e o que chegou ao servidor.'],
 deliveries:['Tudo saindo quentinho.','Pedidos prontos para entregar aos clientes.'],
 billing:['Fechamento de conta.','As cobranças confirmadas continuam no Caixa.']
};
function switchTab(tab){
 if(!pageCopy[tab])return;
 document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.dataset.page===tab));
 document.querySelectorAll('[data-tab]').forEach(el=>{const active=el.dataset.tab===tab;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 const [title,subtitle]=pageCopy[tab];$('#pageTitle').textContent=title;$('#pageSubtitle').textContent=subtitle;
 window.scrollTo({top:0,behavior:'instant'});
 if(tab==='deliveries'){void loadDeliveries();void loadOrderStatuses();}
 if(tab==='orders')void loadOrderStatuses();
 if(tab==='tables'&&navigator.onLine)void loadMesas().catch(e=>{$('#tableMessage').textContent=e.message});
}
function openOrder(tableNumber,parentOrderId=null){
 editingServerId=null;editingDraftId=null;pendingParentOrderId=parentOrderId?Number(parentOrderId):null;cart.clear();renderCart();const n=Number(tableNumber||$('#tableSelect').value||tables[0]);if(n)$('#modalTable').value=String(n);
 $('#modalCustomer').value=$('#customerName').value||'';
 $('#modalMessage').textContent=pendingParentOrderId?'Os novos itens serão registrados como pedido adicional vinculado ao pedido #'+pendingParentOrderId+'.':'';
 $('#orderModal').showModal();
}
function openQr(n){
 const table=Number(n||$('#modalTable').value||$('#tableSelect').value);
 const mesa=mesas.find(x=>Number(x.numero)===table);
 if(!mesa?.token){alert('Para proteger o acesso às mesas, o QR só pode ser exibido pelo garçom responsável atual. Use o QR impresso na mesa.');return;}
 if(table)$('#qrTable').value=String(table);
 updateQr();$('#qrModal').showModal();
}
async function iniciarAtendimento(n,customer){
 if(!navigator.onLine)throw Error('Para iniciar o atendimento é preciso estar conectado. Você ainda pode anotar um rascunho offline.');
 const table=Number(n);
 if(!table||!tables.includes(table))throw Error('Selecione uma mesa válida');
 const base='/api/garcom/'+encodeURIComponent(waiterToken)+'/mesas/'+table;
 const result=await getJson(base+'/iniciar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clienteNome:customer||undefined})});
 await loadMesas();
 return result;
}
async function clickStartAttendance(){
 const n=Number($('#tableSelect').value);
 const name=$('#customerName').value.trim();
 const target=$('#tableMessage');
 target.textContent='Iniciando atendimento…';
 try{
   await iniciarAtendimento(n,name);
   target.textContent='Mesa '+n+' vinculada ao seu atendimento. Pedidos prontos aparecerão nesta conta.';
   $('#modalTable').value=String(n);
   if(name)$('#modalCustomer').value=name;
 }catch(e){target.textContent=e.message||'Não foi possível iniciar o atendimento.';}
}
function renderTableGrid(){
 const root=$('#tableGrid');if(!root)return;root.replaceChildren();
 if(!mesas.length){root.textContent='Nenhuma mesa carregada. Conecte-se para atualizar.';return}
 for(const m of mesas){
  const card=document.createElement('button');card.type='button';card.className='table-tile';
  if(m.garcomResponsavelId&&m.garcomResponsavelNome)card.classList.add('taken');
  const title=document.createElement('strong');title.textContent='Mesa '+String(m.numero).padStart(2,'0');
  const desc=document.createElement('small');
  desc.textContent=m.garcomResponsavelNome?('Atendimento: '+m.garcomResponsavelNome):(m.pedidoClienteQr?'Pedido recebido pelo QR':(m.sessaoId?'Sessão aberta':'Pronta para atender'));
  card.append(title,desc);card.onclick=()=>openTableDetails(m.numero);
  root.append(card);
 }
}
function openTableDetails(tableNumber){
 const m=mesas.find(x=>Number(x.numero)===Number(tableNumber));if(!m)return;
 const root=$('#tableDetailsActions');root.replaceChildren();
 $('#tableDetailsTitle').textContent='Mesa '+m.numero;
 $('#tableDetailsStatus').textContent=m.garcomResponsavelNome
   ?'Responsável atual: '+m.garcomResponsavelNome
   :(m.pedidoClienteQr?'O cliente já fez um pedido pelo QR.':'Mesa livre para novos pedidos.');
 if(m.token){
   const qr=document.createElement('button');qr.type='button';qr.className='secondary';qr.textContent='Mostrar QR da mesa';qr.onclick=()=>openQr(m.numero);root.append(qr);
 }else{
   const qrNote=document.createElement('p');qrNote.className='muted';qrNote.textContent='Use o QR impresso na mesa. O acesso ao token QR é restrito ao responsável atual.';root.append(qrNote);
 }
 if(m.sessaoId){
   const newOrder=document.createElement('button');newOrder.type='button';newOrder.className='primary';newOrder.textContent='Novo pedido';newOrder.onclick=()=>{openOrder(m.numero);$('#tableDetailsModal').close();};root.append(newOrder);
   const appendLabel=document.createElement('label');appendLabel.className='field';appendLabel.textContent='Pedido ativo para acrescentar itens';
   const appendSelect=document.createElement('select');appendSelect.setAttribute('aria-label','Pedido ativo da mesa '+m.numero);appendSelect.disabled=true;
   const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=navigator.onLine?'Carregando pedidos ativos…':'Conecte-se para carregar pedidos ativos';appendSelect.append(placeholder);appendLabel.append(appendSelect);root.append(appendLabel);
   const appendButton=document.createElement('button');appendButton.type='button';appendButton.className='secondary';appendButton.textContent='Acrescentar itens ao pedido atual';appendButton.disabled=true;
   appendButton.onclick=()=>{const parent=Number(appendSelect.value);if(!Number.isSafeInteger(parent)||parent<1)return;openOrder(m.numero,parent);$('#tableDetailsModal').close();};root.append(appendButton);
   if(navigator.onLine&&m.garcomResponsavelId){
     getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/mesas/'+m.numero+'/pedidos-ativos').then(rows=>{
       appendSelect.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=rows.length?'Selecione o pedido ativo':'Nenhum pedido ativo — use “Novo pedido”';appendSelect.append(empty);
       for(const o of rows){const option=document.createElement('option');option.value=String(o.id);option.textContent='Pedido #'+o.id+' · '+(o.label||o.status);appendSelect.append(option);}
       appendSelect.disabled=!rows.length;appendButton.disabled=true;
     }).catch(()=>{appendSelect.replaceChildren();const error=document.createElement('option');error.value='';error.textContent='Não foi possível carregar pedidos ativos';appendSelect.append(error);});
   }else{
     appendSelect.replaceChildren();const unavailable=document.createElement('option');unavailable.value='';unavailable.textContent=navigator.onLine?'Inicie o atendimento antes de acrescentar itens':'Conecte-se para selecionar um pedido ativo';appendSelect.append(unavailable);
   }
   appendSelect.addEventListener('change',()=>{appendButton.disabled=!appendSelect.value;});
 }
 if(!m.garcomResponsavelId){
   const start=document.createElement('button');start.type='button';start.className='primary';start.textContent=m.pedidoClienteQr?'Assumir mesa':'Iniciar atendimento';
   start.onclick=async()=>{start.disabled=true;try{await iniciarAtendimento(m.numero,m.clienteNome||'');await loadMesas();$('#tableDetailsModal').close();}catch(e){alert(e.message||'Não foi possível iniciar o atendimento.');start.disabled=false;}};
   root.append(start);
 }else if(Number(m.garcomResponsavelId)===Number(currentWaiterId)&&m.sessaoId){
   const label=document.createElement('label');label.className='field';label.textContent='Transferir para outro garçom';
   const select=document.createElement('select');select.setAttribute('aria-label','Garçom de destino da mesa '+m.numero);
   const options=activeWaiters.filter(g=>Number(g.id)!==Number(currentWaiterId));
   const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=options.length?'Escolha o garçom':'Nenhum outro garçom ativo';select.append(placeholder);
   for(const g of options){const option=document.createElement('option');option.value=String(g.id);option.textContent=g.nome;select.append(option);}
   label.append(select);root.append(label);
   const transfer=document.createElement('button');transfer.type='button';transfer.className='primary';transfer.textContent='Transferir mesa';transfer.disabled=!options.length;
   transfer.onclick=async()=>{const targetId=Number(select.value);const targetName=select.options[select.selectedIndex]?.textContent||'';transfer.disabled=true;try{await transferTable(m.numero,targetId,targetName);$('#tableDetailsModal').close();}finally{transfer.disabled=!options.length;}};root.append(transfer);
 }else if(m.garcomResponsavelId){
   const note=document.createElement('p');note.className='muted';note.textContent='Qualquer garçom ativo pode acrescentar itens; somente o responsável atual pode transferir esta mesa.';root.append(note);
 }
 $('#tableDetailsModal').showModal();
}
function renderMyTables(){
 const root=$('#myTables');if(!root)return;root.replaceChildren();
 const mine=mesas.filter(m=>Number(m.garcomResponsavelId)===Number(currentWaiterId)&&m.sessaoId);
 $('#myTablesCount').textContent=mine.length+' em atendimento';
 if(!mine.length){const p=document.createElement('p');p.className='muted';p.textContent='Você ainda não iniciou um atendimento. Escolha uma mesa e toque em “Iniciar atendimento”.';root.append(p);return;}
 for(const m of mine){
  const btn=document.createElement('button');btn.type='button';btn.className='table-tile mine';
  const title=document.createElement('strong');title.textContent='Mesa '+m.numero;
  const info=document.createElement('small');info.textContent=(m.clienteNome||'Cliente não informado')+' · Anotar novo pedido ↗';
  btn.append(title,info);btn.onclick=()=>openOrder(m.numero);root.append(btn);
  const actions=document.createElement('div');actions.className='table-actions';
  const detail=document.createElement('button');detail.className='secondary small';detail.textContent='Ver pedidos';detail.onclick=()=>openOrdersModal(m.numero);
  const charge=document.createElement('button');charge.className='secondary small';charge.textContent='Cobrar';charge.onclick=()=>openBillingForSession(m.sessaoId,m.numero);
  const transferLabel=document.createElement('label');transferLabel.className='small-copy';transferLabel.textContent='Transferir para';
  const select=document.createElement('select');select.className='secondary small';select.setAttribute('aria-label','Garçom de destino da mesa '+m.numero);
  const options=activeWaiters.filter(g=>Number(g.id)!==Number(currentWaiterId));
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=options.length?'Escolha o garçom':'Nenhum outro garçom ativo';select.append(placeholder);
  for(const g of options){const option=document.createElement('option');option.value=String(g.id);option.textContent=g.nome;select.append(option);}
  const transfer=document.createElement('button');transfer.className='secondary small';transfer.textContent='Transferir';transfer.disabled=!options.length;
  transfer.onclick=()=>transferTable(m.numero,Number(select.value),select.options[select.selectedIndex]?.textContent||'');
  const leave=document.createElement('button');leave.className='secondary small leave-table';leave.textContent='Deixar mesa';leave.onclick=()=>leaveTable(m.numero);
  actions.append(detail,charge,transferLabel,select,transfer,leave);root.append(actions);
 }
}
/**
 * Bloqueio de cobrança sempre visível.
 *
 * Antes o botão só ficava `disabled` sem dizer o motivo, e como o QR PIX é
 * montado no navegador a partir do valor digitado, o garçom via o QR perfeito
 * ao lado de um botão que parecia morto. Agora todo bloqueio escreve a causa.
 */
function bloquearCobranca(motivo){
 const aviso=$('#billingBlocked');
 $('#registerPayment').disabled=true;
 if(aviso){aviso.textContent=motivo;aviso.hidden=false;}
}
function liberarCobranca(){
 const aviso=$('#billingBlocked');
 $('#registerPayment').disabled=false;
 if(aviso){aviso.textContent='';aviso.hidden=true;}
}
function renderBillingSessions(){
 const select=$('#billingSession');if(!select)return;
 const previous=select.value;
 const mine=mesas.filter(m=>Number(m.garcomResponsavelId)===Number(currentWaiterId)&&m.sessaoId);
 select.replaceChildren();
 if(!mine.length){
  const option=document.createElement('option');option.value='';option.textContent='Nenhuma mesa sob sua responsabilidade';select.append(option);
  $('#billingSummary').textContent='Inicie ou receba uma transferência de mesa para registrar recebimentos.';
  // distingue "perfil ainda não carregado" de "não sou o responsável".
  // Number(null) é 0 e passaria num teste de inteiro seguro, por isso o guard
  // explícito de nulidade e a exigência de id positivo.
  const idGarcom=Number(currentWaiterId);
  const semIdentidade=currentWaiterId===null||currentWaiterId===undefined||currentWaiterId===''||!Number.isSafeInteger(idGarcom)||idGarcom<1;
  bloquearCobranca(semIdentidade
   ?'Não foi possível identificar seu cadastro de garçom. Reconecte-se e toque em “Atualizar saldo”.'
   :'Você não é o responsável atual de nenhuma mesa aberta. Somente o responsável registra recebimentos; peça a transferência da mesa ou use o Caixa.');
  if(pendingWaiterPayment)$('#billingMessage').textContent='Existe uma tentativa anterior pendente para a mesa '+pendingWaiterPayment.mesa+'. Confira o estado no Caixa antes de registrar outro pagamento.';
  return;
 }
 for(const m of mine){const option=document.createElement('option');option.value=String(m.sessaoId);option.textContent='Mesa '+m.numero+(m.clienteNome?' · '+m.clienteNome:'');select.append(option);}
 const pendingOption=pendingWaiterPayment&&mine.find(m=>Number(m.sessaoId)===Number(pendingWaiterPayment.sessaoId));
 select.value=pendingOption?String(pendingWaiterPayment.sessaoId):(mine.some(m=>String(m.sessaoId)===previous)?previous:String(mine[0].sessaoId));
 if(!pendingWaiterPayment&&select.value!==previous){$('#billingAmount').value='';$('#billingReceivedConfirm').checked=false;}
 liberarCobranca();
 if(pendingWaiterPayment){
  if(pendingOption){
   $('#billingAmount').value=String(pendingWaiterPayment.valor);
   $('#billingMethod').value=pendingWaiterPayment.formaPagamento;
   $('#billingMessage').textContent='Há uma tentativa anterior que pode ter sido registrada. Reenvie exatamente os mesmos dados para reutilizar a mesma chave idempotente.';
  }else{
   $('#billingMessage').textContent='Existe uma tentativa pendente para a mesa '+pendingWaiterPayment.mesa+'. Ela não está mais sob sua responsabilidade; confira o Caixa antes de registrar outro pagamento.';
   bloquearCobranca('Resolva a tentativa pendente da mesa '+pendingWaiterPayment.mesa+' antes de cobrar outra mesa. Confira o Caixa para saber se o valor entrou.');
  }
 }
 updateBillingConfirmation();
 void loadBillingSummary();
}
function openBillingForSession(sessaoId,mesaNumero){
 switchTab('billing');
 renderBillingSessions();
 const select=$('#billingSession');
 if([...select.options].some(o=>o.value===String(sessaoId)))select.value=String(sessaoId);
 if(!pendingWaiterPayment){$('#billingAmount').value='';$('#billingReceivedConfirm').checked=false;}
 $('#billingMessage').textContent='Mesa '+mesaNumero+' selecionada. Consulte o saldo antes de registrar o recebimento.';
 void loadBillingSummary();
}
async function loadBillingSummary(){
 const sessionId=Number($('#billingSession')?.value);
 if(!Number.isSafeInteger(sessionId)||sessionId<1){$('#billingSummary').textContent='Selecione uma mesa sob sua responsabilidade.';return}
 if(!navigator.onLine){$('#billingSummary').textContent='Conecte-se para consultar o saldo no servidor.';bloquearCobranca('Sem conexão: o saldo precisa ser confirmado no servidor antes de registrar recebimento.');return}
 try{
  const data=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/sessoes/'+sessionId+'/resumo-pagamento');
  const total=Number(data.valorTotal),pago=Number(data.valorPago),restante=Number(data.valorRestante);
  $('#billingSummary').textContent='Mesa '+data.mesa+' · Total entregue: '+money(total)+' · Já recebido: '+money(pago)+' · Saldo: '+money(restante);
  if(pendingWaiterPayment&&Number(pendingWaiterPayment.sessaoId)!==sessionId){
   bloquearCobranca('Resolva a tentativa pendente da mesa '+pendingWaiterPayment.mesa+' antes de cobrar outra mesa.');
   return;
  }
  if(restante<=0){
   // Saldo zero tem duas causas muito diferentes e o garçom precisa saber qual.
   bloquearCobranca(total<=0
     ?'Nenhum item desta mesa foi marcado como entregue, então ainda não há valor a cobrar. Confirme as entregas na aba Entregas e toque em “Atualizar saldo”.'
     :'Esta conta já está quitada ('+money(pago)+' recebidos). O fechamento e a liberação da mesa são feitos no Caixa.');
   return;
  }
  liberarCobranca();
 }catch(e){
  $('#billingSummary').textContent=e.message||'Não foi possível consultar o saldo.';
  bloquearCobranca(e.status===403
   ?'Você não é o responsável atual desta mesa. Peça a transferência ou registre o recebimento no Caixa.'
   :(e.message||'Não foi possível consultar o saldo.')+' Toque em “Atualizar saldo” para tentar novamente.');
 }
}
function renderPixPaymentQr(){
 const panel=$('#pixQrPanel');
 const pix=$('#billingMethod').value==='pix';
 panel.hidden=!pix;
 if(!pix)return;
 const img=$('#pixQrImage'),payloadField=$('#pixCopyPaste'),status=$('#pixQrMessage');
 const valor=Number($('#billingAmount').value);
 if(!window.LQRPix||!LQRPix.disponivel()){
  img.removeAttribute('src');payloadField.value='';
  status.textContent='PIX não configurado: confira PIX_CHAVE nas variáveis da Railway.';
  return;
 }
 if(!Number.isFinite(valor)||valor<=0){
  img.removeAttribute('src');payloadField.value='';
  status.textContent='Informe o valor que o cliente vai pagar para gerar o QR Code.';
  return;
 }
 const payload=LQRPix.montarPayload(valor);
 const src=LQRPix.qrUrl(valor);
 if(!payload||!src){
  img.removeAttribute('src');payloadField.value='';
  status.textContent='Não foi possível gerar o QR Code PIX. Confira a configuração e tente novamente.';
  return;
 }
 img.src=src;payloadField.value=payload;
 status.textContent='PIX de '+money(Number(valor.toFixed(2)))+'. Mostre o QR ao cliente; só confirme depois de conferir o crédito no aplicativo bancário.';
}
function updateBillingConfirmation(){
 const pix=$('#billingMethod').value==='pix';
 $('#pixPaymentNote').hidden=!pix;
 $('#billingConfirmLabel').textContent=pix?'Confirmei o crédito PIX no aplicativo bancário.':'Confirmo que recebi o valor informado.';
 renderPixPaymentQr();
}
async function submitWaiterPayment(){
 const sessionId=Number($('#billingSession').value);
 const valor=Number($('#billingAmount').value);
 const formaPagamento=$('#billingMethod').value;
 if(!Number.isSafeInteger(sessionId)||sessionId<1){$('#billingMessage').textContent='Selecione uma mesa sob sua responsabilidade.';return}
 if(!Number.isFinite(valor)||valor<=0){$('#billingMessage').textContent='Informe um valor maior que zero.';return}
 if(!$('#billingReceivedConfirm').checked){$('#billingMessage').textContent='Confirme o recebimento antes de registrar.';return}
 const valorArredondado=Number(valor.toFixed(2));
 if(pendingWaiterPayment){
  if(Number(pendingWaiterPayment.sessaoId)!==sessionId||Number(pendingWaiterPayment.valor)!==valorArredondado||pendingWaiterPayment.formaPagamento!==formaPagamento){
   $('#billingMessage').textContent='Há uma tentativa anterior possivelmente registrada. Reenvie os mesmos dados para reutilizar a chave idempotente; consulte o Caixa antes de iniciar outra cobrança.';
   return;
  }
 }else{
  const mesa=mesas.find(m=>Number(m.sessaoId)===sessionId);
  // A variável local é `sessionId`; o shorthand `sessaoId` lançava
  // ReferenceError e matava o handler antes de qualquer requisição — era o
  // "botão de confirmar pagamento que não faz nada".
  pendingWaiterPayment={sessaoId:sessionId,mesa:mesa?.numero||'?',valor:valorArredondado,formaPagamento,key:uid()};
  localStorage.setItem(pendingPaymentStorageKey,JSON.stringify(pendingWaiterPayment));
 }
 const button=$('#registerPayment');button.disabled=true;
 try{
  const out=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/sessoes/'+sessionId+'/pagamentos',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({valor:valorArredondado,formaPagamento,idempotencyKey:pendingWaiterPayment.key})
  });
  pendingWaiterPayment=null;localStorage.removeItem(pendingPaymentStorageKey);
  $('#billingAmount').value='';$('#billingReceivedConfirm').checked=false;
  // Quando o valor quita a conta e não há produção pendente, o servidor já
  // encerra a sessão e libera a mesa. Sem este aviso a mesa simplesmente
  // desaparecia da lista e o garçom não sabia se tinha dado certo.
  $('#billingMessage').textContent=out.sessaoFechada
   ?'Recebimento de '+money(Number(out.pagamento.valor))+' registrado. Conta quitada, atendimento encerrado e mesa liberada.'
   :'Recebimento registrado: '+money(Number(out.pagamento.valor))+'. Saldo restante: '+money(Number(out.valorRestante))+(out.idempotentReplay?' (confirmação recuperada após repetição segura).':'');
  await loadBillingSummary();
  await loadMesas();
 }catch(e){
  if(e.status&&e.status<500){pendingWaiterPayment=null;localStorage.removeItem(pendingPaymentStorageKey);}
  $('#billingMessage').textContent=(e.message||'Não foi possível registrar o recebimento.')+(pendingWaiterPayment?' Se houve timeout, tente novamente sem alterar mesa, valor ou forma para reutilizar a mesma chave.':'');
 }
 // Não reabilita no escuro: quem decide é o saldo do servidor, para o botão
 // nunca voltar aceso numa conta quitada ou sem item entregue.
 finally{button.disabled=false;await loadBillingSummary();}
}
$('#billingSession').addEventListener('change',()=>{if(pendingWaiterPayment&&Number($('#billingSession').value)!==Number(pendingWaiterPayment.sessaoId)){const mine=mesas.find(m=>Number(m.sessaoId)===Number(pendingWaiterPayment.sessaoId)&&Number(m.garcomResponsavelId)===Number(currentWaiterId));if(mine)$('#billingSession').value=String(pendingWaiterPayment.sessaoId);$('#billingMessage').textContent='Resolva a tentativa pendente com os mesmos dados antes de selecionar outra mesa.';}else if(!pendingWaiterPayment){$('#billingAmount').value='';$('#billingReceivedConfirm').checked=false;}void loadBillingSummary()});
$('#refreshBilling').addEventListener('click',()=>loadBillingSummary());
$('#billingMethod').addEventListener('change',updateBillingConfirmation);
$('#registerPayment').addEventListener('click',submitWaiterPayment);
$('#billingAmount').addEventListener('input',renderPixPaymentQr);
$('#copyPixPayload').addEventListener('click',async()=>{
 const payload=$('#pixCopyPaste').value;
 if(!payload){$('#pixQrMessage').textContent='Gere o QR informando um valor válido primeiro.';return;}
 try{await navigator.clipboard.writeText(payload);$('#copyPixPayload').textContent='PIX copia e cola copiado';setTimeout(()=>$('#copyPixPayload').textContent='Copiar PIX copia e cola',1800);}
 catch(_){$('#pixCopyPaste').focus();$('#pixCopyPaste').select();try{document.execCommand('copy');$('#pixQrMessage').textContent='Código selecionado/copiar manualmente se necessário.';}catch(__){}}
});
if(window.LQRPix){void LQRPix.loadConfig().then(()=>{updateBillingConfirmation();}).catch(()=>updateBillingConfirmation());}
async function transferTable(table,targetId,targetName){
 if(!Number.isSafeInteger(targetId)||targetId<1){alert('Escolha um garçom ativo para receber a mesa.');return;}
 if(!confirm('Transferir a mesa '+table+' para '+targetName+'? Pedidos já prontos continuarão prontos e passarão para a fila do novo responsável.'))return;
 try{
   await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/mesas/'+table+'/transferir',{
     method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({garcomDestinoId:targetId})
   });
   await loadMesas();await loadOrderStatuses();await loadDeliveries();
   $('#tableMessage').textContent='Mesa '+table+' transferida para '+targetName+'.';
 }catch(e){alert(e.message||'Não foi possível transferir a mesa.');}
}
function openEditDraft(o){
 editingServerId=null;editingDraftId=o.localId;cart.clear();
 for(const i of o.items){const p=products.find(x=>Number(x.id)===Number(i.productId));if(!p){alert('Produto '+i.name+' indisponível no cardápio salvo. Atualize antes de editar.');editingDraftId=null;return}cart.set(String(p.id),{product:p,qty:Number(i.qty)||1,additions:i.additions||[],removals:i.removals||[],note:i.note||''});}
 $('#modalTable').value=String(o.table);$('#modalCustomer').value=o.customerName||'';$('#orderNote').value=o.note||'';renderCart();
 $('#orderModal').showModal();$('#saveOrder').textContent='Atualizar rascunho';
}
async function updateDraft(){
 const o=(await allOrders()).find(x=>x.localId===editingDraftId);
 if(!o||o.status!=='offline'||o.attempts){alert('Somente rascunhos ainda não tentados podem ser editados. Após uma tentativa, preserve o original e revise o conflito.');return}
 if(!cart.size){alert('O pedido não pode ficar vazio');return}
 const name=$('#modalCustomer').value.trim();if(!name){alert('Informe o cliente');return}
 o.table=Number($('#modalTable').value);o.customerName=name;o.note=$('#orderNote').value.trim();
 o.items=[...cart.values()].map(it=>({productId:Number(it.product.id),name:it.product.nome||it.product.name,qty:it.qty,unitPrice:Number(it.product.preco??it.product.price??0),additions:it.additions||[],removals:it.removals||[],note:it.note||''}));
 o.total=o.items.reduce((sum,it)=>sum+it.qty*(it.unitPrice+(it.additions||[]).reduce((acc,a)=>acc+Number((products.find(x=>Number(x.id)===it.productId)?.adicionais||[]).find(x=>Number(x.id)===Number(a.id))?.preco||0),0)),0);
 await putOrder(o);editingDraftId=null;$('#saveOrder').textContent='Salvar pedido';cart.clear();renderCart();$('#orderModal').close();await renderOrders();
}
$('#orderModal').addEventListener('close',()=>{editingDraftId=null;editingServerId=null;$('#saveOrder').textContent='Salvar pedido'});
function editLiveOrder(o){
 if(!o.podeEditar){alert('Só é possível editar antes de cozinha ou bar começar o preparo.');return}
 pendingParentOrderId=null;editingServerId=Number(o.id);cart.clear();
 for(const i of o.itens){const p=products.find(x=>Number(x.id)===Number(i.productId));if(!p){alert('Atualize o cardápio para editar esse pedido.');return}cart.set(String(p.id),{product:p,qty:Number(i.qty)||1,additions:i.additions||[],removals:i.removals||[],note:i.note||''});}
 $('#modalTable').value=String(o.mesa);$('#modalCustomer').value=o.clienteNome||'';$('#orderNote').value=o.note||'';renderCart();$('#orderModal').showModal();
 $('#modalMessage').textContent='Editando pedido #'+o.id+' · permitido somente antes do preparo.';
 $('#saveOrder').textContent='Salvar alterações';
 
}
function liveLabel(o){
 const statuses=(o.itens||[]).map(i=>i.status);
 if(statuses.length&&statuses.every(x=>x==='cancelado'))return 'Cancelado';
 if(statuses.every(x=>['entregue','cancelado'].includes(x)))return 'Entregue';
 if(statuses.some(x=>x==='retirado'))return 'Retirado — entregar';
 if(statuses.some(x=>x==='aceito'))return 'Aceito pelo garçom';
 if(statuses.some(x=>x==='concluido'))return 'Pronto para entrega';
 if(statuses.some(x=>x==='em_producao'))return 'Em preparo';
 return 'Recebido';
}
async function loadOrderStatuses(){
 if(!waiterToken||waiterAuthInvalid||syncEngine?.connection==='offline')return;
 try{
   const rows=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/atendimentos');
   const root=$('#modalOrderStatuses');root.replaceChildren();
   if(!rows.length){root.innerHTML='<p class="muted">Nenhum pedido nas suas mesas abertas.</p>'}
   for(const o of rows){
     const showOrder=selectedOrdersTable===null||Number(o.mesa)===selectedOrdersTable;
     const ready=(o.itens||[]).filter(i=>i.status==='concluido');
     const card=document.createElement('article');card.className='order';
     const heading=document.createElement('div');heading.className='order-head';
     const name=document.createElement('strong');name.textContent='Mesa '+o.mesa+' · Pedido #'+o.id+(o.pedidoPaiId?' · adicional do #'+o.pedidoPaiId:'');
     const status=document.createElement('span');status.className='status '+(ready.length?'confirmed':'sync');status.textContent=liveLabel(o);
     heading.append(name,status);card.append(heading);
     const items=document.createElement('div');items.className='order-items';
     for(const item of o.itens||[]){
       const line=document.createElement('div');line.className='order-item-line';
       const description=document.createElement('span');description.textContent=(item.qty||1)+'× '+item.nome+' · '+(item.setor==='bar'?'Bar':'Cozinha');
       const state=document.createElement('strong');
       state.className='item-state state-'+item.status;
       state.textContent=itemStateText(item);
       line.append(description,state);items.append(line);
     }
     card.append(items);
     if(o.podeEditar){const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Editar pedido';edit.onclick=()=>editLiveOrder(o);card.append(edit)}
     if(showOrder)root.append(card);
     // Nunca repete avisos ao entrar novamente na página ou após reabrir.
     const newReady=ready.filter(i=>!announcedReady.has(Number(i.id)));
     if(!firstLiveLoad&&newReady.length&&readyAlertsEnabled)notifyReady(o,newReady.length);
     ready.forEach(i=>announcedReady.add(Number(i.id)));
     if(announcedReady.size>400){const last=[...announcedReady].slice(-250);announcedReady.clear();last.forEach(id=>announcedReady.add(id))}
     localStorage.setItem(READY_STORAGE,JSON.stringify([...announcedReady]));
   }
   firstLiveLoad=false;liveOrders=rows;
 }catch(e){$('#modalOrderStatuses').textContent='Falha ao atualizar pedidos: '+e.message;}
}
function notifyReady(o,quantidade=1){
 const title='Pedido pronto · Mesa '+o.mesa;
 const body=quantidade+' item(ns) do pedido #'+o.id+' já podem ser entregues.';
 $('#alertMessage').textContent=title+' — '+body;
 const toast=$('#readyToast');$('#readyToastTitle').textContent=title;$('#readyToastDescription').textContent=body;toast.hidden=false;

 try{navigator.vibrate?.([140,80,140])}catch{}
 if(readyAlertsEnabled&&'Notification'in window&&Notification.permission==='granted'){
   try{navigator.serviceWorker?.ready.then(reg=>reg.showNotification(title,{body,tag:'ready-'+o.id,icon:'./icon-192.png'})).catch(()=>new Notification(title,{body,tag:'ready-'+o.id,icon:'./icon-192.png'}))}catch{}
 }
 if(window.speechSynthesis){try{speechSynthesis.cancel();const msg=new SpeechSynthesisUtterance('Pedido pronto na mesa '+o.mesa);msg.lang='pt-BR';speechSynthesis.speak(msg)}catch{}}
}
$('#refreshOrderStatus').addEventListener('click',loadOrderStatuses);
const CONSENT_SEEN='garcom-notification-intro-v1-'+waiterToken;
const consentDialog=$('#notificationConsent');
function notificationPermission(){
 if(!('Notification'in window))return 'unavailable';
 return Notification.permission;
}
function updateNotificationStatus(){
 const permission=notificationPermission(),installed=isStandalone();
 let state;
 if(permission==='unavailable')state='Notificações indisponíveis: este navegador não oferece a API necessária.';
 else if(permission==='denied')state='Permissão negada nas configurações do navegador. Você pode alterá-la nas configurações do site.';
 else if(permission==='granted')state='Permissão concedida. Avisos locais dependem de o app estar executando; push em segundo plano não está configurado no servidor.';
 else state='Permissão ainda não solicitada.';
 $('#notificationStatus').textContent=(installed?'PWA instalado. ':'PWA não instalado. ')+state;
 $('#enableAlerts').textContent=permission==='granted'?'Ver status das notificações':'Configurar notificações';
 $('#requestNotificationPermission').disabled=permission==='unavailable'||permission==='denied';
 $('#consentPlatformNote').textContent=installed?'O PWA está instalado neste dispositivo.':'A instalação pode ser necessária para notificações em algumas plataformas. Use a opção de instalação ou siga as instruções do navegador.';
 refreshInstallState();
}
function openNotificationSetup(){
 updateNotificationStatus();
 const p=notificationPermission();
 if(p==='denied')$('#consentStatus').textContent='A permissão foi negada. Altere-a nas configurações do site no navegador; não podemos reabrir o pedido automaticamente.';
 else if(p==='unavailable')$('#consentStatus').textContent='Notificações indisponíveis neste navegador ou dispositivo.';
 else if(p==='granted')$('#consentStatus').textContent='Permissão concedida, mas o servidor não possui subscrição/envio Web Push em segundo plano.';
 else $('#consentStatus').textContent='';
 if(!consentDialog.open)consentDialog.showModal();
}
$('#enableAlerts').addEventListener('click',openNotificationSetup);
$('#closeNotificationConsent').addEventListener('click',()=>consentDialog.close());
consentDialog.addEventListener('close',()=>localStorage.setItem(CONSENT_SEEN,'1'));
$('#dismissNotificationConsent').addEventListener('click',()=>{localStorage.setItem(CONSENT_SEEN,'1');consentDialog.close()});
$('#requestNotificationPermission').addEventListener('click',async()=>{
 if(!('Notification'in window)){updateNotificationStatus();return}
 // O diálogo só fecha quando houve decisão real do usuário. Se ele dispensar
 // o prompt nativo sem escolher ('default'), mantemos a folha aberta para que
 // possa tentar de novo — antes ela nunca fechava, nem depois de permitir.
 let decidiu=false;
 try{
   const result=await Notification.requestPermission();
   if(result==='denied'){
     const confirmed=window.confirm('Você recusou as notificações e não receberá avisos por este navegador. Deseja confirmar essa escolha? Você poderá configurar novamente depois nas configurações do site e neste painel.');
     if(confirmed){localStorage.setItem('garcom-notifications-declined-'+waiterToken,'1');$('#consentStatus').textContent='Escolha salva. Você não receberá notificações enquanto a permissão estiver negada. Para reativar, altere a permissão nas configurações do navegador.';decidiu=true}
     else $('#consentStatus').textContent='A permissão foi negada pelo navegador. Para tentar novamente, altere-a nas configurações do site.';
   }else if(result==='granted'){
     localStorage.setItem('garcom-ready-alerts-'+waiterToken,'1');readyAlertsEnabled=true;
     $('#consentStatus').textContent='Permissão concedida. Isso não ativa push em segundo plano: o servidor ainda não implementa subscrição nem envio Web Push.';
     decidiu=true;
   }else $('#consentStatus').textContent='Você ainda não permitiu notificações. Pode decidir depois por este painel.';
 }catch(e){$('#consentStatus').textContent='Não foi possível solicitar permissão neste contexto. Verifique se o site usa HTTPS e tente por uma ação explícita.'}
 localStorage.setItem(CONSENT_SEEN,'1');updateNotificationStatus();
 if(decidiu){
   // Fecha a folha e leva o resultado para o painel, que continua acessível
   // pelo botão de notificações do cabeçalho.
   if(consentDialog.open)consentDialog.close();
   $('#alertMessage').textContent=readyAlertsEnabled
     ?'Avisos de item pronto ativados neste dispositivo. Com o app fechado não há envio em segundo plano.'
     :'Preferência de notificações salva. Você pode alterá-la depois nas configurações do site.';
 }
});
updateNotificationStatus();
if(!localStorage.getItem(CONSENT_SEEN)){
 $('#consentStatus').textContent='Na primeira visita, explicamos os requisitos antes de solicitar permissão.';
 consentDialog.showModal();
}
window.addEventListener('pageshow',updateNotificationStatus);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateNotificationStatus()});


$('#readyToastAction').addEventListener('click',()=>{switchTab('deliveries');$('#readyToast').hidden=true});
$('#readyToastDismiss').addEventListener('click',()=>{$('#readyToast').hidden=true});

function openOrdersModal(table){
 selectedOrdersTable=Number(table)||null;
 $('#ordersModalTitle').textContent=selectedOrdersTable?'Pedidos · Mesa '+selectedOrdersTable:'Pedidos das minhas mesas';
 $('#ordersModal').showModal();
 void loadOrderStatuses();
}
async function leaveTable(table){
 if(!navigator.onLine){alert('Para deixar a mesa, conecte-se à internet.');return}
 if(!confirm('Deixar a mesa '+table+'? A conta do cliente continuará aberta.'))return;
 try{
   await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/mesas/'+table+'/deixar',{method:'POST'});
   await loadMesas();await loadOrderStatuses();
   $('#tableMessage').textContent='Você deixou a mesa '+table+'. A conta continua aberta.';
 }catch(e){alert(e.message||'Não foi possível deixar a mesa.')}
}
$('#showActiveOrders').addEventListener('click',()=>openOrdersModal(null));
$('#closeOrdersModal').addEventListener('click',()=>$('#ordersModal').close());
$('#ordersModal').addEventListener('close',()=>{selectedOrdersTable=null});


// O navegador mantém o fundo inerte durante showModal(); impedir rolagem ao fundo.
for (const modal of document.querySelectorAll('dialog.sheet')) {
  modal.addEventListener('click', event => {
    // Fechar apenas quando o toque foi diretamente no backdrop do dialog.
    if (event.target !== modal) return;
    const rect = modal.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) modal.close();
  });
}
