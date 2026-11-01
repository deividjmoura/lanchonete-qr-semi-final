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
          ^ ENTREGUE em 327307b                        ^ DESBLOQUEADA: pode aplicar agora
```

**Sem bloqueio pendente:** a camada de tokens já está publicada e verde (394/394 testes). A Frente B
pode aplicar o visual em paralelo aos defeitos funcionais. Regras de consumo e lista de tokens por
papel estão na seção 7 (Handoff).

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
| A | Camada de tokens azul/violeta | ⏳ aguardando o responsável liberar o início |
| B | Briefing entregue (`prompt-frente-b-agente-2.md`) | ✅ com correções já validadas em worktree isolado |
| B | Correção de #172 (TS1381 + teste) | ⏳ não iniciado |
| B | Merge/validação de #174 (modal) | ⏳ não iniciado |
| B | Correção de #176 (regex de data + 2 testes) | ⏳ não iniciado |

---

## 7. Handoff da Frente A — identidade disponível para consumo (2026-11-01)

**Status:** camada de tokens fechada e publicada na branch (`327307b`). A Frente B já pode consumir
sem esperar mais nada. Números de verificação: **394/394 testes**, `tsc` limpo, `vite build` OK,
SSR smoke OK.

### O que mudou de contrato (atenção nas telas)

| Antes | Agora | Ação na Frente B |
|---|---|---|
| Hex/rgba direto nos CSS de palco | `var(--stage-*)` | usar token; se faltar papel visual, pedir token em vez de escrever cor |
| `.ops-card-surface` sem brilho | usa `--glass-sheen` + `--glass-border` | nada a fazer; só não sobrescrever `box-shadow` |
| Fibra de papel no regime expressivo | grade do palco (`--stage-grid`) | nada a fazer |
| `--surface`/`--brand`/`--accent` da paleta antiga | azul/violeta (`#EEF1F8`/`#0B101B`, `#5B3FC4`/`#8B6FFF`) | onde houver cor fixa, trocar por token semântico |
| Nenhuma classe de palco global | `.stage-surface`, `.stage-card` | **reutilizar** em telas/panels novos em vez de recriar gradiente + sombra |

### Tokens que a Frente B deve preferir

- **Estrutura de tela escura:** `.stage-surface` (fundo em 3 paradas + 2 halos + grade) e
  `.stage-card` (vidro + hairline + `--elev-3`, hover `--elev-4`).
- **Texto sobre palco:** `--stage-ink` → `-2` → `-muted` → `-subtle` → `-faint` (nessa ordem).
- **Acento por estado de fila:** `--stage-cyan` (em produção), `--stage-amber` (na fila),
  `--stage-lime` (pronto), `--stage-rose`/`--stage-danger-ink` (atraso).
- **Movimento:** `--dur-quick`/`--dur-base` com `--ease-out`; nada de bounce. `prefers-reduced-motion`
  já zera as durações — não é preciso repetir a media query por componente.
- **Foco/pressão/desabilitado:** já centralizados no arquivo de tokens (`:focus-visible` com
  `--focus-ring`); não redefinir por tela.

### Ponto de atenção de escopo

`src/index.css` agora tem as classes de palco **e** as regras de estado globais — não editar esse
arquivo na Frente B; se precisar de ajuste, mandar o pedido com o seletor e o papel desejado.

### Pendências que continuam minhas

1. `tests/e2e/visual-system.e2e.cjs` não roda neste ambiente (Chromium sem `libnss3`/`libnspr4`);
   a validação visual final depende de quem tiver navegador — a suíte unitária cobre o contrato.
2. Alinhamento fino do PWA (`public/garcom-pwa/styles.css` é da Frente B): já importa
   `design-tokens.css` e herda a paleta, mas os cartões de pedido ainda podem usar `--stage-*` para
   ganhar o mesmo hairline do dashboard.

## 8. PR da Frente A aberto e verde

**PR #179** — `feat(design): identidade global Palco Azul/Violeta em tokens, palco e documentação`
→ base `main`, 7 commits, 19 arquivos.

| Check | Resultado |
|---|---|
| `verify` | pass (1m02s) |
| `postgres-migrations` | pass (42s) |
| `postgres-integration` | pass (5m18s) |

Aguardando revisão do responsável para merge (nenhum merge foi feito por mim). Enquanto o #179 não
entrar em `main`, a Frente B consome os tokens a partir desta branch ou espera o merge — o importante é
**não duplicar** a camada de tokens nas telas.
