# QR Admin — Design System ("Palco Azul/Violeta")

> **Decisão de identidade (2026-11-01):** a referência visual global passa a ser o dashboard
> **"Os números da sua casa"** — superfícies escuras com profundidade, cartões de vidro com camadas,
> acentos violeta/ciano, hairlines internas e tipografia display. Vale para **todo** o sistema:
> Admin, dashboard, gestão de mesas, cozinha, bar, caixa, telas operacionais e PWA do garçom.
> **Exceção única:** a interface do cardápio acessada pelo cliente em `#/mesa/:token`, que mantém
> layout próprio, pensado para o cliente.
>
> A direção anterior ("A COMANDA / Taproom Brasa", papel de comanda + madeira + brasa) foi
> **substituída**. Os primitivos dela continuam declarados apenas como histórico e **não** alimentam
> mais nenhum token semântico (`tests/design-tokens-identidade.test.cjs` trava isso).

---

## 1. Arquitetura de Tokens em Três Níveis

A fonte única de verdade é `public/garcom-pwa/design-tokens.css`, importada **tanto** pelo SPA
(`src/index.css`) **quanto** pelo PWA (`public/garcom-pwa/styles.css` e `index.html`), com bootstrap
sem flash em `public/garcom-pwa/theme-init.js` e `src/lib/tema.ts` (teste garante que os três não
divergem).

| Nível | Prefixo | Papel | Quem consome |
|---|---|---|---|
| 1. Primitivos de marca | `--prim-*` | Valores brutos de paleta (azul-meia-noite, névoa, violeta, azul-água, verdes/âmbar/azul/vermelho de tinta) | apenas os níveis 2 e 3 |
| 1b. Primitivos do palco | `--stage-*` | Superfícies de vidro, camadas, hairlines, acentos neon e sombras das telas escuras | `dashboard.css`, `operacional.css`, `.stage-*` do SPA e PWA |
| 2. Semânticos | `--surface*`, `--text*`, `--brand*`, `--accent*`, `--line*`, `--status-*` | Papel funcional por tema (claro/escuro) | todos os componentes |
| 3. Transversais | `--space-*`, `--dur-*`, `--ease-*`, `--elev-*`, `--glass-*` | Espaçamento, movimento, elevação e composição de vidro | componentes e camadas CSS |

**Regra dura:** arquivos de camada visual (`src/screens/dashboard.css`, `src/screens/operacional.css`)
**não escrevem hex nem rgba** — 0 literais, verificado por teste. Se faltar um valor, crie/peça um
token em vez de escrever a cor no componente.

### 1.1 Nível 1 — Primitivos de marca

| Token | Hex | Papel |
|---|---|---|
| `--prim-meia-noite` | `#0B101B` | Superfície escura base (fundo do palco) |
| `--prim-meia-noite-elevada` | `#141B29` | Cartão/painel sobre a meia-noite |
| `--prim-meia-noite-rebaixo` | `#080D16` | Campos e áreas rebaixadas no escuro |
| `--prim-nevoa` | `#EEF1F8` | Superfície clara base |
| `--prim-nevoa-elevada` | `#F8FAFF` | Cartão elevado no claro |
| `--prim-nevoa-rebaixo` | `#E0E5F1` | Campo/trilho no claro |
| `--prim-violeta` | `#7C5CFF` | Ação primária / acento de marca |
| `--prim-azul-agua` | `#4FD1E0` | Acento secundário / informação operacional |
| `--prim-azul-tinta` / `--prim-azul-medio` / `--prim-azul-claro` | `#121829` / `#48536D` / `#616D88` | Texto e apoio no tema claro |
| `--prim-noite-tinta` / `--prim-noite-medio` / `--prim-noite-claro` | `#EEF1FB` / `#A9B4CC` / `#7F8BA6` | Texto e apoio no tema escuro |

Nenhum token usa `#FFFFFF` ou `#000000` puros (teste de design system).

### 1.2 Nível 2 — Semânticos (contraste medido)

