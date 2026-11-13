# Rebranding "Passe"

Relatório da troca de identidade visual do QR Admin: o que havia na `main`, o que foi decidido, o que
mudou, o que ficou de fora de propósito, como cada afirmação foi verificada e o que conferir antes de
mesclar.

| | |
|---|---|
| Base analisada | `main` em `bc9727ef336888fa39634f5eeb579af940c2c387` (merge do PR #295) |
| Branch | `arena/e3918b29-lanchonete-qr-semi-final` |
| Estado | Pull request #298 aberto para `main`, sem merge. **Mesclar na `main` publica em produção** (seção 14, regra 7) |
| Referência do cardápio | A `main` em `bc9727e`, **não a produção**, que estava um merge atrás (seção 4.5) |
| Exceção absoluta | Cardápio do cliente (`#/mesa/:token`): nenhuma diferença visual ou funcional |
| Fora do escopo | API, autenticação, banco, pagamentos, regras de negócio, SSE, voz, sincronização, offline |

> O briefing sugeria o nome de branch `rebrand/visual-identity-from-scratch`. Esse nome já existe no
> repositório remoto e pertence a outro trabalho (PR #297, rascunho), então não foi usado.

**Índice:** [1. Análise da main](#1-análise-da-main-antes-de-implementar) ·
[2. A identidade](#2-a-identidade-passe) · [3. O que mudou](#3-o-que-mudou-por-superfície) ·
[4. Cardápio do cliente](#4-cardápio-do-cliente-a-exceção-e-a-prova) · [5. Escopo](#5-o-que-não-mudou) ·
[6. Responsividade](#6-responsividade) · [7. Contraste](#7-contraste) ·
[8. Comportamento](#8-mudanças-de-comportamento-visíveis) · [9. Testes](#9-testes) ·
[10. Build](#10-build-só-de-produção) · [11. Limitações](#11-limitações-conhecidas) ·
[12. Decisões do dono](#12-pontos-para-o-dono-do-produto) ·
[13. Como alterar o cardápio](#13-como-alterar-o-cardápio) ·
[14. Antes do merge](#14-regras-para-analisar-a-main-antes-do-merge) ·
[15. Reproduzir](#15-como-reproduzir-as-verificações)

---

## 1. Análise da `main` antes de implementar

A análise foi feita sobre o código e sobre o build de produção de `bc9727e`, servido com o backend real
e um banco de demonstração. Os cinco eixos pedidos:

### 1.1 Inventário de cores, fontes, componentes e estilos fixos

Contagem fora do cardápio do cliente e fora de `dist/`. A coluna "agora" já é o resultado desta branch.

| Medida | `main` | agora |
|---|---:|---:|
| Cor em hexadecimal em `src/**/*.css` | 224 | 0 |
| `rgb()` / `hsl()` / `oklch()` em `src/**/*.css` | 45 | 0 |
| Cor em hexadecimal em `src/**/*.ts(x)` | 51 | 27 ¹ |
| `backdrop-filter` (SPA + PWA) | 8 | 0 |
| Gradientes em `src/**/*.css` | 40 | 1 ² |
| Gradientes no CSS do PWA | 4 | 0 |
| Ocorrências de `card-neon` | 89 | 0 |
| Texto menor que 11px em TSX (`text-[6…10px]`) | 69 | 1 ³ |
| `rounded-full` em TSX | 23 | 9 |
| `!important` em `src/**/*.css` | 79 | 36 |
| `box-shadow` em `src/**/*.css` | 51 | 25 |
| Famílias tipográficas carregadas | 5 | 1 |
| Linhas de CSS em `src/` (com o cardápio) | 8.204 | 6.583 |
| `landing/styles/main.css` | 4.580 linhas | 1.713 linhas |
| Blocos `<style>` nas 5 páginas estáticas | 5 (819 linhas) | 0 |
| `style="…"` embutido nas 5 páginas estáticas | 7 | 0 |

¹ Das 27, 7 são números de issue em comentários (`#153`, `#154`). As 20 cores reais estão em
`src/lib/print.ts` (16, comprovante impresso: papel, não tela), `src/lib/mappers.ts` (2, a imagem
"sem foto", que o cardápio também usa) e `src/lib/tema.ts` (2, tinta e papel do QR Code).
² As linhas de grade do gráfico de faturamento: função, não decoração.
³ `src/components/ConfirmacaoGlobal.tsx`. O componente também aparece dentro do cardápio, então a
marcação ficou intacta; fora do cardápio a regra de `src/styles/passe.css` leva o rótulo a 11px.

As cinco famílias da `main`: Fraunces, Plus Jakarta Sans e JetBrains Mono no sistema (130.184 bytes) e
DM Serif Display e DM Sans só na landing (86.136 bytes).

### 1.2 Auditoria de e-mails

O endereço pessoal que servia de contato aparecia 23 vezes em 11 arquivos (landing, páginas legais,
guia, README, documentação e testes). Hoje não aparece em nenhum arquivo versionado nem em `dist/`;
por isso ele também não está escrito neste relatório.
O endereço em uso é `servicosdegestaoqradmin@gmail.com`. O SPA o define uma única vez, em
`src/screens/landing/contato.ts`; as páginas estáticas e a documentação não conseguem importar e o
repetem por extenso. `tests/contato-oficial.test.cjs` (6 testes) falha se alguma cópia divergir ou se
qualquer outro endereço real surgir em código, páginas, documentação ou no build. Dois endereços ficaram porque não
são contato do produto: `info@indiantypefoundry.com` (texto da licença de fonte) e
`funcionario@gmail.com` (exemplo de preenchimento de campo).

### 1.3 Responsividade

Medido no painel administrativo com o backend real, mesmos dados, mesmo script, builds de produção.

| Largura | `main`: cartões sobrepostos | `main`: textos < 11px | agora: sobrepostos | agora: textos < 11px |
|---:|---:|---:|---:|---:|
| 320px | 11 pares (12 cartões) | 35 de 94 | 0 | 0 de 93 |
| 390px | 11 pares | 35 de 94 | 0 | 0 de 93 |
| 768px | 10 pares | 23 de 94 | 0 | 0 de 93 |
| 1100px | 0 | 23 de 94 | 0 | 0 de 101 |

No celular, cada cartão de indicador da `main` avança só 93px em relação ao anterior (linha de grade de
84px mais 9px de intervalo) e precisa de bem mais que isso. O conteúdo vaza e o cartão seguinte cobre o
valor do anterior. Não é rolagem horizontal (o estouro medido é 0px), é informação escondida.

> *Comparação visual:* as imagens antes/depois desta seção saíram do repositório na limpeza de
> 13/11/2026 (eram 14 MB de PNGs descrevendo telas que não existem mais). Os números medidos acima
> continuam sendo a evidência; para reconferir, rode a captura em `scripts/capturar-apresentacao.mjs`.

### 1.4 Telas que divergiam da identidade

- **Landing.** Tinha folha de estilo, paleta e duas famílias próprias, e ignorava o tema escolhido: a
  medição de contraste devolve os mesmos números no claro e no escuro.
- **Páginas estáticas** (`apresentacao`, `guia-sistema`, `politica-de-privacidade`, `termos-de-servico`,
  `termos-de-uso`). Cada uma trazia o próprio `<style>` e nenhuma aplicava o tema.
- **Painel.** A própria folha de estilo se apresentava como "estilo isolado do dashboard": um palco
  escuro só dele, diferente das outras telas internas.
- **PWA do garçom.** Usava os tokens do sistema, mas com gradientes e um ícone corrompido: o
  `icon-512.png` da `main` é recusado pelo decodificador de PNG (`libpng read error`). Foi refeito.

### 1.5 Contraste nos temas claro e escuro

Medido na tela renderizada (método na seção 7). Nas telas públicas da `main`: 32 estados, 2.930 textos,
**258 pares abaixo de AA**, 238 deles na landing, que além disso tinha texto de 6 a 10px.

No painel, um defeito de sintaxe: em `src/screens/dashboard.css` da `main` falta o ponto e vírgula depois
de `border-radius: var(--radius-lg)`. A declaração seguinte, o `background` do palco escuro, é
descartada junto. O palco nunca é pintado e, no tema claro, o título "Os números da sua casa." fica em
`rgb(245, 247, 255)` sobre `rgb(228, 232, 241)`: **1,15:1**. Hoje o mesmo título mede 14,39:1.

---

## 2. A identidade "Passe"

O passe é o balcão onde o pedido sai da cozinha para o salão. O nome dá duas figuras que organizam o
sistema inteiro, em vez de um tema aplicado por cima:

- **A linha de passe.** Um traço contínuo com estações. É a navegação lateral das telas internas e o
  fio da narrativa da landing.
- **A plaquinha de mesa.** O número da mesa em placa sólida, nas telas operacionais, no painel e no PWA
  do garçom.

**Paleta.** Tirada do logotipo oficial, que foi mantido: tinta `#0c2c4c`, sinal (menta) `#6cdccc`,
areia `#e4cc94` e papel `#f4efe6`. No tema claro a marca é a tinta sobre papel; no escuro, a menta
sobre azul profundo. Cores de estado (pronto, atenção, erro) seguem separadas da cor de marca.

**Tipografia.** Uma família só, Archivo Variable (licença OFL), em um arquivo de 90.104 bytes. A
hierarquia vem da largura da letra: larga (118%) para títulos, normal para leitura e estreita (~80%)
com algarismos tabulares para números. Foram avaliadas e descartadas: Bricolage Grotesque (a cauda do
"Q" lê como sublinhado em "QR"), Sora, Outfit e Manrope (geométricas sem caráter), Schibsted Grotesk
(algarismos tabulares frouxos), Familjen Grotesk (pesos só de 400 a 700) e Figtree como segunda
família de texto (ganho pequeno para o custo de mais um arquivo).

**Forma.** Raios curtos (3 a 10px), réguas de 1px, superfícies planas. Sem vidro, sem brilho neon, sem
gradiente decorativo. Cartão tem só uma aresta de 1px na base; sombra difusa existe apenas em camada
que flutua sobre a tela (modal).

A referência completa de tokens e componentes está em [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).
A fonte única de tokens é `public/garcom-pwa/design-tokens.css`, usada pelo SPA, pelo PWA e pelas
páginas estáticas. `tests/design-tokens-identidade.test.cjs` (12 testes) impede cor literal fora de
`@media print`, texto abaixo de 11px e a volta dos tokens antigos.

---

## 3. O que mudou, por superfície

| Superfície | Arquivos principais | O que mudou |
|---|---|---|
| Fundação | `public/garcom-pwa/design-tokens.css`, `src/index.css`, `src/styles/passe.css`, `src/components/ui.tsx` | Tokens novos, primitivos (botão, campo, selo, modal, plaquinha) e símbolo reduzido para favicon e ícones |
| Landing | `src/screens/landing/**` | Reescrita: narrativa de rolagem, capturas reais, contato por ícones, respeita o tema |
| Login | `src/screens/Login.tsx`, `login-fields.css`, `src/components/AuthModal.*`, `AuthFlow.tsx` | Mesma estrutura e mesma lógica de foco e teclado, nova aparência |
| Casco das telas internas | `src/components/OpsShell.*` | Linha de passe: trilho fixo de 72px no computador, gaveta no celular |
| Painel | `src/screens/Dashboard.tsx`, `dashboard.css` | Grade sem sobreposição, tipografia de dado, modo de edição preservado |
| Cozinha, bar, caixa | `src/components/FilaProducao.tsx`, `src/screens/operacional.css`, `Caixa.tsx` | Filas e fechamento na nova identidade |
| Administração | `src/screens/Admin.tsx`, `src/screens/admin/*` | Cardápio, mesas, garçons, funções, segurança da conta |
| PWA do garçom | `public/garcom-pwa/*` | Estilos, ícones, cores do manifesto, cache do shell v42 → v43 |
| Páginas estáticas | `public/institucional.css` + 5 páginas | Uma folha de estilo comum, com tema claro e escuro |

Ao todo, 143 arquivos alterados fora de `dist/` (29 novos, 8 removidos, 103 modificados, 3 movidos),
contando este relatório e as quatro imagens de comparação.

### 3.1 Landing: narrativa de rolagem

As três referências do briefing mostravam a mesma ideia: uma linha que avança com a rolagem e um
painel fixo que troca de cena. Aqui a linha é a linha de passe e as cenas são as seis estações do
pedido: Acessar, Escolher, Encaminhar, Preparar e entregar, Fechar, Acompanhar.

`src/screens/landing/usePercurso.ts` lê a posição de rolagem uma vez por quadro e produz duas coisas:
a variável CSS `--percurso` (de 0 a 1), que estica o traço aceso sem re-renderizar o React, e o índice
da estação ativa, que troca a captura no painel fixo. É um listener passivo de `scroll` com
`requestAnimationFrame`; nenhuma biblioteca foi adicionada. Com `prefers-reduced-motion`, as cenas
trocam sem transição.

Cada estação mostra uma **captura real do sistema**, tirada do banco de demonstração por
`scripts/capturar-apresentacao.mjs` (10 imagens em `public/assets/apresentacao/`). As capturas foram
refeitas sobre o build final. As capturas do cardápio do cliente mostram o cardápio como ele é, com a
identidade própria que foi preservada.

> *Comparação visual:* as capturas antes/depois da landing saíram do repositório na mesma limpeza de
> 13/11/2026. A landing atual pode ser vista em `#/` e capturada de novo pelo script acima.

### 3.2 Contato por ícones

WhatsApp e e-mail aparecem lado a lado, como ícones com nome acessível, em três pontos: ações
flutuantes (`components/FloatingActions.tsx`), seção de contato (`sections/ContatoSection.tsx`) e
rodapé (`sections/Footer.tsx`). Os três importam de `src/screens/landing/contato.ts`. O número do
WhatsApp não mudou (`https://wa.me/5547996162721`).

### 3.3 Páginas legais

O texto das três páginas legais foi comparado frase a frase com o da `main`. As únicas diferenças são
o endereço de e-mail e a data de "Última atualização" (seção 12).

---

## 4. Cardápio do cliente: a exceção e a prova

O cardápio (`src/screens/Mesa.tsx`, `src/screens/mesa-praia.css` e as páginas legadas `public/mesa.html`
e `public/pedido.html`) não foi redesenhado. Os arquivos dele estão byte a byte iguais aos da `main`.

Isso não bastava. O cardápio herdava tokens, fontes e regras globais do produto, justamente o que o
rebranding troca. A solução tem três peças:

1. **Identidade congelada.** `scripts/gerar-identidade-cardapio.mjs` lê os estilos como eram em
   `bc9727e` e gera `src/screens/cardapio-identidade/identidade-cardapio.css`, reescrevendo só o escopo
   de cada regra para `html[data-identidade="cardapio"]`. As três fontes antigas foram para
   `src/screens/cardapio-identidade/fontes/`.
2. **Chave no `<html>`.** `public/garcom-pwa/theme-init.js` liga `data-identidade="cardapio"` antes do
   primeiro paint quando a rota é `#/mesa/…`; `src/lib/identidade.ts` mantém a chave nas trocas de rota.
   Toda regra global nova fica sob `html:not([data-identidade="cardapio"])`.
3. **Prova executável.** `npm run test:cardapio-intacto`.

### 4.1 O que a prova compara

`scripts/verificar-cardapio-intacto.mjs` extrai o `dist/` de `bc9727e`, serve os dois builds lado a
lado e abre o cardápio nos dois em Chromium, com a mesma API simulada e o mesmo relógio. Percorre 9
estados (cardápio, busca, produto, barra de pedido, carrinho, conta, comanda enviada, conta após o
envio, troca de tema) em celular e computador, tema claro e escuro: 36 combinações.

Resultado sobre o build final desta branch:

| Camada | Resultado | Folga |
|---|---|---|
| Marcação | 18.852 elementos, 35.556 atributos e todos os textos iguais | nenhuma ⁴ |
| Estilo computado | 477 propriedades por elemento, caixas de layout e 31.320 custom properties iguais | nenhuma |
| Pixels | 31 de 36 estados idênticos; nos outros 5, no máximo 33 pixels, com diferença de até 2/255 | 0,02% do quadro e 16/255 |
| Arquivos baixados | 21 imagens e fontes com os mesmos bytes | nenhuma |
| Arquivos exclusivos | 31 arquivos idênticos à base | nenhuma |

⁴ Duas diferenças são admitidas, ambas só no elemento `<html>`: o atributo
`data-identidade="cardapio"` e os tokens que a `main` gravava como `style` embutido e agora vêm da
folha congelada. O valor computado de cada um deles é conferido e é igual.

### 4.2 Por que existe folga nos pixels

O Chromium não desenha a mesma página duas vezes de forma idêntica: nesta execução, a base comparada
com ela mesma divergiu em até 414 pixels numa tela de computador e em até 69 pixels (7/255) no celular.
Por isso a prova renderiza a base duas vezes, mede esse ruído e o imprime ao lado de cada linha. As
cinco diferenças de pixel desta branch (6 a 33 pixels, até 2/255, todas no celular) são menores que as
que a base produziu contra si mesma. A folga do celular é de 66 pixels; a do computador, 260.

A opção `--autoteste` compara a base com a base pelo mesmo caminho. Ela mede o método, **não** é a
prova desta branch.

### 4.3 A prova detecta mudança?

Quatro alterações foram plantadas de propósito; a prova falhou nas quatro:

- uma cor de `#bf3b11` para `#bf3c11` (um nível em um canal), também num build de produção;
- um acento removido do texto de exemplo do campo de busca ("cardápio" → "cardapio"), direto no
  JavaScript já compilado;
- `translateX(0.25px)` no ícone do botão de tema;
- três níveis de cor em um único pixel de `logo/qradmin-mark.png`.

### 4.4 O que a prova não alcança

Usa API simulada, movimento reduzido, 9 estados e 2 larguras; não captura foco nem hover. Essas
lacunas são cobertas de forma estática por `tests/cardapio-isolamento.test.cjs` (10 testes, rodam no
CI): nenhuma regra de fora consegue casar com um elemento do cardápio, o cardápio não consome token
que só a identidade nova define, e os nomes globais (animações, fontes, camadas) não colidem.

A prova visual **não roda no CI**: precisa também do build da base e leva cerca de 3 minutos. Rode-a
antes do merge. O workflow `postgres-integration.yml` já tem Chromium, então incluí-la lá parece
viável; não foi tentado neste PR.

Dos 21 módulos compartilhados que também desenham o cardápio, 7 mudaram: `index.html`,
`public/garcom-pwa/theme-init.js`, `src/App.tsx`, `src/components/ui.tsx`, `src/lib/identidade.ts`,
`src/lib/tema.ts` e `src/main.tsx`. O efeito deles sobre o cardápio é exatamente o que a tabela mede.

### 4.5 A referência é a `main`, não a produção

Tudo acima compara com a `main` em `bc9727e`. No dia deste PR (10/11/2026), a produção
(`qradmin.up.railway.app`) não estava nesse commit: servia `a044980` (PR #294). O deploy de `bc9727e`
(PR #295, "Comanda de Chapa") ficou cerca de cinco minutos no ar em 9/11/2026, e em seguida o deploy
anterior foi reativado.

O #295 alterou o cardápio, e este PR preserva o cardápio como o #295 o deixou. Comparado com o que a
produção serve, ele difere nas 36 combinações (de 1% a 19% dos pixels):

- o preço sobre a foto do produto trocou a fonte de título pela monoespaçada;
- o botão de tema, o de fechar e o seletor de quantidade do carrinho cresceram para 44px (eram 40, 40
  e 36px), e o que vem abaixo deles no carrinho desceu cerca de 8px;
- os raios diminuíram (`--radius-lg` de 24 para 20px, `--radius-md` de 20 para 16px);
- os tokens de marca passaram de violeta para brasa, e o anel de foco, de violeta para tinta escura.

*A comparação lado a lado (produção `a044980` × este PR) foi removida do repositório na limpeza de
13/11/2026. O cardápio em produção é a referência: `#/mesa/:token`.*

**Consequência:** publicar este PR muda o cardápio que o cliente vê hoje. A causa é o #295, que já está
na `main`, e não o rebranding. Para o cardápio ficar igual ao da produção, a referência teria de ser
`a044980` (seção 13, "Mudar a referência"), e os componentes compartilhados teriam de reproduzir, dentro
do cardápio, a marcação daquele commit.

Para reproduzir (falha em 36 de 36, como esperado):

```bash
npm run test:cardapio-intacto -- --base a044980511e5b0420001eac77b5f31d1e66ec53a
```

---

## 5. O que não mudou

Conferido com `git diff bc9727e`:

- **Nenhum arquivo** em `server/`, `server.js`, `db/`, `data/` ou `security/`.
- Em `src/lib/`, só `tema.ts` e o novo `identidade.ts`. `src/store/` (estado, chamadas de API, SSE,
  sincronização), `src/lib/api.ts` e `src/lib/print.ts` estão intactos. Nenhuma linha com `fetch` ou
  rota de API foi alterada.
- **PWA do garçom:** em `app.js`, só os dois valores de `theme-color`; em `confirmacao.js`, só o CSS do
  diálogo; em `sw.js`, o nome do cache (v42 → v43) e a lista de arquivos do shell. A fila offline, o
  IndexedDB, o SSE e a sincronização não foram tocados.
- **Tráfego de API idêntico:** a captura das telas no build final faz 34 requisições `/api/` no SPA e
  16 no PWA, todas 2xx, os mesmos números da `main`.
- **Páginas HTML legadas** em `public/` (`admin.html`, `caixa.html`, `cozinha.html`, `bar.html`,
  `garcom.html`, `login.html` e `public/index.html`): não foram alteradas. Com `dist/` presente, o servidor
  responde 302 e manda cada uma para a rota equivalente do SPA, então ninguém as vê.

Fora de `src/`, `public/`, `tests/`, `docs/`, `scripts/` e `dist/`, mudaram só `.github/workflows/ci.yml`
(busca o commit de referência do cardápio), `.gitignore`, `README.md`, `index.html`, `package.json` e
`package-lock.json` (dependência de desenvolvimento `postcss` e dois scripts npm:
`test:cardapio-intacto` e `test:contraste`).

---

## 6. Responsividade

Além da tabela do painel (seção 1.3), uma varredura no build final passou por 15 rotas em 6 larguras
(320, 390, 768, 1024, 1100 e 1280px): landing, login, as cinco seções da administração, cozinha, bar,
caixa e as cinco páginas estáticas.

- Rolagem horizontal: nenhuma.
- Texto fora da tela: nenhum.
- Texto cortado com reticências: um caso, o identificador do link do garçom (seção 11).

Alvos de toque em 390px: nenhum alvo isolado abaixo de 24px, o mínimo AA da WCAG 2.2. A regra adotada
está em `docs/DESIGN_SYSTEM.md` §9.

No painel, medido em 13 larguras de 320 a 1440px: nenhum nome de indicador cortado e nenhuma linha com
números desalinhados entre cartões vizinhos. No modo de edição, conferido em 4 combinações de largura
e tema, nenhum controle cobre texto.

---

## 7. Contraste

`npm run test:contraste` abre cada tela em Chromium, nos dois temas e em duas larguras, e compara a cor
pintada de cada texto com o fundo que está atrás dele. O critério é AA: 4,5:1, ou 3:1 para texto grande.

| | Estados | Textos | Pares abaixo de AA |
|---|---:|---:|---:|
| `main`, telas públicas | 32 | 2.930 | 258 |
| agora, públicas + internas (`--com-equipe`) | 84 | 7.224 | 0 |

Os 84 estados são 21 telas × 2 larguras × 2 temas: 8 públicas, as 5 seções da administração, as 3 abas
internas de Funções, cozinha e bar (como abrem e com as seções abertas) e caixa.

A medição apontou dois defeitos desta própria branch, corrigidos: as estações ainda não alcançadas no
percurso da landing (opacidade de 0,56 para 0,74) e a contagem da praça ativa em Mesas no tema escuro.

**Limites do método.** Mede só o estado em que a tela carrega. Não mede controles desabilitados, texto
de exemplo em campos, pseudo-elementos nem texto sobre imagem. O cardápio do cliente fica de fora por
definição. A comparação com a `main` cobre só as telas públicas, porque o build dela foi medido sem
login.

---

## 8. Mudanças de comportamento visíveis

Nada aqui altera dados ou regras. São diferenças que quem usa vai notar.

**Painel**
- O efeito de paralaxe que seguia o ponteiro foi removido.
- O número de cada indicador fica logo abaixo do nome e escala com a largura do cartão.
- Em cartões estreitos o nome quebra em duas linhas em vez de ser cortado.
- O selo "Agora" dos indicadores ao vivo foi para a linha de baixo do cartão.
- O rodapé de cada cartão reserva duas linhas, para as réguas alinharem entre vizinhos.
- O período selecionado (Hoje, Semana, Mês) aparece em cor sólida de marca.
- No modo de edição o conteúdo recua, e os controles de ocultar e arrastar não cobrem texto.
- Em "Mais pedidos" o nome do produto quebra em até duas linhas.

**Login**
- Em telas muito baixas (teclado aberto), o rodapé compacto esconde a linha de direitos reservados
  para o formulário caber sem rolagem.
- Os links "Termos de uso" e "Política de privacidade" têm área de toque de 30px de altura.

**Casco**
- No trilho lateral, cada estação mostra ícone e nome o tempo todo. Antes o nome só aparecia ao passar
  o ponteiro.
- A ampliação dos ícones ao passar o ponteiro (efeito de dock) foi removida.

**Landing**
- Estrutura nova. Respeita o tema claro ou escuro escolhido.

---

## 9. Testes

Resultado sobre o build final:

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | sem erros |
| `npm test` | 619 de 619 (a `main` tinha 595) |
| `npm run test:e2e` | 19 de 19 arquivos |
| `npm run test:cardapio-intacto` | 36 de 36 estados |
| `npm run test:landing` | 166 verificações |
| `npm run test:paginas-publicas` | 3 de 3 |
| `npm run test:contraste -- --com-equipe` | 84 estados, 0 abaixo de AA |
| `npm run smoke:panorama`, `fila`, `2fa`, `mesas` | 4 de 4 |

**O que o GitHub Actions roda a cada PR.** `ci.yml`: migrações e testes de integração em PostgreSQL
limpo, typecheck, build, três smokes e `npm test`. `postgres-integration.yml`: os demais testes de
integração com PostgreSQL e os E2E em Chromium. Não rodam lá, e precisam ser rodados à mão: a prova do
cardápio, a auditoria de contraste, `test:landing` e `test:paginas-publicas`.

**Testes novos**
- `tests/cardapio-isolamento.test.cjs` (10): o cardápio não é alcançado por regras de fora.
- `tests/contato-oficial.test.cjs` (6): um único endereço de contato, inclusive no build.
- `tests/dist-producao.test.cjs` (2): o `dist/` versionado é build de produção.

**Testes reescritos.** Os que fixavam a identidade anterior (nomes de token, classes como `card-neon`,
o dock, o paralaxe) passaram a fixar a nova. `tests/ops-shell-dock-visual.test.cjs` virou
`tests/ops-shell-linha-do-passe.test.cjs`. A lista completa sai de `git diff --stat bc9727e -- tests`.

Os testes de unidade que descreviam a aparência antiga (vidro, palco, dock) agora descrevem a nova; nos
que testam comportamento, só mudou o nome do seletor. Em três arquivos de E2E a **expectativa** mudou,
porque o comportamento mudou de propósito. Vale revisar estes com atenção:

| Arquivo | Antes exigia | Agora exige |
|---|---|---|
| `tests/e2e/dashboard-geral.e2e.cjs` | Os cartões inclinam acompanhando o ponteiro | Os cartões ficam parados |
| `tests/e2e/fixtures/dashboard.cjs` | Número do indicador com até 18px em telas de até 420px | Entre 18 e 26px (escala com o cartão) |
| `tests/e2e/visual-system.e2e.cjs` | Plus Jakarta Sans em todas as telas; nome da estação como dica ao passar o ponteiro; cardápio e PWA com a mesma superfície | Archivo em todas as telas **menos** o cardápio, que continua em Plus Jakarta Sans; nome da estação sempre visível; cardápio com a superfície antiga e PWA com a nova |

**Duas esperas corrigidas, sem mudar o que é testado**
- `scripts/verificar-landing.mjs`, "foco entra no modal ao abrir": o teste lia o foco antes dos 40ms que
  o modal leva para focar (comportamento igual ao da `main`). Passou a esperar até 1s pelo foco.
- `tests/e2e/login-field.e2e.cjs`: dormia 100ms fixos depois de redimensionar a janela. Neste ambiente o
  mesmo teste falhava também contra o build da `main`. Passou a esperar os quadros e as transições
  terminarem.

Em nenhum dos dois casos o código do produto foi alterado para o teste passar.

---

## 10. Build: só de produção

`dist/` é versionado e servido como está. **Gere-o sempre com `NODE_ENV=production npm run build`.**

Um `.env` local com `NODE_ENV=development` faz o `npm run build` produzir, sem aviso, um build de
desenvolvimento: JavaScript 46% maior (1.437.097 bytes contra 986.660), React em modo de
desenvolvimento e efeitos executados duas vezes (a captura das telas registrou 57 respostas de API em
vez de 34). A configuração do build não foi alterada.

`tests/dist-producao.test.cjs` falha se um build assim for versionado. Ele lê o `dist/` que está no
Git (o que já passou por `git add`), não a pasta em disco: um build recém-gerado só é conferido depois
de `git add dist`. O motivo é o CI, que regrava a pasta antes dos testes (ponto 6 da seção 12).

| Tamanho (produção) | `main` | agora |
|---|---:|---:|
| CSS | 214.114 B (gzip 38.668) | 197.265 B (gzip 31.703) |
| JavaScript, total | 998.740 B (gzip 274.829) | 986.660 B (gzip 271.247) |
| Fontes fora do cardápio | 216.320 B em 6 arquivos | 90.104 B em 1 arquivo |

---

## 11. Limitações conhecidas

- **Cardápio em relação à produção.** Idêntico ao da `main`, não ao que a produção servia no dia do PR
  (seção 4.5).
- **Identificador do link do garçom.** Em telas estreitas aparece abreviado com reticências, como na
  `main` (a marcação é a mesma). O botão "Copiar link" entrega o valor completo.
- **Botão "Comprovante" nas tabelas de Funções, no computador.** Tem 16px de altura, abaixo dos 24px
  recomendados; está dentro da exceção de espaçamento da WCAG (nenhum outro alvo a menos de 12px do
  centro). No celular tem 44px.
- **Controles de 40px.** Ícones do cabeçalho abaixo de 480px de largura, passos de quantidade do caixa
  e links de navegação da landing e das páginas estáticas ficam em 40px, não em 44px.
- **Topo da landing.** A captura do celular se sobrepõe à do painel e cobre o início de uma linha de
  texto dela. É composição, não defeito de layout.
- **Páginas HTML legadas** não foram redesenhadas (seção 5).
- **Estados não medidos pelo contraste** (seção 7) e **pelo cardápio** (seção 4.4).
- **Sem teste em aparelho físico.** Tudo foi verificado em Chromium neste ambiente. Safari no iOS e o
  PWA instalado num celular real não foram testados.

---

## 12. Pontos para o dono do produto

1. **A caixa `servicosdegestaoqradmin@gmail.com` precisa existir e ser lida.** A política de
   privacidade promete resposta por escrito em até 15 dias para pedidos de titulares. O texto dessa
   promessa já estava na `main`; o que mudou foi o endereço para onde os pedidos vão.
2. **Data das páginas legais.** "Última atualização" passou de 5 para 10 de novembro de 2026 nas três
   páginas, porque o canal de contato publicado mudou. Se a data deve marcar só mudanças de conteúdo
   jurídico, basta voltar o valor.
3. **Texto da apresentação.** A página afirma que as imagens "são capturas reais de um ambiente de
   demonstração com dados fictícios". É verdade hoje. Se uma tela mudar de aparência, gere as capturas
   de novo (`docs/DESIGN_SYSTEM.md` §10).
4. **PRs concorrentes.** #296 ("Comanda de Chapa") e #297 ("Estação") são outras propostas de
   identidade, em rascunho. Só uma das três direções pode entrar: escolha antes de mesclar.
5. **Aparelhos com o PWA instalado** buscam o novo shell quando abrirem o app com rede, porque o nome
   do cache mudou; pode ser preciso abrir uma segunda vez para a aparência nova aparecer. Vale conferir
   num celular de garçom depois do deploy.
6. **O CI gera o build em modo de teste, não de produção.** Os dois workflows (`ci.yml` e
   `postgres-integration.yml`) definem `NODE_ENV: test` para o job inteiro e rodam `npm run build` sem
   trocar esse valor. O resultado embute o React de desenvolvimento (JavaScript 46% maior) e nunca vai
   ao ar. Já era assim na `main`, e este PR não mudou isso. Duas consequências: os E2E do CI rodam
   sobre esse build, embora o comentário do workflow diga "build de produção"; e o build de produção
   só existe no `dist/` versionado, que o CI não gera. É também a explicação provável para o
   comentário do `ci.yml` sobre nomes de arquivo diferentes entre a máquina local e o CI (aqui, o
   build de produção sai idêntico byte a byte a cada vez). Para o CI exercitar o que vai ao ar, basta
   `env: NODE_ENV: production` nos dois passos de build. Não foi feito aqui porque muda o alvo dos E2E.
7. **Mesclar publica, e a produção está um merge atrás da `main`.** O Railway publica cada commit que
   entra na `main` cerca de um minuto depois (seção 14, regra 7). Como a produção ainda está em
   `a044980`, o deploy deste PR leva junto o que o #295 mudou, inclusive no cardápio do cliente (seção
   4.5). Se o cardápio precisa ficar igual ao que o cliente vê hoje, isso tem de ser resolvido antes do
   merge.

---

## 13. Como alterar o cardápio

O cardápio continua sendo uma tela normal do projeto. O que mudou é que a camada que ele **herdava** do
resto do produto agora é um arquivo gerado.

**Mudar o cardápio de propósito** (layout, texto, comportamento, estilo próprio): edite
`src/screens/Mesa.tsx` e `src/screens/mesa-praia.css` como sempre. Depois rode
`npm run test:cardapio-intacto`: ele vai acusar a diferença, e isso é o esperado. Leia a lista e
confirme que só aparece o que você quis mudar.

**Nunca edite `src/screens/cardapio-identidade/identidade-cardapio.css` à mão.** O arquivo é gerado e
`tests/cardapio-isolamento.test.cjs` falha se ele divergir do gerador.

**Mudar a referência** (por exemplo, se a `main` alterar o cardápio antes deste PR entrar):

```bash
# 1. aponte COMMIT_DE_REFERENCIA, em scripts/gerar-identidade-cardapio.mjs, para o novo commit
node scripts/gerar-identidade-cardapio.mjs          # regenera o arquivo congelado
NODE_ENV=production npm run build
npm run test:cardapio-intacto -- --base <novo commit>
```

**Levar o cardápio para a identidade "Passe"** é um projeto à parte: remover a chave
`data-identidade="cardapio"` (`theme-init.js`, `src/lib/identidade.ts`), apagar a pasta
`src/screens/cardapio-identidade/` e a importação dela em `src/index.css`, redesenhar a tela e aposentar
a prova e o teste de isolamento.

**Ao criar estilo global novo** em qualquer outra parte do produto: ponha-o em `src/styles/passe.css`,
dentro do bloco `:where(html:not([data-identidade="cardapio"]))`. Regra global fora desse bloco pode
alcançar o cardápio, e o teste de isolamento acusa.

---

## 14. Regras para analisar a `main` antes do merge

Este trabalho partiu de `bc9727e`. Antes de mesclar, confira o que a `main` virou desde então.

**1. A `main` andou?**

```bash
git fetch origin main
git rev-parse origin/main          # esperado: bc9727ef336888fa39634f5eeb579af940c2c387
git diff --stat bc9727e origin/main
```

Se o hash é o mesmo, vá ao passo 4. Se não, classifique cada arquivo que mudou:

**2. Classifique o que entrou na `main`.**

| O que mudou na `main` | O que fazer |
|---|---|
| Servidor, API, banco (`server.js`, `server/`, `db/`, `security/`) | Não conflita: este PR não toca nesses arquivos. Rode os testes. |
| Tela ou estilo que este PR reescreveu | Reaplique a mudança sobre a tela nova. **Não resolva o conflito ficando com o arquivo antigo inteiro**: ele traz de volta tokens e classes que não existem mais. |
| Cardápio do cliente ou o que ele herda (`Mesa.tsx`, `mesa-praia.css`, `public/mesa*`, `public/js/mesa-*`, `design-tokens.css`, `src/index.css`, `src/components/ui.tsx`) | Atualize a referência e regenere (seção 13). Rode a prova contra a nova `main`. |
| `dist/` | Nunca resolva à mão. Depois do rebase: `NODE_ENV=production npm run build`. |
| Texto com e-mail de contato | `npm test` acusa qualquer endereço diferente do oficial. |
| Páginas legais | Confira o texto: aqui só mudaram o e-mail e a data. |

**3. Sinais de que o conflito foi mal resolvido.** Se voltarem ao código `card-neon`, `--stage-*`,
`--glass-*`, `--elev-*`, `--prim-*`, `backdrop-filter`, o hook `useDockMagnify` ou o paralaxe do
painel, os testes de identidade falham. Não os reative para o teste passar: reescreva o trecho.

**4. Rode tudo sobre o resultado** (seção 15). A prova do cardápio, a auditoria de contraste,
`test:landing` e `test:paginas-publicas` não rodam no CI: rode-as à mão.

**5. Confira o que nenhum teste cobre.**
- O PWA instalado num celular: abre, atualiza o shell, envia pedido offline e sincroniza.
- Um comprovante impresso (`src/lib/print.ts` não mudou, mas é o caminho do dinheiro).
- Login com Google e segunda etapa (2FA) em tela real.
- A landing no Safari do iOS.

**6. Decida entre este PR, o #296 e o #297** antes de mesclar qualquer um (seção 12).

**7. Mesclar é publicar.** O Railway faz o deploy de produção de cada commit que entra na `main`, cerca
de um minuto depois do merge: é o que mostra o histórico de deployments do GitHub para os PRs #292 a
#295. Não existe etapa de deploy separada. Mescle só quando quiser a identidade nova no ar, e com a
caixa de e-mail criada. Antes, confira em que commit a produção está: se ela estiver atrás da `main`, o
deploy leva junto tudo o que ainda não foi publicado (seção 4.5).

```bash
# deployments de produção, do mais novo para o mais antigo
gh api "repos/deividjmoura/lanchonete-qr-semi-final/deployments?per_page=5" \
  --jq '.[] | "\(.id) \(.sha[0:7]) \(.created_at)"'
# estado atual de um deles: "success" é o que está no ar, "inactive" é o que saiu
gh api "repos/deividjmoura/lanchonete-qr-semi-final/deployments/<id>/statuses" --jq '.[0].state'
```

---

## 15. Como reproduzir as verificações

Pré-requisitos: PostgreSQL local, `.env` apontando para o banco de demonstração
(`qradmin_apresentacao_test`) e o servidor em `http://127.0.0.1:8080`.

```bash
NODE_ENV=production npm run build

npm run typecheck
npm test
DATABASE_URL=postgres://…/qradmin_test npm run test:e2e   # banco descartável; o nome precisa conter "test"

# cardápio do cliente contra a main de antes do rebranding (~3 min)
npm run test:cardapio-intacto -- --base bc9727ef336888fa39634f5eeb579af940c2c387

# com o servidor no ar
BASE_URL=http://127.0.0.1:8080 npm run test:landing
BASE_URL=http://127.0.0.1:8080 npm run test:paginas-publicas
BASE_URL=http://127.0.0.1:8080 npm run test:contraste -- --com-equipe   # ~4 min

npm run smoke:panorama && npm run smoke:fila && npm run smoke:2fa && npm run smoke:mesas
```

Dois cuidados:

- **Limite de login.** O servidor aceita 8 logins a cada 5 minutos por IP. A auditoria de contraste com
  `--com-equipe` usa 4. Duas execuções seguidas podem esbarrar no limite e falhar no login, com uma
  mensagem clara; espere 5 minutos.
- **Capturas.** Para refazer as imagens da landing e da apresentação:
  `DEMO_RESET_CONFIRM=APAGAR_qradmin_apresentacao_test npm run seed:apresentacao` e depois
  `node scripts/capturar-apresentacao.mjs`, sempre sobre um build de produção. Em seguida, gere o build
  de novo para as imagens entrarem em `dist/`.
