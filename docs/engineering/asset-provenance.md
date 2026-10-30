# Proveniência de ativos, licença e repositório canônico

**Issue relacionada:** [#45](https://github.com/deividjmoura/lanchonete-qr-semi-final/issues/45).
**Escopo:** inventário e recomendação para decisão do proprietário. Nesta branch,
as páginas operacionais foram normalizadas para QR Admin e os ativos de marca
do cliente anterior foram removidos de `public/` e `dist/`. Nenhuma visibilidade,
histórico ou licença foi alterada sem confirmação de titularidade.

## 1. Repositórios

| Repositório | Visibilidade | Papel observado |
|---|---|---|
| `deividjmoura/lanchonete-qr-semi-final` | Público | Recebeu todo o desenvolvimento recente, CI e deploys; é a fonte do Railway (`main`) |
| `deividjmoura/lanchonete-qr` | Público | Repositório original do cardápio de demonstração (`data/db.json`, `public/assets/demo`) |

Os arquivos de demonstração (sementes e imagens `public/assets/demo/*.webp`)
têm os mesmos blobs do repositório original, conforme auditoria registrada em
o histórico do Git (PR #108).

**Recomendação:** declarar `lanchonete-qr-semi-final` como repositório
canônico e manter o outro como arquivado/depreciado com um README apontando
para o canônico, após decisão do proprietário.

## 2. Inventário de ativos públicos

| Grupo | Caminho | Quantidade | Proveniência conhecida | Situação legal |
|---|---|---|---|---|
| Fotos de demonstração | `public/assets/demo/*.{jpg,webp}` | 70 arquivos (35 temas × 2 formatos) | Herdados de `lanchonete-qr`; origem original não documentada no repositório | **Pendente**: confirmar licença (banco de imagens, autoria própria ou outra) |
| Fundos de tela | `public/assets/bg-*.{jpg,webp}` | 14 | Mesma origem das demos | Pendente |
| Logos QR Admin | `public/logo/*.png` | 6 | Marca provisória do produto; confirmar autoria e direito de uso antes de distribuição comercial | Confirmar autoria/uso interno |
| Ícones/PWA | `public/garcom-pwa/icon*`, manifestos | ~10 | Derivados da marca QR Admin | Confirmar autoria/uso interno |
| Biblioteca QR | `public/garcom-pwa/qrcode-generator.js` | 2 arquivos | Projeto terceiro, MIT (`qrcode-generator.LICENSE` no mesmo diretório) | Coberto por MIT; manter o arquivo de licença |
| Dependências npm | `package.json` | Ver `npm ls` | Registro público, licenças próprias | Sempre verificar `npm audit`/licenças antes de distribuir |

Não há arquivo `LICENSE` na raiz. `package.json` com `"private": true` só
impede publicação no registro npm; não muda a visibilidade pública do GitHub.

## 3. Decisões necessárias do proprietário

1. **Repositório canônico:** confirmar `lanchonete-qr-semi-final` como fonte
   da verdade e como tratar `lanchonete-qr` (arquivar, manter espelho ou
   tornar privado).
2. **Visibilidade:** o projeto deve continuar público? Se houver código ou
   dados sensíveis de negócio, considerar tornar privado antes do go-live.
3. **Licença de código:**
   - se o objetivo for produto proprietário: manter sem licença open-source
     equivale a "todos os direitos reservados"; registrar isso claramente no
     README e adicionar um cabeçalho de propriedade, não uma licença OSS;
   - se for abrir o código: escolher MIT/Apache-2.0 (permissivas) ou GPL
     (copyleft) só após confirmar que todos os contribuidores e ativos
     permitem.
4. **Imagens de demonstração:** localizar a origem de cada lote (compra,
   banco gratuito com atribuição, fotos próprias). Enquanto não houver
   comprovação, não usar essas imagens em material comercial do
   estabelecimento real; substituí-las por fotos autorizadas no cardápio de
   produção é o caminho mais seguro.
5. **Marca do estabelecimento:** os ativos de marca do cliente anterior foram
   removidos das páginas e da distribuição pública nesta branch. Não os
   reintroduzir nem publicar materiais de cliente sem autorização escrita.
6. **Metadados do GitHub:** descrição, topics e badge de versão só devem ser
   alinhados depois das decisões acima.

## 4. Ações técnicas que podem seguir sem decisão legal

- Manter o `qrcode-generator.LICENSE` junto da biblioteca MIT.
- Documentar no README que as imagens de `public/assets/demo` são apenas para
  desenvolvimento/semente e não devem ser usadas na operação sem licença.
- Ao cadastrar produtos reais, usar apenas imagens de autoria própria ou
  licenciadas, e armazená-las pelo fluxo da issue #53.

Nenhuma mudança de visibilidade, renomeação, exclusão de histórico, adição de
licença ou remoção de marca será feita sem a decisão expressa do proprietário.
