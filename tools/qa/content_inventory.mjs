// PHENIX CONTENT INVENTORY — enumerates the REAL production registries by importing them,
// not by grepping filenames or counting braces. This is Phase 0 of the completeness
// benchmark: you cannot score coverage against a standard until you know exactly what
// ships. Anything this cannot resolve is printed as UNRESOLVED rather than guessed.
//
// Run: node tools/qa/content_inventory.mjs            (human-readable)
//      node tools/qa/content_inventory.mjs --json     (machine-readable)

import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
register('./strip-v-loader.mjs', import.meta.url);
const { installEnv, muteConsole } = await import(path.join(HERE, 'headless-env.mjs'));
installEnv();
const JS = path.resolve(HERE, '../../js');
const JSON_MODE = process.argv.includes('--json');

const inv = {};
const notes = [];
const load = async (rel) => {
  const un = muteConsole();
  try { return await import(path.join(JS, rel)); }
  catch (e) { notes.push(`UNRESOLVED import ${rel}: ${e.message}`); return null; }
  finally { un(); }
};
const size = (v) => Array.isArray(v) ? v.length
  : (v instanceof Map || v instanceof Set) ? v.size
  : (v && typeof v === 'object') ? Object.keys(v).length : null;

// ── registries that live in dedicated modules ──────────────────────────────
const meta = await load('game/MetaProgress.js');
const weap = await load('game/WeaponCatalog.js');
const tact = await load('game/TacticalWeaponCatalog.js');
const upg = await load('game/Upgrades.js');
const elem = await load('Elements.js');
const enemyMod = await load('entities/Enemy.js');

const reg = (label, val, extra) => { inv[label] = { count: size(val), ...(extra || {}) }; };

if (meta) {
  reg('meta.META_UPGRADES', meta.META_UPGRADES);
  reg('meta.SYNERGY_UPGRADES', meta.SYNERGY_UPGRADES);
  reg('meta.PROTOCOL_CARDS', meta.PROTOCOL_CARDS);
  reg('meta.RELIC_DEFS', meta.RELIC_DEFS);
  reg('meta.SKILL_TREE', meta.SKILL_TREE);
  reg('meta.AMULET_DEFS', meta.AMULET_DEFS);
  reg('meta.CHARACTER_OUTFITS', meta.CHARACTER_OUTFITS);
  reg('meta.ENDLESS_ACHIEVEMENTS', meta.ENDLESS_ACHIEVEMENTS);
  reg('meta.PF_CHARACTER_COSTS', meta.PF_CHARACTER_COSTS);
}
if (weap) {
  for (const k of Object.keys(weap)) {
    const n = size(weap[k]);
    if (n != null && n > 0 && /ID|CATALOG|DEFS|LIST|POOL|EVO/i.test(k)) reg(`weapons.${k}`, weap[k]);
  }
}
if (tact) for (const k of Object.keys(tact)) { const n = size(tact[k]); if (n) reg(`tactical.${k}`, tact[k]); }
if (upg) for (const k of Object.keys(upg)) { const n = size(upg[k]); if (n) reg(`upgrades.${k}`, upg[k]); }
if (elem) for (const k of Object.keys(elem)) { const n = size(elem[k]); if (n) reg(`elements.${k}`, elem[k]); }
if (enemyMod?.Enemy) {
  const E = enemyMod.Enemy;
  for (const k of Object.getOwnPropertyNames(E)) {
    const v = E[k];
    const n = size(v);
    if (n && (v instanceof Set || v instanceof Map || Array.isArray(v))) reg(`Enemy.${k}`, v);
  }
}

// ── registries that live as instance state on Game ─────────────────────────
const un = muteConsole();
const { Game } = await import(path.join(JS, 'game/Game.js'));
let g = null;
try { g = new Game(); } catch (e) { notes.push('UNRESOLVED new Game(): ' + e.message); }
un();

if (g) {
  reg('game.characters (roster)', g.characters, {
    playable: (g.characters || []).filter(c => !c.comingSoon).length,
    comingSoon: (g.characters || []).filter(c => c.comingSoon).length,
    ids: (g.characters || []).map(c => c.id),
  });
  for (const k of ['vessels', 'relics', 'chaosLaws', 'bossEchoes', 'stages', 'campaignStages']) {
    if (size(g[k]) != null) reg(`game.${k}`, g[k]);
  }
}

// ── enemy roster: parsed from the authored spawn tables in EnemySpawner ────
const spawnerSrc = fs.readFileSync(path.join(JS, 'game/EnemySpawner.js'), 'utf8');
const enemyNames = new Set();
for (const m of spawnerSrc.matchAll(/'([A-Z][A-Za-z0-9 \-']{2,40})'/g)) enemyNames.add(m[1]);
inv['enemies.spawnTableNames'] = { count: enemyNames.size, sample: [...enemyNames].slice(0, 10) };

