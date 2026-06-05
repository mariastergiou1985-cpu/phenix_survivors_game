export class AudioManager {
  constructor() {
    this.actx       = new AudioContext();
    this.muted      = false;
    this.masterGain = this.actx.createGain();
    this.masterGain.gain.value = 0.65;
    this.masterGain.connect(this.actx.destination);

    this._menuAudio     = null;
    this._gameplayAudio = null;

    this._setupTrack('assets/audio/music/menu_theme.mp3?v=3', 0.28, a => { this._menuAudio     = a; });
    this._setupTrack('assets/audio/music/gameplay_theme.mp3', 0.20, a => { this._gameplayAudio = a; });
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

  // Stubs kept so existing game.audio?.playX() calls don't crash
  playCorePickup() {}
  playCoreSlot()   {}
  playDash()       {}
  playDeath()      {}
  playShoot()      {}
  updateAlarm()    {}
}
