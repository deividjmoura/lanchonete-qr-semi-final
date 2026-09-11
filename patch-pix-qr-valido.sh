#!/usr/bin/env bash
# =============================================================================
# Patch: PIX QR válido — usa /api/config/pix (Railway .env) + chave EMV correta
# Execute na RAIZ do projeto.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f src/lib/utils.ts ]] || [[ ! -f src/screens/Caixa.tsx ]]; then
  echo "❌ Rode na raiz (precisa de src/lib/utils.ts e src/screens/Caixa.tsx)"
  exit 1
fi

echo "▶ Corrigindo geração do PIX EMV..."

cp -n src/lib/utils.ts "src/lib/utils.ts.bak.$(date +%s)" 2>/dev/null || true
cp -n src/screens/Caixa.tsx "src/screens/Caixa.tsx.bak.$(date +%s)" 2>/dev/null || true
cp -n src/lib/api.ts "src/lib/api.ts.bak.$(date +%s)" 2>/dev/null || true
cp -n src/lib/data.ts "src/lib/data.ts.bak.$(date +%s)" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 1) utils.ts — montarPixEMV com chave correta (CPF/CNPJ/e-mail/EVP/telefone)
# ---------------------------------------------------------------------------
cat > src/lib/utils.ts << 'TS'
/* Formatação + payload PIX (EMV / BR Code) com CRC16-CCITT-FALSE */

export const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const hora = (ts: number) =>
  new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const elapsed = (ts: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
};

/* ---------------- PIX EMV (BR Code) ---------------- */

/** CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — padrão BACEN/BR Code */
function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const emv = (id: string, valor: string) =>
  `${id}${String(valor.length).padStart(2, "0")}${valor}`;

const asciiLimpo = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/**
 * Normaliza a chave PIX sem destruir e-mail nem chave aleatória (EVP).
 * - e-mail → lowercase
 * - telefone → +55… (só dígitos com +)
 * - CPF (11) / CNPJ (14) → só dígitos
 * - EVP / outros → trim, mantém letras e hífens
 */
export function normalizarChavePix(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";

  if (s.includes("@")) return s.toLowerCase();

  // Já está em formato E.164 (+55…)
  if (s.startsWith("+")) return s.replace(/\s/g, "");

  const digits = s.replace(/\D/g, "");

  // CPF
  if (digits.length === 11 && !/[a-zA-Z]/.test(s)) return digits;
  // CNPJ
  if (digits.length === 14 && !/[a-zA-Z]/.test(s)) return digits;
  // Celular BR 10/11 dígitos → +55
  if (digits.length === 10 || digits.length === 11) {
    if (/^[1-9]/.test(digits)) return `+55${digits}`;
  }
  // Já veio com 55…
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith("55")) {
    return `+${digits}`;
  }

  // EVP (UUID) ou chave desconhecida: não stripa letras
  return s.replace(/\s/g, "");
}

export function montarPixEMV(opts: {
  chave: string;
  nome: string;
  cidade: string;
  valor?: number | null;
  txid?: string;
}): string {
  const chave = normalizarChavePix(opts.chave);
  if (!chave || chave === "00000000000" || chave === "00000000000000") {
    // Payload de placeholder que o banco rejeita — evita QR “bonito” mas inválido
    console.warn("[PIX] chave vazia ou placeholder — configure PIX_CHAVE no servidor");
  }

  const nome = asciiLimpo(opts.nome).slice(0, 25) || "RECEBEDOR";
  const cidade = asciiLimpo(opts.cidade).slice(0, 15) || "BRASIL";
  const gui = emv("00", "BR.GOV.BCB.PIX");
  const key = emv("01", chave);
  const mai = emv("26", gui + key);

  let txid = String(opts.txid || "***")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 25);
  if (!txid) txid = "***";

  const valorStr =
    opts.valor != null && Number(opts.valor) > 0
      ? Number(opts.valor).toFixed(2)
      : "";

  // Payload estático (sem 01/12). Campo 54 só se houver valor.
  let payload =
    emv("00", "01") +
    mai +
    emv("52", "0000") +
    emv("53", "986") +
    (valorStr ? emv("54", valorStr) : "") +
    emv("58", "BR") +
    emv("59", nome) +
    emv("60", cidade) +
    emv("62", emv("05", txid)) +
    "6304";

  return payload + crc16(payload);
}
TS
echo "  ✓ src/lib/utils.ts"

# ---------------------------------------------------------------------------
# 2) api.ts — helper configPix
# ---------------------------------------------------------------------------
python3 << 'PY'
from pathlib import Path
p = Path("src/lib/api.ts")
text = p.read_text(encoding="utf-8")
if "configPix" in text:
    print("  ✓ api.configPix já existe")
else:
    # injeta dentro de export const api = {
    needle = "  pixInformado:"
    insert = '''  configPix: () =>
    apiGet<{ chave: string; nome: string; cidade: string }>("/api/config/pix"),
  pixInformado:'''
    if needle in text:
        text = text.replace(needle, insert, 1)
        p.write_text(text, encoding="utf-8")
        print("  ✓ api.configPix adicionado")
    else:
        print("  ⚠ não achei pixInformado em api.ts — adicione configPix manualmente")
PY

