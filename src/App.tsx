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

export default function App() {
  const rota = useRota();

  // Links individuais antigos de garçom devem abrir o PWA instalável.
  // A rota hash é mantida como entrada compatível, mas não deve renderizar
  // a tela React legada quando existe um token válido no link.
  useEffect(() => {
    if (rota.path !== "garcom" || !rota.params.token) return;
    const destino = new URL("/garcom-pwa/", window.location.origin);
    destino.searchParams.set("token", rota.params.token);
    window.location.replace(destino.toString());
  }, [rota.path, rota.params.token]);

  /* a voz "desbloqueia" no primeiro toque — igual ao voz-ops.js original */
  useEffect(() => {
    const fn = () => {
      desbloquearAudio();
      window.removeEventListener("pointerdown", fn);
    };
    window.addEventListener("pointerdown", fn);
    return () => window.removeEventListener("pointerdown", fn);
  }, []);

  return (
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
  );
}
