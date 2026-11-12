// Smoke de runtime do modal “Mesas abertas” do dashboard, sem navegador:
// empacota os componentes reais com esbuild, renderiza no servidor com um
// payload de mesas ocupadas e confere o HTML. Cobre crash de render, import
// quebrado e texto sumido numa tela que o CI não abre em Chromium.
// Espelha scripts/ssr-smoke-panorama.mjs, agora para o painel.
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';

const raiz = path.resolve(import.meta.dirname, '..');

// O cliente HTTP abre um BroadcastChannel no import; no Node basta o global.
const agora = Date.now();
const iso = (minutos) => new Date(agora - minutos * 60000).toISOString();

const mesa = (over = {}) => ({
  id: 7,
  numero: 7,
  token: 'tk-7',
  status: 'ocupada',
  pracaId: 1,
  pracaNome: 'Praia',
  pracaOrdem: 1,
  sessaoId: 907,
  abertaEm: iso(96),
  tempo: null,
  clienteNome: 'Família Andrade',
  garcomResponsavelId: 2,
  garcomResponsavelNome: 'Bruno Tavares',
  consumo: 111.4,
  pago: 30,
  saldo: 81.4,
  pedidosAtivos: 2,
  pedidosRecebidos: 1,
  pedidosPreparo: 1,
  pedidosProntos: 1,
  itensNaFila: 3,
  itensProntosRetirada: 1,
  ...over,
});

const critica = { id: 'critica', minutos: 96, atencaoMinutos: 45, criticoMinutos: 90 };
const atencao = { id: 'atencao', minutos: 50, atencaoMinutos: 45, criticoMinutos: 90 };
const recente = { id: 'recente', minutos: 8, atencaoMinutos: 45, criticoMinutos: 90 };

const cache = path.join(raiz, 'node_modules', '.cache');
await mkdir(cache, { recursive: true });
const dir = await mkdtemp(path.join(cache, 'mesas-abertas-ssr-'));
const entrada = path.join(dir, 'entrada.tsx');
await writeFile(
  entrada,
  `export { MesasAbertasModal, CartaoMesaAberta } from ${JSON.stringify(
    path.join(raiz, 'src/screens/dashboard/MesasAbertasModal.tsx'),
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

const { MesasAbertasModal, CartaoMesaAberta } = await import(pathToFileURL(saida).href);

const html = {
  modal: renderToString(React.createElement(MesasAbertasModal, { open: true, onClose: () => {} })),
  critica: renderToString(React.createElement(CartaoMesaAberta, { mesa: mesa(), tempo: critica })),
  recente: renderToString(
    React.createElement(CartaoMesaAberta, {
      mesa: mesa({ numero: 13, clienteNome: null, garcomResponsavelNome: null, pago: 0, itensNaFila: 0 }),
      tempo: recente,
      agora,
    }),
  ),
  aguardando: renderToString(
    React.createElement(CartaoMesaAberta, {
      mesa: mesa({
        numero: 4,
        abertaEm: iso(120),
        primeiroPedidoEm: null,
        ultimoPedidoEm: null,
        aguardandoPedido: true,
        pedidosAtivos: 0,
        itensNaFila: 0,
      }),
      tempo: null,
      agora,
    }),
  ),
  doisRelogios: renderToString(
    React.createElement(CartaoMesaAberta, {
      mesa: mesa({
        numero: 8,
        abertaEm: iso(120),
        primeiroPedidoEm: iso(50),
        ultimoPedidoEm: iso(5),
        aguardandoPedido: false,
      }),
      tempo: atencao,
      agora,
    }),
  ),
};

let falhas = 0;
const checar = (nome, conteudo, esperados) => {
  const faltando = esperados.filter((texto) => !conteudo.includes(texto));
  if (faltando.length) {
    falhas += 1;
    console.error(`✗ ${nome}: faltando ${JSON.stringify(faltando)}`);
    return;
  }
  console.log(`✓ ${nome}: ${conteudo.length} bytes de HTML`);
};

// O diálogo cobre o painel e repete a linguagem do dashboard.
checar('Modal', html.modal, [
  'dash-dialog dash-dialog--full',
  'dash-mesas',
  'Mesas ocupadas',
  'Consumo em aberto',
  'Pedidos ativos',
  'Carregando as mesas abertas',
]);
// Cada mesa aberta responde quem pediu e quem está atendendo.
checar('Cartão em situação crítica', html.critica, [
  'dash-mesa dash-mesa--critica',
  '07',
  'Praia',
  'Quem pediu',
  'Família Andrade',
  'Quem está levando',
  'Bruno Tavares',
  '1h36',
  'Crítica',
  'Ver detalhes',
  '81,40',
  '3 na fila',
]);
// Sem cliente/garçom o cartão diz o que falta, sem deixar o dado em branco.
checar('Cartão recente sem responsável', html.recente, [
  'dash-mesa dash-mesa--recente',
  '13',
  'Cliente não identificado',
  'Garçom a definir',
  '8 min',
  'Recente',
]);
checar('Cartão aguardando pedido (#303)', html.aguardando, [
  'dash-mesa dash-mesa--aguardando',
  'Aguardando pedido',
  'há 2h',
  'Último pedido',
]);
if (html.aguardando.includes('Crítica') || html.aguardando.includes('Atenção')) {
  falhas += 1;
  console.error('✗ Cartão aguardando pedido não deve exibir faixa de atenção/crítica');
}
checar('Cartão com dois relógios separados (#303)', html.doisRelogios, [
  'dash-mesa dash-mesa--atencao',
  '50 min',
  'Atenção',
  'há 2h',
  'Último pedido',
  'há 5 min',
]);

if (falhas) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('SSR smoke das mesas abertas OK');
process.exit(0);
