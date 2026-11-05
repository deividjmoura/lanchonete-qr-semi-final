#!/usr/bin/env node
'use strict';

/**
 * Issue #53 — diagnóstico read-only das fotos de cardápio.
 *
 * Mede o que a issue pede no critério 1 ("medir tamanho real das imagens/JSON")
 * SEM alterar nada: só SELECTs de leitura e contagem de bytes.
 *
 * Uso:
 *   DATABASE_URL=postgres://... node scripts/diagnostico-fotos.js
 *   DATABASE_URL=... node scripts/diagnostico-fotos.js --json   # saída para planilha
 *
 * Seguro por construção: nenhuma escrita, nenhum DDL, nenhum DELETE.
 */

const pool = require('../db/pool');

const SAIDA_JSON = process.argv.includes('--json');

async function medir() {
  const out = {};

  // 1. Produtos com foto: quantos, e em que formato está armazenado.
  const { rows: formato } = await pool.query(`
    SELECT
      count(*) FILTER (WHERE foto_url IS NOT NULL AND btrim(foto_url) <> '')       AS com_foto,
      count(*) FILTER (WHERE foto_url LIKE 'data:%')                                AS base64_no_banco,
      count(*) FILTER (WHERE foto_url ~* '^https?://')                              AS url_externa,
      count(*) FILTER (WHERE foto_url LIKE '/uploads/%')                            AS uploads_legado,
      count(*) FILTER (WHERE foto_url LIKE '/assets/%')                             AS asset_estatico,
      count(*) FILTER (WHERE foto_url IS NOT NULL AND btrim(foto_url) <> ''
                         AND foto_url NOT LIKE 'data:%'
                         AND foto_url !~* '^https?://'
                         AND foto_url NOT LIKE '/uploads/%'
                         AND foto_url NOT LIKE '/assets/%')                          AS outro_caminho,
      count(*) FILTER (WHERE foto_url IS NULL OR btrim(foto_url) = '')              AS sem_foto,
      count(*)                                                                      AS total_produtos
    FROM produtos
  `);
  out.formato = formato[0];

  // 2. Bytes efetivamente ocupados no banco pela coluna de foto.
  const { rows: bytes } = await pool.query(`
    SELECT
      coalesce(sum(length(foto_url)), 0)              AS bytes_coluna,
      coalesce(avg(length(foto_url)), 0)              AS media_bytes,
      coalesce(max(length(foto_url)), 0)              AS maior_bytes,
      coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY length(foto_url)), 0) AS mediana_bytes
    FROM produtos
    WHERE foto_url IS NOT NULL AND btrim(foto_url) <> ''
  `);
  out.bytes = bytes[0];

  // 3. O payload que o cliente recebe hoje. Se a resposta da API já entrega
  //    caminho em vez de data-URL, o problema de transporte está resolvido e
  //    o que resta é apenas a alocação no banco.
  const { rows: api } = await pool.query(`
    SELECT
      count(*) FILTER (WHERE foto_url LIKE 'data:%') AS produtos_que_ainda_gerariam_data_url,
      coalesce(sum(length(foto_url)) FILTER (WHERE foto_url LIKE 'data:%'), 0) AS bytes_que_sairiam_do_banco
    FROM produtos
  `);
  out.api = api[0];

  // 4. Tamanho total das tabelas envolvidas (contexto de custo de backup).
  const { rows: tabelas } = await pool.query(`
    SELECT c.relname AS tabela,
           pg_total_relation_size(c.oid) AS bytes_total,
           s.n_live_tup AS linhas
    FROM pg_class c
    JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relname IN ('produtos', 'itens_pedido', 'pedidos', 'mesa_sessoes',
                        'sessao_pagamentos', 'pix_avisos', 'auditoria_eventos')
    ORDER BY bytes_total DESC
  `);
  out.tabelas = tabelas;

  return out;
}

function kb(n) {
  return (Number(n || 0) / 1024).toFixed(1) + ' KB';
}

function mb(n) {
  return (Number(n || 0) / 1024 / 1024).toFixed(2) + ' MB';
}

(async () => {
  try {
    const d = await medir();

    if (SAIDA_JSON) {
      console.log(JSON.stringify(d, null, 2));
      await pool.end();
      return;
    }

    const f = d.formato;
    const b = d.bytes;
    const a = d.api;

    console.log('\n=== #53 · Diagnóstico das fotos de cardápio (read-only) ===\n');

    console.log('--- Onde as fotos estão hoje ---');
    console.log(`Produtos cadastrados ............ ${f.total_produtos}`);
    console.log(`  com foto ....................... ${f.com_foto}`);
    console.log(`    base64 no banco (data:) ...... ${f.base64_no_banco}   <-- #53 pendente se > 0`);
    console.log(`    URL http(s) externa .......... ${f.url_externa}`);
    console.log(`    /assets estático ............. ${f.asset_estatico}`);
    console.log(`    /uploads legado .............. ${f.uploads_legado}`);
    if (Number(f.outro_caminho) > 0) {
      console.log(`    outro caminho relativo ....... ${f.outro_caminho}`);
    }
    console.log(`  sem foto ....................... ${f.sem_foto}`);

    console.log('\n--- Bytes ocupados no banco ---');
    console.log(`Total na coluna foto_url ........ ${mb(b.bytes_coluna)}  (${b.bytes_coluna} bytes)`);
    console.log(`Média por produto ............... ${kb(b.media_bytes)}`);
    console.log(`Mediana por produto ............. ${kb(b.mediana_bytes)}`);
    console.log(`Maior produto ................... ${kb(b.maior_bytes)}`);

    console.log('\n--- O que o cliente baixa hoje ---');
    if (a.produtos_que_ainda_gerariam_data_url === '0' || Number(a.produtos_que_ainda_gerariam_data_url) === 0) {
      console.log('✅ A API NÃO entrega data-URL: o cardápio devolve caminho (/api/cardapio/fotos/:id).');
      console.log('   O problema de transporte (JSON gigante) já está resolvido em main.');
      console.log('   O que resta da #53 é a alocação no banco e o backfill para object storage.');
    } else {
      console.log(`⚠️  ${a.produtos_que_ainda_gerariam_data_url} produto(s) ainda passariam data-URL no JSON.`);
      console.log(`   Volume que sairia do banco: ${mb(a.bytes_que_sairiam_do_banco)}`);
    }

    console.log('\n--- Custo de storage por tabela ---');
    for (const t of d.tabelas) {
      console.log(`  ${String(t.tabela).padEnd(20)} ${mb(t.bytes_total).padStart(10)}   ${t.linhas} linhas`);
    }

    console.log('\n--- Próximo passo ---');
    if (Number(f.base64_no_banco) > 0) {
      console.log('Há fotos em base64 no banco. Para fechar #53:');
      console.log('  1. provisionar o bucket (R2/S3-compatível)');
      console.log('  2. rodar backfill com --dry-run, comparando o total acima');
      console.log('  3. manter a coluna antiga como fallback até validar');
    } else {
      console.log('Nenhuma foto em base64 no banco: o item de alocação já está resolvido.');
    }
    console.log('');

    await pool.end();
  } catch (e) {
    console.error('\n[diagnostico-fotos] falhou:', e && e.message ? e.message : e);
    console.error('Verifique DATABASE_URL (somente leitura é suficiente).\n');
    process.exitCode = 1;
    try { await pool.end(); } catch {}
  }
})();
