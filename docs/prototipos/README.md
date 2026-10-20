# Protótipo visual do garçom — QRAdmin

Esta pasta preserva o trabalho de **prévia visual de 20/10/2026** em uma branch/PR separada, para análise antes de qualquer decisão de incorporar mudanças.

## Como revisar

Abra \`garcom-layout.html\` em um navegador (arquivo local). Funciona sem servidor, banco de dados, token, instalação de dependências ou acesso ao ambiente de produção. No celular, utilize a navegação inferior e os botões de "Novo pedido"/"Ver pedidos".

A demonstração cobre:

- início e atalhos do garçom;
- gerenciamento ilustrativo das mesas 04 e 07;
- modal **centralizado** para montar pedidos (não é gaveta lateral);
- inclusão/remoção de Heineken (Bar) e batata frita (Cozinha), além de outros produtos fictícios;
- revisão de pedido, com total calculado somente no navegador;
- acompanhamento de status por item;
- entregas e o estado atual de "Cobrança em preparação".

## Escopo e limites

- **Não modifica arquivos da aplicação operacional.** O protótipo é um artefato de revisão de UX/UI, não uma alteração do fluxo real.
- Os dados (mesas, pessoas, preços, setores, pedidos e status) são inteiramente **simulados**.
- O protótipo não envia pedidos, não escreve no banco, não altera mesa, não instala PWA e não sincroniza.
- "Bar" e "Cozinha" no protótipo são rótulos demonstrativos, **não** um teste do encaminhamento no backend.
- As imagens previamente geradas no chat também são prévias do HTML/CSS existente da PWA, não evidências de funcionamento ponta a ponta.
- A UI real está em \`public/garcom-pwa/\` e já possui elementos \`<dialog>\` para pedidos/status; uma mudança futura precisa ser avaliada ali e testada em dispositivo real.

## Para uma eventual implementação posterior

1. Validar junto ao responsável se o protótipo tem algum refinamento desejado em relação à UI existente.
2. Implementar as diferenças aprovadas exclusivamente na PWA real, em outra alteração claramente identificada.
3. Testar as ações de assumir e deixar mesa; abrir/fechar modal com teclado/touch; scroll em tela pequena; pedido misto Bar/Cozinha; status e entrega por item; e estados offline.
4. Testar em servidor e PostgreSQL isolados antes do deploy.

**Este PR deve permanecer sem merge até uma decisão explícita.**
