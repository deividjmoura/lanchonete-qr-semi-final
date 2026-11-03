# Configuração do login Google do QRAdmin

## Callback OAuth

Depois que esta implementação estiver integrada e implantada, cadastre no cliente OAuth do tipo **Aplicativo da Web**:

- **URI de redirecionamento autorizado:** `https://qradminn.up.railway.app/api/auth/google/callback`
- **Origens JavaScript autorizadas:** não são necessárias para este fluxo server-side.

Não use o callback antes do deploy do código que o atende.

## Variáveis de ambiente

Configurar no serviço backend, por canal seguro e coordenado com a Frente 1:

| Variável | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID do cliente OAuth criado no Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Client Secret do JSON baixado do Google Cloud |
| `GOOGLE_REDIRECT_URI` | `https://qradminn.up.railway.app/api/auth/google/callback` |
| `GOOGLE_OAUTH_STATE_SECRET` | Segredo aleatório próprio, com pelo menos 32 bytes; opcional, pois o Client Secret é usado como fallback |

Nunca commitar o JSON de credenciais, Client Secret ou qualquer segredo em arquivos do repositório.

## Preparação das contas de equipe

O login Google **não cria funcionários**. Cada conta precisa ser ativa e ter um e-mail previamente cadastrado pelo administrador. A migration `0034_staff_google_oauth.sql` adiciona `staff.email` e `staff.google_sub`.

Com uma sessão autenticada como admin, abra **Funções → Senhas → Acesso com Google**. A tela lista as contas ativas; informe o e-mail Google verificado de cada funcionário e salve. A API `GET /api/admin/contas` retorna `email` e `googleVinculado`, e a rota `PUT /api/admin/contas/email` valida o cadastro no servidor. E-mails são únicos sem distinção entre maiúsculas/minúsculas. Uma conta Google já vinculada não pode ser transferida por esta rota.

No primeiro login, o Google fornece o e-mail verificado e o identificador imutável `sub`. O servidor vincula o `sub` à conta staff correspondente. Contas inativas, e-mails não verificados, e-mails não cadastrados ou identidades já vinculadas a outro funcionário são recusados.

## Google OAuth consent screen

Enquanto o app permanecer em **Testing**, inclua os endereços Google da equipe em **Test users**. Não publique o app nem solicite verificação como parte desta entrega.

## Fluxo implementado

- `GET /api/auth/google/status`: informa se o fluxo está configurado, sem revelar segredos.
- `GET /api/auth/google`: inicia Authorization Code + PKCE S256.
- `GET /api/auth/google/callback`: valida state assinado em cookie HttpOnly, troca o código e consulta o UserInfo do Google.
- A sessão final usa o mecanismo existente `lqr_session`; permissões e política de troca obrigatória de senha continuam valendo.
