const $=s=>document.querySelector(s);const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);const DB='garcom-pwa-v1',STORE='orders';let db;let products=[];let cart=new Map();let mock=false;let waiterToken=new URLSearchParams(location.search).get('token')||localStorage.getItem('waiter-token')||'';if(waiterToken)localStorage.setItem('waiter-token',waiterToken);let mesas=[];const tables=[];const sample=[{id:'lanche-01',name:'X-Burger',description:'Hambúrguer, queijo e salada',price:22,additions:['Bacon','Ovo','Queijo extra'],removals:['Sem cebola','Sem tomate']},{id:'lanche-02',name:'X-Salada',description:'Hambúrguer, queijo, alface e tomate',price:25,additions:['Bacon','Ovo','Queijo extra'],removals:['Sem cebola','Sem tomate']},{id:'porcao-01',name:'Batata frita',description:'Porção crocante',price:18,additions:['Cheddar','Bacon'],removals:[]},{id:'bebida-01',name:'Refrigerante lata',description:'350 ml',price:6,additions:['Sem gelo'],removals:[]},{id:'bebida-02',name:'Suco natural',description:'Consulte os sabores disponíveis',price:9,additions:['Laranja','Limão'],removals:[]}];function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'localId'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}function allOrders(){return new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result.filter(o=>o.ownerToken===waiterToken).sort((a,b)=>b.createdAt-a.createdAt));r.onerror=()=>reject(r.error)})}function putOrder(o){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(o);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}function statusText(s){return ({offline:'Salvo offline',sync:'Sincronizando',confirmed:'Confirmado',conflict:'Conflito'})[s]||s}function populateTables(){for(const sel of [$('#tableSelect'),$('#qrTable'),$('#modalTable')]){const old=sel.value;sel.replaceChildren();tables.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent='Mesa '+n;sel.append(o)});if(tables.includes(Number(old)))sel.value=old;}}async function getJson(url,opts={}){const res=await fetch(url,{cache:'no-store',...opts});const data=await res.json().catch(()=>({}));if(!res.ok){const err=new Error(data.error||'HTTP '+res.status);err.status=res.status;throw err;}return data;}
async function loadMesas(){if(!waiterToken)throw Error('Abra o link individual do garçom fornecido pelo administrador');const data=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/mesas');mesas=data.mesas||[];localStorage.setItem('waiter-mesas-cache-'+waiterToken,JSON.stringify(mesas));tables.splice(0,tables.length,...mesas.map(x=>Number(x.numero)));populateTables();updateQr();renderTableGrid();currentWaiterId=Number(data.garcom.id);$('#identity').textContent='Garçom: '+data.garcom.nome;renderMyTables();}
async function loadProducts(){try{const data=await getJson('/api/cardapio');products=data.flatMap(c=>(c.produtos||[]).map(p=>({...p,name:p.nome,price:Number(p.preco),description:p.descricao})));localStorage.setItem('waiter-menu-cache',JSON.stringify(products));}catch(e){try{products=JSON.parse(localStorage.getItem('waiter-menu-cache')||'[]')}catch{products=[]}if(!products.length)$('#connection').textContent='Sem cardápio offline: conecte-se ao menos uma vez.';}renderProducts()}
function renderProducts(){const q=$('#search').value.toLocaleLowerCase('pt-BR');const root=$('#products');root.replaceChildren();products.filter(p=>q.length>=2&&(p.name||p.nome||'').toLocaleLowerCase('pt-BR').includes(q)).slice(0,12).forEach(p=>{const name=p.name||p.nome;const price=Number(p.price??p.preco??0);const card=document.createElement('article');card.className='product';card.innerHTML='<h3></h3><p></p><div class="product-foot"><span class="price"></span><button>Adicionar</button></div>';card.querySelector('h3').textContent=name;card.querySelector('p').textContent=p.description||p.descricao||'Produto do cardápio';card.querySelector('.price').textContent=money(price);card.querySelector('button').onclick=()=>{const old=cart.get(String(p.id));cart.set(String(p.id),{product:p,qty:(old?.qty||0)+1,additions:old?.additions||[],removals:old?.removals||[],note:old?.note||''});renderCart()};root.append(card)});if(!root.children.length)root.innerHTML=q.length<2?'<p class="muted">Digite ao menos 2 letras para buscar um produto.</p>':'<p class="empty">Nenhum produto encontrado.</p>'}function renderCart(){const root=$('#cart');root.replaceChildren();let total=0;if(!cart.size)root.innerHTML='<p class="muted">Adicione produtos ao pedido.</p>';for(const [id,item] of cart){const p=item.product;const name=p.name||p.nome;const price=Number(p.price??p.preco??0);const adicionaisPreco=(item.additions||[]).reduce((sum,sel)=>sum+Number((p.adicionais||[]).find(a=>Number(a.id)===Number(sel.id||sel))?.preco||0),0);const precoComAdicionais=price+adicionaisPreco;total+=precoComAdicionais*item.qty;const row=document.createElement('div');row.className='cart-item';row.innerHTML='<div class="cart-row"><strong class="item-name"></strong><div class="qty"><button data-act="minus" aria-label="Diminuir quantidade">−</button><span></span><button data-act="plus" aria-label="Aumentar quantidade">+</button></div><strong class="line-price"></strong></div><div class="cart-details"><label>Adicionais<input data-field="additions" placeholder="Ex.: bacon, queijo extra"></label><label>Remover ingredientes<input data-field="removals" placeholder="Ex.: sem cebola"></label><label>Observação do item<input data-field="note" placeholder="Ponto da carne, etc."></label></div>';row.querySelector('.item-name').textContent=name;row.querySelector('.qty span').textContent=item.qty;row.querySelector('.line-price').textContent=money(precoComAdicionais*item.qty);row.querySelector('[data-act="minus"]').onclick=()=>{if(item.qty<=1)cart.delete(id);else item.qty--;renderCart()};row.querySelector('[data-act="plus"]').onclick=()=>{item.qty=Math.min(99,item.qty+1);renderCart()};const opts=p.adicionais||[];
const addInput=row.querySelector('[data-field="additions"]');
const addWrap=document.createElement('div');addWrap.className='addon-options';
if(opts.length){const caption=document.createElement('span');caption.textContent='Adicionais (opcionais)';addWrap.append(caption);for(const a of opts){const label=document.createElement('label');label.className='addon-choice';const cb=document.createElement('input');cb.type='checkbox';cb.checked=(item.additions||[]).some(x=>Number(x.id||x)===Number(a.id));cb.onchange=()=>{const selected=new Set((item.additions||[]).map(x=>Number(x.id||x)));if(cb.checked)selected.add(Number(a.id));else selected.delete(Number(a.id));item.additions=[...selected].map(id=>({id}));renderCart();};const title=document.createElement('span');title.textContent=a.nome+' · '+money(Number(a.preco||0));label.append(cb,title);addWrap.append(label);}}else addWrap.textContent='Sem adicionais disponíveis';
addInput.closest('label').replaceWith(addWrap);
for(const f of ['removals','note']){const input=row.querySelector('[data-field="'+f+'"]');input.value=Array.isArray(item[f])?item[f].join(', '):item[f];input.onchange=()=>{item[f]=f==='note'?input.value:input.value.split(',').map(x=>x.trim()).filter(Boolean)}}root.append(row)}$('#total').textContent=money(total)}async function renderOrders(){const orders=await allOrders();$('#queueCount').textContent=orders.filter(o=>o.status!=='confirmed').length+' pendentes';const root=$('#orders');root.replaceChildren();if(!orders.length){root.innerHTML='<p class="muted">Nenhum pedido salvo neste aparelho.</p>';return}for(const o of orders){const card=document.createElement('article');card.className='order';const head=document.createElement('div');head.className='order-head';const title=document.createElement('strong');title.textContent='Mesa '+o.table+' · '+o.customerName;const badge=document.createElement('span');badge.className='status '+o.status;badge.textContent=statusText(o.status);head.append(title,badge);const details=document.createElement('p');details.className='muted';details.textContent=o.items.map(i=>i.qty+'× '+i.name).join(', ')+' · '+money(o.total);card.append(head,details);if(o.status==='offline'||o.status==='conflict'){const retry=document.createElement('button');retry.className='secondary';retry.textContent=o.status==='conflict'?'Revisar conflito':'Tentar sincronizar';retry.onclick=()=>o.status==='conflict'?alert('O servidor informou conflito. Compare o pedido local com o retorno do backend antes de reenviar.'):syncOne(o.localId);card.append(retry)}if(o.status==='offline'){const edit=document.createElement('button');edit.className='secondary';edit.textContent='Editar rascunho';edit.onclick=()=>openEditDraft(o);card.append(edit)}root.append(card)}}async function saveOrder(){if(editingDraftId){await updateDraft();return}if(!waiterToken){alert('Abra o link individual do garçom antes de registrar pedidos.');return}if(!cart.size){alert('Adicione pelo menos um produto.');return}const customerName=$('#modalCustomer').value.trim();if(!customerName){$('#modalCustomer').focus();alert('Informe o nome do cliente.');return}const items=[...cart.values()].map(i=>({productId:Number(i.product.id),name:i.product.name||i.product.nome,qty:i.qty,unitPrice:Number(i.product.price??i.product.preco??0),additions:(i.additions||[]).map(x=>({id:Number(x.id||x)})).filter(x=>Number.isSafeInteger(x.id)),removals:i.removals||[],note:i.note}));if(editingServerId){if(!navigator.onLine){alert('Edição de pedido já enviado exige conexão.');return}try{await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/pedidos/'+editingServerId,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({items,note:$('#orderNote').value.trim()})});editingServerId=null;cart.clear();renderCart();$('#orderModal').close();switchTab('orders');await loadOrderStatuses();}catch(e){alert(e.message||'Não foi possível editar o pedido.');}return}
const order={ownerToken:waiterToken,localId:uid(),idempotencyKey:uid(),table:Number($('#modalTable').value),customerName,items,note:$('#orderNote').value.trim(),total:[...cart.values()].reduce((sum,it)=>sum+it.qty*(Number((it.product.preco??it.product.price??0))+(it.additions||[]).reduce((v,x)=>v+Number((it.product.adicionais||[]).find(a=>Number(a.id)===Number(x.id||x))?.preco||0),0)),0),status:'offline',createdAt:Date.now(),attempts:0};await putOrder(order);cart.clear();$('#orderNote').value='';renderCart();await renderOrders();$('#orderModal').close();switchTab('orders');if(navigator.onLine)syncOne(order.localId)}async function syncOne(localId){const order=(await allOrders()).find(o=>o.localId===localId);if(!order||order.status==='confirmed'||order.status==='sync'||order.status==='conflict')return;if(!navigator.onLine)return;order.status='sync';order.attempts++;await putOrder(order);await renderOrders();try{
const root='/api/garcom/'+encodeURIComponent(waiterToken)+'/mesas/'+order.table;
const assign=await fetch(root+'/assumir',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clienteNome:order.customerName})});
const assigned=await assign.json().catch(()=>({}));if(!assign.ok){const e=new Error(assigned.error||'Falha ao assumir mesa');e.status=assign.status;throw e;}
const body={clienteNome:order.customerName,items:order.items,note:order.note,idempotencyKey:order.idempotencyKey};
const res=await fetch(root+'/pedidos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const data=await res.json().catch(()=>({}));if(!res.ok){const e=new Error(data.error||'Falha ao enviar pedido');e.status=res.status;throw e;}
order.status='confirmed';order.serverOrderId=data.id;order.confirmedAt=Date.now();order.lastError=null;
}catch(err){order.status=err.status&&err.status<500?'conflict':'offline';order.lastError=String(err.message||err);}await putOrder(order);await renderOrders();if(order.status==='confirmed')void loadOrderStatuses();}
async function syncPending(){if(!navigator.onLine){setConnection();return}const pending=(await allOrders()).filter(o=>o.status==='offline');for(const o of pending)await syncOne(o.localId);setConnection()}function setConnection(){$('#connection').textContent=navigator.onLine?'Online · sincronização disponível':'Offline · pedidos ficam neste aparelho';$('#connection').style.color=navigator.onLine?'#166534':'#a16207'}function updateQr(){const n=Number($('#qrTable').value);const mesa=mesas.find(x=>Number(x.numero)===n);if(!mesa)return;const url=new URL('../',location.href).href+'#/mesa/'+mesa.token;$('#qrUrl').value=url;$('#qrImage').src=navigator.onLine?'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data='+encodeURIComponent(url):'';$('#qrImage').onerror=()=>{$('#qrImage').alt='QR indisponível offline'}}$('#search').addEventListener('input',renderProducts);$('#saveOrder').addEventListener('click',saveOrder);$('#syncBtn').addEventListener('click',syncPending);$('#qrTable').addEventListener('change',updateQr);$('#copyQr').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#qrUrl').value);$('#copyQr').textContent='Endereço copiado';setTimeout(()=>$('#copyQr').textContent='Copiar endereço',1500)}catch{ $('#qrUrl').select();document.execCommand('copy')}});window.addEventListener('online',syncPending);window.addEventListener('offline',setConnection);setConnection();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});openDb().then(async d=>{db=d;await recoverInterruptedSync();await loadProducts();try{await loadMesas();if(navigator.onLine){syncPending();loadDeliveries();loadOrderStatuses()}}catch(e){$('#identity').textContent=e.message;if(!navigator.onLine){try{mesas=JSON.parse(localStorage.getItem('waiter-mesas-cache-'+waiterToken)||'[]');tables.splice(0,tables.length,...mesas.map(x=>Number(x.numero)));populateTables();updateQr();renderTableGrid();}catch{}}}}).catch(e=>{console.error(e);alert('Não foi possível abrir o armazenamento offline neste navegador.')});
let deferredInstall=null;
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


async function loadDeliveries(){if(!navigator.onLine||!waiterToken)return;const root=$('#readyOrders');try{const orders=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/pedidos');root.replaceChildren();const ready=(Array.isArray(orders)?orders:[]).filter(p=>(p.itens||[]).some(i=>i.status==='concluido'));if(!ready.length){root.innerHTML='<p class="muted">Nenhum pedido pronto para entrega.</p>';return;}for(const order of ready){const card=document.createElement('article');card.className='order';const name=document.createElement('strong');name.textContent='Mesa '+(order.mesa||order.mesaNumero||'?')+' · Pedido #'+order.id;card.append(name);const details=document.createElement('p');details.className='muted';details.textContent=(order.itens||[]).filter(i=>i.status==='concluido').map(i=>(i.quantidade||i.qtd||1)+'× '+i.nome).join(', ');card.append(details);const btn=document.createElement('button');btn.textContent='Confirmar entrega';btn.onclick=async()=>{if(!confirm('Confirmar que entregou os itens prontos do pedido #'+order.id+'?'))return;btn.disabled=true;try{await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/pedidos/'+order.id+'/entregar',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await loadDeliveries();}catch(e){alert(e.message);btn.disabled=false;}};card.append(btn);root.append(card)}}catch(e){root.textContent='Não foi possível consultar as entregas: '+e.message;}}
document.querySelector('#refreshDeliveries')?.addEventListener('click',loadDeliveries);
window.addEventListener('online',loadDeliveries);
setInterval(()=>{if(navigator.onLine){void loadDeliveries();void loadOrderStatuses()}},7000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine){void loadDeliveries();void loadOrderStatuses()}});

// Após reiniciar o navegador, uma sincronização interrompida pode ficar em 'sync'.
// Reutiliza a mesma idempotencyKey para recuperar a confirmação sem duplicar.
async function recoverInterruptedSync(){for(const order of await allOrders()){if(order.status==='sync'){order.status='offline';await putOrder(order)}}await renderOrders()}

/* QR Admin · navegação de páginas e fluxo sob demanda */
const pageCopy={
 tables:['Cada mesa, bem cuidada.','Assuma um atendimento ou compartilhe o QR.'],
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
function openOrder(tableNumber){
 editingServerId=null;editingDraftId=null;cart.clear();renderCart();const n=Number(tableNumber||$('#tableSelect').value||tables[0]);if(n)$('#modalTable').value=String(n);
 $('#modalCustomer').value=$('#customerName').value||'';
 $('#modalMessage').textContent='';
 $('#orderModal').showModal();
}
function openQr(n){
 const table=Number(n||$('#modalTable').value||$('#tableSelect').value);
 if(table)$('#qrTable').value=String(table);
 updateQr();$('#qrModal').showModal();
}
async function assumirMesa(n,customer,transferir=false){
 if(!navigator.onLine)throw Error('Para abrir ou transferir uma mesa é preciso estar conectado. Você ainda pode anotar o pedido offline.');
 const table=Number(n);if(!table||!tables.includes(table))throw Error('Selecione uma mesa válida');
 const base='/api/garcom/'+encodeURIComponent(waiterToken)+'/mesas/'+table+'/assumir';
 try{
   const result=await getJson(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clienteNome:customer||undefined,transferir})});
   await loadMesas();return result;
 }catch(e){
   if(e.status===409&&!transferir&&confirm('Esta mesa já tem outro garçom. Deseja transferir a responsabilidade para você?'))return assumirMesa(n,customer,true);
   throw e;
 }
}
async function clickAssume(mode){
 const isModal=mode==='modal';
 const n=Number($(isModal?'#modalTable':'#tableSelect').value);
 const name=$(isModal?'#modalCustomer':'#customerName').value.trim();
 const target=$(isModal?'#modalMessage':'#tableMessage');
 target.textContent='Abrindo atendimento…';
 try{await assumirMesa(n,name);target.textContent='Mesa '+n+' sob seus cuidados. Pode anotar o pedido ou apresentar o QR.';$('#tableSelect').value=String(n);$('#modalTable').value=String(n);if(name){$('#customerName').value=name;$('#modalCustomer').value=name}}
 catch(e){target.textContent=e.message||'Não foi possível assumir a mesa.';}
}
function renderTableGrid(){
 const root=$('#tableGrid');if(!root)return;root.replaceChildren();
 if(!mesas.length){root.textContent='Nenhuma mesa carregada. Conecte-se para atualizar.';return}
 for(const m of mesas){
  const card=document.createElement('button');card.type='button';card.className='table-tile';
  if(m.garcomResponsavelId&&m.garcomResponsavelNome)card.classList.add('taken');
  const title=document.createElement('strong');title.textContent='Mesa '+String(m.numero).padStart(2,'0');
  const desc=document.createElement('small');desc.textContent=m.garcomResponsavelNome?('Atendimento: '+m.garcomResponsavelNome):(m.sessaoId?'Cliente na mesa':'Pronta para atender');
  card.append(title,desc);card.onclick=()=>{$('#tableSelect').value=String(m.numero);$('#modalTable').value=String(m.numero);$('#qrTable').value=String(m.numero);$('#tableMessage').textContent='Mesa '+m.numero+' selecionada.'};
  root.append(card);
 }
}
document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
for(const id of ['newOrderHome','newOrderTables','newOrderOrders'])$('#'+id).addEventListener('click',()=>openOrder());
$('#closeOrder').addEventListener('click',()=>$('#orderModal').close());
$('#closeQr').addEventListener('click',()=>$('#qrModal').close());
$('#showQr').addEventListener('click',()=>openQr($('#tableSelect').value));
$('#modalQr').addEventListener('click',()=>openQr($('#modalTable').value));
$('#assumeTable').addEventListener('click',()=>clickAssume('page'));
$('#modalAssume').addEventListener('click',()=>clickAssume('modal'));
$('#refreshTables').addEventListener('click',()=>loadMesas().catch(e=>{$('#tableMessage').textContent=e.message}));
$('#tableSelect').addEventListener('change',()=>{$('#modalTable').value=$('#tableSelect').value});
$('#orderModal').addEventListener('click',e=>{if(e.target===$('#orderModal'))$('#orderModal').close()});
$('#qrModal').addEventListener('click',e=>{if(e.target===$('#qrModal'))$('#qrModal').close()});

