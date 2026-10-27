# Escopo de Web Push — PWA do garçom

**Data:** 2026-10-27  
**Status:** documentado e deliberado  
**Branch:** `work/recomendacoes-senior-v2`

## O que já existe na `main`

| Camada | Situação |
|--------|----------|
| Service Worker (`public/garcom-pwa/sw.js`) | Handlers `push` e `notificationclick`. Payload mínimo. Destino só `/garcom-pwa/`. |
| UI de consentimento | Informa que push em segundo plano **não** está no servidor. |
| Avisos locais | Funcionam com o app em execução. |

## Fora do escopo (v3.x operacional)

1. `PushManager.subscribe()` e armazenamento
2. Endpoints de subscription no servidor
3. Persistência no PostgreSQL
4. Envio server-side (web-push / VAPID)
5. Validação Android/iOS com app encerrado

## Decisão de produto (2026-10-27)

- **In scope:** PWA instalável, fila, avisos locais, consentimento transparente.
- **Out of scope:** Web Push em segundo plano com app fechado.

Fluxo crítico já coberto por SSE + polling com PWA aberta.

## Quando retomar

Só se a operação real mostrar perda frequente de pedidos prontos com PWA fechada, e houver capacidade de teste em Android e iOS.

## Mensagem canônica na UI

> Permissão concedida. Isso não ativa push em segundo plano: o servidor ainda não implementa subscrição nem envio Web Push.
