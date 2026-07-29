// ─── EnemyWeaponSystem.js ────────────────────────────────────────────────────
// TELEGRAPHED ENEMY STRIKES — the melee/ground half of the enemy weapon catalog for
// PHENIX: NULL EDEN.
//
// The catalog (EnemyWeaponCatalog.js) declares eleven behaviours. Nine of them already have a
// real implementation inside Game.js and this module deliberately does NOT touch them:
//
//   projectile / fast_projectile / heavy_projectile / piercing_projectile /
//   arc_projectile / boomerang / orb_explosion-as-a-thrown-orb   -> Game.spawnEnemyBullet
//   beam                                                          -> Game._spawnEnemyBeam
//   short_pulse                                                   -> Game._spawnEnemyNova
//
// What was missing is the set of shapes that are NOT projectiles at all — an enemy swinging a
// blade, a wave of force rolling along the floor, a rupture warned on the ground before it goes
// off. Those had a catalog entry, a sprite and a telegraphTime, and no code. This module owns
// exactly those four reads:
//
//   slash_arc            telegraphed cone centred on the enemy, then one sweep
//   slash_wave           telegraphed direction lock, then a crescent that rolls forward
//   orb_explosion        ONLY when the weapon declares no travel speed: a warned ground circle
//                        that detonates where it was placed (a thrown orb stays with Game.js)
//   piercing_projectile  the warning LINE only — the lance itself still comes from Game.js, so
//                        requestAttack() returns false for it and the caller fires as before
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE:
//   No strike may deal damage before its telegraph has fully elapsed. Every strike carries its
//   own timer and its own `armed` flag; the hit test is unreachable until `armed` is true, and
//   `armed` is set in exactly one place (_armStrike). A weapon that declares telegraphTime 0 is
//   floored to MIN_TELEGRAPH_S rather than allowed to hit on the spawn frame.
//
// Player damage goes through game._damagePlayer() and nowhere else. This file never writes
// player.hp, never writes any enemy field, and never mutates the weapon definition it is handed.
// Every field of the weapon def is read defensively (weapon?.x || fallback) because the catalog
// is still growing and a missing field must degrade, not crash.
// ────────────────────────────────────────────────────────────────────────────

import { PLAYER_RADIUS } from '../constants.js';

// Same detection as HostileProjectileDirector.js, verbatim: phones run the whole hostile budget
// at roughly half, and these pools are part of that budget.
const IS_MOBILE = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

// ─── HARD CAPS ──────────────────────────────────────────────────────────────
// Ceilings, not targets. Every push is preceded by a length check against these; nothing in this
// file grows an array per frame and nothing here ever allocates past the cap.

// Standalone warning lines (piercing lances). Purely visual, ~0.5 s each, so 12 is far above what
// the per-owner throttle below can deliver — it exists so a pathological frame cannot grow it.
const MAX_TELEGRAPHS = IS_MOBILE ? 6 : 12;

// Live damaging strikes (slash_arc + slash_wave). 16 concurrent swings is already an unreadable
// screen; the cap is what guarantees the hit-test loop stays O(small) regardless of horde size.
const MAX_STRIKES = IS_MOBILE ? 8 : 16;

// Ground detonation circles. Matches the cap Game._spawnEnemyOrbZone uses for its own zones so
// the two systems cannot together carpet the floor.
const MAX_ZONES = IS_MOBILE ? 5 : 10;

// Pending TELEGRAPHED VOLLEYS — a windup this module owns in front of a shot that Game.js still
// fires. Ten is deliberately below MAX_STRIKES: a volley resolves into a real hostile projectile,
// which then costs a director token of its own, so the two budgets multiply if this is generous.
const MAX_VOLLEYS = IS_MOBILE ? 5 : 10;

// ─── TIMING ─────────────────────────────────────────────────────────────────
// Floor on every telegraph this module owns. A catalog entry with telegraphTime 0 would otherwise
// arm on the frame it spawned, which is precisely the failure this module was written to prevent.
const MIN_TELEGRAPH_S = 0.25;

// Ceiling, so a mistyped catalog value cannot park a warning on screen for a quarter of a run.
const MAX_TELEGRAPH_S = 2.5;

const ARC_SWEEP_S   = 0.30;  // how long the blade takes to cross its cone
const ZONE_IMPACT_S = 0.35;  // visible detonation after a ground circle fires
const LINE_LIFE_S   = 0.5;   // standalone piercing warning line
const LINE_THROTTLE = 0.30;  // min seconds between two warning lines from the same owner

// A refused hit (dash i-frames, the shared 0.5 s grace inside _damagePlayer) re-arms quickly so
// dashing through a swing shortens the exposure instead of granting the whole strike for free.
const MISS_RETRY_S = 0.08;

// Longest a strike may live after arming, whatever its geometry says. Backstop only.
const MAX_ACTIVE_S = 1.6;

// ─── GEOMETRY DEFAULTS (used when the catalog entry omits the field) ────────
const DEF_ARC_RANGE   = 170;
const DEF_ARC_HALF    = 0.95;   // radians -> ~109 degree cone
const DEF_WAVE_RANGE  = 380;
const DEF_WAVE_SPEED  = 450;
const DEF_WAVE_HALF_W = 46;     // half of the crescent's lateral span
const DEF_WAVE_THICK  = 34;     // depth of the crescent along its travel axis
const DEF_ZONE_RADIUS = 70;
const DEF_LINE_LEN    = 620;

// Slash projectiles are slowed to 0.85x in Game.spawnEnemyBullet; the rolling wave uses the same
// factor so a blade wave reads at the same speed whichever path spawned it.
const SLASH_SPEED_MULT = 0.85;

// ─── PALETTE ────────────────────────────────────────────────────────────────
// One colour pair per read, so the player learns the shape from the colour before they learn it
// from the geometry. Deliberately disjoint hues; none of them is the cyan the player's own
// weapons use.
const PAL = {
  arc:   { c1: '#b06bff', c2: '#ecdcff' },   // violet scythe sweep
  wave:  { c1: '#ff4f9d', c2: '#ffdcec' },   // magenta blade wave
  zone:  { c1: '#6be4ff', c2: '#9d6bff' },   // matches Game's existing orb-zone language
  line:  { c1: '#ffb347', c2: '#fff0c4' },   // golden lance warning
};

// Behaviours this module claims. Anything else is refused by requestAttack so the caller falls
// back to the path that already handles it.
const OWNED = new Set(['slash_arc', 'slash_wave', 'orb_explosion', 'piercing_projectile']);