/* Acompanhamento de todas as mesas sob responsabilidade deste garçom. */
let currentWaiterId=null;
let liveOrders=[];
let editingServerId=null;
let firstLiveLoad=true;
const announcedReady=new Set();
const READY_STORAGE='garcom-ready-notified-'+waiterToken;
try{for(const id of JSON.parse(localStorage.getItem(READY_STORAGE)||'[]'))announcedReady.add(Number(id))}catch{}
let readyAlertsEnabled=localStorage.getItem('garcom-ready-alerts-'+waiterToken)==='1';
function renderMyTables(){
 const root=$('#myTables');if(!root)return;root.replaceChildren();
 const mine=mesas.filter(m=>Number(m.garcomResponsavelId)===currentWaiterId&&m.sessaoId);
 $('#myTablesCount').textContent=mine.length+' em atendimento';
 if(!mine.length){const p=document.createElement('p');p.className='muted';p.textContent='Você ainda não assumiu uma mesa. Escolha uma abaixo para começar.';root.append(p);return;}
 for(const m of mine){
  const btn=document.createElement('button');btn.type='button';btn.className='table-tile mine';
  const title=document.createElement('strong');title.textContent='Mesa '+m.numero;
  const info=document.createElement('small');info.textContent=(m.clienteNome||'Cliente não informado')+' · Anotar novo pedido ↗';
  btn.append(title,info);btn.onclick=()=>openOrder(m.numero);root.append(btn);
  const actions=document.createElement('div');actions.className='table-actions';
  const detail=document.createElement('button');detail.className='secondary small';detail.textContent='Ver pedidos';detail.onclick=()=>openOrdersModal(m.numero);
  const leave=document.createElement('button');leave.className='secondary small leave-table';leave.textContent='Deixar mesa';leave.onclick=()=>leaveTable(m.numero);
  actions.append(detail,leave);root.append(actions);
 }
}
let editingDraftId=null;
function openEditDraft(o){
 editingServerId=null;editingDraftId=o.localId;cart.clear();
 for(const i of o.items){const p=products.find(x=>Number(x.id)===Number(i.productId));if(!p){alert('Produto '+i.name+' indisponível no cardápio salvo. Atualize antes de editar.');editingDraftId=null;return}cart.set(String(p.id),{product:p,qty:Number(i.qty)||1,additions:i.additions||[],removals:i.removals||[],note:i.note||''});}
 $('#modalTable').value=String(o.table);$('#modalCustomer').value=o.customerName||'';$('#orderNote').value=o.note||'';renderCart();
 $('#orderModal').showModal();$('#saveOrder').textContent='Atualizar rascunho';
}
async function updateDraft(){
 const o=(await allOrders()).find(x=>x.localId===editingDraftId);
 if(!o||o.status!=='offline'){alert('O pedido já foi enviado e não pode mais ser alterado offline.');return}
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
 editingServerId=Number(o.id);cart.clear();
 for(const i of o.itens){const p=products.find(x=>Number(x.id)===Number(i.productId));if(!p){alert('Atualize o cardápio para editar esse pedido.');return}cart.set(String(p.id),{product:p,qty:Number(i.qty)||1,additions:i.additions||[],removals:i.removals||[],note:i.note||''});}
 $('#modalTable').value=String(o.mesa);$('#modalCustomer').value=o.clienteNome||'';$('#orderNote').value=o.note||'';renderCart();$('#orderModal').showModal();
 $('#modalMessage').textContent='Editando pedido #'+o.id+' · permitido somente antes do preparo.';
 $('#saveOrder').textContent='Salvar alterações';
 
}
function liveLabel(o){
 const statuses=(o.itens||[]).map(i=>i.status);
 if(statuses.every(x=>x==='entregue'))return 'Entregue';
 if(statuses.some(x=>x==='concluido'))return 'Pronto para entrega';
 if(statuses.some(x=>x==='em_producao'))return 'Em preparo';
 return 'Recebido';
}
async function loadOrderStatuses(){
 if(!navigator.onLine||!waiterToken)return;
 try{
   const rows=await getJson('/api/garcom/'+encodeURIComponent(waiterToken)+'/atendimentos');
   const root=$('#modalOrderStatuses');root.replaceChildren();
   if(!rows.length){root.innerHTML='<p class="muted">Nenhum pedido nas suas mesas abertas.</p>'}
   for(const o of rows){
     const showOrder=selectedOrdersTable===null||Number(o.mesa)===selectedOrdersTable;
     const ready=(o.itens||[]).filter(i=>i.status==='concluido');
     const card=document.createElement('article');card.className='order';
     const heading=document.createElement('div');heading.className='order-head';
     const name=document.createElement('strong');name.textContent='Mesa '+o.mesa+' · Pedido #'+o.id;
     const status=document.createElement('span');status.className='status '+(ready.length?'confirmed':'sync');status.textContent=liveLabel(o);
     heading.append(name,status);card.append(heading);
     const items=document.createElement('div');items.className='order-items';
     for(const item of o.itens||[]){
       const line=document.createElement('div');line.className='order-item-line';
       const description=document.createElement('span');description.textContent=(item.qty||1)+'× '+item.nome+' · '+(item.setor==='bar'?'Bar':'Cozinha');
       const state=document.createElement('strong');
       state.className='item-state state-'+item.status;
       state.textContent=({recebido:'Recebido',em_producao:'Em preparo',concluido:'Pronto para entregar',entregue:'Entregue'})[item.status]||item.status;
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
$('#dismissNotificationConsent').addEventListener('click',()=>{localStorage.setItem(CONSENT_SEEN,'1');consentDialog.close()});
$('#requestNotificationPermission').addEventListener('click',async()=>{
 if(!('Notification'in window)){updateNotificationStatus();return}
 try{
   const result=await Notification.requestPermission();
   if(result==='denied'){
     const confirmed=window.confirm('Você recusou as notificações e não receberá avisos por este navegador. Deseja confirmar essa escolha? Você poderá configurar novamente depois nas configurações do site e neste painel.');
     if(confirmed){localStorage.setItem('garcom-notifications-declined-'+waiterToken,'1');$('#consentStatus').textContent='Escolha salva. Você não receberá notificações enquanto a permissão estiver negada. Para reativar, altere a permissão nas configurações do navegador.'}
     else $('#consentStatus').textContent='A permissão foi negada pelo navegador. Para tentar novamente, altere-a nas configurações do site.';
   }else if(result==='granted'){
     localStorage.setItem('garcom-ready-alerts-'+waiterToken,'1');readyAlertsEnabled=true;
     $('#consentStatus').textContent='Permissão concedida. Isso não ativa push em segundo plano: o servidor ainda não implementa subscrição nem envio Web Push.';
   }else $('#consentStatus').textContent='Você ainda não permitiu notificações. Pode decidir depois por este painel.';
 }catch(e){$('#consentStatus').textContent='Não foi possível solicitar permissão neste contexto. Verifique se o site usa HTTPS e tente por uma ação explícita.'}
 localStorage.setItem(CONSENT_SEEN,'1');updateNotificationStatus();
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

let selectedOrdersTable=null;
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
