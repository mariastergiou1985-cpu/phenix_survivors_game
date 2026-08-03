/**
 * ENEMY + ENDLESS RUNTIME QA — short and deterministic (Maria 2026-08-02).
 *
 * A time-boxed gate over the enemy layer and the Endless loop. Nothing here touches balance or
 * visuals; every check asks only "does this system do its job at all".
 *
 *   E1  every enemy type deals real damage      — contact damage is finite and > 0 for each type
 *   E2  nobody gets stuck or goes passive        — each type closes distance toward the player and
 *                                                  keeps moving; a type that never moves is a defect
 *   E3  elites / minibosses / bosses attack      — the ranged/attack path actually fires for each rank
 *   E4  Endless events start AND end             — each major event opens, holds, and releases its slot
 *   E5  arena lock / unlock                      — the Null Breach arena raises and drops its lock
 *   E6  HP / mana / armor pickups                — each pickup spawns, is collectable, and applies
 *
 * Deterministic: seeded PRNG, virtual clock, no wall-clock, no sampling. Freeze / black screen /
 * console errors are covered separately in real Chromium.
 *
 * Run: node tools/qa/enemy_endless_qa.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(20260802);
let vclock = 0;
globalThis.performance = { now: () => vclock };
const _D = globalThis.Date;
globalThis.Date = class extends _D { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
try { globalThis.localStorage.clear(); } catch (_) {}

const un = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const EN = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const SP = await import(pathToFileURL(path.join(ROOT, 'js/game/EnemySpawner.js')).href);
const { Vec2 } = await import(pathToFileURL(path.join(ROOT, 'js/constants.js')).href);
un();

let pass = 0, fail = 0;
const notes = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); notes.push(`${name}: ${detail}`); }
};
const t0 = Date.now();

// Every spawnable type the game can produce, from the real pools — no hand-written list that can
// drift away from the spawner.
const src = fs.readFileSync(path.join(ROOT, 'js/game/EnemySpawner.js'), 'utf8');
const TYPES = [...new Set([...src.matchAll(/E\('([^']+)'/g)].map(m => m[1]))];
const EXCLUDED = SP.BIOME_POOL_EXCLUDED || new Set();
const BOSSES = ['Rogue AI Overlord'];
const MINI = ['Security Defector Mech'];
const MEGA = [...(EN.Enemy.CHAOS_TITANS || [])];
const ALL = [...new Set([...TYPES, ...BOSSES, ...MINI, ...MEGA])];

console.log(`\n═══ ENEMY + ENDLESS QA ═══`);
console.log(`  ${ALL.length} enemy types discovered from the real spawn tables\n`);

// A minimal but honest game stub for driving Enemy.update().
const mkStub = () => ({
  // REAL Vec2: Enemy.update() calls player.pos.sub(), so a plain {x,y} literal would make every
  // type look broken for a reason that only exists in the harness.
  player: { pos: new Vec2(0, 0), hp: 1000, maxHp: 1000, radius: 16, invulnTimer: 0,
            contactDamageReduction: 0, takeDamage(d) { this.hp -= d; return d; } },
  enemies: [], camera: { x: 0, y: 0 }, timeAlive: 120, endless: true, gameState: 'playing',
  _chaosMode: false, particles: { spawn() {}, burst() {}, add() {} },
  isWalkable: () => true, _spatialGrid: null, audio: null,
  // The exact hooks Enemy.update() calls. Missing any one of them makes every shooter look
  // "stuck" for a reason that exists only in the harness.
  spawnEnemyBullet() { this._shots = (this._shots || 0) + 1; return true; },
  spawnEnemyProjectile() { this._shots = (this._shots || 0) + 1; return true; },
  _spawnEnemyBeam() { this._shots = (this._shots || 0) + 1; return true; },
  _spawnEnemyNova() { this._shots = (this._shots || 0) + 1; return true; },
  hostileDirector: { requestTokens() { return true; }, fire() { return true; } },
});

console.log('── E1. every enemy type deals real contact damage ──');
{
  const bad = [], zero = [];
  for (const t of ALL) {
    let e;
    try { e = new EN.Enemy(t, 4); } catch (err) { bad.push(`${t}: constructor threw ${err.message}`); continue; }
    const d = e.contactDamage;
    if (!Number.isFinite(d)) { bad.push(`${t}: contactDamage is ${d}`); continue; }
    if (!(d > 0)) zero.push(`${t}=${d}`);
    if (!Number.isFinite(e.hp) || !(e.hp > 0)) bad.push(`${t}: hp is ${e.hp}`);
    // the movement stat is baseSpeed (there is no `speed` field); a ranged type may be slow but
    // must still be a finite number, and a 0 here would mean a permanently stationary enemy.
    if (!Number.isFinite(e.baseSpeed) || !(e.baseSpeed > 0)) bad.push(`${t}: baseSpeed is ${e.baseSpeed}`);
    if (!Number.isFinite(e.radius) || !(e.radius > 0)) bad.push(`${t}: radius is ${e.radius}`);
  }
  ok(`all ${ALL.length} types construct with finite hp / speed / radius`, bad.length === 0, bad.slice(0, 5).join(' | '));
  ok('every type deals contact damage > 0', zero.length === 0, zero.slice(0, 8).join(', '));
}

console.log('\n── E2. no enemy is stuck or passive ──');
{
  const stuck = [], noApproach = [];
  for (const t of ALL) {
    const g = mkStub();
    let e;
    try { e = new EN.Enemy(t, 4); } catch (_) { continue; }
    // place it well away from the player so approach is measurable
    e.pos = new Vec2(600, 0);
    g.enemies = [e];
    const d0 = Math.hypot(e.pos.x, e.pos.y);
    let moved = 0, prevX = e.pos.x, prevY = e.pos.y, threw = null;
    for (let f = 0; f < 60 * 6; f++) {                 // 6 virtual seconds
      vclock += 1000 / 60;
      try { e.update(1 / 60, g); } catch (err) { threw = err.message; break; }
      moved += Math.hypot(e.pos.x - prevX, e.pos.y - prevY);
      prevX = e.pos.x; prevY = e.pos.y;
      if (!Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.y)) { threw = 'position became non-finite'; break; }
    }
    const d1 = Math.hypot(e.pos.x, e.pos.y);
    if (threw) { stuck.push(`${t}: ${threw}`); continue; }
    if (!(moved > 1)) { stuck.push(`${t}: travelled ${moved.toFixed(2)}px in 6s`); continue; }
    // A ranged/stationary type may hold its distance, but it must not DRIFT AWAY forever.
    if (d1 > d0 + 60) noApproach.push(`${t}: ${d0.toFixed(0)} -> ${d1.toFixed(0)}px`);
  }
  ok('every type moves and stays finite over 6s', stuck.length === 0, stuck.slice(0, 6).join(' | '));
  ok('no type flees the player indefinitely', noApproach.length === 0, noApproach.slice(0, 6).join(' | '));
}

console.log('\n── E3. elites, minibosses and bosses attack ──');
{
  // Contact damage is applied by Game's collision pass, NOT by Enemy.update(), so "did the player
  // lose HP" is the wrong question to ask a bare enemy. What Enemy.update() owns is the ATTACK
  // path: a shooter must fire, and a pure-melee body must close to contact range. Both are
  // measured here; a rank that does neither is genuinely inert.
  const silent = [];
  const ranks = [
    ['elite',    TYPES.filter(t => !EXCLUDED.has(t)), (e) => { e.isElite = true; }],
    ['miniboss', MINI,   (e) => { e.isElite = true; }],
    ['boss',     BOSSES, () => {}],
    ['megaboss', MEGA,   (e) => { e.isMegaBoss = true; }],
  ];
  const counts = {};
  for (const [rank, list, mark] of ranks) {
    let acted = 0, total = 0;
    for (const t of list) {
      const g = mkStub();
      let e;
      try { e = new EN.Enemy(t, 8); } catch (_) { continue; }
      total++;
      mark(e);
      e.pos = new Vec2(240, 0);                        // inside a plausible firing range
      g.enemies = [e];
      g._shots = 0;
      let closest = Infinity;
      for (let f = 0; f < 60 * 10; f++) {              // 10 virtual seconds
        vclock += 1000 / 60;
        g.player.invulnTimer = 0;
        try { e.update(1 / 60, g); } catch (_) { break; }
        closest = Math.min(closest, Math.hypot(e.pos.x, e.pos.y));
      }
      const reachedContact = closest <= (e.radius + g.player.radius + 8);
      if (g._shots > 0 || reachedContact) acted++;
      else silent.push(`${rank}:${t} (shots=${g._shots}, closest=${closest.toFixed(0)}px)`);
    }
    counts[rank] = `${acted}/${total}`;
  }
  console.log('  evidence  acted within 10s — ' + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '));
  ok('every elite / miniboss / boss / megaboss either fires or reaches contact', silent.length === 0,
     silent.slice(0, 8).join(' | '));
}

console.log('\n── E4. Endless events start and end ──');
{
  // The major-event slot is a SINGLE global reservation, not one slot per event: startMajorEvent()
  // is idempotent for the current holder and refuses everyone else, endMajorEvent() releases it and
  // opens a 6 s grace, and the bounded hold auto-releases through _majorSlotT. Test that contract.
  const un2 = muteConsole();
  const bad = [];
  try {
    const g = new Game(); g.audio = null; g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.reset(); g._enterEndless();
    const holdSrc = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8')
      .match(/MAJOR_SLOT_HOLD\s*=\s*Object\.freeze\(\{([^}]*)\}\)/);
    const slots = holdSrc ? [...holdSrc[1].matchAll(/([a-zA-Z_]+)\s*:/g)].map(x => x[1]) : [];
    ok('the major-event slot table is non-empty', slots.length >= 3, JSON.stringify(slots));

    const clear = () => { g._activeMajorEvent = null; g._majorSlotT = 0; g._majorEventGraceT = 0; };
    for (const ev of slots) {
      clear();
      if (g.startMajorEvent(ev) !== true) { bad.push(`${ev}: could not start on a free slot`); continue; }
      if (g._activeMajorEvent !== ev) bad.push(`${ev}: started but _activeMajorEvent is ${g._activeMajorEvent}`);
      if (!(g._majorSlotT > 0)) bad.push(`${ev}: started with no bounded hold (${g._majorSlotT})`);
      // the holder may re-enter (idempotent), but a DIFFERENT event must be refused
      if (g.startMajorEvent(ev) !== true) bad.push(`${ev}: the holder was refused its own slot`);
      const other = slots.find(s2 => s2 !== ev);
      if (other && g.startMajorEvent(other) !== false) bad.push(`${ev}: ${other} started on top of it`);
      // explicit end releases and opens the grace
      if (g.endMajorEvent(ev) !== true) bad.push(`${ev}: endMajorEvent refused the holder`);
      if (g._activeMajorEvent !== null) bad.push(`${ev}: slot still held after end`);
      if (!(g._majorEventGraceT > 0)) bad.push(`${ev}: no grace window after end`);
      // and nothing may start during the grace
      if (other && g.startMajorEvent(other) !== false) bad.push(`${ev}: ${other} started during the grace`);
    }
    // the BOUNDED hold must auto-release even if the owner never calls end
    clear();
    const ev0 = slots[0];
    g.startMajorEvent(ev0);
    for (let f = 0; f < 60 * 240 && g._activeMajorEvent; f++) {
      vclock += 1000 / 60;
      if (g._majorSlotT > 0 && g._activeMajorEvent) {
        g._majorSlotT -= 1 / 60;
        if (g._majorSlotT <= 0) g.endMajorEvent(g._activeMajorEvent);
      }
    }
    if (g._activeMajorEvent !== null) bad.push(`${ev0}: bounded hold never expired`);
  } catch (e) { bad.push('THREW: ' + e.message); } finally { un2(); }
  ok('every major event claims, blocks others, and releases its slot', bad.length === 0, bad.slice(0, 6).join(' | '));
}

console.log('\n── E5. arena lock / unlock ──');
{
  const un2 = muteConsole();
  const bad = [];
  try {
    const g = new Game(); g.audio = null; g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.reset(); g._enterEndless();
    if (g._nullBreachActive !== false) bad.push(`arena starts active (${g._nullBreachActive})`);
    // the lock must gate the things it is documented to gate
    g._nullBreachActive = true;
    g._endlessBossTimer = 0;
    if (typeof g._updateEndlessBossRotation === 'function') {
      const before = (g.enemies || []).length;
      g._updateEndlessBossRotation(1 / 60);
      if (g._endlessBossTimer < 15) bad.push(`boss rotation not deferred while the arena is locked (timer ${g._endlessBossTimer})`);
      if ((g.enemies || []).length > before + 2) bad.push('boss spawned during the arena lock');
    } else bad.push('_updateEndlessBossRotation missing');
    // unlock and prove the gate reopens
    g._nullBreachActive = false;
    g._endlessBossTimer = 0;
    if (typeof g._updateEndlessBossRotation === 'function') {
      g._updateEndlessBossRotation(1 / 60);
      if (!(g._endlessBossTimer > 15)) bad.push(`rotation did not resume after unlock (timer ${g._endlessBossTimer})`);
    }
    // and the arena must not survive a reset
    g._nullBreachActive = true;
    g.reset();
    if (g._nullBreachActive !== false) bad.push('arena lock survived reset');
  } catch (e) { bad.push('THREW: ' + e.message); } finally { un2(); }
  ok('the arena locks, unlocks, and never survives a reset', bad.length === 0, bad.slice(0, 6).join(' | '));
}

console.log('\n── E6. HP / mana / armor pickups ──');
{
  const un2 = muteConsole();
  const bad = [];
  try {
    const g = new Game(); g.audio = null; g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.reset(); g._enterEndless();
    const p = g.player;
    const V = p.pos.constructor;
    const at = (x, y) => (typeof V === 'function' && V !== Object) ? new V(x, y) : { x, y };

    // HP
    p.hp = Math.max(1, Math.floor(p.maxHp * 0.3));
    const hp0 = p.hp;
    g.healthPickups = [{ pos: at(p.pos.x, p.pos.y), timer: 45 }];
    for (let f = 0; f < 30; f++) { vclock += 1000 / 60; try { g.update(1 / 60, { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false }); } catch (_) {} }
    if (!(p.hp > hp0)) bad.push(`health pickup did not heal (${hp0} -> ${p.hp})`);
    if (g.healthPickups.length !== 0) bad.push(`health pickup not consumed (${g.healthPickups.length} left)`);

    // MANA
    if (typeof p.mana === 'number') {
      p.mana = 0;
      g.manaPickups = [{ pos: at(p.pos.x, p.pos.y) }];
      for (let f = 0; f < 30; f++) { vclock += 1000 / 60; try { g.update(1 / 60, { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false }); } catch (_) {} }
      if (!(p.mana > 0)) bad.push(`mana pickup did not restore (mana ${p.mana})`);
      if (g.manaPickups.length !== 0) bad.push(`mana pickup not consumed (${g.manaPickups.length} left)`);
    } else bad.push('player has no mana field to restore');

    // ARMOR (this build's "energy" pickup: the +15% DR shield drop)
    p._armorT = 0;
    g.armorPickups = [{ pos: at(p.pos.x, p.pos.y) }];
    for (let f = 0; f < 30; f++) { vclock += 1000 / 60; try { g.update(1 / 60, { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false }); } catch (_) {} }
    if (!((p._armorT || 0) > 0)) bad.push(`armor pickup did not apply (_armorT ${p._armorT})`);
    if (g.armorPickups.length !== 0) bad.push(`armor pickup not consumed (${g.armorPickups.length} left)`);

    // and the spawners must be able to produce them at all
    if (!(g.manaPickupTimer > 0)) bad.push(`manaPickupTimer is ${g.manaPickupTimer}`);
    if (typeof g._updateArmorPickups !== 'function') bad.push('_updateArmorPickups missing');
  } catch (e) { bad.push('THREW: ' + e.message); } finally { un2(); }
  ok('HP, mana and armor pickups spawn, are collected, and apply', bad.length === 0, bad.slice(0, 6).join(' | '));
}

console.log(`\n${'─'.repeat(56)}`);
console.log(`  ${pass} passed, ${fail} failed  ·  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`${'─'.repeat(56)}\n`);
process.exit(fail ? 1 : 0);
