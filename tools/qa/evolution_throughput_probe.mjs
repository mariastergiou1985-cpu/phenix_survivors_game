// EVOLUTION THROUGHPUT — DOES THE EVOLUTION ACTUALLY DO MORE?
// ------------------------------------------------------------------------------------------------
// A static read of the recipes says five evolutions are WORSE than the level-5 weapon they replace
// (Amp Overdrive Wall 0.22x, Gate of Hungry Ghosts 0.45x, Wing Guillotine 0.59x, Quantum Roulette
// 0.66x, Fractal Verdict 0.89x). That number is SINGLE-TARGET, and several of those evolutions
// trade single-target for area - Amp Overdrive Wall fires a 560x60 wall. Tuning on it would be
// tuning on the wrong metric, exactly the mistake that cost three batches.
//
// So this measures the real thing: identical horde, identical time, weapon at level 5 versus the
// same weapon evolved, total damage dealt to enemies. Same seed, one weapon per process pair,
// nothing else in the build.
//
//   node tools/qa/evolution_throughput_probe.mjs [seconds]
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole, makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let vclock = 0; globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const BE = await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngine.js')).href);
const CTX = makeCtx();
u0();
const { EVOLUTION_RECIPES, WEAPON_DEFS } = BE;

const SECONDS = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 30;

// damage meter
let DMG = 0, HITS = 0, TOUCHED = new Set();
const ETH = Enemy.prototype.takeHit;
let ON = false;
Enemy.prototype.takeHit = function (dmg, game) {
  const before = this.hp;
  const r = ETH.call(this, dmg, game);
  if (ON) { const lost = Math.max(0, before - this.hp); if (lost > 0) { DMG += lost; HITS++; TOUCHED.add(this); } }
  return r;
};

// A fixed, renewing ring of dummies at a spread of ranges, so a wide evolution is credited for its
// area and a single-target one is not punished for lacking it.
function seedHorde(g) {
  const p = g.player;
  g.enemies.length = 0;
  for (let ring = 0; ring < 5; ring++) {
    const R = 70 + ring * 90, n = 6 + ring * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3;
      const e = new Enemy('Drone Grunt', 10);
      e.pos.x = p.pos.x + Math.cos(a) * R;
      e.pos.y = p.pos.y + Math.sin(a) * R;
      e.hp = e.maxHp = 1e7;          // never die: this measures OUTPUT, not clear speed
      e.speed = 0; e._baseSpeedFull = 0;
      e.contactDamage = 0;           // and never kill the test subject
      g.enemies.push(e);
    }
  }
}

function run(weaponId, evolved) {
  Math.random = mul(4242); vclock = 0;
  try { globalThis.localStorage.clear(); } catch (_) {}
  const un = muteConsole();
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset(); g._enterEndless();
  const be = g.buildEngine;
  if (!be) { un(); return null; }
  be.weapons.clear();
  be.addWeapon(weaponId);
  const w = be.weapons.get(weaponId);
  if (!w) { un(); return null; }
  w.level = 5;
  if (evolved) { w.evolved = true; w.charge = 0; }
  const p = g.player;
  p.hp = p.maxHp = 1e7;
  DMG = 0; HITS = 0; TOUCHED = new Set(); ON = true;
  const input = { keys: new Set(), mousePos: { x: p.pos.x + 300, y: p.pos.y }, mouseDown: false };
  for (let f = 0; f < SECONDS * 60; f++) {
    vclock += 1000 / 60;
    if (f % 30 === 0) seedHorde(g);            // keep the ring intact and the geometry identical
    if (g.upgradeUI) g.upgradeUI = null;
    if (g.mutationUI) g.mutationUI = null;
    input.mousePos = { x: p.pos.x + 300, y: p.pos.y };
    try { g.update(1 / 60, input); } catch (_) { break; }
    try { g.draw(CTX); } catch (_) {}
    p.hp = p.maxHp;
  }
  ON = false; un();
  return { dmg: Math.round(DMG), hits: HITS, targets: TOUCHED.size };
}

const ids = [...new Set(Object.values(EVOLUTION_RECIPES).map(r => r.weapon))];
const out = [];
for (const wid of ids) {
  const rec = Object.entries(EVOLUTION_RECIPES).find(([, r]) => r.weapon === wid);
  const base = run(wid, false);
  const evo  = run(wid, true);
  if (!base || !evo) { console.error(`  ${wid.padEnd(26)} SKIPPED (weapon not constructible)`); continue; }
  const mult = base.dmg > 0 ? +(evo.dmg / base.dmg).toFixed(2) : null;
  out.push({ evolution: rec ? rec[0] : '?', name: rec ? rec[1].name : '?', weapon: wid,
             baseDmg: base.dmg, evoDmg: evo.dmg, throughputMult: mult,
             baseTargets: base.targets, evoTargets: evo.targets,
             coverageMult: base.targets > 0 ? +(evo.targets / base.targets).toFixed(2) : null });
  console.error(`  ${String(rec ? rec[1].name : wid).padEnd(28)} base ${String(base.dmg).padStart(8)}  evo ${String(evo.dmg).padStart(8)}  x${String(mult).padStart(5)}   targets ${String(base.targets).padStart(3)} -> ${String(evo.targets).padStart(3)}`);
}
out.sort((a, b) => (a.throughputMult ?? 99) - (b.throughputMult ?? 99));
console.log(JSON.stringify(out, null, 1));
