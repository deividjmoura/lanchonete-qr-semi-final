<div align="center">

# 🍔 Lanchonete QR · Major Pub

**Pedidos por QR Code** — do celular do cliente até a cozinha, o bar, o garçom e o caixa.

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Neon](https://img.shields.io/badge/Neon-00E599?style=for-the-badge&logo=neon&logoColor=black)](https://neon.tech/)
[![Status](https://img.shields.io/badge/status-v2.9%20operacional-22c55e?style=for-the-badge)](./ROADMAP.md)

</div>

---

## 🎬 O fluxo

```text
  📱 Cliente          👨‍🍳 Cozinha / 🍸 Bar      🏃 Garçom          💵 Caixa
 ┌──────────┐       ┌──────────┐            ┌──────────┐       ┌──────────┐
 │ QR mesa  │ ───▶  │ prepara  │ ─────────▶ │ entrega  │ ───▶  │ fecha    │
 │ cardápio │       │ por setor│            │ (parcial)│       │ + PIX    │
 └──────────┘       └──────────┘            └──────────┘       └──────────┘
       │                                                          ▲
       └──────── conta acumulativa da sessão (comanda) ───────────┘
```

Uma mesa pode fazer **vários pedidos** na mesma visita. O que vale no caixa é a **sessão** (comanda), não o pedido isolado. Itens só entram no total depois de **entregues**.

---

## 📊 Status atual (v2.9)

| Módulo | Status |
|:------:|:------:|
| Postgres + Neon + migrations | ✅ |
| Mesa (QR + cardápio + Escolher / personalizar) | ✅ |
| Cozinha · Bar (setores) · voz | ✅ |
| Garçom (entrega parcial) | ✅ |
| Caixa · auth · SSE · divisão de conta | ✅ |
| Estoque · dashboard · relatório · purge | ✅ |
| PIX (QR EMV + aviso multi) | ✅ |
| Fotos WebP (upload + persistência) | ✅ |
| Gateway pagamento · WhatsApp · PWA · multi-loja | ⬜ v3 |

Detalhes e plano → **[ROADMAP.md](./ROADMAP.md)**

---

## 🖥️ Telas

| Papel | Rota | O que faz |
|:-----:|:-----|:----------|
| 👤 Cliente | `/mesa/:token` | Cardápio, **Escolher**, personalizar, carrinho, conta + PIX |
| 👨‍🍳 Cozinha | `/cozinha` | Fila do setor cozinha + alerta de voz |
| 🍸 Bar | `/bar` | Fila do setor bar |
| 🏃 Garçom | `/garcom/:token` | Entrega (total ou parcial) + voz |
| 💵 Caixa | `/caixa` | Fecha conta, divisão, desconto/taxa, confirma PIX |
| ⚙️ Admin | `/admin` | Cardápio, mesas/QR, garçons, dashboard, relatório, histórico, purge |
| 🔐 Login | `/login` | Auth por papel (`admin` · `cozinha` · `bar` · `caixa`) |

---

## 🚀 Subir local

```bash
npm install
cp .env.example .env   # edite DATABASE_URL, PIX_* e STAFF_SEED_PASSWORD
npm run db:migrate
npm run db:seed
npm start
```

Abre em `http://localhost:3000`.

### SPA (React)

```bash
npm run build          # gera dist/
npm start              # server.js serve a API + dist/ se existir
# ou em dev:
npm run dev:ui         # Vite
npm run dev:api        # API na 3000
```

### Variáveis importantes

```env
DATABASE_URL=postgres://usuario:senha@host/db
DATABASE_SSL=true
# se o certificado do provedor falhar na validação:
# DATABASE_SSL_REJECT_UNAUTHORIZED=false

STAFF_SEED_PASSWORD=troque-esta-senha
APP_TIMEZONE=America/Sao_Paulo

PIX_CHAVE=00000000000
PIX_NOME=NOME DO RECEBEDOR
PIX_CIDADE=CIDADE
```

> CPF/CNPJ com pontuação funcionam (normalizamos no EMV). **Não commite** chave real no repositório.

### Scripts úteis

```bash
npm run db:reset-senha   # alinha admin/cozinha/bar/caixa com STAFF_SEED_PASSWORD
npm run test:smoke       # fluxo completo multi-mesa (servidor precisa estar up)
npm run fotos:dry        # preview de correção de fotos do cardápio
npm run fotos:fix        # grava caminhos leves /assets/demo/*.webp
```

---

## ✅ Testes (smoke)

Com o servidor rodando:

```bash
npm run test:smoke
```

Cobre: login por papel, 2 mesas em paralelo, pedidos concorrentes na mesma sessão, avanço cozinha → entrega garçom, PIX multi-aviso, pagamento parcial e fechamento.

---

## 💠 PIX

| Onde | Ação |
|------|------|
| **Mesa → Total** | QR + copia-e-cola quando há valor |
| **Mesa** | **Já paguei no PIX** avisa o caixa |
| **Caixa** | Toast + beep + voz · caixa confirma e registra |

A conta **não** fecha sozinha — o caixa confirma.

```http
GET  /api/config/pix
POST /api/mesas/:token/pix-informado
```

---

## ✂️ Divisão de conta (caixa)

1. Informe N pessoas → valor por pessoa  
2. Registre pagamentos parciais  
3. Ao **Fechar conta**, o que faltar é quitado  

```http
POST /api/caixa/sessoes/:id/pagamentos
Body: { "valor": 25.50, "formaPagamento": "pix" }
```

---

## 📷 Fotos no cardápio

1. Admin: arquivo ou link `https://…`  
2. Servidor otimiza (~480px, WebP) via **sharp**  
3. Persistência atual: `foto_url` no Postgres (data URL ou link externo)

> Base64 no banco funciona e sobrevive a redeploy, mas **não escala bem**. Preferir arquivos em `/assets` ou object storage (planejado no v3).

---

## 🥤 Tipos de produto no cardápio

| Tipo | Botão do cliente | Cadastro |
|------|------------------|----------|
| Simples | **Adicionar** | Sem extras |
| Lanche com extras | **Adicionar** + **Personalizar** | Adicionais (multi) + removíveis |
| Bebida / tamanho / sabor | **Escolher** | Uma opção (rádio) — típico de bebidas |

Produtos têm **setor de produção**: `cozinha` ou `bar` (fila separada).

---

## 🔊 Alertas de voz

| Tela | Quando | Conteúdo |
|------|--------|----------|
| Cozinha / Bar | Pedido novo / avanço | Mesa + cliente |
| Garçom | Item pronto | Nº da mesa |
| Caixa | PIX informado | Mesa + forma |

Web Speech API no browser. No primeiro toque a voz “desbloqueia”.

---

## 📁 Estrutura

```text
lanchonete-qr/
├── server.js           # HTTP nativo — API + estáticos
├── db/                 # Postgres: pedidos, caixa, auth, dashboard…
│   └── migrations/     # 0001 … 0015+
├── src/                # React (Vite) — telas operacionais + admin
├── public/             # HTML legado / assets / favicons
├── scripts/            # smoke, seed helpers, fotos
├── ROADMAP.md
└── .env.example
```

---

## 🔒 Segurança (resumo)

- Sessão staff em cookie **httpOnly** (scrypt na senha)  
- Rate-limit em memória em login e pedidos (por IP)  
- Headers básicos (CSP, nosniff, frame-deny)  
- SSE: staff autenticado **ou** `?mesa=<token-uuid>`  
- Preços e regras de adicional/remoção **sempre no servidor**

Limitações conhecidas: rate-limit não compartilha entre instâncias; CSRF formal ainda não implementado; PIX sem conciliação bancária automática.

---

## 🗺️ Roadmap

Ver **[ROADMAP.md](./ROADMAP.md)** — v2 fechado no essencial operacional; v3 foca gateway, PWA, WhatsApp, storage de mídia e caminho multi-loja.

---

<div align="center">

**Feito com ☕ e QR Code** · [deividjmoura](https://github.com/deividjmoura)

</div>
