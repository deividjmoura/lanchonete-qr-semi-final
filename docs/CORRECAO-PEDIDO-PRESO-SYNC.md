# Correção: PWA não enviava o pedido — pedido preso em "SINCRONIZANDO"

## 1. Sintoma

O garçom registrava o pedido no PWA e ele **não chegava ao sistema** (cozinha/bar).
O cartão ficava em **"SINCRONIZANDO"** indefinidamente, sem botão para forçar o
reenvio, e recarregar o aplicativo não resolvia.

## 2. Causa-raiz

O pedido é gravado como `sync` **antes** do POST, para que duas abas não enviem a
mesma fila. Se o app fosse fechado ou morto pelo celular no meio do envio, esse
estado ficava órfão e havia um beco sem saída com três travas somadas:

1. **`recoverInterrupted()` desistia cedo.** Ela devolve `sync` → `offline`, mas
   retornava sem fazer nada se o lease ainda estivesse válido. O lease dura 45s
   (`LEASE_TTL_MS`), então reabrir o app logo depois de fechar caía exatamente
   nesse caso.
2. **A recuperação rodava uma única vez**, na abertura (`app.js`). Perdida aquela
   chance, nada tentava de novo — mesmo com o lease já expirado.
3. **`flush()` nunca selecionava `sync`.** A fila filtrava só `offline`/`error`
   (e `conflict` com `force`), e ainda havia um `continue` explícito para `sync`
   dentro do laço. Nem o retry manual alcançava o pedido.
4. **A tela não dava saída.** O botão "Tentar sincronizar" só aparecia para
   `offline`, `conflict` e `error`. Em `sync`, nenhum botão.

Resultado: o pedido nunca era enviado, nunca virava erro visível e o garçom não
tinha como agir.

## 3. O que mudou

### 3.1 Recuperação contínua, sob o lease (`offline.js`)

Novo `recoverOrphanedSync()`, chamado **dentro de `flush()` a cada ciclo**, depois
de adquirir o lease. Nesse ponto a posse do lease garante que nenhuma outra aba
está enviando — logo, todo `sync` restante é necessariamente um envio
interrompido e pode voltar para a fila em segurança.

`recoverInterrupted()` continua existindo para a abertura, ainda respeitando o
lease de outra aba (ali ainda não temos a posse). A diferença é que a recuperação
que destrava o pedido não depende mais dela.

### 3.2 `sync` deixa de ser descartado da fila

O filtro com `force` passou a incluir `sync`, e o `continue` que ignorava `sync`
foi removido. Com o lease na mão e a recuperação já feita, não há envio alheio
para atropelar.

### 3.3 Saída manual na tela (`app.js`)

O cartão em `sync` agora mostra **"Verificar envio agora"**. O garçom nunca mais
fica olhando um estado parado sem poder agir.

### 3.4 Cache do shell v20 → v21

`offline.js` faz parte do precache. Sem subir a versão, o aparelho continuaria
executando o motor antigo e o defeito persistiria mesmo após o deploy.

## 4. Segurança do reenvio

O reenvio **preserva a mesma `idempotencyKey`**. O servidor já resolve replay por
`idempotencyKey` + `payload_hash`: se o pedido já tinha sido gravado antes da
interrupção, o replay devolve o original em vez de criar outro. Nada foi removido
do aparelho antes da confirmação, e a proteção entre abas (lease) foi mantida.

## 5. Evidência de validação

| Verificação | Resultado |
| --- | --- |
| `npm test` | **331/331** (antes 326; +5 testes) |
| `npm run build` | ok, `dist/garcom-pwa/*` byte a byte igual ao `public/` |
| `npm run test:pg -- --sem-backup` | **7/7 suítes** |
| `npm run test:e2e` | **4/4 cenários** (offline agora com 15 verificações) |

### Prova de que os testes pegam o defeito

Executados contra o código **sem** a correção:

- **Unitário** (`tests/pwa-offline-sync.test.cjs`, roda o `offline.js` real com
  fake-indexeddb): **4 dos 5 testes novos falham**.
- **E2E em Chromium real** com servidor Node e PostgreSQL: mantendo o botão mas
  revertendo só o motor, o pedido termina em
  `status:"sync", serverOrderId:null` e o teste falha por timeout — exatamente o
  sintoma relatado. Com a correção, o mesmo pedido é enviado, confirmado, e a
  contagem no banco por `idempotency_key` fica em **1** (não duplicou).

O cenário do E2E cria o pedido em `sync` com o lease de uma "aba que morreu" ainda
válido, recarrega a página, expira o lease e deixa o ciclo normal rodar.

### O que continua protegido

- aba sem o lease não envia em paralelo nem rouba o envio da dona (teste próprio);
- offline não confirma nada: o `sync` órfão volta para `offline` com motivo visível;
- reenvio não duplica no servidor.

## 6. Limites

- Validado em Chromium local contra servidor e PostgreSQL reais. **Sem** deploy
  ou teste em produção/Railway.
- A interrupção foi reproduzida por estado `sync` + lease de aba morta, não por
  matar o processo do celular de verdade.

## 7. Publicação

Nenhuma migration. É shell do PWA:

1. `npm run build`
2. publicar
3. reabrir o PWA nos aparelhos — o cache **v21** força a atualização do
   `offline.js`. Sem isso o aparelho segue com o motor antigo.

Pedidos que já estavam presos no aparelho são recuperados automaticamente no
primeiro ciclo após a atualização, sem precisar redigitá-los.
