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


---

## 11. Continuação da auditoria — 2026-10-24

**Escopo desta passada:** revisão estática complementar dos handlers de garçom/entrega, sessão pública de mesa, sincronização da PWA e endpoints financeiros. Nenhuma rota foi chamada; nenhum banco, Railway, dado ou variável de produção foi acessado. Não foi possível executar comandos locais neste ambiente.

### A-13 — P1 condicional à política de atendimento: token ativo de garçom pode marcar como entregue pedido de qualquer mesa

**Status:** ausência de verificação de atribuição confirmada no código; exploração dinâmica não executada. A severidade P1 se a regra operacional pretendida for que um garçom só possa entregar pedidos de mesas atribuídas a ele. Se a operação deliberadamente usa uma fila global compartilhada, isso é uma decisão de autorização que precisa ser documentada e mitigada por escopo de dados.

**Evidência concreta**
- `server.js`, handler `POST /api/garcom/:token/pedidos/:id/entregar`, chama `entregarComoGarcom(Number(m[2]), m[1], itemIds || null)` após validar apenas o token.
- `db/garcons.js:entregarComoGarcom(pedidoId, garcomToken, itemIds)` valida que o token pertence a um garçom ativo e carrega `pedidos WHERE id = $1 FOR UPDATE`.
- Essa função não verifica `mesa_sessoes.garcom_responsavel_id`, nem compara o pedido com uma mesa atribuída ao garçom. Em seguida atualiza itens concluídos para `entregue`, sincroniza o total da sessão e recalcula o status.
- A existência de `db/atendimento.js:listarAtendimentosGarcom`, que filtra explicitamente por `s.garcom_responsavel_id = $1`, demonstra que o projeto também possui um conceito de atendimentos limitados por responsável.

**Cenário de falha/abuso:** um portador de token ativo que conheça ou obtenha um ID de pedido pode chamar a rota de entrega para um pedido não atribuído a ele; se houver itens em `concluido`, eles podem ser marcados como entregues e entrar no total devido da comanda.

**Impacto:** entrega registrada incorretamente, cobrança antecipada ou indevida, divergência entre operação física e caixa e perda de rastreabilidade sobre quem realizou a entrega.

**Recomendação:** definir explicitamente se entrega é global ou restrita por atribuição. Se restrita, validar a atribuição da sessão dentro da mesma transação e sob lock, não só no handler. Se global, restringir dados retornados, registrar motivo/ator e assegurar que a interface exija confirmação clara da mesa e dos itens.

**Teste para encerrar:** em PostgreSQL descartável, criar duas mesas/sessões e dois garçons sintéticos; tentar entregar com o token do garçom A um item pronto da mesa atribuída ao garçom B. Esperado: 403/409 e nenhuma alteração de status/total se a política for restrita. Para política global, teste deve confirmar a regra documentada, log/auditoria e confirmação de mesa.

### A-14 — P2: token bearer do garçom persiste no navegador e pode ficar na URL

**Status:** comportamento confirmado no código; não foi comprovado vazamento em logs, histórico compartilhado ou cabeçalhos do deployment.

**Evidência concreta**
- `public/garcom-pwa/app.js` lê o token de `location.search` (`?token=...`) ou de `localStorage` e grava o token de URL novamente em `localStorage`.
- O mesmo token é usado em URLs de API para identificar e autorizar o garçom.
- O service worker evita cache de URLs `/api/`, o que é um controle positivo; isso não remove o token do histórico do navegador nem do armazenamento persistente local.
- `db/garcons.js:getGarcomPorToken` trata o token como credencial bearer e só exige que o garçom exista e esteja ativo.

**Cenário de falha:** aparelho compartilhado, sessão do navegador não encerrada, perfil do navegador sincronizado ou URL encaminhada a terceiros permite reutilizar o token enquanto ele continuar ativo. XSS no mesmo origin também pode ler o token em `localStorage`.

