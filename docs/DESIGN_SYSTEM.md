# QR Admin — Design System ("Passe")

> **Identidade em vigor:** "Passe". O passe é o balcão onde o pedido passa de uma estação à outra:
> mesa, cozinha, bar, garçom, caixa. A interface inteira sai dessa ideia — o número da mesa é uma
> **plaquinha**, o caminho do pedido é uma **linha com estações** e cada bloco de informação é uma
> **ficha de papel** separada por réguas de 1px.
>
> Vale para **todo** o sistema: landing, login, Admin, dashboard, mesas, cozinha, bar, caixa, telas do
> garçom e PWA de atendimento.
>
> **Exceção única:** o cardápio que o cliente abre em `#/mesa/:token`. Ele ficou fora do rebranding de
> propósito e continua exatamente como era (tema praia sobre a identidade anterior). Ver §8.
>
> Esta identidade substitui a "Comanda de Chapa" (palco escuro de vidro, brasa, Fraunces + Plus
> Jakarta Sans + JetBrains Mono). Daquela fase só restou o cardápio do cliente, com os tokens
> congelados em `src/screens/cardapio-identidade/identidade-cardapio.css`; o material histórico
> (`docs/design/`) saiu do repositório na limpeza de 13/11/2026. O relatório da troca está em
> `REBRANDING.md`, na raiz.

---

## 1. De onde vem a identidade

As três cores foram amostradas do logotipo oficial (`public/logo/qradmin-mark.png`):

| Nome | Hex | Origem no logotipo | Papel na interface |
|---|---|---|---|
| **Tinta** | `#0C2C4C` | azul-marinho do símbolo | marca, ação primária no tema claro, faixa de navegação, plaquinha |
| **Sinal** | `#6CDCCC` | menta do "QR" | estação ativa, ação primária no tema escuro, foco no escuro |
| **Areia** | `#E4CC94` | dourado claro do traço | plaquinha no tema escuro, acento de dado |
| **Papel** | `#F4EFE6` | — (fundo quente escolhido para a tinta) | superfície do tema claro |

Regras que decorrem disso:

- **Tema claro é papel com tinta; tema escuro é tinta com sinal.** A faixa de navegação é
  azul-marinho nos dois.
- **Estado nunca depende só de cor.** Posição na linha, forma (quadrado cheio/vazado) e texto dizem a
  mesma coisa que a cor.
- **Nada de vidro.** Sem `backdrop-filter`, sem brilho interno, sem halo. Superfície opaca, contorno
  de 1px e, no máximo, 1–2px de "espessura de folha" como sombra.
- **Cantos curtos.** O raio máximo de um cartão é 8px; de um diálogo, 10–12px.

---

## 2. Tokens

A fonte única é `public/garcom-pwa/design-tokens.css`, importada pelo SPA (`src/index.css`) e pelo PWA
do garçom (`public/garcom-pwa/styles.css` e `index.html`). O tema é ligado antes do primeiro paint por
`public/garcom-pwa/theme-init.js`; `src/lib/tema.ts` alterna e persiste. **Nenhum dos dois escreve
token inline** — os valores moram só na folha de estilo.

| Nível | Prefixo | Papel | Quem consome |
|---|---|---|---|
| 1. Primitivos | `--passe-*` | Valores brutos da paleta (tinta, sinal, areia, papel, giz, estados) | só o próprio arquivo de tokens |
| 2. Semânticos | `--surface*`, `--text*`, `--brand*`, `--accent*`, `--line*`, `--status-*`, `--plaque*`, `--route*`, `--ink-band*`, `--chart-*`, `--qr-*`, `--shadow-*`, `--focus-ring` | Papel funcional por tema | todos os componentes |
| 3. Transversais | `--font-*`, `--wdth-*`, `--radius-*`, `--space-*`, `--dur-*`, `--ease-*`, `--rule`, `--touch-min`, `--sidebar-*` | Tipografia, forma, espaço e movimento | componentes e camadas CSS |

**Regra dura:** nenhuma folha de estilo do produto escreve cor literal (hex, `rgb()`, `hsl()`…) nem
cita primitivo `--passe-*`. Se faltar um valor, crie um token semântico. Única exceção: o centro do
símbolo, que é sempre a menta do logotipo. `tests/design-tokens-identidade.test.cjs` confere isso e
também que toda `var(--x)` consumida tem definição.

### 2.1 Semânticos e contraste medido

