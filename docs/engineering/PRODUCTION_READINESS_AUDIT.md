# Auditoria de prontidão para produção — QRAdmin / Lanchonete QR

- **Base auditada:** `main`, commit `e0f2571bc8c6e19b67c137d93c1653e8d50f9ba6` (2026-10-19).
- **Branch:** `audit/production-readiness`.
- **Método:** inspeção estática do código, schema, migrations, documentação e testes.
- **Limite:** sem acesso ao PostgreSQL/Railway, execução local, navegador real ou configuração efetiva do ambiente. Este relatório não certifica que o sistema está seguro nem que o deployment corresponde ao código auditado.

## 1. Resumo executivo

O código contém proteções úteis: pedidos são gravados em transações; a mesa e os produtos são bloqueados para serializar operações concorrentes; preço/estoque são validados no servidor; o caixa calcula o total a partir dos itens entregues; existem chaves de idempotência e índices únicos parciais; sessões de staff usam tokens aleatórios e cookies HttpOnly.

A conclusão arquitetural principal é que **o sistema é explicitamente single-tenant**. O README declara que não existe isolamento de dados por estabelecimento em todas as consultas. Isso não demonstra um ataque cross-tenant no deployment atual de uma loja; significa que reutilizar a mesma instalação para várias lojas não é suportado e seria um bloqueador alto para um lançamento SaaS multi-loja.

Achados confirmados nesta revisão estática:

1. **Alto, condicional ao objetivo multi-loja:** não há garantia de isolamento por tenant; o produto declara suportar somente um estabelecimento.
2. **Médio:** o rate limit é local ao processo e, na criação pública de pedidos, a chave inclui o token da mesa. Tokens distintos geram buckets distintos; réplicas não compartilham limites.
3. **Médio:** o bootstrap cria quatro contas de staff com a mesma senha configurada e não exige rotação neste fluxo.
4. **Médio:** o servidor pode começar a aceitar tráfego mesmo quando migrations falham, deixando potencial incompatibilidade entre código e schema.
5. **Médio:** os testes versionados não comprovam integração real com PostgreSQL nem fluxo ponta a ponta no navegador.

Não foi confirmado, apenas pela leitura estática, um bypass específico que permita a uma mesa consultar/modificar pedidos de outra: os caminhos examinados filtram por token de mesa e/ou associam o pedido à sessão da mesa. Não foi possível auditar exaustivamente todas as rotas e queries. Não há base para declarar o sistema seguro.

## 2. Escopo e limitações

### Incluído

