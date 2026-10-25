// Popula categorias/produtos/adicionais a partir do data/db.json atual.
// Idempotente: se já existir categoria, aborta cardápio sem FORCE_SEED.
// Mesas 1..NUM_MESAS sempre garantidas (sem apagar registros existentes).
// Compatível com schema simples e com V3 (estabelecimento_id).
//
// Uso: node db/seed.js
//      FORCE_SEED=1 node db/seed.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const { garantirStaffSeed } = require('./auth');

const DB_JSON = path.join(__dirname, '..', 'data', 'db.json');
// Capacidade operacional configurável sem apagar mesas ou pedidos existentes.
// Default conservador de 70 mesas; pode ser ajustado por NUM_MESAS (1..200).
const numeroConfigurado = Number(process.env.NUM_MESAS || 70);
if (!Number.isSafeInteger(numeroConfigurado) || numeroConfigurado < 1 || numeroConfigurado > 200) {
  throw new Error('NUM_MESAS deve ser um inteiro entre 1 e 200');
}
const NUM_MESAS = numeroConfigurado;

function normFoto(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

// Reutiliza o conjunto de imagens do cardápio Lanchonete QR.
// Caminhos relativos ao public/; mantidos também em scripts/fix-fotos-cardapio.js.
function fotoPara(nomeRaw, catRaw) {
  const nome = normFoto(nomeRaw);
  const cat = normFoto(catRaw);
  if (/\bcombo\b/.test(nome)) return '/assets/demo/combo.webp';
  if (/dog/.test(nome) && /bacon/.test(nome)) return '/assets/demo/dog-bacon.webp';
  if (/dog/.test(nome) && /especial/.test(nome)) return '/assets/demo/dog-especial.webp';
  if (/dog/.test(nome) && /(vegetariano|vegano)/.test(nome)) return '/assets/demo/dog-veg.webp';
  if (/dog/.test(nome) && /duplo/.test(nome)) return '/assets/demo/dog-duplo.webp';
  if (/dog/.test(nome) || /hot\s*dogs?/.test(cat)) return '/assets/demo/dog-classic.webp';
  if (/x-?\s*bacon|xbacon/.test(nome)) return '/assets/demo/xbacon.webp';
  if (/x-?\s*salada/.test(nome)) return '/assets/demo/salad.webp';
  if (/x-?\s*tudo/.test(nome)) return '/assets/demo/burger.webp';
  if (/frango grelhado|x-?\s*frango/.test(nome)) return '/assets/demo/chicken.webp';
  if (/misto/.test(nome)) return '/assets/demo/misto.webp';
  if (/natural de frango|sanduiche natural|sanduíche natural/.test(nome)) return '/assets/demo/natural.webp';
  if (/sandu|x-|burger|hamb/.test(nome) || /sandu/.test(cat)) return '/assets/demo/burger.webp';
  if (/onion|anel/.test(nome)) return '/assets/demo/onion.webp';
  if (/batata/.test(nome)) return '/assets/demo/fries.webp';
  if (/passarinho/.test(nome)) return '/assets/demo/chicken.webp';
  if (/polenta/.test(nome)) return '/assets/demo/polenta.webp';
  if (/mandioca|aipim|cassava/.test(nome)) return '/assets/demo/mandioca.webp';
  if (/suco/.test(nome)) return '/assets/demo/juice.webp';
  if (/milk\s*shake|milkshake|shake/.test(nome)) return '/assets/demo/milkshake.webp';
  if (/agua de coco|\bcoco\b/.test(nome)) return '/assets/demo/water.webp';
  if (/\bagua\b/.test(nome)) return '/assets/demo/water.webp';
  if (/refrigerante|refri|coca|cola|schweppes/.test(nome)) return '/assets/demo/soda-cola.webp';
  if (/caipi/.test(nome)) return '/assets/demo/caipi.webp';
  if (/red\s*bull|monster|tnt|baly|energ/.test(nome)) return '/assets/demo/energy.webp';
  if (/long\s*neck|cerveja|chopp|pilsen|malte|\bipa\b|balde|amstel|brahma|heineken|original/.test(nome))
    return '/assets/demo/beer.webp';
  if (/gin|moscow|mule|vodka|drink|aperol|martini|smirnoff|licor|tanqueray|steinhaeger|jagermeister|campari|bacardi|jack daniels|jose cuervo/.test(nome))
    return '/assets/demo/cocktail.webp';
  if (/churros/.test(nome)) return '/assets/demo/churros.webp';
  if (/brownie/.test(nome)) return '/assets/demo/brownie.webp';
  if (/petit|gateau/.test(nome)) return '/assets/demo/petit.webp';
  if (/sobremesa|sorvete|doce/.test(nome) || /sobremesa/.test(cat)) return '/assets/demo/dessert.webp';
  if (/hot\s*dog|dog/.test(cat)) return '/assets/demo/dog-classic.webp';
  if (/sandu/.test(cat)) return '/assets/demo/burger.webp';
  if (/porc/.test(cat)) return '/assets/demo/fries.webp';
  if (/cerveja|chopp|bar/.test(cat)) return '/assets/demo/beer.webp';
  if (/drink/.test(cat)) return '/assets/demo/cocktail.webp';
  if (/bebida/.test(cat)) return '/assets/demo/drink.webp';
  if (/combo/.test(cat)) return '/assets/demo/combo.webp';
  return '/assets/demo/burger.webp';
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return rows.length > 0;
}

/** Resolve o estabelecimento padrão (V3). Cria um se a tabela existir e estiver vazia. */
async function resolverEstabelecimentoId(client) {
  if (!(await tableExists(client, 'estabelecimentos'))) return null;

  const { rows } = await client.query(
    'SELECT id FROM estabelecimentos ORDER BY id ASC LIMIT 1'
  );
  if (rows.length) return rows[0].id;

  // tenta colunas comuns de um cadastro mínimo
  try {
    const ins = await client.query(
      `INSERT INTO estabelecimentos (nome) VALUES ('Major Pub') RETURNING id`
    );
    console.log('🏪 Estabelecimento "Major Pub" criado (id=' + ins.rows[0].id + ').');
    return ins.rows[0].id;
  } catch (e) {
    // schema pode exigir mais campos — tenta slug/nome
    try {
      const ins = await client.query(
        `INSERT INTO estabelecimentos (nome, slug) VALUES ('Major Pub', 'major-pub') RETURNING id`
      );
      console.log('🏪 Estabelecimento "Major Pub" criado (id=' + ins.rows[0].id + ').');
      return ins.rows[0].id;
    } catch (e2) {
      console.error('Não foi possível criar estabelecimento automaticamente:', e2.message);
      throw new Error(
        'Tabela estabelecimentos existe mas está vazia. Crie um registro e rode o seed de novo.'
      );
    }
  }
}

async function garantirMesas(client) {
  const hasEstab = await columnExists(client, 'mesas', 'estabelecimento_id');
  const estabId = hasEstab ? await resolverEstabelecimentoId(client) : null;

  // UNIQUE em (numero) só faz sentido no schema simples;
  // no multi-tenant o único costuma ser (estabelecimento_id, numero).
  if (!hasEstab) {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          WHERE t.relname = 'mesas' AND c.contype = 'u'
            AND pg_get_constraintdef(c.oid) ILIKE '%(numero)%'
        ) THEN
          BEGIN
            ALTER TABLE mesas ADD CONSTRAINT mesas_numero_key UNIQUE (numero);
          EXCEPTION WHEN duplicate_table OR duplicate_object OR unique_violation THEN
            NULL;
          END;
        END IF;
      END $$;
    `);
  }

  for (let numero = 1; numero <= NUM_MESAS; numero++) {
    if (hasEstab && estabId != null) {
      await client.query(
        `INSERT INTO mesas (numero, estabelecimento_id)
         SELECT $1::int, $2::int
         WHERE NOT EXISTS (
           SELECT 1 FROM mesas
           WHERE numero = $1::int AND estabelecimento_id = $2::int
         )`,
        [numero, estabId]
      );
    } else if (hasEstab && estabId == null) {
      throw new Error('mesas.estabelecimento_id é obrigatório, mas não há estabelecimento cadastrado.');
    } else {
      await client.query(
        `INSERT INTO mesas (numero)
         SELECT $1::int
         WHERE NOT EXISTS (SELECT 1 FROM mesas WHERE numero = $1::int)`,
        [numero]
      );
    }
  }

  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM mesas');
  console.log(
    `✅ Mesas 1–${NUM_MESAS} garantidas (total no banco: ${rows[0].n}` +
      (estabId != null ? `, estabelecimento_id=${estabId}` : '') +
      ').'
  );
  return estabId;
}


async function garantirGarcons(client) {
  const has = await tableExists(client, 'garcons');
  if (!has) return { created: false, skipped: true };
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM garcons');
  if (rows[0].n > 0) return { created: false, count: rows[0].n };
  const { rows: ins } = await client.query(
    `INSERT INTO garcons (nome, ativo) VALUES ('Garçom 1', true)
     RETURNING id, nome`
  );
  // Nunca registrar o token bearer em stdout: logs de deploy podem ser retidos/exportados.
  console.log('🧑 Garçom seed criado:', ins[0].nome);
  return { created: true, count: 1 };
}

async function run() {
  const raw = JSON.parse(fs.readFileSync(DB_JSON, 'utf8'));
  const client = await pool.connect();
  const force = process.env.FORCE_SEED === '1' || process.argv.includes('--force');

  try {
    const estabId = await garantirMesas(client);
    await garantirGarcons(client);
    const catHasEstab = await columnExists(client, 'categorias', 'estabelecimento_id');

    const { rows: existentes } = await client.query('SELECT COUNT(*)::int AS n FROM categorias');
    if (existentes[0].n > 0 && !force) {
      console.log('⚠️  Já existem categorias no banco. Seed de cardápio abortado para não duplicar.');
      console.log('   Para substituir o cardápio: FORCE_SEED=1 npm run db:seed');
      const staff = await garantirStaffSeed();
      if (staff.created) {
        console.log('👤 Staff inicial criado (admin / cozinha / caixa).');
      } else {
        console.log(`👤 Staff já existe (${staff.count} usuário(s)).`);
      }
      return;
    }

    await client.query('BEGIN');

    if (force && existentes[0].n > 0) {
      await client.query('DELETE FROM itens_pedido_adicionais');
      await client.query('DELETE FROM itens_pedido_remocoes');
      await client.query('DELETE FROM itens_pedido');
      await client.query('DELETE FROM pedidos');
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessao_pagamentos') THEN
            DELETE FROM sessao_pagamentos;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pix_avisos') THEN
            DELETE FROM pix_avisos;
          END IF;
        END $$;
      `);
      await client.query('DELETE FROM mesa_sessoes');
      await client.query('DELETE FROM adicionais');
      await client.query('DELETE FROM produtos_ingredientes_removiveis');
      await client.query('DELETE FROM produtos');
      await client.query('DELETE FROM categorias');
      console.log('🗑️  Cardápio e pedidos anteriores removidos (FORCE_SEED).');
    }

    const categoriasNomes = [...new Set(raw.menu.map((p) => p.category))];
    const categoriaIdPorNome = {};

    for (let i = 0; i < categoriasNomes.length; i++) {
      const nome = categoriasNomes[i];
      let rows;
      if (catHasEstab) {
        if (estabId == null) {
          throw new Error('categorias.estabelecimento_id existe, mas não há estabelecimento.');
        }
        ({ rows } = await client.query(
          'INSERT INTO categorias (nome, ordem, estabelecimento_id) VALUES ($1, $2, $3) RETURNING id',
          [nome, i, estabId]
        ));
      } else {
        ({ rows } = await client.query(
          'INSERT INTO categorias (nome, ordem) VALUES ($1, $2) RETURNING id',
          [nome, i]
        ));
      }
      categoriaIdPorNome[nome] = rows[0].id;
    }
    console.log(`✅ ${categoriasNomes.length} categorias inseridas.`);

    const prodHasPonto = await columnExists(client, 'produtos', 'pede_ponto_carne');
    const prodHasFoto = await columnExists(client, 'produtos', 'foto_url');

    let totalProdutos = 0;
    let totalAdicionais = 0;
    let totalRemoviveis = 0;

    for (const p of raw.menu) {
      const categoriaId = categoriaIdPorNome[p.category];
      const pedePontoCarne = Boolean(p.customization?.meatPoint);
      let rows;
      if (prodHasPonto) {
        ({ rows } = await client.query(
          `INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel, pede_ponto_carne)
           VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING id`,
          [categoriaId, p.name, p.description || null, p.price, pedePontoCarne]
        ));
      } else {
        ({ rows } = await client.query(
          `INSERT INTO produtos (categoria_id, nome, descricao, preco, disponivel)
           VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
          [categoriaId, p.name, p.description || null, p.price]
        ));
      }
      const produtoId = rows[0].id;
      if (prodHasFoto) {
        await client.query('UPDATE produtos SET foto_url = $1 WHERE id = $2', [fotoPara(p.name, p.category), produtoId]);
      }
      totalProdutos++;

      const additions = p.customization?.additions || [];
      for (const a of additions) {
        await client.query(
          'INSERT INTO adicionais (produto_id, nome, preco) VALUES ($1, $2, $3)',
          [produtoId, a.name, a.price]
        );
        totalAdicionais++;
      }

      if (await tableExists(client, 'produtos_ingredientes_removiveis')) {
        const removals = p.customization?.removals || [];
        for (const ingrediente of removals) {
          await client.query(
            'INSERT INTO produtos_ingredientes_removiveis (produto_id, ingrediente) VALUES ($1, $2)',
            [produtoId, ingrediente]
          );
          totalRemoviveis++;
        }
      }
    }

    
    try {
      const { rowCount } = await client.query(`
        UPDATE produtos p
           SET controla_estoque = TRUE,
               estoque = COALESCE(NULLIF(p.estoque, 0), 36),
               estoque_minimo = GREATEST(COALESCE(p.estoque_minimo, 0), 6)
          FROM categorias c
         WHERE p.categoria_id = c.id
           AND (
             c.nome ILIKE '%bebida%'
             OR c.nome ILIKE '%long neck%'
             OR c.nome ILIKE '%cerveja%'
             OR c.nome ILIKE '%dose%'
             OR c.nome ILIKE '%caipi%'
             OR c.nome ILIKE '%drink%'
             OR c.nome ILIKE '%refriger%'
           )
           AND (p.controla_estoque IS NOT TRUE OR p.estoque IS NULL)
      `);
      console.log(`📦 Estoque habilitado em ${rowCount} produto(s) de bebida.`);
    } catch (e) {
      console.warn('Aviso ao definir estoque de bebidas:', e.message || e);
    }

    await client.query('COMMIT');
    console.log(
      `✅ ${totalProdutos} produtos, ${totalAdicionais} adicionais e ${totalRemoviveis} ingredientes removíveis inseridos.`
    );

    const staff = await garantirStaffSeed();
    if (staff.created) {
      console.log('👤 Staff inicial criado (admin / cozinha / caixa).');
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
