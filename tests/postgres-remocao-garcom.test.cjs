'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// Nunca tocar em dados reais: estas fixtures são criadas e removidas no teste.
assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do banco descartável');
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(databaseUrl.hostname), 'PostgreSQL local/CI obrigatório');
assert.strictEqual(databaseUrl.pathname, '/qradmin_test', 'Banco de teste obrigatório');
assert.strictEqual(process.env.NODE_ENV, 'test', 'NODE_ENV=test obrigatório');

const pool = require('../db/pool');
const { listGarcons, setGarcomAtivo, removerGarcom, getGarcomPorToken, assumirEntregaComoGarcom } = require('../db/garcons');
const { iniciarAtendimentoGarcom, transferirMesaAdmin, metricasGarcons } = require('../db/atendimento');

const uid = () => randomUUID().slice(0, 8);
const req = (tag) => `remocao-${tag}-${randomUUID()}`;
test.after(() => pool.end());

async function fixture() {
  const tag = uid();
  const ids = { garcons: [], pedidos: [], sessoes: [], mesas: [], produto: null, categoria: null, staff: [], requests: [] };
  const novoStaff = async (papel) => {
    const row = (await pool.query(
      `INSERT INTO staff(nome,login,senha_hash,papel,ativo) VALUES($1,$2,$3,$4,TRUE) RETURNING id,nome,papel`,
      [`${papel} fixture ${tag}`, `${papel}-${tag}`, 'x'.repeat(60), papel]
    )).rows[0];
    ids.staff.push(row.id);
    return row;
  };
  const novoGarcom = async (nome) => {
    const row = (await pool.query('INSERT INTO garcons(nome,token) VALUES($1,$2) RETURNING id,nome,token,ativo', [`${nome} ${tag}`, randomUUID()])).rows[0];
    ids.garcons.push(row.id);
    return row;
  };
  const novaMesa = async () => {
    // Começa no intervalo habilitado do restaurante; evita colidir com fixtures existentes.
    for (let n = 1; n <= 20; n++) {
      const r = await pool.query(
        `INSERT INTO mesas(numero,status) VALUES($1,'livre') ON CONFLICT(numero) DO NOTHING RETURNING id,numero`, [n]
      );
      if (r.rows[0]) { ids.mesas.push(r.rows[0].id); return r.rows[0]; }
    }
    throw new Error('Nenhuma mesa livre para a fixture');
  };
  const novaSessao = async (mesa, { responsavel = null, fechada = false } = {}) => {
    const r = await pool.query(
      `INSERT INTO mesa_sessoes(mesa_id,status,garcom_responsavel_id,valor_total,valor_cobrado,taxa_servico,fechada_em)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [mesa.id, fechada ? 'fechada' : 'aberta', responsavel, fechada ? 100 : 0, fechada ? 110 : null,
        fechada ? 10 : 0, fechada ? '2026-10-30T15:00:00Z' : null]
    );
    ids.sessoes.push(r.rows[0].id);
    return r.rows[0];
  };
  const novoPedido = async (sessao, g, status = 'entregue') => {
    if (!ids.categoria) {
      ids.categoria = (await pool.query('INSERT INTO categorias(nome,ordem) VALUES($1,0) RETURNING id', [`Categoria ${tag}`])).rows[0].id;
      ids.produto = (await pool.query('INSERT INTO produtos(categoria_id,nome,preco) VALUES($1,$2,100) RETURNING id', [ids.categoria, `Produto ${tag}`])).rows[0].id;
    }
    const pedido = (await pool.query(
      `INSERT INTO pedidos(sessao_id,status,garcom_id,garcom_registrou_id,garcom_entregou_id,garcom_nome)
       VALUES($1,$2,$3,$3,$3,$4) RETURNING id`, [sessao.id, status, g.id, g.nome]
    )).rows[0];
    ids.pedidos.push(pedido.id);
    return pedido;
  };
  const novoItem = async (pedido, g, status) => (await pool.query(
    `INSERT INTO itens_pedido(pedido_id,produto_id,quantidade,preco_unitario,status,aceito_por_id,retirado_por_id,entregue_por_id)
     VALUES($1,$2,1,100,$3,$4,$5,$6) RETURNING id`,
    [pedido.id, ids.produto, status, ['aceito', 'retirado', 'entregue'].includes(status) ? g.id : null,
      status === 'retirado' || status === 'entregue' ? g.id : null, status === 'entregue' ? g.id : null]
  )).rows[0];
  const request = (tag) => { const id = req(tag); ids.requests.push(id); return id; };
  const limpar = async () => {
    if (ids.requests.length) await pool.query('DELETE FROM auditoria_eventos WHERE request_id=ANY($1::text[])', [ids.requests]);
    if (ids.pedidos.length) {
      await pool.query('DELETE FROM itens_pedido_historico WHERE pedido_id=ANY($1::int[])', [ids.pedidos]);
      await pool.query('DELETE FROM itens_pedido WHERE pedido_id=ANY($1::int[])', [ids.pedidos]);
      await pool.query('DELETE FROM pedidos WHERE id=ANY($1::int[])', [ids.pedidos]);
    }
    if (ids.sessoes.length) {
      await pool.query('DELETE FROM mesa_atendimento_historico WHERE sessao_id=ANY($1::int[])', [ids.sessoes]);
      await pool.query('DELETE FROM mesa_sessoes WHERE id=ANY($1::int[])', [ids.sessoes]);
    }
    if (ids.mesas.length) await pool.query('DELETE FROM mesas WHERE id=ANY($1::int[])', [ids.mesas]);
    if (ids.garcons.length) await pool.query('DELETE FROM garcons WHERE id=ANY($1::int[])', [ids.garcons]);
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id=$1', [ids.produto]);
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id=$1', [ids.categoria]);
    if (ids.staff.length) await pool.query('DELETE FROM staff WHERE id=ANY($1::int[])', [ids.staff]);
  };
  return { ids, novoStaff, novoGarcom, novaMesa, novaSessao, novoPedido, novoItem, request, limpar };
}

test('remover difere de desativar, invalida o link, audita e preserva autoria e métricas', async () => {
  const f = await fixture();
  try {
    const admin = await f.novoStaff('admin');
    const caixa = await f.novoStaff('caixa');
    const g = await f.novoGarcom('Histórico');
    const mesa = await f.novaMesa();
    const sessao = await f.novaSessao(mesa, { responsavel: g.id, fechada: true });
    const pedido = await f.novoPedido(sessao, g);
    const item = await f.novoItem(pedido, g, 'entregue');
    await pool.query('INSERT INTO mesa_atendimento_historico(sessao_id,garcom_novo_id) VALUES($1,$2)', [sessao.id, g.id]);

    const antes = (await metricasGarcons({ data: '2026-10-30' })).garcons.find((x) => x.id === g.id);
    assert.equal(antes.vendas, 110);
    assert.equal(antes.atendimentos, 1);
    assert.equal(antes.ticketMedio, 110);
    await assert.rejects(() => removerGarcom(g.id, caixa, f.request('negado')), (e) => e.status === 403);
    const desativar = f.request('desativar');
    await setGarcomAtivo(g.id, false, admin, desativar);
    assert.equal((await getGarcomPorToken(g.token)).ativo, false);
    assert.equal((await listGarcons()).find((x) => x.id === g.id).ativo, false);
    const reativar = f.request('reativar');
    await setGarcomAtivo(g.id, true, admin, reativar);
    assert.equal((await getGarcomPorToken(g.token)).ativo, true, 'desativação mantém o link reativável');

    const remover = f.request('remover');
    assert.equal((await removerGarcom(g.id, admin, remover)).removido, true);
    assert.equal((await listGarcons()).some((x) => x.id === g.id), false);
    assert.equal(await getGarcomPorToken(g.token), null, 'link anterior revogado');
    const guardado = (await pool.query('SELECT ativo,removido_em,token FROM garcons WHERE id=$1', [g.id])).rows[0];
    assert.equal(guardado.ativo, false);
    assert.ok(guardado.removido_em);
    assert.notEqual(guardado.token, g.token);
    await assert.rejects(() => setGarcomAtivo(g.id, true, admin), (e) => e.status === 404);
    await assert.rejects(() => removerGarcom(g.id, admin), (e) => e.status === 404);
    await assert.rejects(() => pool.query('UPDATE garcons SET ativo=TRUE WHERE id=$1', [g.id]), (e) => e.code === '23514');

    const depois = (await metricasGarcons({ data: '2026-10-30' })).garcons.find((x) => x.id === g.id);
    assert.equal(depois.removido, true);
    assert.deepEqual([depois.atendimentos, depois.vendas, depois.ticketMedio], [1, 110, 110]);
    assert.equal((await metricasGarcons({ data: '2026-10-29' })).garcons.some((x) => x.id === g.id), false,
      'removidos sem vendas na data não poluem o desempenho');
    const historico = (await pool.query(
      `SELECT s.garcom_responsavel_id,p.garcom_id,p.garcom_registrou_id,p.garcom_entregou_id,ip.entregue_por_id
       FROM mesa_sessoes s JOIN pedidos p ON p.sessao_id=s.id JOIN itens_pedido ip ON ip.pedido_id=p.id
       WHERE s.id=$1 AND ip.id=$2`, [sessao.id, item.id]
    )).rows[0];
    assert.deepEqual(Object.values(historico).map(Number), Array(5).fill(g.id), 'todas as autorias seguem vinculadas');
    const auditoria = (await pool.query('SELECT ator_tipo,ator_id,acao,contexto FROM auditoria_eventos WHERE request_id=ANY($1::text[]) ORDER BY id', [[desativar, reativar, remover]])).rows;
    assert.deepEqual(auditoria.map((e) => e.acao), ['garcom_desativado', 'garcom_ativado', 'garcom_removido']);
    assert.ok(auditoria.every((e) => e.ator_tipo === 'staff' && Number(e.ator_id) === admin.id));
    assert.equal(JSON.stringify(auditoria).includes(g.token), false, 'auditoria não guarda credenciais');
  } finally { await f.limpar(); }
});

test('mesa aberta e item aceito ou retirado bloqueiam remoção e desativação', async () => {
  const f = await fixture();
  try {
    const admin = await f.novoStaff('admin');
    const g = await f.novoGarcom('Responsável');
    const outro = await f.novoGarcom('Destino');
    const mesa = await f.novaMesa();
    const sessao = await f.novaSessao(mesa, { responsavel: g.id });
    for (const operacao of [() => removerGarcom(g.id, admin), () => setGarcomAtivo(g.id, false, admin)]) {
      await assert.rejects(operacao, (e) => e.status === 409 && e.message.includes(String(mesa.numero)) && /transfira ou encerre/i.test(e.message));
    }
    assert.equal((await getGarcomPorToken(g.token)).ativo, true);
    await transferirMesaAdmin(admin, mesa.numero, outro.id, f.request('transferir'));
    const pedido = await f.novoPedido(sessao, g, 'concluido');
    const item = await f.novoItem(pedido, g, 'aceito');
    for (const operacao of [() => removerGarcom(g.id, admin), () => setGarcomAtivo(g.id, false, admin)]) {
      await assert.rejects(operacao, (e) => e.status === 409 && /item\(ns\) aceito/i.test(e.message));
    }
    await pool.query("UPDATE itens_pedido SET status='retirado',retirado_por_id=$2 WHERE id=$1", [item.id, g.id]);
    await assert.rejects(() => removerGarcom(g.id, admin), (e) => e.status === 409 && /retirado/i.test(e.message));
    await pool.query("UPDATE itens_pedido SET status='entregue',entregue_por_id=$2 WHERE id=$1", [item.id, g.id]);
    await removerGarcom(g.id, admin, f.request('remover-entregue'));
    assert.equal((await listGarcons()).some((x) => x.id === g.id), false);
    assert.equal((await pool.query('SELECT entregue_por_id FROM itens_pedido WHERE id=$1', [item.id])).rows[0].entregue_por_id, g.id);
  } finally { await f.limpar(); }
});

test('remoção concorrente com nova atribuição não cria mesa órfã', async () => {
  for (let i = 0; i < 6; i++) {
    const f = await fixture();
    try {
      const admin = await f.novoStaff('admin');
      const g = await f.novoGarcom('Concorrência');
      const mesa = await f.novaMesa();
      const resultados = await Promise.allSettled([
        removerGarcom(g.id, admin, f.request('corrida-remover')),
        iniciarAtendimentoGarcom(g.token, mesa.numero, {}, f.request('corrida-iniciar')),
      ]);
      const [remocao, inicio] = resultados;
      if (inicio.status === 'fulfilled') f.ids.sessoes.push(inicio.value.sessaoId);
      assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1, 'apenas uma ação pode confirmar');
      if (remocao.status === 'fulfilled') assert.equal(inicio.reason.status, 401);
      else assert.equal(remocao.reason.status, 409);
      const state = (await pool.query(
        `SELECT g.ativo,g.removido_em,COUNT(s.id)::int AS abertas FROM garcons g
         LEFT JOIN mesa_sessoes s ON s.garcom_responsavel_id=g.id AND s.status='aberta'
         WHERE g.id=$1 GROUP BY g.id`, [g.id]
      )).rows[0];
      assert.ok(!(state.removido_em && state.abertas), 'cadastro removido nunca fica responsável por mesa aberta');
      if (state.abertas) assert.equal(state.ativo, true);
    } finally { await f.limpar(); }
  }
});

test('remoção concorrente com aceite ou transferência não deixa responsabilidades em cadastro removido', async () => {
  for (const tipo of ['aceite', 'transferencia']) {
    for (let i = 0; i < 3; i++) {
      const f = await fixture();
      try {
        const admin = await f.novoStaff('admin');
        const g = await f.novoGarcom('Concorrente');
        const outro = await f.novoGarcom('Atual');
        const mesa = await f.novaMesa();
        const sessao = await f.novaSessao(mesa, { responsavel: outro.id });
        let item = null;
        let operacao;
        if (tipo === 'aceite') {
          const pedido = await f.novoPedido(sessao, outro, 'concluido');
          item = await f.novoItem(pedido, outro, 'concluido');
          operacao = () => assumirEntregaComoGarcom(pedido.id, g.token, f.request('corrida-aceite'), [item.id]);
        } else {
          operacao = () => transferirMesaAdmin(admin, mesa.numero, g.id, f.request('corrida-transferencia'));
        }
        const [remocao, outra] = await Promise.allSettled([
          removerGarcom(g.id, admin, f.request('corrida-remover')), operacao(),
        ]);
        assert.equal([remocao, outra].filter((r) => r.status === 'fulfilled').length, 1, `${tipo}: só uma ação confirma`);
        if (outra.status === 'fulfilled') assert.equal(remocao.reason.status, 409);
        else assert.ok([401, 409].includes(outra.reason.status), `${tipo}: rejeição clara`);
        const state = (await pool.query(
          `SELECT g.ativo,g.removido_em,
            EXISTS(SELECT 1 FROM mesa_sessoes WHERE status='aberta' AND garcom_responsavel_id=g.id) AS mesa_pendente,
            EXISTS(SELECT 1 FROM itens_pedido ip JOIN pedidos p ON p.id=ip.pedido_id
                   JOIN mesa_sessoes s ON s.id=p.sessao_id AND s.status='aberta'
                   WHERE ip.status='aceito' AND ip.aceito_por_id=g.id) AS aceite_pendente
           FROM garcons g WHERE g.id=$1`, [g.id]
        )).rows[0];
        assert.ok(!(state.removido_em && (state.mesa_pendente || state.aceite_pendente)), `${tipo}: sem responsabilidade órfã`);
      } finally { await f.limpar(); }
    }
  }
});
