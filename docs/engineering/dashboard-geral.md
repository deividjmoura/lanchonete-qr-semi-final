# Dashboard administrativo

O Dashboard usa `GET /api/admin/dashboard?periodo=hoje|semana|mes` (somente
admin). Sem `periodo`, a rota mantém o contrato legado de `resumoDia`, inclusive
`from`/`to`; relatórios e demais consumidores não precisam migrar. A migration
`0031_dashboard_entregas.sql` cria um índice para a média de entregas. O processo
de inicialização de produção aplica as migrations antes de iniciar o servidor.

## Datas e comparações

- O dia civil começa à meia-noite no `APP_TIMEZONE` (padrão
  `America/Sao_Paulo`). As fronteiras são convertidas para instantes pelo
  PostgreSQL, inclusive em regiões com horário de verão.
- Hoje cobre o dia corrente; Semana, desde segunda-feira; Mês, desde o dia 1.
  O filtro é guardado no `sessionStorage` da aba e inicia em Hoje.
- A comparação é com os **dias civis imediatamente anteriores**, em igual
  quantidade; as datas dos dois intervalos são exibidas. Não se compara uma
  semana ou um mês parcial com um período anterior completo. Os dias da semana
  podem ser diferentes entre os intervalos.
- O gráfico em Hoje mostra explicitamente os **últimos sete dias**, independente
  do filtro. Em Semana e Mês ele representa os dias do período selecionado.
- A média equivalente a sete dias é a média diária multiplicada por sete; não é
  uma previsão nem uma soma de sete dias observados.

## Origem dos indicadores

- Faturamento, contas, ticket e serviço são de **comandas fechadas** no período.
  Os valores de fechamento usam `valor_cobrado` ou o `valor_total` legado. O
  detalhamento separa vendas brutas, descontos e taxa de serviço, como no
  relatório existente. A média por dia usa os dias civis decorridos, inclusive
  dias sem vendas.
- Pedidos são contados pela criação no período, inclusive cancelados; o estado
  exibido é o atual. O ranking considera a quantidade de itens de pedidos
  criados no período, exclui pedidos e itens cancelados e pode incluir itens em
  preparo. É limitado aos 50 primeiros produtos.
- As formas de pagamento são os **lançamentos das contas fechadas no período**,
  inclusive parciais lançadas anteriormente. Uma conta dividida não é atribuída
  integralmente à última forma usada. A diferença positiva entre o cobrado e os
  lançamentos de cada conta aparece como “sem detalhamento”; excesso histórico
  de lançamentos é informado separadamente, sem correção automática. Assim,
  `soma das formas + sem detalhamento − excedente = faturamento`.
- Consumo em aberto, mesas, garçons habilitados e itens em operação são um
  **retrato atual**, não um histórico do período filtrado. O consumo é
  recalculado pelos itens entregues e adicionais (como no caixa), sem abater
  pagamentos parciais. O saldo estimado os abate por comanda, mas não inclui
  eventual desconto ou serviço futuro. Garçons ativos são cadastros habilitados,
  não uma medição de presença. Mesas incluem apenas as habilitadas.
- O tempo de entrega é a média entre criação do pedido e entrega do item,
  ponderada por quantidade, para itens entregues no período com horários reais
  e válidos. Registros antigos sem horário não são estimados; sem amostra a
  interface mostra “—”.

As consultas da resposta interativa compartilham um snapshot de leitura
`REPEATABLE READ` para não misturar pagamentos e fechamentos concorrentes. Se a
API falhar, a tela não transforma dados ausentes em zero; em falha de atualização
ela informa que está mostrando a última leitura bem-sucedida.

## Verificação

`npm run build:check`, `npm test`, `DATABASE_URL=... npm run test:pg` em banco
**descartável** e `DATABASE_URL=... npm run test:e2e` cobrem reconciliação,
períodos, fuso, permissões, contrato legado, teclado, layout, troca rápida de
período, falhas de rede, parallax global e `prefers-reduced-motion`.
