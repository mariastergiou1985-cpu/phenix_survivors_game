import { Vec2, WIDTH, HEIGHT, WORLD_W, WORLD_H, WORLD_MARGIN, WORLD_BOUNDS, PLAYER_RADIUS, CYAN, WHITE, YELLOW, GREEN, BLUE, RED } from '../constants.js';
import { clamp, safeNormalize } from '../utils.js';
import { Projectile } from './Projectile.js?v=20260706270000';
import { FloatingText } from './FloatingText.js';

export class Player {
  constructor(selectedCharacter = null, outfitSpritePath = null) {
    this.pos = new Vec2(WORLD_W / 2, WORLD_H / 2);
    this.vel = new Vec2();

    this.selectedCharacter = selectedCharacter || 'skeleton_warrior';
    this._outfitSpritePath = outfitSpritePath;   // null = default sprite; cosmetic only
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
    this._chillT           = 0.0;  // Cryo Claw chill: 25% move slow while > 0 (refresh, never stacks)

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
    } else if (this.selectedCharacter === 'brawler_warrior') {
      // Tanky hybrid: between Cyber Arm (ranged) and Skeleton (tank). Slower than Taekwondo,
      // tankier than Cyber Arm, not a glass cannon. Armor = existing contact-damage reduction.
      this.maxHp   = 125;
      this.hp      = 125;
      this.baseSpeed = Math.round(230 * 0.95);   // 219
      this.contactDamageReduction = 0.08;
    } else if (this.selectedCharacter === 'assassin_clone') {
      // Fast, lethal, fragile. Leans on speed + positioning + plasma weapons.
      // HP raised 88→96 (Chaos survivability pass) — speed/damage/dash unchanged.
      this.maxHp        = 96;
      this.hp           = 96;
      this.baseSpeed    = Math.round(230 * 1.12); // 258 (fast; only Taekwondo is faster)
      this.pickupRadius = 88;
    } else if (this.selectedCharacter === 'eddie') {
      // Thunder / Berserk — still the tankiest bruiser (biggest HP, strong mana), but Phase 12
      // balance nerf trims the COMPOUNDING edge: no longer also the fastest, and slightly less armor.
      this.maxHp     = 225;    // balance pass (Maria): was 260 — still tanky, no longer an outlier
      this.hp        = 225;
      this.maxMana   = 100;    // was 120 — ultimate cadence in line with the others
      this.mana      = 100;
      this.baseSpeed = Math.round(230 * 1.15); // 264 (was 290 — now below Taekwondo 276 & Assassin 258-ish, not fastest)
      this.contactDamageReduction = 0.16;      // was 0.20 — still armored, no longer best-in-class
    } else if (this.selectedCharacter === 'dimis_kickboxer') {
      // Heavy armored cyber martial artist: highest survivability, SLOWEST of all characters.
      this.maxHp   = 150;
      this.hp      = 150;
      this.maxMana = 100;
      this.mana    = 100;
      this.baseSpeed = Math.round(230 * 0.82);   // 189 — slowest (below Skeleton 207)
      this.contactDamageReduction = 0.10;        // armor 10
    } else if (this.selectedCharacter === 'japan_phasewalker') {
      // #74 Glitch-walker — fast + fragile. Leans on phase-shard auto-shots, EMP Shockwave (E) and
      // the Digital Singularity ultimate (SPACE, mana-fed). Low armor: survives by repositioning.
      this.maxHp        = 95;
      this.hp           = 95;
      this.maxMana      = 100;
      this.mana         = 100;
      this.baseSpeed    = Math.round(230 * 1.18); // 271 — very fast (just below Taekwondo 276)
      this.pickupRadius = 84;
      this.contactDamageReduction = 0.06;         // fragile: minimal armor
    } else if (this.selectedCharacter === 'cyber_arm_hero') {
      // Ranged / Damage mid-liner — was falling through to constructor defaults
      // (audit 2026-07-12): now a proper stat identity. Baseline speed kept.
      this.maxHp   = 105;
      this.hp      = 105;
      this.contactDamageReduction = 0.04;         // light plating on the cyber arm
    } else if (this.selectedCharacter === 'euclid_vector') {
      // Toxin / Ranged kiter — lives at distance, slightly quick, modest plating (Maria: armor 0.08).
      this.maxHp        = 100;
      this.hp           = 100;
      this.baseSpeed    = Math.round(230 * 1.05); // 242 — nimble, well below Assassin 258
      this.pickupRadius = 80;
      this.contactDamageReduction = 0.08;
    } else if (this.selectedCharacter === 'oni_cataclysm_protocol') {
      // Endless / Cataclysm juggernaut (14 PF unlock) — heavy and slow, 3rd toughest
      // after Eddie (225/0.16) and Dimi (150/0.10). Was generic 100 HP / armor 0.
      this.maxHp   = 140;
      this.hp      = 140;
      this.baseSpeed = Math.round(230 * 0.92);   // 212 — heavy stride (Skeleton 207, Dimi 189)
      this.contactDamageReduction = 0.12;
    }

