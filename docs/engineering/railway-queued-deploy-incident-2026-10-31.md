# Incidente de deploy Railway — 2026-10-31

## Contexto observado

- Projeto Railway: `exquisite-nurturing`
- Ambiente: `production`
- Serviço: `lanchonete-qr-semi-final`
- Deploy pendente: `15539b40-c5c8-424e-8ef1-90772a611a65`
- Commit de origem: `4189ac925240bf6a0282aef9800b356034be7588`
- Branch: `main`
- Estado observado: `QUEUED`
- Criado em: `2026-10-31T13:01:19Z`
- Última atualização registrada na consulta: `2026-10-31T13:01:20Z`

## Diagnóstico inicial

A operação permanece em `applying`, com o deploy em `QUEUED`. As consultas de logs de build e de execução retornaram listas vazias; nenhum snapshot de build foi criado e não há URL ou região atribuída ao deploy pendente. Isso indica que a compilação ainda não começou. Não há evidência, até aqui, de falha no código ou na etapa de build.

O último deploy concluído com sucesso antes deste incidente foi o deploy `631c5dbf-2176-443f-bfae-508e1ce72492`, commit `9f589321ab48abdbf74054177f6996ad0dd9e2d5`.

## Ação operacional

Foi registrada esta ocorrência em um commit documental na branch `main` para provocar uma nova detecção de alteração pelo Railway e verificar se um novo ciclo de deploy consegue sair da fila. A alteração não modifica código de aplicação, banco de dados, variáveis ou configurações do serviço.

## Acompanhamento obrigatório

1. Verificar se o novo commit gera outro deploy e se ele avança para `BUILDING`.
2. Acompanhar separadamente o deploy original `15539b40-c5c8-424e-8ef1-90772a611a65`; não presumir que foi cancelado.
3. Se o novo deploy também ficar em `QUEUED`, interromper novas tentativas por commits e abrir chamado no suporte Railway, anexando os dois IDs de deploy.
4. Preservar o último deploy `SUCCESS`; não remover nem alterar o serviço Postgres.
5. Após eventual sucesso, validar healthcheck, URL pública e fluxos críticos do QR Admin antes de considerar a produção recuperada.

## Situação

- [x] Incidente registrado
- [ ] Novo deploy detectado pelo Railway
- [ ] Build iniciado
- [ ] Deploy concluído
- [ ] Aplicação validada em produção
