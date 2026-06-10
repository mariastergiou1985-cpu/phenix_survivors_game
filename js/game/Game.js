import {
  Vec2, WIDTH, HEIGHT, WORLD_W, WORLD_H, WORLD_MARGIN,
  WIN_TIME_SECONDS, CORE_OVERLOAD_TICK_TIME, BASE_OVERLOAD_PER_CORE,
  OVERLOAD_PICKUP_REDUCTION, OVERLOAD_SLOT_REDUCTION,
  MAX_OVERLOAD, PLAYER_RADIUS, CORE_RADIUS, MATRIX_RADIUS,
  DARK_BG, GRID_LINE, BLACK, CYAN, RED, GREEN, YELLOW, ORANGE, WHITE, PURPLE,
  CORE_COLORS, VIEW_SCALE, VIEW_W, VIEW_H,
} from '../constants.js?v=51';
import { clamp, distance, safeNormalize, randomChoice, randomRange } from '../utils.js';

import { FloatingText }   from '../entities/FloatingText.js';
import { DataCore }       from '../entities/DataCore.js';
import { PowerMatrix }    from '../entities/PowerMatrix.js?v=11';
import { Player }         from '../entities/Player.js?v=60';
import { Projectile, HomingDisc } from '../entities/Projectile.js?v=3';
import { Enemy }          from '../entities/Enemy.js?v=100';
import { SupportDrone }   from '../entities/SupportDrone.js?v=1';

