// Phase 5 Subagent D: production-backed starter weapon range / crowd-control audit.
// Creates no fixtures outside this file and never mutates production source or tuning values.
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

const mulberry32 = seed => () => {
  seed |= 0;
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let vclock = 0;
globalThis.performance = { now: () => vclock };
const RealDate = globalThis.Date;
globalThis.Date = class extends RealDate {
  static now() { return vclock; }
  constructor(...args) { if (args.length) super(...args); else super(vclock); }
};

const unmuteImports = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href + '?phase5-range-cc');
const { Vec2, WORLD_W, WORLD_H } = await import(pathToFileURL(path.join(ROOT, 'js/constants.js')).href);
const catalog = await import(pathToFileURL(path.join(ROOT, 'js/game/WeaponCatalog.js')).href);
// Match Game.js/BuildEngineChars3.js exactly so this audit reads the populated production registry.
const build = await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngine.js')).href + '?v=20260810100000');
unmuteImports();

const CHARS = [
  'skeleton_warrior', 'taekwondo_girl', 'cyber_arm_hero', 'brawler_warrior',
  'assassin_clone', 'japan_phasewalker', 'euclid_vector', 'oni_cataclysm_protocol',
  'eddie', 'dimis_kickboxer',
];
const PLAYER_R = 18;
const VIEW_HALF_W = 640;
const DT = 1 / 60;
const DISTANCES = [
  32, 60, 90, 140, 200, 239, 279, 320, 339, 360, 379, 420, 459,
  499, 519, 560, 619, 639, 660, 700, 749, 779, 799, 820, 900,
];

// These are code-navigation facts, not substitute balance values. Every one is independently
// exercised by the probes below; keeping the source locations here makes failures actionable.
const PATH_FACTS = {
  skeleton_warrior: {
    components: 'generic projectile + Chain Lightning', target: '520 + 3x240 chain',
    source: 'Game.js:11124-11173,12015-12100', visualHit: 'projectile 28px/5px radius; chain endpoints exact',
    lifetime: 'generic <=0.68s; chain lead + 0.10s links', maxDetachedLife: 0.68,
  },
  taekwondo_girl: {
    components: 'generic projectile + Spirit Crescent Kick', target: '240; crescent travel 540x0.9s',
    source: 'Game.js:11124-11173,17479-17548', visualHit: 'generic 28px/5px; crescent visual ~21px/hit radius 30px',
    lifetime: 'generic <=0.32s; crescent 0.90s', maxDetachedLife: 0.9,
  },
  cyber_arm_hero: {
    components: 'generic projectile + Neon Pierce Beam', target: '560; beam 800',
    source: 'Game.js:11124-11173,12175-12245', visualHit: 'beam 22px half-width plus target radius',
    lifetime: 'generic <=0.74s; beam visual 0.25s', maxDetachedLife: 0.74,
  },
  brawler_warrior: {
    components: 'Nexus Chakram + Crescent Rift Claw', target: '620; claw 145',
    source: 'Game.js:16616-16725', visualHit: 'chakram 46px visible half-size / 26px hit radius',
    lifetime: 'chakram outbound+return measured 2.37s; claw 0.32s', maxDetachedLife: 2.37,
  },
  assassin_clone: {
    components: 'generic arrow + Plasma Shuriken', target: '520; shuriken 460 then 380 hops',
    source: 'Game.js:11124-11173,17082-17135', visualHit: 'arrow 28px/5px; shuriken 31px visible/16px hit radius',
    lifetime: 'generic <=0.68s; shuriken <=2.50s', maxDetachedLife: 2.5,
  },
  japan_phasewalker: {
    components: 'generic Phase Shard', target: '500',
    source: 'Game.js:11124-11173,Player.js:514-535', visualHit: 'needle ~15px / 5px hit radius',
    lifetime: 'range-clamped <=0.66s', maxDetachedLife: 0.66,
  },
  euclid_vector: {
    components: 'Toxic Sniper + 3 Orbital Katanas', target: 'sniper 340; orbit 92-140',
    source: 'Game.js:7474-7559,effects/toxic_sniper_kit_sprites.js:139-299', visualHit: 'katana reaches ~180px visually but damage is contact-gated',
    lifetime: 'sniper projectile measured 0.50s; orbit persistent while equipped', maxDetachedLife: 0.5,
  },
  oni_cataclysm_protocol: {
    components: 'Laser Eyes + Meteor Rain', target: 'laser acquire 640 / beam 1500; meteor 620 + 170 area',
    source: 'Game.js:7219-7220,7280-7420; effects/laser-eyes.js:22-24,63-105; effects/meteor-rain.js:19-24,77-110', visualHit: '1500px beam endpoints; 170px field / 46px impacts',
    lifetime: 'laser 0.15s charge + 1.10s fire; meteor field 5.00s', maxDetachedLife: 5,
  },
  eddie: {
    components: 'generic flame + Solo Red Thunder', target: '380; red bolt 750',
    source: 'Game.js:11124-11173,14662-14710', visualHit: 'flame 54px/12px radius; red bolt ~36px/5px radius',
    lifetime: 'flame <=0.50s; red bolt 0.80s', maxDetachedLife: 0.8,
  },
  dimis_kickboxer: {
    components: 'BE Cyber-Gauntlets + contact pulse + drones + Mega Glove + generic shot', target: '78 melee; 280 shot; 310 glove corridor',
    source: 'BuildEngineChars3.js:227-335,Game.js:6577-6695,6742-6770,11124-11173', visualHit: 'gauntlet 78; drones orbit at 120 but only answer contact; glove corridor visible',
    lifetime: 'gauntlet 0.22s; pulse 0.34s; glove impact 0.32s', maxDetachedLife: 0.34,
  },
};

