-- A remoção encerra definitivamente o acesso, mas mantém o cadastro para as
-- FKs de atendimentos, pagamentos, autoria e relatórios históricos.
ALTER TABLE garcons ADD COLUMN IF NOT EXISTS removido_em TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'garcons'::regclass AND conname = 'garcons_removido_inativo'
  ) THEN
    ALTER TABLE garcons ADD CONSTRAINT garcons_removido_inativo
      CHECK (removido_em IS NULL OR ativo = FALSE);
  END IF;
END $$;

COMMENT ON COLUMN garcons.removido_em IS
  'Remoção lógica definitiva do acesso; a autoria histórica é preservada.';
