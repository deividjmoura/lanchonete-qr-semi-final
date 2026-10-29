# Runbook de Operação e Resposta a Incidentes — QR Admin

> **Objetivo:** orientar diagnóstico seguro e recuperação controlada da instalação em produção.
>
> **Aplicação:** QR Admin / Lanchonete QR, atualmente documentado como instalação single-tenant.
> **URL de produção documentada:** https://qradminn.up.railway.app/
>
> **Limite importante:** este documento não comprova que backups, alertas, rollback automático ou acesso ao PostgreSQL estejam configurados. Confirme essas capacidades no Railway e no provedor do banco antes de depender delas.

## 1. Regras de segurança operacional

1. Priorize preservar pedidos, itens entregues, pagamentos registrados e histórico.
2. Não execute reset, seed, limpeza de histórico, migrações manuais ou SQL destrutivo em produção como tentativa de recuperação.
3. Não rode testes de carga, teste de dia inteiro ou scripts de smoke contra produção sem autorização explícita e plano de impacto. Os scripts podem criar pedidos ou alterar estado.
4. Nunca marque um pedido como pago com base apenas em QR PIX gerado, mensagem do cliente ou captura de tela. A documentação do produto exige conferência do recebimento no aplicativo bancário.
5. Não copie tokens, URLs com credenciais, dados pessoais ou conteúdo sensível de logs para tickets ou mensagens.
6. Antes de reiniciar, redeployar ou alterar variáveis, registre horário, sintomas, último deploy conhecido e impacto observado.
7. Faça uma mudança por vez e valide o resultado antes de prosseguir.
8. Em dúvida sobre integridade dos pedidos ou pagamentos, interrompa ações de escrita e escale para o responsável.

## 2. Triagem inicial

Registre estes dados sem modificar o sistema:

- Horário de início e fuso.
- Sintoma exato e telas afetadas (cliente, cozinha/bar, garçom, caixa ou administração).
- Se o problema afeta todas as mesas ou apenas uma.
- Se pedidos novos estão sendo criados, duplicados, atrasados ou ausentes.
- Último deploy/alteração conhecido e status atual do serviço no Railway.
- Mensagens de erro relevantes, com segredos e dados pessoais removidos.
- Se há pagamentos ou fechamento de comandas envolvidos.

### Checagens iniciais seguras

1. Abra a URL de produção e confirme se a falha é reproduzível.
2. Verifique o estado do serviço e do último deployment no Railway, sem disparar redeploy.
3. Consulte logs de aplicação no intervalo do incidente e procure erros de inicialização, conexão com banco ou exceções repetidas.
4. Verifique se a falha é geral ou restrita a uma tela/mesa.
5. Se houver suspeita de inconsistência de dados, evite repetir a ação do usuário até confirmar se a primeira requisição foi persistida.

Não interprete uma página inicial funcionando como prova de que banco, criação de pedidos, cozinha e caixa estão saudáveis.

## 3. Procedimentos por incidente

### A. Aplicação indisponível ou retornando erro 5xx

1. Confirme a falha em uma segunda tentativa e registre o horário.
2. Verifique no Railway se o serviço está ativo, reiniciando repetidamente ou falhando no health/startup.
3. Inspecione logs recentes para erros de inicialização, variáveis obrigatórias ausentes, falha de conexão ao PostgreSQL ou migração.
4. Compare com o último deployment concluído e suas alterações.
5. Não altere variáveis ou execute migrações no escuro.
6. Se houver um deployment anterior conhecido como saudável, prepare um rollback seguindo o mecanismo documentado pelo Railway e obtenha aprovação do responsável antes de aplicá-lo.
7. Após recuperação, valide o acesso às telas e os fluxos críticos em ambiente seguro antes de declarar resolução.

### B. Cliente não consegue enviar pedido ou há suspeita de pedido duplicado

1. Peça à equipe para não reenviar repetidamente o mesmo pedido.
2. Registre mesa, horário aproximado e mensagem de erro; não registre dados pessoais desnecessários.
3. Confira a comanda e a fila da cozinha/bar antes de tentar novamente.
4. Se houver acesso autorizado a consultas de leitura, confirme se o pedido foi persistido e se existem registros duplicados; não faça UPDATE/DELETE corretivo sem diagnóstico e plano de reversão.
5. Se a persistência não puder ser confirmada, informe à equipe que o estado está incerto e encaminhe para investigação.
6. Depois da correção, valide criação e acompanhamento do pedido com dados de teste em ambiente isolado.

### C. Cozinha/bar não atualiza ou itens ficam presos em um status

1. Verifique se a falha ocorre em uma única tela ou em todas.
2. Atualize a tela apenas depois de registrar o estado visível; evite transições repetidas sem confirmar o estado persistido.
3. Verifique logs e conectividade da aplicação, incluindo erros do canal de atualização em tempo real.
4. Compare o status mostrado com o status persistido, usando apenas acesso de leitura autorizado.
5. Não force status no banco para “destravar” a operação sem compreender as regras de transição e o efeito sobre entrega e caixa.

### D. Garçom/PWA offline ou sincronização pendente

