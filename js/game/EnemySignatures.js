// ════════════════════════════════════════════════════════════════════════════════════════════════
// MILESTONE 3 / BATCH 5.1 — ACT 1 ENEMY SIGNATURES: FOUNDATION
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// THE FINDING THIS BATCH ANSWERS. All 21 normal campaign enemies run the SAME `Enemy.update()`
// body. In the whole engine there are exactly three per-type branches that touch the 21, and all
// three are one-line contact riders in Game._checkPlayerEnemyCollisions (Cryo Claw chill, Razorhound
// bite, Toxin Leech bleed). Ten of the 21 are pure chase with no distinguishing behaviour at all;
// three more differ only cosmetically (Stealth Infiltrator's hit-flash colour, Void Widow's sprite
// filtering, Solar Tyrant's radius). So the roster reads as one enemy wearing 21 sprites.
//
// WHAT THIS MODULE IS. A small, data-driven registry plus one update function. It is NOT a second
// enemy update system: `Enemy.update()` still owns movement, and this module is called from exactly
// ONE line inside it. There is no manager object, no global array, and no per-frame allocation.
//
// STATE MODEL. Every signature is an explicit four-phase state machine living on the enemy instance
// under a single `_sig` object:
//
//     READY ──(cooldown lapsed + gates pass)──> TELEGRAPH ──> EXECUTE ──> RECOVER ──> READY
//
// Because ALL state is per-instance, cleanup is automatic and total: death splices the enemy,
// reset() replaces the array, and the deck transition empties it. Nothing outlives the enemy, so
// there is no leak path of the kind that `manaPickups` has.
//
// DETERMINISM. No `Math.random()` is introduced. Each enemy gets `_sig.seed` from the SAME static
// LCG that already produces `speedVariation` in Enemy.js, and every random-looking value below is
// drawn from a per-instance LCG stepped off that seed. Two runs with the same spawn order produce
// the same signature timings, which is what the regression suite asserts.
//
// SAFETY RULES BAKED IN, not left to the caller:
//   · never fires on the spawn frame — `_sig.cd` starts at `cooldown * (0.55 + jitter)`
//   · deterministic initial jitter de-synchronises a crowd of the same type
//   · a per-type concurrency ceiling (`maxConcurrentFrac`) stops mass synchronisation
//   · every damaging phase applies damage AT MOST ONCE per activation, and a hit refused by player
//     i-frames does NOT consume that budget (the EnemyWeaponSystem contract)
//   · offscreen enemies never enter TELEGRAPH — no wasted telegraph on something you cannot see
//   · nothing runs while paused / gameOver / upgradeUI, because Enemy.update() itself is not called
//   · bosses, mini bosses, mega bosses and event/Chaos-only types have no entry here by construction
//
// NO NEW ART. Every telegraph is plain Canvas geometry, and each one uses a DIFFERENT SHAPE rather
// than a different colour, so the six read apart on all six biome backgrounds:
//   surge → forward arc pair · burrow → ground ring + cross · lunge → directional wedge
//   aimed shot → aim line + reticle · brace/stomp → radial ring · guard → frontal cone

import { Vec2 } from '../constants.js';

/** Explicit phases. Numeric so comparisons stay cheap in the hot path. */
export const SIG_PHASE = Object.freeze({ READY: 0, TELEGRAPH: 1, EXECUTE: 2, RECOVER: 3 });

/**
 * THE SIX APPROVED SIGNATURES — one per gameplay family. Batch 5.1 is a foundation batch: no other
 * enemy gets a signature here, deliberately.
 *
 *   cooldown          seconds between activations, measured from the end of RECOVER
 *   telegraph         seconds of readable wind-up before anything happens
 *   execute           seconds the effect is live
 *   recover           seconds of vulnerability/slowness afterwards (0 = none)
 *   minRange/maxRange player distance band in which the signature may arm at all
 *   maxConcurrentFrac ceiling on the fraction of live enemies OF THIS TYPE that may be mid-signature
 *   eliteCdMult       cooldown multiplier when the enemy is elite (bounded, never below 0.8)
 */
