// ─── Volume settings (persisted to localStorage) ──────────────────────────────
const VOL_KEYS = {
  master: 'phenix_master_volume',
  music:  'phenix_music_volume',
  sfx:    'phenix_sfx_volume',
  muted:  'phenix_muted',
};
const VOL_DEFAULTS = { master: 1.0, music: 0.70, sfx: 0.80, muted: false };

const clamp01 = v => Math.max(0, Math.min(1, v));

export class AudioManager {
  constructor() {
    this.actx = new AudioContext();

    // Load persisted volume/mute settings (source of truth lives here).
    this._loadVolumes();

    // Master node — its gain reflects masterVolume (or 0 while muted).
    this.masterGain = this.actx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
    this.masterGain.connect(this.actx.destination);

    // Music bus — scaled by musicVolume. Per-track base gains feed into this.
    this.musicGain = this.actx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.masterGain);

    // SFX bus — scaled by sfxVolume. Routed through masterGain so mute (M),
    // which zeroes masterGain, silences SFX too while keeping its level
    // independent of music. Final music = master×music×trackBase;
    // final SFX = master×sfx×toneBase.
    this.sfxGain = this.actx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);

    // Per-sound timestamps for rate-limiting (avoids machine-gun stacking).
    this._lastPlay = {};

    this._menuAudio     = null;
    this._gameplayAudio = null;
    this._endlessAudio  = null;
    this._currentMusic  = null;   // the single track that may be audible; gates _play retries

    this._setupTrack('assets/audio/music/menu_theme.mp3?v=20260614183305', 0.28, a => { this._menuAudio     = a; });
    this._setupTrack('assets/audio/music/gameplay_theme.mp3?v=20260614183305', 0.20, a => { this._gameplayAudio = a; });
    // Endless-only track (dawn). Missing/failed load degrades safely (onerror warn).
    this._setupTrack('assets/audio/music/endless/dawn.wav?v=20260614183305', 0.20, a => { this._endlessAudio = a; });
  }

  // ─── Volume persistence ─────────────────────────────────────────────────────
  _loadVolumes() {
    const read = (key, def) => {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return def;
        const n = Number(raw);
        return Number.isFinite(n) ? clamp01(n) : def;
      } catch (_) { return def; }
    };
    this.masterVolume = read(VOL_KEYS.master, VOL_DEFAULTS.master);
    this.musicVolume  = read(VOL_KEYS.music,  VOL_DEFAULTS.music);
    this.sfxVolume    = read(VOL_KEYS.sfx,    VOL_DEFAULTS.sfx);
    try {
      this.muted = localStorage.getItem(VOL_KEYS.muted) === 'true';
    } catch (_) { this.muted = VOL_DEFAULTS.muted; }
  }

  _saveVolume(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (_) {}
  }

  setMasterVolume(v) {
    this.masterVolume = clamp01(v);
    if (!this.muted) this.masterGain.gain.value = this.masterVolume;
    this._saveVolume(VOL_KEYS.master, this.masterVolume);
  }

  setMusicVolume(v) {
    this.musicVolume = clamp01(v);
    this.musicGain.gain.value = this.musicVolume;
    this._saveVolume(VOL_KEYS.music, this.musicVolume);
  }

  setSfxVolume(v) {
    this.sfxVolume = clamp01(v);
    this.sfxGain.gain.value = this.sfxVolume;
    this._saveVolume(VOL_KEYS.sfx, this.sfxVolume);
  }

  _setupTrack(src, volume, assign) {
    try {
      const audio = new Audio(src);
      audio.loop    = true;
      audio.preload = 'auto';   // buffer aggressively so playback starts promptly
      audio.onerror = () => console.warn(`[Audio] failed to load: ${src}`);
      const source = this.actx.createMediaElementSource(audio);
      const gain   = this.actx.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(this.musicGain);
      assign(audio);
    } catch (_) {
      console.warn(`[Audio] Could not load: ${src}`);
    }
  }

  _play(audio) {
    if (!audio) return;
    // The first play() on a gesture can fail because the AudioContext is still resuming
    // or the media element hasn't buffered yet — which is why the menu used to stay silent
    // until a SECOND interaction. Resume the context, then retry play() a few times until
    // it actually starts. The `!audio.paused` guard makes every call idempotent, so this
    // never stacks duplicate playback and never restarts an already-playing track.
    const attempt = (n) => {
      if (audio !== this._currentMusic) return;  // a newer track took over → abandon (prevents overlap)
      if (!audio.paused) return;                 // already playing → done (no duplicates)
      audio.play().catch(() => {
        if (n > 0) setTimeout(() => attempt(n - 1), 250);
      });
    };
    if (this.actx.state === 'suspended') {
      this.actx.resume().then(() => attempt(10)).catch(() => attempt(10));
    } else {
      attempt(10);
    }
  }

  _stop(audio) {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  // Each start method makes its track the single CURRENT track: stop the other two, then
  // record + play this one. _currentMusic gates _play's async retry so a stale track that
  // was just stopped can never re-start on top of the new one (the overlap bug).
  startMenuMusic() {
    this._stop(this._gameplayAudio);
    this._stop(this._endlessAudio);
    this._currentMusic = this._menuAudio;
    this._play(this._menuAudio);
  }

  startGameplayMusic() {
    this._stop(this._menuAudio);
    this._stop(this._endlessAudio);
    this._currentMusic = this._gameplayAudio;
    this._play(this._gameplayAudio);
  }

  // Endless-only music — plays solely after CONTINUE — ENDLESS / direct ENDLESS MODE start.
  // Stops the menu/gameplay tracks first so only one track ever plays.
  startEndlessMusic() {
    this._stop(this._menuAudio);
    this._stop(this._gameplayAudio);
    this._currentMusic = this._endlessAudio;
    this._play(this._endlessAudio);
  }

  stopAll() {
    this._currentMusic = null;
    this._stop(this._menuAudio);
    this._stop(this._gameplayAudio);
    this._stop(this._endlessAudio);
  }

  toggleMute() {
    this.muted = !this.muted;
    // Restore to the saved masterVolume on unmute; volume sliders are untouched.
    this.masterGain.gain.setTargetAtTime(
      this.muted ? 0 : this.masterVolume,
      this.actx.currentTime, 0.05
    );
    this._saveVolume(VOL_KEYS.muted, this.muted);
  }

  // ─── SFX (WebAudio-synthesized, no external files) ──────────────────────────

  // Rate-limit guard: returns false if `key` played within `minGap` seconds.
  _canPlay(key, minGap) {
    const t = this.actx.currentTime;
    if (this._lastPlay[key] !== undefined && t - this._lastPlay[key] < minGap) return false;
    this._lastPlay[key] = t;
    return true;
  }

  // Short pitched blip with an attack/decay envelope.
  _tone({ type = 'sine', freqStart, freqEnd, dur, gain = 0.15, delay = 0 }) {
    if (this.muted) return;
    const t0  = this.actx.currentTime + delay;
    const osc = this.actx.createOscillator();
    const g   = this.actx.createGain();
    osc.type  = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Decaying filtered white-noise burst (for digital crackle / zap texture).
  _noiseBurst({ dur = 0.12, gain = 0.12, filterType = 'highpass', freq = 800 }) {
    if (this.muted) return;
    const t0  = this.actx.currentTime;
    const len = Math.floor(this.actx.sampleRate * dur);
    const buf = this.actx.createBuffer(1, len, this.actx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src    = this.actx.createBufferSource();
    src.buffer   = buf;
    const filter = this.actx.createBiquadFilter();
    filter.type  = filterType;
    filter.frequency.value = freq;
    const g = this.actx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // 1. Shoot — short cyber laser blip (descending square).
  playShoot() {
    if (!this._canPlay('shoot', 0.05)) return;
    this._tone({ type: 'square', freqStart: 880, freqEnd: 240, dur: 0.08, gain: 0.11 });
  }

  // 2. Enemy hit — small electric zap (saw + tiny noise tick).
  playHit() {
    if (!this._canPlay('hit', 0.04)) return;
    this._tone({ type: 'sawtooth', freqStart: 320, freqEnd: 140, dur: 0.06, gain: 0.10 });
    this._noiseBurst({ dur: 0.05, gain: 0.05, filterType: 'highpass', freq: 1600 });
  }

  // 3. Enemy death — glitch burst / digital crack.
  playDeath() {
    if (!this._canPlay('death', 0.05)) return;
    this._tone({ type: 'sawtooth', freqStart: 200, freqEnd: 40, dur: 0.22, gain: 0.15 });
    this._noiseBurst({ dur: 0.18, gain: 0.12, filterType: 'bandpass', freq: 600 });
  }

  // 4. Core pickup — clean bright ascending ping.
  playCorePickup() {
    if (!this._canPlay('pickup', 0.04)) return;
    this._tone({ type: 'triangle', freqStart: 660, freqEnd: 1320, dur: 0.10, gain: 0.13 });
  }

  // 5. Core slot / deposit — deeper two-note confirm chime.
  playCoreSlot() {
    this._tone({ type: 'sine', freqStart: 330, freqEnd: 660, dur: 0.14, gain: 0.15 });
    this._tone({ type: 'sine', freqStart: 495, freqEnd: 990, dur: 0.16, gain: 0.09, delay: 0.05 });
  }

  // 6. Dash — fast 16-bit cyber whoosh (descending saw + airy noise sweep).
  playDash() {
    if (!this._canPlay('dash', 0.10)) return;
    this._tone({ type: 'sawtooth', freqStart: 720, freqEnd: 180, dur: 0.14, gain: 0.10 });
    this._noiseBurst({ dur: 0.12, gain: 0.07, filterType: 'highpass', freq: 1200 });
  }

  // 7. Phoenix revive — epic rising energy burst; Gold tier sounds stronger.
  playPhoenixRevive(type = 'orange') {
    if (!this._canPlay('phoenix', 0.20)) return;
    const strong = type === 'gold';
    const g = strong ? 0.16 : 0.13;
    this._tone({ type: 'sawtooth', freqStart: 220, freqEnd: 880,  dur: 0.50, gain: g });
    this._tone({ type: 'sine',     freqStart: 330, freqEnd: 1320, dur: 0.55, gain: g * 0.7, delay: 0.05 });
    this._noiseBurst({ dur: 0.40, gain: strong ? 0.10 : 0.07, filterType: 'bandpass', freq: 1000 });
    if (strong) {
      this._tone({ type: 'square', freqStart: 660, freqEnd: 1760, dur: 0.50, gain: 0.08, delay: 0.10 });
    }
  }

  // 8. Boss spawn — deep bass impact + dark alarm beeps.
  playBossSpawn() {
    if (!this._canPlay('bossSpawn', 0.30)) return;
    this._tone({ type: 'sine', freqStart: 120, freqEnd: 40, dur: 0.50, gain: 0.18 });
    this._noiseBurst({ dur: 0.30, gain: 0.10, filterType: 'lowpass', freq: 400 });
    this._tone({ type: 'square', freqStart: 440, freqEnd: 440, dur: 0.12, gain: 0.09, delay: 0.16 });
    this._tone({ type: 'square', freqStart: 440, freqEnd: 440, dur: 0.12, gain: 0.09, delay: 0.40 });
  }

  // 9. Level-up / upgrade cards — bright ascending cyber power-up chime.
  playLevelUp() {
    if (!this._canPlay('levelup', 0.10)) return;
    this._tone({ type: 'triangle', freqStart: 523, freqEnd: 523, dur: 0.10, gain: 0.12 });
    this._tone({ type: 'triangle', freqStart: 659, freqEnd: 659, dur: 0.10, gain: 0.12, delay: 0.08 });
    this._tone({ type: 'triangle', freqStart: 988, freqEnd: 988, dur: 0.16, gain: 0.13, delay: 0.16 });
  }

  // 10. Event warning — short red-alert two-tone beep (rate-limited, no spam).
  playEventWarning() {
    if (!this._canPlay('warning', 0.25)) return;
    this._tone({ type: 'square', freqStart: 880, freqEnd: 880, dur: 0.10, gain: 0.10 });
    this._tone({ type: 'square', freqStart: 660, freqEnd: 660, dur: 0.12, gain: 0.10, delay: 0.14 });
  }

  // 11. Grid Cache appear — soft bright rising ping (distinct from core pickup).
  playGridCache() {
    if (!this._canPlay('gridcache', 0.10)) return;
    this._tone({ type: 'sine', freqStart: 784, freqEnd: 1568, dur: 0.18, gain: 0.11 });
  }

  // ─── Enemy / boss / drone SFX ───────────────────────────────────────────────

  // Enemy shoot — hostile descending square, darker/lower than the player blip.
  playEnemyShoot() {
    if (!this._canPlay('enemyShoot', 0.06)) return;
    this._tone({ type: 'square', freqStart: 520, freqEnd: 160, dur: 0.07, gain: 0.07 });
    this._noiseBurst({ dur: 0.03, gain: 0.03, filterType: 'highpass', freq: 1400 });
  }

  // Enemy projectile impact on player — short electric shield zap.
  playEnemyProjectileImpact() {
    if (!this._canPlay('enemyImpact', 0.05)) return;
    this._tone({ type: 'sawtooth', freqStart: 260, freqEnd: 90, dur: 0.07, gain: 0.10 });
    this._noiseBurst({ dur: 0.05, gain: 0.06, filterType: 'highpass', freq: 1200 });
  }

  // Titan shockwave — deep bass slam + low rumble.
  playTitanShockwave() {
    if (!this._canPlay('titanShock', 0.25)) return;
    this._tone({ type: 'sine', freqStart: 90, freqEnd: 30, dur: 0.35, gain: 0.16 });
    this._noiseBurst({ dur: 0.28, gain: 0.10, filterType: 'lowpass', freq: 320 });
  }

  // Titan beam — charged energy blast (rising sweep + airy texture).
  playTitanBeam() {
    if (!this._canPlay('titanBeam', 0.25)) return;
    this._tone({ type: 'sawtooth', freqStart: 180, freqEnd: 900, dur: 0.30, gain: 0.12 });
    this._noiseBurst({ dur: 0.26, gain: 0.08, filterType: 'bandpass', freq: 1100 });
  }

  // Matrix Annihilator breach — corruption alarm / detuned hum.
  playMatrixBreach() {
    if (!this._canPlay('matrixBreach', 0.20)) return;
    this._tone({ type: 'square', freqStart: 330, freqEnd: 330, dur: 0.22, gain: 0.09 });
    this._tone({ type: 'square', freqStart: 247, freqEnd: 247, dur: 0.22, gain: 0.07 });
    this._noiseBurst({ dur: 0.18, gain: 0.06, filterType: 'bandpass', freq: 500 });
  }

  // Matrix critical (matrix fully drained) — sharp critical-error glitch beep.
  playMatrixCritical() {
    if (!this._canPlay('matrixCrit', 0.30)) return;
    this._tone({ type: 'square', freqStart: 880, freqEnd: 880, dur: 0.09, gain: 0.10 });
    this._tone({ type: 'square', freqStart: 660, freqEnd: 660, dur: 0.10, gain: 0.10, delay: 0.10 });
  }

  // Bloodfang bite/lunge — heavy cyber-beast snap.
  playBloodfangBite() {
    if (!this._canPlay('bloodfangBite', 0.12)) return;
    this._tone({ type: 'sawtooth', freqStart: 200, freqEnd: 60, dur: 0.12, gain: 0.13 });
    this._noiseBurst({ dur: 0.08, gain: 0.08, filterType: 'bandpass', freq: 700 });
  }

  // Razorhound bite — fast sharp slash.
  playRazorhoundBite() {
    if (!this._canPlay('razorBite', 0.10)) return;
    this._tone({ type: 'sawtooth', freqStart: 400, freqEnd: 140, dur: 0.07, gain: 0.09 });
    this._noiseBurst({ dur: 0.04, gain: 0.05, filterType: 'highpass', freq: 1800 });
  }

  // Flame support drone attack — soft flame whoosh.
  playDroneFlame() {
    if (!this._canPlay('droneFlame', 0.10)) return;
    this._noiseBurst({ dur: 0.14, gain: 0.07, filterType: 'bandpass', freq: 420 });
    this._tone({ type: 'sine', freqStart: 180, freqEnd: 110, dur: 0.12, gain: 0.05 });
  }

  // Electro support drone attack — electric zap / bolt.
  playDroneElectro() {
    if (!this._canPlay('droneElectro', 0.10)) return;
    this._tone({ type: 'sawtooth', freqStart: 600, freqEnd: 1400, dur: 0.09, gain: 0.07 });
    this._noiseBurst({ dur: 0.06, gain: 0.06, filterType: 'highpass', freq: 2000 });
  }

  // Classic boss spawn warning — short two-tone red-alert klaxon
  // (distinct from the mini-boss playBossSpawn impact).
  playBossWarning() {
    if (!this._canPlay('bossWarn', 0.50)) return;
    this._tone({ type: 'square', freqStart: 660, freqEnd: 440, dur: 0.18, gain: 0.10 });
    this._tone({ type: 'square', freqStart: 660, freqEnd: 440, dur: 0.18, gain: 0.10, delay: 0.22 });
  }

  // Stub kept so existing game.audio?.updateAlarm() calls don't crash (out of scope).
  updateAlarm() {}
}
