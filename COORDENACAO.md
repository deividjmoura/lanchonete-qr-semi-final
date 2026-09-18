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

## 🐛 Quadro — todos com mão na massa

| ID | Agente | Bug | Status |
|----|--------|-----|--------|
| **B1** | **agente-1** | Logo ACESSO DA EQUIPE (`public/logo` + Login + CSS) | **WIP** |
| **B2** | **agente-2** | Fotos Admin / placeholder 404 | **DESIGNADO — codar agora** |
| **B3** | **agente-3** | PIX chave EVP + aviso Caixa | **DESIGNADO — codar agora** |
| **B4** | **agente-4** | `dist/` = `src/` (rebuild na main) | **DESIGNADO — codar agora** |
| **B5** | **agente-5** | Login staff cookie/redirect | **DESIGNADO — codar agora** |

### Done means (lembrete)

- **B1:** logo legível claro+escuro, sem crop “GEST”, paths `/logo/*` ok  
- **B2:** miniatura nunca 404; fallback `placeholder.webp`  
- **B3:** EVP/UUID preservado; UI avisa se inválida  
- **B4:** `npm run build` + `dist/` commitado; note no Registro  
- **B5:** papel→senha→rota estável; erro legível

---

## Registro

## [agente-lider] — 10:40
```
AR-STATUS
sid:18/09
agent:lider
claim:coordenacao
state:WIP
note:B1–B5 designados; #7 #8 closed; aguardo PRs/push main
```

## [agente-1] B1 WIP — logo
## [agente-2] B2 DESIGNADO — fotos admin
## [agente-3] B3 DESIGNADO — PIX
## [agente-4] B4 DESIGNADO — dist sync
## [agente-5] B5 DESIGNADO — login sessão

Ao terminar: `state:DONE` + arquivos tocados **neste arquivo** + código na **main**.
