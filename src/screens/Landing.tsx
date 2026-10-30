import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, ChefHat, ConciergeBell, QrCode, Smartphone,
  Split, Wallet, Boxes, ChartNoAxesColumn, UtensilsCrossed, Zap,
} from "lucide-react";
import { Badge, Logo, Secao, ThemeToggle } from "../components/ui";
import { ir } from "../router";
import { usePub, totalSessao } from "../store/usePub";
import { BRL } from "../lib/utils";

const fadeUp = {
  initial: { opacity: 0, y: 26 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as const },
};

const FLUXO = [
  { icon: Smartphone, passo: "01", titulo: "Cliente", texto: "Escaneia o QR da mesa, monta o pedido no celular e personaliza tudo — sem app, sem fila.", tom: "text-sky-700", bg: "bg-sky-500/10" },
  { icon: ChefHat, passo: "02", titulo: "Cozinha", texto: "Recebe na hora com alerta de voz: mesa + cliente. Aceita, produz e marca como pronto.", tom: "text-brand-600", bg: "bg-brand-500/10" },
  { icon: ConciergeBell, passo: "03", titulo: "Garçom", texto: "Voz leve anunciando o nº da mesa. Entrega e confirma com um toque.", tom: "text-violet-700", bg: "bg-violet-500/10" },
  { icon: Wallet, passo: "04", titulo: "Caixa", texto: "Fecha a comanda acumulativa, divide a conta, aplica desconto e confirma o PIX.", tom: "text-teal-700", bg: "bg-teal-500/10" },
];

const RECURSOS = [
  { icon: QrCode, titulo: "Comanda acumulativa", texto: "Uma conta por visita: a mesa pede várias vezes, o caixa fecha a sessão." },
  { icon: Split, titulo: "Divisão de conta", texto: "N pessoas, valor por pessoa, pagamentos parciais com badge pago/restante." },
  { icon: Zap, titulo: "PIX instantâneo", texto: "QR dinâmico com valor, copia-e-cola e botão “Já paguei” que avisa o caixa." },
  { icon: Boxes, titulo: "Estoque vivo", texto: "Baixa automática a cada pedido e alerta de item acabando." },
  { icon: ChartNoAxesColumn, titulo: "Dashboard", texto: "Faturamento, ticket médio e os campeões de venda em tempo real." },
  { icon: UtensilsCrossed, titulo: "Personalização", texto: "Adicionais, removíveis e itens de escolha única (tamanho/sabor)." },
];

