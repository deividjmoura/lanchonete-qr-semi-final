-- Issue #55 — 2FA (TOTP) para contas administrativas.
--
-- Desenho aprovado em docs/engineering/admin-credentials-and-2fa.md §2:
--   * escopo: obrigatório para papel = admin, opcional para os demais;
--   * segredo TOTP de 160 bits guardado CIFRADO (AES-256-GCM, chave fora do
--     banco), nunca em claro — nem no banco, nem em log, nem em backup;
--   * 10 códigos de recuperação de uso único, guardados apenas como hash;
--   * janela de ±1 passo (30 s) e recusa de reuso do mesmo passo.
--
-- Migração puramente aditiva: nenhuma conta existente ganha 2FA sozinha.
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS totp_segredo       TEXT,
  ADD COLUMN IF NOT EXISTS totp_ativo         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_ativado_em    TIMESTAMPTZ,
  -- Último passo (contador de 30 s) aceito. Impede reapresentar o mesmo código
  -- dentro da janela de tolerância (replay).
  ADD COLUMN IF NOT EXISTS totp_ultimo_passo  BIGINT;

COMMENT ON COLUMN staff.totp_segredo IS
  'Segredo TOTP cifrado (AES-256-GCM, base64 iv.tag.dados). NULL = 2FA não configurado.';
COMMENT ON COLUMN staff.totp_ultimo_passo IS
  'Maior passo TOTP já aceito; código com passo <= este é rejeitado (anti-replay).';

-- Códigos de recuperação: uso único, apenas hash. O texto em claro existe só na
-- resposta da ativação e não é recuperável depois.
CREATE TABLE IF NOT EXISTS staff_codigos_recuperacao (
  id          BIGSERIAL PRIMARY KEY,
  staff_id    INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  codigo_hash TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  usado_em    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_codigos_recuperacao_hash
  ON staff_codigos_recuperacao (codigo_hash);

CREATE INDEX IF NOT EXISTS idx_staff_codigos_recuperacao_staff
  ON staff_codigos_recuperacao (staff_id, usado_em);

-- Sessão PARCIAL do login em duas etapas.
--
-- Sem esta marca a etapa 1 seria um bypass total do 2FA: quem tem a senha
-- ganharia um cookie de sessão válido e simplesmente ignoraria a etapa 2.
-- `getStaffDaRequisicao` devolve null para sessão pendente, então NENHUMA rota
-- autenticada a aceita; só /api/login/2fa (que lê o token direto) a consome.
ALTER TABLE staff_sessoes
  ADD COLUMN IF NOT EXISTS mfa_pendente BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN staff_sessoes.mfa_pendente IS
  'TRUE = senha conferida, segundo fator pendente. A sessão não autentica nenhuma rota.';

-- Auditoria de 2FA reutiliza staff_credencial_eventos, mas a CHECK original
-- (0024) só aceitava eventos de senha. Ampliamos sem remover nada.
ALTER TABLE staff_credencial_eventos
  DROP CONSTRAINT IF EXISTS staff_credencial_eventos_evento_check;

ALTER TABLE staff_credencial_eventos
  ADD CONSTRAINT staff_credencial_eventos_evento_check
  -- A lista abaixo é a UNIÃO de tudo que o código grava hoje. Encolher esta
  -- CHECK em uma migration nova quebra silenciosamente as features anteriores
  -- (aconteceu: os eventos de conta da 0037 pararam de gravar). Ao adicionar um
  -- evento novo, some ao conjunto, nunca substitua.
  CHECK (evento IN (
    -- 0024 — troca da própria senha
    'senha_alterada', 'senha_troca_falhou', 'senha_troca_rejeitada',
    -- 0028 — admin redefine a senha de outro
    'senha_redefinida', 'senha_redefinicao_rejeitada',
    -- 0037 — contas individuais (#48)
    'conta_criada', 'conta_criacao_rejeitada',
    'conta_desativada', 'conta_desativacao_rejeitada',
    -- 0039 — 2FA (#55)
    'totp_ativado', 'totp_desativado', 'totp_verificado',
    'totp_falhou', 'codigo_recuperacao_usado', 'codigos_recuperacao_gerados'
  ));
