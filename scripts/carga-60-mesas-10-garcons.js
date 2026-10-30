#!/usr/bin/env node
/**
 * Teste de carga e concorrência — 60 mesas + 10 garçons simultâneos (#158).
 *
 * Complementa scripts/carga-70-mesas.js (foco em mesas/pagamentos com UM
 * garçom). Aqui o alvo é o pico de sexta/sábado com a equipe completa:
 *
 *   S1  60 mesas abertas ao mesmo tempo (checkin → 2 pedidos → produção),
 *       SSE aberto por mesa + painéis staff (cozinha/caixa/admin) + 1 SSE
 *       por garçom, e a fila compartilhada drenada por 10 garçons em
 *       paralelo no fluxo por item (assumir → retirar → entregar);
 *   S2  corrida de aceite: os 10 garçons tentam assumir o MESMO item
 *       pronto ao mesmo tempo — exatamente 1 vence, os demais recebem
 *       403/409 limpos (nenhum 5xx, nenhum item duplicado);
 *   S3  transferência de mesa sob carga: transferências do responsável
 *       acontecem em paralelo com pagamentos/fechamentos das demais
 *       mesas, e duas transferências simultâneas da mesma mesa têm no
 *       máximo 1 vencedora.
 *
 * Mede latência por fase (p50/p95/p99), tempo de propagação SSE (ação →
 * próximo aviso na conexão da mesa), taxa de erro, reconcilia totais mesa
 * a mesa e audita invariantes direto no PostgreSQL.
 *
 * SEGURANÇA: por padrão recusa qualquer BASE_URL que não seja localhost.
 * Para homologação remota é preciso ALLOW_REMOTE_CARGA=1. Nunca rode
 * contra produção: cria garçons/produtos de teste e fecha contas.
 *
 * Uso (servidor local + Postgres de teste já no ar):
 *   BASE_URL=http://127.0.0.1:3100 STAFF_SEED_PASSWORD=... DATABASE_URL=... \
 *     RELATORIO_JSON=/tmp/carga60.json npm run test:carga60
 *
 * Alvos menores servem para smoke do harness (documente no relatório):
 *   MESAS=12 GARCONS=3 node scripts/carga-60-mesas-10-garcons.js
 *
 * Observação: o rate-limit de pedidos (10/5min por IP+mesa) mora em
 * memória no server.js; rode cada execução contra um processo recém-
 * iniciado. Cada mesa faz no máximo 3 pedidos neste roteiro.
 */
require('dotenv').config();
const http = require('node:http');
const { URL } = require('node:url');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

const BASE = (process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, '');
const SENHA = process.env.STAFF_SEED_PASSWORD || process.env.ADMIN_PASSWORD || '';
if (!SENHA) {
  console.error('✗ Defina STAFF_SEED_PASSWORD com a senha de bootstrap do ambiente alvo.');
  process.exit(1);
}
const N_MESAS = Number(process.env.MESAS || 60);
const N_GARCONS = Number(process.env.GARCONS || 10);
const RELATORIO_JSON = process.env.RELATORIO_JSON || '';
const META_P95_ESCRITA_MS = Number(process.env.META_P95_ESCRITA_MS || 500);

