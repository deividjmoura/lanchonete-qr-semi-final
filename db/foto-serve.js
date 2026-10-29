// Representação pública das fotos do cardápio (issue #53).
//
// O armazenamento continua durável no Postgres (a data-URL sobrevive a
// redeploy em disco efêmero), mas o JSON do cardápio não transporta mais os
// bytes em Base64: data-URLs viram uma URL de mesma origem resolvida por
// GET /api/cardapio/fotos/:id, que os navegadores cacheiam e carregam com
// lazy loading. URLs externas e caminhos /uploads legados continuam intactos.

const pool = require('./pool');

// Nunca servir SVG/HTML/JavaScript pelo mesmo origin. O upload normaliza em
// WebP, mas fotos legadas podem ser PNG/JPEG/GIF; só aceitamos formatos raster.
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,/i;
const MAX_DATA_URL_BYTES = Number(process.env.FOTO_MAX_SERVE_BYTES || 6 * 1024 * 1024);

function resolverFotoUrl(fotoUrl, produtoId) {
  if (fotoUrl === null || fotoUrl === undefined) return null;
  const valor = String(fotoUrl).trim();
  if (!valor) return null;
  if (valor.startsWith('data:')) {
    if (!Number.isInteger(produtoId) || produtoId < 1) return null;
    return `/api/cardapio/fotos/${produtoId}`;
  }
  // URL externa ou caminho legado: o navegador busca diretamente.
  return valor;
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = raw.match(DATA_URL_RE);
  if (!match) return null;
  const headerEnd = raw.indexOf(',');
  if (headerEnd < 0) return null;
  const base64 = raw.slice(headerEnd + 1);
  // Buffer.from(..., 'base64') tolera caracteres inválidos; rejeitar em vez
  // de servir conteúdo ambíguo e limitar bytes antes de responder HTTP.
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  let buf;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_DATA_URL_BYTES) return null;
  return { contentType: match[1].toLowerCase(), buffer: buf };
}

/**
 * Lê a foto de um produto para servir pelo endpoint público. Não exige
 * autenticação porque a imagem é exibida no cardápio da mesa, mas nunca
 * devolve nada além da imagem (sem preço, estoque ou metadados).
 */
async function carregarFotoProduto(produtoId) {
  const id = Number(produtoId);
  if (!Number.isInteger(id) || id < 1) return null;
  const { rows } = await pool.query(
    'SELECT foto_url FROM produtos WHERE id = $1 LIMIT 1',
    [id]
  );
  const fotoUrl = rows[0] && rows[0].foto_url;
  if (!fotoUrl) return null;
  const valor = String(fotoUrl).trim();
  if (valor.startsWith('data:')) {
    const parsed = parseDataUrl(valor);
    if (!parsed) return null;
    return { kind: 'data', ...parsed };
  }
  if (/^https?:\/\//i.test(valor)) return { kind: 'redirect', location: valor };
  if (valor.startsWith('/') && !valor.startsWith('//')) return { kind: 'redirect', location: valor };
  return null;
}

module.exports = { resolverFotoUrl, parseDataUrl, carregarFotoProduto, DATA_URL_RE, MAX_DATA_URL_BYTES };
