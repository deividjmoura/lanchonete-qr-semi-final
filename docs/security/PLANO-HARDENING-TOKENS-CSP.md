# Plano de hardening de tokens de mesa, PWA e CSP

## Objetivo

Tratar em conjunto AUD-002, AUD-003, REV-002 e os riscos combinados descritos na revisão independente. O objetivo é reduzir o impacto de vazamento de token e de XSS sem quebrar o fluxo QR, a PWA do garçom ou o funcionamento offline.

## Evidências que precisam continuar explícitas

A revisão independente registrou:
- token do garçom persistido em `localStorage` no PWA;
- tokens de mesa persistidos na tabela `mesas`, sem rotação operacional documentada;
- CSP com `script-src 'self' 'unsafe-inline'`;
- a combinação entre execução de script no contexto da aplicação e token bearer acessível pelo JavaScript aumenta o impacto de XSS.

Esses pontos devem ser revalidados no SHA da implementação antes de qualquer alteração.

## Trilha A — inventário de exposição

- [ ] Mapear todos os locais que leem, gravam, transmitem ou exibem tokens de mesa e garçom.
- [ ] Identificar se tokens aparecem em URL, query string, logs, mensagens de erro, analytics ou cabeçalhos Referer.
- [ ] Auditar o sanitizador de logs em cada caminho que recebe token.
- [ ] Mapear persistência offline da PWA e requisitos reais de retomada de sessão.
- [ ] Documentar a diferença entre token de mesa impresso e token de garçom revogável.

## Trilha B — rotação operacional de token de mesa

- [ ] Definir ação administrativa explícita para rotacionar token de uma mesa.
- [ ] Executar a rotação em transação e registrar auditoria sem armazenar o token anterior em claro.
- [ ] Invalidar imediatamente o QR antigo e fornecer novo QR para impressão.
- [ ] Exigir confirmação clara da consequência operacional antes de rotacionar.
- [ ] Definir procedimento de incidente para rotação individual e em lote.
- [ ] Testar que token antigo retorna resposta não autorizada e o novo token mantém o fluxo legítimo.
- [ ] Não impor rotação periódica automática sem processo de reimpressão dos QRs físicos.

## Trilha C — CSP sem unsafe-inline

- [ ] Inventariar scripts inline, handlers inline, estilos inline e páginas HTML estáticas.
- [ ] Identificar quais páginas são geradas pelo servidor e quais são arquivos estáticos.
- [ ] Escolher migração por nonce ou hashes para scripts, conforme a arquitetura de cada página.
- [ ] Não remover `unsafe-inline` em produção antes de cobrir todas as páginas e recursos legítimos.
- [ ] Começar com Content-Security-Policy-Report-Only e coletar violações sem dados sensíveis.
- [ ] Remover `unsafe-inline` de `script-src` após os testes e validação de relatórios.
- [ ] Manter estilos inline separados da decisão sobre scripts; não ampliar permissões por conveniência.
- [ ] Adicionar testes que confirmem a política final e os recursos necessários.

## Trilha D — mitigação de XSS e armazenamento

- [ ] Revisar sinks de HTML e renderização de conteúdo não confiável.
- [ ] Preferir APIs seguras de DOM e sanitização contextual quando HTML for requisito.
- [ ] Avaliar alternativa a `localStorage` para tokens de garçom, considerando PWA offline e modelo de ameaça.
- [ ] Se o armazenamento atual for mantido temporariamente, documentar o risco residual e reforçar CSP, escaping e expiração/revogação.
- [ ] Não migrar token para cookie sem revisar CSRF, escopo, SameSite, Secure, HttpOnly e compatibilidade offline.

## Critérios de aceite

- [ ] Token antigo deixa de funcionar após rotação.
- [ ] Nenhum token completo aparece em logs ou mensagens de erro.
- [ ] CSP de produção não depende de `unsafe-inline` em `script-src`.
- [ ] PWA de garçom continua operando nos cenários online/offline suportados.
- [ ] Testes automatizados cobrem rotação, revogação, CSP e fluxos QR/PWA.
- [ ] Revisão independente confirma que as mudanças não criaram bypass de CSRF nem regressão de autenticação.

## Separação de escopo

Esta PR registra o plano e não altera tokens, autenticação, CSP, armazenamento da PWA ou comportamento de produção. As mudanças de runtime devem ser implementadas em PRs pequenas e testáveis, após o inventário.


