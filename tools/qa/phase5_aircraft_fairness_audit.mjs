// Phase 5 aircraft fairness audit. Drives the real Game methods frame by frame.
// Run: node tools/qa/phase5_aircraft_fairness_audit.mjs

import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
register('./strip-v-loader.mjs', import.meta.url);
const { installEnv, makeCtx, muteConsole } = await import(
  pathToFileURL(path.join(HERE, 'headless-env.mjs')).href
);
installEnv();

const JS = path.resolve(HERE, '../../js');
const restoreBootConsole = muteConsole();
const { Game } = await import(pathToFileURL(path.join(JS, 'game/Game.js')).href);
const {
  Vec2, PLAYER_RADIUS, VIEW_W, VIEW_H, ENDLESS_VIEW_SCALE, WIDTH, HEIGHT,
} = await import(pathToFileURL(path.join(JS, 'constants.js')).href);
restoreBootConsole();

const gamePath = path.join(JS, 'game/Game.js');
const playerPath = path.join(JS, 'entities/Player.js');
const gameSource = fs.readFileSync(gamePath, 'utf8');
const playerSource = fs.readFileSync(playerPath, 'utf8');
const DT = 1 / 60;
const ENDLESS_VIEW_W = WIDTH / ENDLESS_VIEW_SCALE;
const ENDLESS_VIEW_H = HEIGHT / ENDLESS_VIEW_SCALE;

let pass = 0;
let fail = 0;
const failures = [];

