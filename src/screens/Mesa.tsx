import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BeerStein,
  CallBell as ConciergeBell,
  CaretRight,
  Check,
  Clock,
  ForkKnife,
  ListChecks,
  MagnifyingGlass,
  Minus,
  PencilSimple,
  Plus,
  Receipt,
  ShoppingBag,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { Badge, Btn, Input, Logo, Modal, Qtd, ThemeToggle } from "../components/ui";
import type { Opcao, Pedido, Produto } from "../lib/types";
import { usePub, sessaoDaMesa, totalSessao } from "../store/usePub";
import { FOTO_PLACEHOLDER, fotoDemo, fotoSrc } from "../lib/mappers";
import { descricaoExibida, isDoseProduto } from "../lib/descricao";
import { connectEvents } from "../lib/api";
import { BRL } from "../lib/utils";
import { cn } from "../utils/cn";

interface CartItem {
  uid: string;
  produto: Produto;
  qtd: number;
  adicionais: Opcao[];
  removidos: string[];
  escolha: Opcao | null;
  obs: string;
}

function fallbackFoto(e: SyntheticEvent<HTMLImageElement>, nome: string, categoria: string) {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied === "true") {
    img.src = FOTO_PLACEHOLDER;
    return;
  }
  img.dataset.fallbackApplied = "true";
  img.src = fotoDemo(nome, categoria);
}

const totalItem = (c: CartItem) =>
  (c.produto.preco + c.adicionais.reduce((a, b) => a + b.preco, 0) + (c.escolha?.preco ?? 0)) * c.qtd;

const STATUS_ORDEM: { id: Pedido["status"]; label: string }[] = [
  { id: "na_fila", label: "Recebido" },
  { id: "em_producao", label: "Em preparo" },
  { id: "pronto", label: "Pronto" },
  { id: "entregue", label: "Na mesa" },
];

