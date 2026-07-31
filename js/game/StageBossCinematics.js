// ════════════════════════════════════════════════════════════════════════════════════════════════
// MILESTONE 3 / BATCH 5.2 — ACT 1 STAGE BOSSES: CINEMATIC GAMEPLAY PASS
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THE AUDIT FOUND. Four of the six Act 1 stage bosses are, mechanically, large normal enemies:
//   · `mech` is LITERALLY an Enemy instance — no dedicated update, draw, HP bar, intro or death path
//   · `annihilator` fires one untelegraphed bullet every ~3.5s, and its signature "Matrix Strike"
//     deals ZERO damage (core-stealing was disabled; the attack was left in as pure cosmetics)
//   · `titan` has two attacks, NEITHER telegraphed — its shockwave ring IS its own hitbox
//   · `cyberSerpent` is a Razorhound with 1500 HP and a fire trail, and it makes NO SOUND at all
// Only `cyberDragon` (telegraphed cryo shards) and `bloodfang` (telegraphed slam + real pack) read
// as boss fights today. None of the six has an intro, a shared health bar, spawn protection, an
// HP-threshold phase, or an enrage.
//
// WHAT THIS MODULE ADDS — and deliberately does NOT.
//   ADDS: a shared boss INTRO (announce + name + bounded shake + spawn VFX + bounded spawn
//   protection), the ONE shared boss HEALTH BAR (there were three unconnected implementations and
//   the mech got none), and exactly ONE signature attack per boss with a real telegraph.
//   DOES NOT touch: boss→biome mapping, rewards, the 80s stage duration, the boss progression gate,
//   biome enemy pools, the Batch 5.1 normal-enemy signature registry, Chaos Titans, or the Endless
//   boss scheduler. Every existing boss attack is left exactly as it was.
//
// STATE MODEL. One `_enc` object per boss instance, created on first sight. Explicit phases:
//   INTRO → IDLE → TELEGRAPH → EXECUTE → RECOVER → IDLE …
// Every array the encounter owns (markers, strike list, breath arc, summon ids) lives INSIDE `_enc`
// and is hard-capped. Nothing is pushed onto a global array, so a boss dying, a reset, or a deck
// transition drops all of it with the boss reference — the leak class the audit found in
// `_clearDeckTransients` cannot recur here.
//
// DETERMINISM. No `Math.random()`, no `Date.now()`, no `performance.now()`. Each encounter carries
// its own LCG seeded from a value the caller supplies.
//
// FAIRNESS, enforced here rather than left to each boss:
//   · a telegraph ALWAYS precedes damage — EXECUTE cannot be entered without a completed TELEGRAPH
//   · one damage application per activation, tracked per marker/segment, never per frame
//   · a hit refused by player i-frames does NOT consume the budget (matches the Batch 5.1 contract)
//   · never fires on the spawn frame — INTRO must complete, then an initial delay
//   · damage is routed through `_damagePlayer`, so BOSS_MAX_PLAYER_HIT (30) caps every hit and no
//     signature can one-shot a baseline character
//   · nothing runs while paused / gameOver / victory — the caller sits below Game.js:9282

/** Encounter phases. Numeric for cheap comparison in the hot path. */
export const ENC_PHASE = Object.freeze({
  INTRO: 0, IDLE: 1, TELEGRAPH: 2, EXECUTE: 3, RECOVER: 4,
});

/** Shared intro tuning. Total ≈ 1.2s, well inside the 1–1.5s brief, and never locks player control. */
export const BOSS_INTRO = Object.freeze({
  duration: 1.2,          // whole intro
  shakeIntensity: 7,      // bounded — the audit's boss-scale band is 2..16
  shakeDuration: 0.5,
  protection: 1.0,        // bounded spawn protection, SHORTER than the intro
  hordeQuiet: 1.2,        // ambient wave spawning paused via the existing spawnPauseTimer lever
});

/**
 * THE SIX SIGNATURES. One per boss, each with distinct GEOMETRY so they never read as recoloured
 * circles: line/arc · cone · markers · path · frontal cone · directional pack markers.
 *
 *   initialDelay  seconds after the intro before the first activation is even considered
 *   cooldown      seconds between activations (measured from the end of RECOVER)
 *   telegraph     readable wind-up; damage is impossible during this phase
 *   execute       seconds the effect is live
 *   recover       guaranteed safe window afterwards
 *   enrageCdMult  cooldown multiplier below `enrageAt` HP fraction — a SMALL pacing change only,
 *                 never a new ability and never a stat multiplier
 */
