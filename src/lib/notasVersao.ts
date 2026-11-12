import notasPublicadas from "../../public/novidades.json";

/**
 * Notas de versão mostradas no sistema (#301).
 *
 * Fonte ÚNICA: `public/novidades.json`. Fica em `public/` porque o aplicativo
 * do garçom é estático (não passa pelo Vite) e precisa da MESMA lista; o painel
 * lê o arquivo pelo bundler, então não há cópia para manter em dia nem risco de
 * os dois mostrarem novidades diferentes.
 *
 * Regras de conteúdo:
 *  - só entra o que o operador percebe na tela. Refatoração, dependência,
 *    teste e infraestrutura não são novidade para quem usa o sistema;
 *  - texto curto e concreto, na voz de quem atende o salão;
 *  - sem dado de cliente, de pedido ou de instalação: o texto é público e
 *    igual em toda instalação;
 *  - a entrada mais nova fica no topo;
 *  - `versao` é a versão legível de `package.json` (semver). Não é o hash do
 *    build: o hash muda a cada arquivo salvo e não ordena nada. O hash continua
 *    sendo o detector de deploy; a versão legível ordena as notas.
 *  - `scripts/gerar-versoes.cjs --check` valida formato, ordem e se a nota mais
 *    nova bate com a versão do pacote (testes chamam esse script).
 */

export type NotaDeVersao = {
  /** Versão legível da entrega (mesmo valor de `package.json`). */
  versao: string;
  /** Data do deploy, AAAA-MM-DD. Serve para o operador se situar. */
  data: string;
  /** Título curto, no vocabulário do salão. */
  titulo: string;
  /** Uma linha explicando o efeito prático. */
  resumo: string;
  /** Itens opcionais; cada um é uma frase completa. */
  itens?: string[];
};

type ArquivoDeNotas = { notas?: NotaDeVersao[] };

export const NOTAS_DE_VERSAO: NotaDeVersao[] = (notasPublicadas as ArquivoDeNotas).notas ?? [];

/**
 * Busca as notas da publicação atual. Uma aba antiga mantém o JavaScript antigo
 * em memória; por isso não pode depender apenas do JSON embutido no bundle.
 * O fallback local mantém a tela útil se a rede estiver indisponível.
 */
export async function carregarNotasDeVersao(): Promise<NotaDeVersao[]> {
  try {
    const resposta = await fetch('/novidades.json', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!resposta.ok) return NOTAS_DE_VERSAO;
    const dados = (await resposta.json()) as ArquivoDeNotas;
    if (!Array.isArray(dados.notas)) return NOTAS_DE_VERSAO;
    return dados.notas.filter(
      (nota): nota is NotaDeVersao =>
        Boolean(
          nota &&
          typeof nota.versao === 'string' &&
          typeof nota.data === 'string' &&
          typeof nota.titulo === 'string' &&
          typeof nota.resumo === 'string' &&
          (nota.itens === undefined || Array.isArray(nota.itens)),
        ),
    );
  } catch {
    return NOTAS_DE_VERSAO;
  }
}

/** Versão legível embutida neste build (`__APP_VERSION__`, de package.json). */
export const VERSAO_DO_APP: string = __APP_VERSION__;

/** Compara duas versões semver simples (x.y.z). Negativo = `a` é mais antiga. */
export function compararVersoes(a: string, b: string): number {
  const partes = (v: string) =>
    String(v)
      .split("-")[0]
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diferenca = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diferenca !== 0) return diferenca < 0 ? -1 : 1;
  }
  return 0;
}

/** Notas ordenadas da mais nova para a mais antiga (ordem do arquivo). */
export function notasDeVersao(): NotaDeVersao[] {
  return NOTAS_DE_VERSAO;
}

/**
 * Notas publicadas DEPOIS da versão que a aba está executando.
 *
 * Uma aba aberta antes do deploy tem a versão antiga e vê exatamente as notas
 * que perdeu; uma aba já atualizada vê uma lista vazia.
 */
export function notasDepoisDe(
  versaoEmExecucao: string,
  notas: NotaDeVersao[] = NOTAS_DE_VERSAO,
): NotaDeVersao[] {
  if (!versaoEmExecucao) return notas;
  return notas.filter((nota) => compararVersoes(nota.versao, versaoEmExecucao) > 0);
}

/** Texto curto para o rodapé do aviso. Vazio quando não há nota nenhuma. */
export function resumoDeNovidades(notas: NotaDeVersao[]): string {
  const total = notas.reduce((soma, nota) => soma + 1 + (nota.itens?.length ?? 0), 0);
  if (total === 1) return "1 mudança desde a versão aberta nesta tela";
  if (total > 1) return `${total} mudanças desde a versão aberta nesta tela`;
  return "";
}

/** Data no formato do sistema (dd/mm/aaaa), sem depender do fuso do aparelho. */
export function formatarDataDaNota(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : data;
}
