'use strict';
// Dashboard interativo sobre o build real com API simulada.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;
const { criarDashboard, aguardarLayoutDashboard } = require('./fixtures/dashboard.cjs');
const base = process.env.VISUAL_BASE_URL || 'http://localhost:4173';

async function novoContexto(browser, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion, serviceWorkers: 'block' });
  await context.addInitScript(() => sessionStorage.setItem('pub-auth', JSON.stringify({ role: 'admin', nome: 'Admin' })));
  const estado = { pedidos: [], erro: false, parcial: false, atrasarMes: false, liberarMes: null, chegouMes: null };
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/me') return route.fulfill({ json: { staff: { id: 1, papel: 'admin', nome: 'Admin', deveTrocarSenha: false }, csrfToken: 'csrf' } });
    if (path === '/api/admin/dashboard') {
      const periodo = url.searchParams.get('periodo');
      estado.pedidos.push(periodo);
      if (estado.atrasarMes && periodo === 'mes') {
        await new Promise((resolve) => { estado.liberarMes = resolve; estado.chegouMes?.(); });
      }
      if (estado.erro) return route.fulfill({ status: 503, json: { error: 'Indisponível' } });
      if (estado.parcial) return route.fulfill({ json: { periodo: { chave: periodo }, faturamento: 0 } });
      const faturamento = { hoje: 1284.5, semana: 5200, mes: 21100 }[periodo];
      return route.fulfill({ json: criarDashboard({
        periodo, faturamento, contasFechadas: 24, pedidosTotal: 42,
        pagamentos: { formas: [{ forma: 'pix', valor: 400 }, { forma: 'cartao_debito', valor: 500 }], semDetalhamento: 384.5, excedente: 5 },
        topProdutos: Array.from({ length: 8 }, (_, i) => ({ nome: `Item especial ${i + 1}`, quantidade: 30 - i })),
      }) });
    }
    if (path === '/api/admin/mesas/panorama') {
      const agora = Date.now();
      const mesa = (numero, aberta) => ({
        id: numero, numero, token: `tk-${numero}`,
        status: aberta ? 'ocupada' : 'livre',
        pracaId: 1, pracaNome: 'Praia', pracaOrdem: 1,
        sessaoId: aberta ? 900 + numero : null,
        abertaEm: aberta ? new Date(agora - 40 * 60000).toISOString() : null,
        tempo: null,
        clienteNome: aberta ? `Cliente ${numero}` : null,
        garcomResponsavelId: aberta ? 2 : null,
        garcomResponsavelNome: aberta ? 'Bruno Tavares' : null,
        consumo: aberta ? 120.5 : 0, pago: aberta ? 30 : 0, saldo: aberta ? 90.5 : 0,
        pedidosAtivos: aberta ? 2 : 0, pedidosRecebidos: 1, pedidosPreparo: 1,
        pedidosProntos: aberta ? 1 : 0, itensNaFila: aberta ? 3 : 0, itensProntosRetirada: 0,
      });
      return route.fulfill({ json: {
        config: { quantidade: 4, limite: 70, faixas: { atencaoMinutos: 45, criticoMinutos: 90 } },
        pracas: [{ id: 1, nome: 'Praia', ordem: 1, mesas: 4 }],
        mesas: [mesa(1, true), mesa(2, true), mesa(3, false), mesa(4, false)],
        vendas: { periodo: url.searchParams.get('periodo') || 'hoje', timezone: 'America/Sao_Paulo', desde: null, ate: null, porMesa: [] },
        fluxo: { janela: { horas: 24, desde: null, ate: null }, amostraMinima: 5, limiteEtapaHoras: 12, etapas: [], setores: {} },
        atualizadoEm: new Date().toISOString(),
      } });
    }
    if (path.includes('event')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': teste\n\n' });
    return route.fulfill({ json: [] });
  });
  return { context, estado };
}

