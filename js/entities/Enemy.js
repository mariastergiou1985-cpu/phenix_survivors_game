import {
  Vec2, ENEMY_RADIUS, WIDTH, HEIGHT, WORLD_W, WORLD_H, WORLD_MARGIN, WORLD_BOUNDS,
  BLUE, MAGENTA, PURPLE, ORANGE, GREEN, RED, YELLOW, WHITE, CYAN, MATRIX_RADIUS,
} from '../constants.js';
import { clamp, distance, safeNormalize, randomRange, randomChoice, drawBar } from '../utils.js';
import { DataCore } from './DataCore.js?v=20260615210000';
import { FloatingText } from './FloatingText.js';
import { drawGlow } from '../game/Effects.js?v=20260615210000';

// ─── Hit/death feedback tuning (visual only — no balance impact) ────────────────
// One place to dial the juice. Particle counts stay small and the ParticleSystem
// has a hard global cap (MAX), so crowded fights never flood.
const FEEDBACK = {
  flashDuration:        0.08,  // seconds an enemy tints white after a hit
  normalDeathParticles: 16,    // spark burst on a normal enemy death
  heavyDeathParticles:  18,    // spark burst on a heavy/elite/boss-type death
  burstSize:            2.8,    // base particle size for the death burst
  heavyRingCount:       16,     // particles forming the heavy-death shock-ring
  heavyRingSpeed:       220,    // outward speed of the heavy-death ring
  heavyRadius:          20,     // enemy radius at/above which a death counts as "heavy"
};

export class Enemy {
  constructor(enemyType, minute) {
    this.enemyType = enemyType;
    this.pos       = this._spawnEdge();
    this.vel       = new Vec2();

    this.carryingCore = null;
    this.dumpTarget   = null;

    this.stealTimer = 0;
    this.hitFlash   = 0;
    this.stunned    = 0;
    this.slowTimer  = 0;     // Cryo Rounds debuff: reduced movement speed while > 0
    this.slowFactor = 0.55;  // speed multiplier while slowed (Suppression lowers it)

    // ── Game Feel ──────────────────────────────────────────────────────────────
    // Knockback impulse (px/s). Decays exponentially each frame; applied before movement AI.
    this._kbx = 0;
    this._kby = 0;
    // Last weapon color that hit this enemy — drives element-specific death particles.
    this._lastHitColor = null;

    const [spd, hp, color, stealTime, contactDamage] = this._statsForType(enemyType, minute);
    this.baseSpeed     = spd;
    this._baseSpeedFull = spd;   // canonical speed; baseSpeed is recomputed each frame with slow
    this.hp            = hp;
    this.color         = color;
    this.stealTime     = stealTime;
    this.contactDamage = contactDamage;
    this.radius        = ENEMY_RADIUS;

    if (enemyType === 'Security Defector Mech')  this.radius = 28;
    else if (enemyType === 'Rogue AI Overlord')   this.radius = 44;
    else if (enemyType === 'Heavy Mech')          this.radius = 22;

    // Phase D flags
    this.isMegaBoss      = false;
    this.bodyguardTarget = null;

    // Endless Elite Waves flag — set AFTER construction by Game._spawnEliteWave (Endless only).
    // Visual/feedback marker only; never alters base stats here or any Act-1 enemy.
    this.isElite         = false;

    // Role-based targeting
    this.role          = this._roleForType(enemyType);
    this.shootTimer    = Math.random() * 2;  // stagger initial shots
    this.shootInterval = null;  // null = melee-only
    this.bulletSpeed   = 0;
    this.bulletDamage  = 0;
    this.bulletRadius  = 5;
    this.bulletColor   = CYAN;
    this._initRole(enemyType);

    // Load enemy sprite
    this.sprite = null;
    this._loadSprite();
  }

  _roleForType(type) {
    switch (type) {
      case 'Glitch Drone':           return 'hunter';
      case 'Rogue Punk':             return 'mixed';
      case 'Stealth Infiltrator':    return 'assassin';
      case 'Overclocked Berserker':  return 'mixed';
      case 'Security Defector Mech': return 'hybrid';
      case 'Rogue AI Overlord':      return 'boss';
      case 'Combat Hunter':          return 'hunter';
      case 'Cyber Shooter':          return 'shooter';
      case 'Heavy Mech':             return 'hunter';
      case 'Razorhound':             return 'hunter';  // fast melee chaser, never steals
      default:                       return 'scavenger';
    }
  }

