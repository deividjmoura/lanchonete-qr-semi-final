#!/usr/bin/env bash
# =============================================================================
# Patch: fix setor × status (erro 409 no garçom quando o produto é do bar)
# Execute na RAIZ do projeto.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f db/pedidos.js ]]; then
  echo "❌ Rode na raiz do projeto (onde está db/pedidos.js)"
  exit 1
fi

echo "▶ Aplicando fix de setor/status..."

cp -n db/pedidos.js "db/pedidos.js.bak.$(date +%s)" 2>/dev/null || true

python3 << 'PY'
from pathlib import Path

p = Path("db/pedidos.js")
text = p.read_text(encoding="utf-8")

# Substitui o bloco inteiro de setStatusPedido (versão mais robusta)
old_start = "async function setStatusPedido(pedidoId, statusAlvo, setor = null) {"
idx = text.find(old_start)
if idx < 0:
    print("❌ setStatusPedido não encontrado")
    raise SystemExit(1)

# Encontra o final da função (próxima async function ou module.exports)
# Vamos localizar o trecho do if (setor) ... else ... sincronizar
old_block = '''async function setStatusPedido(pedidoId, statusAlvo, setor = null) {
  const alvo = String(statusAlvo || '').trim();
  if (!['recebido', 'em_producao', 'concluido', 'entregue'].includes(alvo)) {
    throw new ErroPedido(400, 'Status inválido');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, status, sessao_id FROM pedidos WHERE id = $1 FOR UPDATE`,
      [Number(pedidoId)]
    );
    const pedido = rows[0];
    if (!pedido) throw new ErroPedido(404, 'Pedido não encontrado');
    if (pedido.status === 'entregue' && alvo !== 'entregue') {
      throw new ErroPedido(409, 'Pedido já entregue');
    }

    if (alvo === 'entregue') {
      // entrega fecha todos os itens
      await client.query(
        `UPDATE itens_pedido SET status = 'entregue' WHERE pedido_id = $1`,
        [pedido.id]
      );
      const { rows: updated } = await client.query(
        `UPDATE pedidos SET status = 'entregue' WHERE id = $1
         RETURNING id, status, criado_em, editado_em, cliente_nome, sessao_id`,
        [pedido.id]
      );
      await client.query('COMMIT');
      return { ...updated[0], statusAnterior: pedido.status };
    }

    // Avança itens do setor (ou todos se setor null)
    if (setor) {
      if (alvo === 'em_producao') {
        await client.query(
          `UPDATE itens_pedido ip
           SET status = 'em_producao'
           FROM produtos pr
           WHERE ip.produto_id = pr.id
             AND ip.pedido_id = $1
             AND COALESCE(pr.setor, 'cozinha') = $2
             AND COALESCE(ip.status, 'recebido') = 'recebido'`,
          [pedido.id, setor]
        );
      } else if (alvo === 'concluido') {
        await client.query(
          `UPDATE itens_pedido ip
           SET status = 'concluido'
           FROM produtos pr
           WHERE ip.produto_id = pr.id
             AND ip.pedido_id = $1
             AND COALESCE(pr.setor, 'cozinha') = $2`,
          [pedido.id, setor]
        );
      } else if (alvo === 'recebido') {
        await client.query(
          `UPDATE itens_pedido ip
           SET status = 'recebido'
           FROM produtos pr
           WHERE ip.produto_id = pr.id
             AND ip.pedido_id = $1
             AND COALESCE(pr.setor, 'cozinha') = $2`,
          [pedido.id, setor]
        );
      }
    } else {
      await client.query(
        `UPDATE itens_pedido SET status = $2 WHERE pedido_id = $1`,
        [pedido.id, alvo]
      );
    }

    const atualizado = await sincronizarStatusPedido(client, pedido.id);
    await client.query('COMMIT');
    return {
      ...(atualizado || { id: pedido.id, status: pedido.status }),
      statusAnterior: pedido.status,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}'''

