// BLACK-SCREEN REGRESSION — static guards against the failure modes that leave the
// canvas blank. Run: node tools/qa/black_screen_regression.mjs   (exit 1 on failure)
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
const MAIN = fs.readFileSync(path.join(JS,'main.js'),'utf8');
const GAME = fs.readFileSync(path.join(JS,'game/Game.js'),'utf8');
const PL   = fs.readFileSync(path.join(JS,'entities/Player.js'),'utf8');
const HTML = fs.readFileSync(path.resolve(HERE,'../../index.html'),'utf8');
const { MapManager } = await import(path.join(JS,'game/MapManager.js'));

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

console.log('═══ BLACK-SCREEN REGRESSION ═══\n── main loop liveness ──');
T('rAF επαναπρογραμματίζεται ΕΞΩ από το try/catch', ()=>{
  const i=MAIN.lastIndexOf('requestAnimationFrame(loop);', MAIN.indexOf('\n}', MAIN.indexOf('function loop')));
  const c=MAIN.lastIndexOf('catch', i); const b=MAIN.lastIndexOf('}', i);
  return b > c; });
T('update και draw σε ΞΕΧΩΡΙΣΤΑ catch', ()=>/try \{ game\.update[\s\S]{0,120}catch[\s\S]{0,400}game\.draw/.test(MAIN));
T('ένα frame error δεν σταματά το loop', ()=>/_logLoopError\(err, 'update'\)/.test(MAIN) && /_logLoopError\(err, 'draw'\)/.test(MAIN));
T('error logging είναι throttled (όχι spam)', ()=>/_logLoopError\.logged/.test(MAIN) && /lastMsg === msg/.test(MAIN));
T('ένα μόνο bootstrap rAF', ()=>(MAIN.match(/^requestAnimationFrame\(loop\);/gm)||[]).length===1);
T('ctx.reset() κάθε frame (κανένα leaked save level)', ()=>/if \(ctx\.reset\) ctx\.reset\(\);/.test(MAIN));
T('draw τυλιγμένο σε save/finally-restore', ()=>/ctx\.save\(\);[\s\S]{0,160}finally \{ ctx\.restore\(\); \}/.test(MAIN));
T('dt capped (κανένα runaway frame)', ()=>/Math\.min\(\(timestamp - lastTime\) \/ 1000, 0\.05\)/.test(MAIN));

console.log('\n── canvas visibility ──');
T('canvas έχει non-zero διαστάσεις στο HTML', ()=>/<canvas[^>]*width="(\d+)"[^>]*height="(\d+)"/.test(HTML) &&
  +HTML.match(/width="(\d+)"/)[1]>0 && +HTML.match(/height="(\d+)"/)[1]>0);
T('canvas δεν κρύβεται με CSS', ()=>!/#game\s*\{[^}]*(display:\s*none|visibility:\s*hidden|opacity:\s*0)/.test(HTML));

console.log('\n── canvas-state leaks (blank-frame αιτίες) ──');
T('Player.draw καρφώνει globalAlpha', ()=>/ctx\.globalAlpha = 1;/.test(PL));
T('Player.draw καρφώνει globalCompositeOperation', ()=>/globalCompositeOperation = 'source-over';/.test(PL));
T('Player.draw καρφώνει imageSmoothingEnabled', ()=>/ctx\.imageSmoothingEnabled = true;/.test(PL));
T('boss ctx.filter μέσα σε save/restore', ()=>{
  const i=GAME.indexOf("ctx.filter = 'brightness(3) saturate(0)'");
  if(i<0) return true;
  return GAME.lastIndexOf('ctx.save()', i) > GAME.lastIndexOf('ctx.restore()', i); });

console.log('\n── NaN geometry (silent canvas failure) ──');
const mm = new MapManager({});
mm._cityImg={complete:true,naturalWidth:1672,naturalHeight:519};
mm._chaosDeckImg={complete:true,naturalWidth:1672,naturalHeight:440};
const BAD=[NaN,Infinity,-Infinity,undefined,null,1e300,-1e300];
let nanOut=0, threw=0;
for(const x of BAD) for(const y of BAD) for(const mode of ['endless','chaos']){
  try{
    const p=mm.findNearestWalkablePoint(x,y,20,mode);
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)) nanOut++;
    const s=mm.findSafeSpawnPoint({x,y,radius:20,mode,avoid:[{x:0,y:0}],minDist:100});
    if(!Number.isFinite(s.x)||!Number.isFinite(s.y)) nanOut++;
  }catch(e){ threw++; }
}
T('findNearestWalkablePoint δεν επιστρέφει ποτέ NaN', ()=>nanOut===0||`${nanOut} NaN outputs`);
T('κανένα API δεν πετάει σε non-finite input', ()=>threw===0||`${threw} throws`);
T('isWalkablePoint απορρίπτει non-finite', ()=>mm.isWalkablePoint(NaN,0,'endless')===false && mm.isWalkablePoint(0,Infinity,'endless')===false);
T('bounded search τερματίζει με ακραίο radius', ()=>{
  const p=mm.findNearestWalkablePoint(0,0,99999,'endless');
  return Number.isFinite(p.x)&&Number.isFinite(p.y); });

console.log('\n── hazard null-safety ──');
T('κάθε placeGroundHazard caller ελέγχει το αποτέλεσμα', ()=>{
  const calls=[...GAME.matchAll(/const (_\w+) = this\.placeGroundHazard\(/g)];
  return calls.every(m=>{ const seg=GAME.slice(m.index, m.index+520); return seg.includes(`if (${m[1]})`); })
    || `${calls.length} calls checked`; });
T('placeGroundHazard επιστρέφει null αντί για void placement', ()=>/return null;\s*\/\/ caller must skip/.test(GAME));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
