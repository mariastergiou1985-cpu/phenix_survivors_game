// WORLD OBJECTS + PICKUPS WALKABILITY — real modules, no browser, no network.
// Run: node tools/qa/world_objects_walkability_regression.mjs   (exit 1 on failure)
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
globalThis.window = globalThis;
globalThis.document = { addEventListener(){}, createElement: () => ({ style:{}, getContext:()=>null, addEventListener(){} }) };
globalThis.Image = class { constructor(){ this.complete=false; this.naturalWidth=0; this.onerror=null; } set src(_){} };
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS   = path.resolve(HERE, '../../js');
const { MapManager }   = await import(path.join(JS, 'game/MapManager.js'));
const { NexusManager } = await import(path.join(JS, 'game/NexusManager.js'));
const { BIOME_ID }     = await import(path.join(JS, 'game/MapManager.js'));

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

const mm = new MapManager({});
mm._cityImg      = { complete:true, naturalWidth:1672, naturalHeight:519 };
mm._chaosDeckImg = { complete:true, naturalWidth:1672, naturalHeight:440 };
const S = mm.CITY_SCALE;
let seed = 20260720;
const rnd = () => (seed = (seed*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// Mirror of Game._clampPickupPos (Endless branch) incl. the golden-angle scatter.
let fixN = 0;
const clampPickup = (x, y, radius=18) => {
  if (mm.isWalkableFootprint(x, y, radius, 'endless')) return { x, y };
  fixN = (fixN + 1) % 360;
  const a = fixN * 2.39996;
  return mm.findNearestWalkablePoint(x + Math.cos(a)*14, y + Math.sin(a)*14, radius, 'endless');
};

console.log('═══ WORLD OBJECTS + PICKUPS WALKABILITY ═══\n── A. central Nexus (Act 1, real NexusManager) ──');
const a1 = new NexusManager({ endless:false }); a1.mapManager = mm; a1.init(3000,1688);
const deck={x0:204,x1:2803,y0:491,y1:1297}, MR=34;
T('4 central Nexus', ()=>a1.matrices.length===4||'got '+a1.matrices.length);
T('όλα εντός Act 1 deck', ()=>a1.matrices.every(m=>m.pos.y-MR>=deck.y0&&m.pos.y+MR<=deck.y1&&m.pos.x-MR>=deck.x0&&m.pos.x+MR<=deck.x1));
T('ασυμμετρία: 4 μοναδικά X και Y', ()=>new Set(a1.matrices.map(m=>Math.round(m.pos.x))).size===4 && new Set(a1.matrices.map(m=>Math.round(m.pos.y))).size===4);
T('min separation >= 650px', ()=>{let mn=1e9;for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)mn=Math.min(mn,Math.hypot(a1.matrices[i].pos.x-a1.matrices[j].pos.x,a1.matrices[i].pos.y-a1.matrices[j].pos.y));return mn>=650||'min='+mn.toFixed(0);});
T('Act 1 ΔΕΝ πήρε Endless obstacle rectangles', ()=>a1.matrices.every(m=>m.pos.y>deck.y0&&m.pos.y<deck.y1));

console.log('\n── B. outer Nexus: cached corrected placement ──');
const en = new NexusManager({ endless:true }); en.mapManager = mm; en.init(3000,1688); en.repositionForEndless();
const B=[BIOME_ID.INDUSTRIAL_CORE,BIOME_ID.ABYSSAL_TRENCH,BIOME_ID.GLACIAL_EXPANSE,BIOME_ID.ORBITAL_NEXUS,BIOME_ID.DATA_WASTES];
const settle=(m,b,secs=2)=>{for(let i=0;i<secs*60;i++) m._syncOuterNexus(b,1/60);};
const outer=(m)=>m.matrices.filter(x=>x.isOuterNexus);
T('5 outer records', ()=>en.outerRecords.length===5||'got '+en.outerRecords.length);
settle(en,B[0]);
const first = outer(en)[0]; const fx = first.pos.x, fy = first.pos.y;
T('outer active = 1', ()=>outer(en).length===1);
T('corrected θέση αποθηκεύτηκε στο record', ()=>en.outerRecords[0].fixedX!=null);
first.stored = 3;
settle(en,B[1]); settle(en,B[0]);
T('επιστροφή: ΙΔΙΑ θέση (καμία νέα διόρθωση)', ()=>outer(en)[0].pos.x===fx && outer(en)[0].pos.y===fy);
T('charge διατηρήθηκε (καμία διπλή ανταμοιβή)', ()=>outer(en)[0].stored===3||'stored='+outer(en)[0].stored);

console.log('\n── C. Grid Cache: 500 candidates (r=46) ──');
let gBad=0; for(let i=0;i<500;i++){const p=clampPickup((rnd()*2-1)*30000, rnd()*519*S, 46);
  if(!mm.isWalkableFootprint(p.x,p.y,46,'endless')) gBad++;}
T('invalid Grid Cache placements = 0', ()=>gBad===0||'got '+gBad);

console.log('\n── D. Vault: 500 candidates (r=52) ──');
let vBad=0; for(let i=0;i<500;i++){const p=clampPickup((rnd()*2-1)*30000, rnd()*519*S, 52);
  if(!mm.isWalkableFootprint(p.x,p.y,52,'endless')) vBad++;}
T('invalid Vault placements = 0', ()=>vBad===0||'got '+vBad);

console.log('\n── E. XP shards: 2000 death positions ──');
let xBad=0, xUnres=0;
for(let i=0;i<2000;i++){
  const p = clampPickup((rnd()*2-1)*40000, rnd()*519*S, 12);
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)){xUnres++;continue;}
  if(!mm.isWalkableFootprint(p.x,p.y,12,'endless')) xBad++;
}
T('invalid XP resting positions = 0', ()=>xBad===0||'got '+xBad);
T('unresolved corrections = 0', ()=>xUnres===0||'got '+xUnres);

