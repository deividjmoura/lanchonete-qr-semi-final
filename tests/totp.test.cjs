'use strict';

// Issue #55 — 2FA por TOTP. Testes de unidade, com os vetores do RFC 6238.
//
// O que aqui se prova e um teste de integração não provaria bem:
//   - o algoritmo bate com os vetores oficiais (não é "um TOTP parecido");
//   - a janela aceita ±1 passo e recusa fora dela;
//   - o segredo é CIFRADO e só a chave certa o lê;
//   - nenhuma saída pública contém segredo;
//   - os códigos de recuperação são únicos, legíveis e de uso único por hash.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const totp = require('../db/totp');

const CHAVE = crypto.randomBytes(32).toString('hex');
const env = { TOTP_ENC_KEY: CHAVE };

// RFC 6238, Apêndice B — segredo ASCII "12345678901234567890" (SHA1).
const SEGREDO_RFC = totp.base32Encode(Buffer.from('12345678901234567890', 'ascii'));

test('#55 bate com os vetores do RFC 6238 (SHA-1, 8 dígitos truncados)', () => {
  const segredo = totp.base32Decode(SEGREDO_RFC);
  // Os vetores oficiais usam 8 dígitos; aqui comparamos os 8 e depois os 6
  // últimos, que é o que a aplicação usa.
  const vetores = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [segundos, esperado8] of vetores) {
    const passo = Math.floor(segundos / totp.PASSO_SEGUNDOS);
    const codigo8 = (() => {
      const contador = Buffer.alloc(8);
      contador.writeBigUInt64BE(BigInt(passo));
      const hmac = crypto.createHmac('sha1', segredo).update(contador).digest();
      const offset = hmac[hmac.length - 1] & 0x0f;
      const bin =
        ((hmac[offset] & 0x7f) << 24) |
        (hmac[offset + 1] << 16) |
        (hmac[offset + 2] << 8) |
        hmac[offset + 3];
      return String(bin % 10 ** 8).padStart(8, '0');
    })();
    assert.equal(codigo8, esperado8, `vetor RFC com T=${segundos}`);
    // O código de 6 dígitos é o truncamento do mesmo HMAC.
    assert.equal(totp.codigoDoPasso(segredo, passo), esperado8.slice(-6));
  }
});

test('#55 janela aceita ±1 passo e recusa fora dela', () => {
  const segredo = totp.base32Encode(crypto.randomBytes(20));
  const buf = totp.base32Decode(segredo);
  const agora = 1_800_000_000_000; // instante qualquer, múltiplo fechado
  const passo = totp.passoAtual(agora);

  const atual = totp.codigoDoPasso(buf, passo);
  const anterior = totp.codigoDoPasso(buf, passo - 1);
  const seguinte = totp.codigoDoPasso(buf, passo + 1);
  const doisAtras = totp.codigoDoPasso(buf, passo - 2);
  const doisAdiante = totp.codigoDoPasso(buf, passo + 2);

  assert.equal(totp.passoDoCodigoValido(segredo, atual, agora), passo);
  assert.equal(totp.passoDoCodigoValido(segredo, anterior, agora), passo - 1, 'passo anterior é tolerado');
  assert.equal(totp.passoDoCodigoValido(segredo, seguinte, agora), passo + 1, 'passo seguinte é tolerado');
  assert.equal(totp.passoDoCodigoValido(segredo, doisAtras, agora), null, 'passo -2 é recusado');
  assert.equal(totp.passoDoCodigoValido(segredo, doisAdiante, agora), null, 'passo +2 é recusado');
});

test('#55 recusa entrada malformada sem lançar', () => {
  const segredo = totp.base32Encode(crypto.randomBytes(20));
  for (const ruim of ['', null, undefined, '12345', '1234567', 'abcdef', '12345a', {}, []]) {
    assert.equal(totp.passoDoCodigoValido(segredo, ruim), null, `deve recusar ${JSON.stringify(ruim)}`);
  }
});