**Impacto:** acesso às rotas de garçom com o nível de permissão associado ao token; o impacto cresce devido aos achados A-07/A-10 e A-13.

**Recomendação:** evitar token de longa duração em query string; trocar por sessão curta revogável e armazenamento menos acessível a scripts quando a arquitetura permitir; remover token da URL após capturá-lo com `history.replaceState`; estabelecer procedimento de revogação/rotação e política de uso em dispositivos compartilhados. A migração de mecanismo de autenticação exige projeto próprio, não incluído nesta auditoria.

**Teste para encerrar:** teste de navegador em staging, com token sintético, verificando remoção da query string, persistência após reload, logout/revogação e impossibilidade de reutilização depois de desativar o garçom. Inspecionar logs/proxy apenas em ambiente autorizado sem registrar o token.

### A-15 — P2: política de retry da PWA exige validação ponta a ponta para confirmar idempotência em falhas de rede

**Status:** mecanismo de proteção visível no código; falha de duplicação não confirmada. É uma lacuna de validação, não um bug provado.

**Evidência concreta**
- `public/garcom-pwa/app.js` cria `localId` e `idempotencyKey` ao guardar o pedido offline no IndexedDB.
- `syncOne(localId)` persiste estado `sync`, chama primeiro `/api/garcom/:token/mesas/:mesa/assumir` e depois envia o pedido com a mesma `idempotencyKey`.
- `recoverInterruptedSync()` converte registros deixados em `sync` para `offline`, para tentar novamente após reinício.
- `db/pedidos.js:criarPedido` tenta reproduzir o pedido original por sessão/chave e a migration `0018_transacional_idempotencia.sql` fornece a proteção de unicidade quando aplicada. A própria auditoria A-06 registra que a introspecção pode desabilitar silenciosamente o uso da chave se a coluna não existir ou a consulta de schema falhar.

**Cenário de falha:** pedido chega ao servidor, mas a resposta se perde; a PWA reinicia e reenvia. O desenho tenta evitar duplicação pela mesma chave, mas isso depende da migration presente, da estabilidade da chave no IndexedDB e do caminho de retry completo.

**Impacto:** se qualquer pré-condição de idempotência não estiver satisfeita, o cliente pode ver estado incerto ou pedidos duplicados; a equipe pode preparar/cobrar duas vezes.

**Recomendação:** não classificar o fluxo como validado só por testes estáticos. Fazer a suíte de integração com PostgreSQL descartável, incluindo perda simulada da resposta depois do commit, reinício do navegador e duas sincronizações concorrentes com a mesma chave. Falha na introspecção de schema deve ser visível em readiness/telemetria quando a idempotência for requisito financeiro.

**Teste para encerrar:** comprovar que 2+ POSTs simultâneos com mesma mesa e chave geram exatamente um pedido e uma baixa de estoque; reiniciar a PWA entre commit e resposta e confirmar que o mesmo ID de pedido é recuperado. Repetir após migration de banco vazio e upgrade a partir de schema anterior.

### Validação desta passada — resultados reais

- Inspeção por GitHub Contents API dos arquivos existentes na branch `audit/production-readiness`: `server.js`, `db/atendimento.js`, `db/garcons.js`, `db/pedidos.js`, `db/caixa.js`, `db/pix-cliente.js`, `db/auth.js`, `db/queries.js`, `db/event-access.js`, `db/migrate.js`, `db/pool.js`, `scripts/start-production.js`, `public/garcom-pwa/app.js`, `public/garcom-pwa/sw.js`, `public/garcom-pwa/index.html`, `package.json`, `README.md`, `AGENTS.md`, `COORDENACAO.md` e este relatório.
- Comandos de terminal, `npm ci`, `npm test`, `npm run test:regression`, typecheck, build e testes de PostgreSQL: **não executados nesta passada**. O conector utilizado permite inspecionar o conteúdo do repositório, mas não fornece aqui um terminal de checkout para executar os comandos.
- Testes HTTP, exploração, carga, navegador real, Railway e PostgreSQL: **não executados**.
- Nenhum teste mutável foi apontado para produção; nenhum banco ou variável de produção foi acessado.
- PRs #35, #36 e #37 não foram alterados.

