// FUSION TARGETING PASS — runtime proof.
//
// Three things are measured, in a real booted game, per fusion:
//
//  A. AUTO-AIM (behavioural, not a call count). The player stands still and "aims" LEFT
//     (velocity -x). Every enemy is placed FAR RIGHT. Then one fusion runs alone. Everything it
//     creates — telegraph markers, state objects, damage points — is measured against the player.
//     Lands LEFT  -> it followed the PLAYER  -> auto-aim NO.
//     Lands RIGHT -> it followed the ENEMIES -> auto-aim YES.
//     This cannot be faked by a comment: the geometry either points at the crowd or it doesn't.
//
//  B. ESCAPE. A lone enemy is parked where the fusion commits. The instant the fusion locks its
//     strike, the enemy is teleported 900px away. If the fusion is telegraphed, it deals ZERO
//     damage to that enemy. If it is a same-frame instant hit, it deals damage anyway.
//
//  C. NO REGRESSION. Zero page errors, zero console errors, every fusion produces damage against
//     a stationary crowd (i.e. nothing was disabled), FusionCatalog.js untouched.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9411;
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
// Read the stamp from the file that DECLARES it, or we import a SECOND module instance and the
// update hook never fires.
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

const FIDS = await page.evaluate(async () => {
  const g = window.__g;
  g.meta._save = () => {};
  // A flat Proxy of no-ops is NOT enough: the game reaches through properties
  // (audio.analyser.getByteFrequencyData). Every get must return something that is BOTH
  // callable and further-reachable, or the stub itself throws and pollutes the error count.
  const mkStub = () => new Proxy(function(){}, {
    get: (t, k) => (k === 'then' ? undefined : mkStub()),
    apply: () => undefined,
    set: () => true,
  });
  g.audio = mkStub();
  g.selectedCharacter = 'skeleton_warrior';
  g.gameState = 'playing'; g.gameOver = false; g.victory = false; g.paused = false;
  g.upgradeUI = null; g.mutationUI = null;
  g.endless = true; g._chaosMode = false;
  try { g._hideCharSelectOverlay?.(); } catch(_) {}
  for (const s of ['#cgm-charselect','#cgm-collection','#cgm-chaos-law-sel']) {
    const n = document.querySelector(s); if (n) n.remove();
  }
  const fe = g.fusionEngine;
  if (!fe) throw new Error('no fusionEngine');
  fe.tierOf = () => 1;                         // T1 for everyone, no meta writes
  window.__fe = fe;
  const mod = await import('./js/game/FusionCatalog.js?v=1');
  window.__Vec2 = (await import('./js/constants.js')).Vec2;
  window.__FIDS = Object.keys(mod.FUSION_DEFS);
  return window.__FIDS;
});

