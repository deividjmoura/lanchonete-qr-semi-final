/* Capturas reais do QR Admin, geradas pelo script oficial do repositório
   (scripts/capturar-apresentacao.mjs) em ambiente isolado, com dados fictícios.
   Substituem os estudos visuais conceituais da apresentação aprovada sem
   alterar o enquadramento, as proporções ou a moldura criadas no CSS. */

const CAPTURAS = {
  dashboard: {
    src: "/assets/apresentacao/dashboard-admin.webp",
    alt: "Dashboard real do QR Admin: indicadores de faturamento, pedidos, ticket médio e contas fechadas do período, com dados fictícios de demonstração.",
    width: 1440,
    height: 900,
  },
  cardapio: {
    src: "/assets/apresentacao/cardapio-cliente.webp",
    alt: "Cardápio digital real do QR Admin aberto no navegador: categorias, busca e itens da mesa 18, com dados fictícios de demonstração.",
    width: 1440,
    height: 900,
  },
} as const;

export type CapturaChave = keyof typeof CAPTURAS;

export function CapturaProduto({
  chave,
  className = "",
  carregamento = "lazy",
}: {
  chave: CapturaChave;
  className?: string;
  carregamento?: "lazy" | "eager";
}) {
  const captura = CAPTURAS[chave];
  return (
    <img
      className={className}
      src={captura.src}
      alt={captura.alt}
      width={captura.width}
      height={captura.height}
      loading={carregamento}
      decoding="async"
      draggable={false}
    />
  );
}