**Conclusão:** a revisão estática encontrou lacunas reais de escopo de autorização no fluxo de garçom, além de riscos já descritos no relatório. A auditoria não demonstra que o deployment atual esteja explorável nem comprova a configuração real de produção. Não declarar o QRAdmin pronto para produção até concluir os testes de autorização, integração com PostgreSQL isolado, recuperação da PWA e verificação de migrations/readiness.

---

## 12. Continuação da auditoria — 2026-10-24 (passada complementar)

**Escopo:** revisão estática focalizada em concorrência da sincronização offline da PWA, consistência financeira, configuração de pool/timeouts, migrations e capacidade de 50 mesas. A branch e o PR existentes foram preservados. Nenhum código da aplicação foi alterado nesta auditoria.

### A-16 — P2, PWA: disparadores concorrentes podem tentar sincronizar o mesmo rascunho

**Status:** condição de corrida confirmada por leitura estática; duplicação efetiva não demonstrada. A proteção server-side reduz o risco apenas quando a migration de idempotência e a chave estável estão disponíveis.

**Evidência concreta**
- Em public/garcom-pwa/app.js, syncPending filtra registros offline e chama syncOne; syncOne lê o registro, verifica o status, depois grava status sync. A leitura/verificação/gravação não é aquisição atômica de lock.
- saveOrder chama syncOne diretamente; o botão chama syncPending; o evento online chama syncPending; e a inicialização também chama syncPending. Não há mutex compartilhado por localId entre esses disparadores.
- O mesmo rascunho preserva idempotencyKey e db/pedidos.js tenta reconhecer replay. db/conta.js, porém, permite continuar sem idempotência se a coluna não for encontrada ou a introspecção falhar; a migration 0018 é necessária para a garantia no banco.

**Cenário e impacto:** dois disparadores podem ler o mesmo rascunho como offline antes de qualquer gravação do estado sync e enviar duas requisições. Com schema atualizado e chave preservada, espera-se recuperar o mesmo pedido. Se a proteção do banco estiver ausente, pode haver pedido/baixa de estoque duplicados.

**Recomendação:** manter a idempotência no PostgreSQL como controle autoritativo, tornar a ausência da proteção visível em readiness/telemetria e adicionar mutex local por localId como defesa complementar.

**Teste necessário:** em navegador de teste e PostgreSQL descartável, disparar simultaneamente syncOne, botão e evento online para o mesmo localId; simular perda da resposta depois do commit, reiniciar a PWA e confirmar um único pedido e uma única baixa de estoque. Repetir com migration aplicada e sem a coluna, confirmando comportamento seguro.

### Consistência financeira — controles e limites

**Controles positivos confirmados estaticamente:** db/caixa.js bloqueia mesa e sessão na ordem documentada; registrarPagamento e fecharSessao usam transações e rollback; pagamento parcial recalcula o total de itens entregues e impede valor acima do saldo; fechamento impede pedidos pendentes, valida desconto e taxa, rejeita pagamentos anteriores acima do valor cobrado e registra o restante antes de fechar sessão/mesa. db/pix-cliente.js registra um aviso, não uma liquidação bancária; a confirmação pelo caixa é uma ação separada. A migration 0018 define índices únicos parciais para chaves de pedido, pagamento, fechamento e vínculo aviso PIX→pagamento.

**Risco residual:** db/conta.js:colunaExiste() guarda em cache a detecção e retorna false quando a introspecção falha; as operações podem continuar sem idempotência. Isso confirma degradação de proteção no código, não que o schema de produção esteja incompleto. A auditoria não executou corridas de pagamento/fechamento, falhas parciais, rollback após erro de escrita ou reconciliação bancária. O replay retorna a operação existente para a mesma chave sem comparar payload; o cliente deve reutilizar a chave somente para a mesma operação lógica e isso deve ser testado.

