# Contrato de integração — atendimento por garçom (v1)

> Branch: `feat/atendimento-garcom-core-20261019`. Endpoints disponíveis somente após merge e migration 0019. Não executar testes de escrita em produção.

## Autenticação
O token UUID individual do link do garçom é uma credencial bearer na URL. Todas as rotas de garçom revalidam se o usuário está ativo; não enviar esse token a clientes. Em produção, preferir futuramente sessão autenticada de curta duração para reduzir exposição de tokens em URLs/logs.

## Mesas do garçom e responsabilidade persistente
- `GET /api/garcom/:garcomToken/mesas` → `{garcom:{id,nome},mesas:[{id,numero,token,sessaoId,clienteNome,garcomResponsavelId,garcomResponsavelNome}]}`. Retorna mesas habilitadas para uso operacional; a API administrativa continua sendo a fonte para a visão completa do administrador.
- `POST /api/garcom/:garcomToken/mesas/:numero/assumir` é o endpoint legado que o PWA usa para **iniciar atendimento**; aceita `{clienteNome?:string}`. Abre uma sessão se necessário e grava `garcom_responsavel_id`. Se outra pessoa já for responsável, devolve 409; não permite transferência implícita, mesmo se o cliente enviar `transferir:true`.
- `GET /api/garcom/:garcomToken/garcons-ativos` → `{garcons:[{id,nome}]}`. Só retorna IDs e nomes de garçons ativos, sem tokens.
- `POST /api/garcom/:garcomToken/mesas/:numero/transferir` aceita `{garcomDestinoId:number}`. Somente o responsável atual pode transferir a sessão aberta; o destino deve existir e estar ativo. A transação atualiza a sessão e insere no histórico o responsável anterior, o novo, o ator (`alterado_por_id`) e o horário.
- A migração `0023_atendimento_transferencia_actor.sql` adiciona o ator à tabela `mesa_atendimento_historico` sem remover registros anteriores.
- Pedidos/itens que já estavam prontos permanecem com status `concluido`: não são entregues nem recriados pela transferência. Como a fila é consultada por responsável atual da sessão, somem do PWA do antigo responsável e aparecem no PWA do novo. A API administrativa continua consultando o conjunto completo.

## Pedido do garçom
- `POST /api/garcom/:garcomToken/mesas/:numero/pedidos` → corpo equivalente ao cliente: `{clienteNome,items,note,idempotencyKey}`. Requer sessão da mesa atribuída ao próprio garçom; se não, 409.
- `items` deve manter o formato existente de `api.criarPedido` (ver `src/store/usePub.ts` função `itensToApiBody`).
- A mesma `idempotencyKey` deve ser reutilizada em todas as tentativas de sincronização **da mesma operação**. Não gere UUID novo em um retry.
- Novo pedido retorna HTTP 201; replay retorna 200 e `idempotentReplay:true`. O banco valida preços, disponibilidade e estoque no momento de sincronizar; um pedido offline pode ser recusado com 400/409 e requer correção manual. **Nunca informar confirmado antes do HTTP de sucesso.**
- `pedidos.origem_pedido='garcom'` e `pedidos.garcom_registrou_id` são gravados atomicamente. Pedidos do cliente mantêm `origem_pedido='cliente'`.

## Entregas
O endpoint já existente `POST /api/garcom/:token/pedidos/:pedidoId/entregar` continua válido; registra `garcom_entregou_id` e preserva a autoria original. Antes de alterar qualquer item, o backend bloqueia e valida a sessão aberta e exige que `garcom_responsavel_id` corresponda ao token autenticado; um ex-responsável recebe 403. Para entrega parcial por diferentes garçons, `garcom_entregou_id` representa **a última entrega do pedido**, não histórico por item. Uma auditoria por item exigirá migration adicional.

## Indicadores administrativos
- `GET /api/admin/garcons/metricas?data=YYYY-MM-DD` exige autenticação admin. Retorna `{data,criterio,garcons:[{id,nome,ativo,atendimentos,vendas,ticketMedio}]}`.
- Critério de vendas: **valor cobrado de contas fechadas** nessa data, atribuído ao responsável pela sessão no fechamento, não ao autor individual de cada pedido.
- Transferências ficam registradas em `mesa_atendimento_historico`, com `alterado_por_id` e `alterado_em`. Garçons desativados mantêm o histórico.
- Uma sessão atribuída pela primeira vez depois de pedidos do cliente passa a creditar a venda ao garçom responsável, conforme o modelo comercial definido para esta versão.

## Fora deste PR
Não há neste trabalho confirmação de PIX, captura offline, service worker/PWA nem fechamento pelo garçom. Esses fluxos exigem API específica com validação de recebimento **online**, auditoria e controle de concorrência; não usar o endpoint público de cliente para registrar pagamento.

## Testes necessários antes de produção
Executar migrations 0019 em banco isolado; teste admin/garçom ativo/inativo, tentativa de atuar em mesa de outro garçom, transferência, idempotência, reconciliação de faturamento, data local e histórico depois de desativar funcionário. Testar frontend e endpoints das outras branches somente após integrar sem conflitos.