| Par (texto / fundo) | Claro | Razão | Escuro | Razão |
|---|---|---|---|---|
| `--text` / `--surface` | `#0B2036` / `#F4EFE6` | 14,4:1 | `#EEF2EC` / `#081726` | 16,0:1 |
| `--text` / `--surface-raised` | `#0B2036` / `#FFFDF8` | 16,2:1 | `#EEF2EC` / `#0F2338` | 14,1:1 |
| `--text-muted` / `--surface-raised` | `#3F5167` | 8,0:1 | `#A9BCCB` | 8,2:1 |
| `--text-subtle` / `--surface` | `#586879` | 5,0:1 | `#8BA0B4` | 6,7:1 |
| `--brand-contrast` / `--brand` | `#FFFDF8` / `#0C2C4C` | 14,0:1 | `#06222B` / `#6CDCCC` | 10,0:1 |
| `--brand-ink` / `--surface-raised` | `#0A6257` | 7,1:1 | `#7FE3D4` | 10,5:1 |
| `--accent-ink` / `--surface-raised` | `#6B4C14` | 7,7:1 | `#ECD9A8` | 11,4:1 |
| `--plaque-text` / `--plaque` | `#FFFDF8` / `#0C2C4C` | 14,0:1 | `#081726` / `#E4CC94` | 11,5:1 |
| `--plaque-label` / `--plaque` | `#6CDCCC` | 8,6:1 | `#0C2C4C` | 9,0:1 |
| `--ink-band-text` / `--ink-band` | `#F4EFE6` / `#0C2C4C` | 12,4:1 | `#EEF2EC` / `#06121F` | 16,6:1 |
| `--ink-band-signal` / `--ink-band` | `#6CDCCC` | 8,6:1 | `#6CDCCC` | 11,4:1 |
| `--status-success-ink` / `--surface-raised` | `#17663F` | 6,9:1 | `#86E0AE` | 10,1:1 |
| `--status-warning-ink` / `--surface-raised` | `#8A5200` | 6,3:1 | `#FFCF8A` | 11,0:1 |
| `--status-info-ink` / `--surface-raised` | `#1C5A96` | 7,0:1 | `#9ECBF5` | 9,3:1 |
| `--status-danger-ink` / `--surface-raised` | `#B0261B` | 6,6:1 | `#FFB0A6` | 9,1:1 |
| `--line-strong` / `--surface-raised` (contorno de campo, 3:1) | `#857860` | 4,3:1 | `#5A7B9C` | 3,6:1 |
| `--focus-ring` / `--surface` (3:1) | `#0C2C4C` | 12,4:1 | `#9BE8DC` | 12,9:1 |
| `--qr-ink` / `--qr-paper` | `#081726` / `#FFFDF8` | 17,8:1 | igual | 17,8:1 |

Todos os pares acima (e mais alguns) são verificados por `tests/design-system.test.cjs`. Nenhum token
usa `#FFFFFF` ou `#000000` puros.

### 2.2 Grupos próprios desta identidade

- **Plaquinha** — `--plaque`, `--plaque-text`, `--plaque-label`: o bloco do número da mesa. Tinta no
  claro, areia no escuro.
- **Linha de passe** — `--route` (trilho) e `--route-active` (estação concluída ou atual).
- **Faixa de tinta** — `--ink-band`, `-raised`, `-text`, `-muted`, `-line`, `-signal`, `-sand`: a barra
  lateral do SPA e o rodapé do PWA. É escura nos dois temas, por isso tem tokens próprios em vez de
  reaproveitar `--surface*`.
- **Dados** — `--chart-1` … `--chart-5`: séries de gráfico, na ordem sinal, tinta, areia, azul, coral.
- **QR Code** — `--qr-paper`, `--qr-ink`, `--qr-border`: **iguais nos dois temas**. O código precisa
  ser lido por câmera; ele não muda de tom quando o operador troca o tema. `QR_SVG_COLORS` em
  `src/lib/tema.ts` repete os dois valores para o SVG (conferido por teste).

### 2.3 Cores repetidas fora do CSS

Quatro lugares precisam de uma cor antes de o CSS existir. Todos são conferidos contra os tokens por
`tests/design-system.test.cjs`:

| Onde | Valor | Token de origem |
|---|---|---|
| `<meta name="theme-color">` em `index.html` e `public/garcom-pwa/index.html` | `#f4efe6` | `--surface` (claro) |
| `theme-init.js` (barra do navegador antes do paint) | `#f4efe6` / `#081726` | `--surface` (claro / escuro) |
| `public/garcom-pwa/app.js` (troca de tema no PWA) | `#f4efe6` / `#081726` | `--surface` |
| `manifest.webmanifest` (`background_color` / `theme_color`) | `#f4efe6` / `#0c2c4c` | `--surface` (claro) / tinta |

---

