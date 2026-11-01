# Frente B — PRs de UX + aplicação da identidade visual nas telas

Você é um agente de engenharia trabalhando no projeto **QR Admin**, repositório
`deividjmoura/lanchonete-qr-semi-final`. Você assume a **Frente B** de um trabalho dividido em duas
frentes entre dois agentes. Não assuma nenhuma tarefa da Frente A.

Antes de qualquer coisa, leia estes documentos já commitados no repositório:

- `docs/engineering/auditoria-2026-11-01-diagnostico.md` — diagnóstico completo, com evidências e
  números de linha. É a fonte da verdade do estado atual.
- `docs/engineering/coordenacao-2-agentes-2026-11-01.md` — divisão de frentes, donos e arquivos
  (**seção 7 = handoff da Frente A**, com a lista de tokens prontos para uso).
- `docs/DESIGN_SYSTEM.md` — a identidade "Palco Azul/Violeta" já documentada.

> **Atualização de estado (releia antes de agir).** O quadro mudou desde a primeira versão deste
> briefing:
> - **PR #174 já está mergeado** em `main` (`0f832c6`, "fix(ui): keep dialogs centered in the viewport").
>   Não peça autorização para ele: já aconteceu. O que falta do modal virou tarefa no Bloco 2.
> - **PRs #177 e #178 já foram abertos** (empilhados sobre #172 e #176, respectivamente) com as
>   correções que este briefing descreve. Se você é quem os abriu, ignore as seções 1.a/1.b e vá para
>   **1.d — fechar os PRs empilhados**.
> - **A camada de tokens da Frente A está publicada** (`327307b`): o Bloco 3 **não está mais bloqueado**.
> - `main` já avançou para `0f832c6`; sua branch deve partir dele (`git fetch && git rebase origin/main`).

## Mapa de estado dos PRs (conferido em 2026-11-01)

| PR | Base | Estado | O que falta |
|---|---|---|---|
| #172 | `main` | OPEN, quebrado | #177 carrega a correção |
| #177 | `feat/admin-mesas-busca-multipla` | OPEN, `verify` + `postgres-migrations` verdes, `postgres-integration` em andamento | rebase/ordem de merge: **#172 primeiro** |
| #176 | `main` | OPEN, quebrado | #178 carrega a correção |
| #178 | `feat/garcom-relatorios-categorias-drag` | OPEN, **3/3 checks verdes** | mergear #176 e depois #178 |
| #174 | `main` | **MERGED** em `0f832c6` | — |
| #171/#173/#175 | issues | abertas | ver Bloco 2 |

## 0. Decisões já tomadas pelo responsável (não reabra)

1. **A identidade visual global será o dashboard azul/violeta** ("Os números da sua casa"). A **única**
   exceção é o cardápio do cliente em `#/mesa/:token`, que mantém layout próprio.
2. A **Frente A** (outro agente) é a dona da camada de tokens: `public/garcom-pwa/design-tokens.css`,
   `src/index.css`, `src/screens/dashboard.css`, `src/screens/operacional.css`, `src/lib/tema.ts` e
   `docs/DESIGN_SYSTEM.md`. Ela vai publicar os tokens da identidade azul/violeta.