## Inventário estático inicial — SHA `7f18dca7207d27f34d5187e22013c5c74fb10550` (2026-11-03)

Esta seção registra evidências verificadas no código de `main`. É um retrato estático, não substitui testes dinâmicos nem prova ausência de outros caminhos.

### Token do garçom e persistência

- `public/garcom-pwa/app.js` lê o token primeiro de `location.search` (`?token=`) e, como fallback, de `localStorage['waiter-token']`.
- Quando recebe token pela URL, grava o valor em `localStorage['waiter-token']`. A credencial bearer, portanto, permanece acessível a qualquer JavaScript executado na mesma origem e sobrevive ao fechamento da aba.
- O mesmo arquivo usa o token para compor chaves de estado local, como alertas de pedidos prontos e pagamentos pendentes. Isso confirma que a persistência atual está ligada à retomada de operações offline, não é apenas uma preferência visual.
- Os testes E2E existentes abrem a PWA com `/garcom-pwa/?token=...` (`tests/e2e/garcom-offline.e2e.cjs` e `tests/e2e/garcom-lote-cobranca.e2e.cjs`). O formato por query string faz parte do fluxo testado atualmente.
- Não foi identificada, nesta leitura, uma limpeza da query string após a captura do token. Isso deve ser confirmado em teste de navegador antes de classificar como vazamento explorável. A query pode permanecer no histórico/cópia da URL e merece mitigação própria.
- Não migrar diretamente para cookie HttpOnly: a PWA precisa autenticar chamadas e retomar sincronização offline. Qualquer mudança exige desenho explícito para o fluxo offline e revogação.

### Tokens em logs

- `db/log-sanitizer.js` remove query strings ao retornar apenas `url.pathname` e mascara segmentos de token em rotas `/api/garcom/:token`, `/api/mesas/:token`, `/garcom/:token` e `/mesa/:token`.
- O sanitizador de detalhes também mascara UUIDs que apareçam em mensagens ou stacks.
- `server.js` usa `sanitizarAlvoRequisicao(req.url)` e `sanitizarDetalheErro(e)` no log de erro. A leitura estática não encontrou motivo para registrar o token completo nesse caminho.
- Falta teste dedicado para tokens enviados na query string da PWA e para caminhos de log em cada rota que recebe token. A garantia atual deve ser descrita como cobertura do sanitizador, não como prova universal de que nenhum log/telemetria externa recebe credenciais.

### CSP e HTML da PWA

- `server.js`, em `applySecurityHeaders()`, define `script-src 'self' 'unsafe-inline'` e `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` como política padrão.
- O cabeçalho é aplicado por `send()`, portanto alcança também páginas HTML servidas pelo servidor, incluindo o shell `public/garcom-pwa/index.html`.
- `public/garcom-pwa/index.html` contém um bloco `<style id="critical-pwa-layout">` inline e carrega `theme-init.js` como script externo. O bloco de estilo explica uma dependência concreta de `style-src 'unsafe-inline'`; não justifica, por si só, `script-src 'unsafe-inline'`.
- A inspeção inicial do HTML da PWA não encontrou bloco `<script>` inline nem handlers HTML inline. Isso não basta para remover a permissão global: ainda é necessário inventariar as páginas legadas, HTML gerado, scripts injetados por bibliotecas e outros pontos de entrada.
- A política é montada centralmente no servidor. Uma migração deve começar em Report-Only e considerar a aplicação inteira, não apenas a PWA.

### XSS e sinks de HTML

- O PWA legado em JavaScript usa operações `.innerHTML` para montar estruturas de interface. Nos trechos inspecionados, os valores de dados são inseridos depois em elementos via `.textContent`; isso reduz risco nesses pontos, mas cada atribuição precisa de revisão contextual.
- O teste `scripts/teste-seguranca.js` procura `dangerouslySetInnerHTML`, `insertAdjacentHTML` e `.innerHTML` apenas em fontes `src/**/*.ts(x)`. Ele não cobre `public/garcom-pwa/app.js`, HTML legado nem outros arquivos JavaScript públicos.
- Portanto, o teste atual não sustenta a afirmação ampla de que todo o cliente está livre de injeção de HTML cru. Expandir o inventário e adicionar testes comportamentais de payloads nos sinks relevantes antes de usar isso como critério de aceite.

