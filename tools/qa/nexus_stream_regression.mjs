// NEXUS STREAMING + WORLD-REBASE REGRESSION — real modules, no browser, no network.
// Run: node tools/qa/nexus_stream_regression.mjs   (exit 1 on any failure)
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);

globalThis.window = globalThis;
globalThis.document = { addEventListener(){}, createElement: () => ({ style:{}, getContext:()=>null, addEventListener(){} }) };
globalThis.Image = class { constructor(){ this.complete=false; this.naturalWidth=0; } set src(_){} };
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS   = path.resolve(HERE, '../../js');                       // repo-relative, no absolute paths
const { NexusManager } = await import(path.join(JS, 'game/NexusManager.js'));
const { ChunkManager } = await import(path.join(JS, 'game/ChunkManager.js'));
const { BIOME_ID, CHUNK_SIZE } = await import(path.join(JS, 'game/MapManager.js'));

let pass = 0, fail = 0;
const T = (n, f) => { let ok=false, note='';
  try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; }
  catch (e) { note = 'THREW: ' + e.message; }
  ok ? pass++ : fail++; console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`); };

const B = [BIOME_ID.INDUSTRIAL_CORE, BIOME_ID.ABYSSAL_TRENCH, BIOME_ID.GLACIAL_EXPANSE,
           BIOME_ID.ORBITAL_NEXUS, BIOME_ID.DATA_WASTES];
const mkNexus = () => { const m = new NexusManager({ endless:true }); m.init(3000,1688); m.repositionForEndless(); return m; };
const mkChunks = () => new ChunkManager({ game:{}, events:null, seed:42 });
const outer   = (m) => m.matrices.filter(x => x.isOuterNexus);
const central = (m) => m.matrices.filter(x => !x.isOuterNexus);
const settle  = (m, b, secs=2) => { for (let i=0;i<secs*60;i++) m._syncOuterNexus(b, 1/60); };

console.log('═══ NEXUS STREAMING + REBASE REGRESSION ═══\n── A. idempotency ──');
const a = mkNexus();
T('repositionForEndless x1 → 5 records', () => a.outerRecords.length===5 || 'got '+a.outerRecords.length);
a.repositionForEndless(); a.repositionForEndless();
T('repositionForEndless x3 → ακόμα 5 records', () => a.outerRecords.length===5 || 'got '+a.outerRecords.length);
T('central παραμένουν 4', () => central(a).length===4 || 'got '+central(a).length);
T('0 duplicate biome IDs', () => new Set(a.outerRecords.map(r=>r.biomeId)).size===5);

console.log('\n── B. A → B → A state ──');
const m = mkNexus();
settle(m, B[0]);  T('biome A → outer active = 1', () => outer(m).length===1 || 'got '+outer(m).length);
outer(m)[0].stored = 3;
settle(m, B[1]);  T('biome B → active ακόμα 1, instance του B', () => outer(m).length===1 && outer(m)[0].biomeId===B[1]);
settle(m, B[0]);  T('επιστροφή A → charge 3 διατηρήθηκε', () => outer(m)[0].stored===3 || 'stored='+outer(m)[0].stored);

console.log('\n── C. rebase stability (dx = −10032) ──');
const cm = mkChunks(); const nm = mkNexus();
let px = 15000, py = 300;
const biomeAt = (x,y) => cm.getBiomeForWorldPosition(x,y);
settle(nm, biomeAt(px,py));
const before = { px, logical: cm.toLogical(px,py).x, biome: biomeAt(px,py),
                 inst: outer(nm)[0], n: outer(nm).length,
                 charge: outer(nm)[0]?.stored, ox: outer(nm)[0]?.pos.x };
const dx = -10032;
cm.applyWorldRebase(dx, 0);            // logical origin moves once
px += dx;                              // physical objects shift
if (before.inst) before.inst.pos.x += dx;
settle(nm, biomeAt(px,py));
const after = { px, logical: cm.toLogical(px,py).x, biome: biomeAt(px,py),
                inst: outer(nm)[0], n: outer(nm).length,
                charge: outer(nm)[0]?.stored, ox: outer(nm)[0]?.pos.x };
T('physical player Δx = −10032', () => after.px-before.px===dx || 'got '+(after.px-before.px));
T('LOGICAL player Δx = 0', () => after.logical-before.logical===0 || 'got '+(after.logical-before.logical));
T('biome ΑΜΕΤΑΒΛΗΤΟ', () => after.biome===before.biome || `${before.biome} → ${after.biome}`);
T('ίδιο outer instance (κανένα respawn)', () => after.inst===before.inst);
T('outer active ακόμα 1', () => after.n===1 || 'got '+after.n);
T('charge αμετάβλητο', () => after.charge===before.charge);
T('outer physical Δx = −10032', () => after.ox-before.ox===dx || 'got '+(after.ox-before.ox));

console.log('\n── D. 10 συνεχόμενα rebases ──');
const cm2 = mkChunks(); const nm2 = mkNexus();
let px2 = 40000; const l0 = cm2.toLogical(px2,py).x, b0 = cm2.getBiomeForWorldPosition(px2,py);
settle(nm2, b0); const inst0 = outer(nm2)[0];
for (let i=0;i<10;i++){ cm2.applyWorldRebase(dx,0); px2+=dx; if(inst0) inst0.pos.x+=dx; settle(nm2, cm2.getBiomeForWorldPosition(px2,py), 1); }
T('logical x χωρίς drift μετά από 10 rebases', () => cm2.toLogical(px2,py).x===l0 || `${l0} → ${cm2.toLogical(px2,py).x}`);
T('biome σταθερό', () => cm2.getBiomeForWorldPosition(px2,py)===b0);
T('ίδιο instance, κανένα respawn', () => outer(nm2)[0]===inst0);
T('outer active = 1', () => outer(nm2).length===1 || 'got '+outer(nm2).length);

console.log('\n── E. πραγματική λογική μετακίνηση ΑΛΛΑΖΕΙ biome ──');
const cm3 = mkChunks(); const nm3 = mkNexus();
let px3 = 15000; settle(nm3, cm3.getBiomeForWorldPosition(px3,py));
const b3 = cm3.getBiomeForWorldPosition(px3,py), i3 = outer(nm3)[0];
let py3 = -15000;                                   // genuinely different sector
const nb = cm3.getBiomeForWorldPosition(px3,py3);
T('νέα θέση = διαφορετικό biome', () => nb!==b3 || 'ίδιο biome, το test δεν διακρίνει');
for (let i=0;i<20;i++) nm3._syncOuterNexus(nb, 1/60);      // 0.33s < hysteresis
T('πριν τα 0.6s: κανένα swap', () => outer(nm3)[0]===i3);
settle(nm3, nb);
T('μετά τα 0.6s: ένα swap, active ακόμα 1', () => outer(nm3).length===1 && outer(nm3)[0].biomeId===nb);

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
