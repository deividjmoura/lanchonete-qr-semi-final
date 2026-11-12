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
| `version` | SPA React: painel, login, cardápio do cliente | `src/**/*.{ts,tsx,css}` + `index.html` | `AvisoAtualizacao` (bundle do painel) |
| `pwa` | aplicativo do garçom (`/garcom-pwa/`) | tudo em `public/garcom-pwa/`, menos os manifests gerados | `public/garcom-pwa/atualizacao.js` |
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

Os manifests gerados (`public/garcom-pwa/versao.json` e `novidades.json`) ficam
**fora** do hash: são saída do cálculo, não entrada. Sem essa exclusão o hash
mudaria ao gravar a si próprio (referência circular).

Por que hash de conteúdo e não `RAILWAY_GIT_COMMIT_SHA`/`Date.now()`:

- **o `dist/` é versionado e servido como está** — o deploy não recompila o
  front. Um identificador que dependa do ambiente (SHA do commit, relógio,
  `process.pid`) divergiria do bundle commitado, e o aviso apareceria para
  sempre (ou nunca). Hash de conteúdo é reproduzível em qualquer máquina;
- deploy que muda **só servidor/migrations/db** não tem arquivo novo para o
  navegador buscar → não avisa. O aviso significa "existe JS novo";
- qualquer mudança em `src/`, `index.html` ou `public/garcom-pwa/` muda o valor
  daquela superfície.

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
`public/garcom-pwa/atualizacao.js`, ligada em `app.js`. Ele usa as mesmas regras
abaixo, com duas diferenças de mecânica:

- a versão local vem de `versao.json` **servido pelo service worker** (cache),
  não da rede: se viesse da rede, o arquivo seria regravado a cada deploy e o
  valor "local" viraria o publicado, escondendo o aviso;
- o evento `controllerchange` (service worker novo assumiu o controle) também
  abre o aviso, porque nesse instante a página ainda executa o JavaScript antigo
  mesmo com `versao.json` já atualizado no cache. Depois da primeira recarga, o
  aparelho adota a versão nova como referência.

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

Fonte única das novidades, lida pelo painel (`src/lib/notasVersao.ts`, via
bundler) e copiada para o PWA por `scripts/gerar-versoes.cjs`. Regras:

- só entra o que o operador percebe na tela; refatoração, dependência e
  infraestrutura ficam de fora;
- `versao` é a versão legível de `package.json` — **não** o hash (o hash muda a
  cada arquivo salvo e não ordena nada, além de não poder citar a si mesmo);
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
- o **service worker do PWA do garçom** (`public/garcom-pwa/sw.js`) continua
  exatamente como estava: `garcom-pwa-shell-v43`, escopo `/garcom-pwa/`,
  network-first e `/api/` descartado antes de qualquer `cache.put`. A versão do
  cache **não** foi alterada nesta issue: revisar precache é outro trabalho e
  exige testar clientes já instalados;
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
