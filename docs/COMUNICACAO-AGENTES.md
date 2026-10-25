# Comunicação entre agentes — QR Admin

**Documento canônico de coordenação:** este arquivo, na branch `main`.  
**Repositório:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Coordenação operacional:** consulte também [`COORDENACAO.md`](../COORDENACAO.md).  
**Protocolo permanente:** consulte [`AGENTS.md`](../AGENTS.md).

## Regra de fonte de verdade

1. Use este arquivo em `main` como o único canal documental compartilhado entre agentes. Antes de começar e ao terminar uma tarefa, releia esta página e atualize o status relevante.
2. Não trate cópias deste arquivo em branches, notas privadas ou conversas como fonte canônica. Se uma branch contiver informações novas, reporte-as aqui via commit na `main`.
3. A branch de deploy é `main`. PRs/branches não integrados não estão em produção e não devem ser descritos como entregues.
4. Não altere Railway, secrets, dados ou migrations em produção sem autorização explícita e sem registrar plano/validação.
5. Não declare testes executados sem evidência. Diferencie testes de CI, testes locais, mocks, PostgreSQL real e testes em dispositivos reais.
6. Em conflito de código ou contrato, informe os arquivos/linhas e proponha resolução; não sobrescreva silenciosamente trabalho alheio.
7. Ao concluir, registre: escopo, branch/PR/commit, arquivos e contratos alterados, testes e resultados verificáveis, limitações, bloqueios e próxima ação.

## Atualização canônica de coordenação — 2026-10-25 (verificação direta no GitHub)

Esta seção reflete a verificação mais recente dos PRs, commits e runs de CI consultados no GitHub. A existência de um PR ou de CI verde não significa que o código esteja integrado ou implantado.

