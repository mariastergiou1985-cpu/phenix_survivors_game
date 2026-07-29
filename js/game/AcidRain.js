// ─── AcidRain.js ────────────────────────────────────────────────────────────
// TOXIC DOWNPOUR — the acid rain world event for PHENIX: NULL EDEN.
//
// This module replaces the old inline pair Game._updateAcidRain / Game._drawAcidRain, which was
// an enemy purge with a cosmetic overlay: it never damaged the player, it had no warning phase,
// it produced no impacts and it left nothing on the floor. The event now owns a full lifecycle
// and is a real threat the player has to read and move around.
//
//   idle -> warning (3 s, one announcement) -> raining (12 s, purge + downpour)
//        -> fading (3 s, the storm thins out) -> idle -> cooldown -> eligible again
//
// The three things that make this safe to run every frame:
//   1. Rain streaks live in CAMERA SPACE (offsets from the camera's top-left) and are converted
//      to world coordinates only at draw time. A deck transition, a camera clamp or the Endless
//      world rebase therefore cannot leave rain painted at coordinates the player left behind.
//   2. Everything that lives in WORLD space (impacts, puddles, particles) is hard capped, pooled
//      and dropped wholesale on deck change, event end and run reset.
//   3. draw() consumes no randomness at all. Every visual wobble comes from a pure hash of a
//      seed that was stored on the object when update() created it, so the draw/update
//      determinism regression (tools/qa/phase6b_draw_determinism.mjs) cannot see this module.
//
// Player damage goes through game._damagePlayer() and nowhere else. This file never touches
// player.hp, player stats or any barrier field directly.
// ────────────────────────────────────────────────────────────────────────────

import { Vec2, GREEN, PLAYER_RADIUS } from '../constants.js';
import { FloatingText } from '../entities/FloatingText.js?v=20260703990000';

// Phones get a smaller visual budget so the framerate holds during the storm, the same split
// Effects.js already uses for its particle system. Gameplay numbers below are NOT scaled by this:
// the damage, the puddle count and the purge are identical on every device.
const IS_MOBILE = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

// ─── HARD CAPS ──────────────────────────────────────────────────────────────
// Every one of these is a ceiling, not a target. The storm scales its density with the ramp
// intensity and stops dead at the cap; it never allocates past it and never grows per frame.

// Visible rain streaks. 150 lines across a 1280x720 view is roughly one streak per 6100 px2,
// which reads as a heavy downpour while still costing a single stroke each. Above ~200 the
// stroke calls start to matter on integrated GPUs and the screen stops being readable anyway.
const MAX_STREAKS = IS_MOBILE ? 70 : 150;

// Live impact splashes. An impact lives 0.32 s, and only the foreground streak layer (a third of
// the streaks) can produce one, so 48 is comfortably above what the rate limiter below can ever
// deliver — it exists purely so a pathological dt cannot grow the array.
const MAX_IMPACTS = 48;

// Impacts started per second, enforced with a refilling budget rather than a per-frame count so
// the rate is identical at 30 fps and at 144 fps. 30/s keeps the splash layer busy without
// turning the floor into a solid sheet, and it bounds particle spawning too (30 x 4 = 120/s).
const MAX_IMPACTS_PER_SEC = 30;

// Concurrent damaging puddles. This is the gameplay cap, not a visual one: 12 puddles of radius
// ~38 cover about 5.4% of a 1280x720 view, so a player who keeps moving can always find floor,
// and a player who stands still takes at most one puddle's cadence of damage (see MAX_PUDDLES
// note in _tickPuddles — only one puddle is allowed to land damage in a single frame).
const MAX_PUDDLES = 12;

// Acid particles from impacts and from puddle bubbling. Matches the desktop budget of the shared
// ParticleSystem (200) with headroom left over, since that system is running at the same time.
const MAX_PARTICLES = IS_MOBILE ? 70 : 160;

// Particles per impact. Four is enough to read as a burst; the cap above plus the impact rate
// limiter means the steady state is ~120 spawns/s against a 160 slot pool with a 0.5 s life.
const PARTICLES_PER_IMPACT = 4;

// ─── LIFECYCLE TIMING ───────────────────────────────────────────────────────
const WARNING_S = 3.0;   // long enough to read the announcement and start moving
const RAIN_S    = 12.0;  // matches the old event window exactly, so the purge is unchanged
const FADE_S    = 3.0;   // the storm thins out; long enough for most puddles to expire naturally

// Minimum runtime before the FIRST storm of a run. Endless ramps slowly and a storm at 60 s lands
// while the player is still assembling a build; Chaos is hostile from the first second so it gets
// the shorter gate. Act 1 is a scripted act and keeps the most generous gate.
const MIN_RUNTIME_ENDLESS = 90;
const MIN_RUNTIME_CHAOS   = 60;
const MIN_RUNTIME_DEFAULT = 120;

