# PWA de atendimento do garçom

## Escopo e isolamento
Frontend independente em `public/garcom-pwa/`. Não altera `db/*`, migrations, regras transacionais nem `server.js`. O PWA é estático; a API real deve ser habilitada por configuração explícita após alinhamento com o agente de backend.

## Como abrir
Sirva o repositório com o servidor atual e acesse `/garcom-pwa/`. Instalação PWA e Service Worker exigem HTTPS, exceto localhost. Abra uma vez online para armazenar o shell em cache. O IndexedDB guarda a fila no mesmo navegador/dispositivo.

## Modo mock
O frontend começa em modo mock seguro: cardápio demonstrativo e confirmação simulada local, sem enviar pedidos reais. Antes de conectar ao backend, o agente principal deve alterar a configuração `mock` de `true` para `false` em `app.js` e validar os contratos abaixo. A confirmação mock serve apenas para demonstração, não é confirmação de cozinha.

## Estados
- `offline`: pedido persistido localmente, ainda não confirmado no servidor.
- `sync`: tentativa de envio em andamento.
- `confirmed`: API confirmou a criação e retornou sucesso.
- `conflict`: servidor respondeu HTTP 409; não reenviar automaticamente até revisão.

## Contratos HTTP propostos

### `GET /api/menu`
Resposta aceita array de produtos ou `{ "products": [...] }`. Produto: `{ id, name, description, price, additions?, removals? }`. Adaptar o mapeamento se o contrato real do backend divergir.

### `POST /api/orders`
Headers: `Content-Type: application/json`, `Idempotency-Key: <UUID>`.
Body:
```json
{
  "table": 12,
  "customerName": "Maria",
  "items": [{
    "productId": "lanche-01",
    "name": "X-Burger",
    "qty": 2,
    "unitPrice": 22,
    "additions": ["Bacon"],
    "removals": ["Sem cebola"],
    "note": "Ao ponto"
  }],
  "note": "Entregar bebidas primeiro",
  "idempotencyKey": "UUID-ESTAVEL"
}
```
Sucesso: HTTP 201/200 e JSON contendo `id` ou `order.id`. O backend precisa persistir idempotency key com unicidade transacional e devolver a mesma resposta para retries com a mesma chave. O frontend preserva a chave no IndexedDB em todas as tentativas. HTTP 409 indica conflito e interrompe retry automático. Falha de rede mantém o pedido pendente.

### Pedidos e estados de preparo/entrega
Proposta: `GET /api/orders?table={n}` retorna `{ "orders": [{ "id", "table", "customerName", "status", "items", "createdAt" }] }`. Estados recomendados: `received`, `preparing`, `ready`, `delivered`, `cancelled`. Ainda não integrado; usar o contrato oficial do agente principal antes de exibir estados do servidor.

### Conta e cobrança
Proposta para o backend definir: `GET /api/tables/{table}/account` e `POST /api/tables/{table}/checkout-requests`. O frontend mantém os controles desabilitados até haver contrato de autorização, formato de valores, estados de pagamento e proteção contra duplicação. O PWA não cria pagamentos nem calcula total oficial.

### QR de autoatendimento
O seletor gera URL pública `/mesa/{n}` (ajustar se o roteamento atual for diferente). A imagem é gerada por serviço externo quando online; a URL continua copiável offline. Para QR totalmente offline, incluir gerador QR local após aprovação de dependência/licença.

## Pontos de segurança e limitações conhecidas
- Não guardar credenciais de staff ou tokens sensíveis em cache.
- Cacheia apenas shell estático local; não cacheia respostas privadas da API.
- O navegador não permite sincronização confiável com o app totalmente fechado em todos os Androids. O sync automático ocorre quando a página está aberta e o evento online dispara; botão manual continua disponível.
- Não fazer retry automático de 409. Conflitos devem ser reconciliados pelo servidor/garçom.
- Idempotência real depende do backend; chave no cliente isoladamente não impede duplicatas no servidor.
- Cobrança permanece apenas interface de preparação, sem ações financeiras.
- Mock é demonstrativo e nunca deve ser apresentado como pedido recebido pela cozinha.
