'use strict';

/**
 * Importação de cardápio completo por CSV.
 *
 * Duas responsabilidades, separadas de propósito:
 *
 *  1. `lerCsvCardapio(texto)` — puro, sem banco. Lê, valida e devolve o que
 *     seria importado + a lista de erros com linha e coluna. É o que alimenta a
 *     PRÉVIA no QR Admin: enquanto houver erro, nada é gravado.
 *  2. `importarCardapio({ texto, modo })` — relê o mesmo CSV (a fonte da
 *     verdade é o arquivo, não o JSON da prévia) e grava em UMA transação.
 *     Qualquer falha → ROLLBACK, cardápio anterior intacto.
 *
 * Regras da substituição: o cardápio antigo é ARQUIVADO, não apagado, porque
 * `itens_pedido.produto_id` é ON DELETE RESTRICT (histórico de vendas). O que
 * foi arquivado some do cardápio do cliente e da lista do admin.
 *
 * Formato (UTF-8, separador `;` ou `,`, decimais com vírgula):
 *   categoria;nome;descricao;preco;imagem_url;disponivel;ordem;estoque
 */

const pool = require('./pool');
const { bloquearCatalogo, snapshot, guardarReversao } = require('./cardapio-reversao');

const MAX_TEXTO_BYTES = 2 * 1024 * 1024;
const MAX_PRODUTOS = 2000;
const MAX_ERROS = 200;
const MAX_CATEGORIAS = 200;
const COLUNAS_CONHECIDAS = [
  'categoria',
  'nome',
  'descricao',
  'preco',
  'imagem_url',
  'disponivel',
  'ordem',
  'estoque',
];
const COLUNAS_OBRIGATORIAS = ['categoria', 'nome', 'preco', 'disponivel'];

/** Apelidos aceitos no cabeçalho (planilhas variam bastante). */
const APELIDOS = {
  categoria: ['categoria', 'category', 'secao', 'grupo'],
  nome: ['nome', 'produto', 'item', 'nome_produto', 'name'],
  descricao: ['descricao', 'descrição', 'detalhes', 'ingredientes'],
  preco: ['preco', 'preço', 'valor', 'price'],
  imagem_url: ['imagem_url', 'imagem', 'foto', 'foto_url', 'url_imagem', 'imagem url'],
  disponivel: ['disponivel', 'disponível', 'ativo', 'available'],
  ordem: ['ordem', 'posicao', 'posição', 'order'],
  estoque: ['estoque', 'quantidade_estoque', 'stock'],
};

/** Modelo servido em GET /api/admin/cardapio/modelo.csv (e usado nos testes). */
const MODELO_CSV = [
  'categoria;nome;descricao;preco;imagem_url;disponivel;ordem;estoque',
  'Lanches;X-Burger;Pão, hambúrguer artesanal, queijo e molho da casa;25,90;https://exemplo.com/x-burger.jpg;sim;1;20',
  'Lanches;X-Bacon;Pão, hambúrguer, queijo e bacon;29,90;;sim;2;0',
  'Bebidas;Refrigerante lata;Lata 350 ml;6,00;;sim;1;42',
  'Bebidas;Suco natural;Suco de laranja 500 ml;10,00;https://exemplo.com/suco.jpg;sim;2;',
  'Sobremesas;Pudim;Pudim de leite condensado;9,00;;nao;1;',
  '',
].join('\n');

class ErroImportCardapio extends Error {
  constructor(status, mensagem, detalhes = {}) {
    super(mensagem);
    this.name = 'ErroImportCardapio';
    this.status = status;
    this.detalhes = detalhes;
  }
}

/* -------------------------------------------------------------------------- */
/* Leitura do CSV                                                             */
/* -------------------------------------------------------------------------- */

