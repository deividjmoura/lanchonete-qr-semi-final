# Correção: entrega progressiva por item, autoria e offline confiável

Relatório técnico da auditoria e da correção. Branch
`arena/4b1e5afc-lanchonete-qr-semi-final`, base `8714f07` de `main`.

Data da validação local: 2026-10-29/30. Banco de teste: PostgreSQL **18.4**
descartável (`qradmin_test`). CI verde em `postgres:16`, incluindo o drill de
backup/restore.

---

## 1. Diagnóstico: causas-raiz encontradas

O sintoma relatado ("garçom não recebe os itens prontos") não tinha uma causa
única. A auditoria encontrou **oito defeitos independentes** que se somavam.

### 1.1 A unidade de trabalho era o pedido, não o item

`db/garcons.js::assumirEntregaComoGarcom` operava sobre o pedido inteiro e
exigia `status='concluido'` no **pedido**. Como o status agregado só virava
`concluido` quando **todos** os itens de **todos** os setores terminavam, a
bebida pronta esperava o hambúrguer. Em pedido misto (cozinha + bar) o garçom
simplesmente não via nada até o setor mais lento concluir.

### 1.2 A fila escondia pedidos por origem e por dono

`getFilaGarcom` filtrava por responsável da mesa e excluía pedidos de origem
`garcom`. Resultado: pedido lançado pelo próprio garçom nunca aparecia na sua
fila de entrega, e item pronto de mesa atribuída a outro colega ficava invisível
para quem poderia ajudar.

### 1.3 Não havia atribuição de responsabilidade no aceite

O aceite não preenchia `mesa_sessoes.garcom_responsavel_id`. A mesa ficava sem
titular mesmo depois de alguém começar a entregar, quebrando cobrança
(`resumo-pagamento` exige responsável) e métricas por garçom.

### 1.4 Salto `concluido → entregue`, sem etapas nem autoria

Não existiam os estados de aceite e retirada. Não havia como distinguir
"item pronto no balcão" de "item já retirado, a caminho da mesa". O único rastro
era `pedidos.garcom_entregou_id`, que guarda apenas **a última** entrega do
pedido — não prova quem entregou cada item.

### 1.5 `itemIds` inválidos eram silenciosamente ignorados

A entrega parcial filtrava os ids recebidos e seguia com o subconjunto válido.
Um cliente com dados desatualizados recebia `200 OK` tendo entregado menos itens
do que pediu, sem erro e sem aviso.

### 1.6 Não existia cancelamento de item

Item errado ou cliente que desistiu travava a comanda: `fecharSessao` recusava
qualquer pedido cujo status não fosse `entregue`, para sempre. Também não havia
devolução de estoque por item.

### 1.7 Setor lido do cadastro do produto, em tempo real

As filas consultavam `produtos.setor` no momento da leitura. Renomear ou
reclassificar um produto no admin **movia itens já pedidos** de setor, no meio
da produção.

### 1.8 Offline frágil e controles de tela mortos

- `navigator.onLine` era a única fonte de conectividade — mente em Wi-Fi sem
  saída e atrás de proxy, então a fila nunca reenviava.
- Sem backoff: tempestade de requisições ao voltar a rede.
- Sincronização no boot podia rebaixar pedido já confirmado.
- Idempotência era única **por sessão**; retry depois de a comanda fechar criava
  outro pedido e baixava estoque de novo.
- Sem fingerprint de payload: mesma chave com conteúdo diferente sobrescrevia.
- Sem lease: duas abas enviavam a mesma fila em paralelo.
- Polling de 7 s, sem SSE, apesar de o backend já ter SSE.
- **Nove controles do PWA não tinham handler** (ver 2.3).

### 1.9 Defeitos adicionais de robustez e segurança

- `src/screens/Mesa.tsx` calculava `STATUS_ORDEM[-1]` para pedido cancelado →
  `TypeError` derrubava a tela do cliente.
- Caixa escondia comanda inteiramente cancelada como "vazia" e exigia total > 0
  para fechar → mesa ocupada para sempre.
- `.env.example` trazia `STAFF_SEED_PASSWORD=admin123`; três scripts de teste
  tinham fallback hardcoded para a mesma senha.
