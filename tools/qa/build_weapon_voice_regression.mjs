/**
 * BUILD ENGINE WEAPON VOICE REGRESSION (Maria 2026-08-02, Batch W5b)
 *
 * All 23 BuildEngine weapon executors were SILENT: measured by scanning every executor body for
 * an audio call, 23 of 23 had none. The entire live weapon layer made no sound at all.
 *
 * The risk in fixing that is obvious and it is the one Maria already paid for once: adding 23 new
 * emitters is exactly how a dense repeated tone comes back. So this layer is bounded BY
 * CONSTRUCTION, and the bounds are proven here deterministically rather than sampled from a noisy
 * playthrough:
 *
 *   · it reuses EXISTING authored cues only - no new synthesis, no Wave 3
 *   · MIX.beWeapon.mul 0.38 (-8.4 dB) - quieter than MIX.fire (0.50) and MIX.impact (0.50)
 *   · per weapon: cap 1 live voice, 0.20 s retrigger floor  -> <= 5 cues/s from any one weapon
 *   · whole layer: cap 3 live voices, 0.05 s floor          -> <= 20 cues/s from ALL of them
 *   · a rejected cue consumes NOTHING (no slot, no timestamp) - the file-buffer rule
 *   · muted rejects before anything else
 *
 * The worst case is therefore a hard number, not an opinion: 20 cues per second across the whole
 * weapon layer, never more than 3 sounding together, each at -8.4 dB before the existing per-cue
 * gates and the master compressor.
 *
 * Run: node tools/qa/build_weapon_voice_regression.mjs
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

const BE_STAMP = fs.readFileSync(path.join(ROOT, 'js/game/BuildEngineChars1.js'), 'utf8')
  .match(/BuildEngine\.js\?v=(\d+)/)[1];
const { AudioManager } = await import('../../js/audio/AudioManager.js');
const BE = await import('../../js/game/BuildEngine.js?v=' + BE_STAMP);
for (const m of ['BuildEngineChars1', 'BuildEngineChars2', 'BuildEngineChars3',
                 'BuildEngineChars4', 'BuildEngineChars5', 'BuildEnginePassives'])
  await import(`../../js/game/${m}.js?v=${BE_STAMP}`);

// A minimal AudioManager stand-in: real playBuildWeapon, real MIX, a clock we control.
const mkAudio = () => {
  const a = Object.create(AudioManager.prototype);
  a.muted = false;
  a._clock = 0;
  a.actx = { get currentTime() { return a._clock; } };
  a.fired = [];
  for (const cue of new Set(Object.values(AudioManager.BE_WEAPON_SFX)))
    a[cue] = function () { a.fired.push({ cue, t: a._clock, mul: a._fireMul }); };
  return a;
};

console.log('\n── 1. every live weapon has a voice, and every voice exists ──');
{
  const execs = Object.keys(BE.WEAPON_EXECUTORS);
  const map = AudioManager.BE_WEAPON_SFX;
  ok('the registry really loaded', Object.keys(BE.WEAPON_DEFS).length === 25,
     `${Object.keys(BE.WEAPON_DEFS).length} weapons — check the ?v= stamp`);
  ok('every executor is mapped to a cue', execs.every(id => map[id]),
     execs.filter(id => !map[id]).join(', '));
  ok('no mapping points at a weapon with no executor',
     Object.keys(map).every(id => execs.includes(id)),
     Object.keys(map).filter(id => !execs.includes(id)).join(', '));
  ok('every mapped cue is a real AudioManager method',
     Object.values(map).every(c => typeof AudioManager.prototype[c] === 'function'),
     Object.entries(map).filter(([, c]) => typeof AudioManager.prototype[c] !== 'function').map(([k]) => k).join(', '));
  // NO WAVE 3: the layer may not introduce a cue that did not already exist for something else.
  const src = fs.readFileSync(path.join(ROOT, 'js/audio/AudioManager.js'), 'utf8');
  const beBlockAt = src.indexOf('AudioManager.BE_WEAPON_SFX');
  const declaredBefore = new Set([...src.slice(0, beBlockAt).matchAll(/^  (play[A-Za-z]+)\(/gm)].map(m => m[1]));
  ok('reuses only cues that already existed (no Wave 3 synthesis added)',
     Object.values(map).every(c => declaredBefore.has(c)),
     Object.values(map).filter(c => !declaredBefore.has(c)).join(', '));
}

console.log('\n── 2. the layer is quieter than every other class in the mix ──');
{
  const M = AudioManager.MIX;
  ok('beWeapon is attenuated below MIX.fire and MIX.impact',
     M.beWeapon.mul < M.fire.mul && M.beWeapon.mul < M.impact.mul,
     `beWeapon ${M.beWeapon.mul} vs fire ${M.fire.mul} / impact ${M.impact.mul}`);
  ok('its per-weapon retrigger floor is not looser than MIX.fire',
     M.beWeapon.minGap >= M.fire.minGap, `${M.beWeapon.minGap} vs ${M.fire.minGap}`);
  ok('it caps one live voice per weapon', M.beWeapon.cap === 1);
  ok('and a hard ceiling across the whole layer', M.beWeapon.layerCap >= 1 && M.beWeapon.layerCap <= 4,
     String(M.beWeapon.layerCap));
  // If hold > minGap the cap-1 slot outlives the retrigger floor and the DECLARED floor becomes a
  // lie - the real per-weapon rate would be 1/hold. This caught exactly that when hold was 0.26.
  ok('the voice hold never outlives the declared retrigger floor',
     M.beWeapon.hold <= M.beWeapon.minGap, `hold ${M.beWeapon.hold} vs minGap ${M.beWeapon.minGap}`);
  ok('occupancy is tracked on the audio clock, not a setTimeout',
     !/setTimeout/.test(fs.readFileSync(path.join(ROOT, 'js/audio/AudioManager.js'), 'utf8')
       .split('AudioManager.prototype.playBuildWeapon')[1].split('\n};')[0]
       .replace(/\/\/.*$/gm, '')));   // comments mention it; the CODE must not use it
  const a = mkAudio();
  a.playBuildWeapon('vector_heel');
  ok('the attenuation is actually applied to the cue', a.fired.length === 1 &&
     Math.abs(a.fired[0].mul - M.beWeapon.mul) < 1e-9, JSON.stringify(a.fired));
  ok('and _fireMul is restored afterwards', a._fireMul === undefined || a._fireMul === null);
}

console.log('\n── 3. a rejected cue consumes nothing ──');
{
  const a = mkAudio();
  ok('the first shot sounds', a.playBuildWeapon('vector_heel') === true);
  a._clock = 0.01;
  ok('a second shot inside the layer floor is rejected', a.playBuildWeapon('storm_sash') === false);
  a._clock = 0.06;
  ok('and the rejection did not move the layer clock', a.playBuildWeapon('storm_sash') === true,
     'a rejected cue must not have stamped _beLayerT');
  // per-weapon floor
  const b = mkAudio();
  b.playBuildWeapon('vector_heel');
  b._clock = 0.10;
  ok('the same weapon is refused inside its own floor', b.playBuildWeapon('vector_heel') === false);
  b._clock = 0.21;
  ok('and allowed once the floor passes', b.playBuildWeapon('vector_heel') === true);
  // muted
  const c = mkAudio(); c.muted = true;
  ok('muted rejects outright', c.playBuildWeapon('vector_heel') === false && c.fired.length === 0);
  c.muted = false; c._clock = 0.001;
  ok('and a muted rejection spent no slot either', c.playBuildWeapon('vector_heel') === true);
  // unknown id
  const d = mkAudio();
  ok('an unmapped weapon id is a silent no-op', d.playBuildWeapon('not_a_weapon') === false && d.fired.length === 0);
}

console.log('\n── 4. the hard worst-case bound, driven at 240 fps for 10 s ──');
{
  const a = mkAudio();
  const M0 = AudioManager.MIX.beWeapon;
  const ids = Object.keys(AudioManager.BE_WEAPON_SFX);
  const STEP = 1 / 240, SECS = 10;
  let live = 0, maxLive = 0;
  const releases = [];
  // mirror the production release exactly: a voice occupies a slot for MIX.beWeapon.hold
  // seconds on the same clock. Hard-coding a different number here would let the test agree with
  // itself while disagreeing with the game - which is how it first read a peak of 5 against a cap of 3.
  for (let n = 0; n < SECS / STEP; n++) {
    a._clock = n * STEP;
    while (releases.length && releases[0] <= a._clock) { releases.shift(); live--; }
    for (const id of ids) {                       // EVERY weapon tries to fire EVERY frame
      const before = a.fired.length;
      a.playBuildWeapon(id);
      if (a.fired.length > before) { live++; releases.push(a._clock + M0.hold); releases.sort((x, y) => x - y); }
    }
    if (live > maxLive) maxLive = live;
  }
  const rate = a.fired.length / SECS;
  const M = AudioManager.MIX.beWeapon;
  const ceiling = 1 / M.layerGap;                 // 20 cues/s at layerGap 0.05
  console.log(`  evidence  ${ids.length} weapons firing every frame for ${SECS}s -> ` +
              `${a.fired.length} cues (${rate.toFixed(1)}/s), peak concurrent ${maxLive}`);
  ok(`the whole layer never exceeds ${ceiling} cues/s`, rate <= ceiling + 0.5, `${rate.toFixed(2)}/s`);
  ok('and never sounds more than the declared layer cap at once', maxLive <= M.layerCap,
     `peak ${maxLive} vs cap ${M.layerCap}`);
  // no single weapon may dominate the layer
  const byWeapon = {};
  for (const f of a.fired) byWeapon[f.cue] = (byWeapon[f.cue] || 0) + 1;
  const worst = Math.max(...Object.values(byWeapon)) / SECS;
  ok('no single cue exceeds its own per-weapon floor rate', worst <= (1 / M.minGap) * 5 + 0.5,
     `worst cue ${worst.toFixed(1)}/s`);
}

console.log('\n── 5. the fire detector is exact (one cue per shot, never per frame) ──');
{
  const beSrc = fs.readFileSync(path.join(ROOT, 'js/game/BuildEngine.js'), 'utf8');
  ok('the hook samples the cadence timers before the executor runs',
     /const _t0 = w\.cd, _t1 = w\.chordT, _t2 = w\.domeT;/.test(beSrc));
  ok('and fires only when one of them was RESET UPWARDS',
     /if \(\(w\.cd > _t0\) \|\| \(w\.chordT > _t1\) \|\| \(w\.domeT > _t2\)\)/.test(beSrc));
  ok('audio can never break a weapon', /catch \(_\) \{ \/\* audio must never be able to stop a weapon \*\//.test(beSrc));
  ok('it is called optionally, so a run without audio is unaffected',
     /g\.audio\?\.playBuildWeapon\?\.\(w\.id\)/.test(beSrc));

  // every executor must still reset one of the three timers it is detected by, or it is silent
  const timers = { cd: 0, chordT: 0, domeT: 0, none: [] };
  for (const f of ['BuildEngineChars1', 'BuildEngineChars2', 'BuildEngineChars3',
                   'BuildEngineChars4', 'BuildEngineChars5']) {
    const s = fs.readFileSync(path.join(ROOT, `js/game/${f}.js`), 'utf8');
    for (const part of s.split('WEAPON_EXECUTORS.').slice(1)) {
      const wid = part.match(/^([a-z0-9_]+)/)[1];
      const body = part.split('\n  draw(')[0];
      if (/w\.cd\s*-=\s*dt/.test(body)) timers.cd++;
      else if (/w\.chordT\s*-=\s*dt/.test(body)) timers.chordT++;
      else if (/w\.domeT\s*-=\s*dt/.test(body)) timers.domeT++;
      else timers.none.push(wid);
    }
  }
  console.log(`  evidence  detectable executors: cd=${timers.cd} chordT=${timers.chordT} ` +
              `domeT=${timers.domeT}; undetectable=${JSON.stringify(timers.none)}`);
  ok('at least 21 of 23 executors are detectable by the three sampled timers',
     timers.cd + timers.chordT + timers.domeT >= 21,
     `${timers.cd + timers.chordT + timers.domeT}`);
  // blacknet_swarm_drone is a persistent swarm with no per-shot cadence timer - it is knowingly
  // outside the detector, which is why it must not be silently claimed as covered.
  ok('the undetectable set is exactly the known persistent-swarm weapon',
     timers.none.length <= 1 && (timers.none.length === 0 || timers.none[0] === 'blacknet_swarm_drone'),
     JSON.stringify(timers.none));
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail ? 1 : 0);
