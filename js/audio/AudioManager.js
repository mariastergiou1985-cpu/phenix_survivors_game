// ─── Volume settings (persisted to localStorage) ──────────────────────────────
const VOL_KEYS = {
  master: 'phenix_master_volume',
  music:  'phenix_music_volume',
  sfx:    'phenix_sfx_volume',
  eden:   'phenix_eden_volume',     // EDEN CORE voice/transmission level (separate slider)
  muted:  'phenix_muted',
  radio:  'phenix_radio_enabled',   // PHENIX NULL RADIO on/off (menu broadcast opt-out)
};
const VOL_DEFAULTS = { master: 1.0, music: 0.70, sfx: 0.80, eden: 0.95, muted: false, radio: true };

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
    // Φ9 mixing: SFX bus runs through a gentle compressor so stacked one-shots
    // (weapon spam + events + ults) can never clip or drown the music.
    try {
      this.sfxComp = this.actx.createDynamicsCompressor();
      this.sfxComp.threshold.value = -16;
      this.sfxComp.knee.value = 18;
      this.sfxComp.ratio.value = 5;
      this.sfxComp.attack.value = 0.004;
      this.sfxComp.release.value = 0.18;
      this.sfxGain.connect(this.sfxComp);
      this.sfxComp.connect(this.masterGain);
    } catch (e) {
      this.sfxGain.connect(this.masterGain);   // ancient browser fallback
    }

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
    this._radioAudio    = null;   // PHENIX NULL RADIO — one lore broadcast per session (menu)
    this._radioPlayed   = false;
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
    this.edenVolume   = read(VOL_KEYS.eden,   VOL_DEFAULTS.eden);
    try {
      this.muted = localStorage.getItem(VOL_KEYS.muted) === 'true';
    } catch (_) { this.muted = VOL_DEFAULTS.muted; }
    try {
      // Default ON: only OFF when the player explicitly disabled the radio.
      this.radioEnabled = localStorage.getItem(VOL_KEYS.radio) !== 'false';
    } catch (_) { this.radioEnabled = VOL_DEFAULTS.radio; }
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

  // EDEN CORE voice level — read live by playEdenTransmission / _speakEden, so
  // changing it in Audio Settings applies immediately, in menu AND in-game.
  setEdenVolume(v) {
    this.edenVolume = clamp01(v);
    this._saveVolume(VOL_KEYS.eden, this.edenVolume);
  }

  // PHENIX NULL RADIO on/off — persisted opt-out so a player who doesn't want the
  // menu broadcast every session can silence it permanently.
  // Maria 2026-07-18: the settings button LOOKED dead — it only flipped the flag, and since
  // the broadcast is a once-per-session latch, turning it ON produced no sound (and OFF→ON
  // never re-armed the latch). Now: OFF cuts the broadcast instantly, ON re-arms the one-shot
  // and starts the broadcast right away — the button audibly works in both directions.
  setRadioEnabled(b) {
    this.radioEnabled = !!b;
    try { localStorage.setItem(VOL_KEYS.radio, this.radioEnabled ? 'true' : 'false'); } catch (_) {}
    if (!this.radioEnabled) this.stopMenuRadio();
    else { this._radioPlayed = false; this.playMenuRadio(); }
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
    // Mobile: play() is only honoured INSIDE the user gesture — so kick synchronously first
    // (this call chain runs inside the touchstart/mousedown handler). Waiting for the async
    // resume().then() to fire the first play() puts it outside the gesture and mobile blocks it.
    attempt(10);
    // Mobile AudioContexts boot 'suspended' and music routed through Web Audio stays silent
    // until resumed. Resume within the same gesture, then re-kick in case the sync attempt was
    // too early (context not yet running). Idempotent: attempt() no-ops if already playing.
    if (this.actx.state === 'suspended') {
      this.actx.resume().then(() => attempt(10)).catch(() => {});
    }
  }

  _stop(audio) {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  // Eddie GUITAR SOLO ALBUM — an ordered playlist. Song 1 plays, then the NEXT starts the instant
  // the previous ends (via onended), looping back to the top after the last one. The map music is
  // DUCKED to 25% for the whole album so the guitar is clearly in front. Routed direct to masterGain
  // (duck-proof, like the radio). Idempotent while already playing. ADD MORE SONGS IN ORDER BELOW.
  _EDDIE_ALBUM() {
    return [
      'assets/audio/music/eddie_riffs.mp3?v=20260707000000',            // 1
      'assets/audio/music/handshake_without_hands.mp3?v=20260707000000', // 2
      'assets/audio/music/echo_relation.mp3?v=20260707000000',          // 3
      'assets/audio/music/mirror_relation.mp3?v=20260707000000',        // 4
      'assets/audio/music/lattice_integrity.mp3?v=20260707000000',      // 5
      'assets/audio/music/consensus.mp3?v=20260707000000',              // 6
      'assets/audio/music/convergence_protocol.mp3?v=20260707000000',   // 7
      'assets/audio/music/home_synchronization.mp3?v=20260707000000',   // 8 (then loops to 1)
    ];
  }

  _playEddieAlbumTrack(i) {
    const a = this._eddieRiffsAudio;
    if (!a) return;
    const album = this._EDDIE_ALBUM();
    this._eddieAlbumIdx = ((i % album.length) + album.length) % album.length;
    try {
      a.src = album[this._eddieAlbumIdx];
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch (_) {}
  }

  playEddieRiffs() {
    if (this.muted) return;
    if (this._eddieRiffsPlaying) return;
    try {
      if (!this._eddieRiffsAudio) {
        const a = new Audio();
        a.loop = false; a.preload = 'auto';
        a.onerror = () => console.warn('[Audio] Eddie album track failed to load');
        const src = this.actx.createMediaElementSource(a);
        const g   = this.actx.createGain(); g.gain.value = 0.9;
        src.connect(g); g.connect(this.masterGain);   // direct to master — duck-proof, like the radio
        try { g.connect(this.analyser); } catch (_) {}
        // Auto-advance to the NEXT album track the moment one ends (loops at the end).
        a.onended = () => {
          if (!this._eddieRiffsPlaying) return;        // stopped → don't chain another song
          this._playEddieAlbumTrack((this._eddieAlbumIdx || 0) + 1);
        };
        this._eddieRiffsAudio = a;
      }
      if (this.actx.state === 'suspended') this.actx.resume().catch(() => {});
      // Duck the map music so the guitar album takes the foreground.
      this.musicGain.gain.setTargetAtTime((this.muted ? 0 : this.musicVolume) * 0.25, this.actx.currentTime, 0.4);
      this._eddieRiffsPlaying = true;
      this._playEddieAlbumTrack(this._eddieAlbumIdx || 0);   // start from the top (song 1)
    } catch (_) {}
  }

  // Stop the album (performance ended / death / menu) and restore the map-music level.
  stopEddieRiffs() {
    this._eddieRiffsPlaying = false;                  // set FIRST so onended never chains a new song
    const a = this._eddieRiffsAudio;
    if (a) { try { a.pause(); } catch (_) {} }
    this.musicGain.gain.setTargetAtTime(this.muted ? 0 : this.musicVolume, this.actx.currentTime, 0.6);
    this._eddieAlbumIdx = 0;                           // next performance starts the album from song 1
  }

  // Track length in seconds (0 until metadata has loaded).
  eddieRiffsDuration() {
    const d = this._eddieRiffsAudio && this._eddieRiffsAudio.duration;
    return (d && isFinite(d)) ? d : 0;
  }
  isEddieRiffsPlaying() { return !!this._eddieRiffsPlaying; }

  // ── OST JUKEBOX (Collectibles screen) — play a single chosen track on demand, ducking the menu
  // music underneath. Lazily wired; degrades safely. stopJukebox() restores the music level. ──
  playJukebox(url) {
    try {
      if (!this._jukeboxAudio) {
        const a = new Audio();
        a.loop = false; a.preload = 'auto';
        a.onerror = () => console.warn('[Audio] jukebox track failed to load');
        const src = this.actx.createMediaElementSource(a);
        const g   = this.actx.createGain(); g.gain.value = 0.9;
        src.connect(g); g.connect(this.masterGain);   // direct to master — duck-proof
        try { g.connect(this.analyser); } catch (_) {}
        a.onended = () => {
          this.musicGain.gain.setTargetAtTime(this.muted ? 0 : this.musicVolume, this.actx.currentTime, 0.5);
          this._jukeboxPlaying = false;
        };
        this._jukeboxAudio = a;
      }
      const a = this._jukeboxAudio;
      if (this.actx.state === 'suspended') this.actx.resume().catch(() => {});
      this.musicGain.gain.setTargetAtTime((this.muted ? 0 : this.musicVolume) * 0.15, this.actx.currentTime, 0.3);
      this._jukeboxPlaying = true;
      a.src = url + '?v=20260707000000';
      try { a.currentTime = 0; } catch (_) {}
      a.play().catch(() => {});
    } catch (_) {}
  }

  stopJukebox() {
    const a = this._jukeboxAudio;
    if (a) { try { a.pause(); } catch (_) {} }
    this.musicGain.gain.setTargetAtTime(this.muted ? 0 : this.musicVolume, this.actx.currentTime, 0.5);
    this._jukeboxPlaying = false;
  }

  // Each start method makes its track the single CURRENT track: stop the other two, then
  // record + play this one. _currentMusic gates _play's async retry so a stale track that
  // was just stopped can never re-start on top of the new one (the overlap bug).
  startMenuMusic() {
    this._stop(this._gameplayAudio);
    this._stop(this._endlessAudio);
    this._stop(this._chaosAudio);
    this.stopEddieRiffs();   // cut any lingering Eddie guitar solo when returning to the menu
    this._currentMusic = this._menuAudio;
    this.currentTrackTitle = 'Hope';
    this._play(this._menuAudio);
  }

  // ── PHENIX NULL RADIO — one-shot lore broadcast on the main menu ──────────
  // Plays assets/audio/phenix_null_eden_radio/ai_radio.mp3 once per session,
  // ducking the menu theme underneath and labeling NOW PLAYING while on air.
  playMenuRadio() {
    if (this._radioPlayed || this.muted || this.radioEnabled === false) return;
    this._radioPlayed = true;
    try {
      const audio = new Audio('assets/audio/phenix_null_eden_radio/ai_radio.mp3');
      audio.loop = false; audio.preload = 'auto';
      audio.onerror = () => console.warn('[Audio] radio broadcast failed to load');
      const src  = this.actx.createMediaElementSource(audio);
      const gain = this.actx.createGain(); gain.gain.value = 0.9;
      src.connect(gain);
      gain.connect(this.masterGain);   // direct to master — ducking music leaves the radio loud
      try { gain.connect(this.analyser); } catch (_) {}   // menu equalizer dances to the broadcast
      this._radioAudio = audio;
      this.musicGain.gain.setTargetAtTime((this.muted ? 0 : this.musicVolume) * 0.25, this.actx.currentTime, 0.4);
      this.currentTrackTitle = 'PHENIX NULL RADIO — ONLINE';
      const restore = () => {
        this.musicGain.gain.setTargetAtTime(this.muted ? 0 : this.musicVolume, this.actx.currentTime, 0.6);
        if (this._currentMusic === this._menuAudio) this.currentTrackTitle = 'Hope';
        this._radioAudio = null;
      };
      audio.onended = restore;
      this._radioRestore = restore;
      audio.play().catch(() => {});
    } catch (_) { /* degrade silently — menu theme keeps playing */ }
  }

  // Cut the broadcast when leaving the menu (run start etc.); restores music level.
  stopMenuRadio() {
    const a = this._radioAudio;
    if (!a) return;
    try { a.pause(); } catch (_) {}
    try { this._radioRestore?.(); } catch (_) {}
  }

  startGameplayMusic() {
    this.stopMenuRadio();
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
    this.stopMenuRadio();
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
    this.stopEddieRiffs();   // also cut the Eddie guitar solo track + restore ducked music (death / menu / etc.)
    this.stopJukebox();      // and any OST jukebox track
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) { try { window.speechSynthesis?.cancel(); } catch (_) {} }
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
  // Φ9 spam control: global polyphony budget — max N synth voices per sliding window.
  _voiceOk() {
    const now = performance.now();
    if (!this._voiceWin || now - this._voiceWin > 130) { this._voiceWin = now; this._voiceCount = 0; }
    if (this._voiceCount >= 16) return false;
    this._voiceCount++;
    return true;
  }

  _tone({ type = 'sine', freqStart, freqEnd, dur, gain = 0.15, delay = 0 }) {
    if (!this._voiceOk()) return;
    if (this.muted) return;
    const t0  = this.actx.currentTime + delay;
    const osc = this.actx.createOscillator();
    const g   = this.actx.createGain();
    osc.type  = type;
    // Phase 11 — anti-monotony: small random pitch jitter (±6%) so repeated SFX (shots, hits)
    // never sound like the exact same blip on a loop.
    const jit = 1 + (Math.random() * 2 - 1) * 0.06;
    freqStart *= jit;
    if (freqEnd) freqEnd *= jit;
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
  _noiseBurst({ dur = 0.12, gain = 0.12, filterType = 'highpass', freq = 800, delay = 0 }) {
    if (!this._voiceOk()) return;
    if (this.muted) return;
    const t0  = this.actx.currentTime + delay;
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
    if (!this._canPlay('shoot', 0.16)) return;                 // rarer AND quieter — the pew
    // Maria 2026-07-18: the pew was still far too loud/present overall — halved again
    // (0.065 → 0.028 → 0.016) and throttled 0.12 → 0.16s.
    this._tone({ type: 'triangle', freqStart: 440, freqEnd: 170, dur: 0.05, gain: 0.016 });
  }

  // 2. Enemy hit — small electric zap (saw + tiny noise tick).
  playHit() {
    if (!this._canPlay('hit', 0.07)) return;
    this._tone({ type: 'sawtooth', freqStart: 320, freqEnd: 140, dur: 0.06, gain: 0.07 });
    this._noiseBurst({ dur: 0.05, gain: 0.04, filterType: 'highpass', freq: 1600 });
  }

  // 3. Enemy death — glitch burst / digital crack.
  // playDeath() REMOVED (2026-07-18 audio audit): a synthesized death tone that nothing ever
  // called. It was superseded by playPlayerDeath() / playEnemyDeath(), which use the real
  // sfx files and ARE wired. Kept out to avoid two competing death sounds.

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
    if (!this._canPlay('enemyShoot', 0.15)) return;   // Phase 11: fewer bullet-spam blips
    // Maria 2026-07-18: the harsh square 'piou piou' dominated the mix in crowds — halved
    // (0.07 → 0.035, noise 0.03 → 0.02) and throttled 0.11 → 0.15s.
    this._tone({ type: 'square', freqStart: 520, freqEnd: 160, dur: 0.07, gain: 0.035 });
    this._noiseBurst({ dur: 0.03, gain: 0.02, filterType: 'highpass', freq: 1400 });
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
  playEdenTransmission(clipId = null, text = null) {
    if (this.muted) return;
    if ((this.edenVolume ?? 0.95) <= 0.001) return;   // EDEN CORE voice slider at 0 → silent
    if (!this._canPlay('edenTx', 3.5)) return;   // hard-limit: never more than once per 3.5 s

    // EDEN CORE actually SPEAKS its transmission: browser speech synthesis with a
    // deep robotic voice reads the exact on-screen text. The glitch chirp below
    // becomes a short intro; speech starts right after it.
    if (text) this._speakEden(text);

    const filename = clipId ? AudioManager._EDEN_CLIP_MAP[clipId] : null;
    if (filename) {
      const key = 'sfxEden_' + clipId;
      this._loadSfxFile(key,
        `assets/audio/eden_core/${filename}.ogg`,
        `assets/audio/eden_core/${filename}.mp3`);
      if (this._sfxBuffers[key]) {
        // File loaded — base 0.72 gain (below music, above ambient SFX), scaled by the EDEN slider.
        this._playSfxBuffer(key, 3.5, 0.72 * (this.edenVolume ?? 0.95));
        return;
      }
      // Buffer still loading this frame — fall through to synthesized glitch
    }

    // Synthesized "alive voice" fallback: 3-pulse vocoder-like chatter — square tones
    // stepping 520→380→300 Hz (0.09 s each, 0.06 s gaps) + the bandpass noise burst.
    // Louder + more present than the old 2-pulse stutter so EDEN reads as speaking.
    // Still throttled (3.5 s) and mute-gated above; file-clip playback path untouched.
    this._tone({ type: 'square', freqStart: 520, freqEnd: 470, dur: 0.09, gain: 0.14 });
    this._tone({ type: 'square', freqStart: 380, freqEnd: 345, dur: 0.09, gain: 0.14, delay: 0.15 });
    this._tone({ type: 'square', freqStart: 300, freqEnd: 272, dur: 0.09, gain: 0.14, delay: 0.30 });
    this._noiseBurst({ dur: 0.18, gain: 0.06, filterType: 'bandpass', freq: 900 });
  }

  // EDEN CORE voice — speech synthesis with a machine cadence. Cancels any prior
  // utterance (one voice, never overlapping). No-ops silently where unsupported.
  _speakEden(text) {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const msg = String(text).replace(/^EDEN CORE:\s*/i, '');
      synth.cancel();
      const u = new SpeechSynthesisUtterance(msg);
      // Maria 2026-07-18: speechSynthesis does NOT route through the Web Audio graph, so the
      // EDEN voice ignored MASTER VOLUME entirely — at master 0 everything else fell silent
      // but EDEN kept talking. Scale the utterance by master too; at master 0 it is now 0.
      u.rate = 0.80; u.pitch = 0.28;
      u.volume = clamp01((this.edenVolume ?? 0.95) * (this.muted ? 0 : (this.masterVolume ?? 1)));
      const voices = synth.getVoices();
      const pick = voices.find(v => /en[-_](US|GB)/i.test(v.lang) && /Google|Microsoft/i.test(v.name))
                || voices.find(v => /^en/i.test(v.lang));
      if (pick) u.voice = pick;
      // Delay past the glitch intro chirp (~0.45 s) so it reads as EDEN "opening the channel".
      // Unearthly underscore beneath the voice, sized to the speech duration:
      // beating detuned sub pair (52/55.5 Hz) reads as a second, inhuman voice
      // murmuring under the first; slow bandpass swells add cavernous breath.
      const specDur = Math.min(9, 1.2 + msg.length / 11);   // ≈ speech length at rate 0.8
      this._tone({ type: 'sine', freqStart: 52,   freqEnd: 40, dur: specDur, gain: 0.10, delay: 0.40 });
      this._tone({ type: 'sine', freqStart: 55.5, freqEnd: 43, dur: specDur, gain: 0.07, delay: 0.40 });
      for (let sw = 0; sw < Math.floor(specDur / 1.4); sw++) {
        this._noiseBurst({ dur: 0.9, gain: 0.035, filterType: 'bandpass', freq: 240 + sw * 60, delay: 0.6 + sw * 1.4 });
      }
      setTimeout(() => { try { if (!this.muted && (this.masterVolume ?? 1) > 0 && u.volume > 0) synth.speak(u); } catch (_) {} }, 450);
    } catch (_) { /* speech unavailable — glitch chirp already played */ }
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

  // STAGE COMPLETE fanfare — triumphant ascending arpeggio + shimmer, for a campaign
  // stage clear. `grand` (all stages done) adds an extra high sparkle layer.
  playStageComplete(grand = false) {
    // Rising major arpeggio: C–E–G–C(oct) then a held top note.
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      this._tone({ type: 'triangle', freqStart: f, freqEnd: f, dur: 0.22, gain: 0.16, delay: i * 0.11 });
      this._tone({ type: 'sine',     freqStart: f, freqEnd: f, dur: 0.22, gain: 0.09, delay: i * 0.11 });
    });
    this._tone({ type: 'triangle', freqStart: 1047, freqEnd: 1568, dur: 0.6, gain: 0.14, delay: 0.48 });
    this._noiseBurst({ dur: 0.5, gain: 0.05, filterType: 'highpass', freq: 4000, delay: 0.48 });
    if (grand) {
      this._tone({ type: 'sine', freqStart: 1568, freqEnd: 2093, dur: 0.7, gain: 0.10, delay: 0.7 });
      this._tone({ type: 'sine', freqStart: 2093, freqEnd: 2637, dur: 0.5, gain: 0.07, delay: 0.95 });
    }
  }

  // Combat juice multi-kill burst — layered ascending tones + bandpass noise.
  playJuiceBurst() {
    if (!this._canPlay('juiceBurst', 3.0)) return;
    this._tone({ type: 'sawtooth', freqStart: 220, freqEnd: 660, dur: 0.20, gain: 0.14 });
    this._tone({ type: 'sine', freqStart: 440, freqEnd: 1320, dur: 0.25, gain: 0.09, delay: 0.04 });
    this._noiseBurst({ dur: 0.18, gain: 0.10, filterType: 'bandpass', freq: 800 });
  }


  // ═══ SFX FORGE — procedural audio identity (no files) ═══════════════════════
  // Every source type gets a DISTINCT premium sound with per-trigger variation
  // (pitch/length jitter) so repeats never sound identical. All routed through the
  // sfx bus (volume/mute respected). Internally throttled per type — no spam.
  _forgeOk(type, minMs) {
    const now = performance.now();
    this._forgeLast = this._forgeLast || {};
    if (now - (this._forgeLast[type] || 0) < minMs) return false;
    this._forgeLast[type] = now;
    return true;
  }
  _v(base, jit) { return base * (1 + (Math.random() * 2 - 1) * jit); }   // variation helper

  // ── one-shots ──────────────────────────────────────────────────────────────
  forgeThunder() {
    if (this.muted || !this._forgeOk('thunder', 260)) return;
    // crack + long low rumble
    this._noiseBurst({ dur: this._v(0.10, 0.3), gain: 0.30, filterType: 'highpass', freq: 1800 });
    this._noiseBurst({ dur: this._v(0.9, 0.25), gain: 0.26, filterType: 'lowpass',  freq: this._v(220, 0.3), delay: 0.03 });
    this._tone({ type: 'sine', freqStart: this._v(70, 0.2), freqEnd: 38, dur: this._v(0.8, 0.2), gain: 0.12, delay: 0.02 });
  }
  forgeGunshot() {
    if (this.muted || !this._forgeOk('gun', 70)) return;
    this._noiseBurst({ dur: this._v(0.05, 0.3), gain: 0.10, filterType: 'bandpass', freq: this._v(1500, 0.25) });
    this._tone({ type: 'triangle', freqStart: this._v(240, 0.2), freqEnd: 90, dur: 0.05, gain: 0.06 });
  }
  forgeFire() {
    if (this.muted || !this._forgeOk('fire', 130)) return;
    // whoosh + crackle grains
    this._noiseBurst({ dur: this._v(0.28, 0.3), gain: 0.20, filterType: 'bandpass', freq: this._v(500, 0.3) });
    for (let i = 0; i < 3; i++) {
      this._noiseBurst({ dur: 0.02, gain: 0.05, filterType: 'highpass', freq: this._v(2600, 0.4), delay: 0.04 + i * this._v(0.05, 0.5) });
    }
  }
  forgeIce() {
    if (this.muted || !this._forgeOk('ice', 130)) return;
    // crystalline pings, detuned pair + glassy shimmer
    const f = this._v(1900, 0.25);
    this._tone({ type: 'sine',     freqStart: f,        freqEnd: f * 1.02, dur: this._v(0.16, 0.3), gain: 0.07 });
    this._tone({ type: 'triangle', freqStart: f * 1.5,  freqEnd: f * 1.48, dur: 0.10, gain: 0.045, delay: 0.02 });
    this._noiseBurst({ dur: 0.05, gain: 0.035, filterType: 'highpass', freq: 5200, delay: 0.01 });
  }
  forgeZap() {
    if (this.muted || !this._forgeOk('zap', 110)) return;
    this._tone({ type: 'sawtooth', freqStart: this._v(1400, 0.3), freqEnd: this._v(160, 0.3), dur: this._v(0.09, 0.3), gain: 0.16 });
    this._noiseBurst({ dur: 0.05, gain: 0.055, filterType: 'highpass', freq: 3200 });
  }
  forgeToxin() {
    if (this.muted || !this._forgeOk('toxin', 160)) return;
    // wet bubbling blips
    for (let i = 0; i < 2; i++) {
      const f = this._v(240, 0.35);
      this._tone({ type: 'sine', freqStart: f, freqEnd: f * 1.8, dur: 0.07, gain: 0.055, delay: i * this._v(0.06, 0.4) });
    }
  }
  forgeMagnet() {
    if (this.muted || !this._forgeOk('magnet', 160)) return;
    this._tone({ type: 'sine', freqStart: this._v(300, 0.2), freqEnd: this._v(90, 0.2), dur: 0.18, gain: 0.06 });
    this._tone({ type: 'sine', freqStart: this._v(150, 0.2), freqEnd: 60, dur: 0.22, gain: 0.05, delay: 0.02 });
  }
  forgeRadiation() {
    if (this.muted || !this._forgeOk('rad', 160)) return;
    // geiger ticks
    for (let i = 0; i < 4; i++) {
      this._noiseBurst({ dur: 0.012, gain: 0.05, filterType: 'highpass', freq: 4000, delay: i * this._v(0.035, 0.6) });
    }
  }

  // element id → its forge voice (single entry point for the game)
  forgeElement(el) {
    if (el === 'fire' || el === 'crimson_gate')        this.forgeFire();
    else if (el === 'electric' || el === 'thunder_maiden') this.forgeZap();
    else if (el === 'ice')                              this.forgeIce();
    else if (el === 'toxin' || el === 'gas')            this.forgeToxin();
    else if (el === 'magnetic')                         this.forgeMagnet();
    else if (el === 'radiation')                        this.forgeRadiation();
  }

  // ── Φ9 EXTRA VOICES ────────────────────────────────────────────────────────

  // ULT CAST sting — one distinct flavor per character, throttled hard (casts are rare).
  forgeUltCast(flavor) {
    if (this.muted || !this._forgeOk('ult', 900)) return;
    const F = {
      skeleton:   () => { this._tone({ type: 'sawtooth', freqStart: 90,  freqEnd: 30,  dur: 0.7, gain: 0.13 });
                          this._noiseBurst({ dur: 0.5, gain: 0.09, filterType: 'lowpass', freq: 300 }); },              // bone rumble
      taekwondo:  () => { for (let i = 0; i < 4; i++) this._tone({ type: 'triangle', freqStart: 500 + i * 180, freqEnd: 380 + i * 180, dur: 0.07, gain: 0.07, delay: i * 0.06 }); }, // dash flurry
      eddie:      () => { this._tone({ type: 'sawtooth', freqStart: 110, freqEnd: 110, dur: 0.5, gain: 0.10 });
                          this._tone({ type: 'sawtooth', freqStart: 165, freqEnd: 165, dur: 0.5, gain: 0.08, delay: 0.02 }); }, // power chord
      cyber_arm:  () => { this._tone({ type: 'sine', freqStart: 60, freqEnd: 1400, dur: 0.6, gain: 0.10 });
                          this._noiseBurst({ dur: 0.25, gain: 0.07, filterType: 'highpass', freq: 2400, delay: 0.35 }); }, // railgun charge
      brawler:    () => { this._noiseBurst({ dur: 0.6, gain: 0.12, filterType: 'lowpass', freq: 180 });
                          this._tone({ type: 'sine', freqStart: 55, freqEnd: 28, dur: 0.7, gain: 0.12, delay: 0.05 }); },  // magma quake
      assassin:   () => { this._tone({ type: 'sine', freqStart: 2600, freqEnd: 2400, dur: 0.14, gain: 0.06 });
                          this._noiseBurst({ dur: 0.08, gain: 0.05, filterType: 'highpass', freq: 4000, delay: 0.1 }); },  // blade whisper
      phasewalker:() => { this._tone({ type: 'sine', freqStart: 880, freqEnd: 55, dur: 0.8, gain: 0.09 });
                          this._tone({ type: 'sine', freqStart: 55, freqEnd: 880, dur: 0.5, gain: 0.06, delay: 0.25 }); }, // reality fold
      euclid:     () => { for (let i = 0; i < 3; i++) this._tone({ type: 'square', freqStart: 330 * (i + 1), freqEnd: 330 * (i + 1), dur: 0.1, gain: 0.05, delay: i * 0.09 }); },   // axiom steps
      oni:        () => { this._tone({ type: 'sawtooth', freqStart: 140, freqEnd: 60, dur: 0.55, gain: 0.11 });
                          this._noiseBurst({ dur: 0.4, gain: 0.08, filterType: 'bandpass', freq: 700, delay: 0.06 }); },   // demon breath
      dimi:       () => { for (let i = 0; i < 3; i++) this._tone({ type: 'sine', freqStart: [523, 659, 784][i], freqEnd: [523, 659, 784][i], dur: 0.4, gain: 0.06, delay: i * 0.05 }); }, // angelic triad
    };
    (F[flavor] || F.skeleton)();
  }

  // BOSS ROAR — deep formant growl for boss/mega-boss arrivals (announcement-driven).
  forgeBossRoar(mega = false) {
    if (this.muted || !this._forgeOk('roar', 2500)) return;
    const g = mega ? 0.16 : 0.12;
    this._tone({ type: 'sawtooth', freqStart: this._v(65, 0.15), freqEnd: 34, dur: mega ? 1.2 : 0.8, gain: g });
    this._tone({ type: 'square',   freqStart: this._v(48, 0.15), freqEnd: 26, dur: mega ? 1.3 : 0.9, gain: g * 0.7, delay: 0.05 });
    this._noiseBurst({ dur: mega ? 1.0 : 0.6, gain: 0.10, filterType: 'lowpass', freq: 260, delay: 0.02 });
    if (mega) this._noiseBurst({ dur: 0.5, gain: 0.06, filterType: 'bandpass', freq: 900, delay: 0.5 });
  }

  // EVOLUTION FORGE sting — anvil + shimmer when a new-gen evolution weapon fires its show.
  forgeEvolution() {
    if (this.muted || !this._forgeOk('evo', 1100)) return;
    this._noiseBurst({ dur: 0.06, gain: 0.10, filterType: 'highpass', freq: 1600 });      // anvil clink
    this._tone({ type: 'sine', freqStart: this._v(1200, 0.2), freqEnd: 2400, dur: 0.3, gain: 0.05, delay: 0.05 }); // shimmer up
    this._tone({ type: 'sine', freqStart: 90, freqEnd: 50, dur: 0.25, gain: 0.08, delay: 0.01 });                  // weight
  }

  // MILESTONE fanfare — Φ12 level rewards (5/10/25+).
  forgeMilestone() {
    if (this.muted || !this._forgeOk('mile', 1500)) return;
    const seq = [392, 523, 659, 784];
    for (let i = 0; i < seq.length; i++)
      this._tone({ type: 'triangle', freqStart: seq[i], freqEnd: seq[i], dur: 0.16, gain: 0.07, delay: i * 0.09 });
  }

  // ANNOUNCEMENT whoosh — quiet system-intrusion sweep under every full-screen banner.
  forgeAnnounce() {
    if (this.muted || !this._forgeOk('ann', 1400)) return;
    this._noiseBurst({ dur: 0.35, gain: 0.055, filterType: 'bandpass', freq: 1200 });
    this._tone({ type: 'sine', freqStart: 300, freqEnd: 900, dur: 0.3, gain: 0.035, delay: 0.02 });
  }

  forgeTurret() {                                            // Φ14 defence turret shot
    if (this.muted || !this._forgeOk('turret', 140)) return;
    this._tone({ type: 'square', freqStart: this._v(520, 0.2), freqEnd: 240, dur: 0.05, gain: 0.05 });
    this._noiseBurst({ dur: 0.03, gain: 0.04, filterType: 'highpass', freq: 2400 });
  }
  forgeDome() {                                              // Φ14 entering a defence dome
    if (this.muted || !this._forgeOk('dome', 900)) return;
    this._tone({ type: 'sine', freqStart: 180, freqEnd: 320, dur: 0.30, gain: 0.07 });
    this._tone({ type: 'sine', freqStart: 360, freqEnd: 480, dur: 0.22, gain: 0.045, delay: 0.06 });
  }

  // ── ambient weather loops (start/stop idempotent, gentle fade) ─────────────
  _forgeLoop(name, build) {
    this._forgeLoops = this._forgeLoops || {};
    if (this._forgeLoops[name]) return;                     // already running
    try { this._forgeLoops[name] = build(); } catch (_) { /* audio must never crash the game */ }
  }
  forgeLoopStop(name) {
    const L = this._forgeLoops && this._forgeLoops[name];
    if (!L) return;
    try {
      const t = this.actx.currentTime;
      L.gain.gain.cancelScheduledValues(t);
      L.gain.gain.setValueAtTime(L.gain.gain.value, t);
      L.gain.gain.linearRampToValueAtTime(0, t + 0.8);
      for (const n of L.nodes) { try { n.stop(t + 0.9); } catch (_) {} }
    } catch (_) {}
    delete this._forgeLoops[name];
  }
  _noiseLoopNode() {
    if (!this._forgeNoiseBuf) {
      const len = this.actx.sampleRate * 2;
      const buf = this.actx.createBuffer(1, len, this.actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._forgeNoiseBuf = buf;
    }
    const src = this.actx.createBufferSource();
    src.buffer = this._forgeNoiseBuf; src.loop = true;
    return src;
  }
  forgeRainStart() {                                        // steady rain hiss + patter LFO
    if (this.muted) return;
    this._forgeLoop('rain', () => {
      const src = this._noiseLoopNode();
      const bp = this.actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.6;
      const g = this.actx.createGain(); g.gain.value = 0.000;
      const lfo = this.actx.createOscillator(); lfo.frequency.value = 0.5;
      const lg = this.actx.createGain(); lg.gain.value = 0.015;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(bp); bp.connect(g); g.connect(this.sfxGain);
      const t = this.actx.currentTime;
      g.gain.linearRampToValueAtTime(0.19, t + 1.2);   // Maria: rain was inaudible
      src.start(); lfo.start();
      return { gain: g, nodes: [src, lfo] };
    });
  }
  forgeWindStart() {                                        // icy wind howl
    if (this.muted) return;
    this._forgeLoop('wind', () => {
      const src = this._noiseLoopNode();
      const bp = this.actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 2.2;
      const g = this.actx.createGain(); g.gain.value = 0.000;
      const lfo = this.actx.createOscillator(); lfo.frequency.value = 0.18;
      const lg = this.actx.createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(bp.frequency);            // sweeping howl
      src.connect(bp); bp.connect(g); g.connect(this.sfxGain);
      const t = this.actx.currentTime;
      g.gain.linearRampToValueAtTime(0.154, t + 1.5);
      src.start(); lfo.start();
      return { gain: g, nodes: [src, lfo] };
    });
  }
  forgeRumbleStart() {                                      // volcanic ground rumble
    if (this.muted) return;
    this._forgeLoop('rumble', () => {
      const src = this._noiseLoopNode();
      const lp = this.actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 130;
      const g = this.actx.createGain(); g.gain.value = 0.000;
      const lfo = this.actx.createOscillator(); lfo.frequency.value = 0.9;
      const lg = this.actx.createGain(); lg.gain.value = 0.02;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(lp); lp.connect(g); g.connect(this.sfxGain);
      const t = this.actx.currentTime;
      g.gain.linearRampToValueAtTime(0.220, t + 1.2);
      src.start(); lfo.start();
      return { gain: g, nodes: [src, lfo] };
    });
  }

}
