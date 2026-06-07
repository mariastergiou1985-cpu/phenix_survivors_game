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

    this._setupTrack('assets/audio/music/menu_theme.mp3?v=10', 0.28, a => { this._menuAudio     = a; });
    this._setupTrack('assets/audio/music/gameplay_theme.mp3?v=2', 0.20, a => { this._gameplayAudio = a; });
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
      audio.loop  = true;
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
    const doPlay = () => audio.play().catch(() => {});
    if (this.actx.state === 'suspended') {
      this.actx.resume().then(doPlay);
    } else {
      doPlay();
    }
  }

  _stop(audio) {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  startMenuMusic() {
    this._stop(this._gameplayAudio);
    if (this._menuAudio?.paused) this._play(this._menuAudio);
  }

  startGameplayMusic() {
    this._stop(this._menuAudio);
    if (this._gameplayAudio?.paused) this._play(this._gameplayAudio);
  }

  stopAll() {
    this._stop(this._menuAudio);
    this._stop(this._gameplayAudio);
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

  // Stubs kept so existing game.audio?.playX() calls don't crash (out of scope).
  playDash()    {}
  updateAlarm() {}
}
