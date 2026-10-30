
/* UI estável: scrollbar gutter + altura de fundo sem pulso */
(function () {
  function sbw() {
    const w = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--sbw', (w > 0 ? w : 0) + 'px');
  }
  sbw();
  window.addEventListener('orientationchange', function () {
    setTimeout(sbw, 200);
  });
})();
/**
 * LQRRealtime — SSE com debounce, reconnect e dirty-loader.
 * Evita descartar eventos durante load/advance e reduz latência visual.
 */
(function (global) {
  'use strict';

  function createLoader(fn) {
    let loading = false;
    let dirty = false;
    return async function load() {
      if (loading) {
        dirty = true;
        return;
      }
      loading = true;
      try {
        do {
          dirty = false;
          await fn();
        } while (dirty);
      } finally {
        loading = false;
      }
    };
  }

  function connect(onUpdate, opts) {
    opts = opts || {};
    var fallbackMs = opts.fallbackMs != null ? opts.fallbackMs : 20000;
    var debounceMs = opts.debounceMs != null ? opts.debounceMs : 150;
    var es = null, debounce = null, reconnect = null, fallback = null, closed = false, failures = 0;
    function schedule() {
      if (closed) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(function () { debounce = null; Promise.resolve().then(onUpdate).catch(function (e) { console.error(e); }); }, debounceMs);
    }
    function start() {
      if (closed) return;
      if (typeof EventSource === 'undefined') { schedule(); return; }
      try {
        if (es) es.close();
        var query = new URLSearchParams();
        if (opts.mesa) query.set('mesa', opts.mesa);
        if (opts.garcom) query.set('garcom', opts.garcom);
        es = new EventSource('/api/events' + (query.toString() ? '?' + query.toString() : ''));
        es.addEventListener('hello', function () { failures = 0; schedule(); });
        es.addEventListener('update', schedule);
        es.onerror = function () {
          if (closed) return;
          if (es) es.close(); es = null;
          failures++;
          if (reconnect) clearTimeout(reconnect);
          reconnect = setTimeout(start, Math.min(30000, 1000 * Math.pow(2, Math.min(failures, 5))));
          schedule();
        };
      } catch (_) { schedule(); }
    }
    start();
    if (fallbackMs > 0) fallback = setInterval(schedule, fallbackMs);
    return { close: function () {
      closed = true;
      if (debounce) clearTimeout(debounce);
      if (reconnect) clearTimeout(reconnect);
      if (fallback) clearInterval(fallback);
      if (es) es.close();
    } };
  }

  global.LQRRealtime = { createLoader: createLoader, connect: connect };
})(typeof window !== 'undefined' ? window : globalThis);