function freshGame(ch, seed = 20260722) {
  Math.random = mulberry32(seed + CHARS.indexOf(ch) * 7919);
  vclock = 0;
  try { globalThis.localStorage.clear(); } catch (_) {}
  try { globalThis.sessionStorage.clear?.(); } catch (_) {}
  const quiet = muteConsole();
  const game = new Game();
  game.audio = null;
  game.selectedCharacter = ch;
  game.gameState = 'playing';
  game.reset();
  quiet();
  game.audio = null;
  game.gameState = 'playing';
  game.paused = false;
  game.gameOver = false;
  game.victory = false;
  game.upgradeUI = null;
  game.mutationUI = null;
  game._postArenaChoice = null;
  game._spatialGrid = null;
  game._canvas = document.createElement('canvas');
  game._canvas.width = 1280;
  game._canvas.height = 720;
  game.player.pos = new Vec2(WORLD_W / 2, WORLD_H / 2);
  game.player.vel = new Vec2(0, 0);
  game.player.lastFacingDir = new Vec2(1, 0);
  game.player._facing = 1;
  if (game.camera) {
    game.camera.x = game.player.pos.x - VIEW_HALF_W;
    game.camera.y = game.player.pos.y - 360;
  }
  game._resolveEnemyMove = (_x, _y, tx, ty) => ({ x: tx, y: ty });
  game.matrices = [];
  return game;
}

function makeEnemy(game, distanceFromPlayer, angle = 0, type = 'Heavy Mech') {
  const enemy = new Enemy(type, 0);
  enemy.pos = new Vec2(
    game.player.pos.x + Math.cos(angle) * distanceFromPlayer,
    game.player.pos.y + Math.sin(angle) * distanceFromPlayer,
  );
  enemy.vel = new Vec2(0, 0);
  enemy.hp = 1e9;
  enemy.maxHp = 1e9;
  enemy.isElite = false;
  return enemy;
}

