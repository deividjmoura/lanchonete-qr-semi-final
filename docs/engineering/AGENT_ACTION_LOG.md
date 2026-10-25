# Registro de ações dos agentes

Este documento registra ações e limites de validação por sessão. Acrescentar uma entrada em cada continuidade relevante, sem sobrescrever o histórico.

## 2026-10-24 — revisão inicial F01–F05

- Repositório: https://github.com/deividjmoura/lanchonete-qr-semi-final
- Branch: `audit/f01-f05-2026-10-24`
- PR: #71 (aberto, draft): https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/71
- Issue #70 para F01: https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/70
- F01 confirmado estaticamente em `public/garcom-pwa/app.js`.
- F02: `clientIp(req)` confia no primeiro item de `X-Forwarded-For` em produção; PR #65 é test-first e ainda não integra o resolver.
- F03: a regex do snapshot auditado usa `(\\d+)`; alegação de escape duplicado não confirmada. Teste existente é estático, não uma prova de HTTP end-to-end.
- F04: `send()` usa `no-store` por padrão; PR #69 já cobre cache de assets com hash e permanece aberto.
- F05: `spawnSync` de migrations está no callback de `server.listen` e bloqueia o event loop. `start:prod` também tenta migrar antes de carregar o servidor. PRs #57 e #58 se sobrepõem.
- Nenhuma mudança de runtime, banco, infraestrutura, segredo ou Railway; nenhum merge/deploy.

## 2026-10-24 — continuidade e validação do PR

- Estado do PR #71 conferido por GitHub: aberto, draft, sem merge; head `da5e8bdb9f754c128416b3eff6797e3879d89916`.
- CI remoto [run 40125749782](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40125749782): **SUCCESS**. Passaram `npm ci`, typecheck, build, integridade de `dist/`, `npm run test:regression` e sintaxe de servidor/banco/scripts.
- O CI não demonstra correção dos achados, pois esta branch só altera documentação. Clone local não foi possível por falha de resolução DNS para github.com; nenhum teste local foi alegado.
- Não foram executados requests HTTP, benchmark, migrations ou comandos contra produção. PRs #35, #36 e #37 preservados; nenhum PR fechado/merged.

## 2026-10-24 — implementação isolada F01 no PR #71

- Segui o protocolo de `AGENTS.md`: li as regras de colaboração e mantive a mudança em lote pequeno; por instrução explícita do usuário, não fiz push direto na `main` nem merge. A branch de trabalho continua `audit/f01-f05-2026-10-24`.
- F01: removido o envio do URL com token de mesa a `api.qrserver.com`; `public/garcom-pwa/app.js` agora gera SVG local usando a biblioteca MIT `qrcode-generator.js`.
- Adicionados `public/garcom-pwa/qrcode-generator.js` e `qrcode-generator.LICENSE`, com aviso de copyright/licença preservado.
- `public/garcom-pwa/index.html` agora renderiza o SVG local; `styles.css` dá suporte ao SVG; `sw.js` inclui o gerador no shell offline e incrementa o cache para `garcom-pwa-shell-v10`.
- Adicionado teste de regressão em `tests/pwa-garcom-integracao.test.cjs`: proíbe `api.qrserver.com`, confirma inclusão local/offline e gera SVG com URL de teste.
- Commits desta sequência: biblioteca `d1e646572542ef06eeb133defe1866c01f5be5b7`, licença `16648fd33b7d8d9f7aea68c3d7c75953ea62a230`, app `c99da836edf26a75fe6d93056069aeaaf85fc74e`, HTML `778ebb9447b776a0ca897ec91dd686ceccfd2951`, Service Worker `6fad7046da37c33e4a8254cd25e8f42a3c4fd931`, CSS `bf79cc63f0087b9dac104d628b2ffd7c3ef10bd3`, teste inicial `86e1dcf4c236f505872616996fdbae9d78720e09`, correção do teste `4e24666ce22684527fcb53c0d1d025ee8decee26`.
- **Validação desta correção ainda pendente:** CI precisa executar após estes commits. Não foi possível executar localmente devido à falha de DNS para `github.com`. Nenhum browser real, produção, Railway, banco ou migration foi usado.
- F02–F05 permanecem sem correção nesta rodada; PRs #65/#69/#57/#58 não foram alterados. PRs #35/#36/#37 preservados; sem merge/deploy.

- CI da correção F01 no head `592a722eea1c99ab30b0fc53ec0d473e3406d611`: [run 40126835090](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40126835090) **SUCCESS**. Passaram instalação, typecheck, build, integridade de `dist/`, regressões e sintaxe.
- Commits finais de código/teste após o primeiro CI: app `5e7c80bd6ce20cb1680eeec9299532dabc565437`; teste `592a722eea1c99ab30b0fc53ec0d473e3406d611`.
- Ainda pendente: teste de navegador real/escaneamento do SVG e confirmação do modo offline com Service Worker instalado. Sem produção, Railway, banco, migrations ou deploy.