export const ENEMY_SIGNATURES = Object.freeze({
  // 1 · FODDER — Volt Rat: ZIGZAG SURGE.
  // Breaks the dead-straight fodder line without teleporting or becoming unavoidable. The surge is
  // a bounded lateral+forward push applied through the normal movement vector, then it returns to
  // plain chase. Telegraph is a pair of forward arcs on the side it is about to swing to.
  'Volt Rat': Object.freeze({
    id: 'zigzag_surge', family: 'fodder',
    cooldown: 4.2, telegraph: 0.35, execute: 0.30, recover: 0.25,
    minRange: 70, maxRange: 520, maxConcurrentFrac: 0.34, eliteCdMult: 0.85,
    surgeSpeedMult: 2.05,      // bounded — 2.05× base for 0.30s, still outrunnable
    surgeLateral: 0.85,        // how far the surge leans sideways vs straight at the player
  }),

  // 2 · SWARM — Pulse Burrower: BURROW REPOSITION.
  // Stops, shows a ground ring, becomes non-damaging and non-colliding while under, then surfaces at
  // a VALIDATED walkable spot that is near but never on top of the player. Never invisible without
  // a marker: the ground ring stays up for the whole burrow.
  'Pulse Burrower': Object.freeze({
    id: 'burrow_reposition', family: 'swarm',
    cooldown: 8.5, telegraph: 0.70, execute: 0.55, recover: 0.45,
    minRange: 150, maxRange: 900, maxConcurrentFrac: 0.25, eliteCdMult: 0.90,
    landMin: 170, landMax: 300, // distance band from the player for the resurfacing point
  }),

  // 3 · FAST — Razorhound: COMMITTED LUNGE.
  // Stops, locks the direction at the player's position AT THAT MOMENT, then travels straight. It
  // cannot steer mid-lunge, so sidestepping beats it. A miss costs it a long, slow recovery.
  'Razorhound': Object.freeze({
    id: 'committed_lunge', family: 'fast',
    cooldown: 6.5, telegraph: 0.45, execute: 0.35, recover: 0.90,
    minRange: 150, maxRange: 430, maxConcurrentFrac: 0.34, eliteCdMult: 0.85,
    lungeSpeedMult: 3.0, lungeDamage: 10, hitRadiusPad: 6,
    recoverSpeedMult: 0.45,    // punished on a miss
  }),

  // 4 · RANGED — Rift Eye: AIMED RIFT SHOT.
  // A visible aim LINE plus a reticle at the lock point, then ONE non-homing projectile down the
  // locked vector. Uses the shipping `spawnEnemyBullet`, so it inherits the hostile-projectile token
  // budget and the bullet lifetime cap — no new projectile pool, no spam.
  'Rift Eye': Object.freeze({
    id: 'aimed_rift_shot', family: 'ranged',
    cooldown: 5.5, telegraph: 0.60, execute: 0.12, recover: 0.40,
    minRange: 120, maxRange: 640, maxConcurrentFrac: 0.40, eliteCdMult: 0.90,
    shotSpeed: 430, shotDamage: 6, shotRadius: 7, aimSpeedMult: 0.12,
  }),

  // 5 · HEAVY — Heavy Mech: GROUND BRACE.
  // Plants itself (knockback it receives is cut while braced — the one place it is hard to shove),
  // shows a growing radial ring, then releases ONE small stomp. Small radius by design: it should
  // shape the space around the mech, not act like a boss AoE. You can simply walk out of it.
  'Heavy Mech': Object.freeze({
    id: 'ground_brace', family: 'heavy',
    cooldown: 9.0, telegraph: 0.80, execute: 0.25, recover: 0.60,
    minRange: 0, maxRange: 200, maxConcurrentFrac: 0.34, eliteCdMult: 0.90,
    stompRadius: 118, stompDamage: 9, braceKbMult: 0.25, braceSpeedMult: 0.0,
  }),

  // 6 · SHIELD — Abyss Maw: FRONTAL GUARD.
  // Turns a guard toward the player for a while: damage taken inside a clean frontal cone is cut,
  // damage from behind or the flanks is NOT. Never immunity, never permanent — it rewards walking
  // around it. The existing omnidirectional 40% shield reduction is left alone; this adds direction.
  'Abyss Maw': Object.freeze({
    id: 'frontal_guard', family: 'shield',
    cooldown: 7.0, telegraph: 0.30, execute: 2.20, recover: 0.50,
    minRange: 0, maxRange: 600, maxConcurrentFrac: 0.50, eliteCdMult: 0.95,
    coneHalfAngle: 0.62,       // ≈71° total frontal arc — clearly readable, easy to walk around
    frontDamageMult: 0.55,     // front takes 55%; rear/flank takes full
  }),
});