  _initRole(type) {
    switch (type) {
      case 'Glitch Drone':
        this.shootInterval = 2.5;
        this.bulletSpeed   = 380;
        this.bulletDamage  = 4;
        this.bulletRadius  = 5;
        this.bulletColor   = CYAN;
        break;
      case 'Security Defector Mech':
        this.shootInterval = 2.6;   // threat pass: faster cadence (3.5 → 2.6)
        this.bulletSpeed   = 280;
        this.bulletDamage  = 20;    // ~2x (11 → 20)
        this.bulletRadius  = 9;
        this.bulletColor   = ORANGE;
        break;
      case 'Rogue AI Overlord':
        this.shootInterval = 1.9;   // threat pass: faster cadence (2.5 → 1.9)
        this.bulletSpeed   = 320;
        this.bulletDamage  = 38;    // ~2x (20 → 38)
        this.bulletRadius  = 11;
        this.bulletColor   = RED;
        break;
      case 'Cyber Shooter':
        this.shootInterval = 2.2;
        this.bulletSpeed   = 340;
        this.bulletDamage  = 6;
        this.bulletRadius  = 6;
        this.bulletColor   = CYAN;
        break;
      case 'Heavy Mech':
        this.shootInterval = 4.5;
        this.bulletSpeed   = 180;
        this.bulletDamage  = 11;
        this.bulletRadius  = 9;
        this.bulletColor   = ORANGE;
        break;
    }
  }

  _tryShoot(game) {
    // Lazily arm melee elites with a modest ranged attack so EVERY elite has real projectile threat.
    if (this.isElite && !this.shootInterval) {
      this.shootInterval = 2.6; this.bulletSpeed = 300; this.bulletDamage = 8; this.bulletRadius = 7; this.bulletColor = ORANGE;
    }
    if (!this.shootInterval || this.shootTimer > 0) return;
    this.shootTimer = this.shootInterval;

    const boss = this.isBoss() || this.isMegaBoss;
    // Aim assist — lead the player by a fraction of their velocity (readable, still dodgeable):
    // normal ~45%, elite ~55%, boss ~65%.
    let aim    = boss ? 0.65 : this.isElite ? 0.55 : 0.45;
    if (game._hasProto?.('predator_aim')) aim = Math.min(0.85, aim + 0.12);   // Predator Aim Protocol
    const pv   = game.player.vel || new Vec2();
    const lead = game.player.pos.add(pv.scale(aim * 0.28));
    const dir  = safeNormalize(lead.sub(this.pos));
    if (dir.lengthSq() === 0) return;

    // Multishot — elites/bosses fire a small readable spread (the bullet pool is hard-capped in
    // spawnEnemyBullet, so this can never become an unbounded bullet wall).
    let shots     = boss ? 3 : this.isElite ? 3 : 1;
    if (this.isElite && game.endless && game._hasProto?.('elite_arsenal')) shots += 1;   // Elite Arsenal Protocol (+1 controlled shot; pool stays capped)
    const spread  = boss ? 0.16 : 0.20;
    const baseAng = Math.atan2(dir.y, dir.x);
    const start   = -(shots - 1) / 2;
    for (let s = 0; s < shots; s++) {
      const ang = baseAng + (start + s) * spread;
      game.spawnEnemyBullet(this.pos.clone(), new Vec2(Math.cos(ang), Math.sin(ang)),
        this.bulletSpeed, this.bulletDamage, this.bulletRadius, this.bulletColor);
    }
    game.audio?.playEnemyShoot();
  }

  _loadSprite() {
    const spriteMap = {
      // Primary types — dedicated sprite
      'Glitch Drone':            'glitch_drone',
      'Rogue Punk':              'rogue_punk',
      'Stealth Infiltrator':     'stealth_infiltrator',
      'Security Defector Mech':  'security_defector_mech',
      'Rogue AI Overlord':       'ai_overlord',
      // Secondary types — mapped to closest existing sprite
      'Combat Hunter':           'glitch_drone',
      'Scrap Scavenger':         'rogue_punk',
      'Cyber-Net Junkie':        'stealth_infiltrator',
      'Overclocked Berserker':   'rogue_punk',
      'Cyber Shooter':           'glitch_drone',
      'Heavy Mech':              'security_defector_mech',
      // Bloodfang pack minion — dedicated sprite in minions/ subfolder
      'Razorhound':              'minions/razorhound',
    };
    const spriteFile = spriteMap[this.enemyType];
    if (spriteFile) {
      this.sprite = new Image();
      this.sprite.onerror = () => console.warn(`[Enemy] Sprite failed: assets/enemies/${spriteFile}.png`);
      this.sprite.src = `assets/enemies/${spriteFile}.png?v=20260615210000`;
    } else {
      console.warn(`[Enemy] No sprite mapped for: ${this.enemyType}`);
    }
  }

