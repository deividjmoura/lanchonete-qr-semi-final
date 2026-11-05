# Ciclo de vida de contas de funcionário (staff)

**Escopo:** o que fazer quando alguém entra, muda de função ou sai da equipe.
**Aprovado por:** responsável pelo tratamento, em 05/11/2026.
**Relacionado:** `docs/engineering/admin-credentials-and-2fa.md`,
`docs/engineering/procedimento-titulares.md` e §1.1 de
`docs/engineering/data-policy-proposal.md`.

## 1. O que a conta guarda hoje

| Campo | Para que serve | Natureza |
|---|---|---|
| `staff.nome`, `staff.login`, `staff.papel` | identificar a pessoa e o que ela pode fazer | dado do funcionário |
| `staff.email` | endereço previamente autorizado a entrar com Google | dado do funcionário |
| `staff.google_sub` | vínculo com a conta Google já autenticada | identificador |
| `staff.senha_hash` | login por senha | credencial (hash) |
| `staff.ativo`, `deve_trocar_senha` | acesso liberado e troca obrigatória | controle |
| `staff_sessoes` | sessões abertas (cookie `lqr_session`, 12 h) | credencial |
| autoria em `pedidos`, `auditoria_eventos`, `staff_credencial_eventos` | rastrear quem fez o quê | registro operacional |

Autoria é **registro da operação**, não dado do cliente: fica pelos prazos de
auditoria (§3.1 da proposta) e não é apagada pela anonimização de histórico.

## 2. Entrada na equipe

1. Criar a conta individual com papel correto (`admin`, `cozinha`, `bar`,
   `caixa` ou `garcom`) — contas compartilhadas não são usadas desde a #45.
2. Definir senha inicial forte e manter `deve_trocar_senha = TRUE`.
3. Se a pessoa for usar Google, cadastrar o e-mail **antes** do primeiro login;
   o `google_sub` só aparece depois do login bem-sucedido.
4. Se for garçom, cadastrar em `garcons` e entregar o link individual da PWA.
5. Admin: exigir 2FA (TOTP) na primeira entrada em
   `Segurança da conta`.

## 3. Saída da equipe (desligamento)

Executar nesta ordem, no painel administrativo:

1. **Remover o e-mail Google** da conta (`Logins` → remover e-mail). Isso
   desfaz o `google_sub` e **revoga todas as sessões** daquela conta na mesma
   transação; o evento `email_google_removido` fica registrado sem o endereço.
2. **Redefinir a senha** para um valor aleatório que apenas o gestor guarda
   (`Logins` → redefinir senha). A redefinição **revoga todas as sessões** da
   conta, então ninguém continua logado com a senha antiga.
3. **Se for garçom, desativar o cadastro** (`garcons.ativo = false`) para sair
   da fila de atribuição e das transferências.
4. **Limpar o PWA do aparelho**: o token bearer do garçom vive no
   `localStorage` do navegador. Orientar "limpar dados do site" ou desinstalar
   o app; sem isso, a fila local pode continuar tentando sincronizar.
5. **Não alterar a autoria** dos pedidos e eventos já registrados.
6. **Registrar a saída** na planilha de protocolos internos (data, conta,
   ações executadas).

## 4. Pedido de eliminação feito pelo ex-funcionário

1. Confirmar identidade e vínculo com a conta (login, período trabalhado).
2. Responder o que existe: dados cadastrais, credenciais, autoria em pedidos e
   eventos de auditoria.
3. O que **pode** ser eliminado de imediato: `staff.email` e `google_sub`
   (passo 1 do desligamento) e o registro de `staff_sessoes`.
4. O que **não** é eliminado de imediato: autoria em pedidos, comprovantes e
   trilha de auditoria — conservados por obrigação de registro da operação,
   pelo prazo de 24 meses da trilha.
5. Depois desse prazo, a decisão sobre anonimizar o nome do funcionário nas
   trilhas precisa ser tomada caso a caso, com registro do motivo.

## 5. Situações que o sistema ainda não resolve sozinho

| Situação | Estado atual |
|---|---|
| Desativar/desligar uma conta `staff` (campo `ativo`) | existe na tabela, **não** existe endpoint nem botão no painel |
| Excluir definitivamente uma conta `staff` | não existe; a conta permanece com senha redefinida e sem vínculo Google |
| Bloqueio automático por inatividade | não existe |
| Expurgo programado de `staff_sessoes` | o código limpa registros expirados em ciclos de 30 minutos |
| Registro de "data de desligamento" por conta | não existe campo; fica na planilha interna |

Essas lacunas são de produto, não de documentação. Até existir um endpoint de
desativação, o procedimento do item 3 é o que bloqueia o acesso de fato.
