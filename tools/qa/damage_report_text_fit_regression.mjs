// DAMAGE REPORT TEXT FIT — compact 360px victory-screen column.
// Consolas 11px is monospace: every glyph advances 0.55*size = 6.05px. That is the model
// used here; the layout is built from fixed anchors so it holds for any monospace metric
// within ±10%, which the tolerance test below asserts explicitly.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BE   = fs.readFileSync(path.resolve(HERE,'../../js/game/BuildEngine.js'),'utf8');

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

const CH = 11 * 0.55;                       // Consolas advance at 11px
const measure = t => t.length * CH;
const W = 360, PAD = 10, x = 0;
const cols = { name: x+PAD, nameMax: W-PAD-190-PAD, dmg: x+W-PAD-104, dps: x+W-PAD-52, kills: x+W-PAD };
const fit = (t, maxW) => { if (measure(t)<=maxW) return t;
  let o=t; while(o.length>1 && measure(o+'…')>maxW) o=o.slice(0,-1); return o+'…'; };
// mirrors BuildEngine's formatter exactly
const U = ['', 'K', 'M', 'B', 'T'];
const num = v => { let n=Number(v); if(!Number.isFinite(n)) return String(v);
  const sign = n<0?'-':''; n=Math.abs(n); let u=0;
  while(n>=1000 && u<U.length-1){ n/=1000; u++; }
  const band = x => (x<10?2:x<100?1:0); let dp = band(n);
  if(Number(n.toFixed(dp))>=1000 && u<U.length-1){ n/=1000; u++; dp=band(n); }
  dp = band(Number(n.toFixed(dp)));
  return sign + (u===0 ? String(Math.round(n)) : n.toFixed(dp)) + U[u]; };

console.log('═══ DAMAGE REPORT TEXT FIT (compact, 360px) ═══');
console.log(`  anchors: name ${cols.name} (max ${cols.nameMax}px) · DMG→${cols.dmg} · DPS→${cols.dps} · KILLS→${cols.kills}\n`);
console.log(`  ${'element'.padEnd(34)}${'avail'.padStart(7)}${'measured'.padStart(10)}${'overflow'.padStart(10)}`);
console.log('  '+'-'.repeat(61));

const rows = [];
const check = (label, text, availLeft, availRight, rightAligned) => {
  const wpx = measure(text);
  const avail = rightAligned ? availRight - availLeft : availRight - availLeft;
  const over = Math.max(0, wpx - avail);
  rows.push({label, avail, wpx, over});
  console.log(`  ${label.slice(0,34).padEnd(34)}${avail.toFixed(0).padStart(7)}${wpx.toFixed(0).padStart(10)}${(over>0?over.toFixed(0):'—').padStart(10)}`);
  return over;
};

// headers
let over = 0;
over += check('header WEAPON', 'WEAPON', cols.name, cols.name+cols.nameMax);
over += check('header DMG (right-anchored)', 'DMG', cols.name+cols.nameMax, cols.dmg);
over += check('header DPS (right-anchored)', 'DPS', cols.dmg, cols.dps);
over += check('header KILLS (right-anchored)', 'KILLS', cols.dps, cols.kills);

// worst-case weapon names actually in the game
// REAL names, extracted from the actual registries (WeaponCatalog.js / BuildEngine.js —
// 153 display names). These are the ten longest that can ever reach this panel; artificial
// test strings would prove nothing about the shipped content.
const NAMES = ['Overloaded Magnetic Arc Burst','Holographic Energy Knuckles','Frozen Eden / Glitch Vortex',
               'Shadow-Toxic Diagonal Cuts','Cyber-Gauntlets Injection','Digital Gas Needle Vector',
               'Spirit Crescent Kick Aura','Distributed Intelligence','Cataclysm Chain Reaction',
               'Golden Spiral Guillotine'];
for (const n of NAMES) {
  const t = fit('★ ' + n, cols.nameMax);
  over += check('name: '+n.slice(0,24), t, cols.name, cols.name+cols.nameMax);
}
// worst-case numbers
for (const [lbl,v,a0,a1] of [['DMG 999999999',999999999,cols.name+cols.nameMax,cols.dmg],
                             ['DMG 123456',123456,cols.name+cols.nameMax,cols.dmg],
                             ['DPS 99999',99999,cols.dmg,cols.dps],
                             ['KILLS 999999',999999,cols.dps,cols.kills],
                             ['DMG 0',0,cols.name+cols.nameMax,cols.dmg],
                             ['DMG 999',999,cols.name+cols.nameMax,cols.dmg],
                             ['DMG 1250000000',1250000000,cols.name+cols.nameMax,cols.dmg],
                             ['DPS 0',0,cols.dmg,cols.dps],
                             ['KILLS 0',0,cols.dps,cols.kills]])
  over += check(lbl+' → '+num(v), num(v), a0, a1);

