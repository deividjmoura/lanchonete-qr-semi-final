# 03 — Plano de correção e execução do redesign

**Branch obrigatória:** `design/identidade-visual`  
**Repositório:** https://github.com/deividjmoura/lanchonete-qr-semi-final  
**Produção:** https://qradmin.up.railway.app/  
**Guia:** https://qradmin.up.railway.app/guia-sistema.html  
**Status:** instruções para continuidade; não representa trabalho executado.

## 1. REGRA INEGOCIÁVEL: TRABALHAR SOMENTE NA BRANCH EXISTENTE

Toda a missão deve continuar exclusivamente na branch `design/identidade-visual`.

- Não trabalhar em `main), nem temporariamente.
- Não fazer checkout, commit, push, cherry-pick, rebase ou atualização de `main`.
- Não criar outra branch. A branch de trabalho já existe.
- Antes de qualquer alteração, confirmar a branch atual com `git branch --show-current` e confirmar que o HEAD corresponde à branch remota esperada.
- Se estiver em `main), parar imediatamente e mudar para `design/identidade-visual` antes de ler ou editar arquivos.
- Fazer todos os commits diretamente em `design/identidade-visual`.
- Nunca abrir PR com destino diferente de `main), mas não abrir PR automaticamente sem autorização. Não fazer merge.
- É proibido executar deploy, publicar em produção ou acionar qualquer fluxo que atualize o Railway.
- Se a branch remota tiver avançado, inspecionar e integrar as alterações nela de forma segura. Não resolver divergências usando force push.

**Proteção contra deploy acidental:** `main` dispara deploy no Railway. Portanto, qualquer alteração ou integração em `main` pode afetar produção. Não tocar nela em hipótese alguma.

## 2. CONTEXTO E ESTADO CONHECIDO

O Território A — **Comanda de Chapa** — foi aprovado. Preserve a direção criativa registrada em:

- `docs/design/00-inventario.md`
- `docs/design/01-brief.md`
- `docs/design/02-sistema.md`

O conceito aprovado deriva da operação real: sessão/comanda da mesa, tickets, filas paralelas de cozinha e bar, estados de preparo/retirada/entrega, atendimento móvel e fechamento no caixa.

A auditoria independente encontrou um bloqueio concreto:

- `public/garcom-pwa/design-tokens.css` contém somente `/* RESTORED - see next message */`.
- O arquivo tinha centenas de linhas na base anterior e é importado pelo SPA e pela PWA.
- A alteração removeu a fonte compartilhada de tokens e pode quebrar a aparência de várias superfícies.
- As provas estáticas `piloto-cozinha.html`, `piloto-caixa.html` e `piloto-cliente.html` não foram encontradas versionadas na branch na auditoria anterior.
- Não havia evidência suficiente de implementação visual abrangente nem de execução dos testes de regressão.

Esses pontos devem ser verificados novamente no estado atual da branch antes de agir. Não trate relatos anteriores como prova de que algo foi corrigido.

## 3. PRIMEIRA PRIORIDADE: RECUPERAR OS TOKENS SEM PERDA

Antes de qualquer redesign adicional:

1. Compare `public/garcom-pwa/design-tokens.css` da branch com o mesmo arquivo em `main`, apenas para leitura.
2. Preserve uma cópia do estado atual e registre o diff.
3. Recupere integralmente a versão válida do arquivo a partir de `main` como base, sem modificar `main`.
4. Reaplique somente as mudanças visuais pretendidas, de forma incremental e revisável.
5. Não substitua o arquivo inteiro por placeholder, arquivo vazio ou versão parcial.
6. Verifique que todos os tokens consumidos pelo SPA e pela PWA continuam definidos, incluindo temas claro/escuro, fontes, cores semânticas, superfícies, espaçamentos, raios, sombras e motion.
7. Pesquise referências/imports do arquivo em `src/index.css`, `public/garcom-pwa/` e demais pontos encontrados.
8. Confirme que não há variáveis CSS removidas, referências quebradas ou valores inválidos.

Se não conseguir recuperar e validar os tokens com segurança, pare a implementação visual e documente precisamente o bloqueio. Não peça ao usuário para editar o arquivo manualmente: você é responsável por corrigir o trabalho na branch autorizada.

## 4. PROVAS VISUAIS E DIREÇÃO DE ARTE

Verifique se os três pilotos realmente existem e estão versionados:

- Cozinha
- Caixa
- Cliente

Se estiverem ausentes, crie-os em local apropriado dentro de `docs/design/` ou estrutura equivalente, deixando explícito que são protótipos de validação visual e não telas funcionais.

Os pilotos precisam demonstrar o Território A aplicado a contextos diferentes, não três cópias do mesmo dashboard:

- **Cozinha:** fila densa, leitura rápida a distância, mesa/comanda, itens e estados operacionais.
- **Caixa:** valores monetários alinhados, total/pago/restante, sessão da mesa e ações de fechamento visualmente distintas.
- **Cliente:** cardápio com fotografia protagonista, leitura confortável no celular e acesso claro ao carrinho, conta e Pix.

Use dados fictícios somente nos protótipos estáticos, identificados como demonstração. Nunca introduza dados fictícios na aplicação real.

Os pilotos devem ser visualmente concretos, com HTML/CSS renderizável e screenshots em desktop e mobile, quando o ambiente permitir. Não considere um documento textual ou uma descrição de layout como prova visual.

## 5. IMPLEMENTAÇÃO: COBRIR TODAS AS SUPERFÍCIES REAIS

Depois de recuperar os tokens e validar os pilotos, implemente por ondas, sempre na branch autorizada. Use o inventário para conferir a cobertura:

1. Cozinha e Bar.
2. Garçom SPA e PWA.
3. Caixa.
4. Cliente — rota de mesa/cardápio.
5. Admin e suas seções.
6. Login e fluxo de autenticação.
7. Landing, guia público e HTML legado relevante em `public/`.
8. Estados compartilhados: modais, bottom sheets, toasts, confirmações, formulários, tabelas, loading, vazio, erro, sucesso, disabled e foco.

Cada superfície deve ter composição adequada à sua tarefa. Não force o formato de ticket em tudo: o conceito deve orientar a linguagem, não transformar cardápio, login e administração em cópias da cozinha.

Preserve as decisões registradas no brief, mas use julgamento de produto. O número da mesa, o recorte de ticket e a marcação de estado são assinaturas adaptáveis, não elementos obrigatórios em todos os componentes.

## 6. ZERO MUDANÇA FUNCIONAL

Esta missão é exclusivamente visual. Não alterar:

- Regras de negócio, fluxos de pedidos, sessões/comandas ou fechamento de mesas.
- APIs, endpoints, contratos, payloads ou estrutura do banco.
- Migrations, consultas ou persistência.
- Autenticação, autorização, sessões, permissões ou tokens.
- SSE, eventos em tempo real ou reconexão.
- Web Speech API, notificações ou áudio.
- Pagamentos, Pix, cálculos, descontos, taxas ou valores.
- Geração/leitura de QR Code.
- PWA, offline, IndexedDB, sincronização ou idempotência.
- CSP, headers de segurança ou políticas de origem.
- Validações, navegação funcional, ações e eventos existentes.

Não substituir componentes funcionais por protótipos. Não remover controles para simplificar o layout. Não alterar contratos de props, handlers ou estados sem necessidade comprovada. Se uma alteração visual tocar um componente com lógica, preserve a lógica e demonstre isso nos testes.

Não modificar CSP para fazer fontes ou assets funcionarem. Use as fontes locais já disponíveis. Se algo exigir mudança de segurança, não faça: documente o impedimento e proponha uma alternativa compatível.

## 7. CRITÉRIOS DE QUALIDADE VISUAL

- Tokens são a única fonte para cores, tipografia, espaçamento, raios, elevação e motion.
- Não introduzir emojis como ícones; manter Phosphor com pesos consistentes.
- Não adicionar gradientes, glows, sombras ou glassmorphism decorativos sem função.
- Não transformar tabelas operacionais em grades de cards.
- Não usar a mesma composição em todas as páginas.
- Manter contraste AA no mínimo e buscar 7:1 nas telas operacionais críticas quando viável.
- Estados nunca comunicados somente por cor: combinar posição, forma e texto/ícone.
- Alvos de toque de pelo menos 44 px, preferencialmente 48 px nas áreas operacionais.
- Preservar foco visível e `prefers-reduced-motion`.
- Validar desktop, tablet e mobile; não aceitar overflow, conteúdo cortado ou ações inacessíveis.
- Não instalar dependências sem justificativa técnica concreta.

## 8. VERIFICAÇÃO OBRIGATÓRIA

Antes de declarar qualquer etapa concluída:

1. Executar type-check.
2. Executar build de produção.
3. Executar a suíte de testes existente.
4. Executar lint, se disponível no projeto.
5. Fazer smoke tests das superfícies modificadas.
6. Verificar visualmente desktop e mobile.
7. Conferir que os tokens são carregados tanto no SPA quanto na PWA.
8. Conferir que CSP e headers permanecem inalterados.
9. Conferir diffs para garantir ausência de alterações em servidor, banco, APIs, autenticação, pagamentos, SSE, voz e regras de negócio.
10. Registrar comandos executados, resultados reais e eventuais limitações.

Não invente testes, screenshots ou aprovações. Se não puder executar algo, marque como não verificado e explique por quê. Não altere ou enfraqueça testes para obter aprovação artificial.

## 9. DOCUMENTAÇÃO E RASTREABILIDADE

Atualize os documentos existentes e mantenha este arquivo como plano de execução. Crie um relatório final em `docs/design/04-relatorio-implementacao.md`, contendo:

- Branch e SHA inicial/final.
- Arquivos alterados, agrupados por superfície.
- O que foi feito e o que ficou pendente.
- Decisões visuais efetivamente implementadas.
- Evidências de screenshots antes/depois, quando disponíveis.
- Testes executados, comandos e resultados.
- Confirmação explícita de que não houve alteração funcional intencional.
- Riscos residuais e limitações não verificadas.
- Confirmação de que nenhum merge ou deploy foi realizado.

Não declare a missão inteira concluída enquanto todas as superfícies do inventário não tiverem sido verificadas.

## 10. SEQUÊNCIA DE EXECUÇÃO E PARADA

Siga esta ordem, sem pular etapas:

1. Confirmar branch `design/identidade-visual` e estado do working tree.
2. Revisar o diff atual contra `main` sem alterar `main`.
3. Corrigir e validar `design-tokens.css`.
4. Verificar/criar os três pilotos e capturas.
5. Validar a fundação visual.
6. Implementar por superfície, em commits pequenos.
7. Executar testes e revisão visual a cada onda.
8. Documentar resultados e pendências.
9. Parar na branch `design/identidade-visual`.

Se houver risco de perda de dados, regressão funcional, necessidade de alterar backend/segurança ou dúvida sobre comportamento, não improvisar. Interrompa apenas a parte bloqueada, registre evidências e continue o trabalho visual independente que seja seguro.

## INSTRUÇÃO FINAL

Continue o trabalho existente. Não reinicie o projeto, não descarte o Território A aprovado e não crie outra branch. Corrija primeiro a regressão dos tokens e depois transforme o planejamento em implementação visual verificável.

**Trabalhe exclusivamente em `design/identidade-visual`. Nunca trabalhe em `main`. Nunca faça merge nem deploy. Preserve 100% das funcionalidades.**