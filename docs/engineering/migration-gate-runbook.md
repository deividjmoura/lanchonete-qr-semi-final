# Gate de migrations e inicialização de produção

**Issues relacionadas:** [#40](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/40)
e [#6](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/6).

## Fluxo de release

O fluxo de produção deve manter as migrations como gate anterior à abertura da porta HTTP:

1. **Pre-deploy:** npm run db:migrate && npm run db:seed aplica as migrations versionadas em db/migrations/*.sql. O seed é não destrutivo para cardápio existente quando executado sem FORCE_SEED.
2. **Start do container:** npm run start:prod executa node scripts/start-production.js.
3. O runner executa db/migrate.js novamente (idempotente) e só carrega server.js se o processo terminar com código 0.
4. Erro de spawn, saída não-zero ou timeout de 30 segundos encerram o processo sem abrir a porta. A aplicação não recebe tráfego com schema potencialmente incompatível.
5. npm start, npm run start:api e npm run start:prod apontam para o mesmo gate. node server.js/npm run server permanecem caminhos de desenvolvimento local e não devem ser usados como comando de produção.
6. **Build do frontend é pré-requisito do start (13/11/2026).** O `dist/` não é mais versionado por inteiro; o deploy precisa rodar `npm ci && npm run build` antes de `npm start`. Em `NODE_ENV=production`, `server.js` chama `lib/exigir-build.js` no callback do `listen` e, sem `dist/index.html`, fecha o servidor e sai com código 1 — em vez de cair no HTML legado de `public/`. `FRONTEND_BUILD_REQUIRED=0` aceita a degradação de propósito.

## Matriz de validação

| Cenário | Evidência | Resultado esperado |
|---|---|---|
| Migration em banco limpo | CI postgres-migrations e postgres-integration | Aplica a cadeia de migrations versionadas |
| Migration já aplicada | Job executa db:migrate duas vezes | Segunda execução informa que não há migration pendente |
| Falha de SQL | tests/start-production.test.cjs | Servidor não inicia, exit 1 e erro sem segredos |
| Timeout/erro de spawn | tests/start-production.test.cjs | Servidor não inicia, exit 1 |
| Caminho feliz | tests/start-production.test.cjs | loadServer() só é chamado após migrations concluídas |
| Build ausente em produção | tests/dist-versionado.test.cjs | Servidor não abre a porta, exit 1, mensagem com `npm run build` |
| Build presente | tests/dist-versionado.test.cjs | Sobe normalmente |
| Build ausente fora de produção | tests/dist-versionado.test.cjs | Segue (suítes postgres-* com NODE_ENV=test) |

## Observabilidade do schema e do banco

A tabela schema_migrations (filename, applied_at) registra migrations aplicadas. Consulta read-only para diagnóstico:

~~~sql
SELECT filename, applied_at
FROM schema_migrations
ORDER BY filename;
~~~

O endpoint GET /healthz executa SELECT 1 com timeout curto e valida conectividade básica com o PostgreSQL:

- banco acessível: 200 {"status":"ok","db":"ok"};
- banco indisponível ou consulta excedendo o limite: 503 {"status":"degraded","db":"unavailable"}.

A resposta não revela versão do schema, host, usuário ou detalhes internos. O limite de espera é configurável por HEALTH_DB_TIMEOUT_MS (padrão 1000 ms). Detalhes: [observabilidade e alertas](./observabilidade-alertas.md).

## Regras de compatibilidade (expand/contract)

Toda migration nova deve seguir:

1. **Aditiva primeiro:** colunas/tabelas novas entram com IF NOT EXISTS, defaults seguros e sem NOT NULL sem default em tabela existente.
2. **Duas fases para mudança destrutiva:** a versão nova do código passa a escrever no formato novo mantendo leitura do antigo; só depois de implantada e validada é que uma migration posterior remove o formato legado.
3. **Sem DDL dentro de handler de requisição:** DDL fica em db/migrations/*.sql.
4. **Uma transação por migration:** o runner aplica cada arquivo em transação, com rollback em falha.

## Plano de rollback

- Rollback de **código** é o redeploy da versão anterior no Railway.
- Migrations aditivas normalmente não precisam ser desfeitas: o código anterior ignora colunas/tabelas novas.
- Se uma migration falhar, a transação é revertida e o deploy não recebe tráfego. Corrija com uma **nova migration**; não edite arquivo já aplicado, pois ele não será executado novamente.
- Antes de migration não retrocompatível, registre na PR: backup recente, janela de manutenção e SQL de reversão testado em banco descartável.

## Responsabilidades operacionais

- Manter pre-deploy e start apontando para os scripts versionados.
- Confirmar a configuração do health check do provedor para /healthz.
- Executar e registrar o drill real de backup/restore do provedor (issue #41) antes do go-live; rollback de banco não pode depender apenas do rollback de código.
