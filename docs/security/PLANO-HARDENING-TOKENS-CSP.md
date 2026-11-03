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