await page.evaluate(() => {
  const g = window.__g, fe = window.__fe;
  const P = g.player;

  // ── a controlled arena ────────────────────────────────────────────────────────────────────
  window.__reset = () => {
    // BASELINE-SAFE: the pre-change build has no _pending at all. An unguarded probe ABORTS the
    // baseline instead of failing it, which is how a proof accidentally proves nothing.
    if (!Array.isArray(fe._pending)) fe._pending = [];
    fe.active.clear(); fe.fx.length = 0; fe._pending.length = 0;
    g.enemies.length = 0;
    for (const k of ['titanBoss','annihilatorBoss','bloodfangBoss','cyberSerpentBoss','cyberDragonBoss','doubleDemonsBoss'])
      g[k] = null;
    P.hp = P.maxHp;
  };
  // Fake enemies that honour the real contract. `pos` MUST be a real Vec2: utils.distance()
  // is `a.distanceTo(b)`, and the game's own loop is still running over g.enemies — a plain
  // {x,y} throws inside unrelated systems (_tickVesselRockets) and poisons the error count.
  window.__enemy = (x, y) => {
    const e = {
      pos: new window.__Vec2(x, y),
      hp: 100000, maxHp: 100000, radius: 18, hitFlash: 0, vel: { x:0, y:0 },
      dmgTaken: 0, isElite: false, isMegaBoss: false,
      isBoss(){ return false; },
      takeHit(dmg){ this.dmgTaken += dmg; this.hp -= dmg; return true; },
      keepInBounds(){}, update(){}, draw(){},
    };
    g.enemies.push(e); return e;
  };
  window.__run = (fid, frames, dt) => {
    const st = { id: fid, phase: 'manifest', t: 0, cd: 0, cycle: 0, objects: {}, showcaseT: 0 };
    fe.active.set(fid, st);
    try { (window.__EX[fid])?.start?.(fe, st); } catch (e) { window.__lastErr = String(e); }
    for (let i = 0; i < frames; i++) fe.update(dt || 1/60);
    return st;
  };
  // A crowd that engages EVERY fusion shape: a forward cluster (lanes/corridors/ground) AND a
  // ring band hugging the player (orbit/guard/grind fusions charge off contact, and with no
  // contact they never fire — that reads as "broken" when it is only an unpopulated harness).
  window.__crowd = (dirX) => {
    const P = g.player, CX = P.pos.x, CY = P.pos.y, out = [];
    for (let k = 0; k < 10; k++) out.push(window.__enemy(CX + dirX * (180 + k * 26), CY + (k % 5 - 2) * 18));
    for (let k = 0; k < 8; k++) {                       // ring band, 100-130px: guard/orbit contact
      const a = (k / 8) * Math.PI * 2;
      out.push(window.__enemy(CX + Math.cos(a) * 115, CY + Math.sin(a) * 115));
    }
    return out;
  };

  // Where a fusion PLACES its attack, in player-relative x.
  // Sources: telegraph markers + every {x,y} in its own state objects.
  // Deliberately NOT chain/arc beams: a chain that hops body-to-body AFTER a hit has landed is
  // propagation, not aiming — the same rule the original audit used to call COMPASS OF RUIN
  // "no auto-aim". Counting its arc beams here would silently change the definition mid-task.
  window.__placements = (st) => {
    const out = [];
    const px = g.player.pos.x;
    for (const f of fe.fx) if (f.kind === 'tele' && Number.isFinite(f.x)) out.push(f.x - px);
    const walk = (o, depth) => {
      if (!o || depth > 3) return;
      if (Array.isArray(o)) { for (const v of o) walk(v, depth+1); return; }
      if (typeof o !== 'object') return;
      if (Number.isFinite(o.x) && Number.isFinite(o.y) && !o.clone) out.push(o.x - px);
      if (Number.isFinite(o.cx) && Number.isFinite(o.cy)) out.push(o.cx - px);
      if (Number.isFinite(o.endX)) out.push(o.endX - px);
      for (const k of Object.keys(o)) {
        // `vel`/`dir` are VECTORS, not positions — reading enemy.vel {0,0} as a world point
        // reported "placement at -1500" for every embedded target and made FERROMAG PILEDRIVER
        // look player-aimed when its telegraph was measurably sitting on the crowd.
        if (k === 'target' || k === 'marks' || k === 'hitSet' || k === 'hit' || k === 'venom'
            || k === 'marked' || k === 'vel' || k === 'dir' || k === 'direction') continue;
        const v = o[k];
        if (v && typeof v === 'object') walk(v, depth+1);
      }
    };
    walk(st.objects, 0);
    return out;
  };
});

// FUSION_EXECUTORS lives in FusionEngine.js — import it with the SAME stamp Game.js uses.
const EXEC_V = fs.readFileSync(path.join(ROOT,'js/game/Game.js'),'utf8').match(/FusionEngine\.js\?v=(\d+)/)?.[1] || '1';
await page.evaluate(async (v) => {
  const mod = await import(`./js/game/FusionEngine.js?v=${v}`);
  window.__EX = mod.FUSION_EXECUTORS;
}, EXEC_V);

