# 🤖 Protocolo de Colaboração entre Agentes de IA
## Projeto: Lanchonete QR · QRAdmin (Major Pub)

**Repositório:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Branch de auditoria:** `hardening/pre-sale-audit` (base `main`)  
**Data da auditoria:** 2026-09-15/16  
**Objetivo:** canal único de comunicação, coordenação e memória compartilhada entre agentes de IA que trabalham neste projeto.

---

## 1. Regras de Ouro (obrigatórias para todos os agentes)

1. **Leia este arquivo inteiro** no início de cada sessão de trabalho.
2. **Atualize este arquivo** antes de terminar qualquer tarefa significativa.
3. **Nunca sobrescreva** seções de outros agentes sem marcar claramente a alteração.
4. **Seja objetivo e estruturado** e use os templates abaixo.
5. **Priorize o estado atual** sobre histórico antigo; itens resolvidos devem sair do Kanban de trabalho.
6. **Registre decisões técnicas** antes de grandes mudanças quando houver impacto arquitetural.
7. **Não assuma contexto**: investigue e documente o que não estiver claro.
8. **Mantenha o português** neste documento e nos registros de trabalho.

---

## 2. Visão Geral do Projeto

Sistema full-stack de pedidos por QR Code para lanchonete/pub.

### Fluxo principal
```text
Cliente (QR mesa) → Cardápio + personalização → Pedido
       ↓
Cozinha / Bar (setores separados) → prepara
       ↓
Garçom → entrega parcial ou total
       ↓
Caixa → fecha sessão/comanda + PIX + divisão de conta
```

- Uma mesa pode ter vários pedidos na mesma sessão/comanda.
- Itens só entram no total depois de entregues.
- PIX é informado pelo cliente e confirmado pelo caixa; não há conciliação bancária automática.

### Stack
| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 7 + Tailwind 4 + Zustand + Framer Motion + Lucide |
| Backend | Node.js com HTTP nativo |
| Banco | PostgreSQL (Neon/local) + migrations SQL |
| Realtime | SSE (`/api/events`) |
| Imagens | sharp → WebP |
| Auth | Cookie httpOnly + scrypt + papéis admin/cozinha/bar/caixa |
| PIX | QR EMV estático |

### Estrutura principal
```text
server.js
 db/
 src/
 public/
 scripts/
 tests/
 data/                # legado/residual a confirmar
 .github/workflows/
```

### Como rodar
```bash
npm install
npm run setup
npm start
```

Em produção, `npm start` passa por `scripts/start-production.js`, que exige sucesso das migrations antes de carregar o servidor.

---

## 3. Papéis dos Agentes

| Agente | Responsabilidade | Foco |
|---|---|---|
| Arquiteto | decisões e refatorações grandes | `server.js`, contratos API, estrutura |
| Backend | regra de negócio, SQL e segurança | `db/`, migrations, SSE |
| Frontend | UI/UX, estado e temas | `src/`, Tailwind |
| QA/Testes | regressões e edge cases | `tests/`, `scripts/smoke*.js` |
| DevOps/Infra | deploy, env e produção | workflows, headers, startup |
| Product | fluxo do produto e documentação | README, roadmap, UX |

Um agente pode assumir vários papéis; declare-os no log.

---

## 4. Formato de Comunicação

### 4.1 Log de atividade
```markdown
### [YYYY-MM-DD HH:MM] Agente: <nome> · Papel: <papel>
**Tarefa:** <resumo>
**Status:** 🟢 concluído | 🟡 em andamento | 🔴 bloqueado | 🔵 proposta
**Arquivos tocados:** `...`
**O que foi feito / proposto:**
- ...
**Decisões tomadas:**
- ...
**Próximos passos sugeridos:**
- ...
**Dependências / perguntas para outros agentes:**
- ...
```

### 4.2 Kanban

