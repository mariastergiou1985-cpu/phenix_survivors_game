/**
 * DAMAGE INTEGRITY REGRESSION (Maria 2026-08-02, Batch W2)
 *
 * Guards the five critical defects found by the weapon-ecosystem audit. Every number in the
 * comments below was measured by execution against the pristine tree before the fix.
 *
 *  K1  _capBossDamage was not a cap. Past the budget `room` is 0, and the old expression
 *      `room + (rawDmg - room) * 0.2` still delivered rawDmg * 0.2 on EVERY further hit inside
 *      the same 1 s window, without limit. Measured: 60 hits of raw 1000 against a mega boss
 *      applied 12 068 against an 85 budget — a 142x overshoot. Now the leak is itself budgeted.
 *
 *  K2  _brawlerTargets() pushed every entry of game.enemies with no hp filter, and _brawlerHit()
 *      had no guard at all, so corpses were damageable from a stale snapshot. Enemy._die() was
 *      also re-entrant. Measured: one enemy paid out 3 kills, 3 XP, 3 nexus charges and 3 score.
 *
 *  K3  A single non-finite damage value wrote e.hp = NaN. From then on NaN <= 0 is false in every
 *      check in the engine, so the enemy was immortal for the rest of the run.
 *
 *  K4  WEAPON_VFX_META.nexus_chakram asked for a 6x4 grid of 256 px frames, but the sheet it was
 *      pointed at is 332x220 — 23 of the 24 source rects fell outside the image, so the Brawler's
 *      signature weapon played one partial crop and 23 blank frames.
 *
 *  K5  The three procedural weather loops are stopped only from inside _drawWeatherTheater, which
 *      draw() never reaches in the menu. stopAll() ignored them too, so rain/wind/rumble played
 *      permanently under the menu theme after death, victory or returning to the menu.
 *
 * Run: node tools/qa/damage_integrity_regression.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { getElementById: () => null,
  createElement: () => ({ style: {}, getContext: () => null, width: 0, height: 0 }),
  querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} };
globalThis.Image = globalThis.Image || class { constructor() { this.src = ''; this.complete = false; this.naturalWidth = 0; } };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null };
globalThis.performance = globalThis.performance || { now: () => 0 };
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);

// MODULE IDENTITY: BuildEngineChars1-5 + BuildEnginePassives register into this exact specifier.
const BE = await import('../../js/game/BuildEngine.js?v=20260902100000');
for (const m of ['BuildEngineChars1', 'BuildEngineChars2', 'BuildEngineChars3',
                 'BuildEngineChars4', 'BuildEngineChars5', 'BuildEnginePassives'])
  await import(`../../js/game/${m}.js?v=20260902100000`);

// ── K1 — the boss cap actually bounds ──────────────────────────────────────
// _capBossDamage is a Game method with no dependencies on game state beyond `this`, so it is
// exercised against a minimal receiver rather than booting the whole Game class.
const GameSrc = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const capBody = GameSrc.match(/_capBossDamage\(boss, rawDmg\) \{[\s\S]*?\n  \}/);
console.log('\n── 1. K1 — _capBossDamage is a ceiling, not a diminishing return ──');
{
  ok('_capBossDamage found in Game.js', !!capBody);
  const fn = new Function('BOSS_DPS_CAP_MEGA', 'BOSS_DPS_CAP_MINI',
    'return function ' + capBody[0] + ';')(40, 60);
  const ctx = { endless: true, timeAlive: 10, _stageBossInvulnerable: () => false };
  const mega = { isMegaBoss: true };
  let total = 0;
  for (let i = 0; i < 60; i++) total += fn.call(ctx, mega, 1000);
  const cap = 85;                                   // endless mega budget, read from Game.js
  ok('60 raw-1000 hits in one window stay inside cap * 1.2',
     total <= cap * 1.2 + 1e-6, `applied ${total.toFixed(1)} against cap ${cap} (was 12068)`);
  ok('the overshoot is bounded, not 142x', total < cap * 2, `applied ${total.toFixed(1)}`);
  // a fresh window must restore the full budget
  ctx.timeAlive = 12;
  const first = fn.call(ctx, mega, 1000);
  // A single hit may deliver the whole budget plus the whole leak allowance: cap * 1.2.
  ok('a new 1 s window restores the budget', first > 0 && first <= cap * 1.2 + 1e-6, `got ${first}`);
  // non-finite input must not poison the accumulator
  const boss2 = { isMegaBoss: false };
  ctx.timeAlive = 20;
  ok('NaN raw damage returns 0', fn.call(ctx, boss2, NaN) === 0);
  ok('NaN did not poison the accumulator', Number.isFinite(boss2._dpsAccum || 0),
     `accum ${boss2._dpsAccum}`);
  ok('negative raw damage returns 0 (cannot heal)', fn.call(ctx, boss2, -500) === 0);
  const after = fn.call(ctx, boss2, 30);
  ok('a normal hit still lands after the rejected ones', after === 30, `got ${after}`);
}

// ── K2 — corpses are not damageable and _die is not re-entrant ─────────────
console.log('\n── 2. K2 — corpses are not damageable, kills are not double-paid ──');
{
  const src = GameSrc;
  const tgt = src.match(/_brawlerTargets\(\) \{[\s\S]*?\n  \}/)[0];
  ok('_brawlerTargets filters hp <= 0 on the array branch',
     /for \(const e of this\.enemies\) \{[^}]*hp > 0/.test(tgt), 'array branch has no hp guard');
  const hit = src.match(/_brawlerHit\(t, dmg, color\) \{[\s\S]*?\n    if \(t\.arr\)/)[0];
  ok('_brawlerHit rejects a dead target', /!\(b\.hp > 0\)/.test(hit));
  ok('_brawlerHit rejects non-finite damage', /Number\.isFinite\(dmg\)/.test(hit));

  const fn = new Function('return function ' + tgt + ';')();
  const alive = { hp: 10, isBoss: () => false }, dead = { hp: 0, isBoss: () => false };
  const nanHp = { hp: NaN, isBoss: () => false };
  const list = fn.call({ enemies: [alive, dead, nanHp], titanBoss: null, annihilatorBoss: null,
                         bloodfangBoss: null, cyberSerpentBoss: null, cyberDragonBoss: null,
                         doubleDemonsBoss: null });
  ok('only the living enemy is returned', list.length === 1 && list[0].obj === alive,
     `got ${list.length} targets`);

  const enemySrc = fs.readFileSync(path.join(ROOT, 'js/entities/Enemy.js'), 'utf8');
  const dieHead = enemySrc.match(/_die\(game\) \{[\s\S]{0,1200}/)[0];
  ok('Enemy._die returns early when already killed', /if \(this\._killed\) return;/.test(dieHead));
  const guardIdx = dieHead.indexOf('if (this._killed) return;');
  const setIdx = dieHead.indexOf('this._killed = true;');
  ok('the guard precedes the marker assignment', guardIdx >= 0 && setIdx > guardIdx,
     `guard@${guardIdx} set@${setIdx}`);
}

// ── K3 — non-finite damage cannot reach e.hp ───────────────────────────────
console.log('\n── 3. K3 — a non-finite value can never make an enemy immortal ──');
{
  const g = { selectedCharacter: 'skeleton_warrior', gameState: 'playing', endless: true,
              _bossRush: false, gameOver: false, victory: false, timeAlive: 60,
              _weaponLevels: new Map(), _consumedWeapons: new Set(), triggerAnnouncement() {},
              player: { pos: { x: 0, y: 0 } }, enemies: [], meta: { getFusionTier: () => 0 } };
  const rt = new BE.BuildEngineRuntime(g);
  const mk = () => ({ hp: 100, maxHp: 100, pos: { x: 10, y: 0 }, radius: 14,
                      isBoss: () => false, takeHit(d) { this.hp -= d; } });
  for (const [label, raw] of [['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity],
                              ['undefined', undefined], ['negative', -50], ['zero', 0]]) {
    const e = mk();
    const applied = rt._dealDamage('marrow_spitter', e, raw, 1, false);
    ok(`${label} raw damage is refused`, applied === false, `returned ${applied}`);
    ok(`  ${label} left hp finite and unchanged`, e.hp === 100, `hp is ${e.hp}`);
  }
  const e2 = mk();
  ok('a normal hit still lands', rt._dealDamage('marrow_spitter', e2, 30, 1, false) !== false);
  ok('  and reduced hp', e2.hp < 100, `hp ${e2.hp}`);
  const e3 = mk();
  rt._dealDamage('marrow_spitter', e3, 30, undefined, false);
  ok('a non-finite bossMult is coerced, not propagated', Number.isFinite(e3.hp), `hp ${e3.hp}`);
  const dead = mk(); dead.hp = NaN;
  ok('an already-NaN hp target is refused',
     rt._dealDamage('marrow_spitter', dead, 30, 1, false) === false);
}

// ── K4 — every VFX sheet's declared grid fits the PNG on disk ──────────────
console.log('\n── 4. K4 — no VFX frame is sampled outside its sheet ──');
{
  const pngSize = (p) => { const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(33);
    fs.readSync(fd, b, 0, 33, 0); fs.closeSync(fd);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
  const metaBlock = GameSrc.match(/const WEAPON_VFX_META = Object\.freeze\(\{[\s\S]*?\n\}\);/)[0];
  const sheetBlock = GameSrc.match(/_weaponVFXSheets[\s\S]*?\n\s*\]/)[0];
  const sheets = {};
  for (const m of sheetBlock.matchAll(/\['([a-z0-9_]+)',\s*'([^']+)'\]/g)) sheets[m[1]] = m[2];
  const metas = {};
  for (const m of metaBlock.matchAll(/^\s*([a-z0-9_]+):\s*\{ cols: (\d+), frameW: (\d+), frameH: (\d+), totalFrames: (\d+)/gm))
    metas[m[1]] = { cols: +m[2], fw: +m[3], fh: +m[4], n: +m[5] };
  ok('VFX meta and sheet tables both parsed', Object.keys(metas).length > 5 && Object.keys(sheets).length > 5,
     `${Object.keys(metas).length} metas / ${Object.keys(sheets).length} sheets`);
  const bad = [];
  for (const [id, meta] of Object.entries(metas)) {
    const rel = sheets[id]; if (!rel) continue;
    const abs = path.join(ROOT, rel.split('?')[0]);
    if (!fs.existsSync(abs)) { bad.push(`${id}: file missing ${rel}`); continue; }
    const { w, h } = pngSize(abs);
    const rows = Math.ceil(meta.n / meta.cols);
    if (meta.cols * meta.fw > w || rows * meta.fh > h)
      bad.push(`${id}: needs ${meta.cols * meta.fw}x${rows * meta.fh}, sheet is ${w}x${h}`);
  }
  ok('every declared grid fits inside its PNG', bad.length === 0, bad.join(' | '));
  ok('nexus_chakram specifically is in range', !bad.some(b => b.startsWith('nexus_chakram')));
}

// ── K5 — the weather loops have a stop path outside the draw call ──────────
console.log('\n── 5. K5 — weather loops cannot outlive the run ──');
{
  const amSrc = fs.readFileSync(path.join(ROOT, 'js/audio/AudioManager.js'), 'utf8');
  const stopAll = amSrc.match(/stopAll\(\) \{[\s\S]*?\n  \}/)[0];
  ok('stopAll() releases every forge loop', /_forgeLoops/.test(stopAll),
     'stopAll still ignores the looping voices');
  const menu = GameSrc.match(/for \(const _loop of \[[^\]]*\]\) this\.audio\?\.forgeLoopStop[\s\S]{0,80}/)?.[0] || '';
  ok('the menu boundary stops rain, rumble and wind',
     /forgeLoopStop/.test(menu) && /rain/.test(menu) && /rumble/.test(menu) && /wind/.test(menu));
  // the only other stop site must still be the weather theatre itself
  const sites = (GameSrc.match(/forgeLoopStop/g) || []).length;
  ok('Game.js has both the theatre stops and the boundary stop', sites >= 4, `${sites} call sites`);
}


// ── W3 — declared stats are the applied stats; status keys all expire ──────
console.log('\n── 6. W3 — critMult, markBonus, slowFactor, scars, smites ──');
{
  const g2 = { enemies: [], player: { pos: { x: 0, y: 0 } }, selectedCharacter: 'x', timeAlive: 0,
               _weaponLevels: new Map(), _consumedWeapons: new Set(), triggerAnnouncement() {},
               meta: { getFusionTier: () => 0 } };
  const rt2 = new BE.BuildEngineRuntime(g2);
  let diverge = [];
  for (const [id, d] of Object.entries(BE.WEAPON_DEFS)) {
    if (!d.critMult) continue;
    if (Math.abs(rt2._critMult(id) - d.critMult) > 1e-9) diverge.push(id);
  }
  ok('every declared critMult is the one actually applied', diverge.length === 0,
     `${diverge.length} diverge (was 17): ${diverge.join(',')}`);
  ok('an evolution inherits its base weapon crit', Math.abs(rt2._critMult('be_wire_garrote_web') - 2.2) < 1e-9,
     `got ${rt2._critMult('be_wire_garrote_web')}`);
  ok('an unknown / legacy id keeps the historical 1.6', rt2._critMult('plasma_blade') === 1.6);

  const beSrc = fs.readFileSync(path.join(ROOT, 'js/game/BuildEngine.js'), 'utf8');
  ok('markBonus is read from the weapon def, not hardcoded', /markBonus \?\? 0\.12/.test(beSrc));
  ok('scars expire in _tickStatus', /scarsT/.test(beSrc));

  const enemySrc2 = fs.readFileSync(path.join(ROOT, 'js/entities/Enemy.js'), 'utf8');
  ok('slowFactor is restored when its timer expires', /slowTimer <= 0\) this\.slowFactor = 0\.55/.test(enemySrc2));
  const rawWrites = [];
  for (const f of ['js/game/BuildEngine.js', 'js/game/BuildEngineChars2.js', 'js/game/BuildEngineChars4.js']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of t.matchAll(/e\.slowFactor = ([^;]+);/g))
      if (!/Math\.min/.test(m[1])) rawWrites.push(f + ': ' + m[1].trim());
  }
  ok('no status source overwrites a stronger slow', rawWrites.length === 0, rawWrites.join(' | '));

  const c3 = fs.readFileSync(path.join(ROOT, 'js/game/BuildEngineChars3.js'), 'utf8');
  ok('smites are capped', /SMITE_CAP/.test(c3));
  ok('smites no longer retain a dead Enemy', !/smites\.push\(\{ x: [^}]*\be\b[,:]/.test(c3));

  const gs = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
  ok('the endless cull drops the status entry', /_status\?\.delete\(e\)/.test(gs));
  // Every place that drives an enemy's hp to 0 outside takeHit() must route the kill through
  // _die(), or the enemy stays in game.enemies: still moving, still dealing contact damage, and
  // served to every targeting helper as a live target.
  const zombies = [];
  for (const re of [/e\.hp -= DPS \* dt;/g, /\n\s*e\.hp = 0;/g]) {
    for (const m of gs.matchAll(re)) {
      const after = gs.slice(m.index, m.index + 420);
      if (!/_die/.test(after)) zombies.push(gs.slice(0, m.index).split('\n').length);
    }
  }
  ok('no vessel effect leaves a live zombie behind', zombies.length === 0,
     `unrouted hp writes at Game.js line(s) ${zombies.join(', ')}`);
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail ? 1 : 0);
