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
  const pendingAttempts = new Map();
  function attemptStorageKey(id) { return 'qradmin:caixa:pagamento-parcial:' + String(id); }
  function newIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'pay-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  function readAttempt(id) {
    const key = String(id);
    if (pendingAttempts.has(key)) return pendingAttempts.get(key);
    try {
      const raw = localStorage.getItem(attemptStorageKey(id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Number.isFinite(parsed.valor) && parsed.formaPagamento && parsed.idempotencyKey) {
          pendingAttempts.set(key, parsed);
          return parsed;
        }
      }
    } catch (_) {}
    return null;
  }
  function getAttempt(id, valor, formaPagamento) {
    const existing = readAttempt(id);
    if (existing) {
      if (Number(existing.valor) === Number(valor) && existing.formaPagamento === formaPagamento) return existing;
      if (typeof toast === 'function') {
        toast('Há uma tentativa de pagamento pendente (' + money(existing.valor) + ' · ' + existing.formaPagamento + '). Reenvie os mesmos dados para resolver antes de alterar o valor.', 'err');
      }
      return null;
    }
    const attempt = { valor: Number(valor), formaPagamento, idempotencyKey: newIdempotencyKey() };
    pendingAttempts.set(String(id), attempt);
    try { localStorage.setItem(attemptStorageKey(id), JSON.stringify(attempt)); } catch (_) {}
    return attempt;
  }
  function clearAttempt(id) {
    pendingAttempts.delete(String(id));
    try { localStorage.removeItem(attemptStorageKey(id)); } catch (_) {}
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
    const attempt = getAttempt(id, valor, radio.value);
    if (!attempt) return;
    const button = document.querySelector('[data-pay-partial="' + id + '"]');
    if (button) button.disabled = true;
    try {
      const res = await fetch('/api/caixa/sessoes/' + id + '/pagamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: valor, formaPagamento: radio.value, idempotencyKey: attempt.idempotencyKey }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        // Erros 4xx são rejeições conhecidas; rede/5xx podem ocorrer depois do
        // commit, então preservamos a chave para reconciliar pelo mesmo retry.
        if (res.status >= 400 && res.status < 500) clearAttempt(id);
        if (typeof toast === 'function') toast(data.error || 'Falha', 'err');
        return;
      }
      clearAttempt(id);
      if (typeof toast === 'function')
        toast('Pago ' + money(valor) + ' · resta ' + money(data.valorRestante), 'ok');
      if (typeof load === 'function') {
        try { await load(); }
        catch (_) {
          if (typeof toast === 'function') toast('Pagamento registrado, mas a tela não atualizou. Atualize a lista; não registre o mesmo valor novamente.', 'err');
        }
      }
    } catch (e) {
      if (typeof toast === 'function') toast('Erro de rede. Reenvie os mesmos dados para reutilizar a tentativa.', 'err');
    } finally {
      if (button) button.disabled = false;
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
