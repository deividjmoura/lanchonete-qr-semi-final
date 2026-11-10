# Rebranding QR Admin — auditoria da main e plano de revisão

## Base auditada
- Repositório: `deividjmoura/lanchonete-qr-semi-final`
- Branch: `rebrand/visual-identity-from-scratch`
- Base: `main` em `bc9727ef336888fa39634f5eeb579af940c2c387`
- Escopo: landing, autenticação, área administrativa, telas operacionais, páginas institucionais e PWA.
- Exclusão absoluta: menu do cliente em `#/mesa/:token`.

A auditoria foi feita sobre os arquivos da `main` antes das alterações desta branch. A implementação é uma nova direção visual chamada **Estação**, não uma continuação da linguagem visual existente na base.

## 1. Inventário de cores, fontes, componentes e estilos hardcoded

| Área / arquivo na main | Situação encontrada | Tratamento nesta branch |
|---|---|---|
| `public/garcom-pwa/design-tokens.css` | Fonte compartilhada parcial, mas com paletas e aliases diferentes para superfícies, operação e estados | Recriado como fonte central Estação para SPA/PWA, incluindo cores, tipografia, radius, spacing, elevação e motion |
| `src/index.css` | Tailwind v4 e estilos globais referenciavam a identidade anterior; regime expressivo tinha grade e cartões com aparência de vidro | Tokens centralizados; superfícies sólidas; grade e sheen decorativos desativados |
| `src/lib/tema.ts` | Fallback TypeScript repetia valores hex separados do CSS | Valores essenciais sincronizados com os temas claro/escuro |
| `src/screens/landing/styles/main.css` | Tokens locais `--paper`, `--pine`, `--accent`, muitas cores hex/rgba e tipografia local não compartilhada | Paleta conectada aos tokens globais; DM Sans + Kalam; cenas sticky reutilizáveis |
| `src/screens/dashboard.css` | Gradientes, sombras e tokens operacionais específicos; regras duplicadas de breakpoint; declarações inválidas em `border-radius` | Superfícies sólidas; tokens Estação; correções de sintaxe; KPI cards em duas colunas no mobile e painéis em largura total |
| `src/screens/operacional.css` | Fundo radial/linear, grade decorativa e cartões translúcidos | Cozinha/bar com superfícies sólidas e estados semânticos |
| `src/components/AuthModal.css` | Radius, sombra e font stack locais | Tokens globais e geometria compartilhada |
| `src/screens/login-fields.css` | Campos quadrados e sombra local | Radius e foco padronizados |
| `src/components/OpsShell.css` | Raios locais no shell de navegação | Tokens de radius |
| `public/garcom-pwa/styles.css` | Folha própria do PWA, com tipografia e decisões visuais independentes | Consome tokens compartilhados e fontes locais novas |
| `public/garcom-pwa/theme-init.js`, `app.js`, `index.html`, `sw.js` | Cor do navegador e cache de fontes independentes | Theme-color sincronizado e shell versionado com DM Sans/Kalam/JetBrains Mono |
| `public/style.css` e `public/style-ops.css` | CSS legado com paleta própria, fonte externa e variáveis antigas | Mantidos como base de compatibilidade; páginas de operação recebem `admin-identity.css` após os estilos legados |
| `public/theme-glass.css` | Camada antiga forçava fundo escuro, laranja e glassmorphism nas páginas operacionais | Link removido das páginas administrativas/operacionais |
| `public/admin.html`, `caixa.html`, `cozinha.html`, `bar.html`, `garcom.html`, `login.html` | Páginas estáticas legadas tinham pilha de estilos separada | Carregam a ponte `admin-identity.css`, que importa os tokens centrais |
| `public/apresentacao.html`, `public/guia-sistema.html` | Variáveis e cores inline independentes | Carregam `public-identity.css` após o estilo local |
| `public/termos-de-uso.html`, `termos-de-servico.html`, `politica-de-privacidade.html` | Superfícies e tipografia próprias | Carregam a camada institucional comum |
| `src/lib/print.ts` | Preto/branco e fontes mono nas folhas de impressão | Mantido intencionalmente: impressão térmica/A4 requer tinta e contraste próprios |

### Ícones e componentes
- A landing tinha SVGs inline próprios em `src/screens/landing/components/Icon.tsx`; agora usa `@phosphor-icons/react`, alinhado ao set do produto.
- Landing, login, dashboard, cozinha/bar e PWA tinham tratamentos visuais distintos.
- O PWA tinha fontes e theme-color independentes.
- O HTML legado usava a camada `theme-glass.css` para forçar dark/orange/glass.

## 2. Auditoria de e-mails
- Busca pelo literal `deividmoura729249@gmail.com` e pelo fragmento `deividmoura729249` na base auditada: **zero ocorrências encontradas**.
- A busca encontrou o endereço anterior `dejesusdemouradeivid@gmail.com` em documentação, contato da aplicação e páginas legais. Foi substituído por `servicosdegestaoqradmin@gmail.com`.
- Arquivos revisados: `src/screens/landing/contato.ts`, `src/screens/Login.tsx`, seções de contato/rodapé/ações flutuantes, `README.md`, documentação do fornecedor e de titulares, páginas legais e testes/scripts de apresentação.
- WhatsApp permanece centralizado no módulo de contato; e-mail aparece como ação por ícone nas áreas visuais, sem endereço textual como link.

**Atenção jurídica antes da publicação:** o endereço novo foi definido como contato oficial do serviço. A documentação antiga registrava monitoramento e prazo operacional de resposta do endereço anterior. Esses compromissos não foram automaticamente transferidos: monitoramento e SLA do endereço novo precisam ser confirmados pelo responsável antes da publicação da versão legal.