## 3. Tipografia: uma família, quatro larguras

Uma única fonte variável, servida pelo próprio produto sob CSP `'self'`:
**Archivo** (eixos de peso 100–900 e de largura 62–125%), `public/garcom-pwa/fonts/archivo-latin-wdth-normal.woff2`,
**88 KB** (90 104 bytes), licença SIL OFL 1.1 (`OFL.txt` na mesma pasta). O orçamento, travado por
teste, é de 100 KB.

A hierarquia é feita pela **largura**, não por trocar de família:

| Papel | Token | Largura | Onde |
|---|---|---|---|
| Chamada | `--wdth-display` | 118% (larga) | título de página, chamada da landing, número grande |
| Título | `--wdth-title` | 110% | título de seção e de cartão |
| Leitura | `--wdth-text` | 100% | corpo, navegação, botões, campos |
| Dado | `--wdth-data` | 80% (estreita) | valores, horários, contagens — sempre com `tabular-nums` |

- `--font-sans`, `--font-display` e `--font-mono` apontam para Archivo. "Mono", aqui, é a voz de dado
  (estreita e tabular), não uma fonte monoespaçada.
- `--font-code` é a monoespaçada **do sistema**, usada só para código de verdade (chave Pix, segredo
  de dois fatores). Não se baixa uma segunda família por causa disso.
- Rótulo (`.rotulo`): 11px, peso 700, caixa alta, `letter-spacing: 0.13em`. É o menor texto do
  produto; nada abaixo de 11px.

---

## 4. Forma, espaço e movimento

- **Raios:** `--radius-xs` 3px (marcas, estações), `--radius-sm` 5px (botões, campos, selos),
  `--radius-md` 8px (fichas e cartões), `--radius-lg` 10px (painéis e diálogos), `--radius-xl` 12px
  (folha grande). `--radius-pill` existe só para o que é redondo por natureza (botão de rádio, avatar).
- **Régua:** `--rule` = 1px. Separação é linha, não sombra, e a linha é contínua. O tracejado fica
  reservado ao que está **vazio ou aceita receber algo**: estado vazio, espaço de foto, área de soltar
  arquivo e alvo do editor do dashboard — nunca como separador.
- **Sombra:** `--shadow-card` é `0 1px 0 0` (a espessura da folha) e `--shadow-card-hover` é
  `0 2px 0 0` — deslocamento sem desfoque. Só o diálogo (`--shadow-modal`) tem sombra difusa, para se
  soltar do fundo.
- **Espaço:** `--space-1` (4px) … `--space-9` (48px), múltiplos de 4.
- **Toque:** alvo mínimo de 44px; ação de operação em 48px (`--touch-min`).
- **Movimento:** `--dur-fast` 120ms para resposta a toque, `--dur-base` 200ms para entrada de página;
  curva `--ease-snap` (seca, sem elástico). A página entra uma vez (`.anim-ticket` no `<main>`); os
  cartões não animam um a um. Em `prefers-reduced-motion` todas as durações vão a zero.
- **Estados compartilhados** (definidos uma vez no arquivo de tokens): `:focus-visible` usa
  `--focus-ring` com `outline-offset: 2px`; `:disabled`/`[aria-disabled="true"]` aplicam
  `opacity: .55` e `cursor: not-allowed`.

---

## 5. Primitivos de componente

Definidos uma vez em `src/styles/passe.css` (SPA) e espelhados em `public/garcom-pwa/styles.css` (PWA)
e em `public/institucional.css` (páginas estáticas). Reutilize em vez de recriar.

| Primitivo | Classe / atributo | O que é |
|---|---|---|
| **Plaquinha** | `.placa`, `.placa__numero`, `.placa__rotulo` (e, nas telas de operação, `.ops-card__mesa`, `.dash-mesa__ident`, `.step-number` no PWA — todas com os tokens `--plaque*`) | O número da mesa em bloco de tinta (ou areia, no escuro). É a âncora de qualquer cartão que fale de uma mesa. |
| **Linha de passe** | não é uma classe única — ver abaixo | Estações quadradas ligadas por um trajeto. Estação percorrida fica cheia; a atual ganha um halo; a que ainda não chegou fica vazada. |
| **Ficha** | `.ficha`, `[data-ficha]` | Superfície de cartão: `--surface-raised`, contorno de 1px, espessura de folha. |
| **Régua** | `.regua` | Linha de 1px que separa blocos. |
| **Rótulo** | `.rotulo` | Legenda em caixa alta de 11px. |
| **Símbolo** | `.simbolo` (`<Simbolo />`) | Anel quadrado com centro em sinal: a marca reduzida a 16–32px, onde a ilustração do logotipo não é legível. |
| **Assinatura** | `.assinatura` (`<Assinatura />`) | Símbolo + "QRAdmin" composto em Archivo. |
| **Placa do logotipo** | `.logo-placa` | O logotipo oficial (arte escura) sobre papel `--qr-paper` nos dois temas. |
| **Papel do QR** | `.qr-quiet-zone` | Margem clara obrigatória em volta do QR Code. |

