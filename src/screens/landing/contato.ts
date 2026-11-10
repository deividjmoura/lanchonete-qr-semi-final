/* Canais de contato oficiais do QR Admin — a única definição do SPA.
 *
 * A landing e o rodapé da tela de acesso (src/screens/Login.tsx) importam
 * daqui. As páginas estáticas de public/ não conseguem importar e repetem o
 * endereço por extenso; tests/contato-oficial.test.cjs garante que todas
 * continuem iguais a este arquivo. */
export const WHATSAPP_URL = "https://wa.me/5547996162721";
export const EMAIL_EXIBIDO = "servicosdegestaoqradmin@gmail.com";
export const EMAIL_URL = `mailto:${EMAIL_EXIBIDO}`;
/* Partes do endereço, para a tela poder quebrar a linha depois do "@" em
   colunas estreitas (o texto continua sendo o endereço inteiro). */
export const [EMAIL_USUARIO, EMAIL_DOMINIO] = EMAIL_EXIBIDO.split("@");

/* Mensagem inicial da conversa: contexto de quem chegou pela landing, sem
   prometer preço, prazo ou condição comercial. */
export const WHATSAPP_MENSAGEM =
  "Olá! Vi o site do QR Admin e quero entender como contratar o sistema para o meu negócio.";

export const whatsappLink = (mensagem = WHATSAPP_MENSAGEM) =>
  `${WHATSAPP_URL}?text=${encodeURIComponent(mensagem)}`;
