<div align="center">

# QR Admin

**Pedidos, atendimento e operação de lanchonetes em um só fluxo.**

Do QR Code à cozinha, do atendimento à cobrança: cada etapa conectada para a equipe trabalhar com mais clareza e o cliente acompanhar seu pedido.

[**Acessar o QR Admin**](https://qradmin.up.railway.app/) · [**Conhecer o guia interativo**](https://qradmin.up.railway.app/guia-sistema.html)

[Política de Privacidade](https://qradmin.up.railway.app/politica-de-privacidade.html) · [Termos de Serviço](https://qradmin.up.railway.app/termos-de-servico.html)

</div>

---

> **Estado da documentação:** revisado em 05/11/2026. Este README descreve funcionalidades encontradas no código e nos testes do repositório. Recursos que dependem de configuração externa ou validação operacional estão identificados como tais.

## O que é o QR Admin?

O QR Admin é um sistema web de operação para **um estabelecimento por instalação**. Reúne o pedido feito pelo cliente, a produção na cozinha e no bar, o atendimento do garçom, o caixa e a administração.

A regra central é que cada item acompanha seu próprio andamento, setor e responsabilidade. A comanda acumula novos pedidos durante o atendimento, mas a produção, a retirada, a entrega e a cobrança podem avançar item a item.

## Funcionalidades atuais

### 1. Cliente: cardápio e pedido por QR Code

O cliente lê o QR Code da mesa e acessa o cardápio pelo navegador, sem instalar aplicativo.

- Navega por categorias e pesquisa produtos.
- Consulta descrição, preço, foto e disponibilidade.
- Escolhe adicionais e opções disponíveis e remove ingredientes quando configurados.
- Monta o carrinho e envia o pedido para a comanda da mesa.
- Acompanha o andamento do pedido e os itens entregues.
- Pode cancelar pedidos dentro das regras e dos estados permitidos pelo sistema.

O QR da mesa identifica a sessão de atendimento. A política atual utiliza QR fixo; o fechamento da comanda não implica, por si só, rotação automática do token da mesa.

### 2. Cozinha e bar: filas independentes

Cada item é encaminhado ao setor de produção definido no cardápio. Cozinha e bar têm filas próprias e podem trabalhar em paralelo.

- Visualizam itens recebidos e em produção.
- Iniciam e concluem o preparo por item.
- Atualizam o estado sem esperar que o outro setor termine.
- Recebem atualizações em tempo real por SSE, com reconexão/fallback no cliente.
- Podem usar alertas sonoros nas telas compatíveis.

O ciclo operacional do item é: recebido → em produção → concluído → aceito → retirado → entregue. Cancelamentos autorizados seguem um estado terminal próprio. Um item pronto pode ser retirado enquanto outros itens da mesma comanda continuam em produção.

### 3. Garçom: atendimento e entregas pela PWA

A área do garçom é uma PWA instalável, servida pelo backend e localizada em **public/garcom-pwa/**.

- Consulta mesas, comandas e a fila compartilhada de itens prontos.
- Retira itens individualmente ou em lote e confirma a entrega individualmente ou em lote.
- O primeiro garçom que retira um item pronto pode assumir a responsabilidade pela mesa quando ela ainda não tem responsável.
- Permite atendimento colaborativo e transferência explícita de responsabilidade, conforme as regras do servidor.
- Registra ator, horário e histórico das transições por item.
- Pode lançar pedidos e participar de operações permitidas ao seu perfil.

**Modo offline:** pedidos criados sem conexão são persistidos no IndexedDB do aparelho e reenviados quando o backend volta a responder. A sincronização usa chave de idempotência, backoff e controle entre abas. Um pedido só aparece como sincronizado depois de uma confirmação válida do servidor. Conflitos e falhas permanecem visíveis para revisão; rascunho local não significa pedido recebido pela cozinha/bar.

Limites: limpar os dados do site, desinstalar a PWA ou perder o aparelho pode eliminar pedidos ainda não sincronizados. O Service Worker mantém o shell da PWA em cache, mas não armazena respostas da API em cache.

Documentação técnica: [PWA de atendimento do garçom](docs/PWA-ATENDIMENTO-GARCOM.md) · [Contrato de integração](docs/CONTRATO-ATENDIMENTO-GARCOM.md).

### 4. Caixa: pagamentos, conciliação e fechamento

O caixa acompanha comandas abertas e calcula o consumo cobrável com base nos itens efetivamente entregues.

- Registra pagamentos parciais em dinheiro, PIX, débito e crédito.
- Permite dividir o pagamento em lançamentos e acompanha o saldo restante.
- Aplica desconto e taxa de serviço conforme as permissões.
- Exige reautenticação com login e senha de uma conta **admin ativa** (autorização de gerente) para desconto maior que zero ou ajuste da taxa padrão, com motivo e registro de auditoria.
- Registra cancelamentos com motivo e emite comprovante de consumo.
- Fecha a comanda e libera a mesa quando não há pendências.

A taxa de serviço padrão é configurável por **TAXA_SERVICO_PERCENTUAL** (padrão de 10% quando ausente ou inválida), aplicada sobre o consumo bruto entregue.

**PIX:** o QR/chave é estático e o pagamento é registrado manualmente. A equipe deve conferir o crédito no aplicativo bancário antes de marcar o valor como pago. O QR Admin **não é gateway bancário** e não confirma transferências automaticamente.

O comprovante emitido é de consumo, não nota fiscal.

### 5. Administração: configuração e acompanhamento

O painel administrativo reúne:

- **Dashboard:** indicadores operacionais e financeiros, como faturamento, pedidos, ticket médio, pagamentos, produtos, entregas, mesas e garçons.
- **Painel personalizável:** organização, redimensionamento, ocultação/exibição e ajuste de títulos/legendas dos cards disponíveis.
- **Cardápio:** a página **Cardápio & Estoque** reúne categorias, produtos, preços, fotos, disponibilidade, adicionais, ingredientes removíveis e setor de produção. Cada produto permite ativar o controle de estoque, registrar entrada, definir quantidade e retirar uma unidade. O alerta reúne itens com saldo menor ou igual ao mínimo (inclusive esgotados), com ajuste direto. O mínimo e a desativação do controle continuam na edição do produto. Estoque não é mais uma ferramenta de **Funções**; o menu lateral permanece **Cardápio**.
- **Mesas e praças:** configuração, ocupação, consumo e geração de QR Codes.
- **Garçons:** cadastro, links/tokens de acesso e acompanhamento da operação.
- **Logins e permissões:** contas internas por perfil, troca/redefinição de senha e opção de vincular Google OAuth quando configurada.
- **Operação:** acompanhamento de comandas, responsabilidades, transferências, entregas e relatórios disponíveis.
- **Funções > Limpar:** prévia e anonimização manual de dados pessoais em contas fechadas anteriores à data de corte, preservando pagamentos, valores, formas, datas e autoria.

O login Google é opcional e não cria contas: o administrador precisa cadastrar e vincular previamente o e-mail verificado a uma conta ativa. Veja [Configuração do login Google](docs/engineering/google-oauth-setup.md).

### 6. Segurança, autoria e confiabilidade

As regras críticas são validadas no servidor; a interface não é a autoridade para preço, permissão, estado de item ou fechamento.

- Sessões de equipe com controle de acesso por perfil, proteção de origem/CSRF e limites de tentativas em operações sensíveis.
- Política de senha, troca obrigatória para credenciais iniciais/compartilhadas e revogação das sessões na troca/redefinição.
- Reautenticação administrativa para ajustes financeiros sensíveis.
- Trilha de auditoria transacional para operações como pedidos, entregas, fechamento, credenciais e alterações administrativas do cardápio.
- Identificação financeira por conta: pagamentos lançados por funcionário autenticado podem registrar **operador_id** vinculado à conta **staff**, preservando também o nome informado no momento do lançamento. A identidade do garçom é registrada como ator do tipo **garcom**, sem confundir seu identificador com o ID de uma conta staff.
- **GET /healthz** executa uma sondagem read-only **SELECT 1** no PostgreSQL com timeout curto; responde 200 quando aplicação e banco estão acessíveis e 503 quando a dependência está indisponível.
- Inicialização de produção bloqueia a abertura do servidor se as migrations falharem.

A ferramenta **Administração > Funções > Limpar** substitui nomes de clientes e observações livres por uma sentinela nas contas fechadas anteriores à data informada. Ela é manual, oferece dry-run e não apaga pagamentos, valores, formas, datas ou autoria; não existe agendamento automático. A trilha de auditoria é persistida, mas **não existe uma tela administrativa geral para pesquisar todos os eventos**. A consulta técnica permanece por banco/relatórios autorizados. O prazo de retenção dos eventos (24 meses) está aprovado e registrado em [Política de dados e retenção](docs/engineering/data-policy-proposal.md#31-prazos-aprovados-pelo-responsável-em-05112026); a validação contábil/jurídica e a rotina de descarte continuam pendentes.

## Fluxo ponta a ponta

~~~text
CLIENTE
  │ Lê o QR Code e monta o pedido
  ▼
CARDÁPIO ──► COMANDA DA MESA
                │
          ┌─────┴─────┐
          ▼           ▼
       COZINHA       BAR
          │           │
          └─────┬─────┘
                ▼
        ITENS CONCLUÍDOS
                │
                ▼
             GARÇOM
       Retira e confirma entrega
                │
                ▼
              CAIXA
       Pagamentos e fechamento
                │
                ▼
           MESA LIBERADA
~~~

A comanda é acumulativa. Cada item avança de forma independente, e somente itens entregues entram no consumo cobrável. Isso permite que bebidas e pratos sigam ritmos diferentes sem bloquear a operação inteira.

## Tecnologias e arquitetura

O sistema é uma aplicação web com interface SPA e backend Node.js que também serve os arquivos estáticos.

| Camada | Tecnologias |
|---|---|
| Interface | **TypeScript**, **React** e **TSX**, compilados pelo **Vite** |
| Estilo | **CSS**, tokens de design e **Tailwind CSS** |
| Páginas estáticas e PWA | **HTML**, **CSS**, **JavaScript**, manifesto **JSON** e Service Worker |
| API e regras de negócio | **JavaScript** no **Node.js**, servidor HTTP nativo |
| Banco de dados | **PostgreSQL**, com **SQL** versionado em migrations |
| Estado de interface | **Zustand** |
| Testes | **node:test**, integração com PostgreSQL e **Playwright/Chromium** para E2E |

Requisito de runtime: **Node.js >= 20.9.0**. O banco precisa ser PostgreSQL acessível pela variável **DATABASE_URL**.

## Executar localmente

1. Instale Node.js 20.9 ou superior e disponibilize um PostgreSQL local/de teste.
2. Clone o repositório e instale as dependências:

   ~~~bash
   npm ci
   ~~~

3. Crie o arquivo de ambiente e configure **DATABASE_URL** e uma senha inicial forte em **STAFF_SEED_PASSWORD**:

   ~~~bash
   cp .env.example .env
   ~~~

4. Execute o bootstrap local (aplica migrations e seed):

   ~~~bash
   npm run setup
   ~~~

5. Inicie o servidor:

   ~~~bash
   npm start
   ~~~

6. Acesse [http://localhost:3000](http://localhost:3000).

O primeiro login exige troca da senha de bootstrap. Não existe senha padrão. Nunca use credenciais de produção em ambiente local ou de teste.

## Comandos úteis

| Comando | Finalidade |
|---|---|
| **npm run dev** | Interface Vite em desenvolvimento |
| **npm start** | Inicialização pelo gate de migrations e servidor |
| **npm run typecheck** | Verificação TypeScript |
| **npm run build** | Build de produção da interface. Além dos assets, grava `dist/build-version.json` (identificador do aviso de atualização — commite-o junto com o bundle). O build também **copia `public/` para `dist/`**, mas essas cópias não são versionadas: o `server.js` resolve esses caminhos em `public/`. Se o seu `.env` local tiver `NODE_ENV=development`, o Vite gera um build de desenvolvimento sem avisar — use `NODE_ENV=production npm run build`; `npm test` acusa um `dist/` de desenvolvimento que esteja no Git |
| **npm run build:check** | Typecheck seguido do build |

> **Deploy:** o `dist/` não é mais versionado por inteiro (13/11/2026). O deploy
> precisa rodar `npm ci && npm run build` antes de `npm start` — no Railway, isso
> é o *Build Command*. Com `NODE_ENV=production`, o servidor **recusa subir** se
> `dist/index.html` não existir, em vez de servir as páginas legadas de `public/`
> com a interface antiga e HTTP 200. Para aceitar essa degradação de propósito,
> defina `FRONTEND_BUILD_REQUIRED=0`. Detalhes em
> [Higiene do repositório](docs/engineering/HIGIENE-REPOSITORIO-2026-11-13.md).
| **npm test** | Regressão sem as suítes que exigem PostgreSQL dedicado |
| **npm run test:pg** | Suítes PostgreSQL; exige **DATABASE_URL** de banco de teste |
| **npm run test:e2e** | Suítes E2E Playwright |
| **npm run health:smoke** | Smoke HTTP read-only; exige **HEALTHCHECK_URL** terminada em **/healthz** |
| **npm run db:restore-drill** | Ensaio de backup/restauração; exige ferramentas PostgreSQL e banco descartável |
| **npm run db:migrate** | Aplica migrations pendentes |
| **npm run pg:local** | Sobe PostgreSQL local dedicado aos testes (encerre com Ctrl+C; os dados ficam em `.tmp-pgdata` entre execuções) |
| **npm run db:seed** | Popula dados iniciais de demonstração, sem sobrescrever cardápio existente por padrão |
| **npm run test:landing** | Inspeção visual e funcional da landing em 1440/768/390/320 px, modal de acesso, links e rotas preservadas; exige **BASE_URL** de servidor local |
| **npm run test:contraste** | Mede no Chromium o contraste de cada texto renderizado, nos temas claro e escuro, em desktop e celular; exige **BASE_URL** de servidor local. Com `-- --com-equipe` inclui as telas internas (banco de demonstração) |
| **npm run test:cardapio-intacto** | Prova de que o cardápio do cliente (`#/mesa/:token`) continua idêntico ao commit de referência: marcação, estilo computado, pixels e arquivos baixados |

**Banco PostgreSQL local para testes:** `npm run pg:local` inicia um PostgreSQL embarcado na porta `55433`, com o banco `qradmin_test`. Em outro terminal, aplique o schema e rode a suíte:

~~~bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/qradmin_test npm run db:migrate
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/qradmin_test npm run test:pg
~~~

O diretório `.tmp-pgdata` é mantido entre execuções; o banco não é apagado automaticamente ao encerrar o processo. Remova esse diretório somente quando tiver certeza de que não precisa dos dados de teste. **Atenção:** `npm run test:pg`, `npm run test:e2e`, `npm run db:restore-drill`, `npm run test:smoke`, `npm run test:full`, `npm run test:dia`, os cenários de carga e `npm run test:seguranca` podem criar/alterar dados. Use exclusivamente bancos/ambientes isolados de teste. Nunca aponte esses scripts para produção.

### Scripts adicionais

- `npm run test:regression`: alias da regressão executada por `npm test`.
- `npm run test:smoke` e `npm run test:full`: cenários de smoke da aplicação.
- `npm run test:dia`: cenário operacional prolongado.
- `npm run test:carga`, `npm run test:carga70` e `npm run test:carga60`: cenários de carga; exigem ambiente de teste isolado.
- `npm run test:seguranca`: verificações de segurança; use ambiente isolado.
- `npm run test:landing`: abre a landing em Chromium headless e confere layout, links, modal de acesso (foco, ESC, clique fora, 2FA) e rotas preservadas. Use `-- --screenshots` para gravar as capturas de auditoria em `docs/screenshots/landing/`.
- `npm run smoke:panorama`, `npm run smoke:mesas` e `npm run smoke:fila`: smoke das telas SSR correspondentes.
- `npm run fotos:dry`: prévia da correção de fotos; `npm run fotos:fix` e `npm run fotos:sync` executam operações de manutenção; `npm run diag:fotos` gera diagnóstico.
- `npm run db:reset-senha`: ferramenta administrativa de redefinição de senha; não execute sem entender o alvo e o efeito.

## Landing page e acesso

A página inicial (`/`) é a landing comercial do QR Admin, integrada ao build do SPA. Todo CTA de acesso abre o **mesmo** fluxo de autenticação da rota `/#/login` em um modal (sem login paralelo): setor, senha, segundo fator, código de recuperação, Google OAuth quando configurado, CSRF e sessão são os do produto.

| Página | Endereço | Observação |
|---|---|---|
| Landing comercial | `/` | Página inicial; capturas reais do sistema com dados fictícios |
| Acesso da equipe | `/#/login` | Página de login preservada |
| Apresentação institucional | `/apresentacao.html` | Página estática, na mesma identidade do produto |
| Guia demonstrativo | `/guia-sistema.html` | Página estática, na mesma identidade do produto |
| Privacidade e Termos | `/politica-de-privacidade.html`, `/termos-de-servico.html`, `/termos-de-uso.html` | Texto legal preservado; ligados no rodapé da landing e do login |

A landing usa o logotipo oficial (`public/logo/qradmin-mark.png`), o símbolo reduzido (`public/logo/simbolo.svg`) e as capturas de `public/assets/apresentacao/`, geradas por `scripts/capturar-apresentacao.mjs` em ambiente isolado — sempre que o visual de uma tela mudar, gere as capturas de novo. Landing, login, sistema, PWA do garçom e páginas estáticas compartilham a identidade "Passe" e uma única família tipográfica variável, Archivo (licença SIL OFL), servida localmente em `public/garcom-pwa/fonts/`. O cardápio do cliente mantém a identidade própria, com as fontes dele em `src/screens/cardapio-identidade/fontes/`.

### Contato e adesão

A seção **Contate-nos** (`/#contato`) fica antes do CTA final e repete os dois canais que já existem no rodapé da tela de acesso — nenhum canal novo é criado:

| Canal | Endereço | Origem |
|---|---|---|
| WhatsApp | `https://wa.me/5547996162721` | `src/screens/landing/contato.ts` |
| E-mail | `servicosdegestaoqradmin@gmail.com` | `src/screens/landing/contato.ts` |

Os dois endereços estão centralizados em `src/screens/landing/contato.ts`. A seção também lista os três formatos de adesão (assinatura mensal, aquisição do sistema e venda exclusiva) **sem valores publicados**: preço, prazo e escopo ficam "sob consulta" e são confirmados na conversa.

O rodapé mantém **Contate-nos** ao lado de **Acesso ao sistema**. Durante a rolagem, o acesso fica disponível no cabeçalho fixo no desktop e, abaixo de 960 px, em um par flutuante discreto (`Acessar` + `Contate-nos`) que se recolhe sobre o rodapé, onde os mesmos destinos já estão à vista.

## Documentação do projeto

| Documento | Conteúdo |
|---|---|
| [Guia visual interativo](https://qradmin.up.railway.app/guia-sistema.html) | Demonstração navegável das áreas do produto. É uma página estática demonstrativa, não uma sessão conectada ao banco/API. |
| [Design system "Passe"](docs/DESIGN_SYSTEM.md) | Identidade visual em vigor: tokens, tipografia, primitivos, navegação, a exceção do cardápio do cliente e as regras travadas por teste. |
| [Relatório do rebranding](REBRANDING.md) | O que mudou e por quê, o que foi preservado, como foi verificado e o que conferir antes de mesclar. |
| [PWA do garçom](docs/PWA-ATENDIMENTO-GARCOM.md) | Arquitetura, sincronização offline e comportamento da PWA. |
| [Contrato do atendimento](docs/CONTRATO-ATENDIMENTO-GARCOM.md) | Estados dos itens, regras de autoria e rotas de entrega. |
| [Importação de cardápio CSV](docs/IMPORTAR-CARDAPIO-CSV.md) | Formato e regras de importação. |
| [Auditoria operacional](docs/engineering/auditoria-operacional.md) | Onde a autoria das operações é persistida e o que ainda falta. |
| [Política de dados e retenção](docs/engineering/data-policy-proposal.md) | Inventário de dados, anonimização manual e prazos de retenção aprovados. |
| [Ciclo de vida de contas staff](docs/engineering/ciclo-de-vida-contas-staff.md) | Entrada, desligamento e o que fazer com e-mail Google e autoria. |
| [Procedimento de titulares](docs/engineering/procedimento-titulares.md) | Como atender pedidos de acesso, correção e eliminação. |
| [Observabilidade e alertas](docs/engineering/observabilidade-alertas.md) | Health check, logs e dependências de alertas externos. |
| [Gate de migrations](docs/engineering/migration-gate-runbook.md) | Inicialização segura e compatibilidade do schema. |
| [Atualização segura de versão](docs/engineering/ATUALIZACAO-SEGURA.md) | `/api/version`, aviso de deploy em abas abertas, adiamento sincronizado e cache do shell. |
| [Google OAuth](docs/engineering/google-oauth-setup.md) | Pré-cadastro e configuração do login Google. |
| [Higiene do repositório e pendências](docs/engineering/HIGIENE-REPOSITORIO-2026-11-13.md) | O que saiu do repositório em 13/11/2026, branches apagadas e o estado real das issues abertas. |
| [Backup e restore](docs/engineering/backup-restore.md) | Procedimento e evidências necessárias para restauração. |
| [Fornecedor e serviços](docs/FORNECEDOR-E-SERVICOS-QR-ADMIN.md) | Identificação do fornecedor, infraestrutura e limites documentados. |
| [Política de Privacidade](https://qradmin.up.railway.app/politica-de-privacidade.html) | Política publicada. |
| [Termos de Serviço](https://qradmin.up.railway.app/termos-de-servico.html) | Condições de uso publicadas. |

## Roadmap e limites conhecidos

O status abaixo separa código integrado de validações que dependem de dispositivos, provedor ou decisões externas.

### Fluxo principal — implementado

- [x] Pedido por QR Code, cardápio digital e comanda acumulativa.
- [x] Filas independentes para cozinha e bar.
- [x] Produção, retirada e entrega progressivas por item.
- [x] PWA do garçom com fila offline persistente, sincronização e idempotência.
- [x] Caixa com pagamentos parciais, descontos, taxa de serviço e fechamento.
- [x] Dashboard e gestão de cardápio, mesas, praças e equipe.

### Segurança e rastreabilidade — implementado em partes integradas

- [x] Controle de acesso por perfil, sessão, CSRF e limites em operações sensíveis.
- [x] Troca obrigatória de senha, revogação de sessões e redefinição administrativa.
- [x] Reautenticação de administrador para desconto e ajuste de taxa.
- [x] Eventos de auditoria para operações críticas e alterações de cardápio.
- [x] Identificação por ID da conta staff nos pagamentos feitos por funcionário autenticado.
- [x] Anonimização manual de dados pessoais em histórico fechado, com preservação dos registros financeiros e da autoria.
- [x] Health check com verificação read-only do PostgreSQL e timeout.
- [ ] Tela administrativa de consulta geral da trilha de auditoria.
- [~] Retenção: prazos por classe aprovados em 05/11/2026 e publicados na Política de Privacidade; faltam validação contábil/jurídica e rotina de descarte — a anonimização é manual e não há prazo automático.
- [ ] Evolução de CSP e revisão contínua de tokens.

### Validação operacional — pendente

- [ ] Rodada completa em aparelhos físicos Android e iOS, incluindo retomada offline.
- [ ] Confirmar configuração e entrega de alertas externos por e-mail.
- [ ] Executar e registrar drill real de backup e restauração no ambiente do provedor.
- [ ] Confirmar monitoramento, responsáveis e procedimento de recuperação.
- [ ] Revalidar os fluxos críticos após cada atualização do ambiente de produção.

### Fora do escopo atual

- **Multi-loja/multi-tenant:** a instalação documentada atende um estabelecimento.
- **Gateway PIX e confirmação bancária automática:** não implementados.
- **Nota fiscal:** o documento emitido é comprovante de consumo, não documento fiscal.
- **Web Push com aplicativo fechado:** não declarar como disponível; permanece pendente de implementação/validação.

## Fornecedor do QR Admin

O QR Admin é fornecido tecnicamente por **69.987.201 DEIVID DE JESUS DE MOURA**, Microempreendedor Individual (MEI), inscrito no **CNPJ 69.987.201/0001-20**, com situação cadastral ativa conforme Certificado da Condição de MEI emitido em 05/11/2026.

- **Titular:** Deivid de Jesus de Moura.
- **Contato profissional:** [servicosdegestaoqradmin@gmail.com](mailto:servicosdegestaoqradmin@gmail.com).
- **Produto:** QR Admin — sistema de pedidos por QR Code e gestão operacional para estabelecimento.
- **Aplicação documentada:** [qradmin.up.railway.app](https://qradmin.up.railway.app/).
- **Infraestrutura documentada:** Railway e PostgreSQL.
- **Autenticação externa opcional:** Google OAuth, quando habilitada pelo estabelecimento.

A identificação cadastral não substitui contrato de prestação de serviços, definição de escopo, níveis de suporte, prazos de atendimento ou instrumento de tratamento de dados. Esses pontos devem constar da contratação de cada estabelecimento. O estabelecimento cliente permanece responsável pelas informações comerciais da operação e, conforme a configuração e a relação concreta, pela definição das finalidades e meios essenciais do tratamento de dados de seus clientes e funcionários.

O CNPJ e o nome empresarial são reproduzidos conforme o certificado cadastral. Dados pessoais não necessários à identificação comercial, como CPF e endereço residencial, não são publicados nesta documentação.

## Acesso

- **Sistema:** [qradmin.up.railway.app](https://qradmin.up.railway.app/)
- **Guia visual:** [Explorar as áreas e funcionalidades](https://qradmin.up.railway.app/guia-sistema.html)
- **Novidades e versões:** [Histórico de alterações](https://qradmin.up.railway.app/novidades.html)
- **Privacidade:** [Política de Privacidade](https://qradmin.up.railway.app/politica-de-privacidade.html)
- **Condições de uso:** [Termos de Serviço](https://qradmin.up.railway.app/termos-de-servico.html)

<div align="center">

**QR Admin**  
*Mais clareza para a equipe. Mais acompanhamento para o cliente. Mais controle para a operação.*

</div>

### CSV com estoque e reversão

No modelo baixado em **Admin → Cardápio → Importar CSV**, a coluna opcional
`estoque` recebe unidades inteiras de 0 a 2147483647. **`0` ativa o controle com
saldo zerado** (produto esgotado até a reposição); quantidade positiva ativa o
controle com esse saldo. Vazio ou coluna ausente preserva o estoque existente
no modo atualizar e deixa produtos novos sem controle. A coluna `disponivel`
continua independente: `nao` mantém o produto pausado mesmo após reposição.
Arquivos antigos de sete colunas continuam aceitos.

Cada importação bem-sucedida salva no banco **um ponto de restauração** do
catálogo anterior, na mesma transação. Abra novamente **Importar CSV** e use
**Reverter última importação**. O ponto persiste ao fechar a janela ou reiniciar
o servidor; uma nova importação o substitui. Produtos novos são arquivados,
nunca apagados, e IDs, pedidos, vendas e adicionais anteriores são preservados.

Por segurança, a reversão é bloqueada se houve qualquer mudança posterior no
catálogo, inclusive entrada/baixa de estoque. Ela não deve ser usada para
sobrescrever operação da loja. A reversão exige administrador, confirmação,
sessão/CSRF válidos e gera auditoria. Não é um histórico ilimitado de versões,
nem restaura importações anteriores à migration `0040`.
