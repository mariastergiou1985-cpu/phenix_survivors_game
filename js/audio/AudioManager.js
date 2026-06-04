import { clamp } from '../utils.js';

export class AudioManager {
  constructor() {
    this.actx       = new AudioContext();
    this.muted      = false;
    this.masterGain = this.actx.createGain();
    this.masterGain.gain.value = 0.65;
    this.masterGain.connect(this.actx.destination);

    this._alarmOsc  = null;
    this._alarmGain = null;

    // Music tracks — HTML Audio routed through Web Audio for unified mute control
    this._menuAudio     = null;
    this._gameplayAudio = null;
    this._setupMusic('assets/audio/music/menu_theme.mp3',     0.28, a => { this._menuAudio     = a; });
    this._setupMusic('assets/audio/music/gameplay_theme.mp3', 0.20, a => { this._gameplayAudio = a; });
  }

  _setupMusic(src, volume, assign) {
    try {
      const audio = new Audio(src);
      audio.loop  = true;
      const source = this.actx.createMediaElementSource(audio);
      const gain   = this.actx.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(this.masterGain);
      assign(audio);
    } catch (_) { /* missing file — stay silent */ }
  }

  _play(audio) {
    if (!audio || !audio.paused) return;
    if (this.actx.state === 'suspended') {
      this.actx.resume().then(() => audio.play().catch(() => {}));
    } else {
      audio.play().catch(() => {});
    }
  }

  _stop(audio) {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  startMenuMusic()    { this._stop(this._gameplayAudio); this._play(this._menuAudio); }
  stopMenuMusic()     { this._stop(this._menuAudio); }
  startGameplayMusic(){ this._stop(this._menuAudio); this._play(this._gameplayAudio); }
  stopGameplayMusic() { this._stop(this._gameplayAudio); }

  toggleMute() {
    this.muted = !this.muted;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.65, this.actx.currentTime, 0.05);
  }

  playCorePickup()  { this._sweep(440,  880, 0.15, 0.28); }
  playCoreSlot()    { this._sweep(800,  200, 0.12, 0.22); }
  playDash()        { this._noise(0.10, 0.18); }
  playDeath()       { this._sweep(500,  60,  0.08, 0.18); }

  playShoot() {
    const t = this.actx.currentTime;
    const osc = this.actx.createOscillator();
    const g   = this.actx.createGain();
    osc.type = 'square';
    osc.frequency.value = 220;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.07);
  }

  updateAlarm(overload) {
    if (overload > 75 && !this._alarmOsc) {
      this._startAlarm();
    } else if (overload <= 75 && this._alarmOsc) {
      this._stopAlarm();
    }
    if (this._alarmGain) {
      const vol = clamp((overload - 75) / 25, 0, 1) * 0.22;
      this._alarmGain.gain.setTargetAtTime(vol, this.actx.currentTime, 0.1);
    }
  }

  _startAlarm() {
    const t   = this.actx.currentTime;
    const osc = this.actx.createOscillator();
    const lfo = this.actx.createOscillator();
    const g   = this.actx.createGain();
    const lg  = this.actx.createGain();

    osc.type = 'sawtooth'; osc.frequency.value = 60;
    lfo.frequency.value = 1.8;
    lg.gain.value = 0.1;
    g.gain.value  = 0;

    lfo.connect(lg); lg.connect(g.gain);
    osc.connect(g);  g.connect(this.masterGain);
    osc.start(t); lfo.start(t);

    this._alarmOsc  = osc;
    this._alarmGain = g;
  }

  _stopAlarm() {
    if (!this._alarmOsc) return;
    const t = this.actx.currentTime;
    this._alarmGain.gain.setTargetAtTime(0, t, 0.2);
    this._alarmOsc.stop(t + 0.5);
    this._alarmOsc  = null;
    this._alarmGain = null;
  }

  _sweep(startHz, endHz, duration, volume) {
    const t   = this.actx.currentTime;
    const osc = this.actx.createOscillator();
    const g   = this.actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, t);
    osc.frequency.linearRampToValueAtTime(endHz, t + duration);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t); osc.stop(t + duration + 0.01);
  }

  _noise(duration, volume) {
    const sr         = this.actx.sampleRate;
    const bufferSize = Math.ceil(sr * duration);
    const buffer     = this.actx.createBuffer(1, bufferSize, sr);
    const data       = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = this.actx.createBufferSource();
    const g   = this.actx.createGain();
    g.gain.value = volume;
    src.buffer = buffer;
    src.connect(g); g.connect(this.masterGain);
    src.start();
  }
}
