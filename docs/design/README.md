# docs/design — histórico da identidade anterior

> **Esta pasta não descreve mais o produto.** Ela registra a fase "Comanda de Chapa"
> (Território A, novembro de 2026): inventário, brief, sistema, plano e relatório daquela
> direção — palco escuro com vidro e brasa, Fraunces + Plus Jakarta Sans + JetBrains Mono.
>
> Em 10/11/2026 essa identidade foi **substituída** pela identidade **"Passe"** em todo o
> sistema, com uma única exceção: o cardápio do cliente (`#/mesa/:token`), que conserva a
> aparência daquela fase de propósito.

## Onde está a documentação em vigor

| Preciso de… | Leia |
|---|---|
| Tokens, tipografia, primitivos, navegação e regras da identidade atual | [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) |
| O que mudou, o que foi preservado, como foi verificado e o que conferir antes de mesclar | [`REBRANDING.md`](../../REBRANDING.md) |
| Como o cardápio do cliente ficou isolado da troca | `docs/DESIGN_SYSTEM.md` §8 e "Como alterar o cardápio" em `REBRANDING.md` |

## Por que os arquivos continuam aqui

1. **O cardápio do cliente ainda é aquela identidade.** Os tokens, as fontes e as regras
   globais que ele usa foram congelados em
   `src/screens/cardapio-identidade/identidade-cardapio.css`. Os documentos desta pasta
   explicam de onde vêm esses valores.
2. **Registro de decisão.** `01-brief.md` e `02-sistema.md` guardam o raciocínio de uma
   direção que foi aprovada, aplicada e depois abandonada. Quem for mexer na identidade de
   novo encontra aqui o que já foi tentado.

## O que não usar daqui

- Nomes de token (`--stage-*`, `--glass-*`, `--elev-*`, `--prim-*`), classes (`.card-neon`,
  `.ticket-rule`, `.stage-surface`) e famílias tipográficas citados nestes arquivos **não
  existem mais** fora do cardápio. Se essas famílias de token voltarem ao arquivo de tokens,
  `tests/design-tokens-identidade.test.cjs` falha.
- As capturas em `capturas/` e os pilotos em `pilotos/` mostram telas que não existem mais
  com essa aparência.

| Arquivo | Conteúdo (histórico) |
|---|---|
| `00-inventario.md` | Auditoria da interface antes daquela fase |
| `01-brief.md` | Brief e territórios considerados |
| `02-sistema.md` | Sistema de design do Território A |
| `03-plano-correcao-e-execucao.md` | Plano de execução |
| `04-relatorio-implementacao.md` | Relatório da implementação parcial |
| `capturas/`, `pilotos/` | Imagens de apoio daquela fase |
| `rebranding/` | **Não é histórico:** comparações antes e depois (`main` × "Passe") e o cardápio da produção × o do PR, usadas em `REBRANDING.md` |
