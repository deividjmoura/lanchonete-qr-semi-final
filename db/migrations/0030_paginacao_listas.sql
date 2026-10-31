-- Índices para as listas crescentes no Admin: timestamp e id formam uma
-- ordenação estável, inclusive quando dois registros têm a mesma data.
CREATE INDEX IF NOT EXISTS idx_pedidos_paginacao_criado_id
  ON pedidos (criado_em DESC, id DESC);

-- Há contas legadas fechadas sem data de fechamento; NULLS LAST garante que
-- elas também possam ser alcançadas, sem pular registros na paginação.
CREATE INDEX IF NOT EXISTS idx_sessoes_fechadas_paginacao
  ON mesa_sessoes (fechada_em DESC NULLS LAST, id DESC)
  WHERE status = 'fechada';
