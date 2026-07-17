// ═══════════════════════════════════════════════════════════════════════════════
// P2.8 v2 — NULL ARSENAL (spec §7): ο κατάλογος του Build Engine.
// Tabs: CHARACTERS / WEAPONS / PASSIVES / EVOLUTIONS / TACTICALS / ELEMENTS / FUSIONS.
// ΕΝΑ data source (§13): όλα διαβάζονται από τα DEFS του BuildEngine — τίποτα δεν
// γράφεται δεύτερη φορά. Χρώματα §8 (weapon λευκό/ασημί, passive cyan, evolution
// χρυσό, tactical μοβ). Ύφος §9: 70% matte / 20% λευκή πληροφορία / 10% neon.
// SINGLE-TARGET DPS πάντα με πλήρες label (§6). DOM overlay πάνω από το menu —
// δεν αγγίζει gameState· ESC ή ✕ κλείνει. TACTICALS/ELEMENTS/FUSIONS: placeholders
// μέχρι το P2.7 migration (δηλωμένο μέσα στο ίδιο το UI).
// ═══════════════════════════════════════════════════════════════════════════════
import { WEAPON_DEFS, PASSIVE_DEFS, EVOLUTION_RECIPES, singleTargetDps }
  from './BuildEngine.js?v=20260719900000';
// P2.8 v2.1: τα TACTICALS/ELEMENTS/FUSIONS διαβάζονται read-only από τους
// ΥΠΑΡΧΟΝΤΕΣ καταλόγους του παλιού συστήματος (ίδια ?v με το Game.js) —
// καμία αλλαγή gameplay, μόνο παρουσίαση μέχρι το πλήρες migration.
import { TACTICAL_DEFS, FUSION_TACTICALS } from './TacticalWeaponCatalog.js?v=20260720000000';
import { ELEMENTS, ELEMENT_ICON, CHARACTER_ELEMENT, FUSION_PAIRS, CHARACTER_FUSION } from '../Elements.js?v=20260712520000';

const C = { weapon: '#e9ecf2', passive: '#4fd8ff', evolution: '#ffd447', tactical: '#b06bff',
            bg: '#0a0e14', panel: '#0d131c', line: '#1c2836', dim: '#8fa8b8', white: '#e9ecf2' };

// Σύντομες αδυναμίες ανά χαρακτήρα (dossier §7 — BEST WITH / WEAKNESS)
const WEAKNESS = {
  skeleton_warrior: 'Slow reposition — crowds can pin him against walls.',
  taekwondo_girl: 'Paper armor — everything must die before it touches her.',
  cyber_arm_hero: 'Long windups — loses value when forced to kite.',
  brawler_warrior: 'Needs the crowd — starves at long range.',
  assassin_clone: 'Burst or nothing — weak in long grinding fights.',
  japan_phasewalker: 'RNG identity — probability can betray a bad roll.',
  euclid_vector: 'Geometry needs setup — chaos breaks his lines.',
  oni_cataclysm_protocol: 'Overextends — the rage wants him deeper than is safe.',
  eddie: 'Rhythm-locked — interrupted beats cost real damage.',
  dimis_kickboxer: 'Slowest boots in Eden — must tank what others dodge.',
};

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmtArr = a => Array.isArray(a) ? a.join(' / ') : String(a ?? '—');

function discoveredSet() {
  try { return new Set(JSON.parse(localStorage.getItem('phenix_be_discovered') || '[]')); }
  catch (_) { return new Set(); }
}

