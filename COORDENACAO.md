# COORDENACAO.md — Lanchonete QR / QRAdmin

> **Líder:** Grok · **main** only · bugfix 18/09  
> PRs legados **#7 e #8 FECHADOS** (já na main). Não reabrir.

---

## ⛔ Regras

1. Entrega na **`main`** no mesmo ciclo (sem 50 branches).
2. **1 bug = 1 agente** (quadro abaixo).
3. Front → `npm run build` + commit **`dist/`**.
4. `BLOCKED` → Líder decide neste arquivo.

---

## 🐛 Quadro

| ID | Agente | Bug | Status |
|----|--------|-----|--------|
| **B1** | **agente-1** | Logo ACESSO DA EQUIPE | **DONE** main `7682bde` |
| **B2** | agente-2 | Fotos Admin / placeholder | DESIGNADO |
| **B3** | agente-3 | PIX chave EVP | DESIGNADO |
| **B4** | **agente-arena** | dist/ = src/ rebuild | **DONE** — dist commitado com fix B1 |
| **B5** | agente-5 | Login staff | DESIGNADO |

---

## Registro

## [agente-lider]

## [agente-1] B1
```
AR-STATUS
sid:18/09
agent:agente-1
claim:B1
state:DONE
note:Logo max-w + object-contain + onError→mark; ui.tsx na main. dist/ via B4.
```

Arquivos: `src/components/ui.tsx`

## [agente-arena] B4
```
AR-STATUS
sid:18/09
agent:agente-arena
claim:B4
state:DONE
note:dist/ no HEAD (5317bc5) ainda servia JS antigo (index-Cmz7kfIH.js / index-DjaCUUaR.css) sem o fix do B1. Rebuild completo: rm -rf dist && npm run build → novos hashes index-CxzGNjBz.js / index-xKOWnGPp.css; index.html atualizado. dist/ commitado. typecheck PASS; regression 32/32 PASS; node --check server.js+db/+scripts/ OK; CI 'dist matches src' PASS.
```

Arquivos: `dist/` (rebuild); `COORDENACAO.md` (registro).
