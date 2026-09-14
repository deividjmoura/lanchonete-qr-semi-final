
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
    const fallbackMs = opts.fallbackMs != null ? opts.fallbackMs : 20000;
    const debounceMs = opts.debounceMs != null ? opts.debounceMs : 150;
    let es = null;
    let timer = null;
    let closed = false;

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        try {
          onUpdate();
        } catch (e) {
          console.error(e);
        }
      }, debounceMs);
    }

    function start() {
      if (closed) return;
      if (typeof EventSource === 'undefined') {
        setInterval(function () {
          try {
            onUpdate();
          } catch (e) {}
        }, fallbackMs);
        try {
          onUpdate();
        } catch (e) {}
        return;
      }
      try {
        if (es) {
          try {
            es.close();
          } catch (_) {}
        }
        es = new EventSource('/api/events');
        es.addEventListener('update', schedule);
        es.addEventListener('hello', schedule);
        es.onerror = function () {
          try {
            es.close();
          } catch (_) {}
          es = null;
          setTimeout(start, 2000);
        };
      } catch (e) {
        setTimeout(start, 3000);
      }
    }

    start();
    if (fallbackMs > 0) {
      setInterval(function () {
        try {
          onUpdate();
        } catch (e) {}
      }, fallbackMs);
    }

    return {
      close: function () {
        closed = true;
        if (timer) clearTimeout(timer);
        if (es) {
          try {
            es.close();
          } catch (_) {}
        }
      },
    };
  }

  global.LQRRealtime = { createLoader: createLoader, connect: connect };
})(typeof window !== 'undefined' ? window : globalThis);