// ── κάρτα όπλου: πραγματικά νούμερα από το DEF (§7) ─────────────────────────────
function weaponCard(id, d, game) {
  const ownerName = d.owner ? (game.characters?.find(c => c.id === d.owner)?.name || d.owner) : null;
  const badge = d.external ? '<span class="na-badge na-ext">OLD SYSTEM (wrap)</span>'
    : d.owner ? '<span class="na-badge na-native">NATIVE — ' + esc(ownerName) + '</span>'
    : '<span class="na-badge na-uni">UNIVERSAL</span>';
  const evoName = EVOLUTION_RECIPES[d.evolution]?.name || '—';
  const rows = [
    ['DAMAGE Lv1→5', fmtArr(d.damage)],
    ['COOLDOWN', fmtArr(d.cooldown)],
    ['AMOUNT', fmtArr(d.amount)],
    d.pierce ? ['PIERCE', fmtArr(d.pierce)] : null,
    d.pulseRadius ? ['PULSE RADIUS', fmtArr(d.pulseRadius)] : null,
    d.radius ? ['RADIUS', fmtArr(d.radius)] : null,
    d.range ? ['RANGE', String(d.range)] : null,
    ['CRIT', (d.critChance * 100).toFixed(0) + '% ×' + d.critMult],
    d.knockback ? ['KNOCKBACK', String(d.knockback)] : null,
    ['BOSS MOD', '×' + d.bossMultiplier],
    ['ACTIVE CAP', String(d.maxActive)],
  ].filter(Boolean).map(([k, v]) => '<tr><td>' + k + '</td><td>' + esc(v) + '</td></tr>').join('');
  return '<div class="na-card" style="--acc:' + C.weapon + '">' +
    '<div class="na-name">' + esc(d.name) + ' ' + badge + '</div>' +
    '<div class="na-tags">' + (d.tags || []).map(t => '<i>' + esc(t) + '</i>').join('') + '</div>' +
    '<div class="na-desc">' + esc(d.desc) + '</div>' +
    '<table class="na-t">' + rows + '</table>' +
    '<div class="na-dps">SINGLE-TARGET DPS: ' + singleTargetDps(d, 1) + ' → ' + singleTargetDps(d, 5) + '</div>' +
    '<div class="na-evo">Catalyst: <b style="color:' + C.passive + '">' + esc(PASSIVE_DEFS[d.evolutionPassive]?.name || '—') + '</b>' +
    ' → Evolution: <b style="color:' + C.evolution + '">' + esc(evoName) + '</b></div></div>';
}

function passiveCard(id, p) {
  const isCat = p.category === 'evolution_passive';
  const bon = isCat && p.bonuses
    ? '<table class="na-t">' + p.bonuses.map((b, i) =>
        '<tr><td>Lv' + (i + 1) + '</td><td>' + esc(Object.entries(b).map(([k, v]) => k + ' +' + (v < 1 ? (v * 100) + '%' : v)).join(' · ')) + '</td></tr>').join('') + '</table>'
    : '<div class="na-desc" style="color:' + C.dim + '">Max level: ' + p.maxLevel + '</div>';
  const link = isCat ? '<div class="na-evo">For <b>' + esc(WEAPON_DEFS[p.forWeapon]?.name || p.forWeapon) + '</b> → unlocks <b style="color:' + C.evolution + '">' + esc(EVOLUTION_RECIPES[p.requiredFor]?.name || '') + '</b></div>' : '';
  return '<div class="na-card" style="--acc:' + C.passive + '">' +
    '<div class="na-name">' + (isCat ? '◈ ' : '◆ ') + esc(p.name) +
    ' <span class="na-badge na-cat">' + (isCat ? 'EVOLUTION CATALYST' : 'BUILD PASSIVE §26-50') + '</span></div>' +
    '<div class="na-desc">' + esc(p.desc) + '</div>' + bon + link + '</div>';
}

// ── Evolution Path (§7): όπλο + catalyst → evolution, locked silhouette + DISCOVERY ──
function evolutionRow(eid, r, disc) {
  const w = WEAPON_DEFS[r.weapon], p = PASSIVE_DEFS[r.passive];
  const found = disc.has(eid);
  const stats = found
    ? '<div class="na-desc">' + esc(r.desc) + '</div>' +
      '<div class="na-dps">' + [r.damage ? 'DMG ' + r.damage : '', r.cooldown ? 'CD ' + r.cooldown : '',
        r.amount ? 'AMOUNT ' + r.amount : '', 'BOSS ×' + r.bossMultiplier].filter(Boolean).join(' · ') + '</div>'
    : '<div class="na-desc" style="color:' + C.dim + ';font-style:italic">Undiscovered — its true form is hidden.</div>';
  return '<div class="na-card na-evoRow" style="--acc:' + C.evolution + (found ? '' : ';opacity:.55') + '">' +
    '<div class="na-path">' +
      '<span style="color:' + C.weapon + '">' + esc(w?.name || r.weapon) + ' <em>Lv' + r.weaponLevel + '</em></span>' +
      '<b>+</b><span style="color:' + C.passive + '">' + esc(p?.name || r.passive) + ' <em>Lv' + r.passiveLevel + '</em></span>' +
      '<b>→</b><span class="na-evoName">' + (found ? '★ ' + esc(r.name) : '◼ ' + esc(r.name)) + '</span></div>' +
    stats +
    '<div class="na-disc">DISCOVERY: reach <b>' + esc(w?.name || '') + ' Lv' + r.weaponLevel + '</b> with <b>' +
    esc(p?.name || '') + ' Lv' + r.passiveLevel + '</b>' +
    (w?.owner ? ' — native evolution, <b>' + esc(w.owner) + '</b> only' : ' — any character') + '</div></div>';
}

