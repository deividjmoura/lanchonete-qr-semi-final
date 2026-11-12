# Auditoria inicial — issue #313: atendimento colaborativo sem mesa fixa

> Documento de trabalho. Esta auditoria é parcial e não representa a implementação concluída.

## Base da branch

- Branch: `feat/313-atendimento-colaborativo-sem-mesa-fixa`
- Base inicial: `main` no commit `9c64d00aa535dcb830573e852a5b0e828f2d3631`
- A branch foi criada sem alterar `main`.

## Achados confirmados no código da main

### 1. Backend de atendimento — `db/atendimento.js`

A atribuição fixa participa de:
- `listarMesasGarcom`: retorna token QR apenas ao garçom titular e expõe responsável atual.
- `iniciarAtendimentoGarcom`: impede outro garçom de iniciar/usar sessão já atribuída e grava titular na sessão.
- `assumirMesa`: também bloqueia se a sessão tiver outro titular.
- `transferirMesa` e `transferirMesaAdmin`: implementam transferência de titularidade.
- `resumoPagamentoSessao`: restringe consulta de cobrança ao titular.
- `deixarMesa`: exige titularidade e exige transferência antes de liberar a mesa.
- `criarPedidoGarcom`: contém dependência de sessão atribuída para criar/recuperar pedidos e listar/editar pedidos por titular.

### 2. Pedidos — `db/pedidos.js`

- `criarPedido` para origem de atendimento exige `garcom_responsavel_id` na sessão.
- Edição/cancelamento de pedidos de garçom compara o titular da sessão com o garçom autenticado.
- A fila compartilhada de itens prontos já é independente do titular da mesa; essa regra deve continuar.
- Os registros de autoria por item (`aceito_por_id`, `retirado_por_id`, `entregue_por_id`) não devem ser removidos.

### 3. Entrega por item — `db/entregas.js`

- Ao aceitar/retirar/entregar, o primeiro garçom ainda passa a ser titular da mesa.
- O fluxo já distingue autoria da etapa do pedido e titularidade da mesa. A implementação deve remover apenas a segunda.
- A autoria e os eventos por item devem permanecer intactos.

### 4. Gestão de garçons — `db/garcons.js`

- A remoção/desativação de um garçom verifica mesas abertas sob sua titularidade.
- Após remover a titularidade operacional, a remoção/desativação deve continuar protegendo entregas/itens pendentes e histórico, mas não pode depender de mesa atribuída.

### 5. Interface PWA — `public/garcom-pwa/app.js`

Foram encontrados fluxos que:
- tratam sessão de outro garçom como conflito de colaboração;
- restringem exibição do QR da mesa ao titular;
- mostram status e instruções de “responsável atual”;
- filtram mesas e cobrança pelas mesas do titular;
- oferecem transferência e liberação de responsabilidade.

A interface deverá ser simplificada para colaboração por equipe, sem remover identificação do garçom autenticado nem os atores de cada item.

### 6. Interface administrativa

- `src/screens/admin/MesaDetalheModal.tsx` apresenta a ação “Transferir responsabilidade”.
- Necessário localizar e revisar também telas de panorama, mesas e eventuais componentes legados antes de remover controles.

### 7. Documentação e testes

- `docs/CONTRATO-ATENDIMENTO-GARCOM.md` descreve explicitamente a titularidade da mesa e transferência.
- `tests/garcom-responsavel-mesa.test.cjs` valida comportamento antigo de transferência e atribuição automática; deverá ser refeito para validar colaboração.
- Outros testes relevantes identificados: `tests/garcom-operacao-integrada.test.cjs`, `tests/garcom-situacoes.test.cjs`, `tests/postgres-garcom-servico.test.cjs`, `tests/postgres-waiter-integration.test.cjs`, `tests/postgres-entregas-progressivas.test.cjs`, `tests/pwa-garcom-operacao.test.cjs` e testes de dashboard/mesas.

## Direção de implementação

1. Remover titularidade como pré-requisito para abrir/usar sessão, lançar e editar pedidos, consultar cobrança e executar operações autorizadas.
2. Manter autenticação de cada garçom e autorização por função/ação.
3. Manter trilha individual por item/evento: quem lançou, preparou, aceitou, retirou, entregou, cancelou ou registrou pagamento.
4. Tornar o token QR acessível pelo fluxo autorizado da equipe, sem depender de titularidade. Não expor tokens a usuários não autenticados nem alterar o modelo de segurança do QR público sem revisão.
5. Remover ou desativar transferência/liberação de titularidade como conceito operacional; preservar registros históricos legados.
6. Revisar relatórios para não interpretar o antigo titular como responsável por todo o atendimento.
7. Atualizar contrato/documentação e substituir testes de titularidade por testes de colaboração.

## Cuidados e validações ainda pendentes

- A árvore do banco contém migrations legadas de atendimento/garçons e colunas históricas de titularidade. Não há remoção de coluna planejada nesta etapa.
- Confirmar todas as rotas administrativas e de pagamento, além dos componentes de UI ainda não inspecionados.
- Executar testes unitários, integração PostgreSQL, PWA/E2E e typecheck/build em ambiente de execução antes de afirmar aprovação.
- Não fazer merge nem deploy. Nenhuma alteração foi feita em `main`.
