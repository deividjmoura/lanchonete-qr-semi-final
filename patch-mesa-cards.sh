#!/usr/bin/env bash
# =============================================================================
# Patch: cards da mesa alinhados (sem texto sobreposto / alturas diferentes)
# Execute na RAIZ do projeto.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f src/screens/Mesa.tsx ]]; then
  echo "❌ Rode na raiz (precisa de src/screens/Mesa.tsx)"
  exit 1
fi

echo "▶ Unificando layout dos cards do cardápio..."

cp -n src/screens/Mesa.tsx "src/screens/Mesa.tsx.bak.cards.$(date +%s)" 2>/dev/null || true
cp -n src/index.css "src/index.css.bak.cards.$(date +%s)" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 1) CSS — não deixar img global quebrar object-cover dos cards
# ---------------------------------------------------------------------------
python3 << 'PY'
from pathlib import Path
p = Path("src/index.css")
text = p.read_text(encoding="utf-8")

# Remove ou restringe a regra agressiva de img
old = """/* cards de produto: impede overflow horizontal de grid */
img, video, canvas, svg {
  max-width: 100%;
  height: auto;
}"""

new = """/* Mídia genérica — NÃO força height:auto em imgs de card (quebra object-cover) */
video, canvas, svg {
  max-width: 100%;
  height: auto;
}
img {
  max-width: 100%;
}
/* Cards do cardápio: imagem preenche o slot de aspect-ratio */
.card-produto img.card-produto-foto {
  width: 100%;
  height: 100%;
  max-width: none;
  object-fit: cover;
  display: block;
}"""

if old in text:
    text = text.replace(old, new)
    print("  ✓ index.css: img global ajustada")
else:
    if "card-produto-foto" not in text:
        text += "\n" + new + "\n"
        print("  ✓ index.css: regras de card anexadas")
    else:
        print("  · index.css já tem card-produto-foto")

# Garante que cards do grid estiquem na mesma altura
if ".card-produto" not in text or "h-full" not in text[text.find("card-produto"):text.find("card-produto")+200] if "card-produto" in text else True:
    extra = """
/* Grid de produtos: cards com altura uniforme */
.grid-cardapio {
  align-items: stretch;
}
.grid-cardapio > * {
  height: 100%;
  min-width: 0;
}
"""
    if "grid-cardapio" not in text:
        text += extra
        print("  ✓ index.css: grid-cardapio")

p.write_text(text, encoding="utf-8")
PY

# ---------------------------------------------------------------------------
# 2) Mesa.tsx — ItemCard reestruturado + grid class
# ---------------------------------------------------------------------------
python3 << 'PY'
from pathlib import Path
import re

p = Path("src/screens/Mesa.tsx")
text = p.read_text(encoding="utf-8")

# grid classes
text = text.replace(
    'className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3.5 w-full min-w-0"',
    'className="grid-cardapio grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3.5 w-full min-w-0"',
)
text = text.replace(
    'className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3.5 pb-28 lg:pb-10 w-full min-w-0"',
    'className="grid-cardapio grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3.5 pb-28 lg:pb-10 w-full min-w-0"',
)

# Substitui a função ItemCard inteira
# Encontra de "function ItemCard" até o fechamento antes de "function PainelComAbas"
m = re.search(
    r"function ItemCard\(\{[\s\S]*?\n\}\n\nfunction PainelComAbas",
    text,
)
if not m:
    # tenta sem newline duplo
    m = re.search(
        r"function ItemCard\([\s\S]*?\n\}\n(?=function PainelComAbas)",
        text,
    )

