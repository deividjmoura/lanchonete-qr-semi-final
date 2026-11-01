# Coordenação de dois agentes — QR Admin (2026-11-01)

## Decisões do responsável (registradas nesta data)

1. **Identidade visual global = dashboard azul/violeta** ("Os números da sua casa"). A exceção
   permanece **somente** para o cardápio do cliente em `#/mesa/:token`.
2. Autorizado: concluir/atualizar issues já implementadas, corrigir os PRs abertos e mergear o que
   estiver verde.
3. 2FA: decisão delegada a este agente — **não implementar agora**; sai da #55 e vira issue própria
   com plano aprovado e bloqueio operacional explícito (ver `docs/engineering/admin-credentials-and-2fa.md`).
4. Trabalho dividido em **duas frentes** com donos e arquivos disjuntos.

## Divisão de frentes

### Frente A — Identidade visual global (tokens) + governança
**Dono:** agente da branch `arena/8a903abe-lanchonete-qr-semi-final`.
Único que edita:

- `public/garcom-pwa/design-tokens.css` (fonte única de tokens)
- `src/index.css` (mapeamento `@theme` do Tailwind + primitivas globais)
- `src/screens/dashboard.css`
- `src/screens/operacional.css`
- `src/lib/tema.ts` (espelho dos fallbacks sem flash)
- `docs/DESIGN_SYSTEM.md`, `docs/engineering/**`
- novo teste `tests/design-tokens-identidade.test.cjs`

Escopo: criar a camada de tokens da identidade azul/violeta (superfícies de palco, vidro, camadas,
acentos, espaçamento, movimento, estados), migrar `dashboard.css` e `operacional.css` para 100% tokens
(hoje 119 + 93 hex hardcoded), corrigir a divergência interna do `DESIGN_SYSTEM.md`, e cuidar das
issues (#55 com checklist atualizado, 2FA em issue separada, status de #41/#43/#44/#45/#48/#50/#53).

### Frente B — PRs de UX + aplicação da identidade nas telas
**Dono:** segundo agente (branch própria `arena/*`).
Único que edita:

- `src/screens/admin/MapaQrMesas.tsx`, `src/screens/admin/PanoramaMesas.tsx`, `src/screens/admin/MesasAdmin.tsx`
- `src/screens/Admin.tsx`, `src/screens/Dashboard.tsx`, `src/screens/{Login,Landing,Cozinha,Bar,Caixa,Garcom,Mesa}.tsx`
- `src/components/ui.tsx`, `src/components/OpsShell.tsx`, `src/components/FilaProducao.tsx`
- `db/atendimento.js`, `src/lib/api.ts`
- `public/garcom-pwa/{styles.css,index.html,app.js,sw.js}`
- `tests/design-system.test.cjs`, `tests/pracas-mesas-admin.test.cjs`,
  `tests/pwa-garcom-lote-cobranca.test.cjs`, `tests/postgres-remocao-garcom.test.cjs`,
  `tests/admin-categorias-drag.test.cjs`, `scripts/ssr-smoke-panorama.mjs`

Escopo: corrigir e mergear #172/#174/#176, completar modal (focus trap/E2E), completar relatório de
garçons, e **aplicar** os tokens da Frente A em todas as telas administrativas/operacionais e no PWA.

### Arquivos neutros (ninguém edita sem avisar)
`server.js`, `db/migrations/**`, `.github/workflows/**`, `package.json`, `package-lock.json`, `security/**`.

## Dependência entre as frentes

```
Frente A: tokens (design-tokens.css, index.css) ──► Frente B: aplicação nas telas
          ^ não depende de nada                        ^ depende dos tokens publicados
```

A Frente B **pode** começar pelos defeitos funcionais (não usam tokens) e só depois aplicar o visual.
A Frente A entrega primeiro a camada de tokens justamente para desbloquear a aplicação.

## Protocolo de coordenação

- Cada agente trabalha **apenas na própria branch**; PRs próprios; nenhum `push --force`, `reset --hard`
  ou cherry-pick entre frentes.
- Antes de editar, `git fetch origin` e conferir se o arquivo alvo mudou.
- Merge em `main` só com CI verde **e** autorização do responsável.
- Registro de andamento neste documento (seção "Andamento") ou no corpo do PR.
- Conflito em arquivo da outra frente: **parar e avisar**, não resolver por conta própria.
- Nenhuma issue é fechada por um agente sem o outro saber (evita fechar item que a outra frente ainda
  referencia nos testes).

## Andamento

| Frente | Item | Estado |
|---|---|---|
| A | Diagnóstico de auditoria | ✅ entregue (`auditoria-2026-11-01-diagnostico.md`) |
| A | Camada de tokens azul/violeta | ⏳ aguardando liberação do responsável |
| B | Correção de #172 (TS1381 + teste) | ⏳ não iniciado |
| B | Merge/validação de #174 (modal) | ⏳ não iniciado |
| B | Correção de #176 (regex de data + 2 testes) | ⏳ não iniciado |
