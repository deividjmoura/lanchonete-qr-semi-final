# Fase 2 — Roteiros executáveis (#41, #43, #50)

**Contexto:** #43 foi implementada em código (notificador de alerta). #41 e #50 dependem de **acesso ao provedor** e não podem ser feitas daqui. Este documento é o roteiro exato — cada comando, cada campo a coletar, e o que fazer com a evidência.

> ⚠️ **Restrição que vale para os três:** nada de ação destrutiva no banco de produção, nada de teste de rate limit contra produção, nada de mudar configuração do Railway sem confirmar o serviço correto.

---

## 1. Issue #41 — Restore de prova (P0)

### 1.1 O que já existe

`scripts/backup-restore-drill.js` está completo e é seguro por construção. Ele:

- exige `RESTORE_DRILL_CONFIRM=isolated-target`
- **recusa** destino igual à origem (mesmo host/porta/banco)
- **recusa** destino cujo nome não indique ambiente descartável (`restore|drill|test|tmp|scratch|sandbox`)
- **recusa** destino que já tenha tabelas — nunca sobrescreve
- lê a origem apenas com `pg_dump` e `SELECT` em transação `READ ONLY`
- verifica schema, migrations, contagem de linhas, sequences e conexão pelo pool real da aplicação
- mede duração do dump e do restore (RTO) e a idade do último dado (RPO)
- gera relatório JSON **sem credenciais**

**Portanto:** a issue #41 não precisa de código. Precisa de **execução** e de um lugar isolado para restaurar.

### 1.2 Passo 1 — Coletar a política de backup no painel do provedor

Antes de restaurar, registre (print ou export da tela, **sem credenciais**):

| Campo | Onde achar | Preencher |
|---|---|---|
| Provedor do banco | Railway (serviço do QRAdmin) | |
| Plano contratado | painel → service → plan | |
| Backup automático: existe? | painel do Postgres | sim / não |
| Frequência | idem | |
| Retenção (dias) | idem | |
| PITR (point-in-time) disponível? | idem | sim / não |
| Fuso/UTC do agendamento | idem | |

> **Se o plano não tiver backup automático:** a issue não fecha por documentação. É preciso decidir entre (a) subir de plano, ou (b) criar um `pg_dump` agendado para storage externo. Registre a decisão.

### 1.3 Passo 2 — Provisionar o destino isolado

Crie um **banco novo e vazio**, descartável, com nome que contenha uma das palavras aceitas (`restore`, `drill`, `test`, `tmp`, `scratch`, `sandbox`).

```bash
# exemplo de nome aceito: qradmin_restore_drill
export RESTORE_DATABASE_URL='postgres://usuario:senha@host:5432/qradmin_restore_drill'
```

Anote o horário de início — vira o dado de RTO.

### 1.4 Passo 3 — Executar o drill

**Modo A — dump direto da origem** (mais simples; exige `pg_dump` disponível):

```bash
SOURCE_DATABASE_URL="$DATABASE_URL_PRODUCAO" \
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" \
RESTORE_DRILL_CONFIRM=isolated-target \
node scripts/backup-restore-drill.js --report evidencias/restore-$(date +%Y%m%d).json
```

**Modo B — arquivo de backup já baixado do provedor** (preferível, porque prova que o backup *do provedor* restaura):

```bash
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" \
RESTORE_DRILL_CONFIRM=isolated-target \
node scripts/backup-restore-drill.js \
  --dump-file /caminho/backup-do-provedor.dump \
  --backup-at 2026-11-05T03:00:00Z \
  --report evidencias/restore-$(date +%Y%m%d).json
```

O `--backup-at` é o horário em que o backup foi gerado. É dele que sai o **RPO**.

> **Prefira o Modo B.** A issue pede prova de que *o backup contratado* é restaurável, não que um dump novo feito na hora funciona.

### 1.5 Passo 4 — Validar o conteúdo restaurado

O script já verifica schema e contagens. Complemente com as invariantes que importam para o negócio, **no banco restaurado** (nunca no de produção):

