# Coordenação do projeto

> **Política operacional atualizada em 2026-10-24.** As notas de fila e limpeza abaixo são registros históricos e não devem ser interpretadas como estado atual sem conferência no GitHub.

## Fluxo vigente

- `main` é a única branch de produção e a única fonte de deploy para o Railway.
- O trabalho normal acontece em branches curtas e isoladas, com PR para `main`. Não faça commits diretamente em `main` salvo autorização explícita do responsável.
- Não faça merge nem deploy em produção sem revisão dos checks e aprovação explícita para aquela liberação.
- Consulte `AGENTS.md` e `docs/engineering/DEVELOPMENT_WORKFLOW.md` para as regras completas de agentes, testes, segurança e integração.
- Confirme issues, PRs, branches e deployments no GitHub/Railway antes de agir; tabelas antigas deste arquivo podem estar desatualizadas.
- Mudanças no frontend exigem build e revisão do `dist/` conforme o fluxo atual. Testes que modificam dados só podem rodar em ambiente isolado.

---

## Registro histórico de coordenação

> Branch oficial: **`main`** apenas.  
> Deploy: https://qradmin.up.railway.app/

## Regras

1. Trabalho e entrega na **`main`**.
2. Mudou front → `npm run build` e commit do **`dist/`** junto.
3. Não reabrir branches `arena/*`, `hardening/*`, `redesign-*`, `Gzuis-Version`.

## Fila B1–B5 (encerrada)

| ID | Item | Status |
|----|------|--------|
| B1 | Logo acesso equipe | Feito |
| B2 | Fotos Admin | Feito |
| B3 | PIX EVP | Feito |
| B4 | dist sincronizado | Feito |
| B5 | Login staff | Feito |

## Limpeza de branches (local)

```bash
git push origin --delete \
  Gzuis-Version \
  arena/01a0a9bd-lanchonete-qr-semi-final \
  arena/01a0a77d-lanchonete-qr-semi-final \
  arena/01a0a79b-lanchonete-qr-semi-final \
  arena/01a0b4be-lanchonete-qr-semi-final \
  hardening/pre-sale-audit \
  redesign-qradmin
```