export const STAGE_BOSS_SIGNATURES = Object.freeze({
  // 1 · neon_district — SECURITY DEFECTOR MECH: LASER SWEEP.
  // A thin line locks its start angle, then rotates through a bounded arc. The arc is deliberately
  // less than a full turn, so the un-swept wedge is a visible, standing safe region the whole time.
  mech: Object.freeze({
    id: 'laser_sweep', name: 'SECURITY DEFECTOR MECH', color: '#ffcc33',
    initialDelay: 3.4, cooldown: 13.5, telegraph: 0.95, execute: 1.10, recover: 1.30,
    minRange: 0, maxRange: 900, enrageAt: 0.35, enrageCdMult: 0.82,
    sweepArc: 2.30,          // ~132° — leaves a 228° safe wedge
    sweepLen: 620, sweepWidth: 18, sweepDamage: 11,
    sweepDir: 1,
  }),

  // 2 · industrial_core — MATRIX ANNIHILATOR: FORGE SLAM.
  // Charge-up, then a bounded frontal cone. Not the screen: a 300px cone the player can walk out of
  // or step behind. One damage application per slam.
  annihilator: Object.freeze({
    id: 'forge_slam', name: 'MATRIX ANNIHILATOR', color: '#ff3b3b',
    initialDelay: 3.6, cooldown: 14.0, telegraph: 1.10, execute: 0.30, recover: 1.40,
    minRange: 0, maxRange: 520, enrageAt: 0.35, enrageCdMult: 0.85,
    coneHalfAngle: 0.52,     // ~60° total
    coneRange: 280, slamDamage: 13, slamShake: 7,
  }),

  // 3 · orbital_nexus — AI OVERLOAD TITAN: ORBITAL TARGET GRID.
  // 3–5 separate ground markers, each with its own delay, each striking ONLY where it was drawn.
  // The gaps between markers are the escape routes, and they are visible for the whole wind-up.
  titan: Object.freeze({
    id: 'orbital_grid', name: 'AI OVERLOAD TITAN', color: '#a855f7',
    initialDelay: 3.8, cooldown: 15.0, telegraph: 1.25, execute: 1.30, recover: 1.30,
    minRange: 0, maxRange: 1000, enrageAt: 0.35, enrageCdMult: 0.85,
    markerMin: 3, markerMax: 5, markerRadius: 88, markerSpread: 360,
    strikeDamage: 11, strikeStagger: 0.28,
  }),

  // 4 · abyssal_trench — CYBER SERPENT: SERPENTINE CHARGE.
  // The path is drawn first as a curved ribbon, then it commits to exactly that path. It cannot
  // re-home mid-charge, so reading the ribbon and stepping off it beats the attack outright.
  cyberSerpent: Object.freeze({
    id: 'serpentine_charge', name: 'CYBER SERPENT', color: '#ff7733',
    initialDelay: 3.6, cooldown: 13.0, telegraph: 1.00, execute: 1.00, recover: 1.40,
    minRange: 140, maxRange: 900, enrageAt: 0.35, enrageCdMult: 0.85,
    chargeSpeed: 520, chargeCurve: 0.85, chargeDamage: 12, pathPoints: 14, hitPad: 8,
  }),

  // 5 · glacial_expanse — CYBER DRAGON: CRYO BREATH ARC.
  // A frontal cone charges, then breathes. Behind the dragon is always safe. The slow it applies is
  // small, capped, single-application and self-expiring — no chain-freeze is possible.
  cyberDragon: Object.freeze({
    id: 'cryo_breath', name: 'CYBER DRAGON', color: '#00ccff',
    initialDelay: 4.0, cooldown: 14.5, telegraph: 1.15, execute: 1.00, recover: 1.30,
    minRange: 0, maxRange: 620, enrageAt: 0.35, enrageCdMult: 0.85,
    breathHalfAngle: 0.46,   // ~53° total — the rear 307° is safe
    breathRange: 360, breathDamage: 11,
    // The FACTOR is owned by the canonical player chill (Player.js:309 → x0.75) — declaring a
    // second one here would be dead tuning, which is the exact defect class this batch removes.
    slowDuration: 1.4,       // bounded, capped, self-expiring
  }),

  // 6 · data_wastes — BLOODFANG PACKMASTER: PACK ASSAULT.
  // Calls a CAPPED number of the EXISTING Razorhound type — no new enemy id — with a directional
  // telegraph showing where they will come from, staggered so they never arrive on one frame, and
  // every summon is removed when the boss dies.
  bloodfang: Object.freeze({
    id: 'pack_assault', name: 'BLOODFANG PACKMASTER', color: '#ef4444',
    initialDelay: 3.6, cooldown: 15.0, telegraph: 1.10, execute: 1.60, recover: 1.40,
    minRange: 0, maxRange: 900, enrageAt: 0.35, enrageCdMult: 0.88,
    summonType: 'Razorhound',
    summonCount: 3, summonCap: 3, summonLifetime: 12.0,
    summonStagger: 0.45, summonDist: 320,
  }),
});

export const STAGE_BOSS_IDS = Object.freeze(Object.keys(STAGE_BOSS_SIGNATURES));

