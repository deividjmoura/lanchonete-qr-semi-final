# Inventário de dados pessoais — base para a política de retenção (issue #44)

**Status:** inventário técnico concluído. **As decisões de base legal e prazo NÃO estão tomadas aqui** — exigem validação jurídica, conforme o critério 3 da issue.
**Data:** 05/11/2026 · verificado contra `main` = `ef1f81f`
**Responsável técnico pelo inventário:** a preencher

> Este documento cumpre o **critério 1** de #44 ("inventariar campos pessoais e onde são armazenados, usados, exibidos, logados e exportados"). Ele não cumpre os critérios 2–4, que dependem de decisão de negócio/jurídica.

---

## 1. Resumo executivo

| Constatação | Impacto |
|---|---|
| **Não há tabela dedicada de clientes.** A identificação do cliente é o campo `cliente_nome` (texto livre), replicado em 3 tabelas. | Não existe cadastro de titular para atender pedido de exclusão. A busca por titular só funciona por nome literal. |
| **Não há coleta de CPF, e-mail, telefone ou endereço de cliente.** | Superfície de PII muito menor que o habitual. |
| **O IP do cliente NÃO é persistido.** `security/client-ip.js` usa o IP apenas em memória, como chave de rate limit. | Exposição reduzida; não há log de acesso com IP em banco. |
| **PII de funcionários existe:** nome, login e **e-mail** em `staff`. | Base legal e prazo diferentes dos dados de cliente. |
| **`purge.js` apaga registros de pagamento.** | ⚠️ Conflito direto com obrigação fiscal de 5 anos — ver seção 6. |
| Campos `observacao` e `observacao_geral` são **texto livre**. | Podem conter PII não estruturada que nenhum filtro alcança. |

---

## 2. Categorias de dado e onde vivem

### 2.1 Dados de cliente (titular consumidor)

| Campo | Tabela | Origem | Persistido | Exibido | Exportado |
|---|---|---|---|---|---|
| `cliente_nome` | `mesa_sessoes` | digitado pelo cliente no QR / pelo garçom | sim | caixa, relatório | sim (`db/relatorio.js`) |
| `cliente_nome` | `pedidos` | idem | sim | caixa | sim |
| `cliente_nome` | `pix_avisos` | idem, no aviso de PIX | sim | caixa | sim |
| `observacao_geral` | `pedidos` | texto livre do cliente | sim | cozinha, caixa | sim |
| `observacao` | `itens_pedido` | texto livre por item | sim | cozinha | sim |
| `observacao` | `itens_pedido_remocoes` / `..._adicionais` | texto livre | sim | cozinha | — |

**Ponto crítico:** `observacao` e `observacao_geral` são campos livres. Não há validação de conteúdo. Um cliente pode digitar nome completo, telefone ou qualquer dado ali, e isso passa por todos os filtros estruturais.

### 2.2 Dados de funcionários (titular empregado/operador)

| Campo | Tabela | Observação |
|---|---|---|
| `nome` | `staff`, `garcons` | nome do operador |
| `login` | `staff` | identificador de acesso |
| `email` | `staff` | adicionado em `0034_staff_google_oauth.sql`, para login Google |
| `senha_hash` | `staff` | **não é PII em si**, mas é dado sensível de autenticação — nunca exportar |
| `token` | `staff_sessoes`, `sse_tickets` | token de sessão (hash desde `0035`) |

### 2.3 Dados financeiros

| Campo | Tabela | Natureza |
|---|---|---|
| `valor`, `forma_pagamento`, `criado_em` | `sessao_pagamentos` | registro transacional |
| `valor`, `status`, `confirmado_em` | `pix_avisos` | registro transacional |
| `valor_total`, `forma_pagamento` | `mesa_sessoes` | consolidado |

**Não há dado de cartão, chave PIX do cliente ou dado bancário persistido.** O PIX é confirmado manualmente pelo operador (`pix_confirmado`); o sistema registra apenas o aviso e o valor.

### 2.4 Trilha de auditoria

| Campo | Tabela | Observação |
|---|---|---|
| `ator_nome` | `auditoria_eventos` | **nome do funcionário**, não do cliente |
| `contexto` (JSONB) | `auditoria_eventos` | validado por `db/auditoria.js`, que rejeita segredos |
| `request_id` | `auditoria_eventos` | correlação, não PII |

A migração `0025_auditoria_eventos.sql` já documenta a regra: *"NUNCA gravar senha, hash, token bearer, segredo PIX nem dados pessoais sensíveis."* **Verificado:** as ações registradas (21 identificadas) não incluem conteúdo de cliente.

---

