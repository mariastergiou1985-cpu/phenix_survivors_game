// TACTICAL WEAPONS COORDINATE SPACE.
//
// Every tactical weapon knows the world point it was dropped at (w.x / w.y), and its tick
// functions resolve damage against enemy WORLD positions (_tickTotem: `e.pos.x - w.x`). So the
// one correct on-screen answer is (w.x - camera.x) * viewScale.
//
// The proof wraps _drawTacticalWeapons, snapshots each live weapon's expected screen point right
// before it draws, and lets a drawImage/arc hook record where the art ACTUALLY landed with the
// full live transform applied. Expected and actual come from the same frame and the same camera.
//
// The camera is deliberately pushed far from (0,0) first: with camera ~ 0 a double subtraction is
// invisible, so a probe that never moves would pass on the broken build.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9520;
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

// Every tactical id, so no behaviour branch goes unmeasured.
const TACS = ['tac_lightning_totem','tac_shard_nova','tac_void_turret','tac_kinetic_wave',
              'tac_heavy_impact_burst','tac_hunter_sentry','tac_proximity_grid','tac_gravity_well',
              'tac_rail_strike','tac_emp_jammer','tac_system_reboot','tac_overclock',
              'tac_firewall_matrix','tac_piston_rampart','tac_scrap_coil','tac_quake_pylon',
              'tac_umbral_snare','tac_phase_beacon','tac_axiom_compass','tac_ember_shrine',
              'tac_missile_barrage','eddie_chord_curtain','eddie_double_swords',
              'fusion_chakram_kinetic','fusion_overdrive_void','fusion_toxic_inferno','fusion_impact_storm'];

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
// Hook BOTH drawImage and arc(): several tactical behaviours are pure vector (rings, beams,
// totem pulses) and would be invisible to an image-only probe.
await page.addInitScript(() => {
  window.__tw = [];
  window.__twOn = false;
  const P = CanvasRenderingContext2D.prototype;
  const oDraw = P.drawImage, oArc = P.arc;
  const rec = function (ctx, x, y, size) {
    const t = ctx.getTransform();
    window.__tw.push({ x: t.a*x + t.c*y + t.e, y: t.b*x + t.d*y + t.f,
                       s: Math.hypot(t.a, t.b) * (size || 0) });
  };
  P.drawImage = function (img, ...rest) {
    try {
      if (window.__twOn) {
        let dx, dy, dw, dh;
        if (rest.length >= 8) { dx=rest[4]; dy=rest[5]; dw=rest[6]; dh=rest[7]; }
        else { dx=rest[0]; dy=rest[1]; dw=rest[2]||0; dh=rest[3]||0; }
        rec(this, dx + dw/2, dy + dh/2, dw);
      }
    } catch (_) {}
    return oDraw.apply(this, [img, ...rest]);
  };
  P.arc = function (x, y, r, ...rest) {
    try { if (window.__twOn) rec(this, x, y, r * 2); } catch (_) {}
    return oArc.apply(this, [x, y, r, ...rest]);
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
  window.__res = [];
  const proto = Object.getPrototypeOf(g);
  const orig = proto._drawTacticalWeapons;
  proto._drawTacticalWeapons = function (ctx) {
    if (!window.__twOn) return orig.call(this, ctx);
    const vs = this._viewScale || 1;
    // Where the drop point of each live weapon MUST map to.
    const expect = this.tacticalCacheWeapons.filter(w => w.alive)
      .map(w => ({ x: (w.x - this.camera.x) * vs, y: (w.y - this.camera.y) * vs }));
    const before = window.__tw.length;
    const r = orig.call(this, ctx);
    const drawn = window.__tw.slice(before);
    // Each weapon paints many primitives spread around its drop point, so the honest test is:
    // is every painted primitive within a sane radius of SOME live weapon's true screen point?
    // A double camera transform moves the whole cluster hundreds of px away from all of them.
    for (const d of drawn) {
      let best = Infinity;
      for (const e of expect) best = Math.min(best, Math.hypot(d.x - e.x, d.y - e.y));
      // Also record whether it landed inside the canvas — the criterion for the one weapon whose
      // art is a full-screen curtain rather than a cluster at its drop point. X and Y are kept
      // SEPARATE on purpose: the curtain legitimately starts above the top edge and slides down
      // (offY is expected and is reported as data), whereas nothing may ever leave the view
      // HORIZONTALLY — that is precisely what a doubled camera.x of 1423px would do.
      const CW = this._canvas ? this._canvas.width  : 1440;
      const CH = this._canvas ? this._canvas.height : 900;
      const offX = (d.x < -260 || d.x > CW + 260) ? 1 : 0;
      const offY = (d.y < -260 || d.y > CH + 260) ? 1 : 0;
      if (best < Infinity) window.__res.push({ d: best, s: d.s, offX, offY });
    }
    return r;
  };
  window.__start = (mode) => {
    g.selectedCharacter = 'skeleton_warrior';
    g.endless = (mode !== 'act1'); g._chaosMode = (mode === 'chaos');
    try { g.reset(); } catch(_) {}
    if (mode === 'endless')    { try { g._enterEndless?.(); } catch(_) {} }
    else if (mode === 'chaos') { g.runChaosLaw = null; try { g._beginChaosRun?.(); } catch(_) {} }
    g.gameState='playing'; g.gameOver=false; g.victory=false; g.paused=false;
    g.upgradeUI=null; g.mutationUI=null;
    g.tacticalCacheWeapons.length = 0;
    window.__tw.length = 0; window.__res = [];
  };
  // Camera FAR from the world origin — this is what makes the old bug visible.
  window.__shove = () => {
    const p = g.player;
    p.pos.x = 2200; p.pos.y = 1250;
    for (let i = 0; i < 4; i++) { try { g.update(1/60, { keys:new Set(), mousePos:{x:0,y:0}, mouseDown:false }); } catch(_) {} }
    return { camx: Math.round(g.camera.x), camy: Math.round(g.camera.y) };
  };
  window.__drop = (id) => {
    const p = g.player;
    // Drop it AT the player, which is now far from the origin.
    try { g._spawnTacticalWeapon(id, p.pos.x + 60, p.pos.y + 40); } catch (e) { return String(e); }
    return null;
  };
});

const MODES = ['act1','endless','chaos'];
const out = {};
let camInfo = null;
for (const mode of MODES) {
  out[mode] = {};
  await page.evaluate((m)=>window.__start(m), mode);
  await page.waitForTimeout(350);
  camInfo = await page.evaluate(()=>window.__shove());
  for (const id of TACS) {
    const err = await page.evaluate((i)=>window.__drop(i), id);
    await page.evaluate(()=>{ window.__tw.length=0; window.__res=[]; window.__twOn = true; });
    await page.waitForTimeout(900);
    out[mode][id] = await page.evaluate(()=>{
      window.__twOn = false;
      const r = window.__res; window.__res = [];
      if (!r.length) return { n: 0 };
      let max = 0, sum = 0, offX = 0, offY = 0;
      for (const h of r) { max = Math.max(max, h.d); sum += h.d; offX += h.offX; offY += h.offY; }
      return { n: r.length, max: Math.round(max), avg: Math.round(sum / r.length), offX, offY };
    });
    if (err) out[mode][id].err = err;
    await page.evaluate(()=>{ window.__g.tacticalCacheWeapons.length = 0; });
  }
}
await browser.close(); srv.close();

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
// Tactical art legitimately spreads around its drop point — beams run 700px, shockwave rings
// expand to 280, the chakram orbit reaches 250. 760 covers every shipped spread and is still far
// below the ~2x camera offset a double transform produces at this distance from the origin.
const TOL = 760;
// EDDIE CHORD CURTAIN is measured differently, and this is a real property of the weapon rather
// than a loosened threshold: _tickChordRain spawns each fragment at
//     camera.x + randomRange(-200, viewW + 200)
// i.e. deliberately spread across the ENTIRE visible view ("curtain rain across the whole view").
// Distance from the drop point is therefore meaningless for it — up to ~1900px is correct. The
// criterion that does hold, and that a double transform cannot survive, is HORIZONTAL containment:
// the sheet and its rain must stay inside the viewport left-to-right. With the camera at x=1423 a
// doubled subtraction shifts the whole curtain ~1067 screen px to the left, which offX catches.
// Vertical excursions are NOT counted against it: the slogan sheet is written to slide in from
// above the top edge, so offY is expected during the drop-in and is printed as data instead.
const CURTAIN = 'eddie_chord_curtain';
console.log(`\n══ TACTICAL DRAWS vs THEIR OWN DROP POINT   (camera at ${camInfo?camInfo.camx:'?'},${camInfo?camInfo.camy:'?'}) ══`);
console.log('   err = |painted primitive - nearest live weapon drop point on screen|\n');
console.log('   tactical                     act1        endless      chaos       worst');
let worst = 0, sampled = 0, offenders = [], hOffenders = [], curtainOffY = 0;
for (const id of TACS) {
  const cells = MODES.map(m => out[m][id]);
  const w = Math.max(...cells.map(c => c.n ? c.max : 0));
  if (cells.some(c => c.n)) sampled++;
  if (id !== CURTAIN && w > worst) worst = w;
  const offX = cells.reduce((a,c)=>a + (c.offX||0), 0);
  const offY = cells.reduce((a,c)=>a + (c.offY||0), 0);
  if (offX > 0) hOffenders.push(`${id} (${offX})`);
  if (id === CURTAIN) curtainOffY = offY;
  const bad = (id === CURTAIN) ? (offX > 0) : (w > TOL);
  if (bad) offenders.push(id === CURTAIN ? `${id} (horizontally off-view: ${offX})` : id);
  const fmt = (c) => c.n ? `${String(c.max).padStart(5)}px/${String(c.n).padStart(4)}` : '     —     ';
  console.log(`   ${id.padEnd(26)} ${fmt(cells[0])}  ${fmt(cells[1])}  ${fmt(cells[2])}  ${String(w).padStart(5)}${bad?'  *** OFF ***':''}`);
}
console.log('');
// tac_kinetic_wave and tac_heavy_impact_burst are INVISIBLE TO THIS PROBE, which is not the same
// as invisible in the game. This file hooks drawImage and arc only, and their draw is built from
// strokeRect / fillRect / moveTo+lineTo — no image and no arc anywhere in it. Their visibility and
// position are covered by tools/qa/browser/horizontal_slash_draw_proof.mjs, which hooks every
// primitive and measures against the weapon's own hitbox footprint.
// fusion_overdrive_void ('homing_volley') can also read as silent here: its missiles only exist
// after a salvo timer longer than this sample window.
// Named rather than hidden by a lowered threshold.
const SILENT_BY_DESIGN = ['tac_kinetic_wave','tac_heavy_impact_burst'];
const measuredSilent = TACS.filter(id => !MODES.some(m => out[m][id].n));
const unexpectedSilent = measuredSilent.filter(id => !SILENT_BY_DESIGN.includes(id));
line(unexpectedSilent.length === 0, `every tactical that draws at all was sampled (${sampled}/${TACS.length}; no drawImage/arc primitives (see the note above): ${measuredSilent.join(', ') || 'none'})` + (unexpectedSilent.length?` UNEXPECTED: ${unexpectedSilent.join(', ')}`:''));
line(offenders.length === 0, `every tactical draw lands within ${TOL}px of its own drop point (off: ${offenders.join(', ') || 'none'})`);
console.log(`   worst positional error observed (excluding the full-screen curtain): ${worst}px`);
line(hOffenders.length === 0, `no tactical primitive is pushed horizontally out of the viewport (off: ${hOffenders.join(', ') || 'none'})`);
console.log(`   curtain frames starting above the top edge (expected — it slides in): ${curtainOffY}`);
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
