// ASCENSION BARRIER — MECHANICAL REGRESSION
// ------------------------------------------------------------------------------------------------
// The barrier sits inside the authoritative damage gates, so every one of its rules is a place a
// player's HP can be wrongly spent or wrongly saved. Each is asserted directly against a live Game.
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
let vclock = 0; globalThis.performance = { now: () => vclock };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
u0();

let pass = 0, fail = 0;
const T = (n, c, note = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${note ? ' | ' + note : ''}`); } };

function fresh(mode = 'endless') {
  const un = muteConsole();
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  if (mode === 'chaos') g._beginChaosRun(); else g._enterEndless();
  g._chaosEntryGraceT = 0;
  un();
  return g;
}

console.log('\n=== ASCENSION BARRIER ===');

// ── trigger ──────────────────────────────────────────────────────────────────────────────────
let g = fresh();
T('closed on a fresh run — no barrier before it is earned', g._ascOn === false && g._barVal === 0);
g.player.level = 20; g._ascCheckTrigger();
T('arms at level 20', g._ascOn === true);
T('arms FULL — the shield is up the moment it is earned', Math.round(g._barVal) === Math.round(g.player.maxHp * 0.30));
T('capacity is 30% of max HP', g._barMax === Math.round(g.player.maxHp * 0.30));

// ── absorption ───────────────────────────────────────────────────────────────────────────────
g = fresh(); g.player.level = 20; g._ascCheckTrigger();
g._barVal = 20;
const hp0 = g.player.hp;
g._applyPulseDamage(30, { src: 'contact' });
T('partial absorption: barrier 20, accepted 30 → barrier 0', Math.round(g._barVal) === 0, 'barrier ' + g._barVal);
T('overflow reaches HP: 10 lost, not 30 and not 0', Math.abs((hp0 - g.player.hp) - 10) < 0.51, 'lost ' + (hp0 - g.player.hp));

g = fresh(); g.player.level = 20; g._ascCheckTrigger();
const hp1 = g.player.hp; g._barVal = 40;
g._applyPulseDamage(10, { src: 'contact' });
T('full absorption spends the barrier and NOT the HP', g.player.hp === hp1 && Math.round(g._barVal) === 30, 'hp ' + g.player.hp + ' bar ' + g._barVal);

g = fresh(); g.player.level = 20; g._ascCheckTrigger();
g._barVal = 5; const hp2 = g.player.hp;
g._applyPulseDamage(5, { src: 'contact' });
// TEST CORRECTION: the Batch-2 Ascension shared recovery window is also live here, so the second
// contact hit inside 0.50s is legitimately REFUSED and HP never moves. That is the resilience
// system working, not the barrier failing. Clear the shared window so this assertion measures
// only what it claims to measure: the barrier drains once and the next hit reaches HP.
g._ascShareT = 0;
g._applyPulseDamage(5, { src: 'contact' });
T('barrier drains once, then the next hit reaches HP (no double absorption)',
  Math.round(g._barVal) === 0 && hp2 - g.player.hp > 0, 'bar ' + g._barVal + ' lost ' + (hp2 - g.player.hp));

// ── recharge rules ───────────────────────────────────────────────────────────────────────────
g = fresh(); g.player.level = 20; g._ascCheckTrigger();
g._barVal = 0; g._barDelayT = 2.0;
g.player.pos.x = 0; g.player.pos.y = 0; g.timeAlive = 0; g._barTrail = null;
for (let i = 0; i < 60; i++) { g.timeAlive += 1 / 60; g._tickBarrier(1 / 60); }   // 1s, no movement
T('no recharge before the whole delay has passed', g._barVal === 0, 'barrier ' + g._barVal);

// stationary through the delay: still nothing, because displacement is zero
for (let i = 0; i < 300; i++) { g.timeAlive += 1 / 60; g._tickBarrier(1 / 60); }
T('a STATIONARY player never recharges, however long the gap', g._barVal === 0, 'barrier ' + g._barVal);

// moving player: same clock, real displacement
g = fresh(); g.player.level = 20; g._ascCheckTrigger();
g._barVal = 0; g._barDelayT = 0; g.timeAlive = 0; g._barTrail = null;
for (let i = 0; i < 360; i++) { g.timeAlive += 1 / 60; g.player.pos.x += 4; g._tickBarrier(1 / 60); }
T('a MOVING player does recharge', g._barVal > 0, 'barrier ' + g._barVal);
T('recharge never exceeds the cap', g._barVal <= g._barMax + 0.01, g._barVal + ' > ' + g._barMax);

// any accepted damage restarts the delay
g = fresh(); g.player.level = 20; g._ascCheckTrigger();
g._barDelayT = 0; g._barVal = 1;
g._applyPulseDamage(1, { src: 'contact' });
T('accepted damage stops the recharge immediately', g._barDelayT >= 1.99, 'delay ' + g._barDelayT);

// ── the barrier must not steal other mechanics' immunity ─────────────────────────────────────
g = fresh(); g.player.level = 20; g._ascCheckTrigger();
g._barVal = 50; g.player.dashTimer = 1;
const bar0 = g._barVal;
g._damagePlayer(20, { src: 'rocket' });
T('dash i-frames dodge the hit WITHOUT spending barrier', g._barVal === bar0, 'barrier ' + g._barVal);

g = fresh('chaos'); g.player.level = 20; g._ascCheckTrigger();
g._barVal = 50; g._chaosEntryGraceT = 2.5;
const bar1 = g._barVal;
g._applyPulseDamage(20, { src: 'contact' });
T('Chaos entry grace does not spend barrier', g._barVal === bar1, 'barrier ' + g._barVal);

// ── run isolation ────────────────────────────────────────────────────────────────────────────
g = fresh(); g.player.level = 20; g._ascCheckTrigger();
g._barVal = 30;
const un2 = muteConsole(); g.reset(); g._enterEndless(); un2();
T('a second run starts with the barrier closed and empty — no cross-run leakage',
  g._ascOn === false && g._barVal === 0 && g._barTrail === null,
  `ascOn ${g._ascOn} bar ${g._barVal}`);

// ── numeric health ───────────────────────────────────────────────────────────────────────────
g = fresh(); g.player.level = 20; g._ascCheckTrigger();
g._barVal = 10; g._applyPulseDamage(7, { src: 'contact' });
for (let i = 0; i < 120; i++) { g.timeAlive += 1 / 60; g.player.pos.x += 4; g._tickBarrier(1 / 60); }
T('no NaN anywhere in the barrier state',
  Number.isFinite(g._barVal) && Number.isFinite(g._barMax) && Number.isFinite(g._barDelayT) && Number.isFinite(g.player.hp));

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
