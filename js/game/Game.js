import {
  Vec2, WIDTH, HEIGHT, WORLD_MARGIN,
  WIN_TIME_SECONDS, CORE_OVERLOAD_TICK_TIME, BASE_OVERLOAD_PER_CORE,
  OVERLOAD_PICKUP_REDUCTION, OVERLOAD_SLOT_REDUCTION,
  MAX_OVERLOAD, PLAYER_RADIUS, CORE_RADIUS,
  DARK_BG, GRID_LINE, BLACK, CYAN, RED, GREEN, YELLOW, ORANGE, WHITE,
  CORE_COLORS,
} from '../constants.js';
import { clamp, distance, safeNormalize, randomChoice } from '../utils.js';

import { FloatingText }   from '../entities/FloatingText.js';
import { DataCore }       from '../entities/DataCore.js';
import { PowerMatrix }    from '../entities/PowerMatrix.js';
import { Player }         from '../entities/Player.js';
import { Projectile, HomingDisc } from '../entities/Projectile.js';
import { Enemy }          from '../entities/Enemy.js';

import { ParticleSystem, ScreenShake, drawVignette, EMPRing } from './Effects.js';
import { SystemEventManager } from './Events.js';
import { UpgradeUI }      from './UpgradeUI.js';
import { weightedSample } from './Upgrades.js';
import { drawHUD, drawEndScreen } from './HUD.js';
import { MetaProgress, META_UPGRADES, upgradeCost } from './MetaProgress.js';

export class Game {
  constructor() {
    this.audio     = null;  // set from main.js on first user gesture
    this.paused    = false;
    this.aimAssist = true;
    this.meta      = new MetaProgress();

    // Load background image — try canonical path first, fall back to enemies/ (OneDrive quirk)
    this._bgImage = new Image();
    this._bgImage.onerror = () => {
      const fallback = new Image();
      fallback.src = 'assets/enemies/cyberpunk_city_background.png';
      this._bgImage = fallback;
    };
    this._bgImage.src = 'assets/cyberpunk_city_background.png';

    // Preload character portraits for Character Select screen
    this._charImages = {};
    ['skeleton_warrior', 'taekwondo_girl', 'cyber_arm_hero'].forEach(id => {
      const img = new Image();
      img.src = `assets/characters/${id}.png`;
      this._charImages[id] = img;
    });

    // Preload start-menu background image
    this._menuBg = new Image();
    this._menuBg.src = 'assets/ui/start_menu_background.png';

    // Preload phoenix revive effect image
    this._phoenixImage = new Image();
    this._phoenixImage.src = 'assets/effects/phoenix_revive.png';

    // Game state management
    this.gameState = 'start_menu'; // 'start_menu' | 'character_select' | 'playing' | 'game_over' | 'victory' | 'exit_screen'
    this.selectedCharacter = null; // 'skeleton_warrior' | 'taekwondo_girl' | 'cyber_arm_hero'
    
    // Menu state
    this.menuIndex = 0;
    this.characterIndex = 0;
    this.characters = [
      { id: 'skeleton_warrior', name: 'Cyber Skeleton Warrior', fallbackColor: '#8B0050', fallbackAlt: '#FF0080' },
      { id: 'taekwondo_girl', name: 'Neon Taekwondo Girl', fallbackColor: '#00D9FF', fallbackAlt: '#0099CC' },
      { id: 'cyber_arm_hero', name: 'Cyber Arm Hero', fallbackColor: '#FF6600', fallbackAlt: '#CC0000' }
    ];
    this.menuItems = ['START GAME', 'CHARACTER SELECT', 'UPGRADES', 'CREDITS', 'EXIT'];

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
    this.empRings     = [];
    this._specialRings    = [];
    this._specialBeams    = [];
    this._specialTrail    = [];
    this._taekwondoDmgSet = new Set();
    this.enemyBullets = [];
    this.floatingTexts = [];
    this.particles    = new ParticleSystem();
    this.screenShake  = new ScreenShake();
    this.events       = new SystemEventManager();
    this.upgradeUI    = null;
    this.megaBoss     = null;

    this.timeAlive          = 0;
    this.overload           = 0;
    this.overloadTickTimer  = 0;
    this.spawnTimer         = 0;
    this.spawnPauseTimer    = 0;
    this.stealSpeedMultiplier = 1.0;
    this.gridBlackoutActive   = false;

    // Phoenix revive — triggers once when player HP first hits 0
    this.phoenixUsed        = false;
    this.phoenixReviveTimer = 0;   // > 0 while the flash animation plays

    this.gameOver          = false;
    this.victory           = false;
    this.finalMessage      = '';
    this.rewardsGranted    = false;
    this.runCreditsEarned  = 0;
    this.playerHitCooldown = 0;

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
    this.audio?.startMenuMusic();
  }

