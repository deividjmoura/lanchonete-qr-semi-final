# Plano de hardening de tokens de mesa, PWA e CSP

## Objetivo

Tratar em conjunto AUD-002, AUD-003, REV-002 e os riscos combinados descritos na revisão independente. O objetivo é reduzir o impacto de vazamento de token e de XSS sem quebrar o fluxo QR, a PWA do garçom ou o funcionamento offline.

## Evidências que precisam continuar explícitas

A revisão independente registrou:
- token do garçom persistido em `localStorage` no PWA;
- tokens de mesa persistidos na tabela `mesas`, sem rotação operacional documentada;
- CSP com `script-src 'self' 'unsafe-inline'`;
- a combinação entre execução de script no contexto da aplicação e token bearer acessível pelo JavaScript aumenta o impacto de XSS.

Esses pontos devem ser revalidados no SHA da implementação antes de qualquer alteração.

## Trilha A — inventário de exposição

- [ ] Mapear todos os locais que leem, gravam, transmitem ou exibem tokens de mesa e garçom.
- [ ] Identificar se tokens aparecem em URL, query string, logs, mensagens de erro, analytics ou cabeçalhos Referer.
- [ ] Auditar o sanitizador de logs em cada caminho que recebe token.
- [ ] Mapear persistência offline da PWA e requisitos reais de retomada de sessão.
- [ ] Documentar a diferença entre token de mesa impresso e token de garçom revogável.

## Trilha B — rotação operacional de token de mesa

- [ ] Definir ação administrativa explícita para rotacionar token de uma mesa.
- [ ] Executar a rotação em transação e registrar auditoria sem armazenar o token anterior em claro.
- [ ] Invalidar imediatamente o QR antigo e fornecer novo QR para impressão.
- [ ] Exigir confirmação clara da consequência operacional antes de rotacionar.
- [ ] Definir procedimento de incidente para rotação individual e em lote.
- [ ] Testar que token antigo retorna resposta não autorizada e o novo token mantém o fluxo legítimo.
- [ ] Não impor rotação periódica automática sem processo de reimpressão dos QRs físicos.

## Trilha C — CSP sem unsafe-inline

- [ ] Inventariar scripts inline, handlers inline, estilos inline e páginas HTML estáticas.
- [ ] Identificar quais páginas são geradas pelo servidor e quais são arquivos estáticos.
- [ ] Escolher migração por nonce ou hashes para scripts, conforme a arquitetura de cada página.
- [ ] Não remover `unsafe-inline` em produção antes de cobrir todas as páginas e recursos legítimos.
- [ ] Começar com Content-Security-Policy-Report-Only e coletar violações sem dados sensíveis.
- [ ] Remover `unsafe-inline` de `script-src` após os testes e validação de relatórios.
- [ ] Manter estilos inline separados da decisão sobre scripts; não ampliar permissões por conveniência.
- [ ] Adicionar testes que confirmem a política final e os recursos necessários.

## Trilha D — mitigação de XSS e armazenamento

- [ ] Revisar sinks de HTML e renderização de conteúdo não confiável.
- [ ] Preferir APIs seguras de DOM e sanitização contextual quando HTML for requisito.
- [ ] Avaliar alternativa a `localStorage` para tokens de garçom, considerando PWA offline e modelo de ameaça.
- [ ] Se o armazenamento atual for mantido temporariamente, documentar o risco residual e reforçar CSP, escaping e expiração/revogação.
- [ ] Não migrar token para cookie sem revisar CSRF, escopo, SameSite, Secure, HttpOnly e compatibilidade offline.

## Critérios de aceite

- [ ] Token antigo deixa de funcionar após rotação.
- [ ] Nenhum token completo aparece em logs ou mensagens de erro.
- [ ] CSP de produção não depende de `unsafe-inline` em `script-src`.
- [ ] PWA de garçom continua operando nos cenários online/offline suportados.
- [ ] Testes automatizados cobrem rotação, revogação, CSP e fluxos QR/PWA.
- [ ] Revisão independente confirma que as mudanças não criaram bypass de CSRF nem regressão de autenticação.

## Separação de escopo

Esta PR registra o plano e não altera tokens, autenticação, CSP, armazenamento da PWA ou comportamento de produção. As mudanças de runtime devem ser implementadas em PRs pequenas e testáveis, após o inventário.
