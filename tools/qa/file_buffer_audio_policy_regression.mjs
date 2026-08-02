/**
 * FILE-BUFFER AUDIO POLICY REGRESSION (Maria 2026-08-02)
 *
 * Guards the fix for the repeated tonal "pew-pew" that survived two earlier passes.
 * Both of those passes audited OSCILLATORS. The dominant repeated cue was never an
 * oscillator: playEnemyDeath is a FILE buffer at vol 0.85 on an 80 ms floor (measured
 * 13.6 calls/s in Endless), and _playSfxBuffer() bypassed the polyphony budget entirely,
 * so file cues obeyed no voice cap at all while every synthesized cue did.
 *
 * Measured on recorded system audio of a 150 s Endless run, silencing ONLY playEnemyDeath:
 *   power 150-700 Hz  -80.9%   ·   total power  -59.9%   ·   output RMS  -36.8%
 *
 * These tests pin: the canonical voice budget on the file path, the guard-before-budget
 * ordering (a rejected cue must never spend a slot), the per-key concurrency cap and its
 * release, the MIX.impact gate on the five measured tonal offenders, and the fact that
 * authored boss/event cues and the weapon-fire policy were NOT touched.
 *
 * Run: node tools/qa/file_buffer_audio_policy_regression.mjs
 */
import { AudioManager } from '../../js/audio/AudioManager.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

// ── minimal WebAudio + localStorage doubles (same shape as audio_mix_regression) ──
function makeParam(v) {
  return { value: v,
    setValueAtTime(x) { this.value = x; return this; },
    linearRampToValueAtTime(x) { this.value = x; return this; },
    exponentialRampToValueAtTime(x) { this.value = x; return this; },
    setTargetAtTime(x) { this.value = x; return this; },
    cancelScheduledValues() { return this; } };
}
function makeNode(kind) {
  return { __kind: kind, __out: [], gain: makeParam(1),
    threshold: makeParam(0), knee: makeParam(0), ratio: makeParam(1),
    attack: makeParam(0), release: makeParam(0), frequency: makeParam(0), Q: makeParam(1),
    type: '', fftSize: 64, smoothingTimeConstant: 0, frequencyBinCount: 32,
    connect(d) { this.__out.push(d); return d; }, disconnect() { this.__out.length = 0; } };
}
let CLOCK = 0;                       // drives actx.currentTime so retrigger floors are testable
const started = { osc: 0, buffer: 0 };
function installEnv() {
  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; },
    get length() { return Object.keys(store).length; }, key: i => Object.keys(store)[i] };
  const destination = makeNode('destination');
  global.AudioContext = function () {
    return { state: 'running', get currentTime() { return CLOCK; }, destination, sampleRate: 48000,
      createGain: () => makeNode('gain'),
      createDynamicsCompressor: () => makeNode('comp'),
      createAnalyser: () => makeNode('analyser'),
      createBiquadFilter: () => makeNode('filter'),
      createOscillator: () => ({ ...makeNode('osc'), start() { started.osc++; }, stop() {} }),
      createBufferSource: () => ({ ...makeNode('src'), buffer: null, onended: null,
                                   start() { started.buffer++; }, stop() {} }),
      createBuffer: () => ({ duration: 1, getChannelData: () => new Float32Array(64) }),
      createMediaStreamDestination: () => makeNode('msd'),
      decodeAudioData: () => Promise.resolve({ duration: 1 }), resume: () => Promise.resolve() };
  };
  global.webkitAudioContext = global.AudioContext;
  global.fetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  global.window = global.window || {};
  global.document = global.document || { getElementById: () => null, createElement: () => ({ style: {} }) };
}
const fresh = () => { CLOCK = 0; started.osc = 0; started.buffer = 0; installEnv(); return new AudioManager(); };
// pretend the enemy-death file finished decoding
const loadDeath = (a, duration = 0.4) => { a._sfxBuffers['sfxEnemyDeath'] = { duration }; };

console.log('\n── 1. The policy tables exist and are the measured values ──');
{
  const R = AudioManager.MIX.fileRepeat, I = AudioManager.MIX.impact;
  ok('MIX.fileRepeat declared', !!R);
  ok('fileRepeat attenuates by half (-6.02 dB)', R.vol === 0.50, `got ${R && R.vol}`);
  ok('fileRepeat retrigger floor is 0.14 s (was 0.08)', R.minGap === 0.14, `got ${R && R.minGap}`);
  ok('fileRepeat has a hard concurrency cap', R.cap >= 1 && R.cap <= 4, `got ${R && R.cap}`);
  ok('MIX.impact declared', !!I);
  ok('impact attenuates by half (-6.02 dB)', I.mul === 0.50, `got ${I && I.mul}`);
  ok('impact cap is tighter than fire', I.cap < AudioManager.MIX.fire.cap, `${I && I.cap} vs ${AudioManager.MIX.fire.cap}`);
  const want = ['playXpPickup', 'playSentryDroneHit', 'playVoidNeedleHit', 'playPlasmaBladeHit', 'playRailSpikeImpact'];
  ok('IMPACT_CUES is exactly the five measured offenders',
     AudioManager.IMPACT_CUES.length === want.length && want.every(n => AudioManager.IMPACT_CUES.includes(n)),
     JSON.stringify(AudioManager.IMPACT_CUES));
  for (const n of want) ok(`  ${n} has a declared retrigger floor`, typeof I.perCue[n] === 'number', `got ${I.perCue[n]}`);
}