### Inicialização, migrations e timeouts

- package.json declara start como node server.js e start:prod como node scripts/start-production.js; o comando efetivamente configurado no Railway não foi verificado.
- server.js começa a escutar e tenta migrations com timeout de 30 segundos; em falha registra aviso e mantém o processo vivo. scripts/start-production.js também documenta continuar após falha. O comportamento fail-open está confirmado no código, mas não há evidência de que tenha ocorrido no deployment.
- db/pool.js exige DATABASE_URL ao carregar o módulo. Os defaults observados são PG_POOL_MAX=10, timeout de conexão 10 s, statement/query 30 s, lock 15 s e transação ociosa 30 s. DATABASE_SSL_REJECT_UNAUTHORIZED=false desativa validação de certificado TLS; o valor efetivo de produção não foi acessado.
- Erros inesperados são registrados pelo servidor; logs reais não foram inspecionados, portanto exposição de token/dados pessoais em logs não foi confirmada nem descartada. Reinício abrupto, falha de migration, indisponibilidade transitória, backup/restore e compatibilidade entre versões não foram testados.

### Capacidade para 50 mesas — estimativa versus medição

- db/atendimento.js:assumirMesa aceita mesas até 70 e verifica a quantidade habilitada. db/pool.js usa pool padrão de 10 conexões.
- scripts/carga-70-mesas.js descreve 70 mesas simultâneas, SSE aberto, check-in, dois pedidos por mesa, preparo, entrega, pagamentos parciais em metade e fechamento. scripts/teste-carga.js descreve burst, concorrência de estoque, pagamentos e fechamento duplo.
- Um comentário em db/pool.js menciona 431 versus 428 req/s numa comparação anterior de pool 10/20. Esta passada não reproduziu nem validou esse resultado com logs/artefatos; não o considera medição própria.
- **Resultado medido nesta passada: nenhum.** Não foi executado teste de carga nem conectado servidor/banco. A capacidade de 50 mesas não está validada por esta entrega. Os scripts de carga alteram pedidos, estoque, entregas, pagamentos e sessões; só devem rodar em ambiente descartável confirmado.
- Para medir: usar ambiente isolado com configuração representativa, dados sintéticos, scripts de carga, e registrar sucesso, p50/p95/p99, 4xx/5xx, deadlocks/locks, espera e uso do pool, CPU/memória, conexões PostgreSQL e reconciliação item a item.

### Arquivos e funções efetivamente examinados nesta passada

- server.js: rotas de pedido/cancelamento, garçom, caixa, autorização por papel, handler global de erros e inicialização.
- db/pedidos.js: criarPedido, cancelarPedidoCliente, editarPedidoCliente e idempotência.
- db/atendimento.js: listarMesasGarcom, assumirMesa, deixarMesa, criarPedidoGarcom e listagem de atendimentos.
- db/garcons.js: getGarcomPorToken e entregarComoGarcom.
- db/caixa.js: travarSessao, listSessoesAbertas, registrarPagamento e fecharSessao.
- db/conta.js: cálculo do total entregue, total pago, sincronização e colunaExiste.
- db/pix-cliente.js, db/auth.js, db/pool.js, db/migrate.js, scripts/start-production.js, package.json.
- db/migrations/0016_pix_avisos.sql, db/migrations/0018_transacional_idempotencia.sql.
- public/garcom-pwa/app.js: saveOrder, syncOne, syncPending, recoverInterruptedSync e disparadores de sincronização.
- public/garcom-pwa/sw.js: cache do shell e bypass de cache para /api/.
- scripts/carga-70-mesas.js e scripts/teste-carga.js.

### Comandos e resultados reais desta passada

