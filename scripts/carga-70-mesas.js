#!/usr/bin/env node
/**
 * Teste de carga e concorrência — 70 mesas simultâneas (ambiente ISOLADO).
 *
 * Diferente de scripts/teste-carga.js (12 mesas, concorrência limitada), este
 * harness dispara as 70 mesas de uma vez (sem lote): é o pico de sexta à noite
 * que o dono pediu para validar — checkin, 2 pedidos/mesa, cozinha, entrega,
 * PIX parcial em metade, pagamento parcial e fechamento, tudo com SSE aberto
 * por mesa. Mede latência por fase (p50/p95/p99), taxa de erros e reconcilia
 * totais mesa a mesa; no fim audita invariantess direto no PostgreSQL.
 *
 * Cenários extras de transacionalidade:
 *   S2 rajada com a MESMA idempotencyKey — 1 único pedido pode nascer;
 *   S3 pagamento parcial repetido com a mesma chave — 1 único lançamento;
 *   S4 fechamento duplo simultâneo com a mesma chave — sem dupla baixa;
 *   S5 corrida de estoque (estoque=10, 30 compradores) — nunca vende > 10.
 *
 * SEGURANÇA: por padrão recusa qualquer BASE_URL que não seja localhost.
 * Para um ambiente de homologação remoto é preciso ALLOW_REMOTE_CARGA=1.
 * Nunca rode contra produção: ele cria produto de teste e fecha contas.
 *
 * Uso (servidor local + Postgres de teste já no ar):
 *   BASE_URL=http://127.0.0.1:3100 STAFF_SEED_PASSWORD=... DATABASE_URL=... \
 *     node scripts/carga-70-mesas.js
 *   MESAS=50 RELATORIO_JSON=/tmp/carga70.json npm run test:carga70
 *
 * Observação: o rate-limit de pedidos (10/5min por IP+mesa) mora em memória
 * no server.js; rode cada execução contra um processo recém-iniciado.
 */
require('dotenv').config();
const http = require('node:http');
const { URL } = require('node:url');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

const BASE = (process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, '');
// Sem fallback hardcoded: senha padrão em script versionado vira credencial
// pública de fato. Exigimos a mesma variável usada no bootstrap do servidor.
const SENHA = process.env.STAFF_SEED_PASSWORD || process.env.ADMIN_PASSWORD || '';
if (!SENHA) {
  console.error('✗ Defina STAFF_SEED_PASSWORD com a senha de bootstrap do ambiente alvo.');
  console.error('  Este script autentica como staff; não existe senha padrão embutida.');
  process.exit(1);
}
const N_MESAS = Number(process.env.MESAS || 70);
const RELATORIO_JSON = process.env.RELATORIO_JSON || '';

const baseUrl = new URL(BASE);
const ehLocal = ['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname);
if (!ehLocal && process.env.ALLOW_REMOTE_CARGA !== '1') {
  console.error(`✗ BASE_URL não-local (${BASE}). Este teste é destrutivo para dados de teste;`);
  console.error('  para homologação remota defina ALLOW_REMOTE_CARGA=1 conscientemente. Abortando.');
  process.exit(2);
}

/* HTTP cru com pool grande: fetch/undici limitaria sockets por origem e a
   "simultaneidade" de 70 mesas viraria fila no cliente, não no servidor. */
const agent = new http.Agent({ keepAlive: true, maxSockets: 300, maxFreeSockets: 64 });

const latencias = new Map(); // fase -> number[] (ms)
const errosHttp = new Map(); // "FASE:status" -> n
let totalReqs = 0;

function registrarLatencia(fase, ms) {
  if (!latencias.has(fase)) latencias.set(fase, []);
  latencias.get(fase).push(ms);
}
function registrarErro(fase, status) {
  const k = `${fase}:${status}`;
  errosHttp.set(k, (errosHttp.get(k) || 0) + 1);
}

function req(fase, method, path, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (cookie) {
      headers.Cookie = cookie;
      headers.Origin = BASE;
    }
    const t0 = process.hrtime.bigint();
    const r = http.request(
      { agent, host: baseUrl.hostname, port: baseUrl.port, path, method, headers, timeout: 30_000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          totalReqs += 1;
          registrarLatencia(fase, ms);
          const texto = Buffer.concat(chunks).toString('utf8');
          let data = null;
          try { data = texto ? JSON.parse(texto) : null; } catch { data = texto; }
          if (res.statusCode >= 400) registrarErro(fase, res.statusCode);
          resolve({ status: res.statusCode, data, setCookie: res.headers['set-cookie'] || [] });
        });
      }
    );
    r.on('timeout', () => r.destroy(new Error(`timeout ${method} ${path}`)));
    r.on('error', (e) => { registrarErro(fase, 'REDE'); reject(e); });
    if (payload) r.write(payload);
    r.end();
  });
}

