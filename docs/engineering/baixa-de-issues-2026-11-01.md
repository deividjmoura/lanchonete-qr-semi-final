# Baixa de issues — evidência e texto pronto (2026-11-01)

> **Por que este documento existe:** a automação deste ambiente tem permissão de leitura em issues,
> não de escrita (`403 Resource not accessible by integration` ao comentar/fechar via API). Nada foi
> alterado nas issues. Os textos abaixo estão prontos para colar — cada um traz a **evidência conferida
> em `main`** (commit, arquivo:linha e teste executado).

## Resumo

| Issue | Situação real | Ação recomendada |
|---|---|---|
| #53 | **Entregue** em `772a3a4` | comentar + fechar |
| #48 | **Entregue** em `772a3a4` | comentar + fechar |
| #50 | **Entregue** em `772a3a4` | comentar + fechar |
| #43 | **Parcial**: 5 de 7 critérios | comentar marcando 5 caixas, manter aberta |
| #55 | **Parcial**: troca de senha pronta; 2FA fora de escopo | corrigir checklist, manter aberta |
| #41, #44, #45 | Pendentes de verdade | não mexer |
| #171, #173, #175 | Em execução na Frente B | não mexer |

---

## #53 — Tirar fotos do cardápio em base64 das respostas JSON

```md
Implementado e verificado em `main` pelo commit `772a3a4` ("feat(security): fechar pendências de
rate limit, auditoria, logs e fotos").

Evidência conferida agora em `main`:
- `db/cardapio.js:67` monta `fotoUrl: resolverFotoUrl(p.foto_url, p.id)` — o JSON do cardápio não
  transporta mais bytes; data-URLs viram URL de mesma origem. O comentário no próprio código
  referencia esta issue.
- `server.js` serve `GET /api/cardapio/fotos/:id` (read-only, público, 404 para id inválido/sem foto)
  via `db/foto-serve.js`, com cache.
- `db/admin.js` continua rejeitando upload acima de ~400 KB antes de persistir.
- Regressão: `node --test tests/cardapio-foto-url.test.cjs` → 5/5 passando, incluindo content-type
  ativo em data-URL (reforçado depois pelo `de92a14`, #128).
- O commit registra redução > 99,9% no payload de uma fixture de 40 fotos.

Fechando por já estar entregue. Se aparecer algum caminho que ainda serialize Base64 em JSON,
reabre com o payload.
```

## #48 — Registrar autoria persistente de ações financeiras e operacionais

```md
Implementado e verificado em `main` pelo commit `772a3a4`.

Evidência conferida agora em `main`:
- `db/migrations/0025_auditoria_eventos.sql` cria a tabela de eventos.
- `db/auditoria.js` expõe `registrarEvento(client, { atorTipo, atorId, acao, alvoTipo, alvoId,
  contexto })`, gravado na mesma transação da ação (sem evento órfão nem ação sem autor).
- Chamadas reais: `db/pedidos.js` (cancelamento e criação com autoria) e `db/caixa.js` (fechamento
  de sessão e confirmação de PIX).
- Sem segredos no payload: `db/log-sanitizer.js` cobre a redação.
- Regressão: `node --test tests/auditoria.test.cjs` → 7/7 passando.

Fechando por já estar entregue. Se faltar cobertura em algum endpoint específico, o caminho é abrir
uma issue de escopo incremental em vez de manter esta aberta.
```

## #50 — Endurecer confiança no proxy e validar rate limit por IP, token e sessão

```md
Implementado e verificado em `main` pelo commit `772a3a4`.

Evidência conferida agora em `main`:
- `security/client-ip.js` resolve o IP do cliente apenas pelo socket; `X-Forwarded-For` é ignorado
  até a implantação declarar quantos proxies confiáveis existem (`trustedProxyHops`), com aviso
  explícito de que o valor não pode ser inferido do próprio header.
- `server.js:110` mantém o padrão deliberadamente zero hops.
- Rate limit com duas chaves independentes: por IP e por conta de staff no login
  (`golpePermitido` em `db/rateLimit.js`) — variar o IP não contorna o limite da conta.
- Runbook de proxy documentado (`CLIENT_IP_HEADER`).

Fechando por já estar entregue. O ponto que sobra é operacional, não de código: confirmar o número
de hops do provedor real (Railway). Sugiro transformar isso em item de checklist de go-live.
```

## #43 — Health check read-only, smoke seguro e alertas

Marcar 5 dos 7 critérios; **manter aberta** (alertas com teste demonstrado e decisão sobre checar banco
seguem pendentes).

```md
Atualização de estado (2026-11-01). Critérios conferidos em `main`:

- [x] Endpoint de saúde que não altera estado — `GET /healthz` responde apenas `{status:"ok"}`,
      sem consultar banco nem expor versão/configuração (`server.js:271`).
- [x] Decisão documentada sobre processo × conectividade — hoje é **liveness puro** (só processo),
      escolha explícita em comentário no código.
- [x] Smoke read-only separado de scripts mutáveis — `npm run health:smoke`
      (`scripts/health-smoke.js`, exige `HEALTHCHECK_URL`) contra `test:smoke` (mutável) e
      `test:full`.
- [x] Logs estruturados com request/correlation id — `server/request-context.js`, `X-Request-Id` em
      todas as respostas, sanitização em `db/log-sanitizer.js`.
- [x] Sem chamadas mutáveis automáticas contra produção no smoke.
- [ ] Alertas: limiares, canal, responsável e **teste de alerta demonstrado** — proposta existe em
      `docs/engineering/observabilidade-alertas.md`, mas nada foi validado em ambiente de teste.
- [ ] Decidir se a checagem deve incluir conectividade de banco (readiness) — hoje não inclui.

Mantendo aberta pelos dois itens acima.
```

## #55 — Troca de senha + avaliação de 2FA

**Manter aberta.** Corrigir o checklist (a troca de senha já está pronta) e registrar que 2FA virou
issue própria.

```md
Correção de checklist e escopo (2026-11-01).

A troca de senha **já está implementada e validada** em `main`, não é pendência:
- `POST /api/me/senha` e `POST /api/admin/contas/senha` (`server.js:640` e `server.js:943`);
- UI em `src/components/TrocarSenha.tsx`;
- `db/auth.js` com política de senha e invalidação de sessão;
- regressões `tests/reset-senha.test.cjs` e `tests/gerenciador-senhas.test.cjs` passando, além da
  suíte de integração `postgres-password-change` (15/15) no CI.

**2FA continua NÃO implementado** — conferi o código: não há `totp`/`2fa` em nenhum lugar. A decisão
registrada foi separar o assunto: sai desta issue e vira issue própria com plano TOTP, incluindo o
bloqueio operacional (quem tem acesso ao segredo, como recuperar acesso, o que fazer com sessões).
Proposta em `docs/engineering/admin-credentials-and-2fa.md`.

Sugiro renomear esta issue para "Troca de senha segura" e marcar como concluída, deixando o 2FA na
issue nova.
```

---

## Observação sobre #41 (P0, backup/restauração)

Continua **aberta e não verificada por mim**: não há `psql`/`pg_dump` nem Docker neste ambiente, e o
simulador descartável (`embedded-postgres`) não substitui um drill real de restore. Não fechar sem
evidência de restauração em ambiente isolado.
