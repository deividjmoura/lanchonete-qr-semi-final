<div align="center">

# QR Admin

**Sistema de pedidos e operação por QR Code para um único estabelecimento**

Pedido por QR Code, produção por setor, entrega progressiva, cobrança e gestão administrativa em um fluxo único.

[![Produção](https://img.shields.io/badge/Deploy-Railway-7B61FF?style=for-the-badge)](https://qradminn.up.railway.app/)

**[Abrir o guia visual interativo do sistema](public/guia-sistema.html)** · [Documentação técnica](#documentação-técnica)

</div>

---

## 1. Visão geral

O QR Admin é uma aplicação *single-tenant*: uma instalação representa um único estabelecimento. O sistema conecta cliente, cozinha, bar, garçom, caixa e administração.

### Limites da versão atual
- Não é um SaaS multi-loja. Não há isolamento de dados entre vários estabelecimentos.
- Não existe gateway bancário nem confirmação automática de recebimento PIX.
- O QR PIX é estático/configurado por chave. A equipe precisa conferir o recebimento no aplicativo bancário.
- O comprovante emitido é de consumo, não fiscal.
- Notificações Web Push com o aplicativo fechado ainda não estão implementadas.
- A PWA precisa de validação adicional em aparelhos físicos Android e iOS.

## 2. Fluxo operacional

    Cliente escaneia o QR da mesa (ou garçom lança o pedido)
                         |
                         v
                Cardápio -> Carrinho -> Comanda
                         |
               +---------+---------+
               |                   |
               v                   v
            COZINHA               BAR
          itens de comida     itens de bebida
               |                   |
               +---------+---------+
                         v
             Item fica pronto individualmente
                         |
                         v
          Garçom: aceitar -> retirar -> entregar
                         |
                         v
          Caixa cobra itens entregues e fecha

A comanda é acumulativa: a mesa pode receber vários pedidos durante a visita. Cada item possui estado, autoria e horários próprios. Um item pronto pode ser entregue sem esperar os outros itens do pedido. O status geral do pedido é uma projeção dos estados dos itens.

**Regra de cobrança:** o servidor calcula o valor cobrável a partir dos itens entregues. Itens apenas recebidos ou em preparo não entram na cobrança.

## 3. Funcionalidades por área

### Cliente · cardápio pelo QR
- Acessa o cardápio pelo navegador, sem instalar aplicativo.
- Pesquisa produtos e visualiza descrição, preço e disponibilidade.
- Escolhe adicionais e removíveis permitidos pelo produto.
- Monta o carrinho, informa o nome e envia o pedido para a comanda da mesa.
- Acompanha o andamento do pedido.
- Não registra pagamento nem confirma recebimento PIX na tela pública.

### Cozinha
- Recebe apenas itens classificados para produção na cozinha.
- Organiza itens aguardando início e itens em produção.
- Inicia e conclui o preparo por item, sem depender do bar.
- Recebe atualizações em tempo real e alertas sonoros/voz em telas compatíveis.

### Bar
- Possui fila independente da cozinha e recebe apenas itens classificados como bebidas/bar.
- Inicia e conclui cada item individualmente.
- A conclusão de uma bebida libera sua entrega sem aguardar a comida.

### Garçom · PWA
- Usa link individual por token, que pode ser desativado pelo administrador.
- Consulta mesas, pedidos e fila compartilhada de itens prontos.
- Executa o fluxo por item: **aceitar → retirar → entregar**.
- Cada transição registra o responsável e o horário.
- O primeiro aceite em mesa sem responsável define o responsável no servidor; colegas podem ajudar sem tomar a mesa.
- Permite transferência explícita de responsabilidade, com auditoria.
- Pode lançar pedidos e participar do fechamento/cobrança conforme as permissões concedidas.
- A PWA em **/garcom-pwa/** pode ser instalada e mantém uma fila persistente em IndexedDB. Pedidos offline sobrevivem ao fechamento/reinício do app e são reenviados quando a conexão retorna, com chave de idempotência para evitar duplicação.
- Preços, disponibilidade e estoque são revalidados pelo servidor. Conflitos ficam visíveis para revisão e não são tratados como pedidos confirmados.

### Caixa
- Lista comandas abertas e itens entregues.
- Cobra somente itens entregues.
- Registra pagamentos parciais em dinheiro, PIX, débito e crédito.
- Controla saldo restante, desconto e taxa de serviço conforme regras e autorização.
- Permite cancelar item com motivo obrigatório; o estoque é devolvido uma única vez.
- Fecha comanda sem pendências e libera a mesa.
- Emite comprovante de consumo não fiscal.
- O PIX usa chave/QR estático: o operador deve verificar o crédito no banco antes de marcar o valor como recebido.

### Administração
- **Dashboard:** indicadores de faturamento, pedidos, ticket médio, contas, pagamentos, produtos, entregas, mesas e garçons; filtros por hoje, semana e mês. O administrador pode ativar o modo de edição pelo ícone de lápis no header, reordenar cards por arraste, redimensionar puxando a alça do canto inferior direito, ocultar/exibir indicadores, personalizar títulos/legendas e salvar ou restaurar o layout localmente no navegador. As áreas 01 / Movimento e 02 / Operação permanecem separadas.
- **Cardápio:** categorias, ordenação, produtos, preços, fotos, disponibilidade, estoque, adicionais e setor de produção.
- **Mesas:** cadastro, praças, QR Codes fixos e panorama de ocupação, consumo e tempos operacionais.
- **Garçons:** cadastro, ativação/desativação e gestão dos links individuais.
- **Funções:** área de funções e controles administrativos disponíveis ao perfil administrador.
- **Operação:** transferência de responsável, histórico, relatórios por período e ferramentas administrativas disponíveis na versão atual.

## 4. Telas e endereços

| Área | Endereço | Finalidade |
|---|---|---|
| Página inicial | / | Entrada do sistema |
| Login | /#/login | Autenticação da equipe |
| Cliente | /#/mesa/:token | Cardápio e pedido da mesa |
| Cozinha | /#/cozinha | Fila de preparo da cozinha |
| Bar | /#/bar | Fila de bebidas |
| Garçom | /#/garcom/:token | Entrada do atendimento móvel |
| PWA do garçom | /garcom-pwa/?token=... | Atendimento móvel e fila offline |
| Caixa | /#/caixa | Pagamentos e fechamento |
| Dashboard | /#/admin | Indicadores e visão geral |
| Cardápio | /#/admin/cardapio | Categorias e produtos |
| Mesas | /#/admin/mesas | Mesas, praças e QR Codes |
| Garçons | /#/admin/garcons | Equipe de atendimento |
| Funções | /#/admin/funcoes | Controles administrativos |
| Guia interativo | /guia-sistema.html | Demonstração visual sem integração |

Os tokens de mesa e garçom funcionam como credenciais de acesso. Não os publique em issues, prints públicos ou logs. Desative o link do garçom se ele for exposto.

## 5. Linguagens, formatos e tecnologias

O projeto usa linguagens diferentes porque frontend, servidor, banco e PWA têm responsabilidades distintas. A tabela separa **linguagens e formatos escritos no repositório** de **frameworks e bibliotecas**.

### Linguagens e formatos

| Linguagem / formato | Onde é usada | Responsabilidade |
|---|---|---|
| **TypeScript (TS)** | Configurações e código tipado do frontend | Adiciona tipos estáticos, contratos de dados, interfaces e checagem antes do build. |
| **TSX** | src/ (React) | TypeScript com JSX para construir telas, componentes, hooks e interfaces. |
| **JavaScript (JS)** | server.js, db/, scripts/, public/js/ e PWA | API Node.js, regras de negócio, acesso ao banco, automações, testes e comportamento do atendimento móvel. |
| **SQL** | db/migrations/ e consultas do backend | Estrutura relacional, índices, constraints, transações e consultas PostgreSQL. |
| **HTML** | public/ e documentos web | Estrutura das páginas públicas, login, cardápio, pedido, PWA e guia visual. |
| **CSS** | src/**/*.css, public/**/*.css e estilos embutidos | Layout, responsividade, temas, estados visuais, acessibilidade e identidade visual. |
| **JSON** | package.json, tsconfig.json, manifests e dados de configuração | Dependências, scripts, opções de build, configuração e intercâmbio de dados. |
| **Shell / Bash** | Scripts auxiliares e comandos de desenvolvimento/CI | Execução de tarefas de ambiente, instalação, validação e automação. |

### Frameworks, bibliotecas e infraestrutura

| Tecnologia | Uso no projeto |
|---|---|
| **Node.js 20.9+** | Runtime do servidor e dos scripts. |
| **React 19** | Componentes e composição das telas do frontend. |
| **Vite 7** | Servidor de desenvolvimento e empacotamento do frontend. |
| **TypeScript 5.9** | Compilador e verificação estática do código TS/TSX. |
| **Tailwind CSS 4** | Utilitários de estilo, integrado ao Vite. |
| **Zustand 5** | Estado compartilhado entre telas e componentes. |
| **Framer Motion 13** | Transições e animações respeitando redução de movimento. |
| **Phosphor Icons** | Ícones da interface React. |
| **PostgreSQL 16** | Banco relacional e fonte de verdade dos dados operacionais. |
| **node-postgres (pg)** | Conexão e execução de consultas PostgreSQL pelo Node.js. |
| **Server-Sent Events (SSE)** | Atualizações em tempo real do estado operacional. |
| **IndexedDB** | Persistência local da fila offline da PWA. |
| **Service Worker** | Recursos PWA e suporte ao comportamento offline. |
| **Sharp** | Conversão, redimensionamento e otimização de imagens para WebP. |
| **Playwright + Chromium** | Testes ponta a ponta em navegador real. |
| **fake-indexeddb** | Simulação de IndexedDB em testes automatizados. |
| **Railway** | Plataforma de hospedagem configurada para a aplicação. |

### Organização do código

| Diretório / arquivo | Conteúdo |
|---|---|
| src/screens/ | Telas React: Dashboard, Admin, Cozinha, Bar, Garçom, Caixa, Mesa, Login e página inicial. |
| src/components/ | Componentes compartilhados, shell operacional, fila de produção, paginação, formulários e notificações. |
| src/hooks/ | Hooks reutilizáveis de estado e comportamento da interface. |
| src/store/ | Estado global Zustand e hidratação dos dados do frontend. |
| src/lib/ | Cliente de API, tipos, regras de apresentação, tema, impressão, áudio e utilitários. |
| server.js e server/ | Inicialização HTTP e módulos do servidor/API. |
| db/ | Conexão PostgreSQL, migrações, seed e regras de persistência. |
| public/ | Arquivos estáticos, páginas HTML/CSS/JS e PWA do garçom. |
| tests/ | Testes de regressão, contratos e comportamento. |
| scripts/ | Execução de testes, setup, smoke tests, carga e operações auxiliares. |
| docs/ | Contratos, guias técnicos, operação e decisões de arquitetura. |

O arquivo data/db.json é um catálogo de demonstração usado pelo seed, não o banco operacional de produção. O PostgreSQL é a fonte de verdade.

## 6. Executar localmente

### Requisitos
- Node.js **20.9 ou superior**.
- PostgreSQL para desenvolvimento/testes.
- Git e npm.
- Banco local ou descartável. Não use banco de produção para experimentar.

### Instalação

1. Instale dependências: **npm ci**.
2. Copie **.env.example** para **.env** e configure **DATABASE_URL** para um banco local/de teste.
3. Configure uma senha inicial forte em **STAFF_SEED_PASSWORD**. Quando aplicável, configure também **PIX_CHAVE**, **PIX_NOME**, **PIX_CIDADE** e **APP_TIMEZONE**.
4. Aplique migrações e, somente em banco novo/de teste, carregue o catálogo de demonstração:
   - **npm run db:migrate**
   - **npm run db:seed**
5. Gere o frontend e inicie o servidor:
   - **npm run build**
   - **npm start**
6. Abra **http://localhost:3000**.

**Atenção ao seed:** **FORCE_SEED=1 npm run db:seed** é destrutivo. Apaga pedidos, sessões, pagamentos e cardápio antes de substituir os dados de demonstração. Nunca execute no banco de produção.

## 7. Testes e validação

| Comando | O que valida | Observações |
|---|---|---|
| npm run typecheck | Tipos TypeScript | Não emite arquivos. |
| npm run build | Build de produção do frontend | Gera assets em dist/. |
| npm test | Regressões automatizadas | Inclui regressions.cjs e tests/*.test.cjs, exceto suítes PostgreSQL. |
| npm run smoke:panorama | Renderização do panorama de mesas | Smoke SSR. |
| npm run test:pg | Integração PostgreSQL | Exige banco descartável chamado qradmin_test. |
| npm run test:e2e | Fluxos em Chromium real | Exige servidor e banco de teste. |
| npm run test:seguranca | Autorização, IDOR, CSRF e limites | Altera dados; nunca usar produção. |
| npm run test:carga / test:carga70 | Cenários concorrentes e de carga | Somente ambiente isolado. |
| npm run test:smoke / test:full | Fluxos de API e operação | Exigem ambiente preparado. |
| npm run test:dia | Simulação operacional prolongada | Somente ambiente isolado. |
| npm run db:restore-drill | Ensaio de backup e restauração | Exige ferramentas PostgreSQL e destino isolado. |

### Integração PostgreSQL e E2E

As suítes PostgreSQL exigem banco descartável e recusam database que não se chame **qradmin_test**.

1. Configure DATABASE_URL para um PostgreSQL de teste, com o database qradmin_test.
2. Defina NODE_ENV=test.
3. Execute **npm run db:migrate**.
4. Execute **npm run test:pg** e **npm run test:e2e**.

Para executar o drill sem ferramentas locais de backup, use **npm run test:pg -- --sem-backup**.

O drill manual de backup/restore exige banco isolado vazio e confirmação explícita: **RESTORE_DRILL_CONFIRM=isolated-target npm run db:restore-drill**.

**Nunca aponte testes mutáveis, carga, seed ou restore para produção.** CI verde não substitui validação em aparelho físico nem teste de operação no estabelecimento.

## 8. Segurança e operação

- Confirmações de ações que alteram ou removem dados usam modais contextuais, com resumo do impacto e botões explícitos para cancelar ou confirmar. A exclusão do histórico exige uma confirmação textual adicional no próprio modal.

- Confirmações de ações que alteram ou removem dados usam modais contextuais, com resumo do impacto e botões explícitos para cancelar ou confirmar. A exclusão do histórico também exige digitar `APAGAR` no modal final.

- A API valida novamente preço, disponibilidade, estoque, permissões e transições de estado no servidor.
- Operações concorrentes usam transações e controles de consistência no PostgreSQL.
- Tokens de mesa e garçom são credenciais: não compartilhar publicamente.
- Não registrar senhas, tokens ou dados sensíveis em logs.
- Antes de aplicar migrações em produção, confirmar o banco de destino e fazer backup.
- O servidor pode tentar aplicar migrações na inicialização; esse caminho é best-effort. Conferir logs e validar a versão do schema antes de operar.
- O drill automatizado usa dados sintéticos. Ainda é necessário testar restauração de backup real antes da operação comercial.

## 9. Estado conhecido do produto

| Recurso | Situação documentada |
|---|---|
| QR, cardápio, comanda e fluxo cozinha/bar/caixa | Implementado; coberto por testes automatizados e integração PostgreSQL. |
| Produção e entrega progressiva por item | Implementado; autoria e horários registrados. |
| Fila offline do garçom | Persistência, reinício, sincronização e idempotência validados em Chromium. |
| PWA em Android/iOS físicos | Validação adicional pendente. |
| Web Push com app fechado | Não implementado. |
| PIX | QR/chave estática e lançamento manual; sem gateway ou confirmação bancária automática. |
| Comprovante | Comprovante de consumo não fiscal. |
| Multi-loja / multi-tenant | Fora do escopo atual. |
| Produção | Validar deploy, backup real e operação em aparelho físico antes de declarar prontidão comercial. |

## 10. Documentação técnica

- [Contrato de atendimento do garçom](docs/CONTRATO-ATENDIMENTO-GARCOM.md) — estados por item, idempotência e erros.
- [PWA de atendimento](docs/PWA-ATENDIMENTO-GARCOM.md) — arquitetura e garantias da fila offline.
- [Design System](docs/DESIGN_SYSTEM.md) — tokens, componentes e identidade visual.
- [Redefinição de senha](docs/REDEFINICAO-SENHA-ADMIN.md) — fluxo de senha da equipe.
- [Panorama de mesas](docs/engineering/panorama-mesas.md) — praças, tempos e ocupação.
- [Dashboard geral](docs/engineering/dashboard-geral.md) — indicadores, períodos e reconciliação.
- [Runbook de produção](docs/engineering/PRODUCTION_OPERATIONS_RUNBOOK.md) — operação, incidentes, deploy e rollback.
- [Guia visual interativo](public/guia-sistema.html) — demonstração sem integração; cada ícone abre uma explicação.

---

<div align="center">

**QR Admin** · pedidos por QR Code, produção e atendimento para um estabelecimento

[Repositório deividjmoura/lanchonete-qr-semi-final](https://github.com/deividjmoura/lanchonete-qr-semi-final)

</div>