export class EnemyWeaponSystem {
  constructor(game) {
    this.game = game;

    // Four bounded pools. All world-space, all dropped wholesale on deck change / reset / teardown.
    this.telegraphs = [];   // warning-only, never damages
    this.strikes    = [];   // slash_arc + slash_wave
    this.zones      = [];   // ground detonation circles
    this.volleys    = [];   // windups in front of a shot that Game.js still fires

    this.reset();
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────

  /**
   * Hard clear for a new run. Every pool empty, every token handed back, every per-owner cooldown
   * forgotten, every counter zeroed.
   */
  reset() {
    this._releaseAll();

    // Simulation clock. Advanced ONLY in update(), so draw() consumes no wall-clock time and the
    // draw/update determinism regression cannot see this module.
    this._clock = 0;

    // Per-owner cooldowns. A WeakMap keyed by the enemy object: when the enemy is collected its
    // cooldown record goes with it, so a long run cannot accumulate dead keys. Entries store an
    // absolute ready-time against _clock plus the epoch they were written in — bumping the epoch
    // in reset()/forceEnd() invalidates every stored time without having to iterate a WeakMap.
    this._cooldowns = new WeakMap();
    this._epoch = (this._epoch || 0) + 1;

    // QA counters. Per-run, so they zero here and nowhere else.
    this._startedCount   = 0;
    this._damageEvents   = 0;
    this._refusedCd      = 0;
    this._refusedCap     = 0;
    this._refusedToken   = 0;
    this._droppedOwner   = 0;
    this._volleysFired    = 0;
    this._volleysCancelled = 0;
  }

  /** True while anything this module owns is on screen or pending. */
  active() {
    return (this.telegraphs.length + this.strikes.length + this.zones.length + this.volleys.length) > 0;
  }

  /**
   * Start an attack for `enemy` using `weaponDef`, aimed at `target`.
   *
   * Returns TRUE only when this module actually took ownership of the attack, i.e. a telegraphed
   * strike was pushed into one of the pools. It returns FALSE for everything else — an unowned
   * behaviour, a cooldown that has not expired, a full pool, a refused token, a bad position —
   * and a FALSE means the caller should keep doing whatever it did before. There is no queueing:
   * a refusal is final for this frame.
   *
   * `target` may be the player, an entity with .pos, or a plain {x,y}; it falls back to the
   * player's position when it cannot be resolved.
   */
  requestAttack(enemy, weaponDef, target) {
    const g = this.game;
    if (!g || !g.player || !weaponDef) return false;
    if (!this._ownerAlive(enemy)) return false;

    const behavior = weaponDef.behavior || weaponDef.type || null;
    if (!behavior || !OWNED.has(behavior)) return false;

    const origin = this._point(enemy.pos);
    if (!origin) return false;

    const aim = this._point(target) || this._point(g.player.pos);
    if (!aim) return false;

    const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
    if (!Number.isFinite(angle)) return false;

    // piercing_projectile: the lance is Game.spawnEnemyBullet's job and stays there. All this
    // module contributes is the warning line the catalog asks for ("warning line for boss
    // version"), which is cosmetic and carries no damage — so the answer to the caller is still
    // FALSE and the projectile is fired exactly as it was before this module existed.
    if (behavior === 'piercing_projectile') {
      this._tryWarningLine(enemy, weaponDef, origin, angle);
      return false;
    }

    // orb_explosion is ambiguous by design: the catalog uses it both for a slow thrown orb
    // (speed > 0 — Game.js flies it and detonates on impact) and for a rupture warned on the
    // ground. Only the second one is ours, and the discriminator is the declared travel speed,
    // so no existing catalog entry changes hands.
    if (behavior === 'orb_explosion' && !this._isGroundStrike(weaponDef)) return false;

    const key = this._weaponKey(weaponDef, behavior);
    if (!this._cooldownReady(enemy, key)) { this._refusedCd++; return false; }

    let started = false;
    if (behavior === 'slash_arc')        started = this._startSlashArc(enemy, weaponDef, origin, angle);
    else if (behavior === 'slash_wave')  started = this._startSlashWave(enemy, weaponDef, origin, angle);
    else if (behavior === 'orb_explosion') started = this._startGroundZone(enemy, weaponDef, origin, aim);

    // The cooldown is stamped only when the attack really began. A refusal (full pool, no token)
    // must not lock the enemy out of trying again next frame through some other path.
    if (started) {
      this._stampCooldown(enemy, key, this._num(weaponDef.cooldown, 2.5));
      this._startedCount++;
    }
    return started;
  }

  /**
   * TELEGRAPHED VOLLEY — a windup in front of a shot that this module does NOT fire.
   *
   * Four catalog weapons declare telegraphRequired:true and then route to Game.spawnEnemyBullet,
   * which has no windup at all: eden_star_lance (1.0 s), seraph_vector_javelin (0.4 s),
   * magma_reaver_lance (0.6 s) and the thrown null_rupture_orb (0.8 s). Their declared telegraph
   * therefore gated nothing. This method closes that gap WITHOUT moving the projectile: the caller
   * hands over the exact call it was about to make as `fireFn`, this module draws the warning for
   * the declared telegraphTime, and only then — from inside update(), never from here — invokes it.
   *
   * Returns TRUE when the volley was taken: the caller must NOT fire now, the callback will run.
   * Returns FALSE when declined (no positive telegraphTime, bad args, pool full, cooldown not
   * ready, non-finite geometry), and the caller fires immediately on its existing path exactly as
   * it does today. There is no queueing: a decline is final for this frame.
   *
   * The shape follows the behaviour: a warning LINE along the locked firing direction for the
   * lances and the heavy shell, a warning CIRCLE at the predicted landing point for a thrown orb.
   */
  requestTelegraphedVolley(enemy, weaponDef, target, fireFn) {
    const g = this.game;
    if (!g || typeof fireFn !== 'function' || !weaponDef) return false;
    if (!this._ownerAlive(enemy)) return false;

    // A weapon that declares no telegraph gets no windup invented for it. The clamp below still
    // applies a floor, but only to a telegraph the data actually asked for.
    const declared = Number(weaponDef.telegraphTime);
    if (!Number.isFinite(declared) || declared <= 0) return false;

    if (this.volleys.length >= MAX_VOLLEYS) { this._refusedCap++; return false; }

    const origin = this._point(enemy.pos);
    if (!origin) return false;
    const aim = this._point(target) || this._point(g?.player?.pos);
    if (!aim) return false;

    const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
    if (!Number.isFinite(angle)) return false;

    const behavior = weaponDef.behavior || weaponDef.type || null;
    // Same cooldown key requestAttack uses, against the same WeakMap, so a weapon cannot be fired
    // once through each path inside its own cooldown window.
    const key = this._weaponKey(weaponDef, behavior || 'volley');
    if (!this._cooldownReady(enemy, key)) { this._refusedCd++; return false; }

    // A thrown orb lands somewhere; a lance travels along a line. Anything else that declares a
    // circular impact is treated as a landing too, so a future catalog entry reads correctly
    // without another branch here.
    const isDrop = behavior === 'orb_explosion' || weaponDef.hitShape === 'circle_aoe';

    const v = {
      kind: 'volley',
      owner: enemy,
      shape: isDrop ? 'circle' : 'line',
      x: origin.x, y: origin.y, angle,
      tgT: 0, tgDur: this._telegraphDur(weaponDef),
      fired: false,
      fn: fireFn,
      pal: isDrop ? PAL.zone : PAL.line,
      seed: (this._startedCount * 41 + this.volleys.length * 19) % 997,
      radius: 0, len: 0,
    };

    if (isDrop) {
      // Predicted landing point: the aim point, clamped to the weapon's declared reach so a long
      // telegraph cannot warn a circle further away than the shot could ever travel.
      const reach = this._num(weaponDef.range, 560, 40, 1600);
      const dx = aim.x - origin.x, dy = aim.y - origin.y;
      const d = Math.hypot(dx, dy);
      v.x = (d > reach && d > 0.0001) ? origin.x + (dx / d) * reach : aim.x;
      v.y = (d > reach && d > 0.0001) ? origin.y + (dy / d) * reach : aim.y;
      v.radius = this._num(weaponDef.impactRadius, DEF_ZONE_RADIUS, 16, 320);
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return false;
    } else {
      v.len = this._num(weaponDef.range, DEF_LINE_LEN, 60, 1600);
    }

    this.volleys.push(v);
    this._stampCooldown(enemy, key, this._num(weaponDef.cooldown, 2.5));
    this._startedCount++;
    return true;
  }

  /**
   * The player changed deck. Everything here is world-space and belongs to the deck being left,
   * so all of it is dropped and every held token is returned. Cooldowns survive: the enemies that
   * own them do not cross decks either, and their records die with them.
   */
  onDeckChanged() {
    this._releaseAll();
  }

  /** Hard stop with full cleanup — teardown, return to menu, game over. Safe from any state. */
  forceEnd() {
    this._releaseAll();
    this._epoch++;                 // every stored cooldown time is now stale, i.e. ready
    this._cooldowns = new WeakMap();
  }

  /** Plain snapshot for QA overlays and regression harnesses. No live references escape. */
  stats() {
    return {
      telegraphs: this.telegraphs.length,
      strikes:    this.strikes.length,
      zones:      this.zones.length,
      volleys:    this.volleys.length,
      active:     this.active(),
      caps: { telegraphs: MAX_TELEGRAPHS, strikes: MAX_STRIKES, zones: MAX_ZONES, volleys: MAX_VOLLEYS },
      startedCount:  this._startedCount,
      damageEvents:  this._damageEvents,
      refusedCd:     this._refusedCd,
      refusedCap:    this._refusedCap,
      refusedToken:  this._refusedToken,
      droppedOwner:  this._droppedOwner,
      volleysFired:     this._volleysFired,
      volleysCancelled: this._volleysCancelled,
    };
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────

  update(dt) {
    const g = this.game;
    if (!g || !Number.isFinite(dt) || dt <= 0) return;

    // A long stall (tab switch, a level-up panel) must not skip a telegraph. Clamping the step
    // means a 2 s hitch advances the timers by 0.1 s, so the warning is still seen on resume.
    const step = Math.min(dt, 0.1);
    this._clock += step;

    this._tickTelegraphs(step);
    this._tickStrikes(step);
    this._tickZones(step);
    this._tickVolleys(step);
  }

  // ── DRAW (world space; the caller has already applied the camera transform) ──

  draw(ctx) {
    if (!ctx) return;
    if (!this.telegraphs.length && !this.strikes.length && !this.zones.length && !this.volleys.length) return;

    ctx.save?.();
    try {
      // Ground first, then body-height sweeps, then the thin warning lines on top, so a line is
      // never buried under a detonation flare.
      this._drawZones(ctx);
      this._drawStrikes(ctx);
      this._drawVolleys(ctx);
      this._drawTelegraphLines(ctx);
    } catch (_) {
      // A thrown draw must never leave the shared context dirty for the next system in the frame.
      // The explicit resets below plus restore() guarantee alpha, composite mode, dash pattern and
      // line width are back to their defaults whatever happened above.
    } finally {
      try {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 1;
        ctx.setLineDash?.([]);
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      } catch (_) {}
      ctx.restore?.();
    }
  }

  // ── ATTACK CONSTRUCTORS ───────────────────────────────────────────────────

  /**
   * SLASH ARC — a cone centred on the enemy. The cone follows the owner while it is warning (so
   * the player can read where the blade will land even as the enemy closes) and freezes at the
   * moment it arms, so the swing happens where the warning last showed it.
   *
   * Not projectile-like: nothing leaves the enemy, so it takes no hostile token.
   */
  _startSlashArc(enemy, wd, origin, angle) {
    if (this.strikes.length >= MAX_STRIKES) { this._refusedCap++; return false; }

    const radius = this._num(wd.range, DEF_ARC_RANGE, 20, 900);
    const half   = this._halfAngle(wd, DEF_ARC_HALF);

    this.strikes.push({
      kind: 'arc',
      owner: enemy,
      // Geometry
      x: origin.x, y: origin.y, angle, radius, half,
      // Telegraph — the single gate on damage.
      tgT: 0, tgDur: this._telegraphDur(wd), armed: false,
      // Active phase
      actT: 0, actDur: ARC_SWEEP_S,
      // Damage contract
      damage:  this._num(wd.damage, 12, 0, 200),
      maxHits: this._maxHits(wd),
      hits: 0, dmgCd: 0,
      // Visuals
      pal: PAL.arc,
      sprite: this._sprite(wd),
      seed: (this._startedCount * 37 + this.strikes.length * 11) % 997,
      tok: null,
    });
    return true;
  }

  /**
   * SLASH WAVE — the direction locks at the start of the telegraph, exactly like
   * Game._spawnEnemyBeam locks its angle, so the attack is dodgeable by moving off the line
   * rather than by out-running an aimbot. On arming, a crescent rolls forward from the origin.
   *
   * Projectile-like: something physically travels across the arena and occupies hostile screen
   * budget, so this one DOES take a token from the hostile projectile director and returns it the
   * moment the wave ends, however it ends.
   */
  _startSlashWave(enemy, wd, origin, angle) {
    if (this.strikes.length >= MAX_STRIKES) { this._refusedCap++; return false; }

    const cls = this._tokenClass(enemy);
    if (!this._takeToken(cls)) { this._refusedToken++; return false; }

    const range = this._num(wd.range, DEF_WAVE_RANGE, 40, 1400);
    const speed = this._num(wd.projectileSpeed ?? wd.speed, DEF_WAVE_SPEED, 60, 1400) * SLASH_SPEED_MULT;
    const halfW = this._num(wd.impactRadius, DEF_WAVE_HALF_W, 8, 220);

    this.strikes.push({
      kind: 'wave',
      owner: enemy,
      x: origin.x, y: origin.y, angle,
      range, speed, halfW, thick: DEF_WAVE_THICK,
      dist: 0,                                   // how far the crescent has rolled
      tgT: 0, tgDur: this._telegraphDur(wd), armed: false,
      actT: 0, actDur: Math.min(MAX_ACTIVE_S, range / speed),
      damage:  this._num(wd.damage, 14, 0, 200),
      maxHits: this._maxHits(wd),
      hits: 0, dmgCd: 0,
      pal: PAL.wave,
      sprite: this._sprite(wd),
      seed: (this._startedCount * 53 + this.strikes.length * 7) % 997,
      tok: cls,
    });
    return true;
  }

  /**
   * GROUND RUPTURE — a circle warned where the target stood and detonated in place. The position
   * is captured once and never follows anything: chasing the player with a "warned" circle is the
   * same as having no warning at all.
   *
   * Not projectile-like: it is a floor hazard, so no token.
   */
  _startGroundZone(enemy, wd, origin, aim) {
    if (this.zones.length >= MAX_ZONES) { this._refusedCap++; return false; }

    // Clamp the placement to the weapon's declared reach, so a long-range read cannot drop a
    // rupture on the far side of the map from an enemy that should have had to close in.
    const reach = this._num(wd.range, 460, 40, 1600);
    let px = aim.x, py = aim.y;
    const dx = px - origin.x, dy = py - origin.y;
    const d  = Math.hypot(dx, dy);
    if (d > reach && d > 0.0001) { px = origin.x + (dx / d) * reach; py = origin.y + (dy / d) * reach; }
    if (!Number.isFinite(px) || !Number.isFinite(py)) return false;

    this.zones.push({
      kind: 'zone',
      owner: enemy,
      x: px, y: py,
      radius: this._num(wd.impactRadius, DEF_ZONE_RADIUS, 16, 320),
      tgT: 0, tgDur: this._telegraphDur(wd), armed: false,
      actT: 0, actDur: ZONE_IMPACT_S,
      damage:  this._num(wd.damage, 18, 0, 200),
      maxHits: this._maxHits(wd),
      hits: 0, dmgCd: 0,
      pal: PAL.zone,
      sprite: this._sprite(wd),
      seed: (this._startedCount * 29 + this.zones.length * 13) % 997,
      tok: null,
    });
    return true;
  }

  /**
   * PIERCING WARNING LINE — cosmetic only. It never damages, never holds a token and never blocks
   * the caller; its whole job is to give the player the half second of read the catalog promises
   * before a lance crosses the screen. Throttled per owner so a burst weapon cannot stack lines.
   */
  _tryWarningLine(enemy, wd, origin, angle) {
    if (this.telegraphs.length >= MAX_TELEGRAPHS) { this._refusedCap++; return false; }
    const key = this._weaponKey(wd, 'line') + ':line';
    if (!this._cooldownReady(enemy, key)) return false;
    this._stampCooldown(enemy, key, LINE_THROTTLE);

    this.telegraphs.push({
      kind: 'line',
      owner: enemy,
      x: origin.x, y: origin.y, angle,
      len: this._num(wd.range, DEF_LINE_LEN, 60, 1600),
      t: 0,
      life: Math.min(LINE_LIFE_S, Math.max(0.2, this._num(wd.telegraphTime, LINE_LIFE_S, 0, MAX_TELEGRAPH_S))),
      pal: PAL.line,
      seed: (this._startedCount * 17 + this.telegraphs.length * 5) % 997,
    });
    return true;
  }

  // ── TICKS ─────────────────────────────────────────────────────────────────

  _tickTelegraphs(dt) {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const tg = this.telegraphs[i];
      tg.t += dt;
      // Warning lines belong to the shot their owner was about to take: if the owner dies the
      // shot never happens and the line is a lie, so it goes with them.
      if (tg.t >= tg.life || !this._ownerAlive(tg.owner)) {
        this.telegraphs.splice(i, 1);
      }
    }
  }

  _tickStrikes(dt) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];