## 2026-10-24 — revisão adicional do PR #69 (cache de assets)

- Revisados os diffs dos PRs #65, #69, #57, #58, #71 e #73 para identificar riscos sem duplicar mudanças de runtime.
- **F04 — novo falso positivo confirmado no código do PR #69:** `cacheControlForStaticAsset()` considera hash qualquer sufixo de 8+ caracteres após hífen/ponto. Nome estável como `/assets/app-production.js` também passa e receberia `public, max-age=31536000, immutable`, embora o nome não garanta versionamento por conteúdo.
- Deixado comentário de revisão no PR #69, review ID `5639718197`, pedindo correspondência com o padrão real do build e regressões para nomes estáveis longos e assets reais de `dist/assets`.
- Não alterei o código nem a branch do PR #69. O achado foi registrado no relatório F01–F05 nesta branch; aguardando resposta/correção do agente responsável.
- F02 continua bloqueado pela confirmação da topologia de proxy; F03 continua sem prova de falha na regex, e um teste HTTP real exigiria ambiente isolado com autenticação/DB; F05 continua exigindo coordenação entre #57 e #58.
- Sem merge, deploy, acesso/mutação de produção, banco, segredo ou migration. PRs #35/#36/#37 preservados.


## 2026-10-24 — ampliação do escopo F01: QR administrativo

- Busca de código no `main` encontrou outro envio de token de mesa a serviço externo em `public/admin.html`: URL `https://api.qrserver.com/v1/create-qr-code/` recebe `host + '/mesa/' + m.token` no parâmetro `data` (aprox. linha 223).
- A correção existente no PR #71 só cobre a PWA do garçom; portanto, F01 está **parcial**, não resolvido no repositório todo.
- Registrado comentário no PR #71 (issue comment ID `6389003917`) pedindo ampliação do escopo ou achado irmão para QR administrativo. Relatório F01–F05 atualizado no commit `13e1fa29fa9bea909e27b3f8b35d3e9ecb85cc5d`.
- `public/js/pix.js` também usa `api.qrserver.com` para payload PIX; registrei como revisão de privacidade separada, sem presumir que o payload seja token de mesa.
- Nenhum código de runtime da área administrativa foi alterado nesta etapa; sem merge/deploy/produção/banco/migrations.


## 2026-10-24 — correção ampliada F01 no QR administrativo

- Corrigido `public/admin.html` nesta branch para carregar `/garcom-pwa/qrcode-generator.js` e gerar o QR da mesa como SVG local; removida a construção de URL para `api.qrserver.com` contendo `m.token`.
- Adicionado teste de regressão em `tests/pwa-garcom-integracao.test.cjs` cobrindo ausência do domínio externo no HTML administrativo e presença da geração SVG local.
- Commit da alteração de runtime: `f8427f0d4da15605f12ebbf429cd767080b97ee7`; commit do teste: `a34c57af5d91af84d3b889d6cd8a92552dcb4279`. Relatório atualizado em commit `c3022f9ae7808b3e3c4615a4dc590ada69f4b01e`.
- CI para o commit de teste apareceu inicialmente como queued na run #244 (`40128855029`); a consulta ao commit mais recente ainda não retornou run, então não afirmar CI verde para esta ampliação até confirmar conclusão.
- Validação em navegador/câmera e modo offline permanece pendente. `public/js/pix.js` ainda usa QR externo para payload PIX; tratar como revisão de privacidade separada, sem confundir com token de mesa.
- Sem merge, deploy, alteração de banco, segredo ou infraestrutura.


### Atualização de CI da correção administrativa

- A run #244 (`40128855029`) falhou em `tests/pwa-garcom-integracao.test.cjs` por sintaxe inválida na regex recém-adicionada; typecheck, build e integridade de `dist/` passaram antes da etapa de regressões.
- Corrigida a regex no commit `0d341259dd7e5a4c04d59e0f3ea50a045ec7b572` e atualizada a descrição do PR #71 para não apresentar a validação antiga como se cobrisse o novo código.
- Nova run #249 (`40128952453`) está `in_progress`; aguardando resultado. A falha anterior foi registrada e não ocultada.


### Resultado final da regressão QR administrativo

- CI #249 (`40128952453`) concluiu **SUCCESS**: typecheck, build, integridade de `dist/`, sintaxe do servidor/banco e regressões passaram; total da suíte: **98 pass / 0 fail**.
- O novo teste `QR da tela administrativa é gerado localmente sem enviar token a serviço externo` passou. A falha anterior da run #244 era sintaxe de teste e foi corrigida antes da run #249.
- O relatório foi atualizado no commit `caeeead8c6b0c038b3d941192c683517186878ce`. Ainda falta validar QR em navegador/câmera e PWA offline após cache do Service Worker.