/** Types that carry a signature. Frozen list so callers can iterate without rebuilding it. */
export const SIGNATURE_TYPES = Object.freeze(Object.keys(ENEMY_SIGNATURES));

/** The signature definition for an enemy type, or null. */
export function signatureFor(enemyType) {
  if (typeof enemyType !== 'string' || !enemyType) return null;
  // hasOwnProperty, not a bare index: a bare lookup inherits from Object.prototype, so
  // signatureFor('constructor') would return the Object function instead of null.
  return Object.prototype.hasOwnProperty.call(ENEMY_SIGNATURES, enemyType)
    ? ENEMY_SIGNATURES[enemyType] : null;
}

// ── Deterministic per-enemy RNG ──────────────────────────────────────────────────────────────
// A tiny LCG stepped off the enemy's own seed. This exists so signature timings are reproducible
// for a given spawn order; production never needs Math.random() for any of this.
function sigRand(sig) {
  sig.rng = (sig.rng * 1103515245 + 12345) & 0x7fffffff;
  return sig.rng / 0x7fffffff;
}

/**
 * Build the per-enemy signature state. Called once, from the Enemy constructor.
 * @param {number} seed deterministic seed supplied by the caller (Enemy's existing static LCG)
 */
export function initSignature(enemyType, seed) {
  const def = signatureFor(enemyType);
  if (!def) return null;
  const rng0 = ((Math.floor(seed) || 1) * 2654435761) & 0x7fffffff;
  const s = {
    id: def.id, phase: SIG_PHASE.READY, t: 0, cd: 0, rng: rng0,
    // locked-in execution data
    dirX: 0, dirY: 0, sideX: 0, sideY: 0, aimX: 0, aimY: 0,
    hits: 0, maxHits: 1, missRetry: 0,
    // presentation
    tele: 0, teleDur: 0, ring: 0,
    // burrow
    under: false, landX: 0, landY: 0,
    active: false,
  };
  // NEVER on the spawn frame: the first activation is always at least 55% of a full cooldown away,
  // and the deterministic jitter spreads a freshly spawned pack across a whole extra cooldown.
  s.cd = def.cooldown * (0.55 + sigRand(s) * 1.0);
  return s;
}

/** True while the enemy is mid-signature (telegraph, execute or recover). */
export function signatureActive(e) {
  const s = e && e._sig;
  return !!(s && s.phase !== SIG_PHASE.READY);
}

/** True while a Pulse Burrower is underground — used to suppress contact damage and collision. */
export function signatureIntangible(e) {
  const s = e && e._sig;
  return !!(s && s.id === 'burrow_reposition' && s.under);
}

/**
 * Knockback multiplier contributed by the signature (Heavy Mech brace). 1 = unchanged.
 * Read from Enemy.takeHit, where the knockback impulse is assigned.
 */
export function signatureKnockbackMult(e) {
  const s = e && e._sig;
  if (s && s.id === 'ground_brace' && (s.phase === SIG_PHASE.TELEGRAPH || s.phase === SIG_PHASE.EXECUTE)) {
    return ENEMY_SIGNATURES['Heavy Mech'].braceKbMult;
  }
  return 1;
}

/**
 * Incoming-damage multiplier contributed by the signature (Abyss Maw frontal guard).
 * @param {object} e   the enemy
 * @param {number} sx  source x (the attacker / projectile origin), may be null
 * @param {number} sy  source y
 * @returns {number} 1 when no guard applies; frontDamageMult only inside the frontal cone.
 */
