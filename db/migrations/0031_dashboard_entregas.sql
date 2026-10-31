-- A média do dashboard é por data de entrega real, não por criação do pedido.
CREATE INDEX IF NOT EXISTS idx_itens_entregue_em_dashboard
  ON itens_pedido (entregue_em)
  WHERE status = 'entregue' AND entregue_em IS NOT NULL;
