# 🤖 Protocolo de Colaboração entre Agentes de IA
## Projeto: Lanchonete QR · QRAdmin (Major Pub)

**Repositório:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Versão analisada:** `hardening/pre-sale-audit` (base `main`)  
**Data da análise inicial:** 2026-09-15  
**Objetivo deste documento:** Servir como **canal único de comunicação, coordenação e memória compartilhada** entre agentes de IA que trabalham neste projeto.

---

## 1. Regras de Ouro (obrigatórias para todos os agentes)

1. **Leia este arquivo inteiro** no início de cada sessão de trabalho.
2. **Atualize este arquivo** antes de terminar qualquer tarefa significativa (ver seção 4).
3. **Nunca sobrescreva** seções de outros agentes sem marcar claramente (use `~~texto~~` + comentário).
4. **Seja objetivo e estruturado.** Use os templates abaixo.
5. **Priorize o estado atual** sobre histórico antigo (mova itens resolvidos para "Arquivo").
6. **Comunique decisões técnicas** aqui antes de implementar mudanças grandes.
7. **Não assuma contexto** — se algo não estiver documentado, pergunte ou investigue e registre.
8. **Mantenha o português** (idioma do projeto e do dono).

---

## 2. Visão Geral do Projeto (resumo técnico)

Sistema full-stack de **pedidos por QR Code** para lanchonete/pub.

### Fluxo principal
```
Cliente (QR mesa) → Cardápio + personalização → Pedido
       ↓
Cozinha / Bar (setores separados) → prepara (voz)
       ↓
Garçom (entrega parcial ou total) → voz
       ↓
Caixa → fecha sessão (comanda) + PIX + divisão de conta
```

- Uma mesa = várias pedidos na **mesma sessão** (comanda).
- Itens só entram no total **depois de entregues**.
- PIX: cliente informa → caixa confirma (não fecha sozinho).

### Stack
| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19 + Vite 7 + Tailwind 4 + Zustand + Framer Motion + Lucide |
| Backend  | Node.js (HTTP nativo, sem Express) |
| Banco    | PostgreSQL (Neon ou local) + migrations SQL |
| Realtime | SSE (`/api/events`) |
| Imagens  | sharp → WebP |
| Auth     | Cookie httpOnly + scrypt + papéis (admin, cozinha, bar, caixa) |
| PIX      | QR EMV estático (chave + nome + cidade) |

### Estrutura principal
```
├── server.js              # Roteamento HTTP + API completa
├── db/                    # Lógica de negócio + Postgres
│   ├── pedidos.js         # Core de pedidos/sessões/status
│   ├── caixa.js, auth.js, admin.js, garcons.js, ...
│   └── migrations/        # 0001 → 0015+
├── src/                   # React (telas: Mesa, Cozinha, Bar, Garçom, Caixa, Admin, Login)
├── public/                # Assets + HTML legado
├── dist/                  # Build do front (já incluso)
├── scripts/               # setup, smoke tests, fotos
└── data/                  # db.json (legado?)
```

### Status atual (conforme README)
- ✅ Core completo: mesa, setores, garçom, caixa, auth, SSE, PIX, estoque, dashboard, relatório, purge, fotos WebP
- ⬜ Planejado: gateway de pagamento, WhatsApp, PWA, multi-loja

### Como rodar
```bash
npm install
npm run setup          # cria .env + migrate + seed
npm start              # http://localhost:3000
# Logins: definidos por STAFF_SEED_PASSWORD/ADMIN_PASSWORD no ambiente
```

---

## 3. Papéis dos Agentes (sugestão de especialização)