## 2026-10-24 — QR PIX também passou a ser local

- A inspeção mostrou que `public/js/pix.js` enviava o payload PIX completo a `api.qrserver.com`, incluindo chave PIX, nome do recebedor, cidade e valor. Isso não era o vazamento de token de mesa do F01, mas era uma exposição de dados financeiros a terceiro desnecessária.
- Alterado `LQRPix.qrUrl()` para gerar SVG local com a biblioteca `qrcode-generator`; agora retorna data URI SVG em vez de URL externa. `public/caixa.html` carrega a biblioteca local antes de `pix.js`.
- Adicionada regressão em `tests/pwa-garcom-integracao.test.cjs` para proibir endpoint externo no módulo PIX e confirmar geração local/ordem do script.
- CI da ampliação PIX está na run #256 (`40129073552`), `in_progress` na última consulta; não declarar verde antes da conclusão.
- Relatório técnico atualizado no commit `03ee453f02bdc3148e42ec21b4f13973cbee09b4`. Sem deploy, banco, migration ou mudança de infraestrutura.


### CI final da ampliação PIX

- Run #256 (`40129073552`) terminou **SUCCESS** após a inclusão do gerador local no fluxo PIX: typecheck, build, integridade de `dist/`, regressões e sintaxe passaram; **99 testes passaram, 0 falharam**.
- As duas regressões novas passaram: QR PIX não envia payload financeiro a serviço externo; QR administrativo gera localmente sem enviar token a serviço externo.
- O PR #71 foi atualizado para refletir o escopo ampliado. Validação real em navegador/câmera e instalação/offline continua pendente; nenhuma validação em produção foi feita.


## 2026-10-24 — retomada da auditoria F02–F05

- Releitura de `AGENTS.md` e do quadro de coordenação no PR #68: não editar trabalho atribuído a outra frente, registrar handoff e não executar produção, migrations ou deploy sem autorização.
- Estado verificado: PR #71 aberto em draft, head `2a1ff3524589ba62c2bd68dfa8752e7e19f050e4`, sem merge. CI #256 para o código/testes QR concluiu SUCCESS (99 testes, 0 falhas); o head atual do PR inclui atualização documental posterior. Ainda faltam browser real, leitura por câmera e validação offline após instalação do Service Worker.
- F02: PR #65 continua test-first e não integra `security/client-ip` com `clientIp(req)`. O quadro de coordenação indica que a issue #50 pertence à frente responsável pelo PR #65; não alterei essa branch nem inventei número de proxies confiáveis.
- F03: o teste `tests/receipt-route-regression.test.cjs` é estático. A regex de comprovante observada no snapshot é numérica e a alegação original de escape duplicado não foi reproduzida. Não foi possível comprovar comportamento HTTP real com autenticação e PostgreSQL isolado nesta rodada; não alegar teste end-to-end.
- F04: o head do PR #69 (`954c5ac9881ff8649fbe1d93bb9c80a8c88d0adf`) ainda usa padrão de hash que aceita `app-production.js`. A revisão já publicada (#5639718197) permanece pertinente; não editei a branch da compressão/cache.
- F05: publicados comentários de coordenação nos PRs #57 e #58 (comentários #6389191825 e #6389192170). Ambos alteram `scripts/start-production.js`, mas `server.js` ainda executa `spawnSync` de `db/migrate.js` no callback de `server.listen`; falta uma única solução coordenada que cubra `npm start` e `start:prod` sem execução duplicada.
- Nenhum teste HTTP contra produção, migration, alteração de dados, segredo, configuração Railway, merge ou deploy foi executado. PRs #35–#37 preservados.


## 2026-10-24 — atualização de CI e revisão dos PRs paralelos

- PR #65 head `f231d560d384b33da6814de3dbc337bbc2190adb`: workflow CI run [40122125148](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40122125148) concluído SUCCESS. Isso confirma que os testes do helper de IP passam; **não** prova integração no servidor nem a configuração real do proxy. O PR segue aberto/draft e com mergeable=false.
- PR #69 head `954c5ac9881ff8649fbe1d93bb9c80a8c88d0adf`: workflow CI run [40123884598](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40123884598) concluído SUCCESS. Inspeção do helper e dos testes confirma que a regressão para `/assets/app-production.js` ainda está ausente e o regex ainda classifica `production` como hash. CI verde não cobre esse falso positivo.
- PR #71 agora reporta `mergeable=true`, mas continua aberto em draft e sem merge. Nenhuma mudança de runtime foi feita nesta atualização; apenas evidência/coordenação.
- F03 permanece sem teste HTTP real; não criei um teste que dependa de banco/autorização sem harness isolado demonstrado. Sem deploy, produção, migrations ou mutações de banco.
