# PWA de atendimento do garçom

> Aplicativo operacional real em `public/garcom-pwa/`, servido pelo próprio
> backend Node. Não é protótipo nem mock. Contrato de API:
> [`CONTRATO-ATENDIMENTO-GARCOM.md`](./CONTRATO-ATENDIMENTO-GARCOM.md).

## Arquitetura

| Camada | Onde | Responsabilidade |
|---|---|---|
| Shell estático | `public/garcom-pwa/{index.html,styles.css,app.js}` | interface do garçom |
| Fila offline | `public/garcom-pwa/offline.js` | IndexedDB + motor de sincronização |
| Service Worker | `public/garcom-pwa/sw.js` | cache **apenas** do shell, network-first |
| Tempo real | `public/js/realtime.js` | SSE com reconexão e fallback |
| Autoridade | `server.js` + `db/*.js` + PostgreSQL | preços, permissões, estados, concorrência |

O Service Worker **nunca** intercepta `/api/`. Nenhuma resposta de API é
cacheada: o servidor é a única fonte de verdade. O cache do shell é versionado
(`garcom-pwa-shell-v45` no código atual); qualquer mudança no shell exige subir essa versão, ou
o aparelho continua executando JavaScript antigo.

## Fila compartilhada de prontos e atendimento em equipe

A aba **Entregas** consulta a fila compartilhada de pedidos em sessões abertas.
Um pedido aparece para todos os garçons ativos quando pelo menos um dos itens
chega a `concluido`, `aceito` ou `retirado`. A consulta não filtra por
titularidade de mesa nem pela origem do pedido.

Qualquer garçom ativo pode avançar um item disponível respeitando seu estado:
- **Retirar item**: se estiver `concluido`, o servidor registra aceite implícito
  e retirada na mesma transação (`concluido → aceito → retirado`). Se já estiver
  `aceito`, outro garçom também pode retirá-lo.
- **Confirmar entrega**: qualquer garçom ativo pode confirmar um item `retirado`.
  O valor só entra na conta depois que a entrega é registrada.

Cada etapa mantém o ator real em `aceito_por_id`, `retirado_por_id` e
`entregue_por_id`, com horário e histórico. Esses campos são trilha de auditoria,
não bloqueios para a continuidade do trabalho por outro integrante da equipe.
Não existe um garçom titular do pedido ou da mesa.

O **Histórico de movimentação** mostra a trilha de atores e horários por item,
incluindo o motivo `Aceite implícito na retirada`.

Cada item libera assim que seu setor conclui: se o bar termina antes da cozinha,
a bebida aparece na hora e pode ser retirada enquanto o prato ainda é produzido.

## Confirmação em lote

Cada pedido oferece os lotes **Retirar todos** e **Confirmar entrega de
todos**, com a contagem de itens elegíveis. A retirada inclui itens `concluido`
e itens `aceito` pelo próprio garçom; para um item ainda `concluido`, o
servidor registra aceite implícito e retirada na mesma transação. A entrega
inclui somente itens `retirado` pelo próprio garçom. A PWA não exibe um lote
separado de aceite. Cada lote é uma única chamada por pedido, preservando a
atomicidade do servidor. Falha em um lote avisa na própria tela e reabilita os
botões.

## Fila offline

`offline.js` implementa a persistência e o reenvio. Estados visíveis ao garçom:

| Estado | Texto na tela | Significado |
|---|---|---|
| `offline` | AGUARDANDO SINCRONIZAÇÃO | salvo no aparelho, ainda não aceito pelo servidor |
| `sync` | SINCRONIZANDO | envio em andamento |
| `confirmed` | SINCRONIZADO | servidor respondeu com id do pedido |
| `conflict` | CONFLITO — REVISAR | servidor recusou (4xx); exige decisão humana |
| `error` | ERRO DE SINCRONIZAÇÃO | várias tentativas falharam; continua preservado |

Garantias implementadas e cobertas por teste:

- **Persistência real.** O pedido é gravado em IndexedDB (`orders`, `meta`,
  `leases`) antes de qualquer tentativa de envio. Fechar o app, recarregar ou
  reiniciar o aparelho não perde a pendência.
- **Sem confirmação prematura.** `confirmed` só existe depois de resposta HTTP
  de sucesso **com id**. Resposta sem identificador é tratada como falha.
