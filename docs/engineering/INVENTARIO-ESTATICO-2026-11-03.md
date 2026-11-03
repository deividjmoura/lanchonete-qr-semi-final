# Inventário estático do codebase — linha de base 2026-11-03

Complementa `PLANO-SANEAMENTO-CODEBASE.md` (Fases 0 e 1), que ainda **não está na
`main`**: vive na PR #198, que é só documental. Este documento registra
**evidência reproduzível**, não intenção. Nenhuma linha de código de produção foi
alterada para produzi-lo.

## 1. Linha de base

| Item | Valor |
|---|---|
| `main` auditada | `88fa7be5882894c6bea2b7863feca44340aabab6` |
| Base original da PR #198 | `150be51` sobre `7f18dca` |
| Branch de execução | `arena/8e3909f1-lanchonete-qr-semi-final`, fast-forward para `88fa7be` |
| Commits desta etapa | `8ae7228` (README), `126b30d` (teste hermético), `5b4a96e` (este documento), `4ed03cb`/`0ffee4c` (evidência de `dist/` e repro) |
| PR de execução | **#202** (rascunho), base `main`; a #198 permanece só com os dois documentos do plano |
| Node | v22.22.3 |
| npm | 10.9.8 |
| Node exigido pelo projeto | `>=20.9.0` (`package.json` → `engines`) |
| Node no CI | 20 (`actions/setup-node`) |
| PostgreSQL da linha de base | 18.4 (embedded-postgres), migrations `0033` |
| Arquivos analisados | 298 (`git ls-files` de `.js/.cjs/.ts/.tsx/.css/.html`) |

### Resultado dos testes (Fase 0)

| Comando | Resultado |
|---|---|
| `npm ci` | OK — lockfile não foi alterado |
| `npm run typecheck` | limpo |
| `npm run build` | OK |
| `npm run smoke:panorama` / `smoke:fila` | OK |
| `npm test` (`test:regression`) | **474/475** na `main` pura (1 falha preexistente, §1.1) → **475/475** após a correção desta PR |
| `npm run test:pg -- --sem-backup` (base recriada) | **15/16** suítes na `main` pura (§1.2) → **16/16** após a correção desta PR |
| `node --check` em `server.js`/`db`/`scripts` | OK |

### 1.1 Falha preexistente — `tests/guia-sistema.test.cjs`

```
not ok 184 - README explica linguagens, tecnologias e aponta para o guia
  error: 'README deve documentar TypeScript'
```

Causa: o commit `1710456` (*docs(readme): revisar apresentação, links e roadmap*)
removeu a menção literal a **TypeScript** do `README.md`, que o teste exige
(`README.md` não contém a palavra — verificado com `grep -ci typescript README.md` = 0).
Reproduz no `main` limpo (`git archive origin/main`), sem qualquer arquivo desta PR.

Classificação: **regressão de documentação**.

**Situação: corrigido nesta PR**, em commit isolado (`docs(readme): restaurar seção de
linguagens e tecnologias`). A seção "Linguagens e tecnologias" foi reintroduzida
descrevendo a stack real (TypeScript/React/TSX com Vite, Node.js na API, PostgreSQL com
SQL em migrations, PWA com service worker) e apontando para `docs/engineering/` e para o
guia visual. Só documentação — nenhum comportamento, dependência ou configuração mudou.
`node --test tests/guia-sistema.test.cjs` → 3/3; `npm test` → **475/475**.

### 1.2 Falha preexistente — `tests/postgres-pracas-remocao.test.cjs`

```
error: 'Mesa não encontrada'  (db/admin.js:217 definirPracaMesa)
```

Causa: o teste usa as mesas **1 e 2** (linha 26: `const numeros = [1, 2]`), que só
existem depois de `npm run db:seed`. O banco do CI aplica **apenas migrations**, e
este arquivo **não está em nenhum workflow** (`grep -rn pracas-remocao .github/`
= nenhum resultado). Não é regressão: o teste nunca teve o pré-requisito que assume.

Classificação: **teste não hermético** (depende de seed externo e não é executado no
CI).