### Próximas verificações antes de qualquer mudança de runtime

1. Fazer busca completa e revisável de `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, atributos `on*` e estilos inline em `src/`, `public/` e HTML servido.
2. Verificar no navegador se `?token=` continua na barra de endereço/histórico após inicialização e se algum recurso externo recebe Referer com a query.
3. Mapear todas as chamadas de API que transportam token e validar que logs, métricas e relatórios não serializam URL completa.
4. Executar CSP Report-Only em ambiente de teste com cobertura SPA, páginas legadas e PWA, classificando violações por rota.
5. Separar a remoção de `script-src 'unsafe-inline'` da remoção de `style-src 'unsafe-inline'`; são dependências diferentes.


## Inventário ampliado de HTML e JavaScript público — SHA `7f18dca`

A varredura abaixo foi feita nos arquivos `public/**/*.html` e `public/**/*.js` presentes no tree desse SHA. Os achados são pontos de revisão, não uma declaração automática de vulnerabilidade: sinks HTML podem receber conteúdo constante ou previamente escapado, e cada fluxo precisa ser rastreado até a origem.

### CSP: dependências concretas encontradas

- A política global de `server.js` é aplicada por `send()` e atualmente autoriza `'unsafe-inline'` tanto em `script-src` quanto em `style-src`.
- Há handlers HTML inline em páginas legadas, por exemplo `public/admin.html`, `public/login.html` e `public/mesa.html`. Esses handlers são incompatíveis com uma política estrita de scripts sem nonce/hash e sem refatoração para `addEventListener`.
- Existem blocos `<script>` inline em páginas como `public/bar.html`, `public/cozinha.html`, `public/garcom.html`, `public/guia-sistema.html`, `public/login.html` e `public/pedido.html`. As páginas `bar.html`, `cozinha.html` e `garcom.html` compartilham lógica inline de interface/estado; `guia-sistema.html` contém script inline próprio.
- Blocos `<style>` inline aparecem em páginas legadas como `admin.html`, `bar.html`, `caixa.html`, `cozinha.html`, `garcom.html`, `guia-sistema.html`, `index.html`, `login.html` e `garcom-pwa/index.html`. Também há atributos `style=` no markup.
- A presença dessas construções explica por que remover `unsafe-inline` globalmente agora causaria regressões. A migração deve ser gradual: handlers para listeners, scripts inline para arquivos externos ou nonce/hash, e estilos inline para CSS externo ou hashes quando aplicável.
- `public/garcom-pwa/index.html` não apresentou bloco de script inline nem handlers HTML inline na inspeção anterior, mas contém CSS inline. A PWA não representa sozinha a superfície inteira da política.

### Sinks HTML encontrados para revisão contextual

A busca estática encontrou atribuições `.innerHTML` em:
- `public/admin.html`: renderização de indicadores, cartões e painéis.
- `public/bar.html`, `public/cozinha.html`, `public/garcom.html`: área de impressão de tickets.
- `public/caixa.html`: renderização de sessões.
- `public/pedido.html`: tela de acompanhamento de pedido.
- `public/js/admin-cardapio.js`: renderização do catálogo e preview de foto.
- `public/js/caixa-divisao.js`: interface de divisão de conta.
- `public/js/cookies.js`: banner de consentimento, com conteúdo constante.
- `public/js/mesa-app-a.js`, `public/js/mesa-app-b1.js`, `public/js/mesa-app-b2.js`: modais, carrinho e detalhes de pedidos.
- `public/js/safe-dom.js`: helper deliberado `props.html`, que encaminha conteúdo diretamente para `innerHTML`; seus chamadores precisam fornecer HTML confiável/escapado.
- `public/garcom-pwa/app.js`: também possui construção de HTML, apesar de vários campos dinâmicos serem posteriormente preenchidos com `textContent` ou nós criados via DOM.

Outros padrões encontrados:
- `public/js/admin-relatorio.js` usa `document.write()` para compor o relatório em uma janela nova.
- O mesmo arquivo compõe linhas HTML de relatório com dados vindos da API. Os nomes de produto/cliente e demais campos textuais precisam ser rastreados até escaping contextual antes de considerar esse caminho seguro.
- `public/js/admin-cardapio.js` usa `esc()` para vários campos textuais interpolados no HTML, mas também coloca URLs de foto em atributos HTML. Escaping de atributo não substitui validação de esquema/origem da URL; revisar a validação no servidor e no cliente.
- `public/js/mesa-app-a.js` e `mesa-app-b1.js` usam helper `esc()` para parte dos nomes/observações, mas também montam handlers inline em templates. O uso de escaping de texto não torna seguro interpolar dados arbitrários dentro de código JavaScript de atributos `onclick` ou `onchange`.
- `public/js/mesa-app-b1.js` interpola nome de ingrediente em chamada inline `toggleRem(...)`, escapando apóstrofo com substituição manual. Esse padrão é frágil; migrar para listeners e dados em propriedades/closures, não tentar ampliar uma sequência de escapes.
- `public/js/safe-dom.js` documenta corretamente que `props.html` deve receber conteúdo confiável ou já escapado, mas a API não impõe essa garantia tecnicamente.

### Token da PWA: risco de URL e Referer

- `public/garcom-pwa/app.js` captura `token` da query string e persiste em `localStorage`, mas a inspeção não encontrou chamada a `history.replaceState()` para limpar o parâmetro após captura.
- A política atual `strict-origin-when-cross-origin` permite que requisições same-origin enviem o Referer completo, que pode incluir path e query. Assim, recursos carregados pela própria origem após abrir `/garcom-pwa/?token=...` podem carregar o parâmetro no Referer. É necessário confirmar o comportamento real do navegador e a telemetria/logging do host antes de afirmar exposição observada.
- Para destinos cross-origin, a política envia apenas a origem, mas isso não elimina exposição em histórico, cópia/compartilhamento da URL, screenshots ou logs do servidor/proxy da requisição inicial.
- Mitigação candidata de baixo impacto: depois de validar/capturar o token, remover apenas o parâmetro sensível da barra/histórico com `history.replaceState`, preservando pathname e parâmetros não sensíveis. Antes disso, confirmar se algum fluxo depende de recarregar a URL original.
- Mitigação estrutural posterior: trocar o bootstrap por troca de código de uso único por sessão curta, sem manter bearer token duradouro na URL. Isso exige endpoint e desenho de compatibilidade offline; não deve ser improvisado nesta etapa.

### Cobertura de segurança automatizada

- `scripts/teste-seguranca.js` testa XSS armazenado em fluxos específicos, mas o teste estático em `scripts/teste-seguranca.js`/checagens auxiliares não varre de forma abrangente todos os arquivos `public/`. A checagem de `.innerHTML` identificada anteriormente está restrita a `src/**/*.ts(x)`.
- Recomenda-se ampliar a verificação estática para incluir `public/`, mas com lista de allowlist comentada e revisão manual por contexto. Um teste que simplesmente falha para qualquer `.innerHTML` também acusaria helpers e conteúdo constante legítimos, sem distinguir risco real.
- Adicionar testes de payloads armazenados/refletidos nos campos efetivamente renderizados (nome de produto, descrição, observação, cliente, ingrediente, nome de garçom e dados de relatório), confirmando que não há execução de script nem atributos/eventos injetados.

### Sequência de implementação sugerida

1. Criar inventário por arquivo e classificar cada sink por fonte do dado, contexto (texto, atributo, URL, JavaScript inline ou documento) e mitigação.
2. Corrigir primeiro as interpolações em contexto JavaScript de handlers inline, substituindo handlers gerados por listeners.
3. Migrar scripts inline estáticos para arquivos externos; deixar nonce/hash para conteúdo dinâmico que realmente precise permanecer inline.
4. Migrar CSS inline por página, mantendo `style-src` separado de `script-src`.
5. Adicionar teste de contrato que verifica CSP Report-Only em todas as páginas HTML, e executar cobertura E2E dos fluxos principais antes de mudar a política efetiva.
6. Tratar URL/localStorage do token da PWA em uma PR própria, com testes de navegação, reload, offline e logout/revogação.
7. Só remover `'unsafe-inline'` de `script-src` depois que a aplicação inteira passar pela matriz de páginas e recursos, não apenas o shell da PWA.

### Limites desta auditoria

- A varredura é estática e baseada no SHA indicado; não foi executado navegador, proxy de produção ou CSP Report-Only.
- A busca por padrões identifica candidatos, não prova exploração.
- Não foi alterado nenhum arquivo de runtime, token, autenticação, CSP, configuração de deploy ou armazenamento.
