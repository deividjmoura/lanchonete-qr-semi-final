'use strict';

/**
 * Importação de cardápio completo por CSV.
 *
 * Cobre as três camadas que precisam concordar:
 *  - o LEITOR do arquivo (puro): preço em pt-BR, aspas, BOM, cabeçalho e,
 *    principalmente, os erros — porque nada pode ser gravado com arquivo torto;
 *  - a GRAVAÇÃO transacional (com pool falso): substituir arquiva em vez de
 *    apagar (histórico), atualizar preserva o resto, e qualquer falha dá ROLLBACK;
 *  - o CONTRATO das rotas e da tela (leitura de fonte): prévia → confirmação,
 *    com `confirmar: true` exigido no servidor.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:5432/qradmin_test';

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const pool = require('../db/pool');
const restauradores = [];

/** Instala um pool falso no objeto real (o importador guarda a referência). */
function instalarPool(cenario = {}) {
  const estado = {
    categorias: (cenario.categorias || []).map((c) => ({ ...c })),
    produtos: (cenario.produtos || []).map((p) => ({ ...p })),
    sqls: [],
    commits: 0,
    rollbacks: 0,
    inseridos: [],
    atualizados: [],
    falharEm: cenario.falharEm || null,
    proximoId: 500,
  };

  const normalizar = (sql) => String(sql).replace(/\s+/g, ' ').trim();

  const client = {
    query: async (sql, params = []) => {
      const q = normalizar(sql);
      estado.sqls.push(q);
      if (estado.falharEm && q.includes(estado.falharEm)) {
        const erro = new Error('falha simulada do banco');
        erro.code = 'SIMULADA';
        throw erro;
      }
      if (q === 'BEGIN' || q === 'COMMIT' || q === 'ROLLBACK') {
        if (q === 'COMMIT') estado.commits += 1;
        if (q === 'ROLLBACK') estado.rollbacks += 1;
        return { rows: [], rowCount: 0 };
      }
      if (q.startsWith('SELECT id FROM categorias')) {
        return { rows: estado.categorias.map((c) => ({ id: c.id })), rowCount: estado.categorias.length };
      }
      if (q.startsWith('SELECT id, nome, ordem FROM categorias')) {
        return { rows: estado.categorias.map((c) => ({ ...c })), rowCount: estado.categorias.length };
      }
      if (q.startsWith('UPDATE produtos SET arquivado = TRUE')) {
        const total = estado.produtos.filter((p) => !p.arquivado).length;
        estado.produtos.forEach((p) => {
          p.arquivado = true;
          p.disponivel = false;
        });
        return { rows: [], rowCount: total };
      }
      if (q.startsWith('SELECT id, categoria_id, nome FROM produtos')) {
        const ativos = estado.produtos.filter((p) => !p.arquivado);
        return { rows: ativos.map((p) => ({ id: p.id, categoria_id: p.categoria_id, nome: p.nome })), rowCount: ativos.length };
      }
      if (q.startsWith('INSERT INTO categorias')) {
        const id = estado.proximoId++;
        estado.categorias.push({ id, nome: params[0], ordem: params[1] });
        return { rows: [{ id }], rowCount: 1 };
      }
      if (q.startsWith('UPDATE produtos SET nome')) {
        estado.atualizados.push({ id: params[0], nome: params[1], preco: params[3], disponivel: params[5], ordem: params[6] });
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('INSERT INTO produtos')) {
        estado.inseridos.push({
          categoriaId: params[0],
          nome: params[1],
          descricao: params[2],
          preco: params[3],
          foto: params[4],
          disponivel: params[5],
          ordem: params[6],
          setor: params[7],
        });
        return { rows: [{ id: estado.proximoId++ }], rowCount: 1 };
      }
      if (q.startsWith('DELETE FROM categorias')) {
        return { rows: [], rowCount: cenario.categoriasRemovidas || 0 };
      }
      // auditoria e qualquer outro SELECT/INSERT não previsto
      return { rows: [], rowCount: 0 };
    },
    release: () => {
      estado.released = (estado.released || 0) + 1;
    },
  };

  const queryOriginal = pool.query;
  const connectOriginal = pool.connect;
  pool.query = async () => ({ rows: [], rowCount: 0 });
  pool.connect = async () => client;
  restauradores.push(() => {
    pool.query = queryOriginal;
    pool.connect = connectOriginal;
  });
  return estado;
}