**Situação: corrigido nesta PR**, em commit isolado (`test(pracas): torna a suíte
hermética em banco só com migrations`). O teste passa a criar as mesas 1 e 2 com
`ON CONFLICT DO NOTHING` e remove no `finally` **somente** as que ele mesmo criou.
Nenhuma asserção foi alterada, enfraquecida ou removida, e `db/admin.js` não foi tocado.

Evidência em banco recriado (33 migrations, **sem** `npm run db:seed`):

```
node --test tests/postgres-pracas-remocao.test.cjs   -> 1/1 pass
npm run test:pg -- --sem-backup                      -> 16/16 suítes
```

E com o seed aplicado, a suíte passa de novo e as mesas 1 e 2 continuam no banco após a
limpeza (verificado por consulta direta).

## 2. Método do inventário

Ferramentas executadas **fora do projeto**, sem alterar `package.json`/lockfile:

```bash
mkdir .tools-audit && cd .tools-audit   # ignorado via .git/info/exclude
npm install knip@5 jscpd@5 madge@8      # não são dependências do projeto

# Knip (knip 6 falhou neste sandbox: oxc-parser exige buffer grande — ver §6)
../node_modules/.bin/knip --config .tools-audit/knip.json --no-progress

# jscpd
jscpd --min-lines 12 --min-tokens 90 \
  --format "javascript,typescript,jsx,tsx,css,markup" \
  --ignore "**/node_modules/**,**/dist/**,**/.tools-audit/**" \
  --reporters json --output /tmp/inv/jscpd .

# Madge
madge --extensions js,cjs,mjs,ts,tsx --ts-config tsconfig.json --circular \
  src db server security scripts
```

Configuração do Knip usada (`entry` explícito, porque o projeto tem entradas que não
são imports): `server.js`, `scripts/*.js`, `db/migrate.js`, `db/seed.js`, `index.html`,
`public/garcom-pwa/app.js|sw.js`, `public/js/*.js`.

### Ferramentas avaliadas e decisão

| Ferramenta | Versão testada | Decisão |
|---|---|---|
| Madge | 8.0.0 | **Útil e baixo custo.** Rodou limpo; achado único (§3). |
| jscpd | 5.4.2 | **Útil, com ressalvas de ruído** (§4). |
| Knip | 5.88.1 | **Útil, mas com falsos positivos estruturais** (§5). Não adotar no CI ainda. |
| Knip | 6.44.1 | **Incompatível neste ambiente**: `RangeError: Array buffer allocation failed` no `oxc-parser`. Não é bloqueio do projeto, é do sandbox. |
| ESLint | — | **Não há configuração** no repositório (`ls -a | grep -i eslint` = vazio). Adotar exigiria definir regras — decisão de time, não de saneamento. |

Nenhuma ferramenta foi adicionada ao `package.json`.

## 3. Grafo de dependências e ciclos (Madge)

91 módulos no grafo. **1 ciclo encontrado:**

```
db/garcons.js > db/entregas.js
```

### Análise do ciclo — NÃO é defeito

- `db/entregas.js:2` → `require('./garcons')` **no topo** (usa `getGarcomPorToken` e `ErroGarcom`).
- `db/garcons.js:291-294` → `require('./entregas')` **dentro de arrow functions**
  (`assumirEntregaComoGarcom`, `retirarComoGarcom`, `entregarComoGarcom`, `historicoPedidoGarcom`).

O `require` preguiçoso foi deliberado para permitir a carga em qualquer ordem.
Verificado nos dois sentidos, em processos separados:

```
ordem A (garcons primeiro): carrega, re-export definido, entregas carrega depois → OK
ordem B (entregas primeiro): carrega, garcons depois → OK
```

Os quatro re-exports são **consumidos em produção** (`server.js:98-101` importa de
`garcons` e chama em `server.js:479,492,498,509/515`) e por **10 arquivos de teste**
(`postgres-waiter-integration`, `postgres-remocao-garcom`, `postgres-entregas-progressivas`,
`garcom-operacao-integrada`, `garcom-responsavel-mesa`, `garcom-situacoes`, `pwa-garcom-operacao`,
`postgres-financial-concurrency`, `postgres-integration`, `regressions.cjs`).