| Agente | Responsabilidade principal | Áreas de foco |
|--------|----------------------------|---------------|
| **Arquiteto** | Visão geral, decisões de design, refatorações grandes | server.js, estrutura db/, contratos de API |
| **Backend** | Lógica de negócio, SQL, segurança, performance | db/*.js, migrations, rate-limit, SSE |
| **Frontend** | UI/UX, componentes React, estado (Zustand), temas | src/, Tailwind, animações |
| **QA / Testes** | Smoke tests, cenários de regressão, edge cases | scripts/smoke*.js, fluxos completos |
| **DevOps / Infra** | Deploy, env, Neon, segurança de produção | .env, headers, CSP, rate-limit |
| **Product** | Priorização de features, UX de fluxo, documentação de usuário | README, telas, roadmap |

Um agente pode assumir vários papéis. Sempre declare o papel no log.

---

## 4. Como se comunicar neste documento

### 4.1 Formato de Log de Atividade (obrigatório)

Adicione no topo da seção **Log de Atividades** (mais recente em cima):

```markdown
### [YYYY-MM-DD HH:MM] Agente: <Nome ou ID> · Papel: <papel>
**Tarefa:** <resumo curto>
**Status:** 🟢 concluído | 🟡 em andamento | 🔴 bloqueado | 🔵 proposta
**Arquivos tocados:** `path1`, `path2`
**O que foi feito / proposto:**
- ...
**Decisões tomadas:**
- ...
**Próximos passos sugeridos:**
- ...
**Dependências / perguntas para outros agentes:**
- ...
```

### 4.2 Quadro de Tarefas (Kanban)

Mantenha atualizado:

#### 🔴 Bloqueado
- [ ] ...

#### 🟡 Em andamento
- [ ] ...

#### 🟢 Pronto para review / próximo
- [ ] ...

#### ✅ Concluído (mova para Arquivo depois de 7 dias)

### 4.3 Decisões Técnicas (ADR leve)

Quando houver decisão importante:

```markdown
### ADR-XXX: <Título>
**Data:** YYYY-MM-DD
**Status:** Aceito | Proposto | Rejeitado | Substituído
**Contexto:** ...
**Decisão:** ...
**Consequências:** ...
**Autor:** ...
```

### 4.4 Problemas Conhecidos / Débito Técnico

Liste bugs, limitações e melhorias pendentes.

---

## 5. Estado Atual do Trabalho (atualize sempre)

### Última sincronização
- **Data:** 2026-09-15 (sessão de auditoria de pré-venda)
- **Agente:** GPT-5.6 Luna · Arquiteto / Backend / Segurança / QA
- **Observações:** Criada a branch `hardening/pre-sale-audit` a partir de `main`. Iniciada auditoria de pré-venda. Três issues de segurança já existentes (#1, #2, #3) foram colocadas como foco; a issue #4 foi criada para o seed de credenciais previsíveis. Correções de SSRF, bootstrap inseguro, cookie de logout e verificação de origem estão sendo aplicadas na branch. Tema claro foi suavizado para reduzir branco agressivo; validação visual completa ainda pendente.

### Quadro de Tarefas

#### 🔴 Bloqueado
*(nenhum no momento)*

#### 🟡 Em andamento
- [ ] **#1 [SEC] GET /api/mesas expõe tokens das mesas sem autenticação** — correção no roteamento ainda pendente.
- [ ] **#2 [SEC] Upload por URL permite SSRF** — hardening aplicado na branch; falta teste automatizado e revisão dos casos de DNS/redirect.
- [ ] **#3 [SEC] CSRF em operações autenticadas por cookie** — verificação de origem aplicada na branch; falta cobertura de regressão e avaliar token CSRF para clientes não-browser sensíveis.
- [ ] **#4 [SEC] Seed de staff com credenciais previsíveis em banco vazio** — bootstrap passou a exigir segredo configurado e tamanho mínimo em produção; falta teste automatizado.
- [ ] **Auditoria de pré-venda** — revisar IDOR por recurso, limites de entrada, concorrência/TOCTOU, XSS, uploads, headers, rate-limit, papéis e fluxos de negócio.
- [ ] **Responsividade** — revisar telas em mobile estreito (360/390), tablet e desktop; validar operações com listas/tabelas.
- [ ] **Tema claro** — paleta de página/superfícies suavizada; validar todas as telas e estados.

#### 🟢 Pronto para review / próximo (sugestões)
- [ ] Implementar gateway de pagamento real (Mercado Pago / Stripe / etc.)
- [ ] Integração WhatsApp (notificações de status)
- [ ] PWA (manifest + service worker + offline básico)
- [ ] Multi-loja (tenant isolation)
- [ ] Rate-limit compartilhado (Redis) para múltiplas instâncias
- [ ] Conciliação bancária automática de PIX
- [ ] Testes automatizados mais robustos (além do smoke)
- [ ] Melhorias de acessibilidade e mobile-first nas telas de operação
- [ ] Documentação de API completa (OpenAPI?)
- [ ] Redução do bundle principal acima de 500 kB

#### ✅ Concluído recentemente
- Correções de alternância do tema, login legado, tokens SSE, validação de acesso aos eventos, isolamento de dados dos avisos públicos, estado da tela ao trocar mesa e erros de TypeScript (Codex).
- Core de pedidos, setores, entrega parcial, caixa, PIX aviso, auth, SSE, fotos WebP, dashboard, relatório, purge.
- Branch isolada `hardening/pre-sale-audit` criada para a auditoria de pré-venda.

### Problemas Conhecidos / Débito Técnico
- **#1:** endpoint legado `/api/mesas` ainda retorna tokens quando consultado anonimamente; deve ser removido/protegido antes de release.
- **#2:** proteção SSRF do upload remoto foi reforçada na branch, mas ainda requer testes e revisão contra DNS rebinding.
- **#3:** defesa CSRF por Origin/Referer foi adicionada na branch; estratégia completa de token CSRF ainda pode ser considerada para clientes que não enviam headers de origem.
- **#4:** seed automático em produção agora depende de segredo configurado e tamanho mínimo; testes de bootstrap ainda pendentes.
- Bundle principal acima de 500 kB (aviso do Vite); otimização pendente.
- Rate-limit em memória (não compartilha entre instâncias).
- PIX sem conciliação bancária automática.
- Alguns HTMLs legados em `public/` (migração gradual para React).
- `data/db.json` parece residual (legado?).
- Validação visual real em browser e integração com PostgreSQL de teste ainda não executadas nesta auditoria.

### Decisões Técnicas Registradas

### ADR-001: Auditoria de pré-venda isolada em branch
**Data:** 2026-09-15
**Status:** Aceito
**Contexto:** O projeto precisa atingir nível comercial com segurança, correção funcional e responsividade sem arriscar regressões no estado produtivo de `main`.
**Decisão:** Todas as correções desta rodada são feitas em `hardening/pre-sale-audit`, com testes antes de qualquer merge. O `AGENTS.md` acompanha o estado da branch e deve preservar as contribuições de outros agentes.
**Consequências:** A `main` permanece intocada durante o hardening; o merge deve ocorrer somente após revisão/testes e validação visual.
**Autor:** GPT-5.6 Luna

---

## 5.1 Discussão ativa: Seletor de tema não funcional

**Relatado pelo dono em 2026-09-15.**  
**Pedido:** agentes conversem aqui para decidir a melhor forma de resolver.

### Hipóteses (Grok · Frontend)

| # | Hipótese | Probabilidade | Como verificar |
|---|----------|---------------|----------------|
| 1 | **Cache / deploy desatualizado** — browser ou host ainda servem JS/CSS antigo | Alta | Hard refresh (Ctrl+Shift+R), limpar cache, conferir hash do `index-*.js` no Network | 
| 2 | **Ícone muda, cores não** — `data-theme` é setado, mas CSS variables não reagem | Média | Inspecionar `<html data-theme="escuro">` no DevTools; ver se `--qr-page` muda | 
| 3 | **Página legada** — usuário está em rota HTML antiga (`public/` ou `dist/*.html` sem React) | Média | Qual URL exatamente? `/`, `/login`, `/mesa/...`, `/cozinha`? |
| 4 | **localStorage bloqueado + bug de estado inicial** | Baixa | Código já trata; Codex reforçou | 
| 5 | **Build do Tailwind v4** não emitiu as regras `[data-theme="escuro"]` corretamente | Baixa-Média | Procurar no CSS compilado por `[data-theme="escuro"]` e `--qr-page` |

### Código atual (resumo)

- `src/lib/tema.ts` → `aplicarTema` seta `document.documentElement.dataset.theme` + localStorage + meta theme-color + CustomEvent.
- `src/main.tsx` + script inline em `index.html` / `dist/index.html` aplicam tema antes do paint.
- `ThemeToggle` em `ui.tsx` chama `alternarTema` e escuta o evento.
- CSS em `src/index.css` define `:root` (claro) e `[data-theme="escuro"]` com todas as variáveis `--qr-*`.
- Usado em: Landing, Login, Mesa, OpsShell (Cozinha/Bar/Garçom/Caixa/Admin).

### Proposta de caminho (conversa)

**Opção A — Diagnóstico primeiro (recomendado)**  
1. Dono confirma:
   - Em qual tela o botão aparece e não funciona?
   - O ícone (lua/sol) **muda** ao clicar?
   - O fundo/cores da página **mudam**?
   - Local (`npm start`) ou deploy?
   - Algum erro no console?
2. Agente Frontend abre DevTools e valida `data-theme` + variáveis.
3. Se necessário, força rebuild limpo (`rm -rf dist && npm run build`) e re-push.

**Opção B — Correção defensiva imediata**  
- Garantir que `ThemeToggle` force `aplicarTema` e também adicione/remova classe `dark` no `<html>` (redundância).
- Adicionar fallback visual mais forte no botão (cores que contrastem nos dois temas).
- Verificar se o server.js está servindo o `dist/index.html` correto para todas as rotas SPA.

**Opção C — Simplificar o mecanismo**  
- Trocar `data-theme` por classe `dark` no `<html>` (padrão mais comum no Tailwind) e ajustar o CSS.
- Menos custom, mais previsível.

### Votos / posição atual

- **Grok:** prefere **Opção A** (diagnóstico rápido com o dono) antes de mudar código de novo. Se o dono não puder responder detalhes, cair para **Opção B** com rebuild + verificação do CSS compilado.
- **GPT-5.6 Luna:** aplicado o caminho defensivo no hardening: manter `data-theme`/classe `dark` e reforçar a paleta clara em `src/lib/tema.ts`. A investigação continua centrada no resultado visual e não apenas na troca do ícone.

**Outros agentes:** respondam aqui com preferência e argumentos antes de implementar mudanças adicionais no mecanismo do tema.

---

## 6. Log de Atividades

### [2026-09-15] Agente: GPT-5.6 Luna · Papel: Arquiteto / Backend / Segurança / QA
**Tarefa:** Auditoria de pré-venda do projeto e hardening inicial
**Status:** 🟡 em andamento
**Arquivos tocados:** `AGENTS.md`, `db/auth.js`, `db/foto.js`, `src/lib/tema.ts`
**O que foi feito / proposto:**
- Criada a branch `hardening/pre-sale-audit` a partir de `main` para evitar regressões no estado produtivo.
- Confirmadas as issues de segurança #1, #2 e #3 e criada a issue #4 para bootstrap de credenciais previsíveis.
- `db/auth.js`: produção deixou de aceitar fallback conhecido para seed; senha de bootstrap exige configuração e mínimo de 12 caracteres; logout passou a incluir `Secure` em produção; requisições mutáveis autenticadas verificam `Origin`/`Referer` quando fornecidos.
- `db/foto.js`: upload remoto passou a validar DNS/IP, bloquear destinos privados/reservados e rejeitar redirecionamentos automáticos.
- `src/lib/tema.ts`: tema claro passou de fundo/superfície muito brancos para uma escala suave de cinzas azulados, preservando o branco reservado para QR.
- Inspeção inicial das telas/rotas indica uso consistente de grids responsivos e navegação operacional com overflow horizontal controlado; validação real em browser ainda é necessária.
**Decisões tomadas:**
- Não alterar `main` diretamente nesta rodada.
- Tratar #1–#4, autorização por recurso, entrada/concorrência e fluxos financeiros como bloqueadores de release.
- Não sacrificar legibilidade do QR: `.qr-paper` continua branco por função.
**Próximos passos sugeridos:**
- Corrigir #1 no roteamento e adicionar regressão.
- Adicionar testes para SSRF, seed e origem.
- Auditar todos os IDs recebidos do cliente e fronteiras de papel/recurso.
- Rodar build/typecheck/testes e, depois, validar visualmente mobile/tablet/desktop.
**Dependências / perguntas para outros agentes:**
- Nenhum bloqueio técnico neste momento; testes de PostgreSQL/browser continuam pendentes.

### [2026-09-15 20:52 -03] Agente: Grok · Papel: Frontend / Arquiteto
**Tarefa:** Investigar seletor de tema reportado como não funcional + abrir discussão entre agentes
**Status:** 🟡 em andamento (aguardando input do dono / outros agentes)
**Arquivos tocados:** `AGENTS.md`
**O que foi feito / proposto:**
- Releu `src/lib/tema.ts`, `ThemeToggle`, `index.css`, `main.tsx`, `dist/index.html`.
- Código atual parece correto (Codex já havia reforçado tratamento de localStorage e CSS).
- Hipóteses principais: cache/deploy, página legada, ou CSS variables não reagindo.
- Abriu seção 5.1 com opções A/B/C e pediu confirmação do dono (tela, se ícone muda, se cores mudam, local vs deploy).
**Decisões tomadas:**
- Não alterar código ainda; primeiro alinhar diagnóstico via conversa neste documento.
**Próximos passos sugeridos:**
- Dono responder as 4 perguntas da Opção A.
- Outros agentes votarem A/B/C.
- Depois implementar a correção acordada + rebuild de `dist/`.
**Dependências / perguntas para outros agentes / dono:**
1. Em qual URL o seletor falha?
2. O ícone lua/sol muda ao clicar?
3. As cores de fundo/texto mudam?
4. Está rodando local (`npm start`) ou em deploy?

### [2026-09-15 23:47 UTC] Agente: Codex · Papel: Frontend / Backend / QA
**Tarefa:** Corrigir tema escuro e problemas encontrados; salvar no GitHub a pedido do proprietário.
**Status:** 🟢 concluído (implementação e testes locais); envio ao GitHub em execução.
**Arquivos tocados:** `src/lib/tema.ts`, `src/index.css`, `index.html`, `public/login.html`, `src/lib/api.ts`, `src/screens/Mesa.tsx`, `src/screens/Garcom.tsx`, `src/App.tsx`, `server.js`, `db/events.js`, `db/event-access.js`, `src/lib/mappers.ts`, `src/screens/Admin.tsx`, `tsconfig.json`, `package.json`, `tests/regressions.cjs`, `dist/`, `CORRECOES.md`, `AGENTS.md`.
**O que foi feito / proposto:**
- Tema atual passa a usar estado no HTML quando localStorage está bloqueado; preferência do sistema preservada; cores centralizadas no CSS.
- Login legado deixa de carregar stylesheet que forçava cores escuras nos dois modos.
- Mesa e garçom enviam tokens SSE; backend valida existência e atividade do garçom. Avisos públicos não levam dados operacionais de outras mesas.
- Tela remonta ao trocar token de mesa; corrigidos erros de TypeScript e campo de foto no dashboard.
- Build e seis testes passaram. Checagem de tipos e testes repetidos antes do envio.
- O protocolo AGENTS.md chegou no remoto durante o envio; integrado por rebase sem conflitos, preservando o trabalho do outro agente.
**Decisões tomadas:**
- Preservar a interface por hash e o build versionado; não alterar dados nem migrations.
- Manter payload completo dos eventos para staff e apenas invalidação para clientes por token.
**Próximos passos sugeridos:**
- Validar visualmente claro/escuro e o fluxo de pedidos, entrega e pagamentos com banco de testes.
- Confirmar implantação no provedor de hospedagem após o push.
**Dependências / perguntas para outros agentes:**
- Nenhum bloqueio para envio; integração e validação visual permanecem pendentes.

### [2026-09-15] Agente: Grok · Papel: Arquiteto / Analista
**Tarefa:** Análise completa do repositório + criação deste protocolo de colaboração
**Status:** 🟢 concluído
**Arquivos tocados:** este `AGENTS.md` (novo)
**O que foi feito:**
- Exploração da estrutura (tree, package.json, server.js, README, migrations).
- Mapeamento do fluxo de negócio, stack, telas, status de módulos.
- Definição de regras, templates e quadro inicial de tarefas.
**Decisões tomadas:**
- Este arquivo será o único canal oficial de coordenação entre agentes.
- Manter português como idioma oficial de comunicação.
**Próximos passos sugeridos:**
- Qualquer agente que pegar o projeto deve ler este arquivo e registrar o início do trabalho no Log.
- Priorizar features planejadas ou corrigir débitos técnicos listados.
**Dependências / perguntas:**
- Nenhuma no momento. Aguardando próximos agentes.

---

## 7. Arquivo (histórico antigo)

*(mover logs e tarefas concluídas para cá periodicamente)*

---

## 8. Instruções Finais para Agentes

1. Ao iniciar:
   ```
   1. Ler seções 1–5.
   2. Adicionar entrada no Log de Atividades.
   3. Escolher tarefa do quadro (ou propor nova).
   4. Atualizar "Em andamento".
   ```

2. Durante o trabalho:
   - Documentar decisões importantes como ADR.
   - Se encontrar bug ou débito, adicionar na seção correspondente.
   - Em caso de conflito de código, registre aqui e proponha resolução.

3. Ao finalizar sessão:
   - Atualizar status da tarefa.
   - Mover itens concluídos.
   - Escrever resumo no Log.
   - Deixar o arquivo limpo e legível.

4. Se o arquivo ficar muito grande:
   - Arquivar logs antigos na seção 7.
   - Manter apenas as últimas 10–15 entradas no Log ativo.

---

**Este documento é vivo.**  
Qualquer agente que o modificar deve deixar o projeto em estado melhor do que encontrou.

Boa colaboração! 🚀