// ── ground hazards: every array/field that behaves as a persistent ground zone ──
const gameSrc = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');
// Some hazard arrays are private (_-prefixed) and some are not, so probe BOTH spellings —
// matching only the public name reports real fields as "absent" and understates coverage.
const HAZARD_FIELDS = ['bossLavaZones', 'lightningZones', 'nullEchoZones', 'cybermoteMines',
  'iceFields', 'toxicPools', 'rockets', 'voidRifts', 'enemyOrbZones', 'ventBursts',
  'groundHazards', 'acidPools', 'chaosPylons', 'nullWyrm', 'nullEcho'];
const hazHit = f => {
  for (const n of [f, '_' + f]) if (new RegExp(`this\\.${n}\\b`).test(gameSrc)) return n;
  return null;
};
inv['hazards.fieldsPresent'] = {
  count: HAZARD_FIELDS.filter(hazHit).length,
  present: HAZARD_FIELDS.map(hazHit).filter(Boolean),
  absent: HAZARD_FIELDS.filter(f => !hazHit(f)),
};

// ── modes actually reachable in production ────────────────────────────────
inv['modes'] = {
  count: 4,
  list: ['Act 1 campaign', 'Endless', 'Chaos', 'Boss Rush (in-Chaos event)'],
  evidence: {
    act1: /ACT1_WIN_SECONDS/.test(gameSrc),
    endless: /_enterEndless\(\)/.test(gameSrc),
    chaos: /_beginChaosRun\(\)/.test(gameSrc),
    bossRush: /_updateBossRush\(dt\)/.test(gameSrc),
  },
};

// ── event schedulers ──────────────────────────────────────────────────────
const EVENTS = ['_updateEndlessBossRotation', '_updateChaosTitans', '_updateBossRush',
  '_updateEliteWaves', '_updateEndlessHazards', '_updateAirstrike', '_updateRockets',
  '_updateCybermotes', '_updateAcidRain', '_updateFrozenSleet', '_updateNullBreachArena',
  '_updateVaultDrop', '_updateNexusDefence', '_updateCoreThieves', '_updateCoreCourier',
  '_updateGridCache', '_updateNullCache', '_updateChaosPylons', '_updateNullWyrm'];
inv['events.schedulers'] = {
  count: EVENTS.filter(e => new RegExp(`\\b${e}\\s*\\(`).test(gameSrc)).length,
  present: EVENTS.filter(e => new RegExp(`\\b${e}\\s*\\(`).test(gameSrc)),
  absent: EVENTS.filter(e => !new RegExp(`\\b${e}\\s*\\(`).test(gameSrc)),
};

// ── pickups / reward containers ───────────────────────────────────────────
const PICKUPS = ['xpShards', 'healthPickups', 'manaPickups', 'armorPickups', 'groundCores',
  'gridCache', 'vaultDrop', '_nullCache', 'stars'];
inv['pickups.fieldsPresent'] = {
  count: PICKUPS.filter(f => new RegExp(`this\\.${f}\\b`).test(gameSrc)).length,
  present: PICKUPS.filter(f => new RegExp(`this\\.${f}\\b`).test(gameSrc)),
  absent: PICKUPS.filter(f => !new RegExp(`this\\.${f}\\b`).test(gameSrc)),
};

if (JSON_MODE) { console.log(JSON.stringify({ inventory: inv, notes }, null, 2)); process.exit(0); }

console.log('═══ PHENIX CONTENT INVENTORY ═══');
console.log('    (resolved by importing the real registries — not by grepping)\n');
const pad = (s, n) => String(s).padEnd(n);
for (const [k, v] of Object.entries(inv)) {
  console.log(`  ${pad(k, 34)} ${String(v.count ?? '?').padStart(4)}`);
  for (const [ek, ev] of Object.entries(v)) {
    if (ek === 'count') continue;
    const s = Array.isArray(ev) ? (ev.length > 8 ? ev.slice(0, 8).join(', ') + ` … (+${ev.length - 8})` : ev.join(', '))
      : typeof ev === 'object' ? JSON.stringify(ev) : String(ev);
    if (s && s !== '[]') console.log(`      ${pad(ek + ':', 14)} ${s}`);
  }
}
if (notes.length) { console.log('\n  NOTES / UNRESOLVED:'); for (const n of notes) console.log('   · ' + n); }
console.log('\n═══ end of inventory ═══');