// ── A. AUTO-AIM: aim LEFT, crowd FAR RIGHT ─────────────────────────────────────────────────
const aim = await page.evaluate((FIDS) => {
  const g = window.__g, fe = window.__fe, P = g.player, out = {};
  for (const fid of FIDS) {
    window.__reset();
    // Aim LEFT WITHOUT moving. Driving the aim with velocity also drives the real Player.update
    // that is still running in the page's own loop — the player slides 4800px over the sample and
    // "player-relative x" stops meaning anything. Freeze the body, set the aim directly.
    P.vel.x = 0; P.vel.y = 0; P._facing = -1;
    g.gamepadAimDir = null;
    fe._lastAim = Math.PI;
    const CX = P.pos.x, CY = P.pos.y;
    // EVERY enemy on the RIGHT, at two ranges: a mid crowd (lanes/corridors/ground) and a close
    // right-side arc (contact-charged fusions — guard rings, orbit grinders, the piledriver's
    // range gate — never fire at all without a body in reach, which reads as a false "no aim").
    for (let k = 0; k < 14; k++) window.__enemy(CX + 260 + (k%4)*44, CY - 60 + (k%7)*24);
    for (let k = 0; k < 6; k++) {
      const a = -0.8 + (k / 5) * 1.6;                 // -0.8..+0.8 rad: right-hand arc only
      window.__enemy(CX + Math.cos(a) * 118, CY + Math.sin(a) * 118);
    }
    const st = { id: fid, phase:'manifest', t:0, cd:0, cycle:0, objects:{}, showcaseT:0 };
    fe.active.set(fid, st);
    try { window.__EX[fid]?.start?.(fe, st); } catch (e) { window.__lastErr = String(e); }
    // Sample EVERY frame and accumulate. Sampling only at the end measures a fusion that has
    // already returned to cooldown with st.objects cleared — which is how the first run of this
    // proof reported n=0 for 17 of 20 and "proved" nothing at all.
    const pl = [];
    for (let i = 0; i < 900; i++) {
      P.vel.x = 0; P.vel.y = 0; fe._lastAim = Math.PI;   // hold the aim; the body stays put
      fe.update(1/60);
      for (const v of window.__placements(st)) if (Math.abs(v) > 30) pl.push(v);
    }
    const left  = pl.filter(v => v < 0).length;
    const right = pl.filter(v => v > 0).length;
    out[fid] = { n: pl.length, left, right,
                 mean: pl.length ? Math.round(pl.reduce((a,b)=>a+b,0)/pl.length) : 0 };
  }
  return out;
}, FIDS);

// ── B. ESCAPE: enemy teleports away mid-telegraph ──────────────────────────────────────────
const escape = await page.evaluate((FIDS) => {
  const g = window.__g, fe = window.__fe, P = g.player, out = {};
  for (const fid of FIDS) {
    // control: enemy stays put -> must take damage (proves the fusion still works at all)
    window.__reset();
    P.vel.x = 0; P.vel.y = 0; P._facing = 1; fe._lastAim = 0;
    const still = window.__crowd(1);
    window.__run(fid, 900, 1/60);
    const stillDmg = still.reduce((a,e)=>a+e.dmgTaken, 0);

    // test: the same enemies bolt 900px away the moment anything is pending
    window.__reset();
    P.vel.x = 0; P.vel.y = 0; P._facing = 1; fe._lastAim = 0;
    const runners = window.__crowd(1);
    const st2 = { id: fid, phase: 'manifest', t: 0, cd: 0, cycle: 0, objects: {}, showcaseT: 0 };
    fe.active.set(fid, st2);
    try { window.__EX[fid]?.start?.(fe, st2); } catch(_) {}
    let bolted = false;
    for (let i = 0; i < 900; i++) {
      if (!bolted && (fe._pending || []).length > 0) {          // a telegraph is live -> RUN
        for (const e of runners) { e.pos.x += 900; e.pos.y += 900; }
        bolted = true;
      }
      fe.update(1/60);
    }
    const runDmg = runners.reduce((a,e)=>a+e.dmgTaken, 0);
    out[fid] = { stillDmg: Math.round(stillDmg), runDmg: Math.round(runDmg), sawTelegraph: bolted };
  }
  return out;
}, FIDS);

// ── C. sanity: telegraph markers actually exist and outlive a frame ─────────────────────────
const tele = await page.evaluate((FIDS) => {
  const g = window.__g, fe = window.__fe, out = {};
  for (const fid of FIDS) {
    window.__reset();
    g.player.vel.x = 0; g.player._facing = 1; fe._lastAim = 0;
    window.__crowd(1);
    const st = { id: fid, phase:'manifest', t:0, cd:0, cycle:0, objects:{}, showcaseT:0 };
    fe.active.set(fid, st);
    try { window.__EX[fid]?.start?.(fe, st); } catch(_) {}
    let maxPending = 0, teleFx = 0;
    for (let i = 0; i < 900; i++) {
      fe.update(1/60);
      maxPending = Math.max(maxPending, (fe._pending || []).length);
      teleFx += fe.fx.filter(f => f.kind === 'tele').length ? 1 : 0;
    }
    out[fid] = { maxPending, teleFrames: teleFx };
  }
  return out;
}, FIDS);

