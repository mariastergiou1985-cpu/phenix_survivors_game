// WEAPON TARGETING PASS — runtime proof for BOTH weapon systems.
//
// THE TEST, and why it cannot be gamed by a comment.
// TWO crowds around a frozen player: LEFT at 150px, RIGHT at 128px (deliberately nearer, so a
// weapon that picks "nearest" picks RIGHT deterministically). The player always aims LEFT.
//   hits RIGHT only          -> it chose a BODY and ignored the player  -> AUTO-AIM
//   hits LEFT only           -> the player aimed it                     -> player-aimed
//   hits BOTH about equally  -> radial/no aim at all                    -> radial (NOT auto-aim)
//   hits NEITHER             -> SILENT: reported, never counted as "fixed"
// Both crowds sit inside melee reach (arc reach is radius+130, radius 72-114), which the first
// version of this proof got wrong: a single crowd at 300px was outside every melee arc and
// reported 44 of 50 weapons "silent" against working code.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9450;
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png',
               '.jpg':'image/jpeg','.json':'application/json','.ogg':'audio/ogg','.mp3':'audio/mpeg',
               '.wav':'audio/wav','.mp4':'video/mp4' };
const srv = http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
const GAME_V = fs.readFileSync(path.join(ROOT,'js/main.js'),'utf8').match(/Game\.js\?v=(\d+)/)[1];
const BE_V   = fs.readFileSync(path.join(ROOT,'js/game/Game.js'),'utf8').match(/BuildEngine\.js\?v=(\d+)/)[1];
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));

