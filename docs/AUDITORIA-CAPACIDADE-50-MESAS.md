# Auditoria de capacidade e erros — 50 mesas

**Data:** 2026-10-19  
**Branch de trabalho:** `audit/capacidade-50-mesas-20261019`  
**Escopo:** auditoria estática e preparação de validação. Nenhum teste de carga foi executado contra produção; nenhum banco foi alterado por esta auditoria.

## Resumo executivo

- A interface/admin permite configurar até 70 mesas; portanto 50 está dentro do limite funcional configurado.
- A arquitetura tem proteções relevantes para concorrência: PostgreSQL como fonte de verdade, transações, lock de linha da mesa ao abrir/reutilizar sessão, lock de produtos em ordem crescente, retry para deadlock/serialização, pool de conexões configurável e coalescência de eventos SSE para clientes públicos.
- O script `scripts/carga-70-mesas.js` já permite usar `MESAS=50` e foi desenhado para simular o ciclo de 50 mesas com SSE, latências p50/p95/p99, erros HTTP e reconciliação SQL. Por padrão, ele recusa hosts remotos e exige configuração explícita para homologação remota.
- **Conclusão provisória:** não foi encontrada uma limitação estrutural que impeça 50 mesas abertas. Entretanto, não é correto declarar capacidade comprovada sem executar a carga contra uma cópia isolada do PostgreSQL e a mesma configuração de infraestrutura usada no deploy. 50 mesas abertas também não equivalem a 50 pedidos por segundo.

## Pontos positivos encontrados

1. `db/queries.js`: `getOuAbrirSessao` bloqueia a linha da mesa com `FOR UPDATE`, evitando duas sessões abertas para a mesma mesa durante pedidos concorrentes.
2. `db/queries.js` e `db/pedidos.js`: produtos são travados em ordem crescente e as regras do carrinho são carregadas em lote, reduzindo deadlocks e round-trips dentro da transação.
3. `db/retry.js`: repete somente erros transitórios PostgreSQL `40P01` e `40001`, não erros de negócio.
4. `db/pool.js`: pool padrão de 10 conexões, configurável por `PG_POOL_MAX`; também configura timeouts de conexão, query, lock e transação ociosa. Aumentar o pool sem medir o limite do banco pode piorar a fila.
5. `db/events.js`: eventos públicos SSE são coalescidos por padrão em janela de 300 ms. Isso reduz escritas e refetches quando muitas mesas recebem eventos em rajada.
6. `scripts/carga-70-mesas.js`: existe cenário de carga apropriado para 50 mesas, com até 50 conexões SSE, ciclo operacional, percentis de latência e verificações de invariantes SQL.

## Riscos e pontos a verificar

### P1 — Limite real do banco e da hospedagem não confirmado
O código, isoladamente, não confirma o plano do PostgreSQL, limite de conexões, CPU/memória do Railway, latência de rede, número de instâncias ou carga de outros serviços. O pool de 10 pode enfileirar requisições durante rajadas; isso pode ser aceitável, desde que latências e erros permaneçam dentro do orçamento operacional.

**Validação necessária:** executar a carga em homologação com banco isolado e a configuração de deploy equivalente, registrando p50/p95/p99, timeouts, 5xx/429, conexões e duração total.

### P1 — Rate limit em memória
`db/rateLimit.js` armazena contadores por processo e reseta ao reiniciar. É adequado somente se o deploy for efetivamente uma única instância para esse controle. Com múltiplas instâncias, o limite deixa de ser global e cada instância pode aceitar sua própria quota.

**Validação necessária:** confirmar número de réplicas/instâncias no Railway. Se for mais de uma, considerar rate limit compartilhado; não aumentar limites sem medir.

### P1 — Backpressure das conexões SSE
`db/events.js` mantém conexões abertas num `Map` e escreve nos clientes em cada broadcast; a coalescência ajuda clientes públicos, mas a implementação não faz gestão explícita de backpressure via retorno de `res.write()`. Com 50 mesas isso pode ser suficiente, mas deve ser observado durante o teste prolongado.