export function signatureDamageMult(e, sx, sy) {
  const s = e && e._sig;
  if (!s || s.id !== 'frontal_guard' || s.phase !== SIG_PHASE.EXECUTE) return 1;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return 1;      // unknown direction → no discount
  const def = ENEMY_SIGNATURES['Abyss Maw'];
  const dx = sx - e.pos.x, dy = sy - e.pos.y;
  const d = Math.hypot(dx, dy);
  if (!(d > 0.0001)) return 1;
  const dot = (dx / d) * s.dirX + (dy / d) * s.dirY;               // cos(angle to guard facing)
  return (dot >= Math.cos(def.coneHalfAngle)) ? def.frontDamageMult : 1;
}

// ── Internals ────────────────────────────────────────────────────────────────────────────────

function finite(n) { return Number.isFinite(n); }

/** Apply this activation's single damage event, honouring player i-frames. */
function applyOnce(s, game, dmg, opts) {
  if (s.hits >= s.maxHits) return false;
  if (s.missRetry > 0) return false;
  const landed = !!game._damagePlayer?.(dmg, opts);
  // A hit REFUSED by i-frames must not consume the budget — otherwise dashing cancels the attack
  // outright instead of merely shortening exposure. This mirrors EnemyWeaponSystem._applyDamage.
  if (landed) { s.hits++; s.missRetry = 0.5; } else { s.missRetry = 0.08; }
  return landed;
}

/** Is this enemy close enough to the camera for a telegraph to be worth showing? */
function onScreen(e, game) {
  const c = game && game.camera;
  if (!c || !finite(c.x) || !finite(c.y)) return true;             // no camera info → don't suppress
  const w = (game._viewW || 1280), h = (game._viewH || 720);
  return e.pos.x > c.x - 220 && e.pos.x < c.x + w + 220
      && e.pos.y > c.y - 220 && e.pos.y < c.y + h + 220;
}

/**
 * Per-type concurrency ceiling. `game._sigCensus` is rebuilt once per frame by Game._updateEnemies,
 * so it can never drift the way an increment/decrement counter would when an enemy is culled or
 * filtered out without passing through _die().
 */
function concurrencyOk(e, game, def) {
  const cen = game && game._sigCensus;
  if (!cen) return true;
  const c = Object.prototype.hasOwnProperty.call(cen, e.enemyType) ? cen[e.enemyType] : null;
  if (!c || !(c.total > 0)) return true;
  const ceiling = Math.max(1, Math.floor(c.total * def.maxConcurrentFrac));
  return c.active < ceiling;
}

/**
 * Claim a concurrency slot the INSTANT an enemy arms. The census is a per-frame snapshot, so
 * without this every enemy whose cooldown lapses on the same frame reads the same stale `active`
 * count and they all arm together — exactly the mass synchronisation the ceiling exists to stop.
 */
function claimConcurrency(e, game) {
  const cen = game && game._sigCensus;
  if (!cen) return;
  const c = Object.prototype.hasOwnProperty.call(cen, e.enemyType) ? cen[e.enemyType] : null;
  if (c) c.active++;
}

/**
 * MAIN ENTRY — advance one enemy's signature by dt.
 *
 * Called from exactly one place: Enemy.update(), after the speed recompute and before the pursuit
 * vector is built. Returns a small result the caller applies:
 *   { speedMult, overrideVel: bool, vx, vy }
 * `overrideVel` means "this signature is driving movement this frame"; the caller sets vel and steps.
 * Returns null when there is nothing to do, which is the common case.
 */
