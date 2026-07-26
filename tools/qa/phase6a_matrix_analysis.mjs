// PHASE 6A — CLOSURE MATRIX ANALYSIS
// Reads qa_reports/phase6a_matrix.jsonl (one run per line, produced by
// phase6a_pressure_telemetry.mjs --batch) and answers the closure gates with numbers.
// Reporting only: this file never touches production and never re-runs the game.
import fs from 'node:fs';
const L = fs.readFileSync(process.argv[2] || 'qa_reports/phase6a_matrix.jsonl', 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));
const n2 = x => x == null ? 'n/a' : (+x).toFixed(1);
const pct = (a, q) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * q))]; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const D = a => a.length ? { n: a.length, min: Math.min(...a), p25: pct(a, .25), median: pct(a, .5), mean: +mean(a).toFixed(1), p75: pct(a, .75), max: Math.max(...a) } : { n: 0 };
const by = (rows, f) => rows.reduce((m, r) => { (m[f(r)] ||= []).push(r); return m; }, {});
const main = L.filter(r => r.mode !== 'act1'), act1 = L.filter(r => r.mode === 'act1');

console.log('═══ PHASE 6A CLOSURE MATRIX ═══');
console.log(`runs: ${L.length}  (endless ${L.filter(r=>r.mode==='endless').length}, chaos ${L.filter(r=>r.mode==='chaos').length}, act1 control ${act1.length})`);
console.log(`errors: ${L.filter(r=>r.error).length}  ·  unattributed damage buckets: ${L.reduce((a,r)=>a+(r.unattributed||[]).length,0)}  ·  XP unexplained: ${L.reduce((a,r)=>a+(r.xpAccounting?.unexplained||0),0)}`);
console.log(`censored runs (survived the 240s horizon): ${L.filter(r=>r.censored).length}/${L.length}`);

console.log('\n── 1. SURVIVAL ───────────────────────────────────────────────');
for (const [k, rows] of Object.entries(by(main, r => `${r.mode}/${r.skill}`))) {
  const t = rows.map(r => r.timeAlive);
  console.log(`  ${k.padEnd(18)} ${JSON.stringify(D(t))}  censored ${rows.filter(r=>r.censored).length}/${rows.length}`);
}
console.log('  — skill advantage (expert vs competent, same mode/char/seed):');
for (const mode of ['endless', 'chaos']) {
  const deltas = [];
  for (const r of main.filter(x => x.mode === mode && x.skill === 'expert')) {
    const c = main.find(x => x.mode === mode && x.skill === 'competent' && x.char === r.char && x.seed === r.seed);
    if (c) deltas.push(+(r.timeAlive - c.timeAlive).toFixed(1));
  }
  const wins = deltas.filter(d => d > 0).length;
  console.log(`    ${mode.padEnd(8)} Δt ${JSON.stringify(D(deltas))}  expert longer in ${wins}/${deltas.length} pairs`);
}
console.log('  — per character (both modes, both profiles):');
for (const [k, rows] of Object.entries(by(main, r => r.char)))
  console.log(`    ${k.padEnd(18)} ${JSON.stringify(D(rows.map(r => r.timeAlive)))}`);
console.log('  — seed spread per cell (max-min over the 2 seeds); >90s marks a cell needing a 3rd seed:');
const hi = [];
for (const [k, rows] of Object.entries(by(main, r => `${r.mode}/${r.skill}/${r.char}`))) {
  const t = rows.map(r => r.timeAlive); const spread = +(Math.max(...t) - Math.min(...t)).toFixed(1);
  if (spread > 90) hi.push({ cell: k, spread, times: t });
}
console.log(hi.length ? hi.map(h => `    ${h.cell}  spread ${h.spread}s  ${JSON.stringify(h.times)}`).join('\n') : '    none — every cell inside 90s spread');

