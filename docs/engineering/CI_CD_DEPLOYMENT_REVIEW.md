# Revisão de CI/CD e inicialização de produção

**Data da revisão:** 2026-10-24  
**Escopo:** pipeline de CI, scripts de inicialização e evidências de deploy.  
**Limites:** revisão estática dos arquivos versionados em `main`; não houve acesso ao painel Railway, variáveis de ambiente, logs de produção, banco de dados ou configurações de branch protection. Não afirmar que itens não visíveis estejam ausentes na plataforma.

## Resumo executivo

O workflow de CI existente executa instalação limpa, typecheck, build, verificações da estrutura de `dist/`, regressões automatizadas e verificações de sintaxe. Isso é uma boa base, mas **não demonstra por si só que o release está pronto para operar**: não há neste workflow evidência de integração com PostgreSQL real isolado, teste ponta a ponta em navegador/dispositivo, smoke test pós-deploy ou verificação de que a migration aplicada corresponde ao código publicado.

O ponto operacional mais importante encontrado é o comportamento de inicialização: `scripts/start-production.js` tenta executar `db/migrate.js`, mas continua a iniciar `server.js` mesmo quando a migration falha ou excede o timeout. O README também documenta que o caminho é best-effort. Isso evita uma indisponibilidade imediata, mas pode deixar uma instância atendendo requisições com schema incompatível. É necessária uma decisão explícita de arquitetura/operação antes de considerar esse comportamento seguro.

## Evidências observadas

| Área | Evidência no repositório | Avaliação |
|---|---|---|
| CI em PR | `.github/workflows/ci.yml` executa em pull requests para `main` | Positivo: PRs destinados a main passam pelo workflow configurado |
| Instalação | `npm ci`, Node.js 20 e cache npm | Positivo: instalação reproduzível baseada no lockfile |
| Verificações | `typecheck`, build, integridade de `dist/`, regressões e `node --check` | Boa cobertura estática/regressiva, sem equivaler a validação operacional |
| Testes com banco | O workflow não configura PostgreSQL nem executa migrations/fluxo integrado contra DB | Lacuna: não prova compatibilidade com o schema real |
| Deploy | O workflow consultado não contém etapa de deploy ou smoke test pós-deploy | Lacuna no workflow versionado; pode existir configuração externa não visível nesta revisão |
| Inicialização | `scripts/start-production.js` inicia o servidor mesmo se a migration falhar | Risco operacional alto: possível aplicação ativa com schema desatualizado |
| Scripts mutáveis | `package.json` expõe smoke, carga, segurança e teste de dia inteiro; README diz que alteram dados | Requer ambiente isolado e credenciais de teste; nunca executar contra produção |
| Dependências | Não foi encontrado workflow de auditoria de dependências no caminho consultado; `package.json` contém dependências npm | Confirmar política de auditoria/atualização no repositório e nas configurações da plataforma |
| Branches | O push trigger do CI cobre `main`, `hardening/**` e `arena/**`; PRs para `main` também disparam CI | Commits em outras branches sem PR podem não executar esse workflow de push; criar PR para main aciona o evento de PR |

## Riscos priorizados

### P1 — A aplicação pode iniciar após falha de migration

**Evidência:** `scripts/start-production.js` registra aviso para erro/exit diferente de zero e chama `require('../server.js')` em seguida. O script também define timeout de 30 segundos para o processo de migration.

**Impacto possível:** endpoints podem receber tráfego enquanto tabelas, índices ou colunas esperados pelo código ainda não existem ou estão em versão incompatível. O impacto exato depende das migrations e das rotas utilizadas.

**Recomendação:** decidir entre (a) migrations executadas como etapa de release separada, com verificação explícita antes de trocar tráfego, ou (b) falha fechada do processo quando migration necessária falhar. Não alterar esse comportamento sem revisar o mecanismo de deploy e a estratégia de compatibilidade/rollback das migrations.

**Evidência necessária para encerrar:** demonstrar, em ambiente isolado, o comportamento em sucesso, falha, timeout e migration já aplicada; registrar como o deploy impede que tráfego chegue a uma versão incompatível.

### P1 — CI não prova compatibilidade do código com PostgreSQL

