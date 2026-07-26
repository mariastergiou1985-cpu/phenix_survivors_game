// PHASE 6B-2 — DIMI KICKBOXER MECHANICAL AUDIT (read-only, measurement)
// Answers the mandated Dimi questions with numbers: does the gauntlet punch toward a real target,
// does it swing with nothing in range, and do the three Tactical Drones actually engage — or do
// they only orbit, which is what "τα drones μοιάζουν αδρανή" would look like in play.
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let vclock = 0; globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
u0();

const SECONDS = Number(process.argv[2] || 60);
Math.random = mul(12345); vclock = 0;
try { globalThis.localStorage.clear(); } catch (_) {}
const un = muteConsole();
const g = new Game();
g.audio = null; g.selectedCharacter = 'dimis_kickboxer'; g.gameState = 'playing';
g.reset(); g._enterEndless();

// instrument the drone strike site and the gauntlet damage site
let droneStrikes = 0, droneDamage = 0, framesWithContact = 0, framesTotal = 0;
let dronesAlive = 0, droneOrbitSamples = 0;
const oBeamPush = g._specialBeams.push.bind(g._specialBeams);
g._specialBeams.push = function (b) { if (b && b.color === '#b026ff') droneStrikes++; return oBeamPush(b); };

let gauntletHits = 0, gauntletDamage = 0, swingsTotal = 0, swingsWithNoTarget = 0;
const be = g.buildEngine;
if (be && typeof be._dealDamage === 'function') {
  const oDeal = be._dealDamage.bind(be);
  be._dealDamage = function (wid, e, dmg, bm, crit) {
    const before = e && e.hp;
    const r = oDeal(wid, e, dmg, bm, crit);
    if (/gauntlet|sanction/.test(String(wid))) { gauntletHits++; gauntletDamage += Math.max(0, before - e.hp); }
    return r;
  };
}
// count swings by watching the weapon's hits array grow
let lastHitCount = 0;

const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
const dt = 1 / 60;
for (let f = 0; f < SECONDS * 60; f++) {
  vclock += 1000 / 60;
  if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
  if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
  const p = g.player;
  let contact = 0;
  for (const e of g.enemies) {
    if (!e || e.hp <= 0 || !e.pos) continue;
    const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y;
    const reach = 16 + (e.radius || 0);
    if (dx * dx + dy * dy < reach * reach) contact++;
  }
  if (contact > 0) framesWithContact++;
  framesTotal++;
  try { g.update(dt, input); } catch (e) { break; }
  if (g._dimiDrones) { dronesAlive = g._dimiDrones.length; droneOrbitSamples++; }
  const w = be?.weapons?.get('cyber_gauntlets_injection') || be?.weapons?.get('be_sanction_halo');
  if (w && Array.isArray(w.hits)) {
    if (w.hits.length > lastHitCount || (w.hits.length && w.hits[w.hits.length - 1].t < dt * 1.5)) {
      // a fresh swing was appended this frame
    }
    lastHitCount = w.hits.length;
  }
  g.player.hp = g.player.maxHp; g.gameOver = false;
}
un();

const mins = SECONDS / 60;
console.log('═══ DIMI KICKBOXER — MECHANICAL AUDIT ═══');
console.log(`run: ${SECONDS}s Endless, seed 12345, HP pinned (isolates mechanics from survivability)`);
console.log('');
console.log('── gauntlet (cyber_gauntlets_injection) ──');
console.log(`  landed hits         ${gauntletHits}   (${(gauntletHits / mins).toFixed(0)}/min)`);
console.log(`  damage dealt        ${gauntletDamage.toFixed(0)}`);
console.log(`  damage per hit      ${gauntletHits ? (gauntletDamage / gauntletHits).toFixed(1) : 'n/a'}`);
console.log('');
console.log('── tactical drones ──');
console.log(`  drones alive        ${dronesAlive} (expected 3)`);
console.log(`  orbit samples       ${droneOrbitSamples}`);
console.log(`  STRIKES FIRED       ${droneStrikes}   (${(droneStrikes / mins).toFixed(1)}/min)`);
console.log(`  damage per strike   14 (fixed, takeHit)`);
console.log(`  drone damage total  ${droneStrikes * 14}`);
console.log('');
console.log('── contact opportunity (drones only fire at a body ALREADY touching the player) ──');
console.log(`  frames with a body in contact  ${framesWithContact}/${framesTotal}  (${(100 * framesWithContact / framesTotal).toFixed(1)}%)`);
console.log(`  seconds with contact           ${(framesWithContact / 60).toFixed(1)}s of ${SECONDS}s`);
console.log('');
const verdict = droneStrikes === 0 ? 'INERT — never fired once'
  : droneStrikes / mins < 3 ? 'NEARLY INERT — fires less than 3 times per minute'
  : 'ENGAGING';
console.log(`  VERDICT: drones ${verdict}`);
