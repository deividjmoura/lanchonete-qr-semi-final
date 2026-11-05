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

Com uma sessão autenticada como admin, abra **Admin → Funções → Google**. A tela lista as contas ativas; informe o e-mail Google verificado de cada funcionário e salve. A API `GET /api/admin/contas` retorna `email` e `googleVinculado`, e a rota `PUT /api/admin/contas/email` valida o cadastro no servidor. E-mails são únicos sem distinção entre maiúsculas/minúsculas. Uma conta Google já vinculada não pode ser transferida por esta rota.

Se o e-mail pré-cadastrado estiver incorreto, o administrador pode usar **Remover e-mail** na mesma tela. A operação limpa somente `staff.email` de uma conta ativa cujo `google_sub` ainda seja nulo e registra o evento `email_google_removido` na trilha de auditoria, na mesma transação. Ela não desativa o funcionário, não altera senha/sessões e não desvincula identidades Google já associadas. Para autorizar outro endereço, cadastre o novo e-mail e aguarde o primeiro login verificado.

## Ciclo de vida do e-mail pré-cadastrado

`staff.email` é uma **pré-autorização**, não a identidade: ele indica qual endereço Google pode reivindicar aquela conta no primeiro login. Depois do primeiro login, quem autoriza é `staff.google_sub`, e o e-mail deixa de ser o critério.

| Estado | `email` | `google_sub` | O que o administrador pode fazer |
|---|---|---|---|
| Sem acesso Google | `NULL` | `NULL` | Cadastrar um e-mail (`PUT /api/admin/contas/email`) |
| Aguardando o primeiro login | preenchido | `NULL` | Trocar o e-mail (`PUT`) ou remover (`DELETE /api/admin/contas/:id/email`) |
| Já vinculada | preenchido | preenchido | Nada nesta tela: nem trocar, nem remover |

### Remoção do e-mail (`DELETE /api/admin/contas/:id/email`)

O botão aparece somente para conta ativa com e-mail e sem vínculo Google. Antes de enviar, a tela pede confirmação identificando funcionário e o efeito da ação; o estado só muda depois da resposta do servidor.

Garantias da rota:

- `exigirAcesso(req, 'admin')` revalida sessão, papel admin, origem permitida e token CSRF;
- o `id` vem do caminho da URL e é validado antes da escrita; `0` ou valores fora do formato retornam erro de cliente;
- `google_sub IS NULL` é condição **da própria escrita** (`UPDATE staff SET email = NULL WHERE id = $1 AND ativo = TRUE AND google_sub IS NULL AND email IS NOT NULL`), sob `FOR UPDATE` na mesma transação — o servidor não confia no estado enviado pela UI;
- apenas `email` é alterado: senha, papel, estado ativo e sessões permanecem iguais;
- sucesso grava `email_google_removido`; recusas decididas dentro da operação gravam `email_google_remocao_negada` com `resultado = 'negado'`, o motivo (`ator_sem_permissao`, `conta_inexistente`, `conta_inativa`, `conta_vinculada_google`, `conta_sem_email`, `concorrencia`) e o status devolvido, sempre com ator, alvo e `request_id` e **sem** endereço de e-mail ou segredo no contexto (#48);
- requisições barradas antes da operação (sem sessão, CSRF ou origem inválidos, papel não-admin) não alcançam o cadastro e, por isso, não geram evento: são recusadas no gate de acesso;
- respostas previstas: `401` sem sessão, `403` sem papel admin ou CSRF/origem inválidos, `400` id inválido, `404` conta inexistente, `409` conta inativa, já vinculada, sem e-mail cadastrado ou alteração concorrente.

### Desvincular uma conta Google (fora do escopo)

Limpar `google_sub` não é feito por esta ação. Uma conta já vinculada tem identidade Google imutável; desvincular exige um fluxo separado, deliberado, autenticado e auditado, com análise de impacto no login e na recuperação de acesso. Enquanto esse fluxo não existir, a orientação é ajustar a conta correta pela administração em vez de reaproveitar a vinculada.

### Pendente de decisão do responsável

- prazo de retenção dos eventos de auditoria e quem pode consultá-los (issue #48);
- política de ciclo de vida de e-mails de funcionários: prazo para remover um endereço que nunca fez login, quem aprova a remoção e como registrar o pedido do próprio funcionário (issue #44);
- procedimento de suporte para desvincular uma conta Google, se isso for necessário.

Nada disso está automatizado no código: não existe expiração, tarefa periódica nem remoção automática de e-mail.

No primeiro login, o Google fornece o e-mail verificado e o identificador imutável `sub`. O servidor vincula o `sub` à conta staff correspondente. Contas inativas, e-mails não verificados, e-mails não cadastrados ou identidades já vinculadas a outro funcionário são recusados.

## Google OAuth consent screen

Enquanto o app permanecer em **Testing**, inclua os endereços Google da equipe em **Test users**. Não publique o app nem solicite verificação como parte desta entrega.

## Fluxo implementado

- `GET /api/auth/google/status`: informa se o fluxo está configurado, sem revelar segredos.
- `GET /api/auth/google`: inicia Authorization Code + PKCE S256.
- `GET /api/auth/google/callback`: valida state assinado em cookie HttpOnly, troca o código e consulta o UserInfo do Google.
- A sessão final usa o mecanismo existente `lqr_session`; permissões e política de troca obrigatória de senha continuam valendo.
