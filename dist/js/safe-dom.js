/**
 * Helpers anti-XSS para o front vanilla.
 * Use textContent / estes helpers em vez de innerHTML com dados do servidor.
 *
 * Inclua no HTML:
 *   <script src="/js/safe-dom.js"></script>
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Cria elemento de forma segura.
   * props.text  → textContent (seguro)
   * props.html  → innerHTML (só com conteúdo 100% confiável / já escapado)
   * props.on*   → addEventListener
   * demais      → setAttribute
   */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    props = props || {};
    children = children == null ? [] : [].concat(children);

    for (const key of Object.keys(props)) {
      const val = props[key];
      if (val == null) continue;
      if (key === 'text') {
        node.textContent = val;
      } else if (key === 'html') {
        node.innerHTML = val;
      } else if (key === 'className' || key === 'class') {
        node.className = val;
      } else if (key.startsWith('on') && typeof val === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === 'dataset' && typeof val === 'object') {
        for (const dk of Object.keys(val)) {
          node.dataset[dk] = val[dk];
        }
      } else if (key === 'style' && typeof val === 'object') {
        Object.assign(node.style, val);
      } else {
        node.setAttribute(key, val);
      }
    }

    for (const child of children) {
      if (child == null || child === false) continue;
      if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function setChildren(node, children) {
    clear(node);
    for (const child of [].concat(children || [])) {
      if (child == null || child === false) continue;
      if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    }
  }

  global.SafeDOM = { escapeHtml, el, clear, setChildren };
})(typeof window !== 'undefined' ? window : globalThis);
