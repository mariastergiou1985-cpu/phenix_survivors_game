// NpcWalker.js — KIROSHI WALKER autonomous ally
// Spawns automatically at gameplay start; follows the player; casts an electric
// body-shockwave every 120s (2 min) that damages the nearest enemy/boss.
// Does NOT trigger game-over when downed — revives after 30s with 50% HP/mana.

const NPC_FOLLOW_DIST   = 72;    // target gap from player (px)
const NPC_FOLLOW_SPEED  = 115;   // px/s approach speed
const NPC_MANA_REGEN    = 3;     // mana per second
const NPC_DOWNED_DUR    = 30;    // seconds until revive
const NPC_REVIVE_HP_PCT = 0.5;
const NPC_REVIVE_MP_PCT = 0.5;
const ABILITY_CD        = 120;   // seconds between casts
const ABILITY_MANA_COST = 100;
const SHOCKWAVE_DMG     = 35;    // per-hit (not overpowered; capped through boss helper)
const MAX_VFX           = 64;    // hard cap to prevent memory growth
const SPRITE_W          = 48;    // display width (px)
const SPRITE_H          = Math.round(SPRITE_W * (1537 / 1023));  // aspect ~72px

export class NpcWalker {
  constructor() {
    this.maxHp   = 120;
    this.hp      = 120;
    this.maxMana = 100;
    this.mana    = 100;
    this.pos     = { x: 0, y: 0 };
    this.radius  = 18;
    this.alive   = true;
    this.downed  = false;
    this.downedTimer  = 0;
    this.abilityCd    = 8;    // 8s warm-up before first cast
    this._vfx         = [];
    this._img         = null;
    this._imgLoaded   = false;
    this._loadImage();
  }

  _loadImage() {
    const img = new Image();
    img.onload  = () => { this._imgLoaded = true; };
    img.onerror = () => {
      this._imgLoaded = false;
      console.warn('[NpcWalker] assets/allies/npc/walker.png failed to load — fallback will be used');
    };
    img.src = 'assets/allies/npc/walker.png';
    this._img = img;
  }

  // Called on every (re-)spawn — resets to full health at a position near the player.
  reset(playerPos) {
    this.hp           = this.maxHp;
    this.mana         = this.maxMana;
    this.pos          = { x: playerPos.x - 60, y: playerPos.y + 16 };
    this.alive        = true;
    this.downed       = false;
    this.downedTimer  = 0;
    this.abilityCd    = 8;
    this._vfx         = [];
  }

  // ── Update ───────────────────────────────────────────────────────────────
  update(dt, playerPos, game) {
    this._updateVfx(dt);

    if (this.downed) {
      this.downedTimer -= dt;
      if (this.downedTimer <= 0) this._revive(playerPos);
      return;
    }

    // Mana regen
    this.mana = Math.min(this.maxMana, this.mana + NPC_MANA_REGEN * dt);

    // Follow player — smooth, no jitter
    const dx = playerPos.x - this.pos.x;
    const dy = playerPos.y - this.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > NPC_FOLLOW_DIST + 8) {
      const speed = Math.min(NPC_FOLLOW_SPEED, (dist - NPC_FOLLOW_DIST) * 4);
      const inv = 1 / dist;
      this.pos.x += dx * inv * speed * dt;
      this.pos.y += dy * inv * speed * dt;
    }

