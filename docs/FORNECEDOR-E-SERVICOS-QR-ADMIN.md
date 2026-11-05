# Identificação do fornecedor e serviços do QR Admin

**Documento interno de referência cadastral e operacional**  
**Revisado em:** 05/11/2026  
**Base cadastral:** Certificado da Condição de Microempreendedor Individual (CCMEI) apresentado pelo titular, emitido em 05/11/2026.

## 1. Identificação empresarial

| Campo | Informação |
|---|---|
| Nome empresarial | 69.987.201 DEIVID DE JESUS DE MOURA |
| Nome civil do titular | Deivid de Jesus de Moura |
| CNPJ | 69.987.201/0001-20 |
| Natureza / enquadramento | Empresário individual — Microempreendedor Individual (MEI) |
| Situação cadastral indicada no certificado | ATIVA |
| Data de abertura | 05/11/2026 |
| Forma de atuação declarada | Internet |
| Contato profissional já utilizado na documentação do produto | dejesusdemouradeivid@gmail.com |

Este documento não reproduz CPF, endereço comercial completo, capital social ou outros dados pessoais que não sejam necessários à identificação do fornecedor no contexto do software.

## 2. Atividades constantes do CCMEI

As atividades abaixo são transcritas como constam do certificado. A lista não deve ser interpretada como confirmação de enquadramento fiscal para toda e qualquer atividade futura de desenvolvimento, licenciamento, hospedagem ou consultoria de software.

- **Atividade principal — CNAE 4751-2/01:** comércio varejista especializado de equipamentos e suprimentos de informática.
- **Atividade secundária — CNAE 4752-1/00:** comércio varejista especializado de equipamentos de telefonia e comunicação.
- **Atividade secundária — CNAE 8219-9/99:** preparação de documentos e serviços especializados de apoio administrativo não especificados anteriormente.
- **Atividade secundária — CNAE 6190-6/99:** outras atividades de telecomunicações não especificadas anteriormente.

Antes de emitir documentos fiscais ou ampliar a oferta comercial, confirmar com a contabilidade se as atividades e o enquadramento cadastral são compatíveis com os serviços efetivamente contratados e faturados.

## 3. Produto e escopo funcional conhecido

**Produto:** QR Admin — sistema web de pedidos por QR Code e gestão operacional para um estabelecimento.

Áreas documentadas:
- cardápio digital e pedidos por QR Code;
- comandas e mesas;
- filas de produção da cozinha e do bar;
- PWA de atendimento do garçom;
- caixa, pagamentos registrados manualmente e comprovantes de consumo;
- painel administrativo, usuários, permissões e relatórios disponíveis.

Limites funcionais que devem continuar explícitos na documentação comercial:
- a instalação documentada atende um estabelecimento;
- o registro de PIX é manual e não confirma crédito bancário automaticamente;
- o comprovante emitido é de consumo, não nota fiscal;
- não há gateway bancário integrado no fluxo descrito;
- disponibilidade de rede, dispositivos e serviços externos pode afetar a operação.

## 4. Infraestrutura e integrações identificadas no projeto

| Componente | Uso documentado | Observação |
|---|---|---|
| Railway | Hospedagem/deploy da aplicação em produção **e do banco PostgreSQL** da instalação | Confirmado pelo responsável em 05/11/2026. URL documentada: https://qradminn.up.railway.app/ |
| PostgreSQL | Banco de dados da aplicação | Roda na mesma conta Railway da aplicação |
| Google OAuth | Autenticação opcional de funcionários | Somente quando habilitada e configurada |
| PIX | Registro manual de pagamentos | Não é provedor de processamento ou confirmação automática |

Fontes e imagens do cardápio são servidas pelo próprio domínio: o `public/mesa.html` deixou de carregar Google Fonts em 05/11/2026 (as famílias Kalam e Special Elite passaram a ser hospedadas em `public/fonts/`).

Esta tabela descreve componentes identificados no projeto. Não substitui inventário contratual de suboperadores, confirmação de região de processamento, acordos de tratamento, prazos de retenção ou avaliação de transferência internacional de dados.

## 5. Papéis e responsabilidades — orientação documental

- **Estabelecimento cliente:** responsável pela operação comercial, cardápio, preços, equipe, conferência de pagamentos, atendimento ao consumidor e definição das finalidades do tratamento dos dados operacionais.
- **Fornecedor do QR Admin:** fornece o software e o contato técnico/comercial. O papel de operador de dados pessoais, quando aplicável, deve ser definido por contrato e limitado às instruções documentadas do controlador.
- **Fornecedores de infraestrutura e integrações:** participam conforme os serviços efetivamente habilitados. A lista contratual e os detalhes de tratamento devem ser confirmados antes de publicar uma política definitiva para cada instalação.

Não afirmar que o fornecedor do software é o controlador dos dados dos consumidores e funcionários do estabelecimento apenas por disponibilizar a aplicação.

## 6. Canais e condições ainda a formalizar

O canal oficial de privacidade e contato profissional é **dejesusdemouradeivid@gmail.com**, confirmado pelo responsável em 05/11/2026 como monitorado, com compromisso de resposta em até 15 dias. Não foram confirmados neste cadastro:
- telefone comercial ou WhatsApp de suporte;
- domínio institucional ou endereço de site do fornecedor;
- horários e prazo de resposta do suporte;
- SLA, disponibilidade contratada e janela de manutenção;
- preço, vencimento, reajuste e política de inadimplência aplicáveis a cada cliente;
- procedimento de implantação, treinamento, backup, exportação e encerramento;
- ~~prazo de retenção e eliminação de dados por instalação~~ (definido em 05/11/2026 — ver `docs/engineering/data-policy-proposal.md`);
- inventário jurídico completo de suboperadores e contratos de tratamento.

Esses itens devem ser definidos em proposta/contrato e nas configurações efetivas de cada cliente. Não preencher por suposição.

## 7. Uso deste cadastro

- Usar o nome empresarial e CNPJ exatamente como aparecem no CCMEI.
- Não publicar CPF ou endereço residencial em README, páginas públicas ou documentação de produto.
- Manter a distinção entre fornecedor do software e estabelecimento controlador.
- Atualizar este documento quando houver alteração cadastral, de contato, infraestrutura ou modelo comercial.
- Validar com profissional contábil/jurídico os documentos fiscais, CNAEs e contratos antes de utilizá-los como instrumentos definitivos.
