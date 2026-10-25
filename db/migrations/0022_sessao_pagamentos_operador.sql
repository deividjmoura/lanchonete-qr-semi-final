-- Identifica quem registrou cada pagamento para auditoria e comprovante.
ALTER TABLE sessao_pagamentos
  ADD COLUMN IF NOT EXISTS operador_nome TEXT;
