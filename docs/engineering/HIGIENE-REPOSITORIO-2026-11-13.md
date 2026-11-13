# Higiene do repositório e estado das pendências — 13/11/2026

Registro da limpeza feita em 13/11/2026 na branch
`arena/bc3dc240-lanchonete-qr-semi-final` (base `6d75e1a`, `main`), e do panorama
de tarefas que continuam abertas.

Regra seguida em todo o trabalho (`docs/engineering/PLANO-SANEAMENTO-CODEBASE.md`):
**nada foi removido só porque uma busca textual não achou referência.** Cada item
abaixo foi conferido contra HTML, CSS, React, testes, CI, scripts npm e build.

---

## 1. O que saiu

### 1.1 Material histórico de design (14 MB → 0)

`docs/design/` inteiro: `00-inventario.md`, `01-brief.md`, `02-sistema.md`,
`03-plano-correcao-e-execucao.md`, `04-relatorio-implementacao.md`, `README.md`,
`capturas/` (32 PNGs), `pilotos/` (4 HTML + 4 CSS + 6 PNGs) e `rebranding/` (5 PNGs).

Motivo: documentava a identidade **"Comanda de Chapa"**, substituída pela "Passe"
em 10/11/2026 (PR #298). O que ainda vale daquela fase — o cardápio do cliente —
está congelado em `src/screens/cardapio-identidade/identidade-cardapio.css`
(conferido contra um commit de referência por `tests/cardapio-isolamento.test.cjs`).

Referências atualizadas: `REBRANDING.md` (3 blocos de imagem → nota de que a
comparação visual saiu do repositório; os números medidos continuam no texto) e
`docs/DESIGN_SYSTEM.md` (introdução). Para regerar capturas atuais:
`scripts/capturar-apresentacao.mjs`.

### 1.2 Arquivos sem nenhuma referência

| Arquivo | Tamanho | Por que saiu |
|---|---|---|
| `Vídeo documentário estilo lifestyle.mp4` | 2,0 MB | na raiz; zero referências em código, doc, build ou CI |
| `public/logo/qradmin-horizontal-dark.png` | 1,3 MB | só citado em doc de proveniência (que já o apontava como peso) |
| `public/logo/qradmin.png` | 244 KB | idem; a marca usada é `qradmin-mark.png` |
| `public/logo/simbolo-traco.svg` | 275 B | zero referências; o símbolo em uso é `simbolo.svg` |
| `public/mesa.css` (+ cópia em `dist/`) | 8,7 KB | CSS antigo do cardápio: `mesa.html` carrega `mesa-1..2b`, `mesa-app*`, `theme-glass` — `mesa.css` não estava em nenhum `<link>` |
| `public/js/mesa-pix.js` (+ `dist/js/`) | 4 linhas | stub que nenhuma página carregava; só um teste lia o arquivo |
| `scripts/provisionar-mesas.cjs` | 2,2 KB | execução única de release, superada por `db/admin.js` (rota de ampliação idempotente, com auditoria) e pela migration `0017` |
| `public/assets/demo/*.jpg` (35) + `dist/` | 1,5 MB | fallback JPEG do mesmo conjunto que só é pedido em `.webp` (216 referências, todas WebP) |
| `public/assets/bg-*.jpg` (7) + `dist/` | 1,6 MB | `theme-glass.css` pede só `bg-*.webp`; `bg-dining` não era usado em nenhum dos dois formatos |

Total removido: **~21 MB** de binários e ~380 KB de código/config versionado.

`tests/garcom-operacao-integrada.test.cjs` foi ajustado: em vez de ler
`mesa-pix.js`, agora afirma que ele **não existe** — o cliente segue sem ação de
pagamento, que é o comportamento protegido ali.

### 1.3 Branches remotas apagadas

Nenhuma estava tecnicamente mergeada (`git branch --merged main` volta vazio: todas
foram integradas por squash-merge). Antes de apagar, cada uma foi conferida contra a
`main`:

| Branch | SHA apagado | Situação |
|---|---|---|
| `design/identidade-visual` | `d29d413` | PR #296 fechado; identidade substituída pelo PR #298 |
| `rebrand/visual-identity-from-scratch` | `85aa7f0` | PR #297 fechado; idem |
| `docs/planejamento-integracao-sitef` | `e43c6f8` | PR #291 fechado; o documento TEF é planejamento, não código |
| `feat/302-admin-help-guide-link` | `dc27161` | efeito já na `main` pelo React (`OpsShell` → `/guia-sistema.html`, #309) |
| `fix/299-complete-report-exports` | `bde1431` | integrado pelo PR #315 (`df9837d` removendo o `LIMIT 500` de `db/relatorio.js`) |

Os SHAs acima permitem recuperar qualquer uma com `git fetch origin <sha>`.
`feat/313-atendimento-colaborativo-sem-mesa-fixa` foi **mantida**: é trabalho em
andamento da issue #313, ainda não integrado.

---

## 2. Panorama das tarefas incompletas

### 2.1 Issues abertas

| Issue | Título | Situação real no código |
|---|---|---|
| **#313** | Remover atribuição fixa de mesas e preservar autoria individual dos pedidos | **Em andamento.** Branch `feat/313-...` com 74 commits à frente e 74 atrás da `main`; 34 arquivos, −1417/+583 linhas (reescreve `db/atendimento.js`, `public/garcom-pwa/app.js` e os testes de garçom). Precisa ser rebaseada antes de abrir PR. |
| **#301** | Notificar nova versão após deploy, com atualização segura | **Implementado** (PR #304, #310, #314): `lib/build-version.js`, `/api/version`, `AvisoAtualizacao`, SW do garçom. A issue continua aberta — conferir o que falta e fechar. |
| **#240** (P1) | Revisar Termos, Privacidade e documentação de uso | **Parcial.** Já existem `politica-de-privacidade.html`, `termos-de-servico.html`, `termos-de-uso.html`, `docs/engineering/data-policy-proposal.md`, `procedimento-titulares.md` e um teste que compara doc × código (`docs-consistencia-publico`). Falta a revisão jurídica final. |
| **#53** (P1) | Tirar fotos do cardápio em base64 das respostas JSON | **Aberto.** As rotas ainda devolvem foto inline em parte dos caminhos; `db/foto-serve.js` existe para servir por URL. Trabalho de migração pendente. |
| **#50** (SEC) | Endurecer confiança no proxy e rate limit por IP/token/sessão | **Parcial.** `security/client-ip.js`, `db/rateLimit.js` e `tests/public-table-rate-limit*` existem; falta o endurecimento do que a issue descreve. |
| **#45** (P1) | Decidir licença, repositório canônico e proveniência dos ativos | **Aberto — decisão humana.** `docs/engineering/proveniencia-ativos.md` §6 lista 5 decisões; a origem das 35 fotos demo e dos fundos de tela segue sem comprovante. |
| **#43** (P1) | Health check read-only, smoke seguro e alertas | **Quase pronto.** `scripts/health-smoke.js`, `server/` (`/healthz`), `scripts/notificar-alerta.js`, `docs/engineering/observabilidade-alertas.md` e workflows de healthcheck existem. Falta validar o alerta ponta a ponta. |
| **#41** (P0) | Comprovar backup/restauração PostgreSQL em ambiente isolado | **Ferramenta pronta, comprovação não registrada.** `scripts/backup-restore-drill.js`, `npm run db:restore-drill` e `tests/backup-restore-drill.test.cjs`. Precisa rodar contra um banco real e anexar a evidência. |

### 2.2 Pendências técnicas que não têm issue

1. **`server.js` com ~93 KB e ~2080 linhas** concentra roteamento, gates de
   autorização, CSRF, rate limit e estáticos. É o item Fase 4 do
   `PLANO-SANEAMENTO-CODEBASE.md`; não foi tocado nesta limpeza de propósito
   (risco alto, exige testes de contrato antes).
2. **HTML legado de `public/` convive com a SPA.** Com `dist/` presente, o servidor
   redireciona `/admin.html`, `/mesa.html`, `/login.html` etc. para as rotas React
   (`server.js`, mapa `legacyParaSpa`). Ainda assim os HTMLs continuam versionados e
   mantidos — são o fallback quando `dist/` não existe. **Decidir:** manter como
   fallback declarado ou remover e passar a exigir build (o que apagaria também
   `public/js/admin-cardapio.js`, `admin-relatorio.js`, `caixa-divisao.js`,
   `mesa-app-*.js`, `realtime.js`, `voz-*.js` e o CSS legado — vários ainda cobertos
   por testes que leem o arquivo, não o comportamento).
3. **Duplicação de HTML entre `public/` e `dist/`**: 15 arquivos `.html` idênticos
   byte a byte são versionados duas vezes (o build os copia). Só `index.html` difere
   de fato. Reduz o diff de todo PR de UI.
4. **`public/style.css` carrega Google Fonts** (`@import url('https://fonts.googleapis…')`)
   no caminho legado, enquanto o resto do sistema serve fontes do próprio domínio
   (`docs/FORNECEDOR-E-SERVICOS-QR-ADMIN.md` registra que isso foi corrigido no
   cardápio, não nas páginas legadas).
5. **`dist/` versionado com hash de conteúdo no nome.** Funciona (o build de CI
   confere forma, não bytes) e o teste `dist-producao` garante build de produção,
   mas cada PR de UI reescreve `dist/assets/index-*.js` inteiro no diff. Alternativa
   já discutida em #301 é servir build no deploy; não foi feita.
6. **`postcss` está em `devDependencies` sem `postcss.config.*`** — só `@tailwindcss/vite`
   o usa hoje. Candidato a sair se ninguém mais precisar.
7. **Cobertura de E2E depende de Chromium (`@sparticuz`)** e não roda no CI padrão
   (`npm run test:e2e` é manual). 21 arquivos em `tests/e2e/` sem execução
   automatizada — regressões visuais só aparecem se alguém rodar.
8. **`CLAUDE.md`/histórico de decisões:** a issue #313 tem um documento de auditoria
   na branch correspondente (`docs/engineering/issue-313-auditoria-atendimento-colaborativo.md`);
   ele entra junto quando a #313 for integrada.

### 2.3 Verificação executada nesta limpeza

```
npm ci                                  ok (145 pacotes)
npm run typecheck                       ok
NODE_ENV=production npm run build       ok — dist/ regenerado, versões em dia
node scripts/run-tests.js               692 testes, 691 pass, 1 skip*, 0 fail
npm run smoke:panorama / :fila / :2fa / :mesas   ok
node --check server.js + db/*.js + scripts/*.js  ok
tests/cardapio-isolamento.test.cjs      10/10 com o commit de referência buscado
```

\* O único skip é o teste do cardápio congelado quando o commit de referência não
está no clone raso; ele passa com `git fetch --depth=1 origin bc9727ef3368`.

**Falhas pré-existentes encontradas na linha de base** (`6d75e1a`, antes de
qualquer mudança): 4 testes de versão falhavam porque `dist/` estava defasado em
relação a `public/garcom-pwa/` (`build-version.json`, `versao.json`, `sw.js` e a
cópia do shell). `NODE_ENV=production npm run build` resolveu — é o mesmo comando
que o teste manda rodar.