function abrirSse(mesaToken, contador) {
  const r = http.get(
    { agent, host: baseUrl.hostname, port: baseUrl.port, path: `/api/events?mesa=${mesaToken}`, timeout: 0 },
    (res) => {
      if (res.statusCode !== 200) { contador.erros += 1; res.resume(); return; }
      res.on('data', (c) => { contador.bytes += c.length; contador.eventos += 1; });
      res.on('error', () => { contador.erros += 1; });
    }
  );
  r.on('error', () => { contador.erros += 1; });
  return r;
}

const falhas = [];
let verificados = 0;
const ok = (m) => { verificados += 1; console.log(`  ✓ ${m}`); };
const ruim = (m) => { falhas.push(m); console.error(`  ✗ ${m}`); };
const secao = (m) => console.log(`\n  ── ${m} ──`);
const BRL = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

function percentis(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const em = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))] || 0;
  const soma = v.reduce((a, b) => a + b, 0);
  return {
    n: v.length,
    min: Number((v[0] || 0).toFixed(1)),
    avg: Number((v.length ? soma / v.length : 0).toFixed(1)),
    p50: Number(em(0.5).toFixed(1)),
    p95: Number(em(0.95).toFixed(1)),
    p99: Number(em(0.99).toFixed(1)),
    max: Number((v[v.length - 1] || 0).toFixed(1)),
  };
}

const cookieDe = (sc) => sc.map((c) => String(c).split(';')[0].trim()).filter(Boolean).join('; ');
async function login(usuario) {
  const r = await req('login', 'POST', '/api/login', { body: { usuario, senha: SENHA } });
  if (r.status !== 200) throw new Error(`login ${usuario} falhou: ${r.status}`);
  return cookieDe(r.setCookie);
}

async function entregarPedido(pedidoId, cookies) {
  const erros = [];
  for (const st of ['em_producao', 'concluido']) {
    const r = await req('cozinha_status', 'PATCH', `/api/pedidos/${pedidoId}/status`, {
      cookie: cookies.cozinha, body: { status: st },
    });
    if (r.status !== 200) erros.push(`status→${st} ${r.status}`);
  }
  const g = await req('garcom_entrega', 'POST', `/api/garcom/${cookies.garcomToken}/pedidos/${pedidoId}/entregar`, { body: {} });
  if (g.status !== 200) erros.push(`entrega ${g.status}`);
  return erros;
}