#### 🔴 Bloqueado
- [ ] Validação visual em browser real, porque esta sessão não possui navegador automatizado disponível.
- [ ] Integração real com PostgreSQL de teste ainda não executada nesta sessão.

#### 🟡 Em andamento
- [ ] Auditoria de IDOR/autorização por recurso, limites de entrada, concorrência/TOCTOU, XSS, uploads e transições de status.
- [ ] Auditoria de responsividade em 360/390, tablet e desktop.
- [ ] Revisão final de produção/deploy e headers.

#### 🟢 Pronto para review / próximo
- [ ] #6 Auto-migrate fail-fast — implementado; validar em deploy.
- [ ] Revisão final do PR #7 antes do merge.
- [ ] Otimização do bundle >500 kB.

#### ✅ Concluído nesta rodada
- [x] #1 Proteção de `GET /api/mesas`.
- [x] #2 Hardening de SSRF em upload remoto.
- [x] #3 Defesa de origem/CSRF em mutações autenticadas por cookie.
- [x] #4 Remoção de fallback previsível de senha em produção.
- [x] #5 Validação numérica de produto/adicionais/categoria/estoque.
- [x] Tema claro suavizado.
- [x] CI de typecheck/build/regressões/sintaxe.

---

## 5. Estado Atual do Trabalho

### Última sincronização
- **Data:** 2026-09-16
- **Agente:** GPT-5.6 Luna · Arquiteto / Backend / Segurança / QA
- **Branch:** `hardening/pre-sale-audit`
- **PR:** #7 — `security: hardening e pré-venda`
- **Status:** 🟡 auditoria em andamento; não fazer merge antes da revisão final.

### Issues da auditoria

**#1 — `GET /api/mesas` expunha tokens**  
Correção: rota administrativa exige papel `admin`; resposta pública não deve expor tokens.

**#2 — Upload remoto permitia SSRF**  
Correção: validação DNS/IP reservado, bloqueio de credenciais na URL, somente HTTP/HTTPS, redirects desativados, timeout e limites de conteúdo.

**#3 — CSRF em operações por cookie**  
Correção: `Origin`/`Referer` são comparados com origens permitidas nas mutações autenticadas. Ausência de headers continua compatível com clientes não-browser; isso é defesa de origem, não substituto perfeito para token CSRF.

**#4 — Seed inseguro de staff**  
Correção: produção exige segredo configurado e mínimo de 12 caracteres; logout usa `Secure` em produção.

**#5 — Validação numérica administrativa**  
Correção: `db/validacao.js` centraliza `Number.isFinite`, inteiro/não-negativo e tratamento explícito de null/strings vazias. `db/admin.js` usa o validador em categoria, produto, preço, estoque, estoque mínimo e reordenação. Casos `NaN`, `Infinity`, `-Infinity`, vazio, boolean e objetos retornam erro 400 por validação.

**#6 — Auto-migrate não bloqueava produção**  
Correção: `scripts/start-production.js` executa migrations como gate antes do servidor; falha encerra o processo sem atender tráfego.

---

## 5.1 Histórico e discussão do tema

O seletor de tema já apresentou um problema no deploy porque o JavaScript usava `data-theme="escuro"` enquanto o CSS antigo esperava outro valor. A correção alinhou o atributo usado pelo runtime e pelo CSS, e o tema é aplicado também antes do paint.

O tema claro foi suavizado porque o branco puro era agressivo. A página usa `--qr-page: #e9eef3` e superfícies próximas de `#f7f9fb`; branco puro permanece apenas onde é funcional, como determinados componentes/QR.

A implementação atual deve preservar `data-theme`, localStorage com tratamento de falha, preferência do sistema e meta `theme-color`.

---

## 5.2 Decisões técnicas (ADR)

### ADR-001: Auditoria isolada em branch
**Data:** 2026-09-15  
**Status:** Aceito  
**Contexto:** elevar o projeto a nível comercial sem alterar diretamente o estado produtivo.  
**Decisão:** trabalhar em `hardening/pre-sale-audit` e integrar somente após revisão/testes.  
**Consequência:** `main` permanece protegida durante o hardening.

