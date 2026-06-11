// ─── Game config ──────────────────────────────────────────────────────────────
export const WIDTH  = 1280;
export const HEIGHT = 720;
export const WORLD_W = 2240;   // enlarged from 1792 for late-game breathing room / kiting space
export const WORLD_H = 1260;   // enlarged from 1008 (keeps 16:9); matrices/camera/spawns/clamps all derive from these
export const FPS    = 60;
export const WORLD_MARGIN = 40;

// Camera zoom-out: render the world slightly smaller so more of the battlefield
// is visible (late-game crowds read better). The visible world window is
// WIDTH/VIEW_SCALE × HEIGHT/VIEW_SCALE world-units inside the fixed 1280×720 canvas.
export const VIEW_SCALE = 0.85;
export const VIEW_W = WIDTH  / VIEW_SCALE;   // ≈ 1505.9 world-units shown horizontally
export const VIEW_H = HEIGHT / VIEW_SCALE;   // ≈ 847.1  world-units shown vertically

// Full target is 30 minutes. Change to 180 for quick testing.
// NOTE: WIN_TIME_SECONDS also normalizes coreVolatilityMultiplier() — do NOT repurpose
// it as the win time. The reachable "Act 1" victory uses ACT1_WIN_SECONDS below.
export const WIN_TIME_SECONDS = 30 * 60;

// Reachable primary victory ("Act 1") — climaxes just after the Bloodfang Packmaster (10:00).
// Used ONLY by the win check; kept separate from WIN_TIME_SECONDS so the core economy is
// untouched. Endless mode (CONTINUE) lifts this so the run keeps scaling on absolute time.
export const ACT1_WIN_SECONDS = 12 * 60;

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
