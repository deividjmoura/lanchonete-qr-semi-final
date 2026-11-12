import { useCallback, useEffect, useState } from "react";
import { AuthModal } from "../components/AuthModal";
import { Header } from "./landing/sections/Header";
import { Hero } from "./landing/sections/Hero";
import { ValueSection } from "./landing/sections/ValueSection";
import { FlowSection } from "./landing/sections/FlowSection";
import { FeaturesSection } from "./landing/sections/FeaturesSection";
import { AudienceSection } from "./landing/sections/AudienceSection";
import { PrinciplesSection } from "./landing/sections/PrinciplesSection";
import { ContatoSection } from "./landing/sections/ContatoSection";
import { FinalCta } from "./landing/sections/FinalCta";
import { Footer } from "./landing/sections/Footer";
import { FloatingActions } from "./landing/components/FloatingActions";
import "./landing/styles/main.css";

/* Landing oficial do QR Admin, na identidade "Passe".
 *
 * O cliente pode iniciar pedidos diretamente pelo QR fixo da mesa.
 * A página conta o percurso de um pedido: hero, o que se perde entre uma
 * estação e outra, a narrativa de rolagem com as seis estações e as capturas
 * reais do sistema, os módulos, para quem serve, princípios e contato. Segue
 * o tema claro/escuro do produto e usa os mesmos tokens das telas internas.
 * Os CTAs de acesso abrem o modal de autenticação real. */
export default function Landing() {
  const [acessoAberto, setAcessoAberto] = useState(false);
  const abrirAcesso = useCallback(() => setAcessoAberto(true), []);
  const fecharAcesso = useCallback(() => setAcessoAberto(false), []);

  /* A landing é a página inicial: o título do documento acompanha a marca. */
  useEffect(() => {
    const tituloAnterior = document.title;
    document.title = "QR Admin — Gestão para operações de alimentação";
    return () => {
      document.title = tituloAnterior;
    };
  }, []);

  return (
    <div className="landing-root">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Header aberto={acessoAberto} aoAbrirAcesso={abrirAcesso} />
      <main id="conteudo">
        <Hero />
        <ValueSection />
        <FlowSection />
        <FeaturesSection />
        <AudienceSection />
        <PrinciplesSection />
        <ContatoSection />
        <FinalCta aoAbrirAcesso={abrirAcesso} />
      </main>
      <Footer aoAbrirAcesso={abrirAcesso} />
      <FloatingActions aoAbrirAcesso={abrirAcesso} />
      <AuthModal aberto={acessoAberto} aoFechar={fecharAcesso} />
    </div>
  );
}
