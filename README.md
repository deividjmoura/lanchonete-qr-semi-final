<div align="center">

# QR Admin

**Sistema de pedidos e operação por QR Code para um único estabelecimento**

O QR Admin é apresentado como uma solução genérica de pedidos e operação por QR Code. A personalização visual e comercial de cada estabelecimento será feita posteriormente.

[![Produção](https://img.shields.io/badge/Deploy-Railway-7B61FF?style=for-the-badge)](https://qradminn.up.railway.app/)

</div>

---

## Objetivo e escopo

O QR Admin é uma aplicação **single-tenant**: uma instalação representa um único estabelecimento. O foco atual é colocar o produto em operação em uma lanchonete real, com fluxo simples e dados consistentes.

- Não é, neste momento, um SaaS multi-loja.
- Não existe isolamento de dados por estabelecimento em todas as consultas da aplicação; não reutilize esta instalação para outra empresa esperando separação automática.
- Não há gateway bancário integrado nem confirmação automática de recebimento PIX.
- O sistema registra pedidos, preparo, entrega e lançamentos de pagamento; a confirmação do dinheiro/PIX recebido continua sendo responsabilidade da equipe.

## Fluxo operacional

```text
Cliente escaneia o QR da mesa (ou o garçom lança o pedido)
        ↓
Cardápio → carrinho → pedido
        ↓
Cada ITEM cai direto na fila do seu setor (cozinha ou bar)
        ↓
Setor inicia o preparo e conclui item por item
        ↓
Item pronto fica disponível ao garçom NA HORA
        ↓
Garçom aceita → retira → entrega aquele item
        ↓
Caixa cobra só os itens entregues e fecha a comanda
```

**Liberação progressiva:** a bebida que ficou pronta não espera o prato. Cada
item tem estado, autor e horário próprios, e o status do pedido é apenas uma
projeção dos itens. **Não existe etapa de aprovação:** o "aceite" da cozinha/bar
só indica que a produção começou.

A comanda da mesa é acumulativa: a mesa pode receber vários pedidos durante a visita. O total cobrável é calculado no servidor a partir dos itens entregues, não do total enviado pelo navegador.

## Funcionalidades

### Cliente — QR da mesa
- Abre o cardápio no navegador, sem instalar aplicativo.
- Pesquisa produtos, escolhe adicionais/removíveis disponíveis e monta o carrinho.
- Informa o nome e envia pedidos para a comanda da mesa.
- Acompanha o andamento do pedido.
- O cliente **não registra pagamento nem confirma recebimento PIX** pela tela pública nesta versão.

### Cozinha e bar
- Filas separadas por setor: cada tela vê **apenas os itens do seu setor**.
- Avanço de status **por item** (iniciar preparo / concluir), sem depender do
  outro setor nem do pedido inteiro.
- O setor é gravado no item no momento do pedido: reclassificar o produto no
  admin não move item já lançado.
- Atualização em tempo real via Server-Sent Events (SSE) e alertas sonoros/voz nas telas compatíveis.

### Garçom
- Link individual por token, que pode ser desativado pelo administrador.
- Fila **compartilhada** de itens prontos: nada fica escondido por causa do dono
  da mesa ou de quem lançou o pedido.
- Entrega em três etapas por item — **aceitar → retirar → entregar** — com autor
  e horário registrados em cada uma. "Retirado" (a caminho da mesa) é distinto de
  "entregue" (cobrável).
- O primeiro aceite numa mesa sem responsável define o responsável no servidor.
  Colegas podem ajudar em outros itens **sem** tomar a mesa.
- Transferência explícita pelo responsável ou pelo administrador, sempre auditada.
- Histórico de movimentação por item consultável na própria tela.
- PWA em `/garcom-pwa/`, instalável, com fila persistente em IndexedDB: o pedido
  sobrevive a fechar/reiniciar o app, reenvia sozinho quando a conexão volta e
  nunca duplica (chave de idempotência por operação).
- Preços, disponibilidade e estoque são sempre revalidados pelo servidor.
  Conflito fica visível para revisão e **nunca** é tratado como pedido confirmado.
- Validado ponta a ponta em Chromium real + PostgreSQL isolado (offline →
  reinício → sincronização → aceite). **Ainda pendente:** validação em aparelho
  físico Android/iOS e notificação com o app fechado (Web Push não implementado).

### Caixa
- Lista de comandas abertas e itens entregues; cobra **apenas o que foi entregue**.
- Cancelamento de item com motivo obrigatório, devolvendo estoque uma única vez.
  Item cancelado não é cobrado e não bloqueia o fechamento.
- Comanda inteiramente cancelada fecha com total zero e libera a mesa.
- Registro de pagamentos parciais, fechamento de comanda, desconto e taxa de serviço.
- Formas de pagamento registradas: dinheiro, PIX, débito e crédito.
- Comprovante de consumo **não fiscal**.
- O QR PIX é estático/configurado por chave. A equipe deve verificar o recebimento no aplicativo bancário antes de considerar o valor pago; gerar QR ou receber aviso não prova liquidação bancária.

### Administração
- Categorias, produtos, preços, disponibilidade, setor de produção, estoque e adicionais.
- Configuração de mesas e geração de QR fixo por mesa (até 70 mesas habilitadas pela interface atual).
- Cadastro e ativação/desativação de garçons.
- Transferência administrativa do responsável da mesa e devolução de aceite à fila.
- Indicadores diários, relatórios por período, histórico e ferramenta de limpeza de histórico.
- Upload/otimização de fotos para WebP.

## Telas e endereços

| Área | Endereço | Uso |
|---|---|---|
| Início | `/` | Entrada do sistema |
| Cliente | `/#/mesa/:token` | Cardápio e pedido da mesa |
| Login | `/#/login` | Acesso da equipe |
| Cozinha | `/#/cozinha` | Fila de preparo |
| Bar | `/#/bar` | Fila de bebidas |
| Garçom | `/#/garcom/:token` | Redireciona para a PWA |
| PWA do garçom | `/garcom-pwa/?token=...` | Atendimento móvel e fila offline |
| Caixa | `/#/caixa` | Pagamentos e fechamento |
| Administração | `/#/admin` | Cardápio, mesas, equipe e relatórios |

Os tokens presentes nos links de mesa e garçom funcionam como credenciais de acesso. Não os publique em issues, prints públicos ou logs; desative o garçom se o link for exposto.

## Tecnologias

- **Frontend principal:** React 19, Vite, TypeScript, Tailwind CSS, Zustand e Framer Motion.
- **PWA do garçom:** JavaScript, HTML/CSS, Service Worker e IndexedDB.
- **Servidor/API:** Node.js com HTTP nativo.
- **Banco:** PostgreSQL com migrations SQL versionadas.
- **Tempo real:** Server-Sent Events (SSE).
- **Fotos:** Sharp, conversão e redimensionamento WebP.

O PostgreSQL é a fonte de verdade. `data/db.json` é um catálogo de demonstração usado pelo seed, não um banco operacional em produção.

## Desenvolvimento local

Esta seção pressupõe que você já tem o repositório disponível no ambiente de trabalho; não inclui passos de clone. Requisitos: Node.js 20 ou superior e um PostgreSQL de desenvolvimento/teste.

1. Instale as dependências:

   ```bash
   npm ci
   ```

2. Copie `.env.example` para `.env` e configure `DATABASE_URL` para um **banco local/de teste**.

3. Defina uma senha inicial forte em `STAFF_SEED_PASSWORD` (mínimo de 12 caracteres em produção). Configure também `PIX_CHAVE`, `PIX_NOME`, `PIX_CIDADE` e `APP_TIMEZONE` quando aplicável.

4. Aplique as migrations e, somente se o banco for novo/de teste, carregue o catálogo de demonstração:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. Gere o frontend e inicie o servidor:

   ```bash
   npm run build
   npm start
   ```

6. Abra `http://localhost:3000`.

**Cuidado com o seed:** `FORCE_SEED=1 npm run db:seed` é destrutivo. Ele apaga pedidos, sessões, pagamentos e cardápio antes de substituir os dados de demonstração. Nunca rode esse comando no banco de produção. A identidade visual atual é provisoriamente QR Admin. A personalização da marca de cada estabelecimento deve ser feita em etapa futura, após validação do produto.

## Testes e validação

Comandos disponíveis:

```bash
npm run typecheck
npm run build
npm run test:regression
npm run test:smoke
npm run test:full
npm run test:seguranca
npm run test:carga
npm run test:carga70
npm run test:dia
```

- `test:regression` (ou `npm test`): regressões automatizadas, contratos do backend, testes estáticos da PWA e testes comportamentais da fila offline em IndexedDB simulado (`fake-indexeddb`). Não precisa de banco.
- `test:smoke` e `test:full`: precisam de servidor, PostgreSQL e usuários/cardápio preparados; criam ou alteram dados.
- `test:seguranca`: testa autorização, IDOR, CSRF, limite de corpo e outras defesas contra um servidor real; cria/edita dados de teste e não deve apontar para produção.
- `test:carga`, `test:carga70` e `test:dia`: cenários operacionais/concor­rentes que alteram dados. Rode-os **somente em ambiente isolado**, nunca no banco usado pela lanchonete.

### Integração com PostgreSQL real e E2E em navegador

Estes testes **exigem banco descartável** e recusam qualquer database que não se
chame `qradmin_test`:

```bash
export DATABASE_URL=postgres://usuario:senha@host:5432/qradmin_test
export NODE_ENV=test
npm run db:migrate

# Cenário completo: entrega progressiva por setor, corrida de aceite,
# cancelamento, transferência, fechamento e replay offline
node --test tests/postgres-entregas-progressivas.test.cjs

# Demais suítes de integração
node --test tests/postgres-integration.test.cjs \
            tests/postgres-financial-integration.test.cjs \
            tests/postgres-financial-concurrency.test.cjs \
            tests/postgres-waiter-integration.test.cjs \
            tests/postgres-qr-session.test.cjs \
            tests/postgres-password-change.test.cjs

# E2E em Chromium real: pedido offline → reinício do app → sincronização
# automática → item pronto → aceite pela interface
node tests/e2e/garcom-offline.e2e.cjs

# Drill de backup/restore (exige pg_dump/pg_restore e banco isolado vazio)
RESTORE_DRILL_CONFIRM=isolated-target npm run db:restore-drill
```

O CI do GitHub executa instalação limpa, TypeScript, build, regressões,
verificações de sintaxe, as suítes de PostgreSQL em `postgres:16` e o drill de
backup/restore. **CI verde não substitui validação em aparelho físico nem no
ambiente de operação.**

### Documentação técnica

- [`docs/CORRECAO-ENTREGA-PROGRESSIVA.md`](docs/CORRECAO-ENTREGA-PROGRESSIVA.md) —
  diagnóstico, causas-raiz, correções, evidência de teste e limites da validação.
- [`docs/CONTRATO-ATENDIMENTO-GARCOM.md`](docs/CONTRATO-ATENDIMENTO-GARCOM.md) —
  contrato de API, estados por item, idempotência e erros.
- [`docs/PWA-ATENDIMENTO-GARCOM.md`](docs/PWA-ATENDIMENTO-GARCOM.md) —
  arquitetura do PWA, garantias e limites da fila offline.

## Banco e deploy

- As migrations ficam em `db/migrations/` e são aplicadas em ordem pelo runner `npm run db:migrate`.
- O servidor tenta verificar/aplicar migrations ao iniciar, mas esse caminho é **best-effort**: pode iniciar mesmo se a migration falhar. Confira os logs do deploy e confirme que todas as migrations esperadas foram aplicadas antes de operar.
- Não rode migrations, seed ou testes mutáveis sem confirmar qual banco está conectado.
- Antes da primeira operação comercial, valide login/perfis, pedido até entrega, estoque, fechamento e pagamentos em banco isolado; teste também a restauração do **backup real** (o drill automatizado já roda no CI, mas com dados sintéticos).
- A PWA foi validada em Chromium real (offline, reinício, sincronização e aceite). Ainda deve ser validada em Android/iOS físicos, incluindo instalação, suspensão prolongada e atualização do Service Worker.
- A migration `0027_entregas_progressivas_offline.sql` é aditiva. Faça backup antes de aplicá-la em produção e rode o drill de restore em banco isolado.

## Estado honesto do produto

| Área | Situação |
|---|---|
| Fluxo base de QR, comanda, cozinha/bar e caixa | Implementado e coberto por integração em PostgreSQL real (CI verde em postgres:16); requer validação final no ambiente de operação |
| Entrega progressiva por item, autoria e responsabilidade | Implementado; validado em PostgreSQL real, incluindo corrida de aceite entre garçons |
| Segurança e concorrência do backend | Preços, permissões e transições revalidados no servidor sob lock; regressões + integração comportamental em PostgreSQL |
| Fila offline do garçom | Persistência, reinício, reenvio automático, idempotência e conflito validados em Chromium real; pendente aparelho físico |
| PWA de atendimento do garçom | Fluxo completo validado em navegador real; pendente Android/iOS físicos |
| Notificação com app fechado (Web Push) | **Não implementado** — sem VAPID, subscrição ou serviço de envio |
| Backup/restore | Drill (`pg_dump` + `pg_restore` em banco isolado) **executado com sucesso no CI**; o restore do dump real de produção ainda deve ser testado antes do deploy |
| Comprovante de consumo não fiscal | Implementado; não substitui documento fiscal |
| PIX | QR/chave estática e lançamento manual; sem gateway ou confirmação bancária automática |
| Multi-loja / multi-tenant | Fora do escopo atual |
| Deploy em produção (Railway) | **Não realizado nem validado nesta rodada** |
| Pronto para venda/produção | **Não declarar pronto antes do drill de backup, do deploy validado e do teste em aparelho real** |

---

<div align="center">

**QR Admin** · sistema de pedidos por QR Code para um estabelecimento  
[deividjmoura](https://github.com/deividjmoura)

</div>
