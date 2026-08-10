// HORIZONTAL_SLASH TACTICALS — do they draw, where, for how long, and did the damage move?
//
// tac_kinetic_wave and tac_heavy_impact_burst ship a 400x60 damage box and, before this change,
// no draw case at all: they hit for 85 every 1.0s while being completely invisible.
//
// This proof answers five separate questions per weapon, and each can fail on its own:
//   1. SPAWN      — the weapon actually enters tacticalCacheWeapons and lives.
//   2. VISIBLE    — _drawTacticalWeapons paints primitives for it (counted through canvas hooks).
//   3. POSITION   — every painted primitive sits inside the weapon's own hitbox footprint,
//                   mapped through the camera. The camera is shoved far from (0,0) first so a
//                   coordinate-space mistake cannot hide.
//   4. LIFETIME   — painting stops when w.timer runs out, at the def's own duration, not before
//                   and not after.
//   5. DAMAGE     — total damage dealt to a fixed ring of dummies over a fixed window. Run this
//                   file on the pre-change build and on the post-change build: the numbers must
//                   match. That is the check that the draw did not touch gameplay.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9550;
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

const IDS = ['tac_kinetic_wave','tac_heavy_impact_burst'];
// The chakram fusion is the third horizontal_slash weapon and already had a draw. It is measured
// too, purely as a CONTROL: it must be unchanged by this work.
const CONTROL = 'fusion_chakram_kinetic';

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
// Hook every primitive a procedural draw can use. An image-only or arc-only hook would report
// "invisible" for a draw made of rects and strokes, which is exactly what this weapon uses.
await page.addInitScript(() => {
  window.__hs = [];
  window.__hsOn = false;
  const P = CanvasRenderingContext2D.prototype;
  const push = (ctx, x, y) => {
    const t = ctx.getTransform();
    window.__hs.push({ x: t.a*x + t.c*y + t.e, y: t.b*x + t.d*y + t.f });
  };
  const wrap = (name, pick) => {
    const o = P[name];
    P[name] = function (...a) {
      try { if (window.__hsOn) for (const pt of pick(a)) push(this, pt[0], pt[1]); } catch (_) {}
      return o.apply(this, a);
    };
  };
  wrap('fillRect',   a => [[a[0]+a[2]/2, a[1]+a[3]/2]]);
  wrap('strokeRect', a => [[a[0]+a[2]/2, a[1]+a[3]/2]]);
  wrap('arc',        a => [[a[0], a[1]]]);
  wrap('moveTo',     a => [[a[0], a[1]]]);
  wrap('lineTo',     a => [[a[0], a[1]]]);
  wrap('rect',       a => [[a[0]+a[2]/2, a[1]+a[3]/2]]);
  const oDraw = P.drawImage;
  P.drawImage = function (img, ...r) {
    try {
      if (window.__hsOn) {
        let dx,dy,dw,dh;
        if (r.length >= 8) { dx=r[4]; dy=r[5]; dw=r[6]; dh=r[7]; } else { dx=r[0]; dy=r[1]; dw=r[2]||0; dh=r[3]||0; }
        push(this, dx+dw/2, dy+dh/2);
      }
    } catch (_) {}
    return oDraw.apply(this, [img, ...r]);
  };
});
await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#cgm-overlay',{timeout:20000});
await page.waitForTimeout(1400);
await page.evaluate(async (v)=>{
  const mod=await import(`./js/game/Game.js?v=${v}`);
  await new Promise(res=>{const o=mod.Game.prototype.update;
    mod.Game.prototype.update=function(...a){window.__g=this;mod.Game.prototype.update=o;res();return o.apply(this,a);};});
},GAME_V);

