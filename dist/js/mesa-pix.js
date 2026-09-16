// PIX na conta: QR no card do pedido + avisar caixa (parcial); total fora
(function () {
  function whenReady(fn) {
    if (typeof openSessao === 'function' && window.LQRPix) return fn();
    setTimeout(function () { whenReady(fn); }, 40);
  }

  function getPayPref() {
    try {
      const token = location.pathname.split('/').filter(Boolean).pop();
      return sessionStorage.getItem('lq-pay-pref-' + token) || window._payPref || '';
    } catch (_) {
      return window._payPref || '';
    }
  }

  function money(v) {
    return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  }

  function pixBoxHtml(valor, opts) {
    opts = opts || {};
    const title = opts.title || 'Pagar no PIX';
    if (!LQRPix.disponivel()) {
      return (
        '<div class="pix-box">' +
        '<div class="pix-box__title">' + title + '</div>' +
        '<p class="muted" style="font-size:.82rem;margin:0">PIX não configurado no servidor. Peça maquininha ao garçom.</p>' +
        '</div>'
      );
    }
    const payload = LQRPix.montarPayload(valor);
    if (!payload) {
      return (
        '<div class="pix-box">' +
        '<div class="pix-box__title">' + title + '</div>' +
        '<p class="muted" style="font-size:.82rem;margin:0">Não foi possível gerar o código PIX.</p>' +
        '</div>'
      );
    }
    const qr = LQRPix.qrUrl(valor);
    return (
      '<div class="pix-box">' +
      '<div class="pix-box__title">' + title + ' · <b>' + money(valor) + '</b></div>' +
      '<div class="pix-box__row">' +
      '<img class="pix-box__qr" src="' + qr + '" alt="QR PIX" width="120" height="120" loading="lazy">' +
      '<div class="pix-box__copy">' +
      '<button type="button" class="btn pix-copy-btn">Copiar código PIX</button>' +
      '<p class="muted" style="font-size:.75rem;margin:8px 0 0">Cole no app do banco</p>' +
      '</div></div>' +
      (opts.avisoHtml || '') +
      '</div>'
    );
  }

  function wireCopy(root, valor) {
    if (!root || !window.LQRPix) return;
    const payload = LQRPix.montarPayload(valor);
    const btn = root.querySelector('.pix-copy-btn');
    if (btn && payload) {
      btn.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(payload).then(function () {
            btn.textContent = 'Copiado!';
            setTimeout(function () { btn.textContent = 'Copiar código PIX'; }, 1600);
          }).catch(function () {
            prompt('Copie o código PIX:', payload);
          });
        } else {
          prompt('Copie o código PIX:', payload);
        }
      });
    }
  }

  function wireAviso(btn, payload) {
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = 'Avisando…';
      try {
        const token = location.pathname.split('/').filter(Boolean).pop();
        const r = await fetch('/api/mesas/' + token + '/pix-informado', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = await r.json().catch(function () { return {}; });
        if (!r.ok) {
          alert(d.error || 'Não foi possível avisar');
          btn.disabled = false;
          btn.textContent = prev;
          return;
        }
        if (typeof showToast === 'function') {
          showToast('Aguardando confirmação do caixa · ' + money(d.valorAvisado || payload.valor || 0), 3600);
        }
        // Atualiza conta: mostra “aguardando” e valores quando o caixa confirmar (SSE)
        if (typeof loadSessao === 'function') await loadSessao();
        else if (typeof openSessao === 'function' && window.sessaoData) openSessao();
      } catch (e) {
        alert('Falha de rede');
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
  }

  function waitingHtml(valor, quem) {
    return (
      '<div class="pix-box pix-box--waiting">' +
      '<div class="pix-box__title">Aguardando confirmação do caixa</div>' +
      '<p class="muted" style="font-size:.85rem;margin:0 0 6px">Valor informado: <b>' +
      money(valor) +
      '</b>' +
      (quem ? ' · ' + String(quem).replace(/</g, '') : '') +
      '</p>' +
      '<p class="muted" style="font-size:.8rem;margin:0">Assim que o caixa confirmar, o valor some do total desta mesa.</p>' +
      '</div>'
    );
  }

  function paidOkHtml(msg) {
    return (
      '<div class="pix-box pix-box--ok">' +
      '<div class="pix-box__title">Pagamento registrado</div>' +
      '<p class="muted" style="font-size:.85rem;margin:0">' +
      (msg || 'O caixa confirmou o PIX. Obrigado!') +
      '</p></div>'
    );
  }

  function findPendAviso(s, pedidoId) {
    const list = Array.isArray(s.pixAvisos) ? s.pixAvisos : [];
    return list.find(function (a) {
      if (a.status && a.status !== 'pendente') return false;
      if (pedidoId) return Number(a.pedidoId) === Number(pedidoId);
      // total da mesa: aviso sem pedidoId
      return a.pedidoId == null || a.pedidoId === '' || Number(a.pedidoId) === 0;
    });
  }

  function injectPix(s) {
    s = s || window.sessaoData || {};
    if (!window.LQRPix) return;
    const pref = getPayPref();
    const cliente =
      (typeof getClienteNome === 'function' && getClienteNome()) ||
      s.clienteNome ||
      '';

    document.querySelectorAll('.pix-pedido').forEach(function (el) {
      el.removeAttribute('data-pix-ready');
      const valor = Number(el.getAttribute('data-valor') || 0);
      const status = el.getAttribute('data-status') || 'entregue';
      const pedidoId = Number(el.getAttribute('data-pedido-id') || 0);
      if (status !== 'entregue' || !(valor > 0.009)) {
        el.innerHTML = '';
        el.setAttribute('data-pix-ready', '1');
        return;
      }
      const pend = findPendAviso(s, pedidoId);
      if (pend) {
        el.innerHTML = waitingHtml(pend.valor || valor, pend.clienteNome || cliente);
        el.setAttribute('data-pix-ready', '1');
        return;
      }
      if (pref === 'garcom') {
        el.innerHTML =
          '<div class="pix-box"><p class="muted" style="margin:0;font-size:.85rem">Você pediu maquininha/troco. Se preferir PIX, use o botão abaixo do total ou mude a preferência.</p></div>';
        el.setAttribute('data-pix-ready', '1');
        return;
      }
      const avisoHtml =
        '<button type="button" class="btn primary pix-aviso-btn" style="width:100%;margin-top:12px">' +
        'Já paguei este pedido no PIX · avisar o caixa' +
        '</button>' +
        '<p class="muted" style="font-size:.75rem;margin:8px 0 0">O caixa confirma e desconta este valor do total da mesa.</p>';
      el.innerHTML = pixBoxHtml(valor, { title: 'PIX deste pedido', avisoHtml: avisoHtml });
      el.setAttribute('data-pix-ready', '1');
      wireCopy(el, valor);
      wireAviso(el.querySelector('.pix-aviso-btn'), {
        pedidoId: pedidoId || undefined,
        valor: valor,
        clienteNome: cliente,
      });
    });

    const totalEl = document.querySelector('.pix-mesa-total');
    if (totalEl) {
      totalEl.removeAttribute('data-pix-ready');
      const pago = Number(s.valorPago || 0);
      const rest =
        s.valorRestante != null
          ? Number(s.valorRestante)
          : Math.max(0, Number(s.totalDevido || 0) - pago);

      const pendTotal = findPendAviso(s, null);
      // também considerar qualquer pendente de total (sem pedido) ou flag da sessão
      const anyPend = (Array.isArray(s.pixAvisos) ? s.pixAvisos : []).filter(function (a) {
        return !a.status || a.status === 'pendente';
      });

      if (!(rest > 0.009)) {
        totalEl.innerHTML = paidOkHtml(
          pago > 0.009
            ? 'Conta quitada no sistema (R$ ' + money(pago).replace('R$ ', '') + ' pagos).'
            : 'Nada a pagar no momento (só entram itens já <b>entregues</b>).'
        );
        totalEl.setAttribute('data-pix-ready', '1');
        return;
      }

      if (pendTotal || (s.pixInformadoEm && anyPend.some(function (a) { return !a.pedidoId; }))) {
        const av = pendTotal || anyPend.find(function (a) { return !a.pedidoId; }) || anyPend[0];
        totalEl.innerHTML = waitingHtml((av && av.valor) || rest, (av && av.clienteNome) || cliente);
        totalEl.setAttribute('data-pix-ready', '1');
        return;
      }

      if (pref === 'garcom') {
        totalEl.innerHTML =
          '<div class="pix-box">' +
          '<div class="pix-box__title">Pagamento com o garçom</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0 0 10px">A pagar: <b>' +
          money(rest) +
          '</b></p>' +
          '<button type="button" class="btn" id="payPrefSwitchPix" style="width:100%">Prefiro pagar com PIX</button>' +
          '</div>';
        const sw = totalEl.querySelector('#payPrefSwitchPix');
        if (sw) {
          sw.onclick = function () {
            try {
              const token = location.pathname.split('/').filter(Boolean).pop();
              sessionStorage.setItem('lq-pay-pref-' + token, 'pix');
            } catch (_) {}
            window._payPref = 'pix';
            totalEl.removeAttribute('data-pix-ready');
            document.querySelectorAll('.pix-pedido').forEach(function (el) {
              el.removeAttribute('data-pix-ready');
            });
            injectPix(s);
          };
        }
        totalEl.setAttribute('data-pix-ready', '1');
        return;
      }

      if (LQRPix.disponivel()) {
        const avisoHtml =
          '<button type="button" class="btn primary pix-aviso-btn" style="width:100%;margin-top:12px" id="pixJaPagueiBtn">' +
          'Já paguei o total no PIX · avisar o caixa' +
          '</button>';
        totalEl.innerHTML = pixBoxHtml(rest, { title: 'PIX do total da conta', avisoHtml: avisoHtml });
        wireCopy(totalEl, rest);
        wireAviso(totalEl.querySelector('.pix-aviso-btn'), {
          valor: rest,
          clienteNome: cliente,
        });
      } else {
        totalEl.innerHTML =
          '<div class="pix-box"><div class="pix-box__title">Pagamento</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0">Configure PIX_CHAVE no servidor.</p></div>';
      }
      totalEl.setAttribute('data-pix-ready', '1');
    }
  }

  whenReady(function () {
    window._afterOpenSessao = function (s) {
      // limpa flags para re-injetar após re-render da conta
      document.querySelectorAll('.pix-pedido, .pix-mesa-total').forEach(function (el) {
        el.removeAttribute('data-pix-ready');
      });
      if (window.LQRPix && LQRPix.config) {
        injectPix(s);
      } else {
        LQRPix.loadConfig().then(function () { injectPix(s); });
      }
    };
    LQRPix.loadConfig().then(function () {
      if (typeof sessaoOpen !== 'undefined' && sessaoOpen && window.sessaoData) {
        injectPix(window.sessaoData);
      }
    });
  });
})();
