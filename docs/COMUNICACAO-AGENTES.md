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
4.1. **Responsabilidade exclusiva por Railway — Agente 1 / Frente 1:** toda tarefa que envolva Railway (serviços, deploy/redeploy, domínio, variáveis de ambiente, secrets, configuração do serviço, logs e diagnóstico operacional) deve ser encaminhada e atribuída primeiro ao Agente 1 / Frente 1. Os demais agentes não devem executar essas ações diretamente; devem registrar a necessidade e designar o Agente 1 como responsável. O Agente 1 também deve respeitar a regra de autorização explícita para alterações sensíveis e registrar no canal canônico o que foi feito, evidências e resultado. Em incidentes urgentes, comunicar o Agente 1 e aguardar sua condução, sem mudanças paralelas.
5. Não declare testes executados sem evidência. Diferencie testes de CI, testes locais, mocks, PostgreSQL real e testes em dispositivos reais.
6. Em conflito de código ou contrato, informe os arquivos/linhas e proponha resolução; não sobrescreva silenciosamente trabalho alheio.
7. Ao concluir, registre: escopo, branch/PR/commit, arquivos e contratos alterados, testes e resultados verificáveis, limitações, bloqueios e próxima ação.

## Atualização canônica de coordenação — 2026-10-25 (verificação direta no GitHub)

Esta seção substitui os snapshots anteriores de status. CI verde se aplica ao commit exato informado; não significa integração ou deploy.

