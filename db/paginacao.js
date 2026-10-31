'use strict';

// Cursores opacos para listas administrativas. Ordenamos por timestamp + id;
// o timestamp é formatado pelo PostgreSQL com microssegundos (Date do JS perde
// essa precisão). O cursor não é uma credencial e nunca substitui autorização.
class ErroPaginacao extends Error {
  constructor(message) {
    super(message);
    this.name = 'ErroPaginacao';
    this.status = 400;
  }
}

function limitePagina(raw, padrao = 10, maximo = 50) {
  if (raw == null) return padrao;
  const texto = String(raw);
  if (!/^[1-9]\d*$/.test(texto)) throw new ErroPaginacao('Limite de página inválido');
  const n = Number(texto);
  if (!Number.isSafeInteger(n) || n > maximo) {
    throw new ErroPaginacao(`Limite de página deve estar entre 1 e ${maximo}`);
  }
  return n;
}

function validarData(data) {
  if (data == null) return null;
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data) || data.startsWith('0000')) {
    throw new ErroPaginacao('Data inválida. Use AAAA-MM-DD');
  }
  const d = new Date(`${data}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== data) {
    throw new ErroPaginacao('Data inválida. Use AAAA-MM-DD');
  }
  return data;
}

function validarPeriodo(from, to) {
  const inicio = validarData(from);
  const fim = validarData(to);
  if (inicio && fim && inicio > fim) throw new ErroPaginacao('A data inicial não pode ser posterior à final');
  return { from: inicio, to: fim };
}

function criarCursor(tipo, data, id, filtros = []) {
  const json = JSON.stringify({ v: 1, tipo, data, id: Number(id), filtros });
  return Buffer.from(json, 'utf8').toString('base64url');
}

function lerCursor(raw, tipo, filtros = [], { permiteDataNula = false } = {}) {
  if (raw == null) return null;
  const invalido = () => { throw new ErroPaginacao('Cursor de paginação inválido ou incompatível com os filtros'); };
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) return invalido();
  let cursor;
  try {
    const bytes = Buffer.from(raw, 'base64url');
    if (bytes.toString('base64url') !== raw) return invalido();
    cursor = JSON.parse(bytes.toString('utf8'));
  } catch (_) { return invalido(); }
  if (!cursor || cursor.v !== 1 || cursor.tipo !== tipo ||
      !Number.isInteger(cursor.id) || cursor.id < 1 || cursor.id > 2147483647 ||
      JSON.stringify(cursor.filtros) !== JSON.stringify(filtros)) return invalido();
  if (cursor.data === null && permiteDataNula) return cursor;
  if (typeof cursor.data !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.data) ||
      cursor.data.startsWith('0000')) return invalido();
  const instante = new Date(cursor.data);
  if (!Number.isFinite(instante.getTime()) || instante.toISOString().slice(0, 19) !== cursor.data.slice(0, 19)) return invalido();
  return cursor;
}

module.exports = { ErroPaginacao, limitePagina, validarPeriodo, criarCursor, lerCursor };
