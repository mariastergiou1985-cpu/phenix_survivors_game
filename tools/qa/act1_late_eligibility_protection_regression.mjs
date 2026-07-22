// ACT 1 LATE-ELIGIBILITY CHOICE REGRESSION - Phase 4C guard.
// Runs production campaign combat without direct HP, XP, level, weapon, passive, or recipe
// mutation. Successful evolutions are counted only when _evolve changes a real weapon from
// non-evolved to evolved, and every such transition must map to exactly one selected evolution
// card. Each worker also completes a second campaign run on the same Game instance.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

function worker(seed, ch, decision) {
  const result = spawnSync(process.execPath, [SELF, '--worker', String(seed), ch, decision], {
    encoding: 'utf8', maxBuffer: 1 << 24,
  });
  if (result.status !== 0 || !result.stdout) {
    throw new Error(`worker failed seed=${seed} ch=${ch} decision=${decision}: ${(result.stderr || '').slice(-600)}`);
  }
  return JSON.parse(result.stdout.trim().split('\n').pop());
}

if (process.argv[2] === '--worker') {
  const seed = +process.argv[3];
  const ch = process.argv[4];
  const decision = process.argv[5] || 'evolve';
  const keepAtStageClear = decision.endsWith('keep');
  const deferFinalCatalyst = decision.startsWith('late-');
  const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
  installEnv();

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
    .filter(([, def]) => def.owner === ch).map(([wid]) => wid));
  const isEvolutionKey = (key) => String(key || '').startsWith('be_evo_') || String(key || '').startsWith('campaign_evo_');
  const atSeconds = () => +(vclock / 1000).toFixed(1);
  const errorText = (error) => String(error?.stack || error?.message || error).slice(0, 600);
  const increment = (counts, key) => {
    const id = String(key || 'missing-eid');
    counts[id] = (counts[id] || 0) + 1;
  };

  const unmuteRun = muteConsole();
  const game = new Game();
  game.audio = null;
  game.selectedCharacter = ch;
  game.gameState = 'playing';

  let activeMetrics = null;
  const openStageChoice = game._openCampaignEvolutionChoice.bind(game);
  game._openCampaignEvolutionChoice = (ready) => {
    const metrics = activeMetrics;
    const wasOpen = !!game._stageClearEvolutionChoice;
    const result = openStageChoice(ready);
    const opened = game._stageClearEvolutionChoice;
    if (metrics && !wasOpen && opened) {
      const eid = String(opened.eid || ready?.eid || 'missing-eid');
      metrics.stageChoiceOffers++;
      increment(metrics.stageChoiceOfferCountsByEid, eid);
      metrics.stageChoiceOfferSequence.push(eid);
    }
    return result;
  };

  function createMetrics(label, runDecision, deferCatalyst) {
    return {
      label,
      decision: runDecision,
      keepAtStageClear: runDecision.endsWith('keep'),
      avoidRecipe: runDecision === 'avoid',
      deferFinalCatalyst: deferCatalyst,
      startedAt: atSeconds(),
      generatedXp: 0,
      shardCollectedXp: 0,
      directXp: 0,
      updatingShards: false,
      instrumentationRestored: false,
      evolutionCalls: [],
      evolutionEvents: [],
      evolutionSelections: [],
      cardSelections: [],
      activeChoice: null,
      choiceSeq: 0,
      firstEligibilityAt: null,
      maxWeaponLevel: 0,
      maxPassiveLevel: 0,
      stageClearedAt: null,
      gameOverAt: null,
      stageChoiceOfferedAt: null,
      stageChoiceOffers: 0,
      stageChoiceOfferCountsByEid: {},
      stageChoiceSelectionCountsByEid: {},
      stageChoiceOfferSequence: [],
      stageChoiceSelectionSequence: [],
      evolutionsBeforeStageChoice: null,
      stageChoiceKeys: [],
      selectedStageChoice: null,
      offerCount: 0,
      targetWeaponOffers: 0,
      catalystOffers: 0,
      evolutionOffers: 0,
      firstWeaponL3At: null,
      firstWeaponL5At: null,
      firstCatalystL1At: null,
      firstCatalystL3At: null,
      enemySpawns: 0,
      seenEnemies: new WeakSet(),
      runtimeErrors: [],
      selectedCardKeys: new Set(),
      offeredCardKeys: new Set(),
      offeredBeWeaponKeys: new Set(),
      offeredBePassiveKeys: new Set(),
      nonLeadBeOfferKeys: new Set(),
      beWeaponOfferCount: 0,
      bePassiveOfferCount: 0,
      nonLeadBeOfferCount: 0,
    };
  }

  function startCampaignRun(stage) {
    game.selectedCharacter = ch;
    game.gameState = 'playing';
    game._pendingCampaignStage = stage;
    game.paused = false;
    // Mirror the production selectCharacter transition before reset. These are UI/watchdog
    // fields, not gameplay progression: leaving either stale can redirect the new run to menu.
    game._stageCompleteBanner = null;
    game._stageCompletePausedAt = 0;
    game.reset();
    game._applyCampaignStage();
  }

  function instrumentCurrentRun(metrics) {
    activeMetrics = metrics;

    const shards = game.xpShards;
    const player = game.player;
    const buildEngine = game.buildEngine;
    const originalSpawnXp = shards.spawnBurst;
    const originalUpdateShards = shards.update;
    const originalGainXp = player.gainXp;
    const originalEvolve = buildEngine._evolve;
    const wrappedSpawnXp = (x, y, total, radius, owner) => {
      metrics.generatedXp += Math.max(1, Math.round(total));
      return originalSpawnXp.call(shards, x, y, total, radius, owner);
    };
    const wrappedUpdateShards = (dt, owner) => {
      metrics.updatingShards = true;
      try { return originalUpdateShards.call(shards, dt, owner); }
      finally { metrics.updatingShards = false; }
    };
    const wrappedGainXp = (amount, floatingTexts) => {
      if (metrics.updatingShards) metrics.shardCollectedXp += amount;
      else metrics.directXp += amount;
      return originalGainXp.call(player, amount, floatingTexts);
    };

    const wrappedEvolve = (wid) => {
      const ready = buildEngine._readyEvolutions?.().find(entry => entry.recipe?.weapon === wid);
      const before = !!buildEngine.weapons.get(wid)?.evolved;
      const choice = metrics.activeChoice;
      const call = {
        wid,
        eid: ready?.eid ?? null,
        at: +(atSeconds() - metrics.startedAt).toFixed(1),
        before,
        choiceSeq: choice?.seq ?? null,
        choiceKey: choice?.key ?? null,
        choiceSource: choice?.source ?? null,
        success: false,
      };
      try {
        const result = originalEvolve.call(buildEngine, wid);
        const after = !!buildEngine.weapons.get(wid)?.evolved;
        call.after = after;
        call.success = !before && after;
        if (call.success) {
          metrics.evolutionEvents.push({
            wid,
            eid: call.eid,
            at: call.at,
            choiceSeq: call.choiceSeq,
            choiceKey: call.choiceKey,
            choiceSource: call.choiceSource,
          });
        }
        return result;
      } catch (error) {
        call.error = errorText(error);
        throw error;
      } finally {
        metrics.evolutionCalls.push(call);
      }
    };
    shards.spawnBurst = wrappedSpawnXp;
    shards.update = wrappedUpdateShards;
    player.gainXp = wrappedGainXp;
    buildEngine._evolve = wrappedEvolve;

    return () => {
      if (shards.spawnBurst === wrappedSpawnXp) shards.spawnBurst = originalSpawnXp;
      if (shards.update === wrappedUpdateShards) shards.update = originalUpdateShards;
      if (player.gainXp === wrappedGainXp) player.gainXp = originalGainXp;
      if (buildEngine._evolve === wrappedEvolve) buildEngine._evolve = originalEvolve;
      metrics.instrumentationRestored = shards.spawnBurst === originalSpawnXp &&
        shards.update === originalUpdateShards && player.gainXp === originalGainXp &&
        buildEngine._evolve === originalEvolve;
      if (activeMetrics === metrics) activeMetrics = null;
    };
  }

  function chooseUpgrade(metrics) {
    const choices = game.upgradeUI?.choices || [];
    if (!choices.length) {
      metrics.runtimeErrors.push('upgrade UI opened without choices');
      return false;
    }
    const stageChoice = game._stageClearEvolutionChoice;
    const isStageChoice = !!stageChoice;
    const stageChoiceEid = isStageChoice ? String(stageChoice.eid || 'missing-eid') : null;
    metrics.offerCount++;
    for (const card of choices) metrics.offeredCardKeys.add(String(card?.key || ''));
    metrics.evolutionOffers += choices.filter(card => isEvolutionKey(card?.key)).length;
    if (metrics.firstEligibilityAt == null && game.buildEngine._evolutionReady()) {
      metrics.firstEligibilityAt = +(atSeconds() - metrics.startedAt).toFixed(1);
    }

    let selected = -1;
    if (isStageChoice) {
      if (metrics.stageChoiceOfferedAt == null) {
        metrics.stageChoiceOfferedAt = +(atSeconds() - metrics.startedAt).toFixed(1);
        metrics.evolutionsBeforeStageChoice = metrics.evolutionEvents.length;
        metrics.stageChoiceKeys = choices.map(card => String(card?.key || ''));
      }
      const wantedKey = metrics.keepAtStageClear ? 'campaign_keep_build' : 'campaign_evo_';
      selected = choices.findIndex(card => metrics.keepAtStageClear
        ? String(card?.key || '') === wantedKey
        : String(card?.key || '').startsWith(wantedKey));
      metrics.selectedStageChoice = metrics.keepAtStageClear ? 'keep' : 'evolve';
    } else {
      let lead = null;
      let leadLevel = -1;
      for (const [wid, weapon] of game.buildEngine.weapons) {
        if (weapon.evolved || !weaponToPassive[wid]) continue;
        const level = weapon.level;
        if (level > leadLevel || (level === leadLevel && nativeWeapons.has(wid) && !(lead && nativeWeapons.has(lead)))) {
          leadLevel = level;
          lead = wid;
        }
      }
      const leadPassive = lead ? weaponToPassive[lead] : null;
      const weaponLevel = lead ? (game.buildEngine.weapons.get(lead)?.level || 0) : 0;
      const passiveLevel = leadPassive ? (game.buildEngine.passives.get(leadPassive) || 0) : 0;
      const offeredBeWeapons = choices.map(card => String(card?.key || '')).filter(key => key.startsWith('be_w_'));
      const offeredBePassives = choices.map(card => String(card?.key || '')).filter(key => key.startsWith('be_p_'));
      metrics.beWeaponOfferCount += offeredBeWeapons.length;
      metrics.bePassiveOfferCount += offeredBePassives.length;
      for (const key of offeredBeWeapons) metrics.offeredBeWeaponKeys.add(key);
      for (const key of offeredBePassives) metrics.offeredBePassiveKeys.add(key);
      if (lead) {
        const leadWeaponKey = 'be_w_' + lead;
        const leadPassiveKey = leadPassive ? 'be_p_' + leadPassive : null;
        const nonLead = [...offeredBeWeapons, ...offeredBePassives]
          .filter(key => key !== leadWeaponKey && key !== leadPassiveKey);
        metrics.nonLeadBeOfferCount += nonLead.length;
        for (const key of nonLead) metrics.nonLeadBeOfferKeys.add(key);
      }
      if (lead) metrics.targetWeaponOffers += choices.filter(card => String(card?.key || '') === 'be_w_' + lead).length;
      if (leadPassive) metrics.catalystOffers += choices.filter(card => String(card?.key || '') === 'be_p_' + leadPassive).length;

      if (metrics.avoidRecipe) {
        selected = choices.findIndex(card => !String(card?.key || '').startsWith('be_'));
      } else {
        selected = metrics.deferFinalCatalyst
          ? -1
          : choices.findIndex(card => String(card?.key || '').startsWith('be_evo_'));
        if (selected < 0 && lead && weaponLevel < 5) selected = choices.findIndex(card => String(card?.key || '') === 'be_w_' + lead);
        if (selected < 0 && leadPassive && passiveLevel < 3) selected = choices.findIndex(card => String(card?.key || '') === 'be_p_' + leadPassive);
        if (selected < 0 && !lead) selected = choices.findIndex(card => {
          const key = String(card?.key || '');
          return key.startsWith('be_w_') && nativeWeapons.has(key.slice(5));
        });
        if (selected < 0) selected = choices.findIndex(card => !String(card?.key || '').startsWith('be_'));
      }

      // This is a card-selection policy, not state injection: it delays only the last catalyst
      // choice so the deterministic fixture earns eligibility near the stage boundary.
      if (metrics.deferFinalCatalyst && leadPassive && passiveLevel === 2 &&
          String(choices[selected]?.key || '') === 'be_p_' + leadPassive && vclock < 240000) {
        const alternate = choices.findIndex(card => !String(card?.key || '').startsWith('be_'));
        if (alternate >= 0) selected = alternate;
      }
    }

    if (selected < 0) selected = 0;
    const selectedKey = String(choices[selected]?.key || '');
    const stageEventsBefore = game._stageClearEvolutionEvents?.length || 0;
    const selection = {
      seq: ++metrics.choiceSeq,
      key: selectedKey,
      source: isStageChoice ? 'stage-clear' : 'level-up',
      at: +(atSeconds() - metrics.startedAt).toFixed(1),
      successfulEvolutionEvents: 0,
    };
    metrics.cardSelections.push(selection);
    metrics.selectedCardKeys.add(selectedKey);
    if (isEvolutionKey(selectedKey)) metrics.evolutionSelections.push(selection);
    metrics.activeChoice = selection;
    try {
      game.selectUpgrade(selected);
      if (isStageChoice && (game._stageClearEvolutionEvents?.length || 0) === stageEventsBefore + 1) {
        increment(metrics.stageChoiceSelectionCountsByEid, stageChoiceEid);
        metrics.stageChoiceSelectionSequence.push({ eid: stageChoiceEid, key: selectedKey });
      }
    } catch (error) {
      metrics.runtimeErrors.push('selectUpgrade: ' + errorText(error));
      return false;
    } finally {
      selection.successfulEvolutionEvents = metrics.evolutionEvents
        .filter(event => event.choiceSeq === selection.seq).length;
      metrics.activeChoice = null;
    }
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
    const danger = nearestEnemySq < 175 * 175 || nearbyThreats >= 4;
    if (danger && (repelX || repelY)) {
      moveX = repelX;
      moveY = repelY;
    } else if (nearestShard) {
      moveX = nearestShard.x - px + repelX * 70;
      moveY = nearestShard.y - py + repelY * 70;
    } else if (repelX || repelY) {
      moveX = repelX;
      moveY = repelY;
    } else {
      const patrolAngle = (vclock / 1000) * 0.32 + (seed % 360) * Math.PI / 180;
      moveX = Math.cos(patrolAngle);
      moveY = Math.sin(patrolAngle);
    }

    if (moveX > 0.12) keys.add('d'); else if (moveX < -0.12) keys.add('a');
    if (moveY > 0.12) keys.add('s'); else if (moveY < -0.12) keys.add('w');
    if (nearestEnemySq < 230 * 230 && (repelX || repelY)) keys.add('shift');
    return keys;
  }

  function observeRun(metrics) {
    for (const enemy of (game.enemies || [])) {
      if (enemy && !metrics.seenEnemies.has(enemy)) {
        metrics.seenEnemies.add(enemy);
        metrics.enemySpawns++;
      }
    }
    for (const weapon of (game.buildEngine?.weapons?.values?.() || [])) {
      metrics.maxWeaponLevel = Math.max(metrics.maxWeaponLevel, weapon.evolved ? 5 : (weapon.level || 0));
    }
    for (const level of (game.buildEngine?.passives?.values?.() || [])) {
      metrics.maxPassiveLevel = Math.max(metrics.maxPassiveLevel, level);
    }
    const now = +(atSeconds() - metrics.startedAt).toFixed(1);
    if (metrics.firstWeaponL3At == null && metrics.maxWeaponLevel >= 3) metrics.firstWeaponL3At = now;
    if (metrics.firstWeaponL5At == null && metrics.maxWeaponLevel >= 5) metrics.firstWeaponL5At = now;
    if (metrics.firstCatalystL1At == null && metrics.maxPassiveLevel >= 1) metrics.firstCatalystL1At = now;
    if (metrics.firstCatalystL3At == null && metrics.maxPassiveLevel >= 3) metrics.firstCatalystL3At = now;
    if (metrics.firstEligibilityAt == null && game.buildEngine._evolutionReady()) metrics.firstEligibilityAt = now;
  }

  function driveCampaignRun(metrics) {
    const frameLimit = 6 * 60 * 60;
    for (let frame = 0; frame < frameLimit; frame++) {
      vclock += 1000 / 60;
      if (game.upgradeUI && !chooseUpgrade(metrics)) break;
      if (game.mutationUI) {
        try { game.selectMutation(0); }
        catch (error) { metrics.runtimeErrors.push('selectMutation: ' + errorText(error)); break; }
      }
      if (game._postArenaChoice) {
        try { game._selectPostArenaChoice(0); }
        catch (error) { metrics.runtimeErrors.push('postArenaChoice: ' + errorText(error)); break; }
      }

      try { game.update(1 / 60, input(naturalMovementKeys())); }
      catch (error) { metrics.runtimeErrors.push('update: ' + errorText(error)); break; }
      observeRun(metrics);

      if (game._campaignCleared) {
        metrics.stageClearedAt = +(atSeconds() - metrics.startedAt).toFixed(1);
        break;
      }
      if (game.gameOver) {
        metrics.gameOverAt = +(atSeconds() - metrics.startedAt).toFixed(1);
        break;
      }
      if (game.paused && !game.upgradeUI) {
        metrics.runtimeErrors.push('unexpected pause before campaign clear at ' +
          +(atSeconds() - metrics.startedAt).toFixed(1));
        break;
      }
    }
  }

  function summarizeRun(metrics) {
    const groundXp = game.xpShards.active.reduce((sum, shard) => sum + (shard.value || 0), 0);
    const unexplainedXp = metrics.generatedXp - metrics.shardCollectedXp - groundXp;
    const automaticEvolutionEvents = metrics.evolutionEvents.filter(event =>
      event.choiceSeq == null || !isEvolutionKey(event.choiceKey));
    const invalidEvolutionSelections = metrics.evolutionSelections.filter(selection =>
      selection.successfulEvolutionEvents !== 1);
    const choiceIds = metrics.evolutionEvents.map(event => event.choiceSeq).filter(id => id != null);
    const duplicateChoiceLinks = choiceIds.length - new Set(choiceIds).size;
    const evolutionEidChoiceMismatches = metrics.evolutionEvents.filter(event =>
      !event.eid || !String(event.choiceKey || '').endsWith(String(event.eid)));
    const successfulEvolutionEvents = metrics.evolutionEvents.length;
    const stageChoiceEids = [...new Set([
      ...Object.keys(metrics.stageChoiceOfferCountsByEid),
      ...Object.keys(metrics.stageChoiceSelectionCountsByEid),
    ])];
    const missingStageChoiceOfferEids = stageChoiceEids.filter(eid =>
      metrics.stageChoiceOfferCountsByEid[eid] !== 1);
    const duplicateStageChoiceEids = stageChoiceEids.filter(eid =>
      metrics.stageChoiceOfferCountsByEid[eid] > 1);
    const unresolvedStageChoiceEids = stageChoiceEids.filter(eid =>
      metrics.stageChoiceSelectionCountsByEid[eid] !== 1);
    const failureReason = metrics.runtimeErrors.length ? 'runtime-error'
      : metrics.gameOverAt != null ? 'player-died'
      : successfulEvolutionEvents > 0 ? null
      : metrics.maxWeaponLevel < 5 ? 'weapon-below-l5'
      : metrics.maxPassiveLevel < 3 ? 'catalyst-below-l3'
      : metrics.firstEligibilityAt == null ? 'recipe-not-eligible'
      : metrics.evolutionOffers < 1 ? 'eligible-without-reward-opportunity'
      : 'reward-not-selected';
    return {
      label: metrics.label,
      decision: metrics.decision,
      evolutions: successfulEvolutionEvents,
      evolutionCallCount: metrics.evolutionCalls.length,
      failedEvolutionCalls: metrics.evolutionCalls.filter(call => !call.success).length,
      firstEvolutionAt: metrics.evolutionEvents[0]?.at ?? null,
      firstEligibilityAt: metrics.firstEligibilityAt,
      evolutionEvents: metrics.evolutionEvents,
      evolutionSelectionCount: metrics.evolutionSelections.length,
      automaticEvolutionEvents: automaticEvolutionEvents.length,
      invalidEvolutionSelections: invalidEvolutionSelections.length,
      duplicateChoiceLinks,
      evolutionEidChoiceMismatches: evolutionEidChoiceMismatches.length,
      oneToOneEvolutionChoice: automaticEvolutionEvents.length === 0 &&
        invalidEvolutionSelections.length === 0 && duplicateChoiceLinks === 0 &&
        evolutionEidChoiceMismatches.length === 0 &&
        successfulEvolutionEvents === metrics.evolutionSelections.length,
      stageCount: metrics.stageClearedAt == null ? 0 : 1,
      stageClearedAt: metrics.stageClearedAt,
      totalCampaignDuration: metrics.stageClearedAt,
      gameOverAt: metrics.gameOverAt,
      enemySpawns: metrics.enemySpawns,
      kills: game.player?.kills || 0,
      generatedXp: metrics.generatedXp,
      shardCollectedXp: metrics.shardCollectedXp,
      groundXp,
      unexplainedXp,
      directXp: metrics.directXp,
      instrumentationRestored: metrics.instrumentationRestored,
      playerLevel: game.player?.level || 0,
      playerHp: game.player?.hp ?? null,
      offerCount: metrics.offerCount,
      targetWeaponOffers: metrics.targetWeaponOffers,
      catalystOffers: metrics.catalystOffers,
      evolutionOffers: metrics.evolutionOffers,
      firstWeaponL3At: metrics.firstWeaponL3At,
      firstWeaponL5At: metrics.firstWeaponL5At,
      firstCatalystL1At: metrics.firstCatalystL1At,
      firstCatalystL3At: metrics.firstCatalystL3At,
      maxWeaponLevel: metrics.maxWeaponLevel,
      maxPassiveLevel: metrics.maxPassiveLevel,
      stageChoiceOfferedAt: metrics.stageChoiceOfferedAt,
      stageChoiceOffers: metrics.stageChoiceOffers,
      stageChoiceOfferCountsByEid: metrics.stageChoiceOfferCountsByEid,
      stageChoiceSelectionCountsByEid: metrics.stageChoiceSelectionCountsByEid,
      stageChoiceOfferSequence: metrics.stageChoiceOfferSequence,
      stageChoiceSelectionSequence: metrics.stageChoiceSelectionSequence,
      missingStageChoiceOfferEids,
      duplicateStageChoiceEids,
      unresolvedStageChoiceEids,
      stageChoicePerEidIntegrity: missingStageChoiceOfferEids.length === 0 &&
        duplicateStageChoiceEids.length === 0 &&
        unresolvedStageChoiceEids.length === 0 &&
        metrics.stageChoiceOffers === metrics.stageChoiceOfferSequence.length &&
        metrics.stageChoiceSelectionSequence.length === stageChoiceEids.length,
      evolutionsBeforeStageChoice: metrics.evolutionsBeforeStageChoice,
      stageChoiceKeys: metrics.stageChoiceKeys,
      selectedStageChoice: metrics.selectedStageChoice,
      bosses: {
        serpent: !!game.cyberSerpentSpawned,
        annihilator: !!game.annihilatorSpawned,
        titan: !!game.titanSpawned,
      },
      failureReason,
      runtimeErrors: metrics.runtimeErrors,
      selectedCardKeys: [...metrics.selectedCardKeys],
      offeredCardKeys: [...metrics.offeredCardKeys],
      offeredBeWeaponKeys: [...metrics.offeredBeWeaponKeys],
      offeredBePassiveKeys: [...metrics.offeredBePassiveKeys],
      nonLeadBeOfferKeys: [...metrics.nonLeadBeOfferKeys],
      beWeaponOfferCount: metrics.beWeaponOfferCount,
      bePassiveOfferCount: metrics.bePassiveOfferCount,
      nonLeadBeOfferCount: metrics.nonLeadBeOfferCount,
    };
  }

  startCampaignRun(1);
  const firstMetrics = createMetrics('first', decision, deferFinalCatalyst);
  const restoreFirstInstrumentation = instrumentCurrentRun(firstMetrics);
  driveCampaignRun(firstMetrics);
  restoreFirstInstrumentation();
  const firstRun = summarizeRun(firstMetrics);

  // Real second run on the same Game and MetaProgress instances. reset() must remove the first
  // run's UI, choice, evolution, passive, timer, and campaign state before new production frames.
  startCampaignRun(1);
  const secondRunStartClean = game._stageClearEvolutionChoice === null && game.upgradeUI === null &&
    game._stageClearEvolutionQueue.length === 0 && game._stageClearEvolutionEvents.length === 0 &&
    game._campaignStage === 1 && game._campaignCleared === false && game.timeAlive === 0 &&
    [...game.buildEngine.weapons.values()].every(weapon => !weapon.evolved) &&
    game.buildEngine.passives.size === 0 && game.player.pendingLevelupCount === 0;
  const secondMetrics = createMetrics('second', 'evolve', false);
  const restoreSecondInstrumentation = instrumentCurrentRun(secondMetrics);
  driveCampaignRun(secondMetrics);
  restoreSecondInstrumentation();
  const secondRun = summarizeRun(secondMetrics);
  secondRun.startClean = secondRunStartClean;
  secondRun.clean = secondRunStartClean && secondRun.stageCount === 1 &&
    secondRun.runtimeErrors.length === 0 && secondRun.oneToOneEvolutionChoice &&
    secondRun.stageChoicePerEidIntegrity;

  activeMetrics = null;
  unmuteRun();
  process.stdout.write(JSON.stringify({ ch, seed, decision, ...firstRun, firstRun, secondRun }));
  process.exit(0);
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

