// ACT 1 FULL CAMPAIGN FLOW REGRESSION - seven sequential production stages.
// Uses one Game and one MetaProgress instance from Stage 1 through Final. The driver supplies
// only movement input and visible card selections; it never mutates HP, XP, levels, weapons,
// passives, recipes, boss flags, clear flags, or meta progression.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const SOURCE = readFileSync(SELF, 'utf8');
const NATURAL_FLOW_SOURCE = SOURCE.split('// SYNTHETIC MULTI-' + 'READY FIXTURE')[0];
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

const seed = 12345;
const character = process.argv[2] || 'eddie';
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(seed);
let vclock = 0;
globalThis.performance = { now: () => vclock };
const RealDate = globalThis.Date;
globalThis.Date = class extends RealDate {
  static now() { return vclock; }
  constructor(...args) { if (args.length) super(...args); else super(vclock); }
};
try { globalThis.localStorage.clear(); } catch (_) {}
try { globalThis.sessionStorage.clear?.(); } catch (_) {}

const unmuteImports = muteConsole();
const gameUrl = pathToFileURL(path.resolve(HERE, '../../js/game/Game.js')).href;
const buildEngineUrl = pathToFileURL(path.resolve(HERE, '../../js/game/BuildEngine.js')).href;
const { Game } = await import(gameUrl);
const beMod = await import(buildEngineUrl + '?v=20260810100000');
unmuteImports();

const input = (keys) => ({ keys: keys || new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });
const weaponToPassive = {};
for (const recipe of Object.values(beMod.EVOLUTION_RECIPES)) {
  if (recipe.weapon && recipe.passive) weaponToPassive[recipe.weapon] = recipe.passive;
}
const nativeWeapons = new Set(Object.entries(beMod.WEAPON_DEFS)
  .filter(([, def]) => def.owner === character).map(([wid]) => wid));
const errorText = (error) => String(error?.stack || error?.message || error).slice(0, 600);
const increment = (counts, key) => {
  const id = String(key || 'missing-eid');
  counts[id] = (counts[id] || 0) + 1;
};

const unmuteRun = muteConsole();
const game = new Game();
game.audio = null;
game.selectedCharacter = character;
game.gameState = 'playing';

let activeStageRecord = null;
const openStageChoice = game._openCampaignEvolutionChoice.bind(game);
game._openCampaignEvolutionChoice = (ready) => {
  const wasOpen = !!game._stageClearEvolutionChoice;
  const result = openStageChoice(ready);
  const opened = game._stageClearEvolutionChoice;
  if (activeStageRecord && !wasOpen && opened) {
    activeStageRecord.stageChoiceOffers++;
    increment(activeStageRecord.stageChoiceOfferCountsByEid, opened.eid || ready?.eid);
    activeStageRecord.stageChoiceOfferSequence.push(String(opened.eid || ready?.eid || 'missing-eid'));
  }
  return result;
};

function startStage(stage) {
  const unlockedBeforeStart = !!game.meta?.isStageUnlocked(stage);
  game.selectedCharacter = character;
  game.gameState = 'playing';
  game._pendingCampaignStage = stage;
  game.paused = false;
  // These are the production selectCharacter cleanup fields. They prevent the previous clear
  // banner/watchdog from redirecting the new run; no gameplay or progression state is injected.
  game._stageCompleteBanner = null;
  game._stageCompletePausedAt = 0;
  game.reset();
  game._applyCampaignStage();

  const cleanStart = game._stageClearEvolutionChoice === null && game.upgradeUI === null &&
    game._stageClearEvolutionQueue.length === 0 && game._stageClearEvolutionEvents.length === 0 &&
    game._campaignStage === stage && game._campaignCleared === false && game.timeAlive === 0 &&
    game.paused === false && game._stageCompleteBanner === null && game._stageCompletePausedAt === 0 &&
    [...game.buildEngine.weapons.values()].every(weapon => !weapon.evolved && weapon.level === 1) &&
    game.buildEngine.passives.size === 0 && game.buildEngine._readyEvolutions().length === 0 &&
    game.player.level === 1 && game.player.xp === 0 && game.player.pendingLevelupCount === 0;
  return {
    unlockedBeforeStart,
    cleanStart,
    startLevel: game.player.level,
    startXp: game.player.xp,
    startWeaponLevels: [...game.buildEngine.weapons.values()].map(weapon => weapon.level),
    startPassiveCount: game.buildEngine.passives.size,
    startReadyCount: game.buildEngine._readyEvolutions().length,
  };
}

