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
3. recusa destino cujo nome de banco não contenha um marcador isolado (`restore`, `drill`, `test`, `tmp`, `scratch` ou `sandbox`, delimitado por início/fim, `_` ou `-`);
4. recusa destino que já tenha tabelas — **nunca sobrescreve**;
5. a origem só é lida (`pg_dump` + `SELECT` em transação `READ ONLY`);
6. URLs e senhas nunca são impressas nem gravadas no relatório; nas chamadas a `pg_dump`/`pg_restore`, a URI sem senha vai em argv e a senha é passada por `PGPASSWORD` no ambiente do subprocesso para evitar exposição na listagem de processos.

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
| Provedor, plano e tipo de backup (lógico/PITR/snapshot) | Railway, plano Hobby — projeto `exquisite-nurturing`, ambiente `production`, serviço `Postgres` (PostgreSQL 18, volume `postgres-volume` 500 MB); snapshot de volume + PITR disponíveis | Consulta Railway CLI em 2026-10-30 (ver 4.2) |
| Frequência e retenção configuradas | **Nenhum backup configurado** em 2026-10-30: sem agendamentos e sem backups existentes; PITR desativado. Decisão: ativar diário (meta RPO 24h) + semanal + mensal (retenção Railway: 6/27/89 dias) | `pitr schedule list` → `[]`; `pitr backup list` → `[]`; `pitr status` → `enabled:false, bucketWired:false` |
| Metas aprovadas pelo responsável | RPO 24h, RTO 4h; restore isolado autorizado | Registro nesta seção em 2026-10-30 |
| Data/identificador do backup usado no teste | _pendente_ | |
| Destino isolado usado (nome, não URL) | _pendente_ | |
| Resultado do drill (`resultado`, divergências) | _pendente_ | `restore.json` |
| RPO observado | _pendente_ | `rpo_observado_s` |
| RTO observado (inclui provisionamento + troca de `DATABASE_URL`) | _pendente_ | |
| Responsável operacional e acesso de recuperação (quem/como, sem segredos) | _pendente_ | |
| Confirmação de que nada foi restaurado sobre a produção | _pendente_ | |

### 4.1 Checklist para fechar a evidência com o provedor (Railway)

A issue #41 só pode ser fechada depois que um operador com acesso ao Railway
preencher a tabela da seção 4. Passos exatos, sem necessidade de expor segredos:

1. No painel do serviço PostgreSQL do projeto, identificar **plano**, tipo de
   backup oferecido (backup diário lógico, snapshot e/ou PITR), frequência e
   retenção. Registrar nomes, nunca credenciais.
2. Baixar o backup mais recente para uma estação de trabalho controlada e
   anotar seu identificador e horário (UTC).
3. Provisionar um banco **novo e vazio** cujo nome contenha `restore_drill`
   (as travas da ferramenta exigem um marcador isolado).
4. Rodar o modo arquivo da ferramenta:
   ```bash
   RESTORE_DATABASE_URL='<url-do-banco-isolado>' \
   RESTORE_DRILL_CONFIRM=isolated-target \
   node scripts/backup-restore-drill.js \
     --dump-file backup-baixado.dump \
     --backup-at 2026-10-26T03:00:00Z \
     --report evidencias/restore-$(date +%F).json
   ```
5. Salvar o `restore.json` (não contém URL nem senha) como evidência e
   preencher RPO (`rpo_observado_s`) e RTO (tempo medido do início do
   provisionamento até a verificação OK).
6. Conectar uma instância de staging no banco restaurado e checar login,
   cardápio e uma comanda sintética; em seguida destruir o banco isolado.
7. Registrar tudo na tabela da seção 4 e na issue #41, com o responsável.

Enquanto esse exercício não for executado com um backup real do provedor, a
issue permanece aberta mesmo com o drill automatizado do CI verde.

### 4.2 Diagnóstico de 2026-10-30 e sequência de ativação

Consultas somente leitura via Railway CLI no projeto `exquisite-nurturing`:

- `pitr status` → `enabled: false`, `bucketWired: false`, `isHaCluster: false`.
- `pitr schedule list` → `[]` (nenhum agendamento).
- `pitr backup list` → `[]` (nenhum backup existente).

Ou seja, até essa data **não havia cópia de recuperação**: em caso de perda do
volume, o RPO era ilimitado. Sequência aprovada para fechar a evidência:

1. Ativar agendamento **diário** (+ semanal e mensal) no painel do serviço
   `Postgres` (Backups). Isso não derruba o serviço e cobre o RPO de 24h.
2. Com o primeiro backup disponível, executar o **restore isolado** pela
   restauração nativa do Railway para um serviço/banco novo (nunca sobre o
   serviço de produção), cronometrar até a aplicação responder e validar
   contagens + `schema_migrations`. Apagar o ambiente restaurado ao final.
3. Ativar o **PITR** em janela combinada de baixo movimento: a ativação
   provoca nova implantação do serviço Postgres (indisponibilidade curta).
   Com o PITR ligado, o RPO cai de até 24h para minutos, com folga sobre a meta.
4. Atualizar a tabela da seção 4 com os valores reais (datas, tempos, destino
   isolado) e fechar a #41 pela PR que referencia esta evidência.

## 5. Limites conhecidos

- O drill valida integridade lógica (schema, contagens, constraints, sequences, conexão). Não valida desempenho do
  restore em volume real de produção; o RTO só vale para o volume em que foi medido.
- Backups físicos/PITR do provedor não passam por `pg_restore`; use a restauração nativa do provedor para o destino
  isolado e depois aponte `RESTORE_DATABASE_URL`/`SOURCE_DATABASE_URL` para ele e rode a verificação.
- Fotos enviadas pelo admin estão no banco hoje (ver #53); se migrarem para storage de objetos, o backup desse storage
  precisa de procedimento próprio.
