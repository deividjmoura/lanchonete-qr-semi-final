# Capturas da apresentação

Imagens reais geradas pelo script `scripts/capturar-apresentacao.mjs`, com API e PostgreSQL locais isolados.

## Nomes esperados (WebP ou AVIF)

| Arquivo | Uso |
|---|---|
| cardapio-cliente.webp | Hero e seção cliente |
| personalizacao-produto.webp | Seção cliente |
| comanda-cliente.webp | Seção cliente |
| dashboard-admin.webp | Administração |
| gestao-cardapio.webp | Administração |
| mapa-mesas.webp | Administração |
| fila-cozinha.webp | Produção |
| fila-bar.webp | Produção |
| entregas-garcom.webp | Garçom |
| fechamento-caixa.webp | Caixa |

Opcional: variantes `-mobile.webp` se houver ganho em srcset.

## Regras

- Capturas de ambiente isolado com dados fictícios
- Sem overlay de dev, sem skeleton, sem tokens na URL
- Moldura de dispositivo fica no CSS das páginas, não na imagem

## Proveniência e atualização

Os scripts e a seleção de telas vieram do PR #282 (commit `aadc1d7`).
As dez capturas foram **regeneradas em 10/11/2026**, depois da troca da
identidade visual (Passe — ver `docs/DESIGN_SYSTEM.md`), com dados fictícios e
sem interceptação da API. Sete delas mostram a identidade nova. As três do
cardápio do cliente (`cardapio-cliente`, `personalizacao-produto`,
`comanda-cliente`) mostram a identidade própria do cardápio, que **não mudou**:
só os dados do seed são outros.

Validação local dessa execução: 34 respostas 2xx na captura da SPA, 16 no PWA
— os mesmos números da captura anterior, feita antes da troca de identidade;
nenhuma chamada à API nas páginas estáticas. Acesso direto e refresh das
páginas e carregamento das imagens (10 na apresentação, 6 no guia) foram
conferidos em Chromium.

Capture sempre sobre um `dist/` de produção (`NODE_ENV=production npm run
build`). Com build de desenvolvimento o React dispara os efeitos em dobro e a
contagem de chamadas à API sobe (57 em vez de 34 na SPA) sem que nada tenha
mudado no produto.

Sempre que a aparência de uma tela capturada mudar, regenere as imagens: a
landing, a apresentação e o guia mostram esses arquivos como "capturas reais",
e uma captura antiga passaria a mostrar um produto que não existe mais.

O seed **apaga os dados operacionais do banco alvo**. Use um banco exclusivo
chamado **`qradmin_apresentacao_test`**, em loopback, nunca `qradmin_test`
compartilhado com outras suítes. A URL não aceita parâmetros de conexão.

1. Crie esse banco em PostgreSQL local e aponte o `.env` para ele.
2. Defina quatro senhas fictícias de pelo menos 12 caracteres no `.env`:
   `DEMO_ADMIN_PASS`, `DEMO_COZINHA_PASS`, `DEMO_BAR_PASS`, `DEMO_CAIXA_PASS`.
3. Execute `npm run db:migrate` somente nesse banco isolado.
4. Confirme a destruição explicitamente:
   `DEMO_RESET_CONFIRM=APAGAR_qradmin_apresentacao_test npm run seed:apresentacao`.
5. Execute o servidor local e então:
   `BASE_URL=http://127.0.0.1:8080 node scripts/capturar-apresentacao.mjs`.

O script de captura usa API real, não intercepta respostas, e remove tokens da
URL antes das imagens. Não publique o `.env` nem credenciais.

Para conferir apenas as páginas estáticas (não precisa de banco nem `.env`):
`BASE_URL=http://127.0.0.1:5173 node scripts/capturar-apresentacao.mjs --audit-only`.
