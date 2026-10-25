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

Esta seção substitui os snapshots anteriores de status. CI verde se aplica ao commit exato informado; não significa integração ou deploy.

### Frente 1 — caixa/pagamentos/PIX/comprovantes
- **Estado:** PR [#85](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85) aberto em draft, não integrado. O commit de código validado é `955523a5c3f72aba2981dc430e1291258666bf41`; a branch recebeu depois apenas commits documentais para sincronizar este canal.
- **Contrato:** migration `0022_sessao_pagamentos_operador.sql`; cobrança parcial e quitação pelo motor financeiro do Caixa; comprovante detalhado e operador auditado. A rota de pagamento do garçom passa o ID autenticado e revalida a responsabilidade atual dentro da transação/lock da sessão para fechar a janela TOCTOU com transferência.
- **Evidência:** CI #366 **SUCCESS** no commit de código indicado. Inclui migration em PostgreSQL 16 limpo e teste financeiro real: pagamento parcial, idempotência, sobrecobrança, quitação/fechamento, auditoria do operador e 403 sem lançamento quando o garçom não é responsável.
- **Limitação:** a UI integrada precisa ser revisada junto com a Frente 2; não há validação visual em dispositivo real.

### Frente 2 — responsável por mesa/transferência e integração PWA
- **Estado:** PR antigo #86 fechado sem merge; PR [#89](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89) aberto em draft, não integrado. O commit de código validado é `80a9e20a09356a60a35e302a4b3a2703a0d71a6c`; a branch recebeu depois apenas commits documentais para sincronizar este canal.
- **Contrato:** migration `0023_atendimento_transferencia_actor.sql`; início de atendimento, transferência auditada, fila de prontos filtrada por responsável e entrega autorizada no servidor.
- **Cobrança no PWA:** `GET /api/garcom/:token/sessoes/:sessaoId/resumo-pagamento` devolve total entregue, total pago e saldo somente ao responsável atual. A aba Cobrança chama `POST /api/garcom/:token/sessoes/:sessaoId/pagamentos` da Frente 1, registra recebimentos parciais com chave idempotente persistida para retry e exige confirmação explícita. Para PIX, o garçom precisa conferir o crédito no app bancário; a tela não gera QR nem confirma liquidação automaticamente. O fechamento final continua no Caixa.
- **Evidência:** CI #367 **SUCCESS** no commit de código indicado. Inclui migration em PostgreSQL 16 limpo, transferência e histórico de ator/origem/destino, fila filtrada, bloqueio 403 ao antigo responsável, entrega pelo novo responsável e resumo de cobrança autorizado.
- **Limitação:** validação visual em navegador/dispositivos reais continua pendente.

### Frente 3 — PWA/consentimento de notificações
- **Estado:** PR #84 integrado à `main` no merge commit `daf1b2aab6df6c656b18d27059cf03f766f80237`. PR [#88](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/88) continua aberto em draft.
- **Evidência:** CI #330 foi reportado como success no head `3aefd704273eead3ab551d5dfc905440ecb2e31d`; confirmar novamente antes de depender de um head diferente.
- **Limitação:** instalação e consentimento não significam Web Push em segundo plano funcional. Subscrição persistida/envio server-side e validação Android/iOS continuam pendentes.

### Dependências e plano de integração
- A sequência de migrations é `0022_sessao_pagamentos_operador.sql` (Frente 1) seguida de `0023_atendimento_transferencia_actor.sql` (Frente 2). Cada branch validou sua migration isoladamente em PostgreSQL 16 limpo; o CI após integração deve executar ambas as migrations e os dois testes funcionais no mesmo banco descartável.
- PRs #85 e #89 compartilham `server.js`, `README.md`, `tests/garcom-operacao-integrada.test.cjs`, `.github/workflows/ci.yml` e este documento. A sequência proposta é PR #85 primeiro e PR #89 depois; revisar o diff combinado, atualizar a base do PR #89 após o primeiro merge e confirmar CI conjunto.
- Ambos os PRs continuam draft e não foram mesclados nem implantados. O estado de mergeabilidade precisa ser reconsultado após sincronizar as branches com a versão atual deste documento.
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
