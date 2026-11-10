import { useCallback, useEffect, useState } from "react";
import { AuthModal } from "../components/AuthModal";
import { Header } from "./landing/sections/Header";
import { Hero } from "./landing/sections/Hero";
import { ValueSection } from "./landing/sections/ValueSection";
import { FlowSection } from "./landing/sections/FlowSection";
import { ManagementSection } from "./landing/sections/ManagementSection";
import { FeaturesSection } from "./landing/sections/FeaturesSection";
import { ProductSection } from "./landing/sections/ProductSection";
import { AudienceSection } from "./landing/sections/AudienceSection";
import { PrinciplesSection } from "./landing/sections/PrinciplesSection";
import { ContatoSection } from "./landing/sections/ContatoSection";
import { FinalCta } from "./landing/sections/FinalCta";
import { Footer } from "./landing/sections/Footer";
import { FloatingActions } from "./landing/components/FloatingActions";
import "./landing/styles/main.css";

/* Landing comercial oficial do QR Admin.
 *
 * A identidade visual é definida pelo design system Estação, compartilhado com
 * a área autenticada e o PWA. As cenas usam capturas reais e os CTAs abrem o
 * modal de autenticação do produto. */
export default function Landing() {
  const [acessoAberto, setAcessoAberto] = useState(false);
  const abrirAcesso = useCallback(() => setAcessoAberto(true), []);
  const fecharAcesso = useCallback(() => setAcessoAberto(false), []);

  /* A landing é a página inicial: título e tema do documento acompanham a marca. */
  useEffect(() => {
    const tituloAnterior = document.title;
    document.title = "QRAdmin — Gestão para operações de alimentação";
    return () => {
      document.title = tituloAnterior;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.regime = "landing";
    return () => {
      delete document.documentElement.dataset.regime;
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
        <ManagementSection />
        <FeaturesSection />
        <ProductSection />
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
