// Integração do panorama de mesas contra PostgreSQL descartável.
// Roda no CI (postgres:16) e localmente com embedded-postgres.
// Cria os próprios dados sintéticos e limpa tudo no finally.

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do banco descartável de teste');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(url.hostname), 'Só roda em banco descartável');
assert.equal(url.pathname, '/qradmin_test', 'E2E bloqueado fora de qradmin_test');
assert.equal(process.env.NODE_ENV, 'test');

const pool = require('../db/pool');
const admin = require('../db/admin');
const { panoramaMesas, mesaDetalhe } = require('../db/mesas-panorama');

test('panorama: 70 mesas, consumo × vendas, praças persistentes e tempos reais', async () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    mesas: [],
    garcom: null,
    categoria: null,
    produtos: [],
    sessoes: [],
    pedidos: [],
    itens: [],
    praca: null,
    staff: null,
  };
  const configOriginal = (await pool.query(
    'SELECT quantidade, atencao_minutos, critico_minutos FROM configuracao_mesas WHERE id = 1'
  )).rows[0];

  // Banco descartável compartilhado entre suítes: zera apenas o estado de
  // sessão das mesas 1..70 para que as contagens deste teste sejam
  // determinísticas, sem tocar em cardápio, staff ou configuração.
  const sessoesExistentes = `SELECT id FROM mesa_sessoes WHERE mesa_id IN (SELECT id FROM mesas WHERE numero BETWEEN 1 AND 70)`;
  await pool.query(`DELETE FROM sessao_pagamentos WHERE sessao_id IN (${sessoesExistentes})`);
  await pool.query(
    `DELETE FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id IN (${sessoesExistentes}))`
  );
  await pool.query(`DELETE FROM pedidos WHERE sessao_id IN (${sessoesExistentes})`);
  await pool.query(`DELETE FROM mesa_sessoes WHERE mesa_id IN (SELECT id FROM mesas WHERE numero BETWEEN 1 AND 70)`);

  try {
    for (let numero = 1; numero <= 70; numero++) {
      const { rows } = await pool.query(
        'INSERT INTO mesas (numero) VALUES ($1) ON CONFLICT (numero) DO NOTHING RETURNING id',
        [numero]
      );
      if (rows[0]) ids.mesas.push(rows[0].id);
    }
    await pool.query(
      "UPDATE configuracao_mesas SET quantidade = 70, atencao_minutos = 45, critico_minutos = 90 WHERE id = 1"
    );

    ids.categoria = (await pool.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
      [`Panorama ${suffix}`]
    )).rows[0].id;
    for (const [nome, setor, preco] of [
      [`Burger ${suffix}`, 'cozinha', 20],
      [`Cerveja ${suffix}`, 'bar', 10],
    ]) {
      const { rows } = await pool.query(
        'INSERT INTO produtos (categoria_id, nome, preco, setor) VALUES ($1, $2, $3, $4) RETURNING id',
        [ids.categoria, nome, preco, setor]
      );
      ids.produtos.push(rows[0].id);
    }
    const [burger, cerveja] = ids.produtos;

    ids.garcom = (await pool.query(
      'INSERT INTO garcons (nome) VALUES ($1) RETURNING id',
      [`Garçom ${suffix}`]
    )).rows[0].id;

    ids.staff = (await pool.query(
      'INSERT INTO staff (nome, login, senha_hash, papel) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Admin panorâmica', `panorama-${suffix}`, 'hash-de-teste', 'admin']
    )).rows[0].id;

    // Praças semente da migration 0032.
    const pracas = await admin.listarPracas();
    const nomes = pracas.map((p) => p.nome);
    for (const nome of ['Praia', 'Guarda-sol', 'Salão']) {
      assert.ok(nomes.includes(nome), `praça padrão ${nome} precisa existir`);
    }
    const praia = pracas.find((p) => p.nome === 'Praia');
    const salao = pracas.find((p) => p.nome === 'Salão');
    for (let numero = 1; numero <= 10; numero++) {
      await admin.definirPracaMesa(numero, praia.id, { id: ids.staff, nome: 'Admin panorâmica' }, null);
    }
    for (let numero = 11; numero <= 20; numero++) {
      await admin.definirPracaMesa(numero, salao.id, { id: ids.staff, nome: 'Admin panorâmica' }, null);
    }
    const pracasDepois = await admin.listarPracas();
    assert.equal(pracasDepois.find((p) => p.id === praia.id).mesas, 10);

    // Mesa 1: ocupada há 20 min, item entregue com todos os horários + item no
    // bar só com "pronto" (dado incompleto) + item de entrega direta (sem retirada).
    const sessao1 = (await pool.query(
      `INSERT INTO mesa_sessoes (mesa_id, aberta_em, garcom_responsavel_id, cliente_nome)
       SELECT id, now() - interval '20 minutes', $1, 'Cliente panorama'
         FROM mesas WHERE numero = 1 RETURNING id`,
      [ids.garcom]
    )).rows[0].id;
    ids.sessoes.push(sessao1);
    const pedido1 = (await pool.query(
      `INSERT INTO pedidos (sessao_id, criado_em, status)
       VALUES ($1, now() - interval '18 minutes', 'em_producao') RETURNING id`,
      [sessao1]
    )).rows[0].id;
    ids.pedidos.push(pedido1);

    const itemEntregue = (await pool.query(
      `INSERT INTO itens_pedido
         (pedido_id, produto_id, quantidade, preco_unitario, status, setor,
          iniciado_em, pronto_em, retirado_em, entregue_em)
       VALUES ($1, $2, 1, 20, 'entregue', 'cozinha',
               now() - interval '15 minutes', now() - interval '10 minutes',
               now() - interval '8 minutes', now() - interval '5 minutes')
       RETURNING id`,
      [pedido1, burger]
    )).rows[0].id;
    ids.itens.push(itemEntregue);

    // Bar incompleto: tem pronto_em, mas nunca registrou iniciado_em.
    ids.itens.push((await pool.query(
      `INSERT INTO itens_pedido
         (pedido_id, produto_id, quantidade, preco_unitario, status, setor, pronto_em)
       VALUES ($1, $2, 2, 10, 'concluido', 'bar', now() - interval '8 minutes')
       RETURNING id`,
      [pedido1, cerveja]
    )).rows[0].id);

    // Entrega direta: pronto → entregue sem retirada. Não pode aparecer como
    // "retirada → entrega" (não houve retirada registrada).
    ids.itens.push((await pool.query(
      `INSERT INTO itens_pedido
         (pedido_id, produto_id, quantidade, preco_unitario, status, setor, pronto_em, entregue_em)
       VALUES ($1, $2, 1, 20, 'entregue', 'cozinha',
               now() - interval '20 minutes', now() - interval '4 minutes')
       RETURNING id`,
      [pedido1, burger]
    )).rows[0].id);

    await pool.query(
      "INSERT INTO sessao_pagamentos (sessao_id, valor, forma_pagamento) VALUES ($1, 5, 'pix')",
      [sessao1]
    );

    // Mesa 2 (atenção, 60 min) e mesa 3 (crítica, 100 min).
    for (const [numero, minutos] of [[2, 60], [3, 100]]) {
      const { rows } = await pool.query(
        `INSERT INTO mesa_sessoes (mesa_id, aberta_em)
         SELECT id, now() - ($2::int * interval '1 minute') FROM mesas WHERE numero = $1
         RETURNING id`,
        [numero, minutos]
      );
      ids.sessoes.push(rows[0].id);
    }

    // Mesa 4: conta fechada (venda do período, não consumo em aberto).
    ids.sessoes.push((await pool.query(
      `INSERT INTO mesa_sessoes (mesa_id, aberta_em, fechada_em, status, valor_total, valor_cobrado)
       SELECT id, now() - interval '3 hours', now(), 'fechada', 50, 55
         FROM mesas WHERE numero = 4 RETURNING id`
    )).rows[0].id);

    const panorama = await panoramaMesas({ periodo: 'hoje' });
    assert.equal(panorama.mesas.length, 70, 'uma entrada por mesa habilitada, inclusive livres');
    assert.deepEqual(panorama.config.faixas, { atencaoMinutos: 45, criticoMinutos: 90 });
    assert.equal(panorama.mesas.filter((m) => m.status === 'ocupada').length, 3);
    assert.equal(panorama.mesas.filter((m) => m.status === 'livre').length, 67);

    const mesa1 = panorama.mesas.find((m) => m.numero === 1);
    assert.equal(mesa1.pracaNome, 'Praia');
    assert.equal(mesa1.status, 'ocupada');
    assert.equal(mesa1.tempo.id, 'recente');
    assert.equal(mesa1.consumo, 40, 'dois itens entregues (20 + 20), com o bar pendente fora');
    assert.equal(mesa1.pago, 5);
    assert.equal(mesa1.saldo, 35);
    assert.equal(mesa1.pedidosAtivos, 1);

    assert.equal(panorama.mesas.find((m) => m.numero === 2).tempo.id, 'atencao');
    assert.equal(panorama.mesas.find((m) => m.numero === 3).tempo.id, 'critica');
    assert.equal(panorama.mesas.find((m) => m.numero === 4).status, 'livre', 'conta fechada não ocupa mesa');

    // Vendas do período: somente contas fechadas, valor cobrado.
    const vendaMesa4 = panorama.vendas.porMesa.find((v) => v.numero === 4);
    assert.ok(vendaMesa4, 'mesa 4 precisa aparecer nas vendas do período');
    assert.ok(vendaMesa4.total >= 55);

    // Tempos reais: cozinha com os quatro passos; bar sem par de horários.
    const cozinha = panorama.fluxo.setores.cozinha.etapas;
    assert.equal(cozinha.inicio_pronto.minutos, 5);
    assert.equal(cozinha.inicio_pronto.amostras, 1);
    assert.equal(cozinha.inicio_pronto.aproximado, true, 'amostra pequena é sinalizada');
    assert.equal(cozinha.pronto_retirada.minutos, 2);
    assert.equal(cozinha.retirada_entrega.minutos, 3);
    assert.equal(
      cozinha.retirada_entrega.amostras,
      1,
      'entrega direta (sem retirada) não pode inventar um passo de retirada',
    );

    const bar = panorama.fluxo.setores.bar.etapas;
    assert.equal(bar.recebimento_inicio.disponivel, false);
    assert.equal(bar.inicio_pronto.disponivel, false, 'só pronto_em não permite medir início → pronto');
    assert.equal(bar.pronto_retirada.disponivel, false);

    // Garçom: só as etapas de retirada/entrega são aplicáveis.
    assert.equal(panorama.fluxo.setores.garcom.etapas.recebimento_inicio.aplicavel, false);
    assert.equal(panorama.fluxo.setores.garcom.etapas.pronto_retirada.aplicavel, true);

    // Detalhe da mesa para o modal: pedidos, itens e pagamento parcial.
    const detalhe = await mesaDetalhe(1);
    assert.equal(detalhe.numero, 1);
    assert.equal(detalhe.consumo, 40);
    assert.equal(detalhe.saldo, 35);
    assert.equal(detalhe.pagamentos.length, 1);
    assert.equal(detalhe.pedidos.length, 1);
    assert.equal(detalhe.pedidos[0].itens.length, 3);
    assert.ok(detalhe.pedidos[0].itens.every((i) => i.status));
    assert.equal(detalhe.pracaNome, 'Praia');

    // Praça renomeável e nova praça persistida; "Sem praça" volta ao NULL.
    const pracaNova = await admin.criarPraca({ nome: `Varanda ${suffix}` });
    ids.praca = pracaNova.id;
    await admin.definirPracaMesa(1, pracaNova.id, { id: ids.staff, nome: 'Admin panorâmica' }, null);
    assert.equal((await mesaDetalhe(1)).pracaNome, `Varanda ${suffix}`);
    await admin.atualizarPraca(pracaNova.id, { nome: `Varanda norte ${suffix}` });
    assert.equal((await mesaDetalhe(1)).pracaNome, `Varanda norte ${suffix}`);
    await admin.definirPracaMesa(1, null, { id: ids.staff, nome: 'Admin panorâmica' }, null);
    assert.equal((await mesaDetalhe(1)).pracaNome, null, 'Sem praça é NULL, não uma praça fictícia');

    // Auditoria registrada na mesma transação da atribuição.
    const evento = (await pool.query(
      "SELECT acao, contexto FROM auditoria_eventos WHERE acao = 'mesa_praca_definida' AND ator_id = $1 ORDER BY id DESC LIMIT 1",
      [ids.staff]
    )).rows[0];
    assert.ok(evento, 'atribuição de praça precisa gerar evento de auditoria');
    assert.ok(evento.contexto.mesa === 1);

    // Faixas vêm do banco: mudar os limiares muda a classificação sem deploy.
    await pool.query('UPDATE configuracao_mesas SET atencao_minutos = 30, critico_minutos = 50 WHERE id = 1');
    const comFaixasNovas = await panoramaMesas({ periodo: 'hoje' });
    assert.deepEqual(comFaixasNovas.config.faixas, { atencaoMinutos: 30, criticoMinutos: 50 });
    assert.equal(comFaixasNovas.mesas.find((m) => m.numero === 2).tempo.id, 'critica');

    // Período inválido é recusado (400), sem cair no período padrão.
    await assert.rejects(() => panoramaMesas({ periodo: 'ano' }), (erro) => erro.status === 400);
  } finally {
    const limpar = async (sql, params) => {
      try {
        await pool.query(sql, params);
      } catch (erro) {
        console.error('[limpeza panorama]', sql, erro.message);
      }
    };
    if (ids.sessoes.length) {
      await limpar('DELETE FROM sessao_pagamentos WHERE sessao_id = ANY($1::int[])', [ids.sessoes]);
      await limpar('DELETE FROM itens_pedido WHERE pedido_id = ANY($1::int[])', [ids.pedidos]);
      await limpar('DELETE FROM pedidos WHERE id = ANY($1::int[])', [ids.pedidos]);
      await limpar('DELETE FROM mesa_sessoes WHERE id = ANY($1::int[])', [ids.sessoes]);
    }
    if (ids.praca) {
      await limpar('UPDATE mesas SET praca_id = NULL WHERE praca_id = $1', [ids.praca]);
      await limpar('DELETE FROM mesa_pracas WHERE id = $1', [ids.praca]);
    }
    await limpar('UPDATE mesas SET praca_id = NULL WHERE numero BETWEEN 1 AND 70');
    if (ids.staff) await limpar('DELETE FROM staff WHERE id = $1', [ids.staff]);
    if (ids.garcom) await limpar('DELETE FROM garcons WHERE id = $1', [ids.garcom]);
    if (ids.produtos.length) await limpar('DELETE FROM produtos WHERE id = ANY($1::int[])', [ids.produtos]);
    if (ids.categoria) await limpar('DELETE FROM categorias WHERE id = $1', [ids.categoria]);
    if (ids.mesas.length) await limpar('DELETE FROM mesas WHERE id = ANY($1::int[])', [ids.mesas]);
    if (configOriginal) {
      await limpar(
        'UPDATE configuracao_mesas SET quantidade = $1, atencao_minutos = $2, critico_minutos = $3 WHERE id = 1',
        [configOriginal.quantidade, configOriginal.atencao_minutos, configOriginal.critico_minutos]
      );
    }
    await pool.end();
  }
});
