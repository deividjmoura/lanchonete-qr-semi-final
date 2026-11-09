# 01 — Brief de Identidade Visual QRAdmin

**Data:** 2026-11-08  
**Status:** Direção aprovada (Território A — Comanda de Chapa).

---

## 1. Conceito em uma frase

**A interface do QRAdmin é a comanda térmica digital da casa: o número da mesa é o ponto de atenção, o ticket é a unidade legível a distância e sob pressão, e o estado do item se comunica por posição + forma + cor — nunca só por cor.**

Objeto do mundo real de origem: **comanda térmica de cozinha/bar** (papel 80 mm, numeração grande, observações em contraste, corte parcial, fila física) + **painel de chamada / sinalização de passagem** (estado sob pressão, hierarquia imediata).

---

## 2. Personalidade e anti-palavras

| Personalidade | Anti-palavras |
|---------------|---------------|
| **Direto** | Decorativo |
| **Legível** | SaaS-genérico |
| **Operacional** | Suave demais / “premium soft” |

A identidade existe para reduzir erro e tempo de leitura na chapa, no bar, no caixa e no celular do garçom. Beleza é consequência da legibilidade e da consistência, não o objetivo primário.

---

## 3. Por que isto é do QRAdmin (e não de outro sistema)

- A unidade de negócio é a **sessão/comanda da mesa**, não o pedido isolado. O número da mesa e o ID da comanda precisam ser o elemento mais reconhecível em qualquer superfície.
- Itens só entram no total depois de **entregues**. O estado “pronto / retirado / entregue” é crítico e precisa ser inequívoco a 2 m e com uma mão.
- Cozinha e bar são **setores paralelos** com filas próprias. A identidade deve permitir densidade de fila sem virar grade de cards idênticos de dashboard.
- O cliente lê o QR no celular, em bar com pouca luz e fome. A interface do cardápio **recua** diante da foto; a conta e o Pix precisam ser óbvios.
- Já existe no código linguagem de ticket (`.ticket-rule`, notch, numerais tabulares, stage operacional). A nova direção **aprofunda** o que já funciona em vez de trocar por outra moda de glass/violet.

Se cobrir o logo e o nome, a tela ainda precisa ser reconhecível como “sistema de comanda de mesa com fila por setor”.

---

## 4. Três assinaturas visuais recorrentes

Aparecem adaptadas em **todas** as superfícies (não copiadas literalmente):

1. **Número de mesa / comanda em mono tabular, grande e ancorado**  
   Sempre no mesmo “lugar mental” do ticket (canto superior esquerdo ou faixa de cabeçalho). Fonte mono, peso alto, `tabular-nums`. É o primeiro dado que o olho encontra.

2. **Recorte / borda de ticket**  
   Linha tracejada horizontal (`.ticket-rule` já existe), possível notch ou canto cortado, margem generosa como papel térmico. Elevação por **contraste e linha**, não por sombra difusa de card SaaS.

3. **Marca de estado por posição + forma + cor**  
   - Posição (topo do card, faixa lateral, badge fixo).  
   - Forma (pill, barra, ícone de traço único).  
   - Cor semântica (sucesso / atenção / erro / info).  
   Nunca estado só por cor (daltonismo + luz agressiva da cozinha).

---

## 5. Tipografia

**Par atual (recomendado manter e rigorar papéis):**

| Papel | Família | Uso |
|-------|---------|-----|
| Display / títulos de seção | **Fraunces** (SOFT) | Títulos de fila, “Fila da chapa”, nomes de seção |
| Texto / UI | **Plus Jakarta Sans** | Corpo, labels, botões |
| Numerais / IDs / valores | **JetBrains Mono** | Mesa, #comanda, R$, tempos, quantidades — **sempre `tabular-nums`** |

- Licença livre (OFL), já auto-hospedada.
- Testado mentalmente com português: Ç Ã Õ Á, R$ 1.234,50, nomes longos de item.
- **Não usar** Inter, Roboto, Arial, system-ui como display.

Papéis tipográficos (não só tamanhos): rótulo, dado, título de seção, número de destaque, texto de corpo.

---

## 6. Paleta

**Princípio:** papel / tinta neutros com temperatura intencional + **uma** cor de assinatura com orçamento máximo ~10 % da área + cores semânticas que não colidem com a assinatura.

### Neutros (temperatura quente residual + contraste operacional)

- Superfície clara: papel / névoa levemente quente.
- Superfície escura (cozinha/bar/caixa operacional): tinta profunda, quase preta quente ou meia-noite — sem pretos puros frios de dashboard genérico.
- Texto: contraste AA mínimo; em cozinha buscar 7:1.

