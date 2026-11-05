const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { source, Elemento, contexto, carregar } = require('./helpers/pwa-harness.cjs');

const root = path.join(__dirname, '..', 'public', 'garcom-pwa');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const sprite = fs.readFileSync(path.join(root, 'icons.svg'), 'utf8');

/* ---------------------------------------------------------------- layout */

test('PWA não tem cabeçalho fixo: tema, sync, ajuda, conexão e avisos vivem no rodapé', () => {
  assert.doesNotMatch(html, /class="app-header"/, 'faixa superior removida');
  assert.doesNotMatch(html, /class="waiter-strip"/, 'faixa do garçom removida');
  assert.doesNotMatch(css, /\.waiter-strip-inner\s*\{/, 'CSS da faixa do garçom removido');

  const footer = html.slice(html.indexOf('<footer class="app-footer"'), html.indexOf('</footer>'));
  for (const id of ['connection', 'syncBtn', 'themeToggleBtn', 'helpBtn', 'openNotificationSettings']) {
    assert.match(footer, new RegExp('id="' + id + '"'), id + ' fica no rodapé');
  }
  assert.match(footer, /class="utility-bar"/);
  assert.match(footer, /class="bottom-nav"/, 'as quatro abas continuam no rodapé');
  for (const tab of ['tables', 'orders', 'deliveries', 'billing']) {
    assert.match(footer, new RegExp('data-tab="' + tab + '"'));
  }
  // Nada de controle de tema/sync antes do conteúdo.
  assert.equal(html.indexOf('id="themeToggleBtn"') > html.indexOf('<main'), true);

  for (const id of ['themeToggleBtn', 'syncBtn', 'helpBtn', 'openNotificationSettings']) {
    const tag = html.slice(html.indexOf('id="' + id + '"'));
    assert.match(tag.slice(0, tag.indexOf('>')), /aria-label="[^"]+"/, id + ' tem rótulo acessível');
  }
});

test('Indicador de conexão mostra apenas ícone com texto para leitor de tela', () => {
  const tag = html.slice(html.indexOf('id="connection"'));
  const open = tag.slice(0, tag.indexOf('>'));
  assert.match(open, /class="connection-indicator"/);
  assert.match(open, /role="status"/);
  assert.match(open, /aria-live="polite"/);
  assert.match(tag.slice(0, tag.indexOf('</span>') + 7), /class="connection-label sr-only"/);
  const connection = html.slice(html.indexOf('id="connection"'), html.indexOf('id="syncBtn"'));
  const texto = (el) => el.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const inner = connection.slice(connection.indexOf('>') + 1, connection.indexOf('<button'));
  const semRotulo = inner.replace(/<span class="connection-label sr-only">[^<]*<\/span>/, '');
  assert.equal(texto(semRotulo), '', 'sem texto visível: todo o rótulo fica no sr-only');
});

test('Painel de ajuda explica cada ícone do rodapé e mostra quem está atendendo', () => {
  assert.match(html, /id="helpModal"/);
  const painel = html.slice(html.indexOf('id="helpModal"'), html.indexOf('</dialog>', html.indexOf('id="helpModal"')));
  for (const texto of ['Conexão', 'Sincronizar', 'Avisos', 'Tema', 'Ajuda']) {
    assert.match(painel, new RegExp(texto), 'ajuda descreve ' + texto);
  }
  assert.match(painel, /id="identity"/);
  assert.match(js, /\$\('#helpBtn'\)\?\.addEventListener\('click'/);
  assert.match(js, /\$\('#closeHelp'\)\?\.addEventListener\('click'/);
});

test('Botão "Ver em janela" saiu; o modal por mesa continua disponível', () => {
  assert.doesNotMatch(html, /id="showActiveOrders"/);
  assert.doesNotMatch(js, /showActiveOrders/);
  assert.match(html, /id="ordersModal"/);
  assert.match(js, /openOrdersModal\(m\.numero\)/, 'a ação por mesa continua abrindo o modal');
});

test('Aviso de offline é único e nasce oculto', () => {
  assert.match(html, /id="offlineNotice"[^>]*hidden/);
  assert.equal((html.match(/id="offlineNotice"/g) || []).length, 1, 'apenas um aviso de modo offline');
  const aviso = html.slice(html.indexOf('id="offlineNotice"'), html.indexOf('</div>', html.indexOf('id="offlineNotice"')));
  assert.match(aviso, /Sem conexão confirmada com o servidor/);
  assert.match(css, /\.offline-notice\s*\{/);
});

/* ------------------------------------------- conexão: ícone e estado real */

function carregarConexao() {
  const src = source();
  const inicio = src.indexOf('const CONNECTION_STATES=');
  assert.ok(inicio > 0, 'mapa de estados de conexão no app.js');
  const fim = src.indexOf('};', inicio) + 2;
  const mapa = src.slice(inicio, fim);
  const connection = new Elemento('span');
  const label = new Elemento('span');
  label.className = 'connection-label';
  const use = new Elemento('use');
  use.className = 'connection-icon';
  connection.children.push(use, label);
  const offlineNotice = new Elemento('div');
  offlineNotice.hidden = true;
  const ctx = contexto({ ids: { connection, offlineNotice }, globais: { waiterAuthInvalid: false } });
  require('node:vm').runInContext(mapa, ctx);
  carregar(ctx, ['setConnection', 'setOfflineNotice']);
  return { ctx, connection, label, use, offlineNotice };
}

test('setConnection troca ícone e rótulo acessível nos cinco estados', () => {
  const { ctx, connection, label, use } = carregarConexao();
  const esperado = {
    online: 'wifi-high-regular',
    offline: 'wifi-slash-regular',
    checking: 'clock-regular',
    auth: 'warning-circle-regular',
    storage: 'warning-circle-regular',
  };
  for (const [estado, icone] of Object.entries(esperado)) {
    ctx.setConnection(estado);
    assert.equal(connection.attributes['data-net'], estado);
    assert.match(use.attributes.href, new RegExp('#' + icone + '$'), estado + ' usa ' + icone);
    assert.ok(label.textContent.length > 0, estado + ' mantém texto para leitor de tela');
    assert.equal(connection.title, label.textContent, estado + ' tem dica de título igual ao rótulo');
  }
});

test('aviso de offline só aparece quando o SyncEngine confirma queda de conexão', () => {
  const { ctx, offlineNotice } = carregarConexao();
  for (const estado of ['checking', 'online', 'auth', 'storage']) {
    ctx.setConnection(estado);
    assert.equal(offlineNotice.hidden, true, estado + ' não é modo offline');
  }
  ctx.setConnection('offline');
  assert.equal(offlineNotice.hidden, false, 'offline confirmado exibe o aviso');
  ctx.setConnection('online');
  assert.equal(offlineNotice.hidden, true, 'volta a esconder quando o servidor responde');
});

/* --------------------------------------------------- cartão único por mesa */

test('cada mesa tem um único cartão "Mesa NN — Cliente" com ações em ícones', () => {
  assert.match(js, /className='my-table-card'/, 'um cartão por mesa');
  assert.doesNotMatch(js, /className='my-table-row'/, 'sem linha duplicando o cartão');
  assert.doesNotMatch(css, /\.my-table-row\s*\{/, 'CSS da linha duplicada removido');
  assert.match(js, /title\.textContent='Mesa '\+String\(m\.numero\)\.padStart\(2,'0'\)/);
  assert.match(js, /client\.textContent='— '\+\(m\.clienteNome\|\|'Cliente na mesa'\)/);
  for (const [rotulo, icone] of [
    ['Novo pedido', 'plus-bold'],
    ['Ver pedidos', 'list-checks-regular'],
    ['Cobrar', 'currency-circle-dollar-regular'],
    ['Transferir', 'swap-regular'],
    ['Deixar mesa', 'sign-out-regular'],
  ]) {
    assert.ok(js.includes("'" + rotulo), 'ação ' + rotulo + ' presente');
    assert.ok(js.includes("'" + icone + "'"), 'ícone ' + icone + ' usado nas ações');
    assert.ok(sprite.includes('id="' + icone + '"'), 'ícone ' + icone + ' existe no sprite');
  }
  assert.match(js, /btn\.setAttribute\('aria-label',label\)/, 'ações em ícone têm rótulo acessível');
  assert.match(js, /btn\.title=label/, 'ações em ícone têm dica de título');
  // O select de transferência saiu dos cartões e do modal de detalhes.
  assert.doesNotMatch(js, /select\.className='secondary small'/);
  assert.doesNotMatch(js, /label\.className='field';label\.textContent='Transferir para outro garçom'/);
});

/* ------------------------------------------- transferência em modal único */

function montarTransferencia({ garcons = [{ id: 2, nome: 'Bruno' }], falha = null } = {}) {
  const dialog = new Elemento('dialog');
  dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const chamadas = [];
  const select = new Elemento('select');
  const confirmBtn = new Elemento('button');
  const cancelBtn = new Elemento('button');
  const summary = new Elemento('p');
  const message = new Elemento('p');
  const tableMessage = new Elemento('p');
  const ctx = contexto({
    ids: {
      transferModal: dialog,
      transferWaiter: select,
      confirmTransfer: confirmBtn,
      cancelTransfer: cancelBtn,
      transferSummary: summary,
      transferMessage: message,
      tableMessage,
    },
    globais: {
      waiterToken: 'tok',
      mesas: [{ numero: 7, clienteNome: 'Ana', garcomResponsavelNome: 'Eu', sessaoId: 90, garcomResponsavelId: 1 }],
      activeWaiters: garcons,
      currentWaiterId: 1,
      getJson: async (url, opts) => {
        chamadas.push({ url, opts });
        if (falha) {
          const e = new Error(falha.message);
          e.status = falha.status;
          throw e;
        }
        return {};
      },
      loadMesas: async () => {},
      loadOrderStatuses: async () => {},
      loadDeliveries: async () => {},
    },
  });
  carregar(ctx, ['transferMessage', 'openTransferModal', 'transferTable']);
  return { ctx, dialog, select, confirmBtn, cancelBtn, summary, message, tableMessage, chamadas };
}

test('modal de transferência não envia nada antes da confirmação e usa o garçom escolhido', async () => {
  const { ctx, dialog, select, confirmBtn, summary, chamadas } = montarTransferencia();
  ctx.openTransferModal(7);
  assert.equal(dialog.open, true, 'modal abre');
  assert.equal(chamadas.length, 0, 'nenhuma requisição ao abrir');
  assert.match(summary.textContent, /Mesa 07 — Ana/);
  assert.match(summary.textContent, /Responsável atual: Eu/);
  assert.deepEqual([...select.options].map((o) => o.textContent), ['Escolha o garçom de destino', 'Bruno']);
  assert.equal(select.value, '', 'nada pré-selecionado');
  assert.equal(confirmBtn.disabled, false);

  select.value = '2';
  const ok = await ctx.transferTable(7, 2, 'Bruno');
  assert.equal(ok, true);
  assert.equal(chamadas.length, 1, 'uma única requisição');
  assert.match(chamadas[0].url, /\/api\/garcom\/tok\/mesas\/7\/transferir$/);
  assert.equal(chamadas[0].opts.method, 'POST');
  assert.deepEqual(JSON.parse(chamadas[0].opts.body), { garcomDestinoId: 2 });
});

test('cancelar a transferência não chama o servidor', () => {
  const { ctx, dialog, chamadas } = montarTransferencia();
  ctx.openTransferModal(7);
  // O listener de cancelamento apenas fecha o modal; nenhum POST é disparado.
  assert.doesNotMatch(js, /cancelTransfer'\)\?\.addEventListener\('click',[\s\S]{0,400}transferTable\(/);
  assert.equal(chamadas.length, 0);
  dialog.open = false;
  assert.equal(chamadas.length, 0, 'cancelamento não gera requisição');
});

test('transferência recusada pelo servidor (403/409) mantém o modal com o erro', async () => {
  for (const status of [403, 409]) {
    const { ctx, dialog, message, chamadas } = montarTransferencia({ falha: { status, message: 'Somente o responsável atual transfere esta mesa' } });
    ctx.openTransferModal(7);
    const ok = await ctx.transferTable(7, 2, 'Bruno');
    assert.equal(ok, false, status + ' não transfere');
    assert.equal(chamadas.length, 1, status + ' gera uma única tentativa');
    assert.match(message.textContent, /Somente o responsável atual transfere/);
    assert.equal(dialog.open, true, status + ': modal permanece aberto para o garçom escolher de novo');
  }
});

test('transferência sem outro garçom ativo explica o bloqueio em vez de falhar em silêncio', () => {
  const { ctx, confirmBtn, select, message, dialog } = montarTransferencia({ garcons: [{ id: 1, nome: 'Eu' }] });
  ctx.openTransferModal(7);
  assert.equal(dialog.open, true);
  assert.equal(confirmBtn.disabled, true, 'confirmação bloqueada');
  assert.equal(select.disabled, true);
  assert.match(message.textContent, /Não há outro garçom ativo/);
});

test('a transferência tem uma única confirmação: o próprio modal', () => {
  assert.doesNotMatch(js, /confirmarQR\('Transferir mesa/, 'sem segunda confirmação redundante');
  assert.match(js, /\$\('#confirmTransfer'\)/, 'confirmação disparada pelo botão do modal');
  assert.match(html, /id="confirmTransfer"/);
  assert.match(html, /action-row[\s\S]{0,400}id="cancelTransfer"/);
});

/* ---------------------------------------- salão completo a partir da busca */

function carregarBusca(mesas) {
  const search = new Elemento('input');
  const grid = new Elemento('div');
  grid.hidden = true;
  const message = new Elemento('p');
  const ctx = contexto({ ids: { tableSearch: search, tableGrid: grid, tableSearchMessage: message }, globais: { mesas } });
  carregar(ctx, ['normalizarBusca', 'analisarBuscaMesas', 'mesasFiltradas', 'renderTableGrid']);
  return { ctx, search, grid, message };
}

const MESAS = [
  { numero: 3, sessaoId: 10, clienteNome: 'João Prado' },
  { numero: 12, sessaoId: null, clienteNome: null },
  { numero: 27, sessaoId: 11, clienteNome: 'Ana' },
  { numero: 5, sessaoId: null, clienteNome: 'Cliente do QR' },
];

test('salão completo fica oculto até uma busca por número', () => {
  const { ctx, search, grid, message } = carregarBusca(MESAS);
  ctx.renderTableGrid();
  assert.equal(grid.hidden, true);
  assert.equal(grid.children.length, 0);
  assert.equal(message.textContent, '');

  search.value = ' 12 ';
  ctx.renderTableGrid();
  assert.equal(grid.hidden, false);
  assert.equal(grid.children.length, 1);
  assert.match(grid.children[0].children[0].textContent, /Mesa 12/);
});

test('busca aceita vários números separados por vírgula', () => {
  const { ctx, search, grid, message } = carregarBusca(MESAS);
  search.value = '3, 27 ,5';
  ctx.renderTableGrid();
  assert.deepEqual(
    grid.children.map((c) => c.children[0].textContent),
    ['Mesa 03', 'Mesa 27', 'Mesa 05'],
  );
  assert.match(message.textContent, /3 mesas encontradas/);

  search.value = '999';
  ctx.renderTableGrid();
  assert.equal(grid.children.length, 0);
  assert.match(message.textContent, /Sem resultado para: 999/);
  assert.match(message.textContent, /Confira os números das mesas habilitadas/);
});

test('busca parcial informa quais números não existem sem listar o salão inteiro', () => {
  const { ctx, search, grid, message } = carregarBusca(MESAS);
  search.value = '3, 99';
  ctx.renderTableGrid();
  assert.deepEqual(grid.children.map((c) => c.children[0].textContent), ['Mesa 03']);
  assert.match(message.textContent, /1 mesa encontrada/);
  assert.match(message.textContent, /Sem resultado para: 99/);

  search.value = ', ,';
  ctx.renderTableGrid();
  assert.equal(grid.children.length, 1, 'entrada inválida não lista o salão');
  assert.match(message.textContent, /números separados por vírgula/i);
});

test('busca por cliente ignora caixa, espaços e acentos e exige sessão aberta', () => {
  const { ctx } = carregarBusca(MESAS);
  const numeros = (termo) => Array.from(ctx.mesasFiltradas(termo), (x) => x.numero);
  assert.deepEqual(numeros('  JOAO   prado '), [3], 'acha "João Prado" sem acento e com caixa alta');
  assert.deepEqual(numeros('ana'), [27]);
  assert.deepEqual(numeros('ANA'), [27], 'caixa alta do cliente');
  assert.deepEqual(numeros('cliente do qr'), [], 'sem sessão aberta o nome não aparece');
  assert.deepEqual(numeros(''), [], 'busca vazia não lista nada');
  assert.equal(ctx.analisarBuscaMesas(' , ').vazia, true);
});

test('limpar a busca volta a esconder o salão e o campo está descrito no HTML', () => {
  const { ctx, search, grid } = carregarBusca(MESAS);
  search.value = '3';
  ctx.renderTableGrid();
  assert.equal(grid.hidden, false);
  search.value = '';
  ctx.renderTableGrid();
  assert.equal(grid.hidden, true);
  assert.match(html, /id="tableSearch"[^>]*aria-describedby="tableSearchHint"/);
  assert.match(html, /separados por vírgula/);
  assert.match(js, /\$\('#tableSearch'\)\?\.addEventListener\('input',renderTableGrid\)/);
});

/* ------------------------------------------------------------- service worker */

test('service worker sobe de versão e o dist acompanha o public', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const versao = Number(sw.match(/garcom-pwa-shell-v(\d+)/)[1]);
  assert.ok(versao > 37, 'cache do shell acima da v37 (' + versao + ')');
  const dist = path.join(__dirname, '..', 'dist', 'garcom-pwa');
  if (fs.existsSync(dist)) {
    for (const arquivo of ['index.html', 'app.js', 'styles.css', 'sw.js', 'icons.svg']) {
      assert.equal(
        fs.readFileSync(path.join(dist, arquivo), 'utf8'),
        fs.readFileSync(path.join(root, arquivo), 'utf8'),
        'dist/garcom-pwa/' + arquivo + ' precisa ser regenerado',
      );
    }
  }
});

test('sprite de ícones ganhou os símbolos usados pelas novas ações', () => {
  for (const id of ['wifi-high-regular', 'question-regular', 'swap-regular', 'sign-out-regular', 'list-checks-regular']) {
    assert.match(sprite, new RegExp('id="' + id + '"'), 'símbolo ' + id);
  }
});
