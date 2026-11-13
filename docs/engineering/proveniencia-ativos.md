# Proveniência de ativos e titularidade — issue #45

**Status:** inventário técnico concluído. **As decisões de licença e repositório canônico são suas** — este documento não as toma.
**Data:** 05/11/2026 · verificado contra `main` = `ef1f81f`

> Cumpre o critério 3 de #45 ("registrar proveniência/licença dos assets e autorização de uso da marca"). Os critérios 1, 2 e 4 dependem de decisão do titular.

---

## 1. Correção importante sobre a marca

A issue #45 afirma: *"O repositório contém marca Delicia's e imagens de demonstração; a autorização/licença desses ativos não foi verificada."*

**A marca Delicia's já foi removida do repositório.** Verificação:

```
git show --stat 69d4c24
  fix(branding): use QR Admin identity and remove previous customer assets (#130)
  removidos: dist/assets/logo-cliente.{jpg,png,webp}
             public|dist/branding/delicias/{logo-original,cozinheira,totem}.svg
```

E há um teste de regressão que impede o retorno:

```
tests/branding-neutral.test.cjs
  → 24 arquivos devem conter "QR Admin"
  → devem rejeitar /Major Pub|Delícias de São Miguel|logo-cliente|branding\/delicias/i
```

**Verificação independente:**
```bash
git grep -liP "del[ií]cia" -- .    # → apenas tests/branding-neutral.test.cjs (o próprio guarda)
```

**Conclusão:** a parte de marca da issue #45 está **resolvida e protegida por teste**. O que resta de #45 é licença, repositório canônico e proveniência das imagens de demonstração.

---

## 2. Identidade visual atual

| Ativo | Caminho | Tamanho | Origem |
|---|---|---|---|
| Marca QR Admin (horizontal) | `public/logo/qradmin-horizontal.png` | 230 KB | identidade própria do projeto |
| Marca QR Admin (mark) | `public/logo/qradmin-mark.png` | 272 KB | idem |
| Símbolo reduzido (SVG) | `public/logo/simbolo.svg` | 0,4 KB | idem |
| Ícones do shell | `public/logo/simbolo-96.png`, `simbolo-180.png` | 3 KB | idem |
| Favicon | `public/logo/favicon.png` | 24 KB | idem |
| Favicons diversos | `public/favicons/` | 32 KB | idem |
| Fundos de tela | `public/assets/bg-*.webp` | 0,7 MB | a verificar |

**Total em `public/logo/`:** 0,5 MB · **`public/assets/`:** ~2,8 MB

> **Resolvido em 13/11/2026:** `qradmin-horizontal-dark.png` (1,3 MB), `qradmin.png` (244 KB) e
> `simbolo-traco.svg` não eram referenciados por nenhum HTML, CSS, React ou teste — saíram do
> repositório. Os fundos de tela ficaram só em WebP: os `.jpg` eram fallback que nenhum CSS pedia.

---

## 3. Imagens de demonstração

| Item | Valor |
|---|---|
| Pasta | `public/assets/demo/` |
| Arquivos | **35** (`.webp`; os 35 `.jpg` duplicados saíram em 13/11/2026) |
| Tamanho total | **0,6 MB** |
| Origem no histórico | commit `eb7096b` — *"feat(mesa): prévia UI estilo app — chips, cards, logo cliente e fotos demo"* |
| Autor do commit | Arena Agent, 16/09/2026 |

**O que precisa ser respondido:** estas 35 fotos de comida (burger, dog, churros, beer, caipi…) foram obtidas de banco de imagens com licença, geradas, ou são fotos reais de um estabelecimento?

Se foram geradas ou vieram de banco com licença permissiva, documente a fonte. Se são fotos de um estabelecimento real, **precisam de autorização por escrito** para permanecer no repositório público.

**Inventário para preenchimento:**

| Arquivo base | Fonte (banco/gerada/autorizada) | Licença | Comprovante |
|---|---|---|---|
| `burger` | | | |
| `dog-classic` | | | |
| `chicken` | | | |
| *(demais 32)* | | | |

---

## 4. Dependências de terceiros

| Pacote | Licença | Situação |
|---|---|---|
| `@phosphor-icons/react` | **MIT** | ✅ compatível com qualquer escolha de licença do projeto |
| `sharp` | Apache-2.0 | ✅ requer preservação de aviso |
| `react` / `react-dom` | MIT | ✅ |
| `pg` | MIT | ✅ |
| `framer-motion` | MIT | ✅ |
| `qrcode.react` | MIT | ✅ |
| `zustand` | MIT | ✅ |
| `clsx`, `tailwind-merge`, `dotenv` | MIT | ✅ |

**Nenhuma dependência com licença copyleft forte** (GPL/AGPL) no runtime. Isso significa que **qualquer opção de licença para o seu código é tecnicamente viável** — nenhuma escolha fica contaminada por dependência.

> Rode `npm run audit` ou equivalente antes de publicar a licença escolhida, para confirmar que nenhuma dependência transitiva mudou.

---

## 5. Situação do repositório

| Item | Estado verificado em 05/11/2026 |
|---|---|
| Visibilidade | **Público** (`isPrivate: false`) |
| Arquivo `LICENSE` na raiz | ❌ **ausente** |
| Campo `license` em `package.json` | ❌ **ausente** (`undefined`) |
| Campo `private` em `package.json` | `true` — **não afeta a visibilidade do GitHub** |
| `licenseInfo` na API do GitHub | `null` |
| Descrição do repositório | vazia |
| Repositório duplicado | `deividjmoura/lanchonete-qr` — público, README/versão divergentes |

**Consequência jurídica de não ter licença:** sem `LICENSE`, o padrão legal é *todos os direitos reservados* — ninguém tem permissão de copiar, modificar ou distribuir. Isso é **proibitivo para adoção**. Ou seja: o estado atual não é "neutro", é restritivo, e contradiz o fato de o repositório ser público.

---

## 6. Decisões que dependem de você

| # | Decisão | Opções | Recomendação técnica |
|---|---|---|---|
| 1 | Repositório canônico | `lanchonete-qr-semi-final` / `lanchonete-qr` / manter os dois | `lanchonete-qr-semi-final` — é onde está o CI ativo e o `main` atual |
| 2 | Visibilidade | público / privado | Se for vender licença: privado. Se for adoção: público com licença clara |
| 3 | Licença | proprietária / AGPL-3.0 / MIT / BSL 1.1 | proprietária se o modelo é vender licença (combina com CNAE 6202-3/00); AGPL se o objetivo é adoção sem que concorrente feche o código |
| 4 | Fonte das 35 imagens demo | banco / geradas / autorizadas | obter comprovante escrito antes de manter |
| 5 | `bg-admin.webp` (103 KB) | própria / terceiro | verificar |

---

## 7. O que NÃO fazer (restrições da issue)

- ❌ Mudar a visibilidade do repositório sem decisão explícita
- ❌ Reescrever ou apagar histórico
- ❌ Remover marcas ou imagens sem autorização expressa
- ❌ Adicionar licença presumindo que a titularidade está resolvida

---

## 8. Sequência recomendada

1. Confirmar repositório canônico → alinhar descrição, badge e topics
2. Confirmar titularidade do código (é seu? é de cliente? foi sob encomenda?)
3. Escolher licença → criar `LICENSE` + campo `license` no `package.json`
4. Levantar a fonte das 35 imagens demo e do `bg-admin`
5. Registrar as decisões em `docs/engineering/decisao-licenca-e-titularidade.md`
6. **Só então** emitir a GRU do INPI — o pedido exige declarar autor e titular com veracidade
