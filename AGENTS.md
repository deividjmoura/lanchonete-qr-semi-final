# 🤖 Protocolo de Colaboração entre Agentes de IA
## Projeto: Lanchonete QR · QRAdmin (Major Pub)

**Repositório:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Deploy:** https://qradmin.up.railway.app/  
**Objetivo:** Canal único de comunicação e coordenação entre agentes.

---

## 1. Regras de Ouro

1. Leia este arquivo no início de cada sessão.
2. Atualize antes de terminar tarefa significativa.
3. Nunca sobrescreva seções de outros sem marcar.
4. Seja objetivo; use templates.
5. Priorize estado atual.
6. Comunique decisões grandes aqui antes de implementar.
7. Não assuma contexto.
8. Português.

---

## 5. Estado Atual

### Última sincronização
- **2026-09-15 21:03 -03 · Grok**
- **Bug do tema RESOLVIDO na causa raiz** (aguardando redeploy Railway).

### Quadro de Tarefas

#### 🟡 Em andamento
- [ ] Redeploy Railway para aplicar fix do tema (build a partir do main)

#### 🟢 Pronto / próximo
- [ ] Gateway pagamento, WhatsApp, PWA, multi-loja, CSRF, Redis rate-limit…

#### ✅ Concluído recentemente
- **Causa raiz do seletor de tema:** CSS no deploy usava `[data-theme=dark]`, JS setava `data-theme="escuro"` → ícone mudava, cores não.
- Fix: JS grava `data-theme="dark"` no modo escuro; CSS aceita `escuro` **e** `dark`; fallback inline de `--qr-*`; script pré-paint alinhado.

### Problemas conhecidos
- Deploy Railway ainda na build antiga até o próximo deploy automático/manual.
- Bundle > 500 kB; rate-limit em memória; CSRF pendente; PIX sem conciliação.

---

## 5.1 Discussão: Seletor de tema

### Diagnóstico confirmado no deploy ao vivo (https://qradmin.up.railway.app/)

| Check | Resultado |
|-------|-----------|
| Ícone muda | ✅ |
| `data-theme` após clique | `escuro` (JS) |
| CSS compilado no Railway | `[data-theme=dark]` **apenas** |
| `--qr-page` computado | permanece `#f8fafc` |
| body background | permanece claro |

**Causa raiz:** mismatch de token — JS/PT `escuro` vs CSS do build em produção `dark`.

### Decisão (Grok)
- Canônico no localStorage continua `claro` | `escuro` (PT).
- No DOM: modo escuro grava `data-theme="dark"` para casar com CSS legado do Railway.
- CSS source aceita **ambos** os seletores.
- Fallback inline de variáveis críticas (sobrevive a qualquer desalinhamento).

### Commits
- `d38a4e9` — inline vars + seletor :root
- `5abf326` — CSS dual escuro/dark + JS grava `dark`
- (seguinte) — script pré-paint alinhado

### Para outros agentes
1. Após redeploy Railway, validar visualmente claro↔escuro em `/`, `/login`, `/mesa/...`.
2. Não reintroduzir só `escuro` no CSS sem o seletor `dark`.
3. Se rebuildar `dist/` localmente, commitar hashes novos.

---

## 6. Log de Atividades

### [2026-09-15 21:03 -03] Agente: Grok · Papel: Frontend
**Tarefa:** Diagnosticar tema no deploy Railway + corrigir
**Status:** 🟢 código no main; 🟡 aguardando redeploy
**O que foi feito:**
- Abriu https://qradmin.up.railway.app/, clicou o toggle via DevTools.
- Confirmou: `data-theme` → `escuro`, CSS só reconhece `dark`, cores não mudam.
- Assets no ar: `index-Sb2Fpkk3.js` / `index-4AQrrlOU.css` (diferentes do dist do GitHub).
- Push: JS seta `dark`, CSS dual, inline vars, script pré-paint.
**Próximo:** Railway redeploy + validação visual.

### [2026-09-15] Agente: Codex · Papel: Frontend/Backend/QA
Correções anteriores de tema, SSE, TypeScript, rebuild dist (parcialmente desalinhado com token dark vs escuro).

### [2026-09-15] Agente: Grok · Papel: Arquiteto
Criação do AGENTS.md e análise inicial do repo.

---

## 8. Instruções finais
Ler seções 1 e 5; registrar log; atualizar quadro; deixar o projeto melhor do que encontrou.

### [2026-09-16 00:20 UTC] Agente: Arena (Sessão devidjmoura) · Papel: Full-stack / QA
**Tarefa:** Diagnóstico definitivo do tema + correção + bateria de testes reais em browser
**Status:** 🟢 concluído (branch arena/*, PR aberto para main)
**Achado principal (causa raiz):**
- A branch `redesign-qradmin` contém o mismatch exato relatado: `tema.ts` seta
  `data-theme="escuro"` (PT) enquanto `index.css` só casa com `[data-theme="dark"]` (EN)
  → ícone muda, cores não. A branch não tem `dist/` commitado → deploy builda do fonte
  com hashes próprios (`index-Sb2Fpkk3.js`/`index-4AQrrlOU.css` no ar, conforme log do Grok).
- Se o serviço do Railway deploya de `redesign-qradmin` (provável, dado o comportamento),
  TODAS as correções feitas no main nunca chegaram ao app no ar. Conferir no Railway:
  Settings → Git → Branch (deve ser `main`).
**O que foi feito (na branch arena, PR para main):**
- Merge do origin/main + merge do hardening/pre-sale-audit (segurança: SSRF no upload,
  seed sem senha padrão em produção, validação de Origin em POSTs, proteção da listagem
  de mesas, cookie Secure; tema: paleta clara suave + anti-flash).
- `src/lib/tema.ts` reescrito limpo: canônico `escuro|claro`, normaliza legados
  `dark|light`, classe `.dark` de compat, fallback inline completo.
- `index.html` (pré-paint): seta canônico + classe + vars inline nos DOIS temas (sem flash).
- `src/index.css`: `:root` claro alinhado à paleta suave do fallback inline (antes divergiam);
  bloco escuro aceita `escuro`, `dark` e `html.dark`.
- `server.js`: HTMLs legados (`/admin.html` etc.) redirecionam para a rota SPA quando
  `dist/` existe (antes ficavam acessíveis, sem seletor de tema → mais um "tema não funciona").
- `tests/regressions.cjs`: mock de DOM com getAttribute/setAttribute/classList de verdade
  (os 2 testes que falhavam voltaram a passar) + 3 testes novos (flash claro, aliases
  legados, redirect). 11/11 passando — antes 4/6.
- `vite.config.ts`: manualChunks react/motion/icons — bundle principal 569→413 kB (sem warning).
- `dist/` REBUILDADO e commitado em sincronia com o src (estava defasado no main).
**Verificação real (Chromium headless contra o build final, PostgreSQL real):**
- 22/22 checks: toggle claro↔escuro em Landing/Mesa/Login/Admin/Cozinha/Bar/Caixa,
  persistência após reload, OS dark na 1ª visita, redirects legados.
- `npm run build` (typecheck incluso), smoke e smoke-full: OK.
**Para o dono:** após merge do PR, conferir a branch do deploy no Railway (usar `main`)
e fazer redeploy + hard refresh (Ctrl+Shift+R).
