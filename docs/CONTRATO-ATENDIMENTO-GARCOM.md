# Contrato de integração — atendimento por garçom (v2, entrega progressiva por item)

> Esta versão substitui o contrato v1. A unidade de trabalho deixou de ser o
> **pedido** e passou a ser o **item**. Leia junto com
> [`PWA-ATENDIMENTO-GARCOM.md`](./PWA-ATENDIMENTO-GARCOM.md).
> Requer a migration `0027_entregas_progressivas_offline.sql`.

## Princípio do fluxo (sem aprovação)

Cliente ou garçom registra o pedido → cada item cai **direto** na fila do seu
setor (cozinha ou bar). **Não existe etapa de aprovação.** O "aceite" da
cozinha/bar apenas move o item para `em_producao` (produção iniciada), como no
fluxo original. Qualquer item pronto fica imediatamente disponível ao garçom,
sem esperar o restante do pedido nem o outro setor.

## Ciclo de vida do item

```
recebido → em_producao → concluido → aceito → retirado → entregue
                              (qualquer etapa não terminal) → cancelado
```

| Estado | Significado | Quem move |
|---|---|---|
| `recebido` | na fila do setor, produção não iniciada | criação do pedido |
| `em_producao` | setor começou a produzir | cozinha/bar do setor do item |
| `concluido` | pronto, aguardando retirada | cozinha/bar do setor do item |
| `aceito` | garçom assumiu a entrega daquele item | garçom |
| `retirado` | garçom retirou no balcão, ainda não levou à mesa | garçom que aceitou |
| `entregue` | entregue na mesa — **único estado cobrável** | garçom que retirou |
| `cancelado` | terminal, com motivo e ator; não cobra e não bloqueia | staff/garçom autorizado |

Regras aplicadas no servidor (`db/itens.js`, `db/pedidos.js`, `db/entregas.js`):

- Transição só avança; regressão responde **409**. Reenvio do mesmo estado é
  replay idempotente (`idempotentReplay:true`), sem novo histórico.
- O setor é **snapshot** gravado no item (`itens_pedido.setor`). Alterar o
  produto no admin não move item já lançado.
- Cozinha/bar só alteram itens do próprio setor: setor errado → **403**.
- `cancelado` nunca é revivido por nenhuma rota.
- O status do pedido é **derivado** dos itens e nunca sobrescreve o trabalho
  de um setor:
  - todos `cancelado` → `cancelado`;
  - todos terminais (`entregue`/`cancelado`) → `entregue`;
  - nenhum em produção → `concluido`;
  - algum item já avançou → `em_producao`;
  - caso contrário → `recebido`.

## Autoria, atores e trilha

Cada etapa grava ator e horário próprios no item: `preparado_por_staff_id`,
`aceito_por_id`/`aceito_em`, `retirado_por_id`/`retirado_em`,
`entregue_por_id`/`entregue_em`, `cancelado_por_staff_id`/`cancelado_por_garcom_id`,
`cancelamento_motivo`, `cancelado_em`.

`itens_pedido_historico` guarda toda transição (estado anterior, novo, ator,
`request_id`, motivo, horário). `auditoria_eventos` guarda o evento de negócio.
`pedidos.garcom_entregou_id` registra **a última** entrega do pedido e não
substitui a autoria por item.

## Responsabilidade da mesa ≠ retirada do item

- O **primeiro** garçom que aceita um item de uma sessão sem responsável torna-se
  o responsável principal, no servidor, dentro da transação
  (`UPDATE ... WHERE garcom_responsavel_id IS NULL`), com histórico e auditoria.
- Garçons **ajudantes** podem aceitar/retirar/entregar outros itens da mesma mesa
  sem alterar o responsável. A resposta informa `responsabilidadeAtribuida:false`
  e o nome do titular.
- Só quem aceitou pode retirar; só quem retirou pode entregar. Terceiro recebe
  **403**.
- Transferência é sempre explícita:
  - `POST /api/garcom/:token/mesas/:numero/transferir` — apenas o titular atual;
  - `POST /api/admin/mesas/:numero/transferir` — administrativo, exige staff
    admin, grava `alterado_por_staff_id`.
- `POST .../deixar` libera a responsabilidade, recusando (409) se houver item
  não entregue/não cancelado. O fechamento da comanda continua no Caixa.

## Rotas de entrega por item

Todas exigem token de garçom ativo e sessão aberta.

| Operação | Rota | Corpo |
|---|---|---|
| Fila compartilhada de prontos | `GET /api/garcom/:token/pedidos` | — |
| Aceitar itens | `POST /api/garcom/:token/pedidos/:id/assumir-entrega` | `{itemIds:[int]}` |
| Retirar itens | `POST /api/garcom/:token/pedidos/:id/retirar` | `{itemIds:[int]}` |
| Entregar itens | `POST /api/garcom/:token/pedidos/:id/entregar` | `{itemIds:[int],etapa:"entregar"}` |
| Histórico do pedido | `GET /api/garcom/:token/pedidos/:id/historico` | — |
| Cancelar item | `POST /api/admin/itens/:id/cancelar` | `{motivo}` (3–300 chars) |
| Devolver aceite à fila | `POST /api/admin/itens/:id/liberar-aceite` | — |

