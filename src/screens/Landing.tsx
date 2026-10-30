import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CallBell,
  CashRegister,
  CookingPot,
  QrCode,
  SignIn,
} from "@phosphor-icons/react";
import { Badge, Btn, Logo, Secao, ThemeToggle } from "../components/ui";
import { ir } from "../router";
import { totalSessao, usePub } from "../store/usePub";
import { BRL } from "../lib/utils";

const POSTOS = [
  {
    passo: "01",
    titulo: "Mesa",
    Icon: QrCode,
    texto: "O cliente lê o QR fixo da mesa, escolhe o ponto, personaliza itens e acompanha a conta aberta sem instalar aplicativo.",
  },
  {
    passo: "02",
    titulo: "Cozinha & Bar",
    Icon: CookingPot,
    texto: "Cada setor recebe apenas seus itens em tempo real com anúncio por voz, controle por item e impressão térmica de comanda.",
  },
  {
    passo: "03",
    titulo: "Garçom",
    Icon: CallBell,
    texto: "Recebe aviso de prato ou bebida pronta, aceita, retira no balcão, entrega na mesa e lança pedidos mesmo sem sinal.",
  },
  {
    passo: "04",
    titulo: "Caixa",
    Icon: CashRegister,
    texto: "Consolida toda a sessão acumulativa, divide por pessoa, gera QR PIX com valor exato e registra pagamentos parciais.",
  },
] as const;

export default function Landing() {
  const hydrateCardapio = usePub((s) => s.hydrateCardapio);
  const hydrateMe = usePub((s) => s.hydrateMe);
  const reduceMotion = useReducedMotion();

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
    <div data-regime="expressive" className="min-h-dvh flex flex-col bg-surface text-text">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-8 py-4 flex items-center justify-between gap-3">
          <Logo size="md" />
          <div className="flex items-center gap-2">
            <Btn variant="secondary" size="sm" onClick={() => ir("/login")}>
              <SignIn size={15} weight="bold" /> Equipe
            </Btn>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Cartaz de recepção acolhedor */}
        <section className="mx-auto max-w-6xl px-4 sm:px-8 pt-8 sm:pt-12 pb-10">
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1.18, 0.36, 1] }}
            className="rounded-xl border border-line bg-surface-raised shadow-card overflow-hidden"
          >
            <div className="grid lg:grid-cols-[1.35fr_0.85fr]">
              <div className="p-6 sm:p-10 lg:p-12 border-b lg:border-b-0 lg:border-r border-line">
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <Badge tone="ember">Comanda por QR Code</Badge>
                  <Badge tone="sage" dot>Salão em operação</Badge>
                </div>

                <h1 className="font-display font-bold tracking-tight leading-[0.98] text-[clamp(2.5rem,6vw,4.85rem)] text-text">
                  <span className="block">Sentou.</span>
                  <span className="block text-brand-ink">Escaneou.</span>
                  <span className="block">Pediu.</span>
                </h1>

                <p className="mt-5 max-w-xl text-text-muted text-base sm:text-lg leading-relaxed">
                  Uma comanda aberta por mesa, conectando cliente, cozinha, bar, garçom e caixa em tempo real — com conta acumulativa, divisão simples e PIX direto na mesa.
                </p>

                <div className="mt-7 flex items-start gap-3 rounded-md border border-line bg-surface-sunken px-4 py-3.5 max-w-md">
                  <QrCode size={24} weight="regular" className="text-brand-ink shrink-0 mt-0.5" />
                  <p className="text-sm text-text leading-snug">
                    <strong>Está na casa?</strong> Escaneie o QR Code fixo da sua mesa para abrir o cardápio e enviar pedidos direto para o preparo.
                  </p>
                </div>
              </div>

              {/* Resumo do salão */}
              <div className="p-6 sm:p-10 bg-surface-sunken/70 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                    Resumo de balcão
                  </p>
                  <dl className="mt-4 divide-y divide-line border-y border-line">
                    <div className="py-4 flex items-baseline justify-between gap-4">
                      <dt className="text-xs font-semibold text-text-muted">
                        Comandas abertas
                      </dt>
                      <dd className="font-display text-2xl sm:text-3xl font-bold tnum text-text">
                        {String(comandas).padStart(2, "0")}
                      </dd>
                    </div>
                    <div className="py-4 flex items-baseline justify-between gap-4">
                      <dt className="text-xs font-semibold text-text-muted">
                        Pedidos em preparo
                      </dt>
                      <dd className="font-display text-2xl sm:text-3xl font-bold tnum text-brand-ink">
                        {String(naFila).padStart(2, "0")}
                      </dd>
                    </div>
                    <div className="py-4 flex items-baseline justify-between gap-4">
                      <dt className="text-xs font-semibold text-text-muted">
                        Consumo em aberto
                      </dt>
                      <dd className="font-display text-xl sm:text-2xl font-bold tnum text-text">
                        {BRL(consumoAberto)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-6 pt-4 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-text-muted">Operadores do turno</span>
                  <button
                    type="button"
                    onClick={() => ir("/login")}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-ink hover:underline"
                  >
                    Abrir posto <ArrowRight size={14} weight="bold" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Cartões individuais arredondados para cada posto */}
        <section className="mx-auto max-w-6xl px-4 sm:px-8 pb-14">
          <Secao kicker="Percurso do pedido" titulo="Da mesa ao fechamento" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {POSTOS.map((f) => {
              const Icon = f.Icon;
              return (
                <div
                  key={f.passo}
                  className="rounded-lg border border-line bg-surface-raised shadow-card p-6 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-text-muted">
                      <span className="inline-flex items-center justify-center rounded-full bg-brand-surface border border-brand-border px-2.5 py-0.5 font-mono text-xs font-bold text-brand-ink">
                        #{f.passo}
                      </span>
                      <Icon size={22} weight="regular" />
                    </div>
                    <h3 className="font-display text-2xl font-bold tracking-tight text-text mt-3.5">
                      {f.titulo}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.texto}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface-raised">
        <div className="mx-auto max-w-6xl px-4 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <p className="text-xs text-text-muted">QR Admin — Comanda digital por QR Code.</p>
          </div>
          <button
            type="button"
            onClick={() => ir("/login")}
            className="font-mono text-xs uppercase tracking-wider text-text-muted hover:text-text transition-colors"
          >
            equipe
          </button>
        </div>
      </footer>
    </div>
  );
}