console.log('\n── 2. File cues no longer bypass the canonical voice budget ──');
{
  const a = fresh(); loadDeath(a);
  // Burn the whole 16-voice window on the synth path, then ask the file path for one.
  for (let i = 0; i < 16; i++) a._tone({ type: 'sine', freqStart: 440, dur: 0.05, gain: 0.1 });
  const oscAfterBurn = started.osc;
  ok('the 16-voice window is genuinely full', oscAfterBurn === 16, `got ${oscAfterBurn}`);
  const played = a._playSfxBuffer('sfxEnemyDeath', 0, 0.5);
  ok('file cue is refused once the budget is spent', played === false, `returned ${played}`);
  ok('and no buffer source was started', started.buffer === 0, `got ${started.buffer}`);
}
{
  const a = fresh(); loadDeath(a);
  const played = a._playSfxBuffer('sfxEnemyDeath', 0, 0.5);
  ok('with budget available the file cue does play', played === true);
  ok('exactly one buffer source started', started.buffer === 1, `got ${started.buffer}`);
  ok('it charged exactly one voice slot', a._voiceCount === 1, `got ${a._voiceCount}`);
}

console.log('\n── 3. A rejected cue never spends a voice slot ──');
{
  const a = fresh(); loadDeath(a); a.muted = true;
  a._playSfxBuffer('sfxEnemyDeath', 0, 0.5);
  ok('muted file cue spends no slot', !a._voiceCount, `got ${a._voiceCount}`);
  a._tone({ type: 'sine', freqStart: 440, dur: 0.05, gain: 0.1 });
  ok('muted _tone spends no slot', !a._voiceCount, `got ${a._voiceCount}`);
  a._noiseBurst({ dur: 0.05, gain: 0.1 });
  ok('muted _noiseBurst spends no slot', !a._voiceCount, `got ${a._voiceCount}`);
}
{
  const a = fresh();                       // buffer never loaded
  const played = a._playSfxBuffer('sfxEnemyDeath', 0, 0.5);
  ok('un-loaded buffer is refused', played === false);
  ok('un-loaded buffer spends no slot', !a._voiceCount, `got ${a._voiceCount}`);
}
{
  const a = fresh(); loadDeath(a);
  a._playSfxBuffer('sfxEnemyDeath', 1.0, 0.5);
  const slotsAfterFirst = a._voiceCount;
  const played = a._playSfxBuffer('sfxEnemyDeath', 1.0, 0.5);   // inside the floor
  ok('throttled repeat is refused', played === false);
  ok('throttled repeat spends no extra slot', a._voiceCount === slotsAfterFirst, `got ${a._voiceCount}`);
}

console.log('\n── 4. Per-key concurrency cap is bounded and releases ──');
{
  const a = fresh(); loadDeath(a);
  const sources = [];
  const origBS = a.actx.createBufferSource.bind(a.actx);
  a.actx.createBufferSource = () => { const s = origBS(); sources.push(s); return s; };
  let plays = 0;
  for (let i = 0; i < 40; i++) { CLOCK += 1.0; a._voiceWin = 0; a._voiceCount = 0;
                                 if (a._playSfxBuffer('sfxEnemyDeath', 0.14, 0.5, 2)) plays++; }
  ok('cap bounds simultaneous file voices', (a._fileActive.sfxEnemyDeath || 0) <= 2,
     `active ${a._fileActive.sfxEnemyDeath}`);
  ok('40 rapid calls cannot start more than the cap', plays === 2, `plays ${plays}`);
  ok('every started source carries a release handler', sources.length > 0 && sources.every(s => typeof s.onended === 'function'),
     `${sources.length} sources`);
  // playback finishes → the engine fires onended → the slot comes back
  sources.forEach(s => s.onended());
  ok('finished playback releases the cap', (a._fileActive.sfxEnemyDeath || 0) === 0,
     `active ${a._fileActive.sfxEnemyDeath}`);
  CLOCK += 1.0; a._voiceWin = 0; a._voiceCount = 0;
  ok('the cue is playable again after release', a._playSfxBuffer('sfxEnemyDeath', 0.14, 0.5, 2) === true);
}
{
  // Double release (onended AND the belt-and-braces timer) must not drive the counter
  // negative — a negative counter would let the cap be exceeded forever.
  const a = fresh(); loadDeath(a);
  const sources = [];
  const origBS = a.actx.createBufferSource.bind(a.actx);
  a.actx.createBufferSource = () => { const s = origBS(); sources.push(s); return s; };
  CLOCK = 10;
  a._playSfxBuffer('sfxEnemyDeath', 0.14, 0.5, 1);
  ok('one voice is active', a._fileActive.sfxEnemyDeath === 1, `got ${a._fileActive.sfxEnemyDeath}`);
  sources[0].onended(); sources[0].onended(); sources[0].onended();
  ok('repeated release is idempotent, never negative', a._fileActive.sfxEnemyDeath === 0,
     `got ${a._fileActive.sfxEnemyDeath}`);
}