function dossier(ch, game) {
  const natives = Object.entries(WEAPON_DEFS).filter(([, d]) => d.owner === ch.id);
  const strip = natives.map(([id, d]) =>
    '<div class="na-nat"><b style="color:' + C.weapon + '">' + esc(d.name) + '</b>' +
    ' <span style="color:' + C.dim + '">ST-DPS ' + singleTargetDps(d, 1) + '→' + singleTargetDps(d, 5) + '</span>' +
    ' <span style="color:' + C.evolution + '">★ ' + esc(EVOLUTION_RECIPES[d.evolution]?.name || '') + '</span></div>').join('')
    || '<div class="na-nat" style="color:' + C.dim + '">Native pair wired via the old system until P2.7.</div>';
  return '<div class="na-card" style="--acc:' + esc(ch.fallbackColor || C.weapon) + '">' +
    '<div class="na-name">' + esc(ch.name) + ' <span class="na-badge na-role">' + esc(ch.role) + '</span></div>' +
    '<div class="na-desc">' + esc(ch.specialty) + '</div>' +
    '<div class="na-sub">NATIVE ARSENAL</div>' + strip +
    '<div class="na-sub">BEST WITH</div><div class="na-desc">' +
    'Universals: Null Lance · Ion Halo · Gravity Core · Nano Mine · Blacknet Drone — all pair with the native kit.</div>' +
    '<div class="na-sub" style="color:#ff8a96">WEAKNESS</div><div class="na-desc">' + esc(WEAKNESS[ch.id] || '—') + '</div></div>';
}

// ── TACTICALS (μοβ §8) — από το TACTICAL_DEFS του παλιού συστήματος ─────────────
function tacticalCard(d, game) {
  const ownerName = d.character ? (game.characters?.find(c => c.id === d.character)?.name || d.character) : null;
  const rows = [
    d.baseDamage ? ['BASE DAMAGE', String(d.baseDamage)] : null,
    d.aoeRadius ? ['AOE RADIUS', String(d.aoeRadius)] : null,
    d.tickRate ? ['TICK', d.tickRate + 's'] : null,
    d.duration ? ['DURATION', d.duration + 's'] : null,
    d.behavior ? ['BEHAVIOR', String(d.behavior)] : null,
  ].filter(Boolean).map(([k, v]) => '<tr><td>' + k + '</td><td>' + esc(v) + '</td></tr>').join('');
  return '<div class="na-card" style="--acc:' + C.tactical + '">' +
    '<div class="na-name" style="color:' + C.tactical + '">▣ ' + esc(d.name) +
    (ownerName ? ' <span class="na-badge na-native">' + esc(ownerName) + '</span>' : '') + '</div>' +
    '<div class="na-desc">' + esc(d.description || '') + '</div>' +
    '<table class="na-t">' + rows + '</table></div>';
}
// ── ELEMENTS — από το ELEMENTS/CHARACTER_ELEMENT του Elements.js ────────────────
function elementCard(key, el, game) {
  const owners = Object.entries(CHARACTER_ELEMENT).filter(([, e]) => e === key)
    .map(([cid]) => game.characters?.find(c => c.id === cid)?.name || cid);
  return '<div class="na-card" style="--acc:' + esc(el.c1) + '">' +
    '<div class="na-name" style="color:' + esc(el.c1) + '">' + esc(ELEMENT_ICON[key] || '◆') + ' ' + esc(el.name) + '</div>' +
    '<table class="na-t">' +
    '<tr><td>STYLE</td><td>' + esc(el.style) + '</td></tr>' +
    '<tr><td>BURST LIFE</td><td>' + el.life + 's</td></tr>' +
    (owners.length ? '<tr><td>WIELDED BY</td><td>' + esc(owners.join(' · ')) + '</td></tr>' : '') +
    '</table></div>';
}
// ── FUSIONS — δίχρωμες κάρτες (§8) από FUSION_PAIRS + fusion tacticals ─────────
function fusionCard(pair, result, game) {
  const [a, b] = pair.split('+');
  const eA = ELEMENTS[a], eB = ELEMENTS[b];
  const owners = Object.entries(CHARACTER_FUSION || {}).filter(([, f]) => f === result)
    .map(([cid]) => game.characters?.find(c => c.id === cid)?.name || cid);
  return '<div class="na-card" style="--acc:' + esc(eA?.c1 || C.white) + ';border-right:3px solid ' + esc(eB?.c1 || C.white) + '">' +
    '<div class="na-name"><span style="color:' + esc(eA?.c1 || '#fff') + '">' + esc(eA?.name || a) + '</span>' +
    ' <span style="color:' + C.dim + '">+</span> <span style="color:' + esc(eB?.c1 || '#fff') + '">' + esc(eB?.name || b) + '</span>' +
    ' <span style="color:' + C.dim + '">→</span> <b style="color:' + C.white + '">' + esc(String(result).toUpperCase().replace(/_/g, ' ')) + '</b></div>' +
    (owners.length ? '<div class="na-desc" style="color:' + C.dim + '">Signature fusion: ' + esc(owners.join(' · ')) + '</div>' : '') +
    '</div>';
}

