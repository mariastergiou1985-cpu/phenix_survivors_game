import {
  Vec2, ENEMY_RADIUS, WIDTH, HEIGHT, WORLD_W, WORLD_H, WORLD_MARGIN, WORLD_BOUNDS,
  BLUE, MAGENTA, PURPLE, ORANGE, GREEN, RED, YELLOW, WHITE, CYAN, MATRIX_RADIUS,
} from '../constants.js';
import { clamp, distance, safeNormalize, randomRange, randomChoice, drawBar } from '../utils.js';
import { DataCore } from './DataCore.js?v=20260705040000';
import { FloatingText } from './FloatingText.js';
import { drawGlow } from '../game/Effects.js?v=20260713600000';
import { PRIMARY_WEAPON_MAP, MINI_WEAPON_MAP, BOSS_WEAPON_MAP, getWeaponById } from '../game/EnemyWeaponCatalog.js?v=20260708300000';

// ─── Enemy body-sprite cache (each PNG loads & decodes ONCE, shared by all spawns) ──
const _enemySpriteCache = new Map();
function _getEnemySprite(spriteFile) {
  let img = _enemySpriteCache.get(spriteFile);
  if (img) return img;
  img = new Image();
  img.onerror = () => {
    console.warn(`[Enemy] Sprite failed: assets/enemies/${spriteFile}.png`);
    _enemySpriteCache.delete(spriteFile);   // allow retry on next spawn
  };
  img.src = `assets/enemies/${spriteFile}.png?v=20260615210000`;
  _enemySpriteCache.set(spriteFile, img);
  return img;
}

// ─── Weapon sprite cache (shared across all enemies — each PNG loads once) ──────
const _weaponSpriteCache = new Map();
function _getWeaponSprite(weaponDef) {
  if (!weaponDef || !weaponDef.spritePath) return null;
  if (_weaponSpriteCache.has(weaponDef.id)) return _weaponSpriteCache.get(weaponDef.id);
  const img = new Image();
  img.onerror = () => {
    console.warn('[PHENIX] weapon sprite FAILED:', weaponDef.spritePath);
    _weaponSpriteCache.delete(weaponDef.id);   // allow retry
  };
  img.src = weaponDef.spritePath + '?v=20260704180000';
  _weaponSpriteCache.set(weaponDef.id, img);
  return img;
}

// ── Eagerly preload ALL enemy weapon sprites during boot ───────────────────────
// Call once from Game.js init so sprites are already loaded when enemies spawn.
export function preloadAllWeaponSprites() {
  const allMaps = [PRIMARY_WEAPON_MAP, MINI_WEAPON_MAP, BOSS_WEAPON_MAP];
  const seen = new Set();
  for (const map of allMaps) {
    for (const ids of Object.values(map)) {
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const def = getWeaponById(id);
        if (def) _getWeaponSprite(def);
      }
    }
  }
  console.log('[PHENIX] preloaded', seen.size, 'enemy weapon sprites');
}

// ─── Hit/death feedback tuning (visual only — no balance impact) ────────────────
// One place to dial the juice. Particle counts stay small and the ParticleSystem
// has a hard global cap (MAX), so crowded fights never flood.
const FEEDBACK = {
  flashDuration:        0.08,  // seconds an enemy tints white after a hit
  normalDeathParticles: 16,    // spark burst on a normal enemy death
  heavyDeathParticles:  18,    // spark burst on a heavy/elite/boss-type death
  burstSize:            2.8,    // base particle size for the death burst
  heavyRingCount:       16,     // particles forming the heavy-death shock-ring
  heavyRingSpeed:       220,    // outward speed of the heavy-death ring
  heavyRadius:          20,     // enemy radius at/above which a death counts as "heavy"
};

export class Enemy {
  // Chaos Mega Titans — treated as mega-bosses (huge radius, boss HP bars, no biome mods).
  static CHAOS_TITANS = new Set([
    'Giga-Core Overlord', 'Malware Leviathan', 'Quantum Void Emperor', 'Apocalypse Mech Tyrant',
  ]);

  constructor(enemyType, minute) {
    this.enemyType = enemyType;
    this.pos       = this._spawnEdge();
    this.vel       = new Vec2();

    // Encirclement steering: per-enemy tangential slot so the swarm spreads into a RING around the
    // player (Vampire-Survivors pressure) instead of stacking into one column. Sign+magnitude random.
    this._encSlot  = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5);
    this._stuckT   = 0;    // short stuck-detection timer
    this._lastDist = 0;

    this.hitFlash   = 0;
    this.stunned    = 0;
    this.slowTimer  = 0;     // Cryo Rounds debuff: reduced movement speed while > 0
    this.slowFactor = 0.55;  // speed multiplier while slowed (Suppression lowers it)

    // ── Game Feel ──────────────────────────────────────────────────────────────
    // Knockback impulse (px/s). Decays exponentially each frame; applied before movement AI.
    this._kbx = 0;
    this._kby = 0;
    // Last weapon color that hit this enemy — drives element-specific death particles.
    this._lastHitColor = null;

    const [spd, hp, color, stealTime, contactDamage] = this._statsForType(enemyType, minute);
    this.baseSpeed     = spd;
    this._baseSpeedFull = spd;   // canonical speed; baseSpeed is recomputed each frame with slow
    this.hp            = hp;
    this.maxHp         = hp;
    this.color         = color;
    this.stealTime     = stealTime;
    this.contactDamage = contactDamage * 1.10;   // Maria 2026-07-12: all enemy damage +10% (single central point)
    this.radius        = ENEMY_RADIUS;

    if (enemyType === 'Security Defector Mech')  this.radius = 28;
    else if (enemyType === 'Rogue AI Overlord')   this.radius = 44;
    else if (enemyType === 'Heavy Mech')          this.radius = 22;
    else if (enemyType === 'Solar Tyrant')        this.radius = 26;   // rare solar heavy (new — unused art activated)
    else if (enemyType === 'Cybermote')           this.radius = 30;   // CYBERMOTE event bike (destructible event)
    else if (enemyType === 'Plasma Juggernaut')   this.radius = 30;   // Chaos tank
    else if (enemyType === 'Singularity Core Mech') this.radius = 34; // Chaos elite bruiser
    else if (Enemy.CHAOS_TITANS.has(enemyType))   this.radius = 90;   // Mega Titans — MUCH larger than the player

    // Phase D flags
    this.isMegaBoss      = false;
    this.bodyguardTarget = null;

    // Endless Elite Waves flag — set AFTER construction by Game._spawnEliteWave (Endless only).
    // Visual/feedback marker only; never alters base stats here or any Act-1 enemy.
    this.isElite         = false;

    // Role-based targeting
    this.role          = this._roleForType(enemyType);
    this.shootTimer    = Math.random() * 2;  // stagger initial shots
    this.shootInterval = null;  // null = melee-only
    this.bulletSpeed   = 0;
    this.bulletDamage  = 0;
    this.bulletRadius  = 5;
    this.bulletColor   = CYAN;
    this._initRole(enemyType);

    // ═══ HORDE REBUILD (spec 2026-07-16) ══════════════════════════════════
    // §8 Ένα καθαρό αρχέτυπο ανά type. §2: μόνο ranged/miniboss/boss πυροβολούν —
    // ΟΛΗ η υπόλοιπη ορδή είναι contact-only pursuit (το gate αδειάζει το shootInterval
    // που όρισε το _initRole· ένα σημείο, καμία αλλαγή στα 30 cases).
    this.archetype = this._archetypeForType(enemyType);
    if (this.archetype !== 'ranged' && this.archetype !== 'miniboss' && this.archetype !== 'boss')
      this.shootInterval = null;
    // §4 Οργανική κίνηση: σταθερή, deterministic παραλλαγή ταχύτητας ανά enemy (LCG seed) —
    // όχι random jitter ανά frame. Ίδια σε όλη τη ζωή του enemy.
    Enemy._seedLCG = ((Enemy._seedLCG || 12345) * 9301 + 49297) % 233280;
    this.speedVariation = 0.92 + 0.16 * (Enemy._seedLCG / 233280);
    // §5 Separation weight ανά κατηγορία βάρους (ποτέ ισχυρότερο από το pursuit)
    this._sepW = { fodder: 0.04, swarm: 0.04, fast: 0.06, ranged: 0.08, charger: 0.08,
                   shield: 0.14, heavy: 0.14, miniboss: 0.18, boss: 0.18 }[this.archetype] || 0.06;
    // §9 Ranged specialist: σταθερά ανά enemy (spawn-time, όχι per-frame random)
    this._telegraphT = 0; this._burstQ = 0; this._burstT = 0; this._guardCrackT = 0;
    if (this.archetype === 'ranged') {
      this._rangedDetect = 300 + Math.random() * 100;    // §9 detection 260-420px
      this._rangedTele   = 0.5 + Math.random() * 0.2;    // telegraph 500-700ms
      this._rangedCd     = 3.0 + Math.random() * 1.5;    // cooldown 3.0-4.5s
      this._burstN       = enemyType === 'Void Rift Summoner' ? 3 : 1;  // ο ΜΟΝΟΣ burst specialist (§9)
      if (this._burstN > 1) this._rangedCd = 4.0 + Math.random() * 2.0; // burst cooldown 4-6s
    }

