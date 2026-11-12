# Atualização segura de versão em abas abertas (#301)

Como o QR Admin percebe um deploy novo e como o operador é convidado a
atualizar **sem perder trabalho**. Este documento é a referência para quem for
mexer no aviso, no `dist/` ou no deploy.

## 1. O que é a "versão publicada"

`GET /api/version` responde:

```json
{ "version": "804039c01dd71896", "pwa": "cfcaeed2b55e5c61", "versao": "3.2.0", "app": "qradmin" }
```

com `Cache-Control: no-store`. Nada além disso: não há SHA de commit, horário
de deploy, autor, contagem de arquivos ou dado de sessão.

Existem **duas superfícies** no navegador, e cada uma tem o seu identificador:

| Campo | Superfície | O que entra no hash | Quem compara |
| --- | --- | --- | --- |
| `version` | SPA React: painel, login, cardápio do cliente | `src/**/*.{ts,tsx,css}` + `index.html` + `public/novidades.json` | `AvisoAtualizacao` (bundle do painel) |
| `pwa` | aplicativo do garçom (`/garcom-pwa/`) | tudo em `public/garcom-pwa/`, menos os manifests gerados, + `public/novidades.json` | `public/garcom-pwa/atualizacao.js` |
| `versao` | versão legível (`package.json`) | texto, não hash | notas de versão, suporte |

Cada cliente compara **só** a superfície que executa. Se as duas dividissem um
hash só, o garçom levaria aviso de deploy que não mudou a tela dele (e o
inverso). Fórmula única em `lib/build-version.js`:

| Quem usa | Como obtém |
| --- | --- |
| Build (`vite.config.ts`) | `calcularVersaoDoShell`/`calcularVersaoDoPwa` → `__BUILD_VERSION__`, `__APP_VERSION__` e `dist/build-version.json` |
| Script `scripts/gerar-versoes.cjs` | mesmas funções → `public/garcom-pwa/versao.json` (+ cópia em `dist/`) |
| Servidor (`server.js`) | lê `dist/build-version.json` (mesma árvore que o deploy serve) |
| Navegador (painel) | compara `__BUILD_VERSION__` com `version` |
| Navegador (garçom) | compara `versao.json` do shell (que o **service worker serve do cache**) com `pwa` |

Os manifests gerados (`public/garcom-pwa/versao.json` e
`public/garcom-pwa/novidades.json`) ficam **fora** do hash: são saída do cálculo,
não entrada. A fonte `public/novidades.json` entra nos dois hashes porque uma
mudança nas notas precisa gerar aviso nas duas superfícies. Sem excluir as
cópias geradas, o hash mudaria ao gravar a si próprio (referência circular).

Por que hash de conteúdo e não `RAILWAY_GIT_COMMIT_SHA`/`Date.now()`:

- o identificador é calculado a partir do conteúdo real do shell, sem depender
  de SHA do commit, relógio ou ambiente. O build de produção gera o `dist/` e
  grava nele o mesmo manifesto que o servidor publica;
- deploy que muda **só servidor/migrations/db** não tem arquivo novo para o
  navegador buscar → não avisa. O aviso significa "existe JS novo";
- qualquer mudança em `src/`, `index.html`, `public/novidades.json` ou nos
  arquivos do `public/garcom-pwa/` muda o valor da superfície correspondente.

> **Regressão corrigida em 11/2026.** Até então o hash cobria apenas `src/` +
> `index.html`, e o PWA do garçom não consultava `/api/version`. Resultado: um
> deploy que mexia **só** em `public/` (todo o aplicativo do garçom, cardápio
> público, páginas institucionais) mantinha `version` idêntica e ninguém era
> avisado — nem o painel, nem o salão. Hoje `pwa` cobre a segunda superfície e
> o garçom tem o próprio aviso. `tests/novidades-versao.test.cjs` trava os dois
> lados (o hash de cada superfície e a existência dos avisos).

Corolário operacional: **depois de `NODE_ENV=production npm run build`, commit
o `dist/` e o `public/garcom-pwa/`.** O build roda `scripts/gerar-versoes.cjs`,
que grava `versao.json`, copia `novidades.json` e sincroniza `dist/garcom-pwa/`.
`tests/build-version.test.cjs` falha se o manifesto commitado não corresponder à
árvore, e `npm run versoes:check` falha se os manifests do PWA estiverem velhos.

## 2. Detecção no cliente

`src/lib/atualizacao.ts` (testável em Node) + `src/components/AvisoAtualizacao.tsx`
(camada visual, montada nas rotas de equipe: `cozinha`, `bar`, `garcom`,
`caixa`, `admin`, `novidades`).

No aplicativo do garçom a lógica equivalente vive em
`public/garcom-pwa/atualizacao.js`, ligada em `app.js`. A versão legível
(`VERSAO_PWA_EM_EXECUCAO`) fica embutida no JavaScript em execução e é validada
contra `package.json`; o cliente compara esse valor com `versao` em
`/api/version`. Isso detecta a próxima versão mesmo quando o service worker não
precisaria trocar de cache. O evento `controllerchange` também abre o aviso para
clientes que já estavam com o aplicativo aberto durante a atualização inicial desta correção.

- primeira consulta ao montar, depois a cada **60 s**;
- nova consulta ao voltar à aba (`visibilitychange`/`focus`);
- aba oculta **não** consulta (economia e menos ruído);
- falha de rede, HTTP 503, JSON inválido ou ausência de `version` → silêncio
  absoluto: sem aviso, sem erro, sem bloquear a tela. `navigator.onLine` não é
  usado como prova de conectividade;
- comparação é `versão publicada !== versão do bundle em execução`, então uma
  aba aberta antes do deploy detecta a mudança na consulta seguinte.

