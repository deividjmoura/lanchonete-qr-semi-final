# RFC — inventário de dados e política de retenção

**Status:** proposta para decisão do responsável; não é política aprovada.  
**Issue:** [#44 — dados pessoais, retenção e purge](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/44)  
**Escopo:** inspeção estática do código/schema e proposta operacional. Nenhum dado de produção foi consultado ou alterado.

## Resumo

O sistema persiste dados operacionais de mesas, sessões, pedidos, personalizações, pagamentos e funcionários. Existe uma rotina manual de purge para sessões fechadas, mas ela apaga também pedidos, itens e pagamentos relacionados, removendo esses registros de relatórios e dashboards. Não encontrei, na superfície revisada, uma política aprovada de retenção nem um agendamento automático do purge.

**Recomendação imediata:** não automatizar nem executar o purge até o responsável decidir os prazos por classe de dado, as necessidades de conciliação/contabilidade, a retenção de trilhas de auditoria e o processo de backup/restauração. A aplicação pode continuar operando sem introduzir uma exclusão automática irreversível.

## Inventário técnico observado

| Classe | Exemplos/campos observados | Uso operacional | Observações de retenção |
|---|---|---|---|
| Credenciais de mesa | `mesas.token` (UUID usado na URL pública do QR) | Vincular o cliente à mesa | Tratar como credencial, não como dado analítico. Revogação/rotação deve ser processo separado do purge histórico. |
| Cardápio | Nome/descrição/preço, disponibilidade, adicionais, removíveis e `produtos.foto_url` | Exibir e preparar pedidos | Fotos podem conter bytes em data URL/Base64 segundo `db/foto.js`; não são registros de pedidos antigos. |
| Sessões de mesa | `mesa_sessoes`: horários, estado, nome do cliente, totais e forma de pagamento | Agrupar pedidos e fechar a comanda | A rotina atual só seleciona sessões com `status='fechada'` e `fechada_em::date < before`. |
| Pedidos e itens | Estado, horário, nome do cliente, observação geral, produto, quantidade, preço unitário snapshot, ponto da carne e observação do item | Preparação, entrega, cálculo de valores e atendimento a disputas | Observações e nomes podem conter dados pessoais escritos livremente; evitar retenção indefinida sem necessidade documentada. |
| Personalizações | Adicionais e ingredientes removidos | Preparação correta e composição do preço | São dependentes de itens de pedido e removidos pelo purge atual. |
| Pagamentos | `sessao_pagamentos`: valor, forma, horário e vínculo com sessão; outros campos podem depender das migrations instaladas | Conciliação, divisão de conta e fechamento | Apagar pode afetar relatórios, prova de pagamento e conciliação. Confirmar obrigações aplicáveis com o responsável contábil antes de definir prazo. |
| Funcionários e atendimento | Logins/sessões de staff, tokens de garçom e dados de atribuição/transferência existentes no schema ativo | Autorização e responsabilização operacional | Não apagar junto com o histórico de pedidos sem analisar chaves, auditoria e necessidades de segurança. |
| Logs e telemetria | Caminhos HTTP e erros gerados pela aplicação/proxy | Diagnóstico e segurança | Tokens em URLs podem acabar em logs do proxy fora do controle da aplicação; retenção e acesso do provedor exigem trilha operacional separada. |

Fontes principais da inspeção: `db/migrations/0001_init.sql`, `db/migrations/0009_sessao_pagamentos.sql`, `db/pedidos.js`, `db/caixa.js`, `db/purge.js` e o fluxo de autenticação. Este inventário não afirma que cada migration posterior esteja aplicada em todos os ambientes; o schema ativo precisa ser confirmado antes de uma operação de manutenção.

## Comportamento atual do purge

Arquivo: `db/purge.js`, função `purgeHistorico({ before, confirm, dryRun })`.

- `before` deve ser uma data `YYYY-MM-DD`; o corte é **exclusivo**: somente sessões fechadas com `fechada_em::date < before`.
- Sem `confirm: true`, a função executa dry-run e informa contagens de sessões, pedidos, itens e pagamentos.
- Com confirmação, remove adicionais/removíveis, itens, pedidos, pagamentos parciais e sessões elegíveis dentro de uma transação.
- O comentário e a mensagem de retorno deixam explícito que os dados somem de relatórios/dashboards. Portanto, não é apenas uma limpeza de cache.
- A rotina não deve ser interpretada como política de retenção aprovada. A existência de dry-run não substitui aprovação, backup verificado, revisão do impacto e registro de execução.
- Não foi executado `purgeHistorico`, nem consultado ou alterado banco real nesta tarefa.

## Proposta para decisão

Não fixar prazos arbitrários neste RFC. O responsável deve aprovar uma matriz explícita antes de qualquer agendamento:

| Classe | Decisão necessária | Proposta de controle |
|---|---|---|
| Sessões, pedidos, itens e pagamentos | Prazo mínimo para operação, conciliação, disputas e obrigações fiscais/contábeis | Manter o conjunto consistente; só purgar após o prazo aprovado e com relatório de prévia |
| Nome e observações livres do cliente | Se são necessários após a conclusão do atendimento | Minimização: evitar coletar campos não necessários e definir prazo próprio se puderem ser separados sem quebrar a operação |
| Tokens de mesa/garçom | Revogação após comprometimento, troca ou encerramento do vínculo | Ciclo de vida de credenciais separado da retenção financeira |
| Sessões de autenticação e logs | Prazo de diagnóstico, investigação e segurança | Restringir acesso; nunca registrar senha, token bearer ou URL completa que carregue credencial nos logs da aplicação |
| Histórico de transferência/autoria | Prazo de auditoria e acesso autorizado | Não apagar implicitamente ao purgar pedidos; definir retenção e chaves estrangeiras explicitamente |
| Fotos do cardápio | Prazo após substituição/exclusão de produto e cópias de segurança | Retenção separada dos pedidos; verificar referências antes de excluir objetos/imagens |

### Requisitos antes de automatizar

1. Aprovação escrita dos prazos por classe e de quem pode autorizar uma exclusão.
2. Backup antes da operação e evidência de restauração testada em ambiente isolado.
3. Dry-run com contagens e data de corte, revisão humana e registro do aprovador.
4. Transação consistente, idempotência do job e proteção contra execução concorrente.
5. Relatório de resultado sem nomes, tokens, URLs com credenciais ou conteúdo de observações.
6. Testes PostgreSQL descartáveis provando que sessões abertas e registros fora do corte nunca são apagados, e que os registros dependentes são tratados de forma consistente.
7. Definição de como preservar os documentos/registros financeiros que precisem sobreviver à exclusão dos dados operacionais, sem duplicar dados pessoais desnecessariamente.
8. Plano de rollback realista: exclusão confirmada não pode ser revertida apenas por rollback SQL após commit; a recuperação depende de backup/restauração.

## Decisões em aberto para o responsável

- Qual prazo aprovado para sessões/pedidos/pagamentos fechados, considerando as necessidades contábeis e de defesa de disputas?
- Nomes e observações do cliente precisam ser mantidos por todo esse prazo, ou podem ser minimizados/anonimizados antes?
- Qual prazo para logs de aplicação/proxy e quem pode acessá-los?
- Histórico de transferência e autoria deve sobreviver ao purge dos pedidos? Por quanto tempo?
- Quem aprova a execução e qual evidência de backup/restauração será obrigatória?
- A instalação é de um único estabelecimento; qualquer futura reutilização para outro estabelecimento exige revisar isolamento e retenção antes de ativar.

## Limites e próximos passos

- Esta RFC é um inventário técnico e uma lista de decisões, não aconselhamento jurídico nem política de privacidade final.
- Nenhuma alteração de runtime, schema, migration, agendamento, banco, segredo, Railway ou produção foi feita.
- Nenhum teste de aplicação foi necessário para produzir este documento; o comportamento descrito foi inspecionado estaticamente.
- Após decisão do responsável, uma implementação separada pode adicionar testes para o purge e uma rotina operacional aprovada. Não criar cron/automação antes dessa decisão.
