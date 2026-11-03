# Ciclo de vida dos tokens de mesa e garçom

**Data da inspeção:** 2026-11-03  
**Base:** `main` no SHA `6e78570282b1b43a2b8654f6c09d5dcaeb975083`  
**Tipo de evidência:** leitura do runtime, migrations e testes PostgreSQL existentes. Não é teste físico nem alteração de produção.

## 1. Tokens de mesa / QR fixo

### Comportamento atual

- O token da mesa é um UUID persistido em `mesas.token`.
- `db/queries.js:getMesaPorToken()` resolve o token para a mesa; o QR fixo continua sendo a identidade pública da mesa.
- `getOuAbrirSessao()` reutiliza a sessão aberta e, após o fechamento, um pedido futuro com o mesmo QR cria outra sessão.
- O fechamento de conta não rotaciona o token da mesa.
- O token permanece válido até ser alterado diretamente no banco; não há ação administrativa de rotação identificada no runtime.
- A política adotada para o lançamento é QR fixo sempre ativo, conforme `docs/engineering/qr-session-policy.md`.

### Riscos e impacto de rotação

O QR é um bearer de longa duração: quem obtém uma cópia pode tentar abrir pedidos remotamente. O UUID reduz adivinhação, mas não prova presença física.

Rotacionar `mesas.token` invalida imediatamente o QR impresso anterior para novas requisições. A sessão de mesa já aberta é vinculada ao `mesa_id`, não ao token; portanto a rotação, por si só, não fecha a conta nem apaga pedidos existentes. Porém:
- clientes com o QR antigo deixam de conseguir enviar novas operações;
- a operação precisa imprimir/substituir o QR físico e confirmar que o novo QR foi colocado na mesa;
- clientes com carrinho ou pedido pendente devem receber uma resposta clara e não podem perder a confirmação do pedido anterior;
- rotação em lote pode interromper todo o salão se os QRs físicos não forem substituídos coordenadamente.

### Recomendação

Manter o QR fixo atual como padrão operacional. Não rotacionar automaticamente a cada fechamento: isso quebraria os QRs físicos distribuídos.

Adicionar, em mudança separada, uma ação administrativa explícita de rotação individual, com:
1. confirmação forte e aviso de que o QR anterior será invalidado;
2. transação que troca o UUID e registra auditoria sem gravar o segredo antigo;
3. exibição/geração imediata do novo QR para impressão;
4. orientação para substituir fisicamente o QR antes de considerar a operação concluída;
5. teste de que token antigo falha, token novo funciona e a sessão/pedidos já existentes permanecem intactos.

A rotação não deve ser implementada como alteração silenciosa nem em lote sem plano operacional.

## 2. Tokens de garçons

### Comportamento atual

- `db/garcons.js:criarGarcom()` cria o garçom e recebe o UUID gerado pelo banco.
- `getGarcomPorToken()` localiza o garçom pelo token e retorna também `ativo`.
- Desativar o garçom altera somente `ativo=false`; o token permanece igual.
- Reativar altera somente `ativo=true`; o mesmo token volta a autenticar.
- Remover é diferente de desativar: marca `removido_em`, define `ativo=false` e troca o token por um UUID novo. O link anterior deixa de funcionar.
- Antes de desativar/remover, `verificarResponsabilidades()` bloqueia a operação se houver mesa aberta atribuída ao garçom ou itens aceitos/retirados ainda pendentes. A mensagem orienta transferir/encerrar o atendimento ou reativar para concluir entregas.
- `tests/postgres-remocao-garcom.test.cjs` comprova que desativar preserva o token e permite reativar; remover invalida o token antigo e preserva histórico e métricas.

### Impacto operacional de rotacionar na reativação

A reativação atual é reversível e preserva o link individual já distribuído. Isso facilita afastamentos temporários e evita exigir novo QR/link para cada retorno.

Por outro lado, se a desativação ocorreu por suspeita de vazamento/comprometimento, reativar o mesmo token ressuscita a credencial antiga.

O PWA usa o token do garçom em `localStorage['waiter-token']` e associa dados offline/estado local ao token. Rotacionar automaticamente sem sincronizar o dispositivo pode deixar o PWA instalado com credencial antiga e rascunhos/fila offline associados à identidade anterior. A fila offline precisa ser resolvida ou migrada antes da troca.

### Recomendação

- **Não rotacionar automaticamente em toda reativação** enquanto a operação trata desativação como pausa temporária.
- Tornar explícita a diferença entre “desativar temporariamente” e “revogar por suspeita de comprometimento”.
- Criar ação separada “reativar e gerar novo link”/“rotacionar credencial”, com aviso de que o link antigo e instalações PWA que ainda o usam precisarão ser vinculados novamente.
- Antes de permitir rotação, exigir dispositivo online e verificar se não há pedidos offline pendentes; não descartar nem reassociar silenciosamente dados locais.
- A ação de remoção atual já revoga o link de forma permanente e deve continuar distinta da desativação temporária.
- Testar token antigo recusado, token novo aceito, garçom reativado, transferência/responsabilidade preservada e fila offline sem perda.

## 3. Sessões em andamento e QR distribuídos

| Ação | Credencial antiga | Sessão/pedidos existentes | Operação necessária |
|---|---|---|---|
| Fechar conta da mesa | QR continua válido | Conta fecha normalmente | Nenhuma troca de QR |
| Rotacionar token da mesa | QR antigo deixa de funcionar | Sessão por `mesa_id` permanece; pedidos não são apagados | Imprimir e substituir QR físico |
| Desativar garçom | Token é recusado enquanto inativo | Desativação é bloqueada se houver responsabilidades abertas/entregas pendentes | Transferir/encerrar antes |
| Reativar garçom | Mesmo token volta a funcionar | Histórico permanece; sem nova sessão de mesa criada | Link antigo volta a autenticar |
| Remover garçom | Token antigo é trocado e removido | Histórico, autoria e métricas permanecem | Não é reativável pelo fluxo normal |

## 4. Decisões que ainda exigem produto/operação

1. Manter o QR fixo como padrão foi uma decisão anterior e deve continuar até haver processo de impressão/substituição confiável.
2. A reativação rotineira deve continuar preservando o token; para incidentes de comprometimento, falta uma ação explícita de rotação.
3. A rotação do token de mesa e do garçom deve ser individual, auditada e acompanhada de UX para substituir QRs/links.
4. Nenhuma rotação foi executada nesta auditoria. Nenhum token, QR físico, sessão, pedido ou dado foi alterado.
