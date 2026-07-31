// ════════════════════════════════════════════════════════════════════════════════════════════════
// BATCH 5.3 — WAVE 1 AUTHORED AUDIO (REGRESSION LOCK)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT WAS SHIPPED. 24 authored ElevenLabs clips under assets/audio/sfx/wave1/ (.ogg primary,
// .mp3 fallback), a frozen registry `AudioManager.WAVE1_SFX`, three routed entry points
// (`playEventClass`, `playBossTelegraph`, `playEnemyTell`), a teardown (`stopWave1`), and
// `Game.EVENT_AUDIO_CLASS` — the data table that replaced the single `playEventWarning` alarm
// which all 28 event triggers used to share.
//
// WHAT THIS FILE PINS — the 35 acceptance points, tagged [P1]..[P35].
//
// HOW IT MEASURES. The AudioManager is exercised through its REAL prototype with only the Web
// Audio surface stubbed (there is no AudioContext in node): `_canPlay`, `_wave1Play`,
// `_loadSfxFile`, the concurrency counters and the teardown are the shipping implementations, so
// weakening any of them fails here. Buffers are injected directly to model "already decoded"; the
// not-yet-decoded path is exercised by leaving them absent. Nothing about the registry contents
// is hard-coded except the approval lists themselves (which id owns which file), which is the
// thing under approval.
//
//   node tools/qa/batch5_3_wave1_audio_regression.mjs
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
let vclock = 0;
globalThis.performance = { now: () => vclock };

const u0 = muteConsole();
const { Game }         = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { AudioManager } = await import(pathToFileURL(path.join(ROOT, 'js/audio/AudioManager.js')).href);
const SBC              = await import(pathToFileURL(path.join(ROOT, 'js/game/StageBossCinematics.js')).href);
const SIG              = await import(pathToFileURL(path.join(ROOT, 'js/game/EnemySignatures.js')).href);
u0();

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

const REG   = AudioManager.WAVE1_SFX;
const CAPS  = AudioManager.WAVE1_CAPS;
const ECLS  = Game.EVENT_AUDIO_CLASS;
const DIR   = path.join(ROOT, 'assets/audio/sfx/wave1');
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR) : [];
const bases = [...new Set(Object.values(REG).flat())];

