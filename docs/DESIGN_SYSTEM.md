# Design System — QR Admin / Estação

## Direção visual

**Estação** representa o trabalho coordenado entre mesa, salão, cozinha, bar e caixa. A interface usa verde mineral como cor de ação, superfícies de névoa como base e um acento cítrico para orientar atenção e estados pontuais. A direção é diferente da identidade anterior: não usa laranja/brasa, roxo/índigo, gradientes de palco, vidro ou glow.

A marca aparece por hierarquia, tipografia, ritmo e consistência — não por pintar todos os componentes com a cor primária.

## Tokens centrais

Fonte única: `public/garcom-pwa/design-tokens.css`. A folha é importada pela SPA (`src/index.css`) e pelo PWA (`public/garcom-pwa/styles.css` e shell HTML). O fallback TypeScript em `src/lib/tema.ts` espelha apenas os tokens essenciais usados antes da hidratação.

| Papel | Claro | Escuro |
|---|---|---|
| Fundo | `#f0f4f0` | `#142622` |
| Superfície elevada | `#fafcf9` | `#1d3430` |
| Superfície rebaixada | `#e4ece7` | `#0f1e1b` |
| Texto principal | `#1d302f` | `#ecf4ee` |
| Texto secundário | `#506763` | `#b4c8be` |
| Marca / ação | `#176d63` | `#78c8b6` |
| Acento cítrico | `#c4d66a` | `#d7e98a` |

Estados semânticos permanecem separados da marca: sucesso, atenção, informação e erro. Eles não são usados como decoração de cards. Os tokens foram escolhidos para manter contraste mínimo AA em texto normal nos pares principais e nos botões.

## Tipografia

- **DM Sans** — display, interface, formulários e corpo. Arquivo variável local em `public/fonts/landing/dm-sans-latin-wght-normal.woff2`.
- **Kalam** — ênfase editorial pontual na landing; não é usada para texto funcional ou números.
- **JetBrains Mono** — horários, identificadores, metadados, valores tabulares e labels técnicas.

Não há dependência de Google Fonts em runtime. As fontes necessárias ao PWA estão no precache offline.

## Geometria e ritmo

- Espaçamento em múltiplos de 4 px (`--space-1` a `--space-9`).
- Raios: 6, 10, 14, 18 e 24 px; controles de toque com mínimo de 44 px.
- Elevação em quatro níveis, aplicada a overlays e superfícies que realmente precisam de separação. Cards comuns usam borda e superfície, sem sombra pesada.
- Conteúdo desktop com largura máxima de 1240 px e gutters fluidos.
- Tabelas e painéis devem preservar legibilidade; em viewport estreita, dados densos podem rolar horizontalmente dentro do próprio contêiner, nunca a página inteira.

## Componentes e ícones

- Um único conjunto de ícones: **Phosphor**. A landing usa `@phosphor-icons/react`; SPA e PWA usam os símbolos equivalentes do sprite Phosphor.
- Botões primários usam verde mineral; o acento cítrico fica restrito a destaque de estado, seleção ou progresso.
- Formulários usam superfície elevada, borda de contraste suficiente e foco visível.
- Dashboard, cozinha e bar usam superfícies sólidas. Não há glassmorphism, glow, grade decorativa ou gradiente de fundo.
- Cards de KPI podem dividir linha no mobile; painéis de gráficos e tabelas ocupam a largura disponível.

## Motion e acessibilidade

- A linha SVG da landing progride conforme a etapa ativa entra na região de leitura. O painel de demonstração atualiza para a captura real daquela etapa.
- Não há fade-up genérico aplicado a todas as seções.
- `prefers-reduced-motion` reduz transições e animações.
- Foco visível, labels acessíveis e áreas de toque são mantidos.

## Temas

O atributo `data-theme="claro|escuro"` controla SPA e PWA. `prefers-color-scheme` é fallback antes da preferência explícita. `src/lib/tema.ts`, `theme-init.js` e `app.js` mantêm o mesmo conjunto de cores, inclusive a cor da barra do navegador.

## Landing: narrativa do serviço

A landing tem duas histórias sincronizadas com scroll:
1. **Pedido:** QR na mesa → personalização → comanda → cozinha → bar → garçom → caixa.
2. **Gestão:** indicadores → cardápio/estoque → mapa de mesas.

O componente `ScrollStory` usa IntersectionObserver para ativar a etapa, desenha uma linha SVG progressiva e atualiza um painel sticky com capturas reais versionadas em `public/assets/apresentacao/`. Não cria números, depoimentos ou resultados de venda.

## Responsividade

- Dashboard: desktop em 12 colunas, tablet em 8, mobile em 4 colunas; KPIs ocupam 2 colunas no mobile (dois por linha) e painéis analíticos ocupam 4.
- Estatísticas de mesas passam a 2 colunas no mobile.
- Operação de cozinha/bar reduz padding e preserva alvos de toque.
- Landing reorganiza a narrativa em uma coluna; o painel de captura fica sticky acima das etapas.
- PWA respeita safe areas e usa os mesmos tokens em telas estreitas.

## Exceção deliberada — menu do cliente

O menu servido em `#/mesa/:token` (e seu shell estático correspondente) **não participa deste design system**. O estabelecimento pode definir sua identidade e cores próprias. Não importar `admin-identity.css` ou `public-identity.css` nas páginas de menu, não editar `src/screens/mesa-praia.css` e não alterar os estilos específicos do cardápio.

## Contatos

O e-mail oficial do serviço é `servicosdegestaoqradmin@gmail.com`. A landing, login, rodapé, ações flutuantes e páginas institucionais usam o mesmo destino. O canal de privacidade foi atualizado nos documentos; o monitoramento e o prazo operacional de resposta precisam ser confirmados antes da publicação da revisão legal.

## Impressão

Os estilos de impressão em `src/lib/print.ts` continuam usando preto/branco e fontes monoespaçadas quando apropriado: isso é um requisito de legibilidade e economia de tinta do papel, não uma tela do produto.