const browser = await chromium.launch({ executablePath: EXE,
  args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR '+e));
page.on('console',m=>{ if(m.type()==='error'&&!/Failed to load resource/.test(m.text())) errs.push('CONSOLE '+m.text()); });
await page.route(/https?:\/\/(?!127\.0\.0\.1)/, r=>{
  const u=r.request().url();
  if(/fonts\.googleapis/.test(u)) return r.fulfill({status:200,contentType:'text/css',body:'/*x*/'});
  return r.abort();
});
await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#cgm-overlay',{timeout:20000});
await page.waitForTimeout(1300);
await page.evaluate(async (v)=>{
  const mod=await import(`./js/game/Game.js?v=${v}`);
  await new Promise(res=>{const o=mod.Game.prototype.update;
    mod.Game.prototype.update=function(...a){window.__g=this;mod.Game.prototype.update=o;res();return o.apply(this,a);};});
},GAME_V);

const LISTS = await page.evaluate(async ({bev}) => {
  const g = window.__g;
  g.meta._save = () => {};
  const mkStub = () => new Proxy(function(){}, { get:(t,k)=> k==='then'?undefined:mkStub(), apply:()=>undefined, set:()=>true });
  g.audio = mkStub();
  // dimis_kickboxer is the ONE roster character with no WeaponCatalog entry, so
  // getWeaponForCharacter() returns null and _tickAcquiredWeapons skips nothing. Every legacy
  // weapon therefore runs through the real acquired path instead of being silently excluded.
  g.selectedCharacter = 'dimis_kickboxer';
  if (g.player) g.player.selectedCharacter = 'dimis_kickboxer';
  g.gameState='playing'; g.gameOver=false; g.victory=false; g.paused=false;
  g.upgradeUI=null; g.mutationUI=null; g.endless=true; g._chaosMode=false;
  try { g._hideCharSelectOverlay?.(); } catch(_) {}
  for (const s of ['#cgm-charselect','#cgm-collection','#cgm-chaos-law-sel']) { const n=document.querySelector(s); if(n) n.remove(); }
  window.__Vec2 = (await import('./js/constants.js')).Vec2;
  const WC = await import('./js/game/WeaponCatalog.js?v=1');
  const BE = await import(`./js/game/BuildEngine.js?v=${bev}`);
  window.__BE_DEFS = BE.WEAPON_DEFS; window.__BE_EVO = BE.EVOLUTION_RECIPES;
  return {
    legacy: Object.values(WC.WEAPON_DEFS).map(w => w.id),
    beBase: Object.keys(BE.WEAPON_DEFS),
    beEvo:  Object.keys(BE.EVOLUTION_RECIPES),
  };
}, {bev: BE_V});

await page.evaluate(() => {
  const g = window.__g, P = g.player;
  window.__mkE = (x,y) => {
    const e = { pos: new window.__Vec2(x,y), hp: 1e7, maxHp: 1e7, radius: 18, hitFlash: 0,
      vel:{x:0,y:0}, dmgTaken: 0, isElite:false, isMegaBoss:false,
      isBoss(){return false;}, takeHit(d){ this.dmgTaken += d; this.hp -= d; return true; },
      keepInBounds(){}, update(){}, draw(){} };
    g.enemies.push(e); return e;
  };
  window.__clean = () => {
    g.enemies.length = 0;
    g.projectiles.length = 0;
    for (const k of ['titanBoss','annihilatorBoss','bloodfangBoss','cyberSerpentBoss','cyberDragonBoss','doubleDemonsBoss']) g[k]=null;
    const rt = g.buildEngine;
    if (rt) {
      rt.weapons.clear(); rt.passives.clear();
      rt.shards.length = 0; rt.novas.length = 0; rt.fx.length = 0; rt.patches.length = 0;
      if (Array.isArray(rt._pending)) rt._pending.length = 0;     // baseline-safe: may not exist
      rt._status = new Map();
    }
    g._weaponLevels.clear(); g._evolvedWeapons.clear(); g._consumedWeapons.clear();
    g._acquiredWeaponTimers.clear();
    // The spatial grid is rebuilt ONCE PER REAL FRAME. This proof steps hundreds of weapon
    // frames inside a single synchronous evaluate, so the grid stays frozen at whatever the last
    // rAF built — empty of the enemies pushed since. Every executor that queries it then hit
    // nothing, and 44 of 50 weapons reported "silent" against working code.
    // A STUB, not null: the Build Engine executors all carry a `: rt.game.enemies` fallback, but
    // _updateProjectiles does not — nulling the grid silenced all five legacy bolt weapons and
    // looked exactly like a bug in the new delivery code.
    g._spatialGrid = { query: () => g.enemies, insert(){}, clear(){}, rebuild(){} };
    P.hp = P.maxHp;
  };
  // Freeze the body and set the aim directly. Driving aim through velocity also drives the real
  // Player.update still running in the page loop — the player would slide off the arena mid-sample.
  window.__aim = (dir) => {
    P.vel.x = 0; P.vel.y = 0; P._facing = dir > 0 ? 1 : -1;
    g.gamepadAimDir = null;
    const rt = g.buildEngine;
    if (rt) rt._lastAim = dir > 0 ? 0.0001 : Math.PI;
  };
  window.__crowds = () => {
    const L=[], R=[];
    // Build Engine melee arcs reach only `radius` (72-98 at L5) — NOT radius+130 like the legacy
    // path. A crowd at 128px was outside every one of them and reported 44/50 "silent".
    // The two crowds are EQUIDISTANT (82px). Making the right one merely nearer biased every
    // weapon whose radius grows outward (phi_cutter, gravity_core) into a false AUTO-AIM.
    // Instead one single BAIT sits at 62px on the right: a weapon that picks "nearest" locks it
    // deterministically, while a radial weapon still sees identical geometry on both sides.
    // The bait is an ELITE, because magnetic_shrapnel's in-flight homing only tracks elites and
    // cannot be measured at all without one present.
    for (let k=0;k<8;k++) L.push(window.__mkE(P.pos.x-82, P.pos.y-26+(k%5)*13 + (k>=5?26:0)));
    for (let k=0;k<8;k++) R.push(window.__mkE(P.pos.x+82, P.pos.y-26+(k%5)*13 + (k>=5?26:0)));
    // TWO baits, MIRRORED at 62px, both counted. Getting this right took three attempts:
    //   right-bait-only, counted   -> biased radius-growing weapons (phi_cutter) into false AUTO-AIM
    //   right-bait-only, uncounted -> every bolt weapon died ON the bait and scored zero: "SILENT"
    // Mirrored keeps the geometry symmetric for radial weapons, while _nearestEnemy's strict `<`
    // means the FIRST enemy at the minimum distance wins — so pushing the right bait first makes
    // every nearest-picker resolve right, deterministically.
    const baitR = window.__mkE(P.pos.x+62, P.pos.y); baitR.isElite = true; R.push(baitR);
    const baitL = window.__mkE(P.pos.x-62, P.pos.y); baitL.isElite = true; L.push(baitL);
    return {L,R};
  };
});

const FRAMES = 420;
async function measure(kind, id, evolved, aimDir) {
  return page.evaluate(({kind,id,evolved,FRAMES,aimDir}) => {
    const g = window.__g, P = g.player, rt = g.buildEngine;
    window.__clean();
    const dir = (typeof aimDir === 'number') ? aimDir : -1;   // default: the player aims LEFT
    window.__aim(dir);
    const {L,R} = window.__crowds();
    if (kind === 'be') {
      try {
        rt.addWeapon(id);
        const w = rt.weapons.get(id);
        if (w) { w.level = 5; if (evolved) { w.evolved = true; } }
      } catch (e) { return { err: String(e), dmg: 0 }; }
      for (let i=0;i<FRAMES;i++) { window.__aim(dir); try { rt.update(1/60); } catch(e){ return {err:String(e), dmg:0}; } }
    } else {
      try { g._grantBaseWeapon(id, 5); } catch (e) { return { err: String(e), dmg: 0 }; }
      for (let i=0;i<FRAMES;i++) {
        window.__aim(dir);
        try { g._tickAcquiredWeapons(1/60); } catch(e){ return {err:String(e), dmg:0}; }
        // Do NOT swallow these: a silent throw here reads as "the weapon deals no damage",
        // which is exactly how a working weapon gets reported as broken.
        try { g._updateProjectiles(1/60); } catch(e){ return {err:'proj '+e, l:0, r:0}; }
        try { rt?.update?.(1/60); } catch(e){ return {err:'rt '+e, l:0, r:0}; }
      }
    }
    return { l: Math.round(L.reduce((a,e)=>a+e.dmgTaken,0)),
             r: Math.round(R.reduce((a,e)=>a+e.dmgTaken,0)) };
  }, {kind,id,evolved,FRAMES,aimDir});
}

const out = { be: {}, legacy: {} };
for (const id of LISTS.beBase) {
  out.be[id]        = await measure('be', id, false);
  out.be['evo:'+id] = await measure('be', id, true);
}
for (const id of LISTS.legacy) out.legacy[id] = await measure('legacy', id, false);
// A weapon that scored zero aiming LEFT may simply have MISSED — which is the entire point of
// this change. Before calling anything "silent", re-run it aiming AT the crowd. Only a weapon
// that is zero in BOTH runs is actually dead.
for (const [group, kind] of [[out.be,'be'], [out.legacy,'legacy']]) {
  for (const k of Object.keys(group)) {
    const r = group[k];
    if (r.l > 0 || r.r > 0) continue;
    const id = k.startsWith('evo:') ? k.slice(4) : k;
    const ctl = await measure(kind, id, k.startsWith('evo:'), 1);
    r.ctl = ctl.l + ctl.r;
  }
}
await browser.close(); srv.close();

// The player aims LEFT in every run. RIGHT is where the nearest body is.
const classify = (r) => {
  if (r.l <= 0 && r.r <= 0) return (r.ctl > 0) ? 'MISSED (alive)' : 'SILENT';
  if (r.l > 0 && r.r > 0 && r.r <= r.l * 2.5 && r.l <= r.r * 2.5) return 'radial';
  if (r.r > r.l * 2.5) return 'AUTO-AIM';
  return 'player-aimed';
};
let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };

for (const [label, group, total] of [['BUILD ENGINE', out.be, 50], ['LEGACY', out.legacy, 53]]) {
  console.log(`\n══ ${label} ══`);
  console.log('   weapon                             LEFT(aim)  RIGHT(near)  verdict');
  const auto=[], silent=[], missed=[];
  for (const k of Object.keys(group)) {
    const r = group[k], v = classify(r);
    if (v === 'AUTO-AIM') auto.push(k);
    if (v === 'SILENT')   silent.push(k);
    if (v === 'MISSED (alive)') missed.push(k);
    console.log(`   ${k.padEnd(34)} ${String(r.l).padStart(9)} ${String(r.r).padStart(11)}   ${v}${r.err?'  ERR='+r.err:''}`);
  }
  console.log(`\n   AUTO-AIM: ${auto.length}/${Object.keys(group).length} -> ${auto.join(', ')||'(none)'}`);
  if (missed.length) console.log(`   MISSED but ALIVE (zero when aimed away, real damage when aimed at — this is the goal): ${missed.join(', ')}`);
  if (silent.length) console.log(`   SILENT (zero in BOTH runs — reported, NOT counted as fixed): ${silent.join(', ')}`);
  group.__auto = auto; group.__silent = silent;
}

console.log('\n══ VERDICT ══');
line(out.be.__auto.length <= 14, `Build Engine auto-aim ${out.be.__auto.length}/50 (static reading before: 46/50)`);
line(out.legacy.__auto.length <= 8, `Legacy auto-aim ${out.legacy.__auto.length}/53 (before: 53/53)`);
// solo_red_thunder is declared `kind: 'external'` in BuildEngine.js: its runtime lives in
// Game.js _updateSoloRedThunder, which returns immediately unless the character IS Eddie. This
// proof runs dimis_kickboxer (the one character with no WeaponCatalog native, so nothing gets
// skipped), so that ONE weapon cannot fire here by construction. Named, not thresholded away.
const beSilentReal = out.be.__silent.filter(k => k !== 'solo_red_thunder');
line(beSilentReal.length === 0, `no Build Engine weapon went silent (${beSilentReal.length}; solo_red_thunder is Eddie-gated and cannot fire in this harness)`);
line(out.legacy.__silent.length === 0, `no legacy weapon went silent (${out.legacy.__silent.length})`);
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,3).join(' | '):''));

console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