const baseUrl = new URL(BASE);
const ehLocal = ['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname);
if (!ehLocal && process.env.ALLOW_REMOTE_CARGA !== '1') {
  console.error(`✗ BASE_URL não-local (${BASE}). Para homologação remota defina ALLOW_REMOTE_CARGA=1. Abortando.`);
  process.exit(2);
}

const agent = new http.Agent({ keepAlive: true, maxSockets: 400, maxFreeSockets: 64 });

const latencias = new Map();
const errosHttp = new Map();
let totalReqs = 0;
const registrarLatencia = (fase, ms) => {
  if (!latencias.has(fase)) latencias.set(fase, []);
  latencias.get(fase).push(ms);
};
const registrarErro = (fase, status) => {
  const k = `${fase}:${status}`;
  errosHttp.set(k, (errosHttp.get(k) || 0) + 1);
};

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

/* SSE com relógio do último evento — é o que permite medir propagação. */
function abrirSse(path, { cookie } = {}) {
  const contador = { eventos: 0, bytes: 0, erros: 0, ultimoEventoEm: 0, fechou: false };
  const headers = cookie ? { Cookie: cookie } : {};
  const r = http.get(
    { agent, host: baseUrl.hostname, port: baseUrl.port, path, headers, timeout: 0 },
    (res) => {
      if (res.statusCode !== 200) { contador.erros += 1; contador.fechou = true; res.resume(); return; }
      res.on('data', (c) => {
        contador.bytes += c.length;
        // heartbeat é comentário (": ping"); evento de verdade tem "event:"
        if (c.includes('event:')) { contador.eventos += 1; contador.ultimoEventoEm = Date.now(); }
      });
      res.on('error', () => { contador.erros += 1; });
      res.on('close', () => { contador.fechou = true; });
    }
  );
  r.on('error', () => { contador.erros += 1; contador.fechou = true; });
  contador.destruir = () => { try { r.destroy(); } catch { /* já fechou */ } };
  return contador;
}

async function esperarEventoSse(contador, desdeMs, timeoutMs = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (contador.ultimoEventoEm > desdeMs) return contador.ultimoEventoEm - desdeMs;
    await new Promise((r) => setTimeout(r, 10));
  }
  return null;
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

async function produzirPedido(pedidoId, produto, cookies) {
  const erros = [];
  for (const st of ['em_producao', 'concluido']) {
    const r = await req('producao_status', 'PATCH', `/api/pedidos/${pedidoId}/status`, {
      cookie: cookies.admin,
      body: { status: st, setor: produto.setor || 'cozinha' },
    });
    if (r.status !== 200) erros.push(`status→${st} ${r.status}`);
  }
  return erros;
}

/* Igual a produzirPedido, mas mede a propagação SSE do jeito certo: o
   relógio começa quando a escrita `concluido` TERMINA no cliente (o
   broadcast sai do servidor antes da resposta HTTP, então o evento pode
   chegar durante a própria requisição — nesse caso a propagação é ~0).
   Medir a partir do início da produção, como nas primeiras rodadas,
   embutia o tempo das duas escritas de status no número do SSE. */
async function produzirPedidoMedindoSse(pedidoId, produto, cookies, contadorSse) {
  const erros = [];
  const ini = await req('producao_status', 'PATCH', `/api/pedidos/${pedidoId}/status`, {
    cookie: cookies.admin,
    body: { status: 'em_producao', setor: produto.setor || 'cozinha' },
  });
  if (ini.status !== 200) erros.push(`status→em_producao ${ini.status}`);
  const eventoAnterior = contadorSse.ultimoEventoEm;
  const fim = await req('producao_status', 'PATCH', `/api/pedidos/${pedidoId}/status`, {
    cookie: cookies.admin,
    body: { status: 'concluido', setor: produto.setor || 'cozinha' },
  });
  const escritaTerminouEm = Date.now();
  if (fim.status !== 200) { erros.push(`status→concluido ${fim.status}`); return erros; }
  if (contadorSse.ultimoEventoEm > eventoAnterior) {
    registrarLatencia('sse_propagacao', Math.max(0, contadorSse.ultimoEventoEm - escritaTerminouEm));
  } else {
    const prop = await esperarEventoSse(contadorSse, escritaTerminouEm);
    if (prop != null) registrarLatencia('sse_propagacao', prop);
  }
  return erros;
}

/* Fluxo por item do garçom: fila compartilhada → assumir → retirar → entregar. */
async function entregarPedidoComoGarcom(garcom, pedidoId) {
  const erros = [];
  const fila = await req('fila_garcom', 'GET', `/api/garcom/${garcom.token}/pedidos`);
  if (fila.status !== 200) return [`fila ${fila.status}`];
  const pronto = (fila.data || []).find((p) => Number(p.id) === Number(pedidoId));
  const itemIds = (pronto?.itens || []).filter((i) => i.status === 'concluido').map((i) => i.id);
  if (!itemIds.length) return [`pedido ${pedidoId} sem itens prontos na fila`];
  const a = await req('garcom_assumir', 'POST', `/api/garcom/${garcom.token}/pedidos/${pedidoId}/assumir-entrega`, { body: { itemIds } });
  if (a.status !== 200) return [`assumir ${a.status} ${JSON.stringify(a.data).slice(0, 80)}`];
  const ret = await req('garcom_retirar', 'POST', `/api/garcom/${garcom.token}/pedidos/${pedidoId}/retirar`, { body: { itemIds } });
  if (ret.status !== 200) erros.push(`retirar ${ret.status}`);
  const ent = await req('garcom_entregar', 'POST', `/api/garcom/${garcom.token}/pedidos/${pedidoId}/entregar`, { body: { itemIds, etapa: 'entregar' } });
  if (ent.status !== 200) erros.push(`entregar ${ent.status}`);
  return erros;
}

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
    ['nenhum item entregue sem autor registrado',
      `SELECT COUNT(*)::int n FROM itens_pedido WHERE status='entregue' AND entregue_por_id IS NULL`],
    ['sessão fechada: soma de pagamentos = valor cobrado',
      `SELECT COUNT(*)::int n FROM mesa_sessoes s WHERE s.status='fechada' AND ABS(
         COALESCE((SELECT SUM(valor) FROM sessao_pagamentos WHERE sessao_id=s.id),0)
         - COALESCE(s.valor_cobrado, s.valor_total, 0)) > 0.02`],
  ];
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

