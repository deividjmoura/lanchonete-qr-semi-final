import type { Mesa, PixConfig, Produto } from "./types";

const px = (id: number, w = 900) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

export const CATEGORIAS_SEED: { id: number; nome: string; ordem: number }[] = [
  { id: 1, nome: "Lanches", ordem: 0 },
  { id: 2, nome: "Porções", ordem: 1 },
  { id: 3, nome: "Bebidas", ordem: 2 },
  { id: 4, nome: "Sobremesas", ordem: 3 },
];

/** nomes na ordem atual (compat com selects legados) */
export const CATEGORIAS = CATEGORIAS_SEED.map((c) => c.nome);

export const PRODUTOS_SEED: Produto[] = [
  {
    id: 1,
    nome: "Major Smash duplo",
    descricao: "2 smash 90g, cheddar cremoso, cebola caramelizada e maionese da casa no brioche.",
    preco: 32,
    categoria: "Lanches",
    foto: px(109400),
    tipo: "personalizavel",
    adicionais: [
      { id: "a1", nome: "Bacon crocante", preco: 5 },
      { id: "a2", nome: "Cheddar extra", preco: 4 },
      { id: "a3", nome: "Hambúrguer 90g", preco: 8 },
      { id: "a4", nome: "Jalapeño", preco: 3 },
    ],
    removiveis: [
      { id: "r1", nome: "Cebola" },
      { id: "r2", nome: "Maionese" },
    ],
    ativo: true,
    estoque: 25,
    vendidos: 63,
  },
  {
    id: 2,
    nome: "Clássico da casa",
    descricao: "Blend 160g, queijo prato, alface, tomate e molho especial. O favorito das mesas.",
    preco: 27,
    categoria: "Lanches",
    foto: px(11022623),
    tipo: "personalizavel",
    adicionais: [
      { id: "a5", nome: "Bacon crocante", preco: 5 },
      { id: "a6", nome: "Ovo caipira", preco: 3 },
      { id: "a7", nome: "Queijo prato extra", preco: 3.5 },
    ],
    removiveis: [
      { id: "r3", nome: "Alface" },
      { id: "r4", nome: "Tomate" },
      { id: "r5", nome: "Molho" },
    ],
    ativo: true,
    estoque: 40,
    vendidos: 118,
  },
  {
    id: 3,
    nome: "Torch burguer",
    descricao: "Blend 180g, queijo coalho tostado, bacon na chapa e geleia de pimenta agridoce.",
    preco: 36,
    categoria: "Lanches",
    foto: px(18987002),
    tipo: "personalizavel",
    adicionais: [
      { id: "a8", nome: "Bacon crocante", preco: 5 },
      { id: "a9", nome: "Queijo coalho extra", preco: 6 },
    ],
    removiveis: [{ id: "r6", nome: "Geleia de pimenta" }],
    ativo: true,
    estoque: 18,
    vendidos: 47,
  },
  {
    id: 4,
    nome: "Dog prensado",
    descricao: "Pão de hot dog prensado, salsicha artesanal, queijo, batata palha e milho.",
    preco: 12,
    categoria: "Lanches",
    foto: px(1600712),
    tipo: "personalizavel",
    adicionais: [
      { id: "a10", nome: "Salsicha extra", preco: 4 },
      { id: "a11", nome: "Purê de batata", preco: 3 },
      { id: "a12", nome: "Bacon crocante", preco: 5 },
    ],
    removiveis: [
      { id: "r7", nome: "Milho" },
      { id: "r8", nome: "Batata palha" },
    ],
    ativo: true,
    estoque: 30,
    vendidos: 96,
  },
  {
    id: 5,
    nome: "Batata rústica da casa",
    descricao: "Porção generosa com alecrim, páprica defumada e aioli de alho assado.",
    preco: 22,
    categoria: "Porções",
    foto: px(263049),
    tipo: "personalizavel",
    adicionais: [
      { id: "a13", nome: "Cheddar em creme", preco: 6 },
      { id: "a14", nome: "Bacon em cubos", preco: 6 },
    ],
    removiveis: [{ id: "r9", nome: "Alecrim" }],
    ativo: true,
    estoque: 22,
    vendidos: 88,
  },
  {
    id: 6,
    nome: "Combo de petiscos",
    descricao: "Iscas de frango, onion rings e mini batata, com 3 molhos da casa.",
    preco: 44,
    categoria: "Porções",
    foto: px(6941027),
    tipo: "simples",
    adicionais: [],
    removiveis: [],
    ativo: true,
    estoque: 14,
    vendidos: 52,
  },
  {
    id: 7,
    nome: "Tábua do chef",
    descricao: "Seleção de salames, queijos, torradas e pasta de alho — perfeita para dividir.",
    preco: 58,
    categoria: "Porções",
    foto: px(602200),
    tipo: "simples",
    adicionais: [],
    removiveis: [],
    ativo: true,
    estoque: null,
    vendidos: 21,
  },
  {
    id: 8,
    nome: "Chopp da casa",
    descricao: "Chopp pilsen gelado, colarinho cremoso, tirado na hora.",
    preco: 9,
    categoria: "Bebidas",
    foto: px(5538223),
    tipo: "escolher",
    adicionais: [
      { id: "a15", nome: "Caneca 300ml", preco: 0 },
      { id: "a16", nome: "Caneca 500ml", preco: 4 },
      { id: "a17", nome: "Torre 1L", preco: 18 },
    ],
    removiveis: [],
    ativo: true,
    estoque: null,
    vendidos: 230,
  },
  {
    id: 9,
    nome: "Refrigerante",
    descricao: "Lata gelada, escolha o sabor e o formato.",
    preco: 6,
    categoria: "Bebidas",
    foto: px(8880742),
    tipo: "escolher",
    adicionais: [
      { id: "a18", nome: "Lata 350ml", preco: 0 },
      { id: "a19", nome: "600ml", preco: 3 },
      { id: "a20", nome: "2 litros", preco: 9 },
    ],
    removiveis: [],
    ativo: true,
    estoque: 55,
    vendidos: 310,
  },
  {
    id: 10,
    nome: "Suco natural",
    descricao: "Laranja, maracujá ou limão — feitos na hora, sem água.",
    preco: 10,
    categoria: "Bebidas",
    foto: px(20177323),
    tipo: "escolher",
    adicionais: [
      { id: "a21", nome: "Copo 300ml", preco: 0 },
      { id: "a22", nome: "Jarra 1L", preco: 12 },
    ],
    removiveis: [],
    ativo: true,
    estoque: null,
    vendidos: 74,
  },
  {
    id: 11,
    nome: "Brownie vulcão",
    descricao: "Brownie quente com calda de chocolate a escorrer e toque de flor de sal.",
    preco: 18,
    categoria: "Sobremesas",
    foto: px(28159490),
    tipo: "personalizavel",
    adicionais: [
      { id: "a23", nome: "Bola de sorvete", preco: 7 },
      { id: "a24", nome: "Chantilly", preco: 3 },
    ],
    removiveis: [],
    ativo: true,
    estoque: 9,
    vendidos: 41,
  },
  {
    id: 12,
    nome: "Brownie com morangos",
    descricao: "Brownie amanteigado, morangos frescos e fio de calda belga.",
    preco: 20,
    categoria: "Sobremesas",
    foto: px(5639261),
    tipo: "simples",
    adicionais: [],
    removiveis: [],
    ativo: true,
    estoque: 6,
    vendidos: 18,
  },
];

