# Frente 3 — validação de instalação e notificações do PWA do garçom

## Estado verificado no código

- A navegação do PWA contém Mesas, Pedidos, Entregas e Cobrança; a página Início foi removida porque duplicava atalhos.
- A instalação usa `beforeinstallprompt` apenas quando o navegador oferece o evento. Sem esse evento, são exibidas instruções manuais para Safari/iOS ou menu do navegador.
- O pedido de permissão ocorre em resposta ao clique explícito em “Permitir notificações”. O primeiro acesso apresenta contexto e não repete a introdução após a escolha.
- Os estados de PWA instalado/não instalado e de permissão concedida/negada/indisponível são comunicados separadamente.
- A permissão concedida não prova push em segundo plano. O código atual consulta pedidos prontos enquanto o aplicativo está ativo e usa notificações locais via Service Worker quando disponível.
- Não foram encontrados integração `web-push`, uso de `PushManager.subscribe()`, endpoint de subscrição ou fluxo servidor de envio push. Portanto, notificações push quando o PWA está fechado **não estão implementadas/verificadas**.
- O aviso de recusa informa que o usuário não receberá notificações enquanto a permissão estiver negada; o painel de configurações permanece disponível para instruções de reativação nas configurações do navegador.

## Testes executados nesta frente

- Verificação sintática de `public/garcom-pwa/app.js`, `public/garcom-pwa/sw.js` e do arquivo de teste com parser JavaScript: OK.
- Verificações estáticas do conteúdo alterado: aba Início removida; botão permanente antigo de instalação removido; modal de consentimento, instruções manuais e aviso explícito sobre ausência de Web Push presentes.
- A suíte Node.js não pôde ser executada neste ambiente: o clone do GitHub falhou por indisponibilidade de resolução de `github.com`. Não considerar os testes da suíte como executados.
- Não houve validação visual com navegador real, nem teste contra servidor/PostgreSQL.

## Checklist obrigatório em dispositivos reais

### Android / Chrome
- [ ] Primeira visita mostra explicação uma única vez; “Agora não” não solicita permissão.
- [ ] O prompt nativo de instalação aparece quando elegível; aceitar instala e esconde o controle contextual.
- [ ] Sem `beforeinstallprompt`, instruções do menu são claras.
- [ ] Permissão concedida, negada e API indisponível são mostradas corretamente.
- [ ] Negar a permissão mostra a confirmação adicional e não repete o aviso nas próximas visitas.
- [ ] Notificação local de pedido pronto enquanto o PWA está aberto e Service Worker ativo.
- [ ] Reabrir configurações do site permite orientar a reativação depois de uma negação.
- [ ] Confirmar comportamento após atualizar o Service Worker e limpar cache.

### iOS / Safari
- [ ] Validar Safari e PWA adicionado à Tela de Início em uma versão suportada do iOS.
- [ ] Confirmar comportamento da permissão apenas após gesto explícito do usuário.
- [ ] Validar instruções de instalação manual e diferenças entre aba Safari e PWA instalado.
- [ ] Testar comportamento com o PWA em primeiro plano, em segundo plano e encerrado.

### Push em segundo plano (bloqueado por dependência)
- [ ] Definir VAPID/public-private keys em configuração segura.
- [ ] Implementar e proteger endpoint de criação/remoção de subscrição Push.
- [ ] Persistir subscrições vinculadas ao garçom/responsável correto, integrando o contrato da Frente 2 sem duplicar regra de atribuição.
- [ ] Implementar envio servidor, tratamento de expiração/HTTP 410 e limpeza de subscrições.
- [ ] Testar entrega real com app encerrado e validar que a transferência de mesa não notifica o garçom anterior.

## Dependências / limites

A entrega de push em segundo plano depende de implementação no backend e configuração de VAPID, além da validação por plataforma. A Frente 3 não implementa uma regra alternativa de atribuição; o consumo continua pelo endpoint atual de pedidos do garçom. A regra de direcionamento da Frente 2 precisa ser integrada/testada por ela antes de validar o destinatário de notificações.