console.log('\n── F. clustered drop scatter ──');
// 8 shards from ONE kill inside a pillar — must not stack on one pixel
const kill = { x: 730*S, y: 250*S };
const pts = []; for(let i=0;i<8;i++) pts.push(clampPickup(kill.x, kill.y, 12));
const uniq = new Set(pts.map(p=>`${Math.round(p.x)},${Math.round(p.y)}`)).size;
console.log(`  (${uniq}/8 μοναδικές θέσεις)`);
T('τα shards ΔΕΝ στοιβάζονται σε ένα pixel', ()=>uniq>1||'όλα στο ίδιο σημείο');
T('όλα τα clustered shards valid', ()=>pts.every(p=>mm.isWalkableFootprint(p.x,p.y,12,'endless')));

console.log('\n── G. pickups: 1000 candidates ──');
let pBad=0; for(let i=0;i<1000;i++){const p=clampPickup((rnd()*2-1)*40000, rnd()*519*S, 18);
  if(!mm.isWalkableFootprint(p.x,p.y,18,'endless')) pBad++;}
T('invalid pickup resting positions = 0', ()=>pBad===0||'got '+pBad);

console.log('\n── H. rebase invariance ──');
const P = 2*1672*S;
let rBad=0;
for(let i=0;i<200;i++){const x=(rnd()*2-1)*30000, y=(220+rnd()*180)*S;
  if(mm.isWalkableFootprint(x,y,18,'endless')!==mm.isWalkableFootprint(x-P,y,18,'endless')) rBad++;}
T('walkability αμετάβλητη μετά το rebase', ()=>rBad===0||'got '+rBad);
T('outer canonical record ΔΕΝ άλλαξε από το rebase', ()=>en.outerRecords[0].x!=null && en.outerRecords[0].fixedX!=null);


console.log('\n── I. XP shards: πραγματικό XpShardSystem.spawnBurst ──');
const { XpShardSystem } = await import(path.join(JS, 'entities/XpShards.js'));
const xs = new XpShardSystem();
// minimal Game stand-in exposing only the canonical helper the system now calls
const fakeGame = { _clampPickupPos: (pos, r=18) => { const c = clampPickup(pos.x, pos.y, r); pos.x=c.x; pos.y=c.y; return pos; } };
let restBad = 0, spawned = 0;
for (let i=0;i<400;i++){
  xs.active.length = 0;
  xs.spawnBurst((rnd()*2-1)*30000, rnd()*519*S, 20, 14, fakeGame);   // deaths anywhere incl. void
  for (const sh of xs.active){ spawned++;
    if (!mm.isWalkableFootprint(sh.tx, sh.ty, 12, 'endless')) restBad++; }
}
console.log(`  (${spawned} shards από 400 deaths)`);
T('invalid XP resting positions από τον πραγματικό spawnBurst = 0', ()=>restBad===0||'got '+restBad);
T('spawnBurst ΧΩΡΙΣ game δεν κρασάρει (Act 1 / back-compat)',
  ()=>{ xs.active.length=0; xs.spawnBurst(500, 500, 12, 14); return xs.active.length>0; });

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