| Token | Claro | Escuro | Contraste medido |
|---|---|---|---|
| `--surface` | `#EEF1F8` | `#0B101B` | — |
| `--text` sobre `--surface` | `#121829` | `#EEF1FB` | 15,6:1 / 16,9:1 (AAA) |
| `--text-muted` sobre `--surface-raised` | `#48536D` | `#A9B4CC` | 7,4:1 / 8,3:1 |
| `--brand` sobre `--brand-contrast` | `#5B3FC4` / `#F8FAFF` | `#8B6FFF` / `#0B101B` | 6,8:1 / 5,3:1 |
| `--brand-ink` sobre `--surface-raised` | `#4A32A6` | `#B7A5FF` | 8,8:1 / 8,1:1 |
| `--accent-ink` | `#0A5A63` | `#8FE6F0` | 7,6:1 / 12,1:1 |
| `--status-*` (success/warning/info/danger) | verdes/âmbar/azul/vermelho escuros | versões claras | ≥ 4,5:1 no escuro, ≥ 5,8:1 no claro |

Todos os pares são validados por `tests/design-system.test.cjs` (WCAG AA/AAA) — nenhuma cor entra
"só no olho".

### 1.3 Nível 3 — Transversais

- **Espaçamento:** `--space-1` (4px) … `--space-9` (48px), múltiplos de 4.
- **Movimento:** `--dur-instant` 90ms, `--dur-quick` 140ms, `--dur-base` 200ms, `--dur-slow` 320ms;
  curvas `--ease-out` e `--ease-in-out`. Em `prefers-reduced-motion`, todas as durações viram 0ms.
- **Elevação:** `--elev-1` … `--elev-4` (camadas de sombra), usadas sempre em conjunto com hairline
  interna, nunca isoladas.
- **Vidro:** `--glass-sheen` (gradiente de brilho), `--glass-border` (hairline), `--glass-blur`,
  `--glass-shadow`. As classes `.stage-surface` e `.stage-card` (em `src/index.css`) já compõem esses
  tokens — **reutilize-as em vez de recriar sombra/gradiente no componente.**

---

## 2. O Palco (`--stage-*`) — como as telas escuras são construídas

Uma tela de palco é sempre a mesma receita: fundo em três paradas (`--stage-bg-2` → `--stage-bg` →
`--stage-bg-3`), dois halos de acento (`--stage-glow-violet`, `--stage-glow-cyan`), grade discreta
(`--stage-grid` com máscara) e cartões de vidro sobrepostos.

| Grupo | Tokens | Uso |
|---|---|---|
| Superfícies | `--stage-bg*`, `--stage-panel*`, `--stage-card*`, `--stage-inset*`, `--stage-scrim` | fundo, painéis, cartões, campos e overlay de diálogo |
| Tinta | `--stage-ink`, `-2`, `-3`, `--stage-ink-muted`, `-muted-2`, `--stage-ink-subtle`, `--stage-ink-faint` | hierarquia de texto sobre vidro |
| Linhas | `--stage-line*` (bordas) e `--stage-hairline*` (brilho interno de 1px) | separação e profundidade |
| Acentos | `--stage-violet`, `--stage-cyan`, `--stage-lime`, `--stage-rose`, `--stage-amber`, `--stage-mint` (+ `-deep`, `-soft`, `-ink`) | séries de dados, ícones e estados por cartão |
| Estados | `--stage-ok-*`, `--stage-warn-*`, `--stage-danger-*`, `--stage-info-*` | fila, atraso, erro, informação |
| Sombras/foco | `--stage-shadow-1..4`, `--stage-shadow-inset`, `--stage-focus` | camadas e anel de foco |

Quem consome hoje: `src/screens/dashboard.css` (palco do dashboard) e `src/screens/operacional.css`
(cozinha/bar). Os dois passaram de **212 literais de cor** para **zero**, sem mudança de pixel: cada
literal foi mapeado para o token exato do valor original.

---

## 3. Tipografia Self-Hosted (`<= 150 KB`)

Servida localmente em `public/garcom-pwa/fonts/` sob CSP `'self'`, totalizando **128 KB**:

1. **Fraunces Soft Variable (61 KB)** — títulos e números grandes (`--font-display`), `SOFT 80`,
   `letter-spacing: -0.02em`.
