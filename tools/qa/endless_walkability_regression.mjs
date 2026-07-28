// ENDLESS WALKABILITY REGRESSION — real MapManager APIs, no browser, no network.
// Run: node tools/qa/endless_walkability_regression.mjs   (exit 1 on failure)
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
globalThis.window = globalThis;
globalThis.document = { addEventListener(){}, createElement: () => ({ style:{}, getContext:()=>null, addEventListener(){} }) };
globalThis.Image = class { constructor(){ this.complete=false; this.naturalWidth=0; this.onerror=null; } set src(_){} };
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS   = path.resolve(HERE, '../../js');
const { MapManager } = await import(pathToFileURL(path.join(JS, 'game/MapManager.js')).href);

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

// Real MapManager with the art dimensions stubbed to the shipped assets.
const mm = new MapManager({});
mm._cityImg        = { complete:true, naturalWidth:1672, naturalHeight:519 };
mm._chaosDeckImg   = { complete:true, naturalWidth:1672, naturalHeight:440 };
const S = mm.CITY_SCALE;

// deterministic LCG — same candidates every run
let seed = 123456789;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

console.log('═══ ENDLESS WALKABILITY REGRESSION ═══\n── model sanity ──');
T('walkable row band ενεργό (endless)', ()=>mm.isWalkablePoint(0, 300*S, 'endless')===true);
T('skyline ΑΠΟΡΡΙΠΤΕΤΑΙ', ()=>mm.isWalkablePoint(0, 60*S, 'endless')===false);
T('κάτω δομές ΑΠΟΡΡΙΠΤΟΝΤΑΙ', ()=>mm.isWalkablePoint(0, 480*S, 'endless')===false);
// STALE EXPECTATION CORRECTED (2026-07-28). Source (215,250) was asserted to be an "authored
// pillar". It is not, and it never was in the shipped art: a 300x220 crop of cyber_megacity.png
// centred there is unbroken plaza pavement, with the nearest solid prop about 60px to the right.
// The claim came from the hand-typed CITY_BLOCK_COLS rectangles, which the 2026-07-25 P1 audit
// measured as close to an inversion of the art (plain-pavement share inside the three "obstacle"
// rects: 82% / 23% / 0%) and which were emptied for exactly that reason. Asserting a wall there
// asks production to reintroduce the invisible walls that audit removed.
// The location is therefore asserted for what it actually is - open floor - so the test can never
// again demand a wall on open pavement. Real rejection is still covered above by the skyline and
// lower-structure bands, which are the authored geometry that does exist today.
T('ανοιχτή πλατεία στο (215,250) ΕΙΝΑΙ walkable (verified vs shipped art)',
  ()=>mm.isWalkablePoint(215*S, 250*S, 'endless')===true);
T('chaos band ενεργό', ()=>mm.isWalkablePoint(0, 300*S, 'chaos')===true);
T('chaos window band ΑΠΟΡΡΙΠΤΕΤΑΙ', ()=>mm.isWalkablePoint(0, 60*S, 'chaos')===false);

console.log('\n── footprint vs centre ──');
// Same correction: (178,250) is open pavement too, so a 40px footprint there is legal and the old
// expectation could only pass while the wrong rectangles existed. The PROPERTY it was protecting -
// a centre can be legal while the footprint around it is not - is real and still holds; it is now
// asserted against geometry that actually exists, the walkable band edge. Row 210 is the first
// walkable row, so a centre 8px inside the band with a 40px radius must be rejected while its
// centre point alone is accepted.
T('centre valid αλλά footprint περνά το άκρο της ζώνης → invalid',
  ()=>{const x=178*S, y=210*S + 8;
       return mm.isWalkablePoint(x,y,'endless')===true && mm.isWalkableFootprint(x,y,40,'endless')===false;});
T('(178,250) ανοιχτή πλατεία — footprint 40px νόμιμο',
  ()=>mm.isWalkableFootprint(178*S, 250*S, 40, 'endless')===true);
T('footprint στη μέση της plaza → valid', ()=>mm.isWalkableFootprint(500*S, 310*S, 40, 'endless')===true);

console.log('\n── 1000 deterministic candidates → nearest-point correction ──');
let invalid=0, unresolved=0, corrected=0;
for (let i=0;i<1000;i++) {
  const x = (rnd()*2-1) * 60000;                 // spans many mirror periods
  const y = rnd() * 519 * S;                     // anywhere incl. skyline/void
  const r = 12 + Math.floor(rnd()*30);
  const p = mm.findNearestWalkablePoint(x, y, r, 'endless');
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { unresolved++; continue; }
  if (p.x !== x || p.y !== y) corrected++;
  if (!mm.isWalkableFootprint(p.x, p.y, r, 'endless')) invalid++;
}
console.log(`  (${corrected}/1000 χρειάστηκαν διόρθωση)`);
T('invalid final placements = 0', ()=>invalid===0||'got '+invalid);
T('unresolved fallbacks = 0', ()=>unresolved===0||'got '+unresolved);
T('η αναζήτηση τερματίζει πάντα (κανένα infinite loop)', ()=>true);

console.log('\n── safe spawn με keep-away ──');
const player = { x: 3000, y: 300*S };
let tooClose=0, badSpawn=0;
for (let i=0;i<200;i++) {
  const p = mm.findSafeSpawnPoint({ x: player.x + (rnd()*2-1)*400, y: player.y + (rnd()*2-1)*400,
                                    radius: 24, mode:'endless', avoid:[player], minDist: 260 });
  if (Math.hypot(p.x-player.x, p.y-player.y) < 260) tooClose++;
  if (!mm.isWalkableFootprint(p.x, p.y, 24, 'endless')) badSpawn++;
}
T('κανένα spawn μέσα στο keep-away του παίκτη', ()=>tooClose===0||'got '+tooClose);
T('κάθε spawn σε έγκυρο floor', ()=>badSpawn===0||'got '+badSpawn);

console.log('\n── rebase invariance ──');
const P = 2*1672*S;                              // mirror period in world px
T('η ισχύς floor είναι περιοδική ως προς το rebase period', ()=>{
  for (let i=0;i<50;i++){
    const x=(rnd()*2-1)*40000, y=rnd()*519*S;
    if (mm.isWalkablePoint(x,y,'endless') !== mm.isWalkablePoint(x-P,y,'endless')) return 'διαφορά στο x='+x.toFixed(0);
  } return true; });

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
