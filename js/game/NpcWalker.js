// NpcWalker.js — KIROSHI WALKER autonomous ally V4
import { Vec2 } from '../constants.js';
import { FloatingText } from '../entities/FloatingText.js';
// Summoned every 120s of active gameplay; active for 120s per window.
// Weapons: (1) basic electric wave (every 5s), (2) AoE shockwave ultimate (every 10s, multi-pulse),
//          (3) Mind Glitch / Neural Override (every 5s, applies glitch status → self-destruct).
// Support: autonomous dash every 10s → 10s player shield + 5% HP heal.
// Takes damage from enemy/boss proximity. Character-specific synergy VFX and damage bonuses.
// Does NOT trigger game-over when downed. Revives after 20s within the same active window.

const WALKER_FOLLOW_DIST  = 72;    // target gap from player (px)
const WALKER_FOLLOW_SPEED = 135;   // px/s approach speed (buffed — keeps pace with the player)
const WALKER_MANA_REGEN   = 13;   // mana/s — buffed to support 3 weapons
// ── Per-mode base HP (Maria 2026-07-19) ──────────────────────────────────────────
// Was `chaosMode ? 2000 : 120`. That 120 is the same number as the intended 120s active
// window (Game.js _wActiveDur) — the DURATION had been copied into the HP field.
// Measured on the real _updateEnemyDamage path: sustained incoming contact is 13.8 DPS
// (7 damage per 0.5s hit-cooldown; the cooldown hard-caps it no matter how big the crowd),
// so 120 HP downed the Walker in 6.4-8.8s — before it could finish even two shockwave
// cycles (a cycle needs ~20 mana at 13 mana/s, so ~10-15s for two).
// Values below are survival-time targets under CONTINUOUS worst-case contact; in normal
// play contact is intermittent, so effective uptime is longer. The Walker can still be
// downed under sustained boss + swarm pressure — it is not made invulnerable.
const WALKER_BASE_HP = {
  act1:    1200,   // ≈87s at 13.8 DPS continuous
  endless: 1500,   // ≈109s
  chaos:   2000,   // ≈145s — unchanged, already validated in play
};
const WALKER_DOWNED_DUR   = 20;   // seconds until revive (within same active window)
const WALKER_REVIVE_PCT   = 0.4;  // revive at 40% HP

const BASIC_ATTACK_CD     = 3.5;  // seconds between basic electric wave casts (buffed from 5.0)
const BASIC_ATTACK_DMG    = 26;   // base damage per basic hit (buffed from 18)
const BASIC_ATTACK_MANA   = 5;    // mana cost for basic wave

// ── Shockwave AoE Ultimate (reworked) ────────────────────────────────────────
const ABILITY_CD          = 10;   // seconds between shockwave ultimates
const ABILITY_MANA_COST   = 20;   // mana cost
const SHOCKWAVE_DMG       = 95;   // damage per pulse per enemy (buffed from 75)
const SHOCKWAVE_RADIUS    = 340;  // AoE radius in px — real range, not cosmetic (buffed from 280)
const SHOCKWAVE_PULSES    = 3;    // number of expanding pulses per activation
const SHOCKWAVE_PULSE_GAP = 0.20; // seconds between pulses

// ── Mind Glitch / Neural Override ─────────────────────────────────────────────
const GLITCH_CD           = 5;    // seconds between Mind Glitch casts
const GLITCH_MANA_COST    = 10;   // mana cost
const GLITCH_RANGE        = 300;  // px — range to select targets (buffed from 220)
const GLITCH_MAX_TARGETS  = 6;    // max enemies to glitch at once (buffed from 5)
const GLITCH_DELAY        = 1.1;  // seconds until self-destruct / heavy damage fires
const GLITCH_DAMAGE       = 165;  // heavy damage applied at end of glitch delay (buffed from 130)
const GLITCH_BOSS_DAMAGE  = 260;  // large hit applied to bosses via _capBossDamage (buffed from 200)

// ── Autonomous Dash ─────────────────────────────────────────────────────────────
const WALKER_DASH_CD      = 8;    // seconds between autonomous dashes (buffed from 10 — shield/heal uptime up)
const WALKER_DASH_DIST    = 90;   // px — distance of each dash toward nearest target

// ── Misc ─────────────────────────────────────────────────────────────────────
const ENEMY_HIT_RANGE     = 40;   // px — enemy proximity range that damages Walker
const ENEMY_HIT_DAMAGE    = 7;    // damage from normal enemy contact
const BOSS_HIT_DAMAGE     = 14;   // damage from boss contact
const ENEMY_DMG_COOLDOWN  = 0.5;  // global hit cooldown to prevent spam (seconds)

