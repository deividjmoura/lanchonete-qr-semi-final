> **Arquivo histórico — não é referência visual vigente.** A identidade atualmente aprovada para revisão está em [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md). Não reutilizar paleta, tipografia, componentes ou direção visual descritos neste documento como base para novas telas.

# 00 — Inventário Visual e Estrutural do QRAdmin

**Data:** 2026-11-08  
**Fonte:** código em `main` (SHA aproximado a0449805…), produção `https://qradmin.up.railway.app/`, README e arquivos de tokens/CSS.  
**Escopo:** apenas o que existe. Nada inventado. Nenhuma alteração funcional neste documento.

---

## 1. Rotas e telas

### 1.1 SPA (React + Vite, hash router — `src/router.tsx`)

| Rota (hash) | Tela / arquivo principal | Papel | Observação |
|-------------|--------------------------|-------|------------|
| `/` ou `#/` | Landing (`src/screens/Landing.tsx` + `src/screens/landing/*`) | Público | Landing comercial + modal de acesso unificado |
| `#/login` | Login (`src/screens/Login.tsx`) | Público / staff | Fluxo de autenticação por papel |
| `#/mesa/:token` | Mesa / Cardápio cliente (`src/screens/Mesa.tsx` + `mesa-praia.css`) | Cliente | Cardápio, personalização, carrinho, conta, Pix |
| `#/cozinha` | Cozinha (`src/screens/Cozinha.tsx`) | Cozinha | Fila por setor (usa `FilaProducao`) |
| `#/bar` | Bar (`src/screens/Bar.tsx`) | Bar | Fila por setor (usa `FilaProducao`) |
| `#/garcom/:token` | Garçom SPA (`src/screens/Garcom.tsx`) | Garçom | Entrega; PWA principal está em `public/garcom-pwa/` |
| `#/caixa` | Caixa (`src/screens/Caixa.tsx`) | Caixa | Fechamento, divisão, desconto/taxa, Pix |
| `#/admin` e `#/admin/:secao` | Admin (`src/screens/Admin.tsx` + `src/screens/admin/*`) | Admin | Cardápio, mesas/QR, panorama, dashboard, etc. |

**Seções Admin conhecidas** (via `params.secao` e arquivos em `src/screens/admin/`):  
Dashboard (também `src/screens/Dashboard.tsx`), Cardápio & Estoque, Mesas/Praças, Mapa QR, Panorama, Importar Cardápio, Segurança/Conta, Controles Estoque, etc.

### 1.2 PWA Garçom

- `public/garcom-pwa/` (app.js, sw.js, design-tokens.css compartilhado, HTML, manifesto).
- Instalável, offline com IndexedDB, sincronização com backoff e idempotência.
- Tokens e tema compartilhados com a SPA.

### 1.3 HTML legado / estático (public/)

- `guia-sistema.html` — guia visual interativo (demonstrativo, não conectado ao banco).
- `apresentacao.html`
- `admin.html` (legado)
- `politica-de-privacidade.html`, `termos-de-servico.html`
- Assets: logos (`public/logo/`), fontes locais, imagens de demo (`public/assets/demo/*.webp`), capturas de apresentação, backgrounds por área (`bg-cozinha.webp`, `bg-caixa.webp`, etc.).

Nenhuma rota de recuperação de senha standalone, login Google isolado ou “recibos” como tela própria além do que já existe no fluxo de caixa/comprovante.

---

## 2. Componentes compartilhados e padrões de UI

### 2.1 Componentes em `src/components/`

| Componente | Função |
|------------|--------|
| `OpsShell.tsx` + `.css` | Shell operacional (sidebar colapsável / gaveta mobile, navegação por papel) |
| `FilaProducao.tsx` | Quadro de tickets da cozinha/bar |
| `Toasts.tsx` | Notificações |
| `AuthFlow.tsx` / `AuthModal.tsx` + CSS | Fluxo e modal de autenticação (unificado com landing) |
| `ConfirmacaoGlobal.tsx` | Confirmações |
| `TrocarSenha.tsx` | Troca de senha |
| `Paginacao.tsx` | Paginação |
| `RotaStaff.tsx` | Proteção de rotas staff |
| `ui.tsx` | Primitivos de UI (botões, campos, etc.) |

