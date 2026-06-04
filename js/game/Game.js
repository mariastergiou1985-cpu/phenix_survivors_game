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

export class Game {
  constructor() {
    this.audio = null;  // set from main.js on first user gesture
    this.paused = false;
    this.aimAssist = true;

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

    // Preload start-menu mockup (used as background if present)
    this._menuMockup = new Image();
    this._menuMockup.src = 'assets/ui/start_menu_mockup.png';

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
    this.menuItems = ['START GAME', 'CHARACTER SELECT', 'UPGRADES', 'EXIT'];

    this.reset();
  }

  reset() {
    this.player       = new Player(this.selectedCharacter);
    this.matrices     = [];
    this.groundCores  = [];
    this.enemies      = [];
    this.projectiles  = [];
    this.homingDiscs  = [];
    this.empRings     = [];
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

    this.gameOver     = false;
    this.victory      = false;
    this.finalMessage = '';

    this._createMatrices();
  }

  startGame() {
    if (!this.selectedCharacter) {
      this.gameState = 'character_select';
    } else {
      this.gameState = 'playing';
      this.reset();
    }
  }

  selectCharacter(charId) {
    this.selectedCharacter = charId;
    this.gameState = 'playing';
    this.reset();
  }

  goToCharacterSelect() {
    this.gameState = 'character_select';
    this.characterIndex = 0;
  }

  goToMainMenu() {
    this.gameState = 'start_menu';
    this.menuIndex = 0;
  }

