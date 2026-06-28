// NpcWalker.js — KIROSHI WALKER autonomous ally V2
// Summoned every 120s of active gameplay; active for 60s per window.
// Has a basic electric wave attack (every 3.5s) and an electric body shockwave ultimate (every 45s).
// Takes damage from enemy/boss proximity. Character-specific synergy VFX and damage bonuses.
// Does NOT trigger game-over when downed. Revives after 20s within the same active window.

const WALKER_FOLLOW_DIST  = 72;    // target gap from player (px)
const WALKER_FOLLOW_SPEED = 115;   // px/s approach speed
const WALKER_MANA_REGEN   = 8;    // mana/s — allows 45s ability once per 60s window
const WALKER_DOWNED_DUR   = 20;   // seconds until revive (within same active window)
const WALKER_REVIVE_PCT   = 0.4;  // revive at 40% HP

const BASIC_ATTACK_CD     = 3.5;  // seconds between basic electric wave casts
const BASIC_ATTACK_DMG    = 12;   // base damage per basic hit
const BASIC_ATTACK_MANA   = 10;   // mana cost for basic wave

const ABILITY_CD          = 45;   // seconds between electric body shockwave ultimates
const ABILITY_MANA_COST   = 60;   // mana cost for the ultimate
const SHOCKWAVE_DMG       = 35;   // base ultimate damage per hit

const ENEMY_HIT_RANGE     = 40;   // px — enemy proximity range that damages Walker
const ENEMY_HIT_DAMAGE    = 7;    // damage from normal enemy contact
const BOSS_HIT_DAMAGE     = 14;   // damage from boss contact
const ENEMY_DMG_COOLDOWN  = 0.5;  // global hit cooldown to prevent spam (seconds)

const MAX_VFX             = 64;   // hard cap on VFX particle count
const SPRITE_W            = 48;   // display width (px)
const SPRITE_H            = Math.round(SPRITE_W * (1537 / 1023)); // aspect ~72px

// Character-specific synergy profiles: VFX colors + damage multiplier + HUD label
const SYNERGY_PROFILES = {
  skeleton_warrior:       { col1: '#88ffff', col2: '#4488ff', dmgMult: 1.2, label: 'THUNDER BOND'   },
  taekwondo_girl:         { col1: '#00ffee', col2: '#00ccff', dmgMult: 1.0, label: 'FLOW STATE'     },
  cyber_arm_hero:         { col1: '#ff8800', col2: '#ffcc44', dmgMult: 1.3, label: 'OVERDRIVE LINK' },
  brawler_warrior:        { col1: '#44ff88', col2: '#00ff66', dmgMult: 1.1, label: 'RAGE SIGNAL'    },
  assassin_clone:         { col1: '#ff44cc', col2: '#cc44ff', dmgMult: 1.1, label: 'SHADOW SYNC'    },
  euclid_vector:          { col1: '#66ff44', col2: '#88ff22', dmgMult: 1.0, label: 'VECTOR BOND'    },
  oni_cataclysm_protocol: { col1: '#ff5533', col2: '#ff9933', dmgMult: 1.5, label: 'PROTOCOL LINK'  },
};
const DEFAULT_SYNERGY = { col1: '#44ffff', col2: '#cc44ff', dmgMult: 1.0, label: 'ELECTRIC LINK' };