**Veredito:** ponto de extensão vivo, não código morto. Se algum dia for removido,
quebram `server.js` e 10 suítes. **Não tocar.** A refatoração correta (inverter a
dependência para `entregas` importar `garcons` sem o caminho inverso) fica para uma
PR própria com os testes de garçom como rede de proteção.

### Acoplamento (fan-in / fan-out)

| Módulo | Fan-in | Leitura |
|---|---|---|
| `db/pool.js` | 21 | Ponto único de conexão — esperado e saudável |
| `src/lib/api.ts` | 16 | Cliente HTTP único — esperado |
| `src/store/usePub.ts` | 16 | Store global — **fonte de acoplamento** (§7 F5) |
| `src/components/ui.tsx` | 14 | Primitivas de UI — esperado |
| `db/auditoria.js` | 9 | Transversal — esperado |

| Módulo | Fan-out | Observação |
|---|---|---|
| `src/screens/Admin.tsx` | 19 | Tela monolítica |
| `src/App.tsx` | 12 | Roteador |

`server.js` tem **1593 linhas** e concentra roteamento + gates de autorização — já
registrado na Fase 4 do plano; o inventário confirma o tamanho, não propõe corte nesta etapa.

## 4. Duplicação (jscpd)

Recorte: `--min-lines 12 --min-tokens 90`, excluindo `node_modules`, `dist` e `.tools-audit`.

| Métrica | Valor |
|---|---|
| Arquivos analisados | 247 |
| Clones | 40 |
| Linhas duplicadas | 1.327 de 64.190 (**2,07%**) |
| Tokens duplicados | 14.515 de 565.082 (2,57%) |

Por formato: `markup` 500 linhas (16,45% do formato), `javascript` 569 (1,47%),
`css` 258 (3,22%), `tsx`/`typescript` **0**.

### Agrupamento por domínio (não por similaridade textual)

| Grupo | Clones | Linhas | Risco |
|---|---|---|---|
| A. `public/bar.html` ↔ `public/cozinha.html` | 11 | 500 | **Médio** — páginas legadas |
| B. `scripts/*` operacionais | 10 | 279 | **Baixo** |
| C. `tests/e2e/*` (boilerplate de browser) | 9 | 243 | **Baixo** |
| D. CSS em `public/*.css` | 5 | 146 | **Médio** |
| E. runtime `src/` (React) | 2 | 112 | **Alto** — não tocar agora |
| F. runtime `db/` | 2 | 33 | **Alto** — não tocar agora |

Maiores blocos: `bar.html:36 ↔ cozinha.html:36` (174 linhas),
`bar.html:209 ↔ cozinha.html:209` (98), `scripts/fix-fotos-cardapio.js ↔ sync-fotos-seed.js` (68),
`design-tokens.css:352 ↔ :418` (62, duplicação interna), `mesa-praia.css:82 ↔ :145` (61, interna).

### O achado que domina a duplicação — `dist/` versionado

Fora do recorte do jscpd (que exclui `dist`), mas medido diretamente:

| Métrica | Valor |
|---|---|
| Arquivos versionados em `dist/` | 159 |
| Idênticos a `public/` | **150** |
| Linhas duplicadas por isso | **~37.152** |

Comparação: 37.152 linhas de `dist/` contra 1.327 linhas de duplicação em código-fonte —
**28× maior**. Todas as 7 páginas legadas (`admin`, `bar`, `caixa`, `cozinha`, `garcom`,
`mesa`, `pedido`) existem duas vezes, byte a byte (`diff -q` = idêntico).

**O `dist/` versionado é de uma versão anterior do código — agora confirmado.**

Primeiro descartei a hipótese de toolchain, que era a suspeita original:

| Teste | Resultado |
|---|---|
| Build 2× sob Node 22.22.3 | hashes **idênticos** entre si (`index-BFLpq2r1.js`) → build é determinístico, não é ruído |
| Build sob **Node 20.19.0** (mesmo major do CI) | **mesmo hash** `index-BFLpq2r1.js` → **toolchain não é a causa** |
| `package.json` / `package-lock.json` desde `7f18dca` | **nenhuma mudança** → dependências não são a causa |
| Chunks de vendor (`motion`, `react`, fontes, imagens) | **byte a byte idênticos** → não é ruído de bundler |