- Erros de domínio podiam cair no handler genérico e virar 500.

---

## 2. O que foi implementado

### 2.1 Banco de dados — migration `0027_entregas_progressivas_offline.sql`

Aditiva e idempotente. Não recria pedidos, não altera preços, não apaga
histórico financeiro.

- Novos estados de item: `aceito`, `retirado`, `cancelado`; `pedidos.cancelado`.
- `itens_pedido.setor` como **snapshot** obrigatório, preenchido a partir do
  cadastro apenas para itens antigos.
- Colunas de ator/horário por etapa: `iniciado_em`, `pronto_em`,
  `preparado_por_staff_id`, `aceito_por_id/em`, `retirado_por_id/em`,
  `entregue_por_id/em`, `cancelado_em`, `cancelado_por_staff_id`,
  `cancelado_por_garcom_id`, `cancelamento_motivo`.
- `itens_pedido_historico`: trilha completa por item, com ator, `request_id` e
  motivo. FKs `ON DELETE CASCADE`.
- `pedidos.payload_hash`, `cliente_criado_em`, `sincronizado_em`.
- `uq_pedidos_garcom_idempotency` — unique **por garçom**, não por sessão.
- `mesa_atendimento_historico.alterado_por_staff_id` para transferência admin.
- Índices parciais para fila de retirada e histórico.

Registros antigos **não** recebem autores inferidos: o último
`garcom_entregou_id` não prova quem entregou cada item anterior.

### 2.2 Backend

| Arquivo | Papel |
|---|---|
| `db/itens.js` (novo) | agregação de status, ordem global de locks, gravação de estado + histórico |
| `db/entregas.js` (novo) | aceite/retirada/entrega por item, atribuição de mesa, valor entregue |
| `db/itens-operacoes.js` (novo) | cancelamento por item e devolução de aceite |
| `db/pedido-identidade.js` (novo) | fingerprint SHA-256 canônico e validação de data do cliente |
| `db/pedidos.js` | criação idempotente, replay global, filas por setor, fila compartilhada, cancelamento lógico |
| `db/conta.js` | total cobrável = **apenas itens entregues** |
| `db/atendimento.js` | transferência admin, replay tardio do pedido offline |
| `db/caixa.js` | fechamento exclui cancelados; comanda zerada permanece visível |
| `server.js` | rotas por item, atores reais, `reqId`, erros de domínio com status correto |

Decisões de projeto:

- **Sem gate de aprovação.** O pedido cai direto na fila do setor; o aceite da
  cozinha/bar só marca produção iniciada, como no fluxo original.
- **Ordem global de locks** mesa → sessão → pedido → itens, igual em todos os
  caminhos, para evitar deadlock. `garcons ... FOR SHARE` é compatível com a
  transferência administrativa.
- **Tudo ou nada** por lote de itens: id de outro pedido → 404; estado
  incompatível → 409; nada é aplicado parcialmente.
- **Só avança.** Regressão → 409. Mesmo estado → replay idempotente.
- **Cancelamento é lógico**, com motivo, ator, histórico e devolução de estoque
  **uma única vez**. Item entregue não pode ser cancelado (409).
- **Replay antes de exigir sessão aberta**, para o celular que reenvia depois de
  a comanda fechar receber o pedido original em vez de conflito sem saída.

### 2.3 Frontend

Cozinha e Bar passaram a agir **por item**. O Garçom (React e PWA) ganhou o
fluxo em três etapas com autoria visível e histórico. Admin ganhou transferência
explícita de responsável. Caixa ganhou cancelamento por item com motivo
obrigatório e fechamento de comanda zerada. A tela do cliente trata pedido
cancelado sem quebrar. A impressão omite itens cancelados.

**Controles mortos corrigidos no PWA** — existiam no HTML desde a base e nunca
foram ligados: os dois `＋ Novo pedido`, `Atualizar` das mesas, os `×` de fechar
as folhas de pedido/QR/detalhe, `Mostrar QR` do formulário, o bloco legado de
iniciar atendimento e **toda a navegação inferior**. Na prática o garçom não
conseguia abrir um pedido nem chegar à aba Entregas pelo toque. Encontrado pelo
E2E em navegador real e travado por teste de regressão
(`tests/pwa-controles-ligados.test.cjs`), que falha se qualquer controle do shell
ficar sem handler.

