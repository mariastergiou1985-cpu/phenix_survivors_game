// PHASE 6B-2 — STARTER HIT-RATE / RANGE AUDIT  ***NOT YET TRUSTWORTHY — DO NOT DRAW BALANCE
// CONCLUSIONS FROM THIS FILE.***
// ------------------------------------------------------------------------------------------------
// STATUS 2026-07-26. The Enemy.takeHit hook works and records real per-hit damage, but two things
// are not yet sound and are recorded here so nobody trusts the output prematurely:
//
//   1. ATTRIBUTION. Game._lastWeaponId is set only by the BuildEngine path. Legacy starter damage
//      arrives with no id and lands in 'unattributed', so a starter's number also carries pet and
//      tactical chip damage. Starter-exact attribution needs a hook further down the legacy path.
//   2. THE CLOSE-RANGE PROBE IS THE WRONG SHAPE. It measures the share of frames-with-a-close-body
//      that also produced a close hit, which mostly measures FIRE RATE, not a dead zone. A weapon
//      on a 1s cooldown can only "cover" a few percent of frames no matter how well it reaches.
//      A real dead-zone test must compare hit density per distance ring against body-time per ring.
//
// It also surfaced a problem in an EARLIER harness: phase6b_roster_baseline measures damage as the
// per-frame drop in summed enemy HP, which enemy SPAWNS inflate in the opposite direction. Its DPS
// column (and the +/-30% outlier list built from it) is therefore suspect and must not be used for
// balance until re-measured per-hit.
//
// 45-second DPS is a functional baseline, not a balance verdict. This asks WHY a starter's number
// is what it is: how often it connects, how hard each hit lands, at what distance, and whether
// there is a close-range hole where a body sits on top of the player and nothing registers.
//
// INSTRUMENTATION NOTE. Starter weapons are LEGACY WeaponCatalog weapons: buildEngine.weapons is
// EMPTY until the player takes a be_w_ card, so hooking buildEngine._dealDamage records nothing for
// a starter (verified: cyber_arm_hero has be.weapons = [] after 10s while _weaponLevels holds
// magnetic_arc). Enemy.takeHit is the real chokepoint and Game._lastWeaponId carries the
// attribution the game itself uses.
//
//   node tools/qa/phase6b_starter_hitrate_audit.mjs [seconds] <id> [<id> ...]
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
// Patch the Enemy class itself, not an instance prototype found at runtime: the strip-v loader
// makes this the SAME module instance production uses, so every subclass inherits the hook.
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
u0();
const ENEMY_TAKE_HIT = Enemy.prototype.takeHit;
let SINK = null;
Enemy.prototype.takeHit = function (dmg, game) {
  const before = this.hp;
  const r = ENEMY_TAKE_HIT.call(this, dmg, game);
  const lost = Math.max(0, before - this.hp);
  if (lost > 0 && SINK) SINK(this, lost, before, game);
  return r;
};

const args = process.argv.slice(2);
const SECONDS = Number(args[0]) > 0 ? Number(args.shift()) : 45;
const IDS = args.length ? args : ['skeleton_warrior'];
const pct = (a, q) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return Math.round(b[Math.min(b.length - 1, Math.floor(b.length * q))]); };
const CLOSE = 70;