after(() => {
  while (restauradores.length) restauradores.pop()();
});

const {
  lerCsvCardapio,
  importarCardapio,
  parsePreco,
  parseDisponivel,
  inferirSetor,
  modeloCsv,
  ErroImportCardapio,
} = require('../db/cardapio-import');

const CABECALHO = 'categoria;nome;descricao;preco;imagem_url;disponivel;ordem';

/* -------------------------------------------------------------------------- */
/* Leitor do CSV                                                              */
/* -------------------------------------------------------------------------- */

test('o modelo oficial do CSV é importável sem nenhum erro', () => {
  const leitura = lerCsvCardapio(modeloCsv);
  assert.equal(leitura.ok, true, JSON.stringify(leitura.erros));
  assert.equal(leitura.erros.length, 0);
  assert.equal(leitura.resumo.produtos, 5);
  assert.equal(leitura.resumo.categorias, 3);
  assert.equal(leitura.resumo.disponiveis, 4);
  assert.equal(leitura.resumo.indisponiveis, 1);
  assert.equal(leitura.resumo.comImagem, 2);

  // Preço com vírgula, descrição com vírgula e imagem opcional.
  const xBurger = leitura.produtos.find((p) => p.nome === 'X-Burger');
  assert.equal(xBurger.preco, 25.9);
  assert.equal(xBurger.descricao, 'Pão, hambúrguer artesanal, queijo e molho da casa');
  assert.equal(xBurger.imagemUrl, 'https://exemplo.com/x-burger.jpg');
  assert.equal(xBurger.disponivel, true);
  assert.equal(xBurger.ordem, 1);

  const xBacon = leitura.produtos.find((p) => p.nome === 'X-Bacon');
  assert.equal(xBacon.imagemUrl, null);
  assert.equal(xBacon.ordem, 2);

  const pudim = leitura.produtos.find((p) => p.nome === 'Pudim');
  assert.equal(pudim.disponivel, false);

  // Categorias na ordem de aparição do arquivo.
  assert.deepEqual(leitura.categorias.map((c) => c.nome), ['Lanches', 'Bebidas', 'Sobremesas']);
  assert.deepEqual(leitura.categorias.map((c) => c.produtos), [2, 2, 1]);
});

test('preço aceita os formatos que o Excel e o LibreOffice geram', () => {
  assert.equal(parsePreco('25,90'), 25.9);
  assert.equal(parsePreco('25.90'), 25.9);
  assert.equal(parsePreco('R$ 1.234,56'), 1234.56);
  assert.equal(parsePreco('1.234'), 1234); // milhar pt-BR, não 1,234
  assert.equal(parsePreco('12.345.678,90'), 12345678.9);
  assert.equal(parsePreco('6'), 6);
  assert.equal(parsePreco(' 10,00 '), 10);
  assert.equal(parsePreco('0'), 0);
  for (const invalido of ['', '   ', 'abc', 'R$', '-3', '10,00,00', null, undefined]) {
    assert.equal(parsePreco(invalido), null, `deveria recusar ${JSON.stringify(invalido)}`);
  }
});

test('disponivel entende sim/nao e variações, e recusa o resto', () => {
  for (const sim of ['sim', 'SIM', 's', 'true', '1', 'yes', 'ativo', 'disponível', 'Disponivel']) {
    assert.equal(parseDisponivel(sim), true, sim);
  }
  for (const nao of ['nao', 'não', 'NAO', 'n', 'false', '0', 'no', 'inativo', 'indisponível']) {
    assert.equal(parseDisponivel(nao), false, nao);
  }
  for (const nada of ['', 'talvez', 'sim/nao', null]) {
    assert.equal(parseDisponivel(nada), null, String(nada));
  }
});

