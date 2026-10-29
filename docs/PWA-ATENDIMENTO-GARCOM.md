# PWA de atendimento do garçom

## Estado e arquitetura

O PWA operacional está em `public/garcom-pwa/` e usa o backend real do QR Admin. Não está em modo mock. O token individual do garçom identifica e autoriza as rotas operacionais; a API e o PostgreSQL são a fonte de verdade para mesas, pedidos, preparo, entregas e cobranças.

O Service Worker armazena apenas o shell estático do PWA. Requisições `/api/` não são armazenadas em cache. O IndexedDB guarda pedidos locais pendentes, com uma chave de idempotência por operação.

## Fluxo de mesas e pedidos

1. O PWA consulta `GET /api/garcom/:token/mesas` para obter mesas habilitadas, sessão aberta e responsável atual.
2. O garçom pode iniciar atendimento em mesa vazia por `POST /api/garcom/:token/mesas/:numero/iniciar`. A operação cria ou reutiliza uma sessão aberta, atribui o responsável sob lock transacional e registra o histórico/auditoria. Se outro garçom já for responsável, responde 409; transferência continua sendo uma ação explícita.
3. Para uma mesa já iniciada, qualquer garçom ativo pode acrescentar itens; a responsabilidade da sessão não muda.
4. O pedido é enviado por `POST /api/garcom/:token/mesas/:numero/pedidos` com `clienteNome`, `items`, `note`, `idempotencyKey` e, opcionalmente, `pedidoPaiId`.
5. O servidor valida sessão, responsável existente, produtos, disponibilidade, estoque, adicionais e idempotência. O preço oficial é calculado no backend.
6. A cozinha e o bar consultam suas filas operacionais; o garçom consulta `GET /api/garcom/:token/atendimentos` para acompanhar estados por item e `GET /api/garcom/:token/pedidos` para itens prontos para entrega.

### Regras importantes

- `POST .../assumir` continua reservado ao fluxo de assumir sessão criada por pedido QR do cliente. O PWA usa `.../iniciar` para iniciar o atendimento presencial sem exigir que o cliente faça primeiro um pedido QR.
- O início de atendimento não transfere mesa atribuída a outro garçom.
- A chave `idempotencyKey` precisa permanecer igual em todas as tentativas da mesma operação. Um replay retorna o pedido original, sem duplicar itens.
- HTTP 201 confirma pedido novo; HTTP 200 pode indicar replay idempotente. O PWA só mostra “Confirmado” após resposta de sucesso.
- HTTP 4xx vira conflito local e deve exibir o motivo; falhas de rede permanecem pendentes para nova sincronização.
- Pedidos adicionais vinculados usam `pedidoPaiId` e precisam referenciar pedido não entregue da mesma sessão.

## Rotas consumidas

| Operação | Rota |
|---|---|
| Identidade/validação | `GET /api/garcom/:token/me` |
| Mesas e responsável | `GET /api/garcom/:token/mesas` |
| Garçons ativos para transferência | `GET /api/garcom/:token/garcons-ativos` |
| Iniciar sessão em mesa vazia ou sem responsável | `POST /api/garcom/:token/mesas/:numero/iniciar` |
| Assumir sessão que veio de pedido QR | `POST /api/garcom/:token/mesas/:numero/assumir` |
| Transferir mesa | `POST /api/garcom/:token/mesas/:numero/transferir` |
| Pedidos ativos para acrescentar itens | `GET /api/garcom/:token/mesas/:numero/pedidos-ativos` |
| Enviar pedido | `POST /api/garcom/:token/mesas/:numero/pedidos` |
| Acompanhar pedidos/status por item | `GET /api/garcom/:token/atendimentos` |
| Consultar pedidos prontos | `GET /api/garcom/:token/pedidos` |
| Confirmar entrega | `POST /api/garcom/:token/pedidos/:id/entregar` |
| Resumo de cobrança | `GET /api/garcom/:token/sessoes/:sessaoId/resumo-pagamento` |
| Registrar recebimento parcial | `POST /api/garcom/:token/sessoes/:sessaoId/pagamentos` |

## Fila offline

- `offline`: pedido salvo localmente, ainda não confirmado no servidor.
- `sync`: tentativa de envio em andamento.
- `confirmed`: servidor confirmou a criação ou replay idempotente.
- `conflict`: servidor respondeu erro 4xx; o motivo deve permanecer visível para o operador.

A fila é local ao navegador/dispositivo. Limpar dados do site, remover o PWA ou perder o dispositivo pode apagar pedidos ainda não sincronizados. Não tratar rascunho offline como pedido recebido pela cozinha.

## Atualização de status, entregas e notificações

O PWA atualiza status/entregas por consulta periódica enquanto está aberto e em primeiro plano. O intervalo atual é de aproximadamente 7 segundos, com atualização adicional ao retornar à aba. A notificação local de item pronto depende do PWA ativo e do suporte do navegador.

**Web Push com o PWA fechado não está implementado/verificado.** O Service Worker possui handlers de evento push, mas ainda não há subscrição `PushManager`, armazenamento de subscrições por garçom, chaves VAPID nem serviço backend de envio. Não prometer notificação com aplicativo encerrado.

## Cobrança e PIX

O PWA consulta saldo e registra recebimentos parciais somente para sessão sob responsabilidade do garçom atual. O PIX gera QR/copia-e-cola com o valor informado; o operador deve conferir o crédito no aplicativo bancário e confirmar manualmente. O PWA não integra gateway, não confirma liquidação automaticamente e não fecha a sessão. O fechamento final permanece no Caixa.

## Segurança e operação

- O token individual é uma credencial bearer e atualmente aparece no caminho das rotas. Logs HTTP do proxy podem registrar caminhos completos; evitar compartilhar logs com tokens e planejar migração futura para sessão curta/cookie protegido.
- Nunca imprimir tokens em logs, telas ou documentação.
- Se a API responder 401, solicitar ao administrador um link individual válido/ativo; não continuar tentando enviar pedidos com credencial inválida.
- Transferência de mesa é explícita e auditada; o garçom anterior não pode entregar nem cobrar após perder a responsabilidade.
- Não executar testes que escrevem no banco de produção. Testes PostgreSQL devem usar exclusivamente banco descartável `qradmin_test`.

## Testes e validação pendente

A suíte contém testes estáticos de UI/rotas, testes de regras de atendimento e integração PostgreSQL. Isso não substitui E2E com navegador/dispositivo real. Antes de declarar o PWA pronto, validar:
- iniciar sessão vazia, enviar pedido, visualizar na cozinha/bar e confirmar recebimento;
- pedido QR de cliente, assumir mesa e acrescentar itens;
- pedido adicional, idempotência em timeout e recuperação após reiniciar o navegador;
- transferência durante uso concorrente e acesso de garçom anterior;
- entrega parcial/total e atualização dos status;
- cobrança parcial e confirmação manual PIX;
- offline/online, falha do IndexedDB, link inválido e atualização do Service Worker;
- instalação e comportamento em Android/Chrome e iOS/Safari.
