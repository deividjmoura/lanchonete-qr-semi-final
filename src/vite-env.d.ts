/// <reference types="vite/client" />

/**
 * Valores injetados pelo build (`vite.config.ts`).
 *
 * `__BUILD_VERSION__` identifica o SPA que este bundle executa; `__APP_VERSION__`
 * é a versão legível que aparece nas notas de versão. Ambos vêm da mesma fonte
 * do `dist/build-version.json` e de `package.json`.
 */
declare const __BUILD_VERSION__: string;
declare const __APP_VERSION__: string;