### 2.2 Outros padrões recorrentes

- Modais de detalhe de mesa, mesas abertas (`src/screens/dashboard/MesasAbertasModal.tsx`, `src/screens/admin/MesaDetalheModal.tsx`).
- Estados de loading / empty / error (presentes nas telas de fila, admin, caixa, mesa).
- Badges de status de item/comanda.
- Numerais tabulares (classe `.tnum` / `font-variant-numeric: tabular-nums`).
- Alertas de voz (Web Speech) — desbloqueio por gesto do usuário preservado.
- SSE para tempo real.

### 2.3 Ícones

- Conjunto principal: **Phosphor Icons** (`@phosphor-icons/react`) — traço consistente, pesos regular / bold / fill.
- Exemplos em uso: CookingPot, Hourglass, Clock, WarningCircle, Printer, ArrowRight, CaretDown (Cozinha, FilaProducao, Login, OpsShell).
- Busca por emojis de UI no código retornou zero ocorrências relevantes; ainda será revalidado em runtime e HTML legado.
- Regra da nova identidade: proibido emoji como ícone de interface.

---

## 3. Origem de estilo

### 3.1 Tokens (fonte única de verdade)

- `public/garcom-pwa/design-tokens.css` — importado pelo SPA em `src/index.css`.
- Arquitetura em 3 níveis:
  1. Primitivos de marca (`--prim-*`) — paleta quente residual (stout, papel, brasa, latão, lúpulo…) + paleta azul/violeta dominante (“Palco”).
  2. Primitivos do palco (`--stage-*`) — superfícies escuras, vidro, hairlines, glows, acentos neon.
  3. Tokens semânticos (`--surface*`, `--text*`, `--brand*`, `--status-*`, etc.) consumidos pelos componentes.
- Tema claro (`data-theme="claro"` / `:root`) e escuro (`data-theme="escuro"` / prefers-color-scheme).
- Fontes auto-hospedadas (woff2 variable):
  - Display: **Fraunces** (SOFT variation)
  - Texto: **Plus Jakarta Sans**
  - Mono / numerais: **JetBrains Mono**
- Escala de raios: `--radius-xs` … `--radius-xl`, `--radius-pill`.
- Sombras: `--shadow-card`, `--shadow-card-hover`, `--shadow-modal` (e elevações de stage).
- Motion: `--dur-fast`, `--dur-page`, `--ease-ticket`, `--ease-snap`; `prefers-reduced-motion` respeitado.

### 3.2 CSS adicional

- `src/index.css` — Tailwind v4 `@theme` que zera defaults e mapeia só tokens; regimes `data-regime="expressive|operational"`; artefatos de ticket (`.ticket-rule`, `.ticket-notch-row`); shell operacional; stage-surface / stage-card; print térmico.
- `src/components/OpsShell.css`
- `src/screens/dashboard.css` (grande)
- `src/screens/operacional.css`
- `src/screens/mesa-praia.css` (cardápio cliente — layout próprio declarado)
- `src/screens/login-fields.css`
- `src/screens/admin/admin-responsive.css`
- `src/components/AuthModal.css`

### 3.3 Tailwind

- Usado, mas com override completo de cores/raios/sombras/fontes para consumir apenas tokens.

### 3.4 Hardcoded / residual

- Backgrounds de área em `public/assets/bg-*.webp` (cozinha, caixa, login, mesa…).
- Possíveis valores legados em HTML estático e CSS de tela específica (a ser quantificado na varredura final).
- Inline styles: poucos (preferência por classes/tokens); inventário completo exige varredura de TSX.

### 3.5 CSP e fontes

- CSP em produção permite `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` e `font-src 'self' https://fonts.gstatic.com data:`.  
- Fontes principais já são auto-hospedadas; qualquer uso residual de Google Fonts deve ser eliminado na migração para não depender de externo e para manter consistência.

---

## 4. Baseline de screenshots

**Status:** parcial (login desktop capturado). Pasta `docs/design/baseline/` preparada.

Plano (sem adicionar dependência ao `package.json`):