```sql
-- Nenhuma sessão aberta deve ter valor total negativo
SELECT count(*) FROM mesa_sessoes WHERE status='aberta' AND valor_total < 0;

-- Pagamentos não podem exceder o total da sessão
SELECT count(*) FROM sessao_pagamentos p
JOIN mesa_sessoes s ON s.id = p.sessao_id
WHERE p.valor > s.valor_total + 0.01;

-- Pedidos órfãos (não deve haver nenhum)
SELECT count(*) FROM pedidos p
LEFT JOIN mesa_sessoes s ON s.id = p.sessao_id WHERE s.id IS NULL;

-- Itens órfãos
SELECT count(*) FROM itens_pedido i
LEFT JOIN pedidos p ON p.id = i.pedido_id WHERE p.id IS NULL;
```

Some os totais aqui (`sum(valor_total)` de sessões fechadas) e **compare** com o relatório do provedor. Divergência grande indica backup incompleto.

### 1.6 Passo 5 — Testar a conexão da aplicação

Aponte uma instância local para `RESTORE_DATABASE_URL` e confirme que o app sobe:

```bash
DATABASE_URL="$RESTORE_DATABASE_URL" NODE_ENV=test npm run db:migrate   # deve dizer "nenhuma pendente"
DATABASE_URL="$RESTORE_DATABASE_URL" NODE_ENV=test node -e "require('./db/pool').query('SELECT 1').then(r=>{console.log('pool OK');process.exit(0)})"
```

### 1.7 Passo 6 — Medir e registrar

| Métrica | Definição | Valor |
|---|---|---|
| **RTO** | do início do restore até o app responder | ____ min |
| **RPO** | agora − horário do backup restaurado | ____ h |
| Backup usado | id/data do backup | |
| Responsável operacional | uma pessoa | |

Preencha `docs/engineering/backup-restore.md` com esses números e **feche a issue anexando o JSON do relatório**.

### 1.8 Destruir o destino

```bash
# confirme o nome antes
echo "$RESTORE_DATABASE_URL"
# então apague o banco descartável pelo painel ou com DROP DATABASE
```

---

## 2. Issue #43 — O que falta depois do código

O notificador já está implementado. Para fechar a issue faltam **duas coisas suas**:

### 2.1 Criar o canal e cadastrar o segredo

**Opção Telegram (recomendada, teste em 10 min):**

1. No Telegram, fale com `@BotFather` → `/newbot` → guarde o **token**
2. Envie qualquer mensagem ao seu bot e abra:
   `https://api.telegram.org/bot<TOKEN>/getUpdates` → copie o `chat.id`
3. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - `ALERTA_TELEGRAM_TOKEN` = o token
   - `ALERTA_TELEGRAM_CHAT_ID` = o chat id

**Opção webhook (Slack/Discord/Teams):**

1. Crie um incoming webhook no canal desejado
2. Cadastre o segredo `ALERTA_WEBHOOK_URL` no GitHub

### 2.2 Provar que o alerta chega

```bash
gh workflow run production-healthcheck.yml
```

**O que buscar na evidência:** o comportamento normal é o job **passar** (o site está no ar), e nesse caso o step de notificação **não roda** — ele é `if: failure()`.

Para provar a entrega sem derrubar produção, teste localmente apontando para uma URL inválida:

```bash
ALERTA_WEBHOOK_URL='<sua url>' \
HEALTHCHECK_URL='https://exemplo-invalido.test/healthz' \
ALERTA_MOTIVO='teste de entrega do alerta' \
node scripts/notificar-alerta.js
```

A mensagem deve chegar ao canal. **Salve o print da mensagem recebida e anexe na issue.** Isso satisfaz o critério "demonstrar um teste de alerta em ambiente de teste".

### 2.3 Decisão pendente: o health check deve tocar o banco?

**Estado atual:** `/healthz` responde `{status:'ok'}` sem consultar o banco, e `tests/healthcheck.test.cjs` **proíbe** `pool.query` nesse bloco.

| | Opção | Efeito |
|---|---|---|
| **A** | Manter só processo | Um banco fora do ar continua passando no health check — o pior cenário fica invisível |
| **B** | Adicionar `SELECT 1` com timeout curto | Detecta a falha que importa; exige alterar o teste existente |

