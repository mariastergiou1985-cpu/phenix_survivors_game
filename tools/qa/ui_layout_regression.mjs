// UI LAYOUT — responsive matrix for the end-screen damage report panel.
// Mirrors BuildEngine._drawDamageReport geometry. Run: node tools/qa/ui_layout_regression.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BE   = fs.readFileSync(path.resolve(HERE, '../../js/game/BuildEngine.js'), 'utf8');
const GAME = fs.readFileSync(path.resolve(HERE, '../../js/game/Game.js'), 'utf8');

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

// exact geometry from the source
const geom = (W, slot) => {
  const SAFE = Math.max(16, Math.round(W * 0.02));
  const w = Math.min(slot ? slot.w : 560, W - SAFE*2);
  const x = slot && slot.x != null && slot.centered !== true
    ? Math.min(Math.max(slot.x, SAFE), W - w - SAFE)
    : Math.round((W - w) / 2);
  return { x, w, SAFE, right: x + w };
};

const RES = [[1280,720],[1366,768],[1600,900],[1920,1080],[2560,1080]];
console.log('═══ UI LAYOUT — DAMAGE REPORT ═══\n── responsive matrix (victory screen, centered slot) ──');
console.log(`  ${'resolution'.padEnd(14)}${'x'.padStart(6)}${'w'.padStart(6)}${'right'.padStart(7)}${'centered'.padStart(10)}`);
let allCentered = true, allOnScreen = true;
for (const [W,H] of RES) {
  const g = geom(W, { centered:true, y: H-198, w:560 });
  const off = Math.abs((g.x + g.w/2) - W/2);
  if (off > 1) allCentered = false;
  if (g.x < g.SAFE || g.right > W - g.SAFE) allOnScreen = false;
  console.log(`  ${(W+'x'+H).padEnd(14)}${String(g.x).padStart(6)}${String(g.w).padStart(6)}${String(g.right).padStart(7)}${(off<=1?'ναι':'ΟΧΙ '+off.toFixed(0)).padStart(10)}`);
}
T('κεντραρισμένο σε ΚΑΘΕ ανάλυση (incl. 21:9)', ()=>allCentered);
T('κανένα off-screen / clipping', ()=>allOnScreen);
T('πλάτος πάντα εντός safe margins', ()=>RES.every(([W])=>{const g=geom(W,{centered:true,w:560});return g.w<=W-g.SAFE*2;}));

console.log('\n── ακραίες περιπτώσεις ──');
T('πολύ στενό viewport (800px): panel συρρικνώνεται, δεν ξεχειλίζει',
  ()=>{const g=geom(800,{centered:true,w:560});return g.x>=g.SAFE && g.right<=800-g.SAFE;});
T('publisher x εκτός οθόνης περιορίζεται εντός safe area',
  ()=>{const g=geom(1280,{x:-500,w:560});return g.x>=g.SAFE;});
T('publisher x πολύ δεξιά περιορίζεται', ()=>{const g=geom(1280,{x:9999,w:560});return g.right<=1280-g.SAFE;});

console.log('\n── source integrity ──');
T('κανένα hardcoded x=16 fallback', ()=>!/const x = slot \? slot\.x : 16;/.test(BE));
T('victory screen δεν είναι πλέον pinned στο x:24',
  ()=>!/_dmgReportSlot = \{ x: 24,/.test(GAME));
// Superseded by end_screen_layout_regression: the victory screen now uses a side column
// (option B) because its vertical axis is fully committed. What matters here is only that
// it is no longer published into the button band.
T('victory slot εκτός της ζώνης των buttons (y<540)',
  ()=>/_DR_Y = 322/.test(GAME) && !/y: HEIGHT - 174 - 24/.test(GAME));
T('in-run HUD publisher διατηρεί τη θέση του (δεν σπάει)',
  ()=>/game\._dmgReportSlot = \{ x: panelX, y, w: panelW \};/.test(
      fs.readFileSync(path.resolve(HERE,'../../js/game/HUD.js'),'utf8')));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
