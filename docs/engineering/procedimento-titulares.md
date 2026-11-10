# Procedimento de atendimento a titulares de dados

**Escopo:** como o QR Admin responde a pedidos de acesso, correção, oposição,
anonimização e eliminação feitos por clientes ou funcionários do
estabelecimento.
**Aprovado por:** responsável pelo tratamento, em 05/11/2026.
**Canal indicado para contato:** `servicosdegestaoqradmin@gmail.com` (confirmar monitoramento e prazo de resposta antes da publicação) (assunto "Privacidade no
QR Admin"). O monitoramento e o prazo operacional de resposta devem ser confirmados antes da publicação.
**Base documental:** `docs/engineering/data-policy-proposal.md` (§3.1 e §6) e
seções 6, 8 e 13 de `public/politica-de-privacidade.html`.

## 1. Quem faz o quê

| Papel | Responsabilidade |
|---|---|
| Estabelecimento (controlador) | Decide sobre os dados de pedidos, clientes e equipe da sua operação; recebe o titular no balcão/WhatsApp e é o primeiro destinatário do pedido. |
| Fornecedor do software (operador técnico) | Recebe pedidos pelo canal oficial, localiza os registros, orienta o estabelecimento e executa a operação técnica quando instruído por escrito. |
| Administrador da instalação | Executa as ações no painel (anonimização de histórico, remoção de e-mail Google, redefinição de senha) e registra a execução. |

Nenhum pedido é atendido por telefone ou mensagem informal sem registro: o
canal é o e-mail acima, para que exista data, texto e protocolo.

## 2. Registro (sem duplicar dado pessoal)

Manter uma planilha ou arquivo `solicitacoes-privacidade` com **apenas**:

| Campo | Exemplo |
|---|---|
| Protocolo | `2026-11-05-01` |
| Data de recebimento | `05/11/2026` |
| Canal | `e-mail` / `balcão` |
| Tipo de pedido | `acesso` / `correção` / `eliminação` / `informação sobre compartilhamento` |
| Identificação mínima do titular | protocolo interno — **não** copiar nome, telefone ou observação |
| Ação executada | `consulta somente leitura`, `anonimização`, `resposta sem alteração` |
| Data e responsável pela resposta | `12/11/2026 — Deivid` |

O registro **não** pode conter nome completo, telefone, e-mail, conteúdo de
observação de pedido ou qualquer trecho copiado do banco. Se for necessário
referenciar um registro do banco, usar o identificador interno da sessão ou do
pedido.

## 3. Passos

1. **Acusar recebimento após a confirmação de que o canal está monitorado**, informando protocolo; não assumir prazo fixo até aprovação do responsável.
2. **Confirmar a identidade** com informação que só o titular tem (por exemplo,
   número da mesa, data e valor aproximado do consumo, ou o e-mail cadastrado
   para a conta de funcionário). Não pedir documentos além do necessário.
3. **Localizar com consulta somente leitura** — `SELECT` nas tabelas
   `mesa_sessoes`, `pedidos`, `itens_pedido`, `sessao_pagamentos` e
   `pix_avisos` filtrando por data/mesa, sem exportar planilha para fora do
   servidor.
4. **Avaliar vínculos antes de apagar.** Registros financeiros e comprovantes
   são preservados por até 5 anos e a trilha de auditoria por até 24 meses
   (ver §3.1 da proposta). Onde houver obrigação de guarda, a resposta é
   "dado conservado por obrigação legal", não "dado apagado".
5. **Executar a menor ação que atende o pedido**:
   - dados pessoais do cliente em contas fechadas → anonimização pelo painel
     (`Limpar` → `Ver prévia` → `Anonimizar`), com a data de corte correta;
   - dados de funcionário → desvincular e-mail Google, redefinir senha e
     desativar o garçom (ver `docs/engineering/ciclo-de-vida-contas-staff.md`);
   - dado incorreto → correção no cadastro correspondente.
6. **Responder por escrito** o que foi encontrado, o que foi feito e o que não
   foi possível fazer, com o motivo.
7. **Fechar o protocolo** na planilha, com data e responsável.

## 4. Prazos

| Etapa | Prazo |
|---|---|
| Acuse de recebimento | 2 dias úteis |
| Resposta ao titular | prazo a confirmar pelo controlador após validação jurídica |
| Reavaliação de pedido recusado | prazo a confirmar pelo controlador após validação jurídica |

Se o prazo não puder ser cumprido, o titular é informado antes do vencimento,
com a nova data e o motivo.

## 5. O que não fazer

- **Não prometer exclusão imediata** quando existir registro financeiro,
  comprovante ou trilha de auditoria vinculado.
- **Não apagar nem alterar valores, formas de pagamento ou datas** — a
  anonimização do painel preserva esse conjunto por decisão registrada na
  issue #44 (PR #265).
- **Não rodar a anonimização sem prévia** (`Ver prévia` é obrigatório antes de
  `Anonimizar`) nem com data de corte "de hoje" por conveniência.
- **Não copiar o dado pessoal** para a planilha de protocolos, para o chat da
  equipe ou para prints.
- **Não atender pedido de terceiro** sem vínculo comprovado com o titular.

## 6. Pendências conhecidas

- O registro é manual (planilha); não existe fila de solicitações no sistema.
- O texto público e este procedimento não prometem prazo fixo de acuse ou resposta enquanto o monitoramento do novo canal não for confirmado pelo responsável.
- O enquadramento do MEI para os serviços prestados e a validação dos prazos
  seguem dependendo de confirmação contábil/jurídica.