await page.evaluate(() => {
  const g = window.__g;
  g.meta._save = () => {};
  const mkStub = () => new Proxy(function(){}, { get:(t,k)=> k==='then'?undefined:mkStub(), apply:()=>undefined, set:()=>true });
  g.audio = mkStub();

  // Only count primitives painted by the tactical pass — the map, entities and HUD paint
  // thousands of rects per frame and would drown the signal.
  window.__seg = [];
  const proto = Object.getPrototypeOf(g);
  const orig = proto._drawTacticalWeapons;
  proto._drawTacticalWeapons = function (ctx) {
    if (!window.__hsOn) return orig.call(this, ctx);
    const vs = this._viewScale || 1;
    const live = this.tacticalCacheWeapons.filter(w => w.alive);
    // Drop the hit-spark particles before the pass runs. They are decoration spawned at ENEMY
    // positions by _spawnTacParticles and drawn by the generic particle loop inside this same
    // function, so without this every weapon looks "visible" the moment it damages anything —
    // on the pre-change build tac_kinetic_wave scored 232 primitives while having no draw case
    // at all. With them gone, every primitive counted below is the weapon's own body.
    for (const w of live) if (w.particles) w.particles.length = 0;
    const before = window.__hs.length;
    const r = orig.call(this, ctx);
    const drawn = window.__hs.slice(before);
    if (drawn.length) {
      // Footprint of each live weapon, in screen px: its own hitbox plus a modest allowance for
      // the sweep overshoot and the glow. Anything outside every footprint is mispositioned.
      const boxes = live.map(w => {
        const hw = ((w.def.slashWidth  || 400) / 2 + 90) * vs;
        const hh = ((w.def.slashHeight || 60)  / 2 + 90) * vs;
        return { cx: (w.x - this.camera.x) * vs, cy: (w.y - this.camera.y) * vs, hw, hh };
      });
      let inside = 0, worst = 0;
      for (const d of drawn) {
        let best = Infinity;
        for (const b of boxes) {
          const ox = Math.max(0, Math.abs(d.x - b.cx) - b.hw);
          const oy = Math.max(0, Math.abs(d.y - b.cy) - b.hh);
          best = Math.min(best, Math.hypot(ox, oy));
        }
        if (best <= 1) inside++; else worst = Math.max(worst, best);
      }
      window.__seg.push({ n: drawn.length, inside, worst: Math.round(worst), live: live.length });
    } else {
      window.__seg.push({ n: 0, inside: 0, worst: 0, live: live.length });
    }
    return r;
  };

  // Fence around the tactical's own damage, and a strike counter, so the damage figure is
  // attributable and build-comparable.
  window.__inSlash = false;
  window.__strikes = 0;
  const origSlash = proto._tickSlash;
  proto._tickSlash = function (w, dt) {
    const before = (window.__dummyRefs || []).reduce((a,e)=>a+(e.taken||0), 0);
    window.__inSlash = true;
    try { return origSlash.call(this, w, dt); }
    finally {
      window.__inSlash = false;
      if ((window.__dummyRefs || []).reduce((a,e)=>a+(e.taken||0), 0) > before) window.__strikes++;
    }
  };

  window.__start = () => {
    g.selectedCharacter = 'taekwondo_girl';
    g.endless = true; g._chaosMode = false;
    try { g.reset(); } catch(_) {}
    try { g._enterEndless?.(); } catch(_) {}
    g.gameState='playing'; g.gameOver=false; g.victory=false; g.paused=false;
    g.upgradeUI=null; g.mutationUI=null;
    // The run lasts ~45s of real time across three weapons. Without this the player dies partway,
    // _updateTacticalWeapons early-returns on gameOver, w.timer stops decrementing, and the
    // weapons appear to live forever and deal nothing — which reads exactly like a broken build.
    g.player.hp = 1e9; g.player.maxHp = 1e9;
    g.player.takeDamage = () => {};
    g.player.takeHit = () => {};
    g.tacticalCacheWeapons.length = 0;
    // Camera far from the world origin, so a coordinate-space error cannot land correctly by luck.
    const p = g.player; p.pos.x = 2200; p.pos.y = 1250;
    for (let i = 0; i < 4; i++) { try { g.update(1/60, { keys:new Set(), mousePos:{x:0,y:0}, mouseDown:false }); } catch(_) {} }
    return { camx: Math.round(g.camera.x), camy: Math.round(g.camera.y) };
  };

  // A fixed, reproducible ring of dummies straddling the 400x60 box: some inside, some outside.
  // Identical for every run, so the damage total is comparable between builds.
  window.__dummies = (wx, wy) => {
    const V = g.player.pos.constructor;
    g.enemies.length = 0;
    const spots = [[0,0],[120,0],[-120,0],[180,20],[-180,-20],[260,0],[-260,0],
                   [0,50],[0,-50],[120,25],[-120,-25],[300,0],[-300,0],[0,120],[0,-120]];
    for (const [dx,dy] of spots) {
      // isBoss is a METHOD on the real Enemy (entities/Enemy.js:753) and _updateEnemies calls it
      // every frame. A plain `isBoss: false` throws inside the game loop, main.js wraps update
      // and draw in one try, and the whole frame — including every tactical draw — is skipped.
      // That first read as "all three weapons are invisible", which was my harness, not the game.
      const e = {
        pos: new V(wx+dx, wy+dy), vel: new V(0,0), hp: 1e9, maxHp: 1e9, radius: 18,
        dead: false, taken: 0, isMegaBoss: false, isElite: false,
        isBoss: () => false,
        // Only damage dealt from INSIDE _tickSlash counts. The player's own auto-weapons also
        // hit these dummies, and their contribution is random per run — comparing raw totals
        // across two builds would have compared noise. Gated this way the figure is exact:
        // 7 of the 15 dummies sit inside the 400x60 box, so a strike is always 7 x 85 = 595.
        takeHit(d) { if (window.__inSlash) this.taken += (typeof d === 'number' ? d : 0); },
        takeDamage(d) { if (window.__inSlash) this.taken += (typeof d === 'number' ? d : 0); },
        keepInBounds() {}, update() {}, draw() {},
      };
      g.enemies.push(e);
    }
    // The spatial grid is frozen during a synchronous evaluate; a stub that returns the live list
    // keeps every query path working (a null grid silences whole weapon families).
    g.spatialGrid = { getNearby: () => g.enemies, insert(){}, clear(){}, query: () => g.enemies };
    window.__dummyRefs = g.enemies.slice();
    return g.enemies.length;
  };
  // The run is long enough that the player LEVELS UP, and _updateTacticalWeapons early-returns
  // whenever upgradeUI/mutationUI is open or the game is paused. That silently froze the middle
  // weapon of the three: 0 damage, 0 draws, timer never decrementing — indistinguishable from a
  // weapon I had broken. Held open here rather than in the draw path so nothing is mutated
  // mid-frame.
  setInterval(() => {
    if (g.gameState !== 'playing') return;
    g.upgradeUI = null; g.mutationUI = null;
    g.paused = false; g.gameOver = false; g.victory = false;
    if (g.player) g.player.hp = 1e9;
    // Headless renders a full endless horde at ~6fps, and the loop clamps dt, so game time runs
    // at ~0.2x wall time and an 11s weapon appears never to expire. Capping the horde restores a
    // normal frame rate; the dummies were pushed first, so this only trims spawned enemies.
    if (g.enemies.length > 24) g.enemies.length = 24;
    // Re-seat any dummy the horde cap or a cull removed. Without this the number of dummies
    // standing inside the 400x60 box drifts run to run and the damage figure is not comparable;
    // with it, a strike is always the same 7 bodies.
    const refs = window.__dummyRefs;
    if (refs) for (const d of refs) if (!g.enemies.includes(d)) g.enemies.push(d);
  }, 40);
  window.__damage = () => (window.__dummyRefs || g.enemies).reduce((a,e)=>a+(e.taken||0), 0);
  window.__resetDmg = () => { for (const e of (window.__dummyRefs||[])) e.taken = 0; window.__strikes = 0; };
  window.__drop = (id, wx, wy) => { try { g._spawnTacticalWeapon(id, wx, wy); } catch (e) { return String(e); } return null; };
  window.__live = (id) => g.tacticalCacheWeapons.filter(w => w.alive && w.id === id).length;
  window.__timer = (id) => { const w = g.tacticalCacheWeapons.find(w => w.alive && w.id === id); return w ? w.timer : -1; };
  window.__dur = (id) => { const w = g.tacticalCacheWeapons.find(w => w.id === id); return w ? (w.def.duration || 0) : 0; };
});

