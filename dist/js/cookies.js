/**
 * Aviso de cookies — fixo no rodapé até o usuário responder.
 */
(function () {
  var KEY = 'lq-cookie-ok';
  function answered() {
    try {
      var v = localStorage.getItem(KEY);
      return v === '1' || v === '0';
    } catch (_) { return false; }
  }
  function accept() {
    try { localStorage.setItem(KEY, '1'); } catch (_) {}
    var el = document.getElementById('lqCookieBanner');
    if (el) el.remove();
  }
  function decline() {
    try { localStorage.setItem(KEY, '0'); } catch (_) {}
    var el = document.getElementById('lqCookieBanner');
    if (el) el.remove();
  }
  function showBanner() {
    if (answered()) return;
    if (document.getElementById('lqCookieBanner')) return;
    var bar = document.createElement('div');
    bar.id = 'lqCookieBanner';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<div class="lq-cookie-inner">' +
      '<p class="lq-cookie-text">Nosso site usa <strong>cookies</strong> e armazenamento local apenas para lembrar preferências neste aparelho ' +
      '(categoria do cardápio e pedidos abertos na conta). Não utilizamos para anúncios ou rastreamento.</p>' +
      '<p class="lq-cookie-actions">' +
      '<a href="#" class="lq-cookie-ok" role="button">Aceitar</a>' +
      '<span class="lq-cookie-sep" aria-hidden="true">·</span>' +
      '<a href="#" class="lq-cookie-no" role="button">Agora não</a>' +
      '</p></div>';
    document.body.appendChild(bar);
    bar.querySelector('.lq-cookie-ok').addEventListener('click', function (e) { e.preventDefault(); accept(); });
    bar.querySelector('.lq-cookie-no').addEventListener('click', function (e) { e.preventDefault(); decline(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBanner);
  else showBanner();
  window.LQRCookies = {
    accepted: function () { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; } },
    accept: accept,
    decline: decline,
  };
})();
