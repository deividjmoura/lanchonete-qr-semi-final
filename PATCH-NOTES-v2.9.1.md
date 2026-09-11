# Patch v2.9.1-fixes — Notas

## O que foi corrigido

1. **Migration 0015** — índices de performance nas filas + garantia de coluna `status` em `itens_pedido`.
2. **Rate-limit** — limpeza mais frequente (evita memory leak em chaves antigas).
3. **Transições de status de item** — impede regressão (ex.: concluido → recebido) e deixa o atalho `recebido → concluido` explícito.
4. **SSE** — agora exige staff autenticado **ou** `?mesa=<token-uuid>` (cliente da mesa). Antes era 100% aberto.

## O que ainda precisa de atenção (não alterado automaticamente)

- **Fotos em base64 no Postgres** — continue usando `npm run fotos:fix` e prefira links `/assets/...` ou storage externo no futuro.
- **Rate-limit multi-instância** — se for escalar horizontalmente, troque por Redis.
- **valor_total** — continua sendo atualizado apenas na entrega (design atual). O caixa só vê o valor dos itens já entregues. Se quiser cobrar “pedido feito” antes da entrega, mude a regra de negócio.
- **CSRF** — considere token anti-CSRF para as ações de staff se o frontend e a API ficarem em origens diferentes.

## Como validar

```bash
npm run db:migrate
npm start
# em outro terminal
npm run test:smoke
```

Se o SSE do cliente (mesa) parar de funcionar, atualize o frontend para conectar em:

```
/api/events?mesa=<token-da-mesa>
```

