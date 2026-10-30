# Capacidade — 60 mesas + 10 garçons simultâneos (issue #158)

**Veredito: APROVADO no alvo.** O sistema suportou o pico desenhado
(60 mesas abertas, 10 garçons em paralelo na fila compartilhada) com
**zero erros inesperados**, invariantes financeiros válidos e p95 de
escrita abaixo da meta de 500 ms em todas as fases, em duas execuções
consecutivas com servidor recém-iniciado.

## Como executar (sob demanda — não roda no CI)

Pré-requisitos: PostgreSQL de teste descartável, servidor local recém-
iniciado (o rate-limit de pedidos é em memória) e `npm ci`.

```bash
DATABASE_URL=postgres://.../banco_de_teste npm run db:migrate
DATABASE_URL=postgres://.../banco_de_teste npm run db:seed
DATABASE_URL=postgres://.../banco_de_teste STAFF_SEED_PASSWORD=... PORT=3100 npm run server

BASE_URL=http://127.0.0.1:3100 STAFF_SEED_PASSWORD=... \
  DATABASE_URL=postgres://.../banco_de_teste \
  RELATORIO_JSON=/tmp/carga60.json npm run test:carga60
```

Smoke rápido do harness: `MESAS=12 GARCONS=3 node scripts/carga-60-mesas-10-garcons.js`.
Alvo diferente do padrão (60/10) deve ser declarado no relatório gerado.
O script recusa `BASE_URL` não-local sem `ALLOW_REMOTE_CARGA=1` — nunca
rodar contra produção (cria garçons de teste e fecha contas).

## O que o harness exercita (`scripts/carga-60-mesas-10-garcons.js`)

- **S1** — 60 mesas ao mesmo tempo: checkin → 2 pedidos/mesa → produção
  por setor; 73 conexões SSE abertas durante todo o pico (60 mesas +
  cozinha/caixa/admin + 10 garçons); fila compartilhada drenada por
  10 garçons em paralelo no fluxo por item (assumir → retirar → entregar).
- **S2** — corrida de aceite: os 10 garçons assumem o mesmo item pronto
  simultaneamente; exatamente 1 vence e os demais recebem 409 limpos.
- **S3** — 5 transferências de mesa do responsável em paralelo com
  pagamentos parciais/fechamentos das demais mesas.
- Reconciliação de totais mesa a mesa + auditoria SQL de invariantes
  (sessão única aberta por mesa, estoque/pagamentos válidos, nenhum item
  entregue sem autor, pagamentos = valor cobrado).
- Relatório `RELATORIO_JSON` com p50/p95/p99 por fase, propagação SSE,
  corrida, transferências, auditoria e veredito da meta de p95.

## Resultados executados (2026-10-30, ambiente local)

Ambiente: 2 vCPU / 4 GB RAM, Node 22, PostgreSQL 18 embarcado no mesmo
host, `PG_POOL_MAX=10` (padrão). São **números locais**: em produção
(Railway + PostgreSQL remoto) a latência de commit/rede muda os valores
absolutos; o que se comprova aqui é ausência de erros, de contenção
estrutural e folga em relação à meta.

| Fase (p95, ms) | Rodada 1 | Rodada 2 | Meta |
|---|---|---|---|
| checkin | 216 | 196 | < 500 |
| criar_pedido | 327 | 329 | < 500 |
| produção (status) | 307 | 292 | < 500 |
| fila do garçom (leitura) | 50 | 44 | — |
| garçom assumir / retirar / entregar | 60 / 48 / 62 | 70 / 49 / 68 | < 500 |
| pagamento parcial | 185 | 227 | < 500 |
| fechar sessão | 168 | 218 | < 500 |
| transferir mesa | 47 | 58 | < 500 |
| propagação SSE na mesa (p95) | 451 | 453 | — |

Ambas as rodadas: ~1.080 requisições em ~3,8 s (~280–295 req/s de pico
ponta-a-ponta), 14/14 verificações OK, reconciliação exata
(R$ 5.940,00 na rodada 1), corrida de aceite 1 vencedor / 9 recusas 409,
5/5 transferências aceitas sob carga e auditoria SQL zerada.

## Gargalos verificados

- **Pool do PostgreSQL (`PG_POOL_MAX=10`, padrão): suficiente.** Foram
  observadas 11 conexões no banco durante o pico (pool do servidor +
  auditoria) e a fase mais quente do garçom (fila) ficou com p95 de
  50 ms — não há fila de espera por conexão neste alvo. Não aumente o
  pool sem observar `pg_stat_activity`: pool maior que o plano do
  PostgreSQL só transfere a fila para dentro do banco.
- **SSE:** 73 conexões estáveis, 3.608 eventos, **0 quedas**. O p50 de
  propagação na mesa (≈320 ms) é o desenho da coalescência de clientes
  públicos (`SSE_PUBLIC_COALESCE_MS=300`, em `db/events.js`): a mesa
  recebe "recarregue" no máximo 1× por janela, enquanto staff recebe o
  payload imediatamente. Não é atraso de gargalo.
- **Rate limits:** nenhum 429 no roteiro. O limite de pedidos é por
  IP+mesa (10/5 min), então 60 mesas atrás do mesmo NAT não competem
  entre si; rotas de garçom não têm limite por IP que bloqueie a equipe.
  Uma única mesa acima de 10 pedidos/5 min continua sendo limitada por
  desenho (proteção anti-abuso).
- **Índices das consultas quentes:** a fila compartilhada
  (`getFilaGarcom`) respondeu com p95 de 50 ms sob carga usando os
  índices existentes (`idx_itens_pedido_status_pedido`,
  `idx_itens_fila_retirada`, `idx_mesa_sessoes_status_mesa`). Nenhum
  índice novo é necessário neste alvo.

## Limites seguros e recomendações

1. Operar com folga até o alvo comprovado: **60 mesas + 10 garçons**
   (o harness de 70 mesas sem equipe paralela continua em
   `npm run test:carga70`).
2. Manter `PG_POOL_MAX=10` em instância pequena/média; só revisar com
   evidência de espera por conexão no `pg_stat_activity` de produção.
3. Hardware de referência local: 2 vCPU / 4 GB sustentaram o pico com
   folga. Em produção, o fator dominante passa a ser a latência até o
   PostgreSQL — prefira app e banco na mesma região/provedor.
4. Não extrapolar: acima de 60 mesas/10 garçons, ou com catálogo/estoque
   muito maiores, reexecutar este harness em ambiente equivalente ao de
   produção antes de prometer capacidade.
5. Repetir a execução a cada mudança estrutural em pool, SSE, fila do
   garçom ou índices — o relatório JSON é o artefato comparável.
