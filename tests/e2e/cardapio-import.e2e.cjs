'use strict';

/**
 * Importação de cardápio por CSV — fluxo real em Chromium, API simulada.
 *
 * Cobre o caminho que o dono da lanchonete percorre:
 *
 *   Importar CSV → escolhe o arquivo → prévia (contagens, categorias, erros)
 *   → confirmação → resumo → cardápio recarregado.
 *
 * Também verifica as proteções: arquivo errado não habilita a importação,
 * cancelar a confirmação não grava nada, e uma falha no servidor mantém a
 * prévia na tela (o cardápio atual não é apagado).
 *
 * Usa o build de produção (`vite preview`), sem banco — o runner reconhece a
 * família pelo uso de VISUAL_BASE_URL.
 */

const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;

const base = process.env.VISUAL_BASE_URL;
if (!base) {
  throw new Error('VISUAL_BASE_URL ausente. Execute npm run test:e2e para usar o preview isolado do runner.');
}

const CABECALHO = 'categoria;nome;descricao;preco;imagem_url;disponivel;ordem';

/** Cardápio válido: 4 produtos em 2 categorias, 3 disponíveis, 1 com imagem. */
const CSV_OK = [
  CABECALHO,
  'Lanches;X-Burger;Pão, carne e queijo;25,90;;sim;1',
  'Lanches;X-Bacon;Bacon extra;29,50;https://exemplo.com/bacon.png;sim;2',
  'Bebidas;Refrigerante lata;;6,00;;sim;1',
  'Bebidas;Suco de laranja;Natural, 300ml;8,50;;nao;2',
].join('\r\n');

/** Sem preço e sem disponibilidade: dois erros na linha 2. */
const CSV_ERRO = [CABECALHO, 'Lanches;X-Burger;;;'].join('\r\n');

const CARDAPIO_ANTIGO = [{
  id: 1, nome: 'Lanches', ordem: 0,
  produtos: [{
    id: 11, nome: 'X-Burger Antigo', descricao: 'Receita anterior', preco: 20,
    disponivel: true, ordem: 0, setor: 'cozinha', adicionais: [], removiveis: [],
  }],
}];

/**
 * Analisador mínimo do CSV, só para o mock devolver contagens realistas.
 * A validação de verdade é do servidor (db/cardapio-import.js).
 */
