# 04 — Relatório de implementação do redesign (Território A)

**Branch:** `design/identidade-visual`
**SHA inicial da etapa:** `bee2616` (docs de design + tokens substituídos por placeholder)
**Base de comparação:** `main` = `a044980`
**Data:** 2026-11-09
**Escopo desta etapa:** desbloquear a regressão dos tokens, aplicar a fundação visual do
Território A e produzir as provas visuais obrigatórias. As ondas de composição por superfície
seguem pendentes (§5).

---

## 1. O bloqueio que existia

A branch não alterava nenhum arquivo de aplicação além de um: `public/garcom-pwa/design-tokens.css`
havia sido substituído por **uma linha** (`/* RESTORED - see next message */`), removendo 542 linhas
de tokens que o SPA (`src/index.css`) e a PWA (`public/garcom-pwa/styles.css`, `index.html`, `sw.js`)
consomem. Os três commits de "Território A" (`b385e93`, `a7a677c`, `eb93337`) se anulavam em
sequência: placeholder → restauração parcial de 272 linhas (arquivo truncado) → placeholder de novo.

Nenhum arquivo de `src/`, `public/` (fora dos tokens), `server.js`, `db/` ou `tests/` divergia de
`main` antes desta etapa — confirmado por `git diff --stat origin/main`.

## 2. O que foi feito

### 2.1 Tokens — restaurados e refinados (fonte única preservada)

`public/garcom-pwa/design-tokens.css` foi restaurado integralmente a partir de `main` (542 linhas) e
recebeu apenas mudanças de **valor de token**, nenhuma remoção de token consumido:

| Grupo | Antes | Depois | Por quê |
|---|---|---|---|
| Raios | xs 10 · sm 14 · md 20 · lg 24 · xl 28 | xs 8 · sm 12 · md 16 · lg 20 · xl 24 | Brief §7: escala **contida** de ticket/comanda |
| Assinatura (claro) | `--brand: --prim-violeta-escuro` (#5B3FC4) | `--brand: --prim-brasa-escura` (#BF3B11) | Brief §6: brasa é a assinatura operacional |
| Assinatura (escuro) | `--brand: --prim-violeta-claro` (#8B6FFF) | `--brand: --prim-brasa-clara` (#FF7D52) | idem, sobre palco escuro |
| `--brand-ink` | violeta-tinta | `--prim-brasa-tinta` / `--prim-brasa-tinta-escuro` | texto de marca com contraste AA |
| `--brand-surface` / `--brand-border` | mistura violeta | mistura brasa (12–16% / 38–44%) | mantém a receita de `color-mix`, só troca a família |
| `--focus-ring` (claro) | violeta-tinta | `--prim-azul-tinta` | anel de foco neutro e visível inclusive sobre botão de brasa |
| Halos do palco | `--stage-glow-violet` 0.18 + `--stage-glow-cyan` 0.13 | `--stage-glow-brasa` 0.12 + `--stage-glow-cyan` 0.06 | Brief §6: reduzir halos decorativos de "palco SaaS" |
| Acento de palco novo | — | `--stage-brasa`, `--stage-brasa-deep`, `--stage-brasa-soft`, `--stage-brasa-ink` | mesa/CTA/atraso no escuro |

`--stage-violet*` e `--prim-violeta*` **continuam definidos**: são os acentos de dado do palco
(séries de gráfico do dashboard). Não foram removidos (evita quebra de contrato) nem promovidos a
marca.

### 2.2 Superfícies tocadas no código

- `src/index.css` — `.stage-surface` passa a usar o halo de brasa; `.stage-card` deixa de tingir a
  borda de violeta e usa `--stage-line-base` / `--stage-line-4` (elevação por contraste + linha,
  como pede o brief). Nenhuma classe, seletor ou comportamento de componente foi alterado.
- `src/screens/operacional.css` — `.ops-stage` usa o halo de brasa no lugar do violeta.
- `src/lib/tema.ts` — os fallbacks inline que espelham os tokens semânticos acompanham os novos
  valores de `--brand` / `--brand-ink` (o teste de design system compara arquivo e tokens).

### 2.3 Testes que travam o contrato de identidade

Dois testes codificavam a identidade anterior. Foram **atualizados para o contrato aprovado**, sem
afrouxar nenhuma verificação de estrutura, contraste, isolamento da exceção do cardápio ou proibição
de cor literal:

- `tests/design-tokens-identidade.test.cjs` — passa a exigir `--brand` de brasa nos dois temas,
  `--stage-brasa*` no palco e continua proibindo paleta de papel/lousa/madeira nos tokens semânticos
  (e agora também proíbe brasa como fundo de superfície).
- `tests/design-system.test.cjs` — as duas asserções de raio (`--radius-md`, `--radius-lg`) refletem
  a escala contida.

O teste de contraste WCAG continua calculando os pares reais: `--brand`/`--brand-contrast` e
`--brand-ink`/`--surface-raised` medem **4,8:1 / 7,5:1** e **5,3:1 / 10,1:1** (claro/escuro), acima
de AA.

### 2.4 Provas visuais (pilotos)

Criados em `docs/design/pilotos/` como **protótipos estáticos**, com dados fictícios e selo
"Dados fictícios de demonstração · não é a aplicação". Consomem os tokens reais
(`@import "../../../public/garcom-pwa/design-tokens.css"`), Phosphor-style inline SVG, nenhum emoji.

| Piloto | Arquivo | Foco da composição |
|---|---|---|
| Cozinha | `cozinha.html` | fila densa, mesa em mono grande, ticket com recorte tracejado, estado por posição + forma + texto |
| Caixa | `caixa.html` | valores tabulares alinhados (total/pago/restante), Pix em bloco próprio, fechamento em brasa |
| Cliente | `cliente.html` | regime papel, foto protagonista, conta/Pix na barra inferior |

Capturas (1440 px e 390 px): `cozinha-desktop.png`, `cozinha-mobile.png`, `caixa-desktop.png`,
`caixa-mobile.png`, `cliente-desktop.png`, `cliente-mobile.png`. Foram geradas com a página
`captura.html`, que renderiza cada piloto em iframe na largura exata (reprodutível por qualquer
pessoa, sem dependência nova no projeto).

## 3. Verificação executada

| Comando | Resultado |
|---|---|
| `npm ci --no-audit --no-fund` | 143 pacotes, exit 0 (lockfile preservado) |
| `node --test tests/design-system.test.cjs tests/design-tokens-identidade.test.cjs` | **16/16 pass**, exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (Vite 7, build concluído) |
| `npm test` | **595 testes, 595 pass, 0 fail**, exit 0 (12,6 s) |
| Captura dos 6 pilotos em Chromium | sem erro de console, sem overflow horizontal, fontes e marca carregadas |

**Não executado (limitação real):** `npm run test:e2e` (inclui `tests/e2e/visual-system.e2e.cjs`).
O Chromium do projeto (`@sparticuz/chromium`) exige bibliotecas de sistema (`libnspr4.so`) que não
existem neste ambiente e não há root para instalá-las. O E2E também precisa do build servido com API
e PostgreSQL. As capturas dos pilotos foram feitas pelo navegador em nuvem, que não expõe controle de
viewport a scripts.

**Consequência:** a mudança de tokens é global, mas a revisão visual tela a tela das superfícies
reais (cozinha, caixa, PWA, admin, login) ainda **não foi feita**. O que está verificado é o
build, os testes, o contraste medido e os pilotos.

## 4. Confirmação de ausência de mudança funcional

Não houve alteração em: `server.js`, `db/`, migrations, rotas/APIs, contratos, autenticação,
autorizações, sessões, SSE, Web Speech, pagamentos/Pix, cálculos, descontos, taxas, QR Code, PWA,
offline/IndexedDB, CSP, headers, validações ou navegação. O diff de aplicação é composto por valores
de custom properties CSS, duas referências de gradiente, duas regras de borda de cartão, os
fallbacks de tema em TS e atualizações de documentação/asserções de identidade. Nenhum merge e
nenhum deploy foram realizados.

## 5. Pendente (ondas de composição do plano §5)

1. Cozinha/Bar: aplicar no `FilaProducao`/`operacional.css` o ticket do piloto (hoje herda tokens,
   mas mantém a composição anterior).
2. Garçom SPA e PWA.
3. Caixa: hierarquia total/pago/restante e bloco de Pix como no piloto.
4. Cliente (`#/mesa/:token`): tema praia permanece intacto; avaliar aproximação com o piloto.
5. Admin e seções: normalizar os acentos de dado violeta do dashboard (`--neon` → família brasa) e a
   densidade tabular.
6. Login e fluxo de autenticação.
7. Landing, guia público e HTML legado em `public/`.
8. Estados compartilhados (modais, sheets, toasts, tabelas, vazio/erro/loading).

## 6. Observações e riscos residuais

- **Marca agora é brasa em todo CTA primário.** É a decisão aprovada; o contraste é medido por teste,
  mas a leitura em tela real (luz de cozinha, celular do garçom) só fecha na onda 1–3.
- **Dois acentos convivem:** brasa (marca/operação) e violeta/ciano (dados do dashboard). A
  normalização está na onda 5.
- **Bug pré-existente, não corrigido de propósito:** `src/screens/operacional.css` tem declarações
  `border-radius: var(--radius-lg)` (e outras) sem ponto e vírgula final em 8 pontos, o que faz o
  parser descartar `border-radius` + a declaração seguinte. Corrigir mudaria pixels de cozinha/bar
  fora do escopo desta etapa; fica registrado para a onda 1.
- **`--stage-glow-violet` foi removido** por não ter mais consumidor; `--stage-glow-brasa` o substitui.
  Nada externo referenciava o token (verificado por busca no repositório).

## 7. Como revisar

```bash
git diff origin/main -- public/garcom-pwa/design-tokens.css   # valores de token
git diff origin/main -- src tests docs                        # superfícies, contrato, provas
node --test tests/design-system.test.cjs tests/design-tokens-identidade.test.cjs
npm run build && npm test
```

Pilotos: abrir `docs/design/pilotos/index.html` a partir da raiz do repositório (as fontes e imagens
são servidas por caminho relativo). Capturas já versionadas na mesma pasta.
