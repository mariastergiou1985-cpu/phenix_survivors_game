import { Vec2, WIDTH, HEIGHT, ORANGE, GREEN, RED, YELLOW, CYAN, PURPLE } from '../constants.js';
import { randomChoice, randomRange } from '../utils.js';
import { FloatingText } from '../entities/FloatingText.js?v=20260703990000';
import { DataCore, rollCoreType } from '../entities/DataCore.js?v=20260705040000';
import { Enemy } from '../entities/Enemy.js?v=20260902090000';

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
//
// THE SIX EARLY WAVE EVENTS ARE BACK IN THE TABLE (2026-08-10). drone_swarm, core_raiders,
// hunter_squad, overload_surge, security_mech and core_meltdown each have a label, a handler and
// a banner, and _trigger() is only ever called from the loop over this array — so with nothing but
// the three hour-scale beats listed here, six authored events had been unreachable code. Verified
// both ways before touching anything: statically, `_trigger` has exactly one caller; at runtime,
// a full hour of Endless fired 3 events and never one of the six.
//
// They are scheduled as what they are: the code's own heading calls them "early-game wave events",
// and the comment above explains that `warn: true` is the 30 s heads-up and is "suppressed for
// early wave events" — which is only a sentence anyone writes if the table once held entries with
// warn:false. They go back at that cadence, one every three minutes through the first 18 minutes,
// finishing before the 20:00 blackout so the three rare hour beats keep the spacing they were
// given. Ordering follows the weight of each handler's own roster, lightest first.
//
// NOT CHANGED: every handler body, every spawn count, every enemy type, every announcement, the
// three existing windows, and the "3 banners per hour" rule those three carry.
const WINDOWS = [
  { time:  3 * 60, type: 'drone_swarm',    warn: false },   // 03:00  4 drones + 2 punks
  { time:  6 * 60, type: 'core_raiders',   warn: false },   // 06:00  4 punks + 2 infiltrators
  { time:  9 * 60, type: 'hunter_squad',   warn: false },   // 09:00  4 infiltrators + 3 punks
  { time: 12 * 60, type: 'overload_surge', warn: false },   // 12:00  3 + 2 + 2 mixed
  { time: 15 * 60, type: 'security_mech',  warn: false },   // 15:00  2 Security Defector Mechs
  { time: 18 * 60, type: 'core_meltdown',  warn: false },   // 18:00  a matrix ejects its cores
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

  /**
   * Place every enemy an event handler just pushed, through the game's own canonical spawn
   * resolver — the same one spawnEnemy() and the Endless elite wave use.
   *
   * WHY THIS WRAPPER AND NOT AN EDIT INSIDE THE HANDLERS: each handler does
   * `game.enemies.push(new Enemy(type, m))`, and the Enemy constructor picks its position from
   * Enemy._spawnEdge() — a random point on the FIXED WORLD_BOUNDS rectangle. In Endless the world
   * scrolls and rebases, and only the horizontal city band is connected to the player, so those
   * points are camera-independent and mostly not reachable at all: an event would announce itself
   * and then deliver enemies that could never arrive. Doing it here means no handler's counts,
   * types, banner or timing is touched — only where its enemies appear.
   *
   * Act 1 and the campaign have no walk model, so resolveEnemySpawn returns the point unchanged
   * and this is a no-op there.
   */
  _placeSpawned(game, fromIndex) {
    const list = game?.enemies;
    if (!Array.isArray(list) || typeof game.resolveEnemySpawn !== 'function') return;
    const vw = game._viewW || WIDTH, vh = game._viewH || HEIGHT;
    const off = Math.max(220, Math.hypot(vw, vh) * 0.5 + 40);      // wave director's own distance
    const bounds = game.getWalkableBounds?.();
    for (let i = fromIndex; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.pos) continue;
      const r = e.radius || 14;
      const ang = Math.random() * Math.PI * 2;
      let x = (game.camera?.x || 0) + vw / 2 + Math.cos(ang) * (off + 40);
      let y = (game.camera?.y || 0) + vh / 2 + Math.sin(ang) * (off + 40);
      if (bounds) {
        if (isFinite(bounds.x0)) x = Math.max(bounds.x0 + r, Math.min(bounds.x1 - r, x));
        y = Math.max(bounds.y0 + r, Math.min(bounds.y1 - r, y));
      }
      const sp = game.resolveEnemySpawn(x, y, r, off, e);
      if (sp && Number.isFinite(sp.x) && Number.isFinite(sp.y)) { e.pos.x = sp.x; e.pos.y = sp.y; }
      else { e.pos.x = x; e.pos.y = y; }
      if (bounds) {
        if (isFinite(bounds.x0)) e.pos.x = Math.max(bounds.x0 + r, Math.min(bounds.x1 - r, e.pos.x));
        e.pos.y = Math.max(bounds.y0 + r, Math.min(bounds.y1 - r, e.pos.y));
      }
    }
  }

  _trigger(type, game) {
    game.audio?.playEventWarning();
    const _n0 = Array.isArray(game?.enemies) ? game.enemies.length : 0;
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
    this._placeSpawned(game, _n0);
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
      // Same canonical placement helper every other pickup spawner uses. The raw polar
      // offset (60-140px around the matrix) can land a core inside an authored pillar or
      // façade, where the player can see it and never reach it.
      game.groundCores.push(new DataCore(game._clampPickupPos(pos), rollCoreType()));
    }
    target.stored = 0;

    game.floatingTexts.push(
      new FloatingText('MATRIX MELTDOWN — CORES EJECTED!', game.player.pos.add(new Vec2(-220, -40)), RED, 3)
    );
    game.screenShake.trigger(8, 1.5);
  }
}