      if (!this._ownerAlive(s.owner)) { this._dropStrike(i); this._droppedOwner++; continue; }

      if (!s.armed) {
        // ── TELEGRAPH PHASE. No damage code is reachable from here. ──
        s.tgT += dt;
        // The arc keeps its origin pinned to the owner while warning; the wave does not, because
        // its whole read is "this line, right here" and a drifting line is unreadable.
        if (s.kind === 'arc') {
          const p = this._point(s.owner.pos);
          if (p) { s.x = p.x; s.y = p.y; }
        }
        if (s.tgT >= s.tgDur) this._armStrike(s);
        continue;
      }

      // ── ACTIVE PHASE ──
      s.actT += dt;
      if (s.dmgCd > 0) s.dmgCd = Math.max(0, s.dmgCd - dt);

      if (s.kind === 'wave') {
        s.dist += s.speed * dt;
        if (!Number.isFinite(s.dist)) { this._dropStrike(i); continue; }
      }

      if (s.hits < s.maxHits && s.dmgCd <= 0) {
        if (s.kind === 'arc') this._hitArc(s);
        else                  this._hitWave(s);
      }

      if (s.actT >= s.actDur || s.actT >= MAX_ACTIVE_S) this._dropStrike(i);
    }
  }

  _tickZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];

      // A rupture that was warned but whose caster died before it went off is cancelled — the
      // same policy Game._updateEnemyBeams applies to a beam whose source dies mid-telegraph.
      if (!z.armed && !this._ownerAlive(z.owner)) { this._dropZone(i); this._droppedOwner++; continue; }

      if (!z.armed) {
        z.tgT += dt;
        if (z.tgT >= z.tgDur) this._armStrike(z);
        continue;
      }

      z.actT += dt;
      if (z.dmgCd > 0) z.dmgCd = Math.max(0, z.dmgCd - dt);
      if (z.hits < z.maxHits && z.dmgCd <= 0) this._hitZone(z);
      if (z.actT >= z.actDur) this._dropZone(i);
    }
  }

  /**
   * Pending volleys. The callback is invoked from HERE and nowhere else, at most once, and only
   * after the full telegraph has elapsed — the same gate the damaging strikes use, applied to a
   * shot this module does not own.
   *
   * A volley whose owner died, was retired or was removed is CANCELLED: the enemy that was winding
   * up no longer exists, so the shot it was about to take must not appear out of nothing. Same
   * policy as a beam whose source dies mid-telegraph.
   */
  _tickVolleys(dt) {
    for (let i = this.volleys.length - 1; i >= 0; i--) {
      const v = this.volleys[i];

      if (!this._ownerAlive(v.owner)) {
        this.volleys.splice(i, 1);
        v.fn = null;                              // the callback can never run after this point
        this._droppedOwner++;
        this._volleysCancelled++;
        continue;
      }

      // The muzzle follows the owner while it winds up, so the warning stays attached to the
      // enemy the player is reading. The DIRECTION stays locked at request time — that is what
      // makes the shot dodgeable rather than an aimbot with a countdown.
      const p = this._point(v.owner.pos);
      if (p) {
        if (v.shape === 'line') { v.x = p.x; v.y = p.y; }
      }

      v.tgT += dt;
      if (v.tgT < v.tgDur) continue;

      // Telegraph fully elapsed: fire exactly once, then retire the volley whatever happens.
      const fn = v.fn;
      v.fired = true;
      v.fn = null;
      this.volleys.splice(i, 1);
      if (typeof fn !== 'function') continue;
      try {
        fn();
        this._volleysFired++;
      } catch (_) {
        // A throwing callback is the caller's problem, not this pool's: the volley is already out
        // of the array, so the loop continues with a consistent pool and nothing is retried.
      }
    }
  }

  /**
   * THE ONLY PLACE `armed` IS EVER SET TO TRUE. Keeping this in one method is what makes the
   * "no damage before the telegraph" rule auditable: grep for `armed = true` and there is exactly
   * one hit, guarded by exactly one comparison.
   */
  _armStrike(s) {
    s.armed = true;
    s.actT  = 0;
    s.dmgCd = 0;
    // The wave starts rolling from wherever its telegraph was drawn, not from the owner's current
    // position, so the locked line the player read is the line that is honoured.
    if (s.kind === 'wave') s.dist = 0;
  }

  // ── HIT TESTS (unreachable while !armed) ──────────────────────────────────

  _hitArc(s) {
    const p = this._playerPoint();
    if (!p) return;
    const dx = p.x - s.x, dy = p.y - s.y;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist)) return;
    if (dist > s.radius + PLAYER_RADIUS) return;

    // Inside the cone: shortest signed angular distance to the locked facing.
    const da = this._angleDelta(Math.atan2(dy, dx), s.angle);
    // The player's body has width, so the cone is widened by the angle their radius subtends at
    // this distance — brushing the very edge of a swing counts, which is what the drawn shape
    // promises.
    const pad = dist > 1 ? Math.min(0.6, PLAYER_RADIUS / dist) : 0.6;
    if (Math.abs(da) > s.half + pad) return;

    this._applyDamage(s);
  }

  _hitWave(s) {
    const p = this._playerPoint();
    if (!p) return;
    const ux = Math.cos(s.angle), uy = Math.sin(s.angle);
    const dx = p.x - s.x, dy = p.y - s.y;
    const along = dx * ux + dy * uy;              // distance along the travel axis
    const lat   = Math.abs(-dx * uy + dy * ux);   // lateral offset from the axis
    if (!Number.isFinite(along) || !Number.isFinite(lat)) return;
    if (lat > s.halfW + PLAYER_RADIUS) return;
    if (Math.abs(along - s.dist) > s.thick * 0.5 + PLAYER_RADIUS) return;

    this._applyDamage(s);
  }

  _hitZone(z) {
    const p = this._playerPoint();
    if (!p) return;
    const d = Math.hypot(p.x - z.x, p.y - z.y);
    if (!Number.isFinite(d) || d > z.radius + PLAYER_RADIUS) return;

    this._applyDamage(z);
  }

  /**
   * The single damage funnel. Every strike shape lands here and nowhere else, so the damage-once
   * guard, the declared-damage contract and the routing through the fairness gate are all stated
   * once. `hits` only advances on a hit that was really applied: a hit refused by dash i-frames
   * or the shared grace is not spent, it is retried shortly.
   */
  _applyDamage(s) {
    if (!s.armed) return;                       // belt and braces: unreachable, and stays that way
    if (s.hits >= s.maxHits) return;
    const g = this.game;
    if (!g || typeof g._damagePlayer !== 'function') return;

    const dmg = s.damage;
    if (!Number.isFinite(dmg) || dmg <= 0) { s.hits = s.maxHits; return; }

    let landed = false;
    try {
      landed = !!g._damagePlayer(dmg, {
        color: s.pal.c1,
        shake: s.kind === 'zone' ? 6 : 5,
        src: 'enemyWeapon',
      });
    } catch (_) { landed = false; }

    if (landed) { s.hits++; this._damageEvents++; s.dmgCd = 0.5; }
    else        { s.dmgCd = MISS_RETRY_S; }
  }

  // ── POOL REMOVAL (every exit path returns the token) ──────────────────────

  _dropStrike(i) {
    const s = this.strikes[i];
    if (s) this._giveBackToken(s);
    this.strikes.splice(i, 1);
  }

  _dropZone(i) {
    const z = this.zones[i];
    if (z) this._giveBackToken(z);
    this.zones.splice(i, 1);
  }

  _releaseAll() {
    if (Array.isArray(this.strikes)) {
      for (const s of this.strikes) this._giveBackToken(s);
      this.strikes.length = 0;
    } else this.strikes = [];
    if (Array.isArray(this.zones)) {
      for (const z of this.zones) this._giveBackToken(z);
      this.zones.length = 0;
    } else this.zones = [];
    if (Array.isArray(this.telegraphs)) this.telegraphs.length = 0;
    else this.telegraphs = [];
    // A pending volley is CANCELLED by every clear path: the callback reference is dropped before
    // the array is emptied, so nothing that survives this call can still reach fireFn.
    if (Array.isArray(this.volleys)) {
      for (const v of this.volleys) {
        if (v && !v.fired) { v.fn = null; this._volleysCancelled = (this._volleysCancelled || 0) + 1; }
      }
      this.volleys.length = 0;
    } else this.volleys = [];
  }

  // ── TOKENS ────────────────────────────────────────────────────────────────

  /** ranged / elite / boss, matching HostileProjectileDirector's three buckets. */
  _tokenClass(enemy) {
    try {
      if (enemy?.isMegaBoss) return 'boss';
      if (typeof enemy?.isBoss === 'function' ? enemy.isBoss() : !!enemy?.isBoss) return 'boss';
      if (enemy?.isElite || enemy?.elite) return 'elite';
    } catch (_) {}
    return 'ranged';
  }

  _takeToken(cls) {
    const hd = this.game?.hostileDirector;
    // No director (headless harness, very early boot) means no budget to respect. The pool caps
    // above are still the hard ceiling, so this cannot become an unbounded path.
    if (!hd || typeof hd.requestTokens !== 'function') return true;
    try { return !!hd.requestTokens(cls, 1, this.game); } catch (_) { return true; }
  }

  _giveBackToken(s) {
    if (!s || !s.tok) return;
    const hd = this.game?.hostileDirector;
    const cls = s.tok;
    s.tok = null;                                // cleared FIRST, so a double drop cannot double-release
    if (!hd || typeof hd.release !== 'function') return;
    try { hd.release(cls, 1); } catch (_) {}
  }

  // ── COOLDOWNS ─────────────────────────────────────────────────────────────

  _weaponKey(wd, behavior) {
    return String(wd?.id || wd?.displayName || behavior || 'weapon');
  }

  _cooldownReady(enemy, key) {
    const rec = this._cooldowns.get(enemy);
    if (!rec || rec.epoch !== this._epoch) return true;
    const until = rec.map[key];
    return !(Number.isFinite(until) && until > this._clock);
  }

  _stampCooldown(enemy, key, seconds) {
    const cd = Math.max(0, Number.isFinite(seconds) ? seconds : 2.5);
    let rec = this._cooldowns.get(enemy);
    if (!rec || rec.epoch !== this._epoch) {
      rec = { epoch: this._epoch, map: Object.create(null) };
      this._cooldowns.set(enemy, rec);
    }
    rec.map[key] = this._clock + cd;
  }

  // ── SMALL HELPERS (all NaN-safe) ──────────────────────────────────────────

  /** Clamped numeric read with a fallback, so a missing or garbage catalog field never escapes. */
  _num(v, fallback, min = -Infinity, max = Infinity) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  _telegraphDur(wd) {
    const t = this._num(wd?.telegraphTime, MIN_TELEGRAPH_S, 0, MAX_TELEGRAPH_S);
    // A weapon that declares telegraphRequired must never be floored away by a 0 in the data, and
    // a weapon that declares nothing still gets the floor: both roads lead to the same minimum.
    return Math.max(MIN_TELEGRAPH_S, t);
  }

  _maxHits(wd) {
    // Every shape this module owns is a single strike unless the data says otherwise. The value
    // is the ceiling on how many times ONE strike may tick the player, ever.
    return Math.max(1, Math.min(4, Math.round(this._num(wd?.maxHits ?? wd?.hits, 1, 1, 4))));
  }

  _halfAngle(wd, fallback) {
    // Accept either a full cone angle or an explicit half-angle, in radians.
    if (Number.isFinite(Number(wd?.arcHalfAngle))) return this._num(wd.arcHalfAngle, fallback, 0.15, Math.PI);
    if (Number.isFinite(Number(wd?.arcAngle)))     return this._num(wd.arcAngle / 2, fallback, 0.15, Math.PI);
    return fallback;
  }

  /** orb_explosion is ours only when nothing about the weapon says it travels. */
  _isGroundStrike(wd) {
    if (wd?.groundStrike === true) return true;
    const sp = Number(wd?.projectileSpeed ?? wd?.speed);
    return !Number.isFinite(sp) || sp <= 0;
  }

  /** Accepts a Vec2, an entity with .pos, or a plain {x,y}. Returns null for anything non-finite. */
  _point(o) {
    if (!o) return null;
    const src = (Number.isFinite(o.x) && Number.isFinite(o.y)) ? o : o.pos;
    if (!src) return null;
    const x = Number(src.x), y = Number(src.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  _playerPoint() {
    return this._point(this.game?.player?.pos);
  }

  _ownerAlive(e) {
    if (!e) return false;
    if (e._retired || e.dead || e.removed) return false;
    if (e.hp !== undefined && !(e.hp > 0)) return false;
    return !!this._point(e.pos);
  }

  /** Shortest signed difference between two angles, in (-PI, PI]. */
  _angleDelta(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  /**
   * The weapon sprite, when the caller has one loaded. The catalog only carries a PATH, and this
   * module must not touch the DOM or the network, so the image has to arrive already decoded:
   * either attached to the weapon def by the caller, or in Game's shared _weaponImages cache.
   * Anything that is not obviously drawable is discarded rather than handed to drawImage.
   */
  _sprite(wd) {
    const cand = wd?.spriteImage || wd?.image || (typeof wd?.sprite === 'object' ? wd.sprite : null)
      || (wd?.id ? this.game?._weaponImages?.[wd.id] : null);
    if (cand && Number.isFinite(cand.width) && cand.width > 0 && Number.isFinite(cand.height) && cand.height > 0) {
      return cand;
    }
    return null;
  }

  /** Deterministic per-object detail. Same shape as AcidRain's hash01 — no RNG state, ever. */
  _hash01(seed, i) {
    const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  // ── SHARED TELEGRAPH RENDERER ─────────────────────────────────────────────

  /**
   * ONE warning language for every shape this module owns, so the player learns "dashed outline +
   * filling interior + closing edge = something lands here in a moment" once and reads all four
   * strikes with it. `k` is 0..1 progress through the telegraph; the fill grows with k and the
   * outline tightens, so imminence is legible without reading a number.
   *
   * `shape` is 'cone' | 'wave' | 'circle' | 'line'. Everything is drawn additively, every optional
   * canvas call is guarded so a headless stub context cannot throw, and NOTHING here draws a plain
   * neon circle unless the strike genuinely is a circle.
   */
  _drawTelegraph(ctx, shape, tg, k) {
    const kk = Math.max(0, Math.min(1, k));
    const pal = tg.pal || PAL.arc;
    // The dash crawl is driven by simulation time, never by wall clock, so drawing the same frame
    // twice paints the same pixels.
    const crawl = -this._clock * 46;

    ctx.save?.();
    try {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (shape === 'cone') {
        const R = tg.radius;
        // Filling interior: the wedge brightens as the swing approaches.
        ctx.globalAlpha = 0.10 + 0.20 * kk;
        ctx.fillStyle = pal.c1;
        ctx.beginPath();
        ctx.moveTo(tg.x, tg.y);
        ctx.arc(tg.x, tg.y, R, tg.angle - tg.half, tg.angle + tg.half);
        ctx.closePath();
        ctx.fill();
        // Dashed outline of the exact damaging cone.
        ctx.globalAlpha = 0.45 + 0.45 * kk;
        ctx.strokeStyle = pal.c2;
        ctx.lineWidth = 2.5;
        ctx.setLineDash?.([12, 9]);
        if (ctx.lineDashOffset !== undefined) ctx.lineDashOffset = crawl;
        ctx.beginPath();
        ctx.moveTo(tg.x, tg.y);
        ctx.arc(tg.x, tg.y, R, tg.angle - tg.half, tg.angle + tg.half);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash?.([]);
        // Closing edge: an inner arc that races out to the rim as the timer runs out.
        ctx.globalAlpha = 0.55 + 0.35 * kk;
        ctx.lineWidth = 3;
        ctx.strokeStyle = pal.c1;
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, Math.max(6, R * kk), tg.angle - tg.half, tg.angle + tg.half);
        ctx.stroke();

      } else if (shape === 'wave') {
        const ux = Math.cos(tg.angle), uy = Math.sin(tg.angle);
        const nx = -uy, ny = ux;
        const L = tg.range;
        const W = tg.halfW;
        // The locked corridor the crescent will roll down.
        ctx.globalAlpha = 0.08 + 0.16 * kk;
        ctx.fillStyle = pal.c1;
        ctx.beginPath();
        ctx.moveTo(tg.x + nx * W, tg.y + ny * W);
        ctx.lineTo(tg.x + ux * L + nx * W, tg.y + uy * L + ny * W);
        ctx.lineTo(tg.x + ux * L - nx * W, tg.y + uy * L - ny * W);
        ctx.lineTo(tg.x - nx * W, tg.y - ny * W);
        ctx.closePath();
        ctx.fill();
        // Dashed rails, so the safe sides of the corridor are unambiguous.
        ctx.globalAlpha = 0.4 + 0.45 * kk;
        ctx.strokeStyle = pal.c2;
        ctx.lineWidth = 2;
        ctx.setLineDash?.([14, 10]);
        if (ctx.lineDashOffset !== undefined) ctx.lineDashOffset = crawl;
        ctx.beginPath();
        ctx.moveTo(tg.x + nx * W, tg.y + ny * W);
        ctx.lineTo(tg.x + ux * L + nx * W, tg.y + uy * L + ny * W);
        ctx.moveTo(tg.x - nx * W, tg.y - ny * W);
        ctx.lineTo(tg.x + ux * L - nx * W, tg.y + uy * L - ny * W);
        ctx.stroke();
        ctx.setLineDash?.([]);
        // Charging blade at the muzzle: a short bar that widens toward the swing.
        ctx.globalAlpha = 0.55 + 0.4 * kk;
        ctx.strokeStyle = pal.c1;
        ctx.lineWidth = 3 + 3 * kk;
        const w0 = W * (0.35 + 0.65 * kk);
        ctx.beginPath();
        ctx.moveTo(tg.x + nx * w0, tg.y + ny * w0);
        ctx.lineTo(tg.x - nx * w0, tg.y - ny * w0);
        ctx.stroke();

      } else if (shape === 'circle') {
        const R = tg.radius;
        // Ground rupture: a filling disc plus a contracting rim, NOT a stack of identical rings.
        ctx.globalAlpha = 0.10 + 0.18 * kk;
        ctx.fillStyle = pal.c2;
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, R * (0.25 + 0.75 * kk), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5 + 0.4 * kk;
        ctx.strokeStyle = pal.c1;
        ctx.lineWidth = 2.5;
        ctx.setLineDash?.([11, 8]);
        if (ctx.lineDashOffset !== undefined) ctx.lineDashOffset = crawl;
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash?.([]);
        // Four converging ticks give the circle a direction of collapse and read as "count-in".
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + this._hash01(tg.seed, i) * 0.4;
          const r0 = R * (1.25 - 0.25 * kk), r1 = R * (1.0 - 0.05 * kk);
          ctx.moveTo(tg.x + Math.cos(a) * r0, tg.y + Math.sin(a) * r0);
          ctx.lineTo(tg.x + Math.cos(a) * r1, tg.y + Math.sin(a) * r1);
        }
        ctx.stroke();

      } else { // 'line'
        const x2 = tg.x + Math.cos(tg.angle) * tg.len;
        const y2 = tg.y + Math.sin(tg.angle) * tg.len;
        // Thin dashed ray — the same read Game._drawEnemyBeams uses for a beam telegraph, in a
        // different hue so a lance is never mistaken for a beam.
        ctx.globalAlpha = 0.22 + 0.4 * kk;
        ctx.strokeStyle = pal.c1;
        ctx.lineWidth = 2;
        ctx.setLineDash?.([16, 12]);
        if (ctx.lineDashOffset !== undefined) ctx.lineDashOffset = crawl * 2;
        ctx.beginPath();
        ctx.moveTo(tg.x, tg.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash?.([]);
        // Muzzle bracket that tightens as the shot nears.
        ctx.globalAlpha = 0.4 + 0.45 * kk;
        ctx.strokeStyle = pal.c2;
        ctx.lineWidth = 3;
        const spread = 0.65 * (1 - kk * 0.6);
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, 24, tg.angle - spread, tg.angle + spread);
        ctx.stroke();
      }
    } catch (_) {
    } finally {
      try {
        ctx.setLineDash?.([]);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 1;
      } catch (_) {}
      ctx.restore?.();
    }
  }

  // ── DRAW PASSES ───────────────────────────────────────────────────────────

  /**
   * Pending volleys reuse the SAME warning language as everything else — a lance windup and a
   * standalone lance warning are visually identical on purpose, because to the player they mean
   * the same thing. No second vocabulary to learn.
   */
  _drawVolleys(ctx) {
    for (let i = 0; i < this.volleys.length; i++) {
      const v = this.volleys[i];
      this._drawTelegraph(ctx, v.shape, v, v.tgT / Math.max(0.001, v.tgDur));
    }
  }

  _drawTelegraphLines(ctx) {
    for (let i = 0; i < this.telegraphs.length; i++) {
      const tg = this.telegraphs[i];
      this._drawTelegraph(ctx, 'line', tg, tg.t / Math.max(0.001, tg.life));
    }
  }

  _drawStrikes(ctx) {
    for (let i = 0; i < this.strikes.length; i++) {
      const s = this.strikes[i];
      if (!s.armed) {
        this._drawTelegraph(ctx, s.kind === 'arc' ? 'cone' : 'wave', s, s.tgT / Math.max(0.001, s.tgDur));
        continue;
      }
      const k = Math.max(0, Math.min(1, s.actT / Math.max(0.001, s.actDur)));
      if (s.kind === 'arc') this._drawArcSweep(ctx, s, k);
      else                  this._drawWave(ctx, s, k);
    }
  }

  /** The swing itself: a bright blade travelling across the warned cone, trailing a fading fan. */
  _drawArcSweep(ctx, s, k) {
    const pal = s.pal;
    const a0 = s.angle - s.half;
    const cur = a0 + k * (s.half * 2);            // leading edge of the blade
    const fade = 1 - k;

    ctx.save?.();
    try {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // Swept fan behind the blade — the part of the cone already cut.
      ctx.globalAlpha = 0.22 * (0.4 + fade * 0.6);
      ctx.fillStyle = pal.c1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.arc(s.x, s.y, s.radius, a0, cur);
      ctx.closePath();
      ctx.fill();
      // Three nested crescents at the rim give the sweep weight without another flat ring.
      ctx.strokeStyle = pal.c2;
      for (let j = 0; j < 3; j++) {
        const rr = s.radius * (1 - j * 0.13);
        ctx.globalAlpha = (0.75 - j * 0.2) * Math.max(0.15, fade);
        ctx.lineWidth = 5 - j * 1.4;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr, Math.max(a0, cur - 0.55 - j * 0.18), cur);
        ctx.stroke();
      }
      // White-hot leading edge, from the pivot out to the rim.
      ctx.globalAlpha = Math.max(0.2, fade);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(cur) * s.radius * 0.18, s.y + Math.sin(cur) * s.radius * 0.18);
      ctx.lineTo(s.x + Math.cos(cur) * s.radius, s.y + Math.sin(cur) * s.radius);
      ctx.stroke();

      this._drawSprite(ctx, s.sprite,
        s.x + Math.cos(cur) * s.radius * 0.72,
        s.y + Math.sin(cur) * s.radius * 0.72,
        cur + Math.PI / 2, s.radius * 0.55, Math.max(0.25, fade));
    } catch (_) {
    } finally {
      try { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 1; } catch (_) {}
      ctx.restore?.();
    }
  }

  /** The crescent rolling down the locked corridor, with a short trail behind it. */
  _drawWave(ctx, s, k) {
    const pal = s.pal;
    const ux = Math.cos(s.angle), uy = Math.sin(s.angle);
    const nx = -uy, ny = ux;
    const cx = s.x + ux * s.dist, cy = s.y + uy * s.dist;
    const fade = 1 - k * 0.75;

    ctx.save?.();
    try {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // Trail: three thinning bars left behind, so the direction of travel is unmistakable.
      ctx.strokeStyle = pal.c1;
      for (let j = 1; j <= 3; j++) {
        const back = j * s.thick * 0.85;
        const w = s.halfW * (1 - j * 0.18);
        ctx.globalAlpha = (0.28 / j) * fade;
        ctx.lineWidth = 6 - j;
        ctx.beginPath();
        ctx.moveTo(cx - ux * back + nx * w, cy - uy * back + ny * w);
        ctx.lineTo(cx - ux * back - nx * w, cy - uy * back - ny * w);
        ctx.stroke();
      }
      // The crescent: a bowed quadratic rather than a straight bar, so it reads as a blade wave.
      ctx.globalAlpha = 0.85 * fade;
      ctx.strokeStyle = pal.c2;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx + nx * s.halfW, cy + ny * s.halfW);
      if (ctx.quadraticCurveTo) {
        ctx.quadraticCurveTo(cx + ux * s.thick * 0.8, cy + uy * s.thick * 0.8,
                             cx - nx * s.halfW, cy - ny * s.halfW);
      } else {
        ctx.lineTo(cx - nx * s.halfW, cy - ny * s.halfW);
      }
      ctx.stroke();
      // White core along the same curve, thinner.
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      this._drawSprite(ctx, s.sprite, cx, cy, s.angle, s.halfW * 1.5, 0.9 * fade);
    } catch (_) {
    } finally {
      try { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 1; } catch (_) {}
      ctx.restore?.();
    }
  }

  _drawZones(ctx) {
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (!z.armed) {
        this._drawTelegraph(ctx, 'circle', z, z.tgT / Math.max(0.001, z.tgDur));
        continue;
      }
      const k = 1 - Math.max(0, Math.min(1, z.actT / Math.max(0.001, z.actDur)));   // 1 -> 0
      ctx.save?.();
      try {
        ctx.globalCompositeOperation = 'lighter';
        // Detonation body. A radial gradient when the context supports it, a flat disc when it
        // does not (headless stubs and some offscreen contexts have no createRadialGradient).
        let fill = z.pal.c2;
        if (typeof ctx.createRadialGradient === 'function') {
          const gd = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.radius);
          if (gd && gd.addColorStop) {
            gd.addColorStop(0.0, `rgba(214,186,255,${(0.60 * k).toFixed(3)})`);
            gd.addColorStop(0.5, `rgba(140,90,255,${(0.42 * k).toFixed(3)})`);
            gd.addColorStop(1.0, 'rgba(60,20,120,0)');
            fill = gd;
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        // Expanding shock rim — one ring, moving, not a stack of static neon circles.
        ctx.globalAlpha = 0.75 * k;
        ctx.strokeStyle = z.pal.c1;
        ctx.lineWidth = 2 + 3 * k;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius * (1 + (1 - k) * 0.28), 0, Math.PI * 2);
        ctx.stroke();
        // Six radial shards, angles hashed off the stored seed so they differ per rupture but are
        // identical every time this frame is drawn.
        ctx.globalAlpha = 0.6 * k;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
          const a = this._hash01(z.seed, j) * Math.PI * 2;
          const r1 = z.radius * (0.55 + this._hash01(z.seed, j + 20) * 0.6);
          ctx.moveTo(z.x + Math.cos(a) * z.radius * 0.2, z.y + Math.sin(a) * z.radius * 0.2);
          ctx.lineTo(z.x + Math.cos(a) * r1, z.y + Math.sin(a) * r1);
        }
        ctx.stroke();

        this._drawSprite(ctx, z.sprite, z.x, z.y, 0, z.radius * 1.1, k);
      } catch (_) {
      } finally {
        try { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 1; } catch (_) {}
        ctx.restore?.();
      }
    }
  }

  /**
   * Weapon art, when the caller supplied a decoded image. Drawn additively at the strike's focal
   * point and rotated to the strike's facing, so a catalog sprite reinforces the shape instead of
   * replacing it — the geometry above stays authoritative for readability.
   */
  _drawSprite(ctx, img, x, y, rot, size, alpha) {
    if (!img || typeof ctx.drawImage !== 'function') return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) return;
    const a = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
    if (a <= 0.02) return;
    ctx.save?.();
    try {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.translate?.(x, y);
      if (Number.isFinite(rot)) ctx.rotate?.(rot);
      const h = size * (img.height / img.width || 1);
      ctx.drawImage(img, -size / 2, -h / 2, size, h);
    } catch (_) {
    } finally {
      try { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } catch (_) {}
      ctx.restore?.();
    }
  }
}
