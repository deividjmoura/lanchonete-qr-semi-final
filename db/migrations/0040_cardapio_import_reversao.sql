-- Um ponto de restauração persistente: somente a última importação CSV.
-- Sobrescrito na mesma transação da próxima importação bem-sucedida.
CREATE TABLE cardapio_import_reversao (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  versao UUID NOT NULL,
  anterior JSONB NOT NULL,
  posterior JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  revertido_em TIMESTAMPTZ
);
