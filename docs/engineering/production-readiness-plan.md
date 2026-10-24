# QRAdmin — Plano consolidado de prontidão de produção

**Data da revisão:** 2026-10-24  
**Branch:** `audit/production-readiness-plan-20261024`  
**Escopo:** plano de ação transversal a partir do código e dos PRs existentes. Não é certificação de produção, nem substitui os relatórios especializados de segurança e consistência financeira.  
**Restrições respeitadas:** sem alterações em produção, banco, variáveis, hospedagem ou Railway; sem merge/deploy; sem migração de dados; sem alteração de visibilidade, histórico, marca ou imagens.

## 1. Resumo executivo

O QRAdmin é documentado como instalação **single-tenant** para um estabelecimento. O README declara explicitamente que não há integração com gateway bancário/confirmacão automática PIX, que o comprovante é não fiscal e que a PWA ainda exige validação ponta a ponta. O produto não deve ser anunciado como emissor fiscal, conciliador bancário automático ou solução SaaS multi-loja.

Há um risco operacional confirmado no código: `scripts/start-production.js` inicia `server.js` mesmo se o runner de migrations falhar ou exceder 30 segundos. Isso pode evitar um processo encerrado, mas também pode servir código que espera um schema que não foi atualizado. Não foi alterado porque a solução depende de conhecer o fluxo real de deploy, compatibilidade das migrations e rollback.

O código configura um pool PostgreSQL com padrão de 10 conexões e timeouts; o rate limit e o registro de clientes SSE são locais ao processo. A capacidade real, a necessidade de coordenação entre instâncias, os limites do banco/provedor e a restauração de backup **não estão comprovados** por esta revisão estática. O PR #27 também deixa os testes de carga 10/25/50 pendentes.

O repositório está público (`private=false` via API do GitHub) e não foi encontrado arquivo `LICENSE` na raiz. O campo `"private": true` em `package.json` não torna o repositório GitHub privado. Nenhuma alteração foi feita nesses itens.

## 2. Evidências e documentos existentes