import { ParticleSystem, ScreenShake, drawVignette, EMPRing, drawGlow } from './Effects.js?v=3';
import { SystemEventManager } from './Events.js?v=94';
import { UpgradeUI }      from './UpgradeUI.js?v=2';
import { weightedSample } from './Upgrades.js?v=2';
import { drawHUD, drawEndScreen } from './HUD.js?v=34';
import { MetaProgress, META_UPGRADES, upgradeCost } from './MetaProgress.js?v=1';

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
    this._bgImage.src = 'assets/backgrounds/cyber_city_bg_clean.png?v=1';

    // Preload character portraits for Character Select screen
    this._charImages = {};
    ['skeleton_warrior', 'taekwondo_girl', 'cyber_arm_hero'].forEach(id => {
      const img = new Image();
      img.src = `assets/characters/${id}.png`;
      this._charImages[id] = img;
    });

    // Preload start-menu background image
    this._menuBg = new Image();
    this._menuBg.src = 'assets/ui/start_menu_background.png?v=10';

    // Preload phoenix revive effect images (orange / blue / gold tiers)
    this._phoenixImage = new Image();
    this._phoenixImage.src = 'assets/effects/phoenix_revive.png';

    this._phoenixBlueImage = new Image();
    this._phoenixBlueImage.onerror = () => console.warn('[Assets] Failed to load: assets/effects/phoenix/blue_phoenix_revive.png');
    this._phoenixBlueImage.src = 'assets/effects/phoenix/blue_phoenix_revive.png?v=2';

    this._phoenixGoldImage = new Image();
    this._phoenixGoldImage.onerror = () => console.warn('[Assets] Failed to load: assets/effects/phoenix/gold_phoenix_revive.png');
    this._phoenixGoldImage.src = 'assets/effects/phoenix/gold_phoenix_revive.png?v=2';

    // Preload credits photos
    this._creditImgInk = new Image();
    this._creditImgInk.src = 'assets/credits/inkspirem_visuals_photo.jpg';
    this._creditImgTsali = new Image();
    this._creditImgTsali.src = 'assets/credits/tsali_photo.jpg';

    // Preload core and matrix sprites
    this._coreSprite = new Image();
    this._coreSprite.onerror = () => console.warn('[Assets] Failed to load: assets/cores/data_core.png');
    this._coreSprite.src = 'assets/cores/data_core.png?v=10';
    this._matrixSprite = new Image();
    this._matrixSprite.onerror = () => console.warn('[Assets] Failed to load: assets/bases/matrix_base.png');
    this._matrixSprite.src = 'assets/bases/matrix_base.png?v=10';

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
    this._acidRainFallImg.src = 'assets/events/weather/acid_rain_fall.png?v=1';
    this._acidRainSplashImg = new Image();
    this._acidRainSplashImg.onerror = () => console.warn('[Weather] acid_rain_splash.png not found — using ellipse fallback');
    this._acidRainSplashImg.src = 'assets/events/weather/acid_rain_splash.png?v=1';

    // Preload AI Overload Titan boss sprite
    this._titanSprite = new Image();
    this._titanSprite.onerror = () => console.warn('[Boss] ai_overload_titan.png failed to load — using fallback');
    this._titanSprite.src = 'assets/enemies/bosses/ai_overload_titan.png?v=1';

    // Preload Matrix Annihilator mini-boss sprite (existing asset)
    this._annihilatorSprite = new Image();
    this._annihilatorSprite.onerror = () => console.warn('[Boss] assets/enemies/bosses/matrix_annihilator.png failed to load — using fallback');
    this._annihilatorSprite.src = 'assets/enemies/bosses/matrix_annihilator.png?v=1';

    // Preload Bloodfang Packmaster mini-boss sprite (existing asset)
    this._bloodfangSprite = new Image();
    this._bloodfangSprite.onerror = () => console.warn('[Boss] assets/enemies/bosses/bloodfang_packmaster.png failed to load — using fallback');
    this._bloodfangSprite.src = 'assets/enemies/bosses/bloodfang_packmaster.png?v=1';

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
    ];
    // 'UPGRADES' (the buggy meta-upgrade screen) removed — all upgrades come from level-up cards.
    this.menuItems = ['START GAME', 'CHARACTER SELECT', 'INSTRUCTIONS', 'AUDIO SETTINGS', 'CREDITS', 'EXIT'];

    this.reset();
  }

  reset() {
    this.player       = new Player(this.selectedCharacter);
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
    this.empRings     = [];
    this._specialRings    = [];
    this.thunderSolo      = null;   // Thunder Solo ultimate state while active
    this.overChains       = null;   // Overheated Heavy Chains ultimate (Cyber Arm Hero) while active
    this._aquaPuddles     = [];   // Aqua Spirit Trail puddles (Neon Taekwondo Girl movement secondary)
    this._aquaTrailTimer  = 0;    // spawn cadence while moving
    this.spiritDojang     = null; // Spirit Dojang Flag ultimate (Neon Taekwondo Girl) while active
    this._specialBeams    = [];
    this._specialTrail    = [];
    this._taekwondoDmgSet = new Set();
    this.enemyBullets = [];
    this.floatingTexts = [];
    this.particles    = new ParticleSystem();
    this.screenShake  = new ScreenShake();
    this.events       = new SystemEventManager();
    this.upgradeUI    = null;
    this.rerollAvailable = false;
    this.megaBoss     = null;
    this.bossLavaZones = [];   // telegraphed lava/fire-rain zones cast by the main boss (player-only)

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
    this.isNewHighScore = false;

    this.gameOver          = false;
    this.victory           = false;
    this.finalMessage      = '';
    this.rewardsGranted    = false;
    this.runCreditsEarned  = 0;
    this.playerHitCooldown = 0;

    this.camera = { x: 0, y: 0 };

    this.gridCache           = null;  // { pos: Vec2, timer: number } | null
    this.gridCacheSpawnTimer = 75;    // first crate at 75s (avoids Drone Swarm at 60s)

    this.acidRain      = null;  // { timer, damageAccum } | null
    this.acidRainTimer = 150;   // first event at 2:30

    this.killsSinceHealthDrop = 0;   // counts toward the next HP CELL drop
    this.healthPickups        = [];  // [{ pos: Vec2, timer: number }] — heals 25% maxHp on touch

    this.manaPickups     = [];   // [{ pos: Vec2 }] — restores +25 mana on touch
    this.manaPickupTimer = 30;   // time-based: one every 30s while mana < 100

    this.titanSpawned     = false;
    this.titanBoss        = null;
    this.titanSpawnTimer  = 180;
    this._titanShockwaves = [];
    this._titanBeams      = [];

    // Matrix Annihilator — second mini-boss, marches on a Power Matrix at ~7:30
    this.annihilatorSpawned    = false;
    this.annihilatorBoss       = null;
    this.annihilatorSpawnTimer = 450;

    // Bloodfang Packmaster — third mini-boss (fast pack leader) at 10:00
    this.bloodfangSpawned    = false;
    this.bloodfangBoss       = null;
    this.bloodfangSpawnTimer = 600;

    this.supportDrones     = [];
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

  goToMainMenu() {
    this.gameState = 'start_menu';
    this.menuIndex = 0;
    this.gameOver  = false;
    this.victory   = false;
    this.paused    = false;
    this.upgradeUI     = null;
    this.supportDrones = [];
    this.audio?.startMenuMusic();
  }

  goToExitScreen() {
    this.gameState = 'exit_screen';
  }

  // The meta upgrade screen is disabled (it was buggy). Any remaining entry point
  // (e.g. the end-screen button) now harmlessly returns to the main menu.
  goToUpgradesScreen() {
    this.goToMainMenu();
  }

  goToCredits() { this.gameState = 'credits'; }

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
    p.baseDamage += m.getLevel('pulseDamage');
    p.upgrades['Firewall Protection'] = m.getLevel('firewall');
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
  }

  addKillScore(pos) {
    this.comboCount++;
    this.comboTimer = 3.0;
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
    let bonus = 0;
    if      (this.comboCount >= 10) bonus = 20;
    else if (this.comboCount >= 5)  bonus = 10;
    else if (this.comboCount >= 2)  bonus = 5;
    this.score += 10 + bonus;

    // HP CELL drop: guaranteed one healing pickup every 40 kills, near the defeated enemy.
    // Does not touch overload / credits / score / combo, and never replaces Phoenix revives.
    if (pos && ++this.killsSinceHealthDrop >= 40) {
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
    const CW = 300, CH = 160, CGAP = 30, RGAP = 20;
    const totalW = 3 * CW + 2 * CGAP;
    const x0     = Math.round((WIDTH - totalW) / 2);
    const y0     = 110;
    const rects  = META_UPGRADES.map((_, i) => ({
      x: x0 + (i % 3) * (CW + CGAP),
      y: y0 + Math.floor(i / 3) * (CH + RGAP),
      w: CW, h: CH,
    }));
    const backRect  = { x: x0,              y: y0 + 2*(CH+RGAP) + 20, w: 160, h: 40 };
    const resetRect = { x: x0 + totalW - 160, y: backRect.y,            w: 160, h: 40 };
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
        ctx.arc(r.x + 14 + d * 16, r.y + 82, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cost / BUY button area
      const btnY = r.y + 100;
      const btnH = 38;
      if (maxed) {
        ctx.fillStyle   = '#1a2510';
        ctx.fillRect(r.x + 10, btnY, r.w - 20, btnH);
        ctx.font        = 'bold 15px Consolas, monospace';
        ctx.fillStyle   = YELLOW;
        ctx.textAlign   = 'center';
        ctx.fillText('MAX', r.x + r.w / 2, btnY + 24);
      } else {
        ctx.fillStyle   = can ? '#0a2030' : '#120a0a';
        ctx.fillRect(r.x + 10, btnY, r.w - 20, btnH);
        ctx.strokeStyle = can ? CYAN : '#3a2020';
        ctx.lineWidth   = 1;
        ctx.strokeRect(r.x + 10, btnY, r.w - 20, btnH);
        ctx.font        = 'bold 13px Consolas, monospace';
        ctx.fillStyle   = can ? CYAN : '#5a3030';
        ctx.textAlign   = 'center';
        ctx.fillText(`BUY  —  ${cost} Credits`, r.x + r.w / 2, btnY + 24);
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

  _metaEffectText(key, lvl) {
    switch (key) {
      case 'maxHp':        return `+${lvl * 10} HP`;
      case 'moveSpeed':    return `+${lvl * 5}% speed`;
      case 'coreMagnet':   return `+${Math.round((Math.pow(1.10, lvl) - 1) * 100)}% pickup radius`;
      case 'coreCapacity': return `+${lvl} carry slot${lvl > 1 ? 's' : ''}`;
      case 'pulseDamage':  return `+${lvl} damage`;
      case 'firewall':     return `-${lvl * 5}% overload`;
      default:             return '';
    }
  }

  _createMatrices() {
    const positions = [
      [260,           230],
      [WORLD_W - 260, 230],
      [280,           WORLD_H - 200],
      [WORLD_W - 280, WORLD_H - 200],
      [WORLD_W / 2,   WORLD_H / 2],
    ];
    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i];
      this.matrices.push(new PowerMatrix(new Vec2(x, y), CORE_COLORS[i % CORE_COLORS.length]));
    }
  }

  currentMinute()             { return Math.floor(this.timeAlive / 60); }
  coreVolatilityMultiplier()  { return 1 + (this.timeAlive / WIN_TIME_SECONDS) * 1.8; }
  overloadRateMultiplier()    { return 1 + Math.floor(this.timeAlive / 120) * 0.05; }
  enemyCap()                  { return 18 + this.currentMinute() * 9; }
  enemySpawnInterval()        { return Math.max(0.22, 0.8  - this.currentMinute() * 0.04); }

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
    const e = new Enemy(this.chooseEnemyType(), this.currentMinute());
    this.enemies.push(e);
    if (e.isBoss()) this.audio?.playBossWarning();
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

  // ── Thunder Solo ultimate (Cyber Skeleton Warrior, SPACE, 100 mana) ──────────
  activateThunderSolo() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'skeleton_warrior') return;  // only this character has an ultimate
    if (this.thunderSolo) return;                            // already running
    if (p.mana < p.maxMana) {
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana = 0;                                              // consume full mana
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
    if (p.mana < p.maxMana) {                               // same NOT-ENOUGH-MANA behavior as Thunder Solo
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), ORANGE, 1.0));
      return;
    }
    p.mana = 0;                                             // consume full mana → HUD ring empties
    this.overChains = { t: 0, angle: 0, dmgTimer: 0,
                        miniDmgThisSec: 0, megaDmgThisSec: 0, bossDmgTimer: 1.0 };
    this.screenShake.trigger(5, 0.3);
    this.audio?.playEventWarning?.();
    this.floatingTexts.push(new FloatingText('OVERHEATED HEAVY CHAINS!', p.pos.clone(), ORANGE, 1.4));
  }

  _updateOverheatedChains(dt) {
    const oc = this.overChains;
    if (!oc) return;
    const p = this.player;
    const DURATION = 7, RADIUS = 155;
    const TICK = 0.25, NORMAL_DMG = 12, KNOCK = 90;   // 48 DPS to normal enemies + small knockback
    const MINI_CAP = 32, MAIN_CAP = 48;               // per-second boss caps (≈47% / ≈45% over 7s)

    oc.t     += dt;
    oc.angle += dt * 3.4;        // heavy rotation (rad/s)

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
          const d = bossHit(true);  if (d > 0) e.takeHit(d, this);
        } else if (e.isBoss()) {
          const d = bossHit(false); if (d > 0) e.takeHit(d, this);
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
        b.hp -= d; b.hitFlash = 0.08;
        if (b.hp <= 0) die.call(this);
      };
      hitSingle(this.titanBoss,       this._titanDie);
      hitSingle(this.annihilatorBoss, this._annihilatorDie);
      hitSingle(this.bloodfangBoss,   this._bloodfangDie);
    }

    if (oc.t >= DURATION) this.overChains = null;
  }

  // World-space: heat glow + the rotating chains asset centred on the hero (hollow centre keeps
  // the character visible). Drawn over world entities, follows the player.
  _drawOverheatedChains(ctx) {
    const oc = this.overChains;
    if (!oc) return;
    const p = this.player;
    const RADIUS = 155, DURATION = 7;
    const a = Math.max(0, Math.min(oc.t / 0.3, (DURATION - oc.t) / 0.5, 1));   // fade in/out

    // Orange/red heat glow under the chains (additive)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.pos.x, p.pos.y, RADIUS * 0.2, p.pos.x, p.pos.y, RADIUS * 1.05);
    g.addColorStop(0,   'rgba(255,90,20,'  + (0.20 * a) + ')');
    g.addColorStop(0.6, 'rgba(255,40,0,'   + (0.12 * a) + ')');
    g.addColorStop(1,   'rgba(255,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, RADIUS * 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Rotating chains (reuse the loaded HUD/ultimate asset). Normal blend keeps the chains solid;
    // the asset's hollow centre lets the hero show through.
    const spr = this._chainsIcon;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      const size = RADIUS * 2.35;
      ctx.save();
      ctx.globalAlpha = 0.9 * a;
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(oc.angle);
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a; ctx.strokeStyle = '#ff5a14'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        const ang = oc.angle + k * (Math.PI / 2);
        ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, RADIUS * 0.9, ang, ang + 1.4); ctx.stroke();
      }
      ctx.restore();
    }
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
    const r = Math.random();

    // Occasionally hammer an active boss/mini-boss so they take steady (capped) pressure
    if (bosses.length && r < 0.15) {
      const b = bosses[(Math.random() * bosses.length) | 0];
      return { x: b.pos.x + randomRange(-22, 22), y: b.pos.y + randomRange(-22, 22) };
    }

    if (enemies.length === 0) {
      // No normal enemies: favour a boss if present, else a random visible point (rare fallback)
      if (bosses.length) { const b = bosses[(Math.random() * bosses.length) | 0]; return { x: b.pos.x, y: b.pos.y }; }
      return { x: this.camera.x + randomRange(40, VIEW_W - 40), y: this.camera.y + randomRange(60, VIEW_H - 40) };
    }

    // Small share of random spread so the storm reads as battlefield-wide, not laser-focused
    if (r > 0.93) {
      return { x: this.camera.x + randomRange(40, VIEW_W - 40), y: this.camera.y + randomRange(60, VIEW_H - 40) };
    }

    // Sample a handful of enemies and pick the best target: dense clusters, close to the
    // player, and core-carriers score highest. Target the cluster centroid for max AoE overlap.
    let best = null, bestScore = -Infinity;
    const samples = Math.min(enemies.length, 6);
    for (let s = 0; s < samples; s++) {
      const e = enemies[(Math.random() * enemies.length) | 0];
      let cluster = 0, cx = 0, cy = 0;
      for (const o of enemies) {
        if (distance(o.pos, e.pos) < 100) { cluster++; cx += o.pos.x; cy += o.pos.y; }
      }
      cx /= cluster; cy /= cluster;   // centroid of the local cluster (cluster ≥ 1: includes e)
      const closeBonus = Math.max(0, 1 - distance(e.pos, p.pos) / 620) * 3;  // nearer the player → higher
      const coreBonus  = (e.carryingCore !== null) ? 5 : 0;
      const score = cluster * 2 + closeBonus + coreBonus + Math.random() * 1.5;
      if (score > bestScore) { bestScore = score; best = { x: cx, y: cy }; }
    }
    return best;
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
    this._specialRings.push({ pos: pos.clone(), radius: 0, maxRadius: 82,
                               life: 0.4, maxLife: 0.4, color1: CYAN, color2: '#ffffff' });
    this.particles.spawnHitSparks(pos, CYAN);
    if (Math.random() < 0.16) this._spawnThunderNote(b.x + randomRange(-12, 12), b.y - randomRange(8, 24));
    if (Math.random() < 0.25) this.screenShake.trigger(3, 0.08);
    this._applyStrikeDamage(b.x, b.y);
  }

  _applyStrikeDamage(tx, ty) {
    const ts = this.thunderSolo;
    if (!ts) return;
    // Per-second boss-damage budgets: strong vs mini-bosses, meaningful (reduced) vs the main boss,
    // but never an instant melt over the ~6s storm.
    const MINI_DPS_CAP = 45;   // ~270 dmg over the storm — kills a mini-boss in ~2 ultimates
    const MEGA_DPS_CAP = 25;   // ~150 dmg over the storm — meaningful chunk of the main boss
    const bossHit = (perStrike, isMega) => {
      const used   = isMega ? ts.megaDmgThisSec : ts.miniDmgThisSec;
      const budget = (isMega ? MEGA_DPS_CAP : MINI_DPS_CAP) - used;
      if (budget <= 0) return 0;
      const dmg = Math.min(perStrike, budget);
      if (isMega) ts.megaDmgThisSec += dmg; else ts.miniDmgThisSec += dmg;
      return dmg;
    };

    // AoE within ~110px — normal enemy crowds obliterated, bosses heavily but safely chunked
    const R = 110;
    const at = new Vec2(tx, ty);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (distance(e.pos, at) < R + e.radius) {
        if (e.isBoss() || e.isMegaBoss) {
          const dmg = bossHit(16, e.isMegaBoss);
          if (dmg > 0) e.takeHit(dmg, this);
        } else {
          e.takeHit(80, this);
        }
      }
    }
    const hitBoss = (boss, die) => {     // singleton mini-bosses always use the mini budget
      if (boss && boss.hp > 0 && distance(boss.pos, at) < R + boss.radius) {
        const dmg = bossHit(16, false);
        if (dmg <= 0) return;
        boss.hp -= dmg; boss.hitFlash = 0.08;
        if (boss.hp <= 0) die.call(this);
      }
    };
    hitBoss(this.titanBoss,       this._titanDie);
    hitBoss(this.annihilatorBoss, this._annihilatorDie);
    hitBoss(this.bloodfangBoss,   this._bloodfangDie);
  }

  // Guitar FX — drawn just BEFORE the player so the skeleton renders on top (source behind it)
  _drawThunderSoloGuitar(ctx) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const p = this.player;

    // Visibility runs on total elapsed time (~7s): fade-in, hold, fade-out + gentle shimmer
    const gt = ts.totalT;
    if (gt >= 7.0) return;
    let guitarAlpha = 0;
    if (gt < 0.2)      guitarAlpha = gt / 0.2;
    else if (gt < 6.5) guitarAlpha = 1;
    else               guitarAlpha = 1 - (gt - 6.5) / 0.5;
    guitarAlpha *= 0.9 + 0.1 * Math.sin(gt * 6);   // soft shimmer (no harsh strobe)

    // Guitar floats above-and-behind the skeleton so it clearly reads as the attack's source
    const cx = p.pos.x + 6, cy = p.pos.y - 30;

    // Soft cyan aura behind the skeleton while it "plays" the guitar (kept dim so the guitar pops)
    drawGlow(ctx, p.pos.x, p.pos.y - 8, 44, CYAN, 0.16 + 0.12 * Math.abs(Math.sin(gt * 9)));

    const gspr = this._thunderGuitarSprite;
    if (guitarAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = guitarAlpha;
    const gh = 58;   // smaller than the 64px character, raised so the full guitar is clearly visible
    if (gspr && gspr.complete && gspr.naturalWidth > 0) {
      // Bright halo right behind the guitar body to silhouette its dark, neon-edged shape
      drawGlow(ctx, cx, cy, 30, '#bfefff', 0.45 * guitarAlpha);
      drawGlow(ctx, cx, cy, 40, CYAN,      0.30 * guitarAlpha);
      const gw = Math.round(gspr.naturalWidth * (gh / gspr.naturalHeight));
      ctx.drawImage(gspr, Math.round(cx - gw / 2), Math.round(cy - gh / 2), gw, gh);
    } else {
      drawGlow(ctx, cx, cy, 38, CYAN, 0.6 * guitarAlpha);
    }
    ctx.restore();
  }

  // World-space rain FX (called inside the camera block, after entities) — sliced strike sprites + notes
  _drawThunderSoloWorld(ctx) {
    const ts = this.thunderSolo;
    if (!ts) return;
    const sheet = this._lightningRainSprite;
    const haveSheet = sheet && sheet.complete && sheet.naturalWidth > 0;

    // Lightning strikes: blit a sliced bolt+ripple sprite anchored on each impact point, additive
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of ts.bolts) {
      const impactFrac = b.windup / b.maxLife;      // when the bolt lands within its lifetime
      const prog = b.t / b.maxLife;                 // 0 → 1
      let alpha, fade = 0;
      if (prog < impactFrac) {
        alpha = 0.35 + 0.5 * (prog / impactFrac);   // telegraph: bolt forms & brightens as it falls
      } else {
        fade  = Math.max(0, 1 - (prog - impactFrac) / (1 - impactFrac));
        alpha = fade;                               // bright flash at impact, then fade out
      }
      if (alpha <= 0) continue;
      if (haveSheet) {
        const S = THUNDER_STRIKES[b.variant];
        const dh = 132 * b.scale;                   // on-screen height ~115–150px (not full-screen)
        const dw = dh * (S.sw / S.sh);
        const dx = b.x - dw * S.ax;                 // anchor ripple-centre on the impact point
        const dy = b.y - dh * S.ay;
        ctx.globalAlpha = 0.9 * alpha;
        ctx.drawImage(sheet, S.sx, S.sy, S.sw, S.sh, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
      }
      // White impact spark only once the bolt has landed
      if (b.struck && fade > 0) {
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(b.x, b.y, 3 * fade + 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // Ground impact halo — only after the bolt lands (soft, fades fast)
    for (const b of ts.bolts) {
      if (!b.struck) continue;
      const impactFrac = b.windup / b.maxLife;
      const fade = Math.max(0, 1 - (b.t / b.maxLife - impactFrac) / (1 - impactFrac));
      drawGlow(ctx, b.x, b.y, 8 + 18 * fade, CYAN, 0.55 * fade);
    }

    // Musical-note energy accents — additive glyphs drifting up, swaying, spinning, fading
    if (haveSheet) {
      for (const n of ts.notes) {
        const N = THUNDER_NOTES[n.glyph];
        const a = Math.max(0, Math.min(1, Math.min(1, n.life / 0.4) * (n.life / n.maxLife + 0.15)));
        const nh = n.size;
        const nw = nh * (N.sw / N.sh);
        ctx.save();   // preserves the enclosing camera + screen-shake transform
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.95 * a;
        ctx.translate(n.x, n.y);
        ctx.rotate(n.rot);
        ctx.drawImage(sheet, N.sx, N.sy, N.sw, N.sh, -nw / 2, -nh / 2, nw, nh);
        ctx.restore();
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

  // One free reroll per level-up screen — re-samples the (already useful) card pool.
  rerollUpgrade() {
    if (!this.upgradeUI || !this.rerollAvailable) return;
    const choices = weightedSample(this.player, 3);
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

    // If upgrade UI is active, freeze everything but allow UI interaction
    if (this.upgradeUI) return;

    // Check for pending level-up to show upgrade cards (one at a time)
    if (this.player.pendingLevelupCount > 0) {
      this.player.pendingLevelupCount--;
      const choices = weightedSample(this.player, 3);
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

    if (this.timeAlive >= WIN_TIME_SECONDS) {
      this.victory      = true;
      this.finalMessage = 'CITY GRID STABILIZED — VICTORY';
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
    this._updateEnemies(dt);
    this._updateOverload(dt);
    this._updateSpawning(dt);
    this._updateFloatingTexts(dt);
    this._updateEffects(dt);
    this._updateSpecialEffects(dt);
    this._updateThunderSolo(dt);
    this._updateOverheatedChains(dt);
    this._updateSpiritDojang(dt);
    this._checkPlayerEnemyCollisions(dt);
    this._updateEnemyBullets(dt);
    this._updateAbilityTimers(dt);
    this._updateQuantumOverhaul(dt);
    this._updateAcidRain(dt);
    this._updateTitan(dt);
    this._updateAnnihilator(dt);
    this._updateBloodfang(dt);
    this._updateBossAttacks(dt);
    this._updateSupportDrones(dt);
    this.events.update(dt, this.timeAlive, this);
    this._updateGridCache(dt);
    this._updateHealthPickups(dt);
    this._updateManaPickups(dt);
    this._updateAnnouncement(dt);
    this.particles.update(dt);
    this._updateCamera();

    for (const m of this.matrices) m.update(dt);

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

  // RNG bonus on top of the Grid Cache base reward: HP / Mana / Grid Credits / loose Cores.
  _grantGridCacheBonus() {
    const p = this.player;
    const r = Math.random();
    if (r < 0.30) {
      const heal = Math.round(p.maxHp * 0.30);
      p.hp = p.hp >= p.maxHp ? p.hp : Math.min(p.maxHp, p.hp + heal);   // never clip overheal
      this.floatingTexts.push(new FloatingText('+' + heal + ' HP', p.pos.clone(), RED, 1.4));
    } else if (r < 0.55) {
      const m = Math.random() < 0.5 ? 25 : 50;
      p.mana = Math.min(p.maxMana, p.mana + m);
      this.floatingTexts.push(new FloatingText('+' + m + ' MANA', p.pos.clone(), CYAN, 1.4));
    } else if (r < 0.80) {
      const c = 3 + Math.floor(Math.random() * 4);   // 3..6 Grid Credits
      this.meta.addCredits(c);
      this.runCreditsEarned = (this.runCreditsEarned || 0) + c;
      this.floatingTexts.push(new FloatingText('+' + c + ' GRID CREDITS', p.pos.clone(), GREEN, 1.4));
    } else {
      const n = 2 + Math.floor(Math.random() * 2);    // 2..3 loose cores to secure
      for (let i = 0; i < n; i++) {
        const off = new Vec2(randomRange(-40, 40), randomRange(-40, 40));
        const col = CORE_COLORS[Math.floor(Math.random() * CORE_COLORS.length)];
        this.groundCores.push(new DataCore(this._clampPickupPos(p.pos.clone().add(off)), col));
      }
      this.floatingTexts.push(new FloatingText('+' + n + ' CORES', p.pos.clone(), YELLOW, 1.4));
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
    for (let i = this.healthPickups.length - 1; i >= 0; i--) {
      const hp = this.healthPickups[i];

      if (distance(this.player.pos, hp.pos) < PLAYER_RADIUS + PICKUP_R) {
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
    // Collect
    for (let i = this.manaPickups.length - 1; i >= 0; i--) {
      const m = this.manaPickups[i];
      if (distance(this.player.pos, m.pos) < PLAYER_RADIUS + PICKUP_R) {
        this.player.mana = Math.min(this.player.maxMana, this.player.mana + 25);
        this.floatingTexts.push(new FloatingText('+25 MANA', this.player.pos.clone(), CYAN, 1.2));
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
    for (const hp of this.healthPickups) {
      const x = hp.pos.x;
      const y = hp.pos.y;
      const pulse = 0.6 + 0.4 * Math.sin(this.timeAlive * 6 + x);

      // Soft red glow + disc
      drawGlow(ctx, x, y, R + 8, RED, 0.35 * pulse);
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle   = '#3a0c12';
      ctx.fill();
      ctx.lineWidth   = 2.5;
      ctx.strokeStyle = RED;
      ctx.stroke();

      // White cyber-cross (med icon)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 7, y - 2.5, 14, 5);
      ctx.fillRect(x - 2.5, y - 7, 5, 14);
    }
  }

  // Cyan mana pickup — visually distinct from the red/white HP cross (world-space).
  _drawManaPickups(ctx) {
    const R = 16;
    for (const m of this.manaPickups) {
      const x = m.pos.x, y = m.pos.y;
      const pulse = 0.6 + 0.4 * Math.sin(this.timeAlive * 6 + x);

      // Soft cyan glow + disc
      drawGlow(ctx, x, y, R + 8, CYAN, 0.4 * pulse);
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle   = '#06283a';
      ctx.fill();
      ctx.lineWidth   = 2.5;
      ctx.strokeStyle = CYAN;
      ctx.stroke();

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

    // Convert world position → screen position (account for the VIEW_SCALE zoom)
    const sx = (this.gridCache.pos.x - this.camera.x) * VIEW_SCALE;
    const sy = (this.gridCache.pos.y - this.camera.y) * VIEW_SCALE;

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
    if (!this.player.canShoot()) return;
    if (!this.aimAssist) return;                          // T still toggles auto-fire on/off
    const target = this._autoTarget(this.player.pos, 750); // wide, screen-aware detection
    if (!target) return;                                  // no enemy/boss/carrier in range → hold fire
    const proj = this.player.shoot(target.pos);
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

  spawnEnemyBullet(pos, dir, speed, damage, radius, color) {
    this.enemyBullets.push({ pos, dir: dir.clone(), speed, damage, radius, color, life: 4.0 });
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

      // Hit player — ignore during hit cooldown or phoenix revive
      if (this.playerHitCooldown <= 0 && this.phoenixReviveTimer <= 0) {
        if (distance(b.pos, this.player.pos) < b.radius + PLAYER_RADIUS) {
          this.player.applyDamage(b.damage);
          this.playerHitCooldown = 0.5;
          this.screenShake.trigger(5, 0.2);
          this.particles.spawnHitSparks(this.player.pos, RED);
          this.audio?.playEnemyProjectileImpact();
          this.floatingTexts.push(
            new FloatingText(`-${b.damage} HP`, this.player.pos.clone(), RED, 0.7)
          );
          this.enemyBullets.splice(i, 1);
        }
      }
    }
  }

  _handleCorePickupAndSlotting(dt) {
    for (let i = this.groundCores.length - 1; i >= 0; i--) {
      const core = this.groundCores[i];
      const d    = distance(core.pos, this.player.pos);

      if (d < this.player.pickupRadius && this.player.carry < this.player.maxCarry) {
        const pull = safeNormalize(this.player.pos.sub(core.pos));
        core.pos.addMut(pull.scale(360 * dt));

        if (d < PLAYER_RADIUS + CORE_RADIUS + 8) {
          this.groundCores.splice(i, 1);
          this.player.carry++;
          this.overload = Math.max(0, this.overload - OVERLOAD_PICKUP_REDUCTION);
          this.floatingTexts.push(new FloatingText('CORE VACUUMED', this.player.pos.clone(), CYAN, 0.8));
          this.particles.spawnCorePickup(core.pos, core.color);
          this.audio?.playCorePickup();
        }
      }
    }

    if (this.player.carry > 0) {
      for (const matrix of this.matrices) {
        if (this.player.carry <= 0) break;
        if (matrix.hasSpace() && distance(this.player.pos, matrix.pos) < this.player.returnRadius) {
          matrix.slotCore();
          this.player.carry--;
          this.player.coresSecured++;
          this.overload = Math.max(0, this.overload - OVERLOAD_SLOT_REDUCTION);
          this.player.gainXp(2, this.floatingTexts);
          this.floatingTexts.push(new FloatingText('CORE SLOTTED', matrix.pos.clone(), GREEN, 0.9));
          this.particles.spawnCoreSlot(matrix.pos, matrix.color);
          this.audio?.playCoreSlot();
          this.score += 25;
          // Matrix RNG bonus: ~22% of deposits award a variable Grid Credit cache (2–5).
          if (Math.random() < 0.22) {
            const c = 2 + Math.floor(Math.random() * 4);   // 2..5
            this.meta.addCredits(c);
            this.runCreditsEarned = (this.runCreditsEarned || 0) + c;
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
          if (cryo > 0 && !e.isBoss() && !e.isMegaBoss) {
            e.slowTimer = Math.max(e.slowTimer, 0.8 + 0.3 * cryo);   // refresh, don't stack
          }
          e.takeHit(p.damage, this);
          this.projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }

      // Check titan hit
      if (!hit && this.titanBoss && this.titanBoss.hp > 0 &&
          distance(p.pos, this.titanBoss.pos) < p.radius + this.titanBoss.radius) {
        this.titanBoss.hp      -= p.damage;
        this.titanBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + p.damage, this.titanBoss.pos.add(new Vec2(randomRange(-10, 10), -this.titanBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, PURPLE);
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.titanBoss.hp <= 0) this._titanDie();
      }

      // Check Matrix Annihilator hit
      if (!hit && this.annihilatorBoss && this.annihilatorBoss.hp > 0 &&
          distance(p.pos, this.annihilatorBoss.pos) < p.radius + this.annihilatorBoss.radius) {
        this.annihilatorBoss.hp      -= p.damage;
        this.annihilatorBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + p.damage, this.annihilatorBoss.pos.add(new Vec2(randomRange(-10, 10), -this.annihilatorBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, RED);
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.annihilatorBoss.hp <= 0) this._annihilatorDie();
      }

      // Check Bloodfang Packmaster hit
      if (!hit && this.bloodfangBoss && this.bloodfangBoss.hp > 0 &&
          distance(p.pos, this.bloodfangBoss.pos) < p.radius + this.bloodfangBoss.radius) {
        this.bloodfangBoss.hp      -= p.damage;
        this.bloodfangBoss.hitFlash = 0.08;
        this.floatingTexts.push(new FloatingText('-' + p.damage, this.bloodfangBoss.pos.add(new Vec2(randomRange(-10, 10), -this.bloodfangBoss.radius - 6)), WHITE, 0.5));
        this.particles.spawnHitSparks(p.pos, RED);
        this.projectiles.splice(i, 1);
        hit = true;
        if (this.bloodfangBoss.hp <= 0) this._bloodfangDie();
      }

      if (!hit && !p.alive()) this.projectiles.splice(i, 1);
    }
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
          e.takeHit(disc.damage, this);
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
    // Cyber Arm Hero uses the Neon Pierce Beam instead — Chain Lightning is gated off for him
    // (code kept intact for the other characters / future use).
    if (p.selectedCharacter === 'cyber_arm_hero') return false;
    const FIRST_RANGE = 520, JUMP_RADIUS = 240, BOUNCES = 3, BOLT_SPEED = 1200;
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
      const dmg = (e.isBoss() || e.isMegaBoss) ? 8 : 25;   // reduced vs bosses so it never melts them
      e.takeHit(dmg, this);
    }
    this.particles.spawnHitSparks(new Vec2(node.x, node.y), CYAN, 7, 3);   // larger spark for readability
  }

  _drawChainLightning(ctx) {
    if (this._chainBolts.length === 0 && this._chainLinks.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    // Lead bolts — small fast electric-blue projectile with a short trail
    for (const b of this._chainBolts) {
      const dx = b.toX - b.fromX, dy = b.toY - b.fromY;
      const len = Math.hypot(dx, dy) || 1;
      const tailX = b.x - (dx / len) * 14, tailY = b.y - (dy / len) * 14;
      ctx.globalAlpha = 0.6;  ctx.strokeStyle = '#3aa0ff'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 1;    ctx.strokeStyle = CYAN;      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 1;    ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    // Chain links — thin jagged cyan lightning between targets, drawn only once struck, fading out
    for (const L of this._chainLinks) {
      if (!L.struck) continue;
      const a  = L.life / 0.10;
      const dx = L.bx - L.ax, dy = L.by - L.ay;
      const nlen = Math.hypot(dx, dy) || 1;
      const px = -dy / nlen, py = dx / nlen;   // unit perpendicular for the jagged offsets
      const pts = [{ x: L.ax, y: L.ay }];
      for (let i = 1; i <= L.offsets.length; i++) {
        const f = i / (L.offsets.length + 1), off = L.offsets[i - 1];
        pts.push({ x: L.ax + dx * f + px * off, y: L.ay + dy * f + py * off });
      }
      pts.push({ x: L.bx, y: L.by });
      const stroke = (w, col, al) => {
        ctx.globalAlpha = al * a; ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };
      stroke(7, '#3aa0ff', 0.60);   // blue glow
      stroke(3, CYAN,      1.00);   // cyan core
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
    const RANGE = 800, WIDTH = 22, DMG = 20;

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
    this._neonBeams.push({ startPos, dir: aimDir, length: RANGE, life: 0.15, maxLife: 0.15 });
    this.audio?.playHit?.();
    return true;
  }

  // World-space red beam: optional asset muzzle at the arm + procedural red beam + origin glow.
  _drawNeonPierceBeam(ctx) {
    if (!this._neonBeams.length) return;
    const spr   = this._neonBeamSprite;
    const ready = spr && spr.complete && spr.naturalWidth > 0;
    ctx.save();
    ctx.lineCap = 'round';
    for (const b of this._neonBeams) {
      const alpha = Math.max(0, b.life / b.maxLife);
      const endX  = b.startPos.x + b.dir.x * b.length;
      const endY  = b.startPos.y + b.dir.y * b.length;
      const ang   = Math.atan2(b.dir.y, b.dir.x);

      // Procedural red beam (additive)
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ff2a2a'; ctx.lineWidth = Math.max(1, 10 * alpha);
      ctx.beginPath(); ctx.moveTo(b.startPos.x, b.startPos.y); ctx.lineTo(endX, endY); ctx.stroke();
      ctx.strokeStyle = '#ffd2d2'; ctx.lineWidth = Math.max(1, 3 * alpha);
      ctx.beginPath(); ctx.moveTo(b.startPos.x, b.startPos.y); ctx.lineTo(endX, endY); ctx.stroke();

      // Red muzzle glow at the cyber-arm origin
      const g = ctx.createRadialGradient(b.startPos.x, b.startPos.y, 0, b.startPos.x, b.startPos.y, 26);
      g.addColorStop(0, 'rgba(255,80,80,' + (0.9 * alpha) + ')');
      g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.startPos.x, b.startPos.y, 26, 0, Math.PI * 2); ctx.fill();

      // Asset muzzle + near-beam (the barrel sits at the cyber arm), drawn on top in normal blend
      if (ready) {
        const dh = 60;                                           // muzzle height
        const dw = dh * (spr.naturalWidth / spr.naturalHeight);  // keep aspect (barrel + near-beam)
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha;
        ctx.translate(b.startPos.x, b.startPos.y);
        ctx.rotate(ang);
        ctx.drawImage(spr, -dw * 0.15, -dh / 2, dw, dh);          // barrel just behind origin, beam forward
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ── Aqua Spirit Trail (Neon Taekwondo Girl secondary) ───────────────────────
  // Passive: while she MOVES she leaves cyan spirit-water puddles. Enemies standing in a
  // puddle take gradual, capped damage. Bosses take heavily reduced damage. No knockback,
  // no instant kills, count-limited for performance. Standing still spawns nothing.
  _updateAquaTrail(dt) {
    const AQUA_TICK = 0.25, AQUA_NORMAL_TICK = 2.0, AQUA_CAP = 16;  // per-tick + per-enemy/per-puddle cap

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
        e.takeHit(d, this);
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
      hitOne(b, false, true, (d) => { b.hp -= d; b.hitFlash = 0.08; if (b.hp <= 0) die.call(this); });
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

  // ── Spirit Dojang Flag ultimate (Neon Taekwondo Girl, SPACE, 100 mana) ───────
  // Plants a flag at the cast position; a 7s circular cyan dojo field damages enemies over time
  // and slightly slows normal enemies. Bosses take controlled, capped damage and are not slowed.
  activateSpiritDojang() {
    if (this.gameState !== 'playing' || this.paused || this.gameOver || this.victory || this.upgradeUI) return;
    const p = this.player;
    if (p.selectedCharacter !== 'taekwondo_girl') return;   // Neon Taekwondo Girl only
    if (this.spiritDojang) return;                          // already running
    if (p.mana < p.maxMana) {                               // same NOT-ENOUGH-MANA behavior as other ultimates
      this.floatingTexts.push(new FloatingText('NOT ENOUGH MANA', p.pos.clone(), CYAN, 1.0));
      return;
    }
    p.mana = 0;                                             // consume full mana → HUD ring empties
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
    const DURATION = 7, RADIUS = 205;
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
    const RADIUS = 205, DURATION = 7;
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
    const chaosGain = Math.min(0.28, groundCount * 0.020 + carriedCount * 0.050 + emptySlots * 0.012);

    if (chaosGain === 0) {
      // Grid fully secure — drain at 1.0% per second
      this.overload = Math.max(0, this.overload - 1.0 * dt);
    } else {
      // Scale with time: ramps faster mid/late so falling behind on cores bites after 10 min.
      const minutes  = this.timeAlive / 60;
      const diffMult = Math.min(2.6, 1.0 + minutes * 0.05) * (1 - this.player.overloadDampening);
      this.overload  = clamp(this.overload + chaosGain * diffMult * dt, 0, MAX_OVERLOAD);
    }

    // Time-based minimum floor — phased so a secured grid still feels increasingly dangerous late-game:
    //   0–10 min: gentle ramp, caps 35% (~7:00) — early pace unchanged.
    //   10–15 min: 35% → 55%.   15+ min: 55% → 80% (@20:00), hard-capped 85% so it's never auto-loss.
    // Falling behind on cores still pushes overload ABOVE the floor via chaosGain above.
    const mins = this.timeAlive / 60;
    let floorPct;
    if      (mins <= 10) floorPct = Math.min(35, mins * 5.0);
    else if (mins <= 15) floorPct = 35 + (mins - 10) * 4.0;
    else                 floorPct = Math.min(85, 55 + (mins - 15) * 5.0);
    this.overload  = Math.max(this.overload, floorPct);

    if (this.audio) this.audio.updateAlarm(this.overload);
  }

  _updateSpawning(dt) {
    if (this.spawnPauseTimer > 0) { this.spawnPauseTimer -= dt; return; }
    this.spawnTimer += dt;
    // During Thunder Solo, keep waves arriving fast so the 7s ultimate always has targets
    // (still capped by enemyCap() inside spawnEnemy — not unfair spam).
    const interval = this.thunderSolo ? Math.min(this.enemySpawnInterval(), 0.4) : this.enemySpawnInterval();
    if (this.spawnTimer >= interval) {
      this.spawnTimer = 0;
      const minute = this.currentMinute();
      let count = Math.random() < Math.min(0.55, 0.30 + minute * 0.06) ? 2 : 1;
      if (minute >= 3 && Math.random() < 0.20) count++;   // occasional +1 after Titan
      for (let i = 0; i < count; i++) this.spawnEnemy();   // spawnEnemy() still enforces enemyCap
    }
  }

  _updateFloatingTexts(dt) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      this.floatingTexts[i].update(dt);
      if (this.floatingTexts[i].timer <= 0) this.floatingTexts.splice(i, 1);
    }
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
      bestMatrix.slotCore();
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
    this.player.mana = Math.min(this.player.maxMana, this.player.mana + 25);
    this.floatingTexts.push(
      new FloatingText('+25 MANA', new Vec2(this.player.pos.x, this.player.pos.y + 18), CYAN, 2.0)
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
    // Zoom out slightly so more of the battlefield is visible (VIEW_SCALE < 1).
    ctx.save();
    ctx.scale(VIEW_SCALE, VIEW_SCALE);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 1 ── World Background
    this._drawWorldBackground(ctx);

    // 1a ── Boss Lava/Fire Rain zones (ground markers — under entities so they read as terrain)
    this._drawBossLava(ctx);

    // 2 ── Power Matrices (fill-based glow + counter owned by PowerMatrix; overload drives danger blink)
    for (const m of this.matrices) m.draw(ctx, this.overload / MAX_OVERLOAD);

    // 3 ── Data-Cores on the ground
    for (const core of this.groundCores) {
      const spr = this._coreSprite;
      const sz  = 28;
      drawGlow(ctx, core.pos.x, core.pos.y, 13, core.color, 0.5);
      if (spr && spr.complete && spr.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(spr, Math.round(core.pos.x - sz / 2), Math.round(core.pos.y - sz / 2), sz, sz);
        ctx.imageSmoothingEnabled = true;
      } else {
        ctx.fillStyle = core.color;
        ctx.beginPath(); ctx.arc(core.pos.x, core.pos.y, 8, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 3a ── HP CELL recovery pickups
    this._drawHealthPickups(ctx);
    this._drawManaPickups(ctx);

    // 3b ── Aqua Spirit Trail puddles (ground terrain — under entities so they read as footprints)
    this._drawAquaPuddles(ctx);

    // 4 ── Enemies
    for (const e of this.enemies) e.draw(ctx);

    // 4a ── Support drones (drawn between enemies and titan so they appear above enemies)
    for (const d of this.supportDrones) d.draw(ctx);

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
    this._drawThunderSoloGuitar(ctx);
    this.player.draw(ctx, this._lastMousePos || { x: 0, y: 0 });

    // 6 ── Projectiles, homing discs, EMP rings, particles
    for (const p of this.projectiles) p.draw(ctx);   // keep character-specific attack sprite identity
    for (const d of this.homingDiscs) d.draw(ctx);
    this._drawChainLightning(ctx);
    this._drawNeonPierceBeam(ctx);
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
      drawGlow(ctx, b.pos.x, b.pos.y, b.radius * 2, b.color, 0.5);
      ctx.fillStyle   = b.color;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.stroke();
    }

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
      ctx.fillRect(this.camera.x, this.camera.y, VIEW_W, VIEW_H);   // cover the zoomed-out view
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

    ctx.restore();  // end camera-space block

    this._drawThunderSoloScreen(ctx);  // darken + fullscreen lightning flash (under HUD)

    // ── Screen-space block (HUD, overlays) ───────────────────────────────────
    this._drawAcidRain(ctx);
    this._drawGridCacheArrow(ctx);
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, WIDTH, 44);

    drawHUD(ctx, this);
    drawVignette(ctx, this.overload, this.timeAlive);
    this._drawScanlines(ctx);
    this._drawAnnouncement(ctx);

    if (this.upgradeUI) this.upgradeUI.draw(ctx, this.player, this);
    if (this.gameOver || this.victory) drawEndScreen(ctx, this);

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
      this._drawBackground(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // Dark tint so button text reads clearly over the image
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Title
    ctx.font      = 'bold 56px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('PHENIX SURVIVORS', WIDTH / 2, 130);

    // Button labels — always drawn, no duplication possible since image has none
    // Layout constants are mirrored in main.js start_menu click hit-test.
    const startY = 250, spacing = 64, BW = 360;
    for (let i = 0; i < this.menuItems.length; i++) {
      const y  = startY + i * spacing;
      const bx = WIDTH / 2 - BW / 2;
      if (i === this.menuIndex) {
        ctx.fillStyle   = 'rgba(0,230,255,0.15)';
        ctx.fillRect(bx, y - 30, BW, 52);
        ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
        ctx.strokeRect(bx, y - 30, BW, 52);
        ctx.font      = 'bold 30px Consolas, monospace';
        ctx.fillStyle = CYAN;
      } else {
        ctx.font      = 'bold 30px Consolas, monospace';
        ctx.fillStyle = WHITE;
      }
      ctx.textAlign = 'center';
      ctx.fillText(this.menuItems[i], WIDTH / 2, y);
    }

    // Navigation hint
    ctx.font      = '14px Consolas, monospace';
    ctx.fillStyle = 'rgba(200,200,200,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ W/S  Navigate     ENTER / Click  Select', WIDTH / 2, HEIGHT - 22);
    ctx.textAlign = 'left';
  }

  // ── Wave announcement system ──────────────────────────────────────────────

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

  _drawCharacterSelect(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 48px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('SELECT YOUR CHARACTER', WIDTH / 2, 100);

    ctx.font = 'bold 32px Consolas, monospace';
    const cardWidth = 220;
    const cardHeight = 280;
    const spacing = 280;
    const startX = WIDTH / 2 - cardWidth - spacing / 2;

    for (let i = 0; i < this.characters.length; i++) {
      const char = this.characters[i];
      const x = startX + i * spacing;
      const y = HEIGHT / 2 - cardHeight / 2;

      // Draw card border
      if (i === this.characterIndex) {
        ctx.strokeStyle = YELLOW;
        ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 2;
      }
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      // Character portrait — use preloaded image or fallback circle
      const charData = this.characters[i];
      const cimg     = this._charImages[charData.id];
      if (cimg && cimg.complete && cimg.naturalWidth > 0) {
        const imgH = 200;
        const imgW = Math.round(cimg.naturalWidth * (imgH / cimg.naturalHeight));
        ctx.drawImage(cimg, x + (cardWidth - imgW) / 2, y + 8, imgW, imgH);
      } else {
        ctx.fillStyle = charData.fallbackColor;
        ctx.beginPath();
        ctx.arc(x + cardWidth / 2, y + 90, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = charData.fallbackAlt;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Draw character name
      ctx.font = 'bold 16px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'center';
      ctx.fillText(char.name, x + cardWidth / 2, y + cardHeight - 30);

      ctx.font      = 'italic 12px Consolas, monospace';
      ctx.fillStyle = '#AAAAAA';
      ctx.fillText(char.role, x + cardWidth / 2, y + cardHeight - 12);
    }

    ctx.font = '14px Consolas, monospace';
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.fillText('← → Select • ENTER Confirm • ESC Back', WIDTH / 2, HEIGHT - 30);
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

    // Panel
    ctx.fillStyle = 'rgba(0,10,24,0.96)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(0,230,255,0.15)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 5, py + 5, pw - 10, ph - 10);

    // Title
    ctx.textAlign = 'center';
    ctx.font      = 'bold 36px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.fillText('HOW TO PLAY', WIDTH / 2, py + 46);

    // Separator
    ctx.strokeStyle = 'rgba(0,230,255,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 50, py + 58); ctx.lineTo(px + pw - 50, py + 58); ctx.stroke();

    ctx.textAlign = 'left';
    const lx = px + 28;
    const y0 = py + 76;
    const lh = 21;

    // ── OBJECTIVE ──────────────────────────────────────────────
    ctx.font      = 'bold 15px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.fillText('OBJECTIVE', lx, y0);

    const objectives = [
      'Protect the Power Matrices.',
      'Recover dropped Data-Cores.',
      'Return Data-Cores to the Matrix bases.',
      'Stop enemies from stealing cores.',
      'Survive enemy attacks.',
      'Prevent Network Overload from reaching 100%.',
    ];
    ctx.font      = '14px Consolas, monospace';
    ctx.fillStyle = WHITE;
    objectives.forEach((line, i) => ctx.fillText('• ' + line, lx + 8, y0 + 22 + i * lh));

    // ── CONTROLS ───────────────────────────────────────────────
    const ctrY = y0 + 22 + objectives.length * lh + 20;
    ctx.font      = 'bold 15px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.fillText('CONTROLS', lx, ctrY);

    const controls = [
      ['WASD / Arrow Keys', 'Move'],
      ['Auto-Fire',         'Automatic — no mouse click'],
      ['SHIFT',             'Dash'],
      ['SPACE',             'Reserved — Special Ability (soon)'],
      ['E',                 'Special Move'],
      ['T',                 'Toggle Aim Assist'],
      ['M',                 'Mute / Unmute Music'],
      ['ESC',               'Back / Pause'],
    ];
    controls.forEach(([key, action], i) => {
      const ky = ctrY + 22 + i * lh;
      ctx.font      = 'bold 13px Consolas, monospace';
      ctx.fillStyle = YELLOW;
      ctx.fillText(key, lx + 8, ky);
      ctx.font      = '13px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.fillText('—  ' + action, lx + 192, ky);
    });

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

    // Tutorial area box
    ctx.fillStyle = 'rgba(0,6,16,0.8)';
    ctx.fillRect(tpX, tpY, tpW, tpH);
    ctx.strokeStyle = 'rgba(0,200,255,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(tpX, tpY, tpW, tpH);

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

    ctx.textAlign = 'left';
  }

  _drawTutorialPanel(ctx, idx, t, tpX, tpY, tpW, tpH) {
    const cx    = tpX + tpW / 2;
    const ey    = tpY + 200;
    const descY = tpY + 355;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '13px Consolas, monospace';

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
          ctx.fillStyle   = YELLOW;
          ctx.beginPath(); ctx.arc(coreX, ey, 8, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(coreX, ey, 8, 0, Math.PI * 2); ctx.stroke();
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

        ctx.fillStyle   = CYAN;
        ctx.beginPath(); ctx.arc(playerX, ey, 12, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(playerX, ey, 12, 0, Math.PI * 2); ctx.stroke();

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
        ctx.strokeStyle = matFlash > 0 ? WHITE : CYAN;
        ctx.lineWidth   = 2 + matFlash * 2;
        ctx.strokeRect(matX - 22, ey - 22, 44, 44);
        ctx.fillStyle = `rgba(0,220,255,${(0.08 + matFlash * 0.3).toFixed(2)})`;
        ctx.fillRect(matX - 22, ey - 22, 44, 44);
        ctx.font      = 'bold 10px Consolas, monospace';
        ctx.fillStyle = matFlash > 0 ? WHITE : CYAN;
        ctx.fillText('MAT', matX, ey + 4);
        ctx.font = '13px Consolas, monospace';

        ctx.fillStyle   = CYAN;
        ctx.beginPath(); ctx.arc(playerX, ey, 12, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(playerX, ey, 12, 0, Math.PI * 2); ctx.stroke();

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

        ctx.fillStyle   = CYAN;
        ctx.beginPath(); ctx.arc(cx, ey, 12, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, ey, 12, 0, Math.PI * 2); ctx.stroke();

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
        ctx.fillStyle   = CYAN;
        ctx.beginPath(); ctx.arc(cx, pcy, 12, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, pcy, 12, 0, Math.PI * 2); ctx.stroke();
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

    ctx.fillStyle = 'rgba(0,10,24,0.96)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(0,230,255,0.15)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 5, py + 5, pw - 10, ph - 10);

    ctx.textAlign = 'center';

    // Title
    ctx.font      = 'bold 42px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.fillText('CREDITS', WIDTH / 2, py + 50);

    // Separator
    ctx.strokeStyle = 'rgba(0,230,255,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 50, py + 68); ctx.lineTo(px + pw - 50, py + 68); ctx.stroke();

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

      // Card background + border
      ctx.fillStyle = 'rgba(0,8,20,0.92)';
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = 'rgba(0,230,255,0.55)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = 'rgba(0,230,255,0.12)'; ctx.lineWidth = 1;
      ctx.strokeRect(cx + 4, cy + 4, cardW - 8, cardH - 8);

      const midX = cx + cardW / 2;

      // Section label
      ctx.font      = '13px Consolas, monospace';
      ctx.fillStyle = YELLOW;
      ctx.fillText(card.label, midX, cy + 26);

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
        this.acidRainTimer = 120; // repeat every 120s
      }
      return;
    }

    this.acidRainTimer -= dt;
    if (this.acidRainTimer <= 0) {
      this.acidRain = { timer: 12, damageAccum: 0 };
      this.triggerAnnouncement('ACID RAIN WARNING', GREEN);
      this.floatingTexts.push(
        new FloatingText('TOXIC RAIN PURGE', new Vec2(WIDTH / 2 - 120, HEIGHT / 2 - 70), GREEN, 2.5)
      );
      this.audio?.playEventWarning();
    }
  }

  // ─── Main-boss danger behaviours (Lava Rain + mini-boss summons) ───────────
  // Gated on this.megaBoss. Lava Rain damages the PLAYER ONLY (never enemies/bosses);
  // it is a separate system from the player's Acid Rain.

  _updateBossAttacks(dt) {
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

    const boss = this.megaBoss;
    if (!boss || boss.hp <= 0) return;

    const late = this.currentMinute() >= 20 ? 0.7 : 1.0;   // attacks come faster past 20 min

    if (boss.lavaCd   === undefined) boss.lavaCd   = randomRange(3, 5);
    if (boss.summonCd === undefined) boss.summonCd = randomRange(6, 9);

    // ── Lava Rain: 3–5 telegraphed zones scattered around the player ──
    boss.lavaCd -= dt;
    if (boss.lavaCd <= 0) {
      boss.lavaCd = randomRange(6, 8) * late;
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const ang  = Math.random() * Math.PI * 2;
        const dist = randomRange(40, 260);   // reroute the player without being unavoidable
        const pos  = new Vec2(
          clamp(this.player.pos.x + Math.cos(ang) * dist, WORLD_MARGIN, WORLD_W - WORLD_MARGIN),
          clamp(this.player.pos.y + Math.sin(ang) * dist, WORLD_MARGIN, WORLD_H - WORLD_MARGIN)
        );
        this.bossLavaZones.push({ pos, radius: 70, warn: 1.2, impact: 1.4, t: 0, dmgAccum: 0, dps: 16 });
      }
      this.triggerAnnouncement('LAVA RAIN INCOMING', ORANGE);
      this.audio?.playEventWarning();
    }

    // ── Summon an existing mini-boss enemy (capped so it never floods) ──
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
    // Corrosive DOT
    const dotTargets = [...this.enemies];
    if (this.titanBoss && this.titanBoss.hp > 0) dotTargets.push(this.titanBoss);
    for (const t of dotTargets) {
      if (t._corrosiveTimer > 0) {
        t._corrosiveTimer -= dt;
        t.hp -= dt;  // 1 dmg/s
      }
    }
    // Titan death check after all drone updates (safe — not inside the loop)
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
      if (!sw.hit && this.phoenixReviveTimer <= 0) {
        const d = distance(sw.pos, this.player.pos);
        if (sw.radius >= d - PLAYER_RADIUS - 4) {
          sw.hit = true;
          const dmg = 10 * (1 - this.player.contactDamageReduction);
          this.player.applyDamage(dmg);
          this.screenShake.trigger(3, 0.15);
          this.floatingTexts.push(new FloatingText(`-${Math.ceil(dmg)} HP`, this.player.pos.clone(), PURPLE, 0.8));
        }
      }
      if (sw.alpha <= 0) this._titanShockwaves.splice(i, 1);
    }

    // Update titan beams
    for (let i = this._titanBeams.length - 1; i >= 0; i--) {
      const b = this._titanBeams[i];
      b.pos.addMut(b.dir.scale(b.speed * dt));
      b.life -= dt;
      if (!b.hit && this.phoenixReviveTimer <= 0 && distance(b.pos, this.player.pos) < b.radius + PLAYER_RADIUS) {
        b.hit = true;
        const dmg = 15 * (1 - this.player.contactDamageReduction);
        this.player.applyDamage(dmg);
        this.overload = clamp(this.overload + 3, 0, MAX_OVERLOAD);
        this.floatingTexts.push(new FloatingText(`-${Math.ceil(dmg)} HP`, this.player.pos.clone(), PURPLE, 0.8));
        this.floatingTexts.push(new FloatingText('+3% OVERLOAD', new Vec2(this.player.pos.x, this.player.pos.y - 24), RED, 0.8));
        this.screenShake.trigger(4, 0.2);
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
      pos, hp: 480, maxHp: 480,
      radius: R, speed: 60, contactDamage: 16, hitFlash: 0,
      shockwaveTimer: 4, beamTimer: 8,
    };
    this.triggerAnnouncement('AI OVERLOAD TITAN DETECTED', PURPLE);
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
    const titanCredits = 12 + Math.floor(Math.random() * 9);   // 12..20
    this.meta.addCredits(titanCredits);
    this.runCreditsEarned = (this.runCreditsEarned || 0) + titanCredits;
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
      pos, hp: 480, maxHp: 480,
      radius: R, speed: 52, contactDamage: 16, hitFlash: 0,
      targetMatrix: this._nearestMatrix(pos),
      attackTimer: 3,
    };
    this.triggerAnnouncement('MATRIX ANNIHILATOR INBOUND', RED);
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
      if (target.stored <= 0) break;
      target.stored--;
      const angle  = Math.random() * Math.PI * 2;
      const radius = randomRange(50, 110);
      const cpos   = target.pos.add(new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius));
      this.groundCores.push(new DataCore(cpos, target.color));
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
    const annihilatorCredits = 12 + Math.floor(Math.random() * 9);   // 12..20
    this.meta.addCredits(annihilatorCredits);
    this.runCreditsEarned = (this.runCreditsEarned || 0) + annihilatorCredits;
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
      pos, hp: 560, maxHp: 560,
      radius: R, speed: 112, hitFlash: 0,
      biteTimer: 2.0, lungeTimer: 0, lungeDir: new Vec2(1, 0),
    };
    this.triggerAnnouncement('BLOODFANG PACKMASTER DETECTED', RED);
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
    const bloodfangCredits = 25 + Math.floor(Math.random() * 16);   // 25..40
    this.meta.addCredits(bloodfangCredits);
    this.runCreditsEarned = (this.runCreditsEarned || 0) + bloodfangCredits;
    this.overload = Math.max(0, this.overload - 10);
    this.floatingTexts.push(new FloatingText('BLOODFANG PACKMASTER DEFEATED', a.pos.clone(),                   YELLOW, 2.5));
    this.floatingTexts.push(new FloatingText('RAZORHOUND PACK BROKEN',         new Vec2(a.pos.x, a.pos.y - 28), ORANGE, 2.5));
    this.floatingTexts.push(new FloatingText('+' + bloodfangCredits + ' GRID CREDITS',               new Vec2(a.pos.x, a.pos.y - 56), GREEN,  2.5));
    this.triggerAnnouncement('BLOODFANG PACKMASTER DEFEATED', GREEN);
    this.screenShake.trigger(14, 1.0);
    this.particles.spawnExplosion(a.pos, [RED, ORANGE, YELLOW], 30);
    this.bloodfangBoss = null;
  }

  _drawBloodfang(ctx) {
    const a = this.bloodfangBoss;
    if (!a || a.hp <= 0) return;
    const R = a.radius;

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

  _updateCamera() {
    // Center the player in the (larger, zoomed-out) visible world window.
    const cx = this.player.pos.x - VIEW_W / 2;
    const cy = this.player.pos.y - VIEW_H / 2;
    this.camera.x = Math.max(0, Math.min(cx, WORLD_W - VIEW_W));
    this.camera.y = Math.max(0, Math.min(cy, WORLD_H - VIEW_H));
  }

  _worldMouse(screenPos) {
    if (!screenPos) return null;
    // Screen → world: undo the VIEW_SCALE zoom, then the camera offset.
    return { x: screenPos.x / VIEW_SCALE + this.camera.x, y: screenPos.y / VIEW_SCALE + this.camera.y };
  }

  _drawWorldBackground(ctx) {
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    const img = this._bgImage;
    if (img.complete && img.naturalWidth > 0) {
      const scale = WORLD_W / img.naturalWidth;
      const drawH = img.naturalHeight * scale;
      ctx.drawImage(img, 0, 0, WORLD_W, drawH);
      ctx.fillStyle = this.gridBlackoutActive ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.38)';
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
