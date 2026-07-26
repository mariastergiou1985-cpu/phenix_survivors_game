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

console.log(`\nRESULT ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
