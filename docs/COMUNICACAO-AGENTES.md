# Comunicação entre os agentes — QR Admin

## Objetivo e regras de colaboração

Estamos trabalhando em três frentes no repositório `deividjmoura/lanchonete-qr-semi-final`. O agente coordenador trabalha na Frente 1. Dois agentes paralelos trabalham nas Frentes 2 e 3.

### Regras obrigatórias
1. Antes de editar, leia este documento, o README e os arquivos envolvidos. Confirme a branch e a versão atual.
2. Não trabalhe diretamente em `main`. Use uma branch própria por frente e abra PR para revisão.
3. Não sobrescreva mudanças de outro agente. Se houver dependência ou conflito, documente e comunique antes de alterar arquivos compartilhados.
4. Não declare testes executados sem os executar. Não rode testes mutáveis contra produção nem use seed destrutivo.
5. Backend/PostgreSQL é a fonte da verdade. Não resolva inconsistências apenas escondendo elementos no frontend.
6. Preserve autenticação, autorização por papel, CSRF, validações de valores e os testes de regressão existentes.
7. No final, reporte: branch/PR, arquivos alterados, decisões, testes realmente executados, limitações e dependências para outra frente.
8. Não altere deploy, secrets, dados de produção ou configurações externas sem autorização explícita.

## Frente 1 — Caixa, pagamentos, PIX e comprovante (coordenador)
Branch: `work/frente-1-caixa-pagamentos`

Escopo:
- Investigar e corrigir a inconsistência em que pagamento concluído deixa pedidos/sessões em listas incorretas ou mantém mesa vazia aberta.
- Diferenciar claramente pedido pronto, entregue, pagamento parcial/integral e sessão fechada.
- Permitir adicionar novos itens a uma sessão existente sem editar pedido já concluído pela cozinha/bar.
- Permitir ao garçom autorizado registrar/cobrar pagamentos, com as mesmas regras de cálculo e auditoria do caixa. Não confiar em totais enviados pelo cliente.
- PIX: gerar QR dinâmico por valor usando a chave configurada. O proprietário forneceu uma chave PIX que deve ser configurada apenas no ambiente privado do servidor; não copie a chave real para o repositório. Nome do recebedor: `QRADMIN`; cidade: `PENHA SC`. Preferir configuração por variáveis de ambiente (`PIX_CHAVE`, `PIX_NOME`, `PIX_CIDADE`); nunca duplicar a chave em vários componentes. Validar limites/formato exigidos pelo payload BR Code e acrescentar identificador da transação quando suportado.
- Para dinheiro, crédito e débito, registrar a forma selecionada, valor, operador, horário e sessão. Para PIX, registrar também a referência/identificador da cobrança quando disponível. Gerar QR não é confirmação de liquidação; a equipe deve conferir o recebimento.
- Histórico e comprovante de consumo não fiscal devem incluir dados do estabelecimento, mesa/sessão, data/hora, operador, itens e descrições, quantidades, preço unitário, adicionais quando aplicável, subtotais, descontos, taxas, pagamentos por forma, total pago e saldo. Não chamar o documento de nota fiscal nem sugerir validade fiscal.
- Corrigir a página inicial pública para não listar mesas; manter acesso do cliente pelo QR individual.
- Adicionar testes de regressão e atualizar documentação/configuração de ambiente.

Arquivos iniciais para investigar (não presumir que sejam os únicos): `src/store/usePub.ts`, `src/lib/api.ts`, telas de caixa e garçom, `server.js`, `db/`, migrations e `tests/regressions.cjs`.

## Frente 2 — Responsabilidade por mesa e operação do garçom (Agente 2)
Criar uma branch independente a partir da versão atual de `main`, por exemplo `work/frente-2-responsavel-mesa`.

Escopo:
- Inspecionar o fluxo existente de atribuição de mesas, garçom por token, entrega e histórico de transferência antes de propor nova implementação.
- Atribuição persistente no backend: quando um garçom começa a atender uma mesa, ele fica como responsável pela sessão.
- Pedidos prontos da cozinha/bar devem aparecer no PWA apenas para o garçom responsável pela mesa; o dashboard administrativo continua vendo tudo.
- Criar transferência de mesa para outro garçom ativo, atualizar a responsabilidade no servidor e manter histórico de transferência.
- Após transferência, novas tarefas/notificações vão para o novo responsável sem duplicidade ou perda. Definir e documentar como tratar tarefas já prontas no momento da transferência.
- Remover o conceito/botão redundante de “assumir” se o novo fluxo de início de atendimento o substituir, sem quebrar permissões ou histórico.
- Testar dois garçons em sessões/dispositivos diferentes e autorização contra acesso a mesas alheias.
- Não modificar telas de pagamento nem o fluxo de instalação/notificações, exceto se for necessário um contrato de API; coordenar previamente qualquer mudança em arquivos compartilhados.

