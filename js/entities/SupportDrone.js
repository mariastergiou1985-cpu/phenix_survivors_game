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

    // Elemental attack stream — the drones now SHOOT their element, not a plain line:
    // flame = three wavy fire tongues + impact embers · electro = jagged jitter bolt + crackle.
    if (this._beamTimer > 0 && this._beamTo) {
      const alpha = (this._beamTimer / 0.12) * 0.9;
      const x1 = this.pos.x, y1 = this.pos.y, x2 = this._beamTo.x, y2 = this._beamTo.y;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;                 // perpendicular
      const tW = this._age * 20;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (this.type === 'flame') {
        for (let sIdx = 0; sIdx < 3; sIdx++) {             // wavy fire tongues
          const amp = (sIdx - 1) * 7 + Math.sin(tW + sIdx * 2) * 5;
          ctx.globalAlpha = alpha * (sIdx === 1 ? 0.9 : 0.5);
          ctx.strokeStyle = sIdx === 1 ? '#ffd23c' : FLAME_COLOR;
          ctx.lineWidth = sIdx === 1 ? 2.4 : 4;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo((x1 + x2) / 2 + nx * amp, (y1 + y2) / 2 + ny * amp, x2, y2);
          ctx.stroke();
        }
        for (let eIdx = 0; eIdx < 4; eIdx++) {             // impact embers rising
          const es = Math.sin(tW * 1.7 + eIdx * 2.4) * 0.5 + 0.5;
          ctx.globalAlpha = alpha * 0.8 * es;
          ctx.fillStyle = eIdx % 2 ? '#ffd23c' : FLAME_COLOR;
          ctx.beginPath();
          ctx.arc(x2 + (es - 0.5) * 18, y2 - es * 16, 1.8 + es * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = ELECTRO_COLOR; ctx.lineWidth = 2.4;   // jagged jitter bolt
        ctx.shadowColor = ELECTRO_COLOR; ctx.shadowBlur = 10;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        for (let sgm = 1; sgm <= 4; sgm++) {
          const jt = Math.sin(tW * 3.1 + sgm * 7) * 12;
          ctx.lineTo(x1 + (dx * sgm) / 4 + nx * jt, y1 + (dy * sgm) / 4 + ny * jt);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.stroke();
        for (let cIdx = 0; cIdx < 3; cIdx++) {             // crackle dots at the wound
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillStyle = '#ffffff';
          const ca = tW * 2 + cIdx * 2.1;
          ctx.beginPath(); ctx.arc(x2 + Math.cos(ca) * 9, y2 + Math.sin(ca) * 9, 1.5, 0, Math.PI * 2); ctx.fill();
        }
      }
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

    // Sprite (32x32) or fallback circle — hover bob + elemental thruster flicker
    const bob = Math.sin(this._age * 2.2) * 2;
    const spr = this._sprite;
    {
      const fl = 0.5 + 0.5 * Math.sin(this._age * 24);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * fl;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y + 14 + bob, 2.6 + fl * 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
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
