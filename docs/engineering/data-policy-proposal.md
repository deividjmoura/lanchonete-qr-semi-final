# Proposta de política de dados pessoais e retenção

**Issue:** [#44](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/44).  
**Status:** inventário técnico e decisões pendentes. **Não é política aprovada nem parecer jurídico.**

Este documento descreve o que o código e as migrations versionadas mostram. Não presume que todas as migrations estejam aplicadas em todos os ambientes, nem que um prazo legal específico se aplique ao estabelecimento. Prazos só devem ser definidos pelo responsável com validação contábil/jurídica.

## 1. Inventário de dados identificáveis e credenciais

| Dado/categoria | Onde aparece | Uso observado | Observações |
|---|---|---|---|
| Nome do cliente | `mesa_sessoes.cliente_nome`, `pedidos.cliente_nome`, `pix_avisos.cliente_nome` | Identificação da comanda e do aviso de PIX | Campo livre; pode ser apelido ou conter informação adicional inserida pelo cliente. |
| Texto livre do pedido | `pedidos.observacao_geral`, `itens_pedido.observacao` | Instruções de preparo/atendimento | Pode conter dado pessoal não solicitado. Não tratar como campo necessariamente anônimo. |
| Identificação de funcionário | `staff.nome/login/email`, `garcons.nome`, autoria em pedidos e eventos | Login, atendimento, atribuição e auditoria | A migration OAuth adiciona e-mail e identificador Google (`google_sub`) à conta staff. |
| Credenciais e identificadores de sessão | `staff.senha_hash`, `staff_sessoes.token`, tokens de mesa/garçom | Autenticação e autorização | Hash de senha e tokens são dados de segurança. Nunca devem entrar em logs, relatórios ou exportações comuns. |
| Autoria operacional | `pedidos.garcom_registrou_id`, `garcom_entregou_id`, `mesa_atendimento_historico`, `auditoria_eventos` | Rastreabilidade de ações e atendimento | A trilha pode identificar funcionário e associar pessoa a horário/ação. |
| Auditoria de credenciais | `staff_credencial_eventos` | Registrar troca/redefinição, ator e sessões revogadas | Schema proíbe guardar senha, hash, token ou IP nesses eventos. |
| Dados financeiros | `mesa_sessoes`, `sessao_pagamentos`, avisos PIX e comprovantes | Cobrança, conciliação e comprovantes | Valores, forma, horários, operador e vínculos com sessão. Necessidade/prazo de guarda deve ser validado com contador. |
| Dados de produto e estoque | `produtos`, fotos, categorias, estoque e movimentos | Operação do cardápio/estoque | Fotos podem conter data URL/Base64 no armazenamento legado; não são automaticamente parte do histórico de uma sessão. |
| Logs técnicos | logs da aplicação e do provedor/proxy | Diagnóstico e segurança | Retenção, acesso e campos efetivamente registrados no provedor ainda precisam ser confirmados. |

Não foi identificado no fluxo público de pedido um cadastro que exija CPF, telefone ou endereço do cliente. Isso não permite afirmar que esses dados nunca apareçam: campos livres podem recebê-los voluntariamente.

## 2. Relações que afetam exclusão

A rotina `db/purge.js` remove, em transação, sessões fechadas anteriores à data de corte e seus pedidos, itens, adicionais/removíveis e pagamentos parciais. A data é exclusiva: `fechada_em::date < before`. Sem `confirm: true`, a execução é dry-run.

As migrations também definem relações relevantes:

- `pix_avisos.sessao_id` referencia `mesa_sessoes` com `ON DELETE CASCADE`; excluir a sessão também exclui avisos PIX. `pedido_id` usa `ON DELETE SET NULL`.
- `mesa_atendimento_historico.sessao_id` usa `ON DELETE CASCADE`; o histórico de transferências daquela sessão também é excluído com o purge.
- `pedidos` e `itens_pedido` têm relações dependentes; o purge remove explicitamente itens e pedidos antes da sessão.
- `auditoria_eventos` e `staff_credencial_eventos` são trilhas separadas, sem vínculo de cascata com a sessão; não são removidas pelo purge atual.
- `staff_sessoes` também não faz parte do purge histórico atual.
- Fotos de produtos, dados do cardápio e estoque não são removidos pelo purge de sessões.

Portanto, o purge atual não é uma anonimização: ele apaga registros operacionais e financeiros vinculados à sessão, além de avisos PIX e histórico de atendimento em cascata. Também não implementa retenção específica para auditoria, credenciais, logs ou fotos.

## 3. Matriz de decisões de retenção (sem prazos presumidos)

| Classe | Decisão necessária | Consequência técnica |
|---|---|---|
| Sessões, pedidos, itens e pagamentos | Prazo mínimo para operação, conciliação, obrigações contábeis/fiscais e disputas | Manter o conjunto consistente; rever o escopo do purge após aprovação. |
| Nome e observações livres do cliente | Necessidade de manter após o atendimento; possibilidade de anonimização e exceções | Job de anonimização separado, com testes de integridade e sem alterar valores financeiros. Não implementado. |
| Avisos PIX | Se devem acompanhar a sessão ou ser preservados como evidência por prazo próprio | Hoje são excluídos em cascata com a sessão. |
| Histórico de atendimento e autoria | Se deve sobreviver ao purge operacional e por quanto tempo | Hoje o histórico da sessão é excluído em cascata; eventos de auditoria independentes permanecem. |
| Eventos de auditoria/credenciais | Prazo de investigação, acesso e descarte | Política e rotina próprias; não incluídos no purge atual. |
| Sessões de login e tokens | Expiração, revogação e descarte de registros expirados | Processo de limpeza próprio, separado de dados financeiros. |
| E-mail/identificador Google de staff | Finalidade, acesso, correção e descarte após desligamento | Ciclo de vida ligado à conta de funcionário, não ao purge de pedidos. |
| Fotos de cardápio | Prazo após substituição/arquivamento de produto e tratamento de backups | Retenção separada; verificar referências antes de excluir arquivos/objetos. |
| Logs de aplicação/proxy | Prazo, responsáveis, acesso e campos coletados pelo provedor | Confirmar configuração real do provedor; não presumir retenção disponível. |

## 4. Controles antes de qualquer exclusão

1. Aprovação escrita do responsável para cada classe de dado e prazo.
2. Validação contábil/jurídica das obrigações e da base legal aplicável.
3. Backup com restauração comprovada em ambiente isolado antes de exclusão definitiva.
4. Dry-run com data de corte e contagens, revisado por pessoa autorizada.
5. Execução transacional, idempotente e protegida contra concorrência.
6. Registro da execução com corte, contagens, operador e resultado, sem copiar nomes, observações, tokens ou segredos.
7. Testes PostgreSQL descartáveis provando que sessões abertas e registros fora do corte não são removidos.
8. Plano de recuperação: depois do commit, rollback SQL não recupera dados apagados; a restauração depende de backup.

O endpoint atual exige papel admin e opera em dry-run por padrão. Isso reduz risco operacional, mas não substitui aprovação de retenção nem backup restaurável.

## 5. Atendimento a solicitações de titulares

O procedimento precisa ser definido pelo responsável. Como ponto de partida operacional, a solicitação deve ser registrada sem duplicar o dado pessoal; a localização deve ocorrer por consulta somente leitura; e qualquer anonimização/exclusão deve respeitar a necessidade de preservar registros financeiros ou de auditoria quando houver fundamento aplicável. Não se deve prometer exclusão imediata sem avaliar vínculos, obrigações e direitos envolvidos.

## 6. Decisões pendentes do responsável

- [ ] Confirmar as finalidades e os campos que realmente precisam ser coletados no atendimento.
- [ ] Aprovar prazos por classe, após validação contábil/jurídica.
- [ ] Decidir se nomes/observações podem ser anonimizados antes do purge financeiro.
- [ ] Decidir se avisos PIX e histórico de transferência devem sobreviver à exclusão da sessão.
- [ ] Definir retenção e acesso às trilhas `auditoria_eventos` e `staff_credencial_eventos`.
- [ ] Definir ciclo de vida de contas de staff, e-mails e vínculos Google após desligamento.
- [ ] Confirmar a retenção real de logs no provedor e quem pode acessá-los.
- [ ] Definir descarte de fotos e backups de fotos quando produtos forem arquivados/removidos.
- [ ] Definir quem aprova e quem revisa a execução do purge.

**Até essas decisões serem registradas, não habilitar purge automático, anonimização automática nem exclusão de fotos.** O comportamento atual permanece manual; esta atualização não altera runtime, schema, migrations, banco ou produção.

## 7. Fontes técnicas consultadas

`db/purge.js`; migrations `0001`, `0009`, `0016`, `0019`, `0023`, `0024`, `0025`, `0028` e `0034`; módulos `db/auth.js`, `db/caixa.js`, `db/pix-cliente.js`, `db/auditoria.js` e `db/foto.js`. O inventário descreve o repositório, não uma inspeção do banco de produção.