3. **2FA não será implementado agora** (saiu da issue #55, vira issue própria). Não implemente 2FA.
4. A troca de senha (#55) **já está pronta e validada** em `main` (15/15 testes de integração verdes).
   **Não reimplemente, não mexa em `db/auth.js` nem em `src/components/TrocarSenha.tsx`.**

## 1. Sua frente tem dois blocos

### Bloco 1 — Desbloquear e mergear os PRs abertos (faça isto primeiro)

> **Atenção:** as seções 1.a e 1.b descrevem as correções **já aplicadas** nos PRs #177/#178. Se esses
> PRs já existem na sua branch, use-as como checklist de conferência — não reimplemente. O passo que
> falta é o **1.d**.

Os três PRs abertos estão `OPEN`, com merge-base `58c3433`, e **nenhum está mergeável hoje**. Dois deles
têm defeitos reais que eu já reproduzi e cujas correções eu já validei em worktree isolado. Aplique-as.

#### 1.a PR #172 — `feat/admin-mesas-busca-multipla` → issue #171

**Estado:** não compila. `npx tsc --noEmit` retorna
`src/screens/admin/MapaQrMesas.tsx(168,14): error TS1381: Unexpected token.` e o CI falha no passo
*Typecheck*; a regressão própria do PR (`tests/pracas-mesas-admin.test.cjs`) também falha.

**Correção 1 (sintaxe).** Em `src/screens/admin/MapaQrMesas.tsx`, linha ~168, o fechamento do `map`
está `})}}` e deve ser `})}`:

```diff
               </article>
             );
-          })}} 
+          })}
             {mesasFiltradas.length === 0 && (
```

**Correção 2 (import morto revelado pelo typecheck).** Depois da correção 1 aparece
`TS6133: 'Btn' is declared but its value is never read` — troque o import:

```diff
-import { Badge, Btn } from "../../components/ui";
+import { Badge } from "../../components/ui";
```

**Correção 3 (escaping do teste de regressão).** Em `tests/pracas-mesas-admin.test.cjs`, linhas 204-205,
o regex está com escape duplo e nunca casa com o fonte:

```diff
-  assert.match(mapa, /!numero\\.trim\\(\\)/);
-  assert.match(mapa, /numero\\.split\\(","\\)/);
+  assert.match(mapa, /!numero\.trim\(\)/);
+  assert.match(mapa, /numero\.split\(","\)/);
```

**Validação que eu executei nessas correções:** `tsc --noEmit` limpo, `npm run test:regression`
**387/387**, `npm run smoke:panorama` → `SSR smoke OK`, `pracas-mesas-admin` **7/7**.

**Atenção:** não use `dist/` como fonte; o repositório versiona `dist/`, mas os PRs recentes **não**
commitam rebuild. Não commite `dist/` a menos que o responsável peça.

#### 1.b PR #176 — `feat/garcom-relatorios-categorias-drag` → issue #175

**Estado:** `verify` falha em *Typecheck* e *Regression tests*; `postgres-integration` falha em
*Run waiter removal and concurrency PostgreSQL tests*. Três defeitos:

**Correção 1 (BLOCKER de produção: relatório de garçons morre para qualquer data).** Em
`db/atendimento.js:486` a regex ganhou barra dupla e passou a exigir o literal `\d`:

```diff
-  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dia) || Number.isNaN(Date.parse(dia))) {
+  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(Date.parse(dia))) {
```

Prova (executada por mim): `createRequire` do módulo →
`main` → `OK 2026-11-01`; `PR #176` → `ERRO: 400 Informe data em YYYY-MM-DD`. Com a correção voltou a
`OK 2026-11-01`. **Sem isso o endpoint `/api/admin/garcons/metricas` fica 100% quebrado em produção.**

**Correção 2 (regressão do PWA).** `tests/pwa-garcom-lote-cobranca.test.cjs` → `not ok 214 - cancelar
confirmação de entrega não envia dados e reabilita o botão` falha porque o teste ainda espera o botão
de lote com **um** item. A intenção do teste (cancelar a confirmação) continua válida — só precisa de
2 itens para que a ação em lote exista:

```diff
 test('cancelar confirmação de entrega não envia dados e reabilita o botão', async () => {
-  const { root, chamadas, ctx } = await montarEntregas([item(1, 'retirado', { garcomRetirouId: 7 })]);
+  const { root, chamadas, ctx } = await montarEntregas([
+    item(1, 'retirado', { garcomRetirouId: 7 }),
+    item(2, 'retirado', { garcomRetirouId: 7 }),
+  ]);
   ctx.confirm = () => false;
```

**Correção 3 (regressão que falta — a issue pede explicitamente).** O PR não tem teste do caso "um único
item não mostra lote". Adicione (eu validei este teste, passa):

```js
test('ação em lote não é oferecida quando só existe um item elegível', async () => {
  const { root } = await montarEntregas([item(1, 'retirado', { garcomRetirouId: 7 })]);
  assert.equal(
    root.botoes().filter((b) => /Confirmar entrega de todos/.test(b.textContent)).length,
    0,
    'com um único item, a ação é só a individual — sem botão de lote duplicado',
  );
  assert.equal(
    root.botoes().filter((b) => /Confirmar entrega/.test(b.textContent)).length,
    1,
    'a ação individual continua disponível',
  );
});
```

**Validação que eu executei nessas correções:** `tsc --noEmit` limpo, `vite build` OK,
`npm run test:regression` **390/390**, `postgres-remocao-garcom.test.cjs` **4/4** contra PostgreSQL 18
descartável (era `not ok 1`).

**Como rodar PostgreSQL e os testes de integração aqui** (não há `psql`/`pg_dump` no sandbox e não há
Docker; o projeto traz `embedded-postgres` nas devDependencies):

```bash
# 1) suba o banco (porta livre; mantenha em processo de background)
cat > /tmp/startpg.cjs <<'EOF'
const mod = require('embedded-postgres');
const EmbeddedPostgres = mod.default || mod;
const pg = new EmbeddedPostgres({ databaseDir: '/tmp/pgdata', user: 'postgres', password: 'postgres', port: 55432, persistent: true });
pg.start().then(() => console.log('PG_STARTED')).catch((e) => { console.error('PG_FAIL', e.message); process.exit(1); });
EOF
node /tmp/startpg.cjs     # deixe rodando

# 2) crie o banco de teste e migre
node -e "const {Client}=require('pg');(async()=>{const c=new Client('postgres://postgres:postgres@127.0.0.1:55432/postgres');await c.connect();await c.query('CREATE DATABASE qradmin_test').catch(()=>{});await c.end();})()"
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55432/qradmin_test" npm run db:migrate

# 3) as suítes de integração exigem esse nome de banco (qradmin_test) por trava de segurança
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55432/qradmin_test" NODE_ENV=test \
  node --test tests/postgres-remocao-garcom.test.cjs
```

**Chromium/Playwright não funciona neste sandbox** (`libnspr4`/`libnss3` ausentes): os E2E de
`tests/e2e/**` só rodam no CI. Não tente contornar; declare a limitação.

#### 1.c PR #174 — JÁ MERGEADO (não reabra)

`main` está em `0f832c6` ("fix(ui): keep dialogs centered in the viewport (#174)"). O PR entregou portal
em `document.body`, centralização na viewport, `max-h-[calc(100dvh-24px)]`, `overscroll-contain`,
bloqueio/restauração de `document.body.style.overflow` e fechamento por `Escape`, com teste em
`tests/design-system.test.cjs`.

**O que ainda falta do modal (tarefa sua, no Bloco 2):**
- `focus trap` de verdade: foco inicial no diálogo, ciclo `Tab`/`Shift+Tab` contido, retorno do foco ao
  elemento que abriu (hoje o teste do #174 é **estrutural**, regex sobre o fonte, não comportamental);
- E2E de viewport (320, 375, 768, 1280; página rolada; lista longa; tema claro/escuro);
- `aria-modal`/`aria-labelledby` conferidos no diálogo e nos dois níveis (Modal e confirmações).

#### 1.d Fechar os PRs empilhados (#177 sobre #172, #178 sobre #176) — faça isto primeiro

Os PRs #177 e #178 existem porque nenhum agente deve empurrar commits na branch de outro. A ordem
importa, porque as bases são encadeadas:

```bash
# 1) #172 precisa ficar verde com o #177 aplicado. Como o #177 tem base na branch do #172,
#    o verde do #177 é o verde do conjunto: confira os 3 checks do #177.
gh pr checks 177
# 2) com autorização do responsável: mergear #172 (squash) e depois #177 (squash), ou
#    mergear #177 e, se o GitHub não fechar o #172 sozinho, fechá-lo apontando o merge.
gh pr merge 172 --squash
gh pr merge 177 --squash
# 3) mesmo fluxo para #176 -> #178 (o #178 já está 3/3 verde)
gh pr merge 176 --squash
gh pr merge 178 --squash
```

Depois de cada merge: `git fetch origin && git rebase origin/main` na sua branch e rode
`npm run test:regression` antes de abrir o PR seguinte. Se o GitHub recusar o squash do PR de base
porque a branch já foi mergeada, não force nada: feche o PR com comentário indicando o commit que o
substituiu.

### Bloco 2 — Completar os requisitos funcionais das issues

Ordem sugerida: 2.a modal (#173, menor e destrava acessibilidade) → 2.b card acionável (#173) →
2.c relatório de garçons (#175, o maior) → 2.d estado vazio da busca (#171).

Só comece o Bloco 2 depois de o Bloco 1 estar verde (os PRs viram a base).

#### 2.a Modal — focus trap (#173, parte que sobrou do #174)

Implemente em `src/components/ui.tsx` (sua frente):
- ao abrir: salvar `document.activeElement`, focar o primeiro elemento focável do diálogo (ou o próprio
  container com `tabIndex={-1}`);
- ciclo de `Tab`/`Shift+Tab` contido no diálogo (`keydown` no container, sem `preventDefault` global);
- ao fechar: devolver o foco ao elemento salvo, inclusive quando o fechamento vem de `Escape` ou clique
  no backdrop;
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` apontando para o título real;
- teste comportamental (montar o componente, não regex sobre o fonte) cobrindo os três pontos.

#### 2.b Card operacional acionável (#173, resto)

**Issue #173 — parte "cards operacionais de mesas"**: em `src/screens/admin/PanoramaMesas.tsx` linhas
348 e 362 ainda existem os botões `Abrir <CaretRight />`. O critério da issue é card inteiro acionável
(clique/toque/teclado) **sem** botão separado e ação secundária que não propague o clique. Só o
`MapaQrMesas` foi ajustado pelo #172.

#### 2.c Relatório de garçons (#175)

**Issue #175 — relatório de garçons**: o PR entrega métricas diárias; a issue pede ainda:
- **período**, não apenas um dia (o componente `Relatorio()` em `src/screens/Admin.tsx` já tem
  `from`/`to`, reaproveite o padrão);
- **desconto** e **taxa de serviço** por garçom (existem em `mesa_sessoes`);
- **ranking** e detalhe por garçom;
- resolver a **sobreposição semântica**: "mesas assumidas" (`garcom_novo_id = g.id` em
  `mesa_atendimento_historico`) conta também as transferências recebidas, que aparecem de novo em
  "transferências recebidas". Rotule ou exclua explicitamente, senão o número engana;
- arraste **por toque real** (HTML5 DnD é irregular em iOS): usar Pointer Events com
  `setPointerCapture` ou handle dedicado; a issue pede mouse **e** toque **e** teclado.

#### 2.d Estado vazio da busca (#171)

**Issue #171 — correção de UX no mapa**: revisar o estado vazio de busca. Hoje, com números inexistentes,
uma linha "Não encontrada(s): …" só aparece se `mesasFiltradas.length > 0`; com busca 100% inexistente
o usuário vê apenas "Nenhuma mesa encontrada". A issue pede feedback claro de números inexistentes.

### Bloco 3 — Aplicar a identidade azul/violeta nas telas (**desbloqueado**)

A Frente A publicou a camada de tokens em `327307b` (branch
`arena/8a903abe-lanchonete-qr-semi-final`, PR aberto para `main`). Não espere mais nada.

**Se o PR da Frente A ainda não estiver em `main` quando você começar:** faça `git cherry-pick` **não**;
em vez disso rebase sua branch sobre a branch da Frente A **apenas se o responsável mandar**. O normal
é esperar o merge dele e então rebasear sobre `main`.

**O que existe hoje para você consumir:**

| Necessidade | Use |
|---|---|
| Fundo de tela escura (dashboard/cozinha/bar) | `.stage-surface` — 3 paradas de fundo + 2 halos + grade mascarada |
| Cartão de vidro sobre o palco | `.stage-card` — vidro + hairline + `--elev-3`, hover `--elev-4` |
| Hierarquia de texto no palco | `--stage-ink` → `--stage-ink-2` → `--stage-ink-muted` → `--stage-ink-subtle` → `--stage-ink-faint` |
| Acento por estado de fila | `--stage-cyan` (em produção), `--stage-amber` (na fila), `--stage-lime` (pronto), `--stage-rose`/`--stage-danger-ink` (atraso) |
| Superfície/ação no tema claro/escuro | `--surface`, `--surface-raised`, `--brand`, `--brand-ink`, `--accent`, `--line` |
| Movimento | `--dur-quick`/`--dur-base` + `--ease-out` (não repita a media query: `prefers-reduced-motion` já zera as durações) |
| Espaçamento e elevação | `--space-1..9`, `--elev-1..4` |
| Foco, item pressionado, desabilitado | **já centralizados** no arquivo de tokens (`--focus-ring`, `[aria-pressed="true"]`, `:disabled`) — não redefina por tela |

**Arquivos das suas telas:** `src/screens/Admin.tsx`, `src/screens/{Dashboard,Login,Landing,Cozinha,Bar,Caixa,Garcom}.tsx`,
`src/components/{ui,OpsShell,FilaProducao}.tsx`, `src/screens/admin/*.tsx` e
`public/garcom-pwa/{styles.css,index.html}`.

Regras:
- **Não** edite `design-tokens.css`, `src/index.css`, `dashboard.css`, `operacional.css`, `src/lib/tema.ts`
  nem `docs/DESIGN_SYSTEM.md` — são da Frente A. Se faltar um token, **peça** (seletor + papel visual
  desejado), não invente.
- **Não** toque em `#/mesa/:token` (cardápio do cliente): é a exceção declarada da identidade.
- **Zero hex hardcoded; zero `!important` novo.** Se um valor novo parecer necessário, é sinal de que
  falta um token — peça.
- Telas que já usam `background`/`box-shadow` escritos à mão devem migrar para `.stage-surface` /
  `.stage-card` / `--elev-*`, não ganhar mais uma camada em cima.
- Contraste: não introduza par novo sem medir. Os tokens atuais estão validados (26 pares, AA/AAA).

## 2. Regras que valem para você

- Trabalhe **só na sua branch** (`arena/*` própria). Nunca `push --force`, `reset --hard`, cherry-pick
  entre frentes ou merge sem autorização.
- Commits pequenos, **Conventional Commits em inglês** (ex.: `fix(admin): repair table map render`).
- Antes de editar, `git fetch origin` e confira se o arquivo mudou; se um arquivo da Frente A aparecer
  no seu caminho, **pare e avise**.
- **Não** edite `server.js`, `db/migrations/**`, `.github/workflows/**`, `package.json`,
  `package-lock.json`, `security/**` sem pedir.
- **Não** faça deploy, não rode migration em produção, não altere credenciais reais, não leia nem
  imprima `.env`/`DATABASE_URL`/tokens. Nenhum segredo em commit, log ou comentário de PR.
- Justifique qualquer novo evento/coluna em banco com escopo e impacto antes de implementar.
- Não feche issue sem evidência e sem avisar o responsável; o padrão é deixar o PR com `Closes #n` e
  pedir a revisão.
- **Transparência obrigatória:** só afirme que um teste passou se você o executou; diga sempre o que não
  pôde verificar (E2E aqui não roda) e diferencie falha sua de falha pré-existente.

## 3. Definição de pronto da Frente B

1. PR #172 verde e mergeável: `tsc`, `build`, `test:regression`, `smoke:panorama` — sem regressão de #171.
2. PR #176 verde e mergeável: `tsc`, `build`, `test:regression`, `postgres-remocao-garcom`,
   `postgres-password-change` — e o endpoint de métricas respondendo para qualquer data.
3. Modal (#173) com focus trap, foco inicial e retorno de foco, além do portal já mergeado no #174.
4. Cards operacionais do panorama sem botão "Abrir" e acionáveis por clique/toque/teclado.
5. Relatório de garçons com período, descontos/taxa, ranking e sem métrica duplicada.
6. Identidade azul/violeta aplicada em **todas** as suas telas e no PWA (exceto o cardápio do cliente),
   sem hex hardcoded.
7. Nenhum arquivo da Frente A alterado; nenhum merge/deploy sem autorização.
8. `postgres-integration` verde nos PRs #177/#178 antes de mergear (é o check que costuma ficar por
   último; `gh pr checks <n>` mostra o estado real).

## 4. Como reportar

Ao terminar (ou a cada bloco), reporte ao responsável:

- arquivos alterados por bloco;
- branch e commits (hash + mensagem);
- comandos executados e **saída real** (quantidade de testes passando/falhando);
- o que ficou de fora e por quê;
- o que precisa de decisão dele;
- confirmação explícita de que não tocou nos arquivos da Frente A.

Comece pelo Bloco 1. Se algo neste briefing contrariar o código atual, **verifique o código** e me
conte a divergência antes de implementar.