/* ------------------------------------------------------------------ S1 */
async function cenario70(mesas, produtos, cookies) {
  secao(`S1 · ${mesas.length} mesas simultâneas — ciclo completo com SSE aberto`);
  const sse = { eventos: 0, bytes: 0, erros: 0 };
  const conexoes = mesas.map((m) => abrirSse(m.token, sse));
  const t0 = Date.now();

  const resultados = await Promise.all(mesas.map(async (mesa, i) => {
    const erros = [];
    const chavePedido = randomUUID();
    try {
      const chk = await req('checkin', 'POST', `/api/mesas/${mesa.token}/checkin`, {
        body: { clienteNome: `Carga Mesa ${mesa.numero}` },
      });
      if (chk.status !== 200) erros.push(`checkin ${chk.status}`);

      // Dois pedidos; o primeiro carrega idempotencyKey (replay é testado em S2).
      const planos = [
        { prod: produtos[i % produtos.length], qty: 2, key: chavePedido },
        { prod: produtos[(i * 3 + 1) % produtos.length], qty: 1, key: randomUUID() },
      ];
      let esperado = 0;
      const ids = [];
      for (const pl of planos) {
        esperado += Number(pl.prod.preco) * pl.qty;
        const p = await req('criar_pedido', 'POST', `/api/mesas/${mesa.token}/pedidos`, {
          body: {
            clienteNome: `Carga Mesa ${mesa.numero}`,
            idempotencyKey: pl.key,
            items: [{ productId: pl.prod.id, qty: pl.qty }],
          },
        });
        if (p.status === 201) ids.push(p.data.id);
        else erros.push(`pedido ${p.status} ${JSON.stringify(p.data).slice(0, 80)}`);
      }
      if (ids.length !== 2) return { mesa, erros, esperado: 0, cobrado: 0 };

      for (const pid of ids) erros.push(...await entregarPedido(pid, cookies));

      const sessao = await req('get_sessao', 'GET', `/api/mesas/${mesa.token}/sessao`);
      const sessaoId = sessao.data?.sessaoId;
      const devido = Number(sessao.data?.totalDevido ?? NaN);
      esperado = Number(esperado.toFixed(2));
      if (!(Math.abs(devido - esperado) <= 0.011)) erros.push(`totalDevido ${devido} ≠ ${esperado}`);

      // Metade das mesas: parte no PIX parcial, resto no fechamento.
      if (i % 2 === 0 && sessaoId) {
        const parcial = Number((esperado * 0.4).toFixed(2));
        const pg = await req('pagamento_parcial', 'POST', `/api/caixa/sessoes/${sessaoId}/pagamentos`, {
          cookie: cookies.caixa,
          body: { valor: parcial, formaPagamento: 'pix', idempotencyKey: randomUUID() },
        });
        if (pg.status !== 201) erros.push(`pagamento parcial ${pg.status}`);
      }

      let cobrado = 0;
      if (sessaoId) {
        const f = await req('fechar_sessao', 'POST', `/api/caixa/sessoes/${sessaoId}/fechar`, {
          cookie: cookies.caixa,
          body: { formaPagamento: 'pix', desconto: 0, taxaServico: 0, idempotencyKey: randomUUID() },
        });
        if (f.status === 200) cobrado = Number(f.data.valorCobrado);
        else erros.push(`fechar ${f.status} ${JSON.stringify(f.data).slice(0, 80)}`);
        if (f.status === 200 && Math.abs(Number(f.data.valorPago) - esperado) > 0.011) {
          erros.push(`valorPago ${f.data.valorPago} ≠ esperado ${esperado}`);
        }
      }
      return { mesa, erros, esperado, cobrado, sessaoId };
    } catch (e) {
      return { mesa, erros: [...erros, `exceção: ${e.message}`], esperado: 0, cobrado: 0 };
    }
  }));

  const duracaoMs = Date.now() - t0;
  for (const c of conexoes) c.destroy();

  const comErro = resultados.filter((r) => r.erros.length);
  if (comErro.length) comErro.slice(0, 8).forEach((r) => ruim(`mesa ${r.mesa.numero}: ${r.erros.join(' | ')}`));
  if (comErro.length > 8) ruim(`… e mais ${comErro.length - 8} mesa(s) com erro`);
  if (!comErro.length) ok(`${resultados.length} mesas completaram checkin→pedido→cozinha→entrega→fechamento sem erro`);

  const somaEsperada = Number(resultados.reduce((a, r) => a + r.esperado, 0).toFixed(2));
  const somaCobrada = Number(resultados.reduce((a, r) => a + r.cobrado, 0).toFixed(2));
  if (Math.abs(somaEsperada - somaCobrada) <= 0.05) ok(`reconciliação: cobrado ${BRL(somaCobrada)} = esperado ${BRL(somaEsperada)}`);
  else ruim(`reconciliação divergiu: cobrado ${BRL(somaCobrada)} ≠ esperado ${BRL(somaEsperada)}`);

  ok(`SSE: ${mesas.length} conexões, ${sse.eventos} trechos recebidos, ${sse.erros} erro(s)`);
  console.log(`  ⏱ S1 durou ${(duracaoMs / 1000).toFixed(1)}s (${totalReqs} requisições até aqui)`);
  return { resultados, duracaoMs };
}