export default function Landing() {
  const hydrateCardapio = usePub((s) => s.hydrateCardapio);
  const hydrateMe = usePub((s) => s.hydrateMe);
  useEffect(() => {
    void hydrateCardapio();
    void hydrateMe();
  }, [hydrateCardapio, hydrateMe]);

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
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="glow-orb absolute -top-40 left-[6%] size-[34rem] bg-brand-500/14" />
        <div className="glow-orb absolute bottom-0 right-[-8rem] size-[28rem] bg-teal-500/10" />
      </div>

      {/* nav */}
      <header className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8 pt-5 sm:pt-7 flex items-center justify-between gap-3">
        <Logo size="md" />
        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => ir("/login")}
            className="btn-press ds-btn ds-btn--brand ds-btn--sm"
          >
            Entrar <ArrowUpRight className="size-3.5" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-8 sm:pt-14">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="lime" pulse>salão aberto</Badge>
              <Badge tone="zinc">sem app · direto do QR da mesa</Badge>
            </div>

            <h1 className="font-display text-[clamp(2.9rem,8.5vw,5.2rem)] leading-[0.92] text-navy-900 mt-5">
              Sentou.
              <br />
              Escaneou.
              <br />
              <span className="text-gradient">Pediu.</span>
            </h1>

            <p className="mt-5 max-w-xl text-[15px] sm:text-base leading-relaxed text-slate-600">
              Do celular do cliente até a <b className="font-semibold text-navy-900">cozinha</b>, o{" "}
              <b className="font-semibold text-navy-900">garçom</b> e o{" "}
              <b className="font-semibold text-navy-900">caixa</b> — tudo conectado em tempo real.
              Uma comanda por visita, vários pedidos, PIX na mesa e divisão de conta sem dor de cabeça.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => ir("/login")} className="btn-press ds-btn ds-btn--brand ds-btn--lg">
                Abrir o painel <ArrowRight className="size-4" />
              </button>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 h-11 text-xs font-semibold text-slate-600">
                <QrCode className="size-4 text-brand-600" /> cliente: QR fixo na mesa
              </span>
            </div>
          </motion.div>

          {/* placar ao vivo */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div className="absolute -inset-3 rounded-[2.2rem] bg-gradient-to-br from-brand-500/12 to-teal-500/8 blur-xl" aria-hidden="true" />
            <div className="relative glass-deep rounded-4xl p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="ds-kicker ds-kicker--muted">agora no salão</p>
                <Badge tone="lime" pulse>ao vivo</Badge>
              </div>
              <div className="mt-4 space-y-2.5">
                {[
                  { v: String(comandas), l: "comandas abertas", tom: "text-brand-600" },
                  { v: String(naFila), l: "pedidos na chapa", tom: "text-amber-600" },
                  { v: BRL(consumoAberto), l: "consumo no salão", tom: "text-teal-700" },
                ].map((m) => (
                  <div key={m.l} className="flex items-baseline justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{m.l}</p>
                    <p className={"font-display text-2xl sm:text-[1.75rem] tabular leading-none " + m.tom}>{m.v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                Números reais do salão — a mesma base que alimenta cozinha, bar e caixa.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FLUXO */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20">
        <motion.div {...fadeUp}>
          <Secao kicker="o fluxo" titulo={<>Quatro telas, <span className="text-brand-600">zero atrito</span></>} />
        </motion.div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {FLUXO.map((f, i) => (
            <motion.div
              key={f.passo}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.07 }}
              className="group relative glass rounded-3xl p-5 overflow-hidden hover:border-brand-500/35 transition-colors"
            >
              <span className="font-display text-6xl leading-none text-navy-900/[0.055] absolute top-1 right-4 tabular">
                {f.passo}
              </span>
              <span className={"grid place-items-center size-10 rounded-xl border border-slate-200 " + f.bg}>
                <f.icon className={"size-5 " + f.tom} />
              </span>
              <h3 className="font-display text-2xl mt-4 text-navy-900">{f.titulo}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{f.texto}</p>
              {i < 3 && (
                <ArrowRight className="absolute bottom-5 right-5 size-4 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* RECURSOS */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-14 sm:pb-20">
        <motion.div {...fadeUp}>
          <Secao kicker="tudo incluso" titulo={<>O sistema inteiro, <span className="text-brand-600">num bolso só</span></>} />
        </motion.div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RECURSOS.map((r, i) => (
            <motion.div
              key={r.titulo}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.05 }}
              className="glass rounded-3xl p-5 hover:border-slate-300 transition-colors"
            >
              <div className="grid place-items-center size-10 rounded-xl bg-brand-500/10 border border-brand-500/20">
                <r.icon className="size-5 text-brand-600" />
              </div>
              <h3 className="mt-4 text-[15px] font-bold text-navy-900">{r.titulo}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{r.texto}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* faixa de ação */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-14">
        <div className="relative overflow-hidden rounded-4xl border border-slate-200 bg-gradient-to-br from-navy-900 to-[#3c2417] px-6 py-10 sm:px-10 sm:py-12">
          <div aria-hidden="true" className="glow-orb absolute -top-24 right-0 size-72 bg-brand-500/30" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-brand-200">pronto pra rodar</p>
              <h2 className="font-display text-3xl sm:text-4xl text-white mt-2 leading-tight">
                Sua equipe entra em 30 segundos.
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/70">
                Cada posto tem sua tela: cozinha, bar, caixa e admin. O garçom usa o PWA no celular.
              </p>
            </div>
            <button
              type="button"
              onClick={() => ir("/login")}
              className="btn-press ds-btn ds-btn--brand ds-btn--lg shrink-0"
            >
              Entrar agora <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-9 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            <Logo size="sm" />
            <p className="mt-2.5 text-xs leading-relaxed text-slate-500 max-w-sm">
              Pedidos por QR Code — do celular do cliente até a cozinha, o garçom e o caixa.
            </p>
          </div>
          <button
            type="button"
            onClick={() => ir("/login")}
            className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-brand-600 transition-colors cursor-pointer"
          >
            equipe
          </button>
        </div>
      </footer>
    </div>
  );
}
