# Fase 1 — As 7 decisões gratuitas que destravam as 8 issues

**Como usar:** cada bloco tem opções de A a D, um **custo**, um **esforço** e uma **recomendação**. Marque uma letra por decisão, preencha o campo "Escolhi" e date. Ao final, a tabela de consolidação vira a entrada para criar as sub-issues de execução.

**Regra desta fase:** nada aqui custa dinheiro. Tudo aqui depende só de você decidir.

---

## Decisão 1 — Repositório canônico (#45)

Hoje existem dois repositórios públicos: `lanchonete-qr-semi-final` (onde está o CI ativo e o `main` atual) e `lanchonete-qr` (README e versão divergentes).

| | Opção | Consequência |
|---|---|---|
| **A** | `lanchonete-qr-semi-final` é o canônico; `lanchonete-qr` recebe aviso de depreciação apontando para ele | Alinha com o que já está em produção |
| **B** | `lanchonete-qr` é o canônico | Exige migrar histórico, CI e histórico de issues |
| **C** | Manter os dois | Ambiguidade permanente — clientes e contribuidores não sabem o que é a verdade |

- **Custo:** 🟢 R$ 0 · **Esforço:** ⚡ 10 min
- **Recomendação: A.** Não apague o outro — coloque aviso no README (a issue proíbe remoção sem autorização).

**Escolhi: ____ · Data: ____**

---

## Decisão 2 — Licença (#45)

O repositório está público, **sem `LICENSE`** e sem `license` no `package.json`. Juridicamente isso significa "todos os direitos reservados" — ninguém pode usar. **Verificado:** todas as dependências são MIT/Apache, então nenhuma opção fica bloqueada.

| | Opção | Você mantém | Quando escolher |
|---|---|---|---|
| **A** | **Proprietária** — "Todos os direitos reservados" | Fecha o uso por terceiros | Você quer **vender licença** para lanchonetes. Combina com CNAE 6202-3/00 |
| **B** | **AGPL-3.0** | Aberto, mas quem oferecer como serviço deve abrir o dele | Quer adoção sem permitir que concorrente feche o código |
| **C** | **MIT** | Quase tudo permitido | Máxima adoção; sem intenção de vender software |
| **D** | **BSL 1.1** | Aberto, vira open source após prazo (ex.: 3 anos) | Abrir depois de monetizar |

- **Custo:** 🟢 R$ 0 · **Esforço:** ⚡ 15 min (criar o arquivo) — mas **decidir** exige ter clareza do modelo de negócio
- **Recomendação: A** se o objetivo é vender licença; **B** se o objetivo é adoção.

> ⚠️ Não existe "sem licença" viável. O estado atual é o pior para adoção: público mas sem permissão de uso.

**Escolhi: ____ · Data: ____**

---

## Decisão 3 — Visibilidade do repositório (#45)

| | Opção | Consequência |
|---|---|---|
| **A** | Manter **público** | Serve como portfólio; exige licença clara e nenhum segredo no histórico |
| **B** | Tornar **privado** | Protege o produto; perde portfólio e contribuição externa |
| **C** | Público apenas para leitura, desenvolvimento em privado | Mais complexo de operar |

- **Custo:** 🟢 R$ 0 · **Esforço:** ⚡
- **Recomendação:** se escolher licença **proprietária (1-A)**, a coerência pede **privado (3-B)**. Se escolher MIT/AGPL, mantenha público.
- **Restrição da issue:** não mudar visibilidade sem decisão explícita e registrada.

**Escolhi: ____ · Data: ____**

---

## Decisão 4 — Fonte das 35 imagens de demonstração (#45)

`public/assets/demo/` tem **70 arquivos** (35 jpg + 35 webp do mesmo conjunto), **2,1 MB**, introduzidos no commit `eb7096b`.

