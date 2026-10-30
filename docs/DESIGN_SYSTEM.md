# QR Admin — Design System ("A COMANDA / Taproom Brasa")

## 1. Direção Estética e Escolha de Caminho Visual

Três caminhos visuais foram comparados na etapa de concepção para substituir a estética genérica de SaaS:

| Critério | Caminho A — **A COMANDA / Taproom Brasa** *(Escolhido)* | Caminho B — Bistrô Editorial | Caminho C — Terminal Brutalista P&B |
|---|---|---|---|
| Referência física | Comanda impressa de balcão, bolacha de chope em cartão cru, letreiro condensado de pub, latão escovado | Carta de vinhos impressa, serifas clássicas, margens amplas | Cupom fiscal monocromático P&B de alto contraste |
| Leitura operacional a ~1,5 m | Excelente — títulos condensados firmes (`Archivo`) + números tabulares (`Martian Mono`) e status carimbados | Baixa — serifas finas perdem nitidez à distância na cozinha/bar | Boa, porém cansativa sem diferenciação cromática de fila/preparo/pronto |
| Aderência à identidade de pub/taproom | Alta — calor de papel cru (`#F0E6D2`), madeira tostada Stout (`#17120E`), Brasa (`#E8501F`), Latão (`#C99A2E`) e Lúpulo (`#3E7B3A`) | Deslocada para operação ágil de chope e hambúrguer na chapa | Fria; viola a proibição de `#FFFFFF`/`#000000` puros |
| Coerência entre regimes | Transita naturalmente entre regime expressivo (Login, Admin, Mesa) e operacional (Cozinha, Bar, Caixa, PWA do Garçom) | Favorece apenas telas editoriais | Prejudica a acolhida do cardápio na Mesa |

**Justificativa da escolha:** **A COMANDA / Taproom Brasa** ancora toda a interface em artefatos reais do salão brasileiro — o bloco de comanda em papel quente, o picote tracejado de separação de pedido, o carimbo retangular seco de status e o balcão escuro de madeira/ardósia — garantindo personalidade imediata no atendimento e máxima velocidade de varredura sob pressão operacional.

---

## 2. Arquitetura de Tokens em Dois Níveis

A fonte única de verdade reside em `public/garcom-pwa/design-tokens.css` (importada tanto pelo SPA em `src/index.css` quanto pelo PWA em `public/garcom-pwa/index.html`) e espelhada no bootstrap sem flash (`public/garcom-pwa/theme-init.js` e `src/lib/tema.ts`).

No SPA, `src/index.css` executa **override completo** do `@theme` do Tailwind v4 (`--color-*: initial; --radius-*: initial; --shadow-*: initial; --font-*: initial;`), impedindo vazamento da paleta default.

### 2.1 Nível 1 — Primitivos de Marca (`--prim-*`)

Componentes **nunca** consomem `--prim-*` diretamente. Nenhum token usa `#FFFFFF` ou `#000000` puros.

| Token Primitivo | Hex | Papel Físico |
|---|---|---|
| `--prim-stout` | `#17120E` | Madeira tostada / tinta primária no papel / balcão |
| `--prim-stout-profundo` | `#100C09` | Sidebar escura em relação à lousa |
| `--prim-papel` | `#F0E6D2` | Papel de comanda — superfície principal clara |
| `--prim-papel-claro` | `#F7F0E2` | Cartão/comanda elevada em tema claro |
| `--prim-papel-rebaixo` | `#E5D8BE` | Campos, trilhos e áreas rebaixadas em tema claro |
| `--prim-lousa` | `#141813` | Ardósia/grafite quente — superfície principal escura |
| `--prim-lousa-elevada` | `#1C211B` | Comanda elevada em tema escuro |
| `--prim-giz` | `#EDE5D5` | Tinta principal clara sobre lousa e stout |
| `--prim-brasa` | `#E8501F` | Ação primária quente / brasa da chapa |
| `--prim-latao` | `#C99A2E` | Destaque secundário / fila / atenção |
| `--prim-lupulo` | `#3E7B3A` | Pronto / sucesso / mesa livre |
| `--prim-cobalto` | `#2C5FA8` | Em preparo / informação operacional |
| `--prim-carmim` | `#B3261E` | Erro / cancelamento / bloqueio |

### 2.2 Nível 2 — Tokens Semânticos (Consumo Exclusivo pelos Componentes)

