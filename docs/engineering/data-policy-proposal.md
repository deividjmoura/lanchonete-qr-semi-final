# Proposta de política de dados pessoais e retenção

**Issue relacionada:** [#44](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/44).
**Base:** complementa o RFC [`data-retention-rfc.md`](./data-retention-rfc.md), que inventaria os
dados e o comportamento do purge. Este documento propõe prazos e procedimentos
para **aprovação do responsável**; nada aqui está em vigor sem essa decisão e
sem validação jurídica/contábil. Não é parecer jurídico.

## 1. Dados pessoais identificados

| Dado | Onde aparece | Finalidade | Quem acessa |
|---|---|---|---|
| Nome do cliente (campo livre) | `mesa_sessoes.cliente_nome`, `pedidos.cliente_nome`, `pix_avisos.cliente_nome` | Identificar a comanda no salão e na cozinha | Staff autenticado (cozinha/bar/caixa/admin), cliente da própria mesa via token |
| Observação geral do pedido | `pedidos.observacao_geral` (texto livre) | Instruções de preparo; pode conter dado pessoal | Staff de operação |
| Nome dos funcionários | `staff.nome`, `garcons.nome`, `auditoria_eventos.ator_nome` | Autoria, auditoria e atendimento | Staff autenticado |
| Credenciais | `staff.senha_hash` (scrypt), `staff_sessoes`, tokens de mesa/garçom | Autenticação e autorização | Apenas o processo; nunca expostos em log |
| Dados financeiros | `sessao_pagamentos` (valor, forma, operador, PIX) | Conciliação e comprovantes | Caixa/admin |

Não coletamos CPF, e-mail, telefone nem endereço do cliente no fluxo de mesa.
A chave PIX é configuração do estabelecimento (`PIX_CHAVE`), não dado de
cliente. O nome do cliente é voluntário e informado no próprio pedido.

## 2. Matriz de retenção proposta (aguarda decisão)

| Classe de registro | Prazo proposto | Justificativa | Destino final |
|---|---|---|---|
| Sessões fechadas, pedidos, itens e pagamentos (conjunto consistente) | **5 anos** contados do fechamento | Conciliação, disputas e obrigações fiscais/contábeis típicas de um pequeno restaurante; confirmar com contador | Purge transacional (`db/purge.js`), após backup |
| `cliente_nome` e observações livres | **Anonimização após 90 dias** do fechamento (virar `null`/texto genérico), mantendo os registros financeiros | Minimização: o nome não tem uso operacional depois do atendimento | Job de anonimização separado do purge financeiro (a implementar após aprovação) |
| `auditoria_eventos` e `staff_credencial_eventos` | **2 anos** | Investigação de incidentes e autoria; sem segredos no conteúdo | Purge próprio por `criado_em` |
| `mesa_atendimento_historico` | Acompanhar a vida da sessão; após o purge da sessão, anonimizar IDs | Rastrear transferências durante a operação | Cascatear com o purge da sessão |
| `staff_sessoes` (sessões de login) | **30 dias** após revogação/expiração | Segurança e suporte a login | Purge próprio |
| `pix_avisos` resolvidos | Seguir a sessão (mesmo prazo financeiro) | Prova de aviso de pagamento | Conjunto da sessão |
| Logs da aplicação/proxy | **30 a 90 dias**, conforme o plano do Railway/provedor | Diagnóstico e segurança | Retenção no provedor; redigidos na origem |

Os prazos são uma proposta inicial. O responsável, apoiado por contador e
assessoria jurídica se aplicável, deve confirmar cada prazo, a base legal de
tratamento e os direitos dos titulares antes de qualquer automação.

## 3. Controles de acesso e exclusão

- O purge continua **manual e dry-run por padrão** (`POST /api/admin/historico/purge`
  exige papel `admin`; sem `confirm:true` apenas conta o que seria removido).
- Toda exclusão definitiva deve: ter backup restaurável, sair de dry-run
  revisado por um segundo par de olhos, rodar em transação e registrar
  data de corte, contagens e aprovador em registro interno aprovado.
- Sessões abertas nunca são elegíveis (o `WHERE status='fechada'` é fixo).
- A nova trilha `auditoria_eventos` (issue #48) não grava senha, hash, token,
  chave PIX nem conteúdo livre do cliente; o purge da trilha tem prazo próprio.

## 4. Atendimento a solicitações de titulares

Como não há cadastro de clientes (o dado é um nome livre vinculado à mesa), o
procedimento proposto é:

1. Receber a solicitação e registrar data e canal.
2. Localizar ocorrências do nome em `cliente_nome`/observações do período
   informado, usando consulta somente leitura.
3. Se a sessão ainda estiver aberta, avisar que o dado deixa de ser necessário
   ao fechar a conta; se fechada e dentro do prazo financeiro, anonimizar o
   nome preservando os registros contábeis; se fora do prazo, acelerar o purge.
4. Responder com o que foi feito, sem expor dados de terceiros.
5. Guardar o registro da solicitação e da resposta (sem copiar o dado pessoal).

## 5. Decisões que o responsável precisa registrar

- [ ] Aprovar ou ajustar cada prazo da matriz (seção 2).
- [ ] Confirmar a base legal aplicável e se existe obrigação fiscal que
      sustenta os 5 anos do conjunto financeiro.
- [ ] Aprovar a anonimização de nomes aos 90 dias e autorizar a abertura de
      issue para implementar o job de anonimização (não implementado ainda).
- [ ] Definir quem pode autorizar purge e quem revisa o dry-run.
- [ ] Confirmar a retenção de logs no Railway e o acesso ao painel.
- [ ] Definir retenção/descarte das fotos do cardápio quando um produto sai do
      cardápio (relacionado à issue #53).

Enquanto essas decisões não forem registradas, nenhum purge automático deve ser
habilitado; o sistema segue sem exclusão automática, que é o estado mais seguro.
