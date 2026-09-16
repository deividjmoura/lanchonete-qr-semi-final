# Protocolo de Colaboração — Lanchonete QR / QRAdmin

**Repo:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Deploy:** https://qradmin.up.railway.app/  
**Branch de verdade:** **`main`** (única que deve ir para o Railway)

---

## ⛔ REGRA OBRIGATÓRIA (pedido do dono — 2026-09-15)

1. **Todo trabalho de agentes vai para a `main`.**
   Push direto na main ou PR **mergeado na main** no mesmo ciclo. Branch solta não sobe no Railway.
2. **Railway → Settings → Source → Branch = `main`.**
3. **PRs abertos sem merge = trabalho invisível.** Integrar ou fechar; não deixar pronto parado.
4. **Antes de abrir branch longa:** verificar o AGENTS; preferir commits pequenos na main.

### PRs abertos agora (status)
| PR | Branch | Estado | Ação |
|----|--------|--------|------|
| #8 | `arena/01a0a77d-...` → main | **conflito de merge** | Portar diffs úteis diretamente para a main; tema deve permanecer coordenado |
| #7 | `hardening/pre-sale-audit` → main | **draft + dirty** | Não mergear; portar fixes de segurança úteis para a main em commits pequenos |

**Grok já publicou na main:** tema (escuro/dark), `build` sem typecheck bloqueante, `test:dia`, este protocolo.

---

## Tema

- Causa histórica: JS `escuro` vs CSS `dark` + possível deploy de branch errada + build que falhava no typecheck.
- Há trabalho de tema em paralelo. **Agentes de backend/segurança não devem alterar o tema sem coordenação explícita.**
- Após Railway em `main` + redeploy: validar toggle com hard refresh.

## SUPER TESTE

```bash
BASE_URL=https://qradmin.up.railway.app npm run test:dia
```

Arquivo: `scripts/dia-inteiro.js` — multi-mesa, concorrência, PIX, caixa, admin.

**Aguardando:** dono atualizar/verificar Railway e autorizar a execução do teste contra o ambiente real.

---

## Auditoria profunda atual

### 🟢 Corrigido nesta rodada na `main`
- Bootstrap de staff sem senha previsível em produção; produção exige segredo configurado com mínimo de 12 caracteres.
- Cookie de logout recebe `Secure` em produção.
- Mutações autenticadas passam por validação adicional de `Origin`/`Referer`.
- Upload remoto de fotos bloqueia destinos privados/reservados, credenciais na URL e redirects automáticos, com timeout e limite de conteúdo.
- Abertura concorrente da sessão da mesa agora é serializada com `FOR UPDATE` antes de consultar/criar a sessão.
- IDs de produto usados na leitura das regras do pedido são rejeitados antes da query quando não são inteiros positivos.
- Operações de garçom passaram a validar IDs; exclusão limpa `pedidos.garcom_id` dentro da mesma transação; entrega limita e valida `itemIds`.
- `npm start` e `npm run start:prod` usam gate de migrations antes do servidor.
- CI foi criado para `main` com `npm ci`, typecheck, build, regressões e `node --check server.js`.

### 🔴 Pendências/achados que continuam abertos
- Endpoint genérico de status precisa impedir fallback de setor para update global quando o pedido não possui itens daquele setor.
- Validação numérica/admin ainda precisa ser portada para a main com cobertura de regressão.
- Hardening completo do fluxo de criação/edição de pedidos ainda precisa ser validado na main.
- `pix_avisos` ainda é criado por `CREATE TABLE IF NOT EXISTS` em tempo de requisição; precisa migration explícita antes do schema ser considerado final.
- Browser real, PostgreSQL de teste e deploy real ainda precisam validação observável.
- Rate-limit permanece em memória e não é compartilhado entre instâncias.
- A execução do CI para os commits mais recentes ainda não apareceu de forma observável; status do último commit mostrou somente o check do Railway como `pending`.

### 🟡 Em auditoria
- IDOR/autorização por papel.
- Limites e tipos de entrada.
- Concorrência/TOCTOU e estoque.
- Transições de estado.
- XSS/CSP/upload.
- Operações de caixa/pagamentos.
- Migrações/startup/observabilidade.
- Responsividade, sem interferir no agente do tema.

---

## Log

### [2026-09-16] GPT-5.6 Luna · Arquiteto / Backend / Segurança / QA
**Tarefa:** Auditoria profunda diretamente na `main` e portabilidade seletiva de hardenings já verificados.
**Status:** 🟡 em andamento
**Arquivos tocados:** `db/auth.js`, `db/foto.js`, `db/queries.js`, `db/garcons.js`, `scripts/start-production.js`, `package.json`, `.github/workflows/ci.yml`, `AGENTS.md`.
**O que foi feito:**
- Corrigido bootstrap de staff previsível e adicionada defesa de origem nas mutações autenticadas.
- Corrigido SSRF de upload remoto.
- Corrigida condição de corrida na abertura de sessão.
- Endurecidas operações de garçom.
- Startup de produção passou a exigir migrations bem-sucedidas.
- Adicionada CI automática.
- Nenhum arquivo do tema foi alterado por esta frente.
**Achados ainda não resolvidos:**
- Bypass de setor em `setStatusPedido()`.
- Validação numérica/admin ausente na main.
- DDL de `pix_avisos` em caminho de requisição.

### [2026-09-15 21:43] Grok
**Aviso do dono:** colegas estavam em branches/PRs; main é a única linha de deploy.
PR #8 com conflito; PR #7 draft/dirty. Pedido: colocar tudo relevante na main.

### [2026-09-15 21:36] Grok
`test:dia` + package.json na main.

### [2026-09-15 21:16] Grok
Build sem typecheck bloqueante; mismatch tema.