- Viewports: 360, 768, 1440.
- Temas: claro e escuro (quando aplicável).
- Telas prioritárias: Landing, Login, Mesa (cardápio), Cozinha, Bar, Garçom (PWA e SPA), Caixa, Admin (dashboard + cardápio + mesas), Guia.
- Ferramenta: Playwright via `npx` fora do projeto ou browser controlado + dados reais/seed.
- Destino: `docs/design/baseline/` (e depois pasta de comparação antes/depois).

Capturas de apresentação já existentes em `public/assets/apresentacao/*.webp` servem como referência histórica, não como baseline controlado desta missão.

---

## 5. Diagnóstico da identidade atual

### O que funciona e deve ser preservado (conhecimento de uso)

- Tokens como única fonte de cor/tipografia/espaço/raio (boa base).
- Separação de regimes (expressive vs operational) e superfícies de “palco” para áreas de dados/operação.
- Tipografia com numerais tabulares e display serifado (Fraunces).
- Shell com sidebar que colapsa e vira gaveta no mobile; alvos ≥ 44–48 px nas áreas operacionais.
- Linguagem de ticket (bordas tracejadas, notch) já presente.
- Contraste alto nas filas e estados de item (cor + forma).
- Tema claro/escuro funcional.
- Cardápio do cliente com layout próprio (fotos protagonistas) — decisão consciente a manter ou refinar apenas com o que o sistema já permite.
- Fontes e ícones principais auto-hospedados; motion contido e respeitoso a reduced-motion.

### O que ainda é genérico ou diluído

- Direção “Palco Azul/Violeta” + glass/halos/gradientes de dashboard SaaS ainda pode parecer de qualquer produto de analytics.
- Paleta quente (brasa/papel/stout) residual e restrita; a identidade global ficou azul/violeta.
- Raios generosos e sombras difusas em vários cartões.
- Possível excesso do padrão “número grande + rótulo pequeno”.
- HTML legado e algumas telas ainda podem carregar visual anterior.
- Teste do “cubra o logo e o nome”: várias telas de operação ainda poderiam pertencer a outro KDS/caixa genérico.

### Contagens objetivas (aproximadas — a refinar)

| Item | Observação |
|------|------------|
| Famílias tipográficas | 3 (Fraunces, Plus Jakarta Sans, JetBrains Mono) |
| Escala de raios | ~6 valores definidos + pill |
| Temas | 2 (claro / escuro) + regimes |
| Cores primitivas | Dezenas (prim- + stage-); semânticos concentrados |
| Gradientes / glows | Presentes em stage-surface, glass-sheen, cards |
| Emojis como ícone de UI | 0 encontrados na busca de código; revalidar runtime |
| Inline styles | Baixo volume aparente |
| Backgrounds de área | Vários `bg-*.webp` |

---

## 6. Superfícies e modos de uso (para a identidade futura)

- **Cozinha / Bar:** ~2 m de distância, mãos ocupadas, luz agressiva → alto contraste, tipografia grande, alvos de ticket inteiros, densidade de fila, zero decoração.
- **Garçom:** celular, uma mão, de pé → zona do polegar, 48 px mínimos, entrega parcial inequívoca.
- **Caixa:** precisão monetária → numerais tabulares alinhados, hierarquia total/pago/restante, Pix e ações finais distintas.
- **Admin:** trabalho de mesa → tabelas como tabelas, filtros claros, densidade sustentável.
- **Cliente (mesa):** celular próprio, pouca luz, fome → fotos em primeiro plano; interface recua; carrinho/conta/Pix claros.
- **Login + HTML legado + Guia:** mesma linguagem; nada pode ficar com visual antigo.

---

## 7. Próximos passos desta missão (ordem)

1. Completar varredura de hardcoded colors, emojis residuais, inline styles e HTML legado (atualizar este inventário).
2. Capturar baselines controlados nos 3 viewports + temas.
3. **Fase 1** — Imersão (software + objetos do mundo real) → Brief (`01-brief.md`) → 3 territórios distintos com prova visual de Cozinha / Caixa / Cliente → **GATE** para aprovação do responsável (Deivid).
4. Só após aprovação: Fundação (tokens refinados), depois ondas por superfície.

**Princípio inegociável:** mudar apenas aparência. Preservar comportamento, APIs, autenticação, SSE, voz, cálculos, CSP e testes.

---

*Documento vivo. Atualizado à medida que a auditoria avança. Direção aprovada: Território A — Comanda de Chapa (2026-11-08).*
