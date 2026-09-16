# 🤖 Protocolo de Colaboração entre Agentes de IA
## Projeto: Lanchonete QR · QRAdmin (Major Pub)

**Repositório:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Branch de auditoria:** `hardening/pre-sale-audit` (base `main`)  
**Data da auditoria:** 2026-09-15/16  
**Objetivo:** canal único de comunicação, coordenação e memória compartilhada entre agentes de IA que trabalham neste projeto.

---

## 1. Regras de Ouro (obrigatórias para todos os agentes)

1. Leia este arquivo inteiro no início de cada sessão.
2. Atualize este arquivo antes de terminar tarefa significativa.
3. Nunca sobrescreva trabalho de outro agente sem registrar a alteração.
4. Seja objetivo e estruturado; use os templates abaixo.
5. Priorize o estado atual sobre histórico antigo.
6. Registre decisões técnicas antes de mudanças grandes.
7. Não assuma contexto; investigue e documente.
8. Mantenha o português.

---

## 2. Visão Geral do Projeto

Sistema full-stack de pedidos por QR Code para lanchonete/pub.

### Fluxo principal
```text
Cliente (QR mesa) → Cardápio + personalização → Pedido
       ↓
Cozinha / Bar → prepara
       ↓
Garçom → entrega parcial ou total
       ↓
Caixa → fecha sessão/comanda + PIX + divisão de conta
```

- Uma mesa pode ter vários pedidos na mesma sessão.
- Itens só entram no total depois de entregues.
- PIX é informado pelo cliente e confirmado pelo caixa.

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

---

## 3. Papéis dos Agentes

| Agente | Responsabilidade |
|---|---|
| Arquiteto | decisões e refatorações grandes |
| Backend | regra de negócio, SQL, segurança |
| Frontend | UI/UX, estado, temas |
| QA/Testes | regressões e edge cases |
| DevOps/Infra | deploy, env, CI e produção |
| Product | fluxo e documentação |

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
- [ ] Validação visual em browser real.
- [ ] Integração com PostgreSQL de teste.

#### 🟡 Em andamento
- [ ] Auditoria final de IDOR/autorização, limites de entrada, concorrência/TOCTOU, XSS, uploads e transições de estado.
- [ ] Auditoria de responsividade em 360/390, tablet e desktop.
- [ ] Validação de deploy/CI e startup.

#### 🟢 Pronto para review / próximo
- [ ] #6 Auto-migrate fail-fast — implementação concluída; validação em deploy ainda pendente.
- [ ] Revisão final do PR #7 antes do merge.
- [ ] Otimização do bundle >500 kB.

#### ✅ Concluído nesta rodada
- [x] #1 Proteção de `GET /api/mesas`.
- [x] #2 Hardening de SSRF em upload remoto.
- [x] #3 Defesa de origem/CSRF em mutações autenticadas.
- [x] #4 Seed seguro sem senha padrão em produção.
- [x] #5 Validação numérica administrativa.
- [x] Corrigida condição de corrida na abertura de sessão por mesa.
- [x] Validação de IDs/quantidades no fluxo de pedidos.
- [x] Tema claro suavizado.
- [x] CI de typecheck/build/regressões/sintaxe criado.

---

## 5. Estado Atual do Trabalho

### Última sincronização
- **Data:** 2026-09-16
- **Agente:** GPT-5.6 Luna · Arquiteto / Backend / Segurança / QA
- **Branch:** `hardening/pre-sale-audit`
- **PR:** #7 — `security: hardening e pré-venda`
- **Status:** 🟡 auditoria de pré-venda em andamento.

### Issues da auditoria

**#1 — tokens de mesa expostos em `/api/mesas`**
- Corrigido: a rota exige `admin`.

**#2 — SSRF no upload remoto**
- Corrigido: DNS/IP reservado, credenciais na URL, redirects, timeout e limites de conteúdo.

**#3 — CSRF/origem em operações por cookie**
- Corrigido: `Origin`/`Referer` são comparados com origens permitidas em mutações autenticadas.
- Observação: sem token CSRF formal, clientes não-browser sem esses headers permanecem compatíveis.

**#4 — seed de staff previsível**
- Corrigido: produção exige segredo configurado com mínimo de 12 caracteres; logout ganha `Secure` em produção.

**#5 — números inválidos no admin**
- Corrigido e issue fechada como completed.
- `db/validacao.js` centraliza números finitos, inteiros e não negativos.
- `db/admin.js` usa o validador e não mascara erro com `|| 0`.

**#6 — migration não bloqueava startup de produção**
- Implementado `scripts/start-production.js` como gate de migrations.
- Ainda precisa validação em ambiente de deploy.

