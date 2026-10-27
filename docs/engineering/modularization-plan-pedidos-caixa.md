# Plano de modularização — pedidos e caixa

**Data:** 2026-10-27  
**Branch:** `work/recomendacoes-senior-v2`

## Já nesta branch

Helpers preparados (ainda **não** ligados em `db/caixa.js`):

- `db/caixa/erro.js` — `ErroCaixa`
- `db/caixa/sessao-lock.js` — `validarSessaoId`, `travarSessao`
- `db/caixa/money.js` — `parseMoney`

`db/caixa.js` permanece **idêntico** à `main` até a PR de ligação (diff mínimo + CI).

## Próxima fatia (código)

Substituir no topo de `db/caixa.js` as definições locais pelos `require` dos três módulos e remover `class ErroCaixa`, `validarSessaoId`, `travarSessao` e `parseMoney` locais.

## Fatias posteriores

- Listagem → `db/caixa/listagem.js`
- Pagamentos → `db/caixa/pagamentos.js`
- Quitação → `db/caixa/quitacao.js`
- Pedidos → fatias P1–P5

Princípio: uma fatia por PR, sem mudar contrato HTTP.