Semântica e erros:

- `itemIds` é **tudo ou nada**: id de outro pedido → **404**; item em estado
  incompatível → **409**; nada é aplicado parcialmente.
- Sem `itemIds`, a rota aplica a etapa a todos os itens elegíveis do pedido.
- `etapa:"entrega_direta"` (padrão do endpoint legado `entregar`) entrega
  diretamente itens prontos **sem dono** ou do próprio garçom; item de outro
  garçom → **403**. O PWA atual usa o fluxo em três etapas.
- A fila é **compartilhada**: não esconde item pronto por causa do dono da mesa
  nem da origem do pedido. Cada item traz `podeAceitar`, `podeRetirar`,
  `podeEntregar` calculados para o garçom autenticado, mais os nomes/ids dos
  atores. O pedido traz `itensProntos` e `itensPendentesProducao`.
- Corrida de aceite: exatamente um garçom vence; os demais recebem **409**.

## Pedido do garçom e idempotência offline

`POST /api/garcom/:token/mesas/:numero/pedidos`

```jsonc
{
  "clienteNome": "Patrícia",
  "items": [{ "productId": 12, "qty": 2, "note": "sem cebola",
              "additions": [{"id": 3}], "removals": ["Cebola"] }],
  "note": "bebidas primeiro",
  "idempotencyKey": "UUID v4 obrigatório para pedido de garçom",
  "clientCreatedAt": "2026-10-29T18:04:11.000Z",
  "pedidoPaiId": 481
}
```

- Preços, disponibilidade, estoque, adicionais e remoções são **revalidados no
  servidor**. Preço enviado pelo cliente é ignorado.
- A chave é única **por garçom** (`uq_pedidos_garcom_idempotency`), não por
  sessão. O replay é resolvido **antes** de exigir sessão aberta, então um
  celular que reenvia depois de a comanda fechar recebe o pedido original em
  vez de um conflito sem solução.
- Mesma chave + mesmo conteúdo → **200** com o pedido original e
  `idempotentReplay:true`; estoque não baixa de novo.
- Mesma chave + conteúdo diferente → **409** (`payload_hash` SHA-256 do comando
  canônico). O original é preservado; nada é sobrescrito.
- Pedido novo (chave nova) em mesa sem sessão atribuída → **409**.
- `clientCreatedAt` inválido → **400**. O horário local é preservado em
  `pedidos.cliente_criado_em`, distinto de `criado_em` (recepção no servidor).
- **Nunca** confirmar localmente antes do HTTP de sucesso com `id` do servidor.

## Setores

- `GET /api/cozinha/pedidos` e `GET /api/bar/pedidos` retornam apenas itens do
  próprio setor em `recebido`/`em_producao`.
- `PATCH /api/pedidos/:id/status` continua aceito por compatibilidade, mas age
  **por item** dentro do setor autorizado, recalculando o pedido. Cozinha/bar
  não podem marcar `entregue`; admin não pode marcar `entregue` enquanto houver
  produção pendente. Regressão em lote → **409**.
- `PATCH /api/itens/:id/status` é a rota preferida para o avanço individual.

## Financeiro

- Somente itens `entregue` compõem `mesa_sessoes.valor_total`
  (`db/conta.js`, sincronizado na mesma transação da entrega).
- Item `retirado` mas não entregue **não** é cobrável.
- Cancelamento devolve estoque **uma única vez** (replay não devolve de novo) e
  só reativa produto que estava indisponível por falta de estoque.
- Item `entregue` não pode ser cancelado (**409**): usar estorno financeiro.
- O Caixa não fecha com pedido não terminal (**409**). `cancelado` não bloqueia.
- Comanda inteiramente cancelada fecha com total **zero** e libera a mesa; o
  card permanece visível no caixa até ser encerrada.

## Tempo real

Reusa a arquitetura SSE existente (`GET /api/events`, `db/events.js`), sem
mecanismo paralelo. O cliente envia `hello` e o servidor replica atualizações de
mesa, pedido e item. `public/js/realtime.js` implementa reconexão com backoff,
fallback periódico e limpeza de listeners. Painéis continuam funcionais se o
SSE cair, pelo polling de reserva.

## Fora de escopo / não prometido

- **Web Push com o aplicativo fechado não está implementado.** Existem handlers
  no Service Worker, mas não há subscrição `PushManager`, chaves VAPID,
  armazenamento de subscrições nem serviço de envio. Não prometer esse aviso.
- Pedido de **cliente** por QR exige conexão. Só o garçom tem fila offline.
- Responsabilidade de mesa assumida offline é **provisória** até o servidor
  validar; pode resultar em conflito se outro garçom assumiu primeiro.
- Captura de pagamento offline não existe; cobrança exige conexão.