export function updateSignature(e, game, dt) {
  const s = e._sig;
  if (!s) return null;
  const def = signatureFor(e.enemyType);
  if (!def) return null;
  if (!finite(dt) || dt <= 0) return null;
  const player = game && game.player;
  if (!player || !player.pos || !finite(player.pos.x) || !finite(player.pos.y)) return null;

  if (s.missRetry > 0) s.missRetry -= dt;

  const dx = player.pos.x - e.pos.x, dy = player.pos.y - e.pos.y;
  const dist = Math.hypot(dx, dy);
  const ndx = dist > 0.0001 ? dx / dist : 1, ndy = dist > 0.0001 ? dy / dist : 0;

  switch (s.phase) {
    // ────────────────────────────────────────────────────────────── READY
    case SIG_PHASE.READY: {
      s.cd -= dt;
      if (s.cd > 0) return null;
      if (!(dist >= def.minRange && dist <= def.maxRange)) return null;
      if (!onScreen(e, game)) return null;                 // no expensive telegraph off-camera
      if (!concurrencyOk(e, game, def)) return null;       // stops a pack firing in unison
      // Arm.
      claimConcurrency(e, game);
      s.phase = SIG_PHASE.TELEGRAPH;
      s.t = def.telegraph; s.teleDur = def.telegraph; s.tele = 0;
      s.hits = 0; s.maxHits = 1; s.active = true;
      s.dirX = ndx; s.dirY = ndy;
      // Authored signature tell — exactly once per activation, on the READY->TELEGRAPH edge.
      // onScreen() and concurrencyOk() above already rejected off-camera enemies and pack-wide
      // unison, so this cannot spam; AudioManager caps it again at 3 concurrent / 0.30 s.
      try { game && game.audio && game.audio.playEnemyTell && game.audio.playEnemyTell(e.enemyType); } catch (_) {}
      if (s.id === 'zigzag_surge') {
        // pick a side deterministically, and remember it for the telegraph arcs
        const side = sigRand(s) < 0.5 ? -1 : 1;
        s.sideX = -ndy * side; s.sideY = ndx * side;
      }
      return null;
    }

    // ────────────────────────────────────────────────────────── TELEGRAPH
    case SIG_PHASE.TELEGRAPH: {
      s.t -= dt;
      s.tele = s.teleDur > 0 ? 1 - Math.max(0, s.t) / s.teleDur : 1;
      // Guard and aimed shot track during the WIND-UP only — both lock the instant they commit.
      if (s.id === 'frontal_guard' || s.id === 'aimed_rift_shot') { s.dirX = ndx; s.dirY = ndy; }
      if (s.t > 0) return telegraphMovement(s, def);
      // ── commit ──
      s.phase = SIG_PHASE.EXECUTE;
      s.t = def.execute;
      s.ring = 0;
      if (s.id === 'aimed_rift_shot') {
        s.aimX = s.dirX; s.aimY = s.dirY;                  // LOCKED — no homing after this point
        fireAimedShot(e, game, def, s);
      } else if (s.id === 'burrow_reposition') {
        s.under = true;
        pickBurrowLanding(e, game, def, s, player);
      } else if (s.id === 'committed_lunge') {
        s.aimX = s.dirX; s.aimY = s.dirY;                  // LOCKED — cannot steer mid-lunge
      }
      return telegraphMovement(s, def);
    }

    // ──────────────────────────────────────────────────────────── EXECUTE
    case SIG_PHASE.EXECUTE: {
      s.t -= dt;
      s.ring = def.execute > 0 ? 1 - Math.max(0, s.t) / def.execute : 1;
      let out = null;
      switch (s.id) {
        case 'zigzag_surge': {
          // Bounded acceleration along a blend of "at the player" and "to the side". No teleport.
          const bx = ndx + s.sideX * def.surgeLateral, by = ndy + s.sideY * def.surgeLateral;
          const bl = Math.hypot(bx, by) || 1;
          const sp = e.baseSpeed * def.surgeSpeedMult;
          out = { speedMult: 1, overrideVel: true, vx: (bx / bl) * sp, vy: (by / bl) * sp };
          break;
        }
        case 'committed_lunge': {
          const sp = e.baseSpeed * def.lungeSpeedMult;
          out = { speedMult: 1, overrideVel: true, vx: s.aimX * sp, vy: s.aimY * sp };
          // ONE damage event for the whole lunge, and only on a real overlap.
          if (dist < e.radius + 16 + def.hitRadiusPad) {
            applyOnce(s, game, def.lungeDamage, { color: '#ff4444', shake: 4, src: 'enemySignature' });
          }
          break;
        }
        case 'burrow_reposition': {
          // Underground: no movement, no contact (see signatureIntangible), ground ring stays visible.
          out = { speedMult: 0, overrideVel: true, vx: 0, vy: 0 };
          break;
        }
        case 'ground_brace': {
          out = { speedMult: def.braceSpeedMult, overrideVel: true, vx: 0, vy: 0 };
          // The stomp lands ONCE, at the moment the ring completes.
          if (s.hits === 0 && s.t <= 0 && dist < def.stompRadius) {
            applyOnce(s, game, def.stompDamage, { color: '#ffb347', shake: 5, src: 'enemySignature' });
          }
          break;
        }
        case 'frontal_guard': {
          // FACING IS LOCKED AT COMMIT. Re-pointing it at the player every frame made the cone a
          // flat omnidirectional discount — the dot product was always 1, so there was no
          // counterplay at all. Locking is the whole point: the guard rewards repositioning.
          out = { speedMult: 0.45, overrideVel: false, vx: 0, vy: 0 };
          break;
        }
        case 'aimed_rift_shot':
        default:
          out = { speedMult: 0.5, overrideVel: false, vx: 0, vy: 0 };
          break;
      }
      if (s.t <= 0) {
        if (s.id === 'burrow_reposition') surfaceBurrow(e, game, s);
        s.phase = SIG_PHASE.RECOVER;
        s.t = def.recover;
        s.under = false;
      }
      return out;
    }

    // ──────────────────────────────────────────────────────────── RECOVER
    case SIG_PHASE.RECOVER: {
      s.t -= dt;
      if (s.t <= 0) {
        s.phase = SIG_PHASE.READY;
        s.active = false;
        s.tele = 0; s.ring = 0;
        // Deterministic jitter on every re-arm keeps a pack de-synchronised for the whole run.
        const eliteMult = e.isElite ? Math.max(0.8, def.eliteCdMult) : 1;
        s.cd = def.cooldown * eliteMult * (0.85 + sigRand(s) * 0.45);
        return null;
      }
      if (s.id === 'committed_lunge') {
        return { speedMult: def.recoverSpeedMult, overrideVel: false, vx: 0, vy: 0 };
      }
      if (s.id === 'ground_brace') return { speedMult: 0.55, overrideVel: false, vx: 0, vy: 0 };
      return null;
    }

    default:
      s.phase = SIG_PHASE.READY; s.active = false; s.cd = def.cooldown;
      return null;
  }
}

