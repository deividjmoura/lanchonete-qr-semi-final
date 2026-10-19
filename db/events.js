// Barramento SSE: clientes em GET /api/events recebem eventos operacionais.
//
// Coalescência do público (mesa/garçom): esses clientes recebem apenas "{}" —
// o evento é um "recarregue sua tela", sem payload. Sem coalescer, 70 mesas
// com SSE aberto transformam cada mutação em 70 escritas + 70 refetches em
// rajada (medido no teste de carga: ~51 mil escritas para 875 requisições).
// Aqui o cliente público recebe no máximo 1 aviso por janela
// (SSE_PUBLIC_COALESCE_MS, padrão 300ms, 0 desliga): o primeiro sai na hora
// e, se houver mais movimentação na janela, um último aviso sai ao fim dela.
// Como o aviso não carrega dados, colapsar repetidos não perde informação.
// Staff (cozinha/bar/caixa) segue recebendo tudo imediatamente — o payload
// deles tem conteúdo e são poucos terminais.

const parsedCoalesce = Number(process.env.SSE_PUBLIC_COALESCE_MS ?? 300);
const PUBLIC_COALESCE_MS = Number.isFinite(parsedCoalesce)
  ? Math.min(5000, Math.max(0, Math.trunc(parsedCoalesce)))
  : 300;

const clients = new Map();

function subscribe(res, { publicClient = false } = {}) {
  clients.set(res, { publicClient, ultimoEnvioEm: 0, pendente: null, timer: null });
  res.on('close', () => {
    const estado = clients.get(res);
    if (estado && estado.timer) clearTimeout(estado.timer);
    clients.delete(res);
  });
}

function escreverPublico(res, estado, event) {
  res.write(`event: ${event}\ndata: {}\n\n`);
  estado.ultimoEnvioEm = Date.now();
  estado.pendente = null;
}

function broadcast(event, payload = {}) {
  if (!clients.size) return;
  const data = JSON.stringify({ ...payload, at: Date.now() });
  const chunk = `event: ${event}\ndata: ${data}\n\n`;
  for (const [res, estado] of clients) {
    try {
      if (!estado.publicClient) {
        res.write(chunk);
        continue;
      }
      // Clientes de mesa/garçom precisam apenas invalidar a tela.
      // Não envie nomes, tokens ou pagamentos de outras mesas.
      if (PUBLIC_COALESCE_MS === 0) {
        res.write(`event: ${event}\ndata: {}\n\n`);
        continue;
      }
      const agora = Date.now();
      const desdeUltimo = agora - estado.ultimoEnvioEm;
      if (desdeUltimo >= PUBLIC_COALESCE_MS) {
        escreverPublico(res, estado, event);
      } else {
        estado.pendente = event;
        if (!estado.timer) {
          estado.timer = setTimeout(() => {
            estado.timer = null;
            if (!clients.has(res) || !estado.pendente) return;
            try {
              escreverPublico(res, estado, estado.pendente);
            } catch (_) {
              clients.delete(res);
            }
          }, PUBLIC_COALESCE_MS - desdeUltimo);
          if (typeof estado.timer.unref === 'function') estado.timer.unref();
        }
      }
    } catch (_) {
      if (estado.timer) clearTimeout(estado.timer);
      clients.delete(res);
    }
  }
}

function clientCount() {
  return clients.size;
}

module.exports = { subscribe, broadcast, clientCount, PUBLIC_COALESCE_MS };
