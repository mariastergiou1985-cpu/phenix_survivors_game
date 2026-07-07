export const META_UPGRADES = [
  { key: 'maxHp',        name: 'Max HP',        desc: '+10 max HP per level',              maxLevel: 5, baseCost: 10 },
  { key: 'moveSpeed',    name: 'Move Speed',     desc: '+5% movement speed per level',       maxLevel: 5, baseCost: 10 },
  { key: 'coreMagnet',   name: 'Core Magnet',    desc: '+10% pickup radius per level',       maxLevel: 5, baseCost: 10 },
  { key: 'coreCapacity', name: 'Nexus Capacity',  desc: '+1 Nexus charge capacity per level',  maxLevel: 3, baseCost: 20 },
  { key: 'pulseDamage',  name: 'Pulse Damage',   desc: '+1 projectile damage per level',     maxLevel: 5, baseCost: 10 },
  { key: 'firewall',     name: 'Firewall',       desc: '-2% contact damage per level',       maxLevel: 5, baseCost: 10 },
  // ── Upgrade Economy phase additions (save-compatible: unknown keys default to level 0) ──
  { key: 'combatCalibration', name: 'Combat Calibration', desc: '+0.5 shot damage per level',        maxLevel: 5, baseCost: 12 },
  { key: 'armorPlating',      name: 'Armor Plating',      desc: '-3% contact damage per level',       maxLevel: 5, baseCost: 12 },
  { key: 'manaCapacitor',     name: 'Mana Capacitor',     desc: '+10 max mana per level',             maxLevel: 5, baseCost: 12 },
  { key: 'xpUplink',          name: 'XP Uplink',          desc: '+5% XP gain per level',              maxLevel: 5, baseCost: 12 },
  { key: 'cacheScanner',      name: 'Cache Scanner',      desc: '+5% chance / level of a SECOND Endless cache bonus', maxLevel: 5, baseCost: 12 },
];

// Explicit per-level cost curves (steeper sink so a single run can't max everything).
const COST_5 = [25, 50, 90, 140, 220];  // 5-level upgrades
const COST_3 = [35, 90, 180];           // 3-level upgrades (e.g. Core Capacity)

export function upgradeCost(upg, level) {
  if (upg.flatCost) return upg.flatCost;   // synergy upgrades: flat cost per star (1000)
  const table = upg.maxLevel <= 3 ? COST_3 : COST_5;
  return table[Math.min(level, table.length - 1)];
}

// ─── Character Weapon Synergy meta-upgrades (5★, flat 1000 Grid Cores per star) ───────────────
// A deep late-game Grid-Core sink, rendered on a separate SYNERGY tab of the Upgrades screen.
// Save-compatible: levels live in the SAME `levels` dict as META_UPGRADES; unknown keys default to
// 0 on load, so old saves are untouched. `char`/`charName` tie each synergy to a playable character;
// `lockedUntil` (a protocolUnlock id) keeps a synergy LOCKED until that character is unlocked (Oni),
// so this never exposes or free-unlocks a locked character.
export const SYNERGY_UPGRADES = [
  { key: 'syn_storm_conductor',   name: 'Storm Conductor ★',        char: 'skeleton_warrior',        charName: 'Skeleton Warrior', desc: '+mark duration & burst damage',   maxLevel: 5, flatCost: 1000 },
  { key: 'syn_furnace_chains',    name: 'Furnace Chains ★',         char: 'cyber_arm_hero',          charName: 'Cyber Arm Hero',   desc: '+burn duration & bonus damage',   maxLevel: 5, flatCost: 1000 },
  { key: 'syn_crescent_tide',     name: 'Crescent Tide Combo ★',    char: 'taekwondo_girl',          charName: 'Neon Taekwondo',   desc: '+splash radius & mana gain',      maxLevel: 5, flatCost: 1000 },
  { key: 'syn_rift_rebound',      name: 'Rift Rebound ★',           char: 'brawler_warrior',         charName: 'Brawler Warrior',  desc: '+rift burst radius & damage',     maxLevel: 5, flatCost: 1000 },
  { key: 'syn_plasma_execution',  name: 'Plasma Execution Loop ★',  char: 'assassin_clone',          charName: 'Assassin Clone',   desc: '+execution damage & uptime',      maxLevel: 5, flatCost: 1000 },
  { key: 'syn_toxic_geometry',    name: 'Toxic Geometry ★',         char: 'euclid_vector',           charName: 'Euclid Vector',    desc: '+poison tick & mark duration',    maxLevel: 5, flatCost: 1000 },
  { key: 'syn_cataclysm_chain',   name: 'Cataclysm Chain Reaction ★', char: 'oni_cataclysm_protocol', charName: 'Oni Cataclysm',  desc: '+4% Protocol 0 detonation per star', maxLevel: 5, flatCost: 1000, lockedUntil: 'oni_cataclysm_protocol' },
  { key: 'syn_red_thunder',       name: 'Red Thunder Resonance ★',   char: 'eddie',                  charName: 'Eddie',            desc: '+4% chain arc chance & +6% bolt damage per star', maxLevel: 5, flatCost: 1000, lockedUntil: 'eddie' },
];

// Secret unlock flags — set on a victory, persisted in localStorage, read by the
// Victory screen and Character Select. Additive: never gates existing progression.
export const UNLOCK_KEYS = [
  'log_1985',
  'log_1983',
  'golden_skeleton_warrior',
  'dark_cyber_arm_hero',
  'grandmaster_dojang_girl',
  'log_1997',   // Endless-only LOG that unlocks the Brawler Warrior secret outfit
  'log_1998',   // Assassin Clone secret outfit (LOG #1998). Reserved key — stays LOCKED for now
];

