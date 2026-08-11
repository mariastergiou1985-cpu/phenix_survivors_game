/**
 * AUDIO MIX REGRESSION (Maria 2026-08-01)
 *
 * Guards the fix for the -47 LUFS silence: a stored master of 0.0172 made the whole
 * game inaudible while the SFX slider still read 88%. These tests pin the repair, the
 * bus routing, and the headroom so the same silence cannot come back unnoticed.
 *
 * Run: node tools/qa/audio_mix_regression.mjs
 */
import { AudioManager } from '../../js/audio/AudioManager.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

// ── minimal WebAudio + localStorage doubles ────────────────────────────────
function makeParam(v) {
  return { value: v,
    setValueAtTime(x) { this.value = x; return this; },
    linearRampToValueAtTime(x) { this.value = x; return this; },
    exponentialRampToValueAtTime(x) { this.value = x; return this; },
    setTargetAtTime(x) { this.value = x; return this; },   // mute uses a smoothed ramp
    cancelScheduledValues() { return this; } };
}
function makeNode(kind) {
  return { __kind: kind, __out: [], gain: makeParam(1),
    threshold: makeParam(0), knee: makeParam(0), ratio: makeParam(1),
    attack: makeParam(0), release: makeParam(0), frequency: makeParam(0), Q: makeParam(1),
    type: '', fftSize: 64, smoothingTimeConstant: 0, frequencyBinCount: 32,
    connect(d) { this.__out.push(d); return d; }, disconnect() { this.__out.length = 0; } };
}
function installEnv(stored) {
  const store = { ...stored };
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; },
    get length() { return Object.keys(store).length; }, key: i => Object.keys(store)[i],
  };
  const destination = makeNode('destination');
  global.AudioContext = function () {
    return { state: 'running', currentTime: 0, destination, sampleRate: 48000,
      createGain: () => makeNode('gain'),
      createDynamicsCompressor: () => makeNode('comp'),
      createAnalyser: () => makeNode('analyser'),
      createBiquadFilter: () => makeNode('filter'),
      createOscillator: () => ({ ...makeNode('osc'), start() {}, stop() {} }),
      createBufferSource: () => ({ ...makeNode('src'), buffer: null, start() {}, stop() {} }),
      createBuffer: () => ({ duration: 1, getChannelData: () => new Float32Array(64) }),
      createMediaStreamDestination: () => makeNode('msd'),
      decodeAudioData: () => Promise.resolve({ duration: 1 }), resume: () => Promise.resolve() };
  };
  global.webkitAudioContext = global.AudioContext;
  global.fetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  global.window = global.window || {};
  global.document = global.document || { getElementById: () => null, createElement: () => ({ style: {} }) };
  return store;
}
const K = { master: 'phenix_master_volume', music: 'phenix_music_volume',
            sfx: 'phenix_sfx_volume', eden: 'phenix_eden_volume', muted: 'phenix_muted' };

console.log('\n── 1. Maria\'s actual broken save is repaired ──');
{
  const store = installEnv({ [K.master]: '0.01716000337890751', [K.music]: '0.46260157713483974',
                             [K.sfx]: '0.87932667881175760', [K.eden]: '0.10893233697895509' });
  const a = new AudioManager();
  ok('master repaired away from 1.7%', a.masterVolume >= 0.05, `got ${a.masterVolume}`);
  ok('master restored to the audible default', a.masterVolume === 1.0, `got ${a.masterVolume}`);
  ok('repair persisted to localStorage', Number(store[K.master]) === 1.0, `stored ${store[K.master]}`);
  ok('repair was recorded for reporting', Array.isArray(a._volumeRepairs) && a._volumeRepairs.length === 1);
  ok('music left untouched (deliberate low music is valid)', Math.abs(a.musicVolume - 0.4626015771) < 1e-6, `got ${a.musicVolume}`);
  ok('sfx left untouched (already audible)', Math.abs(a.sfxVolume - 0.8793266788) < 1e-6, `got ${a.sfxVolume}`);
  ok('eden left untouched', Math.abs(a.edenVolume - 0.1089323369) < 1e-6);
}