# ---------------------------------------------------------------------------
# 3) data.ts — aviso de que PIX_CONFIG é só fallback
# ---------------------------------------------------------------------------
python3 << 'PY'
from pathlib import Path
p = Path("src/lib/data.ts")
text = p.read_text(encoding="utf-8")
old = '''// Dados fictícios — mesmo padrão do .env.example do projeto
export const PIX_CONFIG: PixConfig = {
  chave: "00000000000",
  nome: "MAJOR PUB LTDA",
  cidade: "SAO PAULO",
};'''
new = '''// Fallback local APENAS se /api/config/pix falhar.
// Em produção o Caixa/Mesa usam as variáveis do servidor (Railway).
export const PIX_CONFIG: PixConfig = {
  chave: "",
  nome: "MAJOR PUB",
  cidade: "SAO PAULO",
};'''
if old in text:
    p.write_text(text.replace(old, new), encoding="utf-8")
    print("  ✓ data.ts: PIX_CONFIG sem chave fake 00000000000")
else:
    print("  ⚠ data.ts: bloco PIX_CONFIG diferente — ok se você já alterou")
PY

# ---------------------------------------------------------------------------
# 4) Caixa.tsx — carrega config da API
# ---------------------------------------------------------------------------
python3 << 'PY'
from pathlib import Path
import re

p = Path("src/screens/Caixa.tsx")
text = p.read_text(encoding="utf-8")

# imports
text2 = text
if 'from "../lib/data"' in text and "PIX_CONFIG" in text:
    # remove import PIX_CONFIG se só serve para isso
    text2 = re.sub(
        r'import \{ PIX_CONFIG \} from "\.\./lib/data";\n?',
        "",
        text2,
    )
if 'from "../lib/api"' not in text2 and 'from "../lib/api.ts"' not in text2:
    # adiciona import api
    text2 = text2.replace(
        'import { BRL, elapsed, montarPixEMV } from "../lib/utils";',
        'import { api } from "../lib/api";\nimport { BRL, elapsed, montarPixEMV } from "../lib/utils";\nimport type { PixConfig } from "../lib/types";',
    )
elif "PixConfig" not in text2:
    text2 = text2.replace(
        'import { BRL, elapsed, montarPixEMV } from "../lib/utils";',
        'import { BRL, elapsed, montarPixEMV } from "../lib/utils";\nimport type { PixConfig } from "../lib/types";',
    )
    if 'from "../lib/api"' not in text2:
        text2 = 'import { api } from "../lib/api";\n' + text2

# Troca o bloco do painel de sessão que usa PIX_CONFIG
# Procura a função interna que tem pixCodigo useMemo
old_memo = '''  const pixCodigo = useMemo(
    () =>
      montarPixEMV({
        ...PIX_CONFIG,
        valor: restante > 0.005 ? restante : total,
        txid: `SESSAO${sessao.id}`,
      }),
    [restante, total, sessao.id]
  );'''

new_memo = '''  const [pixCfg, setPixCfg] = useState<PixConfig | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .configPix()
      .then((c) => {
        if (alive && c?.chave) setPixCfg({ chave: c.chave, nome: c.nome, cidade: c.cidade });
      })
      .catch(() => {
        /* sem PIX configurado no servidor */
      });
    return () => {
      alive = false;
    };
  }, []);

  const pixCodigo = useMemo(() => {
    if (!pixCfg?.chave) return "";
    return montarPixEMV({
      chave: pixCfg.chave,
      nome: pixCfg.nome || "RECEBEDOR",
      cidade: pixCfg.cidade || "BRASIL",
      valor: restante > 0.005 ? restante : total,
      txid: `SESSAO${sessao.id}`,
    });
  }, [pixCfg, restante, total, sessao.id]);'''

if old_memo in text2:
    text2 = text2.replace(old_memo, new_memo)
    print("  ✓ Caixa: pixCodigo usa /api/config/pix")
else:
    print("  ⚠ bloco pixCodigo não encontrado exatamente")
    if "PIX_CONFIG" in text2:
        print("    ainda há referência a PIX_CONFIG — verifique manualmente")
    if "configPix" in text2:
        print("    configPix já referenciado")

# UI: se não houver chave, avisa em vez de QR inválido
# Substitui trecho do QR se existir
old_qr = '''                <QRCodeSVG value={pixCodigo} size={86} fgColor="#131009" level="M" />'''
new_qr = '''                {pixCodigo ? (
                  <QRCodeSVG value={pixCodigo} size={86} fgColor="#131009" level="M" />
                ) : (
                  <div className="size-[86px] rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-[9px] text-stone-500 text-center px-1">
                    Configure PIX_CHAVE no servidor
                  </div>
                )}'''
if old_qr in text2:
    text2 = text2.replace(old_qr, new_qr)
    print("  ✓ Caixa: placeholder se PIX não configurado")

p.write_text(text2, encoding="utf-8")
print("  ✓ src/screens/Caixa.tsx salvo")
PY

echo ""
echo "✅ Patch PIX aplicado."
echo ""
echo "Reinicie / rebuild:"
echo "  npm run build && npm start"
echo "  # ou no Railway: push + redeploy"
echo ""
echo "Checklist Railway:"
echo "  PIX_CHAVE=sua chave real (CPF, CNPJ, e-mail, telefone ou EVP)"
echo "  PIX_NOME=NOME SEM ACENTO ATE 25 CHARS"
echo "  PIX_CIDADE=CIDADE ATE 15 CHARS"
echo ""
echo "Teste: abra o Caixa, copie o código PIX e cole no app do banco."
echo "Se ainda falhar, me manda os 30 primeiros caracteres do copia-e-cola (sem a chave completa)."