// Cooldown after a storm finishes. These are the old Game.js values (Chaos 60 / Endless 100 /
// Act 1 138) so the pacing of a run does not change, only what the storm does when it arrives.
const COOLDOWN_CHAOS   = 60;
const COOLDOWN_ENDLESS = 100;
const COOLDOWN_DEFAULT = 138;

// Small controlled randomness on the cooldown so two runs do not tick in lockstep. +/-8% of 100 s
// is +/-8 s, enough to break the pattern and too small to change build planning.
const COOLDOWN_JITTER = 0.08;

// ─── PUDDLE TUNING ──────────────────────────────────────────────────────────
const PUDDLE_LIFE      = 6.5;   // total seconds on the floor
const PUDDLE_ARM_S     = 0.5;   // fade-in before it can damage: no burst without a visible warning
const PUDDLE_FADE_OUT  = 1.2;   // last seconds are visibly draining, so leaving is telegraphed
const PUDDLE_DMG       = 6;     // per tick, routed through _damagePlayer (its cap still applies)
const PUDDLE_DMG_CD    = 1.0;   // one tick per second per puddle
const PUDDLE_MISS_CD   = 0.3;   // retry sooner when the hit was refused (dash i-frames, grace)
const PUDDLE_R_MIN     = 30;
const PUDDLE_R_MAX     = 46;
const PUDDLE_MIN_GAP   = 90;    // centre spacing, so puddles never fuse into an unavoidable carpet
const PUDDLE_SPAWN_CD  = 0.5;   // minimum seconds between two puddle placements
const PUDDLE_CHANCE    = 0.09;  // fraction of impacts that try to become a puddle
const PUDDLE_STOP_LEAD = 2.0;   // stop placing puddles this long before the rain ends

// ─── PURGE TUNING (ported verbatim from the old _updateAcidRain) ────────────
const ACID_DPS  = 10;    // damage per second to normal enemies (kills weak, hurts strong)
const MINI_VULN = 0.7;   // mini-bosses take 70% — strong, meaningful chip
const MAIN_VULN = 0.4;   // main boss takes 40% — reduced but still real

// ─── RAIN LAYERS ────────────────────────────────────────────────────────────
// Three depths. Only the foreground layer reaches the floor and produces impacts; the two back
// layers are pure parallax, which is what stops the impact rate from tripling with the density.
const LAYERS = [
  { spd:  900, w: 1.0, alpha: 0.20, len: 26, lands: false },
  { spd: 1250, w: 1.6, alpha: 0.32, len: 38, lands: false },
  { spd: 1660, w: 2.5, alpha: 0.52, len: 56, lands: true  },
];
const WIND_X = -150;   // px/s sideways drift; also sets the streak tilt so the two agree

// Endless rebases the whole world by the mirror period (2 x tileW x CITY_SCALE = 10032 px) when
// the player wanders far enough. Game._maybeRebaseWorld shifts the objects it knows about; it does
// not know about this module, so a camera x jump larger than any real frame of movement is treated
// as a rebase and the world-space arrays are shifted by the same delta. A jump on Y that large can
// only be a deck teleport, which drops everything instead.
const REBASE_JUMP_PX = 4000;
const DECK_JUMP_PX   = 1500;

