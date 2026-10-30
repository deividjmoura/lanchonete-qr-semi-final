# Correção do "Token CSRF ausente ou inválido" em Cozinha/Bar

## 1. Sintoma relatado

Em produção (`qradminn.up.railway.app`), a Cozinha/Bar mostrava **"Token CSRF
ausente ou inválido"** ao avançar um item. O pedido voltava para **"Na fila"** e
só recarregar a página resolvia — até acontecer de novo.

## 2. Causa-raiz

Não era o token "expirando". Era **troca de sessão entre abas**:

1. `criarSessao()` emite um cookie `lqr_session` novo a cada login, com `Path=/`.
2. O cookie vale para o navegador inteiro. Um login em **qualquer** aba troca a
   sessão de **todas** as abas daquele navegador.
3. `src/lib/api.ts` guarda o token CSRF em memória (`let csrfToken`), derivado por
   HMAC do token de sessão. A aba antiga continua com o token da sessão anterior.
4. `verificarProtecaoCSRF()` compara o header com o HMAC do cookie **atual** e
   recusa com 403.

O cliente só buscava o token quando ele era `null`:

```ts
if (needsCsrf && !csrfToken) await apiGet("/api/me");
```

Um token **presente mas velho** nunca era renovado, e não havia tratamento de 403
em `src/`. Por isso o erro aparecia e a operação era perdida. O mesmo ocorria após
troca de senha, que revoga as sessões e cria uma nova.

## 3. O que mudou

### 3.1 Código de erro distinto (`db/auth.js`)

`CODIGO_CSRF_INVALIDO = 'CSRF_INVALIDO'` nos dois pontos que recusam o token. O
cliente precisa distinguir três situações que antes eram indistinguíveis:

| Situação | Resposta | Repetir resolve? |
| --- | --- | --- |
| Sessão não existe | 401 | não |
| Sem permissão para a área | 403 sem código | não |
| Troca de senha obrigatória | 403 `SENHA_TROCA_OBRIGATORIA` | não |
| **Token de sessão antiga** | **403 `CSRF_INVALIDO`** | **sim, com token novo** |

Sem esse código, um retry cego repetiria chamadas que nunca passariam.

### 3.2 Aviso entre abas (`BroadcastChannel`)

Login, troca de senha e logout avisam as outras abas, que descartam o token em
memória e o renovam no próximo envio. Isso evita o erro no caso comum. O aviso não
busca o token imediatamente, para não provocar uma rajada de `/api/me` em todas as
abas abertas.

### 3.3 Um único retry (a correção do caso de corrida)

O aviso não cobre aba suspensa pelo celular, página legado que entra por `fetch`
direto, nem a corrida em que o clique acontece antes de o aviso chegar. Então, ao
receber `403 CSRF_INVALIDO`, o cliente busca o token atual e **repete uma vez**.

**Por que repetir é seguro:** `exigirAcesso()` valida origem e CSRF **antes** de a
rota escrever qualquer coisa. A chamada recusada não alterou nada — não há
duplicação de pedido, pagamento ou mudança de status. Um teste guarda essa ordem.

O retry é limitado a uma tentativa, não se aplica a login/logout, e só ocorre
quando o token novo é de fato diferente do anterior. Sem isso, um servidor que
devolvesse sempre um token inválido produziria laço infinito.

### 3.4 Fim do `alert()` em Cozinha/Bar

O `alert()` nativo bloqueava a tela inteira e desaparecia sem registro. Agora a
falha vai para a faixa de erro da própria tela (`lastError`), e o `hydrate()` roda
também no erro, para o item mostrar o estado **real** do servidor em vez de manter
o estado otimista.

### 3.5 Identidade re-hidratada

Quando outra aba troca a sessão, o cabeçalho desta aba deixava de corresponder ao
papel real. Agora a identidade é re-hidratada; se a sessão acabou, a tela diz
"Sua sessão foi encerrada em outra aba. Entre novamente para continuar."

## 4. Decisão de escopo

A pergunta "a segunda aba deve derrubar a primeira ou compartilhar sessão?" ficou
sem resposta. **Optou-se por não mudar o modelo de sessão**: o cookie continua
compartilhado, como já era, e cada aba passa a acompanhar a sessão vigente. Assim:

- ninguém é desconectado por abrir outra aba;
- nenhuma regra de autenticação foi afrouxada;
- a correção fica no cliente, onde estava o defeito.

Se a decisão futura for isolar sessões por aba, isso exige outro desenho (cookie
por aba ou token em `sessionStorage`) e fica fora desta correção.

## 5. Evidência de validação

| Verificação | Resultado |
| --- | --- |
| `npm test` | **325/325** (antes: 314; +11 testes de CSRF) |
| `npm run typecheck` | limpo |
| `npm run build` | ok |
| `npm run test:pg -- --sem-backup` | **7/7 suítes** |
| `npm run test:e2e` | **4/4 cenários** (offline, lote/cobrança, CSRF entre abas, visual) |

### Prova de que os testes pegam o defeito

Teste que passa no código quebrado não vale. Os dois níveis foram executados
contra a versão **sem** a correção:

- **Unitário** (`tests/csrf-abas.test.cjs`, executa o `api.ts` real transpilado):
  **5 dos 11 testes falham** com o cliente antigo.
- **E2E em Chromium real** (`tests/e2e/cozinha-csrf-abas.e2e.cjs`): com o retry
  desativado, falha em **"o clique da aba antiga avançou o item no banco"** — o
  sintoma exato do operador. Com a correção, passa e registra
  "houve 403 e o cliente se recuperou sozinho".

O E2E usa duas páginas no **mesmo contexto** (mesmo cookie, como abas de verdade),
servidor Node real e PostgreSQL. A segunda aba entra por `fetch` direto, sem
`BroadcastChannel`, para exercitar o retry e não apenas o aviso.

### O que continua sendo recusado

- token forjado (`'0'.repeat(64)`) → 403;
- origem estranha → 403;
- sessão encerrada → não escreve nada;
- falta de permissão → 403, **sem** retry.

## 6. Limites

- Validado em Chromium local contra servidor e PostgreSQL reais. **Não** houve
  deploy nem teste em produção/Railway.
- O cenário de aba suspensa pelo sistema operacional foi reproduzido por login
  sem aviso entre abas, não por suspensão real de aparelho.
- `BroadcastChannel` não existe em navegadores antigos; nesse caso só o retry
  atua, e há teste para isso.

## 7. Publicação

Nenhuma migration. É cliente HTTP + código de erro no servidor:

1. `npm run build`
2. publicar

O PWA do garçom não foi tocado nesta rodada, então o cache do shell continua em
**v20**.

## 6. Efeito colateral encontrado no build (CSS)

Ao rebuildar, o CSS voltou a sair com o hash do PR #141, e a investigação mostrou
que **a causa era a documentação**: por padrão o Tailwind v4 varre o projeto
inteiro, incluindo `docs/` e `tests/`. O relatório anterior citava uma classe de
gradiente como exemplo de defeito, e esse texto passava a **gerar a classe no CSS
de produção**.

`src/index.css` agora limita as fontes ao código de aplicação:

```css
@import "tailwindcss" source(none);
@source "../index.html";
@source "./**/*.{ts,tsx}";
```

Conferência do efeito: 80 classes deixaram de ser emitidas, todas de exemplos em
documentação/testes ou utilitários nunca usados. As variantes realmente usadas
(`lg:border-r`, `hover:underline`, `backdrop-blur-*`) continuam presentes, e o E2E
visual seguiu passando nos **64 layouts** e nos dois temas. Escrever documentação
não muda mais o bundle.
