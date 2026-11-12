/**
 * Aviso de nova versão no aplicativo do garçom (#301).
 *
 * Antes deste módulo, o PWA do garçom era a única superfície sem qualquer aviso
 * de atualização: quem estava com o aplicativo aberto seguia no shell antigo
 * até fechar a aba, e o service worker só trocava o cache por conta própria.
 * O painel avisava; o salão, não.
 *
 * Como a versão é descoberta (duas fontes, porque uma só não basta):
 *
 *  1. **`versao.json` do shell** — gerado junto com o aplicativo
 *     (`npm run build:versoes`) com o identificador de `public/garcom-pwa/`.
 *     O service worker o serve do CACHE, como o resto do shell: assim o valor
 *     corresponde ao JavaScript que está de fato rodando, e não ao que acabou
 *     de chegar pela rede. É esse valor que se compara com `GET /api/version`
 *     (campo `pwa`).
 *  2. **Troca de service worker** (`controllerchange`) — quando o navegador
 *     baixa o shell novo e o SW novo assume, a página em memória ainda é a
 *     antiga. Nesse caso o aviso aparece mesmo sem diferença de hash.
 *
 * Regras (as mesmas do aviso do painel):
 *
 *  - falha de rede, 404 ou resposta estranha NUNCA aparecem na tela e nunca
 *    bloqueiam o atendimento;
 *  - nada recarrega sozinho: "Atualizar agora" pede confirmação e recarrega;
 *    "Continuar por enquanto" adia aquela versão e não volta a incomodar;
 *  - pedido em envio ou fila offline pendente aumentam o aviso de risco na
 *    confirmação, mas adiar nunca descarta nada;
 *  - consulta a cada 60s e ao voltar para o aplicativo; em segundo plano não.
 */

/** Marca do adiamento: guarda só o identificador da versão adiada. */
export const CHAVE_ADIADA = 'garcom-atualizacao-adiada';
/** Identificador do shell que ESTE aparelho executa, gravado no primeiro boot. */
export const CHAVE_SHELL_LOCAL = 'garcom-shell-local';
export const INTERVALO_MS = 60000;

let versaoLocal = null; // identificador do shell que este aparelho executa
let versaoLegivelLocal = ''; // versão legível do shell (para filtrar as notas)
let estado = 'ocioso'; // ocioso | disponivel | dispensado
let versaoPublicada = null;
let emVoo = false;
let timer = null;
let painel = null;
let novidades = [];
let contarPendentes = null;
let swAtualizado = false;

/**
 * Identificador do shell que este aparelho está executando.
 *
 * Não pode ser lido do `versao.json` do cache a cada checagem: o service worker
 * é network-first e regrava esse arquivo quando o servidor publica outro, então
 * o valor "local" passaria a ser igual ao publicado e o aviso nunca apareceria.
 * Na primeira execução, `versao.json` AINDA é o do shell recém-instalado — esse
 * valor é gravado no armazenamento local e passa a representar a versão deste
 * aparelho até ela ser efetivamente trocada por uma recarga.
 */
function shellLocalGravado() {
  try {
    const valor = localStorage.getItem(CHAVE_SHELL_LOCAL);
    return valor && /^[a-f0-9]{16}$/.test(valor) ? valor : null;
  } catch (_) {
    return null;
  }
}

function gravarShellLocal(versao) {
  try {
    localStorage.setItem(CHAVE_SHELL_LOCAL, versao);
  } catch (_) {
    /* sem armazenamento: cada boot recomeça do versao.json atual */
  }
}

function lerAdiamento() {
  try {
    return localStorage.getItem(CHAVE_ADIADA);
  } catch (_) {
    return null;
  }
}

function gravarAdiamento(versao) {
  try {
    localStorage.setItem(CHAVE_ADIADA, versao);
  } catch (_) {
    /* armazenamento bloqueado: o adiamento vale só enquanto a aba estiver aberta */
  }
}

/** Consulta a versão publicada. Sempre resolve `null` em falha. */
async function consultarVersaoPublicada() {
  try {
    const res = await fetch('/api/version', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const dados = await res.json();
    if (typeof dados.pwa !== 'string' || !/^[a-f0-9]{16}$/.test(dados.pwa)) return null;
    return {
      pwa: dados.pwa,
      versao: typeof dados.versao === 'string' && /^\d+\.\d+\.\d+$/.test(dados.versao)
        ? dados.versao
        : null,
    };
  } catch (_) {
    return null;
  }
}

/** Quantos pedidos deste aparelho ainda não foram confirmados pelo servidor. */
async function riscoDeRecarregar() {
  const riscos = [];
  let quantidade = 0;
  try {
    quantidade = contarPendentes ? Number(contarPendentes()) || 0 : 0;
  } catch (_) {
    quantidade = 0;
  }
  if (quantidade > 0) {
    riscos.push(
      quantidade === 1
        ? 'há 1 pedido neste aparelho ainda não confirmado pelo servidor'
        : `há ${quantidade} pedidos neste aparelho ainda não confirmados pelo servidor`,
    );
  }
  if (document.querySelector('dialog[open]#orderModal')) {
    riscos.push('há um pedido sendo montado nesta tela');
  }
  return riscos;
}

function rotuloDeItens(notas) {
  const total = notas.reduce((soma, nota) => soma + 1 + (nota.itens ? nota.itens.length : 0), 0);
  if (!total) return '';
  return total === 1
    ? '1 mudança desde a versão aberta neste aparelho'
    : total + ' mudanças desde a versão aberta neste aparelho';
}

function botaoFechar() {
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'icon-close';
  fechar.setAttribute('aria-label', 'Dispensar aviso de atualização');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'pwa-icon-sm');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', './icons.svg#x-bold');
  svg.appendChild(use);
  fechar.appendChild(svg);
  fechar.addEventListener('click', dispensar);
  return fechar;
}