function T(name, predicate, evidence = '') {
  let ok = false;
  let note = evidence;
  try {
    const result = typeof predicate === 'function' ? predicate() : predicate;
    ok = result === true;
    if (typeof result === 'string') note = result;
  } catch (error) {
    note = `THREW: ${error.message}`;
  }
  if (ok) pass++;
  else {
    fail++;
    failures.push({ name, evidence: note });
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` | ${note}` : ''}`);
  return ok;
}

function lineOf(source, needle, occurrence = 1) {
  let from = 0;
  let at = -1;
  for (let i = 0; i < occurrence; i++) {
    at = source.indexOf(needle, from);
    if (at < 0) return 0;
    from = at + needle.length;
  }
  return source.slice(0, at).split('\n').length;
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = typeof value === 'function' ? value : () => value;
  try { return fn(); } finally { Math.random = original; }
}

function freshGame(character = 'taekwondo_girl') {
  localStorage.clear();
  const unmute = muteConsole();
  try {
    const game = new Game();
    game.audio = null;
    game.selectedCharacter = character;
    game.gameState = 'playing';
    game.reset();
    game._enterEndless();
    isolateAircraft(game);
    return game;
  } finally {
    unmute();
  }
}

function isolateAircraft(game) {
  game.endless = true;
  game._chaosMode = false;
  game._airstrikeTimer = 1e9;
  game._gunshipTimer = 1e9;
  game._lightningTimer = 1e9;
  game._stormActive = 0;
  game._chaosEntryGraceT = 0;
  game.phoenixReviveTimer = 0;
  game.playerHitCooldown = 0;
  game.player.dashTimer = 0;
  game.player.shieldTimer = 0;
  game.player._armorT = 0;
  game.player._tankTimer = 0;
  game.player._nexusDomeT = 0;
  game.player._rushVulnMult = 0;
  game.player._vowInvulnT = 0;
  game.player._stEmergencyLvl = 0;
  game.player._stVowLvl = 0;
  game.player.pos = new Vec2(1500, 844);
  game.airstrikeShips = [];
  game.airstrikeRockets = [];
  game.gunships = [];
  game.gunshipZones = [];
  game.lightningZones = [];
  game.nullEchoes = [];
  game.nullEchoZones = [];
  game.cybermoteMines = [];
  game.enemies = [];
  game.floatingTexts = [];
}

function tickSharedIframes(game, dt = DT) {
  game.playerHitCooldown = Math.max(0, game.playerHitCooldown - dt);
}

function hpTexts(game) {
  return game.floatingTexts.filter(text => /HP$/.test(text.text)).map(text => text.text);
}

function traceRocket({ homing = 0, startDistance = 360, speed = 285, blast = 46, maxHp = 100 } = {}) {
  const game = freshGame();
  game.player.maxHp = maxHp;
  game.player.hp = maxHp;
  game.airstrikeRockets.push({
    pos: new Vec2(game.player.pos.x + startDistance, game.player.pos.y),
    dir: new Vec2(-1, 0), speed, life: 6, radius: 7, blast, h: homing,
  });
  let hit = null;
  for (let frame = 1; frame <= 600 && game.airstrikeRockets.length; frame++) {
    tickSharedIframes(game);
    const before = game.player.hp;
    game._updateRockets(DT);
    if (game.player.hp < before && !hit) {
      hit = {
        frame,
        time: frame * DT,
        hpBefore: before,
        hpAfter: game.player.hp,
        damage: before - game.player.hp,
        texts: hpTexts(game),
      };
    }
  }
  return { game, hit };
}

function recordingContext() {
  const ctx = makeCtx();
  ctx.arcs = [];
  ctx.strokes = [];
  ctx.arc = function arc(x, y, radius) {
    this.arcs.push({ x, y, radius, lineWidth: this.lineWidth, strokeStyle: this.strokeStyle });
  };
  ctx.stroke = function stroke() {
    this.strokes.push({ lineWidth: this.lineWidth, strokeStyle: this.strokeStyle });
  };
  return ctx;
}

console.log('=== PHASE 5 | AIRCRAFT / BURST DAMAGE FAIRNESS AUDIT ===');
console.log('Πραγματικές μέθοδοι Game.js, 60 FPS, deterministic inputs.\n');

console.log('A. Scope και production attack inventory');
const scopeGame = freshGame();
scopeGame.endless = false;
scopeGame._airstrikeTimer = -1;
scopeGame._gunshipTimer = -1;
scopeGame._updateEndlessHazards(DT);
T('Act 1: το Endless aircraft layer είναι ανενεργό',
  () => scopeGame.airstrikeShips.length === 0 && scopeGame.gunships.length === 0);

const airSpawnGame = freshGame();
withRandom(0.25, () => airSpawnGame._spawnAirstrike());
const spawnedAir = airSpawnGame.airstrikeShips[0];
T('Airstrike ship: πρώτο salvo μετά από 1.5s και life 45s',
  () => spawnedAir.fireCd === 1.5 && spawnedAir.life === 45,
  `fireCd=${spawnedAir.fireCd}, life=${spawnedAir.life}`);
withRandom(0.5, () => airSpawnGame._fireSalvo(spawnedAir));
T('Airstrike salvo: 3-6 rockets, blast radius 46',
  () => airSpawnGame.airstrikeRockets.length >= 3 && airSpawnGame.airstrikeRockets.length <= 6 &&
        airSpawnGame.airstrikeRockets.every(rocket => rocket.blast === 46),
  `count=${airSpawnGame.airstrikeRockets.length}`);

const gunshipSpawnGame = freshGame();
withRandom(0.5, () => gunshipSpawnGame._spawnGunship());
const spawnedGunship = gunshipSpawnGame.gunships[0];
T('Gunship: laser 2.0s, rockets 3.5s, mortar 5.0s, life 26s',
  () => spawnedGunship.laserCd === 2 && spawnedGunship.rocketCd === 3.5 &&
        spawnedGunship.mortarCd === 5 && spawnedGunship.life === 26,
  `laser=${spawnedGunship.laserCd}, rockets=${spawnedGunship.rocketCd}, mortar=${spawnedGunship.mortarCd}`);

console.log('\nB. Airstrike rocket frame trace');
const airTrace = withRandom(0.5, () => traceRocket());
const airHit = airTrace.hit;
console.log(`  Evidence: frame=${airHit?.frame}, t=${round(airHit?.time || 0)}s, ` +
  `HP ${airHit?.hpBefore}->${airHit?.hpAfter}, texts=${JSON.stringify(airHit?.texts || [])}`);
T('Rocket: impact μόνο μία φορά και αμέσως αφαιρείται',
  () => airHit && airTrace.game.airstrikeRockets.length === 0 && airHit.damage === 30);
T('Rocket: raw 45% max HP περιορίζεται από το global cap στα 30 HP',
  () => airHit && airHit.hpBefore === 100 && airHit.damage === 30);
T('Rocket: moving warning/escape window >= 0.75s',
  () => airHit && airHit.time >= 0.75,
  `μετρήθηκε ${round(airHit?.time || 0)}s από 360px`);
T('Rocket: ένα ακριβές damage text ανά πραγματικό hit',
  () => airHit && airHit.texts.length === 1 && airHit.texts[0] === '-30 HP',
  `πραγματικό=30, εμφανίζονται ${JSON.stringify(airHit?.texts || [])}`);

console.log('\nC. Gunship homing rocket frame trace');
const homingTrace = withRandom(0.5, () => traceRocket({ homing: 0.6, startDistance: 340, speed: 250, blast: 42 }));
const homingHit = homingTrace.hit;
console.log(`  Evidence: frame=${homingHit?.frame}, t=${round(homingHit?.time || 0)}s, ` +
  `HP ${homingHit?.hpBefore}->${homingHit?.hpAfter}`);
T('Homing rocket: 60% tracking, μία πρόσκρουση, όχι projectile+explosion double hit',
  () => homingHit && homingHit.damage === 30 && homingTrace.game.airstrikeRockets.length === 0);
T('Homing rocket: escape window >= 0.75s από production standoff',
  () => homingHit && homingHit.time >= 0.75,
  `μετρήθηκε ${round(homingHit?.time || 0)}s`);
T('Homing rocket: ένα ακριβές damage text ανά πραγματικό hit',
  () => homingHit && homingHit.texts.length === 1 && homingHit.texts[0] === '-30 HP',
  `πραγματικό=30, εμφανίζονται ${JSON.stringify(homingHit?.texts || [])}`);

console.log('\nD. Plasma mortar zones');
const mortarGame = freshGame();
mortarGame.player.maxHp = 100;
mortarGame.player.hp = 100;
mortarGame.gunshipZones.push({
  pos: mortarGame.player.pos.clone(), radius: 68, warn: 1.0, flash: 0.3, t: 0, struck: false,
});
const mortarCtx = recordingContext();
mortarGame._drawEndlessHazards(mortarCtx);
let mortarHit = null;
for (let frame = 1; frame <= 100; frame++) {
  tickSharedIframes(mortarGame);
  const before = mortarGame.player.hp;
  mortarGame._updateGunship(DT);
  if (!mortarHit && mortarGame.player.hp < before) {
    mortarHit = { frame, time: frame * DT, damage: before - mortarGame.player.hp, texts: hpTexts(mortarGame) };
  }
}
console.log(`  Evidence: frame=${mortarHit?.frame}, t=${round(mortarHit?.time || 0)}s, ` +
  `damage=${mortarHit?.damage}, texts=${JSON.stringify(mortarHit?.texts || [])}`);
T('Mortar: telegraph 1.0s', () => mortarHit && Math.abs(mortarHit.time - 1.0) <= DT + 1e-6);
T('Mortar: visual radius 68 = configured hit radius 68',
  () => mortarCtx.arcs.some(arc => arc.radius === 68));
T('Mortar: struck flag αποτρέπει repeated-frame damage',
  () => mortarHit && mortarHit.damage === 30 && mortarGame.player.hp === 70 && mortarGame.gunshipZones.length === 0);
T('Mortar: ένα ακριβές damage text ανά πραγματικό hit',
  () => mortarHit && mortarHit.texts.length === 1 && mortarHit.texts[0] === '-30 HP',
  `πραγματικό=30, εμφανίζονται ${JSON.stringify(mortarHit?.texts || [])}`);

const overlapGame = freshGame();
overlapGame.player.maxHp = 100;
overlapGame.player.hp = 100;
for (let i = 0; i < 2; i++) {
  overlapGame.gunshipZones.push({
    pos: overlapGame.player.pos.clone(), radius: 68, warn: 1, flash: 0.3, t: 1 - DT, struck: false,
  });
}
tickSharedIframes(overlapGame);
overlapGame._updateGunship(DT);
T('Δύο mortar circles στο ίδιο frame δίνουν μόνο ένα damage event',
  () => overlapGame.player.hp === 70,
  `HP 100->${overlapGame.player.hp}`);

console.log('\nE. Twin laser frame trace και visual/hit geometry');
const laserGame = freshGame();
laserGame.player.maxHp = 100;
laserGame.player.hp = 100;
laserGame.gunships.push({
  pos: new Vec2(laserGame.player.pos.x - 340, laserGame.player.pos.y),
  orbit: Math.PI, life: 10, phase: 'aim', phaseT: 1.1,
  laserCd: 999, rocketCd: 999, mortarCd: 999,
  aim: laserGame.player.pos.clone(), tick: 0,
});
const laserHits = [];
let fireStarted = null;
for (let frame = 1; frame <= 150; frame++) {
  tickSharedIframes(laserGame);
  const before = laserGame.player.hp;
  const beforePhase = laserGame.gunships[0]?.phase;
  laserGame._updateGunship(DT);
  const afterPhase = laserGame.gunships[0]?.phase;
  if (fireStarted === null && beforePhase === 'aim' && afterPhase === 'fire') fireStarted = frame * DT;
  if (laserGame.player.hp < before) {
    laserHits.push({ frame, time: frame * DT, damage: before - laserGame.player.hp });
  }
}
console.log(`  Evidence: aim=${round(fireStarted || 0)}s, hits=${JSON.stringify(laserHits)}, ` +
  `HP 100->${laserGame.player.hp}`);
T('Laser: tracking telegraph διαρκεί 1.1s',
  () => fireStarted !== null && Math.abs(fireStarted - 1.1) <= DT + 1e-6,
  `μετρήθηκε ${round(fireStarted || 0)}s`);
T('Laser: cadence 0.22s + global 0.5s i-frame περιορίζει το 0.7s burst σε 1-2 hits',
  () => laserHits.length >= 1 && laserHits.length <= 2 &&
        (laserHits.length < 2 || laserHits[1].time - laserHits[0].time >= 0.5 - DT),
  `hits=${laserHits.length}`);
T('Laser: και τα δύο wings δεν κάνουν double hit στο ίδιο tick',
  () => laserHits.every(hit => hit.damage === 9),
  `damages=${laserHits.map(hit => hit.damage).join(',')}`);
const laserDamageTexts = hpTexts(laserGame);
T('Laser: ένα ακριβές damage text ανά πραγματικό hit',
  () => laserDamageTexts.length === laserHits.length && laserDamageTexts.every(text => text === '-9 HP'),
  `hits=${laserHits.length}, texts=${JSON.stringify(laserDamageTexts)}`);

const laserVisualGame = freshGame();
laserVisualGame.player.maxHp = 100;
laserVisualGame.player.hp = 100;
const lockedAim = laserVisualGame.player.pos.clone();
laserVisualGame.player.pos.y += 25;
const geometryGunship = {
  pos: new Vec2(lockedAim.x - 340, lockedAim.y), orbit: Math.PI, life: 10,
  phase: 'fire', phaseT: 0.7, laserCd: 999, rocketCd: 999, mortarCd: 999,
  aim: lockedAim, tick: 0,
};
laserVisualGame.gunships.push(geometryGunship);
const wingDistances = [-1, 1].map(side =>
  laserVisualGame._segDist(laserVisualGame.player.pos, laserVisualGame._gunshipWing(geometryGunship, side), lockedAim));
const nearestBeam = Math.min(...wingDistances);
const laserCtx = recordingContext();
laserVisualGame._drawEndlessHazards(laserCtx);
const widestLaserStroke = Math.max(...laserCtx.strokes.map(stroke => stroke.lineWidth || 0));
const beforeGeometryHit = laserVisualGame.player.hp;
laserVisualGame._updateGunship(0);
const geometryDamage = beforeGeometryHit - laserVisualGame.player.hp;
const outsideDrawnBeam = nearestBeam > PLAYER_RADIUS + widestLaserStroke / 2;
const insideDamageBeam = nearestBeam < PLAYER_RADIUS + 15;
console.log(`  Geometry evidence: center distance=${round(nearestBeam)}px, player radius=${PLAYER_RADIUS}px, ` +
  `drawn beam radius=${widestLaserStroke / 2}px, damage beam radius=15px, damage=${geometryDamage}`);
T('Laser: visual beam width καλύπτει ολόκληρο το damage hitbox',
  () => !(outsideDrawnBeam && insideDamageBeam && geometryDamage > 0),
  `${round(nearestBeam)}px center distance: ο παίκτης είναι έξω από το σχεδιασμένο beam αλλά δέχεται ${geometryDamage} HP`);

console.log('\nF. I-frames, overlap, armor και resistance');
const sameFrameGame = freshGame();
sameFrameGame.player.maxHp = 100;
sameFrameGame.player.hp = 100;
for (let i = 0; i < 4; i++) {
  sameFrameGame.airstrikeRockets.push({
    pos: sameFrameGame.player.pos.clone(), dir: new Vec2(1, 0), speed: 0,
    life: 1, radius: 7, blast: 46,
  });
}
withRandom(0.5, () => sameFrameGame._updateRockets(0));
T('Τέσσερα overlapping rockets στο ίδιο frame αφαιρούν συνολικά μόνο 30 HP',
  () => sameFrameGame.player.hp === 70 && sameFrameGame.airstrikeRockets.length === 0,
  `HP 100->${sameFrameGame.player.hp}`);

function directDamage({ contactReduction = 0, shield = 0, armor = 0, tank = 0, dome = 0 } = {}) {
  const game = freshGame();
  game.player.maxHp = 100;
  game.player.hp = 100;
  game.player.contactDamageReduction = contactReduction;
  game.player.shieldTimer = shield;
  game.player._armorT = armor;
  game.player._tankTimer = tank;
  game.player._nexusDomeT = dome;
  game.floatingTexts = [];
  game._damagePlayer(50, { color: '#ff9100', shake: 0 });
  return { damage: 100 - game.player.hp, texts: hpTexts(game) };
}

const noDefense = directDamage();
const contactArmor = directDamage({ contactReduction: 0.6 });
const pickupArmor = directDamage({ armor: 1 });
const shielded = directDamage({ shield: 1 });
const stackedDefense = directDamage({ shield: 1, armor: 1, dome: 1 });
console.log('  Defense evidence:', JSON.stringify({ noDefense, contactArmor, pickupArmor, shielded, stackedDefense }));
T('Global per-hit cap: 50 raw -> 30 HP', () => noDefense.damage === 30);
T('contactDamageReduction δεν εφαρμόζεται σε aircraft (είναι contact-only)',
  () => contactArmor.damage === 30,
  `60% contact armor -> aircraft damage ${contactArmor.damage}`);
T('Armor pickup εφαρμόζεται: 30 -> 25.5 HP', () => pickupArmor.damage === 25.5);
T('Pulse Shield εφαρμόζεται: 30 -> 12 HP', () => shielded.damage === 12);
T('Shield + armor + dome εφαρμόζονται πολλαπλασιαστικά',
  () => Math.abs(stackedDefense.damage - 8.67) < 1e-6,
  `damage=${stackedDefense.damage}`);
T('Damage text αναφέρει την τελική ζημιά μετά τα defenses',
  () => shielded.texts.length === 1 && shielded.texts[0] === '-12 HP',
  `πραγματικό=12, text=${JSON.stringify(shielded.texts)}`);

console.log('\nG. Full-HP one-shot και exact death trace');
const deathGame = freshGame();
deathGame.player.maxHp = 90;
deathGame.player.hp = 90;
const deathTrace = [];
withRandom(0.5, () => {
  for (let hit = 1; hit <= 3; hit++) {
    deathGame.airstrikeRockets.push({
      pos: deathGame.player.pos.clone(), dir: new Vec2(1, 0), speed: 0,
      life: 1, radius: 7, blast: 46,
    });
    const before = deathGame.player.hp;
    deathGame._updateRockets(0);
    deathTrace.push({ source: 'airstrikeRockets', t: (hit - 1) * 0.5, before, after: deathGame.player.hp });
    deathGame.playerHitCooldown = 0;
  }
});
console.log(`  Exact death evidence: ${JSON.stringify(deathTrace)}`);
T('Full HP 90: ένα aircraft hit δεν είναι one-shot',
  () => deathTrace[0].before === 90 && deathTrace[0].after === 60);
T('Θάνατος μόνο μετά από 3 ξεχωριστά accepted hits με >=0.5s παράθυρα',
  () => deathTrace.length === 3 && deathTrace[2].after === 0 &&
        deathTrace.every((hit, index) => hit.before - hit.after === 30 && hit.t === index * 0.5));

console.log('\nH. Off-screen / unavoidable launch risk');
function traceAircraftStandoff(kind) {
  const game = freshGame();
  withRandom(0.25, () => kind === 'airstrike' ? game._spawnAirstrike() : game._spawnGunship());
  const aircraft = kind === 'airstrike' ? game.airstrikeShips[0] : game.gunships[0];
  aircraft.fireCd = 1e9;
  aircraft.laserCd = 1e9;
  aircraft.rocketCd = 1e9;
  aircraft.mortarCd = 1e9;
  let minDistance = Infinity;
  let minDx = Infinity;
  let minDy = Infinity;
  const seconds = kind === 'airstrike' ? 45 : 26;
  for (let frame = 0; frame < seconds / DT; frame++) {
    if (kind === 'airstrike') game._updateAirstrike(DT);
    else game._updateGunship(DT);
    const live = kind === 'airstrike' ? game.airstrikeShips[0] : game.gunships[0];
    if (!live) break;
    const dx = Math.abs(live.pos.x - game.player.pos.x);
    const dy = Math.abs(live.pos.y - game.player.pos.y);
    const distance = Math.hypot(dx, dy);
    if (distance < minDistance) {
      minDistance = distance;
      minDx = dx;
      minDy = dy;
    }
  }
  return { minDistance, minDx, minDy };
}

const airStandoff = traceAircraftStandoff('airstrike');
const gunshipStandoff = traceAircraftStandoff('gunship');
const minAirLaunchDistance = airStandoff.minDistance;
const minGunshipLaunchDistance = gunshipStandoff.minDistance;
const airEscapeWindow = (minAirLaunchDistance - (46 + PLAYER_RADIUS)) / 285;
const gunshipEscapeWindow = (minGunshipLaunchDistance - (42 + PLAYER_RADIUS)) / 250;
const dimiEscapeNeed = (46 + PLAYER_RADIUS) / 189;
console.log(`  Runtime standoff: airstrike=${round(minAirLaunchDistance)}px, gunship=${round(minGunshipLaunchDistance)}px`);
console.log(`  Minimum window: airstrike=${round(airEscapeWindow)}s, gunship=${round(gunshipEscapeWindow)}s, ` +
  `slowest-player lateral escape need<=${round(dimiEscapeNeed)}s`);
T('Loitering launch offsets βρίσκονται μέσα στο Endless viewport',
  () => airStandoff.minDx < ENDLESS_VIEW_W / 2 && airStandoff.minDy < ENDLESS_VIEW_H / 2 &&
        gunshipStandoff.minDx < ENDLESS_VIEW_W / 2 && gunshipStandoff.minDy < ENDLESS_VIEW_H / 2,
  `viewport=${round(ENDLESS_VIEW_W)}x${round(ENDLESS_VIEW_H)}`);
T('Ακόμη και ο αργότερος χαρακτήρας έχει >2x χρόνο διαφυγής',
  () => Math.min(airEscapeWindow, gunshipEscapeWindow) > dimiEscapeNeed * 2,
  `ratio=${round(Math.min(airEscapeWindow, gunshipEscapeWindow) / dimiEscapeNeed)}`);
T('Οι σταθερές βασικού viewport παραμένουν έγκυρες', () => VIEW_W > 0 && VIEW_H > 0);

console.log('\nI. Root-cause locations και targeted fixes');
const rootCauses = [
  {
    id: 'AIR-01',
    file: 'js/game/Game.js',
    line: `${lineOf(gameSource, 'this._segDist(this.player.pos, wing, g.aim) < PLAYER_RADIUS + 15')}, ` +
          `${lineOf(gameSource, "ctx.strokeStyle = '#ff2233'; ctx.lineWidth = 14;")}`,
    cause: 'Laser collision radius 15px, ενώ το φαρδύτερο ορατό stroke είναι 14px συνολικά (7px radius).',
    fix: 'Κάνε το outer fire beam lineWidth 30 και το telegraph lane ισοδύναμο, ή μείωσε το collision beam radius από 15 σε 7.',
  },
  {
    id: 'AIR-02',
    file: 'js/game/Game.js',
    line: [1, 2, 3].map(occurrence =>
      lineOf(gameSource, "this.floatingTexts.push(new FloatingText('-' + dmg + ' HP'", occurrence)).join(', '),
    cause: 'Aircraft callers προσθέτουν δεύτερο raw damage text μετά το κεντρικό _damagePlayer, ακόμη και σε cap/i-frame rejection.',
    fix: 'Αφαίρεσε τα aircraft-local HP texts και άφησε ένα κεντρικό text από το πραγματικό HP delta.',
  },
  {
    id: 'AIR-03',
    file: 'js/game/Game.js',
    line: lineOf(gameSource, 'new FloatingText(`-${Math.ceil(applied)} HP`'),
    cause: '_damagePlayer εμφανίζει το pre-defense applied amount, όχι το τελικό HP delta μετά shield/armor/dome.',
    fix: 'Μέτρησε beforeHp-afterHp, εμφάνισε μόνο αυτό και επέστρεψε το πραγματικό damage amount/accepted flag στους callers.',
  },
  {
    id: 'AIR-04',
    file: 'js/entities/Player.js',
    line: lineOf(playerSource, 'let mult = this.shieldTimer > 0 ? 0.4 : 1;'),
    cause: 'Τα global defenses εφαρμόζονται, αλλά το contactDamageReduction είναι σκόπιμα εκτός aircraft path.',
    fix: 'Καμία αλλαγή αν το stat παραμένει contact-only. Αν το UI το ονομάσει γενικό Armor, πρόσθεσε ρητό damage kind/resistance αντί για σιωπηλή global εφαρμογή.',
  },
];
for (const root of rootCauses) {
  console.log(`  ${root.id} ${root.file}:${root.line}`);
  console.log(`    Αίτιο: ${root.cause}`);
  console.log(`    Fix:   ${root.fix}`);
}

console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
if (failures.length) {
  console.log('Release blockers:');
  for (const item of failures) console.log(`  - ${item.name}: ${item.evidence}`);
}
console.log('Δεν τροποποιήθηκε production αρχείο. Δεν έγινε commit.');
process.exitCode = fail ? 1 : 0;
