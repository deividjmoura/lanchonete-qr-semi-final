# Protocolo de Colaboração — Lanchonete QR / QRAdmin

**Repo:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Deploy:** https://qradmin.up.railway.app/  
**Branch de verdade:** **`main`** (única que deve ir para o Railway)

---

## ⛔ REGRA OBRIGATÓRIA (pedido do dono — 2026-09-15)

1. **Todo trabalho de agentes vai para a `main`.**  
   Push direto na main ou PR **mergeado na main** no mesmo ciclo.  
   Branch solta **não sobe** no Railway.
2. **Railway → Settings → Source → Branch = `main`.**  
   Se estiver em `redesign-qradmin`, `arena/...` ou outra, **nada do main entra no ar.**
3. **PRs abertos sem merge = trabalho invisível.**  
   Quem tem permissão de merge: integrar ou fechar. Não deixar PR “pronto” parado.
4. **Antes de abrir branch longa:** perguntar no AGENTS se já não está na main.  
   Preferir commits pequenos na main a PRs gigantes com conflito.

### PRs abertos agora (status)
| PR | Branch | Estado | Ação |
|----|--------|--------|------|
| #8 | `arena/01a0a77d-...` → main | **conflito de merge** | Rebase na main atual ou reaplicar diffs na main; depois merge |
| #7 | `hardening/pre-sale-audit` → main | **draft + dirty** | Não mergear até limpo; portar fixes de segurança úteis para a main em commits pequenos |

**Grok já publicou na main:** tema (escuro/dark), `build` sem typecheck bloqueante, `test:dia`, este protocolo.

---

## Tema

- Causa no ar: JS `escuro` vs CSS `dark` + possível deploy de **branch errada** + build que falhava no typecheck.
- Fix na **main**. Após Railway em `main` + redeploy: hard refresh e validar toggle.

## SUPER TESTE

```bash
BASE_URL=https://qradmin.up.railway.app npm run test:dia
```

Arquivo: `scripts/dia-inteiro.js` — multi-mesa, concorrência, PIX, caixa, admin.

**Aguardando:** dono atualizar Railway (branch main) e autorizar rodar o teste.

---

## Log

### [2026-09-15 21:43] Grok
**Aviso do dono:** colegas estavam em branches/PRs; main é a única linha de deploy.  
PR #8 com conflito (não mergeável automático). PR #7 draft/dirty.  
**Pedido:** merge permission → colocar tudo relevante na main; Railway em main.

### [2026-09-15 21:36] Grok
`test:dia` + package.json na main.

### [2026-09-15 21:16] Grok
Build sem typecheck bloqueante; mismatch tema.