    // Load enemy sprite
    this.sprite = null;
    this._loadSprite();
  }

  // ═══ HORDE REBUILD §8 — αντιστοίχιση ΚΑΘΕ type σε ΕΝΑ αρχέτυπο ═════════════
  // fodder: μικρό/χαμηλό HP swarm · swarm: βασικός contact walker · fast: hunter κοντά
  // στην ταχύτητα παίκτη · heavy: αργό/τανκ contact · charger: telegraph->ευθεία ·
  // shield: μπροστινή μείωση damage · ranged: ο σπάνιος ειδικός · miniboss/boss.
  // ΜΕΤΑΤΡΟΠΕΣ σε melee (πριν πυροβολούσαν): Rogue Punk, Overclocked Berserker,
  // Abyss Maw(->shield), Amethyst Fang, Ember Scarab, Pulse Burrower, Void Widow,
  // Malware Spreader, Plasma Juggernaut(->shield), Singularity Core Mech, Solar Stinger.
  // ΠΑΡΑΜΕΝΟΥΝ ranged (καθαρή ταυτότητα): Cyber Shooter, Rift Eye, EMP Hacker Drone,
  // Wireframe Net-Caster, Void Rift Summoner (burst 3).
  _archetypeForType(type) {
    switch (type) {
      case 'Glitch Drone': case 'Volt Rat': case 'Neon Swarmer':
        return 'fodder';
      case 'Rogue Punk': case 'Scrap Scavenger': case 'Cyber-Net Junkie':
      case 'Ember Scarab': case 'Pulse Burrower': case 'Cryo Claw':
      case 'Malware Spreader':
        return 'swarm';
      case 'Combat Hunter': case 'Stealth Infiltrator': case 'Overclocked Berserker':
      case 'Solar Stinger': case 'Toxin Leech': case 'Amethyst Fang':
      case 'Razorhound': case 'Data Glitch Stalker': case 'Cybermote':
        return 'fast';
      case 'Heavy Mech': case 'Solar Tyrant': case 'Void Widow':
      case 'Cyber-Axe Executioner': case 'Singularity Core Mech':
        return 'heavy';
      case 'Overclocked Bomber':
        return 'charger';
      case 'Abyss Maw': case 'Plasma Juggernaut':
        return 'shield';
      case 'Cyber Shooter': case 'Rift Eye': case 'EMP Hacker Drone':
      case 'Wireframe Net-Caster': case 'Void Rift Summoner':
        return 'ranged';
      case 'Security Defector Mech':
        return 'miniboss';
      case 'Rogue AI Overlord': case 'Giga-Core Overlord': case 'Malware Leviathan':
      case 'Quantum Void Emperor': case 'Apocalypse Mech Tyrant':
        return 'boss';
      default:
        return 'swarm';
    }
  }

  // §9 Κανονικός ranged: ΜΙΑ στοχευμένη βολή (ή μικρό burst 3×130ms μόνο στον specialist).
  // Μικρό lead 14%% — σαφώς αποφύξιμη. Ο director (Phase 3) κόβει τη βολή χωρίς token.
  _fireRangedShot(game, isBurst = false) {
    if (isBurst) { if (--this._burstQ < 0) { this._burstQ = 0; return; } }
    else if (this._burstN > 1) { this._burstQ = this._burstN - 1; this._burstT = 0.13; }
    const pv  = game.player.vel || new Vec2();
    const dir = safeNormalize(game.player.pos.add(pv.scale(0.14)).sub(this.pos));
    if (dir.lengthSq() === 0) return;
    const ok = game.spawnEnemyBullet(this.pos.clone(), dir, this.bulletSpeed || 420, this.bulletDamage || 8,
      this.bulletRadius || 6, this.bulletColor,
      { weaponSprite: this._weaponSprite || null, weaponSize: this._weaponSize || 0, cls: 'ranged' });
    if (ok === false) { this._burstQ = 0; return; }   // §10: χωρίς token -> ακύρωση ΚΑΙ του burst
    game.audio?.playEnemyShoot();
  }

  _roleForType(type) {
    switch (type) {
      case 'Glitch Drone':           return 'hunter';
      case 'Rogue Punk':             return 'mixed';
      case 'Stealth Infiltrator':    return 'assassin';
      case 'Overclocked Berserker':  return 'mixed';
      case 'Security Defector Mech': return 'hybrid';
      case 'Rogue AI Overlord':      return 'boss';
      case 'Combat Hunter':          return 'hunter';
      case 'Cyber Shooter':          return 'shooter';
      case 'Heavy Mech':             return 'hunter';
      case 'Solar Tyrant':           return 'hunter';   // slow solar juggernaut, pure melee (VS rule)
      case 'Cybermote':              return 'hunter';   // event bike — circles + rams (weapons run in Game)
      case 'Razorhound':             return 'hunter';  // fast melee chaser, never steals
      // ── New mini enemies (weapon pack) ──
      case 'Abyss Maw':              return 'mixed';
      case 'Amethyst Fang':          return 'shooter';
      case 'Cryo Claw':              return 'hunter';
      case 'Ember Scarab':           return 'mixed';
      case 'Pulse Burrower':         return 'mixed';
      case 'Rift Eye':               return 'shooter';
      case 'Solar Stinger':          return 'hunter';   // Φ7 VS-style: fast melee wasp (was a circle-spam shooter)
      case 'Toxin Leech':            return 'hunter';
      case 'Void Widow':             return 'shooter';
      case 'Volt Rat':               return 'hunter';
      case 'Scrap Scavenger':        return 'hunter';   // Phase 1: was 'scavenger' → fled at 115px, literally harmless
      case 'Cyber-Net Junkie':       return 'hunter';   // Phase 1: same — now a real melee chaser
      // ── Chaos Mode enemies ──
      case 'Neon Swarmer':           return 'hunter';    // fast fragile swarm
      case 'Data Glitch Stalker':    return 'assassin';  // stealth chaser
      case 'Plasma Juggernaut':      return 'hybrid';    // tank + occasional shot
      case 'Overclocked Bomber':     return 'hunter';    // suicide rusher (heavy contact)
      case 'EMP Hacker Drone':       return 'shooter';   // ranged harass
      case 'Cyber-Axe Executioner':  return 'hunter';    // heavy melee chaser
      case 'Malware Spreader':       return 'mixed';     // area denial / toxic
      case 'Void Rift Summoner':     return 'shooter';   // ranged
      case 'Wireframe Net-Caster':   return 'shooter';   // ranged slow/net
      case 'Singularity Core Mech':  return 'hybrid';    // elite bruiser
      // ── Chaos Mega Titans ──
      case 'Giga-Core Overlord':     return 'boss';
      case 'Malware Leviathan':      return 'boss';
      case 'Quantum Void Emperor':   return 'boss';
      case 'Apocalypse Mech Tyrant': return 'boss';
      default:                       return 'scavenger';
    }
  }

  _initRole(type) {
    switch (type) {
      // Glitch Drone — Φ7 VS-style: pure melee swarm pressure, NO bullets (was weak circle spam)
      case 'Security Defector Mech':
        this.shootInterval = 2.6;
        this.bulletSpeed   = 400;   // speed pass: 280 → 400
        this.bulletDamage  = 20;
        this.bulletRadius  = 9;
        this.bulletColor   = CYAN;    // Electric/Fire beam (addendum visual mapping)
        break;
      case 'Rogue AI Overlord':
        this.shootInterval = 1.9;
        this.bulletSpeed   = 440;   // speed pass: 320 → 440
        this.bulletDamage  = 38;
        this.bulletRadius  = 11;
        this.bulletColor   = RED;
        break;
      case 'Rogue Punk':
        this.shootInterval = 3.0;   // Phase 4: 2.4→3.0 — he now actually fires (mixed fix); keep minute-0 TTK fair
        this.bulletSpeed   = 460;   // speed pass: 360 → 460
        this.bulletDamage  = 7;
        this.bulletRadius  = 5;
        this.bulletColor   = MAGENTA;
        break;
      case 'Overclocked Berserker':
        this.shootInterval = 3.2;
        this.bulletSpeed   = 400;   // speed pass: 280 → 400
        this.bulletDamage  = 12;
        this.bulletRadius  = 8;
        this.bulletColor   = RED;
        break;
      case 'Cyber Shooter':
        this.shootInterval = 2.2;
        this.bulletSpeed   = 440;   // speed pass: 340 → 440
        this.bulletDamage  = 6;
        this.bulletRadius  = 6;
        this.bulletColor   = CYAN;
        break;
      case 'Heavy Mech':
        this.shootInterval = 4.5;
        this.bulletSpeed   = 300;   // speed pass: 180 → 300
        this.bulletDamage  = 11;
        this.bulletRadius  = 9;
        this.bulletColor   = ORANGE;
        break;
      // ── New mini enemies — weapon-catalog-derived shooting stats ──
      case 'Abyss Maw':
        this.shootInterval = 4.5;
        this.bulletSpeed   = 340;   // speed pass: 200 → 340
        this.bulletDamage  = 20;
        this.bulletRadius  = 10;
        this.bulletColor   = PURPLE;
        break;
      case 'Amethyst Fang':
        this.shootInterval = 2.2;
        this.bulletSpeed   = 720;   // already fast — unchanged
        this.bulletDamage  = 14;
        this.bulletRadius  = 4;
        this.bulletColor   = PURPLE;
        break;
      case 'Ember Scarab':
        this.shootInterval = 2.8;
        this.bulletSpeed   = 480;   // speed pass: 380 → 480
        this.bulletDamage  = 10;
        this.bulletRadius  = 8;
        this.bulletColor   = ORANGE;
        break;
      case 'Pulse Burrower':
        this.shootInterval = 3.5;
        this.bulletSpeed   = 420;   // speed pass: 300 → 420
        this.bulletDamage  = 5;
        this.bulletRadius  = 6;
        this.bulletColor   = CYAN;
        break;
      case 'Rift Eye':
        this.shootInterval = 4.0;
        this.bulletSpeed   = 440;   // speed pass: 340 → 440
        this.bulletDamage  = 6;
        this.bulletRadius  = 7;
        this.bulletColor   = PURPLE;
        break;
      // Solar Stinger — Φ7 VS-style: pure melee swarm pressure, NO bullets (was weak circle spam)
      case 'Void Widow':
        this.shootInterval = 2.8;
        this.bulletSpeed   = 500;   // speed pass: 400 → 500
        this.bulletDamage  = 15;
        this.bulletRadius  = 7;
        this.bulletColor   = PURPLE;
        break;
      // Volt Rat — Φ7 VS-style: pure melee swarm pressure, NO bullets (was weak circle spam)
      // ── Chaos Mode ranged/mixed enemies ──
      case 'EMP Hacker Drone':
        this.shootInterval = 2.4;
        this.bulletSpeed   = 470;
        this.bulletDamage  = 7;
        this.bulletRadius  = 6;
        this.bulletColor   = CYAN;
        break;
      case 'Malware Spreader':
        this.shootInterval = 3.0;
        this.bulletSpeed   = 360;
        this.bulletDamage  = 9;
        this.bulletRadius  = 8;
        this.bulletColor   = GREEN;
        break;
      case 'Void Rift Summoner':
        this.shootInterval = 3.2;
        this.bulletSpeed   = 430;
        this.bulletDamage  = 12;
        this.bulletRadius  = 9;
        this.bulletColor   = PURPLE;
        break;
      case 'Wireframe Net-Caster':
        this.shootInterval = 2.8;
        this.bulletSpeed   = 400;
        this.bulletDamage  = 8;
        this.bulletRadius  = 7;
        this.bulletColor   = CYAN;
        break;
      // ── Chaos Mega Titans — heavy boss fire (their signature screen-abilities are
      // layered in Game.js; this keeps them dangerous at range even between abilities) ──
      case 'Giga-Core Overlord':
        this.shootInterval = 1.7; this.bulletSpeed = 460; this.bulletDamage = 34; this.bulletRadius = 13; this.bulletColor = WHITE; break;
      case 'Malware Leviathan':
        this.shootInterval = 1.9; this.bulletSpeed = 420; this.bulletDamage = 30; this.bulletRadius = 13; this.bulletColor = GREEN; break;
      case 'Quantum Void Emperor':
        this.shootInterval = 1.8; this.bulletSpeed = 440; this.bulletDamage = 36; this.bulletRadius = 13; this.bulletColor = YELLOW; break;
      case 'Apocalypse Mech Tyrant':
        this.shootInterval = 2.0; this.bulletSpeed = 400; this.bulletDamage = 32; this.bulletRadius = 14; this.bulletColor = RED; break;
    }

    // ── Weapon sprite lookup — preload primary weapon sprite for this enemy ──
    // Priority: BOSS → MINI → PRIMARY (base enemies). All 3 maps now populated
    // per the addendum visual mapping (Drones→Chakram/Lance, Mechs→Arc Beam,
    // Bosses→Abyss/Blacknet/Cryo).
    const catalogKey = this.enemyType.toLowerCase().replace(/ /g, '-');
    const weaponIds  = BOSS_WEAPON_MAP[catalogKey] || MINI_WEAPON_MAP[catalogKey] || PRIMARY_WEAPON_MAP[catalogKey];
    if (weaponIds && weaponIds.length > 0) {
      const wDef = getWeaponById(weaponIds[0]);   // primary weapon
      this._weaponDef = wDef;   // behavior params (cooldown/speed/damage) for catalog-armed shots
      // Default catalog armament (future-proofing): shooter-capable roles with NO explicit
      // _initRole stat case above inherit their catalog weapon's baseline stats. Guarded by
      // !this.shootInterval so it can never override an explicit case. (this.role is assigned
      // in the constructor BEFORE _initRole runs, so it is valid here.)
      if (!this.shootInterval && wDef &&
          (this.role === 'shooter' || this.role === 'mixed' ||
           this.role === 'hybrid'  || this.role === 'boss')) {
        this.shootInterval = wDef.cooldown;
        this.bulletSpeed   = wDef.speed;
        this.bulletDamage  = wDef.damage;
        this.bulletRadius  = 6;   // bulletColor keeps its constructor default
      }
      this._weaponSprite = _getWeaponSprite(wDef);
      // Size scaled by enemy tier: bosses get large sweep-wave sprites,
      // elites/mechs get medium beam sprites, drones get readable projectiles.
      // ARCADE SCALE: 2.0x-2.5x larger than base radius for visual impact.
      const isBoss = this.isBoss() || this.isMegaBoss;
      const isMech = catalogKey === 'security-defector-mech' || catalogKey === 'heavy-mech';
      // HORDE §12/§13: projectiles αισθητά μικρότερα από πριν (ήταν 34-56px) ώστε τα
      // player weapons να κυριαρχούν. Το sprite art της Maria μένει — μόνο το μέγεθος.
      this._weaponSize = isBoss ? Math.max(40, this.bulletRadius * 3.4)
                       : isMech ? Math.max(30, this.bulletRadius * 3.0)
                       :          Math.max(24, this.bulletRadius * 2.6);
    }
  }

  _tryShoot(game) {
    // Lazily arm melee elites with a modest ranged attack so EVERY elite has real projectile threat.
    if (this.isElite && !this.shootInterval) {
      // Catalog-armed elites: use the mapped enemy weapon's behavior params
      // (cooldown/speed/damage) when available; generic armament otherwise.
      const wd = this._weaponDef || null;
      this.shootInterval = wd?.cooldown || 2.6;
      this.bulletSpeed   = wd?.speed    || 420;
      this.bulletDamage  = wd?.damage   || 8;
      this.bulletRadius  = 7; this.bulletColor = ORANGE;
    }
    if (!this.shootInterval || this.shootTimer > 0) return;

    // ── ELITE BEAM WEAPONS (Rift Eye / Pulse Burrower / mechs): telegraphed beam ──
    // Elites whose catalog weapon is a BEAM fire a locked-angle telegraphed beam
    // instead of a bullet spread. Beams are rarer than bullets (>= 3.5s cadence).
    if (this.isElite && this._weaponDef?.behavior === 'beam' && game._spawnEnemyBeam) {
      this.shootTimer = Math.max(3.5, this._weaponDef.cooldown || 0);
      game._spawnEnemyBeam(this, this._weaponDef);
      game.audio?.playEnemyShoot();
      return;
    }

    // ── ELITE SHORT_PULSE WEAPONS: self-centered radial nova instead of a projectile ──
    // Warn ring 0.5s on the elite itself, then a one-shot burst (Game reuses the
    // orb-zone machinery). No catalog weapon maps to SHORT_PULSE yet — dormant path.
    if (this.isElite && this._weaponDef?.behavior === 'short_pulse' && game._spawnEnemyNova) {
      this.shootTimer = Math.max(3.0, this._weaponDef.cooldown || 0);
      game._spawnEnemyNova(this, this._weaponDef);
      game.audio?.playEnemyShoot();
      return;
    }
    this.shootTimer = (this.isElite && !this.isBoss() && !this.isMegaBoss)
      ? Math.max(4.0, this.shootInterval)              // HORDE §8H: elite signature κάθε αρκετά sec
      : this.shootInterval;

    const boss = this.isBoss() || this.isMegaBoss;
    // Aim assist — lead the player by a fraction of their velocity (readable, still dodgeable):
    // normal ~50%, elite ~58%, boss ~68%.
    let aim    = boss ? 0.68 : this.isElite ? 0.58 : 0.50;
    if (game._hasProto?.('predator_aim')) aim = Math.min(0.85, aim + 0.12);   // Predator Aim Protocol
    const pv   = game.player.vel || new Vec2();
    const lead = game.player.pos.add(pv.scale(aim * 0.28));
    const dir  = safeNormalize(lead.sub(this.pos));
    if (dir.lengthSq() === 0) return;

    // Multishot — elites/bosses fire a small readable spread.
    let shots     = boss ? 3 : this.isElite ? 3 : 1;
    if (this.isElite && game.endless && game._hasProto?.('elite_arsenal')) shots += 1;   // Elite Arsenal Protocol
    // ═══ HORDE §11: ζήτα ΟΛΑ τα tokens της βολής πριν ρίξεις. Χωρίς tokens:
    // skipAttack — καμία ουρά, κανένα αποθηκευμένο burst, retry σε 1s (chase συνεχίζεται).
    const _cls = boss ? 'boss' : this.isElite ? 'elite' : 'ranged';
    if (game.hostileDirector && !game.hostileDirector.requestTokens(_cls, shots, game)) {
      this.shootTimer = 1.0;
      return;
    }
    const spread  = boss ? 0.16 : 0.20;
    const baseAng = Math.atan2(dir.y, dir.x);
    const start   = -(shots - 1) / 2;
    for (let s = 0; s < shots; s++) {
      const ang = baseAng + (start + s) * spread;
      game.spawnEnemyBullet(this.pos.clone(), new Vec2(Math.cos(ang), Math.sin(ang)),
        this.bulletSpeed, this.bulletDamage, this.bulletRadius, this.bulletColor,
        { stun: 0, weaponSprite: this._weaponSprite || null, weaponSize: this._weaponSize || 0,
          behavior: (this.isElite && this._weaponDef?.behavior) || null,
          cls: _cls, tokenPrepaid: true });
    }
    game.audio?.playEnemyShoot();
  }

  _loadSprite() {
    const spriteMap = {
      // Primary types — dedicated sprite (Maria's remade art in minions/ + bosses/ subfolders)
      'Glitch Drone':            'minions/glitch_drone',
      'Rogue Punk':              'minions/rogue_punk',
      'Stealth Infiltrator':     'minions/stealth_infiltrator',
      'Security Defector Mech':  'minions/security_defector_mech',
      'Rogue AI Overlord':       'bosses/ai_overlord',
      // Secondary types — unique mini sprites for visual diversity
      'Combat Hunter':           'minis/forge-mauler',
      'Scrap Scavenger':         'minis/cryo-warden',
      'Cyber-Net Junkie':        'minis/null-hierophant',
      'Overclocked Berserker':   'minis/pale-bloodknight',
      'Cyber Shooter':           'minis/rail-reaper',
      'Heavy Mech':              'minis/reactor-colossus',
      'Solar Tyrant':            'minis/solar-tyrant',
      'Cybermote':               'event_airstrike/cybermote',
      // Bloodfang pack minion — dedicated sprite in minions/ subfolder
      'Razorhound':              'minions/razorhound',
      // ── New mini enemies (weapon pack) ──
      'Abyss Maw':               'minis/mini_enemy_abyss-maw_candidate',
      'Amethyst Fang':           'minis/mini_enemy_amethyst-fang_candidate',
      'Cryo Claw':               'minis/mini_enemy_cryo-claw_candidate',
      'Ember Scarab':            'minis/mini_enemy_ember-scarab_candidate',
      'Pulse Burrower':          'minis/mini_enemy_pulse-burrower_candidate',
      'Rift Eye':                'minis/mini_enemy_rift-eye_candidate',
      'Solar Stinger':           'minis/mini_enemy_solar-stinger_candidate',
      'Toxin Leech':             'minis/mini_enemy_toxin-leech_candidate',
      'Void Widow':              'minis/mini_enemy_void-widow_candidate',
      'Volt Rat':                'minis/mini_enemy_volt-rat_candidate',
      // ── Chaos Mode enemies (Chaos-only; Maria's art in chaos_enemies/) ──
      'Neon Swarmer':            'chaos_enemies/01_neon_swarmer',
      'Data Glitch Stalker':     'chaos_enemies/02_ Data_ Glitch_ Stalker',
      'Plasma Juggernaut':       'chaos_enemies/03_ Plasma_ Juggernaut',
      'Overclocked Bomber':      'chaos_enemies/04_ Overclocked_ Bomber',
      'EMP Hacker Drone':        'chaos_enemies/05_ EMP_ Hacker _Drone',
      'Cyber-Axe Executioner':   'chaos_enemies/06_ Cyber-Axe_ Executioner',
      'Malware Spreader':        'chaos_enemies/07_ Malware_ Spreader',
      'Void Rift Summoner':      'chaos_enemies/08 _Void _Rift_ Summoner',
      'Wireframe Net-Caster':    'chaos_enemies/09 _Wireframe_ Net-Caster',
      'Singularity Core Mech':   'chaos_enemies/10_ Singularity _Core_ Mech',
      // ── Chaos Mega Titans (Chaos-only mega-bosses; much larger than the player) ──
      'Giga-Core Overlord':      'chaos_enemies/chaos_mega_bosses/GIGA-CORE OVERLORD',
      'Malware Leviathan':       'chaos_enemies/chaos_mega_bosses/MALWARE_ LEVIATHAN',
      'Quantum Void Emperor':    'chaos_enemies/chaos_mega_bosses/QUANTUM_ VOID_EMPEROR',
      'Apocalypse Mech Tyrant':  'chaos_enemies/chaos_mega_bosses/APOCALYPSE_ MECH_ TYRANT',
    };
    const spriteFile = spriteMap[this.enemyType];
    if (spriteFile) {
      // PERF/CHAOS FIX (2026-07-12, Maria: sprites vanish ~20min into Chaos):
      // this used to be `new Image()` PER SPAWN — every enemy re-fetched and
      // re-decoded its PNG. Hundreds of spawns/min in Chaos meant constant
      // decode churn; under memory pressure sprites blinked out for seconds
      // until they re-decoded. One shared Image per path fixes both the
      // disappearing sprites and a steady FPS drain in every mode.
      this.sprite = _getEnemySprite(spriteFile);
    } else {
      console.warn(`[Enemy] No sprite mapped for: ${this.enemyType}`);
    }
  }

  _spawnEdge() {
    const B = WORLD_BOUNDS;
    const side = randomChoice(['top', 'bottom', 'left', 'right']);
    if (side === 'top')    return new Vec2(B.left + Math.random() * (B.right - B.left), B.top - 20);
    if (side === 'bottom') return new Vec2(B.left + Math.random() * (B.right - B.left), B.bottom + 20);
    if (side === 'left')   return new Vec2(B.left - 20, B.top + 70 + Math.random() * (B.bottom - B.top - 70));
    return new Vec2(B.right + 20, B.top + 70 + Math.random() * (B.bottom - B.top - 70));
  }

  _statsForType(type, minute) {
    const d = 1 + minute * 0.035;                 // speed scaling (unchanged)

    // HP/contact-damage difficulty multiplier. ~+15% baseline (per spec), then ramps after min 5
    // so 0–5 stays fair and 20+ becomes intense. Applied to NORMAL enemies only.
    let g = 1.15;
    if (minute > 5)  g += (Math.min(minute, 10) - 5)  * 0.07;   // 5→10 : 1.15 → 1.50
    if (minute > 10) g += (Math.min(minute, 20) - 10) * 0.07;   // 10→20: 1.50 → 2.20
    if (minute > 20) g += (minute - 20) * 0.08;                 // 20+  : keeps climbing

    // Gentler ramp for enemy-type mini-bosses (avoids compounding into a brick; the mega-boss
    // also multiplies HP ×3 in Events.js afterward).
    const gB = 1 + minute * 0.03;

    // Threat pass — durability bump by category (small ×1.3 / medium ×1.4 / large ×1.6 / boss ×1.6).
    // Multiplies the time-scaled hp so early Act 1 only rises a fraction of an HP while late-game /
    // Endless (large g) gets the full survivability lift. Bosses move ~+20% faster + hit harder.
    // [speed, hp, color, stealTime, contactDamage (HP/sec)]
    switch (type) {
      case 'Glitch Drone':          return [95 * d,  2.6 * g,  BLUE,    2.00,  6 * g];   // small ×1.3
      case 'Rogue Punk':            return [125 * d, 4.2 * g,  MAGENTA, 1.65, 10 * g];   // medium ×1.4
      case 'Stealth Infiltrator':   return [155 * d, 2.6 * g,  PURPLE,  1.20, 12 * g];   // small ×1.3
      case 'Scrap Scavenger':       return [105 * d, 7 * g,    ORANGE,  1.55,  8 * g];   // medium ×1.4
      case 'Cyber-Net Junkie':      return [135 * d, 5.6 * g,  GREEN,   1.45, 10 * g];   // medium ×1.4
      case 'Overclocked Berserker': return [210 * d, 4.2 * g,  RED,     1.00, 14 * g];   // medium ×1.4
      case 'Security Defector Mech':return [108 * d, 108 * gB, YELLOW,  0.75, 33 * gB];   // Maria: bosses need more HP (80->108)   // mini-boss: hp ×1.6, dmg ×1.5, spd ×1.2
      case 'Rogue AI Overlord':     return [90 * d,  400 * gB, RED,     0.55, 42 * gB];   // Maria: bosses need more HP (300->400)  // boss: hp ×1.6, dmg ×1.5, spd ×1.2; mega-boss ×3 inherits hp
      case 'Combat Hunter':         return [168 * d, 4.2 * g,  MAGENTA, 9999, 12 * g];   // medium ×1.4
      case 'Cyber Shooter':         return [108 * d, 5.6 * g,  CYAN,    9999,  6 * g];   // medium ×1.4
      case 'Heavy Mech':            return [58  * d, 32 * g,   ORANGE,  9999, 20 * g];   // large ×1.6
      case 'Solar Tyrant':          return [52  * d, 44 * g,   YELLOW,  9999, 22 * g];   // rare heavy — big HP wall
      case 'Cybermote':             return [235 * d, 340 * gB, WHITE,   9999, 24 * g];   // EVENT: huge HP but the ONLY destructible event
      case 'Razorhound':            return [200 * d, 21 * g,   RED,     9999,  6 * g];   // large ×1.5
      // ── New mini enemies (weapon pack) ──
      case 'Abyss Maw':            return [75  * d, 28 * g,   PURPLE,  9999, 18 * g];   // large, slow, tanky
      case 'Amethyst Fang':        return [165 * d, 3.5 * g,  PURPLE,  9999, 10 * g];   // small-med, fast sniper
      case 'Cryo Claw':            return [140 * d, 5 * g,    CYAN,    9999, 10 * g];   // medium, melee frost
      case 'Ember Scarab':         return [120 * d, 8 * g,    ORANGE,  9999, 12 * g];   // medium, fire AoE
      case 'Pulse Burrower':       return [100 * d, 10 * g,   CYAN,    9999,  8 * g];   // medium, beam/boomerang
      case 'Rift Eye':             return [90  * d, 14 * g,   PURPLE,  9999,  4 * g];   // Phase 4: 60→90 — can actually hold kiting range
      case 'Solar Stinger':        return [175 * d, 3 * g,    YELLOW,  9999,  8 * g];   // fast, light shooter
      case 'Toxin Leech':          return [145 * d, 4 * g,    GREEN,   9999, 12 * g];   // fast melee, poison
      case 'Void Widow':           return [90  * d, 12 * g,   PURPLE,  9999, 14 * g];   // slow-med, heavy ranged
      case 'Volt Rat':             return [220 * d, 2 * g,    CYAN,    9999,  6 * g];   // very fast, fragile swarm
      // ── Chaos Mode enemies (Chaos-only) — [speed, hp, color, stealTime, contactDmg] ──
      case 'Neon Swarmer':         return [235 * d, 2 * g,    CYAN,    9999,  7 * g];   // very fast, fragile swarm pressure
      case 'Data Glitch Stalker':  return [170 * d, 3.4 * g,  PURPLE,  9999, 13 * g];   // stealth assassin
      case 'Plasma Juggernaut':    return [62 * d,  40 * g,   YELLOW,  9999, 20 * g];   // slow tank (big radius)
      case 'Overclocked Bomber':   return [200 * d, 4 * g,    RED,     9999, 22 * g];   // fast suicide rusher (heavy contact)
      case 'EMP Hacker Drone':     return [125 * d, 4 * g,    CYAN,    9999,  6 * g];   // ranged harass
      case 'Cyber-Axe Executioner':return [150 * d, 15 * g,   ORANGE,  9999, 18 * g];   // heavy melee
      case 'Malware Spreader':     return [110 * d, 9 * g,    GREEN,   9999, 12 * g];   // toxic area denial
      case 'Void Rift Summoner':   return [92 * d,  13 * g,   PURPLE,  9999, 10 * g];   // heavy ranged
      case 'Wireframe Net-Caster': return [132 * d, 6 * g,    CYAN,    9999,  8 * g];   // ranged slow/net
      case 'Singularity Core Mech':return [80 * d,  46 * g,   PURPLE,  9999, 22 * g];   // elite bruiser (big radius)
      // ── Chaos Mega Titans (huge HP; mega-boss ×3 may apply on top in the spawner) ──
      case 'Giga-Core Overlord':   return [55 * d,  620 * gB, WHITE,   0.55, 45 * gB];
      case 'Malware Leviathan':    return [50 * d,  640 * gB, GREEN,   0.55, 42 * gB];
      case 'Quantum Void Emperor': return [58 * d,  600 * gB, YELLOW,  0.55, 48 * gB];
      case 'Apocalypse Mech Tyrant':return [48 * d, 680 * gB, RED,     0.55, 46 * gB];
      default:                      return [100,      2.6,     WHITE,   1.80,  6];
    }
  }

  isBoss() {
    return this.enemyType === 'Security Defector Mech' || this.enemyType === 'Rogue AI Overlord'
        || Enemy.CHAOS_TITANS.has(this.enemyType);
  }

  takeHit(damage, game) {
    // Achievement Protocol/Card global damage — Endless only (multiplier is 1 in Act 1, so Act 1
    // is unchanged). Single chokepoint for player damage to NORMAL enemies; bosses use a separate
    // hp path and stay unbuffed (respects boss caps). Display reflects the actual damage dealt.
    let dmg        = damage * (game._endlessDamageMult ? game._endlessDamageMult() : 1);
    // BOSS ARMOR (Maria: bosses die in one hit late-game): boss-rank enemies gain
    // armor that scales with the PLAYER's level, so they stay a real fight as the
    // build snowballs. Boss: -4%/level, Mega: -6%/level, both capped at 78% reduction.
    if (this.isBoss?.() || this.isMegaBoss || this.rank === 'boss' || this.rank === 'mega') {
      const _pl = game.player?.level || 1;
      const _mega = this.isMegaBoss || this.rank === 'mega';
      const _rate = _mega ? 0.075 : 0.04;                    // Maria 2026-07-12: megas need MORE armor
      dmg *= Math.max(_mega ? 0.14 : 0.22, 1 - _pl * _rate); // mega cap 86% reduction (was 78%)
    }
    // Φ11 Executioner Cache: enemies below the threshold take DOUBLE damage (bosses excluded —
    // their caps stay meaningful; threshold 10-18% by level)
    const _exL = game.player?._stExecLvl || 0;
    if (_exL > 0 && !(this.isBoss?.() || this.isMegaBoss) && this.maxHp > 0 &&
        this.hp / this.maxHp < 0.08 + 0.02 * _exL) {
      dmg *= 2;
    }
    // HORDE §8F Shield Carrier: μπροστινή μείωση 40%% όσο ο φρουρός κρατά. Δεν είναι
    // ποτέ μόνιμα άτρωτος: βαρύ χτύπημα (knockback-tier, dmg>=40) ΣΠΑΕΙ τον φρουρό
    // για 1.5s — ρητή προσέγγιση: χωρίς hit-direction plumbing σε 200 call sites,
    // το "πίσω/πλαϊνά ευάλωτα" υλοποιείται ως guard-crack από stagger χτυπήματα.
    if (this.archetype === 'shield') {
      if (this._guardCrackT > 0) this._guardCrackT -= 0; // (ticked στο update)
      else if (dmg < 40) dmg *= 0.60;
      if (dmg >= 40) this._guardCrackT = 1.5;
    }
    this.hp       -= dmg;
    game._spawnDmgNum?.(this, dmg);   // VS-style damage numbers (pooled/merged/capped in Game)

    // ── Game Feel: hit weight classification ─────────────────────────────────
    const isBossEnemy = this.isBoss() || this.isMegaBoss;
    const isHeavyHit  = dmg >= 40;                       // heavy/crit-level threshold
    const isCritHit   = dmg >= 70;                       // crit-tier (even larger numbers)

    // Hit flash — extend duration for heavy hits so they read even behind sprites
    this.hitFlash = isHeavyHit ? FEEDBACK.flashDuration * 2.2 : FEEDBACK.flashDuration;

    // Knockback impulse — normal enemies only; bosses are immune; elites get half.
    if (!isBossEnemy && game.player) {
      const dx  = this.pos.x - game.player.pos.x;
      const dy  = this.pos.y - game.player.pos.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const str = isHeavyHit ? 290 : 150;
      const kbMult = this.isElite ? 0.45 : 1.0;
      this._kbx = (dx / len) * str * kbMult;
      this._kby = (dy / len) * str * kbMult;
    }

    // Character Weapon Synergy mark-layer hook (no-op unless the matching synergy card is active).
    game._onSynergyHit?.(this);
    // Elemental VFX hook — visible per-character element burst on hit (throttled, bounded).
    game._onElementHit?.(this);

    // Floating damage number — tiered by weight for readability.
    // Normal: small white. Heavy: larger yellow. Crit: even larger + faster rise.
    if (game.floatingTexts.length < 70 && (dmg >= 15 || Math.random() < 0.25)) {
      const dmgPos  = this.pos.add(new Vec2(randomRange(-6, 6), -this.radius - 4));
      const numSize = isCritHit ? 22 : isHeavyHit ? 17 : 14;
      const numRise = isCritHit ? 65 : isHeavyHit ? 52 : 35;
      const numClr  = isCritHit ? '#ff4400' : isHeavyHit ? '#ffdd00' : WHITE;
      const numLife = isCritHit ? 0.8 : isHeavyHit ? 0.65 : 0.5;
      game.floatingTexts.push(new FloatingText('-' + Math.round(dmg), dmgPos, numClr, numLife, numSize, numRise));
    }

    if (this.hp <= 0) {
      this._die(game);
    } else {
      // ── Audio: tier by hit weight ──────────────────────────────────────────
      if (isBossEnemy && isHeavyHit)   game.audio?.playBossHit?.();
      else if (isHeavyHit)             game.audio?.playHeavyHit?.();
      else                             game.audio?.playHit?.();
      // ── Screen shake: light on heavy non-boss hits ──────────────────────────
      if (isHeavyHit && !isBossEnemy)  game.screenShake?.trigger(2, 0.08);
    }
  }

  _die(game) {
    // Φ7: a downed Overclocked Bomber still cooks off — smaller telegraphed blast on death.
    if (this.enemyType === 'Overclocked Bomber' && !this._cookedOff) {
      this._cookedOff = true;
      try { if (game && game._spawnEnemyOrbZone) game._spawnEnemyOrbZone({ pos: this.pos.clone(), damage: 12 }, 65); } catch (_) {}
    }
    game.audio?.playEnemyDeath?.();
    // Tiered death feedback (visual only). Heavy/elite/boss-type enemies get a larger
    // burst plus an expanding neon shock-ring so big kills read weightier than trash.
    const heavy = this.isBoss() || this.isMegaBoss || this.isElite || this.radius >= FEEDBACK.heavyRadius;
    if (heavy) {
      game.particles.spawnDeathBurst(this.pos, this.color, FEEDBACK.heavyDeathParticles, FEEDBACK.burstSize + 0.8);
      game.particles.spawnDeathRing(this.pos, this.color, FEEDBACK.heavyRingCount, FEEDBACK.heavyRingSpeed, FEEDBACK.burstSize);
    } else {
      game.particles.spawnDeathBurstImproved(this.pos, this.color, FEEDBACK.normalDeathParticles, FEEDBACK.burstSize);
    }
    // Element death burst — uses last weapon hit color so each weapon leaves a distinct
    // visual signature on kill (fire=orange, void=cyan, gravity=purple, etc).
    // spawnElementDeath is capped by the shared particle pool — no extra overhead.
    game.particles.spawnElementDeath?.(this.pos, this._lastHitColor || this.color);
    game.player.kills++;
    game.addNexusChargePoint?.();   // +1 nexus recharge point per kill (no multipliers)
    game.addKillScore?.(this.pos, this.isElite);

    // ═══ HP ECONOMY REWORK (Maria 2026-07-16) — boss tier rewards κατά το spec:
    // Miniboss (SDM) 35% -> 15% heal · Boss εγγυημένο 20% · Mega εγγυημένο 25%.
    // Τα boss rewards ΔΕΝ μετράνε στο normal drop cooldown (δεν αγγίζουν _hpLastDropT).
    if (this.isBoss() || this.isMegaBoss) {
      const _mini = this.enemyType === 'Security Defector Mech' && !this.isMegaBoss;
      const _give = _mini ? Math.random() < 0.35 : true;
      if (_give) {
        const _heal = this.isMegaBoss ? 0.25 : _mini ? 0.15 : 0.20;
        game.healthPickups.push({ pos: this.pos.clone().add
          ? this.pos.clone().add(new (this.pos.constructor)(Math.cos(0.7) * 26, Math.sin(0.7) * 26))
          : { x: this.pos.x + Math.cos(0.7) * 26, y: this.pos.y + Math.sin(0.7) * 26 },
          timer: 30, heal: _heal, armT: 0.6 });
      }
    }
    // Elite reward: 15% πιθανότητα για 12% heal (ήταν 18%/10%) — mana roll αμετάβλητο.
    if (this.isElite) {
      const r = Math.random();
      if (r < 0.15)      game.healthPickups.push({ pos: this.pos.clone(), timer: 25, heal: 0.12, armT: 0.6 });
      else if (r < 0.50) game.manaPickups.push({ pos: this.pos.clone() });
    }
    // Normal-enemy XP scales with elapsed time (+1 every 2 min) so dense late-game
    // crowds still feed steady level-ups; bosses keep their flat high values.
    let xp = this.isMegaBoss ? 42 : (this.isBoss() ? 12 : 1 + Math.floor((game.timeAlive || 0) / 150));   // BALANCE: 120→150s per +1 — cards must last past the hour
    game.player.gainXp(xp, game.floatingTexts);

    game._onVaultKill?.(this.pos);   // VAULT lock progress — nearby kills break the lock
    const idx = game.enemies.indexOf(this);
    if (idx !== -1) game.enemies.splice(idx, 1);

    if (this.isBoss() || this.isMegaBoss) {
      game.spawnPauseTimer = 10;
      game.floatingTexts.push(new FloatingText('BOSS NEUTRALIZED: SPAWNS PAUSED', this.pos.clone(), YELLOW, 2));
      game._maybeSpawnVaultDrop?.(this.pos);   // VAULT DROP — 35% locked tier-2 cache (Endless)
    }

    if (this.isMegaBoss) {
      for (const e of game.enemies) {
        if (e.bodyguardTarget === this) e.bodyguardTarget = null;
      }
      if (game.megaBoss === this) game.megaBoss = null;
    }
  }



  update(dt, game) {
    // Biome regen (BIOME_DEFS.enemyModifiers.regenRate) — slow passive HP regen.
    if (this._biomeRegen && this.hp > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this._biomeRegen * dt);
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this._guardCrackT > 0) this._guardCrackT -= dt;   // HORDE §8F: σπασμένος φρουρός

    // ── Φ7 aggression: Overclocked Bomber is a REAL suicide unit now — inside 70px it
    // arms (0.5s furious blink) and detonates itself in a telegraphed blast zone.
    if (this.enemyType === 'Overclocked Bomber' && this.hp > 0 && game?.player?.pos) {
      const dP = Math.hypot(game.player.pos.x - this.pos.x, game.player.pos.y - this.pos.y);
      if (this._armT === undefined) this._armT = -1;
      if (this._armT < 0 && dP < 70) { this._armT = 0.5; this._baseSpeedFull *= 0.3; }   // arm + brace (ROOT FIX: this.speed δεν υπήρχε -> NaN)
      if (this._armT >= 0) {
        this._armT -= dt;
        this.hitFlash = 0.05;                              // furious white blink while armed
        if (this._armT <= 0) {
          if (game._spawnEnemyOrbZone) game._spawnEnemyOrbZone({ pos: this.pos.clone(), damage: 18 }, 85);
          this.hp = 0;
          this._die(game);
          return;
        }
      }
    }

    // ── Φ7 aggression: Cyber-Axe Executioner LUNGES — every ~3.5s, if the player sits in
    // the 120-300px band, he telegraphs (0.4s wind-up flash) then bursts forward at 3.2×.
    if (this.enemyType === 'Cyber-Axe Executioner' && this.hp > 0 && game?.player?.pos) {
      if (this._lungeCd === undefined) { this._lungeCd = 2.0; this._lungeT = 0; this._windup = 0; }
      this._lungeCd -= dt;
      const dP = Math.hypot(game.player.pos.x - this.pos.x, game.player.pos.y - this.pos.y);
      if (this._windup > 0) {
        this._windup -= dt;
        this.hitFlash = 0.05;                              // wind-up telegraph flash
        if (this._windup <= 0) {
          this._lungeT = 0.4;
          // HORDE §8E: ΚΛΕΙΔΩΜΑ της τελευταίας θέσης παίκτη — το charge είναι ευθεία
          // που αποφεύγεται, ΔΕΝ ακολουθεί τον παίκτη κατά τη διάρκεια.
          const ldx = game.player.pos.x - this.pos.x, ldy = game.player.pos.y - this.pos.y;
          const ldd = Math.hypot(ldx, ldy) || 1;
          this._lungeDirX = ldx / ldd; this._lungeDirY = ldy / ldd;
        }
      } else if (this._lungeT > 0) {
        this._lungeT -= dt;
        // ROOT FIX (βίντεο Maria — ΤΟ NaN SEED): this.speed ΔΕΝ ορίζεται πουθενά στην
        // κλάση Enemy => undefined × 2.2 × dt = NaN => η θέση του Executioner γινόταν NaN
        // στην πρώτη του έφοδο και (πριν τα guards) μόλυνε όλη την ορδή + έριχνε το draw.
        this.pos.x += (this._lungeDirX || 0) * this.baseSpeed * 2.2 * dt;   // LINEAR CHARGE (locked)
        this.pos.y += (this._lungeDirY || 0) * this.baseSpeed * 2.2 * dt;
        if (this._lungeT <= 0) this._lungeRec = 0.6;       // SHORT RECOVERY μετά το charge
      } else if (this._lungeRec > 0) {
        this._lungeRec -= dt;                              // recovery: μισή ταχύτητα (στο movement κάτω)
      } else if (this._lungeCd <= 0 && dP > 120 && dP < 300) {
        this._lungeCd = 3.5;
        this._windup  = 0.5;                               // §8E telegraph 450-700ms
      }
    }

    // ── Knockback decay (applied before movement AI, independent of role) ────
    // Exponential decay to zero; bosses not displaced (immune). Clamp so micro-drift
    // doesn't persist indefinitely.
    if (this._kbx !== 0 || this._kby !== 0) {
      this.pos.x += this._kbx * dt;
      this.pos.y += this._kby * dt;
      const decay = Math.pow(0.03, dt); // ≈ 0 by ~0.3 s at 60 fps
      this._kbx *= decay;
      this._kby *= decay;
      if (Math.abs(this._kbx) < 1 && Math.abs(this._kby) < 1) { this._kbx = 0; this._kby = 0; }
    }

    // Cryo Rounds slow — recompute effective speed each frame (all movement branches
    // read this.baseSpeed). Bosses are immune so they stay threatening.
    if (this.slowTimer > 0) this.slowTimer -= dt;
    const _vesselSpeedMult = ((game && game._vesselEnemySpeedMult) || 1) * ((game && game._blackoutSpeedMult) || 1) * ((game && game._stageSpeedMult) || 1);   // vessel × GRID BLACKOUT × STAGE biome rule
    this.baseSpeed = (this.slowTimer > 0 && !this.isBoss() && !this.isMegaBoss)
      ? this._baseSpeedFull * (this.slowFactor || 0.55) * _vesselSpeedMult
      : this._baseSpeedFull * _vesselSpeedMult;
    if (this.stunned > 0)  { this.stunned -= dt; return; }

    // Boss / mini-boss corruption blood-trail — drop a damaging pool periodically while alive
    // (player-only DoT, hard-capped + auto-expiring in Game._spawnBossTrail/_updateBossTrails).
    if (this.isBoss() || this.isMegaBoss) {
      this._trailCd = (this._trailCd || 0) - dt;
      if (this._trailCd <= 0) { this._trailCd = 0.45; game._spawnBossTrail?.(this.pos); }
    }

    const { player, matrices } = game;

    // Bodyguard: path toward the mega-boss while alive
    if (this.bodyguardTarget !== null) {
      if (game.enemies.includes(this.bodyguardTarget)) {
        const dir = safeNormalize(this.bodyguardTarget.pos.sub(this.pos));
        this.vel = dir.scale(this.baseSpeed);
        this.pos.addMut(this.vel.scale(dt));
        return;
      }
      this.bodyguardTarget = null;
    }

    const playerDist = distance(this.pos, player.pos);
    let repelStrength = 1.0;
    if (this.enemyType === 'Overclocked Berserker') repelStrength = 0.25;
    else if (this.isBoss())                          repelStrength = 0.0;

    // (Carrying state removed — enemies no longer steal or carry cores)

    // ═══ HORDE REBUILD §3 — ΕΝΙΑΙΟ Vampire-Survivors pursuit ══════════════════
    // Αντικαθιστά ΟΛΑ τα role branches: kiting/orbit/strafe/jitter/random-burst
    // ΑΠΑΓΟΡΕΥΟΝΤΑΙ. Η περικύκλωση προκύπτει από perimeter spawns + speedVariation
    // + separation (Game) — όχι από τεχνητή tangential τροχιά.
    if (this.shootTimer > 0) this.shootTimer -= dt;

    // Elites: ΜΙΑ signature ability πάνω στο pursuit (cadence >=4s στο _tryShoot).
    if (this.isElite) this._tryShoot(game);

    const arch = this.archetype;
    // Minibosses/bosses κρατούν τα όπλα τους (beam/volley) πάνω στο pursuit.
    if (arch === 'boss' || arch === 'miniboss') this._tryShoot(game);

    let speedMult = 1;
    if (this._lungeRec > 0) speedMult = 0.5;               // §8E charger recovery

    // §9 Ranged Specialist (κανονικός, ΟΧΙ elite): αργή προσέγγιση -> amber telegraph
    // -> 1 βολή (ή burst 3 μόνο στον specialist) -> συνεχίζει να πλησιάζει. ΟΧΙ kiting.
    if (arch === 'ranged' && !this.isElite) {
      if (this._telegraphT > 0) {
        this._telegraphT -= dt;
        speedMult = 0.15;                                  // σχεδόν στάση στη φόρτιση — αναγνώσιμο
        if (this._telegraphT <= 0) this._fireRangedShot(game);
      } else if (this._burstQ > 0) {
        this._burstT -= dt;
        speedMult = 0.3;
        if (this._burstT <= 0) { this._burstT = 0.13; this._fireRangedShot(game, true); }
      } else if (this.shootTimer <= 0 && playerDist < this._rangedDetect) {
        this._telegraphT = this._rangedTele;
        this.shootTimer  = this._rangedCd;
      } else {
        speedMult = 0.65;                                  // πλησιάζει αργά ανάμεσα στις βολές
      }
    }

    // Repel aura — PLAYER upgrade (Sonic Pulse οικογένεια), όχι AI συμπεριφορά: μένει.
    if (playerDist < player.repelRadius && repelStrength > 0) {
      const flee = safeNormalize(this.pos.sub(player.pos));
      this.vel = flee.scale(this.baseSpeed * (1.05 + repelStrength));
      this.pos.addMut(this.vel.scale(dt));
      return;
    }

    // ΚΑΘΑΡΟ PURSUIT προς την ΠΡΑΓΜΑΤΙΚΗ θέση του παίκτη (§3) με σταθερό seeded
    // speedVariation (§4). Anti-idle: ακίνητος παίκτης = +12%% πίεση (bounded, υπήρχε).
    const dir = safeNormalize(player.pos.sub(this.pos));
    const idlePush = (game._playerIdleT || 0) > 2 ? 1.12 : 1;
    this.vel = dir.scale(this.baseSpeed * (this.speedVariation || 1) * speedMult * idlePush);
    this.pos.addMut(this.vel.scale(dt));
  }

  keepInBounds() {
    this.pos.x = clamp(this.pos.x, WORLD_BOUNDS.left - 30, WORLD_BOUNDS.right + 30);
    this.pos.y = clamp(this.pos.y, WORLD_BOUNDS.top + 40,   WORLD_BOUNDS.bottom + 30);
  }

  // Role → distinct shape + outline color (read at a glance, no shadowBlur → cheap at 280 enemies).
  // HORDE §23: κοινή γλώσσα telegraph — amber = φορτίζει. Μικρός καθαρός δακτύλιος
  // ΜΟΝΟ όσο διαρκεί το telegraph του ranged (όχι μόνιμο aura σε normals, §22).
  _drawTelegraph(ctx) {
    if (this._telegraphT > 0) {
      const k = 1 - this._telegraphT / (this._rangedTele || 0.6);
      ctx.save();
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(k * Math.PI);
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius + 6 + 6 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (this.archetype === 'shield' && this._guardCrackT <= 0 && this.hp > 0) {
      // λεπτό frontal τόξο προς τον στόχο — ταυτότητα shield, σβήνει όταν σπάσει
      const a = Math.atan2(this.vel?.y || 0, this.vel?.x || 1);
      ctx.save();
      ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius + 5, a - 0.85, a + 0.85); ctx.stroke();
      ctx.restore();
    }
  }

  _drawRoleMarker(ctx) {
    let shape, color, lw, pad;
    if (this.isMegaBoss || this.isBoss()) { shape = 'hexagon'; color = PURPLE; lw = 3; pad = 6; }
    else switch (this.enemyType) {
      case 'Heavy Mech':            shape = 'square';   color = RED;       lw = 3;   pad = 4; break;  // tank
      case 'Stealth Infiltrator':
      case 'Overclocked Berserker':
      case 'Razorhound':
      case 'Combat Hunter':         shape = 'triangle'; color = ORANGE;    lw = 2.5; pad = 5; break;  // runner
      case 'Glitch Drone':
      case 'Rogue Punk':
      case 'Scrap Scavenger':
      case 'Cyber-Net Junkie':      shape = 'diamond';  color = YELLOW;    lw = 2;   pad = 4; break;  // core-stealer
      case 'Cyber Shooter':         shape = 'hexagon';  color = MAGENTA;   lw = 2;   pad = 4; break;  // shooter
      default:                      shape = 'circle';   color = '#cfe0f2'; lw = 1.5; pad = 3; break;  // basic drone
    }
    const r = this.radius + pad, x = this.pos.x, y = this.pos.y;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath();
    switch (shape) {
      case 'circle':   ctx.arc(x, y, r, 0, Math.PI * 2); break;
      case 'square':   ctx.rect(x - r, y - r, r * 2, r * 2); break;
      case 'diamond':  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); break;
      case 'triangle': ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.92, y + r * 0.7); ctx.lineTo(x - r * 0.92, y + r * 0.7); ctx.closePath(); break;
      case 'hexagon':  for (let k = 0; k < 6; k++) { const ang = (Math.PI / 3) * k + Math.PI / 6; const px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r; k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.closePath(); break;
    }
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx) {
    const drawColor = this.hitFlash > 0 ? WHITE : this.color;

    // ── Rank presence layer (cinematic pass — cosmetic only, all enemies) ──────
    // Spawn-in glitch materialization for everyone, then a rank-scaled ground aura:
    // minions = whisper glow · elites = rotating dashed ring · bosses = heavy breathing
    // aura + rising embers · mega-bosses = double ring + stronger embers.
    {
      if (this._spawnT === undefined) this._spawnT = 0.6;          // one-shot on first draw
      const nowS = performance.now() / 1000;
      const boss = this.isBoss() || this.isMegaBoss;
      // spawn materialization: horizontal glitch slices + flash (0.6s)
      if (this._spawnT > 0) {
        this._spawnT -= 1 / 60;
        const sk = Math.max(0, this._spawnT / 0.6);                // 1 → 0
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = sk * 0.8;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const oy = (i - 1) * this.radius * 0.6;
          const jx = Math.sin(nowS * 40 + i * 7) * 8 * sk;
          ctx.beginPath();
          ctx.moveTo(this.pos.x - this.radius - 6 + jx, this.pos.y + oy);
          ctx.lineTo(this.pos.x + this.radius + 6 + jx, this.pos.y + oy);
          ctx.stroke();
        }
        ctx.restore();
      }
      // rank aura
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (this.isMegaBoss) {
        const br = this.radius * 1.5, pulse = 0.72 + 0.28 * Math.sin(nowS * 2.2);
        ctx.globalAlpha = 0.34 * pulse;
        ctx.strokeStyle = this.color; ctx.lineWidth = 3.5;
        ctx.shadowColor = this.color; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.ellipse(this.pos.x, this.pos.y + this.radius * 0.8, br, br * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.2 * pulse; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.ellipse(this.pos.x, this.pos.y + this.radius * 0.8, br * 0.75, br * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (boss) {
        const br = this.radius * 1.35, pulse = 0.7 + 0.3 * Math.sin(nowS * 2.6);
        ctx.globalAlpha = 0.28 * pulse;
        ctx.strokeStyle = this.color; ctx.lineWidth = 3;
        ctx.shadowColor = this.color; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.ellipse(this.pos.x, this.pos.y + this.radius * 0.8, br, br * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (this.isElite) {
        ctx.globalAlpha = 0.35 + 0.12 * Math.sin(nowS * 3);
        ctx.strokeStyle = this.color; ctx.lineWidth = 1.8;
        ctx.setLineDash([7, 6]); ctx.lineDashOffset = -nowS * 24;
        ctx.beginPath(); ctx.ellipse(this.pos.x, this.pos.y + this.radius * 0.75, this.radius * 1.2, this.radius * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      // boss embers (cheap: 4, time-derived, no arrays)
      if (boss) {
        ctx.fillStyle = this.color;
        for (let i = 0; i < (this.isMegaBoss ? 6 : 4); i++) {
          const v = Math.sin((this.pos.x | 0) * 0.13 + i * 78.233) * 43758.5453;
          const rnd = v - Math.floor(v);
          const cyc = (nowS * (0.3 + rnd * 0.3) + rnd) % 1;
          ctx.globalAlpha = Math.sin(cyc * Math.PI) * 0.45;
          ctx.beginPath();
          ctx.arc(this.pos.x + (rnd - 0.5) * this.radius * 2.2, this.pos.y + this.radius * 0.7 - cyc * this.radius * 2.4, 1.6 + rnd * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // (Carrying glow removed — enemies no longer carry cores)

    // Try to draw sprite if loaded
    const spritePath = this.sprite && this.sprite.complete && this.sprite.naturalWidth > 0;
    if (spritePath) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.sprite, this.pos.x - this.radius, this.pos.y - this.radius, this.radius * 2, this.radius * 2);
      ctx.imageSmoothingEnabled = true;
    } else {
      // Fallback: Body — bosses drawn as rectangles
      if (this.isBoss()) {
        const r = this.radius;
        ctx.fillStyle   = drawColor;
        ctx.strokeStyle = WHITE; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(this.pos.x - r, this.pos.y - r, r * 2, r * 2, 5);
        ctx.fill(); ctx.stroke();

        // Extra inner rect for mega-boss / Overlord
        if (this.isMegaBoss || this.enemyType === 'Rogue AI Overlord') {
          ctx.strokeStyle = RED; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(this.pos.x - r * 0.6, this.pos.y - r * 0.6, r * 1.2, r * 1.2, 3);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = drawColor;
        ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Role silhouette marker — only when sprite is missing so we can still tell roles apart.
    // When a proper sprite is loaded, the sprite IS the visual identity — no overlay needed.
    if (!spritePath) this._drawRoleMarker(ctx);
    this._drawTelegraph(ctx);   // HORDE §23: amber charge ring + shield frontal arc (όλα τα sprites)

    // Elite marker (Endless elite waves) — pulsing gold glow + ring so elites read
    // instantly against the normal horde. Purely visual; no balance impact.
    if (this.isElite) {
      const t     = performance.now() * 0.006;
      const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t));
      drawGlow(ctx, this.pos.x, this.pos.y, this.radius + 7, '#FFD700', 0.22 * pulse);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Additive hit flash — visible over sprites (color depends on enemy type)
    if (this.hitFlash > 0) {
      const flashColor = this.isBoss() ? RED : (this.role === 'assassin' ? CYAN : WHITE);
      drawGlow(ctx, this.pos.x, this.pos.y, this.radius + 4, flashColor, Math.min(0.6, this.hitFlash * 6));
    }

    // Stunned — cyan electric glow + outline while frozen
    if (this.stunned > 0) {
      drawGlow(ctx, this.pos.x, this.pos.y, this.radius + 5, CYAN, 0.4);
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius + 4, 0, Math.PI * 2); ctx.stroke();
    }

    // Small HP bar
    if (this.hp > 1) {
      const bw = this.radius * 2;
      drawBar(ctx, this.pos.x - bw / 2, this.pos.y - this.radius - 12, bw, 4, this.hp, this.maxHp, RED);
    }

    // (Steal progress ring removed — enemies no longer steal)
  }
}
