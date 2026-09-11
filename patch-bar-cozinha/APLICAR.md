# Patch: Bar + Cozinha (setor de produção)

## O que este patch corrige

1. **Fila do Bar** — `getFilaBar` usava `pr.categoria = 'bebida'` (coluna inexistente). Agora filtra por `produtos.setor = 'bar'`.
2. **Fila da Cozinha** — só itens com `setor = 'cozinha'` (pedido misto: comida na cozinha, bebida no bar).
3. **API** — `GET /api/bar/pedidos`, `PATCH /api/cozinha|bar/itens/:id/status`, `PATCH /api/pedidos/:id/status` (faltava e quebrava a SPA React).
4. **Status por item** — avança item e recalcula o pedido-pai (só vira `concluido` quando **todos** os itens estão prontos → garçom).
5. **Admin** — seletor **Setor de produção** (Cozinha | Bar) no criar/editar produto; badge "bar" no card.
6. **Login / Nav / Rota** — papel Bar, tela `#/bar`, link na barra de ops (admin + bar).
7. **Seed auth** — usuário `bar` já existia no backend; agora o front usa.

## Como aplicar (na raiz do projeto)

```bash
# 1) Esteja na raiz do repo (onde está server.js e package.json)
cd /caminho/para/lanchonete-qr-semi-final

# 2) Copie os arquivos deste patch por cima (estrutura espelhada)
cp -R patch-bar-cozinha/db/. ./db/
cp -R patch-bar-cozinha/src/. ./src/
cp patch-bar-cozinha/server.js ./server.js
mkdir -p public/favicons
cp patch-bar-cozinha/public/favicons/bar.svg ./public/favicons/

# 3) Migration 0013 (setor + status do item + papel bar) — se ainda não rodou
npm run db:migrate

# 4) Garante usuário staff "bar"
npm run db:reset-senha

# 5) Instala / build / sobe
npm install
npm run build   # se produção com Vite
npm start
```

## Teste rápido

1. Login **admin** → Cardápio → editar uma bebida → marcar setor **Bar** → salvar.
2. Login **bar** (senha = `STAFF_SEED_PASSWORD` do `.env`) → deve ir para `#/bar`.
3. Pedido na mesa com lanche + bebida:
   - Cozinha vê só o lanche
   - Bar vê só a bebida
4. Concluir os dois setores → pedido `concluido` → aparece no garçom.

## Arquivos tocados

- `db/pedidos.js`, `db/admin.js`, `server.js`
- `src/screens/Bar.tsx` (novo)
- `src/screens/Admin.tsx`, `Cozinha.tsx`, `Login.tsx`
- `src/App.tsx`, `src/components/OpsShell.tsx`
- `src/lib/types.ts`, `api.ts`, `mappers.ts`
- `src/store/usePub.ts`, `src/router.tsx`
- `public/favicons/bar.svg` (novo)

## Se o Bar continua vazio (tudo na Cozinha)

Os produtos antigos ficam com `setor = 'cozinha'` por padrão. Rode:

```bash
# ver o que mudaria
node scripts/fix-setor-produtos.js --dry-run

# gravar
node scripts/fix-setor-produtos.js
```

Depois, no Admin, confira se as bebidas mostram o badge **bar**.  
Pedido **novo** (ou mesa ainda aberta) deve separar automaticamente.