## 3. Onde NÃO há PII (verificado)

| Suspeita | Resultado da verificação |
|---|---|
| IP do cliente em banco | ❌ **Não persistido.** Só em memória para rate limit |
| Logs de servidor com PII | ✅ Não encontrado. Única ocorrência de `console.log` com `nome` é `db/seed.js:195` (dado de seed, não de produção) |
| Token de sessão em texto claro | ✅ Corrigido — `0035_staff_session_token_hash.sql` |
| Senha em log | ✅ Não encontrado |
| Cookies de rastreamento / analytics no código do produto | ❌ Não encontrado |
| Foto de cliente / biometria | ❌ Não existe |

---

## 4. Fluxo de exibição e exportação

| Caminho | O que expõe | Para quem |
|---|---|---|
| `db/caixa.js` | `cliente_nome` de sessões, pedidos e avisos PIX | staff autenticado (caixa) |
| `db/relatorio.js` (`cliente: s.cliente_nome`) | nome do cliente em relatório consolidado | admin |
| Tela de cozinha | `observacao` e `observacao_geral` | staff (cozinha) |
| `db/cardapio.js` | **nenhum dado de cliente** | público |

Não foi localizada exportação para CSV/planilha nem integração externa de PII.

---

## 5. Perguntas para o responsável jurídico/negócio

Estas são as perguntas que o código **não pode responder** — o critério 3 de #44 proíbe inventar base legal:

1. **Base legal para `cliente_nome`:** execução de contrato (art. 7, V) é suficiente, ou é necessário legítimo interesse com LIA documentado?
2. **`observacao` em texto livre:** é dado pessoal por natureza imprevisível. Tratar como PII sempre, ou aplicar orientação de uso na interface?
3. **Prazo de retenção do nome do cliente:** pode ser apagado após o fechamento da sessão + N dias, ou precisa sobreviver junto do registro fiscal?
4. **Registro de pagamento:** qual o prazo mínimo legal aplicável (5 anos fiscais?) e isso permite apagar o vínculo com o nome do cliente antes?
5. **Dados de funcionário:** `email` e `nome` em `staff` — base legal é execução de contrato de trabalho; qual prazo após desligamento?
6. **Trilha de auditoria (`auditoria_eventos`):** por quanto tempo manter, e quem pode consultar? (mesma pergunta de #48)
7. **Pedido de exclusão de titular:** qual o procedimento e o prazo de resposta? Como localizar o titular, se não há cadastro?

---

## 6. ⚠️ Conflito identificado entre `purge.js` e retenção fiscal

**Este é o achado mais importante do inventário.**

`db/purge.js` executa, nesta ordem:

```
DELETE FROM itens_pedido_adicionais
DELETE FROM itens_pedido_remocoes
DELETE FROM itens_pedido
DELETE FROM pedidos
DELETE FROM sessao_pagamentos      <-- registro financeiro
DELETE FROM mesa_sessoes
```

`sessao_pagamentos` é o **registro de pagamento**. Apagar isso destrói a evidência contábil/fiscal que a Receita pode exigir por até 5 anos.

**Consequência para a decisão de #44:** não é possível tratar "todos os dados de pedido" como uma categoria única. É preciso **separar**:

| Categoria | Pode ser purgada? | Prazo provável |
|---|---|---|
| Detalhe operacional do pedido (itens, observações, nome do cliente) | ✅ sim, após o prazo de reclamação | 6–12 meses |
| Registro financeiro (`sessao_pagamentos`, `valor_total`) | ❌ **não antes do prazo fiscal** | 5 anos |
| Trilha de auditoria (`auditoria_eventos`) | ⚠️ depende de #48 e de decisão de retenção | a definir |

**Recomendação técnica:** antes de qualquer purge automático, ajustar `purge.js` para **anonimizar** o registro financeiro (remover `cliente_nome`, preservar `valor`/`forma`/`data`) em vez de deletá-lo. Isso satisfaz a minimização da LGPD sem violar a retenção fiscal.

---

## 7. Próximos passos

| # | Ação | Depende de |
|---|---|---|
| 1 | Responder as 7 perguntas da seção 5 | jurídico/contador |
| 2 | Registrar a política em documento versionado | resposta 1 |
| 3 | Ajustar `purge.js` para anonimizar financeiro em vez de deletar | aprovação da política |
| 4 | Definir procedimento de atendimento ao titular | resposta 7 |
| 5 | Só então implementar purge agendado, com dry-run e proteção de sessão aberta | 3 e 4 |

**Restrição de #44 (respeitar):** não executar exclusão em produção como parte desta issue. Qualquer teste de purge usa banco descartável.