export function openNullArsenal(game) {
  if (document.getElementById('na-root')) return;
  const disc = discoveredSet();
  const root = document.createElement('div');
  root.id = 'na-root';
  root.innerHTML = '<style>' +
    '#na-root{position:fixed;inset:0;z-index:220;background:rgba(4,7,11,.94);color:' + C.white + ';font-family:Consolas,monospace;display:flex;flex-direction:column;}' +
    '#na-head{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid ' + C.line + ';}' +
    '#na-head h1{font-size:20px;letter-spacing:3px;color:' + C.white + ';margin:0;font-weight:bold;}' +
    '#na-head h1 b{color:' + C.passive + ';}' +
    '#na-close{margin-left:auto;background:#12060a;border:1px solid #ff6a7a;color:#ff9aa8;font:bold 14px Consolas;padding:8px 16px;cursor:pointer;border-radius:6px;}' +
    '#na-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px;border-bottom:1px solid ' + C.line + ';}' +
    '.na-tab{background:' + C.panel + ';border:1px solid ' + C.line + ';color:' + C.dim + ';font:12px Consolas;letter-spacing:1px;padding:7px 13px;cursor:pointer;border-radius:5px;}' +
    '.na-tab.on{color:#0a0e14;background:' + C.passive + ';border-color:' + C.passive + ';font-weight:bold;}' +
    '#na-body{flex:1;overflow-y:auto;padding:16px 18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;align-content:start;}' +
    '.na-card{background:' + C.panel + ';border:1px solid ' + C.line + ';border-left:3px solid var(--acc);border-radius:6px;padding:11px 13px;}' +
    '.na-name{font-size:14px;font-weight:bold;color:var(--acc);margin-bottom:5px;}' +
    '.na-badge{font-size:9px;letter-spacing:1px;padding:2px 6px;border-radius:3px;vertical-align:middle;margin-left:6px;}' +
    '.na-native{background:#1a2416;color:#9dff6b;} .na-uni{background:#101a26;color:#7fd8ff;} .na-ext{background:#26170f;color:#ffb46b;}' +
    '.na-cat{background:#0e1c26;color:' + C.passive + ';} .na-role{background:#161226;color:#c8a8ff;}' +
    '.na-tags i{font-style:normal;font-size:9px;color:' + C.dim + ';border:1px solid ' + C.line + ';padding:1px 5px;border-radius:3px;margin-right:4px;}' +
    '.na-desc{font-size:11.5px;color:#c2cdd6;line-height:1.45;margin:7px 0;}' +
    '.na-t{width:100%;font-size:10.5px;border-collapse:collapse;margin:6px 0;}' +
    '.na-t td{padding:2.5px 4px;border-bottom:1px solid ' + C.line + ';} .na-t td:first-child{color:' + C.dim + ';white-space:nowrap;}' +
    '.na-dps{font-size:11px;color:' + C.white + ';background:#101820;padding:5px 8px;border-radius:4px;margin:7px 0;}' +
    '.na-evo{font-size:10.5px;color:' + C.dim + ';margin-top:6px;}' +
    '.na-sub{font-size:10px;letter-spacing:2px;color:' + C.passive + ';margin:9px 0 4px;}' +
    '.na-nat{font-size:11px;margin:3px 0;}' +
    '.na-path{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;margin-bottom:5px;}' +
    '.na-path b{color:' + C.dim + ';} .na-path em{font-style:normal;color:' + C.dim + ';font-size:10px;}' +
    '.na-evoName{color:' + C.evolution + ';font-weight:bold;}' +
    '.na-disc{font-size:10px;color:' + C.dim + ';border-top:1px dashed ' + C.line + ';padding-top:6px;margin-top:7px;}' +
    '.na-pending{grid-column:1/-1;text-align:center;color:' + C.dim + ';font-size:13px;line-height:2;padding:60px 20px;}' +
    '@media (max-width:760px){#na-body{grid-template-columns:1fr;}#na-head h1{font-size:15px;letter-spacing:2px;}}' +
    '</style>' +
    '<div id="na-head"><h1>❖ NULL <b>ARSENAL</b></h1><button id="na-close">✕ CLOSE [ESC]</button></div>' +
    '<div id="na-tabs"></div><div id="na-body"></div>';
  document.body.appendChild(root);

  const TABS = ['CHARACTERS', 'WEAPONS', 'PASSIVES', 'EVOLUTIONS', 'TACTICALS', 'ELEMENTS', 'FUSIONS'];
  const body = root.querySelector('#na-body'), tabsEl = root.querySelector('#na-tabs');
  const render = tab => {
    tabsEl.querySelectorAll('.na-tab').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    if (tab === 'CHARACTERS')
      body.innerHTML = (game.characters || []).map(ch => dossier(ch, game)).join('');
    else if (tab === 'WEAPONS')
      body.innerHTML = Object.entries(WEAPON_DEFS).map(([id, d]) => weaponCard(id, d, game)).join('');
    else if (tab === 'PASSIVES')
      body.innerHTML = Object.entries(PASSIVE_DEFS).map(([id, p]) => passiveCard(id, p)).join('');
    else if (tab === 'EVOLUTIONS')
      body.innerHTML = Object.entries(EVOLUTION_RECIPES).map(([eid, r]) => evolutionRow(eid, r, disc)).join('');
    else if (tab === 'TACTICALS')
      body.innerHTML = Object.values(TACTICAL_DEFS).map(d => tacticalCard(d, game)).join('') +
        (FUSION_TACTICALS?.length ? '<div class="na-card" style="--acc:' + C.tactical + ';grid-column:1/-1">' +
          '<div class="na-name" style="color:' + C.tactical + '">▣▣ TACTICAL FUSIONS</div>' +
          '<div class="na-desc">Deploy BOTH parent tacticals in one run to unlock their fusion: ' +
          esc(FUSION_TACTICALS.map(f => f.name || f.result || '').filter(Boolean).join(' · ')) + '</div></div>' : '');
    else if (tab === 'ELEMENTS')
      body.innerHTML = Object.entries(ELEMENTS).map(([k, el]) => elementCard(k, el, game)).join('');
    else if (tab === 'FUSIONS')
      body.innerHTML = Object.entries(FUSION_PAIRS).map(([pair, res]) => fusionCard(pair, res, game)).join('');
    body.scrollTop = 0;
  };
  for (const t of TABS) {
    const b = document.createElement('button');
    b.className = 'na-tab'; b.dataset.t = t; b.textContent = t;
    b.addEventListener('click', () => render(t));
    tabsEl.appendChild(b);
  }
  const close = () => { document.removeEventListener('keydown', onKey, true); root.remove(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  root.querySelector('#na-close').addEventListener('click', close);
  render('CHARACTERS');
}
