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
(`garcom-pwa-shell-v18`); qualquer mudança no shell exige subir essa versão, ou
o aparelho continua executando JavaScript antigo.

## Entrega em três etapas, item por item

Na aba **Entregas**, cada item pronto tem sua própria ação:

1. **Aceitar item** — o garçom assume a entrega daquele item. O primeiro aceite
   numa mesa sem responsável torna esse garçom o responsável principal, decidido
   no servidor. Aceites seguintes de outros garçons são colaboração e **não**
   transferem a mesa.
2. **Retirar** — confirma a retirada no balcão. Só quem aceitou pode retirar.
   O item fica `retirado`: saiu da produção, mas **ainda não** foi à mesa e
   **ainda não** é cobrável.
3. **Confirmar entrega** — só quem retirou pode entregar. A partir daí o valor
   do item entra na conta.

Há também **Aceitar todos os prontos** (agrupa apenas os itens `concluido`
daquele pedido) e **Histórico de movimentação**, que mostra a trilha real de
atores e horários por item.

Cada item libera assim que o setor conclui: se o bar termina antes da cozinha,
a bebida aparece na hora e pode ser entregue enquanto o prato ainda é produzido.

## Confirmação em lote

Cada pedido oferece um botão de lote por etapa — **aceitar**, **retirar** e
**entregar** — com a contagem de itens, inclusive quando há um item só. O lote
nunca mistura etapas nem inclui item que já pertence a outro garçom: a retirada
exige que o aceite seja seu e a entrega exige que a retirada seja sua. Cada
lote é uma única chamada por pedido, preservando a atomicidade do servidor.
Falha em um lote avisa na própria tela e reabilita os botões.

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
  sem saída e em redes com proxy.
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

## Mesas e pedidos

1. `GET /api/garcom/:token/mesas` traz mesas habilitadas, sessão e responsável.
   O token QR da mesa só vem preenchido para mesas sob responsabilidade do
   garçom autenticado.
2. **Iniciar atendimento** (`POST .../iniciar`) cria ou reutiliza sessão e atribui
   o responsável sob lock. Mesa de outro garçom → 409.
3. **Assumir** (`POST .../assumir`) é o caminho da mesa que já tem pedido QR.
4. O pedido vai por `POST .../pedidos` com `idempotencyKey` e `clientCreatedAt`.
   O servidor revalida tudo e calcula o preço oficial.
5. Sem rede, o garçom ainda monta o pedido, gera o QR da mesa a partir de dados
   em cache e edita rascunhos **que nunca foram enviados** (`attempts = 0`).
   Rascunho já transmitido não é editável: isso criaria divergência com o servidor.

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

## Cobrança e PIX

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

- O token individual é credencial bearer e hoje aparece no caminho da rota.
  Não compartilhar logs com tokens; não imprimir token em tela ou documentação.
  Migração para sessão curta/cookie protegido segue recomendada.
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
