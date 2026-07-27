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
function diskWalkable(g, cx, cy, r, pad = 26) {
  const mode = g._walkMode?.(); const mm = g.mapManager;
  if (!mode || !mm?.isWalkableFootprint) return true;
  const R = 16 + pad;
  let bad = 0, total = 0;
  for (const k of [0, 0.35, 0.6, 0.85, 1]) {
    const n = k === 0 ? 1 : 64, rr = r * k;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2; total++;
      if (!mm.isWalkableFootprint(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, R, mode)) bad++;
    }
  }
  return { ok: bad === 0, bad, total };
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
  let worst = null;
  for (let i = 0; i < 10; i++) {
    const px = 3000 + i * 900, py = b ? (b.y0 + b.y1) / 2 + (i % 3 - 1) * 120 : 800;
    for (const [label, want] of [['NullBreach', 1100], ['BossRush', 700]]) {
      const pl = g._placeArena(px, py, want, 26);
      const chk = diskWalkable(g, pl.x, pl.y, pl.radius, 26);
      if (!chk.ok && (!worst || chk.bad > worst.bad)) worst = { ...chk, label, i, r: pl.radius };
    }
  }
  T('20 placements (10 positions x 2 arenas) are 100% standable across the whole disk',
    worst === null, worst ? `${worst.label} run ${worst.i}: ${worst.bad}/${worst.total} samples off-floor at r=${worst.r}` : '');

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
