'use strict';

// Ciclo completo do aviso de nova versão em Chromium real (#301).
//
// A issue exige validar "com bundle antigo e novo", não só o endpoint. Aqui o
// build de produção (servido pelo `vite preview` do runner) roda com o
// endpoint `GET /api/version` controlado pelo teste:
//
//  1. endpoint 503 e falha de rede  → nenhum aviso, nada bloqueado;
//  2. mesma versão do bundle        → nenhum aviso (deploy não aconteceu);
//  3. versão diferente (deploy)     → aviso com "Atualizar agora" e
//                                     "Continuar por enquanto";
//  4. adiar                         → o aviso some, não volta sozinho e a
//                                     escolha sobrevive a recarregar a aba;
//  5. confirmar atualização         → a página recarrega mantendo a rota;
//  6. duas abas                     → adiar em uma dispensa na outra.
//
// Sem banco: `vite preview` + rotas de API simuladas, igual aos demais E2E
// visuais. Um ÚNICO contexto é reaproveitado porque o Chromium do runner roda
// em `--single-process`; fechar contextos em sequência derruba o navegador.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const binary = require('@sparticuz/chromium').default;

const base = process.env.VISUAL_BASE_URL;
if (!base) {
  throw new Error('VISUAL_BASE_URL ausente. Execute npm run test:e2e para usar o preview isolado do runner.');
}

const SELETOR_AVISO = 'aside[aria-label="Nova versão disponível"]';
const CARREGOU = 'main, aside[role="status"]';

/** Estado controlado pelo teste: muda no meio da execução para simular deploy. */
const estado = { versao: 'erro' };

