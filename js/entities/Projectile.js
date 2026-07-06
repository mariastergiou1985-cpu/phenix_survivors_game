import { Vec2, WORLD_W, WORLD_H, WORLD_BOUNDS, MAGENTA, WHITE, GREEN, CYAN, BLUE } from '../constants.js';
import { safeNormalize, distance } from '../utils.js';

export class Projectile {
  constructor(pos, direction, damage, sprite = null) {
    this.pos       = pos.clone();
    this.direction = direction.clone();
    this.speed     = 760;
    this.damage    = damage;
    this.radius    = 5;
    this.life      = 0.9;
    this.sprite    = sprite;
    this.trail     = [];   // motion trail — max 8 points, expire naturally with life
  }

  update(dt) {
    // Record trail point before moving (cap to 8)
    this.trail.push({ x: this.pos.x, y: this.pos.y, a: Math.min(1, this.life / 0.9) });
    if (this.trail.length > 8) this.trail.shift();
    this.pos.addMut(this.direction.scale(this.speed * dt));
    this.life -= dt;
  }

  alive() {
    return (
      this.life > 0 &&
      this.pos.x >= WORLD_BOUNDS.left - 40 && this.pos.x <= WORLD_BOUNDS.right + 40 &&
      this.pos.y >= WORLD_BOUNDS.top - 40 && this.pos.y <= WORLD_BOUNDS.bottom + 40
    );
  }

  draw(ctx) {
    // Motion trail — fading line segments behind the projectile
    if (this.trail.length > 1) {
      ctx.save();
      for (let i = 1; i < this.trail.length; i++) {
        const t0 = this.trail[i - 1], t1 = this.trail[i];
        const frac  = i / this.trail.length;
        const alpha = frac * t1.a * 0.55;
        if (alpha < 0.01) continue;
        ctx.globalAlpha  = alpha;
        ctx.strokeStyle  = (this.style === 'eddie_flame') ? '#ff7a1a' : MAGENTA;   // flame → orange trail
        ctx.lineWidth    = Math.max(0.5, this.radius * frac * 0.6);
        ctx.lineCap      = 'round';
        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y);
        ctx.lineTo(t1.x, t1.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // Euclid Vector "Toxin Shard" — a green toxin data-needle (auto toxin weapon; not an orb).
    if (this.style === 'toxin_shard') {
      const a = Math.atan2(this.direction.y, this.direction.x);
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(a);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#0a9c44';   // outer toxic glow
      ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-6, 4.5); ctx.lineTo(-3, 0); ctx.lineTo(-6, -4.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#00ff33';   // bright toxin core
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-4, 2.6); ctx.lineTo(-2, 0); ctx.lineTo(-4, -2.6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#d6ffe0';   // venom flecks
      ctx.fillRect(-3, -1, 5, 2);
      ctx.restore();
      return;
    }
    // Eddie "Red Bolt" — a crimson lightning riff-bolt (Solo Red Thunder; not a generic orb).
    if (this.style === 'red_bolt') {
      const a = Math.atan2(this.direction.y, this.direction.x);
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(a);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#b31212';   // outer thunder glow
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(4, 3); ctx.lineTo(8, 5.5); ctx.lineTo(-8, 4.5); ctx.lineTo(-3, 0); ctx.lineTo(-8, -4.5); ctx.lineTo(8, -5.5); ctx.lineTo(4, -3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff3030';   // bright red bolt core
      ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(3, 2); ctx.lineTo(6, 3.6); ctx.lineTo(-5, 2.8); ctx.lineTo(-2, 0); ctx.lineTo(-5, -2.8); ctx.lineTo(6, -3.6); ctx.lineTo(3, -2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#ffd9c8';   // white-hot flecks
      ctx.fillRect(-3, -1, 6, 2);
      ctx.restore();
      return;
    }
    // Japan Phasewalker "Phase Shard" — a cyan/blue glitch data-needle (not a generic orb).
    if (this.style === 'phase_shard') {
      const a = Math.atan2(this.direction.y, this.direction.x);
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(a);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = BLUE;   // outer glow needle
      ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-6, 4.5); ctx.lineTo(-3, 0); ctx.lineTo(-6, -4.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = CYAN;   // bright core
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-4, 2.6); ctx.lineTo(-2, 0); ctx.lineTo(-4, -2.6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#bfefff';   // glitch echo flecks
      ctx.fillRect(-3, -1, 5, 2);
      ctx.restore();
      return;
    }
    // Eddie base auto-shot — a BIG flame projectile (replaces the generic orb).
    if (this.style === 'eddie_flame') {
      const a   = Math.atan2(this.direction.y, this.direction.x);
      const spr = this.sprite;
      const sz  = this.spriteSize || 50;
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(a - Math.PI / 2);          // flame art points up → align its tip to travel direction
      ctx.globalCompositeOperation = 'lighter';
      if (spr && spr.complete && spr.naturalWidth > 0) {
        const ar  = spr.naturalWidth / spr.naturalHeight;
        const hgt = sz, wid = sz * ar;
        ctx.globalAlpha = 0.96;
        ctx.drawImage(spr, -wid / 2, -hgt / 2, wid, hgt);
      } else {
        // procedural flame fallback (no asset)
        ctx.fillStyle = '#ff5a1a';
        ctx.beginPath();
        ctx.moveTo(0, -sz * 0.6);
        ctx.quadraticCurveTo(sz * 0.42, 0, 0, sz * 0.5);
        ctx.quadraticCurveTo(-sz * 0.42, 0, 0, -sz * 0.6);
        ctx.fill();
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.arc(0, sz * 0.12, sz * 0.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      return;
    }
    const spr = this.sprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      const angle = Math.atan2(this.direction.y, this.direction.x);
      const size  = 28;
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(angle);
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = MAGENTA;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.stroke();
    }
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
    // Re-acquire target: nearest enemy
    if (!enemies.includes(this.target)) {
      if (enemies.length > 0) {
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
      this.pos.x >= WORLD_BOUNDS.left - 80 && this.pos.x <= WORLD_BOUNDS.right + 80 &&
      this.pos.y >= WORLD_BOUNDS.top - 80 && this.pos.y <= WORLD_BOUNDS.bottom + 80
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
