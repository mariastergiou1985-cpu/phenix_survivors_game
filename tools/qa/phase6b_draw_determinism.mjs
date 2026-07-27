// PHASE 6B §4 — DRAW/UPDATE DETERMINISM TEST
// ------------------------------------------------------------------------------------------------
// Question: does the gameplay outcome of a run depend on HOW OFTEN draw() is called?
//
// It must not. draw() is a renderer; update(dt, input) owns the simulation. If the same seed and
// the same input produce different damage, kills, XP, levels or death times at 60/30/15/0 Hz draw,
// then frame rate is a gameplay stat and the game is non-deterministic in production.
//
// Static finding this test exists to confirm empirically (Game.js, audited 2026-07-27):
//   `this._canvas` is assigned in NINE places, every one of them inside a _draw*Fx(ctx) function.
//   Ten lazy kit builders - _ensurePhasewalkerFx, _ensureOniFx, _ensureTheoremFx, _ensureOssuaryFx,
//   _ensureRailgunFx, _ensureMagmaFx, _ensureFeedbackFx, _ensurePhantomExecFx, _ensureTribunalFx
//   and the DeusExMachina line in _activateCyberAngelNova - all bail out with `|| !this._canvas`.
//   So no character kit can be constructed until a draw has happened, and every one of those kits
//   deals damage from its update path.
//
// Same process per cadence is NOT valid (module init consumes RNG - see phase6b_roster_dps_v2
// correction 1), so this file runs ONE cadence per process and the caller diffs the JSON.
//
//   node tools/qa/phase6b_draw_determinism.mjs [seconds] <id> --hz=60|30|15|0|var
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

