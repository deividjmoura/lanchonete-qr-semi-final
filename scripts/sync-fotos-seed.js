/**
 * Sincroniza as fotos demo para produtos existentes sem apagar fotos personalizadas.
 *
 * Padrão: somente simulação (dry-run), sem gravar no banco.
 * Aplicar: node scripts/sync-fotos-seed.js --apply
 *
 * Atualiza somente foto_url vazia, data-URL antiga ou foto já pertencente a
 * /assets/demo/ que não corresponde ao produto. URLs/uploads personalizados
 * são preservados. Nunca remove produtos, pedidos, sessões ou pagamentos.
 */
require('dotenv').config();
const pool = require('../db/pool');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Mesma lógica do demoPhoto do front (public/js/mesa-app-a.js) */
function fotoPara(nomeRaw, catRaw) {
  const nome = norm(nomeRaw);
  const cat = norm(catRaw);

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
  if (/natural de frango|sanduiche natural|sanduíche natural/.test(nome))
    return '/assets/demo/natural.webp';
  if (/sandu|x-|burger|hamb/.test(nome) || /sandu/.test(cat)) return '/assets/demo/burger.webp';

  if (/onion|anel/.test(nome)) return '/assets/demo/onion.webp';
  if (/batata/.test(nome)) return '/assets/demo/fries.webp';
  if (/passarinho/.test(nome)) return '/assets/demo/chicken.webp';
  if (/polenta/.test(nome)) return '/assets/demo/polenta.webp';
  if (/mandioca|aipim/.test(nome)) return '/assets/demo/mandioca.webp';

  if (/suco/.test(nome)) return '/assets/demo/juice.webp';
  if (/milk\s*shake|milkshake|shake/.test(nome)) return '/assets/demo/milkshake.webp';
  if (/agua de coco|\bcoco\b/.test(nome)) return '/assets/demo/water.webp';
  if (/\bagua\b/.test(nome)) return '/assets/demo/water.webp';
  if (/refrigerante|refri|coca|cola/.test(nome)) return '/assets/demo/soda-cola.webp';
  if (/caipi/.test(nome)) return '/assets/demo/caipi.webp';
  if (/red\s*bull|monster|tnt|baly|energ/.test(nome)) return '/assets/demo/energy.webp';
  if (/long\s*neck|cerveja|chopp|pilsen|malte|\bipa\b|balde/.test(nome))
    return '/assets/demo/beer.webp';
  if (/gin|moscow|mule|vodka|drink/.test(nome)) return '/assets/demo/cocktail.webp';

  if (/churros/.test(nome)) return '/assets/demo/churros.webp';
  if (/brownie/.test(nome)) return '/assets/demo/brownie.webp';
  if (/petit|gateau/.test(nome)) return '/assets/demo/petit.webp';
  if (/sobremesa|sorvete|doce/.test(nome) || /sobremesa/.test(cat))
    return '/assets/demo/dessert.webp';

  if (/hot\s*dog|dog/.test(cat)) return '/assets/demo/dog-classic.webp';
  if (/sandu/.test(cat)) return '/assets/demo/burger.webp';
  if (/porc/.test(cat)) return '/assets/demo/fries.webp';
  if (/cerveja|chopp|bar/.test(cat)) return '/assets/demo/beer.webp';
  if (/drink/.test(cat)) return '/assets/demo/cocktail.webp';
  if (/bebida/.test(cat)) return '/assets/demo/drink.webp';
  if (/combo/.test(cat)) return '/assets/demo/combo.webp';
  return '/assets/demo/burger.webp';
}


function resumoUrl(url) {
  if (!url) return '(vazio)';
  if (String(url).startsWith('data:')) return 'data-URL';
  if (String(url).length > 70) return String(url).slice(0, 67) + '…';
  return String(url);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { rows } = await pool.query(
    `SELECT p.id, p.nome, p.foto_url, c.nome AS categoria
       FROM produtos p
       JOIN categorias c ON c.id = p.categoria_id
      ORDER BY c.ordem, p.nome`
  );
  let updated = 0;
  let preserved = 0;
  console.log(`\nFotos no cardápio: ${rows.length} produto(s). Modo: ${apply ? 'APLICAR' : 'SIMULAÇÃO'}\n`);

  for (const row of rows) {
    const current = String(row.foto_url || '');
    const target = fotoPara(row.nome, row.categoria);
    const managed = !current || current.startsWith('data:') || current.startsWith('/assets/demo/');
    if (!managed) {
      preserved++;
      console.log(`  · #${row.id} ${row.nome}: foto personalizada preservada (${resumoUrl(current)})`);
      continue;
    }
    if (current === target) {
      console.log(`  = #${row.id} ${row.nome}: ok (${target})`);
      continue;
    }
    updated++;
    console.log(`  ${apply ? '✓' : '🔎'} #${row.id} ${row.nome}: ${resumoUrl(current)} → ${target}`);
    if (apply) {
      await pool.query('UPDATE produtos SET foto_url = $1 WHERE id = $2', [target, row.id]);
    }
  }
  console.log(`\n${apply ? 'Concluído' : 'Simulação concluída'}: ${updated} foto(s) ${apply ? 'atualizadas' : 'seriam atualizadas'}; ${preserved} foto(s) personalizada(s) preservada(s).\n`);
  if (!apply) console.log('Para gravar as alterações listadas, execute: npm run fotos:sync -- --apply');
}

main().catch((error) => {
  console.error('Falha ao sincronizar fotos:', error.message || error);
  process.exitCode = 1;
}).finally(() => pool.end());
