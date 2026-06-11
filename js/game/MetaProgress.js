export const META_UPGRADES = [
  { key: 'maxHp',        name: 'Max HP',        desc: '+10 max HP per level',              maxLevel: 5, baseCost: 10 },
  { key: 'moveSpeed',    name: 'Move Speed',     desc: '+5% movement speed per level',       maxLevel: 5, baseCost: 10 },
  { key: 'coreMagnet',   name: 'Core Magnet',    desc: '+10% pickup radius per level',       maxLevel: 5, baseCost: 10 },
  { key: 'coreCapacity', name: 'Core Capacity',  desc: '+1 carry slot per level',            maxLevel: 3, baseCost: 20 },
  { key: 'pulseDamage',  name: 'Pulse Damage',   desc: '+1 projectile damage per level',     maxLevel: 5, baseCost: 10 },
  { key: 'firewall',     name: 'Firewall',       desc: '-5% Network Overload per level',     maxLevel: 5, baseCost: 10 },
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
];

export class MetaProgress {
  constructor() {
    this.credits = 0;
    this.levels  = {};
    this.unlocks = {};
    // Personal Endless-mode records — kept SEPARATE from Act 1 / global high score.
    // { time: seconds survived, score: best score, level: highest player level }.
    this.endlessRecords = { time: 0, score: 0, level: 0 };
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
    } catch (_) {}
  }

  _save() {
    try {
      localStorage.setItem('phenix_meta', JSON.stringify({
        credits: this.credits,
        levels:  this.levels,
        unlocks: this.unlocks,
        endlessRecords: this.endlessRecords,
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
    this._save();
  }
}