### Frente 1 — caixa/pagamentos/PIX/comprovantes
- **Estado:** PR [#85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85) aberto em draft, não integrado; head atual `955523a5c3f72aba2981dc430e1291258666bf41`. GitHub reporta `mergeable=true` contra a base atual consultada.
- **Contrato:** migration `0022_sessao_pagamentos_operador.sql`; cobrança parcial e quitação pelo motor financeiro do Caixa; comprovante detalhado e operador auditado. A rota de pagamento do garçom revalida o responsável atual dentro da transação/lock da sessão para fechar a janela TOCTOU com transferência.
- **Evidência:** CI #366 **SUCCESS** no head atual. O run inclui migration em PostgreSQL 16 limpo, teste financeiro real (pagamento parcial, idempotência, sobrecobrança, quitação/fechamento, auditoria do operador) e rejeição 403 sem lançamento quando o garçom não é responsável.
- **Limitação:** a UI integrada ainda precisa ser revisada junto com a Frente 2; não há validação visual em dispositivo real.

### Frente 2 — responsável por mesa/transferência e integração PWA
- **Estado:** PR antigo #86 fechado sem merge; PR [#89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89) aberto em draft, não integrado; branch `work/frente-2-responsavel-mesa-integrada`, head atual `80a9e20a09356a60a35e302a4b3a2703a0d71a6c`. GitHub reporta `mergeable=true` contra a base atual consultada.
- **Contrato:** migration `0023_atendimento_transferencia_actor.sql`; início de atendimento, transferência auditada, fila de prontos filtrada por responsável e entrega autorizada no servidor.
- **Cobrança no PWA:** `GET /api/garcom/:token/sessoes/:sessaoId/resumo-pagamento` devolve total entregue, total pago e saldo somente ao responsável atual. A aba Cobrança chama `POST /api/garcom/:token/sessoes/:sessaoId/pagamentos` da Frente 1, registra recebimentos parciais com chave idempotente persistida para retry e exige confirmação explícita. Para PIX, o garçom precisa conferir o crédito no app bancário; a tela não gera QR nem confirma liquidação automaticamente. O fechamento final continua no Caixa.
- **Evidência:** CI #367 **SUCCESS** no head atual. O run inclui migration em PostgreSQL 16 limpo, transferência e histórico de ator/origem/destino, fila filtrada, bloqueio 403 ao antigo responsável, entrega pelo novo responsável e resumo de cobrança autorizado.
- **Limitação:** validação visual em navegador/dispositivos reais continua pendente.

### Frente 3 — PWA/consentimento de notificações
- **Estado:** PR #84 integrado à `main` no merge commit `daf1b2aab6df6c656b18d27059cf03f766f80237`. PR [#88](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/88) continua aberto em draft.
- **Evidência:** CI #330 foi reportado como success no head `3aefd704273eead3ab551d5dfc905440ecb2e31d`; confirmar novamente antes de depender de um head diferente.
- **Limitação:** instalação e consentimento não significam Web Push em segundo plano funcional. Subscrição persistida/envio server-side e validação Android/iOS continuam pendentes.

### Dependências e plano de integração
- A sequência de migrations é `0022_sessao_pagamentos_operador.sql` (Frente 1) seguida de `0023_atendimento_transferencia_actor.sql` (Frente 2). Cada branch validou sua migration isoladamente em PostgreSQL 16 limpo; o CI após integração deverá executar ambas as migrations e ambos os testes funcionais no mesmo banco descartável.
- PRs #85 e #89 compartilham `server.js`, `README.md`, `tests/garcom-operacao-integrada.test.cjs`, `.github/workflows/ci.yml` e este documento. A integração planejada é PR #85 primeiro e PR #89 depois, com revisão do diff combinado e CI na `main`; ainda não foram mesclados.
- Railway production permanece na branch `main`. Variáveis PIX e VAPID foram configuradas anteriormente; `VAPID_SUBJECT` foi alinhado ao domínio gerado observado `https://qradminn.up.railway.app`, sem deploy automático. Não houve deploy das branches #85/#89.
- Há divergência histórica entre `qradmin.up.railway.app` nos registros antigos e `qradminn.up.railway.app` na configuração atual do serviço. O README do PR #85 aponta para o domínio observado; nenhum domínio foi alterado no Railway.
- **Próxima ação:** revisar visualmente os dois fluxos no navegador; depois integrar #85, confirmar CI na `main`, atualizar #89 para a base resultante, confirmar o CI conjunto e só então avaliar deploy. Não executar migrations manuais ou testes mutáveis em produção.

## Estado operacional verificado — 2026-10-25

### Frente 1 — caixa, pagamentos, PIX e comprovante
- PR #85 é a referência de trabalho mencionada no registro de coordenação anterior; o estado atual e os detalhes de integração precisam ser confirmados no GitHub antes de depender de seus contratos.
- Não assumir que alterações de pagamentos estão implantadas apenas porque existem em uma branch ou PR.
- A migration `0022_sessao_pagamentos_operador.sql` foi reservada para a Frente 1 no plano de coordenação anterior; confirmar o conteúdo final da `main` antes de integrar migrations concorrentes.

### Frente 2 — responsável por mesa e transferência
- PR #86: **fechado sem merge** (verificado em 2026-10-25). Portanto, o trabalho dessa branch não está integrado por esse PR.
- A branch/PR anterior descrevia a migration `0023_atendimento_transferencia_actor.sql`, os endpoints de garçons ativos e transferência e a filtragem da fila por responsável. Isso é uma descrição do trabalho proposto, não uma confirmação de que esteja em `main` ou em produção.
- Antes de retomar: comparar a branch com a `main`, confirmar se o trabalho foi reaproveitado em outro commit/PR, resolver conflitos e executar CI no head que será revisado. Ainda eram necessários teste de migrations em PostgreSQL isolado e validação em dispositivos reais; não há autorização para migration manual em produção.

### Frente 3 — PWA do garçom
- PR #84 foi integrado à `main` (merge commit informado: `daf1b2aab6df6c656b18d27059cf03f766f80237`).
- PR #88: aberto em draft, não mesclado; head `3aefd704273eead3ab551d5dfc905440ecb2e31d`. GitHub Actions CI run #330 teve conclusão **success**. O corpo do PR registra typecheck, build, integridade de `dist/`, verificações de sintaxe e 104 testes de regressão passando.
- A CI não substitui validação Android/iOS real. O servidor não tem infraestrutura completa de Web Push (subscrição persistida/envio/VAPID); permissão de notificações não significa push em segundo plano funcional.
- Issue #87 é uma referência de acompanhamento; verificar seu estado diretamente no GitHub antes de fechar ou alterar.

## Railway e produção

- A regra do proprietário registrada em `AGENTS.md` é manter Railway apontado para `main`.
- Esta atualização documental não altera Railway, variáveis, secrets, banco, migrations ou dados de produção.
- Não executar `npm run db:seed`, testes mutáveis ou migrations manuais contra produção.
- Antes de qualquer release, verificar a configuração atual, o head integrado, o CI, a sequência completa de migrations e o plano de rollback.

## Modelo de atualização por agente

Use este formato ao registrar progresso:

- **Frente / responsável:**
- **Estado:** em andamento / bloqueado / pronto para revisão / integrado
- **Branch / PR / commit:**
- **Mudanças concretas:**
- **Contrato/API/banco afetado:**
- **Testes executados:** comando, ambiente e resultado
- **Não validado / limitações:**
- **Bloqueios / dependências:**
- **Próxima ação e responsável:**

> Regra de honestidade: “CI verde” significa apenas que os jobs daquele commit passaram. Não significa que o código foi mesclado, implantado, validado em PostgreSQL real ou testado em dispositivos físicos.
