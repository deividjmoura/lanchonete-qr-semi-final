-- Mesas habilitadas para uso pelo restaurante (não remove nem recria mesas existentes).
CREATE TABLE IF NOT EXISTS configuracao_mesas (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  quantidade INTEGER NOT NULL DEFAULT 20 CHECK (quantidade BETWEEN 1 AND 70)
);
INSERT INTO configuracao_mesas (id, quantidade) VALUES (1, 20)
ON CONFLICT (id) DO NOTHING;
