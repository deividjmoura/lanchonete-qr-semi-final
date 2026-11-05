// Issue #55 — 2FA por TOTP (RFC 6238) para contas administrativas.
//
// Regras que este módulo garante (e que os testes cobrem):
//   - o segredo é gravado CIFRADO (AES-256-GCM, chave em `TOTP_ENC_KEY`), nunca
//     em claro; sem a chave, nada é recuperável;
//   - janela de ±1 passo de 30 s;
//   - o mesmo passo não é aceito duas vezes (anti-replay);
//   - os 10 códigos de recuperação são de uso único e guardados só como hash;
//   - nenhuma função pública devolve senha, hash, segredo ou token.
//
// Sem dependência externa: o algoritmo é pequeno e auditável, e evitar um
// pacote novo aqui reduz a superfície (mesmo critério usado no resto do repo).
const crypto = require('node:crypto');

const PASSO_SEGUNDOS = 30;
const DIGITOS = 6;
const JANELA = 1; // ±1 passo
const QTD_CODIGOS = 10;
// Sem 0/o, 1/l/i: o código é lido de papel/tela e digitado à mão.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';

class ErroTotp extends Error {
  constructor(message, status = 400, codigo = null) {
    super(message);
    this.status = status;
    if (codigo) this.code = codigo;
  }
}

// ---------------------------------------------------------------- Base32

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

function base32Decode(texto) {
  const limpo = String(texto || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const ch of limpo) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    valor = (valor << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ------------------------------------------------------------- TOTP base

/** Código do passo (HMAC-SHA1 + truncamento dinâmico — RFC 4226 §5.3). */
function codigoDoPasso(segredoBuf, passo) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = crypto.createHmac('sha1', segredoBuf).update(contador).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

function passoAtual(agora = Date.now()) {
  return Math.floor(agora / 1000 / PASSO_SEGUNDOS);
}

/**
 * Confere o código contra a janela ±1 e devolve o passo aceito (ou null).
 * Puro: não toca no banco — quem chama decide sobre anti-replay.
 */
function passoDoCodigoValido(segredoBase32, codigo, agora = Date.now()) {
  const cod = String(codigo || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cod)) return null;
  const segredo = base32Decode(segredoBase32);
  if (!segredo.length) return null;
  const base = passoAtual(agora);
  for (let d = -JANELA; d <= JANELA; d += 1) {
    const passo = base + d;
    const esperado = Buffer.from(codigoDoPasso(segredo, passo));
    const recebido = Buffer.from(cod);
    if (esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido)) {
      return passo;
    }
  }
  return null;
}

/** URI otpauth:// para o app autenticador (o QR é desenhado no cliente). */
function uriOtpauth(segredoBase32, login, emissor = 'Lanchonete QR') {
  const label = encodeURIComponent(`${emissor}:${login}`);
  const params = new URLSearchParams({
    secret: segredoBase32,
    issuer: emissor,
    algorithm: 'SHA1',
    digits: String(DIGITOS),
    period: String(PASSO_SEGUNDOS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---------------------------------------------------------------- cifra

/**
 * Chave AES-256-GCM: 32 bytes em hex (64 caracteres) ou base64.
 *
 * Sem chave configurada, toda operação de 2FA falha com erro claro — e não
 * "degrada para sem 2FA". Degradar seria pior que falhar: desligaria a
 * proteção sem ninguém perceber.
 */
function chaveDeCifra(env = process.env) {
  const bruto = String(env.TOTP_ENC_KEY || '').trim();
  if (!bruto) {
    throw new ErroTotp('2FA não configurado neste servidor (TOTP_ENC_KEY ausente).', 503, 'TOTP_SEM_CHAVE');
  }
  let buf = null;
  if (/^[0-9a-fA-F]{64}$/.test(bruto)) {
    buf = Buffer.from(bruto, 'hex');
  } else {
    try {
      const b = Buffer.from(bruto, 'base64');
      if (b.length === 32) buf = b;
    } catch {}
  }
  if (!buf || buf.length !== 32) {
    throw new ErroTotp(
      'TOTP_ENC_KEY inválida: informe 32 bytes em hex (64 caracteres) ou base64.',
      503,
      'TOTP_CHAVE_INVALIDA'
    );
  }
  return buf;
}

/** Cifra o segredo como base64(iv).base64(tag).base64(dados). */
function cifrarSegredo(segredoBase32, env = process.env) {
  const chave = chaveDeCifra(env);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([
    cipher.update(Buffer.from(String(segredoBase32), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, dados].map((b) => b.toString('base64')).join('.');
}

function decifrarSegredo(pacote, env = process.env) {
  const chave = chaveDeCifra(env);
  const partes = String(pacote || '').split('.');
  if (partes.length !== 3) {
    throw new ErroTotp('Segredo TOTP corrompido.', 500, 'TOTP_SEGREDO_INVALIDO');
  }
  const [iv, tag, dados] = partes.map((p) => Buffer.from(p, 'base64'));
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', chave, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(dados), decipher.final()]).toString('utf8');
  } catch {
    // Chave trocada ou pacote adulterado: mensagem sem detalhe de cripto.
    throw new ErroTotp(
      'Não foi possível ler o segredo de 2FA. Peça a um administrador para redefinir.',
      500,
      'TOTP_SEGREDO_ILEGIVEL'
    );
  }
}

// ------------------------------------------------- códigos de recuperação

function gerarCodigoRecuperacao() {
  const bytes = crypto.randomBytes(10);
  let saida = '';
  for (let i = 0; i < 10; i += 1) saida += ALFABETO[bytes[i] % ALFABETO.length];
  return `${saida.slice(0, 4)}-${saida.slice(4, 8)}-${saida.slice(8)}`;
}

function normalizarCodigoRecuperacao(codigo) {
  return String(codigo || '')
    .toLowerCase()
    .replace(/[\s-]/g, '');
}

function hashCodigoRecuperacao(codigo) {
  return crypto.createHash('sha256').update(normalizarCodigoRecuperacao(codigo)).digest('hex');
}

/**
 * Gera segredo novo para a ativação. NADA é gravado aqui: a ativação só se
 * completa quando a pessoa prova que consegue gerar um código válido.
 */
function iniciarAtivacao(login) {
  const segredo = base32Encode(crypto.randomBytes(20)); // 160 bits
  return { segredo, uri: uriOtpauth(segredo, login) };
}

module.exports = {
  PASSO_SEGUNDOS,
  DIGITOS,
  JANELA,
  QTD_CODIGOS,
  ErroTotp,
  base32Encode,
  base32Decode,
  codigoDoPasso,
  passoAtual,
  passoDoCodigoValido,
  uriOtpauth,
  chaveDeCifra,
  cifrarSegredo,
  decifrarSegredo,
  gerarCodigoRecuperacao,
  normalizarCodigoRecuperacao,
  hashCodigoRecuperacao,
  iniciarAtivacao,
};
