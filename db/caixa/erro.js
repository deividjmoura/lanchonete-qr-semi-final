/** Erro de domínio do caixa com status HTTP. */
class ErroCaixa extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { ErroCaixa };
