<div align="center">

# 🍔 Lanchonete QR · QRAdmin

**Pedidos por QR Code** — do celular do cliente até a cozinha, o bar, o garçom e o caixa.
Identidade visual **QRAdmin** (navy + teal) com **tema claro/escuro** em todas as telas.

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Neon](https://img.shields.io/badge/Neon-00E599?style=for-the-badge&logo=neon&logoColor=black)](https://neon.tech/)

</div>

---

## 🚀 Como rodar (quick start)

> ⚠️ **Não abra o HTML direto no navegador** (`file://`) — o app é full-stack e só
> funciona servido pelo servidor Node abaixo.

1. **Node.js LTS** instalado (nodejs.org) e um **Postgres** acessível (local, Neon, Supabase…).
2. Na pasta do projeto, um único comando cria o `.env`, roda migrations e seed:
   ```bash
   npm install
   npm run setup
   ```
   Se o seu Postgres não for `postgres://usuario:senha@localhost:5432/lanchonete_qr`,
   ajuste o `DATABASE_URL` no `.env` gerado e rode `npm run setup` de novo.
3. Suba o servidor:
   ```bash
   npm start
   ```
4. Abra **http://localhost:3000** no navegador.
   - Login de teste: `admin` / `admin123` (também `cozinha`, `bar`, `caixa`).
   - **Tema claro/escuro**: botão de lua/sol no topo de qualquer tela — a escolha fica salva no dispositivo.

O repositório já inclui o `dist/` (build do front), então `npm start` serve tudo
sem precisar rodar `npm run build`. Se alterar o front em `src/`, rode
`npm run build` antes.

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

## 📊 Status atual

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
| Gateway pagamento · WhatsApp · PWA · multi-loja | ⬜ planejado |

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
└── scripts/            # smoke, seed helpers, fotos
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

<div align="center">

**Feito com ☕ e QR Code** · [deividjmoura](https://github.com/deividjmoura)

</div>
