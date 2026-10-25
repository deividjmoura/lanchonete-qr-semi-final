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
