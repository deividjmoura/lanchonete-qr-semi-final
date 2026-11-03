<div align="center">

# QR Admin

**Pedidos, atendimento e operação de lanchonetes em um só fluxo.**

Do QR Code à cozinha, do atendimento à cobrança: cada etapa conectada para a equipe trabalhar com mais clareza e o cliente acompanhar seu pedido.

[**Acessar o QR Admin**](https://qradminn.up.railway.app/) · [**Conhecer o guia interativo**](https://qradminn.up.railway.app/guia-sistema.html)

[Política de Privacidade](https://qradminn.up.railway.app/politica-de-privacidade.html) · [Termos de Serviço](https://qradminn.up.railway.app/termos-de-servico.html)

</div>

---

## O que é o QR Admin?

O QR Admin é um sistema de operação para um único estabelecimento. Ele reúne em uma experiência integrada o pedido feito pelo cliente, a produção na cozinha e no bar, o atendimento do garçom, o caixa e a administração.

A proposta é simples: **um pedido não deve se perder entre telas, setores ou pessoas**. Cada item acompanha seu próprio andamento, com informações de responsabilidade e horário, até chegar ao cliente e ser considerado na cobrança.

## Conheça a experiência

### 1. Cliente: peça pelo QR Code

O cliente aponta a câmera para o QR Code da mesa e acessa o cardápio pelo navegador.

- Navega pelas categorias e pesquisa produtos.
- Consulta descrições, preços e disponibilidade.
- Escolhe adicionais e opções disponíveis.
- Monta o carrinho e envia o pedido para a mesa.
- Acompanha o andamento do pedido.

Não é necessário instalar um aplicativo para fazer o pedido.

### 2. Cozinha e bar: produção organizada

Cozinha e bar trabalham com filas próprias, cada uma recebendo os itens destinados ao seu setor.

- Visualização dos itens aguardando preparo e em produção.
- Início e conclusão do preparo por item.
- Atualização do andamento sem depender da conclusão do outro setor.
- Alertas sonoros e atualizações em tempo real em telas compatíveis.

Uma bebida pronta pode seguir para entrega mesmo que a comida ainda esteja sendo preparada.

### 3. Garçom: atendimento em movimento

A área do garçom foi pensada para uso móvel, com uma PWA que pode ser instalada no aparelho.

- Consulta mesas, comandas e itens prontos.
- Aceita, retira e entrega itens individualmente.
- Registra quem realizou cada transição e quando.
- Permite transferência explícita de responsabilidade.
- Pode lançar pedidos e participar da cobrança conforme as permissões.
- Mantém uma fila local de pedidos quando a conexão cai e tenta sincronizá-la quando retorna.

A fila offline é persistente e utiliza proteção contra duplicidade. Pedidos pendentes ou com conflito precisam ser confirmados pelo servidor antes de serem considerados concluídos.

### 4. Caixa: cobrança por consumo entregue

O caixa acompanha as comandas abertas e calcula o valor cobrável com base nos itens entregues.

- Registra pagamentos parciais em dinheiro, PIX, débito e crédito.
- Acompanha saldo restante e fechamento da comanda.
- Aplica descontos e taxa de serviço conforme as permissões.
- Registra cancelamentos com motivo.
- Emite comprovante de consumo.
- Libera a mesa após o fechamento sem pendências.

**Importante sobre o PIX:** o sistema utiliza chave/QR estático e registro manual. A equipe precisa conferir o recebimento diretamente no aplicativo bancário antes de marcar o valor como pago. O QR Admin não é um gateway bancário e não confirma transferências automaticamente.

### 5. Administração: visão completa da operação

O painel administrativo concentra a configuração e o acompanhamento do estabelecimento.

- **Dashboard:** indicadores de faturamento, pedidos, ticket médio, pagamentos, produtos, entregas, mesas e garçons.
- **Painel personalizável:** reorganize os cards por arraste, redimensione, oculte ou exiba indicadores e ajuste títulos e legendas.
- **Cardápio:** gerencie categorias, produtos, preços, fotos, disponibilidade, estoque, adicionais e setor de produção.
- **Mesas:** organize mesas e praças, gere QR Codes e acompanhe ocupação e consumo.
- **Garçons:** gerencie a equipe, os acessos individuais e a disponibilidade dos links.
- **Operação:** acompanhe responsabilidades, transferências, histórico e relatórios disponíveis.

O dashboard permite separar a leitura do movimento financeiro da visão operacional, mantendo as áreas de indicadores organizadas.

---

## Tecnologias e estrutura

O QR Admin utiliza **TypeScript** e **TSX** na interface React, com **JavaScript** no servidor Node.js e nas ferramentas de execução. O projeto também utiliza **HTML**, **CSS**, **JSON** e **SQL**, com **PostgreSQL** como banco de dados e **Vite** no processo de desenvolvimento e build.

O [guia interativo do sistema](https://qradminn.up.railway.app/guia-sistema.html) apresenta as áreas e os fluxos operacionais.

---

## Como o fluxo funciona

```text
       CLIENTE
    Lê o QR Code
         |
         v
   CARDÁPIO E PEDIDO
         |
         v
       COMANDA
         |
    +----+----+
    |         |
    v         v
  COZINHA    BAR
    |         |
    +----+----+
         |
         v
   ITEM PRONTO
         |
         v
      GARÇOM
  Aceitar / Retirar
      / Entregar
         |
         v
       CAIXA
  Cobrança e fechamento
         |
         v
    MESA LIBERADA
```

A comanda é acumulativa: novos pedidos podem ser adicionados durante o atendimento. Os itens avançam individualmente, e a cobrança considera somente o que foi entregue. Assim, a operação não precisa esperar que todos os itens de uma comanda estejam prontos para continuar.

---

## Linguagens e tecnologias

O sistema é uma aplicação única: um servidor de API em Node.js que também serve a interface, e a interface construída como SPA.

| Camada | Tecnologias |
|---|---|
| Interface (SPA) | **TypeScript** e **React** em arquivos **TSX**, compilados por **Vite** |
| Estilo | **CSS** com tokens de design e Tailwind CSS |
| Páginas e PWA | **HTML**, **JSON** (manifesto PWA) e JavaScript no PWA do garçom, com service worker para uso offline |
| API e regras de negócio | **JavaScript** (Node.js), sem framework HTTP |
| Banco de dados | **PostgreSQL**, com **SQL** versionado em migrations |
| Testes | `node:test` para regressão e integração; Playwright/Chromium para E2E |

As decisões de arquitetura e os runbooks operacionais ficam em
[`docs/engineering/`](docs/engineering/), e o
[**guia visual interativo**](https://qradminn.up.railway.app/guia-sistema.html)
apresenta cada área do sistema com uma demonstração navegável.

---

## Roadmap e progresso

<text>Atualizado em 03/11/2026. O status abaixo representa o que está integrado, o que está em validação e o que ainda depende de trabalho. Não é um percentual artificial de conclusão.</text>

### Etapa 1 · Fluxo principal de atendimento
<badge color="success">Implementado</badge>

- [x] Pedido por QR Code e cardápio digital.
- [x] Comanda acumulativa por mesa.
- [x] Filas independentes para cozinha e bar.
- [x] Produção e entrega progressiva por item.
- [x] Identificação de autoria e horários das ações.
- [x] Cobrança baseada nos itens entregues.
- [x] Pagamentos parciais e fechamento de comanda.

### Etapa 2 · Administração e experiência da equipe
<badge color="success">Funcionalidades principais implementadas</badge>

- [x] Dashboard com indicadores operacionais e financeiros.
- [x] Personalização, organização e redimensionamento dos cards.
- [x] Gestão de cardápio, mesas, praças e garçons.
- [x] Fluxos de atendimento e transferência de responsabilidade.
- [x] Controles de acesso e troca segura de senha.
- [ ] Evolução contínua de relatórios e auditoria operacional.

### Etapa 3 · Atendimento móvel e continuidade
<badge color="warning">Implementado, validação física pendente</badge>

- [x] PWA do garçom.
- [x] Fila offline persistente.
- [x] Sincronização posterior e proteção contra pedidos duplicados.
- [x] Tratamento de conflitos de preço, disponibilidade e estoque.
- [ ] Rodada completa de validação em aparelhos físicos Android e iOS.
- [ ] Notificações Web Push com o aplicativo fechado.

### Etapa 4 · Segurança e confiabilidade
<badge color="warning">Em evolução</badge>

- [x] Validação de permissões e regras críticas no servidor.
- [x] Proteções de sessão, CSRF e auditoria de ações relevantes.
- [x] Limites de requisições para operações sensíveis já preparados em PR com checks verdes.
- [ ] Integrar a proteção de mutações públicas de mesa após revisão final da PR #196.
- [ ] Evoluir a política de Content Security Policy (CSP) e proteção de tokens.
- [ ] Confirmar alertas, backup e restauração real em ambiente isolado.

### Etapa 5 · Preparação operacional e publicação
<badge color="warning">Validação pendente</badge>

- [x] Páginas públicas de Política de Privacidade e Termos de Serviço adicionadas à versão principal do projeto.
- [ ] Confirmar que as páginas legais estão publicadas e acessíveis no endereço de produção.
- [ ] Validar o processo real de backup e restauração.
- [ ] Confirmar monitoramento, alertas e procedimento de recuperação.
- [ ] Completar a validação operacional dos fluxos críticos após as atualizações de produção.

### Fora do escopo atual

- **Multi-loja / multi-tenant:** o QR Admin representa um estabelecimento por instalação.
- **Gateway PIX e confirmação bancária automática:** não fazem parte da versão atual.
- **Comprovante fiscal:** o documento emitido é um comprovante de consumo, não uma nota fiscal.

---

## Acesso e informações

<box>
  <row align="center" gap={2}>
    <icon name="globe" size="lg"/>
    **Sistema QR Admin**
  </row>
  [qradminn.up.railway.app](https://qradminn.up.railway.app/)
  <divider color="subtle"/>
  <row align="center" gap={2}>
    <icon name="book-open" size="lg"/>
    **Guia visual interativo**
  </row>
  [Explorar as áreas e funcionalidades](https://qradminn.up.railway.app/guia-sistema.html)
  <divider color="subtle"/>
  <row align="center" gap={2}>
    <icon name="shield-check" size="lg"/>
    **Privacidade e condições de uso**
  </row>
  [Política de Privacidade](https://qradminn.up.railway.app/politica-de-privacidade.html) · [Termos de Serviço](https://qradminn.up.railway.app/termos-de-servico.html)
</box>

<div align="center">

**QR Admin**  
*Mais clareza para a equipe. Mais acompanhamento para o cliente. Mais controle para a operação.*

</div>
