// WEAPON CATALOG + LIFECYCLE REGRESSION — asserts definition integrity, monotonic L1→L5 scaling,
// evolution recipe validity, per-character starter seeding (no weaponless / no evolution-at-start),
// and runtime create→fire→damage→reset→2nd-run for the legacy 42-weapon catalog + Build-Engine seed.
// Run: node tools/qa/weapon_catalog_lifecycle_regression.mjs   (exit 1 on failure)
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(path.join(HERE, 'headless-env.mjs'));
installEnv();
let _un = muteConsole();
const wc = await import(path.resolve(HERE, '../../js/game/WeaponCatalog.js'));
const { Game } = await import(path.resolve(HERE, '../../js/game/Game.js'));
let Enemy = null; try { Enemy = (await import(path.resolve(HERE, '../../js/entities/Enemy.js'))).Enemy; } catch (_) {}
_un();

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

const D = wc.WEAPON_DEFS;
const base = wc.getAllBaseWeapons();
const evos = wc.getAllEvolutions();
const recipes = wc.EVOLUTION_RECIPES;
const FIELDS = ['damage', 'cooldown', 'aoeRadius', 'speed', 'piercing'];
const CHARS = ['skeleton_warrior','taekwondo_girl','cyber_arm_hero','brawler_warrior','assassin_clone','japan_phasewalker','euclid_vector','oni_cataclysm_protocol','eddie','dimis_kickboxer'];

console.log('═══ WEAPON CATALOG + LIFECYCLE REGRESSION ═══\n── catalog shape ──');
T('42 weapon defs (9 base + 33 evolution)', () => (Object.keys(D).length === 42 && base.length === 9 && evos.length === 33) || `defs=${Object.keys(D).length} base=${base.length} evo=${evos.length}`);
T('33 evolution recipes', () => recipes.length === 33 || `recipes=${recipes.length}`);

console.log('\n── definition integrity ──');
T('κάθε weapon έχει πλήρη baseStats (5 αριθμητικά πεδία)', () => {
  const bad = Object.values(D).filter(w => !w.baseStats || FIELDS.some(f => typeof w.baseStats[f] !== 'number'));
  return bad.length === 0 || 'missing: ' + bad.map(w => w.id).slice(0, 6).join(',');
});
T('κάθε weapon έχει id, name, behavior/kind', () => {
  const bad = Object.values(D).filter(w => !w.id || !w.name || (!w.behavior && !w.kind));
  return bad.length === 0 || 'bad: ' + bad.map(w => w.id).slice(0, 6).join(',');
});
T('κάθε base weapon έχει character (starter ownership)', () => {
  const bad = base.filter(w => !w.character);
  return bad.length === 0 || 'no-char: ' + bad.map(w => w.id).join(',');
});
T('κάθε evolution ξέρει τα 2 ingredients (def.evolvedFrom Ή recipe.ingredients)', () => {
  const recByResult = new Map(recipes.map(r => [r.result, r]));
  const bad = evos.filter(e => {
    if (!e.isEvolution) return true;
    const fromDef = Array.isArray(e.evolvedFrom) && e.evolvedFrom.length >= 2;
    const r = recByResult.get(e.id);
    const fromRecipe = r && Array.isArray(r.ingredients) && r.ingredients.length >= 2;
    return !fromDef && !fromRecipe;
  });
  return bad.length === 0 || 'no-ingredients: ' + bad.map(w => w.id).slice(0, 6).join(',');
});

console.log('\n── monotonic L1→L5 scaling (κάθε level ορατά διαφορετικό) ──');
T('damage αυστηρά αύξουσα L1<L2<L3<L4<L5 για ΟΛΑ τα 42', () => {
  const bad = Object.values(D).filter(w => { const s = [1,2,3,4,5].map(l => wc.getWeaponStatsAtLevel(w.id, l)?.damage); return s.some((v,i)=>i>0 && !(v>s[i-1])); });
  return bad.length === 0 || 'non-monotonic: ' + bad.map(w=>w.id).slice(0,6).join(',');
});
T('cooldown μη-αύξουσα και L5<L1 για ΟΛΑ τα 42', () => {
  const bad = Object.values(D).filter(w => { const s = [1,2,3,4,5].map(l => wc.getWeaponStatsAtLevel(w.id, l)?.cooldown); return !(s[4] < s[0]) || s.some((v,i)=>i>0 && v>s[i-1]+1e-9); });
  return bad.length === 0 || 'bad cd: ' + bad.map(w=>w.id).slice(0,6).join(',');
});
T('L5 damage = ~1.75× L1 (LEVEL_SCALING τηρείται)', () => {
  const w = base[0]; const s1 = wc.getWeaponStatsAtLevel(w.id,1).damage, s5 = wc.getWeaponStatsAtLevel(w.id,5).damage;
  return Math.abs(s5 - Math.round(s1*1.75)) <= 1 || `${w.id} ${s1}->${s5}`;
});

