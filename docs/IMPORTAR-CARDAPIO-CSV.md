# Importar cardápio completo (CSV)

O QR Admin permite trocar o cardápio inteiro de uma vez enviando uma planilha **CSV UTF-8**.
É o caminho mais rápido para quem já tem o menu em Excel, LibreOffice ou Google Sheets: uma
linha por produto, um arquivo, uma confirmação.

> **Onde fica:** Admin → **Cardápio** → botão **Importar CSV**.
> O mesmo diálogo oferece **Baixar modelo**, que baixa `cardapio_completo.csv` já com o
> cabeçalho certo (servido por `GET /api/admin/cardapio/modelo.csv`).

---

## 1. Formato do arquivo

- **Codificação:** UTF-8 (no Excel: *Salvar como → CSV UTF-8*). Arquivo fora de UTF-8 é
  recusado com mensagem explícita, antes de qualquer alteração.
- **Separador:** `;` (recomendado) ou `,`. Quando o separador é vírgula, descrições com
  vírgula precisam estar entre aspas.
- **Decimais:** vírgula (`25,90`). Ponto também é aceito (`25.90`); `1.234,56` e `1.234`
  são lidos como milhar quando o padrão de 3 dígitos aparece.
- **Tamanho:** até **2 MB** e **2000 produtos** por arquivo.
- **Nome sugerido:** `cardapio_completo.csv`.

### Colunas

| Coluna        | Obrigatória | Descrição                                                        |
| ------------- | ----------- | ---------------------------------------------------------------- |
| `categoria`   | Sim         | Categoria do produto. Categorias novas são criadas na importação. |
| `nome`        | Sim         | Nome do produto (até 120 caracteres).                             |
| `descricao`   | Não         | Ingredientes ou detalhes (até 500 caracteres).                    |
| `preco`       | Sim         | Valor em reais, **sem `R$`** (`25,90`).                           |
| `imagem_url`  | Não         | Link público da imagem (`https://…`). Vazio = sem imagem.         |
| `disponivel`  | Sim         | `sim` ou `nao`.                                                   |
| `ordem`       | Não         | Posição dentro da categoria (`1`, `2`, `3`…). Sem ela, vale a ordem do arquivo. |

O cabeçalho pode vir em qualquer ordem e aceita variações comuns (`Produto`, `Valor`,
`Ativo`, `Foto`, `Detalhes`…). Colunas desconhecidas são ignoradas com aviso.

### Exemplo

```csv
categoria;nome;descricao;preco;imagem_url;disponivel;ordem
Lanches;X-Burger;Pão, hambúrguer artesanal, queijo e molho da casa;25,90;https://exemplo.com/x-burger.jpg;sim;1
Lanches;X-Bacon;Pão, hambúrguer, queijo e bacon;29,90;;sim;2
Bebidas;Refrigerante lata;Lata 350 ml;6,00;;sim;1
Bebidas;Suco natural;Suco de laranja 500 ml;10,00;https://exemplo.com/suco.jpg;sim;2
Sobremesas;Pudim;Pudim de leite condensado;9,00;;nao;1
```

### Imagens

- A imagem é opcional: quando não houver, deixe a coluna vazia.
- Use um link público que permita visualizar ou baixar o arquivo (JPG, PNG ou WebP).
- **Não** use links privados do Google Drive (exigem login) nem `file://`, `data:` ou
  caminhos locais — o servidor recusa e aponta a linha.
- Depois da importação você pode trocar a foto de um item pelo próprio cadastro
  (upload na tela do produto).

### Erros que impedem a importação

Cada problema aparece com **linha e coluna**. Nada é gravado enquanto houver erro:

- `categoria`, `nome` ou `preco` em branco;
- preço que não é número (`abc`, `R$`, negativo);
- `disponivel` diferente de `sim`/`nao`;
- dois produtos com o mesmo nome na mesma categoria;
- link de imagem inválido;
- arquivo fora do padrão UTF-8 ou sem o cabeçalho obrigatório.

---

## 2. Como a importação funciona

São **duas etapas** — o cardápio só muda depois da confirmação:

1. **Prévia** (`POST /api/admin/cardapio/importar/previa`): o servidor lê e valida o arquivo e
   devolve quantos **produtos** e **categorias** foram encontrados, quantos estão disponíveis,
   quantos têm imagem, o resumo por categoria, os **avisos** e a lista de **erros**. Nada é gravado.
2. **Confirmação** (`POST /api/admin/cardapio/importar`, com `confirmar: true`): o mesmo arquivo
   é enviado de novo e aplicado **dentro de uma única transação**.

### Modos

| Modo                             | O que faz                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Substituir cardápio inteiro** (padrão) | O cardápio atual sai de linha e entram apenas os produtos do arquivo. Categorias com o mesmo nome são reaproveitadas; as novas são criadas. |
| **Atualizar produtos existentes** | Atualiza os produtos com a mesma **categoria + nome** e cria os que não existirem. O resto do cardápio continua intacto. |

### O que acontece com o cardápio antigo

Os produtos antigos são **arquivados**, não apagados:

- somem do cardápio do cliente e da lista do admin;
- continuam no banco porque `itens_pedido.produto_id` é `ON DELETE RESTRICT` — o histórico
  de vendas, comprovantes e relatórios dependem deles (migration
  `0033_produtos_arquivados.sql`, coluna `produtos.arquivado`);
- categorias que ficariam só com produtos arquivados deixam de aparecer no admin; categorias
  que ficaram completamente vazias são removidas.

### Segurança

- A prévia **nunca** grava; a importação exige `confirmar: true` no corpo da requisição.
- Tudo roda em **uma transação**: se qualquer linha falhar no meio, o `ROLLBACK` devolve o
  cardápio exatamente como estava. Não existe cardápio pela metade.
- A rota é da área `/api/admin` (sessão de administrador + origem + CSRF) e cada importação
  gera um evento de auditoria `cardapio_importado` com o resumo.
- O cache do cardápio é invalidado e as telas abertas são avisadas na hora.

---

## 3. Cobertura de testes

- `tests/cardapio-import-csv.test.cjs` — leitura (preço em pt-BR, aspas, BOM, separador,
  limites, mensagens de erro), gravação transacional (substituir arquiva, atualizar preserva,
  falha dá ROLLBACK, arquivo inválido não abre transação) e o contrato de rotas/tela/doc.
- `tests/e2e/cardapio-import.e2e.cjs` — fluxo real no Chromium: arquivo → prévia com contagens
  → confirmação → resumo. Também cobre as proteções: `.txt` recusado no cliente, arquivo com
  erros deixa o botão desabilitado, cancelar a confirmação não grava nada, falha do servidor
  mantém a prévia na tela (cardápio intacto) e o modo **Atualizar** não arquiva ninguém.
