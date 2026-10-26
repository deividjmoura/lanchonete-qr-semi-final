-- Issue #48: trilha persistente de ações operacionais.
-- Migração aditiva: não altera tabelas nem contratos existentes.
--
-- Regra de conteúdo: NUNCA gravar senha, hash, token bearer, segredo PIX nem
-- dados pessoais sensíveis. O contexto é mínimo e validado por db/auditoria.js.
CREATE TABLE IF NOT EXISTS auditoria_eventos (
  id          BIGSERIAL PRIMARY KEY,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ator_tipo   TEXT NOT NULL
              CHECK (ator_tipo IN ('staff', 'garcom', 'cliente_mesa', 'sistema')),
  ator_id     INTEGER,
  ator_nome   TEXT,
  acao        TEXT NOT NULL,
  alvo_tipo   TEXT,
  alvo_id     TEXT,
  resultado   TEXT NOT NULL DEFAULT 'sucesso'
              CHECK (resultado IN ('sucesso', 'negado', 'falha')),
  contexto    JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id  TEXT
);

CREATE INDEX IF NOT EXISTS idx_auditoria_eventos_criado
  ON auditoria_eventos (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_eventos_acao
  ON auditoria_eventos (acao, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_eventos_ator
  ON auditoria_eventos (ator_tipo, ator_id, criado_em DESC);