function analisarCsv(texto) {
  const linhas = String(texto || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const erros = [];
  const categorias = new Map();
  let produtos = 0;
  let disponiveis = 0;
  let indisponiveis = 0;
  let comImagem = 0;
  let linhasIgnoradas = 0;

  for (let i = 1; i < linhas.length; i++) {
    if (!linhas[i].trim()) { linhasIgnoradas++; continue; }
    const numero = i + 1;
    const [categoria = '', nome = '', , preco = '', imagem = '', disponivel = ''] = linhas[i].split(';');
    if (!categoria.trim()) erros.push({ linha: numero, coluna: 'categoria', mensagem: 'Informe a categoria.' });
    if (!nome.trim()) erros.push({ linha: numero, coluna: 'nome', mensagem: 'Informe o nome do produto.' });
    if (!preco.trim()) erros.push({ linha: numero, coluna: 'preco', mensagem: 'Informe o preço (ex.: 25,90).' });
    else if (!/^\d+(?:[.,]\d{1,2})?$/.test(preco.trim())) {
      erros.push({ linha: numero, coluna: 'preco', mensagem: 'Preço inválido — use apenas números (ex.: 25,90).' });
    }
    if (!/^(sim|nao|não)$/i.test(disponivel.trim())) {
      erros.push({ linha: numero, coluna: 'disponivel', mensagem: 'Use sim ou nao.' });
    }
    if (erros.some((e) => e.linha === numero)) continue;
    produtos++;
    if (/^sim$/i.test(disponivel.trim())) disponiveis++; else indisponiveis++;
    if (imagem.trim()) comImagem++;
    const chave = categoria.trim();
    categorias.set(chave, (categorias.get(chave) || 0) + 1);
  }

  return {
    ok: erros.length === 0 && produtos > 0,
    resumo: {
      produtos, categorias: categorias.size, disponiveis, indisponiveis, comImagem,
      linhas: linhas.length - 1, linhasIgnoradas,
    },
    categorias: [...categorias.entries()].map(([nome, qtd], i) => ({ nome, ordem: i + 1, produtos: qtd })),
    produtos: [],
    erros,
    avisos: [],
    delimitador: ';',
  };
}

async function contexto(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    if (window.top === window) {
      try { sessionStorage.setItem('pub-auth', JSON.stringify({ role: 'admin', nome: 'admin', deveTrocar: false })); } catch { /* about:blank */ }
    }
  });

  const req = { previas: [], importacoes: [], cardapios: 0, falharImportacao: false, ponto: null, reversoes: 0, bloquearReversao: false };

  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const metodo = route.request().method();
    let data = [];

    if (p === '/api/admin/cardapio/reversao') {
      data = req.ponto || { disponivel: false };
    } else if (p === '/api/admin/cardapio/reverter') {
      req.reversoes++;
      const b = route.request().postDataJSON();
      assert.equal(b.confirmar, true); assert.equal(b.versao, req.ponto.versao);
      if (req.bloquearReversao) return route.fulfill({ status: 409, json: { error: 'O estoque mudou. Reversão bloqueada.' } });
      req.ponto = { disponivel: false }; data = { ok: true };
    } else if (p === '/api/me') {
      data = { staff: { id: 1, login: 'admin', papel: 'admin', nome: 'admin', deveTrocarSenha: false }, csrfToken: 'csrf-test' };
    } else if (p === '/api/admin/cardapio' && metodo === 'GET') {
      req.cardapios++;
      data = CARDAPIO_ANTIGO;
    } else if (p === '/api/admin/cardapio/importar/previa' && metodo === 'POST') {
      const corpo = route.request().postDataJSON();
      req.previas.push(corpo);
      data = analisarCsv(corpo && corpo.csv);
    } else if (p === '/api/admin/cardapio/importar' && metodo === 'POST') {
      const corpo = route.request().postDataJSON();
      req.importacoes.push(corpo);
      if (req.falharImportacao) {
        return route.fulfill({ status: 500, json: { error: 'Falha simulada ao gravar o cardápio. Nada foi alterado.' } });
      }
      req.ponto = { disponivel: true, versao: `versao-${req.importacoes.length}` };
      const previa = analisarCsv(corpo && corpo.csv);
      const modo = corpo && corpo.modo === 'atualizar' ? 'atualizar' : 'substituir';
      data = {
        ok: true, modo,
        produtos: previa.resumo.produtos,
        categorias: previa.resumo.categorias,
        produtosInseridos: modo === 'substituir' ? previa.resumo.produtos : 0,
        produtosAtualizados: modo === 'atualizar' ? previa.resumo.produtos : 0,
        produtosArquivados: modo === 'substituir' ? CARDAPIO_ANTIGO[0].produtos.length : 0,
        categoriasCriadas: modo === 'substituir' ? 1 : 0,
        categoriasRemovidas: 0,
      };
    } else if (p === '/api/admin/cardapio/modelo.csv') {
      data = { ok: true };
    } else if (p === '/api/admin/dashboard') {
      data = { resumo: {}, series: [], topProdutos: [], categorias: [], setores: [] };
    } else if (p === '/api/admin/mesas/config') {
      data = { quantidade: 0, limite: 70 };
    } else if (p === '/api/admin/pracas' || p === '/api/admin/garcons/metricas') {
      data = p.endsWith('metricas') ? { garcons: [] } : [];
    } else if (p === '/api/admin/contas') {
      data = [{ id: 1, nome: 'Admin', login: 'admin', papel: 'admin' }];
    } else if (p.includes('event')) {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': teste\n\n' });
    }

    return route.fulfill({ json: data });
  });

  return { context, req };
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || (await binary.executablePath()),
    args: [...binary.args.filter((a) => a !== '--single-process' && a !== '--no-zygote'), '--no-sandbox'],
    headless: true,
  });
  const { context, req } = await contexto(browser);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const arquivo = (nome, conteudo, mimeType = 'text/csv') => ({
    name: nome, mimeType, buffer: Buffer.from(conteudo, 'utf8'),
  });

  try {
    await page.goto(base + '/#/admin/cardapio', { waitUntil: 'load' });
    await page.getByRole('heading', { name: 'Cardápio & Estoque', exact: true, level: 1 }).waitFor();

    // ---------------------------------------------------------------- abrir
    await page.getByRole('button', { name: 'Importar CSV' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Importar cardápio completo' });
    await dialogo.waitFor();
    const input = dialogo.locator('input[type="file"]');
    assert.equal(await input.count(), 1, 'dropzone tem um seletor de arquivo');
    assert.equal(await input.getAttribute('accept'), '.csv,text/csv');

    // O modelo pronto para baixar faz parte da tela (o usuário não conseguia
    // gerar o arquivo por conta própria).
    const modelo = dialogo.getByRole('link', { name: /Baixar modelo/ });
    assert.equal(await modelo.getAttribute('download'), 'cardapio_completo.csv');
    assert.ok(
      String(await modelo.getAttribute('href')).endsWith('/api/admin/cardapio/modelo.csv'),
      'modelo vem do próprio sistema',
    );

    const acao = dialogo.getByRole('button', { name: 'Substituir cardápio', exact: true });
    assert.equal(await acao.isDisabled(), true, 'sem arquivo não dá para importar');

    // --------------------------------------- arquivo que não é CSV (cliente)
    await input.setInputFiles(arquivo('cardapio.txt', 'categoria;nome\nLanches;X-Burger', 'text/plain'));
    await dialogo.getByText('Escolha um arquivo .csv (CSV UTF-8).').waitFor();
    assert.equal(req.previas.length, 0, 'arquivo errado nem chega ao servidor');
    assert.equal(await acao.isDisabled(), true);

    // ------------------------------------------------- prévia com erros
    await input.setInputFiles(arquivo('cardapio_completo.csv', CSV_ERRO));
    const previaErro = dialogo.getByRole('region', { name: 'Prévia da importação' });
    await previaErro.waitFor();
    assert.equal(req.previas.length, 1, 'prévia é validada no servidor');
    assert.equal(req.previas[0].csv, CSV_ERRO, 'o arquivo vai íntegro para a prévia');
    await previaErro.getByText(/2 problemas\s+—\s+corrija a planilha e envie de novo/).waitFor();
    await previaErro.getByText('linha 2').first().waitFor();
    assert.equal(await acao.isDisabled(), true, 'arquivo inválido não habilita a importação');
    assert.equal(req.importacoes.length, 0);
    // Sem modo declarado e sem botão ativo, nada é gravado.
    assert.equal(await dialogo.getByText('Como aplicar').count(), 0, 'modos só aparecem com prévia válida');

    // ------------------------------------------------- prévia válida
    await input.setInputFiles(arquivo('cardapio_completo.csv', CSV_OK));
    await previaErro.getByText('Lanches').first().waitFor();
    await previaErro.getByText('Bebidas').waitFor();
    assert.deepEqual(await previaErro.locator('p.tnum').allInnerTexts(), ['4', '2'], 'produtos e categorias');
    await previaErro.getByText('3 disponíveis').waitFor();
    await previaErro.getByText('1 indisponíveis').waitFor();
    await previaErro.getByText('1 com imagem').waitFor();
    await previaErro.getByText('2 itens').first().waitFor();
    assert.equal(await dialogo.getByRole('alert').count(), 0, 'prévia válida não mostra erros');
    assert.equal(await acao.isEnabled(), true, 'prévia válida habilita a importação');
    assert.equal(req.importacoes.length, 0, 'prévia sozinha nunca grava');

    // ------------------------------------------- cancelar a confirmação
    await acao.click();
    const confirmacao = page.getByRole('alertdialog', { name: 'Substituir o cardápio inteiro?' });
    await confirmacao.waitFor();
    await confirmacao.getByText(/O cardápio atual sai de linha .* 4 produtos em 2 categorias/).waitFor();
    await confirmacao.getByRole('button', { name: 'Cancelar' }).click();
    await confirmacao.waitFor({ state: 'hidden' });
    assert.equal(req.importacoes.length, 0, 'cancelar não importa nada');
    assert.equal(await acao.isEnabled(), true, 'dá para tentar de novo depois de cancelar');

    // ------------------------------------------------------ importar
    const cardapiosAntes = req.cardapios;
    await acao.click();
    await confirmacao.waitFor();
    await confirmacao.getByRole('button', { name: 'Substituir cardápio' }).click();

    const sucesso = dialogo.getByRole('status');
    await sucesso.getByText('Cardápio importado').waitFor();
    assert.equal(req.importacoes.length, 1);
    assert.equal(req.importacoes[0].confirmar, true, 'a etapa 2 envia confirmar: true');
    assert.equal(req.importacoes[0].modo, 'substituir', 'modo principal vem selecionado');
    assert.equal(req.importacoes[0].csv, CSV_OK);

    const textoSucesso = await sucesso.innerText();
    assert.match(textoSucesso, /4 produtos cadastrados em 2 categorias \(1 nova\)\./);
    assert.match(textoSucesso, /1 produto do cardápio anterior saiu de linha/);
    assert.equal(await dialogo.getByText('Substituir cardápio', { exact: true }).count(), 0, 'prévia some no sucesso');
    assert.ok(req.cardapios > cardapiosAntes, 'o cardápio é recarregado depois de importar');

    // ------------------------------- segundo arquivo, modo "atualizar"
    await dialogo.getByRole('button', { name: 'Importar outro arquivo' }).click();
    await dialogo.getByText('Arraste o arquivo aqui').waitFor();
    await dialogo.getByRole('region', { name: 'Prévia da importação' }).waitFor({ state: 'hidden' });

    await input.setInputFiles(arquivo('cardapio_completo.csv', CSV_OK));
    await previaErro.getByText('Lanches').first().waitFor();
    const radioAtualizar = dialogo.getByRole('radio', { name: /Atualizar produtos existentes/ });
    assert.equal(await dialogo.getByRole('radio', { name: /Substituir cardápio inteiro/ }).isChecked(), true);
    await radioAtualizar.check();
    const atualizar = dialogo.getByRole('button', { name: 'Atualizar cardápio', exact: true });
    await atualizar.waitFor();

    // ------------------------------- falha do servidor não apaga o cardápio
    req.falharImportacao = true;
    await atualizar.click();
    const confirmacaoAtualizar = page.getByRole('alertdialog', { name: 'Atualizar o cardápio?' });
    await confirmacaoAtualizar.waitFor();
    await confirmacaoAtualizar.getByText(/Os 4 produtos do arquivo serão atualizados ou criados/).waitFor();
    await confirmacaoAtualizar.getByRole('button', { name: 'Atualizar cardápio' }).click();

    await dialogo.getByText('Falha simulada ao gravar o cardápio. Nada foi alterado.').waitFor();
    assert.equal(await dialogo.getByText('Cardápio importado').count(), 0, 'falha não mostra sucesso');
    assert.equal(req.importacoes.at(-1).modo, 'atualizar');
    assert.equal(req.importacoes.at(-1).confirmar, true);
    assert.equal(await atualizar.isEnabled(), true, 'a prévia continua na tela para tentar de novo');

    // ------------------------------- nova tentativa, agora com sucesso
    req.falharImportacao = false;
    await atualizar.click();
    await confirmacaoAtualizar.waitFor();
    await confirmacaoAtualizar.getByRole('button', { name: 'Atualizar cardápio' }).click();
    await sucesso.getByText('Cardápio importado').waitFor();
    assert.match(await sucesso.innerText(), /4 produtos atualizados em 2 categorias/);
    assert.doesNotMatch(await sucesso.innerText(), /saiu de linha/, 'modo atualizar não arquiva nada');

    // --------------------------------------------------------------- fechar
    await sucesso.getByRole('button', { name: 'Fechar', exact: true }).click();
    await dialogo.waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: 'Cardápio & Estoque', exact: true, level: 1 }).waitFor();
    assert.ok(req.cardapios >= 2, 'cardápio recarregado nas duas importações');

    // Reabre a janela: ponto de restauração vem do servidor, não da memória do modal.
    await page.getByRole('button', { name: 'Importar CSV' }).click();
    await dialogo.waitFor();
    const reverter = dialogo.getByRole('button', { name: 'Reverter última importação', exact: true });
    await reverter.click();
    const confirmarReversao = page.getByRole('alertdialog', { name: 'Reverter última importação?' });
    await confirmarReversao.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(req.reversoes, 0);
    req.bloquearReversao = true;
    await reverter.click();
    await confirmarReversao.getByRole('button', { name: 'Reverter cardápio', exact: true }).click();
    await dialogo.getByText('O estoque mudou. Reversão bloqueada.', { exact: true }).waitFor();
    req.bloquearReversao = false;
    await reverter.click();
    await confirmarReversao.getByRole('button', { name: 'Reverter cardápio', exact: true }).click();
    await dialogo.getByText('Cardápio anterior restaurado.', { exact: true }).waitFor();
    assert.equal(req.reversoes, 2);
    assert.equal(req.ponto.disponivel, false);
    assert.deepEqual(errors, [], 'nenhum erro de runtime na página');
    console.log('cardapio-import: fluxo de prévia → confirmação → resumo OK');
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