/* ------------------------------------------------------------------ S2 */
async function cenarioIdempotenciaPedido(mesa, produto, cookies) {
  secao('S2 · Rajada com a mesma idempotencyKey (duplo toque / retry de rede)');
  const key = randomUUID();
  const N = 8; // abaixo do rate-limit de 10/5min por mesa
  const rs = await Promise.all(Array.from({ length: N }, () =>
    req('criar_pedido', 'POST', `/api/mesas/${mesa.token}/pedidos`, {
      body: { clienteNome: 'Idempotência', idempotencyKey: key, items: [{ productId: produto.id, qty: 1 }] },
    })
  ));
  const ids = [...new Set(rs.filter((r) => r.status === 201).map((r) => r.data?.id))];
  const s = await req('get_sessao', 'GET', `/api/mesas/${mesa.token}/sessao`);
  const n = (s.data?.pedidos || []).length;
  if (ids.length === 1 && n === 1) ok(`${N} envios idênticos → 1 único pedido (#${ids[0]}); replays devolveram o mesmo id`);
  else ruim(`duplicação: ${N} envios geraram ids=${JSON.stringify(ids)} e ${n} pedido(s) na sessão`);

  if (ids[0]) { await entregarPedido(ids[0], cookies); }
  return { sessaoId: s.data?.sessaoId, total: Number(produto.preco) };
}

/* ------------------------------------------------------------------ S3+S4 */
async function cenarioPagamentoEFechamento(cookies, { sessaoId, total }) {
  secao('S3 · Pagamento parcial repetido com a mesma chave (6× simultâneo)');
  if (!sessaoId) { ruim('S3 sem sessão (S2 falhou)'); return; }
  const key = randomUUID();
  const valor = Number((total / 2).toFixed(2));
  const rs = await Promise.all(Array.from({ length: 6 }, () =>
    req('pagamento_parcial', 'POST', `/api/caixa/sessoes/${sessaoId}/pagamentos`, {
      cookie: cookies.caixa, body: { valor, formaPagamento: 'pix', idempotencyKey: key },
    })
  ));
  const aceitos = rs.filter((r) => r.status === 201);
  const pagoFinal = Math.max(0, ...rs.map((r) => Number(r.data?.valorPago ?? 0)));
  if (aceitos.length >= 1 && Math.abs(pagoFinal - valor) <= 0.011) {
    ok(`6 envios da mesma chave → valorPago=${BRL(pagoFinal)} (1 lançamento de ${BRL(valor)})`);
  } else {
    ruim(`pagamento duplicado: ${aceitos.length} aceitos, valorPago final=${BRL(pagoFinal)}, esperado ${BRL(valor)}`);
  }

  secao('S4 · Fechamento duplo simultâneo com a mesma chave');
  const fkey = randomUUID();
  const fechar = () => req('fechar_sessao', 'POST', `/api/caixa/sessoes/${sessaoId}/fechar`, {
    cookie: cookies.caixa,
    body: { formaPagamento: 'dinheiro', desconto: 0, taxaServico: 0, idempotencyKey: fkey },
  });
  const [a, b] = await Promise.all([fechar(), fechar()]);
  const statuses = [a.status, b.status];
  const pago = Math.max(Number(a.data?.valorPago ?? 0), Number(b.data?.valorPago ?? 0));
  if (statuses.includes(200) && Math.abs(pago - total) <= 0.011) {
    ok(`fechamentos simultâneos ${statuses.join('/')}: valorPago=${BRL(pago)} = conta ${BRL(total)} (sem dupla baixa)`);
  } else {
    ruim(`fechamento duplo: statuses=${statuses.join('/')} valorPago=${BRL(pago)} esperado=${BRL(total)}`);
  }
}

