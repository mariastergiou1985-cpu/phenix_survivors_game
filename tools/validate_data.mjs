// ═══════════════════════════════════════════════════════════════════════════════
// PHENIX DATA INTEGRITY VALIDATOR (Maria brief 2026-07-19, Part J)
// Run: node --import ./tools/register-hooks.mjs tools/validate_data.mjs   (από τη ρίζα του repo)
// Ελέγχει ΟΛΟΥΣ τους gameplay καταλόγους για: duplicate IDs, άγνωστες αναφορές,
// σπασμένες fusion συνταγές, χαρακτήρες που δεν υπάρχουν, self-referencing recipes.
// Ο validator ΔΕΝ αγγίζει το runtime — είναι εργαλείο development/CI.
// ═══════════════════════════════════════════════════════════════════════════════
import { WEAPON_DEFS as BE_W, PASSIVE_DEFS as BE_P, EVOLUTION_RECIPES as BE_E } from '../js/game/BuildEngine.js';
import '../js/game/BuildEngineChars1.js';
import '../js/game/BuildEngineChars2.js';
import '../js/game/BuildEngineChars3.js';
import '../js/game/BuildEngineChars4.js';
import '../js/game/BuildEngineChars5.js';
import '../js/game/BuildEnginePassives.js';
import { TACTICAL_DEFS, FUSION_TACTICALS } from '../js/game/TacticalWeaponCatalog.js';
import { ELEMENTS, FUSION_PAIRS, CHARACTER_ELEMENT, CHARACTER_FUSION, FUSION_FX } from '../js/Elements.js';

const CHARS = ['skeleton_warrior','taekwondo_girl','assassin_clone','brawler_warrior','euclid_vector',
               'oni_cataclysm_protocol','cyber_arm_hero','japan_phasewalker','eddie','dimis_kickboxer'];
let errors = 0, warns = 0;
const err  = m => { errors++; console.log('  ✗ ERROR:', m); };
const warn = m => { warns++;  console.log('  ⚠ warn :', m); };

// ── 1. Duplicate IDs across EVERY catalog ─────────────────────────────────────
console.log('▶ 1. Global ID uniqueness');
const seen = new Map();
const put = (id, src) => { if (seen.has(id)) err(`duplicate id '${id}' in ${src} (already in ${seen.get(id)})`); else seen.set(id, src); };
for (const id of Object.keys(BE_W)) put(id, 'BE.WEAPON_DEFS');
for (const id of Object.keys(BE_P)) put(id, 'BE.PASSIVE_DEFS');
for (const id of Object.keys(BE_E)) put(id, 'BE.EVOLUTION_RECIPES');
for (const id of Object.keys(TACTICAL_DEFS)) put(id, 'TACTICAL_DEFS');
for (const t of FUSION_TACTICALS) {
  // fusion tacticals are DELIBERATELY shared: the same object lives in TACTICAL_DEFS (lookup)
  // and FUSION_TACTICALS (recipe list). Same reference = intentional, different = duplicate.
  if (TACTICAL_DEFS[t.id] && TACTICAL_DEFS[t.id] !== t) err(`fusion tactical '${t.id}' shadowed by a DIFFERENT def in TACTICAL_DEFS`);
  else if (!TACTICAL_DEFS[t.id]) put(t.id, 'FUSION_TACTICALS');
}
for (const id of Object.keys(ELEMENTS)) put(id, 'ELEMENTS');

// ── 2. Build Engine internal references ───────────────────────────────────────
console.log('▶ 2. Build Engine refs (weapon↔catalyst↔evolution)');
for (const [id, w] of Object.entries(BE_W)) {
  if (w.owner && !CHARS.includes(w.owner) && w.owner !== null) err(`weapon '${id}' unknown owner '${w.owner}'`);
  if (w.evolutionPassive && !BE_P[w.evolutionPassive]) err(`weapon '${id}' → missing passive '${w.evolutionPassive}'`);
  if (w.evolution && !BE_E[w.evolution]) err(`weapon '${id}' → missing evolution '${w.evolution}'`);
}
for (const [id, e] of Object.entries(BE_E)) {
  if (!BE_W[e.weapon])  err(`evolution '${id}' requires unknown weapon '${e.weapon}'`);
  if (!BE_P[e.passive]) err(`evolution '${id}' requires unknown passive '${e.passive}'`);
  if (e.weapon === id)  err(`evolution '${id}' result equals input`);
}
for (const [id, p] of Object.entries(BE_P)) {
  if (p.forWeapon && !BE_W[p.forWeapon]) err(`passive '${id}' targets unknown weapon '${p.forWeapon}'`);
  if (p.requiredFor && !BE_E[p.requiredFor]) err(`passive '${id}' powers unknown evolution '${p.requiredFor}'`);
}

