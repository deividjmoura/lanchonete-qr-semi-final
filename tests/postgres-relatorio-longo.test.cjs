'use strict';

/**
 * Integração PostgreSQL real do relatório financeiro completo e exportações (#299).
 *
 * Verifica contra banco descartável (`qradmin_test`):
 *  1. Período sem vendas (`0` contas, listas vazias, conciliação exata).
 *  2. Período longo com >500 contas fechadas (612 contas distribuídas por dias,
 *     garçons e sem garçom, com descontos, serviço e conta legada sem `valor_total`):
 *     - chamada sem paginação retorna todas as 612 contas (sem truncamento em 500);
 *     - soma de `contas`, `porDia`, `porGarcom` e `resumo` concilia 100%;
 *     - `vendasBrutas - descontosTotal + servicoTotal === totalCobrado`;
 *     - paginação por lotes (`page` + `limit=200`) percorre 200 + 200 + 200 + 12 = 612
 *       sem duplicar nem omitir contas, mantendo `resumo`/`porGarcom`/`porDia` do
 *       período completo;
 *     - CSV gerado a partir dos lotes tem 1 cabeçalho + 612 linhas completas.
 *  3. Fronteiras inclusivas em `America/Sao_Paulo` (`00:00:00.000-03` e `23:59:59.999-03`).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do banco descartável de teste');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(url.hostname), 'Só roda em banco descartável');
assert.equal(url.pathname, '/qradmin_test', 'Bloqueado fora de qradmin_test');
assert.equal(process.env.NODE_ENV, 'test');

const pool = require('../db/pool');
const { relatorioVendas } = require('../db/relatorio');

function carregarGerarCsv() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'relatorioCsv.ts'), 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const mod = { exports: {} };
  vm.runInNewContext(outputText, { module: mod, exports: mod.exports });
  return mod.exports.gerarCsvRelatorio;
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

test('#299: relatório financeiro com >500 contas fechadas, paginação determinística, fronteiras SP e período vazio', async () => {
  const sufixo = randomUUID().slice(0, 8);
  const gerarCsvRelatorio = carregarGerarCsv();
  const ids = {
    mesa: null,
    garcons: [],
    categoria: null,
    produto: null,
    sessoes: [],
    pedidos: [],
  };

  // Usamos um ano isolado no passado (2019) para não colidir com dados sintéticos de outras suítes.
  const FROM = '2019-05-01';
  const TO = '2019-05-31';
  const VAZIO_FROM = '2018-02-01';
  const VAZIO_TO = '2018-02-28';

  try {
    const mesaRow = await pool.query(
      'INSERT INTO mesas (numero) VALUES (1) ON CONFLICT (numero) DO UPDATE SET numero = EXCLUDED.numero RETURNING id'
    );
    ids.mesa = mesaRow.rows[0].id;

    for (const nome of [`Garçom A ${sufixo}`, `Garçom B ${sufixo}`]) {
      const g = await pool.query('INSERT INTO garcons (nome) VALUES ($1) RETURNING id', [nome]);
      ids.garcons.push(g.rows[0].id);
    }

    ids.categoria = (
      await pool.query('INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id', [`Cat Rel ${sufixo}`])
    ).rows[0].id;
    ids.produto = (
      await pool.query(
        "INSERT INTO produtos (categoria_id, nome, preco, setor) VALUES ($1, $2, 25, 'cozinha') RETURNING id",
        [ids.categoria, `Item Rel ${sufixo}`]
      )
    ).rows[0].id;

    // 1. Período vazio antes de inserir qualquer venda nesse intervalo.
    const vazio = await relatorioVendas({ from: VAZIO_FROM, to: VAZIO_TO });
    assert.equal(vazio.resumo.contasFechadas, 0);
    assert.equal(vazio.resumo.totalCobrado, 0);
    assert.deepEqual(vazio.contas, []);
    assert.deepEqual(vazio.porDia, []);
    assert.deepEqual(vazio.porGarcom, []);
    assert.equal(vazio.paginacao.total, 0);
    assert.equal(vazio.paginacao.hasMore, false);

    // 2. Fronteiras externas que NÃO podem entrar em [2019-05-01 .. 2019-05-31] (America/Sao_Paulo -03:00).
    for (const tsFora of [
      '2019-04-30T23:59:59.999-03:00',
      '2019-06-01T00:00:00.000-03:00',
    ]) {
      const s = await pool.query(
        `INSERT INTO mesa_sessoes
           (mesa_id, status, aberta_em, fechada_em, valor_total, desconto, taxa_servico, valor_cobrado, forma_pagamento)
         VALUES ($1, 'fechada', $2::timestamptz - interval '1 hour', $2::timestamptz, 99, 0, 0, 99, 'pix')
         RETURNING id`,
        [ids.mesa, tsFora]
      );
      ids.sessoes.push(s.rows[0].id);
    }

    // 3. Insere 612 contas fechadas dentro do período, incluindo os extremos exatos do fuso SP:
    //    - conta #0 em 2019-05-01 00:00:00.000-03:00
    //    - conta #610 em 2019-05-31 23:59:59.999-03:00
    //    - conta #611 legada com valor_total = NULL e valor_cobrado = NULL (calculada pelos itens entregues)
    const TOTAL_CONTAS = 612;
    let esperadoBruto = 0;
    let esperadoDesconto = 0;
    let esperadoServico = 0;
    let esperadoCobrado = 0;

    // 611 contas com valores explícitos em lote via UNNEST para manter o teste rápido (<1s).
    const abertas = [];
    const fechadas = [];
    const garcomIds = [];
    const clientes = [];
    const brutos = [];
    const descontos = [];
    const servicos = [];
    const cobrados = [];
    const formas = [];

    for (let i = 0; i < TOTAL_CONTAS - 1; i++) {
      let fechadaIso;
      if (i === 0) {
        fechadaIso = '2019-05-01T00:00:00.000-03:00';
      } else if (i === TOTAL_CONTAS - 2) {
        fechadaIso = '2019-05-31T23:59:59.999-03:00';
      } else {
        const dia = String((i % 28) + 2).padStart(2, '0');
        const hora = String(10 + (i % 12)).padStart(2, '0');
        const min = String(i % 60).padStart(2, '0');
        fechadaIso = `2019-05-${dia}T${hora}:${min}:00.000-03:00`;
      }
      const bruto = 40 + (i % 7) * 5;
      const desconto = i % 10 === 0 ? 3 : 0;
      const servico = i % 4 === 0 ? 4 : 0;
      const cobrado = bruto - desconto + servico;
      const garcom = i % 3 === 0 ? ids.garcons[0] : i % 3 === 1 ? ids.garcons[1] : null;
      const forma = ['pix', 'credito', 'debito', 'dinheiro'][i % 4];

      abertas.push(fechadaIso);
      fechadas.push(fechadaIso);
      garcomIds.push(garcom);
      clientes.push(`Cliente Longo ${i + 1}`);
      brutos.push(bruto);
      descontos.push(desconto);
      servicos.push(servico);
      cobrados.push(cobrado);
      formas.push(forma);

      esperadoBruto += bruto;
      esperadoDesconto += desconto;
      esperadoServico += servico;
      esperadoCobrado += cobrado;
    }

    const batchRes = await pool.query(
      `INSERT INTO mesa_sessoes
         (mesa_id, garcom_responsavel_id, cliente_nome, status, aberta_em, fechada_em,
          valor_total, desconto, taxa_servico, valor_cobrado, forma_pagamento)
       SELECT
         $1,
         u.garcom_id,
         u.cliente,
         'fechada',
         u.fechada_em - interval '45 minutes',
         u.fechada_em,
         u.bruto,
         u.desconto,
         u.servico,
         u.cobrado,
         u.forma
       FROM UNNEST(
         $2::int[],
         $3::text[],
         $4::timestamptz[],
         $5::numeric[],
         $6::numeric[],
         $7::numeric[],
         $8::numeric[],
         $9::text[]
       ) AS u(garcom_id, cliente, fechada_em, bruto, desconto, servico, cobrado, forma)
       RETURNING id`,
      [ids.mesa, garcomIds, clientes, fechadas, brutos, descontos, servicos, cobrados, formas]
    );
    for (const r of batchRes.rows) ids.sessoes.push(r.id);

    // Conta #612: legada (valor_cobrado = NULL antes da migration 0007), calculada por valor_total (50) - desconto (5) + taxa_servico (5).
    const legada = await pool.query(
      `INSERT INTO mesa_sessoes
         (mesa_id, garcom_responsavel_id, cliente_nome, status, aberta_em, fechada_em,
          valor_total, desconto, taxa_servico, valor_cobrado, forma_pagamento)
       VALUES ($1, $2, 'Cliente Legado 612', 'fechada',
               '2019-05-15T19:00:00-03:00', '2019-05-15T20:00:00-03:00',
               50, 5, 5, NULL, 'pix')
       RETURNING id`,
      [ids.mesa, ids.garcons[0]]
    );
    const sessaoLegadaId = legada.rows[0].id;
    ids.sessoes.push(sessaoLegadaId);
    const pedLegado = await pool.query(
      `INSERT INTO pedidos (sessao_id, status, criado_em)
       VALUES ($1, 'entregue', '2019-05-15T19:10:00-03:00') RETURNING id`,
      [sessaoLegadaId]
    );
    ids.pedidos.push(pedLegado.rows[0].id);
    await pool.query(
      `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, status, setor)
       VALUES ($1, $2, 2, 25, 'entregue', 'cozinha')`,
      [pedLegado.rows[0].id, ids.produto]
    );
    esperadoBruto += 50;
    esperadoDesconto += 5;
    esperadoServico += 5;
    esperadoCobrado += 50; // 50 - 5 + 5

    // 4. Consulta completa (sem page/limit): deve devolver TODAS as 612 contas, sem truncar em 500.
    const completo = await relatorioVendas({ from: FROM, to: TO });
    assert.equal(completo.resumo.contasFechadas, TOTAL_CONTAS);
    assert.equal(completo.contas.length, TOTAL_CONTAS, 'não pode truncar contas em 500');
    assert.equal(completo.paginacao.total, TOTAL_CONTAS);
    assert.equal(completo.paginacao.hasMore, false);

    assert.equal(completo.resumo.vendasBrutas, r2(esperadoBruto));
    assert.equal(completo.resumo.descontosTotal, r2(esperadoDesconto));
    assert.equal(completo.resumo.servicoTotal, r2(esperadoServico));
    assert.equal(completo.resumo.totalCobrado, r2(esperadoCobrado));
    assert.equal(
      r2(completo.resumo.vendasBrutas - completo.resumo.descontosTotal + completo.resumo.servicoTotal),
      completo.resumo.totalCobrado
    );

    // Conciliação entre resumo, contas, porDia e porGarcom.
    const somaContasCobrado = r2(completo.contas.reduce((acc, c) => acc + c.valorCobrado, 0));
    const somaContasBruto = r2(completo.contas.reduce((acc, c) => acc + c.valor, 0));
    const somaPorDiaCobrado = r2(completo.porDia.reduce((acc, d) => acc + d.faturamento, 0));
    const somaPorDiaQtd = completo.porDia.reduce((acc, d) => acc + d.contas, 0);
    const somaPorGarcomCobrado = r2(completo.porGarcom.reduce((acc, g) => acc + g.totalCobrado, 0));
    const somaPorGarcomBruto = r2(completo.porGarcom.reduce((acc, g) => acc + g.vendasBrutas, 0));
    const somaPorGarcomQtd = completo.porGarcom.reduce((acc, g) => acc + g.contas, 0);

    assert.equal(somaContasCobrado, completo.resumo.totalCobrado);
    assert.equal(somaContasBruto, completo.resumo.vendasBrutas);
    assert.equal(somaPorDiaCobrado, completo.resumo.totalCobrado);
    assert.equal(somaPorDiaQtd, TOTAL_CONTAS);
    assert.equal(somaPorGarcomCobrado, completo.resumo.totalCobrado);
    assert.equal(somaPorGarcomBruto, completo.resumo.vendasBrutas);
    assert.equal(somaPorGarcomQtd, TOTAL_CONTAS);

    // Extremos exatos em America/Sao_Paulo incluídos nos dias corretos.
    assert.equal(completo.porDia[0].dia, '2019-05-01');
    assert.equal(completo.porDia[completo.porDia.length - 1].dia, '2019-05-31');

    // 5. Paginação determinística (lotes de 200) percorre 200 + 200 + 200 + 12 = 612 sem lacuna nem duplicata.
    const acumulado = [];
    let pagina = 1;
    while (true) {
      const lote = await relatorioVendas({ from: FROM, to: TO, page: pagina, limit: 200 });
      assert.equal(lote.resumo.contasFechadas, TOTAL_CONTAS, 'resumo reflete o período inteiro em qualquer página');
      assert.equal(
        lote.porGarcom.reduce((a, g) => a + g.contas, 0),
        TOTAL_CONTAS,
        'porGarcom reflete o período inteiro mesmo quando contas é paginado'
      );
      acumulado.push(...lote.contas);
      if (!lote.paginacao.hasMore) break;
      pagina++;
    }
    assert.equal(pagina, 4, '612 contas em lotes de 200 exigem exatamente 4 páginas');
    assert.equal(acumulado.length, TOTAL_CONTAS);
    assert.deepEqual(
      acumulado.map((c) => c.id),
      completo.contas.map((c) => c.id),
      'ordem paginada idêntica à consulta completa, sem duplicatas nem omissões'
    );

    // 6. Exportação CSV gerada a partir dos lotes tem todas as 612 contas.
    const csv = gerarCsvRelatorio(acumulado);
    assert.equal(csv.split('\n').length, TOTAL_CONTAS + 1);
  } finally {
    if (ids.pedidos.length) {
      await pool.query('DELETE FROM itens_pedido WHERE pedido_id = ANY($1::int[])', [ids.pedidos]).catch(() => {});
      await pool.query('DELETE FROM pedidos WHERE id = ANY($1::int[])', [ids.pedidos]).catch(() => {});
    }
    if (ids.sessoes.length) {
      await pool.query('DELETE FROM mesa_sessoes WHERE id = ANY($1::int[])', [ids.sessoes]).catch(() => {});
    }
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id = $1', [ids.produto]).catch(() => {});
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id = $1', [ids.categoria]).catch(() => {});
    if (ids.garcons.length) {
      await pool.query('DELETE FROM garcons WHERE id = ANY($1::int[])', [ids.garcons]).catch(() => {});
    }
    await pool.end();
  }
});
