/**
 * Seed de fotos de demonstração no cardápio (Unsplash, por tipo de item).
 * Uso: node scripts/seed-fotos-demo.js [--dry-run] [--force]
 */
require('dotenv').config();
const pool = require('../db/pool');

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}
const U = (id, sig = 1) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&h=640&q=75&sig=${sig}`;

const IMG = {
  agua: U('photo-1548839140-29a749e1cf4d', 1),
  refrigerante: U('photo-1629203851122-3726ecdf080e', 2),
  energetico: U('photo-1622543925917-763c34d1a486', 3),
  sucoLaranja: U('photo-1621506289937-a8e4df240d0b', 4),
  sucoMorango: U('photo-1546173159-315724a31696', 5),
  sucoMaracuja: U('photo-1600271886742-f049cd451bba', 6),
  sucoLeite: U('photo-1577805947697-89e18249d767', 7),
  cerveja: U('photo-1608270586620-248524c67de9', 8),
  longneck: U('photo-1618885472179-5e474019f2a9', 9),
  doseWhisky: U('photo-1569529465841-dfecdab7503b', 10),
  doseGin: U('photo-1514362545857-3bc16c4c7d1b', 11),
  doseTequila: U('photo-1514361892635-6b07e31e4039', 12),
  doseRum: U('photo-1514362545857-3bc16c4c7d1b', 13),
  doseGenerica: U('photo-1470337458703-46ad1756a187', 14),
  cocktail: U('photo-1536935338788-846bb9981813', 15),
  cocktailBlue: U('photo-1470337458703-46ad1756a187', 16),
  pina: U('photo-1551024709-8f23befc6f87', 17),
  aperol: U('photo-1560512823-829485b8bf24', 18),
  caipi: U('photo-1541544741938-0af808871cc0', 19),
  batata: U('photo-1573080496219-bb080dd4f877', 20),
  polenta: U('photo-1626082927389-6cd097cdc6ec', 21),
  frango: U('photo-1562967914-608f82629710', 22),
  carne: U('photo-1544025162-d76694265947', 23),
  calabresa: U('photo-1529042410759-befb1204b133', 24),
  mista: U('photo-1555939594-58d7cb561ad1', 25),
  burger: U('photo-1568901346375-23c9450c58cd', 26),
  bacon: U('photo-1553979459-d2229ba7433b', 27),
  costela: U('photo-1586190848861-99aa4a171e90', 28),
  vulcao: U('photo-1572802419229-3294c3c1c3d0', 29),
  drinkSoft: U('photo-1497534447311-7f2b4f2c8f8f', 30),
  generico: U('photo-1414235077428-338989a2e8c0', 31),
};

function fotoPara(nomeRaw, catRaw) {
  const n = norm(nomeRaw);
  const c = norm(catRaw);
  if (/vulc[aã]o|major/.test(n)) return IMG.vulcao;
  if (/costela/.test(n)) return IMG.costela;
  if (/bacon/.test(n) && (/cheese|x-?|burguer|burger|lanche/.test(n) || /lanche/.test(c))) return IMG.bacon;
  if (/cheese|burguer|burger|x-?/.test(n) || /lanche/.test(c)) return IMG.burger;
  if (/calabresa/.test(n)) return IMG.calabresa;
  if (/alcatra|isca.*carne|carne/.test(n) && /porc/.test(c)) return IMG.carne;
  if (/frango/.test(n) && /porc|isca/.test(c + n)) return IMG.frango;
  if (/mista|grelhada/.test(n)) return IMG.mista;
  if (/polenta/.test(n)) return IMG.polenta;
  if (/batata/.test(n) || /porc/.test(c)) return IMG.batata;
  if (/caipi/.test(n) || /caipi/.test(c)) return IMG.caipi;
  if (/aperol/.test(n)) return IMG.aperol;
  if (/pi[nñ]a|pina\s*colada|colada/.test(n)) return IMG.pina;
  if (/lagoa|blue\s*gin|blue/.test(n)) return IMG.cocktailBlue;
  if (/gin/.test(n) || /gin/.test(c)) return IMG.doseGin;
  if (/martini|ibiza|smirnoff cream|drink/.test(n) || /drink/.test(c)) return IMG.cocktail;
  if (/soda italiana|sem [aá]lcool/.test(n) || /sem [aá]lcool/.test(c)) return IMG.drinkSoft;
  if (/jack|red label|whisky|whiskey|label/.test(n)) return IMG.doseWhisky;
  if (/tanqueray|gin/.test(n) && /dose/.test(c)) return IMG.doseGin;
  if (/cuervo|tequila/.test(n)) return IMG.doseTequila;
  if (/bacardi|rum/.test(n)) return IMG.doseRum;
  if (/dose/.test(c) || /jagermeister|campari|licor|steinhaeger|smirnoff$/.test(n)) return IMG.doseGenerica;
  if (/long\s*neck|longneck/.test(n) || /long\s*neck/.test(c)) return IMG.longneck;
  if (/amstel|brahma|heineken|original|cerveja|chopp/.test(n) || /cerveja/.test(c)) return IMG.cerveja;
  if (/red\s*bull|energ[eé]tico/.test(n)) return IMG.energetico;
  if (/smirnoff\s*ice/.test(n)) return IMG.longneck;
  if (/suco.*laranja|laranja/.test(n) && /suco|bebida/.test(c + n)) return IMG.sucoLaranja;
  if (/morango/.test(n)) return IMG.sucoMorango;
  if (/maracuj[aá]/.test(n)) return IMG.sucoMaracuja;
  if (/polpa|leite|condensado/.test(n)) return IMG.sucoLeite;
  if (/suco/.test(n)) return IMG.sucoLaranja;
  if (/refrigerante|schweppes|t[oô]nica/.test(n)) return IMG.refrigerante;
  if (/[aá]gua/.test(n)) return IMG.agua;
  if (/bebida/.test(c)) return IMG.refrigerante;
  return IMG.generico;
}

function resumo(url) {
  if (!url) return '(vazio)';
  if (String(url).startsWith('data:')) return `data-URL ~${Math.round(String(url).length / 1024)}KB`;
  if (String(url).length > 70) return String(url).slice(0, 67) + '…';
  return String(url);
}
function isDemo(url) {
  const u = String(url || '');
  return !u || u.startsWith('data:') || u.includes('images.unsplash.com') ||
    u.startsWith('/assets/demo/') || u.includes('placeholder') || u.includes('picsum');
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const { rows } = await pool.query(
    `SELECT p.id, p.nome, p.foto_url, c.nome AS categoria
     FROM produtos p JOIN categorias c ON c.id = p.categoria_id
     ORDER BY c.ordem NULLS LAST, c.nome, p.nome`
  );
  console.log(`\n🍔 Seed fotos demo · ${rows.length} produtos\n`);
  let n = 0;
  for (const r of rows) {
    const alvo = fotoPara(r.nome, r.categoria);
    const atual = r.foto_url || '';
    if (!force && atual && !isDemo(atual) && atual !== alvo) {
      console.log(`  · #${r.id} ${r.nome} — mantida foto real`);
      continue;
    }
    if (!force && atual === alvo) {
      console.log(`  · #${r.id} ${r.nome} — já ok`);
      continue;
    }
    n += 1;
    console.log(`  ${dry ? '🔎' : '✓'} #${r.id} ${r.nome}`);
    if (!dry) await pool.query('UPDATE produtos SET foto_url = $1 WHERE id = $2', [alvo, r.id]);
  }
  console.log(dry
    ? `\n--dry-run: ${n} seriam atualizados.\n`
    : `\n✅ ${n} com foto demo. Troque no Admin quando tiver as reais.\n`);
}
main().catch((e) => { console.error('❌', e.message || e); process.exit(1); }).finally(() => pool.end());