export default function Mesa({ token }: { token: string }) {
  const mesas = usePub((s) => s.mesas);
  const produtos = usePub((s) => s.produtos);
  const sessoes = usePub((s) => s.sessoes);
  const pedidos = usePub((s) => s.pedidos);
  const criarPedido = usePub((s) => s.criarPedido);
  const cancelarPedido = usePub((s) => s.cancelarPedido);
  const categoriasStore = usePub((s) => s.categorias);
  const hydrateMesaToken = usePub((s) => s.hydrateMesaToken);
  const loading = usePub((s) => s.loading);
  const lastError = usePub((s) => s.lastError);
  const [boot, setBoot] = useState(true);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!token) {
      setBoot(false);
      return;
    }
    let alive = true;
    setBoot(true);
    void hydrateMesaToken(token).finally(() => {
      if (alive) setBoot(false);
    });
    const t = setInterval(() => void hydrateMesaToken(token), 8000);
    const off = connectEvents(() => {
      void hydrateMesaToken(token);
    }, { mesa: token });
    return () => {
      alive = false;
      clearInterval(t);
      off();
    };
  }, [token, hydrateMesaToken]);

  const mesa = mesas.find((m) => m.token === token);

  const [categoria, setCategoria] = useState("Tudo");
  const [busca, setBusca] = useState("");
  const [catsHidden, setCatsHidden] = useState(false);
  const listaTopRef = useRef<HTMLDivElement>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [produtoModal, setProdutoModal] = useState<Produto | null>(null);
  const [sheet, setSheet] = useState<"cart" | "conta" | null>(null);
  const [nome, setNome] = useState(() => sessionStorage.getItem(`pub-nome-${token}`) || "");
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(`pub-nome-${token}`, nome);
  }, [nome, token]);

  useEffect(() => {
    const onScroll = () => {
      setCatsHidden(window.scrollY > 56);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const irParaLista = () => {
    requestAnimationFrame(() => {
      listaTopRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  };

  const sessao = mesa ? sessaoDaMesa(sessoes, mesa.id) : undefined;
  const pedidosMesa = sessao
    ? pedidos.filter((p) => p.sessaoId === sessao.id).sort((a, b) => b.criadoEm - a.criadoEm)
    : [];
  const totalConta = sessao ? totalSessao(pedidos, sessao.id) : 0;
  const totalCart = cart.reduce((a, c) => a + totalItem(c), 0);
  const qtdCart = cart.reduce((a, c) => a + c.qtd, 0);

  const garcomResponsavel = useMemo(() => {
    if (sessao?.garcomNome) return sessao.garcomNome;
    const pedComGarcom = pedidosMesa.find((p) => p.garcomNome);
    return pedComGarcom?.garcomNome || null;
  }, [sessao, pedidosMesa]);

  const categorias = useMemo(() => {
    const ordered = [...categoriasStore].sort((a, b) => a.ordem - b.ordem).map((c) => c.nome);
    const presentes = new Set(produtos.filter((p) => p.ativo).map((p) => p.categoria));
    const list = ordered.filter((n) => presentes.has(n));
    for (const n of presentes) if (!list.includes(n)) list.push(n);
    return ["Tudo", ...(list.length ? list : [])];
  }, [produtos, categoriasStore]);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const ordemCat = new Map(
      [...categoriasStore].sort((a, b) => a.ordem - b.ordem).map((c, i) => [c.nome, c.ordem ?? i]),
    );
    const filtrados = produtos.filter((p) => {
      if (!p.ativo) return false;
      if (b) return p.nome.toLowerCase().includes(b) || p.descricao.toLowerCase().includes(b);
      if (categoria === "Tudo") return true;
      return p.categoria === categoria;
    });
    return filtrados.sort((a, b) => {
      const ca = ordemCat.get(a.categoria) ?? a.categoriaOrdem ?? 999;
      const cb = ordemCat.get(b.categoria) ?? b.categoriaOrdem ?? 999;
      if (ca !== cb) return ca - cb;
      const oa = a.ordem ?? a.id;
      const ob = b.ordem ?? b.id;
      if (oa !== ob) return oa - ob;
      return a.id - b.id;
    });
  }, [produtos, categoria, busca, categoriasStore]);

  const gruposCardapio = useMemo(() => {
    if (busca.trim() || categoria !== "Tudo") return null;
    const ordem = new Map(
      [...categoriasStore].sort((a, b) => a.ordem - b.ordem).map((c, i) => [c.nome, c.ordem ?? i]),
    );
    const map = new Map<string, typeof lista>();
    for (const p of lista) {
      const k = p.categoria || "Outros";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return [...map.entries()]
      .sort((a, b) => (ordem.get(a[0]) ?? 999) - (ordem.get(b[0]) ?? 999))
      .map(([nomeCat, itens]) => ({ nome: nomeCat, itens }));
  }, [lista, categoria, busca, categoriasStore]);

  if (boot || (loading && !mesa)) {
    return (
      <div
        data-regime="expressive"
        className="paper-grain min-h-dvh bg-surface text-text grid place-items-center p-6 text-center"
      >
        <div className="rounded-md border border-line-strong bg-surface-raised px-8 py-10 max-w-sm w-full">
          <div className="mx-auto size-12 rounded-sm border border-line-strong bg-surface-sunken grid place-items-center text-brand-ink">
            <BeerStein size={24} weight="duotone" />
          </div>
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-text mt-4">
            Abrindo comanda…
          </h1>
          <p className="text-text-muted mt-1.5 text-xs">Validando o QR Code desta mesa.</p>
        </div>
      </div>
    );
  }

  if (!mesa) {
    return (
      <div
        data-regime="expressive"
        className="paper-grain min-h-dvh bg-surface text-text grid place-items-center p-6 text-center"
      >
        <div className="rounded-md border border-line-strong bg-surface-raised px-6 py-8 max-w-sm w-full">
          <div className="mx-auto size-12 rounded-sm border border-status-danger-border bg-status-danger-surface grid place-items-center text-status-danger-ink">
            <BeerStein size={24} />
          </div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-text mt-4">
            QR inválido
          </h1>
          <p className="text-text-muted mt-2 text-xs leading-relaxed">
            {lastError || "Este código não corresponde a nenhuma mesa ativa."}
          </p>
          <p className="text-text-subtle mt-3 text-[11px] font-mono break-all">
            token: {token || "(vazio)"}
          </p>
          <p className="mt-4 pt-3 border-t border-dashed border-line text-xs text-text-muted">
            Solicite o QR Code impresso na sua mesa para acessar o cardápio.
          </p>
        </div>
      </div>
    );
  }

  const addCart = (item: CartItem) => setCart((c) => [...c, item]);

  const enviar = () => {
    if (!cart.length) return;
    const itens = cart.map((c) => ({
      id: c.uid,
      produtoId: c.produto.id,
      nome: c.produto.nome,
      qtd: c.qtd,
      precoBase: c.produto.preco,
      adicionais: c.adicionais,
      removidos: c.removidos,
      escolha: c.escolha,
      obs: c.obs,
      totalUnit: totalItem(c) / c.qtd,
    }));
    const id = criarPedido(mesa.id, nome, itens);
    if (id) {
      setCart([]);
      setSheet(null);
      setEnviado(true);
      setTimeout(() => {
        setEnviado(false);
        setSheet("conta");
      }, 1800);
    }
  };

  /* ==================== painéis reutilizáveis ==================== */

  const painelCarrinho = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-dashed border-line-strong">
        <h3 className="font-display text-2xl font-extrabold uppercase tracking-tight text-text flex items-center gap-2">
          <ShoppingBag size={20} className="text-brand-ink" /> Comanda atual
        </h3>
        {qtdCart > 0 && <Badge tone="brand">{qtdCart} it.</Badge>}
      </div>

      {cart.length === 0 ? (
        <div className="flex-1 grid place-items-center py-12 text-center">
          <div>
            <ForkKnife size={32} className="text-text-muted mx-auto" />
            <p className="mt-2.5 text-xs text-text-muted">
              Sua comanda ainda está vazia.
              <br />
              Toque em um item do cardápio para adicionar.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 divide-y divide-dashed divide-line overflow-y-auto pr-1 no-scrollbar">
            <AnimatePresence initial={false}>
              {cart.map((c) => (
                <motion.div
                  key={c.uid}
                  layout={!reduceMotion}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="flex gap-3 py-3"
                >
                  <img
                    src={fotoSrc(c.produto.foto) || FOTO_PLACEHOLDER}
                    alt=""
                    className="size-13 rounded-sm object-cover border border-line shrink-0"
                    onError={(e) => fallbackFoto(e, c.produto.nome, c.produto.categoria)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-text leading-tight">{c.produto.nome}</p>
                      <button
                        type="button"
                        onClick={() => setCart((x) => x.filter((y) => y.uid !== c.uid))}
                        aria-label={`Remover ${c.produto.nome}`}
                        className="size-7 grid place-items-center rounded-xs text-text-muted hover:text-status-danger-ink shrink-0"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                    {(c.escolha || c.adicionais.length > 0 || c.removidos.length > 0 || c.obs) && (
                      <p className="mt-0.5 text-[11px] text-text-muted leading-snug">
                        {c.escolha && <span className="text-status-info-ink font-semibold">{c.escolha.nome} · </span>}
                        {c.adicionais.map((a) => `+${a.nome}`).join(", ")}
                        {c.removidos.length > 0 && (
                          <span className="text-status-danger-ink"> · sem {c.removidos.join(", ")}</span>
                        )}
                        {c.obs && <span className="block italic">“{c.obs}”</span>}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <Qtd
                        size="sm"
                        valor={c.qtd}
                        onChange={(v) =>
                          setCart((x) => x.map((y) => (y.uid === c.uid ? { ...y, qtd: v } : y)))
                        }
                      />
                      <span className="font-mono text-sm font-bold text-text">{BRL(totalItem(c))}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="pt-3.5 mt-2 border-t border-line-strong space-y-3">
            <Input value={nome} onChange={setNome} placeholder="Seu nome (para identificação na mesa)" />
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted font-bold">
                Total deste envio
              </span>
              <span className="font-mono text-2xl font-extrabold text-text">{BRL(totalCart)}</span>
            </div>
            <Btn full size="lg" onClick={enviar} disabled={!cart.length}>
              Enviar pra cozinha <CaretRight size={16} weight="bold" />
            </Btn>
          </div>
        </>
      )}
    </div>
  );

  const painelConta = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-dashed border-line-strong">
        <h3 className="font-display text-2xl font-extrabold uppercase tracking-tight text-text flex items-center gap-2">
          <Receipt size={20} className="text-brand-ink" /> Consumo da mesa
        </h3>
        <Badge tone="neutral">{pedidosMesa.length} ped.</Badge>
      </div>

      {garcomResponsavel && (
        <div className="mt-3 flex items-center gap-2 rounded-sm bg-status-info-surface border border-status-info-border px-3 py-2 text-xs text-status-info-ink">
          <ConciergeBell size={15} weight="fill" className="shrink-0" />
          <span>
            Garçom: <strong className="font-semibold">{garcomResponsavel}</strong>
          </span>
        </div>
      )}

      {pedidosMesa.length === 0 ? (
        <div className="flex-1 grid place-items-center py-12 text-center">
          <div>
            <Clock size={30} className="text-text-muted mx-auto" />
            <p className="mt-2.5 text-xs text-text-muted">Nenhum pedido enviado nesta sessão.</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex-1 divide-y divide-line overflow-y-auto pr-1 no-scrollbar">
          {pedidosMesa.map((p) => {
            const cancelado = p.status === "cancelado";
            const idx = STATUS_ORDEM.findIndex((s) => s.id === p.status);
            const stepIdx = cancelado ? -1 : Math.max(0, idx);
            return (
              <div key={p.id} className="py-3.5 first:pt-1">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-text">
                      <span className="font-mono text-brand-ink font-bold">#{p.id}</span>
                      {p.clienteNome ? ` · ${p.clienteNome}` : ""}
                    </p>
                    {p.garcomNome && (
                      <p className="font-mono text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
                        <ConciergeBell size={12} />
                        <span>Garçom: {p.garcomNome}</span>
                      </p>
                    )}
                  </div>
                  <Badge
                    tone={
                      cancelado
                        ? "rose"
                        : p.status === "entregue"
                          ? "sage"
                          : p.status === "pronto"
                            ? "sky"
                            : p.status === "em_producao"
                              ? "brass"
                              : "neutral"
                    }
                  >
                    {cancelado ? "Cancelado" : STATUS_ORDEM[stepIdx].label}
                  </Badge>
                </div>

                {/* Régua discreta de andamento */}
                <div className="mt-2.5 grid grid-cols-4 gap-1" aria-hidden="true">
                  {STATUS_ORDEM.map((s, i) => (
                    <div
                      key={s.id}
                      className={cn(
                        "h-1 rounded-xs transition-colors",
                        cancelado
                          ? "bg-status-danger-border"
                          : i <= stepIdx
                            ? "bg-brand"
                            : "bg-surface-sunken border border-line",
                      )}
                    />
                  ))}
                </div>

                <ul className="mt-2.5 space-y-1.5">
                  {p.itens.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 text-xs text-text">
                      <span className="leading-snug">
                        <strong className="font-mono text-brand-ink">{i.qtd}×</strong> {i.nome}
                        {i.status && (
                          <span
                            className={cn(
                              "ml-1.5 font-mono text-[10px] font-bold uppercase",
                              i.status === "entregue" || i.status === "concluido"
                                ? "text-status-success-ink"
                                : i.status === "em_producao"
                                  ? "text-status-info-ink"
                                  : "text-status-warning-ink",
                            )}
                          >
                            {i.status === "recebido"
                              ? "fila"
                              : i.status === "em_producao"
                                ? "preparo"
                                : i.status === "concluido"
                                  ? "pronto"
                                  : i.status === "entregue"
                                    ? "entregue"
                                    : i.status}
                          </span>
                        )}
                        {(i.escolha || i.adicionais.length > 0 || i.removidos.length > 0) && (
                          <span className="block text-[11px] text-text-muted">
                            {[
                              i.escolha?.nome,
                              ...i.adicionais.map((a) => `+${a.nome}`),
                              i.removidos.length ? `sem ${i.removidos.join(", ")}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-text-muted shrink-0">{BRL(i.totalUnit * i.qtd)}</span>
                    </li>
                  ))}
                </ul>

                {p.status === "na_fila" && (
                  <div className="mt-3 flex gap-2">
                    <Btn
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        const items: CartItem[] = p.itens.map((i) => {
                          const prod = produtos.find((x) => x.id === i.produtoId) || {
                            id: i.produtoId,
                            nome: i.nome,
                            descricao: "",
                            preco: i.precoBase,
                            categoria: "",
                            foto: "",
                            tipo: "simples" as const,
                            adicionais: [],
                            removiveis: [],
                            ativo: true,
                            estoque: null,
                            vendidos: 0,
                          };
                          return {
                            uid: Math.random().toString(36).slice(2),
                            produto: prod,
                            qtd: i.qtd,
                            adicionais: i.adicionais,
                            removidos: i.removidos,
                            escolha: i.escolha,
                            obs: i.obs,
                          };
                        });
                        cancelarPedido(p.id);
                        setCart(items);
                        setSheet("cart");
                      }}
                    >
                      <PencilSimple size={14} /> Editar
                    </Btn>
                    <Btn
                      size="sm"
                      variant="danger"
                      className="flex-1"
                      onClick={() => {
                        if (
                          confirm(
                            `Cancelar o pedido #${p.id}? Disponível apenas antes do início do preparo.`,
                          )
                        ) {
                          cancelarPedido(p.id);
                        }
                      }}
                    >
                      <Trash size={14} /> Cancelar
                    </Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-3.5 mt-3 border-t border-line-strong flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted font-bold">
          Parcial da mesa
        </span>
        <span className="font-mono text-2xl font-extrabold text-text">{BRL(totalConta)}</span>
      </div>
    </div>
  );

  /* ==================== render ==================== */
  return (
    <div
      data-regime="expressive"
      className="paper-grain relative min-h-dvh bg-surface text-text pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] lg:pb-12 overflow-x-clip"
    >
      {/* Cabeçalho compacto da mesa (sem sidebar em /mesa/:token) */}
      <header className="sticky top-0 z-40 border-b border-line-strong bg-surface-raised">
        <div className="mx-auto max-w-6xl px-3.5 sm:px-6 h-14 flex items-center gap-2 min-w-0">
          <Logo size="sm" />
          <Badge tone="brand">{mesa.nome}</Badge>
          {garcomResponsavel && (
            <Badge tone="sky" className="hidden xs:inline-flex items-center gap-1">
              <ConciergeBell size={12} weight="fill" />
              <span>{garcomResponsavel}</span>
            </Badge>
          )}
          <div className="flex-1" />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setSheet("conta")}
            className="lg:hidden inline-flex items-center gap-1.5 rounded-sm bg-surface border border-line-strong h-10 px-3 font-mono text-xs font-bold text-text"
          >
            <Receipt size={15} className="text-brand-ink" />
            <span>{BRL(totalConta)}</span>
          </button>
          <button
            type="button"
            onClick={() => setSheet("cart")}
            aria-label="Abrir comanda"
            className="relative grid place-items-center size-10 rounded-sm bg-brand text-brand-contrast border border-brand"
          >
            <ShoppingBag size={18} weight="bold" />
            {qtdCart > 0 && (
              <span className="absolute -top-1.5 -right-1.5 grid place-items-center min-w-5 h-5 px-1 rounded-xs bg-surface-sidebar text-text-sidebar font-mono text-[10px] font-bold border border-line-strong">
                {qtdCart}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-3.5 sm:px-6">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8">
          {/* Coluna do Cardápio */}
          <section className="lg:col-span-8">
            <div className="pt-6 pb-4 border-b border-dashed border-line-strong mb-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink">
                    Comanda digital · {mesa.nome}
                  </p>
                  <h1 className="font-display text-[clamp(1.85rem,6vw,2.75rem)] font-extrabold uppercase tracking-tight leading-none text-text mt-1">
                    Cardápio da casa
                  </h1>
                </div>
                {garcomResponsavel && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-text-muted">
                    <ConciergeBell size={14} className="text-brand-ink" />
                    Garçom: <strong className="text-text">{garcomResponsavel}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Abas de categoria */}
            <div
              className={cn(
                "overflow-hidden transition-all duration-150",
                catsHidden ? "max-h-0 opacity-0 mb-0 pointer-events-none" : "max-h-20 opacity-100 mb-2",
              )}
            >
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                {categorias.map((c) => {
                  const ativa = categoria === c && !busca;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCategoria(c);
                        setBusca("");
                        irParaLista();
                      }}
                      className={cn(
                        "relative shrink-0 h-10 px-3.5 rounded-sm font-mono text-[11px] font-bold uppercase tracking-wider transition-colors border",
                        ativa
                          ? "bg-brand text-brand-contrast border-brand"
                          : "bg-surface-raised text-text-muted border-line-strong hover:text-text",
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Busca sticky */}
            <div className="sticky top-14 z-30 py-2 bg-surface/95">
              <div className="relative">
                <MagnifyingGlass
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar no cardápio…"
                  className="w-full h-11 rounded-sm bg-surface-raised border border-line-strong pl-10 pr-10 text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-brand transition-colors"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca("")}
                    aria-label="Limpar busca"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div ref={listaTopRef} className="scroll-mt-28" />

            {(busca || categoria !== "Tudo") && (
              <div className="mt-2 mb-3 flex items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-text truncate">
                  {busca ? `Busca: “${busca}”` : categoria}
                </h2>
                <span className="font-mono text-xs text-text-muted shrink-0">{lista.length} itens</span>
              </div>
            )}

            {gruposCardapio ? (
              <div className="space-y-7 pt-2 pb-24 lg:pb-10 w-full min-w-0">
                {gruposCardapio.map((g) => (
                  <section key={g.nome}>
                    <div className="mb-3 pb-1.5 border-b border-line-strong flex items-baseline justify-between">
                      <h3 className="font-display text-xl sm:text-2xl font-extrabold uppercase tracking-tight text-text">
                        {g.nome}
                      </h3>
                      <span className="font-mono text-[11px] text-text-muted">{g.itens.length}</span>
                    </div>
                    <div className="grid-cardapio grid grid-cols-2 sm:grid-cols-3 gap-3 w-full min-w-0">
                      {g.itens.map((p) => (
                        <ItemCard
                          key={p.id}
                          produto={p}
                          onOpen={setProdutoModal}
                          onAdd={(prod) =>
                            addCart({
                              uid: Math.random().toString(36).slice(2),
                              produto: prod,
                              qtd: 1,
                              adicionais: [],
                              removidos: [],
                              escolha: null,
                              obs: "",
                            })
                          }
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid-cardapio grid grid-cols-2 sm:grid-cols-3 gap-3 pb-24 lg:pb-10 w-full min-w-0">
                {lista.map((p) => (
                  <ItemCard
                    key={p.id}
                    produto={p}
                    onOpen={setProdutoModal}
                    onAdd={(prod) =>
                      addCart({
                        uid: Math.random().toString(36).slice(2),
                        produto: prod,
                        qtd: 1,
                        adicionais: [],
                        removidos: [],
                        escolha: null,
                        obs: "",
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* Coluna Comanda Lateral (Desktop) */}
          <aside className="hidden lg:block lg:col-span-4 pt-6">
            <div className="sticky top-20 rounded-md border border-line-strong bg-surface-raised p-4 max-h-[calc(100dvh-6.5rem)] flex flex-col overflow-hidden">
              <PainelComAbas
                cart={cart}
                totalConta={totalConta}
                painelCarrinho={painelCarrinho}
                painelConta={painelConta}
              />
            </div>
          </aside>
        </div>
      </div>

      {/* Barra Inferior Mobile */}
      <AnimatePresence>
        {(qtdCart > 0 || pedidosMesa.length > 0) && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-surface-sidebar border-t border-surface-sidebar-border"
          >
            <div className="flex gap-2 max-w-md mx-auto">
              <button
                type="button"
                onClick={() => setSheet("conta")}
                className="flex-1 h-13 rounded-sm bg-surface-sidebar-hover border border-surface-sidebar-border text-text-sidebar flex items-center justify-center gap-2 px-3"
              >
                <Receipt size={17} className="text-accent" />
                <span className="font-mono text-xs font-bold">{BRL(totalConta)}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-sidebar-muted">
                  conta
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSheet("cart")}
                className="flex-[1.35] h-13 rounded-sm bg-brand text-brand-contrast font-bold text-sm flex items-center justify-center gap-2 px-3"
              >
                <ShoppingBag size={18} weight="bold" />
                <span>{qtdCart === 0 ? "Comanda" : `Pedir · ${BRL(totalCart)}`}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modais Mobile */}
      <Modal open={sheet === "cart"} onClose={() => setSheet(null)}>
        <div className="p-4 sm:p-5 min-h-[52dvh]">{painelCarrinho}</div>
      </Modal>
      <Modal open={sheet === "conta"} onClose={() => setSheet(null)}>
        <div className="p-4 sm:p-5 min-h-[52dvh]">{painelConta}</div>
      </Modal>

      {/* Modal de Personalização do Produto */}
      <ProdutoModal
        produto={produtoModal}
        onClose={() => setProdutoModal(null)}
        onAdd={(item) => addCart(item)}
      />

      {/* Confirmação de Comanda Enviada (carimbo seco, sem confete decorativo) */}
      <AnimatePresence>
        {enviado && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 grid place-items-center bg-overlay p-6"
          >
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.16, ease: [0.22, 1.18, 0.36, 1] }}
              className="rounded-md border border-status-success-border bg-surface-raised px-7 py-8 text-center max-w-sm w-full"
            >
              <div className="mx-auto grid place-items-center size-14 rounded-sm bg-status-success-surface border border-status-success-border text-status-success-ink">
                <Check size={28} weight="bold" />
              </div>
              <h2 className="font-display text-4xl font-extrabold uppercase tracking-tight text-text mt-4">
                Comanda enviada
              </h2>
              <p className="mt-2 text-text-muted text-xs">
                Seu pedido já entrou em preparo. Acompanhe o andamento em Consumo da mesa.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ItemCard({
  produto: p,
  onOpen,
  onAdd,
}: {
  produto: Produto;
  onOpen: (p: Produto) => void;
  onAdd: (p: Produto) => void;
}) {
  const esgotado = p.estoque !== null && p.estoque <= 0;
  const ctaLabel =
    p.tipo === "escolher" ? "Escolher" : p.tipo === "personalizavel" ? "Montar" : "Adicionar";

  return (
    <article
      className={cn(
        "card-produto group flex h-full min-h-0 flex-col rounded-md border border-line-strong bg-surface-raised overflow-hidden",
        esgotado && "opacity-55 grayscale-[0.55]",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(p)}
        className="relative block w-full shrink-0 aspect-[4/3] overflow-hidden text-left bg-surface-sunken border-b border-line"
        aria-label={`Ver ${p.nome}`}
      >
        <img
          src={fotoSrc(p.foto) || FOTO_PLACEHOLDER}
          alt=""
          loading="lazy"
          decoding="async"
          className="card-produto-foto transition-transform duration-200 group-hover:scale-[1.03]"
          onError={(e) => fallbackFoto(e, p.nome, p.categoria)}
        />
        <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1 pointer-events-none">
          {p.estoque !== null && p.estoque > 0 && p.estoque <= 8 && (
            <Badge tone="rose">{p.estoque} un</Badge>
          )}
          {esgotado && <Badge tone="neutral">Esgotado</Badge>}
        </div>
        <span className="absolute bottom-2 left-2 rounded-xs bg-surface-raised border border-line-strong px-2 py-0.5 font-mono text-xs font-bold text-text pointer-events-none">
          {BRL(p.preco)}
        </span>
      </button>

      <div className="flex flex-1 flex-col min-h-0 p-2.5 sm:p-3 gap-2">
        <button type="button" onClick={() => onOpen(p)} className="text-left min-w-0">
          <h3 className="font-semibold text-text leading-snug text-xs sm:text-sm line-clamp-2 min-h-[2.4em] break-words">
            {p.nome}
          </h3>
          <p className="mt-0.5 text-[11px] text-text-muted leading-snug line-clamp-2 min-h-[2.4em] break-words">
            {descricaoExibida(p.descricao, p.nome, p.categoria) || "\u00a0"}
          </p>
        </button>

        <div className="mt-auto pt-1">
          {p.tipo === "simples" ? (
            <Btn
              size="sm"
              full
              disabled={esgotado}
              onClick={() => onAdd(p)}
              className="h-10 text-xs"
            >
              <Plus size={14} weight="bold" />
              <span className="truncate">Adicionar</span>
            </Btn>
          ) : (
            <Btn
              size="sm"
              variant="secondary"
              full
              disabled={esgotado}
              onClick={() => onOpen(p)}
              className="h-10 text-xs"
            >
              <span className="truncate">{ctaLabel}</span>
              <CaretRight size={13} weight="bold" />
            </Btn>
          )}
        </div>
      </div>
    </article>
  );
}

function PainelComAbas({
  cart,
  totalConta,
  painelCarrinho,
  painelConta,
}: {
  cart: CartItem[];
  totalConta: number;
  painelCarrinho: ReactNode;
  painelConta: ReactNode;
}) {
  const [aba, setAba] = useState<"cart" | "conta">("cart");
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="grid grid-cols-2 gap-1 rounded-sm bg-surface-sunken border border-line p-1 mb-4">
        {(
          [
            { id: "cart", label: "Comanda", icon: ShoppingBag },
            { id: "conta", label: `Conta · ${BRL(totalConta)}`, icon: ListChecks },
          ] as const
        ).map((t) => {
          const ativa = aba === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setAba(t.id)}
              className={cn(
                "min-w-0 h-10 rounded-xs font-mono text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors inline-flex items-center justify-center gap-1.5 px-2",
                ativa
                  ? "bg-surface-raised text-text border border-line-strong"
                  : "text-text-muted hover:text-text",
              )}
            >
              <t.icon size={14} />
              <span className="truncate">{t.label}</span>
              {t.id === "cart" && cart.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-xs bg-brand text-brand-contrast text-[10px]">
                  {cart.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {aba === "cart" ? painelCarrinho : painelConta}
      </div>
    </div>
  );
}

function ProdutoModal({
  produto,
  onClose,
  onAdd,
}: {
  produto: Produto | null;
  onClose: () => void;
  onAdd: (c: CartItem) => void;
}) {
  const [qtd, setQtd] = useState(1);
  const [ads, setAds] = useState<Opcao[]>([]);
  const [rems, setRems] = useState<string[]>([]);
  const [escolha, setEscolha] = useState<Opcao | null>(null);
  const [gelo, setGelo] = useState<"com" | "sem">("com");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (produto) {
      setQtd(1);
      setAds([]);
      setRems([]);
      setObs("");
      setEscolha(null);
      setGelo("com");
    }
  }, [produto]);

  if (!produto) return null;

  const dose = isDoseProduto(produto.nome, produto.categoria);
  const precisaEscolha = produto.tipo === "escolher";
  const unit = produto.preco + ads.reduce((a, b) => a + b.preco, 0) + (escolha?.preco ?? 0);
  const pode = !precisaEscolha || !!escolha;
  const desc = descricaoExibida(produto.descricao, produto.nome, produto.categoria);

  const confirmar = () => {
    if (!pode) return;
    const obsParts = [obs.trim()];
    if (dose) obsParts.unshift(gelo === "sem" ? "Sem gelo" : "Com gelo");
    onAdd({
      uid: Math.random().toString(36).slice(2),
      produto,
      qtd,
      adicionais: ads,
      removidos: rems,
      escolha,
      obs: obsParts.filter(Boolean).join(" · "),
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} wide closeOnBackdrop={false}>
      <div className="overflow-hidden">
        <div className="relative w-full aspect-[16/10] bg-surface-sunken border-b border-line">
          <img
            src={fotoSrc(produto.foto) || FOTO_PLACEHOLDER}
            alt={produto.nome}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => fallbackFoto(e, produto.nome, produto.categoria)}
          />
          <div className="absolute top-3 left-3">
            <Badge tone="brass">{produto.categoria}</Badge>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line-strong pb-3">
            <h3 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-text leading-tight">
              {produto.nome}
            </h3>
            <span className="font-mono text-lg font-extrabold text-brand-ink shrink-0">
              {BRL(produto.preco)}
            </span>
          </div>

          {desc && <p className="text-xs sm:text-sm text-text-muted leading-relaxed">{desc}</p>}

          {dose && (
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted mb-2">
                Serviço do gelo
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "com" as const, label: "Com gelo" },
                    { id: "sem" as const, label: "Sem gelo" },
                  ] as const
                ).map((g) => {
                  const ativo = gelo === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGelo(g.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border px-3.5 h-10 text-xs font-semibold transition-colors",
                        ativo
                          ? "border-brand bg-brand-surface text-brand-ink"
                          : "border-line-strong bg-surface text-text-muted hover:text-text",
                      )}
                    >
                      {ativo ? <Check size={14} weight="bold" /> : <Plus size={14} />}
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {precisaEscolha && (
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-ink mb-2">
                Escolha obrigatória
              </p>
              <div className="space-y-1.5">
                {produto.adicionais.map((a) => {
                  const ativo = escolha?.id === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setEscolha(a)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-sm border px-3.5 py-3 text-left transition-colors",
                        ativo
                          ? "border-brand bg-brand-surface"
                          : "border-line-strong bg-surface hover:bg-surface-sunken",
                      )}
                    >
                      <span
                        className={cn(
                          "grid place-items-center size-4 rounded-xs border shrink-0",
                          ativo ? "border-brand bg-brand text-brand-contrast" : "border-line-strong",
                        )}
                      >
                        {ativo && <Check size={11} weight="bold" />}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-text">{a.nome}</span>
                      <span className="font-mono text-xs text-text-muted">
                        {a.preco > 0 ? `+ ${BRL(a.preco)}` : "incluso"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!precisaEscolha && produto.adicionais.length > 0 && (
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted mb-2">
                Adicionais
              </p>
              <div className="flex flex-wrap gap-2">
                {produto.adicionais.map((a) => {
                  const on = ads.some((x) => x.id === a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() =>
                        setAds((x) => (on ? x.filter((y) => y.id !== a.id) : [...x, a]))
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border px-3 h-10 text-xs font-semibold transition-colors",
                        on
                          ? "border-brand bg-brand-surface text-brand-ink"
                          : "border-line-strong bg-surface text-text-muted hover:text-text",
                      )}
                    >
                      {on ? <Check size={13} weight="bold" /> : <Plus size={13} />}
                      <span>{a.nome}</span>
                      <span className="font-mono text-[11px]">+{BRL(a.preco)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {produto.removiveis.length > 0 && (
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-status-danger-ink mb-2">
                Retirar ingrediente
              </p>
              <div className="flex flex-wrap gap-2">
                {produto.removiveis.map((r) => {
                  const on = rems.includes(r.nome);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        setRems((x) => (on ? x.filter((y) => y !== r.nome) : [...x, r.nome]))
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border px-3 h-9 text-xs font-semibold transition-colors",
                        on
                          ? "border-status-danger-border bg-status-danger-surface text-status-danger-ink"
                          : "border-line-strong bg-surface text-text-muted hover:text-text",
                      )}
                    >
                      <Minus size={12} weight="bold" /> sem {r.nome.toLowerCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Input value={obs} onChange={setObs} placeholder="Observação para a cozinha (opcional)" />

          <div className="flex items-center justify-between gap-4 pt-2 border-t border-line">
            <Qtd valor={qtd} onChange={setQtd} />
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] font-bold text-text-muted">
                Subtotal
              </p>
              <p className="font-mono text-2xl font-extrabold text-text leading-none mt-0.5">
                {BRL(unit * qtd)}
              </p>
            </div>
          </div>

          <Btn full size="lg" onClick={confirmar} disabled={!pode}>
            {pode ? (
              <>Adicionar ao pedido · {BRL(unit * qtd)}</>
            ) : (
              "Selecione uma opção obrigatória"
            )}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
