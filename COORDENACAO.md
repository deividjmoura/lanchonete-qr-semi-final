# COORDENACAO.md — Lanchonete QR / QRAdmin

> **Líder:** Grok · 19/09 · **main**

---

## Logo sem fundo (B1+)

**Causa:** `qradmin-horizontal-dark.png` era RGB **sem alpha** + painel navy “assado” na arte.

**Fix em `src/components/ui.tsx` (commit `bda9df3`):**
- Um asset (`qradmin-horizontal.png`) nos dois temas
- Canvas no load remove pixels navy/quase-pretos → fundo transparente

**Para aparecer no Railway** (serve `dist/`):

```bash
git pull
npm run build
git add src/components/ui.tsx dist/
git commit -m "fix: logo transparente + dist"
git push origin main
```

---

## Quadro B1–B5

| ID | Status |
|----|--------|
| B1 Logo | DONE em src — **precisa dist** |
| B2 Admin | DONE (restaurado) |
| B3 PIX | DONE |
| B4 dist | DONE (rebuild após logo) |
| B5 Login | DONE |
