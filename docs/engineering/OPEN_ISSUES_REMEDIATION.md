# Revisão das PRs e issues abertas — 2026-10-25

Esta branch contém um conjunto de alterações de revisão para validação manual. Não houve merge, deploy, acesso a produção, execução de migration ou consulta a dados reais. O relatório distingue correções locais de evidências e decisões que dependem do responsável.

## PRs abertas revisadas e incorporadas como alterações locais

### PR #117 — troca de senha e proposta de 2FA

Foram aplicadas nesta branch as alterações da PR: endpoint e política de troca de senha, rotação/revogação de sessões, fluxo de troca obrigatória, trilha sem segredos, interface, migration aditiva, testes e documentação de 2FA. A proposta não ativa 2FA: método, recuperação e operação ainda precisam de aprovação.

**Impacto que exige atenção antes de produção:** em `NODE_ENV=production`, a troca obrigatória fica ativa por padrão para contas iniciais/compartilhadas. Revise os logins existentes e o procedimento operacional de primeiro acesso. `STAFF_FORCE_PASSWORD_CHANGE=false` desativa explicitamente esse comportamento; não faça isso sem avaliar a exposição das credenciais compartilhadas.

Na consulta realizada, a PR reportava checks de CI verdes (CI, integração PostgreSQL e migrations). Isso não substitui os testes locais desta branch nem a validação do responsável.

### PR #116 — drill de backup/restore

Foram aplicadas localmente a ferramenta de restauração isolada, testes unitários e PostgreSQL, workflow e documentação. As travas recusam origem/destino coincidentes, destino não vazio e destino sem nome de ambiente descartável, além de exigir confirmação explícita.

A PR deixa corretamente pendente a prova de backups reais do provedor, retenção e RPO/RTO. O teste em PostgreSQL de CI prova a ferramenta, não a existência/restaurabilidade dos backups operacionais. Na consulta realizada, os checks reportados pela PR estavam verdes.

## Correções adicionais realizadas nesta branch

- **#50 — confiança no proxy:** `server.js` agora usa `security/client-ip.js`, que por padrão ignora `X-Forwarded-For`. `TRUSTED_PROXY_HOPS` só deve ser configurado depois de confirmar o número de proxies, que eles acrescentam o IP observado à direita e que a origem da aplicação não é acessível diretamente. Os limites por IP continuam em memória e por processo; não são globais nem persistentes.
- **#6 / #40 — migrations no startup:** `npm start` agora usa `scripts/start-production.js`, que falha fechado e não inicia o servidor se a migration falhar, exceder o timeout ou não puder executar. A configuração real do provedor e o comando de release ainda precisam ser verificados antes de considerar isso evidência de produção. `node server.js` continua sendo um caminho direto que não deve ser usado como comando de produção.

## Situação das demais issues abertas

| Issue | Estado nesta entrega | Próximo passo / bloqueio |
|---|---|---|
| #55 troca de senha / 2FA | Implementação incorporada da PR #117; validação local feita. 2FA apenas documentado. | Revisar o impacto do primeiro deploy e aprovar recuperação/2FA antes de implementar 2FA. |
| #53 fotos base64 | Sem alteração de arquitetura nem migração de fotos. | Medir payload/tamanhos com dados sintéticos e definir storage persistente, limites e migração/rollback. Não há escolha aprovada de storage; não migrar dados reais. |
| #50 proxy / rate limit | Resolução segura do IP integrada ao servidor, com padrão sem confiança em XFF. | Confirmar topologia do provedor. Rate limit segue por processo; decidir/implementar armazenamento global se necessário. Não configurar hops por suposição. |
| #48 autoria/auditoria | Sem mudança em regras financeiras ou criação de trilha genérica. | Responsável precisa definir identidade individual/PIN, autorização de descontos e retenção. Depois implementar auditoria atômica junto às transações. |
| #47 QR e sessão da mesa | Sem alteração no comportamento comercial do QR fixo. | Decidir se um QR fotografado pode abrir nova sessão após fechamento e quais ações exigem presença/autorização do garçom. |
| #45 licença/proveniência | Sem decisão legal ou alteração de licença. | Proprietário deve confirmar titularidade e licença de código, imagens e demais ativos antes de publicar/redistribuir. |
| #44 retenção/purge | A documentação de backup aponta a dependência de incluir fotos/storage; não houve mudança de política ou purge. | Aprovar prazos, bases legais, retenção de auditoria/financeiro e procedimento de eliminação; avaliar obrigações legais. |
| #43 health check / alertas | `/healthz` já existe como liveness read-only e há smoke (`npm run health:smoke`). | Falta configurar/confirmar alertas e monitoramento no provedor, seus destinos e limiares. Não há credencial/configuração de infraestrutura nesta alteração. |
| #41 backup/restore | Implementação da PR #116 incorporada localmente; prova real do provedor continua pendente. | Executar somente com autorização, backup identificado e destino isolado; registrar retenção e RPO/RTO. Nunca restaurar sobre produção. |
| #40 gate de migrations | `npm start` passa pelo gate fail-closed. | Confirmar comando real de release e validar os cenários SQL/timeout em ambiente descartável; documentar compatibilidade e rollback. |
| #39 integração financeira concorrente | Testes PostgreSQL existentes continuam no workflow. | Conferir critérios completos da issue e ampliar cenários que ainda faltarem; nenhum teste de carga/mutação em produção. |
| #6 auto-migrate fail-open | O caminho padrão `npm start` passa pelo gate fail-closed. | Remover/evitar o uso de comandos diretos alternativos em produção e confirmar a configuração do deploy. |

## Verificações executadas

- `npm ci` — concluído; npm reportou 3 vulnerabilidades (1 baixa e 2 altas) no conjunto de dependências instalado. Ainda não foi feita atualização automática.
- `npm test` — 201 testes passaram, 0 falharam.
- `npm run build:check` — typecheck e build concluídos.
- O build alterou arquivos gerados em `dist/`; eles foram revertidos/removidos para não incluir artefatos de build nesta entrega.

## Limites

Essas alterações são propostas para revisão. Não fecharam issues nem alteraram PRs no GitHub, não foram publicadas, e não provam configuração/estado de produção. Revise especialmente a mudança de `npm start`, o comportamento de troca obrigatória de senha, a política de proxy e as instruções de restore antes de qualquer merge/deploy.