Restava uma explicação: o bundle commitado veio de **outro estado do código**. Confirmei
por conteúdo, não por hash:

| Evidência | Valor |
|---|---|
| Strings de `src/` presentes no build novo e **ausentes** do `dist/` commitado | **20** |
| Dessas, quantas pertencem a um único componente | **17 de `src/screens/dashboard/MesasAbertasModal.tsx`** |
| Ocorrências de `MesasAbertasModal` (e das suas strings) em **todo** o `dist/` | **0** |
| O componente é renderizado em produção? | **Sim** — `src/screens/Dashboard.tsx:712`, importado em `:8`, aberto pelo card "Mesas ocupadas" (`:670`) |

Ou seja: o `dist/` versionado **não contém a modal "Mesas ocupadas"**, uma tela que o
código-fonte renderiza. Não é "bundle defasado por alguns KB" — é uma **feature inteira
ausente** do artefato que o servidor entrega (`dist/index.html` carrega
`/assets/index-DqNdm0iB.js`).

**Causa provável (não provada):** `7f18dca` é o **commit raiz** do repositório — um único
commit de 588 arquivos (`git rev-list --max-parents=0` → só ele; 10 commits no total). O
histórico efetivamente começa em 2026-11-02, então **não existe commit anterior** a que se
possa atribuir o bundle. Um import desse tipo costuma trazer `dist/` de um checkout
anterior, junto com o `src/` novo. Ver §7 F2.

**Consequência prática:** toda alteração de UI feita depois do build que gerou esse
`dist/` **não chega à produção** enquanto o deploy não construir de novo. A modal de
mesas abertas é um exemplo confirmado, não o único provável. É por isso que o achado sobe
de "inconclusivo" para **alta prioridade com impacto em produção**.

## 5. Código morto e exports (Knip)

Saída bruta: 3 arquivos "não usados", 5 devDependencies "não usadas", 73 exports
"não usados", 13 tipos "não usados", 1 export duplicado.

**Nenhum item foi removido.** Triagem completa abaixo.

### 5.1 Arquivos "não usados" → 3/3 falsos positivos

| Arquivo | Por que parece morto | Por que está vivo |
|---|---|---|
| `public/garcom-pwa/confirmacao.js` | não é importado por módulo | `<script src>` em `public/admin.html`, `public/caixa.html`, `public/garcom-pwa/index.html`; precache no `sw.js` |
| `public/garcom-pwa/qrcode-generator.js` | idem | idem |
| `public/garcom-pwa/theme-init.js` | idem | `<script src>` em `index.html` (raiz), `public/garcom-pwa/index.html`; precache no `sw.js` |

**Regra derivada:** Knip não enxerga `public/**` como entrada servida estaticamente.
Enquanto isso não for configurado, qualquer "arquivo não usado" em `public/` é
inconclusivo por padrão.

### 5.2 Dependências "não usadas" → 5/5 falsos positivos, 0 reais

| Dependência | Uso real |
|---|---|
| `@sparticuz/chromium` | `tests/e2e/*.e2e.cjs` (**12 arquivos**) e `scripts/run-e2e-tests.js` |
| `playwright-core` | `tests/e2e/*.e2e.cjs` |
| `fake-indexeddb` | `tests/pwa-offline-sync.test.cjs:20` |
| `embedded-postgres` | uso local documentado; **ausência de `require` direto** é o motivo do falso positivo (usado via receita manual) |
| `tailwindcss` | `src/index.css:1` (`@import "tailwindcss" source(none)`) e é dependência de `@tailwindcss/vite` |

**Produção: 11 dependências declaradas, 0 sem uso.** Nenhuma remoção de dependência
é segura ou necessária nesta etapa.

### 5.3 Exports "não usados" → 4 de 73 são realmente mortos

Triagem em três passadas, cada uma verificando o que a anterior não vê:

1. **Referência em outro arquivo** (testes, scripts, HTML, CI): **39 são usados**
   (ex.: `db/auth.js` exporta `PAPEIS`, `verificarSenha`, `exigirSessao`… usados por
   `server.js` e por testes).
2. **Artefato de CommonJS**: **7 entradas `default`** (`db/atendimento.js:603` etc.) não
   são exports reais — são o `module.exports={...}` interpretado como `default`. Ignoradas.
