<div align="center">

# QRAdmin

**Pedidos por QR Code para lanchonetes e pubs**

Do celular do cliente até a cozinha, o bar, o garçom e o caixa — em tempo real.

[![Demo](https://img.shields.io/badge/Demo-qradmin.up.railway.app-00C4B4?style=for-the-badge)](https://qradmin.up.railway.app/)

</div>

---

## O que é

Sistema operacional completo para atendimento por mesa: o cliente escaneia o QR, monta o pedido no próprio celular (sem app) e a equipe acompanha cada etapa em telas dedicadas. A **comanda é acumulativa** — vários pedidos na mesma visita, fechamento único no caixa.

Identidade **QRAdmin** (navy + teal), com **tema claro e escuro** em todas as telas.

---

## Fluxo

```text
Cliente (QR)  →  Cozinha / Bar  →  Garçom  →  Caixa
   pedido           preparo         entrega     fecha + PIX
```

Itens só entram no total da conta depois de **entregues**. O caixa fecha a **sessão** (comanda), não o pedido isolado.

---

## Funcionalidades implementadas

### Cliente (mesa)
- Cardápio digital via link/QR da mesa
- Produtos simples, personalizáveis (adicionais e removíveis) e tipo **Escolher** (tamanho/sabor)
- Carrinho, conta da sessão e **PIX** (QR EMV + copia-e-cola)
- Aviso **“Já paguei no PIX”** para o caixa

### Cozinha e Bar
- Filas separadas por **setor** de produção
- Avanço de status e **alerta de voz** (mesa + cliente)

### Garçom
- Acesso por token próprio
- Entrega **total ou parcial** dos itens
- Alerta de voz quando há item pronto

### Caixa
- Sessões abertas, pagamentos parciais e fechamento
- **Divisão de conta** (N pessoas, valor por pessoa)
- Desconto e taxa
- Confirmação de avisos PIX (toast + som + voz)

### Admin
- Cardápio (categorias, produtos, ordem, estoque)
- Mesas e QR fixo por mesa
- Garçons (token e ativo/inativo)
- Dashboard (faturamento, ticket, top produtos)
- Relatório por período, histórico de pedidos e purge
- Upload de fotos (otimização WebP)

### Plataforma
- Login por papel: admin, cozinha, bar, caixa
- Sessão staff em cookie httpOnly
- Atualização ao vivo via **SSE**
- Postgres (migrations + seed)
- Temas claro/escuro persistidos no dispositivo

---

## Telas

| Papel    | Rota              | Função principal                          |
|----------|-------------------|-------------------------------------------|
| Cliente  | `/mesa/:token`    | Cardápio, pedido, conta, PIX              |
| Cozinha  | `/cozinha`        | Fila de preparo + voz                     |
| Bar      | `/bar`            | Fila de bebidas + voz                     |
| Garçom   | `/garcom/:token`  | Entrega (parcial ou total)                |
| Caixa    | `/caixa`          | Pagamentos, divisão, PIX, fechamento      |
| Admin    | `/admin`          | Operação, cardápio, mesas, relatórios     |
| Equipe   | `/login`          | Acesso por papel                          |

---

## Stack

| Camada     | Tecnologia                                      |
|------------|-------------------------------------------------|
| Front      | React 19 · Vite · TypeScript · Tailwind · Zustand · Framer Motion |
| API        | Node.js (HTTP nativo)                           |
| Dados      | PostgreSQL                                      |
| Tempo real | Server-Sent Events                              |
| Imagens    | Sharp (WebP)                                    |

---

## Status do produto

| Área                         | Situação   |
|------------------------------|------------|
| Pedido por QR + comanda      | Pronto     |
| Cozinha / Bar / Garçom / Caixa | Pronto   |
| PIX (QR + aviso ao caixa)    | Pronto     |
| Divisão de conta             | Pronto     |
| Admin + dashboard + relatório| Pronto     |
| Tema claro/escuro            | Pronto     |
| Gateway de pagamento bancário| Planejado  |
| WhatsApp / PWA / multi-loja  | Planejado  |

---

<div align="center">

**QRAdmin** · pedidos por QR Code  
[deividjmoura](https://github.com/deividjmoura)

</div>
