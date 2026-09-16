/** Compat: redireciona para voz-ops.js (caixa/cozinha/garçom). */
(function () {
  if (document.currentScript) {
    var s = document.createElement('script');
    s.src = '/js/voz-ops.js';
    s.async = false;
    document.currentScript.parentNode.insertBefore(s, document.currentScript.nextSibling);
  }
})();