2. **Plus Jakarta Sans Variable (27 KB)** — corpo, navegação, botões e controles (`--font-sans`).
3. **JetBrains Mono Variable (40 KB)** — identificadores, tempos e valores (`--font-mono`,
   `tabular-nums`).

> Correção de documentação: versões anteriores deste arquivo citavam `Archivo`/`Martian Mono` na
> justificativa e `Fraunces`/`Plus Jakarta`/`JetBrains Mono` na seção de tipografia. As fontes
> realmente carregadas são as três acima (`@font-face` no arquivo de tokens, coberto por teste).

---

## 4. Sistema Único de Ícones (Phosphor)

- **SPA React:** `@phosphor-icons/react` como conjunto único; **PWA:** sprite SVG local
  `public/garcom-pwa/icons.svg` gerado dos mesmos glifos.
- Convenção: item inativo em traço (`regular`), item ativo preenchido (`fill`).
- **Zero emojis** como ícone, estado vazio ou decoração.

---

## 5. Geometria, Elevação e Estados

- **Raios:** `--radius-xs` 10px, `--radius-sm` 14px, `--radius-md` 20px (cartões), `--radius-lg` 24px
  (painéis e palcos), `--radius-xl` 28px (diálogos), `--radius-pill` 9999px. Migração feita só onde o
  valor já coincidia com a escala — zero mudança visual.
- **Profundidade:** sempre `hairline interna (--stage-hairline-4/5) + --elev-3/4`; o hover sobe uma
  camada (`--elev-4`) e a borda ganha 38–62% do acento.
- **Estados centralizados no arquivo de tokens:** `:focus-visible` usa `--focus-ring` com
  `outline-offset: 2px`; `[aria-pressed="true"]`/`[aria-selected="true"]` puxam `--brand-border`;
  `:disabled`/`[aria-disabled="true"]` aplicam `opacity: .55` e `cursor: not-allowed`. Nenhum
  componente precisa redefinir essas regras.
- **Loading/sucesso/erro:** `--status-*` (surface + border + ink) para faixas e mensagens; o esqueleto
  de carregamento usa `--surface-sunken` com a animação contida.

---

## 6. Regimes Visuais

### 6.1 Regime Expressivo (`data-regime="expressive"`)
- **Telas:** Login, Landing, Admin (Dashboard, Cardápio, Mesas, Garçons, Funções), Cardápio da Mesa (`/mesa/:token`) e estados vazios.
- **Características:** títulos display em Fraunces com números grandes e `tabular-nums` (`-0.02em`), cartões de vidro sobre palco escuro com grade discreta (`--stage-grid`, máscara para baixo) e hierarquia editorial de painel → cartão → micro-rótulo em caixa alta espaçada.

### 6.2 Regime Operacional (`data-regime="operational"`)
- **Telas:** Cozinha, Bar, Caixa e PWA do Garçom.
- **Características:** mesmo palco (fundo, hairlines, acentos) com densidade de operação; leitura instantânea a ~1,5 m nas filas de preparo, alvos de toque mínimos de `48 px` (`min-h-12`), indicadores objetivos de tempo/setor/garçom e ações em lote diretas.
- **Camada "vidro de operação" (`src/screens/operacional.css`):** cozinha e bar usam a mesma família visual do dashboard — gradiente escuro translúcido, grade discreta, acentos neon por etapa (ciano = em produção, âmbar = na fila), sombras em camadas e brilho interno de `1px`. A paleta **não** é mais local: `operacional.css` e `dashboard.css` consomem `var(--stage-*)` (zero hex). Cartões de caixa e PWA reaproveitam a mesma ideia via `--surface-raised`, `color-mix`, `--glass-*` e `--shadow-card-hover`, sempre dentro dos tokens e do contraste AA.

