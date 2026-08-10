// ════════════════════════════════════════════════════════════════════════════════
// SYSTEM EVENTS REACHABILITY — is every authored event actually schedulable?
//
// SystemEventManager._trigger() has exactly one caller: the loop over WINDOWS inside update().
// So an event that is not in WINDOWS is unreachable code, no matter how complete its handler,
// its label and its banner are. Six of the nine were in exactly that state.
//
// This drives the REAL SystemEventManager over a full simulated hour against a stand-in game that
// records what happened, and asserts three separate things:
//   · every one of the nine fires, exactly once, at its scheduled second
//   · the three hour-scale beats keep their original times and their 30 s heads-up, and no early
//     event ever gets a heads-up (the table's own warn:false rule)
//   · every enemy an event pushes ends up on reachable floor — the handlers push raw
//     `new Enemy(...)`, which the Enemy constructor places on the fixed WORLD_BOUNDS rectangle
//
// Run: node tools/qa/system_events_reachability_regression.mjs   (exit 1 on failure)
// ════════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
if (!globalThis.performance) globalThis.performance = { now: () => 0 };
const u0 = muteConsole();
const { SystemEventManager } = await import(pathToFileURL(path.join(ROOT, 'js/game/Events.js')).href);
const { MapManager } = await import(pathToFileURL(path.join(ROOT, 'js/game/MapManager.js')).href);
u0();

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

const ALL = ['drone_swarm', 'core_raiders', 'security_mech', 'overload_surge', 'hunter_squad',
             'core_meltdown', 'grid_blackout', 'firewall_purge', 'mega_boss'];
const DORMANT = ['drone_swarm', 'core_raiders', 'security_mech', 'overload_surge', 'hunter_squad',
                 'core_meltdown'];

// ── A stand-in game with the REAL walkability model, so the placement assertion is measured
//    against the shipped band and not against a stub that would agree with anything. ─────────
function stubGame() {
  const mm = new MapManager({});
  mm._cityImg = { complete: true, naturalWidth: 1672, naturalHeight: 519 };
  const S = mm.CITY_SCALE;
  const band = [mm.CITY_WALK_ROWS[0] * S, mm.CITY_WALK_ROWS[1] * S];
  const V = (x, y) => ({ x, y, add(o) { return V(this.x + o.x, this.y + o.y); }, clone() { return V(this.x, this.y); } });
  const g = {
    mapManager: mm, endless: true, _chaosMode: false, _deck: 'main', _campaignStage: 0,
    camera: { x: 12000, y: band[0] - 120 },
    _viewW: 1447, _viewH: 904,
    player: { pos: V(12723, (band[0] + band[1]) / 2), level: 5 },
    enemies: [], floatingTexts: [], groundCores: [], matrices: [], particles: null,
    screenShake: { trigger() {} }, audio: null,
    banners: [], announcements: [],
    currentMinute: () => 5,
    triggerAnnouncement(text) { this.announcements.push(text); },
    _clampPickupPos: (p) => p,
    _walkMode: () => 'endless',
    getWalkableBounds: () => ({ x0: -Infinity, x1: Infinity, y0: band[0], y1: band[1] }),
    // The real resolver is Game's; reproducing it here would let the test agree with itself, so
    // the shipped MapManager entry point is used directly with the same arguments Game passes.
    resolveEnemySpawn(x, y, radius = 14, minPlayerDist = 260, subject = null) {
      const avoid = [{ pos: this.player.pos, minDist: minPlayerDist }];
      for (const e of this.enemies.slice(-64)) {
        if (e !== subject && e?.pos) avoid.push({ pos: e.pos, minDist: radius + (e.radius || 14) + 4 });
      }
      return mm.findSafeSpawnPoint({ x, y, radius, mode: 'endless', avoid, minDist: minPlayerDist,
                                     connected: this.player.pos });
    },
  };
  g.band = band;
  return g;
}

