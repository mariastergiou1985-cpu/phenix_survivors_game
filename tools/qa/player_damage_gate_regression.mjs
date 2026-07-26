// PLAYER DAMAGE GATE REGRESSION (2026-07-26)
// ------------------------------------------------------------------------------------------------
// Guards three things a probe proved were broken at 6427156:
//   1. Every direct `player.applyDamage` call in Game.js is one of the two sanctioned pulses, and
//      each of them applies the gates _damagePlayer would have applied (Chaos entry grace, the
//      30-HP per-hit ceiling, the Glitch Phantom dodge). A THIRD bypass fails the build.
//   2. The Chaos entry grace actually protects against the horde. Before the fix the first contact
//      hit landed at t=2.13s with the 2.5s window armed, because contact damage skipped the gate.
//   3. Lightning Storm cannot chain-delete: bolts that hit the player are spaced by LIGHTNING_HIT_CD.
//   4. No QA harness re-opens the module-instance trap (importing Enemy.js under a specifier that
//      differs from production's, which silently gives the harness its own copy of the class).
import { register } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const GAME_SRC = readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');

let pass = 0, fail = 0;
const T = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

// ── 1. static: every direct applyDamage is inside one of the two gates ───────────────────────────
console.log('\n[1] Direct player.applyDamage call sites in Game.js');
const lines = GAME_SRC.split('\n');
const sites = [];
lines.forEach((l, i) => { if (/this\.player\.applyDamage\s*\(/.test(l)) sites.push(i + 1); });
T('exactly 2 direct applyDamage sites', sites.length === 2, `found ${sites.length} at lines ${sites.join(', ')}`);
const enclosing = ln => {
  for (let i = ln - 1; i >= 0; i--) {
    const m = lines[i].match(/^  ([A-Za-z_][\w]*)\s*\(/);
    if (m) return m[1];
  }
  return '(top level)';
};
const owners = sites.map(enclosing).sort();
T('both live in _applyPulseDamage / _damagePlayer',
  owners.length === 2 && owners[0] === '_applyPulseDamage' && owners[1] === '_damagePlayer',
  owners.join(', '));

const pulseGate = (GAME_SRC.match(/_applyPulseDamage\(dmg, \{[\s\S]*?\n  \}/) || [''])[0];
T('_applyPulseDamage honours _chaosEntryGraceT', pulseGate.includes('_chaosEntryGraceT'));
T('_applyPulseDamage honours BOSS_MAX_PLAYER_HIT ceiling', pulseGate.includes('BOSS_MAX_PLAYER_HIT'));
T('_applyPulseDamage honours the glitch_dodge vessel passive', pulseGate.includes('glitch_dodge'));

const callers = (GAME_SRC.match(/this\._applyPulseDamage\(/g) || []).length;
T('all 4 own-cadence pulses route through it (horde, trails, Titan, Annihilator)', callers === 4,
  `${callers} call sites`);

// ── runtime setup ────────────────────────────────────────────────────────────────────────────────
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mulberry32 = a => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let vclock = 0;
globalThis.performance = { now: () => vclock };
const RealDate = globalThis.Date;
globalThis.Date = class extends RealDate {
  static now() { return vclock; }
  constructor(...args) { if (args.length) super(...args); else super(vclock); }
};
const unmuteImports = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Vec2 } = await import(pathToFileURL(path.join(ROOT, 'js/constants.js')).href);
unmuteImports();

// ── 2. runtime: Chaos entry grace holds against the horde ────────────────────────────────────────
console.log('\n[2] Chaos entry grace (2.5s) covers contact damage');
{
  const unmute = muteConsole();
  Math.random = mulberry32(12345);
  vclock = 0;
  const game = new Game();
  game.audio = null;
  game.selectedCharacter = 'euclid_vector';
  game.gameState = 'playing';
  game._beginChaosRun();
  const maxHp = game.player.maxHp;
  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  let firstLoss = null;
  for (let f = 0; f < Math.round(2.4 * 60); f++) {
    vclock += 1000 / 60;
    if (game.upgradeUI) game.selectUpgrade(0);
    if (game.mutationUI) game.selectMutation(0);
    game.update(1 / 60, input);
    if (firstLoss === null && game.player.hp < maxHp) firstLoss = +(vclock / 1000).toFixed(2);
  }
  unmute();
  T('no HP lost inside the armed grace window', firstLoss === null,
    `first loss at t=${firstLoss}s (hp ${game.player.hp}/${maxHp})`);
  T('grace is still a finite window, not permanent immunity', game._chaosEntryGraceT <= 0.11,
    `remaining ${game._chaosEntryGraceT}`);
}

// ── 3. runtime: Lightning Storm anti-chain window ────────────────────────────────────────────────
console.log('\n[3] Lightning Storm cannot chain-delete the player');
{
  const unmute = muteConsole();
  Math.random = mulberry32(777);
  vclock = 0;
  const game = new Game();
  game.audio = null;
  game.selectedCharacter = 'euclid_vector';
  game.gameState = 'playing';
  game.reset();
  game._enterEndless();
  game._stormActive = 0;          // no new zones — this test drives the strikes itself
  game.lightningZones.length = 0;
  const strike = () => {
    game.playerHitCooldown = 0;   // isolate the new gate from the shared 0.5s grace
    game.lightningZones.push({ pos: game.player.pos.clone(), radius: 64, warn: 0, flash: 0.35, t: 0, struck: false });
    const before = game.player.hp;
    game._updateEndlessHazards(1 / 60);
    return +(before - game.player.hp).toFixed(2);
  };
  const advance = seconds => { for (let f = 0; f < Math.round(seconds * 60); f++) game._updateEndlessHazards(1 / 60); };
  const hit1 = strike();
  advance(0.6);
  const hit2 = strike();
  advance(1.3);
  const hit3 = strike();
  unmute();
  T('first bolt damages the player', hit1 > 0, `lost ${hit1}`);
  T('per-hit ceiling still applies to the bolt', hit1 <= 30, `lost ${hit1}`);
  T('second bolt 0.6s later is absorbed by the anti-chain window', hit2 === 0, `lost ${hit2}`);
  T('third bolt after the window lands at full weight', hit3 > 0, `lost ${hit3}`);
}

// ── 4. static: no harness re-opens the module-instance trap ──────────────────────────────────────
console.log('\n[4] QA harnesses import Enemy.js as ONE module instance with production');
{
  const prod = (GAME_SRC.match(/entities\/Enemy\.js(\?[^']*)?'/) || [])[1] || '';
  const files = readdirSync(path.join(ROOT, 'tools/qa')).filter(f => f.endsWith('.mjs'));
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(path.join(ROOT, 'tools/qa', f), 'utf8');
    const stripped = /register\(\s*'\.\/strip-v-loader\.mjs'/.test(src);
    for (const m of src.matchAll(/Enemy\.js'\)\)\.href(\s*\+\s*'(\?[^']*)')?/g)) {
      const q = m[2] || '';
      const sameInstance = stripped ? (q === '' || q.startsWith('?v=')) : q === prod;
      if (!sameInstance) offenders.push(`${f} -> '${q || '(none)'}'`);
    }
  }
  T('no harness imports Enemy.js under a non-production specifier', offenders.length === 0,
    offenders.join(' | '));
}

console.log(`\nRESULT ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