Entregar PR e reportar o contrato de API/DB alterado. Não presumir que os endpoints de caixa já aceitam garçons; alinhar com Frente 1 se necessário.

## Frente 3 — Navegação PWA e permissões de notificações (Agente 3)
Criar uma branch independente a partir da versão atual de `main`, por exemplo `work/frente-3-pwa-notificacoes`.

Escopo:
- Remover a aba/página “Início” do PWA do garçom se ela apenas duplicar atalhos; preservar as telas operacionais necessárias.
- Rever o prompt de instalação e permissão de notificações no primeiro acesso. Explicar que notificações exigem instalação quando necessária pela plataforma, suporte do navegador/dispositivo, permissão concedida e implementação de push funcional.
- Se o usuário recusar, apresentar uma segunda confirmação clara de que não receberá notificações; permitir configurar depois sem insistir a cada abertura.
- Não chamar `Notification.requestPermission()` automaticamente sem uma ação do usuário quando o navegador exige gesto explícito.
- Diferenciar instalado/não instalado, permitido/negado/indisponível. Não afirmar que push funciona sem verificar service worker, subscrição e envio no servidor.
- Remover o botão permanente “Instalar” apenas quando o fluxo contextual cobrir os casos suportados; manter instruções de instalação manual quando o navegador não expõe o prompt.
- Não alterar atribuição de mesas nem endpoints financeiros. Coordenar se precisar compartilhar arquivos com Frente 2.
- Testar regressões estáticas e, quando disponível, Android/Chrome e iOS/Safari; registrar limitações de plataforma.

## Integração entre as frentes
- Frente 1 define os contratos de pagamento, sessão e comprovante.
- Frente 2 define o responsável da mesa e o direcionamento de tarefas.
- Frente 3 consome o fluxo de tarefas do garçom, sem criar outra regra de atribuição.
- Qualquer alteração em `server.js`, `src/lib/api.ts`, migrations, tipos compartilhados ou arquivos da PWA deve ser comunicada no PR antes de conflito.
- Não mesclar branches automaticamente nem rebasear à força. Revisar PRs e executar a suíte de regressão integrada antes de integrar.
- Prioridade de integração: Frente 1, depois Frente 2, depois Frente 3.

## Configuração PIX e segurança
Configure a chave PIX no ambiente do servidor, não no código cliente nem em commits. Valores iniciais informados pelo proprietário:
- `PIX_CHAVE` = valor fornecido pelo proprietário (configurar privadamente no Railway)
- `PIX_NOME=QRADMIN`
- `PIX_CIDADE=PENHA SC`

Verifique no código como as variáveis são lidas e validadas. Nunca registre secrets ou credenciais em logs. A chave PIX é dado de recebimento, mas deve ser configurada em ambiente controlado e confirmada pelo proprietário antes do deploy. Não altere variáveis no Railway sem autorização e sem confirmar o ambiente alvo.

## Modelo de relatório final de cada agente
- Branch e link do PR:
- Resumo das mudanças:
- Arquivos/contratos alterados:
- Testes executados e resultados:
- Testes não executados e motivo:
- Riscos ou limitações:
- Dependências ou decisões que o coordenador precisa aprovar:


## Solicitação de coordenação — Frente 2 / Railway (2026-10-25)

**Para o agente da Frente 2 (work/frente-2-responsavel-mesa):** por favor, registre aqui uma lista completa e explícita de tudo que precisa ser alterado ou validado no Railway para entregar a Frente 2. Não faça alterações no Railway ainda; o coordenador precisa revisar e autorizar o alvo antes de mexer em produção.

