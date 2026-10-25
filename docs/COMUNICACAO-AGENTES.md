# Comunicação entre os agentes — QR Admin

## Objetivo e regras de colaboração

Estamos trabalhando em três frentes no repositório `deividjmoura/lanchonete-qr-semi-final`. O agente coordenador trabalha na Frente 1. Dois agentes paralelos trabalham nas Frentes 2 e 3.

### Regras obrigatórias
1. Antes de editar, leia este documento, o README e os arquivos envolvidos. Confirme a branch e a versão atual.
2. Não trabalhe diretamente em `main`. Use uma branch própria por frente e abra PR para revisão.
3. Não sobrescreva mudanças de outro agente. Se houver dependência ou conflito, documente e comunique antes de alterar arquivos compartilhados.
4. Não declare testes executados sem os executar. Não rode testes mutáveis contra produção nem use seed destrutivo.
5. Backend/PostgreSQL é a fonte da verdade. Não resolva inconsistências apenas escondendo elementos no frontend.
6. Preserve autenticação, autorização por papel, CSRF, validações de valores e os testes de regressão existentes.
7. No final, reporte: branch/PR, arquivos alterados, decisões, testes realmente executados, limitações e dependências para outra frente.
8. Não altere deploy, secrets, dados de produção ou configurações externas sem autorização explícita.

## Frente 1 — Caixa, pagamentos, PIX e comprovante (coordenador)
Branch: `work/frente-1-caixa-pagamentos`

Escopo:
- Investigar e corrigir a inconsistência em que pagamento concluído deixa pedidos/sessões em listas incorretas ou mantém mesa vazia aberta.
- Diferenciar claramente pedido pronto, entregue, pagamento parcial/integral e sessão fechada.
- Permitir adicionar novos itens a uma sessão existente sem editar pedido já concluído pela cozinha/bar.
- Permitir ao garçom autorizado registrar/cobrar pagamentos, com as mesmas regras de cálculo e auditoria do caixa. Não confiar em totais enviados pelo cliente.
- PIX: gerar QR dinâmico por valor usando a chave configurada. O proprietário forneceu uma chave PIX que deve ser configurada apenas no ambiente privado do servidor; não copie a chave real para o repositório. Nome do recebedor: `QRADMIN`; cidade: `PENHA SC`. Preferir configuração por variáveis de ambiente (`PIX_CHAVE`, `PIX_NOME`, `PIX_CIDADE`); nunca duplicar a chave em vários componentes. Validar limites/formato exigidos pelo payload BR Code e acrescentar identificador da transação quando suportado.
- Para dinheiro, crédito e débito, registrar a forma selecionada, valor, operador, horário e sessão. Para PIX, registrar também a referência/identificador da cobrança quando disponível. Gerar QR não é confirmação de liquidação; a equipe deve conferir o recebimento.
- Histórico e comprovante de consumo não fiscal devem incluir dados do estabelecimento, mesa/sessão, data/hora, operador, itens e descrições, quantidades, preço unitário, adicionais quando aplicável, subtotais, descontos, taxas, pagamentos por forma, total pago e saldo. Não chamar o documento de nota fiscal nem sugerir validade fiscal.
- Corrigir a página inicial pública para não listar mesas; manter acesso do cliente pelo QR individual.
- Adicionar testes de regressão e atualizar documentação/configuração de ambiente.

Arquivos iniciais para investigar (não presumir que sejam os únicos): `src/store/usePub.ts`, `src/lib/api.ts`, telas de caixa e garçom, `server.js`, `db/`, migrations e `tests/regressions.cjs`.

## Frente 2 — Responsabilidade por mesa e operação do garçom (Agente 2)
Criar uma branch independente a partir da versão atual de `main`, por exemplo `work/frente-2-responsavel-mesa`.

