import { clamp } from '../utils.js';

export class AudioManager {
  constructor() {
    this.actx        = new AudioContext();
    this.muted       = false;
    this.masterGain  = this.actx.createGain();
    this.masterGain.gain.value = 0.65;
    this.masterGain.connect(this.actx.destination);

    this._alarmOsc   = null;
    this._alarmGain  = null;

    this._startMusic();
  }

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

  _startMusic() {
    // Layered synthwave drone: root A1(55Hz), fifth E2(82.5Hz), octave A2(110Hz)
    const layers = [
      { freq: 55,   vol: 0.055, lfoRate: 0.10 },
      { freq: 82.5, vol: 0.038, lfoRate: 0.13 },
      { freq: 110,  vol: 0.025, lfoRate: 0.08 },
    ];

    for (const { freq, vol, lfoRate } of layers) {
      const osc  = this.actx.createOscillator();
      const g    = this.actx.createGain();
      const lfo  = this.actx.createOscillator();
      const lfoG = this.actx.createGain();

      osc.type = 'sawtooth'; osc.frequency.value = freq;
      lfo.frequency.value = lfoRate;
      lfoG.gain.value     = vol * 0.25;

      g.gain.value = vol;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      osc.connect(g);    g.connect(this.masterGain);
      osc.start(); lfo.start();
    }
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