Responder com estes pontos, mesmo que a conclusão seja “não precisa alterar”:
1. **Serviço/ambiente alvo:** projeto, serviço, ambiente (produção ou preview), domínio e branch configurada como fonte. A branch de deploy deve ser main; não apontar Railway para uma branch de agente.
2. **Variáveis de ambiente:** nomes exatos de variáveis novas/alteradas, finalidade, se são obrigatórias, formato esperado e como validar sem imprimir valores secretos. Não incluir segredos neste documento.
3. **Banco de dados/migrations:** migrations novas necessárias, se rodam automaticamente no comando atual de start ou se exigem execução manual; comandos seguros e ordem; impacto/compatibilidade com dados existentes; plano de rollback. Não executar testes mutáveis nem migrations manualmente em produção sem autorização.
4. **Configuração de build/start/deploy:** mudanças necessárias em Root Directory, build command, start command, healthcheck, rede/domínio, deploy triggers ou outra configuração — declarar “nenhuma” quando aplicável.
5. **Dependências externas:** serviços, credenciais, VAPID/Web Push ou integrações que sejam realmente necessários para a Frente 2. Separar requisitos da Frente 2 de melhorias futuras da Frente 3.
6. **Verificação pós-deploy:** comandos/URLs de smoke test não destrutivos, resultado esperado, como confirmar que dois garçons recebem as tarefas corretas após transferência e como observar logs sem expor tokens/PII.
7. **Plano de execução:** ordem proposta, riscos, downtime esperado (se houver), rollback e o que precisa de aprovação do proprietário.

**Contexto da Frente 3:** a auditoria do PWA não encontrou implementação de Web Push no servidor (subscrição/persistência/envio). Permissão de notificações no navegador, isoladamente, não ativa push em segundo plano. Não introduzir VAPID ou alterações de Railway como se fossem requisito da Frente 2 sem demonstrar a dependência técnica. A Frente 3 não alterou configuração, variáveis, secrets nem dados do Railway.

**Formato de resposta:** marcar cada item como NECESSÁRIO, VALIDAR ou NÃO NECESSÁRIO, com justificativa e evidência (arquivo/endpoint/migration). Se a Frente 2 precisar de mudanças no Railway, pedir autorização com a lista exata antes de executar.


## Plano de execução coordenado — objetivo de hoje (2026-10-25)

A meta de hoje é fechar as três entregas em PRs revisáveis, com CI verde e contratos compatíveis; não é fazer deploy apressado.

### Frente 1 — coordenador (PR #85)
- Fechar CI e revisar as regressões de pagamento/comprovante.
- Integrar com Frente 2 a autorização de cobrança pelo garçom, usando o responsável atual da sessão no servidor; não confiar em IDs/nome enviados livremente pelo cliente.
- Corrigir/confirmar numeração única de migrations. A migration de operador de pagamento usa 0022_sessao_pagamentos_operador.sql; a Frente 2 deve escolher o próximo número livre e renomear a sua migration para evitar colisão.
- Documentar o que depende de configuração privada PIX e manter Railway/produção intocados até aprovação explícita.
- Sem merge/deploy antes de revisão integrada.

### Frente 2 — responsável por mesa (PR #86)
- Corrigir possível colisão de prefixo da migration 0022_atendimento_transferencia_actor.sql com a migration da Frente 1; verificar a sequência completa e renomear para o próximo número livre.
- Confirmar contrato dos endpoints de garçons ativos e transferência, autorização por responsável, estado de sessão e histórico.
- Cobrir por regressão: A inicia atendimento → pedido pronto → A transfere para B → só B vê a tarefa → B entrega → admin continua vendo todas.
- Preservar isolamento dos arquivos financeiros da Frente 1 e do fluxo de instalação/notificações da Frente 3.
- Reportar CI do head atual, limitações de teste real e contrato final de API/DB.

### Frente 3 — PWA e notificações (issue #87)
- Remover a aba Início redundante e cobrir a navegação por teste.
- Implementar consentimento contextual no primeiro acesso, pedido de permissão somente após ação explícita, confirmação adicional após recusa e caminho para ativar depois sem insistência recorrente.
- Distinguir permissão do navegador de push funcional: auditoria anterior não encontrou subscrição persistida nem envio Web Push no backend.
- Não adicionar VAPID, secrets ou alterações de Railway sem comprovar necessidade e receber aprovação.
- Consumir o contrato de tarefas da Frente 2 sem duplicar regras de atribuição; evitar editar arquivos compartilhados sem coordenação.
- Abrir PR draft e reportar CI, cobertura e limitações por plataforma.

### Gate de integração do trio
1. Confirmar CI verde em cada head e resolver conflitos de migration.
2. Revisar juntos endpoints/contratos e executar a suíte de regressão integrada, incluindo os testes de PostgreSQL descartável quando disponíveis.
3. Conferir que pagamentos não fecham sessões com pendências, transferência muda o destinatário sem duplicar tarefas e o PWA não promete notificações de background que o servidor ainda não entrega.
4. Só depois solicitar autorização para merge/deploy. Nenhuma frente altera Railway, secrets, dados de produção ou configuração externa sem autorização explícita.


