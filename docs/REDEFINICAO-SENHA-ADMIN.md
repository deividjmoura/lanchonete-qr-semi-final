# Redefinição de senha pelo Admin (senha esquecida)

## Problema

Durante os testes, a senha da Cozinha foi configurada e depois esquecida. O fluxo
antigo (`/api/me/senha`) exigia a senha atual, então não havia como recuperar o
acesso pelo próprio sistema sem intervenção no banco/scripts.

## O que mudou

O botão de senha do shell operacional agora abre um diálogo diferente conforme o
papel:

- **Admin**: o diálogo pergunta **de qual setor** é a senha (Admin, Cozinha, Bar,
  Caixa) e pede apenas a **nova senha + confirmação**. Não existe campo de senha
  antiga. Vale para qualquer setor, inclusive a própria conta do Admin.
- **Cozinha / Bar / Caixa**: continua como antes — troca da própria senha,
  exigindo a senha atual.

Rotas novas:

| Método | Rota | Quem pode | Efeito |
| --- | --- | --- | --- |
| GET | `/api/admin/contas` | Admin autenticado | Lista contas ativas (id, nome, login, papel, flag de troca). Nunca expõe hash. |
| POST | `/api/admin/contas/senha` | Admin autenticado | Redefine a senha do login informado sem exigir a senha antiga. |

Corpo do POST: `{ "login": "cozinha", "senhaNova": "..." }`.

## Proteções mantidas

A remoção da senha antiga é uma decisão de produto para o caso "esqueci a senha".
Ela **não** remove as demais camadas:

1. **Sessão + origem + CSRF** obrigatórios (`exigirSessao`).
2. **Papel admin** obrigatório na rota e **revalidado dentro da transação**
   (conta ativa e ainda admin no instante da escrita).
3. **Sessão do ator revalidada dentro da transação**: se outra redefinição
   concorrente revogou o cookie enquanto esperava o lock, a escrita é recusada.
4. **Política de senha** unchanged: mínimo 12, máximo 128, variedade, não conter
   o login do alvo, não ser comum.
5. **Senha exclusiva**: não pode ser igual à atual do alvo nem à de outra conta
   ativa.
6. **Revogação de todas as sessões do alvo**. Se o alvo for o próprio Admin, uma
   sessão de substituição é criada **na mesma transação** e o cookie é rotacionado
   — ele não perde o acesso.
7. **Auditoria com ator**: `staff_credencial_eventos` ganha `ator_staff_id` e
   `ator_login`, e os eventos `senha_redefinida` / `senha_redefinicao_rejeitada`.
   Continua sem guardar senha, hash, token ou IP.
8. **Rate limit** por admin e por IP (10 / 30 tentativas por 15 min).
9. **Troca obrigatória não tranca a recuperação**: as rotas de recuperação usam
   `exigirSessao` + papel admin, não `exigirAcesso`, para que um Admin com senha
   inicial/compartilhada ainda consiga definir a própria senha sem a antiga.
10. **Senha compartilhada**: ao redefinir uma conta que dividia o hash com outras,
    as demais continuam marcadas para troca obrigatória.

## Banco de dados

Migração aditiva `0028_admin_redefine_senha.sql`:

- `ALTER TABLE staff_credencial_eventos ADD COLUMN IF NOT EXISTS ator_staff_id ...`
- `ALTER TABLE staff_credencial_eventos ADD COLUMN IF NOT EXISTS ator_login ...`
- Amplia o CHECK de `evento` mantendo os valores antigos.
- Índice por ator.

Não altera hashes nem sessões existentes. Aplicada automaticamente pelo gate de
migrations do `npm start` / `scripts/start-production.js`.

## Como usar

1. Entre como **Admin**.
2. Clique no ícone de chave (**Redefinir senha de um setor**).
3. Escolha o setor (ex.: **Cozinha**).
4. Digite a nova senha e a confirmação.
5. Salve. As sessões antigas daquele setor são desconectadas; o próximo login
   usa a senha nova.

Para a própria senha do Admin, escolha **Admin (minha conta)**. A sessão atual é
rotacionada e você continua conectado.

## Validação executada

- `npm run typecheck` — ok.
- `npm test` — **338/338** (inclui 7 regressões novas do contrato de recuperação).
- `npm run build` — ok; `dist/` regenerado.
- `npm run test:pg -- --sem-backup` — **7/7 suítes**, incluindo
  `postgres-password-change.test.cjs` com **15 testes** (8 novos de redefinição:
  outro setor, própria conta, não-admin/inativos, política/reuso, senha
  compartilhada, concorrência, sessão revogada, listagem sem hash).
- `npm run test:e2e` — **5/5**, incluindo o novo
  `admin-redefine-senha.e2e.cjs` (**10 verificações** em Chromium real: login,
  diálogo sem senha antiga, redefinição da Cozinha confirmada no banco, auditoria
  do ator, redefinição da própria conta sem perder acesso, login da Cozinha com a
  senha nova, não-admin bloqueado, troca do não-admin ainda com senha atual).
- O drill de backup/restore roda no CI (cliente PG16).

## Limitações

- Não houve acesso nem mutação em produção/Railway. A validação foi local com
  PostgreSQL descartável e Chromium real.
- O rate limit é em memória por processo; em múltiplas instâncias, usar store
  compartilhado (Redis/Cloudflare) como já documentado em `db/rateLimit.js`.
- A recuperação sem senha antiga pressupõe que a sessão Admin já está autenticada.
  Se o Admin também perder a própria senha e não houver sessão válida, continua
  sendo necessário o script operacional `scripts/reset-senha.js` com
  `STAFF_SEED_PASSWORD` no ambiente.
