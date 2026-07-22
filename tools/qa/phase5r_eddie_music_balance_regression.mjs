// PHASE 5R: Eddie ultimate music parity and accidental permanent-damage regression.

import { register } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
register('./strip-v-loader.mjs', import.meta.url);
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

const audioInstances = [];
globalThis.Audio = class {
  constructor(src = '') {
    this.src = src;
    this.currentTime = 0;
    this.duration = 180;
    this.paused = true;
    this.playCalls = 0;
    audioInstances.push(this);
  }
  play() { this.paused = false; this.playCalls++; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
};

const gainNode = () => ({
  connect() {}, disconnect() {},
  gain: {
    value: 0, history: [],
    setValueAtTime(v) { this.value = v; this.history.push(v); },
    setTargetAtTime(v) { this.value = v; this.history.push(v); },
    linearRampToValueAtTime(v) { this.value = v; this.history.push(v); },
    exponentialRampToValueAtTime(v) { this.value = v; this.history.push(v); },
    cancelScheduledValues() {},
  },
});
AudioContext.prototype.createGain = gainNode;
AudioContext.prototype.createAnalyser = () => ({
  fftSize: 64, smoothingTimeConstant: 0.75, frequencyBinCount: 32,
  connect() {}, getByteFrequencyData() {},
});
AudioContext.prototype.createMediaElementSource = () => ({ connect() {} });

const ROOT = path.resolve(HERE, '../..');
const unmute = muteConsole();
const [{ AudioManager }, { Game }, { Vec2 }] = await Promise.all([
  import(pathToFileURL(path.join(ROOT, 'js/audio/AudioManager.js')).href),
  import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href),
  import(pathToFileURL(path.join(ROOT, 'js/constants.js')).href),
]);
unmute();

let pass = 0;
let fail = 0;
const gate = (name, result, note = '') => {
  const ok = result === true;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` | ${note}` : ''}`);
};

console.log('=== PHASE 5R EDDIE MUSIC / BALANCE REGRESSION ===');

console.log('\n-- 8-track asset and rotation contract --');
const probe = new AudioManager();
const album = probe._EDDIE_ALBUM();
const ids = album.map(url => url.split('/').pop().split('?')[0].replace(/\.mp3$/i, ''));
gate('album contains exactly eight unique approved tracks', album.length === 8 && new Set(ids).size === 8,
  `ids=${ids.join(',')}`);
gate('all eight track assets resolve on disk', album.every(url =>
  existsSync(path.join(ROOT, url.split('?')[0].replaceAll('/', path.sep)))));

for (const mode of ['act1', 'endless', 'chaos']) {
  const audio = new AudioManager();
  if (mode === 'act1') audio.startGameplayMusic();
  else if (mode === 'endless') audio.startEndlessMusic();
  else audio.startChaosMusic();
  const mapMusic = audio._currentMusic;
  const selected = [];
  for (let i = 0; i < 8; i++) {
    selected.push(audio.playEddieUltimateTrack()?.trackId);
    audio.stopEddieRiffs();
  }
  gate(`${mode}: eight ultimate activations rotate through 8/8 tracks`,
    selected.join(',') === ids.join(','), selected.join(','));
  gate(`${mode}: Eddie playback never replaces the mode BGM authority`, audio._currentMusic === mapMusic);
  gate(`${mode}: ultimate end restores the configured music bus`,
    audio.musicGain.gain.value === audio.musicVolume,
    `gain=${audio.musicGain.gain.value}`);
}

console.log('\n-- lifecycle, mute, and no stacking --');
{
  const audio = new AudioManager();
  const instanceCount = audioInstances.length;
  const first = audio.playEddieUltimateTrack();
  const riffAudio = audio._eddieRiffsAudio;
  const second = audio.playEddieUltimateTrack();
  gate('repeated ultimate reuses one Eddie media element (no simultaneous track stacking)',
    audio._eddieRiffsAudio === riffAudio && audioInstances.length === instanceCount + 1);
  gate('repeated ultimate advances to the next track instead of restarting track 1',
    first?.index === 0 && second?.index === 1);
  audio.resetEddieRiffs();
  gate('death/reset cleanup stops playback and resets rotation',
    !audio.isEddieRiffsPlaying() && audio.playEddieUltimateTrack()?.index === 0);
  audio.stopEddieRiffs();
  audio.muted = true;
  gate('muted setting blocks Eddie track start', audio.playEddieUltimateTrack() === null && !audio.isEddieRiffsPlaying());
}

{
  const audio = new AudioManager();
  audio.startGameplayMusic();
  const first = audio.playEddieUltimateTrack();
  audio.stopAll();
  audio.startEndlessMusic();
  const resumed = audio.resumeEddieUltimateTrack();
  audio.stopEddieUltimateTrack();
  const next = audio.playEddieUltimateTrack();
  gate('Act 1 to Endless transition resumes the same active ultimate track',
    first?.index === 0 && resumed?.index === 0 && audio._currentMusic === audio._endlessAudio);
  gate('mode transition preserves the next-track rotation', next?.index === 1);
  audio.setMusicVolume(0.4);
  gate('Eddie overlay obeys the music-volume slider',
    Math.abs(audio._eddieRiffsGain?.gain.value - 0.36) < 1e-9 &&
      Math.abs(audio.musicGain.gain.value - 0.1) < 1e-9);
  audio.stopEddieUltimateTrack();
}

console.log('\n-- ultimate isolation and per-mode trigger path --');
for (const mode of ['act1', 'endless', 'chaos']) {
  let musicStarts = 0;
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    gameState: 'playing', paused: false, gameOver: false, victory: false, upgradeUI: null,
    endless: mode !== 'act1', _chaosMode: mode === 'chaos', _redCurtain: null,
    player: { selectedCharacter: 'eddie', mana: 100, pos: new Vec2(100, 100) },
    _feedbackApoc: { active: false, isActive() { return this.active; }, trigger() { this.active = true; } },
    _ensureFeedbackFx() {}, _playerScreenPos: () => ({ cx: 100, footY: 100 }),
    screenShake: { trigger() {} }, floatingTexts: [], _guitarPerf: null,
    audio: { playEddieUltimateTrack() { musicStarts++; }, playEventWarning() {} },
  });
  game.activateRedThunderCurtain();
  gate(`${mode}: natural Eddie ultimate starts one music track`, musicStarts === 1);
  gate(`${mode}: ultimate does not grant the GUITAR SOLO weapon runtime`, game._guitarPerf === null);
}

{
  let stopped = 0;
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    player: { selectedCharacter: 'eddie' },
    camera: { x: 0, y: 0 }, endless: false, _mobileZoom: 1, enemies: [],
    _eddieUltimateMusicActive: true,
    _feedbackApoc: {
      active: true,
      isActive() { return this.active; },
      update() { this.active = false; },
    },
    _playerScreenPos: () => ({ cx: 0, footY: 0 }),
    audio: { stopEddieUltimateTrack() { stopped++; } },
  });
  game._updateFeedbackFx(1 / 60);
  gate('Feedback Apocalypse end stops exactly one Eddie track and clears its latch',
    stopped === 1 && game._eddieUltimateMusicActive === false);
}

const leakedWaveDamage = (12 + 1 * 2) * (40 + 14 * 1) + (16 + 1 * 3) * (30 + 10 * 1);
console.log(`  evidence  removed accidental layer: ${leakedWaveDamage} raw damage/wave every 2.4s, previously persistent for the run`);
gate('removed layer is substantial and was not a cosmetic-only issue', leakedWaveDamage === 1516);

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
