# Backup e restauração do PostgreSQL

Issue: [#41](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/41) · Matriz: REL-07

> **Estado honesto:** este documento entrega o **procedimento, a ferramenta e a prova automatizada em CI** de que um
> dump do schema/dados do QR Admin é restaurável em um banco isolado. Ele **não** comprova que o provedor de produção
> mantém backups, nem registra RPO/RTO de produção. Essas evidências dependem de acesso ao provedor e estão no
> checklist da seção 4, **ainda pendentes**. A issue #41 só deve ser fechada quando a seção 4 estiver preenchida.

## 1. O que está provado hoje (CI)

O job `PostgreSQL integration` executa `tests/postgres-backup-restore.test.cjs` contra um PostgreSQL 16 descartável:

- gera o dump (`pg_dump --format=custom`) e restaura (`pg_restore --exit-on-error`) em um **segundo banco**;
- compara tabelas, linhas por tabela, `schema_migrations`, constraints, índices e sequences entre origem e restore;
- confirma que nenhuma sequence ficou atrás do maior `id` (evita colisão de chave no primeiro INSERT pós-restore);
- conecta usando a **mesma configuração de pool da aplicação** (`db/pool.js`) no banco restaurado;
- prova as travas: destino igual à origem, destino não vazio, nome de banco sem cara de descartável e ausência de
  confirmação explícita são **recusados**;
- o relatório JSON não contém URL nem credencial.

Isso valida a **ferramenta e o procedimento**; não substitui o restore de um backup real do provedor (seção 3).

## 2. Ferramenta: `scripts/backup-restore-drill.js`

Requer `pg_dump`/`pg_restore` com versão major **igual ou maior** que a do servidor de origem.

| Modo | Quando usar | Comando |
|---|---|---|
| Snapshot | Valida o procedimento a partir de um banco que você pode ler (staging ou cópia) | `SOURCE_DATABASE_URL=… RESTORE_DATABASE_URL=… RESTORE_DRILL_CONFIRM=isolated-target node scripts/backup-restore-drill.js --report evidencias/restore.json` |
| Arquivo | Valida um backup **baixado do provedor** (`.dump` custom/`pg_dump -Fc`) | `RESTORE_DATABASE_URL=… RESTORE_DRILL_CONFIRM=isolated-target node scripts/backup-restore-drill.js --dump-file backup.dump --backup-at 2026-10-25T03:00:00Z --report evidencias/restore.json` |

Se a origem estiver recebendo escrita durante o dump, use `--tolerate-live-drift` (a origem pode ter crescido; o restore
nunca pode ter mais linhas do que a origem).

Travas (não há flag para desligá-las):

1. exige `RESTORE_DRILL_CONFIRM=isolated-target`;
2. recusa destino com mesmo host/porta/banco da origem;
3. recusa destino cujo nome de banco não contenha `restore`, `drill`, `test`, `tmp`, `scratch` ou `sandbox`;
4. recusa destino que já tenha tabelas — **nunca sobrescreve**;
5. a origem só é lida (`pg_dump` + `SELECT` em transação `READ ONLY`);
6. URLs e senhas nunca são impressas nem gravadas no relatório.

Saída: JSON com `resultado` (`OK`/`FALHA`), durações de dump e restauração, `rto_observado_ms` (restauração +
verificação), `rpo_observado_s` (quando `--backup-at` é informado: diferença entre o horário do backup e o último
pedido restaurado), migrations pendentes em relação ao repositório e a lista de divergências. Código de saída: `0` OK,
`1` divergência, `2` recusa/erro de uso.

## 3. Procedimento de restauração (operação)

1. **Declare o incidente e congele escritas manuais.** Não rode `db:seed`, `FORCE_SEED`, reset ou limpeza.
2. **Escolha o backup** (ponto no tempo) e registre seu identificador e horário (UTC), sem credenciais.
3. **Provisione um banco novo e vazio** (nunca o banco operacional). O nome deve conter `restore`.
4. **Restaure** com a ferramenta acima (modo arquivo) ou com a restauração nativa do provedor para o destino novo.
5. **Verifique** com o relatório: `resultado: OK`, `migrations_pendentes_no_repo` vazio ou conhecido, `divergencias` vazio.
6. **Teste a aplicação** apontando uma instância de staging para o banco restaurado
   (`DATABASE_URL` do restore): login de staff, listagem de mesas/cardápio, abertura de uma comanda sintética.
7. **Decida a troca** (responsável operacional): trocar `DATABASE_URL` do serviço para o banco restaurado, ou copiar
   apenas as linhas necessárias. Registre horário da decisão (fim do RTO).
8. **Pós-incidente:** reconciliar pedidos/pagamentos feitos após o ponto do backup (RPO) com o caixa e com os
   comprovantes impressos; rotacionar credenciais se houve exposição.

Migrations: restaurar um backup **antigo** em código novo exige rodar as migrations pendentes antes de liberar tráfego
(use `npm run start:prod`, que falha fechado se a migration falhar — ver #40/#6).

## 4. Evidência de produção — PENDENTE (preencher com acesso ao provedor)

Nada abaixo foi verificado. Preencher **sem credenciais** e anexar o `restore.json` gerado.

| Item (critério de aceite da #41) | Valor | Evidência |
|---|---|---|
| Provedor, plano e tipo de backup (lógico/PITR/snapshot) | _pendente_ | |
| Frequência e retenção configuradas | _pendente_ | |
| Data/identificador do backup usado no teste | _pendente_ | |
| Destino isolado usado (nome, não URL) | _pendente_ | |
| Resultado do drill (`resultado`, divergências) | _pendente_ | `restore.json` |
| RPO observado | _pendente_ | `rpo_observado_s` |
| RTO observado (inclui provisionamento + troca de `DATABASE_URL`) | _pendente_ | |
| Responsável operacional e acesso de recuperação (quem/como, sem segredos) | _pendente_ | |
| Confirmação de que nada foi restaurado sobre a produção | _pendente_ | |

## 5. Limites conhecidos

- O drill valida integridade lógica (schema, contagens, constraints, sequences, conexão). Não valida desempenho do
  restore em volume real de produção; o RTO só vale para o volume em que foi medido.
- Backups físicos/PITR do provedor não passam por `pg_restore`; use a restauração nativa do provedor para o destino
  isolado e depois aponte `RESTORE_DATABASE_URL`/`SOURCE_DATABASE_URL` para ele e rode a verificação.
- Fotos enviadas pelo admin estão no banco hoje (ver #53); se migrarem para storage de objetos, o backup desse storage
  precisa de procedimento próprio.