const cam = await page.evaluate(()=>window.__start());
const out = {};
for (const id of [...IDS, CONTROL]) {
  const drop = await page.evaluate(({i}) => {
    const g = window.__g;
    g.gameState='playing'; g.gameOver=false; g.victory=false; g.paused=false;
    g.upgradeUI=null; g.mutationUI=null;
    g.player.hp = 1e9;
    g.tacticalCacheWeapons.length = 0;
    const wx = g.player.pos.x + 60, wy = g.player.pos.y + 40;
    window.__dummies(wx, wy);
    const err = window.__drop(i, wx, wy);
    window.__resetDmg();
    return { err, wx: Math.round(wx), wy: Math.round(wy), live: window.__live(i), dur: window.__dur(i), t0: g.timeAlive };
  }, {i:id});

  await page.evaluate(()=>{ window.__hs.length=0; window.__seg=[]; window.__hsOn = true; });
  await page.waitForTimeout(3000);                       // 3 strike cycles at tickRate 1.0
  const mid = await page.evaluate((i)=>{
    window.__hsOn = false;
    const segs = window.__seg; window.__seg = [];
    const frames = segs.length;
    const painted = segs.filter(s => s.n > 0).length;
    const total = segs.reduce((a,s)=>a+s.n, 0);
    const badly = segs.reduce((a,s)=>a+(s.n - s.inside), 0);
    const worst = segs.reduce((a,s)=>Math.max(a,s.worst), 0);
    return { frames, painted, total, badly, worst, dmg3s: window.__damage(), strikes3s: window.__strikes, timer: Math.round(window.__timer(i)*10)/10 };
  }, id);

  // Let the weapon expire. Polled on the GAME clock, not the wall clock: headless game time runs
  // slower than real time, so a fixed sleep would report "never expires" on a correct build.
  let goneAt = null;
  for (let i = 0; i < 90 && goneAt === null; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate((x)=>({ live: window.__live(x), t: window.__g.timeAlive }), id);
    if (st.live === 0) goneAt = st.t;
  }
  await page.evaluate(()=>{ window.__hs.length=0; window.__seg=[]; window.__hsOn = true; });
  await page.waitForTimeout(700);
  const after = await page.evaluate((i)=>{
    window.__hsOn = false;
    const segs = window.__seg; window.__seg = [];
    return { postTotal: segs.reduce((a,s)=>a+s.n, 0), postLive: window.__live(i), dmgEnd: window.__damage(), strikesEnd: window.__strikes };
  }, id);
  const lived = goneAt === null ? null : Math.round((goneAt - drop.t0) * 100) / 100;
  after.lived = lived;

  out[id] = { ...drop, ...mid, ...after };
}
await browser.close(); srv.close();

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
console.log(`\n══ HORIZONTAL_SLASH TACTICALS   (camera at ${cam.camx},${cam.camy}) ══\n`);
for (const id of [...IDS, CONTROL]) {
  const r = out[id];
  console.log(`   ${id}${id===CONTROL?'   [CONTROL — already had a draw]':''}`);
  console.log(`      dropped at world ${r.wx},${r.wy}   live=${r.live}   duration=${r.dur}s   err=${r.err||'none'}`);
  console.log(`      3s sample: ${r.frames} draw passes, ${r.painted} painted, ${r.total} primitives, ` +
              `${r.badly} outside the hitbox footprint (worst ${r.worst}px)`);
  console.log(`      tactical-only damage: ${r.dmg3s} over ${r.strikes3s} strikes in the 3s window; ${r.dmgEnd} over ${r.strikesEnd} strikes across the whole lifetime`);
  console.log(`      lifetime: def says ${r.dur}s, measured ${r.lived === null ? 'NEVER EXPIRED' : r.lived + 's'} of game time; after expiry live=${r.postLive}, primitives=${r.postTotal}`);
}
console.log('');
for (const id of IDS) {
  const r = out[id];
  line(r.live === 1 && !r.err, `${id}: spawns and lives`);
  line(r.painted > 0 && r.total > 0, `${id}: VISIBLE — painted ${r.total} primitives across ${r.painted} frames`);
  line(r.badly === 0, `${id}: every primitive sits on its own hitbox footprint (${r.badly} outside, worst ${r.worst}px)`);
  line(r.postLive === 0 && r.postTotal === 0 && r.lived !== null && Math.abs(r.lived - r.dur) <= 0.6,
       `${id}: expires on its own ${r.dur}s lifetime — measured ${r.lived === null ? 'NEVER' : r.lived + 's'}, live after=${r.postLive}, primitives after=${r.postTotal}`);
}
const ctl = out[CONTROL];
line(ctl.total > 0, `${CONTROL} (control) still draws — ${ctl.total} primitives`);
console.log('\n   DAMAGE PER STRIKE — the build-invariant figure; must be identical pre- and post-change:');
for (const id of [...IDS, CONTROL]) {
  const r = out[id];
  const per = r.strikesEnd ? Math.round(r.dmgEnd / r.strikesEnd * 100) / 100 : 0;
  console.log(`      ${id.padEnd(24)} ${String(r.dmgEnd).padStart(7)} over ${String(r.strikesEnd).padStart(3)} strikes = ${per} per strike`);
}
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
