// ════════════════════════════════════════════════════════════════════════════════
// SYNERGY GATES · WEAPON EXCLUSIVITY · BUILD ENGINE CARD LEVELS
//
// A. SYNERGY UNLOCKS. Two synergy meta-upgrades carry `lockedUntil`, which was resolved through
//    protocolUnlocks — the Protocol-Fragment purchase path. PF_CHARACTER_COSTS is an empty map by
//    design, so protocolUnlockCost() is 0, tryUnlockCharacterWithPF() answers 'invalid', and
//    nothing in the game can write that flag. The test walks the real campaign ladder and asserts
//    the gate opens exactly when the character does — and not one stage earlier.
//
// B. EXCLUSIVITY. Demonic Cataclysm Pulse and Solo Red Thunder both say "HARD-LOCKED" in their own
//    definitions. The test drives the SHIPPED card builder thousands of times for every character
//    in the roster and asserts a foreign exclusive is never offered, then attacks the choke point
//    directly with _grantBaseWeapon.
//
// C. BE CARD LEVELS. A Build Engine card's level lives in the engine's own maps, never in
//    player.upgrades — which is where UpgradeUI reads the dot row from. The test builds real BE
//    state and asserts the card's level/cap match the engine AND the card's own "LvX -> LvY" text.
//
// Run: node tools/qa/synergy_exclusivity_becard_regression.mjs   (exit 1 on failure)
// ════════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
let vclock = 0;
globalThis.performance = { now: () => vclock };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { MetaProgress, SYNERGY_UPGRADES } = await import(pathToFileURL(path.join(ROOT, 'js/game/MetaProgress.js')).href);
const { getAllBaseWeapons } = await import(pathToFileURL(path.join(ROOT, 'js/game/WeaponCatalog.js')).href);
const BE = await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngine.js')).href);
u0();

