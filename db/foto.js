/**
 * Otimização de fotos de cardápio.
 * Redimensiona (máx 960px) → WebP leve e grava o resultado como data-URL
 * em foto_url (Postgres). Assim a imagem sobrevive a redeploy / disco efêmero.
 *
 * URLs https:// externas continuam válidas (não baixamos de novo no cardápio).
 * Paths /uploads/... antigos ainda são aceitos se o arquivo existir no disco.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const MAX_EDGE = Number(process.env.FOTO_MAX_EDGE || 960);
const WEBP_QUALITY = Number(process.env.FOTO_WEBP_QUALITY || 82);
const MAX_INPUT_BYTES = Number(process.env.FOTO_MAX_INPUT_BYTES || 6 * 1024 * 1024);
/** Tamanho máximo do WebP otimizado antes de virar data-URL (~280 KB). */
const MAX_OUTPUT_BYTES = Number(process.env.FOTO_MAX_OUTPUT_BYTES || 320 * 1024);
const FETCH_TIMEOUT_MS = 12_000;
/** true = também grava cópia em public/uploads (só útil em dev local). */
const ALSO_WRITE_DISK = process.env.FOTO_ALSO_DISK === '1';

class ErroFoto extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function ensureUploadDir() {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
}

function bufferFromBase64(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new ErroFoto(400, 'Imagem em base64 inválida');
  }
  let b64 = raw.trim();
  const m = b64.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (m) b64 = m[1];
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    throw new ErroFoto(400, 'Base64 inválido');
  }
  if (!buf.length) throw new ErroFoto(400, 'Imagem vazia');
  if (buf.length > MAX_INPUT_BYTES) {
    throw new ErroFoto(413, 'Imagem muito grande (máx ~6 MB)');
  }
  return buf;
}

function ipv4PrivadoOuReservado(ip) {
  const oct = ip.split('.').map(Number);
  if (oct.length !== 4 || oct.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = oct;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 0 ||
    a === 192 && b === 168 ||
    a === 198 && (b === 18 || b === 19) ||
    a >= 224 ||
    a === 100 && b >= 64 && b <= 127
  );
}

function ipv6PrivadoOuReservado(ip) {
  const normalized = ip.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  if (normalized.startsWith('ff')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return Boolean(mapped && ipv4PrivadoOuReservado(mapped[1]));
}

function ipPrivadoOuReservado(ip) {
  const family = net.isIP(ip);
  if (family === 4) return ipv4PrivadoOuReservado(ip);
  if (family === 6) return ipv6PrivadoOuReservado(ip);
  return true;
}

async function validarDestinoRemoto(url) {
  let u;
  try {
    u = new URL(String(url || '').trim());
  } catch {
    throw new ErroFoto(400, 'URL de imagem inválida');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ErroFoto(400, 'URL deve começar com http:// ou https://');
  }
  if (!u.hostname || u.username || u.password) {
    throw new ErroFoto(400, 'URL de imagem inválida');
  }

  const literal = net.isIP(u.hostname);
  if (literal) {
    if (ipPrivadoOuReservado(u.hostname)) throw new ErroFoto(400, 'Destino de rede não permitido');
    return u;
  }

  let enderecos;
  try {
    enderecos = await dns.lookup(u.hostname, { all: true, verbatim: true });
  } catch {
    throw new ErroFoto(400, 'Não foi possível resolver o host da imagem');
  }
  if (!enderecos.length || enderecos.some((entry) => ipPrivadoOuReservado(entry.address))) {
    throw new ErroFoto(400, 'Destino de rede não permitido');
  }
  return u;
}

async function fetchUrlBuffer(url) {
  const u = await validarDestinoRemoto(url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LanchoneteQR-Foto/1.0', Accept: 'image/*' },
      redirect: 'error',
    });
    if (!res.ok) {
      throw new ErroFoto(400, 'Não foi possível baixar a imagem (HTTP ' + res.status + ')');
    }
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (ctype && !ctype.startsWith('image/') && !ctype.includes('octet-stream')) {
      throw new ErroFoto(400, 'A URL não aponta para uma imagem');
    }
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_INPUT_BYTES) {
      throw new ErroFoto(413, 'Imagem remota muito grande');
    }
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > MAX_INPUT_BYTES) {
      throw new ErroFoto(413, 'Imagem remota muito grande');
    }
    if (!buf.length) throw new ErroFoto(400, 'Imagem remota vazia');
    return buf;
  } catch (e) {
    if (e instanceof ErroFoto) throw e;
    if (e && e.name === 'AbortError') {
      throw new ErroFoto(408, 'Tempo esgotado ao baixar a imagem');
    }
    if (e && e.name === 'TypeError' && /redirect/i.test(String(e.message || ''))) {
      throw new ErroFoto(400, 'Redirecionamento de imagem não permitido');
    }
    throw new ErroFoto(400, 'Falha ao baixar a imagem: ' + (e.message || 'erro de rede'));
  } finally {
    clearTimeout(t);
  }
}

async function otimizarBuffer(buf) {
  try {
    return await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();
  } catch (e) {
    throw new ErroFoto(400, 'Arquivo de imagem inválido ou corrompido');
  }
}

/**
 * Otimiza e devolve data-URL WebP para gravar em produtos.foto_url (persistente no Neon).
 */
async function salvarFotoOtimizada(buf) {
  const out = await otimizarBuffer(buf);
  if (out.length > MAX_OUTPUT_BYTES) {
    throw new ErroFoto(
      413,
      'Imagem otimizada ainda grande demais. Use uma foto mais simples ou menor.'
    );
  }
  const fotoUrl = 'data:image/webp;base64,' + out.toString('base64');

  if (ALSO_WRITE_DISK) {
    try {
      await ensureUploadDir();
      const name = crypto.randomBytes(12).toString('hex') + '.webp';
      await fs.promises.writeFile(path.join(UPLOAD_DIR, name), out);
    } catch (_) {}
  }

  return {
    fotoUrl,
    bytes: out.length,
    widthMax: MAX_EDGE,
    format: 'webp',
    storage: 'db',
  };
}

async function processarUploadFoto(body) {
  body = body || {};
  let buf = null;
  if (body.data) {
    buf = bufferFromBase64(body.data);
  } else if (body.url) {
    buf = await fetchUrlBuffer(body.url);
  } else {
    throw new ErroFoto(400, 'Envie um arquivo (data) ou uma URL de imagem');
  }
  return salvarFotoOtimizada(buf);
}

async function tentarRemoverUploadLocal(fotoUrl) {
  if (!fotoUrl || typeof fotoUrl !== 'string') return;
  if (!fotoUrl.startsWith('/uploads/')) return;
  const base = path.basename(fotoUrl);
  if (!/^[a-f0-9]+\.webp$/i.test(base)) return;
  const fp = path.join(UPLOAD_DIR, base);
  try {
    await fs.promises.unlink(fp);
  } catch (_) {}
}

module.exports = {
  ErroFoto,
  processarUploadFoto,
  salvarFotoOtimizada,
  tentarRemoverUploadLocal,
  validarDestinoRemoto,
  UPLOAD_DIR,
};
