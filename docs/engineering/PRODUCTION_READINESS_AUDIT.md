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
2. **Alto, autorização/privacidade:** a listagem de mesas do garçom retorna tokens bearer de todas as mesas; esses tokens autorizam leitura e mutações públicas da sessão.
3. **Médio:** a edição de pedido pelo garçom verifica a atribuição antes da transação de edição, mas o método chamado não revalida o responsável sob lock; há uma janela TOCTOU em caso de transferência concorrente.
4. **Médio:** o rate limit é local ao processo e, na criação pública de pedidos, a chave inclui o token da mesa. Tokens distintos geram buckets distintos; réplicas não compartilham limites.
5. **Médio:** o bootstrap cria quatro contas de staff com a mesma senha configurada e não exige rotação neste fluxo.
6. **Médio:** o servidor pode começar a aceitar tráfego mesmo quando migrations falham, deixando potencial incompatibilidade entre código e schema.
7. **Médio, defeito funcional confirmado estaticamente:** o cancelamento público referencia `garcomResponsavelId`, variável não declarada no escopo da função; a rota cai em erro 500 antes de executar a query.
8. **Médio:** os testes versionados não comprovam integração real com PostgreSQL nem fluxo ponta a ponta no navegador.

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


## 8. Segunda passada — autorização, PIX e degradabilidade transacional

**Base de código verificada nesta passada:** `main` = `e0f2571bc8c6e19b67c137d93c1653e8d50f9ba6` (o mesmo SHA usado na primeira passada). A branch de auditoria mantém esse ponto-base; os PRs #35 e #36 não foram alterados. Esta seção acrescenta análise de fluxos e não representa teste dinâmico.

### A-06 — Médio/alto, condicional: idempotência financeira desliga silenciosamente se migration 0018 estiver ausente ou a introspecção falhar

**Classificação:** risco concreto condicionado ao schema/estado de conexão; probabilidade em produção desconhecida; impacto financeiro/contábil alto se ocorrer.

**Evidência**
- `db/conta.js`, função `colunaExiste(tabela, coluna)`: se a coluna não existe, registra aviso e devolve `false`; se a consulta ao `information_schema.columns` falha por qualquer motivo, captura a exceção e também define `cache = false`. O comentário documenta explicitamente que operações seguem sem idempotência quando a migration 0018 ainda não está aplicada.
- `db/caixa.js`, função `registrarPagamento(sessaoIdBruto, body)`: só consulta e reaproveita o lançamento anterior quando `usarChave` é verdadeiro. Caso contrário, insere um novo registro sem `idempotency_key`, mesmo que o cliente tenha enviado uma chave.
- `scripts/start-production.js` e a inicialização de `server.js` permitem que o servidor suba apesar de falha de migration (detalhado em A-04).
- `db/migrations/0018_transacional_idempotencia.sql` adiciona a coluna e o índice único que completam a proteção no banco.

**Cenário e impacto:** após timeout/retry de uma requisição de pagamento, com código novo e schema antigo (ou erro temporário de introspecção cacheado como falso), a mesma chave pode produzir dois lançamentos. O limite do valor restante reduz alguns casos, mas não impede duplicação quando a conta ainda comporta ambos os valores. O fallback pode persistir durante toda a vida do processo porque o resultado é cacheado.

**Recomendação:** tornar a ausência da coluna/erro de introspecção um estado explícito de readiness ou falhar de forma fechada para operações que exigem idempotência; alternativamente, garantir migration antes de receber tráfego. Adicionar teste de integração PostgreSQL que simule schema pré-0018 e erro de introspecção, incluindo retry de pagamento com a mesma chave. Não testar contra banco operacional.

### A-07 — Médio, autorização/privacidade: token individual de garçom habilita listagem global da fila

**Classificação:** comportamento confirmado; a severidade depende da política operacional esperada para garçons.

**Evidência**
- Em `server.js`, rota `GET /api/garcom/:token/pedidos`, o handler valida que o token identifica um garçom ativo e depois retorna `getFilaGarcom()` sem passar o ID do garçom nem filtrar por mesas atribuídas.
- A função `getFilaGarcom()` em `db/pedidos.js` busca pedidos com itens prontos aguardando entrega em âmbito global, não limitado às mesas assumidas pelo portador do token.
- Em contraste, `db/atendimento.js:listarAtendimentosGarcom(token)` filtra explicitamente por `s.garcom_responsavel_id = $1`.

**Impacto/cenário:** qualquer pessoa com um link de garçom ativo pode consultar detalhes da fila de entrega de outras mesas (incluindo nome do cliente, observações e itens), ainda que não estejam atribuídas a esse garçom. Isto pode ser uma escolha intencional para uma fila compartilhada; a documentação não é suficiente para afirmar que é um bypass contra a política desejada.

**Recomendação:** decidir e documentar se a fila de entrega é global ou limitada à atribuição. Se for por atribuição, aplicar o mesmo escopo da listagem de atendimentos e testar token do garçom A contra mesa atribuída ao garçom B. Se a fila for deliberadamente global, minimizar os dados pessoais expostos e registrar essa decisão como requisito.

