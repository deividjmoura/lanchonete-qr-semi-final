-- Issue #48: autoria financeira por identidade, não por texto.
--
-- Problema: sessao_pagamentos guardava apenas operador_nome (TEXT). Nome não
-- identifica pessoa: renomear a conta quebra o vínculo histórico, dois
-- funcionários homônimos ficam indistinguíveis, e não há integridade nenhuma
-- ligando o pagamento a quem de fato o lançou.
--
-- Solução: operador_id com FK para staff.
--
-- Decisões de projeto:
--  * ON DELETE SET NULL, não CASCADE: apagar uma conta não pode apagar
--    registro financeiro. O evento de auditoria e operador_nome continuam
--    contando a história mesmo se a conta sumir.
--  * operador_nome é PRESERVADO, não removido. Ele é o retrato do nome no
--    momento do lançamento (histórico), e o backfill não é perfeito.
--  * O backfill só vincula quando existe EXATAMENTE UMA conta ativa com aquele
--    nome. Empate fica NULL de propósito: atribuir no chute seria pior que
--    deixar em aberto, porque produz prova falsa numa disputa financeira.
--
-- Migração aditiva: nenhuma coluna existente é alterada ou removida.

ALTER TABLE sessao_pagamentos
  ADD COLUMN IF NOT EXISTS operador_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN sessao_pagamentos.operador_id IS
  'Conta de staff que lançou o pagamento. NULL quando o lançamento veio do garçom (garcom_id) ou é anterior ao vínculo por identidade.';
COMMENT ON COLUMN sessao_pagamentos.operador_nome IS
  'Nome do operador no momento do lançamento (retrato histórico). Não é identidade: use operador_id para atribuição.';

CREATE INDEX IF NOT EXISTS idx_sessao_pagamentos_operador
  ON sessao_pagamentos (operador_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- Backfill conservador de linhas históricas.
--
-- Para cada pagamento sem operador_id cujo operador_nome casa com o nome de
-- exatamente uma conta de staff ATIVA, vincula. Qualquer ambiguidade (0 ou 2+
-- contas com o mesmo nome) fica sem vínculo.
--
-- Idempotente: reexecutar não altera o que já foi decidido, e nunca sobrescreve
-- um operador_id já gravado.
-- ---------------------------------------------------------------------------
UPDATE sessao_pagamentos p
   SET operador_id = unico.staff_id
  FROM (
        SELECT s.nome AS nome, min(s.id) AS staff_id, count(*) AS total
          FROM staff s
         WHERE s.ativo
         GROUP BY s.nome
        HAVING count(*) = 1
       ) AS unico
 WHERE p.operador_id IS NULL
   AND p.operador_nome IS NOT NULL
   AND btrim(p.operador_nome) <> ''
   AND lower(btrim(p.operador_nome)) = lower(btrim(unico.nome));

-- O garçom é outra identidade (garcons.id), não staff. Registrar no histórico
-- do próprio pagamento evita a leitura errada de "sem autor".
COMMENT ON COLUMN sessao_pagamentos.operador_id IS
  'Conta de staff que lançou o pagamento. NULL quando o lançamento veio do garçom (garcons) ou quando o nome histórico era ambíguo e não pôde ser vinculado com segurança.';
