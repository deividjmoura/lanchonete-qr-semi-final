// Smoke de runtime da Fila de Produção (Cozinha e Bar), sem navegador:
// empacota o componente real com esbuild, renderiza no servidor com comandas
// de mentira e confere o HTML. Cobre crash de render, import quebrado e a
// ORDEM de leitura da fila — que é da esquerda para a direita, quebrando linha
// no fim (o DOM é a ordem visual porque a grade é row-major).
// Espelha scripts/ssr-smoke-panorama.mjs e scripts/ssr-smoke-mesas-abertas.mjs.
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';

const raiz = path.resolve(import.meta.dirname, '..');

// A preferência de sessões abertas vem de localStorage; sem ele o componente
// renderiza tudo recolhido e o smoke não veria os cartões. sessionStorage é
// lido pelo store de operação no import — fora do navegador basta o global.
const armazenamento = (valor) => ({ getItem: () => valor, setItem: () => {}, removeItem: () => {} });
globalThis.localStorage = {
  // Sessões abertas nos dois setores: sem isso o componente renderiza
  // recolhido e o smoke não vê os cartões.
  getItem: (chave) =>
    /:(cozinha|bar)$/.test(chave) ? '{"em_producao":true,"na_fila":true}' : null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.sessionStorage = armazenamento('{"role":"cozinha","nome":"Cozinha"}');

const agora = Date.now();
const min = (m) => agora - m * 60000;

const item = (id, nome, status, over = {}) => ({
  id: String(id),
  produtoId: id,
  nome,
  qtd: 1,
  precoBase: 24,
  adicionais: [],
  removidos: [],
  escolha: null,
  obs: '',
  totalUnit: 24,
  status,
  setor: 'cozinha',
  ...over,
});

// Três comandas em produção e duas na fila, criadas em sequência.
const pedido = (id, mesa, cliente, minutos, status) => ({
  id,
  sessaoId: 900 + id,
  mesaId: mesa,
  mesaNome: `Mesa ${mesa}`,
  clienteNome: cliente,
  garcomNome: 'Bruno Tavares',
  status: 'em_producao',
  criadoEm: min(minutos),
  total: 48,
  itens: [item(id * 10 + 1, `Item A ${id}`, status), item(id * 10 + 2, `Item B ${id}`, 'entregue')],
});

const pedidos = [
  pedido(1, 6, 'Família Andrade', 30, 'em_producao'),
  pedido(2, 7, 'Mesa do Vini', 20, 'em_producao'),
  pedido(3, 8, 'Ana e Bruna', 12, 'em_producao'),
  pedido(4, 9, 'Churrasco da 9', 6, 'recebido'),
  pedido(5, 10, 'Turma da 10', 2, 'recebido'),
];

// Comanda mista:burger e batata são da cozinha, chopp e caipirinha são do bar.
// Cada setor precisa ver SÓ os seus itens — nunca a comanda inteira.
const mista = {
  id: 90,
  sessaoId: 990,
  mesaId: 12,
  mesaNome: 'Mesa 12',
  clienteNome: 'Comanda mista',
  garcomNome: 'Bruno Tavares',
  status: 'em_producao',
  criadoEm: min(4),
  total: 100,
  itens: [
    item(901, 'Burger da casa', 'recebido', { setor: 'cozinha' }),
    item(902, 'Batata rústica', 'em_producao', { setor: 'cozinha' }),
    item(903, 'Chopp gelado', 'recebido', { setor: 'bar' }),
    item(904, 'Caipirinha de limão', 'recebido', { setor: 'bar' }),
  ],
};

const cache = path.join(raiz, 'node_modules', '.cache');
await mkdir(cache, { recursive: true });
const dir = await mkdtemp(path.join(cache, 'fila-ssr-'));
const entrada = path.join(dir, 'entrada.tsx');
await writeFile(
  entrada,
  `export { default as FilaProducao } from ${JSON.stringify(
    path.join(raiz, 'src/components/FilaProducao.tsx'),
  )};`,
);
const saida = path.join(dir, 'bundle.mjs');
await build({
  entryPoints: [entrada],
  outfile: saida,
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  logLevel: 'error',
  // React precisa ser o mesmo do runner, senão os hooks quebram na renderização.
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
});

const { FilaProducao } = await import(pathToFileURL(saida).href);

const render = (setor, lista) =>
  renderToString(
    React.createElement(FilaProducao, {
      setor,
      pedidos: lista,
      imprimir: () => {},
      IconeProducao: (props) => React.createElement('span', props),
      descricoes: { em_producao: 'Na chapa agora', na_fila: 'Aguardando a chapa' },
    }),
  );

const html = render('cozinha', pedidos);
const htmlCozinhaMista = render('cozinha', [mista]);
const htmlBarMista = render('bar', [mista]);

let falhas = 0;
const checar = (nome, ok, detalhe = '') => {
  if (ok) {
    console.log(`✓ ${nome}`);
    return;
  }
  falhas += 1;
  console.error(`✗ ${nome}${detalhe ? `: ${detalhe}` : ''}`);
};

// A grade é o único container da fila: sem trilho rolante e sem dica de arraste.
checar('grade em linha sem rolagem lateral', html.includes('class="fila-grade"') && html.includes('class="fila-grade__cartoes"'),
  'faltou .fila-grade/.fila-grade__cartoes');
checar('sem trilho nem dica de arraste', !html.includes('fila-trilho') && !html.includes('fila-rolagem') && !html.includes('fila-dica'));

// Ordem do DOM = ordem de leitura: comanda mais antiga primeiro, da esquerda
// para a direita na linha, descendo só quando a linha acaba.
const ordem = ['Em produção', 'Família Andrade', 'Mesa do Vini', 'Ana e Bruna', 'Na fila', 'Churrasco da 9', 'Turma da 10']
  .map((texto) => ({ texto, pos: html.indexOf(texto) }));
const foraDeOrdem = ordem.filter((o, i) => o.pos < 0 || (i > 0 && o.pos < ordem[i - 1].pos));
checar('comandas em ordem de leitura (antiga → nova)', foraDeOrdem.length === 0,
  foraDeOrdem.map((o) => o.texto).join(', '));

// Cada etapa só mostra os itens daquela etapa: “Item A 1” está em produção,
// “Item A 4” está na fila e nenhum “Item B” (entregue) aparece na tela.
checar(
  'cada etapa mostra só os seus itens',
  html.includes('Item A 1') && html.includes('Item A 4') && !html.includes('Item B 1'),
);
checar('ações por item e por comanda', html.includes('Liberar este item') && html.includes('Iniciar este item'));

// Separação por setor: a cozinha não vê drinks e o bar não vê comida.
checar(
  'cozinha mostra só os itens da cozinha',
  htmlCozinhaMista.includes('Burger da casa') &&
    htmlCozinhaMista.includes('Batata rústica') &&
    !htmlCozinhaMista.includes('Chopp gelado') &&
    !htmlCozinhaMista.includes('Caipirinha de limão'),
);
checar(
  'bar mostra só os itens do bar',
  htmlBarMista.includes('Chopp gelado') &&
    htmlBarMista.includes('Caipirinha de limão') &&
    !htmlBarMista.includes('Burger da casa') &&
    !htmlBarMista.includes('Batata rústica'),
);

if (falhas) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('SSR smoke da fila de produção OK');
process.exit(0);
