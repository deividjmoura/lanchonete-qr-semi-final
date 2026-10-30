-- Liberação progressiva por item, autoria de cada movimentação e replay offline.
-- Aditiva: não recria pedidos, não altera preços nem apaga histórico financeiro.
-- recebido = aguardando preparação (não existe aprovação administrativa neste fluxo).

ALTER TABLE itens_pedido DROP CONSTRAINT IF EXISTS itens_pedido_status_check;
ALTER TABLE itens_pedido ADD CONSTRAINT itens_pedido_status_check
  CHECK (status IN ('recebido','em_producao','concluido','aceito','retirado','entregue','cancelado'));
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('recebido','em_producao','concluido','entregue','cancelado'));

-- O setor é um snapshot do momento do pedido. Alterar o produto no admin não
-- pode mover um hambúrguer já pedido para o bar (nem uma bebida para a cozinha).
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS setor TEXT;
UPDATE itens_pedido ip SET setor = COALESCE(pr.setor,'cozinha')
  FROM produtos pr WHERE pr.id=ip.produto_id AND ip.setor IS NULL;
ALTER TABLE itens_pedido ALTER COLUMN setor SET DEFAULT 'cozinha';
ALTER TABLE itens_pedido ALTER COLUMN setor SET NOT NULL;
ALTER TABLE itens_pedido DROP CONSTRAINT IF EXISTS itens_pedido_setor_check;
ALTER TABLE itens_pedido ADD CONSTRAINT itens_pedido_setor_check CHECK (setor IN ('cozinha','bar'));

ALTER TABLE itens_pedido
  ADD COLUMN IF NOT EXISTS iniciado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pronto_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS preparado_por_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aceito_por_id INTEGER REFERENCES garcons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aceito_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retirado_por_id INTEGER REFERENCES garcons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retirado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entregue_por_id INTEGER REFERENCES garcons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_por_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelado_por_garcom_id INTEGER REFERENCES garcons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelamento_motivo TEXT;

-- Não inferir autores/horários individuais de registros antigos: o último
-- garcom_entregou_id do pedido não prova quem entregou cada item anterior.
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS cliente_criado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Uma operação offline pertence ao garçom, não à sessão que estava aberta no
-- celular. Retry depois de fechar/reabrir a mesa não pode criar outro pedido.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_garcom_idempotency
  ON pedidos (garcom_registrou_id,idempotency_key)
  WHERE garcom_registrou_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_itens_fila_retirada
  ON itens_pedido (pedido_id,status)
  WHERE status IN ('concluido','aceito','retirado');
CREATE INDEX IF NOT EXISTS idx_itens_aceito_por ON itens_pedido (aceito_por_id)
  WHERE aceito_por_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_itens_retirado_por ON itens_pedido (retirado_por_id)
  WHERE retirado_por_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS itens_pedido_historico (
  id BIGSERIAL PRIMARY KEY,
  item_pedido_id INTEGER NOT NULL REFERENCES itens_pedido(id) ON DELETE CASCADE,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status TEXT NOT NULL,
  ator_tipo TEXT NOT NULL CHECK (ator_tipo IN ('staff','garcom','cliente_mesa','sistema')),
  garcom_id INTEGER REFERENCES garcons(id) ON DELETE SET NULL,
  staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id TEXT,
  motivo TEXT
);
CREATE INDEX IF NOT EXISTS idx_itens_historico_pedido
  ON itens_pedido_historico (pedido_id,criado_em,id);
CREATE INDEX IF NOT EXISTS idx_itens_historico_item
  ON itens_pedido_historico (item_pedido_id,criado_em,id);

-- Transferência administrativa preserva o responsável anterior e identifica
-- o funcionário administrativo que autorizou, sem confundir staff com garçom.
ALTER TABLE mesa_atendimento_historico
  ADD COLUMN IF NOT EXISTS alterado_por_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN itens_pedido.status IS
  'recebido (aguarda preparo) → em_producao → concluido (pronto) → aceito → retirado → entregue; cancelado é terminal';
COMMENT ON COLUMN itens_pedido.setor IS 'Setor escolhido na criação do item; não segue alterações posteriores do cadastro do produto';
COMMENT ON COLUMN pedidos.payload_hash IS 'SHA-256 do comando canônico; mesma chave com outro conteúdo é conflito, nunca replay';
