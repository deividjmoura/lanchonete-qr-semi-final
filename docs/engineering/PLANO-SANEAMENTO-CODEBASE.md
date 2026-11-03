# Plano de saneamento do codebase

## Objetivo

Reduzir duplicação, código morto, dependências sem uso e complexidade estrutural sem alterar regras de negócio, segurança, financeiro, concorrência ou comportamento da PWA.

O trabalho parte do commit auditado `7f18dca7207d27f34d5187e22013c5c74fb10550`. Antes de cada execução, atualizar a branch e registrar o SHA real usado.

## Regras obrigatórias

1. Não apagar arquivo, export, rota ou dependência apenas porque uma busca textual não encontrou referência.
2. Classificar cada achado como confirmado, provável ou inconclusivo.
3. Investigar imports dinâmicos, `require` construído, rotas HTTP, scripts operacionais, migrations, seeds, service workers, manifestos e arquivos referenciados por configuração.
4. Não misturar refatoração estrutural com correção de regra de negócio.
5. Preservar contratos HTTP, payloads, status codes, ordem de locks, transações e idempotência.
6. Cada PR deve ser pequena, ter escopo único e incluir testes de regressão.
7. Não fazer remoções em massa geradas automaticamente sem revisão humana do diff.

## Fase 0 — baseline reproduzível

- [ ] Registrar SHA, versão do Node e versão do npm.
- [ ] Instalar dependências a partir do lockfile sem atualizá-lo.
- [ ] Executar typecheck, build, testes unitários/regressão e suites de integração disponíveis.
- [ ] Registrar falhas preexistentes separadamente.
- [ ] Não declarar cobertura de segurança apenas pela existência de arquivos de teste; conferir asserts e cenários.

## Fase 1 — inventário estático, sem remoções

Avaliar ferramentas, sem adicionar dependências de produção:

- **Knip**: arquivos, exports e dependências sem uso.
- **jscpd**: blocos duplicados e clones de código.
- **Madge**: ciclos e grafo de dependências.
- **ESLint**: variáveis, imports e padrões problemáticos, caso a configuração existente seja suficiente.

A adoção deve respeitar o lockfile. Ferramentas não serão adicionadas ao projeto até que a versão, configuração e impacto de manutenção estejam definidos.

Entregáveis:
- [ ] relatório de arquivos/exports/dependências possivelmente não utilizados;
- [ ] relatório de duplicações com localização e tamanho;
- [ ] grafo de dependências e ciclos;
- [ ] lista de falsos positivos conhecidos e exceções justificadas.

## Fase 2 — remoção segura de código morto

- [ ] Remover somente itens confirmados sem consumidores.
- [ ] Verificar scripts npm, CI, deploy, migrations, seed e PWA.
- [ ] Executar a suíte correspondente após cada grupo pequeno de remoções.
- [ ] Manter cada remoção isolada em PR própria quando houver risco de impacto.

## Fase 3 — consolidação de duplicações

- [ ] Agrupar duplicações por domínio, não apenas por similaridade textual.
- [ ] Extrair funções compartilhadas somente quando os contratos forem realmente equivalentes.
- [ ] Preservar diferenças de autorização, transação, locks e tratamento de erros.
- [ ] Não criar abstrações genéricas para economizar poucas linhas.

## Fase 4 — redução de complexidade estrutural

O `server.js` concentra roteamento e gates de autorização. Antes de extrair módulos:

- [ ] mapear todos os handlers e middleware/gates anteriores;
- [ ] documentar ordem de autenticação, CSRF, rate limit e execução;
- [ ] criar testes de contrato para rotas públicas e protegidas;
- [ ] extrair por domínio em mudanças incrementais, sem reescrever o roteador inteiro.

## Separação das correções de segurança

Os achados da revisão independente não devem ser escondidos dentro da limpeza:

- REV-001: rate limit das mutações públicas de mesa.
- AUD-001 / REV-003: estado em memória e multi-instância.
- AUD-002 / REV-002: tokens persistentes, exposição e rotação operacional.
- AUD-003: CSP e migração segura sem `unsafe-inline`.
- AUD-004: fallback CSRF.
- REV-005: comprovação dos asserts de segurança.

Cada pacote terá PR e testes próprios. A limpeza não pode reduzir os controles existentes.

## Critérios de conclusão

- [ ] Nenhuma alteração funcional não intencional.
- [ ] Testes relevantes executados e resultados anexados à PR.
- [ ] Relatório de duplicações e código morto atualizado.
- [ ] Dependências removidas apenas após confirmação de uso.
- [ ] Nenhuma migration ou dado de produção alterado.
- [ ] Revisão independente do diff final.