**A linha de passe é um motivo, não um componente.** Cada superfície desenha a sua, porque a
geometria muda (trilho vertical, passos horizontais, rodapé). O que elas compartilham são os tokens:

| Onde | Arquivo | Trajeto / estação ativa |
|---|---|---|
| Navegação lateral do sistema | `src/components/OpsShell.css` | `--sidebar-line` / `--ink-band-signal` |
| Escolha de setor no login | `src/screens/login-fields.css` | `--route` / `--route-active` |
| Percurso da landing (progride com a rolagem) | `src/screens/landing/styles/main.css` | `--ink-band-line` / `--ink-band-signal` |
| Fluxo e sumário das páginas estáticas | `public/institucional.css` | `--route` / `--route-active` |
| Rodapé do PWA do garçom | `public/garcom-pwa/styles.css` | `--ink-band-line` / `--ink-band-signal` |

Sobre papel usa-se o par `--route`; sobre faixa de tinta, o par `--ink-band-*`. Uma tela nova que
precise do motivo desenha o seu trajeto com um desses pares — sem cor escrita à mão.

Ícones: Phosphor em todo o produto — `@phosphor-icons/react` no SPA e o sprite local
`public/garcom-pwa/icons.svg` no PWA. Item inativo em traço (`regular`), ativo preenchido (`fill`).
Nenhum emoji como ícone.

---

## 6. Navegação e shell

- **A partir de 1024px:** faixa de tinta fixa à esquerda, com 72px (`--sidebar-collapsed`). Ela **não
  muda de tamanho** em hover nem em foco. Cada destino mostra ícone e nome como texto de verdade (não
  tooltip). A estação atual tem `aria-current="page"`, o marcador quadrado da linha preenchido e o
  ícone em sinal — o estado não depende só da cor de fundo.
- **Abaixo de 1024px:** a mesma navegação vira uma gaveta aberta pelo botão de menu. A gaveta prende
  o foco, fecha com `Esc` e devolve o foco ao botão.
- **PWA do garçom:** rodapé em faixa de tinta com quatro estações (Mesas, Pedidos, Entregas,
  Cobrança), respeitando `env(safe-area-inset-bottom)`.
- **Cardápio do cliente (`#/mesa/:token`):** não tem shell administrativo.

`tests/ops-shell-linha-do-passe.test.cjs` trava este comportamento.

---

## 7. Telas

- **Landing e login:** papel, título em largura display, a linha de passe como fio condutor da
  página e capturas reais do produto.
- **Dashboard:** indicadores em fichas (`.indicador`), valores em largura de dado, gráficos com
  `--chart-*`. O editor de layout (arrastar e redimensionar) continua igual em comportamento.
- **Cozinha e bar** (`src/screens/operacional.css`): a tela é o próprio passe. Cada comanda é uma
  ficha com régua de 3px na cor da etapa, placa da mesa e ações de 48px. Atraso aparece como contorno
  **e** faixa com texto.
  - Duas seções recolhíveis ("Em produção" e "Na fila"), abertas de forma independente; a preferência
    é lembrada por setor.
  - A grade preenche da esquerda para a direita e só desce no fim da linha.
  - A unidade é o item: iniciar/liberar um item afeta só ele.
- **Caixa:** lista de comandas e comanda aberta em fichas; a partir de 1024px a coluna de comandas
  rola por dentro, sem esticar a página.
- **Admin:** tabelas com réguas de 1px; abaixo de 640px as tabelas viram registros verticais
  (`src/screens/admin/admin-responsive.css`), sem esconder coluna.
- **Garçom (SPA e PWA):** mesas como fichas com faixa de 5px na cor da plaquinha, passos numerados em
  plaquinha, diálogos centrados com rolagem interna.
- **Páginas estáticas** (`public/apresentacao.html`, `guia-sistema.html`, `politica-de-privacidade.html`,
  `termos-de-servico.html`, `termos-de-uso.html`, `novidades.html`): HTML estático vestido por uma
  única folha, `public/institucional.css`, que lê os mesmos tokens do produto
  (`/garcom-pwa/design-tokens.css`) e segue o tema escolhido (`/garcom-pwa/theme-init.js`). O `<body>`
  leva `pagina` mais uma variante: `pagina--apresentacao`, `pagina--guia` ou `pagina--documento`.
  Nenhuma delas tem `<style>` ou `style=""` embutido. `novidades.html` lê as notas públicas de `public/novidades.json` sem depender de autenticação.