/** Remove acentos e caixa: usado para comparar cabeçalhos e nomes. */
function chave(valor) {
  return String(valor == null ? '' : valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function detectarDelimitador(linhaCabecalho) {
  const pontos = (linhaCabecalho.match(/;/g) || []).length;
  const virgulas = (linhaCabecalho.match(/,/g) || []).length;
  return virgulas > pontos ? ',' : ';';
}

/**
 * Quebra o texto em registros respeitando aspas (que podem conter o separador,
 * quebras de linha e aspas escapadas como ""). Devolve a linha original de cada
 * registro para que o usuário encontre o problema na planilha.
 */
function dividirRegistros(texto, delimitador) {
  const registros = [];
  let campos = [];
  let campo = '';
  let emAspas = false;
  let linha = 1;
  let linhaDoRegistro = 1;

  const fecharCampo = () => {
    campos.push(campo.trim());
    campo = '';
  };
  const fecharRegistro = () => {
    fecharCampo();
    registros.push({ campos, linha: linhaDoRegistro });
    campos = [];
    linhaDoRegistro = linha + 1;
  };

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (emAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          emAspas = false;
        }
      } else {
        if (c === '\n') linha += 1;
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      emAspas = true;
      continue;
    }
    if (c === delimitador) {
      fecharCampo();
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') {
      fecharRegistro();
      linha += 1;
      linhaDoRegistro = linha;
      continue;
    }
    campo += c;
  }
  if (campo.length || campos.length) fecharRegistro();
  return registros;
}

/** "R$ 1.234,56" | "25,90" | "25.90" | "1234.56" → número (ou null). */
function parsePreco(bruto) {
  const original = String(bruto == null ? '' : bruto).trim();
  if (!original) return null;
  const limpo = original
    .replace(/r\$/gi, '')
    .replace(/\s|\u00a0/g, '')
    .replace(/[^\d.,-]/g, '');
  if (!limpo || !/\d/.test(limpo)) return null;

  const temPonto = limpo.includes('.');
  const temVirgula = limpo.includes(',');
  let normalizado = limpo;

  if (temPonto && temVirgula) {
    // O separador que aparece por último é o decimal; o outro é de milhar.
    const decimal = limpo.lastIndexOf(',') > limpo.lastIndexOf('.') ? ',' : '.';
    const milhar = decimal === ',' ? '.' : ',';
    normalizado = limpo.split(milhar).join('').replace(decimal, '.');
  } else if (temVirgula) {
    normalizado = limpo.replace(/,/g, '.');
  } else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    // "1.234" / "12.345" → separador de milhar (padrão pt-BR), não decimal.
    normalizado = limpo.split('.').join('');
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return Math.round(numero * 100) / 100;
}

/** sim/nao (+ variações comuns) → boolean (ou null quando irreconhecível). */
function parseDisponivel(bruto) {
  const v = chave(bruto);
  if (!v) return null;
  const SIM = ['sim', 's', 'true', '1', 'yes', 'y', 'ativo', 'disponivel', 'ok'];
  const NAO = ['nao', 'n', 'false', '0', 'no', 'inativo', 'indisponivel', 'off'];
  if (SIM.includes(v)) return true;
  if (NAO.includes(v)) return false;
  return null;
}

/** Só link público http(s); nada de data:, javascript: ou caminho local. */
function normalizarImagemUrl(bruto) {
  const valor = String(bruto == null ? '' : bruto).trim();
  if (!valor) return { ok: true, valor: null };
  if (valor.length > 2000) return { ok: false, mensagem: 'Link da imagem muito longo (máx. 2000)' };
  if (/\s/.test(valor)) return { ok: false, mensagem: 'Link da imagem não pode conter espaços' };
  let url;
  try {
    url = new URL(valor);
  } catch {
    return { ok: false, mensagem: 'Link da imagem inválido (use https://…)' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, mensagem: 'Link da imagem precisa começar com http:// ou https://' };
  }
  return { ok: true, valor: url.toString() };
}

function parseOrdem(bruto) {
  const valor = String(bruto == null ? '' : bruto).trim();
  if (!valor) return { ok: true, valor: null };
  if (!/^\d+$/.test(valor)) return { ok: false, mensagem: 'Ordem precisa ser um número inteiro (0, 1, 2…)' };
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero > 99999) {
    return { ok: false, mensagem: 'Ordem fora do intervalo permitido (0 a 99999)' };
  }
  return { ok: true, valor: numero };
}

