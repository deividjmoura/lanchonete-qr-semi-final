(() => {
  if (window.confirmarQR) return;
  /* Identidade "Passe": folha plana, cantos curtos, régua de 1px. No PWA do
     garçom os tokens vêm de design-tokens.css; nas páginas estáticas antigas
     (admin.html, caixa.html), que não carregam esse arquivo, vale o segundo
     valor de cada var() — a mesma identidade, em tinta. */
  const css = `
    .qr-confirm-overlay{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:18px;background:var(--surface-overlay,rgba(2,8,15,.76))}
    .qr-confirm-dialog{width:min(480px,100%);max-height:min(86dvh,760px);overflow:auto;border:1px solid var(--line-strong,#5a7b9c);border-radius:var(--radius-lg,10px);background:var(--surface-raised,#0f2338);color:var(--text,#eef2ec);box-shadow:var(--shadow-modal,0 28px 64px -24px rgba(2,8,15,.8));padding:22px;font:inherit}
    .qr-confirm-head{display:flex;align-items:flex-start;gap:12px;padding-right:32px}
    .qr-confirm-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:var(--radius-sm,5px);background:var(--plaque,#e4cc94);color:var(--plaque-text,#081726);font-size:20px;font-weight:800;line-height:1}
    .qr-confirm-eyebrow{margin:0 0 4px;color:var(--text-muted,#a9bccb);font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}
    .qr-confirm-title{margin:0;font-size:20px;font-stretch:118%;font-weight:800;letter-spacing:-.012em;line-height:1.15}
    .qr-confirm-message{margin:16px 0 0;color:var(--text-muted,#a9bccb);font-size:14px;line-height:1.6;white-space:pre-wrap}
    .qr-confirm-input{display:block;width:100%;min-height:48px;margin-top:12px;padding:10px 12px;border:1px solid var(--line-strong,#5a7b9c);border-radius:var(--radius-sm,5px);background:var(--surface-sunken,#06121f);color:inherit;font:inherit}
    .qr-confirm-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:22px;padding-top:16px;border-top:1px solid var(--line,#213b55)}
    .qr-confirm-actions button{min-height:48px;padding:10px 16px;border:1px solid var(--line-strong,#5a7b9c);border-radius:var(--radius-sm,5px);background:transparent;color:inherit;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
    .qr-confirm-actions .qr-confirm-primary{border-color:var(--brand,#6cdccc);background:var(--brand,#6cdccc);color:var(--brand-contrast,#06222b)}
    .qr-confirm-actions .qr-confirm-danger{border-color:var(--status-danger,#ffb0a6);background:var(--status-danger,#ffb0a6);color:var(--status-danger-contrast,#081726)}
    .qr-confirm-actions button:focus-visible,.qr-confirm-input:focus-visible{outline:2px solid var(--focus-ring,#9be8dc);outline-offset:2px}
    @media(max-width:480px){.qr-confirm-dialog{padding:18px}.qr-confirm-title{font-size:18px}}
  `;
  function estilos(){if(document.getElementById('qr-confirm-styles'))return;const s=document.createElement('style');s.id='qr-confirm-styles';s.textContent=css;document.head.appendChild(s)}
  function abrir({title,message,confirmText='Confirmar',cancelText='Cancelar',danger=false,inputLabel='',placeholder='',expectedText=''}){
    estilos();
    return new Promise(resolve=>{
      const overlay=document.createElement('div');overlay.className='qr-confirm-overlay';
      const dialog=document.createElement('section');dialog.className='qr-confirm-dialog';dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','qr-confirm-title');dialog.setAttribute('aria-describedby','qr-confirm-message');
      const head=document.createElement('div');head.className='qr-confirm-head';
      const icon=document.createElement('span');icon.className='qr-confirm-icon';icon.textContent=danger?'!':'?';
      const titleWrap=document.createElement('div');
      const eyebrow=document.createElement('p');eyebrow.className='qr-confirm-eyebrow';eyebrow.textContent='Confirmação necessária';
      const h=document.createElement('h2');h.id='qr-confirm-title';h.className='qr-confirm-title';h.textContent=title;
      titleWrap.append(eyebrow,h);head.append(icon,titleWrap);
      const body=document.createElement('p');body.id='qr-confirm-message';body.className='qr-confirm-message';body.textContent=message;
      dialog.append(head,body);
      let input=null;
      if(inputLabel){const label=document.createElement('label');label.className='qr-confirm-message';label.textContent=inputLabel;input=document.createElement('input');input.className='qr-confirm-input';input.placeholder=placeholder;input.autocomplete='off';input.addEventListener('input',()=>input.setCustomValidity(''));label.append(input);dialog.append(label)}
      const actions=document.createElement('div');actions.className='qr-confirm-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent=cancelText;
      const yes=document.createElement('button');yes.type='button';yes.textContent=confirmText;yes.className=danger?'qr-confirm-danger':'qr-confirm-primary';
      actions.append(cancel,yes);dialog.append(actions);overlay.append(dialog);document.body.append(overlay);
      const previous=document.activeElement;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
      let done=false;
      const finish=value=>{if(done)return;done=true;document.removeEventListener('keydown',key);document.body.style.overflow=overflow;overlay.remove();if(previous&&previous.focus)previous.focus();resolve(value)};
      const key=e=>{if(e.key==='Escape'){e.preventDefault();finish(inputLabel?null:false)}else if(e.key==='Tab'){const nodes=input?[input,cancel,yes]:[cancel,yes];const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
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