  _spawnEdge() {
    const B = WORLD_BOUNDS;
    const side = randomChoice(['top', 'bottom', 'left', 'right']);
    if (side === 'top')    return new Vec2(B.left + Math.random() * (B.right - B.left), B.top - 20);
    if (side === 'bottom') return new Vec2(B.left + Math.random() * (B.right - B.left), B.bottom + 20);
    if (side === 'left')   return new Vec2(B.left - 20, B.top + 70 + Math.random() * (B.bottom - B.top - 70));
    return new Vec2(B.right + 20, B.top + 70 + Math.random() * (B.bottom - B.top - 70));
  }

  _statsForType(type, minute) {
    const d = 1 + minute * 0.035;                 // speed scaling (unchanged)

    // HP/contact-damage difficulty multiplier. ~+15% baseline (per spec), then ramps after min 5
    // so 0–5 stays fair and 20+ becomes intense. Applied to NORMAL enemies only.
    let g = 1.15;
    if (minute > 5)  g += (Math.min(minute, 10) - 5)  * 0.07;   // 5→10 : 1.15 → 1.50
    if (minute > 10) g += (Math.min(minute, 20) - 10) * 0.07;   // 10→20: 1.50 → 2.20
    if (minute > 20) g += (minute - 20) * 0.08;                 // 20+  : keeps climbing

    // Gentler ramp for enemy-type mini-bosses (avoids compounding into a brick; the mega-boss
    // also multiplies HP ×3 in Events.js afterward).
    const gB = 1 + minute * 0.03;

    // Threat pass — durability bump by category (small ×1.3 / medium ×1.4 / large ×1.6 / boss ×1.6).
    // Multiplies the time-scaled hp so early Act 1 only rises a fraction of an HP while late-game /
    // Endless (large g) gets the full survivability lift. Bosses move ~+20% faster + hit harder.
    // [speed, hp, color, stealTime, contactDamage (HP/sec)]
    switch (type) {
      case 'Glitch Drone':          return [95 * d,  2.6 * g,  BLUE,    2.00,  6 * g];   // small ×1.3
      case 'Rogue Punk':            return [125 * d, 4.2 * g,  MAGENTA, 1.65, 10 * g];   // medium ×1.4
      case 'Stealth Infiltrator':   return [155 * d, 2.6 * g,  PURPLE,  1.20, 12 * g];   // small ×1.3
      case 'Scrap Scavenger':       return [105 * d, 7 * g,    ORANGE,  1.55,  8 * g];   // medium ×1.4
      case 'Cyber-Net Junkie':      return [135 * d, 5.6 * g,  GREEN,   1.45, 10 * g];   // medium ×1.4
      case 'Overclocked Berserker': return [210 * d, 4.2 * g,  RED,     1.00, 14 * g];   // medium ×1.4
      case 'Security Defector Mech':return [108 * d, 80 * gB, YELLOW,  0.75, 33 * gB];   // mini-boss: hp ×1.6, dmg ×1.5, spd ×1.2
      case 'Rogue AI Overlord':     return [90 * d,  300 * gB, RED,     0.55, 42 * gB];  // boss: hp ×1.6, dmg ×1.5, spd ×1.2; mega-boss ×3 inherits hp
      case 'Combat Hunter':         return [168 * d, 4.2 * g,  MAGENTA, 9999, 12 * g];   // medium ×1.4
      case 'Cyber Shooter':         return [108 * d, 5.6 * g,  CYAN,    9999,  6 * g];   // medium ×1.4
      case 'Heavy Mech':            return [58  * d, 32 * g,   ORANGE,  9999, 20 * g];   // large ×1.6
      case 'Razorhound':            return [200 * d, 21 * g,   RED,     9999,  6 * g];   // large ×1.5
      default:                      return [100,      2.6,     WHITE,   1.80,  6];
    }
  }

  isBoss() {
    return this.enemyType === 'Security Defector Mech' || this.enemyType === 'Rogue AI Overlord';
  }