/** Hard ceilings. Nothing the encounter owns may exceed these, ever. */
export const ENC_CAPS = Object.freeze({ markers: 5, strikes: 5, pathPoints: 16, summons: 4 });

/** Prototype-safe registry lookup. */
export function bossSignatureFor(bossId) {
  if (typeof bossId !== 'string' || !bossId) return null;
  return Object.prototype.hasOwnProperty.call(STAGE_BOSS_SIGNATURES, bossId)
    ? STAGE_BOSS_SIGNATURES[bossId] : null;
}

const finite = (n) => Number.isFinite(n);
function encRand(e) { e.rng = (e.rng * 1103515245 + 12345) & 0x7fffffff; return e.rng / 0x7fffffff; }

/** Create the encounter state for a boss. Seed is supplied so replays are reproducible. */
export function initBossEncounter(bossId, seed) {
  const def = bossSignatureFor(bossId);
  if (!def) return null;
  return {
    bossId, id: def.id, name: def.name,
    phase: ENC_PHASE.INTRO,
    t: BOSS_INTRO.duration,          // intro timer
    cd: def.initialDelay,            // never fires on the spawn frame
    rng: ((Math.floor(seed) || 1) * 2654435761) & 0x7fffffff,
    introDone: false, protT: BOSS_INTRO.protection,
    announced: false, enraged: false,
    // locked execution data
    dirX: 1, dirY: 0, ang0: 0, ang: 0,
    markers: [], strikes: [], path: [], pathI: 0,
    summons: [], summonQ: 0, summonT: 0,
    hits: 0, maxHits: 1, retry: 0,
    tele: 0, teleDur: 0, k: 0,
    activations: 0,
  };
}

/** Is this boss still inside its bounded spawn protection? */
export function bossProtected(boss) {
  const e = boss && boss._enc;
  return !!(e && e.protT > 0);
}

/** Is the encounter mid-signature (anything past IDLE)? */
export function bossSignatureActive(boss) {
  const e = boss && boss._enc;
  return !!(e && (e.phase === ENC_PHASE.TELEGRAPH || e.phase === ENC_PHASE.EXECUTE || e.phase === ENC_PHASE.RECOVER));
}

/** Read-only stats for QA/debug. No side effects, never called from update or draw. */
export function bossEncounterStats(boss) {
  const e = boss && boss._enc;
  if (!e) return null;
  return {
    id: e.id, phase: e.phase, activations: e.activations, enraged: e.enraged,
    protectedT: +e.protT.toFixed(3), cd: +e.cd.toFixed(3),
    markers: e.markers.length, strikes: e.strikes.length,
    path: e.path.length, summons: e.summons.length, hits: e.hits,
  };
}

/** Apply this activation's damage once. A refusal by i-frames does not consume the budget. */
function hitOnce(e, g, dmg, opts) {
  if (e.hits >= e.maxHits) return false;
  if (e.retry > 0) return false;
  const landed = !!g._damagePlayer?.(dmg, opts);
  if (landed) { e.hits++; e.retry = 0.5; } else { e.retry = 0.08; }
  return landed;
}

/** The boss's current HP fraction, safely. */
function hpFrac(boss) {
  const m = boss && boss.maxHp;
  return (finite(m) && m > 0 && finite(boss.hp)) ? Math.max(0, Math.min(1, boss.hp / m)) : 1;
}

/**
 * MAIN ENTRY — advance one boss encounter.
 * Called once per frame per live stage boss, from Game._updateStageBossCinematics.
 */