/** Movement modulation during the wind-up: everything slows or stops so the tell is readable. */
function telegraphMovement(s, def) {
  switch (s.id) {
    case 'committed_lunge':      return { speedMult: 0.05, overrideVel: true, vx: 0, vy: 0 };
    case 'burrow_reposition':    return { speedMult: 0.0,  overrideVel: true, vx: 0, vy: 0 };
    case 'ground_brace':         return { speedMult: 0.0,  overrideVel: true, vx: 0, vy: 0 };
    case 'aimed_rift_shot':      return { speedMult: def.aimSpeedMult, overrideVel: false, vx: 0, vy: 0 };
    case 'frontal_guard':        return { speedMult: 0.5,  overrideVel: false, vx: 0, vy: 0 };
    case 'zigzag_surge':         return { speedMult: 0.7,  overrideVel: false, vx: 0, vy: 0 };
    default:                     return null;
  }
}

/** One non-homing bullet down the locked vector, through the shipping projectile path. */
function fireAimedShot(e, game, def, s) {
  try {
    if (!game.spawnEnemyBullet) return;
    // spawnEnemyBullet calls dir.clone(), so the direction MUST be a real Vec2 — a plain {x,y}
    // throws, and because this call is wrapped in try/catch the shot would fail silently while
    // still having consumed a hostile-projectile token. Caught by the Batch 5.1 suite.
    const pos = e.pos.clone ? e.pos.clone() : new Vec2(e.pos.x, e.pos.y);
    game.spawnEnemyBullet(pos, new Vec2(s.aimX, s.aimY),
      def.shotSpeed, def.shotDamage, def.shotRadius, '#b06bff',
      { stun: 0, cls: 'ranged', owner: e, weaponDef: null });
    game.audio?.playEnemyShoot?.();
  } catch (_) { /* a signature must never break the frame */ }
}

/**
 * Choose the resurfacing point through the CANONICAL placement API, so it can never land in a wall,
 * outside the deck, on a hazard, or on top of the player.
 */
