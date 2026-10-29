-- Vincula um pedido adicional ao pedido ativo escolhido no PWA do garçom.
-- Mantemos o pedido original intacto e criamos um novo registro com autoria
-- própria; assim a cozinha recebe os novos itens e a trilha histórica não é
-- sobrescrita quando outro garçom acrescenta produtos à mesma comanda.
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS pedido_pai_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'pedidos_pedido_pai_id_fkey'
       AND conrelid = 'pedidos'::regclass
  ) THEN
    ALTER TABLE pedidos
      ADD CONSTRAINT pedidos_pedido_pai_id_fkey
      FOREIGN KEY (pedido_pai_id) REFERENCES pedidos(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pedidos_pedido_pai_id
  ON pedidos (pedido_pai_id)
  WHERE pedido_pai_id IS NOT NULL;

COMMENT ON COLUMN pedidos.pedido_pai_id IS
  'Pedido ativo ao qual este pedido adicional foi associado; preserva autoria própria.';