1. Trate a fila local como **pendente**, não como confirmação de persistência no servidor.
2. Não limpe dados do navegador nem desinstale a PWA antes de preservar o estado pendente e registrar o incidente.
3. Ao recuperar a conexão, confira o retorno do servidor e valide preço, disponibilidade e estoque.
4. Verifique se o pedido foi criado antes de tentar reenviá-lo.
5. Conflitos de preço, disponibilidade ou estoque devem ser revisados pela equipe; não presuma que uma operação offline foi confirmada.

### E. Caixa, pagamento ou PIX divergente

1. Suspenda o fechamento da comanda afetada até conferir os registros.
2. Compare itens entregues, pagamentos registrados e total calculado pelo sistema.
3. Para PIX, confirme o crédito diretamente no aplicativo bancário ou canal oficial da instituição financeira.
4. Não conclua que houve pagamento apenas porque o QR foi exibido ou gerado.
5. Não altere lançamentos históricos diretamente no banco. Documente a divergência e siga o procedimento financeiro autorizado do estabelecimento.

### F. Erro no upload de fotos do cardápio

1. Registre o produto/tela afetada e o tipo de arquivo, sem compartilhar arquivos privados publicamente.
2. Verifique logs da aplicação e a resposta do endpoint de upload.
3. Não contorne a validação de URL, tipo, tamanho ou destino de arquivos.
4. Não habilite acesso a hosts internos nem faça upload de URLs desconhecidas como teste.
5. Se necessário, adie a alteração da foto e mantenha o produto operável com a imagem atual.

## 4. Banco de dados e migrações

- Confirme qual banco e ambiente estão conectados antes de executar qualquer comando.
- Não use `npm run db:seed`, `FORCE_SEED=1`, reset ou scripts de limpeza em produção como medida de recuperação.
- Não execute `npm run db:migrate` manualmente sem revisar as migrações pendentes, o comportamento do startup e o plano de rollback.
- Antes de uma mudança de schema, exija backup recuperável confirmado, avaliação de compatibilidade e plano de reversão ou correção forward.
- Prefira consultas de leitura para diagnosticar.
- Se suspeitar de corrupção, perda ou inconsistência financeira, preserve evidências e interrompa alterações manuais até existir um plano aprovado.

**Procedimento de restauração e ferramenta de verificação:** ver [`backup-restore.md`](backup-restore.md) (`scripts/backup-restore-drill.js`).

**Verificação pendente de operação:** documentar o procedimento real de backup, retenção, restauração testada, responsável e tempo esperado de recuperação após confirmação no provedor do banco. Não considerar backup existente ou restaurável sem evidência.

## 5. Deploy e rollback

Antes de qualquer deploy:

- Confirmar PR revisado e CI concluído com sucesso.
- Confirmar a branch e o commit que o Railway realmente utiliza.
- Revisar mudanças em schema, variáveis, dependências, build e arquivos gerados.
- Avaliar se a versão anterior consegue funcionar com o schema após a migração.
- Identificar quem autoriza e quem executa o deploy.

Depois do deploy:

- Verificar estado do deployment e logs de inicialização.
- Conferir carregamento da aplicação e ausência de erros recorrentes.
- Validar fluxos críticos em ambiente de teste isolado. Não executar testes que criem pedidos em produção sem autorização e plano específico.
- Observar erros e relatos da equipe antes de encerrar a janela de mudança.

Rollback de aplicação não reverte necessariamente mudanças de banco. Nunca presumir que voltar ao código anterior torna uma migração reversível.

## 6. Critérios para declarar incidente resolvido

Só encerrar quando:

- A causa provável ou limitação conhecida estiver documentada.
- O serviço estiver estável e os logs não mostrarem a falha repetidamente.
- O fluxo afetado tiver sido validado sem comprometer dados reais.
- Pedidos, entregas, pagamentos e comandas potencialmente afetados tiverem sido conciliados.
- Houver registro da ação tomada, responsável, horário e riscos residuais.
- Uma ação preventiva ou tarefa de acompanhamento tiver sido criada quando necessário.

## 7. Modelo de registro de incidente

Copie e preencha:

```text
ID:
Início/fim (com fuso):
Impacto operacional:
Telas/mesas afetadas:
Sintoma observado:
Último deploy/alteração conhecido:
Evidências (sem segredos/dados pessoais):
Pedidos/pagamentos potencialmente afetados:
Ações de diagnóstico:
Ações de recuperação e aprovador:
Validações após recuperação:
Causa confirmada ou hipótese:
Riscos residuais:
Acompanhamento necessário:
```

## 8. Lacunas operacionais a confirmar

- [ ] Health check e alertas efetivamente configurados no Railway.
- [ ] Backups automáticos do PostgreSQL, retenção e última execução bem-sucedida.
- [ ] Restauração de backup testada em ambiente isolado.
- [ ] Responsáveis e canal de escalonamento definidos.
- [ ] Procedimento e autorização de rollback documentados para aplicação e banco.
- [ ] Ambiente de teste isolado com credenciais e dados não produtivos.
- [ ] Fluxos de ponta a ponta da PWA validados em dispositivo/navegador real.
- [ ] Procedimento de conciliação para pedidos pendentes e pagamentos divergentes.

Este runbook é um ponto de partida conservador. Marque cada item como confirmado somente depois de verificar a configuração real; não transforme lacunas documentais em afirmações sobre a infraestrutura existente.