console.log('\n── evolution recipe validity ──');
T('κάθε recipe.result είναι πραγματικό evolution def', () => {
  const bad = recipes.filter(r => { const d = wc.getWeaponDef(r.result); return !d || !d.isEvolution; });
  return bad.length === 0 || 'bad results: ' + bad.map(r=>r.result).slice(0,6).join(',');
});
T('κάθε recipe.ingredient είναι πραγματικό BASE weapon (όχι evolution)', () => {
  const bad = [];
  for (const r of recipes) for (const ing of (r.ingredients||[])) { const d = wc.getWeaponDef(ing); if (!d || d.isEvolution) bad.push(r.result+'<-'+ing); }
  return bad.length === 0 || bad.slice(0,6).join(',');
});
T('κάθε evolution έχει τουλάχιστον ένα recipe', () => {
  const rr = new Set(recipes.map(r => r.result));
  const bad = evos.filter(e => !rr.has(e.id));
  return bad.length === 0 || 'no-recipe: ' + bad.map(e=>e.id).slice(0,6).join(',');
});
T('evolution ορατά διαφορετικό vs base L5 (dmg ή aoe ή pierce ή behavior) ≥30/33', () => {
  let diff = 0;
  for (const r of recipes) {
    const evo = wc.getWeaponDef(r.result); if (!evo) continue;
    let bDmg=0,bAoe=0,bPierce=0; const bBeh = new Set();
    for (const ing of r.ingredients) { const s5 = wc.getWeaponStatsAtLevel(ing,5); const d = wc.getWeaponDef(ing);
      if (s5) { bDmg=Math.max(bDmg,s5.damage); bAoe=Math.max(bAoe,s5.aoeRadius); bPierce=Math.max(bPierce,s5.piercing||1); } if (d?.behavior) bBeh.add(d.behavior); }
    const e = evo.baseStats;
    if (e.damage>bDmg || e.aoeRadius>=bAoe*1.2 || (e.piercing||1)>bPierce || (evo.behavior && !bBeh.has(evo.behavior))) diff++;
  }
  return diff >= 30 || `only ${diff}/33 visibly different`;
});

console.log('\n── per-character starter seeding (create) ──');
T('9 legacy χαρακτήρες → BASE weapon (όχι evolution, όχι null)', () => {
  const legacy = CHARS.filter(c => c !== 'dimis_kickboxer');
  const bad = legacy.filter(c => { const w = wc.getWeaponForCharacter(c); return !w || w.isEvolution; });
  return bad.length === 0 || 'bad: ' + bad.join(',');
});
T('starter ΠΟΤΕ δεν είναι evolution (κανένας δεν ξεκινά σε evolution)', () => {
  const bad = CHARS.map(c => wc.getWeaponForCharacter(c)).filter(w => w && w.isEvolution);
  return bad.length === 0 || 'evo-start: ' + bad.map(w=>w.id).join(',');
});

console.log('\n── runtime lifecycle (create→fire→damage→reset→2nd run) ──');
const seed = {}, fires = {}, resets = {}, second = {};
for (const ch of CHARS) {
  const g = new Game(); g.audio = null;
  let dmg = 0; let unhook = null;
  if (Enemy?.prototype?.takeHit) { const o = Enemy.prototype.takeHit; Enemy.prototype.takeHit = function (d, gm) { dmg += (+d||0); return o.call(this, d, gm); }; unhook = () => { Enemy.prototype.takeHit = o; }; }
  const u = muteConsole(); g.selectedCharacter = ch; g.gameState = 'playing'; g.reset(); g._enterEndless(); u();
  const starter = [...(g._weaponLevels?.keys?.()||[]), ...(g.buildEngine?.weapons?.keys?.()||[])][0] || null;
  seed[ch] = !!starter;
  const d0 = dmg;
  const IN = (k)=>({keys:k||new Set(),mousePos:{x:0,y:0},mouseDown:false});
  for (let f=0; f<5*60; f++){ if (g.upgradeUI){try{g.selectUpgrade(0);}catch(_){g.upgradeUI=null;}} if (g.player)g.player.hp=g.player.maxHp; try{g.update(1/60, IN(new Set(['d'])));}catch(_){} }
  fires[ch] = (dmg - d0) > 0;
  const uu = muteConsole(); g.reset(); uu();
  resets[ch] = (g._weaponLevels?.size||0) + (g.buildEngine?.weapons?.size||0) <= 1;
  const uu2 = muteConsole(); g.selectedCharacter = ch; g.gameState='playing'; g._enterEndless(); uu2();
  for (let f=0; f<30; f++){ if (g.player)g.player.hp=g.player.maxHp; try{g.update(1/60, IN(new Set(['d'])));}catch(_){} }
  second[ch] = [...(g._weaponLevels?.keys?.()||[]), ...(g.buildEngine?.weapons?.keys?.()||[])].length > 0;
  if (unhook) unhook();
}
T('10/10 χαρακτήρες seed-άρουν starter (κανένας weaponless)', () => { const bad = CHARS.filter(c => !seed[c]); return bad.length === 0 || 'weaponless: ' + bad.join(','); });
T('10/10 το όπλο πυροβολεί και κάνει damage στο run', () => { const bad = CHARS.filter(c => !fires[c]); return bad.length === 0 || 'no-dmg: ' + bad.join(','); });
T('10/10 reset καθαρίζει τα weapons', () => { const bad = CHARS.filter(c => !resets[c]); return bad.length === 0 || 'not-cleared: ' + bad.join(','); });
T('10/10 2ο run re-seed-άρει starter', () => { const bad = CHARS.filter(c => !second[c]); return bad.length === 0 || 'no-reseed: ' + bad.join(','); });

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