> **Recomendação: B**, mas é uma decisão de projeto registrada em teste — não alterei. Se optar por B, o `SELECT 1` deve ter `statement_timeout` de ~1s e o endpoint continua read-only.

---

## 3. Issue #50 — Prova de topologia

O código já está endurecido: `TRUSTED_PROXY_HOPS=0` por padrão, e `X-Forwarded-For` só é lido se explicitamente configurado. Falta **provar como a borda se comporta**.

### 3.1 Identificar o serviço correto

A issue registra o bloqueio: *"a conexão Railway disponível só mostra o projeto `chic-alignment` com serviços do bot SEGA, não o serviço QRAdmin."*

- Confirme no painel qual projeto contém o serviço do QRAdmin
- O health check aponta para `https://qradminn.up.railway.app` — esse é o host público a usar como referência

### 3.2 Teste empírico de XFF (grátis e conclusivo)

```bash
HOST=https://qradminn.up.railway.app

# 1. Baseline: sem cabeçalho
curl -sS -o /dev/null -w '%{http_code}\n' $HOST/healthz

# 2. XFF forjado à esquerda
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'X-Forwarded-For: 203.0.113.77' $HOST/healthz

# 3. Cadeia com 2 hops
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'X-Forwarded-For: 203.0.113.77, 198.51.100.9' $HOST/healthz

# 4. Cabeçalho malformado
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'X-Forwarded-For: nao-e-um-ip' $HOST/healthz
```

**O que observar:** o `X-Request-Id` volta no header. Se você tiver acesso aos logs, procure pela chave de rate limit gerada. **Se o IP `203.0.113.77` for aceito como cliente**, a borda está repassando o cabeçalho do cliente e `TRUSTED_PROXY_HOPS` **deve permanecer 0**.

### 3.3 Verificar se a origem é alcançável direto

Se existir uma URL do Railway que não passa pela borda (ex.: `*.up.railway.internal` ou uma porta pública do serviço), a resposta é: **sim, é alcançável → manter hops em 0**.

### 3.4 Testes de chave de rate limit (ambiente isolado!)

**Nunca contra produção.** Suba uma instância local:

```bash
DATABASE_URL=$LOCAL_DATABASE_URL NODE_ENV=test npm start
```

E exercite, contra `http://127.0.0.1:PORT`:

| Cenário | O que provar |
|---|---|
| Dois clientes no mesmo IP, mesma mesa | Não se bloqueiam indevidamente |
| Dois clientes no mesmo IP, mesas diferentes | Chaves distintas |
| Um cliente com tokens de mesa diferentes | Limite não é contornável trocando token |
| Mesmo IP/token em duas instâncias | Documentar que o limite é por processo |
| Mesmo IP/token após restart | Documentar que o bucket zera |

A suíte `tests/rate-limit-keys.test.cjs` já cobre parte disso. Os dois últimos cenários **só documentam** uma limitação conhecida — não precisam de correção se você opera instância única.

### 3.5 Registrar o limite real

| Pergunta | Resposta |
|---|---|
| A origem é acessível sem proxy? | |
| A borda remove XFF enviado pelo cliente? | |
| `TRUSTED_PROXY_HOPS` correto | |
| Quantas instâncias rodam? | |
| O rate limit é global ou por processo? | |

Preencha e **feche a issue** com o registro. Se a resposta for "uma instância, por processo", isso é aceitável — desde que **documentado**, e não anunciado como limite global.

---

## 4. Resumo do que falta

| Issue | Bloqueio | Ação sua | Custo |
|---|---|---|---|
| **#41** | Acesso ao painel do banco | Baixar backup do provedor + rodar drill | 🟡 ~R$ 10–30 |
| **#43** | Criar canal | Bot do Telegram + 2 secrets + teste | 🟢 R$ 0 |
| **#50** | Localizar serviço QRAdmin | `curl` de XFF + preencher tabela | 🟢 R$ 0 |

Nenhum dos três exige acesso a segredo de produção por mim, e nenhum foi executado aqui.