export const MESAS_SEED: Mesa[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  numero: i + 1,
  token: `mesa-${String(i + 1).padStart(2, "0")}-x7${(i + 3) * 11}`,
  nome: `Mesa ${String(i + 1).padStart(2, "0")}`,
}));

export const GARCOM_TOKEN = "garcom-deivid-9k2";
export const GARCOM_NOME = "Deivid";

export const STAFF: Record<string, { senha: string; role: "admin" | "cozinha" | "caixa"; nome: string }> = {
  admin: { senha: "pub123", role: "admin", nome: "Administrador" },
  cozinha: { senha: "pub123", role: "cozinha", nome: "Cozinha" },
  caixa: { senha: "pub123", role: "caixa", nome: "Caixa" },
};

// Dados fictícios — mesmo padrão do .env.example do projeto
export const PIX_CONFIG: PixConfig = {
  chave: "00000000000",
  nome: "MAJOR PUB LTDA",
  cidade: "SAO PAULO",
};

export const HERO_IMG =
  "https://images.pexels.com/photos/15789101/pexels-photo-15789101.jpeg?auto=compress&cs=tinysrgb&w=1920";

export const FRASES_GARCOM = [
  (m: string) => `Mesa ${m}! O cheiro bom já chegou, vem buscar!`,
  (m: string) => `Atenção, mesa ${m}! Lanche pronto e voando!`,
  (m: string) => `Mesa ${m} na área! Quentinho, direto da chapa!`,
  (m: string) => `Opa, mesa ${m}! Pedido pronto, corre que esfria!`,
];
