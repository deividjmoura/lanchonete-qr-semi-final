/**
 * O que pode existir na árvore do cardápio do cliente (#/mesa/:token)?
 *
 * O SPA entrega um único arquivo de estilo para todas as rotas. Então, para
 * garantir que o cardápio não mude, duas perguntas precisam de resposta
 * mecânica, e não de inspeção visual:
 *
 *   1. quais regras dos CSS antigos vestiam o cardápio (o gerador as congela);
 *   2. nenhuma regra dos CSS novos pode vestir o cardápio (o teste proíbe).
 *
 * As duas usam o mesmo critério, conservador de propósito: um seletor "pode
 * casar" quando toda classe, todo id e todo atributo que ele exige aparecem no
 * código que desenha a tela. Sobrar regra é inofensivo; faltar não pode.
 */

/** Componentes que entram na tela do cardápio. */
export const RAIZES_DO_CARDAPIO = [
  "src/screens/Mesa.tsx",
  "src/components/Toasts.tsx",
  "src/components/ConfirmacaoGlobal.tsx",
];

/** Sempre carregados, em qualquer rota. Lidos sem seguir os imports: `App.tsx`
 *  importa todas as telas, mas só desenha `Mesa` na rota do cardápio. */
export const SEMPRE_CARREGADOS = [
  "index.html",
  "public/garcom-pwa/theme-init.js",
  "src/main.tsx",
  "src/App.tsx",
  "src/router.tsx",
  "src/lib/identidade.ts",
];

/**
 * Todos os arquivos que podem pôr um elemento, uma classe ou um atributo na
 * tela do cardápio: as raízes, tudo o que elas importam (transitivamente) e os
 * arquivos sempre carregados.
 *
 * @param {(caminho: string) => string | null} ler  devolve o texto ou null se o arquivo não existe
 */
