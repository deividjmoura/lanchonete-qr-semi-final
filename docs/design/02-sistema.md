# 02 — Sistema de Design (Território A — Comanda de Chapa)

**Direção aprovada:** 2026-11-08  
**Princípio:** tokens como única fonte de cor, tipografia, espaço, raio, elevação e motion. Zero hardcoded fora dos tokens. Mudança só de aparência.

---

## 1. Conceito operacional

A tela operacional *é* o ticket.  
Número de mesa = âncora.  
Ticket = unidade legível a distância.  
Estado = posição + forma + cor.

Regimes:
- `operational` → Cozinha, Bar, Garçom, Caixa (escuro, alto contraste, alvos ≥ 48 px).
- `admin` → tabelas, densidade de trabalho de mesa.
- `client` / expressive → cardápio e landing (papel claro, foto protagonista).

---

## 2. Tokens (fonte única)

Arquivo de verdade: `public/garcom-pwa/design-tokens.css` (já compartilhado SPA + PWA).  
Refinar, não recriar do zero. Remover ou desativar uso de glows/gradientes decorativos que não comunicam estado.

### 2.1 Cor

**Neutros (temperatura quente residual)**
- Superfície clara (cliente/landing): papel / névoa levemente quente.
- Superfície operacional: tinta profunda (quase preto quente ou meia-noite sem frio de SaaS).
- Texto: contraste AA (≥ 4.5:1); cozinha buscar 7:1.

**Assinatura (orçamento ≤ ~10 % da área)**
- Brasa / âmbar operacional (`--prim-brasa` e derivações).
- Usos: número de mesa em destaque, “em produção”, CTAs operacionais primários, atraso.
- Nunca como fundo de página inteira.

**Semânticos** (sempre acompanhados de forma + ícone/texto)
- success → verde + check / posição
- warning / fila → âmbar/brasa + forma
- danger → vermelho + ícone
- info → ciano/azul contido

**QR / impressão**
- `--qr-paper` / `--qr-ink` invariáveis (papel térmico).

### 2.2 Tipografia

| Papel | Token / família | Uso |
|-------|------------------|-----|
| Display | `--font-display` (Fraunces SOFT) | Títulos de seção (“Fila da chapa”) |
| UI / corpo | `--font-sans` (Plus Jakarta Sans) | Labels, botões, texto |
| Dado / número | `--font-mono` (JetBrains Mono) + `tabular-nums` | Mesa, #comanda, R$, tempo, qtd |

Escala de papéis (não só tamanhos): rótulo · dado · título de seção · número de destaque · corpo.

### 2.3 Espaço e raio

- Ritmo de espaçamento com composição variável por importância.
- Raio (rigor menor que o generoso atual em vários cards):
  - `--radius-xs` ≈ 6–8 px
  - `--radius-sm` ≈ 10–12 px
  - `--radius-md` ≈ 14–16 px (ticket)
  - `--radius-lg` ≈ 20 px
  - `--radius-pill` para badges de estado

### 2.4 Elevação e borda

- Preferir contraste de superfície + linha (sólida ou tracejada de ticket).
- Sombra: curta e quente, ou nenhuma. Evitar multi-camada difusa de “glass card”.
- Ticket: `.ticket-rule` (tracejado) + possível notch.

### 2.5 Motion

- Só mudança de estado (entrada de ticket, liberação de item, confirmação de pagamento).
- `--dur-fast` / `--dur-page` / `--ease-ticket` / `--ease-snap`.
- `prefers-reduced-motion: reduce` → sem animação.

### 2.6 Z-index e alvos

- Alvos de toque mínimos: 44 px gerais; **48 px** nas áreas operacionais.
- Foco visível em tudo (`:focus-visible`).

---

## 3. Assinaturas — regras de uso

1. **Número de mesa/comanda**  
   Mono, tabular, grande, ancorado no mesmo lugar mental do ticket (topo esquerdo / faixa de cabeçalho). Nunca competir com outros números grandes.

2. **Recorte de ticket**  
   Linha tracejada horizontal; margem generosa; possível canto ou notch. Aparece em cards de fila, comprovantes e, de forma sutil, em listas de caixa.

3. **Estado**  
   Posição fixa + forma (pill / barra / ícone de traço) + cor semântica. Nunca só cor.

---

## 4. Componentes-base (estados obrigatórios)

Cada um deve existir nos estados: padrão · hover · focus-visible · ativo · desabilitado · carregando · erro.

- Botão (primário operacional = brasa; secundário; destrutivo; ghost)
- Campo / seletor
- Tabela (Admin — continua tabela)
- Lista / card de ticket (FilaProducao)
- Modal / bottom sheet
- Toast
- Badge de status
- Tooltip
- Menu / nav (OpsShell)
- Estado vazio (tipográfico e honesto; sem ilustração genérica)

Ícones: apenas Phosphor, peso consistente.

---

## 5. Por superfície (composição, não clone)

| Superfície | Regime | Prioridade |
|------------|--------|------------|
| Cozinha / Bar | operational | Tipografia grande, ticket inteiro clicável, contraste alto, zero decoração |
| Garçom | operational (mobile) | Zona do polegar, 48 px, entrega parcial inequívoca |
| Caixa | operational | Numerais alinhados, total / pago / restante claros, Pix e ações finais distintas |
| Admin | admin | Tabelas como tabelas, filtros e ações contextuais |
| Cliente (`/mesa/:token`) | client | Foto protagonista; interface recua; carrinho/conta/Pix óbvios |
| Login + HTML legado + Guia | mesma linguagem | Nada com visual antigo |

---

## 6. O que NÃO fazer

- Não alterar regras de negócio, APIs, auth, SSE, voz, cálculos, CSP, migrations, testes.
- Não criar lógica nova (ex.: cronômetro de atraso se não existir).
- Não usar emoji como ícone de UI.
- Não hardcodar cor, tamanho ou raio fora dos tokens.
- Não introduzir biblioteca de efeito decorativo.
- Não afrouxar CSP nem puxar Google Fonts.
- Não fazer páginas-clone: a identidade é uma; a composição muda por ambiente.
- Não declarar verificado o que não foi executado (typecheck, build, smoke, roteiro manual).

---

## 7. Ordem de implementação (ondas)

1. Fundação: tokens refinados + escala tipográfica/espaço + componentes-base.
2. Validação nas 3 telas piloto (Cozinha, Caixa, Cliente) — screenshots 360/768/1440.
3. Propagação: Cozinha/Bar → Garçom → Caixa → Admin → Cliente → Login/legado.
4. Cada onda: commit Conventional Commits, comparação com baseline, checklist de identidade.

Branch: `design/identidade-visual` (criada a partir de main).  
PR em rascunho. Nunca push em main sem autorização.

---

## 8. Critérios de aceite desta fundação

- Tokens = única fonte.
- 3 assinaturas presentes e adaptadas nas 3 telas piloto.
- Contraste e alvos de toque ok.
- Type-check e build passam sem alteração de testes.
- Nenhuma mudança de backend ou contrato.

---

*Próximo documento após validação das 3 pilotos: atualização de `03-verificacao.md` e propagação.*
