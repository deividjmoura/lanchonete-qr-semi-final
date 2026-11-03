# Tickets SSE curtos e de uso único

**Data:** 2026-11-03  
**Base de implementação:** branch `security/sse-one-time-short-lived-tickets`  
**Objetivo:** impedir que bearers permanentes de mesa/garçom apareçam na URL de `EventSource`.

## Contrato novo

1. O cliente envia a credencial permanente no corpo JSON de `POST /api/events/ticket`; para staff, a autenticação usa o cookie HttpOnly existente.
2. O servidor valida a credencial e emite um ticket aleatório de 256 bits.
3. O banco guarda somente SHA-256 do ticket, tipo/ID do recurso e SHA-256 da credencial que autorizou sua emissão.
4. O ticket expira em **60 segundos** e é consumido atomicamente uma única vez.
5. O cliente abre `GET /api/events?ticket=...`; o servidor consome o ticket e revalida a sessão/token original antes de assinar o stream.
6. Em erro/reconexão, os clientes atualizados pedem um ticket novo. O fallback de polling permanece ativo.
7. Logout/troca de senha staff e desativação/remoção de garçom encerram os streams já abertos para aquela identidade.

## Compatibilidade

- `public/js/realtime.js` e `src/lib/api.ts` usam o contrato novo.
- A PWA envia o bearer do garçom apenas no corpo POST; a URL SSE contém apenas o ticket temporário.
- O servidor mantém temporariamente o contrato antigo `?mesa=`/`?garcom=` para clientes antigos durante a transição. Esse fallback é legado e deve ser removido após a janela de atualização/cache dos clientes.
- Staff autenticado pode continuar usando o stream com cookie HttpOnly; os clientes atuais também passam pelo endpoint de ticket.
- O ticket é vinculado ao ID e ao fingerprint da credencial atual. Se o token da mesa/garçom mudar ou o garçom for desativado antes do GET SSE, o ticket não autoriza o stream.

## Persistência e proteção

Migration `0036_sse_tickets.sql` cria tabela aditiva. Ela não armazena o ticket bruto nem a credencial permanente. Registros usados/expirados são limpos oportunisticamente após a janela de retenção.

O ticket ainda aparece como parâmetro na requisição EventSource, mas é aleatório, de uso único, expira em 60 segundos e não permite autenticar novamente. O bearer permanente não aparece na URL, histórico do navegador ou referer.

## Testes previstos nesta mudança

- Teste PostgreSQL de persistência somente do hash, expiração e consumo único.
- Teste de regressão do cliente TypeScript: bearer no corpo POST e ticket na URL SSE.
- Teste do cliente legado/PWA: mesma separação de credenciais.
- E2E Chromium da PWA: captura a requisição EventSource e comprova ausência do token permanente.
- Teste do barramento: revogação fecha somente streams vinculados à identidade correspondente.

## Limites e riscos restantes

- O fallback de URL permanente fica ativo temporariamente para compatibilidade. Até removê-lo, clientes antigos ainda podem gerar URLs com token.
- Uma conexão já aberta de mesa permanece conectada até o cliente fechar ou a conexão cair; quando existir uma ação de rotação de token de mesa, ela deve chamar `closeAccess('mesa', id)`.
- O barramento SSE atual é local ao processo. A tabela de tickets funciona entre instâncias, mas **não** implementa pub/sub para distribuir eventos entre instâncias Railway. O escalonamento horizontal do broadcast é um trabalho separado.
- A validação em Android/iOS físicos continua pendente; os testes aqui são automatizados em Chromium.
- Nenhuma variável, segredo, serviço, dado ou configuração de produção/Railway foi alterada.
