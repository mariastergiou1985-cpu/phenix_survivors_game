export const META_UPGRADES = [
  { key: 'maxHp',        name: 'Max HP',        desc: '+10 max HP per level',              maxLevel: 5, baseCost: 10 },
  { key: 'moveSpeed',    name: 'Move Speed',     desc: '+5% movement speed per level',       maxLevel: 5, baseCost: 10 },
  { key: 'coreMagnet',   name: 'Core Magnet',    desc: '+10% pickup radius per level',       maxLevel: 5, baseCost: 10 },
  { key: 'coreCapacity', name: 'Core Capacity',  desc: '+1 carry slot per level',            maxLevel: 3, baseCost: 20 },
  { key: 'pulseDamage',  name: 'Pulse Damage',   desc: '+1 projectile damage per level',     maxLevel: 5, baseCost: 10 },
  { key: 'firewall',     name: 'Firewall',       desc: '-5% Network Overload per level',     maxLevel: 5, baseCost: 10 },
  // ── Upgrade Economy phase additions (save-compatible: unknown keys default to level 0) ──
  { key: 'combatCalibration', name: 'Combat Calibration', desc: '+0.5 shot damage per level',        maxLevel: 5, baseCost: 12 },
  { key: 'armorPlating',      name: 'Armor Plating',      desc: '-3% contact damage per level',       maxLevel: 5, baseCost: 12 },
  { key: 'manaCapacitor',     name: 'Mana Capacitor',     desc: '+10 max mana per level',             maxLevel: 5, baseCost: 12 },
  { key: 'xpUplink',          name: 'XP Uplink',          desc: '+5% XP gain per level',              maxLevel: 5, baseCost: 12 },
  { key: 'cacheScanner',      name: 'Cache Scanner',      desc: '+5% Endless cache bonus / level',    maxLevel: 5, baseCost: 12 },
];

// Explicit per-level cost curves (steeper sink so a single run can't max everything).
const COST_5 = [25, 50, 90, 140, 220];  // 5-level upgrades
const COST_3 = [35, 90, 180];           // 3-level upgrades (e.g. Core Capacity)

export function upgradeCost(upg, level) {
  const table = upg.maxLevel <= 3 ? COST_3 : COST_5;
  return table[Math.min(level, table.length - 1)];
}

// Secret unlock flags — set on a victory, persisted in localStorage, read by the
// Victory screen and Character Select. Additive: never gates existing progression.
export const UNLOCK_KEYS = [
  'log_1985',
  'log_1983',
  'golden_skeleton_warrior',
  'dark_cyber_arm_hero',
  'grandmaster_dojang_girl',
  'log_1997',   // Endless-only LOG that unlocks the Brawler Warrior secret outfit
  'log_2007',   // Assassin Clone secret outfit (LOG #2007). Reserved key — stays LOCKED in Phase 1
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
  // Assassin Clone secret outfit — LOG #2007 (Phantom Assassin). Gated on the log_2007 flag,
  // which has no in-game grant in Phase 1, so it stays LOCKED (preview only). A future Chaos
  // Mode / Assassin condition may set log_2007.
  assassin_clone: {
    default: { name: 'Default', asset: 'assets/characters/assassin_clone.png' },
    secret:  { name: 'LOG #2007 — Phantom Assassin', asset: 'assets/unlocks/secret_skins/assassin_clone_log2007_secret.png', unlockKey: 'log_2007' },
  },
};

// Endless-only achievement milestones. Each `test` is a PURE read-only predicate over a
// finished-run stats snapshot { time (s), level, score, combo, cores } — it never mutates
// game state. Recognition only: no rewards, no stat bonuses. Persisted in `phenix_meta`.
export const ENDLESS_ACHIEVEMENTS = [
  { id: 'first_endless',   name: 'FIRST ENDLESS RUN', desc: 'Finish one Endless run',       test: ()  => true },
  { id: 'endless_survivor', name: 'ENDLESS SURVIVOR',  desc: 'Survive 15:00 in Endless',     test: (s) => s.time  >= 15 * 60 },
  { id: 'grid_legend',     name: 'GRID LEGEND',        desc: 'Survive 20:00 in Endless',     test: (s) => s.time  >= 20 * 60 },
  { id: 'level_breaker',   name: 'LEVEL BREAKER',      desc: 'Reach Level 30 in Endless',    test: (s) => s.level >= 30 },
  { id: 'score_hunter',    name: 'SCORE HUNTER',       desc: 'Reach 50,000 score in Endless', test: (s) => s.score >= 50000 },
  { id: 'combo_master',    name: 'COMBO MASTER',       desc: 'Reach combo x100 in Endless',  test: (s) => s.combo >= 100 },
  { id: 'core_defender',   name: 'CORE DEFENDER',      desc: 'Secure 25 cores in Endless',   test: (s) => s.cores >= 25 },
];

export class MetaProgress {
  constructor() {
    this.credits = 0;
    this.levels  = {};
    this.unlocks = {};
    // Personal Endless-mode records — kept SEPARATE from Act 1 / global high score.
    // { time: seconds survived, score: best score, level: highest player level }.
    this.endlessRecords = { time: 0, score: 0, level: 0 };
    // Endless achievement flags: { [id]: true } once earned. Persisted alongside records.
    this.achievements = {};
    // Equipped outfit per character: { [characterId]: 'default' | 'secret' }. Stored SEPARATELY
    // from `unlocks` (which gates availability). Cosmetic selection only.
    this.selectedOutfits = {};
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
      this.achievements = d.achievements || {};
      this.selectedOutfits = d.selectedOutfits || {};
    } catch (_) {}
  }

  _save() {
    try {
      localStorage.setItem('phenix_meta', JSON.stringify({
        credits: this.credits,
        levels:  this.levels,
        unlocks: this.unlocks,
        endlessRecords: this.endlessRecords,
        achievements: this.achievements,
        selectedOutfits: this.selectedOutfits,
      }));
    } catch (_) {}
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
    if (newly.length) this._save();
    return newly;
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

  reset() {
    this.credits = 0;
    this.levels  = {};
    this.unlocks = {};
    this.endlessRecords = { time: 0, score: 0, level: 0 };
    this.achievements   = {};
    this.selectedOutfits = {};
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

  // Character unlock gate. The 3 base characters are always available; Brawler Warrior is
  // unlocked by reaching 10:00 in Endless (flag set via unlock('brawler_warrior')).
  isCharacterUnlocked(characterId) {
    if (characterId === 'brawler_warrior') return this.isUnlocked('brawler_warrior');
    return true;
  }

  // Resolve the sprite asset for a character+outfit (always returns a valid path).
  getOutfitAsset(characterId, outfitId) {
    const c = CHARACTER_OUTFITS[characterId];
    if (!c) return `assets/characters/${characterId}.png`;
    return (c[outfitId] || c.default).asset;
  }
}
