'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('mesa/sessão não tem titular e o acesso é colaborativo',()=>{
 const api=read('db/atendimento.js');
 assert.match(api,/INSERT INTO mesa_sessoes \(mesa_id, cliente_nome\)/);
 assert.doesNotMatch(api,/garcom_responsavel_id/);
 assert.match(api,/async function iniciarAtendimentoGarcom/);
 assert.match(api,/async function assumirMesa/);
 assert.match(api,/async function criarPedidoGarcom/);
 assert.match(api,/idempotentReplay: !criada/);
});

test('PWA e API não oferecem transferência ou liberação de mesa',()=>{
 const pwa=read('public/garcom-pwa/app.js'),html=read('public/garcom-pwa/index.html'),server=read('server.js');
 assert.match(pwa,/openTableDetails\(m\.numero\)/);
 assert.doesNotMatch(pwa,/transferTable|leaveTable|garcomResponsavelNome|responsavelMesaNome/);
 assert.doesNotMatch(html,/transferModal|Transferir mesa|Deixar mesa/);
 assert.doesNotMatch(server,/garcons-ativos|deixarMesa|transferirMesa/);
});

test('fila é compartilhada e autoria individual dos itens é mantida',()=>{
 const pedidos=read('db/pedidos.js'),entregas=read('db/entregas.js');
 assert.match(pedidos,/ip\.status IN \('concluido','aceito','retirado'\)/);
 assert.doesNotMatch(pedidos,/s\.garcom_responsavel_id/);
 assert.match(entregas,/entregue_por_id/);
 assert.match(entregas,/retirado_por_id/);
 assert.match(entregas,/aceito_por_id/);
 assert.doesNotMatch(entregas,/UPDATE pedidos SET garcom_id/);
 assert.doesNotMatch(entregas,/UPDATE pedidos SET garcom_entregou_id/);
});

test('qualquer garçom ativo pode registrar pagamento, sem comparação com titular da sessão',()=>{
 const caixa=read('db/caixa.js');
 assert.match(caixa,/SELECT id, ativo FROM garcons WHERE id = \$1 FOR SHARE/);
 assert.doesNotMatch(caixa,/sessao\.garcom_responsavel_id/);
 assert.doesNotMatch(caixa,/Somente o garçom responsável atual/);
});

test('Caixa fecha quitação simples só quando não há pedidos ou avisos PIX pendentes',()=>{
 const caixa=read('db/caixa.js');
 assert.match(caixa,/const valorDevido = Number\(\(total \+ taxaServico\)\.toFixed\(2\)\)/);
 assert.match(caixa,/Math\.abs\(valorDevido - valorPago\) <= 0\.009/);
 assert.match(caixa,/pedidosPendentes\[0\].*=== 0/);
 assert.match(caixa,/avisosPixPendentes\[0\].*=== 0/);
 assert.match(caixa,/SET status='fechada', fechada_em=now\(\)/);
 assert.match(caixa,/UPDATE mesas SET status='livre'/);
});

test('PWA tem JavaScript válido após remoção das ações de titularidade',()=>{
 cp.execFileSync(process.execPath,['--check',path.join(root,'public/garcom-pwa/app.js')]);
});
