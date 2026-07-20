// WALKABILITY RUNTIME INTEGRATION — real MapManager + the real resolver semantics.
// Run: node tools/qa/walkability_runtime_regression.mjs   (exit 1 on failure)
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
const { MapManager } = await import(path.join(JS, 'game/MapManager.js'));

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

const mm = new MapManager({});
mm._cityImg      = { complete:true, naturalWidth:1672, naturalHeight:519 };
mm._chaosDeckImg = { complete:true, naturalWidth:1672, naturalHeight:440 };
const S = mm.CITY_SCALE;

// Mirror of Game.resolveWalkableMove — same four-branch policy under test.
const resolve = (fx, fy, tx, ty, r, mode='endless') => {
  if (!mode) return { x:tx, y:ty };
  if (mm.isWalkableFootprint(tx, ty, r, mode)) return { x:tx, y:ty };
  if (mm.isWalkableFootprint(tx, fy, r, mode)) return { x:tx, y:fy };
  if (mm.isWalkableFootprint(fx, ty, r, mode)) return { x:fx, y:ty };
  return { x:fx, y:fy };
};

let seed = 987654321;
const rnd = () => (seed = (seed*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const R = 16;

console.log('═══ WALKABILITY RUNTIME INTEGRATION ═══\n── A. player movement (1000 proposed moves) ──');
let invalid=0, teleports=0, blocked=0, slid=0;
let px = 660*S, py = 260*S;                                     // just left of the 700..780 pillar
for (let i=0;i<1000;i++) {
  const vx = 6 + rnd()*4, vy = (rnd()*2-1)*9;                    // push right, into the pillar
  const r = resolve(px, py, px+vx, py+vy, R);
  if (Math.hypot(r.x-px, r.y-py) > 20) teleports++;              // resolver must never jump
  if (r.x===px && r.y===py) blocked++;
  else if (r.x!==px+vx || r.y!==py+vy) slid++;
  px=r.x; py=r.y;
  if (!mm.isWalkableFootprint(px, py, R, 'endless')) invalid++;
}
console.log(`  (${slid} slides, ${blocked} fully blocked frames)`);
T('invalid player footprint = 0', ()=>invalid===0||'got '+invalid);
T('κανένα teleport (>20px σε ένα frame)', ()=>teleports===0||'got '+teleports);
T('sliding όντως συμβαίνει (όχι μόνο blocking)', ()=>slid>0||'0 slides');

console.log('\n── B. σκόπιμη πορεία πάνω σε authored pillar ──');
// pillar at src x 180..250, rows 210..300 → world x 540..750 (×3)
let hx = 500*S, hy = 250*S, hitInside = 0, movedX = 0;
for (let i=0;i<200;i++){ const r = resolve(hx, hy, hx+6, hy, R); if (r.x!==hx) movedX++; hx=r.x; hy=r.y;
  if (!mm.isWalkableFootprint(hx,hy,R,'endless')) hitInside++; }
T('ο παίκτης ΔΕΝ μπαίνει μέσα στο pillar', ()=>hitInside===0||'got '+hitInside);
T('σταμάτησε πριν το pillar 700..780', ()=>hx < 700*S || 'x='+(hx/S).toFixed(0)+' src');

console.log('\n── C. corner: διαγώνια σε μπλοκαρισμένη γωνία ──');
const cx0 = 178*S, cy0 = 305*S;
const cr = resolve(cx0, cy0, cx0+8, cy0-8, R);
T('γωνία δεν παράγει invalid θέση', ()=>mm.isWalkableFootprint(cr.x, cr.y, R, 'endless'));

console.log('\n── D. enemy spawns (1000 common + 100 elite) ──');
const player = { x: 3000, y: 300*S };
let badSpawn=0, tooClose=0, unresolved=0;
for (let i=0;i<1100;i++){
  const rad = i<1000 ? 14 : 26;
  const p = mm.findSafeSpawnPoint({ x: player.x+(rnd()*2-1)*2500, y: rnd()*519*S,
                                    radius: rad, mode:'endless', avoid:[player], minDist: 300 });
  if (!Number.isFinite(p.x)||!Number.isFinite(p.y)) { unresolved++; continue; }
  if (!mm.isWalkableFootprint(p.x,p.y,rad,'endless')) badSpawn++;
  if (Math.hypot(p.x-player.x,p.y-player.y) < 300) tooClose++;
}
T('invalid spawn placements = 0', ()=>badSpawn===0||'got '+badSpawn);
T('unresolved safe-spawn failures = 0', ()=>unresolved===0||'got '+unresolved);
T('κανένα spawn μέσα στο keep-away', ()=>tooClose===0||'got '+tooClose);

console.log('\n── E. μεγάλα footprints (bosses) ──');
let bossBad=0;
for (let i=0;i<100;i++){
  const p = mm.findNearestWalkablePoint((rnd()*2-1)*30000, rnd()*519*S, 90, 'endless');
  if (!mm.isWalkableFootprint(p.x,p.y,90,'endless')) bossBad++;
}
T('boss footprint radius 90 πάντα valid', ()=>bossBad===0||'got '+bossBad);

console.log('\n── F. rebase invariance ──');
const P = 2*1672*S;
let drift=0;
for (let i=0;i<200;i++){
  const x=(rnd()*2-1)*30000, y=rnd()*519*S;
  const a = resolve(x, y, x+7, y+3, R);
  const b = resolve(x-P, y, x-P+7, y+3, R);
  if (Math.abs((a.x-x) - (b.x-(x-P))) > 1e-6 || Math.abs(a.y-b.y) > 1e-6) drift++;
}
T('camera-relative resolution drift μετά από rebase = 0', ()=>drift===0||'got '+drift);

console.log('\n── G. mode isolation ──');
T('Act 1 (mode null) ΔΕΝ περιορίζεται από Endless obstacles',
  ()=>{const r=resolve(600*S, 60*S, 610*S, 60*S, R, null); return r.x===610*S;});
T('Endless obstacles ΔΕΝ ισχύουν στο chaos model',
  ()=>mm.isWalkablePoint(215*S, 300*S, 'chaos')===true);
T('chaos έχει δικά του authored blocks', ()=>mm.isWalkablePoint(330*S, 200*S, 'chaos')===false);


console.log('\n── H. enemy movement: 100 commons γύρω από obstacles ──');
const STUCK_SECS=0.5, STUCK_CD=2.0, dt=1/60;
const mkE=(x,y,r)=>({pos:{x,y}, vel:{x:0,y:0}, radius:r, _stuckT:0, _stuckCd:0});
const step=(e,player)=>{                                   // mirrors Enemy._stepMove
  const dx=player.x-e.pos.x, dy=player.y-e.pos.y, d=Math.hypot(dx,dy)||1;
  e.vel.x=(dx/d)*90; e.vel.y=(dy/d)*90;
  const fx=e.pos.x, fy=e.pos.y, tx=fx+e.vel.x*dt, ty=fy+e.vel.y*dt;
  const r=resolve(fx,fy,tx,ty,e.radius);
  e.pos.x=r.x; e.pos.y=r.y;
  const wanted=Math.hypot(tx-fx,ty-fy), moved=Math.hypot(r.x-fx,r.y-fy);
  if (wanted>0.5 && moved<wanted*0.2) e._stuckT+=dt; else e._stuckT=0;
  if (e._stuckCd>0) e._stuckCd-=dt;
  if (e._stuckT>=STUCK_SECS && e._stuckCd<=0){
    const rec=mm.findNearestWalkablePoint(e.pos.x,e.pos.y,e.radius,'endless');
    if (Math.hypot(rec.x-player.x,rec.y-player.y)>120){ e.pos.x=rec.x; e.pos.y=rec.y; }
    e._stuckT=0; e._stuckCd=STUCK_CD; e._recoveries=(e._recoveries||0)+1;
  }
};
const tgt={x:1400*S,y:300*S};
const commons=[]; for(let i=0;i<100;i++) commons.push(mkE(400*S+rnd()*120*S, (215+rnd()*195)*S, 14));
let eBad=0, eTele=0, recoveries=0;
for(let f=0;f<600;f++) for(const e of commons){
  const bx=e.pos.x, by=e.pos.y; step(e,tgt);
  if (Math.hypot(e.pos.x-bx,e.pos.y-by)>60) eTele++;        // recovery may jump; cap it
  if (!mm.isWalkableFootprint(e.pos.x,e.pos.y,e.radius,'endless')) eBad++;
}
for(const e of commons) recoveries += (e._recoveries||0);
const closed = commons.filter(e=>Math.hypot(e.pos.x-tgt.x,e.pos.y-tgt.y) < 1000*S).length;
console.log(`  (${recoveries} stuck recoveries, ${closed}/100 πλησίασαν τον στόχο)`);
T('invalid common enemy footprints = 0', ()=>eBad===0||'got '+eBad);
T('permanent stuck enemies = 0 (καμία τελική invalid θέση)',
  ()=>commons.every(e=>mm.isWalkableFootprint(e.pos.x,e.pos.y,e.radius,'endless')));
T('οι enemies όντως πλησιάζουν τον παίκτη', ()=>closed>0||'κανένας');

console.log('\n── I. 30 elites με μεγαλύτερο footprint ──');
// spawn them exactly as the game now does — through findSafeSpawnPoint, not raw coords
const elites=[];
for(let i=0;i<30;i++){ const p=mm.findSafeSpawnPoint({x:500*S+rnd()*200*S, y:(220+rnd()*180)*S, radius:30, mode:'endless', avoid:[tgt], minDist:200}); elites.push(mkE(p.x,p.y,30)); }
let elBad=0;
for(let f=0;f<400;f++) for(const e of elites){ step(e,tgt);
  if(!mm.isWalkableFootprint(e.pos.x,e.pos.y,e.radius,'endless')) elBad++; }
T('invalid elite footprints = 0', ()=>elBad===0||'got '+elBad);

console.log('\n── J. boss / mega-boss spawn footprints ──');
let bBad=0;
for(let i=0;i<200;i++){
  const rad = i<100 ? 60 : 100;
  const p = mm.findSafeSpawnPoint({ x:(rnd()*2-1)*30000, y:rnd()*519*S, radius:rad,
                                    mode:'endless', avoid:[tgt], minDist:380 });
  if(!mm.isWalkableFootprint(p.x,p.y,rad,'endless')) bBad++;
}
T('boss/mega spawn footprints valid = 100%', ()=>bBad===0||'got '+bBad);

console.log('\n── K. rebase με ενεργούς enemies ──');
const P2 = 2*1672*S;
let rebaseBad=0;
for(const e of commons.slice(0,40)){
  const beforeOk = mm.isWalkableFootprint(e.pos.x,e.pos.y,e.radius,'endless');
  const afterOk  = mm.isWalkableFootprint(e.pos.x-P2,e.pos.y,e.radius,'endless');
  if (beforeOk !== afterOk) rebaseBad++;
}
T('rebase δεν αλλάζει walkability των enemies', ()=>rebaseBad===0||'got '+rebaseBad);


console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
