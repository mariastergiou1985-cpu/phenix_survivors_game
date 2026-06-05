import { Vec2, WIDTH, HEIGHT, WORLD_MARGIN, PLAYER_RADIUS, CYAN, WHITE, YELLOW, GREEN } from '../constants.js';
import { clamp, safeNormalize } from '../utils.js';
import { Projectile } from './Projectile.js';
import { FloatingText } from './FloatingText.js';

export class Player {
  constructor(selectedCharacter = null) {
    this.pos = new Vec2(WIDTH / 2, HEIGHT / 2);
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

    this.pickupRadius = 72;
    this.returnRadius = 70;
    this.repelRadius  = 115;

    this.carry    = 0;
    this.maxCarry = 5;

    this.dashTimer    = 0.0;
    this.dashCooldown = 0.0;
    this.dashDuration = 0.16;
    this.dashSpeed    = 560;

    this.shootCooldown = 0.0;

    this.level        = 1;
    this.xp           = 0;
    this.xpToNext     = 6;
    this.pendingLevelupCount = 0;

    this.kills             = 0;
    this.coresSecured      = 0;
    this.coresIntercepted  = 0;

    this.upgrades = {
      'Cyber-Legs': 0, 'Memory Bank': 0, 'Overclock Boost': 0,
      'Tractor Beam': 0, 'Firewall Protection': 0, 'Pulse Damage': 0,
      'Sonic Pulse': 0, 'Homing Disc': 0, 'EMP Cloud': 0, 'Quantum Overhaul': 0,
    };

    // Ability cooldown timers
    this.sonicPulseCooldown  = 0.0;
    this.empCloudCooldown    = 0.0;
    this.homingDiscTimer     = 0.0;
    this.quantumOverhaulTimer = 0.0;
  }

  _loadCharacterSprite() {
    const spritePath = `assets/characters/${this.selectedCharacter}.png`;
    this.characterSprite = new Image();
    this.characterSprite.src = spritePath;

    const attackMap = {
      'skeleton_warrior': 'assets/effects/attacks/bone_shockwave.png.png',
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

  gainXp(amount, floatingTexts) {
    this.xp += amount;
    floatingTexts.push(new FloatingText(`+${amount} TECH-XP`, this.pos.clone(), GREEN));

    while (this.xp >= this.xpToNext) {
      this.xp      -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.round(this.xpToNext * 1.35 + 4);
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
    this.shootCooldown    = Math.max(0, this.shootCooldown - dt);
    this.sonicPulseCooldown = Math.max(0, this.sonicPulseCooldown - dt);
    this.empCloudCooldown   = Math.max(0, this.empCloudCooldown - dt);

    const wantsDash = keys.has(' ') || keys.has('shift');
    if (wantsDash && this.dashCooldown <= 0 && this.stamina >= 25 && dir.lengthSq() > 0) {
      this.dashTimer    = this.dashDuration;
      this.dashCooldown = 0.75;
      this.stamina     -= 25;
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vel = dir.scale(this.dashSpeed);
    } else {
      this.vel = dir.scale(this.speed);
      this.stamina = Math.min(this.maxStamina, this.stamina + 26 * dt);
    }

    this.pos.addMut(this.vel.scale(dt));
    this.pos.x = clamp(this.pos.x, WORLD_MARGIN, WIDTH  - WORLD_MARGIN);
    this.pos.y = clamp(this.pos.y, WORLD_MARGIN + 40, HEIGHT - WORLD_MARGIN);
  }

  canShoot() { return this.shootCooldown <= 0; }

  shoot(mousePos) {
    this.shootCooldown = 0.18;
    const dir    = safeNormalize(new Vec2(mousePos.x - this.pos.x, mousePos.y - this.pos.y));
    const damage = 1 + this.upgrades['Pulse Damage'];
    return new Projectile(this.pos.clone(), dir, damage, this.attackSprite);
  }

  draw(ctx, mousePos) {
    // Dash glow
    if (this.dashTimer > 0) {
      ctx.strokeStyle = CYAN;
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, PLAYER_RADIUS + 8, 0, Math.PI * 2); ctx.stroke();
    }

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
  }
}
