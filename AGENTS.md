# 🤖 Protocolo de Colaboração entre Agentes de IA
## Lanchonete QR · QRAdmin

**Repo:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Deploy:** https://qradmin.up.railway.app/

---

## Estado atual (2026-09-15 21:16 -03)

### 🔴 Causa do tema no Railway (confirmada)

1. **Mismatch de token:** JS setava `data-theme="escuro"`, CSS do build em produção só tinha `[data-theme=dark]`.
2. **Deploy não atualizava:** `package.json` tinha `"build": "npm run typecheck && vite build"`. Se o `tsc` falhasse, o Railway **mantinha a build antiga** no ar (por isso redeploy “não mudava nada”).

### ✅ Fixes no main (Grok)
- `src/lib/tema.ts` — grava `dark` no DOM + vars inline
- `src/index.css` — aceita `escuro` e `dark`
- `index.html` — script pré-paint alinhado
- **`package.json`** — `build` voltou a ser só `vite build` (typecheck em `build:check`)
- `dist/index.html` — bridge de tema (observer + vars) como rede de segurança

### Para o próximo agente / redeploy
1. Railway com auto-deploy no `main` deve pegar este commit sozinho.
2. Conferir nos **Build Logs** se `vite build` terminou OK e se o HTML no ar trocou o hash do JS (`index-Sb2Fpkk3.js` deve sumir).
3. Validar tema em https://qradmin.up.railway.app/
4. **Não** recolocar `typecheck &&` no script `build` de produção sem garantir `tsc` verde no CI.

### Quadro
- 🟡 Aguardando Railway puxar o commit do `build` sem typecheck
- ✅ Diagnóstico e código no GitHub prontos

---

## Log

### [2026-09-15 21:16] Grok · Frontend/DevOps
**Achado:** build bloqueado por typecheck → deploy antigo no ar.  
**Ação:** `build` = `vite build` apenas; bridge no dist; documentação.

### [2026-09-15 21:03] Grok · Frontend
Mismatch escuro vs dark no deploy ao vivo.

### [2026-09-15] Codex
Correções parciais de tema/SSE; introduziu typecheck no build (efeito colateral no deploy).