test('aspas protegem separador, quebra de linha e aspas escapadas', () => {
  const csv = [
    CABECALHO,
    'Lanches;"X-Tudo; especial";"Pão, carne\nqueijo e ""molho da casa""";35,50;;sim;1',
  ].join('\n');
  const leitura = lerCsvCardapio(csv);
  assert.equal(leitura.ok, true, JSON.stringify(leitura.erros));
  assert.equal(leitura.produtos.length, 1);
  assert.equal(leitura.produtos[0].nome, 'X-Tudo; especial');
  assert.equal(leitura.produtos[0].descricao, 'Pão, carne\nqueijo e "molho da casa"');
  // A linha do registro seguinte continua correta mesmo com \n dentro das aspas.
  assert.equal(leitura.produtos[0].linha, 2);
});

test('aceita separador vírgula, BOM do Excel e apelidos de cabeçalho', () => {
  const comBom = '\uFEFF' + 'Categoria,Produto,Valor,Ativo,Detalhes\nBebidas,Suco,8.50,sim,Laranja';
  const leitura = lerCsvCardapio(comBom);
  assert.equal(leitura.ok, true, JSON.stringify(leitura.erros));
  assert.equal(leitura.produtos[0].nome, 'Suco');
  assert.equal(leitura.produtos[0].preco, 8.5);
  assert.equal(leitura.produtos[0].disponivel, true);
  assert.equal(leitura.produtos[0].descricao, 'Laranja');
  assert.match(leitura.avisos.join(' '), /Separador ","/);
});

test('colunas desconhecidas viram aviso e não impedem a importação', () => {
  const csv = [CABECALHO + ';calorias', 'Lanches;X-Salada;;19,90;;sim;1;420'].join('\n');
  const leitura = lerCsvCardapio(csv);
  assert.equal(leitura.ok, true);
  assert.match(leitura.avisos.join(' '), /calorias/);
});

test('sem a coluna ordem, a posição segue a ordem do arquivo dentro da categoria', () => {
  const csv = [
    'categoria;nome;preco;disponivel',
    'Bebidas;A;1,00;sim',
    'Bebidas;B;2,00;sim',
    'Lanches;C;3,00;sim',
    'Bebidas;D;4,00;sim',
  ].join('\n');
  const leitura = lerCsvCardapio(csv);
  assert.equal(leitura.ok, true, JSON.stringify(leitura.erros));
  const ordens = Object.fromEntries(leitura.produtos.map((p) => [p.nome, p.ordem]));
  assert.deepEqual(ordens, { A: 0, B: 1, C: 0, D: 2 });
});

