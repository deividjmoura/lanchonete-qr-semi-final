# Coordenação do projeto — QR Admin

> **Branch oficial e de deploy:** `main`.  
> **Documento canônico entre agentes:** [`docs/COMUNICACAO-AGENTES.md`](docs/COMUNICACAO-AGENTES.md).  
> **Protocolo permanente:** [`AGENTS.md`](AGENTS.md).  
> **Aplicação:** https://qradmin.up.railway.app/

## Regras operacionais

1. Todo trabalho integrado e elegível para deploy deve terminar na `main`, conforme o protocolo do proprietário em `AGENTS.md`.
2. Não trate branch ou PR aberto como entregue. Confirme estado e commit no GitHub.
3. Mudou o frontend: execute `npm run build` e inclua o `dist/` gerado no commit, conforme os scripts/CI do repositório.
4. Não reabrir branches antigas `arena/*`, `hardening/*`, `redesign-*` ou `Gzuis-Version` como fonte de verdade.
5. Não alterar Railway, secrets, banco ou executar migrations/testes mutáveis em produção sem autorização e plano de validação.
6. Para coordenação entre frentes, use apenas `docs/COMUNICACAO-AGENTES.md` na `main`; atualize-o com evidências e pendências verificadas.

## Estado das frentes — verificado em 2026-10-25

| Frente | Estado registrado no canal canônico | Próxima ação |
|---|---|---|
| Frente 1 — caixa/pagamentos/PIX | PR #85 aberto em draft, não integrado; head registrado `b6bb9da195da58b4e4b86c7f67167d36a1d24945`; `mergeable=false`. CI verde citado em commits anteriores não valida o head atual. | Investigar `mergeable=false`, confirmar CI no head exato e revisar integração com a Frente 2. |
| Frente 2 — responsável por mesa | PR #86 fechado sem merge; PR #89 aberto em draft, não integrado; head registrado `b465ba614d239a2ddfa0f43c5b9decf7f60d8f8f`; `mergeable=false`. | Investigar conflitos, confirmar CI no head exato e revisar o contrato integrado com PR #85. |
| Frente 3 — PWA do garçom | PR #84 integrado à `main`; PR #88 aberto em draft, não integrado; head registrado `3aefd704273eead3ab551d5dfc905440ecb2e31d`; CI #330 sucesso registrado nesse head. | Revisar PR #88 e validar em dispositivos reais. Push em segundo plano continua sem implementação/verificação server-side. |

### Evidências e limites

- PR #86: https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/86 — estado consultado em 2026-10-25: fechado, não mesclado.
- PR #88: https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/88 — aberto em draft, CI #330 sucesso no head indicado acima.
- PR #84 foi integrado com merge commit `daf1b2aab6df6c656b18d27059cf03f766f80237`.
- Não foi feita validação ponta a ponta em Android/iOS nem teste de migration em PostgreSQL descartável nesta atualização.
- Nenhuma alteração em Railway, secrets, banco ou produção foi feita nesta atualização.

## Fila histórica B1–B5

Os itens abaixo constam como encerrados no registro anterior; são histórico, não uma lista de trabalho ativo.

| ID | Item | Status registrado |
|---|---|---|
| B1 | Logo acesso equipe | Feito |
| B2 | Fotos Admin | Feito |
| B3 | PIX EVP | Feito |
| B4 | dist sincronizado | Feito |
| B5 | Login staff | Feito |



> **Nota de sincronização (2026-10-25):** este arquivo é apenas um resumo operacional. O único canal compartilhado entre agentes é [`docs/COMUNICACAO-AGENTES.md`](docs/COMUNICACAO-AGENTES.md) na `main`. Os estados acima foram sincronizados com o registro canônico; consulte-o para contratos, dependências e evidências detalhadas. Nenhuma alteração em Railway, secrets, banco ou produção foi feita.
