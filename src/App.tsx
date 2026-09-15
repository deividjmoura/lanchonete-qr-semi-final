import { useEffect } from "react";
import { useRota } from "./router";
import { Toasts } from "./components/Toasts";
import { desbloquearAudio } from "./lib/sonus";
import Landing from "./screens/Landing";
import Login from "./screens/Login";
import Mesa from "./screens/Mesa";
import Cozinha from "./screens/Cozinha";
import Bar from "./screens/Bar";
import Garcom from "./screens/Garcom";
import Caixa from "./screens/Caixa";
import Admin from "./screens/Admin";

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

  return (
    <>
      <Toasts />
      {rota.path === "home" && <Landing />}
      {rota.path === "login" && <Login />}
      {rota.path === "mesa" && <Mesa key={rota.params.token} token={rota.params.token || ""} />}
      {rota.path === "cozinha" && <Cozinha />}
      {rota.path === "bar" && <Bar />}
      {rota.path === "garcom" && <Garcom key={rota.params.token} token={rota.params.token || ""} />}
      {rota.path === "caixa" && <Caixa />}
      {rota.path === "admin" && <Admin />}
      {!["home", "login", "mesa", "cozinha", "bar", "garcom", "caixa", "admin"].includes(rota.path) && <Landing />}
    </>
  );
}
