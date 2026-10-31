// Smoke de runtime do panorama sem navegador: empacota os componentes reais com
// esbuild, renderiza no servidor com um payload de 70 mesas e confere o HTML.
// Não substitui o teste visual, mas pega crash de render, import quebrado e
// texto sumido em telas que o CI não abre em Chromium.
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';

const raiz = path.resolve(import.meta.dirname, '..');

// O store lê sessionStorage no import; no Node basta um armazenamento em memória.
const mem = new Map();
const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
globalThis.sessionStorage = globalThis.sessionStorage || storage;
globalThis.localStorage = globalThis.localStorage || storage;

const agora = Date.now();
const iso = (min) => new Date(agora - min * 60000).toISOString();
const pracas = [
  { id: 1, nome: 'Praia', ordem: 1, mesas: 24 },
  { id: 2, nome: 'Guarda-sol', ordem: 2, mesas: 18 },
  { id: 3, nome: 'Salão', ordem: 3, mesas: 16 },
];
const mesas = Array.from({ length: 70 }, (_, i) => {
  const numero = i + 1;
  const ocupada = numero % 5 !== 0;
  const minutos = numero * 3;
  const tempo = ocupada
    ? {
        id: minutos < 45 ? 'recente' : minutos < 90 ? 'atencao' : 'critica',
        minutos,
        atencaoMinutos: 45,
        criticoMinutos: 90,
      }
    : null;
  return {
    id: numero,
    numero,
    token: `token-${numero}`,
    status: ocupada ? 'ocupada' : 'livre',
    pracaId: pracas[i % 3].id,
    pracaNome: pracas[i % 3].nome,
    pracaOrdem: pracas[i % 3].ordem,
    sessaoId: ocupada ? 1000 + numero : null,
    abertaEm: ocupada ? iso(minutos) : null,
    tempo,
    clienteNome: ocupada ? `Cliente ${numero}` : null,
    garcomResponsavelId: ocupada ? (numero % 3) + 1 : null,
    garcomResponsavelNome: ocupada ? 'Ana' : null,
    consumo: ocupada ? 40 + numero : 0,
    pago: ocupada ? 10 : 0,
    saldo: ocupada ? 30 + numero : 0,
    pedidosAtivos: ocupada ? numero % 3 : 0,
    pedidosRecebidos: ocupada ? 1 : 0,
    pedidosPreparo: ocupada ? numero % 2 : 0,
    pedidosProntos: ocupada ? numero % 2 : 0,
    itensNaFila: ocupada ? 2 : 0,
    itensProntosRetirada: ocupada ? 1 : 0,
  };
});
const etapa = (minutos, amostras = 8) => ({
  aplicavel: true,
  minutos,
  amostras,
  disponivel: minutos != null,
  aproximado: minutos != null && amostras < 5,
});
const fluxo = {
  janela: { horas: 24, desde: iso(24 * 60), ate: new Date(agora).toISOString() },
  amostraMinima: 5,
  limiteEtapaHoras: 12,
  etapas: [
    { id: 'recebimento_inicio', rotulo: 'Recebimento → início do preparo', descricao: 'x', setores: ['cozinha', 'bar'] },
    { id: 'inicio_pronto', rotulo: 'Início → pronto', descricao: 'x', setores: ['cozinha', 'bar'] },
    { id: 'pronto_retirada', rotulo: 'Pronto → retirada', descricao: 'x', setores: ['cozinha', 'bar', 'garcom'] },
    { id: 'retirada_entrega', rotulo: 'Retirada → entrega', descricao: 'x', setores: ['cozinha', 'bar', 'garcom'] },
  ],
  setores: {
    cozinha: {
      id: 'cozinha',
      rotulo: 'Cozinha',
      etapas: {
        recebimento_inicio: etapa(2.4),
        inicio_pronto: etapa(8.1, 12),
        pronto_retirada: etapa(3, 3),
        retirada_entrega: etapa(null, 0),
      },
    },
    bar: {
      id: 'bar',
      rotulo: 'Bar',
      etapas: {
        recebimento_inicio: etapa(1.2),
        inicio_pronto: etapa(2.9),
        pronto_retirada: etapa(1.5),
        retirada_entrega: etapa(4.4),
      },
    },
    garcom: {
      id: 'garcom',
      rotulo: 'Garçom',
      etapas: {
        recebimento_inicio: { ...etapa(null, 0), aplicavel: false },
        inicio_pronto: { ...etapa(null, 0), aplicavel: false },
        pronto_retirada: etapa(6.2),
        retirada_entrega: etapa(2.8),
      },
    },
  },
};
const dados = {
  config: { quantidade: 70, limite: 70, faixas: { atencaoMinutos: 45, criticoMinutos: 90 } },
  pracas,
  mesas,
  vendas: {
    periodo: 'hoje',
    timezone: 'America/Sao_Paulo',
    desde: '2026-10-31',
    ate: '2026-10-31',
    porMesa: mesas.filter((m) => m.numero % 7 === 0).map((m) => ({ numero: m.numero, contas: 2, total: 120 })),
  },
  fluxo,
  atualizadoEm: new Date(agora).toISOString(),
};

