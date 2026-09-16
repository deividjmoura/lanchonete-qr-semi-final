# 🤖 Protocolo de Colaboração entre Agentes de IA
## Projeto: Lanchonete QR · QRAdmin (Major Pub)

**Repositório:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Versão analisada:** `hardening/pre-sale-audit` (base `main`)  
**Data da análise inicial:** 2026-09-15  
**Objetivo deste documento:** Servir como **canal único de comunicação, coordenação e memória compartilhada** entre agentes de IA que trabalham neste projeto.

---

## 5. Estado Atual do Trabalho (atualize sempre)

### Última sincronização
- **Data:** 2026-09-16
- **Agente:** GPT-5.6 Luna · Arquiteto / Backend / Segurança / QA
- **Branch:** `hardening/pre-sale-audit`
- **PR:** #7 — `security: hardening e pré-venda`
- **Status:** 🟡 auditoria de pré-venda em andamento.

### Quadro de Tarefas

#### 🔴 Bloqueado
- [ ] Nenhum bloqueio técnico confirmado.

#### 🟡 Em andamento
- [ ] **#5 [BUG] Validação numérica do admin aceita NaN/Infinity** — precisa de validação explícita no ponto de entrada das operações administrativas.
- [ ] Auditoria de IDOR/autorização por recurso, limites de entrada, concorrência/TOCTOU, XSS e papéis.
- [ ] Validação visual real em browser: 360px, 390px, tablet e desktop.
- [ ] Integração real com PostgreSQL de teste.

#### 🟢 Pronto para review / próximo
- [ ] **#6 [OPS] Auto-migrate fail-fast** — `scripts/start-production.js` implementado; falta validar em ambiente de deploy.
- [ ] **#1 [SEC] tokens de mesas** — `/api/mesas` protegido por admin.
- [ ] **#2 [SEC] SSRF** — DNS/IP reservado bloqueado e redirects automáticos desativados.
- [ ] **#3 [SEC] CSRF** — Origin/Referer validados em mutações autenticadas.
- [ ] **#4 [SEC] bootstrap** — sem fallback de senha conhecido em produção.

#### ✅ Concluído recentemente
- Branch isolada de hardening criada para não alterar `main` durante a auditoria.
- Tema claro suavizado; white puro preservado apenas para componentes funcionais como o QR.

### Problemas Conhecidos / Débito Técnico
- Bundle principal acima de 500 kB.
- Rate-limit em memória.
- PIX sem conciliação bancária automática.
- HTMLs legados ainda existentes.
- `data/db.json` possivelmente residual.
- CI do GitHub não apresentou workflow ativo para este PR nesta execução.
- Teste visual com browser real e PostgreSQL de teste continuam pendentes.

### Decisões Técnicas

### ADR-001: Auditoria isolada em branch
**Status:** Aceito  
**Decisão:** manter o hardening em `hardening/pre-sale-audit` até revisão/testes finais; não fazer push direto para `main`.  
**Autor:** GPT-5.6 Luna

### ADR-002: Startup de produção depende de migrations
**Status:** Aceito  
**Decisão:** `npm start` e `npm run start:prod` passam por `scripts/start-production.js`; se migration falhar, o processo encerra sem carregar o servidor.  
**Autor:** GPT-5.6 Luna

## 6. Log de Atividades

### [2026-09-16] Agente: GPT-5.6 Luna · Papel: Arquiteto / Backend / Segurança / QA
**Tarefa:** Implementação das issues prioritárias da auditoria de pré-venda.
**Status:** 🟡 em andamento
**Arquivos tocados:** `scripts/start-production.js`, `package.json`.
**O que foi feito:**
- Implementado startup fail-fast para migrations de produção.
- Preservado o `setup` original após revisão, evitando regressão no fluxo local.
- PR #7 continua como branch isolada para revisão antes de merge.
**Decisões tomadas:**
- Não alterar `main` diretamente.
- #6 deve bloquear tráfego quando o schema não puder ser atualizado.
- #5 ainda exige correção explícita de entrada, sem mascarar valores inválidos.
**Próximos passos sugeridos:**
- Finalizar #5.
- Executar typecheck/build/regressões.
- Continuar auditoria de autorização e responsividade.
- Validar com PostgreSQL/browser reais.
**Dependências / perguntas para outros agentes:**
- Nenhuma; ambiente real continua sendo dependência de validação final.

### [2026-09-15] Agentes anteriores
- Histórico de Grok/Codex e as decisões de tema, SSE, login legado e demais correções permanecem no histórico do projeto/PR.

---

**Este documento é vivo.** Qualquer agente que modificar o projeto deve atualizar este protocolo ao concluir trabalho significativo.
