-- Redefinição de senha pelo admin (senha esquecida de qualquer setor).
-- Migração aditiva: não altera hashes nem sessões existentes.
--
-- A trilha passa a registrar QUEM redefiniu (ator), além de quem foi afetado.
-- Continua sem guardar senha, hash, token ou IP.

ALTER TABLE staff_credencial_eventos
  ADD COLUMN IF NOT EXISTS ator_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE staff_credencial_eventos
  ADD COLUMN IF NOT EXISTS ator_login TEXT;

-- O CHECK original só conhecia a troca da própria senha. Ampliamos a lista
-- mantendo os valores antigos para não invalidar histórico.
ALTER TABLE staff_credencial_eventos
  DROP CONSTRAINT IF EXISTS staff_credencial_eventos_evento_check;
ALTER TABLE staff_credencial_eventos
  ADD CONSTRAINT staff_credencial_eventos_evento_check
  CHECK (evento IN (
    'senha_alterada',
    'senha_troca_falhou',
    'senha_troca_rejeitada',
    'senha_redefinida',
    'senha_redefinicao_rejeitada'
  ));

CREATE INDEX IF NOT EXISTS idx_staff_credencial_eventos_ator
  ON staff_credencial_eventos (ator_staff_id, criado_em DESC);
