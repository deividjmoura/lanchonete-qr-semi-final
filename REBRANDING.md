# Rebranding QR Admin — auditoria da main

**Data da auditoria:** 2026-11-09  
**Base analisada:** `main` em `bc9727ef336888fa39634f5eeb579af940c2c387`  
**Branch de trabalho:** `design/identidade-visual` (fast-forward para a base atual antes de qualquer alteração)  
**Escopo:** identidade visual, landing, SPA autenticada e PWA. Nenhuma alteração funcional, de API, autenticação, pagamentos ou regras de negócio está autorizada.

> Este documento registra o estado observado no código. Contagens são da varredura dos arquivos citados, não uma alegação de auditoria estática completa de cada byte do repositório.

## 1. Resultado executivo

A `main` já contém a fundação visual **Comanda de Chapa** (PR #295): tokens compartilhados SPA/PWA, paleta brasa/papel, tipografia Fraunces + Plus Jakarta Sans + JetBrains Mono, Phosphor Icons, escala de raios e testes de contraste. A base não deve ser descartada.

A unificação, entretanto, ainda é incompleta. A landing foi construída com uma identidade editorial própria; o fluxo de demonstração não acompanha o scroll e apresenta apenas duas capturas; telas legadas e folhas de estilo antigas continuam no repositório; e o endereço de contato encontrado no código difere tanto do e-mail solicitado originalmente quanto do novo e-mail informado nesta tarefa.

## 2. Cores, tipografia, componentes e estilos hardcoded/inconsistentes

| Área / arquivo | Estado observado | Impacto / tratamento necessário |
|---|---|---|
| `public/garcom-pwa/design-tokens.css` | Fonte compartilhada de tokens, importada em `src/index.css` e consumida pelo PWA. Contém primitivos e semânticos; valores hex/rgba aqui são esperados por ser a fonte dos tokens. | Preservar como fonte única. Conferir coerência dos comentários e dos valores finais do Território A. |
| `src/index.css` | Faz o mapeamento do Tailwind v4 para tokens semânticos; define regimes expressive/operational e utilitários globais. | Manter como ponte global; evitar novos tokens locais concorrentes. |
| `src/screens/landing/styles/main.css` | Folha própria de 81.777 caracteres; declara DM Sans e DM Serif Display; possui 224 ocorrências de cores hex e 40 funções rgba na versão analisada. Define paleta local `--paper`, `--ink`, `--pine`, `--accent`, etc. | Maior divergência. Migrar tipografia, superfícies, texto, linhas, foco e estados para tokens compartilhados; remover dependência da paleta paralela sem descaracterizar a composição editorial. |
| `src/screens/landing/sections/*` | Componentes têm composição própria e algumas superfícies/estados visuais são descritos pela folha local. | Reutilizar componentes e tokens da identidade global; evitar cards repetitivos e manter a hierarquia editorial. |
| `src/screens/dashboard.css` | Não contém hex/rgba literais na varredura; usa `--stage-*`, mas conserva uma composição de palco escuro, gradientes, cards com sombra, quatro colunas de KPI e variantes cromáticas por cartão. | A paleta é tokenizada, mas a composição ainda precisa ser conferida contra a assinatura Comanda de Chapa e a contenção de efeitos. |
| `src/screens/operacional.css` | Usa tokens `--stage-*`, gradientes em camadas, grade de fundo, hairlines e sombras; documenta visual de palco/vidro. | Reduzir decoração residual; preservar contraste e leitura a distância de cozinha/bar. |
| `src/components/AuthModal.css`, `src/screens/login-fields.css`, `src/components/OpsShell.css`, `src/screens/admin/admin-responsive.css` | Camadas CSS específicas da autenticação, shell e admin. | Revisar alinhamento de raio, foco, campos, superfícies e estados com os tokens semânticos. |
| `public/style.css`, `public/style-ops.css`, `public/theme-glass.css`, `public/mesa-1.css` | CSS legado/estático com regras próprias; `public/theme-glass.css` ainda contém referências explícitas a Inter. | Identificar páginas que realmente carregam esses estilos; não deixar HTML público/legado com identidade concorrente. |
| `public/guia-sistema.html`, `public/apresentacao.html`, `public/admin.html` | Páginas estáticas/legadas com estilos e/ou fontes locais próprios. | Alinhar ou marcar claramente como material histórico não operacional; não misturar estilos com a SPA. |
| `src/screens/landing/components/Icon.tsx` e `src/components/*` | Landing usa ícones SVG inline próprios; SPA usa Phosphor Icons. | Unificar o set e pesos visuais, preferindo Phosphor onde a landing e os contatos forem atualizados. |

## 3. E-mails e canais de contato

### Busca literal solicitada

A busca no código da `main` por `deividmoura729249` e `servicosdegestaoqradmin` não retornou correspondências. Portanto, **não há ocorrência literal confirmada** do endereço `deividmoura729249@gmail.com` no índice de código consultado.

### Endereço atualmente encontrado

A varredura por `gmail.com` encontrou `dejesusdemouradeivid@gmail.com` em:

- `src/screens/landing/contato.ts` (constantes compartilhadas de contato);
- `src/screens/Login.tsx` (rodapé do login);
- `README.md`;
- `docs/FORNECEDOR-E-SERVICOS-QR-ADMIN.md`;
- `docs/engineering/procedimento-titulares.md`;
- `docs/engineering/data-policy-proposal.md`;
- `public/termos-de-uso.html`;
- `public/termos-de-servico.html`;
- `public/politica-de-privacidade.html`;
- `scripts/verificar-landing.mjs`;
- `public/apresentacao.html`.

Os documentos de fornecedor/privacidade registram esse endereço como canal oficial anteriormente confirmado. O novo endereço solicitado para o serviço é `servicosdegestaoqradmin@gmail.com`.

**Ponto de aprovação necessário:** substituir o e-mail em UI/contatos do produto é uma mudança de comunicação; substituir o canal publicado de privacidade/solicitações de titulares em documentos institucionais também altera uma informação operacional/legal. A atualização dos documentos legais deve ser confirmada explicitamente pelo responsável antes de ser tratada como canal oficial de privacidade. Não inventar nem presumir essa equivalência.

## 4. Landing e narrativa de scroll

Arquivos principais:
- `src/screens/Landing.tsx`;
- `src/screens/landing/sections/FlowSection.tsx`;
- `src/screens/landing/sections/ProductSection.tsx`;
- `src/screens/landing/components/ProductShots.tsx`;
- `src/screens/landing/components/FloatingActions.tsx`;
- `src/screens/landing/sections/ContatoSection.tsx`.

Estado observado:
- `FlowSection` é uma lista estática de seis etapas; não há caminho SVG que acompanhe o progresso de rolagem.
- `ProductSection` alterna apenas duas capturas: dashboard e cardápio.
- O repositório já possui capturas reais de demonstração para cardápio, comanda, personalização, cozinha, bar, entregas, caixa, mapa de mesas e dashboard em `public/assets/apresentacao/`.
- `FloatingActions` já aparece depois de 420px de rolagem e se recolhe perto do rodapé; oferece acesso e WhatsApp, mas não oferece e-mail como ação equivalente.
- A área de contato da landing exibe endereço de e-mail em texto, além do ícone; login já usa ícone de e-mail.

Tratamento necessário: transformar a jornada em narrativa sincronizada com scroll, usando capturas reais já existentes, caminho/progress line e etapas de mesa → confirmação → cozinha/bar → acompanhamento/garçom → caixa; depois apresentar gestão/relatórios sem inventar números ou telas.

## 5. Responsividade — dashboard, cards e tabelas

Arquivos de maior atenção:
- `src/screens/dashboard.css`;
- componentes de dashboard em `src/screens/dashboard/*`;
- `src/components/OpsShell.css`;
- `src/screens/admin/admin-responsive.css`;
- `src/screens/operacional.css`;
- `public/garcom-pwa/styles.css`.

Observações do código:
- Dashboard começa com grade de quatro colunas para indicadores e usa breakpoints em 1050px, 700px e 420px, além de regras posteriores em 900px/620px.
- Os cartões KPI têm altura mínima de 202px; painéis inferiores usam duas colunas; gráficos têm área com rolagem horizontal.
- Há layouts específicos para kanban, cards e tabelas em outras folhas, portanto a correção não pode se limitar ao dashboard.
- O shell operacional prevê sidebar colapsável/gaveta mobile; o PWA tem rodapé fixo, safe-area e alvos de toque de 40px com área expandida.

A confirmação visual precisa cobrir pelo menos 320/360/390/768/1024/1440px. Leitura de CSS não substitui execução em navegador: o resultado mobile deve ser validado com capturas e E2E.

## 6. Contraste e temas

- O sistema global já possui tokens claro/escuro e teste `tests/design-system.test.cjs` que verifica pares semânticos de contraste.
- O PWA importa seus tokens compartilhados e possui bootstrap de tema; deve ser validado em claro e escuro.
- A landing possui paleta local, cores fixas para texto secundário e superfícies, além de opacidades em fundos escuros. Isso cria risco de contraste desigual entre seções e impede o tema global de ser fonte única.
- Algumas telas legadas usam valores próprios e não estão cobertas automaticamente pelos testes de tokens globais.
- O cardápio `#/mesa/:token` possui exceção visual documentada (tema praia/foto protagonista); deve manter sua experiência própria sem divergir em componentes globais, acessibilidade e comportamento de tema.

## 7. Plano de execução e critérios de aceite

1. Manter a fundação Comanda de Chapa da `main`; centralizar a landing nos tokens globais.
2. Criar jornada de scroll com progress path e capturas reais para todas as etapas já existentes no produto.
3. Unificar contatos de produto e ícones; tratar separadamente a decisão sobre o canal de privacidade dos documentos legais.
4. Corrigir responsividade por superfície (dashboard, grids, tabelas, modais, formulários, shell e PWA).
5. Conferir tema claro/escuro, contraste, foco, alvos de toque e `prefers-reduced-motion`.
6. Atualizar testes e documentação; gerar build de produção versionado conforme o fluxo do repositório.
7. Abrir PR para `main`, sem merge e sem deploy.

### Checklist de verificação do revisor

- [ ] Landing desktop: narrativa, linha de progresso e capturas reais em ordem.
- [ ] Landing mobile: etapas, imagem e linha sem overflow ou sobreposição.
- [ ] Fluxo completo: mesa → confirmação → cozinha/bar → garçom/acompanhamento → caixa.
- [ ] Gestão: dashboard, relatórios e módulos demonstrados com telas reais.
- [ ] Login e área autenticada preservam a mesma identidade.
- [ ] Dashboard em 320, 360, 390, 768, 1024 e 1440px.
- [ ] Cards, grids, tabelas, modais e formulários em mobile/tablet.
- [ ] PWA em mobile, offline shell e temas claro/escuro (sem alterar lógica offline).
- [ ] Contraste e foco visível; navegação por teclado.
- [ ] `prefers-reduced-motion` desativa animações não essenciais.
- [ ] Nenhum endereço de contato antigo permanece nos escopos aprovados.
- [ ] Regressão, typecheck, build, smoke e E2E executados; resultados anexados ao PR.

### Regras explícitas para análise da main antes do merge

- Comparar o diff completo com a `main` atualizada e verificar conflitos/alterações concorrentes.
- Revisar especialmente tokens, `src/index.css`, landing, dashboard, telas operacionais, autenticação, PWA, Service Worker, manifesto, arquivos `dist/` e documentos institucionais.
- Confirmar que não houve alteração em API, autenticação, autorização, banco/migrations, pagamentos, cálculos, SSE, voz, offline/sync ou regras de negócio.
- Confirmar que o build versionado corresponde exatamente ao código-fonte e que os testes obrigatórios passaram.
- Conferir screenshots de desktop/mobile e claro/escuro antes de aprovar.
- **Não fazer merge, release ou deploy automaticamente.** A aprovação final pertence ao responsável pelo QR Admin.


## 8. Implementação realizada nesta branch

Base atualizada: `main` em `bc9727ef336888fa39634f5eeb579af940c2c387`. A branch de trabalho foi avançada por fast-forward antes das alterações; nenhum commit da `main` foi reescrito.

### Mudanças entregues

- [x] Registro desta auditoria antes das alterações de aplicação.
- [x] Landing usa os tokens de tipografia globais (Fraunces / Plus Jakarta Sans); fontes locais DM foram removidas.
- [x] Paleta de tokens compartilhados migrada para papel/stout/brasa, com latão como apoio e estados semânticos separados. Tokens SPA/PWA continuam sendo a mesma fonte.
- [x] Narrativa de scroll com oito cenas e linha SVG progressiva: comanda, personalização/confirmação, cozinha, bar, entregas/garçom, caixa, dashboard e gestão de cardápio.
- [x] Capturas referenciadas são arquivos reais já versionados em `public/assets/apresentacao/`; não foram criados dados nem screenshots fictícios novos.
- [x] Dashboard: corrigida declaração de borda inválida e reforçadas regras de grid/empilhamento em tablet/mobile.
- [x] Contatos de UI centralizados no módulo de contato; login, landing, apresentação e README passam a usar `servicosdegestaoqradmin@gmail.com`.
- [x] A ação flutuante mantém acesso e WhatsApp e agora inclui atalho de e-mail por ícone.
- [x] A área de contato não imprime o endereço como texto; apresenta ação de e-mail com ícone.
- [x] Ícones da landing migrados para o mesmo conjunto Phosphor usado na SPA e no PWA.
- [x] Testes da identidade ampliados para tokens, tipografia, jornada e contato; script de verificação da landing atualizado para conferir oito cenas e capturas.
- [x] `docs/DESIGN_SYSTEM.md` atualizado com a tipografia e narrativa da landing.

### Divergência institucional pendente

A busca literal pelo endereço `deividmoura729249@gmail.com` não encontrou ocorrências na `main`. O endereço diferente `dejesusdemouradeivid@gmail.com` aparece nos documentos de privacidade/fornecedor e nos termos como canal anteriormente confirmado para contato profissional/solicitações de titulares. Foi atualizado nos canais comerciais da aplicação, README e apresentação; **os documentos legais e o procedimento de privacidade foram preservados** até confirmação expressa de que o novo e-mail também será o canal oficial para titulares/privacidade. Não afirmar que a substituição global foi concluída enquanto esses documentos mantiverem o endereço anterior.

### Verificação técnica — estado desta entrega

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run test:regression`
- [ ] `npm run test:landing`
- [ ] `npm run test:e2e` (desktop/mobile, claro/escuro)
- [ ] PWA em navegador/dispositivo real, incluindo atualização do shell offline
- [ ] Capturas comparativas desktop/mobile e tema claro/escuro anexadas ao PR

**Limitação do ambiente de execução desta sessão:** não foi possível clonar o repositório nem executar npm/Playwright porque o ambiente de trabalho não resolveu o host GitHub. Portanto, typecheck, build, regressão e E2E permanecem pendentes de CI/execução local. Não declarar esses testes como aprovados sem logs verificáveis.

## 9. Gate obrigatório de revisão e publicação

- [ ] Responsável confirma se o novo e-mail também substitui o canal institucional de privacidade/solicitações de titulares.
- [ ] Revisor compara a branch com a `main` mais recente e examina os arquivos listados nas regras explícitas da §7.
- [ ] Revisor confirma visualmente todas as telas e breakpoints em claro/escuro.
- [ ] Revisor confirma CI verde e ausência de regressões funcionais.
- [ ] Responsável pelo QR Admin aprova o PR.

**Este PR não deve ser mergeado, publicado ou implantado automaticamente.** A branch é uma proposta de rebranding sujeita à conferência do responsável.
