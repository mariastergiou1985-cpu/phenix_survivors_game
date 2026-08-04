// ════════════════════════════════════════════════════════════════════════════════
// playHomingMissileImpact — LEVEL / CAP / COOLDOWN proof (Chromium).
//
// Every level claim below is a MEASUREMENT of the rendered signal, not a reading of the
// numbers in the source. An AnalyserNode is tapped onto the OUTPUT of sfxGain with
// fftSize 16384 (341 ms at 48 kHz) and read every 10 ms, so no sample can slip between
// reads: the peak and RMS reported are the true peak and RMS of what the bus produced.
//
// WHAT WAS WRONG, measured on the build before the fix:
//   playHomingMissileImpact is in NEITHER FIRE_CUES nor IMPACT_CUES, so unlike every other
//   repeated combat cue it had no mix gate at all. Its only guard was its own
//   _canPlay('homingImpact', 0.12) floor — up to 8.3 firings a second — and each firing is
//   three voices whose gains sum to 0.38:
//       sine       180 -> 32 Hz   0.32 s   gain 0.18     <- long sub-bass tail
//       noise      highpass 500            0.25 s  0.13
//       noise      bandpass 350  +0.05 s   0.20 s  0.07
//   For comparison the whole gated playRailSpikeImpact stack sums to 0.25 and a gated fire
//   voice is 0.10. Two independent systems call it (brawler homing missiles and the vessel
//   companion's rockets) and they share the single floor.
//
// WHAT THE FIX IS: MIX.missileImpact + _missileImpactGate() — attenuation, a longer
// retrigger floor and a hard cap on overlapping tails, applied as ONE authority. The sound
// itself is untouched: same oscillator types, frequencies, envelopes and durations (F02
// asserts this against the literal original spec), and it still routes through sfxGain so
// SFX 0 and mute silence it completely.
//
// Run: node tools/qa/browser/missile_impact_audio_proof.mjs [port]
// Writes: /tmp/missile_impact_audio_proof/report.json
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/missile_impact_audio_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8994;
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
               '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const BUILD = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const IDX_V = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/main\.js\?v=(\d+)/)[1];
const AUD_V = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').match(/AudioManager\.js\?v=(\d+)/)[1];