test('erros apontam linha e coluna e bloqueiam a importação', () => {
  const csv = [
    CABECALHO,
    'Lanches;X-Burger;;25,90;;sim;1', // ok
    ';Sem categoria;;10,00;;sim;2', // categoria vazia
    'Lanches;;;10,00;;sim;3', // nome vazio
    'Lanches;Sem preço;;;', // preço e disponivel vazios
    'Lanches;Preço torto;;abc;;sim;4',
    'Lanches;Disponível torto;;10,00;;talvez;5',
    'Lanches;Imagem privada;;10,00;file:///tmp/foto.jpg;sim;6',
    'Lanches;Ordem torta;;10,00;;sim;primeira',
  ].join('\n');
  const leitura = lerCsvCardapio(csv);
  assert.equal(leitura.ok, false);
  assert.equal(leitura.produtos.length, 1, 'só a linha válida entra na prévia');

  const linhasComErro = new Set(leitura.erros.map((e) => e.linha));
  for (const linha of [3, 4, 5, 6, 7, 8, 9]) {
    assert.ok(linhasComErro.has(linha), `esperava erro na linha ${linha}`);
  }
  const colunas = new Set(leitura.erros.map((e) => e.coluna));
  for (const coluna of ['categoria', 'nome', 'preco', 'disponivel', 'imagem_url', 'ordem']) {
    assert.ok(colunas.has(coluna), `esperava erro apontando a coluna ${coluna}`);
  }
  assert.match(leitura.erros.map((e) => e.mensagem).join(' '), /http:\/\/ ou https:\/\//);
});

test('mensagens de arquivo inválido são as que o operador precisa ver', () => {
  assert.match(lerCsvCardapio('').erros[0].mensagem, /Envie um arquivo CSV/);
  assert.match(lerCsvCardapio('   ').erros[0].mensagem, /Envie um arquivo CSV/);
  assert.match(lerCsvCardapio('nome;preco\nX;1').erros[0].mensagem, /Cabeçalho incompleto/);
  assert.match(lerCsvCardapio(CABECALHO + '\n').erros[0].mensagem, /Nenhum produto/);

  // Arquivo salvo em Windows-1252: acentos chegam como U+FFFD.
  const cp1252 = Buffer.from([0x63, 0x61, 0x66, 0x82]).toString('utf8');
  assert.match(lerCsvCardapio(CABECALHO + '\nLanches;' + cp1252 + ';;1,00;;sim;1').erros[0].mensagem, /UTF-8/);
});

test('produto repetido na mesma categoria é recusado (evita duplicata silenciosa)', () => {
  const csv = [
    CABECALHO,
    'Lanches;X-Burger;;10,00;;sim;1',
    'Lanches;x-burger;;12,00;;sim;2',
    'Bebidas;X-Burger;;5,00;;sim;1',
  ].join('\n');
  const leitura = lerCsvCardapio(csv);
  assert.equal(leitura.ok, false);
  assert.equal(leitura.erros.length, 1);
  assert.match(leitura.erros[0].mensagem, /mais de uma vez/);
  assert.equal(leitura.produtos.length, 2);
});

test('limite de produtos protege o servidor de planilha gigante', () => {
  const linhas = [CABECALHO];
  for (let i = 0; i < 2001; i += 1) linhas.push(`Lanches;Produto ${i};;10,00;;sim;${i}`);
  const leitura = lerCsvCardapio(linhas.join('\n'));
  assert.equal(leitura.ok, false);
  assert.equal(leitura.produtos.length, 2000);
  assert.match(leitura.erros[0].mensagem, /Limite de 2000 produtos/);
});

/* -------------------------------------------------------------------------- */
/* Setor de produção                                                          */
/* -------------------------------------------------------------------------- */

test('setor da importação segue a mesma heurística do cadastro manual', () => {
  assert.equal(inferirSetor('Amstel 600ml', 'Cerveja 600ml'), 'bar');
  assert.equal(inferirSetor('Suco de laranja', 'Sobremesas'), 'bar');
  assert.equal(inferirSetor('Pudim', 'Bebidas'), 'bar');
  assert.equal(inferirSetor('X-Burger', 'Lanches'), 'cozinha');
  assert.equal(inferirSetor('Batata frita', 'Porções'), 'cozinha');
});

/* -------------------------------------------------------------------------- */
/* Gravação transacional                                                      */
/* -------------------------------------------------------------------------- */

test('modo substituir arquiva o cardápio atual e cadastra o novo na mesma transação', async () => {
  const estado = instalarPool({
    categorias: [
      { id: 1, nome: 'Lanches', ordem: 0 },
      { id: 2, nome: 'Bebidas', ordem: 1 },
    ],
    produtos: [
      { id: 11, categoria_id: 1, nome: 'Burger antigo' },
      { id: 12, categoria_id: 2, nome: 'Refri antigo' },
    ],
  });

  const resumo = await importarCardapio({ texto: modeloCsv, modo: 'substituir' });

  assert.equal(resumo.ok, true);
  assert.equal(resumo.modo, 'substituir');
  assert.equal(resumo.produtos, 5);
  assert.equal(resumo.produtosArquivados, 2);
  assert.equal(resumo.produtosInseridos, 5);
  assert.equal(resumo.produtosAtualizados, 0);
  assert.equal(resumo.categoriasCriadas, 1, 'só Sobremesas é nova');
  assert.equal(estado.commits, 1);
  assert.equal(estado.rollbacks, 0);
  assert.ok(estado.released >= 1, 'a conexão precisa voltar para o pool');

  // Começa arquivando (nunca DELETE em produtos: o histórico depende deles).
  assert.ok(estado.sqls.some((q) => q.startsWith('UPDATE produtos SET arquivado = TRUE')));
  assert.ok(!estado.sqls.some((q) => /^DELETE FROM produtos/i.test(q)));

  // Categorias reaproveitadas por nome; ordem de inserção preservada.
  assert.deepEqual(
    estado.inseridos.map((p) => p.categoriaId),
    [1, 1, 2, 2, 500]
  );
  assert.deepEqual(
    estado.inseridos.map((p) => p.preco),
    [25.9, 29.9, 6, 10, 9]
  );
  assert.deepEqual(
    estado.inseridos.map((p) => p.setor),
    ['cozinha', 'cozinha', 'bar', 'bar', 'cozinha']
  );
  assert.equal(estado.inseridos[0].foto, 'https://exemplo.com/x-burger.jpg');
  assert.equal(estado.inseridos[1].foto, null);
});

test('falha no meio da importação dá ROLLBACK e propaga o erro', async () => {
  const estado = instalarPool({ falharEm: 'INSERT INTO produtos' });
  await assert.rejects(() => importarCardapio({ texto: modeloCsv, modo: 'substituir' }), /falha simulada/);
  assert.equal(estado.commits, 0);
  assert.equal(estado.rollbacks, 1);
  assert.ok(estado.released >= 1);
});

test('arquivo com erro não abre transação: nada é gravado', async () => {
  const estado = instalarPool();
  await assert.rejects(
    () => importarCardapio({ texto: `${CABECALHO}\nLanches;;;abc;;sim;1`, modo: 'substituir' }),
    (e) => e instanceof ErroImportCardapio && e.status === 400
  );
  assert.deepEqual(estado.sqls, [], 'nenhuma query pode rodar com arquivo inválido');
});

test('modo atualizar mexe só nos produtos identificados por categoria + nome', async () => {
  const estado = instalarPool({
    categorias: [{ id: 7, nome: 'Lanches', ordem: 0 }],
    produtos: [{ id: 99, categoria_id: 7, nome: 'X-Burger' }],
  });
  const csv = [
    CABECALHO,
    'Lanches;X-Burger;Nova descrição;27,50;;sim;1',
    'Lanches;X-Novo;;15,00;;nao;2',
  ].join('\n');

  const resumo = await importarCardapio({ texto: csv, modo: 'atualizar' });

  assert.equal(resumo.modo, 'atualizar');
  assert.equal(resumo.produtosAtualizados, 1);
  assert.equal(resumo.produtosInseridos, 1);
  assert.equal(resumo.produtosArquivados, 0);
  assert.ok(!estado.sqls.some((q) => q.startsWith('UPDATE produtos SET arquivado = TRUE')));
  assert.deepEqual(estado.atualizados, [{ id: 99, nome: 'X-Burger', preco: 27.5, disponivel: true, ordem: 1 }]);
  assert.equal(estado.inseridos.length, 1);
  assert.equal(estado.inseridos[0].disponivel, false);
  assert.equal(estado.commits, 1);
});

test('modo inválido é recusado antes de tocar no banco', async () => {
  const estado = instalarPool();
  await assert.rejects(() => importarCardapio({ texto: modeloCsv, modo: 'apagar-tudo' }), /modo/);
  assert.deepEqual(estado.sqls, []);
});

/* -------------------------------------------------------------------------- */
/* Contrato de rotas, tela e documentação                                     */
/* -------------------------------------------------------------------------- */

test('servidor expõe prévia, importação confirmada e o modelo para download', () => {
  const server = fs.readFileSync('server.js', 'utf8');
  assert.match(server, /'\/api\/admin\/cardapio\/importar\/previa'/);
  assert.match(server, /'\/api\/admin\/cardapio\/importar'/);
  assert.match(server, /'\/api\/admin\/cardapio\/modelo\.csv'/);
  // Sem confirmação explícita, a rota não substitui nada.
  assert.match(server, /if \(b\.confirmar !== true\)/);
  // A importação invalida o cache e avisa as telas abertas.
  assert.match(server, /await importarCardapio\(\{[\s\S]{0,200}invalidarCardapio\(\)/);
  assert.match(server, /cardapio_importado/);
});

test('cardápio público e admin ignoram produtos arquivados', () => {
  assert.match(fs.readFileSync('db/cardapio.js', 'utf8'), /WHERE arquivado = FALSE/);
  assert.match(fs.readFileSync('db/admin.js', 'utf8'), /WHERE arquivado = FALSE/);
  const migracao = fs.readFileSync('db/migrations/0033_produtos_arquivados.sql', 'utf8');
  assert.match(migracao, /ADD COLUMN IF NOT EXISTS arquivado BOOLEAN NOT NULL DEFAULT FALSE/);
});

test('a tela do admin obriga prévia antes da importação e usa o confirmador global', () => {
  const admin = fs.readFileSync('src/screens/Admin.tsx', 'utf8');
  assert.match(admin, /Importar CSV/);
  assert.match(admin, /<ImportarCardapio/);

  const modal = fs.readFileSync('src/screens/admin/ImportarCardapio.tsx', 'utf8');
  assert.match(modal, /api\.previaImportCardapio\(/);
  assert.match(modal, /api\.importarCardapio\(/);
  assert.match(modal, /await confirmarAcao\(/);
  // O botão de importar só habilita com a prévia aprovada.
  assert.match(modal, /const podeImportar = Boolean\(previa\?\.ok/);
  assert.match(modal, /disabled=\{!podeImportar\}/);
  assert.match(modal, /\/api\/admin\/cardapio\/modelo\.csv/);
  // Duas etapas separadas: a prévia acontece no envio do arquivo.
  const posPrevia = modal.indexOf('api.previaImportCardapio(');
  const posImport = modal.indexOf('api.importarCardapio(');
  assert.ok(posPrevia > 0 && posImport > posPrevia);
});

test('formato do CSV está documentado para quem vai preencher a planilha', () => {
  const doc = fs.readFileSync('docs/IMPORTAR-CARDAPIO-CSV.md', 'utf8');
  for (const coluna of ['categoria', 'nome', 'descricao', 'preco', 'imagem_url', 'disponivel', 'ordem']) {
    assert.ok(doc.includes(coluna), `a doc precisa citar a coluna ${coluna}`);
  }
  assert.match(doc, /UTF-8/);
  assert.match(doc, /substituir/i);
  assert.match(doc, /transação|transacao/i);
});

test('estoque CSV distingue zero de vazio/ausente e aceita apenas inteiros não negativos', () => {
  const h = 'categoria;nome;preco;disponivel;estoque';
  for (const [raw, esperado] of [['0', 0], ['25', 25], ['', null]]) {
    const out = lerCsvCardapio(`${h}\nLanches;Teste;10;sim;${raw}`);
    assert.equal(out.ok, true);
    assert.equal(out.produtos[0].estoque, esperado);
  }
  const antigo = lerCsvCardapio('categoria;nome;preco;disponivel\nLanches;Teste;10;sim');
  assert.equal(antigo.produtos[0].estoque, null);
  for (const raw of ['-1', '1.5', '1,5', 'NaN', '2147483648']) {
    const out = lerCsvCardapio(`${h}\nLanches;Teste;10;sim;${raw}`);
    assert.equal(out.ok, false, raw);
    assert.equal(out.erros[0].coluna, 'estoque');
  }
});