## Auditoria geral do PWA — 2026-10-29

### Achados confirmados no código

- O PWA já estava integrado ao backend, mas a documentação anterior dizia que estava em modo mock. A documentação foi corrigida para refletir o código real.
- O botão “Novo pedido” permitia selecionar mesa sem sessão, mas a sincronização tentava chamar `/assumir`. Essa rota exige uma sessão aberta com pedido de origem cliente/QR; por isso, mesa vazia não podia iniciar atendimento e o pedido não chegava ao POST de criação. Foi adicionada a rota transacional `POST .../mesas/:numero/iniciar`, sem alterar a semântica restrita de `/assumir`.
- A consulta auxiliar de garçons ativos era aguardada antes de renderizar as mesas. Uma falha nessa consulta impedia a tela de exibir mesas mesmo após o endpoint de mesas responder. O carregamento auxiliar agora é tolerante a falhas.
- A interface agora oferece ação explícita para iniciar/assumir mesa sem responsável.
- A sincronização tenta iniciar sessão quando necessário, atualiza a lista de mesas e, diante de corrida 409, reconsulta o estado antes de decidir se pode continuar como garçom colaborador.
- Erros HTTP de pedidos são exibidos junto ao pedido local, em vez de ficarem apenas em estado genérico de conflito.
- Service Worker incrementado para shell v15 para descartar cache anterior às correções.
- Logs Railway analisados: consultas de mesas, cardápio, pedidos e atendimentos responderam 200 em parte da amostra; também houve 401 para alguns links de garçom. Na amostra de 501 requisições HTTP, não foi observado POST para a rota de criação de pedido do garçom. Isso é evidência limitada à janela consultada, não prova de que nenhum pedido tenha sido enviado em outros horários.
- A fila de cozinha/bar usa os itens persistidos por setor e não filtra pela origem do pedido; portanto, pedidos com origem garçom devem entrar nas mesmas filas após persistência correta.

### Limitações e riscos ainda abertos

- Tokens bearer de garçom aparecem nos caminhos das rotas e podem ser registrados pelo proxy HTTP. Não expor valores em relatórios. Planejar migração para credencial de sessão curta e avaliar rotação de links potencialmente expostos.
- Respostas 401 precisam ser resolvidas com link individual válido e ativo; não é seguro tentar contornar a autenticação.
- Web Push com o PWA fechado não está implementado; a experiência atual depende de polling/avisos locais enquanto o PWA está ativo.
- Fila offline depende de IndexedDB disponível e dos dados locais do dispositivo. Limpar dados do site pode apagar rascunhos não sincronizados.
- Ainda é necessária validação E2E em navegador/dispositivo real para comprovar a entrega ponta a ponta na cozinha e no bar.
- A cobrança/PIX continua manual: QR/copia-e-cola não confirma liquidação; a pessoa responsável deve verificar o crédito e confirmar recebimento.

### Critérios de aceite da correção

- [ ] Abrir atendimento em mesa vazia com sessão criada e responsável atribuído.
- [ ] Enviar pedido e confirmar HTTP 201/200 idempotente.
- [ ] Ver o mesmo pedido na fila correta de cozinha/bar.
- [ ] Confirmar que um garçom não consegue tomar sessão de outro.
- [ ] Confirmar que outro garçom ativo pode acrescentar itens sem transferir a responsabilidade.
- [ ] Confirmar que falha de consulta auxiliar não esconde mesas.
- [ ] Recuperar pedido pendente após timeout/reinício sem duplicar.
- [ ] Validar entrega, cobrança parcial, PIX manual, transferência e atualização de status.
- [ ] Testar instalação/cache/offline em Android e iOS.

**Estado:** correções em branch e PR em preparação; não considerar produção validada até CI, deploy SUCCESS e teste operacional real.