    this._tankTimer   = 0;     // Oni Protocol 0: damage-reduction window
    this.xpMult       = 1;     // XP Uplink meta multiplier
    this.abilityCdMult = 1;    // Null Battery relic: 1.08 = 8% faster Q/E cooldowns

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

    // Chaos Nexus buff stars — temporary tactical HASTE (attack-speed) buff, non-HP.
    // Read live in shoot() as an extra fire-rate factor; ticks down in update().
    this._chaosHasteMult  = 1.0;
    this._chaosHasteTimer = 0.0;

    // Phase 13 — per-character movement signature trail (velocity-driven, bounded, cosmetic).
    this._sigTrail = [];
    this._sigTimer = 0;

    // Phase 5 — procedural movement animation state (cosmetic only, no gameplay effect).
    // _animPhase advances with distance travelled (so the "step" cadence matches speed),
    // _moveBlend eases 0→1 between idle and running, _facing mirrors the sprite left/right.
    this._animPhase = 0;
    this._moveBlend = 0;
    this._facing    = 1;

    // Phase 7 — armor shield pickup buff: +15% damage reduction while > 0 (refresh, no stack).
    this._armorT = 0;

    this.kills             = 0;
    this.coresSecured      = 0;
    this.upgrades = {
      'Cyber-Legs': 0, 'Memory Bank': 0, 'Tractor Beam': 0,
      'Firewall Protection': 0, 'Pulse Damage': 0, 'Homing Disc': 0,
      'EMP Cloud': 0, 'Quantum Overhaul': 0,
      'Fire Rate': 0, 'Projectile Speed': 0, 'Cryo Rounds': 0,
      'Max HP': 0, 'Max Mana': 0, 'Grid Investor': 0, 'Suppression': 0,
      'Glacial Shatter': 0, 'Auto-Forge Drone': 0,
    };

