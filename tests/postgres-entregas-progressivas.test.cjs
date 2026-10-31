'use strict';

/**
 * Cenário operacional completo contra PostgreSQL real:
 *
 *   pedido QR com itens de cozinha + bar
 *     → bar termina primeiro e o item fica disponível NA HORA para o garçom
 *     → garçom A aceita só o item do bar (a cozinha continua produzindo)
 *     → dois garçons disputam o mesmo item: exatamente um vence
 *     → garçom B ajuda em outro item sem tomar a mesa de A
 *     → só o que foi entregue entra na conta
 *     → cancelamento por item devolve estoque uma única vez
 *     → transferência administrativa e fechamento da comanda
 *
 * Também cobre o replay offline do garçom (mesma chave → mesmo pedido;
 * mesma chave com outro conteúdo → 409) e a revalidação de sessão fechada.
 *
 * Requer DATABASE_URL apontando para o banco descartável qradmin_test.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Este teste roda apenas contra o PostgreSQL descartável de integração');
assert.strictEqual(
  new URL(process.env.DATABASE_URL).pathname,
  '/qradmin_test',
  'Integração bloqueada: database deve ser qradmin_test; produção nunca é permitida'
);

const pool = require('../db/pool');
const pedidos = require('../db/pedidos');
const { getFilaGarcom } = require('../db/pedidos');
const { assumirEntregaComoGarcom, retirarComoGarcom, entregarComoGarcom } = require('../db/entregas');
const { cancelarItem, liberarAceite } = require('../db/itens-operacoes');
const { transferirMesaAdmin, criarPedidoGarcom } = require('../db/atendimento');
const { fecharSessao, listSessoesAbertas } = require('../db/caixa');
const { totalEntregueDaSessao } = require('../db/conta');

const REQ = (nome) => `req-${nome}-ci-${randomUUID().slice(0, 8)}`;
const UUID = () => randomUUID();

// O pool é compartilhado pelo arquivo inteiro: fechar dentro de um teste
// derrubaria os seguintes. Encerramos uma única vez, no fim.
test.after(() => pool.end().catch(() => {}));

/** Fixtures isoladas por execução; nada de dados de produção. */
async function montarCenario() {
  const sufixo = randomUUID().slice(0, 8);
  const ids = { produtos: [], garcons: [], pedidos: [], sessoes: [], staff: null, mesa: null, categoria: null };
  const categoria = await pool.query('INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id', ['CI progressivo ' + sufixo]);
  ids.categoria = categoria.rows[0].id;

  const cozinha = await pool.query(
    `INSERT INTO produtos (categoria_id, nome, preco, disponivel, setor, controla_estoque, estoque)
     VALUES ($1,$2,25.00,TRUE,'cozinha',TRUE,20) RETURNING id`,
    [ids.categoria, 'Prato CI ' + sufixo]
  );
  const bar = await pool.query(
    `INSERT INTO produtos (categoria_id, nome, preco, disponivel, setor, controla_estoque, estoque)
     VALUES ($1,$2,9.50,TRUE,'bar',TRUE,20) RETURNING id`,
    [ids.categoria, 'Bebida CI ' + sufixo]
  );
  ids.produtos.push(cozinha.rows[0].id, bar.rows[0].id);

  for (const nome of ['A', 'B', 'C']) {
    const g = await pool.query(
      'INSERT INTO garcons (nome, token, ativo) VALUES ($1,$2,TRUE) RETURNING id, token',
      [`Garçom ${nome} CI ${sufixo}`, UUID()]
    );
    ids.garcons.push({ id: g.rows[0].id, token: g.rows[0].token, nome: `Garçom ${nome} CI ${sufixo}` });
  }

  const staff = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel) VALUES ($1,$2,$3,'admin') RETURNING id`,
    ['Admin CI ' + sufixo, 'ci-progressivo-' + sufixo, 'x'.repeat(60)]
  );
  ids.staff = { id: staff.rows[0].id, nome: 'Admin CI ' + sufixo };

  // As rotas de atendimento validam mesa entre 1 e 70, então a fixture precisa
  // de um número real e livre. Sorteia na faixa 20..70 (as suítes vizinhas usam
  // 6, 7, 8 e 10) e tenta outro número se houver colisão de UNIQUE.
  let mesaRow = null;
  for (let tentativa = 0; tentativa < 40 && !mesaRow; tentativa++) {
    const numero = 20 + Math.floor(Math.random() * 51);
    try {
      const r = await pool.query(
        "INSERT INTO mesas (numero, token, status) VALUES ($1,$2,'livre') RETURNING id, token, numero",
        [numero, UUID()]
      );
      mesaRow = r.rows[0];
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  assert.ok(mesaRow, 'Não foi possível reservar uma mesa livre para a fixture');
  ids.mesa = mesaRow;

  return {
    ids,
    prato: ids.produtos[0],
    bebida: ids.produtos[1],
    async limpar() {
      for (const pid of ids.pedidos) {
        await pool.query('DELETE FROM itens_pedido_historico WHERE pedido_id=$1', [pid]).catch(() => {});
      }
      for (const sid of ids.sessoes) {
        await pool.query('DELETE FROM auditoria_eventos WHERE alvo_tipo=$1 AND alvo_id=$2', ['sessao', String(sid)]).catch(() => {});
        await pool.query('DELETE FROM auditoria_eventos WHERE alvo_tipo=$1 AND alvo_id=$2', ['mesa_sessao', String(sid)]).catch(() => {});
        const ps = await pool.query('SELECT id FROM pedidos WHERE sessao_id=$1', [sid]).catch(() => ({ rows: [] }));
        for (const p of ps.rows) {
          await pool.query('DELETE FROM itens_pedido_historico WHERE pedido_id=$1', [p.id]).catch(() => {});
          await pool.query('DELETE FROM auditoria_eventos WHERE alvo_tipo=$1 AND alvo_id=$2', ['pedido', String(p.id)]).catch(() => {});
          const its = await pool.query('SELECT id FROM itens_pedido WHERE pedido_id=$1', [p.id]).catch(() => ({ rows: [] }));
          for (const it of its.rows) {
            await pool.query('DELETE FROM auditoria_eventos WHERE alvo_tipo=$1 AND alvo_id=$2', ['item_pedido', String(it.id)]).catch(() => {});
          }
        }
        await pool.query('DELETE FROM pedidos WHERE sessao_id=$1', [sid]).catch(() => {});
        await pool.query('DELETE FROM mesa_sessoes WHERE id=$1', [sid]).catch(() => {});
      }
      if (ids.mesa) await pool.query('DELETE FROM mesas WHERE id=$1', [ids.mesa.id]).catch(() => {});
      for (const g of ids.garcons) await pool.query('DELETE FROM garcons WHERE id=$1', [g.id]).catch(() => {});
      if (ids.staff) await pool.query('DELETE FROM staff WHERE id=$1', [ids.staff.id]).catch(() => {});
      for (const p of ids.produtos) await pool.query('DELETE FROM produtos WHERE id=$1', [p]).catch(() => {});
      if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id=$1', [ids.categoria]).catch(() => {});
    },
  };
}

async function itensDo(pedidoId) {
  const { rows } = await pool.query(
    'SELECT * FROM itens_pedido WHERE pedido_id=$1 ORDER BY id', [pedidoId]
  );
  return rows;
}

test('PostgreSQL real: entrega progressiva por setor, disputa de itens e responsabilidade da mesa', async () => {
  const c = await montarCenario();
  const { ids } = c;
  const [garcomA, garcomB] = ids.garcons;
  const reqs = { create: REQ('create'), prontoBar: REQ('pronto-bar'), claim: REQ('claim'), pick: REQ('pick'), deliver: REQ('deliver') };
  try {
    // 1) Pedido QR único, com um item de cozinha e um do bar.
    const criado = await pedidos.criarPedido(ids.mesa.token, {
      idempotencyKey: 'qr-' + UUID(),
      clienteNome: 'Mesa progressiva',
      note: 'sem pressa',
      items: [
        { productId: c.prato, qty: 2, note: 'ao ponto' },
        { productId: c.bebida, qty: 1, note: 'gelada' },
      ],
    }, null, reqs.create);
    ids.pedidos.push(criado.id);
    ids.sessoes.push(criado.sessaoId);
    assert.equal(criado.mesa, ids.mesa.numero);
    assert.equal(criado.total, 59.5, 'preço vem do servidor, não do cliente');

    const itens = await itensDo(criado.id);
    assert.equal(itens.length, 2);
    const itemCozinha = itens.find((i) => i.setor === 'cozinha');
    const itemBar = itens.find((i) => i.setor === 'bar');
    assert.ok(itemCozinha && itemBar, 'cada item guarda o setor do momento do pedido');
    assert.equal(itemCozinha.observacao, 'ao ponto');
    assert.equal(itemBar.observacao, 'gelada');
    assert.equal(Number(itemCozinha.preco_unitario), 25);

    // 2) Nada aparece para o garçom antes de ficar pronto.
    assert.equal((await getFilaGarcom(garcomA.id)).filter((p) => p.id === criado.id).length, 0);

    // 3) O bar termina primeiro. A cozinha ainda está produzindo.
    await pedidos.setStatusItem(itemCozinha.id, 'em_producao', 'cozinha', { tipo: 'staff', id: ids.staff.id, nome: ids.staff.nome }, reqs.prontoBar);
    await pedidos.setStatusItem(itemBar.id, 'em_producao', 'bar', { tipo: 'staff', id: ids.staff.id, nome: ids.staff.nome }, reqs.prontoBar);
    await pedidos.setStatusItem(itemBar.id, 'concluido', 'bar', { tipo: 'staff', id: ids.staff.id, nome: ids.staff.nome }, reqs.prontoBar);

    const fila = (await getFilaGarcom(garcomA.id)).find((p) => p.id === criado.id);
    assert.ok(fila, 'item pronto do bar aparece imediatamente, sem esperar a cozinha');
    assert.equal(fila.itensProntos, 1);
    assert.equal(fila.itensPendentesProducao, 1);
    const prontoNaFila = fila.itens.find((i) => i.id === itemBar.id);
    assert.equal(prontoNaFila.podeAceitar, true);
    assert.equal(fila.itens.find((i) => i.id === itemCozinha.id).podeAceitar, false);

    // 4) Setor errado não mexe no item do outro setor.
    await assert.rejects(
      () => pedidos.setStatusItem(itemBar.id, 'concluido', 'cozinha', { tipo: 'staff', id: ids.staff.id }, REQ('setor')),
      (e) => e.status === 403
    );

    // 5) Primeiro aceite assume a mesa no servidor.
    const aceite = await assumirEntregaComoGarcom(criado.id, garcomA.token, reqs.claim, [itemBar.id]);
    assert.equal(aceite.responsabilidadeAtribuida, true);
    assert.equal(Number(aceite.responsavelMesa.id), Number(garcomA.id));
    const sessaoAposAceite = await pool.query('SELECT garcom_responsavel_id FROM mesa_sessoes WHERE id=$1', [criado.sessaoId]);
    assert.equal(Number(sessaoAposAceite.rows[0].garcom_responsavel_id), Number(garcomA.id));

    // 6) Só o item do bar mudou; a cozinha segue intacta.
    const depoisAceite = await itensDo(criado.id);
    assert.equal(depoisAceite.find((i) => i.id === itemBar.id).status, 'aceito');
    assert.equal(depoisAceite.find((i) => i.id === itemCozinha.id).status, 'em_producao');
    assert.equal(Number(depoisAceite.find((i) => i.id === itemBar.id).aceito_por_id), Number(garcomA.id));

    // 7) Outro garçom não consegue aceitar o mesmo item nem retirá-lo.
    await assert.rejects(
      () => assumirEntregaComoGarcom(criado.id, garcomB.token, REQ('claim-b'), [itemBar.id]),
      (e) => e.status === 409
    );
    await assert.rejects(
      () => retirarComoGarcom(criado.id, garcomB.token, REQ('pick-b'), [itemBar.id]),
      (e) => e.status === 403
    );

    // 8) Retirada e entrega registram o ator real de cada etapa.
    await retirarComoGarcom(criado.id, garcomA.token, reqs.pick, [itemBar.id]);
    const retirado = (await itensDo(criado.id)).find((i) => i.id === itemBar.id);
    assert.equal(retirado.status, 'retirado');
    assert.ok(retirado.retirado_em, 'retirado mas ainda não entregue tem horário próprio');
    assert.equal(retirado.entregue_em, null);
    assert.equal(await totalEntregueDaSessao(pool, criado.sessaoId), 0, 'retirado ainda não é cobrável');

    await entregarComoGarcom(criado.id, garcomA.token, [itemBar.id], reqs.deliver, 'entregar');
    const entregue = (await itensDo(criado.id)).find((i) => i.id === itemBar.id);
    assert.equal(entregue.status, 'entregue');
    assert.equal(Number(entregue.entregue_por_id), Number(garcomA.id));
    assert.ok(entregue.entregue_em);
    assert.equal(await totalEntregueDaSessao(pool, criado.sessaoId), 9.5, 'só o item entregue entra na conta');

    const pedidoParcial = await pool.query('SELECT status FROM pedidos WHERE id=$1', [criado.id]);
    assert.notEqual(pedidoParcial.rows[0].status, 'entregue', 'pedido não fecha enquanto a cozinha produz');

    // 9) Cozinha termina; garçom B ajuda sem tomar a mesa de A.
    await pedidos.setStatusItem(itemCozinha.id, 'concluido', 'cozinha', { tipo: 'staff', id: ids.staff.id, nome: ids.staff.nome }, REQ('pronto-cozinha'));
    const aceiteB = await assumirEntregaComoGarcom(criado.id, garcomB.token, REQ('claim-help'), [itemCozinha.id]);
    assert.equal(aceiteB.responsabilidadeAtribuida, false, 'ajudante não transfere a mesa');
    assert.equal(Number(aceiteB.responsavelMesa.id), Number(garcomA.id));
    const sessaoDepois = await pool.query('SELECT garcom_responsavel_id FROM mesa_sessoes WHERE id=$1', [criado.sessaoId]);
    assert.equal(Number(sessaoDepois.rows[0].garcom_responsavel_id), Number(garcomA.id));

    await retirarComoGarcom(criado.id, garcomB.token, REQ('pick-help'), [itemCozinha.id]);
    await entregarComoGarcom(criado.id, garcomB.token, [itemCozinha.id], REQ('deliver-help'), 'entregar');

    const finalItens = await itensDo(criado.id);
    assert.deepEqual(finalItens.map((i) => i.status), ['entregue', 'entregue']);
    assert.equal(Number(finalItens.find((i) => i.id === itemCozinha.id).entregue_por_id), Number(garcomB.id));
    const pedidoFinal = await pool.query('SELECT status FROM pedidos WHERE id=$1', [criado.id]);
    assert.equal(pedidoFinal.rows[0].status, 'entregue');
    assert.equal(await totalEntregueDaSessao(pool, criado.sessaoId), 59.5);

    // 10) Histórico por item guarda quem fez cada etapa.
    const historico = await pedidos.listarHistoricoPedido(pool, criado.id);
    const trilhaBar = historico.filter((h) => Number(h.itemId) === Number(itemBar.id)).map((h) => h.status);
    assert.deepEqual(trilhaBar, ['recebido', 'em_producao', 'concluido', 'aceito', 'retirado', 'entregue']);
    const entregaHistorico = historico.find((h) => Number(h.itemId) === Number(itemCozinha.id) && h.status === 'entregue');
    assert.equal(Number(entregaHistorico.garcomId), Number(garcomB.id));

    // 11) Transferência administrativa explícita.
    const garcomC = ids.garcons[2];
    const transfer = await transferirMesaAdmin(ids.staff, ids.mesa.numero, garcomC.id, REQ('transfer'));
    assert.equal(transfer.transferida, true);
    assert.equal(Number(transfer.garcomResponsavelId), Number(garcomC.id));
    const hist = await pool.query(
      'SELECT garcom_anterior_id,garcom_novo_id,alterado_por_staff_id FROM mesa_atendimento_historico WHERE sessao_id=$1 ORDER BY id DESC LIMIT 1',
      [criado.sessaoId]
    );
    assert.equal(Number(hist.rows[0].garcom_anterior_id), Number(garcomA.id));
    assert.equal(Number(hist.rows[0].garcom_novo_id), Number(garcomC.id));
    assert.equal(Number(hist.rows[0].alterado_por_staff_id), Number(ids.staff.id));

    // 12) Fechamento financeiro continua funcionando com o total entregue.
    const fechamento = await fecharSessao(criado.sessaoId, {
      formaPagamento: 'pix', desconto: 0, taxaServico: 0, taxaServicoMotivo: 'Isenção de serviço no cenário de teste', idempotencyKey: UUID(),
    }, ids.staff.nome, { atorTipo: 'staff', atorId: ids.staff.id, requestId: REQ('close') });
    assert.equal(fechamento.status, 'fechada');
    assert.equal(Number(fechamento.valorCobrado), 59.5);
    const mesaLivre = await pool.query('SELECT status FROM mesas WHERE id=$1', [ids.mesa.id]);
    assert.equal(mesaLivre.rows[0].status, 'livre');

    // 13) Depois de fechada, nenhuma etapa de entrega é aceita.
    await assert.rejects(
      () => assumirEntregaComoGarcom(criado.id, garcomA.token, REQ('late'), [itemBar.id]),
      (e) => e.status === 409
    );
  } finally {
    await c.limpar();
  }
});

test('PostgreSQL real: dois garçons disputando o mesmo item — exatamente um vence', async () => {
  const c = await montarCenario();
  const { ids } = c;
  try {
    const criado = await pedidos.criarPedido(ids.mesa.token, {
      idempotencyKey: 'qr-' + UUID(),
      items: [{ productId: c.bebida, qty: 1 }],
    });
    ids.pedidos.push(criado.id);
    ids.sessoes.push(criado.sessaoId);
    const [item] = await itensDo(criado.id);
    await pedidos.setStatusItem(item.id, 'concluido', 'bar', { tipo: 'staff', id: ids.staff.id, nome: ids.staff.nome }, REQ('ready'));

    const resultados = await Promise.allSettled(
      ids.garcons.map((g) => assumirEntregaComoGarcom(criado.id, g.token, REQ('race'), [item.id]))
    );
    const vencedores = resultados.filter((r) => r.status === 'fulfilled');
    const perdedores = resultados.filter((r) => r.status === 'rejected');
    assert.equal(vencedores.length, 1, 'exatamente um garçom assume o item');
    assert.equal(perdedores.length, ids.garcons.length - 1);
    for (const p of perdedores) assert.equal(p.reason.status, 409);

    const vencedor = vencedores[0].value;
    const row = await pool.query('SELECT status,aceito_por_id FROM itens_pedido WHERE id=$1', [item.id]);
    assert.equal(row.rows[0].status, 'aceito');
    assert.equal(Number(row.rows[0].aceito_por_id), Number(vencedor.garcom.id));
    const sessao = await pool.query('SELECT garcom_responsavel_id FROM mesa_sessoes WHERE id=$1', [criado.sessaoId]);
    assert.equal(Number(sessao.rows[0].garcom_responsavel_id), Number(vencedor.garcom.id), 'quem venceu o primeiro item é o responsável');

    const aceites = await pool.query(
      `SELECT COUNT(*)::int AS n FROM itens_pedido_historico WHERE item_pedido_id=$1 AND status='aceito'`, [item.id]
    );
    assert.equal(aceites.rows[0].n, 1, 'a corrida não pode gravar dois aceites');

    // Admin devolve o item para a fila; outro garçom pode assumir depois.
    await liberarAceite(item.id, { tipo: 'staff', id: ids.staff.id, nome: ids.staff.nome }, REQ('release'));
    const devolvido = await pool.query('SELECT status,aceito_por_id,aceito_em FROM itens_pedido WHERE id=$1', [item.id]);
    assert.equal(devolvido.rows[0].status, 'concluido');
    assert.equal(devolvido.rows[0].aceito_por_id, null);
    const outro = ids.garcons.find((g) => Number(g.id) !== Number(vencedor.garcom.id));
    const novoAceite = await assumirEntregaComoGarcom(criado.id, outro.token, REQ('reclaim'), [item.id]);
    assert.equal(Number(novoAceite.garcom.id), Number(outro.id));
    assert.equal(novoAceite.responsabilidadeAtribuida, false, 'devolver o item não devolve a mesa');
  } finally {
    await c.limpar();
  }
});

test('PostgreSQL real: retirada direta concorrente registra autor e não cobra antes da entrega', async () => {
  const c = await montarCenario();
  const { ids } = c;
  try {
    const criado = await pedidos.criarPedido(ids.mesa.token, {
      idempotencyKey: 'qr-' + UUID(), items: [{ productId: c.bebida, qty: 1 }],
    });
    ids.pedidos.push(criado.id);
    ids.sessoes.push(criado.sessaoId);
    const [item] = await itensDo(criado.id);
    await pedidos.setStatusItem(item.id, 'concluido', 'bar', { tipo: 'staff', id: ids.staff.id, nome: ids.staff.nome }, REQ('ready-direto'));
    for (const garcom of ids.garcons) {
      const fila = (await getFilaGarcom(garcom.id)).find((p) => p.id === criado.id);
      assert.equal(fila.itens.find((i) => i.id === item.id).podeRetirar, true);
    }
    const disputas = await Promise.allSettled(ids.garcons.map((g) => retirarComoGarcom(criado.id, g.token, REQ('retirada-direta'), [item.id])));
    const vencedores = disputas.filter((r) => r.status === 'fulfilled');
    const perdedores = disputas.filter((r) => r.status === 'rejected');
    assert.equal(vencedores.length, 1);
    assert.equal(perdedores.length, ids.garcons.length - 1);
    for (const perdedor of perdedores) assert.equal(perdedor.reason.status, 409);
    const vencedor = vencedores[0].value.garcom;
    const row = (await itensDo(criado.id))[0];
    assert.equal(row.status, 'retirado');
    assert.equal(Number(row.aceito_por_id), Number(vencedor.id));
    assert.equal(Number(row.retirado_por_id), Number(vencedor.id));
    assert.ok(row.aceito_em && row.retirado_em);
    const historico = await pool.query(`SELECT status_anterior,status,garcom_id,motivo FROM itens_pedido_historico
      WHERE item_pedido_id=$1 AND status IN ('aceito','retirado') ORDER BY id`, [item.id]);
    assert.deepEqual(historico.rows.map((h) => [h.status_anterior, h.status, Number(h.garcom_id)]), [
      ['concluido', 'aceito', Number(vencedor.id)], ['aceito', 'retirado', Number(vencedor.id)],
    ]);
    assert.match(historico.rows[0].motivo, /implícito/);
    assert.equal(await totalEntregueDaSessao(pool, criado.sessaoId), 0);
    const sessao = await pool.query('SELECT garcom_responsavel_id FROM mesa_sessoes WHERE id=$1', [criado.sessaoId]);
    assert.equal(Number(sessao.rows[0].garcom_responsavel_id), Number(vencedor.id));
    const outro = ids.garcons.find((g) => Number(g.id) !== Number(vencedor.id));
    await assert.rejects(() => entregarComoGarcom(criado.id, outro.token, [item.id], REQ('entrega-indevida'), 'entregar'), (e) => e.status === 403);
    const tokenVencedor = ids.garcons.find((g) => Number(g.id) === Number(vencedor.id)).token;
    await entregarComoGarcom(criado.id, tokenVencedor, [item.id], REQ('entrega-direta'), 'entregar');
    assert.equal(await totalEntregueDaSessao(pool, criado.sessaoId), 9.5);
  } finally { await c.limpar(); }
});

test('PostgreSQL real: lote misto respeita aceites antigos e rejeita o lote inteiro se houver outro dono', async () => {
  const c = await montarCenario();
  const { ids } = c;
  const [ana, bruno] = ids.garcons;
  try {
    const criado = await pedidos.criarPedido(ids.mesa.token, {
      idempotencyKey: 'qr-' + UUID(), items: [{ productId: c.prato, qty: 1 }, { productId: c.bebida, qty: 1 }],
    });
    ids.pedidos.push(criado.id);
    ids.sessoes.push(criado.sessaoId);
    const itens = await itensDo(criado.id);
    const prato = itens.find((i) => Number(i.produto_id) === Number(c.prato));
    const bebida = itens.find((i) => Number(i.produto_id) === Number(c.bebida));
    const staff = { tipo: 'staff', id: ids.staff.id, nome: ids.staff.nome };
    await pedidos.setStatusItem(prato.id, 'concluido', 'cozinha', staff, REQ('prato-pronto'));
    await pedidos.setStatusItem(bebida.id, 'concluido', 'bar', staff, REQ('bebida-pronta'));
    await assumirEntregaComoGarcom(criado.id, ana.token, REQ('aceite-legado'), [bebida.id]);
    await assert.rejects(() => retirarComoGarcom(criado.id, bruno.token, REQ('lote-indevido'), [prato.id, bebida.id]), (e) => e.status === 403);
    const antes = await itensDo(criado.id);
    assert.equal(antes.find((i) => i.id === prato.id).status, 'concluido', 'erro não retira parte do lote');
    assert.equal(antes.find((i) => i.id === bebida.id).status, 'aceito');
    const saida = await retirarComoGarcom(criado.id, ana.token, REQ('lote-misto'), null);
    assert.deepEqual(new Set(saida.itensAfetados), new Set([prato.id, bebida.id]));
    for (const item of await itensDo(criado.id)) {
      assert.equal(item.status, 'retirado');
      assert.equal(Number(item.aceito_por_id), Number(ana.id));
      assert.equal(Number(item.retirado_por_id), Number(ana.id));
    }
    assert.equal(await totalEntregueDaSessao(pool, criado.sessaoId), 0);
    const sessao = await pool.query('SELECT garcom_responsavel_id FROM mesa_sessoes WHERE id=$1', [criado.sessaoId]);
    assert.equal(Number(sessao.rows[0].garcom_responsavel_id), Number(ana.id));
  } finally { await c.limpar(); }
});

test('PostgreSQL real: cancelamento por item devolve estoque uma vez e não bloqueia o fechamento', async () => {
  const c = await montarCenario();
  const { ids } = c;
  try {
    const estoqueAntes = Number((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [c.prato])).rows[0].estoque);
    const criado = await pedidos.criarPedido(ids.mesa.token, {
      idempotencyKey: 'qr-' + UUID(),
      items: [{ productId: c.prato, qty: 3 }, { productId: c.bebida, qty: 1 }],
    });
    ids.pedidos.push(criado.id);
    ids.sessoes.push(criado.sessaoId);
    const itens = await itensDo(criado.id);
    const itemPrato = itens.find((i) => Number(i.produto_id) === Number(c.prato));
    const itemBebida = itens.find((i) => Number(i.produto_id) === Number(c.bebida));
    assert.equal(Number((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [c.prato])).rows[0].estoque), estoqueAntes - 3);

    const ator = { tipo: 'staff', id: ids.staff.id, nome: ids.staff.nome };
    await assert.rejects(() => cancelarItem(itemPrato.id, ator, 'ab'), (e) => e.status === 400);
    const cancelado = await cancelarItem(itemPrato.id, ator, 'Cliente desistiu do prato', REQ('cancel'));
    assert.equal(cancelado.status, 'cancelado');
    assert.equal(Number((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [c.prato])).rows[0].estoque), estoqueAntes);

    // Replay do cancelamento não devolve estoque de novo nem duplica auditoria.
    const replay = await cancelarItem(itemPrato.id, ator, 'Cliente desistiu do prato', REQ('cancel-replay'));
    assert.equal(replay.idempotentReplay, true);
    assert.equal(Number((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [c.prato])).rows[0].estoque), estoqueAntes);
    const eventos = await pool.query(
      `SELECT COUNT(*)::int AS n FROM auditoria_eventos WHERE acao='item_cancelado' AND alvo_id=$1`, [String(itemPrato.id)]
    );
    assert.equal(eventos.rows[0].n, 1);

    const comMotivo = await pool.query('SELECT cancelamento_motivo,cancelado_em,cancelado_por_staff_id FROM itens_pedido WHERE id=$1', [itemPrato.id]);
    assert.equal(comMotivo.rows[0].cancelamento_motivo, 'Cliente desistiu do prato');
    assert.ok(comMotivo.rows[0].cancelado_em);
    assert.equal(Number(comMotivo.rows[0].cancelado_por_staff_id), Number(ids.staff.id));

    // O item cancelado não pode ser produzido nem entregue.
    await assert.rejects(() => pedidos.setStatusItem(itemPrato.id, 'em_producao', 'cozinha', ator, REQ('revive')), (e) => e.status === 409);
    await assert.rejects(
      () => assumirEntregaComoGarcom(criado.id, ids.garcons[0].token, REQ('claim-cancelled'), [itemPrato.id]),
      (e) => e.status === 409
    );

    // O item que sobrou é entregue normalmente e o pedido conclui.
    await pedidos.setStatusItem(itemBebida.id, 'concluido', 'bar', ator, REQ('ready-b'));
    const g = ids.garcons[0];
    await assumirEntregaComoGarcom(criado.id, g.token, REQ('claim-b'), [itemBebida.id]);
    await retirarComoGarcom(criado.id, g.token, REQ('pick-b'), [itemBebida.id]);
    await entregarComoGarcom(criado.id, g.token, [itemBebida.id], REQ('deliver-b'), 'entregar');

    const statusPedido = await pool.query('SELECT status FROM pedidos WHERE id=$1', [criado.id]);
    assert.equal(statusPedido.rows[0].status, 'entregue', 'item cancelado não impede a conclusão do pedido');
    assert.equal(await totalEntregueDaSessao(pool, criado.sessaoId), 9.5, 'item cancelado nunca é cobrado');

    // Item entregue não pode ser cancelado.
    await assert.rejects(() => cancelarItem(itemBebida.id, ator, 'tentativa indevida', REQ('late-cancel')), (e) => e.status === 409);

    const fechamento = await fecharSessao(criado.sessaoId, {
      formaPagamento: 'dinheiro', desconto: 0, taxaServico: 0, taxaServicoMotivo: 'Isenção de serviço no cenário de teste', idempotencyKey: UUID(),
    }, ids.staff.nome, { atorTipo: 'staff', atorId: ids.staff.id });
    assert.equal(Number(fechamento.valorCobrado), 9.5);
  } finally {
    await c.limpar();
  }
});

test('PostgreSQL real: comanda totalmente cancelada fecha com total zero e libera a mesa', async () => {
  const c = await montarCenario();
  const { ids } = c;
  try {
    const criado = await pedidos.criarPedido(ids.mesa.token, {
      idempotencyKey: 'qr-' + UUID(),
      items: [{ productId: c.bebida, qty: 2 }],
    });
    ids.pedidos.push(criado.id);
    ids.sessoes.push(criado.sessaoId);

    const cancelado = await pedidos.cancelarPedidoCliente(ids.mesa.token, criado.id, null, { motivo: 'Cliente foi embora', requestId: REQ('cancel-all') });
    assert.equal(cancelado.status, 'cancelado');
    const replay = await pedidos.cancelarPedidoCliente(ids.mesa.token, criado.id, null, { motivo: 'Cliente foi embora', requestId: REQ('cancel-all-2') });
    assert.equal(replay.idempotentReplay, true);

    const itens = await itensDo(criado.id);
    assert.deepEqual(itens.map((i) => i.status), ['cancelado']);
    assert.equal(await totalEntregueDaSessao(pool, criado.sessaoId), 0);

    const fechamento = await fecharSessao(criado.sessaoId, {
      formaPagamento: 'dinheiro', desconto: 0, taxaServico: 0, taxaServicoMotivo: 'Isenção de serviço no cenário de teste', idempotencyKey: UUID(),
    }, ids.staff.nome, { atorTipo: 'staff', atorId: ids.staff.id });
    assert.equal(fechamento.status, 'fechada');
    assert.equal(Number(fechamento.valorCobrado), 0);
    const mesa = await pool.query('SELECT status FROM mesas WHERE id=$1', [ids.mesa.id]);
    assert.equal(mesa.rows[0].status, 'livre');
  } finally {
    await c.limpar();
  }
});

test('PostgreSQL real: replay offline do garçom é idempotente e conteúdo divergente é conflito', async () => {
  const c = await montarCenario();
  const { ids } = c;
  const g = ids.garcons[0];
  try {
    // Mesa iniciada pelo garçom (número baixo exige mesa habilitada; usamos a
    // sessão criada via QR e assumimos a responsabilidade pelo primeiro aceite).
    const base = await pedidos.criarPedido(ids.mesa.token, {
      idempotencyKey: 'qr-' + UUID(),
      items: [{ productId: c.bebida, qty: 1 }],
    });
    ids.pedidos.push(base.id);
    ids.sessoes.push(base.sessaoId);
    await pool.query('UPDATE mesa_sessoes SET garcom_responsavel_id=$1 WHERE id=$2', [g.id, base.sessaoId]);
    await pool.query('UPDATE mesas SET status=$1 WHERE id=$2', ['ocupada', ids.mesa.id]);

    const chave = UUID();
    const criadoEmCliente = new Date(Date.now() - 60000).toISOString();
    const corpo = {
      idempotencyKey: chave,
      clientCreatedAt: criadoEmCliente,
      clienteNome: 'Pedido offline',
      items: [{ productId: c.prato, qty: 1, note: 'sem sal' }],
    };
    const estoqueAntes = Number((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [c.prato])).rows[0].estoque);

    const primeiro = await criarPedidoGarcom(g.token, ids.mesa.numero, corpo, REQ('offline-1'));
    ids.pedidos.push(primeiro.id);
    assert.equal(primeiro.idempotentReplay, false);
    assert.equal(Number((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [c.prato])).rows[0].estoque), estoqueAntes - 1);

    // Reenvio idêntico (o celular não recebeu a resposta original).
    const replay = await criarPedidoGarcom(g.token, ids.mesa.numero, corpo, REQ('offline-2'));
    assert.equal(replay.id, primeiro.id, 'mesma chave devolve o mesmo pedido');
    assert.equal(replay.idempotentReplay, true);
    assert.equal(Number((await pool.query('SELECT estoque FROM produtos WHERE id=$1', [c.prato])).rows[0].estoque), estoqueAntes - 1, 'replay não baixa estoque de novo');

    const gravado = await pool.query('SELECT payload_hash,cliente_criado_em,garcom_registrou_id,origem_pedido FROM pedidos WHERE id=$1', [primeiro.id]);
    assert.ok(gravado.rows[0].payload_hash);
    assert.equal(new Date(gravado.rows[0].cliente_criado_em).toISOString(), criadoEmCliente, 'horário local de criação é preservado');
    assert.equal(Number(gravado.rows[0].garcom_registrou_id), Number(g.id));
    assert.equal(gravado.rows[0].origem_pedido, 'garcom');

    // Mesma chave com outro conteúdo: conflito explícito, nunca sobrescreve.
    await assert.rejects(
      () => criarPedidoGarcom(g.token, ids.mesa.numero, { ...corpo, items: [{ productId: c.prato, qty: 5 }] }, REQ('offline-3')),
      (e) => e.status === 409
    );
    const aindaUm = await pool.query('SELECT COUNT(*)::int AS n FROM pedidos WHERE idempotency_key=$1', [chave]);
    assert.equal(aindaUm.rows[0].n, 1);

    // Chave precisa ser UUID v4 para pedido de garçom.
    await assert.rejects(
      () => criarPedidoGarcom(g.token, ids.mesa.numero, { ...corpo, idempotencyKey: 'chave-qualquer' }, REQ('offline-4')),
      (e) => e.status === 400
    );

    // Depois que a comanda fecha, o replay ainda devolve o pedido original
    // (o celular pode reenviar muito tempo depois) sem reabrir sessão.
    const [itemBase] = await itensDo(base.id);
    await pedidos.setStatusItem(itemBase.id, 'concluido', 'bar', { tipo: 'staff', id: ids.staff.id }, REQ('ready-base'));
    await assumirEntregaComoGarcom(base.id, g.token, REQ('claim-base'), [itemBase.id]);
    await retirarComoGarcom(base.id, g.token, REQ('pick-base'), [itemBase.id]);
    await entregarComoGarcom(base.id, g.token, [itemBase.id], REQ('deliver-base'), 'entregar');
    const [itemOffline] = await itensDo(primeiro.id);
    await pedidos.setStatusItem(itemOffline.id, 'concluido', 'cozinha', { tipo: 'staff', id: ids.staff.id }, REQ('ready-off'));
    await assumirEntregaComoGarcom(primeiro.id, g.token, REQ('claim-off'), [itemOffline.id]);
    await retirarComoGarcom(primeiro.id, g.token, REQ('pick-off'), [itemOffline.id]);
    await entregarComoGarcom(primeiro.id, g.token, [itemOffline.id], REQ('deliver-off'), 'entregar');
    await fecharSessao(base.sessaoId, { formaPagamento: 'pix', desconto: 0, taxaServico: 0, taxaServicoMotivo: 'Isenção de serviço no cenário de teste', idempotencyKey: UUID() }, ids.staff.nome, { atorTipo: 'staff', atorId: ids.staff.id });

    const replayTardio = await criarPedidoGarcom(g.token, ids.mesa.numero, corpo, REQ('offline-late'));
    assert.equal(replayTardio.id, primeiro.id);
    assert.equal(replayTardio.idempotentReplay, true);
    const sessoesAbertas = await pool.query("SELECT COUNT(*)::int AS n FROM mesa_sessoes WHERE mesa_id=$1 AND status='aberta'", [ids.mesa.id]);
    assert.equal(sessoesAbertas.rows[0].n, 0, 'replay tardio não reabre a comanda');

    // Pedido novo (chave nova) depois do fechamento não pode reutilizar a sessão.
    await assert.rejects(
      () => criarPedidoGarcom(g.token, ids.mesa.numero, { ...corpo, idempotencyKey: UUID() }, REQ('offline-new')),
      (e) => e.status === 409
    );
  } finally {
    await c.limpar();
  }
});

test('PostgreSQL real: caixa não fecha com item em produção e a listagem cobra só o entregue', async () => {
  const c = await montarCenario();
  const { ids } = c;
  try {
    const criado = await pedidos.criarPedido(ids.mesa.token, {
      idempotencyKey: 'qr-' + UUID(),
      items: [{ productId: c.prato, qty: 1 }, { productId: c.bebida, qty: 2 }],
    });
    ids.pedidos.push(criado.id);
    ids.sessoes.push(criado.sessaoId);
    const itens = await itensDo(criado.id);
    const itemPrato = itens.find((i) => Number(i.produto_id) === Number(c.prato));
    const itemBebida = itens.find((i) => Number(i.produto_id) === Number(c.bebida));
    const ator = { tipo: 'staff', id: ids.staff.id, nome: ids.staff.nome };
    const g = ids.garcons[0];

    await pedidos.setStatusItem(itemBebida.id, 'concluido', 'bar', ator, REQ('ready'));
    await assumirEntregaComoGarcom(criado.id, g.token, REQ('claim'), [itemBebida.id]);
    await retirarComoGarcom(criado.id, g.token, REQ('pick'), [itemBebida.id]);
    await entregarComoGarcom(criado.id, g.token, [itemBebida.id], REQ('deliver'), 'entregar');

    await assert.rejects(
      () => fecharSessao(criado.sessaoId, { formaPagamento: 'pix', desconto: 0, taxaServico: 0, taxaServicoMotivo: 'Isenção de serviço no cenário de teste', idempotencyKey: UUID() }, ids.staff.nome, { atorTipo: 'staff', atorId: ids.staff.id }),
      (e) => e.status === 409,
      'item ainda na cozinha bloqueia o fechamento'
    );

    const abertas = await listSessoesAbertas();
    const card = abertas.find((s) => Number(s.id) === Number(criado.sessaoId));
    assert.ok(card, 'comanda com entrega parcial continua visível no caixa');
    assert.equal(Number(card.valorTotal), 19, 'cobra apenas as bebidas entregues');
    assert.equal(card.podeFechar, false);
    assert.equal(card.pedidosPendentes, 1);
  } finally {
    await c.limpar();
  }
});
