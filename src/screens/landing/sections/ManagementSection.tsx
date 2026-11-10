import { ScrollStory, type ScrollScene } from "../components/ScrollStory";

const scenes: ScrollScene[] = [
  {
    number: "01",
    label: "GESTÃO · INDICADORES",
    title: "A rotina vira informação.",
    description: "O dashboard reúne faturamento, pedidos, ticket médio e contas fechadas no período selecionado.",
    image: "/assets/apresentacao/dashboard-admin.webp",
    alt: "Captura real do dashboard administrativo do QR Admin.",
  },
  {
    number: "02",
    label: "GESTÃO · CARDÁPIO E ESTOQUE",
    title: "Produtos e disponibilidade sob controle.",
    description: "A administração organiza categorias, preços, produtos e controle de estoque em uma mesma área.",
    image: "/assets/apresentacao/gestao-cardapio.webp",
    alt: "Captura real da tela de gestão de cardápio e estoque do QR Admin.",
  },
  {
    number: "03",
    label: "GESTÃO · MAPA DE MESAS",
    title: "A ocupação fica visível.",
    description: "O mapa permite localizar mesas livres e ocupadas e acompanhar as sessões em andamento.",
    image: "/assets/apresentacao/mapa-mesas.webp",
    alt: "Captura real do mapa de mesas do QR Admin.",
  },
];

export function ManagementSection() {
  return (
    <ScrollStory
      id="gestao-em-detalhe"
      eyebrow="DEPOIS DO FECHAMENTO, A VISÃO GERAL"
      title="A operação deixa rastros que ajudam a decidir."
      description="Relatórios, cardápio, estoque e ocupação ficam acessíveis à administração, sem transformar indicadores em promessas de resultado."
      stamp="01—03 / VISÃO DA GESTÃO"
      scenes={scenes}
      variant="management"
    />
  );
}
