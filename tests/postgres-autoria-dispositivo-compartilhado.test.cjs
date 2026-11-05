// Issue #48 — critério de aceite que faltava: "Testes com dois funcionários e
// dispositivo compartilhado provam que cada operação fica atribuída à
// identidade correta."
//
// O aparelho do caixa é único; quem muda é quem está logado. O teste sobe o
// `server.js` de produção (sem cópia alterada) e faz o ciclo real:
//
//   login do funcionário A  → cookie de sessão A
//   A recebe parte da conta → sessao_pagamentos.operador_id = A
//   logout                  → sessão A destruída no banco
//   login do funcionário B  → cookie de sessão B
//   B recebe o resto        → sessao_pagamentos.operador_id = B
//
// O que se prova aqui, e que um teste de unidade de `db/caixa.js` não prova:
// a identidade gravada vem do COOKIE da requisição, não de um parâmetro que o
// cliente escolhe. No fim, o valor cobrado por cada um é conciliável por
// identidade — inclusive depois de a conta de A ser renomeada.
//
//   DATABASE_URL=postgres://.../qradmin_test NODE_ENV=test \
//     node --test tests/postgres-autoria-dispositivo-compartilhado.test.cjs

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { subirServidor, exigirAmbienteDeTeste } = require('./helpers/public-table-server.cjs');

exigirAmbienteDeTeste();
const pool = require('../db/pool');
const auth = require('../db/auth');

const run = randomUUID().slice(0, 8);
const SENHA = 'Cafe-com-Leite-7788';
const criados = { staff: [], categorias: [], produtos: [], mesas: [], sessoes: [] };
let servidor;

const chamar = (metodo, caminho, opcoes) => servidor.request(metodo, caminho, opcoes);

function origemLocal() {
  return `http://127.0.0.1:${new URL(servidor.base).port}`;
}

/** Extrai o valor de um Set-Cookie (o harness não tem jar automático). */
function pegarCookie(resposta, nome) {
  const bruto = resposta.headers['set-cookie'];
  const lista = Array.isArray(bruto) ? bruto : bruto ? [bruto] : [];
  for (const c of lista) {
    if (c.startsWith(`${nome}=`)) return c.split(';')[0];
  }
  return null;
}

/** Login real pela rota pública, devolvendo cookie de sessão e CSRF. */
async function login(usuario, senha) {
  const r = await chamar('POST', '/api/login', {
    corpo: { usuario, senha },
    headers: { origin: origemLocal() },
  });
  assert.equal(r.status, 200, `login de ${usuario} deveria funcionar: ${r.texto}`);
  const cookie = pegarCookie(r, 'lqr_session');
  assert.ok(cookie, 'o login precisa emitir cookie de sessão');
  return { cookie, csrf: r.json.csrfToken, staff: r.json.staff };
}

async function logout(sessao) {
  const r = await chamar('POST', '/api/logout', {
    headers: { origin: origemLocal(), cookie: sessao.cookie, 'x-csrf-token': sessao.csrf },
  });
  assert.equal(r.status, 200, `logout deveria funcionar: ${r.texto}`);
}

test.before(async () => {
  const hash = await auth.hashSenha(SENHA);
  const { rows: contas } = await pool.query(
    `INSERT INTO staff (nome, login, senha_hash, papel, ativo, deve_trocar_senha)
     VALUES ($1, $2, $3, 'caixa', TRUE, FALSE),
            ($4, $5, $3, 'caixa', TRUE, FALSE)
     RETURNING id, nome, login`,
    ['Ana do Caixa', `ana-${run}`, hash, 'Bruno do Caixa', `bruno-${run}`]
  );
  criados.staff.push(...contas.map((c) => c.id));

  const { rows: cat } = await pool.query(
    'INSERT INTO categorias (nome, ordem) VALUES ($1, 0) RETURNING id',
    [`CI Autoria Compartilhada ${run}`]
  );
  criados.categorias.push(cat[0].id);

  // 40 reais de consumo entregue: cada funcionário recebe 20.
  const { rows: prod } = await pool.query(
    'INSERT INTO produtos (categoria_id, nome, preco, disponivel) VALUES ($1, $2, 20, TRUE) RETURNING id',
    [cat[0].id, `Item autoria ${run}`]
  );
  criados.produtos.push(prod[0].id);

  // `max(numero)` é NULL em banco recém-migrado (o CI não roda db:seed), e a
  // coluna é NOT NULL: coalesce é obrigatório para a suíte rodar do zero.
  const { rows: mesa } = await pool.query(
    "INSERT INTO mesas (numero, token, status) VALUES ((SELECT coalesce(max(numero),0)+1 FROM mesas), $1, 'ocupada') RETURNING id",
    [randomUUID()]
  );
  criados.mesas.push(mesa[0].id);

  const { rows: sess } = await pool.query(
    "INSERT INTO mesa_sessoes (mesa_id, status, valor_total) VALUES ($1, 'aberta', 40) RETURNING id",
    [mesa[0].id]
  );
  criados.sessoes.push(sess[0].id);

  const { rows: ped } = await pool.query(
    "INSERT INTO pedidos (sessao_id, status) VALUES ($1, 'entregue') RETURNING id",
    [sess[0].id]
  );
  await pool.query(
    "INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario, status) VALUES ($1, $2, 2, 20, 'entregue')",
    [ped[0].id, prod[0].id]
  );

  servidor = await subirServidor();
});