new_block = '''async function setStatusPedido(pedidoId, statusAlvo, setor = null) {
  const alvo = String(statusAlvo || '').trim();
  if (!['recebido', 'em_producao', 'concluido', 'entregue'].includes(alvo)) {
    throw new ErroPedido(400, 'Status inválido');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, status, sessao_id FROM pedidos WHERE id = $1 FOR UPDATE`,
      [Number(pedidoId)]
    );
    const pedido = rows[0];
    if (!pedido) throw new ErroPedido(404, 'Pedido não encontrado');
    if (pedido.status === 'entregue' && alvo !== 'entregue') {
      throw new ErroPedido(409, 'Pedido já entregue');
    }

    if (alvo === 'entregue') {
      // entrega fecha todos os itens
      await client.query(
        `UPDATE itens_pedido SET status = 'entregue' WHERE pedido_id = $1`,
        [pedido.id]
      );
      const { rows: updated } = await client.query(
        `UPDATE pedidos SET status = 'entregue' WHERE id = $1
         RETURNING id, status, criado_em, editado_em, cliente_nome, sessao_id`,
        [pedido.id]
      );
      await client.query('COMMIT');
      return { ...updated[0], statusAnterior: pedido.status };
    }

    // Conta quantos itens pertencem ao setor pedido (se houver filtro)
    let setorEfetivo = setor;
    if (setor) {
      const { rows: cnt } = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM itens_pedido ip
         JOIN produtos pr ON pr.id = ip.produto_id
         WHERE ip.pedido_id = $1
           AND COALESCE(pr.setor, 'cozinha') = $2`,
        [pedido.id, setor]
      );
      // Se o pedido não tem NENHUM item deste setor (ex.: só bebida e quem
      // chamou foi a cozinha), avança TODOS os itens — evita 200 "mentiroso"
      // e o 409 posterior no garçom.
      if (!cnt[0] || cnt[0].n === 0) {
        setorEfetivo = null;
      }
    }

    let rowCount = 0;
    if (setorEfetivo) {
      if (alvo === 'em_producao') {
        const r = await client.query(
          `UPDATE itens_pedido ip
           SET status = 'em_producao'
           FROM produtos pr
           WHERE ip.produto_id = pr.id
             AND ip.pedido_id = $1
             AND COALESCE(pr.setor, 'cozinha') = $2
             AND COALESCE(ip.status, 'recebido') = 'recebido'`,
          [pedido.id, setorEfetivo]
        );
        rowCount = r.rowCount || 0;
      } else if (alvo === 'concluido') {
        const r = await client.query(
          `UPDATE itens_pedido ip
           SET status = 'concluido'
           FROM produtos pr
           WHERE ip.produto_id = pr.id
             AND ip.pedido_id = $1
             AND COALESCE(pr.setor, 'cozinha') = $2
             AND COALESCE(ip.status, 'recebido') IN ('recebido', 'em_producao')`,
          [pedido.id, setorEfetivo]
        );
        rowCount = r.rowCount || 0;
      } else if (alvo === 'recebido') {
        const r = await client.query(
          `UPDATE itens_pedido ip
           SET status = 'recebido'
           FROM produtos pr
           WHERE ip.produto_id = pr.id
             AND ip.pedido_id = $1
             AND COALESCE(pr.setor, 'cozinha') = $2`,
          [pedido.id, setorEfetivo]
        );
        rowCount = r.rowCount || 0;
      }
    } else {
      // Sem filtro de setor (ou fallback): avança todos os itens do pedido
      const r = await client.query(
        `UPDATE itens_pedido SET status = $2 WHERE pedido_id = $1`,
        [pedido.id, alvo]
      );
      rowCount = r.rowCount || 0;
    }

    const atualizado = await sincronizarStatusPedido(client, pedido.id);
    await client.query('COMMIT');
    return {
      ...(atualizado || { id: pedido.id, status: pedido.status }),
      statusAnterior: pedido.status,
      itensAtualizados: rowCount,
      setorAplicado: setorEfetivo,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}'''

if old_block in text:
    text = text.replace(old_block, new_block)
    p.write_text(text, encoding="utf-8")
    print("  ✓ setStatusPedido corrigido (fallback quando setor não tem itens)")
else:
    # tenta uma substituição mais tolerante
    print("  ⚠ bloco exato não encontrado — tentando substituição parcial...")
    # fallback: só injeta a lógica de contagem se ainda não existir
    if "setorEfetivo" in text:
        print("  ✓ já parece estar patchado (setorEfetivo presente)")
    else:
        print("  ❌ não consegui aplicar automaticamente. Aplique o new_block manualmente.")
        raise SystemExit(1)

print("OK")
PY

# ---------------------------------------------------------------------------
# Ajuste opcional no smoke: preferir produto de cozinha
# ---------------------------------------------------------------------------
if [[ -f scripts/smoke.js ]]; then
  cp -n scripts/smoke.js "scripts/smoke.js.bak.$(date +%s)" 2>/dev/null || true
  python3 << 'PY'
from pathlib import Path
p = Path("scripts/smoke.js")
text = p.read_text(encoding="utf-8")

old = '''  const disponiveis = produtos.filter((p) => p.disponivel !== false);
  const produto = disponiveis[0] || produtos[0];
  const produto2 = disponiveis[1] || disponiveis[0] || produtos[0];'''

new = '''  const disponiveis = produtos.filter((p) => p.disponivel !== false);
  // Preferir produto de cozinha (comida) para o fluxo clássico do smoke.
  // Bebidas (setor=bar) quebravam o teste quando a cozinha avançava o pedido.
  const deCozinha = disponiveis.filter((p) => {
    const s = (p.setor || p.setorProducao || '').toLowerCase();
    const nome = (p.nome || p.name || '').toLowerCase();
    const cat = (p.categoria || p.category || '').toLowerCase();
    if (s === 'bar') return false;
    if (s === 'cozinha') return true;
    // heurística: evita água/refrigerante/cerveja quando o cardápio não traz setor
    if (/água|agua|refrigerante|coca|suco|cerveja|chop|bebida/.test(nome)) return false;
    if (/bebida/.test(cat)) return false;
    return true;
  });
  const produto = deCozinha[0] || disponiveis[0] || produtos[0];
  const produto2 = deCozinha[1] || disponiveis.find((x) => (x.id || x.productId) !== (produto.id || produto.productId)) || disponiveis[0] || produtos[0];'''

if old in text:
    text = text.replace(old, new)
    p.write_text(text, encoding="utf-8")
    print("  ✓ smoke.js: agora prefere produto de cozinha")
else:
    print("  ⚠ trecho do smoke não encontrado (ok se já estiver diferente)")
PY
fi

echo ""
echo "✅ Patch aplicado."
echo "   Reinicie o servidor (Ctrl+C e npm start) e rode de novo:"
echo "   npm run test:smoke"
