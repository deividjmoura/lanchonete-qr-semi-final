import { ScrollStory, type ScrollScene } from "../components/ScrollStory";

const scenes: ScrollScene[] = [
  {
    number: "01",
    label: "NA MESA · QR CODE",
    title: "O cliente abre o cardápio.",
    description: "O QR fixo identifica a mesa e abre o cardápio no navegador, sem instalar aplicativo.",
    image: "/assets/apresentacao/cardapio-cliente.webp",
    alt: "Captura real do cardápio do QR Admin aberto na mesa 18, com categorias, produtos e preços.",
  },
  {
    number: "02",
    label: "NA MESA · PERSONALIZAÇÃO",
    title: "O pedido ganha os detalhes.",
    description: "Adicionais, remoções e observações seguem vinculados ao item que o cliente escolheu.",
    image: "/assets/apresentacao/personalizacao-produto.webp",
    alt: "Captura real da personalização de um produto no cardápio do QR Admin.",
  },
  {
    number: "03",
    label: "NA MESA · COMANDA",
    title: "A comanda é confirmada.",
    description: "O pedido enviado aparece na comanda da mesa e mantém o vínculo com a sessão.",
    image: "/assets/apresentacao/comanda-cliente.webp",
    alt: "Captura real da comanda do cliente com o pedido enviado e seu total.",
  },
  {
    number: "04",
    label: "NA PRODUÇÃO · COZINHA",
    title: "A cozinha recebe seus itens.",
    description: "Os itens destinados à cozinha entram na fila com mesa, horário e estado de preparo.",
    image: "/assets/apresentacao/fila-cozinha.webp",
    alt: "Captura real da fila de produção da cozinha do QR Admin.",
  },
  {
    number: "05",
    label: "NA PRODUÇÃO · BAR",
    title: "O bar trabalha em paralelo.",
    description: "Bebidas seguem para a fila do bar, sem misturar a preparação com os itens da cozinha.",
    image: "/assets/apresentacao/fila-bar.webp",
    alt: "Captura real da fila de produção do bar do QR Admin.",
  },
  {
    number: "06",
    label: "NO SALÃO · GARÇOM",
    title: "O pedido pronto chega à mesa.",
    description: "O garçom acompanha os itens liberados e registra a entrega pelo PWA.",
    image: "/assets/apresentacao/entregas-garcom.webp",
    alt: "Captura real do PWA do garçom com pedidos prontos e ações de entrega.",
  },
  {
    number: "07",
    label: "NO CAIXA · FECHAMENTO",
    title: "A conta é encerrada.",
    description: "O caixa confere a comanda, registra pagamentos parciais ou totais e finaliza a sessão.",
    image: "/assets/apresentacao/fechamento-caixa.webp",
    alt: "Captura real do fechamento de contas do QR Admin.",
  },
];

export function FlowSection() {
  return (
    <ScrollStory
      id="como-funciona"
      eyebrow="O CAMINHO DE UM PEDIDO"
      title="Da mesa à produção. Da produção ao caixa."
      description="Acompanhe o mesmo pedido atravessando cada estação do serviço. A demonstração usa telas reais do QR Admin."
      stamp="01—07 / FLUXO OPERACIONAL"
      scenes={scenes}
      variant="flow"
    />
  );
}