// Equippable outfits per base character. `default` is always available; `secret` reuses the
// EXISTING Easter-Egg unlock flags + secret-skin assets (no new keys/assets invented).
// Cosmetic only — outfits change the sprite path, never stats/weapons/balance.
export const CHARACTER_OUTFITS = {
  skeleton_warrior: {
    default: { name: 'Default', asset: 'assets/characters/skeleton_warrior.png' },
    secret:  { name: 'Cyber Skeleton Warrior', asset: 'assets/unlocks/secret_skins/cyber_skeleton_warrior_secret.png', unlockKey: 'golden_skeleton_warrior' },
  },
  taekwondo_girl: {
    default: { name: 'Default', asset: 'assets/characters/taekwondo_girl.png' },
    secret:  { name: 'Grandmaster Dojang Girl', asset: 'assets/unlocks/secret_skins/cyber_dojang_girl_secret.png', unlockKey: 'grandmaster_dojang_girl' },
  },
  cyber_arm_hero: {
    default: { name: 'Default', asset: 'assets/characters/cyber_arm_hero.png' },
    secret:  { name: 'Neon Cyber Arm Hero', asset: 'assets/unlocks/secret_skins/neon_cyber_arm_hero_secret.png', unlockKey: 'dark_cyber_arm_hero' },
  },
  // Brawler Warrior secret outfit — Endless-only, gated on the LOG #1997 flag (unlock key log_1997).
  // Internal outfit identity is brawler_warrior_log1997; the unlock flag stays log_1997 for save clarity.
  brawler_warrior: {
    default: { name: 'Default', asset: 'assets/characters/brawler_warrior.png' },
    secret:  { name: 'LOG #1997 Brawler', asset: 'assets/unlocks/secret_skins/brawler_warrior_log1997_secret.png', unlockKey: 'log_1997' },
  },
  // Assassin Clone secret outfit — LOG #1998 (Phantom Assassin). Gated on the log_1998 flag,
  // which has no in-game grant, so it stays LOCKED (preview only). A future Chaos Mode /
  // Assassin condition may set log_1998.
  assassin_clone: {
    default: { name: 'Default', asset: 'assets/characters/assassin_clone.png' },
    secret:  { name: 'LOG #1998 — Phantom Assassin', asset: 'assets/unlocks/secret_skins/assassin_clone_log1998_secret.png', unlockKey: 'log_1998' },
  },
  // Endless-tier secret outfits — palette-signature variants, survival-gated in Endless
  // (same pattern as LOG #1997/#1998: unlock flags granted in Game.js _updateEliteWaves).
  euclid_vector: {
    default: { name: 'Default', asset: 'assets/characters/endless/euclid_vector.png' },
    secret:  { name: 'Toxic Overload Euclid', asset: 'assets/unlocks/secret_skins/euclid_vector_toxic_overload_secret.png', unlockKey: 'toxic_overload' },
  },
  japan_phasewalker: {
    default: { name: 'Default', asset: 'assets/characters/endless/japan_phasewalker.png' },
    secret:  { name: 'Null Walker Phasewalker', asset: 'assets/unlocks/secret_skins/japan_phasewalker_null_walker_secret.png', unlockKey: 'null_walker' },
  },
  oni_cataclysm_protocol: {
    default: { name: 'Default', asset: 'assets/characters/endless/oni_cataclysm_protocol.png' },
    secret:  { name: 'Crimson Protocol Oni', asset: 'assets/unlocks/secret_skins/oni_cataclysm_crimson_secret.png', unlockKey: 'crimson_oni' },
  },
  // Eddie — default outfit only (no secret skin yet; PF-gated via PF_CHARACTER_COSTS).
  eddie: {
    default: { name: 'Default', asset: 'assets/characters/eddie_thunder_guitar.png' },
  },
};

// Endless-only achievement milestones. Each `test` is a PURE read-only predicate over a
// finished-run stats snapshot { time (s), level, score, combo, cores } — it never mutates
// game state. Recognition only: no rewards, no stat bonuses. Persisted in `phenix_meta`.
// Each entry also carries its Achievement Protocol (auto-active passive, Endless-only) and
// Achievement Card (special Endless-only upgrade card) reward metadata. These strings are
// DISPLAY ONLY — the actual effects live in Game.js (protocols) / Upgrades.js (cards), all
// gated to Endless. Rewards derive from the same `achievements` unlock flag → no save migration.
export const ENDLESS_ACHIEVEMENTS = [
  { id: 'first_endless',   name: 'FIRST ENDLESS RUN', desc: 'Finish one Endless run',       test: ()  => true,
    protocolName: 'Endless Initiate Protocol', protocolEffect: '+5% XP gain',
    cardName: 'Endless Spark', cardEffect: '+8% XP gain per level' },
  { id: 'endless_survivor', name: 'ENDLESS SURVIVOR',  desc: 'Survive 15:00 in Endless',     test: (s) => s.time  >= 15 * 60,
    protocolName: 'Survivor Core Protocol', protocolEffect: '+5% max HP',
    cardName: 'Survivor Plating', cardEffect: '+8% max HP per level' },
  { id: 'grid_legend',     name: 'GRID LEGEND',        desc: 'Survive 20:00 in Endless',     test: (s) => s.time  >= 20 * 60,
    protocolName: 'Grid Stabilizer Protocol', protocolEffect: '+1 Nexus charge capacity',
    cardName: 'Grid Stabilizer', cardEffect: '-5% Nexus charge decay / level (capped)' },
  { id: 'level_breaker',   name: 'LEVEL BREAKER',      desc: 'Reach Level 30 in Endless',    test: (s) => s.level >= 30,
    protocolName: 'Weapon Evolution Protocol', protocolEffect: 'Your mastery cards appear more often',
    cardName: 'Evolution Algorithm', cardEffect: 'Even better mastery-card odds / level' },
  { id: 'score_hunter',    name: 'SCORE HUNTER',       desc: 'Reach 50,000 score in Endless', test: (s) => s.score >= 50000,
    protocolName: 'Damage Uplink Protocol', protocolEffect: '+5% damage vs normal enemies',
    cardName: 'Damage Uplink', cardEffect: '+6% damage per level' },
  { id: 'combo_master',    name: 'COMBO MASTER',       desc: 'Reach combo x100 in Endless',  test: (s) => s.combo >= 100,
    protocolName: 'Combo Surge Protocol', protocolEffect: '+5% dmg at combo x50, +8% at x100',
    cardName: 'Combo Overdrive', cardEffect: 'Stronger high-combo damage / level' },
  { id: 'core_defender',   name: 'CORE DEFENDER',      desc: 'Secure 25 cores in Endless',   test: (s) => s.cores >= 25,
    protocolName: 'Nexus Defender Protocol', protocolEffect: '+1 Nexus charge capacity',
    cardName: 'Core Magnetizer', cardEffect: '+1 Nexus charge capacity per level' },

  // ── Phase 2: extended high-milestone ladder. Purely additive — unknown ids default to false on
  // load and the idempotent PF backfill pays them out automatically, so existing saves are safe. ──
  { id: 'endless_titan',   name: 'ENDLESS TITAN',     desc: 'Survive 25:00 in Endless',       test: (s) => s.time  >= 25 * 60,
    protocolName: 'Titan Reactor Protocol', protocolEffect: '+10% fire rate',
    cardName: 'Overclocked Core', cardEffect: '+20% fire rate & +10% projectile speed / level' },
  { id: 'score_legend',    name: 'SCORE LEGEND',      desc: 'Reach 150,000 score in Endless',  test: (s) => s.score >= 150000,
    protocolName: 'Titan Plating Protocol', protocolEffect: '+10% max HP',
    cardName: 'Titan Plating', cardEffect: '+60 max HP / level' },
  { id: 'level_ascendant', name: 'LEVEL ASCENDANT',   desc: 'Reach Level 45 in Endless',       test: (s) => s.level >= 45,
    protocolName: 'Nexus Capacitor Protocol', protocolEffect: '+15% max mana',
    cardName: 'Nexus Capacitor', cardEffect: '+40 max mana / level (faster ultimates)' },
  { id: 'combo_god',       name: 'COMBO GOD',         desc: 'Reach combo x250 in Endless',     test: (s) => s.combo >= 250,
    protocolName: 'Hyper Mobility Protocol', protocolEffect: '+8% move speed',
    cardName: 'Hyper Mobility', cardEffect: '+12% move speed / level' },
  { id: 'core_warden',     name: 'CORE WARDEN',       desc: 'Secure 60 cores in Endless',      test: (s) => s.cores >= 60,
    protocolName: 'Core Hoarder Protocol', protocolEffect: '+1 Nexus charge capacity',
    cardName: 'Core Hoarder', cardEffect: '+2 Nexus charge capacity' },
];