| Token Semântico | Tema Claro (`claro`) | Tema Escuro (`escuro`) | Uso e Contraste WCAG AA |
|---|---|---|---|
| `--surface` | `#F0E6D2` (Papel) | `#141813` (Lousa) | Fundo da página |
| `--surface-raised` | `#F7F0E2` | `#1C211B` | Comanda / superfície elevada |
| `--surface-sunken` | `#E5D8BE` | `#0F120E` | Inputs, trilhos de abas, fundos internos |
| `--surface-sidebar` | `#17120E` (Stout) | `#100C09` (Stout profundo) | Barra de navegação lateral/inferior (sempre mais escura que a página) |
| `--text` | `#17120E` (15,0:1) | `#EDE5D5` (14,3:1) | Texto principal (nível AAA) |
| `--text-muted` | `#594B3E` (6,8:1) | `#B0A795` (6,9:1) | Metadados, legendas e apoio (AA+) |
| `--brand` / `--brand-contrast` | `#BF3B11` / `#F7F0E2` (4,8:1) | `#E8501F` / `#17120E` (5,0:1) | Botão primário e carimbo ativo |
| `--brand-ink` | `#B5360D` (5,3:1) | `#FF7D52` (6,5:1) | Texto/ícone de marca sobre superfícies |
| `--accent` / `--accent-ink` | `#C99A2E` / `#755308` (6,2:1) | `#C99A2E` / `#E5B94E` (8,9:1) | Destaque Latão e indicadores de atenção |
| `--line` / `--line-strong` | `#CFC0A3` / `#B09D7B` | `#2E362C` / `#434E40` | Bordas de `1px` sólidas e picotes tracejados |
| `--status-success*` | `#255722` (7,5:1) | `#74BA6F` (7,0:1) | Pedido pronto, conta paga, mesa livre, servidor online |
| `--status-warning*` | `#755308` (6,2:1) | `#E5B94E` (8,9:1) | Novo na fila, pendência offline, aviso PIX |
| `--status-info*` | `#1F4987` (7,8:1) | `#7AA8EB` (6,7:1) | Em preparo, item retirado |
| `--status-danger*` | `#941C15` (7,6:1) | `#F2847D` (6,5:1) | Erro, exclusão, cancelamento, falha de sync |

*Exceção técnica documentada:* áreas ópticas de leitura de QR Code (`.qr-quiet-zone`) usam fundo claro `#F7F0E2` também no tema escuro para preservar leitura imediata por câmeras de celular.

---

## 3. Tipografia Self-Hosted (`<= 150 KB`)

Servida localmente em `public/garcom-pwa/fonts/` sob CSP `'self'`, totalizando **128 KB** (`61 KB + 27 KB + 40 KB`):

1. **Fraunces Soft Variable (`fraunces-latin-soft-normal.woff2`, 61 KB)** — pesos `100–900` e eixo `SOFT` (`0–100`):
   - Títulos e cabeçalhos (`.font-display`): `font-variation-settings: "SOFT" 80`, `letter-spacing: -0.02em`, caixa mista natural e curvas acolhedoras com personalidade gastronômica editorial.
2. **Plus Jakarta Sans Variable (`plus-jakarta-sans-latin-wght-normal.woff2`, 27 KB)** — pesos `200–800`:
   - Corpo, navegação, botões, filtros e controles operacionais com terminações suaves e alta legibilidade.
3. **JetBrains Mono Variable (`jetbrains-mono-latin-wght-normal.woff2`, 40 KB)** — pesos `100–800`:
   - Identificadores de pedido (`#101`), relógios/tempos (`4min`, `14:32`), contadores e códigos PIX (`tabular-nums`).

---

## 4. Sistema Único de Ícones (Phosphor)

- **SPA React:** `@phosphor-icons/react` como conjunto único.
- **PWA do Garçom (JS puro):** sprite vetorial local `public/garcom-pwa/icons.svg` (13,6 KB, 35 símbolos pré-cacheados no Service Worker) gerado a partir dos mesmos glifos oficiais Phosphor (`256×256`).
- **Convenção de estado:** itens de navegação inativos usam traço (`regular`); o item ativo usa preenchimento sólido (`fill`).
- **Zero emojis:** nenhum emoji é utilizado como ícone, estado vazio ou decoração.

---

## 5. Geometria Suave, Bordas e Elevação

