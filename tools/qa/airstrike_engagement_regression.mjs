// AIRSTRIKE MINIMUM ENGAGEMENT REGRESSION (2026-07-26)
// ------------------------------------------------------------------------------------------------
// Telemetry recorded a full 6-rocket salvo spawning 38px from the player with 0.14-0.16s of flight
// time. Airstrike rockets carry NO impact telegraph, so the only dodge is lateral clearance of
// PLAYER_RADIUS + blast = 62px. The slowest character in the roster (189 px/s) needs 0.328s for
// that; at the maximum rocket speed of 285 px/s that is 94px of travel. Below that the hit is not
// hard, it is impossible — the player would need 413 px/s. _fireSalvo now holds fire inside
// AIRSTRIKE_MIN_ENGAGE (120px, margin over the 94px floor) and tries again on its next cycle.
//
// These gates FAIL on the pre-fix build and PASS after it.
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const GAME_SRC = readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
let pass = 0, fail = 0;
const T = (n, ok, note = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

console.log('\n[1] Contract');
const MIN = Number((GAME_SRC.match(/const AIRSTRIKE_MIN_ENGAGE = (\d+)/) || [])[1]);
T('AIRSTRIKE_MIN_ENGAGE is defined', Number.isFinite(MIN), `= ${MIN}`);
T('it clears the mathematical floor (94px)', MIN >= 94, `${MIN} >= 94`);
T('_fireSalvo holds fire inside it',
  /_fireSalvo\(s\)\s*\{[\s\S]{0,260}distance\(s\.pos, this\.player\.pos\) < AIRSTRIKE_MIN_ENGAGE\) return;/.test(GAME_SRC));
T('rocket count, blast, speed and aim are untouched',
  /const n = 3 \+ Math\.floor\(Math\.random\(\) \* 4\)/.test(GAME_SRC) &&
  /speed: randomRange\(220, 285\), life: 5\.5, radius: 7, blast: 46/.test(GAME_SRC));
T('the airstrike layer stays Endless/Chaos-only',
  /_updateEndlessHazards\(dt\) \{[\s\S]{0,200}if \(!this\.endless\) return;/.test(GAME_SRC) ||
  /if \(!this\.endless\) return;[\s\S]{0,4000}_updateRockets/.test(GAME_SRC));

const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mulberry32 = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let vclock = 0;
globalThis.performance = { now: () => vclock };
const RealDate = globalThis.Date;
globalThis.Date = class extends RealDate { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const un = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Vec2, PLAYER_RADIUS } = await import(pathToFileURL(path.join(ROOT, 'js/constants.js')).href);
un();

const mk = () => {
  const q = muteConsole();
  Math.random = mulberry32(9001); vclock = 0;
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset(); g._enterEndless();
  q();
  return g;
};

console.log('\n[2] Firing geometry');
{
  const g = mk();
  const fireAt = dist => {
    g.airstrikeRockets.length = 0;
    const ship = { pos: new Vec2(g.player.pos.x + dist, g.player.pos.y), angle: 0, fireCd: 0, life: 45 };
    const q = muteConsole(); g._fireSalvo(ship); q();
    return g.airstrikeRockets.slice();
  };
  const near = [10, 38, 60, 100, 119].map(d => ({ d, n: fireAt(d).length }));
  T('no rocket is ever created inside the engagement floor', near.every(x => x.n === 0),
    near.map(x => `${x.d}px:${x.n}`).join(' '));
  const far = [130, 200, 400, 800].map(d => ({ d, n: fireAt(d).length }));
  T('the ship still fires normally outside it', far.every(x => x.n >= 3),
    far.map(x => `${x.d}px:${x.n}`).join(' '));
  T('salvo size is still 3-6 rockets', far.every(x => x.n >= 3 && x.n <= 6), far.map(x => x.n).join(','));

  const rockets = fireAt(600);
  const clearance = PLAYER_RADIUS + 46;
  const worst = rockets.map(r => Math.hypot(r.pos.x - g.player.pos.x, r.pos.y - g.player.pos.y) / r.speed);
  T('every fired rocket has a real flight window', worst.every(t => t > clearance / 189),
    `min ${Math.min(...worst).toFixed(2)}s vs ${(clearance / 189).toFixed(2)}s needed by the slowest character`);
  T('blast radius is unchanged at 46', rockets.every(r => r.blast === 46));
}

console.log('\n[3] Live run — no unavoidable spawn distance');
{
  const g = mk();
  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  const seen = new Set();
  let minSpawn = Infinity, salvos = 0;
  const q = muteConsole();
  for (let f = 0; f < 240 * 60; f++) {
    if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    for (const r of (g.airstrikeRockets || [])) {
      if (!seen.has(r)) {
        seen.add(r); salvos++;
        minSpawn = Math.min(minSpawn, Math.hypot(r.pos.x - g.player.pos.x, r.pos.y - g.player.pos.y));
      }
    }
    g.player.hp = g.player.maxHp; g.gameOver = false;
    try { g.update(1 / 60, input); } catch (_) { break; }
  }
  q();
  T('rockets were actually produced during the run', salvos > 0, `${salvos} rockets`);
  T('no rocket spawned inside the engagement floor', minSpawn >= MIN - 1,
    `closest spawn ${Number.isFinite(minSpawn) ? minSpawn.toFixed(1) : 'n/a'}px, floor ${MIN}px`);
}

// ── [4] W3 GUNSHIP ROCKET PODS (2026-07-26, Phase 6A closure matrix) ────────────────────────────
// The closure matrix caught the SAME defect on a second rocket path. _updateGunship fires 4 pods
// (blast 42, h = 0.6 homing) straight from the gunship's own position with no engagement floor.
// Telemetry recorded four of them spawning 61.3px away with 0.25-0.30s of flight; the clearance a
// player needs is PLAYER_RADIUS + blast = 58px, which the slowest character (189 px/s) covers in
// 0.307s — and because these rockets HOME, sidestepping does not clear them either. Undodgeable by
// construction, exactly like the pre-fix airstrike salvo. These gates FAIL pre-fix, PASS post-fix.
console.log('\n[4] W3 gunship rocket pods — point-blank hold');
{
  const g = mk();
  const podsAt = dist => {
    g.airstrikeRockets.length = 0;
    // `orbit` is mandatory: _updateGunship advances it every frame and a missing value turns the
    // gunship position into NaN, which silently defeats the distance guard (NaN < 120 is false).
    const gs = { pos: new Vec2(g.player.pos.x + dist, g.player.pos.y), aim: new Vec2(0, 0),
                 orbit: 0, phase: 'idle', phaseT: 0, tick: 1, laserCd: 9, rocketCd: 0, mortarCd: 9,
                 life: 60, hp: 500, maxHp: 500, t: 0 };
    g.gunship = gs; g.gunships = [gs]; g._gunshipTimer = 999;
    const q = muteConsole();
    for (let i = 0; i < 4 && g.airstrikeRockets.length === 0; i++) {
      try { g._updateGunship(1 / 60); } catch (_) { break; }
    }
    q();
    return g.airstrikeRockets.slice();
  };
  const homing = rs => rs.filter(r => Number(r.h || 0) > 0);
  for (const d of [20, 45, 61, 90]) {
    const rs = homing(podsAt(d));
    T(`no homing pod fired from ${d}px (inside the ${MIN}px floor)`, rs.length === 0, `${rs.length} pods`);
  }
  // At 119px the gunship is one frame from the floor: it orbits outward at 190 px/s, so it may
  // cross 120px and fire legitimately. What must hold is not "it never fires" but "nothing is ever
  // launched from inside the floor" — assert the spawn geometry, not the abstinence.
  {
    const rs = homing(podsAt(119));
    const minD = rs.length ? Math.min(...rs.map(r => Math.hypot(r.pos.x - g.player.pos.x, r.pos.y - g.player.pos.y))) : Infinity;
    T('at the 119px boundary nothing launches from inside the floor',
      rs.length === 0 || (Number.isFinite(minD) && minD >= MIN - 1),
      rs.length ? `${rs.length} pods, closest ${minD.toFixed(1)}px` : 'held fire');
  }
  let anyFar = 0;
  for (const d of [140, 220, 400, 700]) {
    const rs = homing(podsAt(d));
    anyFar += rs.length;
    T(`pods still fire from ${d}px`, rs.length >= 1, `${rs.length} pods`);
    if (rs.length) {
      const minD = Math.min(...rs.map(r => Math.hypot(r.pos.x - g.player.pos.x, r.pos.y - g.player.pos.y)));
      T(`  spawn distance at ${d}px stays outside the floor`, Number.isFinite(minD) && minD >= MIN - 1, `${minD.toFixed(1)}px`);
      T(`  homing and blast are unchanged at ${d}px`, rs.every(r => r.h === 0.6 && r.blast === 42));
    }
  }
  T('the gunship is not disarmed overall', anyFar > 0, `${anyFar} pods fired at range`);
  T('the hold is a retry, not a cancel (short recheck, not the full 5.2s cycle)',
    /if \(distance\(g\.pos, this\.player\.pos\) < AIRSTRIKE_MIN_ENGAGE\) \{\s*\n\s*g\.rocketCd = 0\.5;/.test(GAME_SRC));
}

console.log(`\nRESULT ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
