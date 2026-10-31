# Autoria e trilha de auditoria das ações operacionais

**Issue relacionada:** [#48](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/48).

## Matriz das operações críticas

| Operação | Onde a autoria fica hoje | Transação atômica | Evidência/teste |
|---|---|---|---|
| Pagamento parcial (caixa e garçom) | `sessao_pagamentos.operador_nome` (migration 0022) + comprovante | Sim, dentro da transação do pagamento com lock da sessão | `tests/postgres-financial-integration.test.cjs` |
| Fechamento de sessão | `operador_nome` no lançamento residual **e** `auditoria_eventos` (`sessao_fechada`) com totais/desconto/taxa | Sim | `tests/postgres-integration.test.cjs`, `tests/auditoria.test.cjs` |
| Confirmação de aviso PIX | `auditoria_eventos` (`pix_confirmado`) com aviso, valor e operador | Sim, junto do `UPDATE` do aviso e do lançamento | `tests/auditoria.test.cjs` (estrutural) |
| Cancelamento pelo cliente | `auditoria_eventos` (`pedido_cancelado`) gravado **antes** dos `DELETE`s, com número da mesa e motivo opcional; ator `cliente_mesa` (token da mesa) | Sim — se a exclusão falha, o evento desfaz junto | `tests/postgres-integration.test.cjs`, `tests/auditoria.test.cjs` |
| Transferência/assunção de mesa | `mesa_atendimento_historico` com `alterado_por_id`, anterior e novo (migrations 0019/0023) | Sim | `tests/postgres-waiter-integration.test.cjs` |
| Pedido lançado por garçom | `pedidos.garcom_registrou_id` e `origem_pedido`; entrega em `garcom_entregou_id` (0019) | Sim | `tests/garcom-responsavel-mesa.test.cjs` |
| Troca de senha | `staff_credencial_eventos` (sem segredos) + nº de sessões revogadas (0024) | Sim | `tests/postgres-password-change.test.cjs` |
| Ações de cardápio/categorias/garçons (admin) | Autenticadas por sessão staff; ainda **sem** evento dedicado na tabela de auditoria | — | Pendência listada abaixo |

## Tabela `auditoria_eventos` (migration 0025)

Colunas: `ator_tipo` (`staff`/`garcom`/`cliente_mesa`/`sistema`), `ator_id`,
`ator_nome`, `acao`, `alvo_tipo`, `alvo_id`, `resultado`
(`sucesso`/`negado`/`falha`), `contexto` JSONB mínimo e `request_id`
(correlação com os logs do `X-Request-Id`, issue #43).

O módulo `db/auditoria.js` remove chaves com nome sensível (senha, token,
hash, segredo, credencial, chave PIX, cookie), limita textos e o tamanho do
contexto, e só grava pela conexão da transação chamadora. Nada de segredo é
persistido; um teste hermético trava esse contrato.

## O que ainda depende de decisão do responsável

A issue #48 também faz perguntas de modelo operacional que não podem ser
respondidas no código sem decisão explícita:

1. **Contas individuais vs. logins por papel.** Hoje `admin`, `cozinha`,
   `bar` e `caixa` são papéis compartilhados; a troca obrigatória de senha
   (issue #55) força senha exclusiva por papel, mas não separa pessoas. Para
   atribuir ações a um funcionário específico será preciso criar contas
   individuais (ou PIN de curta duração nos tablets compartilhados).
2. **Autorização de desconto e limite de gerente.** Desconto e taxa são
   informados no fechamento; falta definir quem pode conceder desconto e a
   partir de que valor um gerente precisa reautenticar.
3. **Retenção da trilha.** A proposta de prazo está em
   `data-policy-proposal.md` (2 anos para `auditoria_eventos`), aguardando
   aprovação junto com a política de retenção (#44).
4. **Auditoria das mutações de admin** (cardápio, preços, garçons). Pode ser
   adicionada na próxima etapa reaproveitando `db/auditoria.js`, sem nova
   tabela; deve entrar com issue própria e teste PostgreSQL.
5. **Quem consulta a trilha.** Definir acesso (sugestão: só `admin`) e se a
   consulta ganha tela no painel ou permanece via SQL/relatório.

## Registro de falhas e negações

As respostas 4xx de negação (401/403/409) passam pelo log estruturado com
`X-Request-Id` e caminho sanitizado. A persistência de negações relevantes
(ex.: tentativa de entrega por garçom não responsável) pode ser expandida na
etapa 4 sem mudar o schema, usando `resultado='negado'`.

## Decisão registrada — 2026-10-30 (issue #48)

O responsável definiu: **desconto/ajuste financeiro exige gerente com
PIN/reautenticação** (além do motivo obrigatório já auditado). Logins
individuais e a retenção da trilha seguem o desenho das etapas deste
documento; a implementação entra numa frente própria.

A issue #48 **segue aberta** até a regra estar implementada e testada com
dois funcionários em dispositivo compartilhado.

## Implementação registrada — 2026-10-30 (issue #48, etapa gerente)

A regra está ativa nesta PR:

- Fechar a conta com **desconto > 0** ou **taxa de serviço ajustada** (valor
  informado diferente do percentual padrão, com motivo) exige que um
  **gerente (staff `admin`) reautentique com login + senha** no mesmo
  aparelho em que o caixa opera. Sem desconto e com a taxa padrão, o
  fechamento não muda.
- A rota `POST /api/caixa/sessoes/:id/fechar` valida a credencial antes de
  fechar: no máximo **10 tentativas por IP+sessão a cada 5 min** (429
  `GERENTE_BLOQUEADO`). Credencial inválida ou ausente responde 403
  (`GERENTE_NAO_AUTORIZADO`) e grava em `auditoria_eventos` o evento
  `gerente_autorizacao_negada` com `resultado='negado'` (operador, sessão,
  request id e se havia desconto/taxa — nunca a senha).
- Com a autorização válida, o evento `sessao_fechada` passa a registrar no
  contexto `autorizadoPorId` e `autorizadoPorNome` (quem autorizou), ao lado
  do ator que operou o fechamento — os dois funcionários do dispositivo
  compartilhado ficam identificados na mesma transação do fechamento.
- Trava final no banco: `db/caixa.js` (`fecharSessao`) rejeita com 403
  qualquer desconto/ajuste que chegue sem a autorização validada, mesmo fora
  da rota HTTP.
- Testes com dois funcionários em PostgreSQL descartável:
  `tests/postgres-gerente-autorizacao.test.cjs` (caixa não autoriza, só
  admin; fechamento com desconto sem gerente → 403; com gerente → fecha e o
  evento guarda operador + autorizador; taxa padrão dispensa gerente).

A issue #48 **segue aberta**: a retenção da trilha depende da #44
(jurídico/LGPD). Contas individuais, PIN dedicado nos tablets e auditoria
das mutações de admin seguem como etapas futuras deste documento.