## Atualização do coordenador — situação integrada e Railway (2026-10-25)

Esta atualização registra o estado observado após revisar os PRs e o ambiente de produção. A autorização operacional do proprietário para ajustes rotineiros no Railway foi dada diretamente na conversa em 2026-10-25; portanto, não é necessário pedir confirmação a cada alteração de configuração reversível. Continuam proibidos segredos no Git, logs e documentação, e deploy de código incompleto.

### Railway — estado observado
- Projeto `exquisite-nurturing`, serviço `lanchonete-qr-semi-final`, ambiente `production`.
- A fonte do serviço permanece `deividjmoura/lanchonete-qr-semi-final` / branch `main`; build `npm run build`; start `npm run start:prod`; pre-deploy `npm run db:migrate && npm run db:seed`.
- Domínio Railway observado: `qradminn.up.railway.app`. Nenhum domínio customizado aparece anexado ao serviço.
- Deploy da integração da Frente 3, commit `daf1b2aab6df6c656b18d27059cf03f766f80237`, terminou `SUCCESS`; serviço online com uma réplica, sem falhas recentes ou alertas ativos.
- `PIX_CHAVE`, `PIX_NOME`, `PIX_CIDADE` e as variáveis `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` estão configuradas no serviço de produção. Não registrar nem copiar valores secretos aqui.
- A configuração VAPID foi aplicada com skip-deploy. Durante a revisão, `VAPID_SUBJECT` foi alinhado ao domínio realmente anexado ao serviço (`https://qradminn.up.railway.app`), também com skip-deploy. A configuração não comprova que Web Push funcione; o código ainda precisa consumir as variáveis após a integração/deploy apropriados.

### Estado dos PRs e bloqueios
- **PR #84 / Frente 3:** mergeado na `main`; deploy correspondente confirmado como `SUCCESS`. Isso entrega UX/consentimento, não Web Push em segundo plano.
- **PR #85 / Frente 1:** draft, aberto, head `9d093ad68b8434b4c58e1f90f70557e5efb1998d`; CI associado ao head observado como `SUCCESS`. Ainda faltam validações integradas e PostgreSQL real para os fluxos financeiros.
- **PR #86 / Frente 2:** draft, aberto, head `90471c46b7f566ec40aa8b02e1a9bf22f0e81b6e); o GitHub reporta `mergeable=false` e não foi localizado run de CI para esse head exato. O run verde citado anteriormente pertencia a um SHA anterior; não reutilizar essa evidência como se validasse o head atual.
- **Colisão de migrations confirmada:** a Frente 1 contém `0022_sessao_pagamentos_operador.sql` e a Frente 2 contém `0022_atendimento_transferencia_actor.sql`. Como a sequência de integração prioriza Frente 1 antes da Frente 2, manter `0022` na Frente 1 e renumerar a migration da Frente 2 para `0023_atendimento_transferencia_actor.sql`, conferindo o runner e os testes antes de atualizar o PR. Não executar migration manualmente em produção.
- O contrato operacional da Frente 2 continua sem exigir VAPID/Web Push por si só. VAPID pertence à implementação de notificações da Frente 3; não confundir a preparação de variáveis com requisito concluído da Frente 2.

### Próximos passos coordenados
1. Frente 2: resolver conflitos do PR, renumerar a migration para `0023`, confirmar autorização/histórico e executar CI no head novo.
2. Frente 1: revisar o CI verde do head atual e concluir testes integrados dos pagamentos, sem confiar em valores enviados pelo cliente.
3. Integração: validar a sequência completa de migrations em PostgreSQL descartável e executar testes de transferência/entrega e pagamentos com os contratos combinados.
4. Depois de revisão e CI verde, promover a integração em `main`; acompanhar o deploy automático e validar em produção com smoke tests não destrutivos. Não executar `test:dia` ou qualquer teste mutável contra produção sem avaliar seu impacto primeiro.
5. Frente 3: só reabrir o escopo de Web Push quando houver implementação completa de subscrição, persistência, autorização, envio, limpeza HTTP 410 e teste real com o PWA encerrado.


## Atualização de coordenação — validação observada (2026-10-25, rodada seguinte)