function selectVisibleUpgrade(record) {
  const choices = game.upgradeUI?.choices || [];
  if (!choices.length) {
    record.runtimeErrors.push('upgrade UI opened without choices');
    return false;
  }
  let selected = -1;
  const stageChoice = game._stageClearEvolutionChoice;
  if (stageChoice) {
    selected = choices.findIndex(card => String(card?.key || '').startsWith('campaign_evo_'));
    if (selected < 0) selected = choices.findIndex(card => String(card?.key || '') === 'campaign_keep_build');
  } else {
    let lead = null;
    let leadLevel = -1;
    for (const [wid, weapon] of game.buildEngine.weapons) {
      if (weapon.evolved || !weaponToPassive[wid]) continue;
      if (weapon.level > leadLevel ||
          (weapon.level === leadLevel && nativeWeapons.has(wid) && !(lead && nativeWeapons.has(lead)))) {
        lead = wid;
        leadLevel = weapon.level;
      }
    }
    const leadPassive = lead ? weaponToPassive[lead] : null;
    const weaponLevel = lead ? (game.buildEngine.weapons.get(lead)?.level || 0) : 0;
    const passiveLevel = leadPassive ? (game.buildEngine.passives.get(leadPassive) || 0) : 0;
    selected = choices.findIndex(card => String(card?.key || '').startsWith('be_evo_'));
    if (selected < 0 && lead && weaponLevel < 5) {
      selected = choices.findIndex(card => String(card?.key || '') === 'be_w_' + lead);
    }
    if (selected < 0 && leadPassive && passiveLevel < 3) {
      selected = choices.findIndex(card => String(card?.key || '') === 'be_p_' + leadPassive);
    }
    if (selected < 0 && !lead) {
      selected = choices.findIndex(card => {
        const key = String(card?.key || '');
        return key.startsWith('be_w_') && nativeWeapons.has(key.slice(5));
      });
    }
    if (selected < 0) selected = choices.findIndex(card => !String(card?.key || '').startsWith('be_'));
  }
  if (selected < 0) selected = 0;
  record.selectedCards++;
  const stageEventsBefore = game._stageClearEvolutionEvents?.length || 0;
  try {
    game.selectUpgrade(selected);
    if (stageChoice && (game._stageClearEvolutionEvents?.length || 0) === stageEventsBefore + 1) {
      record.stageChoiceSelections++;
      increment(record.stageChoiceSelectionCountsByEid, stageChoice.eid);
      record.stageChoiceSelectionSequence.push(String(stageChoice.eid || 'missing-eid'));
    }
  }
  catch (error) { record.runtimeErrors.push('selectUpgrade: ' + errorText(error)); return false; }
  return true;
}

function naturalMovementKeys() {
  const keys = new Set();
  const player = game.player;
  if (!player?.pos) return keys;
  const px = player.pos.x;
  const py = player.pos.y;
  let nearestEnemySq = Infinity;
  let repelX = 0;
  let repelY = 0;
  let nearbyThreats = 0;
  for (const enemy of (game.enemies || [])) {
    if (!enemy?.pos || enemy.hp <= 0) continue;
    const dx = px - enemy.pos.x;
    const dy = py - enemy.pos.y;
    const d2 = Math.max(64, dx * dx + dy * dy);
    nearestEnemySq = Math.min(nearestEnemySq, d2);
    if (d2 < 320 * 320) {
      nearbyThreats++;
      const d = Math.sqrt(d2);
      const weight = (320 - Math.min(320, d)) / 320;
      repelX += (dx / d) * weight;
      repelY += (dy / d) * weight;
    }
  }

  let nearestShard = null;
  let nearestShardSq = Infinity;
  for (const shard of game.xpShards.active) {
    const dx = shard.x - px;
    const dy = shard.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < nearestShardSq) { nearestShardSq = d2; nearestShard = shard; }
  }

  let moveX = 0;
  let moveY = 0;
  if ((nearestEnemySq < 175 * 175 || nearbyThreats >= 4) && (repelX || repelY)) {
    moveX = repelX;
    moveY = repelY;
  } else if (nearestShard) {
    moveX = nearestShard.x - px + repelX * 70;
    moveY = nearestShard.y - py + repelY * 70;
  } else if (repelX || repelY) {
    moveX = repelX;
    moveY = repelY;
  } else {
    const angle = (vclock / 1000) * 0.32 + (seed % 360) * Math.PI / 180;
    moveX = Math.cos(angle);
    moveY = Math.sin(angle);
  }
  if (moveX > 0.12) keys.add('d'); else if (moveX < -0.12) keys.add('a');
  if (moveY > 0.12) keys.add('s'); else if (moveY < -0.12) keys.add('w');
  if (nearestEnemySq < 230 * 230 && (repelX || repelY)) keys.add('shift');
  return keys;
}

