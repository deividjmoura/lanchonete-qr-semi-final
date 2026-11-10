import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { aplicarTema, temaAtual } from "./lib/tema";

/* Links individuais antigos de garçom abrem o PWA dedicado. Fazer isso
   antes de montar o React evita um frame na tela errada e funciona também
   quando a URL já chega com a rota hash no primeiro carregamento. */
function redirecionarLinkGarcom() {
  const match = window.location.hash.match(/^#\/garcom\/([^/?]+)/);
  if (!match) return;
  let token = "";
  try { token = decodeURIComponent(match[1]); } catch { return; }
  if (!token) return;
  const destino = new URL("/garcom-pwa/", window.location.origin);
  destino.searchParams.set("token", token);
  window.location.replace(destino.toString());
}
redirecionarLinkGarcom();
window.addEventListener("hashchange", redirecionarLinkGarcom);

/* aplica o tema salvo antes do primeiro paint */
if (window.location.hash.startsWith("#/mesa/")) {
  document.body.dataset.mesaPraia = "praia";
}
aplicarTema(temaAtual());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
