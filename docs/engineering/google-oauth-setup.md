# Configuração do login Google do QRAdmin

## Callback OAuth

Depois que esta implementação estiver integrada e implantada, cadastre no cliente OAuth do tipo **Aplicativo da Web**:

- **URI de redirecionamento autorizado:** `https://qradminn.up.railway.app/api/auth/google/callback`
- **Origens JavaScript autorizadas:** não são necessárias para este fluxo server-side.

Não use o callback antes do deploy do código que o atende.

## Variáveis de ambiente

Configurar no serviço backend do Railway, por canal seguro:

| Variável | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID do cliente OAuth criado no Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Client Secret do JSON baixado do Google Cloud |
| `GOOGLE_REDIRECT_URI` | `https://qradminn.up.railway.app/api/auth/google/callback` |
| `GOOGLE_OAUTH_STATE_SECRET` | Segredo aleatório próprio, com pelo menos 32 bytes; opcional, pois o Client Secret é usado como fallback |

Nunca commitar o JSON de credenciais, Client Secret ou qualquer segredo em arquivos do repositório.

## Preparação das contas de equipe

O login Google **não cria funcionários**. Cada conta precisa ser ativa e ter um e-mail previamente cadastrado pelo administrador. A migration `0034_staff_google_oauth.sql` adiciona `staff.email` e `staff.google_sub`.

Com uma sessão autenticada como admin, abra **Admin → Funções → Logins**. A tela lista as contas ativas; informe o e-mail Google verificado de cada funcionário e salve. A API `GET /api/admin/contas` retorna `email` e `googleVinculado`, e a rota `PUT /api/admin/contas/email` valida o cadastro no servidor. E-mails são únicos sem distinção entre maiúsculas/minúsculas. Ao alterar o endereço de uma conta já vinculada, o vínculo Google anterior é removido e as sessões existentes são revogadas.

O campo de e-mail permanece editável mesmo depois do primeiro vínculo. Ao salvar um endereço diferente, o sistema limpa o `google_sub` anterior e revoga as sessões da conta, exigindo novo login com o endereço atualizado. **Remover e-mail** limpa `staff.email` e `staff.google_sub` e também revoga as sessões, mas mantém a conta interna ativa para login com usuário e senha. As duas operações registram auditoria na mesma transação; a remoção usa `email_google_removido` e a troca usa `email_google_atualizado`.

## Ciclo de vida do e-mail pré-cadastrado

`staff.email` é uma **pré-autorização**, não a identidade: ele indica qual endereço Google pode reivindicar aquela conta no primeiro login. Depois do primeiro login, quem autoriza é `staff.google_sub`, e o e-mail deixa de ser o critério.

| Estado | `email` | `google_sub` | O que o administrador pode fazer |
|---|---|---|---|
| Sem acesso Google | `NULL` | `NULL` | Cadastrar um e-mail (`PUT /api/admin/contas/email`) |
| Aguardando o primeiro login | preenchido | `NULL` | Trocar o e-mail (`PUT`) ou remover (`DELETE /api/admin/contas/:id/email`) |
| Já vinculada | preenchido | preenchido | Trocar o e-mail (desvincula a identidade anterior) ou remover e-mail (desvincula e limpa os dois campos) |

### Remoção do e-mail (`DELETE /api/admin/contas/:id/email`)

O botão aparece quando a conta ativa tem e-mail ou identidade Google vinculada. A tela pede confirmação antes de enviar.

Garantias da rota:

- `exigirAcesso(req, 'admin')` revalida sessão, papel admin, origem permitida e token CSRF;
- o `id` vem do caminho da URL e é validado antes da escrita;
- sob `FOR UPDATE`, a mesma transação limpa `staff.email` e `staff.google_sub`;
- quando havia identidade Google, as sessões da conta são revogadas; a conta interna permanece ativa e pode continuar usando usuário e senha;
- sucesso grava `email_google_removido`; recusas decididas dentro da operação gravam `email_google_remocao_negada` com `resultado = 'negado'`, motivo, ator, alvo e `request_id`, sem endereço de e-mail ou segredo no contexto;
- requisições barradas antes da operação (sem sessão, CSRF ou origem inválidos, papel não-admin) são recusadas no gate de acesso.

### Desvincular ou trocar o e-mail Google

O campo continua editável depois do primeiro vínculo. Ao salvar um endereço diferente, o servidor atualiza `staff.email`, limpa o `google_sub` anterior e revoga as sessões abertas para que a conta faça um novo login com o endereço atualizado. O endereço novo continua sujeito à regra de unicidade e à validação de formato.

### Pendente de decisão do responsável

- prazo de retenção dos eventos de auditoria e quem pode consultá-los (issue #48);
- política de ciclo de vida de e-mails de funcionários: prazo para remover um endereço que nunca fez login, quem aprova a remoção e como registrar o pedido do próprio funcionário (issue #44);
- quem, fora do administrador ativo, precisa aprovar a desvinculação de uma conta Google em caso de disputa (o produto já permite a ação; falta apenas a regra de processo).

Nada disso está automatizado no código: não existe expiração, tarefa periódica nem remoção automática de e-mail.

No primeiro login, o Google fornece o e-mail verificado e o identificador imutável `sub`. O servidor vincula o `sub` à conta staff correspondente. Contas inativas, e-mails não verificados, e-mails não cadastrados ou identidades já vinculadas a outro funcionário são recusados.

## Google OAuth consent screen

Enquanto o app permanecer em **Testing**, inclua os endereços Google da equipe em **Test users**. Não publique o app nem solicite verificação como parte desta entrega.

## Fluxo implementado

- `GET /api/auth/google/status`: informa se o fluxo está configurado, sem revelar segredos.
- `GET /api/auth/google`: inicia Authorization Code + PKCE S256.
- `GET /api/auth/google/callback`: valida state assinado em cookie HttpOnly, troca o código e consulta o UserInfo do Google.
- A sessão final usa o mecanismo existente `lqr_session`; permissões e política de troca obrigatória de senha continuam valendo.
