/* Capturas reais do QR Admin, geradas pelo script oficial do repositório
   (scripts/capturar-apresentacao.mjs) em ambiente isolado, com dados
   fictícios. A moldura é desenhada no CSS da página, nunca na imagem. */

const CAPTURAS = {
  "cardapio-cliente": {
    alt: "Cardápio digital do QR Admin aberto no navegador do cliente: categorias, busca e itens da mesa, com dados fictícios de demonstração.",
    width: 1440,
    height: 900,
  },
  "personalizacao-produto": {
    alt: "Tela de personalização de um item no cardápio do cliente: adicionais, ingredientes e observação do pedido, com dados fictícios.",
    width: 1440,
    height: 900,
  },
  "comanda-cliente": {
    alt: "Comanda acompanhada pelo cliente no cardápio digital: itens pedidos e situação de cada um, com dados fictícios.",
    width: 1440,
    height: 900,
  },
  "fila-cozinha": {
    alt: "Fila da cozinha no QR Admin: pedidos em produção e na fila, com mesa, itens e tempo de espera, em dados fictícios.",
    width: 1440,
    height: 900,
  },
  "fila-bar": {
    alt: "Fila do bar no QR Admin: bebidas em produção e aguardando, separadas por mesa, em dados fictícios.",
    width: 1440,
    height: 900,
  },
  "entregas-garcom": {
    alt: "Aplicativo do garçom no celular: itens prontos para retirar no balcão e levar à mesa, com dados fictícios.",
    width: 390,
    height: 844,
  },
  "fechamento-caixa": {
    alt: "Fechamento de contas no caixa do QR Admin: comandas abertas, divisão da conta e formas de pagamento, com dados fictícios.",
    width: 1440,
    height: 900,
  },
  "dashboard-admin": {
    alt: "Painel administrativo do QR Admin: faturamento, pedidos, ticket médio e contas fechadas do período, com dados fictícios.",
    width: 1440,
    height: 900,
  },
  "gestao-cardapio": {
    alt: "Gestão de cardápio e estoque no QR Admin: produtos, categorias, preços e disponibilidade, com dados fictícios.",
    width: 1440,
    height: 900,
  },
  "mapa-mesas": {
    alt: "Panorama das mesas no QR Admin: mesas livres e ocupadas por praça, com tempo de permanência, em dados fictícios.",
    width: 1440,
    height: 900,
  },
} as const;

export type CapturaChave = keyof typeof CAPTURAS;

export function Captura({
  chave,
  className,
  carregamento = "lazy",
  oculta = false,
}: {
  chave: CapturaChave;
  className?: string;
  carregamento?: "lazy" | "eager";
  /** Cena fora de vista no palco: sai da árvore de acessibilidade. */
  oculta?: boolean;
}) {
  const captura = CAPTURAS[chave];
  return (
    <img
      className={className}
      src={`/assets/apresentacao/${chave}.webp`}
      alt={oculta ? "" : captura.alt}
      aria-hidden={oculta ? true : undefined}
      width={captura.width}
      height={captura.height}
      loading={carregamento}
      decoding="async"
      draggable={false}
      data-formato={captura.height > captura.width ? "celular" : "tela"}
    />
  );
}