export function fontesDoCardapio(ler) {
  const vistos = new Map();
  const fila = [...RAIZES_DO_CARDAPIO];
  while (fila.length) {
    const atual = fila.pop();
    if (vistos.has(atual)) continue;
    const texto = ler(atual);
    if (texto === null) throw new Error(`arquivo do cardápio não encontrado: ${atual}`);
    vistos.set(atual, texto);
    const pasta = atual.split("/").slice(0, -1);
    for (const m of texto.matchAll(/(?:import|export)\s+(?:[^"';]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g)) {
      const alvo = [...pasta];
      for (const pedaco of m[1].split("/")) {
        if (pedaco === "..") alvo.pop();
        else if (pedaco !== ".") alvo.push(pedaco);
      }
      const base = alvo.join("/");
      if (/\.(css|svg|png|jpe?g|webp|json)$/.test(base)) continue;
      const candidatos = /\.(tsx?|jsx?|mjs|cjs)$/.test(base) ? [base] : [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`];
      const achado = candidatos.find((c) => vistos.has(c) || ler(c) !== null);
      if (!achado) throw new Error(`import não resolvido em ${atual}: ${m[1]}`);
      fila.push(achado);
    }
  }
  for (const arquivo of SEMPRE_CARREGADOS) {
    const texto = ler(arquivo);
    if (texto !== null) vistos.set(arquivo, texto);
  }
  return vistos;
}

/**
 * Pedaços de texto montados em tempo de execução que NÃO são nome de classe.
 * Cada entrada foi conferida no código. Um pedaço novo que não termine (ou
 * comece) com hífen e não esteja aqui aparece em `desconhecidos`, para alguém
 * olhar e classificar.
 */
export const NAO_E_CLASSE = new Map([
  ["prefixo:M", "caminho SVG das ondas do cardápio (Mesa.tsx): `M${x} ${y}`"],
  ["prefixo:Q", "caminho SVG das ondas do cardápio (Mesa.tsx): ` Q${cx} ${cy} …`"],
  ["prefixo:H", "caminho SVG das ondas do cardápio (Mesa.tsx): `… V80 H${x} Z`"],
  ["sufixo:s", "duração por extenso (lib/utils.ts): `${segundos}s`"],
  ["sufixo:min", "duração por extenso (lib/utils.ts): `${minutos}min`"],
  ["sufixo:h", "duração por extenso (lib/utils.ts): `${horas}h${minutos}`"],
  ...["px", "rem", "em", "ms", "deg", "fr", "vh", "vw", "dvh", "svh", "ch"].map((u) => [`sufixo:${u}`, "unidade de medida em estilo inline"]),
]);

/**
 * Vocabulário de um conjunto de arquivos.
 *
 * - `palavras`: cada palavra dos literais de texto (é onde vivem as classes);
 * - `prefixos` / `sufixos`: parte fixa de nomes montados em tempo de execução
 *   (`pub-nome-${id}`, `${base}--ativo`), lida na fronteira de uma palavra;
 * - `desconhecidos`: pedaços montados que não parecem classe nem estão em
 *   NAO_E_CLASSE; continuam contando como classe em potencial;
 * - `bruto`: o texto inteiro, sem hífens e em minúsculas, para procurar
 *   atributos (`tabIndex`, `dataset.mesaPraia`).
 */
export function vocabularioDe(textos) {
  const palavras = new Set();
  const prefixos = new Set();
  const sufixos = new Set();
  const desconhecidos = new Set();
  for (const texto of textos) {
    for (const literal of texto.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
      const conteudo = literal[1] ?? literal[2] ?? literal[3] ?? "";
      for (const pedaco of conteudo.split(/\$\{[^}]*\}/)) {
        for (const palavra of pedaco.split(/[\s"'`<>=(){}[\],;:?|&!]+/)) {
          if (!palavra) continue;
          palavras.add(palavra);
          /* "card-" + tipo */
          if (/^[\w-]+[-_]$/.test(palavra)) prefixos.add(palavra);
        }
      }
      /* `nome-${x}`: só na fronteira de uma palavra (um caminho de URL como
         `/api/admin/pedidos${q}` não é classe). */
      for (const m of conteudo.matchAll(/(?:^|\s)([\w-]+)\$\{/g)) {
        if (/[-_]$/.test(m[1])) prefixos.add(m[1]);
        else if (!NAO_E_CLASSE.has(`prefixo:${m[1]}`)) {
          prefixos.add(m[1]);
          desconhecidos.add(`prefixo:${m[1]}`);
        }
      }
      /* `${x}--ativo` */
      for (const m of conteudo.matchAll(/\$\{[^}]*\}([\w-]+)(?=\s|$|\$\{)/g)) {
        if (/^[-_]/.test(m[1])) sufixos.add(m[1]);
        else if (!NAO_E_CLASSE.has(`sufixo:${m[1]}`)) {
          sufixos.add(m[1]);
          desconhecidos.add(`sufixo:${m[1]}`);
        }
      }
    }
  }
  const bruto = textos.join("\n").toLowerCase().replace(/-/g, "");
  return { palavras, prefixos, sufixos, desconhecidos, bruto };
}

/**
 * O seletor pode casar com algum elemento do cardápio? `:not(...)` não exige a
 * presença de nada, então é ignorado.
 */
export function podeCasarNoCardapio(parte, vocabulario) {
  const exigido = parte.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, "");
  const semAtributos = exigido.replace(/\[[^\]]*\]/g, "");
  const nomes = [...semAtributos.matchAll(/[.#](-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
  for (const nome of nomes) {
    if (vocabulario.palavras.has(nome)) continue;
    if ([...vocabulario.prefixos].some((p) => nome.startsWith(p))) continue;
    if ([...vocabulario.sufixos].some((x) => x.length > 1 && nome.endsWith(x))) continue;
    return false;
  }
  for (const atributo of exigido.matchAll(/\[\s*([\w-]+)/g)) {
    const nome = atributo[1].toLowerCase();
    const procurado = nome.replace(/^data-/, "").replace(/-/g, "");
    if (!vocabulario.bruto.includes(procurado)) return false;
  }
  return true;
}

/**
 * Enumera os seletores de um CSS olhando só para as chaves, sem depender de
 * um parser estrito (o dashboard.css de referência tem um `;` faltando).
 * @returns {{ seletor: string, contexto: string }[]}
 */
export function seletoresDe(css) {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const achados = [];
  const dividir = (lista) => {
    const partes = [];
    let nivel = 0;
    let atual = "";
    for (const c of lista) {
      if (c === "(" || c === "[") nivel += 1;
      else if (c === ")" || c === "]") nivel -= 1;
      if (c === "," && nivel === 0) {
        partes.push(atual.trim());
        atual = "";
      } else atual += c;
    }
    if (atual.trim()) partes.push(atual.trim());
    return partes;
  };
  const andar = (texto, contexto, pai) => {
    let i = 0;
    while (i < texto.length) {
      const abre = texto.indexOf("{", i);
      if (abre < 0) break;
      const preludio = texto.slice(i, abre).split(";").pop().trim();
      let nivel = 1;
      let k = abre + 1;
      while (k < texto.length && nivel > 0) {
        if (texto[k] === "{") nivel += 1;
        else if (texto[k] === "}") nivel -= 1;
        k += 1;
      }
      const corpo = texto.slice(abre + 1, k - 1);
      if (/^@(media|supports|layer|container|scope|starting-style)\b/.test(preludio)) {
        andar(corpo, `${contexto} ${preludio}`.trim(), pai);
      } else if (!preludio.startsWith("@")) {
        /* aninhamento nativo: `&` (ou a ausência dele) refere-se ao seletor pai */
        const partes = dividir(preludio).flatMap((parte) =>
          pai.length
            ? pai.map((p) => (parte.includes("&") ? parte.replace(/&/g, p) : `${p} ${parte}`))
            : [parte],
        );
        for (const seletor of partes) achados.push({ seletor, contexto });
        if (corpo.includes("{")) andar(corpo, contexto, partes);
      }
      i = k;
    }
  };
  andar(limpo, "", []);
  return achados;
}
