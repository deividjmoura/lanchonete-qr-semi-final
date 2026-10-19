-- Atendimento por sessão, autoria e entrega preservadas mesmo após transferência.
ALTER TABLE mesa_sessoes ADD COLUMN IF NOT EXISTS garcom_responsavel_id INTEGER REFERENCES garcons(id) ON DELETE SET NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS garcom_registrou_id INTEGER REFERENCES garcons(id) ON DELETE SET NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origem_pedido TEXT NOT NULL DEFAULT 'cliente'
  CHECK (origem_pedido IN ('cliente','garcom'));
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS garcom_entregou_id INTEGER REFERENCES garcons(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS mesa_atendimento_historico (
  id BIGSERIAL PRIMARY KEY,
  sessao_id INTEGER NOT NULL REFERENCES mesa_sessoes(id) ON DELETE CASCADE,
  garcom_anterior_id INTEGER REFERENCES garcons(id) ON DELETE SET NULL,
  garcom_novo_id INTEGER NOT NULL REFERENCES garcons(id) ON DELETE RESTRICT,
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessoes_garcom_responsavel
  ON mesa_sessoes(garcom_responsavel_id) WHERE garcom_responsavel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_garcom_registrou ON pedidos(garcom_registrou_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_garcom_entregou ON pedidos(garcom_entregou_id);
CREATE INDEX IF NOT EXISTS idx_atendimento_sessao ON mesa_atendimento_historico(sessao_id, alterado_em DESC);
