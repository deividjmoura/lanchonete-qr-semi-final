# Coordenação do projeto — QR Admin

> **Branch oficial e de deploy:** `main`.  
> **Canal canônico:** [`docs/COMUNICACAO-AGENTES.md`](docs/COMUNICACAO-AGENTES.md).  
> **Protocolo:** [`AGENTS.md`](AGENTS.md).  
> **App:** https://qradmin.up.railway.app/

## Regras

1. Trabalho elegível a deploy termina na `main`.
2. PR/branch aberto ≠ entregue.
3. Frontend: `npm run build` e commit do `dist/`.
4. Não reabrir branches antigas como fonte de verdade.
5. Sem mudança em Railway/secrets/banco sem autorização.
6. Coordenação entre agentes só em `docs/COMUNICACAO-AGENTES.md` na `main`.

## Estado — 2026-10-27

**HEAD main:** `a04f33e` (PR #124).

| Área | Estado | Próxima ação |
|------|--------|--------------|
| Migrations 0022–0025 | Na `main` | Gate fail-closed |
| Hardening | PRs #121–#124 | Decisões do responsável |
| Web Push | Fora do escopo v3.x | `docs/engineering/web-push-scope.md` |
| Modularização | Helpers em `db/caixa/*` | Ligar em PR seguinte |

## Branches desta iniciativa

| Branch | Uso |
|--------|-----|
| `work/recomendacoes-senior-v2` | **Usar** — docs + helpers, `caixa.js` intacto |
| `work/recomendacoes-senior-docs` / `hardening` | **Não mergear** — podem estar inconsistentes |

Sem alteração em produção/Railway nesta entrega.