function driveStage(stage, startState) {
  const record = {
    stage,
    ...startState,
    stageChoiceOffers: 0,
    stageChoiceSelections: 0,
    stageChoiceOfferCountsByEid: {},
    stageChoiceSelectionCountsByEid: {},
    stageChoiceOfferSequence: [],
    stageChoiceSelectionSequence: [],
    selectedCards: 0,
    runtimeErrors: [],
    cleared: false,
    clearedAt: null,
    gameOverAt: null,
    bosses: null,
    overlordSpawned: false,
    metaStagesAfter: null,
    nextStageUnlocked: null,
    endHp: null,
  };
  activeStageRecord = record;
  const startedAt = vclock;
  for (let frame = 0; frame < 6 * 60 * 60; frame++) {
    vclock += 1000 / 60;
    if (game.upgradeUI && !selectVisibleUpgrade(record)) break;
    if (game.mutationUI) {
      try { game.selectMutation(0); }
      catch (error) { record.runtimeErrors.push('selectMutation: ' + errorText(error)); break; }
    }
    try { game.update(1 / 60, input(naturalMovementKeys())); }
    catch (error) { record.runtimeErrors.push('update: ' + errorText(error)); break; }

    if (game._campaignCleared) {
      record.cleared = true;
      record.clearedAt = +((vclock - startedAt) / 1000).toFixed(1);
      break;
    }
    if (game.gameOver) {
      record.gameOverAt = +((vclock - startedAt) / 1000).toFixed(1);
      break;
    }
    if (game.paused && !game.upgradeUI) {
      record.runtimeErrors.push('unexpected pause before campaign clear');
      break;
    }
  }
  record.bosses = {
    serpent: !!game.cyberSerpentSpawned,
    annihilator: !!game.annihilatorSpawned,
    titan: !!game.titanSpawned,
  };
  record.overlordSpawned = !!game._campaignOverlordSpawned;
  record.metaStagesAfter = game.meta?.stagesCleared || 0;
  record.nextStageUnlocked = stage < 7 ? !!game.meta?.isStageUnlocked(stage + 1) : null;
  record.endHp = game.player?.hp ?? null;
  record.choiceStateCleared = game._stageClearEvolutionChoice === null && game.upgradeUI === null &&
    game._stageClearEvolutionQueue.length === 0;
  const stageChoiceEids = [...new Set([
    ...Object.keys(record.stageChoiceOfferCountsByEid),
    ...Object.keys(record.stageChoiceSelectionCountsByEid),
  ])];
  record.missingStageChoiceOfferEids = stageChoiceEids.filter(eid => record.stageChoiceOfferCountsByEid[eid] !== 1);
  record.duplicateStageChoiceEids = stageChoiceEids.filter(eid => record.stageChoiceOfferCountsByEid[eid] > 1);
  record.unresolvedStageChoiceEids = stageChoiceEids.filter(eid => record.stageChoiceSelectionCountsByEid[eid] !== 1);
  record.stageChoicePerEidIntegrity = record.missingStageChoiceOfferEids.length === 0 &&
    record.duplicateStageChoiceEids.length === 0 &&
    record.unresolvedStageChoiceEids.length === 0 &&
    record.stageChoiceOffers === record.stageChoiceOfferSequence.length &&
    record.stageChoiceSelectionSequence.length === stageChoiceEids.length;
  activeStageRecord = null;
  return record;
}

const stages = [];
for (let stage = 1; stage <= 7; stage++) {
  const startState = startStage(stage);
  const record = driveStage(stage, startState);
  stages.push(record);
  if (!record.cleared || record.runtimeErrors.length) break;
}

