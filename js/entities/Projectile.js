import { Vec2, WIDTH, HEIGHT, MAGENTA, WHITE, GREEN } from '../constants.js';
import { safeNormalize, distance } from '../utils.js';

export class Projectile {
  constructor(pos, direction, damage) {
    this.pos       = pos.clone();
    this.direction = direction.clone();
    this.speed     = 760;
    this.damage    = damage;
    this.radius    = 5;
    this.life      = 0.9;
  }

  update(dt) {
    this.pos.addMut(this.direction.scale(this.speed * dt));
    this.life -= dt;
  }

  alive() {
    return (
      this.life > 0 &&
      this.pos.x >= -40 && this.pos.x <= WIDTH  + 40 &&
      this.pos.y >= -40 && this.pos.y <= HEIGHT + 40
    );
  }

  draw(ctx) {
    ctx.fillStyle = MAGENTA;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.stroke();
  }
}

export class HomingDisc {
  constructor(pos, target) {
    this.pos    = pos.clone();
    this.target = target;
    this.speed  = 320;
    this.radius = 8;
    this.damage = 3;
    this.life   = 4.0;
  }

  update(dt, enemies) {
    // Re-acquire target: prefer core-carriers, else nearest enemy
    if (!enemies.includes(this.target)) {
      const carriers = enemies.filter(e => e.carryingCore);
      if (carriers.length > 0) {
        this.target = carriers.reduce((a, b) => distance(this.pos, a.pos) < distance(this.pos, b.pos) ? a : b);
      } else if (enemies.length > 0) {
        this.target = enemies.reduce((a, b) => distance(this.pos, a.pos) < distance(this.pos, b.pos) ? a : b);
      } else {
        this.target = null;
      }
    }

    if (this.target) {
      const dir = safeNormalize(this.target.pos.sub(this.pos));
      this.pos.addMut(dir.scale(this.speed * dt));
    }

    this.life -= dt;
  }

  alive() {
    return (
      this.life > 0 &&
      this.pos.x >= -80 && this.pos.x <= WIDTH  + 80 &&
      this.pos.y >= -80 && this.pos.y <= HEIGHT + 80
    );
  }

  draw(ctx) {
    ctx.fillStyle = GREEN;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = WHITE;    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = GREEN;    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius + 4, 0, Math.PI * 2); ctx.stroke();
  }
}
