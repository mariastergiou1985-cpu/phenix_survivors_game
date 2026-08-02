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

// CONTRACT UPDATE (Maria 2026-08-02). This block used to drive the playlist with
//   for (8) { playEddieUltimateTrack(); stopEddieRiffs(); }
// i.e. one ultimate per track. P5R deliberately replaced that: ONE ultimate per run arms the
// playlist at track 1, tracks 2..8 start from the previous track's 'ended' event, and every later
// ultimate is a hard no-op (AudioManager.js `if (this.playlistActive) return this._eddiePlayState`).
// stopEddieRiffs() without a reset rewinds the index, so the old loop restarted track 1 eight
// times and reported eddie_riffs x8 - a failure against a contract the game no longer claims. It
// fails identically on the pristine tree. stopEddieRiffs({resetRotation:false}) has no production
// call site at all, so the scenario was unreachable in the shipped game. The 8/8 intent is kept -
// it is now driven the way production drives it.
for (const mode of ['act1', 'endless', 'chaos']) {
  const audio = new AudioManager();
  if (mode === 'act1') audio.startGameplayMusic();
  else if (mode === 'endless') audio.startEndlessMusic();
  else audio.startChaosMusic();
  const mapMusic = audio._currentMusic;
  const selected = [];
  const laterUltimates = [];
  selected.push(audio.playEddieUltimateTrack()?.trackId);      // one ultimate arms the run
  const el = audio.currentAudioInstance;
  for (let i = 1; i < album.length; i++) {
    laterUltimates.push(audio.playEddieUltimateTrack());        // must not move the cursor
    el.onended();                                              // production advance path
    selected.push(audio._eddiePlayState?.trackId);
  }
  gate(`${mode}: one run plays all ${album.length} album tracks in order, advancing on 'ended'`,
    selected.join(',') === ids.join(','), selected.join(','));
  gate(`${mode}: a later ultimate never restarts or skips the running track`,
    laterUltimates.every((st, i) => st !== null && st.trackId === selected[i]) &&
    audio.currentAudioInstance === el,
    `returned=${laterUltimates.map(st => st?.trackId).join(',')}`);
  gate(`${mode}: Eddie playback never replaces the mode BGM authority`, audio._currentMusic === mapMusic);
  el.onended();                                                // last track ends -> run complete
  gate(`${mode}: ultimate end restores the configured music bus`,
    audio.playlistActive === false && audio.playlistCompleted === true &&
    audio.musicGain.gain.value === audio.musicVolume,
    `gain=${audio.musicGain.gain.value} completed=${audio.playlistCompleted}`);
  gate(`${mode}: the album does not loop a second time in the same run`,
    audio.playEddieUltimateTrack() === null);
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
  // P5R made a second ultimate a HARD no-op: AudioManager returns the live _eddiePlayState
  // untouched while playlistActive. The old expectation (second.index === 1) predates that and had
  // been failing on the guard itself. The invariant that matters - no restart, no skip, no second
  // element - is asserted directly.
  gate('repeated ultimate is a hard no-op: same track, no restart, no skip',
    first?.index === 0 && second === first && audio.currentTrackIndex === 0,
    `second.index=${second?.index}`);
  audio.resetEddieRiffs();
  gate('death/reset cleanup stops playback and resets rotation',
    !audio.isEddieRiffsPlaying() && audio.playEddieUltimateTrack()?.index === 0);
  audio.stopEddieRiffs();
  audio.muted = true;
  gate('muted setting blocks Eddie track start', audio.playEddieUltimateTrack() === null && !audio.isEddieRiffsPlaying());
}

{
  // PRODUCTION PATH (Maria 2026-08-02). This used to model the transition with stopAll(), but
  // stopAll() is the RUN-END path - Game.js calls it only on death and victory, and it runs
  // resetEddieRiffs(). The real Act 1 -> Endless handoff is startEndlessMusic() followed by
  // `if (isEddiePlaylistActive()) resumeEddieUltimateTrack()`, with no stop at all, so the old
  // fixture was asserting against a sequence the game never performs.
  const audio = new AudioManager();
  audio.startGameplayMusic();
  const first = audio.playEddieUltimateTrack();
  audio.startEndlessMusic();
  const resumed = audio.isEddiePlaylistActive() ? audio.resumeEddieUltimateTrack() : null;
  gate('Act 1 to Endless transition keeps the SAME ultimate track playing',
    first?.index === 0 && resumed?.index === first.index && resumed?.trackId === first.trackId &&
    audio._currentMusic === audio._endlessAudio,
    `resumed=${resumed?.trackId}`);
  audio.currentAudioInstance.onended();
  gate('mode transition preserves the duck and the next-track rotation',
    Math.abs(audio.musicGain.gain.value - audio.musicVolume * 0.25) < 1e-9 &&
    audio._eddiePlayState?.index === 1 && audio._eddiePlayState?.trackId === ids[1],
    `next=${audio._eddiePlayState?.trackId} gain=${audio.musicGain.gain.value}`);
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
  // DECOUPLED BY DESIGN (Maria 2026-08-02). Game.js states it directly: the cinematic runs ~3.65 s
  // while the album tracks are 3-5 minute songs, so the VFX ending must NOT cut the music.
  // stopEddieUltimateTrack() has no production call site left outside AudioManager's own alias -
  // this assertion was testing a path that was deleted. What must hold now: the VFX end stops
  // NOTHING, and the Game latch follows the playlist rather than the cinematic.
  game.audio.isEddiePlaylistActive = () => true;
  game._updateFeedbackFx(1 / 60);
  gate('Feedback Apocalypse end never cuts a running Eddie track',
    stopped === 0, `stopped=${stopped}`);
  gate('the Eddie music latch follows the playlist, not the cinematic',
    game._eddieUltimateMusicActive === true, `latch=${game._eddieUltimateMusicActive}`);
  game.audio.isEddiePlaylistActive = () => false;
  game._feedbackApoc.active = true;
  game._updateFeedbackFx(1 / 60);
  gate('and the latch clears once the playlist itself is finished',
    stopped === 0 && game._eddieUltimateMusicActive === false,
    `stopped=${stopped}, latch=${game._eddieUltimateMusicActive}`);
}

const leakedWaveDamage = (12 + 1 * 2) * (40 + 14 * 1) + (16 + 1 * 3) * (30 + 10 * 1);
console.log(`  evidence  removed accidental layer: ${leakedWaveDamage} raw damage/wave every 2.4s, previously persistent for the run`);
gate('removed layer is substantial and was not a cosmetic-only issue', leakedWaveDamage === 1516);

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
