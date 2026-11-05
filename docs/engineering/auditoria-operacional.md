# Autoria e trilha de auditoria das ações operacionais

**Issue relacionada:** [#48](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/48).  
**Revisado em:** 05/11/2026, após as entregas de autoria do cardápio e autoria financeira por identidade.

Este documento descreve onde o runtime atual persiste a autoria. A existência de eventos no banco não significa que exista uma tela administrativa para consultá-los.

## Matriz das operações

| Operação | Onde a autoria fica | Atomicidade / observação | Evidência principal |
|---|---|---|---|
| Pagamento lançado por funcionário (staff) | sessao_pagamentos.operador_id (FK para staff.id) e operador_nome como retrato histórico | Gravados no fluxo transacional do pagamento. O ID não é inferido a partir de nome ambíguo. | tests/postgres-pagamento-operador-id.test.cjs; tests/postgres-autoria-dispositivo-compartilhado.test.cjs |
| Pagamento por ator que não seja staff | Não recebe operador_id de staff; a identidade deve permanecer no modelo de ator/auditoria correspondente | Não converter ID de garçom em ID de staff: são tabelas e domínios distintos. | db/caixa.js (operadorIdDeStaff) |
| Fechamento de sessão | operador_nome no lançamento residual e auditoria_eventos (sessao_fechada), com totais, desconto/taxa e dados de autorização | Transação do fechamento. O operador e o gerente que autorizou podem ser identificados separadamente. | tests/postgres-gerente-autorizacao.test.cjs; tests/auditoria.test.cjs |
| Autorização de desconto/ajuste da taxa | auditoria_eventos (gerente_autorizacao_negada e evento de fechamento autorizado) | Reautenticação de conta admin exigida para desconto maior que zero ou ajuste da taxa padrão. | tests/postgres-gerente-autorizacao.test.cjs |
| Confirmação de aviso PIX | auditoria_eventos (pix_confirmado) com aviso, valor e operador | Gravado junto da atualização do aviso e do lançamento. A confirmação é manual, não bancária. | tests/auditoria.test.cjs |
| Cancelamento pelo cliente | auditoria_eventos (pedido_cancelado), ator cliente_mesa | Evento gravado na mesma transação da operação; cancelamento depende do estado e das regras do pedido. | tests/postgres-integration.test.cjs; tests/auditoria.test.cjs |
| Transferência/assunção de mesa | mesa_atendimento_historico e eventos de auditoria aplicáveis | Guarda responsável anterior/novo, ator e horário. | tests/postgres-waiter-integration.test.cjs |
| Pedido lançado por garçom | pedidos.garcom_registrou_id e origem_pedido | A autoria da entrega é registrada por item; pedidos.garcom_entregou_id representa apenas a última entrega do pedido. | tests/garcom-responsavel-mesa.test.cjs; tests/postgres-entregas-progressivas.test.cjs |
| Edição de pedido | auditoria_eventos (pedido_editado) e histórico de estado por item | Evento e substituição dos itens ocorrem na mesma transação. | tests/postgres-integration.test.cjs |
| Entrega progressiva por garçom | auditoria_eventos (entrega_assumida, itens_retirados, itens_entregues) e itens_pedido_historico | A trilha registra ator e horário por item. | tests/postgres-entregas-progressivas.test.cjs |
| Troca/redefinição de senha | staff_credencial_eventos | Registra ator e sessões revogadas, sem armazenar senha, hash ou token. | tests/postgres-password-change.test.cjs |
| Anonimização de histórico fechado | auditoria_eventos (historico_anonimizado) | Registra corte, contagens, operador e quantidade de contas/pagamentos preservados; não guarda nomes nem observações anonimizadas. | tests/postgres-purge-anonimiza.test.cjs; tests/auditoria.test.cjs |
| Criação/edição/remoção de produto | auditoria_eventos (produto_criado, produto_atualizado, produto_removido) | A autoria e o contexto da operação são gravados na mesma transação; edição inclui valores relevantes antes/depois. | tests/postgres-autoria-cardapio.test.cjs |
| Adicionais, reordenação e ingredientes removíveis | auditoria_eventos (adicional_criado, adicional_removido, produtos_reordenados, produto_removiveis_definidos) | As mutações de cardápio registram ator, alvo e contexto. | tests/postgres-autoria-cardapio.test.cjs |
| Categorias | auditoria_eventos (eventos de categoria já existentes) | A operação administrativa exige administrador ativo e registra autoria transacional. | db/admin.js; db/auditoria.js |
| Gestão administrativa de contas/garçons | Varia conforme a operação; não presumir cobertura integral de todos os campos/ações | Confirmar evento específico no código antes de afirmar auditoria completa do cadastro. | Consultar db/admin.js, db/atendimento.js e testes da operação |

## Pagamentos e identidade em dispositivo compartilhado

A migration 0038_pagamento_operador_id.sql acrescenta sessao_pagamentos.operador_id, com referência a staff(id) e ON DELETE SET NULL. O campo operador_nome permanece como retrato do nome no momento do lançamento.

O backfill histórico só associa um nome a uma conta quando existe **exatamente uma conta ativa** com aquele nome. Se houver homônimos ou ambiguidade, o ID permanece NULL; a documentação não deve apresentar essa associação como identidade comprovada.

A autoria por ID é aplicada quando o ator autenticado é uma conta staff resolvida no banco. O ID de um garçom pertence à tabela garcons e nunca deve ser gravado como staff.id. A autoria do garçom continua usando o tipo de ator garcom na trilha de auditoria.

O teste tests/postgres-autoria-dispositivo-compartilhado.test.cjs sobe o server.js real e valida o cenário do mesmo aparelho utilizado por dois funcionários: o primeiro autentica, registra parte do pagamento e encerra a sessão; o segundo autentica no mesmo dispositivo e registra o restante. O teste confere os IDs persistidos, a revogação da sessão anterior e a conciliação por identidade, inclusive após renomear a primeira conta.

## Mutações administrativas do cardápio

A cobertura que antes estava pendente foi ampliada. As rotas administrativas de produto, adicional, ordenação e ingredientes removíveis agora passam a identidade do funcionário e o request_id para as operações de banco. As mutações são protegidas por administrador ativo e registram eventos na mesma transação da escrita.

Eventos documentados:
- produto_criado;
- produto_atualizado, incluindo preço anterior e novo quando aplicável;
- produto_removido;
- adicional_criado e adicional_removido;
- produtos_reordenados;
- produto_removiveis_definidos.

A criação/edição de categoria também possui registro de autoria. Não estender essa afirmação automaticamente a toda ação de gestão de funcionários/garçons: valide cada operação específica antes de documentá-la como auditada.

## Tabela auditoria_eventos (migration 0025)

Campos principais: ator_tipo (staff/garcom/cliente_mesa/sistema), ator_id, ator_nome, acao, alvo_tipo, alvo_id, resultado (sucesso/negado/falha), contexto JSONB e request_id.

O módulo db/auditoria.js valida o contexto, limita textos/tamanho e remove chaves com nomes sensíveis (por exemplo, senha, token, hash, segredo, credencial, chave PIX e cookie). A gravação usa a conexão da transação chamadora. A trilha não deve conter credenciais ou segredos. A execução da anonimização também registra um evento historico_anonimizado na mesma transação, com contagens e evidência de preservação financeira.

## Limitações e pendências reais

1. **Consulta administrativa:** não há tela geral no painel para pesquisar a tabela auditoria_eventos. A persistência de eventos não equivale a uma interface de consulta.
2. **Retenção:** o prazo da trilha (24 meses) foi aprovado em 05/11/2026 e está em `data-policy-proposal.md` §3.1 e na seção 8 da Política de Privacidade. O que falta é o **processo de descarte** (quem executa, com qual evidência) e a validação contábil/jurídica dos prazos.
3. **Cobertura por operação:** nem toda mutação administrativa deve ser presumida auditada. Verifique a função/rota e seu teste antes de ampliar a matriz.
4. **Anonimização de histórico:** a rotina atual remove nomes e campos livres do cliente, mas preserva os registros financeiros e de autoria; veja a política de dados para escopo, corte e limites.
4. **Contas e dispositivos:** a atribuição por identidade depende de cada funcionário utilizar sua própria conta. Compartilhar a mesma credencial impede distinguir pessoas, mesmo que o dispositivo seja compartilhado.

## Como validar

Em banco PostgreSQL descartável com nome contendo test, NODE_ENV=test e DATABASE_URL local/de CI:

~~~bash
node --test tests/postgres-pagamento-operador-id.test.cjs
node --test tests/postgres-autoria-dispositivo-compartilhado.test.cjs
node --test tests/postgres-autoria-cardapio.test.cjs
node --test tests/postgres-gerente-autorizacao.test.cjs
~~~

As suítes PostgreSQL são separadas de npm test e não devem apontar para produção.

## Histórico de decisão

A exigência de reautenticação do gerente para desconto/ajuste de taxa foi implementada e testada. As entregas de autoria financeira por identidade e de autoria das mutações de cardápio foram integradas em 05/11/2026. A issue #48 pode continuar aberta para acompanhar pendências de cobertura, consulta e retenção; não descreva toda a trilha como concluída enquanto esses pontos existirem.