- Terminal, npm ci, npm test, npm run test:regression, npm run typecheck, npm run build, testes HTTP, PostgreSQL, navegador e carga: **não executados**. O acesso disponível permitiu leitura de arquivos e metadados via GitHub, não checkout executável local.
- Leitura dos arquivos listados acima na branch audit/production-readiness: concluída.
- CI executado para o commit de documentação b2fe653eb74af1df8a015270d74101bb9266166d: run #163, conclusão success (https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40118914869). Os logs confirmam npm ci, npm run typecheck, npm run build, npm run test:regression (94 testes, 94 passaram, 0 falharam) e verificações de sintaxe de server/db. Como o PR altera somente documentação, esses checks verificam a integridade do projeto nesse commit, mas não testam dinamicamente os achados nem incluem PostgreSQL/browser/carga.
- Nenhum teste mutável foi executado; nenhuma migration foi aplicada; nenhum dado, variável ou log de produção foi acessado.

### Situação dos achados após a revisão complementar

- **Confirmados por inspeção estática:** tokens de mesa expostos pela listagem global do garçom (A-10); cancelamento público referenciando variável não declarada (A-12); ausência de revalidação transacional da atribuição na edição (A-11); ausência de verificação de atribuição na entrega, condicionada à política operacional pretendida (A-13); token de garçom persistido em URL/localStorage (A-14); concorrência potencial entre disparadores de sincronização da PWA (A-16).
- **Riscos de arquitetura/configuração confirmados, mas não como exploração no deployment atual:** rate limit local/chaveado por token (A-02), migrations best-effort (A-04), degradação de idempotência se schema/introspecção falhar e opção de TLS sem validação (A-06).
- **Não confirmados dinamicamente:** bypass explorável no deployment, duplicação real de pedido, deadlock, pagamento duplicado, perda de dados por falha parcial, falha de migration em produção, configuração TLS insegura, exposição de segredo em logs ou capacidade para 50 mesas.
- **Sem nova conclusão de IDOR cross-tenant:** o produto continua explicitamente single-tenant; não há evidência suficiente para classificar uma vulnerabilidade cross-tenant num deployment multi-loja que não foi demonstrado.
- **Conclusão de release:** não declarar pronto para produção antes de validar autorização do garçom, testar cancelamento e transações financeiras em PostgreSQL descartável, provar idempotência sob falha de rede/restart, verificar comando de start/schema no ambiente operacional e medir carga em ambiente isolado.


---

## 13. Auditoria focalizada — consistência financeira, concorrência e dia operacional (2026-10-24)

**Registro relacionado:** issue #39 — https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/39. Esta seção não implementa mudanças na regra de cobrança. PR #33 continua sendo a suíte unitária/contratual com mocks; PR #38 verifica migrations em PostgreSQL descartável. Nenhum dos dois, sozinho, prova o comportamento concorrente das funções financeiras reais.

### Matriz de cenários e evidência

