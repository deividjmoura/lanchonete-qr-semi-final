# Panorama de mesas, praças e tempos

A aba **Mesas** do Admin (`/#/admin` → Mesas) tem duas visões sobre os mesmos
dados: o **panorama** operacional e o **mapa de mesas e QR Codes**. Ambas leem
`GET /api/admin/mesas/panorama` (somente admin) e abrem o mesmo modal de
operações, `GET /api/admin/mesas/:numero`.

## Uma entrada por mesa

O panorama devolve **todas as mesas habilitadas**, inclusive as livres. O limite
continua sendo `configuracao_mesas.quantidade` (1 a 70) — a mesma fonte usada por
ativar mesas, pelo caixa e pelo garçom. Mesas acima do limite não aparecem,
porque ainda não existem para a operação.

Cada mesa traz situação (`livre`/`ocupada`), garçom responsável, cliente, início
da sessão, consumo entregue, pagamentos parciais, saldo, pedidos ativos por etapa
e itens prontos para retirada. O panorama não substitui os cartões por números
agregados: o resumo no topo é apenas apoio de leitura.

As consultas usam um snapshot de leitura (`REPEATABLE READ READ ONLY`), para que
pagamentos e fechamentos concorrentes não apareçam pela metade.

## Consumo em aberto × vendas

- **Consumo em aberto** = itens **entregues** nas sessões abertas (preço do item
  + adicionais, mesma fórmula do caixa em `db/conta.js`), menos os pagamentos
  parciais já lançados. É o que a mesa ainda deve; **não é receita recebida**.
- **Já pago (parcial)** = lançamentos em `sessao_pagamentos` da sessão aberta.
- **Vendas do período** = contas **fechadas**, usando `valor_cobrado` ou o
  `valor_total` legado — o mesmo critério do dashboard e do caixa. O seletor
  Hoje / Semana / Mês usa o dia civil no `APP_TIMEZONE` (padrão
  `America/Sao_Paulo`), com o início da semana na segunda-feira.

A interface sempre nomeia as duas coisas de forma distinta; nunca soma pedidos
em aberto ao faturamento. As vendas por mesa acompanham o filtro de praça atual
da mesa — o sistema não guarda a praça histórica de cada conta fechada.

## Faixas de tempo da mesa

O tempo é contado desde `mesa_sessoes.aberta_em` e classificado em:

| Faixa | Minutos desde a abertura | Uso na operação |
|---|---|---|
| Recente | até `atencao_minutos` (padrão 45) | refeição em curso dentro do esperado |
| Atenção | de `atencao_minutos` a `critico_minutos` (padrão 90) | sobremesa ou rodada extra: vale uma visita |
| Crítica | a partir de `critico_minutos` | mesa sem giro: conferir atendimento e conta |

Os limites ficam em `configuracao_mesas` (`atencao_minutos`, `critico_minutos`),
não em constantes de código, e a UI sempre mostra **cor + texto + número**; cor
sozinha não distingue a situação.

O alerta de **15 minutos da fila de pedidos** (Cozinha/Bar) mede outra coisa e
**não** é reaproveitado aqui: uma mesa pode ficar 60 minutos ocupada com o
atendimento em dia.

## Praças internas

`mesa_pracas` guarda os nomes usados na operação. A migration `0032` cria
Praia, Guarda-sol e Salão **apenas quando a tabela está vazia**, de modo que
reaplicar migrations em produção não desfaz renomeações.

- `mesas.praca_id` referencia a praça com `ON DELETE SET NULL`.
- **Sem praça** é `praca_id NULL` — nunca uma praça fictícia.
- O admin cria e renomeia praças em **Mesas → Praças**, sem deploy
  (`POST /api/admin/pracas`, `PATCH /api/admin/pracas/:id`). Não há exclusão:
  a praça pode estar citada no histórico; para “desativá-la”, devolva as mesas
  para Sem praça.
- `PUT /api/admin/mesas/:numero/praca` grava a classificação e registra o evento
  `mesa_praca_definida` na auditoria, na mesma transação.

## Tempos do fluxo

Quatro etapas, por setor:

1. **Recebimento → início do preparo** — `pedidos.criado_em` → `iniciado_em`.
2. **Início → pronto** — `iniciado_em` → `pronto_em`.
3. **Pronto → retirada** — `pronto_em` → `retirado_em`.
4. **Retirada → entrega** — `retirado_em` → `entregue_em`.

Regras de honestidade dos dados:

- Só entram itens com **os dois horários reais**. Item sem um dos lados fica
  fora da média daquela etapa — nenhum tempo é deduzido do status atual.
- O par precisa respeitar a ordem (fim ≥ início). Pares acima de **12 h** são
  descartados como dado antigo (tablet dormindo, item legado).
- A janela é de **24 h** e considera o horário mais recente conhecido do item;
  não é um relatório histórico.
- Entrega direta (pronto → entregue, sem retirada) não tem retirada registrada e
  por isso não entra em “pronto → retirada”.
- As etapas 1 e 2 se aplicam a cozinha e bar; as etapas 3 e 4 valem também para
  o garçom, que é quem retira e entrega.
- Amostra menor que **5 itens** aparece como **aprox.**; sem amostra, a etapa é
  **Indisponível**. Nunca “0 min”.

## Mapa e modal

O mapa mantém o que já existia: ativação de mesas, link e QR de cada mesa
(SVG gerado sob demanda), liberação de mesa e transferência de responsável.
Digitar um número abre o modal com os dados da mesa, a praça editável, o
histórico de pedidos da sessão, os pagamentos parciais e os botões compactos
de copiar link, baixar QR, transferir e liberar.

Permissões não mudaram: tudo aqui passa pelo gate `/api/admin` (sessão de staff
com papel `admin`); o token da mesa continua funcionando como credencial do
cliente final.

## Verificação

```bash
npm run build:check        # TypeScript + build
npm test                   # regressões (inclui panorama e praças)
DATABASE_URL=postgres://.../qradmin_test npm run test:pg   # integração real
```

Coberturas: `tests/mesas-panorama.test.cjs` (faixas, fluxo, SQL),
`tests/panorama-ui.test.cjs` (filtros/resumos da UI),
`tests/pracas-mesas-admin.test.cjs` (praças, rotas, CSRF, modal) e
`tests/postgres-mesas-panorama.test.cjs` (70 mesas, consumo × vendas, tempos
incompletos, persistência da praça e auditoria).
