# Relatório — Backend transacional para 50–70 mesas simultâneas

**Escopo:** pedidos simultâneos sem duplicação, concorrência/estoque, sessões e
fechamento, pagamentos parciais sem cobrança duplicada, SQL/índices/desempenho,
testes de carga e regressão em ambiente isolado.

**Fora de escopo (não tocados, conferido por `git diff`):** `src/screens/Admin.tsx`,
`src/lib/api.ts`, `server.js`, `db/admin.js`, `db/migrations/0017_configuracao_mesas.sql`
— frente do PR #14. Este trabalho não altera nenhum desses arquivos e a migration
nova é a **0018** (a 0017 é do PR #14; o runner aplica por nome de arquivo, então
nenhuma ordem de merge colide).

**Nada foi executado contra produção.** Todos os testes rodaram num PostgreSQL 16
local e descartável (socket Unix, fora do repositório), semeado do zero.

---

## 1. Problemas encontrados (todos reproduzidos antes da correção)

### P0 — dinheiro errado

| # | Problema | Evidência (baseline, PG real) |
|---|----------|----------------------------------|
| A | Entrega pelo endpoint genérico de status (override admin, sem setor) marcava o pedido **entregue** mas não lançava o valor em `mesa_sessoes.valor_total` — só o fluxo do garçom somava. Cliente via `totalDevido`, caixa via outro número. | Pedido de R$ 12,00 → caixa `valorTotal=0` → **fechamento cobrou R$ 0,00** |
| D | `setStatusPedido` sem setor fazia `UPDATE` incondicional nos itens: dava para regredir item **já entregue** para `em_producao`. O garçom re-entregava e o acumulador somava a segunda vez. | Itens de R$ 6 + R$ 6 → caixa `valorTotal=18` por **R$ 12 devidos** (cobrança duplicada) |
| E | `fecharSessao` com desconto depois de a conta já estar paga fechava com `valorPago > valorCobrado`, sem estorno nem alerta. | Pago R$ 6, desconto de R$ 5 → fechou cobrado R$ 1, pago R$ 6 |

**Causa-raiz comum de A e D:** duas fontes de verdade para "quanto deve" — a tela do
cliente somava itens entregues; o caixa confiava num acumulador incremental
(`valor_total`) mantido por um único caminho de código.

### P1 — duplicação sob retry/duplo toque

| # | Problema | Evidência |
|---|----------|-----------|
| C | Nenhuma idempotência na criação de pedido: timeout no celular/duplo toque = 2 pedidos, 2 baixas de estoque. | Rajada de 8 envios idênticos → **8 pedidos** (S2 do harness) |
| S3 | Pagamento parcial repetido lançava de novo até estourar o restante. | 6 envios de R$ 15 → **R$ 30 baixados** (o teto evitou pior) |
| B | Adicional repetido no mesmo item violava a PK `(item, adicional)` e derrubava o pedido inteiro. | **HTTP 500** `duplicate key … itens_pedido_adicionais_pkey` |

### P1 — concorrência/desempenho sob pico

- **Ordem de locks inconsistente:** criação travava produtos na ordem do cliente
  (dois carrinhos com os mesmos itens em ordens opostas = deadlock A→B/B→A) e o
  caixa travava mesa+sessão via `FOR UPDATE` em JOIN (ordem = plano de execução),
  contra a criação que trava mesa→sessão. Deadlock virava HTTP 500 sem retry.
- **N×3 consultas por pedido:** produto+adicionais+removíveis buscados **por item**,
  segurando o lock da mesa e uma conexão do pool por dezenas de round-trips.
- **Fan-out SSE:** 70 conexões de mesa abertas geraram **51.520 trechos** escritos
  para 875 requisições (cada mutação = 70 writes + rajada de refetches de 70 celulares).
- **Leituras sem snapshot:** `getSessao`/listagem do caixa liam pedidos, itens e
  pagamentos em consultas separadas, podendo mostrar restante que nunca existiu.
- **Sem tetos de tempo no pool:** uma transação pendurada seguraria lock/conexão
  indefinidamente no pico.
- `registrarPagamento`/PIX usavam o teto do acumulador (ver P0); entrega parcial
  entrava no total do caixa sem aparecer nos itens (itens × total não fechavam);
  restaurar estoque reabilitava produto pausado manualmente pelo admin.

