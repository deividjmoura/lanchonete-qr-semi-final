'use strict';

/**
 * Praças internas + rotas administrativas do panorama (PR 1).
 *
 * Cobre banco (migration), regras do módulo admin (com pool falso),
 * rotas do server.js, cliente HTTP e a aba Mesas do admin. Nenhum teste aqui
 * toca Postgres real — a integração vive em postgres-mesas-panorama.test.cjs.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://regress:regress@127.0.0.1:5432/regress';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

test('migration cria praças como dados editáveis, sem mexer em mesas existentes', () => {
  const sql = read('db/migrations/0032_mesas_pracas_tempos.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mesa_pracas/);
  assert.match(sql, /nome\s+TEXT NOT NULL/);
  assert.match(sql, /btrim\(nome\) <> ''/);
  assert.match(sql, /uq_mesa_pracas_nome\s+ON mesa_pracas \(lower\(btrim\(nome\)\)\)/);
  // Semente só quando vazio: reaplicar não recria praças que o admin renomeou.
  assert.match(sql, /WHERE NOT EXISTS \(SELECT 1 FROM mesa_pracas\)/);
  assert.match(sql, /'Praia'[\s\S]*'Guarda-sol'[\s\S]*'Salão'/);
  // Sem praça = NULL, com FK que devolve a mesa ao "sem praça" ao excluir.
  assert.match(sql, /ADD COLUMN IF NOT EXISTS praca_id INTEGER/);
  assert.match(sql, /REFERENCES mesa_pracas\(id\) ON DELETE SET NULL/);
  // Faixas independentes do alerta de 15 min da fila.
  assert.match(sql, /atencao_minutos INTEGER NOT NULL DEFAULT 45/);
  assert.match(sql, /critico_minutos INTEGER NOT NULL DEFAULT 90/);
  assert.match(sql, /critico_minutos > atencao_minutos/);
  assert.match(sql, /NÃO é reaproveitado/);
  // A migration não altera tokens/QR nem remove mesas.
  assert.doesNotMatch(sql, /DROP TABLE mesas/);
  assert.doesNotMatch(sql, /UPDATE mesas SET token/);
});

test('listar/criar/renomear praça e definir praça da mesa (pool falso)', async () => {
  const pool = require('../db/pool');
  const admin = require('../db/admin');
  const original = pool.query;

  const chamadas = [];
  pool.query = async (sql, params) => {
    chamadas.push({ sql: String(sql), params });
    if (/SELECT p\.id, p\.nome, p\.ordem/.test(sql)) {
      return { rows: [{ id: 1, nome: 'Praia', ordem: 1, mesas: 12 }] };
    }
    if (/SELECT COALESCE\(MAX\(ordem\), 0\) \+ 1/.test(sql)) {
      return { rows: [{ proxima: 4 }] };
    }
    if (/INSERT INTO mesa_pracas/.test(sql)) {
      if (String(params[0]).toLowerCase() === 'praia') {
        const erro = new Error('duplicate key');
        erro.code = '23505';
        throw erro;
      }
      return { rows: [{ id: 9, nome: params[0], ordem: params[1] }] };
    }
    if (/UPDATE mesa_pracas SET/.test(sql)) {
      return { rows: [{ id: Number(params[params.length - 1]), nome: 'Praia Norte', ordem: 1 }] };
    }
    throw new Error('SQL inesperado no teste: ' + sql);
  };

  try {
    const pracas = await admin.listarPracas();
    assert.deepEqual(pracas, [{ id: 1, nome: 'Praia', ordem: 1, mesas: 12 }]);

    const nova = await admin.criarPraca({ nome: '  Varanda  ' });
    assert.equal(nova.nome, 'Varanda');
    assert.equal(nova.ordem, 4);
    assert.equal(nova.mesas, 0);

    await assert.rejects(() => admin.criarPraca({ nome: '   ' }), /Informe o nome da praça/);
    await assert.rejects(
      () => admin.criarPraca({ nome: 'x'.repeat(41) }),
      /até 40 caracteres/,
    );
    await assert.rejects(
      () => admin.criarPraca({ nome: 'Praia' }),
      (erro) => erro.status === 409 && /Já existe uma praça/.test(erro.message),
    );

    const renomeada = await admin.atualizarPraca(1, { nome: 'Praia Norte' });
    assert.equal(renomeada.nome, 'Praia Norte');
    await assert.rejects(() => admin.atualizarPraca(1, {}), /Nada para atualizar/);

    // Validação antes de qualquer conexão.
    await assert.rejects(
      () => admin.definirPracaMesa(71, 1),
      (erro) => erro.status === 400 && /entre 1 e 70/.test(erro.message),
    );
    await assert.rejects(
      () => admin.definirPracaMesa(1, -3),
      (erro) => erro.status === 400 && /Praça inválida/.test(erro.message),
    );

    // listMesas passou a devolver a praça para o mapa/modal.
    pool.query = async (sql) => {
      assert.match(String(sql), /LEFT JOIN mesa_pracas pr ON pr\.id = m\.praca_id/);
      return {
        rows: [{
          id: 1, numero: 1, token: 'tok', status: 'livre', praca_id: 2, praca_nome: 'Guarda-sol',
          sessao_id: null, valor_total: null, aberta_em: null, cliente_nome: null,
          garcom_responsavel_id: null, garcom_responsavel_nome: null,
        }],
      };
    };
    const mesas = await admin.listMesas();
    assert.equal(mesas[0].pracaId, 2);
    assert.equal(mesas[0].pracaNome, 'Guarda-sol');
  } finally {
    pool.query = original;
  }
});

test('definirPracaMesa grava a praça e audita dentro da transação', () => {
  const admin = read('db/admin.js');
  assert.match(admin, /async function definirPracaMesa/);
  assert.match(admin, /FOR UPDATE/);
  assert.match(admin, /UPDATE mesas SET praca_id = \$2/);
  assert.match(admin, /acao: 'mesa_praca_definida'/);
  assert.match(admin, /pracaAnteriorId: anterior/);
  assert.match(admin, /pracaNovaId: pracaId/);
  assert.match(admin, /Mesa ainda não habilitada pelo administrador/);
  assert.match(admin, /const alterou = anterior !== pracaId/);
  assert.match(admin, /module\.exports[\s\S]*definirPracaMesa/);
});

test('rotas administrativas expõem panorama, detalhe por número e praças', () => {
  const server = read('server.js');
  assert.match(server, /require\('\.\/db\/mesas-panorama'\)/);
  assert.match(server, /p === '\/api\/admin\/mesas\/panorama' && req\.method === 'GET'/);
  assert.match(server, /panoramaMesas\(\{ periodo: q\.get\('periodo'\) \|\| 'hoje' \}\)/);
  assert.match(server, /p === '\/api\/admin\/pracas' && req\.method === 'GET'/);
  assert.match(server, /p === '\/api\/admin\/pracas' && req\.method === 'POST'/);
  assert.match(server, /pracas\\\/\(\\d\+\)\$/);
  assert.match(server, /admin\\\/mesas\\\/\(\\d\+\)\\\/praca\$/);
  assert.match(server, /definirPracaMesa\(Number\(m\[1\]\), payload\?\.pracaId, staff, reqId\)/);
  assert.match(server, /mesaDetalhe\(Number\(m\[1\]\)\)/);
  // Continua sob o gate de admin (sessão + papel) e emite SSE após mudanças.
  assert.match(server, /p\.startsWith\('\/api\/admin'\)[\s\S]*exigirAcesso\(req, 'admin'\)/);
  assert.match(server, /type: 'mesa_praca_alterada'/);
  assert.match(server, /type: 'praca_criada'/);
  assert.match(server, /type: 'praca_atualizada'/);
  // Rotas antigas seguem intactas.
  assert.match(server, /p === '\/api\/admin\/mesas\/ativar' && req\.method === 'POST'/);
  assert.match(server, /p === '\/api\/admin\/mesas' && req\.method === 'GET'/);
  assert.match(server, /transferirMesaAdmin\(staff,Number\(m\[1\]\),payload\?\.garcomDestinoId,reqId\)/);
});

test('cliente HTTP envia CSRF nas escritas de praça e tipa o panorama', () => {
  const api = read('src/lib/api.ts');
  assert.match(api, /import type \{[\s\S]*PanoramaMesas[\s\S]*\} from "\.\/panorama"/);
  assert.match(api, /adminMesasPanorama: \(periodo: PeriodoPanorama = "hoje"\)/);
  assert.match(api, /\/api\/admin\/mesas\/panorama\?periodo=/);
  assert.match(api, /adminMesaDetalhe: \(numero: number\) => apiGet<MesaDetalhe>\(`\/api\/admin\/mesas\/\$\{numero\}`\)/);
  assert.match(api, /adminPracas: \(\) => apiGet<Praca\[\]>\("\/api\/admin\/pracas"\)/);
  assert.match(api, /adminCriarPraca/);
  assert.match(api, /adminAtualizarPraca/);
  assert.match(api, /adminDefinirPracaMesa[\s\S]*"PUT"/);
  // Escritas em /api/admin exigem token CSRF (o cliente já cobre o prefixo).
  assert.match(api, /path\.startsWith\("\/api\/admin\/"\)/);
});

test('aba Mesas usa o panorama novo e preserva as operações existentes', () => {
  const admin = read('src/screens/Admin.tsx');
  assert.match(admin, /import MesasAdmin from "\.\/admin\/MesasAdmin"/);
  assert.match(admin, /\{aba === "mesas" && <MesasAdmin \/>\}/);

  const mesas = read('src/screens/admin/MesasAdmin.tsx');
  assert.match(mesas, /api\.adminMesasPanorama\(periodoAtual\)/);
  assert.match(mesas, /useAgora\(15000\)/);
  assert.match(mesas, /connectEvents/);
  assert.match(mesas, /<PanoramaMesas/);
  assert.match(mesas, /<MapaQrMesas/);
  assert.match(mesas, /<MesaDetalheModal/);

  const panorama = read('src/screens/admin/PanoramaMesas.tsx');
  // Cartões entram no movimento global do PR 2 pelo atributo combinado.
  assert.match(panorama, /data-glass-card/);
  assert.match(panorama, /FAIXAS_TEMPO/);
  assert.match(panorama, /Consumo em aberto/);
  assert.match(panorama, /Vendas \$\{ROTULO_PERIODO\[periodo\]\}/);
  assert.match(panorama, /receita recebida/);
  assert.match(panorama, /Entregue nas mesas abertas e ainda não pago/);
  // O consumo em aberto nunca aparece sozinho: vem com a composição entregue/pago.
  assert.match(panorama, /consumo entregue \{BRL\(resumo\.consumo\)\} · já pago/);
  assert.match(panorama, /Em operação/);
  assert.match(panorama, /Tempos do fluxo/);
  assert.match(panorama, /Indisponível/);
  assert.match(panorama, /aproximado|aprox\./);

  const mapa = read('src/screens/admin/MapaQrMesas.tsx');
  assert.match(mapa, /Nº da mesa/);
  assert.match(mapa, /onAbrirMesa\(n\)/);
  assert.match(mapa, /api\.ativarMesas/);
  assert.match(mapa, /mesaClienteUrl\(mesa\.token\)/);
  assert.match(mapa, /<QrDownloadButton/);
  assert.match(mapa, /fecharSessao\(mesa\.sessaoId, "dinheiro"\)/);

  // Criar/renomear praça sem deploy, direto do painel.
  assert.match(mesas, /<GerenciarPracas/);
  assert.match(mesas, /import \{ GerenciarPracas \} from "\.\/GerenciarPracas"/);
  assert.match(mesas, /> Praças\n/);
  const pracas = read('src/screens/admin/GerenciarPracas.tsx');
  assert.match(pracas, /api\.adminAtualizarPraca\(praca\.id, \{ nome \}\)/);
  assert.match(pracas, /api\.adminCriarPraca\(nome\)/);
  assert.match(pracas, /Ficam no banco/);
  assert.match(pracas, /Sem praça/);

  const modal = read('src/screens/admin/MesaDetalheModal.tsx');
  assert.match(modal, /api\.adminDefinirPracaMesa\(numero, pracaSelecionada\)/);
  assert.match(modal, /api\.transferirMesaAdmin\(numero, destinoId\)/);
  assert.match(modal, /Sem praça/);
  assert.match(modal, /fecharSessao\(detalhe\.sessaoId, "dinheiro"\)/);
  assert.match(modal, /Consumo em aberto/);
  assert.match(modal, /STATUS_ITEM/);
  // Nenhuma operação destrutiva silenciosa: transferência pede confirmação.
  assert.match(modal, /confirm\(/);
});

test('QR e links continuam usando o token fixo da mesa', () => {
  const url = read('src/lib/mesaUrl.ts');
  assert.match(url, /#\/mesa\/\$\{token\}/);
  assert.match(url, /nomeArquivoQr/);
  const qr = read('src/screens/admin/QrDownloadButton.tsx');
  assert.match(qr, /<QRCodeSVG/);
  assert.match(qr, /mesaClienteUrl\(token\)/);
  assert.match(qr, /setPendente\(true\)/);
});