// SYNTHETIC MULTI-READY FIXTURE
// Acquisition uses the same BuildEngine APIs as cards, then the real campaign boundary,
// UpgradeUI selection, queue, guarded _evolve, and campaign completion paths run unchanged.
function runMultiReadyFixture() {
  const fixtureGame = new Game();
  fixtureGame.audio = null;
  fixtureGame.selectedCharacter = 'skeleton_warrior';
  fixtureGame.gameState = 'playing';
  fixtureGame._pendingCampaignStage = 1;
  fixtureGame.paused = false;
  fixtureGame.reset();
  fixtureGame._applyCampaignStage();

  const recipes = Object.entries(beMod.EVOLUTION_RECIPES)
    .filter(([, recipe]) => beMod.WEAPON_DEFS[recipe.weapon]?.owner === 'skeleton_warrior')
    .slice(0, 2);
  for (const [, recipe] of recipes) {
    for (let level = 0; level < recipe.weaponLevel; level++) fixtureGame.buildEngine.addWeapon(recipe.weapon);
    for (let level = 0; level < recipe.passiveLevel; level++) fixtureGame.buildEngine.addPassive(recipe.passive);
  }

  const readyBefore = fixtureGame.buildEngine._readyEvolutions().map(entry => entry.eid);
  const offerCountsByEid = {};
  const selectionCountsByEid = {};
  const errors = [];
  fixtureGame.timeAlive = 300;
  try { fixtureGame._updateCampaignProgress(); }
  catch (error) { errors.push('boundary: ' + errorText(error)); }

  for (let guard = 0; fixtureGame.upgradeUI && guard < 10; guard++) {
    const choice = fixtureGame._stageClearEvolutionChoice;
    const eid = String(choice?.eid || 'missing-eid');
    increment(offerCountsByEid, eid);
    const index = fixtureGame.upgradeUI.choices.findIndex(card =>
      String(card?.key || '') === 'campaign_evo_' + eid);
    if (!choice || index < 0) {
      errors.push(`missing evolve card for ${eid}`);
      break;
    }
    const before = fixtureGame._stageClearEvolutionEvents.length;
    try { fixtureGame.selectUpgrade(index); }
    catch (error) { errors.push('select: ' + errorText(error)); break; }
    if (fixtureGame._stageClearEvolutionEvents.length === before + 1) increment(selectionCountsByEid, eid);
    else errors.push(`selection did not resolve ${eid}`);
  }

  return {
    recipeCount: recipes.length,
    readyBefore,
    offerCountsByEid,
    selectionCountsByEid,
    stageEvents: fixtureGame._stageClearEvolutionEvents.map(event => ({ ...event })),
    evolutionEvents: fixtureGame.buildEngine.evolutionEvents.map(event => ({ ...event })),
    errors,
    queueEmpty: fixtureGame._stageClearEvolutionQueue.length === 0,
    choiceStateCleared: fixtureGame._stageClearEvolutionChoice === null && fixtureGame.upgradeUI === null,
    campaignCleared: fixtureGame._campaignCleared === true && fixtureGame._campaignStage === 0,
  };
}

const multiReady = runMultiReadyFixture();
unmuteRun();

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

console.log('=== ACT 1 FULL SEVEN-STAGE CAMPAIGN FLOW ===');
for (const stage of stages) {
  console.log(`  Stage ${stage.stage}: clear=${stage.cleared}@${stage.clearedAt}, hp=${Math.round(stage.endHp || 0)}, bosses=S${+stage.bosses.serpent}/A${+stage.bosses.annihilator}/T${+stage.bosses.titan}, overlord=${+stage.overlordSpawned}, meta=${stage.metaStagesAfter}, clean=${+stage.cleanStart}`);
}
const totalCampaignDuration = stages.reduce((sum, stage) => sum + (stage.clearedAt || 0), 0);
console.log(`  Total production duration: ${totalCampaignDuration.toFixed(1)}s (${(totalCampaignDuration / 60).toFixed(1)} min)`);