### O que já estava certo (preservado)

Unique parcial de 1 sessão aberta/mesa + `FOR UPDATE` na mesa (ADR-005); baixa de
estoque atômica `UPDATE … WHERE estoque >= qtd` (a corrida de estoque já passava:
5/12 e 10/30 exatos); fechamento duplo sem chave já serializava (1×200 + 1×409);
entrega do garçom com trava de pedido e filtro por `concluido`; confirmação PIX
com trava de sessão+aviso (não duplicava — ganhou vínculo no banco mesmo assim).

---

## 2. Correções realizadas

### Conta com fonte única — `db/conta.js` (novo) + `db/pedidos.js`, `db/caixa.js`, `db/garcons.js`, `db/pix-cliente.js`
- O total devido passa a ser **recomputado dos itens `entregue`** dentro da própria
  transação (criação da conta no caixa, pagamento, fechamento, confirmação PIX,
  aviso PIX, entrega do garçom, entrega admin) e `valor_total` vira espelho
  sincronizado — drift histórico se cura na próxima operação em vez de ir ao caixa.
- `setStatusPedido`: **só avanço**, item a item a partir de estados de origem
  válidos; alvo `recebido` com item avançado = **409**; item `entregue` nunca se
  move; entrega admin sincroniza a conta no mesmo commit (corrige A e D).
- `fecharSessao` recusa (409 explicativo) fechar com parciais acima do cobrado (corrige E).
- Listagem do caixa inclui itens de entrega parcial e usa a mesma definição de devido.

### Idempotência — migration `0018` + backend (sem mudar rotas nem cliente)
- `criarPedido`, `registrarPagamento` e `fecharSessao` aceitam **`idempotencyKey`**
  opcional no corpo JSON (`idempotency_key`/`clientRequestId` também). Replay
  devolve pedido/lançamento/resultado original; índices únicos parciais por sessão
  garantem no banco. `sessao_pagamentos.pix_aviso_id` **único**: confirmar o mesmo
  aviso PIX nunca gera 2 lançamentos; o clique duplo devolve o pagamento existente.
- Cliente atual (sem chave) continua funcionando exatamente como hoje; para a
  proteção valer na UI basta o front enviar um UUID por tentativa de envio — ver §5.
- **Deploy seguro:** se o código entrar antes da migration (auto-migrate é
  best-effort no Railway), um detector de coluna degrada sem a proteção e loga
  `[transacional] coluna … ausente` — em vez de 500 em todo pedido. Testado (§3.4).

### Estoque — `db/pedidos.js`, `db/queries.js`
- Adicionais duplicados são deduplicados (corrige B); inserts de
  adicionais/remoções em lote; baixa segue atômica, agora com `RETURNING`;
  restauração (cancelar/editar) agregada por produto em ordem e **não** reabilita
  produto pausado manualmente; cardápio em cache é invalidado quando a
  disponibilidade vira (esgotou/voltou), sem esperar os 30 s do TTL.
- Check `estoque >= 0 NOT VALID` no banco como última linha de defesa.

### Locks e consultas — `db/queries.js`, `db/caixa.js`, migration `0018`
- **Ordem global documentada:** mesa → sessão → pedido → itens → produtos (id
  crescente). Caixa ganhou `travarSessao` (mesa antes, `FOR UPDATE OF s` depois);
  produtos são travados antes, ordenados, em `travarProdutosEmOrdem`.
- `getProdutosComRegras` em lote: **3 consultas por pedido** inteiro.
- `db/retry.js`: retry estreito só p/ deadlock (40P01)/serialização (40001) —
  a transação abortada não gravou nada, repetir é seguro; erro de negócio não repete.
- `getSessao` e listagem do caixa leem em snapshot único
  (`REPEATABLE READ READ ONLY`).
- Índices novos: `pedidos(sessao_id,status)`, `pedidos(sessao_id,criado_em,id)`,
  `pedidos(criado_em)`, `itens_pedido(pedido_id,status)`,
  `sessao_pagamentos(sessao_id,criado_em)`, `mesa_sessoes(status,fechada_em)`,
  avisos pendentes parcial. (No runner atual, `CREATE INDEX` dentro da transação —
  ok no volume de hoje; com histórico gigante, criar `CONCURRENTLY` à mão antes.)

