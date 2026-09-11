# 🗺️ Roadmap — Lanchonete QR · Major Pub

Progresso do sistema de pedidos por QR Code  
`Cliente → Cozinha/Bar → Garçom → Caixa → Admin`

---

## 📊 Visão geral

```text
v2.0  ████████████████████  MVP + Postgres              ✅
v2.1  ████████████████████  Auth + SSE                  ✅
v2.2  ████████████████████  Dashboard + kanban          ✅
v2.3  ████████████████████  Relatório + purge           ✅
v2.4  ████████████████████  Estoque                     ✅
v2.5  ████████████████████  Desconto / taxa / foto      ✅
v2.6  ████████████████████  PIX mesa + caixa            ✅
v2.6+ ████████████████████  Escolher (bebidas)          ✅
v2.7  ████████████████████  Divisão de conta            ✅
v2.8  ████████████████████  PIX multi-aviso + alertas   ✅
v2.9  ████████████████████  Setores · voz · WebP · UX   ✅
v2.9+ ████████████████████  Fixes: dashboard real, TZ,  ✅
                            relatório, histórico, setor
v3.0  ░░░░░░░░░░░░░░░░░░░░  Gateway · mídia · PWA       ⬜
v3.1  ░░░░░░░░░░░░░░░░░░░░  WhatsApp · delivery         ⬜
v3.2  ░░░░░░░░░░░░░░░░░░░░  Multi-loja / tenant         ⬜
```

**Barra do v2:** `████████████████████` **100%** no escopo de salão (polimento contínuo à parte)

---

## ✅ Feito (v2.0 → v2.9+)

### Fundação
- [x] PostgreSQL (Neon) + migrations (`0001` … `0015`)
- [x] Seed (mesas, cardápio, adicionais, removíveis, staff, setores)
- [x] Token UUID por mesa (QR opaco)
- [x] Sessão de mesa acumulativa (`mesa_sessoes`)
- [x] Timezone de negócio configurável (`APP_TIMEZONE`, default `America/Sao_Paulo`)

### Fluxo operacional
- [x] Cliente: cardápio, personalizar, **Escolher**, carrinho, total da mesa
- [x] Cozinha e **Bar** com filas por `produtos.setor`
- [x] Status por item + sincronização do pedido-pai
- [x] Garçom: entrega total ou **parcial**; valor só do entregue
- [x] Caixa: fechar conta, formas de pagamento, desconto / taxa
- [x] Divisão de conta (pagamentos parciais)
- [x] Admin: CRUD cardápio, mesas/QR, garçons, estoque, purge

### Tempo real, auth e ops
- [x] SSE (`GET /api/events`) com auth staff ou token de mesa
- [x] Auth por papel (`admin` · `cozinha` · `bar` · `caixa`)
- [x] Rate-limit básico (login / pedidos)
- [x] Alertas de voz (Web Speech)
- [x] Smoke test multi-mesa / multi-pessoa / divisão

### PIX e mídia
- [x] QR PIX EMV (chave / nome / cidade)
- [x] Aviso “já paguei” + confirmação no caixa (multi-aviso)
- [x] Upload de foto com sharp → WebP (persistência em `foto_url`)

### Dados e admin
- [x] Dashboard com faturamento real do dia (sem hardcode)
- [x] Histórico de 7 dias no gráfico da semana
- [x] Relatório por período (CSV / PDF print)
- [x] Histórico de pedidos expandível (itens / total)
- [x] Purge de histórico antigo

---

## ⬜ v3 — próximos saltos de valor

Prioridade sugerida: **o que reduz risco operacional e o que permite cobrar de outros estabelecimentos**.

### v3.0 — Fundação “produto de verdade” (4–8 semanas)

