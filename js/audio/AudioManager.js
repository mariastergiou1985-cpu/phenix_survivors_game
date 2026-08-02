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

    // MASTER LIMITER (Maria 2026-08-01). Once the master repair restored a real 1.0,
    // a measured capture peaked at -0.22 dBFS - music and stacked SFX summing right up
    // against the ceiling. The SFX compressor below only guards the SFX bus; music went
    // straight to the output, so nothing held the SUM. This is a brick wall just under
    // 0 dBFS: a high ratio with a near-zero knee, so it is inaudible until the mix would
    // otherwise clip and then stops it dead. It changes no slider and no per-clip gain -
    // it only removes the last dB of headroom risk.
    try {
      this.masterLimiter = this.actx.createDynamicsCompressor();
      this.masterLimiter.threshold.value = -6;     // engage well before the ceiling
      this.masterLimiter.knee.value = 0;           // hard - a limiter, not a colour
      this.masterLimiter.ratio.value = 20;         // brick wall
      this.masterLimiter.attack.value = 0.001;     // catch event-sting transients
      this.masterLimiter.release.value = 0.20;
      // WebAudio's DynamicsCompressor is NOT a true brick wall - it overshoots on fast
      // transients (measured +0.99 dBFS with the limiter alone). A fixed output trim after
      // it guarantees the ceiling in a way the compressor curve cannot, at the cost of
      // ~2 dB that the restored master more than covers.
      this.masterTrim = this.actx.createGain();
      this.masterTrim.gain.value = 0.80;           // -1.94 dB safety ceiling
      this.masterGain.connect(this.masterLimiter);
      this.masterLimiter.connect(this.masterTrim);
      this.masterTrim.connect(this.actx.destination);
    } catch (e) {
      this.masterGain.connect(this.actx.destination);   // ancient browser fallback
    }

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
    // ── EDDIE ULTIMATE PLAYLIST — run-scoped state (owner-approved naming) ──────
    // ONE ordered playlist per run: the FIRST Eddie ultimate starts track 1; every later
    // track starts AUTOMATICALLY on the previous track's 'ended' event. Later ultimates
    // NEVER touch the audio. After track 8 the playlist is COMPLETED for the whole run.
    this.playlistActive       = false;  // a playlist is running right now (paused counts as running)
    this.playlistCompleted    = false;  // all 8 tracks already played THIS run → no second cycle
    this.currentTrackIndex    = -1;     // 0..7 while active, -1 when idle
    this.currentAudioInstance = null;   // the ONE <audio> element the playlist may ever use
    this.playlistOwner        = null;   // 'eddie' while owned, null when idle
    this.playlistRunId        = 0;      // run ownership — bumped by resetEddieRiffs()
    this._playlistGen         = 0;      // per-track generation — kills stale 'ended'/retry callbacks
    this._eddieRiffsAudio = null;       // legacy alias of currentAudioInstance (kept for compat)
    this._eddieRiffsPlaying = false;    // legacy flag read by isEddieRiffsPlaying() + ducking
    this._eddiePlaybackMode = null;
    this._eddieAlbumIdx = 0;
    this._eddieUltimateNextIdx = 0;
    this._eddieLastTrackId = null;
    this._eddiePlayState = null;
    this._eddieRiffsGain = null;
    this._eddiePlayToken = 0;

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

    this._repairInaudibleVolumes();
  }

  /**
   * AUDIBILITY REPAIR (Maria 2026-08-01).
   *
   * A stored master of 0.0172 (1.7%) made the ENTIRE game inaudible - measured
   * -47.2 LUFS integrated / -35.4 dBFS true peak in a real gameplay capture - while
   * the SFX slider still read 88%. The mix looked correct on screen and nothing could
   * be heard, so the fault read as "the new Wave 1/2 SFX don't work" when in fact
   * every clip played correctly into a master that was practically closed.
   *
   * How it got there: the settings panel sets a slider from the raw cursor position
   * anywhere in its band, so one stray drag across the panel writes a near-zero value
   * and persists it. The stored numbers carried 17 decimals - a drag, never a typed
   * choice.
   *
   * A master this low is never deliberate: mute (M) exists for real silence, and below
   * ~5% the game is not quiet, it is off. So we repair it once on load - but ONLY when
   * the player is not muted, so an intentional mute is never overridden, and only for
   * the two buses whose loss is unexplainable. musicVolume is deliberately NOT
   * repaired: turning the music down or fully off while keeping SFX is a normal way to
   * play.
   *
   * This is a repair, not a reset: every other setting the player chose is kept.
   */
  _repairInaudibleVolumes() {
    // Below these the bus is not "quiet", it is effectively silent.
    const MIN_AUDIBLE_MASTER = 0.05;   // -26 dB - nothing survives this
    const MIN_AUDIBLE_SFX    = 0.02;   // -34 dB - SFX cannot be heard under music
    this._volumeRepairs = [];

    if (this.muted) return;            // a real mute is the player's choice - leave it alone

    if (!(this.masterVolume >= MIN_AUDIBLE_MASTER)) {   // also catches NaN/undefined
      this._volumeRepairs.push({ bus: 'master', from: this.masterVolume, to: VOL_DEFAULTS.master });
      this.masterVolume = VOL_DEFAULTS.master;
      this._saveVolume(VOL_KEYS.master, this.masterVolume);
    }
    if (!(this.sfxVolume >= MIN_AUDIBLE_SFX)) {
      this._volumeRepairs.push({ bus: 'sfx', from: this.sfxVolume, to: VOL_DEFAULTS.sfx });
      this.sfxVolume = VOL_DEFAULTS.sfx;
      this._saveVolume(VOL_KEYS.sfx, this.sfxVolume);
    }
  }

  _saveVolume(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (_) {}
  }

  setMasterVolume(v) {
    // Snap a near-zero drag to a true 0. Parking at 1.7% looks like an active slider but
    // is silence - that ambiguity is exactly what hid the -47 LUFS bug. At a real 0 the
    // panel reads 0% and the cause of the silence is visible.
    this.masterVolume = clamp01(v) < 0.02 ? 0 : clamp01(v);
    if (!this.muted) this.masterGain.gain.value = this.masterVolume;
    this._saveVolume(VOL_KEYS.master, this.masterVolume);
  }

  setMusicVolume(v) {
    this.musicVolume = clamp01(v);
    // Respect BOTH mute and the Eddie-playlist duck, so moving the music slider mid-playlist
    // can never un-duck the mode BGM underneath a running playlist (or un-mute it).
    const base = this.muted ? 0 : this.musicVolume;
    this.musicGain.gain.value = base * (this.playlistActive ? 0.25 : 1);
    if (this._eddieRiffsGain) this._eddieRiffsGain.gain.value = 0.9 * this.musicVolume;
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

  // ══ EDDIE ULTIMATE PLAYLIST ═════════════════════════════════════════════════
  // The 8 approved tracks are ONE ordered playlist, scoped to a single run.
  //   • The FIRST Eddie ultimate of a run starts the playlist at TRACK 1.
  //   • Track N+1 starts AUTOMATICALLY when track N fires its 'ended' event — no
  //     further ultimate is ever needed to advance the music.
  //   • EVERY subsequent ultimate is a hard no-op for audio: no track change, no
  //     restart, no skip, no index increment, no second audio instance.
  //   • After track 8 the playlist COMPLETES: mode BGM un-ducks and no second cycle
  //     can start until a full reset (death / menu / restart / character switch / new run).
  // The map music is DUCKED to 25% for the whole playlist; the playlist itself is routed
  // direct to masterGain (duck-proof, like the radio).
  // DO NOT remove, replace, rename or reorder the 8 entries below.
  _EDDIE_ALBUM() {
    return [
      'assets/audio/music/eddie_riffs.mp3?v=20260707000000',            // 1
      'assets/audio/music/handshake_without_hands.mp3?v=20260707000000', // 2
      'assets/audio/music/echo_relation.mp3?v=20260707000000',          // 3
      'assets/audio/music/mirror_relation.mp3?v=20260707000000',        // 4
      'assets/audio/music/lattice_integrity.mp3?v=20260707000000',      // 5
      'assets/audio/music/consensus.mp3?v=20260707000000',              // 6
      'assets/audio/music/convergence_protocol.mp3?v=20260707000000',   // 7
      'assets/audio/music/home_synchronization.mp3?v=20260707000000',   // 8 (LAST — playlist ends here)
    ];
  }

  eddiePlaylistLength() { return this._EDDIE_ALBUM().length; }

  // Duck the mode BGM under the playlist.
  _duckModeMusicForPlaylist() {
    try {
      this.musicGain.gain.cancelScheduledValues?.(this.actx.currentTime);
      this.musicGain.gain.setTargetAtTime((this.muted ? 0 : this.musicVolume) * 0.25, this.actx.currentTime, 0.08);
    } catch (_) {}
  }

  // Restore the mode BGM to full level + re-label NOW PLAYING. Deliberately a NO-OP while
  // the playlist is active, so a mid-run mode switch (Chaos at 21:00), the radio restore
  // and the jukebox can never un-duck the music underneath a running playlist.
  _restoreModeMusic() {
    if (this.playlistActive) return;
    try {
      this.musicGain.gain.cancelScheduledValues?.(this.actx.currentTime);
      this.musicGain.gain.setTargetAtTime(this.muted ? 0 : this.musicVolume, this.actx.currentTime, 0.6);
    } catch (_) {}
    if      (this._currentMusic === this._gameplayAudio) this.currentTrackTitle = 'NULL EDEN OST';
    else if (this._currentMusic === this._endlessAudio)  this.currentTrackTitle = 'NYX';
    else if (this._currentMusic === this._chaosAudio)    this.currentTrackTitle = 'Golden Override Protocol';
    else if (this._currentMusic === this._menuAudio)     this.currentTrackTitle = 'Hope';
  }

  // Start ONE playlist track by index. Never called from outside — the only entry points are
  // playEddieUltimateTrack() (index 0) and _onEddiePlaylistTrackEnded() (index+1).
  _playPlaylistTrack(index) {
    const album = this._EDDIE_ALBUM();
    // Clamped, NEVER modulo — the playlist must not wrap around into a second cycle.
    const i = Math.max(0, Math.min(album.length - 1, index | 0));
    const a = this.currentAudioInstance;
    if (!a) return null;
    const url     = album[i];
    const trackId = url.split('/').pop().split('?')[0].replace(/\.[a-z0-9]+$/i, '');
    this.currentTrackIndex     = i;
    this._eddieAlbumIdx        = i;   // legacy mirrors (no longer drive selection)
    this._eddieUltimateNextIdx = i;
    this._eddieLastTrackId     = trackId;
    // A new generation supersedes every earlier track, retry timer and pending 'ended'.
    const gen = ++this._playlistGen;
    this._eddiePlayToken = gen;       // legacy mirror
    a.__eddieGen   = gen;
    a.__eddieRunId = this.playlistRunId;
    const state = this._eddiePlayState = {
      mode: 'ultimate', index: i, trackNumber: i + 1, trackId, url,
      gen, runId: this.playlistRunId, result: 'pending',
    };
    const attempt = (remaining) => {
      if (!this.playlistActive || gen !== this._playlistGen) return;   // superseded → die quietly
      let playResult;
      try { playResult = a.play(); }
      catch (_) {
        if (remaining > 0) setTimeout(() => attempt(remaining - 1), 250);
        else if (this._eddiePlayState === state) state.result = 'error';
        return;
      }
      if (!playResult || typeof playResult.then !== 'function') {
        if (this._eddiePlayState === state) state.result = 'playing';
        return;
      }
      playResult.then(() => {
        if (this._eddiePlayState === state) state.result = 'playing';
      }).catch(() => {
        if (remaining > 0) setTimeout(() => attempt(remaining - 1), 250);
        else if (this._eddiePlayState === state) state.result = 'blocked';
      });
    };
    try {
      a.src = url;
      try { a.currentTime = 0; } catch (_) {}
      this.currentTrackTitle = `EDDIE // ${trackId.replace(/_/g, ' ').toUpperCase()}`;
      attempt(10);
    } catch (_) { state.result = 'error'; }
    return state;
  }

  // The SINGLE place the playlist advances. Wired once, to the one audio instance.
  // Every stale-callback path is rejected before anything moves.
  _onEddiePlaylistTrackEnded(instance) {
    if (!this.playlistActive) return;                            // stopped/reset → stale
    if (!instance || instance !== this.currentAudioInstance) return;  // not the live instance
    if (instance.__eddieGen   !== this._playlistGen) return;      // superseded track → stale
    if (instance.__eddieRunId !== this.playlistRunId) return;     // PREVIOUS RUN's callback → stale
    const last = this._EDDIE_ALBUM().length - 1;                 // 7
    if (this.currentTrackIndex < last) {
      this._playPlaylistTrack(this.currentTrackIndex + 1);        // 1→2→3→…→8, automatically
      return;
    }
    // ── Track 8 finished → the playlist is DONE for this whole run ──────────────
    this.playlistActive     = false;
    this.playlistCompleted  = true;
    this.playlistOwner      = null;
    this.currentTrackIndex  = -1;
    this._eddieRiffsPlaying = false;
    this._eddiePlaybackMode = null;
    this._eddiePlayState    = null;
    this._playlistGen++;                                          // invalidate in-flight retries
    this._eddiePlayToken = this._playlistGen;
    try { instance.pause(); instance.currentTime = 0; } catch (_) {}
    this._restoreModeMusic();                                     // mode BGM back to full level
  }

  // Lazily build THE ONE audio instance. Called only from playEddieUltimateTrack(), so a
  // second element can never exist: everything after the first call reuses this instance.
  _ensureEddieRiffsAudio() {
    if (this.currentAudioInstance) return this.currentAudioInstance;
    try {
      const a = new Audio();
      a.loop = false; a.preload = 'auto';
      a.onerror = () => console.warn('[Audio] Eddie playlist track failed to load');
      const src = this.actx.createMediaElementSource(a);
      const g   = this.actx.createGain(); g.gain.value = 0.9 * this.musicVolume;
      src.connect(g); g.connect(this.masterGain);
      try { g.connect(this.analyser); } catch (_) {}
      a.onended = () => this._onEddiePlaylistTrackEnded(a);
      this.currentAudioInstance = a;
      this._eddieRiffsAudio     = a;   // legacy alias
      this._eddieRiffsGain      = g;
      return a;
    } catch (_) { return null; }
  }

  // Legacy entry point (Eddie GUITAR SOLO "album"). No call sites remain in the game; kept
  // as a STRICT alias so it can never open a second, competing audio path.
  playEddieRiffs() { return this.playEddieUltimateTrack(); }

  // ── THE ONLY PUBLIC START ──────────────────────────────────────────────────
  // First Eddie ultimate of a run → start at track 1. Every later ultimate → hard no-op.
  // Returns a truthy play-state while the playlist owns the audio (the Game latch reads it).
  playEddieUltimateTrack() {
    if (this.playlistActive)    return this._eddiePlayState;   // GUARD: already running → no-op
    if (this.playlistCompleted) return null;                   // GUARD: all 8 played this run → no-op
    if (this.muted)             return null;
    try {
      const a = this._ensureEddieRiffsAudio();
      if (!a) return null;
      if (this.actx.state === 'suspended') this.actx.resume().catch(() => {});
      this.playlistActive     = true;
      this.playlistOwner      = 'eddie';
      this._eddieRiffsPlaying = true;        // legacy flag (ducking + isEddieRiffsPlaying)
      this._eddiePlaybackMode = 'ultimate';
      this._duckModeMusicForPlaylist();
      return this._playPlaylistTrack(0);     // TRACK 1
    } catch (_) {
      this.playlistActive = false; this._eddieRiffsPlaying = false; this.playlistOwner = null;
      return null;
    }
  }

  // Stop the playlist and restore the map-music level.
  //   resetRotation:false → run-end stop (keeps playlistCompleted as-is)
  //   resetRotation:true  → FULL reset: new run owns the playlist, track 1 is armed again
  stopEddieRiffs({ resetRotation = false } = {}) {
    const a = this.currentAudioInstance;
    this.playlistActive     = false;   // set FIRST so 'ended'/retries can never chain a new track
    this._eddieRiffsPlaying = false;
    this._playlistGen++;
    this._eddiePlayToken    = this._playlistGen;
    this._eddiePlaybackMode = null;
    this._eddiePlayState    = null;
    this.currentTrackIndex  = -1;
    this._eddieAlbumIdx     = 0;
    if (a) { try { a.pause(); a.currentTime = 0; } catch (_) {} }
    if (resetRotation) {
      this.playlistCompleted     = false;
      this.playlistOwner         = null;
      this.playlistRunId++;            // run ownership: old 'ended' callbacks are now stale
      this._eddieUltimateNextIdx = 0;
      this._eddieLastTrackId     = null;
    }
    this._restoreModeMusic();
  }

  // FULL reset — death / return to menu / restart / character switch / second run.
  resetEddieRiffs()   { this.stopEddieRiffs({ resetRotation: true }); }
  resetEddiePlaylist(){ this.resetEddieRiffs(); }              // owner-facing alias
  stopEddieUltimateTrack() { this.stopEddieRiffs(); }

  // ── PAUSE / RESUME / FOCUS ─────────────────────────────────────────────────
  // Neither of these ever starts, restarts, skips or advances the playlist. They only
  // pause/un-pause the track already loaded in the single instance, so the playlist index
  // is untouched and 'ended' cannot fire while paused.
  pauseEddieUltimateTrack() {
    if (!this.playlistActive) return false;
    const a = this.currentAudioInstance;
    if (a && !a.paused) { try { a.pause(); } catch (_) {} return true; }
    return false;
  }
  resumeEddieUltimateTrack() {
    if (!this.playlistActive) return null;                     // completed/stopped → never restarts
    const a = this.currentAudioInstance;
    if (!a) return null;
    if (this.actx.state === 'suspended') this.actx.resume().catch(() => {});
    if (a.paused) { try { const r = a.play(); r?.catch?.(() => {}); } catch (_) {} }
    this._duckModeMusicForPlaylist();                          // re-assert the duck after a mode switch
    return this._eddiePlayState;
  }
  // Called every frame by Game — keeps the playlist in lockstep with the game's pause state.
  setEddiePlaylistPaused(shouldPause) {
    if (shouldPause) return this.pauseEddieUltimateTrack();
    return this.resumeEddieUltimateTrack();
  }

  // Track length in seconds (0 until metadata has loaded).
  eddieRiffsDuration() {
    const d = this.currentAudioInstance && this.currentAudioInstance.duration;
    return (d && isFinite(d)) ? d : 0;
  }
  isEddieRiffsPlaying()    { return !!this.playlistActive; }
  isEddiePlaylistActive()  { return !!this.playlistActive; }
  isEddiePlaylistDone()    { return !!this.playlistCompleted; }
  eddiePlaylistTrackNumber() { return this.playlistActive ? this.currentTrackIndex + 1 : 0; }

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
          this._restoreModeMusic();   // NO-OP while an Eddie playlist is ducking the BGM
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
    this._restoreModeMusic();   // NO-OP while an Eddie playlist is ducking the BGM
    this._jukeboxPlaying = false;
  }

  // Each start method makes its track the single CURRENT track: stop the other two, then
  // record + play this one. _currentMusic gates _play's async retry so a stale track that
  // was just stopped can never re-start on top of the new one (the overlap bug).
  startMenuMusic() {
    this._stop(this._gameplayAudio);
    this._stop(this._endlessAudio);
    this._stop(this._chaosAudio);
    this.resetEddieRiffs();  // cut any lingering Eddie track and reset the next-run rotation
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
        this._restoreModeMusic();   // NO-OP while an Eddie playlist is ducking the BGM
        // (NOW PLAYING is relabelled inside _restoreModeMusic — never while a playlist runs)
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
    this.resetEddieRiffs();  // run end (death/victory) — FULL playlist reset, track 1 armed again
    this.stopJukebox();      // and any OST jukebox track
    // Procedural weather loops are NOT music tracks, so nothing above touched them and they
    // survived death and victory as a permanent drone. They are the only looping voices in the
    // engine; stopping them here makes stopAll() mean what its name says.
    for (const _name of Object.keys(this._forgeLoops || {})) this.forgeLoopStop(_name);
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


  // ── MIX HIERARCHY (Maria 2026-08-01) ──────────────────────────────────────
  // A capture at -21.3 LUFS was dominated by a continuous tonal "pew". The cause was NOT
  // playShoot - that is already the quietest cue in the game (gain 0.016, throttled 0.16s,
  // halved twice on 2026-07-18). It was the repeated WEAPON FIRE cues carrying a high gain
  // and NO throttle at all:
  //
  //     playRailSpikeFire     0.20   no throttle   (+22 dB over playShoot)
  //     playPlasmaBladeSwing  0.16   no throttle
  //     forgeZap              0.16   no throttle
  //     playVoidNeedleFire    0.13   no throttle
  //     playSentryDroneFire   0.12   no throttle
  //
  // In Endless with several weapons these fire every time the weapon does, so dozens of
  // identical short tones overlap into one continuous pitch that masks everything else.
  //
  // The fix is per-cue, never a global bus move, and it is applied by WRAPPING the cue
  // methods rather than editing their bodies - so a future edit to any cue cannot silently
  // escape the policy, and no method body can end up referencing a variable it never got.
  //
  // Intended order, loudest first:
  //   ultimate/cinematic > boss > event > enemy tell > signature weapon > common fire > pew
  static MIX = {
    // perCue: retrigger floors for the two cues that used to carry their OWN, stricter
    // in-body _canPlay() guard. That guard ran AFTER this gate, so a call the body then
    // silently dropped had already spent a cap slot for 260 ms and moved the retrigger
    // stamp. Declaring the floor here makes the wrapper the single authority for all
    // three properties at once: -6.02 dB, retrigger floor, voice cap.
    fire: {
      mul: 0.50, minGap: 0.09, cap: 3,           // x0.50 = -6.02 dB
      perCue: { playVoidNeedleFire: 0.09, playSentryDroneFire: 0.12 },
    },
    // ── MIX.impact (Maria 2026-08-02 hotfix) ────────────────────────────────
    // _fireGate only ever covered FIRE_CUES. The repeated HIT/IMPACT family had no gate of
    // any kind. Instrumented Endless run, 151 s, 4-weapon loadout — voices per second and
    // acoustic profile of the ones that measured loudest against the described symptom
    // (clean, mid-band, short, high repetition):
    //   playXpPickup        5.25 v/s  purity 1.00  triangle 620-1040 Hz  0.045 s  NO noise
    //   playSentryDroneHit  4.28 v/s  purity 0.78  sine 420->120 AND 500->200 (near-duplicates)
    //   playVoidNeedleHit   2.89 v/s  purity 0.86  saw 320->90 + square 700->200
    //   playPlasmaBladeHit  1.39 v/s  purity 0.86  gain 0.18
    //   playRailSpikeImpact 1.20 v/s  purity 0.85  gain 0.20 (loudest single voice)
    // Deliberately scoped to these five plus the XP ladder: every other impact cue measured
    // below 0.12 voices/s and is left exactly as it was.
    impact: {
      mul: 0.50, minGap: 0.12, cap: 2,           // x0.50 = -6.02 dB, tighter cap than fire
      perCue: {
        playSentryDroneHit: 0.22, playVoidNeedleHit: 0.18, playPlasmaBladeHit: 0.16,
        playRailSpikeImpact: 0.18, playXpPickup: 0.09,
      },
    },
    // ── MIX.fileRepeat (Maria 2026-08-02 hotfix) ────────────────────────────
    // THE dominant repeated cue in Endless is not procedural, which is why every previous
    // pass — all of which audited oscillators — walked straight past it. playEnemyDeath is a
    // FILE buffer at vol 0.85 (5-25x the amplitude of any synthesized tone) on an 80 ms
    // floor, i.e. up to 12.5 a second; measured 13.6 calls/s. _playSfxBuffer() also bypassed
    // _voiceOk() entirely, so file cues obeyed NO polyphony budget at all.
    //
    // Measured on recorded system audio of a 150 s Endless run, silencing this ONE cue and
    // changing nothing else:  power 150-700 Hz -80.9% · total power -59.9% · RMS -36.8%.
    fileRepeat: {
      vol: 0.50, minGap: 0.14, cap: 3,           // x0.50 amplitude = -6.02 dB
    },
    bossBoost:  2.00,        // +6.02 dB
    eventBoost: 2.00,        // +6.02 dB
    tellBoost:  1.50,        // +3.52 dB
    // Music ducking: only for cues that carry information the player must not miss.
    duck: {
      boss:     { amount: 0.60, hold: 1.6 },   // -4.4 dB
      event:    { amount: 0.65, hold: 1.4 },   // -3.7 dB
      ultimate: { amount: 0.58, hold: 1.8 },   // -4.7 dB
    },
  };
  static FIRE_CUES = [
    'playShoot', 'playEnemyShoot', 'playRailSpikeFire', 'playVoidNeedleFire',
    'playVoidBeamFire', 'playSentryDroneFire', 'playPlasmaBladeSwing',
    'forgeZap', 'forgeGunshot', 'playDroneElectro', 'playDroneFlame',
    'playHomingMissileFire', 'playBlacknetSwarmLaunch',
  ];
  // The five measured HIT/IMPACT offenders plus the XP ladder — see MIX.impact above.
  static IMPACT_CUES = [
    'playXpPickup', 'playSentryDroneHit', 'playVoidNeedleHit',
    'playPlasmaBladeHit', 'playRailSpikeImpact',
  ];

  /**
   * Retrigger floor + hard voice cap for one repeated fire cue.
   * Returns the gain multiplier, or 0 when the cue must be dropped this frame.
   */
  _mixGate(cueName, cls = 'fire') {
    const M = AudioManager.MIX[cls];
    if (!M) return 1;
    if (!this._fireActive) this._fireActive = Object.create(null);
    if (!this._fireLast)   this._fireLast   = Object.create(null);
    const now = this.actx ? this.actx.currentTime : 0;
    const minGap = (M.perCue && M.perCue[cueName]) || M.minGap;
    if (now - (this._fireLast[cueName] ?? -1e9) < minGap) return 0;
    if ((this._fireActive[cueName] || 0) >= M.cap) return 0;
    this._fireLast[cueName] = now;
    this._fireActive[cueName] = (this._fireActive[cueName] || 0) + 1;
    setTimeout(() => { this._fireActive[cueName] = Math.max(0, (this._fireActive[cueName] || 1) - 1); }, 260);
    return M.mul;
  }

  /** Back-compat alias — the 'fire' class of _mixGate(). */
  _fireGate(cueName) { return this._mixGate(cueName, 'fire'); }

  /**
   * Wrap each fire cue once, on the prototype. _tone/_noiseBurst read this._fireMul, so a
   * cue that is gated out never starts a voice and a cue that passes is attenuated exactly
   * once, however many tones it layers.
   */
  static _installGates(cues, cls, flag) {
    if (AudioManager[flag]) return;
    AudioManager[flag] = true;
    for (const name of cues) {
      const orig = AudioManager.prototype[name];
      if (typeof orig !== 'function') continue;
      AudioManager.prototype[name] = function (...a) {
        const fg = this._mixGate(name, cls);
        if (fg <= 0) return;                    // dropped: too soon, or cap reached
        const prev = this._fireMul;
        this._fireMul = fg;
        try { return orig.apply(this, a); } finally { this._fireMul = prev; }
      };
    }
  }

  static _installFireGates() {
    AudioManager._installGates(AudioManager.FIRE_CUES, 'fire', '__fireGatesInstalled');
  }

  static _installImpactGates() {
    AudioManager._installGates(AudioManager.IMPACT_CUES, 'impact', '__impactGatesInstalled');
  }

  _tone({ type = 'sine', freqStart, freqEnd, dur, gain = 0.15, delay = 0 }) {
    gain *= (this._fireMul || 1);   // MIX.fire / MIX.impact — see _installFireGates()
    // ORDER (Maria 2026-08-02): `muted` rejects the sound outright, so it must be tested
    // BEFORE the polyphony budget. Testing it after meant a rejected cue still spent one of
    // the 16 slots in the 130 ms window, and cues that DID want to sound were dropped for a
    // voice nobody could hear.
    if (this.muted) return;
    if (!this._voiceOk()) return;
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
    gain *= (this._fireMul || 1);   // MIX.fire / MIX.impact — see _installFireGates()
    if (this.muted) return;         // same ordering rule as _tone(): guard first, budget second
    if (!this._voiceOk()) return;
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

  // ── CARD SELECTION + REWARD STINGERS (Maria unified brief 2026-07-18 §22-23, §25) ──
  // Layered, satisfying, clearly NOT a projectile sound: confirmation click → rising cyber
  // chime → low reward thump → shimmer tail (~0.6s). Music ducks ~4dB for the confirm and
  // recovers in ~0.4s (never mutes). Rare/evolution/mega tiers add their own layers.
  playCardSelect(tier = 'common') {
    const t = this.actx.currentTime;
    try {   // music duck: -4dB-ish dip, fast attack, ~0.4s recovery
      const mg = this.musicGain.gain, base = this.muted ? 0 : this.musicVolume;
      mg.cancelScheduledValues(t);
      mg.setTargetAtTime(base * 0.63, t, 0.03);
      mg.setTargetAtTime(base, t + 0.12, 0.35);
    } catch (_) {}
    this._tone({ type: 'square',   freqStart: 900,  freqEnd: 900,  dur: 0.03, gain: 0.05 });               // click
    this._tone({ type: 'triangle', freqStart: 620,  freqEnd: 1240, dur: 0.16, gain: 0.06, delay: 0.03 });  // rising chime
    this._tone({ type: 'sine',     freqStart: 150,  freqEnd: 110,  dur: 0.14, gain: 0.07, delay: 0.05 });  // reward thump
    this._tone({ type: 'triangle', freqStart: 1560, freqEnd: 1900, dur: 0.22, gain: 0.025, delay: 0.16 }); // shimmer tail
    if (tier === 'rare' || tier === 'evolution') {
      this._tone({ type: 'triangle', freqStart: 930, freqEnd: 1860, dur: 0.20, gain: 0.045, delay: 0.10 }); // harmonic layer
    }
    if (tier === 'evolution') {   // transformation stinger: power rise + low release
      this._tone({ type: 'sawtooth', freqStart: 220, freqEnd: 880, dur: 0.30, gain: 0.045, delay: 0.12 });
      this._tone({ type: 'sine',     freqStart: 90,  freqEnd: 55,  dur: 0.34, gain: 0.10,  delay: 0.24 });
    }
    if (tier === 'mega') {        // Mega-Boss / permanent unlock: heavier premium stinger
      this._tone({ type: 'sawtooth', freqStart: 160, freqEnd: 640, dur: 0.40, gain: 0.05, delay: 0.10 });
      this._tone({ type: 'sine',     freqStart: 70,  freqEnd: 45,  dur: 0.45, gain: 0.12, delay: 0.28 });
      this._tone({ type: 'triangle', freqStart: 1240, freqEnd: 2480, dur: 0.30, gain: 0.03, delay: 0.34 });
    }
  }

  // DATA-XP pickup ladder (Maria brief 2026-07-18, Phase 2): short clean electronic tick.
  // Rapid consecutive pickups (≤ 240ms apart) climb up to 6 pitch steps, then reset after a
  // gap. Voices are grouped: max one voice per 35ms window — 100 shards never stack 100
  // oscillators. High-value cores add a deeper layer + bright chime. Distinct from Cores /
  // health / mana / level-up sounds (those live elsewhere in this file).
  playXpPickup(tier = 'small') {
    const now = performance.now();
    if (now - (this._xpTickLast || 0) < 35) return;              // voice grouping window
    if (now - (this._xpLadderT || 0) > 240) this._xpStep = 0;    // ladder reset on gap
    else this._xpStep = Math.min((this._xpStep || 0) + 1, 6);    // climb (max 6 steps)
    this._xpTickLast = now; this._xpLadderT = now;
    const f = 620 * Math.pow(1.09, this._xpStep);
    this._tone({ type: 'triangle', freqStart: f, freqEnd: f * 1.25, dur: 0.045, gain: 0.035 });
    if (tier === 'core') {                                        // compressed data core
      this._tone({ type: 'sine',     freqStart: 190,  freqEnd: 150,  dur: 0.10, gain: 0.06 });
      this._tone({ type: 'triangle', freqStart: 1560, freqEnd: 1840, dur: 0.07, gain: 0.03, delay: 0.02 });
    } else if (tier === 'medium') {
      this._tone({ type: 'triangle', freqStart: f * 1.5, freqEnd: f * 1.8, dur: 0.04, gain: 0.022, delay: 0.015 });
    }
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
    // Retrigger floor moved to MIX.impact.perCue.playPlasmaBladeHit — one authority, so the body
    // can no longer drop a call the gate already charged a cap slot and a stamp for.
    this._tone({ type: "sawtooth", freqStart: 220, freqEnd: 55,  dur: 0.14, gain: 0.18 });
    this._tone({ type: "square",   freqStart: 600, freqEnd: 180, dur: 0.08, gain: 0.12 });
    this._noiseBurst({ dur: 0.07, gain: 0.11, filterType: "highpass", freq: 2000 });
    this._noiseBurst({ dur: 0.05, gain: 0.05, filterType: "highpass", freq: 1800 });
  }

  // Void Needle — sharp piercing shot.
  playVoidNeedleFire() {
    // Retrigger floor: MIX.fire.perCue.playVoidNeedleFire — enforced by _fireGate().
    this._tone({ type: "triangle", freqStart: 1200, freqEnd: 400, dur: 0.09, gain: 0.13 });
    this._noiseBurst({ dur: 0.07, gain: 0.06, filterType: "highpass", freq: 3000 });
  }

  // Void Needle — soft impact on hit.
  playVoidNeedleHit() {
    // Retrigger floor moved to MIX.impact.perCue.playVoidNeedleHit — one authority, so the body
    // can no longer drop a call the gate already charged a cap slot and a stamp for.
    this._tone({ type: "sawtooth", freqStart: 320, freqEnd: 90,  dur: 0.09, gain: 0.14 });
    this._tone({ type: "square",   freqStart: 700, freqEnd: 200, dur: 0.05, gain: 0.09 });
    // 2500 Hz and 2200 Hz highpass bursts back to back were one texture spending two voices.
    this._noiseBurst({ dur: 0.055, gain: 0.09, filterType: "highpass", freq: 2400 });
  }

  // Sentry Drone — light blaster pop on fire.
  playSentryDroneFire() {
    // Retrigger floor: MIX.fire.perCue.playSentryDroneFire — enforced by _fireGate().
    this._tone({ type: "triangle", freqStart: 1400, freqEnd: 500, dur: 0.09, gain: 0.12 });
    this._tone({ type: "sawtooth", freqStart: 600,  freqEnd: 200, dur: 0.06, gain: 0.07 });
  }

  // Sentry Drone — small impact on hit.
  playSentryDroneHit() {
    // Retrigger floor moved to MIX.impact.perCue.playSentryDroneHit — one authority, so the body
    // can no longer drop a call the gate already charged a cap slot and a stamp for.
    // 3 voices per call, two of them near-identical sine sweeps (420->120 and 500->200) —
    // measured 4.28 voices/s, the purest repeated tone in the run. The duplicate tail is gone
    // and the survivor is a triangle over a wider sweep: same event, less pure pitch.
    this._tone({ type: "triangle", freqStart: 460, freqEnd: 95, dur: 0.075, gain: 0.12 });
    this._noiseBurst({ dur: 0.05, gain: 0.08, filterType: "highpass", freq: 2400 });
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
    // Retrigger floor moved to MIX.impact.perCue.playRailSpikeImpact — one authority, so the body
    // can no longer drop a call the gate already charged a cap slot and a stamp for.
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

  /**
   * File-backed one-shot. Maria 2026-08-02: this path used to bypass _voiceOk() completely,
   * so FILE cues obeyed no polyphony budget while every synthesized cue did — and file cues
   * are the loud ones. It now runs the same canonical budget, in the same guard-first order
   * as _tone()/_noiseBurst(): every rejection happens BEFORE a slot is spent, so a cue that
   * is muted, throttled, un-loaded or capped never charges the budget for silence.
   * @param {number} cap  optional per-key concurrency ceiling (0 = none)
   * @returns {boolean}   true only when a voice actually started
   */
  _playSfxBuffer(key, minGap, vol = 0.9, cap = 0) {
    if (this.muted) return false;
    const buf = this._sfxBuffers[key];
    if (!buf) return false;                      // still loading — no slot spent
    if (!this._fileActive) this._fileActive = Object.create(null);
    if (cap > 0 && (this._fileActive[key] || 0) >= cap) return false;
    if (!this._canPlay(key, minGap)) return false;
    if (!this._voiceOk()) return false;          // canonical budget, shared with the synth path
    if (this.actx.state === 'suspended') this.actx.resume();
    const src = this.actx.createBufferSource();
    src.buffer = buf;
    const g = this.actx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.sfxGain);
    src.start();
    if (cap > 0) {
      this._fileActive[key] = (this._fileActive[key] || 0) + 1;
      let released = false;
      const release = () => {
        if (released) return; released = true;
        this._fileActive[key] = Math.max(0, (this._fileActive[key] || 1) - 1);
      };
      src.onended = release;                     // primary
      // Belt and braces: onended does not fire in every engine (and never in the test
      // doubles), and a counter that only goes up would silence the cue permanently.
      setTimeout(release, Math.max(120, ((buf.duration || 0.3) + 0.15) * 1000));
    }
    return true;
  }

  // ─── File-backed SFX — each method preloads on first call, plays from cache ─

  // Enemy / boss death — throttled: at most one sound per 80 ms so mass-kill chaos
  // doesn't stack dozens of instances and bog down the audio thread.
  playEnemyDeath() {
    this._loadSfxFile('sfxEnemyDeath',
      'assets/audio/sfx/enemy-death.ogg',
      'assets/audio/sfx/enemy-death.mp3',
      'assets/audio/sfx/enemy-death.wav');
    // MIX.fileRepeat — level, retrigger floor and hard concurrency cap in one place.
    const R = AudioManager.MIX.fileRepeat;
    if (this._sfxBuffers['sfxEnemyDeath']) {
      this._playSfxBuffer('sfxEnemyDeath', R.minGap, 0.85 * R.vol, R.cap);
    } else {
      // Buffer still loading — procedural fallback, never silent. Same floor as the file.
      this.generateSound('enemy-death', R.minGap);
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

  // ═══ WAVE 1 — authored SFX: event classes, boss telegraphs, enemy tells ════
  // Single source of truth: logical id → file basenames under assets/audio/sfx/wave1/.
  // Multiple entries = variations, played round-robin (deterministic, no Math.random
  // in a gameplay path). Files ship as .ogg (primary) + .mp3 (fallback): every browser
  // that lacks Ogg Vorbis supports MP3, so a third .wav copy would only add repo size.
  // An id that is absent here is NOT an error — callers fall back (events → the
  // procedural playEventWarning alarm, enemy tells → silence). No 404 retry loops:
  // _loadSfxFile keeps the key in _sfxLoading after a failed fetch, so it is tried once.
  static WAVE1_SFX = {
    // ── event classes ──
    event_airstrike: ['event_warning_airstrike_01', 'event_warning_airstrike_02'],
    event_corrosive: ['event_warning_corrosive_01', 'event_warning_corrosive_02'],
    event_electric:  ['event_warning_electric_01',  'event_warning_electric_02'],
    event_void:      ['event_warning_void_01'],
    event_arena:     ['event_warning_arena_01'],
    event_boss_echo: ['event_warning_boss_echo_01'],
    event_supply:    ['event_warning_supply_01'],
    event_blacknet:  ['event_warning_blacknet_01'],
    event_major:     ['event_warning_major_01'],
    event_cryo:      ['event_warning_cryo_01'],
    // ── boss telegraphs (Batch 5.2 signatures) ──
    boss_mech:         ['boss_defector_laser_sweep_telegraph'],
    boss_annihilator:  ['boss_annihilator_forge_slam_telegraph'],
    boss_titan:        ['boss_titan_orbital_grid_telegraph'],
    boss_cyberSerpent: ['boss_serpent_charge_telegraph'],
    boss_cyberDragon:  ['boss_dragon_cryo_breath_telegraph'],
    boss_bloodfang:    ['boss_bloodfang_pack_assault_telegraph'],
    // ── enemy signature tells (Batch 5.1 signatures) ──
    tell_VoltRat:       ['enemy_volt_rat_surge_telegraph'],
    tell_PulseBurrower: ['enemy_pulse_burrower_burrow_telegraph'],
    tell_Razorhound:    ['enemy_razorhound_lunge_telegraph'],
    tell_RiftEye:       ['enemy_rift_eye_aim_telegraph'],
    tell_HeavyMech:     ['enemy_heavy_mech_brace_telegraph'],
    tell_AbyssMaw:      ['enemy_abyss_maw_guard_telegraph'],
  };

  // Concurrency ceilings per category. A bucket may be namespaced with ':' (e.g.
  // 'bossTelegraph:titan') so each boss gets its own slot of 1 while sharing the cap.
  static WAVE1_CAPS = { event: 1, bossTelegraph: 1, enemyTell: 3, fusion: 2 };

  static _wave1Registry(id) {
    return Object.prototype.hasOwnProperty.call(AudioManager.WAVE1_SFX, id)
      ? AudioManager.WAVE1_SFX[id] : null;
  }

  /**
   * Play one Wave 1 clip.
   * @returns {'played'|'blocked'|'nofile'} — callers only fall back on 'nofile',
   *          so a cooldown/cap rejection stays silent instead of doubling up.
   */

  /**
   * PER-CLIP LOUDNESS TRIM (Maria 2026-08-01).
   *
   * The 25 authored clips were mastered independently and their PERCEIVED level spans
   * 26 dB: event_warning_boss_echo_01 sits at -3.8 dB mean while boss_titan_orbital_grid
   * sits at -21.6. Peak-normalising them (most are already 0 dBFS peak) does nothing for
   * this, because the difference is in average level, not peaks.
   *
   * The audible consequence, measured in a real capture: boss telegraphs - the HIGHEST
   * priority cue, at the highest category gain of 0.95 - came out 9.6 dB BELOW the music,
   * while events sat 3.5 dB above it. The category gains were correct; the source files
   * disagreed with them.
   *
   * These factors bring each clip to a common perceived target per category
   * (boss -11 dB, event -13 dB, tell -18 dB) so the intended priority order actually holds:
   * boss over event over tell. Boost is capped at +9 dB and the master limiter catches the
   * peaks it creates. Re-measure and regenerate this table if a clip is ever re-rendered.
   */
  static WAVE1_TRIM = {
    boss_annihilator_forge_slam_telegraph: 1.216,
    boss_bloodfang_pack_assault_telegraph: 1.175,
    boss_defector_laser_sweep_telegraph: 0.832,
    boss_dragon_cryo_breath_telegraph: 2.065,
    boss_serpent_charge_telegraph: 1.905,
    boss_titan_orbital_grid_telegraph: 2.818,
    enemy_abyss_maw_guard_telegraph: 2.818,
    enemy_heavy_mech_brace_telegraph: 2.6,
    enemy_pulse_burrower_burrow_telegraph: 2.661,
    enemy_razorhound_lunge_telegraph: 0.851,
    enemy_rift_eye_aim_telegraph: 2.818,
    enemy_volt_rat_surge_telegraph: 0.767,
    event_warning_airstrike_01: 0.724,
    event_warning_airstrike_02: 0.661,
    event_warning_arena_01: 1.216,
    event_warning_blacknet_01: 2.512,
    event_warning_boss_echo_01: 0.501,
    event_warning_corrosive_01: 2.818,
    event_warning_corrosive_02: 2.818,
    event_warning_cryo_01: 2.818,
    event_warning_electric_01: 2.291,
    event_warning_electric_02: 2.455,
    event_warning_major_01: 0.944,
    event_warning_supply_01: 2.818,
    event_warning_void_01: 1.531,
  };

  /** Trim factor for a clip basename (1 = leave as authored). */
  static _wave1Trim(base) {
    const t = AudioManager.WAVE1_TRIM[base];
    return typeof t === 'number' && t > 0 ? t : 1;
  }

  _wave1Play(bucket, id, minGap, vol) {
    const variants = AudioManager._wave1Registry(id);
    if (!variants || !variants.length) return 'nofile';
    if (this.muted) return 'blocked';
    if (!this.actx) return 'nofile';

    if (!this._w1Active)  this._w1Active  = Object.create(null);
    if (!this._w1Rr)      this._w1Rr      = Object.create(null);
    if (!this._w1Sources) this._w1Sources = new Set();

    const capKey = String(bucket).split(':')[0];
    const cap = AudioManager.WAVE1_CAPS[capKey] || 1;
    if ((this._w1Active[bucket] || 0) >= cap) return 'blocked';   // concurrency ceiling
    if (!this._canPlay('w1:' + bucket, minGap)) return 'blocked'; // anti-spam

    const n = (this._w1Rr[id] = ((this._w1Rr[id] || 0) + 1) % variants.length);
    const base = variants[n];
    const key = 'w1_' + base;
    this._loadSfxFile(key,
      'assets/audio/sfx/wave1/' + base + '.ogg',
      'assets/audio/sfx/wave1/' + base + '.mp3');
    const buf = this._sfxBuffers[key];
    if (!buf) return 'nofile';                     // still decoding → caller falls back

    if (this.actx.state === 'suspended') this.actx.resume();
    const src = this.actx.createBufferSource();
    src.buffer = buf;
    const g = this.actx.createGain();
    // category gain x per-clip loudness trim: the category sets PRIORITY, the trim makes
    // the differently-mastered source files actually obey it.
    g.gain.value = vol * AudioManager._wave1Trim(base);
    src.connect(g);
    g.connect(this.sfxGain);                       // master volume + mute honoured here
    this._w1Active[bucket] = (this._w1Active[bucket] || 0) + 1;
    this._w1Sources.add(src);
    src.onended = () => {
      this._w1Active[bucket] = Math.max(0, (this._w1Active[bucket] || 1) - 1);
      this._w1Sources.delete(src);
    };
    src.start();
    return 'played';
  }

  // Event warning, routed by class. Unknown/missing class → 'major' fallback, and if
  // even that has no buffer yet the procedural alarm plays: never undefined, never silent.

  /**
   * Duck the music under an important cue (Maria 2026-08-01).
   *
   * Only boss telegraphs, major-event warnings and ultimate casts duck - never a common
   * weapon shot, which would pump the whole soundtrack in time with the auto-fire. The
   * ramp is smooth in both directions (120 ms down, 450 ms back) so it reads as the music
   * stepping aside rather than a gate closing, and the recovery target is read live from
   * musicVolume so a slider move mid-duck cannot strand the bed at the wrong level.
   */
  duckMusic(kind = 'event') {
    const cfg = AudioManager.MIX.duck[kind] || AudioManager.MIX.duck.event;
    if (!this.musicGain || !this.actx || this.muted) return;
    const g = this.musicGain.gain;
    const now = this.actx.currentTime;
    const full = this.musicVolume * (this.playlistActive ? 0.25 : 1);
    const target = full * cfg.amount;
    if (target >= (this._duckTarget ?? Infinity)) {
      // A deeper duck is already running - extend its hold instead of fighting it.
      this._duckUntil = Math.max(this._duckUntil || 0, now + cfg.hold);
      return;
    }
    this._duckTarget = target;
    this._duckUntil = now + cfg.hold;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(target, now + 0.12);          // quick, but not a cut
    } catch (e) { g.value = target; }
    clearTimeout(this._duckTimer);
    const wait = Math.max(0, (this._duckUntil - now) * 1000);
    this._duckTimer = setTimeout(() => {
      if (!this.musicGain || !this.actx) return;
      const t = this.actx.currentTime;
      const back = this.musicVolume * (this.playlistActive ? 0.25 : 1);   // live, not captured
      try {
        const gg = this.musicGain.gain;
        gg.cancelScheduledValues(t);
        gg.setValueAtTime(gg.value, t);
        gg.linearRampToValueAtTime(this.muted ? 0 : back, t + 0.45);      // gentle recovery
      } catch (e) { this.musicGain.gain.value = this.muted ? 0 : back; }
      this._duckTarget = null;
    }, wait);
  }

  playEventClass(cls, proceduralFallback = true) {
    let id = 'event_' + (cls || 'major');
    if (!AudioManager._wave1Registry(id)) id = 'event_major';
    // +6.0 dB over the old 0.92: events must clear the weapon layer, not sit inside it.
    const r = this._wave1Play('event', id, 0.25, 0.92 * AudioManager.MIX.eventBoost);
    if (r === 'played') this.duckMusic('event');
    if (r === 'nofile' && proceduralFallback) this.playEventWarning();
    return r;                                    // 'played'|'blocked'|'nofile'
  }

  // Boss signature telegraph — one active cue per boss, fired on TELEGRAPH entry only.
  playBossTelegraph(bossId) {
    if (!bossId) return;
    // +6.0 dB over the old 0.95. Boss telegraphs measured 9.6 dB BELOW the music before
    // the per-clip trim; with the trim and this boost they now sit clearly on top.
    const r = this._wave1Play('bossTelegraph:' + bossId, 'boss_' + bossId, 0.20, 0.95 * AudioManager.MIX.bossBoost);
    if (r === 'played') this.duckMusic('boss');
    if (r === 'nofile') this.playEventWarning();
  }

  // Normal-enemy signature tell — quiet by design; stays silent when unmapped so a
  // rat never borrows a boss-sized alarm.
  playEnemyTell(enemyType) {
    if (!enemyType) return;
    const id = 'tell_' + String(enemyType).replace(/[^A-Za-z0-9]/g, '');
    // +3.5 dB: audible as a warning, still clearly below boss and event cues.
    this._wave1Play('enemyTell', id, 0.30, 0.55 * AudioManager.MIX.tellBoost);
  }

  // Cleanup on run reset / deck transition — stop every live Wave 1 source and clear
  // the concurrency counters so a new run never starts with a stale ceiling.
  stopWave1() {
    if (this._w1Sources) {
      for (const s of this._w1Sources) { try { s.onended = null; s.stop(); } catch (e) { /* already ended */ } }
      this._w1Sources.clear();
    }
    this._w1Active = Object.create(null);
  }

  // ═══ FUSION ARMORY canonical audio hooks (Batch A, 2026-08-01) ══════════════
  // Hooks ανά fusion: <fusion_id>_manifest / _charge / _travel / _impact /
  // _aftermath. Το authored περιεχόμενο θα έρθει σε επόμενο audio Wave: τότε τα
  // clips μπαίνουν στο WAVE1_SFX registry (+ .ogg/.mp3 στο wave1/) και αυτή η
  // μέθοδος τα προτιμά αυτόματα — ΚΑΜΙΑ αλλαγή gameplay κώδικα δεν θα χρειαστεί.
  // Μέχρι τότε: per-fusion ΔΙΑΚΡΙΤΟ procedural voice, παραγόμενο ντετερμινιστικά
  // από το fusion id (ποτέ ο ίδιος ήχος σε όλα, ποτέ loop, πάντα one-shot →
  // κανένα orphaned voice· περνά από το sfx bus, σέβεται mute/volume).
  _fusionSeed(id) {
    let h = 2166136261;
    const s = String(id);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }
  static FUSION_PHASES = ['manifest', 'charge', 'travel', 'impact', 'aftermath'];
  playFusionCue(fusionId, phase) {
    if (!fusionId || AudioManager.FUSION_PHASES.indexOf(phase) < 0) return 'invalid';
    const hookId = fusionId + '_' + phase;
    // 1) Authored path — ίδιο συμβόλαιο με playEventClass ('nofile' → fallback,
    //    'blocked' → σιωπή ώστε ΠΟΤΕ να μη διπλασιαστεί το cue).
    if (AudioManager._wave1Registry(hookId)) {
      const r = this._wave1Play('fusion:' + fusionId, hookId, 0.20, 0.90 * AudioManager.MIX.eventBoost);
      if (r === 'played') { if (phase === 'manifest' || phase === 'impact') this.duckMusic('event'); return r; }
      if (r === 'blocked') return r;
    }
    // 2) Per-fusion procedural voice (bounded, throttled ανά hook).
    if (this.muted || !this.actx) return 'nofile';
    if (!this._forgeOk('fus:' + hookId, 240)) return 'blocked';
    const seed = this._fusionSeed(fusionId);
    const base   = 140 + (seed % 480);                 // 140-620 Hz — τονικότητα ανά fusion
    const bright = 1200 + ((seed >>> 9) % 2600);       // 1.2-3.8 kHz accent ανά fusion
    const wave   = ['sine', 'triangle', 'sawtooth'][(seed >>> 5) % 3];
    switch (phase) {
      case 'manifest':   // συναρμολόγηση: ανοδικό shimmer + σπινθήρες
        this._tone({ type: wave, freqStart: base, freqEnd: base * 2.2, dur: this._v(0.34, 0.15), gain: 0.10 });
        this._noiseBurst({ dur: 0.06, gain: 0.05, filterType: 'highpass', freq: bright, delay: 0.06 });
        break;
      case 'charge':     // ένταση: riser σε χαμηλό gain
        this._tone({ type: 'sawtooth', freqStart: base * 0.8, freqEnd: base * 1.7, dur: this._v(0.42, 0.15), gain: 0.07 });
        this._tone({ type: 'sine', freqStart: base * 0.5, freqEnd: base * 0.9, dur: 0.4, gain: 0.05, delay: 0.02 });
        break;
      case 'travel':     // κίνηση: doppler whoosh στο accent band
        this._noiseBurst({ dur: this._v(0.26, 0.2), gain: 0.11, filterType: 'bandpass', freq: bright });
        this._tone({ type: wave, freqStart: base * 1.6, freqEnd: base * 0.9, dur: 0.22, gain: 0.06 });
        break;
      case 'impact':     // χτύπημα: thump + πτώση
        this._noiseBurst({ dur: this._v(0.16, 0.2), gain: 0.16, filterType: 'lowpass', freq: 420 });
        this._tone({ type: wave, freqStart: base * 2.0, freqEnd: base * 0.4, dur: 0.24, gain: 0.12, delay: 0.01 });
        break;
      case 'aftermath':  // απόσβεση: detuned δίδυμο που σβήνει
        this._tone({ type: 'sine', freqStart: base * 1.5, freqEnd: base * 1.42, dur: this._v(0.5, 0.2), gain: 0.055 });
        this._tone({ type: 'triangle', freqStart: base * 2.25, freqEnd: base * 2.1, dur: 0.4, gain: 0.04, delay: 0.05 });
        break;
    }
    return 'forged';
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
    this.duckMusic('ultimate');       // top of the hierarchy — the music steps aside
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

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD ENGINE WEAPON VOICE (Maria 2026-08-02)
// All 23 BuildEngine executors were silent: the entire live weapon layer made no sound. This
// layer REUSES existing authored cues only — no Wave 3, no new synthesis — and every one of them
// passes through MIX.beWeapon, which is deliberately the quietest and tightest class in the mix
// (quieter than MIX.fire, a longer retrigger floor, and a cap of one simultaneous voice per
// weapon plus a hard ceiling across the whole layer). The point is to make the weapon you are
// holding audible, NOT to add another dense repeated tone on top of the one already removed.
// ═══════════════════════════════════════════════════════════════════════════════
AudioManager.MIX.beWeapon = {
  mul: 0.38,        // x0.38 = -8.4 dB, quieter than MIX.fire's x0.50
  minGap: 0.20,     // per-weapon retrigger floor
  cap: 1,           // one live voice per weapon id
  layerCap: 3,      // and never more than 3 BuildEngine weapon voices at once, whatever fires
  layerGap: 0.05,   // never two BE weapon cues in the same 50 ms
  // hold MUST NOT exceed minGap. If it did, the cap-1 slot would still be occupied when the
  // retrigger floor expires, so `hold` - not the declared floor - would silently become the real
  // rate limit for every weapon. Keeping them equal makes the floor mean exactly what it says.
  hold: 0.20,       // how long one cue occupies a slot, on the AUDIO clock (never a setTimeout)
};

// weaponId (or evolution id) -> an EXISTING AudioManager cue chosen for its character.
AudioManager.BE_WEAPON_SFX = Object.freeze({
  vector_heel:               'playPlasmaBladeSwing',
  storm_sash:                'playPlasmaBladeSwing',
  hydraulic_knuckle:         'playHeavyHit',
  magnetic_shrapnel:         'playRailSpikeFire',
  faultline_fist:            'playHeavyHit',
  magma_uppercut:            'playDroneFlame',
  monowire_lash:             'playPlasmaBladeSwing',
  toxin_kunai:               'playVoidNeedleFire',
  solo_red_thunder:          'playLightningStrike',
  feedback_cabinet:          'playTitanShockwave',
  cyber_gauntlets_injection: 'playHeavyHit',
  holo_energy_knuckles:      'playPlasmaBladeSwing',
  phase_needle:              'playVoidNeedleFire',
  probability_disc:          'playShardRingHit',
  axiom_ray:                 'playVoidBeamFire',
  phi_cutter:                'playPlasmaBladeSwing',
  hannya_cleaver:            'playPlasmaBladeSwing',
  hungry_spirit_lantern:     'playToxicGas',
  build_null_lance:          'playRailSpikeFire',
  build_ion_halo:            'playGravityCorePulse',
  gravity_core:              'playGravityCoreActivate',
  nano_mine:                 'playNanoMineDrop',
  blacknet_swarm_drone:      'playBlacknetSwarmLaunch',
});

AudioManager.prototype.playBuildWeapon = function (weaponId) {
  if (this.muted) return false;
  const M = AudioManager.MIX.beWeapon;
  // Keyed on the BASE weapon id, which is what BuildEngine passes: an evolved weapon keeps its
  // family's voice rather than falling silent the moment it upgrades.
  const cue = AudioManager.BE_WEAPON_SFX[weaponId];
  const fn = cue && this[cue];
  if (typeof fn !== 'function') return false;

  const now = this.actx ? this.actx.currentTime : 0;
  if (!this._beLast)   this._beLast   = Object.create(null);
  if (!this._beVoices) this._beVoices = [];      // [{ id, until }] on the AUDIO clock
  if (this._beLayerT === undefined) this._beLayerT = -1e9;

  // Occupancy is expressed as a RELEASE TIMESTAMP swept on admission, never as a setTimeout.
  // A wall-clock timer would drift away from actx.currentTime, and a backgrounded tab throttles
  // setTimeout to ~1 Hz - which would have left the whole layer holding voice slots it had long
  // finished playing, i.e. silent. Sweeping on the same clock the floors use is exact and, unlike
  // a timer, deterministically testable.
  let n = 0;
  for (const v of this._beVoices) if (v.until > now) this._beVoices[n++] = v;
  this._beVoices.length = n;

  // Rejected cues must not consume anything — same rule as the file-buffer path.
  if (now - this._beLayerT < M.layerGap) return false;
  if (this._beVoices.length >= M.layerCap) return false;
  if (now - (this._beLast[weaponId] ?? -1e9) < M.minGap) return false;
  let mine = 0;
  for (const v of this._beVoices) if (v.id === weaponId) mine++;
  if (mine >= M.cap) return false;

  this._beLast[weaponId] = now;
  this._beLayerT = now;
  this._beVoices.push({ id: weaponId, until: now + M.hold });

  // The cue may itself be a gated FIRE/IMPACT cue; _fireMul composes multiplicatively, and the
  // inner gate can still reject it — which is fine, this layer is deliberately the quiet one.
  const prev = this._fireMul;
  this._fireMul = (prev || 1) * M.mul;
  try { fn.call(this); } finally { this._fireMul = prev; }
  return true;
};

AudioManager._installFireGates();
AudioManager._installImpactGates();
