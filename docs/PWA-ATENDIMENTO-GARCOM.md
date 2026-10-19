# PWA de atendimento do garçom

## Escopo e isolamento
Frontend independente em `public/garcom-pwa/`. Não altera `db/*`, migrations, regras transacionais nem `server.js`. O PWA é estático e permanece em modo mock até integração explícita com o backend.

## Como abrir
Sirva o repositório com o servidor atual e acesse `/garcom-pwa/`. Instalação PWA e Service Worker exigem HTTPS, exceto localhost. Abra uma vez online para armazenar o shell em cache. O IndexedDB guarda a fila no mesmo navegador/dispositivo.

## Modo mock
O frontend começa em modo mock seguro: cardápio demonstrativo e confirmação simulada local, sem enviar pedidos reais. Não basta mudar `mock` para `false`: primeiro é necessário implementar o adaptador para autenticação/token, formato de produto e endpoint real acordado com o agente principal. A confirmação mock serve apenas para demonstração, não é confirmação de cozinha.

## Estados
- `offline`: pedido persistido localmente, ainda não confirmado no servidor.
- `sync`: tentativa de envio em andamento.
- `confirmed`: API confirmou a criação e retornou sucesso.
- `conflict`: servidor respondeu HTTP 409; não reenviar automaticamente até revisão.

## Contratos HTTP e alinhamento com o backend

### Endpoints existentes identificados no backend atual
- `GET /api/garcom/:token/me`: valida o link do garçom e retorna identidade.
- `GET /api/garcom/:token/pedidos`: fila de pedidos visível ao garçom.
- `POST /api/garcom/:token/mesas/:numero/assumir`: assumir uma mesa.
- `POST /api/garcom/:token/mesas/:numero/pedidos`: cria pedido após a mesa estar atribuída ao garçom. O backend retorna 201 para novo pedido e 200 para replay idempotente.
- `POST /api/garcom/:token/pedidos/:id/entregar`: marca itens/pedido como entregues conforme o payload aceito pelo backend.

O PWA desta branch ainda **não chama esses endpoints**. Antes da integração, confirmar com o agente principal como o token do garçom será obtido/guardado, quais campos de item o backend aceita, como a chave idempotente é enviada e quais formatos retornam. Não colocar token no cache do Service Worker nem em logs.

### Cardápio
O mock espera produto no formato `{ id, name, description, price, additions?, removals? }` (também reconhece `nome`, `descricao`, `preco`). O endpoint real de cardápio deve ser confirmado pelo agente principal; o frontend não presume que `GET /api/menu` já exista.

### Criação e idempotência
Contrato sugerido para o adaptador, sujeito a alinhamento com o backend:
- Chave UUID criada uma vez ao salvar o pedido localmente e preservada no IndexedDB em todas as tentativas.
- Enviar a mesma chave em todas as tentativas, preferencialmente no header `Idempotency-Key` e no corpo se o contrato backend exigir.
- Backend deve persistir a chave com unicidade transacional, vinculada ao escopo correto, e devolver a resposta anterior quando houver replay.
- HTTP 409 é conflito: parar retries automáticos e pedir revisão. Falha de rede mantém pedido pendente.
- O endpoint atual de criação de pedido do garçom deve ser verificado quanto ao formato e escopo de idempotência antes de ativar o modo real. Uma chave apenas no cliente não garante ausência de duplicatas.

### Pedidos e estados de preparo/entrega
A fila existente é `GET /api/garcom/:token/pedidos`. O frontend ainda precisa mapear a resposta real para estados visuais. Estados de interface sugeridos: `received`, `preparing`, `ready`, `delivered`, `cancelled`. Confirmar nomes e transições no contrato do backend; não inferir confirmação de cozinha a partir de dados locais.

### Conta e cobrança
Proposta para o backend definir: `GET /api/tables/{table}/account` e `POST /api/tables/{table}/checkout-requests`. São apenas sugestões, não endpoints confirmados. Os controles permanecem desabilitados até haver contrato de autorização, formato de valores, estados de pagamento e proteção contra duplicação. O PWA não cria pagamentos nem calcula total oficial.

### QR de autoatendimento
O seletor gera URL pública `/mesa/{n}`; confirmar esse caminho com o roteamento público existente. A imagem é gerada por serviço externo quando online; a URL continua copiável offline. Para QR totalmente offline, incluir gerador QR local após aprovação de dependência/licença.

## Pontos de segurança e limitações conhecidas
- Não guardar credenciais de staff ou tokens sensíveis em cache.
- Cacheia apenas shell estático local; não cacheia respostas privadas da API.
- O navegador não permite sincronização confiável com o app totalmente fechado em todos os Androids. O sync automático ocorre quando a página está aberta e o evento online dispara; botão manual continua disponível.
- Não fazer retry automático de 409. Conflitos devem ser reconciliados pelo servidor/garçom.
- A cobrança permanece como interface de preparação, sem ações financeiras.
- Mock é demonstrativo e nunca deve ser apresentado como pedido recebido pela cozinha.
