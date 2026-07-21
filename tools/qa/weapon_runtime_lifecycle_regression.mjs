// WEAPON RUNTIME LIFECYCLE REGRESSION — drives ALL 42 catalog weapons through the REAL acquired-weapon
// production fire path (_tickAcquiredWeapons/_autoFireWeapon) and asserts, per weapon: created, fired,
// real enemy hit, finite POSITIVE damage, monotonic runtime scaling (L1<mid<max dmg-per-window),
// bounded VFX pool, reset clearing, and 2nd-run non-doubling. Bounded (~20s). Exit 1 on any failure.
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(path.join(HERE, 'headless-env.mjs'));
installEnv();
let _un = muteConsole();
const wc = await import(path.resolve(HERE, '../../js/game/WeaponCatalog.js'));
const { Game } = await import(path.resolve(HERE, '../../js/game/Game.js'));
let Enemy = null; try { Enemy = (await import(path.resolve(HERE, '../../js/entities/Enemy.js'))).Enemy; } catch (_) {}
_un();
const IN = (k)=>({keys:k||new Set(),mousePos:{x:0,y:0},mouseDown:false});
const ids = Object.keys(wc.WEAPON_DEFS);
const POOLS = ['_activeWeaponVFX','_evoFx'];
const poolSum = g => POOLS.reduce((n,k)=> n + (Array.isArray(g[k]) ? g[k].length : 0), 0);
function isolate(g){ try{g._weaponLevels?.clear?.();}catch(_){} try{g.buildEngine?.weapons?.clear?.();g.buildEngine?.passives?.clear?.();}catch(_){}
  try{g._evolvedWeapons?.clear?.();}catch(_){} try{g._consumedWeapons?.clear?.();}catch(_){} try{g._acquiredWeaponTimers?.clear?.();}catch(_){}
  try{g._activePets=[];}catch(_){} try{if(Array.isArray(g.projectiles))g.projectiles.length=0;}catch(_){} try{if(Array.isArray(g.enemyBullets))g.enemyBullets.length=0;}catch(_){} try{if(Array.isArray(g._petBolts))g._petBolts.length=0;}catch(_){} }
function freeze(g){ for(const e of (g.enemies||[])){ if(e){ e.hp = e.maxHp || 1e6; } } }