export function updateBossEncounter(g, bossId, boss, dt) {
  if (!g || !boss || !finite(dt) || dt <= 0) return;
  const def = bossSignatureFor(bossId);
  if (!def) return;
  let e = boss._enc;
  if (!e) { e = boss._enc = initBossEncounter(bossId, (boss.maxHp || 600) + STAGE_BOSS_IDS.indexOf(bossId) * 7919); }
  if (!e) return;
  const p = g.player;
  if (!p || !p.pos || !finite(p.pos.x) || !finite(p.pos.y)) return;
  if (!finite(boss.pos?.x) || !finite(boss.pos?.y)) return;

  if (e.retry > 0) e.retry -= dt;
  if (e.protT > 0) e.protT -= dt;
  pruneSummons(g, e, dt);

  // ── ENRAGE: a small cooldown change only. No new ability, no stat multiplier. ──
  if (!e.enraged && hpFrac(boss) <= def.enrageAt) {
    e.enraged = true;
    try { g.triggerAnnouncement?.(`${def.name} — ENRAGED`, def.color); } catch (_) {}
  }

  const dx = p.pos.x - boss.pos.x, dy = p.pos.y - boss.pos.y;
  const dist = Math.hypot(dx, dy);
  const ndx = dist > 1e-4 ? dx / dist : 1, ndy = dist > 1e-4 ? dy / dist : 0;

  switch (e.phase) {
    // ─────────────────────────────────────────────────────────────── INTRO
    case ENC_PHASE.INTRO: {
      if (!e.announced) {
        e.announced = true;
        try {
          g.triggerAnnouncement?.(`⚠ ${def.name}`, def.color, { priority: 2 });
          g.audio?.playBossSpawn?.();
          g.screenShake?.trigger?.(BOSS_INTRO.shakeIntensity, BOSS_INTRO.shakeDuration);
          // Quiet the ambient horde briefly through the EXISTING lever, so the intro reads.
          g.spawnPauseTimer = Math.max(g.spawnPauseTimer || 0, BOSS_INTRO.hordeQuiet);
          g.particles?.spawnExplosion?.(boss.pos.clone ? boss.pos.clone() : { x: boss.pos.x, y: boss.pos.y },
            [def.color, '#ffffff'], 20);
        } catch (_) { /* an intro must never break the frame */ }
      }
      e.t -= dt;
      e.k = 1 - Math.max(0, e.t) / BOSS_INTRO.duration;
      if (e.t <= 0) { e.phase = ENC_PHASE.IDLE; e.introDone = true; }
      return;
    }

    // ──────────────────────────────────────────────────────────────── IDLE
    case ENC_PHASE.IDLE: {
      e.cd -= dt * (e.enraged ? (1 / Math.max(0.5, def.enrageCdMult)) : 1);
      if (e.cd > 0) return;
      if (!(dist >= def.minRange && dist <= def.maxRange)) return;
      e.phase = ENC_PHASE.TELEGRAPH;
      e.t = def.telegraph; e.teleDur = def.telegraph; e.tele = 0;
      e.hits = 0; e.maxHits = 1;
      e.markers.length = 0; e.strikes.length = 0; e.path.length = 0; e.pathI = 0;
      e.summons_pending = 0;
      e.dirX = ndx; e.dirY = ndy;
      armTelegraph(g, e, def, boss, p, dist, ndx, ndy);
      // Authored boss telegraph cue. Fires on the IDLE->TELEGRAPH edge only: never on the
      // spawn frame (INTRO runs first and initialDelay gates the first arm), never per-frame,
      // never during EXECUTE, and never twice inside one activation.
      try { g && g.audio && g.audio.playBossTelegraph && g.audio.playBossTelegraph(e.bossId); } catch (_) {}
      return;
    }

    // ─────────────────────────────────────────────────────────── TELEGRAPH
    case ENC_PHASE.TELEGRAPH: {
      e.t -= dt;
      e.tele = e.teleDur > 0 ? 1 - Math.max(0, e.t) / e.teleDur : 1;
      // The dragon's cone and the mech's muzzle keep tracking during the wind-up, then LOCK.
      if (e.id === 'cryo_breath' || e.id === 'laser_sweep') { e.dirX = ndx; e.dirY = ndy; }
      if (e.t > 0) return;
      // ── COMMIT ── damage only becomes possible from here.
      e.phase = ENC_PHASE.EXECUTE;
      e.t = def.execute; e.k = 0; e.activations++;
      commit(g, e, def, boss, p, ndx, ndy);
      return;
    }

    // ───────────────────────────────────────────────────────────── EXECUTE
    case ENC_PHASE.EXECUTE: {
      e.t -= dt;
      e.k = def.execute > 0 ? 1 - Math.max(0, e.t) / def.execute : 1;
      execute(g, e, def, boss, p, dt, dist);
      if (e.t <= 0) {
        e.phase = ENC_PHASE.RECOVER;
        e.t = def.recover;
        e.markers.length = 0; e.strikes.length = 0; e.path.length = 0;
      }
      return;
    }

    // ───────────────────────────────────────────────────────────── RECOVER
    case ENC_PHASE.RECOVER: {
      e.t -= dt;
      if (e.summonQ > 0) tickSummons(g, e, def, boss, dt);   // stagger may outlive EXECUTE
      if (e.t <= 0) {
        e.phase = ENC_PHASE.IDLE;
        const mult = e.enraged ? Math.max(0.7, def.enrageCdMult) : 1;
        e.cd = def.cooldown * mult * (0.88 + encRand(e) * 0.30);
      }
      return;
    }

    default:
      e.phase = ENC_PHASE.IDLE; e.cd = def.cooldown;
      return;
  }
}

