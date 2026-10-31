import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  CaretDown,
  CaretRight,
  Copy,
  DownloadSimple,
  Eye,
  EyeSlash,
  FileText,
  Key,
  LinkSimple,
  Package,
  PencilSimple,
  Plus,
  Printer,
  Receipt,
  Trash,
  UserPlus,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OpsShell } from "../components/OpsShell";
import Dashboard from "./Dashboard";
import MesasAdmin from "./admin/MesasAdmin";
import { ControlesPaginacao, ListaLimitada, useLimiteLocal } from "../components/Paginacao";
import { Badge, Btn, Input, Modal } from "../components/ui";
import { usePaginacaoCursor } from "../hooks/usePaginacaoCursor";
import { TrocarSenha } from "../components/TrocarSenha";
import { ir } from "../router";
import { api } from "../lib/api";
import { descricaoPadrao } from "../lib/descricao";
import { fotoDemo } from "../lib/mappers";
import {
  imprimirComandaHistorico,
  imprimirComprovanteConsumo,
  imprimirRelatorioPdf,
} from "../lib/print";
import type { ItemPedido, Pedido, Produto, TipoProduto } from "../lib/types";
import { CATEGORIAS } from "../lib/data";
import { usePub } from "../store/usePub";
import { BRL } from "../lib/utils";
import { cn } from "../utils/cn";

const ABAS = [
  { id: "painel", label: "Dashboard" },
  { id: "cardapio", label: "Cardápio" },
  { id: "mesas", label: "Mesas" },
  { id: "garcons", label: "Garçons" },
  { id: "funcoes", label: "Funções" },
] as const;

function dataLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Admin({ secao }: { secao?: string }) {
  const auth = usePub((s) => s.auth);
  const hydrateCardapio = usePub((s) => s.hydrateCardapio);
  const hydrateMesas = usePub((s) => s.hydrateMesas);
  const reduceMotion = useReducedMotion();

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
      ir(
        auth.role === "cozinha"
          ? "/cozinha"
          : auth.role === "bar"
            ? "/bar"
            : auth.role === "caixa"
              ? "/caixa"
              : "/login",
      );
    }
  }, [auth]);

  const abaAtual = ABAS.find((a) => a.id === secao) || ABAS[0];
  const aba = abaAtual.id;

  // Não renderiza ferramentas administrativas durante o redirecionamento de outro papel.
  if (!auth || auth.role !== "admin") return null;

  return (
    <OpsShell
      ativo={`admin-${aba}`}
      regime="expressive"
      kicker="Gestão"
      titulo={abaAtual.label}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={aba}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {aba === "painel" && <Dashboard />}
          {aba === "cardapio" && <Cardapio />}
          {aba === "mesas" && <MesasAdmin />}
          {aba === "garcons" && <Garcons />}
          {aba === "funcoes" && <Funcoes />}
        </motion.div>
      </AnimatePresence>
    </OpsShell>
  );
}

/* ================= CARDÁPIO ================= */
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

  const linhaProduto = (p: Produto) => (
    <article
      key={p.id}
      className={cn(
        "flex items-center gap-3.5 py-3 px-4 transition-opacity",
        !p.ativo && "opacity-55",
      )}
    >
      <img
        src={p.foto}
        alt=""
        className="size-16 rounded-sm border border-line object-cover shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-text text-sm truncate">{p.nome}</p>
          <span className="font-mono text-xs font-bold text-brand-ink shrink-0">
            {BRL(p.preco)}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge tone={p.tipo === "escolher" ? "sky" : p.tipo === "personalizavel" ? "brass" : "neutral"}>
            {p.tipo === "escolher" ? "escolher" : p.tipo === "personalizavel" ? "personalizável" : "simples"}
          </Badge>
          {p.estoque !== null && (
            <Badge tone={p.estoque <= (p.estoqueMinimo ?? 0) ? "rose" : "neutral"}>est. {p.estoque}</Badge>
          )}
          {!p.ativo && <Badge tone="neutral">pausado</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => toggle(p.id)}
          title={p.ativo ? "Desativar" : "Ativar"}
          aria-label={p.ativo ? `Desativar ${p.nome}` : `Ativar ${p.nome}`}
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-sm border transition-colors",
            p.ativo
              ? "bg-status-success-surface border-status-success-border text-status-success-ink"
              : "bg-surface-sunken border-line text-text-muted",
          )}
        >
          {p.ativo ? <Eye size={16} /> : <EyeSlash size={16} />}
        </button>
        <button
          type="button"
          onClick={() => setEditando(p)}
          title="Editar"
          aria-label={`Editar ${p.nome}`}
          className="inline-flex size-9 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-text hover:border-line-strong"
        >
          <PencilSimple size={16} />
        </button>
        <button
          type="button"
          onClick={() => remover(p.id)}
          title="Excluir"
          aria-label={`Excluir ${p.nome}`}
          className="inline-flex size-9 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-status-danger-ink hover:border-status-danger-border"
        >
          <Trash size={16} />
        </button>
      </div>
    </article>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line">
        <p className="font-mono text-xs text-text-muted">
          {produtos.length} itens · {produtos.filter((p) => p.ativo).length} ativos
        </p>
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
            <Input
              value={novaCat}
              onChange={setNovaCat}
              placeholder="Nova categoria"
              className="w-40 sm:w-48"
            />
            <Btn
              size="sm"
              variant="secondary"
              onClick={() => {
                if (novaCat.trim()) {
                  addCategoria(novaCat);
                  setNovaCat("");
                }
              }}
            >
              <Plus size={15} weight="bold" /> Categoria
            </Btn>
          </form>
          <Btn size="sm" onClick={() => setNovoAberto(true)}>
            <Plus size={15} weight="bold" /> Produto
          </Btn>
        </div>
      </div>

      <ul className="space-y-3">
        {catsOrdenadas.map((c, i) => {
          const lista = produtos.filter((p) => p.categoria === c.nome);
          const open = abertas.has(c.id);
          return (
            <li
              key={c.id}
              className="rounded-md border border-line bg-surface-raised overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleCat(c.id)}
                  aria-expanded={open}
                  className="flex items-center gap-2.5 flex-1 min-w-[10rem] text-left rounded-sm px-2 py-1.5 hover:bg-surface-hover"
                >
                  {open ? (
                    <CaretDown size={16} weight="bold" className="text-brand-ink shrink-0" />
                  ) : (
                    <CaretRight size={16} weight="bold" className="text-text-muted shrink-0" />
                  )}
                  <span className="font-mono text-xs text-text-muted w-5 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display text-lg font-bold tracking-tight text-text truncate">
                    {c.nome}
                  </span>
                  <Badge tone="neutral">{lista.length}</Badge>
                </button>

                <button
                  type="button"
                  title="Subir"
                  aria-label={`Subir categoria ${c.nome}`}
                  disabled={i === 0}
                  onClick={() => moverCategoria(c.id, -1)}
                  className="inline-flex size-9 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-text disabled:opacity-35"
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  title="Descer"
                  aria-label={`Descer categoria ${c.nome}`}
                  disabled={i === catsOrdenadas.length - 1}
                  onClick={() => moverCategoria(c.id, 1)}
                  className="inline-flex size-9 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-text disabled:opacity-35"
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  type="button"
                  title="Renomear"
                  aria-label={`Renomear categoria ${c.nome}`}
                  onClick={() => {
                    const n = prompt("Nome da categoria:", c.nome);
                    if (n && n.trim()) renameCategoria(c.id, n);
                  }}
                  className="inline-flex size-9 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-text"
                >
                  <PencilSimple size={15} />
                </button>
                <button
                  type="button"
                  title={
                    lista.length > 0
                      ? `Excluir categoria e ${lista.length} produto(s)`
                      : "Excluir categoria"
                  }
                  aria-label={`Excluir categoria ${c.nome}`}
                  onClick={() => removeCategoria(c.id)}
                  className="inline-flex size-9 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-status-danger-ink hover:border-status-danger-border"
                >
                  <Trash size={15} />
                </button>
              </div>

              {open && (
                <div className="border-t border-dashed border-line-strong">
                  <div className="flex justify-end px-4 py-2 bg-surface-sunken border-b border-line">
                    <Btn size="sm" variant="secondary" onClick={() => setNovoAberto(true)}>
                      <Plus size={14} weight="bold" /> Produto nesta categoria
                    </Btn>
                  </div>
                  {lista.length === 0 ? (
                    <p className="text-xs text-text-muted py-6 text-center">
                      Nenhum produto cadastrado nesta categoria.
                    </p>
                  ) : (
                    <div className="divide-y divide-line">{lista.map((p) => linhaProduto(p))}</div>
                  )}
                </div>
              )}
            </li>
          );
        })}

        {orfaos.length > 0 && (
          <li className="rounded-md border border-status-danger-border bg-status-danger-surface overflow-hidden">
            <button
              type="button"
              onClick={() => setOrfaosAberto((v) => !v)}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
            >
              {orfaosAberto ? (
                <CaretDown size={16} weight="bold" className="text-status-danger-ink" />
              ) : (
                <CaretRight size={16} weight="bold" className="text-status-danger-ink" />
              )}
              <span className="font-display text-lg font-bold tracking-tight text-status-danger-ink">
                Sem categoria
              </span>
              <Badge tone="rose">{orfaos.length}</Badge>
            </button>
            {orfaosAberto && (
              <div className="border-t border-status-danger-border bg-surface-raised divide-y divide-line">
                {orfaos.map((p) => linhaProduto(p))}
              </div>
            )}
          </li>
        )}
      </ul>

      <ProdutoForm produto={editando} onClose={() => setEditando(null)} />
      <ProdutoForm novo={novoAberto} onClose={() => setNovoAberto(false)} />
    </div>
  );
}