// ─── Protocol Fragments (PF) — Phase 1 ──────────────────────────────────────────
// A SEPARATE, rare Endless progression currency (NOT Grid Credits). Earned one-time from
// Endless achievements; spent to unlock future Endless characters. All payout/cost numbers
// live here (single source of truth — no scattered magic numbers).
//
// Payout per achievement, scaled by difficulty (intro/easy=1, medium/hard=2, elite=3):
export const PF_PAYOUTS = {
  first_endless:    1,   // finish one Endless run        (intro)
  core_defender:    1,   // secure 25 cores               (easy)
  endless_survivor: 2,   // survive 15:00                 (medium)
  score_hunter:     2,   // 50,000 score                  (medium)
  grid_legend:      2,   // survive 20:00                 (hard)
  combo_master:     3,   // combo x100                    (hard)
  level_breaker:    3,   // reach Level 30                (hard)
  // Phase 2 high-milestone payouts — kept at 1 PF each so PF stays a RARE currency and existing
  // character-unlock pacing is barely shifted (the weighty Endless cards are the main reward).
  endless_titan:    1,   // survive 25:00                 (hard)
  score_legend:     1,   // 150,000 score                 (hard)
  level_ascendant:  1,   // reach Level 45                (elite)
  combo_god:        1,   // combo x250                    (elite)
  core_warden:      1,   // secure 60 cores               (medium-hard)
};
// Sum of ALL payouts (currently 19 = Phase 1 [14] + Phase 2 [5]). Computed, not hard-coded, so it
// stays correct if the table changes. This is the denominator for the "X / 19" progression display.
export const PF_TOTAL_OBTAINABLE = Object.values(PF_PAYOUTS).reduce((a, b) => a + b, 0);

// Future Endless-character unlock costs. Progression targets (of the 14 total):
//   Japan Phasewalker 8 = 57% · Euclid Vector 10 = 71% · Oni Cataclysm 14 = 100%.
export const PF_CHARACTER_COSTS = {
  japan_phasewalker:      8,
  oni_cataclysm_protocol: 14,
  eddie:                  10,   // Thunder / Berserk roster addition — mid-range PF tier (8 < 10 < 14)
  // euclid_vector is intentionally NOT listed → unlocked from the start (free). Oni stays PF-gated.
};

// ─── Protocol Fragment unlock cards (permanent meta-upgrades, bought with spendable PF) ─────────
// SEPARATE from Oni character unlock (PF_CHARACTER_COSTS) and from the PF payout ledger. Each card
// is a one-time permanent purchase saved in MetaProgress.protocolCards. `comingSoon` cards are shown
// but cannot be bought (no spend path) until their system is wired. Runtime effects live in Game.js.
export const PROTOCOL_CARDS = [
  { id: 'elite_arsenal',        name: 'Elite Arsenal Protocol',     cat: 'ENEMY',   cost: 2, desc: 'Endless elites gain stronger projectile pressure.' },
  { id: 'blood_path',           name: 'Blood Path Protocol',        cat: 'ENEMY',   cost: 3, desc: 'Boss corruption trails hit harder & linger longer.' },
  { id: 'predator_aim',         name: 'Predator Aim Protocol',      cat: 'ENEMY',   cost: 2, desc: 'Enemy & boss aim improves (still dodgeable).' },
  { id: 'armored_swarm',        name: 'Armored Swarm Protocol',     cat: 'ENEMY',   cost: 2, desc: 'Endless enemy HP scaling is slightly tougher.' },
  { id: 'lightning_plus',       name: 'Lightning Storm+',           cat: 'WEATHER', cost: 2, desc: 'Lightning Storm lasts longer.' },
  { id: 'lava_plus',            name: 'Lava Rain+',                 cat: 'WEATHER', cost: 2, desc: 'Lava Rain lasts longer.' },
  { id: 'airstrike_plus',       name: 'Airstrike+',                 cat: 'WEATHER', cost: 2, desc: 'Airstrike fires a larger salvo (fair aim kept).' },
  { id: 'frozen_sleet',         name: 'Frozen Sleet Storm+',        cat: 'WEATHER', cost: 2, desc: 'Frozen Sleet Storm holds you frozen ~2s longer.' },
  { id: 'elemental_mastery',    name: 'Elemental Mastery',          cat: 'PLAYER',  cost: 3, desc: 'Stronger elemental bursts (boss-capped).' },
  { id: 'fusion_mastery',       name: 'Fusion Mastery',             cat: 'PLAYER',  cost: 4, desc: 'Stronger fusion damage & radius (boss-capped).' },
  { id: 'ult_infusion_mastery', name: 'Ult Infusion Mastery',       cat: 'PLAYER',  cost: 4, desc: 'Bigger Forbidden Ultimate Infusion nova.' },
  { id: 'synergy_mastery',      name: 'Character Synergy Mastery',  cat: 'PLAYER',  cost: 3, desc: 'Stronger synergy bursts (boss-capped).' },
  { id: 'phoenix_revival',      name: 'Phoenix Revival Protocol',   cat: 'PLAYER',  cost: 5, desc: '+1 Phoenix revive per run with massive HP/mana recovery.', icon: 'assets/ui/protocols/phoenix_revival_protocol.png' },
];
export const PROTOCOL_CARD_BY_ID = Object.fromEntries(PROTOCOL_CARDS.map(c => [c.id, c]));


