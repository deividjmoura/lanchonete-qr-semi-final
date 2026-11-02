(() => {
  if (window.confirmarQR) return;
  const css = `
    .qr-confirm-overlay{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:18px;background:rgba(5,8,18,.68);backdrop-filter:blur(7px)}
    .qr-confirm-dialog{width:min(480px,100%);max-height:min(86dvh,760px);overflow:auto;border:1px solid var(--line-strong,var(--stage-line-4,#46516a));border-radius:18px;background:var(--surface-raised,var(--stage-panel,#171d2a));color:var(--text,var(--stage-ink,#f4f6ff));box-shadow:0 28px 90px rgba(0,0,0,.42);padding:24px;font:inherit}
    .qr-confirm-head{display:flex;align-items:flex-start;gap:13px;padding-right:32px}
    .qr-confirm-icon{display:grid;place-items:center;flex:none;width:42px;height:42px;border:1px solid var(--brand-border,var(--stage-violet-soft,#5b4aa0));border-radius:13px;background:var(--brand-surface,var(--stage-violet-soft,#28213f));color:var(--brand-ink,var(--stage-violet-text,#c4b5fd));font-size:21px}
    .qr-confirm-eyebrow{margin:0 0 4px;color:var(--text-muted,var(--stage-ink-muted,#9aa4b8));font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
    .qr-confirm-title{margin:0;font-size:20px;font-weight:800;line-height:1.2}
    .qr-confirm-message{margin:18px 0 0;color:var(--text-muted,var(--stage-ink-muted,#b5bdcd));font-size:13px;line-height:1.65;white-space:pre-wrap}
    .qr-confirm-input{display:block;width:100%;min-height:44px;margin-top:14px;padding:10px 12px;border:1px solid var(--line,var(--stage-line-4,#46516a));border-radius:9px;background:var(--surface-sunken,var(--stage-inset,#111724));color:inherit;font:inherit}
    .qr-confirm-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:9px;margin-top:24px}
    .qr-confirm-actions button{min-height:42px;padding:9px 15px;border:1px solid var(--line,var(--stage-line-4,#46516a));border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:750;cursor:pointer}
    .qr-confirm-actions .qr-confirm-primary{border-color:var(--brand,var(--stage-violet,#8170d8));background:var(--brand,var(--stage-violet,#8170d8));color:var(--brand-contrast,#fff)}
    .qr-confirm-actions .qr-confirm-danger{border-color:var(--status-danger,var(--stage-danger-border,#b84b60));background:var(--status-danger,var(--stage-danger-surface,#57202d));color:var(--status-danger-contrast,#fff)}
    .qr-confirm-actions button:focus-visible,.qr-confirm-input:focus-visible{outline:3px solid var(--focus,var(--stage-focus,#9f8cff));outline-offset:3px}
    @media(max-width:480px){.qr-confirm-dialog{padding:20px}.qr-confirm-title{font-size:18px}}
  `;
  function estilos(){if(document.getElementById('qr-confirm-styles'))return;const s=document.createElement('style');s.id='qr-confirm-styles';s.textContent=css;document.head.appendChild(s)}
  function abrir({title,message,confirmText='Confirmar',cancelText='Cancelar',danger=false,inputLabel='',placeholder='',expectedText=''}){
    estilos();
    return new Promise(resolve=>{
      const overlay=document.createElement('div');overlay.className='qr-confirm-overlay';
      const dialog=document.createElement('section');dialog.className='qr-confirm-dialog';dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');
      const head=document.createElement('div');head.className='qr-confirm-head';
      const icon=document.createElement('span');icon.className='qr-confirm-icon';icon.textContent=danger?'!':'?';
      const titleWrap=document.createElement('div');
      const eyebrow=document.createElement('p');eyebrow.className='qr-confirm-eyebrow';eyebrow.textContent='Confirmação necessária';
      const h=document.createElement('h2');h.className='qr-confirm-title';h.textContent=title;
      titleWrap.append(eyebrow,h);head.append(icon,titleWrap);
      const body=document.createElement('p');body.className='qr-confirm-message';body.textContent=message;
      dialog.append(head,body);
      let input=null;
      if(inputLabel){const label=document.createElement('label');label.className='qr-confirm-message';label.textContent=inputLabel;input=document.createElement('input');input.className='qr-confirm-input';input.placeholder=placeholder;input.autocomplete='off';label.append(input);dialog.append(label)}
      const actions=document.createElement('div');actions.className='qr-confirm-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent=cancelText;
      const yes=document.createElement('button');yes.type='button';yes.textContent=confirmText;yes.className=danger?'qr-confirm-danger':'qr-confirm-primary';
      actions.append(cancel,yes);dialog.append(actions);overlay.append(dialog);document.body.append(overlay);
      const previous=document.activeElement;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
      let done=false;
      const finish=value=>{if(done)return;done=true;document.removeEventListener('keydown',key);document.body.style.overflow=overflow;overlay.remove();if(previous&&previous.focus)previous.focus();resolve(value)};
      const key=e=>{if(e.key==='Escape'){e.preventDefault();finish(inputLabel?null:false)}else if(e.key==='Tab'){const nodes=[cancel,yes,...(input?[input]:[])];const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
      cancel.addEventListener('click',()=>finish(inputLabel?null:false));
      yes.addEventListener('click',()=>{if(inputLabel){if(input.value!==expectedText){input.setCustomValidity('Digite exatamente '+expectedText+' para confirmar.');input.reportValidity();return}finish(input.value)}else finish(true)});
      overlay.addEventListener('click',e=>{if(e.target===overlay)finish(inputLabel?null:false)});
      document.addEventListener('keydown',key);
      (input||yes).focus();
    });
  }
  window.confirmarQR=(title,message,options={})=>abrir({title,message,...options});
  window.solicitarTextoQR=(title,message,options={})=>abrir({title,message,inputLabel:options.inputLabel||'Texto de confirmação',placeholder:options.placeholder||'',expectedText:options.expectedText||'',confirmText:options.confirmText||'Confirmar exclusão',danger:true,...options});
})();