- `README.md`, `AGENTS.md`, `COORDENACAO.md`, `package.json`, `.github/workflows/ci.yml` e `docs/engineering/DEVELOPMENT_WORKFLOW.md`.
- `server.js`, `db/pedidos.js`, `db/queries.js`, `db/conta.js`, `db/caixa.js`, `db/atendimento.js`, `db/auth.js`, `db/pool.js`, `db/rateLimit.js`, `db/migrate.js`.
- Schema inicial, migrations `0016_pix_avisos.sql` e `0018_transacional_idempotencia.sql).
- Testes de regressão, integração da PWA e workflow CI.

### Não executado / não acessado

- Nenhum teste contra produção, Railway ou banco compartilhado.
- Nenhuma migration aplicada e nenhum dado criado, alterado ou removido.
- Nenhum teste mutável (`test:smoke`, `test:full`, `test:seguranca`, carga ou `test:dia`) executado.
- Nenhum `npm ci`, typecheck, build, suíte de testes ou comando shell executado nesta auditoria.
- Sem inspeção de variáveis de ambiente efetivas, logs privados, métricas, backups, rede ou estado atual do deployment.
- Não foi possível comprovar o resultado dos checks atuais do GitHub.
- O workflow de desenvolvimento foi lido na branch `docs/multi-agent-bootstrap`, pois ainda não estava na `main` consultada. O PR #32 permaneceu intocado.

## 3. Mapa dos fluxos críticos

### Cliente → cardápio → pedido

1. O cliente abre o QR da mesa; o token funciona como credencial dessa mesa (`README.md:42–47, 76–86`).
2. `GET /api/cardapio` serve o cardápio público. `POST /api/mesas/:token/pedidos` aplica rate limit antes de chamar `criarPedido` (`server.js:267–279`).
3. `db/pedidos.js:287–380` valida o corpo, inicia transação, resolve a mesa pelo token, abre/reutiliza sessão, valida e grava itens, e faz `COMMIT`.
4. `db/queries.js:17–23` valida token UUID e usa query parametrizada. `db/queries.js:26–51` trava a linha da mesa com `FOR UPDATE` antes de consultar/criar sessão aberta.
5. `db/pedidos.js` valida quantidade, disponibilidade, adicionais permitidos e estoque no servidor. Os produtos são travados em ordem crescente para reduzir deadlocks.

### Cozinha/bar → garçom → entrega

- As transições de status passam por operações de `db/pedidos.js`; a autorização por papel/setor precisa continuar coberta por testes comportamentais.
- `db/atendimento.js:97–151` verifica atribuição à sessão/mesa antes de criar ou editar pedido. A atribuição e criação são verificadas em momentos distintos; a validação final dentro de `criarPedido` e os locks são importantes para impedir corrida durante transferência.
- A PWA usa IndexedDB para a fila offline; `tests/pwa-garcom-integracao.test.cjs` verifica a chave de idempotência por operação e o isolamento da fila por token do garçom. O README diz que conflitos após reconexão exigem revisão humana.

### Caixa → pagamento → fechamento

- `db/caixa.js:269–368` inicia transação, trava sessão, verifica se está aberta, reconhece replay idempotente, calcula o total autoritativo de itens entregues e impede pagamento acima do restante.
- `db/conta.js` define o total devido pela soma dos itens entregues, incluindo adicionais; o acumulador `mesa_sessoes.valor_total` é sincronizado como espelho.
- `db/migrations/0018_transacional_idempotencia.sql:23–64` cria índices únicos parciais para idempotência de pedidos, pagamentos e vínculo aviso PIX→pagamento.

### Inicialização → schema

- `db/migrate.js:28–62` aplica migrations SQL em ordem alfabética, cada uma em transação, registrando nomes em `schema_migrations`.
- `server.js:1029–1054` inicia listener, tenta migrations best-effort e tenta bootstrap de staff. `scripts/start-production.js:5–34` também descreve subir o servidor mesmo quando migration falha.
- `package.json` define `start: node server.js` e `start:prod: node scripts/start-production.js`. Não foi verificado qual comando está configurado no Railway.

## 4. Achados classificados

### A-01 — Alto, condicional para SaaS: ausência de isolamento por tenant

**Status:** fato confirmado sobre o escopo atual; não é uma vulnerabilidade cross-tenant demonstrada no deployment single-tenant.

**Evidência**
- `README.md:15–22` declara que a aplicação é single-tenant e que não há isolamento de dados por estabelecimento em todas as consultas.
- `db/migrations/0001_init.sql:10–15` define mesas com ID/token globais; o schema central examinado não apresenta contexto tenant obrigatório.
- Consultas analisadas usam IDs e relações de mesa/sessão/pedido, sem filtro tenant obrigatório.

**Impacto:** duas lojas na mesma instalação/schema não teriam fronteira de dados consistente. Corrigir uma rota isolada não bastaria: schema, autenticação, consultas, eventos e recursos públicos precisam compartilhar a mesma fronteira.

**Cenário:** cadastrar uma segunda loja e confiar em subdomínio ou parâmetro do cliente sem impor tenant em todas as leituras/escritas.

**Recomendação:** não lançar multi-loja sobre a arquitetura atual. Decidir entre uma instalação/banco por loja ou projetar tenant ID obrigatório, resolução no servidor, índices/FKs adequados, contexto tenant em queries e eventos, e testes negativos loja A→loja B.

### A-02 — Médio: rate limit pode ser contornado por token e não é compartilhado entre réplicas

**Status:** comportamento confirmado no código; impacto operacional não foi testado.

**Evidência**
- `server.js:267–270` usa a chave `pedido:\${ip}:\${m[1]}` e limite de 10 requisições por cinco minutos.
- `db/rateLimit.js:4–17` guarda buckets em um `Map` local. O comentário em `db/rateLimit.js:1–3` declara que o limite não é compartilhado entre instâncias.
- `db/rateLimit.js:20–29` só limpa chaves antigas periodicamente.

**Impacto/cenário:** variar o segmento token da URL cria buckets diferentes antes de `criarPedido` validar a mesa. Assim, o limite não funciona como quota efetiva por IP para tokens inválidos. Em múltiplas réplicas ou após reinícios, limites de login/pedido também se distribuem ou resetam.

**Recomendação:** impor limite global por IP/rota antes da chave específica da mesa; limitar cardinalidade dos buckets; usar armazenamento compartilhado se houver réplicas; confirmar confiança no IP encaminhado pelo proxy. Testar abuso somente em ambiente isolado.

### A-03 — Médio: bootstrap compartilha a senha inicial entre contas de papéis diferentes

**Status:** comportamento confirmado; não foi verificado se a senha inicial ainda está válida no ambiente.

**Evidência**
- `db/auth.js:103–118` usa `STAFF_SEED_PASSWORD` ou `ADMIN_PASSWORD` como senha inicial e valida comprimento mínimo de 12 caracteres.
- `db/auth.js:120–135` calcula um hash e insere `admin`, `cozinha`, `bar` e `caixa` com o mesmo hash.
- Esse fluxo não exige troca de senha no primeiro login.

**Impacto/cenário:** se a credencial de bootstrap for compartilhada, anotada ou não rotacionada, conhecer a senha usada por um papel de menor privilégio também permite autenticar como `admin` com o login correspondente.

**Recomendação:** credenciais independentes por usuário, rotação obrigatória no primeiro acesso e invalidação do segredo de bootstrap após configuração. Verificar o estado sem revelar valores de segredos.

### A-04 — Médio: falha de migration pode deixar o serviço aceitando tráfego com schema incompatível

**Status:** comportamento confirmado; não foi verificado se ocorreu em produção.

**Evidência**
- `server.js:1029–1046` começa a escutar antes da migration; erros/códigos diferentes de zero viram aviso, sem encerrar o processo.
- `scripts/start-production.js:5–34` também descreve subir o servidor mesmo se migration falhar.
- `db/migrate.js:46–59` faz rollback da migration com erro, mas o processo principal pode continuar.
- `package.json` diferencia `start` de `start:prod`; o comando efetivo no Railway não foi inspecionado.

**Impacto/cenário:** se uma versão nova exigir coluna/tabela ainda não aplicada, páginas podem responder enquanto endpoints falham por incompatibilidade de schema, atrasando a detecção de release incompleto.

**Recomendação:** definir política explícita de release: gate de readiness para schema obrigatório ou compatibilidade entre versões. Separar liveness de readiness, expor estado do schema sem segredos e confirmar o comando de start real.

### A-05 — Médio: testes não comprovam integração real nem prontidão ponta a ponta

**Status:** lacuna confirmada; nenhuma falha funcional é inferida apenas por isso.

**Evidência**
- `tests/regressions.cjs:1–18` declara que nenhum teste conecta a banco real e injeta URL local fictícia para importar módulos.
- `.github/workflows/ci.yml` executa `npm ci`, typecheck, build, integridade de `dist/`, regressões e sintaxe; não inicia PostgreSQL nem navegador.
- `README.md:58–60` diz que a PWA precisa de validação ponta a ponta em navegador/dispositivo real e PostgreSQL isolado.
- Há testes de contratos, funções e mocks; não substituem testes de locks, constraints, rollback e migrations reais.

**Impacto:** a suíte pode passar sem provar concorrência real, transações, upgrade de schema, reconexão offline ou fluxo completo cliente-servidor.

**Recomendação:** pipeline com PostgreSQL efêmero; migrations do zero e de upgrade; testes concorrentes de mesa/estoque/pagamento/idempotência; E2E QR→pedido→preparo→entrega→caixa e PWA offline/reconexão.

### A-06 — Médio, condicional à configuração: opção de desabilitar validação TLS do PostgreSQL

**Status:** opção confirmada; valor efetivo em produção desconhecido.

**Evidência:** `db/pool.js:33–41` retorna `ssl: { rejectUnauthorized: false }` quando `DATABASE_SSL_REJECT_UNAUTHORIZED=false`.

**Impacto/cenário:** se habilitada em produção, a conexão TLS não valida certificado/CA do servidor, enfraquecendo proteção contra interceptação.

**Recomendação:** confirmar o estado por inspeção autorizada, sem registrar o valor no relatório. Preferir validação de certificado habilitada e corrigir a cadeia confiável se necessário.

## 5. Riscos de isolamento multi-tenant

- **Confirmado:** aplicação não é multi-tenant; o README declara que a separação de dados por estabelecimento não existe em todas as consultas.
- **Não demonstrado:** não foi identificado cenário específico de usuário de uma segunda loja lendo/modificando a primeira, porque não existe modelo tenant autenticado para testar. Não classificar como IDOR confirmado.
- **Controles positivos no fluxo single-tenant:** `db/queries.js:17–23` valida UUID e usa query parametrizada; `db/pedidos.js:484–493` exige que pedido pertença à sessão aberta da mesa resolvida pelo token; `db/atendimento.js:144–151` verifica que a mesa aberta está atribuída ao garçom.
- **Pendência:** completar matriz de autorização para todas as rotas, SSE, relatórios, uploads, tokens de garçom e operações administrativas. Para SaaS, testar explicitamente tenant A tentando ler/escrever dados de tenant B em cada fluxo; considerar controle centralizado no banco sem depender de filtros enviados pelo cliente.

## 6. Cobertura de testes e lacunas

**Cobertura existente observada**
- `tests/regressions.cjs`: regressões de tema, SSE, upload/SSRF, validação e funções selecionadas.
- `tests/garcom-operacao-integrada.test.cjs`: regras de papéis, garçom/caixa e contratos com dependências simuladas.
- `tests/pwa-garcom-integracao.test.cjs`: sintaxe PWA, rotas, chave de idempotência da fila offline e isolamento por token do garçom.
- `tests/garcom-situacoes.test.cjs` e `tests/pwa-status-notificacoes.test.cjs`: edição, status e notificações.
- `.github/workflows/ci.yml`: instalação, typecheck, build, integridade estrutural de `dist/`, regressões e sintaxe.

**Lacunas prioritárias**
1. PostgreSQL real: rollback, constraints, índices e migrations desde zero/upgrade.
2. Concorrência: pedido/cancelamento/edição, estoque, entrega parcial, pagamento idempotente e fechamento.
3. Navegador real: QR→pedido→cozinha/bar→garçom→caixa, SSE e sessão expirada.
4. PWA offline: timeout/retry, mesma chave, conflitos de preço/estoque e troca de usuário.
5. Matriz de autorização para cada rota e evento SSE, incluindo papéis, token inválido/inativo e CSRF.
6. Rate limit com várias instâncias e proxy real.
7. Exercício de backup/restauração e recuperação de migration.

Os testes operacionais podem alterar dados; não foram executados sem ambiente isolado confirmado.

## 7. Segurança e infraestrutura: observações adicionais

- **Sessões:** `db/auth.js:8–10, 48–62, 160–168` usa token aleatório de 32 bytes, cookie HttpOnly, SameSite=Lax, Secure em produção e expiração de 12 horas. `db/auth.js:180–203` verifica expiração e status do staff.
- **CSRF:** `db/auth.js:215–242` verifica Origin/Referer em métodos inseguros, mas aceita requisição quando ambos estão ausentes para compatibilidade não-browser. O impacto depende dos clientes e do ambiente; precisa de teste comportamental.
- **Entrada/SQL:** os caminhos examinados usam queries parametrizadas e validam IDs/quantidades. Não houve fuzzing de todas as rotas.
- **Erros/logs:** `server.js:1007–1025` mascara erros internos em produção, mas registra URL/mensagem em erros 4xx e objetos de erro inesperados. Confirmar que mensagens nunca incluam tokens/dados pessoais; logs reais não foram inspecionados.
- **HTTPS de entrada:** o servidor define headers de segurança e tenta redirecionar HTTP para HTTPS atrás do proxy. Proxy/domínio real não foram validados.
- **Banco:** `db/pool.js:64–87` configura timeouts de statement/lock/transação ociosa e limite de conexões. Sem métricas reais de pool, latência ou limites do provedor.
- **PIX:** `README.md:20–22, 62–68` esclarece que não há confirmação bancária automática; QR/aviso não prova liquidação. A conferência bancária humana continua necessária.

## 8. Recomendações priorizadas por impacto e esforço

| Prioridade | Ação | Impacto | Esforço |
|---|---|---|---|
| P0 antes de SaaS | Decidir single-tenant por instalação ou desenhar arquitetura multi-tenant; não compartilhar banco entre lojas | Muito alto | Alto |
| P1 | Corrigir rate limit por IP/rota, limitar cardinalidade e compartilhar estado se houver réplicas | Alto | Médio |
| P1 | Definir gate de readiness/migration e confirmar comando de start do Railway | Alto | Médio |
| P1 | Testes de integração PostgreSQL efêmero, migrations e concorrência | Alto | Médio/alto |
| P1 | Separar credenciais de bootstrap e exigir rotação | Alto | Médio |
| P2 | E2E de pedido e PWA offline/online em navegador | Alto | Médio/alto |
| P2 | Confirmar TLS do banco e eliminar necessidade de desabilitar validação em produção | Médio | Baixo/médio |
| P2 | Completar matriz de autorização de rotas/SSE, incluindo ausência de Origin/Referer | Alto | Médio |
| P3 | Alertas para migrations, pool, 5xx, rate limit e reconexão SSE | Médio | Médio |

## 9. Plano sugerido para as próximas cinco tarefas

1. **Contrato de tenancy:** decidir formalmente single-tenant por instalação ou SaaS; se multi-tenant for requisito, aprovar desenho de fronteira antes de correções pontuais.
2. **Rate limit e autenticação inicial:** resolver buckets por token, compartilhamento entre instâncias, cardinalidade e credenciais de bootstrap; adicionar testes comportamentais.
3. **Integração PostgreSQL:** pipeline descartável, migrations do zero/upgrade e testes de transação, constraints, concorrência e idempotência.
4. **Fluxo ponta a ponta:** automatizar QR→pedido→cozinha/bar→entrega parcial→pagamento/fechamento e PWA offline/retry em navegador.
5. **Release e observabilidade:** readiness condicionado ao schema esperado, alertas de migration/pool/5xx e procedimento de backup/restore/rollback testado.

Cada tarefa deve ter branch própria e PR para `main`; revisar checks e diff e não fazer deploy sem autorização explícita.

## 10. Comandos executados e resultados observados

**Comandos shell:** nenhum. Nenhum comando foi executado contra máquina local, banco ou produção.

**Verificações de leitura via GitHub**
- Leitura de `AGENTS.md` e `COORDENACAO.md` em `main`; leitura das políticas atualizadas e `docs/engineering/DEVELOPMENT_WORKFLOW.md` na branch `docs/multi-agent-bootstrap`.
- Inspeção de `package.json`, `.github/workflows/ci.yml`, `README.md`, handlers, módulos de banco, migrations e testes citados.
- Verificação dos metadados do PR #32: aberto, draft, base `main`, head `docs/multi-agent-bootstrap`; não alterado.
- Criada a branch `audit/production-readiness` a partir do commit de `main` indicado no cabeçalho.
- Nenhuma migration, seed, teste mutável, configuração, deploy ou operação de banco executada.

**Resultados:** conclusões baseadas em inspeção estática. `npm ci`, `npm run typecheck`, `npm run build`, `npm run test:regression`, verificações de sintaxe, testes PostgreSQL, navegador real e checks atuais do GitHub permanecem **não executados/não verificados nesta sessão**.
