-- 0018_transacional_idempotencia.sql
-- Preparo transacional para 50-70 mesas simultâneas (backend, PR separado do
-- PR #14 de Admin/Mesas — por isso 0018: o 0017 é daquele PR; o runner aplica
-- por nome de arquivo, então a lacuna é inofensiva se este merge vier antes).
--
-- 1) Idempotência de mutações financeiras/operacionais: duplo toque, retry de
--    rede e timeout no celular não podem duplicar pedido nem pagamento.
--    O backend aceita `idempotencyKey` opcional no corpo JSON (nenhuma rota
--    muda); a unicidade fica no banco, por sessão, como última linha de defesa.
-- 2) Vínculo 1:1 aviso PIX → pagamento: confirmar o mesmo aviso duas vezes
--    não pode gerar dois lançamentos, mesmo se a aplicação regredir.
-- 3) Checks defensivos NOT VALID (valem para escritas novas sem bloquear a
--    migration por causa de linhas históricas).
-- 4) Índices dos caminhos quentes sob concorrência (sessão→pedidos→itens,
--    pagamentos por sessão, contas fechadas por período, avisos pendentes).
--    O runner executa cada migration numa transação, então CREATE INDEX aqui
--    não é CONCURRENTLY — aceitável no volume atual (restaurante); em histórico
--    com milhões de linhas, crie-os manualmente com CONCURRENTLY antes.

-- ---------------------------------------------------------------------------
-- 1) Idempotência
-- ---------------------------------------------------------------------------
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

COMMENT ON COLUMN pedidos.idempotency_key IS
  'Chave de idempotência enviada pelo cliente (UUID por tentativa de envio); retry com a mesma chave devolve o pedido original';

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_sessao_idempotency
  ON pedidos (sessao_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE sessao_pagamentos
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

COMMENT ON COLUMN sessao_pagamentos.idempotency_key IS
  'Chave de idempotência do lançamento de pagamento parcial; retry com a mesma chave devolve o lançamento original';

CREATE UNIQUE INDEX IF NOT EXISTS uq_pagamentos_sessao_idempotency
  ON sessao_pagamentos (sessao_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE mesa_sessoes
  ADD COLUMN IF NOT EXISTS fechamento_idempotency_key TEXT;

COMMENT ON COLUMN mesa_sessoes.fechamento_idempotency_key IS
  'Chave de idempotência do fechamento; repetir o fechamento com a mesma chave devolve o resultado original em vez de 409';

CREATE UNIQUE INDEX IF NOT EXISTS uq_sessoes_fechamento_idempotency
  ON mesa_sessoes (fechamento_idempotency_key)
  WHERE fechamento_idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Aviso PIX confirmado gera no máximo UM pagamento
-- ---------------------------------------------------------------------------
ALTER TABLE sessao_pagamentos
  ADD COLUMN IF NOT EXISTS pix_aviso_id INTEGER REFERENCES pix_avisos(id) ON DELETE SET NULL;

COMMENT ON COLUMN sessao_pagamentos.pix_aviso_id IS
  'Quando o pagamento nasceu da confirmação de um aviso PIX, aponta para ele (1:1, garantido por índice único)';

CREATE UNIQUE INDEX IF NOT EXISTS uq_pagamentos_pix_aviso
  ON sessao_pagamentos (pix_aviso_id)
  WHERE pix_aviso_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_aviso
  ON sessao_pagamentos (pix_aviso_id)
  WHERE pix_aviso_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Checks defensivos (NOT VALID: protegem escritas novas sem varrer histórico)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produtos_estoque_nao_negativo') THEN
    ALTER TABLE produtos
      ADD CONSTRAINT produtos_estoque_nao_negativo
      CHECK (estoque IS NULL OR estoque >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pix_avisos_valor_positivo') THEN
    ALTER TABLE pix_avisos
      ADD CONSTRAINT pix_avisos_valor_positivo
      CHECK (valor > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mesa_sessoes_valor_cobrado_nao_negativo') THEN
    ALTER TABLE mesa_sessoes
      ADD CONSTRAINT mesa_sessoes_valor_cobrado_nao_negativo
      CHECK (valor_cobrado IS NULL OR valor_cobrado >= 0) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Índices de caminho quente
-- ---------------------------------------------------------------------------
-- getSessao / fecharSessao (contagem de pendentes) / caixa por sessão
CREATE INDEX IF NOT EXISTS idx_pedidos_sessao_status
  ON pedidos (sessao_id, status);

CREATE INDEX IF NOT EXISTS idx_pedidos_sessao_criado
  ON pedidos (sessao_id, criado_em, id);

-- listagens por data (admin dashboard/relatório) e pedidos recentes
CREATE INDEX IF NOT EXISTS idx_pedidos_criado_em
  ON pedidos (criado_em DESC);

-- sincronização de status do pedido a partir dos itens e total entregue
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido_status
  ON itens_pedido (pedido_id, status);

-- soma/lista de pagamentos de uma sessão em ordem cronológica
CREATE INDEX IF NOT EXISTS idx_sessao_pagamentos_sessao_criado
  ON sessao_pagamentos (sessao_id, criado_em);

-- relatório/dashboard de contas fechadas por período
CREATE INDEX IF NOT EXISTS idx_mesa_sessoes_status_fechada
  ON mesa_sessoes (status, fechada_em);

-- caixa lista apenas avisos pendentes
CREATE INDEX IF NOT EXISTS idx_pix_avisos_pendentes
  ON pix_avisos (sessao_id, criado_em)
  WHERE status = 'pendente';
