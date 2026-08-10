/**
 * META ECONOMY MIGRATION REGRESSION (Maria)
 *
 * The load path carried two economy repairs. The first was versioned (economyRepairV2) and ran
 * once. The SECOND had no flag at all:
 *
 *     if (this.lastPlayerLevelRewarded > 300 || (this.credits || 0) > 500000) {
 *       this.credits = Math.min(this.credits || 0, 20000);
 *       this.protocolFragments = Math.min(this.protocolFragments || 0, 120);
 *       ...
 *     }
 *
 * It rewrote lastPlayerLevelRewarded to the current level, so it LOOKED self-limiting — but
 * `credits > 500000` is a threshold a real late-game player reaches, and from then on every
 * single launch reset them to 20000 credits / 120 PF. A banked 600k was destroyed again and
 * again, silently, with no way for the player to keep it.
 *
 * This file loads MetaProgress against a real localStorage shim and drives four cases through a
 * genuine save → reload cycle, comparing the SERIALISED save byte for byte across reloads. It is
 * not a code reading: it constructs the class, lets it write to storage, and constructs it again.
 *
 *   1  legacy save that genuinely needs migration
 *   2  normal save
 *   3  rich late-game save with balances above the repair values
 *   4  save → reload x3, byte-for-byte identical after the first migration
 *
 * Run: node tools/qa/meta_economy_migration_regression.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

// ── Minimal browser surface. A REAL store, not an inert stub: this test is entirely about what
// survives a write/read round trip, so a stubbed setItem would make every case pass vacuously.
const store = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
  clear() { this._d = {}; },
  key(i) { return Object.keys(this._d)[i] ?? null; },
  get length() { return Object.keys(this._d).length; },
};
globalThis.localStorage = store;
globalThis.sessionStorage = store;
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { getElementById: () => null, querySelector: () => null,
  querySelectorAll: () => [], createElement: () => ({ style: {}, getContext: () => null }), addEventListener: () => {} };
globalThis.Image = globalThis.Image || class { constructor() { this.src = ''; this.complete = false; this.naturalWidth = 0; } };
globalThis.performance = globalThis.performance || { now: () => 0 };
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);
globalThis.addEventListener = globalThis.addEventListener || (() => {});
// node 22 exposes navigator as a getter-only property; assigning to it throws.
try { if (!globalThis.navigator) globalThis.navigator = { userAgent: 'node', getGamepads: () => [] }; } catch (_) {}

const { MetaProgress } = await import('../../js/game/MetaProgress.js');

const KEY = 'phenix_meta';
const put  = (obj) => { store.clear(); store.setItem(KEY, JSON.stringify(obj)); };
const raw  = () => store.getItem(KEY);
const load = () => new MetaProgress();
// The three numbers the repair touches, plus the flags that decide whether it runs.
const snap = (m) => ({ credits: m.credits, pf: m.protocolFragments,
                       rewardedPFTotal: m.rewardedPFTotal, lastLv: m.lastPlayerLevelRewarded,
                       ver: m.economyRepairVersion });
const fmt = (s) => `credits=${s.credits} PF=${s.pf} rewardedPF=${s.rewardedPFTotal} lastLv=${s.lastLv} v=${s.ver}`;

// A save shaped like the real thing, so nothing in _load takes an unusual branch.
const baseSave = (over = {}) => ({
  credits: 500, levels: { maxHp: 2 }, unlocks: { brawler_warrior: true },
  endlessRecords: { time: 900, kills: 1200 }, achievements: { first_blood: true },
  endlessUnlocked: true, stagesCleared: 4, protocolFragments: 40,
  pfEarnedFrom: {}, protocolUnlocks: {}, protocolCards: {}, amulets: {}, fusionCards: {},
  profileName: 'MARIA', relics: { titan_core: true }, equippedRelic: 'titan_core',
  bossKills: { titan: 3 }, runHistory: [], edenMemoryPercent: 55,
  lastPlayerLevelRewarded: 40, rewardedPFTotal: 300,
  ...over,
});

console.log('\n══ META ECONOMY — the repair must run ONCE and never take money again ══\n');

// ── CASE 1: legacy save that genuinely needs migration ─────────────────────
// No economyRepairV2 and no version: the polluted shape the repair exists for.
{
  put(baseSave({ credits: 999999, protocolFragments: 999, lastPlayerLevelRewarded: 1400,
                 economyRepairV2: undefined }));
  const before = { credits: 999999, pf: 999, lastLv: 1400 };
  const a = snap(load());
  const rawAfterFirst = raw();
  const b = snap(load());
  const c = snap(load());
  const d = snap(load());
  console.log('   CASE 1  LEGACY (needs migration)');
  console.log(`     BEFORE  credits=${before.credits} PF=${before.pf} lastLv=${before.lastLv}`);
  console.log(`     FIRST   ${fmt(a)}`);
  console.log(`     RELOAD1 ${fmt(b)}`);
  console.log(`     RELOAD2 ${fmt(c)}`);
  console.log(`     RELOAD3 ${fmt(d)}`);
  ok('CASE 1 the legacy save IS migrated (clamped to the repair values)',
     a.credits === 20000 && a.pf === 120, fmt(a));
  ok('CASE 1 the migration records its version', a.ver === 3, 'v=' + a.ver);
  ok('CASE 1 reloads 1-3 change nothing',
     JSON.stringify(b) === JSON.stringify(a) && JSON.stringify(c) === JSON.stringify(a) &&
     JSON.stringify(d) === JSON.stringify(a), `${fmt(a)} vs ${fmt(d)}`);
  ok('CASE 1 unlocks and progress survive the migration', (() => {
    const m = load();
    return m.unlocks.brawler_warrior === true && m.relics.titan_core === true &&
           m.stagesCleared === 4 && m.endlessUnlocked === true && m.profileName === 'MARIA' &&
           m.achievements.first_blood === true;
  })());
  ok('CASE 1 the save on disk is byte-for-byte stable across reloads', raw() === rawAfterFirst);
}

// ── CASE 2: normal save, nothing to repair ─────────────────────────────────
{
  put(baseSave({ credits: 1200, protocolFragments: 55, lastPlayerLevelRewarded: 22,
                 economyRepairV2: true }));
  const a = snap(load()), b = snap(load()), c = snap(load()), d = snap(load());
  console.log('\n   CASE 2  NORMAL');
  console.log(`     BEFORE  credits=1200 PF=55 lastLv=22`);
  console.log(`     FIRST   ${fmt(a)}`);
  console.log(`     RELOAD1 ${fmt(b)}   RELOAD2 ${fmt(c)}   RELOAD3 ${fmt(d)}`);
  ok('CASE 2 a normal save is not touched at all',
     a.credits === 1200 && a.pf === 55 && a.lastLv === 22, fmt(a));
  ok('CASE 2 stable across three reloads',
     JSON.stringify(b) === JSON.stringify(a) && JSON.stringify(d) === JSON.stringify(a));
}

// ── CASE 3: RICH late-game save, balances above the repair values ──────────
// This is the case that was being robbed on every launch: economyRepairV2 was already true, so
// the FIRST repair was correctly skipped, and the second one fired anyway because credits were
// over 500000 — and it fired again on the next load, and the next.
{
  put(baseSave({ credits: 640000, protocolFragments: 900, lastPlayerLevelRewarded: 180,
                 rewardedPFTotal: 500, economyRepairV2: true }));
  const before = { credits: 640000, pf: 900, lastLv: 180 };
  const a = snap(load());
  const b = snap(load());
  const c = snap(load());
  const d = snap(load());
  console.log('\n   CASE 3  RICH LATE-GAME (above the repair values)');
  console.log(`     BEFORE  credits=${before.credits} PF=${before.pf} lastLv=${before.lastLv}`);
  console.log(`     FIRST   ${fmt(a)}`);
  console.log(`     RELOAD1 ${fmt(b)}`);
  console.log(`     RELOAD2 ${fmt(c)}`);
  console.log(`     RELOAD3 ${fmt(d)}`);
  ok('CASE 3 reloads 1-3 take nothing further — the balance stops moving after the first load',
     b.credits === a.credits && c.credits === a.credits && d.credits === a.credits &&
     b.pf === a.pf && d.pf === a.pf, `${fmt(a)} -> ${fmt(d)}`);
  ok('CASE 3 the version is recorded so the repair can never fire again', a.ver === 3);
  // Earn money AFTER the migration and prove a later load keeps every credit.
  {
    const m = load();
    m.credits = 900000; m.protocolFragments = 4000; m._save();
    const after = snap(load()), after2 = snap(load()), after3 = snap(load());
    console.log(`     earn to 900000/4000, then RELOAD1 ${fmt(after)}`);
    console.log(`                                RELOAD2 ${fmt(after2)}   RELOAD3 ${fmt(after3)}`);
    ok('CASE 3 a legitimately earned 900000 / 4000 survives three more reloads intact',
       after.credits === 900000 && after.pf === 4000 &&
       after3.credits === 900000 && after3.pf === 4000, fmt(after3));
  }
}

// ── CASE 4: byte-for-byte stability of the whole serialised save ───────────
{
  put(baseSave({ credits: 777777, protocolFragments: 640, lastPlayerLevelRewarded: 900,
                 economyRepairV2: undefined }));
  const m0 = load();                       // migrates
  const s1 = raw();
  load(); const s2 = raw();
  load(); const s3 = raw();
  load(); const s4 = raw();
  console.log('\n   CASE 4  BYTE-FOR-BYTE');
  console.log(`     after first load: ${s1.length} bytes`);
  ok('CASE 4 the serialised save is identical after reload 1', s2 === s1, `${s2.length} vs ${s1.length}`);
  ok('CASE 4 the serialised save is identical after reload 2', s3 === s1);
  ok('CASE 4 the serialised save is identical after reload 3', s4 === s1);
  ok('CASE 4 the version field is actually on disk', JSON.parse(s1).economyRepairVersion === 3,
     'economyRepairVersion=' + JSON.parse(s1).economyRepairVersion);
  void m0;
}

// ── CASE 5: a save that is BOTH unmigrated and rich must still migrate once ─
// Guards against "fix it by never repairing anything" — the migration must still do its job.
{
  put(baseSave({ credits: 3000000, protocolFragments: 5000, lastPlayerLevelRewarded: 1494,
                 economyRepairV2: undefined }));
  const a = snap(load()), b = snap(load());
  console.log('\n   CASE 5  POLLUTED (runaway loop shape)');
  console.log(`     BEFORE  credits=3000000 PF=5000 lastLv=1494`);
  console.log(`     FIRST   ${fmt(a)}   RELOAD1 ${fmt(b)}`);
  ok('CASE 5 a genuinely polluted save is still repaired',
     a.credits === 20000 && a.pf === 120 && a.lastLv <= 300, fmt(a));
  ok('CASE 5 and only once', JSON.stringify(b) === JSON.stringify(a));
}

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══\n`);
process.exit(fail ? 1 : 0);