### Nova descoberta durante auditoria
**Concorrência na abertura da sessão da mesa**
- O código antigo capturava `23505` dentro da mesma transação e depois tentava consultar novamente; após erro de constraint, o PostgreSQL mantém a transação abortada até rollback/savepoint.
- Correção: `getOuAbrirSessao()` agora adquire `FOR UPDATE` na linha da mesa antes de consultar/criar a sessão.
- Também foi adicionada validação de `productId`, `pedidoId`, `itemId` e quantidade no fluxo de pedidos.
- Testes unitários cobrem o lock e entradas inválidas.

---

## 5.1 Histórico do tema

O tema já teve incompatibilidade entre o valor `data-theme` escrito pelo JavaScript e o seletor CSS. Isso foi alinhado na branch. O tema claro foi suavizado para reduzir branco agressivo (`--qr-page: #e9eef3`, superfície próxima de `#f7f9fb`).

---

## 5.2 Decisões técnicas (ADR)

### ADR-001: Auditoria isolada em branch
**Data:** 2026-09-15 · **Status:** Aceito  
Todas as correções ficam em `hardening/pre-sale-audit` até revisão/testes finais.

### ADR-002: Startup de produção depende de migrations
**Data:** 2026-09-16 · **Status:** Aceito  
`npm start` e `npm run start:prod` passam pelo gate de migration; falha encerra o processo.

### ADR-003: Validação numérica centralizada
**Data:** 2026-09-16 · **Status:** Aceito  
Entradas administrativas numéricas devem ser finitas, com limites explícitos; inválidos não podem ser mascarados.

### ADR-004: CI para hardening
**Data:** 2026-09-16 · **Status:** Aceito  
`.github/workflows/ci.yml` executa `npm ci`, typecheck, build, regressões e `node --check server.js`.

### ADR-005: Serialização da sessão por linha de mesa
**Data:** 2026-09-16 · **Status:** Aceito  
`getOuAbrirSessao()` deve bloquear a mesa com `FOR UPDATE` antes de criar/reutilizar a sessão aberta.

---

## 6. Problemas Conhecidos / Débito Técnico

- Bundle principal acima de 500 kB.
- Rate-limit em memória.
- PIX sem conciliação bancária automática.
- HTMLs legados em `public/`.
- `data/db.json` parece residual.
- Browser real e PostgreSQL de teste ainda não foram executados nesta sessão.
- `server.js` conserva auto-migrate best-effort para caminhos de execução direta; produção deve usar `npm start`/`start:prod`.
- GitHub Actions ainda não apresentou uma execução observável para os commits desta sessão; portanto CI não deve ser tratado como verde até aparecer um run.

---

## 7. Log de Atividades

### [2026-09-16] Agente: GPT-5.6 Luna · Papel: Arquiteto / Backend / Segurança / QA
**Tarefa:** Auditoria de concorrência e robustez do fluxo de pedidos.
**Status:** 🟢 concluído nesta etapa
**Arquivos tocados:** `db/queries.js`, `db/pedidos.js`, `tests/regressions.cjs`, `AGENTS.md`.
**O que foi feito:**
- Corrigida condição de corrida na criação da sessão com lock `FOR UPDATE` na mesa.
- Impedido que IDs `NaN`/`Infinity` e quantidades fora de 1–99 cheguem às queries do pedido.
- Limitados itens do pedido e listas de adicionais/remoções para reduzir payloads abusivos.
- Criados testes de regressão para lock e IDs inválidos.
**Decisões tomadas:**
- Preferir serialização explícita por linha de mesa em vez de tentar recuperar `23505` numa transação já abortada.
- Manter validação de preço no servidor baseada no produto do banco; nunca confiar em preço enviado pelo cliente.
**Próximos passos sugeridos:**
- Continuar revisão de `caixa`, `garcons`, transições de status e possíveis IDORs.
- Verificar execução do CI e preparar relatório final de pré-venda.
- Validar browser e PostgreSQL reais antes de liberar o merge.

### [2026-09-16] Agente: GPT-5.6 Luna · Papel: Arquiteto / Backend / Segurança / QA
**Tarefa:** Fechar validação numérica administrativa e recuperar protocolo colaborativo.
**Status:** 🟢 concluído
**Arquivos tocados:** `db/validacao.js`, `db/admin.js`, `tests/regressions.cjs`, `.github/workflows/ci.yml`, `AGENTS.md`.
**O que foi feito:**
- Centralizada a validação de números do admin.
- Fechada a issue #5 após implementação e cobertura de testes.
- Criado CI.
- Restaurado o protocolo completo do `AGENTS.md` após uma atualização anterior ter deixado apenas um resumo.

### [2026-09-15] Agentes anteriores
- Grok/Codex trabalharam em tema, SSE, login legado, responsividade inicial e correções de TypeScript; decisões devem ser confirmadas pelo histórico do código/PR.

---

**Este documento é vivo. Todo agente que modificar o projeto deve ler e actualizar o `AGENTS.md` ao concluir trabalho significativo.**