### 2.4 Offline

`public/garcom-pwa/offline.js` (novo) concentra IndexedDB v2 e o `SyncEngine`:
lease com heartbeat, sonda real de conectividade, backoff de 2 s a 5 min com
jitter, recuperação de envio interrompido, conflito preservado, isolamento por
garçom e confirmação somente com id do servidor. Service Worker em **v18**,
network-first, sem nunca cachear `/api/`.

Tempo real reusa o SSE existente (`db/events.js`, `public/js/realtime.js`) com
`hello`, reconexão com backoff e fallback periódico. Nenhum mecanismo paralelo
foi criado.

---

## 3. Evidência de teste

Tudo abaixo foi executado neste ambiente. Nenhum teste escreveu em produção.

| Suíte | Resultado |
|---|---|
| `npm run typecheck` | OK |
| `npm run build` | OK (Vite 7.3.2) |
| `npm test` (regressão + offline) | **288 testes, 288 passaram, 0 falhas** |
| PostgreSQL real, 7 suítes | **25 testes, 25 passaram, 0 falhas** (`server_major=18`) |
| E2E Chromium real | **11 verificações, todas passaram** |
| `npm audit --omit=dev` | **0 vulnerabilidades** |
| Migrations | **27/27** aplicadas em banco limpo |
| CI `PostgreSQL integration` (postgres:16) | **success** — inclui o drill de backup/restore |
| CI `CI` (postgres:16) | **success** — migrations, integração, typecheck, build, dist, regressão |

Baseline antes das mudanças, para comparação: typecheck/build OK, 267 testes
passando, 0 vulnerabilidades de produção. Os defeitos acima **não** eram
capturados pela suíte existente.

### 3.1 O que a suíte PostgreSQL nova cobre

`tests/postgres-entregas-progressivas.test.cjs` (6 testes):

1. **Cenário misto completo** — pedido QR com item de cozinha e de bar; bar
   conclui primeiro; item aparece na hora com a cozinha ainda em produção;
   primeiro aceite assume a mesa; ajudante entrega o outro item sem tomar a
   mesa; setor errado recebe 403; só o entregue entra na conta; histórico por
   item com ator correto; transferência admin; fechamento; sessão fechada
   recusa novas etapas.
2. **Corrida de aceite** — três garçons disputam o mesmo item: exatamente um
   vence, os outros recebem 409, e há **um único** registro de aceite no
   histórico. Devolução admin libera o item sem devolver a mesa.
3. **Cancelamento por item** — devolve estoque uma vez, replay não devolve de
   novo nem duplica auditoria, item cancelado não volta à produção nem é
   cobrado, item entregue não pode ser cancelado.
4. **Comanda inteiramente cancelada** — fecha com total zero e libera a mesa.
5. **Replay offline** — mesma chave devolve o mesmo pedido sem baixar estoque;
   mesma chave com outro conteúdo → 409 preservando o original; chave não-UUID
   → 400; replay depois do fechamento devolve o original sem reabrir comanda;
   pedido novo depois de fechar → 409.
6. **Caixa** — não fecha com item em produção; listagem cobra apenas o entregue.

### 3.2 O que o E2E em navegador prova

`tests/e2e/garcom-offline.e2e.cjs` sobe o servidor Node real contra o PostgreSQL
descartável e dirige o Chromium: cria pedido **sem rede**, confirma que nada
chegou ao servidor, **recarrega a página** e verifica que a pendência sobreviveu
com a mesma chave, religa a rede e espera a confirmação automática, prova que
houve **um único** pedido no banco roteado ao setor correto e direto em
produção, e por fim aceita o item pronto pela interface conferindo ator e
responsável no banco — sem nenhum erro de JavaScript na página.

### 3.3 Validação no CI (commit `a02d41f`)

Os dois workflows rodaram verdes no commit enviado à branch:

- [`PostgreSQL integration` — run 40991085539](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40991085539)
- [`CI` — run 40991085485](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40991085485)

Isso fecha duas lacunas que existiam na validação local:

