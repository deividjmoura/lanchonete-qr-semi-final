# Coordenação do projeto — QR Admin

> **Branch oficial e de deploy:** `main`.  
> **Documento canônico entre agentes:** [`docs/COMUNICACAO-AGENTES.md`](docs/COMUNICACAO-AGENTES.md).  
> **Protocolo permanente:** [`AGENTS.md`](AGENTS.md).  
> **Aplicação:** https://qradminn.up.railway.app/

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
| Frente 1 — caixa/pagamentos/PIX | PR #85 aberto em draft, não integrado; head atual `dab9820a4e7cb70946d21c65695a72d25a5c7162`; CI Actions **success** nesse head (run [#40201539020](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201539020)). O CI #366 também foi reportado success no commit de código anterior `955523a5c3f72aba2981dc430e1291258666bf41`; estado de mergeabilidade deve ser reconsultado antes de integrar. | Validação visual conjunta; depois integrar #85 primeiro e conferir CI na `main`. |
| Frente 2 — responsável por mesa | PR #86 fechado sem merge; PR #89 aberto em draft, não integrado; head atual `4e828e074404682a0a5f5711747585955d69b310`; CI Actions **success** nesse head (run [#40201544526](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40201544526)). O CI #367 também foi reportado success no commit de código anterior `80a9e20a09356a60a35e302a4b3a2703a0d71a6c`; estado de mergeabilidade deve ser reconsultado antes de integrar. | Validar visualmente cobrança parcial e, após merge de #85, atualizar #89 para a base resultante e confirmar CI conjunto. |
| Frente 3 — PWA do garçom | PR #84 integrado à `main`; PR #88 aberto em draft, não integrado; head registrado `3aefd704273eead3ab551d5dfc905440ecb2e31d`; CI Actions **success** nesse head (run [#40199257840](https://github.com/deividjmoura/lanchonete-qr-semi-final/actions/runs/40199257840)). | Revisar PR #88 e validar em dispositivos reais. Push em segundo plano continua sem implementação/verificação server-side. |

### Evidências e limites

- PR #85: https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/85 — CI #366 success no commit de código indicado na tabela; teste financeiro real em PostgreSQL 16 descartável, incluindo idempotência e autorização transacional do garçom.
- PR #89: https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/89 — CI #367 success no commit de código indicado na tabela; teste real em PostgreSQL 16 para transferência, fila, entrega e resumo de cobrança autorizado.
- PR #86: https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/86 — fechado sem merge; substituído pelo PR #89.
- PR #88: https://github.com/deividjmoura/lanchonete-qr-semi-final/pull/88 — aberto em draft, CI #330 sucesso no head indicado acima.
- PR #84 foi integrado com merge commit `daf1b2aab6df6c656b18d27059cf03f766f80237`.
- Migrations e fluxos financeiros/atendimento passaram testes em PostgreSQL 16 descartável nos PRs #85/#89 separadamente. Ainda não há validação visual ponta a ponta em Android/iOS nem CI conjunto após os dois merges.
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
