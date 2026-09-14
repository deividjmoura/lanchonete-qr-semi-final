/**
 * voz-ops.js — anúncios por voz (Web Speech API) para caixa, cozinha e garçom.
 * Sem custo, sem API key — TTS nativo do navegador.
 *
 * Uso:
 *   anunciarPagamento({ mesa: 2, forma: 'pix' })
 *   anunciarCozinha({ mesa: 3, clienteNome: 'Maria' })
 *   anunciarGarcom({ mesa: 5 })
 */
(function (global) {
  const CONFIG = {
    ativo: true,
    modo: 'engracado', // 'formal' | 'engracado' | 'aleatorio'
    volume: 1,
    pitch: 1.05,
    rate: 1.0,
    idioma: 'pt-BR',
  };

  const FRASES_PAG_FORMAIS = [
    (mesa, forma) => 'A conta da mesa ' + mesa + ' foi paga via ' + forma + '.',
    (mesa, forma) => 'Pagamento confirmado. Mesa ' + mesa + ', ' + forma + '.',
    (mesa, forma) => 'Mesa ' + mesa + ' quitada. Forma de pagamento: ' + forma + '.',
  ];

  const FRASES_PAG_ENGRACADAS = [
    (mesa, forma) => 'Ihaaa! A mesa ' + mesa + ' já pagou no ' + forma + '!',
    (mesa, forma) => 'Dinheiro na conta! Mesa ' + mesa + ' mandou o ' + forma + '!',
    (mesa, forma) => 'Alerta de sucesso: mesa ' + mesa + ' pagou no ' + forma + ', bora liberar!',
    (mesa, forma) => 'Isso aí! Mesa ' + mesa + ' acabou de pagar via ' + forma + '!',
    (mesa, forma) => 'Show de bola, mesa ' + mesa + ' quitou no ' + forma + '!',
  ];

  // Cozinha: nome do cliente + número da mesa
  const FRASES_COZ_FORMAIS = [
    (mesa, nome) =>
      nome
        ? 'Novo pedido. Mesa ' + mesa + '. Cliente ' + nome + '.'
        : 'Novo pedido na mesa ' + mesa + '.',
    (mesa, nome) =>
      nome
        ? 'Pedido recebido. Mesa ' + mesa + ', ' + nome + '.'
        : 'Pedido recebido na mesa ' + mesa + '.',
  ];

  const FRASES_COZ_ENGRACADAS = [
    (mesa, nome) =>
      nome
        ? 'Chegou pedido! Mesa ' + mesa + ', ' + nome + ' tá com fome!'
        : 'Chegou pedido na mesa ' + mesa + '!',
    (mesa, nome) =>
      nome
        ? 'Alerta de fome: mesa ' + mesa + ', cliente ' + nome + ' pediu!'
        : 'Alerta de fome: mesa ' + mesa + ' pediu!',
    (mesa, nome) =>
      nome
        ? 'Bora preparar! Mesa ' + mesa + ' · ' + nome + '.'
        : 'Bora preparar! Mesa ' + mesa + '!',
    (mesa, nome) =>
      nome
        ? 'Pedido novo na mesa ' + mesa + '. ' + nome + ' já tá esperando!'
        : 'Pedido novo na mesa ' + mesa + '!',
    (mesa, nome) =>
      nome
        ? 'Cozinha, atenção! Mesa ' + mesa + ', ' + nome + ' mandou o pedido!'
        : 'Cozinha, atenção! Mesa ' + mesa + ' mandou o pedido!',
  ];

  // Garçom: só número da mesa, tom engraçado
  const FRASES_GAR_FORMAIS = [
    (mesa) => 'Pedido pronto para entregar na mesa ' + mesa + '.',
    (mesa) => 'Mesa ' + mesa + ' aguardando entrega.',
  ];

  const FRASES_GAR_ENGRACADAS = [
    (mesa) => 'Tem pedido na mesa ' + mesa + ' pra levar, bora se coçar!',
    (mesa) => 'Mesa ' + mesa + ' tá esperando! Bora se coçar e entregar!',
    (mesa) => 'Pedido pronto na mesa ' + mesa + '. Corre que esfria!',
    (mesa) => 'Ei, mesa ' + mesa + ' tá com o prato pronto. Bora levar!',
    (mesa) => 'Alerta de entrega: mesa ' + mesa + '. Não deixa esfriar!',
    (mesa) => 'Tem pedido na mesa ' + mesa + ' pra levar, anda logo!',
  ];

  const fila = [];
  let falando = false;
  let vozesCache = null;
  let desbloqueado = false;

  function escolherVoz() {
    if (!vozesCache || vozesCache.length === 0) {
      vozesCache = global.speechSynthesis ? global.speechSynthesis.getVoices() : [];
    }
    if (!vozesCache || vozesCache.length === 0) return null;
    return (
      vozesCache.find((v) => v.lang === 'pt-BR') ||
      vozesCache.find((v) => v.lang && v.lang.startsWith('pt')) ||
      null
    );
  }

  if (typeof global.speechSynthesis !== 'undefined') {
    global.speechSynthesis.onvoiceschanged = function () {
      vozesCache = global.speechSynthesis.getVoices();
    };
  }

  /** Chrome/Safari bloqueiam TTS até interação do usuário. */
  function tentarDesbloquear() {
    if (desbloqueado || !('speechSynthesis' in global)) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.onend = u.onerror = function () {
        desbloqueado = true;
      };
      global.speechSynthesis.speak(u);
      desbloqueado = true;
    } catch (_) {}
  }

  if (typeof document !== 'undefined') {
    const once = function () {
      tentarDesbloquear();
      document.removeEventListener('click', once);
      document.removeEventListener('touchstart', once);
      document.removeEventListener('keydown', once);
    };
    document.addEventListener('click', once, { passive: true });
    document.addEventListener('touchstart', once, { passive: true });
    document.addEventListener('keydown', once, { passive: true });
  }

  function processarFila() {
    if (falando || fila.length === 0) return;
    if (!('speechSynthesis' in global)) return;
    falando = true;
    const texto = fila.shift();
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = CONFIG.idioma;
    utter.volume = CONFIG.volume;
    utter.pitch = CONFIG.pitch;
    utter.rate = CONFIG.rate;
    const voz = escolherVoz();
    if (voz) utter.voice = voz;
    utter.onend = utter.onerror = function () {
      falando = false;
      processarFila();
    };
    try {
      global.speechSynthesis.speak(utter);
    } catch (_) {
      falando = false;
    }
  }

  function enfileirar(texto) {
    if (!CONFIG.ativo) return;
    if (!('speechSynthesis' in global)) {
      console.warn('[voz-ops] Web Speech API não suportada neste navegador.');
      return;
    }
    if (!texto) return;
    tentarDesbloquear();
    fila.push(String(texto));
    processarFila();
  }

  function pick(banco) {
    return banco[Math.floor(Math.random() * banco.length)];
  }

  function bancoPorModo(formais, engracadas, modo) {
    const m = modo || CONFIG.modo;
    if (m === 'formal') return formais;
    if (m === 'engracado') return engracadas;
    return Math.random() < 0.5 ? formais : engracadas;
  }

  function anunciarPagamento(opts) {
    opts = opts || {};
    const mesa = opts.mesa;
    const forma = opts.forma || 'pix';
    if (mesa === undefined || mesa === null) {
      console.warn('[voz-ops] número da mesa não informado.');
      return;
    }
    const banco = bancoPorModo(FRASES_PAG_FORMAIS, FRASES_PAG_ENGRACADAS, opts.modo);
    enfileirar(pick(banco)(mesa, forma));
  }

  function anunciarCozinha(opts) {
    opts = opts || {};
    const mesa = opts.mesa;
    if (mesa === undefined || mesa === null) return;
    const nome = (opts.clienteNome || opts.cliente || opts.nome || '').trim();
    const banco = bancoPorModo(FRASES_COZ_FORMAIS, FRASES_COZ_ENGRACADAS, opts.modo);
    enfileirar(pick(banco)(mesa, nome));
  }

  function anunciarGarcom(opts) {
    opts = opts || {};
    const mesa = opts.mesa;
    if (mesa === undefined || mesa === null) return;
    const banco = bancoPorModo(FRASES_GAR_FORMAIS, FRASES_GAR_ENGRACADAS, opts.modo);
    enfileirar(pick(banco)(mesa));
  }

  function definirAtivo(ativo) {
    CONFIG.ativo = !!ativo;
    if (!ativo && 'speechSynthesis' in global) {
      global.speechSynthesis.cancel();
      fila.length = 0;
      falando = false;
    }
  }

  function definirModo(modo) {
    CONFIG.modo = modo;
  }

  // API pública (compatível com voz-pagamento.js antigo)
  global.anunciarPagamento = anunciarPagamento;
  global.anunciarCozinha = anunciarCozinha;
  global.anunciarGarcom = anunciarGarcom;
  global.vozPagamentoConfig = CONFIG;
  global.vozOpsConfig = CONFIG;
  global.vozPagamentoDefinirAtivo = definirAtivo;
  global.vozOpsDefinirAtivo = definirAtivo;
  global.vozPagamentoDefinirModo = definirModo;
  global.vozOpsDefinirModo = definirModo;
})(window);