- **Drill de backup/restore executado com sucesso** em `postgres:16`
  (`pg_dump` + `pg_restore` em banco isolado), no passo
  "Backup/restore drill". Não rodou localmente porque o `embedded-postgres`
  não distribui `pg_dump`/`psql`, mas rodou no CI.
- **PostgreSQL 16 validado**, não apenas o 18.4 local. As suítes de integração,
  inclusive a nova de entrega progressiva, passaram no major usado em produção
  pela maioria dos provedores.
- Cadeia completa de migrations aplicada em banco limpo e runner verificado
  como idempotente.

### 3.4 Limitações da validação — ler antes de publicar

- **Não houve acesso a Railway nem a produção.** Nada foi publicado, migrado ou
  testado no ambiente real. A migration precisa ser aplicada lá com backup
  prévio.
- **O drill de backup validado é sintético, não é o backup de produção.** Ele
  prova que o script e o restore funcionam num banco descartável. Antes do
  deploy ainda é obrigatório gerar e testar o restore do dump **real** do
  estabelecimento.
- **Chromium headless, não aparelho físico.** Sem teste em Android/iOS real,
  Safari/iOS, rede móvel com perda de pacote, suspensão prolongada do sistema
  operacional ou instalação em iOS.
- **Web Push com app fechado continua não implementado.** Há handlers no
  Service Worker, mas não há subscrição, VAPID nem serviço de envio.
- Testes de carga com 70 mesas não foram reexecutados nesta rodada.

---

## 3.5 Commits entregues

Branch `arena/4b1e5afc-lanchonete-qr-semi-final`, sete commits temáticos:

| Commit | Conteúdo |
|---|---|
| `5d7099e` | backend: migration 0027, ciclo de vida por item, entregas, cancelamento, idempotência |
| `bc166d7` | PWA: motor offline persistente + correção dos controles de tela mortos |
| `21f720b` | UI: painéis por item, entrega em 3 etapas, Mesa/Caixa/Admin |
| `a73debd` | testes: PostgreSQL progressivo, offline comportamental, controles, E2E |
| `1d21abb` | segurança: remoção da senha padrão versionada |
| `b636fca` | documentação: contrato v2, relatório, README e CI |
| `a02d41f` | build: `dist/` regenerado com o shell v18 |

## 4. Publicação

```bash
# 1. Backup do banco de produção (obrigatório)
pg_dump "$DATABASE_URL" -Fc -f backup-antes-0027.dump

# 2. Drill de restore em banco isolado, nunca no de produção
RESTORE_DRILL_CONFIRM=isolated-target npm run db:restore-drill

# 3. Aplicar migrations (idempotente)
npm run db:migrate

# 4. Build e subida
npm run build && npm start
```

Configuração externa necessária:

- `STAFF_SEED_PASSWORD` com **no mínimo 12 caracteres**, única, definida no
  painel do provedor. Sem ela o servidor recusa o bootstrap em produção (503).
  As contas nascem com troca de senha obrigatória. Não existe mais senha padrão
  em arquivo versionado ou script.
- `DATABASE_URL` apenas no painel do provedor ou em `.env` local fora do Git.
- `APP_TIMEZONE` do estabelecimento.
- HTTPS é obrigatório para Service Worker e IndexedDB persistentes.
- Após publicar, os aparelhos precisam reabrir o PWA para pegar o shell v18.

Rollback: a migration é aditiva, então o código antigo continua lendo as
tabelas. Reverter o deploy **não** exige desfazer a migration; reverter o banco
exige restaurar o backup, porque os novos estados de item já podem estar em uso.

---

## 5. Pendências recomendadas

1. Gerar o backup real de produção e testar o restore em banco isolado antes de
   aplicar a migration 0027 (o drill do CI já valida o mecanismo, não os dados).
2. Validar em aparelho Android e iOS reais, incluindo instalação e suspensão.
3. Migrar o token de garçom da URL para sessão curta/cookie protegido.
4. Implementar Web Push de verdade (VAPID + subscrições + envio) se o aviso com
   app fechado for requisito comercial.
5. Reexecutar teste de carga com 70 mesas após o deploy em homologação.