async function main() {
  const browser = await chromium.launch({
    executablePath: await binary.executablePath(),
    args: [...binary.args.filter((a) => a !== '--single-process' && a !== '--no-zygote'), '--no-sandbox'],
    headless: true,
  });
  try {
    const { context, estado } = await novoContexto(browser);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/#/admin', { waitUntil: 'load' });
    const grupo = page.getByRole('group', { name: 'Período do dashboard' });
    await grupo.getByRole('button', { name: 'Hoje' }).waitFor();
    assert.equal(await grupo.getByRole('button', { name: 'Hoje' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.card-neon').count(), 12);
    const faturamento = page.getByRole('button', { name: /Detalhar Faturamento/ });
    await faturamento.getByText('R$ 1.284,50').waitFor();

    // As opções de cards funcionam por teclado, têm nome e foco retorna ao
    // acionador ao fechar com Escape (dialog nativo/modal).
    await faturamento.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Faturamento' });
    await dialog.waitFor();
    await dialog.getByText('Período anterior', { exact: true }).waitFor();
    await dialog.getByText('Média por dia', { exact: true }).waitFor();
    await dialog.getByText('Média equivalente a 7 dias').waitFor();
    await dialog.getByText('Histórico do período').waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await faturamento.evaluate((e) => document.activeElement === e), 'foco retorna ao card');

    const detalhes = [
      ['Pedidos', 'Média de pedidos por dia'], ['Ticket médio', 'Faturamento'],
      ['Contas fechadas', 'Média por dia'], ['Taxa de serviço', 'Descontos no período'],
      ['Pagamentos', 'Sem detalhamento de pagamento'], ['Mais pedidos', 'Item especial 8'],
      ['Tempo de entrega', 'Unidades com horário de entrega'], ['Consumo em aberto', 'Saldo pendente estimado'],
      ['Garçons ativos', 'Garçons com cadastro ativo'], ['Itens em operação', 'Prontos para retirada'],
    ];
    for (const [nome, conteudo] of detalhes) {
      await page.getByRole('button', { name: new RegExp(`^Detalhar ${nome}:`) }).click();
      const modal = page.getByRole('dialog', { name: nome, exact: true });
      await modal.getByText(conteudo, { exact: false }).first().waitFor();
      if (nome === 'Pagamentos') {
        await modal.getByText('Cartão de débito').waitFor();
        await modal.getByText(/lançamentos acima do valor cobrado/).waitFor();
      }
      if (['Consumo em aberto', 'Garçons ativos', 'Itens em operação'].includes(nome)) {
        await modal.getByText(/independente do (filtro|período)/).first().waitFor();
      }
      await modal.getByRole('button', { name: 'Fechar detalhes' }).click();
      await modal.waitFor({ state: 'hidden' });
    }
    /* “Mesas ocupadas” não abre o detalhe do card: cobre o painel com as
       mesas abertas, no estilo do dashboard, com quem pediu e quem leva. */
    await page.getByRole('button', { name: /^Detalhar Mesas ocupadas:/ }).click();
    const mesasAbertas = page.getByRole('dialog', { name: 'Mesas ocupadas', exact: true });
    await mesasAbertas.getByText(/mesas abertas de 4 habilitadas/).waitFor();
    await mesasAbertas.getByText('Consumo em aberto', { exact: true }).first().waitFor();
    assert.equal(await mesasAbertas.locator('.dash-mesa').count(), 2, 'só as mesas com sessão entram');
    await mesasAbertas.getByText('Quem está levando').first().waitFor();
    await mesasAbertas.getByRole('button', { name: 'Fechar mesas abertas' }).click();
    await mesasAbertas.waitFor({ state: 'hidden' });

    const ranking = page.getByRole('region', { name: 'Mais pedidos' });
    assert.equal(await ranking.locator('li').count(), 5);
    await ranking.getByRole('button', { name: 'Carregar mais' }).click();
    assert.equal(await ranking.locator('li').count(), 8);
    await ranking.getByRole('button', { name: 'Mostrar menos' }).click();
    assert.equal(await ranking.locator('li').count(), 5);

    await grupo.getByRole('button', { name: 'Semana' }).click();
    await faturamento.getByText('R$ 5.200,00').waitFor();
    assert.equal(await grupo.getByRole('button', { name: 'Semana' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.dash-chart__track').count(), 5);
    await page.getByRole('button', { name: /Detalhar Mesas ocupadas/ }).getByText('4 / 12').waitFor();
    await page.reload();
    await faturamento.getByText('R$ 5.200,00').waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('qradmin-dashboard-periodo')), 'semana');
    assert.equal(estado.pedidos.at(-1), 'semana', 'sessão preserva o período ao recarregar');

    // Uma resposta antiga e lenta nunca troca os dados do período escolhido depois.
    estado.atrasarMes = true;
    const chegouMes = new Promise((resolve) => { estado.chegouMes = resolve; });
    await grupo.getByRole('button', { name: 'Mês' }).click();
    await chegouMes;
    await grupo.getByRole('button', { name: 'Hoje' }).click();
    await faturamento.getByText('R$ 1.284,50').waitFor();
    estado.liberarMes();
    await page.waitForTimeout(150);
    assert.equal(await grupo.getByRole('button', { name: 'Hoje' }).getAttribute('aria-pressed'), 'true');
    await faturamento.getByText('R$ 1.284,50').waitFor();
    estado.atrasarMes = false;

    // Sem resposta (ou contrato incompleto), não inventar zeros nem reutilizar
    // o período anterior. A tela oferece recuperação explícita.
    estado.erro = true;
    await grupo.getByRole('button', { name: 'Mês' }).click();
    await page.getByRole('alert').getByText(/Não foi possível carregar/).waitFor();
    assert.equal(await faturamento.isDisabled(), true);
    assert.equal(await faturamento.locator('.metric-value').textContent(), '—');
    assert.equal(await page.locator('.dash-chart__track').count(), 0);
    estado.erro = false;
    estado.parcial = true;
    const respostaParcial = page.waitForResponse((response) => response.url().includes('/api/admin/dashboard?periodo=mes'));
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await respostaParcial;
    // Esperar a tentativa de fato falhar, em vez de encontrar o alerta antigo.
    await page.getByRole('alert').getByText(/Não foi possível carregar/).waitFor();
    assert.equal(await faturamento.locator('.metric-value').textContent(), '—');
    estado.parcial = false;
    const respostaCompleta = page.waitForResponse((response) => response.url().includes('/api/admin/dashboard?periodo=mes'));
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await respostaCompleta;
    await faturamento.getByText('R$ 21.100,00').waitFor();
    assert.equal(await page.locator('.dash-chart__track').count(), 30);

    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await aguardarLayoutDashboard(page, width);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `sem overflow em ${width}px`);
      assert.ok(await page.locator('.metric-value').evaluateAll((values) => values.every((e) => e.scrollWidth <= e.clientWidth)), `valores sem truncar em ${width}px`);
    }

    // Mouse fora dos cards também altera o tilt, sem state por mousemove.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.mouse.move(300, 20);
    await page.waitForTimeout(60);
    const primeiro = await page.locator('.dashboard-stage').evaluate((e) => e.style.getPropertyValue('--dash-hx'));
    const transform1 = await page.locator('.card-neon').first().evaluate((e) => getComputedStyle(e).transform);
    await page.mouse.move(1300, 20);
    await page.waitForTimeout(60);
    const segundo = await page.locator('.dashboard-stage').evaluate((e) => e.style.getPropertyValue('--dash-hx'));
    const transform2 = await page.locator('.card-neon').first().evaluate((e) => getComputedStyle(e).transform);
    assert.notEqual(primeiro, segundo, 'parallax acompanha o mouse fora dos cards');
    assert.notEqual(transform1, transform2, 'variáveis alteram o transform');

    // Editor: resize por gesto no canto, visibilidade e persistência explícita.
    await page.getByRole('button', { name: 'Editar dashboard' }).click();
    // Requisito: mover é arraste real de mouse, não setas nem botões de passo.
    assert.equal(await page.locator('.card-neon__resize button, .dashboard-widget__resize button, [aria-label^="Mover "]').count(), 0,
      'o editor não oferece controles direcionais');
    const cardFaturamento = page.locator('[data-dashboard-card="faturamento"]');
    const alca = page.getByRole('button', { name: 'Arraste para redimensionar Faturamento' });
    // Arraste livre com o mouse: o destino é definido pelo ponto de soltura.
    const grade = page.locator('.dashboard-grid');
    assert.ok(await grade.boundingBox(), 'grade do dashboard está visível');

    // Ponto de soltura dentro da área visível da grade, como um mouse real faria.
    const pontoNaGrade = async (fracaoX) => {
      const caixa = await grade.boundingBox();
      return {
        caixa,
        alvo: {
          x: Math.round(caixa.width * fracaoX),
          y: Math.max(10, Math.min(caixa.height - 20, (await page.evaluate(() => innerHeight)) - caixa.y - 40)),
        },
      };
    };
    const esperarPosicaoNova = (seletor, antes) => page.waitForFunction(([alvo, posicaoAntes]) => {
      const el = document.querySelector(alvo);
      return el && (el.style.gridColumn !== posicaoAntes.column || el.style.gridRow !== posicaoAntes.row);
    }, [seletor, antes]);
    const posicaoDe = (locator) => locator.evaluate((el) => ({ column: el.style.gridColumn, row: el.style.gridRow }));
    const semSobreposicaoDeWidgets = () => page.locator('.dashboard-grid').evaluate((gridEl) => {
      const nodes = [...gridEl.querySelectorAll('[data-dashboard-card], [data-dashboard-widget]')];
      const rects = nodes.map((node) => node.getBoundingClientRect());
      return rects.every((a, i) => rects.every((b, j) => i === j ||
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
    });

    const posicaoInicial = await posicaoDe(cardFaturamento);
    const { caixa: caixaGrade, alvo: destinoFaturamento } = await pontoNaGrade(0.22);
    await cardFaturamento.dragTo(grade, { targetPosition: destinoFaturamento });
    await esperarPosicaoNova('[data-dashboard-card="faturamento"]', posicaoInicial);
    const posicaoMovida = await posicaoDe(cardFaturamento);
    assert.notDeepEqual(posicaoMovida, posicaoInicial, 'o card foi movido para o ponto escolhido com o mouse');
    // O destino é respeitado: o card fica embaixo do ponto onde o mouse soltou,
    // mesmo quando a área já estava ocupada por outro widget.
    const caixaMovida = await cardFaturamento.boundingBox();
    const ponteiro = { x: caixaGrade.x + destinoFaturamento.x, y: caixaGrade.y + destinoFaturamento.y };
    assert.ok(ponteiro.x >= caixaMovida.x - 1 && ponteiro.x <= caixaMovida.x + caixaMovida.width + 1 &&
      ponteiro.y >= caixaMovida.y - 1 && ponteiro.y <= caixaMovida.y + caixaMovida.height + 1,
    `o card deve ficar sob o ponteiro (ponteiro ${JSON.stringify(ponteiro)}, card ${JSON.stringify(caixaMovida)})`);

    // O ranking usa o mesmo arraste livre e a mesma proteção contra colisão.
    const rankingWidget = page.locator('[data-dashboard-widget="ranking"]');
    const rankingAntes = await posicaoDe(rankingWidget);
    const { alvo: destinoRanking } = await pontoNaGrade(0.68);
    await rankingWidget.dragTo(grade, { targetPosition: destinoRanking });
    await esperarPosicaoNova('[data-dashboard-widget="ranking"]', rankingAntes);
    assert.notDeepEqual(await posicaoDe(rankingWidget), rankingAntes, 'o ranking também pode ser movido com o mouse');

    const caixaAlca = await alca.boundingBox();
    assert.ok(caixaAlca, 'alça de redimensionamento está visível');
    const tamanhoAntes = await cardFaturamento.evaluate((el) => ({ column: el.style.gridColumn, row: el.style.gridRow }));
    await page.mouse.move(caixaAlca.x + caixaAlca.width / 2, caixaAlca.y + caixaAlca.height / 2);
    await page.mouse.down();
    await page.mouse.move(caixaAlca.x + caixaAlca.width / 2 + 120, caixaAlca.y + caixaAlca.height / 2 + 100, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction((antes) => {
      const card = document.querySelector('[data-dashboard-card="faturamento"]');
      return card && (card.style.gridColumn !== antes.column || card.style.gridRow !== antes.row);
    }, tamanhoAntes);
    const tamanhoDepois = await cardFaturamento.evaluate((el) => ({ column: el.style.gridColumn, row: el.style.gridRow }));
    assert.notEqual(tamanhoDepois.column, tamanhoAntes.column, 'a largura muda ao arrastar a alça');
    assert.notEqual(tamanhoDepois.row, tamanhoAntes.row, 'a altura muda ao arrastar a alça');
    assert.equal(await semSobreposicaoDeWidgets(), true, 'nenhum card ou painel pode se sobrepor aos demais');

    // O gráfico "Semana da casa" também é movido por arraste real. O gesto é
    // feito com o mouse cru para conferir a prévia de encaixe no meio do arraste.
    const graficoWidget = page.locator('[data-dashboard-widget="grafico"]');
    const graficoAntes = await posicaoDe(graficoWidget);
    await graficoWidget.scrollIntoViewIfNeeded();
    const caixaGrafico = await graficoWidget.boundingBox();
    const caixaGradeGrafico = await grade.boundingBox();
    await page.mouse.move(caixaGrafico.x + 30, caixaGrafico.y + 30);
    await page.mouse.down();
    await page.mouse.move(caixaGrafico.x + 90, caixaGrafico.y + 90, { steps: 6 });
    await page.mouse.move(caixaGradeGrafico.x + Math.round(caixaGradeGrafico.width * 0.35), caixaGrafico.y + 60, { steps: 8 });
    const previaEncaixe = page.locator('[data-dashboard-drop-preview]');
    await previaEncaixe.waitFor();
    assert.equal(await previaEncaixe.evaluate((el) => getComputedStyle(el).pointerEvents), 'none',
      'a prévia do encaixe não pode interceptar o mouse');
    await page.mouse.up();
    await esperarPosicaoNova('[data-dashboard-widget="grafico"]', graficoAntes);
    assert.notDeepEqual(await posicaoDe(graficoWidget), graficoAntes, 'o gráfico também pode ser movido com o mouse');
    assert.equal(await semSobreposicaoDeWidgets(), true, 'o gráfico não pode se sobrepor aos demais widgets');

    await page.getByRole('button', { name: 'Ocultar Faturamento' }).click();
    assert.equal(await cardFaturamento.getAttribute('data-visible'), 'false');
    await page.getByRole('button', { name: 'Salvar layout do dashboard' }).click();
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.card-neon').length === 11);
    assert.equal(await page.locator('[data-dashboard-card="faturamento"]').count(), 0, 'card oculto permanece oculto após recarregar');
    await page.getByRole('button', { name: 'Editar dashboard' }).click();
    await page.getByRole('button', { name: 'Exibir Faturamento' }).click();
    await page.getByRole('button', { name: 'Salvar layout do dashboard' }).click();
    await page.getByRole('button', { name: 'Restaurar padrão' }).click();
    const confirmacao = page.getByRole('alertdialog').filter({ hasText: 'Restaurar o dashboard padrão?' });
    await confirmacao.getByRole('button', { name: 'Restaurar padrão' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.card-neon').length === 12);

    // O layout responsivo continua íntegro com o editor aberto.
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await aguardarLayoutDashboard(page, width);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `sem overflow com o editor aberto em ${width}px`);
    }
    assert.deepEqual(errors, []);
    await context.close();

    const reduzido = await novoContexto(browser, 'reduce');
    const reducedPage = await reduzido.context.newPage();
    await reducedPage.goto(base + '/#/admin');
    await reducedPage.getByRole('button', { name: /Detalhar Faturamento/ }).getByText('R$ 1.284,50').waitFor();
    await reducedPage.mouse.move(1300, 20);
    await reducedPage.waitForTimeout(60);
    assert.equal(await reducedPage.locator('.card-neon').first().evaluate((e) => getComputedStyle(e).transform), 'none');
    assert.equal(await reducedPage.locator('.dashboard-stage').evaluate((e) => e.style.getPropertyValue('--dash-hx')), '0');
    await reduzido.context.close();
    console.log('✓ Dashboard: períodos, detalhes, acessibilidade, erro, layout e parallax global/reduced motion.');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
