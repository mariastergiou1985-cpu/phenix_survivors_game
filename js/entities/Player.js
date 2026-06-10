import { Vec2, WIDTH, HEIGHT, WORLD_W, WORLD_H, WORLD_MARGIN, PLAYER_RADIUS, CYAN, WHITE, YELLOW, GREEN, BLUE, RED } from '../constants.js?v=50';
import { clamp, safeNormalize } from '../utils.js';
import { Projectile } from './Projectile.js?v=3';
import { FloatingText } from './FloatingText.js';

export class Player {
  constructor(selectedCharacter = null) {
    this.pos = new Vec2(WORLD_W / 2, WORLD_H / 2);
    this.vel = new Vec2();

    this.selectedCharacter = selectedCharacter || 'skeleton_warrior';
    this.characterSprite = null;
    this.attackSprite    = null;
    this._loadCharacterSprite();

    this.baseSpeed  = 230;
    this.speedBonus = 0.0;

    this.hp     = 100;
    this.maxHp  = 100;

    this.stamina    = 100;
    this.maxStamina = 100;

    this.mana    = 100;   // starts full; future specials spend it, pickups refill +25
    this.maxMana = 100;

    // Bite debuffs (Bloodfang Packmaster / Razorhounds)
    this.staggerTimer      = 0.0;  // reduced movement + stamina regen while > 0
    this.stunImmunityTimer = 0.0;  // blocks NEW stagger (anti chain-lock) while > 0
    this.bleedTimer        = 0.0;  // 1 HP/s while > 0 (refresh, never stacks)

    this.pickupRadius = 72;
    this.returnRadius = 70;
    this.repelRadius  = 115;

    this.contactDamageReduction = 0;

    if (this.selectedCharacter === 'skeleton_warrior') {
      this.maxHp   = 130;
      this.hp      = 130;
      this.baseSpeed = Math.round(230 * 0.90);   // 207
      this.contactDamageReduction = 0.15;
    } else if (this.selectedCharacter === 'taekwondo_girl') {
      this.maxHp        = 90;
      this.hp           = 90;
      this.baseSpeed    = Math.round(230 * 1.20); // 276
      this.pickupRadius = 100;
    }

    this.carry        = 0;
    this.maxCarry     = 5;
    this.carriedCores = [];   // values of carried cores (3 = silver, 5 = gold), FIFO on deposit

    this.dashTimer    = 0.0;
    this.dashCooldown = 0.0;
    this.dashDuration = 0.16;
    this.dashSpeed    = 560;

    this.specialCooldown    = 0.0;
    this.specialMaxCooldown = 25.0;
    this.specialDashDir     = new Vec2(1, 0);
    this.specialDashTimer   = 0.0;

    this.lastFacingDir = new Vec2(1, 0);
    this._dashDir      = new Vec2(1, 0);
    this._dashTrail    = [];

    this.shootCooldown = 0.0;

    this.level        = 1;
    this.xp           = 0;
    this.xpToNext     = this._xpForLevel(1);   // XP needed to reach level 2
    this.pendingLevelupCount = 0;

    // Projectile tuning (raised by upgrade cards)
    this.projSpeedBonus = 0.0;   // +% projectile travel speed
    this.fireRateBonus  = 0.0;   // +% shots per second

    this.kills             = 0;
    this.coresSecured      = 0;
    this.coresIntercepted  = 0;

    this.upgrades = {
      'Cyber-Legs': 0, 'Memory Bank': 0, 'Tractor Beam': 0,
      'Firewall Protection': 0, 'Pulse Damage': 0, 'Homing Disc': 0,
      'EMP Cloud': 0, 'Quantum Overhaul': 0,
      'Fire Rate': 0, 'Projectile Speed': 0, 'Cryo Rounds': 0,
      'Max HP': 0, 'Max Mana': 0, 'Grid Investor': 0, 'Suppression': 0,
    };

    // Ability cooldown timers
    this.sonicPulseCooldown  = 0.0;
    this.empCloudCooldown    = 0.0;
    this.homingDiscTimer     = 0.0;
    this.quantumOverhaulTimer = 0.0;

    // Pulse Shield (Q): cyan bubble, cuts incoming damage 60% for 7s, 25s cooldown
    this.shieldTimer            = 0.0;   // seconds of active shield remaining
    this.shieldDuration         = 7.0;
    this.pulseShieldCooldown    = 0.0;
    this.pulseShieldMaxCooldown = 25.0;
  }