---

## 8. Exceção: o cardápio do cliente (`#/mesa/:token`)

O cardápio não foi redesenhado e **não pode mudar por efeito colateral**. Três peças garantem isso:

1. **Identidade congelada.** `src/screens/cardapio-identidade/identidade-cardapio.css` guarda os
   tokens, as regras globais e as fontes que o cardápio usava no commit de referência. O arquivo é
   **gerado** por `scripts/gerar-identidade-cardapio.mjs` — não edite à mão. Todos os seletores dele
   exigem `html[data-identidade="cardapio"]`.
2. **Guarda no resto do produto.** `theme-init.js` liga `data-identidade="cardapio"` no `<html>`
   quando a rota é `#/mesa/…`. Todas as regras globais da identidade "Passe" estão sob
   `html:not([data-identidade="cardapio"])` e, portanto, não chegam ao cardápio.
3. **Prova.** `npm run test:cardapio-intacto` abre o cardápio do commit de referência e o atual lado
   a lado, em 9 estados × 2 telas × 2 temas, e compara marcação, estilo computado de cada elemento,
   pixels e arquivos baixados. `tests/cardapio-isolamento.test.cjs` cobre estaticamente o que a prova
   visual não alcança (hover, foco, larguras intermediárias).

O tema praia continua em `src/screens/mesa-praia.css`, escopado em `body[data-mesa-praia]`, e
`src/screens/Mesa.tsx` continua sendo o único dono da tela. Para mudar o cardápio **de propósito**,
veja "Como alterar o cardápio" em `REBRANDING.md`.

---

## 9. Acessibilidade

- Contraste AA em todo par texto/fundo e 3:1 em contorno de campo e anel de foco (§2.1).
- Além dos pares de token, o contraste é **medido na tela renderizada**: `npm run test:contraste`
  abre cada tela no Chromium, nos dois temas e em duas larguras, e compara a cor pintada de cada
  texto com o fundo que está atrás dele. Com `-- --com-equipe` inclui as telas internas. Uma tela
  nova entra na lista de rotas de `scripts/verificar-contraste.mjs`.
- Nenhum texto abaixo de 11px (`tests/design-system.test.cjs`).
- Foco sempre visível: `outline` de 2px em `--focus-ring`, nunca removido sem substituto.
- Alvos de toque: ações de operação em 48px; botões, campos e navegação em 44px. Controles
  compactos ficam em 40px (ícones do cabeçalho abaixo de 480px, passos de quantidade do caixa, links
  de navegação da landing e das páginas estáticas) e os links de texto do rodapé do login em 30px.
  Nenhum alvo isolado fica abaixo de 24px, o mínimo AA da WCAG 2.2; os botões de texto dentro de
  linhas de tabela no computador têm 16px de altura e contam com o espaçamento da própria linha.
- Estado comunicado por posição, forma e texto, além de cor.
- `prefers-reduced-motion` zera animações e transições.
- O QR Code mantém papel claro e tinta escura nos dois temas.

---

## 10. Higiene de produção

- **MIME estático (`server.js`):** `.woff2` → `font/woff2`, `.woff` → `font/woff`, `.ico` →
  `image/x-icon`, `.txt` → `text/plain; charset=utf-8`.
- **Sem dependência externa de fonte ou ícone:** nada de Google Fonts ou CDN; a CSP continua `'self'`.
- **Service worker do PWA:** o cache do shell tem versão (`garcom-pwa-shell-vNN` em
  `public/garcom-pwa/sw.js`). Qualquer mudança em arquivo do shell — inclusive CSS e fonte — exige
  subir essa versão, senão os aparelhos instalados continuam com o arquivo antigo.
- **Contato em um lugar só:** WhatsApp e e-mail do produto são definidos em
  `src/screens/landing/contato.ts`. O SPA importa de lá; as páginas estáticas e a documentação
  repetem o endereço por extenso, e `tests/contato-oficial.test.cjs` falha se alguma cópia divergir.
- **Capturas do produto:** as imagens de `public/assets/apresentacao/` são geradas por
  `scripts/capturar-apresentacao.mjs` a partir do banco de demonstração. Mudou o visual de uma tela
  que aparece na landing ou na apresentação? Gere as capturas de novo.
- **Impressão térmica (`src/lib/print.ts`):** o comprovante tem folha de estilo própria e não usa os
  tokens da tela.
