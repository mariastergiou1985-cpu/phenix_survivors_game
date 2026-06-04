import {
  Vec2, ENEMY_RADIUS, WIDTH, HEIGHT, WORLD_MARGIN,
  BLUE, MAGENTA, PURPLE, ORANGE, GREEN, RED, YELLOW, WHITE, CYAN, MATRIX_RADIUS,
} from '../constants.js';
import { clamp, distance, safeNormalize, randomPosition, randomRange, randomChoice, drawBar } from '../utils.js';
import { DataCore } from './DataCore.js';
import { FloatingText } from './FloatingText.js';

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

    const [spd, hp, color, stealTime] = this._statsForType(enemyType, minute);
    this.baseSpeed = spd;
    this.hp        = hp;
    this.color     = color;
    this.stealTime = stealTime;
    this.radius    = ENEMY_RADIUS;

    if (enemyType === 'Security Defector Mech')  this.radius = 28;
    else if (enemyType === 'Rogue AI Overlord')   this.radius = 44;

    // Phase D flags
    this.isMegaBoss      = false;
    this.bodyguardTarget = null;

    // Load enemy sprite
    this.sprite = null;
    this._loadSprite();
  }

  _loadSprite() {
    const spriteMap = {
      'Glitch Drone': 'glitch_drone',
      'Rogue Punk': 'rogue_punk',
      'Stealth Infiltrator': 'stealth_infiltrator',
      'Security Defector Mech': 'security_defector_mech',
      'Rogue AI Overlord': 'ai_overlord',
    };
    const spriteFile = spriteMap[this.enemyType];
    if (spriteFile) {
      this.sprite = new Image();
      this.sprite.src = `assets/enemies/${spriteFile}.png`;
    }
  }

  _spawnEdge() {
    const side = randomChoice(['top', 'bottom', 'left', 'right']);
    if (side === 'top')    return new Vec2(Math.random() * WIDTH, -20);
    if (side === 'bottom') return new Vec2(Math.random() * WIDTH, HEIGHT + 20);
    if (side === 'left')   return new Vec2(-20, 70 + Math.random() * (HEIGHT - 70));
    return new Vec2(WIDTH + 20, 70 + Math.random() * (HEIGHT - 70));
  }

  _statsForType(type, minute) {
    const d = 1 + minute * 0.035;
    switch (type) {
      case 'Glitch Drone':          return [95 * d,  2,   BLUE,   2.00];
      case 'Rogue Punk':            return [125 * d, 3,   MAGENTA, 1.65];
      case 'Stealth Infiltrator':   return [155 * d, 2,   PURPLE,  1.20];
      case 'Scrap Scavenger':       return [105 * d, 5,   ORANGE,  1.55];
      case 'Cyber-Net Junkie':      return [135 * d, 4,   GREEN,   1.45];
      case 'Overclocked Berserker': return [210 * d, 3,   RED,     1.00];
      case 'Security Defector Mech':return [90 * d,  30,  YELLOW,  0.75];
      case 'Rogue AI Overlord':     return [75 * d,  120, RED,     0.55];
      default:                      return [100,      2,   WHITE,   1.80];
    }
  }

  isBoss() {
    return this.enemyType === 'Security Defector Mech' || this.enemyType === 'Rogue AI Overlord';
  }

  takeHit(damage, game) {
    this.hp       -= damage;
    this.hitFlash  = 0.08;

    if (this.carryingCore !== null) {
      const dropped = this.carryingCore;
      dropped.pos = this.pos.add(new Vec2(randomRange(-12, 12), randomRange(-12, 12)));
      game.groundCores.push(dropped);
      this.carryingCore = null;
      this.dumpTarget   = null;
      game.player.coresIntercepted++;
      game.floatingTexts.push(new FloatingText('INTERCEPT!', this.pos.clone(), CYAN, 1.2));
    }

    if (this.hp <= 0) this._die(game);
  }

  _die(game) {
    game.player.kills++;
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
    this.pos.x = clamp(this.pos.x, -30, WIDTH  + 30);
    this.pos.y = clamp(this.pos.y, 40,  HEIGHT + 30);
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
      ctx.drawImage(this.sprite, this.pos.x - this.radius, this.pos.y - this.radius, this.radius * 2, this.radius * 2);
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
