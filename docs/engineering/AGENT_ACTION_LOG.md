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