### Cor de assinatura (orçamento ~10 %)

**Brasa / âmbar operacional** (`#E8501F` ou derivação já presente em `--prim-brasa`) — usada em:
- número de mesa em destaque,
- estado “em produção / atenção”,
- CTAs primários operacionais,
- indicadores de atraso.

Não usar como fundo de página inteira. Não competir com status de sucesso (verde) ou erro (vermelho).

### Semânticos (sempre cor + forma + texto/ícone)

- Sucesso / entregue / pronto → verde + check / posição.
- Atenção / fila / atraso → âmbar/brasa + forma.
- Erro / cancelado → vermelho + ícone.
- Info → azul/ciano contido.

Validação daltonismo: vermelho/verde nunca únicos portadores de significado.

### O que reduzir

- Gradientes de vidro e halos violetas de “palco SaaS” — limitar a regimes expressivos ou eliminar se não comunicarem estado.
- Bordas coloridas laterais de card sem função.
- Sombras difusas como único meio de elevação.

---

## 7. Forma

- **Raio:** escala coerente e **menor** que o padrão atual generoso em vários lugares.
  - `xs` ~ 6–8 px (itens internos)
  - `sm` ~ 10–12 px (botões, inputs)
  - `md` ~ 14–16 px (tickets)
  - `lg` ~ 20 px (painéis)
  - `pill` para badges de estado
- **Bordas / divisores:** linha sólida ou tracejada (ticket). Preferir contraste de superfície a sombra.
- **Elevação:** contraste + hairline + eventual sombra curta e quente; evitar multi-camada difusa de card de dashboard.
- **Densidade:** variável por superfície (cozinha densa e grande; admin tabular; cliente espaçado em torno da foto).

---

## 8. Ícones

- Conjunto único: **Phosphor Icons** (já em uso, traço e peso definidos).
- Proibido emoji como ícone de interface.
- Peso e grade consistentes; preferir bold em alvos operacionais.

---

## 9. Movimento

- Apenas o que comunica **mudança de estado** (novo ticket, item liberado, pagamento registrado).
- Respeitar `prefers-reduced-motion` (já presente).
- Entrada de ticket curta; sem loop decorativo.

---

## 10. Pesquisa resumida

### Dentro do software
- Toast / KDS: cores por item e por tempo; borda por tipo. Ensina estado legível a distância. Armadilha: excesso de cor sem hierarquia.
- Lightspeed KDS: header/footer de chit. Ensina estrutura de ticket.
- Stripe / Polaris: formulários e tabelas de dinheiro. Ensina numerais e hierarquia de valor.
- Linear / Notion: hierarquia e densidade. Armadilha: estética de ferramenta de conhecimento.
- Material 3 / HIG / Radix: estados, foco, acessibilidade.

### Fora do software
- Comanda térmica 80 mm: numeração grande, observações em contraste, margem, corte.
- Ticket de papel de cozinha / espeto: ordem física da fila.
- Sinalização de aeroporto / painéis de senha: estado sob pressão, contraste alto.
- Cardápio de boteco / lousa: tipografia popular brasileira.
- Editorial impresso: grade, margem, ruído de impressão como textura sutil.

---

## 11. Três territórios e decisão

| | A — Comanda de Chapa (escolhido) | B — Papel de Balcão | C — Sinalização de Passagem |
|---|----------------------------------|---------------------|-----------------------------|
| Conceito | A tela *é* o ticket térmico digital | Papel de boteco + tinta de carimbo | Wayfinding de aeroporto |
| Tom | Escuro operacional, alto contraste | Claro, quente, impresso | Neutro frio, hierarquia rígida |
| Força | Passa 2 m e “cubra o logo” | Acolhedor para cliente | Clareza máxima |
| Risco | Pode parecer duro se não adaptar regimes | Perde legibilidade na chapa | Frio demais para o DNA da casa |

**Decisão (2026-11-08):** Território A, com regimes:
- Operacional (Cozinha/Bar/Garçom/Caixa) → A puro
- Admin → A tabular, menos “palco”
- Cliente/Landing → A em versão clara/papel + foto protagonista

---

## 12. GATE — DECISÃO

**Aprovado pelo responsável (instrução: “Escolha o conceito e território com mais impacto”) em 2026-11-08.**

Próximo: Fase 2 — Fundação (tokens, componentes-base, validação nas 3 telas piloto).

---

*Documentos relacionados: `00-inventario.md`, `02-sistema.md`.*