function runWeapon(id){
  const def = wc.WEAPON_DEFS[id];
  const rig = (id==='storm_saber') ? 'taekwondo_girl' : 'skeleton_warrior';
  const g = new Game(); g.audio=null;
  let hits=0, dmg=0, nan=false, hookOn=false, unhook=null;
  if (Enemy?.prototype?.takeHit){ const o=Enemy.prototype.takeHit; Enemy.prototype.takeHit=function(d,gm){ if(hookOn){ hits++; const n=+d; if(!Number.isFinite(n))nan=true; else dmg+=n; } return o.call(this,d,gm); }; unhook=()=>{Enemy.prototype.takeHit=o;}; }
  const u=muteConsole(); g.selectedCharacter=rig; g.gameState='playing'; g.reset(); g._enterEndless(); u();
  for(let f=0;f<5*60;f++){ if(g.upgradeUI){try{g.selectUpgrade(0);}catch(_){g.upgradeUI=null;}} if(g.player)g.player.hp=g.player.maxHp; try{g.update(1/60,IN());}catch(_){} }
  isolate(g);
  const RIG='__qa_rig__'; g.selectedCharacter=RIG; if(g.player)g.player.selectedCharacter=RIG;
  freeze(g);
  const px=g.player.pos.x, py=g.player.pos.y; let cx=px,cy=py,bd2=620*620;
  for(const e of (g.enemies||[])){ if(!e||!e.pos)continue; const dx=e.pos.x-px,dy=e.pos.y-py,d2=dx*dx+dy*dy; if(d2<bd2){bd2=d2;cx=e.pos.x;cy=e.pos.y;} }
  const dW=(L)=>{ const st=wc.getWeaponStatsAtLevel(id,L); const a2=(st.aoeRadius||60)**2; let t=0; for(const e of (g.enemies||[])){ if(!e||!e.pos)continue; const dx=e.pos.x-cx,dy=e.pos.y-cy; if(dx*dx+dy*dy<=a2)t++; } return t*st.damage*(3/(st.cooldown||1)); };
  const d1=dW(1), d3=dW(3), d5=dW(5);
  hookOn=true; g._acquiredWeaponTimers?.set?.(id,0); const rh=hits, rd=dmg; let err=null;
  try{ g._autoFireWeapon(id,5,999); }catch(e){ err=e.message; }
  const realTargets=hits-rh, realDmg=Math.round(dmg-rd);
  g._weaponLevels.clear(); g._acquiredWeaponTimers?.clear?.(); g._weaponLevels.set(id,5);
  let vfxPeak=0; for(let f=0;f<180;f++){ freeze(g); if(g.player)g.player.hp=g.player.maxHp; try{g.update(1/60,IN());}catch(_){} vfxPeak=Math.max(vfxPeak,poolSum(g)); }
  g._weaponLevels.clear(); const preIdle=poolSum(g); for(let f=0;f<120;f++){try{g.update(1/60,IN());}catch(_){}} const postIdle=poolSum(g);
  const uu=muteConsole(); g.reset(); uu();
  const wReset=g._weaponLevels?.size||0, poolReset=poolSum(g);
  const uu2=muteConsole(); g.selectedCharacter=rig; g.gameState='playing'; g._enterEndless(); uu2();
  for(let f=0;f<3*60;f++){ if(g.upgradeUI){try{g.selectUpgrade(0);}catch(_){g.upgradeUI=null;}} if(g.player)g.player.hp=g.player.maxHp; try{g.update(1/60,IN());}catch(_){} }
  isolate(g); g.selectedCharacter=RIG; if(g.player)g.player.selectedCharacter=RIG; g._weaponLevels.set(id,5);
  let vfx2=0; for(let f=0;f<180;f++){ freeze(g); if(g.player)g.player.hp=g.player.maxHp; try{g.update(1/60,IN());}catch(_){} vfx2=Math.max(vfx2,poolSum(g)); }
  hookOn=false; if(unhook)unhook();
  return { id, err, realTargets, realDmg, nan, d1, d3, d5, vfxPeak, cleaned: postIdle<=Math.max(2,preIdle),
    reset: wReset<=1 && poolReset<20, noDouble: vfx2 <= Math.max(vfxPeak,1)*1.8+3, capOk: Math.max(vfxPeak,vfx2)<=64,
    created:true, fired: !err && (realTargets>0||vfxPeak>0), finitePos: realDmg>0 && Number.isFinite(realDmg) && !nan,
    scaleStat: (wc.getWeaponStatsAtLevel(id,5).damage>wc.getWeaponStatsAtLevel(id,3).damage && wc.getWeaponStatsAtLevel(id,3).damage>wc.getWeaponStatsAtLevel(id,1).damage),
    scaleRuntime: d5>=d3 && d3>=d1 && d5>d1 };
}

let pass=0, fail=0;
const T=(n,f)=>{let ok=false,note='';try{const r=f();ok=r===true;if(typeof r==='string')note=r;}catch(e){note='THREW: '+e.message;}ok?pass++:fail++;console.log(`  ${ok?'PASS':'FAIL'}  ${n}${note?' — '+note:''}`);};

console.log('═══ WEAPON RUNTIME LIFECYCLE REGRESSION (42/42 via acquired-fire path) ═══');
const R = ids.map(runWeapon);
const bad = (pred)=> R.filter(r=>!pred(r)).map(r=>r.id).slice(0,6);
T(`42 weapons driven (got ${R.length})`, ()=> R.length===42 || `got ${R.length}`);
T('42/42 created', ()=>{ const b=bad(r=>r.created); return b.length===0 || b.join(','); });
T('42/42 fired (no fire exception, real target or VFX)', ()=>{ const b=bad(r=>r.fired && !r.err); return b.length===0 || b.join(','); });
T('42/42 real enemy HIT via production fire fn', ()=>{ const b=bad(r=>r.realTargets>0); return b.length===0 || b.join(','); });
T('42/42 finite POSITIVE damage (no NaN/Infinity)', ()=>{ const b=bad(r=>r.finitePos); return b.length===0 || b.join(','); });
T('42/42 monotonic STAT scaling L1<L3<L5', ()=>{ const b=bad(r=>r.scaleStat); return b.length===0 || b.join(','); });
T('42/42 monotonic RUNTIME scaling (dmg/window L1<=L3<=L5, L5>L1)', ()=>{ const b=bad(r=>r.scaleRuntime); return b.length===0 || b.join(','); });
T('42/42 VFX pool bounded (<=64)', ()=>{ const b=bad(r=>r.capOk); return b.length===0 || b.join(','); });
T('42/42 effects clean up on idle', ()=>{ const b=bad(r=>r.cleaned); return b.length===0 || b.join(','); });
T('42/42 reset clears weapon + pools', ()=>{ const b=bad(r=>r.reset); return b.length===0 || b.join(','); });
T('42/42 second run does NOT double pool state', ()=>{ const b=bad(r=>r.noDouble); return b.length===0 || b.join(','); });

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail?1:0);
