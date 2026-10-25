-- Registra quem iniciou ou executou cada transferência de responsabilidade.
-- A migração é aditiva: mantém o histórico já gravado em 0019.
ALTER TABLE mesa_atendimento_historico
  ADD COLUMN IF NOT EXISTS alterado_por_id INTEGER
  REFERENCES garcons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_atendimento_actor
  ON mesa_atendimento_historico(alterado_por_id, alterado_em DESC);