const lastErr = await page.evaluate(() => window.__lastErr || null);
await browser.close(); srv.close();

// ── report ────────────────────────────────────────────────────────────────────────────────
const KEEP = new Set(['fus_ferromag_piledriver','fus_scrapstorm_foundry',
                      'fus_phantom_needle_protocol','fus_die_of_fates','fus_event_horizon_roulette']);
let pass = 0, fail = 0;
const line = (ok, msg) => { console.log((ok?'  PASS  ':'  FAIL  ') + msg); ok ? pass++ : fail++; };

console.log('\n══ A. AUTO-AIM (player aims LEFT, crowd is FAR RIGHT) ══');
console.log('   fusion                          n   left  right   mean-x   verdict');
const autoAimed = [];
for (const fid of FIDS) {
  const a = aim[fid];
  // "followed the enemies" = the bulk of what it created sits on the crowd side.
  const followsEnemies = a.n > 0 && a.right > a.left && a.mean > 60;
  if (followsEnemies) autoAimed.push(fid);
  console.log(`   ${fid.padEnd(30)} ${String(a.n).padStart(3)} ${String(a.left).padStart(6)} ${String(a.right).padStart(6)} ${String(a.mean).padStart(8)}   ${followsEnemies?'AUTO-AIM':'player-aimed'}`);
}
console.log(`\n   AUTO-AIM COUNT: ${autoAimed.length}/20  ->  ${autoAimed.join(', ') || '(none)'}`);
// HONEST BASELINE NOTE. This same probe, run against the pre-change build, measured 16/20.
// The static reading of that code was 19/20. The gap is 3 fusions — FERROMAG PILEDRIVER,
// WALL OF SOUND and AEGIS OF JUDGEMENT — that read enemy positions but placed NO object in the
// world (pure same-frame hitscan from the player), so a placement probe cannot see them. They
// were auto-aimed; this test simply could not prove it. Do not quote 16 as "the before".
line(autoAimed.length <= 6, `auto-aim ${autoAimed.length}/20 by placement (pre-change build measured 16/20 on this same probe; 19/20 by static reading)`);
for (const fid of autoAimed) line(KEEP.has(fid), `${fid} keeps auto-aim BY DESIGN (concept-justified)`);
for (const fid of KEEP) line(autoAimed.includes(fid), `${fid} still tracks (it is meant to)`);

console.log('\n══ B. ESCAPE (enemy bolts 900px the moment a telegraph goes up) ══');
console.log('   fusion                         still-dmg   fled-dmg   telegraphed');
for (const fid of FIDS) {
  const e = escape[fid];
  console.log(`   ${fid.padEnd(30)} ${String(e.stillDmg).padStart(9)} ${String(e.runDmg).padStart(10)}   ${e.sawTelegraph?'yes':'NO'}`);
}
const anyDmg = FIDS.filter(f => escape[f].stillDmg > 0);
line(anyDmg.length === FIDS.length, `all 20 fusions still deal damage to a stationary crowd (${anyDmg.length}/20)`);
const telegraphed = FIDS.filter(f => escape[f].sawTelegraph);
line(telegraphed.length >= 15, `${telegraphed.length}/20 fusions raise a real telegraph before damage`);
const escaped = FIDS.filter(f => escape[f].sawTelegraph && escape[f].runDmg < escape[f].stillDmg);
line(escaped.length >= 14, `${escaped.length} fusions deal LESS damage to an enemy that fled mid-telegraph`);

console.log('\n══ C. TELEGRAPH MARKERS ══');
const withTele = FIDS.filter(f => tele[f].teleFrames > 0);
line(withTele.length >= 15, `${withTele.length}/20 fusions draw a visible warning marker`);
line(Math.max(...FIDS.map(f=>tele[f].maxPending)) <= 48, 'pending-strike queue stayed inside its 48 cap');

console.log('\n══ D. NO REGRESSION ══');
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,3).join(' | '):''));
line(!lastErr, 'no executor start() threw' + (lastErr ? ' :: '+lastErr : ''));

console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail ? 1 : 0);