function mapearCabecalho(campos) {
  const indices = {};
  const desconhecidas = [];
  campos.forEach((campo, indice) => {
    const c = chave(campo);
    if (!c) return;
    const canonica = COLUNAS_CONHECIDAS.find((col) => APELIDOS[col].includes(c));
    if (!canonica) {
      desconhecidas.push(String(campo).trim());
      return;
    }
    if (indices[canonica] === undefined) indices[canonica] = indice;
  });
  const faltando = COLUNAS_OBRIGATORIAS.filter((col) => indices[col] === undefined);
  return { indices, desconhecidas, faltando };
}

/**
 * Lê o CSV inteiro e devolve prévia + erros. Nunca toca no banco.
 * @param {string} texto conteúdo do arquivo
 */
function lerCsvCardapio(texto) {
  const vazio = {
    ok: false,
    resumo: {
      produtos: 0,
      categorias: 0,
      disponiveis: 0,
      indisponiveis: 0,
      comImagem: 0,
      linhas: 0,
      linhasIgnoradas: 0,
    },
    categorias: [],
    produtos: [],
    erros: [],
    avisos: [],
  };

  if (typeof texto !== 'string' || !texto.trim()) {
    return {
      ...vazio,
      erros: [{ linha: 0, coluna: null, mensagem: 'Envie um arquivo CSV com o cardápio.' }],
    };
  }
  if (Buffer.byteLength(texto, 'utf8') > MAX_TEXTO_BYTES) {
    return {
      ...vazio,
      erros: [
        {
          linha: 0,
          coluna: null,
          mensagem: `Arquivo maior que ${Math.round(MAX_TEXTO_BYTES / 1024 / 1024)} MB. Divida o cardápio em partes.`,
        },
      ],
    };
  }

  // BOM do Excel e restos de CR são ruído; U+FFFD indica arquivo fora de UTF-8.
  let conteudo = texto.replace(/^\uFEFF/, '');
  if (conteudo.includes('\uFFFD')) {
    return {
      ...vazio,
      erros: [
        {
          linha: 0,
          coluna: null,
          mensagem:
            'O arquivo não está em UTF-8 (acentos apareceram corrompidos). Salve como "CSV UTF-8" no Excel ou LibreOffice.',
        },
      ],
    };
  }

  const primeiraLinha = conteudo.split('\n', 1)[0] || '';
  const delimitador = detectarDelimitador(primeiraLinha);
  const registros = dividirRegistros(conteudo, delimitador);

  const cabecalho = registros.find((r) => r.campos.some((c) => c !== ''));
  if (!cabecalho) {
    return {
      ...vazio,
      erros: [{ linha: 0, coluna: null, mensagem: 'O arquivo está vazio.' }],
    };
  }

  const { indices, desconhecidas, faltando } = mapearCabecalho(cabecalho.campos);
  if (faltando.length) {
    return {
      ...vazio,
      erros: [
        {
          linha: cabecalho.linha,
          coluna: null,
          mensagem: `Cabeçalho incompleto: falta${faltando.length > 1 ? 'm' : ''} ${faltando.join(', ')}. Colunas esperadas: ${COLUNAS_CONHECIDAS.join(';')}.`,
        },
      ],
    };
  }

  const avisos = [];
  if (delimitador === ',') {
    avisos.push('Separador "," detectado: descrições com vírgula precisam estar entre aspas.');
  }
  if (desconhecidas.length) {
    avisos.push(`Colunas ignoradas: ${desconhecidas.join(', ')}.`);
  }

  const erros = [];
  const produtos = [];
  const categorias = [];
  const categoriaPorChave = new Map();
  const produtoPorChave = new Map();
  let linhasIgnoradas = 0;

  const valorDaColuna = (registro, coluna) => {
    const indice = indices[coluna];
    return indice === undefined ? '' : (registro.campos[indice] || '').trim();
  };

  for (const registro of registros) {
    if (registro === cabecalho) continue;
    if (!registro.campos.some((c) => c !== '')) {
      linhasIgnoradas += 1;
      continue;
    }
    if (produtos.length >= MAX_PRODUTOS) {
      erros.push({
        linha: registro.linha,
        coluna: null,
        mensagem: `Limite de ${MAX_PRODUTOS} produtos por arquivo. Divida o cardápio em partes.`,
      });
      break;
    }

    const categoria = valorDaColuna(registro, 'categoria');
    const nome = valorDaColuna(registro, 'nome');
    const descricao = valorDaColuna(registro, 'descricao');
    const precoBruto = valorDaColuna(registro, 'preco');
    const disponivelBruto = valorDaColuna(registro, 'disponivel');
    const imagemBruta = valorDaColuna(registro, 'imagem_url');
    const ordemBruta = valorDaColuna(registro, 'ordem');
    const estoqueBruto = valorDaColuna(registro, 'estoque');
    const estoque = estoqueBruto === '' ? null : Number(estoqueBruto);

    const problemas = [];
    if (estoqueBruto !== '' && (!/^\d+$/.test(estoqueBruto) || !Number.isInteger(estoque) || estoque > 2147483647)) {
      problemas.push({ coluna: 'estoque', mensagem: 'Estoque deve ser inteiro de 0 a 2147483647; vazio mantém o estoque atual.' });
    }
    if (!categoria) problemas.push({ coluna: 'categoria', mensagem: 'Categoria é obrigatória' });
    else if (categoria.length > 60) problemas.push({ coluna: 'categoria', mensagem: 'Categoria com mais de 60 caracteres' });

    if (!nome) problemas.push({ coluna: 'nome', mensagem: 'Nome do produto é obrigatório' });
    else if (nome.length > 120) problemas.push({ coluna: 'nome', mensagem: 'Nome com mais de 120 caracteres' });

    if (descricao.length > 500) {
      problemas.push({ coluna: 'descricao', mensagem: 'Descrição com mais de 500 caracteres' });
    }

    const preco = parsePreco(precoBruto);
    if (!precoBruto) problemas.push({ coluna: 'preco', mensagem: 'Preço é obrigatório' });
    else if (preco == null) problemas.push({ coluna: 'preco', mensagem: `Preço inválido: "${precoBruto}"` });
    else if (preco > 1_000_000) problemas.push({ coluna: 'preco', mensagem: 'Preço acima de R$ 1.000.000,00' });

    const disponivel = parseDisponivel(disponivelBruto);
    if (!disponivelBruto) problemas.push({ coluna: 'disponivel', mensagem: 'Informe disponivel = sim ou nao' });
    else if (disponivel == null) {
      problemas.push({ coluna: 'disponivel', mensagem: `Valor inválido para disponivel: "${disponivelBruto}" (use sim ou nao)` });
    }

    const imagem = normalizarImagemUrl(imagemBruta);
    if (!imagem.ok) problemas.push({ coluna: 'imagem_url', mensagem: imagem.mensagem });

    const ordem = parseOrdem(ordemBruta);
    if (!ordem.ok) problemas.push({ coluna: 'ordem', mensagem: ordem.mensagem });

    if (problemas.length) {
      for (const p of problemas) {
        if (erros.length < MAX_ERROS) {
          erros.push({ linha: registro.linha, coluna: p.coluna, mensagem: p.mensagem });
        }
      }
      continue;
    }

    const categoriaChave = chave(categoria);
    const produtoChave = `${categoriaChave}||${chave(nome)}`;
    if (produtoPorChave.has(produtoChave)) {
      erros.push({
        linha: registro.linha,
        coluna: 'nome',
        mensagem: `"${nome}" aparece mais de uma vez em "${categoria}" (linha ${produtoPorChave.get(produtoChave)})`,
      });
      continue;
    }
    produtoPorChave.set(produtoChave, registro.linha);

    let grupo = categoriaPorChave.get(categoriaChave);
    if (!grupo) {
      if (categorias.length >= MAX_CATEGORIAS) {
        erros.push({
          linha: registro.linha,
          coluna: 'categoria',
          mensagem: `Limite de ${MAX_CATEGORIAS} categorias por arquivo.`,
        });
        break;
      }
      grupo = {
        nome: categoria,
        ordem: categorias.length,
        produtos: 0,
      };
      categoriaPorChave.set(categoriaChave, grupo);
      categorias.push(grupo);
    }

    const posicaoPadrao = grupo.produtos;
    grupo.produtos += 1;

    produtos.push({
      linha: registro.linha,
      categoria,
      nome,
      descricao: descricao || null,
      preco,
      imagemUrl: imagem.valor,
      estoque,
      disponivel,
      ordem: ordem.valor != null ? ordem.valor : posicaoPadrao,
    });
  }

  if (!erros.length && !produtos.length) {
    erros.push({ linha: cabecalho.linha, coluna: null, mensagem: 'Nenhum produto encontrado abaixo do cabeçalho.' });
  }

  const resumo = {
    produtos: produtos.length,
    categorias: categorias.length,
    disponiveis: produtos.filter((p) => p.disponivel).length,
    indisponiveis: produtos.filter((p) => !p.disponivel).length,
    comImagem: produtos.filter((p) => p.imagemUrl).length,
    linhas: registros.length,
    linhasIgnoradas,
  };

  return {
    ok: erros.length === 0,
    resumo,
    categorias,
    produtos,
    erros,
    avisos,
    delimitador,
  };
}