  takeHit(damage, game) {
    // Achievement Protocol/Card global damage — Endless only (multiplier is 1 in Act 1, so Act 1
    // is unchanged). Single chokepoint for player damage to NORMAL enemies; bosses use a separate
    // hp path and stay unbuffed (respects boss caps). Display reflects the actual damage dealt.
    const dmg      = damage * (game._endlessDamageMult ? game._endlessDamageMult() : 1);
    this.hp       -= dmg;

    // ── Game Feel: hit weight classification ─────────────────────────────────
    const isBossEnemy = this.isBoss() || this.isMegaBoss;
    const isHeavyHit  = dmg >= 40;                       // heavy/crit-level threshold
    const isCritHit   = dmg >= 70;                       // crit-tier (even larger numbers)

    // Hit flash — extend duration for heavy hits so they read even behind sprites
    this.hitFlash = isHeavyHit ? FEEDBACK.flashDuration * 2.2 : FEEDBACK.flashDuration;

    // Knockback impulse — normal enemies only; bosses are immune; elites get half.
    if (!isBossEnemy && game.player) {
      const dx  = this.pos.x - game.player.pos.x;
      const dy  = this.pos.y - game.player.pos.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const str = isHeavyHit ? 290 : 150;
      const kbMult = this.isElite ? 0.45 : 1.0;
      this._kbx = (dx / len) * str * kbMult;
      this._kby = (dy / len) * str * kbMult;
    }

    // Character Weapon Synergy mark-layer hook (no-op unless the matching synergy card is active).
    game._onSynergyHit?.(this);
    // Elemental VFX hook — visible per-character element burst on hit (throttled, bounded).
    game._onElementHit?.(this);

    // Floating damage number — tiered by weight for readability.
    // Normal: small white. Heavy: larger yellow. Crit: even larger + faster rise.
    if (game.floatingTexts.length < 70 && (dmg >= 15 || Math.random() < 0.25)) {
      const dmgPos  = this.pos.add(new Vec2(randomRange(-6, 6), -this.radius - 4));
      const numSize = isCritHit ? 22 : isHeavyHit ? 17 : 14;
      const numRise = isCritHit ? 65 : isHeavyHit ? 52 : 35;
      const numClr  = isCritHit ? '#ff4400' : isHeavyHit ? '#ffdd00' : WHITE;
      const numLife = isCritHit ? 0.8 : isHeavyHit ? 0.65 : 0.5;
      game.floatingTexts.push(new FloatingText('-' + Math.round(dmg), dmgPos, numClr, numLife, numSize, numRise));
    }

    if (this.carryingCore !== null) {
      const dropped = this.carryingCore;
      dropped.pos = this.pos.add(new Vec2(randomRange(-12, 12), randomRange(-12, 12)));
      game.groundCores.push(dropped);
      this.carryingCore = null;
      this.dumpTarget   = null;
      game.player.coresIntercepted++;
      game.floatingTexts.push(new FloatingText('INTERCEPT!', this.pos.clone(), CYAN, 1.2));
    }

    if (this.hp <= 0) {
      this._die(game);
    } else {
      // ── Audio: tier by hit weight ──────────────────────────────────────────
      if (isBossEnemy && isHeavyHit)   game.audio?.playBossHit?.();
      else if (isHeavyHit)             game.audio?.playHeavyHit?.();
      else                             game.audio?.playHit?.();
      // ── Screen shake: light on heavy non-boss hits ──────────────────────────
      if (isHeavyHit && !isBossEnemy)  game.screenShake?.trigger(2, 0.08);
    }
  }