- [PR #27 — capacidade e confiabilidade para 50 mesas](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/27): revisão estática e plano de carga; o próprio PR afirma que 50 mesas ainda não estão certificadas por execução reproduzível.
- [PR #35 — runbook operacional](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/35): procedimentos de incidente; não comprova backup, alertas ou restore.
- [PR #36 — matriz de go-live](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/36): 18 critérios pendentes de evidência.
- [PR #37 — revisão de CI/CD e startup](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/37): documenta o startup fail-open e lacunas de integração/pós-deploy; é documentação, não correção.
- [PR #38 — migrations em PostgreSQL descartável](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/38): adiciona job de PostgreSQL 16 para executar migrations duas vezes. É um gate de migrations, não teste integrado de pedidos/caixa. O PR estava aberto e não foi assumido como parte de `main`.

Buscas de issues abertas por termos como backup, PIX, LGPD, NFC-e e observabilidade não retornaram resultados específicos. Isso não prova que não existam issues com títulos genéricos; a lista deve ser conferida antes de abrir tarefas novas.

## 3. Inventário dos pontos 6–22

Status significa o que foi observado no repositório ou nas evidências disponíveis; não representa a prontidão da produção.

| # | Área | Status | Evidência e lacuna |
|---|---|---|---|
| 6 | Servidor HTTP e arquitetura | **Confirmado / decisão técnica** | `server.js` tem 1.056 linhas e concentra roteamento HTTP, tratamento de erros, serving de SPA/arquivos e inicialização/rotas. É Node HTTP nativo. O tamanho justifica modularização incremental, não uma reescrita automática. |
| 7 | Rate limit e SSE entre instâncias | **Confirmado no código; topologia não verificada** | `db/rateLimit.js` usa `Map` em memória e documenta que não compartilha contadores. `db/events.js` mantém clientes SSE em um `Map` local. Não há evidência de fan-out entre processos. Só introduzir Redis ou PostgreSQL LISTEN/NOTIFY se a topologia/requisito real exigir múltiplas instâncias. |
| 8 | Proxy, IP e rate limit | **Parcial / requer validação** | O rate limit é por processo. A interpretação segura de IP atrás do proxy e o comportamento com Wi-Fi compartilhado precisam de teste e confirmação da configuração de proxy. O PR #34 documenta riscos de proxy; não se considera corrigido. |
| 9 | Fotos e payload do cardápio | **Confirmado em parte; tamanho real não medido** | `db/foto.js` documenta WebP como data-URL em `foto_url` no PostgreSQL; saída otimizada tem limite padrão de 320 KiB. `db/cardapio.js` devolve `fotoUrl` junto do catálogo e `GET /api/cardapio` serializa o resultado. Uma data-URL base64 de 320 KiB binários pode ocupar aproximadamente 427 KiB antes do JSON; isso é limite teórico por imagem, não medida de resposta real. Medir catálogo real em ambiente isolado antes de migrar. |
| 10 | `public/`, SPA, `data/db.json`, `package.backend.json` | **Estrutura confirmada; remoção não autorizada** | A árvore contém `public/`, `src/` React/Vite e `data/db.json`; README o descreve como catálogo de demonstração para seed. O servidor ainda contém fallback/redirects para HTMLs legados. `package.backend.json` não apareceu na árvore de `main` consultada. Não apagar arquivos sem rastrear referências e testar deploy sem SPA. |
| 11 | TypeScript no backend | **Confirmado** | Frontend é React/TypeScript; API/servidor e scripts são JavaScript. Migrar módulos isolados e tipar contratos gradualmente, sem conversão integral como pré-requisito de go-live. |
| 12 | Precisão monetária | **Parcial / auditoria financeira necessária** | Schema usa `NUMERIC(10,2)` em preços e totais; a camada de cardápio converte preços para `Number`. É necessário rastrear cálculos, arredondamento e divisão de pagamentos em toda a API antes de afirmar que não há risco de ponto flutuante. Ver PR #33 e auditoria financeira dedicada. |
| 13 | Idempotência de pedidos | **Mecanismo parcialmente evidenciado** | Existe migration `0018_transacional_idempotencia.sql` e o PR #33 cobre parte da regressão. Ainda é necessária evidência com PostgreSQL real para repetição simultânea, timeout/retry e reinício; a existência da migration não prova o comportamento ponta a ponta. |
| 14 | Transações, pagamentos, fechamento e estoque | **Parcialmente coberto** | O PR #33 descreve testes de regressão com clientes/fakes e retries de deadlock/serialização. Falta diferenciar explicitamente o que foi testado em PostgreSQL real e executar cenários concorrentes de pagamentos/fechamento/estoque em banco descartável. |
| 15 | Dia operacional e fuso horário | **Parcial / regra de negócio a decidir** | `.env.example` define `APP_TIMEZONE=America/Sao_Paulo`. Não foi comprovado nesta rodada um cutoff operacional uniforme (por exemplo, virar o dia às 05:00) em todos os relatórios e fechamentos. Definir a regra com o estabelecimento e cobrir limites de meia-noite/fuso em testes. |
| 16 | LGPD, dados pessoais e retenção | **Parcialmente confirmado** | O fluxo público coleta nome do cliente (README) e o banco armazena pedidos/sessões/pagamentos; existem contas da equipe. `db/purge.js` permite purge manual de histórico fechado, mas isso é destrutivo e não prova política de retenção nem agendamento automático. Não foi localizada evidência de purge agendado. A base legal e os prazos devem ser definidos pelo responsável com assessoria adequada, não presumidos pelo código. |
| 17 | Voz, notificações e PWA | **Implementação presente; comportamento real não verificado** | README descreve SSE, alertas sonoros/voz e PWA offline; também declara que a PWA precisa de validação ponta a ponta em dispositivo/navegador real. Web Speech API pode depender de navegador, permissões, foco e tela ativa. Testar Android/iOS suportados, tela bloqueada, reconexão e fila offline. |
| 18 | Plano, pool, região, backup e restore | **Configuração parcial; provedor real não verificado** | `db/pool.js` define pool padrão 10, timeout de conexão 10s, statement/query 30s, lock 15s e idle transaction 30s; `.env.example` cita Neon/Render como exemplos, não prova qual provedor está conectado. Plano, região, pooler, limite real, política de backup e restauração bem-sucedida precisam de evidência do ambiente autorizado. |
| 19 | Logs, erros, health e alertas | **Parcial / não verificado externamente** | O código usa logs `console`; não foi localizada evidência suficiente de Sentry/equivalente, alertas com responsável ou health check validado no ambiente publicado. Ausência no código não prova ausência de configuração externa. Criar endpoint de health read-only se necessário e sanitizar tokens/PII nos logs. |
| 20 | CI, PostgreSQL e E2E | **Lacuna confirmada no workflow atual; PR #38 parcial** | `.github/workflows/ci.yml` em `main` roda instalação, typecheck, build, regressões e sintaxe; não provisiona PostgreSQL nem Playwright. PR #38 adiciona migrations em PostgreSQL descartável, mas não fluxo integrado de pedido/caixa. Não há evidência de Playwright E2E ou smoke pós-deploy no workflow consultado. |
| 21 | README, versionamento e fonte da verdade | **Inconsistência confirmada; decisão necessária** | `lanchonete-qr-semi-final` descreve QRAdmin single-tenant e PIX manual; `lanchonete-qr` tem README com badge v2.9 e documentação mais antiga. Ambos são públicos e receberam pushes recentes. `package.json` declara versão 3.1.0 e descrição genérica; a raiz de `lanchonete-qr-semi-final` não contém `LICENSE` na árvore consultada. Responsável deve declarar qual repo é canônico antes de alinhar badges/descrição/topics. |
| 22 | Visibilidade, marca e imagens | **Visibilidade confirmada; direitos não verificados** | A API GitHub retornou `private=false` para `lanchonete-qr-semi-final`; `package.json` com `private:true` não altera isso. README identifica Delicia’s São Miguel e árvore contém `public/branding/delicias`, logos e fotos de demonstração. Licença/proveniência dos ativos e autorização para divulgar a marca não foram comprovadas. Não alterar visibilidade, histórico, marca ou imagens sem aprovação expressa. |

### Medição de fotos: método e limite

- **Medido:** limites declarados no código: entrada 6 MiB, saída WebP 320 KiB, borda máxima 960 px, qualidade 82; o corpo do endpoint de upload tem limite padrão 8 MiB.
- **Estimado:** base64 transforma 320 KiB em cerca de 427 KiB de caracteres, antes do prefixo data-URL e do restante do JSON.
- **Não medido:** tamanho real de `GET /api/cardapio`, quantidade de fotos, latência e memória com o catálogo real. Não havia banco autorizado/isola­do disponível nesta etapa para obter uma amostra representativa.
- **Próximo passo seguro:** medir com catálogo sintético em PostgreSQL descartável, registrar bytes JSON comprimido/não comprimido e p50/p95, e comparar com imagens externas/CDN antes de decidir por object storage. Qualquer migração futura deve preservar URLs antigas e permitir rollback sem apagar dados.

## 4. Priorização consolidada

Esforço é estimativa de engenharia, não compromisso de prazo; pressupõe um desenvolvedor familiarizado com o repositório, ambiente de teste disponível e revisão normal.

### P0 — Bloqueios de segurança operacional antes de operar comercialmente

1. **Resolver estratégia de migrations/startup** — 1–3 dias. Decidir entre etapa de release separada ou fail-closed. Provar em ambiente isolado os casos de sucesso, falha, timeout e migration repetida; documentar compatibilidade e rollback. Não mudar startup sem conhecer o comando real do serviço.
2. **Backup e restauração comprovada** — 0,5–2 dias, excluindo provisionamento/contratação. Confirmar provedor/plano, frequência e retenção; restaurar backup recente em banco isolado; registrar RPO/RTO observados e responsável. PR #35/#36 já documentam o procedimento/critério, mas não são evidência de restore.
3. **Decisão sobre exposição do repositório e direitos dos ativos** — 0,5–1 dia de verificação/decisão; execução técnica depende de autorização. Repositório público e ausência de LICENSE estão confirmados. Definir visibilidade, licença e origem/licença das imagens/marca. Não mudar nada automaticamente.
4. **Bloqueio de release até evidências mínimas** — 0,5–1 dia para definir e vincular evidências. Usar PR #36 como checklist existente; não criar outra matriz. Nenhum item crítico deve ser aprovado só porque existe documentação.

### P1 — Confiabilidade operacional e dinheiro/dados

1. **Integração PostgreSQL para pedidos/caixa** — 2–5 dias. Estender o gate do PR #38 com DB descartável, migrations, pedido, transição de item, pagamento parcial, fechamento e invariantes; não duplicar a validação de migrations.
2. **Idempotência e concorrência financeira** — 2–5 dias além dos testes existentes. Cenários simultâneos de retry, pagamentos parciais e fechamento com reconciliação SQL; resultados reais, não só mocks. Coordenar com PR #33 e a auditoria financeira.
3. **Health/read-only smoke e observabilidade mínima** — 1–3 dias. Definir endpoint que não altere estado, logs estruturados com request ID e sem segredos/PII, alerta com responsável e smoke pós-deploy não mutável em ambiente apropriado. Não automatizar pedido/pagamento em produção.
4. **Teste real da PWA** — 1–3 dias por matriz de navegadores/dispositivos acordada. Usar banco isolado e registrar offline/reconexão/duplicação/Service Worker; a matriz de go-live já contém o critério.
5. **Política de retenção/LGPD** — 1–3 dias para inventário técnico e proposta; prazo/base legal dependem do responsável jurídico/negócio. Documentar dados, finalidade, acesso, retenção, exclusão, solicitações e logs. Não escolher base legal por inferência.
6. **Regra do dia operacional** — 0,5–2 dias de decisão e testes. Confirmar cutoff com o estabelecimento e aplicar regra uniforme a dashboards/relatórios/fechamento.
7. **Auditoria do proxy/rate limit** — 0,5–2 dias. Reproduzir IP atrás do proxy e redes compartilhadas; confirmar cabeçalhos confiáveis e instâncias reais antes de escolher armazenamento compartilhado.

### P2 — Escala e manutenção após baseline operacional

1. **Carga reproduzível 10/25/50 mesas** — 1–3 dias de execução/análise, além de provisionar ambiente. PR #27 já define o plano. Não executar contra produção; medir p50/p95/p99, erros, pool, memória, SSE e invariantes SQL.
2. **Fotos e cache** — 2–5 dias para protótipo/benchmark, mais migração se aprovada. Medir payload; comparar data-URL no Postgres com object storage privado/público conforme requisito, cache-control e CDN. Migração futura deve ser reversível e não apagar as originais.
3. **Modularização incremental do backend** — 3–8 dias por fatia. Extrair rotas por domínio (cardápio, caixa, autenticação, etc.) com testes de contrato; evitar reescrita total de 1.056 linhas.
4. **TypeScript no backend** — 3–10 dias em fatias pequenas, conforme escopo. Começar por tipos compartilhados/contratos e módulos novos; não é bloqueio isolado de go-live.
5. **Framework HTTP (ex. Fastify)** — 3–8 dias para prova de conceito e comparação, sem migração integral. Só avançar se validação, middleware, rotas ou manutenção justificarem custo.
6. **Coordenação multi-instância** — 1–4 dias se o ambiente confirmado exigir réplicas múltiplas; escolher Redis ou PostgreSQL LISTEN/NOTIFY após avaliar volume, durabilidade e operação. Caso seja uma única instância, registrar a limitação aceita e monitorar.
7. **Dependências e permissões CI** — 0,5–2 dias. PR #38 já propõe `permissions: contents: read` no seu branch; conferir o resultado efetivamente integrado, dependabot/auditoria e política de pinagem. Não assumir que PR aberto já afeta `main`.
8. **Revisão de arquivos antigos e documentação** — 1–3 dias. Inventariar referências, caminhos servidos e build/deploy antes de qualquer remoção. Atualizar README/versionamento depois de definir o repositório canônico.

### P3 — Evolução comercial, não requisito automático do piloto

1. **NFC-e/SAT/PDV** — 5–20+ dias para descoberta e protótipo; implementação real pode exigir muito mais, credenciais/certificado, regras estaduais, homologação e contador/software house. Escolher integração por API/PDV ou manter integração externa e exportação; validar tecnicamente e com contador antes de alegar conformidade.
2. **PIX dinâmico e webhook PSP** — 3–10 dias para integração inicial, além de homologação e custos do PSP. Requer provedor escolhido, cobrança identificada, verificação de assinatura, idempotência, reconciliação e estados de pagamento. Até então, comunicar “QR/chave estática e confirmação manual”.
3. **SaaS multi-loja** — projeto de arquitetura separado. O produto está declarado single-tenant; não iniciar tenant_id, billing, onboarding ou painel de suporte sem decisão explícita de mudar o modelo comercial.
4. **Armazenamento de fotos como serviço** — decidir após benchmark e modelo de acesso/custos; não migrar dados reais nesta fase.

## 5. Issues/PRs existentes e cobertura

| Item | Registro existente | O que cobre | O que continua pendente |
|---|---|---|---|
| Startup e CI/CD | [PR #37](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/37) | Documenta risco de migrations e lacunas CI/CD | Estratégia aprovada e correção implementada/testada |
| Critérios de release | [PR #36](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/36) | Checklist de evidências | Preenchimento com evidência por SHA/ambiente |
| Operação/incidentes | [PR #35](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/35) | Procedimentos de resposta | Prova real de backups, restore, alertas e rollback |
| Migrations | [PR #38](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/38) | Migrations do zero e repetibilidade em PG 16 descartável | Merge/CI efetivo e testes de integração da aplicação |
| Capacidade | [PR #27](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/27) | Revisão estática e roteiro de carga | Execução 10/25/50 e métricas |
| Pedidos/financeiro | [PR #33](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/33) | Regressões de pedidos e parte de pagamentos/concorrência | Evidência PostgreSQL real e cobertura concorrente final |
| Segurança | [PR #34](https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/34) | Inventário de riscos de auth/tokens/rotas | Correções e regressões de segurança, conforme achados |

Nenhum PR acima foi marcado como resolvido por existir documentação.

## 6. Bloqueios externos e decisões do responsável

1. **Railway correto e comando real:** não foi possível verificar nesta auditoria o projeto/serviço/ambiente exato, comando de start/pre-deploy, número de réplicas, limites ou logs. O endpoint documentado no README não basta para provar a identidade do serviço. Bloqueio: fornecer acesso autorizado ao projeto correto ou exportar as configurações não secretas. Não modificar outro projeto por aproximação.
2. **Banco/provedor:** `.env.example` cita Neon/Render como exemplos, mas o provedor conectado, região, pooler, plano, limites e backups reais não foram confirmados. Bloqueio para concluir dimensionamento e recuperação.
3. **Regra de negócio do dia:** definir cutoff operacional com o estabelecimento.
4. **Modelo comercial:** confirmar single-tenant para um estabelecimento versus plano futuro de SaaS. Recomendação atual: manter single-tenant no piloto.
5. **Fiscal:** confirmar com contador/software house quais documentos e integrações são exigidos para o estabelecimento e estado. Não presumir que recibo de consumo atende obrigação fiscal.
6. **PIX:** decidir se a confirmação manual é aceitável no piloto ou se precisa de PSP, orçamento, provedor e processo de homologação.
7. **LGPD:** responsável pelo tratamento, finalidades e prazos de retenção precisam de validação do negócio/jurídico.
8. **Repo canônico/licença/marca:** decidir se `lanchonete-qr-semi-final` é a fonte da verdade e como tratar o repo `lanchonete-qr`, licença, visibilidade e ativos. Nenhuma mudança foi feita.

## 7. Comandos, testes e medições realizados nesta etapa

- Consultados metadados e diffs dos PRs #27, #35, #36, #37 e #38.
- Lidos `server.js` (1.056 linhas), `scripts/start-production.js`, `db/pool.js`, `db/rateLimit.js`, `db/events.js`, `db/cardapio.js`, `db/foto.js`, `db/purge.js`, `.env.example`, `package.json`, `.github/workflows/ci.yml`, `README.md` e migration `0001_init.sql`.
- Consultada a árvore de arquivos de `main`; `package.backend.json` não foi encontrado nessa árvore.
- Consultados metadados de ambos os repositórios `lanchonete-qr-semi-final` e `lanchonete-qr`; ambos retornaram `private=false`.
- Consultada a API do GitHub: não foi encontrado arquivo `LICENSE` na raiz de `lanchonete-qr-semi-final`.
- Buscas de issues abertas por backup, PIX, LGPD, NFC-e e observabilidade retornaram zero resultados específicos.
- Estimativa de base64: 320 KiB × 4/3 ≈ 427 KiB, antes do JSON.
- **Não executados:** npm test/build, carga, smoke, consultas ao banco, chamadas mutáveis, restore, testes de navegador, ações no Railway ou testes em produção. Portanto não há métricas runtime nem resultado de CI novo produzido por esta auditoria.

## 8. Critério de encerramento

A auditoria documental está consolidada, mas a prontidão de produção permanece **NO-GO até evidências operacionais** dos critérios críticos: estratégia de migration/startup, restore comprovado, identidade/configuração do deploy, testes integrados com PostgreSQL, fluxo financeiro concorrente, validação da PWA e logs/alertas com responsáveis.

Este documento é um plano de execução e decisões. Não é atestado de conformidade fiscal, bancária, LGPD ou capacidade de carga.
