// END SCREEN LAYOUT — bounding-box intersection test for the victory screen.
// Fails if the damage report overlaps buttons, help text or the unlock-skin row.
// Run: node tools/qa/end_screen_layout_regression.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = fs.readFileSync(path.resolve(HERE,'../../js/game/Game.js'),'utf8');
const BE   = fs.readFileSync(path.resolve(HERE,'../../js/game/BuildEngine.js'),'utf8');

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

// The canvas is FIXED at 1280x720 (index.html); every display resolution scales it
// uniformly, so this single internal layout is the whole story.
const W = 1280, H = 720;
const rect = (x,y,w,h,name) => ({x,y,w,h,name,r:x+w,b:y+h});
const hits = (a,b) => !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);

// Victory-screen geometry, read from the source values.
const BW=300, BH=50, BY=540, GAP=24;
const btnL  = rect(Math.round(W/2-BW-GAP/2), BY, BW, BH, 'RETURN TO MAIN MENU');
const btnR  = rect(Math.round(W/2+GAP/2),    BY, BW, BH, 'CONTINUE — ENDLESS');
const help  = rect(W/2-320, 616-12, 640, 22, 'help text');
const skins = rect(W/2-180-60, 322, 480, 130+26, 'unlock skin row');
const credits = rect(W/2-320, 60, 640, 260, 'title + credits');

// Damage report geometry, mirroring BuildEngine._drawDamageReport with the compact slot.
const slot = { x:24, y:322, w:360, compact:true };
const SAFE = Math.max(16, Math.round(W*0.02));
const w = Math.min(slot.w, W - SAFE*2);
const x = Math.min(Math.max(slot.x, SAFE), W - w - SAFE);
const rowsShown = 5;                                   // compact
const h = 52 + rowsShown*16 + 26;
const report = rect(x, slot.y, w, h, 'DAMAGE REPORT');

console.log('═══ END SCREEN LAYOUT (1280x720 fixed canvas) ═══\n── bounding boxes ──');
for (const r of [credits, skins, report, btnL, btnR, help])
  console.log(`  ${r.name.padEnd(22)} x ${String(r.x).padStart(4)}..${String(r.r).padStart(4)}   y ${String(r.y).padStart(3)}..${String(r.b).padStart(3)}`);

console.log('\n── ΠΡΙΝ (y = HEIGHT-198, w 560, centered) ──');
const before = rect(Math.round((W-560)/2), H-174-24, 560, 174, 'OLD report');
for (const other of [btnL, btnR, help])
  console.log(`  vs ${other.name.padEnd(22)} ${hits(before,other) ? 'OVERLAP' : 'clear'}`);

console.log('\n── ΜΕΤΑ ──');
let clean = true;
for (const other of [btnL, btnR, help, skins, credits]) {
  const bad = hits(report, other);
  if (bad) clean = false;
  console.log(`  vs ${other.name.padEnd(22)} ${bad ? 'OVERLAP' : 'clear'}`);
}
T('0 overlap με RETURN TO MAIN MENU', ()=>!hits(report,btnL));
T('0 overlap με CONTINUE — ENDLESS',  ()=>!hits(report,btnR));
T('0 overlap με help text',           ()=>!hits(report,help));
T('0 overlap με unlock skin row',     ()=>!hits(report,skins));
T('0 overlap με title/credits',       ()=>!hits(report,credits));
T('πλήρως εντός viewport', ()=>report.x>=SAFE && report.r<=W-SAFE && report.y>=0 && report.b<=H);
T('συνολικά καθαρό', ()=>clean);

console.log('\n── source integrity ──');
T('δεν υπάρχει πλέον hardcoded x=16 fallback', ()=>!/const x = slot \? slot\.x : 16;/.test(BE));
T('victory slot δεν είναι πλέον στη ζώνη των buttons', ()=>!/_dmgReportSlot = \{ centered: true, y: HEIGHT - 174 - 24/.test(GAME));
T('compact mode υπάρχει', ()=>/slot\.compact \? 5 : 6/.test(BE));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