### Pool e SSE — `db/pool.js`, `db/events.js`
- `statement_timeout` 30 s, `lock_timeout` 15 s, `idle_in_transaction_session_timeout`
  30 s (configuráveis) + `keepAlive`: transação travada vira erro visível e libera lock.
- Avisos SSE a mesa/garçom (payload vazio) coalescidos a 1 por 300 ms/cliente
  (`SSE_PUBLIC_COALESCE_MS`, 0 desliga); staff recebe tudo na hora.
  Trechos escritos no teste: **51.520 → 533 (−99 %)**.

---

## 3. Testes executados (ambiente isolado)

PostgreSQL 16.2 local (descartável), app e gerador de carga na mesma máquina de
**2 vCPUs** — as latências absolutas são, portanto, um **teto pessimista** (em
produção app e banco não disputam as mesmas 2 CPUs com o gerador). Sequencial e
sem contenção, um check-in leva **3–4 ms** e um commit **1–2 ms** no mesmo ambiente;
a comparação válida é antes × depois nas mesmas condições.

### 3.1 Harness novo — `scripts/carga-70-mesas.js` (`npm run test:carga70`)

70 mesas **ao mesmo tempo** (sem lotes), SSE aberto por mesa, ciclo completo
(check-in → 2 pedidos → cozinha → garçom → parcial em metade → fechamento),
reconciliação mesa a mesa, cenários S2–S6 (idempotência de pedido/pagamento/
fechamento, corrida de estoque 10×30, regressão de status) e auditoria SQL.

| Métrica | Baseline (`main`) | Corrigido (pool 10) | Corrigido (pool 20) |
|---|---|---|---|
| Verificações | 11 ok · **4 falhas** | **18 ok · 0 falhas** | 18 ok · 0 falhas |
| S1 (70 mesas) | 2,0 s, reconciliou | 1,8 s, reconciliou R$ 11.670,00 | ≈ igual |
| S2 rajada mesma chave | **8 pedidos** | **1 pedido** (replays mesmo id) | 1 |
| S3 pagamento repetido | **R$ 30 de R$ 15** | **R$ 15 (1 lançamento)** | R$ 15 |
| S4 fechamento duplo | 409/409 (resíduo de S2) | 200/200, pago = conta | idem |
| S5 estoque 10×30 | 10 aceitos (já ok) | 10 aceitos, 20 rejeições limpas | idem |
| S6 regressão | (cenário novo) | item entregue intacto; cobrou 1× | idem |
| Requisições | 875 em 2,3 s · 389 req/s* | 885 em 2,1 s · 428 req/s* | 431 req/s* |
| Latência geral p50/p95/p99/max | 175/230/281/300 ms | **146/224/239/254 ms** | 136/225/259/264 ms |
| `criar_pedido` p50/p95 | 188/208 ms | 188/235 ms | 195/243 ms |
| Respostas ≥ 400 | 26 (2,97 %) incl. inesperados | 20 (2,26 %) — **todos** os 400 desenhados de S5 | igual |
| Trechos SSE escritos | 51.520 | **533** | 533 |

\* req/s "ponta-a-ponta" inclui as etapas dependentes de cada mesa (não é benchmark
de capacidade tipo wrk). **Taxa de erros inesperados: 0** no corrigido — os únicos
≥400 são as rejeições de estoque que o cenário S5 provoca de propósito.
`PG_POOL_MAX=20` **não** melhorou nada aqui (gargalo = CPU/commit, não o pool):
manter 10 e só subir com evidência de espera por conexão (`pg_stat_activity`).

Latência por fase no corrigido (p50/p95, ms): check-in 177/249 · criar pedido
188/235 · cozinha 157/201 · garçom 129/160 · sessão 83/96 · parcial 142/149 ·
fechar 115/149 — piso de ~110 ms sob rajada é contenção das 2 vCPUs divididas
entre gerador, app e Postgres (sequencial: 3–4 ms), não fila de lock: nenhum
deadlock, nenhum timeout, nenhuma espera estourou.

Auditoria SQL final (0 violações): ≤1 sessão aberta/mesa; estoque nunca negativo;
pagamentos > 0; nenhuma sessão fechada com pedido pendente;
`valor_total` = soma dos itens entregues (inclui parcial); em sessão fechada,
**Σ pagamentos = valor cobrado** exatamente; nenhum PIX/pedido duplicado por chave.

