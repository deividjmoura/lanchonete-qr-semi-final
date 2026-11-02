import {
  ArrowSquareOut,
  CheckCircle,
  CloudArrowUp,
  DownloadSimple,
  FileCsv,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Btn, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import type {
  ErroImportCardapio,
  ModoImportCardapio,
  PreviaImportCardapio,
  ResumoImportCardapio,
} from "../../lib/api";
import { confirmarAcao } from "../../lib/confirmacao";
import { cn } from "../../utils/cn";

const LIMITE_BYTES = 2 * 1024 * 1024;
const LIMITE_ERROS_VISIVEIS = 20;

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Frase do resumo final. No modo "atualizar" não existe produto cadastrado,
 * e no modo "substituir" normalmente não existe atualizado — a frase cita só
 * o que realmente aconteceu.
 */
function fraseResumo(r: ResumoImportCardapio) {
  const partes: string[] = [];
  if (r.produtosInseridos > 0) {
    partes.push(
      `${r.produtosInseridos} produto${r.produtosInseridos === 1 ? "" : "s"} cadastrado${r.produtosInseridos === 1 ? "" : "s"}`,
    );
  }
  if (r.produtosAtualizados > 0) {
    partes.push(
      `${r.produtosAtualizados} produto${r.produtosAtualizados === 1 ? "" : "s"} atualizado${r.produtosAtualizados === 1 ? "" : "s"}`,
    );
  }
  const oQue = partes.length ? partes.join(" e ") : "Nenhum produto importado";
  const onde = `${r.categorias} categoria${r.categorias === 1 ? "" : "s"}${
    r.categoriasCriadas > 0 ? ` (${r.categoriasCriadas} nova${r.categoriasCriadas === 1 ? "" : "s"})` : ""
  }`;
  return `${oQue} em ${onde}.`;
}

/**
 * Importação de cardápio completo por CSV — em duas etapas.
 *
 * 1. Prévia: o arquivo é lido e validado no servidor (`/importar/previa`).
 *    Nada é gravado; o usuário vê quantos produtos/categorias entrarão e a
 *    lista de erros por linha.
 * 2. Confirmação: o mesmo arquivo é enviado de novo com `confirmar: true` e o
 *    servidor troca (ou atualiza) o cardápio dentro de uma transação.
 *
 * Se o arquivo tiver qualquer erro, o botão de importar fica desabilitado — e
 * mesmo que algo falhe no meio, o servidor faz ROLLBACK e o cardápio anterior
 * continua intacto.
 */
export function ImportarCardapio({
  open,
  onClose,
  onImportado,
}: {
  open: boolean;
  onClose: () => void;
  onImportado: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [arquivo, setArquivo] = useState<{ nome: string; bytes: number } | null>(null);
  const [previa, setPrevia] = useState<PreviaImportCardapio | null>(null);
  const [modo, setModo] = useState<ModoImportCardapio>("substituir");
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResumoImportCardapio | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const limpar = useCallback(() => {
    setCsv("");
    setArquivo(null);
    setPrevia(null);
    setModo("substituir");
    setErro(null);
    setResultado(null);
    setLendo(false);
    setImportando(false);
    setArrastando(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (!open) limpar();
  }, [open, limpar]);

  const processarArquivo = useCallback(async (file: File | undefined | null) => {
    if (!file) return;
    setErro(null);
    setResultado(null);
    setPrevia(null);
    setCsv("");

    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setArquivo(null);
      setErro("Escolha um arquivo .csv (CSV UTF-8).");
      return;
    }
    if (file.size > LIMITE_BYTES) {
      setArquivo(null);
      setErro(`O arquivo tem ${tamanhoLegivel(file.size)}; o limite é 2 MB. Divida o cardápio em partes.`);
      return;
    }

    setArquivo({ nome: file.name, bytes: file.size });
    setLendo(true);
    try {
      const texto = await file.text();
      setCsv(texto);
      const resposta = await api.previaImportCardapio(texto);
      setPrevia(resposta);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível ler o arquivo.");
    } finally {
      setLendo(false);
    }
  }, []);

  const podeImportar = Boolean(previa?.ok && csv && !lendo && !importando);

  const importar = async () => {
    if (!podeImportar) return;
    const confirmado = await confirmarAcao({
      titulo: modo === "substituir" ? "Substituir o cardápio inteiro?" : "Atualizar o cardápio?",
      mensagem:
        modo === "substituir"
          ? `O cardápio atual sai de linha (fica arquivado no histórico) e entram ${previa?.resumo.produtos} produtos em ${previa?.resumo.categorias} categorias. Se a importação falhar, nada é alterado.`
          : `Os ${previa?.resumo.produtos} produtos do arquivo serão atualizados ou criados. Os demais produtos e categorias continuam como estão.`,
      confirmar: modo === "substituir" ? "Substituir cardápio" : "Atualizar cardápio",
      perigo: modo === "substituir",
    });
    if (!confirmado) return;

    setImportando(true);
    setErro(null);
    try {
      const out = await api.importarCardapio(csv, modo);
      setResultado(out);
      onImportado();
    } catch (e: any) {
      setErro(e?.message || "A importação falhou. O cardápio atual foi mantido.");
    } finally {
      setImportando(false);
    }
  };

  const erros: ErroImportCardapio[] = previa?.erros || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      closeOnBackdrop={!importando}
      labelledBy="importar-cardapio-titulo"
      describedBy="importar-cardapio-descricao"
    >
      <div className="p-5 sm:p-6 space-y-5">
        <header className="space-y-1 pr-12">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink">
            Cardápio
          </p>
          <h2 id="importar-cardapio-titulo" className="font-display text-2xl font-bold tracking-tight text-text">
            Importar cardápio completo
          </h2>
          <p id="importar-cardapio-descricao" className="text-xs leading-relaxed text-text-muted">
            Envie uma planilha <strong className="text-text">CSV UTF-8</strong> com uma linha por produto
            (categoria, nome, descrição, preço, imagem, disponibilidade e ordem). O sistema mostra a prévia
            e só troca o cardápio depois da sua confirmação.
          </p>
        </header>

        {resultado ? (
          <div className="space-y-4" role="status" aria-live="polite">
            <div className="flex items-start gap-3 rounded-md border border-status-success-border bg-status-success-surface p-4">
              <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-status-success-ink" />
              <div className="space-y-1">
                <p className="font-display text-lg font-bold text-text">Cardápio importado</p>
                <p className="text-xs text-text-muted">{fraseResumo(resultado)}</p>
                {resultado.produtosArquivados > 0 && (
                  <p className="text-[11px] leading-relaxed text-text-subtle">
                    {resultado.produtosArquivados} produto{resultado.produtosArquivados === 1 ? "" : "s"} do
                    cardápio anterior saiu{resultado.produtosArquivados === 1 ? "" : "ram"} de linha e
                    fic{resultado.produtosArquivados === 1 ? "ou" : "aram"} guardado{resultado.produtosArquivados === 1 ? "" : "s"} apenas no
                    histórico de vendas.
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="secondary" onClick={limpar}>
                Importar outro arquivo
              </Btn>
              <Btn onClick={onClose}>Fechar</Btn>
            </div>
          </div>
        ) : (
          <>
            {/* ---------------- Passo 1: arquivo ---------------- */}
            <section className="space-y-2" aria-labelledby="importar-cardapio-arquivo">
              <h3 id="importar-cardapio-arquivo" className="sr-only">
                Arquivo CSV
              </h3>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  void processarArquivo(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors",
                  arrastando
                    ? "border-brand bg-brand-surface"
                    : "border-line-strong bg-surface-sunken/40",
                )}
              >
                <span className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface-raised text-brand-ink">
                  <CloudArrowUp size={22} weight="duotone" />
                </span>
                <p className="text-sm font-semibold text-text">Arraste o arquivo aqui</p>
                <label className="cursor-pointer text-xs font-semibold text-brand-ink underline underline-offset-2 hover:text-brand">
                  ou escolha o CSV no computador
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => void processarArquivo(e.target.files?.[0])}
                  />
                </label>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-subtle">
                  CSV UTF-8 · até 2 MB
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 font-mono text-[11px] text-text-muted">
                  <FileCsv size={14} className="text-brand-ink" />
                  {arquivo ? (
                    <>
                      {arquivo.nome}
                      <span className="text-text-subtle">· {tamanhoLegivel(arquivo.bytes)}</span>
                    </>
                  ) : (
                    "cardapio_completo.csv"
                  )}
                </p>
                <a
                  href="/api/admin/cardapio/modelo.csv"
                  download="cardapio_completo.csv"
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-brand-ink underline underline-offset-2 hover:text-brand"
                >
                  <DownloadSimple size={14} weight="bold" />
                  Baixar modelo
                  <ArrowSquareOut size={12} />
                </a>
              </div>

              {erro && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-sm border border-status-danger-border bg-status-danger-surface px-3 py-2 text-xs text-status-danger-ink"
                >
                  <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
                  {erro}
                </p>
              )}
              {lendo && (
                <p role="status" className="font-mono text-[11px] text-text-muted">
                  Lendo e validando o arquivo…
                </p>
              )}
            </section>

            {/* ---------------- Passo 2: prévia ---------------- */}
            {previa && (
              <section className="space-y-3" aria-labelledby="importar-cardapio-previa">
                <h3 id="importar-cardapio-previa" className="sr-only">
                  Prévia da importação
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-line bg-surface-sunken/50 px-4 py-3">
                    <p className="font-display text-3xl font-bold leading-none text-text tnum">
                      {previa.resumo.produtos}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      Produtos encontrados
                    </p>
                  </div>
                  <div className="rounded-md border border-line bg-surface-sunken/50 px-4 py-3">
                    <p className="font-display text-3xl font-bold leading-none text-text tnum">
                      {previa.resumo.categorias}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      Categorias encontradas
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="sage">{previa.resumo.disponiveis} disponíveis</Badge>
                  {previa.resumo.indisponiveis > 0 && (
                    <Badge tone="neutral">{previa.resumo.indisponiveis} indisponíveis</Badge>
                  )}
                  <Badge tone="sky">{previa.resumo.comImagem} com imagem</Badge>
                  {previa.resumo.linhasIgnoradas > 0 && (
                    <Badge tone="neutral">{previa.resumo.linhasIgnoradas} linha(s) em branco</Badge>
                  )}
                </div>

                {previa.categorias.length > 0 && (
                  <ul className="space-y-1 rounded-md border border-line bg-surface-raised p-3">
                    {previa.categorias.slice(0, 8).map((c) => (
                      <li key={c.nome} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate font-semibold text-text">{c.nome}</span>
                        <span className="shrink-0 font-mono text-text-muted">
                          {c.produtos} {c.produtos === 1 ? "item" : "itens"}
                        </span>
                      </li>
                    ))}
                    {previa.categorias.length > 8 && (
                      <li className="pt-1 font-mono text-[11px] text-text-subtle">
                        + {previa.categorias.length - 8} categoria(s)
                      </li>
                    )}
                  </ul>
                )}

                {erros.length > 0 && (
                  <div
                    role="alert"
                    className="rounded-md border border-status-danger-border bg-status-danger-surface p-3"
                  >
                    <p className="flex items-center gap-1.5 text-xs font-bold text-status-danger-ink">
                      <WarningCircle size={15} weight="bold" />
                      {erros.length} problema{erros.length === 1 ? "" : "s"} — corrija a planilha e envie de novo
                    </p>
                    <ul className="mt-2 space-y-1">
                      {erros.slice(0, LIMITE_ERROS_VISIVEIS).map((e, i) => (
                        <li key={`${e.linha}-${e.coluna}-${i}`} className="text-[11px] leading-relaxed text-status-danger-ink">
                          <span className="font-mono font-bold">linha {e.linha || "—"}</span>
                          {e.coluna && <span className="font-mono"> · {e.coluna}</span>}
                          {" — "}
                          {e.mensagem}
                        </li>
                      ))}
                    </ul>
                    {erros.length > LIMITE_ERROS_VISIVEIS && (
                      <p className="mt-2 font-mono text-[11px] text-status-danger-ink">
                        e mais {erros.length - LIMITE_ERROS_VISIVEIS}…
                      </p>
                    )}
                  </div>
                )}

                {previa.avisos.length > 0 && (
                  <ul className="space-y-1 rounded-sm border border-line bg-surface-sunken/50 px-3 py-2">
                    {previa.avisos.map((a) => (
                      <li key={a} className="text-[11px] leading-relaxed text-text-muted">
                        {a}
                      </li>
                    ))}
                  </ul>
                )}

                {previa.ok && (
                  <fieldset className="space-y-2">
                    <legend className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      Como aplicar
                    </legend>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors",
                        modo === "substituir"
                          ? "border-brand-border bg-brand-surface"
                          : "border-line bg-surface-raised hover:border-line-strong",
                      )}
                    >
                      <input
                        type="radio"
                        name="modo-importacao"
                        value="substituir"
                        checked={modo === "substituir"}
                        onChange={() => setModo("substituir")}
                        className="mt-0.5 accent-[var(--brand)]"
                      />
                      <span>
                        <span className="block text-xs font-bold text-text">Substituir cardápio inteiro</span>
                        <span className="block text-[11px] leading-relaxed text-text-muted">
                          O cardápio atual sai de linha e fica arquivado no histórico; entram apenas os
                          produtos deste arquivo.
                        </span>
                      </span>
                    </label>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors",
                        modo === "atualizar"
                          ? "border-brand-border bg-brand-surface"
                          : "border-line bg-surface-raised hover:border-line-strong",
                      )}
                    >
                      <input
                        type="radio"
                        name="modo-importacao"
                        value="atualizar"
                        checked={modo === "atualizar"}
                        onChange={() => setModo("atualizar")}
                        className="mt-0.5 accent-[var(--brand)]"
                      />
                      <span>
                        <span className="block text-xs font-bold text-text">Atualizar produtos existentes</span>
                        <span className="block text-[11px] leading-relaxed text-text-muted">
                          Atualiza os produtos com a mesma categoria e nome e cria os novos. Os demais
                          continuam como estão.
                        </span>
                      </span>
                    </label>
                  </fieldset>
                )}
              </section>
            )}

            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              <Btn variant="secondary" onClick={onClose} disabled={importando}>
                Cancelar
              </Btn>
              <Btn onClick={() => void importar()} disabled={!podeImportar}>
                {importando ? (
                  "Importando…"
                ) : (
                  <>
                    <CloudArrowUp size={16} weight="bold" />
                    {modo === "substituir" ? "Substituir cardápio" : "Atualizar cardápio"}
                  </>
                )}
              </Btn>
            </footer>
          </>
        )}
      </div>
    </Modal>
  );
}