  // Single chokepoint for incoming combat damage so Pulse Shield can scale it (60% reduction).
  // When the shield is inactive this is identical to a plain hp subtraction (no balance change).
  applyDamage(amount) {
    const mult = this.shieldTimer > 0 ? 0.4 : 1;
    this.hp = Math.max(0, this.hp - amount * mult);
  }

  _loadCharacterSprite() {
    const spritePath = `assets/characters/${this.selectedCharacter}.png`;
    this.characterSprite = new Image();
    this.characterSprite.src = spritePath;

    const attackMap = {
      'skeleton_warrior': 'assets/effects/attacks/bone_shockwave.png',
      'taekwondo_girl':   'assets/effects/attacks/lightning_kick_arc.png',
      'cyber_arm_hero':   'assets/effects/attacks/cyber_arm_pulse_beam.png',
    };
    const attackPath = attackMap[this.selectedCharacter];
    if (attackPath) {
      this.attackSprite = new Image();
      this.attackSprite.src = attackPath;
    }
  }

  _getCharacterFallbackColors() {
    switch (this.selectedCharacter) {
      case 'skeleton_warrior': return { primary: '#8B0050', secondary: '#FF0080' };
      case 'taekwondo_girl': return { primary: '#00D9FF', secondary: '#0099CC' };
      case 'cyber_arm_hero': return { primary: '#FF6600', secondary: '#CC0000' };
      default: return { primary: CYAN, secondary: WHITE };
    }
  }

  get speed()             { return this.baseSpeed * (1 + this.speedBonus); }
  get overloadDampening() { return this.upgrades['Firewall Protection'] * 0.02; }

  // Smooth quadratic curve (XP to go from `level` → `level+1`). Gentle early so the
  // first minutes don't level instantly, then a steady rise that NEVER runs away
  // exponentially — combined with time-scaled kill XP (Enemy._die) this keeps
  // level-up cards arriving regularly through mid and late game.
  _xpForLevel(level) {
    // Slightly slower early (so the new higher enemy density doesn't strobe level-ups),
    // a steady quadratic mid-game, and — paired with time-scaled kill XP in Enemy._die —
    // still regular level-ups in the late game.
    return Math.round(6 + level * 4 + level * level * 0.7);
  }

  gainXp(amount, floatingTexts) {
    this.xp += amount;
    floatingTexts.push(new FloatingText(`+${amount} TECH-XP`, this.pos.clone(), GREEN));

    while (this.xp >= this.xpToNext) {
      this.xp      -= this.xpToNext;
      this.level++;
      this.xpToNext = this._xpForLevel(this.level);
      this.pendingLevelupCount++;
    }
  }

  applyUpgrade(upgradeDef) {
    upgradeDef.apply(this);
  }