| Área/cenário | Evidência disponível | Resultado desta auditoria | Próxima prova exigida |
|---|---|---|---|
| Chave estável no pedido | `db/conta.js` aceita `idempotencyKey`/aliases; `db/pedidos.js` consulta a coluna; migration 0018 cria índice único parcial por sessão/chave | Implementação parcial confirmada por leitura; chave opcional, portanto clientes sem chave não recebem garantia server-side | PostgreSQL descartável: chave igual concorrente, perda de resposta pós-commit, reinício do processo e contagem real de pedidos/itens/estoque |
| Duplo toque/retry na PWA | `public/garcom-pwa/app.js` mantém `idempotencyKey`, mas `syncOne` é disparado por vários caminhos sem lock local atômico | Condição de corrida nos disparadores confirmada estaticamente; duplicação real não comprovada | Duas chamadas sincronizadas para o mesmo rascunho e validação da resposta com mesmo ID |
| Pagamentos parciais/repetidos | `db/caixa.js` usa transação, bloqueio de sessão e valida o saldo; migration 0018 define unicidade opcional por sessão/chave | Controles de aplicação presentes; chave de pagamento não é obrigatória e não houve teste concorrente real | Duas sessões HTTP concorrentes com chave igual/diferente; reconciliar lançamentos, saldo e total pago |
| Pagamento vs fechamento | `registrarPagamento` e `fecharSessao` usam transação/lock da sessão segundo leitura estática | Atomicidade pretendida pelo código, não demonstrada sob corrida/falha | Barreira concorrente real e injeção de falha entre insert/update/commit; verificar sessão, mesa, pagamentos e saldo após rollback |
| PIX manual repetido | Migration 0018 cria índice único parcial em `sessao_pagamentos.pix_aviso_id`; `db/caixa.js` associa aviso ao pagamento | Restrição presente no código da migration; aplicação no ambiente operacional não foi verificada. PIX não é liquidação bancária automática | Aplicar migrations em PG efêmero; confirmar o mesmo aviso duas vezes em paralelo e contar exatamente um pagamento |
| Estoque em pedidos concorrentes | `db/pedidos.js` bloqueia produtos em ordem crescente e atualiza estoque com condição de disponibilidade; migration 0018 inclui CHECK não negativo NOT VALID | Estratégia de lock/rollback presente estaticamente; o mock de regressão não representa lock PostgreSQL | Duas compras da última unidade; verificar uma confirmação, uma rejeição, estoque >= 0 e ausência de pedido parcial |
| Cancelamento/retorno de estoque | Fluxo de cancelamento e restauração estático; relatório anterior aponta referência a variável não declarada em `cancelarPedidoCliente` | Defeito potencialmente bloqueante confirmado por inspeção estática, não por chamada dinâmica | Teste de regressão com pedido sintético e PG descartável; confirmar erro corrigido em PR separado e estoque restaurado uma vez |
| Status/entrega parcial | Cálculo autoritativo do caixa soma itens `entregue`; status por item é separado | Distinção entregue vs concluído está presente; consistência entre transições concorrentes ainda sem prova de banco | Cozinha/bar/garçom concorrentes, entrega parcial e rollback; conferir status de item/pedido e total |
| Valores monetários | `db/conta.js` usa `SUM(...)::float`, depois `Number(...)`/`toFixed(2)`; `db/pedidos.js` calcula totais em JS com `Number` | Risco de representação/arredondamento IEEE-754 confirmado estaticamente; não foi demonstrado centavo incorreto em produção. Tipos reais das colunas devem ser conferidos em schema efêmero | Casos 0,01/0,10/10,25, descontos/taxas e muitas linhas; comparar centavos esperados com valores persistidos e respostas |
| Rateio de centavos | Não foi localizado contrato de divisão de conta nesta passada | Regra não definida; não inventar comportamento | Se divisão existir, decidir método (ex.: maiores restos) e critério de desempate; caso contrário, marcar fora do escopo |
| Totais de cliente/caixa | Comentários e funções em `db/conta.js` indicam total devido calculado dos itens entregues e `valor_total` como espelho | A regra atual não deve ser alterada nesta auditoria. O total bruto de pedidos, o total entregue e o saldo são conceitos diferentes e precisam de nomes explícitos no contrato | Contrato proposto: `totalPedido` (itens aceitos, incluindo pendentes), `totalEntregue` (itens entregues), `totalPago` (pagamentos confirmados), `saldoDevido=max(0,totalEntregue-totalPago)`; validar cliente e caixa com mesma origem |
| `APP_TIMEZONE` | `db/relatorio.js` sanitiza timezone; `db/dashboard.js` usa variável; `db/atendimento.js` deriva data local com Intl | Fuso local aparece em múltiplos pontos, com risco de divergência se consultas/formatadores diferirem; não houve teste em limites de data | Eventos sintéticos antes/depois da meia-noite local, UTC e mudança de horário sazonal quando aplicável; comparar dashboard, relatório e métricas |
| Dia operacional às 05:00 | Não foi identificada uma configuração de hora de virada nesta inspeção | Requisito de negócio ainda aberto; não alterar relatórios para 05:00 sem decisão explícita | Definir se o dia é civil (00:00) ou operacional (ex. 05:00), e como tratar eventos 00:00–04:59; depois criar testes e uma issue de implementação |

