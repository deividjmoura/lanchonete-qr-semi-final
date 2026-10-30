'use strict';

/**
 * Harness mínimo para exercitar o código REAL do PWA do garçom em Node.
 *
 * O `app.js` é um módulo com efeitos colaterais no topo (location, localStorage,
 * service worker), então carregá-lo inteiro exigiria um navegador. Aqui nós
 * recortamos as funções pelo nome do próprio arquivo e as executamos numa VM
 * com um DOM stub. Não é uma cópia da lógica: se a função mudar no app.js, o
 * teste passa a exercer a versão nova — e quebra se ela regredir.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'garcom-pwa', 'app.js');

function source() {
  return fs.readFileSync(APP_PATH, 'utf8');
}

/**
 * Extrai o texto de uma função de topo balanceando chaves, ignorando as que
 * aparecem dentro de strings/template/comentários.
 */
function extrairFuncao(src, nome) {
  const re = new RegExp('(?:^|\\n)(async\\s+)?function\\s+' + nome + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('função não encontrada em app.js: ' + nome);
  const inicio = m.index + (m[0].startsWith('\n') ? 1 : 0);
  let i = src.indexOf('{', m.index);
  let profundidade = 0;
  let modo = null; // ' " ` // /*
  for (; i < src.length; i++) {
    const c = src[i];
    const prox = src[i + 1];
    if (modo === '//' ) { if (c === '\n') modo = null; continue; }
    if (modo === '/*') { if (c === '*' && prox === '/') { modo = null; i++; } continue; }
    if (modo) {
      if (c === '\\') { i++; continue; }
      if (c === modo) modo = null;
      continue;
    }
    if (c === '/' && prox === '/') { modo = '//'; i++; continue; }
    if (c === '/' && prox === '*') { modo = '/*'; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { modo = c; continue; }
    if (c === '{') profundidade++;
    else if (c === '}') {
      profundidade--;
      if (profundidade === 0) return src.slice(inicio, i + 1);
    }
  }
  throw new Error('chaves não balanceadas ao extrair ' + nome);
}

class Elemento {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this._text = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.className = '';
    this.type = '';
    this.onclick = null;
    this.classList = {
      _s: new Set(),
      add: (...c) => c.forEach((x) => this.classList._s.add(x)),
      remove: (...c) => c.forEach((x) => this.classList._s.delete(x)),
      contains: (c) => this.classList._s.has(c),
    };
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v == null ? '' : v); this.children = []; }
  get childElementCount() { return this.children.length; }
  get options() { return this.children.filter((c) => c.tagName === 'OPTION'); }
  append(...nos) { this.children.push(...nos); }
  appendChild(n) { this.children.push(n); return n; }
  replaceChildren(...nos) { this.children = [...nos]; this._text = ''; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(ev, fn) { (this._listeners ||= {})[ev] = fn; }
  querySelectorAll(sel) {
    // suporta apenas 'button', usado pela barra de lote
    const tag = sel.replace(/[^a-z]/gi, '').toUpperCase();
    const saida = [];
    const andar = (n) => {
      for (const f of n.children) {
        if (f.tagName === tag) saida.push(f);
        andar(f);
      }
    };
    andar(this);
    return saida;
  }
  /** Percorre a árvore procurando texto — útil para achar o botão certo. */
  textos() {
    const saida = [];
    const andar = (n) => {
      if (n._text) saida.push(n._text);
      for (const f of n.children) andar(f);
    };
    andar(this);
    return saida;
  }
  botoes() { return this.querySelectorAll('button'); }
}

/**
 * Cria um contexto com os seletores informados.
 * `ids` é um mapa id -> Elemento (sem o '#').
 */
function contexto({ ids = {}, globais = {} } = {}) {
  const mapa = new Map(Object.entries(ids));
  const criados = [];
  const document = {
    querySelector(sel) {
      if (!sel.startsWith('#')) return null;
      return mapa.get(sel.slice(1)) || null;
    },
    createElement(tag) { const e = new Elemento(tag); criados.push(e); return e; },
    querySelectorAll() { return []; },
  };
  const sandbox = {
    document,
    console,
    Intl,
    Number,
    String,
    Array,
    Object,
    Math,
    JSON,
    Date,
    Boolean,
    Error,
    Set,
    Map,
    Promise,
    navigator: { onLine: true },
    confirm: () => true,
    alert: (m) => { sandbox.__alerts.push(m); },
    __alerts: [],
    __criados: criados,
    $: (s) => document.querySelector(s),
    money: (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ','),
    ...globais,
  };
  vm.createContext(sandbox);
  return sandbox;
}

/** Executa as funções nomeadas dentro do contexto e devolve o sandbox. */
function carregar(ctx, nomes) {
  const src = source();
  const codigo = nomes.map((n) => extrairFuncao(src, n)).join('\n\n');
  vm.runInContext(codigo, ctx);
  return ctx;
}

module.exports = { source, extrairFuncao, Elemento, contexto, carregar, APP_PATH };