  update(dt, input) {
    const { keys, mousePos, mouseDown } = input;

    const dir = new Vec2();
    if (keys.has('w') || keys.has('arrowup'))    dir.y -= 1;
    if (keys.has('s') || keys.has('arrowdown'))  dir.y += 1;
    if (keys.has('a') || keys.has('arrowleft'))  dir.x -= 1;
    if (keys.has('d') || keys.has('arrowright')) dir.x += 1;
    dir.normalizeMut();

    this.dashCooldown     = Math.max(0, this.dashCooldown - dt);
    if (this.specialCooldown > 0) this.specialCooldown -= dt;
    this.shootCooldown    = Math.max(0, this.shootCooldown - dt);
    this.sonicPulseCooldown = Math.max(0, this.sonicPulseCooldown - dt);
    this.empCloudCooldown   = Math.max(0, this.empCloudCooldown - dt);
    this.shieldTimer         = Math.max(0, this.shieldTimer - dt);
    this.pulseShieldCooldown = Math.max(0, this.pulseShieldCooldown - dt);

    // Bite debuff timers + bleed tick (1 HP/s)
    if (this.staggerTimer > 0)      this.staggerTimer      -= dt;
    if (this.stunImmunityTimer > 0) this.stunImmunityTimer -= dt;
    if (this.bleedTimer > 0)      { this.bleedTimer -= dt; this.hp = Math.max(0, this.hp - dt); }

    if (dir.lengthSq() > 0) this.lastFacingDir = dir.clone();

    const dashCost  = this.selectedCharacter === 'taekwondo_girl' ? 30 : 35;
    const regenRate = this.selectedCharacter === 'taekwondo_girl' ? 28.75 : 25;
    const dashDir   = dir.lengthSq() > 0 ? dir : this.lastFacingDir;

    const wantsDash = keys.has('shift');  // SPACE reserved for future special ability
    if (wantsDash && this.dashCooldown <= 0 && this.stamina >= dashCost) {
      this._dashDir     = dashDir.clone();
      this.dashTimer    = this.dashDuration;
      this.dashCooldown = this.selectedCharacter === 'taekwondo_girl' ? 0.32 : 0.4;
      this.stamina      = Math.max(0, this.stamina - dashCost);
    }

    if (this.dashTimer > 0) {
      this._dashTrail.push({ x: this.pos.x, y: this.pos.y, alpha: 0.55 });
    }
    for (const t of this._dashTrail) t.alpha -= 4 * dt;
    this._dashTrail = this._dashTrail.filter(t => t.alpha > 0);

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vel = this._dashDir.scale(this.speed * 3.5);
    } else {
      // Stagger debuff: slower walk + reduced stamina regen (dash stays full — an escape).
      const moveMult  = this.staggerTimer > 0 ? 0.45 : 1.0;
      const regenMult = this.staggerTimer > 0 ? 0.40 : 1.0;
      this.vel = dir.scale(this.speed * moveMult);
      this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * regenMult * dt);
    }

    if (this.specialDashTimer > 0) {
      this.specialDashTimer -= dt;
      this.vel = this.specialDashDir.scale(this.speed * 6);
    }

    this.pos.addMut(this.vel.scale(dt));
    this.pos.x = clamp(this.pos.x, WORLD_MARGIN, WORLD_W - WORLD_MARGIN);
    this.pos.y = clamp(this.pos.y, WORLD_MARGIN + 40, WORLD_H - WORLD_MARGIN);
  }

  // Bite from Bloodfang/Razorhound. HP is always applied; stagger/knockback/bleed are
  // suppressed while stunImmunityTimer > 0 (anti chain-lock). Returns true if a NEW
  // stagger was applied (for "STAGGERED" feedback). Callers guard dash/phoenix i-frames.
  applyBite({ hp = 0, stamina = 0, stagger = 0, knockback = 0, dir = null, bleed = 0 } = {}) {
    if (hp > 0) this.applyDamage(hp);                 // routes through Pulse Shield reduction
    if (this.stunImmunityTimer > 0) return false;     // immune to new stagger
    if (stamina > 0) this.stamina = Math.max(0, this.stamina - stamina);
    if (stagger > 0) {
      this.staggerTimer      = Math.max(this.staggerTimer, stagger);
      this.stunImmunityTimer = stagger + 2;            // 2 s immunity after stagger ends
    }
    if (knockback > 0 && dir) this.pos.addMut(dir.scale(knockback));
    if (bleed > 0) this.bleedTimer = Math.max(this.bleedTimer, bleed);  // refresh, not stack
    return stagger > 0;
  }

  canShoot() { return this.shootCooldown <= 0; }

  shoot(mousePos) {
    this.shootCooldown = 0.18 / (1 + this.fireRateBonus);   // Fire Rate card
    const dir    = safeNormalize(new Vec2(mousePos.x - this.pos.x, mousePos.y - this.pos.y));
    const base   = 1 + this.upgrades['Pulse Damage'];
    let damage   = base;
    let projLife = 0.9;
    if (this.selectedCharacter === 'taekwondo_girl') {
      damage = base * 0.9;
    } else if (this.selectedCharacter === 'cyber_arm_hero') {
      damage   = base * 1.2;
      projLife = 1.3;
    }
    const proj = new Projectile(this.pos.clone(), dir, damage, this.attackSprite);
    proj.life  = projLife;
    proj.speed = 760 * (1 + this.projSpeedBonus);            // Shot Speed card
    return proj;
  }

  draw(ctx, mousePos) {
    // Dash glow
    if (this.dashTimer > 0) {
      ctx.strokeStyle = CYAN;
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, PLAYER_RADIUS + 8, 0, Math.PI * 2); ctx.stroke();
    }

    // Afterimage trail — additive cyan streak with a softer blue outer glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of this._dashTrail) {
      const r = PLAYER_RADIUS * (0.4 + 0.5 * t.alpha);
      ctx.globalAlpha = t.alpha * 0.45;
      ctx.fillStyle   = BLUE;
      ctx.beginPath(); ctx.arc(t.x, t.y, r * 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = t.alpha;
      ctx.fillStyle   = CYAN;
      ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Draw character sprite (64 px tall) or fallback colored circle
    const colors = this._getCharacterFallbackColors();
    const spr    = this.characterSprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      const sprH = 64;
      const sprW = Math.round(spr.naturalWidth * (sprH / spr.naturalHeight));
      ctx.drawImage(spr, this.pos.x - sprW / 2, this.pos.y - sprH / 2, sprW, sprH);
    } else {
      ctx.fillStyle   = colors.primary;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, PLAYER_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = colors.secondary; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, PLAYER_RADIUS, 0, Math.PI * 2); ctx.stroke();
    }

    // Carried cores orbiting around player
    for (let i = 0; i < this.carry; i++) {
      const angle = i * 0.7;
      const dist  = 24 + (i % 2) * 5;
      const ox = this.pos.x + Math.cos(angle) * dist;
      const oy = this.pos.y + Math.sin(angle) * dist;
      ctx.fillStyle = YELLOW;
      ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2); ctx.fill();
    }

    // HP (red) + Mana (cyan) bars above the sprite — world-space, follow the player.
    // Both stay visible even when empty: dark track + colored fill + bright bordered frame.
    const bw = 46, bh = 5, gap = 3;
    const bx = this.pos.x - bw / 2;
    const byHp   = this.pos.y - 50;
    const byMana = byHp + bh + gap;          // directly below HP, no overlap

    // Shared dark backing for contrast over any background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx - 2, byHp - 2, bw + 4, bh * 2 + gap + 4);

    // HP bar (red) with a subtle red frame
    ctx.fillStyle = '#2a0a10'; ctx.fillRect(bx, byHp, bw, bh);
    ctx.fillStyle = RED;
    ctx.fillRect(bx, byHp, Math.round(bw * clamp(this.hp / this.maxHp, 0, 1)), bh);
    // Overheal segment (gold) — only when HP exceeds max (Gold Phoenix Revive). Drawn
    // on top of the full red bar so the bonus HP is clearly visible; normal HP logic
    // (the red clamp above) is untouched.
    if (this.hp > this.maxHp) {
      const over = clamp((this.hp - this.maxHp) / this.maxHp, 0, 1);
      ctx.fillStyle = '#ffd23c';
      ctx.fillRect(bx, byHp, Math.round(bw * over), bh);
      ctx.strokeStyle = '#fff2a8'; ctx.lineWidth = 1.2;
      ctx.strokeRect(bx + 0.5, byHp + 0.5, bw - 1, bh - 1);
    } else {
      ctx.strokeStyle = 'rgba(255,90,110,0.85)'; ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, byHp + 0.5, bw - 1, bh - 1);
    }

    // Mana bar (cyan) — ALWAYS visible, even at 0: dark-blue bg + cyan border + subtle glow
    ctx.fillStyle = '#06283a'; ctx.fillRect(bx, byMana, bw, bh);
    ctx.fillStyle = CYAN;
    ctx.fillRect(bx, byMana, Math.round(bw * clamp(this.mana / this.maxMana, 0, 1)), bh);
    ctx.save();
    ctx.shadowColor = CYAN; ctx.shadowBlur = 5;             // subtle cyan glow
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1.2;
    ctx.strokeRect(bx + 0.5, byMana + 0.5, bw - 1, bh - 1);
    ctx.restore();

    // Pulse Shield bubble — clean transparent cyan dome around the player (player stays visible)
    if (this.shieldTimer > 0) {
      const fade  = Math.min(1, this.shieldTimer / 0.6);    // gentle fade-out over the last 0.6s
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
      const r     = PLAYER_RADIUS + 14;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // soft translucent fill
      const grad = ctx.createRadialGradient(this.pos.x, this.pos.y, r * 0.55, this.pos.x, this.pos.y, r);
      grad.addColorStop(0, 'rgba(0,200,255,0)');
      grad.addColorStop(1, `rgba(40,180,255,${0.14 * fade})`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, r, 0, Math.PI * 2); ctx.fill();
      // bright thin rim with a subtle pulse
      ctx.globalAlpha = (0.45 + 0.3 * pulse) * fade;
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
      ctx.shadowColor = CYAN; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}