/** Build the telegraph geometry at arm time. Nothing here can damage. */
function armTelegraph(g, e, def, boss, p, dist, ndx, ndy) {
  switch (e.id) {
    case 'laser_sweep':
      e.ang0 = Math.atan2(ndy, ndx) - def.sweepArc * 0.5 * def.sweepDir;
      e.ang = e.ang0;
      break;
    case 'orbital_grid': {
      const n = def.markerMin + Math.floor(encRand(e) * (def.markerMax - def.markerMin + 1));
      const count = Math.max(def.markerMin, Math.min(ENC_CAPS.markers, n));
      for (let i = 0; i < count; i++) {
        const a = encRand(e) * Math.PI * 2;
        const r = encRand(e) * def.markerSpread;
        const mx = p.pos.x + Math.cos(a) * r, my = p.pos.y + Math.sin(a) * r;
        if (!finite(mx) || !finite(my)) continue;
        e.markers.push({ x: mx, y: my, r: def.markerRadius, delay: i * def.strikeStagger, t: 0, hit: false, struck: false });
      }
      break;
    }
    case 'serpentine_charge': {
      // Draw the exact curved ribbon the charge will follow — committed at commit(), not re-homed.
      const base = Math.atan2(ndy, ndx);
      const side = encRand(e) < 0.5 ? -1 : 1;
      const n = Math.min(ENC_CAPS.pathPoints, def.pathPoints);
      // The ribbon is exactly as long as the charge can travel (chargeSpeed x execute), so what is
      // drawn is what is travelled. Deriving the step from the player's distance instead made the
      // realised speed scale with range and left the tail of the ribbon permanently unreachable.
      const step = (def.chargeSpeed * def.execute) / n;
      let px = boss.pos.x, py = boss.pos.y, a = base;
      for (let i = 0; i < n; i++) {
        a += (def.chargeCurve / n) * side;
        px += Math.cos(a) * step; py += Math.sin(a) * step;
        if (!finite(px) || !finite(py)) break;
        e.path.push({ x: px, y: py, hit: false });
      }
      break;
    }
    case 'pack_assault':
      e.summonQ = Math.min(def.summonCount, Math.max(0, def.summonCap - e.summons.length));
      e.summonT = 0;
      e.ang0 = Math.atan2(ndy, ndx);
      break;
    default: break;   // forge_slam and cryo_breath need only dirX/dirY, already set
  }
}

/** The instant damage becomes possible. Locks everything that must not re-home. */
function commit(g, e, def, boss, p, ndx, ndy) {
  switch (e.id) {
    case 'forge_slam':
      // ONE application, inside the bounded cone, measured at the moment of impact.
      try { g.screenShake?.trigger?.(def.slamShake, 0.35); } catch (_) {}
      try { g.particles?.spawnExplosion?.(boss.pos.clone ? boss.pos.clone() : { x: boss.pos.x, y: boss.pos.y },
              [def.color, '#ffb347'], 22); } catch (_) {}
      try { g.audio?.playHeavyHit?.(); } catch (_) {}
      if (inCone(boss, p, e.dirX, e.dirY, def.coneHalfAngle, def.coneRange)) {
        hitOnce(e, g, def.slamDamage, { color: def.color, shake: def.slamShake, src: 'stageBoss' });
      }
      break;
    case 'cryo_breath':
      try { g.audio?.playEnemyShoot?.(); } catch (_) {}
      break;
    case 'laser_sweep':
      e.ang0 = Math.atan2(e.dirY, e.dirX) - def.sweepArc * 0.5 * def.sweepDir;
      e.ang = e.ang0;
      break;
    default: break;
  }
}