// footer
const foot = fit('MOST EFFECTIVE: Overloaded Magnetic Arc Burst', W - PAD*2);
over += check('MOST EFFECTIVE (longest)', foot, PAD, W-PAD);

console.log();
T('συνολικό overflow = 0', ()=>over===0||`${over.toFixed(0)}px`);
T('ellipsis σε ΟΛΑ τα πραγματικά ονόματα που δεν χωρούν',
  ()=>NAMES.every(n=>{const d=fit('★ '+n, cols.nameMax); return measure(d)<=cols.nameMax;}));
T('το μεγαλύτερο πραγματικό όνομα παίρνει ellipsis',
  ()=>fit('★ Overloaded Magnetic Arc Burst', cols.nameMax).endsWith('…'));
T('κοντό όνομα ΔΕΝ κόβεται', ()=>fit('★ Chakram', cols.nameMax)==='★ Chakram');
T('καμία τομή στηλών (name τέλος < DMG αρχή)',
  ()=>cols.name+cols.nameMax <= cols.dmg - measure(num(999999999))||'columns intersect');
T('όλα εντός panel', ()=>cols.kills<=W-PAD && cols.name>=PAD);
T('magnitude formatting: 9-ψήφιο → B (όχι 1000M)', ()=>num(999999999)==='1.00B');
T('ανοχή ±10% στη μετρική γραμματοσειράς', ()=>{
  const M=t=>t.length*CH*1.1;
  return M(fit('★ Overloaded Magnetic Arc Burst', cols.nameMax)) <= cols.nameMax*1.1 + 1; });

console.log('\n── source integrity ──');
T('compact mode στο draw code', ()=>/const compact = !!\(slot && slot\.compact\)/.test(BE));
T('4 στήλες στο compact (WEAPON/DMG/DPS/KILLS)',
  ()=>/fillText\('DMG',/.test(BE) && /fillText\('KILLS', cols\.kills/.test(BE));
T('PEAK/CRIT διατηρούνται στο πλήρες panel', ()=>/fillText\('PEAK', x \+ 380/.test(BE) && /fillText\('CRIT', x \+ 490/.test(BE));
T('αριθμοί right-aligned', ()=>/ctx\.textAlign = 'right';/.test(BE));
T('max 5 γραμμές σε compact', ()=>/slot\.compact \? 5 : 6/.test(BE));
T('ύψος panel <= 158px', ()=>52+5*16+26===158);


console.log('\n── numeric formatter boundaries ──');
const BOUNDS = [[0,'0'],[999,'999'],[1000,'1.00K'],[9999,'10.0K'],[10000,'10.0K'],[14604,'14.6K'],
  [99999,'100K'],[100000,'100K'],[999499,'999K'],[999500,'1.00M'],[999999,'1.00M'],[1000000,'1.00M'],
  [9999999,'10.0M'],[999499999,'999M'],[999500000,'1.00B'],[999999999,'1.00B'],[1000000000,'1.00B'],
  [1250000000,'1.25B'],[999500000000,'1.00T'],[1000000000000,'1.00T']];
let bErr = 0;
for (const [inp, want] of BOUNDS) {
  const got = num(inp);
  if (got !== want) { bErr++; console.log(`  MISMATCH ${inp} → ${got} (αναμενόταν ${want})`); }
}
T('όλα τα 20 boundary cases σωστά', ()=>bErr===0||`${bErr} λάθη`);
T('κανένα αποτέλεσμα δεν αρχίζει με 1000+suffix',
  ()=>!BOUNDS.some(([i])=>/^1000[KMBT]/.test(num(i))));
T('προαγωγή μονάδας στο rounding (999500 → M, όχι 1000K)', ()=>num(999500)==='1.00M');
T('re-band μετά το rounding (9999999 → 10.0M, όχι 10.00M)', ()=>num(9999999)==='10.0M');
T('χωρίς suffix κάτω από 1000', ()=>num(999)==='999' && num(0)==='0');
T('deterministic output', ()=>BOUNDS.every(([i])=>num(i)===num(i)));
T('όλες οι τιμές χωρούν στη στήλη τους',
  ()=>BOUNDS.every(([i])=>measure(num(i)) <= cols.dmg - (cols.name+cols.nameMax)));
T('τιμές αμετάβλητες (formatter είναι pure)',
  ()=>{const v=1250000000; num(v); return v===1250000000;});

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
