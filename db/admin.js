// CRUD de cardápio e listagem de mesas para o painel admin.
const pool = require('./pool');
const { resolverFotoUrl } = require('./foto-serve');
const { registrarEvento, registrarEventoIndependente } = require('./auditoria');
const { numeroFinito, numeroInteiroPositivo } = require('./validacao');

function normalizeFotoUrl(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  // data-URL (foto otimizada no Postgres — sobrevive a redeploy)
  if (/^data:image\/(webp|jpeg|jpg|png|gif);base64,/i.test(s)) {
    if (s.length > 550000) {
      throw new ErroAdmin(413, 'Foto em base64 muito grande (máx ~400 KB otimizado)');
    }
    return s;
  }
  if (s.startsWith('/') && !s.startsWith('//')) return s.slice(0, 500);
  if (/^https?:\/\//i.test(s)) return s.slice(0, 2000);
  throw new ErroAdmin(
    400,
    'URL da foto inválida (use upload no admin, https://… ou /caminho)'
  );
}

class ErroAdmin extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function obterAdminAtivo(client, ator) {
  if (!ator) return null;
  const result = await client.query(
    'SELECT id, nome, papel, ativo FROM staff WHERE id=$1 FOR SHARE',
    [ator.id]
  );
  const admin = result.rows[0];
  if (!admin?.ativo || admin.papel !== 'admin') {
    throw new ErroAdmin(403, 'Apenas um administrador ativo pode alterar o cardápio.');
  }
  return admin;
}

/**
 * Remove somente o e-mail pré-autorizado de uma conta ativa ainda não vinculada
 * ao Google. A mutação e a auditoria pertencem à mesma transação.
 */
async function definirEmailGoogleStaff(idBruto, emailBruto, ator, requestId = null) {
  const id = numeroInteiroPositivo(idBruto, 'funcionário');
  const email = String(emailBruto || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroAdmin(400, 'Informe um e-mail válido.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await obterAdminAtivo(client, ator);
    if (!admin) throw new ErroAdmin(403, 'Apenas um administrador ativo pode alterar e-mails.');
    const { rows } = await client.query('SELECT id, nome, login, email, google_sub, ativo FROM staff WHERE id=$1 FOR UPDATE', [id]);
    const alvo = rows[0];
    if (!alvo) throw new ErroAdmin(404, 'Funcionário não encontrado.');
    if (!alvo.ativo) throw new ErroAdmin(409, 'Não é possível alterar o e-mail de um funcionário inativo.');
    const mudou = String(alvo.email || '').toLowerCase() !== email;
    const desvinculou = Boolean(alvo.google_sub) && mudou;
    const atualizado = await client.query(
      'UPDATE staff SET email = $2, google_sub = CASE WHEN lower(COALESCE(email, \'\')) <> $2 THEN NULL ELSE google_sub END WHERE id = $1 AND ativo = TRUE RETURNING id, nome, login, email, google_sub',
      [id, email]
    );
    if (!atualizado.rows[0]) throw new ErroAdmin(409, 'O cadastro mudou durante a operação. Atualize a lista e tente novamente.');
    const sessoes = desvinculou ? await client.query('DELETE FROM staff_sessoes WHERE staff_id = $1', [id]) : { rowCount: 0 };
    await registrarEvento(client, {
      atorTipo: 'staff', atorId: Number(admin.id), atorNome: admin.nome || null,
      acao: 'email_google_atualizado', alvoTipo: 'staff', alvoId: String(id), requestId,
      contexto: { googleDesvinculado: desvinculou, sessoesRevogadas: sessoes.rowCount },
    });
    await client.query('COMMIT');
    return { ...atualizado.rows[0], googleVinculado: Boolean(atualizado.rows[0].google_sub), googleDesvinculado: desvinculou, sessoesRevogadas: sessoes.rowCount };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

/** Remove o e-mail autorizado e a identidade Google, quando houver. */
async function removerEmailGoogleStaff(idBruto, ator, requestId = null) {
  const id = numeroInteiroPositivo(idBruto, 'funcionário');
  const client = await pool.connect();
  let negado = null;
  try {
    await client.query('BEGIN');
    let admin;
    try { admin = await obterAdminAtivo(client, ator); }
    catch (e) { if (e instanceof ErroAdmin) negado = 'ator_sem_permissao'; throw e; }
    if (!admin) { negado = 'ator_sem_permissao'; throw new ErroAdmin(403, 'Apenas um administrador ativo pode remover e-mails.'); }
    const { rows } = await client.query('SELECT id, nome, login, email, google_sub, ativo FROM staff WHERE id=$1 FOR UPDATE', [id]);
    const alvo = rows[0];
    if (!alvo) { negado = 'conta_inexistente'; throw new ErroAdmin(404, 'Funcionário não encontrado.'); }
    if (!alvo.ativo) { negado = 'conta_inativa'; throw new ErroAdmin(409, 'Não é possível remover o e-mail de um funcionário inativo.'); }
    if (!alvo.email && !alvo.google_sub) { negado = 'conta_sem_email'; throw new ErroAdmin(409, 'Este funcionário não possui e-mail ou vínculo Google cadastrado.'); }
    const atualizado = await client.query(
      'UPDATE staff SET email = NULL, google_sub = NULL WHERE id = $1 AND ativo = TRUE AND (email IS NOT NULL OR google_sub IS NOT NULL) RETURNING id, nome, login, email',
      [id]
    );
    if (!atualizado.rows[0]) { negado = 'concorrencia'; throw new ErroAdmin(409, 'O cadastro mudou durante a operação. Atualize a lista e tente novamente.'); }
    const sessoes = alvo.google_sub ? await client.query('DELETE FROM staff_sessoes WHERE staff_id = $1', [id]) : { rowCount: 0 };
    await registrarEvento(client, {
      atorTipo: 'staff', atorId: Number(admin.id), atorNome: admin.nome || null,
      acao: 'email_google_removido', alvoTipo: 'staff', alvoId: String(id), requestId,
      contexto: { emailRemovido: Boolean(alvo.email), googleDesvinculado: Boolean(alvo.google_sub), sessoesRevogadas: sessoes.rowCount },
    });
    await client.query('COMMIT');
    return { ...atualizado.rows[0], googleVinculado: false, googleDesvinculado: Boolean(alvo.google_sub), sessoesRevogadas: sessoes.rowCount };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (negado && ator && Number.isInteger(ator.id)) {
      await registrarEventoIndependente({
        atorTipo: 'staff', atorId: Number(ator.id), atorNome: ator.nome || null,
        acao: 'email_google_remocao_negada', alvoTipo: 'staff', alvoId: String(id),
        resultado: 'negado', requestId,
        contexto: { motivo: negado, statusHttp: Number(e && e.status) || null },
      }).catch(() => {});
    }
    throw e;
  } finally { client.release(); }
}

async function listMesas() {
  const { rows } = await pool.query(
    `SELECT m.id, m.numero, m.token, m.status, m.praca_id, pr.nome AS praca_nome,
            s.id AS sessao_id, s.valor_total, s.aberta_em, s.cliente_nome, s.garcom_responsavel_id, g.nome AS garcom_responsavel_nome
     FROM mesas m
     LEFT JOIN mesa_pracas pr ON pr.id = m.praca_id
     LEFT JOIN mesa_sessoes s ON s.mesa_id = m.id AND s.status = 'aberta'
     LEFT JOIN garcons g ON g.id=s.garcom_responsavel_id
     ORDER BY m.numero`
  );
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    token: r.token,
    status: r.sessao_id ? 'ocupada' : r.status,
    sessaoAberta: Boolean(r.sessao_id),
    sessaoId: r.sessao_id || null,
    valorTotal: r.valor_total != null ? Number(r.valor_total) : null,
    abertaEm: r.aberta_em || null,
    clienteNome: r.cliente_nome || null,
    garcomResponsavelId: r.garcom_responsavel_id || null,
    garcomResponsavelNome: r.garcom_responsavel_nome || null,
    pracaId: r.praca_id != null ? Number(r.praca_id) : null,
    pracaNome: r.praca_nome || null,
  }));
}

/* ---------- Praças internas (Praia, Guarda-sol, Salão…) ----------
 * Os nomes são dados editáveis no banco, nunca constantes na UI. "Sem praça"
 * é a ausência de vínculo (praca_id NULL), não uma linha fictícia.
 */
const PRACA_NOME_MAX = 40;

async function listarPracas() {
  const { rows } = await pool.query(
    `SELECT p.id, p.nome, p.ordem,
            COUNT(m.id)::int AS mesas
       FROM mesa_pracas p
       LEFT JOIN mesas m ON m.praca_id = p.id
      GROUP BY p.id, p.nome, p.ordem
      ORDER BY p.ordem, lower(p.nome), p.id`
  );
  return rows.map((r) => ({
    id: Number(r.id),
    nome: r.nome,
    ordem: Number(r.ordem),
    mesas: Number(r.mesas),
  }));
}

function nomePraca(nomeBruto) {
  const nome = String(nomeBruto == null ? '' : nomeBruto).trim();
  if (!nome) throw new ErroAdmin(400, 'Informe o nome da praça');
  if (nome.length > PRACA_NOME_MAX) {
    throw new ErroAdmin(400, `O nome da praça deve ter até ${PRACA_NOME_MAX} caracteres`);
  }
  return nome;
}

async function criarPraca({ nome, ordem } = {}) {
  const limpo = nomePraca(nome);
  const ordemNumero = ordem == null
    ? Number((await pool.query('SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM mesa_pracas')).rows[0].proxima)
    : numeroFinito(ordem, 'ordem', { inteiro: true, minimo: 0 });
  try {
    const { rows } = await pool.query(
      'INSERT INTO mesa_pracas (nome, ordem) VALUES ($1, $2) RETURNING id, nome, ordem',
      [limpo, ordemNumero]
    );
    return { id: Number(rows[0].id), nome: rows[0].nome, ordem: Number(rows[0].ordem), mesas: 0 };
  } catch (e) {
    // Nome único sem diferenciar caixa/espaços: o operador vê a causa, não 500.
    if (e && e.code === '23505') throw new ErroAdmin(409, 'Já existe uma praça com esse nome');
    throw e;
  }
}

async function atualizarPraca(id, { nome, ordem } = {}) {
  const pracaId = numeroInteiroPositivo(id, 'praça');
  const campos = [];
  const vals = [];
  let i = 1;
  if (nome !== undefined) {
    campos.push(`nome = $${i++}`);
    vals.push(nomePraca(nome));
  }
  if (ordem !== undefined) {
    campos.push(`ordem = $${i++}`);
    vals.push(numeroFinito(ordem, 'ordem', { inteiro: true, minimo: 0 }));
  }
  if (!campos.length) throw new ErroAdmin(400, 'Nada para atualizar');
  campos.push('atualizado_em = now()');
  vals.push(pracaId);
  try {
    const { rows } = await pool.query(
      `UPDATE mesa_pracas SET ${campos.join(', ')} WHERE id = $${i} RETURNING id, nome, ordem`,
      vals
    );
    if (!rows[0]) throw new ErroAdmin(404, 'Praça não encontrada');
    return { id: Number(rows[0].id), nome: rows[0].nome, ordem: Number(rows[0].ordem) };
  } catch (e) {
    if (e instanceof ErroAdmin) throw e;
    if (e && e.code === '23505') throw new ErroAdmin(409, 'Já existe uma praça com esse nome');
    throw e;
  }
}

/**
 * Exclui uma praça de vez.
 *
 * A FK de `mesas.praca_id` é `ON DELETE SET NULL`: as mesas da praça voltam
 * para “Sem praça” (praca_id NULL) e nenhuma mesa é apagada. O histórico de
 * contas continua legível porque o nome da praça sai apenas da lista de
 * classificação — nada é reescrito retroativamente.
 */
async function removerPraca(idBruto, ator = null, requestId = null) {
  const pracaId = numeroInteiroPositivo(idBruto, 'praça');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: pracas } = await client.query(
      'SELECT id, nome FROM mesa_pracas WHERE id = $1 FOR UPDATE',
      [pracaId]
    );
    if (!pracas[0]) throw new ErroAdmin(404, 'Praça não encontrada');
    const nome = pracas[0].nome;
    // As mesas afetadas são lidas antes: é o que a UI confirma com o operador.
    const { rows: mesas } = await client.query(
      'SELECT numero FROM mesas WHERE praca_id = $1 ORDER BY numero',
      [pracaId]
    );
    await client.query('DELETE FROM mesa_pracas WHERE id = $1', [pracaId]);
    if (ator && Number.isInteger(ator.id)) {
      const { registrarEvento } = require('./auditoria');
      await registrarEvento(client, {
        atorTipo: 'staff',
        atorId: ator.id,
        atorNome: ator.nome || null,
        acao: 'praca_removida',
        alvoTipo: 'praca',
        alvoId: String(pracaId),
        requestId,
        // Contexto mínimo e sem aninhamento: a auditoria guarda só primitivos
        // (política de db/auditoria.js — nunca listas/objetos).
        contexto: {
          nome,
          mesasAfetadas: mesas.length,
          numeros: mesas.map((m) => Number(m.numero)).join(',') || null,
        },
      });
    }
    await client.query('COMMIT');
    return { id: pracaId, nome, mesasAfetadas: mesas.map((m) => Number(m.numero)) };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Atribui (ou remove, com pracaId null) a praça de uma mesa habilitada. */
async function definirPracaMesa(numeroBruto, pracaBruto, ator = null, requestId = null) {
  const numero = Number(numeroBruto);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 70) {
    throw new ErroAdmin(400, 'Informe o número de uma mesa entre 1 e 70');
  }
  const pracaId = pracaBruto === null || pracaBruto === undefined || pracaBruto === ''
    ? null
    : Number(pracaBruto);
  if (pracaId !== null && (!Number.isSafeInteger(pracaId) || pracaId < 1)) {
    throw new ErroAdmin(400, 'Praça inválida');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: config } = await client.query('SELECT quantidade FROM configuracao_mesas WHERE id = 1');
    if (numero > Number(config[0]?.quantidade ?? 20)) {
      throw new ErroAdmin(409, 'Mesa ainda não habilitada pelo administrador');
    }
    const { rows: mesas } = await client.query(
      'SELECT id, praca_id FROM mesas WHERE numero = $1 FOR UPDATE',
      [numero]
    );
    if (!mesas[0]) throw new ErroAdmin(404, 'Mesa não encontrada');

    let nome = null;
    if (pracaId !== null) {
      const { rows: pracas } = await client.query('SELECT id, nome FROM mesa_pracas WHERE id = $1', [pracaId]);
      if (!pracas[0]) throw new ErroAdmin(404, 'Praça não encontrada');
      nome = pracas[0].nome;
    }

    const anterior = mesas[0].praca_id != null ? Number(mesas[0].praca_id) : null;
    const alterou = anterior !== pracaId;
    if (alterou) {
      await client.query('UPDATE mesas SET praca_id = $2 WHERE id = $1', [mesas[0].id, pracaId]);
      if (ator && Number.isInteger(ator.id)) {
        const { registrarEvento } = require('./auditoria');
        await registrarEvento(client, {
          atorTipo: 'staff',
          atorId: ator.id,
          atorNome: ator.nome || null,
          acao: 'mesa_praca_definida',
          alvoTipo: 'mesa',
          alvoId: String(numero),
          requestId,
          contexto: { mesa: numero, pracaAnteriorId: anterior, pracaNovaId: pracaId },
        });
      }
    }
    await client.query('COMMIT');
    return { mesa: numero, pracaId, pracaNome: nome, alterada: alterou };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Configuração operacional: a lista começa com 20 mesas, cresce até 70.
// Os tokens existentes permanecem intactos; nenhuma mesa é excluída.
async function quantidadeMesasAtivas() {
  const { rows } = await pool.query('SELECT quantidade FROM configuracao_mesas WHERE id = 1');
  return Number(rows[0]?.quantidade ?? 20);
}

async function ativarMesas(quantidade, ator = null, requestId = null) {
  if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 70) {
    throw new ErroAdmin(400, 'Informe uma quantidade inteira de 1 a 70 mesas');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let admin = null;
    if (ator) {
      const result = await client.query(
        'SELECT id, nome, papel, ativo FROM staff WHERE id=$1 FOR SHARE',
        [ator.id]
      );
      admin = result.rows[0];
      if (!admin?.ativo || admin.papel !== 'admin') {
        throw new ErroAdmin(403, 'Apenas um administrador ativo pode habilitar mesas.');
      }
    }
    // Serializa ampliações simultâneas e protege do limite excedido.
    const { rows } = await client.query('SELECT quantidade FROM configuracao_mesas WHERE id = 1 FOR UPDATE');
    if (!rows.length) throw new ErroAdmin(500, 'Configuração de mesas não inicializada');
    const atual = Number(rows[0].quantidade);
    if (quantidade < atual) throw new ErroAdmin(400, 'Não é permitido desativar mesas por esta operação');
    if (quantidade > 70) throw new ErroAdmin(400, 'Limite de 70 mesas');
    // Provisiona de forma idempotente as mesas que ainda não existem.
    // O token é gerado pelo DEFAULT da tabela; registros e sessões existentes
    // permanecem intactos. A trava em configuracao_mesas serializa ampliações.
    await client.query(
      `INSERT INTO mesas (numero)
       SELECT serie.numero
         FROM generate_series(1, $1::int) AS serie(numero)
        WHERE NOT EXISTS (
          SELECT 1 FROM mesas m WHERE m.numero = serie.numero
        )`,
      [quantidade]
    );
    if (quantidade > atual) {
      await client.query('UPDATE configuracao_mesas SET quantidade = $1 WHERE id = 1', [quantidade]);
      const { registrarEvento } = require('./auditoria');
      await registrarEvento(client, {
        atorTipo: admin ? 'staff' : 'sistema',
        atorId: admin ? Number(admin.id) : null,
        atorNome: admin?.nome || null,
        acao: 'mesas_habilitadas',
        alvoTipo: 'configuracao_mesas',
        alvoId: '1',
        requestId,
        contexto: { quantidadeAnterior: atual, quantidadeNova: quantidade },
      });
    }
    await client.query('COMMIT');
    return { quantidade };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

function mapProdutoRow(p) {
  return {
    id: p.id,
    categoriaId: p.categoria_id,
    nome: p.nome,
    descricao: p.descricao,
    preco: Number(p.preco),
    fotoUrl: resolverFotoUrl(p.foto_url, Number(p.id)),
    disponivel: p.disponivel,
    pedePontoCarne: p.pede_ponto_carne,
    setor: p.setor === 'bar' ? 'bar' : 'cozinha',
    controlaEstoque: Boolean(p.controla_estoque),
    estoque: p.estoque != null ? Number(p.estoque) : null,
    estoqueMinimo: Number(p.estoque_minimo || 0),
    estoqueBaixo: Boolean(p.controla_estoque) && p.estoque != null && Number(p.estoque) <= Number(p.estoque_minimo || 0),
    ordem: p.ordem != null ? Number(p.ordem) : 0,
  };
}

/* Categorias que entram na lista do admin: as que têm pelo menos um produto
   ativo (o caso normal, com os itens editáveis um a um) e as que estão vazias
   porque foram criadas à mão e ainda esperam produtos. Fica de fora só a
   categoria que restou apenas com produtos arquivados por uma importação —
   ela não tem nada para editar, e as vendas antigas continuam no histórico. */
const SQL_CATEGORIAS_ADMIN = `SELECT c.id, c.nome, c.ordem
   FROM categorias c
  WHERE EXISTS (
          SELECT 1 FROM produtos p
           WHERE p.categoria_id = c.id AND p.arquivado = FALSE
        )
     OR NOT EXISTS (
          SELECT 1 FROM produtos p WHERE p.categoria_id = c.id
        )
  ORDER BY c.ordem, c.id`;

const SQL_CATEGORIAS_ADMIN_SEM_ARQUIVADOS = 'SELECT id, nome, ordem FROM categorias ORDER BY ordem, id';

async function getCardapioAdmin() {
  let categorias;
  try {
    ({ rows: categorias } = await pool.query(SQL_CATEGORIAS_ADMIN));
  } catch (e) {
    /* Banco ainda sem a migration 0033 (coluna `arquivado`): a lista do admin
       não pode sumir por causa disso — cai no SELECT simples de antes. */
    if (!e || e.code !== '42703') throw e;
    ({ rows: categorias } = await pool.query(SQL_CATEGORIAS_ADMIN_SEM_ARQUIVADOS));
  }
  let produtos;
  try {
    ({ rows: produtos } = await pool.query(
      `SELECT id, categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne,
              controla_estoque, estoque, estoque_minimo, ordem, setor
       FROM produtos WHERE arquivado = FALSE
       ORDER BY ordem ASC NULLS LAST, id ASC`
    ));
  } catch (e) {
    /* migration 0012/0013 ainda não aplicada — tenta sem ordem/setor */
    try {
      ({ rows: produtos } = await pool.query(
        `SELECT id, categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne,
                controla_estoque, estoque, estoque_minimo, ordem
         FROM produtos ORDER BY ordem ASC NULLS LAST, id ASC`
      ));
    } catch (e2) {
      ({ rows: produtos } = await pool.query(
        `SELECT id, categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne,
                controla_estoque, estoque, estoque_minimo
         FROM produtos ORDER BY id ASC`
      ));
    }
  }
  const { rows: adicionais } = await pool.query(
    'SELECT id, produto_id, nome, preco FROM adicionais ORDER BY id'
  );
  const { rows: removiveis } = await pool.query(
    'SELECT produto_id, ingrediente FROM produtos_ingredientes_removiveis ORDER BY produto_id, ingrediente'
  );

  return categorias.map((cat) => ({
    id: cat.id,
    nome: cat.nome,
    ordem: cat.ordem,
    produtos: produtos
      .filter((p) => p.categoria_id === cat.id)
      .map((p) => ({
        ...mapProdutoRow(p),
        adicionais: adicionais
          .filter((a) => a.produto_id === p.id)
          .map((a) => ({ id: a.id, nome: a.nome, preco: Number(a.preco) })),
        removiveis: removiveis
          .filter((r) => r.produto_id === p.id)
          .map((r) => r.ingrediente),
      })),
  }));
}

async function criarCategoria({ nome, ordem = 0 }, ator = null, requestId = null) {
  const n = String(nome || '').trim();
  if (!n) throw new ErroAdmin(400, 'Nome da categoria é obrigatório');
  const ordemNumero = numeroFinito(ordem, 'ordem', { inteiro: true, minimo: 0 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await obterAdminAtivo(client, ator);
    const { rows } = await client.query(
      'INSERT INTO categorias (nome, ordem) VALUES ($1, $2) RETURNING id, nome, ordem',
      [n, ordemNumero]
    );
    const categoria = rows[0];
    await registrarEvento(client, {
      atorTipo: admin ? 'staff' : 'sistema',
      atorId: admin ? Number(admin.id) : null,
      atorNome: admin?.nome || null,
      acao: 'categoria_criada',
      alvoTipo: 'categoria',
      alvoId: String(categoria.id),
      requestId,
      contexto: { nome: categoria.nome, ordem: Number(categoria.ordem) },
    });
    await client.query('COMMIT');
    return categoria;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function atualizarCategoria(id, { nome, ordem }, ator = null, requestId = null) {
  const campos = [];
  const vals = [];
  let i = 1;
  if (nome !== undefined) {
    const n = String(nome).trim();
    if (!n) throw new ErroAdmin(400, 'Nome da categoria não pode ser vazio');
    campos.push(`nome = $${i++}`);
    vals.push(n);
  }
  if (ordem !== undefined) {
    const ordemNumero = numeroFinito(ordem, 'ordem', { inteiro: true, minimo: 0 });
    campos.push(`ordem = $${i++}`);
    vals.push(ordemNumero);
  }
  if (!campos.length) throw new ErroAdmin(400, 'Nada para atualizar');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await obterAdminAtivo(client, ator);
    const anterior = (await client.query(
      'SELECT id, nome, ordem FROM categorias WHERE id=$1 FOR UPDATE', [id]
    )).rows[0];
    if (!anterior) throw new ErroAdmin(404, 'Categoria não encontrada');
    vals.push(id);
    const { rows } = await client.query(
      `UPDATE categorias SET ${campos.join(', ')} WHERE id = $${i} RETURNING id, nome, ordem`,
      vals
    );
    const categoria = rows[0];
    await registrarEvento(client, {
      atorTipo: admin ? 'staff' : 'sistema',
      atorId: admin ? Number(admin.id) : null,
      atorNome: admin?.nome || null,
      acao: 'categoria_atualizada',
      alvoTipo: 'categoria',
      alvoId: String(id),
      requestId,
      contexto: {
        nomeAnterior: anterior.nome,
        nomeNovo: categoria.nome,
        ordemAnterior: Number(anterior.ordem),
        ordemNova: Number(categoria.ordem),
        camposAlterados: [nome !== undefined ? 'nome' : null, ordem !== undefined ? 'ordem' : null].filter(Boolean).join(','),
      },
    });
    await client.query('COMMIT');
    return categoria;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function criarProduto(body, ator = null, requestId = null) {
  const nome = String(body.nome || '').trim();
  const categoriaId = numeroInteiroPositivo(body.categoriaId, 'categoriaId');
  const preco = numeroFinito(body.preco, 'Preço', { minimo: 0 });
  const estoque = body.estoque != null && body.estoque !== ''
    ? numeroFinito(body.estoque, 'Estoque', { inteiro: true, minimo: 0 })
    : null;
  const estoqueMinimo = numeroFinito(
    body.estoqueMinimo ?? body.estoque_minimo ?? 0,
    'Estoque mínimo',
    { inteiro: true, minimo: 0 }
  );
  if (!nome) throw new ErroAdmin(400, 'Nome do produto é obrigatório');

  let setor = body.setor != null ? String(body.setor).trim() : null;
  if (setor && !['cozinha', 'bar'].includes(setor)) {
    throw new ErroAdmin(400, "setor precisa ser 'cozinha' ou 'bar'");
  }
  if (!setor) {
    // default inteligente pela categoria
    // (a importação CSV tem a sua própria regra, em db/cardapio-import.js)
    const { rows: catRows } = await pool.query('SELECT nome FROM categorias WHERE id = $1', [categoriaId]);
    const catNome = (catRows[0] && catRows[0].nome) || '';
    const n = String(catNome).toLowerCase();
    const nomeBebida = /heineken|budweiser|stella artois|corona|skol|brahma|antarctica|amstel|spaten|itaipava|bohemia|long neck|cerveja|chopp|chope|coca.cola|guaran[aá]|sprite|fanta|pepsi|energ[eé]tico|red bull|monster|suco|[aá]gua|refrigerante|caipirinha|vodka|whisk|vinho/i.test(nome);
    setor =
      nomeBebida ||
      n.includes('bebida') ||
      n.includes('suco') ||
      n.includes('drink') ||
      n.includes('cerveja') ||
      n.includes('chopp') ||
      n.includes('bar')
        ? 'bar'
        : 'cozinha';
  }

  // Issue #48: a criação passou a ser transacional para gravar o ator na MESMA
  // transação do produto. Antes não havia autoria nenhuma de quem cadastrou.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await obterAdminAtivo(client, ator);
    const { rows } = await client.query(
      `INSERT INTO produtos (categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne, controla_estoque, estoque, estoque_minimo, setor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne, controla_estoque, estoque, estoque_minimo, setor`,
      [
        categoriaId,
        nome,
        body.descricao ? String(body.descricao).trim() : null,
        preco,
        normalizeFotoUrl(body.fotoUrl ?? null),
        body.disponivel !== false,
        Boolean(body.pedePontoCarne),
        Boolean(body.controlaEstoque || body.controla_estoque),
        estoque,
        estoqueMinimo,
        setor,
      ]
    );
    const produto = rows[0];
    await registrarEvento(client, {
      atorTipo: admin ? 'staff' : 'sistema',
      atorId: admin ? Number(admin.id) : null,
      atorNome: admin?.nome || null,
      acao: 'produto_criado',
      alvoTipo: 'produto',
      alvoId: String(produto.id),
      requestId,
      contexto: {
        nome: produto.nome,
        categoriaId: Number(produto.categoria_id),
        preco: Number(produto.preco),
        setor: produto.setor,
        disponivel: Boolean(produto.disponivel),
      },
    });
    await client.query('COMMIT');
    return { ...mapProdutoRow(produto), adicionais: [], removiveis: [] };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function atualizarProduto(id, body, ator = null, requestId = null) {
  const campos = [];
  const vals = [];
  let i = 1;

  if (body.nome !== undefined) {
    const n = String(body.nome).trim();
    if (!n) throw new ErroAdmin(400, 'Nome não pode ser vazio');
    campos.push(`nome = $${i++}`);
    vals.push(n);
  }
  if (body.descricao !== undefined) {
    campos.push(`descricao = $${i++}`);
    vals.push(body.descricao ? String(body.descricao).trim() : null);
  }
  if (body.preco !== undefined) {
    const preco = numeroFinito(body.preco, 'Preço', { minimo: 0 });
    campos.push(`preco = $${i++}`);
    vals.push(preco);
  }
  if (body.fotoUrl !== undefined) {
    campos.push(`foto_url = $${i++}`);
    vals.push(normalizeFotoUrl(body.fotoUrl));
  }
  if (body.disponivel !== undefined) {
    campos.push(`disponivel = $${i++}`);
    vals.push(Boolean(body.disponivel));
  }
  if (body.pedePontoCarne !== undefined) {
    campos.push(`pede_ponto_carne = $${i++}`);
    vals.push(Boolean(body.pedePontoCarne));
  }
  if (body.categoriaId !== undefined) {
    const categoriaId = numeroInteiroPositivo(body.categoriaId, 'categoriaId');
    campos.push(`categoria_id = $${i++}`);
    vals.push(categoriaId);
  }
  if (body.controlaEstoque !== undefined || body.controla_estoque !== undefined) {
    campos.push(`controla_estoque = $${i++}`);
    vals.push(Boolean(body.controlaEstoque ?? body.controla_estoque));
  }
  if (body.setor !== undefined) {
    const setor = String(body.setor).trim();
    if (!['cozinha', 'bar'].includes(setor)) {
      throw new ErroAdmin(400, "setor precisa ser 'cozinha' ou 'bar'");
    }
    campos.push(`setor = $${i++}`);
    vals.push(setor);
  }
  if (body.estoque !== undefined) {
    const estoque = body.estoque === null || body.estoque === ''
      ? null
      : numeroFinito(body.estoque, 'Estoque', { inteiro: true, minimo: 0 });
    campos.push(`estoque = $${i++}`);
    vals.push(estoque);
  }
  if (body.estoqueMinimo !== undefined || body.estoque_minimo !== undefined) {
    const estoqueMinimo = numeroFinito(
      body.estoqueMinimo ?? body.estoque_minimo,
      'Estoque mínimo',
      { inteiro: true, minimo: 0 }
    );
    campos.push(`estoque_minimo = $${i++}`);
    vals.push(estoqueMinimo);
  }
  if (!campos.length) throw new ErroAdmin(400, 'Nada para atualizar');

  vals.push(id);
  // Issue #48: captura o estado anterior e grava o ator na mesma transação,
  // para a trilha poder responder "quem mudou o preço e de quanto para quanto".
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await obterAdminAtivo(client, ator);
    const anterior = (await client.query(
      'SELECT id, nome, preco, disponivel, categoria_id, setor FROM produtos WHERE id=$1 FOR UPDATE',
      [id]
    )).rows[0];
    if (!anterior) throw new ErroAdmin(404, 'Produto não encontrado');

    const { rows } = await client.query(
      `UPDATE produtos SET ${campos.join(', ')} WHERE id = $${i}
       RETURNING id, categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne, setor, controla_estoque, estoque, estoque_minimo, ordem`,
      vals
    );
    const produto = rows[0];

    const camposAlterados = Object.keys(body).filter((k) => body[k] !== undefined).join(',');
    await registrarEvento(client, {
      atorTipo: admin ? 'staff' : 'sistema',
      atorId: admin ? Number(admin.id) : null,
      atorNome: admin?.nome || null,
      acao: 'produto_atualizado',
      alvoTipo: 'produto',
      alvoId: String(id),
      requestId,
      contexto: {
        camposAlterados,
        nomeAnterior: anterior.nome,
        nomeNovo: produto.nome,
        precoAnterior: Number(anterior.preco),
        precoNovo: Number(produto.preco),
        disponivelAnterior: Boolean(anterior.disponivel),
        disponivelNovo: Boolean(produto.disponivel),
      },
    });
    await client.query('COMMIT');
    return mapProdutoRow(produto);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function criarAdicional(produtoId, { nome, preco }, ator = null, requestId = null) {
  const n = String(nome || '').trim();
  const p = numeroFinito(preco, 'Preço', { minimo: 0 });
  if (!n) throw new ErroAdmin(400, 'Nome do adicional é obrigatório');

  // Issue #48: adicional altera o preço final do que o cliente paga, então
  // também precisa de autoria na mesma transação.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await obterAdminAtivo(client, ator);
    const { rows: prod } = await client.query('SELECT id FROM produtos WHERE id = $1', [produtoId]);
    if (!prod[0]) throw new ErroAdmin(404, 'Produto não encontrado');

    const { rows } = await client.query(
      'INSERT INTO adicionais (produto_id, nome, preco) VALUES ($1, $2, $3) RETURNING id, produto_id, nome, preco',
      [produtoId, n, p]
    );
    const ad = rows[0];
    await registrarEvento(client, {
      atorTipo: admin ? 'staff' : 'sistema',
      atorId: admin ? Number(admin.id) : null,
      atorNome: admin?.nome || null,
      acao: 'adicional_criado',
      alvoTipo: 'adicional',
      alvoId: String(ad.id),
      requestId,
      contexto: { produtoId: Number(ad.produto_id), nome: ad.nome, preco: Number(ad.preco) },
    });
    await client.query('COMMIT');
    return { id: ad.id, produtoId: ad.produto_id, nome: ad.nome, preco: Number(ad.preco) };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function removerAdicional(id, ator = null, requestId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await obterAdminAtivo(client, ator);
    const anterior = (await client.query(
      'SELECT id, produto_id, nome, preco FROM adicionais WHERE id = $1 FOR UPDATE',
      [id]
    )).rows[0];
    if (!anterior) throw new ErroAdmin(404, 'Adicional não encontrado');

    await client.query('DELETE FROM adicionais WHERE id = $1', [id]);
    await registrarEvento(client, {
      atorTipo: admin ? 'staff' : 'sistema',
      atorId: admin ? Number(admin.id) : null,
      atorNome: admin?.nome || null,
      acao: 'adicional_removido',
      alvoTipo: 'adicional',
      alvoId: String(id),
      requestId,
      contexto: {
        produtoId: Number(anterior.produto_id),
        nome: anterior.nome,
        preco: Number(anterior.preco),
      },
    });
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function setRemoviveis(produtoId, ingredientes, ator = null, requestId = null) {
  const lista = Array.isArray(ingredientes)
    ? [...new Set(ingredientes.map((x) => String(x).trim()).filter(Boolean))]
    : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await obterAdminAtivo(client, ator);
    const { rows: prod } = await client.query('SELECT id FROM produtos WHERE id = $1', [produtoId]);
    if (!prod[0]) throw new ErroAdmin(404, 'Produto não encontrado');

    await client.query('DELETE FROM produtos_ingredientes_removiveis WHERE produto_id = $1', [produtoId]);
    for (const ing of lista) {
      await client.query(
        'INSERT INTO produtos_ingredientes_removiveis (produto_id, ingrediente) VALUES ($1, $2)',
        [produtoId, ing]
      );
    }
    await registrarEvento(client, {
      atorTipo: admin ? 'staff' : 'sistema',
      atorId: admin ? Number(admin.id) : null,
      atorNome: admin?.nome || null,
      acao: 'produto_removiveis_definidos',
      alvoTipo: 'produto',
      alvoId: String(produtoId),
      requestId,
      contexto: { quantidade: lista.length, ingredientes: lista.slice(0, 20) },
    });
    await client.query('COMMIT');
    return { produtoId, removiveis: lista };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function removerProduto(id, ator = null, requestId = null) {
  const { rows: used } = await pool.query(
    'SELECT 1 FROM itens_pedido WHERE produto_id = $1 LIMIT 1',
    [id]
  );
  if (used[0]) {
    throw new ErroAdmin(
      409,
      'Produto já aparece em pedidos antigos e não pode ser excluído. Use Pausar ou Esgotar.'
    );
  }
  const { rows: usedAdd } = await pool.query(
    `SELECT 1 FROM itens_pedido_adicionais ia
     JOIN adicionais a ON a.id = ia.adicional_id
     WHERE a.produto_id = $1 LIMIT 1`,
    [id]
  );
  if (usedAdd[0]) {
    throw new ErroAdmin(
      409,
      'Opções deste produto já foram usadas em pedidos e não podem ser excluídas. Use Pausar.'
    );
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await obterAdminAtivo(client, ator);
    const anterior = (await client.query(
      'SELECT id, nome, preco, categoria_id FROM produtos WHERE id = $1 FOR UPDATE',
      [id]
    )).rows[0];
    if (!anterior) throw new ErroAdmin(404, 'Produto não encontrado');

    await client.query('DELETE FROM produtos_ingredientes_removiveis WHERE produto_id = $1', [id]);
    await client.query('DELETE FROM adicionais WHERE produto_id = $1', [id]);
    const { rowCount } = await client.query('DELETE FROM produtos WHERE id = $1', [id]);
    if (!rowCount) throw new ErroAdmin(404, 'Produto não encontrado');
    await registrarEvento(client, {
      atorTipo: admin ? 'staff' : 'sistema',
      atorId: admin ? Number(admin.id) : null,
      atorNome: admin?.nome || null,
      acao: 'produto_removido',
      alvoTipo: 'produto',
      alvoId: String(id),
      requestId,
      contexto: {
        nome: anterior.nome,
        preco: Number(anterior.preco),
        categoriaId: Number(anterior.categoria_id),
      },
    });
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Reordena categorias: ids na ordem desejada → ordem 0..n-1 */
async function reordenarCategorias(ids) {
  if (!Array.isArray(ids) || !ids.length) throw new ErroAdmin(400, 'ids é obrigatório');
  const lista = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  if (lista.length !== ids.length) throw new ErroAdmin(400, 'ids inválidos');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT id FROM categorias');
    const existingSet = new Set(existing.map((r) => r.id));
    if (lista.length !== existingSet.size || lista.some((id) => !existingSet.has(id))) {
      throw new ErroAdmin(400, 'Lista de categorias incompleta ou inválida');
    }
    for (let i = 0; i < lista.length; i++) {
      await client.query('UPDATE categorias SET ordem = $1 WHERE id = $2', [i, lista[i]]);
    }
    await client.query('COMMIT');
    return { ok: true, ids: lista };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Reordena produtos de uma categoria: ids na ordem desejada → ordem 0..n-1 */
async function reordenarProdutos(categoriaId, ids, ator = null, requestId = null) {
  const catId = numeroInteiroPositivo(categoriaId, 'categoriaId');
  if (!Array.isArray(ids) || !ids.length) throw new ErroAdmin(400, 'ids é obrigatório');
  const lista = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  if (lista.length !== ids.length) throw new ErroAdmin(400, 'ids inválidos');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await obterAdminAtivo(client, ator);
    const { rows: existing } = await client.query(
      'SELECT id FROM produtos WHERE categoria_id = $1',
      [catId]
    );
    const existingSet = new Set(existing.map((r) => r.id));
    if (lista.length !== existingSet.size || lista.some((id) => !existingSet.has(id))) {
      throw new ErroAdmin(400, 'Lista de produtos incompleta ou inválida para esta categoria');
    }
    for (let i = 0; i < lista.length; i++) {
      await client.query('UPDATE produtos SET ordem = $1 WHERE id = $2 AND categoria_id = $3', [
        i,
        lista[i],
        catId,
      ]);
    }
    await registrarEvento(client, {
      atorTipo: admin ? 'staff' : 'sistema',
      atorId: admin ? Number(admin.id) : null,
      atorNome: admin?.nome || null,
      acao: 'produtos_reordenados',
      alvoTipo: 'categoria',
      alvoId: String(catId),
      requestId,
      contexto: { quantidade: lista.length },
    });
    await client.query('COMMIT');
    return { ok: true, categoriaId: catId, ids: lista };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Exclui categoria e todos os produtos dela (cascata).
 *  Bloqueia se algum produto já aparece em pedidos (histórico). */
async function removerCategoria(id) {
  const catId = Number(id);
  if (!catId) throw new ErroAdmin(400, 'ID inválido');

  const { rows: cats } = await pool.query(
    'SELECT id, nome FROM categorias WHERE id = $1',
    [catId]
  );
  if (!cats[0]) throw new ErroAdmin(404, 'Categoria não encontrada');
  const cat = cats[0];

  const { rows: prods } = await pool.query(
    'SELECT id, nome FROM produtos WHERE categoria_id = $1 ORDER BY nome',
    [catId]
  );

  const locked = [];
  for (const p of prods) {
    const { rows: used } = await pool.query(
      'SELECT 1 FROM itens_pedido WHERE produto_id = $1 LIMIT 1',
      [p.id]
    );
    if (used[0]) {
      locked.push(p.nome);
      continue;
    }
    const { rows: usedAdd } = await pool.query(
      `SELECT 1 FROM itens_pedido_adicionais ia
       JOIN adicionais a ON a.id = ia.adicional_id
       WHERE a.produto_id = $1 LIMIT 1`,
      [p.id]
    );
    if (usedAdd[0]) locked.push(p.nome);
  }

  if (locked.length) {
    const amostra = locked.slice(0, 5).join(', ');
    const mais = locked.length > 5 ? ` e mais ${locked.length - 5}` : '';
    throw new ErroAdmin(
      409,
      `Não dá para excluir a categoria \"${cat.nome}\": ${locked.length} produto(s) já aparecem em pedidos antigos (${amostra}${mais}). Pause esses itens ou mova-os para outra categoria.`
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of prods) {
      await client.query('DELETE FROM produtos_ingredientes_removiveis WHERE produto_id = $1', [p.id]);
      await client.query('DELETE FROM adicionais WHERE produto_id = $1', [p.id]);
      await client.query('DELETE FROM produtos WHERE id = $1', [p.id]);
    }
    const { rowCount } = await client.query('DELETE FROM categorias WHERE id = $1', [catId]);
    if (!rowCount) throw new ErroAdmin(404, 'Categoria não encontrada');
    await client.query('COMMIT');
    return {
      ok: true,
      id: catId,
      nome: cat.nome,
      produtosRemovidos: prods.length,
      produtos: prods.map((p) => p.nome),
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  ErroAdmin,
  definirEmailGoogleStaff,
  removerEmailGoogleStaff,
  listMesas,
  listarPracas,
  criarPraca,
  atualizarPraca,
  removerPraca,
  definirPracaMesa,
  quantidadeMesasAtivas,
  ativarMesas,
  getCardapioAdmin,
  criarCategoria,
  atualizarCategoria,
  removerCategoria,
  reordenarCategorias,
  criarProduto,
  atualizarProduto,
  reordenarProdutos,
  criarAdicional,
  removerAdicional,
  setRemoviveis,
  removerProduto,
};