// O bundle fica dentro do projeto para que os imports externalizados de React
// resolvam no node_modules do repositório.
const cache = path.join(raiz, 'node_modules', '.cache');
await mkdir(cache, { recursive: true });
const dir = await mkdtemp(path.join(cache, 'panorama-ssr-'));
const entrada = path.join(dir, 'entrada.tsx');
await writeFile(
  entrada,
  [
    `export { PanoramaMesas } from ${JSON.stringify(path.join(raiz, 'src/screens/admin/PanoramaMesas.tsx'))};`,
    `export { MapaQrMesas } from ${JSON.stringify(path.join(raiz, 'src/screens/admin/MapaQrMesas.tsx'))};`,
    `export { MesaDetalheModal } from ${JSON.stringify(path.join(raiz, 'src/screens/admin/MesaDetalheModal.tsx'))};`,
    `export { GerenciarPracas } from ${JSON.stringify(path.join(raiz, 'src/screens/admin/GerenciarPracas.tsx'))};`,
  ].join('\n'),
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

const { PanoramaMesas, MapaQrMesas, MesaDetalheModal, GerenciarPracas } = await import(pathToFileURL(saida).href);

const html = {
  panorama: renderToString(
    React.createElement(PanoramaMesas, {
      dados,
      filtro: 'todas',
      onFiltro: () => {},
      periodo: 'hoje',
      onPeriodo: () => {},
      onAbrirMesa: () => {},
      agora,
    }),
  ),
  mapa: renderToString(
    React.createElement(MapaQrMesas, {
      dados,
      agora,
      onAbrirMesa: () => {},
      onAtualizado: () => {},
      onErro: () => {},
    }),
  ),
  modalFechado: renderToString(
    React.createElement(MesaDetalheModal, {
      numero: null,
      pracas,
      garcons: [{ id: 1, nome: 'Ana' }],
      agora,
      onClose: () => {},
      onAlterado: () => {},
      onErro: () => {},
    }),
  ),
  pracasFechado: renderToString(
    React.createElement(GerenciarPracas, {
      aberto: false,
      pracas,
      onClose: () => {},
      onAtualizado: () => {},
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
checar('Panorama', html.panorama, [
  'Panorama de mesas',
  'Consumo em aberto',
  'Vendas hoje',
  'Tempos do fluxo',
  'Mesa 70',
  'Indisponível',
  'aprox.',
  'Sem praça',
  'data-glass-card',
]);
checar('Mapa/QR', html.mapa, ['Mapa de mesas e QR Codes', 'Nº da mesa', 'Copiar link da mesa 1']);

// Modais fechados não podem renderizar nada (AnimatePresence).
for (const [nome, conteudo] of [
  ['Modal da mesa fechado', html.modalFechado],
  ['Gerenciar praças fechado', html.pracasFechado],
]) {
  if (conteudo.length !== 0) {
    falhas += 1;
    console.error(`✗ ${nome}: esperado vazio, veio ${conteudo.length} bytes`);
  } else {
    console.log(`✓ ${nome}: vazio`);
  }
}

if (!falhas) console.log('SSR smoke OK');
// O processo do esbuild mantém o event loop vivo; encerrar aqui é intencional.
process.exit(falhas ? 1 : 0);
