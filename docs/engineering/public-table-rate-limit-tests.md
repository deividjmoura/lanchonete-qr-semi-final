# Testes de integração — rate limit das mutações públicas de mesa (PR #196)

**Branch:** `test/public-table-rate-limit-integration`
**Base:** `fix/public-table-mutation-rate-limit` (PR #196 — **não** `main`)

Esta contribuição é **somente de testes**. Nenhum arquivo de produção foi alterado.

## O que é validado

As quatro mutações públicas autenticadas pelo token opaco da mesa:

| Rota | Limite | Janela |
|---|---|---|
| `POST /api/mesas/:token/checkin` | 5 | 5 min |
| `POST /api/mesas/:token/pix-informado` | 6 | 5 min |
| `DELETE /api/mesas/:token/pedidos/:id` | 5 | 5 min |
| `PUT /api/mesas/:token/pedidos/:id` | 10 | 5 min |

Por operação e por par **(IP resolvido, token da mesa)**, conforme
`mesaMutationPermitida()` em `server.js` e a chave
`mesa-mut:<operacao>:<ip>:<token>`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `tests/postgres-public-table-rate-limit.test.cjs` | 22 testes de integração HTTP contra `server.js` real |
| `tests/helpers/public-table-server.cjs` | Harness: cópia isolada da aplicação + servidor em processo filho + relógio de teste |
| `tests/public-table-rate-limit-harness.test.cjs` | Testes do próprio harness (rodam sem banco, entram no `npm test`) |
| `scripts/run-pg-tests.js` | Inclui a suíte no runner documentado de PostgreSQL |
| `.github/workflows/postgres-integration.yml` | Passo de CI no job que já provisiona o PostgreSQL 16 |

## Como o servidor sobe

O harness copia `server.js`, `db/**`, `security/**`, `server/**`, `package.json`
para um diretório temporário, liga o `node_modules` do repositório e sobe o
`server.js` **copiado, sem edição**, em processo filho (`fork`) numa porta livre
do loopback. Antes de subir, cada arquivo copiado é comparado por SHA-256 com a
árvore de trabalho: se a cópia divergir do código de produção, a suíte falha.

Por que um processo só dele: o rate limit é em memória e por processo
(`db/rateLimit.js`). Subir o `server.js` da raiz encheria de buckets o processo
compartilhado com outras suítes.

## Como a janela de 5 minutos é testada

Dormir 5 minutos inviabiliza o CI. O processo filho recebe um `--require` que
desloca **apenas** as leituras de `Date.now()` feitas de dentro do
`db/rateLimit.js` da cópia (delimitação pela pilha da chamada). Nada mais no
processo vê o relógio deslocado: expiração de sessão, `now()` do PostgreSQL e
logs continuam no tempo real. O teste
`tests/public-table-rate-limit-harness.test.cjs` comprova esse isolamento.

O deslocamento entra por `--require` (configuração de processo), nunca por
edição de arquivo: a integridade SHA-256 é conferida depois da cópia.

## Isolamento por IP

O servidor resolve o IP pelo socket (`resolveClientIp`, sem
`TRUSTED_PROXY_HOPS`/`CLIENT_IP_HEADER`). O harness abre cada requisição com
`localAddress` explícito, então `127.0.0.1` e `127.0.0.2` são dois clientes
distintos do ponto de vista da aplicação, sem forjar `X-Forwarded-For`.

## Como rodar

```bash
# PostgreSQL descartável (o nome do banco precisa conter "test")
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/qradmin_test npm run db:migrate

# só esta suíte
DATABASE_URL=... NODE_ENV=test node --test tests/postgres-public-table-rate-limit.test.cjs

# dentro do runner do projeto
DATABASE_URL=... npm run test:pg -- --sem-backup

# harness (não precisa de banco; já entra no npm test)
node --test tests/public-table-rate-limit-harness.test.cjs
```

Sem `DATABASE_URL`, `NODE_ENV=test` e base `qradmin_test` a suíte **se recusa a
rodar** (mesmo contrato das demais `tests/postgres-*.test.cjs`).

## Verificação de que os testes discriminam a implementação

Rodando a mesma suíte contra o `server.js` de `main` (sem a PR #196):
**3/22 passam, 19/22 falham** — as 19 são exatamente as que dependem dos
limites. Os 3 restantes são as pré-condições de "requisição dentro do limite é
processada", que só fazem sentido junto dos demais no conjunto.

Dependência de ordem evitada de propósito: cada teste cria a própria
mesa/token, então qualquer teste roda sozinho
(`node --test --test-name-pattern="..."`).

## Dependências e riscos encontrados

1. **O teste depende de a PR #196 não mudar de forma.**
   Os limites (5/6/5/10) e as mensagens de erro estão fixados na suíte. Se a
   revisão da PR #196 alterar qualquer um deles, esta suíte falha de propósito —
   é o sinal para atualizar o teste junto da decisão de produto.

2. **O relógio de teste é acoplado ao caminho `db/rateLimit.js`.**
   O deslocamento é identificado pela pilha da chamada. Se `golpePermitido`
   passar a ler o relógio por outro módulo (ex.: um `clock` injetado em
   `db/rateLimit.js` que chame `Date.now` de fora), o deslocamento deixa de
   valer e os testes de janela falham com "a janela não expirou". A correção
   seria ajustar o harness — **não** o código de produção. Não é o caso hoje:
   `db/rateLimit.js` chama `Date.now()` diretamente (linhas 7 e 22).

3. **Rate limit em memória, por processo (limitação da própria PR #196).**
   Os testes validam o comportamento de uma instância. Com mais de uma réplica
   o limite é por réplica; a PR #196 já registra isso como risco multi-instância
   (AUD-001/REV-003) e esta suíte não altera esse desenho.

4. **`localAddress` só é aceito em endereços do loopback.**
   Em runner de CI Linux isso funciona. Em ambientes onde `127.0.0.2` não é
   roteável para o próprio host (não é o caso do `ubuntu-latest`), os quatro
   testes de isolamento por IP falham de forma explícita.

5. **Dados de entrega para o cenário de PIX.**
   A rota de PIX exige pedido `entregue`. A entrega é feita por SQL porque o
   caminho público de entrega exige garçom autenticado, e o alvo do teste é a
   rota de PIX. Nenhuma regra de negócio é reimplementada no teste: o aviso de
   PIX continua sendo criado pela rota real.

6. **Nada foi alterado em `server.js`, `db/**`, migrations, variáveis do
   Railway ou na PR #196.** Não há merge nem push em `main`.

## Limitação ambiental registrada nesta execução

Execuções repetidas na **mesma** base acumulam estado e derrubam suítes antigas
(`postgres-entregas-progressivas`, `postgres-waiter-integration`,
`postgres-remocao-garcom`, `postgres-dashboard`) — antes e depois desta
mudança, porque cada suíte foi escrita esperando a base do próprio job do CI.
`postgres-pracas-remocao` também depende do seed (`npm run db:seed`) e nunca
rodou no CI.

Comparação feita em base recriada (`CREATE DATABASE qradmin_test` novo +
`npm run db:migrate`), rodando as 14 suítes do CI na mesma ordem em `main` e
nesta branch:

| Base | Suítes do CI | Suíte nova |
|---|---|---|
| `main` (sem PR #196) | 14/14 verdes — 47 testes | 3/22 |
| esta branch (PR #196 + testes) | 14/14 verdes — 47 testes | **22/22** |

Ou seja: a única diferença é esta suíte. Sem base limpa, a suíte nova **também
passa** (22/22 em 5 execuções seguidas sobre base usada); o que quebra em base
suja são suítes antigas, que não foram alteradas.

Este sandbox não tem Docker nem `psql`/`pg_dump`: o PostgreSQL usado foi o
`embedded-postgres` das devDependencies (receita reproduzível na seção
"PostgreSQL descartável com embedded-postgres" abaixo). Por isso o drill de
backup/restore (`postgres-backup-restore.test.cjs`) foi executado com
`--sem-backup`; ele roda no job do CI com `pg_dump`/`pg_restore` 16.


## PostgreSQL descartável com embedded-postgres

Quando Docker e `psql` não estiverem disponíveis, as suítes de integração podem usar a dependência `embedded-postgres` já declarada no projeto. Execute somente em ambiente local descartável; não reutilize URL de produção.

```bash
cat > /tmp/startpg.cjs <<'EOF'
const mod = require('embedded-postgres');
const EmbeddedPostgres = mod.default || mod;
const pg = new EmbeddedPostgres({ databaseDir: '/tmp/qradmin-pgdata', user: 'postgres', password: 'postgres', port: 55432, persistent: true });
pg.start().then(() => console.log('PG_STARTED')).catch((e) => { console.error('PG_FAIL', e.message); process.exit(1); });
EOF
node /tmp/startpg.cjs

node -e "const {Client}=require('pg');(async()=>{const c=new Client('postgres://postgres:postgres@127.0.0.1:55432/postgres');await c.connect();await c.query('CREATE DATABASE qradmin_test').catch(()=>{});await c.end();})()"
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55432/qradmin_test" npm run db:migrate
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55432/qradmin_test" NODE_ENV=test node --test tests/postgres-waiter-integration.test.cjs
```

Mantenha o processo do PostgreSQL em execução durante os testes e encerre-o ao terminar. A trava das suítes exige o nome de banco `qradmin_test`; não contorne essa proteção.
