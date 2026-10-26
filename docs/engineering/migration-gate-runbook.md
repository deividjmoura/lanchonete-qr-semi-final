# Gate de migrations e inicialização de produção

**Issues relacionadas:** [#40](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/40)
e [#6](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/6).

## Fluxo de release verificado

Evidência registrada em 2026-10-26 (`docs/COMUNICACAO-AGENTES.md`), lida
diretamente da configuração do Railway no projeto `exquisite-nurturing`:

1. **Pre-deploy:** `npm run db:migrate && npm run db:seed` — aplica as
   migrations versionadas em `db/migrations/*.sql`; o seed é não destrutivo
   sem `FORCE_SEED` (não definida no serviço).
2. **Start do container:** `npm run start:prod` →
   `node scripts/start-production.js`.
3. O runner (`scripts/start-production.js`) executa `db/migrate.js` de novo
   (idempotente) e **só carrega `server.js` se o processo sair com código 0**.
   Erro de spawn, saída não-zero ou timeout de 30 s encerram com
   `process.exitCode = 1` sem abrir a porta — o deploy falha e o tráfego não
   é recebido por uma versão incompatível com o schema.
4. `npm start`, `npm run start:api` e `npm run start:prod` apontam todos para
   o mesmo gate. `node server.js`/`npm run server` permanecem como caminho de
   desenvolvimento local e não devem ser usados como comando de produção.
5. O auto-migrate best-effort dentro do `listen` do `server.js` existe apenas
   como rede de segurança para o modo desenvolvimento; no fluxo de produção
   real o gate roda antes de qualquer `listen`.

## Matriz de validação

| Cenário | Onde é provado | Resultado esperado |
|---|---|---|
| Migration bem-sucedida em banco limpo | CI `postgres-migrations` e `postgres-integration` (PostgreSQL 16 descartável) | Aplica toda a cadeia 0001→atual |
| Já aplicada (idempotência) | Job `postgres-migrations` roda `db:migrate` duas vezes | Segunda execução: "Nenhuma migration pendente" |
| Falha de SQL | `tests/start-production.test.cjs` com spawn injetado retornando status 1 | Servidor não inicia, exit 1, mensagem de erro sem segredos |
| Timeout/erro de spawn | Mesmo arquivo, `error` simulado (inclusive `ETIMEDOUT`) | Servidor não inicia, exit 1 |
| Caminho feliz do gate | Mesmo arquivo, status 0 | `loadServer()` chamado após a mensagem de sucesso |

## Observabilidade da versão do schema

- A tabela `schema_migrations (filename, applied_at)` registra cada migration
  aplicada. Consulta somente leitura para diagnóstico:
  `SELECT filename, applied_at FROM schema_migrations ORDER BY filename;`
- O runner imprime cada arquivo aplicado e o total ao final; o gate registra
  "Migrations verificadas" antes de iniciar o servidor.
- O endpoint `GET /healthz` é apenas liveness de processo e não expõe versão;
  um readiness com checagem de banco pode ser adicionado sem expor dados
  (ver `observabilidade-alertas.md`).

## Regras de compatibilidade (expand/contract)

Toda migration nova deve seguir:

1. **Aditiva primeiro:** colunas/tabelas novas entram com `IF NOT EXISTS`,
   defaults seguros e sem `NOT NULL` sem default em tabela existente.
2. **Duas fases para mudança destrutiva:** a versão nova do código passa a
   escrever no formato novo mantendo leitura do antigo; só depois de
   implantada e validada é que uma migration posterior remove o formato
   legado (contract). Nunca renomear coluna em uma única etapa.
3. **Sem DDL dentro de handler de requisição:** DDL só existe em
   `db/migrations/*.sql` (ADR-011).
4. **Uma transação por migration** (já é o comportamento do runner, com
   rollback automático em falha).

## Plano de rollback

- O rollback de **código** é o redeploy da versão anterior no Railway; como o
  gate roda migrations antes do `listen`, uma versão antiga nunca sobe se
  exigir um schema que não existe.
- Migrations aditivas (padrão atual, inclusive 0022–0025) normalmente não
  precisam desfazer: o código antigo ignora colunas/tabelas novas.
- Se uma migration falhar, o runner já devolve rollback SQL da transação; o
  deploy não recebe tráfego. A correção é uma **nova migration** consertando
  o estado — nunca editar um arquivo já aplicado, porque ele não volta a
  rodar (está em `schema_migrations`).
- Antes de migration não retrocompatível, registrar na PR: backup recente
  (ver `backup-restore.md`), janela de manutenção e o SQL de reversão
  testado em banco descartável.

## O que permanece como responsabilidade operacional

- Manter o pre-deploy e o comando de start apontando para os scripts
  versionados; qualquer mudança nessa configuração exige atualização deste
  documento e validação do gate.
- Executar o drill de backup/restore real do provedor (issue #41) antes do
  go-live: rollback de banco não pode depender apenas do rollback de código.