- **Sem duplicidade.** Cada operação nasce com `idempotencyKey` UUID v4, mantida
  em todo reenvio. O servidor devolve o mesmo pedido; o estoque baixa uma vez.
- **Conectividade medida de verdade.** O motor consulta o backend
  (`probeBackend`), em vez de confiar em `navigator.onLine`, que mente em Wi-Fi
  sem saída e em redes com proxy. Uma resposta HTTP (inclusive 404, 429 ou 5xx)
  confirma alcance, não sucesso da operação; 401/403 exigem autenticação.
  Falhas de rede/timeout continuam acionando o modo offline. Os erros de envio
  continuam sujeitos a conflito/backoff, sem remover pedidos da fila.
- **Retomada automática.** Ao voltar a resposta do servidor, a fila esvazia
  sozinha. Também há reenvio ao voltar o foco, ao evento `online` e por timer
  periódico de 15 s.
- **Backoff progressivo.** 2 s até 5 min, com jitter, para não saturar a rede nem
  o servidor em horário de pico.
- **Uma aba por vez.** Lease com TTL e heartbeat em IndexedDB impede que duas
  abas enviem a mesma fila simultaneamente. Lease expirado de aba morta é
  recuperado pelas demais.
- **Envio interrompido.** Registro deixado em `sync` por queda do app volta para
  `offline` no boot, com a mesma chave — o replay é seguro.
- **Conflito nunca é descartado.** 4xx preserva o pedido, o conteúdo original e o
  motivo. **Revisar conflito** permite reenviar o original ou, no caso de mesa
  com outro responsável, confirmar o envio como colaborador.
- **Isolamento por garçom.** A fila é filtrada pelo token dono; trocar de link no
  mesmo aparelho não mistura nem expõe pedidos de outro garçom.
- **Exportar pendências** gera JSON sem o token, para recuperação assistida.

Limites honestos: a fila vive no navegador. Limpar dados do site, desinstalar o
PWA ou perder o aparelho pode apagar pedidos não sincronizados. O app pede
`navigator.storage.persist()` para reduzir o risco de descarte automático, mas
isso depende do navegador. **Rascunho offline não é pedido recebido pela
cozinha** — a tela mostra isso explicitamente.

### Dados mantidos no navegador

- O banco local é o IndexedDB `garcom-pwa-v1` (versão 2), com as stores `orders`, `meta` e `leases`.
- Um rascunho de pedido pode conter mesa, nome do cliente, itens/produtos, quantidades, adicionais, remoções, observações, chave de idempotência, horários, estado de sincronização e o identificador do garçom usado para isolar a fila.
- O `localStorage` mantém o token individual do garçom (`waiter-token`), preferências de tema/notificações, identificadores de avisos já exibidos e uma tentativa de pagamento pendente (sessão, mesa, valor, forma e chave idempotente).
- Não há prazo automático de expurgo implementado para a store local de pedidos. Limpar os dados do site, remover o perfil do navegador ou desinstalar o PWA pode apagar dados ainda não sincronizados; o armazenamento persistente é apenas uma solicitação ao navegador, não uma garantia de backup.
- O Service Worker usa o cache `garcom-pwa-shell-v44` apenas para arquivos do shell. Ele não intercepta nem armazena respostas de `/api/`.

## Navegação principal: Mesas e Entregas (#305)

O rodapé tem exatamente **duas abas**: **Mesas** e **Entregas**. As antigas abas
**Pedidos** e **Cobrança** saíram da navegação, mas nenhuma função foi removida:

| Função | Onde fica acessível agora |
|---|---|
| Pedidos do aparelho (rascunhos offline, fila de sincronização, conflitos, exportar JSON) | atalho **Pedidos do aparelho**, no topo da aba Mesas; a página abre com **← Voltar para mesas** |
| Ver pedidos de uma mesa | detalhe da mesa → **Ver pedidos** |
| Novo pedido / acrescentar itens | aba Mesas (botão do topo) e detalhe da mesa → **Novo pedido** |
| Recebimento parcial e sua idempotência | detalhe da mesa → **Fechar conta**, que abre a página de cobrança (também com **← Voltar para mesas**) |
| Fechamento total da comanda e liberação da mesa | **Caixa** — o fluxo financeiro continua sendo o do servidor (`db/caixa.js`); a PWA não fecha conta por conta própria |