console.log('\n── 2. A real mute is never overridden ──');
{
  installEnv({ [K.master]: '0.001', [K.muted]: 'true' });
  const a = new AudioManager();
  ok('muted save keeps its master', a.masterVolume === 0.001, `got ${a.masterVolume}`);
  ok('muted flag survives', a.muted === true);
  ok('no repair applied while muted', a._volumeRepairs.length === 0);
}

console.log('\n── 3. Zero / NaN / junk / out-of-range settings ──');
// A DELIBERATE ZERO IS NOT A CORRUPTED VALUE (AudioManager._repairInaudibleVolumes, 2026-08-04).
// This block used to expect a stored 0 to come back as 0.80. That was the pre-2026-08-04 behaviour
// and it is exactly the bug that decision removed: a player who pulled SFX to 0 got it back at 0.80
// on the next boot and the setting they chose was silently discarded. The ambiguity the repair
// exists to remove is the slider that LOOKS open and is silent, i.e. STRICTLY between 0 and the
// floor — so both halves are pinned here: a true 0 survives untouched, and 0 < v < floor is still
// repaired. NaN / junk still repair, unchanged, two blocks below.
{
  installEnv({ [K.sfx]: '0' });
  const a = new AudioManager();
  ok('sfx of exactly 0 is RESPECTED, not repaired', a.sfxVolume === 0, `got ${a.sfxVolume}`);
  ok('...and no sfx repair is recorded for it', a._volumeRepairs.every(r => r.bus !== 'sfx'),
     JSON.stringify(a._volumeRepairs));
}
{
  installEnv({ [K.sfx]: '0.01' });          // the real failure class: open-looking slider, inaudible
  const a = new AudioManager();
  ok('sfx strictly between 0 and the floor is still repaired', a.sfxVolume === 0.80, `got ${a.sfxVolume}`);
  ok('...and that repair is reported', a._volumeRepairs.some(r => r.bus === 'sfx' && r.from === 0.01),
     JSON.stringify(a._volumeRepairs));
}
{ installEnv({ [K.master]: 'NaN', [K.sfx]: 'banana' });
  const a = new AudioManager();
  ok('NaN master → audible default', a.masterVolume === 1.0, `got ${a.masterVolume}`);
  ok('junk string sfx → audible default', a.sfxVolume === 0.80, `got ${a.sfxVolume}`); }
{ installEnv({ [K.master]: '-5', [K.music]: '400', [K.sfx]: '99' });
  const a = new AudioManager();
  // _loadVolumes clamps BEFORE the repair runs, so -5 reaches _repairInaudibleVolumes as a plain 0,
  // indistinguishable from a player who dragged the slider to the bottom — and by the 2026-08-04
  // decision a true 0 is a choice, not corruption. Asserting 1.0 here demanded the opposite of the
  // shipped rule. The clamp itself is what this line pins now, and it still fails on any leak of a
  // negative (or any silent bounce back to the default).
  ok('negative master clamps to a true 0 and is then respected', a.masterVolume === 0, `got ${a.masterVolume}`);
  ok('...with no master repair recorded', a._volumeRepairs.every(r => r.bus !== 'master'),
     JSON.stringify(a._volumeRepairs));
  ok('0-100 style music value clamped to 1', a.musicVolume === 1, `got ${a.musicVolume}`);
  ok('0-100 style sfx value clamped to 1', a.sfxVolume === 1, `got ${a.sfxVolume}`); }
{ installEnv({});
  const a = new AudioManager();
  ok('missing settings → audible defaults', a.masterVolume === 1.0 && a.sfxVolume === 0.80 && a.musicVolume === 0.70); }

