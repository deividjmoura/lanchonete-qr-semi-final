function renderCustomizeModal(){
  const p=produtos.find(x=>x.id===customizeDraft.productId);
  if(!p)return;
  const escolha=!!customizeDraft.escolha||(typeof productIsEscolha==='function'&&productIsEscolha(p));
  customizeDraft.escolha=escolha;
  const adds=Array.isArray(p.adicionais)?p.adicionais:[];
  const rems=Array.isArray(p.removiveis)?p.removiveis:[];
  const unit=p.preco+customizeDraft.additions.reduce((s,a)=>s+a.preco,0);
  const total=unit*customizeDraft.qty;
  let addsHtml='';
  if(adds.length){
    if(escolha){
      addsHtml=`<div class="opt-group"><h3>Escolha uma opção</h3>${adds.map(a=>{
        const on=customizeDraft.additions.some(x=>x.id===a.id);
        return `<label class="opt-chip${on?' on':''}"><input type="radio" name="escolha-add" ${on?'checked':''} onchange="selectAdd(${a.id})"><span>${esc(a.nome)}</span><span class="opt-price">${Number(a.preco)>0?'+ '+br(a.preco):''}</span></label>`;
      }).join('')}</div>`;
    }else{
      addsHtml=`<div class="opt-group"><h3>Adicionais</h3>${adds.map(a=>{
        const on=customizeDraft.additions.some(x=>x.id===a.id);
        return `<label class="opt-chip${on?' on':''}"><input type="checkbox" ${on?'checked':''} onchange="toggleAdd(${a.id}, this.checked)"><span>${esc(a.nome)}</span><span class="opt-price">+ ${br(a.preco)}</span></label>`;
      }).join('')}</div>`;
    }
  }
  const remsHtml=(!escolha&&rems.length)?`<div class="opt-group"><h3>Remover</h3>${rems.map(r=>{
    const on=customizeDraft.removals.includes(r);
    return `<label class="opt-chip${on?' on':''}"><input type="checkbox" ${on?'checked':''} onchange="toggleRem('${String(r).replace(/'/g,"\\'")}', this.checked)"><span>Sem ${esc(r)}</span></label>`;
  }).join('')}</div>`:'';
  const noteHtml=escolha
    ?`<div class="opt-group"><h3>Observação</h3><input id="custNote" type="text" maxlength="200" placeholder="Ex.: sem gelo, pouco gás" value="${esc(customizeDraft.note)}" oninput="customizeDraft.note=this.value" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(240,235,224,.2);background:rgba(0,0,0,.25);color:#f0ebe0"></div>`
    :`<div class="opt-group"><h3>Observação</h3><input id="custNote" type="text" maxlength="200" placeholder="Ex.: sem cebola, bem passado…" value="${esc(customizeDraft.note)}" oninput="customizeDraft.note=this.value" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(240,235,224,.2);background:rgba(0,0,0,.25);color:#f0ebe0"></div>`;
  const sub=escolha?'escolha o tamanho ou sabor': 'personalize';
  const btnLabel=escolha?'Confirmar escolha':'Adicionar';
  document.getElementById('modal').innerHTML=`<div class="modal-root" role="dialog" aria-modal="true"><div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-sheet"><button class="close" type="button" onclick="closeModal()">×</button><h2>${esc(p.nome)}</h2><p class="muted" style="margin:0 0 12px">${br(p.preco)} · ${sub}</p><div class="qty-row" style="margin-bottom:8px"><button type="button" onclick="custQty(-1)">−</button><span>${customizeDraft.qty}</span><button type="button" onclick="custQty(1)">+</button></div>${addsHtml}${remsHtml}${noteHtml}<button class="btn primary" style="width:100%;margin-top:16px;min-height:48px" type="button" onclick="confirmCustomize()">${btnLabel} · ${br(total)}</button></div></div>`;
  document.body.classList.add('modal-open');
  cartOpen=false;sessaoOpen=false;
}
function custQty(d){if(!customizeDraft)return;customizeDraft.qty=Math.max(1,Math.min(20,customizeDraft.qty+d));renderCustomizeModal();}
function toggleAdd(id,on){const p=produtos.find(x=>x.id===customizeDraft.productId);const a=(p.adicionais||[]).find(x=>x.id===id);if(!a)return;if(on){if(!customizeDraft.additions.some(x=>x.id===id))customizeDraft.additions.push({id:a.id,nome:a.nome,preco:Number(a.preco)});}else{customizeDraft.additions=customizeDraft.additions.filter(x=>x.id!==id);}renderCustomizeModal();}
function selectAdd(id){const p=produtos.find(x=>x.id===customizeDraft.productId);const a=(p.adicionais||[]).find(x=>x.id===id);if(!a)return;customizeDraft.additions=[{id:a.id,nome:a.nome,preco:Number(a.preco)}];renderCustomizeModal();}
function toggleRem(nome,on){if(on){if(!customizeDraft.removals.includes(nome))customizeDraft.removals.push(nome);}else{customizeDraft.removals=customizeDraft.removals.filter(x=>x!==nome);}renderCustomizeModal();}
function confirmCustomize(){
  if(!customizeDraft)return;
  if(customizeDraft.escolha){
    const p=produtos.find(x=>x.id===customizeDraft.productId);
    if(p&&p.adicionais&&p.adicionais.length&&!customizeDraft.additions.length){
      if(typeof showToast==='function')showToast('Escolha uma opção');
      else alert('Escolha uma opção');
      return;
    }
  }
  const id=customizeDraft.productId;
  const key=itemKey(id,customizeDraft.additions,customizeDraft.removals,customizeDraft.note);
  const existing=cart.find(x=>x.key===key);
  if(existing)existing.qty+=customizeDraft.qty;
  else cart.push({key,productId:id,qty:customizeDraft.qty,additions:customizeDraft.additions.slice(),removals:customizeDraft.removals.slice(),note:customizeDraft.note||''});
  updateCartPill();bounceBurger();
  const p=produtos.find(x=>x.id===id);
  showToast((p&&p.nome||'Item')+' adicionado');
  closeModal();
}