// ── run a full simulated hour ────────────────────────────────────────────────
function sweep() {
  const g = stubGame();
  const mgr = new SystemEventManager();
  const fired = [];      // { type, at }
  const warned = [];
  const origTrigger = mgr._trigger.bind(mgr);
  mgr._trigger = (type, game) => { fired.push({ type, at: g.__t }); return origTrigger(type, game); };
  const STEP = 1;
  for (let t = 0; t <= 3700; t += STEP) {
    g.__t = t;
    const before = g.floatingTexts.length;
    const un = muteConsole();
    try { mgr.update(STEP, t, g); } finally { un(); }
    for (let i = before; i < g.floatingTexts.length; i++) {
      const ft = g.floatingTexts[i];
      const txt = ft?.text || ft?.msg || '';
      if (typeof txt === 'string' && /IN 30s/.test(txt)) warned.push({ at: t, txt });
    }
  }
  return { g, mgr, fired, warned };
}

console.log('\n═══ SYSTEM EVENTS REACHABILITY ═══\n');
const { g, fired, warned } = sweep();
console.log('  fired over one simulated hour:');
for (const f of fired) console.log(`    ${String(f.at).padStart(4)}s  ${f.type}`);
console.log('');

const types = fired.map(f => f.type);
T(`all ${ALL.length} authored events fire`, ALL.every(t => types.includes(t)),
  `missing: ${ALL.filter(t => !types.includes(t)).join(', ') || 'none'}`);
T(`the six dormant events are reachable (${DORMANT.filter(t => types.includes(t)).length}/6)`,
  DORMANT.every(t => types.includes(t)),
  `missing: ${DORMANT.filter(t => !types.includes(t)).join(', ') || 'none'}`);
T('each fires exactly once', ALL.every(t => types.filter(x => x === t).length === 1),
  types.filter((t, i) => types.indexOf(t) !== i).join(', '));

// the three original beats must not have moved
const at = t => fired.find(f => f.type === t)?.at;
T('grid_blackout still at 20:00', at('grid_blackout') === 20 * 60, `${at('grid_blackout')}s`);
T('firewall_purge still at 40:00', at('firewall_purge') === 40 * 60, `${at('firewall_purge')}s`);
T('mega_boss still at 60:00', at('mega_boss') === 60 * 60, `${at('mega_boss')}s`);
T('every early event lands BEFORE the 20:00 blackout',
  DORMANT.every(t => at(t) < 20 * 60), DORMANT.map(t => `${t}@${at(t)}`).join(' '));
T('the early events are spaced, not bunched',
  (() => { const ts = DORMANT.map(at).sort((a, b) => a - b);
           return ts.every((v, i) => i === 0 || v - ts[i - 1] >= 120); })(),
  DORMANT.map(at).sort((a, b) => a - b).join(','));

// heads-up rule: only the three hour beats warn
T('exactly 3 heads-up warnings, one per hour-scale beat', warned.length === 3,
  `${warned.length}: ${warned.map(w => w.at + 's').join(',')}`);
T('no early wave event gets a 30s heads-up',
  warned.every(w => [20 * 60 - 30, 40 * 60 - 30, 60 * 60 - 30].includes(w.at)),
  warned.map(w => w.at).join(','));

// ── placement: everything an event spawned must be on reachable floor ─────────
const [B0, B1] = g.band;
const bad = g.enemies.filter(e => {
  const r = e.radius || 14;
  return !(e.pos.y - r >= B0 && e.pos.y + r <= B1) ||
         !g.mapManager.isWalkableFootprint(e.pos.x, e.pos.y, r, 'endless');
});
console.log(`\n  ${g.enemies.length} enemies were spawned by events; walkable band is y ${Math.round(B0)}..${Math.round(B1)}`);
T('every event-spawned enemy stands on reachable floor', bad.length === 0,
  bad.slice(0, 4).map(e => `${e.enemyType}@(${Math.round(e.pos.x)},${Math.round(e.pos.y)})`).join(' '));
T('and within reach of the player, not at the world edge',
  g.enemies.every(e => Math.hypot(e.pos.x - g.player.pos.x, e.pos.y - g.player.pos.y) < 4000),
  `max=${Math.round(Math.max(...g.enemies.map(e => Math.hypot(e.pos.x - g.player.pos.x, e.pos.y - g.player.pos.y))))}`);
T('the announcements each handler owns still fire', g.announcements.length >= 5,
  `${g.announcements.length}: ${g.announcements.join(' | ')}`);

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══\n`);
process.exit(fail ? 1 : 0);