| | Situação | Ação |
|---|---|---|
| **A** | Banco de imagens com licença | Documentar a fonte e a licença; manter |
| **B** | Imagens geradas | Documentar; manter |
| **C** | Fotos de estabelecimento real com autorização escrita | Arquivar a autorização; manter |
| **D** | Fotos de terceiro **sem** autorização | **Remover ou substituir antes de manter o repo público** |

- **Custo:** 🟢 R$ 0 · **Esforço:** ⚡⚡ 1h (levantar a origem de 35 arquivos)
- **Recomendação:** preencher `docs/engineering/proveniencia-ativos.md` seção 3.

> **Boa notícia:** a marca "Delicia's" **já foi removida** no PR #130 e há teste (`tests/branding-neutral.test.cjs`) impedindo o retorno. Essa parte de #45 está resolvida.

**Escolhi: ____ · Data: ____**

---

## Decisão 5 — Canal de alerta e limiar (#43)

O código de health/smoke **já existe** (`scripts/health-smoke.js`, `production-healthcheck.yml`). Falta decidir para onde o alerta vai.

**5.1 Canal**

| | Opção | Custo | Bom para |
|---|---|---|---|
| **A** | E-mail via GitHub Actions | 🟢 R$ 0 | Um operador, alerta não urgente |
| **B** | Telegram bot / webhook | 🟢 R$ 0 | Notificação no celular, teste em 10 min |
| **C** | PagerDuty / Opsgenie free tier | 🟢 R$ 0 no free | Escalonamento, on-call, histórico |
| **D** | Só dashboard | 🟢 R$ 0 | ❌ Não fecha a issue — "alertas" exigem notificação |

**5.2 O health check toca o banco?**

| | Opção | Trade-off |
|---|---|---|
| **A** | Só processo (200 se o servidor está de pé) | Não detecta banco fora — o pior cenário |
| **B** | Processo + `SELECT 1` com timeout curto | Carga ínfima, cobre a falha que importa ✅ |
| **C** | B + verificar migração aplicada | Detecta schema desatualizado |

**5.3 Limiar**

| | Opção |
|---|---|
| **A** | 3 falhas consecutivas em 5 min ✅ |
| **B** | 1 falha (mais rápido, mais falso positivo) |
| **C** | p95 > 2s por 10 min (degradação) |

**5.4 Responsável** — nome de **uma pessoa** (não "o time"): ________________

- **Custo:** 🟢 R$ 0 · **Esforço:** ⚡⚡
- **Recomendação: 5.1-B + 5.2-B + 5.3-A.**

**Escolhi: ____ · Data: ____**

---

## Decisão 6 — Modelo de identidade no dispositivo compartilhado (#48)

Esta é a decisão mais impactante na operação diária. Hoje existem logins genéricos `admin`, `cozinha`, `bar`, `caixa` com a mesma senha — **não é possível saber quem lançou um pagamento**.

| | Opção | Como funciona | Atrito na operação |
|---|---|---|---|
| **A** | Contas individuais para todos | Fim dos logins genéricos | 🔴 Alto — login a cada troca de turno em tablet compartilhado |
| **B** | Login do dispositivo + **PIN individual curto** | Cada um se identifica com PIN de 4–6 dígitos ao iniciar ação financeira; expira em N min | 🟡 Médio |
| **C** | **Híbrido** — conta individual para gerência, PIN para operação | Gerente com login; garçom/caixa com PIN | 🟢 Baixo |

**6.1 Escopo inicial** (quais operações exigem identidade)

| | Opção |
|---|---|
| **A** | Todas as listadas na issue |
| **B** | Só as financeiras |
| **C** | Financeiras + cancelamento, resto depois ✅ |

**6.2 Limite de desconto**

| | Opção |
|---|---|
| **A** | Desconto até X% livre; acima exige gerente ✅ (sugestão: X = 10%) |
| **B** | Todo desconto exige gerente |
| **C** | Sem limite, só registra quem fez |

**6.3 Gerente aprova como?**

