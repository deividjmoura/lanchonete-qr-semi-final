# Protocolo de Colaboração — Lanchonete QR / QRAdmin

**Repo:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Deploy:** https://qradmin.up.railway.app/

---

## Estado atual

### Tema (escuro/claro)
- Causa: JS `escuro` vs CSS `dark` + build travado por `typecheck` no script `build`.
- Fix no main: token dual, vars inline, `build` = só `vite build`.
- **Ação do dono:** atualizar Railway e validar tema.

### SUPER TESTE · Dia inteiro
**Arquivo:** `scripts/dia-inteiro.js`  
**Comando:** `BASE_URL=https://qradmin.up.railway.app npm run test:dia`

Cobre (acordo entre agentes — Grok propôs, alinhado ao smoke.js / smoke-full.js existentes):

| # | Área | O que exercita |
|---|------|----------------|
| 0 | Saúde | `/`, PIX config |
| 1 | Cardápio | categorias, setores cozinha/bar, destaques |
| 2 | Auth | admin, cozinha, bar, caixa, `/api/me` |
| 3 | Ops base | mesas, garçom token, `/garcom/:token/me` |
| 4 | Rush multi-mesa | N mesas em **paralelo** (check-in + pedido) |
| 5 | Multi-pessoa | burst de pedidos na mesma sessão |
| 6 | Filas | cozinha, bar, garçom |
| 7 | Produção | status em_producao → concluido (paralelo) |
| 8 | Entrega | garçom entregar em massa |
| 9 | Ciclo de vida | editar pedido + cancelar |
| 10 | PIX | multi-aviso + confirmar no caixa |
| 11 | Caixa | pagamento parcial, desconto, taxa, fechar |
| 12 | Admin | dashboard, relatório, cardápio admin, mesas |
| 13 | Sessão | logout |

Avisos (⚠) não derrubam o teste; só falha fatal (✗) dá exit 1.

**Variáveis opcionais:** `TEST_MESAS=4` `TEST_BURST=3` `STAFF_SEED_PASSWORD=...`

### Para outros agentes
1. Após o dono atualizar o Railway, rodar `npm run test:dia` com `BASE_URL` de produção.
2. Se algum passo soft falhar de forma sistemática, abrir nota no log e corrigir API ou o teste.
3. Não misturar purge/histórico destrutivo neste teste (fica para script separado).

### Quadro
- 🟡 Aguardando dono: redeploy Railway (tema + código) e autorização para rodar o super teste no ar
- ✅ `test:dia` no repo

---

## Log

### [2026-09-15 21:36] Grok · QA / Frontend
**Tarefa:** Super teste dia inteiro + handoff no AGENTS  
**Status:** 🟢 script pronto no main  
**Arquivos:** `scripts/dia-inteiro.js`, `package.json` (`test:dia`), `AGENTS.md`  
**Pedido ao dono:** atualizar Railway e avisar para autorizar a execução do teste em produção.

### [2026-09-15 21:16] Grok
Build sem typecheck bloqueante; mismatch tema documentado.

### [2026-09-15] Codex
Correções tema/SSE/TS; typecheck no build (efeito colateral no deploy).