  _die(game) {
    game.audio?.playEnemyDeath?.();
    // Tiered death feedback (visual only). Heavy/elite/boss-type enemies get a larger
    // burst plus an expanding neon shock-ring so big kills read weightier than trash.
    const heavy = this.isBoss() || this.isMegaBoss || this.isElite || this.radius >= FEEDBACK.heavyRadius;
    if (heavy) {
      game.particles.spawnDeathBurst(this.pos, this.color, FEEDBACK.heavyDeathParticles, FEEDBACK.burstSize + 0.8);
      game.particles.spawnDeathRing(this.pos, this.color, FEEDBACK.heavyRingCount, FEEDBACK.heavyRingSpeed, FEEDBACK.burstSize);
    } else {
      game.particles.spawnDeathBurstImproved(this.pos, this.color, FEEDBACK.normalDeathParticles, FEEDBACK.burstSize);
    }
    // Element death burst — uses last weapon hit color so each weapon leaves a distinct
    // visual signature on kill (fire=orange, void=cyan, gravity=purple, etc).
    // spawnElementDeath is capped by the shared particle pool — no extra overhead.
    game.particles.spawnElementDeath?.(this.pos, this._lastHitColor || this.color);
    game.player.kills++;
    game.addKillScore?.(this.pos, this.isElite);

    // Elite reward (Endless): sparse but visible. 18% health, 32% mana, 50% nothing — restores
    // useful HP cells without flooding the grid, and mana stays a strong elite reward.
    if (this.isElite) {
      const r = Math.random();
      if (r < 0.18)      game.healthPickups.push({ pos: this.pos.clone(), timer: 25 });
      else if (r < 0.50) game.manaPickups.push({ pos: this.pos.clone() });
    }
    // Normal-enemy XP scales with elapsed time (+1 every 2 min) so dense late-game
    // crowds still feed steady level-ups; bosses keep their flat high values.
    let xp = this.isMegaBoss ? 42 : (this.isBoss() ? 12 : 1 + Math.floor((game.timeAlive || 0) / 120));
    game.player.gainXp(xp, game.floatingTexts);

    if (this.carryingCore !== null) {
      this.carryingCore.pos = this.pos.clone();
      game.groundCores.push(this.carryingCore);
      this.carryingCore = null;
    }

    const idx = game.enemies.indexOf(this);
    if (idx !== -1) game.enemies.splice(idx, 1);

    if (this.isBoss() || this.isMegaBoss) {
      game.spawnPauseTimer = 10;
      game.floatingTexts.push(new FloatingText('BOSS NEUTRALIZED: SPAWNS PAUSED', this.pos.clone(), YELLOW, 2));
    }

    if (this.isMegaBoss) {
      for (const e of game.enemies) {
        if (e.bodyguardTarget === this) e.bodyguardTarget = null;
      }
      if (game.megaBoss === this) game.megaBoss = null;
    }
  }

  _chooseTargetMatrix(matrices) {
    const valid = matrices.filter(m => m.hasCore());
    if (!valid.length) return null;
    return valid.reduce((a, b) => distance(this.pos, a.pos) < distance(this.pos, b.pos) ? a : b);
  }

  _chooseDumpTarget(matrixPos, playerPos) {
    // Uniform point across the FULL world. (Previously randomPosition()/clamp used the 1280×720
    // viewport, confining every dump to the top-left arena corner — the top-left core-clustering
    // bug, which also pulled carriers back to re-target the top-left Nexus.)
    const worldRand = () => new Vec2(
      randomRange(WORLD_BOUNDS.left + WORLD_BOUNDS.margin, WORLD_BOUNDS.right - WORLD_BOUNDS.margin),
      randomRange(WORLD_BOUNDS.top + WORLD_BOUNDS.margin + 40, WORLD_BOUNDS.bottom - WORLD_BOUNDS.margin),
    );
    let target;
    if (Math.random() < 0.35) {
      target = matrixPos.add(new Vec2(randomRange(-90, 90), randomRange(-90, 90)));
    } else {
      target = worldRand();
      for (let i = 0; i < 20; i++) {
        const t = worldRand();
        if (distance(t, matrixPos) > 260 && distance(t, playerPos) > 170) {
          target = t; break;
        }
      }
    }
    target.x = clamp(target.x, WORLD_BOUNDS.left + WORLD_BOUNDS.margin, WORLD_BOUNDS.right - WORLD_BOUNDS.margin);
    target.y = clamp(target.y, WORLD_BOUNDS.top + WORLD_BOUNDS.margin + 40, WORLD_BOUNDS.bottom - WORLD_BOUNDS.margin);
    return target;
  }