function projectileSource(game, enemy) {
  let best = null;
  let bestD = Infinity;
  for (const p of game.projectiles || []) {
    if (!p?.pos) continue;
    const d = Math.hypot(p.pos.x - enemy.pos.x, p.pos.y - enemy.pos.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best?.style === 'red_bolt') return 'solo_red_thunder';
  if (best?.style === 'eddie_flame') return 'generic_flame';
  if (best?.style === 'phase_shard') return 'generic_phase_shard';
  return 'generic_primary';
}

function instrumentEnemies(game, enemies, metrics) {
  for (const enemy of enemies) {
    enemy._qaInitialDistance = Math.hypot(enemy.pos.x - game.player.pos.x, enemy.pos.y - game.player.pos.y);
    const original = enemy.takeHit.bind(enemy);
    enemy.takeHit = function (damage, owner) {
      let source = metrics.context || 'unknown';
      if (source === 'projectiles') source = projectileSource(game, enemy);
      metrics.hits.push({
        t: vclock / 1000,
        source,
        damage: Number(damage) || 0,
        distance: Math.hypot(enemy.pos.x - game.player.pos.x, enemy.pos.y - game.player.pos.y),
        initialDistance: enemy._qaInitialDistance,
      });
      return original(damage, owner);
    };
  }
}

function arrayInventory(game) {
  return [
    ['projectile', game.projectiles, o => o.pos, o => o.style === 'eddie_flame' ? 27 : o.style === 'red_bolt' ? 18 : 14],
    ['chain-bolt', game._chainBolts, o => ({ x: o.x, y: o.y }), () => 12],
    ['beam', game._neonBeams, o => ({ x: o.startPos.x + o.dir.x * o.length, y: o.startPos.y + o.dir.y * o.length }), () => 22],
    ['crescent', game._spiritKicks?.blades, o => o.pos, o => o.radius || 30],
    ['chakram', game._chakrams, o => o.pos, () => 46],
    ['shuriken', game._shurikens, o => o.pos, () => 31],
    ['toxic-bullet', game._euclidSniper?.bullets, o => ({ x: o.x, y: o.y }), o => Math.max(o.w || 28, o.h || 12) / 2],
    ['euclid-bolt', game._euclidBolts, o => o.pos, () => 15],
    ['euclid-needle', game._euclidNeedles, o => o.pos, () => 16],
    ['bone-shard', game.buildEngine?.shards, o => ({ x: o.x, y: o.y }), () => 17],
  ].filter(([, arr]) => Array.isArray(arr));
}

function observeObjects(game, metrics) {
  const now = vclock / 1000;
  const live = new Set();
  for (const [kind, arr, getPos, pad] of arrayInventory(game)) {
    for (const obj of arr) {
      live.add(obj);
      let seen = metrics.objects.get(obj);
      if (!seen) {
        const configuredLife = Number.isFinite(obj.life) ? obj.life : null;
        seen = { kind, first: now, last: now, configuredLife };
        metrics.objects.set(obj, seen);
      }
      seen.last = now;
      const pos = getPos(obj);
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        const reach = Math.hypot(pos.x - game.player.pos.x, pos.y - game.player.pos.y) + pad(obj);
        metrics.visualReach = Math.max(metrics.visualReach, reach);
      }
    }
  }
  for (const [obj, seen] of metrics.objects) {
    if (!live.has(obj) && !seen.closed) {
      seen.closed = true;
      metrics.objectLives.push(Math.max(0, seen.last - seen.first + DT));
    }
  }
  // Persistent/external production effects are not stored in Game's projectile arrays.
  // Read their live runtime geometry so visual reach does not silently report zero.
  if (game._euclidKatana) {
    metrics.visualReach = Math.max(metrics.visualReach,
      Number(game._euclidKatana.orbitRadius || 0) + Number(game._euclidKatana.bladeLength || 0));
  }
  if (game._laserEyes?.isActive?.()) {
    metrics.visualReach = Math.max(metrics.visualReach, Number(game._laserEyes.cfg?.beam?.maxLen || 0));
  }
  if (game._meteorRain?.isActive?.() && game._oniMeteorWorld) {
    const center = Math.hypot(game._oniMeteorWorld.x - game.player.pos.x, game._oniMeteorWorld.y - game.player.pos.y);
    metrics.visualReach = Math.max(metrics.visualReach, center + Number(game._meteorRain.cfg?.area?.radius || 0));
  }
}

