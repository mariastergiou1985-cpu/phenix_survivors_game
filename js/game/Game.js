import {
  Vec2, WIDTH, HEIGHT, WORLD_W, WORLD_H, WORLD_MARGIN,
  WIN_TIME_SECONDS, ACT1_WIN_SECONDS, CORE_OVERLOAD_TICK_TIME, BASE_OVERLOAD_PER_CORE,
  OVERLOAD_PICKUP_REDUCTION, OVERLOAD_SLOT_REDUCTION,
  MAX_OVERLOAD, PLAYER_RADIUS, CORE_RADIUS, MATRIX_RADIUS,
  DARK_BG, GRID_LINE, BLACK, CYAN, RED, GREEN, YELLOW, ORANGE, WHITE, PURPLE,
  CORE_COLORS, VIEW_SCALE, VIEW_W, VIEW_H, ENDLESS_VIEW_SCALE,
} from '../constants.js?v=20260614185423';
import { clamp, distance, safeNormalize, randomChoice, randomRange } from '../utils.js';

import { FloatingText }   from '../entities/FloatingText.js';
import { DataCore, rollCoreType } from '../entities/DataCore.js?v=20260614185423';
import { PowerMatrix }    from '../entities/PowerMatrix.js?v=20260614185423';
import { Player }         from '../entities/Player.js?v=20260614185423';
import { Projectile, HomingDisc } from '../entities/Projectile.js?v=20260614185423';
import { Enemy }          from '../entities/Enemy.js?v=20260614185423';
import { SupportDrone }   from '../entities/SupportDrone.js?v=20260614185423';

import { ParticleSystem, ScreenShake, drawVignette, drawDamagePulse, EMPRing, drawGlow } from './Effects.js?v=20260614185423';
import { SystemEventManager } from './Events.js?v=20260614185423';
import { UpgradeUI }      from './UpgradeUI.js?v=20260614185423';
import { weightedSample } from './Upgrades.js?v=20260614185423';
import { MutationUI }      from './MutationUI.js?v=20260614185423';
import { sampleMutations } from './Mutations.js?v=20260614185423';
import { drawHUD, drawEndScreen } from './HUD.js?v=20260614185423';
import { MetaProgress, META_UPGRADES, upgradeCost, ENDLESS_ACHIEVEMENTS, CHARACTER_OUTFITS, PF_CHARACTER_COSTS, PF_TOTAL_OBTAINABLE } from './MetaProgress.js?v=20260614185423';
// Japan Phasewalker (Endless unlockable) ability/VFX modules — kept as separate, self-contained
// files in js/effects/ and used ONLY when selectedCharacter === 'japan_phasewalker'.
import { GlitchDash } from '../effects/glitch-dash.js?v=20260614185423';
import { EMPShockwave } from '../effects/emp-shockwave.js?v=20260614185423';
import { DigitalSingularity } from '../effects/digital-singularity.js?v=20260614185423';
import { Protocol0 } from '../effects/protocol-0.js?v=20260614185423';
import { LaserEyes } from '../effects/laser-eyes.js?v=20260614185423';
import { MeteorRain } from '../effects/meteor-rain.js?v=20260614185423';
// Euclid Vector toxin kit — used ONLY when selectedCharacter === 'euclid_vector' (world-space).
import { ToxicSniper, OrbitalKatanaBarrier, PlagueTrailDash } from '../effects/toxic_sniper_kit_sprites.js?v=20260614185423';

// ── Thunder Solo sprite slices (cyan_lightning_rain_notes.png, 1254×1254) ──────
// Strike variants: a clean bolt column + ripple base. (ax,ay) = ripple-centre as a
// fraction of the crop, so the strike is anchored on its ground-impact point.
const THUNDER_STRIKES = [
  { sx: 430, sy:   0, sw: 270, sh: 1240, ax: 0.50, ay: 0.95 }, // tall centre bolt
  { sx:  70, sy: 620, sw: 210, sh:  560, ax: 0.43, ay: 0.68 }, // medium-left bolt
  { sx: 830, sy: 300, sw: 215, sh:  600, ax: 0.50, ay: 0.83 }, // medium-right bolt
];
// Musical-note glyphs sliced from the same sheet (transparent background).
const THUNDER_NOTES = [
  { sx: 745, sy: 890, sw: 125, sh: 165 }, // eighth note
  { sx:1020, sy: 935, sw: 100, sh: 190 }, // treble clef
  { sx: 462, sy:  72, sw:  95, sh:  95 }, // beamed pair
];

// Ultimate activation cost (fixed). Mana Core raises maxMana for a bigger pool but NEVER the cost
// to fire — so taking Mana Core can only speed up ultimates (overflow banks toward the next cast),
// never delay them. Base maxMana is 100, so a player with no Mana Core is unaffected.
const ULTIMATE_MANA_COST = 100;

// ── Boss-combat fairness (Boss Threat audit, Steps 1–2) ────────────────────────
// Per-hit ceiling so no single boss/enemy blow can one-shot (≈⅓ of Taekwondo's 90 HP),
// and per-second soft caps on how fast the player's PRIMARY/auto-weapons can burn a boss
// down (ultimates and DoT are capped elsewhere and do NOT route through these).
const BOSS_MAX_PLAYER_HIT = 30;
const BOSS_DPS_CAP_MINI   = 60;   // titan / annihilator / bloodfang mini-bosses
const BOSS_DPS_CAP_MEGA   = 40;   // promoted main boss (isMegaBoss)

// ── Boss survival pass ─────────────────────────────────────────────────────────
// Bosses shrug off a slice of damage-over-time and support-drone fire so their
// mechanics have time to play out. Primary-fire DPS cap & fairness are untouched.
const BOSS_DOT_RESIST   = 0.28;   // −28% from DoT (aqua trail / burn / corrosive)  [20–35% band]
const BOSS_DRONE_RESIST = 0.20;   // −20% from support drones                       [15–25% band]

// ── Final-boss (mega-boss) multi-phase encounter ───────────────────────────────
// All player damage routes through _damagePlayer (dash i-frames / hit grace / 30-HP ceiling),
// so every attack below is capped and fully dodgeable. Reuses the lava-zone / bullet / telegraph
// systems; only the signature beam + nova add small self-contained state.
const FINAL_BEAM_CHARGE  = 1.2;   // s — telegraph line follows the player while charging
const FINAL_BEAM_FIRE    = 0.6;   // s — thick beam is live (locked direction)
const FINAL_BEAM_HALFW   = 22;    // px — beam half-width for hit detection / draw
const FINAL_BEAM_LEN     = 1600;  // px — beam length (spans the arena)
// Player damage pulse (red edge-vignette) — visual feedback only, no balance impact.
// duration sits in the requested 0.15–0.25s band; intensity is derived from HP lost so a
// big boss attack reads stronger than chip/contact damage. minGap stops sustained contact
// from strobing; big discrete hits bypass the gap so they always register immediately.
const DMG_PULSE = { duration: 0.22, minGap: 0.40, bigHit: 3, base: 0.36, slope: 0.045 };

// Ultimate-ready feedback — a one-shot cue fired the moment the SPACE ultimate becomes
// castable (mana >= cost). Visual only: never changes charge rate, cost, or cooldowns.
const ULT_CUE = { banner: 1.6, aura: 0.7 };

const FINAL_BEAM_HP_FRAC = 0.50;  // main beam deals ~50% of player max HP on a hit (telegraphed, once per beam)
const FINAL_NOVA_WARN    = 1.0;   // s — radial-burst warning
const FINAL_NOVA_RADIUS  = 155;   // px — medium burst radius
const FINAL_NOVA_DMG     = 17;    // 15–20 band
// Long-range STUN LANCE (final boss, phase 2+) — telegraphed aim line, then a locked stun bolt.
const STUN_LANCE_CHARGE   = 0.8;  // s — telegraph tracks the player before firing
const STUN_LANCE_DURATION = 1.1;  // s — player stagger/root on hit (2s anti-lock immunity follows)

// ─── Endless Elite Waves (Phase 1) — tuning isolated here ───────────────────────
// Endless-only recurring waves of EXISTING enemy types, buffed AFTER construction.
// Tankier + slightly faster, NOT deadlier (damage ×1.0) so the _damagePlayer fairness
// invariant is untouched. Gated entirely on Game.endless — never fires in Act 1.
const ELITE_WAVE = {
  firstDelay:   90,    // s after CONTINUE — ENDLESS before the first wave
  interval:    110,    // s between waves
  baseBatch:     3,    // elites per wave
  batch10min:    4,    // max elites once 10 min into Endless
  batch20min:    5,    // max elites once 20 min into Endless
  hpMult:      2.0,
  speedMult:   1.10,
  radiusMult:  1.20,
  // Late-game existing types only — no bosses, no new types.
  pool: ['Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Overclocked Berserker', 'Stealth Infiltrator'],
};

// Endless-only: minimum gap (s) between boss/miniboss center-screen warnings (≈ one boss-rotation
// loop) so a boss wave warns ONCE, not once per boss/respawn in the same loop. Act 1 is unaffected.
const BOSS_WARN_COOLDOWN = 90;

// Forced Endless Mutation Cards (Phase 1) — run-scoped negative mutations only (never saved).
const MUTATION_INTERVAL   = 180;  // s — first forced pick at 3:00, then every 3:00
const MUTATION_MAX_STACKS = 6;    // Phase 1 cap on total forced picks per run

export class Game {
  constructor() {
    this.audio     = null;  // set from main.js on first user gesture
    this.paused    = false;
    this.aimAssist = true;
    this.meta      = new MetaProgress();
    this.bestScore      = parseInt(localStorage.getItem('phenix_best_score') || '0', 10);
    this.isNewHighScore = false;

    // Load background image — new clean bg, fallback to old
    this._bgImage = new Image();
    this._bgImage.onerror = () => {
      const fallback = new Image();
      fallback.src = 'assets/backgrounds/cyberpunk_city_background.png';
      this._bgImage = fallback;
    };
    this._bgImage.src = 'assets/backgrounds/cyber_city_bg_clean.png?v=20260614185423';

    // Endless Stage 02 visuals (only used while this.endless — Act 1 keeps default visuals).
    // Missing files degrade to the default background / default Nexus visual (warn, no crash).
    this._endlessBgImage = new Image();
    this._endlessBgImage.onerror = () => console.warn('[Stage] missing assets/maps/endless/stage_02_neon_shinjuku_plaza.png — using default background');
    this._endlessBgImage.src = 'assets/maps/endless/stage_02_neon_shinjuku_plaza.png?v=20260614185423';
    this._endlessNexusImage = new Image();
    this._endlessNexusImage.onerror = () => console.warn('[Nexus] missing assets/nexus/endless_nexus_base_8cores.png — using default Nexus visual');
    this._endlessNexusImage.src = 'assets/nexus/endless_nexus_base_8cores.png?v=20260614185423';

    // Preload character portraits for Character Select screen
    this._charImages = {};
    ['skeleton_warrior', 'taekwondo_girl', 'cyber_arm_hero', 'brawler_warrior', 'assassin_clone'].forEach(id => {
      const img = new Image();
      img.onerror = () => console.warn(`[Char] missing assets/characters/${id}.png — fallback circle used`);
      img.src = `assets/characters/${id}.png`;
      this._charImages[id] = img;
    });
    // Japan Phasewalker portrait lives in the endless/ subfolder (Character Select + FX modules).
    this._phasewalkerSprite = new Image();
    this._phasewalkerSprite.onerror = () => console.warn('[Char] missing assets/characters/endless/japan_phasewalker.png');
    this._phasewalkerSprite.src = 'assets/characters/endless/japan_phasewalker.png?v=20260614185423';   // ?v bust: corrected transparency
    this._charImages['japan_phasewalker'] = this._phasewalkerSprite;
    // Euclid Vector portrait (endless/ subfolder; unlocked from the start — see roster + free unlock).
    this._euclidSprite = new Image();
    this._euclidSprite.onerror = () => console.warn('[Char] missing assets/characters/endless/euclid_vector.png');
    this._euclidSprite.src = 'assets/characters/endless/euclid_vector.png';
    this._charImages['euclid_vector'] = this._euclidSprite;
    this._oniSprite = new Image();
    this._oniSprite.onerror = () => console.warn('[Char] missing assets/characters/endless/oni_cataclysm_protocol.png');
    this._oniSprite.src = 'assets/characters/endless/oni_cataclysm_protocol.png';
    this._charImages['oni_cataclysm_protocol'] = this._oniSprite;

    // Brawler Warrior weapon sprites (Nexus Chakram / Crescent Rift Claw / Skyfall Lances).
    // Missing files degrade to drawn-shape fallbacks (never crash).
    this._weaponImages = {};
    [
      ['nexus_chakram',     'assets/weapons/nexus_chakram.png'],
      ['crescent_rift_claw','assets/weapons/crescent_rift_claw.png'],
      ['skyfall_lances',    'assets/weapons/skyfall_lances.png'],
      // Assassin Clone bounce weapon — Shuriken (the Arrow base-shot uses Player.attackSprite, not this map).
      ['suriken_assasin',   'assets/weapons/suriken_assasin.png'],
    ].forEach(([key, src]) => {
      const img = new Image();
      img.onerror = () => console.warn(`[Weapon] missing ${src} — drawn-shape fallback used`);
      img.src = src;
      this._weaponImages[key] = img;
    });

    // Assassin Clone ultimate sprites (Chrome Phantom Protocol): pink phantom clone + chrome
    // mirror clone. Drawn as clone overlays during the ultimate; phantom is also the HUD icon.
    // Missing files degrade to drawn-shape fallbacks (never crash).
    this._assassinPhantomSprite = new Image();
    this._assassinPhantomSprite.onerror = () => console.warn('[Ultimate] assassin_clone_phantom_clone.png missing — drawn fallback used');
    this._assassinPhantomSprite.src = 'assets/abilities/ultimates/assassin_clone_phantom_clone.png';
    this._assassinChromeSprite = new Image();
    this._assassinChromeSprite.onerror = () => console.warn('[Ultimate] assassin_clone_chrome_clone.png missing — drawn fallback used');
    this._assassinChromeSprite.src = 'assets/abilities/ultimates/assassin_clone_chrome_clone.png';

    // Preload start-menu background image
    this._menuBg = new Image();
    this._menuBg.src = 'assets/ui/start_menu_background.png?v=20260614185423';

    // Preload phoenix revive effect images (orange / blue / gold tiers)
    this._phoenixImage = new Image();
    this._phoenixImage.src = 'assets/effects/phoenix_revive.png';

    this._phoenixBlueImage = new Image();
    this._phoenixBlueImage.onerror = () => console.warn('[Assets] Failed to load: assets/effects/phoenix/blue_phoenix_revive.png');
    this._phoenixBlueImage.src = 'assets/effects/phoenix/blue_phoenix_revive.png?v=20260614185423';

    this._phoenixGoldImage = new Image();
    this._phoenixGoldImage.onerror = () => console.warn('[Assets] Failed to load: assets/effects/phoenix/gold_phoenix_revive.png');
    this._phoenixGoldImage.src = 'assets/effects/phoenix/gold_phoenix_revive.png?v=20260614185423';

    // Preload credits photos
    this._creditImgInk = new Image();
    // Newer Maria / InkSpireM portrait. Safe fallback to the previous photo if it fails to load.
    this._creditImgInk.onerror = () => {
      console.warn('[Credits] InkSpireM_Visuals_Potrait.png failed to load — falling back to inkspirem_visuals_photo.jpg');
      const fb = new Image();
      fb.src = 'assets/credits/inkspirem_visuals_photo.jpg';
      this._creditImgInk = fb;
    };
    this._creditImgInk.src = 'assets/credits/InkSpireM_Visuals_Potrait.png';
    this._creditImgTsali = new Image();
    this._creditImgTsali.src = 'assets/credits/tsali_photo.jpg';

    // Preload core and matrix sprites
    this._coreSprite = new Image();
    this._coreSprite.onerror = () => console.warn('[Assets] Failed to load: assets/cores/data_core.png');
    this._coreSprite.src = 'assets/cores/data_core.png?v=20260614185423';
    this._matrixSprite = new Image();
    this._matrixSprite.onerror = () => console.warn('[Assets] Failed to load: assets/bases/matrix_base.png');
    this._matrixSprite.src = 'assets/bases/matrix_base.png?v=20260614185423';

    // Preload grid cache supply drop sprite
    this._gridCacheSprite = new Image();
    this._gridCacheSprite.onerror = () => console.warn('[Assets] grid_cache_crate not found — cyan fallback will be used');
    this._gridCacheSprite.src = 'assets/events/supply_drop/grid_cache_crate.png';

    // Preload Thunder Solo ultimate sprites (Cyber Skeleton Warrior)
    this._thunderGuitarSprite = new Image();
    this._thunderGuitarSprite.onerror = () => console.warn('[Ultimate] thunder_solo_guitar.png not found — drawn fallback will be used');
    this._thunderGuitarSprite.src = 'assets/abilities/ultimates/thunder_solo_guitar.png';
    this._lightningRainSprite = new Image();   // strike + ripple + musical-note sheet
    this._lightningRainSprite.onerror = () => console.warn('[Ultimate] cyan_lightning_rain_notes.png not found — drawn fallback will be used');
    this._lightningRainSprite.src = 'assets/abilities/ultimates/cyan_lightning_rain_notes.png';
    // Boss Lava/Fire Rain impact sheet (2 cols × 4 rows = 8 frames, 512×384 each)
    this._lavaRainSprite = new Image();
    this._lavaRainSprite.onerror = () => console.warn('[Boss] lava_fire_rain.png not found — drawn fallback will be used');
    this._lavaRainSprite.src = 'assets/enemies/bosses/lava_fire_rain.png';
    // Endless hazard art (single-frame transparent PNGs).
    this._airstrikeSprite = new Image();
    this._airstrikeSprite.onerror = () => console.warn('[Endless] airstrike_sheet.png not found — drawn fallback used');
    this._airstrikeSprite.src = 'assets/enemies/event_airstrike/airstrike_sheet.png';
    this._cycloneSprite = new Image();
    this._cycloneSprite.onerror = () => console.warn('[Endless] cyber_cyclone_sheet.png not found — drawn fallback used');
    this._cycloneSprite.src = 'assets/events/weather/cyber_cyclone_sheet.png';

    // HUD icons: Data-Core (top-right credits) + chains (Cyber Arm SPACE ultimate icon)
    this._dataCoreIcon = new Image();
    this._dataCoreIcon.onerror = () => console.warn('[HUD] data_core.png not found — drawn fallback used');
    this._dataCoreIcon.src = 'assets/cores/data_core.png';
    this._chainsIcon = new Image();
    this._chainsIcon.onerror = () => console.warn('[HUD] overheated_heavy_chains.png not found — drawn fallback used');
    this._chainsIcon.src = 'assets/abilities/ultimates/overheated_heavy_chains.png';
    // Neon Pierce Beam — Cyber Arm Hero's automatic secondary weapon (red laser identity)
    this._neonBeamSprite = new Image();
    this._neonBeamSprite.onerror = () => console.warn('[Weapon] neon_pierce_beam.png missing — drawn fallback used');
    this._neonBeamSprite.src = 'assets/weapons/neon_pierce_beam.png';
    // Neon Taekwondo Girl — Aqua Spirit Trail (movement secondary) + Spirit Dojang Flag (SPACE ultimate)
    this._aquaTrailSprite = new Image();
    this._aquaTrailSprite.onerror = () => console.warn('[Weapon] aqua_spirit_trail.png missing — drawn fallback used');
    this._aquaTrailSprite.src = 'assets/weapons/aqua_spirit_trail.png';
    this._dojangFlagSprite = new Image();
    this._dojangFlagSprite.onerror = () => console.warn('[Ultimate] spirit_dojang_flag.png missing — drawn fallback used');
    this._dojangFlagSprite.src = 'assets/abilities/ultimates/spirit_dojang_flag.png';

    // Preload acid rain weather sprites
    this._acidRainFallImg = new Image();
    this._acidRainFallImg.onerror = () => console.warn('[Weather] acid_rain_fall.png not found — using line fallback');
    this._acidRainFallImg.src = 'assets/events/weather/acid_rain_fall.png?v=20260614185423';
    this._acidRainSplashImg = new Image();
    this._acidRainSplashImg.onerror = () => console.warn('[Weather] acid_rain_splash.png not found — using ellipse fallback');
    this._acidRainSplashImg.src = 'assets/events/weather/acid_rain_splash.png?v=20260614185423';

    // Preload AI Overload Titan boss sprite
    this._titanSprite = new Image();
    this._titanSprite.onerror = () => console.warn('[Boss] ai_overload_titan.png failed to load — using fallback');
    this._titanSprite.src = 'assets/enemies/bosses/ai_overload_titan.png?v=20260614185423';

    // Preload Matrix Annihilator mini-boss sprite (existing asset)
    this._annihilatorSprite = new Image();
    this._annihilatorSprite.onerror = () => console.warn('[Boss] assets/enemies/bosses/matrix_annihilator.png failed to load — using fallback');
    this._annihilatorSprite.src = 'assets/enemies/bosses/matrix_annihilator.png?v=20260614185423';

    // Preload Bloodfang Packmaster mini-boss sprite (existing asset)
    this._bloodfangSprite = new Image();
    this._bloodfangSprite.onerror = () => console.warn('[Boss] assets/enemies/bosses/bloodfang_packmaster.png failed to load — using fallback');
    this._bloodfangSprite.src = 'assets/enemies/bosses/bloodfang_packmaster.png?v=20260614185423';

    // Preload secret-skin preview sprites (Character Select locked/unlocked + Victory screen).
    // Keyed by the same flags MetaProgress persists. Missing files degrade to a text fallback.
    // Keyed by the outfit unlock flag; sources point at the CURRENT secret-skin files.
    this._skinImages = {};
    [
      ['golden_skeleton_warrior', 'assets/unlocks/secret_skins/cyber_skeleton_warrior_secret.png'],
      ['dark_cyber_arm_hero',     'assets/unlocks/secret_skins/neon_cyber_arm_hero_secret.png'],
      ['grandmaster_dojang_girl', 'assets/unlocks/secret_skins/cyber_dojang_girl_secret.png'],
      ['log_1997',                'assets/unlocks/secret_skins/brawler_warrior_log1997_secret.png'],
      ['log_1998',                'assets/unlocks/secret_skins/assassin_clone_log1998_secret.png'],
    ].forEach(([key, src]) => {
      const img = new Image();
      img.onerror = () => console.warn('[Skins] missing ' + src + ' — text fallback used');
      img.src = src;
      this._skinImages[key] = img;
    });

    // Optional Victory-screen art (decorative only — null-checked at draw time, never required)
    this._victoryLogo = new Image();
    this._victoryLogo.onerror = () => console.warn('[Victory] victory_logo.png missing — text title used');
    this._victoryLogo.src = 'assets/ui/victory/victory_logo.png';
    this._victoryLogsBadge = new Image();
    this._victoryLogsBadge.onerror = () => console.warn('[Victory] secret_logs_badge.png missing — text used');
    this._victoryLogsBadge.src = 'assets/ui/victory/secret_logs_badge.png';

    // Game state management
    this.gameState = 'start_menu'; // 'start_menu' | 'character_select' | 'playing' | 'game_over' | 'victory' | 'exit_screen'
    this.selectedCharacter = null; // 'skeleton_warrior' | 'taekwondo_girl' | 'cyber_arm_hero'
    
    // Menu state
    this.menuIndex = 0;
    this.characterIndex = 0;
    this.characters = [
      { id: 'skeleton_warrior', name: 'Cyber Skeleton Warrior', fallbackColor: '#8B0050', fallbackAlt: '#FF0080', role: 'Tank / Survival' },
      { id: 'taekwondo_girl',   name: 'Neon Taekwondo Girl',    fallbackColor: '#00D9FF', fallbackAlt: '#0099CC', role: 'Speed / AoE' },
      { id: 'cyber_arm_hero',   name: 'Cyber Arm Hero',         fallbackColor: '#FF6600', fallbackAlt: '#CC0000', role: 'Ranged / Damage' },
      { id: 'brawler_warrior',  name: 'Brawler Warrior',        fallbackColor: '#1fd6a6', fallbackAlt: '#0a9c78', role: 'Tank / Brawler' },
      { id: 'assassin_clone',   name: 'Assassin Clone',         fallbackColor: '#ff4dd2', fallbackAlt: '#9aa0aa', role: 'Stealth / Burst' },
      // Japan Phasewalker TEMPORARILY DISABLED (black-screen freeze ~3–4 min in Endless). Removed
      // from the selectable roster until his kit is rebuilt; code/assets/cards kept for future re-add.
      // Euclid Vector — unlocked from the start (NOT PF-gated; see MetaProgress free-unlock).
      { id: 'euclid_vector',    name: 'Euclid Vector',         fallbackColor: '#00ff66', fallbackAlt: '#0a9c44', role: 'Toxin / Ranged' },
    ];
    this.reset();
  }

  // UPGRADES = the permanent Grid-Credit progression (spent between runs). ENDLESS MODE appears
  // (right after START GAME) only once the player has entered Endless once — a persistent direct
  // entry so they never replay Act 1 to reach it. Computed live so the unlock reflects instantly.
  get menuItems() {
    const items = ['START GAME'];
    if (this.meta?.isEndlessUnlocked()) items.push('ENDLESS MODE');
    items.push('CHARACTER SELECT', 'UPGRADES', 'ACHIEVEMENTS', 'INSTRUCTIONS', 'AUDIO SETTINGS', 'CREDITS', 'EXIT');
    return items;
  }

  reset() {
    // Resolve the equipped (cosmetic) outfit sprite for this character, if any.
    const _char       = this.selectedCharacter || 'skeleton_warrior';
    const _outfit     = this.meta.getSelectedOutfit(_char);
    const _outfitPath = _outfit === 'default' ? null : this.meta.getOutfitAsset(_char, _outfit);
    this.player       = new Player(this.selectedCharacter, _outfitPath);
    this._applyMetaUpgrades();
    this.matrices     = [];
    this.groundCores  = [];
    this.enemies      = [];
    this.projectiles  = [];
    this.homingDiscs  = [];
    this._chainBolts  = [];   // Chain Lightning Laser: travelling lead bolts (visual + carry the chain plan)
    this._chainLinks  = [];   // Chain Lightning Laser: active jump segments (drawn on activation, then fade)
    this._chainTimer  = 0;    // auto-fire cooldown
    this._neonBeamTimer = 0;  // Neon Pierce Beam (Cyber Arm Hero only) auto-fire cooldown
    this._neonBeams     = [];  // active Neon Pierce Beam visuals (short-lived)
    // Brawler Warrior weapons (only active while selectedCharacter === 'brawler_warrior')
    this._chakramTimer    = 0;     // Nexus Chakram auto-fire cooldown
    this._chakrams        = [];    // active chakrams (out → return phases)
    this._crescentTimer   = 0;     // Crescent Rift Claw cooldown
    this._crescentSlashes = [];    // short-lived crescent slash visuals
    this._skyfall         = null;  // Skyfall Lances ultimate state | null
    this._skyfallImpacts  = [];    // short-lived lance impact visuals
    // Assassin Clone weapons (only active while selectedCharacter === 'assassin_clone').
    // Arrow = the base auto-shot (Player.attackSprite). Shuriken = bouncing thrown weapon.
    this._shurikenTimer   = 0;     // Shuriken throw cadence
    this._shurikens       = [];    // in-flight bouncing shurikens
    this._chromePhantom   = null;  // Chrome Phantom Protocol ultimate state | null
    this._chromeFx        = [];    // short-lived clone burst / slash-ring visuals
    // Japan Phasewalker FX modules (only built/used while selectedCharacter === 'japan_phasewalker').
    this._glitchDash          = null;
    this._empShock            = null;
    this._digitalSingularity  = null;
    this._pwFxBuilt           = false;
    this._pwDashing           = false;
    this._pwDashStart         = null;
    this._empShockCooldown    = 0;
    // Oni Cataclysm Protocol FX (only built/used while selectedCharacter === 'oni_cataclysm_protocol').
    this._protocol0      = null;
    this._laserEyes      = null;
    this._meteorRain     = null;
    this._oniFxBuilt     = false;
    this._oniSpeedBuff   = 0;     // Protocol 0: tracks the exact speedBonus we add, so we remove exactly it
    this._oniLaserCd     = 0;     // Laser Eyes auto-weapon cooldown (s)
    this._oniMeteorCd    = 0;     // Meteor Rain auto-weapon cooldown (s)
    this._oniMeteorWorld = null;  // world anchor for the active meteor field
    // Euclid Vector toxin kit (only built/used while selectedCharacter === 'euclid_vector').
    this._euclidKitBuilt = false;
    this._euclidSniper   = null;
    this._euclidKatana   = null;
    this._euclidPlague   = null;
    this._euclidEnemies  = [];                 // adapter array (kit holds this by reference)
    this._euclidWraps    = new Map();          // gameEnemy → persistent adapter wrapper
    this._euclidPlayer   = { x: 0, y: 0, height: 64, facing: 0 };
    this.empRings     = [];
    this._specialRings    = [];
    this.thunderSolo      = null;   // Thunder Solo ultimate state while active
    this.overChains       = null;   // Overheated Heavy Chains ultimate (Cyber Arm Hero) while active
    this._aquaPuddles     = [];   // Aqua Spirit Trail puddles (Neon Taekwondo Girl movement secondary)
    this._aquaTrailTimer  = 0;    // spawn cadence while moving
    this._spiritKicks = { timer: 0, blades: [] };   // Spirit Crescent Kicks (new auto-weapon)
    this.spiritDojang     = null; // Spirit Dojang Flag ultimate (Neon Taekwondo Girl) while active
    this._cyberBike       = null; // Cyber Ride ultimate (Neon Taekwondo Girl) while active
    this._specialBeams    = [];
    this._specialTrail    = [];
    this._taekwondoDmgSet = new Set();
    this.enemyBullets = [];
    this.floatingTexts = [];
    this.particles    = new ParticleSystem();
    this.screenShake  = new ScreenShake();
    this.events       = new SystemEventManager();
    this.upgradeUI    = null;
    this.mutationUI   = null;                    // forced Endless mutation picker (null = none open)
    this.mutations    = this._freshMutations();  // run-scoped negative-mutation multipliers (neutral in Act 1)
    this._mutationTimer = MUTATION_INTERVAL;
    this.rerollAvailable = false;
    this.megaBoss     = null;
    this.bossLavaZones = [];   // telegraphed lava/fire-rain zones cast by the main boss (player-only)
    // Endless-only high-threat hazards (inert in Act 1; armed/reset in _enterEndless).
    this.airstrikeShips   = [];   // loitering airstrike ships that fire aimed rockets
    this.airstrikeRockets = [];   // aimed rockets with impact telegraph
    this.cyclones         = [];   // forming → active storm hazard (DoT + CC), max 1

    this.timeAlive          = 0;
    this.overload           = 0;
    this.overloadTickTimer  = 0;
    this.spawnTimer         = 0;
    this.spawnPauseTimer    = 0;
    this.stealSpeedMultiplier = 1.0;
    this.gridBlackoutActive   = false;
    this.announcement         = null;

    // Phoenix revive tiers (orange → blue → gold, one per death per run)
    this.phoenixUsed        = false;
    this.phoenixReviveTimer = 0;    // > 0 while the flash animation plays
    this.phoenixReviveCount = 0;    // how many revives used this run (0–3)
    this.phoenixReviveType  = 'orange'; // 'orange' | 'blue' | 'gold'

    // Score / combo
    this.score      = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.maxCombo   = 0;
    this.comboPopups = [];   // transient milestone popups (visual only)
    this.isNewHighScore = false;

    // Endless-mode records snapshot for the end screen (display-only; set in _grantRewards
    // when this.endless). endlessRun = THIS RUN values, endlessBest = updated personal bests,
    // endlessNewBest = which records this run beat (drives the ★ NEW BEST tag).
    this.endlessRun     = null;
    this.endlessBest    = null;
    this.endlessNewBest = null;
    this.endlessNewAchievements = null;   // [{id,name}] newly earned this run (end-screen only)
    this._eliteWaveTimer   = 0;           // Endless elite-wave clock (armed by continueEndless)
    this._eliteWaveElapsed = 0;           // s elapsed in Endless — drives batch-size tiers
    this._endlessBossTimer = 25;          // Endless boss-rotation clock — first pressure ~25s in
    this._endlessBossIdx   = -1;          // rotation cursor (titan→annihilator→bloodfang→mech)
    this._bossWarnCd       = 0;           // Endless: throttles boss/miniboss warnings (see BOSS_WARN_COOLDOWN)

    this.gameOver          = false;
    this.victory           = false;
    this.endless           = false;   // set by CONTINUE — ENDLESS after an Act 1 victory
    this.finalMessage      = '';
    this.rewardsGranted    = false;
    this.runCreditsEarned  = 0;
    this.playerHitCooldown = 0;

    // Player damage pulse (red vignette) state — visual only.
    this.damageFlash          = 0;
    this.damageFlashIntensity = 0;
    this._dmgPulseGap         = 0;
    this._prevPlayerHp        = this.player.hp;

    // Ultimate-ready cue state — visual only.
    this._ultWasReady = false;
    this._ultReadyCue = 0;   // HUD "ULTIMATE READY" banner timer
    this._ultAura     = 0;   // player aura-pulse timer

    this.camera = { x: 0, y: 0 };

    this.gridCache           = null;  // { pos: Vec2, timer: number } | null
    this.gridCacheSpawnTimer = 75;    // first crate at 75s (avoids Drone Swarm at 60s)

    this._coreSpawnTimer = 0;         // rate-limit for matrix-deficit core replenishment

    this.acidRain      = null;  // { timer, damageAccum } | null
    this.acidRainTimer = 600;   // first event at 10:00

    this.killsSinceHealthDrop = 0;   // counts toward the next HP CELL drop
    this.healthPickups        = [];  // [{ pos: Vec2, timer: number }] — heals 25% maxHp on touch

    this.manaPickups     = [];   // [{ pos: Vec2 }] — restores +25 mana on touch
    this.manaPickupTimer = 30;   // time-based: one every 30s while mana < 100

    this.titanSpawned     = false;
    this.titanBoss        = null;
    this.titanSpawnTimer  = 180;
    this._titanShockwaves = [];
    this._titanBeams      = [];
    this._bloodfangSlams  = [];   // telegraphed pounce-slam zones cast by the Bloodfang Packmaster (player-only)
    this._corruptionBeam  = null; // final-boss CORRUPTION GRID BEAM: { phase:'charge'|'fire', t, origin, dir }
    this._corruptionNovas = [];   // final-boss CORRUPTION NOVA telegraphed radial bursts (player-only)

    // Matrix Annihilator — second mini-boss, marches on a Power Matrix at ~7:30
    this.annihilatorSpawned    = false;
    this.annihilatorBoss       = null;
    this.annihilatorSpawnTimer = 450;

    // Bloodfang Packmaster — third mini-boss (fast pack leader) at 10:00
    this.bloodfangSpawned    = false;
    this.bloodfangBoss       = null;
    this.bloodfangSpawnTimer = 600;

    this.supportDrones     = [];
    this.allyDrones        = [];   // Auto-Forge Drone card: persistent allies (NOT cleared by boss logic)
    this._droneFlameLast   = null;
    this._droneElectroLast = null;

    this._createMatrices();
  }

  startGame() {
    if (!this.selectedCharacter) {
      this.gameState = 'character_select';
    } else {
      this.audio?.startGameplayMusic();
      this.gameState = 'playing';
      this.reset();
    }
  }

  selectCharacter(charId) {
    if (!this.meta.isCharacterUnlocked(charId)) return;   // locked characters can't be started
    this.selectedCharacter = charId;
    this.audio?.startGameplayMusic();
    this.gameState = 'playing';
    this.reset();
  }

  goToCharacterSelect() {
    this.gameState = 'character_select';
    this.characterIndex = 0;
    this.audio?.startMenuMusic();
  }

  // Rect for the Character-Select Protocol-Fragments UNLOCK button — non-null only when the
  // highlighted character is PF-lockable and still locked. Mirrored by main.js click hit-test.
  _pfUnlockBtnRect() {
    const sel = this.characters[this.characterIndex];
    if (!sel || !PF_CHARACTER_COSTS[sel.id] || this.meta.isProtocolUnlocked(sel.id)) return null;
    const w = 320, h = 36;
    return { x: Math.round(WIDTH / 2 - w / 2), y: HEIGHT - 86, w, h };
  }

  // 2-row character grid — the SINGLE source of card rects, consumed by _drawCharacterSelect, the
  // secret-skin strip, and the main.js click hit-test (so clicks always match the drawn cards).
  // Top row holds the extra card when the count is odd. Scales cleanly to 8+ characters.
  _charCardLayout() {
    const n = this.characters.length;
    const cardW = 164, cardH = 140, gapX = 18, gapY = 12, gridTop = 212;
    const perRow = Math.ceil(n / 2);
    const cards = [];
    for (let i = 0; i < n; i++) {
      const row   = Math.floor(i / perRow);
      const col   = i % perRow;
      const inRow = row === 0 ? perRow : (n - perRow);
      const rowW  = inRow * cardW + (inRow - 1) * gapX;
      const rowX  = Math.round(WIDTH / 2 - rowW / 2);
      const x = rowX + col * (cardW + gapX);
      const y = gridTop + row * (cardH + gapY);
      cards.push({ x, y, w: cardW, h: cardH, cx: x + cardW / 2 });
    }
    return { cards, cardW, cardH };
  }

  // Spend Protocol Fragments to unlock the highlighted character (idempotent; shows a status msg).
  tryUnlockSelectedCharacterPF() {
    const sel = this.characters[this.characterIndex];
    if (!sel || !PF_CHARACTER_COSTS[sel.id]) return;
    const res = this.meta.tryUnlockCharacterWithPF(sel.id);
    this._pfMsg = res === 'ok'    ? `${sel.name} UNLOCKED!`
                : res === 'poor'  ? 'Not enough Protocol Fragments.'
                : res === 'owned' ? 'Already unlocked.'
                : 'Cannot unlock.';
    this._pfMsgUntil = performance.now() + 2500;
    if (res === 'ok') this.audio?.playEventWarning?.();
  }

  goToMainMenu() {
    this.gameState = 'start_menu';
    this.menuIndex = 0;
    this.gameOver  = false;
    this.victory   = false;
    this.paused    = false;
    this.upgradeUI     = null;
    this.mutationUI    = null;                    // reset forced-mutation state every new run
    this.mutations     = this._freshMutations();
    this._mutationTimer = MUTATION_INTERVAL;
    this.supportDrones = [];
    this.allyDrones    = [];
    this.audio?.startMenuMusic();
  }

  goToExitScreen() {
    this.gameState = 'exit_screen';
  }

  // CONTINUE — ENDLESS: resume an already-won run. Unlocks/rewards have already been
  // granted at the Act 1 victory; clearing `victory` resumes the update loop, and the
  // `!this.endless` guard on the win check stops it ever re-firing. Difficulty/roster
  // keep scaling on absolute time, so the Rogue AI Overlord still arrives at 25:00.
  continueEndless() {
    if (!this.victory) return;
    this.victory = false;
    this._enterEndless();
  }

  // Direct ENDLESS MODE start from the Main Menu (only offered once endlessUnlocked). Starts a
  // FRESH Endless run with the currently selected character (defaults to the first character if
  // none chosen yet): full reset → timer 0 → Endless setup. Same Endless map/camera/Nexus/
  // achievements/secret-unlock systems as Continue — Endless, just without the Act 1 prelude.
  startEndlessRun() {
    if (!this.meta?.isEndlessUnlocked()) return;   // guard: never reachable while locked
    this.selectedCharacter = this.selectedCharacter || this.characters[this.characterIndex]?.id || 'skeleton_warrior';
    this.gameState = 'playing';
    this.reset();                      // fresh run, timeAlive 0, matrices rebuilt, endless=false
    this._enterEndless();              // flip to Endless + Endless-only setup
  }

  // Shared Endless-entry setup used by Continue — Endless and the Main-Menu ENDLESS MODE start.
  // Assumes the run is already reset/in-progress; only flips on Endless state + Endless systems.
  _enterEndless() {
    this.meta?.unlockEndless();        // persist Endless access → Main Menu ENDLESS MODE entry
    this.endless = true;
    this._repositionEndlessNexus();    // Endless-only: cleaner, symmetric, more-centered Nexus layout
    // Endless-local elite-wave clock: first wave after firstDelay, then every interval.
    this._eliteWaveTimer   = ELITE_WAVE.firstDelay;
    this._eliteWaveElapsed = 0;
    this._endlessBossTimer = 25;           // arm the repeating boss/miniboss rotation (~25s → ~2 min)
    this._endlessBossIdx   = -1;
    this._endlessLavaCd    = randomRange(18, 26);   // arm ambient Endless Lava Rain (boss-independent)
    this._airstrikeTimer   = 90;            // first AIRSTRIKE ~1.5 min in, then every ~2 min
    this._cycloneTimer     = 70;            // first CYBER CYCLONE ~1.2 min in, then every ~2 min
    this.airstrikeShips    = [];            // clear any carryover hazards on (re)entry
    this.airstrikeRockets  = [];
    this.cyclones          = [];
    this.mutations         = this._freshMutations();   // fresh forced-mutation state for THIS Endless run
    this.mutationUI        = null;
    this._mutationTimer    = MUTATION_INTERVAL;         // first forced mutation at 3:00 into Endless
    this._applyEndlessProtocols();     // one-shot Achievement Protocol stat boosts (Endless only)
    this._checkEndlessAchievements();  // grant FIRST ENDLESS RUN immediately on entering Endless
    this.audio?.startEndlessMusic();   // Endless-only track (dawn) replaces gameplay music
    this.triggerAnnouncement('STAGE 02 — NEON SHINJUKU PLAZA', CYAN);   // Endless Stage 02 visuals
  }

  // Live Endless-achievement evaluation — unlock + persist the INSTANT a milestone is crossed
  // (not only at game-over), so progress survives a page refresh and the per-frame Achievement
  // Protocols/Cards activate during the SAME run. Cheap: unlockEndlessAchievements only writes
  // localStorage when a NEW flag is set. Combo uses the run peak (maxCombo).
  _checkEndlessAchievements() {
    if (!this.endless || !this.meta) return;
    this.meta.unlockEndlessAchievements({
      time:  this.timeAlive,
      level: this.player.level,
      score: Math.floor(this.score || 0),
      combo: Math.max(this.comboCount || 0, this.maxCombo || 0),
      cores: this.player.coresSecured,
    });
  }

  // Achievement Protocols — passive Endless rewards that auto-activate from existing achievement
  // unlock state (no save migration). One-shot stat boosts applied here when entering Endless;
  // the per-frame protocols (damage / overload / mastery weight) are read live elsewhere. Locked
  // achievements grant nothing, and none of this runs in Act 1 (continueEndless is the sole entry).
  _applyEndlessProtocols() {
    const p = this.player, m = this.meta;
    if (m.hasAchievement('first_endless')) p.xpMult = (p.xpMult || 1) * 1.05;          // Endless Initiate
    if (m.hasAchievement('endless_survivor')) {                                         // Survivor Core
      const add = Math.round(p.maxHp * 0.05);
      p.maxHp += add; p.hp = Math.min(p.maxHp, p.hp + add);
    }
    if (m.hasAchievement('core_defender')) p.maxCarry += 1;                             // Nexus Defender
  }

  // Global damage multiplier from Achievement Protocols/Cards — Endless ONLY (returns 1 in Act 1,
  // so Act 1 balance is unchanged). Applied to NORMAL enemies via Enemy.takeHit; bosses use a
  // separate hp path and are intentionally NOT buffed (respects boss caps). Small/medium + capped.
  _endlessDamageMult() {
    if (!this.endless) return 1;
    const m = this.meta, combo = this.comboCount || 0;
    let mult = 1;
    if (m.hasAchievement('score_hunter')) mult += 0.05;                                  // Damage Uplink Protocol
    mult += 0.06 * this._cardLvl('achievement_damage_uplink');                           // Damage Uplink Card
    if (m.hasAchievement('combo_master')) mult += combo >= 100 ? 0.08 : combo >= 50 ? 0.05 : 0;  // Combo Surge Protocol
    const co = this._cardLvl('achievement_combo_overdrive');                             // Combo Overdrive Card
    if (co > 0) mult += (combo >= 100 ? 0.05 : combo >= 50 ? 0.025 : 0) * co;
    return mult;
  }

  // Permanent Grid-Credit progression screen (spent between runs).
  goToUpgradesScreen() {
    this.gameState        = 'upgrades';
    this._upgradeMsg      = '';
    this._upgradeMsgTimer = 0;
    this._confirmReset    = false;
  }

  goToCredits() { this.gameState = 'credits'; }

  // Read-only Endless achievements gallery (display only — never unlocks/resets anything).
  goToAchievementsScreen() { this.gameState = 'achievements'; }

  goToAudioSettings() {
    this.gameState      = 'audio_settings';
    this._audioSelIndex = 0;
    // Assume the button is still held from the click that opened this screen,
    // so the entering click is not mistaken for a BACK press (their hit-boxes
    // overlap). Only a fresh press after release should register.
    this._prevMouseDown = true;
  }

  goToInstructions() { this.gameState = 'instructions'; }

  // ─── Meta upgrades ──────────────────────────────────────────────────────────
  _applyMetaUpgrades() {
    if (!this.meta) return;
    const p  = this.player;
    const m  = this.meta;

    const hpLevels = m.getLevel('maxHp');
    p.maxHp += hpLevels * 10;
    p.hp     = Math.min(p.hp + hpLevels * 10, p.maxHp);

    p.speedBonus += m.getLevel('moveSpeed') * 0.05;

    let pickup = p.pickupRadius;
    for (let i = 0; i < m.getLevel('coreMagnet'); i++) pickup = Math.round(pickup * 1.10);
    p.pickupRadius = pickup;

    p.maxCarry  += m.getLevel('coreCapacity');
    // Player damage is read from upgrades['Pulse Damage'] in Player.shoot() — there is no
    // p.baseDamage field, so the old line was a no-op. Seed the dict so the meta upgrade applies.
    p.upgrades['Pulse Damage']        = (p.upgrades['Pulse Damage'] || 0) + m.getLevel('pulseDamage');
    p.upgrades['Firewall Protection'] = m.getLevel('firewall');

    // ── Upgrade Economy phase metas ──
    p.upgrades['Pulse Damage']  += m.getLevel('combatCalibration') * 0.5;          // global damage
    p.contactDamageReduction     = Math.min(0.6, (p.contactDamageReduction || 0) + m.getLevel('armorPlating') * 0.03);
    p.maxMana                   += m.getLevel('manaCapacitor') * 10;               // ultimate cost stays 100
    p.xpMult                     = 1 + m.getLevel('xpUplink') * 0.05;
  }

  _grantRewards() {
    if (this.rewardsGranted) return;
    this.rewardsGranted = true;

    const timeCredits    = Math.floor(this.timeAlive / 60);
    const killCredits    = Math.floor(this.player.kills / 40);
    const coreCredits    = Math.floor(this.player.coresSecured / 12);
    const survivalBonus  = this.timeAlive >= 300 ? 5 : 0;
    const victoryCredits = this.victory ? 15 : 0;

    this.runCreditsEarned = timeCredits + killCredits + coreCredits + survivalBonus + victoryCredits;
    this.meta.addCredits(this.runCreditsEarned);

    const finalScore = Math.floor(this.score);
    if (finalScore > this.bestScore) {
      this.bestScore      = finalScore;
      this.isNewHighScore = true;
      localStorage.setItem('phenix_best_score', finalScore);
    }

    // Endless-mode personal records (separate from the global best score above).
    // Only an Endless run feeds these; compares against the PRIOR bests, then persists.
    if (this.endless) {
      const run = {
        time:  Math.floor(this.timeAlive),
        score: finalScore,
        level: this.player.level,
      };
      this.endlessRun     = run;
      this.endlessNewBest = this.meta.submitEndlessRun(run);   // updates + persists records
      this.endlessBest    = { ...this.meta.endlessRecords };   // post-update bests for display

      // Endless achievement milestones (recognition only — no rewards/bonuses).
      this.endlessNewAchievements = this.meta.unlockEndlessAchievements({
        time:  run.time,
        level: run.level,
        score: run.score,
        combo: this.maxCombo,
        cores: this.player.coresSecured,
      });
    }
  }

  addKillScore(pos, isElite = false) {
    this.comboCount++;
    this.comboTimer = 3.0;
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
    // Combo milestone popup — visual only; reads comboCount, never alters it or the score below.
    const c = this.comboCount;
    if (c === 10 || c === 25 || c === 50 || (c >= 100 && (c - 100) % 50 === 0)) {
      this._spawnComboPopup(c, pos);
    }
    let bonus = 0;
    if      (this.comboCount >= 10) bonus = 20;
    else if (this.comboCount >= 5)  bonus = 10;
    else if (this.comboCount >= 2)  bonus = 5;
    this.score += 10 + bonus;

    // HP CELL drop: guaranteed one healing pickup every 40 kills, near the defeated enemy.
    // Does not touch overload / credits / score / combo, and never replaces Phoenix revives.
    // Elite kills are excluded — they grant their own sparse reward roll in Enemy._die, so dense
    // elite waves no longer accelerate the generic HP-drop cadence (Endless health-drop spam fix).
    if (pos && !isElite && ++this.killsSinceHealthDrop >= 40) {
      this.killsSinceHealthDrop = 0;
      const dropPos = this._clampPickupPos(pos.clone().add(new Vec2(randomRange(-10, 10), -8)));
      this.healthPickups.push({ pos: dropPos, timer: 25 });
    }
  }

  // ─── Upgrades screen interaction ─────────────────────────────────────────────
  handleUpgradesClick(mousePos) {
    const { rects, backRect, resetRect } = this._upgradeRects();

    // Back button
    if (this._inRect(mousePos, backRect)) {
      this.goToMainMenu();
      return;
    }

    // Reset button
    if (this._inRect(mousePos, resetRect)) {
      if (this._confirmReset) {
        this.meta.reset();
        this._confirmReset = false;
        this._upgradeMsg = 'Progress reset.';
        this._upgradeMsgTimer = 2.5;
      } else {
        this._confirmReset = true;
        this._upgradeMsg = 'Click RESET again to confirm.';
        this._upgradeMsgTimer = 3.0;
      }
      return;
    }

    // Upgrade cards
    for (let i = 0; i < META_UPGRADES.length; i++) {
      if (!this._inRect(mousePos, rects[i])) continue;
      const upg    = META_UPGRADES[i];
      const result = this.meta.tryBuy(upg);
      if (result === 'ok') {
        this._upgradeMsg = `${upg.name} upgraded!`;
        this._upgradeMsgTimer = 2.0;
      } else if (result === 'poor') {
        this._upgradeMsg = 'Not enough Grid Credits.';
        this._upgradeMsgTimer = 2.0;
      } else {
        this._upgradeMsg = `${upg.name} is already at MAX level.`;
        this._upgradeMsgTimer = 2.0;
      }
      this._confirmReset = false;
      break;
    }
  }

  _inRect(pos, r) {
    return pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h;
  }

  _upgradeRects() {
    const COLS = 4;
    // Slightly smaller cards + wider gaps so more background shows; grid starts lower so the
    // Grid Credits / Protocol Fragments header lines are not crowded. Click rects derive from
    // these same values, so hit regions stay exactly in sync with the drawn cards.
    const CW = 250, CH = 136, CGAP = 28, RGAP = 20;
    const totalW = COLS * CW + (COLS - 1) * CGAP;
    const x0     = Math.round((WIDTH - totalW) / 2);
    const y0     = 126;
    const rects  = META_UPGRADES.map((_, i) => ({
      x: x0 + (i % COLS) * (CW + CGAP),
      y: y0 + Math.floor(i / COLS) * (CH + RGAP),
      w: CW, h: CH,
    }));
    const rows = Math.ceil(META_UPGRADES.length / COLS);
    const btnY = y0 + rows * (CH + RGAP) + 8;
    const backRect  = { x: x0,                y: btnY, w: 160, h: 40 };
    const resetRect = { x: x0 + totalW - 160, y: btnY, w: 160, h: 40 };
    return { rects, backRect, resetRect };
  }

  _updateUpgradesScreen(input) {
    if (this._upgradeMsgTimer > 0) this._upgradeMsgTimer -= 1/60;
    if (input.keys.has('escape')) {
      this.goToMainMenu();
      input.keys.delete('escape');
    }
  }

  _drawUpgradesScreen(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Title
    ctx.font      = 'bold 40px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('GRID UPGRADES', WIDTH / 2, 52);

    // Credits
    ctx.font      = '20px Consolas, monospace';
    ctx.fillStyle = YELLOW;
    ctx.fillText(`Grid Credits: ${this.meta.credits}`, WIDTH / 2, 82);
    // Protocol Fragments — separate rare Endless currency (display only here; spent in Character Select)
    ctx.font      = 'bold 15px Consolas, monospace';
    ctx.fillStyle = '#7df9ff';
    ctx.fillText(`◆ Protocol Fragments: ${this.meta.getProtocolFragments()} / ${PF_TOTAL_OBTAINABLE}`, WIDTH / 2, 104);

    const { rects, backRect, resetRect } = this._upgradeRects();

    // Upgrade cards
    for (let i = 0; i < META_UPGRADES.length; i++) {
      const upg  = META_UPGRADES[i];
      const lvl  = this.meta.getLevel(upg.key);
      const cost = upgradeCost(upg, lvl);
      const maxed = lvl >= upg.maxLevel;
      const can   = !maxed && this.meta.credits >= cost;
      const r     = rects[i];

      // Card bg + border
      ctx.fillStyle   = '#0a0f20';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = maxed ? YELLOW : can ? CYAN : '#2a4060';
      ctx.lineWidth   = maxed || can ? 2 : 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      // Name
      ctx.font      = 'bold 16px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'left';
      ctx.fillText(upg.name, r.x + 12, r.y + 22);

      // Level badge (top-right)
      ctx.font      = '13px Consolas, monospace';
      ctx.fillStyle = maxed ? YELLOW : CYAN;
      ctx.textAlign = 'right';
      ctx.fillText(`${lvl} / ${upg.maxLevel}`, r.x + r.w - 10, r.y + 22);

      // Description
      ctx.font      = '11px Consolas, monospace';
      ctx.fillStyle = '#6a8090';
      ctx.textAlign = 'left';
      ctx.fillText(upg.desc, r.x + 12, r.y + 42);

      // Current effect
      if (lvl > 0) {
        ctx.font      = '11px Consolas, monospace';
        ctx.fillStyle = GREEN;
        ctx.fillText(`Active: ${this._metaEffectText(upg.key, lvl)}`, r.x + 12, r.y + 60);
      }

      // Level dots
      for (let d = 0; d < upg.maxLevel; d++) {
        ctx.fillStyle = d < lvl ? CYAN : '#1a2a3a';
        ctx.beginPath();
        ctx.arc(r.x + 14 + d * 16, r.y + 78, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cost / BUY button area
      const btnY = r.y + 94;
      const btnH = 32;
      if (maxed) {
        ctx.fillStyle   = '#1a2510';
        ctx.fillRect(r.x + 10, btnY, r.w - 20, btnH);
        ctx.font        = 'bold 15px Consolas, monospace';
        ctx.fillStyle   = YELLOW;
        ctx.textAlign   = 'center';
        ctx.fillText('MAX', r.x + r.w / 2, btnY + 21);
      } else {
        ctx.fillStyle   = can ? '#0a2030' : '#120a0a';
        ctx.fillRect(r.x + 10, btnY, r.w - 20, btnH);
        ctx.strokeStyle = can ? CYAN : '#3a2020';
        ctx.lineWidth   = 1;
        ctx.strokeRect(r.x + 10, btnY, r.w - 20, btnH);
        ctx.font        = 'bold 13px Consolas, monospace';
        ctx.fillStyle   = can ? CYAN : '#5a3030';
        ctx.textAlign   = 'center';
        ctx.fillText(`BUY  —  ${cost} Credits`, r.x + r.w / 2, btnY + 21);
      }
    }

    // Back button
    ctx.fillStyle   = '#0a1820';
    ctx.fillRect(backRect.x, backRect.y, backRect.w, backRect.h);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
    ctx.strokeRect(backRect.x, backRect.y, backRect.w, backRect.h);
    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('◀  BACK', backRect.x + backRect.w / 2, backRect.y + 26);

    // Reset button
    const resetColor = this._confirmReset ? RED : '#5a3030';
    ctx.fillStyle   = '#120808';
    ctx.fillRect(resetRect.x, resetRect.y, resetRect.w, resetRect.h);
    ctx.strokeStyle = resetColor; ctx.lineWidth = 1;
    ctx.strokeRect(resetRect.x, resetRect.y, resetRect.w, resetRect.h);
    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = resetColor;
    ctx.textAlign = 'center';
    ctx.fillText('RESET', resetRect.x + resetRect.w / 2, resetRect.y + 26);

    // Message
    if (this._upgradeMsgTimer > 0 && this._upgradeMsg) {
      ctx.font      = '15px Consolas, monospace';
      ctx.fillStyle = ORANGE;
      ctx.textAlign = 'center';
      ctx.fillText(this._upgradeMsg, WIDTH / 2, backRect.y + 62);
    }

    // Hint
    ctx.font      = '13px Consolas, monospace';
    ctx.fillStyle = '#3a5060';
    ctx.textAlign = 'center';
    ctx.fillText('Click an upgrade to purchase  •  ESC = Back to menu', WIDTH / 2, HEIGHT - 16);
    ctx.textAlign = 'left';
  }

  // ─── Achievements screen (read-only Endless gallery) ─────────────────────────
  // Display only: reads MetaProgress.achievements / ENDLESS_ACHIEVEMENTS. Never unlocks
  // or resets anything, never touches gameplay. Mirrors the UPGRADES screen pattern.
  _achievementsBackRect() {
    return { x: Math.round(WIDTH / 2 - 80), y: HEIGHT - 70, w: 160, h: 40 };
  }

  _updateAchievementsScreen(input) {
    if (input.keys.has('escape')) {
      this.goToMainMenu();
      input.keys.delete('escape');
    }
  }

  handleAchievementsClick(mousePos) {
    if (this._inRect(mousePos, this._achievementsBackRect())) this.goToMainMenu();
  }

  _drawAchievementsScreen(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Title
    ctx.font      = 'bold 40px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('ACHIEVEMENTS', WIDTH / 2, 52);

    // Progress header — X / N UNLOCKED
    const total  = ENDLESS_ACHIEVEMENTS.length;
    const earned = ENDLESS_ACHIEVEMENTS.reduce((n, a) => n + (this.meta.achievements[a.id] ? 1 : 0), 0);
    ctx.font      = 'bold 20px Consolas, monospace';
    ctx.fillStyle = YELLOW;
    ctx.fillText(`${earned} / ${total} UNLOCKED`, WIDTH / 2, 82);

    // Rows — taller to surface each achievement's Achievement Protocol (passive) + Achievement
    // Card reward. Reward lines read from the ENDLESS_ACHIEVEMENTS metadata; locked rows hide the
    // names (??? ) to stay clean. All rewards are Endless-only.
    // Two-column layout so the full list stays readable as it grows past ~8 entries.
    const colW = 600, colGap = 24, rowH = 72, gap = 6, listW = colW;
    const rowsPerCol = Math.ceil(total / 2);
    const blockW = colW * 2 + colGap;
    const x0base = Math.round((WIDTH - blockW) / 2), y0 = 96;
    for (let i = 0; i < total; i++) {
      const a   = ENDLESS_ACHIEVEMENTS[i];
      const got = !!this.meta.achievements[a.id];
      const col = Math.floor(i / rowsPerCol);
      const x0  = x0base + col * (colW + colGap);
      const ry  = y0 + (i - col * rowsPerCol) * (rowH + gap);

      // Row background + border
      ctx.fillStyle   = got ? '#0c1410' : '#0a0f20';
      ctx.fillRect(x0, ry, listW, rowH);
      ctx.strokeStyle = got ? GREEN : '#2a4060';
      ctx.lineWidth   = got ? 2 : 1;
      ctx.strokeRect(x0, ry, listW, rowH);

      // Name + goal
      ctx.font      = 'bold 16px Consolas, monospace';
      ctx.fillStyle = got ? WHITE : '#6a8090';
      ctx.textAlign = 'left';
      ctx.fillText(a.name, x0 + 16, ry + 20);
      ctx.font      = '11px Consolas, monospace';
      ctx.fillStyle = got ? '#7fa8c8' : '#56707f';
      ctx.fillText(a.desc, x0 + 16, ry + 36);

      // Reward lines — Protocol (passive) + Card. Hidden behind ??? while locked.
      ctx.font = '11px Consolas, monospace';
      ctx.fillStyle = got ? '#c8a8ff' : '#4a5a6a';
      ctx.fillText(got ? `Protocol: ${a.protocolName} — ${a.protocolEffect}` : 'Protocol: ???', x0 + 16, ry + 52);
      ctx.fillStyle = got ? '#9fe0c0' : '#4a5a6a';
      ctx.fillText(got ? `Card: ${a.cardName} — ${a.cardEffect}` : 'Card: ???', x0 + 16, ry + 66);

      // Status tag + Endless-only marker (right-aligned)
      ctx.textAlign = 'right';
      ctx.font      = 'bold 14px Consolas, monospace';
      ctx.fillStyle = got ? '#FFD700' : '#5a7080';
      ctx.fillText(got ? '★ UNLOCKED' : '🔒 LOCKED', x0 + listW - 14, ry + 20);
      ctx.font      = '10px Consolas, monospace';
      ctx.fillStyle = '#5a7a8a';
      ctx.fillText('ENDLESS ONLY', x0 + listW - 14, ry + 38);
    }

    // Back button
    const back = this._achievementsBackRect();
    ctx.fillStyle   = '#0a1820';
    ctx.fillRect(back.x, back.y, back.w, back.h);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
    ctx.strokeRect(back.x, back.y, back.w, back.h);
    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('◀  BACK', back.x + back.w / 2, back.y + 26);

    // Hint
    ctx.font      = '13px Consolas, monospace';
    ctx.fillStyle = '#3a5060';
    ctx.textAlign = 'center';
    ctx.fillText('ESC = Back to menu', WIDTH / 2, HEIGHT - 16);
    ctx.textAlign = 'left';
  }

  _metaEffectText(key, lvl) {
    switch (key) {
      case 'maxHp':        return `+${lvl * 10} HP`;
      case 'moveSpeed':    return `+${lvl * 5}% speed`;
      case 'coreMagnet':   return `+${Math.round((Math.pow(1.10, lvl) - 1) * 100)}% pickup radius`;
      case 'coreCapacity': return `+${lvl} carry slot${lvl > 1 ? 's' : ''}`;
      case 'pulseDamage':  return `+${lvl} damage`;
      case 'firewall':     return `-${lvl * 5}% overload`;
      case 'combatCalibration': return `+${(lvl * 0.5).toFixed(1)} damage`;
      case 'armorPlating':      return `-${lvl * 3}% contact dmg`;
      case 'manaCapacitor':     return `+${lvl * 10} max mana`;
      case 'xpUplink':          return `+${lvl * 5}% XP`;
      case 'cacheScanner':      return `+${lvl * 5}% cache bonus`;
      default:             return '';
    }
  }

  _createMatrices() {
    // FOUR NEXUS LAYOUT (Phase 1): 4 inset-corner Nexus points, NO centre Nexus, capacity 8
    // each (32 total). Cleaner multi-Nexus identity than the old 5-matrix setup, with a clear
    // central play space. Each starts full (PowerMatrix.stored = capacity), so the early game
    // stays gentle. Gold=+5 / Silver=+3 are core values set in PowerMatrix.stealCore — unchanged.
    const positions = [
      [260,           230],
      [WORLD_W - 260, 230],
      [280,           WORLD_H - 200],
      [WORLD_W - 280, WORLD_H - 200],
    ];
    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i];
      this.matrices.push(new PowerMatrix(new Vec2(x, y), CORE_COLORS[i % CORE_COLORS.length], 8));
    }
  }

  // Endless-only: nudge the 4 Nexus points inward to cleaner, symmetric, more-centered
  // positions (Act 1 keeps the _createMatrices layout). Only pos moves — capacity, core
  // values, deposit and collision radius are all untouched.
  _repositionEndlessNexus() {
    const endlessPositions = [
      [360,           320],            // was [260, 230]
      [WORLD_W - 360, 320],            // was [WORLD_W-260, 230]
      [360,           WORLD_H - 320],  // was [280, WORLD_H-200]
      [WORLD_W - 360, WORLD_H - 320],  // was [WORLD_W-280, WORLD_H-200]
    ];
    for (let i = 0; i < this.matrices.length && i < endlessPositions.length; i++) {
      const [x, y] = endlessPositions[i];
      this.matrices[i].pos.x = x;
      this.matrices[i].pos.y = y;
    }
  }

  // Endless-only boss/miniboss pressure rotation. Reuses the Act 1 minibosses (AI Overload Titan,
  // Matrix Annihilator, Bloodfang Packmaster) and the heavy Security Defector Mech boss, cycling
  // roughly every 2 minutes (first pressure ~25s in) so Endless stays a real boss-chaos survival
  // mode. Gated on this.endless → Act 1 is untouched. Defers when an Acid Rain / Reactor Plasma
  // event is active or about to warn, so the two spectacles never start on the same moment.
  _updateEndlessBossRotation(dt) {
    if (!this.endless) return;
    if (this._bossWarnCd > 0) this._bossWarnCd -= dt;   // age the boss-warning throttle (Endless only)
    this._endlessBossTimer -= dt;
    if (this._endlessBossTimer > 0) return;
    if (this.acidRain || this.acidRainTimer < 8) { this._endlessBossTimer = 8; return; }  // avoid overlap
    const slots = ['titan', 'annihilator', 'bloodfang', 'mech'];
    this._endlessBossIdx = (this._endlessBossIdx + 1) % slots.length;
    this._endlessRearmBoss(slots[this._endlessBossIdx]);
    this._endlessBossTimer = 120;          // ~2 min cadence
  }

  // Re-arm one boss slot (only when that boss is dead/absent) by clearing its spawn flag so the
  // existing _update*/_spawn* path brings it back. The Security Defector Mech is a heavy boss-type
  // ENEMY (no mega-boss conversion), so it is spawned directly. No stats/Overload/core changes.
  _endlessRearmBoss(slot) {
    if (slot === 'titan') {
      if (!this.titanBoss || this.titanBoss.hp <= 0) { this.titanSpawned = false; this.titanSpawnTimer = 0; }
    } else if (slot === 'annihilator') {
      if (!this.annihilatorBoss || this.annihilatorBoss.hp <= 0) { this.annihilatorSpawned = false; this.annihilatorSpawnTimer = 0; }
    } else if (slot === 'bloodfang') {
      if (!this.bloodfangBoss || this.bloodfangBoss.hp <= 0) { this.bloodfangSpawned = false; this.bloodfangSpawnTimer = 0; }
    } else if (slot === 'mech') {
      if (this.enemies.length < this.enemyCap() && !this.enemies.some(e => e.enemyType === 'Security Defector Mech')) {
        this.enemies.push(new Enemy('Security Defector Mech', this.currentMinute() + 8));
        this._endlessBossAlert('DEFECTOR MECH BOSS DETECTED', YELLOW);
      }
    }
  }

  currentMinute()             { return Math.floor(this.timeAlive / 60); }
  coreVolatilityMultiplier()  { return 1 + (this.timeAlive / WIN_TIME_SECONDS) * 1.8; }
  overloadRateMultiplier()    { return 1 + Math.floor(this.timeAlive / 120) * 0.05; }
  // Population caps tuned to five pressure tiers so the map is never empty for long:
  //   0–2 light · 2–5 constant · 5–10 mini-hordes · 10–20 continuous · 20+ heavy chaos.
  enemyCap() {
    const m = this.currentMinute();
    let cap;
    if (m < 2)       cap = 28 + m * 8;               // 28 → 36   (light, but always populated)
    else if (m < 5)  cap = 44 + (m - 2) * 12;        // 44 → 80   (constant presence)
    else if (m < 10) cap = 80 + (m - 5) * 14;        // 80 → 150  (visible groups / mini-hordes)
    else if (m < 20) cap = 150 + (m - 10) * 10;      // 150 → 250 (continuous pressure)
    else             cap = Math.min(280, 250 + (m - 20) * 5);  // heavy survivor chaos, perf-capped
    // Endless: much denser from the start (×1.4 + 30), perf-capped a touch higher. Act 1 untouched.
    if (this.endless) cap = Math.min(210, Math.round(cap * 1.15) + 20);
    return cap;
  }
  // Endless spawns roughly twice as fast from the start (lower floor too). Act 1 unchanged.
  enemySpawnInterval() {
    let iv = Math.max(0.16, 0.5 - this.currentMinute() * 0.025);
    if (this.endless) iv = Math.max(0.08, iv * 0.5);
    return iv * this.mutations.spawnRateMult;   // SWARM PROTOCOL (1.0 outside Endless)
  }

  chooseEnemyType() {
    const t      = this.timeAlive;
    const minute = this.currentMinute();
    let pool;

    // 0:00-1:00 — gentle intro: core stealers + first hunters
    if (t < 60)
      pool = ['Scrap Scavenger', 'Scrap Scavenger', 'Combat Hunter', 'Glitch Drone'];

    // 1:00-1:30 — ramp up: first Cyber Shooters appear
    else if (t < 90)
      pool = ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Scrap Scavenger'];

    // 1:30-3:00 — 60% combat hunters/shooters, 40% saboteurs
    else if (t < 180)
      pool = ['Combat Hunter', 'Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Scrap Scavenger'];

    // 3:00-6:00 — 67% combat, 33% saboteurs
    else if (t < 360)
      pool = ['Combat Hunter', 'Combat Hunter', 'Cyber Shooter', 'Cyber Shooter', 'Scrap Scavenger', 'Cyber-Net Junkie'];

    // 6:00-10:00 min — 60% combat, more variety
    else if (minute < 10)
      pool = ['Combat Hunter', 'Cyber Shooter', 'Stealth Infiltrator', 'Scrap Scavenger', 'Cyber-Net Junkie'];

    // 10:00-15:00 min — introduce Heavy Mechs
    else if (minute < 15) {
      pool = ['Combat Hunter', 'Cyber Shooter', 'Overclocked Berserker', 'Scrap Scavenger', 'Cyber-Net Junkie'];
      if (!this.enemies.some(e => e.enemyType === 'Heavy Mech'))
        return 'Heavy Mech';
    }

    // 15:00-20:00 min — heavy pressure + boss
    else if (minute < 20) {
      pool = ['Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Overclocked Berserker', 'Scrap Scavenger'];
      if (!this.enemies.some(e => e.enemyType === 'Security Defector Mech'))
        return 'Security Defector Mech';
    }

    // 20:00-25:00 min — near endgame
    else if (minute < 25)
      pool = ['Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Overclocked Berserker', 'Cyber-Net Junkie'];

    // 25:00+ — endgame with boss
    else {
      pool = ['Overclocked Berserker', 'Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Cyber-Net Junkie'];
      if (!this.enemies.some(e => e.enemyType === 'Rogue AI Overlord') && !this.megaBoss)
        return 'Rogue AI Overlord';
    }

    return randomChoice(pool);
  }

  spawnEnemy() {
    if (this.enemies.length >= this.enemyCap()) return;
    // Endless: enemies are stronger from the start by treating them as ~8 minutes further along
    // (drives Enemy HP/speed scaling; damage stays conservative). Act 1 uses the real minute.
    const mins = this.currentMinute() + (this.endless ? 8 : 0);
    const e = new Enemy(this.chooseEnemyType(), mins);
    this.enemies.push(e);
    if (e.isBoss()) {
      // Act 1: warn per boss spawn (unchanged). Endless: collapse to one warning per loop window.
      if (!this.endless) this.audio?.playBossWarning();
      else if (this._bossWarnCd <= 0) { this._bossWarnCd = BOSS_WARN_COOLDOWN; this.audio?.playBossWarning(); }
    }
  }

  // ─── Ability activations ──────────────────────────────────────────────────

  activateSonicPulse(mousePos) {
    const p = this.player;
    if (p.upgrades['Sonic Pulse'] === 0 || p.sonicPulseCooldown > 0) return;

    const wm       = this._worldMouse(mousePos);
    const aimDir   = safeNormalize(new Vec2(wm.x - p.pos.x, wm.y - p.pos.y));
    const range    = 220;
    const halfCone = Math.PI / 2; // 180° total arc
    const force    = 300 + p.upgrades['Sonic Pulse'] * 60;

    for (const e of this.enemies) {
      const toEnemy = e.pos.sub(p.pos);
      if (toEnemy.length() > range) continue;
      const cos   = clamp(aimDir.dot(safeNormalize(toEnemy)), -1, 1);
      const angle = Math.acos(cos);
      if (angle < halfCone) {
        const push = safeNormalize(toEnemy).scale(force);
        e.vel.addMut(push);
        e.stunned = 0.3;
      }
    }

    p.sonicPulseCooldown = Math.max(2.5, 5.0 - p.upgrades['Sonic Pulse'] * 0.5);
    this.floatingTexts.push(new FloatingText('SONIC PULSE!', p.pos.clone(), WHITE, 0.8));
  }

  activateSpecial() {
    if (this.gameState !== 'playing' || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.specialCooldown > 0) return;
    if      (p.selectedCharacter === 'skeleton_warrior')  this._activateBoneGuardBlast();
    else if (p.selectedCharacter === 'taekwondo_girl')    this._activateLightningDashStrike();
    else if (p.selectedCharacter === 'cyber_arm_hero')    this._activateOverdriveBeam();
  }

  _activateBoneGuardBlast() {
    const p = this.player;
    const radius = 210, force = 350, dmg = 20;
    for (const e of this.enemies) {
      if (distance(e.pos, p.pos) < radius) {
        e.vel.addMut(safeNormalize(e.pos.sub(p.pos)).scale(force));
        e.takeHit(dmg, this);
      }
    }
    this._specialRings.push({ pos: p.pos.clone(), radius: 0, maxRadius: radius,
                               life: 0.55, maxLife: 0.55, color1: '#ff3030', color2: '#ffffff' });
    p.specialCooldown = p.specialMaxCooldown;
    this.floatingTexts.push(new FloatingText('BONE GUARD BLAST!', p.pos.clone(), RED, 1.0));
    this.screenShake.trigger(5, 0.2);
  }

  _activateLightningDashStrike() {
    const p = this.player;
    const wm = this._worldMouse(this._lastMousePos);
    const aimDir = wm
      ? safeNormalize(new Vec2(wm.x - p.pos.x, wm.y - p.pos.y))
      : p.lastFacingDir.clone();
    p.specialDashDir   = aimDir;
    p.specialDashTimer = 0.28;
    p.specialCooldown  = p.specialMaxCooldown;
    this._taekwondoDmgSet = new Set();
    this.floatingTexts.push(new FloatingText('LIGHTNING STRIKE!', p.pos.clone(), CYAN, 1.0));
    this.screenShake.trigger(3, 0.15);
  }

  _activateOverdriveBeam() {
    const p = this.player;
    const wm = this._worldMouse(this._lastMousePos);
    const aimDir = wm
      ? safeNormalize(new Vec2(wm.x - p.pos.x, wm.y - p.pos.y))
      : new Vec2(1, 0);
    const beamLength = 600, beamWidth = 28, dmg = 25, maxHits = 8;
    let hits = 0;
    for (const e of this.enemies) {
      if (hits >= maxHits) break;
      const toEnemy = e.pos.sub(p.pos);
      const along   = toEnemy.dot(aimDir);
      if (along < 0 || along > beamLength) continue;
      const perp = toEnemy.sub(aimDir.scale(along));
      if (perp.lengthSq() < (beamWidth + e.radius) ** 2) {
        e.takeHit(dmg, this);
        hits++;
      }
    }
    this._specialBeams.push({ startPos: p.pos.clone(), dir: aimDir,
                               length: beamLength, life: 0.4, maxLife: 0.4 });
    p.specialCooldown = p.specialMaxCooldown;
    this.floatingTexts.push(new FloatingText('OVERDRIVE BEAM!', p.pos.clone(), ORANGE, 1.0));
    this.screenShake.trigger(4, 0.2);
  }

  activateEMPCloud() {
    const p = this.player;
    if (p.empCloudCooldown > 0) return;   // baseline ability — no longer upgrade-gated

    const radius = 240 + p.upgrades['EMP Cloud'] * 40;   // base 200 +20%; upgrade still extends

    for (const e of this.enemies) {
      if (distance(e.pos, p.pos) >= radius) continue;
      if (e.isBoss() || e.isMegaBoss) {
        e.stunned = Math.max(e.stunned, 0.5);  // bosses: short safe interrupt only, never a full lock
      } else {
        e.stunned = 5.0;                       // normal enemies: immobilized 5s
        this.floatingTexts.push(new FloatingText('STUNNED', e.pos.clone(), CYAN, 0.8));
        this.particles.spawnHitSparks(e.pos, CYAN);
      }
    }

    // Cyan electric pulse ring around the player
    this._specialRings.push({ pos: p.pos.clone(), radius: 0, maxRadius: radius,
                               life: 0.5, maxLife: 0.5, color1: CYAN, color2: '#ffffff' });
    p.empCloudCooldown = Math.max(8, 12 - p.upgrades['EMP Cloud']);   // 12s base, upgrade trims it
    this.floatingTexts.push(new FloatingText('STUN PULSE!', p.pos.clone(), CYAN, 0.9));
    // (Japan Phasewalker's EMP Shockwave is now AUTOMATIC/passive — see _updatePhasewalkerFx —
    //  so E stays purely the shared global EMP stun for every character.)
  }

  // ── Pulse Shield (Q): 7s cyan bubble, -60% incoming damage, 25s cooldown ──────
  activatePulseShield() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.pulseShieldCooldown > 0) {
      this.floatingTexts.push(new FloatingText(`SHIELD ${Math.ceil(p.pulseShieldCooldown)}s`, p.pos.clone(), '#88aacc', 0.7));
      return;
    }
    p.shieldTimer         = p.shieldDuration;          // 7s active
    p.pulseShieldCooldown = p.pulseShieldMaxCooldown;  // 25s cooldown
    this._specialRings.push({ pos: p.pos.clone(), radius: 0, maxRadius: 60,
                               life: 0.45, maxLife: 0.45, color1: CYAN, color2: '#bfefff' });
    this.floatingTexts.push(new FloatingText('PULSE SHIELD!', p.pos.clone(), CYAN, 1.0));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Japan Phasewalker kit — drives the three js/effects/ modules. ALL self-guard on
  // selectedCharacter === 'japan_phasewalker', so existing characters are untouched.
  // The modules work in SCREEN space, so positions/enemy coords are converted from
  // world → screen via the camera + _viewScale (matches how the player is drawn).
  // ════════════════════════════════════════════════════════════════════════════

  // Player center-x / foot-y / sprite height in SCREEN pixels (player sprite is 64 world-units tall).
  _playerScreenPos() {
    const p = this.player, vs = this._viewScale;
    const cx = (p.pos.x - this.camera.x) * vs;
    const cyc = (p.pos.y - this.camera.y) * vs;
    const spriteH = 64 * vs;
    return { cx, footY: cyc + spriteH / 2, spriteH };
  }

  // Lazily build the three modules once the canvas + sprite are ready (Endless/Act 1 agnostic).
  _ensurePhasewalkerFx() {
    if (this.player?.selectedCharacter !== 'japan_phasewalker') return;
    if (this._pwFxBuilt || !this._canvas) return;
    const spr = this._phasewalkerSprite;
    if (!spr || !spr.complete || !spr.naturalWidth) return;
    const h = Math.max(24, Math.round(64 * this._viewScale));
    const w = Math.max(12, Math.round(spr.naturalWidth * (h / spr.naturalHeight)));
    this._glitchDash         = new GlitchDash(this._canvas, spr, { spriteW: w, spriteH: h });
    this._empShock           = new EMPShockwave(this._canvas, { distortion: { strength: 0 } });   // disable canvas self-draw (crash/perf-safe)
    this._digitalSingularity = new DigitalSingularity(this._canvas, spr, { spriteW: w, spriteH: h });
    this._pwFxBuilt = true;
  }

  // EMP Shockwave (E) — electric AoE; hit detection + stun applied via the module's onHit hook.
  activateEMPShockwave() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI || this.mutationUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'japan_phasewalker') return;
    if (this._empShockCooldown > 0) return;
    this._ensurePhasewalkerFx();
    if (!this._empShock) return;
    const s = this._playerScreenPos();
    this._empShock.trigger(s.cx, s.footY);
    // Shockwave Protocol mastery trims the cooldown (10s → 7s at L3); kit-local, no global balance change.
    this._empShockCooldown = Math.max(7, 10 - (p.upgrades['phasewalker_shockwave_mastery'] || 0));
    this.screenShake.trigger(4, 0.2);
    this.floatingTexts.push(new FloatingText('EMP SHOCKWAVE!', p.pos.clone(), CYAN, 1.0));
  }

  // Digital Singularity (SPACE) — 4-phase ultimate; per-laser damage via the module's onStrike hook.
  activateDigitalSingularity() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'japan_phasewalker') return;
    this._ensurePhasewalkerFx();
    if (!this._digitalSingularity || this._digitalSingularity.isActive()) return;
    if (p.mana < ULTIMATE_MANA_COST) {
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;
    const s = this._playerScreenPos();
    this._digitalSingularity.trigger(s.cx, s.footY);
    this.screenShake.trigger(6, 0.3);
    this.floatingTexts.push(new FloatingText('DIGITAL SINGULARITY!', p.pos.clone(), '#7df9ff', 1.4));
  }

  // Per-frame: build if needed, tick cooldown, fire GlitchDash on the dash rising→falling edge,
  // and run the EMP / Singularity module updates with world→screen enemy hooks. No-op for others.
  _updatePhasewalkerFx(dt) {
    if (this.player?.selectedCharacter !== 'japan_phasewalker') return;
    this._ensurePhasewalkerFx();
    const now = performance.now();
    const vs  = this._viewScale, cam = this.camera;
    if (this._empShockCooldown > 0) this._empShockCooldown -= dt;

    // GlitchDash — trigger when the player's SHIFT dash ends (trail from start → end).
    const dashing = this.player.dashTimer > 0;
    if (this._glitchDash) {
      try {
        if (dashing && !this._pwDashing) this._pwDashStart = this.player.pos.clone();
        if (!dashing && this._pwDashing && this._pwDashStart) {
          const fromX = (this._pwDashStart.x - cam.x) * vs;
          const toX   = (this.player.pos.x - cam.x) * vs;
          const s = this._playerScreenPos();
          this._glitchDash.trigger(fromX, toX, s.footY, toX >= fromX ? 1 : -1);
        }
        this._pwDashing = dashing;
        this._glitchDash.update(now);
      } catch (err) { console.warn('[Phasewalker GlitchDash]', err); }
    }

    // Automatic EMP Shockwave (passive — NOT bound to E). Fires on its own cooldown when foes are near.
    if (this._empShock && this._empShockCooldown <= 0 &&
        this.enemies.some(e => e?.pos && distance(e.pos, this.player.pos) < 240)) {
      this.activateEMPShockwave();
    }
    if (this._empShock) {
      try {
        this._empShock.update(now, this.enemies, {
          getX: e => ((e?.pos?.x ?? this.camera.x) - cam.x) * vs,   // pos-guarded so a stale/destroyed enemy can't crash it
          getY: e => ((e?.pos?.y ?? this.camera.y) - cam.y) * vs,
          onHit: e => {
            if (!e?.pos) return;
            if (e.isBoss?.() || e.isMegaBoss) e.stunned = Math.max(e.stunned || 0, 0.5);  // bosses: brief interrupt
            else { e.stunned = 5.0; this.particles.spawnHitSparks(e.pos, CYAN); }           // normals: 5s (same as EMP cloud)
          },
        });
      } catch (err) { console.warn('[Phasewalker EMP]', err); }   // one VFX error must not kill the run
    }

    if (this._digitalSingularity) {
      try {
        if (this._digitalSingularity.isActive()) {   // keep the dissolving sprite pinned to the player
          const s = this._playerScreenPos();
          this._digitalSingularity.cx = s.cx;
          this._digitalSingularity.footY = s.footY;
        }
        const ultDmg = 36 + 6 * (this.player.upgrades['phasewalker_singularity_mastery'] || 0);   // Digital Singularity Mastery
        this._digitalSingularity.update(now, this.enemies, {
          getX: e => ((e?.pos?.x ?? this.camera.x) - cam.x) * vs,
          getY: e => ((e?.pos?.y ?? this.camera.y) - cam.y) * vs,
          onStrike: e => { if (e?.takeHit) e.takeHit(ultDmg, this); },   // per-laser damage (his ultimate)
        });
      } catch (err) { console.warn('[Phasewalker Singularity]', err); }
    }
  }

  // Screen-space render of all three modules (called after the camera block, before the HUD).
  _drawPhasewalkerFx(ctx) {
    this._canvas = ctx.canvas;   // capture for the lazy module builder (used by update too)
    if (this.player?.selectedCharacter !== 'japan_phasewalker') return;
    this._ensurePhasewalkerFx();
    try {   // VFX-only render: never let a module draw error abort the frame / kill the run
      if (this._glitchDash) { this._glitchDash.renderBehind(ctx); this._glitchDash.renderFront(ctx); }
      if (this._empShock) this._empShock.render(ctx);
      if (this._digitalSingularity && this._digitalSingularity.isActive()) {
        const sh = this._digitalSingularity.getShake();
        ctx.save(); ctx.translate(sh.x, sh.y);
        this._digitalSingularity.render(ctx);
        ctx.restore();
      } else if (this._digitalSingularity) {
        this._digitalSingularity.render(ctx);   // lingering reform flash after isActive() clears
      }
    } catch (err) { console.warn('[Phasewalker FX render]', err); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Oni "Protocol 0: Total Cataclysm" — SPACE ultimate. Mirrors the Phasewalker kit:
  // module runs in SCREEN space (world→screen via camera + _viewScale). Self-guards on
  // selectedCharacter === 'oni_cataclysm_protocol', so every other character is untouched.
  // ════════════════════════════════════════════════════════════════════════════
  _ensureOniFx() {
    if (this.player?.selectedCharacter !== 'oni_cataclysm_protocol') return;
    if (this._oniFxBuilt || !this._canvas) return;
    this._protocol0  = new Protocol0(this._canvas);
    this._laserEyes  = new LaserEyes(this._canvas);
    this._meteorRain = new MeteorRain(this._canvas, { area: { radius: 170 } });
    this._oniFxBuilt = true;
  }

  activateProtocol0Cataclysm() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'oni_cataclysm_protocol') return;
    this._ensureOniFx();
    if (!this._protocol0 || this._protocol0.isRunning()) return;
    if (p.mana < ULTIMATE_MANA_COST) {
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), RED, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;
    const vs = this._viewScale, cam = this.camera;
    const s  = this._playerScreenPos();
    this._protocol0.trigger(s.cx, s.footY, this.enemies, {
      getX: e => ((e?.pos?.x ?? cam.x) - cam.x) * vs,
      getY: e => ((e?.pos?.y ?? cam.y) - cam.y) * vs,
      onBuffStart: b => {
        this._oniSpeedBuff = b.speedMult - 1;   // +40% move speed
        p.speedBonus += this._oniSpeedBuff;
        p._tankTimer  = 8.0;                     // 50% damage reduction window (read in Player.applyDamage)
      },
      onBuffEnd: () => {
        p.speedBonus -= this._oniSpeedBuff; this._oniSpeedBuff = 0;
        p._tankTimer  = 0;
      },
      onCollide: e => { if (e?.takeHit) e.takeHit(18, this); if (e) e.stunned = Math.max(e.stunned || 0, 0.4); },
      onDetonate: () => {
        this.screenShake.trigger(14, 0.6);
        for (const e of this.enemies) if (e?.takeHit) e.takeHit((e.isBoss?.() || e.isMegaBoss) ? this._capBossDamage(e, 220) : 220, this);
        this.enemyBullets.length = 0;            // clear all enemy projectiles
      },
    });
    this.screenShake.trigger(7, 0.3);
    this.floatingTexts.push(new FloatingText('PROTOCOL 0: TOTAL CATACLYSM!', p.pos.clone(), RED, 1.6));
  }

  _updateOniFx(dt) {
    if (this.player?.selectedCharacter !== 'oni_cataclysm_protocol') return;
    this._ensureOniFx();
    if (!this._protocol0) return;
    const now = performance.now();
    const vs = this._viewScale, cam = this.camera, p = this.player;
    const toX = e => ((e?.pos?.x ?? cam.x) - cam.x) * vs;
    const toY = e => ((e?.pos?.y ?? cam.y) - cam.y) * vs;
    const nearest = () => { let b = null, bd = Infinity; for (const e of this.enemies) { if (!e?.pos) continue; const d = distance(e.pos, p.pos); if (d < bd) { bd = d; b = e; } } return b; };

    // Tank-buff timer (50% DR) ticks down during the ultimate
    if ((p._tankTimer || 0) > 0) p._tankTimer = Math.max(0, p._tankTimer - dt);

    // ── Protocol 0 ultimate (SPACE) ──
    try {
      const s = this._playerScreenPos();
      this._protocol0.update(now, s.cx, s.footY, this.enemies);
    } catch (err) { console.warn('[Oni Protocol0]', err); }

    // ── Laser Eyes (auto-weapon 1) — charged piercing beam, auto-fires on cooldown ──
    if (this._oniLaserCd > 0) this._oniLaserCd -= dt;
    if (this._laserEyes && !this._laserEyes.isActive() && this._oniLaserCd <= 0) {
      const tgt = nearest();
      if (tgt && distance(tgt.pos, p.pos) < 560) {
        this._laserEyes.cast({
          getEyes: () => { const s = this._playerScreenPos(), top = s.footY - s.spriteH;
            return [ { x: s.cx - 6, y: top + s.spriteH * 0.30 }, { x: s.cx + 6, y: top + s.spriteH * 0.30 },
                     { x: s.cx - 12, y: top + s.spriteH * 0.12 }, { x: s.cx + 12, y: top + s.spriteH * 0.12 } ]; },
          getAim:  () => { const t = nearest(); return t ? { x: toX(t), y: toY(t) } : { x: this._playerScreenPos().cx, y: 0 }; },
          enemies: this.enemies, getX: toX, getY: toY,
          onTick:  e => { if (e?.takeHit) e.takeHit(6, this); },   // damage per 0.1s tick (tunable)
        });
        this._oniLaserCd = 3.5;   // seconds between beams (tunable)
      }
    }
    if (this._laserEyes) { try { this._laserEyes.update(now, this.enemies); } catch (err) { console.warn('[Oni Laser]', err); } }

    // ── Meteor Rain (auto-weapon 2, AoE) — 5s field, auto-fires on cooldown ──
    if (this._oniMeteorCd > 0) this._oniMeteorCd -= dt;
    if (this._meteorRain && !this._meteorRain.isActive() && this._oniMeteorCd <= 0) {
      const tgt = nearest();
      if (tgt && distance(tgt.pos, p.pos) < 620) {
        this._oniMeteorWorld = { x: tgt.pos.x, y: tgt.pos.y };   // anchor the field in WORLD space
        this._meteorRain.cast(toX(tgt), toY(tgt), this.enemies, {
          getX: toX, getY: toY,
          onImpact: e => { if (e?.takeHit) e.takeHit(30, this); },   // per-meteor AoE damage (tunable)
        });
        this._oniMeteorCd = 9.0;   // seconds between fields (tunable)
      }
    }
    if (this._meteorRain) {
      if (this._meteorRain.isActive() && this._oniMeteorWorld) {   // keep the circle pinned to its world spot
        this._meteorRain.cx = (this._oniMeteorWorld.x - cam.x) * vs;
        this._meteorRain.cy = (this._oniMeteorWorld.y - cam.y) * vs;
      }
      try { this._meteorRain.update(now, this.enemies); } catch (err) { console.warn('[Oni Meteor]', err); }
    }
  }

  _drawOniFx(ctx) {
    this._canvas = ctx.canvas;
    if (this.player?.selectedCharacter !== 'oni_cataclysm_protocol') return;
    this._ensureOniFx();
    try {
      if (this._meteorRain) this._meteorRain.render(ctx);   // ground grid + falling meteors (behind)
      if (this._protocol0)  this._protocol0.render(ctx);    // ult aura / lava / detonation
      if (this._laserEyes)  this._laserEyes.render(ctx);    // beams (on top)
    } catch (err) { console.warn('[Oni FX render]', err); }
  }

  // ── Euclid Vector toxin kit (world-space; built lazily when he is selected) ─────────────────
  // Minimal, defensive adapter: the kit reads {x,y,radius,dead,dying} + calls takeDamage/
  // applyKnockback/beginMelt on enemies and reads {x,y,height,facing} on the player. We proxy to the
  // game's pos/takeHit and route damage through _capBossDamage so bosses are never instantly melted.
  _euclidWrap(e) {
    let w = this._euclidWraps.get(e);
    if (w) return w;
    const game = this;
    w = {
      _e: e, dying: false, poison: null,
      get x() { return e.pos.x; },
      get y() { return e.pos.y; },
      get radius() { return e.radius || 14; },
      get hp() { return e.hp; },
      get dead() { return e.hp <= 0; },
      takeDamage(d) {
        if (!(d > 0)) return;
        const capped = (e.isBoss?.() || e.isMegaBoss) ? game._capBossDamage(e, d) : d;   // boss-cap, then route through takeHit
        if (e.takeHit) e.takeHit(capped, game); else e.hp -= capped;
      },
      applyKnockback(kx, ky) { if (e.vel) { e.vel.x += kx * 0.03; e.vel.y += ky * 0.03; } },   // modest impulse
      beginMelt() {},   // cosmetic in the kit; the enemy already dies via takeHit
    };
    this._euclidWraps.set(e, w);
    return w;
  }

  _ensureEuclidKit() {
    if (this._euclidKitBuilt || this.player?.selectedCharacter !== 'euclid_vector') return;
    const bounds = { w: WORLD_W, h: WORLD_H };
    const noFx = { add() {}, burst() {} };   // kit's optional impact debris — skipped (no-op, defensive)
    this._euclidSniper = new ToxicSniper(this._euclidPlayer, this._euclidEnemies, noFx, bounds);
    this._euclidSniper.fireInterval = 0.7;           // main weapon (sniper default 1.5s is too slow)
    this._euclidKatana = new OrbitalKatanaBarrier(this._euclidPlayer, this._euclidEnemies, noFx);
    this._euclidKatana.damage = 12;                  // close-range secondary; boss-capped per hit
    this._euclidPlague = new PlagueTrailDash(this._euclidPlayer, this._euclidEnemies, noFx, bounds);
    this._euclidPlague.destroy();                    // REMOVE its self-installed global SPACE listener — we drive it
    this._euclidPlague.cooldown = 0;                 // mana-gated by the game instead of an internal cd
    this._euclidKitBuilt = true;
  }

  _updateEuclidKit(dt) {
    if (this.player?.selectedCharacter !== 'euclid_vector') return;
    this._ensureEuclidKit();
    const p = this.player;
    try {
      // Sync world into the adapter (same array the kit holds by reference; persistent wrappers).
      this._euclidPlayer.x = p.pos.x; this._euclidPlayer.y = p.pos.y;
      if (p.lastFacingDir) this._euclidPlayer.facing = Math.atan2(p.lastFacingDir.y, p.lastFacingDir.x);   // kit v2: Plague dash lunges toward last movement
      const arr = this._euclidEnemies; arr.length = 0;
      const live = new Set();
      for (const e of this.enemies) if (e && e.pos) { arr.push(this._euclidWrap(e)); live.add(e); }
      for (const e of this._euclidWraps.keys()) if (!live.has(e)) this._euclidWraps.delete(e);

      // Card scaling — read live so it works in Act 1 + Endless.
      this._euclidSniper.bulletDamage    = 14 + 4 * this._cardLvl('euclid_toxin_shot_mastery');
      this._euclidSniper.poison.dps      = 6 + 3 * this._cardLvl('euclid_corrosive_spread');
      this._euclidSniper.poison.duration = 3 + 0.5 * this._cardLvl('euclid_corrosive_spread');

      this._euclidSniper.update(dt);
      this._euclidKatana.update(dt);
      this._euclidPlague.update(dt);
      p.pos.x = this._euclidPlayer.x; p.pos.y = this._euclidPlayer.y;   // apply the plague-dash lunge

      // Tick the toxin DoT the sniper applied (the kit only SETS enemy.poison; the host ticks it).
      for (const w of this._euclidWraps.values()) {
        const pz = w.poison; if (!pz || pz.timeLeft <= 0) continue;
        pz.timeLeft -= dt; pz.tickTimer -= dt;
        if (pz.tickTimer <= 0) { pz.tickTimer = pz.tickEvery; w.takeDamage(pz.dps * pz.tickEvery); }
      }
    } catch (err) { console.warn('[Euclid kit]', err); }
  }

  _drawEuclidKit(ctx) {
    if (this.player?.selectedCharacter !== 'euclid_vector' || !this._euclidKitBuilt) return;
    try {
      this._euclidKatana.draw(ctx);
      this._euclidSniper.draw(ctx);
      this._euclidPlague.draw(ctx);
    } catch (err) { console.warn('[Euclid kit draw]', err); }
  }

  // Euclid SPACE ultimate — Plague Trail Dash (mana-gated; Vector Overdose trims the cost). The kit's
  // own global SPACE listener was removed in _ensureEuclidKit, so this is the only trigger path.
  activateEuclidPlague() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI || this.mutationUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'euclid_vector') return;
    this._ensureEuclidKit();
    if (!this._euclidPlague) return;
    const cost = Math.max(60, ULTIMATE_MANA_COST - 12 * (p.upgrades['euclid_vector_overdose'] || 0));
    if (p.mana < cost) { this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), '#00ff66', 1.0)); return; }
    this._euclidPlayer.x = p.pos.x; this._euclidPlayer.y = p.pos.y;
    this._euclidPlague.trigger();
    p.mana -= cost;
    this.screenShake.trigger(5, 0.25);
    this.floatingTexts.push(new FloatingText('PLAGUE TRAIL!', p.pos.clone(), '#00ff66', 1.2));
  }

  // ── Thunder Solo ultimate (Cyber Skeleton Warrior, SPACE, 100 mana) ──────────
  activateThunderSolo() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'skeleton_warrior') return;  // only this character has an ultimate
    if (this.thunderSolo) return;                            // already running
    if (p.mana < ULTIMATE_MANA_COST) {
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;                            // fixed 100 cost; Mana Core overflow banks toward next cast
    this.thunderSolo = { phase: 'windup', t: 0, totalT: 0, strikeTimer: 0, bolts: [],
                         notes: [], noteTimer: 0,
                         miniDmgThisSec: 0, megaDmgThisSec: 0, bossDmgTimer: 1.0 };
    this.screenShake.trigger(4, 0.2);
    this.floatingTexts.push(new FloatingText('THUNDER SOLO!', p.pos.clone(), CYAN, 1.4));
  }

  // ── Overheated Heavy Chains ultimate (Cyber Arm Hero, SPACE, 100 mana) ───────
  // Heavy fiery chains rotate around the hero for 7s, burning crowds and bosses (capped).
  // The cyber arm overheats, costing the player up to 10% max HP gradually (never lethal).
  activateOverheatedChains() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'cyber_arm_hero') return;   // Cyber Arm Hero only
    if (this.overChains) return;                            // already running
    if (p.mana < ULTIMATE_MANA_COST) {                      // same NOT-ENOUGH-MANA behavior as Thunder Solo
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), ORANGE, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;                           // fixed 100 cost; Mana Core overflow banks toward next cast
    this.overChains = { t: 0, angle: 0, dmgTimer: 0,
                        miniDmgThisSec: 0, megaDmgThisSec: 0, bossDmgTimer: 1.0,
                        drops: [], dropTimer: 0 };           // visual-only: falling chain-rain segments
    this.screenShake.trigger(5, 0.3);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('OVERHEATED HEAVY CHAINS!', p.pos.clone(), ORANGE, 1.4));
  }

  _updateOverheatedChains(dt) {
    const oc = this.overChains;
    if (!oc) return;
    const p = this.player;
    const DURATION = 7, RADIUS = 155 * (1 + 0.12 * this._cardLvl('cyber_heavy_chains_mastery'));
    const TICK = 0.25, NORMAL_DMG = 12, KNOCK = 90;   // 48 DPS to normal enemies + small knockback
    const MINI_CAP = 32, MAIN_CAP = 48;               // per-second boss caps (≈47% / ≈45% over 7s)

    oc.t     += dt;
    oc.angle += dt * 3.4;        // (kept for any timing use; visual is now chain-rain, not a cyclone)

    // ── Chain Rain (visual only) — heavy overheated chains fall around the hero. Spawned to
    // random ground points within the damage RADIUS so the rain reads as "striking around me".
    oc.dropTimer -= dt;
    if (oc.t < DURATION - 0.4 && oc.dropTimer <= 0) {
      oc.dropTimer = 0.07;
      const n = 1 + (Math.random() < 0.7 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr  = Math.sqrt(Math.random()) * RADIUS;
        oc.drops.push({
          x: p.pos.x + Math.cos(ang) * rr,
          ty: p.pos.y + Math.sin(ang) * rr * 0.85,   // slight vertical squash → ground-plane feel
          t: 0, fall: randomRange(0.26, 0.4), len: randomRange(40, 70),
        });
      }
    }
    for (const d of oc.drops) d.t += dt;
    oc.drops = oc.drops.filter(d => d.t < d.fall + 0.28);   // fall time + brief impact linger

    // Gradual cyber-arm overheat self-damage: 10% maxHp over the duration, never lethal (floor 1 HP)
    const selfRate = (0.10 * p.maxHp) / DURATION;
    p.hp = Math.max(1, p.hp - selfRate * dt);

    // Per-second boss-damage budget reset (keeps bosses controlled / unbreakable)
    oc.bossDmgTimer -= dt;
    if (oc.bossDmgTimer <= 0) { oc.bossDmgTimer = 1.0; oc.miniDmgThisSec = 0; oc.megaDmgThisSec = 0; }

    // Repeating burn ticks
    oc.dmgTimer -= dt;
    if (oc.dmgTimer <= 0) {
      oc.dmgTimer = TICK;

      const bossHit = (isMega) => {
        const cap  = isMega ? MAIN_CAP : MINI_CAP;
        const used = isMega ? oc.megaDmgThisSec : oc.miniDmgThisSec;
        const dmg  = Math.min(cap * TICK, cap - used);   // this tick's slice, clamped to the per-sec cap
        if (dmg <= 0) return 0;
        if (isMega) oc.megaDmgThisSec += dmg; else oc.miniDmgThisSec += dmg;
        return dmg;
      };

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (distance(e.pos, p.pos) > RADIUS + e.radius) continue;
        if (e.isMegaBoss) {
          const d = bossHit(true);  if (d > 0) e.takeHit(this._resistDot(e, d), this);
        } else if (e.isBoss()) {
          const d = bossHit(false); if (d > 0) e.takeHit(this._resistDot(e, d), this);
        } else {
          e.takeHit(NORMAL_DMG, this);
          e.vel.addMut(safeNormalize(e.pos.sub(p.pos)).scale(KNOCK));   // small knockback
          if (Math.random() < 0.35) this.particles.spawnHitSparks(e.pos, ORANGE);  // burn sparks (throttled)
        }
      }

      // Singleton mini-bosses share the mini budget (reduced, controlled)
      const hitSingle = (b, die) => {
        if (!b || b.hp <= 0 || distance(b.pos, p.pos) > RADIUS + b.radius) return;
        const d = bossHit(false); if (d <= 0) return;
        b.hp -= this._resistDot(b, d); b.hitFlash = 0.08;
        if (b.hp <= 0) die.call(this);
      };
      hitSingle(this.titanBoss,       this._titanDie);
      hitSingle(this.annihilatorBoss, this._annihilatorDie);
      hitSingle(this.bloodfangBoss,   this._bloodfangDie);
    }

    if (oc.t >= DURATION) this.overChains = null;
  }

  // World-space: OVERHEATED CHAIN RAIN — heavy chains fall vertically and strike around the hero.
  // No cyclone/tornado; the hero stays fully visible (chains land around, not over, the player).
  _drawOverheatedChains(ctx) {
    const oc = this.overChains;
    if (!oc) return;
    const p = this.player;
    const RADIUS = 155 * (1 + 0.12 * this._cardLvl('cyber_heavy_chains_mastery')), DURATION = 7;
    const a = Math.max(0, Math.min(oc.t / 0.3, (DURATION - oc.t) / 0.5, 1));   // fade in/out

    // Low hot-floor glow marking the strike zone (subtle, additive — not a giant cloud)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.pos.x, p.pos.y, RADIUS * 0.25, p.pos.x, p.pos.y, RADIUS);
    g.addColorStop(0,   'rgba(255,80,20,'  + (0.12 * a) + ')');
    g.addColorStop(1,   'rgba(255,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(p.pos.x, p.pos.y, RADIUS, RADIUS * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const FALL = 150;                       // how far above the target a chain starts
    ctx.save();
    ctx.lineCap = 'round';
    for (const d of oc.drops) {
      const falling = d.t < d.fall;
      const prog    = falling ? d.t / d.fall : 1;          // 0→1 descent
      const bottomY = d.ty - FALL * (1 - prog);            // chain bottom reaches d.ty on impact
      const topY    = bottomY - d.len;
      const fade    = a * (falling ? 1 : Math.max(0, 1 - (d.t - d.fall) / 0.28));

      // The chain: a hot core line + a brighter inner line + round "links" along it (mechanical/heavy)
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = '#ff5a14'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(d.x, topY); ctx.lineTo(d.x, bottomY); ctx.stroke();
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(d.x, topY); ctx.lineTo(d.x, bottomY); ctx.stroke();
      ctx.fillStyle = '#ffae3c';
      for (let ly = topY; ly <= bottomY; ly += 9) {
        ctx.beginPath(); ctx.ellipse(d.x, ly, 3.2, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      }

      // Impact burst at the strike point once landed
      if (!falling) {
        const k = (d.t - d.fall) / 0.28;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade;
        drawGlow(ctx, d.x, d.ty, 10 + 16 * k, '#ff8a2a', 0.7 * (1 - k));
        ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(d.x, d.ty, 6 + 14 * k, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  _updateThunderSolo(dt) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const WINDUP = 0.6, STORM = 6.0, FADE = 0.4;   // ~7s total ultimate (was 20s storm)
    ts.t += dt;
    ts.totalT += dt;   // total elapsed across all phases (drives the ~7s guitar)

    // Advance strikes; damage + impact FX fire exactly when each bolt LANDS so enemies are
    // visibly struck before they die (no more vanishing ahead of the visible impact).
    for (const b of ts.bolts) {
      b.t += dt;
      if (!b.struck && b.t >= b.windup) { b.struck = true; this._strikeImpact(b); }
    }
    ts.bolts = ts.bolts.filter(b => b.t < b.maxLife);

    // Drift musical notes upward with a gentle sway, then fade out
    for (const n of ts.notes) {
      n.life -= dt;
      n.y    -= n.vy * dt;
      n.x    += Math.sin(n.life * n.swaySpd + n.swayPhase) * n.sway * dt;
      n.rot  += n.spin * dt;
    }
    ts.notes = ts.notes.filter(n => n.life > 0);

    // Ambient notes stream up from around the skeleton/guitar for the whole cast — "musical thunder"
    if (ts.phase !== 'fade') {
      ts.noteTimer -= dt;
      if (ts.noteTimer <= 0) {
        ts.noteTimer = randomRange(0.15, 0.26);   // a touch more frequent for stronger musical identity
        const p = this.player;
        this._spawnThunderNote(p.pos.x + randomRange(-42, 42), p.pos.y - randomRange(14, 54));
      }
    }

    if (ts.phase === 'windup') {
      if (ts.t >= WINDUP) { ts.phase = 'storm'; ts.t = 0; }
      return;
    }

    if (ts.phase === 'storm') {
      // Per-second boss-damage budget reset (keeps bosses alive through the long storm)
      ts.bossDmgTimer -= dt;
      if (ts.bossDmgTimer <= 0) { ts.bossDmgTimer = 1.0; ts.miniDmgThisSec = 0; ts.megaDmgThisSec = 0; }

      ts.strikeTimer -= dt;
      if (ts.strikeTimer <= 0) {
        ts.strikeTimer = 0.15;   // rapid waves of strikes — heavy thunder rain
        this._spawnThunderWave();
      }
      if (ts.t >= STORM) { ts.phase = 'fade'; ts.t = 0; }
      return;
    }

    // fade
    if (ts.t >= FADE) this.thunderSolo = null;
  }

  // A floating musical-note glyph (cyan energy accent) that drifts up and fades
  _spawnThunderNote(x, y) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const glyph = (Math.random() * THUNDER_NOTES.length) | 0;
    ts.notes.push({
      x, y, glyph,
      size: randomRange(24, 38),
      life: randomRange(1.0, 1.5), maxLife: 1.5,
      vy: randomRange(26, 46),
      sway: randomRange(14, 30), swaySpd: randomRange(5, 9), swayPhase: Math.random() * 6.28,
      rot: randomRange(-0.2, 0.2), spin: randomRange(-1.2, 1.2),
    });
  }

  // One wave of several strikes — re-scans the live battlefield each time so enemies that
  // spawn DURING the 20s storm are hunted too (the rain never runs out of targets).
  _spawnThunderWave() {
    const n = this.enemies.length;
    // 2 strikes baseline, scaling with crowd size, capped for readability + performance
    const strikes = Math.max(2, Math.min(4, 2 + Math.floor(n / 12)));
    for (let i = 0; i < strikes; i++) {
      const t = this._pickStrikeTarget();
      if (t) this._spawnThunderStrike(t.x, t.y);
    }
  }

  // Priority targeting: clusters / close enemies / core-carriers / bosses, random only as fallback
  _pickStrikeTarget() {
    const p = this.player;
    const enemies = this.enemies;
    const bosses = [this.titanBoss, this.annihilatorBoss, this.bloodfangBoss].filter(b => b && b.hp > 0);

    // occasionally pressure a boss
    if (bosses.length && Math.random() < 0.12) {
      const b = bosses[(Math.random() * bosses.length) | 0];
      return { x: b.pos.x + randomRange(-18, 18), y: b.pos.y + randomRange(-18, 18) };
    }
    if (enemies.length === 0) {
      if (bosses.length) { const b = bosses[(Math.random() * bosses.length) | 0]; return { x: b.pos.x, y: b.pos.y }; }
      return { x: this.camera.x + randomRange(40, this._viewW - 40), y: this.camera.y + randomRange(60, this._viewH - 40) };
    }
    // NEAREST enemies to the player: sort by distance, pick among the closest few
    const near = enemies.map(e => ({ e, d: distance(e.pos, p.pos) }))
                        .sort((a, b) => a.d - b.d)
                        .slice(0, Math.min(5, enemies.length));
    const pick = near[(Math.random() * Math.min(near.length, 3)) | 0] || near[0];
    const e = pick.e;
    return { x: e.pos.x + randomRange(-10, 10), y: e.pos.y + randomRange(-10, 10) };
  }

  // Create a single falling bolt with a short wind-up; damage is applied later, on impact.
  _spawnThunderStrike(tx, ty) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const variant = (Math.random() * THUNDER_STRIKES.length) | 0;
    const scale   = randomRange(0.85, 1.15);
    const windup  = randomRange(0.10, 0.16);   // brief telegraph so the bolt is seen landing
    ts.bolts.push({ x: tx, y: ty, variant, scale, t: 0, windup, struck: false,
                    life: windup + 0.34, maxLife: windup + 0.34 });
  }

  // Fired the instant a bolt lands: ground ring, sparks, shake, a note, then the AoE damage.
  _strikeImpact(b) {
    const pos = new Vec2(b.x, b.y);
    const tm  = this._cardLvl('skeleton_thunder_solo_mastery');
    this._specialRings.push({ pos: pos.clone(), radius: 0, maxRadius: 82 * (1 + 0.16 * tm),
                               life: 0.4, maxLife: 0.4, color1: CYAN, color2: '#ffffff' });
    if (tm > 0) this._specialRings.push({ pos: pos.clone(), radius: 0, maxRadius: 120 * (1 + 0.16 * tm),
                               life: 0.5, maxLife: 0.5, color1: '#bfe6ff', color2: CYAN });   // extra storm pulse
    this.particles.spawnHitSparks(pos, CYAN);
    if (Math.random() < 0.16) this._spawnThunderNote(b.x + randomRange(-12, 12), b.y - randomRange(8, 24));
    if (Math.random() < 0.25) this.screenShake.trigger(3, 0.08);
    this._applyStrikeDamage(b.x, b.y);
  }

  _applyStrikeDamage(tx, ty) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const MINI_DPS_CAP = 45, MEGA_DPS_CAP = 25;
    const FREEZE = 1.2;   // seconds normal enemies stay frozen by a lightning note (tunable)
    const bossHit = (perStrike, isMega) => {
      const used = isMega ? ts.megaDmgThisSec : ts.miniDmgThisSec;
      const budget = (isMega ? MEGA_DPS_CAP : MINI_DPS_CAP) - used;
      if (budget <= 0) return 0;
      const dmg = Math.min(perStrike, budget);
      if (isMega) ts.megaDmgThisSec += dmg; else ts.miniDmgThisSec += dmg;
      return dmg;
    };
    const R = 110 * (1 + 0.12 * this._cardLvl('skeleton_thunder_solo_mastery'));
    const at = new Vec2(tx, ty);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (distance(e.pos, at) < R + e.radius) {
        if (e.isBoss() || e.isMegaBoss) {
          const dmg = bossHit(16, e.isMegaBoss);
          if (dmg > 0) e.takeHit(dmg, this);
          e.stunned = Math.max(e.stunned || 0, 0.4);      // bosses: brief safe interrupt
        } else {
          e.takeHit(80, this);
          e.stunned = Math.max(e.stunned || 0, FREEZE);   // normal enemies: FROZEN
        }
      }
    }
    const hitBoss = (boss, die) => {
      if (boss && boss.hp > 0 && distance(boss.pos, at) < R + boss.radius) {
        const dmg = bossHit(16, false);
        if (dmg <= 0) return;
        boss.hp -= dmg; boss.hitFlash = 0.08;
        boss.stunned = Math.max(boss.stunned || 0, 0.4);
        if (boss.hp <= 0) die.call(this);
      }
    };
    hitBoss(this.titanBoss, this._titanDie);
    hitBoss(this.annihilatorBoss, this._annihilatorDie);
    hitBoss(this.bloodfangBoss, this._bloodfangDie);

    // shattered-note burst at the impact
    for (let k = 0; k < 2; k++) this._spawnThunderNote(tx + randomRange(-14, 14), ty - randomRange(4, 18));
  }

  // Guitar FX — drawn just BEFORE the player so the skeleton renders on top (source behind it)
  _drawThunderSoloGuitar(ctx) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const p = this.player;
    const gt = ts.totalT;
    if (gt >= 7.0) return;
    let guitarAlpha = (gt < 0.2) ? gt / 0.2 : (gt < 6.5) ? 1 : 1 - (gt - 6.5) / 0.5;
    guitarAlpha *= 0.9 + 0.1 * Math.sin(gt * 6);
    if (guitarAlpha <= 0) return;

    // cyan aura behind the skeleton while it "plays"
    drawGlow(ctx, p.pos.x, p.pos.y - 8, 44, CYAN, 0.16 + 0.12 * Math.abs(Math.sin(gt * 9)));

    const cx = p.pos.x + 10, cy = p.pos.y - 26;
    const spr = this._thunderGuitarSprite;
    const haveSpr = spr && spr.complete && spr.naturalWidth > 0;
    const strum = Math.max(0, 1 - (ts.strikeTimer / 0.15));   // flashes right after each strike wave

    ctx.save();
    ctx.globalAlpha = guitarAlpha;
    if (haveSpr) {
      const gh = 58, gw = Math.round(spr.naturalWidth * (gh / spr.naturalHeight));
      drawGlow(ctx, cx, cy, 30, '#bfefff', 0.45 * guitarAlpha);
      drawGlow(ctx, cx, cy, 40, CYAN, 0.30 * guitarAlpha);
      ctx.drawImage(spr, Math.round(cx - gw / 2), Math.round(cy - gh / 2), gw, gh);
    } else {
      // ── vector neon ELECTRIC GUITAR ──
      ctx.translate(cx, cy);
      ctx.rotate(-0.5);
      const S = 26;
      drawGlow(ctx, 0, S * 0.2, S * 1.2, CYAN, (0.35 + 0.25 * strum) * guitarAlpha);
      ctx.lineJoin = 'round';
      // body (two bouts)
      ctx.fillStyle = '#06223a'; ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, S * 0.5, S * 0.64, S * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-S * 0.05, S * 0.05, S * 0.5, S * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // pickups / bridge (flash on strum)
      ctx.fillStyle = '#0a3a5c'; ctx.fillRect(-S * 0.16, S * 0.12, S * 0.32, S * 0.52);
      ctx.fillStyle = strum > 0.5 ? '#ffffff' : '#3ad0ff';
      ctx.fillRect(-S * 0.16, S * 0.22, S * 0.32, S * 0.06);
      ctx.fillRect(-S * 0.16, S * 0.46, S * 0.32, S * 0.06);
      // neck + headstock
      ctx.fillStyle = '#08283f'; ctx.strokeStyle = CYAN; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(-S * 0.12, -S * 1.5, S * 0.24, S * 1.55); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#06223a';
      ctx.beginPath(); ctx.rect(-S * 0.20, -S * 1.80, S * 0.40, S * 0.30); ctx.fill(); ctx.stroke();
      // glowing strings (brighter on strum)
      ctx.strokeStyle = `rgba(191,239,255,${0.55 + 0.45 * strum})`; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * S * 0.07, S * 0.6); ctx.lineTo(i * S * 0.07, -S * 1.72); ctx.stroke(); }
    }
    ctx.restore();
  }

  // World-space rain FX (called inside the camera block, after entities) — sliced strike sprites + notes
  _drawThunderSoloWorld(ctx) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const sheet = this._lightningRainSprite;
    const haveSheet = sheet && sheet.complete && sheet.naturalWidth > 0;
    const time = performance.now() * 0.001;

    // glowing musical-note glyph (used as the lightning note + fallback notes)
    const noteGlyph = (nx, ny, s, al) => {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al;
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, s * 1.1);
      g.addColorStop(0, `rgba(191,239,255,${al})`); g.addColorStop(1, 'rgba(58,208,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(nx, ny, s * 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eaffff';
      ctx.beginPath(); ctx.ellipse(nx - s * 0.18, ny + s * 0.28, s * 0.30, s * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#bfefff'; ctx.lineWidth = Math.max(1.5, s * 0.13);
      ctx.beginPath(); ctx.moveTo(nx + s * 0.08, ny + s * 0.22); ctx.lineTo(nx + s * 0.08, ny - s * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(nx + s * 0.08, ny - s * 0.55); ctx.lineTo(nx + s * 0.42, ny - s * 0.40); ctx.stroke();
      ctx.restore();
    };

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of ts.bolts) {
      const impactFrac = b.windup / b.maxLife;
      const prog = b.t / b.maxLife;
      const sc = b.scale || 1;
      const H = 150 * sc, topY = b.y - H, topX = b.x + Math.sin((b.x + time) * 1.3) * 16;
      let alpha, fade = 0;
      if (prog < impactFrac) alpha = 0.35 + 0.5 * (prog / impactFrac);
      else { fade = Math.max(0, 1 - (prog - impactFrac) / (1 - impactFrac)); alpha = fade; }
      if (alpha <= 0) continue;

      // the lightning bolt (sprite slice if present, else procedural)
      if (haveSheet) {
        const S = THUNDER_STRIKES[b.variant];
        const dh = 132 * sc, dw = dh * (S.sw / S.sh);
        ctx.globalAlpha = 0.9 * alpha;
        ctx.drawImage(sheet, S.sx, S.sy, S.sw, S.sh, Math.round(b.x - dw * S.ax), Math.round(b.y - dh * S.ay), Math.round(dw), Math.round(dh));
      } else {
        if (!b._segs) { b._segN = 9; b._segs = []; for (let i = 0; i <= b._segN; i++) b._segs.push(Math.random() - 0.5); }
        const N = b._segN, pts = [];
        for (let i = 0; i <= N; i++) {
          const f = i / N, env = Math.sin(Math.PI * f * 0.5 + 0.2);
          const jit = (b._segs[i] * 26 + Math.sin(time * 30 + i) * 5 * (prog < impactFrac ? 0.4 : 1)) * env;
          pts.push({ x: topX + (b.x - topX) * f + jit, y: topY + (b.y - topY) * f });
        }
        const strokeBolt = (w, col, al) => {
          ctx.globalAlpha = al * alpha; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        };
        strokeBolt(9 * sc, '#1f6bff', 0.35); strokeBolt(4.5, '#3ad0ff', 0.8); strokeBolt(1.8, '#ffffff', 1);
      }

      // the LIGHTNING NOTE riding the bolt: travels down while falling, shatters on impact
      if (prog < impactFrac) {
        const f = prog / impactFrac;
        noteGlyph(b.x, topY + (b.y - topY) * f, 14 * sc, alpha);
      } else {
        noteGlyph(b.x, b.y, 14 * sc * (1 + 0.6 * (1 - fade)), fade);   // shatter (grows + fades)
      }

      // impact: white flash + FREEZE ring + frost spikes + sparks
      if (b.struck && fade > 0) {
        ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(b.x, b.y, 4 * fade + 2, 0, Math.PI * 2); ctx.fill();
        const fr = (1 - fade) * 44 * sc + 8;
        ctx.globalAlpha = 0.85 * fade; ctx.strokeStyle = '#cfeeff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, fr, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#9fe6ff'; ctx.lineWidth = 1.5;
        for (let s = 0; s < 8; s++) {
          const a2 = (s / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(b.x + Math.cos(a2) * fr * 0.7, b.y + Math.sin(a2) * fr * 0.7 * 0.6);
          ctx.lineTo(b.x + Math.cos(a2) * fr, b.y + Math.sin(a2) * fr * 0.6);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // ground halo after landing
    for (const b of ts.bolts) {
      if (!b.struck) continue;
      const impactFrac = b.windup / b.maxLife;
      const fade = Math.max(0, 1 - (b.t / b.maxLife - impactFrac) / (1 - impactFrac));
      drawGlow(ctx, b.x, b.y, 8 + 22 * fade, CYAN, 0.55 * fade);
    }

    // drifting notes (sprite if available, else the glowing glyph)
    for (const n of ts.notes) {
      const a = Math.max(0, Math.min(1, Math.min(1, n.life / 0.4) * (n.life / n.maxLife + 0.15)));
      if (a <= 0) continue;
      if (haveSheet) {
        const N = THUNDER_NOTES[n.glyph], nh = n.size, nw = nh * (N.sw / N.sh);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.95 * a;
        ctx.translate(n.x, n.y); ctx.rotate(n.rot);
        ctx.drawImage(sheet, N.sx, N.sy, N.sw, N.sh, -nw / 2, -nh / 2, nw, nh);
        ctx.restore();
      } else {
        noteGlyph(n.x, n.y, n.size * 0.45, 0.9 * a);
      }
    }
  }

  // Screen-space FX (called after the camera restore, before the HUD)
  _drawThunderSoloScreen(ctx) {
    const ts = this.thunderSolo;
    if (!ts) return;
    // Light, brief darken only — keeps gameplay readable (no fullscreen storm overlay)
    let dark = 0;
    if (ts.phase === 'windup')     dark = 0.28 * Math.min(1, ts.t / 0.8);
    else if (ts.phase === 'storm') dark = 0.10;
    else                           dark = 0.10 * Math.max(0, 1 - ts.t / 0.5);
    if (dark > 0) { ctx.fillStyle = `rgba(2,6,16,${dark})`; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
  }

  selectUpgrade(index) {
    if (!this.upgradeUI || index >= this.upgradeUI.choices.length) return;
    this.upgradeUI.choices[index].apply(this.player);
    this.score = (this.score ?? 0) + 50;
    this.upgradeUI = null;
  }

  // Neutral (no-effect) forced-mutation run-state. All multipliers default to 1 so Act 1 and any
  // pre-Endless frame are completely unaffected; only Endless picks push these off 1.
  _freshMutations() {
    return {
      spawnRateMult: 1, pickupRadiusMult: 1, manaGainMult: 1,
      enemyBulletSpeedMult: 1, plasmaOnPlayerChanceBonus: 0, eliteIntervalMult: 1,
      stacks: 0, taken: {},
    };
  }

  // Open the forced 3-card mutation picker (Endless only). The world freezes via the update gate.
  _openMutationChoice() {
    this.mutationUI = new MutationUI(sampleMutations(3, this.mutations));
    this.audio?.playEventWarning?.();
    this.triggerAnnouncement('⚠ FORCED MUTATION', '#ff5a3c');
  }

  // Apply the chosen mutation and resume. No skip path exists — a valid index must be picked.
  selectMutation(index) {
    if (!this.mutationUI) return;
    const choices = this.mutationUI.choices;
    if (index < 0 || index >= choices.length) return;
    const card = choices[index];
    card.apply(this.mutations);
    this.mutations.stacks += 1;
    this.mutations.taken[card.key] = (this.mutations.taken[card.key] || 0) + 1;
    this.mutationUI = null;
  }

  // One free reroll per level-up screen — re-samples the (already useful) card pool.
  rerollUpgrade() {
    if (!this.upgradeUI || !this.rerollAvailable) return;
    const choices = weightedSample(this.player, 3, { meta: this.meta, endless: this.endless });
    if (choices.length === 0) return;
    this.upgradeUI.setChoices(choices);
    this.rerollAvailable = false;
    this.audio?.playLevelUp?.();
  }

  // ─── Main update ──────────────────────────────────────────────────────────

  update(dt, input) {
    if (this.gameState === 'start_menu') {
      this._updateStartMenu(input);
      return;
    }
    if (this.gameState === 'character_select') {
      this._updateCharacterSelect(input);
      return;
    }
    if (this.gameState === 'exit_screen') {
      this._updateExitScreen(input);
      return;
    }
    if (this.gameState === 'upgrades') {
      this._updateUpgradesScreen(input);
      return;
    }
    if (this.gameState === 'achievements') {
      this._updateAchievementsScreen(input);
      return;
    }
    if (this.gameState === 'credits') {
      this._updateCreditsScreen(input);
      return;
    }
    if (this.gameState === 'instructions') {
      this._updateInstructionsScreen(input);
      return;
    }
    if (this.gameState === 'audio_settings') {
      this._updateAudioSettings(input);
      return;
    }
    if (this.gameState !== 'playing') return;

    if (this.paused || this.gameOver || this.victory) return;

    // If an upgrade OR forced-mutation card is active, freeze everything but allow UI interaction
    if (this.upgradeUI || this.mutationUI) return;

    // Check for pending level-up to show upgrade cards (one at a time)
    if (this.player.pendingLevelupCount > 0) {
      this.player.pendingLevelupCount--;
      const choices = weightedSample(this.player, 3, { meta: this.meta, endless: this.endless });
      if (choices.length > 0) {
        this.audio?.playLevelUp();
        this.upgradeUI = new UpgradeUI(choices);
        this.rerollAvailable = true;   // one free reroll per level-up screen
        return;
      }
    }

    this.timeAlive += dt;
    this.score += dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    this.screenShake.update(dt);

    if (!this.endless && this.timeAlive >= ACT1_WIN_SECONDS) {
      this.victory      = true;
      this.finalMessage = 'CITY GRID STABILIZED — VICTORY';
      // Persist the secret unlocks revealed on the Victory screen.
      this.meta?.unlockMany([
        'log_1985', 'log_1983',
        'golden_skeleton_warrior', 'dark_cyber_arm_hero', 'grandmaster_dojang_girl',
      ]);
      this.audio?.stopAll();
      this._grantRewards();
      return;
    }

    this.player.update(dt, input);
    // Dash SFX — fire once on the frame a dash begins (rising edge of dashTimer).
    const dashing = this.player.dashTimer > 0;
    if (dashing && !this._wasDashing) this.audio?.playDash();
    this._wasDashing = dashing;
    this._handleAutoShooting();
    this._handleCorePickupAndSlotting(dt);
    this._updateProjectiles(dt);
    this._updateHomingDiscs(dt);
    this._updateChainLightning(dt);
    this._updateNeonPierceBeam(dt);
    this._updateAquaTrail(dt);
    this._updateSpiritKicks(dt);
    this._updateNexusChakram(dt);   // Brawler primary (guards on character)
    this._updateCrescentClaw(dt);   // Brawler secondary
    this._updateSkyfall(dt);        // Brawler ultimate
    this._updateShuriken(dt);       // Assassin bounce weapon (guards on character)
    this._updateChromePhantom(dt);  // Assassin ultimate
    this._updatePhasewalkerFx(dt);  // Japan Phasewalker kit (guards on character)
    this._updateOniFx(dt);          // Oni Protocol 0 (guards on character)
    this._updateEuclidKit(dt);      // Euclid Vector toxin kit (guards on character)
    this._updateEnemies(dt);
    this._updateOverload(dt);
    this._updateSpawning(dt);
    this._updateEliteWaves(dt);
    this._updateCoreEconomy(dt);
    this._updateFloatingTexts(dt);
    this._updateEffects(dt);
    this._updateSpecialEffects(dt);
    this._updateThunderSolo(dt);
    this._updateOverheatedChains(dt);
    this._updateSpiritDojang(dt);
    this._updateCyberBikeRush(dt);
    this._checkPlayerEnemyCollisions(dt);
    this._updateEnemyBullets(dt);
    this._updateAbilityTimers(dt);
    this._updateQuantumOverhaul(dt);
    this._updateAcidRain(dt);
    this._updateEndlessBossRotation(dt);   // Endless-only: repeating miniboss/boss pressure
    this._updateTitan(dt);
    this._updateAnnihilator(dt);
    this._updateBloodfang(dt);
    this._updateBossAttacks(dt);
    this._updateEndlessHazards(dt);   // Endless-only: airstrike ships/rockets + cyber cyclone
    this._updateSupportDrones(dt);
    this._updateCorrosive(dt);   // centralized corrosive DoT (drone + Corrosive Payload card)
    this._updateAllyDrones(dt);
    this.events.update(dt, this.timeAlive, this);
    this._updateGridCache(dt);
    this._updateHealthPickups(dt);
    this._updateManaPickups(dt);
    this._updateAnnouncement(dt);
    this.particles.update(dt);
    this._updateCamera();
    this._updateDamagePulse(dt);
    this._updateUltReady(dt);
    this._updateComboPopups(dt);

    // Grid Investor card: +2% Gold Core chance per level on stolen cores (read in PowerMatrix.stealCore).
    const gridGoldBonus = (this.player.upgrades['Grid Investor'] || 0) * 0.02;
    for (const m of this.matrices) { m.update(dt); m.goldChanceBonus = gridGoldBonus; }

    // Tick down phoenix animation
    if (this.phoenixReviveTimer > 0) this.phoenixReviveTimer -= dt;

    if (this.overload >= MAX_OVERLOAD) {
      this.gameOver     = true;
      this.finalMessage = 'CITY GRID TOTAL BLACKOUT';
      this.audio?.stopAll();
      this._grantRewards();
    } else if (this.player.hp <= 0 && this.phoenixReviveTimer <= 0 && !this.gameOver && !this.victory) {
      // Phoenix revive is DEATH-ONLY: it fires solely when HP has reached 0,
      // never from a timer/cooldown/visual schedule.
      if (this.phoenixReviveCount < 3) {
        this._triggerPhoenixRevive();
      } else {
        this.gameOver     = true;
        this.finalMessage = 'CYBER-HERO OFFLINE';
        this.audio?.stopAll();
        this._grantRewards();
      }
    }
  }

  _updateGridCache(dt) {
    const DURATION = 20;
    const CRATE_R  = 24;  // pickup radius (half of 48px sprite)

    if (this.gridCache) {
      // Check player pickup
      if (distance(this.player.pos, this.gridCache.pos) < PLAYER_RADIUS + CRATE_R) {
        // Base reward (always): a little XP + overload relief + score
        this.player.gainXp(10, this.floatingTexts);
        this.overload = Math.max(0, this.overload - 5);
        this.score += 50;
        this.floatingTexts.push(new FloatingText('GRID CACHE COLLECTED', this.player.pos.clone(), CYAN, 1.2));
        this.particles.spawnCorePickup(this.gridCache.pos, CYAN);
        this._grantGridCacheBonus();
        // Endless-only matrix refill: 50% (×Cache Scanner) chance to grant +8 cores. Act 1 unchanged.
        if (this.endless && Math.random() < this._endlessCacheBonusChance()) {
          this.addCarriedCoresSafe(8);
          this.floatingTexts.push(new FloatingText('+8 CORES', this.player.pos.clone(), '#ffd23c', 1.6));
        }
        this.gridCache = null;
        this.gridCacheSpawnTimer = 60;
        return;
      }
      // Expire after DURATION seconds
      this.gridCache.timer -= dt;
      if (this.gridCache.timer <= 0) {
        this.floatingTexts.push(new FloatingText('GRID CACHE LOST', this.gridCache.pos.clone(), '#888888', 1.0));
        this.gridCache = null;
        this.gridCacheSpawnTimer = 60;
      }
      return;
    }

    // Count down to next spawn
    this.gridCacheSpawnTimer -= dt;
    if (this.gridCacheSpawnTimer > 0) return;

    // Pick a safe random position inside the world
    const margin = 100;
    let spawnPos = null;
    for (let i = 0; i < 10; i++) {
      const candidate = new Vec2(
        randomRange(margin, WORLD_W - margin),
        randomRange(margin, WORLD_H - margin)
      );
      if (!this.enemies.some(e => distance(e.pos, candidate) < 80)) {
        spawnPos = candidate;
        break;
      }
    }
    if (!spawnPos) {
      spawnPos = new Vec2(randomRange(margin, WORLD_W - margin), randomRange(margin, WORLD_H - margin));
    }

    this.gridCache = { pos: spawnPos, timer: DURATION };
    this.triggerAnnouncement('GRID CACHE DETECTED', CYAN);
    this.audio?.playGridCache();
  }

  // Grid Credits award, scaled by the Grid Investor card (+10% per level). Returns granted amount.
  _awardCredits(n) {
    const mult  = 1 + (this.player.upgrades['Grid Investor'] || 0) * 0.10;
    const total = Math.max(1, Math.round(n * mult));
    this.meta.addCredits(total);
    this.runCreditsEarned = (this.runCreditsEarned || 0) + total;
    return total;
  }

  // RNG bonus on top of the Grid Cache base reward: HP / Mana / Grid Credits / loose Cores.
  _grantGridCacheBonus() {
    const p = this.player;
    const r = Math.random();
    if (r < 0.30) {
      const heal = Math.round(p.maxHp * 0.30);
      p.hp = p.hp >= p.maxHp ? p.hp : Math.min(p.maxHp, p.hp + heal);   // never clip overheal
      this.floatingTexts.push(new FloatingText('+' + heal + ' HP', p.pos.clone(), RED, 1.4));
    } else if (r < 0.55) {
      const m = Math.round((Math.random() < 0.5 ? 25 : 50) * this.mutations.manaGainMult);   // MANA DROUGHT (×1 outside Endless)
      p.mana = Math.min(p.maxMana, p.mana + m);
      this.floatingTexts.push(new FloatingText('+' + m + ' MANA', p.pos.clone(), CYAN, 1.4));
    } else if (r < 0.80) {
      const c = this._awardCredits(3 + Math.floor(Math.random() * 4));   // 3..6 (×Grid Investor)
      this.floatingTexts.push(new FloatingText('+' + c + ' GRID CREDITS', p.pos.clone(), GREEN, 1.4));
    } else {
      const n = 2 + Math.floor(Math.random() * 2);    // 2..3 loose cores to secure
      for (let i = 0; i < n; i++) {
        const off = new Vec2(randomRange(-40, 40), randomRange(-40, 40));
        this.groundCores.push(new DataCore(this._clampPickupPos(p.pos.clone().add(off)), rollCoreType()));
      }
      this.floatingTexts.push(new FloatingText('+' + n + ' CORES', p.pos.clone(), YELLOW, 1.4));
    }
  }

  // Endless Grid Cache +8-cores chance: base 50%, +5% per Cache Scanner meta level, capped 90%.
  _endlessCacheBonusChance() {
    return Math.min(0.9, 0.5 + this.meta.getLevel('cacheScanner') * 0.05);
  }

  // Safely grant cores toward the 4 Nexus matrices. Fills the player's carry slots first (up to
  // maxCarry, neutral Silver value 3), then drops any remainder as a SMALL controlled ground
  // cluster routed through the normal pickup→deposit pipeline. Never bypasses matrices, respects
  // the carry cap, and the bounded count (≤ amount) prevents any ground-core flood.
  addCarriedCoresSafe(amount) {
    const p = this.player;
    let added = 0;
    while (added < amount && p.carry < p.maxCarry) {
      p.carry++;
      p.carriedCores.push(3);   // Silver value — keeps the gold/silver deposit mechanic intact
      added++;
    }
    for (let i = added; i < amount; i++) {
      const off = new Vec2(randomRange(-50, 50), randomRange(-50, 50));
      this.groundCores.push(new DataCore(this._clampPickupPos(p.pos.clone().add(off)), rollCoreType()));
    }
  }

  // Keep a pickup comfortably inside the reachable play area (well away from edges so
  // HP/Mana/cores are never stranded outside where the player can travel).
  _clampPickupPos(pos) {
    const mx = 120, myTop = 150, myBot = 120;
    pos.x = clamp(pos.x, mx, WORLD_W - mx);
    pos.y = clamp(pos.y, myTop, WORLD_H - myBot);
    return pos;
  }

  _updateHealthPickups(dt) {
    const PICKUP_R = 16;
    const mag = this.player.pickupRadius * this.mutations.pickupRadiusMult * 1.7 + 48;   // magnet range
    for (let i = this.healthPickups.length - 1; i >= 0; i--) {
      const hp = this.healthPickups[i];
      const d = distance(this.player.pos, hp.pos);
      if (d < mag) hp.pos.addMut(safeNormalize(this.player.pos.sub(hp.pos)).scale(460 * dt));   // pull toward player

      if (d < PLAYER_RADIUS + PICKUP_R) {
        const heal = this.player.maxHp * 0.25;
        this.player.hp = this.player.hp >= this.player.maxHp   // never clip overheal
          ? this.player.hp
          : Math.min(this.player.maxHp, this.player.hp + heal);
        this.floatingTexts.push(new FloatingText('+25% HP', this.player.pos.clone(), RED, 1.2));
        this.particles.spawnCorePickup(hp.pos, RED);
        this.audio?.playCorePickup();
        this.healthPickups.splice(i, 1);
        continue;
      }

      hp.timer -= dt;
      if (hp.timer <= 0) this.healthPickups.splice(i, 1);
    }
  }

  _updateManaPickups(dt) {
    const PICKUP_R = 16;
    const mag = this.player.pickupRadius * this.mutations.pickupRadiusMult * 1.7 + 48;   // magnet range
    // Collect
    for (let i = this.manaPickups.length - 1; i >= 0; i--) {
      const m = this.manaPickups[i];
      if (distance(this.player.pos, m.pos) < mag) m.pos.addMut(safeNormalize(this.player.pos.sub(m.pos)).scale(460 * dt));   // pull toward player
      if (distance(this.player.pos, m.pos) < PLAYER_RADIUS + PICKUP_R) {
        const mg = Math.round(25 * this.mutations.manaGainMult);   // MANA DROUGHT (×1 outside Endless)
        this.player.mana = Math.min(this.player.maxMana, this.player.mana + mg);
        this.floatingTexts.push(new FloatingText('+' + mg + ' MANA', this.player.pos.clone(), CYAN, 1.2));
        this.particles.spawnCorePickup(m.pos, CYAN);
        this.audio?.playCorePickup();
        this.manaPickups.splice(i, 1);
      }
    }
    // Time-based spawn — one every 30s, only while mana < 100 and none already present (no spam/dupes)
    this.manaPickupTimer -= dt;
    if (this.manaPickupTimer <= 0) {
      this.manaPickupTimer = 30;
      if (this.player.mana < this.player.maxMana && this.manaPickups.length === 0) {
        const ang = Math.random() * Math.PI * 2;
        const r   = randomRange(140, 240);
        const pos = this._clampPickupPos(new Vec2(
          this.player.pos.x + Math.cos(ang) * r,
          this.player.pos.y + Math.sin(ang) * r,
        ));
        this.manaPickups.push({ pos });
      }
    }
  }

  // Drawn inside the camera-space block (translate handles the camera offset) → raw world coords.
  _drawHealthPickups(ctx) {
    const R = 16;
    const now = performance.now() / 1000;
    for (const hp of this.healthPickups) {
      const x = hp.pos.x;
      const y = hp.pos.y;
      // Pronounced blink so it stays readable in late-game chaos (abs-sine = on/off pulse).
      const blink = 0.45 + 0.55 * Math.abs(Math.sin(now * 4 + x * 0.05));
      const scale = 1 + 0.12 * blink;

      // Strong blinking red halo + outer beacon ring
      drawGlow(ctx, x, y, (R + 14) * scale, RED, 0.55 * blink);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * blink;
      ctx.strokeStyle = '#ff7a8c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R + 6 * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // Disc with a bold readable outline
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle   = '#3a0c12';
      ctx.fill();
      ctx.lineWidth   = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.lineWidth   = 2;
      ctx.strokeStyle = RED;
      ctx.beginPath(); ctx.arc(x, y, R - 2, 0, Math.PI * 2); ctx.stroke();

      // White cyber-cross (med icon)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 7, y - 2.5, 14, 5);
      ctx.fillRect(x - 2.5, y - 7, 5, 14);
    }
  }

  // Cyan mana pickup — visually distinct from the red/white HP cross (world-space).
  _drawManaPickups(ctx) {
    const R = 16;
    const now = performance.now() / 1000;
    const MANA_BLUE = '#3aa0ff';   // support = blue (distinct from player-ability cyan)
    for (const m of this.manaPickups) {
      const x = m.pos.x, y = m.pos.y;
      // Pronounced blink (offset phase from HP so the two never sync) for late-game readability.
      const blink = 0.45 + 0.55 * Math.abs(Math.sin(now * 3.4 + x * 0.05 + 1.6));
      const scale = 1 + 0.12 * blink;

      // Strong blinking blue halo + outer beacon ring
      drawGlow(ctx, x, y, (R + 14) * scale, MANA_BLUE, 0.55 * blink);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * blink;
      ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R + 6 * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // Disc with a bold readable outline
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle   = '#06283a';
      ctx.fill();
      ctx.lineWidth   = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.lineWidth   = 2;
      ctx.strokeStyle = MANA_BLUE;
      ctx.beginPath(); ctx.arc(x, y, R - 2, 0, Math.PI * 2); ctx.stroke();

      // White diamond rune (rotated square) — distinct from the HP cross
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle   = '#ffffff';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
  }

  _drawGridCacheArrow(ctx) {
    if (!this.gridCache) return;
    if (this.endless) return;   // Endless: drop the grid-cache side-arrow (crate pickup unchanged; Act 1 keeps it)

    // Convert world position → screen position (account for the view zoom)
    const sx = (this.gridCache.pos.x - this.camera.x) * this._viewScale;
    const sy = (this.gridCache.pos.y - this.camera.y) * this._viewScale;

    const HUD_H  = 44;
    const MARGIN = 28;
    const A_SIZE = 14;
    const blink  = 0.65 + 0.35 * Math.sin(Date.now() / 300);  // floored so it never fully fades

    const onScreen = sx >= MARGIN && sx <= WIDTH - MARGIN &&
                     sy >= HUD_H + MARGIN && sy <= HEIGHT - MARGIN;

    ctx.save();
    ctx.globalAlpha = blink;

    if (onScreen) {
      // ▼ bright cyan triangle pointing down at the crate, with glow, gold outline, and label
      const S   = 16;
      const bob = Math.sin(Date.now() / 200) * 4;   // gentle vertical bob
      const ax  = sx;
      const ay  = sy - 40 + bob;
      drawGlow(ctx, ax, ay - S * 0.6, S * 1.6, CYAN, 0.35 * blink);
      ctx.fillStyle   = CYAN;
      ctx.strokeStyle = YELLOW;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(ax,     ay);
      ctx.lineTo(ax - S, ay - S * 1.2);
      ctx.lineTo(ax + S, ay - S * 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // "GRID CACHE" label above the arrow (dark shadow for readability)
      ctx.font      = 'bold 11px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText('GRID CACHE', ax + 1, ay - S * 1.2 - 5);
      ctx.fillStyle = YELLOW;
      ctx.fillText('GRID CACHE', ax,     ay - S * 1.2 - 6);
      ctx.textAlign = 'left';
    } else {
      // Edge indicator — clamp to screen bounds, rotate toward crate
      const ex    = Math.max(MARGIN, Math.min(WIDTH  - MARGIN, sx));
      const ey    = Math.max(HUD_H + MARGIN, Math.min(HEIGHT - MARGIN, sy));
      const angle = Math.atan2(sy - ey, sx - ex);

      // Rotated yellow triangle
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(angle);
      ctx.fillStyle = YELLOW;
      ctx.beginPath();
      ctx.moveTo( A_SIZE + 4,  0);
      ctx.lineTo(-A_SIZE,     -A_SIZE * 0.65);
      ctx.lineTo(-A_SIZE,      A_SIZE * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Label (drawn un-rotated)
      ctx.font      = 'bold 11px Consolas, monospace';
      ctx.fillStyle = YELLOW;
      ctx.textAlign = 'center';
      ctx.fillText('GRID CACHE', ex, ey - A_SIZE - 4);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  // ── Readability: a clear, always-on-top marker pinned above the player so they are never lost
  // in the neon crowd. Drawn in WORLD space at the END of the camera block (above all effects).
  // Visual only — no gameplay effect.
  _drawPlayerMarker(ctx) {
    const p = this.player;
    if (!p || this.gameOver) return;
    const now   = Date.now();
    const x     = p.pos.x;                         // centered above the character
    const bob   = Math.sin(now / 500) * 1.5;       // gentle vertical drift
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now / 420));  // soft 0.55→1.0 blink
    // Small downward chevron sitting clearly ABOVE the head (sprite top ≈ pos.y - 32),
    // its tip pointing down at the player. Visual only — no gameplay effect.
    const halfW = 6, h = 10;
    const tipY  = p.pos.y - 44 + bob;              // bottom tip (points down toward the head)
    ctx.save();
    ctx.globalAlpha = pulse;
    drawGlow(ctx, x, tipY - h / 2, 7, '#8fefff', 0.35);
    ctx.fillStyle   = '#bdf4ff';
    ctx.strokeStyle = 'rgba(0,10,20,0.6)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(x,         tipY);                   // tip down
    ctx.lineTo(x - halfW, tipY - h);
    ctx.lineTo(x + halfW, tipY - h);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ── Readability/onboarding: contextual wayfinding arrow (screen-space). Carrying cores → points
  // to the nearest Nexus (where to deposit). With no cores, only during the early game → points to
  // the nearest ground core (what to grab). Reuses the grid-cache edge-arrow style. Visual only.
  _drawObjectiveIndicators(ctx) {
    if (this.gameOver || this.victory || this.upgradeUI) return;
    if (this.endless) return;   // Endless: drop the wayfinding side-arrow (kept for Act 1 onboarding)
    const p = this.player; if (!p) return;
    let target = null, label = '', col = CYAN;
    if (p.carry > 0 && this.matrices.length) {
      let best = Infinity;
      for (const m of this.matrices) { const d = distance(p.pos, m.pos); if (d < best) { best = d; target = m.pos; } }
      label = 'DEPOSIT'; col = '#7CFF8A';
    } else if (p.carry === 0 && this.timeAlive < 80 && this.groundCores.length) {
      let best = Infinity;
      for (const c of this.groundCores) { const d = distance(p.pos, c.pos); if (d < best) { best = d; target = c.pos; } }
      label = 'CORE'; col = YELLOW;
    }
    if (target) this._drawEdgeArrow(ctx, target, label, col);
  }

  // Small edge arrow toward a world target — only shown when the target is OFF-screen (on-screen
  // targets need no arrow). Clamped to the screen edge and rotated toward the target.
  _drawEdgeArrow(ctx, worldPos, label, color) {
    const sx = (worldPos.x - this.camera.x) * this._viewScale;
    const sy = (worldPos.y - this.camera.y) * this._viewScale;
    const HUD_H = 44, M = 34;
    if (sx >= M && sx <= WIDTH - M && sy >= HUD_H + M && sy <= HEIGHT - M) return;
    const ex  = Math.max(M, Math.min(WIDTH - M, sx));
    const ey  = Math.max(HUD_H + M, Math.min(HEIGHT - M, sy));
    const ang = Math.atan2(sy - ey, sx - ex);
    const blink = 0.7 + 0.3 * Math.sin(Date.now() / 300);
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -8); ctx.lineTo(-10, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = blink; ctx.font = 'bold 10px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(label, ex + 1, ey - 15);
    ctx.fillStyle = color;             ctx.fillText(label, ex,     ey - 16);
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  // ── First-minute onboarding (Act 1 only): a clear objective callout + rotating core/Overload
  // hints that fade out within the first minute. Screen-space, non-blocking (top band under the
  // HUD bar). Purely informational — never blocks input or changes gameplay.
  _drawOnboarding(ctx) {
    if (this.endless || this.gameOver || this.victory || this.upgradeUI) return;
    const t = this.timeAlive;
    if (t > 62) return;
    ctx.save();
    ctx.textAlign = 'center';
    // Objective title — bold for the first ~5s, then fades.
    const titleA = t < 5 ? 1 : Math.max(0, 1 - (t - 5) / 2.5);
    if (titleA > 0.01) {
      ctx.globalAlpha = titleA;
      ctx.font = 'bold 26px Consolas, monospace';
      ctx.shadowColor = CYAN; ctx.shadowBlur = 12; ctx.fillStyle = CYAN;
      ctx.fillText('DEFEND THE NEXUS GRID', WIDTH / 2, 92);
      ctx.shadowBlur = 0;
    }
    // Rotating hints (after the title) — each fades in/out; all stop by ~26s.
    const hints = [
      'Recover Data-Cores and return them to a Nexus',
      'Network Overload rises if the grid is left undefended',
      'Keep Overload below 100% — hold the Nexus Grid',
    ];
    if (t > 6) {
      const span = 6.5;
      const idx  = Math.floor((t - 6) / span);
      if (idx < hints.length) {
        const lt = (t - 6) - idx * span;
        const ha = Math.min(1, lt / 0.6) * Math.min(1, (span - lt) / 0.8);
        if (ha > 0.01) {
          ctx.globalAlpha = Math.max(0, ha);
          ctx.font = '15px Consolas, monospace';
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(hints[idx], WIDTH / 2 + 1, 119);
          ctx.fillStyle = '#cfe8ff';         ctx.fillText(hints[idx], WIDTH / 2,     118);
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  _updateStartMenu(input) {
    const { keys } = input;
    if (keys.has('arrowup') || keys.has('w')) {
      this.menuIndex = (this.menuIndex - 1 + this.menuItems.length) % this.menuItems.length;
      keys.delete('arrowup');
      keys.delete('w');
    }
    if (keys.has('arrowdown') || keys.has('s')) {
      this.menuIndex = (this.menuIndex + 1) % this.menuItems.length;
      keys.delete('arrowdown');
      keys.delete('s');
    }
    if (keys.has('enter') || keys.has(' ')) {
      this._selectMenuItem(this.menuItems[this.menuIndex]);
      keys.delete('enter');
      keys.delete(' ');
    }
  }

  // Name-based menu dispatch (shared by keyboard + mouse) so item order can change safely.
  _selectMenuItem(item) {
    if (item === 'START GAME' || item === 'CHARACTER SELECT') this.goToCharacterSelect();
    else if (item === 'ENDLESS MODE')   this.startEndlessRun();
    else if (item === 'UPGRADES')       this.goToUpgradesScreen();
    else if (item === 'ACHIEVEMENTS')   this.goToAchievementsScreen();
    else if (item === 'INSTRUCTIONS')   this.goToInstructions();
    else if (item === 'AUDIO SETTINGS') this.goToAudioSettings();
    else if (item === 'CREDITS')        this.goToCredits();
    else if (item === 'EXIT') { try { window.close(); } catch (e) {} this.goToExitScreen(); }
  }

  _updateCharacterSelect(input) {
    const { keys } = input;
    if (keys.has('arrowleft') || keys.has('a')) {
      this.characterIndex = (this.characterIndex - 1 + this.characters.length) % this.characters.length;
      keys.delete('arrowleft');
      keys.delete('a');
    }
    if (keys.has('arrowright') || keys.has('d')) {
      this.characterIndex = (this.characterIndex + 1) % this.characters.length;
      keys.delete('arrowright');
      keys.delete('d');
    }
    // Up/Down (or W/S) toggle the equipped outfit for the highlighted character.
    // setSelectedOutfit is a no-op when the secret outfit is still locked.
    if (keys.has('arrowup') || keys.has('arrowdown') || keys.has('w') || keys.has('s')) {
      const charId = this.characters[this.characterIndex].id;
      const next   = this.meta.getSelectedOutfit(charId) === 'default' ? 'secret' : 'default';
      this.meta.setSelectedOutfit(charId, next);
      ['arrowup', 'arrowdown', 'w', 's'].forEach(k => keys.delete(k));
    }
    if (keys.has('enter') || keys.has(' ')) {
      const charId = this.characters[this.characterIndex].id;
      this.selectCharacter(charId);
      keys.delete('enter');
      keys.delete(' ');
    }
    if (keys.has('escape')) {
      this.goToMainMenu();
      keys.delete('escape');
    }
  }

  // Shared geometry for the Character-Select outfit toggle (top-centre, clear of the
  // character cards so a click here equips an outfit instead of starting the run).
  _outfitBtnRects() {
    const bw = 150, bh = 32, gap = 16, y = 150;
    const x0 = Math.round(WIDTH / 2 - (bw * 2 + gap) / 2);
    return {
      defaultRect: { x: x0,             y, w: bw, h: bh },
      secretRect:  { x: x0 + bw + gap,  y, w: bw, h: bh },
    };
  }

  _updateExitScreen(input) {
    const { keys } = input;
    if (keys.has('enter') || keys.has('escape')) {
      this.goToMainMenu();
      keys.delete('enter');
      keys.delete('escape');
    }
  }

  // ─── Audio Settings screen ───────────────────────────────────────────────────
  _audioRects() {
    const TW = 440;
    const tx = Math.round((WIDTH - TW) / 2);
    const rows = [
      { key: 'master', label: 'MASTER VOLUME' },
      { key: 'music',  label: 'MUSIC VOLUME'  },
      { key: 'sfx',    label: 'SFX VOLUME'    },
    ];
    const startY = 240, gap = 78;
    const sliders = rows.map((r, i) => {
      const ty = startY + i * gap;
      return { ...r, tx, ty, tw: TW, y0: ty - 26, y1: ty + 26 };
    });
    const backRect = { x: Math.round((WIDTH - 160) / 2), y: startY + 3 * gap + 6, w: 160, h: 44 };
    return { sliders, backRect };
  }

  _audioVolumeFor(key) {
    const a = this.audio;
    if (key === 'master') return a?.masterVolume ?? 1.0;
    if (key === 'music')  return a?.musicVolume  ?? 0.70;
    return a?.sfxVolume ?? 0.80;
  }

  _setAudioVolume(key, v) {
    if (!this.audio) return;
    if      (key === 'master') this.audio.setMasterVolume(v);
    else if (key === 'music')  this.audio.setMusicVolume(v);
    else if (key === 'sfx')    this.audio.setSfxVolume(v);
  }

  _updateAudioSettings(input) {
    const { keys, mousePos, mouseDown } = input;
    const { sliders, backRect } = this._audioRects();

    // Mouse: set/drag the slider whose horizontal band holds the cursor.
    if (mouseDown && this.audio) {
      for (let i = 0; i < sliders.length; i++) {
        const s = sliders[i];
        if (mousePos.y >= s.y0 && mousePos.y <= s.y1 &&
            mousePos.x >= s.tx - 14 && mousePos.x <= s.tx + s.tw + 14) {
          const v = Math.max(0, Math.min(1, (mousePos.x - s.tx) / s.tw));
          this._setAudioVolume(s.key, v);
          this._audioSelIndex = i;
          break;
        }
      }
    }

    // BACK button — rising edge only, so a drag does not trigger it.
    if (mouseDown && !this._prevMouseDown && this._inRect(mousePos, backRect)) {
      this.goToMainMenu();
    }
    this._prevMouseDown = mouseDown;

    // Keyboard: ↑/↓ select row, ←/→ adjust by 5%, ESC back.
    if (keys.has('arrowup') || keys.has('w')) {
      this._audioSelIndex = (this._audioSelIndex + sliders.length - 1) % sliders.length;
      keys.delete('arrowup'); keys.delete('w');
    }
    if (keys.has('arrowdown') || keys.has('s')) {
      this._audioSelIndex = (this._audioSelIndex + 1) % sliders.length;
      keys.delete('arrowdown'); keys.delete('s');
    }
    if (keys.has('arrowleft') || keys.has('a')) {
      const s = sliders[this._audioSelIndex];
      this._setAudioVolume(s.key, this._audioVolumeFor(s.key) - 0.05);
      keys.delete('arrowleft'); keys.delete('a');
    }
    if (keys.has('arrowright') || keys.has('d')) {
      const s = sliders[this._audioSelIndex];
      this._setAudioVolume(s.key, this._audioVolumeFor(s.key) + 0.05);
      keys.delete('arrowright'); keys.delete('d');
    }
    if (keys.has('escape')) {
      this.goToMainMenu();
      keys.delete('escape');
    }
  }

  _drawAudioSettings(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font      = 'bold 40px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('AUDIO SETTINGS', WIDTH / 2, 120);

    const { sliders, backRect } = this._audioRects();

    for (let i = 0; i < sliders.length; i++) {
      const s        = sliders[i];
      const v        = this._audioVolumeFor(s.key);
      const selected = i === this._audioSelIndex;
      const th       = 8;

      // Label + percent readout
      ctx.font      = 'bold 18px Consolas, monospace';
      ctx.fillStyle = selected ? CYAN : WHITE;
      ctx.textAlign = 'left';
      ctx.fillText(s.label, s.tx, s.ty - 16);
      ctx.textAlign = 'right';
      ctx.fillStyle = YELLOW;
      ctx.fillText(`${Math.round(v * 100)}%`, s.tx + s.tw, s.ty - 16);

      // Track + filled portion + border
      ctx.fillStyle = '#1a2a3a';
      ctx.fillRect(s.tx, s.ty - th / 2, s.tw, th);
      ctx.fillStyle = selected ? CYAN : '#2a6a8a';
      ctx.fillRect(s.tx, s.ty - th / 2, s.tw * v, th);
      ctx.strokeStyle = selected ? CYAN : '#2a4060';
      ctx.lineWidth   = selected ? 2 : 1;
      ctx.strokeRect(s.tx, s.ty - th / 2, s.tw, th);

      // Handle
      const hx = s.tx + s.tw * v;
      ctx.fillStyle = selected ? CYAN : WHITE;
      ctx.fillRect(hx - 5, s.ty - 12, 10, 24);
    }

    // Mute status / hint
    ctx.font      = '14px Consolas, monospace';
    ctx.textAlign = 'center';
    if (this.audio?.muted) {
      ctx.fillStyle = '#ff6a6a';
      ctx.fillText('MUTED — press M to unmute', WIDTH / 2, backRect.y - 22);
    } else {
      ctx.fillStyle = 'rgba(200,200,200,0.6)';
      ctx.fillText('Press M to mute      Drag sliders, or ↑↓ select / ← → adjust', WIDTH / 2, backRect.y - 22);
    }

    // BACK button
    ctx.fillStyle = '#0a0f20';
    ctx.fillRect(backRect.x, backRect.y, backRect.w, backRect.h);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(backRect.x, backRect.y, backRect.w, backRect.h);
    ctx.font      = 'bold 18px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('BACK', backRect.x + backRect.w / 2, backRect.y + 28);

    ctx.textAlign = 'left';
  }

  _handleAutoShooting() {
    // Auto-fire at the existing cadence — only when a valid target exists (never into empty space).
    if (this.player.selectedCharacter === 'euclid_vector') return;   // his weapon IS the toxin kit (ToxicSniper), not the base shot
    if (!this.player.canShoot()) return;
    if (!this.aimAssist) return;                          // T still toggles auto-fire on/off
    const target = this._autoTarget(this.player.pos, 750); // wide, screen-aware detection
    if (!target) return;                                  // no enemy/boss/carrier in range → hold fire
    const proj = this.player.shoot(target.pos);
    // Assassin Clone: her base auto-shot IS the Arrow (visible arrow sprite via Player.attackMap,
    // rotated to its travel direction — no orb). Her retired Twin-Dagger mastery card now feeds the
    // arrow (+1 damage/level), so the card is never a dead pick. Same projectile that always existed.
    if (this.player.selectedCharacter === 'assassin_clone') {
      proj.damage += this._cardLvl('assassin_clone_twin_dagger_mastery');
    }
    // Japan Phasewalker — Phase Shard Mastery feeds his automatic phase-needle (+1 dmg/level).
    if (this.player.selectedCharacter === 'japan_phasewalker') {
      proj.damage += this._cardLvl('phasewalker_phase_shard_mastery');
    }
    this.projectiles.push(proj);
    this.audio?.playShoot();
  }

  _autoTarget(from, range) {
    // Nearest valid target (enemy or live boss) within range, preferring an in-range Data-Core
    // carrier (same priority the Homing Disc uses) so core theft is punished. Not global damage —
    // this only selects ONE aim target; projectiles still travel and hit normally.
    let best = null,    bestDist = range;
    let carrier = null, carrierDist = range;
    for (const e of this.enemies) {
      const d = distance(from, e.pos);
      if (d < bestDist) { bestDist = d; best = e; }
      if (e.carryingCore && d < carrierDist) { carrierDist = d; carrier = e; }
    }
    // Include live bosses / mini-bosses if closer than current best
    for (const boss of [this.titanBoss, this.annihilatorBoss, this.bloodfangBoss]) {
      if (boss && boss.hp > 0) {
        const d = distance(from, boss.pos);
        if (d < bestDist) { bestDist = d; best = boss; }
      }
    }
    return carrier || best;   // prefer an in-range core carrier, else nearest enemy/boss
  }

  spawnEnemyBullet(pos, dir, speed, damage, radius, color, opts = {}) {
    speed *= this.mutations.enemyBulletSpeedMult;   // ACCELERATED ROUNDS (1.0 outside Endless)
    this.enemyBullets.push({ pos, dir: dir.clone(), speed, damage, radius, color, life: 4.0, stun: opts.stun || 0 });
  }

  _updateEnemyBullets(dt) {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.pos.addMut(b.dir.scale(b.speed * dt));
      b.life -= dt;

      if (b.life <= 0 || b.pos.x < -60 || b.pos.x > WIDTH + 60 ||
          b.pos.y < -60 || b.pos.y > HEIGHT + 60) {
        this.enemyBullets.splice(i, 1);
        continue;
      }

      // Hit player — routed through the shared fairness gate (dash/Phoenix i-frames + 0.5s grace
      // + per-hit ceiling). While dashing the gate returns false, so the bullet is NOT consumed
      // and passes through — a true dodge.
      if (distance(b.pos, this.player.pos) < b.radius + PLAYER_RADIUS) {
        if (this._damagePlayer(b.damage, { color: RED, shake: 5 })) {
          if (b.stun) this.player.applyBite({ stagger: b.stun });   // telegraphed stun bolt — anti-lock immunity inside applyBite
          this.audio?.playEnemyProjectileImpact();
          this.enemyBullets.splice(i, 1);
        }
      }
    }
  }

  _handleCorePickupAndSlotting(dt) {
    for (let i = this.groundCores.length - 1; i >= 0; i--) {
      const core = this.groundCores[i];
      const d    = distance(core.pos, this.player.pos);

      if (d < this.player.pickupRadius * this.mutations.pickupRadiusMult * 1.7 + 48 && this.player.carry < this.player.maxCarry) {   // wider magnet (Tractor Beam scales pickupRadius); MAGNET DECAY read-site only
        const pull = safeNormalize(this.player.pos.sub(core.pos));
        core.pos.addMut(pull.scale(460 * dt));   // pull is enemy-independent (never stops near foes)

        if (d < PLAYER_RADIUS + CORE_RADIUS + 8) {
          this.groundCores.splice(i, 1);
          this.player.carry++;
          this.player.carriedCores.push(core.value ?? 3);   // remember gold/silver value
          this.overload = Math.max(0, this.overload - OVERLOAD_PICKUP_REDUCTION);
          this.floatingTexts.push(new FloatingText('CORE VACUUMED', this.player.pos.clone(), core.color || CYAN, 0.8));
          this.particles.spawnCorePickup(core.pos, core.color);
          this.audio?.playCorePickup();
        }
      }
    }

    if (this.player.carry > 0) {
      for (const matrix of this.matrices) {
        if (this.player.carry <= 0) break;
        if (matrix.hasSpace() && distance(this.player.pos, matrix.pos) < this.player.returnRadius) {
          const value = this.player.carriedCores.shift() ?? 3;   // Gold = 5, Silver = 3
          matrix.slotCore(value);
          this.player.carry--;
          this.player.coresSecured++;
          this.overload = Math.max(0, this.overload - OVERLOAD_SLOT_REDUCTION);
          this.player.gainXp(2, this.floatingTexts);
          const isGold = value >= 5;
          this.floatingTexts.push(new FloatingText('+' + value + ' MATRIX',
            matrix.pos.clone(), isGold ? '#ffd23c' : GREEN, 0.9));
          this.particles.spawnCoreSlot(matrix.pos, isGold ? '#ffd23c' : matrix.color);
          this.audio?.playCoreSlot();
          this.score += 25;
          // Matrix RNG bonus: ~22% of deposits award a variable Grid Credit cache (2–5).
          if (Math.random() < 0.22) {
            const c = this._awardCredits(2 + Math.floor(Math.random() * 4));   // 2..5
            this.floatingTexts.push(new FloatingText('+' + c + ' GRID CREDITS',
              new Vec2(matrix.pos.x, matrix.pos.y - 22), GREEN, 1.4));
          }
        }
      }
    }
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);

      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (distance(p.pos, e.pos) < p.radius + e.radius) {
          const cryo = this.player.upgrades['Cryo Rounds'] || 0;
          const supp = this.player.upgrades['Suppression'] || 0;
          // Glacial Shatter triggers off enemies ALREADY slowed before this hit (true
          // frost-build synergy), so capture the slow state before Cryo refreshes it.
          const wasSlowed  = e.slowTimer > 0 && !e.isBoss() && !e.isMegaBoss;
          const shatterPos = e.pos.clone();
          if ((cryo > 0 || supp > 0) && !e.isBoss() && !e.isMegaBoss) {
            e.slowTimer  = Math.max(e.slowTimer, 0.8 + 0.3 * cryo + 0.25 * supp);  // Suppression = longer
            e.slowFactor = clamp(0.55 - 0.08 * supp, 0.30, 0.55);                  // Suppression = stronger
          }
          // Primary-fire soft cap: bosses/mega bosses absorb only capped DPS (normal enemies unaffected).
          const pm = this._primaryMasteryLvl();
          const baseDmg = (e.isBoss() || e.isMegaBoss) ? this._capBossDamage(e, p.damage) : p.damage;
          e.takeHit(baseDmg * (1 + 0.12 * pm), this);
          if (pm > 0) this.particles.spawnHitSparks(e.pos, this._primarySparkColor());  // char-matched primary spark
          this._tryCorrode(e);
          if (wasSlowed) this._glacialShatter(shatterPos, e);
          this.projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }

      // Check titan hit
      if (!hit && this.titanBoss && this.titanBoss.hp > 0 &&
          distance(p.pos, this.titanBoss.pos) < p.radius + this.titanBoss.radius) {
        const titanDmg = this._capBossDamage(this.titanBoss, p.damage);
        this.titanBoss.hp      -= titanDmg;
        this.titanBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + Math.round(titanDmg), this.titanBoss.pos.add(new Vec2(randomRange(-10, 10), -this.titanBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, PURPLE);
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.titanBoss.hp <= 0) this._titanDie();
      }

      // Check Matrix Annihilator hit
      if (!hit && this.annihilatorBoss && this.annihilatorBoss.hp > 0 &&
          distance(p.pos, this.annihilatorBoss.pos) < p.radius + this.annihilatorBoss.radius) {
        const annihDmg = this._capBossDamage(this.annihilatorBoss, p.damage);
        this.annihilatorBoss.hp      -= annihDmg;
        this.annihilatorBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + Math.round(annihDmg), this.annihilatorBoss.pos.add(new Vec2(randomRange(-10, 10), -this.annihilatorBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, RED);
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.annihilatorBoss.hp <= 0) this._annihilatorDie();
      }

      // Check Bloodfang Packmaster hit
      if (!hit && this.bloodfangBoss && this.bloodfangBoss.hp > 0 &&
          distance(p.pos, this.bloodfangBoss.pos) < p.radius + this.bloodfangBoss.radius) {
        const bloodfangDmg = this._capBossDamage(this.bloodfangBoss, p.damage);
        this.bloodfangBoss.hp      -= bloodfangDmg;
        this.bloodfangBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + Math.round(bloodfangDmg), this.bloodfangBoss.pos.add(new Vec2(randomRange(-10, 10), -this.bloodfangBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, RED);
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.bloodfangBoss.hp <= 0) this._bloodfangDie();
      }

      if (!hit && !p.alive()) this.projectiles.splice(i, 1);
    }
  }

  // ── Glacial Shatter card ──────────────────────────────────────────────────
  // Rolled when a shot lands on an already-slowed enemy: a frost burst that deals
  // bounded AoE damage to nearby normal enemies and briefly slows them. Bosses are
  // immune (consistent with the Cryo/Suppression slow rules), so no boss-death path here.
  _glacialShatter(originPos, source) {
    const lvl = this.player.upgrades['Glacial Shatter'] || 0;
    if (lvl === 0) return;
    if (Math.random() >= 0.25 + 0.15 * lvl) return;   // L1 .40 / L2 .55 / L3 .70

    const radius = 70 + 10 * lvl;
    const dmg    = 10 + 6 * lvl;

    for (const e of this.enemies.slice()) {            // snapshot: takeHit can splice this.enemies
      if (e === source || e.isBoss() || e.isMegaBoss) continue;
      if (distance(originPos, e.pos) > radius + e.radius) continue;
      e.slowTimer  = Math.max(e.slowTimer, 1.0);
      e.slowFactor = Math.min(e.slowFactor, 0.45);
      e.takeHit(dmg, this);
    }

    // Frost burst visual (matches existing _specialRings ring structure)
    this._specialRings.push({ pos: originPos.clone(), radius: 0, maxRadius: radius,
                              life: 0.35, maxLife: 0.35, color1: CYAN, color2: '#ffffff' });
    this.particles.spawnExplosion(originPos, [CYAN, '#aaddff', '#ffffff'], 16);
    this.floatingTexts.push(new FloatingText('SHATTER', new Vec2(originPos.x, originPos.y - 28), CYAN, 0.9));
  }

  _updateHomingDiscs(dt) {
    if (this.player.upgrades['Homing Disc'] === 0) return;

    this.player.homingDiscTimer -= dt;
    if (this.player.homingDiscTimer <= 0) {
      this.player.homingDiscTimer = Math.max(1.5, 4.0 - this.player.upgrades['Homing Disc'] * 0.5);
      const carriers = this.enemies.filter(e => e.carryingCore);
      if (carriers.length > 0) {
        const target = carriers.reduce((a, b) =>
          distance(this.player.pos, a.pos) < distance(this.player.pos, b.pos) ? a : b
        );
        this.homingDiscs.push(new HomingDisc(this.player.pos.clone(), target));
      }
    }

    for (let i = this.homingDiscs.length - 1; i >= 0; i--) {
      const disc = this.homingDiscs[i];
      disc.update(dt, this.enemies);

      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (distance(disc.pos, e.pos) < disc.radius + e.radius) {
          const discDmg = (e.isBoss() || e.isMegaBoss) ? this._capBossDamage(e, disc.damage) : disc.damage;
          e.takeHit(discDmg, this);
          this.homingDiscs.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (!hit && !disc.alive()) this.homingDiscs.splice(i, 1);
    }
  }

  // ── Chain Lightning Laser ─────────────────────────────────────────────────
  // Automatic secondary weapon: a fast electric-blue bolt that hits the nearest enemy and
  // then chains to up to 3 more nearby enemies. Damage is applied on the visible impact of
  // each link (no enemies vanishing early). Lightweight: a few short-lived bolts/links only.
  _updateChainLightning(dt) {
    this._chainTimer -= dt;
    if (this._chainTimer <= 0) {
      this._chainTimer = this._fireChainLightning() ? 1.5 : 0.25;   // retry soon if nothing in range
    }

    // Lead bolts travel player → first target; on arrival, hit it and spawn the staggered jumps
    for (let i = this._chainBolts.length - 1; i >= 0; i--) {
      const b = this._chainBolts[i];
      b.t += dt;
      const f = Math.min(1, b.t / b.travelTime);
      b.x = b.fromX + (b.toX - b.fromX) * f;
      b.y = b.fromY + (b.toY - b.fromY) * f;
      if (b.t >= b.travelTime) {
        this._chainHit(b.chain[0]);                       // first target — damage + spark on arrival
        for (let k = 0; k < b.chain.length - 1; k++) {    // queue the jumps t0→t1→t2→t3
          const a = b.chain[k], c = b.chain[k + 1];
          const offsets = [(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14];
          this._chainLinks.push({ ax: a.x, ay: a.y, bx: c.x, by: c.y, target: c,
                                  delay: (k + 1) * 0.05, life: 0.10, struck: false, offsets });
        }
        this._chainBolts.splice(i, 1);
      }
    }

    // Links activate at their stagger delay (damage + spark synced to the visible jump), then fade
    for (let i = this._chainLinks.length - 1; i >= 0; i--) {
      const L = this._chainLinks[i];
      if (!L.struck) {
        L.delay -= dt;
        if (L.delay <= 0) { L.struck = true; this._chainHit(L.target); }
      } else {
        L.life -= dt;
        if (L.life <= 0) this._chainLinks.splice(i, 1);
      }
    }
  }

  // Returns true if a bolt was fired (a target existed in range).
  _fireChainLightning() {
    const p = this.player;
    // Chain Lightning is the Skeleton Warrior's signature secondary only. Cyber Arm Hero uses the
    // Neon Pierce Beam and Neon Taekwondo Girl uses the Aqua Spirit Trail instead, so both are
    // gated off here (code kept intact for the Skeleton / future use).
    if (p.selectedCharacter !== 'skeleton_warrior') return false;
    const FIRST_RANGE = 520, JUMP_RADIUS = 240, BOLT_SPEED = 1200;
    const BOUNCES = 3 + this._cardLvl('skeleton_chain_lightning_mastery');   // +1 fork per level
    let first = null, bestD = FIRST_RANGE;
    for (const e of this.enemies) {
      const d = distance(p.pos, e.pos);
      if (d < bestD) { bestD = d; first = e; }
    }
    if (!first) return false;
    // Build the chain: nearest unchosen enemy within JUMP_RADIUS of the last link
    const chosen = [first];
    let last = first;
    for (let j = 0; j < BOUNCES; j++) {
      let next = null, nd = JUMP_RADIUS;
      for (const e of this.enemies) {
        if (chosen.includes(e)) continue;
        const d = distance(last.pos, e.pos);
        if (d < nd) { nd = d; next = e; }
      }
      if (!next) break;
      chosen.push(next); last = next;
    }
    const chain = chosen.map(e => ({ x: e.pos.x, y: e.pos.y, enemy: e }));   // snapshot positions
    const d0 = distance(p.pos, first.pos);
    this._chainBolts.push({ fromX: p.pos.x, fromY: p.pos.y, toX: first.pos.x, toY: first.pos.y,
                            x: p.pos.x, y: p.pos.y, t: 0, travelTime: Math.max(0.05, d0 / BOLT_SPEED), chain });
    return true;
  }

  // Apply chain damage to a node {x,y,enemy} and pop a small spark at the visible hit point.
  _chainHit(node) {
    if (!node) return;
    const e = node.enemy;
    if (e && e.hp > 0 && this.enemies.includes(e)) {
      const cm  = 1 + 0.15 * this._cardLvl('skeleton_chain_lightning_mastery');
      const dmg = ((e.isBoss() || e.isMegaBoss) ? 8 : 25) * cm;   // reduced vs bosses so it never melts them
      e.takeHit(dmg, this);
      this._tryCorrode(e);
    }
    this.particles.spawnHitSparks(new Vec2(node.x, node.y), CYAN, 7, 3);   // larger spark for readability
  }

  _drawChainLightning(ctx) {
    if (this._chainBolts.length === 0 && this._chainLinks.length === 0) return;
    const time = performance.now() * 0.001;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Lead bolts — electric-blue projectile: wide glow + cyan core + white head + halo
    for (const b of this._chainBolts) {
      const dx = b.toX - b.fromX, dy = b.toY - b.fromY;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const tailX = b.x - ux * 20, tailY = b.y - uy * 20;
      ctx.globalAlpha = 0.4; ctx.strokeStyle = '#1f6bff'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = '#3ad0ff'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 1;   ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x - ux * 8, b.y - uy * 8); ctx.lineTo(b.x, b.y); ctx.stroke();
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 10);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(58,160,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
    }

    // Chain links — animated jagged lightning with glow + white core + branch forks + node flash
    for (const L of this._chainLinks) {
      if (!L.struck) continue;
      const a   = Math.max(0, L.life / 0.10);
      const dx  = L.bx - L.ax, dy = L.by - L.ay;
      const nl  = Math.hypot(dx, dy) || 1;
      const px  = -dy / nl, py = dx / nl;
      const SEG = 8, pts = [];
      for (let i = 0; i <= SEG; i++) {
        const f  = i / SEG;
        const oi = f * (L.offsets.length - 1), lo = Math.floor(oi), fr = oi - lo;
        const base = L.offsets[Math.min(lo, L.offsets.length - 1)] * (1 - fr)
                   + L.offsets[Math.min(lo + 1, L.offsets.length - 1)] * fr;
        const env  = Math.sin(Math.PI * f);                       // 0 at ends, 1 mid
        const jit  = Math.sin(time * 40 + i * 1.7) * 6 * env;
        const off  = (base + jit);
        pts.push({ x: L.ax + dx * f + px * off, y: L.ay + dy * f + py * off });
      }
      const strokeChain = (w, col, al) => {
        ctx.globalAlpha = al * a; ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };
      strokeChain(9, '#1f6bff', 0.35);   // outer glow
      strokeChain(4.5, '#3ad0ff', 0.8);  // blue body
      strokeChain(1.8, '#ffffff', 1);    // white core
      // short branch forks off the middle
      ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#9fe6ff'; ctx.lineWidth = 1.4;
      for (let k = 2; k < SEG - 1; k += 3) {
        const o = pts[k], dir = (L.offsets[0] > 0 ? 1 : -1);
        ctx.beginPath(); ctx.moveTo(o.x, o.y);
        ctx.lineTo(o.x + px * dir * 14, o.y + py * dir * 14);
        ctx.stroke();
      }
      // node flashes at both ends
      for (const nd of [pts[0], pts[pts.length - 1]]) {
        const ng = ctx.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, 12);
        ng.addColorStop(0, `rgba(255,255,255,${a})`); ng.addColorStop(1, 'rgba(58,208,255,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = ng;
        ctx.beginPath(); ctx.arc(nd.x, nd.y, 12, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ── Neon Pierce Beam ──────────────────────────────────────────────────────
  // Cyber Arm Hero's automatic secondary weapon: a straight RED laser from the cyber arm that
  // pierces every enemy on one line (each hit once). No bounce, no chain, no jump, not an ultimate.
  _updateNeonPierceBeam(dt) {
    // Advance + retire short-lived beam visuals
    for (const b of this._neonBeams) b.life -= dt;
    if (this._neonBeams.length) this._neonBeams = this._neonBeams.filter(b => b.life > 0);

    if (this.player.selectedCharacter !== 'cyber_arm_hero') return;   // Cyber Arm Hero only
    this._neonBeamTimer -= dt;
    if (this._neonBeamTimer <= 0) {
      this._neonBeamTimer = this._fireNeonPierceBeam() ? 1.5 : 0.25;  // retry soon if nothing in range
    }
  }

  // Returns true if the beam fired (a valid target existed in range).
  _fireNeonPierceBeam() {
    const p = this.player;
    const nm = this._cardLvl('cyber_neon_pierce_mastery');   // Neon Lance: wider + stronger
    const RANGE = 800, WIDTH = 22 * (1 + 0.20 * nm), DMG = 20 * (1 + 0.15 * nm);

    // Candidates: array enemies + any present singleton mini-boss object
    const singles = [
      this.titanBoss       && this.titanBoss.hp       > 0 ? { obj: this.titanBoss,       die: this._titanDie }       : null,
      this.annihilatorBoss && this.annihilatorBoss.hp > 0 ? { obj: this.annihilatorBoss, die: this._annihilatorDie } : null,
      this.bloodfangBoss   && this.bloodfangBoss.hp   > 0 ? { obj: this.bloodfangBoss,   die: this._bloodfangDie }   : null,
    ].filter(Boolean);

    // Nearest valid target within range sets the beam direction
    let target = null, bestD = RANGE;
    for (const e of this.enemies)  { const d = distance(p.pos, e.pos);     if (d < bestD) { bestD = d; target = e.pos; } }
    for (const s of singles)       { const d = distance(p.pos, s.obj.pos); if (d < bestD) { bestD = d; target = s.obj.pos; } }
    if (!target) return false;

    const aimDir = safeNormalize(new Vec2(target.x - p.pos.x, target.y - p.pos.y));

    // Straight-line pierce test (reused from Overdrive Beam): along/perp vs the beam segment.
    const onBeam = (pos, radius) => {
      const toE   = pos.sub(p.pos);
      const along = toE.dot(aimDir);
      if (along < 0 || along > RANGE) return false;
      const perp  = toE.sub(aimDir.scale(along));
      return perp.lengthSq() < (WIDTH + radius) ** 2;
    };
    const tierDmg = (isMega, isMini) => isMega ? DMG * 0.4 : isMini ? DMG * 0.6 : DMG;  // 8 / 12 / 20

    // Damage each enemy on the line at most once
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!onBeam(e.pos, e.radius)) continue;
      const d = tierDmg(e.isMegaBoss, e.isBoss() && !e.isMegaBoss);
      e.takeHit(d, this);
      this._tryCorrode(e);
      this.particles.spawnHitSparks(e.pos, RED);
    }
    // Singleton mini-bosses on the line (reduced damage, safe death routing)
    for (const s of singles) {
      const b = s.obj;
      if (b.hp <= 0 || !onBeam(b.pos, b.radius)) continue;
      b.hp -= tierDmg(false, true); b.hitFlash = 0.08;
      this.particles.spawnHitSparks(b.pos, RED);
      if (b.hp <= 0) s.die.call(this);
    }

    // One short-lived visual originating from the cyber arm
    const startPos = new Vec2(p.pos.x + aimDir.x * 16, p.pos.y + aimDir.y * 16);
    this._neonBeams.push({ startPos, dir: aimDir, length: RANGE, life: 0.15, maxLife: 0.15, boost: nm });
    this.audio?.playHit?.();
    return true;
  }

  // World-space red pierce beam — layered glow + white-hot core + electric forks,
  // traveling energy pulse, muzzle flash with sparks, and an impact flare. Visual only.
  _drawNeonPierceBeam(ctx) {
    if (!this._neonBeams.length) return;
    const spr   = this._neonBeamSprite;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    const now   = performance.now() * 0.001;
    ctx.save();
    ctx.lineCap = 'round';
    for (const b of this._neonBeams) {
      const alpha = Math.max(0, b.life / b.maxLife);              // 1 → 0
      const sx = b.startPos.x, sy = b.startPos.y;
      const ex = sx + b.dir.x * b.length, ey = sy + b.dir.y * b.length;
      const ang = Math.atan2(b.dir.y, b.dir.x);
      const px = -b.dir.y, py = b.dir.x;                          // perpendicular unit
      const bw = 1 + 0.35 * (b.boost || 0);                       // Neon Lance widening

      ctx.globalCompositeOperation = 'lighter';

      // 1) wide soft outer glow
      ctx.globalAlpha = 0.32 * alpha;
      ctx.strokeStyle = '#ff1a1a'; ctx.lineWidth = 22 * bw * (0.6 + 0.4 * alpha);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      // 2) red body
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 10 * bw * alpha + 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      // 3) white-hot core
      ctx.strokeStyle = '#fff0f0'; ctx.lineWidth = Math.max(1.5, 3.5 * bw * alpha);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();

      // 4) electric forks branching off the beam
      const forks = 5 + (b.boost || 0);
      ctx.strokeStyle = '#ff8a8a'; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.6 * alpha;
      for (let i = 0; i < forks; i++) {
        const f = ((i + (now * 7 % 1)) / forks);
        const bxp = sx + (ex - sx) * f, byp = sy + (ey - sy) * f;
        const side = (i % 2 ? 1 : -1), len = (8 + Math.random() * 18) * bw;
        const mx = bxp + px * side * len * 0.5 + b.dir.x * (Math.random() * 10 - 5);
        const my = byp + py * side * len * 0.5 + b.dir.y * (Math.random() * 10 - 5);
        const tx = bxp + px * side * len + (Math.random() * 8 - 4);
        const ty = byp + py * side * len + (Math.random() * 8 - 4);
        ctx.beginPath(); ctx.moveTo(bxp, byp); ctx.lineTo(mx, my); ctx.lineTo(tx, ty); ctx.stroke();
      }

      // 5) traveling energy pulse (sweeps origin → tip as the beam ages)
      const pt = 1 - alpha, pxp = sx + (ex - sx) * pt, pyp = sy + (ey - sy) * pt;
      let g = ctx.createRadialGradient(pxp, pyp, 0, pxp, pyp, 18 * bw);
      g.addColorStop(0, `rgba(255,230,230,${0.9 * alpha})`); g.addColorStop(1, 'rgba(255,40,40,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(pxp, pyp, 18 * bw, 0, Math.PI * 2); ctx.fill();

      // 6) muzzle flash + radiating sparks at the cyber arm
      g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 34 * bw);
      g.addColorStop(0, `rgba(255,140,140,${0.95 * alpha})`);
      g.addColorStop(0.5, `rgba(255,40,40,${0.5 * alpha})`);
      g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 34 * bw, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.8 * alpha; ctx.strokeStyle = '#ffd2d2'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const sa = ang + (i / 6) * Math.PI * 2, rr = 14 + Math.random() * 14;
        ctx.beginPath(); ctx.moveTo(sx + Math.cos(sa) * 6, sy + Math.sin(sa) * 6);
        ctx.lineTo(sx + Math.cos(sa) * rr, sy + Math.sin(sa) * rr); ctx.stroke();
      }

      // 7) impact flare at the far end + expanding ring
      ctx.globalAlpha = 1;
      g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 26 * bw);
      g.addColorStop(0, `rgba(255,210,210,${0.9 * alpha})`); g.addColorStop(1, 'rgba(255,30,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, 26 * bw, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7 * alpha; ctx.strokeStyle = '#ff6a6a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, (1 - alpha) * 40 * bw + 6, 0, Math.PI * 2); ctx.stroke();

      // optional asset muzzle on top (kept)
      if (ready) {
        const dh = 60, dw = dh * (spr.naturalWidth / spr.naturalHeight);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha;
        ctx.translate(sx, sy); ctx.rotate(ang);
        ctx.drawImage(spr, -dw * 0.15, -dh / 2, dw, dh);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BRAWLER WARRIOR weapons (Phase 1). Every per-frame method guards on
  // selectedCharacter === 'brawler_warrior', so the other 3 characters are unaffected.
  // Damage routes through e.takeHit / singleton mini-boss hp like the other weapons; bosses
  // take reduced damage so nothing is one-shot.
  // ════════════════════════════════════════════════════════════════════════════

  // Uniform list of damageable targets: array enemies + present singleton mini-bosses.
  _brawlerTargets() {
    const list = [];
    for (const e of this.enemies) list.push({ obj: e, arr: true });
    const singles = [
      [this.titanBoss,       this._titanDie],
      [this.annihilatorBoss, this._annihilatorDie],
      [this.bloodfangBoss,   this._bloodfangDie],
    ];
    for (const [b, die] of singles) if (b && b.hp > 0) list.push({ obj: b, arr: false, die });
    return list;
  }

  _targetIsBoss(t) { return t.arr ? (t.obj.isMegaBoss || t.obj.isBoss()) : true; }

  // Apply a hit (array enemy via takeHit; singleton mini-boss via hp + death routing).
  _brawlerHit(t, dmg, color) {
    const b = t.obj;
    if (t.arr) {
      b.takeHit(dmg, this);
      this._tryCorrode(b);
    } else {
      b.hp -= dmg; b.hitFlash = 0.08;
      if (b.hp <= 0) t.die.call(this);
    }
    this.particles.spawnHitSparks(b.pos, color);
  }

  // ── Upgrade-card helpers + corrosive (Phase 1) ──────────────────────────────
  _cardLvl(key) { return this.player.upgrades[key] || 0; }

  // Level of the SELECTED character's primary mastery card (originals only; brawler uses chakram).
  _primaryMasteryLvl() {
    const c = this.player.selectedCharacter;
    if (c === 'skeleton_warrior') return this._cardLvl('skeleton_primary_mastery');
    if (c === 'cyber_arm_hero')   return this._cardLvl('cyber_primary_mastery');
    if (c === 'taekwondo_girl')   return this._cardLvl('taekwondo_primary_mastery');
    return 0;
  }
  // Character-matched primary hit spark color (electric / cyber / aqua).
  _primarySparkColor() {
    const c = this.player.selectedCharacter;
    if (c === 'cyber_arm_hero') return '#ff8a3c';
    if (c === 'taekwondo_girl') return '#14ebd2';
    return '#bfe6ff';   // skeleton blue-white
  }

  // Corrosive Payload: a modest chance for a player hit to apply the existing corrosive DoT.
  _tryCorrode(e) {
    const lvl = this._cardLvl('corrosive_payload');
    if (lvl <= 0 || !e || e.hp <= 0) return;
    if (Math.random() < 0.18 * lvl) {
      e._corrosiveTimer = Math.max(e._corrosiveTimer || 0, 3.0);
      this.particles?.spawnHitSparks?.(e.pos, '#7CFF3C');   // acid-green corrosion splash
    }
  }
  // Centralized corrosive DoT (reuses _corrosiveTimer + _resistDot). Base 1 dmg/s keeps existing
  // drone-applied corrosion identical; Corrosive Payload scales it up. Acid-green bubbling visuals.
  _updateCorrosive(dt) {
    const dps = 1 + 3 * this._cardLvl('corrosive_payload');
    const tick = (t) => {
      if (!t || t.hp <= 0 || !(t._corrosiveTimer > 0)) return;
      t._corrosiveTimer -= dt;
      t.hp -= this._resistDot(t, dps * dt);
      if (Math.random() < dt * 5) this.particles?.spawnHitSparks?.(t.pos, '#7CFF3C');
    };
    for (const e of this.enemies) tick(e);
    tick(this.titanBoss); tick(this.annihilatorBoss); tick(this.bloodfangBoss);
    if (this.titanBoss       && this.titanBoss.hp       <= 0) this._titanDie();
    if (this.annihilatorBoss && this.annihilatorBoss.hp <= 0) this._annihilatorDie();
    if (this.bloodfangBoss   && this.bloodfangBoss.hp   <= 0) this._bloodfangDie();
  }

  // ── Primary: Nexus Chakram ──────────────────────────────────────────────────
  // Throws a spinning energy chakram at the nearest enemy; it flies out (piercing) then
  // returns to the player, damaging on both legs. NOT chain lightning — one travelling disc.
  _updateNexusChakram(dt) {
    if (this._chakrams.length) this._advanceChakrams(dt);   // let in-flight discs finish cleanly
    if (this.player.selectedCharacter !== 'brawler_warrior') return;
    this._chakramTimer -= dt;
    if (this._chakramTimer <= 0) {
      this._chakramTimer = this._fireNexusChakram() ? 1.15 : 0.25;   // retry soon if no target
    }
  }

  _fireNexusChakram() {
    const p = this.player, RANGE = 620;
    let target = null, bestD = RANGE;
    for (const t of this._brawlerTargets()) {
      const d = distance(p.pos, t.obj.pos);
      if (d < bestD) { bestD = d; target = t.obj.pos; }
    }
    if (!target) return false;
    const dir = safeNormalize(new Vec2(target.x - p.pos.x, target.y - p.pos.y));
    const km = this._cardLvl('brawler_chakram_mastery');   // Razor Chakram: +1 pierce, brighter
    this._chakrams.push({ pos: p.pos.clone(), dir, phase: 'out', dist: 0, maxDist: RANGE,
                          speed: 520, dmg: 22, pierceLeft: 3 + km, ang: 0, hit: new Set(), boost: km });
    this.audio?.playShoot?.();
    return true;
  }

  _advanceChakrams(dt) {
    const p = this.player, R = 26;
    for (let i = this._chakrams.length - 1; i >= 0; i--) {
      const c = this._chakrams[i];
      c.ang += dt * 18;   // spin
      if (c.phase === 'out') {
        c.pos.addMut(c.dir.scale(c.speed * dt));
        c.dist += c.speed * dt;
        if (c.dist >= c.maxDist || c.pierceLeft <= 0) { c.phase = 'return'; c.hit.clear(); }
      } else {
        const toP = new Vec2(p.pos.x - c.pos.x, p.pos.y - c.pos.y);
        if (toP.length() < 34) { this._chakrams.splice(i, 1); continue; }   // caught by player
        c.dir = safeNormalize(toP);
        c.pos.addMut(c.dir.scale(c.speed * dt));
      }
      const retMult = c.phase === 'return' ? (0.7 + 0.12 * (c.boost || 0)) : 1.0;   // stronger return per level
      for (const t of this._brawlerTargets()) {
        const b = t.obj;
        if (c.hit.has(b)) continue;
        if (distance(c.pos, b.pos) > R + b.radius) continue;
        c.hit.add(b);
        this._brawlerHit(t, (this._targetIsBoss(t) ? 0.5 : 1) * c.dmg * retMult, '#1fd6a6');
        if (c.phase === 'out' && --c.pierceLeft <= 0) break;
      }
    }
  }

  _drawChakrams(ctx) {
    if (!this._chakrams.length) return;
    const spr = this._weaponImages?.nexus_chakram;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    for (const c of this._chakrams) {
      ctx.save();
      ctx.translate(c.pos.x, c.pos.y); ctx.rotate(c.ang);
      if (c.boost) {   // Razor Chakram: brighter spinning green/cyan ring trail
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#34ff9e'; ctx.lineWidth = 2 + c.boost;
        ctx.beginPath(); ctx.arc(0, 0, 24 + c.boost * 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      if (ready) {
        ctx.drawImage(spr, -26, -26, 52, 52);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#1fd6a6'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#bdfff0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 1.4); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Secondary: Crescent Rift Claw ───────────────────────────────────────────
  // Periodic crescent slash in front of the brawler — cone CC that knocks back / stuns close
  // normal enemies. Reuses the Sonic Pulse cone logic. Not full-screen, weaker than the ultimate.
  _updateCrescentClaw(dt) {
    for (const s of this._crescentSlashes) s.life -= dt;
    if (this._crescentSlashes.length) this._crescentSlashes = this._crescentSlashes.filter(s => s.life > 0);
    if (this.player.selectedCharacter !== 'brawler_warrior') return;
    this._crescentTimer -= dt;
    if (this._crescentTimer > 0) return;
    const rm = this._cardLvl('brawler_crescent_claw_mastery');   // Rift Render: larger + faster
    this._crescentTimer = 3.2 - 0.3 * rm;

    const p = this.player;
    const aimDir = safeNormalize(p.lastFacingDir || new Vec2(1, 0));
    const RANGE = 145 * (1 + 0.12 * rm), halfCone = ((100 + 8 * rm) * Math.PI / 180) / 2, KB = 230;
    let hits = 0;
    for (const t of this._brawlerTargets()) {
      if (hits >= 10) break;
      const b = t.obj;
      const to = new Vec2(b.pos.x - p.pos.x, b.pos.y - p.pos.y);
      if (to.length() > RANGE + b.radius) continue;
      if (Math.acos(clamp(aimDir.dot(safeNormalize(to)), -1, 1)) > halfCone) continue;
      hits++;
      this._brawlerHit(t, (this._targetIsBoss(t) ? 0.55 : 1) * 34, '#1fd6a6');
      if (t.arr && !this._targetIsBoss(t)) {        // knockback/stun only normal array enemies
        b.vel.addMut(safeNormalize(to).scale(KB));
        b.stunned = Math.max(b.stunned, 0.25);
      }
    }
    this._crescentSlashes.push({ pos: p.pos.clone(), dir: aimDir, range: RANGE, half: halfCone, life: 0.22, maxLife: 0.22 });
    this.audio?.playHit?.();
  }

  _drawCrescentSlashes(ctx) {
    if (!this._crescentSlashes.length) return;
    const spr = this._weaponImages?.crescent_rift_claw;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    for (const s of this._crescentSlashes) {
      const a = Math.max(0, s.life / s.maxLife);
      ctx.save();
      ctx.translate(s.pos.x, s.pos.y); ctx.rotate(Math.atan2(s.dir.y, s.dir.x));
      ctx.globalAlpha = a;
      if (ready) {
        const h = s.range * 1.7, w = h * (spr.naturalWidth / spr.naturalHeight);
        ctx.drawImage(spr, -w * 0.1, -h / 2, w, h);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#1fd6a6'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, 0, s.range * 0.8, -s.half, s.half); ctx.stroke();
        ctx.strokeStyle = '#bdfff0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, s.range * 0.8, -s.half, s.half); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ── Ultimate: Skyfall Lances (SPACE, 100 mana) ──────────────────────────────
  // Vertical energy lances rain around the player / dense clusters over several waves, each a
  // small impact AoE. Clears groups; bosses take reduced damage so they are not one-shot.
  activateSkyfallLances() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'brawler_warrior') return;     // Brawler Warrior only
    if (this._skyfall) return;                                  // already running
    if (p.mana < ULTIMATE_MANA_COST) {                          // same NOT-ENOUGH-MANA behavior as other ultimates
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;                               // fixed 100 cost; Mana Core overflow banks toward next cast
    this._skyfall = { t: 0, waveTimer: 0, wave: 0 };
    this.screenShake.trigger(4, 0.3);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('SKYFALL LANCES!', p.pos.clone(), '#1fd6a6', 1.4));
  }

  _updateSkyfall(dt) {
    for (const im of this._skyfallImpacts) im.life -= dt;
    if (this._skyfallImpacts.length) this._skyfallImpacts = this._skyfallImpacts.filter(im => im.life > 0);
    const sf = this._skyfall;
    if (!sf) return;
    const lm = this._cardLvl('brawler_skyfall_lances_mastery');   // Lance Storm: extra lances + wider impact
    const DURATION = 3.5, WAVES = 5, PER_WAVE = 7 + lm, DMG = 42, RADIUS = 70 * (1 + 0.12 * lm);
    const interval = DURATION / WAVES;
    sf.t += dt; sf.waveTimer -= dt;
    if (sf.wave < WAVES && sf.waveTimer <= 0) {
      sf.waveTimer = interval; sf.wave++;
      const p = this.player;
      for (let i = 0; i < PER_WAVE; i++) {
        let cx, cy;
        if (this.enemies.length && Math.random() < 0.6) {
          const e = this.enemies[Math.floor(Math.random() * this.enemies.length)];
          cx = e.pos.x + randomRange(-50, 50); cy = e.pos.y + randomRange(-50, 50);
        } else {
          cx = p.pos.x + randomRange(-260, 260); cy = p.pos.y + randomRange(-200, 200);
        }
        const center = new Vec2(cx, cy);
        for (const t of this._brawlerTargets()) {
          if (distance(center, t.obj.pos) > RADIUS + t.obj.radius) continue;
          this._brawlerHit(t, (this._targetIsBoss(t) ? 0.65 : 1) * DMG, '#34ff9e');
        }
        this._skyfallImpacts.push({ pos: center, r: RADIUS, life: 0.45, maxLife: 0.45 });
      }
      this.screenShake.trigger(3, 0.18);
    }
    if (sf.t >= DURATION && sf.wave >= WAVES) this._skyfall = null;
  }

  _drawSkyfall(ctx) {
    if (!this._skyfallImpacts.length) return;
    const spr = this._weaponImages?.skyfall_lances;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    for (const im of this._skyfallImpacts) {
      const a = Math.max(0, im.life / im.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      if (ready) {
        const h = 150, w = h * (spr.naturalWidth / spr.naturalHeight), drop = (1 - a) * 40;
        ctx.drawImage(spr, im.pos.x - w / 2, im.pos.y - h + drop, w, h);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#34ff9e'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(im.pos.x, im.pos.y - 120); ctx.lineTo(im.pos.x, im.pos.y); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = '#1fd6a6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(im.pos.x, im.pos.y, im.r * (1 - a * 0.4), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ASSASSIN CLONE weapons (Phase 1). Every per-frame method guards on
  // selectedCharacter === 'assassin_clone', so the other 4 characters are unaffected.
  // Damage routes through the shared _brawlerTargets/_brawlerHit helpers (generic target
  // plumbing despite the name); bosses take reduced damage so nothing is one-shot.
  // ════════════════════════════════════════════════════════════════════════════

  // ── Bounce weapon: Plasma Shuriken ──────────────────────────────────────────
  // Periodically throws a spinning shuriken at the nearest enemy; on each hit it ricochets to the
  // next-nearest UNHIT enemy, hitting up to 3 enemies total, then expires. Reuses the shared
  // _brawlerTargets/_brawlerHit helpers (boss damage reduced). Cadence (1.4s) + damage match the
  // old secondary so power is unchanged; the assassin_clone_whip_sword_mastery card still scales it.
  // Pure sprite visual — no glow/laser/orb.
  _updateShuriken(dt) {
    if (this._shurikens.length) this._advanceShurikens(dt);     // let in-flight shurikens finish
    if (this.player.selectedCharacter !== 'assassin_clone') return;
    this._shurikenTimer -= dt;
    if (this._shurikenTimer > 0) return;

    const wm = this._cardLvl('assassin_clone_whip_sword_mastery');   // (card kept; now feeds shuriken)
    const p = this.player, RANGE = 460 * (1 + 0.12 * wm);
    const first = this._nearestTarget(p.pos, RANGE, null);
    if (!first) { this._shurikenTimer = 0.25; return; }              // hold, retry soon
    this._shurikenTimer = 1.4;                                       // unchanged cadence
    this._shurikens.push({
      pos: p.pos.clone(), target: first, hit: new Set(),
      bouncesLeft: 3, dmg: 26 * (1 + 0.16 * wm), speed: 540, ang: 0, life: 2.5,
    });
    this.audio?.playShoot?.();
  }

  // Nearest damageable target wrapper ({obj,arr,die}) to `from` within `range`, excluding any
  // enemy objects already in the `exclude` Set (or null). Reuses the generic _brawlerTargets list.
  _nearestTarget(from, range, exclude) {
    let best = null, bestD = range;
    for (const t of this._brawlerTargets()) {
      if (exclude && exclude.has(t.obj)) continue;
      const d = distance(from, t.obj.pos);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  _advanceShurikens(dt) {
    for (let i = this._shurikens.length - 1; i >= 0; i--) {
      const s = this._shurikens[i];
      s.ang  += dt * 22;          // fast spin
      s.life -= dt;
      // Re-acquire if the current target is gone/dead/already hit.
      if (!s.target || s.hit.has(s.target.obj) || s.target.obj.hp <= 0) {
        s.target = this._nearestTarget(s.pos, 380, s.hit);
      }
      if (!s.target || s.bouncesLeft <= 0 || s.life <= 0) { this._shurikens.splice(i, 1); continue; }
      const tp  = s.target.obj.pos;
      const dir = safeNormalize(new Vec2(tp.x - s.pos.x, tp.y - s.pos.y));
      s.pos.addMut(dir.scale(s.speed * dt));
      if (distance(s.pos, tp) <= s.target.obj.radius + 16) {        // ── hit → bounce
        this._brawlerHit(s.target, (this._targetIsBoss(s.target) ? 0.55 : 1) * s.dmg, '#ff4dd2');
        s.hit.add(s.target.obj);
        s.bouncesLeft--;
        s.target = s.bouncesLeft > 0 ? this._nearestTarget(s.pos, 380, s.hit) : null;
        if (!s.target) { this._shurikens.splice(i, 1); continue; }
      }
    }
  }

  _drawShuriken(ctx) {
    if (!this._shurikens.length) return;
    const spr = this._weaponImages?.suriken_assasin;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    for (const s of this._shurikens) {
      ctx.save();
      ctx.translate(s.pos.x, s.pos.y); ctx.rotate(s.ang);
      if (ready) {
        const sz = 34;
        ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);   // spinning shuriken sprite (no glow/orb)
      } else {
        ctx.strokeStyle = '#ff4dd2'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Ultimate: Chrome Phantom Protocol (SPACE, 100 mana) ─────────────────────
  // Dual-clone assault. Pink phantom + chrome mirror clones flank the assassin while pulsing
  // burst slashes around her over a short duration, then a wider final chrome impact. Bosses
  // take reduced damage so they are not one-shot. Same fixed 100-mana cost as other ultimates.
  activateChromePhantomProtocol() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'assassin_clone') return;       // Assassin Clone only
    if (this._chromePhantom) return;                            // already running
    if (p.mana < ULTIMATE_MANA_COST) {                          // same NOT-ENOUGH-MANA behavior as other ultimates
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), '#ff4dd2', 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;                               // fixed 100 cost; Mana Core overflow banks toward next cast
    this._chromePhantom = { t: 0, pulseTimer: 0, pulse: 0, finalDone: false };
    this.screenShake.trigger(4, 0.3);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('CHROME PHANTOM PROTOCOL!', p.pos.clone(), '#ff4dd2', 1.4));
  }

  _updateChromePhantom(dt) {
    for (const f of this._chromeFx) { f.life -= dt; f.r += (f.dr || 0) * dt; }
    if (this._chromeFx.length) this._chromeFx = this._chromeFx.filter(f => f.life > 0);
    const cp = this._chromePhantom;
    if (!cp) return;
    const p = this.player;
    const cm = this._cardLvl('assassin_clone_chrome_phantom_mastery');   // Chrome Phantom Mastery
    const DURATION = 3.0 + 0.4 * cm, RADIUS = 200 * (1 + 0.12 * cm), PULSE_GAP = 0.4, DMG = 28;
    cp.t += dt; cp.pulseTimer -= dt;
    if (cp.pulseTimer <= 0 && cp.t < DURATION) {
      cp.pulseTimer = PULSE_GAP; cp.pulse++;
      for (const t of this._brawlerTargets()) {
        if (distance(p.pos, t.obj.pos) > RADIUS + t.obj.radius) continue;
        this._brawlerHit(t, (this._targetIsBoss(t) ? 0.6 : 1) * DMG, cp.pulse % 2 ? '#ff4dd2' : '#cfd6e0');
      }
      this._chromeFx.push({ pos: p.pos.clone(), r: RADIUS * 0.4, dr: RADIUS * 1.6, life: 0.4, maxLife: 0.4,
                            color: cp.pulse % 2 ? '#ff4dd2' : '#cfd6e0' });
      this.screenShake.trigger(2, 0.12);
    }
    if (!cp.finalDone && cp.t >= DURATION) {   // wider final chrome-mirror impact pulse
      cp.finalDone = true;
      const FR = RADIUS * 1.35;
      for (const t of this._brawlerTargets()) {
        if (distance(p.pos, t.obj.pos) > FR + t.obj.radius) continue;
        this._brawlerHit(t, (this._targetIsBoss(t) ? 0.6 : 1) * DMG * 1.5, '#cfd6e0');
      }
      this._chromeFx.push({ pos: p.pos.clone(), r: FR * 0.5, dr: FR * 1.4, life: 0.5, maxLife: 0.5, color: '#ffd0f4' });
      this.screenShake.trigger(4, 0.2);
      this._chromePhantom = null;
    }
  }

  _drawChromePhantom(ctx) {
    for (const f of this._chromeFx) {   // expanding fade rings (burst / slash pulses)
      const a = Math.max(0, f.life / f.maxLife);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.strokeStyle = f.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(f.pos.x, f.pos.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const cp = this._chromePhantom;
    if (!cp) { ctx.globalAlpha = 1; return; }
    const p = this.player;
    // Two orbiting clone overlays flanking the player: pink phantom + chrome mirror.
    const orbit = 56, ang = cp.t * 6;
    const clones = [
      { spr: this._assassinPhantomSprite, ox: Math.cos(ang) * orbit,            oy: Math.sin(ang) * orbit,            tint: '#ff4dd2' },
      { spr: this._assassinChromeSprite,  ox: Math.cos(ang + Math.PI) * orbit,  oy: Math.sin(ang + Math.PI) * orbit,  tint: '#cfd6e0' },
    ];
    for (const c of clones) {
      const cx = p.pos.x + c.ox, cy = p.pos.y + c.oy;
      // Soft tinted glow behind the clone so both read clearly against late-game crowds.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30;
      const glow = ctx.createRadialGradient(cx, cy - 30, 4, cx, cy - 30, 46);
      glow.addColorStop(0, c.tint); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx, cy - 30, 46, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.9;
      if (c.spr && c.spr.complete && c.spr.naturalWidth > 0) {
        const h = 80, w = h * (c.spr.naturalWidth / c.spr.naturalHeight);
        ctx.shadowColor = c.tint; ctx.shadowBlur = 14;
        ctx.drawImage(c.spr, cx - w / 2, cy - h, w, h);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = c.tint;
        ctx.beginPath(); ctx.ellipse(cx, cy - 18, 16, 34, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ── Aqua Spirit Trail (Neon Taekwondo Girl secondary) ───────────────────────
  // Passive: while she MOVES she leaves cyan spirit-water puddles. Enemies standing in a
  // puddle take gradual, capped damage. Bosses take heavily reduced damage. No knockback,
  // no instant kills, count-limited for performance. Standing still spawns nothing.
  _updateAquaTrail(dt) {
    const AQUA_TICK = 0.25, AQUA_CAP = 16;  // per-tick + per-enemy/per-puddle cap
    const AQUA_NORMAL_TICK = 2.0 * (1 + 0.2 * this._cardLvl('taekwondo_aqua_trail_mastery'));  // Spirit Current: harder

    // Advance + retire puddles, and apply DoT (runs for any character so leftover puddles still fade)
    const puddles = this._aquaPuddles;
    for (let i = puddles.length - 1; i >= 0; i--) {
      const pud = puddles[i];
      pud.t += dt;
      if (pud.t >= pud.life) { puddles.splice(i, 1); continue; }
      pud.dmgTimer -= dt;
      if (pud.dmgTimer <= 0) {
        pud.dmgTimer = AQUA_TICK;
        this._applyAquaPuddleDamage(pud, AQUA_NORMAL_TICK, AQUA_CAP);
      }
    }

    if (this.player.selectedCharacter !== 'taekwondo_girl') return;
    return;   // Aqua Spirit Trail disabled — replaced by Spirit Crescent Kicks

    // Spawn only while actually moving (ignore tiny jitter) — never while standing still.
    if (this.player.vel.lengthSq() < 25 * 25) return;
    this._aquaTrailTimer -= dt;
    if (this._aquaTrailTimer <= 0) {
      this._aquaTrailTimer = 0.20;                       // every ~0.2s while moving
      if (puddles.length < 22) {                         // count cap for performance
        puddles.push({ pos: this.player.pos.clone(), t: 0, life: randomRange(3.0, 3.8),
                       radius: randomRange(38, 48), dmgTimer: 0, hits: new Map(),
                       seed: Math.random() * 6.28 });
      }
    }
  }

  _applyAquaPuddleDamage(pud, normalTick, cap) {
    const tierTick = (isMega, isMini) => isMega ? normalTick * 0.2 : isMini ? normalTick * 0.4 : normalTick;
    const tierCap  = (isMega, isMini) => isMega ? cap * 0.2 : isMini ? cap * 0.4 : cap;

    const hitOne = (obj, isMega, isMini, applyDmg) => {
      if (distance(obj.pos, pud.pos) > pud.radius + obj.radius) return;
      const done = pud.hits.get(obj) || 0;
      const lim  = tierCap(isMega, isMini);
      if (done >= lim) return;
      const dmg = Math.min(tierTick(isMega, isMini), lim - done);
      if (dmg <= 0) return;
      pud.hits.set(obj, done + dmg);
      applyDmg(dmg);
    };

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      hitOne(e, e.isMegaBoss, e.isBoss() && !e.isMegaBoss, (d) => {
        e.takeHit(this._resistDot(e, d), this);
        if (Math.random() < 0.12) this.particles.spawnHitSparks(e.pos, CYAN);
      });
    }
    // Singleton mini-bosses (reduced damage, safe death routing) — same pattern as the beam/chains
    const singles = [
      [this.titanBoss,       this._titanDie],
      [this.annihilatorBoss, this._annihilatorDie],
      [this.bloodfangBoss,   this._bloodfangDie],
    ];
    for (const [b, die] of singles) {
      if (!b || b.hp <= 0) continue;
      hitOne(b, false, true, (d) => { b.hp -= this._resistDot(b, d); b.hitFlash = 0.08; if (b.hp <= 0) die.call(this); });
    }
  }

  // Ground-layer puddles: translucent cyan/teal spirit-water with the asset texture on top.
  _drawAquaPuddles(ctx) {
    if (!this._aquaPuddles.length) return;
    const spr   = this._aquaTrailSprite;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    const now   = performance.now() / 1000;
    ctx.save();
    for (const pud of this._aquaPuddles) {
      const r    = pud.radius;
      const grow = Math.min(1, pud.t / 0.25);                       // quick fade-in
      const fade = Math.min(1, (pud.life - pud.t) / 0.8);           // fade-out over last 0.8s
      const a    = Math.max(0, Math.min(grow, fade));
      const pulse = 0.85 + 0.15 * Math.sin(now * 3 + pud.seed);

      // Soft translucent water glow (additive teal core + cyan rim)
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(pud.pos.x, pud.pos.y, r * 0.15, pud.pos.x, pud.pos.y, r);
      g.addColorStop(0,   'rgba(60,230,255,' + (0.30 * a) + ')');
      g.addColorStop(0.6, 'rgba(40,140,255,' + (0.16 * a) + ')');
      g.addColorStop(1,   'rgba(150,80,255,0)');                    // subtle purple highlight at edge
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(pud.pos.x, pud.pos.y, r * pulse, r * 0.7 * pulse, 0, 0, Math.PI * 2); ctx.fill();

      // Asset texture on top (normal blend, kept low-alpha so it reads as spirit-water footprints)
      if (ready) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.5 * a;
        const w = r * 2 * pulse, h = r * 1.5 * pulse;
        ctx.drawImage(spr, pud.pos.x - w / 2, pud.pos.y - h / 2, w, h);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // ── Spirit Crescent Kicks (Neon Taekwondo Girl auto-weapon) ──────────────────
  // Auto-fires spinning cyan crescents at the NEAREST enemies; they fly out and pierce
  // several foes. Fire rate + extra crescents scale with her primary mastery card.
  _updateSpiritKicks(dt) {
    const sk = this._spiritKicks;
    const p = this.player;

    // advance live crescents: move, spin, trail, collide, expire
    for (let i = sk.blades.length - 1; i >= 0; i--) {
      const b = sk.blades[i];
      b.t += dt; b.rot += b.spin * dt;
      b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt;
      b.trail.push({ x: b.pos.x, y: b.pos.y }); if (b.trail.length > 6) b.trail.shift();
      for (const e of this.enemies) {
        if (b.hits.has(e)) continue;
        if (distance(e.pos, b.pos) < b.radius + e.radius) {
          const boss = e.isBoss() || e.isMegaBoss;
          e.takeHit(boss ? b.bossDmg : b.dmg, this);
          this.particles.spawnHitSparks(e.pos, CYAN);
          b.hits.add(e);
          if (b.hits.size >= b.pierce) { b.dead = true; break; }
        }
      }
      if (b.dead || b.t >= b.life) sk.blades.splice(i, 1);
    }

    if (p.selectedCharacter !== 'taekwondo_girl') return;
    if (this.gameState !== 'playing' || this.paused || this.upgradeUI) return;

    // auto-fire at the nearest enemies
    sk.timer -= dt;
    if (sk.timer > 0) return;
    const lvl = this._cardLvl('taekwondo_primary_mastery');
    sk.timer = 0.70 / (1 + 0.12 * lvl);                       // faster with mastery (tunable)
    if (this.enemies.length === 0) { sk.timer = 0.12; return; }

    const count = 1 + (lvl >= 3 ? 1 : 0) + (lvl >= 6 ? 1 : 0); // extra crescents at higher mastery
    const near = this.enemies.map(e => ({ e, d: distance(e.pos, p.pos) }))
                             .sort((a, b) => a.d - b.d).slice(0, count);
    const km = this._cardLvl('taekwondo_aqua_trail_mastery');        // Spirit Pierce (0..3)
    const SPEED = 540, DMG = 26, BOSSDMG = 6, LIFE = 0.9;
    const PIERCE = 4 + km;                                            // +1 pierce / level (4 → 7)
    const HITR = 30 * (1 + 0.08 * km);                               // +8% hit arc / level
    for (let k = 0; k < count; k++) {
      const tgt = (near[k] || near[0]).e;
      let dir = safeNormalize(tgt.pos.sub(p.pos));
      if (dir.lengthSq() < 0.001) dir = (p.lastFacingDir && p.lastFacingDir.lengthSq() > 0.001)
        ? safeNormalize(p.lastFacingDir.clone()) : new Vec2(1, 0);
      sk.blades.push({
        pos: p.pos.clone(), vel: dir.scale(SPEED),
        rot: Math.atan2(dir.y, dir.x), spin: 16, t: 0, life: LIFE,
        radius: HITR, dmg: DMG, bossDmg: BOSSDMG, pierce: PIERCE,
        hits: new Set(), trail: [], dead: false,
      });
    }
  }

  _drawSpiritKicks(ctx) {
    const sk = this._spiritKicks;
    if (!sk.blades.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const b of sk.blades) {
      const a = Math.max(0, Math.min(1, (b.life - b.t) / 0.18));
      // trail
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < b.trail.length; i++) {
        const tp = b.trail[i], ta = (i + 1) / b.trail.length * 0.3 * a;
        ctx.globalAlpha = ta; ctx.fillStyle = CYAN;
        ctx.beginPath(); ctx.arc(tp.x, tp.y, b.radius * 0.5 * (0.4 + 0.6 * (i / b.trail.length)), 0, Math.PI * 2); ctx.fill();
      }
      // crescent blade
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      ctx.rotate(b.rot);
      const R = b.radius * 0.7, a0 = -2.3, a1 = 2.3;
      const arc = (w, col, al) => { ctx.globalAlpha = al * a; ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(0, 0, R, a0, a1); ctx.stroke(); };
      arc(9, '#1fd0ff', 0.40);   // glow
      arc(5, '#3ad0ff', 0.85);   // body
      arc(2, '#eaffff', 1);      // core
      ctx.globalAlpha = a; ctx.fillStyle = '#eaffff';
      for (const aa of [a0, a1]) {                 // sharp tips
        const tx = Math.cos(aa) * R, ty = Math.sin(aa) * R;
        const nx = Math.cos(aa + Math.PI / 2), ny = Math.sin(aa + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(tx + Math.cos(aa) * 6, ty + Math.sin(aa) * 6);
        ctx.lineTo(tx + nx * 3, ty + ny * 3); ctx.lineTo(tx - nx * 3, ty - ny * 3);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ── Spirit Dojang Flag ultimate (Neon Taekwondo Girl, SPACE, 100 mana) ───────
  // Plants a flag at the cast position; a 7s circular cyan dojo field damages enemies over time
  // and slightly slows normal enemies. Bosses take controlled, capped damage and are not slowed.
  activateSpiritDojang() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'taekwondo_girl') return;   // Neon Taekwondo Girl only
    if (this.spiritDojang) return;                          // already running
    if (p.mana < ULTIMATE_MANA_COST) {                      // same NOT-ENOUGH-MANA behavior as other ultimates
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;                           // fixed 100 cost; Mana Core overflow banks toward next cast
    this.spiritDojang = { pos: p.pos.clone(), t: 0, dmgTimer: 0,
                          miniDmgThisSec: 0, megaDmgThisSec: 0, bossDmgTimer: 1.0,
                          particles: [], partTimer: 0 };
    this.screenShake.trigger(4, 0.25);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('SPIRIT DOJANG FLAG!', p.pos.clone(), CYAN, 1.4));
  }

  _updateSpiritDojang(dt) {
    const sd = this.spiritDojang;
    if (!sd) return;
    const DURATION = 7, RADIUS = 205 * (1 + 0.12 * this._cardLvl('taekwondo_dojang_flag_mastery'));
    const TICK = 0.25, NORMAL_DMG = 9;       // 36 DPS to normal enemies
    const MINI_CAP = 28, MAIN_CAP = 42;      // per-second boss caps (controlled / safe)
    const SLOW = 0.30;                       // 30% slow on normal enemies inside the field

    sd.t += dt;

    // Subtle martial-arts spirit particles rising inside the field
    sd.partTimer -= dt;
    if (sd.t < DURATION - 0.3 && sd.partTimer <= 0) {
      sd.partTimer = 0.10;
      const ang = Math.random() * Math.PI * 2;
      const rr  = Math.sqrt(Math.random()) * RADIUS;
      sd.particles.push({ x: sd.pos.x + Math.cos(ang) * rr, y: sd.pos.y + Math.sin(ang) * rr,
                          life: randomRange(0.5, 0.9), maxLife: 0.9,
                          vy: randomRange(20, 40), size: randomRange(2, 4) });
    }
    for (const pt of sd.particles) { pt.life -= dt; pt.y -= pt.vy * dt; }
    sd.particles = sd.particles.filter(pt => pt.life > 0);

    // Per-second boss-damage budget reset (keeps bosses controlled / unbreakable)
    sd.bossDmgTimer -= dt;
    if (sd.bossDmgTimer <= 0) { sd.bossDmgTimer = 1.0; sd.miniDmgThisSec = 0; sd.megaDmgThisSec = 0; }

    // Slow normal enemies inside the field — Game-side, no Enemy.js change (same idea as knockback):
    // cancel a fraction of the movement they just applied this frame. Bosses + stunned are skipped.
    for (const e of this.enemies) {
      if (e.isBoss() || e.isMegaBoss || e.stunned > 0) continue;
      if (distance(e.pos, sd.pos) <= RADIUS + e.radius) e.pos.subMut(e.vel.scale(SLOW * dt));
    }

    // Repeating damage ticks
    sd.dmgTimer -= dt;
    if (sd.dmgTimer <= 0) {
      sd.dmgTimer = TICK;
      const bossHit = (isMega) => {
        const cap  = isMega ? MAIN_CAP : MINI_CAP;
        const used = isMega ? sd.megaDmgThisSec : sd.miniDmgThisSec;
        const dmg  = Math.min(cap * TICK, cap - used);
        if (dmg <= 0) return 0;
        if (isMega) sd.megaDmgThisSec += dmg; else sd.miniDmgThisSec += dmg;
        return dmg;
      };
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (distance(e.pos, sd.pos) > RADIUS + e.radius) continue;
        if (e.isMegaBoss)    { const d = bossHit(true);  if (d > 0) e.takeHit(d, this); }
        else if (e.isBoss()) { const d = bossHit(false); if (d > 0) e.takeHit(d, this); }
        else                 { e.takeHit(NORMAL_DMG, this); if (Math.random() < 0.25) this.particles.spawnHitSparks(e.pos, CYAN); }
      }
      const hitSingle = (b, die) => {
        if (!b || b.hp <= 0 || distance(b.pos, sd.pos) > RADIUS + b.radius) return;
        const d = bossHit(false); if (d <= 0) return;
        b.hp -= d; b.hitFlash = 0.08;
        if (b.hp <= 0) die.call(this);
      };
      hitSingle(this.titanBoss,       this._titanDie);
      hitSingle(this.annihilatorBoss, this._annihilatorDie);
      hitSingle(this.bloodfangBoss,   this._bloodfangDie);
    }

    if (sd.t >= DURATION) this.spiritDojang = null;
  }

  // World-space: cyan dojo field aura + rising spirit particles + the flag asset at the cast point.
  _drawSpiritDojang(ctx) {
    const sd = this.spiritDojang;
    if (!sd) return;
    const RADIUS = 205 * (1 + 0.12 * this._cardLvl('taekwondo_dojang_flag_mastery')), DURATION = 7;
    const a = Math.max(0, Math.min(sd.t / 0.3, (DURATION - sd.t) / 0.6, 1));   // fade in/out
    const now = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(now * 2.2);

    // Translucent cyan/blue field fill (additive — character + enemies stay readable through it)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sd.pos.x, sd.pos.y, RADIUS * 0.2, sd.pos.x, sd.pos.y, RADIUS);
    g.addColorStop(0,   'rgba(40,200,255,' + (0.16 * a) + ')');
    g.addColorStop(0.7, 'rgba(40,120,255,' + (0.10 * a) + ')');
    g.addColorStop(1,   'rgba(150,80,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sd.pos.x, sd.pos.y, RADIUS, 0, Math.PI * 2); ctx.fill();

    // Bright pulsing rim
    ctx.globalAlpha = (0.4 + 0.3 * pulse) * a;
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2.5;
    ctx.shadowColor = CYAN; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(sd.pos.x, sd.pos.y, RADIUS - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    // Spirit particles
    for (const pt of sd.particles) {
      ctx.globalAlpha = (pt.life / pt.maxLife) * 0.8 * a;
      ctx.fillStyle = '#bfefff';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Flag asset at the centre (normal blend, drawn last so it reads clearly)
    const spr = this._dojangFlagSprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      const h = 96, w = h * (spr.naturalWidth / spr.naturalHeight);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(spr, sd.pos.x - w / 2, sd.pos.y - h, w, h);   // pole base anchored at cast point
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = CYAN; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sd.pos.x, sd.pos.y); ctx.lineTo(sd.pos.x, sd.pos.y - 80); ctx.stroke();
      ctx.fillStyle = 'rgba(40,200,255,0.8)';
      ctx.fillRect(sd.pos.x, sd.pos.y - 80, 34, 22);
      ctx.restore();
    }
  }

  // ── CYBER RIDE ultimate (Neon Taekwondo Girl, SPACE, 100 mana) ───────────────
  // She summons a neon speeder: steer with normal movement (WASD/arrows) at huge speed,
  // ram enemies, and twin headlight LASERS fire forward. Reverts to normal when it ends.
  activateCyberBikeRush() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'taekwondo_girl') return;
    if (this._cyberBike) return;
    if (p.mana < ULTIMATE_MANA_COST) {
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana -= ULTIMATE_MANA_COST;
    const dir = (p.lastFacingDir && p.lastFacingDir.lengthSq() > 0.001) ? safeNormalize(p.lastFacingDir.clone()) : new Vec2(1, 0);
    const speedAdded = 1.2;                       // +120% move speed while riding (tunable)
    p.speedBonus = (p.speedBonus || 0) + speedAdded;
    this._cyberBike = { t: 0, fireTimer: 0, dir, beams: [], hits: new Map(), speedAdded };
    this.screenShake.trigger(5, 0.25);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('CYBER RIDE!', p.pos.clone(), CYAN, 1.4));
  }

  _updateCyberBikeRush(dt) {
    const bk = this._cyberBike;
    if (!bk) return;
    const p = this.player;
    const DURATION = 5.0;                                            // ride length (tunable)
    const RAM_R = 46, RAM_DMG = 42, RAM_BOSS = 7, KNOCK = 430;       // ram values (tunable)
    const FIRE_EVERY = 0.42, RANGE = 620, WIDTH = 24, LASER_DMG = 22, LASER_BOSS = 5;
    bk.t += dt;

    // steer with the player's current movement direction (WASD / arrows)
    if (p.lastFacingDir && p.lastFacingDir.lengthSq() > 0.001) bk.dir = safeNormalize(p.lastFacingDir.clone());
    const dir = bk.dir;

    // ram enemies the bike drives through (per-enemy re-hit cooldown)
    for (const [e, cd] of bk.hits) { const n = cd - dt; if (n <= 0) bk.hits.delete(e); else bk.hits.set(e, n); }
    for (const e of this.enemies) {
      if (bk.hits.has(e)) continue;
      if (distance(e.pos, p.pos) < RAM_R + e.radius) {
        const boss = e.isBoss() || e.isMegaBoss;
        e.takeHit(boss ? RAM_BOSS : RAM_DMG, this);
        if (!boss) e.vel.addMut(safeNormalize(e.pos.sub(p.pos)).scale(KNOCK));
        this.particles.spawnHitSparks(e.pos, CYAN);
        bk.hits.set(e, 0.45);
      }
    }

    // twin headlight lasers fire forward on a short cycle (hitscan pierce)
    bk.fireTimer -= dt;
    if (bk.fireTimer <= 0) {
      bk.fireTimer = FIRE_EVERY;
      const ox = p.pos.x + dir.x * 24, oy = (p.pos.y - 4) + dir.y * 24;
      for (const e of this.enemies) {
        const tx = e.pos.x - ox, ty = e.pos.y - oy;
        const along = tx * dir.x + ty * dir.y;
        if (along < 0 || along > RANGE) continue;
        const pX = tx - dir.x * along, pY = ty - dir.y * along;
        if (pX * pX + pY * pY < (WIDTH + e.radius) ** 2) {
          const boss = e.isBoss() || e.isMegaBoss;
          e.takeHit(boss ? LASER_BOSS : LASER_DMG, this);
          this.particles.spawnHitSparks(e.pos, CYAN);
        }
      }
      bk.beams.push({ x: ox, y: oy, dx: dir.x, dy: dir.y, len: RANGE, life: 0.18, maxLife: 0.18 });
      this.audio?.playHit?.();
    }
    for (const b of bk.beams) b.life -= dt;
    bk.beams = bk.beams.filter(b => b.life > 0);

    // end: remove the speed buff and revert to normal
    if (bk.t >= DURATION) {
      p.speedBonus = Math.max(0, (p.speedBonus || 0) - bk.speedAdded);
      this._cyberBike = null;
      this.floatingTexts.push(new FloatingText('RIDE OVER', p.pos.clone(), CYAN, 0.8));
    }
  }

  // Drawn BEFORE the player so she sits on the bike. Beams + neon speeder oriented to travel dir.
  _drawCyberBikeRush(ctx) {
    const bk = this._cyberBike;
    if (!bk) return;
    const p = this.player;
    const DURATION = 5.0;
    const a = Math.max(0, Math.min(bk.t / 0.25, (DURATION - bk.t) / 0.4, 1));
    const ang = Math.atan2(bk.dir.y, bk.dir.x);

    // headlight laser beams (world space)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of bk.beams) {
      const al = (b.life / b.maxLife) * a;
      const ex = b.x + b.dx * b.len, ey = b.y + b.dy * b.len;
      ctx.globalAlpha = 0.30 * al; ctx.strokeStyle = '#1fd0ff'; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = 0.85 * al; ctx.strokeStyle = CYAN; ctx.lineWidth = 9 * al + 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = al; ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 3 * al + 1;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      const mg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 26);
      mg.addColorStop(0, `rgba(190,240,255,${0.9 * al})`); mg.addColorStop(1, 'rgba(31,208,255,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(b.x, b.y, 26, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // neon speeder under the rider, oriented to travel direction
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y + 10);
    ctx.rotate(ang);
    ctx.globalAlpha = a;
    // underglow
    let g = ctx.createRadialGradient(0, 0, 4, 0, 0, 52);
    g.addColorStop(0, 'rgba(31,208,255,0.45)'); g.addColorStop(1, 'rgba(31,208,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 52, 26, 0, 0, Math.PI * 2); ctx.fill();
    // speed streaks behind
    ctx.strokeStyle = 'rgba(120,240,255,0.5)'; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.globalAlpha = a * (0.5 - Math.abs(i) * 0.12);
      ctx.beginPath(); ctx.moveTo(-26, i * 5); ctx.lineTo(-26 - (34 + Math.random() * 18), i * 6); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
    // wheels
    ctx.fillStyle = '#04161e'; ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    for (const wx of [-22, 24]) { ctx.beginPath(); ctx.ellipse(wx, 0, 6, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    // chassis (nose at +x = travel dir)
    ctx.fillStyle = '#06222e'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(34, 0); ctx.lineTo(16, -9); ctx.lineTo(-20, -8); ctx.lineTo(-30, 0);
    ctx.lineTo(-20, 8); ctx.lineTo(16, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#8af3ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(30, 0); ctx.stroke();
    // headlight glow at the nose
    ctx.globalCompositeOperation = 'lighter';
    g = ctx.createRadialGradient(32, 0, 0, 32, 0, 14);
    g.addColorStop(0, 'rgba(234,255,255,0.95)'); g.addColorStop(1, 'rgba(31,208,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _updateEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this);
      e.keepInBounds();

      // Dash intercept: dashing into a carrying enemy forces core drop
      if (e.carryingCore !== null && this.player.dashTimer > 0) {
        if (distance(e.pos, this.player.pos) < e.radius + PLAYER_RADIUS + 3) {
          e.takeHit(2, this);
          this.floatingTexts.push(new FloatingText('DASH INTERCEPT!', e.pos.clone(), CYAN, 1.0));
        }
      }
    }
  }

  _updateOverload(dt) {
    const groundCount  = this.groundCores.length;
    const carriedCount = this.enemies.filter(e => e.carryingCore !== null).length;
    const emptySlots   = this.matrices.reduce((sum, m) => sum + (m.capacity - m.stored), 0);

    // Capped so falling behind on cores ramps pressure GRADUALLY instead of spiking.
    // Nexus retune (Four-Nexus layout): empty-slot weight 0.015 for 32 total slots (4×8). Scales
    // the per-slot pressure back toward the original ~0.012 regime now that the grid is larger than
    // the single 16-slot Nexus. The min(0.28) cap keeps a fully-drained grid survivable, not unfair.
    let chaosGain = Math.min(0.28, groundCount * 0.020 + carriedCount * 0.050 + emptySlots * 0.015);

    // Endless: gentle live-threat pressure so ignoring objectives becomes a real Overload threat by
    // ~20–30 min. Scales with enemies on the grid + an active boss (capped; never instantly lethal).
    // Active play keeps enemy counts down → less pressure, so this rewards managing the grid.
    if (this.endless) {
      const bossAlive = (this.megaBoss && this.megaBoss.hp > 0) || this.titanBoss || this.annihilatorBoss || this.bloodfangBoss;
      chaosGain += Math.min(0.06, this.enemies.length * 0.0006) + (bossAlive ? 0.03 : 0);
    }

    // Grid Stabilizer Protocol (grid_legend) + Grid Stabilizer card: Endless only — reduce the
    // Nexus-PRESSURE gain. Combined reduction hard-capped at 0.65 so it is NEVER immunity, and the
    // time-based floor + MAX_OVERLOAD game-over below are untouched (Nexus defense still matters).
    if (this.endless) {
      const red = Math.min(0.65, (this.meta.hasAchievement('grid_legend') ? 0.5 : 0)
                                  + 0.05 * this._cardLvl('achievement_grid_stabilizer'));
      chaosGain *= (1 - red);
    }

    if (chaosGain === 0) {
      // Grid fully secure — drain at 1.0% per second
      this.overload = Math.max(0, this.overload - 1.0 * dt);
    } else {
      // Scale with time: ramps faster mid/late so falling behind on cores bites after 10 min.
      const minutes  = this.timeAlive / 60;
      const diffMult = Math.min(2.6, 1.0 + minutes * 0.05) * (1 - this.player.overloadDampening);
      this.overload  = clamp(this.overload + chaosGain * diffMult * dt, 0, MAX_OVERLOAD);
    }

    // Time-based minimum floor — applies ONLY while the grid is SECURED (chaosGain === 0), so a
    // fully-defended grid still hovers dangerously but never auto-loses (capped 85%). When the grid
    // is COMPROMISED (chaosGain > 0 — loose/stolen cores or empty Nexus slots, i.e. the "Nexus down"
    // state), the floor must NOT pin overload: it then keeps climbing via chaosGain all the way to
    // 100 so the Overload failure / Game-Over condition stays reachable instead of stalling at ~85.
    //   0–10 min: gentle ramp, caps 35% (~7:00).  10–15 min: 35% → 55%.  15+ min: 55% → 80% (@20:00), capped 85%.
    if (chaosGain === 0) {
      const mins = this.timeAlive / 60;
      let floorPct;
      if      (mins <= 10) floorPct = Math.min(35, mins * 5.0);
      else if (mins <= 15) floorPct = 35 + (mins - 10) * 4.0;
      else                 floorPct = Math.min(85, 55 + (mins - 15) * 5.0);
      this.overload = Math.max(this.overload, floorPct);
    }

    if (this.audio) this.audio.updateAlarm(this.overload);
  }

  // World cores are tied to Matrix state — never unlimited. The number of recoverable
  // cores in play tracks how much the matrices are MISSING: full grid → ~no new cores;
  // depleted grid → spawn replacements (near the depleted matrices) so recovery is possible.
  _updateCoreEconomy(dt) {
    if (!this.matrices.length) return;

    // Cores are NOT generated here — they are minted only when enemies steal charge (conserved
    // 1:1 with the dropped core's value in PowerMatrix.stealCore). This pass is a READABILITY
    // GUARANTEE that bounds loose GROUND cores three ways so the field never floods:
    //   (1) Hard COUNT cap — at most MAX_GROUND_CORES cores on the ground, regardless of deficit.
    //   (2) Hard VALUE cap — ground-core value must not exceed the real Matrix deficit minus the
    //       value already in-transit (carried by the player or by enemies). No buffer: cores that
    //       are being delivered already account for that slice of the deficit.
    //   (3) Near-full grid — if the deficit is tiny (<= 4), a recovered grid keeps at most 1
    //       straggler so it isn't littered.
    // In every case the FARTHEST-from-player ground cores (least recoverable) are removed first.
    const MAX_GROUND_CORES = 10;

    if (!this.groundCores.length) return;

    const coreVal = c => (c.value ?? 3);

    let deficit = 0;
    for (const m of this.matrices) deficit += (m.capacity - m.stored);

    // Value already on its way back to a Matrix (player carry + enemy-carried). That slice of the
    // deficit is spoken for, so GROUND cores may only fill the REMAINING deficit — no buffer.
    let inTransit = 0;
    for (const v of this.player.carriedCores) inTransit += v;
    for (const e of this.enemies) if (e.carryingCore) inTransit += coreVal(e.carryingCore);

    // (1)+(3) COUNT cap: at most 10 ground cores normally; a nearly-full grid (deficit <= 4)
    // keeps at most 1 straggler. (2) VALUE cap: ground value may not exceed the outstanding
    // deficit not already covered in-transit. The stricter of the two governs.
    const countCap = deficit <= 4 ? 1 : MAX_GROUND_CORES;
    const valueCap = Math.max(0, deficit - inTransit);

    let groundValue = 0;
    for (const c of this.groundCores) groundValue += coreVal(c);

    if (this.groundCores.length > countCap || groundValue > valueCap) {
      // Remove FARTHEST-from-player ground cores first (least useful to recover).
      this.groundCores.sort((p, q) =>
        distance(q.pos, this.player.pos) - distance(p.pos, this.player.pos));

      let removed = 0;
      const n = this.groundCores.length;
      while (removed < n) {
        const kept = n - removed;
        if (kept <= countCap && groundValue <= valueCap) break;
        groundValue -= coreVal(this.groundCores[removed]);
        removed++;
      }
      if (removed > 0) this.groundCores.splice(0, removed);
    }
  }

  _updateSpawning(dt) {
    if (this.spawnPauseTimer > 0) { this.spawnPauseTimer -= dt; return; }
    this.spawnTimer += dt;
    // During Thunder Solo, keep waves arriving fast so the 7s ultimate always has targets
    // (still capped by enemyCap() inside spawnEnemy — not unfair spam).
    const interval = this.thunderSolo ? Math.min(this.enemySpawnInterval(), 0.3) : this.enemySpawnInterval();
    if (this.spawnTimer >= interval) {
      this.spawnTimer = 0;
      const m = this.currentMinute();
      // Per-tick batch grows with the tiers so the cap actually FILLS (and stays filled vs kills).
      let count = m < 2 ? 3 : m < 5 ? 4 : m < 10 ? 5 : 6;
      // Catch-up surge: if the battlefield is below 70% of the cap, spawn extra so it never
      // sits empty (kills early were outpacing spawns and leaving the map sparse).
      if (this.enemies.length < this.enemyCap() * 0.7) count += 4;
      for (let i = 0; i < count; i++) this.spawnEnemy();   // spawnEnemy() still enforces enemyCap
    }
  }

  // Endless Elite Waves (Phase 1). Endless-only; additive layer that never touches Act 1,
  // chooseEnemyType, WINDOWS, base enemy stats, enemyCap logic, or the bosses. Elites are
  // normal Enemy instances buffed AFTER construction (tankier + faster, damage unchanged),
  // so every player hit still routes through the existing _damagePlayer path.
  _updateEliteWaves(dt) {
    if (!this.endless) return;            // hard gate — inert during Act 1
    this._eliteWaveElapsed += dt;

    // ── Forced Mutation cadence (Phase 1): first at 3:00, then every 3:00, max 6 picks. ──
    // Defer while a level-up card is open or a boss warning / corruption-beam telegraph is live so
    // the forced choice never stacks over another UI or pops during an unavoidable damage moment.
    if (!this.mutationUI && this.mutations.stacks < MUTATION_MAX_STACKS) {
      this._mutationTimer -= dt;
      if (this._mutationTimer <= 0) {
        if (this.upgradeUI || this._bossWarnCd > 0 || this._corruptionBeam) {
          this._mutationTimer = 3;                 // busy/dangerous → retry shortly
        } else {
          this._openMutationChoice();
          this._mutationTimer = MUTATION_INTERVAL;
        }
      }
    }

    // Live Endless-achievement check (~1/s) so milestones unlock + persist mid-run.
    this._achTimer = (this._achTimer || 0) - dt;
    if (this._achTimer <= 0) { this._achTimer = 1.0; this._checkEndlessAchievements(); }
    // Brawler Warrior unlock: reaching 10:00 INSIDE Endless (not Act 1, not at Continue). One-shot.
    if (this._eliteWaveElapsed >= 600 && !this.meta.isUnlocked('brawler_warrior')) {
      this.meta.unlock('brawler_warrior');
      this.triggerAnnouncement('BRAWLER WARRIOR UNLOCKED', GREEN);
    }
    // Secret-outfit unlocks (Endless-only, one-shot, persisted; character-gated).
    const sc = this.player.selectedCharacter;
    // Brawler LOG #1997: survive 18:00 in Endless AS Brawler Warrior.
    if (sc === 'brawler_warrior' && this._eliteWaveElapsed >= 1080 && !this.meta.isUnlocked('log_1997')) {
      this.meta.unlock('log_1997');
      this.triggerAnnouncement('SYSTEM LOG #1997 FOUND — BRAWLER SKIN', YELLOW);
    }
    // Assassin LOG #1998: survive 15:00 in Endless AS Assassin Clone.
    if (sc === 'assassin_clone' && this._eliteWaveElapsed >= 900 && !this.meta.isUnlocked('log_1998')) {
      this.meta.unlock('log_1998');
      this.triggerAnnouncement('SYSTEM LOG #1998 FOUND — PHANTOM ASSASSIN', '#ff4dd2');
    }
    this._eliteWaveTimer   -= dt;
    if (this._eliteWaveTimer <= 0) {
      this._spawnEliteWave();
      this._eliteWaveTimer = ELITE_WAVE.interval * this.mutations.eliteIntervalMult;   // EARLY ELITES (1.0 outside Endless)
    }
  }

  _spawnEliteWave() {
    // Batch size grows with time spent in Endless (capped).
    let batch = ELITE_WAVE.baseBatch;
    if (this._eliteWaveElapsed >= 20 * 60)      batch = ELITE_WAVE.batch20min;
    else if (this._eliteWaveElapsed >= 10 * 60) batch = ELITE_WAVE.batch10min;

    const m   = this.currentMinute();
    const cap = this.enemyCap();
    let spawned = 0;
    for (let i = 0; i < batch; i++) {
      if (this.enemies.length >= cap) break;          // respect cap — skip when full
      const e = new Enemy(randomChoice(ELITE_WAVE.pool), m);
      e.isElite        = true;
      e.hp            *= ELITE_WAVE.hpMult;
      e._baseSpeedFull *= ELITE_WAVE.speedMult;        // canonical speed (baseSpeed recomputed per frame)
      e.baseSpeed     *= ELITE_WAVE.speedMult;
      e.radius        *= ELITE_WAVE.radiusMult;
      // Damage intentionally unchanged (×1.0) in Phase 1 — no new/elevated damage path.
      this.enemies.push(e);
      spawned++;
    }
    if (spawned > 0) this.triggerAnnouncement('⚠ ELITE WAVE', '#FFD700');
  }

  // ── Endless-only high-threat hazards: AIRSTRIKE ships (aimed rockets) + CYBER CYCLONE storm. ──
  // Endless-gated, additive layer. Never touches Act 1, bosses, Overload, pickups, or the economy.
  // Hard active caps (1 ship, 1 cyclone) keep clutter/perf bounded.
  _updateEndlessHazards(dt) {
    if (!this.endless) return;
    this._updateAirstrike(dt);
    this._updateCyclones(dt);
  }

  _updateAirstrike(dt) {
    // Cadence: first ~1.5 min, then ~every 2 min — but never more than 1 ship at a time.
    this._airstrikeTimer -= dt;
    if (this._airstrikeTimer <= 0) {
      if (this.airstrikeShips.length < 1) { this._airstrikeTimer = 120; this._spawnAirstrike(); }
      else                                  this._airstrikeTimer = 20;   // still airborne → retry soon
    }

    // Ships loiter/strafe around the player and fire aimed rockets until a safety timeout.
    for (let i = this.airstrikeShips.length - 1; i >= 0; i--) {
      const s = this.airstrikeShips[i];
      s.life  -= dt;
      s.angle += dt * 0.5;
      const tgt = new Vec2(this.player.pos.x + Math.cos(s.angle) * 360,
                           this.player.pos.y + Math.sin(s.angle) * 300);
      const mv = safeNormalize(tgt.sub(s.pos));
      s.pos.addMut(mv.scale(220 * dt));
      s.pos.x = clamp(s.pos.x, WORLD_MARGIN, WORLD_W - WORLD_MARGIN);
      s.pos.y = clamp(s.pos.y, WORLD_MARGIN, WORLD_H - WORLD_MARGIN);
      s.fireCd -= dt;
      if (s.fireCd <= 0) { s.fireCd = randomRange(2.0, 2.6); this._fireRocket(s); }
      if (s.life <= 0) this.airstrikeShips.splice(i, 1);   // long safety timeout
    }
    this._updateRockets(dt);
  }

  _spawnAirstrike() {
    const edge = Math.random() < 0.5 ? -60 : WORLD_W + 60;
    this.airstrikeShips.push({
      pos: new Vec2(edge, randomRange(WORLD_MARGIN, WORLD_H - WORLD_MARGIN)),
      angle: Math.random() * Math.PI * 2, fireCd: 1.5, life: 45,
    });
    this.triggerAnnouncement('AIRSTRIKE INBOUND', ORANGE);
    this.audio?.playEventWarning();
  }

  _fireRocket(s) {
    if (this.airstrikeRockets.length >= 30) return;   // safety cap on in-flight rockets
    const base = safeNormalize(this.player.pos.sub(s.pos));
    if (base.lengthSq() === 0) return;
    const j = randomRange(-0.3, 0.3);   // ~70% aim assist / 30% spread → dangerous but dodgeable
    const c = Math.cos(j), sn = Math.sin(j);
    const dir = new Vec2(base.x * c - base.y * sn, base.x * sn + base.y * c);
    this.airstrikeRockets.push({ pos: s.pos.clone(), dir, speed: 240, life: 5, radius: 7, blast: 46 });
    this.audio?.playEnemyShoot();
  }

  _updateRockets(dt) {
    for (let i = this.airstrikeRockets.length - 1; i >= 0; i--) {
      const r = this.airstrikeRockets[i];
      r.life -= dt;
      r.pos.addMut(r.dir.scale(r.speed * dt));
      const hit = distance(r.pos, this.player.pos) < PLAYER_RADIUS + r.blast;
      const out = r.pos.x < -80 || r.pos.x > WORLD_W + 80 || r.pos.y < -80 || r.pos.y > WORLD_H + 80;
      if (hit || r.life <= 0 || out) {
        if (hit && this.phoenixReviveTimer <= 0 && this.player.dashTimer <= 0) {
          const dmg = Math.round(this.player.maxHp * randomRange(0.40, 0.50));   // heavy clean hit
          this.player.applyBite({ hp: dmg, stagger: 0.8 });   // damage + short stun (anti-chain inside)
          this.screenShake.trigger(9, 0.4);
          this.particles.spawnDeathBurst(r.pos, ORANGE, 18, 2.4);
          this.floatingTexts.push(new FloatingText('-' + dmg + ' HP', this.player.pos.clone(), RED, 1.2));
        } else {
          this.particles.spawnHitSparks(r.pos, ORANGE);
        }
        this.airstrikeRockets.splice(i, 1);
      }
    }
  }

  _updateCyclones(dt) {
    this._cycloneTimer -= dt;
    if (this._cycloneTimer <= 0) {
      if (this.cyclones.length < 1) { this._cycloneTimer = 120; this._spawnCyclone(); }
      else                          this._cycloneTimer = 20;   // one at a time
    }
    for (let i = this.cyclones.length - 1; i >= 0; i--) {
      const cy = this.cyclones[i];
      cy.t += dt;
      const toP = safeNormalize(this.player.pos.sub(cy.pos));   // drift slowly toward player
      cy.pos.addMut(toP.scale(38 * dt));
      cy.pos.x = clamp(cy.pos.x, WORLD_MARGIN, WORLD_W - WORLD_MARGIN);
      cy.pos.y = clamp(cy.pos.y, WORLD_MARGIN, WORLD_H - WORLD_MARGIN);
      if (cy.t >= cy.warn) {   // ACTIVE phase: DoT + pull + periodic stun while inside the funnel
        const d = distance(this.player.pos, cy.pos);
        if (d < cy.radius && this.phoenixReviveTimer <= 0 && this.player.dashTimer <= 0) {
          this.player.pos.addMut(safeNormalize(cy.pos.sub(this.player.pos)).scale(70 * dt));   // pull-in
          cy.dmgAccum += dt;
          if (cy.dmgAccum >= 0.5) {
            cy.dmgAccum -= 0.5;
            this.player.applyDamage(6 * (1 - this.player.contactDamageReduction));
            this.floatingTexts.push(new FloatingText('-6 HP', this.player.pos.clone(), CYAN, 0.6));
          }
          cy.stunCd -= dt;
          if (cy.stunCd <= 0) { cy.stunCd = 2.5; this.player.applyBite({ stagger: 0.5 }); }
        }
      }
      if (cy.t >= cy.warn + cy.active) this.cyclones.splice(i, 1);
    }
  }

  _spawnCyclone() {
    const ang  = Math.random() * Math.PI * 2;
    const dist = randomRange(260, 420);
    const pos  = new Vec2(
      clamp(this.player.pos.x + Math.cos(ang) * dist, WORLD_MARGIN, WORLD_W - WORLD_MARGIN),
      clamp(this.player.pos.y + Math.sin(ang) * dist, WORLD_MARGIN, WORLD_H - WORLD_MARGIN));
    this.cyclones.push({ pos, t: 0, warn: 2.5, active: 14, radius: 120, dmgAccum: 0, stunCd: 0 });
    this.triggerAnnouncement('CYBER CYCLONE FORMING', '#4db8ff');
    this.audio?.playEventWarning();
  }

  // Drawn in world space (after boss lava). Gated on Endless so leftover hazards never paint in Act 1.
  _drawEndlessHazards(ctx) {
    if (!this.endless) return;
    // Cyclones — telegraph ring while forming, then the funnel sprite (anchored at its base).
    for (const cy of this.cyclones) {
      const forming = cy.t < cy.warn;
      if (forming) {
        const p = 0.5 + 0.4 * Math.sin(performance.now() * 0.012);
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.4 * p;
        ctx.strokeStyle = '#4db8ff'; ctx.lineWidth = 4; ctx.setLineDash([14, 10]);
        ctx.beginPath(); ctx.arc(cy.pos.x, cy.pos.y, cy.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      const spr   = this._cycloneSprite;
      const scale = forming ? 0.5 + 0.5 * (cy.t / cy.warn) : 1.0;
      const h = cy.radius * 2.6 * scale, w = h * (510 / 804);
      ctx.save();
      ctx.globalAlpha = forming ? 0.6 : 0.92;
      if (spr.complete && spr.naturalWidth) {
        ctx.drawImage(spr, cy.pos.x - w / 2, cy.pos.y - h * 0.78, w, h);
      } else {
        ctx.fillStyle = '#4db8ff'; ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(cy.pos.x, cy.pos.y, cy.radius, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // Airstrike ships.
    const ship = this._airstrikeSprite;
    for (const s of this.airstrikeShips) {
      const sz = 110;
      if (ship.complete && ship.naturalWidth) ctx.drawImage(ship, s.pos.x - sz / 2, s.pos.y - sz / 2, sz, sz);
      else { ctx.save(); ctx.fillStyle = '#dfe9f5'; ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, 22, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    }
    // Rockets — trail, body, and a pulsing blast-radius danger ring (impact telegraph).
    for (const r of this.airstrikeRockets) {
      ctx.save();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = ORANGE; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(r.pos.x, r.pos.y);
      ctx.lineTo(r.pos.x - r.dir.x * 18, r.pos.y - r.dir.y * 18); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffd27f';
      ctx.beginPath(); ctx.arc(r.pos.x, r.pos.y, r.radius, 0, Math.PI * 2); ctx.fill();
      const p = 0.5 + 0.5 * Math.sin(performance.now() * 0.02);
      ctx.globalAlpha = 0.35 + 0.35 * p; ctx.strokeStyle = RED; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.pos.x, r.pos.y, r.blast, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  _updateFloatingTexts(dt) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      this.floatingTexts[i].update(dt);
      if (this.floatingTexts[i].timer <= 0) this.floatingTexts.splice(i, 1);
    }
    if (this.floatingTexts.length > 90) this.floatingTexts.splice(0, this.floatingTexts.length - 90);
  }

  _updateEffects(dt) {
    for (let i = this.empRings.length - 1; i >= 0; i--) {
      this.empRings[i].update(dt);
      if (!this.empRings[i].alive()) this.empRings.splice(i, 1);
    }
  }

  _checkPlayerEnemyCollisions(dt) {
    if (this.playerHitCooldown > 0) this.playerHitCooldown -= dt;

    let damageDone = false;
    for (const e of this.enemies) {
      if (distance(e.pos, this.player.pos) < e.radius + PLAYER_RADIUS) {
        // Pushback
        const push = safeNormalize(this.player.pos.sub(e.pos));
        this.player.pos.addMut(push.scale(60 * dt));

        if (!damageDone && this.phoenixReviveTimer <= 0 && this.player.dashTimer <= 0) {
          // Apply per-enemy contact damage
          const dmg = (e.contactDamage ?? 8) * dt * (1 - this.player.contactDamageReduction);
          this.player.applyDamage(dmg);
          damageDone = true;

          // Throttle screen shake and floating text to once per 0.5s
          if (this.playerHitCooldown <= 0) {
            this.playerHitCooldown = 0.5;
            this.screenShake.trigger(4, 0.15);
            // Razorhound bite: stamina drain + short stagger + knockback + bleed (anti-lock via immunity)
            if (e.enemyType === 'Razorhound') {
              const dir = safeNormalize(this.player.pos.sub(e.pos));
              const staggered = this.player.applyBite({ stamina: 8, stagger: 0.6, knockback: 14, dir, bleed: 2.5 });
              this.audio?.playRazorhoundBite();
              this.particles.spawnBloodSplash(this.player.pos);
              this.floatingTexts.push(
                new FloatingText(staggered ? 'STAGGERED' : 'BLEED', new Vec2(this.player.pos.x, this.player.pos.y - 28), RED, 0.7)
              );
            } else {
              this.particles.spawnHitSparks(this.player.pos, RED);
              this.floatingTexts.push(
                new FloatingText(`-${Math.ceil(e.contactDamage ?? 8)} HP`, this.player.pos.clone(), RED, 0.6)
              );
            }
          }
        }
      }
    }
  }

  _updateAbilityTimers(dt) {
    // Homing disc timer managed in _updateHomingDiscs
    // Sonic pulse / EMP cooldowns decremented in Player.update
  }

  _updateSpecialEffects(dt) {
    const p = this.player;
    if (p.specialDashTimer > 0 && p.selectedCharacter === 'taekwondo_girl') {
      this._specialTrail.push({ x: p.pos.x, y: p.pos.y, alpha: 0.7 });
      for (const e of this.enemies) {
        if (this._taekwondoDmgSet.has(e)) continue;
        if (distance(p.pos, e.pos) < 45 + e.radius) {
          this._taekwondoDmgSet.add(e);
          e.takeHit(15, this);
        }
      }
      for (let i = this.groundCores.length - 1; i >= 0; i--) {
        const core = this.groundCores[i];
        if (p.carry < p.maxCarry && distance(p.pos, core.pos) < 60) {
          this.groundCores.splice(i, 1);
          p.carry++;
          p.carriedCores.push(core.value ?? 3);
          this.overload = Math.max(0, this.overload - OVERLOAD_PICKUP_REDUCTION);
          this.particles.spawnCorePickup(core.pos, core.color);
        }
      }
    }
    for (const t of this._specialTrail) t.alpha -= 3.5 * dt;
    this._specialTrail = this._specialTrail.filter(t => t.alpha > 0);
    for (const r of this._specialRings) {
      r.radius = r.maxRadius * (1 - r.life / r.maxLife);
      r.life  -= dt;
    }
    this._specialRings = this._specialRings.filter(r => r.life > 0);
    for (const b of this._specialBeams) b.life -= dt;
    this._specialBeams = this._specialBeams.filter(b => b.life > 0);
  }

  _updateQuantumOverhaul(dt) {
    const p = this.player;
    if (p.upgrades['Quantum Overhaul'] === 0) return;

    p.quantumOverhaulTimer -= dt;
    if (p.quantumOverhaulTimer > 0) return;

    p.quantumOverhaulTimer = Math.max(3, 8 - p.upgrades['Quantum Overhaul']);

    if (this.groundCores.length === 0) return;

    // Find core nearest to any matrix with space
    let bestCore   = null;
    let bestMatrix = null;
    let bestDist   = Infinity;

    for (const core of this.groundCores) {
      for (const m of this.matrices) {
        if (!m.hasSpace()) continue;
        const d = distance(core.pos, m.pos);
        if (d < bestDist) { bestDist = d; bestCore = core; bestMatrix = m; }
      }
    }

    if (bestCore && bestMatrix) {
      const idx = this.groundCores.indexOf(bestCore);
      this.groundCores.splice(idx, 1);
      bestMatrix.slotCore(bestCore.value ?? 3);   // honor Gold (+5) / Silver (+3)
      this.player.coresSecured++;
      this.overload = Math.max(0, this.overload - OVERLOAD_SLOT_REDUCTION);
      this.floatingTexts.push(new FloatingText('QUANTUM BEAM!', bestCore.pos.clone(), ORANGE, 1.2));
      this.particles.spawnCoreSlot(bestMatrix.pos, bestMatrix.color);
    }
  }

  _triggerPhoenixRevive() {
    this.phoenixReviveCount++;
    this.score = (this.score ?? 0) + 100;
    this.phoenixUsed        = true;  // keep existing flag
    this.phoenixReviveTimer = 3.0;

    if (this.phoenixReviveCount === 1) {
      // ── Orange — 33.3 % HP, −25 % overload ────────────────────────────────
      this.phoenixReviveType = 'orange';
      this.player.hp = Math.ceil(this.player.maxHp * 0.333);
      this.overload  = Math.max(0, this.overload * 0.75);
      this.floatingTexts.push(
        new FloatingText('✦ PHOENIX REVIVE ✦', this.player.pos.clone(), ORANGE, 2.5)
      );
      this.screenShake.trigger(8, 0.5);

    } else if (this.phoenixReviveCount === 2) {
      // ── Blue — 55.5 % HP, −50 % overload ─────────────────────────────────
      this.phoenixReviveType = 'blue';
      this.player.hp = Math.ceil(this.player.maxHp * 0.555);
      this.overload  = Math.max(0, this.overload * 0.5);
      this.triggerAnnouncement('✦ BLUE PHOENIX REVIVE ✦', CYAN);
      this.floatingTexts.push(
        new FloatingText('BLUE PHOENIX REVIVE', this.player.pos.clone(), CYAN, 3.0)
      );
      this.screenShake.trigger(12, 0.7);

    } else {
      // ── Gold — 125 % HP (overheal), −75 % overload ───────────────────────
      this.phoenixReviveType = 'gold';
      this.player.hp = Math.round(this.player.maxHp * 1.25);   // overheal: gold segment on HP bar
      this.overload  = Math.max(0, this.overload * 0.25);
      this.triggerAnnouncement('✦ GOLD PHOENIX REVIVE ✦', YELLOW);
      this.floatingTexts.push(
        new FloatingText('GOLD PHOENIX REVIVE', this.player.pos.clone(), YELLOW, 3.0)
      );
      this.screenShake.trigger(16, 1.0);
    }

    // Every Phoenix Revive also restores +25 mana (capped at max).
    const revMana = Math.round(25 * this.mutations.manaGainMult);   // MANA DROUGHT (×1 outside Endless)
    this.player.mana = Math.min(this.player.maxMana, this.player.mana + revMana);
    this.floatingTexts.push(
      new FloatingText('+' + revMana + ' MANA', new Vec2(this.player.pos.x, this.player.pos.y + 18), CYAN, 2.0)
    );

    this.audio?.playPhoenixRevive(this.phoenixReviveType);
  }

  // ─── Draw ─────────────────────────────────────────────────────────────────
  // Layer order:
  // 1. Background image
  // 2. Power Matrices
  // 3. Data-Cores (ground)
  // 4. Enemies
  // 5. Player
  // 6. Projectiles (regular + homing + EMP rings + particles)
  // 7. HUD (floating texts, vignette, overlays)

  draw(ctx) {
    if (this.gameState === 'start_menu') {
      this._drawStartMenu(ctx);
      return;
    }
    if (this.gameState === 'character_select') {
      this._drawCharacterSelect(ctx);
      return;
    }
    if (this.gameState === 'exit_screen') {
      this._drawExitScreen(ctx);
      return;
    }
    if (this.gameState === 'upgrades') {
      this._drawUpgradesScreen(ctx);
      return;
    }
    if (this.gameState === 'achievements') {
      this._drawAchievementsScreen(ctx);
      return;
    }
    if (this.gameState === 'credits') {
      this._drawCreditsScreen(ctx);
      return;
    }
    if (this.gameState === 'instructions') {
      this._drawInstructionsScreen(ctx);
      return;
    }
    if (this.gameState === 'audio_settings') {
      this._drawAudioSettings(ctx);
      return;
    }
    if (this.gameState !== 'playing') {
      this._drawBackground(ctx);
      return;
    }

    // ── Camera-space block (world entities) ─────────────────────────────────
    // Zoom out slightly so more of the battlefield is visible (Endless zooms out a touch more).
    ctx.save();
    ctx.scale(this._viewScale, this._viewScale);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 1 ── World Background
    this._drawWorldBackground(ctx);

    // 1·5 ── Readability scrim: gently darken the busy neon map so the player, enemies, cores and
    // Nexus (all drawn AFTER this) clearly pop. Covers only the visible view; no layout/bounds change.
    ctx.fillStyle = 'rgba(2,6,16,0.30)';
    ctx.fillRect(this.camera.x, this.camera.y, this._viewW, this._viewH);

    // 1a ── Boss Lava/Fire Rain zones (ground markers — under entities so they read as terrain)
    this._drawBossLava(ctx);
    this._drawEndlessHazards(ctx);   // Endless-only: cyclone funnel + airstrike ships/rockets

    // 2 ── Power Matrices (fill-based glow + counter owned by PowerMatrix; overload drives danger blink)
    for (const m of this.matrices) {
      if (this.endless) this._drawEndlessNexusBase(ctx, m);   // sprite UNDER the matrix (Endless only)
      m.draw(ctx, this.overload / MAX_OVERLOAD);              // core indicators/status stay on top
    }

    // 3 ── Data-Cores: GOLD and SILVER only, each a distinct SILHOUETTE in a distinct HUE
    // so they never read as generic white particles. GOLD = warm amber spinning starburst
    // (premium/rare); SILVER = cool steel-blue spinning hexagon. Both have a blinking glow.
    const nowCore = performance.now() / 1000;
    for (const core of this.groundCores) {
      const gold = core.type === 'gold';
      const x = core.pos.x, y = core.pos.y;
      const body  = gold ? '#ffc21a' : '#9fb6d6';   // saturated amber  vs  cool steel-blue
      const edge  = gold ? '#fff0a0' : '#e2edff';
      const glowC = gold ? '#ff9d00' : '#6fd0ff';   // warm  vs  cool — instantly distinguishable
      // Pronounced BLINK (abs-sine → visible on/off pulse); gold blinks faster & brighter.
      const blink = gold ? (0.50 + 0.50 * Math.abs(Math.sin(nowCore * 4.5 + x * 0.05)))
                         : (0.45 + 0.45 * Math.abs(Math.sin(nowCore * 3.2 + x * 0.05)));
      const r = gold ? 14 : 11;

      // Blinking outer halo (carries the glow identity; cheap — no per-shape shadowBlur)
      drawGlow(ctx, x, y, r * 2.2, glowC, (gold ? 0.85 : 0.6) * blink);

      // Solid shaped body in its own hue (no white center → not a generic orb)
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(nowCore * (gold ? 0.9 : -0.6));
      ctx.fillStyle   = body;
      ctx.strokeStyle = edge;
      ctx.lineWidth   = gold ? 2.5 : 2;
      ctx.beginPath();
      if (gold) {
        for (let k = 0; k < 8; k++) {                 // sharp 4-point starburst
          const a = (Math.PI / 4) * k, rad = (k % 2 === 0) ? r : r * 0.42;
          const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
      } else {
        for (let k = 0; k < 6; k++) {                 // hexagon
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Blinking ring around the core for extra recognition during crowded fights
      ctx.save();
      ctx.globalAlpha = (gold ? 0.9 : 0.7) * blink;
      ctx.strokeStyle = glowC;
      ctx.lineWidth   = gold ? 2 : 1.5;
      ctx.beginPath(); ctx.arc(x, y, r + (gold ? 6 : 5), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // 3a ── HP CELL recovery pickups
    this._drawHealthPickups(ctx);
    this._drawManaPickups(ctx);

    // 3b ── Aqua Spirit Trail puddles (ground terrain — under entities so they read as footprints)
    this._drawAquaPuddles(ctx);
    this._drawSpiritKicks(ctx);

    // 4 ── Enemies
    // Offscreen draw-cull (drawing only — update/collision/gameplay run elsewhere). Generous margin
    // so nothing pops at the edges. Reused by projectiles + enemy bullets below.
    const _cam = this.camera, _vw = this._viewW, _vh = this._viewH, _M = 96;
    const _off = (pos) => pos.x < _cam.x - _M || pos.x > _cam.x + _vw + _M || pos.y < _cam.y - _M || pos.y > _cam.y + _vh + _M;
    for (const e of this.enemies) {
      if (_off(e.pos)) continue;   // offscreen — skip draw
      // Readability: a soft dark contour just outside each normal enemy so it separates from the
      // bright neon background (the enemy body/sprite below covers the inside → thin dark outline).
      // Cheap (no shadowBlur), bosses/mega keep their own framing. Visual only — no behavior change.
      if (!e.isBoss() && !e.isMegaBoss) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,6,12,0.5)'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 1.5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      e.draw(ctx);
    }

    // 4a ── Support drones (drawn between enemies and titan so they appear above enemies)
    for (const d of this.supportDrones) d.draw(ctx);
    for (const d of this.allyDrones)    d.draw(ctx);   // persistent Auto-Forge Drone allies

    // 4b ── AI Overload Titan mini-boss
    this._drawTitan(ctx);
    this._drawAnnihilator(ctx);
    this._drawBloodfang(ctx);

    // 4b ── Grid Cache supply drop crate
    if (this.gridCache) {
      const { pos, timer } = this.gridCache;
      const sz = 48;
      const r0 = sz / 2;
      // Continuous neon beacon — breathing pulse (alpha + gentle radius expansion)
      const ph     = Date.now() / 240;
      const pulse  = 0.5 + 0.5 * Math.sin(ph);   // 0..1 alpha pulse
      const expand = 1 + 0.16 * Math.sin(ph);    // breathing radius
      // Layered additive glow: gold outer, purple secondary, bright cyan core
      drawGlow(ctx, pos.x, pos.y, (r0 + 22) * expand, YELLOW, 0.22 + 0.16 * pulse);
      drawGlow(ctx, pos.x, pos.y, (r0 + 13) * expand, PURPLE, 0.24 + 0.16 * pulse);
      drawGlow(ctx, pos.x, pos.y,  r0 + 4,            CYAN,   0.45 + 0.25 * pulse);
      // Pulsing neon rings — cyan inner + expanding gold outer
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * pulse;
      ctx.strokeStyle = CYAN;   ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, (r0 + 6)  * expand, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.30 + 0.35 * pulse;
      ctx.strokeStyle = YELLOW; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, (r0 + 16) * expand, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      // Sprite or cyan-square fallback
      const spr = this._gridCacheSprite;
      if (spr && spr.complete && spr.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(spr, Math.round(pos.x - sz / 2), Math.round(pos.y - sz / 2), sz, sz);
        ctx.imageSmoothingEnabled = true;
      } else {
        ctx.fillStyle = CYAN;
        ctx.fillRect(Math.round(pos.x - sz / 2), Math.round(pos.y - sz / 2), sz, sz);
      }
      // Countdown bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(Math.round(pos.x - sz / 2), Math.round(pos.y + sz / 2 + 4), sz, 4);
      ctx.fillStyle = CYAN;
      ctx.fillRect(Math.round(pos.x - sz / 2), Math.round(pos.y + sz / 2 + 4), Math.round(sz * (timer / 20)), 4);
    }

    // 5 ── Player (Thunder Solo guitar + aura drawn first so the skeleton sits in front of them)
    // Endless-only contact shadow at the hero's feet — grounds the player on the flat Stage 02 arena.
    if (this.endless) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(this.player.pos.x, this.player.pos.y + 22, 20, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this._drawThunderSoloGuitar(ctx);
    this._drawCyberBikeRush(ctx);   // Cyber Ride speeder sits under the rider (Neon Taekwondo Girl)
    // Digital Singularity OWNS the player while active (it draws the dissolving/reforming sprite
    // in screen space), so skip the normal world-space player draw during the ultimate.
    if (!(this.player.selectedCharacter === 'japan_phasewalker' && this._digitalSingularity?.isActive())) {
      this.player.draw(ctx, this._lastMousePos || { x: 0, y: 0 });
    }
    this._drawUltAura(ctx);

    // 6 ── Projectiles, homing discs, EMP rings, particles
    for (const p of this.projectiles) { if (!p.hidden && !_off(p.pos)) p.draw(ctx); }   // keep character-specific attack sprite identity (assassin base shot drawn hidden)
    this._drawEuclidKit(ctx);       // Euclid Vector toxin sniper / katanas / plague (world-space)
    for (const d of this.homingDiscs) d.draw(ctx);
    this._drawChainLightning(ctx);
    this._drawNeonPierceBeam(ctx);
    this._drawSkyfall(ctx);         // Brawler ultimate impacts
    this._drawCrescentSlashes(ctx); // Brawler secondary
    this._drawChakrams(ctx);        // Brawler primary
    this._drawChromePhantom(ctx);   // Assassin ultimate (clone overlays + burst rings)
    this._drawShuriken(ctx);        // Assassin bounce weapon
    for (const r of this.empRings)    r.draw(ctx);
    for (const r of this._specialRings) {
      const alpha = r.life / r.maxLife;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.strokeStyle = r.color1; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(r.pos.x, r.pos.y, r.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = r.color2; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.pos.x, r.pos.y, r.radius * 0.85, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const t of this._specialTrail) {
      ctx.save(); ctx.globalAlpha = t.alpha;
      ctx.fillStyle = CYAN;
      ctx.beginPath(); ctx.arc(t.x, t.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const b of this._specialBeams) {
      const alpha = b.life / b.maxLife;
      const endX = b.startPos.x + b.dir.x * b.length;
      const endY = b.startPos.y + b.dir.y * b.length;
      ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round';
      ctx.strokeStyle = '#ff6600'; ctx.lineWidth = Math.round(12 * alpha);
      ctx.beginPath(); ctx.moveTo(b.startPos.x, b.startPos.y); ctx.lineTo(endX, endY); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.round(4 * alpha);
      ctx.beginPath(); ctx.moveTo(b.startPos.x, b.startPos.y); ctx.lineTo(endX, endY); ctx.stroke();
      ctx.restore();
    }
    this.particles.draw(ctx);

    // 6c ── Enemy bullets
    for (const b of this.enemyBullets) {
      if (_off(b.pos)) continue;   // offscreen — skip draw
      drawGlow(ctx, b.pos.x, b.pos.y, b.radius * 2, b.color, 0.5);
      ctx.fillStyle   = b.color;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.stroke();
    }

    // 6d ── Final-boss CORRUPTION beam + novas (on top of entities for readability)
    this._drawBossCorruption(ctx);

    // 6b ── Phoenix revive effect (epic multi-layer, world-space)
    if (this.phoenixReviveTimer > 0) {
      const elapsed = 3.0 - this.phoenixReviveTimer;           // 0 at birth → 3 at end
      const alpha   = Math.max(0, this.phoenixReviveTimer / 3.0);
      const rtype   = this.phoenixReviveType || 'orange';
      const px = this.player.pos.x;
      const py = this.player.pos.y;

      // ── per-tier colour config ──────────────────────────────────────────
      let tintRGBA, coreColor, ringColor, sparkColor, pimg, sprSz;
      if (rtype === 'blue') {
        tintRGBA   = `rgba(0,160,255,${(alpha * 0.32).toFixed(3)})`;
        coreColor  = '#00e6ff';
        ringColor  = '#0099ff';
        sparkColor = '#aaeeff';
        pimg       = this._phoenixBlueImage;
        sprSz      = 165;
      } else if (rtype === 'gold') {
        tintRGBA   = `rgba(255,200,0,${(alpha * 0.45).toFixed(3)})`;
        coreColor  = '#ffdd00';
        ringColor  = '#ff8800';
        sparkColor = '#ffe066';
        pimg       = this._phoenixGoldImage;
        sprSz      = 200;
      } else {
        tintRGBA   = `rgba(255,140,0,${(alpha * 0.40).toFixed(3)})`;
        coreColor  = '#ff8800';
        ringColor  = '#ffaa00';
        sparkColor = '#ff6600';
        pimg       = this._phoenixImage;
        sprSz      = 150;
      }

      // ── Layer 1: full-screen tint (softened so the revive isn't an overwhelming flash) ──
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = tintRGBA;
      ctx.fillRect(this.camera.x, this.camera.y, this._viewW, this._viewH);   // cover the zoomed-out view
      ctx.restore();

      // ── Layer 2: radial gradient burst ─────────────────────────────────
      {
        const gr = 50 + elapsed * 40;
        const grd = ctx.createRadialGradient(px, py, 0, px, py, gr);
        const gc  = rtype === 'blue' ? '0,200,255' : rtype === 'gold' ? '255,210,0' : '255,160,0';
        grd.addColorStop(0, `rgba(${gc},${(alpha * 0.55).toFixed(3)})`);
        grd.addColorStop(1, `rgba(${gc},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(px, py, gr, 0, Math.PI * 2); ctx.fill();
      }

      // ── Layer 3: phoenix sprite (or fallback glow rings) ────────────────
      if (pimg && pimg.complete && pimg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha          = Math.min(1, alpha * 1.8);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pimg, px - sprSz / 2, py - sprSz, sprSz, sprSz);
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
      } else {
        // Fallback: two concentric glow rings
        ctx.save();
        ctx.strokeStyle = coreColor;
        ctx.lineWidth   = 6;
        ctx.globalAlpha = alpha * 0.9;
        ctx.beginPath(); ctx.arc(px, py, 40 + elapsed * 18, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth   = 3;
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath(); ctx.arc(px, py, 62 + elapsed * 24, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

      // ── Layer 4: shockwave ring(s) ──────────────────────────────────────
      const drawRing = (delay, lw, maxR) => {
        const t = elapsed - delay;
        if (t <= 0) return;
        const r  = t * 200;
        if (r > maxR) return;
        const rA = Math.max(0, (1 - r / maxR)) * alpha;
        ctx.save();
        ctx.strokeStyle = ringColor;
        ctx.lineWidth   = lw;
        ctx.globalAlpha = rA;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      };
      drawRing(0,    5, 190);
      if (rtype !== 'orange') drawRing(0.28, 3, 165);
      if (rtype === 'gold')   drawRing(0.50, 2, 145);

      // ── Layer 5: radial spark particles ────────────────────────────────
      {
        const SPARKS = rtype === 'gold' ? 24 : rtype === 'blue' ? 16 : 8;
        ctx.save();
        for (let i = 0; i < SPARKS; i++) {
          const angle = (i / SPARKS) * Math.PI * 2;
          const dist  = elapsed * (90 + (i % 4) * 25);
          const sx    = px + Math.cos(angle) * dist;
          const sy    = py + Math.sin(angle) * dist;
          const pA    = Math.max(0, 1 - dist / 380) * alpha;
          if (pA <= 0) continue;
          ctx.globalAlpha = pA;
          ctx.fillStyle   = sparkColor;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(1, 4 - elapsed * 1.2), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── Layer 6: rising feather streaks (blue / gold only) ─────────────
      if (rtype !== 'orange') {
        const STREAKS = rtype === 'gold' ? 12 : 8;
        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 0; i < STREAKS; i++) {
          const angle  = ((i / STREAKS) * Math.PI * 2) - Math.PI / 2;
          const spread = 70 + (i % 3) * 45;
          const rise   = elapsed * 160;
          const sx     = px + Math.cos(angle) * spread;
          const sy     = py + Math.sin(angle) * spread - rise;
          const sA     = Math.max(0, 1 - elapsed / 2.2) * alpha;
          if (sA <= 0) continue;
          ctx.globalAlpha = sA;
          ctx.strokeStyle = coreColor;
          ctx.lineWidth   = rtype === 'gold' ? 3 : 2;
          ctx.beginPath();
          ctx.moveTo(sx, sy + 22);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          // small dot at tip
          ctx.fillStyle = sparkColor;
          ctx.globalAlpha = sA * 0.8;
          ctx.beginPath();
          ctx.arc(sx, sy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.globalAlpha = 1;
    }

    // Floating texts (world-space)
    for (const ft of this.floatingTexts) ft.draw(ctx);

    this._drawThunderSoloWorld(ctx);   // ultimate lightning rain + musical notes over world entities
    this._drawOverheatedChains(ctx);   // Cyber Arm Hero ultimate: rotating fiery chains around the hero
    this._drawSpiritDojang(ctx);       // Neon Taekwondo Girl ultimate: cyan dojo field + flag at cast point

    this._drawComboPopups(ctx);        // combo milestone popups (world-space, on top of the action)

    this._drawPlayerMarker(ctx);       // clear "you are here" marker — above every world effect

    ctx.restore();  // end camera-space block

    this._drawPhasewalkerFx(ctx);      // Japan Phasewalker glitch-dash / EMP / singularity (screen-space; guards on character)
    this._drawOniFx(ctx);           // Oni Protocol 0 (screen-space; guards on character)
    this._drawThunderSoloScreen(ctx);  // darken + fullscreen lightning flash (under HUD)

    // ── Screen-space block (HUD, overlays) ───────────────────────────────────
    this._drawAcidRain(ctx);
    this._drawGridCacheArrow(ctx);
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, WIDTH, 44);

    drawHUD(ctx, this);
    this._drawObjectiveIndicators(ctx);   // wayfinding: arrow to nearest Nexus (carrying) / core (early)
    this._drawOnboarding(ctx);            // first-minute objective callout + fading hints (Act 1)
    drawVignette(ctx, this.overload, this.timeAlive);
    drawDamagePulse(ctx, this.damageFlash, this.damageFlashIntensity, DMG_PULSE.duration);
    this._drawScanlines(ctx);
    this._drawAnnouncement(ctx);

    if (this.upgradeUI) this.upgradeUI.draw(ctx, this.player, this);
    if (this.mutationUI) this.mutationUI.draw(ctx, this.player, this);
    if (this.victory)        this._drawVictoryScreen(ctx);
    else if (this.gameOver)  drawEndScreen(ctx, this);

    if (this.paused && !this.gameOver && !this.victory) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.font      = '46px Consolas, monospace';
      ctx.fillStyle = YELLOW;
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', WIDTH / 2, HEIGHT / 2);
      ctx.font      = '22px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.fillText('Press ESC to resume', WIDTH / 2, HEIGHT / 2 + 50);
      ctx.textAlign = 'left';
    }
  }

  _drawStartMenu(ctx) {
    // Background — use the new clean background image, fall back to city bg
    const bg = this._menuBg;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
    } else {
      // Until the menu art loads, paint a plain dark backdrop — NOT _drawBackground(), which
      // renders the city/grid world and reads as an Act 1 "map flash" on the first frame.
      const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, '#05080f'); g.addColorStop(1, '#02040a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // Light tint only — the background already carries the CYBER-GRID PROTOCOL logo, so we
    // keep it readable without washing the art out. (No "PHENIX SURVIVORS" text — title is the logo.)
    ctx.fillStyle = 'rgba(2,6,14,0.32)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ── Menu zone — premium cyber-glass buttons, dropped BELOW the logo so START GAME never
    // overlaps "PROTOCOL". Layout constants are mirrored in main.js start_menu click hit-test. ──
    // spacing/startY sized so the full list (up to 9 items with ENDLESS MODE) clears the bottom
    // nav-hint; mirrored in main.js start_menu click hit-test.
    const startY = 292, spacing = 46, BW = 360, BH = 42;
    const cx = WIDTH / 2;
    for (let i = 0; i < this.menuItems.length; i++) {
      const yc  = startY + i * spacing;
      const bx  = cx - BW / 2;
      const by  = yc - BH / 2;
      const sel = i === this.menuIndex;

      ctx.save();
      // Dark translucent glass panel
      ctx.fillStyle = sel ? 'rgba(6,34,52,0.66)' : 'rgba(6,12,22,0.5)';
      ctx.beginPath(); ctx.roundRect(bx, by, BW, BH, 9); ctx.fill();
      // Thin neon border (cyan glow when selected, dim purple otherwise)
      if (sel) {
        ctx.shadowColor = CYAN; ctx.shadowBlur = 14;
        ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = 'rgba(140,110,210,0.42)'; ctx.lineWidth = 1;
      }
      ctx.beginPath(); ctx.roundRect(bx, by, BW, BH, 9); ctx.stroke();
      ctx.restore();

      // Selected accent tick on the left edge
      if (sel) {
        ctx.fillStyle = CYAN;
        ctx.fillRect(bx + 7, by + 9, 3, BH - 18);
      }

      ctx.font      = sel ? 'bold 22px Consolas, monospace' : '20px Consolas, monospace';
      ctx.fillStyle = sel ? '#e9ffff' : 'rgba(214,226,238,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText(this.menuItems[i], cx, yc + 7);
    }

    // ── Help zone — navigation hint at the very bottom ──
    ctx.font      = '14px Consolas, monospace';
    ctx.fillStyle = 'rgba(200,210,225,0.62)';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ W/S  Navigate     ENTER / Click  Select', WIDTH / 2, HEIGHT - 20);

    // ── Recommended-age / content notice (subtle, secondary) ──
    ctx.font      = '11px Consolas, monospace';
    ctx.fillStyle = 'rgba(170,185,205,0.5)';
    ctx.fillText('Recommended Age: 12+ · Fantasy Violence · Flashing Lights', WIDTH / 2, HEIGHT - 6);

    // ── Early Demo / WIP label (subtle, top-left corner — clear of the centered logo) ──
    ctx.textAlign = 'left';
    ctx.font      = '11px Consolas, monospace';
    ctx.fillStyle = 'rgba(160,175,195,0.42)';
    ctx.fillText('Early Demo / Work in Progress', 14, 22);

    // ── Protocol Fragments balance (rare Endless progression currency; subtle, top-right) ──
    ctx.textAlign = 'right';
    ctx.font      = 'bold 12px Consolas, monospace';
    ctx.fillStyle = 'rgba(125,249,255,0.78)';
    ctx.fillText('◆ Protocol Fragments: ' + this.meta.getProtocolFragments(), WIDTH - 14, 24);
    ctx.textAlign = 'left';
  }

  // ── Wave announcement system ──────────────────────────────────────────────

  // Boss/miniboss center-screen warning. In Endless, collapse repeats so a boss loop warns
  // once (not once per boss/respawn in the loop); Act 1 keeps its original per-boss warning.
  _bossAnnounce(text, color) {
    if (this.endless) {
      if (this._bossWarnCd > 0) return;
      this._bossWarnCd = BOSS_WARN_COOLDOWN;
    }
    this.triggerAnnouncement(text, color);
  }

  // Endless boss/miniboss alert (warning sound + center text), throttled to once per loop window.
  // Only called from Endless-gated paths (boss rotation), so no endless guard is needed here.
  _endlessBossAlert(text, color) {
    if (this._bossWarnCd > 0) return;
    this._bossWarnCd = BOSS_WARN_COOLDOWN;
    this.audio?.playBossWarning();
    this.triggerAnnouncement(text, color);
  }

  triggerAnnouncement(text, color) {
    this.announcement = { text, color, phase: 'fadein', timer: 0 };
    const WAVE_EVENTS = ['DRONE SWARM', 'CORE RAIDERS', 'SECURITY MECH', 'OVERLOAD SURGE', 'HUNTER SQUAD'];
    if (WAVE_EVENTS.some(w => text.includes(w))) {
      this.score = (this.score ?? 0) + 100;
    }
  }

  _updateAnnouncement(dt) {
    const a = this.announcement;
    if (!a) return;
    const FADE_IN = 0.35, HOLD = 1.9, FADE_OUT = 0.55;
    a.timer += dt;
    if (a.phase === 'fadein'  && a.timer >= FADE_IN)  { a.phase = 'hold';    a.timer = 0; }
    if (a.phase === 'hold'    && a.timer >= HOLD)     { a.phase = 'fadeout'; a.timer = 0; }
    if (a.phase === 'fadeout' && a.timer >= FADE_OUT) { this.announcement = null; }
  }

  _drawAnnouncement(ctx) {
    const a = this.announcement;
    if (!a) return;
    const FADE_IN = 0.35, HOLD = 1.9, FADE_OUT = 0.55;
    let alpha = 1;
    if (a.phase === 'fadein')  alpha = a.timer / FADE_IN;
    if (a.phase === 'fadeout') alpha = 1 - (a.timer / FADE_OUT);
    alpha = Math.max(0, Math.min(1, alpha));

    const panelW = Math.min(820, WIDTH - 60);
    const panelH = 76;
    const panelX = Math.round(WIDTH  / 2 - panelW / 2);
    const panelY = Math.round(HEIGHT / 2 - 100);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Dark backing panel
    ctx.fillStyle = 'rgba(0,0,12,0.84)';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    // Colored border top + bottom
    ctx.strokeStyle = a.color;
    ctx.lineWidth   = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    // Subtle inner glow line at top
    ctx.strokeStyle = a.color;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = alpha * 0.35;
    ctx.beginPath();
    ctx.moveTo(panelX + 4, panelY + 4);
    ctx.lineTo(panelX + panelW - 4, panelY + 4);
    ctx.stroke();
    ctx.globalAlpha = alpha;

    // Event text
    ctx.font      = 'bold 30px Consolas, monospace';
    ctx.fillStyle = a.color;
    ctx.textAlign = 'center';
    ctx.fillText(a.text, WIDTH / 2, panelY + 47);

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────

  // Secret-skin roster (flag key → display name). Single source of truth shared by
  // the Victory screen and Character Select so the two never drift.
  _secretSkins() {
    return [
      { key: 'golden_skeleton_warrior', name: 'Cyber Skeleton Warrior' },
      { key: 'dark_cyber_arm_hero',     name: 'Neon Cyber Arm Hero'    },
      { key: 'grandmaster_dojang_girl', name: 'Grandmaster Dojang Girl' },
    ];
  }

  // Framed skin thumbnail. Unlocked → bright preview + neon frame; locked → darkened
  // silhouette + padlock. Missing image degrades to a '?' placeholder (never crashes).
  _drawSkinThumb(ctx, key, cx, topY, w, h, unlocked) {
    const x   = Math.round(cx - w / 2);
    const img = this._skinImages[key];

    ctx.fillStyle = unlocked ? 'rgba(12,24,40,0.92)' : 'rgba(6,10,18,0.92)';
    ctx.beginPath(); ctx.roundRect(x, topY, w, h, 6); ctx.fill();

    if (img && img.complete && img.naturalWidth > 0) {
      const pad = 6, aw = w - pad * 2, ah = h - pad * 2;
      const s   = Math.min(aw / img.naturalWidth, ah / img.naturalHeight);
      const dw  = Math.round(img.naturalWidth * s);
      const dh  = Math.round(img.naturalHeight * s);
      const dx  = Math.round(cx - dw / 2);
      const dy  = Math.round(topY + (h - dh) / 2);
      ctx.drawImage(img, dx, dy, dw, dh);
      if (!unlocked) {
        ctx.fillStyle = 'rgba(0,0,0,0.74)';
        ctx.beginPath(); ctx.roundRect(x, topY, w, h, 6); ctx.fill();
      }
    } else {
      ctx.fillStyle = unlocked ? PURPLE : '#33414f';
      ctx.font = 'bold 46px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', cx, topY + h / 2 + 16);
    }

    ctx.lineWidth   = 2;
    ctx.strokeStyle = unlocked ? PURPLE : '#2d3c4b';
    ctx.beginPath(); ctx.roundRect(x, topY, w, h, 6); ctx.stroke();

    if (!unlocked) {
      // Simple padlock glyph (vector — no emoji font dependency)
      const ly = topY + h / 2;
      ctx.strokeStyle = '#9fb0c0'; ctx.fillStyle = '#9fb0c0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, ly - 6, 8, Math.PI, 0); ctx.stroke();
      ctx.fillRect(cx - 11, ly - 2, 22, 16);
    }
  }

  // ─── Victory screen ───────────────────────────────────────────────────────────
  // Shown when the run is WON (this.victory). Cyberpunk end card + secret-skin reveal.
  // Loss still uses drawEndScreen(); this method is victory-only and additive.
  _drawVictoryScreen(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,14,0.95)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // (Removed the small floating victory_logo thumbnail at the top — the screen now reads as a
    // clean premium end card driven by the text hierarchy below, no misplaced image.)
    ctx.textAlign = 'center';

    const line = (text, y, size, color, bold = false) => {
      ctx.font      = `${bold ? 'bold ' : ''}${size}px Consolas, monospace`;
      ctx.fillStyle = color;
      ctx.fillText(text, WIDTH / 2, y);
    };

    line('THANK YOU FOR PLAYING',          80,  38, GREEN, true);
    line('THE CYBER GRID HAS BEEN SAVED',  116, 24, CYAN);
    line('MADE BY InkSpireM Visuals',      150, 18, WHITE);
    line('MUSIC BY Tsali',                 174, 18, WHITE);
    line('SYSTEM LOG #1985 FOUND',         210, 18, YELLOW);
    line('SYSTEM LOG #1983 FOUND',         234, 18, YELLOW);
    line('ACCESS GRANTED...',              268, 20, GREEN);
    line('SECRET SKINS UNLOCKED',          304, 26, PURPLE, true);

    // Three unlocked skin previews
    const skins = this._secretSkins();
    const tw = 120, th = 130, topY = 322;
    const centers = [WIDTH / 2 - 180, WIDTH / 2, WIDTH / 2 + 180];
    for (let i = 0; i < skins.length; i++) {
      this._drawSkinThumb(ctx, skins[i].key, centers[i], topY, tw, th, true);
      ctx.font = '13px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'center';
      ctx.fillText(skins[i].name, centers[i], topY + th + 20);
    }

    // Two buttons — rects kept in sync with main.js click handler.
    // RETURN TO MAIN MENU (left, x 328–628) • CONTINUE — ENDLESS (right, x 652–952).
    const BW = 300, BH = 50, BY = 540, GAP = 24;
    const LBX = Math.round(WIDTH / 2 - BW - GAP / 2);   // 328
    const RBX = Math.round(WIDTH / 2 + GAP / 2);        // 652
    const btn = (bx, label, border) => {
      ctx.fillStyle   = 'rgba(0,20,40,0.92)';
      ctx.strokeStyle = border;
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.roundRect(bx, BY, BW, BH, 6); ctx.fill(); ctx.stroke();
      ctx.font      = 'bold 19px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'center';
      ctx.fillText(label, bx + BW / 2, BY + BH / 2 + 7);
    };
    btn(LBX, 'RETURN TO MAIN MENU', CYAN);
    btn(RBX, 'CONTINUE — ENDLESS', GREEN);

    ctx.font      = '15px Consolas, monospace';
    ctx.fillStyle = '#5a7080';
    ctx.textAlign = 'center';
    ctx.fillText('Click a button to continue  •  ESC returns to Main Menu', WIDTH / 2, 616);

    ctx.textAlign = 'left';
    ctx.restore();
  }

  // Outfit toggle bar (top-centre): OUTFIT: [ DEFAULT ] [ SECRET | LOCKED ] for the
  // highlighted character, + a short unlock hint when the secret outfit is locked.
  _drawOutfitBar(ctx) {
    const charId   = this.characters[this.characterIndex].id;
    // Characters without a defined secret outfit (e.g. Brawler Warrior, Phase 1) show no bar.
    if (!CHARACTER_OUTFITS[charId]?.secret) return;
    const equipped = this.meta?.getSelectedOutfit(charId) || 'default';
    const secretOk = this.meta?.isOutfitUnlocked(charId, 'secret') === true;
    const { defaultRect, secretRect } = this._outfitBtnRects();

    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = '#9fb8c8';
    ctx.textAlign = 'center';
    ctx.fillText('OUTFIT', WIDTH / 2, defaultRect.y - 8);

    const btn = (rect, label, selected, enabled) => {
      ctx.fillStyle   = selected ? 'rgba(0,230,255,0.16)' : 'rgba(8,18,30,0.85)';
      ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 5); ctx.fill();
      ctx.lineWidth   = selected ? 2.5 : 1.5;
      ctx.strokeStyle = selected ? CYAN : (enabled ? '#3a5e74' : '#33414f');
      ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 5); ctx.stroke();
      ctx.font      = 'bold 15px Consolas, monospace';
      ctx.fillStyle = selected ? CYAN : (enabled ? WHITE : '#5a7080');
      ctx.textAlign = 'center';
      ctx.fillText(label, rect.x + rect.w / 2, rect.y + 21);
    };

    btn(defaultRect, 'DEFAULT', equipped === 'default', true);
    btn(secretRect, secretOk ? 'SECRET' : 'LOCKED', equipped === 'secret', secretOk);

    if (!secretOk) {
      const hint = charId === 'brawler_warrior'
        ? 'Secret outfit locked — LOG #1997: survive 18:00 in Endless as Brawler Warrior'
        : charId === 'assassin_clone'
        ? 'Secret outfit locked — LOG #1998: survive 15:00 in Endless as Assassin Clone'
        : 'Secret outfit locked — win a run to unlock it';
      ctx.font      = '12px Consolas, monospace';
      ctx.fillStyle = '#6a8090';
      ctx.textAlign = 'center';
      ctx.fillText(hint, WIDTH / 2, secretRect.y + secretRect.h + 16);
    }
    ctx.textAlign = 'left';
  }

  _drawCharacterSelect(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 48px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('SELECT YOUR CHARACTER', WIDTH / 2, 100);

    // Outfit toggle for the highlighted character (cosmetic equip).
    this._drawOutfitBar(ctx);

    // 2-row character grid (see _charCardLayout — mirrored by main.js hit-test + the secret strip).
    const _lay = this._charCardLayout();
    const cardHeight = _lay.cardH;   // reused by the PF-hint / secret-strip positioning below
    const PORTRAIT_SCALE = { brawler_warrior: 0.88, assassin_clone: 0.88, japan_phasewalker: 0.88, euclid_vector: 0.88 };

    for (let i = 0; i < this.characters.length; i++) {
      const char = this.characters[i];
      const r = _lay.cards[i];
      const x = r.x, y = r.y, cardWidth = r.w;
      const unlocked = this.meta.isCharacterUnlocked(char.id);

      if (i === this.characterIndex) { ctx.strokeStyle = YELLOW; ctx.lineWidth = 4; }
      else { ctx.strokeStyle = unlocked ? WHITE : '#4a5a68'; ctx.lineWidth = 2; }
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      // Portrait — equipped secret skin if loaded, else default, else fallback circle. Height-locked
      // to a shared feet baseline so all portraits read consistently in the smaller 2-row card.
      let cimg = this._charImages[char.id];
      if (this.meta?.getSelectedOutfit(char.id) === 'secret') {
        const sk   = CHARACTER_OUTFITS[char.id]?.secret?.unlockKey;
        const simg = sk && this._skinImages[sk];
        if (simg && simg.complete && simg.naturalWidth > 0) cimg = simg;
      }
      if (cimg && cimg.complete && cimg.naturalWidth > 0) {
        const baseY = y + 6 + 96;                                       // shared feet baseline
        const imgH  = Math.round(96 * (PORTRAIT_SCALE[char.id] || 1));
        const imgW  = Math.round(cimg.naturalWidth * (imgH / cimg.naturalHeight));
        ctx.drawImage(cimg, x + (cardWidth - imgW) / 2, baseY - imgH, imgW, imgH);
      } else {
        ctx.fillStyle = char.fallbackColor;
        ctx.beginPath(); ctx.arc(x + cardWidth / 2, y + 54, 40, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = char.fallbackAlt; ctx.lineWidth = 3; ctx.stroke();
      }

      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillStyle = WHITE; ctx.textAlign = 'center';
      ctx.fillText(char.name, x + cardWidth / 2, y + cardHeight - 22);
      ctx.font = 'italic 10px Consolas, monospace';
      ctx.fillStyle = '#AAAAAA';
      ctx.fillText(char.role, x + cardWidth / 2, y + cardHeight - 8);

      if (!unlocked) {
        ctx.fillStyle = 'rgba(4,10,18,0.72)'; ctx.fillRect(x, y, cardWidth, cardHeight);
        const lx = x + cardWidth / 2, ly = y + cardHeight / 2;
        ctx.strokeStyle = '#9fb0c0'; ctx.fillStyle = '#9fb0c0'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(lx, ly - 8, 10, Math.PI, 0); ctx.stroke();
        ctx.fillRect(lx - 13, ly, 26, 18);
        ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = '#c8d6e2'; ctx.textAlign = 'center';
        ctx.fillText('LOCKED', lx, ly + 34);
      }
    }

    // Unlock hint for the highlighted locked character.
    // Protocol Fragments balance (top-right) — visible whenever choosing a character.
    ctx.font = 'bold 13px Consolas, monospace';
    ctx.fillStyle = 'rgba(125,249,255,0.82)';
    ctx.textAlign = 'right';
    ctx.fillText('◆ Protocol Fragments: ' + this.meta.getProtocolFragments(), WIDTH - 18, 40);

    const selChar = this.characters[this.characterIndex];
    ctx.textAlign = 'center';
    if (!this.meta.isCharacterUnlocked(selChar.id)) {
      const pfCost = PF_CHARACTER_COSTS[selChar.id];
      if (pfCost) {
        // PF-locked Endless character — hint + clickable UNLOCK panel (per-character).
        const have = this.meta.getProtocolFragments(), afford = have >= pfCost;
        ctx.font = 'bold 13px Consolas, monospace';
        ctx.fillStyle = '#ffcf6a';
        ctx.fillText('Unlock with Protocol Fragments in Endless progression.', WIDTH / 2, 620);
        const r = this._pfUnlockBtnRect();
        if (r) {
          ctx.fillStyle   = afford ? 'rgba(6,40,52,0.82)' : 'rgba(20,14,22,0.7)';
          ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill();
          ctx.strokeStyle = afford ? '#7df9ff' : '#5a4a55'; ctx.lineWidth = afford ? 2 : 1;
          ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.stroke();
          ctx.font = 'bold 14px Consolas, monospace';
          ctx.fillStyle = afford ? '#dffaff' : '#9a8fa0';
          ctx.fillText(`UNLOCK — ${pfCost} ◆ PF   (have ${have})`, WIDTH / 2, r.y + 26);
          if (this._pfMsg && performance.now() < this._pfMsgUntil) {
            ctx.font = '12px Consolas, monospace'; ctx.fillStyle = '#ffd0e0';
            ctx.fillText(this._pfMsg, WIDTH / 2, r.y + r.h + 18);
          }
        }
      } else {
        ctx.font = 'bold 14px Consolas, monospace';
        ctx.fillStyle = '#ffcf6a';
        ctx.fillText('Reach 10:00 in Endless Mode to unlock Brawler Warrior.', WIDTH / 2, 620);
      }
    }

    // ── Secret skins strip — each preview sits DIRECTLY under its matching character card.
    // Positions are tied to character IDs (same card layout), never sorted by filename/alpha.
    ctx.font      = 'bold 15px Consolas, monospace';
    ctx.fillStyle = PURPLE;
    ctx.textAlign = 'center';
    ctx.fillText('◆  SECRET SKINS  ◆', WIDTH / 2, 508);

    // Secret skins — their OWN centered row (decoupled from the 2-row card grid). Only characters
    // that actually have a secret outfit appear, so there is never an empty slot or overlap.
    const secretChars = this.characters.filter(c => CHARACTER_OUTFITS[c.id]?.secret);
    const stW = 52, stH = 50, stGap = 28, stTop = 518;
    const stRowW = secretChars.length * stW + (secretChars.length - 1) * stGap;
    let stCx = Math.round(WIDTH / 2 - stRowW / 2) + stW / 2;
    for (const c of secretChars) {
      const secret   = CHARACTER_OUTFITS[c.id].secret;
      const key      = secret.unlockKey;
      const unlocked = this.meta?.isUnlocked(key) === true;
      this._drawSkinThumb(ctx, key, stCx, stTop, stW, stH, unlocked);
      ctx.font = '11px Consolas, monospace'; ctx.fillStyle = unlocked ? WHITE : '#78919f'; ctx.textAlign = 'center';
      ctx.fillText(secret.name, stCx, stTop + stH + 13);
      ctx.font = 'bold 11px Consolas, monospace'; ctx.fillStyle = unlocked ? GREEN : '#5a7080';
      ctx.fillText(unlocked ? 'UNLOCKED' : 'LOCKED', stCx, stTop + stH + 27);
      stCx += stW + stGap;
    }

    ctx.font = '14px Consolas, monospace';
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.fillText('← → Select • ↑ ↓ Outfit • ENTER Confirm • ESC Back', WIDTH / 2, HEIGHT - 12);
  }

  _drawExitScreen(ctx) {
    this._drawBackground(ctx);
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Main message
    ctx.font = 'bold 48px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('Game stopped.', WIDTH / 2, HEIGHT / 2 - 80);

    ctx.font = '36px Consolas, monospace';
    ctx.fillStyle = WHITE;
    ctx.fillText('You can close this tab now.', WIDTH / 2, HEIGHT / 2 - 20);

    // Instructions
    ctx.font = '22px Consolas, monospace';
    ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
    ctx.fillText('Press ENTER or ESC to return to Start Menu', WIDTH / 2, HEIGHT / 2 + 80);

    ctx.textAlign = 'left';
  }

  _updateCreditsScreen(input) {
    const { keys } = input;
    if (keys.has('escape')) {
      this.goToMainMenu();
      keys.delete('escape');
    }
  }

  _updateInstructionsScreen(input) {
    const { keys } = input;
    if (keys.has('escape')) {
      this.goToMainMenu();
      keys.delete('escape');
    }
  }

  _drawInstructionsScreen(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const pw = 1140, ph = 580;
    const px = Math.round((WIDTH  - pw) / 2);
    const py = Math.round((HEIGHT - ph) / 2);

    // Dark-glass panel with vertical gradient + dual cyan/magenta neon frame.
    const ig = ctx.createLinearGradient(0, py, 0, py + ph);
    ig.addColorStop(0, 'rgba(6,18,34,0.97)'); ig.addColorStop(1, 'rgba(2,6,14,0.98)');
    ctx.fillStyle = ig;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(255,77,210,0.30)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 5, py + 5, pw - 10, ph - 10);

    // Title with neon glow
    ctx.textAlign = 'center';
    ctx.save();
    ctx.font      = 'bold 38px Consolas, monospace';
    ctx.shadowColor = CYAN; ctx.shadowBlur = 16;
    ctx.fillStyle = CYAN;
    ctx.fillText('HOW TO PLAY', WIDTH / 2, py + 46);
    ctx.restore();

    // Gradient separator
    const isg = ctx.createLinearGradient(px + 50, 0, px + pw - 50, 0);
    isg.addColorStop(0, 'rgba(0,230,255,0)'); isg.addColorStop(0.5, 'rgba(255,77,210,0.55)'); isg.addColorStop(1, 'rgba(0,230,255,0)');
    ctx.strokeStyle = isg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + 50, py + 58); ctx.lineTo(px + pw - 50, py + 58); ctx.stroke();

    ctx.textAlign = 'left';
    const lx  = px + 28;
    const lh  = 17;
    let   cy  = py + 80;

    // Left content sub-panel (dark glass) behind the text column — premium two-column feel.
    ctx.fillStyle = 'rgba(0,12,26,0.55)';
    ctx.fillRect(px + 16, py + 66, 552, ph - 92);
    ctx.strokeStyle = 'rgba(0,230,255,0.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 16, py + 66, 552, ph - 92);

    // Premium section header — magenta accent block + neon label + underline rule.
    const header = (label) => {
      ctx.fillStyle = '#ff4dd2';
      ctx.fillRect(lx, cy - 11, 4, 15);
      ctx.font      = 'bold 15px Consolas, monospace';
      ctx.fillStyle = CYAN;
      ctx.fillText(label, lx + 12, cy);
      ctx.strokeStyle = 'rgba(0,230,255,0.30)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lx + 12, cy + 7); ctx.lineTo(lx + 524, cy + 7); ctx.stroke();
      cy += 23;
    };
    const bullet = (text, color = WHITE) => {
      ctx.font = '13px Consolas, monospace'; ctx.fillStyle = color;
      ctx.fillText('• ' + text, lx + 6, cy); cy += lh;
    };

    // ── OBJECTIVE ──────────────────────────────────────────────
    header('OBJECTIVE — DEFEND THE NEXUS GRID');
    bullet('Hold the Four Nexus matrices (8 cores each — 32 total).');
    bullet('Recover dropped Data-Cores and return them to a Nexus.');
    bullet('Stop raiders from stealing cores; keep the grid charged.');
    bullet('Keep Network Overload below 100% or the grid is lost.');
    cy += 8;

    // ── CONTROLS ───────────────────────────────────────────────
    header('CONTROLS');
    const controls = [
      ['WASD / Arrows', 'Move'],
      ['Auto-Fire',     'Targets nearest enemy  (T toggles)'],
      ['SHIFT',         'Dash'],
      ['SPACE',         'Ultimate — per character (100 mana)'],
      ['Q  /  E',       'Pulse Shield  /  EMP stun burst'],
      ['M  /  F',       'Mute  /  Fullscreen'],
      ['ESC',           'Pause / Back'],
    ];
    controls.forEach(([k, a]) => {
      ctx.font = 'bold 12px Consolas, monospace'; ctx.fillStyle = YELLOW;
      ctx.fillText(k, lx + 6, cy);
      ctx.font = '12px Consolas, monospace'; ctx.fillStyle = WHITE;
      ctx.fillText('—  ' + a, lx + 150, cy);
      cy += lh;
    });
    cy += 8;

    // ── COMBAT & UPGRADES ──────────────────────────────────────
    header('COMBAT & UPGRADES');
    bullet('Level up to pick upgrade cards & weapon mastery cards.');
    bullet('Corrosive Payload adds damage-over-time to your attacks.');
    bullet('Mana fuels your Ultimate; pickups & deposits refill it.');
    bullet('Phoenix Revive: one automatic revive when you fall.');
    bullet('Beware Acid Rain — a spreading area hazard.', '#b6ff8c');
    cy += 8;

    // ── ENDLESS & SECRETS ──────────────────────────────────────
    header('ENDLESS & SECRETS');
    bullet('Win Act 1, then Continue — Endless (Stage 02: Neon Shinjuku).');
    bullet('Elite Waves escalate; reach 10:00 to unlock Brawler Warrior.');
    bullet('Achievements grant Endless-only Protocols & special Cards.', '#c8a8ff');
    bullet('Secret skins: LOG #1997 (Brawler) & LOG #1998 (Assassin) — locked.', '#d9b6ff');

    // ── ANIMATED TUTORIAL PANELS (right column) ─────────────────
    const PANEL_DURATION = 3.5;
    const now      = Date.now() / 1000;
    const panelIdx = Math.floor(now / PANEL_DURATION) % 5;
    const t        = (now % PANEL_DURATION) / PANEL_DURATION;

    const tpX  = px + 596;
    const tpY  = py + 68;
    const tpW  = pw - 596 - 24;
    const tpH  = 415;
    const tpCX = tpX + tpW / 2;

    // Vertical divider
    ctx.strokeStyle = 'rgba(0,230,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 584, py + 65);
    ctx.lineTo(px + 584, py + ph - 55);
    ctx.stroke();

    // Tutorial "help-monitor" — dark-glass screen with scanlines + dual neon frame + corner ticks.
    const mg = ctx.createLinearGradient(0, tpY, 0, tpY + tpH);
    mg.addColorStop(0, 'rgba(2,12,24,0.9)'); mg.addColorStop(1, 'rgba(0,4,12,0.92)');
    ctx.fillStyle = mg;
    ctx.fillRect(tpX, tpY, tpW, tpH);
    ctx.save();
    ctx.beginPath(); ctx.rect(tpX, tpY, tpW, tpH); ctx.clip();
    ctx.strokeStyle = 'rgba(0,230,255,0.05)'; ctx.lineWidth = 1;
    for (let sy = tpY + 3; sy < tpY + tpH; sy += 4) { ctx.beginPath(); ctx.moveTo(tpX, sy); ctx.lineTo(tpX + tpW, sy); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,200,255,0.45)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(tpX, tpY, tpW, tpH);
    ctx.strokeStyle = 'rgba(255,77,210,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(tpX + 4, tpY + 4, tpW - 8, tpH - 8);
    const tc = 14;
    ctx.strokeStyle = '#ff4dd2'; ctx.lineWidth = 2;
    [[tpX, tpY, tc, 0, 0, tc], [tpX + tpW, tpY, -tc, 0, 0, tc],
     [tpX, tpY + tpH, tc, 0, 0, -tc], [tpX + tpW, tpY + tpH, -tc, 0, 0, -tc]].forEach(([ox, oy, hx, hy, vx, vy]) => {
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + hx, oy + hy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + vx, oy + vy); ctx.stroke();
    });

    // Panel title
    const panelTitles = [
      'COLLECT DATA-CORES',
      'RETURN TO POWER MATRIX',
      'STOP NETWORK OVERLOAD',
      'SURVIVE ENEMY WAVES',
      'PHOENIX REVIVE',
    ];
    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText(panelTitles[panelIdx], tpCX, tpY + 26);

    this._drawTutorialPanel(ctx, panelIdx, t, tpX, tpY, tpW, tpH);

    // Dot indicators
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i === panelIdx ? CYAN : 'rgba(0,200,255,0.25)';
      ctx.beginPath();
      ctx.arc(tpCX - 32 + i * 16, tpY + tpH + 16, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── BACK button ────────────────────────────────────────────
    const bw = 160, bh = 40;
    const bx = Math.round(WIDTH / 2 - bw / 2);
    const by = py + ph - 52;

    ctx.fillStyle   = '#0a1820';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.font      = 'bold 14px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('◄  BACK', bx + bw / 2, by + 26);

    // ── Safety / content note (in the clear area below the panel; subtle, two lines) ──
    ctx.font      = '12px Consolas, monospace';
    ctx.fillStyle = 'rgba(180,195,215,0.6)';
    ctx.fillText('Recommended Age: 12+. This game contains fantasy combat, flashing neon effects, explosions,', WIDTH / 2, py + ph + 22);
    ctx.fillText('enemy combat, and intense sci-fi action. Parental guidance is recommended for younger players.', WIDTH / 2, py + ph + 40);

    ctx.textAlign = 'left';
  }

  _drawTutorialPanel(ctx, idx, t, tpX, tpY, tpW, tpH) {
    const cx    = tpX + tpW / 2;
    const ey    = tpY + 200;
    const descY = tpY + 355;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '13px Consolas, monospace';

    // Helpers: draw a real game sprite (aspect-preserved) with a boolean "was it drawn" result,
    // and a premium player token (cyan glow + ring). Used so the mini-tutorial reads game-like.
    const drawSprite = (img, x, y, size) => {
      if (img && img.complete && img.naturalWidth > 0) {
        const w = size, h = size * (img.naturalHeight / img.naturalWidth);
        ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
        return true;
      }
      return false;
    };
    const drawPlayerToken = (x, y) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45;
      ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
    };

    switch (idx) {
      case 0: { // COLLECT DATA-CORES
        const reached = t > 0.55;
        const playerX = reached
          ? cx + 60
          : cx - 90 + 150 * (t / 0.55);
        const coreX = cx + 60;

        if (!reached) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
          ctx.save();
          ctx.globalAlpha = 0.35 * pulse;
          ctx.fillStyle   = YELLOW;
          ctx.beginPath(); ctx.arc(coreX, ey, 22, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          if (!drawSprite(this._coreSprite, coreX, ey, 30)) {   // real Data-Core sprite
            ctx.fillStyle   = YELLOW;
            ctx.beginPath(); ctx.arc(coreX, ey, 8, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(coreX, ey, 8, 0, Math.PI * 2); ctx.stroke();
          }
          const arrowA = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 500));
          ctx.save();
          ctx.globalAlpha = arrowA;
          ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(playerX + 17, ey);
          ctx.lineTo(playerX + 29, ey);
          ctx.moveTo(playerX + 25, ey - 5);
          ctx.lineTo(playerX + 29, ey);
          ctx.lineTo(playerX + 25, ey + 5);
          ctx.stroke();
          ctx.restore();
        } else {
          const flashA = Math.max(0, 1 - (t - 0.55) * 6);
          ctx.save();
          ctx.globalAlpha = flashA;
          ctx.fillStyle   = YELLOW;
          ctx.beginPath(); ctx.arc(coreX, ey, 20, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }

        drawPlayerToken(playerX, ey);

        ctx.fillStyle = WHITE;
        ctx.fillText('Enemies steal Data-Cores from Power Matrices.', cx, descY);
        ctx.fillText('Walk over them to pick them up.', cx, descY + 20);
        break;
      }

      case 1: { // RETURN TO POWER MATRIX
        const matX   = cx + 110;
        const startX = cx - 100;
        const arrived = t > 0.6;
        const playerX = arrived
          ? matX - 28
          : startX + (matX - 28 - startX) * (t / 0.6);

        const matFlash = arrived ? Math.max(0, 1 - (t - 0.6) * 5) : 0;
        if (matFlash > 0) {   // bright pulse ring on deposit
          ctx.save(); ctx.globalAlpha = matFlash; ctx.strokeStyle = WHITE; ctx.lineWidth = 3;
          ctx.strokeRect(matX - 26, ey - 26, 52, 52); ctx.restore();
        }
        if (!drawSprite(this._matrixSprite, matX, ey, 56)) {   // real Power Matrix / Nexus sprite
          ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
          ctx.strokeRect(matX - 22, ey - 22, 44, 44);
          ctx.fillStyle = 'rgba(0,220,255,0.12)';
          ctx.fillRect(matX - 22, ey - 22, 44, 44);
          ctx.font = 'bold 10px Consolas, monospace'; ctx.fillStyle = CYAN;
          ctx.fillText('NEXUS', matX, ey + 4);
          ctx.font = '13px Consolas, monospace';
        }

        drawPlayerToken(playerX, ey);

        if (!arrived) {
          const angle = Date.now() / 400;
          ctx.fillStyle = YELLOW;
          ctx.beginPath();
          ctx.arc(playerX + Math.cos(angle) * 18, ey + Math.sin(angle) * 18, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        if (arrived) {
          const popA = Math.max(0, 1 - (t - 0.6) * 4);
          ctx.save();
          ctx.globalAlpha = popA;
          ctx.fillStyle   = GREEN;
          ctx.font        = 'bold 14px Consolas, monospace';
          ctx.fillText('+25', matX, ey - 38);
          ctx.font        = '13px Consolas, monospace';
          ctx.restore();
        }

        ctx.fillStyle = WHITE;
        ctx.fillText('Return carried cores to a Power Matrix', cx, descY);
        ctx.fillText('to stabilize the grid and earn score.', cx, descY + 20);
        break;
      }

      case 2: { // STOP NETWORK OVERLOAD
        const rising = t < 0.5;
        const overloadPct = rising
          ? t * 2 * 0.85
          : 0.85 - (t - 0.5) * 2 * 0.65;

        const barW = 320, barH = 28;
        const barX = cx - barW / 2;
        const barY = ey - 14;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX, barY, barW, barH);

        const barColor = overloadPct > 0.6 ? RED : overloadPct > 0.35 ? ORANGE : CYAN;
        ctx.fillStyle  = barColor;
        ctx.fillRect(barX, barY, Math.round(barW * overloadPct), barH);
        ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.font      = 'bold 13px Consolas, monospace';
        ctx.fillStyle = WHITE;
        ctx.textAlign = 'left';
        ctx.fillText('NETWORK OVERLOAD', barX, barY - 10);
        ctx.fillStyle = barColor;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(overloadPct * 100)}%`, barX + barW, barY - 10);
        ctx.textAlign = 'center';
        ctx.font      = '13px Consolas, monospace';
        ctx.fillStyle = rising ? RED : GREEN;
        ctx.fillText(
          rising ? '▲ Cores stolen — Overload rising!' : '▼ Cores returned — Overload dropping!',
          cx, barY + barH + 22
        );

        ctx.fillStyle = WHITE;
        ctx.fillText('If Overload reaches 100% the run ends.', cx, descY);
        ctx.fillText('Slot cores into the Matrix to keep it low.', cx, descY + 20);
        break;
      }

      case 3: { // SURVIVE ENEMY WAVES
        const phase = t < 0.35 ? 'approach' : t < 0.6 ? 'fire' : t < 0.8 ? 'hit' : 'reset';
        const positions = [
          [cx - 140, ey - 45], [cx + 150, ey + 25], [cx + 15, ey - 85],
        ];
        const approachF = phase === 'approach' ? (t / 0.35) : 1;

        drawPlayerToken(cx, ey);

        for (let i = 0; i < 3; i++) {
          const [eposX, eposY] = positions[i];
          const offX  = eposX < cx ? tpX - 20 : tpX + tpW + 20;
          const drawX = offX + (eposX - offX) * approachF;
          const drawY = eposY;
          const dead  = (phase === 'hit' || phase === 'reset') && i === 1;

          if (!dead) {
            ctx.fillStyle   = '#CC2244';
            ctx.beginPath(); ctx.arc(drawX, drawY, 10, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#FF4466'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(drawX, drawY, 10, 0, Math.PI * 2); ctx.stroke();
          } else if (phase === 'hit') {
            const explodeT = (t - 0.6) / 0.2;
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - explodeT);
            ctx.fillStyle   = ORANGE;
            for (let s = 0; s < 6; s++) {
              const ang  = (s / 6) * Math.PI * 2;
              const dist = explodeT * 22;
              ctx.beginPath();
              ctx.arc(eposX + Math.cos(ang) * dist, eposY + Math.sin(ang) * dist, 3, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }

        if (phase === 'fire' || phase === 'hit') {
          const fireT = phase === 'fire' ? (t - 0.35) / 0.25 : 1;
          const [tx2, ty2] = positions[1];
          const projX = cx + (tx2 - cx) * Math.min(1, fireT * 1.4);
          const projY = ey + (ty2 - ey) * Math.min(1, fireT * 1.4);
          if (fireT < 1) {
            ctx.fillStyle = CYAN;
            ctx.beginPath(); ctx.arc(projX, projY, 4, 0, Math.PI * 2); ctx.fill();
          }
        }

        ctx.fillStyle = WHITE;
        ctx.fillText('Auto-fire at enemies, dash with SHIFT, and use specials to survive.', cx, descY);
        ctx.fillText('Killing enemies earns XP and score.', cx, descY + 20);
        break;
      }

      case 4: { // PHOENIX REVIVE
        let hpPct, showBurst;
        if (t < 0.35) {
          hpPct     = 1 - (t / 0.35);
          showBurst = false;
        } else if (t < 0.65) {
          hpPct     = 0;
          showBurst = true;
        } else {
          hpPct     = (t - 0.65) / 0.35 * 0.5;
          showBurst = false;
        }

        const barW = 280, barH = 22;
        const barX = cx - barW / 2;
        const barY = ey - 75;
        const pcy  = ey + 15;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX, barY, barW, barH);
        const hpColor = hpPct > 0.5 ? GREEN : hpPct > 0.25 ? ORANGE : RED;
        if (hpPct > 0) {
          ctx.fillStyle = hpColor;
          ctx.fillRect(barX, barY, Math.round(barW * hpPct), barH);
        }
        ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
        ctx.font      = 'bold 12px Consolas, monospace';
        ctx.fillStyle = WHITE;
        ctx.textAlign = 'left';
        ctx.fillText('HP', barX - 30, barY + 15);
        ctx.textAlign = 'center';
        ctx.font = '13px Consolas, monospace';

        if (showBurst) {
          const burstT = (t - 0.35) / 0.3;
          const radius = burstT * 75;
          const alpha  = Math.max(0, 1 - burstT);
          ctx.save();
          ctx.globalAlpha = alpha * 0.55;
          ctx.fillStyle   = ORANGE;
          ctx.beginPath(); ctx.arc(cx, pcy, radius, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = YELLOW; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(cx, pcy, radius, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
          ctx.fillStyle = ORANGE;
          ctx.font      = 'bold 14px Consolas, monospace';
          ctx.fillText('❆ PHOENIX REVIVE ❆', cx, pcy + 5);
          ctx.font = '13px Consolas, monospace';
        }

        ctx.save();
        ctx.globalAlpha = showBurst ? 0.3 : 1;
        drawPlayerToken(cx, pcy);
        ctx.restore();

        ctx.fillStyle = WHITE;
        ctx.fillText('When HP hits 0, Phoenix Revive activates.', cx, descY);
        ctx.fillText('Up to 3 revives are available per run.', cx, descY + 20);
        break;
      }
    }

    ctx.restore();
  }

  _drawCreditsScreen(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.84)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Outer panel
    const pw = 780, ph = 460;
    const px = WIDTH  / 2 - pw / 2;   // 250
    const py = HEIGHT / 2 - ph / 2 - 10; // 115

    // Dark-glass panel with a subtle vertical gradient (deep cyber blue → near-black).
    const pg = ctx.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, 'rgba(6,18,34,0.97)'); pg.addColorStop(1, 'rgba(2,6,14,0.98)');
    ctx.fillStyle = pg;
    ctx.fillRect(px, py, pw, ph);
    // Dual neon frame: cyan outer + magenta accent inner — premium cyber border.
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(255,77,210,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 5, py + 5, pw - 10, ph - 10);

    ctx.textAlign = 'center';

    // Title with neon glow
    ctx.save();
    ctx.font      = 'bold 44px Consolas, monospace';
    ctx.shadowColor = CYAN; ctx.shadowBlur = 18;
    ctx.fillStyle = CYAN;
    ctx.fillText('CREDITS', WIDTH / 2, py + 52);
    ctx.restore();

    // Gradient separator (cyan → magenta → cyan)
    const sg = ctx.createLinearGradient(px + 50, 0, px + pw - 50, 0);
    sg.addColorStop(0, 'rgba(0,230,255,0)'); sg.addColorStop(0.5, 'rgba(255,77,210,0.6)'); sg.addColorStop(1, 'rgba(0,230,255,0)');
    ctx.strokeStyle = sg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + 50, py + 70); ctx.lineTo(px + pw - 50, py + 70); ctx.stroke();

    // ── Two creator cards ───────────────────────────────────────────────────
    const cardW = 340, cardH = 300, cardY = py + 82;
    const cards = [
      { x: px + 25,          label: 'CREATED BY',      name: 'InkSpireM Visuals', img: this._creditImgInk   },
      { x: px + 25 + cardW + 25, label: 'MUSIC', name: 'TSALI',
        tracks: ['Menu Theme: "HOPE" by TSALI', 'Gameplay Theme: "PHENIX OVERDRIVE" by TSALI'],
        img: this._creditImgTsali },
    ];

    for (const card of cards) {
      const cx = card.x, cy = cardY;

      // Dark-glass card with a vertical gradient + faint scanlines (premium cyber monitor look).
      const cg = ctx.createLinearGradient(0, cy, 0, cy + cardH);
      cg.addColorStop(0, 'rgba(8,22,40,0.95)'); cg.addColorStop(1, 'rgba(2,8,18,0.95)');
      ctx.fillStyle = cg;
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.save();
      ctx.beginPath(); ctx.rect(cx, cy, cardW, cardH); ctx.clip();
      ctx.strokeStyle = 'rgba(0,230,255,0.05)'; ctx.lineWidth = 1;
      for (let sy = cy + 3; sy < cy + cardH; sy += 4) { ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(cx + cardW, sy); ctx.stroke(); }
      ctx.restore();
      // Dual border: cyan outer + magenta accent inner.
      ctx.strokeStyle = 'rgba(0,230,255,0.6)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = 'rgba(255,77,210,0.30)'; ctx.lineWidth = 1;
      ctx.strokeRect(cx + 4, cy + 4, cardW - 8, cardH - 8);

      const midX = cx + cardW / 2;

      // Section label — stronger, glowing header
      ctx.save();
      ctx.font      = 'bold 15px Consolas, monospace';
      ctx.shadowColor = 'rgba(255,210,60,0.7)'; ctx.shadowBlur = 8;
      ctx.fillStyle = YELLOW;
      ctx.fillText(card.label, midX, cy + 28);
      ctx.restore();

      // Creator name (or track list for music card)
      if (card.tracks) {
        ctx.font      = '13px Consolas, monospace';
        ctx.fillStyle = CYAN;
        ctx.fillText(card.tracks[0], midX, cy + 44);
        ctx.fillStyle = YELLOW;
        ctx.fillText(card.tracks[1], midX, cy + 62);
      } else {
        ctx.font      = 'bold 18px Consolas, monospace';
        ctx.fillStyle = WHITE;
        ctx.fillText(card.name, midX, cy + 50);
      }

      // Photo area (pushed down slightly for music card to give track text room)
      const fw = 150, fh = 160;
      const fx = cx + (cardW - fw) / 2;
      const fy = card.tracks ? cy + 78 : cy + 65;

      // Draw photo or placeholder
      let photoDrawn = false;
      const img = card.img;
      if (img && img.complete && img.naturalWidth > 0) {
        const scale = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
        const sw = fw / scale, sh = fh / scale;
        const sx = (img.naturalWidth  - sw) / 2;
        const sy = (img.naturalHeight - sh) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(fx, fy, fw, fh);
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, fx, fy, fw, fh);
        ctx.restore();
        photoDrawn = true;
      }

      if (!photoDrawn) {
        ctx.fillStyle = 'rgba(0,20,40,0.8)';
        ctx.fillRect(fx, fy, fw, fh);
        ctx.font      = '13px Consolas, monospace';
        ctx.fillStyle = 'rgba(0,200,255,0.4)';
        ctx.fillText('[ no photo ]', midX, fy + fh / 2 + 5);
      }

      // Neon frame around photo
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
      ctx.strokeRect(fx, fy, fw, fh);
      // Corner L-accents (12px)
      const ca = 12;
      ctx.strokeStyle = YELLOW; ctx.lineWidth = 2;
      [[fx, fy, ca, 0, 0, ca], [fx+fw, fy, -ca, 0, 0, ca],
       [fx, fy+fh, ca, 0, 0, -ca], [fx+fw, fy+fh, -ca, 0, 0, -ca]].forEach(([ox, oy, hx, hy, vx, vy]) => {
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox+hx, oy+hy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox+vx, oy+vy); ctx.stroke();
      });

      // Name below photo
      ctx.font      = '13px Consolas, monospace';
      ctx.fillStyle = CYAN;
      ctx.fillText(card.name, midX, fy + fh + 22);

    }

    // ── BACK button ──────────────────────────────────────────────────────────
    const bw = 220, bh = 46;
    const bx = WIDTH / 2 - bw / 2;
    const by = py + ph - 60;
    ctx.fillStyle = 'rgba(0,230,255,0.08)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.font      = 'bold 21px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.fillText('[ BACK ]', WIDTH / 2, by + 30);

    // ESC hint
    ctx.font      = '13px Consolas, monospace';
    ctx.fillStyle = 'rgba(180,180,180,0.45)';
    ctx.fillText('ESC = Return to Menu', WIDTH / 2, HEIGHT - 16);

    ctx.textAlign = 'left';
  }

  // ─── Acid Rain weather event ──────────────────────────────────────────────

  _updateAcidRain(dt) {
    const ACID_DPS   = 10;    // damage per second to normal enemies (kills weak, hurts strong)
    const MINI_VULN  = 0.7;   // mini-bosses take 70% — strong, meaningful chip
    const MAIN_VULN  = 0.4;   // main boss takes 40% — reduced but still real

    if (this.acidRain) {
      const ar = this.acidRain;
      ar.timer       -= dt;
      ar.damageAccum += dt;

      // Purge tick once per second. Player is never damaged. No per-hit floating numbers/sounds
      // (avoids spam) — lethal hits route through _die for correct kill/score/XP attribution.
      if (ar.damageAccum >= 1.0) {
        ar.damageAccum -= 1.0;

        // Enemies in the main array (reverse index so _die can splice safely)
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e   = this.enemies[i];
          const dmg = e.isMegaBoss ? ACID_DPS * MAIN_VULN
                    : e.isBoss()   ? ACID_DPS * MINI_VULN
                    : ACID_DPS;
          e.hp -= dmg;
          if (e.hp <= 0) { e.hp = 0; e._die(this); }
        }

        // Separate mini-boss objects take strong-but-survivable chip (killable over time)
        for (const b of [this.titanBoss, this.annihilatorBoss, this.bloodfangBoss]) {
          if (b && b.hp > 0) b.hp = Math.max(0, b.hp - ACID_DPS * MINI_VULN);
        }
        if (this.titanBoss && this.titanBoss.hp <= 0)             this._titanDie();
        if (this.annihilatorBoss && this.annihilatorBoss.hp <= 0) this._annihilatorDie();
        if (this.bloodfangBoss && this.bloodfangBoss.hp <= 0)     this._bloodfangDie();
      }

      if (ar.timer <= 0) {
        this.acidRain      = null;
        this.acidRainTimer = 138; // 138 = 150s start-to-start − 12s event duration → rains 2.5 min apart
      }
      return;
    }

    this.acidRainTimer -= dt;
    if (this.acidRainTimer <= 0) {
      this.acidRain = { timer: 12, damageAccum: 0 };
      this.triggerAnnouncement('INCOMING ACID RAIN', GREEN);
      this.floatingTexts.push(
        new FloatingText('TOXIC RAIN PURGE', new Vec2(WIDTH / 2 - 120, HEIGHT / 2 - 70), GREEN, 2.5)
      );
      this.audio?.playEventWarning();
    }
  }

  // ─── Boss-combat fairness layer (Boss Threat audit, Steps 1–2) ─────────────
  // Single gate for DISCRETE incoming hits (enemy/boss bullets, beams, shockwaves, and any
  // future boss attack). Enforces dash + Phoenix i-frames uniformly so a dash reliably dodges,
  // honours the shared 0.5s hit grace so overlapping hits can't burst the player, and clamps to
  // a per-hit ceiling so no single blow one-shots. Returns true ONLY if damage actually landed —
  // callers should consume the projectile / relay side-effects only on a true result.
  // (Continuous contact + lava already respect dash inline and keep their own per-tick cadence.)
  // Central, source-agnostic damage pulse: fires when the player's HP drops this frame,
  // covering every damage route (contact, bullets, boss attacks, acid) without editing each
  // site. Intensity scales with HP lost, so big boss hits read stronger than chip/contact.
  // A min-gap stops sustained contact from strobing; big discrete hits bypass it.
  _updateDamagePulse(dt) {
    if (this.damageFlash > 0) {
      this.damageFlash -= dt;
      if (this.damageFlash <= 0) { this.damageFlash = 0; this.damageFlashIntensity = 0; }
    }
    if (this._dmgPulseGap > 0) this._dmgPulseGap -= dt;

    const hpDrop = this._prevPlayerHp - this.player.hp;
    if (hpDrop > 0) {
      const big = hpDrop >= DMG_PULSE.bigHit;          // discrete hit vs dt-scaled chip/contact
      if (big || this._dmgPulseGap <= 0) {
        const intensity = clamp(DMG_PULSE.base + hpDrop * DMG_PULSE.slope, DMG_PULSE.base, 1.0);
        this.damageFlash          = DMG_PULSE.duration;
        this.damageFlashIntensity = Math.max(this.damageFlashIntensity, intensity);
        this._dmgPulseGap         = big ? 0.12 : DMG_PULSE.minGap;
      }
    }
    this._prevPlayerHp = this.player.hp;
  }

  // True only while the SPACE ultimate could actually be cast right now (mana-gated, per
  // character, not already mid-cast). Read-only — drives the one-shot "ready" cue.
  _ultimateReady() {
    const p = this.player;
    if (!p) return false;
    const hasUlt = p.selectedCharacter === 'skeleton_warrior'
                || p.selectedCharacter === 'cyber_arm_hero'
                || p.selectedCharacter === 'taekwondo_girl'
                || p.selectedCharacter === 'brawler_warrior'
                || p.selectedCharacter === 'assassin_clone';
    if (!hasUlt) return false;
    if (this.thunderSolo || this.overChains || this.spiritDojang || this._cyberBike || this._skyfall || this._chromePhantom) return false;  // mid-cast
    return p.mana >= ULTIMATE_MANA_COST;
  }

  // Fire the ready cue once on the rising edge of readiness (full → spend → recharge → fires
  // again). Sitting at full mana does NOT re-fire, so there is no constant flashing.
  _updateUltReady(dt) {
    if (this._ultReadyCue > 0) this._ultReadyCue -= dt;
    if (this._ultAura     > 0) this._ultAura     -= dt;
    const ready = this._ultimateReady();
    if (ready && !this._ultWasReady) {
      this._ultReadyCue = ULT_CUE.banner;
      this._ultAura     = ULT_CUE.aura;
    }
    this._ultWasReady = ready;
  }

  // Brief expanding character-colored ring around the player when the ultimate becomes ready.
  // World-space (scales with zoom); additive + short-lived, so it reads premium and costs nothing.
  _drawUltAura(ctx) {
    if (this._ultAura <= 0) return;
    const p   = this.player;
    const vis = p._getVisibilityColors();
    const t   = clamp(this._ultAura / ULT_CUE.aura, 0, 1);   // 1 → 0
    const r   = PLAYER_RADIUS + 8 + (1 - t) * 46;            // expands outward as it fades
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = vis.rim;
    ctx.lineWidth   = 3;
    ctx.globalAlpha = t * 0.6;
    ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = t * 0.3;
    ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, r * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ── Combo milestone popups (visual only) ────────────────────────────────────
  // Tasteful neon escalation by tier; bigger/brighter at higher combos.
  _comboTierStyle(c) {
    if (c >= 100) return { color: '#fff36a', font: 26 };   // bright gold-white
    if (c >= 50)  return { color: '#ffb030', font: 21 };   // gold/red
    if (c >= 25)  return { color: '#c060ff', font: 18 };   // purple/magenta
    return          { color: '#00e6ff', font: 16 };        // x10 cyan
  }

  _spawnComboPopup(c, pos) {
    const style = this._comboTierStyle(c);
    const at = (pos && pos.clone) ? pos.clone() : this.player.pos.clone();
    this.comboPopups.push({ text: `COMBO x${c}`, pos: at, color: style.color, font: style.font, t: 0, life: 0.95 });
    if (this.comboPopups.length > 4) this.comboPopups.shift();   // cap (anti-spam safety)
  }

  _updateComboPopups(dt) {
    if (!this.comboPopups.length) return;
    for (const cp of this.comboPopups) cp.t += dt;
    this.comboPopups = this.comboPopups.filter(cp => cp.t < cp.life);
  }

  _drawComboPopups(ctx) {
    if (!this.comboPopups.length) return;
    for (const cp of this.comboPopups) {
      const p     = cp.t / cp.life;                              // 0 → 1
      const tin   = Math.min(1, cp.t / 0.18);
      const scale = 0.45 + 0.55 * (1 - Math.pow(1 - tin, 3));    // quick ease-out pop to full
      const alpha = p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.4); // hold, then fade last 40%
      ctx.save();
      ctx.translate(cp.pos.x, cp.pos.y - 30 - p * 24);           // sits above the kill, rises as it fades
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${cp.font}px Consolas, monospace`;
      ctx.shadowColor = cp.color;
      ctx.shadowBlur  = 12 * (1 - p) + 4;                        // bright flash at spawn, settles
      ctx.lineWidth   = 4;
      ctx.strokeStyle = 'rgba(0,8,16,0.75)';
      ctx.strokeText(cp.text, 0, 0);
      ctx.fillStyle = cp.color;
      ctx.fillText(cp.text, 0, 0);
      ctx.restore();
    }
  }

  // `cap` overrides the per-hit ceiling for specific telegraphed, fully-dodgeable boss attacks
  // (e.g. the final-boss main beam). Defaults to BOSS_MAX_PLAYER_HIT so EVERY existing caller is
  // unchanged. This never touches player stats/damage — it only lets a signalled boss hit land harder.
  _damagePlayer(dmg, { color = RED, shake = 5, cap = BOSS_MAX_PLAYER_HIT } = {}) {
    if (this.player.dashTimer > 0 || this.phoenixReviveTimer > 0) return false;  // i-frames → dodged
    if (this.playerHitCooldown > 0) return false;                                // within 0.5s grace
    const applied = Math.min(dmg, cap);
    this.player.applyDamage(applied);
    this.playerHitCooldown = 0.5;
    this.screenShake.trigger(shake, 0.2);
    this.particles.spawnHitSparks(this.player.pos, color);
    this.floatingTexts.push(new FloatingText(`-${Math.ceil(applied)} HP`, this.player.pos.clone(), color, 0.7));
    return true;
  }

  // Primary-fire / auto-weapon soft cap: bounds how fast the player's MAIN weapons can burn a
  // boss down so high fire-rate builds can't melt bosses instantly. Damage past the per-second
  // cap is heavily diminished (not zeroed) so shooting always feels responsive. Uses a timeAlive
  // window so it works for both Enemy bosses and the plain mini-boss objects. Ultimates and DoT
  // have their own caps and intentionally do NOT route through here. Returns the effective damage.
  _capBossDamage(boss, rawDmg) {
    const cap = boss.isMegaBoss ? BOSS_DPS_CAP_MEGA : BOSS_DPS_CAP_MINI;
    const now = this.timeAlive;
    if (boss._dpsWindowStart === undefined || now - boss._dpsWindowStart >= 1.0) {
      boss._dpsWindowStart = now;
      boss._dpsAccum       = 0;
    }
    const room = Math.max(0, cap - (boss._dpsAccum || 0));
    const eff  = rawDmg <= room ? rawDmg : room + (rawDmg - room) * 0.2;   // diminishing past the cap
    boss._dpsAccum = (boss._dpsAccum || 0) + eff;
    return eff;
  }

  // Boss survival resistances — applied ONLY to boss targets (enemy-type bosses, the mega-boss,
  // and the singleton mini-bosses) so support drones still help and DoT still matters, but neither
  // melts a boss before its mechanics land. Returns the damage to actually apply.
  _isBossTarget(t) {
    return t === this.titanBoss || t === this.annihilatorBoss || t === this.bloodfangBoss
        || (typeof t.isBoss === 'function' && t.isBoss()) || t.isMegaBoss === true;
  }
  _resistDot(t, dmg)   { return this._isBossTarget(t) ? dmg * (1 - BOSS_DOT_RESIST)   : dmg; }
  _resistDrone(t, dmg) { return this._isBossTarget(t) ? dmg * (1 - BOSS_DRONE_RESIST) : dmg; }

  // ─── Main-boss danger behaviours (Lava Rain + mini-boss summons) ───────────
  // Gated on this.megaBoss. Lava Rain damages the PLAYER ONLY (never enemies/bosses);
  // it is a separate system from the player's Acid Rain.

  _updateBossAttacks(dt) {
    if (this._plasmaWarnCd > 0) this._plasmaWarnCd -= dt;   // throttles the REACTOR PLASMA warning
    // Advance active lava zones (warning → impact → expire). Player-only damage.
    if (this.bossLavaZones.length) {
      for (const z of this.bossLavaZones) {
        z.t += dt;
        if (z.t >= z.warn && z.t < z.warn + z.impact) {
          z.dmgAccum += dt;
          if (z.dmgAccum >= 1.0) {
            z.dmgAccum -= 1.0;
            if (this.phoenixReviveTimer <= 0 && this.player.dashTimer <= 0 &&
                distance(this.player.pos, z.pos) < z.radius) {
              this.player.applyDamage(z.dps * (1 - this.player.contactDamageReduction));
              if (this.playerHitCooldown <= 0) {
                this.playerHitCooldown = 0.5;
                this.screenShake.trigger(5, 0.2);
                this.particles.spawnHitSparks(this.player.pos, ORANGE);
                this.floatingTexts.push(
                  new FloatingText(`-${Math.ceil(z.dps)} HP`, this.player.pos.clone(), ORANGE, 0.6)
                );
              }
            }
          }
        }
      }
      this.bossLavaZones = this.bossLavaZones.filter(z => z.t < z.warn + z.impact);
    }

    // Advance the signature beam + novas every frame so active ones resolve even as the boss dies.
    this._updateCorruptionBeam(dt);
    this._updateCorruptionNovas(dt);

    // ── Endless-only ambient Lava Rain ── boss-INDEPENDENT area denial so the grid always has
    // pressure even between bosses. Reuses bossLavaZones (1.4s warn ring → impact), player-only
    // damage. Drops never land on the player (min 60px), so it stays dodgeable and fair.
    if (this.endless) {
      if (this._endlessLavaCd === undefined) this._endlessLavaCd = randomRange(18, 26);
      this._endlessLavaCd -= dt;
      if (this._endlessLavaCd <= 0) {
        this._endlessLavaCd = randomRange(16, 24);
        const count = 3 + Math.floor(Math.random() * 3);   // 3–5 drops per burst
        for (let i = 0; i < count; i++) {
          const ang  = Math.random() * Math.PI * 2;
          const dist = randomRange(60, 280);               // never guaranteed on the player
          const pos  = new Vec2(
            clamp(this.player.pos.x + Math.cos(ang) * dist, WORLD_MARGIN, WORLD_W - WORLD_MARGIN),
            clamp(this.player.pos.y + Math.sin(ang) * dist, WORLD_MARGIN, WORLD_H - WORLD_MARGIN)
          );
          this.bossLavaZones.push({ pos, radius: 70, warn: 1.4, impact: 1.3, t: 0, dmgAccum: 0, dps: 14 });
        }
        this.triggerAnnouncement('⚠ LAVA RAIN', ORANGE);
        this.audio?.playEventWarning();
      }
    }

    // Endless: keep the "final boss" attack suite alive across loops. After the first mega-boss dies,
    // later Rogue AI Overlords spawn as plain enemies — promote a live one so its corruption attacks
    // (bolts/beam/nova/lava) fire again instead of the boss going passive. Re-init phase on promotion.
    if (this.endless && (!this.megaBoss || this.megaBoss.hp <= 0)) {
      const o = this.enemies.find(e => e.enemyType === 'Rogue AI Overlord' && e.hp > 0);
      if (o) { o.isMegaBoss = true; o._phase = undefined; o._fullHp = undefined; this.megaBoss = o; }
    }

    const boss = this.megaBoss;
    if (!boss || boss.hp <= 0) return;

    // ── Phase tracking (HP-fraction gated): 1 = 100–70%, 2 = 70–35%, 3 = 35–0% ──
    if (boss._fullHp === undefined) boss._fullHp = boss.hp;   // capture full HP on first sight
    if (boss._phase  === undefined) boss._phase  = 1;
    const frac   = boss.hp / boss._fullHp;
    const target = frac > 0.70 ? 1 : frac > 0.35 ? 2 : 3;
    if (target > boss._phase) {
      boss._phase = target;
      if (target === 2) this.triggerAnnouncement('PHASE 2 — GRID CORRUPTION RISING', PURPLE);
      else              this.triggerAnnouncement('PHASE 3 — FINAL OVERRIDE', RED);
      this.screenShake.trigger(7, 0.5);
      this.audio?.playEventWarning();
    }
    const phase = boss._phase;
    const late  = this.currentMinute() >= 20 ? 0.7 : 1.0;   // attacks come faster past 20 min

    // ── Corruption bolts (ALL phases): aimed, visible, dodgeable energy projectiles ──
    if (boss.boltCd === undefined) boss.boltCd = randomRange(2, 3);
    boss.boltCd -= dt;
    if (boss.boltCd <= 0) {
      boss.boltCd = (phase === 1 ? randomRange(2.0, 3.0)
                   : phase === 2 ? randomRange(1.8, 2.6)
                   :               randomRange(1.3, 2.0)) * late;
      const base = safeNormalize(this.player.pos.sub(boss.pos));
      if (base.lengthSq() > 0) {
        const spread = phase === 3 ? [-0.13, 0.13] : [0];   // phase 3 fires a tight twin-bolt
        const dmg    = phase === 3 ? 12 : 10;               // 8–12 band
        for (const off of spread) {
          const c = Math.cos(off), s = Math.sin(off);
          const dir = new Vec2(base.x * c - base.y * s, base.x * s + base.y * c);
          this.spawnEnemyBullet(boss.pos.clone(), dir, 280, dmg, 9, PURPLE);
        }
        this.audio?.playEnemyShoot();
      }
    }

    // Phase 1 is a clean teaching phase — bolts only. Area denial begins in phase 2.
    if (phase < 2) return;

    // ── Lava Rain: telegraphed corruption zones (phase 2+, denser in phase 3) ──
    if (boss.lavaCd === undefined) boss.lavaCd = randomRange(3, 5);
    boss.lavaCd -= dt;
    if (boss.lavaCd <= 0) {
      boss.lavaCd = (phase === 3 ? randomRange(4.5, 6.5) : randomRange(6, 8)) * late;
      const count = (phase === 3 ? 4 : 3) + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const ang  = Math.random() * Math.PI * 2;
        // One drop can land directly ON the player; the 1.2s warn ring still makes it dodgeable.
        const onPlayerChance = 0.5 + this.mutations.plasmaOnPlayerChanceBonus;   // TARGETED PLASMA
        const dist = (i === 0 && Math.random() < onPlayerChance) ? randomRange(0, 26) : randomRange(40, 260);
        const pos  = new Vec2(
          clamp(this.player.pos.x + Math.cos(ang) * dist, WORLD_MARGIN, WORLD_W - WORLD_MARGIN),
          clamp(this.player.pos.y + Math.sin(ang) * dist, WORLD_MARGIN, WORLD_H - WORLD_MARGIN)
        );
        this.bossLavaZones.push({ pos, radius: 70, warn: 1.2, impact: 1.4, t: 0, dmgAccum: 0, dps: 16 });
      }
      // One warning per plasma burst window (no per-volley spam).
      if (!(this._plasmaWarnCd > 0)) {
        this._plasmaWarnCd = 14;
        this.triggerAnnouncement('⚠ REACTOR PLASMA', ORANGE);
      }
      this.audio?.playEventWarning();
    }

    // ── CORRUPTION GRID BEAM (signature, phase 2+): only one active at a time ──
    if (boss.beamCd === undefined) boss.beamCd = randomRange(6, 9);
    if (!this._corruptionBeam) {
      boss.beamCd -= dt;
      if (boss.beamCd <= 0) {
        boss.beamCd = (phase === 3 ? randomRange(7, 9) : randomRange(10, 12));
        this._corruptionBeam = {
          phase: 'charge', t: 0,
          origin: boss.pos.clone(),
          dir: safeNormalize(this.player.pos.sub(boss.pos)),
        };
        this.triggerAnnouncement('CORRUPTION BEAM', PURPLE);
        this.screenShake.trigger(3, 0.2);
        this.audio?.playEventWarning();
      }
    }

    // ── CORRUPTION NOVA (phase 2+): telegraphed radial burst centred on the boss ──
    if (boss.novaCd === undefined) boss.novaCd = randomRange(8, 12);
    boss.novaCd -= dt;
    if (boss.novaCd <= 0) {
      boss.novaCd = randomRange(8, 12);
      this._corruptionNovas.push({ pos: boss.pos.clone(), radius: FINAL_NOVA_RADIUS, warn: FINAL_NOVA_WARN, t: 0, hit: false });
      this.audio?.playEventWarning();
    }

    // ── STUN LANCE (phase 2+): telegraphed aim line tracks the player, then a locked stun bolt ──
    // Dangerous but fair: 0.8s warning line, dodgeable, small damage, 2s anti-lock immunity on hit.
    if (boss.stunCd === undefined) boss.stunCd = randomRange(7, 10);
    if (boss._stunAim) {
      boss._stunAim.t  += dt;
      boss._stunAim.dir = safeNormalize(this.player.pos.sub(boss.pos));   // telegraph tracks the player while charging
      if (boss._stunAim.t >= STUN_LANCE_CHARGE) {
        const dir = boss._stunAim.dir;
        if (dir.lengthSq() > 0)
          this.spawnEnemyBullet(boss.pos.clone(), dir, 340, 8, 11, CYAN, { stun: STUN_LANCE_DURATION });
        this.audio?.playEnemyShoot();
        boss._stunAim = null;
      }
    } else {
      boss.stunCd -= dt;
      if (boss.stunCd <= 0) {
        boss.stunCd = randomRange(9, 13) * late;
        boss._stunAim = { t: 0, dir: safeNormalize(this.player.pos.sub(boss.pos)) };
        this.audio?.playEventWarning();
      }
    }

    // ── Summon a reinforcement (phase 2+, capped so it never floods) ──
    if (boss.summonCd === undefined) boss.summonCd = randomRange(6, 9);
    boss.summonCd -= dt;
    if (boss.summonCd <= 0) {
      boss.summonCd = randomRange(12, 15) * late;
      const living = this.enemies.filter(e => e.enemyType === 'Security Defector Mech').length;
      if (living < 2) {
        const minion = new Enemy('Security Defector Mech', this.currentMinute());
        const ang = Math.random() * Math.PI * 2;
        minion.pos = new Vec2(
          clamp(boss.pos.x + Math.cos(ang) * 80, WORLD_MARGIN, WORLD_W - WORLD_MARGIN),
          clamp(boss.pos.y + Math.sin(ang) * 80, WORLD_MARGIN, WORLD_H - WORLD_MARGIN)
        );
        this.enemies.push(minion);
        this.floatingTexts.push(
          new FloatingText('BOSS SUMMONS REINFORCEMENT', new Vec2(WIDTH / 2 - 190, HEIGHT / 2 - 50), RED, 2.0)
        );
        this.audio?.playEventWarning();
      }
    }
  }

  // CORRUPTION GRID BEAM — charge (telegraph follows the player) → fire (locked thick beam).
  // Damage routes through _damagePlayer, so dash i-frames / hit grace / 30-HP ceiling all apply.
  _updateCorruptionBeam(dt) {
    const beam = this._corruptionBeam;
    if (!beam) return;
    const boss = this.megaBoss;
    beam.t += dt;

    if (beam.phase === 'charge') {
      if (!boss || boss.hp <= 0) { this._corruptionBeam = null; return; }   // source gone → cancel
      beam.origin = boss.pos.clone();
      beam.dir    = safeNormalize(this.player.pos.sub(boss.pos));            // telegraph follows the player
      if (beam.t >= FINAL_BEAM_CHARGE) {
        beam.phase = 'fire'; beam.t = 0;
        this.screenShake.trigger(5, 0.25);
        this.audio?.playTitanBeam?.();
      }
      return;
    }

    // fire phase — locked ray; perpendicular distance test against the player
    const o = beam.origin, d = beam.dir;
    const toP  = this.player.pos.sub(o);
    const proj = toP.dot(d);
    // One heavy strike per beam (≈50% max HP) — a clip costs half your HP, but a single beam can
    // never multi-tick you to death; the telegraph (charge tracks → locks) makes it fully dodgeable.
    if (!beam.struck && proj > 0 && proj < FINAL_BEAM_LEN) {
      const perp = Math.abs(-d.y * toP.x + d.x * toP.y);
      if (perp < FINAL_BEAM_HALFW + PLAYER_RADIUS) {
        const beamDmg = Math.round(this.player.maxHp * FINAL_BEAM_HP_FRAC);
        if (this._damagePlayer(beamDmg, { color: PURPLE, shake: 7, cap: beamDmg })) {
          beam.struck = true;
          this.player.staggerTimer = Math.max(this.player.staggerTimer, 1.0);   // 1s corruption slow (reuses stagger)
          this.floatingTexts.push(new FloatingText('CORRUPTED', new Vec2(this.player.pos.x, this.player.pos.y - 26), PURPLE, 0.7));
        }
      }
    }
    if (beam.t >= FINAL_BEAM_FIRE) this._corruptionBeam = null;
  }

  // CORRUPTION NOVA — 1s telegraphed ring around the boss, then a single radial burst.
  _updateCorruptionNovas(dt) {
    if (!this._corruptionNovas.length) return;
    for (let i = this._corruptionNovas.length - 1; i >= 0; i--) {
      const n = this._corruptionNovas[i];
      n.t += dt;
      if (!n.hit && n.t >= n.warn) {
        n.hit = true;
        this.screenShake.trigger(5, 0.2);
        this.particles.spawnExplosion(n.pos, [PURPLE, RED, '#ff44aa'], 18);
        if (distance(this.player.pos, n.pos) < n.radius)
          this._damagePlayer(FINAL_NOVA_DMG, { color: PURPLE, shake: 5 });
      }
      if (n.t >= n.warn + 0.35) this._corruptionNovas.splice(i, 1);
    }
  }

  // Draws the signature beam (charge telegraph + fire) and nova telegraphs/bursts — world-space, on top of entities.
  _drawBossCorruption(ctx) {
    // Stun-lance telegraph — a brightening dashed aim line from the boss toward the locked-on player.
    const sb = this.megaBoss;
    if (sb && sb._stunAim) {
      const o = sb.pos, d = sb._stunAim.dir, k = Math.min(1, sb._stunAim.t / STUN_LANCE_CHARGE);
      ctx.save();
      ctx.globalAlpha = 0.30 + 0.55 * k;
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2 + 4 * k; ctx.setLineDash([14, 10]);
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + d.x * 900, o.y + d.y * 900); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    for (const n of this._corruptionNovas) {
      ctx.save();
      if (n.t < n.warn) {
        const k = n.t / n.warn;
        ctx.globalAlpha = 0.12 + 0.20 * k;
        ctx.fillStyle = PURPLE;
        ctx.beginPath(); ctx.arc(n.pos.x, n.pos.y, n.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = Math.min(1, 0.45 + 0.5 * k);
        ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.setLineDash([12, 9]);
        ctx.beginPath(); ctx.arc(n.pos.x, n.pos.y, n.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const k = (n.t - n.warn) / 0.35;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.strokeStyle = '#ff44aa'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(n.pos.x, n.pos.y, n.radius * (0.7 + 0.5 * k), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    const beam = this._corruptionBeam;
    if (!beam) return;
    const o = beam.origin, d = beam.dir;
    const ex = o.x + d.x * FINAL_BEAM_LEN, ey = o.y + d.y * FINAL_BEAM_LEN;
    ctx.save();
    ctx.lineCap = 'round';
    if (beam.phase === 'charge') {
      const k = beam.t / FINAL_BEAM_CHARGE;
      ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(this.timeAlive * 16));
      ctx.strokeStyle = PURPLE; ctx.lineWidth = 2 + 6 * k;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = RED; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
    } else {
      const a = beam.t < 0.1 ? 1 : Math.max(0, 1 - (beam.t - 0.1) / (FINAL_BEAM_FIRE - 0.1));
      ctx.globalAlpha = 0.85 * a + 0.15;
      ctx.strokeStyle = PURPLE; ctx.lineWidth = FINAL_BEAM_HALFW * 2;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#ff44aa'; ctx.lineWidth = FINAL_BEAM_HALFW;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = a;
      ctx.strokeStyle = WHITE; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.restore();
  }

  // Lava/Fire-Rain zones: pulsing telegraph ring during warning, then the eruption sheet on impact.
  _drawBossLava(ctx) {
    if (!this.bossLavaZones.length) return;
    const spr   = this._lavaRainSprite;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    const FW = 512, FH = 384, COLS = 2, FRAMES = 8;

    for (const z of this.bossLavaZones) {
      if (z.t < z.warn) {
        const k     = z.t / z.warn;
        const pulse = 0.35 + 0.25 * Math.sin(this.timeAlive * 12);
        ctx.save();
        ctx.globalAlpha = 0.16 + 0.18 * k;
        ctx.fillStyle = ORANGE;
        ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = Math.min(1, pulse + 0.3 * k);
        ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      } else {
        const it   = (z.t - z.warn) / z.impact;            // 0→1 over impact
        const fade = it > 0.8 ? (1 - it) / 0.2 : 1;        // fade the last 20%
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        if (ready) {
          const fi = Math.min(FRAMES - 1, Math.floor(it * FRAMES));
          const sx = (fi % COLS) * FW, sy = Math.floor(fi / COLS) * FH;
          const dw = z.radius * 2.6, dh = dw * (FH / FW);
          ctx.drawImage(spr, sx, sy, FW, FH, z.pos.x - dw / 2, z.pos.y - dh * 0.78, dw, dh);
        } else {
          const g = ctx.createRadialGradient(z.pos.x, z.pos.y, 4, z.pos.x, z.pos.y, z.radius);
          g.addColorStop(0, '#fff2a0'); g.addColorStop(0.4, ORANGE); g.addColorStop(1, 'rgba(120,10,0,0.12)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // ── Boss support drones ───────────────────────────────────────────────────

  _spawnSupportDrones() {
    const p = this.player.pos;
    this.supportDrones = [
      new SupportDrone('flame',   p),
      new SupportDrone('electro', p),
    ];
  }

  _updateSupportDrones(dt) {
    if (this.supportDrones.length === 0) return;
    const drones = this.supportDrones.slice();  // snapshot so _titanDie won't corrupt the loop
    for (const drone of drones) {
      drone.update(dt, this.player.pos, this);
    }
    // Corrosive DoT is now centralized in Game._updateCorrosive (runs every frame), so drones
    // only SET _corrosiveTimer — the tick/damage happens there (avoids double application).
    // Titan death check after all drone updates (safe — not inside the loop)
    if (this.titanBoss && this.titanBoss.hp <= 0) this._titanDie();
  }

  // ── Auto-Forge Drone card: persistent combat allies ───────────────────────
  // Reuses the SupportDrone class/assets. Kept in its own array so the boss-fight
  // drone logic (which clears this.supportDrones on boss death) never removes them.
  // Lazy-spawns to match the card level — L1 = flame, L2 adds electro.
  _updateAllyDrones(dt) {
    const lvl = this.player.upgrades['Auto-Forge Drone'] || 0;
    while (this.allyDrones.length < lvl) {
      const type = this.allyDrones.length === 0 ? 'flame' : 'electro';
      this.allyDrones.push(new SupportDrone(type, this.player.pos));
    }
    if (this.allyDrones.length === 0) return;
    for (const drone of this.allyDrones.slice()) {   // snapshot: a death mid-loop can mutate game arrays
      drone.update(dt, this.player.pos, this);
    }
    // Titan death can be triggered by ally drone damage too — resolve it safely after the loop.
    if (this.titanBoss && this.titanBoss.hp <= 0) this._titanDie();
  }

  // ── AI Overload Titan mini-boss ───────────────────────────────────────────

  _updateTitan(dt) {
    if (!this.titanSpawned) {
      this.titanSpawnTimer -= dt;
      if (this.titanSpawnTimer > 0) return;
      this.titanSpawned = true;
      this._spawnTitan();
    }

    const t = this.titanBoss;
    if (!t || t.hp <= 0) return;

    // Move toward player (slow)
    const toPlayer = this.player.pos.sub(t.pos);
    if (toPlayer.length() > t.radius + PLAYER_RADIUS + 4) {
      t.pos.addMut(safeNormalize(toPlayer).scale(t.speed * dt));
    }
    t.pos.x = clamp(t.pos.x, WORLD_MARGIN + t.radius, WORLD_W - WORLD_MARGIN - t.radius);
    t.pos.y = clamp(t.pos.y, WORLD_MARGIN + 40 + t.radius, WORLD_H - WORLD_MARGIN - t.radius);

    if (t.hitFlash > 0) t.hitFlash -= dt;

    // Contact damage (same rate pattern as regular enemies)
    if (distance(t.pos, this.player.pos) < t.radius + PLAYER_RADIUS) {
      const push = safeNormalize(this.player.pos.sub(t.pos));
      this.player.pos.addMut(push.scale(60 * dt));
      if (this.player.dashTimer <= 0 && this.phoenixReviveTimer <= 0) {
        const dmg = t.contactDamage * dt * (1 - this.player.contactDamageReduction);
        this.player.applyDamage(dmg);
        if (this.playerHitCooldown <= 0) {
          this.playerHitCooldown = 0.5;
          this.screenShake.trigger(4, 0.15);
          this.floatingTexts.push(new FloatingText(`-${Math.ceil(t.contactDamage)} HP`, this.player.pos.clone(), RED, 0.6));
        }
      }
    }

    // Shockwave attack (every 6–8s)
    t.shockwaveTimer -= dt;
    if (t.shockwaveTimer <= 0) {
      t.shockwaveTimer = 6 + Math.random() * 2;
      this._titanShockwave(t);
    }

    // Beam attack (every 10–12s)
    t.beamTimer -= dt;
    if (t.beamTimer <= 0) {
      t.beamTimer = 10 + Math.random() * 2;
      this._titanBeam(t);
    }

    // Update expanding shockwave rings
    for (let i = this._titanShockwaves.length - 1; i >= 0; i--) {
      const sw = this._titanShockwaves[i];
      sw.radius += 200 * dt;
      sw.alpha   = Math.max(0, 1.0 - sw.radius / 350);
      if (!sw.resolved) {
        const d = distance(sw.pos, this.player.pos);
        if (sw.radius >= d - PLAYER_RADIUS - 4) {
          sw.resolved = true;                                       // resolve once: a dash at the crossing instant cleanly misses
          this._damagePlayer(10, { color: PURPLE, shake: 3 });      // damage applies only if not dashing/Phoenix/in-grace
        }
      }
      if (sw.alpha <= 0) this._titanShockwaves.splice(i, 1);
    }

    // Update titan beams
    for (let i = this._titanBeams.length - 1; i >= 0; i--) {
      const b = this._titanBeams[i];
      b.pos.addMut(b.dir.scale(b.speed * dt));
      b.life -= dt;
      if (!b.hit && distance(b.pos, this.player.pos) < b.radius + PLAYER_RADIUS) {
        if (this._damagePlayer(15, { color: PURPLE, shake: 4 })) {   // false while dashing → beam passes through
          b.hit = true;
          this.overload = clamp(this.overload + 3, 0, MAX_OVERLOAD);  // relay the pre-existing overload spike only on a real hit
          this.floatingTexts.push(new FloatingText('+3% OVERLOAD', new Vec2(this.player.pos.x, this.player.pos.y - 24), RED, 0.8));
        }
      }
      if (b.hit || b.life <= 0) this._titanBeams.splice(i, 1);
    }
  }

  _spawnTitan() {
    const R    = 50;
    const side = Math.random() < 0.5 ? -1 : 1;
    const pos  = new Vec2(
      WORLD_W / 2 + side * (WORLD_W / 2 - WORLD_MARGIN - R - 30),
      WORLD_H / 2
    );
    this.titanBoss = {
      pos, hp: 600, maxHp: 600,                 // survival pass: 480 → 600 (+25%)
      radius: R, speed: 60, contactDamage: 16, hitFlash: 0,
      shockwaveTimer: 4, beamTimer: 8,
    };
    this._bossAnnounce('AI OVERLOAD TITAN DETECTED', PURPLE);
    this.audio?.playBossSpawn();
    this.screenShake.trigger(6, 0.5);
    this.floatingTexts.push(
      new FloatingText('AI OVERLOAD TITAN DETECTED', new Vec2(WIDTH / 2 - 220, HEIGHT / 2 - 60), PURPLE, 3.0)
    );
    this._spawnSupportDrones();
  }

  // Subtle CRT scanline overlay (screen space). Pattern built + cached once.
  _drawScanlines(ctx) {
    if (!this._scanlineBuilt) {
      this._scanlineBuilt = true;
      const c = document.createElement('canvas');
      c.width = 1; c.height = 3;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(0,0,0,1)';
      g.fillRect(0, 2, 1, 1);          // one dark line every 3 px
      this._scanlinePattern = ctx.createPattern(c, 'repeat');
    }
    if (!this._scanlinePattern) return;
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = this._scanlinePattern;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }

  _titanShockwave(t) {
    this._titanShockwaves.push({ pos: t.pos.clone(), radius: t.radius, alpha: 1.0, hit: false });
    this.screenShake.trigger(2, 0.1);
    this.audio?.playTitanShockwave();
  }

  _titanBeam(t) {
    const dir = safeNormalize(this.player.pos.sub(t.pos));
    if (dir.lengthSq() === 0) return;
    this._titanBeams.push({ pos: t.pos.clone(), dir, speed: 420, life: 3.5, radius: 10, hit: false });
    this.screenShake.trigger(2, 0.1);
    this.audio?.playTitanBeam();
  }

  _titanDie() {
    const t = this.titanBoss;
    if (!t) return;
    this.score = (this.score ?? 0) + 300;
    this.player.gainXp(25, this.floatingTexts);
    const titanCredits = this._awardCredits(12 + Math.floor(Math.random() * 9));   // 12..20 (×Grid Investor)
    this.overload = Math.max(0, this.overload - 10);
    this.floatingTexts.push(new FloatingText('TITAN DEFEATED',     t.pos.clone(),                            YELLOW, 2.5));
    this.floatingTexts.push(new FloatingText('+' + titanCredits + ' GRID CREDITS',   new Vec2(t.pos.x, t.pos.y - 30),         GREEN,  2.5));
    this.floatingTexts.push(new FloatingText('NETWORK STABILIZED', new Vec2(t.pos.x, t.pos.y - 60),         CYAN,   2.5));
    this.triggerAnnouncement('TITAN DEFEATED — NETWORK STABILIZED', GREEN);
    this.screenShake.trigger(14, 1.0);
    this.particles.spawnHitSparks(t.pos, YELLOW);
    this.particles.spawnHitSparks(t.pos, PURPLE);
    this.particles.spawnExplosion(t.pos, [PURPLE, CYAN, YELLOW], 28);
    this.supportDrones    = [];
    this.titanBoss        = null;
    this._titanShockwaves = [];
    this._titanBeams      = [];
  }

  _drawTitan(ctx) {
    // Shockwave rings (draw even after boss dies until they fade)
    for (const sw of this._titanShockwaves) {
      ctx.save();
      ctx.globalAlpha = sw.alpha * 0.9;
      ctx.strokeStyle = PURPLE; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sw.pos.x, sw.pos.y, sw.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
      ctx.globalAlpha = sw.alpha * 0.4;
      ctx.beginPath(); ctx.arc(sw.pos.x, sw.pos.y, sw.radius + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Titan beams
    for (const b of this._titanBeams) {
      drawGlow(ctx, b.pos.x, b.pos.y, b.radius * 2, PURPLE, Math.min(0.6, b.life));
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.life);
      ctx.fillStyle   = PURPLE;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    const t = this.titanBoss;
    if (!t || t.hp <= 0) return;

    const R = t.radius;

    // Pulsing aura
    const pulse = 0.4 + 0.35 * Math.sin(Date.now() / 200);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = PURPLE; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, R + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, R + 18, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Sprite or fallback (additive body glow underneath)
    drawGlow(ctx, t.pos.x, t.pos.y, R, PURPLE, 0.30);
    const spr = this._titanSprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, t.pos.x - R, t.pos.y - R, R * 2, R * 2);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle   = PURPLE;
      ctx.strokeStyle = CYAN; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(t.pos.x - R, t.pos.y - R, R * 2, R * 2, 8);
      ctx.fill(); ctx.stroke();
    }

    // Hit flash overlay
    if (t.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle   = WHITE;
      ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // HP bar above sprite (world-space)
    const bw = R * 2 + 20;
    const bx = t.pos.x - bw / 2;
    const by = t.pos.y - R - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
    ctx.fillStyle = RED;
    ctx.fillRect(bx, by, Math.round(bw * (t.hp / t.maxHp)), 6);

    // Name label
    ctx.font      = 'bold 10px Consolas, monospace';
    ctx.fillStyle = PURPLE;
    ctx.textAlign = 'center';
    ctx.fillText('AI OVERLOAD TITAN', t.pos.x, by - 3);
    ctx.textAlign = 'left';
  }

  // ── Matrix Annihilator mini-boss ──────────────────────────────────────────
  _nearestMatrix(pos) {
    if (!this.matrices.length) return null;
    const withCores = this.matrices.filter(m => m.hasCore());
    const pool = withCores.length ? withCores : this.matrices;
    return pool.reduce((a, b) => distance(pos, a.pos) < distance(pos, b.pos) ? a : b);
  }

  _spawnAnnihilator() {
    const R    = 46;
    const side = Math.random() < 0.5 ? -1 : 1;
    const pos  = new Vec2(
      WORLD_W / 2 + side * (WORLD_W / 2 - WORLD_MARGIN - R - 30),
      WORLD_H / 2
    );
    this.annihilatorBoss = {
      pos, hp: 600, maxHp: 600,                 // survival pass: 480 → 600 (+25%)
      radius: R, speed: 52, contactDamage: 16, hitFlash: 0,
      targetMatrix: this._nearestMatrix(pos),
      attackTimer: 3,
      shotTimer: 3,
    };
    this._bossAnnounce('MATRIX ANNIHILATOR INBOUND', RED);
    this.audio?.playBossSpawn();
    this.screenShake.trigger(6, 0.5);
    this.floatingTexts.push(
      new FloatingText('MATRIX ANNIHILATOR INBOUND', new Vec2(WIDTH / 2 - 230, HEIGHT / 2 - 60), RED, 3.0)
    );
  }

  // Ejects cores from the targeted Matrix (threatens it — never permanently destroys it).
  _annihilatorStrike(a, target) {
    let ejected = 0;
    for (let i = 0; i < 2; i++) {
      // Eject via stealCore so removed charge == ejected core value (conserved, no inflation).
      const core = target.stealCore();
      if (!core) break;
      const angle  = Math.random() * Math.PI * 2;
      const radius = randomRange(50, 110);
      core.pos = target.pos.add(new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius));
      this.groundCores.push(core);
      ejected++;
    }
    target.hackTimer = 0.6;  // flash the Matrix warning ring
    if (ejected > 0) {
      this.floatingTexts.push(new FloatingText('MATRIX BREACH!', target.pos.clone(), RED, 1.2));
      this.screenShake.trigger(4, 0.2);
      this.audio?.playMatrixBreach();
      if (target.stored <= 0) this.audio?.playMatrixCritical();
    }
  }

  _updateAnnihilator(dt) {
    if (!this.annihilatorSpawned) {
      this.annihilatorSpawnTimer -= dt;
      if (this.annihilatorSpawnTimer > 0) return;
      this.annihilatorSpawned = true;
      this._spawnAnnihilator();
    }

    const a = this.annihilatorBoss;
    if (!a || a.hp <= 0) return;

    if (a.hitFlash > 0) a.hitFlash -= dt;

    // Re-acquire a target Matrix if the current one is gone or drained
    if (!a.targetMatrix || !this.matrices.includes(a.targetMatrix) || !a.targetMatrix.hasCore()) {
      a.targetMatrix = this._nearestMatrix(a.pos);
    }
    const target = a.targetMatrix;

    if (target) {
      const toMatrix = target.pos.sub(a.pos);
      const reach    = a.radius + MATRIX_RADIUS + 6;
      if (toMatrix.length() > reach) {
        a.pos.addMut(safeNormalize(toMatrix).scale(a.speed * dt));
        a.attackTimer = Math.min(a.attackTimer, 2.5);
      } else {
        // Adjacent to the Matrix — periodically annihilate (eject) its cores
        a.attackTimer -= dt;
        if (a.attackTimer <= 0) {
          a.attackTimer = 2.5;
          this._annihilatorStrike(a, target);
        }
      }
    }

    a.pos.x = clamp(a.pos.x, WORLD_MARGIN + a.radius, WORLD_W - WORLD_MARGIN - a.radius);
    a.pos.y = clamp(a.pos.y, WORLD_MARGIN + 40 + a.radius, WORLD_H - WORLD_MARGIN - a.radius);

    // Aimed energy shot — ranged pressure while it harasses the Matrix (fully dodgeable,
    // routed through the shared enemy-bullet → _damagePlayer fairness gate)
    a.shotTimer -= dt;
    if (a.shotTimer <= 0) {
      a.shotTimer = 3.2 + Math.random() * 0.8;            // 3.2–4.0s cadence
      const dir = safeNormalize(this.player.pos.sub(a.pos));
      if (dir.lengthSq() > 0) {
        this.spawnEnemyBullet(a.pos.clone(), dir, 260, 10, 9, PURPLE);
        this.audio?.playEnemyShoot();
      }
    }

    // Contact damage (same pattern as the Titan)
    if (distance(a.pos, this.player.pos) < a.radius + PLAYER_RADIUS) {
      const push = safeNormalize(this.player.pos.sub(a.pos));
      this.player.pos.addMut(push.scale(60 * dt));
      if (this.player.dashTimer <= 0 && this.phoenixReviveTimer <= 0) {
        const dmg = a.contactDamage * dt * (1 - this.player.contactDamageReduction);
        this.player.applyDamage(dmg);
        if (this.playerHitCooldown <= 0) {
          this.playerHitCooldown = 0.5;
          this.screenShake.trigger(4, 0.15);
          this.floatingTexts.push(new FloatingText(`-${Math.ceil(a.contactDamage)} HP`, this.player.pos.clone(), RED, 0.6));
        }
      }
    }

    if (a.hp <= 0) this._annihilatorDie();
  }

  _annihilatorDie() {
    const a = this.annihilatorBoss;
    if (!a) return;
    this.score = (this.score ?? 0) + 300;
    this.player.gainXp(25, this.floatingTexts);
    const annihilatorCredits = this._awardCredits(12 + Math.floor(Math.random() * 9));   // 12..20 (×Grid Investor)
    this.overload = Math.max(0, this.overload - 10);
    this.floatingTexts.push(new FloatingText('MATRIX ANNIHILATOR DESTROYED', a.pos.clone(),                    YELLOW, 2.5));
    this.floatingTexts.push(new FloatingText('+' + annihilatorCredits + ' GRID CREDITS',            new Vec2(a.pos.x, a.pos.y - 30),  GREEN,  2.5));
    this.triggerAnnouncement('MATRIX ANNIHILATOR DESTROYED', GREEN);
    this.screenShake.trigger(14, 1.0);
    this.particles.spawnExplosion(a.pos, [RED, ORANGE, YELLOW], 28);
    this.annihilatorBoss = null;
  }

  _drawAnnihilator(ctx) {
    const a = this.annihilatorBoss;
    if (!a || a.hp <= 0) return;
    const R = a.radius;

    // Targeting line to the Matrix it is threatening
    if (a.targetMatrix && this.matrices.includes(a.targetMatrix)) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(Date.now() / 150);
      ctx.strokeStyle = RED; ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(a.pos.x, a.pos.y);
      ctx.lineTo(a.targetMatrix.pos.x, a.targetMatrix.pos.y);
      ctx.stroke();
      ctx.restore();
    }

    // Pulsing aura
    const pulse = 0.4 + 0.35 * Math.sin(Date.now() / 200);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = RED; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, R + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Body glow + real sprite (fallback ONLY if the sprite failed to load)
    drawGlow(ctx, a.pos.x, a.pos.y, R, RED, 0.30);
    const spr = this._annihilatorSprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, a.pos.x - R, a.pos.y - R, R * 2, R * 2);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle   = RED;
      ctx.strokeStyle = WHITE; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(a.pos.x - R, a.pos.y - R, R * 2, R * 2, 8);
      ctx.fill(); ctx.stroke();
    }

    // Hit flash
    if (a.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle   = WHITE;
      ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // HP bar + name label
    const bw = R * 2 + 20;
    const bx = a.pos.x - bw / 2;
    const by = a.pos.y - R - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
    ctx.fillStyle = RED;
    ctx.fillRect(bx, by, Math.round(bw * (a.hp / a.maxHp)), 6);
    ctx.font      = 'bold 10px Consolas, monospace';
    ctx.fillStyle = RED;
    ctx.textAlign = 'center';
    ctx.fillText('MATRIX ANNIHILATOR', a.pos.x, by - 3);
    ctx.textAlign = 'left';
  }

  // ── Bloodfang Packmaster mini-boss (fast pack leader at 10:00) ─────────────
  _spawnBloodfang() {
    const R    = 40;
    const side = Math.random() < 0.5 ? -1 : 1;
    const pos  = new Vec2(
      WORLD_W / 2 + side * (WORLD_W / 2 - WORLD_MARGIN - R - 30),
      WORLD_H / 2
    );
    this.bloodfangBoss = {
      pos, hp: 700, maxHp: 700,                 // survival pass: 560 → 700 (+25%)
      radius: R, speed: 112, hitFlash: 0,
      biteTimer: 2.0, lungeTimer: 0, lungeDir: new Vec2(1, 0),
      slamTimer: 4,
    };
    this._bossAnnounce('BLOODFANG PACKMASTER DETECTED', RED);
    this.audio?.playBossSpawn();
    this.screenShake.trigger(7, 0.6);
    this.floatingTexts.push(new FloatingText('BLOODFANG PACKMASTER DETECTED', new Vec2(WIDTH / 2 - 240, HEIGHT / 2 - 70), RED,    3.0));
    this.floatingTexts.push(new FloatingText('RAZORHOUND PACK INBOUND',       new Vec2(WIDTH / 2 - 200, HEIGHT / 2 - 40), ORANGE, 3.0));
    // 3 Razorhounds join the boss
    for (let i = 0; i < 3; i++) this.enemies.push(new Enemy('Razorhound', this.currentMinute()));
    // Ally support drones join the fight (reuses the existing boss-drone system)
    this._spawnSupportDrones();
  }

  _updateBloodfang(dt) {
    if (!this.bloodfangSpawned) {
      this.bloodfangSpawnTimer -= dt;
      if (this.bloodfangSpawnTimer > 0) return;
      this.bloodfangSpawned = true;
      this._spawnBloodfang();
    }

    const a = this.bloodfangBoss;
    if (!a || a.hp <= 0) return;

    if (a.hitFlash > 0) a.hitFlash -= dt;

    const toPlayer = this.player.pos.sub(a.pos);
    const dist     = toPlayer.length();

    // Savage Bite / Lunge — short forward rush every 1.2–1.8 s when in range
    a.biteTimer -= dt;
    if (a.lungeTimer > 0) {
      a.lungeTimer -= dt;
      a.pos.addMut(a.lungeDir.scale(a.speed * 3.2 * dt));
    } else {
      if (dist > a.radius + PLAYER_RADIUS + 2) {
        a.pos.addMut(safeNormalize(toPlayer).scale(a.speed * dt));
      }
      if (a.biteTimer <= 0 && dist < 240) {
        a.biteTimer  = 1.2 + Math.random() * 0.6;
        a.lungeTimer = 0.22;
        a.lungeDir   = safeNormalize(toPlayer);
      }
    }

    a.pos.x = clamp(a.pos.x, WORLD_MARGIN + a.radius, WORLD_W - WORLD_MARGIN - a.radius);
    a.pos.y = clamp(a.pos.y, WORLD_MARGIN + 40 + a.radius, WORLD_H - WORLD_MARGIN - a.radius);

    // Telegraphed pounce slam — clearly warned, single heavy hit, dodgeable by moving/dashing out.
    // Threatens a kiting player who out-ranges the lunge; mirrors the Lava-zone warn→impact pattern.
    a.slamTimer -= dt;
    if (a.slamTimer <= 0 && dist < 360) {
      a.slamTimer = 5.5 + Math.random() * 1.5;            // 5.5–7.0s cadence
      this._bloodfangSlams.push({ pos: this.player.pos.clone(), radius: 75, warn: 0.9, impact: 0.25, t: 0, hit: false });
      this.audio?.playEventWarning();
    }
    for (let i = this._bloodfangSlams.length - 1; i >= 0; i--) {
      const s = this._bloodfangSlams[i];
      s.t += dt;
      if (!s.hit && s.t >= s.warn) {                       // warning ended → strike
        s.hit = true;
        this.screenShake.trigger(6, 0.2);
        this.particles.spawnExplosion(s.pos, [RED, ORANGE], 12);
        this.audio?.playBloodfangBite?.();
        if (distance(this.player.pos, s.pos) < s.radius) {
          if (this.endless) {
            // Endless: heavier, knockback slam (~20% max HP). Act 1 keeps the original 18 (below).
            const slamDmg = Math.round(this.player.maxHp * 0.20);
            if (this._damagePlayer(slamDmg, { color: RED, shake: 6, cap: slamDmg })) {
              const kb = safeNormalize(this.player.pos.sub(s.pos));
              if (kb.lengthSq() > 0) this.player.pos.addMut(kb.scale(70));   // knock the player back from the impact
            }
          } else {
            this._damagePlayer(18, { color: RED, shake: 6 }); // routed through fairness gate (dash/grace/30-cap)
          }
        }
      }
      if (s.t >= s.warn + s.impact) this._bloodfangSlams.splice(i, 1);
    }

    // Bite contact — throttled discrete bites (heavier on a lunge); dash/phoenix i-frames respected
    if (distance(a.pos, this.player.pos) < a.radius + PLAYER_RADIUS &&
        this.playerHitCooldown <= 0 &&
        this.player.dashTimer <= 0 && this.phoenixReviveTimer <= 0) {
      this.playerHitCooldown = 0.5;
      const lunging   = a.lungeTimer > 0;
      const dir       = safeNormalize(this.player.pos.sub(a.pos));
      const hp        = (lunging ? 16 : 14) * (1 - this.player.contactDamageReduction);
      const staggered = this.player.applyBite({
        hp, stamina: 12, dir,
        stagger:   lunging ? 0.8 : 0.5,
        knockback: lunging ? 22 : 12,
        bleed:     2.5,
      });
      this.screenShake.trigger(lunging ? 7 : 4, 0.2);
      this.audio?.playBloodfangBite();
      this.particles.spawnBloodSplash(this.player.pos);
      this.floatingTexts.push(new FloatingText(staggered ? 'STAGGERED' : 'BLEED', new Vec2(this.player.pos.x, this.player.pos.y - 28), RED, 0.7));
    }

    if (a.hp <= 0) this._bloodfangDie();
  }

  _bloodfangDie() {
    const a = this.bloodfangBoss;
    if (!a) return;
    // Break the pack — remaining Razorhounds die with their master; clear ally drones
    this.enemies = this.enemies.filter(e => e.enemyType !== 'Razorhound');
    this.supportDrones = [];
    this.score = (this.score ?? 0) + 500;
    this.player.gainXp(45, this.floatingTexts);
    const bloodfangCredits = this._awardCredits(25 + Math.floor(Math.random() * 16));   // 25..40 (×Grid Investor)
    this.overload = Math.max(0, this.overload - 10);
    this.floatingTexts.push(new FloatingText('BLOODFANG PACKMASTER DEFEATED', a.pos.clone(),                   YELLOW, 2.5));
    this.floatingTexts.push(new FloatingText('RAZORHOUND PACK BROKEN',         new Vec2(a.pos.x, a.pos.y - 28), ORANGE, 2.5));
    this.floatingTexts.push(new FloatingText('+' + bloodfangCredits + ' GRID CREDITS',               new Vec2(a.pos.x, a.pos.y - 56), GREEN,  2.5));
    this.triggerAnnouncement('BLOODFANG PACKMASTER DEFEATED', GREEN);
    this.screenShake.trigger(14, 1.0);
    this.particles.spawnExplosion(a.pos, [RED, ORANGE, YELLOW], 30);
    this._bloodfangSlams = [];   // drop any pending telegraph so it never outlives the boss
    this.bloodfangBoss = null;
  }

  _drawBloodfang(ctx) {
    const a = this.bloodfangBoss;
    if (!a || a.hp <= 0) return;
    const R = a.radius;

    // Pounce-slam telegraph — pulsing dashed ring over a translucent fill during the warn phase
    // (same idiom as the Lava-zone telegraph) so the heavy hit is always clearly readable.
    for (const s of this._bloodfangSlams) {
      if (s.t >= s.warn) continue;
      const k = s.t / s.warn;
      ctx.save();
      ctx.globalAlpha = 0.14 + 0.20 * k;
      ctx.fillStyle = RED;
      ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, s.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(1, 0.4 + 0.4 * k);
      ctx.strokeStyle = ORANGE; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, s.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Pulsing red aura
    const pulse = 0.4 + 0.35 * Math.sin(Date.now() / 160);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = RED; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, R + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Body glow + real sprite (fallback box ONLY if the sprite failed to load)
    drawGlow(ctx, a.pos.x, a.pos.y, R, RED, 0.32);
    const spr = this._bloodfangSprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, a.pos.x - R, a.pos.y - R, R * 2, R * 2);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle   = RED;
      ctx.strokeStyle = WHITE; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(a.pos.x - R, a.pos.y - R, R * 2, R * 2, 8);
      ctx.fill(); ctx.stroke();
    }

    // Hit flash
    if (a.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle   = WHITE;
      ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // HP bar + name label
    const bw = R * 2 + 20;
    const bx = a.pos.x - bw / 2;
    const by = a.pos.y - R - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
    ctx.fillStyle = RED;
    ctx.fillRect(bx, by, Math.round(bw * (a.hp / a.maxHp)), 6);
    ctx.font      = 'bold 10px Consolas, monospace';
    ctx.fillStyle = RED;
    ctx.textAlign = 'center';
    ctx.fillText('BLOODFANG PACKMASTER', a.pos.x, by - 3);
    ctx.textAlign = 'left';
  }

  _drawAcidRain(ctx) {
    if (!this.acidRain) return;

    const now = performance.now() / 1000;

    ctx.save();

    // Subtle green screen tint
    ctx.fillStyle = 'rgba(0,60,0,0.09)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const fallImg   = this._acidRainFallImg;
    const splashImg = this._acidRainSplashImg;
    const hasFall   = fallImg   && fallImg.complete   && fallImg.naturalWidth   > 0;
    const hasSplash = splashImg && splashImg.complete && splashImg.naturalWidth > 0;

    const ACID_COLOR  = '#44ff88';
    const DROP_SPEED  = 300;
    const DIAGONAL    = 0.24;
    const TOTAL_H     = HEIGHT + 60;
    const COUNT       = 50;

    // Sprite sheet layout: fall = 6 frames side by side (732×492 → 122×492 each)
    const FALL_FRAMES = 6;
    const FALL_FW     = hasFall   ? Math.floor(fallImg.naturalWidth   / FALL_FRAMES) : 0;
    const FALL_FH     = hasFall   ? fallImg.naturalHeight : 0;

    // Sprite sheet layout: splash = 2×2 grid (714×363 → 357×181 each)
    const SPLASH_FW   = hasSplash ? Math.floor(splashImg.naturalWidth  / 2) : 0;
    const SPLASH_FH   = hasSplash ? Math.floor(splashImg.naturalHeight / 2) : 0;

    // On-screen draw sizes (pixel art, keeps aspect ratio)
    const DRAW_DROP_W   = 18;
    const DRAW_DROP_H   = 72;
    const DRAW_SPLASH_W = 52;
    const DRAW_SPLASH_H = 26;

    ctx.imageSmoothingEnabled = false;

    for (let i = 0; i < COUNT; i++) {
      const seedX     = ((i * 23.4 + i * i * 0.71) % (WIDTH + 80)) - 40;
      const seedPhase = (i * 17.13) % 1;
      const alpha     = 0.72 + 0.20 * ((i * 7 % 3) / 3);
      const progress  = ((now * DROP_SPEED / TOTAL_H) + seedPhase) % 1;
      const x         = seedX + progress * TOTAL_H * DIAGONAL;
      const y         = progress * TOTAL_H - 30;

      ctx.globalAlpha = alpha;

      if (y > HEIGHT - 28 && y <= HEIGHT + 10) {
        // Ground splash
        if (hasSplash) {
          // Alternate top-left (big splash) and top-right (smaller) per drop
          const sFrameX = (i % 2) * SPLASH_FW;
          ctx.drawImage(splashImg,
            sFrameX, 0, SPLASH_FW, SPLASH_FH,
            Math.round(x - DRAW_SPLASH_W / 2), HEIGHT - DRAW_SPLASH_H,
            DRAW_SPLASH_W, DRAW_SPLASH_H);
        } else {
          ctx.strokeStyle = ACID_COLOR;
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.ellipse(Math.round(x + 5), HEIGHT - 3, 5, 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (y < HEIGHT - 28) {
        // Falling drop — animate through 6 frames at ~10 fps, offset per drop
        if (hasFall) {
          const frameIdx = (Math.floor(now * 10) + i) % FALL_FRAMES;
          ctx.drawImage(fallImg,
            frameIdx * FALL_FW, 0, FALL_FW, FALL_FH,
            Math.round(x - DRAW_DROP_W / 2), Math.round(y),
            DRAW_DROP_W, DRAW_DROP_H);
        } else {
          ctx.strokeStyle = ACID_COLOR;
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.moveTo(Math.round(x),     Math.round(y));
          ctx.lineTo(Math.round(x + 4), Math.round(y + 14));
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha           = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
  }

  // Effective view scale / visible window. Endless zooms out slightly (ENDLESS_VIEW_SCALE);
  // Act 1 returns the exact globals (WIDTH/VIEW_SCALE === VIEW_W), so Act 1 is byte-identical.
  get _viewScale() { return this.endless ? ENDLESS_VIEW_SCALE : VIEW_SCALE; }
  get _viewW()     { return this.endless ? WIDTH  / ENDLESS_VIEW_SCALE : VIEW_W; }
  get _viewH()     { return this.endless ? HEIGHT / ENDLESS_VIEW_SCALE : VIEW_H; }

  _updateCamera() {
    // Center the player in the (larger, zoomed-out) visible world window.
    const cx = this.player.pos.x - this._viewW / 2;
    const cy = this.player.pos.y - this._viewH / 2;
    this.camera.x = Math.max(0, Math.min(cx, WORLD_W - this._viewW));
    this.camera.y = Math.max(0, Math.min(cy, WORLD_H - this._viewH));
  }

  _worldMouse(screenPos) {
    if (!screenPos) return null;
    // Screen → world: undo the view zoom, then the camera offset.
    return { x: screenPos.x / this._viewScale + this.camera.x, y: screenPos.y / this._viewScale + this.camera.y };
  }

  // Endless-only Nexus base sprite drawn UNDER a matrix. Clean fixed size so it doesn't cover
  // too much play space; if the image is missing, draw nothing (the matrix renders itself).
  _drawEndlessNexusBase(ctx, m) {
    const img = this._endlessNexusImage;
    if (!(img && img.complete && img.naturalWidth > 0)) return;
    const D = 120;   // Endless base visual (was 150) — smaller for readability; deposit/collision radius unchanged
    // Soft elliptical contact shadow so the base reads as planted on the arena, not pasted on top.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(m.pos.x, m.pos.y + D * 0.30, D * 0.40, D * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(img, m.pos.x - D / 2, m.pos.y - D / 2, D, D);
  }

  _drawWorldBackground(ctx) {
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Endless-only Stage 02 map; falls back to the default background if not loaded / not endless.
    const eb  = this._endlessBgImage;
    const img = (this.endless && eb && eb.complete && eb.naturalWidth > 0) ? eb : this._bgImage;
    if (img.complete && img.naturalWidth > 0) {
      const scale = WORLD_W / img.naturalWidth;
      const drawH = img.naturalHeight * scale;
      ctx.drawImage(img, 0, 0, WORLD_W, drawH);
      // Endless map: a touch more dimming so the backdrop recedes and the gameplay plane reads flat.
      ctx.fillStyle = this.gridBlackoutActive ? 'rgba(0,0,0,0.65)'
                    : this.endless           ? 'rgba(0,0,0,0.46)'
                    :                          'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    } else {
      const spacing = 48;
      const offset  = Math.floor(performance.now() * 0.025) % spacing;
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth   = 1;
      for (let x = -spacing; x < WORLD_W + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + offset, 44);
        ctx.lineTo(x + offset, WORLD_H);
        ctx.stroke();
      }
      for (let y = 44; y < WORLD_H + spacing; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_W, y);
        ctx.stroke();
      }
    }
  }

  _drawBackground(ctx) {
    // ── Dark base fill (shown while image loads or on very old browsers) ──────
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ── Cyberpunk city image ─────────────────────────────────────────────────
    const img = this._bgImage;
    if (img.complete && img.naturalWidth > 0) {
      // "cover" scaling: fill the entire canvas, crop excess.
      // The image is portrait (tall); we fit its width to the canvas and
      // anchor the top so the city streets are visible.
      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;
      const scale = WIDTH / imgW;          // scale so width fills 1280px
      const drawH = imgH * scale;          // resulting height (will exceed 720)

      ctx.drawImage(img, 0, 0, WIDTH, drawH);

      // Semi-transparent dark overlay so neon game entities pop clearly
      ctx.fillStyle = this.gridBlackoutActive
        ? 'rgba(0,0,0,0.65)'   // extra dim during Grid Blackout event
        : 'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } else {
      // Fallback: scrolling neon grid while image loads
      const spacing = 48;
      const offset  = Math.floor(performance.now() * 0.025) % spacing;
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth   = 1;
      for (let x = -spacing; x < WIDTH + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + offset, 44);
        ctx.lineTo(x + offset, HEIGHT);
        ctx.stroke();
      }
      for (let y = 44; y < HEIGHT + spacing; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }
    }

    // ── Dark HUD strip (always on top of background) ─────────────────────────
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, WIDTH, 44);
  }

  // Called by main.js to pass current mouse pos to the draw call
  setMousePos(pos) { this._lastMousePos = pos; }
}
