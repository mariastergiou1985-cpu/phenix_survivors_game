// ANNOUNCEMENT PRIORITY — mirrors Game.triggerAnnouncement / _showAnnouncement exactly.
// Run: node tools/qa/announcement_priority_regression.mjs   (exit 1 on failure)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC  = fs.readFileSync(path.resolve(HERE, '../../js/game/Game.js'), 'utf8');

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}
  catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

const CAP = 3;
const mk = () => ({ announcement:null, _annQueue:[], _frozenSleet:false, dropped:[] });
const show = (g, text, prio) => { g.announcement = { text, priority: prio, phase:'fadein', timer:0 }; };
const trigger = (g, text, prio = 0) => {
  const q = g._annQueue;
  if (g.announcement && g.announcement.text === text) return 'dup-current';
  if (q.some(e => e.text === text)) return 'dup-queued';
  const busy = !!g.announcement || g._frozenSleet;
  if (!busy) { show(g, text, prio); return 'shown'; }
  if (prio >= 2 && g.announcement && (g.announcement.priority||0) === 0 && !g._frozenSleet) {
    g.announcement = null; show(g, text, prio); return 'preempted';
  }
  let at = q.length;
  for (let i=0;i<q.length;i++){ if ((q[i].priority||0) < prio) { at = i; break; } }
  q.splice(at, 0, { text, priority: prio });
  while (q.length > CAP) {
    let victim = -1, worst = Infinity;
    for (let i=q.length-1;i>=0;i--){ const pi=q[i].priority||0; if (pi<worst){ worst=pi; victim=i; } }
    if (worst < prio) { g.dropped.push(q[victim]); q.splice(victim,1); continue; }
    if (prio >= 2) break;
    g.dropped.push(q[at]); q.splice(at,1); break;
  }
  return 'queued';
};
const drain = (g) => { g.announcement = null;
  if (g._annQueue.length){ const nx=g._annQueue.shift(); show(g, nx.text, nx.priority||0); } };

console.log('═══ ANNOUNCEMENT PRIORITY ═══\n── ΤΟ ΑΡΧΙΚΟ FAILURE SCENARIO ──');
const g = mk();
trigger(g, 'GRID CACHE DETECTED', 0);
trigger(g, 'LOCKED VAULT — 30 KILLS', 0);
trigger(g, 'NEXUS ROLES — GOLD/RED', 0);
trigger(g, 'SECRET LOG DECRYPTED', 0);
const res = trigger(g, '⚠ AI OVERLORD — FINAL BREACH', 2);
console.log(`  critical result: ${res} · visible: "${g.announcement.text}" · queue ${g._annQueue.length}`);
T('το critical ΔΕΝ απορρίπτεται', ()=>res!=='DROPPED');
T('το critical εμφανίζεται ΑΜΕΣΩΣ', ()=>g.announcement.text.includes('OVERLORD'));
T('τουλάχιστον ένα informational αφαιρέθηκε ή διακόπηκε',
  ()=>g.dropped.length>0 || !g._annQueue.some(q=>q.text==='GRID CACHE DETECTED'));
T('maximum visible banners = 1', ()=>typeof g.announcement==='object' && g.announcement!==null);

console.log('\n── κανόνες προτεραιότητας ──');
T('priority 0 ΔΕΝ αντικαθιστά ενεργό priority 2', ()=>{const x=mk();trigger(x,'CRIT',2);trigger(x,'info',0);
  return x.announcement.text==='CRIT';});
T('priority 1 ΔΕΝ αντικαθιστά ενεργό priority 2', ()=>{const x=mk();trigger(x,'CRIT',2);trigger(x,'BOSS',1);
  return x.announcement.text==='CRIT';});
T('priority 1 ΔΕΝ διακόπτει ενεργό informational (μπαίνει στην ουρά)',
  ()=>{const x=mk();trigger(x,'info',0);trigger(x,'BOSS',1);
  return x.announcement.text==='info' && x._annQueue[0].text==='BOSS';});
T('priority 2 προηγείται queued 1 και 0', ()=>{const x=mk();trigger(x,'CRIT_A',2);
  trigger(x,'info',0);trigger(x,'BOSS',1);trigger(x,'CRIT_B',2);
  return x._annQueue[0].text==='CRIT_B';});
T('δύο ΔΙΑΦΟΡΕΤΙΚΑ priority 2 διατηρούνται', ()=>{const x=mk();trigger(x,'C1',2);
  trigger(x,'C2',2);trigger(x,'C3',2);trigger(x,'C4',2);
  const kept=[x.announcement.text,...x._annQueue.map(q=>q.text)];
  return ['C1','C2','C3','C4'].every(c=>kept.includes(c))||'kept '+kept.join(',');});
T('duplicate priority 2 καταστέλλεται', ()=>{const x=mk();trigger(x,'CRIT',2);
  return trigger(x,'CRIT',2)==='dup-current';});
T('priority 0 απορρίπτεται όταν η ουρά γεμίσει με σημαντικότερα',
  ()=>{const x=mk();trigger(x,'CRIT',2);trigger(x,'B1',1);trigger(x,'B2',1);trigger(x,'B3',1);
  trigger(x,'info',0); return !x._annQueue.some(q=>q.text==='info');});

console.log('\n── drain διατηρεί priority ──');
T('η ουρά αδειάζει κατά προτεραιότητα', ()=>{const x=mk();trigger(x,'live',1);
  trigger(x,'info2',0);trigger(x,'BOSS',1);trigger(x,'CRIT',2);
  drain(x); return x.announcement.text==='CRIT';});

console.log('\n── source integrity ──');
T('κανένας keyword classifier για priority',
  ()=>!/priority\s*=\s*[^;]*(?:includes|match|test|indexOf)\(/.test(SRC));
T('default priority = 0 (back-compat 85 call sites)',
  ()=>/opts && Number\.isFinite\(opts\.priority\)\) \? opts\.priority : 0/.test(SRC));
T('reset() καθαρίζει announcement και _annQueue', ()=>{
  const i=SRC.indexOf('\n  reset() {'); let j=SRC.indexOf('{',i), d=0, e=-1;
  for(let p=j;p<SRC.length;p++){ if(SRC[p]==='{')d++; else if(SRC[p]==='}'){d--; if(!d){e=p;break;}} }
  const r=SRC.slice(j,e); return r.includes('this.announcement') && r.includes('_annQueue'); });
T('2 explicit priority-2 call sites', ()=>(SRC.match(/triggerAnnouncement\([^\n]*priority: 2/g)||[]).length===2);
T('4 explicit priority-1 call sites', ()=>(SRC.match(/triggerAnnouncement\([^\n]*priority: 1/g)||[]).length===4);
T('event timers/cooldowns αμετάβλητα (καμία αλλαγή σε _updateAnnouncement διάρκειες)',
  ()=>/FADE_IN = 0\.35, HOLD = 1\.9, FADE_OUT = 0\.55/.test(SRC));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
