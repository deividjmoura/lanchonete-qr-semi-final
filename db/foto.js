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

let _sharp;
function getSharp() {
  if (!_sharp) {
    try {
      _sharp = require('sharp');
    } catch (e) {
      const err = new Error('Módulo sharp indisponível neste ambiente: ' + (e && e.message ? e.message : e));
      err.status = 503;
      throw err;
    }
  }
  return _sharp;
}

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

function garantirDirUpload() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function ipPrivadoOuReservado(hostname) {
  if (!hostname) return true;
  const h = String(hostname).toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1') return true;
  // IPv4 literal
  if (net.isIP(h) === 4) {
    const p = h.split('.').map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
  }
  return false;
}

async function assertUrlSegura(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl).trim());
  } catch {
    throw new ErroFoto(400, 'URL de imagem inválida');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ErroFoto(400, 'URL deve começar com http:// ou https://');
  }
  if (!u.hostname) {
    throw new ErroFoto(400, 'URL de imagem inválida');
  }
  if (ipPrivadoOuReservado(u.hostname)) {
    throw new ErroFoto(400, 'Destino de rede não permitido');
  }
  let addrs;
  try {
    addrs = await dns.lookup(u.hostname, { all: true });
  } catch {
    throw new ErroFoto(400, 'Não foi possível resolver o host da imagem');
  }
  for (const a of addrs || []) {
    if (ipPrivadoOuReservado(a.address)) {
      throw new ErroFoto(400, 'Destino de rede não permitido');
    }
  }
  return u;
}

async function baixarImagem(url) {
  const u = await assertUrlSegura(url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: 'error',
      headers: { 'User-Agent': 'QRAdmin-Foto/1.0' },
    });
    if (!res.ok) {
      throw new ErroFoto(400, 'Não foi possível baixar a imagem (HTTP ' + res.status + ')');
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream')) {
      throw new ErroFoto(400, 'A URL não aponta para uma imagem');
    }
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_INPUT_BYTES) {
      throw new ErroFoto(413, 'Imagem remota muito grande');
    }
    const buf = Buffer.from(await res.arrayBuffer());
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
    if (e && /redirect/i.test(String(e.message || e))) {
      throw new ErroFoto(400, 'Redirecionamento de imagem não permitido');
    }
    throw new ErroFoto(400, 'Falha ao baixar a imagem: ' + (e.message || 'erro de rede'));
  } finally {
    clearTimeout(t);
  }
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) throw new ErroFoto(400, 'Imagem em base64 inválida');
  let buf;
  try {
    buf = Buffer.from(m[2], 'base64');
  } catch {
    throw new ErroFoto(400, 'Base64 inválido');
  }
  if (!buf.length) throw new ErroFoto(400, 'Imagem vazia');
  if (buf.length > MAX_INPUT_BYTES) {
    throw new ErroFoto(413, 'Imagem muito grande (máx ~6 MB)');
  }
  return buf;
}

async function otimizarParaWebp(buf) {
  try {
    return await getSharp()(buf, { failOn: 'none' })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();
  } catch (e) {
    if (e && e.status === 503) throw e;
    throw new ErroFoto(400, 'Arquivo de imagem inválido ou corrompido');
  }
}

async function processarUploadFoto(input) {
  let buf;
  if (typeof input === 'string' && input.startsWith('data:')) {
    buf = parseDataUrl(input);
  } else if (typeof input === 'string' && /^https?:\/\//i.test(input.trim())) {
    buf = await baixarImagem(input.trim());
  } else if (Buffer.isBuffer(input)) {
    buf = input;
  } else {
    throw new ErroFoto(400, 'Envie data-URL base64, Buffer ou URL https');
  }

  const webp = await otimizarParaWebp(buf);
  if (webp.length > MAX_OUTPUT_BYTES) {
    throw new ErroFoto(413, 'Imagem otimizada ainda muito grande');
  }

  const dataUrl = 'data:image/webp;base64,' + webp.toString('base64');

  if (ALSO_WRITE_DISK) {
    garantirDirUpload();
    const nome = crypto.randomBytes(16).toString('hex') + '.webp';
    fs.writeFileSync(path.join(UPLOAD_DIR, nome), webp);
  }

  return { fotoUrl: dataUrl, bytes: webp.length };
}

module.exports = {
  processarUploadFoto,
  ErroFoto,
  UPLOAD_DIR,
};