/** The live effect. Every branch is bounded and applies damage at most once per activation. */
function execute(g, e, def, boss, p, dt, dist) {
  switch (e.id) {
    // Rotating beam. The un-swept wedge stays safe for the whole sweep.
    case 'laser_sweep': {
      e.ang = e.ang0 + def.sweepArc * e.k * def.sweepDir;
      const px = p.pos.x - boss.pos.x, py = p.pos.y - boss.pos.y;
      const pd = Math.hypot(px, py);
      if (pd <= def.sweepLen && pd > 1e-4) {
        const pa = Math.atan2(py, px);
        let d = Math.atan2(Math.sin(pa - e.ang), Math.cos(pa - e.ang));
        // perpendicular distance from the beam line
        if (Math.abs(d) < Math.PI / 2 && Math.abs(Math.sin(d)) * pd <= def.sweepWidth) {
          hitOnce(e, g, def.sweepDamage, { color: def.color, shake: 4, src: 'stageBoss' });
        }
      }
      break;
    }
    // Each marker strikes ONLY where it was drawn, once, after its own delay.
    case 'orbital_grid': {
      for (const m of e.markers) {
        m.t += dt;
        if (m.struck || m.t < def.telegraph * 0 + m.delay + 0.0) continue;
        m.struck = true;
        if (e.strikes.length < ENC_CAPS.strikes) e.strikes.push({ x: m.x, y: m.y, r: m.r, life: 0.35 });
        try { g.particles?.spawnExplosion?.({ x: m.x, y: m.y }, [def.color, '#ffffff'], 12); } catch (_) {}
        const d = Math.hypot(p.pos.x - m.x, p.pos.y - m.y);
        if (d < m.r) hitOnce(e, g, def.strikeDamage, { color: def.color, shake: 5, src: 'stageBoss' });
      }
      for (let i = e.strikes.length - 1; i >= 0; i--) {
        e.strikes[i].life -= dt;
        if (e.strikes[i].life <= 0) e.strikes.splice(i, 1);
      }
      break;
    }
    // Travel the committed ribbon. No re-homing: the path was fixed at arm time.
    case 'serpentine_charge': {
      if (e.path.length === 0) break;
      // SPEED-DRIVEN, not index-driven. Advancing by `chargeSpeed * dt` means the declared tuning
      // actually governs the charge (index-stepping made it 2x faster the further away you stood,
      // and moved the boss in 44px teleports that could skip straight past the player).
      const stepLen = def.chargeSpeed * dt;
      let remain = stepLen;
      let guard = 0;
      while (remain > 0 && e.pathI < e.path.length && guard++ < 64) {
        const n = e.path[e.pathI];
        if (!n || !finite(n.x) || !finite(n.y)) { e.pathI++; continue; }
        const vx = n.x - boss.pos.x, vy = n.y - boss.pos.y;
        const d = Math.hypot(vx, vy);
        if (d <= remain) { boss.pos.x = n.x; boss.pos.y = n.y; remain -= d; e.pathI++; continue; }
        const px0 = boss.pos.x, py0 = boss.pos.y;
        boss.pos.x += (vx / d) * remain; boss.pos.y += (vy / d) * remain;
        // Capsule test along the segment actually travelled this frame — a fast charge can no
        // longer tunnel past a player standing between two sampled nodes.
        if (segDist(px0, py0, boss.pos.x, boss.pos.y, p.pos.x, p.pos.y) < (boss.radius || 38) + def.hitPad) {
          hitOnce(e, g, def.chargeDamage, { color: def.color, shake: 5, src: 'stageBoss' });
        }
        remain = 0;
      }
      break;
    }
    // Frontal cone. The rear is always safe. One damage + one bounded, self-expiring slow.
    case 'cryo_breath': {
      if (inCone(boss, p, e.dirX, e.dirY, def.breathHalfAngle, def.breathRange)) {
        if (hitOnce(e, g, def.breathDamage, { color: def.color, shake: 4, src: 'stageBoss' })) {
          try {
            // Use the CANONICAL player slow. `_chillT` already exists (Player.js:309 applies it to
            // `speed`, Player.js:364 decays it) and is refresh-never-stack by construction, so the
            // breath inherits a proven cap, a proven decay and a proven no-chain-freeze guarantee.
            // A bespoke `_cryoSlowF` was written but nothing ever read it — the slow did nothing.
            p._chillT = Math.max(p._chillT || 0, def.slowDuration);
          } catch (_) {}
        }
      }
      break;
    }
    // Staggered pack. Capped, lifetimed, and cleaned up with the boss.
    case 'pack_assault':
      tickSummons(g, e, def, boss, dt);
      break;
    default: break;
  }
}