function pickBurrowLanding(e, game, def, s, player) {
  s.landX = e.pos.x; s.landY = e.pos.y;                    // fallback = stay put, always valid
  try {
    const ang = sigRand(s) * Math.PI * 2;
    const r = def.landMin + sigRand(s) * (def.landMax - def.landMin);
    const tx = player.pos.x + Math.cos(ang) * r;
    const ty = player.pos.y + Math.sin(ang) * r;
    if (!finite(tx) || !finite(ty)) return;
    // minPlayerDist = landMin guarantees it can never surface under the player.
    const p = game.resolveEnemySpawn?.(tx, ty, e.radius || 14, def.landMin, e, null);
    if (p && finite(p.x) && finite(p.y)) { s.landX = p.x; s.landY = p.y; }
  } catch (_) { /* keep the fallback */ }
}

/** Surface: commit the validated landing, re-verifying finiteness one last time. */
function surfaceBurrow(e, game, s) {
  if (!finite(s.landX) || !finite(s.landY)) return;
  const px = game?.player?.pos?.x, py = game?.player?.pos?.y;
  if (finite(px) && finite(py)) {
    const d = Math.hypot(s.landX - px, s.landY - py);
    const minD = ENEMY_SIGNATURES['Pulse Burrower'].landMin;
    if (d < minD * 0.6) return;                            // too close after all → abort, stay put
  }
  e.pos.x = s.landX; e.pos.y = s.landY;
}

// ── Telegraph rendering ──────────────────────────────────────────────────────────────────────
// Distinct GEOMETRY per signature, not just distinct colour, so each reads on every biome. Nothing
// is opaque and nothing covers the enemy sprite or the player.

/**
 * Draw the signature telegraph for one enemy. Called from Enemy.draw().
 * Pure canvas; saves and restores everything it touches.
 */
export function drawSignature(e, ctx) {
  const s = e._sig;
  if (!s || s.phase === SIG_PHASE.READY) return;
  const def = signatureFor(e.enemyType);
  if (!def || !ctx) return;
  const x = e.pos.x, y = e.pos.y;
  if (!finite(x) || !finite(y)) return;
  const k = s.phase === SIG_PHASE.TELEGRAPH ? s.tele : 1;

  ctx.save();
  ctx.lineCap = 'round';
  try {
    switch (s.id) {
      // FORWARD ARC PAIR — an electric swing tell that points at the side it will surge to.
      case 'zigzag_surge': {
        if (s.phase !== SIG_PHASE.TELEGRAPH) break;
        const base = Math.atan2(s.sideY + s.dirY, s.sideX + s.dirX);
        ctx.strokeStyle = '#7ce8ff';
        ctx.globalAlpha = 0.35 + 0.5 * k;
        ctx.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
          const r = e.radius + 7 + i * 6 + 5 * k;
          ctx.beginPath();
          ctx.arc(x, y, r, base - 0.75, base + 0.75);
          ctx.stroke();
        }
        break;
      }

      // GROUND RING + CROSS — reads as "something is happening in the floor here".
      case 'burrow_reposition': {
        const under = s.phase === SIG_PHASE.EXECUTE;
        const r = e.radius + 12 + 10 * k;
        ctx.strokeStyle = under ? '#6be4ff' : '#9d6bff';
        ctx.globalAlpha = under ? 0.75 : 0.35 + 0.45 * k;
        ctx.lineWidth = 2;
        ctx.setLineDash([9, 7]);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x - r * 0.55, y); ctx.lineTo(x + r * 0.55, y);
        ctx.moveTo(x, y - r * 0.55); ctx.lineTo(x, y + r * 0.55);
        ctx.stroke();
        // While under, mark the destination too — never invisible without an indicator.
        if (under && finite(s.landX) && finite(s.landY)) {
          ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.arc(s.landX, s.landY, 14, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }

      // DIRECTIONAL WEDGE — shows exactly where the committed lunge will go.
      case 'committed_lunge': {
        if (s.phase !== SIG_PHASE.TELEGRAPH) break;
        const a = Math.atan2(s.dirY, s.dirX), half = 0.30 * (1 - k * 0.55);
        const len = 150 + 90 * k;
        ctx.strokeStyle = '#ff5a5a';
        ctx.globalAlpha = 0.30 + 0.45 * k;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a - half) * len, y + Math.sin(a - half) * len);
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a + half) * len, y + Math.sin(a + half) * len);
        ctx.stroke();
        ctx.globalAlpha = 0.25 + 0.35 * k;
        ctx.beginPath();
        ctx.arc(x, y, len, a - half, a + half);
        ctx.stroke();
        break;
      }

      // AIM LINE + RETICLE — a thin ray, so it never buries the sprite.
      case 'aimed_rift_shot': {
        if (s.phase !== SIG_PHASE.TELEGRAPH) break;
        const a = Math.atan2(s.dirY, s.dirX), len = 620;
        ctx.strokeStyle = '#b06bff';
        ctx.globalAlpha = 0.25 + 0.45 * k;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([16, 12]);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (e.radius + 6), y + Math.sin(a) * (e.radius + 6));
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
        ctx.setLineDash([]);
        // muzzle bracket tightening as the shot nears
        const spread = 0.62 * (1 - k * 0.65);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, e.radius + 12, a - spread, a + spread); ctx.stroke();
        break;
      }

      // RADIAL RING — the stomp footprint, drawn exactly at its damage radius.
      case 'ground_brace': {
        if (s.phase === SIG_PHASE.RECOVER) break;
        const grow = s.phase === SIG_PHASE.TELEGRAPH ? k : 1;
        ctx.strokeStyle = '#ffb347';
        ctx.globalAlpha = 0.28 + 0.42 * grow;
        ctx.lineWidth = 2;
        ctx.setLineDash([11, 8]);
        ctx.beginPath(); ctx.arc(x, y, def.stompRadius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // closing inner ring = imminence
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(6, def.stompRadius * (1 - grow * 0.82)), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      // FRONTAL CONE — the protected arc, so the player can see where NOT to attack from.
      case 'frontal_guard': {
        const a = Math.atan2(s.dirY, s.dirX), half = def.coneHalfAngle;
        const r = e.radius + 20;
        ctx.strokeStyle = '#9d6bff';
        ctx.globalAlpha = s.phase === SIG_PHASE.EXECUTE ? 0.6 : 0.25 + 0.35 * k;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, r, a - half, a + half); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.globalAlpha *= 0.7;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a - half) * (e.radius + 3), y + Math.sin(a - half) * (e.radius + 3));
        ctx.lineTo(x + Math.cos(a - half) * r, y + Math.sin(a - half) * r);
        ctx.moveTo(x + Math.cos(a + half) * (e.radius + 3), y + Math.sin(a + half) * (e.radius + 3));
        ctx.lineTo(x + Math.cos(a + half) * r, y + Math.sin(a + half) * r);
        ctx.stroke();
        break;
      }
      default: break;
    }
  } catch (_) { /* rendering must never break the frame */ }
  ctx.restore();
}