| Item | Por quê | Notas |
|------|---------|--------|
| **Object storage para fotos** (S3/R2/Cloudflare) | Base64 no Postgres não escala | Manter URL em `foto_url`; migrar data-URLs existentes |
| **Gateway PIX real** (EFI/Gerencianet, Mercado Pago, Open PIX…) | Conciliação automática, menos dependência do “já paguei” | Webhook → marca pagamento; manter fluxo manual como fallback |
| **PWA + install prompt** | Celular de garçom/caixa offline-ish, ícone na home | Service worker só para shell + cache de cardápio |
| **Push (Web Push)** | Cozinha/garçom sem depender só de voz/SSE aberta | Opcional por papel |
| **Rate-limit distribuído** (Redis/Upstash) | Hoje some com 2 instâncias | Mesma API `golpePermitido` por trás |
| **Backup/export agendado** | Contas fechadas + cardápio | Job diário → CSV/Parquet no storage |
| **Observabilidade mínima** | Saber por que deu 500 | Log estruturado + health `/api/health` + uptime |

**Critério de pronto v3.0:** uma loja sobe em produção com fotos fora do banco, healthcheck e PIX com pelo menos um provedor em sandbox/produção.

### v3.1 — Canal e operação estendida (4–6 semanas)

| Item | Por quê |
|------|---------|
| **WhatsApp** (template: “pedido pronto”, “conta”, link de pagamento) | Canal que o cliente já usa |
| **Delivery / retirada** (pedido sem mesa, endereço ou balcão) | Mesmo motor de produção, outra origem de sessão |
| **Impressão de produção** (ESC/POS ou PDF cozinha) | Bares que ainda vivem de via |
| **Turnos de caixa** (abertura/fechamento com sangria) | Fechamento contábil do dia |
| **Roles mais finos** (ex.: só cardápio, só relatório) | Menos compartilhamento de senha admin |
| **CSRF token** nas mutações de staff | Hardening |

### v3.2 — Multi-loja / caminho SaaS (6–12 semanas)

| Item | Por quê |
|------|---------|
| **Tenant (`loja_id`) em todas as tabelas** | Isolamento real |
| **Onboarding** (criar loja, mesas, staff, PIX) | Vender sem setup manual no SQL |
| **Billing** (Stripe/Pagar.me) da mensalidade do software | Só se for SaaS |
| **Painel super-admin** (lojas, uso, suporte) | Operação do produto |
| **White-label leve** (logo, cor, domínio) | Ticket B2B maior |

**Não começar multi-loja antes de v3.0 estável** — multiplica bug e suporte.

---

## 🔧 Dívida técnica (contínua, paralela ao v3)

- [ ] Unificar UI: aposentar HTML legado em `public/` quando a SPA cobrir 100%
- [ ] Validação de body com schema (Zod) nos endpoints críticos
- [ ] Índices e `EXPLAIN` nas filas sob carga real de sexta à noite
- [ ] Testes além do smoke (unitário em `setStatusPedido`, caixa, PIX)
- [ ] Política de retenção + purge automático opcional
- [ ] Documentar API (OpenAPI) para integrações

---

## 🎯 Critérios de qualidade (o que “pronto” significa)

| Área | Critério |
|------|----------|
| Operação | Smoke passa; 2 mesas + divisão + PIX aviso sobrevivem |
| Dados | Dashboard e relatório batem com sessões **fechadas** no fuso do pub |
| Produção | Item de bar não some na cozinha e vice-versa |
| Dinheiro | Total do caixa = entregues − desconto + taxa; parciais não estouram |
| Segurança | Staff sem cookie não acessa `/api/admin/*`; SSE não é público aberto |

---

## 📌 Princípios para o v3

1. **Não quebrar o fluxo de salão** que já funciona — feature flag ou rota nova.  
2. **Dinheiro e estoque só no servidor** — cliente nunca manda preço final.  
3. **Uma loja perfeita > dez lojas frágeis.**  
4. **Mídia e arquivos fora do Postgres.**  
5. **PIX automático é complemento, não substituir o caixa humano no dia 1.**

---

## Histórico curto de correções recentes (v2.9+)

- Removidos hardcodes de demo no dashboard (`+620` / `+87`)
- Dashboard e relatório no fuso `America/Sao_Paulo`
- `setStatusPedido` com fallback quando o setor não tem itens (ex.: bebida + cozinha)
- SSE com autenticação
- Relatório: SQL de timezone corrigido + mensagem de erro explícita
- Histórico de pedidos expandível (itens / total)

---

**Próximo passo recomendado:** v3.0 focado em **storage de fotos + health + gateway PIX (sandbox)** — máximo valor com menor risco de reescrever o núcleo de pedidos.
