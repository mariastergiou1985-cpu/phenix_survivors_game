// ─── Game config ──────────────────────────────────────────────────────────────
export const WIDTH  = 1280;
export const HEIGHT = 720;
export const FPS    = 60;
export const WORLD_MARGIN = 40;

// Full target is 30 minutes. Change to 180 for quick testing.
export const WIN_TIME_SECONDS = 30 * 60;

export const CORE_OVERLOAD_TICK_TIME  = 2.0;
export const BASE_OVERLOAD_PER_CORE   = 1.0;
export const OVERLOAD_PICKUP_REDUCTION = 0.5;
export const OVERLOAD_SLOT_REDUCTION   = 0.5;

export const PLAYER_RADIUS = 16;
export const ENEMY_RADIUS  = 14;
export const CORE_RADIUS   = 8;
export const MATRIX_RADIUS = 34;
export const MAX_OVERLOAD  = 100.0;

// ─── Colors (CSS hex strings) ─────────────────────────────────────────────────
export const BLACK    = '#05080f';
export const DARK_BG  = '#080c1a';
export const GRID_LINE = '#122d46';

export const CYAN      = '#00e6ff';
export const CYAN_DARK = '#005a78';
export const MAGENTA   = '#ff00b4';
export const PURPLE    = '#9650ff';
export const RED       = '#ff3750';
export const RED_DARK  = '#780f23';
export const ORANGE    = '#ff9100';
export const YELLOW    = '#ffe650';
export const GREEN     = '#28ff8c';
export const BLUE      = '#468cff';
export const WHITE     = '#e6f5ff';
export const GREY      = '#78919f';
export const DARK_GREY = '#2d3c4b';

export const CORE_COLORS = [CYAN, MAGENTA, ORANGE, GREEN, BLUE];

// ─── Vec2 ─────────────────────────────────────────────────────────────────────
export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  clone()   { return new Vec2(this.x, this.y); }
  add(v)    { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v)    { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s)  { return new Vec2(this.x * s, this.y * s); }

  // Mutating variants — avoid allocation in hot paths
  addMut(v)   { this.x += v.x; this.y += v.y; return this; }
  subMut(v)   { this.x -= v.x; this.y -= v.y; return this; }
  scaleMut(s) { this.x *= s;   this.y *= s;   return this; }
  setMut(x, y){ this.x = x;    this.y = y;    return this; }

  lengthSq()   { return this.x * this.x + this.y * this.y; }
  length()     { return Math.sqrt(this.lengthSq()); }

  normalize() {
    const l = this.length();
    return l === 0 ? new Vec2() : this.scale(1 / l);
  }

  normalizeMut() {
    const l = this.length();
    if (l > 0) { this.x /= l; this.y /= l; }
    return this;
  }

  dot(v)        { return this.x * v.x + this.y * v.y; }
  distanceTo(v) { return this.sub(v).length(); }

  static fromAngle(rad, len = 1) {
    return new Vec2(Math.cos(rad) * len, Math.sin(rad) * len);
  }
}