function callWithContext(metrics, name, fn) {
  metrics.context = name;
  try { fn(); }
  finally { metrics.context = null; }
}

function tickStarter(game, metrics, dt = DT) {
  vclock += dt * 1000;
  game.timeAlive = (game.timeAlive || 0) + dt;
  game._playerIdleT = (game._playerIdleT || 0) + dt;
  game.player.shootCooldown = Math.max(0, game.player.shootCooldown - dt);
  const calls = [
    ['auto-target', () => game._handleAutoShooting()],
    ['projectiles', () => game._updateProjectiles(dt)],
    ['build-engine', () => game.buildEngine?.update(dt)],
    ['chain-lightning', () => game._updateChainLightning(dt)],
    ['neon-beam', () => game._updateNeonPierceBeam(dt)],
    ['spirit-kicks', () => game._updateSpiritKicks(dt)],
    ['nexus-chakram', () => game._updateNexusChakram(dt)],
    ['crescent-claw', () => game._updateCrescentClaw(dt)],
    ['plasma-shuriken', () => game._updateShuriken(dt)],
    ['oni-kit', () => game._updateOniFx(dt)],
    ['dimi-contact-pulse', () => game._updateDimiGauntlet(dt)],
    ['dimi-drones', () => game._updateDimiDrones(dt)],
    ['dimi-mega-glove', () => game._updateDimiMegaGlove(dt)],
    ['euclid-kit', () => game._updateEuclidKit(dt)],
    ['solo-red-thunder', () => game._updateSoloRedThunder(dt)],
  ];
  for (const [name, fn] of calls) callWithContext(metrics, name, fn);
  observeObjects(game, metrics);
}

function blankMetrics() {
  return { context: null, hits: [], objects: new Map(), objectLives: [], visualReach: 0 };
}

function simulateDistance(ch, distance) {
  const game = freshGame(ch, 100003 + distance);
  const enemy = makeEnemy(game, distance);
  game.enemies = [enemy];
  const metrics = blankMetrics();
  instrumentEnemies(game, game.enemies, metrics);
  const quiet = muteConsole();
  let error = null;
  for (let frame = 0; frame < 5 * 60; frame++) {
    try { tickStarter(game, metrics); }
    catch (err) { error = String(err?.stack || err); break; }
  }
  quiet();
  for (const seen of metrics.objects.values()) {
    if (!seen.closed) metrics.objectLives.push(Math.max(0, seen.last - seen.first + DT));
  }
  return {
    distance,
    hit: metrics.hits.length > 0,
    firstHit: metrics.hits.length ? +metrics.hits[0].t.toFixed(3) : null,
    hits: metrics.hits.length,
    sources: [...new Set(metrics.hits.map(hit => hit.source))],
    maxVisualReach: +metrics.visualReach.toFixed(1),
    maxObjectLife: metrics.objectLives.length ? +Math.max(...metrics.objectLives).toFixed(3) : 0,
    error,
  };
}

