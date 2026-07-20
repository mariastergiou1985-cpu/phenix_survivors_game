import { Vec2, WIDTH, HEIGHT, ORANGE, GREEN, RED, YELLOW, CYAN, PURPLE } from '../constants.js';
import { randomChoice, randomRange } from '../utils.js';
import { FloatingText } from '../entities/FloatingText.js?v=20260703990000';
import { DataCore, rollCoreType } from '../entities/DataCore.js?v=20260705040000';
import { Enemy } from '../entities/Enemy.js?v=20260724000000';

const EVENT_LABELS = {
  drone_swarm:    'DRONE SWARM INCOMING',
  core_raiders:   'CORE RAIDERS DETECTED',
  security_mech:  'SECURITY MECH DEPLOYED',
  overload_surge: 'OVERLOAD SURGE',
  hunter_squad:   'HUNTER SQUAD ENTERING GRID',
  grid_blackout:  'GRID BLACKOUT',
  firewall_purge: 'FIREWALL PURGE',
  mega_boss:      'MEGA-BOSS ATTACK',
  core_meltdown:  'CORE MELTDOWN',
};

// System-event announcement banners are now spaced out: exactly 3 per hour of play
// (Endless + Chaos), one every 20 minutes, so the banner is a rare, dramatic beat
// instead of constant interruptions over the player. warn:true = 30s heads-up FloatingText.
const WINDOWS = [
  { time: 20 * 60, type: 'grid_blackout',  warn: true  },   // 20:00
  { time: 40 * 60, type: 'firewall_purge', warn: true  },   // 40:00
  { time: 60 * 60, type: 'mega_boss',      warn: true  },   // 60:00
];

export class SystemEventManager {
  constructor() {
    this.windows     = WINDOWS.map(w => ({ ...w, warned: false, triggered: false }));
    this.activeEvent = null;
  }

  update(dt, timeAlive, game) {
    for (const w of this.windows) {
      const timeUntil = w.time - timeAlive;

      // 30-second countdown warning (suppressed for early wave events)
      if (!w.warned && w.warn && timeUntil > 0 && timeUntil <= 30) {
        w.warned = true;
        const label = EVENT_LABELS[w.type];
        game.floatingTexts.push(
          new FloatingText(`!! ${label} IN 30s !!`, game.player.pos.add(new Vec2(-180, -80)), ORANGE, 30)
        );
      }

      if (!w.triggered && timeAlive >= w.time) {
        w.triggered = true;
        this._trigger(w.type, game);
      }
    }

    if (this.activeEvent) {
      this.activeEvent.timer -= dt;
      if (this.activeEvent.type === 'grid_blackout' && this.activeEvent.timer <= 0) {
        game.gridBlackoutActive  = false;
        game._blackoutSpeedMult   = 1.0;   // blackout over — enemy speed back to normal
        this.activeEvent = null;
      }
    }
  }

  _trigger(type, game) {
    game.audio?.playEventWarning();
    switch (type) {
      case 'drone_swarm':    this._droneSwarm(game);    break;
      case 'core_raiders':   this._coreRaiders(game);   break;
      case 'security_mech':  this._securityMech(game);  break;
      case 'overload_surge': this._overloadSurge(game); break;
      case 'hunter_squad':   this._hunterSquad(game);   break;
      case 'grid_blackout':  this._gridBlackout(game);  break;
      case 'firewall_purge': this._firewallPurge(game); break;
      case 'mega_boss':      this._megaBoss(game);      break;
      case 'core_meltdown':  this._coreMeltdown(game);  break;
    }
  }

  // ── Early-game wave events ──────────────────────────────────────────────────

  _droneSwarm(game) {
    const m = game.currentMinute();
    for (let i = 0; i < 4; i++) game.enemies.push(new Enemy('Glitch Drone',  m));
    for (let i = 0; i < 2; i++) game.enemies.push(new Enemy('Rogue Punk',    m));
    game.triggerAnnouncement('DRONE SWARM INCOMING', CYAN);
  }