### ADR-002: Startup de produção depende de migrations
**Data:** 2026-09-16  
**Status:** Aceito  
**Decisão:** `npm start` e `npm run start:prod` executam `scripts/start-production.js`; falha de migration encerra o processo.

### ADR-003: Validação numérica centralizada
**Data:** 2026-09-16  
**Status:** Aceito  
**Contexto:** conversões diretas com `Number()` permitiam `Infinity`, `NaN` e mascaravam valores inválidos com `|| 0`.  
**Decisão:** usar `db/validacao.js` como ponto único para números administrativos e retornar 400 antes do SQL.  
**Consequência:** regras ficam reutilizáveis e testáveis sem depender do PostgreSQL.

### ADR-004: CI obrigatório para a branch de hardening
**Data:** 2026-09-16  
**Status:** Aceito  
**Decisão:** adicionar `.github/workflows/ci.yml` com `npm ci`, typecheck, build, regressões e `node --check server.js`.

---

## 6. Problemas Conhecidos / Débito Técnico

- Bundle principal acima de 500 kB.
- Rate-limit em memória; múltiplas instâncias exigiriam mecanismo compartilhado.
- PIX sem conciliação bancária automática.
- HTMLs legados ainda existem em `public/`.
- `data/db.json` parece residual e deve ser auditado antes de remover.
- A validação visual com browser real e a integração com PostgreSQL de teste permanecem pendentes nesta sessão.
- O servidor ainda mantém um caminho de auto-migrate best-effort em `server.js`; produção deve usar `npm start`/`start:prod` para aplicar o gate fail-fast.

---

## 7. Log de Atividades

### [2026-09-16] Agente: GPT-5.6 Luna · Papel: Arquiteto / Backend / Segurança / QA
**Tarefa:** Continuação da auditoria de pré-venda e fechamento do #5.
**Status:** 🟢 concluído nesta etapa
**Arquivos tocados:** `db/validacao.js`, `db/admin.js`, `tests/regressions.cjs`, `.github/workflows/ci.yml`, `AGENTS.md`.
**O que foi feito:**
- Criado validador numérico centralizado.
- Integrado em operações administrativas de produto/categoria/estoque/reordenação.
- Adicionados testes para `NaN`, `Infinity`, negativos, strings vazias, booleanos e tipos inválidos.
- Criado workflow de CI para typecheck, build, regressões e sintaxe.
- Restaurado este documento para preservar o protocolo e o histórico colaborativo em vez de o substituir por um resumo curto.
**Decisões tomadas:**
- Não mascarar entrada inválida com `|| 0`.
- Tratar `null` de estoque como opção explícita, mas rejeitar valores inválidos.
- Manter a branch isolada até revisão final.
**Próximos passos sugeridos:**
- Verificar o resultado do GitHub Actions.
- Auditar IDOR e transições de estado em `server.js`/`db/pedidos.js`/`db/caixa.js`.
- Validar browser e PostgreSQL reais.
- Atualizar estados das issues e do PR após as verificações.
**Dependências / perguntas para outros agentes:**
- Ambiente de browser real e banco PostgreSQL de teste para validação de integração.

### [2026-09-16] Histórico anterior — GPT-5.6 Luna
- Implementado startup fail-fast de production.
- Preservado `setup` e versões existentes do package para evitar regressão.
- Aplicadas correções #1–#4, SSRF, origem/CSRF e tema claro.

### [2026-09-15] Agentes anteriores
- Grok/Codex trabalharam em tema, SSE, login legado, responsividade inicial e correções de TypeScript. Essas decisões devem ser tratadas pelo código/commits do repositório e pelo histórico do PR como fonte primária.

---

**Este documento é vivo. Todo agente que alterar o projeto deve ler e actualizar o `AGENTS.md` ao concluir trabalho significativo.**