const forbiddenMutations = [
  ['direct HP assignment', /\b(?:game\.)?player\.hp\s*(?:[+*/%-]?=(?!=)|\+\+|--)/],
  ['direct XP assignment', /\b(?:game\.)?player\.xp\s*(?:[+*/%-]?=(?!=)|\+\+|--)/],
  ['direct pending-level assignment', /pendingLevelupCount\s*(?:[+*/%-]?=(?!=)|\+\+|--)/],
  ['direct weapon-state assignment', /weapons\.get\([^\n]+\)\.(?:level|evolved)\s*(?:[+*/%-]?=(?!=)|\+\+|--)/],
  ['direct weapon-map mutation', /buildEngine\.weapons\.(?:set|delete|clear)\s*\(/],
  ['direct passive mutation', /buildEngine\.passives\.(?:set|delete|clear)\s*\(/],
  ['direct weapon acquisition', /buildEngine\.addWeapon\s*\(/],
  ['direct catalyst acquisition', /buildEngine\.addPassive\s*\(/],
  ['direct recipe-table mutation', /EVOLUTION_RECIPES(?:\[[^\]]+\]|\.[A-Za-z_$][\w$]*)\s*=(?!=)/],
  ['direct meta clear', /meta\.clearStage\s*\(/],
];

console.log('\n-- Harness purity and sequential flow --');
test('harness contains no direct HP/XP/recipe/clear mutation', () => {
  const hits = forbiddenMutations.filter(([, pattern]) => pattern.test(NATURAL_FLOW_SOURCE)).map(([name]) => name);
  return hits.length === 0 || hits.join(', ');
});
test('all seven stages started sequentially and from clean reset state', () =>
  stages.length === 7 && stages.every((record, index) => record.stage === index + 1 && record.unlockedBeforeStart && record.cleanStart) || 'stage start/unlock/reset mismatch');
test('all seven stages cleared through production update flow', () =>
  stages.length === 7 && stages.every(record => record.cleared && record.clearedAt >= 295 && record.clearedAt <= 320) || 'missing/invalid clear');
test('production Act 1 duration is seven 300s stages (about 35 minutes total)', () =>
  totalCampaignDuration >= 2065 && totalCampaignDuration <= 2240 || `duration=${totalCampaignDuration.toFixed(1)}s`);
test('level, XP, weapon levels, catalysts, and pending eligibility do not carry between stages', () =>
  stages.every(record => record.startLevel === 1 && record.startXp === 0 &&
    record.startWeaponLevels.every(level => level === 1) && record.startPassiveCount === 0 &&
    record.startReadyCount === 0) || 'run progression carried across a stage boundary');
test('all seven stages fired serpent, annihilator, and titan gates', () =>
  stages.every(record => record.bosses.serpent && record.bosses.annihilator && record.bosses.titan) || 'boss gate missing');
test('meta progression advanced exactly once per stage and unlocked the next stage', () =>
  stages.every(record => record.metaStagesAfter === record.stage && (record.stage === 7 || record.nextStageUnlocked)) || 'meta progression mismatch');
test('no stale stage-choice/UI state crossed a stage boundary', () =>
  stages.every(record => record.stageChoicePerEidIntegrity && record.choiceStateCleared) ||
  stages.filter(record => !record.stageChoicePerEidIntegrity || !record.choiceStateCleared)
    .map(record => `S${record.stage}:missing=${record.missingStageChoiceOfferEids},dup=${record.duplicateStageChoiceEids},lost=${record.unresolvedStageChoiceEids}`).join(', '));
test('campaign flow completed without runtime errors or player death', () =>
  stages.every(record => record.runtimeErrors.length === 0 && record.gameOverAt == null) || 'runtime error/death');

console.log('\n-- Final campaign state --');
test('Final Stage spawned the production AI Overlord', () =>
  stages[6]?.overlordSpawned === true || 'Final Overlord did not spawn');
test('all seven clears persisted in MetaProgress', () =>
  game.meta?.stagesCleared === 7 && game.meta?.allStagesCleared?.() === true || `stagesCleared=${game.meta?.stagesCleared}`);
test('final meta gate unlocked Endless and the shared Chaos access gate', () =>
  game.meta?.isEndlessUnlocked?.() === true || 'mode unlock gate remained closed');
test('final completion left no pending evolution choice or card UI', () =>
  game._campaignCleared === true && game._campaignStage === 0 &&
  game._stageClearEvolutionChoice === null && game._stageClearEvolutionQueue.length === 0 &&
  game.upgradeUI === null || 'stale final state');

console.log('\n-- Multi-ready evolution queue --');
test('synthetic setup produced two simultaneously ready real recipes', () =>
  multiReady.recipeCount === 2 && multiReady.readyBefore.length === 2 ||
  `recipes=${multiReady.recipeCount}, ready=${multiReady.readyBefore.join(',')}`);
test('each ready eid received exactly one visible opportunity and one resolution', () =>
  multiReady.readyBefore.every(eid => multiReady.offerCountsByEid[eid] === 1 &&
    multiReady.selectionCountsByEid[eid] === 1) &&
  Object.keys(multiReady.offerCountsByEid).length === multiReady.readyBefore.length ||
  `offers=${JSON.stringify(multiReady.offerCountsByEid)}, selections=${JSON.stringify(multiReady.selectionCountsByEid)}`);
test('both selections produced one matching successful evolution event with no loss', () =>
  multiReady.errors.length === 0 && multiReady.readyBefore.every(eid =>
    multiReady.stageEvents.filter(event => event.eid === eid && event.decision === 'evolve' && event.evolved).length === 1 &&
    multiReady.evolutionEvents.filter(event => event.eid === eid).length === 1) ||
  multiReady.errors.join(', ') || 'event/eid mismatch');
test('multi-ready queue completed the campaign with no stale choice state', () =>
  multiReady.queueEmpty && multiReady.choiceStateCleared && multiReady.campaignCleared || 'queue/choice/campaign remained open');

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
