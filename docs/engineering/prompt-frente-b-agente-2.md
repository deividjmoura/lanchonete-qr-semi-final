# Frente B — PRs de UX + aplicação da identidade visual nas telas

Você é um agente de engenharia trabalhando no projeto **QR Admin**, repositório
`deividjmoura/lanchonete-qr-semi-final`. Você assume a **Frente B** de um trabalho dividido em duas
frentes entre dois agentes. Não assuma nenhuma tarefa da Frente A.

Antes de qualquer coisa, leia estes dois documentos já commitados no repositório:

- `docs/engineering/auditoria-2026-11-01-diagnostico.md` — diagnóstico completo, com evidências e
  números de linha. É a fonte da verdade do estado atual.
- `docs/engineering/coordenacao-2-agentes-2026-11-01.md` — divisão de frentes, donos e arquivos.

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

#### 1.c PR #174 — `fix/modal-viewport-layering` → issue #173 (parte modais)

**Estado: está verde e é o único mergeável.** Verifiquei `tsc`, `vite build`, `design-system` 8/8 e os
três checks do GitHub (`verify`, `postgres-migrations`, `postgres-integration` — todos `success`).

Ação: peça ao responsável a autorização de merge (não mergeie sem ela) e, se aprovado,
`gh pr merge 174 --squash` **depois** de rebase/verificação. O PR entrega portal em `document.body`,
centralização na viewport, `max-h-[calc(100dvh-24px)]`, `overscroll-contain` e bloqueio/restauração de
`document.body.style.overflow`.

**O que ainda falta no modal (complete num PR seguinte, mesma frente):**
- `focus trap` + foco inicial no diálogo + retorno de foco ao elemento que abriu;
- E2E de viewport (320, 375, 768, 1280; página rolada; lista longa; tema claro/escuro);
- o teste adicionado no #174 é **estrutural** (regex sobre o fonte), não comportamental.

### Bloco 2 — Completar os requisitos funcionais das issues

Só comece o Bloco 2 depois de o Bloco 1 estar verde (os PRs viram a base).

**Issue #173 — parte "cards operacionais de mesas"**: em `src/screens/admin/PanoramaMesas.tsx` linhas
348 e 362 ainda existem os botões `Abrir <CaretRight />`. O critério da issue é card inteiro acionável
(clique/toque/teclado) **sem** botão separado e ação secundária que não propague o clique. Só o
`MapaQrMesas` foi ajustado pelo #172.

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

**Issue #171 — correção de UX no mapa**: revisar o estado vazio de busca. Hoje, com números inexistentes,
uma linha "Não encontrada(s): …" só aparece se `mesasFiltradas.length > 0`; com busca 100% inexistente
o usuário vê apenas "Nenhuma mesa encontrada". A issue pede feedback claro de números inexistentes.

### Bloco 3 — Aplicar a identidade azul/violeta nas telas (depois da Frente A publicar os tokens)

Quando o outro agente commitar a camada de tokens em `main` (ou você receber o PR dele), **aplique** os
tokens nas suas telas: `src/screens/Admin.tsx`, `src/screens/{Dashboard,Login,Landing,Cozinha,Bar,Caixa,Garcom}.tsx`,
`src/components/{ui,OpsShell,FilaProducao}.tsx`, `src/screens/admin/*.tsx` e
`public/garcom-pwa/{styles.css,index.html}`.

Regras:
- **Não** edite `design-tokens.css`, `src/index.css`, `dashboard.css`, `operacional.css`, `src/lib/tema.ts`
  nem `docs/DESIGN_SYSTEM.md` — são da Frente A. Se faltar um token, **peça**, não invente.
- **Não** toque em `#/mesa/:token` (cardápio do cliente): é a exceção.
- Zero hex hardcoded; zero `!important` novo; use as classes utilitárias/semânticas existentes.

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
3. PR #174 mergeado (ou pronto para o responsável mergear) com o modal correto em qualquer tela.
4. Cards operacionais do panorama sem botão "Abrir" e acionáveis por clique/toque/teclado.
5. Relatório de garçons com período, descontos/taxa, ranking e sem métrica duplicada.
6. Identidade azul/violeta aplicada em **todas** as suas telas e no PWA (exceto o cardápio do cliente),
   sem hex hardcoded.
7. Nenhum arquivo da Frente A alterado; nenhum merge/deploy sem autorização.

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