## 3. Responsividade identificada na main

### Dashboard
- A grade principal usa 12 colunas em desktop, reduz para 8 em tablet e 4 em mobile.
- A regra mobile anterior forçava todos os cards/widgets a ocupar as 4 colunas, empilhando indicadores desnecessariamente.
- Havia regras repetidas para 1050, 700 e 420 px, com precedência difícil de acompanhar.
- Estatísticas de mesas não tinham regra mobile explícita para duas colunas.
- Nesta branch: KPIs ocupam 2 colunas no mobile (dois por linha); painéis analíticos ocupam 4; estatísticas de mesas passam para 2 colunas; widgets podem rolar dentro do próprio painel.

### Outras áreas
- `admin-responsive.css` já tinha regras de adaptação de tabelas; conferir no CI e nos screenshots.
- Cozinha/bar precisam manter legibilidade e alvos de toque em 320–420 px.
- Landing reorganiza o painel sticky e a lista de etapas em uma coluna.
- PWA respeita safe areas, viewport dinâmico e conteúdo de toque.

## 4. Telas que divergiam da identidade
1. **Landing:** paleta própria, tokens locais e fontes separadas.
2. **Login/modal:** radius e sombras independentes; contatos duplicados.
3. **Dashboard:** ambiente escuro com grade, gradientes e efeitos de palco.
4. **Cozinha/bar:** linguagem escura e translúcida separada.
5. **PWA:** folha de estilos, fontes e theme-color próprios.
6. **Páginas HTML legadas:** `theme-glass.css` forçava dark/orange/glass; `style.css` mantinha paleta e fontes anteriores.
7. **Apresentação/guia/termos:** CSS inline independente.

O menu do cliente é a única exceção visual solicitada e permanece intocado.

## 5. Contraste e tema claro/escuro
- A base tinha variáveis de superfície claras e textos secundários com níveis diferentes entre landing, dashboard, PWA e páginas estáticas.
- Algumas páginas usavam branco puro como superfície; outras usavam texto secundário claro em superfícies escuras translúcidas.
- O tema escuro tinha tons de fundo diferentes entre SPA, PWA e páginas legadas.
- Nesta branch: superfícies claras são névoa mineral, texto secundário tem contraste reforçado, dark mode usa verde profundo com tinta clara, e estados semânticos não são usados como decoração.
- `tests/design-system.test.cjs` verifica os pares semânticos e a fonte offline; `tests/design-tokens-identidade.test.cjs` verifica tokens, ausência de paleta literal em dashboard/operação e exceção do menu.

## Implementação desta branch
- [x] Nova direção visual Estação documentada em `docs/DESIGN_SYSTEM.md`.
- [x] Tokens compartilhados SPA/PWA centralizados.
- [x] Tipografia DM Sans + Kalam + JetBrains Mono local.
- [x] Landing com narrativa mesa → cozinha/bar → garçom → caixa.
- [x] Linha SVG de progresso e painel sticky com capturas reais.
- [x] Continuação da narrativa para dashboard, cardápio/estoque e mapa de mesas.
- [x] Phosphor como set de ícones da landing.
- [x] E-mail e canais de contato centralizados.
- [x] PWA theme-color e precache atualizados.
- [x] Páginas operacionais legadas conectadas aos tokens compartilhados.
- [x] Exceção do menu do cliente explicitamente isolada.

## Verificação obrigatória antes de aprovar
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run test:regression`
- [ ] `npm run test:landing`
- [ ] `npm run test:e2e`
- [ ] Desktop: 1280/1440/1920 px, claro e escuro.
- [ ] Mobile: 320/360/390/430 px, claro e escuro.
- [ ] Tablet: 768/1024 px.
- [ ] Dashboard: KPIs, widgets, tabelas, filtros, edição de layout e modais.
- [ ] Cozinha/bar: fila, atualização de estado, texto legível e toque.
- [ ] Login/modal: campos, validação, teclado virtual e links de contato.
- [ ] PWA instalada: primeiro carregamento, atualização do shell, modo offline e safe areas.
- [ ] Landing: sete cenas de pedido, três cenas de gestão, linha progressiva e capturas carregadas.
- [ ] Contatos: WhatsApp, e-mail e endereço oficial em todos os pontos de entrada.
- [ ] Confirmar monitoramento/SLA do novo e-mail de privacidade antes de publicar.
- [ ] Confirmar que `#/mesa/:token` mantém CSS, cores e comportamento próprios.

## Regras de análise da main antes do merge
1. Comparar novamente a branch com a `main` imediatamente antes da aprovação.
2. Revisar todo o diff; não descartar alterações concorrentes da main.
3. Confirmar que não houve mudanças em API, autenticação/autorização, banco/migrations, pagamentos, regras de negócio, SSE, voz, sincronização ou offline além do cache visual do PWA.
4. Verificar que o build versionado corresponde ao código-fonte e que os cinco comandos de validação estão verdes.
5. Conferir screenshots de desktop/mobile, tema claro/escuro e PWA instalada.
6. Conferir que o menu do cliente não foi alterado.
7. Confirmar o endereço de privacidade e o SLA com o responsável.
8. **Não fazer merge, release ou deploy automaticamente.** A integração e a publicação dependem da conferência e aprovação explícita do responsável pelo QR Admin.

## Limitação de execução
A implementação foi feita diretamente na branch remota via GitHub. Os comandos npm/Playwright não foram executados em um checkout local nesta etapa; seus resultados devem ser confirmados pelo CI do PR antes da aprovação. Nenhum teste é declarado aprovado sem resultado verificável.
