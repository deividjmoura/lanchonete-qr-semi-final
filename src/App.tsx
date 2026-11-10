import { useEffect } from "react";
import { useRota } from "./router";
import { Toasts } from "./components/Toasts";
import { ConfirmacaoGlobal } from "./components/ConfirmacaoGlobal";
import { desbloquearAudio } from "./lib/sonus";
import Landing from "./screens/Landing";
import Login from "./screens/Login";
import Mesa from "./screens/Mesa";
import Cozinha from "./screens/Cozinha";
import Bar from "./screens/Bar";
import Garcom from "./screens/Garcom";
import Caixa from "./screens/Caixa";
import Admin from "./screens/Admin";
import { RotaStaff } from "./components/RotaStaff";
import { IdentidadeContexto } from "./lib/identidade";

export default function App() {
  const rota = useRota();

  /* a voz "desbloqueia" no primeiro toque — igual ao voz-ops.js original */
  useEffect(() => {
    const fn = () => {
      desbloquearAudio();
      window.removeEventListener("pointerdown", fn);
    };
    window.addEventListener("pointerdown", fn);
    return () => window.removeEventListener("pointerdown", fn);
  }, []);

  /* O cardápio do cliente ficou fora do rebranding. O contexto avisa os
     componentes compartilhados (botões, modal, avisos, confirmação) para
     renderizarem ali exatamente a marcação de antes — ver lib/identidade.ts. */
  return (
    <IdentidadeContexto.Provider value={rota.path === "mesa" ? "cardapio" : "passe"}>
    <ConfirmacaoGlobal>
      <>
      <Toasts />
      {/* Rota raiz e a landing comercial oficial. O acesso da equipe continua em
          #/login (mesma tela de antes) e pelo modal de cada CTA. */}
      {rota.path === "home" && <Landing />}
      {rota.path === "login" && <Login />}
      {rota.path === "mesa" && <Mesa key={rota.params.token} token={rota.params.token || ""} />}
      {rota.path === "cozinha" && <RotaStaff recurso="cozinha"><Cozinha /></RotaStaff>}
      {rota.path === "bar" && <RotaStaff recurso="bar"><Bar /></RotaStaff>}
      {rota.path === "garcom" && <Garcom key={rota.params.token} token={rota.params.token || ""} />}
      {rota.path === "caixa" && <RotaStaff recurso="caixa"><Caixa /></RotaStaff>}
      {rota.path === "admin" && <RotaStaff recurso="admin"><Admin secao={rota.params.secao} /></RotaStaff>}
      {!["home", "login", "mesa", "cozinha", "bar", "garcom", "caixa", "admin"].includes(rota.path) && <Landing />}
      </>
    </ConfirmacaoGlobal>
    </IdentidadeContexto.Provider>
  );
}
