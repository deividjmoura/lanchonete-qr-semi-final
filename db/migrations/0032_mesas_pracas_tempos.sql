-- 0032_mesas_pracas_tempos.sql
-- Classificação interna de mesas por praça + faixas de tempo do panorama.
--
-- Decisões:
--  * Os nomes das praças são DADOS (linhas em mesa_pracas), não constantes de
--    código. O admin pode renomear/criar praças sem deploy.
--  * "Sem praça" é a ausência de vínculo (mesas.praca_id NULL), nunca uma
--    praça fictícia: assim uma mesa sem classificação não se confunde com as
--    praças Praia/Guarda-sol/Salão.
--  * O tempo de ocupação da mesa tem faixas próprias. O alerta de 15 minutos
--    da fila de pedidos (Cozinha/Bar) mede outra coisa e NÃO é reaproveitado
--    aqui: uma mesa pode ficar 60 min ocupada com atendimento em dia.
--    Padrões de atendimento da casa: recente até 45 min (refeição + primeira
--    rodada), atenção de 45 a 90 min (sobremesa/rodadas extras pedem visita),
--    crítica a partir de 90 min (mesa sem giro / possível esquecimento).
--    Os valores ficam no banco para ajuste operacional sem alterar o código.

CREATE TABLE IF NOT EXISTS mesa_pracas (
  id           SERIAL PRIMARY KEY,
  nome         TEXT NOT NULL,
  ordem        INTEGER NOT NULL DEFAULT 0,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mesa_pracas_nome_nao_vazio CHECK (btrim(nome) <> ''),
  CONSTRAINT mesa_pracas_nome_tamanho CHECK (char_length(btrim(nome)) <= 40)
);

-- Nome único sem diferenciar maiúsculas/acentuação de espaços nas pontas:
-- evita duas praças "Praia" e "praia " na mesma casa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mesa_pracas_nome
  ON mesa_pracas (lower(btrim(nome)));

-- Semente idempotente: só cria as praças padrão quando a tabela está vazia.
-- Se o admin já renomeou/criou praças, rodar a migration de novo não mexe em
-- nada (o que importa porque auto-migrate pode rodar em todo deploy).
INSERT INTO mesa_pracas (nome, ordem)
SELECT v.nome, v.ordem
  FROM (VALUES ('Praia', 1), ('Guarda-sol', 2), ('Salão', 3)) AS v(nome, ordem)
 WHERE NOT EXISTS (SELECT 1 FROM mesa_pracas);

ALTER TABLE mesas
  ADD COLUMN IF NOT EXISTS praca_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'mesas_praca_id_fkey'
       AND conrelid = 'mesas'::regclass
  ) THEN
    -- Excluir uma praça não pode apagar mesa nem histórico: apenas devolve a
    -- mesa para "Sem praça".
    ALTER TABLE mesas
      ADD CONSTRAINT mesas_praca_id_fkey
      FOREIGN KEY (praca_id) REFERENCES mesa_pracas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mesas_praca ON mesas (praca_id);

ALTER TABLE configuracao_mesas
  ADD COLUMN IF NOT EXISTS atencao_minutos INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS critico_minutos INTEGER NOT NULL DEFAULT 90;

-- Faixas válidas: atenção positiva e crítico depois da atenção. Assim a UI
-- nunca recebe uma faixa invertida (crítica antes de atenção).
ALTER TABLE configuracao_mesas DROP CONSTRAINT IF EXISTS configuracao_mesas_faixas_check;
ALTER TABLE configuracao_mesas ADD CONSTRAINT configuracao_mesas_faixas_check
  CHECK (atencao_minutos > 0 AND critico_minutos > atencao_minutos);

COMMENT ON TABLE mesa_pracas IS
  'Nomes das praças internas (Praia, Guarda-sol, Salão...). Editáveis pelo admin; nunca hardcoded na UI.';
COMMENT ON COLUMN mesas.praca_id IS
  'Praça atual da mesa. NULL = Sem praça (não é uma praça fictícia).';
COMMENT ON COLUMN configuracao_mesas.atencao_minutos IS
  'Minutos de ocupação a partir dos quais a mesa entra em atenção no panorama.';
COMMENT ON COLUMN configuracao_mesas.critico_minutos IS
  'Minutos de ocupação a partir dos quais a mesa é crítica no panorama. Nunca reutiliza os 15 min da fila de pedidos.';
