// Popula um cardápio de restaurante (entradas, pratos principais,
// sobremesas, bebidas) já com "setor" (cozinha/bar) definido.
// Idempotente: roda quantas vezes quiser — só insere categoria/produto
// que ainda não existe (verifica por nome).
//
// Fotos: reaproveita assets locais do projeto (/assets/demo/*.webp)
// onde já existe uma foto parecida. Pratos sem equivalente local ficam
// com foto_url = NULL (o app mostra "sem foto") — suba a foto de
// verdade pelo admin depois (ela já passa pelo otimizador da Parte 4).
// Ao lado de cada um desses, um comentário "📷 buscar" sugere o termo.
//
// Uso: node db/seed-restaurante.js
require('dotenv').config();
const pool = require('./pool');

const CATEGORIAS = [
  {
    nome: 'Entradas',
    ordem: 100,
    produtos: [
      {
        nome: 'Bruschetta de Tomate e Manjericão',
        descricao: 'Fatias de pão italiano tostado com tomate, manjericão fresco e azeite.',
        preco: 24.90,
        setor: 'cozinha',
        foto: null, // 📷 buscar: "bruschetta tomate manjericão"
      },
      {
        nome: 'Bolinho de Bacalhau (6 un.)',
        descricao: 'Bolinhos crocantes de bacalhau desfiado com batata e ervas.',
        preco: 32.90,
        setor: 'cozinha',
        foto: null, // 📷 buscar: "bolinho de bacalhau"
      },
      {
        nome: 'Carpaccio de Carne',
        descricao: 'Finas fatias de carne com alcaparras, lascas de parmesão e rúcula.',
        preco: 36.90,
        setor: 'cozinha',
        foto: null, // 📷 buscar: "carpaccio de carne"
      },
      {
        nome: 'Pão de Alho na Brasa',
        descricao: 'Pão artesanal grelhado com manteiga de alho e ervas finas.',
        preco: 18.90,
        setor: 'cozinha',
        foto: null, // 📷 buscar: "pão de alho grelhado"
      },
      {
        nome: 'Salada Caprese',
        descricao: 'Tomate, mussarela de búfala, manjericão e redução de balsâmico.',
        preco: 26.90,
        setor: 'cozinha',
        foto: '/assets/demo/salad.webp',
      },
    ],
  },
  {
    nome: 'Pratos Principais',
    ordem: 200,
    produtos: [
      {
        nome: 'Filé à Parmegiana',
        descricao: 'Filé empanado coberto com molho de tomate e queijo gratinado, acompanha arroz e fritas.',
        preco: 54.90,
        setor: 'cozinha',
        foto: null, // 📷 buscar: "filé à parmegiana"
      },
      {
        nome: 'Risoto de Camarão',
        descricao: 'Arroz arbóreo cremoso com camarões salteados e toque de limão siciliano.',
        preco: 58.90,
        setor: 'cozinha',
        foto: null, // 📷 buscar: "risoto de camarão"
      },
      {
        nome: 'Salmão Grelhado com Legumes',
        descricao: 'Salmão grelhado ao ponto com legumes salteados na manteiga.',
        preco: 62.90,
        setor: 'cozinha',
        foto: null, // 📷 buscar: "salmão grelhado com legumes"
      },
      {
        nome: 'Frango Grelhado com Arroz e Farofa',
        descricao: 'Peito de frango grelhado, arroz branco, farofa e vinagrete.',
        preco: 42.90,
        setor: 'cozinha',
        foto: '/assets/demo/chicken.webp',
      },
      {
        nome: 'Picanha na Brasa (300g)',
        descricao: 'Picanha grelhada no ponto, acompanha arroz, farofa e vinagrete.',
        preco: 68.90,
        setor: 'cozinha',
        foto: null, // 📷 buscar: "picanha grelhada"
      },
      {
        nome: 'Hambúrguer Artesanal da Casa',
        descricao: 'Blend da casa, queijo, bacon e molho especial no pão brioche.',
        preco: 39.90,
        setor: 'cozinha',
        foto: '/assets/demo/burger.webp',
      },
    ],
  },
  {
    nome: 'Sobremesas',
    ordem: 300,
    produtos: [
      {
        nome: 'Petit Gâteau com Sorvete',
        descricao: 'Bolo de chocolate com recheio cremoso e bola de sorvete de creme.',
        preco: 26.90,
        setor: 'cozinha',
        foto: '/assets/demo/petit.webp',
      },
      {
        nome: 'Brownie com Sorvete',
        descricao: 'Brownie de chocolate quente com bola de sorvete de creme.',
        preco: 22.90,
        setor: 'cozinha',
        foto: '/assets/demo/brownie.webp',
      },
      {
        nome: 'Churros com Doce de Leite',
        descricao: 'Churros crocantes recheados com doce de leite.',
        preco: 19.90,
        setor: 'cozinha',
        foto: '/assets/demo/churros.webp',
      },
      {
        nome: 'Tiramisù',
        descricao: 'Camadas de biscoito champanhe, café e creme de mascarpone.',
        preco: 24.90,
        setor: 'cozinha',
        foto: null, // 📷 buscar: "tiramisù"
      },
      {
        nome: 'Pudim de Leite Condensado',
        descricao: 'Pudim tradicional de leite condensado com calda de caramelo.',
        preco: 18.90,
        setor: 'cozinha',
        foto: null, // 📷 buscar: "pudim de leite condensado"
      },
    ],
  },
  {
    nome: 'Bebidas',
    ordem: 400,
    produtos: [
      { nome: 'Água Mineral', descricao: 'Com ou sem gás, 500ml.', preco: 6.00, setor: 'bar', foto: '/assets/demo/water.webp' },
      { nome: 'Refrigerante Lata', descricao: 'Coca-Cola, Guaraná, Fanta Laranja, Fanta Uva ou Sprite.', preco: 8.00, setor: 'bar', foto: '/assets/demo/soda-cola.webp' },
      { nome: 'Suco Natural', descricao: 'Laranja, limão, maracujá, abacaxi, morango ou acerola.', preco: 12.00, setor: 'bar', foto: '/assets/demo/natural.webp' },
      { nome: 'Caipirinha', descricao: 'Limão, morango, maracujá, kiwi ou abacaxi.', preco: 22.00, setor: 'bar', foto: '/assets/demo/caipi.webp' },
      { nome: 'Coquetel da Casa', descricao: 'Drink autoral do bar, consulte o garçom.', preco: 26.00, setor: 'bar', foto: '/assets/demo/cocktail.webp' },
      { nome: 'Cerveja Long Neck', descricao: 'Heineken, Budweiser, Stella Artois, Corona, Original ou Brahma.', preco: 15.00, setor: 'bar', foto: '/assets/demo/beer.webp' },
      { nome: 'Milk-shake', descricao: 'Chocolate, morango, baunilha ou Ovomaltine.', preco: 19.90, setor: 'bar', foto: '/assets/demo/milkshake.webp' },
    ],
  },
];