### Cards do salão

- Todas as mesas habilitadas aparecem por padrão, sem exigir busca. A busca por
  número (aceita vírgula) e por nome do cliente apenas **filtra** a grade, assim
  como o seletor de **praça** — que é populado a partir das mesmas praças
  cadastradas pelo admin (`mesa_pracas`), sem um segundo cadastro.
- Cada card mostra número, praça, **estado escrito por extenso** e responsável.
  A legenda acima da grade repete os estados, portanto a cor nunca é o único
  sinal. As cores usam as superfícies de status do design system (informativo
  para "Aguardando pedido", atenção para "Em atendimento"), com destaque sutil.
- A grade usa 1, 2, 3 ou 4 colunas conforme a largura real do aparelho, sem
  rolagem horizontal.

### Estados e tempo de atendimento

- **Livre** — mesa sem sessão aberta.
- **Aguardando pedido** — sessão aberta sem nenhum pedido válido (pedido
  cancelado não conta). O vínculo com o garçom responsável é preservado.
- **Em atendimento** — existe pelo menos um pedido válido na sessão.

O tempo exibido é contado **a partir do primeiro pedido válido**
(`primeiroPedidoEm`), nunca da abertura da sessão: uma mesa aberta que ainda não
pediu não parece estar esperando atendimento. Depois que todos os itens são
entregues a mesa **continua ocupada e disponível à equipe**; ela só volta a
**Livre** quando o pagamento integral é confirmado pelo fluxo oficial do Caixa
(`registrarPagamento` fecha a sessão e libera a mesa na mesma transação). A PWA
não marca mesa livre localmente.

### Ação "Fechar conta"

O botão do detalhe da mesa abre a página de cobrança com a sessão já
selecionada. Ele **não** é um fechamento financeiro paralelo: registra um
recebimento pela rota existente (`POST /api/garcom/:token/sessoes/:id/pagamentos`,
com `incluirServico` e chave idempotente) e o servidor só quita e libera a mesa
quando o valor devido está pago e não há pedidos pendentes nem avisos PIX em
aberto. A equipe continua atendendo a sessão compartilhada até o fechamento integral da conta.

## Mesas e pedidos

1. `GET /api/garcom/:token/mesas` traz as mesas habilitadas, sessão e praça.
   Todos os garçons autenticados e ativos recebem os tokens QR das mesas. A
   sessão aberta não possui titular operacional.
2. **Iniciar atendimento** (`POST .../iniciar`) cria ou reutiliza a sessão sob
   lock. Se outro garçom já iniciou, a sessão é compartilhada e pode ser acessada
   normalmente; não há conflito por titularidade.
3. **Assumir** (`POST .../assumir`) é o caminho para registrar o primeiro
   atendimento de um pedido QR do cliente. Isso não atribui a mesa a quem clicou.
4. O pedido vai por `POST .../pedidos` com `idempotencyKey` e `clientCreatedAt`.
   O servidor revalida tudo e calcula o preço oficial. O autor do lançamento
   fica registrado no pedido.
5. Sem rede, o garçom ainda monta o pedido, gera o QR da mesa a partir de dados
   em cache e edita rascunhos **que nunca foram enviados** (`attempts = 0`).
   Rascunho já transmitido não é editável: isso criaria divergência com o servidor.
6. Não existem ações de **Transferir mesa** ou **Deixar mesa**. A mesa continua
   disponível à equipe até o fechamento financeiro normal da conta.

## Notificações

O aviso de item pronto funciona com o PWA aberto (SSE + toast + som opcional) e
exige consentimento explícito no primeiro uso, que pode ser recusado.

A folha de consentimento **fecha sozinha** quando o garçom decide (permitir ou
recusar e confirmar), e o resultado aparece no painel de notificações. Se ele
dispensar o prompt do navegador sem escolher, a folha continua aberta para nova
tentativa. Antes o caminho de "permitir" nunca chamava `close()`, e o diálogo
ficava na tela mesmo depois de concedido.

**Web Push com o aplicativo fechado não está implementado nem validado.** O
Service Worker tem handlers de `push`, mas não há subscrição `PushManager`,
chaves VAPID, tabela de subscrições nem serviço de envio no backend. A própria
tela de consentimento informa isso. Não prometer esse comportamento.

