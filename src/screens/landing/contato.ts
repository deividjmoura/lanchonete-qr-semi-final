/* Canais de contato oficiais do QR Admin.
 *
 * São exatamente os mesmos já publicados no rodapé da tela de acesso
 * (src/screens/Login.tsx): a landing e o login importam estas constantes. Alterações de canal devem ser
 * feitas apenas neste módulo. */
export const WHATSAPP_URL = "https://wa.me/5547996162721";
export const EMAIL_URL = "mailto:servicosdegestaoqradmin@gmail.com";
export const EMAIL_EXIBIDO = "servicosdegestaoqradmin@gmail.com";

/* Mensagem inicial da conversa: contexto de quem chegou pela landing, sem
   prometer preço, prazo ou condição comercial. */
export const WHATSAPP_MENSAGEM =
  "Olá! Vi o site do QR Admin e quero entender como contratar o sistema para o meu negócio.";

export const whatsappLink = (mensagem = WHATSAPP_MENSAGEM) =>
  `${WHATSAPP_URL}?text=${encodeURIComponent(mensagem)}`;
