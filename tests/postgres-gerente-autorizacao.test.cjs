const test = require('node:test');
const assert = require('node:assert/strict');

assert.ok(process.env.DATABASE_URL, 'Este teste deve rodar apenas contra o PostgreSQL descartável do CI');

const pool = require('../db/pool');
const { fecharSessao } = require('../db/caixa');
const { autorizarGerente, hashSenha } = require('../db/auth');

// Issue #48 (etapa gerente): desconto > 0 ou taxa de serviço ajustada só
// fecha a conta quando um gerente (staff admin) reautentica com login+senha
// no aparelho compartilhado. O evento sessao_fechada guarda quem operou
// (ator) e quem autorizou (autorizadoPorId/Nome) na mesma transação.
test('PostgreSQL real: desconto/ajuste exige gerente e audita operador + autorizador', async () => {
  const ids = {
    categoria: null,
    produto: null,
    mesas: [],
    sessoes: [],
    staff: [],
  };
  const mesaBase = 800 + (process.pid % 97) * 10;
  const senhaGerente = 'Gerente#48teste';
  const Gerente = { id: null, nome: 'Gerente QA 48', login: 'gerente.ci48.' + process.pid };
  const Caixa = { id: null, nome: 'Caixa QA 48', login: 'caixa.ci48.' + process.pid };

  const novaSessao = async (indice) => {
    const mesa = await pool.query(
      "INSERT INTO mesas (numero, status) VALUES ($1, 'ocupada') RETURNING id",
      [mesaBase + indice]
    );
    ids.mesas.push(mesa.rows[0].id);
    const sessao = await pool.query(
      "INSERT INTO mesa_sessoes (mesa_id, status, cliente_nome, valor_total) VALUES ($1, 'aberta', 'Teste CI gerente', 0) RETURNING id",
      [mesa.rows[0].id]
    );
    ids.sessoes.push(sessao.rows[0].id);
    const pedido = await pool.query(
      "INSERT INTO pedidos (sessao_id, status, cliente_nome, observacao_geral) VALUES ($1, 'entregue', 'Teste CI gerente', 'Fixture #48') RETURNING id",
      [sessao.rows[0].id]
    );
    await pool.query(
      "INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, status) VALUES ($1, $2, 2, 10, 'entregue')",
      [pedido.rows[0].id, ids.produto]
    );
    return sessao.rows[0].id;
  };

  const eventoFechamento = async (sessaoId) => {
    const r = await pool.query(
      "SELECT ator_id, contexto FROM auditoria_eventos WHERE acao = 'sessao_fechada' AND alvo_id = $1 ORDER BY id DESC LIMIT 1",
      [String(sessaoId)]
    );
    return r.rows[0] || null;
  };

  try {
    const categoria = await pool.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
      ['CI Gerente 48 ' + process.pid]
    );
    ids.categoria = categoria.rows[0].id;

    const produto = await pool.query(
      'INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel) VALUES ($1, $2, $3, $4, TRUE) RETURNING id',
      [ids.categoria, 'Item gerente ' + process.pid, 'Fixture temporária do CI', 10]
    );
    ids.produto = produto.rows[0].id;

    const gerenteRow = await pool.query(
      "INSERT INTO staff (nome, login, senha_hash, papel) VALUES ($1, $2, $3, 'admin') RETURNING id",
      [Gerente.nome, Gerente.login, await hashSenha(senhaGerente)]
    );
    Gerente.id = gerenteRow.rows[0].id;
    ids.staff.push(Gerente.id);

    const caixaRow = await pool.query(
      "INSERT INTO staff (nome, login, senha_hash, papel) VALUES ($1, $2, $3, 'caixa') RETURNING id",
      [Caixa.nome, Caixa.login, await hashSenha('Caixa#48teste')]
    );
    Caixa.id = caixaRow.rows[0].id;
    ids.staff.push(Caixa.id);

    // (a) autorizarGerente: só gerente (admin) com a senha certa passa.
    const autorizado = await autorizarGerente(Gerente.login, senhaGerente);
    assert.equal(autorizado.id, Gerente.id);
    assert.equal(autorizado.papel, 'admin');
    assert.equal(await autorizarGerente(Gerente.login, 'senha-errada'), null);
    assert.equal(await autorizarGerente(Caixa.login, 'Caixa#48teste'), null, 'caixa não autoriza');
    assert.equal(await autorizarGerente('ninguem.' + process.pid, senhaGerente), null);
    assert.equal(await autorizarGerente('', ''), null);

    // (b) desconto sem autorização do gerente → 403, sessão continua aberta.
    const s1 = await novaSessao(0);
    await assert.rejects(
      fecharSessao(s1, {
        formaPagamento: 'pix',
        desconto: 5,
        idempotencyKey: '00000000-0000-4000-8000-000000000481',
      }, Caixa.nome, { atorTipo: 'staff', atorId: Caixa.id, requestId: 'gerente48-sem-gerente' }),
      (erro) => {
        assert.equal(erro.status, 403);
        assert.match(erro.message, /gerente/i);
        return true;
      }
    );

    // (c) desconto com gerente: opera o caixa, autoriza o gerente; o evento
    // registra os dois funcionários do dispositivo compartilhado.
    const fechado = await fecharSessao(s1, {
      formaPagamento: 'pix',
      desconto: 5,
      idempotencyKey: '00000000-0000-4000-8000-000000000482',
    }, Caixa.nome, {
      atorTipo: 'staff',
      atorId: Caixa.id,
      requestId: 'gerente48-com-gerente',
      autorizacaoGerente: { id: Gerente.id, nome: Gerente.nome },
    });
    assert.equal(Number(fechado.valorTotal), 20);
    assert.equal(Number(fechado.valorCobrado), 17);
    const evento1 = await eventoFechamento(s1);
    assert.ok(evento1, 'evento sessao_fechada registrado');
    assert.equal(Number(evento1.ator_id), Caixa.id);
    assert.equal(Number(evento1.contexto.autorizadoPorId), Gerente.id);
    assert.equal(evento1.contexto.autorizadoPorNome, Gerente.nome);

    // (d) sem desconto e com taxa padrão, fecha sem gerente.
    const s2 = await novaSessao(1);
    const padrao = await fecharSessao(s2, {
      formaPagamento: 'pix',
      idempotencyKey: '00000000-0000-4000-8000-000000000483',
    }, Caixa.nome, { atorTipo: 'staff', atorId: Caixa.id, requestId: 'gerente48-padrao' });
    assert.equal(Number(padrao.valorCobrado), 22);
    const evento2 = await eventoFechamento(s2);
    assert.equal(evento2.contexto.autorizadoPorId, null);

    // (e) remover a taxa (ajuste) sem gerente → 403; com gerente, fecha.
    const s3 = await novaSessao(2);
    await assert.rejects(
      fecharSessao(s3, {
        formaPagamento: 'pix',
        taxaServico: 0,
        taxaServicoMotivo: 'Isenção de serviço autorizada no teste',
        idempotencyKey: '00000000-0000-4000-8000-000000000484',
      }, Caixa.nome, { atorTipo: 'staff', atorId: Caixa.id, requestId: 'gerente48-taxa-sem-gerente' }),
      (erro) => erro.status === 403
    );
    const semServico = await fecharSessao(s3, {
      formaPagamento: 'pix',
      taxaServico: 0,
      taxaServicoMotivo: 'Isenção de serviço autorizada no teste',
      idempotencyKey: '00000000-0000-4000-8000-000000000485',
    }, Caixa.nome, {
      atorTipo: 'staff',
      atorId: Caixa.id,
      requestId: 'gerente48-taxa-com-gerente',
      autorizacaoGerente: { id: Gerente.id, nome: Gerente.nome },
    });
    assert.equal(Number(semServico.taxaServico), 0);
    assert.equal(Number(semServico.valorCobrado), 20);
  } finally {
    if (ids.sessoes.length) {
      await pool.query('DELETE FROM auditoria_eventos WHERE alvo_id = ANY($1::text[])', [ids.sessoes.map(String)]);
      await pool.query('DELETE FROM sessao_pagamentos WHERE sessao_id = ANY($1::int[])', [ids.sessoes]);
      await pool.query('DELETE FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE sessao_id = ANY($1::int[]))', [ids.sessoes]);
      await pool.query('DELETE FROM pedidos WHERE sessao_id = ANY($1::int[])', [ids.sessoes]);
      await pool.query('DELETE FROM mesa_sessoes WHERE id = ANY($1::int[])', [ids.sessoes]);
    }
    if (ids.mesas.length) await pool.query('DELETE FROM mesas WHERE id = ANY($1::int[])', [ids.mesas]);
    if (ids.produto) await pool.query('DELETE FROM produtos WHERE id = $1', [ids.produto]);
    if (ids.categoria) await pool.query('DELETE FROM categorias WHERE id = $1', [ids.categoria]);
    if (ids.staff.length) await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [ids.staff]);
  }
});
