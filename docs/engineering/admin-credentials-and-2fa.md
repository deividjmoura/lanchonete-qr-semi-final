# Credenciais de staff: troca de senha e avaliação de 2FA

Issue: [#55](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/55). Complementa #48 (autoria de ações) e #49 (senha em scripts).

## 1. O que foi implementado

| Critério da #55 | Implementação |
|---|---|
| Trocar a própria senha com reautenticação | `POST /api/me/senha` `{ senhaAtual, senhaNova }`. Exige sessão, Origin e `X-CSRF-Token`; confere a senha atual (scrypt, tempo constante). UI: botão de chave no cabeçalho (`OpsShell`). |
| Invalidar sessões antigas, com política explícita | **Política: toda troca revoga todas as sessões da conta** (inclusive a atual) e emite uma sessão nova com token rotacionado no mesmo request. Sessões de outras contas não são afetadas. Tudo na mesma transação do novo hash. |
| Auditar sem segredos | Tabela `staff_credencial_eventos` (`senha_alterada`, `senha_troca_falhou`, `senha_troca_rejeitada`; staff, login, nº de sessões revogadas, horário). Sem senha, hash, token ou IP. Teste prova que a trilha não contém segredos. |
| Forçar troca de credenciais iniciais/temporárias | O seed de bootstrap e `scripts/reset-senha.js` marcam `deve_trocar_senha`. Para redefinir somente um login (sem afetar os demais), use `STAFF_SEED_PASSWORD=… npm run db:reset-senha -- --login=<nome>`. Enquanto marcada, `exigirAcesso` responde `403 SENHA_TROCA_OBRIGATORIA` e a UI abre um diálogo sem opção de fechar. `exigirSessao` (a própria troca), `/api/me` e `/api/logout` continuam permitidos. |
| Evitar senha compartilhada entre papéis | (a) conta cujo hash é **idêntico** ao de outra conta ativa é tratada como "troca obrigatória" (derivado em tempo de execução, sem migrar dados); (b) a nova senha é recusada se já for a senha de outra conta ativa. |
| Limitação de tentativas | 5 tentativas/15 min por conta e 20/15 min por IP (mesmo limitador em memória do login; vale por processo, ver #50). |
| Regressão | `tests/password-change.test.cjs` (política, regra, contrato da rota) e `tests/postgres-password-change.test.cjs` (PostgreSQL descartável: senha errada, política, revogação de sessões, auditoria, bloqueio/liberação, compartilhada, concorrência). |
| Não tocar credenciais reais | Todos os testes usam usuários sintéticos criados e removidos pelo próprio teste. |

Política de senha (servidor é a fonte da verdade, `validarPoliticaSenha`): 12 a 128 caracteres, pelo menos 5 caracteres distintos, fora de uma lista curta de senhas comuns, sem conter o próprio usuário, diferente da atual e exclusiva entre contas ativas.

### Impacto na primeira publicação (leia antes do deploy)

- Em `NODE_ENV=production` a troca obrigatória fica **ligada por padrão**. As quatro contas de bootstrap (`admin`, `cozinha`, `bar`, `caixa`) compartilham o mesmo hash, então **cada uma terá que definir uma senha própria no primeiro login após o deploy**. Isso é o objetivo do critério, mas muda a rotina de quem usa cozinha/bar/caixa: combine antes e tenha a senha atual à mão.
- Para adiar conscientemente: `STAFF_FORCE_PASSWORD_CHANGE=false`. Fora de produção o padrão é desligado para não quebrar scripts de smoke/carga locais.
- Não há migração de dados: `0024` só adiciona colunas/tabela. O login lê os novos campos via `to_jsonb`, então continua funcionando mesmo se a `0024` ainda não tiver sido aplicada (relevante enquanto o auto-migrate do `npm start` é best-effort, #6).
- Páginas HTML legadas (`public/*.html`) não têm tela de troca; elas só são servidas quando `dist/` não existe. Com o SPA (caso normal), a tela está no `OpsShell`.

## 2. Avaliação de 2FA para administradores (não implementado)

> Critério da #55: "implementar apenas após definir método e critérios de recuperação". Este capítulo é a proposta para decisão do responsável.

### Ameaças que o 2FA cobre / não cobre

| Cobre | Não cobre |
|---|---|
| Senha de admin vazada, reutilizada ou adivinhada | Sessão já roubada (cookie `HttpOnly` roubado de um dispositivo comprometido) |
| Credencial compartilhada por engano/foto/papel | Admin coagido ou dispositivo desbloqueado e compartilhado |
| Força bruta (soma ao rate limit) | Phishing em tempo real (TOTP pode ser retransmitido; WebAuthn não) |

Superfície crítica: o papel `admin` altera cardápio, preços, mesas, garçons, purge e acessa todos os relatórios. `caixa`, `cozinha` e `bar` operam em dispositivos compartilhados de balcão, onde 2FA por login traria atrito alto e pouco ganho; a mitigação deles é senha exclusiva + troca obrigatória (item 1).

### Opções

| Método | Prós | Contras | Veredito |
|---|---|---|---|
| **TOTP** (app autenticador) | Sem custo, offline, padrão (RFC 6238), independe de provedor | Retransmissível em phishing; exige guardar segredo no servidor; relógio do aparelho | **Recomendado para o MVP** |
| WebAuthn/passkeys | Resistente a phishing; sem segredo compartilhado | Mais UI/compatibilidade; recuperação mais complexa | Fase 2 (opcional, além do TOTP) |
| OTP por SMS/WhatsApp/e-mail | Familiar | Custo, SIM swap, depende de terceiros e entregabilidade | Não recomendado |

### Desenho proposto (TOTP)

1. **Escopo:** obrigatório para `papel = admin`; opcional para os demais.
2. **Segredo:** 160 bits aleatórios, guardado **cifrado** (AES-256-GCM com chave `TOTP_ENC_KEY` do ambiente, fora do banco). Nunca em log, nunca em claro no backup.
3. **Ativação:** a conta autenticada (e reautenticada com a senha) escaneia um QR local (sem serviço externo, vide #70) e confirma com um código antes de ativar. Só então grava `totp_ativo = true`.
4. **Login em 2 etapas:** senha correta → sessão **parcial** (`mfa_pendente`) sem acesso a nenhuma rota → `POST /api/login/2fa` com o código → sessão completa. Janela ±1 passo (30 s), rejeitando reuso do mesmo passo (`totp_ultimo_passo`). Rate limit próprio (5/5 min por conta).
5. **Recuperação (decisão crítica):**
   - 10 códigos de recuperação de uso único, exibidos **uma vez**, guardados apenas como hash.
   - Regra de dois admins: outro admin pode desativar o 2FA de uma conta (com reautenticação e evento auditado em `staff_credencial_eventos`).
   - *Break-glass* operacional: script `scripts/reset-2fa.js <login>`, executável apenas por quem tem acesso ao ambiente de produção, que exige confirmação explícita, audita e **não** imprime segredos (mesmo padrão do `reset-senha.js` após #49).
6. **Sessões:** ativar/desativar 2FA ou usar código de recuperação revoga as outras sessões (mesma política da troca de senha).
7. **Testes mínimos:** vetores RFC 6238, janela/reuso, sessão parcial sem acesso, limite de tentativas, ativação exige código, recuperação consome o código, nenhuma saída contém segredo.

### Decisões que dependem do responsável

1. Aceita TOTP obrigatório só para `admin` agora? (recomendado) Quantos admins existirão (a regra de dois admins exige pelo menos 2)?
2. Quem executa o *break-glass* e como isso é registrado?
3. Onde ficará `TOTP_ENC_KEY` e como será feito o backup dessa chave (sem ela, os segredos TOTP ficam irrecuperáveis; ver `backup-restore.md`)?
4. Há necessidade de contas individuais por funcionário (#48)? O 2FA por conta pressupõe que `admin` deixe de ser um login genérico.

Estimativa: ~1 migration (colunas TOTP + códigos de recuperação), 2 rotas, 1 tela de ativação e 1 etapa no login, mais os testes acima.
