// Exclusão de praça contra PostgreSQL real.
// Roda no CI (postgres:16) e localmente com embedded-postgres. Cria os próprios
// dados sintéticos e limpa tudo no finally, devolvendo as mesas à praça de
// origem (o banco de teste é compartilhado entre suítes).
//
// Um único teste por arquivo: o pool é um singleton e `pool.end()` encerra a
// suíte — o mesmo padrão das outras suítes PostgreSQL.

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
const { mesaDetalhe } = require('../db/mesas-panorama');

test('excluir praça devolve as mesas para “Sem praça”, audita e é 404 se não existe', async () => {
  const suffix = randomUUID().slice(0, 8);
  const nome = `Varanda ${suffix}`;
  const numeros = [1, 2];
  const pracaOriginal = {};
  // Mesas criadas por esta suíte (a limpeza só apaga o que ela mesma criou).
  const mesasCriadas = [];
  let pracaId = null;
  let staffId = null;

  try {
    // As mesas 1 e 2 do caminho feliz vêm do seed em ambientes de desenvolvimento,
    // mas o CI aplica apenas migrations. Criar aqui (com a quantidade já liberada
    // na configuração) mantém a suíte hermética: ela não depende de `npm run db:seed`
    // e continua funcionando quando as mesas já existem.
    for (const numero of numeros) {
      const { rows } = await pool.query(
        'INSERT INTO mesas (numero) VALUES ($1) ON CONFLICT (numero) DO NOTHING RETURNING id',
        [numero],
      );
      if (rows[0]) mesasCriadas.push(rows[0].id);
    }
    const config = (await pool.query('SELECT quantidade FROM configuracao_mesas WHERE id = 1')).rows[0];
    assert.ok(
      Number(config?.quantidade) >= Math.max(...numeros),
      'configuração de mesas precisa liberar as mesas usadas no teste',
    );

    // Praça inexistente: 404 limpo, sem apagar nada por engano.
    const antes = (await pool.query('SELECT COUNT(*)::int AS total FROM mesa_pracas')).rows[0].total;
    await assert.rejects(
      () => admin.removerPraca(999999999),
      (erro) => erro.status === 404 && /não encontrada/i.test(erro.message),
    );
    const depois = (await pool.query('SELECT COUNT(*)::int AS total FROM mesa_pracas')).rows[0].total;
    assert.equal(depois, antes, 'nenhuma praça é removida por engano');

    for (const numero of numeros) {
      const { rows } = await pool.query('SELECT praca_id FROM mesas WHERE numero = $1', [numero]);
      pracaOriginal[numero] = rows[0] ? rows[0].praca_id : null;
    }
    staffId = (await pool.query(
      "INSERT INTO staff (nome, login, senha_hash, papel) VALUES ($1, $2, $3, 'admin') RETURNING id",
      [`Admin praça ${suffix}`, `praca-${suffix}`, 'hash-de-teste'],
    )).rows[0].id;
    const ator = { id: staffId, nome: `Admin praça ${suffix}` };

    const criada = await admin.criarPraca({ nome });
    pracaId = criada.id;
    for (const numero of numeros) {
      await admin.definirPracaMesa(numero, pracaId, ator, null);
    }
    assert.deepEqual(
      (await admin.listarPracas()).filter((p) => p.id === pracaId).map((p) => p.mesas),
      [numeros.length],
      'a praça nasce com as mesas vinculadas',
    );

    // A exclusão devolve as mesas (ON DELETE SET NULL): nenhuma mesa é apagada.
    const removida = await admin.removerPraca(pracaId, ator, null);
    pracaId = null;
    assert.equal(removida.nome, nome);
    assert.deepEqual(removida.mesasAfetadas, numeros, 'a resposta diz quais mesas voltaram para “Sem praça”');

    const vinculos = (await pool.query(
      'SELECT numero, praca_id FROM mesas WHERE numero = ANY($1) ORDER BY numero',
      [numeros],
    )).rows;
    for (const linha of vinculos) {
      assert.equal(linha.praca_id, null, `mesa ${linha.numero} volta para Sem praça (NULL)`);
      assert.equal((await mesaDetalhe(linha.numero)).pracaNome, null);
    }
    assert.ok(
      !(await admin.listarPracas()).some((p) => p.nome === nome),
      'praça excluída sai da lista de classificação',
    );

    // Auditoria registrada na mesma transação da exclusão.
    const evento = (await pool.query(
      "SELECT acao, alvo_id, contexto FROM auditoria_eventos WHERE acao = 'praca_removida' AND ator_id = $1 ORDER BY id DESC LIMIT 1",
      [staffId],
    )).rows[0];
    assert.ok(evento, 'exclusão de praça precisa gerar evento de auditoria');
    assert.equal(evento.alvo_id, String(removida.id));
    assert.equal(evento.contexto.nome, nome);
    assert.equal(evento.contexto.mesasAfetadas, numeros.length);
    assert.equal(evento.contexto.numeros, '1,2');
  } finally {
    if (pracaId) {
      await pool.query('UPDATE mesas SET praca_id = NULL WHERE praca_id = $1', [pracaId]).catch(() => {});
      await pool.query('DELETE FROM mesa_pracas WHERE id = $1', [pracaId]).catch(() => {});
    }
    for (const numero of numeros) {
      await pool
        .query('UPDATE mesas SET praca_id = $2 WHERE numero = $1', [numero, pracaOriginal[numero] ?? null])
        .catch(() => {});
    }
    if (staffId) await pool.query('DELETE FROM staff WHERE id = $1', [staffId]).catch(() => {});
    // Só remove as mesas que esta execução criou; as pré-existentes ficam intactas.
    if (mesasCriadas.length) {
      await pool
        .query('DELETE FROM mesas WHERE id = ANY($1::int[])', [mesasCriadas])
        .catch(() => {});
    }
    await pool.end();
  }
});
