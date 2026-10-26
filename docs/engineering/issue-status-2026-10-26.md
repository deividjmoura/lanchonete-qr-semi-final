# Status consolidado das issues — 2026-10-26

Registro único do fechamento da rodada de pendências entregue nas PRs #123 e
#122 (ambas mescladas na `main`; CI da `main` verde nos dois workflows).
Os comentários correspondentes devem ser publicados em cada issue no GitHub;
este documento existe como fonte duradoura caso a publicação automática falhe
por permissão do token de integração.

## Evidências comuns

- PR #123 (`a006e4f`) e PR #122 (`341535d`) mescladas; zero PRs abertas.
- 245/245 testes herméticos locais; suítes PostgreSQL validadas em PostgreSQL
  16.2 real descartável (integração, financeira, garçom, QR/sessão,
  concorrência, troca de senha e drill `pg_dump`/`pg_restore`).
- Deploy Railway ativo em 26/10/2026 17:41 BRT (commit `60f8c6c0`): logs do
  gate com "Nenhuma migration pendente. Banco já está atualizado." e
  "Migrations verificadas. Iniciando servidor de produção...".

## Issues propostas para fechamento imediato

### #39 — testes de integração financeira e concorrência

Criado `tests/postgres-financial-concurrency.test.cjs`, executado nos dois
workflows (`ci.yml` e `postgres-integration.yml`) contra PostgreSQL 16
descartável, cobrindo:

- corrida pela última unidade de estoque (exatamente uma compra aceita;
  estoque nunca negativo; um único pedido gravado);
- idempotência: chave inválida rejeitada, chaves distintas separam pedidos,
  replay com payload divergente devolve o pedido original sem baixar estoque;
- arredondamento monetário com valores 0,01 + 0,10 + 10,25 no fechamento;
- pagamentos parciais concorrentes sem ultrapassar o saldo e rollback de
  fechamento inválido.

Evidência: 4/4 da suíte em PostgreSQL 16.2 real descartável e CI verde.

### #40 — gate seguro de migrations

- O start de produção (`npm run start:prod` → `scripts/start-production.js`)
  roda o migrador e só carrega o servidor se ele sair com código 0; falha ou
  timeout impedem a porta de abrir (fail-closed). Coberto por
  `tests/start-production.test.cjs`.
- Runbook: `docs/engineering/migration-gate-runbook.md` com o fluxo real do
  Railway, matriz de validação, expand/contract e rollback.
- Evidência do deploy de 26/10/2026 17:41 BRT nos logs do Railway.

### #6 — auto-migrate não bloqueante

O auto-migrate best-effort dentro do `listen` não é mais o caminho de
produção: `scripts/start-production.js` executa `db/migrate.js` antes de
carregar `server.js` e encerra com exit 1 em falha de SQL, erro de spawn ou
timeout de 30 s — sem abrir a porta, o deploy não recebe tráfego com schema
incompatível. Teste em `tests/start-production.test.cjs`; runbook em
`docs/engineering/migration-gate-runbook.md`; evidência real no Railway.

## Issues com entrega de código e pendência de decisão/operação

### #55 — troca de senha (P1)

Código completo na `main` (migration 0024, CSRF, rate limit, revogação de
sessões, auditoria, advisory lock); 7/7 testes em PG 16.2 descartável. Em
produção está desligada com `STAFF_FORCE_PASSWORD_CHANGE=false`. **Falta:**
janela com os operadores, remover a variável no Railway, redeploy e validar
as 4 contas. 2FA TOTP segue como proposta documentada separada.

### #53 — fotos do cardápio sem Base64

Rota read-only e cacheável `GET /api/cardapio/fotos/:id`; cardápio público
sem Base64 (redução >99,9% na fixture de 40 fotos); 5 testes herméticos; RFC
atualizada. O título da issue está plenamente atendido — sugerido fechar e
abrir issue nova para a etapa 2 (object storage), que depende de fornecedor.

### #50 — proxy e rate limit

Chave por conta de staff (`login-user:<login>`, 10/5 min) além do limite por
IP (8/5 min); 8 testes e runbook `rate-limit-and-proxy.md`. **Falta:**
ativar `CLIENT_IP_HEADER=x-real-ip` no Railway só após validar que o edge
sobrescreve o cabeçalho enviado pelo cliente.

### #48 — autoria e auditoria

Migration aditiva 0025 + `db/auditoria.js` (sanitização de segredos,
contexto limitado, gravação transacional); eventos `pedido_cancelado`,
`pix_confirmado` e `sessao_fechada`; 7 testes herméticos e asserts em PG
real; matriz em `auditoria-operacional.md`. **Faltam decisões:** contas
individuais/PIN, alçada de desconto, retenção da trilha, auditoria das
mutações de admin e quem consulta a trilha.

### #47 — ciclo de vida do QR fixo

`tests/postgres-qr-session.test.cjs` prova o comportamento atual em PG 16;
`qr-session-policy.md` lista 4 opções e recomenda oficializar a opção 1 (QR
fixo; sessão abre no 1º pedido). **Falta:** decisão formal do responsável.

### #43 — health check e alertas

`X-Request-Id` em todas as respostas e logs JSON sanitizados com correlação
(`server/request-context.js`, 6 testes); `observabilidade-alertas.md` propõe
limiares e canais. **Faltam:** alertas reais no provedor, canal e plantão;
readiness com checagem de banco é opcional.

### #44 — política de dados e retenção

Proposta completa em `data-policy-proposal.md` (financeiro 5 anos,
anonimização de nomes aos 90 dias, auditoria 2 anos, sessões 30 dias, logs
30–90 dias). Nenhum purge automático foi habilitado. **Falta:** aprovação
formal dos prazos e da base legal; job em PR própria depois.

### #45 — licença e proveniência de ativos

`asset-provenance.md`: 145 arquivos públicos (70 em `demo`), sem `LICENSE`
na raiz, biblioteca QR coberta por MIT, imagens demo sem origem documentada.
Nada foi alterado. **Faltam as decisões do proprietário:** licença,
visibilidade do repositório e destino das imagens demo.

### #41 — backup e restore (P0)

Ferramenta de drill e `tests/postgres-backup-restore.test.cjs` passaram 2/2
em PG 16.2 descartável com `pg_dump`/`pg_restore`; seção 4.1 de
`backup-restore.md` traz o checklist do Railway. **Falta:** o drill no banco
do provedor com registro de RPO/RTO — única ação que fecha a issue.
