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

    // Analyser tap — connected once to musicGain as a parallel sink (no audio output).
    // fftSize 64 → 32 frequency bins, lightweight. Used by the menu equalizer UI.
    this.analyser = this.actx.createAnalyser();
    this.analyser.fftSize = 64;
    this.analyser.smoothingTimeConstant = 0.75;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount); // 32 bins
    this.musicGain.connect(this.analyser);

    // Human-readable title of the currently playing track (updated by start* methods).
    this.currentTrackTitle = '';

    // SFX bus — scaled by sfxVolume. Routed through masterGain so mute (M),
    // which zeroes masterGain, silences SFX too while keeping its level
    // independent of music. Final music = master×music×trackBase;
    // final SFX = master×sfx×toneBase.
    this.sfxGain = this.actx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);

    // Per-sound timestamps for rate-limiting (avoids machine-gun stacking).
    this._lastPlay = {};

    // File-based SFX: decoded AudioBuffers cached here after first fetch.
    // _sfxLoading guards against duplicate in-flight fetches.
    this._sfxBuffers = {};
    this._sfxLoading = new Set();

    this._menuAudio     = null;
    this._gameplayAudio = null;
    this._endlessAudio  = null;
    this._chaosAudio    = null;
    this._currentMusic  = null;   // the single track that may be audible; gates _play retries

    this._setupTrack('assets/audio/music/menu_theme.mp3?v=20260615210000', 0.28, a => { this._menuAudio     = a; });
    this._setupTrack('assets/audio/music/gameplay_theme.mp3?v=20260615210000', 0.20, a => { this._gameplayAudio = a; });
    // Chaos Mode track (Winter of the Blade). Degrades safely if missing.
    this._setupTrack('assets/audio/music/Chaos/Golden_ Override _Protocol.wav?v=20260615210000', 0.20, a => { this._chaosAudio = a; });
    // Endless-only track (dawn). Missing/failed load degrades safely (onerror warn).
    this._setupTrack('assets/audio/music/endless/dawn.wav?v=20260615210000', 0.20, a => { this._endlessAudio = a; });
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
    this._stop(this._chaosAudio);
    this._currentMusic = this._menuAudio;
    this.currentTrackTitle = 'Hope';
    this._play(this._menuAudio);
  }

  startGameplayMusic() {
    this._stop(this._menuAudio);
    this._stop(this._endlessAudio);
    this._stop(this._chaosAudio);
    this._currentMusic = this._gameplayAudio;
    this.currentTrackTitle = 'NULL EDEN OST';
    this._play(this._gameplayAudio);
  }

  // Endless-only music — plays solely after CONTINUE — ENDLESS / direct ENDLESS MODE start.
  // Stops the menu/gameplay tracks first so only one track ever plays.
  startEndlessMusic() {
    this._stop(this._menuAudio);
    this._stop(this._gameplayAudio);
    this._stop(this._chaosAudio);
    this._currentMusic = this._endlessAudio;
    this.currentTrackTitle = 'NYX';
    this._play(this._endlessAudio);
  }

  // Chaos Mode music — replaces the Endless track at 31:00. Loops continuously.
  // Routes through musicGain → AnalyserNode so the equalizer reacts to it.
  startChaosMusic() {
    this._stop(this._menuAudio);
    this._stop(this._gameplayAudio);
    this._stop(this._endlessAudio);
    this._currentMusic = this._chaosAudio;
    this.currentTrackTitle = 'Golden Override Protocol';
    this._play(this._chaosAudio);
  }

  stopAll() {
    this._currentMusic = null;
    this._stop(this._menuAudio);
    this._stop(this._gameplayAudio);
    this._stop(this._endlessAudio);
    this._stop(this._chaosAudio);
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

  // 1. Shoot — short cyber laser blip (descending triangle; softer than square).
  // ── PROCEDURAL SFX ENGINE — generateSound(type) ────────────────────────────
  // Zero-file real-time synthesis (WebAudio oscillators + biquad filters).
  // The files in assets/audio/sfx/ remain the PRIMARY source; this engine is
  // the guaranteed fallback so no event is EVER silent (first trigger before
  // fetch completes, slow network, offline play).
  generateSound(type, throttle = 0) {
    if (!this.actx) return;
    const now = this.actx.currentTime;
    this._genLast = this._genLast || {};
    if (throttle > 0 && this._genLast[type] !== undefined && now - this._genLast[type] < throttle) return;
    this._genLast[type] = now;
    const out = this.sfxGain;
    const noise = (dur) => {
      const n = this.actx.createBufferSource();
      const buf = this.actx.createBuffer(1, Math.ceil(this.actx.sampleRate * dur), this.actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      n.buffer = buf; return n;
    };
    switch (type) {
      case 'enemy-death': {   // sharp white-noise burst, fast exponential decay
        const src = noise(0.25);
        const bp = this.actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
        const g = this.actx.createGain();
        g.gain.setValueAtTime(0.5, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        src.connect(bp); bp.connect(g); g.connect(out); src.start(now); src.stop(now + 0.25);
        break;
      }
      case 'airstrike-bomb': {   // cinematic bass sweep — EXPONENTIAL pitch drop + boom noise
        const o = this.actx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(320, now);
        o.frequency.exponentialRampToValueAtTime(38, now + 0.7);
        const g = this.actx.createGain();
        g.gain.setValueAtTime(0.65, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.95);
        const src = noise(0.5);
        const lp = this.actx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(900, now);
        lp.frequency.exponentialRampToValueAtTime(120, now + 0.5);
        const g2 = this.actx.createGain(); g2.gain.setValueAtTime(0.4, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        src.connect(lp); lp.connect(g2); g2.connect(out); src.start(now); src.stop(now + 0.5);
        break;
      }
      case 'lava-rain': {   // heavy bubbling — LFO-modulated low osc, low-pass roll-off (atmospheric)
        const o = this.actx.createOscillator(); o.type = 'triangle'; o.frequency.value = 70;
        const lfo = this.actx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 6 + Math.random() * 5;   // randomized pitch modulation
        const lfoG = this.actx.createGain(); lfoG.gain.value = 28;
        lfo.connect(lfoG); lfoG.connect(o.frequency);
        const lp = this.actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;   // high-frequency roll-off → heavy
        const g = this.actx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.35, now + 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
        o.connect(lp); lp.connect(g); g.connect(out);
        o.start(now); lfo.start(now); o.stop(now + 2.3); lfo.stop(now + 2.3);
        break;
      }
      case 'acid-rain': {   // corrosive hiss — low-passed noise bed
        const src = noise(2.2);
        const lp = this.actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
        const g = this.actx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.22, now + 0.2);
        g.gain.exponentialRampToValueAtTime(0.001, now + 2.1);
        src.connect(lp); lp.connect(g); g.connect(out); src.start(now); src.stop(now + 2.2);
        break;
      }
      case 'rocket-rain': {   // rising whoosh into bomb thump
        const src = noise(1.1);
        const bp = this.actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(300, now);
        bp.frequency.exponentialRampToValueAtTime(2400, now + 0.6);
        const g = this.actx.createGain(); g.gain.setValueAtTime(0.28, now); g.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
        src.connect(bp); bp.connect(g); g.connect(out); src.start(now); src.stop(now + 1.1);
        setTimeout(() => this.generateSound('airstrike-bomb'), 550);
        break;
      }
      case 'player-death': {   // descending saw power-down through closing filter
        const o = this.actx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(440, now);
        o.frequency.exponentialRampToValueAtTime(40, now + 1.6);
        const lp = this.actx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3200, now);
        lp.frequency.exponentialRampToValueAtTime(200, now + 1.6);
        const g = this.actx.createGain(); g.gain.setValueAtTime(0.5, now); g.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        o.connect(lp); lp.connect(g); g.connect(out); o.start(now); o.stop(now + 1.85);
        break;
      }
      case 'player-impact': {   // thud — sine pitch-bend through low-pass
        const o = this.actx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(180, now);
        o.frequency.exponentialRampToValueAtTime(55, now + 0.16);
        const lp = this.actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
        const g = this.actx.createGain(); g.gain.setValueAtTime(0.55, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        o.connect(lp); lp.connect(g); g.connect(out); o.start(now); o.stop(now + 0.22);
        break;
      }
    }
  }

  // Player takes a hit — heavy thud (procedural; throttled so swarms don't drum-roll).
  playPlayerImpact() { this.generateSound('player-impact', 0.25); }

  playShoot() {
    if (!this._canPlay('shoot', 0.09)) return;
    this._tone({ type: 'triangle', freqStart: 660, freqEnd: 200, dur: 0.08, gain: 0.065 });
  }

  // 2. Enemy hit — small electric zap (saw + tiny noise tick).
  playHit() {
    if (!this._canPlay('hit', 0.07)) return;
    this._tone({ type: 'sawtooth', freqStart: 320, freqEnd: 140, dur: 0.06, gain: 0.07 });
    this._noiseBurst({ dur: 0.05, gain: 0.04, filterType: 'highpass', freq: 1600 });
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

  // ─── Phase 1 Weapon SFX ───────────────────────────────────────────────────

  // Plasma Blade — broad energy arc swing.
  playPlasmaBladeSwing() {
    if (!this._canPlay("plasmaSwing", 0.25)) return;
    this._tone({ type: "sawtooth", freqStart: 280, freqEnd: 60,  dur: 0.22, gain: 0.16 });
    this._tone({ type: "sine",     freqStart: 900, freqEnd: 220, dur: 0.18, gain: 0.10 });
    this._noiseBurst({ dur: 0.20, gain: 0.09, filterType: "bandpass", freq: 400 });
    this._noiseBurst({ dur: 0.12, gain: 0.04, filterType: "bandpass", freq: 600 });
  }

  // Plasma Blade — impact crackle on successful hit.
  playPlasmaBladeHit() {
    if (!this._canPlay("plasmaHit", 0.10)) return;
    this._tone({ type: "sawtooth", freqStart: 220, freqEnd: 55,  dur: 0.14, gain: 0.18 });
    this._tone({ type: "square",   freqStart: 600, freqEnd: 180, dur: 0.08, gain: 0.12 });
    this._noiseBurst({ dur: 0.07, gain: 0.11, filterType: "highpass", freq: 2000 });
    this._noiseBurst({ dur: 0.05, gain: 0.05, filterType: "highpass", freq: 1800 });
  }

  // Void Needle — sharp piercing shot.
  playVoidNeedleFire() {
    if (!this._canPlay("voidFire", 0.08)) return;
    this._tone({ type: "triangle", freqStart: 1200, freqEnd: 400, dur: 0.09, gain: 0.13 });
    this._noiseBurst({ dur: 0.07, gain: 0.06, filterType: "highpass", freq: 3000 });
  }

  // Void Needle — soft impact on hit.
  playVoidNeedleHit() {
    if (!this._canPlay("voidHit", 0.08)) return;
    this._tone({ type: "sawtooth", freqStart: 320, freqEnd: 90,  dur: 0.09, gain: 0.14 });
    this._tone({ type: "square",   freqStart: 700, freqEnd: 200, dur: 0.05, gain: 0.09 });
    this._noiseBurst({ dur: 0.05, gain: 0.08, filterType: "highpass", freq: 2500 });
    this._noiseBurst({ dur: 0.04, gain: 0.03, filterType: "highpass", freq: 2200 });
  }

  // Sentry Drone — light blaster pop on fire.
  playSentryDroneFire() {
    if (!this._canPlay("sentryFire", 0.12)) return;
    this._tone({ type: "triangle", freqStart: 1400, freqEnd: 500, dur: 0.09, gain: 0.12 });
    this._tone({ type: "sawtooth", freqStart: 600,  freqEnd: 200, dur: 0.06, gain: 0.07 });
  }

  // Sentry Drone — small impact on hit.
  playSentryDroneHit() {
    if (!this._canPlay("sentryHit", 0.10)) return;
    this._tone({ type: "sine",     freqStart: 420, freqEnd: 120, dur: 0.08, gain: 0.12 });
    this._noiseBurst({ dur: 0.05, gain: 0.08, filterType: "highpass", freq: 2400 });
    this._tone({ type: "sine", freqStart: 500, freqEnd: 200, dur: 0.04, gain: 0.04 });
  }

  // Shard Ring — resonant contact hum on enemy hit (global throttle keeps it from spamming).
  playShardRingHit() {
    if (!this._canPlay("shardHit", 0.15)) return;
    this._tone({ type: "sine",     freqStart: 160, freqEnd: 280, dur: 0.14, gain: 0.14 });
    this._tone({ type: "sawtooth", freqStart: 320, freqEnd: 160, dur: 0.08, gain: 0.09 });
    this._noiseBurst({ dur: 0.06, gain: 0.06, filterType: "bandpass", freq: 1200 });
    this._noiseBurst({ dur: 0.06, gain: 0.025, filterType: "bandpass", freq: 900 });
  }

  // Rail Spike — heavy magnetic launch thump.
  playRailSpikeFire() {
    if (!this._canPlay("railFire", 0.40)) return;
    this._tone({ type: "sawtooth", freqStart: 55,  freqEnd: 380, dur: 0.22, gain: 0.20 });
    this._tone({ type: "triangle", freqStart: 900, freqEnd: 300, dur: 0.14, gain: 0.12 });
    this._noiseBurst({ dur: 0.18, gain: 0.14, filterType: "lowpass", freq: 600 });
    this._noiseBurst({ dur: 0.14, gain: 0.07, filterType: "lowpass", freq: 400 });
  }

  // Rail Spike — deep bass impact on hit.
  playRailSpikeImpact() {
    if (!this._canPlay("railImpact", 0.15)) return;
    this._tone({ type: "sine",     freqStart: 100, freqEnd: 25,  dur: 0.30, gain: 0.20 });
    this._tone({ type: "sawtooth", freqStart: 280, freqEnd: 80,  dur: 0.12, gain: 0.12 });
    this._noiseBurst({ dur: 0.15, gain: 0.12, filterType: "bandpass", freq: 400 });
    this._noiseBurst({ dur: 0.12, gain: 0.06, filterType: "bandpass", freq: 300 });
  }


  // ─── File-based SFX loader (fetch → decodeAudioData → cached AudioBuffer) ──
  // Tries each src in order; silently skips missing files. On first call the buffer
  // is still loading (returns null) — the sound is skipped that frame; subsequent
  // calls play from cache. All file SFX route through sfxGain → masterGain so they
  // respect mute (M key) and SFX volume exactly like the synthesized sounds above.

  _loadSfxFile(key, ...srcs) {
    if (this._sfxBuffers[key] || this._sfxLoading.has(key)) return;
    this._sfxLoading.add(key);
    const tryNext = (i) => {
      if (i >= srcs.length) {
        console.warn('[SFX] Not found:', srcs);
        return;
      }
      fetch(srcs[i])
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(ab => this.actx.decodeAudioData(ab))
        .then(buf => { this._sfxBuffers[key] = buf; })
        .catch(() => tryNext(i + 1));
    };
    tryNext(0);
  }

  _playSfxBuffer(key, minGap, vol = 0.9) {
    if (this.muted) return;
    if (!this._canPlay(key, minGap)) return;
    const buf = this._sfxBuffers[key];
    if (!buf) return;
    if (this.actx.state === 'suspended') this.actx.resume();
    const src = this.actx.createBufferSource();
    src.buffer = buf;
    const g = this.actx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  // ─── File-backed SFX — each method preloads on first call, plays from cache ─

  // Enemy / boss death — throttled: at most one sound per 80 ms so mass-kill chaos
  // doesn't stack dozens of instances and bog down the audio thread.
  playEnemyDeath() {
    this._loadSfxFile('sfxEnemyDeath',
      'assets/audio/sfx/enemy-death.ogg',
      'assets/audio/sfx/enemy-death.mp3',
      'assets/audio/sfx/enemy-death.wav');
    if (this._sfxBuffers['sfxEnemyDeath']) {
      this._playSfxBuffer('sfxEnemyDeath', 0.08, 0.85);
    } else {
      // Buffer still loading — procedural fallback, never silent.
      this.generateSound('enemy-death', 0.08);
    }
  }

  // Player death / game over — fires once per run; no throttle needed.
  playPlayerDeath() {
    this._loadSfxFile('sfxPlayerDeath',
      'assets/audio/sfx/player-death.ogg',
      'assets/audio/sfx/player-death.mp3',
      'assets/audio/sfx/player-death.wav');
    if (this._sfxBuffers['sfxPlayerDeath']) this._playSfxBuffer('sfxPlayerDeath', 0, 1.0);
    else this.generateSound('player-death');
  }

  // Airstrike rocket impact — throttled 300 ms; many rockets land close together.
  playAirstrikeBomb() {
    this._loadSfxFile('sfxAirstrike',
      'assets/audio/sfx/airstrike-bomb.ogg',
      'assets/audio/sfx/airstrike-bomb.mp3',
      'assets/audio/sfx/airstrike-bomb.wav');
    if (this._sfxBuffers['sfxAirstrike']) this._playSfxBuffer('sfxAirstrike', 0.30, 0.90);
    else this.generateSound('airstrike-bomb', 0.30);
  }

  // Acid rain — throttled 4 s; plays once when the event activates.
  playAcidRain() {
    this._loadSfxFile('sfxAcidRain',
      'assets/audio/sfx/acid-rain.ogg',
      'assets/audio/sfx/acid-rain.mp3',
      'assets/audio/sfx/acid-rain.wav');
    if (this._sfxBuffers['sfxAcidRain']) this._playSfxBuffer('sfxAcidRain', 4.0, 0.85);
    else this.generateSound('acid-rain', 4.0);
  }

  // Lava rain — throttled 1.5 s; one hit per spawn wave (not per drop).
  playLavaRain() {
    this._loadSfxFile('sfxLavaRain',
      'assets/audio/sfx/lava-rain.ogg',
      'assets/audio/sfx/lava-rain.mp3',
      'assets/audio/sfx/lava-rain.wav');
    if (this._sfxBuffers['sfxLavaRain']) this._playSfxBuffer('sfxLavaRain', 1.5, 0.88);
    else this.generateSound('lava-rain', 1.5);
  }

  // Double Demons Rocket Rain — throttled 3 s; one sound per wave, not per rocket.
  playRocketRain() {
    this._loadSfxFile('sfxRocketRain',
      'assets/audio/sfx/rocket-rain.ogg',
      'assets/audio/sfx/rocket-rain.mp3',
      'assets/audio/sfx/rocket-rain.wav');
    if (this._sfxBuffers['sfxRocketRain']) this._playSfxBuffer('sfxRocketRain', 3.0, 0.90);
    else this.generateSound('rocket-rain', 3.0);
  }
  // ─── EDEN CORE transmission audio (V1) ──────────────────────────────────────
  // Clip IDs map to files under assets/audio/eden_core/.
  // If the file hasn't loaded yet (or doesn't exist), falls back to a synthesized
  // cyber-glitch tone so the transmission never crashes and never blocks music.
  // All paths respect mute and sfxGain — no special-casing needed.

  // Future clip IDs → filenames (add entries here as voice clips are produced).
  // Null value = no file planned yet; use synthesized fallback always.
  static _EDEN_CLIP_MAP = {
    chaos:          'chaos_signal_detected',
    null_breach:    'null_breach_detected',
    signal_down:    'signal_collapsed',
    extract:        'extract_you_once',
    return_grid:    'return_to_grid',
    grid_memory:    'grid_remembers',
  };

  /**
   * Play audio for an EDEN CORE transmission.
   * @param {string|null} clipId  Key from _EDEN_CLIP_MAP, or null for synthesized glitch.
   */
  playEdenTransmission(clipId = null) {
    if (this.muted) return;
    if (!this._canPlay('edenTx', 3.5)) return;   // hard-limit: never more than once per 3.5 s

    const filename = clipId ? AudioManager._EDEN_CLIP_MAP[clipId] : null;
    if (filename) {
      const key = 'sfxEden_' + clipId;
      this._loadSfxFile(key,
        `assets/audio/eden_core/${filename}.ogg`,
        `assets/audio/eden_core/${filename}.mp3`);
      if (this._sfxBuffers[key]) {
        // File loaded — play at 0.72 gain (below music, above ambient SFX)
        this._playSfxBuffer(key, 3.5, 0.72);
        return;
      }
      // Buffer still loading this frame — fall through to synthesized glitch
    }

    // Synthesized glitch fallback: two descending pulses + bandpass noise burst.
    // Sounds like a digital stutter / cyber voice crackle — distinct from other SFX.
    this._tone({ type: 'square',    freqStart: 660, freqEnd: 220, dur: 0.14, gain: 0.09 });
    this._tone({ type: 'sawtooth',  freqStart: 440, freqEnd: 110, dur: 0.12, gain: 0.07, delay: 0.08 });
    this._noiseBurst({ dur: 0.18, gain: 0.06, filterType: 'bandpass', freq: 900 });
  }



  // ─── Element SFX (synthesized — no asset files required) ────────────────────

  // Lightning storm strike — sharp electric crack + low thunder rumble.
  // Distinct from the generic playEventWarning() alarm. Throttled 0.3 s per strike.
  playLightningStrike() {
    if (!this._canPlay('lightningStrike', 0.30)) return;
    // High crack: brief sawtooth pop
    this._tone({ type: 'sawtooth', freqStart: 2200, freqEnd: 400, dur: 0.07, gain: 0.11 });
    // Thunder roll: low sine rumble
    this._tone({ type: 'sine',     freqStart: 80,   freqEnd: 28,  dur: 0.45, gain: 0.13 });
    // Sizzle texture
    this._noiseBurst({ dur: 0.12, gain: 0.09, filterType: 'bandpass', freq: 1800 });
  }

  // Toxic gas cloud — hiss burst + low bubbling undertone. Throttled 0.8 s (clouds spawn in bursts).
  playToxicGas() {
    if (!this._canPlay('toxicGas', 0.80)) return;
    // Gas hiss: highpass noise
    this._noiseBurst({ dur: 0.22, gain: 0.08, filterType: 'highpass', freq: 900 });
    // Bubbling: low modulated sine
    this._tone({ type: 'sine', freqStart: 90, freqEnd: 65, dur: 0.28, gain: 0.07 });
  }

  // Ice / crystal / freeze — cold wind sweep + high shimmer. Used for Frozen Sleet onset + ice fields.
  playIceSweep() {
    if (!this._canPlay('iceSweep', 0.60)) return;
    // Cold wind: bandpass noise sweep
    this._noiseBurst({ dur: 0.35, gain: 0.09, filterType: 'bandpass', freq: 1400 });
    // High shimmer: descending triangle
    this._tone({ type: 'triangle', freqStart: 1800, freqEnd: 900, dur: 0.30, gain: 0.07 });
    // Low crack: short sine thud
    this._tone({ type: 'sine', freqStart: 140, freqEnd: 50, dur: 0.18, gain: 0.08, delay: 0.05 });
  }

  // ─── Phase 2 Weapon SFX ──────────────────────────────────────────────────

  // Void Beam — sharp high-pitched laser discharge. Throttled 0.08 s.
  playVoidBeamFire() {
    if (!this._canPlay('voidBeamFire', 0.08)) return;
    this._tone({ type: 'triangle', freqStart: 2400, freqEnd: 900, dur: 0.10, gain: 0.12 });
    this._noiseBurst({ dur: 0.08, gain: 0.06, filterType: 'highpass', freq: 2200 });
  }

  // Void Beam — crack on impact. Throttled 0.08 s.
  playVoidBeamHit() {
    if (!this._canPlay('voidBeamHit', 0.08)) return;
    this._tone({ type: 'sawtooth', freqStart: 1400, freqEnd: 300, dur: 0.07, gain: 0.10 });
    this._noiseBurst({ dur: 0.06, gain: 0.07, filterType: 'highpass', freq: 1800 });
  }

  // Void Beam — charge-up hum. Throttled 0.50 s.
  playVoidBeamCharge() {
    if (!this._canPlay('voidBeamCharge', 0.50)) return;
    this._tone({ type: 'sine', freqStart: 400, freqEnd: 1800, dur: 0.22, gain: 0.09 });
  }

  // Gravity Core — deep thud pulse on field activation. Throttled 0.30 s.
  playGravityCoreActivate() {
    if (!this._canPlay('gravityCoreActivate', 0.30)) return;
    this._tone({ type: 'sine', freqStart: 90, freqEnd: 30, dur: 0.35, gain: 0.16 });
    this._noiseBurst({ dur: 0.28, gain: 0.07, filterType: 'lowpass', freq: 160 });
    this._tone({ type: 'triangle', freqStart: 900, freqEnd: 300, dur: 0.20, gain: 0.06, delay: 0.04 });
  }

  // Gravity Core — enemy hit crunch inside field. Throttled 0.10 s.
  playGravityCoreHit() {
    if (!this._canPlay('gravityCoreHit', 0.10)) return;
    this._tone({ type: 'sawtooth', freqStart: 300, freqEnd: 80, dur: 0.10, gain: 0.10 });
    this._noiseBurst({ dur: 0.08, gain: 0.06, filterType: 'bandpass', freq: 220 });
  }

  // Gravity Core — outward pulse whoosh. Throttled 0.25 s.
  playGravityCorePulse() {
    if (!this._canPlay('gravityCorePulse', 0.25)) return;
    this._noiseBurst({ dur: 0.30, gain: 0.08, filterType: 'lowpass', freq: 400 });
  }

  // Nano Mine — dropped to ground soft click. Throttled 0.20 s.
  playNanoMineDrop() {
    if (!this._canPlay('nanoMineDrop', 0.20)) return;
    this._tone({ type: 'sine', freqStart: 280, freqEnd: 120, dur: 0.08, gain: 0.10 });
    this._noiseBurst({ dur: 0.05, gain: 0.05, filterType: 'highpass', freq: 1200 });
  }

  // Nano Mine — arming beep. Throttled 0.40 s.
  playNanoMineArmed() {
    if (!this._canPlay('nanoMineArmed', 0.40)) return;
    this._tone({ type: 'square', freqStart: 1600, freqEnd: 1600, dur: 0.06, gain: 0.08 });
  }

  // Nano Mine — proximity detonation. Throttled 0.12 s.
  playNanoMineExplode() {
    if (!this._canPlay('nanoMineExplode', 0.12)) return;
    this._tone({ type: 'sawtooth', freqStart: 220, freqEnd: 35, dur: 0.28, gain: 0.18 });
    this._noiseBurst({ dur: 0.22, gain: 0.12, filterType: 'highpass', freq: 600 });
    this._noiseBurst({ dur: 0.18, gain: 0.08, filterType: 'bandpass', freq: 280, delay: 0.04 });
  }

  // Blacknet Swarm Drone — micro-shot fired. Throttled 0.06 s.
  playBlacknetSwarmLaunch() {
    if (!this._canPlay('blacknetLaunch', 0.06)) return;
    this._tone({ type: 'triangle', freqStart: 1100, freqEnd: 500, dur: 0.07, gain: 0.08 });
  }

  // Blacknet Swarm Drone — micro-shot hits enemy. Throttled 0.06 s.
  playBlacknetSwarmHit() {
    if (!this._canPlay('blacknetHit', 0.06)) return;
    this._noiseBurst({ dur: 0.05, gain: 0.07, filterType: 'highpass', freq: 1600 });
  }

  // Blacknet Swarm Drone — idle swarm hum. Throttled 1.50 s.
  playBlacknetSwarmIdle() {
    if (!this._canPlay('blacknetIdle', 1.50)) return;
    this._tone({ type: 'square', freqStart: 80, freqEnd: 95, dur: 0.40, gain: 0.04 });
  }

  // Homing Missile — launch burst. Throttled 0.15 s.
  playHomingMissileFire() {
    if (!this._canPlay('homingFire', 0.15)) return;
    this._tone({ type: 'sawtooth', freqStart: 600, freqEnd: 180, dur: 0.18, gain: 0.13 });
    this._noiseBurst({ dur: 0.15, gain: 0.08, filterType: 'lowpass', freq: 500 });
  }

  // Homing Missile — target-lock chirp. Throttled 0.30 s.
  playHomingMissileLock() {
    if (!this._canPlay('homingLock', 0.30)) return;
    this._tone({ type: 'triangle', freqStart: 700, freqEnd: 1400, dur: 0.12, gain: 0.08 });
  }

  // Homing Missile — direct impact explosion. Throttled 0.12 s.
  playHomingMissileImpact() {
    if (!this._canPlay('homingImpact', 0.12)) return;
    this._tone({ type: 'sine', freqStart: 180, freqEnd: 32, dur: 0.32, gain: 0.18 });
    this._noiseBurst({ dur: 0.25, gain: 0.13, filterType: 'highpass', freq: 500 });
    this._noiseBurst({ dur: 0.20, gain: 0.07, filterType: 'bandpass', freq: 350, delay: 0.05 });
  }

  // ─── Game Feel SFX ──────────────────────────────────────────────────────────

  // Heavy enemy hit — deeper impact for significant damage (dmg >= 40).
  playHeavyHit() {
    if (!this._canPlay('heavyHit', 0.08)) return;
    this._tone({ type: 'sawtooth', freqStart: 180, freqEnd: 55, dur: 0.14, gain: 0.13 });
    this._noiseBurst({ dur: 0.10, gain: 0.09, filterType: 'lowpass', freq: 350 });
  }

  // Boss hit — low bass thump for boss impacts.
  playBossHit() {
    if (!this._canPlay('bossHit', 0.12)) return;
    this._tone({ type: 'sine', freqStart: 100, freqEnd: 35, dur: 0.30, gain: 0.16 });
    this._noiseBurst({ dur: 0.20, gain: 0.08, filterType: 'lowpass', freq: 180 });
  }

  // Combat juice multi-kill burst — layered ascending tones + bandpass noise.
  playJuiceBurst() {
    if (!this._canPlay('juiceBurst', 3.0)) return;
    this._tone({ type: 'sawtooth', freqStart: 220, freqEnd: 660, dur: 0.20, gain: 0.14 });
    this._tone({ type: 'sine', freqStart: 440, freqEnd: 1320, dur: 0.25, gain: 0.09, delay: 0.04 });
    this._noiseBurst({ dur: 0.18, gain: 0.10, filterType: 'bandpass', freq: 800 });
  }

}
