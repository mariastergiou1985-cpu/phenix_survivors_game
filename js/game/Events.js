import { Vec2, WIDTH, HEIGHT, ORANGE, GREEN, RED, YELLOW, CYAN, PURPLE } from '../constants.js';
import { randomChoice, randomRange } from '../utils.js';
import { FloatingText } from '../entities/FloatingText.js';
import { DataCore } from '../entities/DataCore.js?v=20260615013234';
import { Enemy } from '../entities/Enemy.js?v=20260615013234';

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

// warn:false = suppress the 30s FloatingText countdown (announcement is the notification)
const WINDOWS = [
  { time: 45,      type: 'drone_swarm',    warn: false },
  { time: 105,     type: 'core_raiders',   warn: false },
  { time: 180,     type: 'security_mech',  warn: false },
  { time: 270,     type: 'overload_surge', warn: false },
  { time: 360,     type: 'hunter_squad',   warn: false },
  { time: 8 * 60,  type: 'grid_blackout',  warn: true  },
  { time: 15 * 60, type: 'firewall_purge', warn: true  },
  { time: 22 * 60, type: 'mega_boss',      warn: true  },
  { time: 28 * 60, type: 'core_meltdown',  warn: true  },
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
          new FloatingText(`!! ${label} IN 30s !!`, new Vec2(WIDTH / 2 - 180, HEIGHT / 2 - 80), ORANGE, 30)
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
        game.stealSpeedMultiplier = 1.0;
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
    game.stealSpeedMultiplier = 2.0;
    this.activeEvent          = { type: 'grid_blackout', timer: 15 };
    game.floatingTexts.push(
      new FloatingText('!! GRID BLACKOUT — CORES UNPROTECTED !!', new Vec2(WIDTH / 2 - 280, HEIGHT / 2), RED, 4)
    );
  }

  _firewallPurge(game) {
    game.overload = Math.max(0, game.overload - 25);
    for (const e of game.enemies) e.stunned = 1.0;
    game.floatingTexts.push(
      new FloatingText('FIREWALL PURGE — SYSTEM CLEANSED!', new Vec2(WIDTH / 2 - 220, HEIGHT / 2), GREEN, 3)
    );
  }

  _megaBoss(game) {
    const minute = game.currentMinute();
    const boss   = new Enemy('Rogue AI Overlord', minute);
    boss.hp      *= 3;
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
      new FloatingText('!! MEGA-BOSS HACKER ATTACK !!', new Vec2(WIDTH / 2 - 200, HEIGHT / 2 + 40), RED, 3)
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
      game.groundCores.push(new DataCore(pos, target.color));
    }
    target.stored = 0;

    game.floatingTexts.push(
      new FloatingText('MATRIX MELTDOWN — CORES EJECTED!', new Vec2(WIDTH / 2 - 220, HEIGHT / 2 - 40), RED, 3)
    );
    game.screenShake.trigger(8, 1.5);
  }
}
