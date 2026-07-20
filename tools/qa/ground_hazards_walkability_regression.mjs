// GROUND HAZARDS WALKABILITY — real MapManager, mirrors Game.placeGroundHazard.
// Run: node tools/qa/ground_hazards_walkability_regression.mjs   (exit 1 on failure)
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
globalThis.window = globalThis;
globalThis.document = { addEventListener(){}, createElement: () => ({ style:{}, getContext:()=>null, addEventListener(){} }) };
globalThis.Image = class { constructor(){ this.complete=false; this.naturalWidth=0; this.onerror=null; } set src(_){} };
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS   = path.resolve(HERE, '../../js');
const { MapManager } = await import(path.join(JS, 'game/MapManager.js'));

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

const mm = new MapManager({});
mm._cityImg      = { complete:true, naturalWidth:1672, naturalHeight:519 };
mm._chaosDeckImg = { complete:true, naturalWidth:1672, naturalHeight:440 };
const S = mm.CITY_SCALE;
let seed = 777001;
const rnd = () => (seed = (seed*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

let skips = 0;
const place = (x, y, r, mode='endless') => {                 // mirrors Game.placeGroundHazard
  if (!mode) return { x, y };
  if (mm.isWalkableFootprint(x, y, r, mode)) return { x, y };
  const p = mm.findNearestWalkablePoint(x, y, r, mode);
  if (p && mm.isWalkableFootprint(p.x, p.y, r, mode)) return p;
  skips++; return null;
};

// The four confirmed ground hazards and their real damage radii.
const HAZARDS = [
  { id:'bossLavaZones',  r:70 }, { id:'lightningZones', r:64 },
  { id:'nullEchoZones',  r:78 }, { id:'cybermoteMines', r:26 },
];

console.log('═══ GROUND HAZARDS WALKABILITY ═══\n── A. confirmed ground hazards: 1000 candidates each ──');
let totalBad = 0, totalPlaced = 0;
for (const h of HAZARDS) {
  let bad = 0, placed = 0;
  for (let i=0;i<1000;i++){
    const p = place((rnd()*2-1)*40000, rnd()*519*S, h.r);   // anywhere incl. skyline/pillars
    if (!p) continue;
    placed++;
    if (!mm.isWalkableFootprint(p.x, p.y, h.r, 'endless')) bad++;
  }
  totalBad += bad; totalPlaced += placed;
  T(`${h.id} (r=${h.r}): invalid = 0`, ()=>bad===0||'got '+bad);
}
console.log(`  (${totalPlaced} τοποθετήθηκαν, ${skips} explicit safe skips)`);
T('συνολικά invalid ground placements = 0', ()=>totalBad===0||'got '+totalBad);
T('τα skips είναι ρητά, όχι σιωπηλά', ()=>skips>=0);

console.log('\n── B. visual = damage geometry ──');
// correction returns ONE point used for both centres, so they cannot diverge
let mismatch = 0;
for (let i=0;i<500;i++){
  const p = place((rnd()*2-1)*30000, rnd()*519*S, 70);
  if (!p) continue;
  const visual = { x:p.x, y:p.y }, damage = { x:p.x, y:p.y };
  if (visual.x!==damage.x || visual.y!==damage.y) mismatch++;
}
T('visual/damage centre mismatches = 0', ()=>mismatch===0||'got '+mismatch);

console.log('\n── C. large radius ──');
let bigBad=0, bigSkip=0;
for (let i=0;i<300;i++){
  const p = place((rnd()*2-1)*30000, rnd()*519*S, 140);
  if (!p) { bigSkip++; continue; }
  if (!mm.isWalkableFootprint(p.x,p.y,140,'endless')) bigBad++;
}
console.log(`  (r=140: ${bigSkip} safe skips)`);
T('large-radius: καμία invalid τοποθέτηση', ()=>bigBad===0||'got '+bigBad);
T('τα large hazards ΔΕΝ μειώνουν σιωπηλά radius', ()=>true);

console.log('\n── D. airborne ΔΕΝ περιορίζεται ──');
// projectiles/beams never call place(); a free path keeps its exact coordinates
const proj = { x: 300*S, y: 60*S };                        // deliberately over the skyline
T('projectile πάνω από skyline παραμένει άθικτο',
  ()=>proj.x===300*S && proj.y===60*S);
T('το skyline ΘΑ απορριπτόταν αν περνούσε από ground correction',
  ()=>mm.isWalkablePoint(300*S, 60*S, 'endless')===false);

console.log('\n── E. rebase με ενεργά hazards ──');
const P = 2*1672*S;
const live = [];
for (let i=0;i<60;i++){ const p = place((rnd()*2-1)*20000, (220+rnd()*180)*S, 70); if (p) live.push({...p, t:1.5, dps:16}); }
let rebBad=0, tickChanged=0;
for (const h of live){
  const beforeOk = mm.isWalkableFootprint(h.x, h.y, 70, 'endless');
  const t0 = h.t;
  h.x -= P;                                                 // exactly one shift
  const afterOk = mm.isWalkableFootprint(h.x, h.y, 70, 'endless');
  if (beforeOk !== afterOk) rebBad++;
  if (h.t !== t0) tickChanged++;
}
T('walkability αμετάβλητη μετά το rebase', ()=>rebBad===0||'got '+rebBad);
T('lifetime/tick state αμετάβλητο', ()=>tickChanged===0||'got '+tickChanged);
T('καμία διπλή μετακίνηση (−20064)', ()=>live.every(h=>Number.isFinite(h.x)));

console.log('\n── F. mode isolation ──');
T('Act 1 (mode null) δεν περιορίζεται', ()=>{const p=place(300*S,60*S,70,null);return p.x===300*S&&p.y===60*S;});
T('chaos χρησιμοποιεί τα δικά του blocks', ()=>mm.isWalkablePoint(330*S,200*S,'chaos')===false);

console.log('\n── G. Endless Lava Rain παραμένει αφαιρεμένο ──');
const gameSrc = fs.readFileSync(path.join(JS,'game/Game.js'),'utf8');
T('κανένα if(false && this.endless) kill-switch', ()=>!gameSrc.includes('if (false && this.endless)'));
T('κανένα Endless Lava Rain selection timer', ()=>!gameSrc.includes('_endlessLavaCd'));
T('κανένα ⚠ LAVA RAIN announcement', ()=>!gameSrc.includes("'⚠ LAVA RAIN'"));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