Escopo:
- Inspecionar o fluxo existente de atribuição de mesas, garçom por token, entrega e histórico de transferência antes de propor nova implementação.
- Atribuição persistente no backend: quando um garçom começa a atender uma mesa, ele fica como responsável pela sessão.
- Pedidos prontos da cozinha/bar devem aparecer no PWA apenas para o garçom responsável pela mesa; o dashboard administrativo continua vendo tudo.
- Criar transferência de mesa para outro garçom ativo, atualizar a responsabilidade no servidor e manter histórico de transferência.
- Após transferência, novas tarefas/notificações vão para o novo responsável sem duplicidade ou perda. Definir e documentar como tratar tarefas já prontas no momento da transferência.
- Remover o conceito/botão redundante de “assumir” se o novo fluxo de início de atendimento o substituir, sem quebrar permissões ou histórico.
- Testar dois garçons em sessões/dispositivos diferentes e autorização contra acesso a mesas alheias.
- Não modificar telas de pagamento nem o fluxo de instalação/notificações, exceto se for necessário um contrato de API; coordenar previamente qualquer mudança em arquivos compartilhados.

Entregar PR e reportar o contrato de API/DB alterado. Não presumir que os endpoints de caixa já aceitam garçons; alinhar com Frente 1 se necessário.

## Frente 3 — Navegação PWA e permissões de notificações (Agente 3)
Criar uma branch independente a partir da versão atual de `main`, por exemplo `work/frente-3-pwa-notificacoes`.

Escopo:
- Remover a aba/página “Início” do PWA do garçom se ela apenas duplicar atalhos; preservar as telas operacionais necessárias.
- Rever o prompt de instalação e permissão de notificações no primeiro acesso. Explicar que notificações exigem instalação quando necessária pela plataforma, suporte do navegador/dispositivo, permissão concedida e implementação de push funcional.
- Se o usuário recusar, apresentar uma segunda confirmação clara de que não receberá notificações; permitir configurar depois sem insistir a cada abertura.
- Não chamar `Notification.requestPermission()` automaticamente sem uma ação do usuário quando o navegador exige gesto explícito.
- Diferenciar instalado/não instalado, permitido/negado/indisponível. Não afirmar que push funciona sem verificar service worker, subscrição e envio no servidor.
- Remover o botão permanente “Instalar” apenas quando o fluxo contextual cobrir os casos suportados; manter instruções de instalação manual quando o navegador não expõe o prompt.
- Não alterar atribuição de mesas nem endpoints financeiros. Coordenar se precisar compartilhar arquivos com Frente 2.
- Testar regressões estáticas e, quando disponível, Android/Chrome e iOS/Safari; registrar limitações de plataforma.

## Integração entre as frentes
- Frente 1 define os contratos de pagamento, sessão e comprovante.
- Frente 2 define o responsável da mesa e o direcionamento de tarefas.
- Frente 3 consome o fluxo de tarefas do garçom, sem criar outra regra de atribuição.
- Qualquer alteração em `server.js`, `src/lib/api.ts`, migrations, tipos compartilhados ou arquivos da PWA deve ser comunicada no PR antes de conflito.
- Não mesclar branches automaticamente nem rebasear à força. Revisar PRs e executar a suíte de regressão integrada antes de integrar.
- Prioridade de integração: Frente 1, depois Frente 2, depois Frente 3.

## Configuração PIX e segurança
Configure a chave PIX no ambiente do servidor, não no código cliente nem em commits. Valores iniciais informados pelo proprietário:
- `PIX_CHAVE` = valor fornecido pelo proprietário (configurar privadamente no Railway)
- `PIX_NOME=QRADMIN`
- `PIX_CIDADE=PENHA SC`

Verifique no código como as variáveis são lidas e validadas. Nunca registre secrets ou credenciais em logs. A chave PIX é dado de recebimento, mas deve ser configurada em ambiente controlado e confirmada pelo proprietário antes do deploy. Não altere variáveis no Railway sem autorização e sem confirmar o ambiente alvo.

## Modelo de relatório final de cada agente
- Branch e link do PR:
- Resumo das mudanças:
- Arquivos/contratos alterados:
- Testes executados e resultados:
- Testes não executados e motivo:
- Riscos ou limitações:
- Dependências ou decisões que o coordenador precisa aprovar:
