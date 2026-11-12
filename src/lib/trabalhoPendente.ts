/**
 * Detecção conservadora de trabalho não salvo (#301).
 *
 * Serve para UMA decisão: antes de recarregar a página por causa de um deploy,
 * decidir se vale pedir confirmação extra. É proteção de interface, não
 * garantia de transação: ações já enviadas ao servidor e a fila offline do PWA
 * do garçom têm ciclo próprio (ver docs/engineering/ATUALIZACAO-SEGURA.md).
 *
 * Fontes consideradas:
 *  - campos de formulário alterados (valor/checked diferente do inicial);
 *  - operações assíncronas em andamento no cliente HTTP (`lib/operacoes.ts`);
 *  - marcação explícita de tela ocupada/em envio.
 */

import { operacoesEmAndamento } from "./operacoes";

export const SELETOR_OPERACAO_ATIVA =
  '[aria-busy="true"], [data-operation-pending="true"], form[data-submitting="true"]';

const SELETOR_CAMPOS = [
  "input:not([type=hidden]):not([type=submit]):not([type=button])",
  "textarea",
  "select",
].join(", ");

function valorInicial(campo: HTMLElement): string {
  if (campo instanceof HTMLInputElement && (campo.type === "checkbox" || campo.type === "radio")) {
    return String(campo.defaultChecked);
  }
  // `select` não tem defaultValue; o valor inicial é o da opção marcada no HTML.
  if (campo instanceof HTMLSelectElement) {
    const inicial = Array.from(campo.options).find((opcao) => opcao.defaultSelected);
    return inicial ? inicial.value : "";
  }
  if (campo instanceof HTMLInputElement || campo instanceof HTMLTextAreaElement) {
    return campo.defaultValue;
  }
  return "";
}

function valorAtual(campo: HTMLElement): string {
  if (campo instanceof HTMLInputElement && (campo.type === "checkbox" || campo.type === "radio")) {
    return String(campo.checked);
  }
  return (campo as HTMLInputElement).value ?? "";
}

/** `true` quando algum campo visível difere do valor com que foi renderizado. */
export function formularioAlterado(raiz: ParentNode = document): boolean {
  const campos = Array.from(raiz.querySelectorAll<HTMLElement>(SELETOR_CAMPOS));
  return campos.some((campo) => {
    if ((campo as HTMLInputElement).disabled) return false;
    return valorAtual(campo) !== valorInicial(campo);
  });
}

/** `true` quando alguma tela sinaliza operação em andamento na própria marcação. */
export function operacaoSinalizadaNaTela(raiz: ParentNode = document): boolean {
  return Boolean(raiz.querySelector(SELETOR_OPERACAO_ATIVA));
}

export type TrabalhoPendente = {
  pendente: boolean;
  formulario: boolean;
  operacoes: number;
  telaOcupada: boolean;
};

/** Retrato do que está pendente — usado na mensagem de confirmação. */
export function estadoDoTrabalho(raiz: ParentNode = document): TrabalhoPendente {
  const formulario = formularioAlterado(raiz);
  const operacoes = operacoesEmAndamento();
  const telaOcupada = operacaoSinalizadaNaTela(raiz);
  return {
    pendente: formulario || operacoes > 0 || telaOcupada,
    formulario,
    operacoes,
    telaOcupada,
  };
}
