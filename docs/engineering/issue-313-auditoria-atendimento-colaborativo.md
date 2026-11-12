# Auditoria inicial — issue #313: atendimento colaborativo sem mesa fixa

> Documento de trabalho. Esta auditoria é parcial e não representa a implementação concluída.

## Base da branch

- Branch: `feat/313-atendimento-colaborativo-sem-mesa-fixa`
- Base inicial: `main` no commit `9c64d00aa535dcb830573e852a5b0e828f2d3631`
- A branch foi criada sem alterar `main`.

## Achados da auditoria inicial (antes da implementação)

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

## Direção definida para a implementação

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


## Implementação em andamento — 12/11/2026

- Backend de abertura/acesso à sessão: removida a gravação de titularidade ao iniciar atendimento; a sessão aberta passa a ser compartilhável. O token QR é retornado ao garçom autenticado/ativo, sem depender de titularidade.
- Pedidos: a criação e a edição no fluxo de garçom não exigem mais que o usuário seja o titular da sessão.
- Entregas: removida a atribuição automática da mesa durante aceite/retirada/entrega; cada transição continua chamando `gravarStatusItem` com o ator autenticado.
- Colaboração por item: fila e validações de retirada/entrega permitem que outro garçom autorizado avance itens; a autoria de cada etapa continua gravada em `aceito_por_id`, `retirado_por_id` e `entregue_por_id`.
- PWA: atualizado a partir da versão atual da `main` (incluindo as mudanças recentes do salão) e removidos os bloqueios visuais/operacionais que exigiam titular da mesa; cobrança e lista de sessões consideram qualquer atendimento aberto.
- Gestão de garçons: desativação/remoção não é mais bloqueada apenas por mesa aberta atribuída; itens pendentes continuam protegidos.

### Pendências antes da PR

- Remover a ação e as rotas antigas de transferência de titularidade, inclusive na administração.
- Revisar métricas/relatórios que ainda interpretam o responsável legado como responsável financeiro da sessão; manter os registros antigos apenas como histórico.
- Atualizar os testes antigos de transferência/titularidade para os cenários colaborativos A abre, B lança, C retira/entrega e conferir autoria individual.
- Atualizar contrato/documentação e executar a suíte automatizada, typecheck e build em ambiente de execução.
- A branch ainda está 2 commits atrás da `main`; as mudanças mais recentes do PWA foram preservadas ao atualizar o arquivo a partir da versão atual da `main`, mas a reconciliação completa da base permanece pendente.

Nenhum teste foi declarado como executado nesta etapa. Nenhuma alteração foi feita na `main`; sem merge ou deploy.


## Ajustes adicionais do PWA — 12/11/2026

- Removido o botão redundante **Novo pedido** do cabeçalho da tela Mesas, junto com seu listener. A criação de pedido continua pelo detalhe da mesa, evitando duas entradas para a mesma ação.
- Grade do salão alterada para **quatro mesas por linha em telas de celular**, com cartões compactos e número/estado preservados; em telas largas, a grade pode usar cinco colunas.
- Teste E2E atualizado para verificar quatro colunas em viewports móveis e a ausência do atalho removido. A suíte ainda precisa ser executada.


## Estado atualizado da implementação — 12/11/2026

### Concluído na branch

- Abertura/acesso à sessão sem gravar garçom titular; sessões abertas podem ser acessadas por qualquer garçom ativo.
- Token QR da mesa disponível a todos os garçons autenticados e ativos.
- Removidos os métodos e endpoints operacionais de transferência e liberação de mesa.
- PWA atualizado: sem botão/modal de transferência ou “Deixar mesa”, sem rótulo de responsável fixo e sem consulta de lista de garçons para transferir.
- Comanda do cliente e modal de mesas ocupadas não exibem um único garçom como responsável pela mesa.
- Criação/edição de pedido, fila, retirada, entrega e cobrança não dependem de titularidade da sessão.
- Entrega não atualiza mais um garçom titular no pedido inteiro; cada etapa permanece registrada nos campos de autoria do item.
- Desativação/remoção de garçom não é bloqueada por mesa aberta ou item pendente; outro garçom ativo pode continuar o atendimento. Os IDs históricos permanecem preservados.
- Indicadores administrativos foram ajustados para mostrar pedidos registrados, pedidos com entrega, itens aceitos/retirados/entregues e valor dos itens entregues. Taxa e descontos da conta não são rateados por titularidade.
- Atualizados contrato, guia do PWA, modal do dashboard e testes relacionados. Cache do Service Worker avançou para `garcom-pwa-shell-v45`.

### Validação ainda pendente

- Executar a suíte Node, os testes de integração PostgreSQL, typecheck e build. O clone local não foi possível nesta sessão porque o ambiente não conseguiu resolver `github.com`; portanto, nenhum teste foi declarado como executado.
- Revisar os resultados da CI em uma PR antes de considerar a entrega pronta.
- Verificar eventuais usos remanescentes de campos legados fora do fluxo operacional. Colunas e registros antigos não foram removidos nem migrados destrutivamente.

A branch continua isolada. Não houve alteração na `main`, merge ou deploy.
