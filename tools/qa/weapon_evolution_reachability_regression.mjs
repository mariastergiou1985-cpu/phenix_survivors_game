// WEAPON EVOLUTION REACHABILITY REGRESSION — tracked evidence for the Phase-2 P1 finding:
// in NATURAL play the level-up/card economy does not deliver weapon L5 or ANY evolution.
// Drives full natural runs with an OPTIMAL evolution>mastery>be_w picker and measures the real
// reachability. Asserts the CURRENTLY-OBSERVED failure so the suite stays green while the defect is
// tracked; if a Phase-4 economy fix later makes evolutions reachable, THIS TEST FLIPS TO FAIL —
// which is the intended tripwire signalling the fix landed and this gate must be re-baselined.
// NON-VACUOUS: every assertion is computed from real Game.update runs. Exit 1 on regression.
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(path.join(HERE, 'headless-env.mjs'));
installEnv();
let _un = muteConsole();
const { Game } = await import(path.resolve(HERE, '../../js/game/Game.js'));
_un();
const IN = (k)=>({keys:k||new Set(),mousePos:{x:0,y:0},mouseDown:false});

function naturalRun(ch, minutes){
  const g = new Game(); g.audio=null; const evos=[];
  const u=muteConsole(); g.selectedCharacter=ch; g.gameState='playing'; g.reset(); g._enterEndless(); u();
  if(g.buildEngine?._evolve){ const oe=g.buildEngine._evolve.bind(g.buildEngine); g.buildEngine._evolve=(w)=>{evos.push(w);return oe(w);}; }
  let legacyEvoAnn=0; if(g.triggerAnnouncement){ const oa=g.triggerAnnouncement.bind(g); g.triggerAnnouncement=(m,...a)=>{ if(/EVOLUTION/i.test(String(m||'')))legacyEvoAnn++; return oa(m,...a); }; }
  let cards=0, weaponCards=0, masteryCards=0, maxW=0;
  for(let f=0; f<minutes*60*60; f++){
    if(g.upgradeUI){ const opts=g.upgradeUI.options||g.upgradeUI.choices||[]; cards++;
      if(Array.isArray(opts)){ for(const o of opts){ const k=String(o?.key||''); if(k.startsWith('be_w_')||k.startsWith('_wacq_')||k.startsWith('_wupg_'))weaponCards++; if(k.includes('mastery'))masteryCards++; }
        let i=opts.findIndex(o=>/EVOLUTION/i.test(String(o?.description||'')+String(o?.key||'')));
        if(i<0)i=opts.findIndex(o=>String(o?.key||'').includes('mastery'));
        if(i<0)i=opts.findIndex(o=>String(o?.key||'').startsWith('be_w_'));
        if(i<0)i=0;
        try{g.selectUpgrade(i);}catch(_){g.upgradeUI=null;} } }
    if(g.mutationUI){try{g.selectMutation(0);}catch(_){g.mutationUI=null;}}
    if(g._postArenaChoice){try{g._selectPostArenaChoice(0);}catch(_){g._postArenaChoice=false;}}
    if(g.player)g.player.hp=g.player.maxHp;
    try{g.update(1/60,IN(new Set(['d'])));}catch(_){}
    for(const [k,v] of (g._weaponLevels?.entries?.()||[])) maxW=Math.max(maxW,v);
    for(const [k,v] of (g.buildEngine?.weapons?.entries?.()||[])) maxW=Math.max(maxW,v.level||0);
  }
  return { ch, playerLevel:g.player?.level||0, cards, weaponCards, masteryCards, maxWeaponLevel:maxW,
    beEvolutions:evos.length, legacyEvoAnnouncements:legacyEvoAnn };
}

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

console.log('═══ WEAPON EVOLUTION REACHABILITY (tracked P1 evidence — economy) ═══');
console.log('── driving natural runs (optimal evolution>mastery>be_w picker) ──');
const runs = ['skeleton_warrior','oni_cataclysm_protocol'].map(c => naturalRun(c, 8));
for (const r of runs) console.log(`  ${r.ch}: plvl ${r.playerLevel}, cards ${r.cards}, weaponCards ${r.weaponCards}, masteryCards ${r.masteryCards}, maxWeaponLvl ${r.maxWeaponLevel}, beEvo ${r.beEvolutions}, legacyEvoAnn ${r.legacyEvoAnnouncements}`);

console.log('\n── DOCUMENTED FAILURE (P1 — fix scheduled for Phase 4 level-up economy) ──');
T('natural runs progress (player level >=12, level-up loop works)', ()=> runs.every(r=>r.playerLevel>=12) || 'plvls: '+runs.map(r=>r.playerLevel).join(','));
T('weapon/mastery cards ARE offered (economy is not empty)', ()=> runs.every(r=>(r.weaponCards+r.masteryCards)>=2) || 'offers: '+runs.map(r=>(r.weaponCards+r.masteryCards)).join(','));
T('[DEFECT] NO weapon reaches L5 despite offered cards (spread prevents accumulation)', ()=> runs.every(r=>r.maxWeaponLevel<5) || 'a weapon reached L5 — reachability may be FIXED, re-baseline: '+runs.map(r=>r.maxWeaponLevel).join(','));
T('[DEFECT] ZERO evolutions fire in natural play (BE + legacy)', ()=> runs.every(r=>r.beEvolutions===0 && r.legacyEvoAnnouncements===0) || 'an evolution fired — FIXED? re-baseline: '+runs.map(r=>r.beEvolutions+'/'+r.legacyEvoAnnouncements).join(','));

const avgCards = runs.reduce((s,r)=>s+r.cards,0)/runs.length;
const avgMastery = runs.reduce((s,r)=>s+r.masteryCards,0)/runs.length;
console.log(`\n  ANALYSIS: avg ${avgCards.toFixed(1)} cards/run, avg ${avgMastery.toFixed(1)} mastery cards/run.`);
console.log('  A legacy weapon needs ~5 mastery picks of the SAME weapon to hit L5; a BE weapon needs its');
console.log('  be_w card 5x AND its evolution passive at L3 - both drawn from ~25 weapons / ~50 passives.');
console.log('  ROOT CAUSE: card pool dilution + low weapon/mastery offer-rate -> expected L5 far beyond a run.');
console.log('  FIX OWNER: Phase 4 (level-up economy). This test tracks the defect until then.');

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
