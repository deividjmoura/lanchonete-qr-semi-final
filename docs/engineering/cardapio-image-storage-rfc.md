# RFC: armazenamento de imagens do cardápio sem data-URL no JSON

**Estado:** proposta técnica para decisão; não autoriza migração nem alteração de produção.  
**Issue relacionada:** [#53 — Tirar fotos do cardápio em base64 das respostas JSON](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/53)

## Diagnóstico confirmado na `main`

- `db/foto.js` recebe imagem por data-URL, buffer ou URL HTTP(S), limita a entrada a 6 MiB, redimensiona para no máximo 960 px, converte para WebP e limita o resultado a 320 KiB.
- Depois da otimização, o arquivo é convertido em `data:image/webp;base64,...` e retornado como `fotoUrl`. O comentário do módulo explica que a gravação no Postgres foi escolhida para sobreviver a redeploy e disco efêmero.
- `db/cardapio.js` lê `produtos.foto_url` e publica esse valor no campo `fotoUrl` do cardápio. Assim, a listagem pode transportar o conteúdo binário codificado em Base64 em cada resposta.
- O schema inicial define `produtos.foto_url TEXT`. O campo atualmente mistura pelo menos três formatos compatíveis com o código documentado: data-URL, URL HTTPS externa e caminho antigo `/uploads/...`.
- A estimativa de até cerca de 427 KiB por foto decorre do limite de 320 KiB do WebP mais o overhead de Base64, antes de contar o restante do JSON. Isso é uma estimativa superior por imagem, não uma medição de produção.

## Objetivo

Manter as imagens duráveis e o cardápio compatível, mas fazer com que as respostas JSON transportem URLs/metadados em vez de bytes de imagem codificados. Não mudar a experiência de upload, não quebrar imagens existentes e não pressupor um fornecedor de armazenamento ainda não escolhido.

## Decisão necessária antes da implementação

O repositório não especifica um serviço de armazenamento de objetos autorizado para produção. Escolher a opção antes de escrever código de upload ou migração:

1. **Armazenamento de objetos compatível com S3:** adequado para URLs duráveis e escalabilidade; exige fornecedor, bucket, política de acesso, variáveis secretas e estratégia de URL.
2. **Volume persistente do provedor:** pode ser simples para uma única instância, mas exige confirmar montagem, backup, recuperação, custo e comportamento com múltiplas instâncias.
3. **URLs externas existentes:** podem continuar suportadas para imagens externas, mas não resolvem o armazenamento das imagens enviadas pelo admin e dependem de terceiros.

Não substituir Postgres por disco efêmero nem adicionar dependência de fornecedor sem decisão explícita. Não adicionar secrets nem alterar a configuração do Railway nesta etapa.

## Desenho recomendado após decisão do armazenamento

1. Introduzir uma interface pequena de armazenamento de imagens, separando processamento/validação de imagem do destino persistente.
2. Persistir no banco uma URL/chave e metadados necessários, não uma data-URL completa. Definir se a URL será pública estável ou derivada de uma chave; evitar URLs assinadas de curta duração no cache público do cardápio.
3. Preservar leitura dos formatos antigos durante a transição. Fazer backfill por ferramenta idempotente e reiniciável, com modo dry-run, relatório por produto e sem apagar a fonte original.
4. Alterar o cardápio para retornar URL/metadados. Confirmar que a interface cliente renderiza tanto URLs novas quanto os formatos antigos durante a janela de compatibilidade.
5. Após verificação independente de contagem e checksums, planejar separadamente a remoção dos dados antigos. Não combinar cópia e exclusão na mesma etapa.
6. Definir limites de upload, validação por conteúdo real, dimensões, tamanho, autorização e tratamento de erro. Manter a proteção existente contra SSRF ao buscar URLs remotas; redirecionamentos para hosts não validados não podem ser seguidos.

## Plano de validação

- Fixtures locais sintéticas: data-URL WebP, URL HTTPS, caminho legado, imagem corrompida, payload acima do limite e formato de imagem disfarçado.
- Testar upload, listagem e renderização sem usar dados reais.
- Comparar tamanho do JSON antes/depois com uma fixture de 40 produtos e fotos. Registrar bytes e redução percentual; não apresentar estimativas como medições.
- Verificar imagens antigas, retry/idempotência do backfill, ausência de exclusão prematura e rollback para leitura do formato anterior.
- Executar testes, typecheck e build em CI. Validar backup/restauração do armazenamento escolhido antes de qualquer release.
- Não executar backfill, migração manual, upload de teste ou exclusão em produção como parte desta issue.

## Critérios para liberar implementação

- [ ] Responsável escolhe e autoriza o destino de armazenamento.
- [ ] Contrato de URL/chave e política de acesso documentados.
- [ ] Estratégia de compatibilidade e rollback aprovada.
- [ ] Backfill dry-run informa contagens, bytes e erros sem mutar dados.
- [ ] Testes comprovam upload, listagem, autorização e compatibilidade de formatos.
- [ ] Medição comparativa de payload baseada em fixtures é registrada.
- [ ] Plano de backup/restauração do destino escolhido é validado.

## Limites desta RFC

Este documento não muda a aplicação, o schema, o banco, secrets, o Railway ou os dados. Não afirma que o tamanho real do payload foi medido. O código atual já otimiza as imagens; o problema que resta aqui é a representação/entrega no cardápio e a decisão sobre armazenamento durável fora do JSON.

## Implementação entregue (2026-10-26) — etapa 1 sem novo fornecedor

Antes da escolha de um storage de objetos, a issue #53 foi endereçada sem
adicionar infraestrutura nem mudar o armazenamento durável:

- `db/foto-serve.js` resolve a representação pública: data-URLs em
  `produtos.foto_url` passam a ser expostas apenas como a URL de mesma origem
  `/api/cardapio/fotos/:id`; URLs HTTPS externas e caminhos `/uploads/...`
  legados permanecem inalterados.
- `GET /api/cardapio/fotos/:id` é read-only e público (o cardápio da mesa já
  é público), serve a imagem com `Cache-Control` e `nosniff`, responde 404
  para id inválido/foto ausente e 302 para representações externas. Não
  expõe preço, estoque nem qualquer metadado.
- O cardápio público (`db/cardapio.js`) não transporta mais bytes em Base64.
  O admin (`/api/admin/cardapio`) mantém a data-URL para prévia imediata no
  editor; é uma rota autenticada e de baixo volume.
- Medida com fixture sintética de 40 fotos no tote de 320 KiB
  (`tests/cardapio-foto-url.test.cjs`): o JSON legado supera 12 MB e a nova
  representação fica em poucos KB (redução acima de 99,9%).
- Nenhuma migração de dados foi necessária: a leitura compatível convive com
  os três formatos históricos. O upload continua otimizando para WebP e
  gravando no Postgres, que segue durável contra redeploy de disco efêmero.

### O que permanece como etapa 2 (decisão do responsável)

A migração do binário para armazenamento de objetos/volume persistente
(opções 1–3 acima) continua pendente de decisão de fornecedor e custo. O
desenho atual é compatível com ela: quando houver storage durável, basta o
backfill gravar URLs/ chaves no lugar das data-URLs — o endpoint e o contrato
do cardápio não mudam. Os critérios de backfill, rollback e backup do storage
escolhido seguem aplicáveis.
