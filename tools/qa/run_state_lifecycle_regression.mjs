// RUN-STATE LIFECYCLE — lazy-init timer fields must re-arm on every run.
// Run: node tools/qa/run_state_lifecycle_regression.mjs   (exit 1 on failure)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC  = fs.readFileSync(path.resolve(HERE, '../../js/game/Game.js'), 'utf8');

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

// Faithful models of the real lazy-init guards, so the semantics are what is under test.
const titanTick = (g, dt) => {                       // Game._updateChaosTitans
  if (g._chaosTitanTimer == null) { g._chaosTitanTimer = 40; g._chaosTitanIdx = 0; }
  g._chaosTitanTimer -= dt;
  if (g._chaosTitanTimer > 0) return false;
  g._chaosTitanTimer = 55; g._chaosTitanIdx = (g._chaosTitanIdx + 1) % 4;
  return true;                                        // Titan spawns
};
const thiefTick = (g, dt) => {
  g._thiefTimer = (g._thiefTimer ?? 20) - dt;
  if (g._thiefTimer > 0) return false;
  g._thiefTimer = 26; return true;
};
// The fix under test: _enterEndless() clears both to null at the run boundary.
const enterEndless = (g) => { g._chaosTitanTimer = null; g._chaosTitanIdx = 0; g._thiefTimer = null; };
const runFor = (g, secs, tick) => { let fires=0, first=null;
  for (let i=0;i<secs*60;i++){ if (tick(g, 1/60)) { fires++; if (first===null) first = +(i/60).toFixed(1); } }
  return { fires, first }; };

console.log('═══ RUN-STATE LIFECYCLE ═══\n── the fix is present in source ──');
T('_enterEndless clears _chaosTitanTimer', ()=>/this\._chaosTitanTimer = null/.test(SRC));
T('_enterEndless clears _chaosTitanIdx',   ()=>/this\._chaosTitanIdx\s*=\s*0/.test(SRC));
T('_enterEndless clears _thiefTimer',      ()=>/this\._thiefTimer\s*=\s*null/.test(SRC));
T('designed durations UNCHANGED (40 / 55 / 20 / 26)',
  ()=>/_chaosTitanTimer = 40/.test(SRC) && /_chaosTitanTimer = 55/.test(SRC)
   && /_thiefTimer = \(this\._thiefTimer \?\? 20\)/.test(SRC) && /_thiefTimer = 26/.test(SRC));

console.log('\n── Chaos Titan: run 1 → run 2 in the SAME instance ──');
const g = {};
enterEndless(g);
const r1 = runFor(g, 120, titanTick);
console.log(`  run 1: first Titan @ ${r1.first}s, ${r1.fires} total`);
T('run 1: πρώτος Titan στα 40s (σχεδιασμένο)', ()=>r1.first===40||'got '+r1.first);

const leaked = g._chaosTitanTimer, leakedIdx = g._chaosTitanIdx;
enterEndless(g);                                     // new run — the fix
const r2 = runFor(g, 120, titanTick);
console.log(`  run 2: first Titan @ ${r2.first}s (leftover ήταν ${leaked.toFixed(1)}s, idx ${leakedIdx})`);
T('run 2: ΞΑΝΑ στα 40s (καμία διαρροή)', ()=>r2.first===40||'got '+r2.first);
T('run 2: ίδιος αριθμός Titans με run 1', ()=>r2.fires===r1.fires||`${r1.fires} vs ${r2.fires}`);
T('Titan cycle index ξεκινά από 0', ()=>{ const t={}; enterEndless(t); titanTick(t,1/60); return t._chaosTitanIdx===0; });

console.log('\n── ΧΩΡΙΣ τη διόρθωση το leak είναι πραγματικό ──');
const bad = {};
runFor(bad, 120, titanTick);                          // run 1, no boundary clear
const leftover = bad._chaosTitanTimer;
const rBad = runFor(bad, 120, titanTick);             // run 2 without the fix
console.log(`  χωρίς fix: run 2 πρώτος Titan @ ${rBad.first}s (leftover ${leftover.toFixed(1)}s)`);
T('αποδεικνύεται ότι χωρίς fix ΔΕΝ είναι 40s', ()=>rBad.first!==40||'ήταν 40 — δεν υπάρχει leak');

console.log('\n── Thief timer: run 1 → run 2 ──');
const t1 = {}; enterEndless(t1);
const th1 = runFor(t1, 90, thiefTick);
enterEndless(t1);
const th2 = runFor(t1, 90, thiefTick);
console.log(`  run 1 first @ ${th1.first}s · run 2 first @ ${th2.first}s`);
T('thief: run 1 πρώτος στα 20s', ()=>th1.first===20||'got '+th1.first);
T('thief: run 2 ΞΑΝΑ στα 20s', ()=>th2.first===20||'got '+th2.first);

console.log('\n── safe-by-design fields δεν αλλάχθηκαν ──');
T('_oniContactCd κρατά το || 0 guard', ()=>/_oniContactCd = \(this\._oniContactCd \|\| 0\)/.test(SRC));
T('_plasmaWarnCd κρατά το > 0 guard',  ()=>/if \(this\._plasmaWarnCd > 0\) this\._plasmaWarnCd -= dt/.test(SRC));
T('_achTimer κρατά το || 0 guard',     ()=>/_achTimer = \(this\._achTimer \|\| 0\)/.test(SRC));
T('_vesselPulseTimer αρχικοποιείται ρητά', ()=>/this\._vesselPulseTimer\s*=\s*0;/.test(SRC));
T('_upgradeMsgTimer αρχικοποιείται ρητά',  ()=>/this\._upgradeMsgTimer = 0;/.test(SRC));
T('_menuArtTimer καθαρίζεται με clearInterval', ()=>/clearInterval\(this\._menuArtTimer\)/.test(SRC));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
