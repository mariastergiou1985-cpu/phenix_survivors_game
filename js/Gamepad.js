// ─── Browser controller support (Gamepad API) ─────────────────────────────────────────────────
// Pure input reader: deadzone + per-button rising-edge detection. NO game logic here — main.js maps
// the snapshot onto the existing keyboard `keys` Set / handlers, so gameplay stays unchanged and
// keyboard/mouse keep working when no pad is present. Works for USB + Bluetooth controllers alike
// (the browser exposes both identically). Standard mapping covers Xbox / PS5 / PS4 / Razer / generic.

const DEADZONE = 0.30;

// Standard Gamepad mapping button indices (same layout across Xbox / PlayStation / most PC pads).
const BTN = {
  a: 0, b: 1, x: 2, y: 3,        // face buttons (A/B/X/Y  ·  Cross/Circle/Square/Triangle)
  lb: 4, rb: 5, lt: 6, rt: 7,    // shoulders / triggers (LB/RB/LT/RT · L1/R1/L2/R2)
  back: 8, start: 9,             // Back/Share · Start/Options
  up: 12, down: 13, left: 14, right: 15,   // D-pad
};

export class GamepadInput {
  constructor() {
    this._prev      = {};        // previous held state by logical name (for edge detection)
    this.connected  = false;
    this.type       = 'xbox';    // 'xbox' | 'ps' — label/symbol hint only; mapping is identical
    this.activated  = false;     // true once ANY button has been pressed (browsers require a gesture)
  }

  _firstPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  _detectType(id) {
    const s = (id || '').toLowerCase();
    if (s.includes('dualsense') || s.includes('dualshock') || s.includes('playstation') ||
        s.includes('054c') || s.includes('wireless controller')) return 'ps';
    return 'xbox';
  }

  // Per-frame snapshot, or null when no controller is connected.
  //   { axes:{lx,ly,rx,ry}, btn:{ name:{held,pressed} }, type, activated }
  poll() {
    const p = this._firstPad();
    this.connected = !!p;
    if (!p) { this._prev = {}; return null; }
    this.type = this._detectType(p.id);

    const ax  = p.axes || [];
    const out = { axes: { lx: 0, ly: 0, rx: 0, ry: 0 }, btn: {}, type: this.type, activated: this.activated };
    out.axes.lx = Math.abs(ax[0] || 0) > DEADZONE ? ax[0] : 0;
    out.axes.ly = Math.abs(ax[1] || 0) > DEADZONE ? ax[1] : 0;
    // Right stick (axes[2]/axes[3]) — aim direction; same deadzone as left stick.
    out.axes.rx = Math.abs(ax[2] || 0) > DEADZONE ? ax[2] : 0;
    out.axes.ry = Math.abs(ax[3] || 0) > DEADZONE ? ax[3] : 0;

    const now = {};
    for (const name in BTN) {
      const b    = p.buttons[BTN[name]];
      const held = !!b && (b.pressed || b.value > 0.5);
      now[name]  = held;
      out.btn[name] = { held, pressed: held && !this._prev[name] };   // rising edge
      if (held) this.activated = true;
    }
    this._prev = now;
    out.activated = this.activated;
    return out;
  }
}
