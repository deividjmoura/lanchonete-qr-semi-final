function parseMoney(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Number(n.toFixed(2));
}

module.exports = { parseMoney };
