export class AudioManager {
  constructor() {
    this.actx       = new AudioContext();
    this.muted      = false;
    this.masterGain = this.actx.createGain();
    this.masterGain.gain.value = 0.65;
    this.masterGain.connect(this.actx.destination);

    // Dedicated bus for synthesized SFX. Routed through masterGain so the
    // existing mute (M) — which zeroes masterGain — silences SFX too, while
    // keeping SFX level independent of the music tracks.
    this.sfxGain = this.actx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.masterGain);

    // Per-sound timestamps for rate-limiting (avoids machine-gun stacking).
    this._lastPlay = {};

    this._menuAudio     = null;
    this._gameplayAudio = null;

    this._setupTrack('assets/audio/music/menu_theme.mp3?v=10', 0.28, a => { this._menuAudio     = a; });
    this._setupTrack('assets/audio/music/gameplay_theme.mp3?v=2', 0.20, a => { this._gameplayAudio = a; });
  }

  _setupTrack(src, volume, assign) {
    try {
      const audio = new Audio(src);
      audio.loop  = true;
      const source = this.actx.createMediaElementSource(audio);
      const gain   = this.actx.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(this.masterGain);
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
    this.masterGain.gain.setTargetAtTime(
      this.muted ? 0 : 0.65,
      this.actx.currentTime, 0.05
    );
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
