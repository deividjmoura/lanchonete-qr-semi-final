const { ErroCaixa } = require('./erro');

function validarSessaoId(sessaoId) {
  const n = Number(sessaoId);
  if (!Number.isInteger(n) || n < 1) throw new ErroCaixa(400, 'Sessão inválida');
  return n;
}

/**
 * Trava a sessão na ORDEM GLOBAL de locks: mesa primeiro, sessão depois.
 */
async function travarSessao(client, sessaoId) {
  const { rows: refs } = await client.query(
    'SELECT mesa_id FROM mesa_sessoes WHERE id = $1',
    [sessaoId]
  );
  if (!refs[0]) throw new ErroCaixa(404, 'Sessão não encontrada');
  await client.query('SELECT id FROM mesas WHERE id = $1 FOR UPDATE', [refs[0].mesa_id]);
  const { rows } = await client.query(
    `SELECT s.*, m.numero AS mesa
     FROM mesa_sessoes s
     JOIN mesas m ON m.id = s.mesa_id
     WHERE s.id = $1
     FOR UPDATE OF s`,
    [sessaoId]
  );
  if (!rows[0]) throw new ErroCaixa(404, 'Sessão não encontrada');
  return rows[0];
}

module.exports = { validarSessaoId, travarSessao };
