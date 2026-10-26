# Rate limit e confiança no proxy — runbook

**Issue relacionada:** [#50](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/50).
**Código:** `security/client-ip.js`, `db/rateLimit.js`, rota `POST /api/login` em `server.js`.

## Como funciona hoje

O resolvedor de IP do cliente é **fail-closed por padrão**: sem configuração
explícita, `X-Forwarded-For` (XFF) é ignorado e o IP efetivo é o par do socket.

Duas variáveis de ambiente, ambas opt-in, controlam a confiança no edge:

| Variável | Efeito | Quando usar |
|---|---|---|
| `TRUSTED_PROXY_HOPS=N` | Confia nos N últimos saltos do XFF (proxy mais próximo à direita). Cadeia curta/malformada cai para o IP do socket. | Quando houver N proxies confiáveis que acrescentam o IP observado à direita e a origem não for acessível diretamente. |
| `CLIENT_IP_HEADER=x-real-ip` | Lê um cabeçalho de IP único do provedor (Railway edge envia `x-real-ip`). Valor inválido cai para o socket. | Topologia Railway atual, **somente após confirmar que o edge sobrescreve o cabeçalho enviado pelo cliente**. |

Nunca inferir hops a partir do próprio cabeçalho nem ativar as variáveis por
suposição. Enquanto ambas estiverem ausentes, o IP visto pela aplicação é o do
proxy do provedor.

## Chaves de rate limit

| Chave | Limite | Escopo |
|---|---|---|
| `login:<ip>` | 8 tentativas / 5 min | Por IP de origem |
| `login-user:<login>` | 10 tentativas / 5 min | Por conta de staff, qualquer IP |
| `senha:<staffId>` | 5 / 15 min | Troca de senha por conta |
| `senha-ip:<ip>` | 20 / 15 min | Troca de senha por IP |
| `pedido:<ip>:<tokenMesa>` | 10 pedidos / 5 min | Por IP e mesa |

A chave por conta (`login-user`) impede varredura de senha contra um login
específico mesmo que o atacante varie o IP/XFF. O limite por IP continua
existindo, mas uma equipe atrás do mesmo Wi-Fi/NAT não trava sozinha: as
contas distintas têm orçamentos próprios.

## Limites conhecidos da implementação

- Os buckets ficam em memória, **por processo**. Não há limite global entre
  réplicas nem persistência após reinício (teste caracterizador em
  `tests/rate-limit-keys.test.cjs`). Se o serviço escalar para várias
  instâncias, mover o limitador para Redis/Upstash ou para o edge do provedor.
- Sem `CLIENT_IP_HEADER`/`TRUSTED_PROXY_HOPS`, o limite `login:<ip>` usa o IP
  do proxy e fica global por acidente; o limite por conta ainda protege cada
  login. Por isso a ativação do cabeçalho confiável é item operacional
  pendente, não uma mudança de código.

## Procedimento de ativação no Railway (somente com autorização)

1. Confirmar no painel do provedor que o edge define/sobrescreve
   `x-real-ip` e que a origem da aplicação não recebe tráfego direto.
2. Em um ambiente de não produção, enviar requisições com `x-real-ip`
   forjado e comparar o IP efetivo observado nos logs com o IP real de teste.
3. Definir `CLIENT_IP_HEADER=x-real-ip` na variável de ambiente do serviço e
   fazer deploy. Repetir a verificação com cabeçalho forjado: o valor do
   cliente deve ser ignorado/sobrescrito.
4. Validar login bem-sucedido e uma sequência de falhas para confirmar os
   limites por IP e por conta, sem executar testes destrutivos em produção.
5. Registrar o resultado, a data e o responsável em
   `docs/COMUNICACAO-AGENTES.md`.

Nenhuma das variáveis deve ser ativada sem os passos 1–2. A aplicação nunca
executa testes de rate limit contra produção; a validação funcional fica nos
testes herméticos (`tests/client-ip.test.cjs`, `tests/rate-limit-keys.test.cjs`).