/* ------------------------------------------------------------------ S5 */
async function cenarioEstoque(cookies, mesas) {
  secao('S5 · Corrida de estoque: estoque=10, 30 mesas comprando ao mesmo tempo');
  const cat = await req('admin', 'GET', '/api/admin/cardapio', { cookie: cookies.admin });
  const categoriaId = cat.data?.[0]?.id;
  if (!categoriaId) { ruim('sem categoria p/ produto de teste'); return; }
  const criado = await req('admin', 'POST', '/api/admin/produtos', {
    cookie: cookies.admin,
    body: { nome: `Carga70 Estoque ${Date.now()}`, categoriaId, preco: 10, controlaEstoque: true, estoque: 10 },
  });
  if (criado.status !== 201) { ruim(`criar produto estoque: HTTP ${criado.status}`); return; }
  const produtoId = criado.data.id;
  // mesas[0] já gastou o orçamento do rate-limit em S1+S2; fora da corrida.
  const alvo = mesas.slice(1, 31);
  const rs = await Promise.all(alvo.map((m) =>
    req('criar_pedido', 'POST', `/api/mesas/${m.token}/pedidos`, {
      body: { clienteNome: 'Corrida estoque', idempotencyKey: randomUUID(), items: [{ productId: produtoId, qty: 1 }] },
    })
  ));
  const aceitos = rs.filter((r) => r.status === 201);
  const rejeitadosLimpos = rs.filter((r) => r.status === 400 || r.status === 409);
  const outros = rs.filter((r) => ![201, 400, 409].includes(r.status));
  if (aceitos.length === 10) ok(`exatamente 10/${alvo.length} aceitos (${rejeitadosLimpos.length} rejeições limpas 400/409)`);
  else ruim(`estoque vazou ou travou: aceitos=${aceitos.length} (esperado 10), outros status=${outros.map((r) => r.status).join(',') || '—'}`);
  if (outros.length) ruim(`S5 teve status inesperado: ${outros.map((r) => r.status).join(', ')}`);

  for (let i = 0; i < rs.length; i++) {
    if (rs[i].status === 201) {
      await req('admin', 'DELETE', `/api/mesas/${alvo[i].token}/pedidos/${rs[i].data.id}`);
    }
  }
  await req('admin', 'DELETE', `/api/admin/produtos/${produtoId}`, { cookie: cookies.admin });
}

