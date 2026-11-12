'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('backend não exporta operações de titularidade, transferência ou liberação de mesa', () => {
  const atendimento = require('../db/atendimento');
  assert.equal(atendimento.transferirMesa, undefined);
  assert.equal(atendimento.transferirMesaAdmin, undefined);
  assert.equal(atendimento.deixarMesa, undefined);
  assert.doesNotMatch(read('server.js'), /transferirMesa|deixarMesa|garcons-ativos/);
});

test('sessão é criada sem garçom titular e pode ser acessada por outro garçom ativo', () => {
  const atendimento = read('db/atendimento.js');
  assert.match(atendimento, /INSERT INTO mesa_sessoes \(mesa_id, cliente_nome\)/);
  assert.match(atendimento, /acao: criada \? 'atendimento_iniciado' : 'atendimento_acessado'/);
  assert.match(atendimento, /idempotentReplay: !criada/);
  assert.doesNotMatch(atendimento, /garcom_responsavel_id/);
});

test('fila compartilhada não filtra pedidos por titular da sessão', () => {
  const pedidos = read('db/pedidos.js');
  const fila = pedidos.slice(pedidos.indexOf('async function getFilaGarcom'), pedidos.indexOf('async function checkinCliente'));
  assert.match(fila, /ip\.status IN \('concluido','aceito','retirado'\)/);
  assert.doesNotMatch(fila, /garcom_responsavel_id/);
  assert.match(fila, /aceito_por_id/);
  assert.match(fila, /retirado_por_id/);
  assert.match(fila, /entregue_por_id/);
});

test('cada etapa da entrega registra o funcionário que a executou, sem titular do pedido', () => {
  const entregas = read('db/entregas.js');
  assert.match(entregas, /gravarStatusItem\(client,item,destino,ator,requestId\)/);
  assert.match(entregas, /entregue_por_id/);
  assert.match(entregas, /retirado_por_id/);
  assert.doesNotMatch(entregas, /UPDATE pedidos SET garcom_id/);
  assert.doesNotMatch(entregas, /UPDATE pedidos SET garcom_entregou_id/);
});

test('qualquer garçom ativo pode consultar saldo e registrar pagamento da sessão', () => {
  const caixa = read('db/caixa.js');
  const atendimento = read('db/atendimento.js');
  assert.match(caixa, /SELECT id, ativo FROM garcons WHERE id = \$1 FOR SHARE/);
  assert.doesNotMatch(caixa, /sessao\.garcom_responsavel_id/);
  assert.doesNotMatch(caixa, /Somente o garçom responsável atual/);
  assert.doesNotMatch(atendimento, /garcom_responsavel_id/);
});

test('relatórios não atribuem conta, serviço ou desconto a um titular de mesa', () => {
  const relatorio = read('db/relatorio.js');
  const metricas = read('db/atendimento.js');
  assert.doesNotMatch(relatorio, /garcom_responsavel_id|garcomResponsavel/);
  assert.match(relatorio, /const porGarcom = \[\]/);
  assert.match(metricas, /p\.garcom_registrou_id=g\.id/);
  assert.match(metricas, /ip\.entregue_por_id=g\.id/);
  assert.doesNotMatch(metricas, /mesa_atendimento_historico|garcom_responsavel_id/);
});

test('PWA e painel não mostram controles nem indicadores de titularidade da mesa', () => {
  const pwa = read('public/garcom-pwa/app.js');
  const html = read('public/garcom-pwa/index.html');
  const admin = read('src/screens/Admin.tsx');
  assert.doesNotMatch(pwa, /garcomResponsavelNome|responsavelMesaNome|transferTable|leaveTable/);
  assert.doesNotMatch(html, /transferModal|Transferir mesa|Deixar mesa/);
  assert.doesNotMatch(admin, /Mesas assumidas|Transferências recebidas|Transferências feitas|Serviço por garçom responsável/);
});

test('panorama administrativo não retorna titular fixo da mesa', () => {
  const panorama = read('db/mesas-panorama.js');
  const types = read('src/lib/panorama.ts');
  assert.doesNotMatch(panorama, /garcom_responsavel_id|garcomResponsavel/);
  assert.doesNotMatch(types, /garcomResponsavel/);
});
