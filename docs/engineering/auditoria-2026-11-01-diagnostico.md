# Diagnóstico de auditoria — QR Admin (2026-11-01)

> **Fase 1 (somente leitura).** Nenhum arquivo de aplicação foi alterado. Este documento é a
> única adição; todos os outros arquivos auditados estão idênticos ao commit `58c3433`.
> Nenhum commit foi feito, nenhuma issue foi fechada, nenhum PR foi mergeado, nada foi deployado.

Referências: issue [#55](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/55),
[#171](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/171)/PR
[#172](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/172),
[#173](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/173)/PR
[#174](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/174),
[#175](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/175)/PR
[#176](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/176).

---

## 1. Resumo executivo

1. **A troca de senha já está implementada, integrada em `main` e testada de ponta a ponta.** O que
   falta da #55 é apenas **2FA** (documentado, não implementado) e uma atualização do texto/checklist
   da issue. Isso foi verificado por leitura de código **e por execução real** dos testes de
   integração contra PostgreSQL descartável (15/15 verdes).
2. **Nenhum dos três PRs abertos (#172, #174, #176) está mergeável hoje.** #172 e #176 falham o
   typecheck/regressão; os três estão `OPEN`, nenhum entrou em `main`. O #174 é o único verde.
3. **Existem dois bugs reais, ainda não relatados em issue, dentro dos PRs abertos** — encontrados
   por execução, não por leitura: (a) #172 não compila (`TS1381`) e seu teste de regressão falha;
   (b) #176 quebra `metricasGarcons()` com **qualquer data** (`400 Informe data em YYYY-MM-DD`) e
   quebra um teste de regressão do PWA. Ambos seriam regressões de produção se mergeados.
4. **A identidade visual não está unificada.** Há **três linguagens concorrentes**: tokens "A COMANDA"
   (papel/madeira/brasa), a paleta **azul/violeta neon** hardcoded no "palco" do Dashboard e das telas
   operacionais (212 ocorrências de hex fora dos tokens), e o CSS legado em `public/theme-glass.css`.
   A imagem de referência ("Os números da sua casa") corresponde ao dashboard azul/violeta — ou seja,
   a referência escolhida **está fora** do design system documentado em `docs/DESIGN_SYSTEM.md`.
5. **A auditoria funcional dos garçons é mais rasa do que o texto da #175 sugere**: existem dados de
   autoria em cinco tabelas, mas não existe tela de consulta da trilha `auditoria_eventos`, e as
   ações de cardápio/categorias/garçons não geram evento (pendência já reconhecida em
   `docs/engineering/auditoria-operacional.md`).
6. **O deploy de produção está parado desde 2026-10-31** (`QUEUED`), registrado em
   `docs/engineering/railway-queued-deploy-incident-2026-10-31.md`. `main` atual **não está em
   produção** — isso muda o cálculo de risco de qualquer merge.

---

## 2. Estado de `main` e ambiente verificado

| Item | Valor |
|---|---|
| Commit de `main` auditado | `58c3433262dee7e83a9bef7c44643dc3478c7488` (`docs(ops): registra deploy Railway preso em QUEUED`) |
| Base dos PRs #172/#174/#176 | todos têm merge-base exatamente `58c3433` — nenhum foi rebaseado sobre outro |
| Branches remotas | `main`, `feat/admin-mesas-busca-multipla`, `fix/modal-viewport-layering`, `feat/garcom-relatorios-categorias-drag` |
| Último deploy de produção | `exquisite-nurturing/production`, commit `58c3433`, criado 2026-10-31T13:08Z, status final `success` às 13:31Z (registro no GitHub Deployments) |
| Incidente aberto | deploy `15539b40…` (commit `4189ac9`) permaneceu `QUEUED`; o deploy posterior de `58c3433` concluiu, mas o documento **não foi atualizado** com esse desfecho |
| Node usado na verificação | v22.22.3 / npm 10.9.8 |

### Verificações executadas agora (nesta sessão)

| Verificação | Comando | Resultado |
|---|---|---|
| Instalação limpa | `npm ci` | OK — 145 pacotes |
| Regressão (sem PostgreSQL) | `npm run test:regression` | **387 pass / 0 fail** (369 subtests + suites) |
| Typecheck | `npm run typecheck` | **OK** (sem erros) |
| Build | `npm run build` | **OK** (aviso de chunk > 500 kB, pré-existente) |
| Migrações em PostgreSQL 18 descartável | `npm run db:migrate` | **32/32 aplicadas** |
| Integração de senha (#55) | `node --test tests/postgres-password-change.test.cjs` | **15/15 pass** |
| Integração de remoção de garçom | `node --test tests/postgres-remocao-garcom.test.cjs` | **4/4 pass** |

### Limitações de ambiente (declaradas, não contornadas)

- `pg_dump`/`psql` não existem neste sandbox → suíte `postgres-backup-restore` e o drill da #41 **não
  puderam** ser executados aqui.
- Chromium do `@sparticuz/chromium` não carrega (faltam `libnspr4`/`libnss3` no sandbox) → **E2E
  visual/Playwright não foi executado**. Toda afirmação sobre UI abaixo vem de leitura de código + CI,
  não de execução local. O CI de `main` roda o `smoke:panorama` (SSR) com sucesso, o que cobre apenas
  o render do panorama.
- Produção/Railway não foi acessada. Nenhum dado real foi lido ou alterado.

---

## 3. Issue #55 — senha e 2FA

### 3.1 Troca de senha: **CONCLUÍDO EM `main`**

Fluxo confirmado de ponta a ponta (arquivos atuais, não presumidos):

| Camada | Arquivo | Evidência concreta |
|---|---|---|
| Política de senha (fonte da verdade) | `db/auth.js` | `validarPoliticaSenha`: 12–128 chars, ≥5 caracteres distintos, bloqueia lista de senhas comuns, não pode conter o login |
| Hash | `db/auth.js` | `scrypt` com salt de 16 bytes e `timingSafeEqual` na verificação |
| Troca da própria senha | `db/auth.js` → `trocarSenha()` | Transação única com `pg_advisory_xact_lock(741928350112)`, `FOR UPDATE`, reautenticação pela senha atual, rejeita repetir a atual, rejeita senha já usada por **outra conta ativa**, atualiza hash + `senha_alterada_em`, `DELETE FROM staff_sessoes WHERE staff_id` (revoga **todas** as sessões) e grava auditoria — tudo no mesmo commit de transação |
| Emissão de sessão nova | `db/auth.js` | `criarSessao()` após o commit, token rotacionado; rota seta `Set-Cookie` novo |
| Rota HTTP | `server.js:640` | `POST /api/me/senha` com `exigirSessao` (sessão + Origin + CSRF) e rate limit duplo: `senha:${id}` 5/15 min e `senha-ip:${ip}` 20/15 min |
| Recuperação pelo admin | `server.js:686-700`, `:940` | `GET /api/admin/contas` e `POST /api/admin/contas/senha` exigem sessão + CSRF + papel `admin`, **sem** exigir senha antiga; autorização revalidada **dentro** da transação (`FOR SHARE` no ator + revalidação do cookie), inclusive contra revogação concorrente |
| Troca obrigatória | `db/auth.js` (`exigeTrocaDeSenha`, `SQL_FLAGS_SENHA`), `server.js:313`, `db/auth.js:377` | `deve_trocar_senha` do seed/script **ou** hash idêntico ao de outra conta ativa → `exigirAcesso` devolve `403 SENHA_TROCA_OBRIGATORIA`; `/api/me`, `/api/logout`, `/api/me/senha` continuam acessíveis; o stream SSE também é bloqueado |
| UI | `src/components/TrocarSenha.tsx`, `src/components/OpsShell.tsx:106/132/296/325` | Diálogo obrigatório sem opção de fechar; admin vê seletor de setor (redefinição privilegiada); não-admin mantém senha atual obrigatória |
| Auditoria | `db/migrations/0024_staff_troca_senha.sql`, `0028_admin_redefine_senha.sql` | Tabela `staff_credencial_eventos` com `evento` restrito por CHECK, `sessoes_revogadas`, ator (`ator_staff_id`/`ator_login`) — **sem** coluna de senha/hash/token/IP |
| Script operacional | `scripts/reset-senha.js` | Exige `STAFF_SEED_PASSWORD` ≥12, valida `--login`, marca `deve_trocar_senha = TRUE`, **não imprime a senha** e sanitiza o erro (não vaza query/segredo) |
| Documentação | `docs/engineering/admin-credentials-and-2fa.md` | Matriz critério × implementação, inclusive impacto de deploy da troca obrigatória |

**Testes (executados nesta sessão, PostgreSQL real):** `tests/postgres-password-change.test.cjs`
15/15 — senha atual errada auditada sem alterar nada; política/repetição/reuso entre contas; revogação
total + auditoria sem segredos; bloqueio até trocar; senha compartilhada; concorrência na mesma conta e
entre contas; redefinição pelo admin (outro setor e a própria conta); negativas de papel/alvo inativo;
sessão revogada durante espera de lock; `listarContasStaff` sem hash. Somam-se 23 asserções
estruturais em `tests/password-change.test.cjs` (regressão verde).

**Conclusão:** não reimplementar nada desse fluxo. Os quatro critérios técnicos da #55 (trocar com
reautenticação, invalidar sessões + auditar, forçar troca inicial/senha compartilhada, autorização +
validação + limite + regressão) estão atendidos. Resta **atualizar o checklist da issue**, que continua
com todos os itens desmarcados (`- [ ]`) apesar de implementados.

### 3.2 2FA: **PENDENTE — documentado, não implementado**

Evidência negativa (busca em todo o código, excluindo `node_modules`/`dist`):

```
grep -rniE "totp|2fa|mfa|otpauth|webauthn" --include=*.js --include=*.ts --include=*.tsx --include=*.cjs .
→ apenas 3 ocorrências, todas em tests/postgres-mesas-panorama.test.cjs (falso positivo de "mfa")
```

Não há coluna de segredo, rota `/api/login/2fa`, sessão parcial, códigos de recuperação nem tabela de
dispositivos. O capítulo 2 de `admin-credentials-and-2fa.md` é uma **proposta** (TOTP recomendado,
backup de códigos, break-glass `reset-2fa.js`, revogação de sessões) com quatro decisões em aberto.
**Não implementar sem decisão explícita** — a própria issue condiciona isso a "definir método e
critérios de recuperação", e a proposta depende de `TOTP_ENC_KEY` (gestão de segredo/backup) e de
saber se existirão contas individuais (hoje `admin` é login de papel compartilhado).

Riscos residuais da #55 que **não** são 2FA e merecem issue própria se você quiser tratá-los:
`X-Forwarded-For`/rate limit por IP dependem de `TRUSTED_PROXY_HOPS` + `CLIENT_IP_HEADER` corretos no
Railway (issue #50, aberta); e o limitador é **em memória, por processo** (`db/rateLimit.js`), logo não
vale entre múltiplas instâncias.

---

## 4. Issues/PRs #171/#172, #173/#174, #175/#176

### 4.1 #171 / PR #172 — busca múltipla de mesas: **EM PR ABERTO, QUEBRADO**

Estado em `main`: o mapa (`src/screens/admin/MapaQrMesas.tsx`, 247 linhas) ainda tem **"Nº da mesa"**,
botão **"Abrir mesa"**, botão **"Adicionar mesas"/"Limite atingido"**, contador **"teto {limite}"** e
lista completa de mesas sempre renderizada (linhas 85, 106, 114). Portanto a issue **não** está
integrada.

Estado no PR: os requisitos funcionais estão implementados (busca por vírgula com `Set` de duplicatas,
lista oculta até pesquisar, `h-12 w-full` no campo, `aria-describedby`/`title` de ajuda, feedback de
entrada inválida, aviso de mesas não encontradas, card inteiro como `<button>` sem o botão "Abrir",
ações secundárias fora do botão). **Porém:**

- **Não compila.** `npx tsc --noEmit` no worktree do PR: `src/screens/admin/MapaQrMesas.tsx(168,14):
  error TS1381: Unexpected token.` — chaves desbalanceadas após o `})}}` do `map`. CI `verify` falha
  exatamente no passo *Typecheck*.
- **Regressão própria falha:** `tests/pracas-mesas-admin.test.cjs` → `not ok 6` porque o teste exige
  `/!numero\\.trim\\(\\)/` e o código tem `{!numero.trim() ? (` (escaping do regex no teste).
- `postgres-integration` falha em *Build for E2E* (consequência do mesmo erro de sintaxe).

Classificação: **Em PR aberto** (implementação existe, não está em `main`, não está funcional).

### 4.2 #173 / PR #174 — modais: **PARCIAL** (posicionamento) + **PENDENTE** (identidade visual)

`main` hoje: `Modal` em `src/components/ui.tsx:204` é `fixed inset-0 z-50 flex items-end sm:items-center`,
renderizado **inline** (sem portal), sem bloqueio de scroll do `document`, com `max-h-[92dvh]`. Qualquer
ancestral com `transform`/`filter`/`contain` (o `motion.div` do `OpsShell`/`AnimatePresence`) redeclara o
containing block e o `fixed` deixa de ser relativo à viewport — exatamente o sintoma da issue.

PR #174 (`0c0944b`): portal em `document.body`, `z-[100]`, `max-h-[calc(100dvh-24px)]`,
`overscroll-contain`, bloqueio/restauração de `document.body.style.overflow`, Escape independente de
`closeOnBackdrop`, teste estrutural novo. Verificado aqui: **typecheck OK, build OK, `design-system`
8/8, checks do GitHub todos verdes** (`verify`, `postgres-migrations`, `postgres-integration`).

Lacunas conhecidas do PR (a completar em implementação posterior independente):
- **não há focus trap, nem reposicionamento de foco inicial, nem retorno de foco ao elemento de origem**;
- **nenhum E2E de viewport** (320/375/tablet/desktop, página rolada, lista longa, tema claro/escuro) — o
  teste adicionado é estrutural (regex no fonte), não comportamental;
- os diálogos do **PWA** (`public/garcom-pwa/index.html`, `<dialog class="sheet">`) já estão centralizados
   e limitados (coberto por `tests/pwa-popups-centrais.test.cjs`), mas **não usam os tokens** visuais;
- card "Abrir" de `PanoramaMesas.tsx` (linhas 348/362) continua existindo — o critério de card acionável
  da #173 só foi tratado para o mapa, não para o panorama.

Classificação: **modal = em PR aberto, correto e verde**; **identidade visual = pendente** (ver §5).

### 4.3 #175 / PR #176 — categorias por arrastar, relatório de garçons e ação duplicada no PWA: **EM PR ABERTO, QUEBRADO**

Estado em `main`: categorias ainda com `ArrowUp`/`ArrowDown` (`src/screens/Admin.tsx:299/309`,
`moverCategoria`); relatório de garçons tem **somente** 4 colunas (Contas, Ticket médio, Vendas, por dia);
PWA renderiza botão individual **e** botão de lote para o mesmo item quando `ids.length === 1`
(`public/garcom-pwa/app.js:542`, `if(!ids.length)continue;`). Nada integrado.

O PR entrega, de fato:
- drag and drop (`draggable`, `onDragStart/Over/Drop`, bloqueio de início do arraste em botões que não
  são handle), alternativa **Alt+↑/↓**, `aria-roledescription`, `role="status"` de confirmação,
  persistência via `setCategoriasOrdem` → `PUT /api/admin/categorias/ordem` (endpoint **já existente** em
  `server.js:1172`);
- `metricasGarcons` ampliado com 8 métricas novas (pedidos registrados, pedidos com entrega registrada,
  mesas assumidas, transferências recebidas/realizadas, itens assumidos/retirados/entregues), todas
  ancoradas em colunas que **existem** (`pedidos.garcom_registrou_id`, `itens_pedido.aceito_por_id/
  retirado_por_id/entregue_por_id`, `mesa_atendimento_historico.garcom_novo_id/garcom_anterior_id`),
  usando `AT TIME ZONE` do `APP_TIMEZONE`;
- PWA: `if(ids.length<2)continue;` + bump de cache `garcom-pwa-shell-v33 → v34`.

**Defeitos bloqueantes encontrados por execução (não visíveis na leitura):**

1. **`metricasGarcons` retorna 400 para qualquer data.** A regex de validação em `db/atendimento.js`
   virou `/^\\d{4}-\\d{2}-\\d{2}$/` (barra dupla), que exige literalmente `\d`:
   ```
   node -e "require('./db/atendimento').metricasGarcons({data:'2026-11-01'})"
   PR #176 → ERRO: 400 Informe data em YYYY-MM-DD
   main   → OK 2026-11-01
   ```
   Efeito em produção: o relatório de garçons inteiro deixaria de carregar.
2. **Regressão quebrada:** `tests/pwa-garcom-lote-cobranca.test.cjs` → `not ok 214 - cancelar
   confirmação de entrega não envia dados e reabilita o botão` (`Cannot read properties of undefined`)
   — porque o teste ainda espera o botão de lote com **um** item. Suíte completa: 388/389.
3. **`tests/postgres-remocao-garcom.test.cjs` falha no PR** (`not ok 1`) e passa em `main` — teste
   adaptado, mas a asserção de métricas não foi atualizada para o novo shape.

**Lacunas de requisito da #175 ainda abertas mesmo dentro do PR:**
- Relatório é **por dia** (input `type="date"`), não por período (a issue pede "período, não apenas um
  dia"; note que `Relatorio()` já tem `from`/`to`, o que pode ser reaproveitado);
- não há **ranking** explícito, nem detalhe drill-down por garçom;
- **desconto** e **taxa de serviço por garçom** não aparecem (existem em `mesa_sessoes.desconto`/
  `taxa_servico`, só não foram agregados);
- tabela com `min-w-[1200px]` em 11 colunas — sem verificação de responsividade/E2E;
- "mesas assumidas" conta `mesa_atendimento_historico` onde `garcom_novo_id = g.id`, o que inclui
  transferência recebida (o mesmo evento também aparece em "transferências recebidas"): **há
  sobreposição semântica** que precisa de rótulo ou de exclusão explícita, senão o número engana;
- arraste por toque em iOS não foi validado (HTML5 DnD é irregular em `Safari/iOS`); a issue pede
  explicitamente mouse **e toque** — uma alternativa robusta é Pointer Events com `setPointerCapture`
  ou handle dedicado;
- nada foi executado como E2E de arraste real (o teste adicionado é estrutural).

Classificação: **Em PR aberto** (com dois defeitos bloqueantes).

---

## 5. Identidade visual global — estado real e estratégia

### 5.1 Inventário (rotas/telas existentes)

`src/router.tsx` (hash router): `#/` (Landing), `#/login`, `#/mesa/:token` (**exceção do cliente**),
`#/garcom/:token` (PWA), `#/cozinha`, `#/bar`, `#/caixa`, `#/admin/:secao` com seções
`painel`, `cardapio`, `mesas` (panorama/mapa), `garcons`, `funcoes` (estoque, relatório, histórico,
senhas, purge). Componentes transversais: `OpsShell`, `ui.tsx` (Btn, Input, Badge, Modal, Toasts),
`FilaProducao`, `Paginacao`, `PanoramaMesas`, `MapaQrMesas`, `MesaDetalheModal`, `GerenciarPracas`,
`QrDownloadButton`, `TrocarSenha`.

### 5.2 Três linguagens concorrentes (evidência quantitativa)

| Camada | Arquivo | Hex hardcoded | Observação |
|---|---|---|---|
| Tokens "A COMANDA / Taproom Brasa" | `public/garcom-pwa/design-tokens.css` (fonte única, importada por `src/index.css:4` **e** pelo PWA) | 38 (primitivos) | papel `#F0E6D2`, madeira `#17120E`, brasa `#E8501F`, latão `#C99A2E`, lúpulo `#3E7B3A` |
| Palco do Dashboard ("Os números da sua casa") | `src/screens/dashboard.css` | **119** | azul/violeta: `#101322`, `#0b101b`, `#8393b4`, `#b7a5ff`, `#8bf8ce`, `#d8fa9c`; 11 usos de `#ffffff` |
| Palco operacional (cozinha/bar) | `src/screens/operacional.css` | **93** | mesma família azul/violeta, acentos ciano/âmbar |
| CSS legado | `public/theme-glass.css` (+ `style.css` 114, `mesa.css` 57) | 73 | usado pelas páginas HTML de `public/*.html` (caminho legado, servido só quando `dist/` não existe) |

Ambos os "palcos" declaram explicitamente no cabeçalho que ficam **isolados** do sistema de tokens
(`dashboard.css:1-2`, `operacional.css:5-7`). Ou seja: a referência visual que você elegeu (dashboard)
**não** é a mesma família do design system documentado — é uma segunda identidade embutida por CSS
isolado, aplicada só em duas telas, exatamente o "padrão concorrente" que a #173 quer eliminar.

### 5.3 Auditoria de requisitos da #173 (design system)

| Item | Estado |
|---|---|
| Tokens para cor/superfície/borda/sombra/tipografia/raio/estado | **Existem** (`design-tokens.css`, 2 níveis primitivo→semântico, override completo do `@theme` do Tailwind, teste de contraste AA em `design-system.test.cjs`) |
| Tokens para **espaçamento** e **estado de interação** centralizados | **Ausentes** (espaçamento é utilitário ad hoc; `--dur-*`/`--ease-*` existem, mas hover/focus/loading/success/error são reimplementados por componente) |
| Aplicação em Admin/Dashboard/Mesas | **Parcial** — Admin/mesas usam tokens; o Dashboard tem paleta própria |
| Aplicação em Cozinha/Bar | **Parcial** — `operacional.css` com paleta própria |
| Aplicação no PWA | **Parcial** — `styles.css` importa `design-tokens.css` (231 usos de `var(--…)`), mas há exceções (popups com `!important` inline no `index.html` e verdes/cianos próprios) |
| Páginas legadas `public/*.html` | **Divergentes** (theme-glass/style.css) — hoje inalcançáveis em produção porque `dist/` é servido antes (`server.js:1260+`), mas continuam versionadas e testadas |
| Exceção apenas no cardápio do cliente | **Não cumprida** — a exceção hoje vale para o dashboard e o palco operacional também |
| Hover/foco/seleção/carregamento/sucesso/erro consistentes | **Não** — `focus-visible` existe em partes, `Modal` sem focus trap, loading/erro variam por tela |
| Responsividade | `sm`/`lg` aplicados ad hoc; sem verificação E2E (bloqueada no sandbox) |
| Documentação do design system | `docs/DESIGN_SYSTEM.md` é detalhado, mas descreve **outra** direção estética (papel/brasa) e menciona `Archivo`/`Martian Mono` no texto de justificativa, enquanto a seção 3 fala `Fraunces`/`Plus Jakarta`/`JetBrains Mono` — **documento internamente inconsistente** |

### 5.4 Estratégia de padronização proposta (para decisão, não implementada)

**Decisão prévia necessária (bloqueante):** qual é a identidade canônica?
- **Opção A (recomendada)** — adotar o dashboard "Os números da sua casa" como identidade global:
  criar `--stage-*`/superfícies escuras translúcidas e acentos violeta/ciano **como tokens** no
  `design-tokens.css`, e reexpressar o CSS de `dashboard.css`/`operacional.css` em cima deles,
  removendo os 212 hex. Os tokens "A COMANDA" continuam existindo para a **interface do cliente**
  (`/mesa/:token`) e como base semântica de contraste.
- **Opção B** — manter "A COMANDA" como identidade global e trazer o dashboard de volta aos tokens
  (perde-se a referência visual escolhida).
- **Opção C** — híbrido: base "A COMANDA" + "camada de vitrine" (vidro/neon) só em cards de destaque,
  com tokens únicos.

Sequência sugerida (independentemente da opção, exceto o passo 1):
1. Decidir A/B/C e registrar em `docs/DESIGN_SYSTEM.md` (com correção da divergência
   Archivo/Martian x Fraunces/Jakarta).
2. Adicionar ao `design-tokens.css`: espaçamento, durações/easings, elevação em camadas, estados
   (`hover`, `focus-ring`, `selected`, `loading`, `success`, `error`) e superfícies de "palco".
3. Migrar `dashboard.css` e `operacional.css` para consumir apenas tokens (elimina 212 hex; teste que
   proíba `#[0-9a-f]{3,8}` nesses arquivos).
4. Varrer `src/` por hex fora de tokens e por classes utilitárias duplicadas; consolidar em `ui.tsx`.
5. PWA: trocar valores pontuais de `styles.css`/`index.html` por tokens (o arquivo já importa os tokens).
6. Páginas legadas: decidir **remover** (recomendado, com issue própria) ou congelar/`noindex`; não
   migrá-las.
7. Fechar com E2E visual (Playwright) por rota nos breakpoints 320/375/768/1280 nos dois temas; hoje o
   E2E visual existe (`tests/e2e/visual-system.e2e.cjs`) mas depende de Chromium com libs que o CI tem e
   este sandbox não.

---

## 6. AITMPL — componentes, riscos e compatibilidade com Arena.ia

Catálogo consultado: `https://aitmpl.com/mods/` (47 componentes) e as páginas individuais dos quatro itens
pedidos. **Nada foi instalado nem executado.**

| Componente | Versão/estado real | O que faz | Permissões / superfície | Compatibilidade com Arena.ia |
|---|---|---|---|---|
| `security/block-destructive-commands` | 5 arquivos, 190 linhas, 8,1 KB; último toque `51893c9` (06/10/2026) | Hook `tool.call` com matcher `{tool:"Bash"}` em placement *instead*; devolve `{deny}` antes de o comando rodar; falha do próprio check → **deny** (fail-closed). Opção `patterns` | Nenhum acesso a rede; lê configuração de plugin; intercepta **todo** Bash | **Não** — é um *Mod* de Claude Code (function hooks, `$` engine, `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, onipresente em 2.1.287+). Arena.ia não expõe hook `tool.call` |
| `security/protected-paths-guard` | 5 arquivos; também publicado como *function-hook* "experimental" | Nega `Edit/Write/NotebookEdit` em `.env`, `.env.*`, lockfiles, `.github/workflows/*.yml`, `.git/**`, `*.pem`, `*.key`, `id_rsa*`, com allowlist | Só leitura do evento; sem rede | **Não** pelo mecanismo; **sim** a política |
| `security/large-edit-confirmation` | 4 arquivos, 173 linhas | `tool.call` em Edit/Write, lê arquivo via `$.fs.read`, pergunta via `$.ui.ask`; `maxLines` (default 1000), `headless: deny|allow` | Leitura de arquivos; UI de pergunta; sem rede | **Não** (`$.fs`, `$.ui.ask` são da engine Claude Code) |
| `security/secret-redactor` | 5 arquivos, 235 linhas | Hook *after*: substitui chaves/tokens/JWT/connection strings em **todo** resultado de ferramenta antes do modelo ler; recusa reecoar placeholder em Bash; falha → retém saída | Reescreve conteúdo de retorno; regex configurável; sem rede | **Não** pelo hook; **sim** como regra de processo |

Riscos observados no próprio catálogo: o scanner NVIDIA SkillSpector marcou "MCP server referenced
without pinned version: `npx claude-code-templates`" (risco de *rug pull* de dependência não fixada) em
todos os quatro, "Agent Config Directory Access" (acesso a diretório de configuração do agente) e, no
`secret-redactor`, "Credential Access ×2" no arquivo de teste. Os comandos de instalação escrevem em
`.claude/skills/<nome>/`, criam código TypeScript no repositório e passam a interceptar ferramentas do
agente — nenhum deles é inerte.

**Veredito:** não instalar. Nenhum dos quatro é executável no Arena.ia (que não implementa `$` engine /
function hooks / `AskUserQuestion` plugin). O ganho real é a **política**, e ela pode ser portada como
instruções portáveis:

- *block-destructive-commands* → já equivale ao §12 do seu briefing (sem `--force`, `reset --hard`,
  migrations destrutivas, deploy sem autorização). Candidato a um `AGENTS.md`/`docs/engineering/
  agent-guardrails.md` com a lista de comandos proibidos e o que fazer no lugar.
- *protected-paths-guard* → lista explícita de caminhos que exigem confirmação humana antes de editar:
  `.env*`, `package-lock.json`, `.github/workflows/**`, `db/migrations/**`, `server.js` (rotas
  financeiras), `security/**`.
- *large-edit-confirmation* → limiar objetivo: qualquer edição > 300 linhas em `src/screens/Admin.tsx`
  ou > 1000 linhas em um arquivo exige aprovação e plano de arquivos afetados.
- *secret-redactor* → regra de saída: nunca imprimir `.env`, `DATABASE_URL`, tokens `STAFF_SEED_PASSWORD`,
  cookie `lqr_session`, `X-CSRF-Token`; se precisar depurar, mascarar. O projeto já aplica isso em
  `db/log-sanitizer.js` e `db/auditoria.js` **no código do produto** — o que é mais forte que um hook de
  agente.

Equivalente para o fluxo do ChatGPT (sem presumir nada instalado): as mesmas regras valem como
instrução de projeto/política de repositório, pois dependem de comportamento, não de API. Não existe
mecanismo de hook no produto "ChatGPT" que possa ser afirmado aqui como disponível.

---

## 7. Outras issues/PRs relevantes

| Item | Título | Situação real em `main` | Evidência | Ação recomendada |
|---|---|---|---|---|
| #41 (P0, aberta) | Comprovar backup/restore PostgreSQL | **Parcial** — testes `tests/postgres-backup-restore.test.cjs` + `scripts/backup-restore-drill.js` existem; checklist pós-upgrade documentado em `docs/engineering/backup-restore.md` | Suíte exige `pg_dump`/`psql` (ausentes aqui); último deploy bloqueado por Railway | Manter aberta; rodar `npm run db:restore-drill` num ambiente com clientes PG e anexar saída |
| #43 (P1, aberta) | Health check read-only, smoke seguro, alertas | **Parcial** — `GET /healthz` (`server.js:271`), `scripts/health-smoke.js`, `X-Request-Id` e `observabilidade-alertas.md`; alertas externos não configurados | Código presente | Fechar só após configurar alerta real |
| #44 (P1, aberta, 5 comentários) | Política de dados/retenção/purge | **Parcial/documentado** — `data-policy-proposal.md`, `data-retention-rfc.md`, `db/purge.js`; prazo e aprovação pendentes | Docs + código de purge | Decisão do responsável |
| #45 (P1, aberta) | Licença, repo canônico, proveniência | **Pendente** — não existe `LICENSE` na raiz; `asset-provenance.md` existe | `ls LICENSE*` → inexistente | Decisão jurídica |
| #48 (aberta) | Autoria persistente de ações | **Parcial** — `auditoria_eventos` (0025) + `db/auditoria.js` gravando em caixa/atendimento/itens/pedidos/entregas; **sem** eventos de cardápio/categorias/garçons e **sem** tela de consulta; gerente reautenticado para desconto (PR #168 mergeado) | `docs/engineering/auditoria-operacional.md`, tabela de ações em `db/*.js` | Abrir issue filha "auditar mutações de admin + consulta da trilha" |
| #50 (aberta) | Proxy confiável + rate limit por IP/token/sessão | **Parcial** — `clientIp()` com `TRUSTED_PROXY_HOPS` (default 0) e `CLIENT_IP_HEADER`; limitador **em memória por processo** | `server.js:109`, `db/rateLimit.js` | Documentar config do Railway; avaliar Redis se houver réplica |
| #53 (aberta) | Fotos base64 fora do JSON | **Parcial** — `db/foto.js` grava arquivo e `GET /api/fotos/:id` serve binário; upload ainda aceita data-URL base64 | `db/foto.js:175-229` | Verificar payload real de `/api/cardapio` antes de fechar |
| #140 (PR fechado, não mergeado) | Design System v2 "Mesa & Brasa" | **Obsoleto** — absorvido por #141/#145/#146 | PR `CLOSED`, sem merge | Nenhuma ação |
| #133 (PR fechado) | Fotos/busca/PIX do garçom | **Obsoleto** — substituído pelo #134 (mergeado) | PR `CLOSED` | Nenhuma ação |
| #176 (PR aberto) | — | **1 comentário seu** (17:27Z) limitando o escopo visual | `issues/176/comments` | Ver §4.3 |

Nota de histórico: `main` teve merges recentes relevantes (#145, #146, #159, #160, #161, #162, #163,
#166, #167, #168, #169, #170) e o CI de `main` está **verde** no commit atual (`verify` +
`postgres-migrations` success; o `postgres-integration` success às 17:09Z é o run do push da branch
`fix/modal-viewport-layering`, não do deploy de `main` — o run de `main` que falhou em
`postgres-integration` é de 2026-10-31T13:08Z, anterior ao commit `58c3433`).

---

## 8. Plano priorizado, dependências e decisões

### P0 — desbloquear com segurança (nada disso é merge hoje)

1. **Corrigir o PR #172** (não mergear como está): fechar as chaves do `map` em
   `MapaQrMesas.tsx` (linha ~168) e alinhar `tests/pracas-mesas-admin.test.cjs` ao texto real.
   Validar: `typecheck`, `build`, `test:regression`, `smoke:panorama`.
2. **Corrigir o PR #176** (não mergear como está): reverter a regex de data para
   `/^\d{4}-\d{2}-\d{2}$/`, atualizar `pwa-garcom-lote-cobranca` (o caso "um item" passa a esperar
   **ausência** do botão de lote) e `postgres-remocao-garcom` ao novo shape de métricas.
3. **Mergear o PR #174** (único verde) — é pré-requisito do modal correto em qualquer tela; baixo risco.

### P1 — requisitos funcionais

4. **#173 parte 2**: focus trap + retorno de foco + E2E de viewport no `Modal`; card acionável também no
   `PanoramaMesas` (remover os dois botões "Abrir", linhas 348/362).
5. **#175 parte 2**: período além do dia; desconto/taxa por garçom; rótulo ou dedup de "mesas assumidas"
   vs "transferências recebidas"; ranking/detalhe; arraste por toque real (Pointer Events).
6. **#55**: atualizar o texto/checklist da issue (implementado vs 2FA pendente) — **sem fechar** até a
   decisão sobre 2FA.

### P2 — identidade visual global

7. Decisão A/B/C (§5.4) → tokens de espaçamento/estado/superfície → migração de `dashboard.css` e
   `operacional.css` → varredura de hex → PWA → E2E visual.

### P3 — higiene e governança

8. Retomar deploy Railway (issue/incidente) **antes** de qualquer merge em `main` que precise ir ao ar.
9. Remover/congelar páginas legadas `public/*.html` + `theme-glass.css` (issue própria).
10. `LICENSE` (#45), retenção (#44), alertas (#43), consulta da trilha de auditoria (#48).

### Dependências / conflitos entre os PRs

- #172 e #176 **não** têm conflito de arquivo entre si (#172: `MapaQrMesas.tsx`, `ssr-smoke-panorama.mjs`,
  `pracas-mesas-admin.test.cjs`; #176: `Admin.tsx`, `db/atendimento.js`, `api.ts`, `app.js`, `sw.js`,
  3 testes).
- #174 toca `src/components/ui.tsx` + `tests/design-system.test.cjs` — **interage** com #176 (que não
  toca esses arquivos) e é pré-requisito do trabalho de modal/visual. Mergear #174 primeiro reduz risco.
- A padronização visual mexe em `Admin.tsx`, `dashboard.css`, `operacional.css`, `ui.tsx`, PWA — colide
  com #172 (mapa) e #176 (Admin). **Papel do outro agente:** se ele segue nos PRs de UX acima, este
  agente pode assumir a camada de tokens (`design-tokens.css`, `dashboard.css`, `operacional.css`,
  `docs/DESIGN_SYSTEM.md` + teste anti-hex), que nenhum dos três PRs toca.

### Decisões necessárias (bloqueiam execução)

1. Identidade canônica: **A**, **B** ou **C** (§5.4)?
2. 2FA: iniciar TOTP agora, só `admin`, ou adiar? Quem executa break-glass? Onde fica `TOTP_ENC_KEY`?
3. Fechar #55 depois de atualizar o checklist, mantendo 2FA em issue separada? (recomendado)
4. Autorização para corrigir #172/#176 (mexer em branch de PR de outro agente exige coordenação) e para
   mergear #174.
5. Deploy: retomar o incidente Railway antes ou depois dos merges?

---

## 9. Coordenação com o outro agente

- **Branches vivas hoje:** `feat/admin-mesas-busca-multipla` (#172), `fix/modal-viewport-layering`
  (#174), `feat/garcom-relatorios-categorias-drag` (#176) — todas do mesmo autor (`deividjmoura`), com
  merge-base em `58c3433`. Não há PR de outro agente com arquivos sobrepostos no momento desta auditoria.
- **Arquivos que exigem coordenação antes de editar** (por estarem em PR aberto):
  `src/screens/admin/MapaQrMesas.tsx`, `tests/pracas-mesas-admin.test.cjs`,
  `scripts/ssr-smoke-panorama.mjs` (#172); `src/components/ui.tsx`, `tests/design-system.test.cjs`
  (#174); `src/screens/Admin.tsx`, `db/atendimento.js`, `src/lib/api.ts`, `public/garcom-pwa/app.js`,
  `public/garcom-pwa/sw.js`, `tests/admin-categorias-drag.test.cjs`, `tests/pwa-garcom-lote-cobranca.test.cjs`,
  `tests/postgres-remocao-garcom.test.cjs` (#176).
- **Arquivos livres (proposta de assunção por este agente):** `public/garcom-pwa/design-tokens.css`,
  `src/screens/dashboard.css`, `src/screens/operacional.css`, `docs/DESIGN_SYSTEM.md`,
  `docs/engineering/admin-credentials-and-2fa.md` (atualização de status) e um novo teste anti-hex.
- Regras seguidas aqui: sem `push --force`, sem `reset --hard`, sem cherry-pick, sem merge, sem deploy,
  sem tocar em `.env`, `package-lock.json` ou workflows. Nenhuma issue foi fechada ou editada.

---

## 10. O que não foi possível verificar

- E2E Playwright e validação visual real (Chromium sem `libnspr4`/`libnss3` neste sandbox).
- Drill de backup/restore (#41) — sem `pg_dump`/`psql`.
- Estado ao vivo da produção e do Railway (nenhum acesso; apenas o histórico de Deployments do GitHub).
- Responsividade real em 320/375 px e comportamento de arraste por toque em iOS/Android.
- Se o incidente `15539b40…` foi encerrado: o GitHub mostra deploy posterior com `success`, mas o
  documento do incidente não foi atualizado.


## Diagnóstico histórico do E2E visual-system (2026-11-01)

O teste de acordeão falhava de forma intermitente porque o mock de `EventSource('/api/events')` encerrava o stream imediatamente. O cliente realtime reconectava em aproximadamente 1 segundo; cada reconexão acionava `refreshLiveData()\u2192loadDeliveries()`, que substituía os nós com `root.replaceChildren()`. A interação podia ocorrer durante essa substituição e o teste consultar um elemento já desconectado.

A correção aplicada no teste foi neutralizar `EventSource` via `addInitScript`, pois aquela suíte verifica layout, tema e shell offline, não o comportamento de tempo real. O registro histórico mediu 2 falhas em 5 execuções antes da correção e 8/8 execuções verdes depois; a suíte E2E completa passou 11/11. O aprendizado permanece: investigar substituição concorrente do DOM antes de classificar uma falha como flake de CDP.