const MAX_VFX             = 96;   // hard cap on VFX particle count (raised for new effects)
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

    this.abilityCd    = 5;        // warm-up before first shockwave
    this._basicCd     = 2;        // warm-up before first basic attack
    this._glitchCd    = 4;        // warm-up before first mind glitch
    this._dmgCooldown = 0;        // global enemy contact cooldown

    // Pending shockwave pulses: [{delay, pulseIndex}]
    this._pendingPulses = [];
    // Active glitch targets: [{target, timer, isDone, isDD}]
    this._glitchedTargets = [];

    // Dash state
    this._dashCd           = 6;     // warm-up before first dash
    this._shieldAppliedTimer = 0;  // tracks recently applied shield (for HUD display)

    this._chaosHealCd  = 18;    // Chaos-only heal pulse: 6% maxHP every 18s

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

  summon(playerPos, synergyId, activeDur, maxHpBonus, chaosMode) {
    const _synId  = synergyId || 'default';
    const _actDur = (typeof activeDur === 'number' && activeDur > 0) ? activeDur : 60;
    // `mode` is now 'act1' | 'endless' | 'chaos'. Older callers passed a boolean chaosMode,
    // so that form is still accepted rather than silently falling through to act1.
    const _mode = (chaosMode === true) ? 'chaos'
                : (chaosMode === false || chaosMode == null) ? 'act1'
                : String(chaosMode);
    this.mode        = _mode;
    this.maxHp       = (WALKER_BASE_HP[_mode] ?? WALKER_BASE_HP.act1) + Math.max(0, (maxHpBonus || 0));
    this.hp          = this.maxHp;
    this.mana        = Math.floor(this.maxMana * 0.4);
    this.pos         = { x: playerPos.x - 60, y: playerPos.y + 16 };
    this.downed      = false;
    this.downedTimer = 0;
    this.abilityCd   = 5;
    this._basicCd    = 1;
    this._glitchCd   = 4;
    this._dmgCooldown = 0;
    this._pendingPulses   = [];
    this._glitchedTargets = [];
    this._dashCd           = 6;
    this._shieldAppliedTimer = 0;
    this._active     = true;
    this._activeDur  = _actDur;
    this._synergyId  = _synId;
    this._synergy    = SYNERGY_PROFILES[_synId] || DEFAULT_SYNERGY;
    this._vfx        = [];
  }

  // Promote an ALREADY-ACTIVE Walker to another mode's HP pool (used when Chaos starts
  // mid-run). Keeps current HP but guarantees at least 50% of the new pool, exactly as the
  // old inline code did — it just reads the per-mode table instead of a hardcoded 2000.
  promoteMode(mode) {
    const next = WALKER_BASE_HP[mode];
    if (!next || next <= this.maxHp) return;
    this.mode  = mode;
    this.maxHp = next;
    this.hp    = Math.max(this.hp, Math.round(next * 0.5));
  }

  dismiss() {
    this._active    = false;
    this._activeDur = 0;
  }

  // ── Update ────────────────────────────────────────────────────────────────
  update(dt, playerPos, game) {
    this._lastPlayerPos = playerPos;   // for the support-tether draw
    this._updateVfx(dt);
    this._updatePendingPulses(dt, game);
    this._updateGlitchedTargets(dt, game);

    if (!this._active) return;

    this._activeDur -= dt;
    if (this._activeDur <= 0) {
      this.dismiss();
      return;
    }

    if (this._dmgCooldown > 0) this._dmgCooldown -= dt;

    if (this.downed) {
      this.downedTimer -= dt;
      if (this.downedTimer <= 0) this._revive(playerPos);
      return;
    }

    // Chaos Mode: Walker mana regen doubled (Chaos-only; non-Chaos unchanged)
    const manaRegen = WALKER_MANA_REGEN * (game._chaosMode ? 2.0 : 1.0) + (game.player ? (game.player.walkerManaRegenBonus || 0) : 0);
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

    this._updateEnemyDamage(game);
    if (!this._active || this.downed) return;

    // ── Chaos Mode: periodic heal pulse (Chaos only; all characters; bounded +6% maxHP) ──
    if (game._chaosMode && game.player) {
      this._chaosHealCd -= dt;
      if (this._chaosHealCd <= 0) {
        this._chaosHealCd = 18;   // 18s between pulses
        const _chHeal = Math.round(game.player.maxHp * 0.06);
        game.player.hp = Math.min(game.player.maxHp, game.player.hp + _chHeal);
        if (Array.isArray(game.floatingTexts)) {
          const _ftPos = new Vec2(game.player.pos.x - 10, game.player.pos.y - 48);
          game.floatingTexts.push(new FloatingText('+' + _chHeal + ' WALKER HEAL', _ftPos, '#88ff88', 1.4));
        }
      }
    }

    const dmgBonus = game.player ? (game.player.walkerDmgBonus || 0) : 0;

    // ── Basic electric wave ───────────────────────────────────────────────
    this._basicCd -= dt;
    if (this._basicCd <= 0 && this.mana >= BASIC_ATTACK_MANA) {
      const target = this._nearestTarget(game);
      if (target) {
        this._castBasicWave(target, game);
        this.mana    -= BASIC_ATTACK_MANA;
        const cdRed   = game.player ? (game.player.walkerBasicCdReduce || 0) : 0;
        this._basicCd = Math.max(1.5, BASIC_ATTACK_CD - cdRed);
      } else {
        this._basicCd = 0.5;
      }
    }

    // ── Shockwave AoE ultimate ────────────────────────────────────────────
    const ultCd = Math.max(5, ABILITY_CD - (game.player ? (game.player.walkerAbilCdReduce || 0) : 0));
    this.abilityCd -= dt;
    if (this.abilityCd <= 0 && this.mana >= ABILITY_MANA_COST) {
      this._castShockwave(game, dmgBonus);
      this.mana      -= ABILITY_MANA_COST;
      this.abilityCd  = ultCd;
    }

    // ── Mind Glitch / Neural Override ────────────────────────────────────
    this._glitchCd -= dt;
    if (this._glitchCd <= 0 && this.mana >= GLITCH_MANA_COST) {
      if (this._castMindGlitch(game)) {
        this.mana      -= GLITCH_MANA_COST;
        this._glitchCd  = GLITCH_CD;
      } else {
        this._glitchCd = 1.5; // retry sooner if no targets
      }
    }

    // ── Autonomous dash ───────────────────────────────────────────────────
    if (this._shieldAppliedTimer > 0) this._shieldAppliedTimer -= dt;
    this._dashCd -= dt;
    if (this._dashCd <= 0) {
      this._doDash(game);
      this._dashCd = WALKER_DASH_CD;
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
    const dd = game.doubleDemonsBoss;
    if (dd && dd.hp > 0 && dd.gunner && dd.gunner.pos) {
      if (Math.hypot(dd.gunner.pos.x - this.pos.x, dd.gunner.pos.y - this.pos.y) < ENEMY_HIT_RANGE + 40) {
        this.takeDamage(BOSS_HIT_DAMAGE);
        this._dmgCooldown = 0.8;
      }
    }
  }

  _nearestTarget(game) {
    // Boss priority — always prefer any active boss over normal enemies
    let bestBoss = null, bestBossD = Infinity;
    const singles = [
      game.titanBoss, game.annihilatorBoss, game.bloodfangBoss,
      game.cyberSerpentBoss, game.cyberDragonBoss,
    ];
    for (const b of singles) {
      if (!b || b.hp <= 0 || !b.pos) continue;
      const d = Math.hypot(b.pos.x - this.pos.x, b.pos.y - this.pos.y);
      if (d < bestBossD) { bestBossD = d; bestBoss = b; }
    }
    const dd = game.doubleDemonsBoss;
    if (dd && dd.hp > 0 && dd.gunner && dd.gunner.pos) {
      const d = Math.hypot(dd.gunner.pos.x - this.pos.x, dd.gunner.pos.y - this.pos.y);
      if (d < bestBossD) { bestBossD = d; bestBoss = { pos: dd.gunner.pos, _isDD: true }; }
    }
    if (bestBoss) return bestBoss;  // always lock onto boss when present

    // Fallback — nearest normal enemy
    let bestEnemy = null, bestEnemyD = Infinity;
    for (const e of (game.enemies || [])) {
      if (e.dead || e.dying) continue;
      if (!e.pos) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.y - this.pos.y);
      if (d < bestEnemyD) { bestEnemyD = d; bestEnemy = e; }
    }
    return bestEnemy;
  }

  // ── Autonomous Dash ───────────────────────────────────────────────────────────
  _doDash(game) {
    const target = this._nearestTarget(game);
    const syn    = this._synergy;
    let tx = this.pos.x, ty = this.pos.y;
    if (target && target.pos) {
      const dx  = target.pos.x - this.pos.x;
      const dy  = target.pos.y - this.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      tx = this.pos.x + (dx / len) * WALKER_DASH_DIST;
      ty = this.pos.y + (dy / len) * WALKER_DASH_DIST;
    } else {
      // No target — dash sideways
      tx = this.pos.x + (Math.random() > 0.5 ? 1 : -1) * 55;
    }
    // Trail VFX at origin
    this._spawnDashVfx(this.pos.x, this.pos.y, syn, 6);
    // Reposition
    this.pos.x = tx;
    this.pos.y = ty;
    // Burst VFX at destination
    this._spawnDashVfx(this.pos.x, this.pos.y, syn, 10);
    // Apply player benefits
    if (game.player) {
      game.player.walkerShieldTimer = 5;   // support shield — separate from Q
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + game.player.maxHp * 0.05);
      this._shieldAppliedTimer = 5;
      // Floating texts
      if (Array.isArray(game.floatingTexts)) {
        game.floatingTexts.push(new FloatingText('+SHIELD', game.player.pos.add(new Vec2(-20, -34)), '#00ccff', 1.3, 13));
        game.floatingTexts.push(new FloatingText('+HEAL',   game.player.pos.add(new Vec2( 22, -20)), '#88ff88', 1.3, 13));
      }
    }
  }

  _spawnDashVfx(cx, cy, syn, count) {
    if (this._vfx.length >= MAX_VFX - count) return;
    for (let i = 0; i < count; i++) {
      const ang   = (Math.PI * 2 * i) / count;
      const speed = 70 + Math.random() * 110;
      this._vfx.push({
        type: 'particle', x: cx, y: cy,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        life: 0.3 + Math.random() * 0.2, maxLife: 0.5,
        r: 2.5 + Math.random() * 2.5,
        col: i % 2 === 0 ? syn.col1 : syn.col2,
      });
    }
  }

  // Late-run damage scaling: +3%/minute, capped ×2.2 (~40:00) — enemies scale
  // with time, so a flat-damage Walker fades into irrelevance without this.
  _lateMult(game) {
    const min = (game && typeof game.currentMinute === 'function') ? game.currentMinute() : 0;
    return 1 + Math.min(1.2, min * 0.03);
  }

  // ── Basic electric wave ────────────────────────────────────────────────────
  _castBasicWave(target, game) {
    const syn    = this._synergy;
    const rawDmg = Math.round(BASIC_ATTACK_DMG * (syn.dmgMult || 1.0) * this._lateMult(game));
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

    if (tp) {
      // Multi-strand electric arc: 3 overlapping strands with jitter for glow effect
      const _dx = tp.x - this.pos.x, _dy = tp.y - this.pos.y;
      const _len = Math.hypot(_dx, _dy) || 1;
      const _px  = -_dy / _len, _py = _dx / _len;   // perpendicular unit
      // Strand 1: main (bright, thicker)
      this._vfx.push({ type: 'arc', x1: this.pos.x, y1: this.pos.y, x2: tp.x, y2: tp.y, life: 0.18, maxLife: 0.18, color: syn.col1, lw: 2.0,
        jitter: [{ t: 0.33, ox: _px * (4 + Math.random() * 8),  oy: _py * (4 + Math.random() * 8) },
                 { t: 0.66, ox: _px * (-3 - Math.random() * 7), oy: _py * (-3 - Math.random() * 7) }] });
      // Strand 2: secondary (col2, thinner, offset)
      this._vfx.push({ type: 'arc', x1: this.pos.x + _px * 2, y1: this.pos.y + _py * 2,
                                     x2: tp.x + _px * 2, y2: tp.y + _py * 2,
        life: 0.14, maxLife: 0.14, color: syn.col2, lw: 1.2,
        jitter: [{ t: 0.50, ox: _px * (6 + Math.random() * 10), oy: _py * (6 + Math.random() * 10) }] });
      // Strand 3: outer glow arc (col1, very thin, wide offset)
      this._vfx.push({ type: 'arc', x1: this.pos.x - _px * 3, y1: this.pos.y - _py * 3,
                                     x2: tp.x - _px * 3, y2: tp.y - _py * 3,
        life: 0.12, maxLife: 0.12, color: syn.col1, lw: 0.8,
        jitter: [{ t: 0.45, ox: _px * (-5 - Math.random() * 9), oy: _py * (-5 - Math.random() * 9) }] });
      // Impact burst (larger for readability)
      this._vfx.push({ type: 'burst', x: tp.x, y: tp.y, r: 0, maxR: 18, life: 0.20, maxLife: 0.20, color: syn.col2, lw: 2.0 });
      this._vfx.push({ type: 'burst', x: tp.x, y: tp.y, r: 0, maxR: 10, life: 0.14, maxLife: 0.14, color: '#ffffff', lw: 1.5 });
    }
    if (this._vfx.length > MAX_VFX) this._vfx.splice(0, this._vfx.length - MAX_VFX);
  }

  // ── Shockwave AoE Ultimate ─────────────────────────────────────────────────
  // Emits from Walker position, expands outward, hits ALL enemies in radius.
  // Multi-pulse: 3 expanding rings, each does full damage.
  _castShockwave(game, dmgBonus) {
    const syn = this._synergy;
    // Queue 3 pulses with staggered delays
    for (let i = 0; i < SHOCKWAVE_PULSES; i++) {
      this._pendingPulses.push({
        delay:      i * SHOCKWAVE_PULSE_GAP,
        game,
        dmgBonus:   dmgBonus || 0,
        syn,
        pulseIdx:   i,
        // Track which enemies were already hit this activation to prevent double-dip
        hitSet:     new Set(),
      });
    }
    // Spawn large expanding ring VFX immediately (visual lead)
    this._spawnShockwaveVfx(syn);
  }

  _updatePendingPulses(dt, game) {
    for (let i = this._pendingPulses.length - 1; i >= 0; i--) {
      const p = this._pendingPulses[i];
      p.delay -= dt;
      if (p.delay <= 0) {
        this._fireShockwavePulse(p, game);
        this._pendingPulses.splice(i, 1);
      }
    }
  }

  _fireShockwavePulse(pulse, game) {
    const syn    = pulse.syn;
    const rawDmg = Math.round((SHOCKWAVE_DMG + (pulse.dmgBonus || 0)) * (syn.dmgMult || 1.0) * this._lateMult(game));
    const wx     = this.pos.x;
    const wy     = this.pos.y;
    const radius = SHOCKWAVE_RADIUS;
    let hitCount = 0;

    // Hit all normal enemies in radius
    for (const e of (game.enemies || [])) {
      if (e.dead || e.dying) continue;
      if (!e.pos) continue;
      const d = Math.hypot(e.pos.x - wx, e.pos.y - wy);
      if (d > radius) continue;
      if (pulse.hitSet && pulse.hitSet.has(e)) continue;
      if (pulse.hitSet) pulse.hitSet.add(e);

      if (typeof e.takeHit === 'function') {
        e.takeHit(rawDmg, game);
      } else {
        e.hp -= rawDmg;
        if (e.hp <= 0 && !e.dead) e.dead = true;
        if (e.hitFlash !== undefined) e.hitFlash = 0.14;
      }
      // Impact spark at enemy position
      this._vfx.push({ type: 'burst', x: e.pos.x, y: e.pos.y, r: 0, maxR: 18, life: 0.22, maxLife: 0.22, color: syn.col1, lw: 2 });
      hitCount++;
    }

    // Hit singleton bosses in radius
    const singleBosses = [
      game.titanBoss, game.annihilatorBoss, game.bloodfangBoss,
      game.cyberSerpentBoss, game.cyberDragonBoss,
    ];
    for (const b of singleBosses) {
      if (!b || b.hp <= 0 || !b.pos) continue;
      if (pulse.hitSet && pulse.hitSet.has(b)) continue;
      const d = Math.hypot(b.pos.x - wx, b.pos.y - wy);
      if (d > radius + (b.radius || 60)) continue; // generous radius for big bosses
      if (pulse.hitSet) pulse.hitSet.add(b);

      const eff = typeof game._capBossDamage === 'function'
        ? game._capBossDamage(b, rawDmg) : rawDmg;
      b.hp -= eff;
      if (b.hitFlash !== undefined) b.hitFlash = 0.15;
      // Trigger boss death handlers if HP reached 0
      if (b.hp <= 0) {
        if (b === game.titanBoss      && typeof game._titanDie      === 'function') game._titanDie();
        if (b === game.annihilatorBoss && typeof game._annihilatorDie === 'function') game._annihilatorDie();
        if (b === game.bloodfangBoss  && typeof game._bloodfangDie  === 'function') game._bloodfangDie();
        if (b === game.cyberSerpentBoss && typeof game._cyberSerpentDie === 'function') game._cyberSerpentDie();
        if (b === game.cyberDragonBoss  && typeof game._cyberDragonDie  === 'function') game._cyberDragonDie();
      }
      this._vfx.push({ type: 'burst', x: b.pos.x, y: b.pos.y, r: 0, maxR: 28, life: 0.28, maxLife: 0.28, color: syn.col1, lw: 2.5 });
      hitCount++;
    }

    // DoubleDemonsBoss
    const dd = game.doubleDemonsBoss;
    if (dd && dd.hp > 0 && dd.gunner && dd.gunner.pos) {
      if (!(pulse.hitSet && pulse.hitSet.has(dd))) {
        const d = Math.hypot(dd.gunner.pos.x - wx, dd.gunner.pos.y - wy);
        if (d <= radius + 50) {
          if (pulse.hitSet) pulse.hitSet.add(dd);
          const eff = typeof game._capBossDamage === 'function'
            ? game._capBossDamage(dd, rawDmg) : rawDmg;
          dd.hp -= eff;
          if (dd.hp <= 0 && typeof game._doubleDemonsDie === 'function') game._doubleDemonsDie();
          this._vfx.push({ type: 'burst', x: dd.gunner.pos.x, y: dd.gunner.pos.y, r: 0, maxR: 28, life: 0.28, maxLife: 0.28, color: syn.col1, lw: 2.5 });
          hitCount++;
        }
      }
    }

    // Per-pulse secondary ring VFX
    if (pulse.pulseIdx > 0) {
      const ringAlpha = 1 - pulse.pulseIdx * 0.25;
      this._vfx.push({ type: 'ring', x: wx, y: wy, r: pulse.pulseIdx * 40, maxR: SHOCKWAVE_RADIUS, life: 0.55, maxLife: 0.55, color: syn.col2, lw: 2, alpha: ringAlpha });
    }

    if (this._vfx.length > MAX_VFX) this._vfx.splice(0, this._vfx.length - MAX_VFX);
  }

  _spawnShockwaveVfx(syn) {
    // VS-FORMULA VISUAL FIX (Maria video QA 2026-07-19): εδώ γεννιόνταν τα «μεγάλα
    // κίτρινα circles μαζικά» του Act 1 video — 6 rings εδώ + 1 ανά damage pulse
    // (_fireShockwavePulse) = 9 ταυτόχρονα expanding rings ως 340px ανά activation,
    // που διάβαζαν σαν ενιαίο screen-filling κύμα. Αποδείχθηκε με canvas arc
    // instrumentation (stack: NpcWalker._drawVfx). Κρατάμε ΕΝΑ καθαρό lead ring
    // (αρχή) + inner flash (κορύφωση)· τα 3 pulse rings του _fireShockwavePulse
    // μένουν ως το ΑΚΡΙΒΕΣ telegraph κάθε πραγματικού pulse (τέλος). Damage,
    // pulses, radius και cadence ΑΝΕΓΓΙΧΤΑ — αφαιρέθηκαν μόνο duplicate layers.
    this._vfx.push({ type: 'ring', x: this.pos.x, y: this.pos.y, r: 8,  maxR: SHOCKWAVE_RADIUS, life: 0.75, maxLife: 0.75, color: syn.col1, lw: 4 });
    this._vfx.push({ type: 'burst', x: this.pos.x, y: this.pos.y, r: 0, maxR: 60, life: 0.30, maxLife: 0.30, color: syn.col1, lw: 3 });
  }

  // ── Mind Glitch / Neural Override ─────────────────────────────────────────
  // Targets up to 5 enemies/bosses in range, applies glitch status,
  // destroys/damages them after GLITCH_DELAY seconds.
  _castMindGlitch(game) {
    const wx = this.pos.x, wy = this.pos.y;
    const syn = this._synergy;
    const targets = [];

    // Collect normal enemies in range
    for (const e of (game.enemies || [])) {
      if (e.dead || e.dying) continue;
      if (!e.pos) continue;
      // Skip already-glitched enemies
      if (this._glitchedTargets.some(g => g.target === e)) continue;
      const d = Math.hypot(e.pos.x - wx, e.pos.y - wy);
      if (d <= GLITCH_RANGE) targets.push({ target: e, dist: d, isBoss: false, isDD: false });
    }

    // Collect singleton bosses in range
    const singleBosses = [
      game.titanBoss, game.annihilatorBoss, game.bloodfangBoss,
      game.cyberSerpentBoss, game.cyberDragonBoss,
    ];
    for (const b of singleBosses) {
      if (!b || b.hp <= 0 || !b.pos) continue;
      if (this._glitchedTargets.some(g => g.target === b)) continue;
      const d = Math.hypot(b.pos.x - wx, b.pos.y - wy);
      if (d <= GLITCH_RANGE + (b.radius || 60)) targets.push({ target: b, dist: d, isBoss: true, isDD: false });
    }

    // DoubleDemonsBoss
    const dd = game.doubleDemonsBoss;
    if (dd && dd.hp > 0 && dd.gunner && dd.gunner.pos && !this._glitchedTargets.some(g => g.isDD)) {
      const d = Math.hypot(dd.gunner.pos.x - wx, dd.gunner.pos.y - wy);
      if (d <= GLITCH_RANGE + 60) targets.push({ target: dd, dist: d, isBoss: true, isDD: true });
    }

    if (targets.length === 0) return false;

    // Sort by distance, pick closest GLITCH_MAX_TARGETS
    targets.sort((a, b) => a.dist - b.dist);
    const selected = targets.slice(0, GLITCH_MAX_TARGETS);

    for (const t of selected) {
      this._glitchedTargets.push({
        target:  t.target,
        timer:   GLITCH_DELAY,
        isDone:  false,
        isBoss:  t.isBoss,
        isDD:    t.isDD,
        syn,
      });
      // Mark visual glitch on target
      if (t.target.hitFlash !== undefined) t.target.hitFlash = 0.1;
      // Spawn glitch VFX around the target's position
      const tp = t.isDD ? (t.target.gunner?.pos || { x: wx, y: wy }) : t.target.pos;
      this._spawnGlitchVfx(tp, syn, 'onset');
    }

    // Walker cast VFX
    this._vfx.push({ type: 'burst', x: wx, y: wy, r: 0, maxR: 30, life: 0.22, maxLife: 0.22, color: '#cc44ff', lw: 2 });
    return true;
  }

  _updateGlitchedTargets(dt, game) {
    for (let i = this._glitchedTargets.length - 1; i >= 0; i--) {
      const g = this._glitchedTargets[i];
      if (g.isDone) { this._glitchedTargets.splice(i, 1); continue; }

      g.timer -= dt;

      // Flickering glitch VFX while the target lives
      if (Math.random() < 0.35 && g.timer > 0.15) {
        const tp = g.isDD
          ? (g.target.gunner?.pos || null)
          : (g.target.pos || null);
        if (tp) {
          // Random glitch sparks
          const angle = Math.random() * Math.PI * 2;
          const off   = 8 + Math.random() * 20;
          this._vfx.push({
            type: 'glitchSpark', x: tp.x + Math.cos(angle) * off, y: tp.y + Math.sin(angle) * off,
            life: 0.12, maxLife: 0.12, color: Math.random() < 0.5 ? g.syn.col2 : '#cc44ff', lw: 1.5,
          });
          // Periodic strong flash on target
          if (g.target.hitFlash !== undefined && Math.random() < 0.5) g.target.hitFlash = 0.08;
        }
      }

      if (g.timer <= 0) {
        g.isDone = true;
        this._resolveGlitch(g, game);
      }
    }
  }

  _resolveGlitch(g, game) {
    const tp = g.isDD
      ? (g.target.gunner?.pos || null)
      : (g.target.pos || null);

    if (g.isDD) {
      // DoubleDemonsBoss
      const dd = g.target;
      if (dd && dd.hp > 0) {
        const eff = typeof game._capBossDamage === 'function'
          ? game._capBossDamage(dd, GLITCH_BOSS_DAMAGE) : GLITCH_BOSS_DAMAGE;
        dd.hp -= eff;
        if (dd.hp <= 0 && typeof game._doubleDemonsDie === 'function') game._doubleDemonsDie();
      }
    } else if (g.isBoss) {
      const b = g.target;
      if (b && b.hp > 0) {
        const eff = typeof game._capBossDamage === 'function'
          ? game._capBossDamage(b, GLITCH_BOSS_DAMAGE) : GLITCH_BOSS_DAMAGE;
        b.hp -= eff;
        if (b.hitFlash !== undefined) b.hitFlash = 0.18;
        if (b.hp <= 0) {
          if (b === game.titanBoss      && typeof game._titanDie      === 'function') game._titanDie();
          if (b === game.annihilatorBoss && typeof game._annihilatorDie === 'function') game._annihilatorDie();
          if (b === game.bloodfangBoss  && typeof game._bloodfangDie  === 'function') game._bloodfangDie();
          if (b === game.cyberSerpentBoss && typeof game._cyberSerpentDie === 'function') game._cyberSerpentDie();
          if (b === game.cyberDragonBoss  && typeof game._cyberDragonDie  === 'function') game._cyberDragonDie();
        }
      }
    } else {
      // Normal enemy — kill via takeHit with large damage or direct
      const e = g.target;
      if (!e.dead && !e.dying) {
        if (typeof e.takeHit === 'function') {
          e.takeHit(Math.round(GLITCH_DAMAGE * this._lateMult(game)), game);
        } else {
          e.hp -= Math.round(GLITCH_DAMAGE * this._lateMult(game));
          if (e.hp <= 0 && !e.dead) e.dead = true;
        }
      }
    }

    // Implosion/explosion burst VFX at target position
    if (tp) {
      this._spawnGlitchVfx(tp, g.syn, 'explode');
    }
  }

  _spawnGlitchVfx(pos, syn, phase) {
    if (!pos) return;
    if (phase === 'onset') {
      // Initial glitch ring + sparks
      this._vfx.push({ type: 'ring',  x: pos.x, y: pos.y, r: 0, maxR: 32, life: 0.30, maxLife: 0.30, color: '#cc44ff', lw: 2 });
      this._vfx.push({ type: 'burst', x: pos.x, y: pos.y, r: 0, maxR: 20, life: 0.20, maxLife: 0.20, color: syn.col2,   lw: 1.5 });
    } else if (phase === 'explode') {
      // Final implosion burst
      this._vfx.push({ type: 'burst', x: pos.x, y: pos.y, r: 0, maxR: 48, life: 0.40, maxLife: 0.40, color: '#cc44ff', lw: 3 });
      this._vfx.push({ type: 'ring',  x: pos.x, y: pos.y, r: 4, maxR: 55, life: 0.35, maxLife: 0.35, color: syn.col1,   lw: 2.5 });
      this._vfx.push({ type: 'burst', x: pos.x, y: pos.y, r: 0, maxR: 28, life: 0.25, maxLife: 0.25, color: '#ffffff',  lw: 2 });
      // Scatter sparks
      for (let k = 0; k < 5; k++) {
        const angle = (k / 5) * Math.PI * 2;
        const r2    = 20 + Math.random() * 28;
        this._vfx.push({ type: 'glitchSpark', x: pos.x + Math.cos(angle) * r2, y: pos.y + Math.sin(angle) * r2, life: 0.20, maxLife: 0.20, color: '#cc44ff', lw: 1.5 });
      }
    }
    if (this._vfx.length > MAX_VFX) this._vfx.splice(0, this._vfx.length - MAX_VFX);
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
    // Draw glitch halos on targeted enemies (world-space)
    this._drawGlitchedTargets(ctx);
    if (!this._active) return;
    if (this.downed) { this._drawDowned(ctx); return; }
    this._drawSupportTether(ctx);
    this._drawSprite(ctx);
    this._drawWorldBars(ctx);
  }

  _drawGlitchedTargets(ctx) {
    if (this._glitchedTargets.length === 0) return;
    ctx.save();
    for (const g of this._glitchedTargets) {
      if (g.isDone) continue;
      const tp = g.isDD
        ? (g.target.gunner?.pos || null)
        : (g.target.pos || null);
      if (!tp) continue;
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 130));
      // Glitch ring halo
      ctx.globalAlpha = pulse * 0.8;
      ctx.strokeStyle = '#cc44ff';
      ctx.lineWidth   = 2.5;
      const r = (g.target.radius || 14) + 6;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // Timer text above target
      ctx.globalAlpha = 0.9;
      ctx.fillStyle   = '#ee88ff';
      ctx.font        = 'bold 9px Consolas, monospace';
      ctx.textAlign   = 'center';
      ctx.fillText('⚡ GLITCH', tp.x, tp.y - r - 6);
      ctx.fillText(g.timer.toFixed(1) + 's', tp.x, tp.y - r + 4);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Electric support tether — a living arc from the Walker to the player with energy
  // packets flowing PLAYER-ward: you can SEE what the ally is feeding you.
  _drawSupportTether(ctx) {
    const pp = this._lastPlayerPos;
    if (!pp || !this._active) return;
    const x1 = this.pos.x, y1 = this.pos.y - SPRITE_H * 0.55;
    const x2 = pp.x, y2 = pp.y;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    if (len > 420) return;                                  // out of link range — no tether
    const nx = -dy / len, ny = dx / len;
    const tT = Date.now() / 1000;
    const syn = this._synergy || { col1: '#7df9ff' };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // arc body (gentle sag + shimmer)
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(tT * 5);
    ctx.strokeStyle = syn.col1; ctx.lineWidth = 1.8;
    ctx.shadowColor = syn.col1; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let sgm = 1; sgm <= 6; sgm++) {
      const f = sgm / 6;
      const sag = Math.sin(f * Math.PI) * 14;
      const jit = Math.sin(tT * 11 + sgm * 5) * 3;
      ctx.lineTo(x1 + dx * f + nx * (sag + jit), y1 + dy * f + ny * (sag + jit));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // energy packets flowing toward the PLAYER
    for (let pk = 0; pk < 3; pk++) {
      const f = ((tT * 0.55) + pk / 3) % 1;
      const sag = Math.sin(f * Math.PI) * 14;
      ctx.globalAlpha = 0.85 * Math.sin(f * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x1 + dx * f + nx * sag, y1 + dy * f + ny * sag, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawSprite(ctx) {
    const x = Math.round(this.pos.x - SPRITE_W / 2);
    const y = Math.round(this.pos.y - SPRITE_H + 12);

    // Synergy-colored pulsing aura glow ring — readability in busy scenes
    {
      const syn    = this._synergy;
      const pulse  = 0.45 + 0.55 * Math.abs(Math.sin(Date.now() / 380));
      const pulse2 = 0.5  + 0.5  * Math.abs(Math.sin(Date.now() / 900));   // slow outer beacon
      const cx     = this.pos.x;
      const cy     = this.pos.y - SPRITE_H / 2 + 12;
      ctx.save();

      // Outer slow-pulsing beacon ring — large, unmistakable at a glance
      ctx.globalAlpha = 0.38 * pulse2;
      ctx.shadowColor = syn.col1;
      ctx.shadowBlur  = 28;
      ctx.strokeStyle = syn.col1;
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, SPRITE_W * 0.82, 0, Math.PI * 2);
      ctx.stroke();

      // Main inner aura ring — boosted alpha + blur vs. before
      ctx.globalAlpha = 0.82 * pulse;
      ctx.shadowColor = syn.col1;
      ctx.shadowBlur  = 36;
      ctx.strokeStyle = syn.col1;
      ctx.lineWidth   = 3.5;
      ctx.beginPath();
      ctx.arc(cx, cy, SPRITE_W * 0.52, 0, Math.PI * 2);
      ctx.stroke();

      // Inner tighter ring for crispness
      ctx.globalAlpha = 0.45 * pulse;
      ctx.shadowBlur  = 10;
      ctx.strokeStyle = syn.col2;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, SPRITE_W * 0.38, 0, Math.PI * 2);
      ctx.stroke();

      // Overhead downward-pointing chevron beacon
      const labelY = this.pos.y - SPRITE_H - 6;
      const chevX  = cx;
      const chevY  = labelY - 6;
      ctx.globalAlpha = 0.72 + 0.28 * pulse;
      ctx.shadowColor = syn.col1;
      ctx.shadowBlur  = 14;
      ctx.strokeStyle = syn.col1;
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.moveTo(chevX - 8, chevY - 8);
      ctx.lineTo(chevX,     chevY);
      ctx.lineTo(chevX + 8, chevY - 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(chevX - 6, chevY - 16);
      ctx.lineTo(chevX,     chevY - 8);
      ctx.lineTo(chevX + 6, chevY - 16);
      ctx.stroke();

      // "ALLY" label above chevron
      ctx.globalAlpha  = 0.85;
      ctx.shadowColor  = syn.col1;
      ctx.shadowBlur   = 10;
      ctx.fillStyle    = syn.col1;
      ctx.font         = 'bold 9px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('ALLY', chevX, chevY - 18);

      ctx.restore();
    }

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
      ctx.globalAlpha = alpha * (v.alpha !== undefined ? v.alpha : 1);
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
      } else if (v.type === 'glitchSpark') {
        // Small cross spark
        ctx.beginPath();
        ctx.moveTo(v.x - 3, v.y); ctx.lineTo(v.x + 3, v.y);
        ctx.moveTo(v.x, v.y - 3); ctx.lineTo(v.x, v.y + 3);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Screen-space HUD panel ────────────────────────────────────────────────
  drawHUDPanel(ctx, x, y, width, walkerSummonCd) {
    const W   = width;
    const PAD = 8;
    const ROW = 14;
    const BH  = 6;
    const syn = this._synergy;

    const hasGlitch = this._glitchedTargets.filter(g => !g.isDone).length > 0;
    const hasDashReady  = this._dashCd <= 0;
    const hasShield     = this._shieldAppliedTimer > 0;
    const activeH   = PAD + ROW + 4 + BH + 3 + BH + 4 + ROW + 4 + ROW + (hasGlitch ? ROW + 2 : 0) + ROW + 2 + (hasShield ? ROW + 2 : 0) + PAD;
    const H = !this._active
      ? PAD + ROW + 4 + ROW + PAD
      : this.downed
        ? PAD + ROW + 4 + BH + PAD
        : activeH;

    ctx.save();
    ctx.fillStyle = 'rgba(6,12,24,0.9)';   // dark glass — matches Eden transmission panel language
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(x, y, W, H, 5); ctx.fill();
    } else {
      ctx.fillRect(x, y, W, H);
    }
    const borderCol = !this._active
      ? 'rgba(110,150,180,0.6)'
      : this.downed
        ? 'rgba(255,68,102,0.8)'
        : (syn.col1 + 'cc');
    ctx.strokeStyle = borderCol;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = borderCol;
    ctx.shadowBlur  = this._active && !this.downed ? 10 : 5;
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(x, y, W, H, 5); ctx.stroke();
    } else {
      ctx.strokeRect(x, y, W, H);
    }
    ctx.shadowBlur = 0;

    const barX = x + PAD;
    const barW = W - PAD * 2;
    let   cy   = y + PAD + ROW - 2;

    if (!this._active) {
      ctx.font      = 'bold 10px Consolas, monospace';
      ctx.fillStyle = '#9fd8e8';
      ctx.textAlign = 'left';
      ctx.fillText('KIROSHI WALKER', barX, cy);
      cy += ROW + 4;
      const cd   = Math.max(0, Math.ceil(walkerSummonCd || 0));
      const mins = Math.floor(cd / 60).toString().padStart(1, '0');
      const secs = (cd % 60).toString().padStart(2, '0');
      ctx.font      = '9px Consolas, monospace';
      ctx.fillStyle = 'rgba(170,220,235,0.9)';
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
      // Active duration
      const actSec = Math.ceil(this._activeDur);
      const aMins  = Math.floor(actSec / 60).toString().padStart(1, '0');
      const aSecs  = (actSec % 60).toString().padStart(2, '0');
      ctx.font      = '9px Consolas, monospace';
      ctx.fillStyle = 'rgba(160,220,200,0.55)';
      ctx.fillText('ACTIVE ' + aMins + ':' + aSecs, barX, cy + ROW - 2);
      cy += ROW + 4;
      // Shockwave status
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
      // Mind Glitch status
      if (hasGlitch) {
        cy += ROW + 2;
        const gc = this._glitchedTargets.filter(g => !g.isDone).length;
        ctx.fillStyle = '#ee88ff';
        ctx.fillText('⚙ GLITCH  x' + gc + '  ACTIVE', barX, cy);
      }
      // Dash status
      cy += ROW + 2;
      if (this._dashCd <= 0) {
        ctx.fillStyle = '#88ffcc';
        ctx.fillText('» DASH  READY', barX, cy);
      } else {
        ctx.fillStyle = 'rgba(120,200,170,0.45)';
        ctx.fillText('» DASH  ' + Math.ceil(this._dashCd) + 's', barX, cy);
      }
      // Shield active indicator
      if (this._shieldAppliedTimer > 0) {
        cy += ROW + 2;
        ctx.fillStyle = '#44ccff';
        ctx.fillText('🛡 SHIELD  ' + Math.ceil(this._shieldAppliedTimer) + 's', barX, cy);
      }
    }

    ctx.restore();
    return H;
  }
}