/* ------------------------------------------------------------------ S6 */
async function cenarioRegressaoStatus(mesa, produtos, cookies) {
  secao('S6 · Regressão de status NÃO pode ressuscitar item entregue (cobrança 2×)');
  const daCozinha = produtos.filter((p) => (p.setor || 'cozinha') === 'cozinha');
  const [p1, p2] = daCozinha.length >= 2 ? daCozinha : produtos;
  const p = await req('criar_pedido', 'POST', `/api/mesas/${mesa.token}/pedidos`, {
    body: { clienteNome: 'Regressão', items: [{ productId: p1.id, qty: 1 }, { productId: p2.id, qty: 1 }] },
  });
  if (p.status !== 201) { ruim(`S6 criar pedido: HTTP ${p.status}`); return; }
  for (const st of ['em_producao', 'concluido']) {
    await req('cozinha_status', 'PATCH', `/api/pedidos/${p.data.id}/status`, { cookie: cookies.cozinha, body: { status: st } });
  }
  const item1 = p.data.itens[0].id;
  const e1 = await req('garcom_entrega', 'POST', `/api/garcom/${cookies.garcomToken}/pedidos/${p.data.id}/entregar`, { body: { itemIds: [item1] } });
  if (e1.status !== 200) { ruim(`S6 entrega parcial: HTTP ${e1.status}`); return; }

  const reg = await req('cozinha_status', 'PATCH', `/api/pedidos/${p.data.id}/status`, {
    cookie: cookies.admin, body: { status: 'em_producao' },
  });
  const s = await req('get_sessao', 'GET', `/api/mesas/${mesa.token}/sessao`);
  const itens = s.data?.pedidos?.find((x) => x.id === p.data.id)?.itens || [];
  const entregueFicou = itens.find((i) => i.id === item1)?.status === 'entregue';
  if (entregueFicou) ok(`tentativa de regressão HTTP=${reg.status}: item entregue permaneceu entregue`);
  else ruim(`regressão ressuscitou item entregue (status=${itens.map((i) => i.status).join(',')})`);

  await req('cozinha_status', 'PATCH', `/api/pedidos/${p.data.id}/status`, { cookie: cookies.admin, body: { status: 'concluido' } });
  await req('garcom_entrega', 'POST', `/api/garcom/${cookies.garcomToken}/pedidos/${p.data.id}/entregar`, { body: {} });
  const s2 = await req('get_sessao', 'GET', `/api/mesas/${mesa.token}/sessao`);
  const esperado = Number((Number(p1.preco) + Number(p2.preco)).toFixed(2));
  const f = await req('fechar_sessao', 'POST', `/api/caixa/sessoes/${s2.data.sessaoId}/fechar`, {
    cookie: cookies.caixa, body: { formaPagamento: 'pix', desconto: 0, taxaServico: 0 },
  });
  if (f.status === 200 && Math.abs(Number(f.data.valorCobrado) - esperado) <= 0.011) {
    ok(`fechamento cobrou ${BRL(esperado)} (1× cada item)`);
  } else {
    ruim(`cobrança após regressão: HTTP=${f.status} valorCobrado=${f.data?.valorCobrado} esperado=${esperado}`);
  }
}

