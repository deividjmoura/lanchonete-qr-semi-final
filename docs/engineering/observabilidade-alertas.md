# Observabilidade: health check, logs e alertas

**Issue relacionada:** [#43](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/43).

## 1. Sinal de saúde implementado

- `GET /healthz` responde `200 {"status":"ok"}` sem consultar banco, criar
  registros ou expor versão/configuração. É um *liveness* read-only do processo
  HTTP. O endpoint fica antes de qualquer mutação e da leitura de corpo.
- `npm run health:smoke` (`scripts/health-smoke.js`) faz um único GET para uma
  URL explicitamente informada, restrita a caminho terminado em `/healthz`,
  sem seguir redirects e sem qualquer chamada mutável.
- O smoke está separado dos scripts mutáveis (`test:smoke`, `test:full`,
  `test:carga`, `test:seguranca`, `test:dia`), que nunca devem apontar para
  produção sem autorização.

## 2. Logs estruturados com correlation ID

- Toda requisição recebe um `X-Request-Id` na resposta, gerado na aplicação ou
  aproveitado do edge quando o cabeçalho de correlação vem em formato estrito
  (`server/request-context.js`).
- Erros 4xx viram linha JSON de `level=warn` e falhas internas `level=error`,
  com `reqId`, método, caminho sanitizado, status e mensagem.
- A sanitização (`db/log-sanitizer.js`) remove query string, substitui tokens
  de mesa/garçom no caminho por `[REDACTED]` e varre UUIDs em mensagens/stack.
  Nenhum segredo, chave PIX, senha ou dado pessoal deve ser incluído no log.

## 3. Proposta de alertas (decisão e configuração do responsável)

A configuração de alertas vive no provedor (Railway) e exige decisão de canal
e responsável; o repositório não guarda credenciais de webhook. Recomendação:

| Alerta | Condição sugerida | Severidade | Canal proposto |
|---|---|---|---|
| Aplicação fora do ar | health check HTTP do provedor falhando por 2–3 minutos | Crítica | Telegram/WhatsApp do plantonista + e-mail |
| Deployment com falha | deployment Railway com status `failed` | Crítica | Mesmo canal |
| Erros 5xx em rajada | > 5 linhas `level=error` em 5 minutos | Alta | Canal de operações |
| Rate limit disparando | 429 repetidos no login (> 20 em 10 min) | Média | Registro para triagem, sem acordar plantão |
| Falha de migration no startup | processo encerrado pelo gate fail-closed | Crítica | Alerta de deployment + runbook de migrations |
| Disco/banco do provedor | alertas nativos de uso de armazenamento/CPU | Média | E-mail |

Evidência de teste do alerta (fase de habilitação): disparar um evento
sintético em ambiente de não produção, capturar a entrega no canal escolhido e
registrar timestamp, responsável que recebeu e ação de reconhecimento no
registro de incidente (seção 7 do runbook de operações). Sem essa evidência, o alerta não deve ser
declarado operante.

## 4. O que ainda depende do provedor

- Criar/confirmar os alertas do painel do Railway e os canais de notificação.
- Definir o responsável pelo plantão e a janela de resposta (SLA interno).
- Opcional: um *readiness* que teste conectividade do PostgreSQL sem consulta
  pesada (ex.: `SELECT 1`), separado do *liveness* atual, para o provedor não
  matar instâncias durante falhas transitórias de banco.