let passN = 0, failN = 0;
const failures = [], results = [];
const check = (id, cond, extra) => {
  results.push({ id, pass: !!cond, extra: extra ?? null });
  if (cond) { passN++; console.log(`PASS ${id}${extra ? '  ' + extra : ''}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};
const dB = (r) => (r > 0 ? (20 * Math.log10(r)).toFixed(2) + ' dB' : '-inf dB');

await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;
console.log(`serving ${ROOT} on ${BASE}   BUILD=${BUILD}  AudioManager=${AUD_V}`);

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const pageErrors = [], consoleErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/.test(t)) return;
  consoleErrors.push(t);
});
await page.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
  const u = r.request().url();
  if (/fonts\.googleapis/.test(u)) return r.fulfill({ status: 200, contentType: 'text/css', body: '/* offline proof */' });
  return r.abort();
});

await page.goto(BASE + '/index.html?nosw=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1200);

check('A00 sw.js BUILD equals index.html main.js ?v=', BUILD === IDX_V, `${BUILD} vs ${IDX_V}`);
check('A01 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('A02 zero console errors at boot', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

// ════════════════════════════════════════════════════════════════════════════
// The measurement rig. Tapped on the OUTPUT of sfxGain, so an SFX volume of 0 reads
// as true digital silence rather than "a quiet signal that is muted further downstream".
// ════════════════════════════════════════════════════════════════════════════
const rate = await page.evaluate(async (v) => {
  const m = await import(`./js/audio/AudioManager.js?v=${v}`);
  localStorage.clear();
  const a = new m.AudioManager();
  window.__A = m.AudioManager;
  window.__a = a;
  if (a.actx.state === 'suspended') { try { await a.actx.resume(); } catch (_) {} }

  const an = a.actx.createAnalyser();
  an.fftSize = 16384;              // 341 ms at 48 kHz
  an.smoothingTimeConstant = 0;
  a.sfxGain.connect(an);
  const buf = new Float32Array(an.fftSize);

  const scan = () => {
    an.getFloatTimeDomainData(buf);
    let pk = 0;
    for (let i = 0; i < buf.length; i++) { const x = Math.abs(buf[i]); if (x > pk) pk = x; }
    return pk;
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Wait until the bus is genuinely idle, so a previous cue's tail can never be counted
  // as part of the next measurement.
  window.__silence = async (maxMs = 4000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs) { await sleep(60); if (scan() < 1e-4) return true; }
    return false;
  };

  // peak + RMS of everything the bus produced while `body` ran and for `ms` afterwards.
  //
  // PEAK is sampled densely (every ~10 ms into a 371 ms window), so oversampling is free and
  // no sample can slip between reads.
  //
  // RMS is NOT sampled that way. An earlier version of this rig accumulated "the last 10 ms"
  // on every read, which silently assumed the loop ran exactly every 10 ms; it does not, so
  // the slices it summed landed on random parts of the envelope and the same cue measured
  // 0.0028 and 0.0196 on consecutive runs. RMS is therefore accumulated only over WHOLE,
  // NON-OVERLAPPING analyser windows, gated on the AUDIO clock: the first window is exactly
  // [t0, t0 + 371 ms], which contains the entire 0.37 s cue, and each later one abuts it.
  // Gapless, no double counting, and it does not care how fast the JS loop happens to run.
  window.__measure = async (body, ms) => {
    await window.__silence();
    const winSec = an.fftSize / a.actx.sampleRate;
    let pk = 0, sq = 0, n = 0, windows = 0;
    const tAudio0 = a.actx.currentTime;
    let lastWin = tAudio0;
    const t0 = performance.now();
    body();
    while (performance.now() - t0 < ms) {
      await sleep(10);
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) { const ax = Math.abs(buf[i]); if (ax > pk) pk = ax; }
      if (a.actx.currentTime - lastWin >= winSec) {
        lastWin += winSec;
        windows++;
        for (let i = 0; i < buf.length; i++) { const x = buf[i]; sq += x * x; n++; }
      }
    }
    return { peak: pk, rms: n ? Math.sqrt(sq / n) : 0, windows };
  };

  // Count the audio nodes ACTUALLY created. Counting _tone/_noiseBurst calls instead would
  // be wrong under mute: those methods are entered and then return early, so a call count
  // says "3" for a cue that produced absolute silence.
  window.__countNodes = (body) => {
    const co = a.actx.createOscillator.bind(a.actx);
    const cb = a.actx.createBufferSource.bind(a.actx);
    let n = 0;
    a.actx.createOscillator   = (...x) => { n++; return co(...x); };
    a.actx.createBufferSource = (...x) => { n++; return cb(...x); };
    try { body(); } finally { a.actx.createOscillator = co; a.actx.createBufferSource = cb; }
    return n;
  };

  // Count voices actually started, whatever gate rejected or admitted the call.
  window.__countVoices = (body) => {
    const t = a._tone, nb = a._noiseBurst;
    let tones = 0, noises = 0; const args = [];
    a._tone = function (o) { tones++; args.push(['tone', o, this._fireMul ?? 1]); return t.call(this, o); };
    a._noiseBurst = function (o) { noises++; args.push(['noise', o, this._fireMul ?? 1]); return nb.call(this, o); };
    try { body(); } finally { a._tone = t; a._noiseBurst = nb; }
    return { tones, noises, calls: tones + noises, args };
  };

  // The cue exactly as it stood BEFORE the fix, replayed voice for voice at _fireMul 1.
  window.__legacyImpact = () => {
    const prev = a._fireMul; a._fireMul = 1;
    try {
      a._tone({ type: 'sine', freqStart: 180, freqEnd: 32, dur: 0.32, gain: 0.18 });
      a._noiseBurst({ dur: 0.25, gain: 0.13, filterType: 'highpass', freq: 500 });
      a._noiseBurst({ dur: 0.20, gain: 0.07, filterType: 'bandpass', freq: 350, delay: 0.05 });
    } finally { a._fireMul = prev; }
  };

  // Clear every retrigger stamp so a measurement is never silenced by the previous one.
  window.__clearGates = () => {
    a._lastPlay = Object.create(null);
    a._fireLast = Object.create(null);
    a._fireActive = Object.create(null);
    a._miLast = undefined;
    a._miTails = [];
  };
  return a.actx.sampleRate;
}, AUD_V);
check('A03 an AudioContext is running and the SFX bus is tapped', rate > 0, `sampleRate ${rate}`);

// ════════════════════════════════════════════════════════════════════════════
// B. LEVEL — the cue is significantly quieter than it was, and still audible
// ════════════════════════════════════════════════════════════════════════════
const lvl = await page.evaluate(async () => {
  const a = window.__a;
  window.__clearGates();
  const legacy = await window.__measure(() => window.__legacyImpact(), 900);
  window.__clearGates();
  const now = await window.__measure(() => a.playHomingMissileImpact(), 900);
  return { legacy, now };
});
const pkRatio  = lvl.now.peak / lvl.legacy.peak;
const rmsRatio = lvl.now.rms  / lvl.legacy.rms;
check('B01 one impact is significantly quieter than it was — peak',
  pkRatio <= 0.45, `peak ${lvl.legacy.peak.toFixed(5)} -> ${lvl.now.peak.toFixed(5)}  (${dB(pkRatio)})`);
check('B02 one impact is significantly quieter than it was — RMS',
  rmsRatio <= 0.45, `rms ${lvl.legacy.rms.toFixed(6)} -> ${lvl.now.rms.toFixed(6)}  (${dB(rmsRatio)})`);
check('B03 the cue is still AUDIBLE, not silenced',
  lvl.now.peak > 0.02, `peak ${lvl.now.peak.toFixed(5)}`);

// ════════════════════════════════════════════════════════════════════════════
// C. ORDERING — it now sits behind weapons and behind important warnings
// ════════════════════════════════════════════════════════════════════════════
const ord = await page.evaluate(async () => {
  const a = window.__a;
  const one = async (fn) => { window.__clearGates(); return await window.__measure(fn, 900); };
  return {
    missile:   await one(() => a.playHomingMissileImpact()),
    railFire:  await one(() => a.playRailSpikeFire()),
    railHit:   await one(() => a.playRailSpikeImpact()),
    heavyHit:  await one(() => a.playHeavyHit()),
    evWarn:    await one(() => a.playEventWarning()),
    bossWarn:  await one(() => a.playBossWarning()),
  };
});
const mp = ord.missile.peak;
for (const [id, key, label] of [
  ['C01', 'railFire', 'playRailSpikeFire (weapon fire)'],
  ['C02', 'railHit',  'playRailSpikeImpact (weapon impact)'],
  ['C03', 'heavyHit', 'playHeavyHit (weapon impact)'],
  ['C04', 'evWarn',   'playEventWarning (important warning)'],
  ['C05', 'bossWarn', 'playBossWarning (important warning)'],
]) {
  const other = ord[key].peak;
  check(`${id} the missile impact sits BEHIND ${label}`,
    mp < other, `missile ${mp.toFixed(5)} vs ${other.toFixed(5)}  (${dB(mp / other)})`);
}

// ════════════════════════════════════════════════════════════════════════════
// D. CAP + COOLDOWN — many impacts together do not sum loudly
// ════════════════════════════════════════════════════════════════════════════
const burst = await page.evaluate(async () => {
  const a = window.__a;
  const VOICES_PER_HIT = 3;

  // (a) a whole salvo landing in ONE frame
  window.__clearGates();
  const sameFrame = window.__countVoices(() => { for (let i = 0; i < 20; i++) a.playHomingMissileImpact(); });

  // (b) sustained fire — one attempt every 20 ms for 1.2 s, i.e. 60 attempts
  const sustained = async (fn) => {
    window.__clearGates();
    let calls = 0;
    const t = a._tone, nb = a._noiseBurst;
    a._tone = function (o) { calls++; return t.call(this, o); };
    a._noiseBurst = function (o) { calls++; return nb.call(this, o); };
    const m = await window.__measure(() => {
      const iv = setInterval(fn, 20);
      setTimeout(() => clearInterval(iv), 1200);
    }, 1700);
    a._tone = t; a._noiseBurst = nb;
    return { ...m, hits: Math.round(calls / VOICES_PER_HIT) };
  };
  // legacy replay carries the OLD 0.12 s floor, so this is a like-for-like comparison of
  // the old cue under the old rules against the new cue under the new ones.
  const legacyRun = await sustained(() => { if (a._canPlay('legacyHoming', 0.12)) window.__legacyImpact(); });
  const nowRun    = await sustained(() => a.playHomingMissileImpact());

  // (c) one hit alone, for the same-frame comparison
  const trials = async (fn, n) => {
    const out = [];
    for (let i = 0; i < n; i++) { window.__clearGates(); out.push((await window.__measure(fn, 900)).peak); }
    return out;
  };
  const singleN = await trials(() => a.playHomingMissileImpact(), 5);
  const salvoN  = await trials(() => { for (let i = 0; i < 20; i++) a.playHomingMissileImpact(); }, 5);
  const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
  const single = { peak: mean(singleN), all: singleN };
  const salvo  = { peak: mean(salvoN),  all: salvoN  };

  return { sameFrame, legacyRun, nowRun, single, salvo, cfg: window.__A.MIX.missileImpact || null };
});
const cfg = burst.cfg || {};
check('D01 20 impacts in a single frame start exactly ONE hit worth of voices',
  burst.sameFrame.calls === 3, `${burst.sameFrame.calls} voices (${burst.sameFrame.tones} tone / ${burst.sameFrame.noises} noise)`);
check('D02 a one-frame salvo of 20 is no louder than a single impact (mean of 5 trials each)',
  burst.salvo.peak <= burst.single.peak * 1.05,
  `salvo ${burst.salvo.peak.toFixed(5)} [${burst.salvo.all.map(x => x.toFixed(4)).join(' ')}] ` +
  `vs single ${burst.single.peak.toFixed(5)} [${burst.single.all.map(x => x.toFixed(4)).join(' ')}]`);
check('D03 sustained fire admits fewer hits than it used to',
  burst.nowRun.hits < burst.legacyRun.hits, `1.2 s: ${burst.legacyRun.hits} hits -> ${burst.nowRun.hits} hits`);
check('D04 sustained fire is far quieter than it used to be — peak',
  burst.nowRun.peak <= burst.legacyRun.peak * 0.50,
  `${burst.legacyRun.peak.toFixed(5)} -> ${burst.nowRun.peak.toFixed(5)}  (${dB(burst.nowRun.peak / burst.legacyRun.peak)})`);
check('D05 sustained fire is far quieter than it used to be — RMS',
  burst.nowRun.rms <= burst.legacyRun.rms * 0.50,
  `${burst.legacyRun.rms.toFixed(6)} -> ${burst.nowRun.rms.toFixed(6)}  (${dB(burst.nowRun.rms / burst.legacyRun.rms)})`);
check('D06 sustained fire still produces hits — the cue is rate-limited, not switched off',
  burst.nowRun.hits >= 3, `${burst.nowRun.hits} hits in 1.2 s`);
check('D07 the retrigger floor is longer than the one it replaced',
  cfg.minGap > 0.12, `minGap ${cfg.minGap} s (was 0.12 s)`);
check('D08 a hard overlap cap exists and is small',
  cfg.cap >= 1 && cfg.cap <= 2, `cap ${cfg.cap}`);

// ════════════════════════════════════════════════════════════════════════════
// E. SFX 0 AND MUTE — fully silent, measured on the bus
// ════════════════════════════════════════════════════════════════════════════
const sil = await page.evaluate(async () => {
  const a = window.__a;
  a.setSfxVolume(0);
  window.__clearGates();
  const atZero = await window.__measure(() => {
    const iv = setInterval(() => { window.__clearGates(); a.playHomingMissileImpact(); }, 30);
    setTimeout(() => clearInterval(iv), 700);
  }, 1100);
  const node = a.sfxGain.gain.value;
  a.setSfxVolume(0.80);
  window.__clearGates();
  const restored = await window.__measure(() => a.playHomingMissileImpact(), 900);

  a.muted = true;
  window.__clearGates();
  const mutedNodes = window.__countNodes(() => a.playHomingMissileImpact());
  a.muted = false;
  window.__clearGates();
  const liveNodes = window.__countNodes(() => a.playHomingMissileImpact());
  return { atZero, node, restored, mutedNodes, liveNodes };
});
check('E01 at SFX 0 the bus gain node is a true zero', sil.node === 0, `sfxGain ${sil.node}`);
check('E02 at SFX 0 repeated impacts render digital silence',
  sil.atZero.peak < 1e-5, `peak ${sil.atZero.peak.toExponential(2)}`);
check('E03 under mute the cue creates no audio nodes at all — measured on the context, not on call counts',
  sil.mutedNodes === 0, `${sil.mutedNodes} nodes muted vs ${sil.liveNodes} unmuted`);
check('E04 raising SFX again makes the cue audible', sil.restored.peak > 0.02, `peak ${sil.restored.peak.toFixed(5)}`);

// ════════════════════════════════════════════════════════════════════════════
// F. NOTHING ELSE CHANGED — same sound, no leak into other cues
// ════════════════════════════════════════════════════════════════════════════
const iso = await page.evaluate(async () => {
  const a = window.__a;
  window.__clearGates();
  const shape = window.__countVoices(() => a.playHomingMissileImpact());
  const mul = shape.args.length ? shape.args[0][2] : null;
  const spec = shape.args.map(([kind, o]) => ({ kind, ...o }));

  // _fireMul must be restored: measure a neighbouring cue before and after.
  window.__clearGates();
  const before = await window.__measure(() => a.playRailSpikeImpact(), 900);
  window.__clearGates();
  a.playHomingMissileImpact();
  window.__clearGates();
  const after = await window.__measure(() => a.playRailSpikeImpact(), 900);

  return {
    spec, mul, fireMulAfter: a._fireMul,
    before, after,
    inFire:   window.__A.FIRE_CUES.includes('playHomingMissileImpact'),
    inImpact: window.__A.IMPACT_CUES.includes('playHomingMissileImpact'),
    cfg: window.__A.MIX.missileImpact || {},
  };
});
const EXPECT = [
  { kind: 'tone',  type: 'sine', freqStart: 180, freqEnd: 32, dur: 0.32, gain: 0.18 },
  { kind: 'noise', dur: 0.25, gain: 0.13, filterType: 'highpass', freq: 500 },
  { kind: 'noise', dur: 0.20, gain: 0.07, filterType: 'bandpass', freq: 350, delay: 0.05 },
];
const sameShape = iso.spec.length === 3 && EXPECT.every((e, i) =>
  Object.keys(e).every(k => iso.spec[i] && iso.spec[i][k] === e[k]));
check('F01 the cue still starts its original three voices', iso.spec.length === 3, `${iso.spec.length} voices`);
check('F02 oscillator types, frequencies, gains and durations are byte-for-byte the originals — only the mix multiplier is new',
  sameShape, JSON.stringify(iso.spec));
check('F03 the attenuation is applied through _fireMul, exactly once, to every layer',
  iso.mul === iso.cfg.mul, `_fireMul ${iso.mul} vs MIX.missileImpact.mul ${iso.cfg.mul}`);
check('F04 _fireMul is restored after the cue — no leak into the next sound',
  iso.fireMulAfter === undefined || iso.fireMulAfter === 1 || iso.fireMulAfter === null,
  `_fireMul ${String(iso.fireMulAfter)}`);
check('F05 a neighbouring weapon cue is unchanged after a missile impact',
  Math.abs(iso.after.peak - iso.before.peak) / iso.before.peak < 0.15,
  `playRailSpikeImpact ${iso.before.peak.toFixed(5)} -> ${iso.after.peak.toFixed(5)}`);
check('F06 the cue is still outside FIRE_CUES and IMPACT_CUES — one gate, never two',
  iso.inFire === false && iso.inImpact === false, `fire ${iso.inFire} impact ${iso.inImpact}`);

check('Z01 zero page errors for the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('Z02 zero console errors for the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, audioV: AUD_V, sampleRate: rate,
  level: lvl, ordering: ord, burst, silence: sil, isolation: iso,
  pass: passN, fail: failN, failures, results,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
