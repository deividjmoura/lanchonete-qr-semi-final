import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, ChefHat, ConciergeBell, QrCode, Smartphone,
  Split, Wallet, Boxes, ChartNoAxesColumn, UtensilsCrossed, Zap, Beer,
} from "lucide-react";
import { Badge, LivePill, Logo, Secao } from "../components/ui";
import { ir } from "../router";
import { HERO_IMG } from "../lib/data";
import { usePub, totalSessao } from "../store/usePub";
import { BRL } from "../lib/utils";

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
};

const FLUXO = [
  { icon: Smartphone, passo: "01", titulo: "Cliente", texto: "Escaneia o QR da mesa, monta o pedido no celular e personaliza tudo — sem app, sem fila.", tom: "text-sky-300" },
  { icon: ChefHat, passo: "02", titulo: "Cozinha", texto: "Recebe na hora com alerta de voz: mesa + cliente. Aceita, produz e marca como pronto.", tom: "text-amber-300" },
  { icon: ConciergeBell, passo: "03", titulo: "Garçom", texto: "Voz leve anunciando o nº da mesa. Entrega e confirma com um toque.", tom: "text-violet-300" },
  { icon: Wallet, passo: "04", titulo: "Caixa", texto: "Fecha a sessão acumulativa, divide a conta, aplica desconto e confirma o PIX.", tom: "text-lime-300" },
];

const RECURSOS = [
  { icon: QrCode, titulo: "Conta acumulativa", texto: "Uma comanda por visita: a mesa pode pedir várias vezes, o caixa fecha a sessão." },
  { icon: Split, titulo: "Divisão de conta", texto: "N pessoas, valor por pessoa, pagamentos parciais com badge pago/restante." },
  { icon: Zap, titulo: "PIX instantâneo", texto: "QR dinâmico com valor, copia-e-cola e botão “Já paguei” que avisa o caixa." },
  { icon: Boxes, titulo: "Estoque vivo", texto: "Baixa automática a cada pedido e alerta de item acabando." },
  { icon: ChartNoAxesColumn, titulo: "Dashboard", texto: "Faturamento, ticket médio e os campeões de venda em tempo real." },
  { icon: UtensilsCrossed, titulo: "Personalização", texto: "Adicionais, removíveis e itens de escolha única (tamanho/sabor)." },
];