### 3.2 Reprodução A–E depois da correção
A: caixa fecha R$ 12,00 ✔ · B: adicional duplicado → **201** ✔ ·
C: duplo envio com a mesma chave → ids `3,3`, 1 pedido ✔ ·
D: item entregue permanece `entregue`; re-entrega só o que falta; caixa R$ 12 ✔ ·
E: fechar pago> cobrado → **409 explicativo** ✔.

### 3.3 Regressões pré-existentes (contra o código novo, mesmo ambiente)
- `npm run test:regression`: **39/39** (7 novos deste trabalho).
- `scripts/smoke.js`: ✅ · `scripts/smoke-full.js`: ✅ sem avisos ·
  `scripts/teste-carga.js` (original): **18 verificações, 0 falhas** ·
  `scripts/dia-inteiro.js`: ✅ SUPER TESTE OK (75 passos HTTP).
- `npm run build:check` (typecheck + Vite): ✅ (o `dist/` regerado foi revertido —
  front é de outra frente; o CI valida o build).

### 3.4 Deploy sem a migration 0018 (degrade)
Banco "legado" até a 0016 com a 0018 marcada como aplicada sem existir: pedido,
pagamento, confirmação PIX e fechamento **com chave** retornaram 201/200 e a
conta fechou certa (R$ 6 = 1 + 5), com aviso claro no log. Ou seja: se o deploy
preceder a migration, o sistema funciona sem a proteção extra — não cai.

### 3.5 Índices sob volume (20 mil contas sintéticas, `EXPLAIN ANALYZE`)
Pendentes da sessão 0,05 ms · total entregue recomputado 0,05 ms · pagamentos da
sessão 0,02 ms · fechadas na última 1 h 0,08 ms via
`idx_mesa_sessoes_status_fechada` (janela de 7 dias cobrindo 50 % da tabela usa
seq scan de 4,4 ms — escolha correta do planner, não problema).

---

## 4. Como reproduzir

```bash
# Postgres de teste (qualquer instância descartável) + app
DATABASE_URL=postgres://… npm run db:migrate && npm run db:seed
DATABASE_URL=postgres://… STAFF_SEED_PASSWORD=… PORT=3100 node server.js

# terminal 2 — novo harness (recusa host não-local sem ALLOW_REMOTE_CARGA=1)
BASE_URL=http://127.0.0.1:3100 STAFF_SEED_PASSWORD=… DATABASE_URL=postgres://… \
  npm run test:carga70
npm run test:regression   # hermético, sem banco
```

Checklist de deploy deste PR: backup → `npm run db:migrate` (aplica a 0018) →
deploy → smoke → acompanhar logs por `[transacional]`. Nenhuma ação em dados
existentes é necessária (colunas novas são opcionais; `valor_total` se
ressincroniza sozinho nas próximas operações).

## 5. Pendências e recomendações (fora deste PR)

1. **Front enviar `idempotencyKey`** (arquivo é da frente do PR #14): gerar um
   `crypto.randomUUID()` por tentativa de envio do pedido/pagamento/fechamento e
   reutilizá-la em retries — o backend já aceita hoje, sem mudar rota. Enquanto
   isso não acontece, duplo toque continua possível apenas pela UI atual.
2. **Rate-limit conta retries:** o limite de 10 pedidos/5 min por IP+mesa mora no
   `server.js` (não tocado) e é consumido antes do replay idempotente, além de ser
   em memória por processo — com Wi-Fi compartilhado e mesa cheia, acompanhe 429s;
   numa futura mexida no `server.js`, vale não contar replay e/ou mover p/ Redis.
3. **Instância única:** SSE e rate-limit em memória pressupõem 1 processo. Escalar
   horizontalmente exige barramento compartilhado antes de qualquer réplica.
4. **Cancelamento apaga o pedido** (sem trilha de auditoria): um `status='cancelado'`
   com soft-delete é a evolução natural, mas toca filas/relatórios — PR próprio.
5. **Observabilidade:** ativar `pg_stat_statements` no provedor e alertar em
   `pg_stat_activity` (esperas de lock) antes de mexer em `PG_POOL_MAX`.
6. Antes de produção, repetir `test:carga70` em homologação com o Postgres do
   provedor (rede real muda latência; é onde pool/SSL pesam de verdade).