console.log('=== ACT 1 LATE-ELIGIBILITY CHOICE (deterministic, no state injection) ===');
const fixtureSeed = 20260721;
const evolve = worker(fixtureSeed, 'dimis_kickboxer', 'late-evolve');
const keep = worker(fixtureSeed, 'dimis_kickboxer', 'late-keep');
const ineligible = worker(fixtureSeed, 'dimis_kickboxer', 'avoid');
for (const result of [evolve, keep, ineligible]) {
  console.log(`  ${result.ch}/${result.seed}/${result.decision}: recipe ${result.maxWeaponLevel}+${result.maxPassiveLevel}, choice ${result.stageChoiceOfferedAt}, successful evo ${result.evolutions}, clear ${result.stageClearedAt}, hp ${result.playerHp}, second clear ${result.secondRun.stageClearedAt}`);
}

console.log('\n-- Earned recipe becomes one visible player choice --');
test('boundary fixtures naturally earned weapon L5 + catalyst L3', () =>
  [evolve, keep].every(r => r.maxWeaponLevel >= 5 && r.maxPassiveLevel >= 3) || 'recipe not earned');
test('both decisions opened and resolved exactly one opportunity for the earned eid', () =>
  [evolve, keep].every(r => r.stageChoiceOfferedAt != null && r.stageChoicePerEidIntegrity &&
    Object.keys(r.stageChoiceOfferCountsByEid).length === 1 &&
    Object.values(r.stageChoiceOfferCountsByEid).every(count => count === 1) &&
    Object.values(r.stageChoiceSelectionCountsByEid).every(count => count === 1)) ||
  'missing, duplicate, or unresolved eid');
