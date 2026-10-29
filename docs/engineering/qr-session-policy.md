# Política do QR fixo e ciclo de vida da sessão da mesa

**Issue relacionada:** [#47](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/47).

## Comportamento atual (verificado por teste em PostgreSQL descartável)

O token da mesa é um UUID persistido em `mesas.token` (migration `0001`) e não
rotaciona. O fluxo é:

1. O cliente lê o QR fixo da mesa e envia o primeiro pedido.
2. `getOuAbrirSessao()` (`db/queries.js`) abre uma `mesa_sessoes` em lock de
   linha serializado; se já existir sessão aberta, ela é reutilizada.
3. Quando a conta é fechada, a sessão vira `fechada` e a mesa volta a `livre`.
4. Um novo pedido com o **mesmo token** cria uma **nova sessão**; o token antigo
   continua válido indefinidamente.
5. Token malformado/desconhecido responde 404 sem qualquer mutação.

Evidência automatizada: `tests/postgres-qr-session.test.cjs` (PostgreSQL 16
descartável no CI), que cobre pedido inicial, fechamento, reabertura pelo mesmo
QR, token inválido/desconhecido e o fato de o modelo `mesas.status` só admitir
`livre`/`ocupada` (não existe estado "desativada" hoje).

## Opções de política (decisão do responsável)

| Opção | Descrição | Impacto |
|---|---|---|
| **1. QR fixo sempre ativo (atual)** | Sessão nasce no primeiro pedido; nenhuma ação de funcionário é exigida. | Melhor autoatendimento; risco de pedidos remotos caso o QR seja fotografado/copiado. |
| 2. Sessão aberta pelo funcionário | A mesa só aceita pedidos após o garçom abrir/assumir a sessão. | Reduz pedidos remotos; adiciona um passo operacional e depende do PWA do garçom. |
| 3. Token por sessão/rotação do QR | Novo token (e QR reimpresso/digital) a cada fechamento. | Forte contra reuso do QR antigo; exige gestão de QR físico/dinâmico. |
| 4. Prova de presença | PIN curto exibido na mesa ou outra verificação local. | Bloqueia quem não está no local; exige divulgação/troca do PIN e UX adicional. |

## Recomendação

Manter a **opção 1** para o lançamento, porque o produto foi desenhado para
autoatendimento por QR e o token é opaco e de difícil adivinhação (UUID v4),
combinado com:

- rate limit por IP + token de mesa (`pedido:<ip>:<token>`, 10 pedidos / 5 min);
- cancelamento público restrito a pedidos ainda não em preparo, com trilha de
  auditoria (`auditoria_eventos`, issue #48);
- o garçom vê e pode acompanhar todas as mesas pelo PWA.

Se a operação relatar pedidos remotos indevidos, a próxima etapa natural é a
opção 2 (sessão autorizada), reaproveitando o fluxo de assunção já existente
no atendimento.

## Decisão adotada para o lançamento

Por delegação do responsável pelo projeto em 2026-10-29, fica adotada a
**opção 1 — QR fixo sempre ativo**, mantendo o comportamento já implementado.
A decisão privilegia o autoatendimento e evita exigir abertura manual de cada
mesa. O risco de cópia/fotografia do QR é mitigado por token opaco UUID,
limitação de tentativas e auditoria dos cancelamentos.

Esta decisão não significa que o QR prove presença física. Se forem observados
pedidos remotos indevidos, abrir uma mudança separada para avaliar a opção 2
(sessão autorizada pelo funcionário) ou a opção 4 (PIN de presença), com
critérios de UX e segurança antes de alterar o fluxo.

A evidência automatizada continua sendo `tests/postgres-qr-session.test.cjs`,
executada em PostgreSQL descartável no CI. Nenhuma alteração de token, migration
ou dado de produção é necessária para esta decisão documental.
