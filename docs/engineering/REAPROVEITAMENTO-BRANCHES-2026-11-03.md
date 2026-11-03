# Auditoria de reaproveitamento de branches — 2026-11-03

## Escopo

Comparação das quatro branches remotas identificadas na sincronização de 2026-11-03 com a `main` no commit `7f18dca7207d27f34d5187e22013c5c74fb10550`.

A comparação de commits é apenas um indicador. Como algumas PRs foram integradas por squash ou empilhadas sobre outras branches, cada alteração candidata foi conferida contra os arquivos atuais de `main` antes de recomendar cherry-pick.

## Resultado executivo

**Nenhuma das quatro branches deve ser mergeada integralmente.** As alterações úteis foram absorvidas pela `main`, substituídas por implementações mais recentes ou pertencem a uma direção visual antiga. Não fazer merge apenas para preservar histórico.

## 1. `arena/8a903abe-lanchonete-qr-semi-final`

- Head observado: `612f9e7cb05e8ed6729f82e7b9e897539c9237e6`.
- Comparação com main: 13 commits à frente / 42 atrás.
- PR relacionada: #179, **merged** em 2026-11-01 (merge commit `5e36601a2159362ef3412ff46a295b643627c06a`).

### Reaproveitamento

- O design system Palco Azul/Violeta e o teste `tests/design-tokens-identidade.test.cjs` já existem na main atual.
- O relatório `docs/engineering/auditoria-2026-11-01-diagnostico.md` é uma referência histórica útil, mas declara como base o commit antigo `58c3433`; todos os achados operacionais precisam ser revalidados no commit atual antes de virar tarefa.
- As instruções temporárias de coordenação e os prompts específicos de agentes foram retirados. Decisões técnicas vigentes devem ser consultadas nos documentos de arquitetura, design e operação; registros históricos servem apenas como contexto.
- A branch contém artefatos versionados em `dist/`; não copiar builds gerados para a main como parte de saneamento.

### Decisão

Não mergear a branch. Consultar o relatório histórico apenas como fonte de pistas e manter a identidade visual definida na main como fonte atual.

## 2. `arena/frente-b-fix-176-report`

- Head observado: `93d9ac5b28b6b34090243d861bd334c1e85d9511`.
- Comparação com main: 15 commits à frente / 43 atrás.
- PR relacionada: #178 foi fechada sem merge para main; sua base era `feat/garcom-relatorios-categorias-drag`.

### Reaproveitamento

- O ramo contém alterações de relatório de garçons, drag de categorias e ação em lote do PWA.
- A main atual já possui o drag de categorias e o teste correspondente.
- A main atual já oculta ação em lote quando há apenas um item elegível (`ids.length < 2`); o teste `tests/pwa-garcom-lote-cobranca.test.cjs` é idêntico entre main e esta branch.
- O relatório atual em `db/atendimento.js` é mais avançado que o ramo: aceita intervalo de datas, aplica timezone ao intervalo, agrega outros eventos e usa o relatório financeiro autoritativo para vendas, taxa de serviço e descontos. O ramo contém uma versão de dia único e menos campos.
- A main atual também contém os campos de métricas de atividade e os testes de atribuição correspondentes.

### Decisão

Não cherry-pickar os commits antigos de relatório/drag/PWA. A implementação atual da main é mais completa; qualquer discrepância encontrada em uma revisão futura deve ser corrigida diretamente sobre a main atual, com teste focado.

## 3. `feat/admin-icon-dock-sidebar-visual-cleanup`

- Head observado: `caa7da0e8feef02c1acc071515cd5a5cf9ef31e7`.
- Comparação com main: 3 commits à frente / 38 atrás.
- PR relacionada: #182 foi fechada sem merge.

### Reaproveitamento

- A branch implementava magnificação de ícones por eventos de ponteiro diretamente no componente.
- A main atual já implementa o comportamento de dock com o hook reutilizável `src/hooks/useDockMagnify.ts`, aplicado à navegação e ao dock de ações da barra superior.
- A main também tem teste específico `tests/ops-shell-dock-visual.test.cjs` cobrindo dock, tooltip, redução de movimento e estilo visual.

### Decisão

Não mergear nem portar os handlers diretos de ponteiro. A implementação reutilizável atual substitui a abordagem antiga.

## 4. `feat/casa-operacao-visual-system`

- Head observado: `fd88d12337f11504f96b8b3a73885cd5324593c3`.
- Comparação com main: 0 commits à frente / 31 atrás.

### Decisão

Branch ancestral da main atual, sem commits exclusivos. Não há alteração a reaproveitar.

## Regras para futuras branches candidatas

1. Comparar a branch com o SHA atual de main, não com uma base histórica.
2. Verificar se a PR foi merged, fechada sem merge ou empilhada sobre outra branch.
3. Comparar o comportamento atual e os testes, não apenas os nomes dos commits.
4. Não portar arquivos `dist/` como substituto de build.
5. Não reintroduzir versões menos completas de relatórios, segurança, PWA ou design system.
6. Se houver uma melhoria pontual ainda ausente, abrir PR nova baseada na main atual e portar somente o conceito/patch mínimo com teste de regressão.

## Conclusão

As quatro branches não justificam merge integral. O reaproveitamento mais valioso é conhecimento histórico e confirmação de que funcionalidades já estão na main. O trabalho ativo deve seguir nas PRs #196–#199 e em PRs pequenas baseadas na main atual.