function ProdutoForm({
  produto,
  novo,
  onClose,
}: {
  produto?: Produto | null;
  novo?: boolean;
  onClose: () => void;
}) {
  const produtos = usePub((s) => s.produtos);
  const cats = usePub((s) => s.categorias);
  const upsert = usePub((s) => s.upsertProduto);
  const reportarErro = usePub((s) => s.reportarErro);
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
  const [estoqueMin, setEstoqueMin] = useState("0");
  const [setor, setSetor] = useState<"cozinha" | "bar">("cozinha");
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
      setAdicionais((produto.adicionais || []).map((a) => `${a.nome}:${a.preco}`).join(", "));
      setRemoviveis((produto.removiveis || []).map((r) => r.nome).join(", "));
      const tem = produto.estoque !== null && produto.estoque !== undefined;
      setControlaEstoque(tem);
      setEstoqueQtd(tem ? String(produto.estoque) : "0");
      setEstoqueMin(tem ? String(produto.estoqueMinimo ?? 0) : "0");
      setSetor(produto.setor === "bar" ? "bar" : "cozinha");
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
      setEstoqueMin("0");
      const catL = String(catPadrao || "").toLowerCase();
      const barish =
        catL.includes("bebida") ||
        catL.includes("suco") ||
        catL.includes("drink") ||
        catL.includes("cerveja") ||
        catL.includes("chopp") ||
        catL.includes("bar");
      setSetor(barish ? "bar" : "cozinha");
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId, novo]);

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
        foto: foto || fotoDemo(nome.trim(), categoria),
        tipo,
        adicionais: ads,
        removiveis: tipo === "personalizavel" ? rems : [],
        ativo: produto ? produto.ativo : true,
        setor,
        estoque: controlaEstoque ? Math.max(0, Number(estoqueQtd) || 0) : null,
        estoqueMinimo: controlaEstoque ? Math.max(0, Math.floor(Number(estoqueMin) || 0)) : 0,
        vendidos: produto ? produto.vendidos : 0,
      });
      onClose();
    } catch (e: any) {
      reportarErro(e?.message || "Erro ao salvar produto");
    } finally {
      setSalvando(false);
    }
  };

  const TIPOS: { id: TipoProduto; label: string; dica: string }[] = [
    { id: "simples", label: "Adicionar direto", dica: "Sem opções — entra direto no pedido" },
    { id: "personalizavel", label: "Personalizável", dica: "Múltiplos adicionais e itens removíveis" },
    { id: "escolher", label: "Escolha única", dica: "Cliente escolhe uma variante (tamanho/sabor)" },
  ];

  return (
    <Modal open={open} onClose={onClose} wide closeOnBackdrop={false}>
      <div className="p-5 sm:p-6">
        <h3 className="font-display text-3xl font-bold tracking-tight text-text pb-3 border-b border-dashed border-line-strong mb-5">
          {editando ? "Editar produto" : "Novo produto"}
        </h3>

        <div className="grid sm:grid-cols-[210px_1fr] gap-5">
          <div>
            <div className="relative aspect-[4/3] rounded-sm overflow-hidden bg-surface-sunken border border-dashed border-line-strong">
              {foto ? (
                <img src={foto} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-center p-4">
                  <div>
                    <Camera size={26} className="text-text-muted mx-auto" />
                    <p className="text-xs text-text-muted mt-1.5">Sem foto</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute inset-x-2 bottom-2 min-h-9 rounded-sm bg-surface-raised border border-line-strong px-2.5 text-[11px] font-bold text-text inline-flex items-center justify-center gap-1.5 hover:bg-surface-hover"
              >
                <Camera size={14} /> Enviar WebP
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && arquivo(e.target.files[0])}
              />
            </div>
            <div className="relative mt-2">
              <LinkSimple
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                value={foto.startsWith("data:") ? "" : foto}
                onChange={(e) => setFoto(e.target.value)}
                placeholder="…ou link https://"
                className="w-full h-10 rounded-sm bg-surface-sunken border border-line-strong pl-8 pr-3 text-xs text-text placeholder:text-text-subtle focus:outline-none focus:border-brand"
              />
            </div>
            {foto.startsWith("data:") && (
              <p className="mt-1.5 text-[10px] text-status-success-ink font-mono">
                WebP otimizado (~960px)
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Input value={nome} onChange={setNome} placeholder="Nome do produto" />
            <Input value={descricao} onChange={setDescricao} placeholder="Descrição curta" />
            <div className="grid grid-cols-2 gap-3">
              <Input value={preco} onChange={setPreco} placeholder="0,00" prefix="R$" type="number" />
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full h-12 rounded-sm bg-surface-sunken border border-line-strong px-3.5 text-sm text-text focus:outline-none focus:border-brand"
              >
                {(nomesCat.length ? nomesCat : CATEGORIAS).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-dashed border-line space-y-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={controlaEstoque}
                  onChange={(e) => setControlaEstoque(e.target.checked)}
                  className="size-4 accent-brand"
                />
                <span className="text-sm text-text font-semibold">Controlar estoque</span>
                <span className="text-xs text-text-muted hidden sm:inline">
                  baixa automática por pedido
                </span>
              </label>
              {controlaEstoque && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1">
                      Quantidade
                    </p>
                    <Input value={estoqueQtd} onChange={setEstoqueQtd} placeholder="0" type="number" />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1">
                      Alerta mínimo
                    </p>
                    <Input value={estoqueMin} onChange={setEstoqueMin} placeholder="0" type="number" />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-dashed border-line space-y-1.5">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Setor de preparo
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: "cozinha" as const, label: "Cozinha", dica: "Chapa e pratos" },
                    { id: "bar" as const, label: "Bar", dica: "Chopes e bebidas" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSetor(s.id)}
                    className={cn(
                      "rounded-sm border px-3 py-2.5 text-left transition-colors",
                      setor === s.id
                        ? "bg-brand-surface border-brand-border text-brand-ink"
                        : "bg-surface-sunken border-line text-text-muted hover:text-text",
                    )}
                  >
                    <p className="text-sm font-bold">{s.label}</p>
                    <p className="text-[11px] opacity-80">{s.dica}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTipo(t.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-sm border px-3.5 py-2.5 text-left transition-colors",
                    tipo === t.id
                      ? "border-brand-border bg-brand-surface"
                      : "border-line bg-surface-sunken hover:border-line-strong",
                  )}
                >
                  <span
                    className={cn(
                      "grid place-items-center size-4 rounded-full border",
                      tipo === t.id ? "border-brand-ink" : "border-line-strong",
                    )}
                  >
                    {tipo === t.id && <span className="size-2 rounded-full bg-brand-ink" />}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-text">{t.label}</span>
                    <span className="block text-xs text-text-muted">{t.dica}</span>
                  </span>
                </button>
              ))}
            </div>

            <Input
              value={adicionais}
              onChange={setAdicionais}
              placeholder="Adicionais: Nome:preço, Bacon:5, Queijo:3.5"
            />
            {tipo === "personalizavel" && (
              <Input
                value={removiveis}
                onChange={setRemoviveis}
                placeholder="Removíveis: Cebola, Maionese…"
              />
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
  const reportarErro = usePub((s) => s.reportarErro);
  const [lista, setLista] = useState<GarcomRow[]>([]);
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [dataMetricas, setDataMetricas] = useState(() => dataLocal());
  const [metricas, setMetricas] = useState<
    Array<{ id: number; nome: string; removido: boolean; atendimentos: number; vendas: number; ticketMedio: number }>
  >([]);
  const [erroMetricas, setErroMetricas] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    api
      .metricasGarcons(dataMetricas)
      .then((r) => {
        if (ativo) {
          setMetricas(r.garcons);
          setErroMetricas(null);
        }
      })
      .catch((e) => {
        if (ativo) setErroMetricas(e.message || "Falha ao carregar indicadores");
      });
    return () => {
      ativo = false;
    };
  }, [dataMetricas]);

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
        })),
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
      setErro(e.message || "Erro ao criar garçom");
      reportarErro(e.message || "Erro ao criar garçom");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (g: GarcomRow) => {
    setBusy(true);
    setErro(null);
    setMensagem(null);
    try {
      await api.setGarcomAtivo(g.id, !g.ativo);
      setMensagem(`${g.nome} ${g.ativo ? "desativado; pode ser reativado" : "reativado"}.`);
      await carregar();
    } catch (e: any) {
      setErro(e.message || "Erro ao atualizar");
      reportarErro(e.message || "Erro ao atualizar");
    } finally {
      setBusy(false);
    }
  };

  const remover = async (g: GarcomRow) => {
    if (!confirm(`Remover "${g.nome}" definitivamente da lista? O link será invalidado e não poderá ser reativado. O histórico será preservado.`)) return;
    setBusy(true);
    setErro(null);
    setMensagem(null);
    try {
      await api.removerGarcom(g.id);
      setLista((atual) => atual.filter((item) => item.id !== g.id));
      setMetricas((atual) => atual.flatMap((item) => item.id !== g.id ? [item] : item.atendimentos ? [{ ...item, removido: true }] : []));
      setMensagem(`${g.nome} foi removido. O link foi invalidado e o histórico foi preservado.`);
      await carregar();
    } catch (e: any) {
      setErro(e.message || "Erro ao remover");
      reportarErro(e.message || "Erro ao remover");
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

  const ativos = lista.filter((g) => g.ativo);
  const inativos = lista.filter((g) => !g.ativo);
  const renderGarcom = (g: GarcomRow) => (
    <li
      key={g.id}
      className={cn(
        "flex flex-wrap items-center gap-2.5 px-5 py-3.5",
        !g.ativo && "opacity-65",
      )}
    >
      <div className="flex-1 min-w-[10rem]">
        <p className="font-semibold text-text text-sm">{g.nome}</p>
        <p className="font-mono text-[11px] text-text-muted truncate max-w-[15rem] sm:max-w-md">
          {g.token}
        </p>
        <p className="font-mono text-[10px] text-text-subtle mt-0.5">
          {g.entregas ?? 0} entrega{(g.entregas ?? 0) === 1 ? "" : "s"}
          {!g.ativo && " · inativo"}
        </p>
      </div>
      <Badge tone={g.ativo ? "sage" : "neutral"}>{g.ativo ? "ativo" : "inativo"}</Badge>
      <button
        type="button"
        title="Copiar link"
        aria-label={`Copiar link de ${g.nome}`}
        disabled={!g.ativo || busy}
        onClick={() => void copiar(g)}
        className="inline-flex size-9 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-text"
      >
        {copiado === g.id ? (
          <span className="font-mono text-[10px] font-bold text-status-success-ink">OK</span>
        ) : (
          <Copy size={15} />
        )}
      </button>
      <button
        type="button"
        title="Abrir fila"
        aria-label={`Abrir fila de ${g.nome}`}
        disabled={!g.ativo || busy}
        onClick={() => ir(`/garcom/${g.token}`)}
        className="inline-flex size-9 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-text"
      >
        <LinkSimple size={15} />
      </button>
      <button
        type="button"
        title={g.ativo ? "Desativar" : "Ativar"}
        aria-label={g.ativo ? `Desativar ${g.nome}` : `Ativar ${g.nome}`}
        disabled={busy}
        onClick={() => void toggle(g)}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-sm border",
          g.ativo
            ? "bg-status-success-surface border-status-success-border text-status-success-ink"
            : "bg-surface-sunken border-line text-text-muted",
        )}
      >
        {g.ativo ? <Eye size={15} /> : <EyeSlash size={15} />}
      </button>
      <button
        type="button"
        title="Remover"
        aria-label={`Remover ${g.nome}`}
        disabled={busy}
        onClick={() => void remover(g)}
        className="inline-flex size-9 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted hover:text-status-danger-ink hover:border-status-danger-border"
      >
        <Trash size={15} />
      </button>
    </li>
  );

  return (
    <div className="space-y-5">
      <section
        className="rounded-md border border-line bg-surface-raised p-5"
        aria-label="Desempenho diário de garçons"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-dashed border-line-strong mb-4">
          <div>
            <h3 className="font-display text-2xl font-bold tracking-tight text-text">
              Desempenho da equipe
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Contas encerradas atribuídas ao responsável da sessão
            </p>
          </div>
          <input
            type="date"
            aria-label="Data das vendas"
            value={dataMetricas}
            onChange={(e) => setDataMetricas(e.target.value)}
            className="h-10 rounded-sm border border-line-strong bg-surface-sunken px-3 font-mono text-xs text-text"
          />
        </div>
        {erroMetricas && (
          <p role="alert" className="text-xs text-status-danger-ink mb-3">
            {erroMetricas}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm text-left">
            <thead className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="py-2.5 pr-2">Garçom</th>
                <th className="py-2.5 px-2 text-right">Contas</th>
                <th className="py-2.5 px-2 text-right">Ticket médio</th>
                <th className="py-2.5 pl-2 text-right">Vendas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {metricas.map((g) => (
                <tr key={g.id}>
                  <td className="py-3 pr-2 font-semibold text-text">
                    {g.nome}{g.removido && <span className="ml-1 text-xs font-normal text-text-muted">(removido)</span>}
                  </td>
                  <td className="py-3 px-2 text-right font-mono">{g.atendimentos}</td>
                  <td className="py-3 px-2 text-right font-mono">{BRL(g.ticketMedio)}</td>
                  <td className="py-3 pl-2 text-right font-mono font-bold text-brand-ink">
                    {BRL(g.vendas)}
                  </td>
                </tr>
              ))}
              {!metricas.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-text-muted">
                    Nenhum atendimento encerrado nesta data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-line bg-surface-raised overflow-hidden">
        <div className="p-5 flex flex-wrap items-end justify-between gap-3 border-b border-dashed border-line-strong">
          <div>
            <h3 className="font-display text-2xl font-bold tracking-tight text-text leading-tight">
              Credenciais de garçom
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              Inativos podem ser reativados. A remoção invalida o link definitivamente, mas preserva o histórico.
            </p>
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void criar();
            }}
          >
            <Input
              value={nome}
              onChange={setNome}
              placeholder="Nome do garçom"
              className="w-44 sm:w-56"
            />
            <Btn size="sm" disabled={busy || !nome.trim()} onClick={() => void criar()}>
              <UserPlus size={15} weight="bold" /> Cadastrar
            </Btn>
          </form>
        </div>

        {erro && (
          <p role="alert" className="m-4 rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs text-status-danger-ink">
            {erro}
          </p>
        )}
        {mensagem && <p role="status" className="m-4 text-sm text-status-success-ink">{mensagem}</p>}

        {loading ? (
          <p className="text-sm text-text-muted py-8 text-center">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-text-muted py-10 px-4 text-center">
            Nenhum garçom cadastrado. Cadastre o nome acima para gerar o link de acesso.
          </p>
        ) : (
          <>
            {ativos.length ? (
              <ul aria-label="Garçons ativos" className="divide-y divide-line">{ativos.map(renderGarcom)}</ul>
            ) : (
              <p className="text-sm text-text-muted py-6 px-4 text-center">Nenhum garçom ativo.</p>
            )}
            {inativos.length > 0 && (
              <details className="border-t border-line">
                <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-text">
                  Inativos ({inativos.length}) — podem ser reativados
                </summary>
                <ul aria-label="Garçons inativos" className="divide-y divide-line">{inativos.map(renderGarcom)}</ul>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/* ================= MESAS ================= */
/* Panorama, mapa/QR Codes e modal vivem em src/screens/admin/MesasAdmin.
   A aba continua restrita ao administrador pelo gate de papel acima. */

/* ================= ESTOQUE ================= */
function Estoque() {
  const produtos = usePub((s) => s.produtos);
  const categorias = usePub((s) => s.categorias);
  const setEstoque = usePub((s) => s.setEstoque);
  const ativar = usePub((s) => s.ativarControleEstoque);
  const hydrateCardapio = usePub((s) => s.hydrateCardapio);
  const reportarErro = usePub((s) => s.reportarErro);
  const [abertas, setAbertas] = useState<Set<number | string>>(() => new Set());

  useEffect(() => {
    void hydrateCardapio();
  }, [hydrateCardapio]);

  const pedirQtd = (titulo: string, atual?: number) => {
    const raw = window.prompt(titulo, atual != null ? String(atual) : "10");
    if (raw == null) return null;
    const n = Math.floor(Number(String(raw).replace(",", ".")));
    if (!Number.isFinite(n) || n < 0) {
      reportarErro("Quantidade inválida");
      return null;
    }
    return n;
  };

  const ordemCat = useMemo(
    () => [...categorias].sort((a, b) => a.ordem - b.ordem),
    [categorias],
  );

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

  const toggle = (id: number | string) => {
    setAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const controlados = produtos.filter((p) => p.estoque !== null);
  const baixos = controlados.filter((p) => (p.estoque ?? 0) <= (p.estoqueMinimo ?? 0));
  const gruposVisiveis = useLimiteLocal(grupos);

  return (
    <div role="region" aria-label="Estoque" className="space-y-4">
      {baixos.length > 0 && (
        <ListaLimitada itens={baixos} tamanho={5}>
          {({ itens, temMais, expandida, carregarMais, recolher }) => (
            <div className="rounded-sm border border-status-danger-border bg-status-danger-surface px-4 py-3">
              <div className="flex items-center gap-3">
                <WarningCircle size={18} weight="fill" className="text-status-danger-ink shrink-0" />
                <p className="text-xs text-status-danger-ink">
                  <strong>{baixos.length} {baixos.length === 1 ? "item" : "itens"} com estoque baixo:</strong>{" "}
                  {itens.map((x) => `${x.nome} (${x.estoque})`).join(" · ")}
                </p>
              </div>
              <ControlesPaginacao temMais={temMais} expandida={expandida} carregarMais={carregarMais} recolher={recolher} className="pt-2" />
            </div>
          )}
        </ListaLimitada>
      )}

      {grupos.length === 0 && <p className="text-sm text-text-muted py-6 text-center">Nenhum produto cadastrado no estoque.</p>}
      {gruposVisiveis.itens.map((g) => {
        const open = abertas.has(g.id);
        const nCtrl = g.itens.filter((x) => x.estoque !== null).length;
        return (
          <section
            key={String(g.id)}
            className="rounded-md border border-line bg-surface-raised overflow-hidden"
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(g.id)}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-surface-hover"
            >
              {open ? (
                <CaretDown size={16} weight="bold" className="text-brand-ink" />
              ) : (
                <CaretRight size={16} weight="bold" className="text-text-muted" />
              )}
              <span className="font-display text-xl font-bold tracking-tight text-text flex-1">
                {g.nome}
              </span>
              <Badge tone="neutral">
                {g.itens.length} · {nCtrl} c/ estoque
              </Badge>
            </button>
            {open && (
              <ListaLimitada itens={g.itens}>
                {({ itens, temMais, expandida, carregarMais, recolher }) => (
                  <>
                    <div className="border-t border-dashed border-line-strong divide-y divide-line">
                      {itens.map((p) => {
                        const controla = p.estoque !== null;
                        const q = p.estoque ?? 0;
                        return (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                            <img
                              src={p.foto}
                              alt=""
                              className="size-11 rounded-sm border border-line object-cover shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-text truncate">{p.nome}</p>
                              <p className="font-mono text-[11px] text-text-muted">
                                {controla ? (
                                  <span
                                    className={
                                      q <= (p.estoqueMinimo ?? 0) ? "text-status-danger-ink font-bold" : "text-status-success-ink"
                                    }
                                  >
                                    {q} un.
                                  </span>
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
                                  className="min-h-9 px-2.5 rounded-sm bg-status-success-surface border border-status-success-border text-status-success-ink font-mono text-xs font-bold"
                                >
                                  + entrada
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const n = pedirQtd("Definir estoque absoluto:", q);
                                    if (n != null) setEstoque(p.id, n);
                                  }}
                                  className="min-h-9 px-2.5 rounded-sm bg-surface-sunken border border-line text-text font-mono text-xs font-semibold"
                                >
                                  definir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEstoque(p.id, Math.max(0, q - 1))}
                                  className="min-h-9 px-2.5 rounded-sm bg-surface-sunken border border-line text-text-muted font-mono text-xs font-semibold"
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
                                className="min-h-9 px-3 rounded-sm border border-brand-border bg-brand-surface text-brand-ink font-mono text-xs font-bold"
                              >
                                Ativar + qtd
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <ControlesPaginacao temMais={temMais} expandida={expandida} carregarMais={carregarMais} recolher={recolher} className="px-4 py-3 border-t border-line" />
                  </>
                )}
              </ListaLimitada>
            )}
          </section>
        );
      })}
      <ControlesPaginacao {...gruposVisiveis} />
    </div>
  );
}

/* ================= RELATÓRIO ================= */
function Relatorio() {
  const reportarErro = usePub((s) => s.reportarErro);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return dataLocal(d);
  });
  const [to, setTo] = useState(() => dataLocal());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Organização (auditoria de duplicação): a antiga aba "Comprovantes" vira
  // uma visão interna do Relatório. Resumo = totais e contas do período
  // (PDF/CSV); Comprovantes recentes = últimas contas encerradas, com
  // atualização automática. O documento impresso é o mesmo nas duas visões.
  const [vista, setVista] = useState<"resumo" | "comprovantes">("resumo");

  const buscar = async (f: string = from, t: string = to) => {
    setLoading(true);
    setErro(null);
    try {
      const out = await api.adminRelatorio(f, t);
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
  const porGarcom = Array.isArray(data?.porGarcom) ? data.porGarcom : [];
  const porForma = resumo.porFormaPagamento || {};
  const top = Array.isArray(resumo.topProdutos) ? resumo.topProdutos : [];
  // Apenas a renderização é limitada; CSV/PDF continuam usando o relatório recebido inteiro.
  const diasVisiveis = useLimiteLocal(porDia, 10, data);
  const garconsVisiveis = useLimiteLocal(porGarcom, 10, data);
  const topVisiveis = useLimiteLocal(top, 5, data);
  const contasVisiveis = useLimiteLocal(contas, 10, data);
  const faturamento = Number(resumo.faturamento ?? 0);
  const qtdContas = Number(resumo.contasFechadas ?? contas.length);
  const ticket = Number(resumo.ticketMedio ?? (qtdContas ? faturamento / qtdContas : 0));
  // #154: vendas × serviço × descontos — total cobrado reconcilia com a soma.
  const vendasBrutas = Number(resumo.vendasBrutas ?? 0);
  const servicoTotal = Number(resumo.servicoTotal ?? 0);
  const descontosTotal = Number(resumo.descontosTotal ?? 0);
  const totalCobrado = Number(resumo.totalCobrado ?? faturamento);

  const aplicarPreset = (preset: "dia" | "semana" | "mes") => {
    const hoje = new Date();
    const inicio = new Date(hoje);
    if (preset === "semana") {
      const dow = (hoje.getDay() + 6) % 7; // segunda-feira como início
      inicio.setDate(hoje.getDate() - dow);
    } else if (preset === "mes") {
      inicio.setDate(1);
    }
    const f = dataLocal(inicio);
    const t = dataLocal(hoje);
    setFrom(f);
    setTo(t);
    void buscar(f, t);
  };

  const baixarCSV = () => {
    if (!contas.length) {
      reportarErro("Sem contas fechadas neste período para exportar.");
      return;
    }
    const header =
      "id,mesa,cliente,garcomResponsavel,valor,desconto,taxaServico,valorCobrado,forma,fechadaEm";
    const body = contas
      .map((c: any) =>
        [
          c.id,
          c.mesa,
          c.cliente ?? "",
          c.garcomResponsavel ?? "",
          c.valor,
          c.desconto,
          c.taxaServico,
          c.valorCobrado,
          c.forma,
          c.fechadaEm,
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
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
    <div className="space-y-4">
      <div>
        <div className="flex gap-1.5" role="group" aria-label="Visões do relatório">
          <Btn
            size="sm"
            variant={vista === "resumo" ? undefined : "outline"}
            onClick={() => setVista("resumo")}
          >
            Resumo do período
          </Btn>
          <Btn
            size="sm"
            variant={vista === "comprovantes" ? undefined : "outline"}
            onClick={() => setVista("comprovantes")}
          >
            Comprovantes recentes
          </Btn>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Resumo traz totais e contas do período (PDF/CSV). Comprovantes recentes lista as últimas
          contas encerradas e atualiza sozinho — o comprovante impresso é o mesmo nas duas visões.
        </p>
      </div>
      {vista === "comprovantes" ? (
        <ComprovantesRecentes />
      ) : (
        <>
      <div className="rounded-md border border-line bg-surface-raised p-4 flex flex-wrap items-end gap-3">
        <label className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          De
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block h-10 rounded-sm bg-surface-sunken border border-line-strong px-3 text-xs text-text"
          />
        </label>
        <label className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block h-10 rounded-sm bg-surface-sunken border border-line-strong px-3 text-xs text-text"
          />
        </label>
        <div className="flex gap-1.5" role="group" aria-label="Períodos rápidos">
          <Btn size="sm" variant="outline" onClick={() => aplicarPreset("dia")} disabled={loading}>
            Hoje
          </Btn>
          <Btn size="sm" variant="outline" onClick={() => aplicarPreset("semana")} disabled={loading}>
            Semana
          </Btn>
          <Btn size="sm" variant="outline" onClick={() => aplicarPreset("mes")} disabled={loading}>
            Mês
          </Btn>
        </div>
        <Btn size="sm" onClick={() => void buscar()} disabled={loading}>
          {loading ? "Carregando…" : "Buscar"}
        </Btn>
        <Btn size="sm" variant="outline" onClick={baixarCSV} disabled={!contas.length}>
          <DownloadSimple size={15} /> CSV
        </Btn>
        <Btn
          size="sm"
          variant="sage"
          disabled={!data}
          onClick={() =>
            imprimirRelatorioPdf({
              from,
              to,
              resumo,
              contas,
              porDia,
              porGarcom,
              topProdutos: top,
            })
          }
        >
          <FileText size={15} /> PDF / Imprimir
        </Btn>
      </div>

      {erro && (
        <p className="rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs text-status-danger-ink">
          {erro}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-md border border-line bg-surface-raised shadow-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Faturamento
          </p>
          <p className="font-display text-xl text-status-success-ink font-bold tnum mt-1">
            {BRL(faturamento)}
          </p>
        </div>
        <div className="rounded-md border border-line bg-surface-raised shadow-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Contas</p>
          <p className="font-display text-xl text-text font-bold tnum mt-1">{qtdContas}</p>
        </div>
        <div className="rounded-md border border-line bg-surface-raised shadow-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Ticket médio
          </p>
          <p className="font-display text-xl text-brand-ink font-bold tnum mt-1">{BRL(ticket)}</p>
        </div>
        <div className="rounded-md border border-line bg-surface-raised shadow-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Pedidos</p>
          <p className="font-display text-xl text-text font-bold tnum mt-1">
            {Number(resumo.pedidosTotal ?? 0)}
          </p>
        </div>
      </div>

      {/* #154: composição do total — vendas − descontos + serviço = cobrado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-md border border-line bg-surface-raised shadow-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Vendas (consumo)
          </p>
          <p className="font-display text-xl text-text font-bold tnum mt-1">{BRL(vendasBrutas)}</p>
        </div>
        <div className="rounded-md border border-line bg-surface-raised shadow-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Serviço
          </p>
          <p className="font-display text-xl text-brand-ink font-bold tnum mt-1">{BRL(servicoTotal)}</p>
        </div>
        <div className="rounded-md border border-line bg-surface-raised shadow-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Descontos
          </p>
          <p className="font-display text-xl text-status-danger-ink font-bold tnum mt-1">
            − {BRL(descontosTotal)}
          </p>
        </div>
        <div className="rounded-md border border-line bg-surface-raised shadow-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Total cobrado
          </p>
          <p className="font-display text-xl text-status-success-ink font-bold tnum mt-1">
            {BRL(totalCobrado)}
          </p>
          <p className="font-mono text-[10px] text-text-muted mt-1">
            = vendas − descontos + serviço
          </p>
        </div>
      </div>

      {Object.keys(porForma).length > 0 && (
        <section className="rounded-md border border-line bg-surface-raised p-5">
          <h3 className="font-display text-xl font-bold tracking-tight text-text mb-3">
            Por forma de pagamento
          </h3>
          <div className="grid sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 divide-line">
            {Object.entries(porForma).map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-line text-sm">
                <span className="text-text-muted uppercase font-mono text-xs">{k}</span>
                <span className="font-mono font-semibold text-text">{BRL(Number(v || 0))}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {porDia.length > 0 && (
        <section aria-label="Relatório por dia" className="rounded-md border border-line bg-surface-raised p-5 overflow-x-auto">
          <h3 className="font-display text-xl font-bold tracking-tight text-text mb-3">
            Por dia
          </h3>
          <table className="w-full text-left text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-wider text-text-muted border-b border-line">
              <tr>
                <th className="py-2 pr-3">Dia</th>
                <th className="py-2 pr-3">Contas</th>
                <th className="py-2 pr-3">Vendas</th>
                <th className="py-2 pr-3">Serviço</th>
                <th className="py-2 pr-3">Descontos</th>
                <th className="py-2">Total cobrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {diasVisiveis.itens.map((d: any) => (
                <tr key={d.dia}>
                  <td className="py-2.5 pr-3 font-mono text-xs text-text">{d.dia}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-text-muted">{d.contas}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-text">
                    {BRL(Number(d.vendasBrutas ?? d.faturamento ?? 0))}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-brand-ink">
                    {BRL(Number(d.servicoTotal ?? 0))}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-status-danger-ink">
                    − {BRL(Number(d.descontosTotal ?? 0))}
                  </td>
                  <td className="py-2.5 font-mono text-xs font-bold text-status-success-ink">
                    {BRL(Number(d.totalCobrado ?? d.faturamento ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ControlesPaginacao {...diasVisiveis} />
        </section>
      )}

      {porGarcom.length > 0 && (
        <section aria-label="Serviço por garçom" className="rounded-md border border-line bg-surface-raised p-5 overflow-x-auto">
          <h3 className="font-display text-xl font-bold tracking-tight text-text mb-1">
            Serviço por garçom responsável
          </h3>
          <p className="text-xs text-text-muted mb-3">
            Comissão atribuída ao garçom responsável por cada sessão fechada no período.
          </p>
          <table className="w-full text-left text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-wider text-text-muted border-b border-line">
              <tr>
                <th className="py-2 pr-3">Garçom</th>
                <th className="py-2 pr-3">Contas</th>
                <th className="py-2 pr-3">Vendas</th>
                <th className="py-2 pr-3">Serviço (comissão)</th>
                <th className="py-2 pr-3">Descontos</th>
                <th className="py-2">Total cobrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {garconsVisiveis.itens.map((g: any) => (
                <tr key={String(g.garcomId ?? "sem-responsavel")}>
                  <td className="py-2.5 pr-3 text-text">{g.garcomNome || "—"}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-text-muted">{g.contas}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-text">
                    {BRL(Number(g.vendasBrutas ?? 0))}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs font-bold text-brand-ink">
                    {BRL(Number(g.servicoTotal ?? 0))}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-status-danger-ink">
                    − {BRL(Number(g.descontosTotal ?? 0))}
                  </td>
                  <td className="py-2.5 font-mono text-xs font-bold text-status-success-ink">
                    {BRL(Number(g.totalCobrado ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ControlesPaginacao {...garconsVisiveis} />
        </section>
      )}

      {top.length > 0 && (
        <section aria-label="Top produtos do relatório" className="rounded-md border border-line bg-surface-raised p-5">
          <h3 className="font-display text-xl font-bold tracking-tight text-text mb-3">
            Top produtos
          </h3>
          <ul className="divide-y divide-line">
            {topVisiveis.itens.map((p: any, i: number) => (
              <li key={p.id || i} className="flex justify-between text-sm py-2">
                <span className="text-text truncate pr-2">
                  <span className="font-mono text-xs text-brand-ink mr-1.5">#{i + 1}</span>
                  {p.nome || p.produto}
                </span>
                <span className="font-mono text-xs font-semibold text-text-muted shrink-0">
                  {p.qtd ?? p.quantidade ?? p.vendidos ?? "—"} un
                </span>
              </li>
            ))}
          </ul>
          <ControlesPaginacao {...topVisiveis} />
        </section>
      )}

      <section aria-label="Contas fechadas do relatório" className="rounded-md border border-line bg-surface-raised p-5 overflow-x-auto">
        <h3 className="font-display text-xl font-bold tracking-tight text-text mb-3">
          Contas fechadas
        </h3>
        {!contas.length ? (
          <p className="text-sm text-text-muted py-6 text-center">
            {loading ? "Carregando…" : "Sem contas encerradas neste intervalo."}
          </p>
        ) : (
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-wider text-text-muted border-b border-line">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Mesa</th>
                <th className="py-2 pr-2">Cliente</th>
                <th className="py-2 pr-2">Cobrado</th>
                <th className="py-2 pr-2">Forma</th>
                <th className="py-2 pr-2">Fechada</th>
                <th className="py-2">Recibo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {contasVisiveis.itens.map((c: any) => (
                <tr key={c.id}>
                  <td className="py-2.5 pr-2 font-mono text-xs text-text-muted">{c.id}</td>
                  <td className="py-2.5 pr-2 font-mono text-xs text-text">{c.mesa}</td>
                  <td className="py-2.5 pr-2 truncate max-w-[8rem] text-text">
                    {c.cliente || "—"}
                  </td>
                  <td className="py-2.5 pr-2 font-mono text-xs font-bold text-status-success-ink">
                    {BRL(Number(c.valorCobrado ?? c.valor ?? 0))}
                  </td>
                  <td className="py-2.5 pr-2 font-mono text-[11px] uppercase text-text-muted">
                    {c.forma || "—"}
                  </td>
                  <td className="py-2.5 pr-2 font-mono text-[11px] text-text-muted">
                    {c.fechadaEm ? String(c.fechadaEm).slice(0, 16).replace("T", " ") : "—"}
                  </td>
                  <td className="py-2.5">
                    <button
                      type="button"
                      title="Imprimir comprovante de consumo e pagamento"
                      className="inline-flex items-center gap-1 font-mono text-xs font-bold text-brand-ink hover:underline"
                      onClick={() =>
                        void api
                          .comprovanteSessaoAdmin(Number(c.id))
                          .then(imprimirComprovanteConsumo)
                          .catch((e) =>
                            reportarErro(e.message || "Não foi possível gerar o comprovante"),
                          )
                      }
                    >
                      <Printer size={14} /> Comprovante
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ControlesPaginacao {...contasVisiveis} />
        {qtdContas > contas.length && (
          <p role="status" className="pt-3 text-xs text-text-muted">
            O relatório detalha as {contas.length} contas mais recentes de {qtdContas} no período. As linhas do CSV/PDF e a divisão por garçom cobrem apenas essas contas.
          </p>
        )}
      </section>
      </>
      )}
    </div>
  );
}

/* ================= FUNÇÕES & HISTÓRICO ================= */
function pedidoFromHistorico(p: any): Pedido {
  const itensRaw = Array.isArray(p.itens) ? p.itens : [];
  const itens: ItemPedido[] = itensRaw.map((it: any, idx: number) => {
    const qtd = Number(it.qtd ?? it.quantidade ?? 1) || 1;
    const precoBase = Number(it.precoBase ?? it.preco_unitario ?? it.preco ?? 0);
    const rawUnit =
      it.totalUnit ?? it.preco_total_unit ?? Number(it.subtotal ?? it.total ?? 0) / qtd;
    const totalUnit = Number(rawUnit) || precoBase;
    const adicionais = Array.isArray(it.adicionais)
      ? it.adicionais.map((a: any) =>
          typeof a === "string"
            ? { id: a, nome: a, preco: 0 }
            : { id: String(a.id ?? a.nome), nome: String(a.nome ?? a), preco: Number(a.preco ?? 0) },
        )
      : [];
    const removidos = Array.isArray(it.removidos)
      ? it.removidos.map((r: any) => (typeof r === "string" ? r : String(r.nome ?? r)))
      : Array.isArray(it.removiveis)
        ? it.removiveis.map((r: any) => String(r.nome ?? r))
        : [];
    let escolha = null as ItemPedido["escolha"];
    if (it.escolha) {
      escolha =
        typeof it.escolha === "string"
          ? { id: it.escolha, nome: it.escolha, preco: 0 }
          : {
              id: String(it.escolha.id ?? it.escolha.nome),
              nome: String(it.escolha.nome ?? it.escolha),
              preco: Number(it.escolha.preco ?? 0),
            };
    }
    return {
      id: String(it.id ?? `h-${idx}`),
      produtoId: Number(it.produtoId ?? it.produto_id ?? 0),
      nome: String(it.nome ?? it.produto_nome ?? "Item"),
      qtd,
      precoBase,
      adicionais,
      removidos,
      escolha,
      obs: String(it.obs ?? it.observacao ?? ""),
      totalUnit,
      status: it.status,
      setor: it.setor === "bar" ? "bar" : it.setor === "cozinha" ? "cozinha" : undefined,
    };
  });

  const criadoRaw = p.criado_em || p.criadoEm || Date.now();
  const criadoEm =
    typeof criadoRaw === "number" ? criadoRaw : new Date(criadoRaw).getTime() || Date.now();

  const mesaNome =
    p.mesaNome ||
    (p.mesa != null ? `Mesa ${p.mesa}` : null) ||
    (p.mesa_numero != null ? `Mesa ${p.mesa_numero}` : "Mesa");

  return {
    id: Number(p.id),
    sessaoId: Number(p.sessaoId ?? p.sessao_id ?? 0),
    mesaId: Number(p.mesaId ?? p.mesa_id ?? 0),
    mesaNome: String(mesaNome),
    clienteNome: String(p.cliente_nome || p.clienteNome || p.cliente || ""),
    itens,
    status: (p.status as Pedido["status"]) || "entregue",
    criadoEm,
    total: Number(p.totalPedido ?? p.total ?? 0),
  };
}

function HistoricoPedidos({ histFrom, setHistFrom, histTo, setHistTo }: {
  histFrom: string;
  setHistFrom: (v: string) => void;
  histTo: string;
  setHistTo: (v: string) => void;
}) {
  const [aberto, setAberto] = useState<number | null>(null);
  const [filtros, setFiltros] = useState(() => ({ from: histFrom, to: histTo }));
  const buscar = useCallback((cursor: string | null) =>
    api.adminPedidosPagina(filtros.from, filtros.to, cursor), [filtros]);
  const pagina = usePaginacaoCursor(buscar);
  const toggle = (id: number) => setAberto((cur) => (cur === id ? null : id));
  const ocupada = pagina.carregando || pagina.carregandoMais;

  return (
    <section aria-label="Histórico de pedidos" className="rounded-md border border-line bg-surface-raised p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-dashed border-line-strong">
        <div>
          <h3 className="font-display text-2xl font-bold tracking-tight text-text">
            Histórico de pedidos
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            Toque no registro para inspecionar itens e reimprimir o cupom do pedido (documento de
            produção/consumo). O comprovante financeiro da conta fica em Relatório → Comprovantes
            recentes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 items-end">
          <label className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            De
            <input
              type="date"
              value={histFrom}
              onChange={(e) => setHistFrom(e.target.value)}
              className="mt-1 block h-10 rounded-sm bg-surface-sunken border border-line-strong px-3 text-xs text-text"
            />
          </label>
          <label className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            Até
            <input
              type="date"
              value={histTo}
              onChange={(e) => setHistTo(e.target.value)}
              className="mt-1 block h-10 rounded-sm bg-surface-sunken border border-line-strong px-3 text-xs text-text"
            />
          </label>
          <Btn size="sm" disabled={ocupada} onClick={() => {
            setAberto(null);
            setFiltros({ from: histFrom, to: histTo });
          }}>
            Buscar
          </Btn>
        </div>
      </div>

      {pagina.erro && <p role="alert" className="mt-3 text-xs text-status-danger-ink">{pagina.erro}</p>}
      {!pagina.erro && !pagina.carregando && pagina.itens.length > 0 && (
        <p role="status" className="mt-3 font-mono text-xs text-text-muted">
          {pagina.itens.length} pedido(s) carregado(s){pagina.temMais ? " · há mais registros" : " · fim da lista"}
        </p>
      )}

      <div aria-busy={ocupada} className="mt-4 max-h-[28rem] overflow-y-auto divide-y divide-line border-t border-line">
        {pagina.carregando && <p role="status" className="text-sm text-text-muted py-6 text-center">Carregando pedidos…</p>}
        {pagina.itens.length === 0 && !ocupada && !pagina.erro && (
          <p className="text-sm text-text-muted py-6 text-center">Nenhum pedido neste período.</p>
        )}
        {pagina.itens.map((p: any) => {
          const id = Number(p.id);
          const isOpen = aberto === id;
          const itens = Array.isArray(p.itens) ? p.itens : [];
          const total = Number(p.totalPedido ?? p.total ?? 0);
          const criado = p.criado_em || p.criadoEm || "";
          return (
            <div key={id || JSON.stringify(p)}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(id)}
                className="w-full flex items-center gap-3 py-3 px-2 text-left hover:bg-surface-hover transition-colors"
              >
                <span className="font-mono text-xs text-brand-ink font-bold shrink-0">#{id}</span>
                <Badge
                  tone={
                    p.status === "entregue"
                      ? "sage"
                      : p.status === "concluido"
                        ? "ember"
                        : "neutral"
                  }
                >
                  {p.status}
                </Badge>
                <span className="text-xs text-text font-semibold truncate">
                  Mesa {p.mesa ?? p.mesa_numero ?? "—"}
                  {(p.cliente_nome || p.clienteNome) && (
                    <span className="text-text-muted font-normal">
                      {" "}
                      · {p.cliente_nome || p.clienteNome}
                    </span>
                  )}
                </span>
                <span className="ml-auto font-mono text-xs font-bold text-text shrink-0">
                  {total > 0 ? BRL(total) : "—"}
                </span>
                {isOpen ? (
                  <CaretDown size={14} weight="bold" className="text-text-muted shrink-0" />
                ) : (
                  <CaretRight size={14} weight="bold" className="text-text-muted shrink-0" />
                )}
              </button>
              {isOpen && (
                <div className="border-t border-dashed border-line px-3 py-3 space-y-2 bg-surface-sunken">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-text-muted">
                    {criado && <span>Criado: {String(criado).slice(0, 19).replace("T", " ")}</span>}
                    {(p.garcom_nome || p.garcomNome) && (
                      <span>Garçom: {p.garcom_nome || p.garcomNome}</span>
                    )}
                    {(p.observacao_geral || p.observacaoGeral) && (
                      <span>Obs: {p.observacao_geral || p.observacaoGeral}</span>
                    )}
                  </div>
                  {itens.length === 0 ? (
                    <p className="text-xs text-text-muted">Sem itens neste registro.</p>
                  ) : (
                    <ListaLimitada itens={itens}>
                      {({ itens: visiveis, temMais, expandida, carregarMais, recolher }) => (
                        <>
                          <ul className="space-y-1.5">
                            {visiveis.map((it: any, idx: number) => (
                              <li
                                key={it.id ?? idx}
                                className="flex items-start justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <span className="font-semibold text-text">
                                    <span className="font-mono text-brand-ink">
                                      {it.quantidade || 1}×
                                    </span>{" "}
                                    {it.nome}
                                  </span>
                                  {Array.isArray(it.adicionais) && it.adicionais.length > 0 && (
                                    <p className="text-[11px] text-status-success-ink">
                                      + {it.adicionais.map((a: any) => a.nome || a).join(", ")}
                                    </p>
                                  )}
                                  {Array.isArray(it.remocoes) && it.remocoes.length > 0 && (
                                    <p className="text-[11px] text-status-danger-ink">
                                      sem {it.remocoes.join(", ")}
                                    </p>
                                  )}
                                  {it.ponto_carne && (
                                    <p className="text-[11px] text-text-muted">ponto: {it.ponto_carne}</p>
                                  )}
                                  {it.observacao && (
                                    <p className="text-[11px] text-text-muted">obs: {it.observacao}</p>
                                  )}
                                </div>
                                <span className="font-mono text-xs text-text shrink-0">
                                  {BRL(
                                    Number(
                                      it.totalLinha ??
                                        Number(it.preco_unitario || 0) * (it.quantidade || 1),
                                    ),
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <ControlesPaginacao temMais={temMais} expandida={expandida} carregarMais={carregarMais} recolher={recolher} className="pt-2" />
                        </>
                      )}
                    </ListaLimitada>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-dashed border-line">
                    <Btn
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const forma =
                          p.forma_pagamento ||
                          p.formaPagamento ||
                          p.forma ||
                          p.pagamento_forma ||
                          null;
                        imprimirComandaHistorico(pedidoFromHistorico(p), {
                          formaPagamento: forma,
                        });
                      }}
                    >
                      <Printer size={14} /> Imprimir cupom
                    </Btn>
                    <span className="font-mono text-xs font-bold text-text">Total {BRL(total)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ControlesPaginacao temMais={pagina.temMais} expandida={pagina.expandida}
        carregarMais={() => void pagina.carregarMais()} recolher={pagina.recolher}
        carregando={pagina.carregandoMais} disabled={pagina.carregando} />
    </section>
  );
}

function ComprovantesRecentes() {
  const buscar = useCallback((cursor: string | null) => api.comprovantesPagina(cursor), []);
  const pagina = usePaginacaoCursor(buscar, 20000);
  const [erroImpressao, setErroImpressao] = useState<string | null>(null);
  const [imprimindo, setImprimindo] = useState<number | null>(null);
  const ocupada = pagina.carregando || pagina.carregandoMais || pagina.verificando;

  const imprimir = async (id: number) => {
    setImprimindo(id);
    setErroImpressao(null);
    try {
      imprimirComprovanteConsumo(await api.comprovanteSessaoAdmin(id));
    } catch (e) {
      setErroImpressao(e instanceof Error ? e.message : "Falha ao imprimir comprovante.");
    } finally {
      setImprimindo(null);
    }
  };

  return (
    <section className="rounded-md border border-line bg-surface-raised overflow-hidden" aria-label="Comprovantes de contas fechadas">
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-line-strong">
        <div>
          <h3 className="font-display text-xl font-bold tracking-tight text-text">Comprovantes recentes</h3>
          <p className="text-xs text-text-muted mt-0.5">Reimpressão de consumo e pagamentos das últimas contas encerradas</p>
        </div>
        <Btn size="sm" variant="secondary" disabled={ocupada} onClick={() => void pagina.atualizar()}>
          {pagina.carregando ? "Atualizando…" : "Atualizar"}
        </Btn>
      </div>
      {(pagina.erro || erroImpressao) && <p role="alert" className="px-5 py-3 text-sm text-status-danger-ink">{pagina.erro || erroImpressao}</p>}
      {pagina.alterado && (
        <p role="status" className="px-5 py-3 text-sm text-brand-ink">
          Há alterações nos comprovantes recentes. Atualize para voltar ao início da lista.
        </p>
      )}
      <div className="divide-y divide-line" aria-busy={ocupada}>
        {pagina.itens.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 justify-between px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">
                Mesa {String(c.mesa).padStart(2, "0")} · <span className="font-mono text-xs text-brand-ink">Conta #{c.id}</span>
              </p>
              <p className="text-xs text-text-muted font-mono">{c.clienteNome || "Cliente não informado"} · {BRL(c.total)}</p>
            </div>
            <Btn size="sm" variant="outline" disabled={imprimindo !== null} onClick={() => void imprimir(c.id)}>
              <Printer size={15} /> {imprimindo === c.id ? "Preparando…" : "Imprimir"}
            </Btn>
          </div>
        ))}
        {pagina.carregando && !pagina.itens.length && <p role="status" className="text-xs text-text-muted px-5 py-6 text-center">Carregando comprovantes…</p>}
        {!ocupada && !pagina.erro && !pagina.itens.length && (
          <p className="text-xs text-text-muted px-5 py-6 text-center">Nenhuma conta encerrada recentemente.</p>
        )}
      </div>
      <ControlesPaginacao temMais={pagina.temMais} expandida={pagina.expandida}
        carregarMais={() => void pagina.carregarMais()} recolher={pagina.recolher}
        carregando={pagina.carregandoMais} disabled={pagina.carregando || pagina.verificando}
        className="px-5 py-4 border-t border-line" />
      {!pagina.temMais && !ocupada && !pagina.erro && pagina.itens.length > 0 && (
        <p role="status" className="px-5 py-3 text-xs text-text-muted">Fim da lista de comprovantes.</p>
      )}
    </section>
  );
}

function Funcoes() {
  const lastError = usePub((s) => s.lastError);
  const reportarErro = usePub((s) => s.reportarErro);
  const reduceMotion = useReducedMotion();
  const [sub, setSub] = useState<"estoque" | "relatorio" | "historico" | "senhas" | "purge">("estoque");
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [histFrom, setHistFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return dataLocal(d);
  });
  const [histTo, setHistTo] = useState(() => dataLocal());
  const [purgeBefore, setPurgeBefore] = useState("");
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const subs = [
    { id: "estoque" as const, label: "Estoque", Icon: Package },
    { id: "relatorio" as const, label: "Relatório", Icon: FileText },
    { id: "historico" as const, label: "Histórico", Icon: Receipt },
    { id: "senhas" as const, label: "Senhas", Icon: Key },
    { id: "purge" as const, label: "Limpar", Icon: Trash },
  ];

  const previewPurge = async () => {
    if (!purgeBefore) {
      reportarErro("Informe a data limite.");
      return;
    }
    setBusy(true);
    try {
      const out = await api.purgeHistorico({ before: purgeBefore, dryRun: true, confirm: false });
      setPurgeMsg(
        `Prévia: ${out.sessoes ?? out.count ?? out.wouldDelete ?? JSON.stringify(out)} — sessões fechadas antes de ${purgeBefore}.`,
      );
    } catch (e: any) {
      setPurgeMsg(e.message || "Erro na prévia");
    } finally {
      setBusy(false);
    }
  };

  const executarPurge = async () => {
    if (!purgeBefore) {
      reportarErro("Informe a data limite.");
      return;
    }
    if (
      !confirm(
        `Apagar DEFINITIVAMENTE contas fechadas antes de ${purgeBefore}? Não dá para desfazer.`,
      )
    )
      return;
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
    <div className="space-y-4">
      {lastError && (
        <p
          role="alert"
          className="rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs font-semibold text-status-danger-ink"
        >
          {lastError}
        </p>
      )}
      <nav
        aria-label="Ferramentas administrativas"
        className="inline-flex flex-wrap gap-1 rounded-sm bg-surface-sunken border border-line-strong p-1"
      >
        {subs.map((s) => {
          const ativo = sub === s.id;
          const Icon = s.Icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSub(s.id)}
              className={cn(
                "relative flex items-center gap-1.5 rounded-xs px-3 min-h-9 text-xs font-bold transition-colors",
                ativo ? "text-brand-contrast" : "text-text-muted hover:text-text",
              )}
            >
              {ativo && (
                <motion.span
                  layoutId="fn-sub"
                  className="absolute inset-0 rounded-xs bg-brand"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 500, damping: 36, mass: 0.7 }
                  }
                />
              )}
              <Icon size={15} weight={ativo ? "fill" : "regular"} className="relative z-10" />
              <span className="relative z-10">{s.label}</span>
            </button>
          );
        })}
      </nav>

      {sub === "estoque" && <Estoque />}
      {sub === "relatorio" && <Relatorio />}
      {sub === "senhas" && (
        <section className="rounded-md border border-line bg-surface-raised p-5">
          <h3 className="font-display text-2xl font-bold tracking-tight text-text">Senhas dos setores</h3>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            Redefina a senha de uma conta de acesso. As sessões anteriores dessa conta serão encerradas.
          </p>
          <Btn variant="secondary" onClick={() => setTrocandoSenha(true)}>
            <Key size={16} /> Redefinir senha de um setor
          </Btn>
          {trocandoSenha && <TrocarSenha obrigatorio={false} onClose={() => setTrocandoSenha(false)} />}
        </section>
      )}
      {sub === "historico" && (
        <HistoricoPedidos
          histFrom={histFrom}
          setHistFrom={setHistFrom}
          histTo={histTo}
          setHistTo={setHistTo}
        />
      )}
      {sub === "purge" && (
        <section className="rounded-md border border-status-danger-border bg-surface-raised p-5">
          <h3 className="font-display text-2xl font-bold tracking-tight text-text mb-1">
            Limpar histórico antigo
          </h3>
          <p className="text-xs text-text-muted mb-4">
            Remove definitivamente sessões já encerradas antes da data escolhida. Mesas abertas não
            são afetadas. As contas removidas somem também de Relatório, Comprovantes recentes e
            Histórico — confira a prévia antes de apagar.
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
              Antes de
              <input
                type="date"
                value={purgeBefore}
                onChange={(e) => setPurgeBefore(e.target.value)}
                className="mt-1 block h-10 rounded-sm bg-surface-sunken border border-line-strong px-3 text-xs text-text"
              />
            </label>
            <Btn size="sm" variant="outline" disabled={busy} onClick={() => void previewPurge()}>
              Ver prévia
            </Btn>
            <Btn size="sm" variant="danger" disabled={busy} onClick={() => void executarPurge()}>
              Apagar definitivamente
            </Btn>
          </div>
          {purgeMsg && <p className="mt-3 font-mono text-xs text-brand-ink">{purgeMsg}</p>}
        </section>
      )}
    </div>
  );
}
