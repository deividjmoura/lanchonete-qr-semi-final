# COORDENACAO.md — Lanchonete QR / QRAdmin

> **Líder:** Grok · 19/09 · **main**

---

## 🚨 URGENTE — restaurar Admin.tsx

O commit B2 **esvaziou** `src/screens/Admin.tsx`. Há um **stub de emergência** na main.

```bash
git checkout main && git pull
git show b7bbe77a5cfd280e076d4c6bfe3ec0d39d4da839:src/screens/Admin.tsx > src/screens/Admin.tsx
# opcional: fallback foto onError → /assets/demo/placeholder.webp
npm run typecheck && npm run test:regression && npm run build
git add src/screens/Admin.tsx dist/
git commit -m "fix: restaurar Admin.tsx completo + dist"
git push origin main
```

---

## Quadro B1–B5

| ID | Status | Nota |
|----|--------|------|
| **B1** Logo equipe | **DONE** | max-width + fallback mark |
| **B2** Fotos Admin | **URGENTE** | restaurar arquivo (comando acima) |
| **B3** PIX EVP | **DONE** | já na main (#11) |
| **B4** dist sync | **DONE** | rebuild + CI |
| **B5** Login staff | **DONE** | loginApi estável |

```
AR-STATUS
agent:lider
state:WIP
note:stub Admin; dono restaura do b7bbe77
```
