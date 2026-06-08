import {
  Vec2, ENEMY_RADIUS, WIDTH, HEIGHT, WORLD_W, WORLD_H, WORLD_MARGIN,
  BLUE, MAGENTA, PURPLE, ORANGE, GREEN, RED, YELLOW, WHITE, CYAN, MATRIX_RADIUS,
} from '../constants.js?v=50';
import { clamp, distance, safeNormalize, randomPosition, randomRange, randomChoice, drawBar } from '../utils.js';
import { DataCore } from './DataCore.js';
import { FloatingText } from './FloatingText.js';
import { drawGlow } from '../game/Effects.js?v=2';

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

    const [spd, hp, color, stealTime, contactDamage] = this._statsForType(enemyType, minute);
    this.baseSpeed     = spd;
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
        this.bulletDamage  = 5;
        this.bulletRadius  = 5;
        this.bulletColor   = CYAN;
        break;
      case 'Security Defector Mech':
        this.shootInterval = 3.5;
        this.bulletSpeed   = 250;
        this.bulletDamage  = 15;
        this.bulletRadius  = 9;
        this.bulletColor   = ORANGE;
        break;
      case 'Rogue AI Overlord':
        this.shootInterval = 2.5;
        this.bulletSpeed   = 300;
        this.bulletDamage  = 20;
        this.bulletRadius  = 11;
        this.bulletColor   = RED;
        break;
      case 'Cyber Shooter':
        this.shootInterval = 2.2;
        this.bulletSpeed   = 340;
        this.bulletDamage  = 8;
        this.bulletRadius  = 6;
        this.bulletColor   = CYAN;
        break;
      case 'Heavy Mech':
        this.shootInterval = 4.5;
        this.bulletSpeed   = 180;
        this.bulletDamage  = 15;
        this.bulletRadius  = 9;
        this.bulletColor   = ORANGE;
        break;
    }
  }

  _tryShoot(game) {
    if (!this.shootInterval || this.shootTimer > 0) return;
    this.shootTimer = this.shootInterval;
    const dir = safeNormalize(game.player.pos.sub(this.pos));
    if (dir.lengthSq() === 0) return;
    game.spawnEnemyBullet(this.pos.clone(), dir,
      this.bulletSpeed, this.bulletDamage, this.bulletRadius, this.bulletColor);
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
      this.sprite.src = `assets/enemies/${spriteFile}.png?v=30`;
    } else {
      console.warn(`[Enemy] No sprite mapped for: ${this.enemyType}`);
    }
  }

  _spawnEdge() {
    const side = randomChoice(['top', 'bottom', 'left', 'right']);
    if (side === 'top')    return new Vec2(Math.random() * WORLD_W, -20);
    if (side === 'bottom') return new Vec2(Math.random() * WORLD_W, WORLD_H + 20);
    if (side === 'left')   return new Vec2(-20, 70 + Math.random() * (WORLD_H - 70));
    return new Vec2(WORLD_W + 20, 70 + Math.random() * (WORLD_H - 70));
  }

  _statsForType(type, minute) {
    const d = 1 + minute * 0.035;
    // [speed, hp, color, stealTime, contactDamage (HP/sec)]
    switch (type) {
      case 'Glitch Drone':          return [95 * d,  2,   BLUE,    2.00,  6];
      case 'Rogue Punk':            return [125 * d, 3,   MAGENTA, 1.65, 10];
      case 'Stealth Infiltrator':   return [155 * d, 2,   PURPLE,  1.20, 12];
      case 'Scrap Scavenger':       return [105 * d, 5,   ORANGE,  1.55,  8];
      case 'Cyber-Net Junkie':      return [135 * d, 4,   GREEN,   1.45, 10];
      case 'Overclocked Berserker': return [210 * d, 3,   RED,     1.00, 14];
      case 'Security Defector Mech':return [90 * d,  30,  YELLOW,  0.75, 18];
      case 'Rogue AI Overlord':     return [75 * d,  120, RED,     0.55, 25];
      case 'Combat Hunter':         return [168 * d,  3,  MAGENTA, 9999, 12];
      case 'Cyber Shooter':         return [108 * d,  4,  CYAN,    9999,  6];
      case 'Heavy Mech':            return [58  * d, 20,  ORANGE,  9999, 20];
      case 'Razorhound':            return [200 * d, 14,  RED,     9999,  6];
      default:                      return [100,      2,   WHITE,   1.80,  6];
    }
  }

  isBoss() {
    return this.enemyType === 'Security Defector Mech' || this.enemyType === 'Rogue AI Overlord';
  }

  takeHit(damage, game) {
    this.hp       -= damage;
    this.hitFlash  = 0.08;

    // Floating damage number (render-only; short life avoids spam)
    const dmgPos = this.pos.add(new Vec2(randomRange(-6, 6), -this.radius - 4));
    game.floatingTexts.push(new FloatingText('-' + damage, dmgPos, WHITE, 0.5));

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
      game.audio?.playHit();
    }
  }

  _die(game) {
    game.audio?.playDeath();
    game.particles.spawnDeathBurst(this.pos, this.color);
    game.player.kills++;
    game.addKillScore?.(this.pos);
    let xp = this.isMegaBoss ? 42 : (this.isBoss() ? 12 : 1);
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
    let target;
    if (Math.random() < 0.35) {
      target = matrixPos.add(new Vec2(randomRange(-90, 90), randomRange(-90, 90)));
    } else {
      target = randomPosition();
      for (let i = 0; i < 20; i++) {
        const t = randomPosition();
        if (distance(t, matrixPos) > 260 && distance(t, playerPos) > 170) {
          target = t; break;
        }
      }
    }
    target.x = clamp(target.x, WORLD_MARGIN, WIDTH  - WORLD_MARGIN);
    target.y = clamp(target.y, WORLD_MARGIN + 40, HEIGHT - WORLD_MARGIN);
    return target;
  }

  update(dt, game) {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.stunned > 0)  { this.stunned -= dt; return; }

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
      // ── Steal from matrix ────────────────────────────────────────────
      const volatilityBonus = game.coreVolatilityMultiplier();
      const stealMult       = game.stealSpeedMultiplier || 1;
      const effectiveTime   = this.stealTime / (volatilityBonus * stealMult);
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
    this.pos.x = clamp(this.pos.x, -30, WORLD_W + 30);
    this.pos.y = clamp(this.pos.y, 40,  WORLD_H + 30);
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

    // Additive hit flash — visible over sprites (color depends on enemy type)
    if (this.hitFlash > 0) {
      const flashColor = this.isBoss() ? RED : (this.role === 'assassin' ? CYAN : WHITE);
      drawGlow(ctx, this.pos.x, this.pos.y, this.radius + 4, flashColor, Math.min(0.6, this.hitFlash * 6));
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
