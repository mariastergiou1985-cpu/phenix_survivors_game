import { Vec2 } from '../constants.js';
import { distance } from '../utils.js';
import { FloatingText } from './FloatingText.js';

const FLAME_COLOR   = '#FF6600';
const ELECTRO_COLOR = '#00CCFF';

export class SupportDrone {
  constructor(type, playerPos) {
    this.type    = type;             // 'flame' | 'electro'
    this.offsetX = type === 'flame' ? -52 : 52;
    this.offsetY = -55;
    this.pos     = new Vec2(playerPos.x + this.offsetX, playerPos.y + this.offsetY);

    this._sprite     = new Image();
    this._sprite.src = type === 'flame'
      ? 'assets/allies/support_drone/flame_support_drone.png'
      : 'assets/allies/support_drone/electro_support_drone.png';

    const base   = type === 'flame' ? 0.9 : 1.2;
    const jitter = type === 'flame' ? 0.3 : 0.4;
    this.attackInterval = base + Math.random() * jitter;
    this.attackTimer    = this.attackInterval * 0.5;  // stagger first shots

    this._beamTo    = null;  // Vec2 — last attack target pos (for beam visual)
    this._beamTimer = 0;

    this._burns = [];  // [{ target, timer }] — flame DOT tracking
    this._age   = 0;   // total lifetime — drives bob + pulse
    this._summonFlash = 0.5;  // bright spawn flash
  }

  _findTarget(game) {
    if (game.titanBoss && game.titanBoss.hp > 0) return game.titanBoss;
    let best = null, bestDist = Infinity;
    for (const e of game.enemies) {
      const d = distance(this.pos, e.pos);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  update(dt, playerPos, game) {
    // Smooth follow player
    this.pos.x += (playerPos.x + this.offsetX - this.pos.x) * Math.min(1, dt * 8);
    this.pos.y += (playerPos.y + this.offsetY - this.pos.y) * Math.min(1, dt * 8);

    // Decay beam flash + age + summon flash
    this._age += dt;
    if (this._summonFlash > 0) this._summonFlash -= dt;
    if (this._beamTimer > 0)   this._beamTimer -= dt;

    // Flame burn DOT
    for (let i = this._burns.length - 1; i >= 0; i--) {
      const b = this._burns[i];
      b.timer -= dt;
      if (b.target.hp > 0) b.target.hp -= game._resistDrone(b.target, dt);  // 1 dmg/s (boss survival: drone-resisted on bosses)
      if (b.timer <= 0) this._burns.splice(i, 1);
    }

    // Attack
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      const target = this._findTarget(game);
      if (target) this._attack(target, game);
      const base   = this.type === 'flame' ? 0.9 : 1.2;
      const jitter = this.type === 'flame' ? 0.3 : 0.4;
      this.attackTimer = base + Math.random() * jitter;
    }
  }

  _attack(target, game) {
    const color = this.type === 'flame' ? FLAME_COLOR : ELECTRO_COLOR;

    // Damage + optional crit
    let dmg    = this.type === 'flame' ? 2 : 4;
    const crit = Math.random() < 0.10;
    if (crit) dmg *= 2;

    target.hp -= game._resistDrone(target, dmg);   // boss survival: support drones do reduced damage to bosses
    if (target.hitFlash !== undefined) target.hitFlash = 0.08;

    // Floating damage number
    game.floatingTexts.push(
      new FloatingText(
        crit ? `${dmg}!` : `${dmg}`,
        new Vec2(target.pos.x, target.pos.y - 20),
        color, 0.6
      )
    );
    game.particles.spawnHitSparks(target.pos, color);

    // Flame burn (refresh timer if already burning this target)
    if (this.type === 'flame') {
      const ex = this._burns.find(b => b.target === target);
      if (ex) ex.timer = 2.0;
      else     this._burns.push({ target, timer: 2.0 });
    }

    // Beam visual
    this._beamTo    = target.pos.clone();
    this._beamTimer = 0.12;

    // Attack SFX
    if (this.type === 'flame') game.audio?.playDroneFlame();
    else                        game.audio?.playDroneElectro();

    // Corrosive combo tracking
    const now = game.timeAlive;
    if (this.type === 'flame') game._droneFlameLast   = { target, time: now };
    else                        game._droneElectroLast = { target, time: now };

    const fl = game._droneFlameLast;
    const el = game._droneElectroLast;
    if (
      fl && el &&
      fl.target === target && el.target === target &&
      Math.abs(fl.time - el.time) <= 1.5 &&
      !(target._corrosiveTimer > 0)
    ) {
      target._corrosiveTimer = 3.0;
      game.floatingTexts.push(
        new FloatingText(
          'CORROSIVE COMBO',
          new Vec2(target.pos.x, target.pos.y - 45),
          '#AAFF00', 1.5
        )
      );
    }
  }

  draw(ctx) {
    const color = this.type === 'flame' ? FLAME_COLOR : ELECTRO_COLOR;
    const pulse = 0.8 + 0.2 * Math.sin(this._age * 3.5);   // gentle pulsate

    // Summon flash — bright ring expanding outward on spawn
    if (this._summonFlash > 0) {
      const t = 1 - this._summonFlash / 0.5;   // 0→1 over 0.5s
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3 * (1 - t);
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, 16 + t * 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Beam flash toward target — dual-layer: wide dim + thin bright core
    if (this._beamTimer > 0 && this._beamTo) {
      const alpha = (this._beamTimer / 0.12) * 0.85;
      ctx.save();
      // Outer wide beam
      ctx.globalAlpha = alpha * 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth   = this.type === 'flame' ? 6 : 5;
      if (this.type === 'electro') ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(this._beamTo.x, this._beamTo.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Inner bright core
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = this.type === 'flame' ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(this._beamTo.x, this._beamTo.y);
      ctx.stroke();
      ctx.restore();
    }

    // Pulsating glow — outer ring + soft fill
    ctx.save();
    ctx.globalAlpha = 0.12 * pulse;
    ctx.fillStyle   = color;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 24 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.25 * pulse;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Sprite (32x32) or fallback circle — with subtle bob
    const bob = Math.sin(this._age * 2.2) * 2;
    const spr = this._sprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      ctx.drawImage(spr, this.pos.x - 16, this.pos.y - 16 + bob, 32, 32);
    } else {
      ctx.fillStyle   = color;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y + bob, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y + bob, 10, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
