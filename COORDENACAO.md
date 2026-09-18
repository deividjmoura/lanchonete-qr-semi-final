# COORDENACAO.md — Lanchonete QR / QRAdmin

> **Repo:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
> **Deploy:** https://qradmin.up.railway.app/ → **`main`**  
> **Líder:** Grok — **decide sozinho** (dono autorizou)  
> **Sessão:** 18/09 · **modo BUGFIX** · 5 agentes + líder

---

## ⛔ Regras

1. Entrega = **push/merge na `main` no mesmo ciclo** (sem 50 branches).
2. **1 item da fila = 1 agente.** Claim no Registro antes de codar.
3. Front: `npm run build` + **commit `dist/`** junto.
4. Tema global (`tema.ts` / pré-paint) só se o bug exigir e com note no claim.
5. Bloqueio → `state:BLOCKED` aqui; **Líder decide**.

---

## 🐛 Fila de bugs — AGORA (só 5)

| ID | Agente | Bug | Onde olhar | Done means |
|----|--------|-----|------------|------------|
| **B1** | **agente-1 WIP** | **Logo / ilustração “ACESSO DA EQUIPE”** | `ui.tsx` Logo, Login, index.css, public/logo | Logo legível claro+escuro, sem crop |
| **B2** | livre | Fotos cardápio Admin | Admin.tsx, placeholder | Miniatura nunca 404 |
| **B3** | livre | PIX / chave EVP | pix-normaliza, Caixa | UUID preservado |
| **B4** | livre | dist/ dessincronizado | build | dist = src |
| **B5** | livre | Login staff / sessão | Login, auth | Fluxo estável |

---

## Registro

## [agente-lider] — 10:36
```
AR-STATUS
sid:18/09
agent:lider
claim:coordenacao
state:WIP
```

## [agente-1] — B1
```
AR-STATUS
sid:18/09
agent:agente-1
claim:B1
state:WIP
note:logo Login/header public/logo + CSS crop
```