### A-08 — Médio, probabilidade desconhecida: rate limit de login confia no primeiro valor de X-Forwarded-For

**Evidência**
- `server.js: clientIp(req)` usa o primeiro elemento de `X-Forwarded-For` em produção quando o header existe; a rota `POST /api/login` aplica `golpePermitido(login:<ip>)`.
- O rate limit está em memória (`db/rateLimit.js`) e não é compartilhado entre instâncias.
- Não foi possível verificar se o proxy/edge atual sobrescreve, limpa ou acrescenta ao header recebido do cliente, nem a topologia efetiva no Railway.

**Impacto/cenário:** se a infraestrutura aceitar um `X-Forwarded-For` controlado pelo cliente como primeiro elemento, um atacante pode variar o valor para criar buckets de login distintos. Se o proxy reescrever o header de forma confiável, esse cenário não se aplica; isso permanece não verificado.

**Recomendação:** validar a semântica real do header no ambiente isolado/proxy utilizado; confiar somente em IP estabelecido por proxy confiável e limitar tentativas também por conta/login, com armazenamento compartilhado quando houver réplicas.

### A-09 — Baixo/médio, hardening: política CSP permite scripts inline

**Evidência**
- `server.js: applySecurityHeaders(res)` define `script-src 'self' 'unsafe-inline'` e `style-src 'self' 'unsafe-inline'` quando a resposta ainda não tem CSP.
- A revisão estática não identificou, nesta passada, um exploit XSS confirmado associado a essa política; a presença de `unsafe-inline` reduz a capacidade da CSP de conter uma injeção futura.

**Impacto/recomendação:** se surgir XSS em campo que aceite conteúdo não confiável, scripts inline ficam menos contidos. Inventariar os usos inline, migrar para nonce/hash ou scripts externos quando viável e testar CSP/XSS em ambiente isolado. Não classificar como XSS comprovado sem payload e caminho explorável demonstrados.

### A-10 — Alto, autorização/privacidade: a API do garçom expõe tokens bearer de todas as mesas

**Status:** exposição confirmada no código; não foi feita chamada ao endpoint em produção. O impacto é alto porque o token de mesa funciona como credencial de acesso às rotas públicas daquela mesa.

**Evidência**
- `server.js`, rota `GET /api/garcom/:token/mesas`, chama `listarMesasGarcom(m[1])` após verificar apenas que o token identifica um garçom ativo.
- `db/atendimento.js:listarMesasGarcom(token)` consulta todas as mesas habilitadas e inclui `m.token` no SELECT e no objeto devolvido, sem limitar tokens às mesas atribuídas ao garçom.
- `db/queries.js:getMesaPorToken(client, token)` aceita o token de mesa para resolver a mesa.
- `server.js` expõe rotas públicas baseadas nesse token: `GET /api/mesas/:token/sessao`, `POST /api/mesas/:token/pedidos`, `PUT /api/mesas/:token/pedidos/:id`, `DELETE /api/mesas/:token/pedidos/:id`, além de check-in e aviso PIX. `db/pedidos.js:lerSessao` devolve nome do cliente, pedidos, itens, observações e totais da sessão aberta.

**Impacto/cenário:** qualquer portador de um link válido de garçom pode obter tokens de todas as mesas e reutilizá-los para ler dados de outras sessões e tentar criar, editar ou cancelar pedidos sob a identidade da mesa. Isso contorna a separação que `listarAtendimentosGarcom` aplica por `garcom_responsavel_id` e amplia o impacto de um token de garçom comprometido. A autorização exige apenas garçom ativo, não atribuição por mesa.

**Recomendação:** não retornar tokens de mesa na listagem global. Retornar somente os dados necessários para mostrar as mesas; disponibilizar o token apenas após uma operação autorizada de assumir/atribuir a mesa, e rever se transferências devem exigir aprovação do responsável atual. Adicionar testes negativos que provem que um token de garçom não permite ler nem modificar mesas não atribuídas. Tratar tokens como segredos bearer e não registrá-los em logs.

### A-11 — Médio, concorrência/autorização: edição de pedido do garçom tem janela TOCTOU na atribuição da mesa

**Status:** lacuna de revalidação confirmada por leitura estática; a corrida não foi reproduzida dinamicamente.

**Evidência**
- `db/atendimento.js:editarPedidoGarcom(token, pedidoId, body)` consulta pedido/sessão e exige `s.garcom_responsavel_id=$2`, mas essa consulta ocorre fora da transação que efetivamente edita o pedido.
- Em seguida chama `editarPedidoCliente(rows[0].token,id,body,garcom.id)`.
- `db/pedidos.js:editarPedidoCliente(token, pedidoId, body, garcomResponsavelId = null)` aceita o parâmetro `garcomResponsavelId`, porém o SELECT com `FOR UPDATE OF p` verifica apenas ID do pedido, mesa e sessão aberta; o parâmetro não é usado para revalidar `s.garcom_responsavel_id` dentro da transação.
- O caminho de criação é mais forte: `db/pedidos.js:criarPedido(..., atendimento)` verifica o responsável após obter o lock da sessão.

