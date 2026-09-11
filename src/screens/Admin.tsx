import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown, ArrowUp, Boxes, ChevronDown, ChevronRight, Camera, ChartNoAxesColumn, CircleAlert, Copy, Download, Eye, EyeOff,
  FileText, LayoutGrid, Link2, Pencil, Plus, QrCode, Receipt, Trash2,
  TrendingUp, Trophy, UserPlus, Users, UtensilsCrossed,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import { OpsShell } from "../components/OpsShell";
import { Badge, Btn, Input, Modal } from "../components/ui";
import { ir } from "../router";
import { api } from "../lib/api";
import { descricaoPadrao } from "../lib/descricao";
import { imprimirRelatorioPdf } from "../lib/print";
import { CATEGORIAS } from "../lib/data";
import type { Produto, TipoProduto } from "../lib/types";
import { faturamentoSemana, pagoSessao, totalSessao, usePub } from "../store/usePub";
import { BRL } from "../lib/utils";
import { cn } from "../utils/cn";

const ABAS = [
  { id: "painel", label: "Dashboard", icon: ChartNoAxesColumn },
  { id: "cardapio", label: "Cardápio", icon: UtensilsCrossed },
  { id: "mesas", label: "Mesas", icon: QrCode },
  { id: "garcons", label: "Garçons", icon: Users },
  { id: "funcoes", label: "Funções", icon: LayoutGrid },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

/** YYYY-MM-DD no fuso local (evita toISOString puxar dia anterior em -03) */
function dataLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


export default function Admin() {
  const auth = usePub((s) => s.auth);
  const hydrateCardapio = usePub((s) => s.hydrateCardapio);
  const hydrateMesas = usePub((s) => s.hydrateMesas);
  useEffect(() => {
    void hydrateCardapio();
    void hydrateMesas();
  }, [hydrateCardapio, hydrateMesas]);

  useEffect(() => {
    if (!auth) {
      ir("/login");
      return;
    }
    if (auth.role !== "admin") {
      ir(auth.role === "cozinha" ? "/cozinha" : auth.role === "caixa" ? "/caixa" : "/login");
    }
  }, [auth]);

  const [aba, setAba] = useState<AbaId>("painel");

  const extras = (
    <nav className="flex flex-wrap items-center gap-1 rounded-2xl bg-black/35 border border-white/[0.08] p-1">
      {ABAS.map((a) => (
        <button
          key={a.id}
          onClick={() => setAba(a.id)}
          className={cn(
            "btn-press relative flex items-center gap-1.5 rounded-xl px-3 h-9 text-xs font-bold cursor-pointer transition-colors",
            aba === a.id ? "text-zinc-950" : "text-stone-400 hover:text-white"
          )}
        >
          {aba === a.id && (
            <motion.span layoutId="adm-aba" className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500" transition={{ type: "spring", stiffness: 420, damping: 32 }} />
          )}
          <a.icon className="relative z-10 size-3.5" />
          <span className="relative z-10 hidden sm:inline">{a.label}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <OpsShell ativo="admin" kicker="gestão · admin" titulo={<>Comando <span className="text-gradient">do pub</span></>} extra={extras}>
      <AnimatePresence mode="wait">
        <motion.div
          key={aba}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {aba === "painel" && <Painel />}
          {aba === "cardapio" && <Cardapio />}
          {aba === "mesas" && <Mesas />}
          {aba === "garcons" && <Garcons />}
          {aba === "funcoes" && <Funcoes />}
        </motion.div>
      </AnimatePresence>
    </OpsShell>
  );
}

/* ================= DASHBOARD ================= */
function Painel() {
  const sessoes = usePub((s) => s.sessoes);
  const pedidos = usePub((s) => s.pedidos);
  const produtos = usePub((s) => s.produtos);

  const fechadas = sessoes.filter((s) => s.status === "fechada");
  const fatHoje = fechadas.reduce((a, s) => a + pagoSessao(s), 0) + 620;
  const emAberto = sessoes
    .filter((s) => s.status === "aberta")
    .reduce((a, s) => a + totalSessao(pedidos, s.id), 0);
  const qtdPedidos = pedidos.length + 87;
  const ticket = qtdPedidos ? (fatHoje + emAberto) / qtdPedidos : 0;

  const semana = faturamentoSemana(sessoes);
  const maxSemana = Math.max(...semana.map((d) => d.valor));

  const top = [...produtos].sort((a, b) => b.vendidos - a.vendidos).slice(0, 5);
  const maxTop = top[0]?.vendidos || 1;

  const cards = [
    { icon: CircleAlert, label: "faturamento hoje", valor: BRL(fatHoje), sub: "sessões fechadas + base", tom: "from-amber-400/25 text-amber-300" },
    { icon: Users, label: "consumo em aberto", valor: BRL(emAberto), sub: "comandas no salão", tom: "from-sky-400/25 text-sky-300" },
    { icon: Receipt, label: "pedidos no dia", valor: String(qtdPedidos), sub: "desde a abertura", tom: "from-violet-400/25 text-violet-300" },
    { icon: TrendingUp, label: "ticket médio", valor: BRL(ticket), sub: "por pedido", tom: "from-lime-400/25 text-lime-300" },
  ];

  return (
    <div className="space-y-4">
      {/* métricas */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="glass rounded-3xl p-5 relative overflow-hidden"
          >
            <div className={cn("glow-orb absolute -top-10 -right-10 size-24 bg-gradient-to-br to-transparent opacity-30", c.tom.split(" ")[0])} />
            <c.icon className={cn("size-5", c.tom.split(" ")[1])} />
            <p className="mt-3 font-display text-4xl sm:text-5xl text-white leading-none">{c.valor}</p>
            <p className="mt-1.5 text-[10px] uppercase tracking-[0.22em] font-bold text-stone-400">{c.label}</p>
            <p className="text-[10px] text-stone-600">{c.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* gráfico semana */}
        <div className="glass-deep noise rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-3xl text-white">Semana do pub</h3>
            <Badge tone="zinc">faturamento / dia</Badge>
          </div>
          <div className="flex items-end gap-2.5 sm:gap-4 h-44">
            {semana.map((d, i) => (
              <div key={d.dia} className="flex-1 flex flex-col items-center gap-2">
                <span className="font-mono text-[10px] text-stone-500 tabular">{BRL(d.valor).replace("R$", "").trim()}</span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(6, (d.valor / maxSemana) * 100)}%` }}
                  transition={{ delay: 0.15 + i * 0.06, type: "spring", stiffness: 140, damping: 18 }}
                  className={cn(
                    "w-full rounded-t-xl",
                    d.dia === "Hoje"
                      ? "bg-gradient-to-t from-amber-500 to-amber-300 shadow-[0_0_28px_-4px_rgba(255,150,20,0.5)]"
                      : "bg-white/[0.09]"
                  )}
                />
                <span className={cn("text-[10px] font-bold uppercase tracking-wider", d.dia === "Hoje" ? "text-amber-300" : "text-stone-500")}>{d.dia}</span>
              </div>
            ))}
          </div>
        </div>

        {/* top produtos */}
        <div className="glass-deep noise rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-3xl text-white flex items-center gap-2">
              <Trophy className="size-5 text-amber-400" /> Campeões de venda
            </h3>
            <Badge tone="amber">top 5</Badge>
          </div>
          <div className="space-y-3">
            {top.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <img src={p.foto} alt="" className="size-11 rounded-xl object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white truncate">
                      <span className="font-mono text-[11px] text-stone-500 mr-1.5">#{i + 1}</span>
                      {p.nome}
                    </p>
                    <span className="font-mono text-xs text-stone-400 shrink-0">{p.vendidos} un.</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(p.vendidos / maxTop) * 100}%` }}
                      transition={{ delay: 0.2 + i * 0.07, type: "spring", stiffness: 120, damping: 18 }}
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= CARDÁPIO (CRUD) ================= */
function Cardapio() {
  const produtos = usePub((s) => s.produtos);
  const categorias = usePub((s) => s.categorias);
  const toggle = usePub((s) => s.toggleProduto);
  const remover = usePub((s) => s.removerProduto);
  const addCategoria = usePub((s) => s.addCategoria);
  const renameCategoria = usePub((s) => s.renameCategoria);
  const removeCategoria = usePub((s) => s.removeCategoria);
  const moverCategoria = usePub((s) => s.moverCategoria);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [novaCat, setNovaCat] = useState("");
  /** ids de categorias expandidas — várias podem ficar abertas */
  const [abertas, setAbertas] = useState<Set<number>>(() => new Set());
  const [orfaosAberto, setOrfaosAberto] = useState(true);

  const catsOrdenadas = [...categorias].sort((a, b) => a.ordem - b.ordem);
  const nomesCat = new Set(catsOrdenadas.map((c) => c.nome));
  const orfaos = produtos.filter((p) => !nomesCat.has(p.categoria));

  const toggleCat = (id: number) => {
    setAbertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cardProduto = (p: Produto) => (
    <motion.article
      key={p.id}
      layout
      className={cn(
        "rounded-2xl bg-black/35 border border-white/[0.07] overflow-hidden transition-opacity",
        !p.ativo && "opacity-55"
      )}
    >
      <div className="flex gap-3.5 p-3.5">
        <img src={p.foto} alt="" className="size-16 sm:size-20 rounded-2xl object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-white text-sm leading-tight truncate">{p.nome}</p>
            <span className="font-mono text-xs font-bold text-amber-300 shrink-0">{BRL(p.preco)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge tone={p.tipo === "escolher" ? "sky" : p.tipo === "personalizavel" ? "violet" : "zinc"}>
              {p.tipo === "escolher" ? "escolher" : p.tipo === "personalizavel" ? "personalizável" : "simples"}
            </Badge>
            {p.estoque !== null && (
              <Badge tone={p.estoque <= 8 ? "rose" : "zinc"}>est. {p.estoque}</Badge>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => toggle(p.id)}
              title={p.ativo ? "Desativar" : "Ativar"}
              className={cn(
                "btn-press grid place-items-center size-8 rounded-lg border cursor-pointer transition-colors",
                p.ativo
                  ? "bg-lime-400/10 border-lime-400/30 text-lime-300"
                  : "bg-white/[0.05] border-white/10 text-stone-500"
              )}
            >
              {p.ativo ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setEditando(p)}
              title="Editar"
              className="btn-press grid place-items-center size-8 rounded-lg bg-white/[0.05] border border-white/10 text-stone-300 hover:text-amber-300 cursor-pointer"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => remover(p.id)}
              title="Excluir"
              className="btn-press grid place-items-center size-8 rounded-lg bg-white/[0.05] border border-white/10 text-stone-400 hover:text-rose-300 cursor-pointer"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl text-white leading-none">Cardápio</h3>
          <p className="mt-1 text-[11px] text-stone-500">
            Toque na categoria para expandir · ↑↓ reordena · {produtos.length} produtos ·{" "}
            {produtos.filter((p) => p.ativo).length} ativos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!novaCat.trim()) return;
              addCategoria(novaCat);
              setNovaCat("");
            }}
          >
            <Input value={novaCat} onChange={setNovaCat} placeholder="Nova categoria" className="w-36 sm:w-48" />
            <Btn
              size="sm"
              onClick={() => {
                if (novaCat.trim()) {
                  addCategoria(novaCat);
                  setNovaCat("");
                }
              }}
            >
              <Plus className="size-4" /> Categoria
            </Btn>
          </form>
          <Btn size="sm" onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Produto
          </Btn>
        </div>
      </div>

      <ul className="space-y-2.5">
        {catsOrdenadas.map((c, i) => {
          const lista = produtos.filter((p) => p.categoria === c.nome);
          const open = abertas.has(c.id);
          return (
            <li key={c.id} className="rounded-2xl border border-white/[0.08] bg-black/30 overflow-hidden">
              {/* cabeçalho da categoria — ordem + expandir */}
              <div className="flex flex-wrap items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleCat(c.id)}
                  className="btn-press flex items-center gap-2 flex-1 min-w-[10rem] text-left cursor-pointer rounded-xl hover:bg-white/[0.04] px-1.5 py-1 -ml-1"
                  aria-expanded={open}
                >
                  <span className="grid place-items-center size-7 rounded-lg bg-white/[0.05] border border-white/10 text-stone-400 shrink-0">
                    {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </span>
                  <span className="font-mono text-[10px] text-stone-600 w-4 tabular shrink-0">{i + 1}</span>
                  <span className="font-semibold text-sm sm:text-base text-white truncate">{c.nome}</span>
                  <Badge tone="zinc">{lista.length}</Badge>
                </button>

                <button
                  type="button"
                  title="Subir"
                  disabled={i === 0}
                  onClick={() => moverCategoria(c.id, -1)}
                  className="btn-press grid place-items-center size-8 rounded-lg bg-white/[0.05] border border-white/10 text-stone-300 hover:text-amber-300 disabled:opacity-30 cursor-pointer shrink-0"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  title="Descer"
                  disabled={i === catsOrdenadas.length - 1}
                  onClick={() => moverCategoria(c.id, 1)}
                  className="btn-press grid place-items-center size-8 rounded-lg bg-white/[0.05] border border-white/10 text-stone-300 hover:text-amber-300 disabled:opacity-30 cursor-pointer shrink-0"
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  title="Renomear"
                  onClick={() => {
                    const n = prompt("Nome da categoria:", c.nome);
                    if (n && n.trim()) renameCategoria(c.id, n);
                  }}
                  className="btn-press grid place-items-center size-8 rounded-lg bg-white/[0.05] border border-white/10 text-stone-300 hover:text-amber-300 cursor-pointer shrink-0"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  title={lista.length > 0 ? `Excluir categoria e ${lista.length} produto(s)` : "Excluir categoria"}
                  onClick={() => removeCategoria(c.id)}
                  className="btn-press grid place-items-center size-8 rounded-lg bg-white/[0.05] border border-white/10 text-stone-400 hover:text-rose-300 cursor-pointer shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-0.5 border-t border-white/[0.06]">
                      <div className="flex justify-end mb-2.5 pt-2">
                        <Btn size="sm" variant="ghost" onClick={() => setNovoAberto(true)}>
                          <Plus className="size-3.5" /> Produto nesta categoria
                        </Btn>
                      </div>
                      {lista.length === 0 ? (
                        <p className="text-xs text-stone-500 py-5 text-center border border-dashed border-white/10 rounded-2xl">
                          Nenhum produto — adicione o primeiro
                        </p>
                      ) : (
                        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                          {lista.map((p) => cardProduto(p))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}

        {orfaos.length > 0 && (
          <li className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] overflow-hidden">
            <button
              type="button"
              onClick={() => setOrfaosAberto((v) => !v)}
              className="btn-press flex w-full items-center gap-2 px-3 py-2.5 text-left cursor-pointer"
            >
              <span className="grid place-items-center size-7 rounded-lg bg-white/[0.05] border border-white/10 text-rose-300">
                {orfaosAberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </span>
              <span className="font-semibold text-sm text-rose-200">Sem categoria</span>
              <Badge tone="rose">{orfaos.length}</Badge>
            </button>
            <AnimatePresence initial={false}>
              {orfaosAberto && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {orfaos.map((p) => cardProduto(p))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        )}
      </ul>

      <ProdutoForm produto={editando} onClose={() => setEditando(null)} />
      <ProdutoForm novo={novoAberto} onClose={() => setNovoAberto(false)} />
    </div>
  );
}

function ProdutoForm({ produto, novo, onClose }: { produto?: Produto | null; novo?: boolean; onClose: () => void }) {
  const produtos = usePub((s) => s.produtos);
  const cats = usePub((s) => s.categorias);
  const upsert = usePub((s) => s.upsertProduto);
  const open = !!produto || !!novo;
  const editando = !!produto;
  const nomesCat = [...cats].sort((a, b) => a.ordem - b.ordem).map((c) => c.nome);
  const catPadrao = nomesCat[0] || CATEGORIAS[0];

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [categoria, setCategoria] = useState(catPadrao);
  const [tipo, setTipo] = useState<TipoProduto>("simples");
  const [foto, setFoto] = useState("");
  const [adicionais, setAdicionais] = useState("");
  const [removiveis, setRemoviveis] = useState("");
  const [controlaEstoque, setControlaEstoque] = useState(false);
  const [estoqueQtd, setEstoqueQtd] = useState("0");
  const [estoqueMin, setEstoqueMin] = useState("5");
  const [salvando, setSalvando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const produtoId = produto?.id ?? null;
  useEffect(() => {
    if (produto) {
      setNome(produto.nome);
      setDescricao(produto.descricao);
      setPreco(String(produto.preco));
      setCategoria(produto.categoria);
      setTipo(produto.tipo);
      setFoto(produto.foto);
      setAdicionais(
        (produto.adicionais || []).map((a) => `${a.nome}:${a.preco}`).join(", ")
      );
      setRemoviveis((produto.removiveis || []).map((r) => r.nome).join(", "));
      const tem = produto.estoque !== null && produto.estoque !== undefined;
      setControlaEstoque(tem);
      setEstoqueQtd(tem ? String(produto.estoque) : "0");
      setEstoqueMin("5");
      setSalvando(false);
    } else if (novo) {
      setNome("");
      setDescricao("");
      setPreco("");
      setCategoria(catPadrao);
      setTipo("simples");
      setFoto("");
      setAdicionais("");
      setRemoviveis("");
      setControlaEstoque(false);
      setEstoqueQtd("0");
      setEstoqueMin("5");
      setSalvando(false);
    }
    // só re-hidrata ao abrir outro produto (id) — evita fechar/reset no meio da edição
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId, novo]);

  /* upload local → dataURL otimizado (espelha POST /api/admin/upload-foto com sharp) */
  const arquivo = (f: File) => {
    const img = document.createElement("img");
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const max = 960;
      const esc = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * esc);
      canvas.height = Math.round(img.height * esc);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setFoto(canvas.toDataURL("image/webp", 0.88));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const salvar = async () => {
    const precoN = Number(preco.replace(",", "."));
    if (!nome.trim() || !(precoN > 0) || salvando) return;
    const existentesAds = produto?.adicionais || [];
    const norm = (s: string) => s.trim().toLowerCase();
    const ads = adicionais
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const colon = s.lastIndexOf(":");
        const n = (colon >= 0 ? s.slice(0, colon) : s).trim();
        const pr = colon >= 0 ? s.slice(colon + 1) : "0";
        const prev = existentesAds.find((a) => norm(a.nome) === norm(n));
        return {
          id: prev?.id ?? `new-${Math.random().toString(36).slice(2, 8)}`,
          nome: n,
          preco: Number(String(pr).replace(",", ".")) || 0,
        };
      });
    const rems = removiveis
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => ({ id: Math.random().toString(36).slice(2, 8), nome: n }));

    setSalvando(true);
    try {
      await upsert({
        id: produto ? produto.id : Math.max(0, ...produtos.map((p) => p.id)) + 1,
        nome: nome.trim(),
        descricao: descricao.trim() || descricaoPadrao(nome.trim(), categoria),
        preco: precoN,
        categoria,
        foto:
          foto ||
          "https://images.pexels.com/photos/18987002/pexels-photo-18987002.jpeg?auto=compress&cs=tinysrgb&w=900",
        tipo,
        adicionais: ads,
        removiveis: tipo === "personalizavel" ? rems : [],
        ativo: produto ? produto.ativo : true,
        estoque: controlaEstoque ? Math.max(0, Number(estoqueQtd) || 0) : null,
        vendidos: produto ? produto.vendidos : 0,
      });
      onClose();
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar produto");
    } finally {
      setSalvando(false);
    }
  };

  const TIPOS: { id: TipoProduto; label: string; dica: string }[] = [
    { id: "simples", label: "Adicionar", dica: "sem opções — vai direto pro carrinho" },
    { id: "personalizavel", label: "Adicionar + Personalizar", dica: "adicionais multi + removíveis" },
    { id: "escolher", label: "Escolher", dica: "cliente marca UMA opção (tamanho/sabor)" },
  ];

  return (
    <Modal open={open} onClose={onClose} wide closeOnBackdrop={false}>
      <div className="p-5 sm:p-7">
        <h3 className="font-display text-4xl text-white mb-5">{editando ? "Editar produto" : "Novo produto"}</h3>

        <div className="grid sm:grid-cols-[220px_1fr] gap-5">
          {/* foto */}
          <div>
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-black/40 border border-dashed border-white/15">
              {foto ? (
                <img src={foto} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-center p-4">
                  <div>
                    <Camera className="size-7 text-stone-600 mx-auto" />
                    <p className="text-[11px] text-stone-500 mt-2">Sem foto</p>
                  </div>
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="btn-press absolute inset-x-2.5 bottom-2.5 h-9 rounded-xl bg-black/55 backdrop-blur border border-white/12 text-[11px] font-bold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-black/75"
              >
                <Camera className="size-3.5" /> Enviar foto (WebP ~960px)
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && arquivo(e.target.files[0])} />
            </div>
            <div className="relative mt-2">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-stone-500" />
              <input value={foto.startsWith("data:") ? "" : foto} onChange={(e) => setFoto(e.target.value)} placeholder="…ou cole um link https://" className="w-full h-10 rounded-xl bg-black/40 border border-white/12 pl-8.5 pr-3 text-[11px] text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50" />
            </div>
            {foto.startsWith("data:") && <p className="mt-1.5 text-[10px] text-lime-300 font-mono">webp HQ · ~960px · salvo no banco</p>}
          </div>

          {/* campos */}
          <div className="space-y-3">
            <Input value={nome} onChange={setNome} placeholder="Nome do produto" />
            <Input value={descricao} onChange={setDescricao} placeholder="Descrição curta" />
            <div className="grid grid-cols-2 gap-3">
              <Input value={preco} onChange={setPreco} placeholder="0,00" prefix="R$" type="number" />
              <div className="relative">
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full h-12 rounded-2xl bg-black/40 border border-white/12 px-4 text-sm text-white focus:outline-none focus:border-amber-400/60 appearance-none cursor-pointer">
                  {(nomesCat.length ? nomesCat : CATEGORIAS).map((c) => <option key={c} value={c} className="bg-coal-900">{c}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={controlaEstoque}
                  onChange={(e) => setControlaEstoque(e.target.checked)}
                  className="size-4 rounded border-white/20 accent-amber-400"
                />
                <span className="text-sm text-white font-semibold">Controlar estoque</span>
                <span className="text-[11px] text-stone-500 hidden sm:inline">baixa automática a cada pedido</span>
              </label>
              {controlaEstoque && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1 font-bold">Quantidade</p>
                    <Input value={estoqueQtd} onChange={setEstoqueQtd} placeholder="0" type="number" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1 font-bold">Alerta mínimo</p>
                    <Input value={estoqueMin} onChange={setEstoqueMin} placeholder="5" type="number" />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTipo(t.id)}
                  className={cn(
                    "btn-press w-full flex items-center gap-3 rounded-2xl border p-3 text-left cursor-pointer transition-all",
                    tipo === t.id ? "border-amber-400/55 bg-amber-400/[0.08]" : "border-white/10 bg-white/[0.02] hover:border-white/25"
                  )}
                >
                  <span className={cn("grid place-items-center size-4.5 rounded-full border-2", tipo === t.id ? "border-amber-300" : "border-stone-600")}>
                    {tipo === t.id && <span className="size-2 rounded-full bg-amber-300" />}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-white">{t.label}</span>
                    <span className="block text-[11px] text-stone-500">{t.dica}</span>
                  </span>
                </button>
              ))}
            </div>

            <Input value={adicionais} onChange={setAdicionais} placeholder="Adicionais: Nome:preço, Bacon:5, Queijo:3.5" />
            {tipo === "personalizavel" && (
              <Input value={removiveis} onChange={setRemoviveis} placeholder="Removíveis: Cebola, Maionese…" />
            )}
            <Btn
              full
              size="lg"
              onClick={() => void salvar()}
              disabled={salvando || !nome.trim() || !(Number(preco.replace(",", ".")) > 0)}
            >
              {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar produto"}
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}


/* ================= GARÇONS ================= */
type GarcomRow = {
  id: number;
  nome: string;
  token: string;
  ativo: boolean;
  criado_em?: string;
  entregas?: number;
};

function Garcons() {
  const [lista, setLista] = useState<GarcomRow[]>([]);
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    try {
      setErro(null);
      const rows = await api.listGarcons();
      setLista(
        (rows || []).map((g) => ({
          id: Number(g.id),
          nome: String(g.nome),
          token: String(g.token),
          ativo: g.ativo !== false,
          criado_em: g.criado_em,
          entregas: Number(g.entregas || 0),
        }))
      );
    } catch (e: any) {
      setErro(e.message || "Falha ao listar garçons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const linkGarcom = (token: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/#/garcom/${token}`;
  };

  const criar = async () => {
    const n = nome.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      await api.criarGarcom(n);
      setNome("");
      await carregar();
    } catch (e: any) {
      alert(e.message || "Erro ao criar garçom");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (g: GarcomRow) => {
    setBusy(true);
    try {
      await api.setGarcomAtivo(g.id, !g.ativo);
      await carregar();
    } catch (e: any) {
      alert(e.message || "Erro ao atualizar");
    } finally {
      setBusy(false);
    }
  };

  const remover = async (g: GarcomRow) => {
    if (!confirm(`Remover o garçom "${g.nome}"? O link dele deixa de funcionar.`)) return;
    setBusy(true);
    try {
      await api.removerGarcom(g.id);
      await carregar();
    } catch (e: any) {
      alert(e.message || "Erro ao remover");
    } finally {
      setBusy(false);
    }
  };

  const copiar = async (g: GarcomRow) => {
    try {
      await navigator.clipboard.writeText(linkGarcom(g.token));
      setCopiado(g.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      prompt("Copie o link do garçom:", linkGarcom(g.token));
    }
  };

  return (
    <div className="space-y-6">
      <section className="glass rounded-3xl p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display text-2xl text-white leading-none">Garçons</h3>
            <p className="mt-1 text-[11px] text-stone-500">
              Cada um recebe um link único (UUID). Abre a fila de pedidos prontos no celular.
            </p>
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void criar();
            }}
          >
            <Input value={nome} onChange={setNome} placeholder="Nome do garçom" className="w-44 sm:w-56" />
            <Btn size="sm" disabled={busy || !nome.trim()} onClick={() => void criar()}>
              <UserPlus className="size-4" /> Cadastrar
            </Btn>
          </form>
        </div>

        {erro && (
          <p className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {erro}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-stone-500 py-8 text-center">Carregando…</p>
        ) : lista.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-stone-400">Nenhum garçom cadastrado.</p>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Cadastre um garçom e abra o link dele no celular. Só quem entrega pelo link move o pedido para o caixa (status entregue + valor na sessão).
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lista.map((g) => (
              <li
                key={g.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-3 bg-black/30",
                  g.ativo ? "border-white/[0.08]" : "border-white/[0.05] opacity-70"
                )}
              >
                <div className="flex-1 min-w-[10rem]">
                  <p className="font-semibold text-white text-sm">{g.nome}</p>
                  <p className="font-mono text-[10px] text-stone-500 truncate max-w-[16rem] sm:max-w-md">
                    {g.token}
                  </p>
                  <p className="text-[10px] text-stone-600 mt-0.5">
                    {g.entregas ?? 0} entrega{(g.entregas ?? 0) === 1 ? "" : "s"}
                    {!g.ativo && " · desativado"}
                  </p>
                </div>
                <Badge tone={g.ativo ? "lime" : "zinc"}>{g.ativo ? "ativo" : "off"}</Badge>
                <button
                  type="button"
                  title="Copiar link"
                  onClick={() => void copiar(g)}
                  className="btn-press grid place-items-center size-9 rounded-lg bg-white/[0.05] border border-white/10 text-stone-300 hover:text-amber-300 cursor-pointer"
                >
                  {copiado === g.id ? <span className="text-[10px] font-bold text-lime-300">OK</span> : <Copy className="size-3.5" />}
                </button>
                <button
                  type="button"
                  title="Abrir fila"
                  onClick={() => ir(`/garcom/${g.token}`)}
                  className="btn-press grid place-items-center size-9 rounded-lg bg-white/[0.05] border border-white/10 text-stone-300 hover:text-amber-300 cursor-pointer"
                >
                  <Link2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  title={g.ativo ? "Desativar" : "Ativar"}
                  disabled={busy}
                  onClick={() => void toggle(g)}
                  className={cn(
                    "btn-press grid place-items-center size-9 rounded-lg border cursor-pointer",
                    g.ativo
                      ? "bg-lime-400/10 border-lime-400/30 text-lime-300"
                      : "bg-white/[0.05] border-white/10 text-stone-500"
                  )}
                >
                  {g.ativo ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>
                <button
                  type="button"
                  title="Remover"
                  disabled={busy}
                  onClick={() => void remover(g)}
                  className="btn-press grid place-items-center size-9 rounded-lg bg-white/[0.05] border border-white/10 text-stone-400 hover:text-rose-300 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-stone-500 text-center">
        O link do garçom é público no token — quem tiver a URL acessa a fila de prontos. Desative ou apague se o celular for perdido.
      </p>
    </div>
  );
}

/* ================= MESAS ================= */
function mesaClienteUrl(token: string) {
  if (typeof window === "undefined") return `#/mesa/${token}`;
  const base = `${window.location.origin}${window.location.pathname || "/"}`.replace(/\/$/, "");
  return `${base}#/mesa/${token}`;
}

function Mesas() {
  const mesas = usePub((s) => s.mesas);
  const sessoes = usePub((s) => s.sessoes);
  const pedidos = usePub((s) => s.pedidos);
  const fecharSessao = usePub((s) => s.fecharSessao);
  const [copiado, setCopiado] = useState<number | null>(null);

  const copiarLink = async (token: string, id: number) => {
    const url = mesaClienteUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 2000);
    } catch {
      prompt("Copie o link da mesa:", url);
    }
  };

  return (
    <div>
      <p className="text-sm text-stone-400 mb-4 max-w-xl">
        Cada mesa tem um link/QR fixo. Imprima o QR e cole na mesa — o cliente escaneia e já entra no cardápio com o número certo. Sem menu de equipe no celular do cliente.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {mesas.map((m) => {
          const s = sessoes.find((x) => x.mesaId === m.id && x.status === "aberta");
          const consumo = s ? totalSessao(pedidos, s.id) : 0;
          const url = mesaClienteUrl(m.token);
          return (
            <div
              key={m.id}
              className={cn(
                "relative glass rounded-3xl p-4 sm:p-5 text-center overflow-hidden",
                s && "ring-brand"
              )}
            >
              <div className="flex items-center justify-between">
                <Badge tone={s ? "amber" : "zinc"} pulse={!!s}>
                  {s ? "ocupada" : "livre"}
                </Badge>
                <span className="font-mono text-[10px] text-stone-600">#{String(m.numero).padStart(2, "0")}</span>
              </div>
              <p className="font-display text-4xl sm:text-5xl text-white mt-3 leading-none">{m.numero}</p>
              <p className="text-[10px] uppercase tracking-[0.24em] text-stone-500 mt-1">{m.nome}</p>

              <div className="mt-4 mx-auto w-fit rounded-2xl bg-white p-2.5">
                <QRCodeSVG value={url} size={108} fgColor="#131009" level="M" includeMargin={false} />
              </div>

              <p className="mt-3 font-mono text-[10px] text-stone-500 break-all leading-snug px-1">{url}</p>

              <div className="mt-3 flex flex-col gap-1.5">
                <Btn size="sm" full onClick={() => void copiarLink(m.token, m.id)}>
                  <Copy className="size-3.5" /> {copiado === m.id ? "Copiado!" : "Copiar link da mesa"}
                </Btn>
                {s ? (
                  <>
                    <p className="font-mono text-sm text-amber-300 py-1">{BRL(consumo)} consumo</p>
                    <Btn size="sm" variant="danger" full onClick={() => fecharSessao(s.id, "dinheiro")}>
                      Liberar mesa
                    </Btn>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= ESTOQUE (por categoria) ================= */
function Estoque() {
  const produtos = usePub((s) => s.produtos);
  const categorias = usePub((s) => s.categorias);
  const setEstoque = usePub((s) => s.setEstoque);
  const ativar = usePub((s) => s.ativarControleEstoque);
  const hydrateCardapio = usePub((s) => s.hydrateCardapio);
  const [abertas, setAbertas] = useState<Set<number | string>>(() => new Set());

  useEffect(() => {
    void hydrateCardapio();
  }, [hydrateCardapio]);

  const pedirQtd = (titulo: string, atual?: number) => {
    const raw = window.prompt(titulo, atual != null ? String(atual) : "10");
    if (raw == null) return null;
    const n = Math.floor(Number(String(raw).replace(",", ".")));
    if (!Number.isFinite(n) || n < 0) {
      alert("Quantidade inválida");
      return null;
    }
    return n;
  };

  const ordemCat = useMemo(() => {
    return [...categorias].sort((a, b) => a.ordem - b.ordem);
  }, [categorias]);

  const grupos = useMemo(() => {
    const byName = new Map<string, typeof produtos>();
    for (const p of produtos) {
      const k = p.categoria || "Outros";
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k)!.push(p);
    }
    const ordered: { id: number | string; nome: string; itens: typeof produtos }[] = [];
    for (const c of ordemCat) {
      const itens = byName.get(c.nome) || [];
      if (itens.length) {
        ordered.push({ id: c.id, nome: c.nome, itens });
        byName.delete(c.nome);
      }
    }
    for (const [nome, itens] of byName) {
      if (itens.length) ordered.push({ id: nome, nome, itens });
    }
    return ordered;
  }, [produtos, ordemCat]);

  useEffect(() => {
    if (abertas.size === 0 && grupos.length) {
      setAbertas(new Set(grupos.slice(0, 3).map((g) => g.id)));
    }
  }, [grupos]);

  const toggle = (id: number | string) => {
    setAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const controlados = produtos.filter((p) => p.estoque !== null);
  const baixos = controlados.filter((p) => (p.estoque ?? 0) <= 8);

  const linhaProduto = (p: (typeof produtos)[0]) => {
    const controla = p.estoque !== null;
    const q = p.estoque ?? 0;
    return (
      <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
        <img src={p.foto} alt="" className="size-12 rounded-xl object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{p.nome}</p>
          <p className="text-[10px] text-stone-500">
            {controla ? (
              <span className={q <= 8 ? "text-rose-300 font-bold" : "text-lime-300/90 font-mono"}>{q} un. em estoque</span>
            ) : (
              "sem controle"
            )}
          </p>
        </div>
        {controla ? (
          <div className="flex flex-wrap gap-1.5 justify-end">
            <button
              type="button"
              onClick={() => {
                const n = pedirQtd(`Quantas unidades ENTRARAM?\n(atual: ${q})`, 10);
                if (n != null) setEstoque(p.id, q + n);
              }}
              className="btn-press h-8 px-2.5 rounded-lg bg-lime-400/10 border border-lime-400/25 text-lime-300 text-[11px] font-bold cursor-pointer"
            >
              + entrada
            </button>
            <button
              type="button"
              onClick={() => {
                const n = pedirQtd("Definir estoque absoluto:", q);
                if (n != null) setEstoque(p.id, n);
              }}
              className="btn-press h-8 px-2.5 rounded-lg bg-white/[0.05] border border-white/10 text-stone-300 text-[11px] font-bold cursor-pointer"
            >
              definir
            </button>
            <button
              type="button"
              onClick={() => setEstoque(p.id, Math.max(0, q - 1))}
              className="btn-press h-8 px-2.5 rounded-lg bg-white/[0.05] border border-white/10 text-stone-400 text-[11px] font-bold cursor-pointer"
            >
              −1
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              const n = pedirQtd("Ativar estoque. Quantas unidades tem agora?", 20);
              if (n != null) ativar(p.id, n);
            }}
            className="btn-press h-9 px-3 rounded-xl border border-amber-400/35 bg-amber-400/10 text-amber-200 text-[11px] font-bold cursor-pointer"
          >
            Ativar + qtd
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {baixos.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-400/[0.07] p-4">
          <CircleAlert className="size-5 text-rose-300 shrink-0" />
          <p className="text-sm text-rose-200">
            <b>
              {baixos.length} {baixos.length === 1 ? "item" : "itens"} acabando:
            </b>{" "}
            {baixos.map((x) => `${x.nome} (${x.estoque})`).join(" · ")}
          </p>
        </div>
      )}

      {grupos.map((g) => {
        const open = abertas.has(g.id);
        const nCtrl = g.itens.filter((x) => x.estoque !== null).length;
        return (
          <section key={String(g.id)} className="glass rounded-3xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(g.id)}
              className="btn-press w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer hover:bg-white/[0.03]"
            >
              {open ? <ChevronDown className="size-4 text-amber-300" /> : <ChevronRight className="size-4 text-stone-500" />}
              <span className="font-display text-2xl text-white flex-1">{g.nome}</span>
              <Badge tone="zinc">
                {g.itens.length} · {nCtrl} c/ estoque
              </Badge>
            </button>
            {open && <div className="px-3 pb-3 space-y-2">{g.itens.map(linhaProduto)}</div>}
          </section>
        );
      })}

      <p className="text-[11px] text-stone-500 text-center">
        Pedidos na mesa dão baixa automática. Ative o controle e informe a quantidade colocada.
      </p>
    </div>
  );
}

/* ================= RELATÓRIO (API real) ================= */
function Relatorio() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return dataLocal(d);
  });
  const [to, setTo] = useState(() => dataLocal());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const out = await api.adminRelatorio(from, to);
      setData(out);
    } catch (e: any) {
      setErro(e.message || "Falha ao carregar relatório");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumo = data?.resumo || {};
  const contas = Array.isArray(data?.contas) ? data.contas : [];
  const porDia = Array.isArray(data?.porDia) ? data.porDia : [];
  const porForma = resumo.porFormaPagamento || {};
  const top = Array.isArray(resumo.topProdutos) ? resumo.topProdutos : [];
  const faturamento = Number(resumo.faturamento ?? 0);
  const qtdContas = Number(resumo.contasFechadas ?? contas.length);
  const ticket = Number(resumo.ticketMedio ?? (qtdContas ? faturamento / qtdContas : 0));

  const baixarCSV = () => {
    if (!contas.length) {
      alert("Nada para exportar neste período");
      return;
    }
    const header = "id,mesa,cliente,valor,desconto,taxa,valorCobrado,forma,fechadaEm";
    const body = contas
      .map((c: any) =>
        [c.id, c.mesa, c.cliente ?? "", c.valor, c.desconto, c.taxaServico, c.valorCobrado, c.forma, c.fechadaEm]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([[header, body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-5">
      <div className="glass rounded-3xl p-4 sm:p-5 flex flex-wrap items-end gap-3">
        <label className="text-xs text-stone-400">
          De
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block h-11 rounded-xl bg-black/40 border border-white/12 px-3 text-sm text-white"
          />
        </label>
        <label className="text-xs text-stone-400">
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block h-11 rounded-xl bg-black/40 border border-white/12 px-3 text-sm text-white"
          />
        </label>
        <Btn size="sm" onClick={() => void buscar()} disabled={loading}>
          {loading ? "Carregando…" : "Buscar"}
        </Btn>
        <Btn size="sm" variant="outline" onClick={baixarCSV} disabled={!contas.length}>
          <Download className="size-3.5" /> CSV
        </Btn>
        <Btn
          size="sm"
          variant="lime"
          disabled={!data}
          onClick={() =>
            imprimirRelatorioPdf({
              from,
              to,
              resumo,
              contas,
              porDia,
            })
          }
        >
          <FileText className="size-3.5" /> PDF / Imprimir
        </Btn>
      </div>

      {erro && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{erro}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">faturamento</p>
          <p className="font-mono text-xl text-lime-300 font-bold mt-1">{BRL(faturamento)}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">contas</p>
          <p className="font-mono text-xl text-white font-bold mt-1">{qtdContas}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">ticket médio</p>
          <p className="font-mono text-xl text-amber-200 font-bold mt-1">{BRL(ticket)}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">pedidos</p>
          <p className="font-mono text-xl text-white font-bold mt-1">{Number(resumo.pedidosTotal ?? 0)}</p>
        </div>
      </div>

      {Object.keys(porForma).length > 0 && (
        <div className="glass rounded-3xl p-4 sm:p-5">
          <h3 className="font-display text-2xl text-white mb-3">Por forma de pagamento</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {Object.entries(porForma).map(([k, v]) => (
              <div key={k} className="flex justify-between rounded-xl bg-black/25 px-3 py-2 text-sm">
                <span className="text-stone-400">{k}</span>
                <span className="font-mono text-white">{BRL(Number(v || 0))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {porDia.length > 0 && (
        <div className="glass rounded-3xl p-4 sm:p-5 overflow-x-auto">
          <h3 className="font-display text-2xl text-white mb-3">Por dia</h3>
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-stone-500 border-b border-white/10">
              <tr>
                <th className="py-2 pr-3">Dia</th>
                <th className="py-2 pr-3">Contas</th>
                <th className="py-2">Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {porDia.map((d: any) => (
                <tr key={d.dia} className="border-b border-white/[0.05] text-stone-300">
                  <td className="py-2 pr-3 font-mono text-xs">{d.dia}</td>
                  <td className="py-2 pr-3">{d.contas}</td>
                  <td className="py-2 font-mono text-lime-300">{BRL(Number(d.faturamento || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {top.length > 0 && (
        <div className="glass rounded-3xl p-4 sm:p-5">
          <h3 className="font-display text-2xl text-white mb-3">Top produtos</h3>
          <ul className="space-y-2">
            {top.slice(0, 10).map((p: any, i: number) => (
              <li key={p.id || i} className="flex justify-between text-sm border-b border-white/[0.05] py-1.5">
                <span className="text-stone-300 truncate pr-2">
                  {i + 1}. {p.nome || p.produto}
                </span>
                <span className="font-mono text-amber-200 shrink-0">
                  {p.qtd ?? p.quantidade ?? p.vendidos ?? "—"} un
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="glass-deep rounded-3xl p-4 sm:p-5 overflow-x-auto">
        <h3 className="font-display text-2xl text-white mb-3">Contas fechadas</h3>
        {!contas.length ? (
          <p className="text-sm text-stone-500 py-8 text-center">
            {loading ? "Carregando…" : "Sem contas fechadas neste intervalo (só entram sessões já fechadas no caixa)."}
          </p>
        ) : (
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-stone-500 border-b border-white/10">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Mesa</th>
                <th className="py-2 pr-2">Cliente</th>
                <th className="py-2 pr-2">Cobrado</th>
                <th className="py-2 pr-2">Forma</th>
                <th className="py-2">Fechada</th>
              </tr>
            </thead>
            <tbody>
              {contas.slice(0, 200).map((c: any) => (
                <tr key={c.id} className="border-b border-white/[0.05] text-stone-300">
                  <td className="py-2 pr-2 font-mono text-[11px]">{c.id}</td>
                  <td className="py-2 pr-2">{c.mesa}</td>
                  <td className="py-2 pr-2 truncate max-w-[8rem]">{c.cliente || "—"}</td>
                  <td className="py-2 pr-2 font-mono text-lime-300">{BRL(Number(c.valorCobrado ?? c.valor ?? 0))}</td>
                  <td className="py-2 pr-2 text-[11px]">{c.forma || "—"}</td>
                  <td className="py-2 font-mono text-[10px] text-stone-500">
                    {c.fechadaEm ? String(c.fechadaEm).slice(0, 16).replace("T", " ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ================= FUNÇÕES (estoque + relatório + histórico + purge) ================= */
function Funcoes() {
  const [sub, setSub] = useState<"estoque" | "relatorio" | "historico" | "purge">("estoque");
  const [histFrom, setHistFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return dataLocal(d);
  });
  const [histTo, setHistTo] = useState(() => dataLocal());
  const [hist, setHist] = useState<any[]>([]);
  const [histMsg, setHistMsg] = useState<string | null>(null);
  const [purgeBefore, setPurgeBefore] = useState("");
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const subs = [
    { id: "estoque" as const, label: "Estoque", icon: Boxes },
    { id: "relatorio" as const, label: "Relatório", icon: FileText },
    { id: "historico" as const, label: "Histórico", icon: Receipt },
    { id: "purge" as const, label: "Limpar", icon: Trash2 },
  ];

  const buscarHist = async () => {
    setBusy(true);
    setHistMsg(null);
    try {
      const rows = await api.adminPedidos(histFrom, histTo);
      setHist(Array.isArray(rows) ? rows : []);
      setHistMsg(`${Array.isArray(rows) ? rows.length : 0} pedido(s)`);
    } catch (e: any) {
      setHist([]);
      setHistMsg(e.message || "Erro ao buscar histórico");
    } finally {
      setBusy(false);
    }
  };

  const previewPurge = async () => {
    if (!purgeBefore) {
      alert("Informe a data");
      return;
    }
    setBusy(true);
    try {
      const out = await api.purgeHistorico({ before: purgeBefore, dryRun: true, confirm: false });
      setPurgeMsg(
        `Prévia: ${out.sessoes ?? out.count ?? out.wouldDelete ?? JSON.stringify(out)} — sessões fechadas antes de ${purgeBefore}.`
      );
    } catch (e: any) {
      setPurgeMsg(e.message || "Erro na prévia");
    } finally {
      setBusy(false);
    }
  };

  const executarPurge = async () => {
    if (!purgeBefore) {
      alert("Informe a data");
      return;
    }
    if (!confirm(`Apagar DEFINITIVAMENTE contas fechadas antes de ${purgeBefore}? Não dá para desfazer.`)) return;
    setBusy(true);
    try {
      const out = await api.purgeHistorico({ before: purgeBefore, dryRun: false, confirm: true });
      setPurgeMsg(`Removido: ${JSON.stringify(out)}`);
    } catch (e: any) {
      setPurgeMsg(e.message || "Erro ao purgar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1 rounded-2xl bg-black/35 border border-white/[0.08] p-1">
        {subs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSub(s.id)}
            className={cn(
              "btn-press relative flex items-center gap-1.5 rounded-xl px-3 h-9 text-xs font-bold cursor-pointer transition-colors",
              sub === s.id ? "text-zinc-950" : "text-stone-400 hover:text-white"
            )}
          >
            {sub === s.id && (
              <motion.span
                layoutId="fn-sub"
                className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            )}
            <s.icon className="relative z-10 size-3.5" />
            <span className="relative z-10">{s.label}</span>
          </button>
        ))}
      </nav>

      {sub === "estoque" && <Estoque />}
      {sub === "relatorio" && <Relatorio />}

      {sub === "historico" && (
        <section className="glass rounded-3xl p-5">
          <h3 className="font-display text-2xl text-white mb-1">Histórico de pedidos</h3>
          <p className="text-[11px] text-stone-500 mb-4">Consulta por período no Neon desta branch.</p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-xs text-stone-400">
              De
              <input
                type="date"
                value={histFrom}
                onChange={(e) => setHistFrom(e.target.value)}
                className="mt-1 block h-11 rounded-xl bg-black/40 border border-white/12 px-3 text-sm text-white"
              />
            </label>
            <label className="text-xs text-stone-400">
              Até
              <input
                type="date"
                value={histTo}
                onChange={(e) => setHistTo(e.target.value)}
                className="mt-1 block h-11 rounded-xl bg-black/40 border border-white/12 px-3 text-sm text-white"
              />
            </label>
            <Btn size="sm" disabled={busy} onClick={() => void buscarHist()}>
              Buscar
            </Btn>
          </div>
          {histMsg && <p className="mt-3 text-xs text-stone-400">{histMsg}</p>}
          <div className="mt-4 max-h-80 overflow-y-auto space-y-1.5">
            {hist.slice(0, 80).map((p: any) => (
              <div
                key={p.id || JSON.stringify(p)}
                className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-[11px] text-stone-300 font-mono"
              >
                #{p.id} · {p.status} · mesa {p.mesa ?? p.mesa_numero ?? "—"} · {p.cliente_nome || p.clienteNome || ""}
              </div>
            ))}
          </div>
        </section>
      )}

      {sub === "purge" && (
        <section className="glass rounded-3xl p-5 border border-rose-400/20">
          <h3 className="font-display text-2xl text-white mb-1">Limpar histórico</h3>
          <p className="text-[11px] text-stone-500 mb-4">
            Apaga permanentemente contas <b className="text-stone-300">fechadas</b> com fechamento{" "}
            <b className="text-stone-300">antes</b> da data. Não mexe em mesas abertas.
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-xs text-stone-400">
              Antes de
              <input
                type="date"
                value={purgeBefore}
                onChange={(e) => setPurgeBefore(e.target.value)}
                className="mt-1 block h-11 rounded-xl bg-black/40 border border-white/12 px-3 text-sm text-white"
              />
            </label>
            <Btn size="sm" variant="outline" disabled={busy} onClick={() => void previewPurge()}>
              Ver quantos
            </Btn>
            <Btn size="sm" variant="danger" disabled={busy} onClick={() => void executarPurge()}>
              Apagar
            </Btn>
          </div>
          {purgeMsg && <p className="mt-3 text-xs text-amber-200/90">{purgeMsg}</p>}
        </section>
      )}
    </div>
  );
}
