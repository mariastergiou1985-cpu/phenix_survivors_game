import { Vec2, WIDTH, HEIGHT, ORANGE, GREEN, RED, YELLOW } from '../constants.js';
import { randomChoice, randomRange } from '../utils.js';
import { FloatingText } from '../entities/FloatingText.js';
import { DataCore } from '../entities/DataCore.js';
import { Enemy } from '../entities/Enemy.js';

const EVENT_LABELS = {
  grid_blackout:  'GRID BLACKOUT',
  firewall_purge: 'FIREWALL PURGE',
  mega_boss:      'MEGA-BOSS ATTACK',
  core_meltdown:  'CORE MELTDOWN',
};

// Event windows: trigger at these survival times (seconds)
const WINDOWS = [
  { time: 8 * 60,  type: 'grid_blackout'  },
  { time: 15 * 60, type: 'firewall_purge' },
  { time: 22 * 60, type: 'mega_boss'      },
  { time: 28 * 60, type: 'core_meltdown'  },
];

export class SystemEventManager {
  constructor() {
    this.windows     = WINDOWS.map(w => ({ ...w, warned: false, triggered: false }));
    this.activeEvent = null;
  }

  update(dt, timeAlive, game) {
    for (const w of this.windows) {
      const timeUntil = w.time - timeAlive;

      // 30-second countdown warning
      if (!w.warned && timeUntil > 0 && timeUntil <= 30) {
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
    switch (type) {
      case 'grid_blackout':  this._gridBlackout(game);  break;
      case 'firewall_purge': this._firewallPurge(game); break;
      case 'mega_boss':      this._megaBoss(game);      break;
      case 'core_meltdown':  this._coreMeltdown(game);  break;
    }
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
