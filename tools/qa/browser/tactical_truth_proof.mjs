// TACTICAL TRUTH — four weapons whose NAME promised a mechanic the code never contained.
// Each check measures the named mechanic directly, and each one FAILS on the pre-change build:
//   Scrap Magnet Coil     -> enemies must MOVE toward the coil (it never pulled anything)
//   Phase Beacon          -> it must occupy TWO distinct positions over time (it never moved)
//   EMP Jammer            -> caught enemies must end up STUNNED (nothing ever scrambled)
//   Chakram Kinetic Storm -> discs must ORBIT and hit outside the old 400x60 box (no disc existed)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9470;
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

await page.evaluate(async () => {
  const g = window.__g;
  g.meta._save = () => {};
  const mkStub = () => new Proxy(function(){}, { get:(t,k)=> k==='then'?undefined:mkStub(), apply:()=>undefined, set:()=>true });
  g.audio = mkStub();
  g.gameState='playing'; g.gameOver=false; g.victory=false; g.paused=false;
  g.upgradeUI=null; g.mutationUI=null; g.endless=true; g._chaosMode=false;
  try { g._hideCharSelectOverlay?.(); } catch(_) {}
  for (const s of ['#cgm-charselect','#cgm-collection','#cgm-chaos-law-sel']) { const n=document.querySelector(s); if(n) n.remove(); }
  const Vec2 = (await import('./js/constants.js')).Vec2;
  window.__mkE = (x,y) => {
    const e = { pos: new Vec2(x,y), hp: 1e7, maxHp: 1e7, radius: 18, hitFlash: 0, vel:{x:0,y:0},
      dmgTaken: 0, stunned: 0, isElite:false, isMegaBoss:false,
      isBoss(){return false;}, takeHit(d){ this.dmgTaken += d; this.hp -= d; return true; },
      keepInBounds(){}, update(){}, draw(){} };
    g.enemies.push(e); return e;
  };
  window.__setup = () => {
    g.enemies.length = 0;
    g.tacticalCacheWeapons.length = 0;
    g._spatialGrid = { query: () => g.enemies, insert(){}, clear(){}, rebuild(){} };
  };
});