/**
 * Rebuild the per-type concurrency census. Called ONCE per frame by Game._updateEnemies, before the
 * enemy loop. Recomputing beats incrementing because enemies can be removed by paths that never run
 * _die() (the Endless distance cull, the Bloodfang Razorhound filter), which would leak a counter.
 */
export function buildSignatureCensus(enemies, out) {
  const c = out || {};
  for (const k in c) { c[k].total = 0; c[k].active = 0; }
  if (!Array.isArray(enemies)) return c;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || !e._sig || e.hp <= 0) continue;
    let slot = c[e.enemyType];
    if (!slot) slot = c[e.enemyType] = { total: 0, active: 0 };
    slot.total++;
    if (e._sig.phase !== SIG_PHASE.READY) slot.active++;
  }
  return c;
}

/** Debug/test visibility. Pure read, no side effects, never called from the render or update path. */
export function signatureStats(enemies) {
  const out = { types: SIGNATURE_TYPES.length, live: 0, active: 0, byId: {} };
  if (!Array.isArray(enemies)) return out;
  for (const e of enemies) {
    if (!e || !e._sig) continue;
    out.live++;
    const id = e._sig.id;
    const b = out.byId[id] || (out.byId[id] = { live: 0, ready: 0, telegraph: 0, execute: 0, recover: 0 });
    b.live++;
    if (e._sig.phase === SIG_PHASE.READY) b.ready++;
    else if (e._sig.phase === SIG_PHASE.TELEGRAPH) { b.telegraph++; out.active++; }
    else if (e._sig.phase === SIG_PHASE.EXECUTE) { b.execute++; out.active++; }
    else { b.recover++; out.active++; }
  }
  return out;
}
