// ════════════════════════════════════════════════════════════════════════════════
// FUSION ARMORY — runtime lifecycle gate (Batch D/E).
// Πραγματικό Game (headless-env), πραγματικό run loop, πραγματικοί spawned εχθροί.
// Ανά fusion: canonical purchase → canonical 3-weapon acquisition (rt.addWeapon,
// το ίδιο call που κάνουν οι κάρτες) → guaranteed level-up κάρτα (injectCard) →
// apply → 35s εικονικού gameplay → αποδείξεις: real damage στο DamageLog, kills,
// finite coords, bounded objects, once-per-run, suppression, mode gating, cleanup.
// Run: node tools/qa/fusion_runtime_regression.mjs [fusion_id]
// ════════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./strip-v-loader.mjs', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

// deterministic PRNG + virtual clock
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let pass = 0, fail = 0;
const T = (n, f) => {
  let ok = false, note = '';
  try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; }
  catch (e) { note = 'THREW: ' + (e && e.message); }
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note && !ok ? ' — ' + note : ''}`);
};

const unmute = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const FC = await import(pathToFileURL(path.join(ROOT, 'js/game/FusionCatalog.js')).href);
const FE = await import(pathToFileURL(path.join(ROOT, 'js/game/FusionEngine.js')).href);
unmute();

const { FUSION_DEFS, FUSION_CARD_ORDER, FUSION_REQ_LEVELS, fusionCost } = FC;
const IN = () => ({ keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });

// Fusions με υλοποιημένο executor (Batch D → E ανεβαίνει σε 20)
const IMPLEMENTED = FUSION_CARD_ORDER.filter(fid => !!FE.FUSION_EXECUTORS[fid]);
console.log('═══ FUSION RUNTIME LIFECYCLE GATE — executors:', IMPLEMENTED.length, '═══');

function freshRun(charId, { chaos = false } = {}) {
  localStorage.clear();
  Math.random = mulberry32(20260801);
  const g = new Game();
  g.audio = null;
  g.selectedCharacter = charId;
  g.gameState = 'playing';
  g.reset();
  g._enterEndless();
  if (chaos) g._chaosMode = true;
  // canonical purchase path
  g.meta.endlessUnlocked = true;
  g.meta.protocolFragments = 500;
  g.meta.credits = 50000;
  return g;
}
function grantComponents(g, fid) {
  const d = FUSION_DEFS[fid];
  const rt = g.buildEngine;
  for (let k = 0; k < d.components.length; k++) {
    const cid = d.components[k];
    const need = FUSION_REQ_LEVELS[k];
    // canonical acquisition: rt.addWeapon — ίδιο call με τις level-up κάρτες.
    // (external components π.χ. solo_red_thunder: canonical legacy level path)
    const wd = FE ? undefined : undefined;
    for (let n = 0; n < need; n++) rt.addWeapon(cid);
    const w = rt.weapons.get(cid);
    if (!w) g._weaponLevels.set(cid, need);          // external fallback (legacy layer)
    else while (w.level < need) w.level++;
  }
}
function finiteDeep(o, depth = 0) {
  if (depth > 4 || o == null) return true;
  if (typeof o === 'number') return Number.isFinite(o);
  if (Array.isArray(o)) return o.every(v => finiteDeep(v, depth + 1));
  if (o instanceof Set || o instanceof Map) return true;
  if (typeof o === 'object') {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'number' && !Number.isFinite(v)) return false;
      if (typeof v === 'object' && !finiteDeep(v, depth + 1)) return false;
    }
  }
  return true;
}

// ── [R] πλήρες lifecycle ανά fusion ──────────────────────────────────────────────
const only = process.argv[2];
for (const fid of IMPLEMENTED) {
  if (only && fid !== only) continue;
  const d = FUSION_DEFS[fid];
  T(`[${fid}] full lifecycle: purchase → recipe → card → acquire → damage → kills → bounded`, () => {
    const g = freshRun(d.char);
    const fe = g.fusionEngine, rt = g.buildEngine;
    if (!fe || !rt) return 'no engines';
    if (g.meta.tryBuyFusionCard(fid) !== 'ok') return 'purchase failed';
    // πριν το recipe: ΔΕΝ είναι eligible
    if (fe.eligibleFusions().includes(fid)) return 'eligible without weapons';
    grantComponents(g, fid);
    if (!fe.eligibleFusions().includes(fid)) return 'not eligible with 3/3 weapons';
    // guaranteed level-up κάρτα μέσω του πραγματικού injection path
    const choices = [{ name: 'x' }, { name: 'y' }, { name: 'z' }];
    g._injectWeaponCard(choices);
    const card = choices[choices.length - 1];
    if (!card || card.key !== 'fusion_' + fid) return 'card not injected: ' + (card && card.key);
    card.apply(g.player);
    if (!fe.active.has(fid)) return 'not acquired after apply';
    // suppression των replaces
    for (const wid of d.replaces || []) {
      const w = rt.weapons.get(wid);
      if (w && !w._fusionSuppressed) return wid + ' not suppressed';
    }
    // once per run: δεν ξαναπροσφέρεται
    if (fe.eligibleFusions().includes(fid)) return 'still eligible after acquire';
    const c2 = [{}, {}, {}];
    g._injectWeaponCard(c2);
    if (c2[2] && c2[2].key === 'fusion_' + fid) return 'second card offered';
    // singleton boss branch (unit): plain object χωρίς takeHit → _capBossDamage path
    const fakeTitan = { pos: { x: g.player.pos.x + 150, y: g.player.pos.y }, hp: 5000, maxHp: 5000, radius: 60 };
    if (!fe.dealDamage(fid, fakeTitan, 100)) return 'singleton boss branch failed';
    if (!(fakeTitan.hp < 5000)) return 'singleton boss took no damage';
    // 35s πραγματικού loop — το παιχνίδι spawn-άρει πραγματικούς εχθρούς.
    // Τα level-up panels επιλέγονται κανονικά (selectUpgrade(0) — canonical path),
    // αλλιώς το run παγώνει στην πρώτη κάρτα.
    let nanFrame = -1;
    for (let f = 0; f < 35 * 60; f++) {
      g.update(1 / 60, IN());
      if (g.upgradeUI) g.selectUpgrade(0);
      if (f % 120 === 0) {
        if (!Number.isFinite(g.player.pos.x) || !Number.isFinite(g.player.pos.y)) { nanFrame = f; break; }
        const st = fe.active.get(fid);
        if (st && !finiteDeep(st.objects)) { nanFrame = f; break; }
      }
      if (g.gameOver) break;
    }
    if (nanFrame >= 0) return 'NaN at frame ' + nanFrame;
    const log = rt.log.byWeapon.get(fid);
    if (!log || !(log.total > 0)) return 'no damage logged';
    if (!(log.kills > 0)) return 'no kills (dmg=' + Math.round(log.total) + ', hits=' + log.hits + ')';
    // bounded: κανένα objects array πάνω από τα caps
    const st = fe.active.get(fid);
    if (st) {
      for (const [k, v] of Object.entries(st.objects || {})) {
        if (Array.isArray(v) && v.length > 40) return 'unbounded ' + k + '=' + v.length;
      }
    }
    if (fe.fx.length > 60) return 'fx overflow ' + fe.fx.length;
    // titan boss πήρε damage από τον singleton branch ΉΤΑΝ διαθέσιμος
    return true;
  });
}

// ── [G] gating / cleanup / chaos ─────────────────────────────────────────────────
console.log('── G. Gates & cleanup');
const G1 = IMPLEMENTED[0];
T('[G1] Act 1 (campaign): fusion ΔΕΝ προσφέρεται/αποκτιέται ποτέ (endless=false)', () => {
  const d = FUSION_DEFS[G1];
  localStorage.clear();
  Math.random = mulberry32(7);
  const g = new Game();
  g.audio = null; g.selectedCharacter = d.char; g.gameState = 'playing';
  g.reset();                                        // ΟΧΙ _enterEndless → Act 1
  g.meta.endlessUnlocked = true; g.meta.protocolFragments = 500; g.meta.credits = 50000;
  g.meta.tryBuyFusionCard(G1);
  grantComponents(g, G1);
  const fe = g.fusionEngine;
  if (fe.eligibleFusions().length) return 'eligible in Act 1';
  const ch = [{}, {}, {}];
  g._injectWeaponCard(ch);
  if (ch[2] && ch[2].key === 'fusion_' + G1) return 'card offered in Act 1';
  if (fe.acquire(G1)) return 'acquire succeeded in Act 1';
  for (let f = 0; f < 120; f++) g.update(1 / 60, IN());
  return fe.active.size === 0;
});
T('[G2] Boss Rush αποκλείεται, Chaos επιτρέπεται', () => {
  const d = FUSION_DEFS[G1];
  let g = freshRun(d.char, { chaos: true });
  g.meta.tryBuyFusionCard(G1); grantComponents(g, G1);
  if (!g.fusionEngine.eligibleFusions().includes(G1)) return 'not eligible in chaos';
  g._bossRush = true;
  if (g.fusionEngine.eligibleFusions().length) return 'eligible in boss rush';
  return true;
});
T('[G3] λάθος χαρακτήρας: κάρτα αγορασμένη + recipe ΔΕΝ αρκούν', () => {
  const d = FUSION_DEFS[G1];
  const other = FUSION_CARD_ORDER.map(f => FUSION_DEFS[f].char).find(c => c !== d.char);
  const g = freshRun(other);
  g.meta.tryBuyFusionCard(G1);
  grantComponents(g, G1);                            // τα universal components υπάρχουν
  return !g.fusionEngine.eligibleFusions().includes(G1) && !g.fusionEngine.acquire(G1);
});
T('[G4] μη αγορασμένη κάρτα: recipe μόνο του ΔΕΝ αρκεί', () => {
  const d = FUSION_DEFS[G1];
  const g = freshRun(d.char);
  grantComponents(g, G1);
  return !g.fusionEngine.eligibleFusions().includes(G1) && !g.fusionEngine.acquire(G1);
});
T('[G5] restart cleanup: reset() → νέο FusionEngine, καμία κατάσταση δεν επιβιώνει', () => {
  const d = FUSION_DEFS[G1];
  const g = freshRun(d.char);
  g.meta.tryBuyFusionCard(G1); grantComponents(g, G1);
  g.fusionEngine.acquire(G1);
  if (!g.fusionEngine.active.has(G1)) return 'no acquire';
  const feOld = g.fusionEngine;
  g.reset(); g._enterEndless();
  if (g.fusionEngine === feOld) return 'same instance survived reset';
  if (g.fusionEngine.active.size !== 0) return 'state survived reset';
  const w = g.buildEngine.weapons.get((d.replaces || [])[0]);
  if (w && w._fusionSuppressed) return 'suppression leaked into new run';
  return true;
});
T('[G6] menu cleanup: εκτός gameState "playing" τα fusion updates είναι no-op', () => {
  const d = FUSION_DEFS[G1];
  const g = freshRun(d.char);
  g.meta.tryBuyFusionCard(G1); grantComponents(g, G1);
  g.fusionEngine.acquire(G1);
  // Το goToMainMenu αλλάζει state μέσω fade στα επόμενα frames — τρέξε τα.
  g.goToMainMenu();
  for (let f = 0; f < 600 && g.gameState === 'playing'; f++) g.update(1 / 60, IN());
  if (g.gameState === 'playing') g.gameState = 'start_menu';   // headless fade fallback
  const st = g.fusionEngine.active.get(G1);
  const before = st ? st.t : 0;
  g.fusionEngine.update(1 / 60);
  const after = st ? st.t : 0;
  return before === after;                           // κανένα tick εκτός 'playing'
});
T('[G7] purchase persistence στο runtime: reload meta → κάρτα ενεργή, acquire όχι', () => {
  const d = FUSION_DEFS[G1];
  const g = freshRun(d.char);
  g.meta.tryBuyFusionCard(G1);
  // νέο Game ΧΩΡΙΣ clear του localStorage (προσομοίωση reload)
  Math.random = mulberry32(11);
  const g2 = new Game();
  g2.audio = null; g2.selectedCharacter = d.char; g2.gameState = 'playing';
  g2.reset(); g2._enterEndless();
  if (g2.meta.getFusionTier(G1) !== 1) return 'card lost on reload';
  if (g2.fusionEngine.active.size !== 0) return 'in-run acquire leaked across reload';
  grantComponents(g2, G1);
  return g2.fusionEngine.eligibleFusions().includes(G1);
});
T('[G8] tier scaling: Tier 3 ενεργοποιεί t3 μηχανική χωρίς σφάλμα (10 executors)', () => {
  for (const fid of IMPLEMENTED) {
    const d = FUSION_DEFS[fid];
    const g = freshRun(d.char);
    g.meta.protocolFragments = 500; g.meta.credits = 50000;
    g.meta.tryBuyFusionCard(fid); g.meta.tryBuyFusionCard(fid); g.meta.tryBuyFusionCard(fid);
    if (g.meta.getFusionTier(fid) !== 3) return fid + ': tier ' + g.meta.getFusionTier(fid);
    grantComponents(g, fid);
    const ch = [{}, {}, {}];
    g._injectWeaponCard(ch);
    if (!ch[2] || ch[2].key !== 'fusion_' + fid) return fid + ': no card at T3';
    ch[2].apply(g.player);
    for (let f = 0; f < 20 * 60; f++) {
      g.update(1 / 60, IN());
      if (g.upgradeUI) g.selectUpgrade(0);
      if (g.gameOver) break;
    }
    const st = g.fusionEngine?.active?.get(fid);
    if (!st) return fid + ': lost state at T3';
    if ((st._errs || 0) > 0) return fid + ': executor errors at T3';
    const log = g.buildEngine.log.byWeapon.get(fid);
    if (!log || !(log.total > 0)) return fid + ': no T3 damage';
  }
  return true;
});
T('[G9] chaos enhancement: ενεργό chaos δεν παράγει σφάλματα/NaN (10 executors)', () => {
  for (const fid of IMPLEMENTED) {
    const d = FUSION_DEFS[fid];
    const g = freshRun(d.char, { chaos: true });
    g.meta.tryBuyFusionCard(fid);
    grantComponents(g, fid);
    const ch = [{}, {}, {}];
    g._injectWeaponCard(ch);
    if (!ch[2] || ch[2].key !== 'fusion_' + fid) return fid + ': no chaos card';
    ch[2].apply(g.player);
    for (let f = 0; f < 15 * 60; f++) {
      g.update(1 / 60, IN());
      if (g.upgradeUI) g.selectUpgrade(0);
      if (g.gameOver) break;
    }
    const st = g.fusionEngine?.active?.get(fid);
    if (!st) return fid + ': lost state in chaos';
    if ((st._errs || 0) > 0) return fid + ': chaos executor errors';
    if (!Number.isFinite(g.player.pos.x)) return fid + ': NaN in chaos';
  }
  return true;
});
T('[G10] death cleanup: gameOver σταματά τα fusion updates', () => {
  const d = FUSION_DEFS[G1];
  const g = freshRun(d.char);
  g.meta.tryBuyFusionCard(G1); grantComponents(g, G1);
  g.fusionEngine.acquire(G1);
  g.gameOver = true;
  const st = g.fusionEngine.active.get(G1);
  const before = st.t;
  g.fusionEngine.update(1 / 60);
  return st.t === before;
});

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