### Frente 1 — caixa/pagamentos/PIX/comprovantes
- **Estado:** PR [#85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85) aberto em draft, não integrado. head atual `dab9820a4e7cb70946d21c65695a72d25a5c7162`. CI do GitHub Actions concluiu **success** nesse head (run [#40201539020](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201539020), 2026-10-25).
- **Contrato:** migration `0022_sessao_pagamentos_operador.sql`; cobrança parcial e quitação pelo motor financeiro do Caixa; comprovante detalhado e operador auditado. A rota de pagamento do garçom passa o ID autenticado e revalida a responsabilidade atual dentro da transação/lock da sessão para fechar a janela TOCTOU com transferência.
- **Evidência:** CI #366 **SUCCESS** no commit de código indicado. Inclui migration em PostgreSQL 16 limpo e teste financeiro real: pagamento parcial, idempotência, sobrecobrança, quitação/fechamento, auditoria do operador e 403 sem lançamento quando o garçom não é responsável.
- **Limitação:** a UI integrada precisa ser revisada junto com a Frente 2; não há validação visual em dispositivo real.

### Frente 2 — responsável por mesa/transferência e integração PWA
- **Estado:** PR antigo #86 fechado sem merge; PR [#89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89) aberto em draft, não integrado. head atual `4e828e074404682a0a5f5711747585955d69b310`. CI do GitHub Actions concluiu **success** nesse head (run [#40201544526](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201544526), 2026-10-25).
- **Contrato:** migration `0023_atendimento_transferencia_actor.sql`; início de atendimento, transferência auditada, fila de prontos filtrada por responsável e entrega autorizada no servidor.
- **Cobrança no PWA:** `GET /api/garcom/:token/sessoes/:sessaoId/resumo-pagamento` devolve total entregue, total pago e saldo somente ao responsável atual. A aba Cobrança chama `POST /api/garcom/:token/sessoes/:sessaoId/pagamentos` da Frente 1, registra recebimentos parciais com chave idempotente persistida para retry e exige confirmação explícita. Para PIX, o garçom precisa conferir o crédito no app bancário; a tela não gera QR nem confirma liquidação automaticamente. O fechamento final continua no Caixa.
- **Evidência:** CI #367 **SUCCESS** no commit de código indicado. Inclui migration em PostgreSQL 16 limpo, transferência e histórico de ator/origem/destino, fila filtrada, bloqueio 403 ao antigo responsável, entrega pelo novo responsável e resumo de cobrança autorizado.
- **Limitação:** validação visual em navegador/dispositivos reais continua pendente.

### Frente 3 — PWA/consentimento de notificações
- **Estado:** PR #84 integrado à `main` no merge commit `daf1b2aab6df6c656b18d27059cf03f766f80237`. PR [#88](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/88) foi fechado em 2026-10-25; seu commit squash `3b584cadcb6f3b2c1ca00ad9d5f2b1b1490d0210` está incorporado à `main`.
- **Evidência:** o commit squash altera `package.json` e adiciona `tests/pwa-garcom-consent.test.cjs`; a consulta de ancestralidade confirmou que ele está na história da `main`. O CI histórico registrado para o HEAD da PR foi success (run #330).
- **Limitação:** instalação e consentimento não significam Web Push em segundo plano funcional. Subscrição persistida/envio server-side e validação Android/iOS continuam pendentes.

### Dependências e plano de integração
- A sequência de migrations é `0022_sessao_pagamentos_operador.sql` (Frente 1) seguida de `0023_atendimento_transferencia_actor.sql` (Frente 2). Cada branch validou sua migration isoladamente em PostgreSQL 16 limpo; o CI após integração deve executar ambas as migrations e os dois testes funcionais no mesmo banco descartável.
- PRs #85 e #89 compartilham `server.js`, `README.md`, `tests/garcom-operacao-integrada.test.cjs`, `.github/workflows/ci.yml` e este documento. A sequência proposta é PR #85 primeiro e PR #89 depois; revisar o diff combinado, atualizar a base do PR #89 após o primeiro merge e confirmar CI conjunto.
- Ambos os PRs continuam draft e não foram mesclados nem implantados. Após sincronizar as branches com este documento, GitHub reportou `mergeable=true` para ambos; `mergeable_state=unstable` na última consulta. Revalidar após qualquer avanço da base e manter draft até revisão visual e integração conjunta.
- Railway production permanece na branch `main`. Variáveis PIX e VAPID foram configuradas anteriormente; `VAPID_SUBJECT` foi alinhado ao domínio gerado observado `https://qradminn.up.railway.app`, sem deploy automático. Não houve deploy das branches #85/#89.
- Há divergência histórica entre `qradmin.up.railway.app` nos registros antigos e `qradminn.up.railway.app` na configuração atual do serviço. O README do PR #85 aponta para o domínio observado; nenhum domínio foi alterado no Railway.
- **Próxima ação:** confirmar mergeabilidade após sincronização documental, revisar visualmente os dois fluxos no navegador, integrar #85, confirmar CI na `main`, atualizar #89 para a base resultante e confirmar o CI conjunto. Não executar migrations manuais ou testes mutáveis em produção.

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




### Handoff de coordenação aos agentes — 2026-10-25
- **Deploy automático após documentação:** o commit documental `9ab759f79d4fb26962f2567386b1a0aa9a70cf57` acionou o deploy automático do Railway. Verificação direta do GitHub em 2026-10-25: CI run [#40202505292](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40202505292) **success** e status de deploy reportado como **success** para `qradminn.up.railway.app`. O diff do commit continha apenas `docs/COMUNICACAO-AGENTES.md`; não houve alteração intencional de runtime, secrets ou banco. Isso demonstra que commits na `main`, inclusive documentação, podem disparar deploy e devem ser tratados como operações de release.

- **Revisão de consistência da Frente 3:** a issue [#87](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/87) especifica a branch `work/frente-3-pwa-notificacoes`, mas o PR [#88](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/88) está na branch `work/frente-3-validacao-final`. O responsável foi solicitado a confirmar se a divergência é intencional e sincronizar os registros. Os testes de #88 fazem assertions estruturais sobre texto/código-fonte; CI passou, mas isso não equivale a testes reais de interação no browser.


- Foram publicados comentários de coordenação nos PRs [#85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85), [#89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89) e [#88](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/88), informando os resultados de CI observados nos heads atuais e solicitando que revisão visual, dependências, validações e mudanças de escopo sejam registradas neste canal. Os comentários não alteram o estado dos PRs nem significam aprovação/merge.
- Foram publicados comentários nos PRs documentais [#68](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/68) e [#32](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/32): #68 precisa evitar a criação de um segundo quadro oficial de coordenação; #32 pode preservar templates e guias úteis, mas precisa alinhar governança com o canal canônico. Nenhum desses PRs foi fechado ou mesclado por esta ação.
- Próxima ação para agentes responsáveis: confirmar recebimento, atualizar este arquivo em `main` com evidência objetiva e distinguir CI, revisão, merge e deploy. Não alterar Railway, secrets, banco ou produção sem autorização explícita.

### Auditoria adicional de PRs de documentação antigos

- PR [#68](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/68) propõe um quadro JSON alternativo de coordenação. Está aberto e não integrado; não é o canal oficial. Não fechar nem apagar conteúdo da branch sem revisar diffs e decidir o destino das propostas úteis.
- PR [#32](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/32) propõe documentação adicional de fluxo multiagente e handoff. Está aberto e não integrado; verificar os arquivos específicos do PR antes de qualquer remoção, pois templates e orientações de engenharia podem ter valor independente do canal de coordenação.
- A árvore recursiva completa de `main` foi consultada em 2026-10-25 e não contém arquivos adicionais chamados `AGENT_HANDOFF.md`, `DEVELOPMENT_WORKFLOW.md` ou um quadro JSON de coordenação. Não foi identificado um arquivo adicional na `main` que possa ser removido com segurança apenas pelo nome.

## Registro de leitura e auditoria documental — Frente 3 (2026-10-25)

- **Leitura confirmada diretamente na `main`:** este documento (blob `4dc24f2a164a9cfdbaf031510aad0c8ddfca05f9` antes deste registro), `COORDENACAO.md`, `AGENTS.md` e `README.md`. Não foram usadas cópias de branches como fonte oficial.
- **Frente:** 3 — PWA do garçom / consentimento de notificações.
- **Estado conforme a coordenação canônica lida:** PR #88, branch `work/frente-3-pwa-notificacoes`, aberto em draft e não integrado; head registrado `3aefd704273eead3ab551d5dfc905440ecb2e31d`; CI #330 foi registrado como sucesso nesse head. PR #84 está integrado no merge commit `daf1b2aab6df6c656b18d27059cf03f766f80237`. Esses dados foram lidos no documento canônico; não foi feita nesta ação uma nova consulta independente ao estado atual do PR ou dos runs.
- **Bloqueios/limites:** validação real em Android/iOS e implementação/verificação de push em segundo plano continuam pendentes segundo o registro canônico. Nenhuma alteração de Railway, secrets, banco, migrations ou produção foi realizada.
- **Próxima ação:** verificar novamente o head/estado do PR #88 e o CI associado ao commit exato; revisar as mudanças e validar em dispositivos reais antes de declarar a frente concluída. Registrar os resultados com links/evidências neste documento.

### Auditoria de documentos de coordenação adjacentes

- `AGENTS.md`: manter. É o protocolo permanente exigido pelo projeto, não um canal paralelo para atualizações operacionais. Ele ainda contém histórico técnico e tabelas antigas explicitamente marcadas como históricas; não usar esses trechos como estado atual.
- `COORDENACAO.md`: manter por enquanto como resumo operacional vinculado ao canal canônico, mas corrigir sua tabela de frentes. Há divergência verificável: sua tabela diz que o estado atual da Frente 1/PR #85 não foi confirmado e não lista PR #89; já este documento registra PR #85 e PR #89 abertos em draft, ambos com `mergeable=false`, e cabeças específicas. A tabela de `COORDENACAO.md` também é menos atual que a seção coordenadora deste arquivo. Não excluir sem primeiro atualizar seus links e garantir que nenhuma instrução permanente dependa dele.
- `README.md`: a seção de desenvolvimento local já não contém passos de clone; pressupõe o repositório disponível. Não requer essa remoção novamente.
- **Limite da auditoria:** foram revisados os quatro arquivos acima. A listagem completa da árvore do repositório não foi obtida nesta ação; portanto, não afirmo que todos os possíveis arquivos de comunicação tenham sido identificados nem recomendo exclusões às cegas.
- **Critério para limpeza adicional:** localizar candidatos com `find . -type f` e pesquisar referências antes de apagar. Preservar `AGENTS.md`, `COORDENACAO.md` e este documento canônico; consolidar arquivos realmente redundantes só depois de migrar conteúdo útil e corrigir links.


## Registro de leitura e coordenação — GPT-6 (2026-10-25)

- **Leitura feita diretamente na `main`:** `docs/COMUNICACAO-AGENTES.md` (este canal), `COORDENACAO.md` e `AGENTS.md`. Não usei versões de branches como fonte oficial.
- **Frente em atuação:** coordenação técnica e integração das Frentes 1 e 2 (pagamentos/caixa e responsável por mesa), com verificação do estado da Frente 3 para dependências.
- **Estado atual confirmado no GitHub nesta consulta:**
  - PR [#85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85), branch `work/frente-1-caixa-pagamentos`: aberto, draft, não integrado; head `dab9820a4e7cb70946d21c65695a72d25a5c7162`. CI #366 `SUCCESS` no commit de código `955523a5c3f72aba2981dc430e1291258666bf41`; a branch teve commit posterior descrito como documental. GitHub retornou `mergeable=true` nesta consulta.
  - PR [#89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89), branch `work/frente-2-responsavel-mesa-integrada`: aberto, draft, não integrado; head `4e828e074404682a0a5f5711747585955d69b310`. CI #367 `SUCCESS` no commit de código `80a9e20a09356a60a35e302a4b3a2703a0d71a6c`; a branch teve commit posterior descrito como documental. GitHub retornou `mergeable=true` nesta consulta.
  - PR [#88](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/88), Frente 3: aberto, draft, não integrado; head `3aefd704273eead3ab551d5dfc905440ecb2e31d`; CI #330 `SUCCESS` nesse commit. GitHub retornou `mergeable=false` nesta consulta; não presumo a causa sem inspecionar conflitos/estado atualizado.
- **Contratos compartilhados confirmados:** Frente 1 reserva migration `0022_sessao_pagamentos_operador.sql` e fornece `POST /api/garcom/:token/sessoes/:sessaoId/pagamentos`; Frente 2 reserva `0023_atendimento_transferencia_actor.sql` e integra a cobrança do PWA via esse POST, com chave idempotente e confirmação explícita. O resumo `GET /api/garcom/:token/sessoes/:sessaoId/resumo-pagamento` deve autorizar apenas o responsável atual. A sequência de migrations é 0022 antes de 0023.
- **Evidências e limites:** CI #366/#367 validam commits de código diferentes dos heads atuais (commits posteriores documentais segundo os registros dos PRs). Não há ainda evidência de CI conjunto após integração das duas frentes. Nesta ação não executei testes locais, não fiz validação visual em navegador/dispositivo real e não alterei Railway, secrets, banco ou produção.
- **Bloqueios:** validação visual ponta a ponta continua pendente; a combinação 0022+0023 e os dois testes PostgreSQL ainda precisa de CI após integração. A Frente 3 mantém validação Android/iOS e Web Push em segundo plano pendentes. O estado de `COORDENACAO.md` não é plenamente atual: sua tabela diz `mergeable=true`/clean como última consulta e não reflete a consulta atual de #88 (`mergeable=false`); a seção de coordenação acima deve prevalecer até nova sincronização.
- **Próxima ação:** revisar os diffs atuais e os checks dos heads exatos; avançar #85 primeiro se não houver regressão ou bloqueio nos checks obrigatórios, validar CI na `main`, então atualizar #89 para a nova base e exigir CI conjunto para migrations 0022/0023 e ambos os testes. Antes de declarar entrega, executar validação visual disponível ou registrar explicitamente a limitação de dispositivo. Merge/deploy só após os gates aplicáveis passarem; não executar alterações manuais em produção.
- **Railway:** nenhuma ação feita nesta atualização documental. Lembrar que commits na `main` podem disparar deploy automático; evitar commits sem necessidade e verificar o deployment resultante caso esta atualização dispare um.


## Continuação dos trabalhos — revisão técnica e estado atual (2026-10-25)

### Verificações realizadas nesta continuação
- Releitura direta na `main` de `docs/COMUNICACAO-AGENTES.md`, `COORDENACAO.md` e `AGENTS.md` antes de agir.
- PR #85 consultado novamente: aberto em draft, não integrado; head documental `dab9820a4e7cb70946d21c65695a72d25a5c7162`. CI #366 **SUCCESS** no commit de código `955523a5c3f72aba2981dc430e1291258666bf41`; jobs observados: migration em PostgreSQL 16, teste financeiro, typecheck, build, integridade de `dist/`, regressões e sintaxe passaram.
- PR #89 consultado novamente: aberto em draft, não integrado; head documental `4e828e074404682a0a5f5711747585955d69b310`. CI #367 **SUCCESS** no commit de código `80a9e20a09356a60a35e302a4b3a2703a0d71a6c`; jobs observados: migration em PostgreSQL 16, teste de atendimento/transferência, typecheck, build, integridade de `dist/`, regressões e sintaxe passaram.
- PR #88 consultado novamente: aberto em draft, não integrado; head `3aefd704273eead3ab551d5dfc905440ecb2e31d`. CI #330 **SUCCESS** nesse head. É teste de regressão de consentimento, não validação física Android/iOS nem implementação de Web Push.
- Inspecionados os arquivos de migration #22/#23, testes PostgreSQL e contratos de atendimento/cobrança nos heads das branches. A migration 0022 adiciona `operador_nome`; a 0023 adiciona `alterado_por_id` ao histórico. O endpoint de pagamento do garçom usa o motor financeiro compartilhado e valida a responsabilidade dentro da transação/lock da sessão, reduzindo risco de corrida com transferência.
- A consulta atual de PR retornou `mergeable=false` para #85, #89 e #88. A consulta de comparação entre refs também indicou branches divergentes/atrás da `main` (API de comparação: #85 14 commits atrás e #89 13 commits atrás). Como os valores de mergeabilidade variaram entre consultas anteriores, tratar o estado como bloqueado até nova atualização da base e confirmação pelo GitHub.
- Tentativa de clonar o repositório para executar validação local falhou porque o ambiente não consegue resolver `github.com`. Portanto, **nenhum teste local foi executado nesta continuação**; os testes citados são somente os runs de CI nos commits exatos indicados.

### Decisão e próximo passo
- Não mesclar ainda #85/#89: apesar de CI verde nos commits de código, os heads atuais estão com sincronização/mergeabilidade pendente e a revisão visual ponta a ponta continua sem evidência. Não declarar o fluxo como integrado ou entregue.
- Sequência segura: atualizar/reconciliar #85 com a `main` sem descartar alterações, confirmar CI no novo head; revisar o diff resultante e a UI de caixa/pagamento; só então integrar #85 com autorização explícita. Depois atualizar #89 contra a `main` já integrada, confirmar ambas as migrations e os dois testes funcionais no mesmo job PostgreSQL descartável, revisar cobrança PWA e validar navegador/dispositivo.
- Para #88, revisar o diff de regressões e manter a limitação de Web Push explícita; validação real Android/iOS segue pendente.
- Nenhuma alteração foi feita em Railway, secrets, banco ou produção. Nenhum PR foi mesclado, fechado ou promovido nesta continuação.


## Comunicação direta com os agentes e handoff — 2026-10-25

### Mensagens enviadas aos responsáveis pelas frentes
Foram publicados comentários de coordenação no GitHub para manter o handoff junto aos PRs, além deste documento canônico:
- [PR #85 — Frente 1](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85#issuecomment-6398884284): CI atual #40201539020 **SUCCESS** no head `dab9820a4e7cb70946d21c65695a72d25a5c7162`; pedido de registrar conflitos/dependências e coordenar revisão visual com a Frente 2.
- [PR #89 — Frente 2](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89#issuecomment-6398884893): CI atual #40201544526 **SUCCESS** no head `4e828e074404682a0a5f5711747585955d69b310`; pedido de registrar conflitos/dependências e preparar CI conjunto com migrations 0022+0023 e ambos os testes PostgreSQL após a integração autorizada da Frente 1.
- [PR #88 — Frente 3](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/88#issuecomment-6398885329): CI #40199257840 **SUCCESS** no head `3aefd704273eead3ab551d5dfc905440ecb2e31d`; pedido de registrar a causa do bloqueio de mergeabilidade e as pendências de validação Android/iOS e Web Push.
- Os comentários foram enviados diretamente nas conversas dos PRs; isso confirma a publicação, não confirma que os outros agentes já responderam ou executaram ações.

### Estado após a nova consulta
- A consulta ao GitHub ainda retornou `mergeable=false` para #85, #89 e #88. Embora os runs dos heads atuais estejam verdes para #85/#89, isso não resolve a causa da mergeabilidade.
- Não foi feito merge, push de código nas branches dos agentes, alteração de Railway/secrets/banco, nem deploy manual.
- Próximo passo coordenado: aguardar/resgatar resposta dos responsáveis nos próprios PRs, identificar a causa de `mergeable=false`, e revisar o diff combinado antes de qualquer integração. A revisão visual real ainda não foi executada nesta sessão.
- Este registro é documental na `main`; como commits na `main` podem acionar deploy automático, verificar o estado do serviço após o commit, sem alterar configurações nem executar operação manual de deploy.


## Atualização de integração após revisão coordenada — 2026-10-25

- **Frente 3 / PR #88:** revisado o diff completo (somente `package.json` e `tests/pwa-garcom-consent.test.cjs`). O GitHub reportou `mergeable=true`; CI #330 concluiu `SUCCESS` no head exato `3aefd704273eead3ab551d5dfc905440ecb2e31d`. Conferi também, contra os arquivos atuais da `main`, as asserções estáticas principais de consentimento, pedido explícito de permissão, aviso de ausência de Web Push, instalação, quatro abas e exclusão de `/api/` do cache; todas passaram. Marquei o PR como ready e fiz squash merge, resultado confirmado pelo GitHub: merge commit `3b584cadcb6f3b2c1ca00ad9d5f2b1b1490d0210`. Isso integra apenas a cobertura de regressão; não implementa Web Push server-side nem substitui testes reais Android/iOS.
- **Frentes 1 e 2 / PRs #85 e #89:** seguem abertas em draft e sem merge. CI dos heads `dab9820a4e7cb70946d21c65695a72d25a5c7162` (#85; run #40201539020) e `4e828e074404682a0a5f5711747585955d69b310` (#89; run #40201544526) está `SUCCESS`, mas o GitHub continua retornando `mergeable=false` para ambos. A comparação de refs indica branches divergentes da `main`; a árvore atual de `main` ainda não contém as migrations `0022_sessao_pagamentos_operador.sql` / `0023_atendimento_transferencia_actor.sql` nem os testes PostgreSQL financeiros e de atendimento. Portanto, os fluxos de caixa/transferência não estão integrados.
- **Comunicação entre agentes:** comentários foram publicados diretamente nas PRs #85, #89 e #88. Isso confirma a publicação, não que os responsáveis já tenham respondido. Solicitei reconciliação sem perda de trabalho, CI no HEAD atualizado, revisão visual conjunta e registro das evidências no canal canônico.
- **Produção/Railway:** o merge #88 e os commits documentais anteriores podem disparar deploy automático porque a fonte é `main`. No momento desta atualização, o deployment do merge #88 foi observado em estado `BUILDING`; nenhum deploy manual, alteração de configuração, secret ou migration em produção foi realizado. Verificar o estado do deployment após o commit documental gerado por este registro.
- **Próxima ação:** resolver primeiro a divergência de #85 com a `main` sem descartar hardening ou alterações de outros agentes; exigir CI verde no HEAD atualizado e integração das migrations/teste financeiro. Depois sincronizar #89 e executar CI conjunto em PostgreSQL descartável com migrations 0022+0023 e ambos os testes no mesmo banco. Manter validação visual real como pendência explícita; não declarar as Frentes 1/2 concluídas antes da integração e dos gates combinados.


## Correção de mergeabilidade e confirmação de deploy — 2026-10-25

- **Mergeabilidade #85/#89:** a API REST bruta do GitHub retornou `mergeable=null` e `mergeable_state=unknown` na consulta mais recente. O conector de PR reportou `mergeable=false`, mas isso não basta para afirmar que existe conflito textual confirmado. O dado concreto é que as branches estão divergentes da `main` e atrás dela (comparação de refs: #85 19 commits atrás; #89 18 commits atrás). Reconciliar com a base atual, preservando alterações, e só então aguardar o recálculo do GitHub.
- **Deploy automático:** o deployment Railway `7482ed84-0262-4cc0-b968-22fb53c09e95`, originado do commit documental `866274970347d08794c473e0bad43d58b61456e8`, concluiu `SUCCESS` em 2026-10-25 14:34:47 UTC. Estado observado depois: serviço `lanchonete-qr-semi-final` online, 1 réplica ativa, sem falhas recentes nem trabalho pendente. Logs mostraram build concluído, seed sem duplicar categorias/staff e nenhuma migration pendente. Isso valida o deploy desse commit, não os recursos ainda ausentes das Frentes 1/2; nenhum deploy manual foi executado.


## Retomada de coordenação — verificação direta no GitHub (2026-10-25)

### Estado confirmado nesta rodada
- Lidos na `main` antes de decidir: `AGENTS.md`, `COORDENACAO.md` e `docs/COMUNICACAO-AGENTES.md`. HEAD atual da `main`: `df8e23f86d51b691e226a2363ba5e516233cc38e`.
- PR #85 permanece aberta em draft, head `dab9820a4e7cb70946d21c65695a72d25a5c7162`. Workflow run #40201539020 concluiu SUCCESS; o job retornado foi `verify`. O PR continua sem merge e a migration `0022_sessao_pagamentos_operador.sql`/teste financeiro não está na `main`.
- PR #89 permanece aberta em draft, head `4e828e074404682a0a5f5711747585955d69b310`. Workflow run #40201544526 concluiu SUCCESS; o job retornado foi `verify`. O PR continua sem merge e a migration `0023_atendimento_transferencia_actor.sql`/teste de atendimento não está na `main`.
- Comparação de refs atual com a `main` em `df8e23f86d51b691e226a2363ba5e516233cc38e`: #85 = 60 commits à frente / 25 atrás; #89 = 21 à frente / 24 atrás. As duas comparações retornaram `diverged`. API REST bruta retornou `mergeable=false`, `mergeable_state=dirty`, `rebaseable=false` para ambas. Isso confirma bloqueio de mergeabilidade no estado atual; ainda não foi feita análise/resolução de conflitos arquivo a arquivo.
- Os comentários mais recentes nas PRs #85/#89 continuam sendo mensagens de coordenação do proprietário; não encontrei resposta do agente responsável nem confirmação de branch sincronizada. Não presumir resposta ou trabalho realizado.
- A lista atual de migrations da `main` termina em `0021_corrigir_setores_bebidas_marcas.sql`; 0022 e 0023 não aparecem. Não há evidência de teste integrado das duas migrations e dos dois testes funcionais no mesmo banco descartável.

### Decisão segura
- **Não fazer merge de #85 nem #89 neste estado**, apesar dos checks verdes, porque ambas estão divergentes e o GitHub indica estado `dirty`. Não forçar merge, não rebasear ou sobrescrever branches de agentes sem preservar e revisar suas alterações.
- Próxima ação: pedir aos responsáveis das PRs reconciliação com a `main` atual, com inventário de conflitos/resolução por arquivo e push de um novo HEAD; em seguida conferir checks no SHA exato atualizado. Prioridade permanece #85 primeiro. Após eventual integração de #85, sincronizar #89 e exigir CI conjunto com migrations 0022+0023 e os dois testes funcionais no mesmo PostgreSQL descartável.
- Revisão visual ponta a ponta de caixa/cobrança PWA e teste real de navegador/dispositivos seguem pendentes; CI não é prova dessas validações.
- Nenhuma alteração de código de produto, merge de PR, operação manual no Railway, mudança de secrets, migration ou mutação em produção foi feita nesta rodada. O próximo commit documental na `main` pode acionar deploy automático; verificar o resultado do deployment se o registro for publicado.


## Rechecagem coordenada das Frentes 1 e 2 — 2026-10-25 (consulta posterior)

- **Fonte consultada:** `main` em `docs/COMUNICACAO-AGENTES.md`; PRs #85/#89 e runs CI consultados diretamente no GitHub. A base `main` observada na comparação foi `df8e23f86d51b691e226a2363ba5e516233cc38e`.
- **Frente 1 / PR #85:** permanece aberta em draft, sem merge. HEAD registrado: `dab9820a4e7cb70946d21c65695a72d25a5c7162`. CI run [#40201539020](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201539020), job `verify`: `SUCCESS` no commit exato consultado. Compare `main...work/frente-1-caixa-pagamentos` retornou `diverged`, `ahead_by=60` e `behind_by=25` (merge base `c611df4bb38d2b1512b9ec4e8ec2f49492faaf08`). A resposta do conector ainda indica `mergeable=false`; isso não é prova suficiente de conflito textual. A migration `0022_sessao_pagamentos_operador.sql` e o teste `tests/postgres-financial-integration.test.cjs` aparecem no diff da branch, mas não em `main`.
- **Frente 2 / PR #89:** permanece aberta em draft, sem merge. HEAD registrado: `4e828e074404682a0a5f5711747585955d69b310`. CI run [#40201544526](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201544526), job `verify`: `SUCCESS` no commit exato consultado. Compare `main...work/frente-2-responsavel-mesa-integrada` retornou `diverged`, `ahead_by=21` e `behind_by=24` (merge base `daf1b2aab6df6c656b18d27059cf03f766f80237`). A migration `0023_atendimento_transferencia_actor.sql` e `tests/postgres-waiter-integration.test.cjs` aparecem no diff da branch, mas não em `main`.
- **Ações feitas nesta consulta:** comentários novos publicados nas PRs #85 e #89 com SHAs, links de CI, resultados de comparação e bloqueios. Nenhuma branch foi alterada, nenhum merge foi feito e nenhum teste local/PostgreSQL conjunto ou revisão visual foi executado nesta consulta. O status de CI acima é evidência apenas dos HEADs listados, não de um HEAD sincronizado.
- **Próxima ação segura:** responsáveis das frentes devem reconciliar as branches com `main` sem descartar alterações de segurança/autorização; aguardar o recálculo da mergeabilidade; rodar CI no novo HEAD exato. Integrar #85 primeiro após revisão e autorização; em seguida sincronizar #89 e validar `0022` antes de `0023` mais ambos os testes funcionais no mesmo banco PostgreSQL descartável. Confirmar CI na `main` e revisar a cobrança PWA antes de declarar integração concluída.
- **Produção:** nenhuma alteração em Railway, secrets, banco ou produção foi feita. Como commits na `main` podem disparar deploy automático, verificar o estado do deploy após este commit documental.


## Rechecagem de integração e atribuição Railway — 2026-10-25

- **HEAD da `main` observado:** `20a73198784b0c9034aabd37580e6a5056cf0ffa`. A regra de responsabilidade pelo Railway está documentada acima: Agente 1 / Frente 1 deve receber todas as tarefas de Railway; nenhuma ação em secrets, banco ou produção foi executada nesta rechecagem.
- **Frente 3 / PR #88:** fechada; o commit squash `3b584cadcb6f3b2c1ca00ad9d5f2b1b1490d0210` é ancestral da `main`. A limitação de Web Push em segundo plano e os testes físicos Android/iOS continua válida.
- **Frente 1 / PR #85:** PR ainda aberto em draft segundo os registros consultados. O head registrado `dab9820a4e7cb70946d21c65695a72d25a5c7162` tem CI run [#40201539020](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201539020) **success** nesse commit. Comparação da branch `work/frente-1-caixa-pagamentos` com a `main` atual retornou `diverged`, 60 commits à frente e 28 atrás, merge-base `c611df4bb38d2b1512b9ec4e8ec2f49492faaf08`. Isso é um alerta para revisar a base/diff, não prova por si só que o HEAD exato da PR tenha conflito. Não mesclar antes de reconciliar o diff e rodar CI no HEAD resultante.
- **Frente 2 / PR #89:** PR ainda aberto em draft segundo os registros consultados. O head registrado `4e828e074404682a0a5f5711747585955d69b310` tem CI run [#40201544526](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201544526) **success** nesse commit. Comparação da branch `work/frente-2-responsavel-mesa-integrada` com a `main` atual retornou `diverged`, 21 commits à frente e 27 atrás, merge-base `daf1b2aab6df6c656b18d27059cf03f766f80237`. Não mesclar antes de atualizar após a Frente 1 e confirmar CI no HEAD exato.
- **CI/deploy da atualização documental:** a consulta de status para o commit `20a73198784b0c9034aabd37580e6a5056cf0ffa` retornou o check Railway `success`; não foi encontrado workflow run de GitHub Actions associado a esse commit pela consulta usada. Não confundir o check de deploy com CI. Como commits na `main` podem disparar deploy automático, futuras atualizações documentais também devem ser tratadas com cautela.
- **Validação conjunta ainda pendente:** aplicar migrations `0022_sessao_pagamentos_operador.sql` e `0023_atendimento_transferencia_actor.sql`, nessa ordem, e executar os dois testes de integração PostgreSQL no mesmo banco descartável. A validação física de Android/iOS e Web Push em segundo plano também permanece pendente.
- **Próxima ação:** reconciliar e revisar #85 primeiro sem descartar hardening/autorização em `server.js`; executar CI e teste PostgreSQL financeiro no HEAD sincronizado; só após integrar #85, atualizar #89 e validar as duas migrations e ambos os testes juntos. Nenhuma alteração foi feita em Railway, secrets, banco ou produção nesta rechecagem.

## Continuação da coordenação — atualização da base e inventário de sobreposição (2026-10-25)

- **Base atual consultada:** `main` em `20a73198784b0c9034aabd37580e6a5056cf0ffa` (o commit registra a regra de responsabilidade exclusiva do Agente 1 / Frente 1 por tarefas de Railway). PRs e branches foram consultadas novamente antes de decidir; não encontrei comentários de resposta dos responsáveis às solicitações anteriores nem novos heads publicados.
- **Frente 1 / PR #85:** continua aberta em draft, HEAD `dab9820a4e7cb70946d21c65695a72d25a5c7162`. CI run [#40201539020](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201539020) está `success` nesse HEAD, mas não valida uma sincronização posterior. Comparação com `main` atual: `diverged`, 60 commits à frente e 28 atrás; merge base `c611df4bb38d2b1512b9ec4e8ec2f49492faaf08`. A migration 0022 e o teste PostgreSQL financeiro continuam somente no diff da branch.
- **Frente 2 / PR #89:** continua aberta em draft, HEAD `4e828e074404682a0a5f5711747585955d69b310`. CI run [#40201544526](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201544526) está `success` nesse HEAD, mas não valida sincronização posterior. Comparação com `main` atual: `diverged`, 21 commits à frente e 27 atrás; merge base `daf1b2aab6df6c656b18d27059cf03f766f80237`. A migration 0023 e o teste PostgreSQL de atendimento continuam somente no diff da branch.
- **Sobreposição confirmada no trabalho das duas frentes:** ambas alteram `.github/workflows/ci.yml`, `README.md`, `server.js`, `tests/garcom-operacao-integrada.test.cjs` e este documento. A reconciliação entre #85 e #89 precisa combinar os dois contratos/rotas e os testes, não simplesmente escolher o arquivo inteiro de uma branch. Em relação às mudanças de `main` desde o merge base de #85, os arquivos alterados em comum são `README.md` e `docs/COMUNICACAO-AGENTES.md`; para #89, são `README.md`, `docs/COMUNICACAO-AGENTES.md` e `package.json`. Isto identifica áreas de revisão, não afirma que cada uma tenha conflito textual.
- **Bloqueio e decisão:** não integrar nem forçar atualização das branches neste estado. A API de comparação mostra divergência e o conector indica `mergeable=false`; ainda não há novo HEAD reconciliado com CI verde. A sequência continua #85 primeiro, seguida de #89 sobre a `main` resultante. Manter hardening e autorização de servidor, especialmente a validação do responsável dentro da transação/lock e o resumo financeiro autorizado.
- **Validação não realizada:** tentei clonar o repositório para comparar/validar localmente, mas o ambiente não conseguiu resolver `github.com`. Portanto, nenhum teste local, execução conjunta de PostgreSQL ou revisão visual foi feita nesta continuação. Os dois runs verdes são exclusivamente dos HEADs acima. Web Push em segundo plano e validação real Android/iOS continuam pendentes.
- **Ações desta rodada:** atualização deste documento e nova consulta aos estados de PR/CI. Nenhuma branch de código foi modificada; nenhum merge, migration, alteração de secret ou operação em produção foi realizada. Pela regra do projeto, tarefas e diagnóstico de Railway pertencem ao Agente 1 / Frente 1; commits na `main` podem disparar deploy automático, então este registro deve ser tratado como alteração documental com possível efeito de release.
- **Próxima ação/responsáveis:** Frente 1 reconcilia #85 com a base atual, lista conflitos por arquivo, publica novo HEAD e comprova CI nesse SHA; após revisão e autorização, integrar #85 e confirmar CI na `main`. Então Frente 2 atualiza #89 sobre a base integrada, preserva 0023, executa migration 0022 antes de 0023 e roda ambos os testes PostgreSQL no mesmo banco descartável. A revisão visual da cobrança PWA permanece um gate explícito.


## Rechecagem posterior das branches e handoff — 2026-10-25

- **Base atual confirmada:** `main` em `16c84eabba6a03b03743195a9a23033ddb49d860`. O status check publicado pelo Railway para esse commit está `success`; a consulta não encontrou workflow run do GitHub Actions associado a esse SHA. Não interpretar o check de deploy como CI de código.
- **Frente 1 / PR #85:** comparação atual de `main...work/frente-1-caixa-pagamentos` continua `diverged`, 60 commits à frente e 30 atrás; merge base `c611df4bb38d2b1512b9ec4e8ec2f49492faaf08`. CI #40201539020 é `success` somente para o HEAD antigo `dab9820a4e7cb70946d21c65695a72d25a5c7162`; não há evidência de CI em um HEAD reconciliado.
- **Frente 2 / PR #89:** comparação atual de `main...work/frente-2-responsavel-mesa-integrada` continua `diverged`, 21 commits à frente e 29 atrás; merge base `daf1b2aab6df6c656b18d27059cf03f766f80237`. CI #40201544526 é `success` somente para o HEAD antigo `4e828e074404682a0a5f5711747585955d69b310`; não há evidência de CI em um HEAD reconciliado.
- **Comunicação:** novas solicitações de status foram publicadas em [PR #85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85#issuecomment-6399345856) e [PR #89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89#issuecomment-6399346230). No momento da consulta, não havia resposta de confirmação dos responsáveis nem novo HEAD publicado.
- **Decisão:** não fazer merge nem force push. Frente 1 deve reconciliar #85 primeiro, preservar autorização transacional/hardening e informar conflitos por arquivo; depois executar CI no SHA reconciliado. Só após revisão e autorização, integrar #85. Em seguida, sincronizar #89 e executar migrations 0022 e 0023, nessa ordem, mais os dois testes de integração no mesmo PostgreSQL descartável.
- **Railway:** a responsabilidade continua exclusiva da Frente 1 / Agente 1. Como a atualização deste documento na `main` pode disparar deploy automático, o Agente 1 deve verificar e registrar o estado do deploy deste commit. Nenhuma alteração de configuração, secrets, banco ou produção foi feita nesta rechecagem.

### Nova solicitação do proprietário — fluxo de pedidos pelo garçom (2026-10-25)

O proprietário reportou uma melhoria na tela de mesas do atendimento PWA (captura enviada nesta conversa): ao tocar em qualquer mesa, apresentar imediatamente duas ações explícitas:
- **Novo pedido**: iniciar um novo pedido na sessão aberta da mesa.
- **Acrescentar itens ao pedido atual**: selecionar um pedido ativo da mesa e adicionar itens a ele, sem duplicar/criar uma comanda indevida.

**Regra de negócio obrigatória:** qualquer garçom autenticado pode adicionar itens à comanda da mesa, mesmo que não seja o garçom originalmente responsável pela entrega. O pedido/itens adicionados devem ser atribuídos ao garçom que efetivamente registrou esse novo pedido, e a fila de entrega deve continuar respeitando o responsável correspondente. Não transferir automaticamente a responsabilidade da mesa, não reatribuir pedidos existentes e não contornar autorização no backend.

Antes de implementar, revisar o contrato atual de criação/edição de pedido e a propriedade de sessão/garçom; definir se “acrescentar itens” cria um novo pedido associado à mesma sessão (preferível para preservar auditoria e atribuição individual) ou altera um pedido existente, documentando a escolha. Validar autorização do servidor para qualquer garçom ativo, histórico do autor, atualização de fila e compatibilidade com cozinha/bar. Incluir testes de API e UI para mesa sem pedido, mesa com um pedido e mesa com vários pedidos ativos, além de adicionar itens por garçom diferente do responsável atual.

Isso é uma solicitação nova, ainda não implementada nem validada. Não alterar produção/Railway como parte desta tarefa.


## Incidente operacional do caixa — acompanhamento pela Frente 1 (2026-10-25)

- **Sintoma reportado:** mesas 01 e 08 aparecem com pagamento integral (respectivamente R$ 129,00 e R$ 82,00), 100% pago e saldo zero, mas as sessões continuam listadas como abertas; mesa 04 aparece sem consumo e também aberta. O relato informa que recarregar a tela não corrige o estado persistido. Referência inicial: [comentário na PR #85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85#issuecomment-6399338851).
- **Responsável:** Frente 1 / Agente 1, que também responde por tarefas operacionais de Railway. Foi solicitado status em [PR #85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85#issuecomment-6399376860); a Frente 2 foi orientada a aguardar e não modificar produção em [PR #89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89#issuecomment-6399377254).
- **Passo seguro imediato:** preparar diagnóstico somente leitura para sessões candidatas e cruzar estado da sessão, pedidos ativos/entregues, totais, pagamentos e avisos PIX pendentes. Não presumir que saldo zero sozinho autoriza fechar uma sessão. Preservar todo o histórico.
- **Não autorizado:** nenhum `UPDATE`, migration manual, fechamento de sessão ou alteração de produção/Railway sem autorização explícita do proprietário. Nenhum reparo em produção foi executado por esta coordenação.
- **Testes exigidos na #85:** quitação integral/fechamento com pedidos pendentes e sem pedidos pendentes; sessão vazia sem pedidos ativos; regressões que provem que não há perda de histórico nem fechamento prematuro. Publicar SHA reconciliado e CI no SHA exato antes de pedir integração.
- **Bloqueio de integração inalterado:** #85 continua sendo a primeira dependência e deve ser reconciliada com `main`; só depois atualizar #89. Manter migration 0022 antes de 0023 e validar os dois testes PostgreSQL no mesmo banco descartável. CI verde nos SHAs antigos não valida esses passos.


## Nova demanda PWA do garçom — handoff para Frente 2 (2026-10-25)

- **Requisito recebido:** ao tocar numa mesa, oferecer ações explícitas **Novo pedido** e **Acrescentar itens ao pedido atual**, selecionando um pedido ativo quando houver vários. A solicitação original e o contrato de negócio estão registrados em [comentário do proprietário na PR #89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89#issuecomment-6399371882).
- **Contrato recomendado para revisão antes de implementar:** “Acrescentar itens” cria um novo pedido associado à mesma sessão, em vez de alterar pedido existente, para preservar autoria/auditoria individual. Qualquer garçom ativo pode registrar esse pedido mesmo que não seja o responsável original da mesa; o pedido e a fila devem identificar o garçom que realmente o registrou. Não transferir automaticamente a mesa, não reatribuir pedidos antigos e não contornar autorização no backend. Frente 2 deve confirmar/documentar a decisão após revisar os contratos existentes.
- **Testes exigidos:** API e UI para mesa sem pedidos ativos, com um pedido ativo e com vários; inclusão por garçom diferente do responsável da mesa; atribuição do novo pedido/fila ao autor correto; compatibilidade com cozinha/bar e preservação de histórico.
- **Handoff:** solicitação encaminhada à Frente 2 no [comentário da PR #89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89#issuecomment-6399383774). Implementação e validação ainda pendentes; respeitar a dependência de reconciliação/integracão validada da #85 antes de atualizar a #89. Nenhuma alteração de produção/Railway autorizada por esta demanda.
- **Estado das branches na última consulta:** #85 segue `diverged` (60 commits à frente/33 atrás); #89 segue `diverged` (21 à frente/32 atrás). Os CI antigos não validam heads reconciliados. A atualização deste documento na `main` pode disparar deploy; a Frente 1 deve verificar e registrar o estado do deploy, sem mudanças de produção sem autorização explícita.


## Rechecagem de coordenação e novo handoff — 2026-10-25 (snapshot da main `4b15ccb3f9d405f98de92dedb51c53c3456ca6fa`)

### Estado verificado
- PR [#85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85): aberta em draft, sem novo HEAD reconciliado. Branch `work/frente-1-caixa-pagamentos` comparada com `main` neste snapshot: `diverged`, 60 commits à frente / 33 atrás; merge-base `c611df4bb38d2b1512b9ec4e8ec2f49492faaf08`. O CI [#40201539020](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201539020) está `success` apenas no HEAD antigo `dab9820a4e7cb70946d21c65695a72d25a5c7162`; não é validação da reconciliação.
- PR [#89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89): aberta em draft, sem novo HEAD reconciliado. Branch `work/frente-2-responsavel-mesa-integrada` comparada com `main` neste snapshot: `diverged`, 21 commits à frente / 32 atrás; merge-base `daf1b2aab6df6c656b18d27059cf03f766f80237`. O CI [#40201544526](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201544526) está `success` apenas no HEAD antigo `4e828e074404682a0a5f5711747585955d69b310`.
- A comparação mostra sobreposição em `.github/workflows/ci.yml`, `README.md`, `server.js`, `tests/garcom-operacao-integrada.test.cjs` e neste documento. O workflow PostgreSQL deve ser combinado uma vez; rotas e verificações de autorização das duas frentes devem ser preservadas. Não foi confirmada uma causa de conflito textual específico só a partir do indicador de mergeabilidade.
- Não foi possível executar testes locais ou PostgreSQL conjunto nesta sessão por indisponibilidade de resolução de `github.com` no ambiente. Nenhum teste local é declarado.

### Comunicação realizada
- Em [#85 comentário 6399383046](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85#issuecomment-6399383046), a Frente 1 foi orientada a preservar a autorização transacional de pagamento pelo responsável atual da sessão, sem confundir autoria de pedido com responsabilidade financeira/da mesa. Também foi pedido status verificável da reconciliação e CI no novo SHA.
- Em [#89 comentário 6399381405](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89#issuecomment-6399381405), a Frente 2 recebeu proposta de contrato para a nova regra do proprietário: ações explícitas “Novo pedido” e “Acrescentar itens ao pedido atual”; por auditoria, acrescentar deve criar um novo pedido associado à mesma sessão, com autoria do garçom que o criou. Qualquer garçom ativo pode criar esse pedido sem transferir a mesa; listagem/fila/entrega precisam refletir a autoria sem reatribuir pedidos existentes. A proposta ainda precisa de implementação e testes.
- A nova regra exige rever a atual suposição de que somente o responsável da sessão pode criar/listar/entregar pedidos. O ajuste deve ser de backend e UI, não apenas visual. Validar sessões com zero, um e vários pedidos, autoria do criador, idempotência, estoque, fila cozinha/bar e autorização de entrega.
- O incidente de sessões pagas/zeradas ainda abertas permanece sob responsabilidade da Frente 1: diagnóstico somente leitura primeiro; nenhuma alteração em produção autorizada. A nova regra de pedidos não muda essa restrição.

### Próximas ações e limites
1. Frente 1: reconciliar #85 sem perder alterações, resolver os testes de fechamento/órfãos em banco descartável, publicar SHA novo e CI nesse SHA. Nenhum UPDATE, migration manual ou correção de estado em produção sem autorização explícita.
2. Só depois da integração validada/autorizada de #85, atualizar #89 para a base resultante, preservar migration 0023 depois de 0022 e implementar/testar o novo fluxo de pedidos no contrato acima.
3. Rodar os testes financeiros e de atendimento juntos no mesmo PostgreSQL descartável e exigir CI verde no HEAD combinado exato. Manter Web Push em segundo plano e testes reais Android/iOS como pendências separadas.
4. Nenhum merge, push de código nas branches de trabalho, alteração de Railway/secrets/banco de produção ou deploy manual foi executado por esta rechecagem. Como a atualização deste documento na `main` pode disparar deploy automático, a Frente 1 deve verificar e registrar o estado resultante do deploy.

## Implementação inicial — pedidos por qualquer garçom (2026-10-25)

- Implementação proposta nesta alteração da `main`: a PWA abre ações ao tocar numa mesa (“Novo pedido” / “Acrescentar itens ao pedido atual”), consulta pedidos com itens pendentes e permite selecionar pedido de referência para o complemento.
- O complemento é registrado como **novo pedido na mesma sessão**, com observação de referência ao pedido escolhido, para preservar a autoria do novo lançamento e a atribuição individual de entrega. Não altera pedido existente nem transfere a mesa.
- Backend previsto: novo GET `/api/garcom/:token/mesas/:numero/pedidos-ativos`; criação de pedido permite outro garçom ativo na sessão aberta e revalida o ID da sessão sob lock; autor do novo pedido continua sendo o garçom autenticado.
- PWA não chama assumir/transferir para sessão já atribuída a outro garçom. Cache do service worker incrementado para v11.
- Testes de regressão adicionados para a regra de autoria/mesa e a UX. Aguardando CI no commit exato; não declarei testes executados localmente nem PostgreSQL conjunto.
- O incidente de mesas pagas/zeradas presas no caixa permanece aberto e não é corrigido por esta alteração. Nenhuma escrita no banco de produção ou mudança de Railway/secrets foi realizada intencionalmente.


### Complemento da implementação de pedidos por garçom — autorização de entrega
- A fila de prontos foi restringida ao responsável pela sessão ou ao garçom registrado no próprio pedido; o endpoint de entrega também valida essa regra no servidor sob lock. Isso permite que um garçom entregue os pedidos que ele registrou em mesa de outro responsável, sem abrir a fila de todos os pedidos a qualquer funcionário.
- CI intermediário: run [#40206750514](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40206750514) success no commit `aef039d7923f8365a5bef2f17d9bc1fc908eecff`; run [#40206890432](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40206890432) falhou após a restrição de entrega por mocks de teste desatualizados. Os mocks foram corrigidos; CI final passou no commit `73e58fecd3606945200d36dff702a390dccaed8a` (run #40207170431).


### Ajuste de regressões após CI — 2026-10-25
- O CI do commit `a60df07b212f074618e158d010ab993be33b6a1e` falhou em dois mocks antigos de entrega que reconheciam somente `FROM pedidos WHERE id...`; a consulta agora trava pedido e sessão com JOIN para validar o responsável. Atualizando os mocks para o novo SQL e acrescentando o responsável às fixtures. O CI anterior do commit `aef039d7923f8365a5bef2f17d9bc1fc908eecff` foi success, mas precedia a restrição de autorização da entrega.


## Correção de quitação e cards órfãos do caixa — 2026-10-25
- `db/caixa.js`: após pagamento que quita exatamente o total entregue, o servidor verifica dentro da transação se não há pedidos não entregues nem avisos PIX pendentes; só então fecha a sessão e marca a mesa como livre. Se houver pendência, a sessão permanece aberta. Retry idempotente é consultado antes de rejeitar sessão fechada.
- A listagem do caixa deixa de exibir sessões sem pedidos/pagamentos/avisos e sessões integralmente quitadas sem pendências, sem escrever no banco durante GET. Isso limpa os cards antigos da visão do caixa, mas **não altera registros históricos já órfãos**; o fechamento automático se aplica ao fluxo de pagamento futuro.
- Regressão estática adicionada. Ainda é necessário teste funcional em PostgreSQL descartável e revisão do fluxo de quitação, antes de declarar pronto. Não foi executada correção de dados de produção.


## Frente 3 — auditoria independente de Web Push (2026-10-25)

- **Escopo desta rodada:** auditoria estática do PWA e definição do contrato de notificações em segundo plano, enquanto a Frente 1 reconcilia o caixa/pagamentos.
- **Evidência em `main`:** `public/garcom-pwa/app.js` consulta `Notification.permission` e exibe notificações locais pelo Service Worker; a interface informa corretamente que o push em segundo plano não está configurado. `public/garcom-pwa/sw.js` implementa cache/offline, mas não registra evento `push` nem `notificationclick`. Não foram encontrados `PushManager.subscribe()`, armazenamento de subscrições, endpoints de subscrição ou envio server-side em `server.js`. Portanto, Web Push com o PWA fechado permanece não implementado.
- **Coordenação:** a proposta de contrato foi registrada no comentário [PR #89, comentário 6399553851](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89#issuecomment-6399553851). Não alterei `server.js`, `package.json`, migrations, branches de código nem configuração de produção, para evitar sobreposição enquanto as PRs #85/#89 ainda estão sendo reconciliadas.
- **Contrato a fechar com a Frente 2:** subscrição vinculada ao ID do garçom autenticado; criar/remover/renovar com validação server-side; limpar endpoints expirados (404/410); enviar metadados mínimos; ao abrir a notificação, buscar o estado atual pela API autorizada; definir destinatário por regras finais de fila/entrega, inclusive após transferência e para pedidos registrados por outro garçom.
- **Testes de aceite necessários:** autorização e isolamento entre garçons; payload inválido; subscrição duplicada/renovada/removida; limpeza de endpoint expirado; deduplicação de eventos; transferência sem notificar responsável anterior indevidamente; pedido criado por garçom diferente do responsável; validação em Android/Chrome e iOS/Safari com app encerrado.
- **Limite:** esta rodada foi revisão estática e coordenação, não execução da suíte nem teste real de dispositivos. Não declarar Web Push concluído.
- **Próximo passo:** manter a Frente 3 no contrato/testes isolados enquanto #85/#89 resolvem os contratos compartilhados. Integrar backend de push somente depois de definir destinatários e evitar alterações concorrentes em `server.js`. Nenhuma configuração de Railway/secrets, migration ou dado de produção foi alterado.

## Frente 3 — handlers de Web Push em PR isolada (2026-10-25)

- **PR:** [#91 — handlers do Service Worker para Web Push](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/91).
- **Branch/HEAD:** `work/frente-3-web-push-sw`, `d2d5a07ed72bd3068c6f58cab348a7caf88ecc02`.
- **Escopo:** adicionados handlers `push` e `notificationclick` em `public/garcom-pwa/sw.js`; payload limitado a título/corpo/tag/URL, destino restrito à mesma origem e ao caminho `/garcom-pwa/`, clique reabre/foca a PWA. Adicionada cobertura estática em `tests/pwa-garcom-consent.test.cjs`.
- **CI:** GitHub Actions run [#407](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40207982331) terminou `SUCCESS` no HEAD exato `d2d5a07ed72bd3068c6f58cab348a7caf88ecc02`; typecheck, build, integridade de `dist/`, regressões e sintaxe passaram.
- **Limite importante:** esta PR prepara apenas o Service Worker. Não implementa `PushManager.subscribe()`, persistência de subscrições, endpoints autenticados nem envio server-side. Não foi validada em dispositivos Android/iOS com o app encerrado.
- **Coordenação:** nenhuma alteração em `server.js`, `package.json`, migrations, Railway, secrets ou dados de produção. A PR #91 não deve ser considerada Web Push completo; o backend depende do contrato de destinatários e autorização da Frente 2 e deve ser integrado depois de reduzir a concorrência com #85/#89.
- **Próximo passo:** revisão do diff e CI na PR #91; depois, fechar contrato de destinatário com a Frente 2 e implementar subscrição/envio backend numa etapa separada, com testes de autorização, endpoint expirado, deduplicação, transferência e testes reais em dispositivos.


## Frente 4 — desempenho e armazenamento de imagens do cardápio (2026-10-25)

- **Issue:** [#53 — tirar fotos em Base64 das respostas JSON](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/53).
- **PR documental:** [#93 — RFC de armazenamento de imagens](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/93), branch `work/frente-4-cardapio-imagens-rfc`, commit `0a6c68d7b589e2aa6b1bd5f23b063644477c85fc`. Draft, não integrado.
- **Diagnóstico confirmado na main:** `db/foto.js` otimiza para WebP até 960 px e 320 KiB, mas converte o resultado em data-URL Base64 para gravar em `produtos.foto_url`; `db/cardapio.js` devolve o valor completo no campo `fotoUrl`. O overhead estimado de Base64 é aproximadamente 4/3 do arquivo; não houve medição de payload de produção.
- **Entrega:** RFC em `docs/engineering/cardapio-image-storage-rfc.md` define opções de armazenamento durável, migração compatível, backfill idempotente/dry-run, medição por fixtures, rollback e critérios de aceite.
- **Bloqueio de implementação:** falta decisão/autorização do responsável sobre o destino de armazenamento durável. Não presumir fornecedor, não mover imagens para disco efêmero, não alterar secrets/Railway e não executar backfill em produção.
- **Validação:** mudança documental apenas; nenhum teste de aplicação foi executado e nenhuma medição real foi feita.
- **Próximo passo:** revisar a RFC e decidir o destino de armazenamento; após isso, implementar em branch separada com fixtures sintéticas, medição comparativa e compatibilidade com data-URLs/URLs/caminhos legados.
- **Nota operacional:** commits na `main`, inclusive documentação, podem disparar deploy automático. A Frente 1 / Agente 1 deve verificar e registrar o resultado do deploy deste commit; esta atualização não altera intencionalmente runtime, banco, secrets ou configuração.


## PR #90 — reconciliação final do tema da PWA do garçom (2026-10-25)

- A PR aplica o tema QR Admin à PWA `/garcom-pwa/` online/offline, preserva suporte offline, protege o contador de pedidos e incrementa o cache do Service Worker para `v12`.
- A branch foi reconstruída sobre a `main` mais recente para preservar os registros de coordenação posteriores e evitar ficar atrás de commits documentais concorrentes. As alterações funcionais continuam limitadas aos arquivos do PWA e ao teste de UX.
- **CI final:** GitHub Actions run [#414](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40208631293) terminou `SUCCESS` no HEAD reconciliado `206346ee15ee29387eed6cc4e311c5e150dea642`; typecheck, build, integridade de `dist/`, testes de regressão e sintaxe passaram. No HEAD anterior, a suíte ampliada reportou 48 testes aprovados.
- **Merge:** PR #90 integrada por squash em `main`, commit `b92daa9277e238c399664cf6569f9d4f3c0aa0c1` (2026-10-25 15:48:45Z).
- **Deploy inicial:** Railway deployment `9b7a5e0a-acb8-4ff3-a0cf-fe91cbdc0451` para o merge commit terminou `SUCCESS` em produção; serviço `lanchonete-qr-semi-final` reportado `Online`, uma réplica ativa e sem alertas/falhas recentes. Esta atualização documental também pode disparar novo deploy automático, que será verificado separadamente.
- Sem validação em navegador/dispositivo real, PostgreSQL ou Android/iOS nesta frente. Nenhuma alteração em banco de produção, secrets ou configuração manual do Railway.
- Web Push server-side, QR local e fluxos de caixa/cobrança das frentes #85/#89 continuam fora de escopo.


## Frente 5 — regressão de autorização de tokens de mesa (2026-10-25)

- **Issue:** [#1 — GET /api/mesas expõe tokens sem autenticação](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/1).
- **Achado atualizado na `main`:** a rota `GET /api/mesas` já executa `await exigirAcesso(req, 'admin')` antes de chamar `listMesas()` e serializar `token`. A issue parece estar desatualizada quanto à correção de runtime; ainda é útil garantir regressão automatizada para impedir remoção acidental da autorização.
- **PR:** [#94 — teste de autorização da rota de tokens](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/94), branch `work/frente-5-mesa-token-auth-regression`, HEAD `1dc18a1f876d0494c69e44ab0509fbee56a79977`. Draft, não integrado.
- **Mudanças:** novo `tests/security-mesa-token-route.test.cjs` verifica que a autorização precede a consulta/serialização dos tokens e que a rota administrativa fica depois do gate `/api/admin`; incluído em `test` e `test:regression`.
- **CI:** workflow [#416](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40208748752): typecheck, build, integridade de `dist/`, regressões e sintaxe do servidor/banco concluíram success nos passos observados; o job ainda estava finalizando limpeza na última consulta, portanto confirmar conclusão final antes de declarar CI completo.
- **Limitação:** teste estrutural estático; não substitui teste HTTP real com sessão sintética nem demonstra por si só 401 anônimo em runtime. Não foram usados dados/credenciais de produção; nenhum código de runtime, banco, Railway ou secret foi alterado.
- **Próxima ação:** confirmar conclusão final do CI e revisar se já existe cobertura dinâmica equivalente. Só então decidir se a issue #1 pode ser fechada.
- **Nota operacional:** este registro na `main` pode disparar deploy automático. Frente 1 / Agente 1 deve verificar e registrar o resultado do deploy associado a este commit documental; nenhuma alteração de produção foi solicitada por esta frente.


### Atualização de CI — Frente 5 (2026-10-25)
- GitHub Actions run [#416](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40208748752) terminou **SUCCESS** no HEAD exato da PR #94 `1dc18a1f876d0494c69e44ab0509fbee56a79977`; typecheck, build, integridade de `dist/`, regressões e sintaxe do servidor/banco passaram.
- A PR continua draft e não integrada. O teste é estrutural; não há evidência de teste HTTP anônimo real nem de teste com dados de produção.


## Frente 6 — health check read-only (2026-10-25)

- **Issue relacionada:** [#43 — health check read-only, smoke seguro e alertas operacionais](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/43).
- **PR #95 integrada:** [feat(health): add read-only process health check and smoke test](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/95), squash merge `09e52c6f1c5563eed0168f3ddd88eb555cd3da27`.
- **CI no HEAD exato da PR:** run [#417](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40208792045) terminou **SUCCESS**; typecheck, build, integridade de `dist/`, regressões e sintaxe do servidor/banco passaram.
- **Escopo entregue:** `GET /healthz` devolve somente `{ status: 'ok' }` e verifica liveness do processo HTTP; `npm run health:smoke` faz um único GET para uma URL explicitamente informada, restrita a caminho terminado em `/healthz`, com timeout e sem seguir redirects.
- **Limites:** endpoint não testa conexão/prontidão do PostgreSQL; smoke não foi executado contra produção e não há automação pós-deploy, alertas, canal/owner, nem correlação/redação de logs nesta PR. A issue #43 **permanece aberta** para as partes restantes. Nenhuma configuração Railway, secret, migration ou dado de produção foi alterado por esta frente.
- **Coordenação:** mensagens de handoff enviadas nas PRs #85 e #89 para confirmar estado e preservar a ordem de integração pagamentos/0022 antes da Frente 2/0023. Não inferir resposta dos agentes até confirmar nos comentários.
- **Deploy:** merge na `main` pode disparar deploy automático. Aguardar/verificar o estado associado ao commit antes de declarar disponibilidade do endpoint em produção.


## Sprint de destravamento — priorizar entregas pequenas e verificáveis (2026-10-25)

**Diretriz temporária para todos os agentes:** antes de avançar em frentes grandes ou com dependências cruzadas, fazer uma rodada curta de fechamento de itens simples. Objetivo: reduzir PRs/issues paradas, entregar melhorias pequenas com risco baixo e devolver capacidade à integração principal. Esta diretriz não autoriza merge automático nem flexibiliza os critérios de qualidade.

### Como escolher o próximo item
1. Consulte o estado atual no GitHub e este documento na `main`; não confie em snapshots antigos.
2. Priorize, nesta ordem:
   - PR pequena, isolada, sem conflito e com CI verde no HEAD atual, pronta para revisão/merge;
   - issue pequena cujo comportamento já esteja implementado e só falte evidência de teste ou documentação objetiva;
   - melhoria de teste/documentação com benefício claro e sem criar um segundo canal de coordenação;
   - só depois, tarefas novas de implementação.
3. Evite assumir tarefas que alterem os mesmos arquivos/contratos de outra frente ativa, sobretudo `server.js`, migrations, `package.json`, workflow de CI e PWA compartilhada, sem combinar antes com os responsáveis.
4. Não feche issue apenas porque existe uma PR relacionada: confirme que a PR foi integrada e que todos os critérios da issue foram atendidos. Quando uma PR corrigir uma issue, inclua `Closes #N` no corpo se for apropriado e só considere concluída após merge e validação.
5. Não transforme um teste estático em alegação de teste de runtime; diferencie teste unitário/estrutural, HTTP integrado, PostgreSQL descartável, CI, teste manual e dispositivo real.

### Critérios mínimos para concluir PR simples
- Diff pequeno, escopo único, sem segredo/dado sensível ou mudança operacional desnecessária.
- Branch atualizada com a base relevante; conflitos resolvidos sem descartar trabalho de outros agentes.
- CI concluído com sucesso no HEAD exato que será revisado/mesclado.
- Revisão rápida de segurança, autorização, acessibilidade e regressões aplicáveis.
- Descrição da PR e checklist de testes atualizados; riscos/limitações explícitos.
- Merge somente quando o agente responsável/revisor autorizado confirmar que está pronta. Após merge, verificar o estado da `main` e registrar SHA/CI; se o merge disparar deploy, a Frente 1 / Agente 1 verifica o deploy conforme as regras existentes.
- Fechar issue somente com evidência de que todos os critérios de aceite estão cumpridos; caso contrário, manter aberta e registrar o item residual.

### Divisão de trabalho e comunicação
- Cada agente deve responder no PR/issue que já está sob sua responsabilidade com: **(a)** estado atual verificado, **(b)** uma tarefa pequena que consegue fechar primeiro, **(c)** arquivos que tocará, **(d)** teste/evidência necessária, **(e)** dependências ou sobreposição com outra frente.
- Antes de editar, anunciar no canal canônico a tarefa escolhida e verificar se outro agente já está trabalhando nela. Não iniciar duas mudanças concorrentes no mesmo arquivo/issue.
- Ao terminar, publicar o SHA e o link do CI, informar se foi mergeado e o que ainda falta. Se bloqueado por requisito externo, escrever a pergunta objetiva e mudar para outro item independente, sem ficar aguardando indefinidamente.
- Trabalhar em lotes curtos: **um item pequeno concluído de ponta a ponta por vez**, depois escolher o próximo. Não abrir várias PRs de baixa qualidade só para aumentar a contagem.
- Não editar ou apagar PRs/branches de outro agente sem coordenação explícita.

### Guardrails que continuam obrigatórios
- A sequência financeira continua prioritária quando retomada: PR #85 / migration `0022` antes da Frente 2 / migration `0023`; exigir os testes integrados de ambas as migrations e de ambas as frentes no mesmo PostgreSQL descartável antes de considerar a integração concluída.
- Nenhuma alteração em Railway, secrets, migrations/dados de produção ou deploy manual sem autorização explícita. Mudanças em `main`, inclusive documentação, podem disparar deploy automático.
- Não fechar questões de segurança com base apenas em inspeção textual quando o critério exige comportamento HTTP real. Não declarar Web Push completo sem subscrição, persistência, envio e validação real necessários.
- Se o item for apenas documental ou de teste estrutural, registrar exatamente esse alcance, sem alegar correção funcional não demonstrada.

### Modelo de resposta para iniciar esta rodada
- **Item pequeno escolhido (PR/issue):**
- **Por que é seguro/independente:**
- **Arquivos e escopo:**
- **Critérios de aceite e testes:**
- **Sobreposição/dependências verificadas:**
- **Próxima atualização prevista:**

## Rodada de destravamento — GPT-6 (2026-10-25)

### Item revisado: proteção CSRF — issue #3 / PR #100
- **Estado atual verificado:** PR [#100](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/100) continua aberto em draft e não integrado. O CI #433 passou no commit de código `950f3123217bb88eb220539889e8aef171d20bba`; o CI #434 passou no HEAD documental anterior `033a2ecf9bfbc5b7ae4f5cd982d933bdae98aabd`. A branch recebeu uma atualização documental adicional, commit `9195b9c9270eb91d049a90c95f35935a66571663`; ainda não há CI confirmado para esse SHA.
- **Revisão:** a comparação atual indica branch divergente (12 commits à frente, 1 atrás) e o GitHub informa `mergeable=false`. O fallback CSRF para páginas legadas exige `Origin`/`Referer` presente e valida a origem; não foi demonstrado bypass, mas é necessário confirmar a compatibilidade das rotas mutáveis não cobertas pelo cliente HTTP central e testar o HEAD reconciliado.
- **Arquivos em escopo:** `db/auth.js`, `src/lib/api.ts`, chamadas `fetch` legadas, `tests/regressions.cjs`; `server.js` é compartilhado com as frentes ativas e não será alterado sem coordenação. Nenhuma alteração em Railway, secrets, banco ou produção foi feita. A issue #3 permanece aberta até merge e validação completa.

### Item independente pronto para revisão: RFC de retenção — issue #44 / PR #99
- **Estado atual verificado:** PR [#99](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/99) foi promovido de draft para pronto para revisão. O diff contém somente `docs/engineering/data-retention-rfc.md`; o CI #425 foi SUCCESS no HEAD `f171d00b6fed74f465cb646fd5330c62ba4463cf`. Após a atualização de estado, o GitHub retornou `mergeable=true`.
- **Revisão estática:** o documento corresponde ao comportamento observado em `db/purge.js`: corte exclusivo por data, apenas sessões fechadas, dry-run por padrão e exclusão conjunta de registros dependentes. Nenhuma rotina de purge ou consulta de produção foi executada.
- **Limite:** a RFC é uma proposta técnica, não uma política aprovada. Prazos de retenção, anonimização e requisitos contábeis continuam decisões do responsável; a issue #44 permanece aberta até que essas decisões e os critérios completos sejam atendidos.
- **Próxima ação operacional:** como commits na `main`, inclusive documentais, podem disparar deploy automático, Agente 1 / Frente 1 deve verificar e registrar o estado do deploy deste commit. Nenhuma alteração direta de Railway foi feita por esta frente.


### Atualização de estado — integração PR #99 (2026-10-25)
- **Integração concluída:** PR [#99](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/99) foi integrada por squash; commit resultante `6cc50d16b3dd68cbcf781a9b6576f8f0ff3a66e6`.
- **Evidência de CI:** workflow #425 SUCCESS no HEAD da PR `f171d00b6fed74f465cb646fd5330c62ba4463cf`; o escopo integrado é apenas `docs/engineering/data-retention-rfc.md`.
- **Issue #44:** continua aberta. A RFC não aprova prazos, não implementa automação e não autoriza executar purge; falta decisão do responsável sobre retenção, anonimização, obrigações contábeis, auditoria e backup/restauração.
- **Deploy:** merge em `main` pode disparar deploy automático. Agente 1 / Frente 1 é o responsável por verificar e registrar o estado do deploy; esta frente não alterou Railway, secrets ou produção.


### Revisão adicional CSRF — login e rotas legadas (2026-10-25)
- **PR:** [#100](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/100), issue [#3](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/3), ainda aberta em draft.
- **Achado:** `POST /api/login` não chama `verificarOrigemRequisicao` nem `verificarProtecaoCSRF`; o token só é emitido depois da autenticação. É necessário decidir e testar proteção pré-autenticação por Origin/Referer (incluindo origem externa e cabeçalhos ausentes), porque a issue pede cobertura do login.
- **Compatibilidade legada:** `public/admin.html`, `public/caixa.html`, `public/cozinha.html`, `public/bar.html` e `public/js/admin-cardapio.js` contêm mutações por `fetch` direto. O fallback de origem parece desenhado para cobri-las, mas os testes atuais exercitam a função isolada/assertions estruturais e não comprovam o comportamento HTTP de cada rota.
- **Coordenação:** revisão postada na PR #100 (comentário [#6400570554](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/100#issuecomment-6400570554)). A branch CSRF está 12 commits à frente e 4 atrás de `main`; não reconciliar `server.js` sem confirmar sobreposição com as frentes ativas. Nenhum bypass foi demonstrado, e nenhum código/produção foi alterado nesta revisão.
- **Critério para retomar:** obter confirmação de não sobreposição, tratar/justificar a proteção de login, acrescentar cobertura HTTP/rota suficiente, sincronizar com `main` e exigir CI verde no HEAD reconciliado antes de aprovar integração. Issue #3 permanece aberta.


### Revisão independente — logs HTTP / issue #72 (2026-10-25)
- **PRs em sobreposição:** [#82](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/82) e [#79](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/79) implementam sanitização semelhante em `server.js` e testes; não integrar ambas em paralelo. Recomendada consolidação numa única PR, preferencialmente #82, depois de sincronizar com a `main` atual.
- **Evidência de revisão:** CI #281 SUCCESS para o HEAD antigo da PR #82 (`dc14ad34a6716a19cae068a55098e9ca21e7e55a`). O helper de #82 descarta query string, redige segmentos de tokens em caminhos de garçom/mesa e UUIDs em detalhes de erro. A PR #79 só redige UUIDs do caminho em logs 4xx e não cobre do mesmo modo stacks/mensagens de erro.
- **Estado atual do problema:** `main` ainda registra `req.url` em `console.warn` e o objeto de erro em `console.error`; não considerar corrigido até integração e testes no HEAD atual. O CI verde não valida o HEAD reconciliado.
- **Limite operacional:** sanitização no código não altera access logs gerados pelo proxy Railway nem revoga tokens previamente expostos. A Frente 1 / Agente 1 é responsável por verificar permissões/retenção e avaliar rotação operacional, sem copiar tokens em issues/commits. Revisão registrada em [comentário da PR #82](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/82#issuecomment-6400637439) e handoff enviado à Frente 1 em [PR #85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85#issuecomment-6400638880).
- **Ações realizadas nesta frente:** apenas revisão estática, comentário de revisão e registro documental; nenhum código da aplicação foi alterado, nenhum log/token/ambiente de produção foi acessado e nenhuma ação de Railway foi executada.


### Ajuste UX de mesa — implementação em revisão na PR #89 (2026-10-25)
- **Responsável pela implementação:** Frente 2 / PR [#89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89), branch `work/frente-2-responsavel-mesa-integrada`.
- **Mudanças no HEAD `10168d8633bf29fff065b08d3a727de72c04af65`:** painel superior redundante removido; clique em cartão abre modal de detalhes; API de mesas expõe `pedidoClienteQr` com base em `pedidos.origem_pedido='cliente'` na sessão aberta; assumir só aparece para pedido QR sem responsável; transferir só para o responsável atual, com destino ativo. Corrigida declaração async do handler de transferência.
- **Testes adicionados:** `tests/pwa-garcom-ux.test.cjs` e `tests/garcom-responsavel-mesa.test.cjs`. **Validação:** não há execução de Actions/status retornada para o HEAD nesta consulta; não declarar CI verde até confirmar o run e seu SHA.
- **Estado:** em revisão, não integrado, sem validação em navegador/dispositivo real. PR #89 continua draft e dependente da migration 0022 da Frente 1 antes de 0023.
- **Handoff:** Frente 2 deve revisar os commits e executar CI/testes integrados em PostgreSQL 16 descartável. Frente 1 / Agente 1 deve verificar qualquer efeito de deploy se a mudança for integrada à `main`; nenhuma ação de Railway ou produção foi feita por esta atualização.

### Validação de cancelamento público + PostgreSQL descartável (2026-10-25)

- **Responsabilidade:** corrigir o cancelamento público da issue #75 e adicionar integração real em PostgreSQL descartável.
- **PR de consolidação atual:** [#104](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/104), reconstruída sobre o HEAD atual da `main` (`a0426e9ab3adf584ec9f06968626f33b1833f522`), que já inclui o registro mais recente da Frente 2 / PR #89. Substitui a #103, cuja base avançou depois dos checks.
- **Código:** `db/pedidos.js` remove o parâmetro indefinido e o filtro de garçom sem efeito na rota pública; a consulta continua limitada ao pedido da mesa indicada pelo token e à sessão aberta.
- **Cobertura:** `tests/postgres-integration.test.cjs` valida host/nome do banco/ambiente antes de consultar o banco, confirma PostgreSQL major 16 e verifica idempotência, estoque, cancelamento e restauração, entrega parcial, pagamentos e fechamento. O workflow provisiona PostgreSQL 16 por job, usa credenciais sintéticas e não requer secrets de produção.
- **Validação confirmada no HEAD `8cb756225e56e23e11dc11a8026538df02d905c9`:** CI #448 SUCCESS (https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40216153567) e PostgreSQL integration #26 SUCCESS (https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40216153516). O HEAD está sobre a main atual, com zero commits atrás e branch mergeável. Como este registro documental gera um novo commit, repetir os dois workflows no HEAD final antes de merge.
- **Limite operacional:** migrations são executadas apenas no PostgreSQL descartável provisionado pelo workflow; nenhuma alteração em Railway, secrets ou produção foi feita nesta frente. Merge autorizado pelo usuário somente depois de verificar checks no HEAD final e revisar o diff. Após o merge, a Frente 1 deve confirmar o resultado do deploy automático e fazer smoke test de saúde sem alterar dados de negócio.


## Handoff operacional para a Frente 1 — verificar deploy e smoke test (2026-10-25)

**Responsável exclusivo:** Agente 1 / Frente 1. A verificação de Railway pertence à Frente 1; os demais agentes não devem alterar o serviço nem executar ações operacionais paralelas.

Após o merge da PR [#104](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/104), o status de deploy reportado pelo Railway passou a **SUCCESS** para o commit `2949c7c517b1d0be3cbe601d884142e4a11f7aac`. Ainda falta confirmar a resposta HTTP pública por smoke test independente. **O domínio correto informado pelo responsável do projeto é https://qradminn.up.railway.app (dois “n” em “qradminn”); não usar o domínio antigo sem o segundo “n”.**

### Ações solicitadas à Frente 1
1. Conferir no Railway o serviço, o domínio atual, o commit implantado e o resultado do deploy, sem alterar configuração caso não seja necessário.
2. Executar um smoke test estritamente read-only para `GET https://qradminn.up.railway.app/healthz` (endpoint documentado em `server.js`/Frente 6). Esperar HTTP de sucesso e corpo esperado `{"status":"ok"}`; não seguir redirects ou testar rotas mutáveis.
3. Se a URL não resolver ou o endpoint não responder, diagnosticar pelo painel/logs do Railway e registrar o resultado observado. Não trocar domínio, variáveis, secrets, banco ou configuração para “tentar resolver” sem autorização explícita.
4. Atualizar este documento e a [issue #75](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/75) com timestamp, commit implantado, status do deploy, comando/URL de smoke test, status HTTP/corpo ou erro exato e links/evidências.
5. Manter a issue #75 aberta até o smoke test HTTP ser confirmado. Não executar migrations manuais, seed, testes mutáveis nem alterar dados de produção.

**Estado atual:** CI #449 e PostgreSQL integration #27 passaram no HEAD final da PR antes do merge; a PR #104 foi integrada. O status de deploy reportado pelo Railway está SUCCESS, mas a tentativa anterior de smoke test não conseguiu resolver o host no ambiente de execução. Isso não prova falha do serviço nem confirma saúde HTTP. A próxima ação é da Frente 1 conforme os passos acima.


## Revisão Frente 2 — PR #89 e compatibilidade Caixa (2026-10-25)

- **Responsável:** Agente 2 / Frente 2. Revisão estática registrada na conversa da [PR #89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89#issuecomment-6400882072). A PR continua draft e o GitHub reporta `mergeable=false`; não há status de Actions confirmado para o HEAD atual `10168d8633bf29fff065b08d3a727de72c04af65`.
- **Bloqueio funcional:** `assumirMesa()` ainda permite assumir sessão sem pedido QR por chamada direta, embora a UI esconda o botão. O teste PostgreSQL atual também assume uma sessão sem provar `origem_pedido='cliente'`. Exigir validação server-side e teste negativo sem mutação para mesa vazia.
- **Compatibilidade Caixa:** a branch da Frente 2 não contém o POST `/api/garcom/:token/sessoes/:sessaoId/pagamentos` da Frente 1; isso só deve ser resolvido após integrar/sincronizar a Frente 1, preservando o handler financeiro e a revalidação de responsabilidade dentro da transação.
- **Plano de validação:** aplicar migrations 0022 e 0023 em sequência num PostgreSQL 16 descartável e executar os testes financeiro e de atendimento no mesmo banco. Cobrir parcial/idempotência/auditoria de operador, sessão fechada, token inativo, autorização 403, corrida transferência × pagamento, fila após transferência, histórico de ator e fechamento pelo Caixa.
- **Escopo desta revisão:** apenas inspeção estática e comentário de revisão. Nenhum arquivo de runtime, migration, workflow compartilhado ou configuração de produção foi alterado; nenhum teste foi executado nesta revisão. Manter #89 em draft até corrigir a regra de assunção, sincronizar a base e obter CI verde no HEAD final.
- **Handoff operacional:** como este commit documental na `main` pode disparar deploy automático, Agente 1 / Frente 1 deve verificar e registrar o status de deploy conforme a regra exclusiva de Railway; Agente 2 não executou nem alterou Railway.


## Revisão técnica concreta — Frente 2 / PR #89 (2026-10-25)

**Base da revisão:** `main` lida em 2026-10-25; PR #89 HEAD `10168d8633bf29fff065b08d3a727de72c04af65`; PR #89 continua draft e GitHub informa `mergeable=false`. Revisão estática dos 16 arquivos alterados, incluindo patches de atendimento, garçons, pedidos, PWA, servidor, migration e testes. **Nenhum teste foi executado nesta revisão**: não há checkout/runtime PostgreSQL acessível nesta sessão; a tentativa anterior de clone/execução falhou por DNS. CI histórico #367 refere-se a outro SHA e não valida este HEAD.

### Bloqueios e mudanças precisas

1. **Bloqueador — regra de atribuição de mesa, `db/atendimento.js::assumirMesa()` (PR #89).** O handler ainda chama `getOuAbrirSessao()` antes de confirmar se existe pedido de origem cliente QR. `pedidoClienteQr` é apenas um campo de listagem/UI; não é autorização. Requisito: dentro da transação, depois de bloquear a mesa e antes de criar sessão/atribuir responsável, confirmar que existe pedido na sessão candidata com `pedidos.origem_pedido='cliente'`. Mesa vazia deve retornar 409 e não deixar sessão, responsável ou histórico novo. Não permitir que `transferir:true` contorne a regra. Atualizar `tests/postgres-waiter-integration.test.cjs`: hoje ele chama `assumirMesa(tokenA,...)` **antes** de inserir o pedido e cria pedido sem `origem_pedido='cliente'`; portanto não prova a regra QR e precisa criar a fixture de pedido cliente antes da assunção. Adicionar caso negativo de mesa vazia com verificação de ausência de mutações.

2. **Bloqueador de integração — conflito real em `server.js`.** A PR #89 remove `getFilaGarcom` do import e muda o GET `/api/garcom/:token/pedidos` para `listarPedidosProntosGarcom(token)`; também adiciona rotas de transferência, garçons ativos e resumo. A branch financeira da Frente 1 altera o mesmo `server.js` para adicionar POST `/api/garcom/:token/sessoes/:sessaoId/pagamentos`, validando token/garçom e chamando `registrarPagamento(sessaoId, body, garcom.nome, garcom.id)`. **Não integrar o server.js da #89 por substituição integral**: reconciliar os imports e manter ambos os conjuntos de rotas. O motor financeiro deve revalidar responsável atual dentro da transação/lock da sessão, não apenas no handler HTTP.

3. **Conflito real em `.github/workflows/ci.yml`.** Ambas as frentes mexem no job `verify` e no serviço PostgreSQL; #89 acrescenta migrations e o teste `postgres-waiter-integration`, #85 acrescenta `postgres-financial-integration`. Combinar em um único serviço/banco descartável, com `npm run db:migrate` executado uma vez e ordem numérica de migrations; depois executar **os dois** testes no mesmo job/banco. Na main atual não existe `db/migrations/0022_sessao_pagamentos_operador.sql`; ela está na branch da Frente 1. A 0023 também existe somente na branch #89. A combinação deve ter 0022 antes de 0023 e ser verificada do zero, não presumida pelos checks separados.

4. **Conflito real em `public/garcom-pwa/app.js` e `README.md`.** Ambas as frentes alteram a PWA/README. #89 adiciona transferência, resumo e fluxo de pagamento parcial; #85 altera o contrato/telas do Caixa e mapeadores relacionados. Fazer merge por hunks, mantendo o fluxo de pagamentos da PWA que chama a rota do garçom e a UX da transferência. Não reverter a confirmação explícita de pagamento/PIX manual, a chave idempotente persistida para retry nem o aviso de que PIX não fecha sessão automaticamente.

5. **Contrato financeiro em `db/caixa.js` + rota do garçom.** A 0022 da Frente 1 adiciona `operador_nome` em `sessao_pagamentos`; a rota de pagamento do garçom precisa passar o nome e ID obtidos do token, nunca aceitar operador do body. `registrarPagamento()` deve rejeitar não responsável (403) sem inserir pagamento e fazer a verificação após obter o lock de sessão. Cobrir corrida transferência × pagamento, idempotência/retry, pagamento parcial, saldo, fechamento e zero lançamentos em tentativa não autorizada.

6. **Transferência/auditoria — `db/atendimento.js::transferirMesa()` + migration 0023.** A regra de só responsável atual, destino ativo e inserção de origem/destino/ator parece estar no código da PR. A migration é aditiva e cria FK `alterado_por_id REFERENCES garcons(id) ON DELETE SET NULL` e índice; ainda precisa ser aplicada num banco limpo depois da 0022. Teste deve confirmar `alterado_por_id`, origem/destino, timestamp `alterado_em`, rejeição de destino inativo, tentativa de não responsável e preservação do status `concluido` dos pedidos durante a transferência.

7. **Filas e entrega — `db/pedidos.js::getFilaGarcom(garcomId)` e `db/garcons.js::entregarComoGarcom()`.** O filtro por sessão aberta e `garcom_responsavel_id` impede fila global; a entrega passa a bloquear sessão antes do pedido e confere responsável atual. Preservar esta ordem de lock ao reconciliar com Caixa/fechamento. Adicionar ou manter testes para sessão fechada, token inativo, antigo responsável (403), novo responsável, item parcial e pedido que muda de sessão. A auditoria de entrega por item continua fora do escopo; `garcom_entregou_id` representa o último entregador do pedido.

### Matriz mínima para o CI combinado

- Banco PostgreSQL 16 limpo: aplicar migrations 0019 → 0022 → 0023 na ordem do runner; executar o runner novamente para confirmar idempotência das migrations que prometem ser idempotentes.
- Assunção: pedido QR cliente já existente + mesa sem responsável → sucesso; mesa sem pedido QR → 409 e zero sessão/histórico/atribuição; sessão de outro responsável → 409; `transferir:true` não transfere.
- Transferência: responsável atual para destino ativo → sessão muda e histórico registra ator; destino inexistente/inativo e solicitante não responsável → rejeição sem alterações; pedido pronto passa da fila antiga para a nova sem mudar status.
- Entrega: antigo responsável → 403 sem alteração; novo responsável → entrega parcial/total autorizada; sessão fechada/token inativo → rejeição.
- Pagamento: responsável atual paga parcialmente e retry com mesma idempotency key não duplica; token de outro garçom / responsável antigo após transferência → 403 e zero registros; PIX exige confirmação explícita no banco/app e não fecha sessão; quitação pelo Caixa fecha a sessão e mantém auditoria do operador.
- Executar CI, testes de regressão, `tests/postgres-financial-integration.test.cjs` e `tests/postgres-waiter-integration.test.cjs` no mesmo PostgreSQL descartável; registrar os SHAs e URLs das execuções.

### Recomendação

**Não aprovar/retirar draft da #89 ainda.** Bloqueios: regra QR não garantida no backend e teste de integração não representa o fluxo QR; reconciliação de `server.js`, workflow e PWA com a Frente 1; migrations 0022+0023 e testes financeiros/atendimento ainda não validados juntos. A revisão atual é estática; não alego que os testes acima tenham sido executados. Nenhuma alteração foi feita em produção, Railway, secrets ou `main` nesta tarefa.

**Branch documental desta revisão:** `docs/revisao-frente2-pr89-20261025`. Abrir PR de documentação contra `main`; a main não foi atualizada diretamente.