function audit(id) {
  Math.random = mul(12345); vclock = 0;
  try { globalThis.localStorage.clear(); } catch (_) {}
  const un = muteConsole();
  const g = new Game();
  g.audio = null; g.selectedCharacter = id; g.gameState = 'playing';
  g.reset(); g._enterEndless();
  const p = g.player;

  const perWeapon = {};
  const bump = wid => (perWeapon[wid] ||= { hits: 0, damage: 0, kills: 0, ranges: [], closeHits: 0 });
  SINK = (e, lost, before, game) => {
    const b = bump((game && game._lastWeaponId) || 'unattributed');
    b.hits++; b.damage += lost;
    if (before > 0 && e.hp <= 0) b.kills++;
    if (e.pos) { const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y); b.ranges.push(d); if (d <= CLOSE) b.closeHits++; }
  };

  const starterId = g._weaponLevels ? [...g._weaponLevels.keys()][0] : null;
  let closeFrames = 0, closeFramesConnected = 0;
  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  const dt = 1 / 60;
  for (let f = 0; f < SECONDS * 60; f++) {
    vclock += 1000 / 60;
    if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }

    let nearest = Infinity;
    for (const e of g.enemies) {
      if (!e || e.hp <= 0 || !e.pos) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
      if (d < nearest) nearest = d;
    }
    const _bk = perWeapon[starterId] || perWeapon['unattributed'];
    const preClose = _bk ? _bk.closeHits : 0;

    try { g.update(dt, input); } catch (e) { break; }

    if (nearest <= CLOSE) {
      closeFrames++;
      const _bk2 = perWeapon[starterId] || perWeapon['unattributed'];
      const nowClose = _bk2 ? _bk2.closeHits : 0;
      if (nowClose > preClose) closeFramesConnected++;
    }
    g.player.hp = g.player.maxHp; g.gameOver = false;
  }
  SINK = null;
  un();

  const mins = SECONDS / 60;
  // ATTRIBUTION NOTE. Game._lastWeaponId is set by the BuildEngine path only; legacy starter
  // damage arrives with no id, so it lands in 'unattributed'. In a starter-only run (no be_w_
  // card taken, buildEngine.weapons empty) that bucket IS the starter plus any pet/tactical
  // chip damage, which is why it is reported as starter-dominant rather than starter-exact.
  const b = perWeapon[starterId] || perWeapon['unattributed'] || { hits: 0, damage: 0, kills: 0, ranges: [], closeHits: 0 };
  const attributionExact = !!perWeapon[starterId];
  const others = Object.entries(perWeapon).filter(([k]) => k !== starterId && k !== 'unattributed')
    .sort((x, y) => y[1].damage - x[1].damage).slice(0, 4).map(([k, v]) => k + ':' + Math.round(v.damage));
  return {
    id, starter: starterId, attributionExact,
    hits: b.hits, hitsPerMin: Math.round(b.hits / mins),
    damage: Math.round(b.damage), dps: +(b.damage / SECONDS).toFixed(1),
    damagePerHit: b.hits ? +(b.damage / b.hits).toFixed(1) : 0,
    kills: b.kills, killsPerMin: Math.round(b.kills / mins),
    hitRangePx: { min: b.ranges.length ? Math.round(Math.min(...b.ranges)) : null, p10: pct(b.ranges, .1),
                  median: pct(b.ranges, .5), p90: pct(b.ranges, .9),
                  max: b.ranges.length ? Math.round(Math.max(...b.ranges)) : null },
    closeRange: { radiusPx: CLOSE, framesWithBodyInside: closeFrames, framesThatConnectedInside: closeFramesConnected,
                  coveragePct: closeFrames ? +(100 * closeFramesConnected / closeFrames).toFixed(1) : null,
                  shareOfHitsInsidePct: b.ranges.length ? +(100 * b.closeHits / b.ranges.length).toFixed(1) : null },
    otherDamageSources: others,
  };
}

const out = [];
for (const id of IDS) {
  const r = audit(id); out.push(r);
  console.error(`  ${r.id.padEnd(22)} ${String(r.starter).padEnd(26)} hits ${String(r.hitsPerMin).padStart(4)}/min  ` +
    `dmg/hit ${String(r.damagePerHit).padStart(5)}  range p10 ${String(r.hitRangePx.p10).padStart(4)} med ${String(r.hitRangePx.median).padStart(4)} p90 ${String(r.hitRangePx.p90).padStart(4)}  ` +
    `close<=70 cover ${String(r.closeRange.coveragePct).padStart(5)}%  dps ${String(r.dps).padStart(6)}  kills/min ${r.killsPerMin}`);
}
console.log(JSON.stringify(out, null, 1));
