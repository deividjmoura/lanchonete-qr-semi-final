## Objetivo

Descreva o problema e o resultado esperado. Vincule a issue relacionada: Closes #

## Solução

- 

## Escopo e impacto

- [ ] Alteração limitada ao escopo descrito.
- [ ] Arquivos e interfaces compartilhadas foram revisados.
- [ ] Se alterou frontend, executei o build e revisei/incluí o `dist/` conforme o fluxo do repositório.
- [ ] Se alterou banco, usei migration versionada e avaliei compatibilidade/rollback.
- [ ] Não incluí segredos, tokens ou dados reais.
- [ ] Não alterei configuração de deploy nem ambiente de produção.

## Verificações

- [ ] `npm ci` (quando necessário para validar instalação limpa)
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run test:regression`
- [ ] `node --check server.js` e verificações de sintaxe relevantes
- [ ] `git diff --check`
- [ ] CI verificado no GitHub
- [ ] Testes de integração/browser executados quando aplicáveis

Liste abaixo os comandos executados e resultados reais. Desmarque os testes que não foram executados e explique o motivo.

## Segurança e dados

- [ ] Nenhum teste mutável foi apontado para produção.
- [ ] Banco/ambiente usado para testes foi confirmado e isolado quando necessário.
- [ ] Entradas, autorização, concorrência e tratamento de erros foram considerados quando aplicável.
- [ ] Migrations, backup e recuperação foram revisados quando aplicável.

## Revisão e liberação

- [ ] Diff revisado contra os critérios de aceitação.
- [ ] Limitações, riscos restantes e próximos passos documentados.
- [ ] Aprovação do responsável obtida antes de merge/deploy em produção.

**Testes executados e resultados:**

**Testes não executados e motivo:**

**Riscos/pendências:**

**Plano de rollback, se aplicável:**