## Cobrança e PIX ("Fechar conta")

A página de cobrança deixou de ser uma aba do rodapé (#305): ela é aberta pelo
botão **Fechar conta** do detalhe da mesa, com a sessão já selecionada, e tem
**← Voltar para mesas**. Todas as funções continuam iguais — consulta de saldo,
recebimento parcial, PIX e chave idempotente.

O garçom consulta saldo e registra recebimento apenas de sessão sob sua
responsabilidade, sempre online. O PIX gera QR/copia-e-cola com o valor
informado; o operador confere o crédito no banco e confirma manualmente. Não há
gateway nem confirmação automática de liquidação.

O valor cobrável é a soma dos itens **entregues** mais o **serviço padrão da
casa** (`TAXA_SERVICO_PERCENTUAL`, 10% quando não configurado). O resumo do
garçom mostra consumo, serviço, total e saldo, e o campo de valor já vem
preenchido com o saldo do fechamento — o mesmo número que o Caixa cobraria.
Sem isso o garçom quitava só o consumo e a conta fechava sem a taxa.

O PWA envia `incluirServico: true` ao registrar o recebimento. O servidor
recalcula a taxa a partir do consumo autoritativo dentro da transação e aceita
o valor até esse teto; a sessão fechada grava `taxa_servico` e
`valor_cobrado = valor_total + taxa_servico`. PWA antigo em cache (sem o
parâmetro) mantém o comportamento anterior — teto igual ao consumo — para não
quebrar em aparelhos que ainda não atualizaram.

Quando o recebimento quita a conta e não há produção pendente nem aviso PIX em
aberto, o próprio servidor encerra a sessão e libera a mesa — o PWA avisa
"conta quitada, atendimento encerrado e mesa liberada". Havendo pendência, o
lançamento é parcial e o fechamento continua no Caixa.

Todo bloqueio do botão de recebimento escreve o motivo na tela, em vez de apenas
desabilitar:

| Situação | Mensagem |
| --- | --- |
| Nenhum item entregue | aponta a aba Entregas para confirmar as entregas |
| Conta já quitada | informa os valores e que o fechamento é no Caixa |
| Mesa de outro responsável | pede transferência ou uso do Caixa |
| Sem conexão | explica que o saldo precisa do servidor |
| Tentativa pendente de outra mesa | manda resolver a pendência primeiro |
| Perfil do garçom não carregado | pede reconexão |

Isso importa porque o QR PIX é montado no navegador a partir do valor digitado:
sem o motivo explícito, o garçom via um QR correto ao lado de um botão que
parecia quebrado.

## Segurança

- O link individual pode trazer o token na query string; o app remove esse parâmetro da URL visível, mas mantém a credencial em `localStorage` (`waiter-token`) e a envia nas rotas da API. É um token bearer, não um cookie `HttpOnly`. Não compartilhar links, não registrar tokens em logs e não usar dispositivos compartilhados sem controle. Se houver suspeita de exposição, desativar o cadastro do garçom no Admin para bloquear o acesso. A migração futura para sessão curta e cookie protegido continua recomendada, mas ainda não está implementada.
- 401/403 marcam a fila como conflito de autenticação e a tela mostra
  **LINK INVÁLIDO OU DESATIVADO**, sem descartar pedidos.
- Toda permissão é revalidada no servidor, dentro da transação. Checagem de
  interface é conveniência, nunca autoridade.
- Testes que escrevem só podem rodar em banco descartável `qradmin_test`.

## Como validar

```bash
npm test                                    # regressão + offline (fake-indexeddb)
npm run typecheck && npm run build

# PostgreSQL descartável (CI usa postgres:16; local foi validado em 18.4)
NODE_ENV=test DATABASE_URL=postgres://.../qradmin_test npm run db:migrate
DATABASE_URL=postgres://.../qradmin_test npm run test:pg

# E2E em Chromium real: offline e lote/cobrança
DATABASE_URL=postgres://.../qradmin_test npm run test:e2e
```

Validado em Chromium headless. **Não** foi validado em dispositivo físico
Android/iOS, Safari/iOS, nem em rede móvel real com perda de pacote. Instalação
em iOS, comportamento de suspensão prolongada e notificação com app fechado
permanecem pendentes de teste em aparelho.