    // Elemental Phase 3 — run-only secondary elements granted by Infusion cards (reset each new run,
    // since a fresh Player is built on reset). Never persisted to save data.
    this.secondaryElements = [];

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
    if (this._rushVulnMult) amount *= this._rushVulnMult;   // Glass Vow: +25% damage taken during Boss Rush
    if ((this._vowInvulnT || 0) > 0) return;       // Φ11 Phoenix Vow immunity window
    let mult = this.shieldTimer > 0 ? 0.4 : 1;
    if ((this._tankTimer || 0) > 0) mult *= 0.5;   // Oni Protocol 0: 50% damage reduction
    if ((this._armorT || 0) > 0) mult *= 0.85;     // Phase 7: armor shield pickup (+15% DR)
    if ((this._nexusDomeT || 0) > 0) mult *= 0.85; // Φ14: Chaos DEFENCE nexus dome (+15% DR)
    // Φ11 Emergency Protocol: hit while below 30% HP → 1s auto-shield 30% (level-gated CD)
    if ((this._stEmergencyLvl || 0) > 0 && this.hp / this.maxHp < 0.3 && (this._emergCd || 0) <= 0) {
      this._emergT  = 1.0;
      this._emergCd = [0, 20, 15, 12, 10, 8][Math.min(5, this._stEmergencyLvl)];
    }
    if ((this._emergT || 0) > 0) mult *= 0.7;
    const next = this.hp - amount * mult;
    // Φ11 Phoenix Vow: once per run a killing blow leaves you at 1 HP + 2s immunity (L2: +25% heal)
    if (next <= 0 && (this._stVowLvl || 0) > 0 && !this._stVowUsed) {
      this._stVowUsed  = true;
      this._vowInvulnT = 2.0;
      this.hp = Math.max(1, this._stVowLvl >= 2 ? Math.round(this.maxHp * 0.25) : 1);
      return;
    }
    this.hp = Math.max(0, next);
  }

  _loadCharacterSprite() {
    // Endless roster sprites live in a subfolder; map them here (others use the root path).
    // oni_cataclysm_protocol is DATA-READY ONLY (locked @14 PF, NOT in the Character-Select roster yet,
    // so this entry is inert until he's wired). Confirmed future kit (js/effects/ canvas modules):
    //   laser-eyes.js = auto-weapon 1 · meteor-rain.js = auto-weapon 2 (AoE) · protocol-0.js = SPACE ult.
    //   Q/E stay shared global utilities; SPACE is his ultimate only. (euclid_vector intentionally NOT wired.)
    const ENDLESS_SPRITES = {
      japan_phasewalker:      'assets/characters/endless/japan_phasewalker.png?v=20260615210000',   // ?v bust: corrected transparency
      oni_cataclysm_protocol: 'assets/characters/endless/oni_cataclysm_protocol.png',
      euclid_vector:          'assets/characters/endless/euclid_vector.png',           // playable; auto toxin needle weapon
      eddie:                  'assets/characters/eddie_thunder_guitar.png',            // root folder; descriptive filename (not eddie.png)
    };
    const defaultPath = ENDLESS_SPRITES[this.selectedCharacter] || `assets/characters/${this.selectedCharacter}.png`;
    const spritePath  = this._outfitSpritePath || defaultPath;
    this.characterSprite = new Image();
    if (spritePath !== defaultPath) {
      // Equipped a secret outfit — if its asset is missing/fails, fall back to the default
      // sprite so the run is never broken. Draw code re-reads this.characterSprite each frame.
      this.characterSprite.onerror = () => {
        console.warn('[Outfit] failed to load ' + spritePath + ' — falling back to default outfit (' + defaultPath + ')');
        const fb = new Image();
        fb.src = defaultPath;
        this.characterSprite = fb;
      };
    }
    this.characterSprite.src = spritePath;

    const attackMap = {
      'skeleton_warrior': 'assets/effects/attacks/bone_shockwave.png',
      'taekwondo_girl':   'assets/effects/attacks/lightning_kick_arc.png',
      'cyber_arm_hero':   'assets/effects/attacks/cyber_arm_pulse_beam.png',
      'assassin_clone':   'assets/weapons/arrow_assasin.png',   // ranged auto-shot = a thrown arrow (rotated to travel dir)
      'dimis_kickboxer':  'assets/weapons/Cyber-Gauntlets Injection.png',   // Dimi auto-attack = cyber-gauntlet strike
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
      case 'brawler_warrior': return { primary: '#1fd6a6', secondary: '#0a9c78' };
      case 'assassin_clone': return { primary: '#ff4dd2', secondary: '#9aa0aa' };
      case 'eddie': return { primary: '#ff2d2d', secondary: '#ffb43c' };
      default: return { primary: CYAN, secondary: WHITE };
    }
  }

  // Readability-only visibility tint (under-glow pool + sprite rim). Per-character so the
  // hero stays trackable in late-game crowds: Skeleton = crimson, Cyber Arm = blue,
  // Taekwondo/Dojang Girl = aqua. Subtle alphas keep it premium, not gaudy.
  _getVisibilityColors() {
    switch (this.selectedCharacter) {
      case 'skeleton_warrior':
        return { rim: '#ff3a4e', innerGlow: 'rgba(255,58,78,0.32)',  outerGlow: 'rgba(255,58,78,0)' };
      case 'cyber_arm_hero':
        return { rim: '#3aa0ff', innerGlow: 'rgba(58,160,255,0.30)', outerGlow: 'rgba(58,160,255,0)' };
      case 'taekwondo_girl':
        return { rim: '#14ebd2', innerGlow: 'rgba(20,235,210,0.30)', outerGlow: 'rgba(20,235,210,0)' };
      case 'brawler_warrior':
        return { rim: '#1fd6a6', innerGlow: 'rgba(31,214,166,0.30)', outerGlow: 'rgba(31,214,166,0)' };
      case 'assassin_clone':
        return { rim: '#ff4dd2', innerGlow: 'rgba(255,77,210,0.30)', outerGlow: 'rgba(255,77,210,0)' };
      case 'eddie':
        return { rim: '#ff3a3a', innerGlow: 'rgba(255,58,58,0.30)',  outerGlow: 'rgba(255,58,58,0)' };
      default:
        return { rim: '#00e6ff', innerGlow: 'rgba(0,230,255,0.28)',  outerGlow: 'rgba(0,230,255,0)' };
    }
  }

  get speed()             { return this.baseSpeed * (1 + this.speedBonus) * (this._chillT > 0 ? 0.75 : 1) * ((this._adrenalT || 0) > 0 ? 1.15 : 1); }
  get overloadDampening() { return this.upgrades['Firewall Protection'] * 0.02; }

  // Smooth quadratic curve (XP to go from `level` → `level+1`). Gentle early so the
  // first minutes don't level instantly, then a steady rise that NEVER runs away
  // exponentially — combined with time-scaled kill XP (Enemy._die) this keeps
  // level-up cards arriving regularly through mid and late game.
  _xpForLevel(level) {
    // Slightly slower early (so the new higher enemy density doesn't strobe level-ups),
    // a steady quadratic mid-game, and — paired with time-scaled kill XP in Enemy._die —
    // still regular level-ups in the late game.
    return Math.round(8 + level * 5 + level * level * 1.05);   // BALANCE pass 3: 0.85→1.05 + higher base — Maria: card pool must last a full session
  }

  gainXp(amount, floatingTexts) {
    const gained = Math.max(1, Math.round(amount * (this.xpMult || 1)));   // XP Uplink meta
    this.xp += gained;
    floatingTexts.push(new FloatingText(`+${gained} TECH-XP`, this.pos.clone(), GREEN));

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
    if (this._chaosHasteTimer > 0) { this._chaosHasteTimer -= dt; if (this._chaosHasteTimer <= 0) this._chaosHasteMult = 1.0; }
    this.sonicPulseCooldown = Math.max(0, this.sonicPulseCooldown - dt);
    this.empCloudCooldown   = Math.max(0, this.empCloudCooldown - dt * this.abilityCdMult);
    this.shieldTimer         = Math.max(0, this.shieldTimer - dt);
    this.pulseShieldCooldown = Math.max(0, this.pulseShieldCooldown - dt * this.abilityCdMult);

    // Bite debuff timers + bleed tick (1 HP/s)
    if (this.staggerTimer > 0)      this.staggerTimer      -= dt;
    if (this.stunImmunityTimer > 0) this.stunImmunityTimer -= dt;
    if (this.bleedTimer > 0)      { this.bleedTimer -= dt; this.hp = Math.max(0, this.hp - dt); }
    if (this._chillT > 0)           this._chillT -= dt;   // Cryo Claw chill decay
    if ((this._armorT || 0) > 0)    this._armorT -= dt;   // armor pickup buff decay
    if ((this._emergT || 0) > 0)      this._emergT -= dt;       // Φ11 emergency shield window
    if ((this._emergCd || 0) > 0)     this._emergCd -= dt;
    if ((this._vowInvulnT || 0) > 0)  this._vowInvulnT -= dt;   // Φ11 phoenix vow immunity
    if ((this._stOverloadT || 0) > 0) this._stOverloadT -= dt;  // Φ11 overload window
    if ((this._adrenalT || 0) > 0)    this._adrenalT -= dt;     // Φ11 adrenal dash window

    if (dir.lengthSq() > 0) this.lastFacingDir = dir.clone();

    const dashCost  = this.selectedCharacter === 'taekwondo_girl' ? 30 : 35;
    const regenRate = this.selectedCharacter === 'taekwondo_girl' ? 28.75 : 25;
    const dashDir   = dir.lengthSq() > 0 ? dir : this.lastFacingDir;

    const wantsDash = keys.has('shift');  // SHIFT = global dash (SPACE is the character ultimate)
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
    { const _a = this._dashTrail; let _w = 0; for (let _i = 0; _i < _a.length; _i++) { const t = _a[_i]; if (t.alpha > 0) _a[_w++] = t; } _a.length = _w; }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vel = this._dashDir.scale(this.speed * 3.5);
      if (this.dashTimer <= 0 && (this._stAdrenalLvl || 0) > 0) {   // Φ11 Adrenal Dash window
        this._adrenalT = 1.5 + 0.3 * (this._stAdrenalLvl - 1);
      }
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
    this.pos.x = clamp(this.pos.x, WORLD_BOUNDS.left + WORLD_BOUNDS.margin, WORLD_BOUNDS.right - WORLD_BOUNDS.margin);
    this.pos.y = clamp(this.pos.y, WORLD_BOUNDS.top + WORLD_BOUNDS.margin + 40, WORLD_BOUNDS.bottom - WORLD_BOUNDS.margin);

    // ── Phase 13: movement signature trail — spawn while actually moving, bounded + fading ──
    const sp = Math.hypot(this.vel.x, this.vel.y);

    // ── Phase 5: movement animation state (cosmetic) ──
    // Step phase advances with distance so the bob cadence tracks actual speed (dash included).
    const prof = this._animProfile();
    if (sp > 10) this._animPhase += sp * dt * prof.freq;
    const targetBlend = sp > 10 ? Math.min(1, sp / this.speed) : 0;
    this._moveBlend += (targetBlend - this._moveBlend) * Math.min(1, dt * 10);   // ease in/out
    if (Math.abs(this.vel.x) > 5) this._facing = this.vel.x >= 0 ? 1 : -1;
    this._sigTimer -= dt;
    if (sp > 55 && this._sigTimer <= 0) {
      this._sigTimer = 0.05;
      const ang = Math.atan2(this.vel.y, this.vel.x);
      // spawn slightly BEHIND the player (opposite the velocity) so it reads as a wake
      this._sigTrail.push({ x: this.pos.x - Math.cos(ang) * 10, y: this.pos.y + 12 - Math.sin(ang) * 10, a: 1, r: 7 + Math.random() * 5 });
      if (this._sigTrail.length > 16) this._sigTrail.shift();
    }
    for (let i = this._sigTrail.length - 1; i >= 0; i--) {
      const s = this._sigTrail[i]; s.a -= dt * 1.8; s.r += dt * 10;
      if (s.a <= 0) this._sigTrail.splice(i, 1);
    }
  }

  // Phase 13 — per-character signature color/style for the movement trail.
  _sigStyle() {
    switch (this.selectedCharacter) {
      case 'brawler_warrior':          return { c: '#ff7a1a', comp: 'lighter' };  // magma vent
      case 'skeleton_warrior':         return { c: '#ff2d55', comp: 'lighter' };  // neon-red glitch
      case 'taekwondo_girl':           return { c: '#44ffff', comp: 'lighter' };  // cyan electric ribbon
      case 'cyber_arm_hero':           return { c: '#bfefff', comp: 'lighter' };  // white/cyan steam
      case 'assassin_clone':           return { c: '#b06bff', comp: 'lighter' };  // purple phantom echo
      case 'euclid_vector':            return { c: '#7CFF4D', comp: 'lighter' };  // green toxic mist
      case 'oni_cataclysm_protocol':   return { c: '#9d6bff', comp: 'lighter' };  // void dust
      case 'eddie':                    return { c: '#ff3b3b', comp: 'lighter' };  // warp flicker
      case 'dimis_kickboxer':          return { c: '#b026ff', comp: 'lighter' };  // heavy purple cyber-vent
      default:                         return null;                               // phasewalker/other: none
    }
  }

  // Phase 5 — per-character movement animation profile. freq scales step cadence per pixel
  // travelled; bob = vertical hop px; lean = max tilt (rad) into the run; stretch = squash
  // amplitude. Heavies read slow + weighty, speedsters read quick + light. Cosmetic only.
  _animProfile() {
    switch (this.selectedCharacter) {
      case 'taekwondo_girl':         return { freq: 0.055, bob: 3.2, lean: 0.10, stretch: 0.045 }; // fastest — quick light steps
      case 'japan_phasewalker':      return { freq: 0.052, bob: 2.6, lean: 0.11, stretch: 0.040 }; // glitch-walker — darty
      case 'assassin_clone':         return { freq: 0.050, bob: 2.8, lean: 0.10, stretch: 0.040 }; // lethal glide
      case 'eddie':                  return { freq: 0.042, bob: 3.6, lean: 0.07, stretch: 0.050 }; // big bruiser stomp
      case 'brawler_warrior':        return { freq: 0.042, bob: 3.4, lean: 0.07, stretch: 0.048 };
      case 'cyber_arm_hero':         return { freq: 0.045, bob: 3.0, lean: 0.08, stretch: 0.042 };
      case 'euclid_vector':          return { freq: 0.046, bob: 2.8, lean: 0.09, stretch: 0.040 };
      case 'oni_cataclysm_protocol': return { freq: 0.038, bob: 3.6, lean: 0.06, stretch: 0.050 }; // ominous heavy stride
      case 'skeleton_warrior':       return { freq: 0.040, bob: 3.8, lean: 0.06, stretch: 0.055 }; // bony clatter — heavy bob
      case 'dimis_kickboxer':        return { freq: 0.035, bob: 4.0, lean: 0.05, stretch: 0.060 }; // slowest, heaviest stomp
      default:                       return { freq: 0.045, bob: 3.0, lean: 0.08, stretch: 0.045 };
    }
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

  // Chaos Nexus buff star — apply a temporary attack-speed HASTE (tactical, non-HP).
  applyChaosHaste(mult = 1.4, dur = 8) {
    this._chaosHasteMult  = Math.max(this._chaosHasteMult || 1, mult);
    this._chaosHasteTimer = Math.max(this._chaosHasteTimer || 0, dur);
  }

  canShoot() { return this.shootCooldown <= 0; }

  shoot(mousePos) {
    const _ovl = (this._stOverloadT || 0) > 0 ? 1 + 0.08 * (this._stOverloadLvl || 0) : 1;   // Φ11 Overload Window
    this.shootCooldown = 0.18 / ((1 + this.fireRateBonus) * (this._vesselFireRateMult || 1) * (this._chaosHasteMult || 1) * _ovl);
    const dir    = safeNormalize(new Vec2(mousePos.x - this.pos.x, mousePos.y - this.pos.y));
    const base   = 1 + this.upgrades['Pulse Damage'];
    let damage   = base;
    let projLife = 0.9;
    if (this.selectedCharacter === 'taekwondo_girl') {
      damage = base * 0.9;
    } else if (this.selectedCharacter === 'cyber_arm_hero') {
      damage   = base * 1.2;
      projLife = 1.3;
    } else if (this.selectedCharacter === 'dimis_kickboxer') {
      damage   = base * 1.25 * (1 + 0.10 * (this.upgrades['dimi_ironframe_mastery'] || 0));   // heavy gauntlet strike
      projLife = 1.0;
    }
    const proj = new Projectile(this.pos.clone(), dir, damage, this.attackSprite);
    proj.life  = projLife;
    proj.speed = 760 * (1 + this.projSpeedBonus);            // Shot Speed card
    if (this.selectedCharacter === 'japan_phasewalker') proj.style = 'phase_shard';   // cyan glitch needle, not an orb
    else if (this.selectedCharacter === 'euclid_vector') proj.style = 'toxin_shard';  // green toxin needle (auto toxin weapon)
    return proj;
  }

  draw(ctx, mousePos) {
    // Phase 7: armor buff ring — thin gold band so the +15% DR window is readable
    if ((this._armorT || 0) > 0) {
      const fade = Math.min(1, this._armorT / 1.5);
      ctx.save();
      ctx.globalAlpha = 0.55 * fade;
      ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, PLAYER_RADIUS + 11, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
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

    // ── Phase 13: movement signature trail (per-character color/style) ──
    const sig = this._sigStyle();
    if (sig && this._sigTrail.length) {
      ctx.save();
      ctx.globalCompositeOperation = sig.comp;
      ctx.fillStyle = sig.c;
      for (const s of this._sigTrail) {
        ctx.globalAlpha = Math.max(0, s.a) * 0.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ── Player visibility pass (readability only) — character-tinted ground glow + sprite rim.
    // Drawn in world space so it scales with the camera zoom on every map. A soft neon pool at
    // the feet plus a tinted rim that hugs the silhouette keeps the player trackable in late-game
    // crowds. Purely cosmetic — no gameplay effect.
    const vis = this._getVisibilityColors();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gx = this.pos.x, gy = this.pos.y + 16, gr = PLAYER_RADIUS * 2.5;
    const pool = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    pool.addColorStop(0, vis.innerGlow);
    pool.addColorStop(1, vis.outerGlow);
    ctx.fillStyle = pool;
    ctx.beginPath(); ctx.ellipse(gx, gy, gr, gr * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Draw character sprite (64 px tall) or fallback colored circle
    const colors = this._getCharacterFallbackColors();
    const spr    = this.characterSprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      const sprH = 64;
      const sprW = Math.round(spr.naturalWidth * (sprH / spr.naturalHeight));

      // ── Phase 5: procedural movement animation — no static slide. All transforms pivot at the
      // FEET (bottom-center) so steps plant on the ground. Running: distance-driven bob (hop),
      // lean into the travel direction, step squash/stretch. Idle: soft breathing. The sprite
      // mirrors to face the movement direction. Cosmetic only — position/hitbox untouched.
      const prof  = this._animProfile();
      const blend = this._moveBlend;
      const step  = Math.sin(this._animPhase);
      const now   = performance.now() / 1000;
      const bobY    = -Math.abs(step) * prof.bob * blend;                                  // hop (always up)
      const lean    = clamp(this.vel.x / (this.speed || 1), -1, 1) * prof.lean * blend
                    + step * 0.02 * blend;                                                 // tilt + step wobble
      const breathe = (1 - blend) * Math.sin(now * 2.2) * 0.02;                            // idle breathing
      const stY     = 1 + step * prof.stretch * blend + breathe;                           // vertical stretch
      const stX     = 1 - (step * prof.stretch * blend + breathe) * 0.7;                   // volume-preserving

      ctx.save();
      ctx.translate(this.pos.x, this.pos.y + sprH / 2 + bobY);   // feet pivot
      ctx.rotate(lean);
      ctx.scale(stX * this._facing, stY);
      ctx.shadowColor = vis.rim;   // tinted rim hugging the sprite silhouette ("outline")
      ctx.shadowBlur  = 8;
      ctx.drawImage(spr, -sprW / 2, -sprH, sprW, sprH);
      ctx.restore();
    } else {
      ctx.fillStyle   = colors.primary;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, PLAYER_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = colors.secondary; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, PLAYER_RADIUS, 0, Math.PI * 2); ctx.stroke();
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
// Phase 5: procedural movement animation — sync marker 20260711450000-r2
