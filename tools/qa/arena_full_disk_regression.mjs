// ARENA FULL-DISK PLACEMENT — the whole ring must be standable, not just its centre
// ------------------------------------------------------------------------------------------------
// Maria: the arena forms with only its middle on real ground while a large part of the ring is off
// the map, behind bounds or on top of buildings. That was arithmetic, not luck. The walkable band
// is 615 world px tall in Endless (rows 210-415 x scale 3) and 825 in Chaos (rows 135-410), while
// the Null Breach asked for radius 1100 (2200 across) and the Chaos Boss Rush for 700 (1400). No
// placement of a 2200px disk inside a 615px strip can ever be fully walkable.
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
let vclock = 0; globalThis.performance = { now: () => vclock };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
u0();

let pass = 0, fail = 0;
const T = (n, c, note = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${note ? ' | ' + note : ''}`); } };

function fresh(mode) {
  const un = muteConsole();
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  if (mode === 'chaos') g._beginChaosRun(); else g._enterEndless();
  g._chaosEntryGraceT = 0;
  un();
  return g;
}
// independent re-check: sample the ring ourselves rather than trusting the same helper twice
// TWO QUESTIONS, NOT ONE (2026-07-28). Until the main strips gained prop collision these were the
// same question, because nothing inside the band was solid. They are now different:
//   FLOOR   - is every sample of the disk on real deck? This is the property the arena exists to
//             guarantee, and it stays absolute: a ring hanging over the skyline or the void is a
//             ring the player can be pushed out of. ZERO tolerance, unchanged.
//   PROPS   - how much of the disk is occupied by kiosks, planters and machines? A boss arena
//             containing a planter is fine cover; an arena that is mostly furniture is not. This
//             is measured and bounded rather than forbidden.
// Requiring props-free disks made a full arena unplaceable on the 615px Endless band (measured
// 90-129 of 257 samples blocked at r=251-356), so production now validates arenas on FLOOR and
// this harness follows the same definition - while adding the prop budget so the relaxation
// cannot hide a genuinely unusable ring.
function diskWalkable(g, cx, cy, r, pad = 26) {
  const mode = g._walkMode?.(); const mm = g.mapManager;
  if (!mode || !mm?.isWalkableFootprint) return { ok: true, bad: 0, total: 0, props: 0 };
  const R = 16 + pad;
  const FLOOR = { ignoreProps: true };
  let bad = 0, props = 0, total = 0;
  for (const k of [0, 0.35, 0.6, 0.85, 1]) {
    const n = k === 0 ? 1 : 64, rr = r * k;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2; total++;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (!mm.isWalkableFootprint(x, y, R, mode, FLOOR)) bad++;
      // Prop occupancy is measured with the PLAYER's radius, not radius+pad: the pad is the
      // arena wall's clearance, and applying it here turns every 24px prop cell into a ~66px
      // exclusion zone, reporting a lightly furnished plaza as 40% blocked.
      else if (!mm.isWalkableFootprint(x, y, 16, mode)) props++;
    }
  }
  return { ok: bad === 0, bad, total, props };
}

for (const mode of ['endless', 'chaos']) {
  console.log(`\n=== ${mode.toUpperCase()} ===`);
  const g = fresh(mode);
  const b = g.getWalkableBounds();
  const bandH = b ? Math.round(b.y1 - b.y0) : null;
  console.log(`  walkable band height: ${bandH} world px`);

  // the radius must be fitted to the band it has to live in
  const fitted = g._arenaFitRadius(1100);
  T('requested 1100 radius is fitted to the band that exists',
    bandH == null || fitted * 2 <= bandH + 1, `fitted ${fitted}, band ${bandH}`);

  // ten placements from ten different player positions, every one fully re-verified
  let worst = null, worstProps = null;
  for (let i = 0; i < 10; i++) {
    const px = 3000 + i * 900, py = b ? (b.y0 + b.y1) / 2 + (i % 3 - 1) * 120 : 800;
    for (const [label, want] of [['NullBreach', 1100], ['BossRush', 700]]) {
      const pl = g._placeArena(px, py, want, 26);
      const chk = diskWalkable(g, pl.x, pl.y, pl.radius, 26);
      if (!chk.ok && (!worst || chk.bad > worst.bad)) worst = { ...chk, label, i, r: pl.radius };
      const pf = chk.total ? chk.props / chk.total : 0;
      if (!worstProps || pf > worstProps.pf) worstProps = { pf, label, i, r: pl.radius, props: chk.props, total: chk.total };
    }
  }
  T('20 placements (10 positions x 2 arenas) are 100% ON THE FLOOR across the whole disk',
    worst === null, worst ? `${worst.label} run ${worst.i}: ${worst.bad}/${worst.total} samples off-floor at r=${worst.r}` : '');
  console.log(`  worst prop occupancy inside an arena: ${(worstProps.pf * 100).toFixed(1)}% (${worstProps.props}/${worstProps.total}, ${worstProps.label} run ${worstProps.i} r=${worstProps.r})`);
  T('no arena is more furniture than floor (prop occupancy <= 25% of the disk)',
    worstProps.pf <= 0.25, `${(worstProps.pf * 100).toFixed(1)}% props in ${worstProps.label} run ${worstProps.i}`);

  // and the live arenas actually use it
  const un = muteConsole(); g.player.pos.x = 4200; g._enterNullBreachArena(); un();
  const ar = g._nullBreachArena;
  T('the live Null Breach arena is placed through the validator',
    !!ar && diskWalkable(g, ar.center.x, ar.center.y, ar.radius, 26).ok,
    ar ? `r=${ar.radius}` : 'no arena');
  T('the live Null Breach radius is no longer the impossible flat 1100',
    !!ar && ar.radius <= (bandH ? bandH / 2 + 1 : 1100), ar ? `r=${ar.radius}` : '');
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