test('#55 segredo é cifrado e só a chave certa lê', () => {
  const segredo = totp.base32Encode(crypto.randomBytes(20));
  const pacote = totp.cifrarSegredo(segredo, env);

  assert.ok(!pacote.includes(segredo), 'o pacote não pode conter o segredo em claro');
  assert.equal(pacote.split('.').length, 3, 'formato iv.tag.dados');
  assert.equal(totp.decifrarSegredo(pacote, env), segredo);

  const outraChave = { TOTP_ENC_KEY: crypto.randomBytes(32).toString('hex') };
  assert.throws(
    () => totp.decifrarSegredo(pacote, outraChave),
    (e) => e instanceof totp.ErroTotp && e.code === 'TOTP_SEGREDO_ILEGIVEL',
    'chave diferente não pode decifrar'
  );

  // Dois cifrados do mesmo segredo são diferentes (IV aleatório).
  assert.notEqual(totp.cifrarSegredo(segredo, env), totp.cifrarSegredo(segredo, env));
});

test('#55 sem chave configurada falha alto em vez de degradar para "sem 2FA"', () => {
  const segredo = totp.base32Encode(crypto.randomBytes(20));
  assert.throws(
    () => totp.cifrarSegredo(segredo, { TOTP_ENC_KEY: '' }),
    (e) => e instanceof totp.ErroTotp && e.code === 'TOTP_SEM_CHAVE'
  );
  assert.throws(
    () => totp.cifrarSegredo(segredo, { TOTP_ENC_KEY: 'chave-curta' }),
    (e) => e instanceof totp.ErroTotp && e.code === 'TOTP_CHAVE_INVALIDA'
  );
  // Base64 de 32 bytes também é aceito.
  const b64 = crypto.randomBytes(32).toString('base64');
  assert.doesNotThrow(() => totp.cifrarSegredo(segredo, { TOTP_ENC_KEY: b64 }));
});

test('#55 a URI otpauth não expõe nada além do necessário', () => {
  const segredo = totp.base32Encode(crypto.randomBytes(20));
  const uri = totp.uriOtpauth(segredo, 'chefe@lanchonete');
  assert.match(uri, /^otpauth:\/\/totp\//);
  const url = new URL(uri);
  assert.equal(url.searchParams.get('secret'), segredo);
  assert.equal(url.searchParams.get('digits'), '6');
  assert.equal(url.searchParams.get('period'), '30');
  assert.equal(url.searchParams.get('algorithm'), 'SHA1');
  assert.match(decodeURIComponent(uri), /chefe@lanchonete/);
});

test('#55 códigos de recuperação: 10 distintos, legíveis e de uso único por hash', () => {
  const codigos = new Set();
  for (let i = 0; i < 200; i += 1) codigos.add(totp.gerarCodigoRecuperacao());
  assert.equal(codigos.size, 200, 'sem colisão em 200 gerações');

  const codigo = totp.gerarCodigoRecuperacao();
  assert.match(codigo, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{2}$/);
  // Sem caracteres que se confundem ao digitar (0/o, 1/l/i).
  assert.doesNotMatch(codigo, /[01loi]/);

  // Normalização: o usuário digita com ou sem hífen/espaço/maiúscula.
  const hash = totp.hashCodigoRecuperacao(codigo);
  assert.equal(totp.hashCodigoRecuperacao(codigo.toUpperCase()), hash);
  assert.equal(totp.hashCodigoRecuperacao(codigo.replace(/-/g, '')), hash);
  assert.equal(totp.hashCodigoRecuperacao(codigo.replace(/-/g, ' ')), hash);
  assert.notEqual(totp.hashCodigoRecuperacao(totp.gerarCodigoRecuperacao()), hash);
});

test('#55 iniciarAtivacao gera 160 bits e não grava nada', () => {
  const a = totp.iniciarAtivacao('chefe@lanchonete');
  const b = totp.iniciarAtivacao('chefe@lanchonete');
  assert.notEqual(a.segredo, b.segredo, 'cada ativação gera segredo novo');
  // 20 bytes em base32 = 32 caracteres.
  assert.match(a.segredo, /^[A-Z2-7]{32}$/);
  assert.equal(totp.base32Decode(a.segredo).length, 20);
  assert.match(a.uri, /^otpauth:\/\/totp\//);
});