function montarPainel() {
  if (painel) return painel;
  const el = document.createElement('aside');
  el.id = 'updateNotice';
  el.className = 'update-notice';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-label', 'Nova versão disponível');
  el.hidden = true;
  // Host fixo no HTML (antes do conteúdo): o aviso aparece acima da grade sem
  // empurrar a barra inferior nem cobrir os botões de ação.
  const host = document.getElementById('updateNoticeHost');
  (host || document.body).appendChild(el);
  painel = el;
  return el;
}

function renderizar() {
  const el = montarPainel();
  if (estado !== 'disponivel') {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  el.hidden = false;
  el.replaceChildren();

  const texto = document.createElement('div');
  texto.className = 'update-notice-copy';
  const titulo = document.createElement('strong');
  titulo.textContent = 'Nova versão disponível';
  texto.appendChild(titulo);
  const resumo = rotuloDeItens(novidades);
  const detalhe = swAtualizado && !resumo
    ? 'A versão nova já foi baixada. Atualize quando terminar o atendimento.'
    : resumo
      ? ' — ' + resumo + '. Atualize quando terminar o atendimento.'
      : ' — atualize quando terminar o atendimento. Você segue na versão atual até decidir.';
  texto.appendChild(document.createTextNode(detalhe));

  const acoes = document.createElement('div');
  acoes.className = 'update-notice-actions';

  const atualizar = document.createElement('button');
  atualizar.type = 'button';
  atualizar.className = 'primary small';
  atualizar.textContent = 'Atualizar agora';
  atualizar.addEventListener('click', () => void atualizarAgora());

  const adiar = document.createElement('button');
  adiar.type = 'button';
  adiar.className = 'small';
  adiar.textContent = 'Continuar por enquanto';
  adiar.addEventListener('click', dispensar);

  acoes.append(atualizar, adiar, botaoFechar());
  el.append(texto, acoes);

  if (novidades.length) {
    const detalhes = document.createElement('details');
    detalhes.className = 'update-notice-notes';
    const sumario = document.createElement('summary');
    sumario.textContent = 'O que mudou desde esta tela';
    detalhes.appendChild(sumario);
    const lista = document.createElement('ul');
    for (const nota of novidades) {
      const item = document.createElement('li');
      const tituloNota = document.createElement('strong');
      tituloNota.textContent = nota.titulo;
      item.appendChild(tituloNota);
      item.appendChild(document.createTextNode(' — ' + nota.resumo));
      if (Array.isArray(nota.itens) && nota.itens.length) {
        const sub = document.createElement('ul');
        for (const linha of nota.itens) {
          const li = document.createElement('li');
          li.textContent = linha;
          sub.appendChild(li);
        }
        item.appendChild(sub);
      }
      lista.appendChild(item);
    }
    detalhes.appendChild(lista);
    el.appendChild(detalhes);
  }
}

function aplicar(novo, versao) {
  estado = novo;
  versaoPublicada = versao;
  renderizar();
}

function detectar(versao) {
  if (!versao || versao === versaoLocal) return;
  if (lerAdiamento() === versao) return;
  if (estado === 'disponivel' && versaoPublicada === versao) return;
  aplicar('disponivel', versao);
}

async function verificar() {
  if (emVoo || !versaoLocal || document.visibilityState === 'hidden') return;
  emVoo = true;
  try {
    const publicada = await consultarVersaoPublicada();
    if (!publicada) return;

    // A versão legível pertence ao JS em execução (app.js), não ao manifesto
    // baixado da rede. Assim uma aba antiga detecta um deploy mesmo quando o
    // service worker ainda não precisou trocar de cache.
    const versaoNova =
      publicada.versao &&
      versaoLegivelLocal &&
      compararVersoes(publicada.versao, versaoLegivelLocal) > 0;
    const hashNovo = publicada.pwa !== versaoLocal;
    if (!versaoNova && !hashNovo) return;

    detectar('versao:' + (publicada.versao || '') + ':' + publicada.pwa);
  } finally {
    emVoo = false;
  }
}

export function dispensar() {
  if (versaoPublicada) gravarAdiamento(versaoPublicada);
  aplicar('dispensado', versaoPublicada);
}

async function atualizarAgora() {
  const riscos = await riscoDeRecarregar();
  const pergunta =
    'Atualizar para a nova versão?\n\n' +
    (riscos.length
      ? 'Atenção: ' + riscos.join('; ') + '. Nada é perdido ao recarregar, mas confira a fila antes.\n\n'
      : 'Confirme que os pedidos das suas mesas já foram lançados.\n\n') +
    'A tela será recarregada e o aviso desaparece. O aplicativo volta na mesma aba, com o acesso do garçom preservado.';
  if (!window.confirm(pergunta)) {
    dispensar();
    return;
  }
  /* A página já tem o service worker novo controlando: recarregar traz o shell
     atual do cache, e no boot seguinte `versao.json` é lido de novo para gravar
     a versão de referência do aparelho. */
  window.location.reload();
}

/** Compara versões semver simples (x.y.z). */
function compararVersoes(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diferenca = (pa[i] || 0) - (pb[i] || 0);
    if (diferenca !== 0) return diferenca < 0 ? -1 : 1;
  }
  return 0;
}