// seeded RNG + a call counter: the number of randoms consumed is itself a determinism signal
let RNG_CALLS = 0;
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; RNG_CALLS++; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let vclock = 0; globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const u0 = muteConsole();
const { Game }  = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const { makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
const DRAW_CTX = makeCtx();
u0();

const GAME_SRC = readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const lineOwner = (() => {
  const lines = GAME_SRC.split('\n'); const own = new Array(lines.length + 1); let cur = '?';
  for (let i = 0; i < lines.length; i++) { const m = lines[i].match(/^  ([A-Za-z_][\w]*)\s*\(/); if (m) cur = m[1]; own[i + 1] = cur; }
  return own;
})();
const HELPERS = new Set(['_brawlerHit', '_capBossDamage', '_tryCorrode', '_targetIsBoss',
                         '_dealDamage', '_applyElementOnHit', '_onEnemyKilled', '?']);
const siteOwner = () => {
  const st = (new Error().stack || '').split('\n');
  let firstHelper = null;
  for (let i = 2; i < st.length; i++) {
    const m = st[i].match(/Game\.js[^:]*:(\d+):/);
    if (m) { const o = lineOwner[Number(m[1])] || '?'; if (HELPERS.has(o)) { firstHelper ||= o; continue; } return o; }
    if (/BuildEngine[^/]*\.js/.test(st[i])) return 'buildEngine';
    if (/NpcWalker\.js/.test(st[i])) return 'npcWalker';
  }
  return firstHelper ? 'helper-only:' + firstHelper : 'unknown';
};

const args = process.argv.slice(2);
const SECONDS = Number(args[0]) > 0 ? Number(args.shift()) : 120;
const HZ = (args.find(a => a.startsWith('--hz=')) || '--hz=60').slice(5);
const ID = args.filter(a => !a.startsWith('--'))[0] || 'oni_cataclysm_protocol';
const SEED = Number((args.find(a => a.startsWith('--seed=')) || '--seed=12345').slice(7));
// variable cadence: a FIXED pattern, so the schedule itself never touches the game RNG
const VAR_PATTERN = [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1];
const shouldDraw = f => HZ === '60' ? true
  : HZ === '30' ? f % 2 === 0
  : HZ === '15' ? f % 4 === 0
  : HZ === '0'  ? false
  : VAR_PATTERN[f % VAR_PATTERN.length] === 1;

// stable 32-bit hash of a number stream: catches position drift a summary total would hide
const h32 = () => { let h = 0x811c9dc5; return { add(n) { const v = Math.round(n * 100) | 0; h ^= v; h = Math.imul(h, 0x01000193) >>> 0; }, get() { return (h >>> 0).toString(16); } }; };

const ETH = Enemy.prototype.takeHit;
let SINK = null;
Enemy.prototype.takeHit = function (dmg, game) {
  const before = this.hp;
  const owner = SINK ? siteOwner() : null;
  const r = ETH.call(this, dmg, game);
  const lost = Math.max(0, before - this.hp);
  if (lost > 0 && SINK) SINK(owner, lost, before, this);
  return r;
};

// the draw-coupled kit slots, so the report can say WHICH ones failed to come up
const KIT_SLOTS = ['_glitchDash', '_empShock', '_digitalSingularity', '_protocol0', '_laserEyes',
                   '_meteorRain', '_theorem', '_ossuary', '_railgun', '_magma',
                   '_feedbackApoc', '_phantomExec', '_tribunal', '_deusEx'];

function run() {
  Math.random = mul(SEED); vclock = 0; RNG_CALLS = 0;
  try { globalThis.localStorage.clear(); } catch (_) {}
  const un = muteConsole();
  const g = new Game();
  g.audio = null; g.selectedCharacter = ID; g.gameState = 'playing';
  g.reset(); g._enterEndless();
  const p = g.player;

  const by = {}; let total = 0, kills = 0, drawCalls = 0;
  SINK = (owner, lost, before, e) => {
    const b = owner || 'unknown'; by[b] = (by[b] || 0) + lost; total += lost;
    if (before > 0 && e.hp <= 0) kills++;
  };

  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  const setDir = (dx, dy, dash) => {
    input.keys.clear();
    if (dy < -0.35) input.keys.add('w'); else if (dy > 0.35) input.keys.add('s');
    if (dx < -0.35) input.keys.add('a'); else if (dx > 0.35) input.keys.add('d');
    if (dash) input.keys.add('shift');
  };
  const threat = () => {
    let vx = 0, vy = 0, n = 0, nearest = Infinity, touching = 0;
    for (const e of g.enemies) {
      if (!e || e.hp <= 0 || !e.pos) continue;
      const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y, d = Math.hypot(dx, dy);
      if (d > 340 || d < 1) continue;
      n++; vx += dx / d; vy += dy / d;
      if (d < nearest) nearest = d;
      if (d < 16 + (e.radius || 14)) touching++;
    }
    return { vx, vy, n, nearest, touching };
  };

  // NOT HP-pinned: death time is one of the compared outcomes.
  let deathFrame = -1;
  const marks = [];
  const TOTAL_F = SECONDS * 60;
  for (let f = 0; f < TOTAL_F; f++) {
    vclock += 1000 / 60;
    if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    const tv = threat();
    const len = Math.hypot(tv.vx, tv.vy) || 1;
    setDir(tv.vx / len, tv.vy / len, (p.dashCooldown || 0) <= 0 && (tv.touching >= 2 || tv.nearest < 46));
    input.mousePos = { x: p.pos.x + 400, y: p.pos.y };
    try { g.update(1 / 60, input); } catch (_) { break; }
    if (shouldDraw(f)) { drawCalls++; try { g.draw(DRAW_CTX); } catch (_) {} }
    if (deathFrame < 0 && (g.gameOver || p.hp <= 0)) { deathFrame = f; break; }
    if ((f + 1) % (30 * 60) === 0) {
      const eh = h32(); for (const e of g.enemies) { if (e?.pos) { eh.add(e.pos.x); eh.add(e.pos.y); eh.add(e.hp); } }
      marks.push({ t: (f + 1) / 60, dmg: Math.round(total), kills, lvl: p.level, xp: Math.round(p.xp || 0),
                   enemies: g.enemies.length, enemyHash: eh.get(), rng: RNG_CALLS });
    }
  }
  SINK = null;

  const eh = h32(); for (const e of g.enemies) { if (e?.pos) { eh.add(e.pos.x); eh.add(e.pos.y); eh.add(e.hp); } }
  const kits = {}; for (const k of KIT_SLOTS) kits[k] = !!g[k];
  un();

  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v), +(100 * v / (total || 1)).toFixed(1)]);
  return {
    id: ID, hz: HZ, seed: SEED, seconds: SECONDS, drawCalls,
    survivedFrames: deathFrame < 0 ? TOTAL_F : deathFrame,
    deathTimeSec: deathFrame < 0 ? null : +(deathFrame / 60).toFixed(3),
    totalDamage: Math.round(total), kills, level: p.level, xp: Math.round(p.xp || 0),
    playerHp: Math.round(p.hp), playerPos: [Math.round(p.pos.x), Math.round(p.pos.y)],
    enemies: g.enemies.length, enemyHash: eh.get(), rngCalls: RNG_CALLS,
    kitsBuilt: kits, kitsBuiltCount: Object.values(kits).filter(Boolean).length,
    marks, bySource: rows.slice(0, 10),
  };
}

const r = run();
console.error(`  ${r.id} seed=${r.seed} hz=${r.hz}  draws ${r.drawCalls}  dmg ${r.totalDamage}  kills ${r.kills}  lvl ${r.level}  ` +
  `death ${r.deathTimeSec ?? 'survived'}  rng ${r.rngCalls}  kits ${r.kitsBuiltCount}  enemyHash ${r.enemyHash}`);
console.log(JSON.stringify(r, null, 1));