// ─── Null Relics V1 ─────────────────────────────────────────────────────────
export const RELIC_DEFS = [
  { id:'eden_core_fragment',   name:'Eden Core Fragment',   type:'universal',  cost:5,
    effect:'Every boss kill this run grants +15 bonus XP.',
    req:null, reqChar:null },
  { id:'null_battery',         name:'Null Battery',         type:'universal',  cost:4,
    effect:'Q and E ability cooldowns recharge 8% faster.',
    req:null, reqChar:null },
  { id:'broken_halo',          name:'Broken Halo',          type:'universal',  cost:5,
    effect:'Once per run, death is refused: revive at 25% HP with brief invulnerability.',
    req:null, reqChar:null },
  { id:'blacknet_coupon',      name:'Blacknet Coupon',      type:'universal',  cost:4,
    effect:'First level-up screen each run grants 1 extra reroll.',
    req:null, reqChar:null },
  { id:'null_riff_capacitor',  name:'Null Riff Capacitor',  type:'universal',  cost:6,
    effect:'Eddie: dash note clouds last 3.2s and tick for 12. Solo Red Thunder bolts +10% damage.',
    req:null, reqChar:'eddie' },
  { id:'serpent_ember_coil',   name:'Serpent Ember Coil',   type:'boss',       cost:6,
    effect:'Dash leaves a 1.5s ember trail. Enemies touching it take burn damage.',
    req:'cyberSerpent', reqChar:null },
  { id:'dragon_cryo_heart',    name:'Dragon Cryo Heart',    type:'boss',       cost:8,
    effect:'Every 30s, your next hit calls a cryo shard on the target.',
    req:'cyberDragon', reqChar:null },
  { id:'oni_blood_circuit',    name:'Oni Blood Circuit',    type:'character',  cost:6,
    effect:'When Oni uses Ultimate, nearby enemies are marked for 5s: +15% damage.',
    req:null, reqChar:'oni_cataclysm_protocol' },
  { id:'crescent_soul_bead',   name:'Crescent Soul Bead',   type:'character',  cost:6,
    effect:'Every 7th Spirit Kick pierces +2 extra enemies and creates a shockwave.',
    req:null, reqChar:'taekwondo_girl' },
  { id:'null_venom_chamber',   name:'Null Venom Chamber',   type:'character',  cost:7,
    effect:'When you take a hit, release a poison cloud that damages nearby enemies over time.',
    req:null, reqChar:'euclid_vector' },
  { id:'mirror_kill_protocol', name:'Mirror Kill Protocol', type:'character',  cost:8,
    effect:'When a clone expires, it releases a shadow slash. 3+ hits refunds 20 mana.',
    req:null, reqChar:'assassin_clone' },
  // ─── Arena-Specific Relics (NULL BREACH ARENA) ───────────────────────────
  { id:'breach_crown',       name:'Breach Crown',       type:'arena',     cost:7,
    effect:'Complete NULL BREACH ARENA without EDEN CORE rescue: gain +0.5 Pulse Damage for the rest of the run.',
    req:'null_breach_cleared', reqChar:null },
  { id:'second_signal_debt', name:'Second Signal Debt', type:'arena',     cost:5,
    effect:'If EDEN CORE rescues you inside NULL BREACH ARENA: gain a 6-second protective shield on extraction.',
    req:'arena_rescue_used',   reqChar:null },
  { id:'elite_signal_core',  name:'Elite Signal Core',  type:'arena',     cost:6,
    effect:'Arena elite kills pay +30 bonus score each.',
    req:'arena_elite_3',       reqChar:null },
];