console.log('\n── 2. DAMAGE ATTRIBUTION ─────────────────────────────────────');
const agg = {};
for (const r of main) for (const [k, v] of Object.entries(r.damageByReason || {})) agg[k] = (agg[k] || 0) + v.hp;
const tot = Object.values(agg).reduce((a, b) => a + b, 0);
Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${n2(v).padStart(9)} HP  ${n2(100*v/tot).padStart(5)}%`));
const topSrc = {};
for (const r of main) { const t = Object.entries(r.damageByReason||{}).sort((a,b)=>b[1].hp-a[1].hp)[0]; if (t) topSrc[t[0]] = (topSrc[t[0]]||0)+1; }
console.log('  top source per run:', JSON.stringify(topSrc));
const kb = {}; for (const r of main) if (r.killingBlow) kb[r.killingBlow] = (kb[r.killingBlow]||0)+1;
console.log('  killing blows:', JSON.stringify(kb));

console.log('\n── 3. HORDE FAIRNESS ─────────────────────────────────────────');
const hclass = {}; let hev = 0, hunav = 0;
for (const r of main) { const h = r.hordeFairness || {}; hev += h.events || 0;
  for (const [k, v] of Object.entries(h.classes || {})) { hclass[k] = (hclass[k]||0)+v; if (k==='C_CORNERED'||k==='D_CANNOT_DISENGAGE') hunav += v; } }
console.log('  classes:', JSON.stringify(hclass));
console.log(`  events ${hev}  ·  unavoidable (C_CORNERED + D_CANNOT_DISENGAGE) ${hunav} = ${n2(100*hunav/Math.max(1,hev))}%`);
console.log('  per-run unavoidable%:', JSON.stringify(D(main.map(r => r.hordeFairness?.unavoidablePct).filter(x => x != null))));
console.log('  free arcs at horde hits (classifier radius):', JSON.stringify(D(main.map(r => r.freeArcsWide?.median).filter(x => x != null))));
console.log('  escape corridor at contact range (near):', JSON.stringify(D(main.map(r => r.escapeCorridor?.median).filter(x => x != null))));
console.log('  simultaneous touching bodies (median / max per run):',
  JSON.stringify(D(main.map(r => r.contact?.medBodies).filter(x=>x!=null))), JSON.stringify(D(main.map(r => r.contact?.maxBodies).filter(x=>x!=null))));
const outr = main.reduce((a,r)=>a+(r.hordeFairness?.outrunnable||0),0), nout = main.reduce((a,r)=>a+(r.hordeFairness?.notOutrunnable||0),0);
console.log(`  outrunnable contacts ${outr} vs not-outrunnable ${nout} (${n2(100*nout/Math.max(1,outr+nout))}% not outrunnable)`);

console.log('\n── 4. DASH COUNTERPLAY ───────────────────────────────────────');
console.log('  dashes/run:', JSON.stringify(D(main.map(r => r.dash?.count).filter(x=>x!=null))));
console.log('  dashes started while in contact:', JSON.stringify(D(main.map(r => r.dash?.inContact).filter(x=>x!=null))));
console.log('  contact broken 0.5s after such a dash:', JSON.stringify(D(main.map(r => r.dash?.escapeRatePct).filter(x=>x!=null))), '%');
const dIn = main.reduce((a,r)=>a+(r.dash?.inContact||0),0), dEs = main.reduce((a,r)=>a+(r.dash?.escapes||0),0);
console.log(`  pooled: ${dEs}/${dIn} = ${n2(100*dEs/Math.max(1,dIn))}% of in-contact dashes broke contact`);
console.log('  slower characters — dash escape rate by character:');
for (const [k, rows] of Object.entries(by(main, r => r.char))) {
  const i = rows.reduce((a,r)=>a+(r.dash?.inContact||0),0), e = rows.reduce((a,r)=>a+(r.dash?.escapes||0),0);
  console.log(`    ${k.padEnd(18)} ${e}/${i} = ${n2(100*e/Math.max(1,i))}%   survival median ${n2(pct(rows.map(x=>x.timeAlive),.5))}s`);
}

console.log('\n── 5. AIRSTRIKE / HAZARD FAIRNESS ────────────────────────────');
const ac = {}; let ah = 0, au = 0;
for (const r of main) { const a = r.airstrikeFairness || {}; ah += a.hits || 0;
  for (const [k, v] of Object.entries(a.classes || {})) { ac[k]=(ac[k]||0)+v; if (/^[CDE]_/.test(k)) au += v; } }
console.log('  classes:', JSON.stringify(ac));
console.log(`  hits ${ah}  ·  unavoidable ${au} = ${n2(100*au/Math.max(1,ah))}%`);
const sd = main.map(r => r.airstrikeFairness?.spawnDistanceByType?.airstrike?.min).filter(x=>x!=null);
console.log('  minimum airstrike spawn distance per run:', JSON.stringify(D(sd)), '(production floor is 120px)');

console.log('\n── 6. EVENT OVERLAP ──────────────────────────────────────────');
const pairSec = {}, pairDmg = {};
for (const r of main) for (const [k, v] of Object.entries(r.overlapMatrix?.topOverlaps || {})) {
  pairSec[k] = (pairSec[k]||0)+v.seconds; pairDmg[k] = (pairDmg[k]||0)+v.damage; }
const totDmg = tot;
Object.entries(pairSec).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v]) =>
  console.log(`  ${k.padEnd(34)} ${n2(v).padStart(7)}s  ${n2(pairDmg[k]).padStart(8)} HP  ${n2(100*(pairDmg[k]||0)/totDmg).padStart(5)}% of all damage`));

console.log('\n── 7. PROGRESSION ────────────────────────────────────────────');
console.log('  level reached:', JSON.stringify(D(main.map(r => r.level))));
console.log('  XP collected/min:', JSON.stringify(D(main.map(r => r.xpAccounting?.collectedPerMin).filter(x=>x!=null))));
console.log('  levels/min:', JSON.stringify(D(main.map(r => r.progression?.levelsPerMin).filter(x=>x!=null))));
console.log('  card screens/run:', JSON.stringify(D(main.map(r => r.evolutions?.cardScreens).filter(x=>x!=null))));
console.log('  evolution cards OFFERED across all runs:', main.reduce((a,r)=>a+(r.evolutions?.evolutionCardsOffered||0),0));
console.log('  evolutions COMPLETED across all runs:', main.reduce((a,r)=>a+(r.evolutions?.count||0),0));
console.log('  weapons owned at end:', JSON.stringify(D(main.map(r => r.evolutions?.weaponsOwned).filter(x=>x!=null))));

console.log('\n── 8. MOVEMENT / STATIONARY ──────────────────────────────────');
console.log('  movement px/run:', JSON.stringify(D(main.map(r => r.movementPx))));
console.log('  stationary frame %:', JSON.stringify(D(main.map(r => r.stationary?.pct).filter(x=>x!=null))));

console.log('\n── 9. PERFORMANCE (headless update cost, ms) ─────────────────');
console.log('  p95:', JSON.stringify(D(main.map(r => r.performance?.updateMs?.p95).filter(x=>x!=null))));
console.log('  p99:', JSON.stringify(D(main.map(r => r.performance?.updateMs?.p99).filter(x=>x!=null))));
console.log('  max:', JSON.stringify(D(main.map(r => r.performance?.updateMs?.max).filter(x=>x!=null))));

console.log('\n── 10. ACT 1 CONTROL ─────────────────────────────────────────');
console.log('  survival:', JSON.stringify(D(act1.map(r => r.timeAlive))), ' censored', act1.filter(r=>r.censored).length + '/' + act1.length);
const a1 = {}; for (const r of act1) for (const [k,v] of Object.entries(r.damageByReason||{})) a1[k]=(a1[k]||0)+v.hp;
console.log('  damage by reason:', JSON.stringify(Object.fromEntries(Object.entries(a1).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>[k,+v.toFixed(0)]))));
console.log('  level:', JSON.stringify(D(act1.map(r=>r.level))), ' unattributed:', act1.reduce((a,r)=>a+(r.unattributed||[]).length,0));