console.log('\n── 5. playEnemyDeath uses the policy, and stays audible ──');
{
  const a = fresh(); loadDeath(a);
  let vol = null;
  const orig = a._playSfxBuffer.bind(a);
  a._playSfxBuffer = (k, g, v, c) => { vol = v; return orig(k, g, v, c); };
  a.playEnemyDeath();
  const R = AudioManager.MIX.fileRepeat;
  ok('enemy death plays at 0.85 x fileRepeat.vol', Math.abs(vol - 0.85 * R.vol) < 1e-9, `got ${vol}`);
  ok('enemy death is still clearly audible (not silenced)', vol > 0.3, `got ${vol}`);
  ok('a voice actually started', started.buffer === 1, `got ${started.buffer}`);
}
{
  const a = fresh();                       // buffer not loaded → procedural fallback path
  a.playEnemyDeath();
  ok('un-loaded enemy death still makes a sound (never silent)', started.osc + started.buffer > 0,
     `osc ${started.osc} buf ${started.buffer}`);
}

console.log('\n── 6. The five tonal offenders are gated ──');
{
  const a = fresh();
  const I = AudioManager.MIX.impact;
  for (const cue of AudioManager.IMPACT_CUES) {
    CLOCK += 100;                                   // well clear of any floor
    started.osc = 0; a._voiceWin = 0; a._voiceCount = 0;
    a[cue]();
    const firstVoices = started.osc;
    ok(`${cue} sounds when free`, firstVoices > 0, `got ${firstVoices}`);
    started.osc = 0;
    a[cue]();                                        // immediate repeat, inside the floor
    ok(`${cue} immediate repeat is gated out`, started.osc === 0, `got ${started.osc}`);
  }
}
{
  const a = fresh();
  CLOCK = 500;
  let g = null;
  const origTone = a._tone.bind(a);
  a._tone = (o) => { if (g === null) g = o.gain * (a._fireMul || 1); return origTone(o); };
  a.playRailSpikeImpact();
  ok('gated impact voice is attenuated by MIX.impact.mul',
     Math.abs(g - 0.20 * AudioManager.MIX.impact.mul) < 1e-9, `got ${g}`);
}

console.log('\n── 7. Nothing else was re-tuned ──');
{
  const F = AudioManager.MIX.fire;
  ok('weapon-fire multiplier untouched', F.mul === 0.50, `got ${F.mul}`);
  ok('weapon-fire floor untouched', F.minGap === 0.09, `got ${F.minGap}`);
  ok('weapon-fire cap untouched', F.cap === 3, `got ${F.cap}`);
  ok('weapon-fire perCue still only the two declared floors',
     Object.keys(F.perCue).length === 2, JSON.stringify(F.perCue));
  ok('boss boost untouched', AudioManager.MIX.bossBoost === 2.00);
  ok('event boost untouched', AudioManager.MIX.eventBoost === 2.00);
  ok('enemy-tell boost untouched', AudioManager.MIX.tellBoost === 1.50);
  const a = fresh();
  ok('SFX bus is NOT globally reduced', a.sfxGain.gain.value === a.sfxVolume,
     `${a.sfxGain.gain.value} vs ${a.sfxVolume}`);
  ok('master bus is NOT globally reduced', a.masterGain.gain.value === a.masterVolume);
  ok('sfx compressor threshold untouched', a.sfxComp.threshold.value === -16, `got ${a.sfxComp.threshold.value}`);
  ok('master limiter threshold untouched', a.masterLimiter.threshold.value === -6);
  ok('master trim ceiling untouched', a.masterTrim.gain.value === 0.80);
}

console.log('\n── 8. Authored boss / event cues still fire ──');
{
  const a = fresh();
  CLOCK = 900;
  let bossVol = null, eventVol = null;
  a._wave1Play = (bucket, id, gap, vol) => { if (/boss/i.test(bucket)) bossVol = vol; else eventVol = vol; return 'played'; };
  a.playBossTelegraph('mech');
  a.playEventClass('airstrike');
  ok('boss telegraph still routed with its boost', bossVol !== null && bossVol > 1.0, `got ${bossVol}`);
  ok('event class still routed with its boost', eventVol !== null && eventVol > 1.0, `got ${eventVol}`);
  started.osc = 0;
  // forgeBossRoar is throttled by _forgeOk('roar', 2500), which compares against
  // performance.now(). In a freshly started process that clock is still below 2500, so the
  // first call is refused for reasons that have nothing to do with this fix. Clear the
  // stamp so the test measures the cue, not the process uptime.
  a._forgeLast = { roar: -1e9 };
  a.forgeBossRoar();
  ok('boss roar still starts voices', started.osc > 0, `got ${started.osc}`);
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail ? 1 : 0);
