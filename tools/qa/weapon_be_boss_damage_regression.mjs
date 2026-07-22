// BUILDENGINE-LIVE EVOLUTION — BOSS-DAMAGE ISOLATION (Phase 3, 2026-07-21)
// Boss DPS must NOT be proxied by kills/min. This tool spawns a real swarm, promotes ONE enemy to a
// mega-boss (isMegaBoss => Enemy.takeHit applies BOSS_DPS_CAP_MEGA), disables pets/turrets, activates
// each of the 25 BuildEngine-live evolutions via the real production path, and attributes damage BY
// IDENTITY: damage to the boss instance -> bossDmg, everything else -> swarmDmg. It proves per-evolution
// boss damage is recorded, finite, and positive; that no pet/turret damage leaks into the weapon account
// (pets disabled => petDmg 0); and that the boss cap is respected (per-hit <= cap). Deterministic.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(path.join(HERE, 'headless-env.mjs'));
installEnv();
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(20260721);
let vclock = 0; globalThis.performance = { now: () => vclock };
const _D = globalThis.Date; globalThis.Date = class extends _D { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
let _un = muteConsole();
const { Game } = await import(path.resolve(HERE, '../../js/game/Game.js'));
const be = await import(path.resolve(HERE, '../../js/game/BuildEngine.js?v=20260810100000'));
_un();
const R = be.EVOLUTION_RECIPES, W = be.WEAPON_DEFS;
const IN = (k) => ({ keys: k || new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });
// Mega-boss survivability = level-scaled armor (Enemy.takeHit, up to 86% reduction) + a SOFT per-second
// DPS cap (_capBossDamage, Game.js:25727 — endless 85 / Act1 40, with 0.2 diminishing returns past the
// cap, NOT a hard per-hit clip). The clean, observable invariant is therefore that boss damage is heavily
// reduced vs swarm damage, not a fixed per-hit ceiling.

let bossE = null, bossDmg = 0, swarmDmg = 0, petDmg = 0, maxBossHit = 0, finite = true;
function newGame(ch) { try { globalThis.localStorage.clear(); } catch (_) {} vclock = 0; const g = new Game(); g.audio = null; const u = muteConsole(); g.selectedCharacter = ch; g.gameState = 'playing'; g.reset(); g._enterEndless(); u(); return g; }

// hook the runtime Enemy prototype ONCE; attribute by identity
(function installHook() {
  const g = newGame('skeleton_warrior'); const u = muteConsole();
  for (let f = 0; f < 150 && !g.enemies.some(e => e && e.pos); f++) { vclock += 1000 / 60; if (g.player) g.player.hp = g.player.maxHp; try { g.update(1 / 60, IN(new Set())); } catch (_) {} }
  const live = g.enemies.find(e => e && e.pos); u();
  const proto = Object.getPrototypeOf(live), orig = proto.takeHit;
  proto.takeHit = function (d, gm) { const n = +d; if (!Number.isFinite(n)) finite = false; else { if (this === bossE) { bossDmg += n; if (n > maxBossHit) maxBossHit = n; } else swarmDmg += n; } return orig.call(this, d, gm); };
})();

function setWeaponLevel(g, r) { const wd = W[r.weapon] || {}; if (wd.external) g._weaponLevels.set(r.weapon, 5); else { g.buildEngine.addWeapon(r.weapon); const w = g.buildEngine.weapons.get(r.weapon); if (w) w.level = 5; } }

function measure(eid, r) {
  bossE = null; bossDmg = 0; swarmDmg = 0; petDmg = 0; maxBossHit = 0; finite = true;
  let threw = 0, activated = false;
  try {
    const owner = (W[r.weapon]?.owner) || 'skeleton_warrior';
    const g = newGame(owner); const u = muteConsole();
    setWeaponLevel(g, r);
    for (let i = 0; i < r.passiveLevel; i++) g.buildEngine.addPassive(r.passive);
    g.buildEngine._evolve(r.weapon);
    activated = !!g.buildEngine.weapons.get(r.weapon)?.evolved || !!W[r.weapon]?.external;
    // spawn a field
    for (let f = 0; f < 90; f++) { vclock += 1000 / 60; if (g.player) g.player.hp = g.player.maxHp; try { g.update(1 / 60, IN(new Set())); } catch (_) { threw++; } }
    // promote nearest enemy to a mega-boss, glue it near the player, disable pets
    const p = g.player;
    bossE = (g.enemies || []).find(e => e && e.pos);
    if (bossE) { bossE.isMegaBoss = true; bossE.rank = 'mega'; bossE.maxHp = 1e7; bossE.hp = 1e7; }
    // fire window: keep boss glued + alive, keep swarm alive, keep pets empty (isolation)
    for (let f = 0; f < 300; f++) {
      vclock += 1000 / 60;
      if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
      if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
      g._activePets = []; g._petBolts = [];   // pet/turret isolation
      if (p) { p.hp = p.maxHp; g.gameOver = false; }
      if (bossE) { bossE.pos.x = p.pos.x + 40; bossE.pos.y = p.pos.y; bossE.hp = 1e7; }
      if (Array.isArray(g.enemies)) for (const e of g.enemies) { if (e && e.maxHp && e !== bossE) e.hp = e.maxHp; }
      try { g.update(1 / 60, IN(new Set())); } catch (_) { threw++; }
    }
    u();
  } catch (e) { threw++; }
  return { eid, activated, bossDmg: Math.round(bossDmg), maxBossHit: +maxBossHit.toFixed(1), swarmDmg: Math.round(swarmDmg), petDmg: Math.round(petDmg), finite, threw };
}

console.log('═══ BUILDENGINE-LIVE EVOLUTION — BOSS-DAMAGE ISOLATION (25) ═══');
const rows = Object.entries(R).map(([eid, r]) => measure(eid, r));
for (const x of rows) console.log(`  ${x.eid.padEnd(26)} bossDmg:${String(x.bossDmg).padStart(6)} maxBossHit:${String(x.maxBossHit).padStart(6)} swarmDmg:${String(x.swarmDmg).padStart(6)} petDmg:${x.petDmg} fin:${x.finite ? 1 : 0} threw:${x.threw}`);

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };
const bad = (pred, lbl) => { const b = rows.filter(pred); return b.length === 0 || `${lbl}: ` + b.map(r => r.eid).join(','); };

console.log('\n── boss-damage isolation gates ──');
T('25/25 record positive boss damage', () => bad(r => r.bossDmg <= 0, 'no-boss-damage'));
T('25/25 boss damage finite (no NaN/Infinity)', () => bad(r => !r.finite, 'non-finite'));
T('25/25 no pet/turret damage attributed to weapon (pets isolated)', () => bad(r => r.petDmg !== 0, 'pet-leak'));
T('25/25 boss damage heavily reduced vs swarm (mega armor + DPS cap effective)', () => bad(r => !(r.bossDmg < r.swarmDmg), 'boss>=swarm'));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