    // Ability
    this.abilityCd -= dt;
    if (this.abilityCd <= 0 && this.mana >= ABILITY_MANA_COST) {
      const target = this._nearestTarget(game);
      if (target) {
        this._castShockwave(target, game);
        this.mana       -= ABILITY_MANA_COST;
        this.abilityCd   = ABILITY_CD;
      }
    }
  }

  _revive(playerPos) {
    this.downed   = false;
    this.hp       = Math.round(this.maxHp  * NPC_REVIVE_HP_PCT);
    this.mana     = Math.round(this.maxMana * NPC_REVIVE_MP_PCT);
    this.pos      = { x: playerPos.x - 60, y: playerPos.y + 16 };
    this.alive    = true;
  }

  _nearestTarget(game) {
    let best = null, bestD = Infinity;
    for (const e of (game.enemies || [])) {
      if (e.dead || e.dying) continue;
      if (!e.pos) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.y - this.pos.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    const singles = [game.titanBoss, game.annihilatorBoss, game.bloodfangBoss, game.cyberSerpentBoss, game.cyberDragonBoss];
    for (const b of singles) {
      if (!b || b.hp <= 0) continue;
      if (!b.pos) continue;
      const d = Math.hypot(b.pos.x - this.pos.x, b.pos.y - this.pos.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    // DoubleDemonsBoss
    const dd = game.doubleDemonsBoss;
    if (dd && dd.hp > 0 && dd.gunner?.pos) {
      const d = Math.hypot(dd.gunner.pos.x - this.pos.x, dd.gunner.pos.y - this.pos.y);
      if (d < bestD) { bestD = d; best = { pos: dd.gunner.pos, _isDD: true }; }
    }
    return best;
  }

  _castShockwave(target, game) {
    // DoubleDemonsBoss damage path
    if (target._isDD) {
      if (game.doubleDemonsBoss && game.doubleDemonsBoss.hp > 0) {
        const eff = typeof game._capBossDamage === 'function'
          ? game._capBossDamage(game.doubleDemonsBoss, SHOCKWAVE_DMG)
          : SHOCKWAVE_DMG;
        game.doubleDemonsBoss.hp -= eff;
      }
      this._spawnVfx({ x: target.pos.x, y: target.pos.y });
      return;
    }

    const isBoss = (typeof target.isBoss === 'function' && target.isBoss())
                || !!target.isMegaBoss;

    if (isBoss) {
      const eff = typeof game._capBossDamage === 'function'
        ? game._capBossDamage(target, SHOCKWAVE_DMG)
        : SHOCKWAVE_DMG;
      target.hp -= eff;
      if (target.hitFlash !== undefined) target.hitFlash = 0.12;
    } else {
      if (typeof target.takeHit === 'function') {
        target.takeHit(SHOCKWAVE_DMG, game);
      } else {
        target.hp -= SHOCKWAVE_DMG;
        if (target.hp <= 0 && !target.dead) target.dead = true;
        if (target.hitFlash !== undefined) target.hitFlash = 0.12;
      }
    }

    this._spawnVfx(target.pos);
  }

  _spawnVfx(targetPos) {
    // Body pulse rings
    this._vfx.push({ type: 'ring', x: this.pos.x, y: this.pos.y, r: 8, maxR: 56, life: 0.55, maxLife: 0.55, color: '#44ffff', lw: 3 });
    this._vfx.push({ type: 'ring', x: this.pos.x, y: this.pos.y, r: 4, maxR: 38, life: 0.40, maxLife: 0.40, color: '#cc44ff', lw: 2 });
    // Lightning arc to target
    this._vfx.push({
      type: 'arc',
      x1: this.pos.x, y1: this.pos.y,
      x2: targetPos.x, y2: targetPos.y,
      life: 0.32, maxLife: 0.32,
      color: '#88ffff', lw: 2,
      jitter: this._makeJitter(targetPos),
    });
    // Impact burst at target
    this._vfx.push({ type: 'burst', x: targetPos.x, y: targetPos.y, r: 0, maxR: 32, life: 0.38, maxLife: 0.38, color: '#aaffee', lw: 2 });
    // Hard cap
    if (this._vfx.length > MAX_VFX) this._vfx.splice(0, this._vfx.length - MAX_VFX);
  }

  _makeJitter(targetPos) {
    const pts = [];
    const dx = targetPos.x - this.pos.x, dy = targetPos.y - this.pos.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular normal
    const nx = -dy / len, ny = dx / len;
    const steps = 3 + Math.floor(Math.random() * 3);
    for (let i = 1; i < steps; i++) {
      const t   = i / steps;
      const off = (Math.random() - 0.5) * 38;
      pts.push({ t, ox: nx * off, oy: ny * off });
    }
    return pts;
  }

  _updateVfx(dt) {
    for (let i = this._vfx.length - 1; i >= 0; i--) {
      const v = this._vfx[i];
      v.life -= dt;
      if (v.life <= 0) { this._vfx.splice(i, 1); continue; }
      if (v.type === 'ring' || v.type === 'burst') {
        v.r = v.maxR * (1 - v.life / v.maxLife);
      }
    }
  }

  takeDamage(dmg) {
    if (this.downed) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp    = 0;
      this.alive = false;
      this.downed      = true;
      this.downedTimer = NPC_DOWNED_DUR;
    }
  }

  // ── Draw (world-space / camera-transformed) ───────────────────────────────
  draw(ctx) {
    if (this.downed) { this._drawDowned(ctx); return; }
    this._drawVfx(ctx);
    this._drawSprite(ctx);
    this._drawWorldBars(ctx);
  }

  _drawSprite(ctx) {
    const x = Math.round(this.pos.x - SPRITE_W / 2);
    const y = Math.round(this.pos.y - SPRITE_H + 12);
    if (this._imgLoaded && this._img) {
      ctx.drawImage(this._img, x, y, SPRITE_W, SPRITE_H);
    } else {
      // Fallback: simple glowing humanoid silhouette
      ctx.save();
      ctx.fillStyle = '#3cffb0';
      ctx.strokeStyle = '#00cc88';
      ctx.lineWidth = 2;
      // head
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y - 26, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // body
      ctx.fillRect(this.pos.x - 7, this.pos.y - 16, 14, 22);
      ctx.strokeRect(this.pos.x - 7, this.pos.y - 16, 14, 22);
      ctx.restore();
    }
  }

  _drawDowned(ctx) {
    const revivePct = 1 - this.downedTimer / NPC_DOWNED_DUR;
    const pulse = 0.28 + 0.28 * Math.abs(Math.sin(Date.now() / 500));
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ff4466';
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Revive progress bar
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(this.pos.x - 24, this.pos.y + 20, 48, 5);
    ctx.fillStyle = '#ff7799';
    ctx.fillRect(this.pos.x - 24, this.pos.y + 20, Math.round(48 * revivePct), 5);
    ctx.restore();
  }

  _drawWorldBars(ctx) {
    // Compact HP + mana bars just above the sprite
    const bw = 44, bh = 4;
    const bx = Math.round(this.pos.x - bw / 2);
    const by = Math.round(this.pos.y - SPRITE_H - 4);
    ctx.save();
    // HP track
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#ff4466';
    ctx.fillRect(bx, by, Math.round(bw * Math.max(0, this.hp / this.maxHp)), bh);
    // Mana track
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx, by + bh + 2, bw, bh);
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(bx, by + bh + 2, Math.round(bw * Math.max(0, this.mana / this.maxMana)), bh);
    ctx.restore();
  }

  _drawVfx(ctx) {
    if (this._vfx.length === 0) return;
    ctx.save();
    for (const v of this._vfx) {
      const alpha = Math.max(0, v.life / v.maxLife);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = v.color;
      ctx.lineWidth   = v.lw || 2;
      if (v.type === 'ring' || v.type === 'burst') {
        if (v.r > 0) {
          ctx.beginPath(); ctx.arc(v.x, v.y, v.r, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (v.type === 'arc') {
        const dx = v.x2 - v.x1, dy = v.y2 - v.y1;
        ctx.beginPath();
        ctx.moveTo(v.x1, v.y1);
        if (v.jitter && v.jitter.length > 0) {
          for (const pt of v.jitter) {
            ctx.lineTo(v.x1 + dx * pt.t + pt.ox, v.y1 + dy * pt.t + pt.oy);
          }
        }
        ctx.lineTo(v.x2, v.y2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Screen-space HUD panel (drawn by Game._drawNpcWalkerHUD) ─────────────
  // Returns the panel rect so callers can position it correctly.
  drawHUDPanel(ctx, x, y, width) {
    const W   = width;
    const PAD = 8;
    const ROW = 14;
    const BH  = 6;   // bar height
    const H   = PAD + ROW + 4 + BH + 3 + BH + 4 + ROW + PAD;

    // Panel background
    ctx.save();
    ctx.fillStyle = 'rgba(2,5,14,0.82)';
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(x, y, W, H, 5); ctx.fill();
    } else {
      ctx.fillRect(x, y, W, H);
    }
    ctx.strokeStyle = 'rgba(68,255,255,0.20)';
    ctx.lineWidth   = 1;
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(x, y, W, H, 5); ctx.stroke();
    } else {
      ctx.strokeRect(x, y, W, H);
    }

    // Name
    ctx.font      = 'bold 10px Consolas, monospace';
    ctx.fillStyle = this.downed ? '#ff7799' : '#44ffcc';
    ctx.textAlign = 'left';
    const nameLabel = this.downed
      ? `KIROSHI — DOWNED (${Math.ceil(this.downedTimer)}s)`
      : 'KIROSHI WALKER';
    ctx.fillText(nameLabel, x + PAD, y + PAD + ROW - 2);

    if (!this.downed) {
      // HP bar
      const barX = x + PAD, barW = W - PAD * 2;
      const hpY = y + PAD + ROW + 4;
      ctx.fillStyle = 'rgba(255,68,102,0.22)';  ctx.fillRect(barX, hpY, barW, BH);
      ctx.fillStyle = '#ff4466';
      ctx.fillRect(barX, hpY, Math.round(barW * Math.max(0, this.hp / this.maxHp)), BH);
      ctx.font = '8px Consolas, monospace'; ctx.fillStyle = 'rgba(200,200,230,0.6)';
      ctx.fillText(`HP ${Math.ceil(this.hp)}/${this.maxHp}`, barX, hpY - 1);

      // Mana bar
      const mpY = hpY + BH + 3;
      ctx.fillStyle = 'rgba(68,136,255,0.22)'; ctx.fillRect(barX, mpY, barW, BH);
      ctx.fillStyle = '#4488ff';
      ctx.fillRect(barX, mpY, Math.round(barW * Math.max(0, this.mana / this.maxMana)), BH);
      ctx.font = '8px Consolas, monospace'; ctx.fillStyle = 'rgba(200,200,230,0.6)';
      ctx.fillText(`MP ${Math.ceil(this.mana)}/${this.maxMana}`, barX, mpY - 1);

      // Ability cooldown row
      const cdY = mpY + BH + 4 + ROW - 2;
      ctx.font      = '9px Consolas, monospace';
      if (this.abilityCd <= 0 && this.mana >= ABILITY_MANA_COST) {
        ctx.fillStyle = '#aaff88';
        ctx.fillText('⚡ SHOCKWAVE  READY', x + PAD, cdY);
      } else if (this.mana < ABILITY_MANA_COST) {
        const pct = Math.floor(this.mana / ABILITY_MANA_COST * 100);
        ctx.fillStyle = 'rgba(120,160,200,0.5)';
        ctx.fillText(`⚡ CHARGING MANA  ${pct}%`, x + PAD, cdY);
      } else {
        const cdLeft = Math.ceil(this.abilityCd);
        const mins   = Math.floor(cdLeft / 60).toString().padStart(1, '0');
        const secs   = (cdLeft % 60).toString().padStart(2, '0');
        ctx.fillStyle = 'rgba(120,160,200,0.5)';
        ctx.fillText(`⚡ SHOCKWAVE  ${mins}:${secs}`, x + PAD, cdY);
      }
    }

    ctx.restore();
    return H;
  }
}
