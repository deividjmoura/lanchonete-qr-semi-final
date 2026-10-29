const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Pedido adicional exige responsável atribuído e não transfere a mesa para quem o lança',()=>{
 const api=read('db/atendimento.js'),ped=read('db/pedidos.js');
 assert.match(api,/s\.garcom_responsavel_id IS NOT NULL/);
 assert.match(api,/token: Number\(r\.garcom_responsavel_id\) === Number\(garcom\.id\) \? r\.token : null/);
 assert.match(api,/async function listarPedidosAtivosMesa/);
 assert.match(api,/pedidoPaiId: body && body\.pedidoPaiId/);
 assert.match(api,/acao: 'mesa_assumida'/);
 assert.match(api,/acao: 'mesa_transferida'/);
 assert.match(api,/acao: 'mesa_liberada'/);
 assert.match(read('db/pedidos.js'),/acao: 'pedido_editado'/);
 assert.match(read('server.js'),/editarPedidoGarcom\(m\[1\],m\[2\],await body\(req\),reqId\)/);
 assert.match(read('db/garcons.js'),/acao: 'itens_entregues'/);
 assert.match(read('server.js'),/entregarComoGarcom\(Number\(m\[2\]\), m\[1\], itemIds \|\| null, reqId\)/);
 assert.match(read('server.js'),/transferirMesa\(m\[1\], m\[2\], payload\.garcomDestinoId, reqId\)/);
 assert.match(read('server.js'),/deixarMesa\(m\[1\],m\[2\],reqId\)/);
 assert.match(read('server.js'),/assumirMesa\(m\[1\], m\[2\], await body\(req\), reqId\)/);
 assert.match(read('server.js'),/pedidos-ativos/);
 assert.match(read('db/migrations/0026_pedido_pai_id.sql'),/ADD COLUMN IF NOT EXISTS pedido_pai_id/);
 assert.match(api,/A mesa precisa ter um atendimento aberto com garçom responsável/);
 assert.match(ped,/if \(!atribuidos\[0\]\?\.garcom_responsavel_id\)/);
 assert.doesNotMatch(ped,/garcom_responsavel_id !== atendimento\.garcomId/);
 assert.doesNotMatch(api,/permitirResponsavelDiferente:true/);
 assert.match(ped,/garcomId/);
});
test('Toque na mesa abre detalhes; iniciar atende mesa vazia ou QR e transferir exige responsável atual',()=>{
 const pwa=read('public/garcom-pwa/app.js'),html=read('public/garcom-pwa/index.html'),api=read('db/atendimento.js');
 assert.match(pwa,/openTableDetails\\(m\\.numero\\)/);
 assert.match(html,/id="tableDetailsModal"/);
 assert.match(pwa,/if\\(!m\\.garcomResponsavelId\\)/);
 assert.match(pwa,/start\\.textContent=m\\.pedidoClienteQr\\?'Assumir mesa':'Iniciar atendimento'/);
 assert.match(pwa,/iniciarAtendimento\\(m\\.numero,m\\.clienteNome/);
 assert.match(pwa,/Number\\(m\\.garcomResponsavelId\\)===Number\\(currentWaiterId\\)/);
 assert.match(api,/async function iniciarAtendimentoGarcom/);
 assert.match(api,/async function assumirMesa/);
 assert.match(api,/origem_pedido='cliente'/);
 assert.match(api,/async function transferirMesa/);
});
test('Fila e entrega ficam restritas ao responsável atual da mesa',()=>{
 const api=read('db/atendimento.js'),garcons=read('db/garcons.js'),pedidos=read('db/pedidos.js'),server=read('server.js');
 assert.match(api,/s\.garcom_responsavel_id=\$1/);
 assert.match(garcons,/Este pedido não pertence a uma mesa sob sua responsabilidade atual/);
 assert.match(pedidos,/garcomId/);
 assert.match(server,/listarAtendimentosGarcom/);
});
test('Caixa fecha quitação simples só quando não há pedidos ou avisos PIX pendentes',()=>{
 const caixa=read('db/caixa.js');
 assert.match(caixa,/Math\.abs\(total - valorPago\) <= 0\.009/);
 assert.match(caixa,/pedidosPendentes\[0\].*=== 0/);
 assert.match(caixa,/avisosPixPendentes\[0\].*=== 0/);
 assert.match(caixa,/SET status='fechada', fechada_em=now\(\)/);
 assert.match(caixa,/UPDATE mesas SET status='livre'/);
 assert.match(caixa,/const vazia = semPedidos/);
 assert.match(caixa,/const quitada = sessao\.pedidosPendentes === 0/);
});
test('PWA tem JavaScript valido apos edicao de pedidos e notificacoes',()=>{cp.execFileSync(process.execPath,['--check',path.join(root,'public/garcom-pwa/app.js')]);});
test('Garcom consulta status de todas as suas mesas, nao apenas entregas',()=>{
 const api=read('db/atendimento.js');const pwa=read('public/garcom-pwa/app.js');
 assert.match(api,/s\.garcom_responsavel_id=\$1/);assert.match(api,/s\.status='aberta'/);
 assert.match(pwa,/\/atendimentos/);assert.match(pwa,/renderMyTables/);
});
test('Edicao valida pertencimento e so pode ocorrer antes do preparo',()=>{
 const api=read('db/atendimento.js'),ped=read('db/pedidos.js');
 assert.match(api,/editarPedidoGarcom/);assert.match(api,/garcom\.id\)/);
 assert.match(ped,/garcomResponsavelId/);assert.match(ped,/status !== 'recebido'/);
});
test('Pedidos offline preservam idempotencyKey quando editados',()=>{
 const pwa=read('public/garcom-pwa/app.js');
 assert.match(pwa,/editingDraftId/);assert.match(pwa,/await putOrder\(o\)/);
 assert.match(pwa,/o\.status!=='offline'/);
});
test('Avisos iniciais da cozinha e bar nao reproduzem fila antiga',()=>{
 const src=read('src/store/usePub.ts'),shell=read('src/components/OpsShell.tsx');
 assert.match(src,/anuncioBarPronto/);assert.match(src,/cozinhaIdsVistos/);
 assert.match(shell,/visto\.current === null/);
});
test('Bar recebe agua e notificacao aparece no PWA',()=>{
 const mig=read('db/migrations/0020_bebidas_setor_bar.sql');
 assert.match(mig,/UPDATE produtos SET setor='bar'/);
 assert.match(mig,/água\|agua/);
 assert.match(read('public/garcom-pwa/index.html'),/id="readyToast"/);
});