  goToExitScreen() {
    this.gameState = 'exit_screen';
  }

  goToUpgradesScreen() {
    this.gameState      = 'upgrades';
    this._upgradeMsg    = '';
    this._upgradeMsgTimer = 0;
    this._confirmReset  = false;
  }

  goToCredits() { this.gameState = 'credits'; }

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

    const coreCredits    = Math.floor(this.player.coresSecured / 10);
    const killCredits    = Math.floor(this.player.kills / 10);
    const timeCredits    = this.timeAlive >= 300 ? 5 : 0;
    const victoryCredits = this.victory ? 10 : 0;

    this.runCreditsEarned = coreCredits + killCredits + timeCredits + victoryCredits;
    this.meta.addCredits(this.runCreditsEarned);
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
      [190,         165],
      [WIDTH - 190, 165],
      [210,         HEIGHT - 145],
      [WIDTH - 210, HEIGHT - 145],
      [WIDTH / 2,   HEIGHT / 2],
    ];
    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i];
      this.matrices.push(new PowerMatrix(new Vec2(x, y), CORE_COLORS[i % CORE_COLORS.length]));
    }
  }

  currentMinute()             { return Math.floor(this.timeAlive / 60); }
  coreVolatilityMultiplier()  { return 1 + (this.timeAlive / WIN_TIME_SECONDS) * 1.8; }
  overloadRateMultiplier()    { return 1 + Math.floor(this.timeAlive / 120) * 0.05; }
  enemyCap()                  { return 10 + this.currentMinute() * 8; }
  enemySpawnInterval()        { return Math.max(0.25, 1.25 - this.currentMinute() * 0.035); }

  chooseEnemyType() {
    const t      = this.timeAlive;
    const minute = this.currentMinute();
    let pool;

    if      (t < 60)   pool = ['Glitch Drone', 'Glitch Drone', 'Rogue Punk'];
    else if (t < 150)  pool = ['Glitch Drone', 'Rogue Punk', 'Scrap Scavenger'];
    else if (t < 240)  pool = ['Glitch Drone', 'Rogue Punk', 'Stealth Infiltrator', 'Scrap Scavenger'];
    else if (minute < 8)  pool = ['Glitch Drone', 'Rogue Punk', 'Stealth Infiltrator'];
    else if (minute < 12) pool = ['Rogue Punk', 'Stealth Infiltrator', 'Scrap Scavenger'];
    else if (minute < 15) {
      pool = ['Rogue Punk', 'Stealth Infiltrator', 'Scrap Scavenger'];
      if (!this.enemies.some(e => e.enemyType === 'Security Defector Mech'))
        return 'Security Defector Mech';
    }
    else if (minute < 20) pool = ['Stealth Infiltrator', 'Scrap Scavenger', 'Cyber-Net Junkie'];
    else if (minute < 25) pool = ['Cyber-Net Junkie', 'Overclocked Berserker', 'Scrap Scavenger'];
    else {
      pool = ['Overclocked Berserker', 'Cyber-Net Junkie', 'Stealth Infiltrator'];
      if (!this.enemies.some(e => e.enemyType === 'Rogue AI Overlord') && !this.megaBoss)
        return 'Rogue AI Overlord';
    }
    return randomChoice(pool);
  }

  spawnEnemy() {
    if (this.enemies.length >= this.enemyCap()) return;
    this.enemies.push(new Enemy(this.chooseEnemyType(), this.currentMinute()));
  }

  // ─── Ability activations ──────────────────────────────────────────────────

  activateSonicPulse(mousePos) {
    const p = this.player;
    if (p.upgrades['Sonic Pulse'] === 0 || p.sonicPulseCooldown > 0) return;

    const aimDir   = safeNormalize(new Vec2(mousePos.x - p.pos.x, mousePos.y - p.pos.y));
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
    const aimDir = this._lastMousePos
      ? safeNormalize(new Vec2(this._lastMousePos.x - p.pos.x, this._lastMousePos.y - p.pos.y))
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
    const aimDir = this._lastMousePos
      ? safeNormalize(new Vec2(this._lastMousePos.x - p.pos.x, this._lastMousePos.y - p.pos.y))
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
    if (p.upgrades['EMP Cloud'] === 0 || p.empCloudCooldown > 0) return;

    const radius   = 200 + p.upgrades['EMP Cloud'] * 40;
    const duration = 2.0 + p.upgrades['EMP Cloud'] * 0.4;

    for (const e of this.enemies) {
      if (distance(e.pos, p.pos) < radius) e.stunned = duration;
    }

    this.empRings.push(new EMPRing(p.pos.clone(), radius));
    p.empCloudCooldown = Math.max(8, 18 - p.upgrades['EMP Cloud'] * 2);
    this.floatingTexts.push(new FloatingText('EMP DEPLOYED!', p.pos.clone(), ORANGE, 0.9));
  }

  selectUpgrade(index) {
    if (!this.upgradeUI || index >= this.upgradeUI.choices.length) return;
    this.upgradeUI.choices[index].apply(this.player);
    this.upgradeUI = null;
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
    if (this.gameState !== 'playing') return;

    if (this.paused || this.gameOver || this.victory) return;

    // If upgrade UI is active, freeze everything but allow UI interaction
    if (this.upgradeUI) return;

    // Check for pending level-up to show upgrade cards (one at a time)
    if (this.player.pendingLevelupCount > 0) {
      this.player.pendingLevelupCount--;
      const choices = weightedSample(this.player, 3);
      if (choices.length > 0) {
        this.upgradeUI = new UpgradeUI(choices);
        return;
      }
    }

    this.timeAlive += dt;
    this.screenShake.update(dt);

    if (this.timeAlive >= WIN_TIME_SECONDS) {
      this.victory      = true;
      this.finalMessage = 'CITY GRID STABILIZED — VICTORY';
      this.audio?.stopAll();
      this._grantRewards();
      return;
    }

    this.player.update(dt, input);
    this._handleMouseShooting(input);
    this._handleCorePickupAndSlotting(dt);
    this._updateProjectiles(dt);
    this._updateHomingDiscs(dt);
    this._updateEnemies(dt);
    this._updateOverload(dt);
    this._updateSpawning(dt);
    this._updateFloatingTexts(dt);
    this._updateEffects(dt);
    this._updateSpecialEffects(dt);
    this._checkPlayerEnemyCollisions(dt);
    this._updateEnemyBullets(dt);
    this._updateAbilityTimers(dt);
    this._updateQuantumOverhaul(dt);
    this.events.update(dt, this.timeAlive, this);
    this.particles.update(dt);

    for (const m of this.matrices) m.update(dt);

    // Tick down phoenix animation
    if (this.phoenixReviveTimer > 0) this.phoenixReviveTimer -= dt;

    if (this.overload >= MAX_OVERLOAD) {
      this.gameOver     = true;
      this.finalMessage = 'CITY GRID TOTAL BLACKOUT';
      this.audio?.stopAll();
      this._grantRewards();
    } else if (this.player.hp <= 0) {
      if (!this.phoenixUsed) {
        this._triggerPhoenixRevive();   // first death → revive
      } else {
        this.gameOver     = true;
        this.finalMessage = 'CYBER-HERO OFFLINE';
        this.audio?.stopAll();
        this._grantRewards();
      }
    }
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
      if (this.menuIndex === 0 || this.menuIndex === 1) {
        this.goToCharacterSelect();
      } else if (this.menuIndex === 2) {
        this.goToUpgradesScreen();
      } else if (this.menuIndex === 3) {
        this.goToCredits();
      } else if (this.menuIndex === 4) {
        try { window.close(); } catch (e) {}
        this.goToExitScreen();
      }
      keys.delete('enter');
      keys.delete(' ');
    }
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

  _handleMouseShooting(input) {
    if (input.mouseDown && this.player.canShoot()) {
      let aimPos = input.mousePos;
      if (this.aimAssist) {
        const nearest = this._nearestEnemy(this.player.pos, 300);
        if (nearest) aimPos = nearest.pos;
      }
      const proj = this.player.shoot(aimPos);
      this.projectiles.push(proj);
      this.audio?.playShoot();
    }
  }

  _nearestEnemy(from, maxRadius) {
    let best = null, bestDist = maxRadius;
    for (const e of this.enemies) {
      const d = distance(from, e.pos);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
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
          this.player.hp = Math.max(0, this.player.hp - b.damage);
          this.playerHitCooldown = 0.5;
          this.screenShake.trigger(5, 0.2);
          this.particles.spawnHitSparks(this.player.pos, RED);
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
          e.takeHit(p.damage, this);
          this.projectiles.splice(i, 1);
          hit = true;
          break;
        }
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

    const chaosGain = groundCount * 0.024 + carriedCount * 0.06 + emptySlots * 0.029;

    if (chaosGain === 0) {
      // Grid fully secure — drain at 1.2% per second
      this.overload = Math.max(0, this.overload - 1.2 * dt);
    } else {
      // Scale with time: x1.0 at min 0, +0.02 per minute, capped at x1.6
      const minutes  = this.timeAlive / 60;
      const diffMult = Math.min(1.6, 1.0 + minutes * 0.02) * (1 - this.player.overloadDampening);
      this.overload  = clamp(this.overload + chaosGain * diffMult * dt, 0, MAX_OVERLOAD);
    }

    if (this.audio) this.audio.updateAlarm(this.overload);
  }

  _updateSpawning(dt) {
    if (this.spawnPauseTimer > 0) { this.spawnPauseTimer -= dt; return; }
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.enemySpawnInterval()) {
      this.spawnTimer = 0;
      const count = (this.currentMinute() >= 1 && Math.random() < 0.35) ? 2 : 1;
      for (let i = 0; i < count; i++) this.spawnEnemy();
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
          const dmg = (e.contactDamage ?? 8) * dt;
          this.player.hp = Math.max(0, this.player.hp - dmg);
          damageDone = true;

          // Throttle screen shake and floating text to once per 0.5s
          if (this.playerHitCooldown <= 0) {
            this.playerHitCooldown = 0.5;
            this.screenShake.trigger(4, 0.15);
            this.particles.spawnHitSparks(this.player.pos, RED);
            this.floatingTexts.push(
              new FloatingText(`-${Math.ceil(e.contactDamage ?? 8)} HP`, this.player.pos.clone(), RED, 0.6)
            );
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
    this.phoenixUsed        = true;
    this.player.hp          = Math.ceil(this.player.maxHp * 0.5);
    this.phoenixReviveTimer = 2.5;
    this.floatingTexts.push(new FloatingText('✦ PHOENIX REVIVE ✦', this.player.pos.clone(), ORANGE, 2.5));
    this.screenShake.trigger(8, 0.5);
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
    if (this.gameState !== 'playing') {
      this._drawBackground(ctx);
      return;
    }

    // 1 ── Background
    this._drawBackground(ctx);

    // 2 ── Power Matrices
    for (const m of this.matrices) m.draw(ctx);

    // 3 ── Data-Cores on the ground
    for (const core of this.groundCores) {
      ctx.fillStyle = core.color;
      ctx.beginPath(); ctx.arc(core.pos.x, core.pos.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(core.pos.x, core.pos.y, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = core.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(core.pos.x, core.pos.y, 14, 0, Math.PI * 2); ctx.stroke();
    }

    // 4 ── Enemies
    for (const e of this.enemies) e.draw(ctx);

    // 5 ── Player
    this.player.draw(ctx, this._lastMousePos || { x: 0, y: 0 });

    // 6 ── Projectiles, homing discs, EMP rings, particles
    for (const p of this.projectiles) p.draw(ctx);
    for (const d of this.homingDiscs) d.draw(ctx);
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
      ctx.fillStyle   = b.color;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2); ctx.stroke();
    }

    // 6b ── Phoenix revive flash (drawn above everything except HUD)
    if (this.phoenixReviveTimer > 0) {
      const alpha = this.phoenixReviveTimer / 2.5;
      ctx.fillStyle = `rgba(255,140,0,${(alpha * 0.45).toFixed(3)})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const pimg = this._phoenixImage;
      if (pimg && pimg.complete && pimg.naturalWidth > 0) {
        const sz = 280;
        ctx.globalAlpha = Math.min(1, alpha * 1.6);
        ctx.drawImage(pimg, this.player.pos.x - sz / 2, this.player.pos.y - sz, sz, sz);
        ctx.globalAlpha = 1;
      }
    }

    // 7 ── HUD layer: floating texts, bars, vignette, overlays
    for (const ft of this.floatingTexts) ft.draw(ctx);
    drawHUD(ctx, this);
    drawVignette(ctx, this.overload, this.timeAlive);

    if (this.upgradeUI) this.upgradeUI.draw(ctx, this.player);
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
    const startY = 280, spacing = 80, BW = 360;
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

  _drawCreditsScreen(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.84)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const pw = 620, ph = 380;
    const px = WIDTH / 2 - pw / 2;
    const py = HEIGHT / 2 - ph / 2 - 20;

    ctx.fillStyle = 'rgba(0,12,28,0.95)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(0,230,255,0.18)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 6, py + 6, pw - 12, ph - 12);

    ctx.textAlign = 'center';

    ctx.font      = 'bold 44px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.fillText('CREDITS', WIDTH / 2, py + 60);

    ctx.strokeStyle = 'rgba(0,230,255,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 40, py + 76); ctx.lineTo(px + pw - 40, py + 76); ctx.stroke();

    ctx.font      = '15px Consolas, monospace';
    ctx.fillStyle = YELLOW;
    ctx.fillText('CREATED BY', WIDTH / 2, py + 116);
    ctx.font      = 'bold 30px Consolas, monospace';
    ctx.fillStyle = WHITE;
    ctx.fillText('InkSpireM Visuals', WIDTH / 2, py + 154);

    ctx.font      = '15px Consolas, monospace';
    ctx.fillStyle = YELLOW;
    ctx.fillText('MUSIC', WIDTH / 2, py + 204);
    ctx.font      = 'bold 26px Consolas, monospace';
    ctx.fillStyle = WHITE;
    ctx.fillText('"HOPE" by TSALI', WIDTH / 2, py + 240);

    const bw = 220, bh = 48;
    const bx = WIDTH / 2 - bw / 2;
    const by = py + ph - 72;
    ctx.fillStyle = 'rgba(0,230,255,0.1)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.font      = 'bold 22px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.fillText('[ BACK ]', WIDTH / 2, by + 32);

    ctx.font      = '13px Consolas, monospace';
    ctx.fillStyle = 'rgba(180,180,180,0.5)';
    ctx.fillText('ESC = Return to Menu', WIDTH / 2, HEIGHT - 18);

    ctx.textAlign = 'left';
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