export class MetaProgress {
  constructor() {
    this.credits = 0;
    this.levels  = {};
    this.unlocks = {};
    // Personal Endless-mode records — kept SEPARATE from Act 1 / global high score.
    // { time: seconds survived, score: best score, level: highest player level }.
    this.endlessRecords = { time: 0, score: 0, level: 0 };
    this.bestEddieTime = 0;   // longest survival AS EDDIE (seconds) — progressively unlocks OST jukebox tracks
    // Endless achievement flags: { [id]: true } once earned. Persisted alongside records.
    this.achievements = {};
    // Equipped outfit per character: { [characterId]: 'default' | 'secret' }. Stored SEPARATELY
    // from `unlocks` (which gates availability). Cosmetic selection only.
    this.selectedOutfits = {};
    // Endless Mode access flag. Set true the first time the player enters Endless (Continue —
    // Endless after an Act 1 victory). Once set, the Main Menu shows a direct ENDLESS MODE entry
    // so the player never has to replay Act 1. Persisted; fresh saves start false (locked).
    this.endlessUnlocked = false;
    // ─── Protocol Fragments (Phase 1) — SEPARATE from Grid Credits (this.credits) ───
    this.protocolFragments = 0;   // current PF balance
    this.pfEarnedFrom      = {};  // { [achievementId]: true } — idempotent payout ledger
    this.protocolUnlocks   = {};  // { [characterId]: true }   — PF-purchased character unlocks
    this.protocolCards     = {};  // { [cardId]: true }        — PF-purchased permanent Protocol cards
    this.profileName       = null;// optional custom player profile name (fallback 'PLAYER_01' in UI)
    this.relics       = {};  // { [relicId]: true }  — purchased relics
    this.bossKills    = {};  // { [bossKey]: true }  — required boss kills for boss relics
    this.runHistory   = [];  // last 20 runs { time, score, level, char, mode, date }
    // ── Eden Core narrative system ──────────────────────────────────────────
    this.edenMemoryPercent  = 0;   // 0–100, persisted
    this.systemFeedMessages = [];  // last 8 { text, ts } entries, newest first
    this.bossEchoes         = {};  // { [bossKey]: true } first-time echo archives
    this.edenMilestonesSeen = {};  // { [threshold]: true } milestone one-fire guard
    this.systemLogsSeen    = {};  // { [threshold]: true } system log one-fire feed guard
    this.chaosRanks    = {};  // Phase B: { [charId]: { bestSecs, bestRank } } — Chaos Survival Rank per character
    // ── Vessel system ──────────────────────────────────────────────────────
    this.selectedVessel   = 'alpha_phoenix';   // currently equipped vessel id
    this.unlockedVessels  = { alpha_phoenix: true };  // { [vesselId]: true }
    // ── Cyber-Pet system ────────────────────────────────────────────────
    this.selectedPets    = ['byte_mite'];       // equipped pet ids (1-2 slots)
    this.unlockedPets    = { byte_mite: true }; // { [petId]: true }
    this.petSlots        = 1;                   // max pet slots (1 default, 2nd unlockable)
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem('phenix_meta');
      if (!raw) return;
      const d = JSON.parse(raw);
      this.credits = Number(d.credits) || 0;
      this.levels  = d.levels || {};
      this.unlocks = d.unlocks || {};
      const er = d.endlessRecords || {};
      this.endlessRecords = {
        time:  Number(er.time)  || 0,
        score: Number(er.score) || 0,
        level: Number(er.level) || 0,
      };
      this.bestEddieTime = Number(d.bestEddieTime) || 0;   // longest Eddie survival (unlocks OST jukebox tracks)
      this.achievements = d.achievements || {};
      this.selectedOutfits = d.selectedOutfits || {};
      this.endlessUnlocked = d.endlessUnlocked === true;
      // Protocol Fragments — corruption-safe defaults (Number||0 / object-or-{}).
      this.protocolFragments = Number(d.protocolFragments) || 0;
      this.pfEarnedFrom    = (d.pfEarnedFrom    && typeof d.pfEarnedFrom    === 'object') ? d.pfEarnedFrom    : {};
      this.protocolUnlocks = (d.protocolUnlocks && typeof d.protocolUnlocks === 'object') ? d.protocolUnlocks : {};
      this.protocolCards   = (d.protocolCards   && typeof d.protocolCards   === 'object') ? d.protocolCards   : {};
      this.profileName     = (typeof d.profileName === 'string' && d.profileName.trim()) ? d.profileName.slice(0, 16) : null;
      this.relics      = (d.relics     && typeof d.relics    === 'object') ? d.relics    : {};
      this.bossKills   = (d.bossKills  && typeof d.bossKills === 'object') ? d.bossKills : {};
      this.runHistory  = Array.isArray(d.runHistory) ? d.runHistory.slice(-20) : [];
      // Eden Core — safe defaults for old saves
      this.edenMemoryPercent  = Math.min(100, Math.max(0, Number(d.edenMemoryPercent) || 0));
      this.systemFeedMessages = Array.isArray(d.systemFeedMessages) ? d.systemFeedMessages.slice(0, 8) : [];
      this.bossEchoes         = (d.bossEchoes && typeof d.bossEchoes === 'object') ? d.bossEchoes : {};
      this.edenMilestonesSeen = (d.edenMilestonesSeen && typeof d.edenMilestonesSeen === 'object') ? d.edenMilestonesSeen : {};
      this.systemLogsSeen    = (d.systemLogsSeen    && typeof d.systemLogsSeen    === 'object') ? d.systemLogsSeen    : {};
      this.chaosRanks    = (d.chaosRanks    && typeof d.chaosRanks    === 'object') ? d.chaosRanks    : {}; // Phase B
      // Vessel system — safe defaults for old saves (alpha_phoenix always unlocked)
      this.selectedVessel  = (typeof d.selectedVessel === 'string' && d.selectedVessel) ? d.selectedVessel : 'alpha_phoenix';
      this.unlockedVessels = (d.unlockedVessels && typeof d.unlockedVessels === 'object') ? d.unlockedVessels : { alpha_phoenix: true };
      if (!this.unlockedVessels.alpha_phoenix) this.unlockedVessels.alpha_phoenix = true; // always available
      // Cyber-Pet system — safe defaults for old saves (byte_mite always unlocked)
      this.selectedPets  = Array.isArray(d.selectedPets) ? d.selectedPets : ['byte_mite'];
      this.unlockedPets  = (d.unlockedPets && typeof d.unlockedPets === 'object') ? d.unlockedPets : { byte_mite: true };
      this.petSlots      = Math.max(1, Math.min(2, Number(d.petSlots) || 1));
      if (!this.unlockedPets.byte_mite) this.unlockedPets.byte_mite = true;
      // One-time retroactive payout for already-earned Endless achievements (idempotent).
      this._backfillProtocolFragments();

      // ── Backfill migration ──────────────────────────────────────────────────
      // Saves from before the endlessUnlocked flag existed have no such field. If the
      // save carries any proof the player already reached/played Endless, unlock it and
      // persist — so returning players see ENDLESS MODE without replaying Act 1. A truly
      // fresh save has none of these markers, so it stays locked.
      if (!this.endlessUnlocked && this._hasEndlessHistory()) {
        this.endlessUnlocked = true;
        this._save();
      }

      // Backfill brawler_warrior character unlock for saves that earned it before
      // the unlock flag existed (threshold: survived 10:00+ in Endless mode = 600s).
      if (!this.isUnlocked('brawler_warrior')) {
        const er = this.endlessRecords || {};
        if ((er.time || 0) >= 600) {
          this.unlocks['brawler_warrior'] = true;
          this._save();
        }
      }

      // Force-lock secret skins the player never requested (Euclid TOXIC OVERLOAD,
      // Phasewalker NULL WALKER, Oni CRIMSON PROTOCOL) — keep these slots locked/empty.
      let _relockedSecret = false;
      for (const _k of ['toxic_overload', 'null_walker', 'crimson_oni']) {
        if (this.unlocks[_k]) { delete this.unlocks[_k]; _relockedSecret = true; }
      }
      if (_relockedSecret) this._save();
    } catch (_) {}
  }

  // True if the loaded save shows any Endless activity: any Endless achievement earned, any
  // Endless personal record set, or an Endless-only secret unlock (log_1997 Brawler skin /
  // log_1998 / the Brawler Warrior unlock earned at 10:00 Endless).
  _hasEndlessHistory() {
    if (this.achievements && Object.keys(this.achievements).length > 0) return true;
    const r = this.endlessRecords || {};
    if ((r.time || 0) > 0 || (r.score || 0) > 0 || (r.level || 0) > 0) return true;
    if (this.isUnlocked('log_1997') || this.isUnlocked('log_1998') || this.isUnlocked('brawler_warrior')) return true;
    return false;
  }

  _save() {
    try {
      localStorage.setItem('phenix_meta', JSON.stringify({
        credits: this.credits,
        levels:  this.levels,
        unlocks: this.unlocks,
        endlessRecords: this.endlessRecords,
        bestEddieTime: this.bestEddieTime,
        achievements: this.achievements,
        selectedOutfits: this.selectedOutfits,
        endlessUnlocked: this.endlessUnlocked,
        protocolFragments: this.protocolFragments,
        pfEarnedFrom: this.pfEarnedFrom,
        protocolUnlocks: this.protocolUnlocks,
        protocolCards: this.protocolCards,
        profileName: this.profileName,
        relics:    this.relics,
        bossKills: this.bossKills,
        runHistory: this.runHistory,
        edenMemoryPercent:  this.edenMemoryPercent,
        systemFeedMessages: this.systemFeedMessages,
        bossEchoes:         this.bossEchoes,
        edenMilestonesSeen: this.edenMilestonesSeen,
        systemLogsSeen:     this.systemLogsSeen,
        chaosRanks:         this.chaosRanks,           // Phase B: Chaos Survival Rank per character
        selectedVessel:     this.selectedVessel,
        unlockedVessels:    this.unlockedVessels,
        selectedPets:       this.selectedPets,
        unlockedPets:       this.unlockedPets,
        petSlots:           this.petSlots,
      }));
    } catch (_) {}
  }

  // ── OST Jukebox unlock: longest survival AS EDDIE (seconds) ──
  getBestEddieTime() { return this.bestEddieTime || 0; }
  recordEddieTime(seconds) {
    const t = Number(seconds) || 0;
    if (t > (this.bestEddieTime || 0)) { this.bestEddieTime = t; this._save(); return true; }
    return false;
  }

  // Submit a finished Endless run. Updates any beaten personal records and persists.
  // Returns per-record flags { time, score, level } marking which records this run set,
  // so the end screen can show ★ NEW BEST. Compares against the PRIOR bests.
  submitEndlessRun(run) {
    const r = this.endlessRecords;
    const beat = {
      time:  (run.time  || 0) > (r.time  || 0),
      score: (run.score || 0) > (r.score || 0),
      level: (run.level || 0) > (r.level || 0),
    };
    if (beat.time)  r.time  = Math.floor(run.time  || 0);
    if (beat.score) r.score = Math.floor(run.score || 0);
    if (beat.level) r.level = Math.floor(run.level || 0);
    if (beat.time || beat.score || beat.level) this._save();
    return beat;
  }

  // Phase B — Chaos Survival Rank persistence.
  // Records the best Chaos survival time per character; safe to call with any secs value.
  submitChaosRun(charId, secs) {
    if (!charId || typeof secs !== 'number' || secs <= 0) return;
    const cur = this.chaosRanks[charId] || { bestSecs: 0, bestRank: 'BRONZE' };
    if (secs > cur.bestSecs) {
      const mins = Math.floor(secs / 60);
      this.chaosRanks[charId] = {
        bestSecs: secs,
        bestRank: mins >= 30 ? 'PLATINUM' : mins >= 20 ? 'GOLD' : mins >= 10 ? 'SILVER' : 'BRONZE',
      };
      this._save();
    }
  }

  // Evaluate Endless achievements against a finished-run stats snapshot
  // { time, level, score, combo, cores }. Marks newly-earned ones, persists once,
  // and returns ONLY the newly-earned [{ id, name }] (already-earned ones are skipped),
  // so the end screen shows just what was unlocked this run.
  unlockEndlessAchievements(stats) {
    const newly = [];
    for (const a of ENDLESS_ACHIEVEMENTS) {
      if (this.achievements[a.id]) continue;          // already earned — don't re-report
      let earned = false;
      try { earned = !!a.test(stats); } catch (_) {}  // a bad predicate must never break game-over
      if (earned) {
        this.achievements[a.id] = true;
        newly.push({ id: a.id, name: a.name });
      }
    }
    if (newly.length) { this._backfillProtocolFragments(); this._save(); }   // pay PF for newly-earned (idempotent)
    return newly;
  }

  // ─── Protocol Fragments (PF) ────────────────────────────────────────────────
  // One-time retroactive/idempotent payout: for every EARNED Endless achievement not yet paid,
  // add its PF and record it in pfEarnedFrom so a reload never double-pays. Safe for fresh saves
  // (no achievements → no payout) and corrupted ledgers (treated as empty). Persists if changed.
  _backfillProtocolFragments() {
    let changed = false;
    for (const a of ENDLESS_ACHIEVEMENTS) {
      if (this.achievements[a.id] && !this.pfEarnedFrom[a.id]) {
        const pay = PF_PAYOUTS[a.id] || 0;
        if (pay > 0) { this.protocolFragments += pay; this.pfEarnedFrom[a.id] = true; changed = true; }
      }
    }
    if (changed) this._save();
    return changed;
  }

  getProtocolFragments() { return this.protocolFragments; }

  // LIFETIME PF earned (sum of payouts for every achievement in the idempotent ledger). Unlike the
  // spendable balance, this never decreases when PF is spent — so the "X / 19" progression display
  // stays honest after unlocking a character. Falls back to balance if the ledger is empty/legacy.
  getProtocolFragmentsEarned() {
    let earned = 0;
    for (const id in this.pfEarnedFrom) if (this.pfEarnedFrom[id]) earned += (PF_PAYOUTS[id] || 0);
    return Math.max(earned, this.protocolFragments);
  }

  // Menu-only player progression. Derived from existing save data so old saves keep working
  // and PF/relic/achievement balances are not migrated or re-awarded.
  getPlayerProgression() {
    const pfEarned = Math.max(0, Math.floor(this.getProtocolFragmentsEarned() || 0));
    const achievementCount = this.achievements ? Object.keys(this.achievements).filter((id) => this.achievements[id]).length : 0;
    const records = this.endlessRecords || {};
    const bestLevel = Math.max(0, Math.floor(records.level || 0));
    const bestMinutes = Math.max(0, Math.floor((records.time || 0) / 60));
    const points = Math.max(pfEarned, achievementCount, bestLevel, bestMinutes);
    const level = Math.max(1, points);
    const step = 5;
    const next = Math.max(step, Math.ceil((level + 1) / step) * step);
    const progress = Math.max(0, Math.min(0.98, level / next));
    const rank = this._rankForPlayerLevel(level, achievementCount);
    return {
      level,
      rank,
      current: level,
      next,
      progress,
      label: `${level} / ${next} TO NEXT LEVEL`,
    };
  }

  _rankForPlayerLevel(level, achievementCount) {
    const allAchievements = ENDLESS_ACHIEVEMENTS.length > 0 && achievementCount >= ENDLESS_ACHIEVEMENTS.length;
    if (level >= 50) return 'NULL EDEN LEGEND';
    if (level >= 40) return 'RELIC HUNTER';
    if (level >= 30) return 'BOSS SLAYER';
    if (allAchievements || level >= Math.max(20, PF_TOTAL_OBTAINABLE)) return 'GRID MASTER';
    if (level >= 14) return 'OVERRIDE';
    if (level >= 7) return 'OPERATIVE';
    return 'ROOKIE';
  }

  // PF-based future-character unlocks (separate from Grid Credits / secret-skin unlocks).
  protocolUnlockCost(characterId) { return PF_CHARACTER_COSTS[characterId] || 0; }
  isProtocolUnlocked(characterId) { return this.protocolUnlocks[characterId] === true; }
  canAffordProtocolUnlock(characterId) {
    const cost = this.protocolUnlockCost(characterId);
    return cost > 0 && !this.isProtocolUnlocked(characterId) && this.protocolFragments >= cost;
  }

  // Spend PF to unlock a character. Returns 'ok' | 'owned' | 'invalid' | 'poor'. Idempotent:
  // an already-owned character is never re-charged.
  tryUnlockCharacterWithPF(characterId) {
    if (this.isProtocolUnlocked(characterId)) return 'owned';
    const cost = this.protocolUnlockCost(characterId);
    if (cost <= 0) return 'invalid';
    if (this.protocolFragments < cost) return 'poor';
    this.protocolFragments -= cost;
    this.protocolUnlocks[characterId] = true;
    this._save();
    return 'ok';
  }

  getLevel(key) { return Number(this.levels[key]) || 0; }

  addCredits(n) { this.credits += n; this._save(); }

  // ─── Secret unlocks ─────────────────────────────────────────────────────────
  isUnlocked(key) { return this.unlocks[key] === true; }

  unlock(key) {
    if (this.unlocks[key] === true) return;
    this.unlocks[key] = true;
    this._save();
  }

  // Unlock several flags and persist once (used by the Victory screen).
  unlockMany(keys) {
    let changed = false;
    for (const k of keys) {
      if (this.unlocks[k] !== true) { this.unlocks[k] = true; changed = true; }
    }
    if (changed) this._save();
  }

  tryBuy(upg) {
    const lvl  = this.getLevel(upg.key);
    const cost = upgradeCost(upg, lvl);
    if (lvl >= upg.maxLevel)  return 'max';
    if (this.credits < cost)  return 'poor';
    this.credits -= cost;
    this.levels[upg.key] = lvl + 1;
    this._save();
    return 'ok';
  }

  // ─── Respec (Upgrades screen RESET PROTOCOL) ───────────────────────────────────────
  // Total Grid Cores spent on levelled upgrades (CORE + ★ SYNERGY tabs), recomputed
  // from current levels and the live cost tables, so the confirmation dialog always
  // shows exactly what respec() will pay back.
  getRespecRefund() {
    let total = 0;
    for (const upg of [...META_UPGRADES, ...SYNERGY_UPGRADES]) {
      const lvl = Math.min(this.getLevel(upg.key), upg.maxLevel);
      for (let i = 0; i < lvl; i++) total += upgradeCost(upg, i);
    }
    return total;
  }

  // Reset ALL upgrade levels and refund 100% of the Grid Cores spent on them.
  // Touches ONLY credits + levels — character unlocks, Protocol Fragments, relics,
  // records, achievements and Eden state are never affected.
  respec() {
    this.credits += this.getRespecRefund();
    this.levels = {};
    this._save();
  }

  reset() {
    this.credits = 0;
    this.levels  = {};
    this.unlocks = {};
    this.endlessRecords = { time: 0, score: 0, level: 0 };
    this.achievements   = {};
    this.selectedOutfits = {};
    this.endlessUnlocked = false;
    this.protocolFragments = 0;
    this.pfEarnedFrom      = {};
    this.protocolUnlocks   = {};
    this.protocolCards     = {};
    this.selectedVessel   = 'alpha_phoenix';
    this.unlockedVessels  = { alpha_phoenix: true };
    this.selectedPets     = ['byte_mite'];
    this.unlockedPets     = { byte_mite: true };
    this.petSlots         = 1;
    this.relics    = {};
    this.bossKills = {};
    this.runHistory = [];
    this.edenMemoryPercent  = 0;
    this.systemFeedMessages = [];
    this.bossEchoes         = {};
    this._save();
  }

  // Custom profile name (optional; UI falls back to 'PLAYER_01'). Capped + persisted.
  getProfileName() { return this.profileName; }
  setProfileName(n) { this.profileName = (typeof n === 'string' && n.trim()) ? n.trim().slice(0, 16) : null; this._save(); }

  // ─── Protocol Fragment unlock cards (permanent meta-upgrades) ────────────────
  hasProtocolCard(id) { return this.protocolCards[id] === true; }

  // Spend spendable PF on a permanent Protocol card. Returns 'ok' | 'owned' | 'soon' | 'invalid' | 'poor'.
  // Idempotent (owned cards never re-charge); deducts the spendable balance once. Lifetime-earned PF
  // (getProtocolFragmentsEarned) is unaffected, so progress never regresses on the menu.
  tryBuyProtocolCard(id) {
    const card = PROTOCOL_CARD_BY_ID[id];
    if (!card)                       return 'invalid';
    if (card.comingSoon)             return 'soon';
    if (this.protocolCards[id])      return 'owned';
    if (this.protocolFragments < card.cost) return 'poor';
    this.protocolFragments -= card.cost;
    this.protocolCards[id]  = true;
    this._save();
    return 'ok';
  }

  // ─── Endless Mode access ────────────────────────────────────────────────────
  // True once the player has entered Endless at least once. Read by the Main Menu to
  // show/hide the ENDLESS MODE entry. Never gates achievements/outfits/balance.
  isEndlessUnlocked() { return this.endlessUnlocked === true; }

  unlockEndless() {
    if (this.endlessUnlocked === true) return;
    this.endlessUnlocked = true;
    this._save();
  }

  // ─── Secret outfit equip system ─────────────────────────────────────────────
  // Display/equip helpers. Default is always available; secret reuses the existing
  // Easter-Egg unlock flag. Cosmetic only — never affects stats/balance.
  isOutfitUnlocked(characterId, outfitId) {
    if (outfitId === 'default') return true;
    const o = CHARACTER_OUTFITS[characterId]?.[outfitId];
    if (!o) return false;
    if (!o.unlockKey) return true;
    return this.isUnlocked(o.unlockKey);
  }

  // The equipped outfit for a character — falls back to 'default' if none chosen, an
  // unknown id, or a secret that is no longer unlocked (defensive).
  getSelectedOutfit(characterId) {
    const sel = this.selectedOutfits[characterId];
    if (sel && sel !== 'default' && this.isOutfitUnlocked(characterId, sel)) return sel;
    return 'default';
  }

  // Equip an outfit. No-op + false if the outfit is locked/unknown; persists on success.
  setSelectedOutfit(characterId, outfitId) {
    if (!CHARACTER_OUTFITS[characterId]) return false;
    if (!this.isOutfitUnlocked(characterId, outfitId)) return false;
    this.selectedOutfits[characterId] = outfitId;
    this._save();
    return true;
  }

  // True once an Endless achievement is earned. Achievement Protocols + Achievement Cards
  // derive their active state directly from this flag, so existing saves light up with no
  // migration. Read-only; never mutates state.
  hasAchievement(id) { return !!this.achievements[id]; }

  // Character unlock gate. The 3 base characters are always available; Brawler Warrior is
  // unlocked by reaching 10:00 in Endless (flag set via unlock('brawler_warrior')).
  isCharacterUnlocked(characterId) {
    if (characterId === 'brawler_warrior') return this.isUnlocked('brawler_warrior');
    // Any PF-gated Endless character (japan_phasewalker / euclid_vector / oni_cataclysm_protocol)
    // is locked until purchased with Protocol Fragments — NO free default unlock. Future characters
    // added to PF_CHARACTER_COSTS are automatically gated the same way.
    if (PF_CHARACTER_COSTS[characterId]) return this.isProtocolUnlocked(characterId);
    return true;
  }

  // Resolve the sprite asset for a character+outfit (always returns a valid path).
  getOutfitAsset(characterId, outfitId) {
    const c = CHARACTER_OUTFITS[characterId];
    if (!c) return `assets/characters/${characterId}.png`;
    return (c[outfitId] || c.default).asset;
  }
  // ─── Relic helpers ───────────────────────────────────────────────────────────
  isRelicUnlocked(id)  { return this.relics[id] === true; }
  recordBossKill(id)   { if (!this.bossKills[id]) { this.bossKills[id] = true; this._save(); } }
  hasBossKill(id)      { return this.bossKills[id] === true; }

  tryUnlockRelic(id) {
    const def = RELIC_DEFS.find(r => r.id === id);
    if (!def)                                  return 'invalid';
    if (this.relics[id])                       return 'owned';
    if (def.req && !this.bossKills[def.req])   return 'req';
    if (this.protocolFragments < def.cost)     return 'poor';
    this.protocolFragments -= def.cost;
    this.relics[id] = true;
    this._save();
    return 'ok';
  }

  // ─── Run history ─────────────────────────────────────────────────────────────
  // Records { time, score, level, char, mode, date } (up to 20, newest first)
  recordRun(entry) {
    this.runHistory.unshift({
      time:  Math.floor(entry.time  || 0),
      score: Math.floor(entry.score || 0),
      level: Math.floor(entry.level || 0),
      char:  entry.char  || 'Unknown',
      mode:  entry.mode  || 'Act 1',
      date:  new Date().toLocaleDateString(),
    });
    if (this.runHistory.length > 20) this.runHistory.length = 20;
    this._save();
  }
  getRunHistory() { return this.runHistory || []; }

  // ─── Eden Core narrative methods ────────────────────────────────────────────
  getEdenMemory()  { return Math.min(100, Math.max(0, this.edenMemoryPercent || 0)); }

  addEdenMemory(amount) {
    if (!amount || amount <= 0) return;
    this.edenMemoryPercent = Math.min(100, (this.edenMemoryPercent || 0) + amount);
    this._save();
  }

  // Add Protocol Fragments (e.g. Null Fragment from arena clear). Safe — clamps negative to 0.
  addProtocolFragment(n) {
    if (!n || n <= 0) return;
    this.protocolFragments = Math.max(0, (this.protocolFragments || 0) + n);
    this._save();
  }

  addSystemMessage(text) {
    if (!text) return;
    if (!Array.isArray(this.systemFeedMessages)) this.systemFeedMessages = [];
    // Deduplicate — don't store same message twice in a row
    if (this.systemFeedMessages.length > 0 && this.systemFeedMessages[0].text === text) return;
    this.systemFeedMessages.unshift({ text, ts: Date.now() });
    if (this.systemFeedMessages.length > 8) this.systemFeedMessages.length = 8;
    this._save();
  }

  getSystemFeed() {
    if (!Array.isArray(this.systemFeedMessages)) return [];
    return this.systemFeedMessages.slice(0, 5);
  }

  recordBossEcho(id) {
    if (!this.bossEchoes) this.bossEchoes = {};
    if (!this.bossEchoes[id]) { this.bossEchoes[id] = true; this._save(); return true; }
    return false; // already archived
  }

  hasBossEcho(id) { return !!(this.bossEchoes && this.bossEchoes[id]); }

  // Returns true the FIRST time this threshold is crossed, false on repeats.
  checkAndRecordMilestone(threshold) {
    if (!this.edenMilestonesSeen) this.edenMilestonesSeen = {};
    if (this.edenMilestonesSeen[threshold]) return false;
    if (this.getEdenMemory() >= threshold) {
      this.edenMilestonesSeen[threshold] = true;
      this._save();
      return true;
    }
    return false;
  }

  hasMilestone(threshold) { return !!(this.edenMilestonesSeen && this.edenMilestonesSeen[threshold]); }

  // One-fire guard: returns true the first time Eden Memory >= threshold.
  // Subsequent calls return false. Safe with old saves (defaults to {}).
  checkAndRecordSystemLog(threshold) {
    if (!this.systemLogsSeen) this.systemLogsSeen = {};
    if (this.systemLogsSeen[threshold]) return false;
    if (this.getEdenMemory() < threshold) return false;
    this.systemLogsSeen[threshold] = true;
    this._save();
    return true;
  }
  hasSystemLog(threshold) { return !!(this.systemLogsSeen && this.systemLogsSeen[threshold]); }

  // ─── Vessel system ─────────────────────────────────────────────────────────
  isVesselUnlocked(id) { return this.unlockedVessels[id] === true; }

  getSelectedVessel() { return this.selectedVessel || 'alpha_phoenix'; }

  selectVessel(id) {
    if (!this.isVesselUnlocked(id)) return false;
    this.selectedVessel = id;
    this._save();
    return true;
  }

  // Purchase a vessel. Deducts Grids + Fragments. Returns 'ok'|'owned'|'poor'.
  /** Direct condition-based vessel unlock (e.g. Glitch Phantom survival condition). */
  unlockVessel(id) {
    if (this.unlockedVessels[id]) return false;
    this.unlockedVessels[id] = true;
    this._save();
    return true;
  }

  tryBuyVessel(id, costGrids, costFragments) {
    if (this.isVesselUnlocked(id)) return 'owned';
    if (this.credits < costGrids || this.protocolFragments < costFragments) return 'poor';
    this.credits -= costGrids;
    this.protocolFragments -= costFragments;
    this.unlockedVessels[id] = true;
    this._save();
    return 'ok';
  }

  // ─── Cyber-Pet system ─────────────────────────────────────────────────────
  isPetUnlocked(id) { return this.unlockedPets[id] === true; }
  getSelectedPets() { return (this.selectedPets || ['byte_mite']).slice(0, this.petSlots || 1); }
  getPetSlots() { return this.petSlots || 1; }

  selectPet(slotIndex, petId) {
    if (!this.isPetUnlocked(petId)) return false;
    if (slotIndex < 0 || slotIndex >= this.petSlots) return false;
    if (!Array.isArray(this.selectedPets)) this.selectedPets = [];
    // Prevent duplicate: if pet is in another slot, swap
    const existingIdx = this.selectedPets.indexOf(petId);
    if (existingIdx >= 0 && existingIdx !== slotIndex) {
      this.selectedPets[existingIdx] = this.selectedPets[slotIndex] || null;
    }
    this.selectedPets[slotIndex] = petId;
    // Clean up nulls at end
    while (this.selectedPets.length > this.petSlots) this.selectedPets.pop();
    this._save();
    return true;
  }

  deselectPet(slotIndex) {
    if (!Array.isArray(this.selectedPets)) return;
    if (slotIndex >= 0 && slotIndex < this.selectedPets.length) {
      this.selectedPets.splice(slotIndex, 1);
      this._save();
    }
  }

  // Unlock 2nd pet slot. Costs Fragments. Returns 'ok'|'owned'|'poor'.
  tryUnlockPetSlot() {
    if (this.petSlots >= 2) return 'owned';
    const cost = 6; // 6 Protocol Fragments for 2nd slot
    if (this.protocolFragments < cost) return 'poor';
    this.protocolFragments -= cost;
    this.petSlots = 2;
    this._save();
    return 'ok';
  }

  // Purchase a pet. Returns 'ok'|'owned'|'poor'.
  tryBuyPet(id, costGrids, costFragments) {
    if (this.isPetUnlocked(id)) return 'owned';
    if (this.credits < costGrids || this.protocolFragments < costFragments) return 'poor';
    this.credits -= costGrids;
    this.protocolFragments -= costFragments;
    this.unlockedPets[id] = true;
    this._save();
    return 'ok';
  }

}