### Observação sobre idempotência e constraints

A migration 0018 cria chaves únicas apenas quando a chave não é NULL. Isso é correto como constraint de proteção para clientes que enviam chave, mas não protege clientes que a omitem. Além disso, `colunaExiste()` em `db/conta.js` transforma falha de introspecção em `false`, permitindo que a operação continue sem idempotência. O comentário documenta essa escolha como degradação graciosa, mas para operação financeira o modo fail-open precisa de decisão explícita: readiness/alerta pode ser mais seguro do que anunciar proteção que não está ativa. Não se conclui que a migration esteja ausente no deployment; isso não foi verificado.

A mesma chave reaproveitada com payload diferente também precisa de semântica definida. O índice único evita segunda linha, mas não demonstra por si só que o servidor rejeita payload divergente ou compara hash do conteúdo; isso será incluído nos testes do issue #39.

### Contrato de totais sugerido (proposta, não mudança implementada)

- `totalPedido`: soma dos itens aceitos no pedido, independentemente de ainda estarem em preparo.
- `totalEntregue`: soma dos itens cujo estado efetivo é `entregue`, com adicionais, segundo a regra atual.
- `totalPago`: soma dos lançamentos de pagamento confirmados.
- `saldoDevido`: `max(0, totalEntregue - totalPago)`.
- `saldoPotencial`: opcional para UI, calculado com itens ainda não entregues, sempre rotulado como estimativa e sem usá-lo como valor cobrável.

Não alterar a regra atual de cobrança nesta auditoria. Cliente e caixa devem exibir rótulos inequívocos e nunca somar `totalPedido` ao `totalEntregue`.

### Resultado de CI observado durante esta continuação

- PR #33 / workflow run #162: **FAILURE** — 111 passaram, 1 falhou de 112. O caso que falhou foi `criação rejeita produto inexistente e produto indisponível sem confirmar pedido`. O motivo observado foi `Missing expected rejection`: o cliente falso devolvia o produto 8 existente/disponível mesmo nos cenários configurados como inexistente/indisponível. Isso é um defeito no fixture do teste, não evidência de defeito da aplicação. A fixture foi corrigida na branch do PR #33 para refletir os dois estados; a correção precisa de novo CI antes de declarar o teste aprovado.
- PR #38 / workflow run #164: **SUCCESS** — a cadeia de migrations e a segunda execução do runner passaram em PostgreSQL 16 descartável. Esse job não exercita pedidos/pagamentos concorrentes e não é evidência de idempotência de operações financeiras.
- PR #34 / workflow run #163: **SUCCESS** — 94/94 regressões existentes passaram para o commit de documentação; o relatório foi o único arquivo do PR. Não executou testes de integração financeira.
- Nenhuma contagem de requisições concorrentes, linhas financeiras reais, rollback de pagamento ou restart de aplicação foi obtida nesta auditoria.

### Limitações e próximos passos

1. Usar o issue #39 para estender o job PostgreSQL já existente no PR #38 e os contratos do PR #33, não duplicar a suíte.
2. Executar os cenários com PostgreSQL descartável e apresentar contagens persistidas, versão, comando, commit e workflow.
3. Separar defeitos estáticos confirmados de hipóteses que dependem de transação concorrente.
4. Decidir política de dia operacional antes de modificar consultas e relatórios.
5. Não fazer merge/deploy, não tocar em produção e não aplicar correções financeiras amplas nesta etapa.