- **Frente 1 / PR #85:** CI SUCCESS no head `26da6d4051331b2c9d2070adfaf1cb4384042afe`. O código agora corrige os placeholders SQL posicionais do INSERT dinâmico e atribui o operador autenticado também ao lançamento automático do saldo restante durante o fechamento. O teste de regressão cobre ambos. O PR segue draft até validar fluxos financeiros com PostgreSQL descartável e fechar a integração de cobrança do garçom.
- **Frente 2 / PR #86:** migration conflitante continua presente no head observado. Mantém-se a instrução de renomear `0022_atendimento_transferencia_actor.sql` para `0023_atendimento_transferencia_actor.sql` após confirmar a sequência completa; validar no CI do novo head, não reutilizar um run verde antigo.
- **Frente 3 / PR #88:** CI SUCCESS no head `ce64c67fdacdab14dc4b3b800977422de1004851` para os testes estáticos de consentimento. Isso não comprova Web Push em background nem substitui testes em Android/iOS.
- Comentário de coordenação atualizado no PR #86. O contrato entre frentes e a sequência de migrations continuam sendo bloqueadores antes de qualquer merge integrado.


## Atualização de coordenação — migration da Frente 2 renumerada (2026-10-25)

- A Frente 2 confirmou que renomeou a migration para `0023_atendimento_transferencia_actor.sql` e atualizou os documentos relacionados. A colisão de nome com `0022_sessao_pagamentos_operador.sql` foi resolvida na branch do PR #86.
- Head observado do PR #86: `8c533dc32120a07387a14d55f6739c8dab623371`. Ainda não havia CI associado a esse SHA na última consulta e o GitHub reportava `mergeable=false`; a Frente 2 foi orientada a resolver os conflitos e validar o novo head antes de sair do draft.
- Frente 1 / PR #85: CI SUCCESS no head `7de3e336155fd06fd6c94a0563e1c2d8ee7cf61a`.
- Frente 3 / PR #88: CI SUCCESS no head `3aefd704273eead3ab551d5dfc905440ecb2e31d`.
- Próxima barreira compartilhada: revisar contratos de API e rodar testes integrados em PostgreSQL descartável. Nenhuma migration foi executada em produção e nenhum merge/deploy foi feito.


## Contrato de pagamento pelo PWA do garçom (Frente 1 → Frente 2)

A Frente 1 adicionou em `server.js` a rota `POST /api/garcom/:token/sessoes/:sessaoId/pagamentos` na branch `work/frente-1-caixa-pagamentos`.

- Autentica o token do garçom via `getGarcomPorToken` e rejeita tokens inexistentes/inativos.
- No servidor, confere que a sessão existe, está aberta e que `mesa_sessoes.garcom_responsavel_id` corresponde ao garçom autenticado. O navegador não escolhe o operador.
- Corpo: `{ valor, formaPagamento, idempotencyKey? }`; formas aceitas pelo motor financeiro: `dinheiro`, `pix`, `cartao_debito`, `cartao_credito`.
- Sucesso (201): `{ ok, mesa, pagamento: { id, valor, formaPagamento, criadoEm, operadorNome }, valorTotal, valorPago, valorRestante, idempotentReplay }`.
- Erros previstos: 400 valor/forma inválidos ou acima do saldo; 401 token inválido/inativo; 403 sessão atribuída a outro garçom; 404 sessão inexistente; 409 sessão fechada.
- A rota registra usando o mesmo motor `registrarPagamento` do caixa, com o nome obtido do cadastro autenticado, preservando a auditoria/idempotência. Não concede ao garçom acesso geral a `/api/caixa`.
- **Ação da Frente 2:** após revisar o contrato, integrar a chamada no PWA da mesa sob responsabilidade atual e apresentar valor restante/forma registrada. Não alterar o backend financeiro da Frente 1; sinalizar incompatibilidades neste documento antes de mudar o contrato.
- **Validação do backend:** CI SUCCESS no head `be5a8da99fffb25489821460c2c38ba8b1b8bb16` (run 40199491940), incluindo typecheck, build, integridade de `dist/`, regressões e sintaxe Node/SQL. O teste estático cobre token ativo, sessão aberta, responsável atual e uso do motor financeiro comum.
- **Limitação atual:** ainda falta a integração visual do PWA pela Frente 2 e teste com PostgreSQL descartável. Não declarar cobrança de garçom pronta só porque a rota passou no CI.


## Atualização do comandante — integração de frentes (2026-10-25, rodada 2)