function responderApi(route) {
  const url = new URL(route.request().url());
  const p = url.pathname;
  if (!p.startsWith('/api/')) return route.fallback();
  if (p === '/api/version') {
    if (estado.versao === 'erro') return route.fulfill({ status: 503, json: { error: 'Versão indisponível' } });
    if (estado.versao === 'rede') return route.abort('failed');
    return route.fulfill({
      headers: { 'cache-control': 'no-store, max-age=0' },
      json: { version: estado.versao, app: 'qradmin' },
    });
  }
  if (p === '/api/me') {
    return route.fulfill({
      json: {
        staff: { id: 1, papel: 'cozinha', nome: 'Cozinha', deveTrocarSenha: false },
        csrfToken: 'csrf-test',
      },
    });
  }
  if (p.endsWith('/garcons-ativos')) return route.fulfill({ json: { garcons: [] } });
  if (p.includes('event')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' });
  return route.fulfill({ json: [] });
}

async function main() {
  const browser = await chromium.launch({
    args: [...binary.args, '--no-sandbox'],
    executablePath: await binary.executablePath(),
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    // Em about:blank o storage é inacessível; só roda na própria aplicação.
    await context.addInitScript(() => {
      if (!location.origin.startsWith('http')) return;
      sessionStorage.setItem('pub-auth', JSON.stringify({ role: 'cozinha', nome: 'Cozinha' }));
    });
    await context.route('**/api/**', responderApi);

    const page = await context.newPage();
    // `goto` para a MESMA URL com hash é navegação no mesmo documento e não
    // remontaria o SPA: as recargas usam `reload()` para simular um deploy novo.
    const abrirCozinha = async () => {
      if (page.url().startsWith(base)) await page.reload();
      else await page.goto(base + '/#/cozinha');
      await page.waitForSelector(CARREGOU, { timeout: 30_000 });
    };

    // 0) Versão embutida no bundle em execução (mesma fonte que o servidor lê).
    const { version: versaoDoBundle } = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'build-version.json'), 'utf8')
    );
    assert.match(versaoDoBundle, /^[a-f0-9]{16}$/, 'o bundle do dist/ precisa carregar a versão de build');

    // 1) Endpoint indisponível e falha de rede: nenhum aviso, nada bloqueado.
    for (const cenario of ['erro', 'rede']) {
      estado.versao = cenario;
      await abrirCozinha();
      await page.waitForTimeout(1500);
      assert.equal(await page.locator(SELETOR_AVISO).count(), 0, `${cenario}: falha não pode gerar aviso`);
      assert.ok(await page.locator('#root *').count() > 0, `${cenario}: a tela precisa continuar montada`);
    }

    // 2) Mesma versão do bundle: sem aviso.
    estado.versao = versaoDoBundle;
    await abrirCozinha();
    await page.waitForTimeout(2000);
    assert.equal(await page.locator(SELETOR_AVISO).count(), 0, 'sem deploy não pode avisar');

    // 3) Deploy: a aba ABERTA detecta a versão nova na próxima verificação
    // (aqui disparada pelo foco, como quando o operador volta para a aba; em
    // produção o intervalo de 60s faz o mesmo sozinho).
    estado.versao = 'ffffffffffffffff';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const aviso = page.locator(SELETOR_AVISO);
    await aviso.waitFor({ timeout: 15_000 });
    assert.match(await aviso.innerText(), /Nova versão disponível/);
    /* O bloco de novidades só aparece quando há nota POSTERIOR à versão que a
       aba executa (`package.json` do build). Um deploy sem bump de versão — que
       é o caso de um ajuste pequeno — mostra o banner sem lista, e isso é
       correto: melhor não anunciar novidade que não foi registrada. A tela
       `#/novidades` (passo 7) é quem sempre mostra o histórico. */
    assert.equal(await aviso.getByRole('button', { name: 'Atualizar agora' }).count(), 1);
    assert.equal(await aviso.getByRole('button', { name: 'Continuar por enquanto' }).count(), 1);

    // 4) Adiar: some, não volta sozinho e sobrevive a recarregar a aba.
    await aviso.getByRole('button', { name: 'Continuar por enquanto' }).click();
    await aviso.waitFor({ state: 'detached' });
    await page.waitForTimeout(2500);
    assert.equal(await aviso.count(), 0, 'adiar não pode reabrir o aviso');
    await abrirCozinha();
    await page.waitForTimeout(2500);
    assert.equal(
      await page.locator(SELETOR_AVISO).count(),
      0,
      'adiamento da mesma versão precisa continuar valendo depois de recarregar'
    );

    // Limpa a marca de adiamento para testar a atualização confirmada.
    await page.evaluate(() => localStorage.clear());
    await abrirCozinha();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.locator(SELETOR_AVISO).waitFor({ timeout: 15_000 });

    // 5) Confirmar "Atualizar agora": a confirmação é o modal do produto (não
    // `confirm()` nativo), depois a página recarrega mantendo a rota.
    const urlAntes = page.url();
    await page.locator(SELETOR_AVISO).getByRole('button', { name: 'Atualizar agora' }).click();
    const dialogo = page.getByRole('alertdialog');
    await dialogo.waitFor({ timeout: 10_000 });
    assert.match(await dialogo.innerText(), /Atualizar para a nova versão/);
    await Promise.all([
      page.waitForEvent('framenavigated', { timeout: 20_000 }),
      dialogo.getByRole('button', { name: 'Atualizar agora' }).click(),
    ]);
    assert.equal(page.url(), urlAntes, 'atualizar recarrega a mesma rota, sem perder o contexto');
    assert.match(page.url(), /#\/cozinha/, 'a tela onde o operador estava é preservada');
    await page.waitForSelector(CARREGOU, { timeout: 30_000 });

    // 6) Duas abas: adiar em uma dispensa o aviso na outra.
    await page.evaluate(() => localStorage.clear());
    const outraAba = await context.newPage();
    for (const aba of [page, outraAba]) {
      if (aba === page) await aba.reload();
      else await aba.goto(base + '/#/cozinha');
      await aba.waitForSelector(CARREGOU, { timeout: 30_000 });
      await aba.evaluate(() => window.dispatchEvent(new Event('focus')));
      await aba.locator(SELETOR_AVISO).waitFor({ timeout: 15_000 });
    }
    await page.locator(SELETOR_AVISO).getByRole('button', { name: 'Continuar por enquanto' }).click();
    await outraAba.locator(SELETOR_AVISO).waitFor({ state: 'detached', timeout: 10_000 });
    assert.equal(await outraAba.locator(SELETOR_AVISO).count(), 0, 'adiar em uma aba precisa dispensar nas outras');
    await outraAba.close();

    // 7) A tela de novidades (#/novidades) lista o changelog e é acessível a
    // qualquer pessoa logada, sem sair do fluxo de trabalho.
    // A navegação pelo rodapé só existe quando há novidade registrada; ir direto
    // pela rota garante que a TELA é validada em qualquer deploy.
    await page.evaluate(() => { location.hash = '#/novidades'; });
    await page.waitForFunction(() => location.hash === '#/novidades', null, { timeout: 15_000 });
    await page.getByRole('heading', { name: 'O que mudou' }).waitFor({ timeout: 20_000 });
    const textoNovidades = await page.locator('main').innerText();
    assert.match(textoNovidades, /Como funciona o aviso de atualização/);
    assert.match(textoNovidades, /v\d+\.\d+\.\d+/, 'as notas mostram a versão legível');
    // O changelog publicado é lido de public/novidades.json: a entrega que
    // corrigiu o aviso precisa estar registrada para o operador.
    assert.match(textoNovidades, /aviso de atualiza/i, 'sem changelog, o operador não sabe o que mudou');

    console.log('✓ #301: aviso de nova versão e changelog validados em Chromium real (bundle do dist/)');
  } finally {
    await browser.close();
  }
}

main().catch((erro) => {
  console.error('✗ FALHOU #301 aviso de nova versão:', erro);
  process.exit(1);
});
