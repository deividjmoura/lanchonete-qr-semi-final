# Registro de ações dos agentes

Este documento registra ações e limites de validação por sessão. Acrescentar uma entrada em cada continuidade relevante, sem sobrescrever o histórico.

## 2026-10-24 — revisão F01–F05

- Repositório: https://github.com/deividjmoura/lanchonete-qr-semi-final
- Branch de trabalho: `audit/f01-f05-2026-10-24`
- Relatório: `docs/engineering/REVIEW_F01_F05_2026-10-24.md`
- Issue criada: #70 — impedir envio do token de mesa a serviço externo de QR.
- F01 confirmado por leitura estática em `public/garcom-pwa/app.js`.
- F02–F05 separados entre evidência parcial e confirmação pendente; não foram declarados comprovados sem reprodução.
- Referências pré-existentes a revisar antes de abrir tarefas duplicadas: #50, PR #65 (proxy/rate limit), PR #69 (cache de assets), PR #37 e PRs #57/#58 (startup/migrations).
- Não foram executados testes, requests HTTP, benchmark, migration ou comandos contra produção. Sem mudanças na aplicação, merge ou deploy.