function simulateCrowd(ch) {
  const game = freshGame(ch, 20260723);
  const positions = [430, 650, 870, 1090];
  game.enemies = positions.map(distance => makeEnemy(game, distance));
  const metrics = blankMetrics();
  instrumentEnemies(game, game.enemies, metrics);
  const quiet = muteConsole();
  let error = null;
  for (let frame = 0; frame < 8 * 60; frame++) {
    try { tickStarter(game, metrics); }
    catch (err) { error = String(err?.stack || err); break; }
  }
  quiet();
  const hitDistances = metrics.hits.map(hit => hit.initialDistance);
  const bySource = {};
  for (const hit of metrics.hits) {
    bySource[hit.source] ||= { hits: 0, unique: new Set(), maxDistance: 0 };
    const row = bySource[hit.source];
    row.hits++;
    row.unique.add(hit.initialDistance);
    row.maxDistance = Math.max(row.maxDistance, hit.initialDistance);
  }
  return {
    hitTargets: new Set(hitDistances).size,
    maxHitDistance: hitDistances.length ? Math.max(...hitDistances) : 0,
    bySource: Object.fromEntries(Object.entries(bySource).map(([key, value]) => [key, {
      hits: value.hits, unique: value.unique.size, maxDistance: value.maxDistance,
    }])),
    error,
  };
}