**Impacto/cenário:** se a mesa for transferida depois da consulta inicial e antes da edição, a operação pode prosseguir usando o token da mesa e editar um pedido recebido mesmo sem o garçom continuar responsável. A janela é curta, mas afeta autorização sob concorrência.

**Recomendação:** passar a identidade do garçom como contexto obrigatório no caminho de edição e revalidar a atribuição dentro da mesma transação, sob lock e na ordem global documentada; não confiar apenas na consulta preliminar. Criar teste concorrente determinístico em PostgreSQL descartável que pause entre validação e edição, transfira a mesa e confirme que a edição é rejeitada.

### A-12 — Médio, fluxo de pedidos: cancelamento público referencia variável não declarada e termina em 500

**Status:** defeito confirmado por inspeção estática; não foi executado teste dinâmico.

**Evidência**
- `db/pedidos.js:cancelarPedidoCliente(token, pedidoId)` declara somente os parâmetros `token` e `pedidoId`.
- Na query de validação do pedido, o array de parâmetros inclui `garcomResponsavelId` (linha aproximada 427 na versão auditada), mas esse identificador não está declarado no escopo da função. A única ocorrência adicional no módulo é o parâmetro padrão de outra função, `editarPedidoCliente(..., garcomResponsavelId = null)`, que não cria variável compartilhada.
- A rota `DELETE /api/mesas/:token/pedidos/:id` em `server.js` chama `cancelarPedidoCliente(m[1], Number(m[2])` com dois argumentos e trata `ErroPedido`; um `ReferenceError` não é convertido em erro de negócio e cai no handler genérico 500.

**Impacto/cenário:** a execução da função lança `ReferenceError` ao montar os parâmetros, antes da consulta de autorização/status. O cliente não consegue cancelar pedido por esse endpoint; o pedido e o estoque permanecem como estavam. O problema pode afetar todos os cancelamentos públicos, independentemente do estado do pedido.

**Recomendação:** corrigir a condição para expressar explicitamente a política desejada (cancelamento do cliente restrito à própria mesa e sessão aberta) sem referência implícita a variável inexistente. Adicionar regressão que execute o caminho real de cancelamento com mocks herméticos e teste PostgreSQL isolado para provar cancelamento/restauração de estoque e rollback em caso de conflito. Não executar contra banco operacional.

## 9. Controles positivos e interpretação cuidadosa

- `db/caixa.js: registrarPagamento` trava a sessão antes de calcular o restante e inserir o pagamento; há validação server-side do valor e da forma de pagamento. Isso reduz concorrência de pagamentos na sessão, mas não substitui a garantia de idempotência se a coluna estiver ausente.
- `db/pix-cliente.js: informarPixPago` registra um aviso de PIX, não um pagamento liquidado. O README descreve corretamente que a equipe deve confirmar o recebimento no aplicativo bancário; não foi identificado gateway bancário ou confirmação automática.
- `db/events.js` envia payload vazio aos clientes públicos de SSE, mitigando vazamento de payload de eventos; isso não limita, por si só, os dados retornados por endpoints HTTP.
- `db/auth.js` usa cookie HttpOnly e Secure em produção e scrypt para senhas; a validação de origem não substitui autenticação/autorização por rota nem prova que todas as rotas estão cobertas.
- Não foi feita tentativa de exploração, alteração de dados, consulta a banco, execução de testes, carga ou chamada a endpoint de produção.

## 10. Validações obrigatórias antes de fechar os riscos

1. Em PostgreSQL descartável, aplicar migrations do zero e simular schema sem 0018; verificar se readiness impede operações financeiras sem idempotência.
2. Repetir um pagamento com a mesma chave e com timeout simulado; provar que só há um lançamento, inclusive sob concorrência.
3. Com dois tokens de garçom e mesas distintas, validar a política pretendida da rota `/api/garcom/:token/pedidos` e o mínimo de dados pessoais necessário.
4. Verificar em ambiente de staging o valor de `X-Forwarded-For` observado pela aplicação para requisições com header forjado; não inferir a política do proxy apenas pelo código.
5. Adicionar regressão hermética para `DELETE /api/mesas/:token/pedidos/:id` e validar cancelamento/restauração de estoque em PostgreSQL descartável.
6. Testar em staging/banco descartável se um token de garçom permite listar tokens de mesa e acessar sessão/pedidos de mesa não atribuída.
7. Criar teste concorrente determinístico para transferência de mesa durante edição de pedido por garçom; a edição deve falhar se a atribuição mudar.
8. Fazer varredura XSS/CSP de rotas e campos que aceitam texto de cliente, observação, nome, descrição e dados de produtos.
9. Executar CI, testes PostgreSQL e E2E de navegador somente em ambiente isolado. Esta auditoria não executou esses comandos nem os considera aprovados.
