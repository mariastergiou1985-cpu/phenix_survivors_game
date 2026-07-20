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
    // RADIAL deadzone + angular axis gate (2026-07-20). The old per-axis test cut a SQUARE hole
    // of side 2*DEADZONE instead of a circle of radius DEADZONE, so diagonals died in the
    // corners: a stick pushed to 45° at magnitude 0.35 gives |x|=|y|=0.247, both under 0.30, so
    // BOTH axes were zeroed and the hero did not move at all — while the same 0.31 push straight
    // up did move him. Diagonals effectively needed 0.424 (0.30/cos45°), 41% more than cardinals.
    //
    // Now: ONE magnitude test decides whether the stick is engaged (same threshold in every
    // direction), then each axis is kept only if it carries a real share of that magnitude.
    // The share is a RATIO, not a fixed value, so the cardinal sector is a constant ~16° at any
    // deflection. That keeps a near-vertical push purely vertical (no diagonal drift, which a
    // raw pass-through would have introduced, since main.js treats ANY non-zero axis as held)
    // and at full deflection it behaves as before — only the weak-push dead cross is gone.
    const AXIS_RATIO = 0.28;   // sin(16.3°)
    const _radial = (x, y) => {
      const mag = Math.hypot(x, y);
      if (mag <= DEADZONE) return { x: 0, y: 0 };
      const c = mag * AXIS_RATIO;
      return { x: Math.abs(x) > c ? x : 0, y: Math.abs(y) > c ? y : 0 };
    };
    const L = _radial(ax[0] || 0, ax[1] || 0);
    out.axes.lx = L.x; out.axes.ly = L.y;
    // Right stick (axes[2]/axes[3]) — aim direction; same radial deadzone as the left stick.
    const R = _radial(ax[2] || 0, ax[3] || 0);
    out.axes.rx = R.x; out.axes.ry = R.y;

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

  // Haptic rumble (dual-rumble) — works on Xbox / DualSense / DualShock / most pads over USB or
  // Bluetooth. Feature-detected and fully guarded, so pads without haptics simply do nothing and
  // nothing ever throws. duration in ms; strong = low-freq motor, weak = high-freq motor (0..1).
  rumble(duration = 120, strong = 0.6, weak = 0.4) {
    try {
      const p = this._firstPad();
      const act = p && (p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]));
      if (!act) return;
      if (typeof act.playEffect === 'function') {
        act.playEffect('dual-rumble', { duration, strongMagnitude: strong, weakMagnitude: weak, startDelay: 0 }).catch(() => {});
      } else if (typeof act.pulse === 'function') {
        act.pulse(Math.max(strong, weak), duration).catch(() => {});
      }
    } catch (_) { /* no haptics → silent */ }
  }
}
