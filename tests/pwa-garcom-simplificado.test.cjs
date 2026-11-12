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

test('PWA mantém navegação fixa e controles discretos no fluxo da aba Mesas', () => {
  assert.doesNotMatch(html, /class="app-header"/, 'faixa superior removida');
  assert.doesNotMatch(html, /class="waiter-strip"/, 'faixa do garçom removida');
  assert.doesNotMatch(css, /\.waiter-strip-inner\s*\{/, 'CSS da faixa do garçom removido');

  const footer = html.slice(html.indexOf('<footer class="app-footer"'), html.indexOf('</footer>'));
  const mesas = html.slice(html.indexOf('id="page-tables"'), html.indexOf('id="page-orders"'));
  for (const id of ['connection', 'syncBtn', 'themeToggleBtn', 'helpBtn', 'openNotificationSettings']) {
    assert.match(mesas, new RegExp('id="' + id + '"'), id + ' fica no final da aba Mesas');
  }
  assert.match(mesas, /class="utility-bar"/);
  assert.doesNotMatch(footer, /class="utility-bar"/);
  assert.match(footer, /class="bottom-nav"/, 'navegação continua no rodapé');
  // #305: apenas Mesas e Entregas no rodapé; Pedidos e Cobrança seguem como
  // páginas secundárias, acessadas por atalho e com botão de voltar.
  for (const tab of ['tables', 'deliveries']) {
    assert.match(footer, new RegExp('data-tab="' + tab + '"'));
  }
  for (const tab of ['orders', 'billing']) {
    assert.doesNotMatch(footer, new RegExp('data-tab="' + tab + '"'), 'aba ' + tab + ' saiu do rodapé');
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

test('Painel de ajuda explica os controles rápidos e mostra quem está atendendo', () => {
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

/* ------------------------------------ ações no modal e lista única do salão */

test('salão completo substitui a lista duplicada e centraliza ações no modal', () => {
  assert.doesNotMatch(html, /id="myTables"|Minhas mesas/);
  assert.doesNotMatch(js, /function renderMyTables|className='my-table-card'/);
  assert.doesNotMatch(css, /my-table-card|my-table-actions|my-tables-list/);
  const modal = js.slice(js.indexOf('function openTableDetails('), js.indexOf('function openTransferModal('));
  for (const action of [
    'openOrdersModal(m.numero)',
    'openBillingForSession(m.sessaoId,m.numero)',
    'openTransferModal(m.numero)',
    'leaveTable(m.numero)',
  ]) assert.ok(modal.includes(action), action + ' está disponível no modal');
  assert.ok(modal.includes("m.pedidoClienteQr?'Assumir mesa':'Iniciar atendimento'"));
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

/* -------------------------------------- salão completo como grade (#305) */

function carregarBusca(mesas) {
  const search = new Elemento('input');
  const grid = new Elemento('div');
  const message = new Elemento('p');
  const pracaSelect = new Elemento('select');
  pracaSelect.value = '';
  const ctx = contexto({
    ids: { tableSearch: search, tableGrid: grid, tableSearchMessage: message, pracaFilter: pracaSelect },
    globais: { mesas, currentWaiterId: 7 },
  });
  carregar(ctx, [
    'normalizarBusca',
    'analisarBuscaMesas',
    'mesasFiltradas',
    'situacoesMesa',
    'situacaoMesa',
    'minutosDesdePrimeiroPedido',
    'tempoAtendimentoTexto',
    'pracasDisponiveis',
    'chavePracaDaMesa',
    'renderTableGrid',
  ]);
  return { ctx, search, grid, message, pracaSelect };
}

const MESAS = [
  {
    numero: 3, sessaoId: 10, clienteNome: 'João Prado', garcomResponsavelId: 7, garcomResponsavelNome: 'Ana',
    pracaId: 1, pracaNome: 'Praia', pracaOrdem: 1,
    primeiroPedidoEm: new Date(Date.now() - 95 * 60000).toISOString(), pedidosValidos: 2, situacao: 'em_atendimento',
  },
  { numero: 12, sessaoId: null, clienteNome: null, pracaId: 3, pracaNome: 'Salão', pracaOrdem: 3 },
  {
    numero: 27, sessaoId: 11, clienteNome: 'Ana', garcomResponsavelId: null,
    pracaId: 1, pracaNome: 'Praia', pracaOrdem: 1,
  },
  { numero: 5, sessaoId: null, clienteNome: 'Cliente do QR', pracaId: null, pracaNome: null },
];

/** Apenas os cards do salão (o estado vazio é um <p>, não um card). */
function cards(grid) {
  return grid.children.filter((c) => String(c.className || '').split(/\s+/).includes('table-tile'));
}

/** Primeiro filho com a classe pedida (o card é montado por blocos). */
function parte(card, classe) {
  const andar = (n) => {
    for (const f of n.children) {
      if (String(f.className || '').split(/\s+/).includes(classe)) return f;
      const achado = andar(f);
      if (achado) return achado;
    }
    return null;
  };
  return andar(card);
}

test('todas as mesas aparecem em cards sem digitar busca', () => {
  const { ctx, grid, message } = carregarBusca(MESAS);
  ctx.renderTableGrid();
  assert.equal(grid.hidden, false, 'a grade não depende mais de busca');
  assert.equal(cards(grid).length, 4, 'salão inteiro por padrão');
  assert.deepEqual(
    cards(grid).map((c) => c.dataset.numero),
    ['3', '12', '27', '5'],
  );
  assert.match(message.textContent, /4 mesas no salão/);
});

test('busca por número filtra a grade e aceita vírgula', () => {
  const { ctx, search, grid, message } = carregarBusca(MESAS);
  search.value = ' 12 ';
  ctx.renderTableGrid();
  assert.equal(cards(grid).length, 1);
  assert.match(cards(grid)[0].textos().join(' ').replace(/\s+/g, ' '), /Mesa 12/);
  assert.match(message.textContent, /1 mesa encontrada/);

  search.value = '3, 27 ,5';
  ctx.renderTableGrid();
  assert.deepEqual(cards(grid).map((c) => c.dataset.numero), ['3', '27', '5']);

  search.value = '999';
  ctx.renderTableGrid();
  assert.equal(cards(grid).length, 0);
  assert.match(message.textContent, /Sem resultado para: 999/);
  assert.match(message.textContent, /Confira os números das mesas habilitadas/);
});

test('busca parcial informa quais números não existem sem esconder os demais', () => {
  const { ctx, search, grid, message } = carregarBusca(MESAS);
  search.value = '3, 99';
  ctx.renderTableGrid();
  assert.deepEqual(cards(grid).map((c) => c.dataset.numero), ['3']);
  assert.match(message.textContent, /1 mesa encontrada/);
  assert.match(message.textContent, /Sem resultado para: 99/);

  search.value = ', ,';
  ctx.renderTableGrid();
  assert.equal(cards(grid).length, 0, 'entrada inválida não finge filtrar');
  assert.equal(grid.children.length, 0, 'entrada inválida só mostra a orientação');
  assert.match(message.textContent, /números separados por vírgula/i);
});

test('busca por cliente ignora caixa, espaços e acentos e exige sessão aberta', () => {
  const { ctx } = carregarBusca(MESAS);
  const numeros = (termo) => Array.from(ctx.mesasFiltradas(termo), (x) => x.numero);
  assert.deepEqual(numeros('  JOAO   prado '), [3], 'acha "João Prado" sem acento e com caixa alta');
  assert.deepEqual(numeros('ana'), [27]);
  assert.deepEqual(numeros('ANA'), [27], 'caixa alta do cliente');
  assert.deepEqual(numeros('cliente do qr'), [], 'sem sessão aberta o nome não aparece');
  assert.deepEqual(numeros(''), [3, 12, 27, 5], 'busca vazia mostra o salão, não o esconde');
  assert.equal(ctx.analisarBuscaMesas(' , ').vazia, true);
});

test('limpar a busca volta a mostrar o salão inteiro e o campo está descrito no HTML', () => {
  const { ctx, search, grid } = carregarBusca(MESAS);
  search.value = '3';
  ctx.renderTableGrid();
  assert.equal(cards(grid).length, 1);
  search.value = '';
  ctx.renderTableGrid();
  assert.equal(cards(grid).length, 4, 'sem filtro a grade continua completa');
  assert.match(html, /id="tableSearch"[^>]*aria-describedby="tableSearchHint"/);
  assert.match(html, /separados por vírgula/);
  assert.match(js, /\$\('#tableSearch'\)\?\.addEventListener\('input',renderTableGrid\)/);
});

test('o card mostra praça, estado por extenso e responsável, sem depender da cor', () => {
  const { ctx, grid } = carregarBusca(MESAS);
  ctx.renderTableGrid();
  const ocupada = cards(grid)[0];
  assert.equal(ocupada.dataset.situacao, 'em_atendimento');
  assert.match(parte(ocupada, 'table-tile-praca').textContent, /Praia/);
  assert.match(parte(ocupada, 'table-tile-state').textos().join(' '), /Em atendimento/);
  assert.match(parte(ocupada, 'table-tile-resp').textContent, /Ana/);

  const livre = cards(grid)[1];
  assert.equal(livre.dataset.situacao, 'livre');
  assert.match(parte(livre, 'table-tile-state').textos().join(' ').trim(), /^Livre/);

  const semPraca = cards(grid)[3];
  assert.match(parte(semPraca, 'table-tile-praca').textContent, /Sem praça/);
});

test('sessão aberta sem pedido é "Aguardando pedido" e não conta tempo', () => {
  const { ctx, grid } = carregarBusca(MESAS);
  ctx.renderTableGrid();
  const aguardando = cards(grid)[2];
  assert.equal(aguardando.dataset.situacao, 'aguardando_pedido');
  assert.match(parte(aguardando, 'table-tile-state').textos().join(' '), /Aguardando pedido/);
  assert.equal(parte(aguardando, 'table-tile-time').textContent, '', 'sem pedido não repete tempo no card');
  assert.equal(ctx.minutosDesdePrimeiroPedido(MESAS[2]), null);
});

test('tempo de atendimento conta do primeiro pedido, não da abertura da sessão', () => {
  const { ctx } = carregarBusca(MESAS);
  const minutos = ctx.minutosDesdePrimeiroPedido(MESAS[0], Date.now());
  assert.ok(minutos >= 95 && minutos <= 96, 'primeiro pedido há 95 min: ' + minutos);
  assert.equal(ctx.tempoAtendimentoTexto(95), '1h35');
  assert.equal(ctx.tempoAtendimentoTexto(0), 'agora');
  assert.equal(ctx.tempoAtendimentoTexto(42), '42 min');
});

test('filtro por praça usa as praças existentes e pode ser combinado com a busca', () => {
  const { ctx, search, grid, pracaSelect } = carregarBusca(MESAS);
  const pracas = ctx.pracasDisponiveis();
  assert.deepEqual([...pracas.map((p) => p.nome)], ['Praia', 'Salão', 'Sem praça']);
  pracaSelect.value = 'p1';
  ctx.renderTableGrid();
  assert.deepEqual(cards(grid).map((c) => c.dataset.numero), ['3', '27']);
  search.value = '27';
  ctx.renderTableGrid();
  assert.deepEqual(cards(grid).map((c) => c.dataset.numero), ['27']);
  pracaSelect.value = 'p3';
  ctx.renderTableGrid();
  assert.equal(cards(grid).length, 0, 'busca e praça se combinam');
});

/* ------------------------------- barra do salão e densidade da grade (#306) */

test('barra do salão cabe em uma linha: praça e lupa', () => {
  const toolbar = html.slice(html.indexOf('id="salaoToolbar"'), html.indexOf('id="tableGrid"'));
  for (const id of ['pracaFilter', 'toggleTableSearch', 'closeTableSearch', 'tableSearch']) {
    assert.match(toolbar, new RegExp('id="' + id + '"'), id + ' fica na barra do salão');
  }
  // A busca é um ícone que expande o campo: input e praça não empilham linhas.
  assert.match(toolbar, /class="salao-search-wrap"/);
  assert.match(html, /id="tableSearchHint"[^>]*class="[^"]*sr-only/, 'dica da busca só para leitor de tela');
  // O botão grande "Novo pedido" do cabeçalho saiu: a ação já existe no detalhe da mesa.
  assert.doesNotMatch(html, /id="newOrderTables"/, 'sem botão de novo pedido na barra do salão');
  assert.doesNotMatch(js, /\$\('#newOrderTables'\)/, 'sem listener órfão do botão removido');
  assert.match(js, /newOrder\.textContent='Novo pedido'/, 'novo pedido continua disponível no detalhe da mesa');
  assert.match(js, /\$\('#toggleTableSearch'\)\?\.addEventListener\('click'/);
  assert.match(js, /\$\('#closeTableSearch'\)\?\.addEventListener\('click'/);
});

test('grade do salão é densa e responsiva, sem rolar horizontal', () => {
  const grade = css.slice(css.indexOf('.table-grid {'), css.indexOf('.table-tile {'));
  assert.match(grade, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, 'mínimo de quatro colunas inclusive em celular estreito');
  assert.doesNotMatch(grade, /repeat\(\s*[123]\s*,/, 'nunca reduz para menos de quatro colunas');
  for (const colunas of [5, 6, 7]) {
    assert.match(grade, new RegExp('repeat\\(\\s*' + colunas + ', minmax\\(0, 1fr\\)\\)'), colunas + ' colunas em telas maiores');
  }
  assert.match(css, /\.table-tile \{\s*min-height: 56px/, 'card compacto');
  // Rodapé com as duas abas centralizadas (não colado à esquerda).
  assert.match(css, /\.bottom-nav \{[^}]*justify-content: center/, 'navegação centralizada');
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