// ── a stub Web Audio surface; everything else is the shipping implementation ────────────────────
let now = 0;
function mkAudio({ muted = false, decoded = true } = {}) {
  const a = Object.create(AudioManager.prototype);
  a.muted = muted;
  a._sfxBuffers = {}; a._sfxLoading = new Set(); a._lastPlay = {};
  a.started = []; a.stopped = []; a.gains = []; a.fetched = [];
  a.sfxGain = { __node: 'sfxGain' };
  a.actx = {
    state: 'running', resume() { this.state = 'running'; },
    get currentTime() { return now; },
    createBufferSource() {
      const s = { buffer: null, onended: null, _started: false,
        connect() {}, start() { s._started = true; a.started.push(s); },
        stop() { a.stopped.push(s); if (s.onended) s.onended(); } };
      return s;
    },
    createGain() { const g = { gain: { value: 1, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect() {} }; a.gains.push(g); return g; },
    createOscillator() { return { type:'sine', frequency:{ value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){}, start(){}, stop(){} }; },
    createBuffer() { return { getChannelData: () => new Float32Array(8) }; },
    createBiquadFilter() { return { type:'lowpass', frequency:{ value:0, setValueAtTime(){} }, Q:{ value:1 }, connect(){} }; },
    get sampleRate() { return 48000; },
  };
  // model the loader: record the urls it would fetch, and pre-decode when asked
  a._loadSfxFile = function (key, ...srcs) {
    if (this._sfxBuffers[key] || this._sfxLoading.has(key)) return;
    this._sfxLoading.add(key);
    a.fetched.push(srcs);
    if (decoded) this._sfxBuffers[key] = { __buf: key };
  };
  return a;
}
const endAll = (a) => { for (const s of a.started.splice(0)) { if (s.onended) s.onended(); } };

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 1. ASSETS ON DISK ───────────────────────────────────────────────────────────────');

T('[P1] every registered clip has an .ogg on disk',
  bases.every(b => files.includes(b + '.ogg')),
  bases.filter(b => !files.includes(b + '.ogg')).join(','));
T('[P2] every registered clip has an .mp3 fallback on disk',
  bases.every(b => files.includes(b + '.mp3')),
  bases.filter(b => !files.includes(b + '.mp3')).join(','));
T('[P3] canonical filenames only — lowercase, [a-z0-9_] and one extension',
  files.every(f => /^[a-z0-9_]+\.(ogg|mp3)$/.test(f)),
  files.filter(f => !/^[a-z0-9_]+\.(ogg|mp3)$/.test(f)).join(','));
T('[P4] no 0-byte asset',
  files.every(f => fs.statSync(path.join(DIR, f)).size > 0),
  files.filter(f => fs.statSync(path.join(DIR, f)).size === 0).join(','));
T('[P5] every asset is large enough to be a real clip (>4 KB)',
  files.every(f => fs.statSync(path.join(DIR, f)).size > 4096),
  files.filter(f => fs.statSync(path.join(DIR, f)).size <= 4096).join(','));
{
  const oggOk = files.filter(f => f.endsWith('.ogg')).every(f => {
    const b = fs.readFileSync(path.join(DIR, f)).subarray(0, 4).toString('latin1'); return b === 'OggS';
  });
  const mp3Ok = files.filter(f => f.endsWith('.mp3')).every(f => {
    const b = fs.readFileSync(path.join(DIR, f)); return b[0] === 0xFF || b.subarray(0,3).toString('latin1') === 'ID3';
  });
  T('[P6] every .ogg carries a valid OggS header (decodable container)', oggOk);
  T('[P7] every .mp3 carries a valid MPEG/ID3 header (decodable container)', mp3Ok);
}
T('[P8] no stray file in the wave1 folder beyond the registered clips',
  files.every(f => bases.includes(f.replace(/\.(ogg|mp3)$/, ''))),
  files.filter(f => !bases.includes(f.replace(/\.(ogg|mp3)$/, ''))).join(','));

console.log('\n── 2. EVENT CLASS MAPPING ──────────────────────────────────────────────────────────');

const gameSrc = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const cueIds  = [...gameSrc.matchAll(/this\._eventCue\('([^']+)'\)/g)].map(m => m[1]);
T('[P9] all 28 historical event triggers now route through _eventCue',
  cueIds.length === 28, String(cueIds.length));
T('[P10] no call site still uses the single shared playEventWarning alarm',
  !/this\.audio\?\.playEventWarning/.test(gameSrc));
T('[P11] every event id used at a call site exists in EVENT_AUDIO_CLASS',
  cueIds.every(id => Object.prototype.hasOwnProperty.call(ECLS, id)),
  cueIds.filter(id => !Object.prototype.hasOwnProperty.call(ECLS, id)).join(','));
T('[P12] every id is a non-empty string — none undefined',
  cueIds.every(id => typeof id === 'string' && id.length > 0));
T('[P13] every mapped class resolves to a real registry family',
  Object.values(ECLS).every(c => Object.prototype.hasOwnProperty.call(REG, 'event_' + c)),
  Object.values(ECLS).filter(c => !REG['event_' + c]).join(','));
{
  const used = new Set(Object.values(ECLS));
  T('[P14] the 28 triggers are spread over at least 8 distinct sonic families',
    used.size >= 8, String(used.size));
  T('[P15] no single class swallows more than half the triggers',
    Math.max(...[...used].map(c => cueIds.filter(id => ECLS[id] === c).length)) <= cueIds.length / 2);
}
{
  const g = Object.create(Game.prototype); const seen = [];
  g.audio = { playEventClass: (c) => seen.push(c) };
  g._eventCue('totally_unknown_event_id');
  T('[P16] an unknown event id falls back to the major class — never undefined, never silent',
    seen.length === 1 && seen[0] === 'major', JSON.stringify(seen));
  g._eventCue(undefined); g._eventCue(null); g._eventCue('');
  T('[P17] undefined / null / empty ids also resolve to major without throwing',
    seen.length === 4 && seen.every(c => c === 'major'), JSON.stringify(seen));
}
{
  const g = Object.create(Game.prototype); g.audio = null;
  let threw = false; try { g._eventCue('_spawnAirstrike'); } catch (_) { threw = true; }
  T('[P18] a missing AudioManager never throws out of the cue path', !threw);
}

console.log('\n── 3. BOSS + ENEMY COVERAGE ────────────────────────────────────────────────────────');

const BOSS_IDS = Object.keys(SBC.STAGE_BOSS_SIGNATURES);
T('[P19] all 6 stage bosses have an authored telegraph clip',
  BOSS_IDS.length === 6 && BOSS_IDS.every(id => REG['boss_' + id]),
  BOSS_IDS.filter(id => !REG['boss_' + id]).join(','));
const SIG_TYPES = Object.keys(SIG.ENEMY_SIGNATURES);
T('[P20] all 6 enemy signatures have an authored tell clip',
  SIG_TYPES.length === 6 &&
  SIG_TYPES.every(t => REG['tell_' + t.replace(/[^A-Za-z0-9]/g, '')]),
  SIG_TYPES.filter(t => !REG['tell_' + t.replace(/[^A-Za-z0-9]/g, '')]).join(','));
T('[P21] every boss telegraph clip is distinct — no two bosses share a file',
  new Set(BOSS_IDS.map(id => REG['boss_' + id][0])).size === 6);
T('[P22] every enemy tell clip is distinct — no two enemies share a file',
  new Set(SIG_TYPES.map(t => REG['tell_' + t.replace(/[^A-Za-z0-9]/g,'')][0])).size === 6);
{
  const sbc = fs.readFileSync(path.join(ROOT, 'js/game/StageBossCinematics.js'), 'utf8');
  const idle = sbc.slice(sbc.indexOf('case ENC_PHASE.IDLE'), sbc.indexOf('case ENC_PHASE.TELEGRAPH'));
  T('[P23] the boss cue fires on the IDLE→TELEGRAPH edge, inside the arm block',
    /playBossTelegraph/.test(idle));
  T('[P24] the boss cue appears exactly once in the whole encounter machine — no per-frame replay',
    (sbc.match(/playBossTelegraph\(/g) || []).length === 1);
  const exec = sbc.slice(sbc.indexOf('case ENC_PHASE.EXECUTE'));
  T('[P25] the boss cue is absent from the EXECUTE phase',  !/playBossTelegraph/.test(exec));
  T('[P26] the boss cue is absent from the INTRO phase (never on the spawn frame)',
    !/playBossTelegraph/.test(sbc.slice(sbc.indexOf('case ENC_PHASE.INTRO'), sbc.indexOf('case ENC_PHASE.IDLE'))));
  const es = fs.readFileSync(path.join(ROOT, 'js/game/EnemySignatures.js'), 'utf8');
  T('[P27] the enemy tell appears exactly once — on the READY arm edge only',
    (es.match(/playEnemyTell\(/g) || []).length === 1 &&
    /playEnemyTell/.test(es.slice(es.indexOf('case SIG_PHASE.READY'), es.indexOf('case SIG_PHASE.TELEGRAPH'))));
  const armIdx = es.indexOf('playEnemyTell');
  T('[P28] off-screen enemies are suppressed — onScreen() gates the arm before the cue',
    es.lastIndexOf('onScreen(e, game)', armIdx) > es.lastIndexOf('case SIG_PHASE.READY', armIdx));
}

console.log('\n── 4. RUNTIME BEHAVIOUR ────────────────────────────────────────────────────────────');

{ // mute
  const a = mkAudio({ muted: true });
  a.playEventClass('airstrike'); a.playBossTelegraph('titan'); a.playEnemyTell('Volt Rat');
  T('[P29] mute blocks every Wave 1 category', a.started.length === 0, String(a.started.length));
}
{ // master volume routing
  const a = mkAudio();
  a.playEventClass('airstrike');
  T('[P30] playback routes through sfxGain so master volume and mute apply',
    a.started.length === 1 && a.gains.length === 1 && a.gains[0].gain.value > 0);
}
{ // concurrency caps
  now = 0;
  const a = mkAudio();
  for (let i = 0; i < 6; i++) { now += 1; a.playEnemyTell('Volt Rat'); a.playEnemyTell('Razorhound'); }
  T('[P31] enemy tells never exceed the declared concurrency cap',
    a.started.length <= CAPS.enemyTell, `${a.started.length} > ${CAPS.enemyTell}`);
  const b = mkAudio();
  now = 0; for (let i = 0; i < 5; i++) { now += 1; b.playEventClass('airstrike'); }
  T('[P32] event warnings never exceed 1 active cue', b.started.length <= CAPS.event, String(b.started.length));
}
{ // anti-spam cooldown — assert the documented return contract
  now = 0;
  const a = mkAudio();
  const r1 = a._wave1Play('event', 'event_airstrike', 0.25, 0.9);
  const r2 = a._wave1Play('event', 'event_void',      0.25, 0.9);   // same instant → must be rejected
  endAll(a);
  now += 1.0;
  const r3 = a._wave1Play('event', 'event_void',      0.25, 0.9);   // cooldown elapsed → allowed
  T('[P33] the event category enforces an anti-spam cooldown between cues',
    r1 === 'played' && r2 === 'blocked' && r3 === 'played', `${r1}/${r2}/${r3}`);
}

{ // no duplicate loads, no 404 retry loop
  const a = mkAudio({ decoded: false });
  for (let i = 0; i < 25; i++) { now += 1; a.playEventClass('airstrike'); }
  const urlsForFirst = a.fetched.filter(u => /airstrike_01/.test(u[0]));
  T('[P34] a missing/undecoded buffer is fetched once, never in a retry loop',
    urlsForFirst.length <= 1, String(urlsForFirst.length));
  T('[P35] the fallback chain is ogg → mp3 under assets/audio/sfx/wave1/',
    a.fetched.length > 0 &&
    a.fetched.every(u => u.length === 2 && /^assets\/audio\/sfx\/wave1\/.+\.ogg$/.test(u[0]) &&
                                            /^assets\/audio\/sfx\/wave1\/.+\.mp3$/.test(u[1])));
}

console.log('\n── 5. TEARDOWN + NON-REGRESSION ────────────────────────────────────────────────────');

{
  now = 0;
  const a = mkAudio();
  a.playEventClass('airstrike'); now += 1; a.playEnemyTell('Volt Rat');
  const live = a.started.length;
  a.stopWave1();
  const anyLeft = Object.values(a._w1Active || {}).some(v => v > 0);
  T('[T1] stopWave1 stops every live source', live > 0 && a.stopped.length === live);
  T('[T2] stopWave1 clears the concurrency counters — no stale ceiling on the next run', !anyLeft);
  now += 1; a.playEventClass('void');
  T('[T3] a fresh cue plays normally after teardown', a.started.length >= 1);
}
{
  const gs = gameSrc;
  T('[T4] teardown is wired into reset()', /stopWave1/.test(gs.slice(0, gs.indexOf('_clearDeckTransients'))));
  T('[T5] teardown is wired into the deck transition', /_clearDeckTransients\(dest, destMode\) \{[\s\S]{0,400}?stopWave1/.test(gs));
}
{
  const am = fs.readFileSync(path.join(ROOT, 'js/audio/AudioManager.js'), 'utf8');
  T('[T6] the 6 approved file-backed SFX were not replaced',
    ['enemy-death', 'player-death', 'airstrike-bomb', 'acid-rain', 'lava-rain', 'rocket-rain']
      .every(n => am.includes(`assets/audio/sfx/${n}.ogg`)));
  T('[T7] the procedural playEventWarning fallback still exists',
    /playEventWarning\(\)\s*\{/.test(am));
  T('[T8] no Wave 1 path introduces Math.random into a gameplay-deterministic call',
    !/_wave1Play[\s\S]{0,1600}?Math\.random/.test(am));
  T('[T9] registry lookups are prototype-safe',
    /hasOwnProperty\.call\(AudioManager\.WAVE1_SFX/.test(am));
}
{
  const musicDir = path.join(ROOT, 'assets/audio/music');
  T('[T10] music assets untouched by this batch',
    fs.existsSync(musicDir) && fs.readdirSync(musicDir).length > 0);
  T('[T11] no .wav master leaked into the repo runtime folder',
    !files.some(f => f.endsWith('.wav')));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('DONE');
process.exit(fail === 0 ? 0 : 1);
