# Correção do PWA do garçom — lote, notificações e cobrança

Rodada posterior à entrega progressiva (PR #139). Três sintomas relatados em
produção pelo operador, mais um defeito grave encontrado durante a investigação.

## 1. Sintomas relatados

1. "As confirmações de aceite de entrega precisam poder ser selecionadas, para
   o garçom não ficar aceitando pedido por pedido."
2. "O botão de aceite de notificações não some sozinho depois do aceite."
3. "Não estou conseguindo fechar a conta no PWA. Gera o QR certinho com o valor
   ok, mas não consigo confirmar o pagamento — simplesmente não funciona o
   botão de confirmação."

## 2. Causas-raiz

### 2.1 O botão de pagamento estava morto por `ReferenceError`

**Esta era a causa real do item 3**, e não estava no diagnóstico inicial.

Em `submitWaiterPayment` (`public/garcom-pwa/app.js`), a variável local se chama
`sessionId`, mas o objeto da tentativa pendente usava o shorthand `sessaoId`:

```js
const sessionId = Number($('#billingSession').value);
// ...
pendingWaiterPayment = { sessaoId, mesa: ..., valor: ... };  // ReferenceError
```

O `ReferenceError: sessaoId is not defined` era lançado **antes** de qualquer
requisição, dentro do handler de clique. Como nada capturava o erro, o botão não
dava feedback algum: nem mensagem, nem requisição, nem mudança de estado.

Isso explica com precisão o relato: o **QR PIX continuava sendo gerado
corretamente**, porque é montado no navegador a partir do valor digitado, sem
tocar nesse código. Só a confirmação morria.

Correção: `sessaoId: sessionId`.

### 2.2 Diálogo de notificações nunca fechava após conceder

O handler de `#requestNotificationPermission` salvava a preferência, ativava
`readyAlertsEnabled` e atualizava o texto — mas nunca chamava
`consentDialog.close()`. O "×" e o "Agora não" fechavam; só o caminho de
"permitir" havia sido esquecido.

Correção: fechar quando há decisão real (permissão concedida, ou recusa
confirmada) e levar o resultado para o painel. Se o usuário dispensar o prompt
nativo sem escolher, a folha permanece aberta para nova tentativa.

### 2.3 Lote existia apenas para o aceite, e só com 2+ itens

Havia um botão "Aceitar todos os prontos (N)" que só aparecia com mais de um
item pronto no mesmo pedido. Retirada e entrega eram exclusivamente item a item.

Correção: um botão de lote por etapa (aceitar / retirar / entregar), sempre
visível quando há ao menos um item elegível, com a contagem no rótulo.

### 2.4 Bloqueio de cobrança silencioso

`loadBillingSummary` e `renderBillingSessions` faziam
`registerPayment.disabled = true` sem dizer o motivo. Com `opacity:.47` como
único sinal, parecia botão quebrado — sobretudo ao lado de um QR PIX correto.

Correção: `bloquearCobranca(motivo)` / `liberarCobranca()`, com faixa de aviso
própria (`#billingBlocked`, `role="status"`) e texto específico por causa.

## 3. O que mudou

| Arquivo | Mudança |
| --- | --- |
| `public/garcom-pwa/app.js` | correção do `ReferenceError`; fechamento do diálogo; lote nas 3 etapas; bloqueio explicado; aviso de conta encerrada; coerção numérica de ids |
| `public/garcom-pwa/index.html` | faixa `#billingBlocked` com `aria-live` |
| `public/garcom-pwa/styles.css` | estilo `.billing-blocked`, legível em tela de celular |
| `public/garcom-pwa/sw.js` | cache do shell **v18 → v20** (v19 já usado pelo PR #141) |
| `tests/pwa-garcom-lote-cobranca.test.cjs` | 22 testes comportamentais |
| `tests/helpers/pwa-harness.cjs` | harness que executa as funções reais do `app.js` |
| `tests/e2e/garcom-lote-cobranca.e2e.cjs` | E2E em Chromium real, 11 verificações |
| `scripts/run-pg-tests.js`, `scripts/run-e2e-tests.js` | `npm run test:pg` e `npm run test:e2e` |
| `.github/workflows/postgres-integration.yml` | E2E de lote/cobrança no CI |

### Decisões de escopo (confirmadas com o operador)

- **Lote por pedido**, não seleção global com checkboxes.
- **Sem rota nova de fechamento** para o garçom. O fechamento explícito continua
  no Caixa. Descobriu-se, porém, que o pagamento integral **já** encerra a sessão
  e libera a mesa quando não há produção pendente nem aviso PIX em aberto
  (`db/caixa.js`). Isso é comportamento preexistente do servidor; o PWA agora
  apenas informa o fato em vez de deixar a mesa desaparecer sem explicação.

### Outros dois defeitos corrigidos no caminho

- Comparações `Number(m.garcomResponsavelId) === currentWaiterId` sem coerção do
  lado direito (linhas de mesas e cobrança). Se o id chegasse como texto, a lista
  de mesas do garçom esvaziava.
- `Number(null)` é `0` e passa em `Number.isSafeInteger`, então o guard de
  "perfil não carregado" precisa testar nulidade e id positivo explicitamente.

## 4. Evidência de validação

| Verificação | Resultado |
| --- | --- |
| `npm test` | **314/314** (antes: 288; já com o PR #141 integrado) |
| `npm run test:pg -- --sem-backup` | **7/7 suítes, 25 testes** |
| `npm run test:e2e` | **3/3 cenários, 22 verificações + 64 layouts visuais** |
| `npm run typecheck` | limpo |
| `npm run build` | ok, `dist/garcom-pwa/*` byte a byte igual ao `public/`, shell v20 |
| CI `PostgreSQL integration` | **success** no merge com o #141 (run 41058234768): drill de backup + os 3 E2E |
| CI `CI` | **success** no merge com o #141 (run 41058234456): migrations, typecheck, build, dist, regressão |

O E2E novo prova, em Chromium real contra servidor Node e PostgreSQL:

1. diálogo de notificações fecha após conceder e confirma no painel;
2. lote de aceite oferecido para os 3 itens do pedido;
3. um clique aceitou os 3 e gravou o garçom como ator;
4. lote de retirada avançou os 3;
5. lote de entrega concluiu os 3 e gravou quem entregou;
6. com saldo de R$ 90 o botão fica habilitado;
7. sem item entregue, o motivo aparece e aponta a aba Entregas;
8. confirmar pagamento gravou R$ 90 no servidor;
9. o pagamento integral encerrou a sessão, liberou a mesa e avisou o garçom;
10. nenhum erro de JavaScript na página.

### Lições de teste

**`node --check arquivo.js` não é suficiente para o shell do PWA.** Durante esta
rodada um `finally` órfão passou pelo `--check` (que analisa como CommonJS) e
quebrou o PWA inteiro no navegador com `SyntaxError`. A suíte agora copia
`app.js`, `sw.js` e `offline.js` para `.mjs` antes de checar, o que reproduz o
parse real do navegador.

**Teste de texto não pega `ReferenceError`.** O bug do `sessaoId` sobreviveu a
314 testes de regressão porque nenhum deles executava `submitWaiterPayment`.
Por isso o harness novo recorta e **executa** as funções reais, e o E2E cobre o
clique de ponta a ponta.

### 4.1 Defeito de CI encontrado e corrigido no caminho

O drill de backup/restore passou a falhar sem relação com esta rodada. A
annotation revelou a causa:

```
pg_restore: ERROR: unrecognized configuration parameter "transaction_timeout"
Command was: SET transaction_timeout = 0;
```

O `pg_dump` da imagem do runner é 17+ e grava esse `SET` no cabeçalho do dump.
O PostgreSQL 16 não conhece o parâmetro (introduzido no 17) e aborta o restore.
Não era defeito do backup: era descasamento de versão cliente/servidor, exposto
pela troca de imagem do `ubuntu-latest`.

O workflow agora instala `postgresql-client-16` quando o major não é 16 e
verifica a versão antes do drill. **Implicação operacional: o backup de
produção deve ser feito com `pg_dump` da mesma versão maior do servidor.**

### 4.2 Compatibilidade com o PR #141 (identidade visual)

O PR #141 foi mergeado em `main` enquanto esta correção estava pronta. Os dois
mexem no PWA do garçom, então a integração foi conferida arquivo por arquivo
antes de abrir o PR.

| Arquivo | Situação | Resolução |
| --- | --- | --- |
| `app.js` | sem conflito textual | merge automático: o PR #141 só trocou cores do indicador de conexão por tokens; lote, notificações e cobrança preservados |
| `index.html` | sem conflito textual | merge automático: marcação nova do #141 + `#billingBlocked` desta correção |
| `styles.css` | **conflito** | mantido o CSS reescrito com design tokens; `.billing-blocked` reaplicado sobre ele |
| `sw.js` | **conflito** | mantido o precache novo do #141 e versão subida para **v20** |

Três pontos que merecem registro:

1. **Colisão de versão de cache.** Os dois PRs chegaram a `garcom-pwa-shell-v19`
   de forma independente. Manter v19 faria o aparelho que já instalou o shell do
   #141 servir `app.js` antigo, com o botão de pagamento morto. O cache desta
   entrega é **v20**, e o precache continua listando `design-tokens.css`,
   `theme-init.js`, a fonte local e os dois WebP da marca.

2. **Aviso de bloqueio agora usa tokens.** A primeira versão de `.billing-blocked`
   tinha cores fixas (`#fff4e5` / `#7a4a10`), que ficariam ilegíveis no tema
   escuro introduzido pelo #141. Passou a usar `--qr-amber-500` / `--qr-amber-700`
   com `color-mix`, como os demais avisos. O teste foi atualizado para exigir o
   token e proibir cor fixa.

3. **`dist/` do #141 não fechava com o source dele.** Buildando `origin/main`
   limpo obtêm-se `index-BTm3lOPy.js` e `index-DptcC2lZ.css`, e não os hashes
   commitados no #141. O JS é byte a byte idêntico (só o nome do arquivo muda);
   já o CSS commitado tinha ~236 bytes a mais, incluindo uma classe de
   gradiente que não existe em nenhum source de tela.
   O `dist/` desta branch foi regerado e conferido contra esse build limpo do
   `main` (idênticos), removendo os assets órfãos. Não é regressão desta
   correção, e o passo `dist/ integrity` do CI aceita hashes diferentes por
   construção.

   **Causa identificada depois (ver `CORRECAO-CSRF-ABAS.md` §6):** por padrão o
   Tailwind varre o projeto inteiro, incluindo `docs/` e `tests/`. Este próprio
   relatório citava a classe como exemplo, e o build passou a gerá-la no CSS de
   produção. O `src/index.css` agora declara as fontes explicitamente
   (`source(none)` + `@source`), então documentação não altera mais o bundle.

O runner `scripts/run-e2e-tests.js` também precisou de ajuste: o E2E visual do
#141 roda sobre `vite preview` com API simulada e não usa banco, enquanto os E2E
do garçom sobem o próprio `server.js` contra PostgreSQL. O runner agora detecta
a família pelo conteúdo do arquivo, exige `DATABASE_URL` apenas para quem usa
banco, e sobe/encerra o `preview` sozinho. Os guards continuam valendo: sem
`DATABASE_URL` ou com banco sem "test" no nome, os E2E de banco são recusados.

## 5. Limites

- **Permissão de notificação simulada no E2E.** O Chromium empacotado
  (`@sparticuz`) reporta `Notification.permission === 'denied'` e ignora tanto
  `context.grantPermissions` quanto `Browser.setPermission` via CDP. Apenas a
  permissão do navegador é simulada; diálogo, handler, `localStorage` e servidor
  são reais. **O gesto de conceder em aparelho físico ainda precisa de
  conferência manual.**
- **Chromium headless**, não Android/iOS físico nem Safari.
- **Sem acesso a produção/Railway.** Nada foi publicado ou migrado lá.
- O drill de backup não roda localmente (sem `pg_dump`/`psql` no
  `embedded-postgres`); roda no CI em `postgres:16`.
- **Web Push com o app fechado segue não implementado** (sem VAPID, subscrição
  ou serviço de envio).

## 6. Publicação

Nenhuma migration nova. É apenas shell do PWA:

1. `npm run build`
2. publicar
3. reabrir o PWA nos aparelhos — o cache **v20** força a atualização do
   `app.js`. Sem isso o aparelho pode continuar com o JS antigo e o botão de
   pagamento seguirá morto.
