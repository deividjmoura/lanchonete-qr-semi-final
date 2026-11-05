'use strict';

/**
 * Semente determinística para capturas reais da página comercial (#95ed150).
 *
 * Perigo deliberado: este script TRUNCA os dados operacionais do banco alvo.
 * A guarda exige loopback + banco exclusivo qradmin_apresentacao_test,
 * confirmação explícita e ambiente diferente de production.
 * Nunca use este script em produção ou em um banco compartilhado.
 *
 * Uso local:
 *   # Crie qradmin_apresentacao_test em um PostgreSQL local isolado.
 *   # Aponte .env para esse banco exclusivo (não qradmin_test).
 *   npm run db:migrate
 *   DEMO_RESET_CONFIRM=APAGAR_qradmin_apresentacao_test npm run seed:apresentacao
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
const envPath = path.join(ROOT, '.env');
if (!fs.existsSync(envPath)) {
  console.error('Recusado: .env ausente. Crie-o com DATABASE_URL apontando apenas para PostgreSQL local de teste.');
  process.exit(1);
}
const parsedEnv = dotenv.parse(fs.readFileSync(envPath));
const urlEnv = String(process.env.DATABASE_URL || parsedEnv.DATABASE_URL || '').trim();
const nodeEnv = String(process.env.NODE_ENV || parsedEnv.NODE_ENV || 'development').trim().toLowerCase();

function validarBancoLocal(urlRaw, env) {
  let url;
  try {
    url = new URL(urlRaw);
  } catch {
    throw new Error('DATABASE_URL ausente ou inválida.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL não é PostgreSQL.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const nomeDeTeste = dbName === 'qradmin_apresentacao_test';
  if (env === 'production') throw new Error('NODE_ENV=production: recusando seed de demonstração.');
  if (!local) throw new Error(`Host do banco não é loopback (${host || '(vazio)'}): recusando seed.`);
  if (!nomeDeTeste) throw new Error(`Banco "${dbName}" não tem nome de teste/demo: recusando seed.`);
  if (url.search || /railway|neon\.tech|render\.com|supabase\.co/i.test(url.hostname)) {
    throw new Error('DATABASE_URL parece apontar a serviço remoto: recusando seed.');
  }
  return { url, dbName };
}

if (process.env.DEMO_RESET_CONFIRM !== 'APAGAR_qradmin_apresentacao_test') {
  console.error('Recusado: seed destrutivo. Exige DEMO_RESET_CONFIRM=APAGAR_qradmin_apresentacao_test e banco exclusivo qradmin_apresentacao_test.');
  process.exit(1);
}

let alvo;
try {
  alvo = validarBancoLocal(urlEnv, nodeEnv);
} catch (erro) {
  console.error(`Recusado: ${erro.message}`);
  process.exit(1);
}

// O URL de shell não pode redirecionar a semente para outro host/banco que o
// .env revisado pelo operador. Só permite override se também for local/teste.
if (process.env.DATABASE_URL && parsedEnv.DATABASE_URL && process.env.DATABASE_URL !== parsedEnv.DATABASE_URL) {
  try {
    validarBancoLocal(process.env.DATABASE_URL, nodeEnv);
    if (process.env.DATABASE_URL !== parsedEnv.DATABASE_URL) {
      throw new Error('DATABASE_URL do ambiente difere do .env.');
    }
  } catch (erro) {
    console.error(`Recusado: ${erro.message}`);
    process.exit(1);
  }
}

// Preenche o restante do ambiente a partir do .env sem sobrepor valores
// explícitos do processo.
for (const [chave, valor] of Object.entries(parsedEnv)) {
  if (process.env[chave] === undefined) process.env[chave] = valor;
}

const { Client } = require('pg');
const { hashSenha } = require('../db/auth');
const scrypt = promisify(crypto.scrypt);
const q = (n) => Number(Number(n).toFixed(2));
const iso = (d) => new Date(d).toISOString();
const minutosAntes = (n) => iso(Date.now() - n * 60_000);

function dataLocalIso(diasAntes, hora, minuto) {
  const base = new Date(Date.now() - diasAntes * 86_400_000);
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(base);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  // America/Sao_Paulo é UTC-03:00 nas datas do cenário (novembro de 2026).
  return iso(new Date(`${p.year}-${p.month}-${p.day}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`));
}

const equipe = [
  { nome: 'Eduardo Martins — demonstração', login: process.env.DEMO_ADMIN_USER || 'admin', papel: 'admin', senha: process.env.DEMO_ADMIN_PASS },
  { nome: 'Marina — cozinha', login: process.env.DEMO_COZINHA_USER || 'cozinha', papel: 'cozinha', senha: process.env.DEMO_COZINHA_PASS },
  { nome: 'Rafael — bar', login: process.env.DEMO_BAR_USER || 'bar', papel: 'bar', senha: process.env.DEMO_BAR_PASS },
  { nome: 'Camila — caixa', login: process.env.DEMO_CAIXA_USER || 'caixa', papel: 'caixa', senha: process.env.DEMO_CAIXA_PASS },
];
for (const conta of equipe) {
  if (!conta.senha || String(conta.senha).length < 12) {
    console.error(`Recusado: defina DEMO_${conta.papel.toUpperCase()}_PASS (mínimo 12 caracteres) em .env.`);
    process.exit(1);
  }
}

const catalogo = [
  { key: 'xbacon', cat: 'Hambúrgueres', nome: 'X-Bacon da Casa', descricao: 'Pão brioche tostado, hambúrguer bovino de 160 g, queijo prato, bacon crocante, alface, tomate e molho da casa.', preco: 32.00, foto: '/assets/demo/xbacon.webp', setor: 'cozinha', ponto: true, removiveis: ['Alface', 'Tomate', 'Cebola'], adicionais: [['Cheddar extra', 5.50], ['Bacon extra', 6.00], ['Ovo', 3.50], ['Hambúrguer extra', 10.00]] },
  { key: 'smash', cat: 'Hambúrgueres', nome: 'Smash Duplo', descricao: 'Dois discos bovinos prensados na chapa, cheddar, cebola caramelizada e molho especial no pão selado.', preco: 38.50, foto: '/assets/demo/burger.webp', setor: 'cozinha', ponto: true, removiveis: ['Cebola caramelizada'], adicionais: [['Cheddar extra', 5.50], ['Bacon extra', 6.00]] },
  { key: 'xsalada', cat: 'Hambúrgueres', nome: 'X-Salada da Horta', descricao: 'Hambúrguer bovino, queijo prato, alface fresca, tomate e maionese verde da casa.', preco: 29.50, foto: '/assets/demo/salad.webp', setor: 'cozinha', ponto: true, removiveis: ['Alface', 'Tomate'], adicionais: [['Cheddar extra', 5.50], ['Ovo', 3.50]] },
  { key: 'frango', cat: 'Hambúrgueres', nome: 'Frango Crocante', descricao: 'Filé de frango empanado, queijo, alface, tomate e maionese de limão no pão brioche.', preco: 31.00, foto: '/assets/demo/chicken.webp', setor: 'cozinha', removiveis: ['Alface', 'Tomate'], adicionais: [['Cheddar extra', 5.50], ['Bacon extra', 6.00]] },
  { key: 'veggie', cat: 'Hambúrgueres', nome: 'Veggie da Casa', descricao: 'Hambúrguer de grão-de-bico, queijo coalho, rúcula, tomate e molho de ervas.', preco: 30.50, foto: '/assets/demo/salad.webp', setor: 'cozinha', removiveis: ['Rúcula', 'Tomate'], adicionais: [['Queijo coalho extra', 5.00]] },
  { key: 'batata', cat: 'Porções', nome: 'Batata Rústica com Páprica', descricao: 'Batatas douradas com páprica defumada, sal de ervas e maionese da casa à parte.', preco: 28.50, foto: '/assets/demo/fries.webp', setor: 'cozinha', adicionais: [['Cheddar cremoso', 7.00], ['Bacon crocante', 6.00]] },
  { key: 'mandioca', cat: 'Porções', nome: 'Mandioca Frita', descricao: 'Mandioca macia por dentro e dourada por fora, com manteiga de ervas.', preco: 26.00, foto: '/assets/demo/mandioca.webp', setor: 'cozinha' },
  { key: 'iscas', cat: 'Porções', nome: 'Iscas de Frango', descricao: 'Tiras de frango empanadas, servidas com molho de alho e limão.', preco: 38.50, foto: '/assets/demo/chicken.webp', setor: 'cozinha', adicionais: [['Molho barbecue', 3.00]] },
  { key: 'onion', cat: 'Porções', nome: 'Anéis de Cebola', descricao: 'Cebola empanada na hora, sequinha e crocante.', preco: 27.50, foto: '/assets/demo/onion.webp', setor: 'cozinha' },
  { key: 'polenta', cat: 'Porções', nome: 'Polenta Frita', descricao: 'Palitos de polenta crocantes com parmesão ralado.', preco: 24.00, foto: '/assets/demo/polenta.webp', setor: 'cozinha' },
  { key: 'pastel-carne', cat: 'Pastéis', nome: 'Pastel de Carne', descricao: 'Massa fina e crocante, recheada com carne moída refogada.', preco: 14.50, foto: '/assets/demo/misto.webp', setor: 'cozinha' },
  { key: 'pastel-queijo', cat: 'Pastéis', nome: 'Pastel de Queijo', descricao: 'Queijo derretido em massa aberta e frita na hora.', preco: 13.50, foto: '/assets/demo/misto.webp', setor: 'cozinha' },
  { key: 'pastel-frango', cat: 'Pastéis', nome: 'Pastel de Frango com Catupiry', descricao: 'Frango desfiado temperado e requeijão cremoso.', preco: 16.50, foto: '/assets/demo/chicken.webp', setor: 'cozinha' },
  { key: 'suco-laranja', cat: 'Sucos Naturais', nome: 'Suco de Laranja Natural', descricao: 'Laranja espremida na hora, sem mistura.', preco: 14.00, foto: '/assets/demo/juice.webp', setor: 'bar' },
  { key: 'suco-maracuja', cat: 'Sucos Naturais', nome: 'Suco de Maracujá', descricao: 'Polpa batida com água ou leite. Escolha na hora do pedido.', preco: 14.50, foto: '/assets/demo/natural.webp', setor: 'bar', adicionais: [['Com leite', 2.00]] },
  { key: 'limonada', cat: 'Sucos Naturais', nome: 'Limonada Suíça', descricao: 'Limão batido com gelo e um toque de leite condensado.', preco: 16.00, foto: '/assets/demo/juice.webp', setor: 'bar' },
  { key: 'refri', cat: 'Bebidas e Chopes', nome: 'Refrigerante Lata 350 ml', descricao: 'Lata gelada. Escolha o sabor.', preco: 7.50, foto: '/assets/demo/soda-cola.webp', setor: 'bar', estoque: 42, adicionais: [['Coca-Cola', 0], ['Coca-Cola Zero', 0], ['Guaraná Antarctica', 0]] },
  { key: 'agua', cat: 'Bebidas e Chopes', nome: 'Água Mineral 500 ml', descricao: 'Com ou sem gás.', preco: 5.50, foto: '/assets/demo/water.webp', setor: 'bar', estoque: 36, adicionais: [['Com gás', 0]] },
  { key: 'chopp-300', cat: 'Bebidas e Chopes', nome: 'Chopp Pilsen 300 ml', descricao: 'Chopp claro, leve e servido bem gelado.', preco: 11.50, foto: '/assets/demo/beer.webp', setor: 'bar', estoque: 28 },
  { key: 'chopp-500', cat: 'Bebidas e Chopes', nome: 'Chopp Pilsen 500 ml', descricao: 'Copo grande de chopp pilsen, tirado na hora.', preco: 17.50, foto: '/assets/demo/beer.webp', setor: 'bar', estoque: 24 },
  { key: 'chopp-ipa', cat: 'Bebidas e Chopes', nome: 'Chopp IPA 300 ml', descricao: 'Amargor cítrico e aroma de lúpulo, servido no copo de 300 ml.', preco: 18.50, foto: '/assets/demo/beer.webp', setor: 'bar', estoque: 16 },
  { key: 'long-neck', cat: 'Bebidas e Chopes', nome: 'Cerveja Long Neck', descricao: 'Cerveja 330 ml. Consulte as opções da casa.', preco: 16.50, foto: '/assets/demo/beer.webp', setor: 'bar', estoque: 21 },
  { key: 'brownie', cat: 'Sobremesas', nome: 'Brownie com Sorvete', descricao: 'Brownie de chocolate aquecido com uma bola de sorvete de creme.', preco: 19.50, foto: '/assets/demo/brownie.webp', setor: 'cozinha' },
  { key: 'churros', cat: 'Sobremesas', nome: 'Churros com Doce de Leite', descricao: 'Mini churros passados no açúcar e canela, com doce de leite.', preco: 17.50, foto: '/assets/demo/churros.webp', setor: 'cozinha' },
  { key: 'petit', cat: 'Sobremesas', nome: 'Petit Gâteau', descricao: 'Bolo de chocolate com centro cremoso, acompanhado de sorvete.', preco: 24.50, foto: '/assets/demo/petit.webp', setor: 'cozinha' },
];

async function main() {
  const client = new Client({ connectionString: urlEnv, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const { rows: identity } = await client.query('SELECT current_database() AS db, inet_server_addr()::text AS addr');
    const hostReal = String(identity[0].addr || '').split('/')[0];
    if (identity[0].db !== alvo.dbName || !['127.0.0.1', '::1'].includes(hostReal)) {
      throw new Error(`Conexão real não é o banco local esperado (${identity[0].db} @ ${identity[0].addr}). Recusando.`);
    }
    const { rows: pending } = await client.query("SELECT to_regclass('public.schema_migrations') AS t");
    if (!pending[0].t) throw new Error('Migrations ausentes: rode npm run db:migrate primeiro.');

    await client.query('BEGIN');
    await client.query(`
      TRUNCATE TABLE
        sse_tickets, auditoria_eventos, staff_credencial_eventos,
        staff_codigos_recuperacao, itens_pedido_historico,
        mesa_atendimento_historico, itens_pedido_adicionais,
        itens_pedido_remocoes, itens_pedido, pedidos, sessao_pagamentos,
        pix_avisos, mesa_sessoes, staff_sessoes,
        produtos_ingredientes_removiveis, adicionais, produtos,
        categorias, garcons, staff, mesas, mesa_pracas
      RESTART IDENTITY CASCADE
    `);

    const pracaIds = {};
    for (const [ordem, nome] of ['Salão', 'Varanda', 'Balcão'].entries()) {
      const { rows } = await client.query(
        'INSERT INTO mesa_pracas (nome, ordem) VALUES ($1, $2) RETURNING id', [nome, ordem + 1]
      );
      pracaIds[nome] = rows[0].id;
    }
    await client.query(
      `INSERT INTO configuracao_mesas (id, quantidade, atencao_minutos, critico_minutos)
       VALUES (1, 18, 45, 90)
       ON CONFLICT (id) DO UPDATE SET quantidade=EXCLUDED.quantidade,
         atencao_minutos=EXCLUDED.atencao_minutos, critico_minutos=EXCLUDED.critico_minutos`
    );

    const tokensMesa = new Map();
    for (let numero = 1; numero <= 18; numero++) {
      const praca = numero <= 8 ? 'Salão' : numero <= 13 ? 'Varanda' : 'Balcão';
      const token = crypto.randomUUID();
      tokensMesa.set(numero, token);
      await client.query(
        `INSERT INTO mesas (numero, token, status, praca_id) VALUES ($1, $2, 'livre', $3)`,
        [numero, token, pracaIds[praca]]
      );
    }

    const staffIds = {};
    for (const conta of equipe) {
      const senhaHash = await hashSenha(String(conta.senha));
      const { rows } = await client.query(
        `INSERT INTO staff (nome, login, senha_hash, papel, ativo, deve_trocar_senha, totp_ativo)
         VALUES ($1, $2, $3, $4, TRUE, FALSE, FALSE) RETURNING id`,
        [conta.nome, conta.login, senhaHash, conta.papel]
      );
      staffIds[conta.papel] = rows[0].id;
    }

    const { rows: garconsRows } = await client.query(
      `INSERT INTO garcons (nome, ativo) VALUES ('Ana Ribeiro', TRUE), ('Lucas Ferreira', TRUE)
       RETURNING id, nome, token`
    );
    const garcons = Object.fromEntries(garconsRows.map((g) => [g.nome, g]));

    const catIds = new Map();
    const categorias = [...new Set(catalogo.map((p) => p.cat))];
    for (const [ordem, nome] of categorias.entries()) {
      const { rows } = await client.query(
        'INSERT INTO categorias (nome, ordem) VALUES ($1, $2) RETURNING id', [nome, ordem + 1]
      );
      catIds.set(nome, rows[0].id);
    }

    const produtoIds = new Map();
    const adicionaisIds = new Map();
    for (const [ordem, p] of catalogo.entries()) {
      const { rows } = await client.query(
        `INSERT INTO produtos
          (categoria_id, nome, descricao, preco, foto_url, disponivel, pede_ponto_carne,
           controla_estoque, estoque, estoque_minimo, ordem, setor, arquivado)
         VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8,6,$9,$10,FALSE) RETURNING id`,
        [catIds.get(p.cat), p.nome, p.descricao, p.preco, p.foto, Boolean(p.ponto),
          p.estoque != null, p.estoque ?? null, ordem + 1, p.setor]
      );
      const produtoId = rows[0].id;
      produtoIds.set(p.key, produtoId);
      adicionaisIds.set(p.key, new Map());
      for (const [nome, preco] of p.adicionais || []) {
        const ad = await client.query(
          'INSERT INTO adicionais (produto_id, nome, preco) VALUES ($1,$2,$3) RETURNING id',
          [produtoId, nome, preco]
        );
        adicionaisIds.get(p.key).set(nome, ad.rows[0].id);
      }
      for (const ingrediente of p.removiveis || []) {
        await client.query(
          'INSERT INTO produtos_ingredientes_removiveis (produto_id, ingrediente) VALUES ($1,$2)',
          [produtoId, ingrediente]
        );
      }
    }

    const productByKey = new Map(catalogo.map((p) => [p.key, p]));
    async function abrirSessao({ mesa, cliente, minutos = null, abertaEm = null, garcom }) {
      const { rows } = await client.query(
        `INSERT INTO mesa_sessoes (mesa_id, aberta_em, status, cliente_nome, garcom_responsavel_id)
         SELECT id, $2::timestamptz, 'aberta', $3, $4 FROM mesas WHERE numero=$1 RETURNING id`,
        [mesa, abertaEm || minutosAntes(minutos || 0), cliente, garcom.id]
      );
      if (!rows[0]) throw new Error(`Mesa ${mesa} não encontrada`);
      await client.query("UPDATE mesas SET status='ocupada' WHERE numero=$1", [mesa]);
      return rows[0].id;
    }

    async function inserirPedido(sessaoId, { criadoEm, cliente, observacao, itens, origem = 'cliente', garcom }) {
      const temPendencia = itens.some((i) => ['recebido', 'em_producao'].includes(i.status));
      const todosEntregues = itens.every((i) => i.status === 'entregue');
      const pedidoStatus = todosEntregues ? 'entregue' : temPendencia ? 'em_producao' : 'concluido';
      const { rows } = await client.query(
        `INSERT INTO pedidos
          (sessao_id, criado_em, status, observacao_geral, cliente_nome,
           garcom_id, garcom_nome, garcom_registrou_id, origem_pedido, sincronizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$2) RETURNING id`,
        [sessaoId, criadoEm, pedidoStatus, observacao || null, cliente,
          garcom.id, garcom.nome, origem === 'garcom' ? garcom.id : null, origem]
      );
      const pedidoId = rows[0].id;
      let totalBruto = 0;
      let totalEntregue = 0;
      for (const item of itens) {
        const p = productByKey.get(item.key);
        if (!p) throw new Error(`Produto de demonstração não definido: ${item.key}`);
        const produtoId = produtoIds.get(item.key);
        const qtd = item.qtd || 1;
        const preco = Number(p.preco);
        const extras = (item.extras || []).map((nome) => {
          const id = adicionaisIds.get(item.key).get(nome);
          if (!id) throw new Error(`Adicional "${nome}" não existe para ${item.key}`);
          return { id, nome, preco: Number((p.adicionais || []).find((a) => a[0] === nome)[1]) };
        });
        const meta = {};
        if (['em_producao', 'concluido', 'aceito', 'retirado', 'entregue'].includes(item.status)) {
          meta.iniciado = new Date(new Date(criadoEm).getTime() + 2 * 60_000);
          meta.preparadoPor = p.setor === 'bar' ? staffIds.bar : staffIds.cozinha;
        }
        if (['concluido', 'aceito', 'retirado', 'entregue'].includes(item.status)) {
          meta.pronto = new Date(new Date(criadoEm).getTime() + 8 * 60_000);
        }
        if (['aceito', 'retirado', 'entregue'].includes(item.status)) {
          meta.aceito = new Date(new Date(criadoEm).getTime() + 10 * 60_000);
          meta.aceitoPor = garcons['Ana Ribeiro'].id;
        }
        if (['retirado', 'entregue'].includes(item.status)) {
          meta.retirado = new Date(new Date(criadoEm).getTime() + 12 * 60_000);
          meta.retiradoPor = garcons['Ana Ribeiro'].id;
        }
        if (item.status === 'entregue') {
          meta.entregue = new Date(new Date(criadoEm).getTime() + 15 * 60_000);
          meta.entreguePor = garcons['Ana Ribeiro'].id;
        }
        const { rows: itemRows } = await client.query(
          `INSERT INTO itens_pedido
            (pedido_id, produto_id, quantidade, preco_unitario, ponto_carne,
             observacao, status, setor, iniciado_em, pronto_em, preparado_por_staff_id,
             aceito_por_id, aceito_em, retirado_por_id, retirado_em, entregue_por_id, entregue_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           RETURNING id`,
          [pedidoId, produtoId, qtd, preco, item.ponto || null, item.observacao || null,
            item.status, p.setor, meta.iniciado || null, meta.pronto || null, meta.preparadoPor || null,
            meta.aceitoPor || null, meta.aceito || null, meta.retiradoPor || null, meta.retirado || null,
            meta.entreguePor || null, meta.entregue || null]
        );
        const itemId = itemRows[0].id;
        for (const extra of extras) {
          await client.query(
            'INSERT INTO itens_pedido_adicionais (item_pedido_id, adicional_id, preco_unitario) VALUES ($1,$2,$3)',
            [itemId, extra.id, extra.preco]
          );
        }
        for (const nome of item.removidos || []) {
          if (!(p.removiveis || []).includes(nome)) throw new Error(`Remoção "${nome}" não permitida em ${item.key}`);
          await client.query(
            'INSERT INTO itens_pedido_remocoes (item_pedido_id, ingrediente) VALUES ($1,$2)', [itemId, nome]
          );
        }
        const linha = q((preco + extras.reduce((s, e) => s + e.preco, 0)) * qtd);
        totalBruto += linha;
        if (item.status === 'entregue') totalEntregue += linha;
      }
      return { pedidoId, totalBruto: q(totalBruto), totalEntregue: q(totalEntregue) };
    }

    async function inserirPagamento(sessaoId, valor, forma, criadoEm, operador = 'Camila — caixa') {
      await client.query(
        `INSERT INTO sessao_pagamentos (sessao_id, valor, forma_pagamento, criado_em, operador_nome, operador_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [sessaoId, q(valor), forma, criadoEm, operador, staffIds.caixa]
      );
    }

    async function fecharDadosSessao(sessaoId, { abertaEm, fechadaEm, itensTotais, desconto = 0, forma = 'pix', mesa }) {
      const base = q(itensTotais);
      const servico = q(base * 0.10);
      const cobrado = q(base - desconto + servico);
      await client.query(
        `UPDATE mesa_sessoes SET aberta_em=$2, fechada_em=$3, status='fechada',
           valor_total=$4, desconto=$5, taxa_servico=$6, valor_cobrado=$7, forma_pagamento=$8
         WHERE id=$1`,
        [sessaoId, abertaEm, fechadaEm, base, desconto, servico, cobrado, forma]
      );
      await client.query("UPDATE mesas SET status='livre' WHERE numero=$1", [mesa]);
      if (forma === 'dividido') {
        const parte1 = q(cobrado * 0.57);
        await inserirPagamento(sessaoId, parte1, 'pix', fechadaEm, 'Camila — caixa');
        await inserirPagamento(sessaoId, q(cobrado - parte1), 'cartao_debito', fechadaEm, 'Camila — caixa');
      } else {
        await inserirPagamento(sessaoId, cobrado, forma, fechadaEm, 'Camila — caixa');
      }
      return { base, desconto: q(desconto), servico, cobrado };
    }

    // Pedidos ativos: estados diferentes por item, notas de preparo, adicionais,
    // praça e responsável. São as fontes reais das três filas operacionais.
    const sessao3 = await abrirSessao({ mesa: 3, cliente: 'Mariana Alves', minutos: 42, garcom: garcons['Ana Ribeiro'] });
    await inserirPedido(sessao3, {
      criadoEm: minutosAntes(9), cliente: 'Mariana Alves', observacao: 'Se possível, trazer a bebida antes dos lanches.', garcom: garcons['Ana Ribeiro'],
      itens: [
        { key: 'xbacon', status: 'em_producao', ponto: 'AO_PONTO', extras: ['Cheddar extra'], removidos: ['Cebola'], observacao: 'Sem cebola; maionese à parte.' },
      ],
    });
    await inserirPedido(sessao3, {
      criadoEm: minutosAntes(18), cliente: 'Mariana Alves', observacao: 'Molho da casa à parte.', garcom: garcons['Ana Ribeiro'],
      itens: [{ key: 'batata', status: 'recebido' }],
    });
    await inserirPedido(sessao3, {
      criadoEm: minutosAntes(6), cliente: 'Mariana Alves', observacao: null, garcom: garcons['Ana Ribeiro'],
      itens: [{ key: 'chopp-300', status: 'em_producao', qtd: 2 }],
    });

    const sessao7 = await abrirSessao({ mesa: 7, cliente: 'Rafael Costa', minutos: 68, garcom: garcons['Lucas Ferreira'] });
    await inserirPedido(sessao7, {
      criadoEm: minutosAntes(12), cliente: 'Rafael Costa', observacao: 'Por favor, separar os pastéis em dois pratos.', garcom: garcons['Lucas Ferreira'],
      itens: [
        { key: 'pastel-carne', status: 'recebido', qtd: 2 },
        { key: 'suco-maracuja', status: 'recebido', extras: ['Com leite'] },
        { key: 'churros', status: 'concluido' },
        { key: 'chopp-ipa', status: 'concluido' },
      ],
    });

    const sessao9 = await abrirSessao({ mesa: 9, cliente: 'Bianca Moreira', minutos: 96, garcom: garcons['Ana Ribeiro'] });
    const p9a = await inserirPedido(sessao9, {
      criadoEm: minutosAntes(62), cliente: 'Bianca Moreira', observacao: 'Conta dividida. Uma pessoa ainda está escolhendo.', garcom: garcons['Ana Ribeiro'],
      itens: [
        { key: 'xsalada', status: 'entregue', ponto: 'BEM_PASSADO', observacao: 'Sem tomate.' },
        { key: 'refri', status: 'entregue', extras: ['Coca-Cola'] },
        { key: 'batata', status: 'aceito' },
      ],
    });
    const s9Total = q(p9a.totalEntregue);
    await inserirPagamento(sessao9, 20.00, 'pix', minutosAntes(8));
    await client.query('UPDATE mesa_sessoes SET valor_total=$2, pix_informado_em=$3 WHERE id=$1', [sessao9, s9Total, minutosAntes(5)]);
    await client.query(
      `INSERT INTO pix_avisos (sessao_id, pedido_id, valor, cliente_nome, status, criado_em)
       VALUES ($1,$2,$3,$4,'pendente',$5)`,
      [sessao9, p9a.pedidoId, q(Math.max(5, s9Total - 20)), 'Bianca Moreira', minutosAntes(5)]
    );

    const sessao12 = await abrirSessao({ mesa: 12, cliente: 'João Pedro Lima', minutos: 34, garcom: garcons['Lucas Ferreira'] });
    const p12 = await inserirPedido(sessao12, {
      criadoEm: minutosAntes(27), cliente: 'João Pedro Lima', observacao: 'Um lanche sem picles, por favor.', garcom: garcons['Lucas Ferreira'],
      itens: [
        { key: 'smash', status: 'concluido', ponto: 'AO_PONTO', extras: ['Bacon extra'] },
        { key: 'chopp-500', status: 'retirado', qtd: 2 },
      ],
    });
    await inserirPedido(sessao12, {
      criadoEm: minutosAntes(5), cliente: 'João Pedro Lima', observacao: null, garcom: garcons['Lucas Ferreira'],
      itens: [{ key: 'brownie', status: 'recebido' }],
    });
    await client.query('UPDATE mesa_sessoes SET valor_total=$2 WHERE id=$1', [sessao12, p12.totalEntregue]);

    const sessao16 = await abrirSessao({ mesa: 16, cliente: 'Camila Ferreira', minutos: 51, garcom: garcons['Ana Ribeiro'] });
    const p16 = await inserirPedido(sessao16, {
      criadoEm: minutosAntes(38), cliente: 'Camila Ferreira', observacao: 'A limonada vai sem açúcar.', garcom: garcons['Ana Ribeiro'],
      itens: [
        { key: 'frango', status: 'entregue', extras: ['Cheddar extra'] },
        { key: 'limonada', status: 'entregue' },
      ],
    });
    await inserirPedido(sessao16, {
      criadoEm: minutosAntes(7), cliente: 'Camila Ferreira', observacao: 'Sem açúcar, por favor.', garcom: garcons['Ana Ribeiro'],
      itens: [{ key: 'pastel-queijo', status: 'em_producao' }],
    });
    await inserirPagamento(sessao16, 24.00, 'cartao_debito', minutosAntes(7));
    await client.query('UPDATE mesa_sessoes SET valor_total=$2 WHERE id=$1', [sessao16, p16.totalEntregue]);

    // Mesa da captura do cliente: cardápio real e comanda já com consumo
    // entregue; os cliques de adicionar no script de captura não enviam pedido.
    const sessao18 = await abrirSessao({ mesa: 18, cliente: 'Luiza Martins', minutos: 12, garcom: garcons['Lucas Ferreira'] });
    const p18 = await inserirPedido(sessao18, {
      criadoEm: minutosAntes(10), cliente: 'Luiza Martins', observacao: 'Pedido de demonstração.', garcom: garcons['Lucas Ferreira'],
      itens: [
        { key: 'pastel-frango', status: 'entregue' },
        { key: 'suco-laranja', status: 'entregue' },
      ],
    });
    await client.query('UPDATE mesa_sessoes SET valor_total=$2 WHERE id=$1', [sessao18, p18.totalEntregue]);

    // Histórico de sete dias: totais irregulares e horários compatíveis com
    // almoço/jantar. As fotos/nomes vêm todos do cardápio acima.
    const historico = [
      { dia: 0, hora: 12, min: 12, mesa: 1, cliente: 'Fernanda Souza', keys: ['xbacon', 'suco-laranja'], desconto: 0, forma: 'pix' },
      { dia: 0, hora: 13, min: 5, mesa: 2, cliente: 'Pedro Henrique', keys: ['pastel-carne', 'batata', 'refri'], desconto: 3.50, forma: 'cartao_debito' },
      { dia: 1, hora: 12, min: 24, mesa: 4, cliente: 'Marcos Vieira', keys: ['smash', 'chopp-500'], desconto: 0, forma: 'dinheiro' },
      { dia: 1, hora: 19, min: 36, mesa: 5, cliente: 'Isabela Nunes', keys: ['frango', 'onion', 'chopp-ipa'], desconto: 5.00, forma: 'dividido' },
      { dia: 2, hora: 12, min: 8, mesa: 6, cliente: 'Gabriel Martins', keys: ['xsalada', 'batata', 'agua'], desconto: 0, forma: 'cartao_credito' },
      { dia: 2, hora: 20, min: 2, mesa: 8, cliente: 'Aline Rocha', keys: ['veggie', 'limonada', 'brownie'], desconto: 4.50, forma: 'pix' },
      { dia: 3, hora: 12, min: 31, mesa: 10, cliente: 'Bruno Almeida', keys: ['pastel-frango', 'suco-maracuja', 'churros'], desconto: 0, forma: 'pix' },
      { dia: 3, hora: 19, min: 18, mesa: 11, cliente: 'Letícia Ramos', keys: ['xbacon', 'batata', 'chopp-300', 'brownie'], desconto: 7.00, forma: 'dividido' },
      { dia: 4, hora: 13, min: 14, mesa: 13, cliente: 'Diego Cardoso', keys: ['smash', 'refri', 'petit'], desconto: 0, forma: 'cartao_debito' },
      { dia: 5, hora: 12, min: 19, mesa: 14, cliente: 'Priscila Mendes', keys: ['frango', 'mandioca', 'suco-laranja'], desconto: 2.50, forma: 'dinheiro' },
      { dia: 5, hora: 19, min: 47, mesa: 15, cliente: 'André Luiz', keys: ['xbacon', 'chopp-500', 'onion', 'churros'], desconto: 6.00, forma: 'pix' },
      { dia: 6, hora: 12, min: 41, mesa: 17, cliente: 'Juliana Lopes', keys: ['xsalada', 'pastel-queijo', 'limonada'], desconto: 0, forma: 'cartao_credito' },
      { dia: 6, hora: 20, min: 11, mesa: 1, cliente: 'Fábio Teixeira', keys: ['smash', 'chopp-ipa', 'brownie'], desconto: 8.50, forma: 'dividido' },
    ];

    for (const venda of historico) {
      const abertaEm = dataLocalIso(venda.dia, Math.max(0, venda.hora - 1), venda.min);
      const pedidoEm = dataLocalIso(venda.dia, venda.hora, Math.max(0, venda.min - 12));
      const fechadaEm = dataLocalIso(venda.dia, venda.hora, Math.min(59, venda.min + 37));
      const sessaoId = await abrirSessao({ mesa: venda.mesa, cliente: venda.cliente, abertaEm, garcom: garcons['Ana Ribeiro'] });
      const itens = venda.keys.map((key, idx) => ({
        key,
        status: 'entregue',
        ponto: ['xbacon', 'smash', 'xsalada'].includes(key) ? (idx % 2 ? 'BEM_PASSADO' : 'AO_PONTO') : undefined,
        extras: key === 'xbacon' && idx % 2 === 0 ? ['Cheddar extra'] : [],
      }));
      const pedido = await inserirPedido(sessaoId, {
        criadoEm: pedidoEm, cliente: venda.cliente,
        observacao: venda.dia % 2 ? 'Comanda encerrada no caixa.' : null,
        garcom: garcons['Ana Ribeiro'], itens,
      });
      const resumo = await fecharDadosSessao(sessaoId, {
        abertaEm, fechadaEm, itensTotais: pedido.totalBruto, desconto: venda.desconto,
        forma: venda.forma, mesa: venda.mesa,
      });
      // Forçar os pedidos históricos e itens consistentes com o fechamento.
      if (pedido.totalEntregue !== pedido.totalBruto) throw new Error('Sessão histórica contém item não entregue.');
      if (resumo.cobrado <= 0) throw new Error('Sessão histórica não tem valor cobrável.');
    }

    await client.query('COMMIT');

    const resumo = await client.query(`
      SELECT
        (SELECT count(*)::int FROM categorias) AS categorias,
        (SELECT count(*)::int FROM produtos) AS produtos,
        (SELECT count(*)::int FROM mesas) AS mesas,
        (SELECT count(*)::int FROM garcons WHERE ativo) AS garcons,
        (SELECT count(*)::int FROM mesa_sessoes WHERE status='aberta') AS abertas,
        (SELECT count(*)::int FROM mesa_sessoes WHERE status='fechada') AS fechadas,
        (SELECT count(*)::int FROM itens_pedido WHERE status='recebido') AS aguardando,
        (SELECT count(*)::int FROM itens_pedido WHERE status='em_producao') AS preparo,
        (SELECT count(*)::int FROM itens_pedido WHERE status='concluido') AS prontos,
        (SELECT count(*)::int FROM itens_pedido WHERE status='entregue') AS entregues,
        (SELECT count(*)::int FROM pix_avisos WHERE status='pendente') AS pix_pendente
    `);
    const r = resumo.rows[0];
    console.log(`Seed local pronto: ${r.categorias} categorias, ${r.produtos} produtos, ${r.mesas} mesas, ${r.garcons} garçons.`);
    console.log(`Comandas: ${r.abertas} abertas (com pagamento parcial/PIX pendente), ${r.fechadas} fechadas nos últimos dias.`);
    console.log(`Itens por estado: ${r.aguardando} aguardando, ${r.preparo} em preparo, ${r.prontos} prontos, ${r.entregues} entregues.`);
    console.log(`Contas: admin, cozinha, bar e caixa. Senhas de demonstração somente no .env local (não foram impressas).`);
    console.log('Tokens de mesa/garçom não são escritos no log; o script de captura os consulta no banco de teste.');
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Falha no seed de apresentação:', erro.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
    // db/auth carrega um pool auxiliar durante hashSenha; encerra-o em CLI.
    await require('../db/pool').end().catch(() => {});
  }
}

main().catch((erro) => {
  console.error(`Falha no seed de apresentação: ${erro.message}`);
  process.exit(1);
});
