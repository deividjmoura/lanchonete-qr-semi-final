# Estado em memória e requisito de deploy single-instance

## Status atual observado no commit de referência

O backend mantém dois estados operacionais dentro do processo Node:

- `db/rateLimit.js`: buckets em um `Map` local ao processo.
- `db/events.js`: clientes SSE em um `Map` local ao processo.

Esses mecanismos não compartilham estado entre réplicas.

## Risco de executar mais de uma réplica

### Rate limit

Cada réplica mantém seu próprio contador. Distribuir requisições entre N processos pode multiplicar aproximadamente por N o orçamento efetivo de tentativas. Reinícios também descartam os buckets.

### SSE

Cada processo conhece apenas os clientes conectados a ele. Uma mutação processada na réplica A não é automaticamente transmitida aos clientes SSE conectados à réplica B. Sticky sessions não resolvem o fan-out entre processos.

## Gate operacional temporário

Até que exista uma implementação compartilhada e testada para rate limit e publicação de eventos:

1. Produção deve operar com **uma única réplica do backend**.
2. Não habilitar scale-out horizontal como medida de capacidade.
3. Não considerar sticky sessions substituto de store compartilhado ou pub/sub.
4. Qualquer alteração no número de réplicas deve ser tratada como mudança de arquitetura e revisada pela Frente 1 antes de ser aplicada no Railway.
5. Registrar esta restrição no runbook de operação e nos critérios de release.

Este documento registra um requisito operacional; **não altera a configuração do Railway**.

## Critérios para remover o gate

O gate só pode ser removido quando todos os itens abaixo forem concluídos:

- [ ] Rate limit compartilhado entre processos, com política definida para indisponibilidade do store.
- [ ] Teste de integração que envia tentativas por processos distintos e comprova limite global.
- [ ] Barramento SSE distribuído (pub/sub) com entrega entre réplicas.
- [ ] Teste de integração que conecta cliente em A, publica evento em B e comprova recebimento.
- [ ] Reconexão, limpeza de assinaturas e comportamento em falha do broker testados.
- [ ] Runbook e monitoramento atualizados.
- [ ] Frente 1 valida a topologia real do Railway e remove o gate de forma explícita.

## Relação com a revisão independente

- AUD-001: rate limit local por processo.
- REV-003: SSE local por processo.
- REV-001: mutações públicas de mesa também precisam de limites, tratadas em PR separada.

## Não objetivos

Esta mudança documental não instala Redis, não altera variáveis, não muda regiões ou réplicas e não realiza deploy.
