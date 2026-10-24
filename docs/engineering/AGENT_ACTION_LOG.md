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