3. **Uso interno no próprio módulo** (export existe, mas só o módulo se serve dele):
   **23 de 27** casos. É **super-exportação**, não código morto.

Resultado: **4 exports sem qualquer consumo** em todo o repositório:

| Export | Arquivo | Evidência |
|---|---|---|
| `estaAutenticado(req)` | `db/auth.js:299` | Zero chamadas. `server.js` usa `getStaffDaRequisicao`/`exigirSessao` diretamente. Função de 3 linhas que só embrulha `getStaffDaRequisicao`. |
| `contarStaff()` | `db/auth.js:158` | Usada **dentro** do módulo (`garantirStaffSeed`, linha 165) e re-exportada sem consumidor externo. |
| `faturamentoSemana()` | `src/store/usePub.ts:1144` | Zero referências no repo. Ver §5.4. |
| `ErroPaginacao` (classe) | `db/paginacao.js:6` | Usada internamente (8 lançamentos); nenhum `instanceof`/`catch` externo. Export desnecessário, classe viva. |

Prioridade: **baixa**. O custo/benefício de remover 4 símbolos não justifica uma PR
isolada neste momento; o valor está em registrar que **73 → 4** não é "73 mortos".

### 5.4 `faturamentoSemana` — o único candidato realmente suspeito

Implementação em `src/store/usePub.ts:1144`:

```ts
export function faturamentoSemana(sessoes: Sessao[]) {
  const base = [0,0,0,0,0,0,0];
  const hoje = sessoes.filter(s=>s.status==="fechada")...;
  const abertas = ...;
  const dias = ["Seg","Ter","Qua","Qui","Sex","Sáb","Hoje"];
  return base.map((v,i)=>({dia:dias[i], valor: i===6 ? hoje+abertas : v}));
}
```

Retorna **zeros** de segunda a sábado: não há agregação por dia, só o total em "Hoje".
Zero referências. Se estivesse em uso, seria bug de produto; como não está, é
**código morto com sintoma de incompletude**. Classificação: **provável**.
Recomendação: PR própria, somente com confirmação do responsável de que o gráfico
semanal não é roadmap.

## 6. Limitações ambientais registradas

- **Knip 6.44.1 não roda** neste sandbox (`oxc-parser` → `RangeError: Array buffer
  allocation failed`). Cai para Knip 5.88.1, que usa TypeScript. Não é limitação do projeto.
- **PostgreSQL**: sem Docker/`psql`/`pg_dump`; uso de `embedded-postgres` (18.4). O drill
  de backup/restore rodou com `--sem-backup` e roda no CI com `pg_dump` 16.
- **E2E em Chromium**: não executado nesta etapa (não é o alvo do inventário); coberto no CI.
- **Node 22 local vs Node 20 no CI**: **deixou de ser limitação** para F2. Rodei o build
  sob Node **20.19.0** (via pacote npm `node@20.19.0`, já que `nodejs.org` não é acessível
  neste sandbox) e o hash saiu **idêntico** ao do Node 22 — o toolchain não explica a
  divergência do `dist/`. Continua valendo como limitação para os demais números de
  performance, se algum dia forem medidos.

## 7. Achados priorizados

| # | Achado | Evidência | Impacto | Prioridade | Ação |
|---|---|---|---|---|---|
| **F1** | `dist/` versionado duplica ~37 mil linhas e toda página legada existe 2× | 150 de 159 arquivos idênticos a `public/` | Drift entre bundle e fonte; PRs de UI não refletem em produção | **Alta** | Precisa de decisão humana sobre o contrato de deploy (§8) |
| **F2** | `dist/` commitado é de **outro estado do código**: falta a modal `MesasAbertasModal` | 17 strings do componente com **0 ocorrências** no artefato; `dist/index.html` carrega esse bundle | **Feature ausente em produção** | **Alta** | Defeito confirmado (não é toolchain); correção é operacional, depende de F1/§8 |
| **F3** | `README.md` sem "TypeScript" quebra `guia-sistema.test.cjs` | `npm test` = 474/475 | CI vermelho na suíte `verify` | **Alta** | ✅ **Corrigido nesta PR** (commit `docs(readme)`) |
| **F4** | `postgres-pracas-remocao` depende de seed e não roda no CI | mesas 1–2; ausente dos workflows | Suíte verde esconde teste nunca executado | Média | ✅ **Corrigido nesta PR** (commit `test(pracas)`) |
| **F5** | `src/store/usePub.ts` (1150 linhas) é o 2º maior acoplamento | fan-in 16 | Risco de refatoração, sem ação segura agora | Média | Documentar; não cortar |
| **F6** | 23 exports são super-exportação; 4 são mortos | triagem §5.3 | Ruído de API interna | Baixa | Opcional, 1 PR pequena |
| **F7** | Ciclo `garcons ⇄ entregas` | Madge | **Nenhum** — deliberado e testado | Baixa | Não tocar |
| **F8** | 5 devDependencies "não usadas" | Knip | **Nenhum** — falsos positivos | — | Não remover |