- **Frente 1 / PR #85:** CI **SUCCESS** no head `824768b8fbbbd0128277f9dbde7a168bbe4f216d` (run #343): migrations aplicadas em PostgreSQL 16 limpo e teste funcional real passou para pagamento parcial, replay idempotente, rejeição de valor acima do saldo, quitação, fechamento e auditoria do operador. Variáveis PIX já estão configuradas no Railway production; o PR permanece draft até revisão integrada final.
- **Frente 2 / PR antigo #86:** fechado como substituído, pois estava baseado na `main` anterior à integração da Frente 3 e reportava conflito.
- **Frente 2 / PR novo #89:** https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89. A branch `work/frente-2-responsavel-mesa-integrada` foi criada diretamente da `main` atual (`daf1b2aab6df6c656b18d27059cf03f766f80237`), com o fluxo de responsabilidade/transferência integrado à UX atual da PWA. A migration foi renumerada para `0023_atendimento_transferencia_actor.sql`; `0022_sessao_pagamentos_operador.sql` continua sendo a migration de pagamentos. O PR #89 está em draft, mergeable e com CI **SUCCESS** (run #340) no head `d94a0907ade7a9fb4e4bad6a1a7f26f19c4ad202`, incluindo migrations em PostgreSQL 16 limpo. Acrescentei também teste ponta a ponta de transferência/fila/entrega em PostgreSQL real; o novo CI desse head ainda está em execução.
- **Frente 3:** PR #84 já está integrado na `main`. Isso cobre instalação contextual e consentimento, não o envio Web Push em segundo plano. VAPID está configurado no Railway, mas as variáveis por si só não completam a implementação.
- **Produção:** não executei migrations nem testes mutáveis no banco de produção. Nenhum deploy foi feito a partir dos PRs #85 ou #89. A fonte de deploy permanece `main`.

### Próximos gates
1. Esperar o CI do PR #89 e corrigir qualquer falha no novo head.
2. Revisar o diff combinado da PWA, incluindo autorização de mesa e estados de notificação.
3. Validar migrations 0022 + 0023 e fluxos financeiros/atendimento em PostgreSQL descartável.
4. Somente depois de CI verde, revisão e validação integrada, decidir a promoção dos PRs; após merge autorizado, acompanhar o deploy automático e executar smoke tests não destrutivos.


## Atualização do comandante — testes PostgreSQL reais e sincronização do documento (2026-10-25)

### Frente 1 / PR #85
- CI #343 **SUCCESS** no commit de código `824768b8fbbbd0128277f9dbde7a168bbe4f216d`.
- O teste `tests/postgres-financial-integration.test.cjs` passou em PostgreSQL 16 descartável: pagamento parcial, replay idempotente, rejeição de cobrança acima do saldo, quitação, fechamento de sessão, registro do operador e replay do fechamento.
- O commit `fd14fca104830d0d2d76b947b731708ed49ba663` atualiza apenas esta documentação de coordenação. O PR continua draft até revisão integrada final.

### Frente 2 / PR #89
- O PR #86 foi fechado como substituído porque sua branch partia da versão anterior à integração da Frente 3.
- PR atual: https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89, branch `work/frente-2-responsavel-mesa-integrada`.
- CI #345 **SUCCESS** no commit de código `70d09d921ba3830541d8e9a909e60aec41f4e98d`.
- O teste `tests/postgres-waiter-integration.test.cjs` passou em PostgreSQL 16 descartável: iniciar atendimento, pedido pronto visível ao responsável, transferência com auditoria, remoção da fila do antigo responsável, inclusão na fila do novo e bloqueio de entrega pelo antigo responsável; o novo responsável concluiu a entrega.
- O PR segue draft até revisão final do diff e validação visual em navegador/dispositivos reais.

### Coordenação de merge
- Os dois PRs alteram `docs/COMUNICACAO-AGENTES.md`. Para evitar conflito de arquivo adicionado, o conteúdo deste documento passa a ser a cópia canônica compartilhada e foi sincronizado para a branch do PR #89. Ao atualizar coordenação antes do merge, manter o mesmo conteúdo nos dois PRs.
- A sequência de migrations permanece: `0022_sessao_pagamentos_operador.sql` (Frente 1) e `0023_atendimento_transferencia_actor.sql` (Frente 2). Ambas passaram separadamente em migrations de PostgreSQL limpo; a implementação de cada frente passou também seu teste funcional isolado.
- A integração conjunta final deve ser validada após a sequência de merges. Não executar migrations manuais, seeds ou testes mutáveis em produção.
- A Frente 3 está integrada na `main`, mas Web Push com aplicativo fechado continua fora do que foi implementado: as variáveis VAPID não equivalem a subscrição e envio em segundo plano.
