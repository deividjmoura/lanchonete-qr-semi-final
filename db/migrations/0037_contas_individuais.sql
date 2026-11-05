-- Issue #48: contas individuais de staff.
--
-- Decisão do responsável: substituir os logins genéricos por papel
-- (admin/cozinha/bar/caixa) por uma conta individual por pessoa. Sem isso não
-- é possível atribuir com confiança quem lançou pagamento, concedeu desconto
-- ou cancelou pedido.
--
-- Migração aditiva: não altera hashes, sessões nem contas existentes.

-- A trilha de credenciais passa a registrar criação e desativação de conta.
ALTER TABLE staff_credencial_eventos
  DROP CONSTRAINT IF EXISTS staff_credencial_eventos_evento_check;
ALTER TABLE staff_credencial_eventos
  ADD CONSTRAINT staff_credencial_eventos_evento_check
  CHECK (evento IN (
    'senha_alterada',
    'senha_troca_falhou',
    'senha_troca_rejeitada',
    'senha_redefinida',
    'senha_redefinicao_rejeitada',
    'conta_criada',
    'conta_criacao_rejeitada',
    'conta_desativada',
    'conta_desativacao_rejeitada'
  ));

-- Desativação é lógica: o histórico de pedidos, pagamentos e auditoria aponta
-- para staff.id, então apagar a linha quebraria a rastreabilidade que esta
-- issue existe para garantir.
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS desativado_em TIMESTAMPTZ;
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS desativado_por INTEGER REFERENCES staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_ativos
  ON staff (papel, login) WHERE ativo;
