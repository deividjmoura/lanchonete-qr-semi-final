# Revisão e correções

Base analisada: deividjmoura/lanchonete-qr-semi-final, commit a45d7fe.

## Tema
- React: o alternador consultava o localStorage em cada clique. Quando ele estava bloqueado, o tema aplicado não era lembrado e os cliques seguintes podiam repetir a mesma escolha. Agora o tema aplicado no HTML é a fonte de estado atual; salvar a preferência é opcional.
- A preferência escura do sistema também funciona quando o armazenamento é bloqueado, inclusive antes de carregar React.
- Removidos estilos escuros duplicados injetados por JavaScript e cores inline no body/root. As cores ficam centralizadas em src/index.css. O modo claro declara color-scheme: light.
- Login legado (public/login.html): theme-glass.css impunha as mesmas cores escuras em light e dark. Removido esse stylesheet somente do login, mantendo style.css, que implementa ambos os temas.
- O dist foi recompilado e acompanha esta entrega. Não foi possível confirmar qual dessas condições ocorre no site do usuário: não foi fornecida URL de implantação e o navegador de teste não pôde ser instalado no ambiente.

## Outros problemas corrigidos
- SSE React: mesa e garçom não enviavam o token ao servidor. Agora enviam mesa/garcom na URL e o servidor aceita tokens existentes; garçom precisa estar ativo.
- Segurança SSE: antes bastava um UUID com formato válido, mesmo inexistente, para receber eventos operacionais. Agora há consulta ao banco. Clientes por token recebem apenas aviso de atualização, sem nomes, tokens ou dados financeiros presentes nos eventos de outras mesas. Staff autenticado mantém os eventos completos. Avisos públicos ainda indicam que houve atividade; não são um sistema de isolamento multiempresa.
- Troca de mesa na mesma aba: React agora remonta a tela ao mudar o token, evitando reutilizar carrinho/nome da mesa anterior.
- TypeScript: removida opção ignoreDeprecations incompatível com TS 5.9; corrigidas quatro assertions inválidas e variáveis não usadas.
- Dashboard Admin: removido acesso ao campo inexistente fotoUrl do modelo Produto; o campo correto é foto. Não era um problema no formulário de edição de fotos.
- Build agora executa a checagem de tipos antes de gerar dist.

## Verificações
- npm run build: passou (TypeScript e Vite).
- npm run test:regression: seis testes passaram, cobrindo alternância sem armazenamento, preferência salva/sistema, bootstrap, autorização SSE, ausência de dados privados nos avisos públicos e URL/cleanup do cliente SSE.
- node --check server.js: passou.
- Não foram executados testes integrados com PostgreSQL real, pedidos e pagamentos: não há banco de testes configurado nesta sessão.
- Não houve validação visual no navegador: o download do Chromium falhou por timeout. Permanece o aviso do Vite sobre bundle JS acima de 500 kB; isso afeta carregamento, não é erro de compilação.

## Aplicar
1. Faça backup da aplicação existente. Preserve seu .env e public/uploads.
2. Extraia este projeto em uma nova pasta; transfira seu .env e uploads para ela.
3. Rode npm ci e npm run test:regression.
4. Rode npm start. O dist atualizado já está incluído. Para recompilar: npm run build.
5. Confira o botão em /#/login e /#/, recarregue a página e teste o fluxo de uma mesa.

Nenhuma migração ou alteração de dados foi feita. Não execute setup/seed para aplicar estas correções em uma instalação existente.
A publicação em produção depende do processo de implantação do repositório. A validação integrada com o banco e a verificação visual permanecem necessárias.

---

# Revisão Arena — 2026-09-16

Base: origin/main (a293c6c) + hardening/pre-sale-audit (34bdf89).

## Causa raiz do "tema escuro não funciona"
A branch `redesign-qradmin` tem o mismatch relatado (`tema.ts` grava `data-theme="escuro"`,
`index.css` só casa `[data-theme="dark"]` → ícone muda, cores não) e **não tem `dist/`
commitado** — o deploy builda do fonte com hashes próprios, diferentes do `dist/` do repo.
Se o Railway deploya dessa branch, nenhuma correção enviada ao `main` chegou ao ar.
**Ação do dono:** no Railway, conferir Settings → Git → Branch = `main` e redeployar.

## Correções aplicadas (branch arena, PR para main)
1. Tema unificado e à prova de legado: valores canônicos `claro|escuro`; CSS aceita
   `escuro`, `dark` e `html.dark`; JS normaliza `dark|light` salvos; fallback inline
   completo; pré-paint cobre os dois temas (sem flash).
2. Paleta clara suave aplicada também no CSS `:root` (antes só existia no fallback
   inline do tema.ts — fontes divergentes da verdade).
3. `dist/` rebuildado e commitado em sincronia com `src/` (estava defasado).
4. Segurança do `hardening/pre-sale-audit` mesclada: bloqueio de SSRF no upload remoto,
   seed de staff exige senha configurada (≥12 caracteres) em produção, validação de
   Origin em requisições autenticadas (CSRF básico), proteção da listagem de mesas,
   cookie de logout com Secure.
5. HTMLs legados (`/admin.html`, `/login.html`, …) redirecionam para a rota SPA quando
   `dist/` existe — versões antigas sem seletor de tema deixam de ficar acessíveis.
6. Testes de regressão consertados (mock de DOM real: getAttribute/setAttribute/classList)
   e ampliados: 11/11 passam (antes 4/6). Cobre aliases legados, flash claro, SSE, SSRF, Origin.
7. Bundle: code-splitting de vendors (react/motion/icons) — principal 569→413 kB.

## Verificações
- `npm run build` (com typecheck): OK.
- `tests/regressions.cjs`: 11/11.
- `scripts/smoke.js` e `scripts/smoke-full.js`: OK (PostgreSQL real).
- Chromium headless contra o build final: 22/22 checks de tema (toggle em todas as telas,
  persistência, OS dark, redirects).
- Nota: `data/db.json` NÃO é resíduo — é a fonte do seed (`db/seed.js`).