## 3. Aviso e escolha do operador

Aviso discreto no topo, `role="status"`, com **Atualizar agora** e
**Continuar por enquanto** (e um X que faz o mesmo que continuar). No painel, o
aviso lista as notas de versão publicadas depois da versão aberta e leva a
`#/novidades` ("O que mudou"); o garçom mostra a mesma lista em um `<details>`
dentro do aviso.

### Changelog (`public/novidades.json`)

Fonte única das novidades. O painel busca `/novidades.json` com `no-store` (o
JSON embutido no bundle é apenas fallback); o PWA busca a cópia sincronizada em
`/garcom-pwa/novidades.json`. Assim, uma aba antiga consegue mostrar as notas
publicadas depois que foi aberta. Regras:

- só entra o que o operador percebe na tela; refatoração, dependência e
  infraestrutura ficam de fora;
- `versao` é a versão legível de `package.json` — **não** o hash. O PWA também
  mantém essa versão no `app.js`; o gerador valida que ela bate com o pacote;
- a entrada mais nova fica no topo e precisa bater com a versão do pacote;
  `npm run versoes:check` (e o teste) reprovam quando divergem;
- texto público, igual em toda instalação: sem dado de cliente, pedido ou
  instalação.

Uma nota esquecida deixa a lista de novidades vazia; nunca impede o aviso de
aparecer — o aviso é sobre o deploy, o changelog é sobre o conteúdo.

- **Nunca recarrega sozinho.** Não existe timeout, contagem regressiva nem
  "adiar por 5 minutos" — o adiamento vale até o operador decidir;
- adiar é propagado às outras abas (`BroadcastChannel qr-admin-atualizacao`) e
  guardado em `localStorage` (`qradmin:atualizacao-adiada`) **apenas com o
  identificador da versão adiada**: recarregar a aba não faz o aviso voltar.
  Um deploy posterior (versão nova) volta a avisar, porque é outra versão;
- sem `BroadcastChannel` ou com storage bloqueado, cada aba continua
  verificando e o adiamento vale só nela. O comportamento degrada, não quebra.

## 4. Proteção contra perda de trabalho

Antes de recarregar, `src/lib/trabalhoPendente.ts` monta um retrato do que
existe em andamento:

1. **formulário alterado** — `input`/`textarea`/`select` visíveis cujo valor
   difere do inicial (`defaultValue`, `defaultChecked`, opção `defaultSelected`);
2. **operação assíncrona em voo** — contador global alimentado por `apiSend`
   (`src/lib/operacoes.ts`): todo `POST/PATCH/PUT/DELETE` do SPA conta do envio
   até a resposta (inclusive no erro, via `finally`). É o caso do pedido já
   enviado, do fechamento de conta e do pagamento em processamento — nenhum
   deles tem campo sujo, e todos perdem o retorno da operação se a página
   recarregar no meio;
3. **tela ocupada** — `[aria-busy="true"]`, `[data-operation-pending="true"]`,
   `form[data-submitting="true"]`.

Se algo estiver pendente, o modal de confirmação lista o que foi detectado e
marca a ação como perigosa; enquanto o aviso estiver na tela, `beforeunload`
pede confirmação para F5/fechar a aba. Cancelar no modal equivale a adiar.

Limites conscientes (não são bugs):

- a fila offline do **PWA do garçom** tem ciclo próprio (IndexedDB + service
  worker) e não passa por `apiSend`; ela não é tocada por este componente;
- é proteção de interface, não garantia transacional: uma transação já
  concluída no servidor não é desfeita por recarregar, e uma requisição que o
  navegador abortar no reload segue o retry/idempotência da rota.

## 5. Cache, service worker e "ficar preso na versão antiga"

- `/index.html`, `/` e `/build-version.json`: `no-store`
  (`cacheControlForArquivoDoShell`). Shell cacheado em CDN/proxy faria a aba
  nova carregar bundle velho — o sintoma clássico de "atualizei e não mudou";
- `/assets/<nome>-<hash>.js|css`: `public, max-age=31536000, immutable`
  (o nome muda a cada build, então não há risco de servir JS velho e a
  performance não regride);
- o **service worker do PWA do garçom** (`public/garcom-pwa/sw.js`) usa
  `garcom-pwa-shell-v47`, escopo `/garcom-pwa/`, network-first e `/api/`
  descartado antes de qualquer `cache.put`. O precache inclui `versao.json` e
  `novidades.json`; o cache anterior é substituído sem tocar no IndexedDB;
- o shell do Admin **não** registra service worker;
- a atualização **não limpa** IndexedDB, `localStorage`, fila offline,
  rascunhos ou credenciais. O único uso de `localStorage` é a marca de
  adiamento acima. Recarregar preserva a sessão (cookie `HttpOnly`) e a rota
  (`#/cozinha`, `#/caixa`, …).

## 6. Como validar

```bash
NODE_ENV=production npm run build          # regerar dist/ + build-version.json
npm run typecheck
npm test                                   # inclui build-version, atualizacao-*
DATABASE_URL=... npm run test:pg           # postgres-version-endpoint (HTTP real)
DATABASE_URL=... npm run test:e2e          # tests/e2e/atualizacao-versao.e2e.cjs
```

O E2E abre o build de produção em Chromium e percorre: endpoint 503, rede
fora, mesma versão, deploy com a aba aberta, adiar (inclusive sobrevivendo a
reload), confirmar atualização (modal → reload mantendo a rota) e duas abas.

Ao testar em produção: publicar o deploy **não** significa que todos os
clientes já atualizaram. Cada aba troca de versão só quando o operador aceitar.
Para conferir o que está publicado, use `GET /api/version`; para conferir o que
uma aba está rodando, o valor embutido no bundle do `dist/index.html`.