/** Shortest distance from point (px,py) to the segment (ax,ay)-(bx,by). */
function segDist(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const L2 = vx * vx + vy * vy;
  const t = L2 > 1e-9 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** True when `p` lies inside the cone rooted at `boss` facing (dx,dy). */
function inCone(boss, p, dx, dy, halfAngle, range) {
  const vx = p.pos.x - boss.pos.x, vy = p.pos.y - boss.pos.y;
  const d = Math.hypot(vx, vy);
  if (!(d > 1e-4) || d > range) return false;
  const dot = (vx / d) * dx + (vy / d) * dy;
  return dot >= Math.cos(halfAngle);
}

/** Release queued summons one at a time, respecting the cap and the stagger. */
function tickSummons(g, e, def, boss, dt) {
  if (e.summonQ <= 0) return;
  e.summonT -= dt;
  if (e.summonT > 0) return;
  e.summonT = def.summonStagger;
  if (e.summons.length >= def.summonCap) { e.summonQ = 0; return; }
  e.summonQ--;
  try {
    const a = e.ang0 + (e.summons.length - 1) * 0.55;
    const sx = boss.pos.x + Math.cos(a) * def.summonDist;
    const sy = boss.pos.y + Math.sin(a) * def.summonDist;
    if (!finite(sx) || !finite(sy)) return;
    // Build the EXACT type and place it where the telegraph said. Routing through Game.spawnEnemy
    // was wrong twice over: the Batch 4.5 biome gate remapped Razorhound to whatever else shares its
    // spawn family, and supplying `_wavePos` forced an ~774px offscreen minimum, so the pack arrived
    // 580-1226px away while the arrowheads pointed at 300px. Both are contract violations of a
    // signature whose entire content is its telegraph.
    const spawned = g.makeBossSummon ? g.makeBossSummon(def.summonType, sx, sy) : null;
    if (spawned) {
      spawned._bossSummon = true;
      spawned._summonLife = def.summonLifetime;
      e.summons.push(spawned);
    }
  } catch (_) { /* a failed summon must never break the frame */ }
}

/** Age summons out and drop dead references. Keeps `summons` bounded with zero global state. */
function pruneSummons(g, e, dt) {
  if (!e.summons.length) return;
  for (let i = e.summons.length - 1; i >= 0; i--) {
    const s = e.summons[i];
    const gone = !s || s.hp <= 0 || s._retired || s.dead || (g.enemies && g.enemies.indexOf(s) < 0);
    if (gone) { e.summons.splice(i, 1); continue; }
    s._summonLife = (s._summonLife || 0) - dt;
    if (s._summonLife <= 0) { s.hp = 0; e.summons.splice(i, 1); }
  }
}

/**
 * Tear an encounter down. Called when the boss dies, on reset, and on a deck transition — every
 * path, so a summon or a marker can never outlive the fight that created it.
 */
export function clearBossEncounter(g, boss) {
  const e = boss && boss._enc;
  if (!e) return;
  try {
    for (const s of e.summons) {
      if (!s) continue;
      s._bossSummon = false;
      if (s.hp > 0) s.hp = 0;
      const i = g?.enemies ? g.enemies.indexOf(s) : -1;
      if (i >= 0) g.enemies.splice(i, 1);
    }
  } catch (_) {}
  e.summons.length = 0; e.markers.length = 0; e.strikes.length = 0; e.path.length = 0;
  e.summonQ = 0; e.phase = ENC_PHASE.IDLE;
  boss._enc = null;
}

/** Remove every tracked boss summon regardless of owner — the reset/deck-transition sweep. */
export function clearAllBossSummons(g) {
  if (!g || !Array.isArray(g.enemies)) return 0;
  let n = 0;
  for (let i = g.enemies.length - 1; i >= 0; i--) {
    const s = g.enemies[i];
    if (s && s._bossSummon) { g.enemies.splice(i, 1); n++; }
  }
  return n;
}

// ── Rendering ────────────────────────────────────────────────────────────────────────────────
// Distinct geometry per signature; nothing opaque, nothing drawn over the player.

/** World-space telegraph + effect for one boss. */
export function drawBossEncounter(g, boss, ctx) {
  const e = boss && boss._enc;
  if (!e || !ctx) return;
  const def = bossSignatureFor(e.bossId);
  if (!def) return;
  const x = boss.pos.x, y = boss.pos.y;
  if (!finite(x) || !finite(y)) return;

  ctx.save();
  ctx.lineCap = 'round';
  try {
    // Spawn-protection shimmer — makes the bounded invulnerability legible instead of confusing.
    if (e.protT > 0) {
      ctx.strokeStyle = def.color;
      ctx.globalAlpha = 0.20 + 0.35 * (e.protT / BOSS_INTRO.protection);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, (boss.radius || 40) + 14, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.phase === ENC_PHASE.INTRO) {
      // Expanding ring: "a boss just landed here".
      const r = (boss.radius || 40) + 30 + 150 * e.k;
      ctx.strokeStyle = def.color; ctx.globalAlpha = 0.55 * (1 - e.k); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore(); return;
    }
    const tele = e.phase === ENC_PHASE.TELEGRAPH, exec = e.phase === ENC_PHASE.EXECUTE;
    if (!tele && !exec) { ctx.restore(); return; }
    const k = tele ? e.tele : 1;

    switch (e.id) {
      // LINE → ARC. Thin aiming line during wind-up, then the swept beam itself.
      case 'laser_sweep': {
        if (tele) {
          const a = e.ang0;
          ctx.strokeStyle = def.color; ctx.globalAlpha = 0.25 + 0.5 * k; ctx.lineWidth = 2;
          ctx.setLineDash([18, 12]);
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * def.sweepLen, y + Math.sin(a) * def.sweepLen); ctx.stroke();
          ctx.setLineDash([]);
          // show the arc it will travel, so the safe wedge is visible before it starts
          ctx.globalAlpha = 0.18 + 0.25 * k; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y, def.sweepLen * 0.55, a, a + def.sweepArc * def.sweepDir); ctx.stroke();
        } else {
          ctx.strokeStyle = def.color; ctx.globalAlpha = 0.85; ctx.lineWidth = def.sweepWidth * 0.55;
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(e.ang) * def.sweepLen, y + Math.sin(e.ang) * def.sweepLen); ctx.stroke();
          ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, def.sweepLen * 0.55, e.ang0, e.ang); ctx.stroke();
        }
        break;
      }
      // CONE. Bounded, and clearly shorter than the screen.
      case 'forge_slam': {
        const a = Math.atan2(e.dirY, e.dirX), h = def.coneHalfAngle, r = def.coneRange;
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = tele ? (0.25 + 0.5 * k) : 0.8;
        ctx.lineWidth = tele ? 2 : 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a - h) * r, y + Math.sin(a - h) * r);
        ctx.arc(x, y, r, a - h, a + h);
        ctx.lineTo(x, y);
        ctx.stroke();
        if (tele) {   // filling wedge shows time-to-impact without covering anything
          ctx.globalAlpha = 0.10 + 0.16 * k;
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * k, a - h, a + h); ctx.closePath(); ctx.fill();
        }
        break;
      }
      // MARKERS. Separate ground rings, each with its own countdown ring.
      case 'orbital_grid': {
        for (const m of e.markers) {
          ctx.strokeStyle = def.color;
          ctx.globalAlpha = m.struck ? 0.25 : (0.30 + 0.45 * k);
          ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          if (!m.struck) {
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(m.x, m.y, Math.max(5, m.r * (1 - k)), 0, Math.PI * 2); ctx.stroke();
          }
        }
        for (const s of e.strikes) {
          ctx.globalAlpha = Math.max(0, s.life / 0.35) * 0.7;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      // PATH. The committed ribbon, drawn as a polyline so it reads as a route, not a blob.
      case 'serpentine_charge': {
        if (!e.path.length) break;
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = tele ? (0.25 + 0.45 * k) : 0.6;
        ctx.lineWidth = tele ? 3 : 5;
        ctx.setLineDash(tele ? [14, 10] : []);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (const n of e.path) ctx.lineTo(n.x, n.y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (tele) {
          const tip = e.path[e.path.length - 1];
          ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.arc(tip.x, tip.y, 16, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      // FRONTAL CONE, wider and shorter than the slam so the two never read alike.
      case 'cryo_breath': {
        const a = Math.atan2(e.dirY, e.dirX), h = def.breathHalfAngle, r = def.breathRange;
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = tele ? (0.25 + 0.45 * k) : 0.75;
        ctx.lineWidth = tele ? 2 : 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a - h) * r, y + Math.sin(a - h) * r);
        ctx.arc(x, y, r, a - h, a + h);
        ctx.lineTo(x, y);
        ctx.stroke();
        if (exec) {   // three nested arcs = the breath itself travelling outward
          for (let i = 1; i <= 3; i++) {
            ctx.globalAlpha = 0.30 * (1 - Math.abs(e.k - i / 4));
            ctx.beginPath(); ctx.arc(x, y, r * (i / 3) * (0.4 + 0.6 * e.k), a - h, a + h); ctx.stroke();
          }
        }
        break;
      }
      // DIRECTIONAL PACK MARKERS. Shows where the pack will come in from.
      case 'pack_assault': {
        const n = Math.max(1, def.summonCount);
        for (let i = 0; i < n; i++) {
          const a = e.ang0 + (i - 1) * 0.55;
          const mx = x + Math.cos(a) * def.summonDist, my = y + Math.sin(a) * def.summonDist;
          ctx.strokeStyle = def.color;
          ctx.globalAlpha = tele ? (0.25 + 0.45 * k) : 0.45;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * ((boss.radius || 40) + 10), y + Math.sin(a) * ((boss.radius || 40) + 10));
          ctx.lineTo(mx, my); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(mx - Math.cos(a) * 16 - Math.sin(a) * 12, my - Math.sin(a) * 16 + Math.cos(a) * 12);
          ctx.lineTo(mx, my);
          ctx.lineTo(mx - Math.cos(a) * 16 + Math.sin(a) * 12, my - Math.sin(a) * 16 - Math.cos(a) * 12);
          ctx.stroke();
        }
        break;
      }
      default: break;
    }
  } catch (_) { /* rendering must never break the frame */ }
  ctx.restore();
}

/**
 * THE shared boss health bar. The audit found three unconnected implementations (a world-space strip
 * duplicated three times, a screen-space bar duplicated twice) and the mech had none at all. This is
 * the single one, drawn in SCREEN space, and it appears for whichever stage boss is live.
 */
export function drawBossHealthBar(ctx, boss, encName, color, W, H) {
  if (!ctx || !boss || !finite(boss.hp) || !finite(boss.maxHp) || boss.maxHp <= 0) return;
  if (boss.hp <= 0) return;
  const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  const barW = Math.min(560, W * 0.46), barH = 12;
  const bx = W / 2 - barW / 2, by = 74;
  ctx.save();
  try {
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(bx - 3, by - 3, barW + 6, barH + 6);
    ctx.fillStyle = color || '#ff3b3b';
    ctx.fillRect(bx, by, Math.round(barW * frac), barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
    ctx.strokeRect(bx - 3.5, by - 3.5, barW + 7, barH + 7);
    // enrage threshold tick at 35%
    ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(bx + barW * 0.35, by - 2); ctx.lineTo(bx + barW * 0.35, by + barH + 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(encName || 'STAGE BOSS'), W / 2, by - 8);
    ctx.textAlign = 'left';
  } catch (_) {}
  ctx.restore();
}