// ─── SEEDED PRNG (update side only) ─────────────────────────────────────────
// Module-local mulberry32. Kept off Math.random deliberately: the storm's visual choices must not
// perturb the shared gameplay RNG stream, and the draw/update determinism regression counts
// Math.random calls. This state advances ONLY inside update(), never inside draw().
let _rngState = 0x9e3779b9 | 0;
function srand() {
  _rngState = (_rngState + 0x6D2B79F5) | 0;
  let t = _rngState;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function srange(a, b) { return a + srand() * (b - a); }

// Pure hash for draw-time detail. Same shape as the inline `prE` helper already used in Game.js's
// VFX code: deterministic for a given (seed, index) pair and completely free of RNG state, so
// drawing the same frame twice paints the same pixels.
function hash01(seed, i) {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// Acid palette. Kept high-chroma green with a pale core so it stays legible over the cold blue
// Endless city art AND over the hot magenta/red Chaos deck, neither of which contains this hue.
const ACID_CORE = '#d9ffb0';
const ACID_MID  = '#7dff4f';
const ACID_DEEP = '#2fae2a';

export class AcidRain {
  constructor(game) {
    this.game = game;

    // Camera-space rain. Each entry is { sx, sy, layer, landY, seed } where sx/sy are offsets
    // from the camera's top-left corner, so the field is valid wherever the camera happens to be.
    this.streaks = [];

    // World-space, all pooled and all dropped on deck change / event end / reset.
    this.impacts   = [];
    this.particles = [];
    this.puddles   = [];
    this._impactPool   = [];
    this._particlePool = [];

    this.reset();
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────

  /** Hard clear for a new run. Every array empty, phase idle, every timer re-armed. */
  reset() {
    this._phase       = 'idle';
    this._phaseT      = 0;      // seconds elapsed inside the current phase
    this._phaseLen    = 0;      // length of the current phase, for timeLeft
    this._warned      = false;  // the announcement fires exactly once per event
    this._cdLeft      = this._rollCooldown();
    this._purgeAccum  = 0;
    this._impactBudget = MAX_IMPACTS_PER_SEC;
    this._puddleCd    = 0;
    this._lastCamX    = null;
    this._lastCamY    = null;

    this.streaks.length = 0;
    this._releaseAll();

    // Counters exposed through stats(). They are per-run, so they zero here and nowhere else.
    this._puddleDamageTicks = 0;
    this._warningsShown     = 0;
    this._startedCount      = 0;

    // Re-seed so two runs of the same seed produce the same storm. The value is arbitrary; what
    // matters is that it is fixed rather than time-derived.
    _rngState = 0x9e3779b9 | 0;
  }

  /** True while the event owns the screen: warning through fade-out. */
  get active() { return this._phase !== 'idle'; }

  /** 'idle' | 'warning' | 'raining' | 'fading' */
  get phase() { return this._phase; }

  /**
   * Eligibility ONLY. Whether the event is ALLOWED to run right now (boss rush, major-event
   * grace) is the caller's policy, not this method's — the cooldown is simply held while
   * game._majorEventBlocked() is true, exactly as the old inline timer did.
   */
  canStart() {
    if (this._phase !== 'idle') return false;               // max one concurrent event
    const g = this.game;
    if (!g || !g.player) return false;
    if ((g.timeAlive || 0) < this._minRuntime()) return false;
    return this._cdLeft <= 0;
  }

  /** Begin the warning phase. Returns true only if the event actually started. */
  requestStart() {
    if (!this.canStart()) return false;
    this._enterPhase('warning', WARNING_S);
    this._warned = false;
    this._startedCount++;
    this._syncCamera(true);
    return true;
  }

  /** Immediate clean stop with full cleanup. Safe to call at any time, including from idle. */
  forceEnd() {
    this._phase    = 'idle';
    this._phaseT   = 0;
    this._phaseLen = 0;
    this._warned   = false;
    this._purgeAccum = 0;
    this._puddleCd   = 0;
    this.streaks.length = 0;
    this._releaseAll();
    this._cdLeft = this._rollCooldown();
  }

  /**
   * The player changed deck. Every world-space object belongs to the deck it was created on, and
   * that deck is now off screen and unreachable, so all of it is dropped. The event keeps running:
   * new drops, impacts and puddles are generated on the NEW deck from the next frame, because the
   * rain field itself is camera-relative and the puddle placement re-validates against the new
   * walk mode.
   */
  onDeckChanged() {
    this.streaks.length = 0;
    this._releaseAll();
    this._impactBudget = MAX_IMPACTS_PER_SEC;
    this._puddleCd     = PUDDLE_SPAWN_CD;
    this._syncCamera(true);
  }

  /** Plain snapshot for QA overlays and regression harnesses. No live references escape. */
  stats() {
    return {
      phase:             this._phase,
      timeLeft:          Math.max(0, this._phaseLen - this._phaseT),
      streaks:           this.streaks.length,
      impacts:           this.impacts.length,
      puddles:           this.puddles.length,
      particles:         this.particles.length,
      puddleDamageTicks: this._puddleDamageTicks,
      warningsShown:     this._warningsShown,
      startedCount:      this._startedCount,
      nextEligibleIn:    this._nextEligibleIn(),
    };
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────

  update(dt) {
    const g = this.game;
    if (!g || !g.player || !Number.isFinite(dt) || dt <= 0) return;

    // A long stall (tab switch, a heavy level-up panel) must not deliver a full second of puddle
    // damage or a burst of impacts in one frame. Everything below runs on this clamped step.
    const step = Math.min(dt, 0.1);

    if (this._phase === 'idle') {
      // Hold the timer just above zero while a major event owns the screen instead of letting it
      // run down and stack a burst the moment the block lifts. Same policy as _holdMajorTimer.
      if (this._blocked()) { this._cdLeft = Math.max(this._cdLeft, 6); return; }
      if (this._cdLeft > 0) this._cdLeft = Math.max(0, this._cdLeft - step);
      return;
    }

    this._trackWorldShift();

    this._phaseT += step;

    if (this._phase === 'warning') {
      // Exactly once per event. The flag is the guard, not the timer, so a frame at 0 dt or a
      // re-entrant update cannot fire a second announcement.
      if (!this._warned) {
        this._warned = true;
        this._warningsShown++;
        try { g.triggerAnnouncement('INCOMING ACID RAIN', GREEN); } catch (_) {}
        try { g.audio?.playEventWarning?.(); } catch (_) {}
      }
      if (this._phaseT >= this._phaseLen) {
        this._enterPhase('raining', RAIN_S);
        this._onRainStart();
      }
    } else if (this._phase === 'raining') {
      this._tickPurge(step);
      if (this._phaseT >= this._phaseLen) this._enterPhase('fading', FADE_S);
    } else if (this._phase === 'fading') {
      if (this._phaseT >= this._phaseLen) {
        // End of the event. Nothing survives it: the last puddles, impacts and particles go with
        // it even if their own lifetimes had not expired.
        this._phase = 'idle';
        this._phaseT = 0;
        this._phaseLen = 0;
        this.streaks.length = 0;
        this._releaseAll();
        this._cdLeft = this._rollCooldown();
        return;
      }
    }

    const intensity = this._intensity();
    this._tickStreaks(step, intensity);
    this._tickImpacts(step);
    this._tickParticles(step);
    this._tickPuddles(step);
  }

  // ── DRAW (world space; the caller has already applied the camera transform) ──

  draw(ctx) {
    if (!ctx || this._phase === 'idle') return;
    const g = this.game;
    const cam = g?.camera;
    if (!cam) return;
    const vw = g._viewW || 1280;
    const vh = g._viewH || 720;
    const intensity = this._intensity();

    ctx.save();
    try {
      // Ground layer first, sky last, so streaks read as falling in front of the floor wash.
      this._drawPuddles(ctx);
      this._drawImpacts(ctx);
      this._drawParticles(ctx);
      this._drawStreaks(ctx, cam, intensity);
      this._drawHaze(ctx, cam, vw, vh, intensity);
    } catch (_) {
      // A thrown draw must never leave the shared context dirty for the next system in the frame.
      // The explicit resets below plus the restore() guarantee that whatever happened above,
      // alpha, composite mode, shadow and line width are back to their defaults.
    } finally {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1;
      ctx.restore();
    }
  }

  // ── LIFECYCLE HELPERS ─────────────────────────────────────────────────────

  _enterPhase(name, len) {
    this._phase    = name;
    this._phaseT   = 0;
    this._phaseLen = len;
  }

  _onRainStart() {
    const g = this.game;
    this._purgeAccum = 0;
    this._puddleCd   = 0;
    try { g.audio?.playAcidRain?.(); } catch (_) {}   // file SFX — throttled 4 s inside AudioManager
    // World-space text pinned to the PLAYER. A fixed screen-centre point is a world coordinate
    // near the origin and is invisible from anywhere else on the Endless map.
    try {
      g.floatingTexts?.push(
        new FloatingText('TOXIC RAIN PURGE',
          new Vec2(g.player.pos.x - 90, g.player.pos.y - 70), GREEN, 2.5)
      );
    } catch (_) {}
  }

  _minRuntime() {
    const g = this.game;
    if (g._chaosMode) return MIN_RUNTIME_CHAOS;
    if (g.endless)    return MIN_RUNTIME_ENDLESS;
    return MIN_RUNTIME_DEFAULT;
  }

  _rollCooldown() {
    const g = this.game;
    const base = !g ? COOLDOWN_DEFAULT
      : g._chaosMode ? COOLDOWN_CHAOS
      : g.endless    ? COOLDOWN_ENDLESS
      : COOLDOWN_DEFAULT;
    return base * (1 + (srand() * 2 - 1) * COOLDOWN_JITTER);
  }

  _blocked() {
    try { return !!this.game._majorEventBlocked?.(); } catch (_) { return false; }
  }

  _nextEligibleIn() {
    if (this._phase !== 'idle') return 0;
    const g = this.game;
    const runtimeGap = Math.max(0, this._minRuntime() - (g?.timeAlive || 0));
    return Math.max(this._cdLeft, runtimeGap);
  }

  /**
   * Storm intensity 0..1. Ramps in over the first 1.2 s of rain and drains across the whole fade,
   * so the downpour arrives and leaves instead of snapping on and off. The warning phase already
   * shows a thin leading drizzle at 25%, which is the visual half of the three-second warning.
   */
  _intensity() {
    if (this._phase === 'warning') {
      return 0.25 * Math.min(1, this._phaseT / Math.max(0.001, this._phaseLen));
    }
    if (this._phase === 'raining') {
      return Math.min(1, 0.25 + this._phaseT / 1.2);
    }
    if (this._phase === 'fading') {
      return Math.max(0, 1 - this._phaseT / Math.max(0.001, this._phaseLen));
    }
    return 0;
  }

  // ── WORLD SHIFT / DECK SAFETY ─────────────────────────────────────────────

  _syncCamera(force) {
    const cam = this.game?.camera;
    if (!cam) return;
    if (force || this._lastCamX === null) { this._lastCamX = cam.x; this._lastCamY = cam.y; }
  }

  /**
   * Backstop for the two ways world coordinates can move underneath us in one frame.
   * A horizontal jump of a mirror period is the Endless rebase: everything world-space is shifted
   * by the same delta and the puddles are re-validated, so they stay under the art they were on.
   * A vertical jump that large can only be a deck teleport, and a puddle from another deck is
   * meaningless, so that path drops everything.
   */
  _trackWorldShift() {
    const cam = this.game?.camera;
    if (!cam) return;
    if (this._lastCamX === null) { this._lastCamX = cam.x; this._lastCamY = cam.y; return; }
    const dx = cam.x - this._lastCamX;
    const dy = cam.y - this._lastCamY;
    this._lastCamX = cam.x;
    this._lastCamY = cam.y;

    if (Math.abs(dy) > DECK_JUMP_PX) { this.onDeckChanged(); return; }
    if (Math.abs(dx) <= REBASE_JUMP_PX) return;

    for (const p of this.puddles)   p.x += dx;
    for (const im of this.impacts)  im.x += dx;
    for (const pa of this.particles) pa.x += dx;
    // The shifted puddles must still be on real floor: the rebase is exact for the tiled art but
    // authored obstacle columns are not guaranteed to line up, so anything that no longer passes
    // the footprint test is dropped rather than left floating over a wall.
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      if (!this._isFloor(this.puddles[i].x, this.puddles[i].y, this.puddles[i].r * 0.5)) {
        this.puddles.splice(i, 1);
      }
    }
  }

  // ── ENEMY PURGE (ported from the old _updateAcidRain, behaviour unchanged) ──

  _tickPurge(dt) {
    const g = this.game;
    this._purgeAccum += dt;

    // Purge tick once per second. No per-hit floating numbers or sounds (that would be spam) —
    // lethal hits route through _die for correct kill / score / XP attribution.
    if (this._purgeAccum < 1.0) return;
    this._purgeAccum -= 1.0;

    // Enemies in the main array (reverse index so _die can splice safely)
    const enemies = g.enemies;
    if (Array.isArray(enemies)) {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (!e) continue;
        const dmg = e.isMegaBoss ? ACID_DPS * MAIN_VULN
                  : e.isBoss()   ? ACID_DPS * MINI_VULN
                  : ACID_DPS;
        e.hp -= dmg;
        if (e.hp <= 0) { e.hp = 0; e._die(g); }
      }
    }

    // Separate mini-boss objects take strong-but-survivable chip (killable over time)
    for (const b of [g.titanBoss, g.annihilatorBoss, g.bloodfangBoss, g.cyberSerpentBoss, g.cyberDragonBoss]) {
      if (b && b.hp > 0) b.hp = Math.max(0, b.hp - ACID_DPS * MINI_VULN);
    }
    if (g.doubleDemonsBoss && g.doubleDemonsBoss.hp > 0)
      g.doubleDemonsBoss.hp = Math.max(0, g.doubleDemonsBoss.hp - ACID_DPS * MAIN_VULN);
    if (g.titanBoss && g.titanBoss.hp <= 0)                 g._titanDie();
    if (g.annihilatorBoss && g.annihilatorBoss.hp <= 0)     g._annihilatorDie();
    if (g.bloodfangBoss && g.bloodfangBoss.hp <= 0)         g._bloodfangDie();
    if (g.cyberSerpentBoss && g.cyberSerpentBoss.hp <= 0)   g._cyberSerpentDie();
    if (g.cyberDragonBoss && g.cyberDragonBoss.hp <= 0)     g._cyberDragonDie();
    if (g.doubleDemonsBoss && g.doubleDemonsBoss.hp <= 0)   g._doubleDemonsDie();
  }

  // ── RAIN FIELD (camera space) ─────────────────────────────────────────────

  _tickStreaks(dt, intensity) {
    const g = this.game;
    const vw = g._viewW || 1280;
    const vh = g._viewH || 720;
    const want = Math.min(MAX_STREAKS, Math.round(MAX_STREAKS * intensity));

    // Grow towards the target a bounded amount per frame so a sudden intensity change cannot
    // allocate the whole field in one step.
    if (this.streaks.length > want) this.streaks.length = want;
    const add = Math.min(want - this.streaks.length, 12);
    for (let i = 0; i < add; i++) this.streaks.push(this._makeStreak(vw, vh, true));

    // The field is drawn with a margin on both sides because the sideways drift carries streaks
    // off the left edge; spawning them past the right edge keeps the coverage even.
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];
      const L = LAYERS[s.layer];
      s.sy += L.spd * dt;
      s.sx += WIND_X * dt;

      if (s.sy >= s.landY) {
        if (L.lands) this._spawnImpact(s.sx, s.landY, s.seed);
        this._respawnStreak(s, vw, vh);
      } else if (s.sx < -180) {
        this._respawnStreak(s, vw, vh);
      }
    }
  }

  _makeStreak(vw, vh, scatter) {
    const layer = srand() < 0.34 ? 2 : (srand() < 0.5 ? 1 : 0);
    const s = {
      sx: srange(-120, vw + 260),
      sy: scatter ? srange(-vh * 0.4, vh) : srange(-260, -20),
      layer,
      // Streaks stop at a randomised ground line rather than the bottom of the view, which is what
      // gives the rain depth: near drops land low, far drops land high.
      landY: srange(vh * 0.22, vh * 0.99),
      seed: srand() * 1000,
    };
    if (s.sy >= s.landY) s.sy = s.landY - 40;
    return s;
  }

  _respawnStreak(s, vw, vh) {
    s.sx    = srange(-120, vw + 260);
    s.sy    = srange(-300, -20);
    s.layer = srand() < 0.34 ? 2 : (srand() < 0.5 ? 1 : 0);
    s.landY = srange(vh * 0.22, vh * 0.99);
    s.seed  = srand() * 1000;
  }

  // ── IMPACTS ───────────────────────────────────────────────────────────────

  _spawnImpact(sx, sy, seed) {
    if (this._impactBudget < 1) return;         // rate limited, frame-rate independent
    if (this.impacts.length >= MAX_IMPACTS) return;
    this._impactBudget -= 1;

    const cam = this.game.camera;
    const wx = cam.x + sx;
    const wy = cam.y + sy;

    const im = this._impactPool.pop() || { x: 0, y: 0, t: 0, life: 0, r: 0, seed: 0 };
    im.x = wx; im.y = wy; im.t = 0;
    im.life = 0.32;
    im.r = srange(9, 17);
    im.seed = seed;
    this.impacts.push(im);

    // Small procedural acid burst. Directions are fixed fractions of a circle biased upward, so
    // the burst always reads as a splash rather than an explosion.
    for (let i = 0; i < PARTICLES_PER_IMPACT; i++) {
      const a = -Math.PI * 0.5 + (i / PARTICLES_PER_IMPACT - 0.5) * Math.PI * 1.5 + srange(-0.25, 0.25);
      const sp = srange(45, 130);
      this._spawnParticle(wx, wy, Math.cos(a) * sp, Math.sin(a) * sp, srange(1.2, 2.6), srange(0.3, 0.55));
    }

    // A fraction of impacts leave a puddle. Placement is validated below; a refusal costs nothing.
    if (this._phase === 'raining'
        && this._puddleCd <= 0
        && this._phaseT < this._phaseLen - PUDDLE_STOP_LEAD
        && this.puddles.length < MAX_PUDDLES
        && srand() < PUDDLE_CHANCE) {
      this._tryPlacePuddle(wx, wy);
    }
  }

  _tickImpacts(dt) {
    // Refill the impact budget on real time, capped at one second's worth so a stall cannot bank
    // a burst that all fires on the recovery frame.
    this._impactBudget = Math.min(MAX_IMPACTS_PER_SEC, this._impactBudget + MAX_IMPACTS_PER_SEC * dt);

    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const im = this.impacts[i];
      im.t += dt;
      if (im.t >= im.life) {
        this.impacts.splice(i, 1);
        if (this._impactPool.length < MAX_IMPACTS) this._impactPool.push(im);
      }
    }
  }

  // ── PARTICLES ─────────────────────────────────────────────────────────────

  _spawnParticle(x, y, vx, vy, r, life) {
    let p;
    if (this.particles.length >= MAX_PARTICLES) {
      // At the cap the oldest particle is recycled in place. This is the same policy the shared
      // ParticleSystem uses and it means the array length is a true hard ceiling.
      p = this.particles.shift();
    } else {
      p = this._particlePool.pop() || { x: 0, y: 0, vx: 0, vy: 0, r: 0, t: 0, life: 0, seed: 0 };
    }
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.r = r; p.t = 0; p.life = life; p.seed = srand() * 1000;
    this.particles.push(p);
  }

  _tickParticles(dt) {
    const GRAV = 420;   // px/s2, so the burst arcs back down instead of drifting away
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.particles.splice(i, 1);
        if (this._particlePool.length < MAX_PARTICLES) this._particlePool.push(p);
        continue;
      }
      p.vy += GRAV * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // ── PUDDLES ───────────────────────────────────────────────────────────────

  /** True when a circle of the given radius sits entirely on real floor of the ACTIVE deck. */
  _isFloor(x, y, r) {
    const g = this.game;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const mode = g._walkMode?.();
    if (mode && g.mapManager?.isWalkableFootprint) {
      // The mode string carries the deck ('chaos:upper'), so this single call is also the
      // active-deck test: a point on another deck fails the deck rect inside MapManager.
      return g.mapManager.isWalkableFootprint(x, y, r, mode);
    }
    // Act 1 / campaign are not obstacle-constrained, so the deck rectangle is the whole truth.
    const b = g.getWalkableBounds?.();
    if (!b) return true;
    return x - r >= b.x0 && x + r <= b.x1 && y - r >= b.y0 && y + r <= b.y1;
  }

  _tryPlacePuddle(x, y) {
    const r = srange(PUDDLE_R_MIN, PUDDLE_R_MAX);

    // Spacing first — it is the cheap test and it rejects most candidates during heavy rain.
    for (const p of this.puddles) {
      const dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy < PUDDLE_MIN_GAP * PUDDLE_MIN_GAP) return;
    }

    // Validated with HALF the visual radius: the acid pool is a decal on the floor, so its rim is
    // allowed to lap over a wall edge while its damaging core is guaranteed to be on real floor.
    // Puddles never block movement — nothing in this module writes to the walk mask or resolver.
    if (!this._isFloor(x, y, r * 0.5)) return;

    this.puddles.push({
      x, y, r,
      t: 0,
      life: PUDDLE_LIFE,
      dmgCd: PUDDLE_ARM_S,        // cannot damage before the fade-in completes
      seed: srand() * 1000,
      bubbleT: 0,
    });
    this._puddleCd = PUDDLE_SPAWN_CD;
  }

  _tickPuddles(dt) {
    const g = this.game;
    if (this._puddleCd > 0) this._puddleCd = Math.max(0, this._puddleCd - dt);

    const px = g.player?.pos?.x;
    const py = g.player?.pos?.y;
    const hasPlayer = Number.isFinite(px) && Number.isFinite(py);

    // Only ONE puddle is allowed to land damage in a single frame. _damagePlayer already applies a
    // 0.5 s hit grace, so overlapping puddles could not stack anyway, but making it explicit means
    // the cadence is readable from this file alone and cannot drift if that grace ever changes.
    let dealtThisFrame = false;

    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.t += dt;
      p.bubbleT += dt;
      if (p.t >= p.life) { this.puddles.splice(i, 1); continue; }

      if (p.dmgCd > 0) p.dmgCd = Math.max(0, p.dmgCd - dt);
      if (!hasPlayer || dealtThisFrame) continue;
      if (p.t < PUDDLE_ARM_S) continue;                       // still fading in, not yet armed
      if (p.t > p.life - PUDDLE_FADE_OUT * 0.5) continue;     // visibly draining, stops biting first
      if (p.dmgCd > 0) continue;

      const dx = px - p.x, dy = py - p.y;
      // The player has to be genuinely standing in it: the test uses the puddle radius reduced by
      // most of the player footprint, so brushing the rim does not count.
      const hitR = p.r - PLAYER_RADIUS * 0.5;
      if (dx * dx + dy * dy > hitR * hitR) continue;

      const landed = g._damagePlayer(PUDDLE_DMG, {
        color: ACID_MID,
        shake: 3,
        src: 'acidPuddle',
      });
      // A refused hit (dash i-frames, the shared hit grace) re-arms sooner so dashing through
      // shortens the exposure instead of granting a free full second.
      p.dmgCd = landed ? PUDDLE_DMG_CD : PUDDLE_MISS_CD;
      if (landed) { this._puddleDamageTicks++; dealtThisFrame = true; }
    }
  }

  // ── CLEANUP ───────────────────────────────────────────────────────────────

  _releaseAll() {
    for (const im of this.impacts) {
      if (this._impactPool.length < MAX_IMPACTS) this._impactPool.push(im);
    }
    for (const p of this.particles) {
      if (this._particlePool.length < MAX_PARTICLES) this._particlePool.push(p);
    }
    this.impacts.length   = 0;
    this.particles.length = 0;
    this.puddles.length   = 0;
  }

  // ── DRAW HELPERS (no randomness: every wobble is hash01 of a stored seed) ──

  _drawStreaks(ctx, cam, intensity) {
    if (!this.streaks.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];
      const L = LAYERS[s.layer];
      const x = cam.x + s.sx;
      const y = cam.y + s.sy;
      // The tail trails along the actual velocity vector so the tilt and the drift agree.
      const tx = x - (WIND_X / L.spd) * L.len;
      const ty = y - L.len;
      // A per-streak brightness jitter keeps the sheet from looking like a printed pattern.
      const jitter = 0.75 + hash01(s.seed, 3) * 0.5;
      ctx.globalAlpha = Math.min(1, L.alpha * intensity * jitter);
      ctx.strokeStyle = s.layer === 2 ? ACID_CORE : (s.layer === 1 ? ACID_MID : ACID_DEEP);
      ctx.lineWidth = L.w;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    ctx.restore();
  }

  _drawImpacts(ctx) {
    if (!this.impacts.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.impacts.length; i++) {
      const im = this.impacts[i];
      const k = im.t / im.life;                 // 0..1
      const a = (1 - k) * 0.8;
      const rr = im.r * (0.35 + k * 1.4);

      // Expanding splash ring, flattened vertically so it reads as lying on the ground.
      ctx.globalAlpha = a;
      ctx.strokeStyle = ACID_CORE;
      ctx.lineWidth = 1.6 * (1 - k) + 0.4;
      ctx.beginPath();
      ctx.ellipse(im.x, im.y, rr, rr * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Three short crown spikes flicked out of the ring, angles taken from the stored seed.
      ctx.globalAlpha = a * 0.75;
      ctx.strokeStyle = ACID_MID;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        const ang = -Math.PI * 0.5 + (hash01(im.seed, j + 11) - 0.5) * 2.4;
        const h = im.r * (0.5 + hash01(im.seed, j + 21) * 0.8) * (1 - k);
        ctx.moveTo(im.x, im.y);
        ctx.lineTo(im.x + Math.cos(ang) * h, im.y + Math.sin(ang) * h * 0.9);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    ctx.restore();
  }

  _drawParticles(ctx) {
    if (!this.particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = ACID_MID;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = Math.max(0, k) * 0.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.6, p.r * k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  _drawPuddles(ctx) {
    if (!this.puddles.length) return;
    ctx.save();
    for (let i = 0; i < this.puddles.length; i++) {
      const p = this.puddles[i];
      // Fade in while arming and fade out while draining, so the damaging window is exactly the
      // window in which the puddle is drawn at full strength. The player can read the danger.
      const inK  = Math.min(1, p.t / PUDDLE_ARM_S);
      const outK = Math.min(1, Math.max(0, (p.life - p.t) / PUDDLE_FADE_OUT));
      const a = inK * outK;
      if (a <= 0.01) continue;

      // Ground pool: a radial gradient squashed on Y. The transform is set and cleared per puddle
      // inside this single save/restore pair, so no scale leaks into the next puddle.
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1, 0.5);
      const g0 = ctx.createRadialGradient(0, 0, p.r * 0.12, 0, 0, p.r);
      g0.addColorStop(0.00, 'rgba(190,255,150,0.55)');
      g0.addColorStop(0.45, 'rgba(125,255,79,0.36)');
      g0.addColorStop(1.00, 'rgba(18,61,22,0.00)');
      ctx.globalAlpha = a;
      ctx.fillStyle = g0;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fill();

      // Corroded rim. A wobbling closed path built from the stored seed, so the outline is
      // organic but identical every time this frame is drawn.
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = ACID_MID;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const SEG = 14;
      for (let j = 0; j <= SEG; j++) {
        const th = (j / SEG) * Math.PI * 2;
        const wob = 0.86 + hash01(p.seed, j) * 0.24;
        const rx = Math.cos(th) * p.r * wob;
        const ry = Math.sin(th) * p.r * wob;
        if (j === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Bubbles. Their vertical offset cycles on p.bubbleT, which advances in update() only, so
      // the animation is driven by simulation time and never by how often draw is called.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = ACID_CORE;
      for (let j = 0; j < 5; j++) {
        const phase = (p.bubbleT * (0.6 + hash01(p.seed, j + 30) * 0.7) + hash01(p.seed, j + 40)) % 1;
        const bx = p.x + (hash01(p.seed, j + 50) - 0.5) * p.r * 1.3;
        const by = p.y + (hash01(p.seed, j + 60) - 0.5) * p.r * 0.5 - phase * 7;
        ctx.globalAlpha = a * (1 - phase) * 0.6;
        ctx.beginPath();
        ctx.arc(bx, by, 1.2 + hash01(p.seed, j + 70) * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    ctx.restore();
  }

  /**
   * Toxic atmosphere over the visible world rect. Deliberately weak (peak alpha 0.14 at the top,
   * fading to almost nothing at the bottom): the storm has to change the mood without hiding the
   * enemies, and the Chaos deck art is already very busy.
   */
  _drawHaze(ctx, cam, vw, vh, intensity) {
    if (intensity <= 0.01) return;
    ctx.save();
    const g0 = ctx.createLinearGradient(0, cam.y, 0, cam.y + vh);
    g0.addColorStop(0.0, 'rgba(70,190,60,0.16)');
    g0.addColorStop(0.5, 'rgba(40,140,50,0.07)');
    g0.addColorStop(1.0, 'rgba(18,61,22,0.02)');
    ctx.globalAlpha = intensity;
    ctx.fillStyle = g0;
    ctx.fillRect(cam.x, cam.y, vw, vh);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
