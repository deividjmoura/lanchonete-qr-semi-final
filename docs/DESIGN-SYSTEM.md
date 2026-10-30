# QR Admin · design system

## Diagnóstico

A SPA React e a PWA tinham cores e tipografias independentes. O fallback inline do tema React também divergia do CSS. Isso gerava mudanças de identidade entre Mesa, operação e atendimento, e controles ativos pouco legíveis no escuro. O menu de postos disputava espaço com as ações no header desktop.

## Direção aplicada

Food-tech discreta: superfícies neutras com leve matiz verde, coral para ação, verde para sucesso; títulos sem serifa, menos ornamentação e fotografias preservadas. A referência de dashboard foi usada apenas como princípio de organização lateral.

| Elemento | Claro | Escuro |
| --- | --- | --- |
| Fundo | `#f5f7f4` | `#141d19` |
| Cartão/header | `#ffffff` | `#1c2623` |
| Texto principal | `#21382b` | `#eef4ef` |
| Texto secundário | `#596b62` | `#b0c3b7` |
| Ação preenchida | `#bf402e` + branco | igual, contraste ≥ 4,5:1 |
| Sucesso preenchido | `#26704f` + branco | igual, contraste ≥ 4,5:1 |

- **Tipografia:** Manrope variável 200–800, hospedada localmente; fallback de sistema. Licença em `public/garcom-pwa/fonts/OFL.txt`. Valores monetários tabulares e métricas dimensionadas pelo cartão.
- **Componentes:** cartões 18 px, campos/botões 12 px, pílulas de estado arredondadas. Ações principais sem gradiente claro sob texto branco. Foco visível e preferência por movimento reduzido respeitados.
- **Espaçamento:** base de 4 px, margens mobile de 16 px, desktop de 24 px; títulos operacionais mais compactos.
- **Navegação:** os mesmos postos e permissões, em sidebar de 224 px a partir de 1024 px. No mobile, os controles operacionais continuam no topo; PWA mantém suas quatro abas inferiores. Não há novo menu, rota, estado ou fluxo.
- **Mesa ↔ PWA:** mesma fonte, paleta, superfícies e ação principal; marca compacta abaixo de 640 px. Fotos da Mesa com overlay restrito à base. PWA com campos, diálogos, status e conexão tematizados.

## Fonte única e tema

`public/garcom-pwa/design-tokens.css` é importado pelo Tailwind/React e diretamente pela PWA. O bootstrap já existente foi extraído para `public/garcom-pwa/theme-init.js` e compartilhado: ambos leem `qradmin-tema` e aceitam `claro/escuro` e os legados `light/dark`; sem preferência salva, seguem o sistema. O CSS também oferece fallback via `prefers-color-scheme`. A PWA respeita a seleção salva ao abrir/recarregar, sem acrescentar um novo controle de tema ou listener de estado.

`src/lib/tema.ts` preserva o mecanismo de compatibilidade com CSS cacheado, com valores atualizados. `tests/design-system.test.cjs` verifica que seus fallbacks não divergem dos tokens. O precache da PWA recebeu somente os novos assets visuais e incremento de versão: estratégias de fetch, sincronização, IndexedDB e notificações não foram alteradas.

## Correções preservadas / incorporadas

- `.fill-brand` / `.fill-success` para ativos e botões, inclusive escuro.
- Sem números decorativos nos cards de produção.
- Trilho de todos os dias no gráfico, inclusive dias zerados; kicker “gestão · salão”.
- Abas Pedido/Conta sem quebra; overlay de foto somente na base.
- Wordmark oculto abaixo de `sm`; halos de ambientação limitados a aproximadamente 0,06.
- Header PWA sem sobreposição, section-heading empilhável e tema escuro funcional.
- Animações `whileInView` da landing mantidas.

## Validação

```sh
npm run build:check
npm test
# Em outro terminal, servido em 0.0.0.0:
npm run preview -- --host 0.0.0.0 --port 4173
# Validação de layout com API simulada, sem gravar no banco:
node tests/e2e/visual-system.e2e.cjs
```

O teste visual usa Chromium já previsto no projeto (`playwright-core` + `@sparticuz/chromium`), build de produção e dados exclusivamente de teste. Capturas opcionais ficam fora do repositório, em `VISUAL_SCREENSHOTS_DIR`. Testes com PostgreSQL/aparelhos físicos e notificações reais não fazem parte desta revisão visual.

Resultado da revisão: build + TypeScript aprovados; 292 testes de regressão aprovados; 64 combinações de tela/tema/largura verificadas no Chromium, além de troca de abas, diálogos, preferência salva e recarga offline do shell visual. A API dos testes de layout é simulada; não houve escrita no banco.
