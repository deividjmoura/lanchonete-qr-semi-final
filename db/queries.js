// Helpers compartilhados entre as rotas que já foram migradas pro Postgres.
// Nada aqui grava dado transacional sozinho — quem faz isso é db/pedidos.js,
// dentro de transações. Este módulo só lê e resolve a sessão da mesa.

const TRANSICOES = {
  recebido: 'em_producao',
  em_producao: 'concluido',
  concluido: 'entregue',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v.trim());
}

async function getMesaPorToken(client, token) {
  if (!isUuid(token)) return null;
  const { rows } = await client.query(
    'SELECT id, numero, status FROM mesas WHERE token = $1',
    [token.trim()]
  );
  return rows[0] || null;
}

// Abre/reaproveita a sessão aberta da mesa de forma serializada.
// O lock na linha da mesa impede que duas transações simultâneas observem
// "nenhuma sessão aberta" ao mesmo tempo. Assim não dependemos de capturar
// uma violação 23505 dentro da mesma transação, que deixaria o PostgreSQL em
// estado abortado até ROLLBACK/SAVEPOINT.
//
// Ordem global de locks do sistema (respeite em todo código novo):
//   mesas → mesa_sessoes → pedidos → itens_pedido → produtos (por id crescente)
// Seguir essa ordem em todo fluxo é o que torna deadlock praticamente
// impossível; o retry de db/retry.js é só a rede de segurança.
async function getOuAbrirSessao(client, mesaId) {
  const { rows: mesas } = await client.query(
    'SELECT id FROM mesas WHERE id = $1 FOR UPDATE',
    [mesaId]
  );
  if (!mesas[0]) return null;

  const { rows: abertas } = await client.query(
    "SELECT id FROM mesa_sessoes WHERE mesa_id = $1 AND status = 'aberta' LIMIT 1",
    [mesaId]
  );
  if (abertas[0]) {
    // Auto-cura de drift: sessão aberta com mesa "livre" voltaria a aparecer
    // como disponível para outra conta no painel.
    await client.query(
      "UPDATE mesas SET status = 'ocupada' WHERE id = $1 AND status <> 'ocupada'",
      [mesaId]
    );
    return abertas[0].id;
  }

  const { rows: novas } = await client.query(
    'INSERT INTO mesa_sessoes (mesa_id) VALUES ($1) RETURNING id',
    [mesaId]
  );
  await client.query("UPDATE mesas SET status = 'ocupada' WHERE id = $1", [mesaId]);
  return novas[0].id;
}

/**
 * Trava as linhas de produtos em ordem crescente de id — sempre a mesma
 * ordem, em qualquer mesa. Sem isso, dois carrinhos simultâneos com os
 * mesmos produtos em ordens opostas travam A→B e B→A e o PostgreSQL aborta
 * um deles com deadlock no meio do pico. Devolve os ids efetivamente travados.
 */
async function travarProdutosEmOrdem(client, produtoIds) {
  const ids = [...new Set((produtoIds || []).filter((n) => Number.isInteger(n) && n >= 1))]
    .sort((a, b) => a - b);
  if (!ids.length) return ids;
  await client.query(
    'SELECT id FROM produtos WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
    [ids]
  );
  return ids;
}

// Lê os produtos junto com as regras que o servidor precisa pra validar os
// itens do pedido (nunca confiar em preço/adicional/remoção vindos do cliente).
// Versão em LOTE: 3 consultas para o carrinho inteiro. A versão item a item
// fazia 3 consultas POR ITEM segurando o lock da mesa (e a conexão do pool)
// por dezenas de round-trips — com 70 mesas é a diferença entre fila e fluxo.
async function getProdutosComRegras(client, produtoIds) {
  const ids = [...new Set((produtoIds || []).filter((n) => Number.isInteger(n) && n >= 1))];
  const porId = new Map();
  if (!ids.length) return porId;

  const { rows: produtos } = await client.query(
    'SELECT id, nome, preco, disponivel, pede_ponto_carne, controla_estoque, estoque, setor FROM produtos WHERE id = ANY($1::int[])',
    [ids]
  );
  if (!produtos.length) return porId;

  const encontrados = produtos.map((p) => p.id);
  const { rows: adicionais } = await client.query(
    'SELECT id, produto_id, nome, preco FROM adicionais WHERE produto_id = ANY($1::int[])',
    [encontrados]
  );
  const { rows: removiveis } = await client.query(
    'SELECT produto_id, ingrediente FROM produtos_ingredientes_removiveis WHERE produto_id = ANY($1::int[])',
    [encontrados]
  );

  const adPorProduto = new Map();
  for (const a of adicionais) {
    if (!adPorProduto.has(a.produto_id)) adPorProduto.set(a.produto_id, []);
    adPorProduto.get(a.produto_id).push({ id: a.id, nome: a.nome, preco: a.preco });
  }
  const remPorProduto = new Map();
  for (const r of removiveis) {
    if (!remPorProduto.has(r.produto_id)) remPorProduto.set(r.produto_id, []);
    remPorProduto.get(r.produto_id).push(r.ingrediente);
  }

  for (const p of produtos) {
    porId.set(p.id, {
      ...p,
      adicionaisPermitidos: adPorProduto.get(p.id) || [],
      removiveisPermitidos: remPorProduto.get(p.id) || [],
    });
  }
  return porId;
}

async function getProdutoComRegras(client, produtoId) {
  if (!Number.isInteger(produtoId) || produtoId < 1) return null;
  const porId = await getProdutosComRegras(client, [produtoId]);
  return porId.get(produtoId) || null;
}

module.exports = {
  TRANSICOES,
  getMesaPorToken,
  getOuAbrirSessao,
  getProdutoComRegras,
  getProdutosComRegras,
  travarProdutosEmOrdem,
};