let pass = 0, fail = 0;
const T = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${x ? '  — ' + x : ''}`); } };
const quiet = (fn) => { const un = muteConsole(); try { return fn(); } finally { un(); } };
const CHARS = ['skeleton_warrior', 'cyber_arm_hero', 'taekwondo_girl', 'brawler_warrior', 'assassin_clone',
               'euclid_vector', 'oni_cataclysm_protocol', 'japan_phasewalker', 'eddie', 'dimis_kickboxer'];

console.log('\n═══ SYNERGY / EXCLUSIVITY / BE CARD LEVELS ═══');

// ══ A. SYNERGY UNLOCK REACHABILITY ═══════════════════════════════════════════
console.log('\n── A. synergy meta-upgrade gates ──');
{
  const meta = quiet(() => { globalThis.localStorage.clear(); return new MetaProgress(); });
  const total = meta.totalStages;
  const gated = SYNERGY_UPGRADES.filter(u => u.lockedUntil);
  console.log(`     gated synergies: ${gated.map(u => u.key + ' -> ' + u.lockedUntil).join(', ')}  (totalStages ${total})`);

  // The expression the four UI call sites evaluate, verbatim.
  // Whatever gate THIS build has: the fixed build resolves lockedUntil through isMetaGateOpen,
  // the pristine one through isProtocolUnlocked. Written this way so the same file can be run
  // against both and the baseline reports the real behaviour instead of a TypeError.
  const gateOpen = (m, id) => (typeof m.isMetaGateOpen === 'function' ? m.isMetaGateOpen(id) : m.isProtocolUnlocked(id));
  const isLocked = (m, upg) =>
    !!((upg.lockedUntil && !gateOpen(m, upg.lockedUntil)) || (upg.char && !m.isCharacterUnlocked(upg.char)));

  T('A0 the PF path really is closed (this is why the old gate could not open)',
    Object.keys(meta.protocolUnlocks || {}).length === 0 &&
    gated.every(u => meta.protocolUnlockCost(u.lockedUntil) === 0) &&
    gated.every(u => meta.tryUnlockCharacterWithPF(u.lockedUntil) === 'invalid'));

  meta.stagesCleared = 0;
  T('A1 both gated synergies are LOCKED on a fresh save', gated.every(u => isLocked(meta, u)));

  const opensAt = {};
  for (const u of gated) {
    let seen = null;
    for (let s = 0; s <= total; s++) { meta.stagesCleared = s; if (!isLocked(meta, u)) { seen = s; break; } }
    opensAt[u.key] = seen;
  }
  console.log(`     opens at stagesCleared: ${JSON.stringify(opensAt)}`);
  T('A2 syn_cataclysm_chain becomes reachable through campaign progress',
    opensAt.syn_cataclysm_chain != null, JSON.stringify(opensAt));
  T('A3 syn_red_thunder becomes reachable through campaign progress',
    opensAt.syn_red_thunder != null, JSON.stringify(opensAt));
  T('A4 each opens exactly when its character unlocks, not earlier',
    gated.every(u => opensAt[u.key] === (() => {
      for (let s = 0; s <= total; s++) { meta.stagesCleared = s; if (meta.isCharacterUnlocked(u.char)) return s; }
      return null;
    })()), JSON.stringify(opensAt));

  meta.stagesCleared = total;
  T('A5 a fully-cleared campaign unlocks BOTH', gated.every(u => !isLocked(meta, u)));
  T('A6 an id that is neither a protocol unlock nor a character stays locked',
    gateOpen(meta, 'not_a_real_thing') === false);
  T('A7 the ungated synergies are untouched by any of this',
    SYNERGY_UPGRADES.filter(u => !u.lockedUntil).every(u => isLocked(meta, u) === !meta.isCharacterUnlocked(u.char)));

  // and the purchase itself still works, at the unchanged cost
  const before = { ...meta.levels };
  meta.credits = 5000;
  const upg = SYNERGY_UPGRADES.find(u => u.key === 'syn_red_thunder');
  const res = quiet(() => meta.tryBuy(upg));
  T('A8 it can then actually be bought at its unchanged 1000-core cost',
    res === 'ok' && meta.getLevel('syn_red_thunder') === 1 && meta.credits === 4000,
    `${res} lvl=${meta.getLevel('syn_red_thunder')} credits=${meta.credits}`);
  T('A9 no other synergy level moved', Object.keys(before).every(k => k === 'syn_red_thunder' || meta.levels[k] === before[k]));
}

// ══ B. WEAPON EXCLUSIVITY ════════════════════════════════════════════════════
console.log('\n── B. character-exclusive weapons ──');
{
  const EXCL = getAllBaseWeapons().filter(w => w.exclusive);
  console.log(`     exclusives: ${EXCL.map(w => w.id + ' -> ' + w.character).join(', ')}`);
  T('B0 CONTROL: there really are exclusive weapons to protect', EXCL.length >= 2);

  const offendersByChar = {};
  for (const c of CHARS) {
    const g = quiet(() => {
      globalThis.localStorage.clear();
      const gg = new Game();
      gg.audio = null; gg.selectedCharacter = c; gg.gameState = 'playing';
      gg.reset(); gg._enterEndless();
      return gg;
    });
    const seen = new Set();
    quiet(() => {
      for (let i = 0; i < 900; i++) {
        const card = g._buildWeaponCard();
        if (card && card._isWeaponCard) {
          // The shipped key prefixes: _wacq_ for an acquisition, _wupg_ for a level-up.
          const id = String(card.key || '').replace(/^_wacq_|^_wupg_|^_wevo_/, '');
          seen.add(id);
        }
      }
    });
    const bad = EXCL.filter(w => w.character !== c && seen.has(w.id)).map(w => w.id);
    offendersByChar[c] = bad;
    console.log(`     ${c.padEnd(24)} offered ${seen.size} weapon ids · foreign exclusives: ${bad.length ? bad.join(', ') : 'none'}`);
  }
  const offenders = Object.entries(offendersByChar).filter(([, v]) => v.length);
  T('B1 no character is ever offered another character\'s exclusive weapon',
    offenders.length === 0, offenders.map(([c, v]) => c + ':' + v.join('/')).join(' '));

  // the choke point itself
  const g2 = quiet(() => {
    globalThis.localStorage.clear();
    const gg = new Game();
    gg.audio = null; gg.selectedCharacter = 'brawler_warrior'; gg.gameState = 'playing';
    gg.reset(); gg._enterEndless();
    return gg;
  });
  quiet(() => { for (const w of EXCL) g2._grantBaseWeapon(w.id, 3); });
  T('B2 _grantBaseWeapon refuses a foreign exclusive on every path',
    EXCL.every(w => !g2._weaponLevels.has(w.id)),
    EXCL.filter(w => g2._weaponLevels.has(w.id)).map(w => w.id).join(', '));

  // the owner is unaffected, and so is a normal weapon
  const g3 = quiet(() => {
    globalThis.localStorage.clear();
    const gg = new Game();
    gg.audio = null; gg.selectedCharacter = 'eddie'; gg.gameState = 'playing';
    gg.reset(); gg._enterEndless();
    return gg;
  });
  quiet(() => g3._grantBaseWeapon('solo_red_thunder', 3));
  T('B3 the OWNER still receives its own exclusive weapon',
    (g3._weaponLevels.get('solo_red_thunder') || 0) >= 1, `lvl=${g3._weaponLevels.get('solo_red_thunder')}`);
  const normal = getAllBaseWeapons().find(w => !w.exclusive && !w.character);
  if (normal) {
    quiet(() => g2._grantBaseWeapon(normal.id, 2));
    T('B4 a non-exclusive weapon is still grantable to anyone',
      (g2._weaponLevels.get(normal.id) || 0) >= 1, normal.id);
  }
  // the starter loadout is untouched
  const starters = {};
  for (const c of ['eddie', 'oni_cataclysm_protocol', 'brawler_warrior']) {
    const gg = quiet(() => {
      globalThis.localStorage.clear();
      const x = new Game();
      x.audio = null; x.selectedCharacter = c; x.gameState = 'playing'; x.reset(); x._enterEndless();
      return x;
    });
    starters[c] = [...gg._weaponLevels.keys()];
  }
  console.log(`     starter loadouts: ${JSON.stringify(starters)}`);
  T('B5 Eddie still starts with Solo Red Thunder (legit starter path untouched)',
    starters.eddie.includes('solo_red_thunder'), JSON.stringify(starters.eddie));
  T('B6 Oni still starts with Cataclysm Pulse',
    starters.oni_cataclysm_protocol.includes('cataclysm_pulse'), JSON.stringify(starters.oni_cataclysm_protocol));
  T('B7 brawler_warrior starts with neither',
    !starters.brawler_warrior.includes('cataclysm_pulse') && !starters.brawler_warrior.includes('solo_red_thunder'),
    JSON.stringify(starters.brawler_warrior));
}

// ══ C. BUILD ENGINE CARD LEVEL DISPLAY ═══════════════════════════════════════
console.log('\n── C. Build Engine card levels ──');
{
  const g = quiet(() => {
    globalThis.localStorage.clear();
    const gg = new Game();
    gg.audio = null; gg.selectedCharacter = 'skeleton_warrior'; gg.gameState = 'playing';
    gg.reset(); gg._enterEndless();
    return gg;
  });
  const be = g.buildEngine;
  T('C0 CONTROL: the Build Engine is live', !!be && !!be.weapons);

  // Build real state: one weapon at L3, one catalyst at L1.
  const wid = quiet(() => {
    const cands = Object.entries(BE.WEAPON_DEFS).filter(([, d]) => !d.external);
    const own = cands.find(([, d]) => d.owner === 'skeleton_warrior') || cands[0];
    for (let i = 0; i < 3; i++) be.addWeapon(own[0]);
    return own[0];
  });
  const realW = be.weapons.get(wid)?.level ?? -1;
  console.log(`     engine says ${wid} is at level ${realW}`);

  const rows = [];
  quiet(() => {
    for (let i = 0; i < 400; i++) {
      const choices = [null, null, null];
      be.injectCards(choices);
      for (const c of choices) {
        if (!c || !String(c.key || '').startsWith('be_')) continue;
        rows.push({ key: c.key, level: c.level, displayMax: c.displayMax, maxLevel: c.maxLevel, desc: c.description });
      }
    }
  });
  const uniq = new Map();
  for (const r of rows) if (!uniq.has(r.key)) uniq.set(r.key, r);
  console.log(`     ${uniq.size} distinct BE cards seen`);

  T('C1 every BE card carries a real numeric level and cap',
    [...uniq.values()].every(r => Number.isFinite(r.level) && Number.isFinite(r.displayMax)),
    [...uniq.values()].filter(r => !Number.isFinite(r.level)).map(r => r.key).join(', '));

  const wCard = [...uniq.values()].find(r => r.key === 'be_w_' + wid);
  T('C2 the invested weapon\'s card shows its ENGINE level, not 0',
    !!wCard && wCard.level === realW, wCard ? `card=${wCard.level} engine=${realW}` : 'card not offered');
  T('C3 and its cap is the level the engine actually stops at (5), not the raw maxLevel 9',
    !!wCard && wCard.displayMax === 5 && wCard.maxLevel === 9,
    wCard ? `displayMax=${wCard.displayMax} maxLevel=${wCard.maxLevel}` : '');

  // dots must agree with the card's own "LvX -> LvY" sentence
  const disagreeing = [...uniq.values()].filter(r => {
    const m = /Lv(\d+) → Lv(\d+)/.exec(r.desc || '');
    return m && Number(m[1]) !== r.level;
  });
  T('C4 the dot level agrees with the card\'s own "LvX → LvY" text',
    disagreeing.length === 0,
    disagreeing.slice(0, 3).map(r => `${r.key} dots=${r.level} text=${(/Lv(\d+) → Lv(\d+)/.exec(r.desc) || [])[0]}`).join(' | '));

  T('C5 the evolution card shows no misleading dot row',
    [...uniq.values()].filter(r => r.key.startsWith('be_evo_')).every(r => r.displayMax === 0));
  T('C6 nothing raised a BE card past the engine caps',
    [...uniq.values()].every(r => r.level <= r.displayMax || r.displayMax === 0));
  T('C7 maxLevel is untouched on every BE card (still 9)',
    [...uniq.values()].every(r => r.maxLevel === 9));
}

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══\n`);
process.exit(fail ? 1 : 0);
