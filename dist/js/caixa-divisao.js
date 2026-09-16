// Divisão de conta no caixa (pagamentos parciais)
(function () {
  function money(n) {
    return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
  }
  function parseMoneyInput(el) {
    if (!el) return 0;
    const n = Number(String(el.value || '0').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : 0;
  }
  function refreshSplitHint(id) {
    const nEl = document.getElementById('split-n-' + id);
    const out = document.getElementById('split-each-' + id);
    const parcial = document.getElementById('parcial-' + id);
    if (!nEl || !out) return;
    const n = Math.max(2, Math.min(20, Number(nEl.value) || 2));
    const rest = parseMoneyInput(parcial);
    out.textContent = n + ' × ' + money(Number((rest / n).toFixed(2)));
  }
  async function registrarParcial(id) {
    const radio = document.querySelector('input[name="pay-' + id + '"]:checked');
    if (!radio) {
      if (typeof toast === 'function') toast('Escolha a forma de pagamento', 'err');
      return;
    }
    const el = document.getElementById('parcial-' + id);
    const valor = parseMoneyInput(el);
    if (valor <= 0) {
      if (typeof toast === 'function') toast('Informe o valor', 'err');
      return;
    }
    try {
      const res = await fetch('/api/caixa/sessoes/' + id + '/pagamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: valor, formaPagamento: radio.value }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        if (typeof toast === 'function') toast(data.error || 'Falha', 'err');
        return;
      }
      if (typeof toast === 'function')
        toast('Pago ' + money(valor) + ' · resta ' + money(data.valorRestante), 'ok');
      if (typeof load === 'function') await load();
    } catch (e) {
      if (typeof toast === 'function') toast('Erro de rede', 'err');
    }
  }
  const _obs = new MutationObserver(function () {
    document.querySelectorAll('article.sessao-card[data-id]').forEach(function (art) {
      if (art.querySelector('.split-box')) return;
      const id = art.getAttribute('data-id');
      const restante = Number(art.getAttribute('data-restante') || art.getAttribute('data-total') || 0);
      const pago = Number(art.getAttribute('data-pago') || 0);
      const box = document.createElement('div');
      box.className = 'split-box';
      box.style.cssText =
        'margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface-2)';
      box.innerHTML =
        '<div style="font-weight:700">✂️ Divisão de conta</div>' +
        '<div class="muted" style="font-size:.8rem;margin-top:4px">Pago ' +
        money(pago) +
        ' · restante ' +
        money(restante) +
        '. Ao fechar, o que faltar é quitado.</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px">' +
        '<label class="muted" style="font-size:.8rem">Dividir por <input type="number" min="2" max="20" value="2" id="split-n-' +
        id +
        '" style="width:64px;padding:6px"></label>' +
        '<span id="split-each-' +
        id +
        '" style="font-weight:700;font-size:.9rem"></span>' +
        '<button class="btn" type="button" data-fill-share="' +
        id +
        '">Usar valor/pessoa</button>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px">' +
        '<label class="muted" style="font-size:.8rem">Pagar R$ <input type="number" min="0.01" step="0.01" id="parcial-' +
        id +
        '" value="' +
        restante.toFixed(2) +
        '" style="width:100px;padding:6px"></label>' +
        '<button class="btn" type="button" data-pay-partial="' +
        id +
        '">Registrar pagamento</button>' +
        '</div>';
      const actions = art.querySelector('.actions');
      if (actions) art.insertBefore(box, actions);
      else art.appendChild(box);
      refreshSplitHint(id);
    });
  });
  function start() {
    const lista = document.getElementById('lista');
    if (!lista) return setTimeout(start, 100);
    _obs.observe(lista, { childList: true, subtree: true });
    lista.addEventListener('click', function (ev) {
      const fill = ev.target.closest('[data-fill-share]');
      if (fill) {
        const id = fill.getAttribute('data-fill-share');
        const nEl = document.getElementById('split-n-' + id);
        const parcial = document.getElementById('parcial-' + id);
        const n = Math.max(2, Math.min(20, Number(nEl && nEl.value) || 2));
        const rest = parseMoneyInput(parcial);
        if (parcial) parcial.value = (rest / n).toFixed(2);
        refreshSplitHint(id);
        return;
      }
      const part = ev.target.closest('[data-pay-partial]');
      if (part) registrarParcial(part.getAttribute('data-pay-partial'));
    });
    lista.addEventListener('input', function (ev) {
      if (ev.target.id && ev.target.id.indexOf('split-n-') === 0) {
        refreshSplitHint(ev.target.id.replace('split-n-', ''));
      }
    });
  }
  start();
})();