export class NpcWalker {
  constructor() {
    this.maxHp        = 120;
    this.hp           = 0;
    this.maxMana      = 100;
    this.mana         = 0;
    this.pos          = { x: 0, y: 0 };
    this.radius       = 18;

    this._active      = false;    // whether Walker is currently summoned
    this._activeDur   = 0;        // remaining active seconds
    this._synergy     = DEFAULT_SYNERGY;
    this._synergyId   = 'default';

    this.downed       = false;
    this.downedTimer  = 0;

    this.abilityCd    = 5;        // warm-up before first ult cast
    this._basicCd     = 2;        // warm-up before first basic attack
    this._dmgCooldown = 0;        // global enemy contact cooldown

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
      console.warn('[NpcWalker] assets/allies/npc/walker.png failed to load');
    };
    img.src = 'assets/allies/npc/walker.png';
    this._img = img;
  }

  get isActive() { return this._active; }

  // Called by Game.js when the summon timer fires
  summon(playerPos, synergyId, activeDur, maxHpBonus) {
    const _synId  = synergyId || 'default';
    const _actDur = (typeof activeDur === 'number' && activeDur > 0) ? activeDur : 60;
    this.maxHp       = 120 + Math.max(0, (maxHpBonus || 0));
    this.hp          = this.maxHp;
    this.mana        = Math.floor(this.maxMana * 0.4);
    this.pos         = { x: playerPos.x - 60, y: playerPos.y + 16 };
    this.downed      = false;
    this.downedTimer = 0;
    this.abilityCd   = 5;    // 5s warm-up before first ult
    this._basicCd    = 1;    // 1s before first basic wave
    this._dmgCooldown = 0;
    this._active     = true;
    this._activeDur  = _actDur;
    this._synergyId  = _synId;
    this._synergy    = SYNERGY_PROFILES[_synId] || DEFAULT_SYNERGY;
    this._vfx        = [];
  }

  dismiss() {
    this._active    = false;
    this._activeDur = 0;
    // keep _vfx so particles fade out naturally
  }

  // ── Update ────────────────────────────────────────────────────────────────
  update(dt, playerPos, game) {
    this._updateVfx(dt);
    if (!this._active) return;

    // Count down active window
    this._activeDur -= dt;
    if (this._activeDur <= 0) {
      this.dismiss();
      return;
    }

    // Global hit cooldown
    if (this._dmgCooldown > 0) this._dmgCooldown -= dt;

    if (this.downed) {
      this.downedTimer -= dt;
      if (this.downedTimer <= 0) this._revive(playerPos);
      return;
    }

    // Mana regen (base + card bonus)
    const manaRegen = WALKER_MANA_REGEN + (game.player ? (game.player.walkerManaRegenBonus || 0) : 0);
    this.mana = Math.min(this.maxMana, this.mana + manaRegen * dt);

    // Follow player
    const dx   = playerPos.x - this.pos.x;
    const dy   = playerPos.y - this.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > WALKER_FOLLOW_DIST + 8) {
      const speed = Math.min(WALKER_FOLLOW_SPEED, (dist - WALKER_FOLLOW_DIST) * 4);
      const inv   = 1 / dist;
      this.pos.x += dx * inv * speed * dt;
      this.pos.y += dy * inv * speed * dt;
    }

    // Enemy proximity damage on Walker
    this._updateEnemyDamage(game);
    if (!this._active || this.downed) return;

    // Basic electric wave (frequent, low damage)
    this._basicCd -= dt;
    if (this._basicCd <= 0 && this.mana >= BASIC_ATTACK_MANA) {
      const target = this._nearestTarget(game);
      if (target) {
        this._castBasicWave(target, game);
        this.mana     -= BASIC_ATTACK_MANA;
        const cdRed    = game.player ? (game.player.walkerBasicCdReduce || 0) : 0;
        this._basicCd  = Math.max(1.5, BASIC_ATTACK_CD - cdRed);
      } else {
        this._basicCd = 0.5;
      }
    }

    // Electric body shockwave ultimate (45s ability)
    const ultCd = Math.max(20, ABILITY_CD - (game.player ? (game.player.walkerAbilCdReduce || 0) : 0));
    this.abilityCd -= dt;
    if (this.abilityCd <= 0 && this.mana >= ABILITY_MANA_COST) {
      const target = this._nearestTarget(game);
      if (target) {
        const dmgBonus = game.player ? (game.player.walkerDmgBonus || 0) : 0;
        this._castShockwave(target, game, dmgBonus);
        this.mana      -= ABILITY_MANA_COST;
        this.abilityCd  = ultCd;
      }
    }
  }

  _revive(playerPos) {
    this.downed      = false;
    this.hp          = Math.round(this.maxHp * WALKER_REVIVE_PCT);
    this.mana        = Math.round(this.maxMana * 0.3);
    this.pos         = { x: playerPos.x - 60, y: playerPos.y + 16 };
    this.downedTimer = 0;
  }

  _updateEnemyDamage(game) {
    if (this.downed || !this._active) return;
    if (this._dmgCooldown > 0) return;
    // Normal enemies
    for (const e of (game.enemies || [])) {
      if (e.dead || e.dying) continue;
      if (!e.pos) continue;
      const er = (e.radius || 12);
      if (Math.hypot(e.pos.x - this.pos.x, e.pos.y - this.pos.y) < ENEMY_HIT_RANGE + er) {
        this.takeDamage(ENEMY_HIT_DAMAGE);
        this._dmgCooldown = ENEMY_DMG_COOLDOWN;
        return;
      }
    }
    // Boss proximity
    const bosses = [
      game.titanBoss, game.annihilatorBoss, game.bloodfangBoss,
      game.cyberSerpentBoss, game.cyberDragonBoss,
    ];
    for (const b of bosses) {
      if (!b || b.hp <= 0 || !b.pos) continue;
      const br = (b.radius || 60);
      if (Math.hypot(b.pos.x - this.pos.x, b.pos.y - this.pos.y) < ENEMY_HIT_RANGE + br) {
        this.takeDamage(BOSS_HIT_DAMAGE);
        this._dmgCooldown = 0.8;
        return;
      }
    }
    // DoubleDemonsBoss
    const dd = game.doubleDemonsBoss;
    if (dd && dd.hp > 0 && dd.gunner && dd.gunner.pos) {
      if (Math.hypot(dd.gunner.pos.x - this.pos.x, dd.gunner.pos.y - this.pos.y) < ENEMY_HIT_RANGE + 40) {
        this.takeDamage(BOSS_HIT_DAMAGE);
        this._dmgCooldown = 0.8;
      }
    }
  }

  _nearestTarget(game) {
    let best = null, bestD = Infinity;
    for (const e of (game.enemies || [])) {
      if (e.dead || e.dying) continue;
      if (!e.pos) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.y - this.pos.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    const singles = [
      game.titanBoss, game.annihilatorBoss, game.bloodfangBoss,
      game.cyberSerpentBoss, game.cyberDragonBoss,
    ];
    for (const b of singles) {
      if (!b || b.hp <= 0 || !b.pos) continue;
      const d = Math.hypot(b.pos.x - this.pos.x, b.pos.y - this.pos.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    const dd = game.doubleDemonsBoss;
    if (dd && dd.hp > 0 && dd.gunner && dd.gunner.pos) {
      const d = Math.hypot(dd.gunner.pos.x - this.pos.x, dd.gunner.pos.y - this.pos.y);
      if (d < bestD) { bestD = d; best = { pos: dd.gunner.pos, _isDD: true }; }
    }
    return best;
  }

  // Basic electric wave — short arc, small damage, frequent
  _castBasicWave(target, game) {
    const syn    = this._synergy;
    const rawDmg = Math.round(BASIC_ATTACK_DMG * (syn.dmgMult || 1.0));
    const tp     = target.pos;

    if (target._isDD) {
      if (game.doubleDemonsBoss && game.doubleDemonsBoss.hp > 0) {
        const eff = typeof game._capBossDamage === 'function'
          ? game._capBossDamage(game.doubleDemonsBoss, rawDmg) : rawDmg;
        game.doubleDemonsBoss.hp -= eff;
      }
    } else {
      const isBoss = (typeof target.isBoss === 'function' && target.isBoss()) || !!target.isMegaBoss;
      if (isBoss) {
        const eff = typeof game._capBossDamage === 'function'
          ? game._capBossDamage(target, rawDmg) : rawDmg;
        target.hp -= eff;
        if (target.hitFlash !== undefined) target.hitFlash = 0.06;
      } else {
        if (typeof target.takeHit === 'function') {
          target.takeHit(rawDmg, game);
        } else {
          target.hp -= rawDmg;
          if (target.hp <= 0 && !target.dead) target.dead = true;
          if (target.hitFlash !== undefined) target.hitFlash = 0.06;
        }
      }
    }

    // Lightweight VFX: small arc + tiny burst
    if (tp) {
      this._vfx.push({ type: 'arc', x1: this.pos.x, y1: this.pos.y, x2: tp.x, y2: tp.y, life: 0.16, maxLife: 0.16, color: syn.col1, lw: 1.5, jitter: [] });
      this._vfx.push({ type: 'burst', x: tp.x, y: tp.y, r: 0, maxR: 14, life: 0.18, maxLife: 0.18, color: syn.col2, lw: 1.5 });
    }
    if (this._vfx.length > MAX_VFX) this._vfx.splice(0, this._vfx.length - MAX_VFX);
  }

  // Electric body shockwave — ULTIMATE, large VFX, every 45s
  _castShockwave(target, game, dmgBonus) {
    const syn    = this._synergy;
    const rawDmg = Math.round((SHOCKWAVE_DMG + (dmgBonus || 0)) * (syn.dmgMult || 1.0));

    if (target._isDD) {
      if (game.doubleDemonsBoss && game.doubleDemonsBoss.hp > 0) {
        const eff = typeof game._capBossDamage === 'function'
          ? game._capBossDamage(game.doubleDemonsBoss, rawDmg) : rawDmg;
        game.doubleDemonsBoss.hp -= eff;
      }
      this._spawnUltVfx(target.pos, syn);
      return;
    }

    const isBoss = (typeof target.isBoss === 'function' && target.isBoss()) || !!target.isMegaBoss;
    if (isBoss) {
      const eff = typeof game._capBossDamage === 'function'
        ? game._capBossDamage(target, rawDmg) : rawDmg;
      target.hp -= eff;
      if (target.hitFlash !== undefined) target.hitFlash = 0.12;
    } else {
      if (typeof target.takeHit === 'function') {
        target.takeHit(rawDmg, game);
      } else {
        target.hp -= rawDmg;
        if (target.hp <= 0 && !target.dead) target.dead = true;
        if (target.hitFlash !== undefined) target.hitFlash = 0.12;
      }
    }
    this._spawnUltVfx(target.pos, syn);
  }

  _spawnUltVfx(targetPos, syn) {
    if (!targetPos) return;
    // Three expanding rings from Walker body
    this._vfx.push({ type: 'ring', x: this.pos.x, y: this.pos.y, r: 8, maxR: 72, life: 0.60, maxLife: 0.60, color: syn.col1, lw: 3 });
    this._vfx.push({ type: 'ring', x: this.pos.x, y: this.pos.y, r: 4, maxR: 48, life: 0.45, maxLife: 0.45, color: syn.col2, lw: 2 });
    this._vfx.push({ type: 'ring', x: this.pos.x, y: this.pos.y, r: 2, maxR: 28, life: 0.28, maxLife: 0.28, color: '#ffffff', lw: 1.5 });
    // Jagged lightning arc to target
    this._vfx.push({ type: 'arc', x1: this.pos.x, y1: this.pos.y, x2: targetPos.x, y2: targetPos.y, life: 0.32, maxLife: 0.32, color: syn.col1, lw: 2.5, jitter: this._makeJitter(targetPos) });
    // Impact burst at target
    this._vfx.push({ type: 'burst', x: targetPos.x, y: targetPos.y, r: 0, maxR: 40, life: 0.40, maxLife: 0.40, color: syn.col2, lw: 2 });
    if (this._vfx.length > MAX_VFX) this._vfx.splice(0, this._vfx.length - MAX_VFX);
  }

  _makeJitter(targetPos) {
    const pts = [];
    const dx  = targetPos.x - this.pos.x;
    const dy  = targetPos.y - this.pos.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx  = -dy / len;
    const ny  = dx / len;
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
    if (this.downed || !this._active) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp          = 0;
      this.downed      = true;
      this.downedTimer = WALKER_DOWNED_DUR;
    }
  }

  // ── Draw (world-space, camera-transformed) ────────────────────────────────
  draw(ctx) {
    this._drawVfx(ctx);
    if (!this._active) return;
    if (this.downed) { this._drawDowned(ctx); return; }
    this._drawSprite(ctx);
    this._drawWorldBars(ctx);
  }

  _drawSprite(ctx) {
    const x = Math.round(this.pos.x - SPRITE_W / 2);
    const y = Math.round(this.pos.y - SPRITE_H + 12);
    if (this._imgLoaded && this._img) {
      ctx.drawImage(this._img, x, y, SPRITE_W, SPRITE_H);
    } else {
      ctx.save();
      const syn = this._synergy;
      ctx.fillStyle   = syn.col1;
      ctx.strokeStyle = syn.col2;
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y - 26, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillRect(this.pos.x - 7, this.pos.y - 16, 14, 22);
      ctx.strokeRect(this.pos.x - 7, this.pos.y - 16, 14, 22);
      ctx.restore();
    }
  }

  _drawDowned(ctx) {
    const revivePct = 1 - this.downedTimer / WALKER_DOWNED_DUR;
    const pulse     = 0.28 + 0.28 * Math.abs(Math.sin(Date.now() / 500));
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle   = '#ff4466';
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(this.pos.x - 24, this.pos.y + 20, 48, 5);
    ctx.fillStyle = '#ff7799';
    ctx.fillRect(this.pos.x - 24, this.pos.y + 20, Math.round(48 * revivePct), 5);
    ctx.restore();
  }

  _drawWorldBars(ctx) {
    const bw = 44, bh = 4;
    const bx = Math.round(this.pos.x - bw / 2);
    const by = Math.round(this.pos.y - SPRITE_H - 4);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#ff4466';
    ctx.fillRect(bx, by, Math.round(bw * Math.max(0, this.hp / this.maxHp)), bh);
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
        if (v.r > 0) { ctx.beginPath(); ctx.arc(v.x, v.y, v.r, 0, Math.PI * 2); ctx.stroke(); }
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

  // ── Screen-space HUD panel (called by Game._drawNpcWalkerHUD) ─────────────
  // walkerSummonCd: seconds until next summon (shown only when inactive)
  drawHUDPanel(ctx, x, y, width, walkerSummonCd) {
    const W   = width;
    const PAD = 8;
    const ROW = 14;
    const BH  = 6;
    const syn = this._synergy;

    const H = !this._active
      ? PAD + ROW + 4 + ROW + PAD
      : this.downed
        ? PAD + ROW + 4 + BH + PAD
        : PAD + ROW + 4 + BH + 3 + BH + 4 + ROW + 4 + ROW + PAD;

    ctx.save();
    ctx.fillStyle = 'rgba(2,5,14,0.82)';
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(x, y, W, H, 5); ctx.fill();
    } else {
      ctx.fillRect(x, y, W, H);
    }
    const borderCol = !this._active
      ? 'rgba(80,80,100,0.25)'
      : this.downed
        ? 'rgba(255,68,102,0.35)'
        : (syn.col1 + '33');
    ctx.strokeStyle = borderCol;
    ctx.lineWidth   = 1;
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(x, y, W, H, 5); ctx.stroke();
    } else {
      ctx.strokeRect(x, y, W, H);
    }

    const barX = x + PAD;
    const barW = W - PAD * 2;
    let   cy   = y + PAD + ROW - 2;

    if (!this._active) {
      ctx.font      = 'bold 10px Consolas, monospace';
      ctx.fillStyle = 'rgba(100,120,140,0.7)';
      ctx.textAlign = 'left';
      ctx.fillText('KIROSHI WALKER', barX, cy);
      cy += ROW + 4;
      const cd   = Math.max(0, Math.ceil(walkerSummonCd || 0));
      const mins = Math.floor(cd / 60).toString().padStart(1, '0');
      const secs = (cd % 60).toString().padStart(2, '0');
      ctx.font      = '9px Consolas, monospace';
      ctx.fillStyle = 'rgba(100,150,160,0.55)';
      ctx.fillText('OFFLINE — INBOUND ' + mins + ':' + secs, barX, cy);
    } else if (this.downed) {
      ctx.font      = 'bold 10px Consolas, monospace';
      ctx.fillStyle = '#ff7799';
      ctx.textAlign = 'left';
      ctx.fillText('KIROSHI — DOWNED (' + Math.ceil(this.downedTimer) + 's)', barX, cy);
      cy += ROW + 4;
      const revivePct = 1 - this.downedTimer / WALKER_DOWNED_DUR;
      ctx.fillStyle = 'rgba(255,68,102,0.22)'; ctx.fillRect(barX, cy, barW, BH);
      ctx.fillStyle = '#ff4466';
      ctx.fillRect(barX, cy, Math.round(barW * revivePct), BH);
    } else {
      ctx.font      = 'bold 10px Consolas, monospace';
      ctx.fillStyle = syn.col1;
      ctx.textAlign = 'left';
      ctx.fillText('KIROSHI WALKER', barX, cy);
      cy += ROW + 4;
      // HP bar
      ctx.fillStyle = 'rgba(255,68,102,0.22)'; ctx.fillRect(barX, cy, barW, BH);
      ctx.fillStyle = '#ff4466';
      ctx.fillRect(barX, cy, Math.round(barW * Math.max(0, this.hp / this.maxHp)), BH);
      ctx.font = '7px Consolas, monospace'; ctx.fillStyle = 'rgba(200,200,230,0.55)';
      ctx.fillText('HP ' + Math.ceil(this.hp) + '/' + this.maxHp, barX, cy - 1);
      cy += BH + 3;
      // Mana bar
      ctx.fillStyle = 'rgba(68,136,255,0.22)'; ctx.fillRect(barX, cy, barW, BH);
      ctx.fillStyle = '#4488ff';
      ctx.fillRect(barX, cy, Math.round(barW * Math.max(0, this.mana / this.maxMana)), BH);
      ctx.font = '7px Consolas, monospace'; ctx.fillStyle = 'rgba(200,200,230,0.55)';
      ctx.fillText('MP ' + Math.ceil(this.mana) + '/' + this.maxMana, barX, cy - 1);
      cy += BH + 4;
      // Active duration remaining
      const actSec = Math.ceil(this._activeDur);
      const aMins  = Math.floor(actSec / 60).toString().padStart(1, '0');
      const aSecs  = (actSec % 60).toString().padStart(2, '0');
      ctx.font      = '9px Consolas, monospace';
      ctx.fillStyle = 'rgba(160,220,200,0.55)';
      ctx.fillText('ACTIVE ' + aMins + ':' + aSecs, barX, cy + ROW - 2);
      cy += ROW + 4;
      // Ability CD
      if (this.abilityCd <= 0 && this.mana >= ABILITY_MANA_COST) {
        ctx.fillStyle = '#aaff88';
        ctx.fillText('⚡ SHOCKWAVE  READY', barX, cy);
      } else if (this.mana < ABILITY_MANA_COST) {
        ctx.fillStyle = 'rgba(120,160,200,0.5)';
        ctx.fillText('⚡ CHARGING  ' + Math.floor(this.mana / ABILITY_MANA_COST * 100) + '%', barX, cy);
      } else {
        const cdL = Math.ceil(this.abilityCd);
        const cm  = Math.floor(cdL / 60).toString().padStart(1, '0');
        const cs  = (cdL % 60).toString().padStart(2, '0');
        ctx.fillStyle = 'rgba(120,160,200,0.5)';
        ctx.fillText('⚡ SHOCKWAVE  ' + cm + ':' + cs, barX, cy);
      }
    }

    ctx.restore();
    return H;
  }
}