## 8. O que depende de outra frente

- **F1/F2 (`dist/`)** dependem da definição do contrato de build/deploy do Railway.
  F1 é decisão de arquitetura. **F2 já não é pergunta**: é defeito confirmado — o
  artefato servido não tem a modal `MesasAbertasModal`. A correção *também* é
  operacional (rebuild? build no deploy? Parar de versionar?), então fica aqui e
  **não** foi feita nesta etapa: substituir o `dist/` por um build novo é uma mudança
  de produção, e o resultado do build depende de qual Node o contrato fixar.
  Evidência levantada: **não existe** `railway.json`, `nixpacks.toml`, `Procfile` nem
  `Dockerfile` no repositório, e `scripts/start-production.js` **não** executa build —
  ele só roda migrations antes de carregar o `server.js`. O `package.json` tem `build`
  separado de `start`, e o `vite.config.ts` não fixa `outDir` (o padrão é `dist`).
  Ou seja: o `dist/` **versionado é, na prática, o que o servidor serve** quando o
  processo sobe sem etapa de build.

  **Risco medido, não hipotético.** Rodei o `server.js` real numa cópia da árvore
  (`server.js db security server public package.json` + `node_modules` linkado) com
  `dist/` **ausente**, na mesma `DATABASE_URL` de teste:

  | Rota | Com `dist/` | **Sem `dist/`** | O que acontece |
  | --- | --- | --- | --- |
  | `/` | 200 (SPA) | **302 → `/login`** | cai no fallback legado |
  | `/admin` | 302 → `/login?next=%2Fadmin` | 302 → `/login?next=%2Fadmin` | igual, sem diferença |
  | `/login` | 200 (SPA) | **200, mas HTML legado** | sem `src="/assets/index-*.js"` |
  | `/cardapio` | 200 (SPA) | **404** | rota da SPA sem correspondência |
  | `/pedido/1` | 200 (SPA) | 200 (HTML legado) | não é a mesma aplicação |
  | `/cozinha.html`, `/garcom.html`, `/admin.html` | 200 | 200 (legado) | |
  | `/assets/index-DqNdm0iB.js` | 200 | **404** | |

  Ou seja: o modo de falha **não** é 502/404 generalizado — é pior de diagnosticar.
  O servidor sobe, responde 2xx e serve silenciosamente as **páginas legadas de
  `public/`**, que são outra aplicação (sem o bundle React, escrita com `src/js/*.js`).
  Um deploy assim "passa" em smoke test de status code e quebra nas telas que só
  existem na SPA (`/cardapio` responde 404). Por isso **não** removi nem atualizei
  `dist/` nesta etapa, e por isso a decisão (versionar de propósito × construir no
  deploy × publicar artefato) é operacional e pertence à frente da
  **PR #197** (single-instance/validação de topologia real), não ao saneamento.
  **Não executar antes da revisão humana.**
- **Páginas legadas de `public/*.html`** (grupo A, 500 linhas duplicadas) só são servidas
  quando `dist/` **não existe** (`server.js:1361,1433,1451`) e já são redirecionadas para
  a SPA quando ele existe (`server.js:1406-1419`). Removê-las é uma decisão de produto
  acoplada a F1.