- **Cantos orgânicos arredondados:** `--radius-none: 0px`, `--radius-xs: 10px`, `--radius-sm: 14px`, `--radius-md: 20px` (cartões padrão), `--radius-lg: 24px` (painéis de destaque e diálogos), `--radius-xl: 28px` (modais e hero) e `--radius-pill: 9999px` (filtros, badges e botões circulares).
- **Bordas suaves e elevação quente:** cartões elevados (`--surface-raised`) combinam borda sutil de `1px solid var(--line)` com sombra ambiente quente (`--shadow-card` / `--shadow-modal`), sem glassmorphism pesado, sem glow neon e sem aninhamento excessivo.

---

## 6. Regimes Visuais

### 6.1 Regime Expressivo (`data-regime="expressive"`)
- **Telas:** Login, Landing, Admin (Dashboard, Cardápio, Mesas, Garçons, Funções), Cardápio da Mesa (`/mesa/:token`) e estados vazios.
- **Características:** títulos condensados marcantes em Archivo (`wdth 82`), textura sutil de fibra de papel (`opacity: 0.045`, dentro do teto de `4%–6%`), hierarquia editorial de cardápio e comanda.

### 6.2 Regime Operacional (`data-regime="operational"`)
- **Telas:** Cozinha, Bar, Caixa e PWA do Garçom.
- **Características:** zero textura de papel, superfícies secas e limpas, leitura instantânea a ~1,5 m nas filas de preparo, alvos de toque mínimos de `48 px` (`min-h-12`), indicadores objetivos de tempo/setor/garçom e ações em lote diretas.

---

## 7. Navegação e Shell

- **Desktop (`>= 1024px`):** sidebar fixa colapsada em `72 px` (`--sidebar-collapsed`) sobre fundo `--surface-sidebar` (mais escuro que `--surface`). Ao receber `:hover` ou `:focus-within`, expande em sobreposição para `248 px` (`--sidebar-expanded`) sem alterar `margin-left: 72px` do conteúdo principal (zero reflow) e sem botão manual de expandir.
- **Conexão de aba ativa:** o item ativo usa `background: var(--surface)` até a borda direita da barra, com recortes côncavos superior e inferior de `20 px` (`--sidebar-notch`) e indicador deslizante em mola firme (`layoutId="ops-active-rail"`).
- **Dispositivos touch (`< 1024px`):** barra inferior fixa respeitando `env(safe-area-inset-bottom)` e controles de conta/tema/som acessíveis no cabeçalho compacto em todas as larguras.
- **Rota pública `/mesa/:token`:** não renderiza sidebar nem navegação administrativa.

---

## 8. Motion e Acessibilidade

- **Propriedades animadas:** `transform` e `opacity` nas entradas e trocas de estado (`<= 180 ms`; padrão `--dur-page: 160ms`).
- **Curva de comanda:** `--ease-ticket: cubic-bezier(0.22, 1.18, 0.36, 1)` para entrada discreta de comandas e retorno mecânico de carimbo (`.anim-stamp`, `150ms`).
- **Indicador de navegação:** `framer-motion` `layoutId` com spring firme (`stiffness: 520, damping: 38, mass: 0.7`).
- **Movimento reduzido:** `@media (prefers-reduced-motion: reduce)` e `useReducedMotion()` neutralizam deslocamentos e animações contínuas.

---

## 9. Higiene de Produção e Correções Estruturais

- **MIME estático completo (`server.js`):** fontes locais (`.woff2` -> `font/woff2`, `.woff` -> `font/woff`), `.ico` (`image/x-icon`) e `.txt` (`text/plain; charset=utf-8`) são entregues com cabeçalhos MIME oficiais.
- **Impressão térmica (`src/lib/print.ts`):** normalização NFD em `formaLabel()` resolve `débito`, `debito`, `crédito` e `credito` sem chaves com grafia incorreta.
- **Cadastro e estoque no Admin (`src/screens/Admin.tsx`, `src/lib/mappers.ts`, `src/store/usePub.ts`):** produtos sem foto usam fallback local `fotoDemo()` (zero URLs externas Pexels), e `estoqueMinimo` é persistido e carregado ponta a ponta sem sobrescrever com valor fixo `5`.
- **Atualização ativa do Service Worker (`public/garcom-pwa/app.js`):** registro com `{ updateViaCache: 'none' }` e checagem ativa (`swReg?.update()`) ao reconectar (`online`) ou retornar ao primeiro plano (`visibilitychange`).
- **Quiet zone óptica em QR Codes (`.qr-quiet-zone`):** fundo `--qr-paper` (`#F7F0E2`) e tinta `--qr-ink` (`#17120E`) garantem contraste de leitura para câmeras tanto no tema Claro quanto no Escuro.