  goToExitScreen() {
    this.gameState = 'exit_screen';
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
    const minute = this.currentMinute();
    let pool;
    if      (minute < 2)  pool = ['Glitch Drone'];
    else if (minute < 5)  pool = ['Glitch Drone', 'Rogue Punk'];
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
    this._checkPlayerEnemyCollisions(dt);
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
    } else if (this.player.hp <= 0) {
      if (!this.phoenixUsed) {
        this._triggerPhoenixRevive();   // first death → revive
      } else {
        this.gameOver     = true;
        this.finalMessage = 'CYBER-HERO OFFLINE';
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
      } else if (this.menuIndex === 3) {
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
        const nearest = this._findNearestEnemy(this.player.pos, 250);
        if (nearest) aimPos = nearest.pos;
      }
      const proj = this.player.shoot(aimPos);
      this.projectiles.push(proj);
      this.audio?.playShoot();
    }
  }

  _findNearestEnemy(from, maxRadius) {
    let best = null, bestDist = maxRadius;
    for (const e of this.enemies) {
      const d = distance(from, e.pos);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
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
    this.overloadTickTimer += dt;
    if (this.overloadTickTimer < CORE_OVERLOAD_TICK_TIME) return;
    this.overloadTickTimer = 0;

    const count = this.groundCores.length;
    if (count > 0) {
      let gain = count * BASE_OVERLOAD_PER_CORE;
      gain *= this.overloadRateMultiplier();
      gain *= (1 - this.player.overloadDampening);
      this.overload += gain;
      this.overload  = clamp(this.overload, 0, MAX_OVERLOAD);
      this.floatingTexts.push(
        new FloatingText(`OVERLOAD +${gain.toFixed(1)}%`, new Vec2(WIDTH - 240, 72), RED, 0.75)
      );
    }

    if (this.audio) this.audio.updateAlarm(this.overload);
  }

  _updateSpawning(dt) {
    if (this.spawnPauseTimer > 0) { this.spawnPauseTimer -= dt; return; }
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.enemySpawnInterval()) {
      this.spawnTimer = 0;
      const count = (this.currentMinute() >= 2 && Math.random() < 0.35) ? 2 : 1;
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
    let damageDone = false;
    for (const e of this.enemies) {
      if (distance(e.pos, this.player.pos) < e.radius + PLAYER_RADIUS) {
        const push = safeNormalize(this.player.pos.sub(e.pos));
        this.player.pos.addMut(push.scale(80 * dt));
        if (!damageDone) {
          this.player.hp -= 8 * dt;
          damageDone = true;
          this.screenShake.trigger(3, 0.12);
          this.particles.spawnHitSparks(this.player.pos, RED);
        }
      }
    }
  }

  _updateAbilityTimers(dt) {
    // Homing disc timer managed in _updateHomingDiscs
    // Sonic pulse / EMP cooldowns decremented in Player.update
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
    this.particles.draw(ctx);

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
    const mockup = this._menuMockup;
    const hasMockup = mockup && mockup.complete && mockup.naturalWidth > 0;

    if (hasMockup) {
      // Use the mockup image as background — draw it full-screen
      ctx.drawImage(mockup, 0, 0, WIDTH, HEIGHT);
      // Slight dark tint so interactive highlights read clearly
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } else {
      // Procedural fallback: city bg + dark overlay + title
      this._drawBackground(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.font      = 'bold 64px Consolas, monospace';
      ctx.fillStyle = CYAN;
      ctx.textAlign = 'center';
      ctx.fillText('CYBER-GRID PROTOCOL', WIDTH / 2, 120);
    }

    // Interactive button overlay — only draw text labels when no mockup image is present
    ctx.font = 'bold 32px Consolas, monospace';
    const startY = 280, spacing = 80, BW = 360;
    for (let i = 0; i < this.menuItems.length; i++) {
      const y  = startY + i * spacing;
      const bx = WIDTH / 2 - BW / 2;
      if (i === this.menuIndex) {
        // Selected: neon highlight box (text skipped when mockup already has labels)
        ctx.fillStyle = 'rgba(255,220,0,0.15)';
        ctx.fillRect(bx, y - 30, BW, 52);
        ctx.strokeStyle = YELLOW; ctx.lineWidth = 2;
        ctx.strokeRect(bx, y - 30, BW, 52);
        if (!hasMockup) {
          ctx.fillStyle = YELLOW;
          ctx.textAlign = 'center';
          ctx.fillText(this.menuItems[i], WIDTH / 2, y);
        }
      } else if (!hasMockup) {
        ctx.fillStyle = WHITE;
        ctx.textAlign = 'center';
        ctx.fillText(this.menuItems[i], WIDTH / 2, y);
      }
    }

    ctx.font      = '14px Consolas, monospace';
    ctx.fillStyle = 'rgba(200,200,200,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ W/S  Navigate     ENTER / Click  Select', WIDTH / 2, HEIGHT - 30);
    ctx.textAlign = 'left';
  }

  _drawCharacterSelect(ctx) {
    this._drawBackground(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 42px Consolas, monospace';
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('SELECT YOUR CHARACTER', WIDTH / 2, 72);

    const cardWidth  = 220;
    const cardHeight = 400;
    const spacing    = 280;
    const startX     = WIDTH / 2 - cardWidth - spacing / 2;
    const cardY      = HEIGHT / 2 - cardHeight / 2;

    const profiles = [
      {
        role: 'TANK / SURVIVAL',
        stats: [
          { label: 'HP',     val: 5 },
          { label: 'SPEED',  val: 2 },
          { label: 'DAMAGE', val: 2 },
          { label: 'PICKUP', val: 3 },
          { label: 'CARRY',  val: 3 },
        ],
        special: ['Larger repel aura', 'High survivability'],
      },
      {
        role: 'FAST COLLECTOR',
        stats: [
          { label: 'HP',     val: 2 },
          { label: 'SPEED',  val: 5 },
          { label: 'DAMAGE', val: 2 },
          { label: 'PICKUP', val: 5 },
          { label: 'CARRY',  val: 3 },
        ],
        special: ['Fast movement', 'Extended pickup range'],
      },
      {
        role: 'BALANCED FIGHTER',
        stats: [
          { label: 'HP',     val: 3 },
          { label: 'SPEED',  val: 3 },
          { label: 'DAMAGE', val: 5 },
          { label: 'PICKUP', val: 3 },
          { label: 'CARRY',  val: 4 },
        ],
        special: ['+1 carry slot', 'High pulse damage'],
      },
    ];

    for (let i = 0; i < this.characters.length; i++) {
      const char      = this.characters[i];
      const profile   = profiles[i];
      const x         = startX + i * spacing;
      const y         = cardY;
      const isSelected = i === this.characterIndex;

      // Card background
      ctx.fillStyle = isSelected ? 'rgba(30,30,60,0.95)' : 'rgba(8,12,28,0.92)';
      ctx.fillRect(x, y, cardWidth, cardHeight);

      // Card border — bright neon when selected
      ctx.strokeStyle = isSelected ? YELLOW : 'rgba(80,120,160,0.5)';
      ctx.lineWidth   = isSelected ? 3 : 1;
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      // Portrait
      const cimg = this._charImages[char.id];
      const imgH = 148;
      if (cimg && cimg.complete && cimg.naturalWidth > 0) {
        const imgW = Math.round(cimg.naturalWidth * (imgH / cimg.naturalHeight));
        ctx.drawImage(cimg, x + (cardWidth - imgW) / 2, y + 6, imgW, imgH);
      } else {
        ctx.fillStyle = char.fallbackColor;
        ctx.beginPath();
        ctx.arc(x + cardWidth / 2, y + 74, 54, 0, Math.PI * 2);
        ctx.fill();
      }

      // Role badge
      ctx.font      = 'bold 10px Consolas, monospace';
      ctx.fillStyle = isSelected ? YELLOW : CYAN;
      ctx.textAlign = 'center';
      ctx.fillText(profile.role, x + cardWidth / 2, y + 164);

      // Character name
      ctx.font      = 'bold 12px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'center';
      ctx.fillText(char.name, x + cardWidth / 2, y + 180);

      // Stat bars
      const barX  = x + 10;
      const labelW = 48;
      const barW   = cardWidth - 20 - labelW;
      let sy = y + 198;

      for (const stat of profile.stats) {
        ctx.font      = '10px Consolas, monospace';
        ctx.fillStyle = GREY;
        ctx.textAlign = 'left';
        ctx.fillText(stat.label, barX, sy + 7);

        const fillColor = stat.val >= 4 ? GREEN : stat.val >= 3 ? CYAN : ORANGE;
        ctx.fillStyle = 'rgba(30,50,70,0.8)';
        ctx.fillRect(barX + labelW, sy, barW, 7);
        ctx.fillStyle = fillColor;
        ctx.fillRect(barX + labelW, sy, barW * (stat.val / 5), 7);
        sy += 17;
      }

      // Special abilities
      sy += 4;
      ctx.font      = 'bold 10px Consolas, monospace';
      ctx.fillStyle = isSelected ? YELLOW : GREY;
      ctx.textAlign = 'left';
      ctx.fillText('SPECIAL:', barX, sy + 7);
      sy += 16;

      ctx.font      = '10px Consolas, monospace';
      ctx.fillStyle = WHITE;
      for (const line of profile.special) {
        ctx.fillText('• ' + line, barX, sy + 7);
        sy += 15;
      }
    }

    ctx.font      = '14px Consolas, monospace';
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.fillText('← → / A D  Select     ENTER / Click  Confirm     ESC  Back', WIDTH / 2, HEIGHT - 22);
    ctx.textAlign = 'left';
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