/* -------------------------------------------------------------------------- */
/* Gravação (transacional)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Substitui ou atualiza o cardápio a partir do CSV.
 *
 * modo "substituir": arquiva todo o cardápio atual (histórico preservado) e
 *   cadastra o do arquivo. Categorias são reaproveitadas pelo nome.
 * modo "atualizar": altera os produtos identificados por categoria + nome e
 *   mantém o resto como está; cria o que não existir.
 *
 * @returns {Promise<object>} resumo do que foi gravado
 */
async function importarCardapio({ texto, modo = 'substituir', ator = null, requestId = null }) {
  const leitura = lerCsvCardapio(texto);
  if (!leitura.ok) {
    throw new ErroImportCardapio(
      400,
      leitura.erros.length === 1
        ? leitura.erros[0].mensagem
        : `O arquivo tem ${leitura.erros.length} problema(s) e não foi importado.`,
      { erros: leitura.erros, resumo: leitura.resumo }
    );
  }
  if (!['substituir', 'atualizar'].includes(modo)) {
    throw new ErroImportCardapio(400, "Escolha o modo: 'substituir' ou 'atualizar'.");
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await bloquearCatalogo(client);
    const anterior = await snapshot(client);

    // Serializa importações concorrentes: dois uploads ao mesmo tempo não podem
    // se atropelar (o segundo espera o primeiro terminar).
    await client.query('SELECT id FROM categorias ORDER BY id FOR UPDATE');

    const { rows: categoriasAtuais } = await client.query(
      'SELECT id, nome, ordem FROM categorias ORDER BY ordem, id'
    );
    const categoriaPorNome = new Map(categoriasAtuais.map((c) => [chave(c.nome), c]));

    let produtosArquivados = 0;
    if (modo === 'substituir') {
      const { rowCount } = await client.query(
        'UPDATE produtos SET arquivado = TRUE, disponivel = FALSE WHERE arquivado = FALSE'
      );
      produtosArquivados = rowCount || 0;
    }

    const { rows: produtosAtivos } = await client.query(
      `SELECT id, categoria_id, nome FROM produtos
        WHERE arquivado = FALSE
        FOR UPDATE`
    );
    const produtoPorChave = new Map(
      produtosAtivos.map((p) => [`${p.categoria_id}||${chave(p.nome)}`, p])
    );

    let categoriasCriadas = 0;
    const idPorCategoria = new Map();
    for (const categoria of leitura.categorias) {
      const existente = categoriaPorNome.get(chave(categoria.nome));
      if (existente) {
        idPorCategoria.set(categoria.nome, existente.id);
        continue;
      }
      const { rows } = await client.query(
        'INSERT INTO categorias (nome, ordem) VALUES ($1, $2) RETURNING id',
        [categoria.nome.trim(), categoria.ordem]
      );
      categoriaPorNome.set(chave(categoria.nome), { id: rows[0].id, nome: categoria.nome, ordem: categoria.ordem });
      idPorCategoria.set(categoria.nome, rows[0].id);
      categoriasCriadas += 1;
    }

    let inseridos = 0;
    let atualizados = 0;

    for (const produto of leitura.produtos) {
      const categoriaId = idPorCategoria.get(produto.categoria);
      const existente = modo === 'atualizar'
        ? produtoPorChave.get(`${categoriaId}||${chave(produto.nome)}`)
        : null;

      if (existente) {
        await client.query(
          `UPDATE produtos
              SET nome = $2, descricao = $3, preco = $4, foto_url = $5,
                  disponivel = $6, ordem = $7,
                  controla_estoque = CASE WHEN $8::int IS NULL THEN controla_estoque ELSE TRUE END,
                  estoque = CASE WHEN $8::int IS NULL THEN estoque ELSE $8 END
            WHERE id = $1`,
          [
            existente.id,
            produto.nome.trim(),
            produto.descricao,
            produto.preco,
            produto.imagemUrl,
            produto.disponivel,
            produto.ordem,
            produto.estoque,
          ]
        );
        atualizados += 1;
        continue;
      }

      await client.query(
        `INSERT INTO produtos
           (categoria_id, nome, descricao, preco, foto_url, disponivel, ordem, setor, controla_estoque, estoque)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          categoriaId,
          produto.nome.trim(),
          produto.descricao,
          produto.preco,
          produto.imagemUrl,
          produto.disponivel,
          produto.ordem,
          inferirSetor(produto.nome, produto.categoria),
          produto.estoque !== null,
          produto.estoque,
        ]
      );
      inseridos += 1;
    }

    // Categorias que ficaram definitivamente vazias (sem nenhum produto, nem
    // arquivado) podem sair — as demais continuam para preservar o histórico.
    const { rowCount: categoriasRemovidas } = await client.query(
      `DELETE FROM categorias c
        WHERE NOT EXISTS (SELECT 1 FROM produtos p WHERE p.categoria_id = c.id)`
    );

    const resumo = {
      ok: true,
      modo,
      produtos: leitura.produtos.length,
      categorias: leitura.categorias.length,
      produtosInseridos: inseridos,
      produtosAtualizados: atualizados,
      produtosArquivados,
      categoriasCriadas,
      categoriasRemovidas: categoriasRemovidas || 0,
    };

    if (ator && Number.isInteger(ator.id)) {
      const { registrarEvento } = require('./auditoria');
      await registrarEvento(client, {
        atorTipo: 'staff',
        atorId: ator.id,
        atorNome: ator.nome || null,
        acao: 'cardapio_importado',
        alvoTipo: 'cardapio',
        alvoId: null,
        requestId,
        contexto: {
          modo,
          produtos: resumo.produtos,
          categorias: resumo.categorias,
          inseridos,
          atualizados,
          arquivados: produtosArquivados,
        },
      });
    }

    resumo.versao = await guardarReversao(client, anterior);
    await client.query('COMMIT');
    return resumo;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e instanceof ErroImportCardapio) throw e;
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Setor de produção de um produto novo. Bebida vai para o bar; o resto, cozinha.
 * (Mesma heurística usada ao criar produto manualmente no admin.)
 */
function inferirSetor(nomeProduto, nomeCategoria) {
  const nome = chave(nomeProduto);
  const categoria = chave(nomeCategoria);
  const bebida =
    /heineken|budweiser|stella artois|corona|skol|brahma|antarctica|amstel|spaten|itaipava|bohemia|long neck|cerveja|chopp|chope|coca.cola|guarana|sprite|fanta|pepsi|energetico|red bull|monster|suco|agua|refrigerante|caipirinha|vodka|whisk|vinho|drink|limonada|cha |cafe/.test(
      nome
    );
  const categoriaBebida = /bebida|suco|drink|cerveja|chopp|bar|vinho|coquetel/.test(categoria);
  return bebida || categoriaBebida ? 'bar' : 'cozinha';
}

module.exports = {
  ErroImportCardapio,
  lerCsvCardapio,
  importarCardapio,
  parsePreco,
  parseDisponivel,
  inferirSetor,
  modeloCsv: MODELO_CSV,
  MAX_PRODUTOS,
  MAX_TEXTO_BYTES,
};
