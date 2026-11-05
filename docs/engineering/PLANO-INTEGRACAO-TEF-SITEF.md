# Plano de integração TEF — SiTef primeiro

> **Status:** proposta técnica / descoberta. Não é integração implementada nem autorização para transacionar em produção.  
> **Data da pesquisa:** 05/11/2026  
> **Issue de acompanhamento:** [#290](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/290)

## 1. Resumo executivo

O QR Admin já tem um fluxo de caixa capaz de registrar pagamentos parciais, separar formas de pagamento, controlar saldo restante, identificar o operador e fechar a comanda. Isso é uma boa base de negócio, mas **não equivale a TEF**.

A revisão do código e da documentação em `main` não encontrou integração SiTef/TEF: não há adaptador, SDK, cliente local, protocolo de comunicação, tratamento de retorno do terminal ou fluxo de homologação. O PIX atual é estático e confirmado manualmente. O QR Admin não é gateway bancário.

**Recomendação inicial:** adotar SiTef (Software Express/Fiserv) como primeiro TEF presencial, mantendo a integração atrás de uma abstração de provedores para que, no futuro, um gateway online seja outro adaptador — sem reescrever o caixa.

A modalidade técnica ainda depende do equipamento:
- **Tablet/SmartPOS Android:** avaliar primeiro o **m-SiTef**, aplicativo Android oficial que disponibiliza funções TEF e integração app-to-app.
- **PC Windows/Linux com PINPad:** avaliar **CliSiTef** ou **Client Modular**, com um componente local na estação de caixa. O navegador e a aplicação hospedada na Railway não carregam DLL/SO local nem acessam diretamente USB/PINPad.

Não escolher hardware nem assinar contrato antes de confirmar compatibilidade, adquirente, modelo do terminal, condições comerciais, documentação e homologação com Software Express/Fiserv.

## 2. Estado atual do QR Admin

### O que existe
- Registro de pagamentos parciais em dinheiro, PIX, débito e crédito.
- Divisão de conta e acompanhamento do valor pago/saldo.
- Endpoint de registro de pagamento com chave de idempotência.
- Registro de operador/autoria financeira e fechamento de comanda.
- Comprovante de consumo.

Referências no código:
- `src/screens/Caixa.tsx` — interface do caixa.
- `src/lib/api.ts` — cliente da API, incluindo `registrarPagamento`.
- `db/caixa.js` — regras transacionais de pagamentos/fechamento.
- `public/caixa.html` e `public/js/caixa-divisao.js` — interface/fluxo legado de caixa e divisão.
- `README.md` — descreve pagamentos manuais e PIX estático.

### O que não existe (não presumir pronto)
- Inicialização de transação TEF no terminal.
- Comunicação com CliSiTef, m-SiTef ou Client Modular.
- Pareamento de caixa/terminal e gestão de identificadores SiTef.
- Recebimento e validação de autorização, NSU/CV, bandeira ou comprovante TEF.
- Confirmação, desfazimento, cancelamento e estorno no provedor.
- Consulta de transação após timeout e reconciliação de pendências.
- Homologação com Software Express/Fiserv/adquirente.

## 3. Pesquisa de opções e recomendação

### 3.1 SiTef / Software Express (Fiserv) — recomendado como primeira avaliação

A documentação oficial descreve as bibliotecas CliSiTefI/CliSiTef como interface entre a automação comercial e o servidor SiTef. O ponto de entrada indicado é a CliSiTefI; a biblioteca CliSiTef é de uso interno da CliSiTefI e não deve ser carregada diretamente pela aplicação integradora.

A documentação oficial também oferece o m-SiTef para Android, que executa transações por meio do servidor SiTef e permite integração com outro app. Isso pode se adequar melhor caso o caixa seja um tablet Android/SmartPOS, mas exige validar o modelo e o modo de integração permitido pelo fornecedor.

**Por que é a escolha inicial:** é o fornecedor explicitamente desejado para a etapa presencial, possui documentação oficial para integração Windows/Linux e Android, e oferece caminhos diferentes conforme o hardware. A recomendação é técnica e preliminar; não é comparação de preço, SLA ou aprovação comercial.

Documentação:
- [CliSiTef — introdução e interface simplificada](https://dev.softwareexpress.com.br/docs/sitef-interface-simplificada/introducao/)
- [m-SiTef — guia oficial de integração](https://dev.softwareexpress.com.br/docs/m-sitef/)
- [m-SiTef — parâmetros de entrada](https://dev.softwareexpress.com.br/docs/m-sitef/parametros_entrada/)

### 3.2 Alternativas a cotar, sem substituir a decisão SiTef

| Opção | Quando vale comparar | Observação |
|---|---|---|
| PayGo | Se o adquirente, custo ou suporte local favorecer | Exige SDK/contrato/homologação próprios; não é plug-and-play no QR Admin. |
| Cappta | Se houver proposta comercial ou hardware compatível vantajoso | Também exige integração específica e homologação. |
| POS independente | Contingência temporária enquanto TEF não estiver homologado | Operador digita o valor no POS e registra o resultado manualmente; não é TEF integrado e tem risco operacional de divergência. |

O PagBank documenta software houses homologadas para sua solução TEF, incluindo Software Express e PayGo, e lista funcionalidades como crédito, débito, QR Code, estorno/cancelamento e reimpressão conforme disponibilidade do arranjo. Isso demonstra que homologação/adquirente faz parte da escolha, não apenas a biblioteca.

Referência: [PagBank — TEF](https://developer.pagbank.com.br/docs/tef).

## 4. Arquitetura proposta para o QR Admin

### 4.1 Separação de responsabilidades

```text
Tela Caixa (React / navegador)
        |
        | API autenticada: criar tentativa / consultar estado
        v
Backend QR Admin (Node.js)
        |
        | contrato interno de pagamentos presenciais
        v
Payment Orchestrator
        |
        +---- Adapter SiTef
        |        |
        |        +-- m-SiTef app-to-app (Android)
        |        |       ou
        |        +-- agente local CliSiTef/Client Modular
        |
        +---- Adapter Gateway Online (futuro, separado)
        |
        v
PostgreSQL: tentativa, estado, auditoria e vínculo ao pagamento
```

**Ponto de atenção de topologia:** a Railway não está na mesma máquina/rede local do PINPad. Um backend cloud não deve tentar carregar DLL/SO do caixa, abrir porta USB ou depender de endereço privado do terminal. Se a modalidade for CliSiTef/Client Modular, será necessário um agente local instalado na estação, com canal de comunicação seguro e protocolo versionado. Se for m-SiTef Android, o fluxo app-to-app deve ser iniciado no dispositivo Android que executa o caixa; a API remota coordena e recebe o resultado validado.

### 4.2 Contrato interno neutro de provedor

Proposta conceitual (não implementar sem fechar o contrato oficial):
- `createAttempt(order/session, amount, method, operator, terminal)`
- `start(attemptId)`
- `continue(attemptId, input)` quando o protocolo exigir interação
- `getStatus(attemptId)`
- `confirm(attemptId)` / `abort(attemptId)` conforme o ciclo exigido pelo provedor
- `cancel(attemptId, reason)` e `reverse(attemptId)` quando suportados
- `reconcile(terminal/date/reference)`

Não expor os detalhes específicos do SiTef para a tela do caixa. A tela trabalha com um contrato interno estável e recebe mensagens seguras para orientar o operador.

### 4.3 Estados de tentativa

Estados internos propostos:
- `created`: tentativa persistida, ainda não enviada.
- `pending`: terminal/provedor está processando ou aguardando interação.
- `approved`: autorização confirmada e evidência persistida.
- `declined`: recusa confirmada.
- `cancelled`: cancelamento confirmado.
- `reversal_pending`: desfazimento/estorno solicitado, ainda sem confirmação.
- `reversed`: reversão confirmada.
- `unknown`: resultado inconclusivo; exige consulta/reconciliação, não permite nova cobrança automática.

O pagamento da comanda só deve ser registrado como liquidado após a confirmação final prevista pelo contrato do SiTef. Um HTTP 200 de início, abertura do app, retorno intermediário ou timeout não é aprovação.

### 4.4 Persistência e idempotência

Manter entidades distintas:
1. **Tentativa TEF:** uma tentativa por intenção de cobrança, com identificador interno UUID, sessão/comanda, valor em centavos, operador, terminal, provedor, estado e timestamps.
2. **Pagamento QR Admin:** lançamento financeiro efetivo, criado apenas após aprovação confirmada, com vínculo único à tentativa.
3. **Eventos/auditoria:** transições de estado, ator, correlação e retorno técnico sanitizado.

Regras:
- Idempotency key única por tentativa; retry da mesma requisição retorna a mesma tentativa.
- Restrição no banco impede dois pagamentos efetivos associados à mesma tentativa.
- Retry não pode iniciar nova venda enquanto a anterior estiver `pending` ou `unknown`.
- Em timeout, consultar estado no terminal/provedor e reconciliar; nunca assumir recusa nem aprovação.
- Valores em centavos inteiros no contrato interno; converter apenas na borda do SDK.
- Usar transação PostgreSQL para vincular tentativa aprovada e pagamento QR Admin, preservando invariantes atuais de saldo/fechamento.

### 4.5 Segurança e dados de cartão

- Não armazenar PAN completo, CVV, PIN, trilha magnética, dados de autenticação sensíveis ou payload bruto que os contenha.
- Persistir apenas referências e metadados estritamente necessários (NSU, código de autorização, identificador da transação, adquirente/bandeira, modalidade, parcelas, terminal, valor e horários), após validar o contrato e a política de retenção.
- Segredos e credenciais TEF fora do frontend, do repositório e dos logs.
- Agente local autenticado, com allowlist de origem/serviço, segredo rotacionável, TLS quando aplicável, proteção contra replay e sem endpoint aberto à LAN inteira.
- Autorizar por sessão/perfil no backend; registrar operador real.
- Logs com correlation ID e redaction; não registrar PAN, PIN, token, senha, chave ou dados pessoais desnecessários.
- Revisar obrigações PCI DSS/contratuais com adquirente e fornecedor; não declarar conformidade sem avaliação formal.

## 5. Fluxo operacional pretendido

1. Caixa seleciona a comanda e o valor a cobrar.
2. QR Admin calcula saldo e cria uma tentativa TEF persistida.
3. Sistema direciona a tentativa ao terminal vinculado àquele caixa.
4. Terminal/SiTef conduz leitura, senha e demais interações em ambiente próprio e homologado.
5. QR Admin recebe resultado e valida identificador, valor, terminal e estado.
6. Em aprovação final, grava pagamento e auditoria em transação; atualiza saldo e comprovante.
7. Em recusa, não grava pagamento; permite nova tentativa explícita.
8. Em cancelamento/timeout, consulta/reconcilia antes de liberar nova tentativa.
9. Em estorno, registra operação separada e atualiza o financeiro com trilha auditável.

## 6. Contingência antes e durante a implantação

Até o TEF estar contratado, integrado e homologado:
- Manter POS independente como contingência, se necessário, com valor digitado na maquininha e confirmação do comprovante pelo operador.
- Identificar no caixa que o lançamento foi manual/externo; nunca exibir como TEF aprovado.
- Exigir conferência do valor e comprovante antes do lançamento.
- Em caso de resultado incerto, interromper nova cobrança e conferir terminal/extrato/relatório do adquirente.
- Não automatizar fallback para POS após timeout de TEF: isso pode cobrar duas vezes.
- O PIX continua sendo o fluxo atual estático/manual até existir integração própria de gateway/PSP.

## 7. Plano de trabalho em fases

### Fase 0 — Descoberta e decisão (próxima sessão)
- [ ] Confirmar Android, SmartPOS ou PC Windows/Linux.
- [ ] Anotar marca/modelo e versão do sistema operacional do terminal.
- [ ] Confirmar se existe PINPad separado e modelo.
- [ ] Identificar adquirente/credenciadora e bandeiras/modalidades necessárias.
- [ ] Verificar contrato SiTef existente, custo, suporte, ambiente de homologação e requisitos para software house.
- [ ] Solicitar à Software Express/Fiserv a documentação completa e pacote de desenvolvimento/homologação apropriado à plataforma escolhida.
- [ ] Escolher m-SiTef ou CliSiTef/Client Modular com confirmação escrita do fornecedor.

### Fase 1 — Especificação
- [ ] ADR de topologia e trust boundaries.
- [ ] Contrato interno e máquina de estados.
- [ ] Modelo de dados e invariantes financeiras.
- [ ] Plano de recuperação, conciliação, cancelamento e estorno.
- [ ] Plano de segurança, retenção e observabilidade.

### Fase 2 — Adaptador e ambiente de homologação
- [ ] Criar interface provider-neutral e adapter SiTef isolado.
- [ ] Implementar bridge local apenas se exigido pela rota escolhida.
- [ ] Configuração por terminal sem segredos versionados.
- [ ] Feature flag desligada por padrão.
- [ ] Testes com simulador/ambiente homologação e PostgreSQL descartável.

### Fase 3 — Integração com caixa
- [ ] UI de iniciar/acompanhar TEF.
- [ ] Feedback de inserção/aproximação/senha/retirada sem capturar dados sensíveis.
- [ ] Pagamento criado apenas em aprovação final.
- [ ] Comprovante TEF e vínculo com comprovante de consumo.
- [ ] Fluxos de falha, timeout, retry e recuperação.

### Fase 4 — Homologação e piloto
- [ ] Homologação com Software Express/Fiserv e adquirente.
- [ ] Teste com terminal real e cartões de teste autorizados.
- [ ] Piloto controlado em um caixa, com operador treinado.
- [ ] Conciliação diária e critérios para rollback.
- [ ] Ativação gradual somente após aceite formal.

### Fase 5 — Gateway online futuro
- [ ] Criar adapter separado para PSP/gateway.
- [ ] Tratar webhooks, assinatura, idempotência e conciliação próprias do PSP.
- [ ] Não reutilizar estados de TEF como se fossem estados de gateway sem mapear semântica.
- [ ] Manter o caixa e o domínio financeiro independentes do fornecedor.

## 8. Matriz mínima de testes

| Cenário | Resultado esperado |
|---|---|
| Aprovada | Um pagamento, uma tentativa aprovada, comprovante e saldo atualizado |
| Recusada | Nenhum pagamento; motivo seguro exibido |
| Operador cancela antes de autorização | Tentativa cancelada, sem lançamento |
| Timeout antes de enviar | Recuperação segura sem duplicidade |
| Timeout após autorização | Estado `unknown`; consulta/reconciliação antes de nova cobrança |
| Duplo clique / retry | Mesma tentativa; no máximo um lançamento |
| Queda de rede durante interação | Estado pendente/desconhecido; não fechar comanda |
| Cancelamento/estorno | Operação vinculada e auditável; saldo corrigido conforme regra |
| Reimpressão | Recuperar comprovante sem executar nova venda |
| Duas caixas/terminais | Isolamento de terminal e autoria |
| Valor divergente | Rejeitar retorno que não corresponda à tentativa |
| Retorno duplicado/fora de ordem | Transição idempotente; não duplicar pagamento |

## 9. Critérios para liberar produção

- Contrato e equipamento confirmados.
- Integração validada em homologação e formalmente liberada pelo fornecedor/adquirente.
- Testes automatizados e testes reais de terminal aprovados.
- Runbook de instalação/atualização/rollback e suporte.
- Logs e métricas sem dados sensíveis.
- Plano de contingência testado.
- Feature flag por terminal e ativação gradual.
- Responsável do estabelecimento aprova o piloto.

## 10. Perguntas para fechar amanhã

1. O caixa será **tablet Android**, **SmartPOS Android** ou **computador Windows/Linux**?
2. Qual é a marca e o modelo da maquininha/PINPad?
3. Qual adquirente você pretende usar (Stone, Rede, Cielo, Getnet, PagBank ou outra)?
4. Você já tem contrato SiTef ou ainda precisa contratar?
5. Quantos caixas/terminais serão usados simultaneamente?

## 11. Fontes consultadas

1. **Software Express — CliSiTef / Interface Simplificada:** explica a interface entre automação e servidor SiTef e o papel das bibliotecas.  
   https://dev.softwareexpress.com.br/docs/sitef-interface-simplificada/introducao/
2. **Software Express — m-SiTef:** aplicativo Android para transações TEF e integração com outro app.  
   https://dev.softwareexpress.com.br/docs/m-sitef/
3. **Software Express — parâmetros m-SiTef:** parâmetros obrigatórios e exemplos de modalidade/terminal.  
   https://dev.softwareexpress.com.br/docs/m-sitef/parametros_entrada/
4. **TOTVS — pré-requisitos TOTVS TEF/SiTef (25/09/2026):** descreve interfaces CliSiTef Windows/Linux, Client Modular Windows, homologação do PDV e requisitos de PINPad. É material de implantação de uma solução TOTVS; usar como referência técnica, não como contrato do QR Admin.  
   https://centraldeatendimento.totvs.com/hc/pt-br/articles/15088144574359-TT-IMPLANTA%C3%87%C3%83O-Pr%C3%A9-requisito-TOTVS-TEF
5. **PagBank — TEF:** lista software houses homologadas e modalidades/funções disponíveis na solução PagBank.  
   https://developer.pagbank.com.br/docs/tef

---

**Conclusão:** SiTef é a primeira opção a validar, mas a rota correta depende do dispositivo do caixa. O próximo passo concreto não é codificar contra uma DLL presumida: é identificar o hardware e o contrato, obter o kit oficial correto e então implementar o adaptador com estado transacional, idempotência, reconciliação e homologação.