  update(dt, game) {
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // ── Knockback decay (applied before movement AI, independent of role) ────
    // Exponential decay to zero; bosses not displaced (immune). Clamp so micro-drift
    // doesn't persist indefinitely.
    if (this._kbx !== 0 || this._kby !== 0) {
      this.pos.x += this._kbx * dt;
      this.pos.y += this._kby * dt;
      const decay = Math.pow(0.03, dt); // ≈ 0 by ~0.3 s at 60 fps
      this._kbx *= decay;
      this._kby *= decay;
      if (Math.abs(this._kbx) < 1 && Math.abs(this._kby) < 1) { this._kbx = 0; this._kby = 0; }
    }

    // Cryo Rounds slow — recompute effective speed each frame (all movement branches
    // read this.baseSpeed). Bosses are immune so they stay threatening.
    if (this.slowTimer > 0) this.slowTimer -= dt;
    this.baseSpeed = (this.slowTimer > 0 && !this.isBoss() && !this.isMegaBoss)
      ? this._baseSpeedFull * (this.slowFactor || 0.55)
      : this._baseSpeedFull;
    if (this.stunned > 0)  { this.stunned -= dt; return; }

    // Boss / mini-boss corruption blood-trail — drop a damaging pool periodically while alive
    // (player-only DoT, hard-capped + auto-expiring in Game._spawnBossTrail/_updateBossTrails).
    if (this.isBoss() || this.isMegaBoss) {
      this._trailCd = (this._trailCd || 0) - dt;
      if (this._trailCd <= 0) { this._trailCd = 0.45; game._spawnBossTrail?.(this.pos); }
    }

    const { player, matrices } = game;

    // Bodyguard: path toward the mega-boss while alive
    if (this.bodyguardTarget !== null) {
      if (game.enemies.includes(this.bodyguardTarget)) {
        const dir = safeNormalize(this.bodyguardTarget.pos.sub(this.pos));
        this.vel = dir.scale(this.baseSpeed);
        this.pos.addMut(this.vel.scale(dt));
        return;
      }
      this.bodyguardTarget = null;
    }

    const playerDist = distance(this.pos, player.pos);
    let repelStrength = 1.0;
    if (this.enemyType === 'Overclocked Berserker') repelStrength = 0.25;
    else if (this.isBoss())                          repelStrength = 0.0;

    // ── Carrying state: flee to dump target ──────────────────────────────
    if (this.carryingCore !== null) {
      if (this.dumpTarget === null)
        this.dumpTarget = this._chooseDumpTarget(this.pos, player.pos);

      let dir = safeNormalize(this.dumpTarget.sub(this.pos));

      if (playerDist < player.repelRadius * 1.2) {
        const flee = safeNormalize(this.pos.sub(player.pos));
        dir = safeNormalize(dir.add(flee.scale(1.7)));
      }

      const stealMult = game.stealSpeedMultiplier || 1;
      this.vel = dir.scale(this.baseSpeed * 1.15 * stealMult);
      this.pos.addMut(this.vel.scale(dt));
      this.carryingCore.pos = this.pos.add(new Vec2(0, -22));

      if (distance(this.pos, this.dumpTarget) < 22) {
        this.carryingCore.pos = this.pos.clone();
        game.groundCores.push(this.carryingCore);
        game.floatingTexts.push(new FloatingText('CORE DUMPED!', this.pos.clone(), RED, 0.9));
        this.carryingCore = null;
        this.dumpTarget   = null;
      }
      return;
    }

    // ── Role-based targeting ──────────────────────────────────────────────
    if (this.shootTimer > 0) this.shootTimer -= dt;

    // Elites always have projectile threat regardless of role (lazily armed in _tryShoot).
    if (this.isElite) this._tryShoot(game);

    if (this.role === 'hunter' || this.role === 'assassin') {
      // Always chase player — bypass repel aura
      let dir = safeNormalize(player.pos.sub(this.pos));
      let burst = 1;
      if (this.role === 'assassin' && Math.random() < 0.01) burst = 2;
      this.vel = dir.scale(this.baseSpeed * burst);
      this.pos.addMut(this.vel.scale(dt));
      this._tryShoot(game);
      return;
    }

    if (this.role === 'shooter') {
      // Keep preferred distance, shoot frequently, never targets matrices
      const PREF_DIST = 300;
      let dir = new Vec2();
      if (playerDist < PREF_DIST - 60)       dir = safeNormalize(this.pos.sub(player.pos));
      else if (playerDist > PREF_DIST + 100)  dir = safeNormalize(player.pos.sub(this.pos));
      this.vel = dir.scale(this.baseSpeed);
      this.pos.addMut(this.vel.scale(dt));
      this._tryShoot(game);
      return;
    }

    if (this.role === 'mixed' && playerDist < 280) {
      // Chase player when nearby — ignore repel aura
      let dir = safeNormalize(player.pos.sub(this.pos));
      if (this.enemyType === 'Overclocked Berserker')
        dir = safeNormalize(dir.add(new Vec2(randomRange(-1, 1), randomRange(-1, 1)).scale(0.75)));
      this.vel = dir.scale(this.baseSpeed);
      this.pos.addMut(this.vel.scale(dt));
      return;
    }

    if (this.role === 'hybrid' || this.role === 'boss') {
      this._tryShoot(game);  // falls through to existing matrix behavior
    }

    // ── Repel aura ───────────────────────────────────────────────────────
    if (playerDist < player.repelRadius && repelStrength > 0) {
      const flee = safeNormalize(this.pos.sub(player.pos));
      this.vel = flee.scale(this.baseSpeed * (1.05 + repelStrength));
      this.pos.addMut(this.vel.scale(dt));
      this.stealTimer = Math.max(0, this.stealTimer - dt * 2);
      return;
    }

    // ── Seek nearest matrix ──────────────────────────────────────────────
    const target = this._chooseTargetMatrix(matrices);
    if (target === null) {
      const wander = safeNormalize(player.pos.sub(this.pos));
      this.pos.addMut(wander.scale(this.baseSpeed * 0.3 * dt));
      return;
    }

    const toMatrix = target.pos.sub(this.pos);
    if (toMatrix.length() > MATRIX_RADIUS + this.radius + 4) {
      let dir = safeNormalize(toMatrix);

      // Stealth burst
      let burst = 1;
      if (this.enemyType === 'Stealth Infiltrator' && Math.random() < 0.01) burst = 2;

      // Berserker jitter
      if (this.enemyType === 'Overclocked Berserker') {
        dir = safeNormalize(dir.add(new Vec2(randomRange(-1, 1), randomRange(-1, 1)).scale(0.75)));
      }

      this.vel = dir.scale(this.baseSpeed * burst);
      this.pos.addMut(this.vel.scale(dt));
      this.stealTimer = 0;
    } else {
      // ── Steal from matrix (gradual) ──────────────────────────────────
      // Each steal now removes a WHOLE core of charge (3–5), so steals are slower: ~3.5s
      // each → one enemy drains a full 12-charge Matrix in ~10s, leaving time to react.
      // Per-type flavor kept as a mild factor; no time-based acceleration.
      const stealMult      = game.stealSpeedMultiplier || 1;
      const SECONDS_PER_CORE = 3.5;
      const typeFactor     = Math.min(1.2, Math.max(0.7, this.stealTime / 1.5));
      const effectiveTime  = Math.max(0.9, (SECONDS_PER_CORE * typeFactor) / stealMult);
      this.stealTimer += dt;
      target.hackTimer = 0.15;

      if (this.stealTimer >= effectiveTime) {
        this.stealTimer = 0;
        const stolen = target.stealCore();

        if (stolen !== null) {
          this.carryingCore = stolen;
          this.dumpTarget   = this._chooseDumpTarget(target.pos, player.pos);
          game.floatingTexts.push(new FloatingText('CORE STOLEN!', target.pos.clone(), RED, 1));

          // Stealth Infiltrator steals an extra core to scatter
          if (this.enemyType === 'Stealth Infiltrator' && target.hasCore()) {
            const extra = target.stealCore();
            if (extra) {
              extra.pos = target.pos.add(new Vec2(randomRange(-40, 40), randomRange(-40, 40)));
              game.groundCores.push(extra);
            }
          }

          // Security Defector Mech plunders nearby matrices
          if (this.enemyType === 'Security Defector Mech') {
            for (let i = 0; i < 5; i++) {
              const nearby = randomChoice(matrices);
              if (nearby.hasCore()) {
                const extra = nearby.stealCore();
                if (extra) {
                  extra.pos = nearby.pos.add(new Vec2(randomRange(-80, 80), randomRange(-80, 80)));
                  game.groundCores.push(extra);
                }
              }
            }
          }
        }
      }
    }
  }

  keepInBounds() {
    this.pos.x = clamp(this.pos.x, WORLD_BOUNDS.left - 30, WORLD_BOUNDS.right + 30);
    this.pos.y = clamp(this.pos.y, WORLD_BOUNDS.top + 40,   WORLD_BOUNDS.bottom + 30);
  }

  // Role → distinct shape + outline color (read at a glance, no shadowBlur → cheap at 280 enemies).
  _drawRoleMarker(ctx) {
    let shape, color, lw, pad;
    if (this.isMegaBoss || this.isBoss()) { shape = 'hexagon'; color = PURPLE; lw = 3; pad = 6; }
    else switch (this.enemyType) {
      case 'Heavy Mech':            shape = 'square';   color = RED;       lw = 3;   pad = 4; break;  // tank
      case 'Stealth Infiltrator':
      case 'Overclocked Berserker':
      case 'Razorhound':
      case 'Combat Hunter':         shape = 'triangle'; color = ORANGE;    lw = 2.5; pad = 5; break;  // runner
      case 'Glitch Drone':
      case 'Rogue Punk':
      case 'Scrap Scavenger':
      case 'Cyber-Net Junkie':      shape = 'diamond';  color = YELLOW;    lw = 2;   pad = 4; break;  // core-stealer
      case 'Cyber Shooter':         shape = 'hexagon';  color = MAGENTA;   lw = 2;   pad = 4; break;  // shooter
      default:                      shape = 'circle';   color = '#cfe0f2'; lw = 1.5; pad = 3; break;  // basic drone
    }
    const r = this.radius + pad, x = this.pos.x, y = this.pos.y;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath();
    switch (shape) {
      case 'circle':   ctx.arc(x, y, r, 0, Math.PI * 2); break;
      case 'square':   ctx.rect(x - r, y - r, r * 2, r * 2); break;
      case 'diamond':  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); break;
      case 'triangle': ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.92, y + r * 0.7); ctx.lineTo(x - r * 0.92, y + r * 0.7); ctx.closePath(); break;
      case 'hexagon':  for (let k = 0; k < 6; k++) { const ang = (Math.PI / 3) * k + Math.PI / 6; const px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r; k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.closePath(); break;
    }
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx) {
    const drawColor = this.hitFlash > 0 ? WHITE : this.color;

    // Pulsing glow for carrying enemies
    if (this.carryingCore !== null) {
      const t     = performance.now() * 0.008;
      const glowR = Math.round(this.radius + 10 + 5 * Math.sin(t));
      ctx.strokeStyle = RED;    ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, glowR, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = ORANGE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, glowR + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = YELLOW; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, glowR + 10, 0, Math.PI * 2); ctx.stroke();

      // Line from enemy to carried core
      if (this.carryingCore.pos) {
        ctx.strokeStyle = RED; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.pos.x, this.pos.y);
        ctx.lineTo(this.carryingCore.pos.x, this.carryingCore.pos.y);
        ctx.stroke();
      }
    }

    // Try to draw sprite if loaded
    const spritePath = this.sprite && this.sprite.complete && this.sprite.naturalWidth > 0;
    if (spritePath) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.sprite, this.pos.x - this.radius, this.pos.y - this.radius, this.radius * 2, this.radius * 2);
      ctx.imageSmoothingEnabled = true;
    } else {
      // Fallback: Body — bosses drawn as rectangles
      if (this.isBoss()) {
        const r = this.radius;
        ctx.fillStyle   = drawColor;
        ctx.strokeStyle = WHITE; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(this.pos.x - r, this.pos.y - r, r * 2, r * 2, 5);
        ctx.fill(); ctx.stroke();

        // Extra inner rect for mega-boss / Overlord
        if (this.isMegaBoss || this.enemyType === 'Rogue AI Overlord') {
          ctx.strokeStyle = RED; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(this.pos.x - r * 0.6, this.pos.y - r * 0.6, r * 1.2, r * 1.2, 3);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = drawColor;
        ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Role silhouette marker — a shape + colored outline so roles read INSTANTLY at high
    // density (not by base color alone). Color language: boss=purple, tank=red, runner=orange,
    // core-stealer=gold, shooter=magenta, basic=steel.
    this._drawRoleMarker(ctx);

    // Elite marker (Endless elite waves) — pulsing gold glow + ring so elites read
    // instantly against the normal horde. Purely visual; no balance impact.
    if (this.isElite) {
      const t     = performance.now() * 0.006;
      const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t));
      drawGlow(ctx, this.pos.x, this.pos.y, this.radius + 7, '#FFD700', 0.22 * pulse);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Additive hit flash — visible over sprites (color depends on enemy type)
    if (this.hitFlash > 0) {
      const flashColor = this.isBoss() ? RED : (this.role === 'assassin' ? CYAN : WHITE);
      drawGlow(ctx, this.pos.x, this.pos.y, this.radius + 4, flashColor, Math.min(0.6, this.hitFlash * 6));
    }

    // Stunned — cyan electric glow + outline while frozen
    if (this.stunned > 0) {
      drawGlow(ctx, this.pos.x, this.pos.y, this.radius + 5, CYAN, 0.4);
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius + 4, 0, Math.PI * 2); ctx.stroke();
    }

    // Small HP bar
    if (this.hp > 1) {
      const bw = this.radius * 2;
      drawBar(ctx, this.pos.x - bw / 2, this.pos.y - this.radius - 12, bw, 4, this.hp, Math.max(this.hp, 5), RED);
    }

    // Steal progress ring
    if (this.stealTimer > 0) {
      ctx.strokeStyle = RED; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius + 6, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