test('choice contains EVOLVE and KEEP cards', () =>
  [evolve, keep].every(r => r.stageChoiceKeys.some(k => k.startsWith('campaign_evo_')) && r.stageChoiceKeys.includes('campaign_keep_build')) || 'choice keys incomplete');
test('no successful evolution happened before stage choice', () =>
  [evolve, keep].every(r => r.evolutionsBeforeStageChoice === 0) || 'automatic evolution detected');

console.log('\n-- Successful state transitions map 1:1 to selections --');
test('EVOLVE selection produced exactly one real state transition', () =>
  evolve.selectedStageChoice === 'evolve' && evolve.evolutions === 1 && evolve.oneToOneEvolutionChoice || 'transition/choice mismatch');
test('KEEP selection cleared without an evolution transition', () =>
  keep.selectedStageChoice === 'keep' && keep.evolutions === 0 && keep.oneToOneEvolutionChoice || `evolutions=${keep.evolutions}`);
test('no automatic or failed evolution calls in positive fixtures', () =>
  [evolve, keep].every(r => r.automaticEvolutionEvents === 0 && r.failedEvolutionCalls === 0) || 'unmatched/failed evolution call');

console.log('\n-- Natural run, XP, and second-run safety --');
test('all fixtures balanced generated shard XP; production direct XP is separately reported', () =>
  [evolve, keep, ineligible].every(r => r.unexplainedXp === 0 && r.directXp >= 0) || 'XP ledger mismatch');
test('both player decisions completed the campaign stage without runtime errors', () =>
  [evolve, keep].every(r => r.stageCount === 1 && r.runtimeErrors.length === 0) || 'stage failed');
test('ineligible run got no opportunity and no evolution transition', () =>
  ineligible.maxPassiveLevel < 3 && Object.keys(ineligible.stageChoiceOfferCountsByEid).length === 0 &&
  ineligible.evolutions === 0 || 'unearned opportunity created');
test('every fixture completed a clean second campaign run on the same Game instance', () =>
  [evolve, keep, ineligible].every(r => r.secondRun.clean) || 'second run failed/stale');
test('per-run instrumentation restored every original before the next run', () =>
  [evolve, keep, ineligible].every(r => r.instrumentationRestored && r.secondRun.instrumentationRestored) ||
  'instrumentation remained wrapped');

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