async function main() {
  console.log(`\n🧪 Carga #158 · ${BASE} · mesas=${N_MESAS} garçons=${N_GARCONS}\n`);
  const health = await req('cardapio', 'GET', '/api/cardapio');
  if (health.status !== 200) { console.error(`✗ servidor não respondeu (${health.status})`); process.exit(1); }

  const cookies = { admin: await login('admin'), caixa: await login('caixa'), cozinha: await login('cozinha') };

  /* Setup: garantir N garçons ativos distintos (cria os que faltarem). */
  secao('Setup · garçons');
  const lista0 = await req('admin', 'GET', '/api/admin/garcons', { cookie: cookies.admin });
  let garcons = (lista0.data || []).filter((g) => g.ativo && g.token);
  for (let i = garcons.length; i < N_GARCONS; i++) {
    const c = await req('admin', 'POST', '/api/admin/garcons', {
      cookie: cookies.admin, body: { nome: `Carga60 Garçom ${String(i + 1).padStart(2, '0')}` },
    });
    if (c.status === 201 && c.data?.token) garcons.push(c.data);
    else ruim(`criar garçom ${i + 1}: HTTP ${c.status}`);
  }
  garcons = garcons.slice(0, N_GARCONS);
  if (garcons.length === N_GARCONS && new Set(garcons.map((g) => g.id)).size === N_GARCONS) {
    ok(`${N_GARCONS} garçons ativos com tokens distintos`);
  } else {
    ruim(`garçons insuficientes: ${garcons.length}/${N_GARCONS}`);
  }

  const mesasR = await req('admin', 'GET', '/api/admin/mesas', { cookie: cookies.admin });
  const livres = (mesasR.data || []).filter((m) => !m.sessaoAberta);
  if (livres.length < N_MESAS) throw new Error(`preciso de ${N_MESAS} mesas livres, há ${livres.length}`);
  const mesas = livres.slice(0, N_MESAS);

  const adminCard = await req('admin', 'GET', '/api/admin/cardapio', { cookie: cookies.admin });
  const todos = (adminCard.data || []).flatMap((c) => c.produtos || []);
  const semEstoque = todos.filter((p) => p.disponivel !== false && !p.controlaEstoque);
  const daCozinha = semEstoque.find((p) => (p.setor || 'cozinha') === 'cozinha') || semEstoque[0];
  const doBar = semEstoque.find((p) => p.setor === 'bar') || semEstoque[1] || semEstoque[0];
  if (!daCozinha || !doBar) throw new Error('cardápio insuficiente');
  console.log(`  produtos do ciclo: cozinha=${daCozinha.nome} · bar=${doBar.nome}`);

  /* SSE: 1 por mesa (público) + painéis staff + 1 por garçom. */
  secao('SSE · abrindo conexões');
  const sseMesas = mesas.map((m) => abrirSse(`/api/events?mesa=${m.token}`));
  const ssePaineis = [
    abrirSse('/api/events', { cookie: cookies.cozinha }),
    abrirSse('/api/events', { cookie: cookies.caixa }),
    abrirSse('/api/events', { cookie: cookies.admin }),
    ...garcons.map((g) => abrirSse(`/api/events?garcom=${g.token}`)),
  ];
  const totalSse = sseMesas.length + ssePaineis.length;
  ok(`${totalSse} conexões SSE solicitadas (${N_MESAS} mesas + 3 painéis + ${N_GARCONS} garçons)`);

  const t0 = Date.now();

  /* S1a: 60 mesas em paralelo — checkin + 2 pedidos + produção. */
  secao(`S1 · ${N_MESAS} mesas simultâneas — checkin, pedidos e produção`);
  const resultados = await Promise.all(mesas.map(async (mesa, i) => {
    const erros = [];
    let esperado = 0;
    const ids = [];
    try {
      const chk = await req('checkin', 'POST', `/api/mesas/${mesa.token}/checkin`, {
        body: { clienteNome: `Carga60 Mesa ${mesa.numero}` },
      });
      if (chk.status !== 200) erros.push(`checkin ${chk.status}`);
      const planos = [
        { prod: daCozinha, qty: 2 },
        { prod: doBar, qty: 1 },
      ];
      for (const pl of planos) {
        esperado += Number(pl.prod.preco) * pl.qty;
        const p = await req('criar_pedido', 'POST', `/api/mesas/${mesa.token}/pedidos`, {
          body: {
            clienteNome: `Carga60 Mesa ${mesa.numero}`,
            idempotencyKey: randomUUID(),
            items: [{ productId: pl.prod.id, qty: pl.qty }],
          },
        });
        if (p.status === 201) ids.push({ id: p.data.id, prod: pl.prod });
        else erros.push(`pedido ${p.status} ${JSON.stringify(p.data).slice(0, 80)}`);
      }
      // Propagação SSE: a conclusão do 1º pedido precisa avisar a mesa.
      for (let k = 0; k < ids.length; k++) {
        if (k === 0) {
          erros.push(...await produzirPedidoMedindoSse(ids[k].id, ids[k].prod, cookies, sseMesas[i]));
        } else {
          erros.push(...await produzirPedido(ids[k].id, ids[k].prod, cookies));
        }
      }
      return { mesa, erros, esperado: Number(esperado.toFixed(2)), ids: ids.map((x) => x.id), cobrado: 0, sessaoId: null };
    } catch (e) {
      return { mesa, erros: [...erros, `exceção: ${e.message}`], esperado: 0, ids: [], cobrado: 0, sessaoId: null };
    }
  }));

  /* S1b: fila compartilhada drenada por N garçons em paralelo (round-robin). */
  secao(`S1 · fila compartilhada — ${N_GARCONS} garçons em paralelo (assumir → retirar → entregar)`);
  const tarefas = resultados.flatMap((r, i) => r.ids.map((pid) => ({ r, pid, garcom: garcons[i % N_GARCONS] })));
  await Promise.all(garcons.map(async (g) => {
    for (const t of tarefas.filter((x) => x.garcom.id === g.id)) {
      t.r.erros.push(...await entregarPedidoComoGarcom(g, t.pid));
    }
  }));
  {
    const comErro = resultados.filter((r) => r.erros.length);
    if (comErro.length) comErro.slice(0, 8).forEach((r) => ruim(`mesa ${r.mesa.numero}: ${r.erros.join(' | ')}`));
    if (comErro.length > 8) ruim(`… e mais ${comErro.length - 8} mesa(s) com erro`);
    if (!comErro.length) ok(`${N_MESAS} mesas: checkin→pedido→produção→entrega por ${N_GARCONS} garçons, sem erro`);
  }

  /* S3 (sob carga, antes de fechar): transferências em paralelo aos fechamentos. */
  secao('S3 · transferência de mesa sob carga + fechamentos em paralelo');
  for (const r of resultados) {
    const s = await req('get_sessao', 'GET', `/api/mesas/${r.mesa.token}/sessao`);
    r.sessaoId = s.data?.sessaoId || null;
    const devido = Number(s.data?.totalDevido ?? NaN);
    if (!(Math.abs(devido - r.esperado) <= 0.011)) r.erros.push(`totalDevido ${devido} ≠ ${r.esperado}`);
  }
  const transferencias = { tentativas: 0, aceitas: 0, limpas: 0 };
  const mesasTransferencia = resultados.slice(0, Math.min(5, resultados.length));
  await Promise.all([
    ...mesasTransferencia.map(async (r, k) => {
      // Responsável atual = garçom que entregou os pedidos desta mesa (round-robin).
      const origem = garcons[resultados.indexOf(r) % N_GARCONS];
      const destino = garcons[(resultados.indexOf(r) % N_GARCONS) + 1 < N_GARCONS
        ? (resultados.indexOf(r) % N_GARCONS) + 1 : 0];
      transferencias.tentativas += 1;
      const t = await req('transferir_mesa', 'POST', `/api/garcom/${origem.token}/mesas/${r.mesa.numero}/transferir`, {
        body: { garcomDestinoId: destino.id },
      });
      if (t.status === 200) transferencias.aceitas += 1;
      else if ([400, 403, 409].includes(t.status)) transferencias.limpas += 1;
      else r.erros.push(`transferir ${t.status}`);
      void k;
    }),
    ...resultados.map(async (r, i) => {
      if (i % 2 === 0 && r.sessaoId) {
        const parcial = Number((r.esperado * 0.4).toFixed(2));
        const pg = await req('pagamento_parcial', 'POST', `/api/caixa/sessoes/${r.sessaoId}/pagamentos`, {
          cookie: cookies.caixa,
          body: { valor: parcial, formaPagamento: 'pix', idempotencyKey: randomUUID() },
        });
        if (pg.status !== 201) r.erros.push(`pagamento parcial ${pg.status}`);
      }
      if (r.sessaoId) {
        const f = await req('fechar_sessao', 'POST', `/api/caixa/sessoes/${r.sessaoId}/fechar`, {
          cookie: cookies.caixa,
          body: { formaPagamento: 'pix', desconto: 0, taxaServico: 0, idempotencyKey: randomUUID() },
        });
        if (f.status === 200) r.cobrado = Number(f.data.valorCobrado);
        else r.erros.push(`fechar ${f.status}`);
      }
    }),
  ]);
  if (transferencias.tentativas && transferencias.aceitas + transferencias.limpas === transferencias.tentativas) {
    ok(`S3: ${transferencias.tentativas} transferências sob carga (${transferencias.aceitas} aceitas, ${transferencias.limpas} recusas limpas, 0 erros 5xx)`);
  } else {
    ruim(`S3 transferências: ${JSON.stringify(transferencias)}`);
  }
  {
    const somaEsperada = Number(resultados.reduce((a, r) => a + r.esperado, 0).toFixed(2));
    const somaCobrada = Number(resultados.reduce((a, r) => a + r.cobrado, 0).toFixed(2));
    if (Math.abs(somaEsperada - somaCobrada) <= 0.05) ok(`reconciliação: cobrado ${BRL(somaCobrada)} = esperado ${BRL(somaEsperada)}`);
    else ruim(`reconciliação divergiu: cobrado ${BRL(somaCobrada)} ≠ esperado ${BRL(somaEsperada)}`);
    const comErro = resultados.filter((r) => r.erros.length);
    if (comErro.length) ruim(`${comErro.length} mesa(s) com erro ao final de S1/S3`);
  }

  /* S2: corrida de aceite — 10 garçons, 1 item, exatamente 1 vencedor. */
  secao('S2 · corrida de aceite no mesmo item (só 1 garçom vence)');
  let corrida = { vencedores: 0, recusasLimpas: 0, outros: [] };
  {
    const mesa = mesas[0];
    await req('checkin', 'POST', `/api/mesas/${mesa.token}/checkin`, { body: { clienteNome: 'Carga60 Corrida' } });
    const p = await req('criar_pedido', 'POST', `/api/mesas/${mesa.token}/pedidos`, {
      body: { clienteNome: 'Carga60 Corrida', idempotencyKey: randomUUID(), items: [{ productId: daCozinha.id, qty: 1 }] },
    });
    if (p.status !== 201) {
      ruim(`S2 criar pedido: HTTP ${p.status} (rate-limit de mesa? rode com servidor recém-iniciado)`);
    } else {
      await produzirPedido(p.data.id, daCozinha, cookies);
      const itemIds = (p.data.itens || []).map((i) => i.id);
      const rs = await Promise.all(garcons.map((g) =>
        req('aceite_corrida', 'POST', `/api/garcom/${g.token}/pedidos/${p.data.id}/assumir-entrega`, { body: { itemIds } })
      ));
      corrida.vencedores = rs.filter((r) => r.status === 200).length;
      corrida.recusasLimpas = rs.filter((r) => [400, 403, 409].includes(r.status)).length;
      corrida.outros = rs.filter((r) => ![200, 400, 403, 409].includes(r.status)).map((r) => r.status);
      if (corrida.vencedores === 1 && !corrida.outros.length) {
        ok(`S2: ${N_GARCONS} aceites simultâneos → 1 vencedor, ${corrida.recusasLimpas} recusas limpas`);
      } else {
        ruim(`S2 corrida: vencedores=${corrida.vencedores} recusas=${corrida.recusasLimpas} outros=${corrida.outros.join(',')}`);
      }
      const vencedorIdx = rs.findIndex((r) => r.status === 200);
      if (vencedorIdx >= 0) {
        const g = garcons[vencedorIdx];
        await req('garcom_retirar', 'POST', `/api/garcom/${g.token}/pedidos/${p.data.id}/retirar`, { body: { itemIds } });
        await req('garcom_entregar', 'POST', `/api/garcom/${g.token}/pedidos/${p.data.id}/entregar`, { body: { itemIds, etapa: 'entregar' } });
        const s = await req('get_sessao', 'GET', `/api/mesas/${mesa.token}/sessao`);
        if (s.data?.sessaoId) {
          await req('fechar_sessao', 'POST', `/api/caixa/sessoes/${s.data.sessaoId}/fechar`, {
            cookie: cookies.caixa, body: { formaPagamento: 'pix', desconto: 0, taxaServico: 0, idempotencyKey: randomUUID() },
          });
        }
      }
    }
  }

  /* SSE: estabilidade ao fim do pico. */
  const duracaoMs = Date.now() - t0;
  const todosSse = [...sseMesas, ...ssePaineis];
  const sseErros = todosSse.reduce((a, c) => a + c.erros, 0);
  const sseEventos = todosSse.reduce((a, c) => a + c.eventos, 0);
  const sseCaidas = todosSse.filter((c) => c.fechou).length;
  if (sseErros === 0 && sseCaidas === 0) ok(`SSE estável: ${totalSse} conexões abertas no pico, ${sseEventos} eventos, 0 quedas`);
  else ruim(`SSE instável: erros=${sseErros} conexões fechadas antes do fim=${sseCaidas}/${totalSse}`);
  todosSse.forEach((c) => c.destruir());

  const auditoria = await auditoriaSql();

  const tabela = {};
  console.log('\n  ── Latência por fase (ms) ──');
  console.log('  fase                 n     min     avg     p50     p95     p99     max');
  for (const [fase, valores] of latencias) {
    const p = percentis(valores);
    tabela[fase] = p;
    console.log(`  ${fase.padEnd(20)} ${String(p.n).padStart(4)} ${String(p.min).padStart(7)} ${String(p.avg).padStart(7)} ${String(p.p50).padStart(7)} ${String(p.p95).padStart(7)} ${String(p.p99).padStart(7)} ${String(p.max).padStart(7)}`);
  }
  const fasesEscrita = ['checkin', 'criar_pedido', 'producao_status', 'garcom_assumir', 'garcom_retirar', 'garcom_entregar', 'pagamento_parcial', 'fechar_sessao', 'transferir_mesa'];
  const metas = {};
  for (const f of fasesEscrita) {
    if (tabela[f]) metas[f] = { p95: tabela[f].p95, dentroDaMeta: tabela[f].p95 < META_P95_ESCRITA_MS };
  }
  const foraDaMeta = Object.entries(metas).filter(([, v]) => !v.dentroDaMeta).map(([k]) => k);
  if (foraDaMeta.length) ruim(`p95 de escrita acima da meta de ${META_P95_ESCRITA_MS} ms: ${foraDaMeta.join(', ')}`);
  else ok(`p95 de escrita < ${META_P95_ESCRITA_MS} ms em todas as fases de escrita medidas`);

  const todasLat = [...latencias.values()].flat();
  const geral = percentis(todasLat);
  const errosTotal = [...errosHttp.values()].reduce((a, b) => a + b, 0);
  // 400/409 esperados: recusas limpas da corrida S2 e das transferências S3.
  const errosInesperados = Object.entries(Object.fromEntries(errosHttp))
    .filter(([k]) => !k.startsWith('aceite_corrida:') && !k.startsWith('transferir_mesa:'))
    .reduce((a, [, v]) => a + v, 0);
  if (errosInesperados > 0) ruim(`${errosInesperados} resposta(s) de erro inesperadas (fora corrida/transferência)`);
  console.log(`\n  requisições: ${totalReqs} em ${(duracaoMs / 1000).toFixed(1)}s (${(totalReqs / Math.max(duracaoMs / 1000, 0.001)).toFixed(1)} req/s ponta-a-ponta)`);
  console.log(`  latência geral: p50=${geral.p50}ms p95=${geral.p95}ms p99=${geral.p99}ms max=${geral.max}ms`);
  console.log(`  respostas >=400: ${errosTotal} ${JSON.stringify(Object.fromEntries(errosHttp))} (403/409 de corrida/transferência são o desenho)`);

  if (RELATORIO_JSON) {
    fs.writeFileSync(RELATORIO_JSON, JSON.stringify({
      issue: 158, base: BASE, alvo: { mesas: N_MESAS, garcons: N_GARCONS },
      duracaoTotalS: Number((duracaoMs / 1000).toFixed(1)), totalReqs,
      latenciaPorFase: tabela, latenciaGeral: geral, metas: { metaP95EscritaMs: META_P95_ESCRITA_MS, fases: metas },
      sse: { conexoes: totalSse, eventos: sseEventos, erros: sseErros, conexoesFechadasAntesDoFim: sseCaidas, propagacao: tabela.sse_propagacao || null },
      corridaAceite: corrida, transferenciasSobCarga: transferencias,
      errosHttp: Object.fromEntries(errosHttp), auditoria, falhas, verificados,
    }, null, 2));
    console.log(`  relatório JSON: ${RELATORIO_JSON}`);
  }

  console.log('\n' + '─'.repeat(40));
  console.log(`verificações ok: ${verificados} · FALHAS: ${falhas.length}`);
  if (falhas.length) { falhas.forEach((f) => console.log('  - ' + f)); process.exit(1); }
  console.log(`✅ Carga #158 OK: ${N_MESAS} mesas + ${N_GARCONS} garçons simultâneos, zero erros inesperados.`);
}

main().catch((e) => { console.error('\n✗ abortado:', e && e.stack ? e.stack : e); process.exit(1); });
