import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { sincronizarIdentidade } from "./lib/identidade";
import { aplicarTema, temaAtual } from "./lib/tema";

/* Identidade e tema entram antes do primeiro paint. A identidade depende da
   rota (o cardápio do cliente conserva a dele), então é conferida de novo a
   cada troca de hash — este ouvinte é registrado antes do roteador. */
sincronizarIdentidade();
aplicarTema(temaAtual());
window.addEventListener("hashchange", () => {
  if (sincronizarIdentidade()) aplicarTema(temaAtual());
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