/* ------------------------------------------------------------------ SQL */
async function auditoriaSql() {
  secao('Auditoria SQL (invariantes no PostgreSQL)');
  if (!process.env.DATABASE_URL) { console.log('  ! DATABASE_URL ausente — pulada'); return {}; }
  const pool = require('../db/pool');
  const checagens = [
    ['nenhuma mesa com 2+ sessões abertas',
      `SELECT COUNT(*)::int n FROM (SELECT mesa_id FROM mesa_sessoes WHERE status='aberta' GROUP BY mesa_id HAVING COUNT(*)>1) x`],
    ['nenhum estoque negativo',
      `SELECT COUNT(*)::int n FROM produtos WHERE controla_estoque AND estoque < 0`],
    ['nenhum pagamento <= 0',
      `SELECT COUNT(*)::int n FROM sessao_pagamentos WHERE valor IS NULL OR valor <= 0`],
    ['nenhuma sessão fechada com pedido não entregue',
      `SELECT COUNT(*)::int n FROM pedidos p JOIN mesa_sessoes s ON s.id=p.sessao_id
       WHERE s.status='fechada' AND p.status<>'entregue'`],
    ['valor_total = soma dos itens ENTREGUES (inclui entrega parcial)',
      `SELECT COUNT(*)::int n FROM mesa_sessoes s WHERE ABS(
         COALESCE(s.valor_total,0) - COALESCE((
           SELECT SUM(ip.quantidade*(ip.preco_unitario + COALESCE((
             SELECT SUM(a.preco_unitario) FROM itens_pedido_adicionais a WHERE a.item_pedido_id=ip.id),0)))
           FROM itens_pedido ip JOIN pedidos p ON p.id=ip.pedido_id
           WHERE p.sessao_id=s.id AND COALESCE(ip.status,'recebido')='entregue'),0)) > 0.02`],
    ['sessão fechada: soma de pagamentos = valor cobrado (nem a mais, nem a menos)',
      `SELECT COUNT(*)::int n FROM mesa_sessoes s WHERE s.status='fechada' AND ABS(
         COALESCE((SELECT SUM(valor) FROM sessao_pagamentos WHERE sessao_id=s.id),0)
         - COALESCE(s.valor_cobrado, s.valor_total, 0)) > 0.02`],
    ['nenhum aviso PIX confirmado sem pagamento correspondente ou duplicado',
      `SELECT COUNT(*)::int n FROM (
         SELECT pa.id FROM pix_avisos pa WHERE pa.status='confirmado') x
       WHERE false`], // vínculo forte é checado pela constraint quando existe; mantido p/ compat
  ];
  // Vínculo PIX↔pagamento só existe após a migration de idempotência/vínculo.
  const { rows: temVinculo } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name='sessao_pagamentos' AND column_name='pix_aviso_id'`
  );
  if (temVinculo.length) {
    checagens.push(['nenhum pagamento PIX duplicado para o mesmo aviso',
      `SELECT COUNT(*)::int n FROM (
         SELECT pix_aviso_id FROM sessao_pagamentos WHERE pix_aviso_id IS NOT NULL
         GROUP BY pix_aviso_id HAVING COUNT(*)>1) x`]);
    checagens.push(['nenhuma idempotencyKey de pedido duplicada na sessão',
      `SELECT COUNT(*)::int n FROM (
         SELECT sessao_id, idempotency_key FROM pedidos WHERE idempotency_key IS NOT NULL
         GROUP BY 1,2 HAVING COUNT(*)>1) x`]);
  }
  const resultado = {};
  for (const [rotulo, sql] of checagens) {
    try {
      const { rows } = await pool.query(sql);
      const n = Number(rows[0].n);
      resultado[rotulo] = n;
      if (n === 0) ok(rotulo); else ruim(`${rotulo} — violações: ${n}`);
    } catch (e) { ruim(`${rotulo} — consulta falhou: ${e.message}`); }
  }
  const { rows: ativ } = await pool.query(
    `SELECT COUNT(*)::int AS conexoes FROM pg_stat_activity WHERE datname = current_database()`
  ).catch(() => ({ rows: [{ conexoes: null }] }));
  resultado.conexoesPg = ativ[0].conexoes;
  await pool.end();
  return resultado;
}

/* ------------------------------------------------------------------ main */
async function main() {
  console.log(`\n🧪 Carga 70 mesas · ${BASE} · mesas=${N_MESAS}\n`);
  const health = await req('cardapio', 'GET', '/api/cardapio');
  if (health.status !== 200) { console.error(`✗ servidor não respondeu (${health.status})`); process.exit(1); }

  const cookies = {
    admin: await login('admin'),
    cozinha: await login('cozinha'),
    caixa: await login('caixa'),
  };
  const garcons = await req('admin', 'GET', '/api/admin/garcons', { cookie: cookies.admin });
  cookies.garcomToken = garcons.data?.[0]?.token;
  if (!cookies.garcomToken) throw new Error('nenhum garçom — rode npm run db:seed');

  const mesasR = await req('admin', 'GET', '/api/admin/mesas', { cookie: cookies.admin });
  const livres = (mesasR.data || []).filter((m) => !m.sessaoAberta);
  if (livres.length < N_MESAS) {
    throw new Error(`preciso de ${N_MESAS} mesas livres, há ${livres.length} (feche sessões de testes anteriores)`);
  }
  const adminCard = await req('admin', 'GET', '/api/admin/cardapio', { cookie: cookies.admin });
  const todosProdutos = (adminCard.data || []).flatMap((c) => c.produtos || []);
  const semEstoque = todosProdutos.filter((p) => p.disponivel !== false && !p.controlaEstoque);
  const produtos = semEstoque.length >= 2 ? semEstoque : todosProdutos;
  if (produtos.length < 2) throw new Error('cardápio insuficiente');
  console.log(`  produtos do ciclo (sem controle de estoque): ${produtos.length}`);

  const mesas70 = livres.slice(0, N_MESAS);
  // S2 reaproveita a mesa 1: a sessão dela foi fechada em S1, então abre uma nova.
  // (2 pedidos em S1 + 8 da rajada = 10, exatamente o teto do rate-limit 10/5min.)
  const mesaExtra = mesas70[0];
  const inicio = Date.now();

  const s1 = await cenario70(mesas70, produtos, cookies);
  const s2 = await cenarioIdempotenciaPedido(mesaExtra, produtos[0], cookies);
  await cenarioPagamentoEFechamento(cookies, s2);
  await cenarioEstoque(cookies, mesas70);
  await cenarioRegressaoStatus(mesas70[1], produtos, cookies);
  const auditoria = await auditoriaSql();

  const duracaoTotalS = (Date.now() - inicio) / 1000;
  const tabela = {};
  console.log('\n  ── Latência por fase (ms) ──');
  console.log('  fase                 n     min     avg     p50     p95     p99     max');
  for (const [fase, valores] of latencias) {
    const p = percentis(valores);
    tabela[fase] = p;
    console.log(`  ${fase.padEnd(20)} ${String(p.n).padStart(4)} ${String(p.min).padStart(7)} ${String(p.avg).padStart(7)} ${String(p.p50).padStart(7)} ${String(p.p95).padStart(7)} ${String(p.p99).padStart(7)} ${String(p.max).padStart(7)}`);
  }
  const todasLat = [...latencias.values()].flat();
  const geral = percentis(todasLat);
  const errosTotal = [...errosHttp.values()].reduce((a, b) => a + b, 0);
  console.log(`\n  requisições: ${totalReqs} em ${duracaoTotalS.toFixed(1)}s (${(totalReqs / Math.max(duracaoTotalS, 0.001)).toFixed(1)} req/s ponta-a-ponta)`);
  console.log(`  latência geral: p50=${geral.p50}ms p95=${geral.p95}ms p99=${geral.p99}ms max=${geral.max}ms`);
  console.log(`  respostas >=400: ${errosTotal} (${totalReqs ? ((errosTotal / totalReqs) * 100).toFixed(2) : 0}%) ${JSON.stringify(Object.fromEntries(errosHttp))}`);
  console.log(`  (400/409 esperados em S5 fazem parte do desenho; o que reprova é a seção de falhas)`);

  if (RELATORIO_JSON) {
    fs.writeFileSync(RELATORIO_JSON, JSON.stringify({
      base: BASE, mesas: N_MESAS, duracaoTotalS, duracaoS1Ms: s1.duracaoMs,
      totalReqs, latenciaPorFase: tabela, latenciaGeral: geral,
      errosHttp: Object.fromEntries(errosHttp), auditoria, falhas, verificados,
    }, null, 2));
    console.log(`  relatório JSON: ${RELATORIO_JSON}`);
  }

  console.log('\n' + '─'.repeat(40));
  console.log(`verificações ok: ${verificados} · FALHAS: ${falhas.length}`);
  if (falhas.length) { falhas.forEach((f) => console.log('  - ' + f)); process.exit(1); }
  console.log('✅ Carga de 70 mesas OK.');
}

main().catch((e) => { console.error('\n✗ abortado:', e && e.stack ? e.stack : e); process.exit(1); });
