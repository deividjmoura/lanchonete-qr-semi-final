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
| **B1** | agente-1 | **Logo / ilustração “ACESSO DA EQUIPE”** — marca isométrica + texto QRAdmin cortado ou sumindo no login/header (prints do dono). Logos vivem em `public/logo/`, **não** em `src/`; `Logo` em `ui.tsx` aponta `/logo/qradmin-horizontal(-dark).png`. CSS `.qr-logo-light` / `.qr-logo-dark`. | `src/components/ui.tsx` (`Logo`), `src/screens/Login.tsx`, `src/index.css` (qr-logo-*), `public/logo/*`, `OpsShell` se header “GEST…” | Login e header mostram logo legível claro+escuro, sem crop “GEST”, sem img quebrada; `dist/` commitado |
| **B2** | agente-2 | **Fotos do cardápio no Admin** — miniatura quebrada / 404 (seed sem foto ou path inválido). Placeholder deve existir e ser usado. | `src/screens/Admin.tsx` (`img` produto), `public/assets/demo/placeholder.webp`, `db/foto.js`, seed | Miniatura nunca 404; fallback placeholder; teste ou prova no Registro |
| **B3** | agente-3 | **PIX / chave** — normalização destrói EVP; Caixa deve avisar chave inválida. | `db/pix-normaliza.js`, `server.js` `/api/config/pix`, `src/screens/Caixa.tsx` | Regressão ou checklist: UUID/EVP preservado; UI mostra aviso se inválida |
| **B4** | agente-4 | **`dist/` dessincronizado de `src/`** — deploy serve `dist/`; front “corrigido” no src e bug continua no ar. | `package.json` scripts, CI se houver check, rebuild | `npm run build` na main; `dist/` = src; CI ou note de hash |
| **B5** | agente-5 | **Login staff / sessão** — senha ok mas não entra, cookie, redirect papel. | `src/screens/Login.tsx`, `src/store/usePub.ts` (`loginApi`), `db/auth.js`, `server.js` auth | Fluxo papel→senha→rota (cozinha/bar/caixa/admin) estável; erro legível se falhar |

**Fora desta onda:** multi-loja, WhatsApp, PWA, redesign landing, rate-limit Redis.

---

## Diagnóstico B1 (Líder)

Prints do dono: tela escura “ACESSO DA EQUIPE”, logo isométrico mesa+QR, campo senha com chave, recorte “QRAdmin GEST…”.

- Código atual do Login **não** embute a ilustração isométrica em `src/` — usa componente `Logo` → arquivos em **`public/logo/`**.
- Se a imagem “não está no src”, o fix correto é: garantir arquivos em `public/logo/`, paths `/logo/...`, CSS de tema, e **tamanho/crop** (horizontal grande pode cortar no mobile).
- Não inventar branch longa: corrigir na **main**.

---

## Fluxo

```text
Claim AR-STATUS → codar 1 bug → test:regression → (build+dist se front) → MAIN → DONE no Registro
```

```
AR-STATUS
sid:18/09
agent:agente-N
claim:B1|B2|B3|B4|B5
state:WIP|DONE|BLOCKED
note:<curto>
```

---

## Registro

## [agente-lider] — 10:36
```
AR-STATUS
sid:18/09
agent:lider
claim:coordenacao
state:WIP
note:fila só B1–B5 bugs; B1=logo acesso equipe public/logo
```

## Claims B1–B5 — preencher ao pegar