test.after(async () => {
  if (servidor) await servidor.encerrar();
  if (criados.sessoes.length) {
    await pool.query(
      'DELETE FROM sessao_pagamentos WHERE sessao_id = ANY($1::int[])',
      [criados.sessoes]
    );
    await pool.query(
      `DELETE FROM itens_pedido WHERE pedido_id IN
         (SELECT id FROM pedidos WHERE sessao_id = ANY($1::int[]))`,
      [criados.sessoes]
    );
    await pool.query('DELETE FROM pedidos WHERE sessao_id = ANY($1::int[])', [criados.sessoes]);
    await pool.query('DELETE FROM mesa_sessoes WHERE id = ANY($1::int[])', [criados.sessoes]);
  }
  if (criados.mesas.length) await pool.query('DELETE FROM mesas WHERE id = ANY($1::int[])', [criados.mesas]);
  if (criados.produtos.length) await pool.query('DELETE FROM produtos WHERE id = ANY($1::int[])', [criados.produtos]);
  if (criados.categorias.length) await pool.query('DELETE FROM categorias WHERE id = ANY($1::int[])', [criados.categorias]);
  if (criados.staff.length) {
    await pool.query('DELETE FROM staff_sessoes WHERE staff_id = ANY($1::int[])', [criados.staff]);
    await pool.query('DELETE FROM staff WHERE id = ANY($1::int[])', [criados.staff]);
  }
  await pool.end();
});

test('#48 dois funcionários no mesmo aparelho: cada lançamento tem a identidade de quem estava logado', async () => {
  const [ana, bruno] = criados.staff;
  const sessaoId = criados.sessoes[0];

  // --- Funcionário A no aparelho do caixa -----------------------------------
  const sessaoA = await login(`ana-${run}`, SENHA);
  assert.equal(sessaoA.staff.id, ana, 'a sessão é da Ana');

  const pagamentoA = await chamar('POST', `/api/caixa/sessoes/${sessaoId}/pagamentos`, {
    corpo: { valor: 20, formaPagamento: 'dinheiro', idempotencyKey: randomUUID() },
    headers: { origin: origemLocal(), cookie: sessaoA.cookie, 'x-csrf-token': sessaoA.csrf },
  });
  assert.equal(pagamentoA.status, 201, pagamentoA.texto);

  await logout(sessaoA);

  // A sessão da Ana morreu no banco: reutilizar o cookie antigo não pode
  // lançar pagamento em nome dela.
  const tentativaComCookieMorto = await chamar('POST', `/api/caixa/sessoes/${sessaoId}/pagamentos`, {
    corpo: { valor: 20, formaPagamento: 'dinheiro', idempotencyKey: randomUUID() },
    headers: { origin: origemLocal(), cookie: sessaoA.cookie, 'x-csrf-token': sessaoA.csrf },
  });
  assert.equal(tentativaComCookieMorto.status, 401, 'cookie de sessão destruída não autentica');

  // --- Funcionário B no MESMO aparelho --------------------------------------
  const sessaoB = await login(`bruno-${run}`, SENHA);
  assert.equal(sessaoB.staff.id, bruno, 'a sessão é do Bruno');

  const pagamentoB = await chamar('POST', `/api/caixa/sessoes/${sessaoId}/pagamentos`, {
    corpo: { valor: 20, formaPagamento: 'dinheiro', idempotencyKey: randomUUID() },
    headers: { origin: origemLocal(), cookie: sessaoB.cookie, 'x-csrf-token': sessaoB.csrf },
  });
  assert.equal(pagamentoB.status, 201, pagamentoB.texto);

  // --- A prova: a autoria vem do cookie, não do corpo da requisição ---------
  const { rows: lancamentos } = await pool.query(
    'SELECT id, valor, operador_id, operador_nome FROM sessao_pagamentos WHERE sessao_id = $1 ORDER BY id',
    [sessaoId]
  );
  assert.equal(lancamentos.length, 2);
  assert.equal(Number(lancamentos[0].operador_id), ana, 'primeiro lançamento é da Ana');
  assert.equal(lancamentos[1].operador_id, bruno, 'segundo lançamento é do Bruno');
  assert.equal(lancamentos[0].operador_nome, 'Ana do Caixa');
  assert.equal(lancamentos[1].operador_nome, 'Bruno do Caixa');

  // Cada um responde por 20 e a soma fecha a conta.
  const { rows: porOperador } = await pool.query(
    `SELECT operador_id, SUM(valor)::numeric(12,2) AS total
       FROM sessao_pagamentos WHERE sessao_id = $1 GROUP BY operador_id ORDER BY operador_id`,
    [sessaoId]
  );
  assert.deepEqual(
    porOperador.map((r) => [Number(r.operador_id), Number(r.total)]),
    [[ana, 20], [bruno, 20]],
    'a conciliação por identidade separa o que cada funcionário recebeu'
  );

  // Renomear a conta não reescreve a história nem perde o vínculo.
  await pool.query('UPDATE staff SET nome = $2 WHERE id = $1', [ana, 'Ana Souza (casada)']);
  const { rows: depois } = await pool.query(
    'SELECT operador_id, operador_nome FROM sessao_pagamentos WHERE sessao_id = $1 AND operador_id = $2',
    [sessaoId, ana]
  );
  assert.equal(depois.length, 1);
  assert.equal(Number(depois[0].operador_id), ana, 'o vínculo continua apontando para a mesma pessoa');
  assert.equal(depois[0].operador_nome, 'Ana do Caixa', 'o nome do lançamento é retrato do momento');
});
