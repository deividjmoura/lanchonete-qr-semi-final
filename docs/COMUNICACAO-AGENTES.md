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

Esta seção substitui afirmações anteriores que ficaram desatualizadas. A verificação foi feita lendo este documento, `COORDENACAO.md` e `AGENTS.md` em `main`, além dos PRs e runs consultáveis no GitHub.

### Frente 1 — caixa/pagamentos/PIX/comprovantes
- **Estado:** PR aberto em draft, não integrado. PR [#85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85), branch `work/frente-1-caixa-pagamentos`, head consultado: `b6bb9da195da58b4e4b86c7f67167d36a1d24945`. GitHub reporta `mergeable=false`.
- **Escopo declarado no PR:** landing sem diretório público de mesas, QR PIX pelo valor, quitação/fechamento, limpeza de pedidos operacionais após fechar sessão, comprovante detalhado, operador registrado nos pagamentos e endpoint de pagamento do garçom com autenticação e validação de responsável.
- **Evidência de teste:** o corpo atual do PR declara CI #343 success no commit `824768b8fbbbd0128277f9dbde7a168bbe4f216d`, incluindo migration e integração financeira em PostgreSQL 16 limpo. A consulta de runs também encontrou CI #349 success no commit `925490513c6c3645e3f9ab23042949abdafcf925`. **Não foi confirmado que esses runs correspondem ao head atual** `b6bb9da...`; não marcar o head atual como validado.
- **Bloqueios/próxima ação:** verificar a causa de `mergeable=false`, comparar o head atual com `main`, confirmar CI no head exato e revisar integração ponta a ponta do contrato de cobrança do garçom com a Frente 2. Não integrar nem publicar até a revisão.

### Frente 2 — responsável por mesa/transferência e integração PWA
- **Estado:** PR antigo #86 fechado sem merge; substituído por PR aberto em draft [#89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89), branch `work/frente-2-responsavel-mesa-integrada`, head consultado: `b465ba614d239a2ddfa0f43c5b9decf7f60d8f8f`. GitHub reporta `mergeable=false`.
- **Contrato compartilhado:** migration `0023_atendimento_transferencia_actor.sql`; `GET /api/garcom/:token/garcons-ativos`; `POST /api/garcom/:token/mesas/:numero/transferir`; a fila de prontos e a entrega verificam o responsável atual no backend. PR #89 também inclui consulta de resumo de cobrança, mas declara que não altera o contrato de pagamento/PIX.
- **Evidência de teste:** o corpo/comentários do PR declaram CI #345 success no commit `70d09d921ba3830541d8e9a909e60aec41f4e98d`, incluindo PostgreSQL 16 descartável e teste funcional de transferência, fila filtrada e autorização de entrega. O head atual `b465ba6...` não retornou run de CI na consulta efetuada; portanto, não atribuir o sucesso do commit anterior ao head atual.
- **Bloqueios/próxima ação:** investigar `mergeable=false`, confirmar a causa dos conflitos, obter CI verde no head exato e fazer revisão integrada com PR #85. Validação visual em navegador/dispositivos reais continua pendente.

### Frente 3 — PWA/consentimento de notificações
- **Estado:** PR [#88](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/88) aberto em draft, não integrado; head descrito no PR: `3aefd704273eead3ab551d5dfc905440ecb2e31d`. O PR #84 está integrado, merge commit `daf1b2aab6df6c656b18d27059cf03f766f80237`.
- **Evidência de teste:** PR #88 declara CI #330 success no head informado, com 104 testes de regressão, typecheck, build, integridade de `dist/` e verificações de sintaxe. Esse resultado é do head declarado no PR, não prova de validação em dispositivo real.
- **Limitações/bloqueios:** instalação e consentimento têm cobertura de regressão, mas push em segundo plano não está implementado/verificado; faltam validação real em Android/iOS e revisão do PR.

### Regras e dependências transversais
- A numeração proposta é `0022_sessao_pagamentos_operador.sql` (Frente 1) seguida de `0023_atendimento_transferencia_actor.sql` (Frente 2). Confirmar ambas as migrations na comparação final contra `main`; não presumir integração.
- A Frente 1 depende da validação do endpoint de pagamento do garçom com a PWA da Frente 2. O contrato deve ser integrado sem confiar em nome de operador enviado pelo cliente.
- Nenhuma alteração em Railway, secrets, banco ou produção foi feita por esta atualização documental. Não executar migrations ou testes mutáveis em produção sem autorização explícita.
- **Próxima ação coordenadora:** comparar PRs #85 e #89 com `main`, resolver `mergeable=false`, rodar/confirmar CI nos heads atuais, e só então revisão final. PR aberto, CI de commit anterior, código integrado e deploy validado são estados distintos.

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


## Atualização do comandante — Frentes 1 e 2 / integração de cobrança (2026-10-25)

### Frente 1 — PR #85
- Estado: aberto em draft, não integrado. Head atual observado: `b6bb9da195da58b4e4b86c7f67167d36a1d24945`.
- Migration `0022_sessao_pagamentos_operador.sql`; teste `tests/postgres-financial-integration.test.cjs` cobre pagamento parcial, idempotência, sobrecobrança, quitação/fechamento e auditoria do operador em PostgreSQL 16 descartável.
- Foi reforçada a cobrança pelo garçom: o ID do garçom autenticado é passado a `registrarPagamento` e a responsabilidade atual é revalidada dentro da transação/lock da sessão, fechando uma janela TOCTOU com transferência.
- Evidência de CI: run #355 falhou no head anterior `bbaac28a36679f3cbb72b9e92e5ad5b6feb707fd` porque o teste estático ainda esperava a assinatura antiga. A expectativa foi atualizada em `tests/receipt-route-regression.test.cjs`; **não há ainda run verde observado no head atual**.

### Frente 2 — PR #89
- Estado: aberto em draft, não integrado. PR #86 está fechado sem merge; o trabalho foi portado para `work/frente-2-responsavel-mesa-integrada`, baseada na `main` atual.
- Migration `0023_atendimento_transferencia_actor.sql`; o fluxo de responsabilidade, transferência, fila filtrada e entrega foi testado em PostgreSQL 16 descartável no run #345, head de código `70d09d921ba3830541d8e9a909e60aec41f4e98d`.
- Depois desse run foram acrescentados o resumo de cobrança autorizado (`GET /api/garcom/:token/sessoes/:sessaoId/resumo-pagamento`) e a aba Cobrança do PWA. Ela chama o `POST /api/garcom/:token/sessoes/:sessaoId/pagamentos` da Frente 1, guarda a chave idempotente para retry e exige confirmação manual do recebimento; PIX exige conferência no banco, não gera QR e não fecha a sessão.
- O teste `tests/pwa-garcom-ux.test.cjs` foi atualizado para a nova interface. Runs #359/#360 falharam em versões intermediárias durante a transição do placeholder para o formulário; **não há ainda run verde observado no head atual** `b465ba614d239a2ddfa0f43c5b9decf7f60d8f8f`.

### Integração, CI e produção
- Os dois PRs compartilham alterações em `server.js`, `README.md`, `tests/garcom-operacao-integrada.test.cjs`, `.github/workflows/ci.yml` e neste documento. O workflow das branches inclui PostgreSQL 16 descartável e testes de integração condicionais à presença de cada arquivo; conferir o diff final de merge e manter os testes financeiros e de garçom em conjunto.
- A sequência de migrations é `0022_sessao_pagamentos_operador.sql` (Frente 1), depois `0023_atendimento_transferencia_actor.sql` (Frente 2). Cada migration passou isoladamente em PostgreSQL limpo; o teste conjunto das duas e das duas frentes precisa ser observado após integração.
- Ambos os PRs permanecem draft até CI verde nos heads atuais, revisão do diff combinado e validação visual em navegador/dispositivos reais. Não foram mesclados nem implantados.
- Railway production mantém `main` como branch de deploy. As variáveis PIX e VAPID foram configuradas anteriormente; `VAPID_SUBJECT` foi alinhado ao domínio gerado observado `https://qradminn.up.railway.app`, usando skip-deploy. Não houve deploy dessas branches, e variáveis VAPID não implementam por si só Web Push em segundo plano.
- O domínio observado no Railway é `qradminn.up.railway.app`, enquanto registros históricos de `AGENTS.md`/aplicação ainda citam `qradmin.up.railway.app`; o README do PR #85 foi ajustado para o domínio observado, mas confirmar o URL público efetivamente usado antes de alterar o domínio do serviço. Nenhum domínio foi alterado no Railway.