/** Notas publicadas depois da versão legível deste shell. */
export function selecionarNovidades(todas, versaoLegivel) {
  if (!Array.isArray(todas) || !todas.length) return [];
  const partes = (v) =>
    String(v || '')
      .split('-')[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const maisNovaQue = (candidata, referencia) => {
    const pa = partes(candidata);
    const pb = partes(referencia);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d > 0;
    }
    return false;
  };
  if (!partes(versaoLegivel).length) return [];
  return todas.filter((nota) => maisNovaQue(nota.versao, versaoLegivel));
}

/**
 * O service worker baixou o shell novo e assumiu o controle, mas esta página
 * continua executando o JavaScript antigo. `versaoLocal` não muda até
 * recarregar, então o aviso é aberto aqui — sem esperar a próxima consulta.
 */
export function sinalizarShellAtualizado() {
  if (swAtualizado) return;
  swAtualizado = true;
  if (estado === 'disponivel') return;
  const chave = 'shell:' + (versaoLocal || '');
  if (lerAdiamento() === chave) return;
  aplicar('disponivel', chave);
}

/**
 * Liga o aviso. `opcoes.aoContarPendentes` devolve quantos pedidos deste
 * aparelho ainda não foram confirmados (usado só no texto da confirmação).
 */
export async function iniciarAvisoDeAtualizacao(opcoes = {}) {
  contarPendentes = typeof opcoes.aoContarPendentes === 'function' ? opcoes.aoContarPendentes : null;
  let versaoDoArquivo = null;
  let versaoLegivelDoArquivo = '';
  try {
    const resposta = await fetch('./versao.json', { cache: 'no-store' });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    versaoDoArquivo = typeof dados.pwa === 'string' ? dados.pwa : null;
    versaoLegivelDoArquivo = typeof dados.versao === 'string' ? dados.versao : '';
  } catch (_) {
    return null;
  }
  if (!versaoDoArquivo) return null;

  /* Duas cargas para trocar a referência: a primeira depois do deploy ainda
     está executando o JavaScript antigo (o service worker novo só assume o
     controle; a página em memória não muda). A referência só avança quando a
     versão nova aparece em duas cargas seguidas — ou seja, na primeira vez em
     que a tela realmente roda o código novo. */
  const gravada = shellLocalGravado();
  const arquivoMudou = gravada !== null && gravada !== versaoDoArquivo;
  if (arquivoMudou && opcoes.shellAtualizado) {
    versaoLocal = gravada;
    swAtualizado = true;
    gravarShellLocal(versaoDoArquivo);
  } else {
    versaoLocal = versaoDoArquivo;
    gravarShellLocal(versaoDoArquivo);
  }
  versaoLegivelLocal = opcoes.versaoLegivel || versaoLegivelDoArquivo;

  if (opcoes.shellAtualizado && !swAtualizado) swAtualizado = true;

  if (versaoLegivelLocal) {
    try {
      const resposta = await fetch('./novidades.json', { cache: 'no-store' });
      if (resposta.ok) {
        const dados = await resposta.json();
        novidades = selecionarNovidades(dados.notas, versaoLegivelLocal);
      }
    } catch (_) {
      novidades = [];
    }
  }

  montarPainel();
  if (swAtualizado) aplicar('disponivel', 'shell:' + versaoLocal);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void verificar();
  });
  window.addEventListener('online', () => void verificar());
  void verificar();
  if (timer) clearInterval(timer);
  timer = setInterval(() => void verificar(), INTERVALO_MS);
  return { versaoLocal, verificar, dispensar, estado: () => estado };
}

/** Só para testes: reinicia o estado em memória. */
export function _reiniciar() {
  if (timer) clearInterval(timer);
  timer = null;
  versaoLocal = null;
  versaoLegivelLocal = '';
  versaoPublicada = null;
  estado = 'ocioso';
  emVoo = false;
  novidades = [];
  swAtualizado = false;
  if (painel) painel.remove();
  painel = null;
}