// ── 3. Tacticals ──────────────────────────────────────────────────────────────
console.log('▶ 3. Tacticals (' + Object.keys(TACTICAL_DEFS).length + ' + ' + FUSION_TACTICALS.length + ' fusions)');
for (const [id, t] of Object.entries(TACTICAL_DEFS)) {
  if (!t.name) err(`tactical '${id}' missing name`);
  if (t.character && t.character !== '__fusion__' && !CHARS.includes(t.character)) warn(`tactical '${id}' character '${t.character}' not in roster`);
}
for (const f of FUSION_TACTICALS) {
  if (!f.parents || f.parents.length !== 2) { err(`fusion tactical '${f.id}' needs exactly 2 parents`); continue; }
  for (const p of f.parents) if (!TACTICAL_DEFS[p]) err(`fusion tactical '${f.id}' unknown parent '${p}'`);
  if (f.parents.includes(f.id)) err(`fusion tactical '${f.id}' is its own parent`);
}

// ── 4. Elements + fusions ─────────────────────────────────────────────────────
console.log('▶ 4. Elements (' + Object.keys(ELEMENTS).length + ') + FUSION_PAIRS (' + Object.keys(FUSION_PAIRS).length + ')');
for (const [ch, el] of Object.entries(CHARACTER_ELEMENT)) {
  if (!ELEMENTS[el]) err(`CHARACTER_ELEMENT['${ch}'] → unknown element '${el}'`);
  if (!CHARS.includes(ch)) warn(`CHARACTER_ELEMENT has non-roster character '${ch}'`);
}
for (const key of Object.keys(FUSION_PAIRS)) {
  const parts = key.split('+');
  if (parts.length !== 2) { err(`FUSION_PAIRS malformed key '${key}'`); continue; }
  for (const p of parts) if (!ELEMENTS[p]) err(`FUSION_PAIRS '${key}' unknown element '${p}'`);
  if (parts[0] === parts[1]) err(`FUSION_PAIRS '${key}' fuses element with itself`);
}
// CHARACTER_FUSION maps a character to a FUSION_FX id; every fx id must also be
// reachable from at least one FUSION_PAIRS recipe (elements → fx).
const reachableFx = new Set(Object.values(FUSION_PAIRS));
for (const [ch, fx] of Object.entries(CHARACTER_FUSION || {})) {
  if (!FUSION_FX[fx]) err(`CHARACTER_FUSION['${ch}'] → unknown FUSION_FX '${fx}'`);
  else if (!reachableFx.has(fx)) warn(`CHARACTER_FUSION['${ch}'] fx '${fx}' has no FUSION_PAIRS recipe`);
}
for (const [pair, fx] of Object.entries(FUSION_PAIRS)) {
  if (!FUSION_FX[fx]) err(`FUSION_PAIRS['${pair}'] → unknown FUSION_FX '${fx}'`);
}

// ── 4b. Tactical runtime-required fields (the deploy path reads these) ────────
console.log('▶ 4b. Tactical required runtime fields');
for (const [id, t] of Object.entries(TACTICAL_DEFS)) {
  if (t.character === '__fusion__') continue;
  for (const f of ['behavior', 'baseDamage', 'duration']) {
    if (t[f] === undefined) warn(`tactical '${id}' missing runtime field '${f}'`);
  }
}
for (const [fx, def] of Object.entries(FUSION_FX)) {
  if (!def.kind) warn(`FUSION_FX '${fx}' missing 'kind'`);
}

// ── 5. Roster coverage ────────────────────────────────────────────────────────
console.log('▶ 5. Roster coverage (κάθε χαρακτήρας: element + ≥2 BE native weapons)');
for (const ch of CHARS) {
  if (!CHARACTER_ELEMENT[ch]) warn(`character '${ch}' has no element`);
  const natives = Object.values(BE_W).filter(w => w.owner === ch).length;
  if (natives < 2) warn(`character '${ch}' has ${natives} BE native weapons (spec: 2)`);
}

console.log('─'.repeat(60));
console.log(`RESULT: ${errors} errors, ${warns} warnings — ` + (errors === 0 ? 'PASS ✅' : 'FAIL ❌'));
process.exit(errors === 0 ? 0 : 1);
