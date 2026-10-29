# Fluxo de desenvolvimento e integração

Este documento define o fluxo padrão para pessoas e agentes que trabalham no QR Admin. O objetivo é manter qualidade, rastreabilidade e continuidade sem colocar a operação em risco.

## 1. Fonte de verdade

- Código, histórico e revisão: GitHub.
- Branch de produção: `main`; é a única branch que deve alimentar o Railway.
- Instruções: `AGENTS.md` (regras globais) e `COORDENACAO.md` (estado operacional, a manter atualizado).
- Estado da tarefa: issue e PR. Decisões duradouras ficam em documentação versionada, não apenas em conversas.
- Não trate notas de sessões antigas, nomes de branches ou tabelas de PR antigas como estado atual sem verificar o GitHub.

## 2. Antes de começar

1. Leia `AGENTS.md`, `COORDENACAO.md`, o trecho relevante do README e os testes relacionados.
2. Confirme a branch-base, o estado da `main`, os PRs/branches relacionados e se o arquivo já está sendo alterado por outra tarefa.
3. Defina objetivo, escopo, dependências, critérios de aceitação, riscos e verificações.
4. Verifique os scripts disponíveis no `package.json`; não invente comandos.
5. Identifique se algum teste exige PostgreSQL, servidor ou dados preparados e se modifica dados.

## 3. Decomposição e paralelismo

Use agentes em paralelo apenas quando as tarefas forem suficientemente independentes.

- **Coordenador:** divide tarefas, identifica dependências, atribui dono por arquivo/módulo, acompanha bloqueios e integra os resultados.
- **Implementador:** executa uma tarefa delimitada, cria commits pequenos e registra decisões/limitações.
- **Revisor independente:** avalia o diff contra os critérios, procurando regressões, autorização insuficiente, validação de entrada, concorrência, segredos e testes ausentes.
- **QA/documentação:** pode trabalhar em paralelo quando tiver escopo independente; não deve editar os mesmos arquivos que o implementador sem coordenação.

Cada tarefa deve ter um responsável principal e uma branch/worktree isolada. Evite que agentes diferentes editem simultaneamente arquivos compartilhados, migrations, configuração de deploy ou o mesmo workflow. Para tarefas dependentes, finalize e valide a interface/contrato antes de iniciar a próxima.

## 4. Branches, commits e PRs

1. Crie uma branch curta a partir da `main` atual, com nome descritivo, por exemplo `fix/validacao-pedido` ou `docs/multi-agent-bootstrap`.
2. Não trabalhe diretamente na `main` nem reutilize branches antigas sem autorização explícita.
3. Faça commits pequenos e temáticos; não inclua arquivos ou alterações de outra tarefa.
4. Abra um PR para `main`, com contexto, solução, riscos, testes executados e pendências.
5. Não faça merge só porque o agente concluiu. Aguarde os checks obrigatórios, revisão do diff e aprovação explícita do responsável.
6. Se houver conflito ou histórico sem ancestral comum, não use uma resolução global do tipo “aceitar meu lado”. Compare diffs por arquivo e transporte apenas mudanças necessárias.

## 5. Verificações locais e CI

Runtime de referência: Node.js 20, alinhado ao workflow existente. Use `npm ci` para instalação reproduzível.

Verificações base para alterações comuns, quando aplicáveis:

```bash
npm run typecheck
npm run build
npm run test:regression
node --check server.js
for f in db/*.js scripts/*.js; do node --check "$f"; done
git diff --check
```

O workflow `.github/workflows/ci.yml` já executa instalação limpa, typecheck, build, integridade estrutural de `dist/`, testes de regressão e verificações de sintaxe. Confira o workflow atual antes de modificá-lo; não crie um CI paralelo que repita os mesmos passos sem necessidade.

- Mudanças de frontend: execute o build e inclua o `dist/` gerado quando exigido pelo fluxo atual do repositório. Confira o diff gerado antes de commitar.
- Testes que não foram executados devem ser listados como pendentes; não os descreva como aprovados.
- CI verde não comprova comportamento no navegador real, integração com PostgreSQL ou saúde do deploy.

## 6. Segurança dos testes e do banco

O README classifica os testes operacionais. Respeite esta separação:

- A suíte `npm run test:regression` é a opção padrão de regressão no CI; confirme os pressupostos dos testes ao alterar essa suíte.
- `npm run test:smoke`, `npm run test:full` e `npm run test:seguranca` podem criar ou alterar dados e exigem servidor/banco de teste isolado.
- `npm run test:carga`, `npm run test:carga70` e `npm run test:dia` são cenários operacionais/mutáveis e nunca devem apontar para o banco usado pela lanchonete.
- `npm run db:seed` e especialmente `FORCE_SEED=1 npm run db:seed` não são verificações de CI; o modo forçado é destrutivo.
- Antes de migrations, confirme explicitamente o banco, revise o SQL, compatibilidade, backup e plano de recuperação. DDL fica em `db/migrations/`, não em handlers de requisição.

Nunca copie `.env`, credenciais, tokens de acesso ou dados reais para o repositório ou logs.

## 7. Deploy e produção

- A branch `main` é a única linha de deploy. Não altere a configuração do Railway para apontar a outra branch.
- Staging só pode ser usado depois de confirmar que serviço, variáveis e banco estão isolados de produção.
- Antes de uma liberação: identifique commit e PR, verifique CI/revisão, avalie migrations e compatibilidade, confirme backup/rollback quando houver risco de dados e defina smoke tests não destrutivos.
- Merge e deploy em produção exigem aprovação explícita do responsável para aquela liberação. Autonomia para preparar um deploy não equivale a autorização permanente para alterar dados ou promover qualquer commit.
- Após deploy aprovado, confira deployment/commit, logs, saúde HTTP e smoke tests seguros. Registre evidências e qualquer rollback.

## 8. Encerramento e handoff

Atualize a issue/PR com:

- o que mudou e por quê;
- arquivos e commits envolvidos;
- comandos realmente executados e resultados;
- testes não executados e motivo;
- riscos, decisões pendentes e plano de reversão, quando aplicável;
- próximo passo concreto.

Use `docs/engineering/AGENT_HANDOFF.md` para transferir trabalho entre agentes/sessões. O handoff resume o estado, mas não substitui a branch, os testes ou o histórico do GitHub.
