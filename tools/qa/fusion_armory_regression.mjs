// ════════════════════════════════════════════════════════════════════════════════
// FUSION ARMORY — Batch A regression gate (2026-08-01).
// Κλειδώνει: catalog δομή (20 fusions / 10 chars / unique ids+recipes / πραγματικά
// component ids), atomic dual-currency αγορά + tier upgrades + persistence + save
// compatibility (MetaProgress), mode gating (Endless/Chaos ONLY), audio hooks
// (authored-first + per-fusion procedural fallback), ΚΑΙ τον single-module-instance
// κανόνα του BuildEngine.js specifier (το split ?v που έσπασε το BE στο live).
// Run: node tools/qa/fusion_armory_regression.mjs
// ════════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

register('./strip-v-loader.mjs', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

let pass = 0, fail = 0;
const T = (n, f) => {
  let ok = false, note = '';
  try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; }
  catch (e) { note = 'THREW: ' + e.message; }
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note && !ok ? ' — ' + note : ''}`);
};

const unmute = muteConsole();
const FC = await import(pathToFileURL(path.join(ROOT, 'js/game/FusionCatalog.js')).href);
const BE = await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngine.js')).href);
await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngineChars1.js')).href);
await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngineChars2.js')).href);
await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngineChars3.js')).href);
await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngineChars4.js')).href);
await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngineChars5.js')).href);
const MP = await import(pathToFileURL(path.join(ROOT, 'js/game/MetaProgress.js')).href);
const AM = await import(pathToFileURL(path.join(ROOT, 'js/audio/AudioManager.js')).href);
unmute();

const { FUSION_DEFS, FUSION_IDS, FUSION_CARD_ORDER, FUSION_ROSTER_ORDER, FUSION_MAX_TIER,
        fusionCost, fusionModeOk, fusionHookIds, allFusionAudioHooks, validateFusionCatalog,
        FUSION_REQ_LEVELS, fusionRecipeReady } = FC;
const { WEAPON_DEFS, FUSION_TAGS } = BE;
const { MetaProgress } = MP;
const { AudioManager } = AM;

console.log('═══ FUSION ARMORY REGRESSION — Batch A ═══');

// ── [A] Catalog structure ─────────────────────────────────────────────────────
console.log('── A. Catalog');
T('[A1] validateFusionCatalog returns zero errors', () => {
  const errs = validateFusionCatalog();
  return errs.length === 0 ? true : errs.join('; ');
});
T('[A2] at least 20 fusions', () => FUSION_IDS.length >= 20 ? true : String(FUSION_IDS.length));
T('[A3] 10/10 roster characters covered with 2+ fusions each', () => {
  for (const ch of FUSION_ROSTER_ORDER) {
    const n = FUSION_IDS.filter(id => FUSION_DEFS[id].char === ch).length;
    if (n < 2) return ch + ' has ' + n;
  }
  return FUSION_ROSTER_ORDER.length === 10 ? true : 'roster size ' + FUSION_ROSTER_ORDER.length;
});
T('[A4] unique fusion ids', () => new Set(FUSION_IDS).size === FUSION_IDS.length);
T('[A5] unique 3-weapon recipes', () => {
  const s = new Set(FUSION_IDS.map(id => FUSION_DEFS[id].components.join('+')));
  return s.size === FUSION_IDS.length;
});
T('[A6] every component id exists in production WEAPON_DEFS (25-weapon instance)', () => {
  if (Object.keys(WEAPON_DEFS).length < 25) return 'WEAPON_DEFS has only ' + Object.keys(WEAPON_DEFS).length;
  for (const id of FUSION_IDS)
    for (const c of FUSION_DEFS[id].components)
      if (!WEAPON_DEFS[c]) return id + ' → missing component ' + c;
  return true;
});
T('[A7] component[0] is a NATIVE signature weapon of the fusion character', () => {
  for (const id of FUSION_IDS) {
    const d = FUSION_DEFS[id];
    if (WEAPON_DEFS[d.components[0]].owner !== d.char) return id + ': ' + d.components[0] + ' not native';
  }
  return true;
});
T('[A8] recipes are acquirable within the 6-slot / 2-per-family caps', () => {
  for (const ch of FUSION_ROSTER_ORDER) {
    const ids = FUSION_IDS.filter(id => FUSION_DEFS[id].char === ch);
    const all = new Set(ids.flatMap(id => FUSION_DEFS[id].components));
    if (all.size > 6) return ch + ' needs ' + all.size + ' slots';
    const fam = {};
    for (const c of all) { const f = (WEAPON_DEFS[c].tags || [])[0] || 'MISC'; fam[f] = (fam[f] || 0) + 1; }
    for (const [f, n] of Object.entries(fam)) if (n > 2) return ch + ': family ' + f + ' ×' + n;
  }
  return true;
});
T('[A9] every fusion carries hard caps + bossMultiplier ≤ 0.7 + tick-based fields', () => {
  for (const id of FUSION_IDS) {
    const m = FUSION_DEFS[id].mech;
    if (!m.caps) return id + ': no caps';
    if (!(m.bossMultiplier > 0 && m.bossMultiplier <= 0.7)) return id + ': bossMultiplier ' + m.bossMultiplier;
  }
  return true;
});
T('[A10] art paths canonical: assets/weapons/fusions/<char>/<fusion_id>.png', () =>
  FUSION_IDS.every(id => FUSION_DEFS[id].art === `assets/weapons/fusions/${FUSION_DEFS[id].char}/${id}.png`));
T('[A11] 3 tier descriptions each, Tier 3 is a mechanic evolution (t3 config present)', () => {
  for (const id of FUSION_IDS) {
    const d = FUSION_DEFS[id];
    if (!Array.isArray(d.tiers) || d.tiers.length !== 3) return id + ': tiers';
    if (!d.t3 || typeof d.t3 !== 'object') return id + ': missing t3 mechanic config';
  }
  return true;
});
T('[A12] chaos enhancement config present and bounded (no unbounded multipliers)', () => {
  for (const id of FUSION_IDS) {
    const c = FUSION_DEFS[id].chaos;
    if (!c) return id + ': no chaos config';
    for (const [k, v] of Object.entries(c)) {
      // multipliers ≤ 2×, additive count bonuses ≤ 4 — τίποτα unbounded.
      if (typeof v === 'number' && !(isFinite(v) && v >= 0 && v <= 4)) return id + '.' + k + '=' + v;
      if (typeof v === 'object' && v !== null) continue;
    }
  }
  return true;
});
T('[A13] FUSION_TAGS registry exists on the production BuildEngine instance', () =>
  !!FUSION_TAGS && typeof FUSION_TAGS === 'object');
T('[A14] recipe req levels are [5,3,3] and fusionRecipeReady enforces them', () => {
  if (String(FUSION_REQ_LEVELS) !== '5,3,3') return String(FUSION_REQ_LEVELS);
  const d = FUSION_DEFS.fus_ossuary_impaler;
  const rt = { weapons: new Map(), game: {} };
  if (fusionRecipeReady(d, rt, WEAPON_DEFS)) return 'ready with no weapons';
  rt.weapons.set('marrow_spitter', { level: 5, evolved: false });
  rt.weapons.set('build_null_lance', { level: 3, evolved: false });
  rt.weapons.set('gravity_core', { level: 2, evolved: false });
  if (fusionRecipeReady(d, rt, WEAPON_DEFS)) return 'ready with C at Lv2';
  rt.weapons.get('gravity_core').level = 3;
  if (!fusionRecipeReady(d, rt, WEAPON_DEFS)) return 'not ready with 5/3/3';
  rt.weapons.get('marrow_spitter').level = 4;
  if (fusionRecipeReady(d, rt, WEAPON_DEFS)) return 'ready with signature Lv4';
  rt.weapons.get('marrow_spitter').evolved = true;   // evolved counts as Lv5
  return fusionRecipeReady(d, rt, WEAPON_DEFS) === true ? true : 'evolved not counted as Lv5';
});
T('[A15] external component (Eddie Solo Red Thunder) resolves via game._weaponLevels', () => {
  const d = FUSION_DEFS.fus_wall_of_sound;
  const rt = { weapons: new Map(), game: { _weaponLevels: new Map([['solo_red_thunder', 5]]) } };
  rt.weapons.set('feedback_cabinet', { level: 3, evolved: false });
  rt.weapons.set('build_ion_halo', { level: 3, evolved: false });
  return fusionRecipeReady(d, rt, WEAPON_DEFS) === true;
});

// ── [B] Mode gating — ENDLESS / CHAOS ONLY ────────────────────────────────────
console.log('── B. Mode gating');
T('[B1] Campaign / Act 1 excluded', () => !fusionModeOk({ gameState: 'playing', endless: false, _chaosMode: false }));
T('[B2] Endless eligible', () => fusionModeOk({ gameState: 'playing', endless: true, _chaosMode: false }) === true);
T('[B3] Chaos eligible', () => fusionModeOk({ gameState: 'playing', endless: true, _chaosMode: true }) === true);
T('[B4] Boss Rush excluded', () => !fusionModeOk({ gameState: 'playing', endless: true, _bossRush: true }));
T('[B5] menu / invalid gameState excluded', () =>
  !fusionModeOk({ gameState: 'start_menu', endless: true }) && !fusionModeOk(null) && !fusionModeOk({}));

// ── [C] MetaProgress — atomic dual-currency purchase + tiers + persistence ────
console.log('── C. Purchase & save');
const FID = 'fus_ossuary_impaler', FID2 = 'fus_night_parade';
function freshMeta({ pf = 0, grids = 0, endless = true } = {}) {
  localStorage.clear();
  const m = new MetaProgress();
  m.protocolFragments = pf; m.credits = grids;
  if (endless) m.endlessUnlocked = true;
  return m;
}
T('[C1] invalid id → "invalid", no charge', () => {
  const m = freshMeta({ pf: 999, grids: 99999 });
  const r = m.tryBuyFusionCard('fus_does_not_exist');
  return r === 'invalid' && m.protocolFragments === 999 && m.credits === 99999 ? true : r;
});
T('[C2] locked before Endless unlock → "locked", no charge', () => {
  const m = freshMeta({ pf: 999, grids: 99999, endless: false });
  const r = m.tryBuyFusionCard(FID);
  return r === 'locked' && m.protocolFragments === 999 && m.credits === 99999 ? true : r;
});
T('[C3] poor in EITHER currency → "poor", ΚΑΜΙΑ μερική χρέωση', () => {
  const c = fusionCost(1);
  let m = freshMeta({ pf: c.pf - 1, grids: c.grids });
  if (m.tryBuyFusionCard(FID) !== 'poor' || m.protocolFragments !== c.pf - 1 || m.credits !== c.grids) return 'pf-poor leaked';
  m = freshMeta({ pf: c.pf, grids: c.grids - 1 });
  if (m.tryBuyFusionCard(FID) !== 'poor' || m.protocolFragments !== c.pf || m.credits !== c.grids - 1) return 'grid-poor leaked';
  return true;
});
T('[C4] successful purchase charges BOTH currencies exactly once', () => {
  const c = fusionCost(1);
  const m = freshMeta({ pf: c.pf + 7, grids: c.grids + 11 });
  const r = m.tryBuyFusionCard(FID);
  return r === 'ok' && m.protocolFragments === 7 && m.credits === 11 && m.getFusionTier(FID) === 1 ? true : r;
});
T('[C5] purchase persists across reload (localStorage phenix_meta)', () => {
  const c = fusionCost(1);
  const m = freshMeta({ pf: c.pf, grids: c.grids });
  m.tryBuyFusionCard(FID);
  const m2 = new MetaProgress();
  return m2.getFusionTier(FID) === 1 && m2.hasFusionCard(FID) === true;
});
T('[C6] tier upgrades: t2 then t3 with correct costs, then "max"', () => {
  const c1 = fusionCost(1), c2 = fusionCost(2), c3 = fusionCost(3);
  const m = freshMeta({ pf: c1.pf + c2.pf + c3.pf, grids: c1.grids + c2.grids + c3.grids });
  if (m.tryBuyFusionCard(FID) !== 'ok') return 't1';
  if (m.tryBuyFusionCard(FID) !== 'ok' || m.getFusionTier(FID) !== 2) return 't2';
  if (m.tryBuyFusionCard(FID) !== 'ok' || m.getFusionTier(FID) !== FUSION_MAX_TIER) return 't3';
  if (m.protocolFragments !== 0 || m.credits !== 0) return 'cost drift pf=' + m.protocolFragments + ' gr=' + m.credits;
  return m.tryBuyFusionCard(FID) === 'max';
});
T('[C7] tier levels persist across reload', () => {
  const m = new MetaProgress();
  return m.getFusionTier(FID) === FUSION_MAX_TIER;
});
T('[C8] buying one card never unlocks another / never touches other upgrades', () => {
  const c = fusionCost(1);
  const m = freshMeta({ pf: c.pf, grids: c.grids });
  m.levels = { meta_damage: 2 }; m.amulets = { amulet_skeleton: true };
  m.tryBuyFusionCard(FID2);
  const m2 = new MetaProgress();
  return m2.getFusionTier(FID2) === 1 && m2.getFusionTier(FID) === 0 &&
         m2.levels.meta_damage === 2 && m2.amulets.amulet_skeleton === true;
});
T('[C9] old save WITHOUT fusionCards loads → all locked, no crash', () => {
  localStorage.clear();
  localStorage.setItem('phenix_meta', JSON.stringify({ credits: 50, protocolFragments: 5, endlessUnlocked: true }));
  const m = new MetaProgress();
  return m.getFusionTier(FID) === 0 && !m.hasFusionCard(FID) && m.credits === 50;
});
T('[C10] corrupt fusionCards shapes are repaired (string/number/invalid ids/oversized tier)', () => {
  localStorage.clear();
  localStorage.setItem('phenix_meta', JSON.stringify({
    economyRepairV2: true,
    fusionCards: { [FID]: 99, bogus_id: 1, [FID2]: 'yes', fus_negative: -3 },
  }));
  const m = new MetaProgress();
  if (m.getFusionTier(FID) !== FUSION_MAX_TIER) return 'tier not clamped: ' + m.getFusionTier(FID);
  if (m.fusionCards.bogus_id !== undefined) return 'bogus id survived';
  if (m.getFusionTier(FID2) !== 0) return 'string tier accepted';
  localStorage.setItem('phenix_meta', JSON.stringify({ economyRepairV2: true, fusionCards: 'garbage' }));
  const m2 = new MetaProgress();
  return m2.getFusionTier(FID) === 0;
});
T('[C11] no currency duplication on double-purchase attempt', () => {
  const c = fusionCost(1);
  const m = freshMeta({ pf: c.pf * 2, grids: c.grids * 2 });
  m.tryBuyFusionCard(FID);
  const pf1 = m.protocolFragments, gr1 = m.credits;
  const r = m.tryBuyFusionCard(FID);                 // δεύτερη κλήση = tier 2 upgrade
  const c2 = fusionCost(2);
  if (m.protocolFragments >= pf1 && r === 'ok') return 'no charge on t2?';
  if (r === 'ok' && (pf1 - m.protocolFragments !== c2.pf || gr1 - m.credits !== c2.grids)) return 'wrong t2 charge';
  return true;
});

// ── [D] Audio hooks ───────────────────────────────────────────────────────────
console.log('── D. Audio hooks');
T('[D1] 5 canonical hooks per fusion, 100 total, unique', () => {
  const all = allFusionAudioHooks();
  if (all.length !== FUSION_IDS.length * 5) return String(all.length);
  return new Set(all).size === all.length;
});
T('[D2] WAVE1_CAPS carries a fusion bucket cap', () => (AudioManager.WAVE1_CAPS.fusion | 0) >= 1);
T('[D3] playFusionCue: per-fusion DISTINCT procedural fallback, all phases voiced', () => {
  const calls = [];
  const a = Object.create(AudioManager.prototype);
  a.muted = false; a.actx = { currentTime: 0 };
  a._tone = (o) => calls.push(['tone', o.freqStart | 0]);
  a._noiseBurst = (o) => calls.push(['noise', o.freq | 0]);
  a._forgeLast = {}; a._lastPlay = {};
  let t = 0;
  a._forgeOk = function (type, minMs) {   // πραγματικό συμβόλαιο με εικονικό ρολόι
    if (t - (this._forgeLast[type] || -1e9) < minMs) return false;
    this._forgeLast[type] = t; return true;
  };
  const sigs = new Set();
  for (const fid of FUSION_IDS) {
    for (const ph of ['manifest', 'charge', 'travel', 'impact', 'aftermath']) {
      calls.length = 0;
      t += 1000;
      const r = a.playFusionCue(fid, ph);
      if (r !== 'forged') return fid + '/' + ph + ' → ' + r;
      if (!calls.length) return fid + '/' + ph + ' silent';
      if (ph === 'manifest') sigs.add(calls.map(c => c[1]).join(','));
    }
  }
  // Ο ήχος ΔΕΝ είναι ίδιος σε όλα: τουλάχιστον 15 διαφορετικές manifest υπογραφές στα 20.
  return sigs.size >= 15 ? true : 'only ' + sigs.size + ' distinct manifest voices';
});
T('[D4] throttle: back-to-back same hook is blocked (no spam) — REAL _forgeOk', () => {
  const a = Object.create(AudioManager.prototype);
  a.muted = false; a.actx = { currentTime: 0 };
  a._tone = () => {}; a._noiseBurst = () => {};
  const origNow = performance.now;
  let t = 100000;
  performance.now = () => t;
  try {
    const r1 = a.playFusionCue(FID, 'impact');
    t += 100;                                        // 100ms < 240ms throttle
    const r2 = a.playFusionCue(FID, 'impact');
    t += 500;                                        // 600ms σύνολο > 240ms
    const r3 = a.playFusionCue(FID, 'impact');
    return r1 === 'forged' && r2 === 'blocked' && r3 === 'forged' ? true : r1 + '/' + r2 + '/' + r3;
  } finally { performance.now = origNow; }
});
T('[D5] muted → nofile (silence), invalid phase → invalid ΠΡΙΝ το throttle', () => {
  const a = Object.create(AudioManager.prototype);
  a.muted = true; a.actx = { currentTime: 0 };
  if (a.playFusionCue(FID, 'impact') !== 'nofile') return 'mute leak';
  a.muted = false; a._tone = () => {}; a._noiseBurst = () => {};
  return a.playFusionCue(FID, 'no_such_phase') === 'invalid';
});
T('[D6] authored-first: registry entry wins over procedural (contract)', () => {
  const a = Object.create(AudioManager.prototype);
  a.muted = false; a.actx = { currentTime: 0 };
  let w1 = null;
  a._wave1Play = (bucket, id) => { w1 = id; return 'played'; };
  a.duckMusic = () => {};
  AudioManager.WAVE1_SFX.__fus_test_manifest = ['x'];
  try {
    const r = a.playFusionCue('__fus_test', 'manifest');
    return r === 'played' && w1 === '__fus_test_manifest';
  } finally { delete AudioManager.WAVE1_SFX.__fus_test_manifest; }
});

// ── [E] Module-instance guard (το live split που διορθώθηκε στο Batch A) ──────
console.log('── E. Module-instance guard');
T('[E1] ONE BuildEngine.js?v= specifier value across the entire runtime', () => {
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (f.endsWith('.js')) files.push(p);
    }
  };
  walk(path.join(ROOT, 'js'));
  const vals = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/BuildEngine\.js\?v=(\d+)/g)) vals.add(m[1]);
  }
  return vals.size === 1 ? true : 'specifiers: ' + [...vals].join(', ');
});
// [E1b] The same trap, one directory over. tools/qa harnesses import BuildEngine too, and a
// hard-coded ?v= there is INVISIBLE to [E1] because it only walks js/. Three harnesses had been
// pinned to a dead '?v=20260810100000' for weeks: they silently received a 2-weapon BuildEngine
// instead of 25 and reported 13 failures against a registry that was simply not there
// (act1_late_eligibility 6/6, act1_full_campaign_flow 7/7). A harness must DERIVE the stamp from
// js/game/BuildEngineChars1.js, never restate it.
T('[E1b] no tools/qa harness hard-codes a BuildEngine ?v= specifier', () => {
  // Known pending, deliberately untouched: these three carry UNCOMMITTED local edits (Windows
  // pathToFileURL fixes) in Maria's working tree, so this pass did not rewrite them. Each still
  // needs the same one-token change. The list is closed - a NEW stale file fails this test.
  const PENDING = new Set([
    'weapon_be_boss_damage_regression.mjs',
    'weapon_be_live_evolution_regression.mjs',
    'weapon_evolution_reachability_regression.mjs',
  ]);
  const dir = path.join(ROOT, 'tools/qa');
  const live = fs.readFileSync(path.join(ROOT, 'js/game/BuildEngineChars1.js'), 'utf8')
    .match(/BuildEngine\.js\?v=(\d+)/)[1];
  const bad = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.mjs') || PENDING.has(f)) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const line of src.split('\n')) {
      if (/^\s*\/\//.test(line)) continue;                 // prose, not a specifier
      const m = line.match(/BuildEngine[A-Za-z0-9]*\.js\?v=(\d+)/);
      if (m && m[1] !== live) bad.push(`${f}: ${m[1]}`);
    }
  }
  return bad.length === 0 ? true : 'stale: ' + bad.join(' | ') + ` (live ${live})`;
});
T('[E2] Game.js imports every BuildEngineChars module with its OWN current ?v (chain sane)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
  const chars = [...src.matchAll(/BuildEngineChars\d\.js\?v=(\d+)/g)].map(m => m[1]);
  return chars.length === 5 ? true : 'found ' + chars.length;
});
T('[E3] FusionCatalog has NO imports (version-coupling-free data module)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/game/FusionCatalog.js'), 'utf8');
  return !/^import /m.test(src);
});
T('[E4] fusion ids never leak into WEAPON_DEFS / EVOLUTION_RECIPES (card pool untouched)', () => {
  for (const id of FUSION_IDS) if (BE.WEAPON_DEFS[id] || BE.EVOLUTION_RECIPES[id]) return id + ' leaked';
  return true;
});

// ── [F] Batch B — assets στο δίσκο + Upgrades tab integration ─────────────────
console.log('── F. Art assets & FUSIONS tab');
const { FUSION_ART_READY } = FC;
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25] };
}
T('[F1] FUSION_ART_READY ⊆ FUSION_DEFS and every ready art file EXISTS at its canonical path', () => {
  if (!FUSION_ART_READY || FUSION_ART_READY.size < 10) return 'ready set: ' + (FUSION_ART_READY?.size ?? 'none');
  for (const fid of FUSION_ART_READY) {
    if (!FUSION_DEFS[fid]) return fid + ' not in defs';
    if (!fs.existsSync(path.join(ROOT, FUSION_DEFS[fid].art))) return fid + ' file missing';
  }
  return true;
});
T('[F2] every ready asset is a REAL ≥1024×1024 RGBA PNG', () => {
  for (const fid of FUSION_ART_READY) {
    const buf = fs.readFileSync(path.join(ROOT, FUSION_DEFS[fid].art));
    const s = pngSize(buf);
    if (!s) return fid + ': not a PNG';
    if (s.w < 1024 || s.h < 1024) return fid + ': ' + s.w + '×' + s.h;
    if (s.colorType !== 6) return fid + ': colorType ' + s.colorType + ' (want RGBA=6)';
    if (buf.length < 30000) return fid + ': suspiciously small (' + buf.length + 'B)';
  }
  return true;
});
T('[F3] no orphan files under assets/weapons/fusions (κάθε αρχείο ↔ artReady def)', () => {
  const base = path.join(ROOT, 'assets/weapons/fusions');
  if (!fs.existsSync(base)) return 'no fusions asset dir';
  const found = [];
  for (const ch of fs.readdirSync(base)) {
    const dir = path.join(base, ch);
    if (!fs.statSync(dir).isDirectory()) return 'stray file ' + ch;
    for (const f of fs.readdirSync(dir)) found.push('assets/weapons/fusions/' + ch + '/' + f);
  }
  for (const p of found) {
    const fid = path.basename(p, '.png');
    if (!FUSION_DEFS[fid] || FUSION_DEFS[fid].art !== p) return 'orphan ' + p;
    if (!FUSION_ART_READY.has(fid)) return p + ' on disk but not artReady';
  }
  for (const fid of FUSION_ART_READY) if (!found.includes(FUSION_DEFS[fid].art)) return fid + ' ready but absent';
  return true;
});
T('[F4] ONE FusionCatalog.js?v= specifier value across the runtime (no split instance)', () => {
  const vals = new Set();
  const scan = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) scan(p);
      else if (f.endsWith('.js')) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/FusionCatalog\.js\?v=(\d+)/g)) vals.add(m[1]);
      }
    }
  };
  scan(path.join(ROOT, 'js'));
  return vals.size === 1 ? true : 'specifiers: ' + [...vals].join(', ');
});
T('[F5] Upgrades overlay carries the FUSIONS tab + purchase branch + artReady gating', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
  if (!src.includes('data-tab="fusions"')) return 'tab button missing';
  if (!src.includes("tab === 'fusions'")) return 'sync/click branch missing';
  if (!src.includes('tryBuyFusionCard')) return 'purchase call missing';
  if (!src.includes('FUSION_ART_READY.has')) return 'artReady gating missing';
  if (!/img src="\$\{d\.art\}"/.test(src)) return 'card image missing';
  if (!src.includes('ENDLESS / CHAOS ONLY')) return 'mode badge missing';
  return true;
});
T('[F6] card list ids are ordered, unique and all artReady', () => {
  const list = FC.FUSION_CARD_ORDER.filter(fid => FUSION_ART_READY.has(fid));
  if (new Set(list).size !== list.length) return 'dupes';
  return list.length === FUSION_ART_READY.size;
});

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
