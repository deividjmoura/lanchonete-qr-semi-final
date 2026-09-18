# COORDENACAO.md — Lanchonete QR / QRAdmin

> **Repo:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
> **Deploy:** https://qradmin.up.railway.app/ → branch **`main`**  
> **Líder:** agente-lider (Grok) — **autorizado a decidir** sem pedir permissão ao dono  
> **Sessão:** 18/09/2026

---

## ⛔ Regras de ouro (obrigatórias)

1. **`main` é a única linha de verdade.** Trabalho concluído = **push/merge na `main` no mesmo ciclo**.
2. **Não abrir dezenas de branches.** Preferência:
   - **Opção A (padrão):** commit pequeno **direto na `main`** (1 domínio, testes ok).
   - **Opção B (só se conflito real):** **uma** branch curta `wip/<dominio>` → PR → **merge imediato** → apagar branch.
3. **Proibido:** deixar PR aberto “para depois”; branch arena longa; reescrever arquivo inteiro do colega sem merge consciente.
4. **`dist/` acompanha `src/`.** Mudou front → `npm run build` e commit do `dist/` no mesmo push.
5. **Não mexer em tema** (`src/lib/tema.ts`, `src/index.css` tema, pré-paint) sem claim `tema` aprovado no Registro.
6. **1 domínio = 1 agente.** Domínio = pasta/arquivo, não “feature branch eterna”.
7. Dúvida de arquitetura → anote no Registro; o **Líder decide** (não o dono humano a cada passo).

---

## Domínios (claim no Registro antes de codar)

| Domínio | Arquivos típicos | Agente |
|---------|------------------|--------|
| `api-server` | `server.js` | livre |
| `db-pedidos` | `db/pedidos.js`, `db/queries.js` | livre |
| `db-caixa-pix` | `db/caixa.js`, `db/pix-*.js` | livre |
| `db-auth-foto` | `db/auth.js`, `db/foto.js`, `db/garcons.js` | livre |
| `db-migrations` | `db/migrations/*` | livre (cuidado) |
| `front-mesa` | `src/screens` mesa/cliente | livre |
| `front-ops` | cozinha/bar/garçom/caixa | livre |
| `front-admin` | admin | livre |
| `tema` | tema/css pré-paint | **bloqueado** até ordem |
| `qa-scripts` | `tests/*`, `scripts/teste-*.js`, `scripts/dia-inteiro.js` | livre |
| `ci-docs` | `.github/*`, docs | livre |

---

## Fila prioritária (Líder — 10:30)

Pegue **um** item, registre claim, entregue na **main**.

| ID | Prioridade | Tarefa | Done means |
|----|------------|--------|------------|
| **L1** | P0 | Smoke local: `npm ci` + `npm run test:regression` documentar resultado no Registro | saída 0 ou lista de falhas |
| **L2** | P0 | Garantir CI verde na `main` (abrir Actions, se vermelho corrigir **na main**) | workflow success |
| **L3** | P1 | Validar `GET /api/config/pix` + aviso de chave inválida no Caixa (regressão PIX EVP) | teste ou nota runtime |
| **L4** | P1 | Rate-limit: documentar limites atuais + 1 melhoria mínima se trivial | doc no Registro ou código mínimo |
| **L5** | P2 | Lazy `framer-motion` se bundle ainda pesado (sem quebrar UI) | build + dist commitado |
| **L6** | P2 | Checklist responsividade 360/390 (texto no Registro; browser real se tiver) | notas |

**Não fazer agora:** multi-loja, WhatsApp, PWA, gateway pagamento novo, redesign visual grande.

---

## Como trabalhar (fluxo curto)

```text
1. Ler este arquivo + AGENTS.md (histórico)
2. Claim no Registro (domínio + ID da fila)
3. Codar no menor escopo possível
4. npm run test:regression  (e build se front)
5. Push NA MAIN (ou 1 PR e merge na hora)
6. Handoff no Registro: DONE + arquivos
```

### Formato de claim

```
AR-STATUS
sid:18/09
agent:<id>
claim:<dominio>
task:L1|L2|…
state:WIP|DONE|BLOCKED
note:<curto>
```

---

## Branches legadas (não usar; dono pode apagar depois)

- `arena/*`, `hardening/pre-sale-audit`, `redesign-qradmin`, `Gzuis-Version`  
Trabalho útil já deve estar na `main`. **Não branchar a partir delas.**

---

## Registro de agentes

## [agente-lider] — 10:30
```
AR-STATUS
sid:18/09
agent:lider
claim:coordenacao
state:WIP
note:trunk-based ativo; fila L1–L6; decisões sem pedir dono
```

## Aguardando claims L1–L6
