// Integração do payload de mesas do garçom contra PostgreSQL descartável (#305).
//
// A PWA passou a mostrar praça, situação e tempo desde o primeiro pedido nos
// cards do salão. Para isso `GET /api/garcom/:token/mesas` ganhou campos
// ADITIVOS de leitura. Este teste prova, no banco real, que:
//   * os campos novos não mudam o contrato existente (token, sessão, responsável);
//   * "praça" vem do cadastro `mesa_pracas`, com NULL = "Sem praça";
//   * "Aguardando pedido" é sessão aberta sem pedido válido;
//   * o tempo começa no PRIMEIRO PEDIDO VÁLIDO, nunca na abertura da sessão;
//   * pedido cancelado não transforma a mesa em "Em atendimento";
//   * a listagem é puramente leitura: não fecha sessão nem libera mesa.

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

assert.ok(process.env.DATABASE_URL, 'Defina DATABASE_URL do banco descartável de teste');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(url.hostname), 'Só roda em banco descartável');
assert.equal(url.pathname, '/qradmin_test', 'E2E bloqueado fora de qradmin_test');
assert.equal(process.env.NODE_ENV, 'test');

const pool = require('../db/pool');
const { listarMesasGarcom } = require('../db/atendimento');

test('mesas do garçom expõem praça, situação e primeiro pedido sem alterar o contrato', async () => {
  const sufixo = randomUUID().slice(0, 8);
  const criadas = { mesas: [], garcom: null, garcomOutro: null, praca: null, sessao: null, pedidos: [] };
  const configOriginal = (await pool.query(
    'SELECT quantidade FROM configuracao_mesas WHERE id = 1'
  )).rows[0];

  try {
    // Três mesas isoladas (números altos, fora do uso normal das outras suítes).
    // `configuracao_mesas.quantidade` é limitada a 70: usamos números livres
    // nessa faixa e reativamos apenas até a maior delas.
    const numeros = [];
    for (let i = 0; i < 3; i++) {
      const numero = 61 + i;
      const { rows } = await pool.query(
        `INSERT INTO mesas (numero) VALUES ($1)
         ON CONFLICT (numero) DO UPDATE SET numero = EXCLUDED.numero
         RETURNING id, numero`, [numero]
      );
      criadas.mesas.push(rows[0].id);
      numeros.push(rows[0].numero);
    }
    await pool.query('UPDATE configuracao_mesas SET quantidade = $1 WHERE id = 1', [numeros[2]]);

    criadas.garcom = (await pool.query(
      'INSERT INTO garcons (nome, token) VALUES ($1, $2) RETURNING id, token',
      ['Garçom cards ' + sufixo, randomUUID()]
    )).rows[0];
    criadas.garcomOutro = (await pool.query(
      'INSERT INTO garcons (nome, token) VALUES ($1, $2) RETURNING id, token',
      ['Outro garçom ' + sufixo, randomUUID()]
    )).rows[0];

    // Praça precisa existir como dado (mesmo cadastro do admin).
    criadas.praca = (await pool.query(
      'INSERT INTO mesa_pracas (nome, ordem) VALUES ($1, 0) RETURNING id, nome',
      ['Praça ' + sufixo]
    )).rows[0];
    await pool.query('UPDATE mesas SET praca_id = $1 WHERE numero = $2', [criadas.praca.id, numeros[0]]);

    // Mesa A: sessão aberta, sem pedido. Mesa B: pedido de 40 min + cancelado.
    criadas.sessao = (await pool.query(
      `INSERT INTO mesa_sessoes (mesa_id, cliente_nome, garcom_responsavel_id)
       VALUES ((SELECT id FROM mesas WHERE numero = $1), $2, $3) RETURNING id`,
      [numeros[0], 'Cliente aguardando', criadas.garcom.id]
    )).rows[0];
    const sessaoB = (await pool.query(
      `INSERT INTO mesa_sessoes (mesa_id, cliente_nome, garcom_responsavel_id)
       VALUES ((SELECT id FROM mesas WHERE numero = $1), $2, $3) RETURNING id`,
      [numeros[1], 'Cliente atendido', criadas.garcomOutro.id]
    )).rows[0];
    const pedidoAntigo = (await pool.query(
      `INSERT INTO pedidos (sessao_id, status, criado_em)
       VALUES ($1, 'entregue', now() - interval '90 minutes') RETURNING id`, [sessaoB.id]
    )).rows[0];
    criadas.pedidos.push(pedidoAntigo.id);
    const pedidoValido = (await pool.query(
      `INSERT INTO pedidos (sessao_id, status, criado_em)
       VALUES ($1, 'concluido', now() - interval '40 minutes') RETURNING id`, [sessaoB.id]
    )).rows[0];
    criadas.pedidos.push(pedidoValido.id);
    const pedidoCancelado = (await pool.query(
      `INSERT INTO pedidos (sessao_id, status, criado_em)
       VALUES ($1, 'cancelado', now() - interval '2 minutes') RETURNING id`, [sessaoB.id]
    )).rows[0];
    criadas.pedidos.push(pedidoCancelado.id);

    const { mesas, garcom } = await listarMesasGarcom(criadas.garcom.token);
    assert.equal(Number(garcom.id), Number(criadas.garcom.id));

    const [mesaA, mesaB, mesaC] = numeros.map((n) => mesas.find((m) => Number(m.numero) === n));
    assert.ok(mesaA && mesaB && mesaC, 'as três mesas voltaram na listagem');

    // Contrato antigo continua igual.
    for (const m of [mesaA, mesaB, mesaC]) {
      assert.ok('token' in m && 'sessaoId' in m && 'garcomResponsavelId' in m && 'pedidoClienteQr' in m);
    }
    assert.ok(mesaA.token, 'mesa sob minha responsabilidade recebe o token QR');
    assert.equal(Number(mesaA.garcomResponsavelId), Number(criadas.garcom.id));
    assert.equal(mesaB.token, null, 'mesa de outro garçom não entrega o token');
    assert.equal(Number(mesaB.garcomResponsavelId), Number(criadas.garcomOutro.id));
    assert.equal(mesaC.sessaoId, null);

    // Mesa A: sessão aberta sem pedido => "Aguardando pedido", sem tempo.
    assert.equal(mesaA.situacao, 'aguardando_pedido');
    assert.equal(mesaA.primeiroPedidoEm, null, 'sem pedido não há horário de primeiro pedido');
    assert.equal(mesaA.pedidosValidos, 0);
    assert.equal(mesaA.pracaNome, criadas.praca.nome, 'praça vem do cadastro');

    // Mesa B: o primeiro pedido válido é o de 90 min (já entregue, mas conta);
    // o cancelado de 2 min não conta nem é usado como "primeiro pedido".
    assert.equal(mesaB.situacao, 'em_atendimento');
    assert.equal(mesaB.pedidosValidos, 2, 'pedido cancelado não é pedido válido');
    const minutos = Math.round((Date.now() - new Date(mesaB.primeiroPedidoEm).getTime()) / 60000);
    assert.ok(minutos >= 89 && minutos <= 91, 'primeiro pedido há ~90 min: ' + minutos);
    assert.equal(mesaB.pracaId, null, 'mesa sem praça devolve NULL, nunca uma praça fictícia');
    assert.equal(mesaB.pracaNome, null);

    // Mesa C: livre.
    assert.equal(mesaC.situacao, 'livre');
    assert.equal(mesaC.primeiroPedidoEm, null);

    // Somente leitura: sessão e mesa continuam como estavam.
    const { rows: sessoes } = await pool.query(
      'SELECT status FROM mesa_sessoes WHERE id = ANY($1::int[])',
      [[criadas.sessao.id, sessaoB.id]]
    );
    assert.deepEqual(sessoes.map((s) => s.status), ['aberta', 'aberta']);
    const { rows: statusMesas } = await pool.query(
      'SELECT status FROM mesas WHERE id = ANY($1::int[])', [criadas.mesas]
    );
    assert.deepEqual(statusMesas.map((m) => m.status), ['livre', 'livre', 'livre']);
  } finally {
    const limpar = async (sql, params = []) => { await pool.query(sql, params).catch(() => {}); };
    if (criadas.pedidos.length) await limpar('DELETE FROM itens_pedido WHERE pedido_id = ANY($1::int[])', [criadas.pedidos]);
    if (criadas.pedidos.length) await limpar('DELETE FROM pedidos WHERE id = ANY($1::int[])', [criadas.pedidos]);
    await limpar('DELETE FROM mesa_sessoes WHERE mesa_id = ANY($1::int[])', [criadas.mesas]);
    await limpar('UPDATE mesas SET praca_id = NULL WHERE id = ANY($1::int[])', [criadas.mesas]);
    // As mesas 61..63 são reaproveitadas por outras suítes: devolvemos o vínculo
    // de praça e mantemos as linhas (não apagamos o cadastro de mesas da casa).

    if (criadas.praca) await limpar('DELETE FROM mesa_pracas WHERE id = $1', [criadas.praca.id]);
    if (criadas.garcom) await limpar('DELETE FROM garcons WHERE id = $1', [criadas.garcom.id]);
    if (criadas.garcomOutro) await limpar('DELETE FROM garcons WHERE id = $1', [criadas.garcomOutro.id]);
    if (configOriginal) {
      await limpar('UPDATE configuracao_mesas SET quantidade = $1 WHERE id = 1', [configOriginal.quantidade]);
    }
    // O pool é um singleton: fechá-lo deixa o processo sair sem esperar o idle.
    await pool.end().catch(() => {});
  }
});
