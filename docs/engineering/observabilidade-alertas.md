# Observabilidade: health check, logs e alertas

**Issue relacionada:** [#43](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/43).  
**Revisado em:** 05/11/2026.

## 1. Health check implementado

GET /healthz verifica a aplicação **e a conectividade básica com o PostgreSQL**. Não é apenas um liveness do processo.

- Executa somente SELECT 1, sem leitura de tabelas de negócio, escrita ou mutação.
- Aplica statement_timeout curto (1 segundo por padrão).
- HEALTH_DB_TIMEOUT_MS controla o limite de espera pela verificação do banco; o padrão é 1000 ms.
- Retorna 200 {"status":"ok","db":"ok"} quando o banco responde.
- Retorna 503 {"status":"degraded","db":"unavailable"} quando a conexão/consulta falha ou excede o limite.
- Não expõe host, usuário, versão, driver, configuração ou detalhe interno na resposta. O erro técnico fica apenas no log do processo, associado ao request ID.

O endpoint é GET-only e read-only. A sondagem não chama operações de domínio e não altera dados.

### Smoke HTTP

npm run health:smoke executa um único GET para uma URL explicitamente informada. Defina HEALTHCHECK_URL com endereço terminado em /healthz. O script não segue redirects nem realiza chamadas mutáveis.

Exemplo:

~~~bash
HEALTHCHECK_URL=https://seu-host/healthz npm run health:smoke
~~~

O smoke não substitui a validação do banco: o endpoint já inclui o SELECT 1.

## 2. Logs estruturados e correlação

- Toda requisição recebe um X-Request-Id na resposta, gerado pela aplicação ou aproveitado do edge quando o cabeçalho de correlação atende ao formato estrito (server/request-context.js).
- Erros 4xx são registrados como level=warn; falhas internas como level=error, com request ID, método, caminho sanitizado, status e mensagem.
- A sanitização (db/log-sanitizer.js) remove query string, substitui tokens de mesa/garçom no caminho por [REDACTED] e varre UUIDs em mensagens/stack.
- Não registrar senha, hash, token, chave PIX, cookie, segredo ou dados pessoais desnecessários.

A trilha de auditoria de negócio é distinta dos logs técnicos. Consulte [auditoria operacional](./auditoria-operacional.md) para saber quais ações geram eventos persistidos.

## 3. Alertas externos

O repositório contém componentes e testes de composição/notificação, mas isso **não prova que um alerta esteja ativo no ambiente de produção**. Para declarar um alerta operacional, é necessário confirmar destinatário, provedor/canal, limiar, configuração no ambiente e entrega de teste.

A decisão registrada do responsável é utilizar **e-mail** como canal operacional. Permanecem dependentes de configuração e evidência:
- configurar o provedor/destinatário e as credenciais no ambiente, sem versioná-las;
- definir limiares e responsável por receber/tratar;
- enviar um evento sintético em ambiente não produtivo;
- registrar timestamp, destinatário e confirmação de recebimento.

Condições que devem ser monitoradas após configuração:

| Alerta | Condição sugerida | Severidade |
|---|---|---|
| Aplicação/banco indisponível | /healthz falhando ou retornando 503 por janela definida | Crítica |
| Deployment com falha | Deployment Railway com status failed | Crítica |
| Erros 5xx em rajada | Aumento sustentado de logs level=error | Alta |
| Rate limit recorrente | Repetição de 429 em operações sensíveis | Média |
| Falha de migration no startup | Gate fail-closed encerra o processo | Crítica |
| Banco/infraestrutura | Alertas nativos de disponibilidade e capacidade do provedor | Média |

Sem a configuração e a evidência de entrega, alertas externos devem ser descritos como pendentes, não como operantes.

## 4. O que permanece sob responsabilidade operacional

- Confirmar o health check configurado no Railway para usar o caminho /healthz e interpretar 503 como degradação.
- Configurar e testar alertas por e-mail.
- Definir responsável operacional e janela de resposta.
- Confirmar backup/restauração real no provedor; o teste automatizado/drill local não substitui evidência de recuperação da instalação.
- Registrar incidentes e ações de recuperação no runbook operacional.

## 5. Testes relacionados

- tests/healthcheck.test.cjs: método GET, comportamento read-only e ausência de mutações.
- tests/postgres-healthz-banco.test.cjs: banco acessível resulta em 200; banco indisponível resulta em 503 sem vazar detalhes internos.
- scripts/health-smoke.js: verificação HTTP externa.
- tests/alerta-notificacao.test.cjs: validações da composição/sanitização das notificações.

Para reproduzir os cenários de banco, use PostgreSQL descartável e as instruções da suíte correspondente. Não execute testes mutáveis em produção.