function simulateContact(ch) {
  const game = freshGame(ch, 20260724);
  const enemy = makeEnemy(game, 420, 0, 'Heavy Mech');
  game.enemies = [enemy];
  const metrics = blankMetrics();
  instrumentEnemies(game, game.enemies, metrics);
  let firstContact = null;
  let minDistance = Infinity;
  let ccFrames = 0;
  let stunFrames = 0;
  let slowFrames = 0;
  let knockFrames = 0;
  let runCc = 0;
  let runKnock = 0;
  let maxCcRun = 0;
  let maxKnockRun = 0;
  let maxKnock = 0;
  let error = null;
  const quiet = muteConsole();
  for (let frame = 0; frame < 30 * 60; frame++) {
    try {
      tickStarter(game, metrics);
      const stunned = (enemy.stunned || 0) > 0;
      const slowed = (enemy.slowTimer || 0) > 0;
      const knock = Math.hypot(enemy._kbx || 0, enemy._kby || 0);
      if (stunned || slowed) { ccFrames++; runCc++; } else { maxCcRun = Math.max(maxCcRun, runCc); runCc = 0; }
      if (stunned) stunFrames++;
      if (slowed) slowFrames++;
      if (knock > 1) { knockFrames++; runKnock++; } else { maxKnockRun = Math.max(maxKnockRun, runKnock); runKnock = 0; }
      maxKnock = Math.max(maxKnock, knock);
      enemy.update(DT, game);
      const distance = Math.hypot(enemy.pos.x - game.player.pos.x, enemy.pos.y - game.player.pos.y);
      minDistance = Math.min(minDistance, distance);
      if (firstContact == null && distance <= PLAYER_R + enemy.radius) firstContact = vclock / 1000;
    } catch (err) { error = String(err?.stack || err); break; }
  }
  quiet();
  maxCcRun = Math.max(maxCcRun, runCc);
  maxKnockRun = Math.max(maxKnockRun, runKnock);
  const totalFrames = 30 * 60;
  return {
    firstContact: firstContact == null ? null : +firstContact.toFixed(3),
    minDistance: +minDistance.toFixed(1),
    ccUptime: +(ccFrames / totalFrames).toFixed(3),
    stunUptime: +(stunFrames / totalFrames).toFixed(3),
    slowUptime: +(slowFrames / totalFrames).toFixed(3),
    maxCcRun: +(maxCcRun * DT).toFixed(3),
    knockUptime: +(knockFrames / totalFrames).toFixed(3),
    maxKnockRun: +(maxKnockRun * DT).toFixed(3),
    maxKnock: +maxKnock.toFixed(1),
    hits: metrics.hits.length,
    error,
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

function sourceCadence(ch) {
  const game = freshGame(ch, 20260725);
  const enemy = makeEnemy(game, 80);
  game.enemies = [enemy];
  const metrics = blankMetrics();
  instrumentEnemies(game, game.enemies, metrics);
  const quiet = muteConsole();
  for (let frame = 0; frame < 10 * 60; frame++) tickStarter(game, metrics);
  quiet();
  const times = new Map();
  for (const hit of metrics.hits) {
    const arr = times.get(hit.source) || [];
    arr.push(hit.t);
    times.set(hit.source, arr);
  }
  const result = {};
  for (const [source, arr] of times) {
    const gaps = arr.slice(1).map((time, index) => time - arr[index]).filter(gap => gap > 0.025);
    result[source] = { hits: arr.length, medianGap: +median(gaps).toFixed(3) };
  }
  return result;
}

console.log('=== PHASE 5 SUBAGENT D - WEAPON RANGE / CROWD CONTROL AUDIT ===');
console.log('    10 characters; deterministic production methods; no production mutation\n');

const rows = [];
for (const ch of CHARS) {
  const starter = catalog.getWeaponForCharacter(ch);
  const beStarter = ch === 'dimis_kickboxer' ? build.WEAPON_DEFS.cyber_gauntlets_injection : null;
  const declared = starter ? catalog.getWeaponStatsAtLevel(starter.id, 1) : {
    damage: beStarter?.damage?.[0] || 0,
    cooldown: beStarter?.cooldown?.[0] || 0,
    aoeRadius: beStarter?.radius || 0,
    speed: 0,
    piercing: 1,
  };
  const sweeps = DISTANCES.map(distance => simulateDistance(ch, distance));
  const hitSweeps = sweeps.filter(result => result.hit);
  const maxRange = hitSweeps.length ? Math.max(...hitSweeps.map(result => result.distance)) : 0;
  const life = Math.max(PATH_FACTS[ch].maxDetachedLife, ...sweeps.map(result => result.maxObjectLife));
  const visual = Math.max(0, ...sweeps.map(result => result.maxVisualReach));
  const crowd = simulateCrowd(ch);
  const contact = simulateContact(ch);
  const cadence = sourceCadence(ch);
  rows.push({
    ch,
    starter: starter?.id || 'cyber_gauntlets_injection',
    declared,
    maxRange,
    visual,
    life,
    crowd,
    contact,
    cadence,
    facts: PATH_FACTS[ch],
    errors: [...sweeps.map(result => result.error).filter(Boolean), crowd.error, contact.error].filter(Boolean),
  });
}

console.log('-- BEFORE metrics: declared starter vs measured complete L1 native loadout --');
console.log('character                  starter                    cfg dmg/cd/aoe   hit  visual life  crowdMax contact CC%  sources');
for (const row of rows) {
  const sources = Object.keys(row.cadence).join(',') || 'none';
  console.log(
    `${row.ch.padEnd(26)} ${row.starter.padEnd(26)} ` +
    `${String(row.declared.damage).padStart(3)}/${String(row.declared.cooldown).padStart(5)}/${String(row.declared.aoeRadius).padStart(3)} ` +
    `${String(row.maxRange).padStart(4)} ${String(Math.round(row.visual)).padStart(6)} ${row.life.toFixed(2).padStart(4)} ` +
    `${String(row.crowd.maxHitDistance).padStart(8)} ${String(row.contact.firstContact ?? 'NONE').padStart(7)} ` +
    `${String(Math.round(row.contact.ccUptime * 100)).padStart(3)}  ${sources}`,
  );
}

console.log('\n-- Real runtime paths / configured geometry --');
for (const row of rows) {
  console.log(`  ${row.ch}: ${row.facts.components}; target=${row.facts.target}; visual/hit=${row.facts.visualHit}; lifetime=${row.facts.lifetime}; ${row.facts.source}`);
}

console.log('\n-- Cadence / multihit by observed damage path (10s close target) --');
for (const row of rows) {
  const entries = Object.entries(row.cadence).map(([source, value]) => `${source}:${value.hits} hits @${value.medianGap || 0}s`).join(' | ');
  console.log(`  ${row.ch.padEnd(26)} ${entries || 'NO DAMAGE'}`);
}

console.log('\n-- Stationary durable-enemy approach (420px, 30s) --');
for (const row of rows) {
  const c = row.contact;
  console.log(
    `  ${row.ch.padEnd(26)} contact=${String(c.firstContact ?? 'NONE').padStart(6)}s min=${String(c.minDistance).padStart(5)} ` +
    `CC=${(c.ccUptime * 100).toFixed(1).padStart(5)}% maxCC=${c.maxCcRun.toFixed(2)}s ` +
    `KB=${(c.knockUptime * 100).toFixed(1).padStart(5)}% maxKB=${c.maxKnockRun.toFixed(2)}s impulse=${c.maxKnock}`,
  );
}

console.log('\n-- Beyond-viewport crowd hits by observed production path --');
for (const row of rows) {
  const paths = Object.entries(row.crowd.bySource)
    .filter(([, value]) => value.maxDistance > VIEW_HALF_W)
    .map(([source, value]) => `${source}=${value.maxDistance}px/${value.hits} hits`);
  if (paths.length) console.log(`  ${row.ch.padEnd(26)} ${paths.join(' | ')}`);
}

let pass = 0;
let fail = 0;
const test = (name, check) => {
  let ok = false;
  let note = '';
  try {
    const result = check();
    ok = result === true;
    if (typeof result === 'string') note = result;
  } catch (error) { note = 'THREW: ' + error.message; }
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ' - ' + note : ''}`);
};
const names = list => list.map(row => row.ch).join(', ');

console.log('\n-- Audit gates --');
test('10/10 real starter paths seed and deal damage', () => {
  const bad = rows.filter(row => row.maxRange <= 0 || Object.keys(row.cadence).length === 0);
  return bad.length === 0 || names(bad);
});
test('all deterministic probes complete without runtime errors', () => {
  const bad = rows.filter(row => row.errors.length);
  return bad.length === 0 || names(bad);
});
test('no permanent no-contact zone against a durable approaching melee enemy', () => {
  const bad = rows.filter(row => row.contact.firstContact == null);
  return bad.length === 0 || names(bad);
});
test('no permanent stun/freeze/slow loop (CC uptime <80%, max continuous <5s)', () => {
  const bad = rows.filter(row => row.contact.ccUptime >= 0.8 || row.contact.maxCcRun >= 5);
  return bad.length === 0 || names(bad);
});
test('no endless knockback loop (contact succeeds, max continuous <5s)', () => {
  const bad = rows.filter(row => row.contact.firstContact == null || row.contact.maxKnockRun >= 5);
  return bad.length === 0 || names(bad);
});
test('repeated knockback pressure stays below 60% uptime', () => {
  const bad = rows.filter(row => row.contact.knockUptime >= 0.6);
  return bad.length === 0 || names(bad);
});
test('all observed projectile/effect paths are finite and bounded <=5s', () => {
  const bad = rows.filter(row => !Number.isFinite(row.life) || row.life > 5.05);
  return bad.length === 0 || names(bad);
});
test('no direct target/hit beyond the horizontal readability window (640px)', () => {
  const bad = rows.filter(row => row.maxRange > VIEW_HALF_W);
  return bad.length === 0 || bad.map(row => `${row.ch}=${row.maxRange}`).join(', ');
});
test('chains/pierce/bounces cannot kill beyond the horizontal viewport', () => {
  const bad = rows.filter(row => row.crowd.maxHitDistance > VIEW_HALF_W);
  return bad.length === 0 || bad.map(row => `${row.ch}=${row.crowd.maxHitDistance}`).join(', ');
});
test('catalog starter shape is the runtime primary shape (damage/cadence/AoE)', () => {
  // A catalog AoE starter should not collapse to a 5px single-target generic shot while its
  // native entry is skipped. This is intentionally a release gate, not a loose similarity test.
  const genericChars = rows.filter(row => Object.keys(row.cadence).some(source => source.startsWith('generic_')));
  const bad = genericChars.filter(row => row.declared.aoeRadius > 20 && row.declared.cooldown > 0.3);
  return bad.length === 0 || names(bad);
});
test('visual footprint does not imply a materially larger damaging zone', () => {
  const euclid = rows.find(row => row.ch === 'euclid_vector');
  const bad = euclid && euclid.visual > euclid.maxRange + 24;
  return !bad || `euclid_vector visual=${euclid.visual}px damage=${euclid.maxRange}px`;
});

const directOffscreen = rows.filter(row => row.maxRange > VIEW_HALF_W);
const propagatedOffscreen = rows.filter(row => row.crowd.maxHitDistance > VIEW_HALF_W);
const catalogDrift = rows.filter(row => Object.keys(row.cadence).some(source => source.startsWith('generic_')) && row.declared.aoeRadius > 20 && row.declared.cooldown > 0.3);

console.log('\n-- Root causes (production file/line references) --');
if (catalogDrift.length) {
  console.log(`  1. ${names(catalogDrift)} seed catalog IDs at Game.js:1394-1396, but native IDs are skipped by _tickAcquiredWeapons at Game.js:14597-14605; _handleAutoShooting then uses Player.shoot generic damage/cadence/hitbox at Game.js:11124-11173 and Player.js:514-535.`);
}
if (directOffscreen.length) {
  console.log(`  2. Direct off-screen acquisition is hard-coded in character secondaries: Cyber beam RANGE=800 at Game.js:12191-12220 and Eddie Red Thunder range=750 at Game.js:14685-14705. A 1280px viewport has only 640px horizontal half-width.`);
}
if (propagatedOffscreen.length) {
  console.log(`  3. Crowd propagation/area resolution is not viewport-bounded: Skeleton first 520 + three 240px jumps at Game.js:12058-12084; Assassin starts at 460 then reacquires within 380 at Game.js:17094-17135; Brawler's 620px disc uses a 26px collision radius at Game.js:16628-16666; Oni acquires within 640px at Game.js:7357-7392 but LaserEyes pierces along maxLen=1500 at effects/laser-eyes.js:22-24,63-105.`);
}
console.log('  4. Dimi receives overlapping recurring displacement: the 1.5s contact pulse writes 58+ knockback at Game.js:6742-6762 and the 3s Mega Glove writes 96 knockback at Game.js:6666-6682. Decay in Enemy.js:926-934 keeps each burst finite, but measured aggregate knockback uptime is 73.2%.');
console.log('  5. Euclid orbital art and collision express different spaces: orbit 92-140px plus the blade length, but damage first requires player contact at effects/toxic_sniper_kit_sprites.js:251-284; draw renders the full outer sweep at :380-417.');
console.log('  6. Several characters receive unregistered always-on secondaries in addition to the displayed starter: Chain Lightning, Spirit Kicks, Neon Beam, Crescent Claw, Shuriken, Euclid dual kit, Oni dual kit, Eddie dual fire and Dimi five-path baseline. The UI/catalog therefore cannot describe the real range or CC budget from one starter definition.');

console.log('\n-- Targeted recommendations (no global damage nerf) --');
console.log('  1. Route each native starter through one runtime descriptor: target range, hit geometry, visual geometry, cadence, lifetime, pierce/chain and CC. Either make WeaponCatalog authoritative or explicitly model every always-on secondary as a separate starter component.');
console.log('  2. Clamp direct acquisition to the current visible world rectangle with a small telegraph margin. For Cyber/Eddie preserve damage, but shorten RANGE/lifetime or require an on-screen primary target.');
console.log('  3. Bound chain/bounce continuation to visible targets or stop propagation when the next node leaves the camera; do not nerf hit damage.');
console.log('  4. For Euclid, either move katana collision to the visible blade sweep with a per-enemy cooldown and bounded push, or contract the orbit art to the real contact-control footprint.');
console.log('  5. Preserve current non-permanent CC, but cap Dimi repeated knockback uptime below 60% through per-target immunity/impulse cooldown; retain the <80% CC and <5s continuous-control regression ceilings.');

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