export default function Landing() {
  const hydrateCardapio = usePub((s) => s.hydrateCardapio);
  const hydrateMesas = usePub((s) => s.hydrateMesas);
  const hydrateMe = usePub((s) => s.hydrateMe);
  useEffect(() => {
    void hydrateCardapio();
    void hydrateMe();
    void hydrateMesas().catch(() => null);
  }, [hydrateCardapio, hydrateMesas, hydrateMe]);

  const sessoes = usePub((s) => s.sessoes);
  const pedidos = usePub((s) => s.pedidos);

  const naFila = pedidos.filter((p) => p.status === "na_fila" || p.status === "em_producao").length;
  const comandas = sessoes.filter((s) => s.status === "aberta").length;
  const consumoAberto = sessoes
    .filter((s) => s.status === "aberta")
    .reduce((a, s) => a + totalSessao(pedidos, s.id) - s.desconto + s.taxa, 0);

  return (
    <div className="relative min-h-dvh overflow-x-clip w-full max-w-[100vw]">
      {/* fundo */}
      <div className="fixed inset-0 -z-10">
        <div className="glow-orb absolute -top-32 left-[8%] size-[30rem] bg-amber-500/16" />
        <div className="glow-orb absolute bottom-0 right-[-6rem] size-[26rem] bg-orange-700/12" />
        <div className="noise absolute inset-0" />
      </div>

      {/* nav */}
      <header className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8 pt-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2.5">
          <Badge tone="lime" pulse>salão aberto</Badge>
        </div>
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-7xl px-5 sm:px-8 pt-8 sm:pt-12">
        <div className="relative overflow-hidden rounded-[2rem] sm:rounded-[3rem] border border-white/10">
          <img
            src={HERO_IMG}
            alt="Ambiente do Major Pub"
            className="absolute inset-0 h-full w-full object-cover opacity-55 mask-fade-b"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-coal-950 via-coal-950/55 to-coal-950/15" />
          <div className="absolute inset-0 bg-gradient-to-r from-coal-950/80 via-transparent to-transparent" />

          <div className="relative px-6 sm:px-12 pt-14 sm:pt-20 pb-10">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <Badge tone="amber">pedidos por QR code</Badge>
                <Badge tone="zinc">nesse dispositivo · sem app</Badge>
              </div>
              <h1 className="font-display leading-[0.85] text-[clamp(4.5rem,14vw,12rem)]">
                <span className="block text-white">SENTOU.</span>
                <span className="block stroke-text">ESCANEOU.</span>
                <span className="block shine">PEDIU.</span>
              </h1>
              <p className="mt-6 max-w-xl text-stone-300/90 text-base sm:text-lg leading-relaxed">
                Do celular do cliente até a <b className="text-white">cozinha</b>, o <b className="text-white">garçom</b> e o{" "}
                <b className="text-white">caixa</b> — tudo conectado em tempo real. Uma comanda por visita, vários pedidos,
                PIX na mesa e divisão de conta sem dor de cabeça.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3">
                  <QrCode className="size-6 text-amber-300 shrink-0" />
                  <p className="text-sm text-stone-200 leading-snug max-w-xs">
                    <b className="text-white">Cliente:</b> escaneie o QR Code da sua mesa — o número já vem no link.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* placar ao vivo */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.8 }}
              className="mt-10 grid grid-cols-3 gap-1.5 sm:gap-4 max-w-lg w-full"
            >
              {[
                { v: String(comandas), l: "comandas abertas" },
                { v: String(naFila), l: "pedidos na chapa" },
                { v: BRL(consumoAberto), l: "consumo no salão" },
              ].map((m) => (
                <div key={m.l} className="glass rounded-2xl px-4 py-3.5">
                  <p className="font-display text-3xl sm:text-4xl text-gradient leading-none">{m.v}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">{m.l}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* marquee */}
      <div className="relative mt-10 border-y border-white/[0.07] bg-white/[0.02] py-3 overflow-hidden">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, r) => (
            <div key={r} className="flex items-center gap-10 text-[13px] font-semibold uppercase tracking-[0.3em] text-stone-500">
              {["cardápio digital", "alerta de voz", "pix na mesa", "divisão de conta", "estoque vivo", "dashboard em tempo real", "comanda acumulativa"].map((t) => (
                <span key={t} className="flex items-center gap-10">
                  {t} <Beer className="size-4 text-amber-500/70" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* FLUXO */}
      <section className="mx-auto max-w-7xl px-5 sm:px-8 py-16 sm:py-24">
        <motion.div {...fadeUp}>
          <Secao kicker="o fluxo" titulo={<>Quatro telas, <span className="text-gradient">zero atrito</span></>} right={<LivePill />} />
        </motion.div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {FLUXO.map((f, i) => (
            <motion.div
              key={f.passo}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.08 }}
              className="group relative glass rounded-3xl p-6 overflow-hidden hover:border-amber-400/25 transition-colors"
            >
              <span className="font-display text-7xl leading-none text-white/[0.06] absolute -top-2 right-3 group-hover:text-amber-400/10 transition-colors">
                {f.passo}
              </span>
              <f.icon className={`size-7 ${f.tom}`} />
              <h3 className="font-display text-3xl mt-4 text-white">{f.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-400">{f.texto}</p>
              {i < 3 && <ArrowRight className="absolute bottom-6 right-6 size-4 text-stone-600 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />}
            </motion.div>
          ))}
        </div>
      </section>

      {/* RECURSOS */}
      <section className="mx-auto max-w-7xl px-5 sm:px-8 pb-16 sm:pb-24">
        <motion.div {...fadeUp}>
          <Secao kicker="tudo incluso" titulo={<>O sistema inteiro, <span className="text-gradient">num bolso só</span></>} />
        </motion.div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RECURSOS.map((r, i) => (
            <motion.div
              key={r.titulo}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.06 }}
              className="glass rounded-3xl p-6 hover:bg-white/[0.06] transition-colors"
            >
              <div className="grid place-items-center size-11 rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/10 border border-amber-400/20">
                <r.icon className="size-5 text-amber-300" />
              </div>
              <h3 className="mt-4 font-semibold text-white">{r.titulo}</h3>
              <p className="mt-1.5 text-sm text-stone-400 leading-relaxed">{r.texto}</p>
            </motion.div>
          ))}
        </div>
      </section>


      {/* footer */}
      <footer className="border-t border-white/[0.07]">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div>
            <Logo size="sm" />
            <p className="mt-2 text-xs text-stone-500 max-w-sm">
              Pedidos por QR Code — do celular do cliente até a cozinha, o garçom e o caixa. Redesign completo do repositório
              <span className="font-mono text-stone-400"> lanchonete-qr</span>.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => ir("/login")}
              className="text-[11px] text-stone-600 hover:text-stone-400 transition-colors cursor-pointer"
            >
              equipe
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