const R = await page.evaluate(() => {
  const g = window.__g, P = g.player, out = {};
  const CX = P.pos.x + 600, CY = P.pos.y + 600;      // away from the player, tacticals are map objects

  // ── 1. SCRAP MAGNET COIL: do enemies actually move toward it? ──────────────────────────
  window.__setup();
  const coilE = [];
  for (let k=0;k<6;k++) coilE.push(window.__mkE(CX + 150 + k*8, CY + (k-3)*14));
  const d0 = coilE.map(e => Math.hypot(e.pos.x-CX, e.pos.y-CY));
  g._spawnTacticalWeapon('tac_scrap_coil', CX, CY);
  for (let i=0;i<180;i++) g._tickTacticalWeapons(1/60);
  const d1 = coilE.map(e => Math.hypot(e.pos.x-CX, e.pos.y-CY));
  out.coil = { moved: Math.round(d0.reduce((a,b,i)=>a+(b-d1[i]),0)), dmg: Math.round(coilE.reduce((a,e)=>a+e.dmgTaken,0)) };

  // ── 2. PHASE BEACON: does it occupy more than one position? ───────────────────────────
  window.__setup();
  for (let k=0;k<6;k++) window.__mkE(CX + 60 + k*10, CY);
  g._spawnTacticalWeapon('tac_phase_beacon', CX, CY);
  const w2 = g.tacticalCacheWeapons[0];
  const seen = new Set();
  for (let i=0;i<420;i++) {
    g._tickTacticalWeapons(1/60);
    if (w2.bx !== undefined) seen.add(Math.round(w2.bx) + ',' + Math.round(w2.by));
  }
  out.beacon = { positions: seen.size, anchorLocked: w2.x === CX && w2.y === CY,
                 dmg: Math.round(g.enemies.reduce((a,e)=>a+e.dmgTaken,0)) };

  // ── 3. EMP JAMMER: does anything actually get scrambled? ──────────────────────────────
  window.__setup();
  const empE = [];
  for (let k=0;k<10;k++) empE.push(window.__mkE(CX + 40 + k*22, CY + (k%3-1)*18));
  g._spawnTacticalWeapon('tac_emp_jammer', CX, CY);
  let maxStun = 0, everStunned = 0;
  for (let i=0;i<420;i++) {
    g._tickTacticalWeapons(1/60);
    for (const e of empE) { if (e.stunned > 0) { maxStun = Math.max(maxStun, e.stunned); e._sawStun = 1; } }
  }
  everStunned = empE.filter(e => e._sawStun).length;
  out.emp = { stunnedCount: everStunned, maxStun: +maxStun.toFixed(2),
              dmg: Math.round(empE.reduce((a,e)=>a+e.dmgTaken,0)) };

  // ── 4. CHAKRAM KINETIC STORM: do discs exist, rotate, and reach outside the old box? ──
  // The old behaviour was a 400x60 box: |dx|<=200 AND |dy|<=30. An enemy at dy=140 could NEVER
  // be hit by it. If that enemy takes damage now, a disc genuinely travelled there.
  window.__setup();
  const outsideBox = window.__mkE(CX, CY + 140);
  const insideBox  = window.__mkE(CX + 100, CY);
  g._spawnTacticalWeapon('fusion_chakram_kinetic', CX, CY);
  const w4 = g.tacticalCacheWeapons[0];
  const angles = new Set();
  for (let i=0;i<420;i++) {
    g._tickTacticalWeapons(1/60);
    if (w4.chakrams) for (const c of w4.chakrams) angles.add(Math.round(c.a * 4));
  }
  out.chakram = { discs: w4.chakrams ? w4.chakrams.length : 0,
                  distinctAngles: angles.size,
                  outsideBoxDmg: Math.round(outsideBox.dmgTaken),
                  insideBoxDmg: Math.round(insideBox.dmgTaken) };
  return out;
});
await browser.close(); srv.close();

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
console.log('\n══ TACTICAL TRUTH ══');
console.log(JSON.stringify(R,null,1));
console.log('');
line(R.coil.moved > 60,        `SCRAP MAGNET COIL actually pulls — enemies closed ${R.coil.moved}px toward the coil`);
line(R.coil.dmg > 0,           `  ...and still deals damage (${R.coil.dmg})`);
line(R.beacon.positions >= 2,  `PHASE BEACON actually blinks — occupied ${R.beacon.positions} distinct positions`);
line(R.beacon.anchorLocked,    `  ...and its DROP COORDS stayed locked (documented invariant held)`);
line(R.beacon.dmg > 0,         `  ...and still deals damage (${R.beacon.dmg})`);
line(R.emp.stunnedCount >= 5,  `EMP JAMMER actually scrambles — ${R.emp.stunnedCount}/10 enemies were stunned`);
line(R.emp.maxStun > 0 && R.emp.maxStun <= 1.05, `  ...tiered, not a permanent lock (peak ${R.emp.maxStun}s)`);
line(R.emp.dmg > 0,            `  ...and still deals damage (${R.emp.dmg})`);
line(R.chakram.discs === 3,    `CHAKRAM STORM has real discs (${R.chakram.discs})`);
line(R.chakram.distinctAngles > 20, `  ...that actually rotate (${R.chakram.distinctAngles} distinct angles)`);
line(R.chakram.outsideBoxDmg > 0,   `  ...reaching OUTSIDE the old 400x60 box (dy=140 took ${R.chakram.outsideBoxDmg})`);
line(R.chakram.insideBoxDmg > 0,    `  ...and still covering the old area (${R.chakram.insideBoxDmg})`);
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
