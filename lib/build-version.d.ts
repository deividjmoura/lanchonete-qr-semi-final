/**
 * Tipos do módulo CommonJS `lib/build-version.js`, usado pelo build
 * (`vite.config.ts`), pelo servidor e pelos scripts de versão.
 */

export const ARQUIVO_VERSAO: string;
export const FORMATO_VERSAO: RegExp;

export type VersoesPublicadas = {
  /** Identificador do SPA React (painel, login, cardápio). */
  version: string;
  /** Identificador do aplicativo do garçom (`public/garcom-pwa/`), se publicado. */
  pwa: string | null;
  /** Versão legível da entrega (`package.json`), se publicada. */
  versao: string | null;
};

export function calcularVersaoDoShell(raiz: string): string;
export function calcularVersaoDoPwa(raiz: string): string;
export function calcularVersoesPublicadas(raiz: string): {
  version: string;
  pwa: string;
  versao: string | null;
};
export function obterVersaoBuild(versionPath: string): string | null;
export function obterVersoesPublicadas(versionPath: string): VersoesPublicadas | null;
export function versaoLegivel(raiz: string): string | null;
export function _arquivosDoShell(raiz: string): string[];
export function _arquivosDoPwa(raiz: string): string[];