console.log('\n── 4. Bus routing and independence ──');
{
  installEnv({});
  const a = new AudioManager();
  ok('masterGain reflects masterVolume', a.masterGain.gain.value === a.masterVolume);
  ok('musicGain reflects musicVolume', a.musicGain.gain.value === a.musicVolume);
  ok('sfxGain reflects sfxVolume', a.sfxGain.gain.value === a.sfxVolume);
  ok('sfx bus feeds the compressor', a.sfxGain.__out.includes(a.sfxComp));
  ok('sfx compressor feeds master', a.sfxComp.__out.includes(a.masterGain));
  ok('music feeds master directly', a.musicGain.__out.includes(a.masterGain));
  ok('master feeds the limiter', !!a.masterLimiter && a.masterGain.__out.includes(a.masterLimiter));
  ok('limiter feeds the trim', !!a.masterTrim && a.masterLimiter.__out.includes(a.masterTrim));
  ok('trim is the last node before output', a.masterTrim.__out.length === 1);
  ok('master does NOT reach destination unlimited', !a.masterGain.__out.some(n => n.__kind === 'destination'));

  a.setSfxVolume(0.5);
  ok('sfx slider moves only the sfx bus', a.sfxGain.gain.value === 0.5 && a.masterGain.gain.value === 1.0 && a.musicGain.gain.value === 0.70);
  a.setMusicVolume(0.3);
  ok('music slider moves only the music bus', Math.abs(a.musicGain.gain.value - 0.3) < 1e-9 && a.sfxGain.gain.value === 0.5);
  a.setMasterVolume(0.6);
  ok('master slider moves only the master bus', a.masterGain.gain.value === 0.6 && a.sfxGain.gain.value === 0.5);
}

console.log('\n── 5. Headroom ──');
{
  installEnv({});
  const a = new AudioManager();
  ok('limiter threshold below 0 dBFS', a.masterLimiter.threshold.value <= -3, `got ${a.masterLimiter.threshold.value}`);
  ok('limiter ratio is brick-wall', a.masterLimiter.ratio.value >= 10, `got ${a.masterLimiter.ratio.value}`);
  ok('limiter attack is fast', a.masterLimiter.attack.value <= 0.005, `got ${a.masterLimiter.attack.value}`);
  ok('output trim leaves real headroom', a.masterTrim.gain.value <= 0.85 && a.masterTrim.gain.value >= 0.5, `got ${a.masterTrim.gain.value}`);
}

console.log('\n── 6. Near-zero master drag snaps to a visible 0 ──');
{
  installEnv({});
  const a = new AudioManager();
  a.setMasterVolume(0.0172);
  ok('a 1.7% drag becomes a true 0, not a fake-active slider', a.masterVolume === 0, `got ${a.masterVolume}`);
  a.setMasterVolume(0.5);
  ok('a normal drag is untouched', a.masterVolume === 0.5);
}

console.log('\n── 7. Mute / unmute restores the previous level ──');
{
  installEnv({});
  const a = new AudioManager();
  a.setMasterVolume(0.7);
  a.toggleMute();
  ok('mute zeroes the master node', a.masterGain.gain.value === 0);
  ok('mute keeps the remembered level', a.masterVolume === 0.7);
  a.toggleMute();
  ok('unmute restores the exact previous level', a.masterGain.gain.value === 0.7, `got ${a.masterGain.gain.value}`);
}

console.log('\n── 8. No double attenuation on the authored path ──');
{
  installEnv({});
  const a = new AudioManager();
  ok('sfxVolume is applied once, on the bus', a.sfxGain.gain.value === a.sfxVolume);
  const caps = AudioManager.WAVE1_CAPS;
  ok('wave1 caps present', caps && caps.event >= 1 && caps.bossTelegraph >= 1 && caps.enemyTell >= 1);
  const reg = AudioManager.WAVE1_SFX;
  const names = [...new Set(Object.values(reg).flat())];
  ok('all 25 authored basenames registered', names.length === 25, `got ${names.length}`);
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail ? 1 : 0);