async function garantirCategoria(client, cat) {
  const { rows } = await client.query('SELECT id FROM categorias WHERE nome = $1', [cat.nome]);
  if (rows.length) return rows[0].id;
  const ins = await client.query(
    'INSERT INTO categorias (nome, ordem) VALUES ($1, $2) RETURNING id',
    [cat.nome, cat.ordem]
  );
  console.log(`📁 Categoria "${cat.nome}" criada.`);
  return ins.rows[0].id;
}

async function garantirProduto(client, categoriaId, p, ordem) {
  const { rows } = await client.query(
    'SELECT id FROM produtos WHERE categoria_id = $1 AND nome = $2',
    [categoriaId, p.nome]
  );
  if (rows.length) {
    console.log(`  · "${p.nome}" já existe, pulei.`);
    return;
  }
  await client.query(
    `INSERT INTO produtos (categoria_id, nome, descricao, preco, foto_url, disponivel, setor, ordem)
     VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)`,
    [categoriaId, p.nome, p.descricao, p.preco, p.foto, p.setor, ordem]
  );
  console.log(`  ✅ "${p.nome}" (${p.setor})${p.foto ? '' : '  ⚠️  sem foto — suba pelo admin'}`);
}

async function run() {
  const client = await pool.connect();
  try {
    for (const cat of CATEGORIAS) {
      const categoriaId = await garantirCategoria(client, cat);
      let ordem = 0;
      for (const p of cat.produtos) {
        await garantirProduto(client, categoriaId, p, ordem++);
      }
    }
    console.log('\n✅ Seed de restaurante concluído.');
    console.log('   Itens marcados com ⚠️  ainda não têm foto — suba pelo admin quando puder.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('❌ Falha no seed:', err);
  process.exit(1);
});