**Validação necessária:** observar memória, event loop, desconexões SSE e quantidade de eventos enquanto há pedidos e mudanças de status concorrentes.

### P2 — Testes de carga alteram dados
`scripts/carga-70-mesas.js` cria produto de teste, faz pedidos, pagamentos e fechamento de comandas. Não executar no Railway de produção nem em banco compartilhado com dados reais. O próprio script exige confirmação explícita para hosts remotos, mas essa opção não transforma produção num alvo seguro.

### P2 — Rate limit pode produzir 429 legítimos
O teste de rajada deve distinguir 429 intencional de erros inesperados. Um teste que envia repetidamente pedidos do mesmo IP/mesa pode testar o rate limit, e não a capacidade do banco. O relatório precisa separar throughput operacional de rejeições esperadas.

### P2 — CI verde não prova capacidade
Os testes de regressão e build cobrem contratos e sintaxe, não substituem uma carga real com PostgreSQL. O script de carga deve terminar com auditoria SQL sem divergências e zero erros inesperados antes de considerar o cenário aprovado.

## Plano de validação seguro

1. Criar uma cópia descartável do PostgreSQL, aplicar migrations e carregar dados de teste.
2. Subir uma instância local do servidor ligada **somente** a esse banco.
3. Rodar primeiro regressões/build; em seguida `MESAS=10`, depois `MESAS=25` e por último `MESAS=50`.
4. Para cada rodada, guardar `RELATORIO_JSON` e registrar configuração de Node, pool, PostgreSQL e CPU/memória.
5. Aprovar o cenário de 50 mesas somente se:
   - não houver erro inesperado de rede/HTTP ou timeout;
   - os pedidos e pagamentos forem reconciliados;
   - não houver sessão duplicada por mesa nem venda acima do estoque;
   - os testes de pagamento e fechamento concorrentes preservarem invariantes;
   - não houver crescimento contínuo de memória ou desconexões SSE;
   - p95/p99 estiverem dentro de um limite acordado para a operação.
6. Só depois, se necessário, executar uma rodada de homologação remota com banco isolado e autorização explícita. Nunca apontar para produção.

### Comandos locais (apenas ambiente descartável)

```sh
npm ci
npm run typecheck
npm run build
npm run test:regression
```

Com o PostgreSQL de teste e servidor local preparados, executar em processo recém-iniciado para cada rodada:

```sh
BASE_URL=http://127.0.0.1:3000 MESAS=10 RELATORIO_JSON=/tmp/carga-10.json npm run test:carga70
BASE_URL=http://127.0.0.1:3000 MESAS=25 RELATORIO_JSON=/tmp/carga-25.json npm run test:carga70
BASE_URL=http://127.0.0.1:3000 MESAS=50 RELATORIO_JSON=/tmp/carga-50.json npm run test:carga70
```

Use credenciais de teste em `STAFF_SEED_PASSWORD` e `DATABASE_URL` apontando exclusivamente ao banco descartável. Não copie variáveis de produção. Os comandos são destrutivos para os dados de teste escolhidos.

## Status desta auditoria

- [x] Branch isolada criada a partir de `main`.
- [x] Revisão estática inicial de pool, transações, locks, retry, SSE, rate limit e scripts de carga.
- [x] Plano de carga segura documentado.
- [ ] Rodar regressões/build na branch via CI.
- [ ] Rodar carga de 10/25/50 mesas com PostgreSQL isolado.
- [ ] Verificar métricas reais da hospedagem e do PostgreSQL.
- [ ] Emitir conclusão final de capacidade com números observados.

**Status:** em andamento; capacidade de 50 mesas é plausível pela arquitetura, mas ainda não certificada por uma execução reproduzível nesta rodada.
