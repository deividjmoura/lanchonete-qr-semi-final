-- 0033_produtos_arquivados.sql
-- Importação de cardápio completo (CSV) — substituição segura.
--
-- O cardápio antigo não pode ser apagado: `itens_pedido.produto_id` é
-- ON DELETE RESTRICT, justamente para preservar o histórico de vendas. Então a
-- substituição "arquiva" os produtos antigos (saem do cardápio do cliente e da
-- lista do admin) em vez de removê-los, e o histórico continua íntegro.
--
-- Arquivado ⇒ não aparece em /api/cardapio nem em /api/admin/cardapio.
-- O produto permanece na tabela para relatórios, comprovantes e auditoria.

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS arquivado BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice parcial: as leituras do cardápio sempre filtram arquivado = false.
CREATE INDEX IF NOT EXISTS idx_produtos_nao_arquivados
  ON produtos (categoria_id)
  WHERE arquivado = FALSE;

COMMENT ON COLUMN produtos.arquivado IS
  'true = saiu do cardápio (importação/substituição) e é mantido apenas pelo histórico';