### 6.3 Fila de Produção por Item (Cozinha e Bar)
- **Duas sessões recolhíveis:** "Em produção" e "Na fila". Ambas nascem **recolhidas** para manter a tela limpa; cada uma abre de forma independente (`aria-expanded` + `aria-controls`) e a preferência do operador é lembrada por setor em `localStorage`. O corpo recolhido não renderiza cartões.
- **Rolagem lateral:** `.fila-trilho` usa `grid-auto-flow: column` com 2 linhas até `767px` e 3 linhas a partir de `1280px`; os cartões rolam na horizontal (`.fila-rolagem`) com `scroll-snap`, barra fina e `overscroll-behavior-x: contain`. A página nunca ganha rolagem horizontal própria.
- **Unidade é o item:** cada cartão mostra apenas os itens daquela etapa. Iniciar/liberar um item grava `PATCH /api/(cozinha|bar)/itens/:id/status` e afeta só ele; a ação de comanda é secundária, nomeada ("Iniciar/Liberar os N itens desta comanda") e atinge apenas os itens da seção aberta.
- **Sem coluna de prontos:** o item concluído sai da fila do setor e aparece imediatamente na fila do garçom (`concluido`), mantendo retirada direta, aceite, entregas parciais e notificações.
- **Feedback imediato:** um `role="status"` anuncia "iniciado/liberado — já aparece para o garçom" porque o cartão troca de seção (que pode estar recolhida).

---

## 7. Navegação e Shell

- **Desktop (`>= 1024px`):** sidebar fixa colapsada em `72 px` (`--sidebar-collapsed`) sobre fundo `--surface-sidebar` (mais escuro que `--surface`). Ao receber `:hover` ou `:focus-within`, expande em sobreposição para `248 px` (`--sidebar-expanded`) sem alterar `margin-left: 72px` do conteúdo principal (zero reflow) e sem botão manual de expandir.
- **Conexão de aba ativa:** o item ativo usa `background: var(--surface)` até a borda direita da barra, com recortes côncavos superior e inferior de `20 px` (`--sidebar-notch`) e indicador deslizante em mola firme (`layoutId="ops-active-rail"`).
- **Dispositivos touch (`< 1024px`):** barra inferior fixa respeitando `env(safe-area-inset-bottom)` e controles de conta/tema/som acessíveis no cabeçalho compacto em todas as larguras.
- **Rota pública `/mesa/:token`:** não renderiza sidebar nem navegação administrativa.

---

## 8. Motion e Acessibilidade

- **Propriedades animadas:** `transform` e `opacity` nas entradas e trocas de estado (`<= 180 ms`; padrão `--dur-page: 160ms`).
- **Entrada de comanda:** `--dur-base` (200ms) com `--ease-out` para entrada discreta de comandas e carimbo (`.anim-stamp`); nenhum bounce elástico — o movimento é para orientar, não para chamar atenção.
- **Indicador de navegação:** `framer-motion` `layoutId` com spring firme (`stiffness: 520, damping: 38, mass: 0.7`).
- **Movimento reduzido:** `@media (prefers-reduced-motion: reduce)` e `useReducedMotion()` neutralizam deslocamentos e animações contínuas.

---

## 9. Higiene de Produção e Correções Estruturais

- **MIME estático completo (`server.js`):** fontes locais (`.woff2` -> `font/woff2`, `.woff` -> `font/woff`), `.ico` (`image/x-icon`) e `.txt` (`text/plain; charset=utf-8`) são entregues com cabeçalhos MIME oficiais.
- **Impressão térmica (`src/lib/print.ts`):** normalização NFD em `formaLabel()` resolve `débito`, `debito`, `crédito` e `credito` sem chaves com grafia incorreta.
- **Cadastro e estoque no Admin (`src/screens/Admin.tsx`, `src/lib/mappers.ts`, `src/store/usePub.ts`):** produtos sem foto usam fallback local `fotoDemo()` (zero URLs externas Pexels), e `estoqueMinimo` é persistido e carregado ponta a ponta sem sobrescrever com valor fixo `5`.
- **Atualização ativa do Service Worker (`public/garcom-pwa/app.js`):** registro com `{ updateViaCache: 'none' }` e checagem ativa (`swReg?.update()`) ao reconectar (`online`) ou retornar ao primeiro plano (`visibilitychange`).
- **Quiet zone óptica em QR Codes (`.qr-quiet-zone`):** fundo `--qr-paper` (névoa elevada) e tinta `--qr-ink` (meia-noite) são **invariantes** em claro/escuro — o código impresso na tela não muda de tom quando o operador alterna o tema.