- **Achados de segurança** (REV-001 já resolvido no #196; AUD-001/REV-003 em #197;
  AUD-002/REV-002 e AUD-003 em #199) permanecem separados, conforme a seção
  "Separação das correções de segurança" do plano. Este inventário não os toca.

## 9. Como reproduzir

```bash
# linha de base
# todo o inventário foi medido sobre 88fa7be (ponta de main quando começou)
git checkout 88fa7be && npm ci
node -v && npm -v
npm run typecheck && npm run build && npm test

# PostgreSQL (embedded-postgres, sem Docker)
# recriar base + migrations antes das suítes
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/qradmin_test \
  npm run test:pg -- --sem-backup

# inventário (ferramentas fora do projeto)
mkdir -p .tools-audit && cd .tools-audit && npm init -y >/dev/null
npm install knip@5 jscpd@5 madge@8
cd .. && ./.tools-audit/node_modules/.bin/madge --extensions js,cjs,mjs,ts,tsx \
  --ts-config tsconfig.json --circular src db server security scripts
./.tools-audit/node_modules/.bin/knip --config .tools-audit/knip.json --no-progress
./.tools-audit/node_modules/.bin/jscpd --min-lines 12 --min-tokens 90 \
  --format "javascript,typescript,jsx,tsx,css,markup" \
  --ignore "**/node_modules/**,**/dist/**,**/.tools-audit/**" \
  --reporters json --output /tmp/jscpd .

# dist/ versionado vs public/
while read -r f; do [ -f "public/${f#dist/}" ] && diff -q "$f" "public/${f#dist/}" \
  >/dev/null && echo "DUP $f"; done < <(git ls-files dist/)
```

### 9.1 Reproduzir o risco de deploy sem `dist/` (§8)

Copia a árvore necessária para fora do repo, **sem** `dist/`, e sobe o servidor real:

```bash
mkdir -p /tmp/nodist && cd /tmp/nodist
cp -r "$OLDPWD"/{server.js,db,security,server,public,package.json} .
ln -s "$OLDPWD/node_modules" node_modules
[ -d dist ] && echo "dist presente (abortar)" || echo "dist ausente, ok"

DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/qradmin_test \
  NODE_ENV=test PORT=3996 node server.js &
for p in / /admin /login /cardapio /pedido/1 /cozinha.html /garcom-pwa/ \
         /assets/index-DqNdm0iB.js; do
  printf '%-28s %s -> %s\n' "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3996$p")" \
    "$(curl -s -o /dev/null -w '%{redirect_url}' "http://127.0.0.1:3996$p")"
done
kill %1; cd - && rm -rf /tmp/nodist
```

Resultado obtido em 2026-11-03 (`Node v22.22.3`): `/` 302→`/login`, `/admin` 302→`/login`,
`/login` 200 com HTML legado, `/cardapio` **404**, `/assets/index-DqNdm0iB.js` **404**,
`/cozinha.html` e `/garcom-pwa/` 200 — ver tabela em §8.

### 9.2 Reproduzir a conclusão de F2 (dist/ não corresponde ao código)

```bash
# 1) build limpo a partir do mesmo commit, sem tocar no repo
rm -rf /tmp/f2 && mkdir -p /tmp/f2
git archive 7f18dca | tar -x -C /tmp/f2
ln -s "$PWD/node_modules" /tmp/f2/node_modules
( cd /tmp/f2 && rm -rf dist && node ../path/to/vite/bin/vite.js build )

# 2) determinismo: rode 2x — os hashes são iguais
# 3) toolchain: rode também com Node 20.19+ — o hash NÃO muda

# 4) o teste que decide: uma string que só existe na modal de mesas abertas
grep -c "Atualizar mesas abertas" /tmp/f2/dist/assets/index-*.js   # build novo -> 1
grep -c "Atualizar mesas abertas" dist/assets/index-DqNdm0iB.js   # commitado   -> 0
grep -r  "MesasAbertasModal"     dist/                            # commitado   -> nada

# 5) o componente é usado de verdade?
grep -n "MesasAbertasModal" src/screens/Dashboard.tsx            # :8 import, :712 render
```

Resultado em 2026-11-03: `2` ocorrências no build novo contra **`0`** no commitado,
nenhuma ocorrência em todo o `dist/`, e o componente renderizado em `Dashboard.tsx:712`.