**Evidência:** o workflow não provisiona PostgreSQL e não executa migrations mais fluxo integrado com um banco efêmero.

**Impacto possível:** falhas de SQL, constraints, transações, concorrência ou migrations podem escapar do CI, mesmo com build e regressões verdes.

**Recomendação:** adicionar um job de integração com PostgreSQL descartável, migrations do zero e testes determinísticos de pedidos/caixa selecionados. Usar somente dados sintéticos e credenciais efêmeras; não referenciar `DATABASE_URL` de produção. Fazer isso em PR separado após confirmar que os testes podem rodar sem dados reais.

### P1 — Falta evidência automatizada de saúde após o deploy no workflow

**Evidência:** o workflow consultado termina após verificações de sintaxe e não realiza smoke test contra um ambiente de staging ou validação pós-deploy.

**Impacto possível:** build aprovado não detecta variáveis ausentes, erro de conexão, migration falha ou problema de roteamento no serviço publicado.

**Recomendação:** quando houver ambiente de staging confiável, executar smoke test não destrutivo após deploy e verificar um endpoint de saúde que não altere estado. A checagem deve validar o SHA implantado e não deve enviar pedidos, pagamentos ou seeds ao ambiente de produção.

### P2 — Política de dependências e permissões do workflow precisa ser confirmada

**Evidência:** o workflow usa actions por tags principais (`actions/checkout@v4`, `actions/setup-node@v4`) e não declara explicitamente um bloco `permissions` restritivo. Não foi localizado um workflow de auditoria de dependências nos caminhos revisados.

**Impacto possível:** a política efetiva de permissões pode ser mais ampla que o necessário, dependendo dos defaults do repositório/organização; vulnerabilidades transitivas podem não gerar um sinal de CI dedicado.

**Recomendação:** confirmar permissões efetivas e branch protection; declarar permissões mínimas de leitura quando compatível; avaliar Dependabot e/ou auditoria de dependências com política de severidade acordada. Pinagem por SHA pode ser adotada conforme a política de segurança do projeto.

### P2 — Cobertura do evento de push é limitada a alguns padrões de branch

**Evidência:** push em `main`, `hardening/**` e `arena/**`; pull requests destinados a `main`.

**Impacto possível:** uma branch de trabalho fora desses padrões não recebe CI por push antes de abrir PR. Isso não impede CI no PR para main, mas pode atrasar feedback.

**Recomendação:** decidir se todas as branches de trabalho devem executar CI no push ou se o PR para main é o único gate obrigatório. Documentar a política e manter a proteção de merge alinhada.

## Plano seguro de validação

1. Conferir branch protection/rulesets e exigir CI verde antes do merge; essa configuração não foi acessível nesta revisão.
2. Em ambiente isolado, simular migration bem-sucedida, falha SQL e timeout; confirmar se a versão recebe tráfego em cada caso.
3. Criar job de integração PostgreSQL com banco descartável e executar apenas testes previamente auditados para uso com dados sintéticos.
4. Criar smoke test de staging sem mutação e validar o SHA implantado, a disponibilidade do processo e conectividade com DB.
5. Documentar o caminho de rollback da aplicação e das migrations. Não presumir que rollback de código reverta alterações de schema.
6. Confirmar alertas, logs e política de backup/restore diretamente na plataforma; isso não foi verificado aqui.

## Comandos de baixo risco

Os comandos abaixo não iniciam testes que escrevem no banco; devem ser executados em clone local com dependências instaladas:

```bash
npm ci
npm run typecheck
npm run build
git diff --check
```

Não execute `npm run test:smoke`, `test:full`, `test:seguranca`, `test:carga`, `test:carga70`, `test:dia`, migrations ou seed sem confirmar que a configuração aponta para um banco isolado. Nunca use o banco de produção para esses testes.

## Fora do escopo / limitações

- Não foram consultados Railway, logs, variáveis, estado de banco, backups ou alertas.
- Não foi feito deploy, merge, migration, teste mutável nem alteração de aplicação.
- A ausência de uma configuração no repositório não prova que ela não exista externamente.
- Esta revisão complementa a auditoria de código e a matriz de prontidão; não é aprovação para produção.