| | Opção |
|---|---|
| **A** | PIN próprio do gerente no mesmo dispositivo ✅ |
| **B** | Aprovação em outra sessão/dispositivo |
| **C** | Não exige aprovação, só registra |

- **Custo:** 🟢 R$ 0 · **Esforço:** ⚡ (decidir); a implementação é ⚡⚡⚡
- **Recomendação: 6-C + 6.1-C + 6.2-A + 6.3-A.**
- **Pendente de #44:** por quanto tempo manter a trilha de auditoria. **Não decida isoladamente.**

**Escolhi: ____ · Data: ____**

---

## Decisão 7 — Escopo e recuperação do 2FA (#55)

O fluxo de troca de senha **já foi entregue**. Falta decidir o 2FA.

**7.1 Quem tem 2FA**

| | Opção | Risco residual |
|---|---|---|
| **A** | Só administradores ✅ | Caixa/gerente sem 2FA |
| **B** | Admins + quem fecha caixa / aplica desconto | Mais atrito no tablet |
| **C** | Todos | 🔴 Inviável em tablet de garçom — o time vai burlar |

**7.2 Método**

| | Opção | Observação |
|---|---|---|
| **A** | **TOTP** (app autenticador) ✅ | Grátis, offline, padrão da indústria |
| **B** | SMS | Vulnerável a SIM swap; custo por mensagem |
| **C** | E-mail com código | Fraco se for o mesmo e-mail do login |
| **D** | WebAuthn / passkey | Melhor segurança, maior complexidade |

**7.3 Custódia da seed TOTP**

| | Opção | Risco |
|---|---|---|
| **A** | Cifrada no banco, chave em env/KMS ✅ | Padrão; exige gestão da chave |
| **B** | Texto claro no banco | 🔴 Um dump do banco derrota o 2FA inteiro |
| **C** | Não persistir | ❌ Impossível — precisa comparar no login |

**7.4 Recuperação / break-glass** — sem isso, 2FA vira negação de acesso

| | Opção |
|---|---|
| **A** | 10 códigos de recuperação de uso único, hash no banco, exibidos uma vez ✅ |
| **B** | Segundo admin pode resetar (falha se só há um admin) |
| **C** | Procedimento CLI documentado no runbook ✅ (combinar com A) |
| **D** | Sem recuperação | 🔴 Perder o celular = perder o sistema |

- **Custo:** 🟢 R$ 0 · **Esforço:** ⚡ (decidir); implementação ⚡⚡
- **Recomendação: 7-A + 7.2-A + 7.3-A + 7.4 (A + C).**

**Escolhi: ____ · Data: ____**

---

## Consolidação — preencha e use para criar as sub-issues

| # | Decisão | Escolha | Issue | Vira tarefa de código? |
|---|---|---|---|---|
| 1 | Repositório canônico | | #45 | não |
| 2 | Licença | | #45 | não (criar arquivo) |
| 3 | Visibilidade | | #45 | não |
| 4 | Fonte das imagens demo | | #45 | não |
| 5 | Alerta: canal / banco / limiar / responsável | | #43 | sim (pequena) |
| 6 | Identidade: modelo / escopo / desconto / aprovação | | #48 | **sim (principal)** |
| 7 | 2FA: escopo / método / custódia / recuperação | | #55 | **sim** |

---

## O que a Fase 1 destrava

```
Decisão 1,2,3 ──► #45 fechável ──► pré-requisito do registro no INPI
Decisão 4 ──────► #45 (proveniência)
Decisão 5 ──────► #43 (implementação do alerta)
Decisão 6 ──────► #48 (implementação da autoria) ──┐
Decisão 7 ──────► #55 (implementação do 2FA)       ├──► depende de #44 p/ retenção
                                                    ┘
```

**Fora da Fase 1, por não serem decisões:** #41 (executar restore), #50 (obter prova de topologia), #53 (provisionar storage), #44 (exige jurídico).