  _coreRaiders(game) {
    const m = game.currentMinute();
    for (let i = 0; i < 4; i++) game.enemies.push(new Enemy('Rogue Punk',          m));
    for (let i = 0; i < 2; i++) game.enemies.push(new Enemy('Stealth Infiltrator', m));
    game.triggerAnnouncement('CORE RAIDERS DETECTED', YELLOW);
  }

  _securityMech(game) {
    const m = game.currentMinute();
    for (let i = 0; i < 2; i++) game.enemies.push(new Enemy('Security Defector Mech', m));
    for (let i = 0; i < 2; i++) game.enemies.push(new Enemy('Rogue Punk',             m));
    game.triggerAnnouncement('SECURITY MECH DEPLOYED', RED);
  }

  _overloadSurge(game) {
    const m = game.currentMinute();
    for (let i = 0; i < 3; i++) game.enemies.push(new Enemy('Rogue Punk',          m));
    for (let i = 0; i < 2; i++) game.enemies.push(new Enemy('Glitch Drone',        m));
    for (let i = 0; i < 2; i++) game.enemies.push(new Enemy('Stealth Infiltrator', m));
    game.triggerAnnouncement('OVERLOAD SURGE', PURPLE);
  }

  _hunterSquad(game) {
    const m = game.currentMinute();
    for (let i = 0; i < 4; i++) game.enemies.push(new Enemy('Stealth Infiltrator', m));
    for (let i = 0; i < 3; i++) game.enemies.push(new Enemy('Rogue Punk',          m));
    game.triggerAnnouncement('HUNTER SQUAD ENTERING GRID', ORANGE);
  }

  _gridBlackout(game) {
    game.gridBlackoutActive   = true;
    game._blackoutSpeedMult   = 1.12;   // REAL effect: all enemies +12% speed for the blackout (steal economy is gone)
    this.activeEvent          = { type: 'grid_blackout', timer: 15 };
    game.floatingTexts.push(
      new FloatingText('!! GRID BLACKOUT — ENEMIES OVERDRIVEN !!', game.player.pos.add(new Vec2(-280, 0)), RED, 4)
    );
  }

  _firewallPurge(game) {
    // Old overload reduction removed — overload is now a positive kill-based recharge meter
    for (const e of game.enemies) e.stunned = 1.0;
    game.floatingTexts.push(
      new FloatingText('FIREWALL PURGE — SYSTEM CLEANSED!', game.player.pos.add(new Vec2(-220, 0)), GREEN, 3)
    );
  }

  _megaBoss(game) {
    const minute = game.currentMinute();
    const boss   = new Enemy('Rogue AI Overlord', minute);
    boss.hp      *= 3;
    boss.maxHp    = boss.hp;
    boss.isMegaBoss = true;
    game.enemies.push(boss);
    game.megaBoss = boss;

    // 3 bodyguard escorts
    for (let i = 0; i < 3; i++) {
      const bTypes = ['Rogue Punk', 'Overclocked Berserker', 'Stealth Infiltrator'];
      const guard  = new Enemy(bTypes[i % bTypes.length], minute);
      guard.bodyguardTarget = boss;
      game.enemies.push(guard);
    }

    game.floatingTexts.push(
      new FloatingText('!! MEGA-BOSS HACKER ATTACK !!', game.player.pos.add(new Vec2(-200, 40)), RED, 3)
    );
    game.screenShake.trigger(5, 0.5);
  }

  _coreMeltdown(game) {
    if (!game.matrices.length) return;
    const target = randomChoice(game.matrices);
    const count  = target.stored;

    for (let i = 0; i < count; i++) {
      const angle  = (i / Math.max(count, 1)) * Math.PI * 2;
      const radius = randomRange(60, 140);
      const pos    = target.pos.add(new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius));
      game.groundCores.push(new DataCore(pos, rollCoreType()));
    }
    target.stored = 0;

    game.floatingTexts.push(
      new FloatingText('MATRIX MELTDOWN — CORES EJECTED!', game.player.pos.add(new Vec2(-220, -40)), RED, 3)
    );
    game.screenShake.trigger(8, 1.5);
  }
}