new_card = r'''function ItemCard({
  produto: p,
  onOpen,
  onAdd,
}: {
  produto: Produto;
  onOpen: (p: Produto) => void;
  onAdd: (p: Produto) => void;
}) {
  const esgotado = p.estoque !== null && p.estoque <= 0;
  const meta =
    p.tipo === "escolher"
      ? "1 opção"
      : p.tipo === "personalizavel"
        ? `${p.adicionais.length} extra${p.adicionais.length === 1 ? "" : "s"}`
        : "pronto";
  const ctaLabel =
    p.tipo === "escolher" ? "Escolher" : p.tipo === "personalizavel" ? "Montar" : "Add";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "card-produto card-img-zoom group relative flex h-full min-h-0 flex-col glass rounded-3xl overflow-hidden",
        esgotado && "opacity-55 grayscale-[0.55]"
      )}
    >
      {/* Foto — altura fixa por aspect-ratio, nunca empurra o texto */}
      <button
        type="button"
        onClick={() => onOpen(p)}
        className="relative block w-full shrink-0 aspect-[4/3] overflow-hidden cursor-pointer text-left bg-black/40"
        aria-label={`Ver ${p.nome}`}
      >
        <img
          src={fotoSrc(p.foto) || FOTO_PLACEHOLDER}
          alt=""
          loading="lazy"
          decoding="async"
          className="card-produto-foto transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).src = FOTO_PLACEHOLDER;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-coal-950/95 via-coal-950/20 to-transparent pointer-events-none" />
        <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1 pointer-events-none z-[1]">
          {p.estoque !== null && p.estoque > 0 && p.estoque <= 8 && (
            <Badge tone="rose" pulse>
              {p.estoque} un
            </Badge>
          )}
          {esgotado && <Badge tone="zinc">esgotado</Badge>}
        </div>
        <span className="absolute bottom-2 left-2 z-[1] rounded-lg bg-black/55 backdrop-blur-sm px-2 py-0.5 font-mono text-xs sm:text-sm font-bold text-white tabular-nums pointer-events-none">
          {BRL(p.preco)}
        </span>
      </button>

      {/* Corpo — flex column com rodapé sempre no fundo */}
      <div className="flex flex-1 flex-col min-h-0 p-2.5 sm:p-3.5 gap-1.5">
        <button
          type="button"
          onClick={() => onOpen(p)}
          className="text-left cursor-pointer min-w-0"
        >
          <h3 className="font-semibold text-white leading-snug text-[13px] sm:text-sm line-clamp-2 min-h-[2.5em] break-words">
            {p.nome}
          </h3>
          <p className="mt-0.5 text-[10px] sm:text-[11px] text-stone-400 leading-snug line-clamp-2 min-h-[2.4em] break-words">
            {descricaoExibida(p.descricao, p.nome, p.categoria) || "\u00a0"}
          </p>
        </button>

        <div className="mt-auto pt-1 flex flex-col gap-1.5 min-w-0">
          <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.14em] font-bold text-stone-500 truncate">
            {meta}
          </span>
          {p.tipo === "simples" ? (
            <Btn
              size="sm"
              full
              disabled={esgotado}
              onClick={() => onAdd(p)}
              className="!h-9 !px-2 !text-[11px] sm:!text-xs shrink-0"
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="truncate">Adicionar</span>
            </Btn>
          ) : (
            <Btn
              size="sm"
              variant="outline"
              full
              disabled={esgotado}
              onClick={() => onOpen(p)}
              className="!h-9 !px-2 !text-[11px] sm:!text-xs shrink-0"
            >
              <span className="truncate">{ctaLabel}</span>
              <ChevronRight className="size-3.5 shrink-0 opacity-80" />
            </Btn>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function PainelComAbas'''

if m:
    text = text[: m.start()] + new_card + text[m.end() :]
    # se o match incluiu "function PainelComAbas", new_card já termina com isso
    # se o end era só o }, precisa cuidado
    # Verifica duplicata
    if text.count("function PainelComAbas") > 1:
        # remove a primeira ocorrência duplicada se new_card já tinha e match também
        parts = text.split("function PainelComAbas")
        text = parts[0] + "function PainelComAbas" + "".join(parts[1:])
        # still might be wrong - better approach
        pass
    print("  ✓ ItemCard reescrito")
else:
    print("  ❌ Não encontrei function ItemCard — abortando parte TSX")
    raise SystemExit(1)

# Dedup PainelComAbas se necessário
while text.count("function PainelComAbas") > 1:
    # remove second occurrence's leading "function PainelComAbas" only once by merging
    i1 = text.find("function PainelComAbas")
    i2 = text.find("function PainelComAbas", i1 + 1)
    if i2 < 0:
        break
    # keep first, drop "function PainelComAbas" keyword at i2 only if consecutive garbage
    # Actually new_card ends with "function PainelComAbas" and old match ended before it OR included it
    text = text[:i2] + text[i2 + len("function PainelComAbas") :]
    print("  ✓ removeu 'function PainelComAbas' duplicado")

# Btn precisa aceitar className e full — checa se full existe
ui = Path("src/components/ui.tsx")
if ui.exists():
    ut = ui.read_text(encoding="utf-8")
    if "full" not in ut[ut.find("export function Btn"):ut.find("export function Btn")+800]:
        # add full prop support lightly
        ut2 = ut.replace(
            "size = \"md\",\n  className,\n  ...rest\n}:",
            "size = \"md\",\n  full = false,\n  className,\n  ...rest\n}:",
        )
        if ut2 == ut:
            ut2 = ut.replace(
                "size = \"md\",",
                "size = \"md\",\n  full = false,",
                1,
            )
        if "full?: boolean" not in ut2:
            ut2 = ut2.replace(
                "size?: \"sm\" | \"md\" | \"lg\";",
                "size?: \"sm\" | \"md\" | \"lg\";\n  full?: boolean;",
                1,
            )
        if "full &&" not in ut2:
            ut2 = ut2.replace(
                "size === \"sm\" && \"h-9 px-3.5 text-xs\",",
                "full && \"w-full justify-center\",\n        size === \"sm\" && \"h-9 px-3.5 text-xs\",",
                1,
            )
        if ut2 != ut:
            ui.write_text(ut2, encoding="utf-8")
            print("  ✓ Btn: prop full")
        else:
            print("  · Btn: não alterado (já pode ter full)")
    else:
        print("  · Btn já tem full")

p.write_text(text, encoding="utf-8")
print("  ✓ Mesa.tsx salvo")
PY

echo ""
echo "✅ Cards da mesa atualizados."
echo ""
echo "  npm run build && npm start"
echo "  # ou só Vite: npm run dev:ui"
echo ""
echo "Mudanças:"
echo "  • altura uniforme (flex + grid stretch)"
echo "  • botão em linha própria (não compete com o texto)"
echo "  • título/descrição com line-clamp e min-height fixos"
echo "  • preço em pill na foto (sem sobrepor o nome)"
echo "  • CSS global de img não quebra mais object-cover"
