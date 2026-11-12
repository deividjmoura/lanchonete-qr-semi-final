import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Camera,
  Check,
  CaretDown,
  CaretRight,
  Copy,
  DownloadSimple,
  Eye,
  EyeSlash,
  FileText,
  FileArrowUp,
  Info,
  Key,
  LinkSimple,
  PencilSimple,
  Plus,
  Printer,
  Receipt,
  Trash,
  UserPlus,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { OpsShell } from "../components/OpsShell";
import Dashboard from "./Dashboard";
import "./admin/admin-responsive.css";
import MesasAdmin from "./admin/MesasAdmin";
import { ControlesEstoque, estoqueBaixo } from "./admin/ControlesEstoque";
import { ImportarCardapio } from "./admin/ImportarCardapio";
import { SegurancaConta } from "./admin/SegurancaConta";
import { ControlesPaginacao, ListaLimitada, useLimiteLocal } from "../components/Paginacao";
import { Badge, Btn, IconBtn, Input, Modal } from "../components/ui";
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
import { confirmarAcao } from "../lib/confirmacao";
import { cn } from "../utils/cn";

/** #44: sentinela gravada pela purga no lugar do dado pessoal. */
const ANONIMIZADO = "[anonimizado]";

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
  const [dashboardEditMode, setDashboardEditMode] = useState(false);

  useEffect(() => {
    void hydrateCardapio();
    void hydrateMesas();
  }, [hydrateCardapio, hydrateMesas]);

  const abaAtual = ABAS.find((a) => a.id === secao) || ABAS[0];
  const aba = abaAtual.id;
  useEffect(() => { if (aba !== "painel") setDashboardEditMode(false); }, [aba]);

  // Não renderiza ferramentas administrativas durante o redirecionamento de outro papel.
  if (!auth || auth.role !== "admin") return null;

  return (
    <OpsShell
      ativo={`admin-${aba}`}
      regime="expressive"
      kicker="Gestão"
      titulo={aba === "cardapio" ? "Cardápio & Estoque" : abaAtual.label}
      toolbarAction={aba === "painel" ? <IconBtn active={dashboardEditMode} label={dashboardEditMode ? "Concluir edição do dashboard" : "Editar dashboard"} aria-pressed={dashboardEditMode} onClick={() => setDashboardEditMode((value) => !value)} className="ops-dashboard-edit-toggle">{dashboardEditMode ? <Check size={20} weight="bold" /> : <PencilSimple size={20} weight="bold" />}</IconBtn> : undefined}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={aba}
          className="admin-page"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.2, 0, 0, 1] }}
        >
          {aba === "painel" && <Dashboard editMode={dashboardEditMode} />}
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
  const lastError = usePub((s) => s.lastError);
  const produtos = usePub((s) => s.produtos);
  const categorias = usePub((s) => s.categorias);
  const toggle = usePub((s) => s.toggleProduto);
  const remover = usePub((s) => s.removerProduto);
  const addCategoria = usePub((s) => s.addCategoria);
  const renameCategoria = usePub((s) => s.renameCategoria);
  const removeCategoria = usePub((s) => s.removeCategoria);
  const setCategoriasOrdem = usePub((s) => s.setCategoriasOrdem);
  const [categoriaArrastada, setCategoriaArrastada] = useState<number | null>(null);
  const [ordemAtualizada, setOrdemAtualizada] = useState(false);
  const toqueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toqueAtivo = useRef(false);
  const toqueDestino = useRef<number | null>(null);
  const toqueOrigem = useRef<number | null>(null);
  const limparToque = () => {
    if (toqueTimer.current) clearTimeout(toqueTimer.current);
    toqueTimer.current = null;
    toqueAtivo.current = false;
    toqueDestino.current = null;
    toqueOrigem.current = null;
  };
  useEffect(() => () => {
    if (toqueTimer.current) clearTimeout(toqueTimer.current);
  }, []);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [novaCat, setNovaCat] = useState("");
  const [abertas, setAbertas] = useState<Set<number>>(() => new Set());
  const [orfaosAberto, setOrfaosAberto] = useState(true);
  const [importarAberto, setImportarAberto] = useState(false);
  const hydrateCardapio = usePub((s) => s.hydrateCardapio);

  useEffect(() => { void hydrateCardapio(); }, [hydrateCardapio]);
  const baixos = produtos.filter(estoqueBaixo);

  const catsOrdenadas = [...categorias].sort((a, b) => a.ordem - b.ordem);
  const nomesCat = new Set(catsOrdenadas.map((c) => c.nome));
  const orfaos = produtos.filter((p) => !nomesCat.has(p.categoria));

  const reposicionarCategoria = (origemId: number, destinoId: number) => {
    if (origemId === destinoId) return;
    const ids = catsOrdenadas.map((cat) => cat.id);
    const origem = ids.indexOf(origemId);
    const destino = ids.indexOf(destinoId);
    if (origem < 0 || destino < 0) return;
    ids.splice(origem, 1);
    ids.splice(destino, 0, origemId);
    setCategoriasOrdem(ids);
    setCategoriaArrastada(null);
    setOrdemAtualizada(true);
  };

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
        "admin-product flex flex-wrap items-center gap-3.5 py-3 px-4 transition-opacity",
        !p.ativo && "opacity-55",
      )}
    >
      <img
        src={p.foto}
        alt=""
        className="size-16 rounded-sm border border-line object-cover shrink-0"
      />
      <div className="admin-product-info flex-1 min-w-40">
        <div className="flex items-baseline justify-between gap-2">
          <p className="admin-product-name font-semibold text-text text-sm truncate">{p.nome}</p>
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
        <ControlesEstoque produto={p} />
      </div>

      <div className="admin-product-actions flex items-center gap-1.5 shrink-0">
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
      {lastError && (
        <p role="alert" className="rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs font-semibold text-status-danger-ink">{lastError}</p>
      )}
      {baixos.length > 0 && (
        <ListaLimitada itens={baixos} tamanho={5}>
          {({ itens, temMais, expandida, carregarMais, recolher }) => (
            <section role="region" aria-label="Produtos com estoque baixo" className="rounded-sm border border-status-danger-border bg-status-danger-surface px-4 py-3">
              <p className="text-sm font-semibold text-status-danger-ink">{baixos.length} {baixos.length === 1 ? "item com estoque baixo" : "itens com estoque baixo"}</p>
              <ul className="mt-2 space-y-2">
                {itens.map((p) => (
                  <li key={p.id} className="border-t border-status-danger-border pt-2">
                    <p className="text-sm text-status-danger-ink">{p.nome} · {p.estoque} un. · mínimo {p.estoqueMinimo ?? 0}{!p.ativo ? " · pausado" : ""}</p>
                    <ControlesEstoque produto={p} />
                  </li>
                ))}
              </ul>
              <ControlesPaginacao temMais={temMais} expandida={expandida} carregarMais={carregarMais} recolher={recolher} className="pt-2" />
            </section>
          )}
        </ListaLimitada>
      )}
      <div className="admin-catalog-toolbar flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line">
        <p className="font-mono text-xs text-text-muted">
          {produtos.length} itens · {produtos.filter((p) => p.ativo).length} ativos
        </p>
        <div className="admin-catalog-actions flex flex-wrap items-center gap-2">
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
          {/* Importação em massa: substitui (ou atualiza) o cardápio por CSV. */}
          <Btn size="sm" variant="secondary" onClick={() => setImportarAberto(true)}>
            <FileArrowUp size={15} weight="bold" /> Importar CSV
          </Btn>
          <Btn size="sm" onClick={() => setNovoAberto(true)}>
            <Plus size={15} weight="bold" /> Produto
          </Btn>
        </div>
      </div>

      <ul className="space-y-3">
        {catsOrdenadas.map((c, i) => {
          const lista = produtos.filter((p) => p.categoria === c.nome);
          const open = abertas.has(c.id);
          const reposicionar = (destinoId: number) => {
            if (categoriaArrastada !== null) reposicionarCategoria(categoriaArrastada, destinoId);
          };
          return (
            <li
              key={c.id}
              data-category-id={c.id}
              draggable
              onDragStart={(event) => {
                if ((event.target as HTMLElement).closest("button:not([data-drag-handle])")) {
                  event.preventDefault();
                  return;
                }
                setCategoriaArrastada(c.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(c.id));
              }}
              onDragOver={(event) => {
                if (categoriaArrastada !== null && categoriaArrastada !== c.id) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                reposicionar(c.id);
              }}
              onDragEnd={() => setCategoriaArrastada(null)}
              className={cn(
                "rounded-md border border-line bg-surface-raised overflow-hidden transition-all",
                categoriaArrastada === c.id && "opacity-45 scale-[0.99]",
                categoriaArrastada !== null && categoriaArrastada !== c.id && "border-brand-border",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleCat(c.id)}
                  onKeyDown={(event) => {
                    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                      event.preventDefault();
                      const ids = catsOrdenadas.map((cat) => cat.id);
                      const from = ids.indexOf(c.id);
                      const to = Math.max(0, Math.min(ids.length - 1, from + (event.key === "ArrowUp" ? -1 : 1)));
                      if (from !== to) {
                        ids.splice(from, 1);
                        ids.splice(to, 0, c.id);
                        setCategoriasOrdem(ids);
                        setOrdemAtualizada(true);
                      }
                    }
                  }}
                  aria-expanded={open}
                  data-drag-handle
                  onPointerDown={(event) => {
                    if (event.pointerType !== "touch") return;
                    limparToque();
                    toqueOrigem.current = c.id;
                    const handle = event.currentTarget;
                    const pointerId = event.pointerId;
                    toqueTimer.current = setTimeout(() => {
                      toqueAtivo.current = true;
                      toqueDestino.current = c.id;
                      setCategoriaArrastada(c.id);
                      try { handle.setPointerCapture(pointerId); } catch { /* captura pode não estar disponível */ }
                    }, 450);
                  }}
                  onPointerMove={(event) => {
                    if (!toqueAtivo.current) return;
                    const alvo = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-category-id]");
                    const id = Number(alvo?.dataset.categoryId);
                    if (Number.isSafeInteger(id) && id > 0) toqueDestino.current = id;
                  }}
                  onPointerUp={() => {
                    if (toqueTimer.current) clearTimeout(toqueTimer.current);
                    toqueTimer.current = null;
                    if (toqueAtivo.current && toqueOrigem.current !== null && toqueDestino.current !== null) {
                      reposicionarCategoria(toqueOrigem.current, toqueDestino.current);
                    }
                    limparToque();
                  }}
                  onPointerCancel={() => {
                    limparToque();
                    setCategoriaArrastada(null);
                  }}
                  aria-roledescription="categoria arrastável; segure e arraste no celular; use Alt mais seta para cima ou para baixo no teclado"
                  title="Segure e arraste para mudar a ordem. No teclado, use Alt + ↑ ou Alt + ↓."
                  className="flex items-center gap-2.5 flex-1 min-w-[10rem] text-left rounded-sm px-2 py-1.5 hover:bg-surface-hover cursor-grab active:cursor-grabbing touch-none select-none"
                >
                  <span aria-hidden="true" className="text-text-subtle select-none">⠿</span>
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
                <div className="border-t border-line-strong">
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
      <p role="status" aria-live="polite" className="text-xs text-text-muted">
        {ordemAtualizada ? "Ordem das categorias atualizada." : "Para reorganizar, segure uma categoria e arraste para a posição desejada. No teclado, use Alt + ↑ ou Alt + ↓."}
      </p>

      <ProdutoForm produto={editando} onClose={() => setEditando(null)} />
      <ProdutoForm novo={novoAberto} onClose={() => setNovoAberto(false)} />
      <ImportarCardapio
        open={importarAberto}
        onClose={() => setImportarAberto(false)}
        onImportado={() => void hydrateCardapio()}
      />
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
    <Modal className="admin-dialog" open={open} onClose={onClose} wide closeOnBackdrop={false}>
      <div className="p-5 sm:p-6">
        <h3 className="font-display text-3xl font-bold tracking-tight text-text pb-3 border-b border-line-strong mb-5">
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
              <p className="mt-1.5 text-[11px] text-status-success-ink font-mono">
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

            <div className="pt-2 border-t border-line space-y-2.5">
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
                    <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-1">
                      Quantidade
                    </p>
                    <Input value={estoqueQtd} onChange={setEstoqueQtd} placeholder="0" type="number" />
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-1">
                      Alerta mínimo
                    </p>
                    <Input value={estoqueMin} onChange={setEstoqueMin} placeholder="0" type="number" />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-line space-y-1.5">
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
  const [dataMetricasAte, setDataMetricasAte] = useState(() => dataLocal());
  const [metricas, setMetricas] = useState<Array<{
    id: number; nome: string; removido: boolean;
    pedidosRegistrados: number; pedidosComEntregaRegistrada: number; valorItensEntregues: number;
    itensAssumidos: number; itensRetirados: number; itensEntregues: number;
    outrosEventos: Array<{ acao: string; quantidade: number }>;
  }>>([]);
  const [erroMetricas, setErroMetricas] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    api
      .metricasGarcons(dataMetricas, dataMetricasAte)
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
  }, [dataMetricas, dataMetricasAte]);

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
    const confirmado = await confirmarAcao({ titulo: "Remover garçom?", mensagem: `O garçom "${g.nome}" será removido da lista. O link de acesso será invalidado e não poderá ser reativado. O histórico será preservado.`, confirmar: "Remover garçom", perigo: true });
    if (!confirmado) return;
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
  const totaisMetricas = metricas.reduce((total, g) => ({
    pedidosRegistrados: total.pedidosRegistrados + g.pedidosRegistrados,
    pedidosComEntregaRegistrada: total.pedidosComEntregaRegistrada + g.pedidosComEntregaRegistrada,
    itensAssumidos: total.itensAssumidos + g.itensAssumidos,
    itensRetirados: total.itensRetirados + g.itensRetirados,
    itensEntregues: total.itensEntregues + g.itensEntregues,
    valorItensEntregues: total.valorItensEntregues + g.valorItensEntregues,
    outrosEventos: total.outrosEventos + g.outrosEventos.reduce((soma, evento) => soma + evento.quantidade, 0),
  }), {
    pedidosRegistrados: 0, pedidosComEntregaRegistrada: 0,
    itensAssumidos: 0, itensRetirados: 0, itensEntregues: 0,
    valorItensEntregues: 0, outrosEventos: 0,
  });
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
        <p className="font-mono text-[11px] text-text-subtle mt-0.5">
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
          <span className="font-mono text-[11px] font-bold text-status-success-ink">OK</span>
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
        aria-label="Desempenho de garçons por período"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-line-strong mb-4">
          <div>
            <h3 className="font-display text-2xl font-bold tracking-tight text-text">
              Desempenho da equipe
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Ranking por vendas, com operações atribuídas e valores financeiros sem duplicar receitas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="grid gap-1 text-[11px] font-mono uppercase tracking-wider text-text-muted">
              De
              <input type="date" aria-label="Início do período" value={dataMetricas}
                max={dataMetricasAte} onChange={(e) => setDataMetricas(e.target.value)}
                className="h-10 rounded-sm border border-line-strong bg-surface-sunken px-3 font-mono text-xs text-text" />
            </label>
            <label className="grid gap-1 text-[11px] font-mono uppercase tracking-wider text-text-muted">
              Até
              <input type="date" aria-label="Fim do período" value={dataMetricasAte}
                min={dataMetricas} onChange={(e) => setDataMetricasAte(e.target.value)}
                className="h-10 rounded-sm border border-line-strong bg-surface-sunken px-3 font-mono text-xs text-text" />
            </label>
          </div>
        </div>
        {erroMetricas && (
          <p role="alert" className="text-xs text-status-danger-ink mb-3">
            {erroMetricas}
          </p>
        )}
        <div className="overflow-x-auto">
          <table role="table" className="admin-data-table w-full min-w-[900px] text-sm text-left">
            <thead className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="py-2.5 pr-3">Garçom</th>
                <th className="py-2.5 px-2 text-right">Pedidos registrados</th>
                <th className="py-2.5 px-2 text-right">Pedidos com entrega</th>
                <th className="py-2.5 px-2 text-right">Itens aceitos</th>
                <th className="py-2.5 px-2 text-right">Itens retirados</th>
                <th className="py-2.5 px-2 text-right">Itens entregues</th>
                <th className="py-2.5 px-2 text-right">Valor dos itens entregues</th>
                <th className="py-2.5 pl-2 text-right">Eventos adicionais</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {metricas.map((g) => (
                <tr key={g.id}>
                  <td data-label="Garçom" className="py-3 pr-3 font-semibold text-text">
                    {g.nome}{g.removido && <span className="ml-1 text-xs font-normal text-text-muted">(removido)</span>}
                  </td>
                  <td data-label="Pedidos registrados" className="py-3 px-2 text-right font-mono">{g.pedidosRegistrados}</td>
                  <td data-label="Pedidos com entrega" className="py-3 px-2 text-right font-mono">{g.pedidosComEntregaRegistrada}</td>
                  <td data-label="Itens aceitos" className="py-3 px-2 text-right font-mono">{g.itensAssumidos}</td>
                  <td data-label="Itens retirados" className="py-3 px-2 text-right font-mono">{g.itensRetirados}</td>
                  <td data-label="Itens entregues" className="py-3 px-2 text-right font-mono">{g.itensEntregues}</td>
                  <td data-label="Valor dos itens entregues" className="py-3 px-2 text-right font-mono">{BRL(g.valorItensEntregues)}</td>
                  <td data-label="Eventos adicionais" className="py-3 pl-2 text-right text-xs text-text-muted">
                    {g.outrosEventos.length
                      ? g.outrosEventos.map((evento) => `${evento.acao}: ${evento.quantidade}`).join(" · ")
                      : "—"}
                  </td>
                </tr>
              ))}
              {metricas.length > 0 && (
                <tr className="border-t-2 border-line-strong bg-surface-sunken font-semibold">
                  <td data-label="Garçom" className="py-3 pr-3 text-text">Total do período</td>
                  <td data-label="Pedidos registrados" className="py-3 px-2 text-right font-mono">{totaisMetricas.pedidosRegistrados}</td>
                  <td data-label="Pedidos com entrega" className="py-3 px-2 text-right font-mono">{totaisMetricas.pedidosComEntregaRegistrada}</td>
                  <td data-label="Itens aceitos" className="py-3 px-2 text-right font-mono">{totaisMetricas.itensAssumidos}</td>
                  <td data-label="Itens retirados" className="py-3 px-2 text-right font-mono">{totaisMetricas.itensRetirados}</td>
                  <td data-label="Itens entregues" className="py-3 px-2 text-right font-mono">{totaisMetricas.itensEntregues}</td>
                  <td data-label="Valor dos itens entregues" className="py-3 px-2 text-right font-mono">{BRL(totaisMetricas.valorItensEntregues)}</td>
                  <td data-label="Eventos adicionais" className="py-3 pl-2 text-right font-mono">{totaisMetricas.outrosEventos}</td>
                </tr>
              )}
              {!metricas.length && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-xs text-text-muted">
                    Nenhuma atividade registrada neste período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-text-muted">
          O período usa o fuso horário configurado no servidor. Pedidos registrados e etapas de cada item são atribuídos ao funcionário que realmente executou a ação. O valor exibido corresponde aos itens entregues por cada garçom; taxa de serviço e descontos permanecem no relatório financeiro geral, sem rateio por mesa.
        </p>
      </section>

      <section className="rounded-md border border-line bg-surface-raised overflow-hidden">
        <div className="p-5 flex flex-wrap items-end justify-between gap-3 border-b border-line-strong">
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
      "id,mesa,cliente,valor,desconto,taxaServico,valorCobrado,forma,fechadaEm";
    const body = contas
      .map((c: any) =>
        [
          c.id,
          c.mesa,
          c.cliente ?? "",
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
          <p className="font-mono text-[11px] text-text-muted mt-1">
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
          <table role="table" className="admin-data-table w-full text-left text-sm">
            <thead className="font-mono text-[11px] uppercase tracking-wider text-text-muted border-b border-line">
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
                  <td data-label="Dia" className="py-2.5 pr-3 font-mono text-xs text-text">{d.dia}</td>
                  <td data-label="Contas" className="py-2.5 pr-3 font-mono text-xs text-text-muted">{d.contas}</td>
                  <td data-label="Vendas" className="py-2.5 pr-3 font-mono text-xs text-text">
                    {BRL(Number(d.vendasBrutas ?? d.faturamento ?? 0))}
                  </td>
                  <td data-label="Serviço" className="py-2.5 pr-3 font-mono text-xs text-brand-ink">
                    {BRL(Number(d.servicoTotal ?? 0))}
                  </td>
                  <td data-label="Descontos" className="py-2.5 pr-3 font-mono text-xs text-status-danger-ink">
                    − {BRL(Number(d.descontosTotal ?? 0))}
                  </td>
                  <td data-label="Total cobrado" className="py-2.5 font-mono text-xs font-bold text-status-success-ink">
                    {BRL(Number(d.totalCobrado ?? d.faturamento ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ControlesPaginacao {...diasVisiveis} />
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
          <table role="table" className="admin-data-table w-full text-left text-xs sm:text-sm">
            <thead className="font-mono text-[11px] uppercase tracking-wider text-text-muted border-b border-line">
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
                  <td data-label="#" className="py-2.5 pr-2 font-mono text-xs text-text-muted">{c.id}</td>
                  <td data-label="Mesa" className="py-2.5 pr-2 font-mono text-xs text-text">{c.mesa}</td>
                  <td data-label="Cliente" className="py-2.5 pr-2 truncate max-w-[8rem] text-text">
                    {c.cliente || "—"}
                  </td>
                  <td data-label="Cobrado" className="py-2.5 pr-2 font-mono text-xs font-bold text-status-success-ink">
                    {BRL(Number(c.valorCobrado ?? c.valor ?? 0))}
                  </td>
                  <td data-label="Forma" className="py-2.5 pr-2 font-mono text-[11px] uppercase text-text-muted">
                    {c.forma || "—"}
                  </td>
                  <td data-label="Fechada" className="py-2.5 pr-2 font-mono text-[11px] text-text-muted">
                    {c.fechadaEm ? String(c.fechadaEm).slice(0, 16).replace("T", " ") : "—"}
                  </td>
                  <td data-label="Recibo" className="py-2.5">
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
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-line-strong">
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
                <div className="border-t border-line px-3 py-3 space-y-2 bg-surface-sunken">
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
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line">
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
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-line-strong">
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
  const [sub, setSub] = useState<"relatorio" | "historico" | "senhas" | "purge">("relatorio");
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [contasGoogle, setContasGoogle] = useState<Array<{ id: number; nome: string; login: string; papel: string; email?: string | null; googleVinculado?: boolean }>>([]);
  const [carregandoContas, setCarregandoContas] = useState(false);
  const [modalEmailsAberto, setModalEmailsAberto] = useState(false);
  const [contaNovoEmail, setContaNovoEmail] = useState("");
  const [novoEmailGoogle, setNovoEmailGoogle] = useState("");
  const [salvandoEmail, setSalvandoEmail] = useState<number | null>(null);
  const [removendoEmail, setRemovendoEmail] = useState<number | null>(null);
  const [mensagemGoogle, setMensagemGoogle] = useState<string | null>(null);
  const [histFrom, setHistFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return dataLocal(d);
  });
  const [histTo, setHistTo] = useState(() => dataLocal());
  const [purgeBefore, setPurgeBefore] = useState("");
  const [purgeInfo, setPurgeInfo] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sub !== "senhas") return;
    let ativo = true;
    setCarregandoContas(true);
    api.contasStaff().then((lista) => {
      if (!ativo) return;
      setContasGoogle(lista);
    }).catch((e: any) => { if (ativo) setMensagemGoogle(e.message || "Não foi possível carregar as contas."); })
      .finally(() => { if (ativo) setCarregandoContas(false); });
    return () => { ativo = false; };
  }, [sub]);

  const salvarEmailGoogle = async () => {
    const id = Number(contaNovoEmail);
    if (!Number.isSafeInteger(id) || id <= 0 || !novoEmailGoogle.trim()) return;
    setSalvandoEmail(id); setMensagemGoogle(null);
    try {
      const atualizado = await api.definirEmailGoogle(id, novoEmailGoogle.trim());
      setContasGoogle((lista) => lista.map((c) => c.id === id ? { ...c, email: atualizado.staff.email, googleVinculado: Boolean(atualizado.staff.googleVinculado) } : c));
      setNovoEmailGoogle("");
      setContaNovoEmail("");
      setMensagemGoogle(atualizado.staff.googleDesvinculado
        ? `E-mail atualizado e identidade Google anterior desvinculada. ${atualizado.staff.sessoesRevogadas || 0} sessão(ões) encerrada(s).`
        : "E-mail autorizado salvo. O vínculo Google será concluído no próximo login.");
    } catch (e: any) { setMensagemGoogle(e.message || "Não foi possível cadastrar o e-mail."); }
    finally { setSalvandoEmail(null); }
  };

  const removerEmailGoogle = async (id: number) => {
    const conta = contasGoogle.find((item) => item.id === id);
    if (!conta || (!conta.email && !conta.googleVinculado)) return;
    const confirmado = await confirmarAcao({
      titulo: conta.googleVinculado ? "Desvincular conta Google?" : "Remover e-mail autorizado?",
      mensagem: `O e-mail Google de ${conta.nome} será removido e, se houver, a identidade Google será desvinculada. A conta do funcionário continuará ativa para login com usuário e senha; as sessões abertas serão encerradas.`,
      confirmar: conta.googleVinculado ? "Desvincular e remover" : "Remover e-mail",
      perigo: true,
    });
    if (!confirmado) return;
    setRemovendoEmail(id);
    setMensagemGoogle(null);
    try {
      const atualizado = await api.removerEmailGoogle(id);
      setContasGoogle((lista) => lista.map((c) => c.id === id ? { ...c, email: atualizado.staff.email, googleVinculado: false } : c));
      setMensagemGoogle(atualizado.staff.googleDesvinculado
        ? `E-mail removido e Google desvinculado de ${conta.nome}. ${atualizado.staff.sessoesRevogadas || 0} sessão(ões) encerrada(s).`
        : `E-mail autorizado de ${conta.nome} removido.`);
    } catch (e: any) { setMensagemGoogle(e.message || "Não foi possível remover o e-mail."); }
    finally { setRemovendoEmail(null); }
  };

  const subs = [
    { id: "relatorio" as const, label: "Relatório", Icon: FileText },
    { id: "historico" as const, label: "Histórico", Icon: Receipt },
    { id: "senhas" as const, label: "Logins", Icon: Key },
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
        `Prévia: ${out.sessoes ?? 0} sessão(ões), ${out.pedidos ?? 0} pedido(s) e ${out.itens ?? 0} item(ns) com dados pessoais antes de ${purgeBefore}. ` +
          `${out.contasPreservadas ?? 0} conta(s) e ${out.pagamentosPreservados ?? 0} pagamento(s) serão preservados.`,
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
    const confirmado = await confirmarAcao({
      titulo: "Anonimizar dados pessoais?",
      mensagem: `Os nomes de cliente e as observações livres das contas fechadas antes de ${purgeBefore} serão substituídos por "${ANONIMIZADO}". Valor, forma de pagamento, data e autoria dos lançamentos NÃO são alterados: as contas continuam em Relatório, Comprovantes e Histórico. Mesas abertas e pedidos em andamento não entram nesta operação. Esta troca não pode ser desfeita.`,
      confirmar: "Anonimizar",
      perigo: true,
    });
    if (!confirmado) return;
    setBusy(true);
    try {
      const out = await api.purgeHistorico({ before: purgeBefore, dryRun: false, confirm: true });
      setPurgeMsg(out.message || `Anonimizado até ${purgeBefore}.`);
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
        data-admin-tabs
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

      {sub === "relatorio" && <Relatorio />}
      {sub === "senhas" && (
        <>
          {/* #55 — 2FA da própria conta. Fica no topo porque é a proteção da
              conta que o admin está usando agora, não de terceiros. */}
          <SegurancaConta />
          <section className="rounded-md border border-line bg-surface-raised p-5">
            <h3 className="font-display text-2xl font-bold tracking-tight text-text">Logins e senhas</h3>
            <p className="mt-1 mb-4 text-sm text-text-muted">Redefina a senha de uma conta de acesso. As sessões anteriores dessa conta serão encerradas.</p>
            <Btn variant="secondary" onClick={() => setTrocandoSenha(true)}><Key size={16} /> Redefinir senha de um setor</Btn>
            {trocandoSenha && <TrocarSenha obrigatorio={false} onClose={() => setTrocandoSenha(false)} />}
          </section>
          <section className="rounded-md border border-line bg-surface-raised p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl font-bold tracking-tight text-text">Acesso com Google</h3>
                <p className="mt-1 text-sm text-text-muted">Visualize os e-mails autorizados para cada conta. O cadastro e a remoção são feitos em uma janela própria.</p>
              </div>
              <Btn variant="secondary" onClick={() => { setMensagemGoogle(null); setModalEmailsAberto(true); }}>
                <Plus size={16} weight="bold" /> Gerenciar e-mails
              </Btn>
            </div>
            {carregandoContas ? <p className="mt-4 text-xs text-text-muted">Carregando contas...</p> : (
              <div className="mt-4 divide-y divide-line rounded-sm border border-line">
                {contasGoogle.map((conta) => (
                  <div key={conta.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">{conta.nome}</p>
                      <p className="text-xs text-text-muted">{conta.papel} · {conta.login}</p>
                    </div>
                    <div className="min-w-0 text-right">
                      {conta.email ? (
                        <>
                          <p className="break-all text-sm text-text">{conta.email}</p>
                          <p className="mt-0.5 text-[11px] text-text-muted">{conta.googleVinculado ? "Google vinculado" : "Aguardando primeiro login"}</p>
                        </>
                      ) : <p className="text-xs text-text-subtle">Nenhum e-mail cadastrado</p>}
                    </div>
                  </div>
                ))}
                {!contasGoogle.length && <p className="px-3 py-5 text-center text-xs text-text-muted">Nenhuma conta encontrada.</p>}
              </div>
            )}
            {mensagemGoogle && <p role="status" className="mt-3 text-xs text-brand-ink">{mensagemGoogle}</p>}
          </section>
          <Modal open={modalEmailsAberto} className="admin-dialog" onClose={() => setModalEmailsAberto(false)} wide labelledBy="gerenciar-emails-titulo">
            <div className="p-5 sm:p-6">
              <div className="border-b border-line pb-3">
                <h2 id="gerenciar-emails-titulo" className="font-display text-2xl font-bold tracking-tight text-text">Gerenciar e-mails Google</h2>
                <p className="mt-1 text-sm text-text-muted">Cadastre um endereço para uma conta ou remova um vínculo existente.</p>
              </div>
              <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void salvarEmailGoogle(); }}>
                <label className="block text-[11px] font-semibold text-text-muted">
                  Conta
                  <select value={contaNovoEmail} onChange={(e) => setContaNovoEmail(e.target.value)} required className="mt-1 block h-11 w-full rounded-sm border border-line-strong bg-surface-sunken px-3 text-sm text-text">
                    <option value="">Selecione uma conta sem e-mail</option>
                    {contasGoogle.filter((conta) => !conta.email && !conta.googleVinculado).map((conta) => (
                      <option key={conta.id} value={conta.id}>{conta.nome} · {conta.papel} · {conta.login}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] font-semibold text-text-muted">
                  E-mail para cadastro
                  <input type="email" value={novoEmailGoogle} onChange={(e) => setNovoEmailGoogle(e.target.value)} placeholder="funcionario@gmail.com" required className="mt-1 block h-11 w-full rounded-sm border border-line-strong bg-surface-sunken px-3 text-sm text-text" />
                </label>
                <Btn full type="submit" disabled={!contaNovoEmail || !novoEmailGoogle.trim() || salvandoEmail !== null}>
                  <Plus size={15} weight="bold" /> {salvandoEmail ? "Salvando..." : "Cadastrar e-mail"}
                </Btn>
              </form>
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-text">E-mails cadastrados</h3>
                <div className="mt-2 divide-y divide-line rounded-sm border border-line">
                  {contasGoogle.filter((conta) => conta.email || conta.googleVinculado).map((conta) => (
                    <div key={conta.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="break-all text-sm text-text">{conta.email || "E-mail não informado"}</p>
                        <p className="mt-0.5 text-[11px] text-text-muted">{conta.nome} · {conta.googleVinculado ? "Google vinculado" : "Não vinculado"}</p>
                      </div>
                      <button type="button" title={conta.googleVinculado ? "Desvincular e remover e-mail" : "Remover e-mail"} aria-label={conta.googleVinculado ? `Desvincular e remover e-mail de ${conta.nome}` : `Remover e-mail de ${conta.nome}`} disabled={salvandoEmail === conta.id || removendoEmail === conta.id} onClick={() => void removerEmailGoogle(conta.id)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-line bg-surface-sunken text-text-muted transition-colors hover:border-status-danger-border hover:bg-status-danger-surface hover:text-status-danger-ink disabled:pointer-events-none disabled:opacity-50">
                        <Trash size={16} />
                      </button>
                    </div>
                  ))}
                  {!contasGoogle.some((conta) => conta.email || conta.googleVinculado) && <p className="px-3 py-5 text-center text-xs text-text-muted">Nenhum e-mail cadastrado.</p>}
                </div>
              </div>
              {mensagemGoogle && <p role="status" className="mt-3 text-xs text-brand-ink">{mensagemGoogle}</p>}
              <div className="mt-5 flex justify-end">
                <Btn variant="outline" onClick={() => setModalEmailsAberto(false)}>Concluir</Btn>
              </div>
            </div>
          </Modal>
        </>
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
          <div className="flex items-start gap-2 mb-1">
            <h3 className="font-display text-2xl font-bold tracking-tight text-text">
              Anonimizar histórico antigo
            </h3>
            <button
              type="button"
              onClick={() => setPurgeInfo((v) => !v)}
              aria-expanded={purgeInfo}
              aria-controls="purgeRetentionInfo"
              aria-label="Prazos de retenção e o que esta anonimização faz"
              title="Prazos de retenção e o que esta anonimização faz"
              className="mt-1 inline-grid h-7 w-7 shrink-0 place-items-center rounded-sm border border-line-strong text-text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Info size={16} weight="regular" aria-hidden="true" />
            </button>
          </div>
          <p className="text-xs text-text-muted mb-4">
            Substitui por {ANONIMIZADO} os nomes de cliente e as observações livres das contas
            encerradas antes da data escolhida. Valor, forma de pagamento, data e autoria são
            preservados — as contas continuam em Relatório, Comprovantes recentes e Histórico.
            Mesas abertas não são afetadas. Confira a prévia antes de executar.
          </p>
          {purgeInfo && (
            <div
              id="purgeRetentionInfo"
              className="mb-4 rounded-sm border border-line-strong bg-surface-sunken p-3 text-xs text-text"
            >
              <p className="font-semibold mb-1">Prazos de retenção definidos pelo responsável</p>
              <ul className="list-disc pl-5 space-y-0.5 text-text-muted">
                <li>Contas fechadas, pedidos e itens: até 12 meses após o fechamento.</li>
                <li>Registros financeiros e comprovantes: até 5 anos — não são anonimizados aqui.</li>
                <li>Auditoria e eventos de credencial: até 24 meses, em trilha separada.</li>
                <li>Logs da aplicação e do provedor: até 90 dias, fora deste painel.</li>
                <li>Fila offline do PWA do garçom: no aparelho, até sincronizar ou limpar os dados.</li>
              </ul>
              <p className="mt-2 text-text-muted">
                Esta operação é <strong>manual</strong> e não roda em agendamento: revise a cada
                90 dias, sempre com a prévia antes de executar. Nada é apagado do histórico — só o
                dado pessoal digitado pelo cliente ou sobre ele é substituído. Não pode ser
                desfeito.
              </p>
            </div>
          )}
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
              Anonimizar
            </Btn>
          </div>
          {purgeMsg && <p className="mt-3 font-mono text-xs text-brand-ink">{purgeMsg}</p>}
        </section>
      )}
    </div>
  );
}
