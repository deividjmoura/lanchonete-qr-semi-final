# Matriz de Evidências para Liberação — QRAdmin

> **Objetivo:** transformar a decisão de liberar uma versão em verificações observáveis, com evidências reproduzíveis. Esta matriz complementa a auditoria técnica e o runbook; não declara o sistema pronto nem substitui testes.
>
> **Escopo conhecido:** instalação single-tenant QRAdmin. Não usar como prova de isolamento multi-loja. Nenhuma verificação deve ser executada contra o banco operacional se puder criar, alterar ou apagar dados.

## Regras de preenchimento

- Estado inicial de cada item: **PENDENTE**. Não marque como aprovado por inferência, por existir um script ou porque o CI ficou verde.
- Registre commit SHA, ambiente, data/hora, executor, resultado, link/log sanitizado e defeitos encontrados.
- Evidências devem omitir senhas, tokens de mesa/garçom, strings de conexão, dados pessoais e chaves PIX.
- Se um teste precisar de servidor ou PostgreSQL, use ambiente isolado e confirme o `DATABASE_URL` antes de executá-lo.
- Falha, ausência de evidência ou ambiente não identificado significa **NO-GO** para o critério correspondente.
- Não execute `FORCE_SEED=1`, reset, limpeza de histórico ou scripts mutáveis em produção.

## Matriz de liberação

| ID | Verificação | Evidência mínima aceitável | Ambiente / risco | Estado |
|---|---|---|---|---|
| REL-01 | Identidade do artefato | SHA exato do commit revisado e SHA/versão implantada no Railway; confirmar que correspondem | Leitura de metadados; sem alteração | PENDENTE |
| REL-02 | CI do commit | Execução verde do workflow para o SHA candidato, incluindo instalação limpa, typecheck, build, integridade de `dist/`, regressões e sintaxe | CI | PENDENTE |
| REL-03 | Revisão das alterações | PR revisado; migrations, variáveis, arquivos estáticos e scripts de operação inspecionados; nenhum arquivo inesperado | GitHub | PENDENTE |
| REL-04 | Configuração de runtime | Confirmar versão Node, comando de start, health/status do serviço, variáveis obrigatórias presentes e segredos não expostos em logs | Railway; leitura apenas | PENDENTE |
| REL-05 | Banco correto | Identificar ambiente e banco de destino por metadados não sensíveis; confirmar que não é o banco de produção para testes | Leitura controlada | PENDENTE |
| REL-06 | Migrations | Comparar migrations versionadas com as efetivamente aplicadas; confirmar ausência de falhas parciais nos logs de inicialização | PostgreSQL isolado primeiro; produção apenas leitura quando possível | PENDENTE |
| REL-07 | Backup e restauração | Evidência de backup recente e restauração testada em instância isolada; anotar RPO/RTO observados | Pode envolver dados sensíveis; não restaurar sobre produção | PENDENTE |
| REL-08 | Login e autorização | Casos por perfil: sem sessão, sessão válida, sessão expirada/desativada e tentativa de acesso a rota proibida; resultado HTTP/UI registrado | Banco e servidor isolados | PENDENTE |
| REL-09 | Fluxo de pedido | Pedido de teste percorre criação, fila correta de cozinha/bar, preparo, pronto e entrega; confirmar consistência dos itens no banco | Dados sintéticos em ambiente isolado | PENDENTE |
| REL-10 | Idempotência / repetição | Repetir envio, refresh e reconexão em cenário controlado; provar se pedidos duplicados são evitados ou detectados | Ambiente isolado; criar dados | PENDENTE |
| REL-11 | Comanda, pagamento e fechamento | Validar itens entregues, pagamentos parciais, fechamento, descontos/taxa conforme regras; reconciliar total da UI com persistência | Dados sintéticos; não usar PIX real | PENDENTE |
| REL-12 | Concorrência e estoque | Duas ações concorrentes sobre o mesmo recurso não produzem saldo negativo, entrega dupla ou transição impossível; guardar logs/resultados | Testes de carga somente em banco isolado | PENDENTE |
| REL-13 | PWA do garçom | Dispositivo/navegador real: instalação, token válido/inválido, offline, reconexão, conflito, atualização de Service Worker e resultado final persistido | Ambiente isolado; tokens de teste | PENDENTE |
| REL-14 | Recuperação de conectividade | Simular indisponibilidade/reconexão do servidor e banco sem corromper fila local ou duplicar operações; documentar limites conhecidos | Ambiente isolado | PENDENTE |
| REL-15 | Pagamento PIX | Confirmar que a interface não declara liquidação automaticamente; procedimento humano de conferência bancária é conhecido pela equipe | Sem transação financeira real de teste | PENDENTE |
| REL-16 | Observabilidade | Confirmar logs úteis para erro de startup, banco e requisição sem incluir segredos; definir responsável e caminho de consulta | Railway/provedor; leitura | PENDENTE |
| REL-17 | Rollback | Documentar versão anterior, procedimento de rollback do serviço e compatibilidade reversa de migrations; não executar rollback em produção como teste | Staging/ambiente isolado | PENDENTE |
| REL-18 | Validação pós-deploy | Após implantação aprovada, fazer apenas smoke checks não destrutivos e verificar logs/estado do serviço; reconciliar com o SHA implantado | Produção, somente após aprovação explícita | PENDENTE |

## Comandos locais de baixo risco

Estes comandos não apontam por si só para o PostgreSQL operacional, mas devem ser executados a partir de um checkout limpo do commit candidato:

```bash
npm ci
npm run typecheck
npm run build
npm run test:regression
node --check server.js
for f in db/*.js scripts/*.js; do node --check "$f" || exit 1; done
```

O workflow atual de CI também verifica a estrutura de `dist/`. Use o resultado do CI associado ao SHA candidato como evidência, em vez de copiar apenas a saída local.

## Testes que exigem isolamento

Conforme a documentação do projeto, estes comandos podem iniciar servidor, criar pedidos ou alterar dados e **não devem ser apontados para produção**:

- `npm run test:smoke`
- `npm run test:full`
- `npm run test:seguranca`
- `npm run test:carga`
- `npm run test:carga70`
- `npm run test:dia`
- `npm run db:seed`, especialmente com `FORCE_SEED=1`

Antes de executá-los, confirmar por inspeção o destino real do `DATABASE_URL`, credenciais exclusivas de teste e procedimento para descartar os dados sintéticos.

## Decisão final

**GO** somente quando os critérios críticos acordados estiverem aprovados com evidência rastreável, sem defeitos críticos/altos abertos e com rollback/recuperação viáveis.

**NO-GO** se ocorrer qualquer uma destas condições:

- O commit revisado não corresponde ao implantado.
- CI falha ou não há evidência para o SHA candidato.
- Há migration com resultado desconhecido, falha de integridade, perda/duplicação de pedidos ou divergência de pagamentos.
- Não há restauração de backup demonstrada em ambiente isolado.
- A PWA offline/sincronização ou o fluxo de caixa não foi validado para a operação pretendida.
- Um teste foi executado no banco errado ou há dúvida sobre possível alteração de dados reais.

## Registro da execução

Copie e preencha para cada rodada:

```text
Commit candidato:
Ambiente:
Data/hora e fuso:
Executor:
Itens aprovados:
Itens pendentes/reprovados:
Links para CI/logs sanitizados:
Defeitos/risco residual:
Decisão: GO / NO-GO
Responsável que autorizou eventual deploy:
```

A matriz é um registro de evidências, não uma autorização automática para publicar. Deploy, migration de produção, alteração de variáveis e merge final dependem da aprovação explícita do responsável.
