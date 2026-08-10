// ACT 1 SHIP WINDOWS — is there actually any MOTION out there, measured on real pixels?
//
// A code audit can only say "no function draws stars". That is not the question asked. This reads
// the live canvas: it enters a classic Act 1 run, parks the player so the camera cannot move, and
// samples the same rectangles repeatedly, comparing consecutive frames pixel by pixel.
//
//   WINDOW-TOP / WINDOW-BOTTOM / WINDOW-LEFT — the glazed bands of the ship art, outside the
//       walkable deck rect published by MapManager.getAct1DeckBounds(). If space out there moves,
//       these change between frames.
//   DECK (control) — a rectangle over the player. The map under the player is a static PNG, so on
//       a build with no window motion this control reads ~0 and the whole background layer is
//       confirmed still. A SECOND control, taken from the full composited frame, proves the
//       sampler can see motion at all. Without both, "nothing moves" would be unfalsifiable.
//
// The sample is taken from inside _drawWorldBackground, the instant the background layer has
// finished painting and before a single entity, projectile or VFX is drawn. An earlier version
// sampled the finished frame and reported the top window band "moving" at 3.698 — that was the
// player's own auto-weapons firing upward across the glass, not space. Measuring the layer under
// test directly removes the whole class of that mistake.
//
// Enemies are cleared throughout as a second line of defence.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9560;
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
await page.waitForTimeout(1500);
await page.evaluate(async (v)=>{
  const mod=await import(`./js/game/Game.js?v=${v}`);
  await new Promise(res=>{const o=mod.Game.prototype.update;
    mod.Game.prototype.update=function(...a){window.__g=this;mod.Game.prototype.update=o;res();return o.apply(this,a);};});
},GAME_V);

const setup = await page.evaluate(async () => {
  const g = window.__g;
  g.meta._save = () => {};
  const mkStub = () => new Proxy(function(){}, { get:(t,k)=> k==='then'?undefined:mkStub(), apply:()=>undefined, set:()=>true });
  g.audio = mkStub();

  // CLASSIC ACT 1: not endless, not chaos, no campaign stage — the only combination that renders
  // MapManager._drawShipWorld (MapManager.js:1023). Anything else and this file measures the
  // wrong map entirely.
  g.selectedCharacter = 'skeleton_warrior';
  g.endless = false; g._chaosMode = false;
  g._campaignStage = 0; g._pendingCampaignStage = 0;
  try { g.reset(); } catch(_) {}
  g.endless = false; g._chaosMode = false; g._campaignStage = 0;
  g.gameState='playing'; g.gameOver=false; g.victory=false; g.paused=false;
  g.upgradeUI=null; g.mutationUI=null;

  const mm = g.mapManager;
  // Wait for the ship art itself — sampling before it decodes would measure the flat fill.
  for (let i = 0; i < 60 && !(mm._shipImg && mm._shipImg.complete && mm._shipImg.naturalWidth); i++) {
    await new Promise(r => setTimeout(r, 100));
  }

  // Park the player at the TOP-LEFT of the walkable deck and hold it there. Two reasons:
  // a moving camera scrolls the whole background and would register as "motion" everywhere, and
  // at the deck CENTRE the camera clamp leaves NO window band on screen at all — the first run of
  // this file sampled three rectangles of zero height and would have reported "nothing moves"
  // whatever the build did. At the corner the top and left glazing are both plainly in view.
  const b = mm.getAct1DeckBounds ? mm.getAct1DeckBounds() : null;
  const PX = b ? b.x0 + 70 : 0, PY = b ? b.y0 + 70 : 0;
  if (b) { g.player.pos.x = PX; g.player.pos.y = PY; }
  g.player.hp = 1e9; g.player.maxHp = 1e9;
  g.player.takeDamage = () => {}; g.player.takeHit = () => {};
  setInterval(() => {
    if (g.gameState !== 'playing') return;
    g.upgradeUI = null; g.mutationUI = null; g.paused = false; g.gameOver = false; g.victory = false;
    g.enemies.length = 0;                       // keep the window bands free of wandering mobs
    if (b) { g.player.pos.x = PX; g.player.pos.y = PY; }
    if (g.player.vel) { g.player.vel.x = 0; g.player.vel.y = 0; }
  }, 30);

  await new Promise(r => setTimeout(r, 1400));   // let the camera finish following to the corner

  const cv = g._canvas || document.querySelector('canvas');
  const vs = g._viewScale || 1, cam = g.camera;
  const img = mm._shipImg;
  const S  = mm.worldW / img.naturalWidth;
  const artTop = Math.round((mm.worldH - img.naturalHeight * S) / 2);
  const artBot = artTop + Math.round(img.naturalHeight * S);
  const W2S = (wx, wy) => ({ x: (wx - cam.x) * vs, y: (wy - cam.y) * vs });
  const clampRect = (x0,y0,x1,y1) => {
    x0 = Math.max(2, Math.min(cv.width  - 3, x0)); x1 = Math.max(2, Math.min(cv.width  - 3, x1));
    y0 = Math.max(2, Math.min(cv.height - 3, y0)); y1 = Math.max(2, Math.min(cv.height - 3, y1));
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1-x0), h: Math.round(y1-y0) };
  };
  const topA = W2S(b.x0, artTop),  topB = W2S(b.x1, b.y0);
  const lefA = W2S(0,    b.y0),    lefB = W2S(b.x0, b.y1);
  // CONTAINMENT control: a rectangle strictly INSIDE the walkable deck and comfortably clear of
  // its edges. Nothing may ever animate here — that is the whole promise of "only outside the
  // windows". A first version centred this on the player, 70px from the deck corner, so the rect
  // spilled over the glazing and reported motion inside the deck that was not there.
  const dkA = W2S(b.x0 + 120, b.y0 + 120), dkB = W2S(b.x0 + 620, b.y0 + 560);
  // Only bands that are genuinely on screen at this camera are sampled; a clamped-to-nothing
  // rectangle is reported as absent rather than silently scoring 0.
  window.__regions = {
    'window-top':    clampRect(Math.max(2, topA.x), topA.y + 4, topB.x, topB.y - 6),
    'window-left':   clampRect(lefA.x + 2, Math.max(2, lefA.y), lefB.x - 6, lefB.y),
    'deck-CONTROL':  clampRect(dkA.x, dkA.y, dkB.x, dkB.y),
  };
  const shoot = () => {
    const c = g._canvas || document.querySelector('canvas');
    const cx = c.getContext('2d', { willReadFrequently: true });
    const out = {};
    for (const [k, r] of Object.entries(window.__regions)) {
      if (r.w < 8 || r.h < 8) { out[k] = null; continue; }
      out[k] = Array.from(cx.getImageData(r.x, r.y, r.w, r.h).data);
    }
    return out;
  };
  // Background-layer sample: taken the moment _drawWorldBackground returns, so it contains the
  // map and the window-space layer and nothing else.
  window.__shot = null; window.__want = false;
  const proto = Object.getPrototypeOf(g);
  const origBg = proto._drawWorldBackground;
  proto._drawWorldBackground = function (ctx) {
    const r = origBg.call(this, ctx);
    if (window.__want) { window.__want = false; try { window.__shot = shoot(); } catch (_) { window.__shot = null; } }
    return r;
  };
  window.__grabBg = async () => {
    window.__shot = null; window.__want = true;
    for (let i = 0; i < 80 && !window.__shot; i++) await new Promise(r => requestAnimationFrame(r));
    return window.__shot;
  };
  // Whole-frame sample, used only for the sampler-works control.
  window.__grabFrame = () => shoot();
  return {
    ship: !!(img && img.complete && img.naturalWidth),
    endless: g.endless, chaos: g._chaosMode, stage: g._campaignStage,
    canvas: { w: cv.width, h: cv.height }, vs, cam: { x: Math.round(cam.x), y: Math.round(cam.y) },
    artTop, artBot, deck: b, regions: window.__regions,
  };
});

// 14 samples, ~230ms apart => ~3.2s of observation. Slow motion still shows: a star drifting at
// 6 px/s moves ~1.4px between samples, which is a change of several percent of the pixels.
const SAMPLES = 14;
const frames = [];
const wholeFrames = [];
for (let i = 0; i < SAMPLES; i++) {
  frames.push(await page.evaluate(async ()=>await window.__grabBg()));
  wholeFrames.push(await page.evaluate(()=>window.__grabFrame()));
  await page.waitForTimeout(230);
}
const camDrift = await page.evaluate(()=>({ x: Math.round(window.__g.camera.x), y: Math.round(window.__g.camera.y) }));
await browser.close(); srv.close();

const names = Object.keys(setup.regions);
const diffOf = (set, k) => {
  let sumDiff = 0, sumChanged = 0, n = 0, px = 0;
  for (let i = 1; i < set.length; i++) {
    const a = set[i-1] && set[i-1][k], b = set[i] && set[i][k];
    if (!a || !b || a.length !== b.length) continue;
    let d = 0, changed = 0;
    const pixels = a.length / 4;
    for (let p = 0; p < a.length; p += 4) {
      const dr = Math.abs(a[p]-b[p]), dg = Math.abs(a[p+1]-b[p+1]), db = Math.abs(a[p+2]-b[p+2]);
      d += dr + dg + db;
      if (Math.max(dr, dg, db) > 3) changed++;
    }
    sumDiff += d / (pixels * 3); sumChanged += (changed / pixels) * 100; n++; px = pixels;
  }
  return n ? { diff: sumDiff/n, changed: sumChanged/n, px } : { diff: 0, changed: 0, px: 0 };
};
const stats = {};
for (const k of names) {
  stats[k] = diffOf(frames, k);
}
const sanity = diffOf(wholeFrames, 'deck-CONTROL');

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
console.log('\n══ ACT 1 SHIP WINDOWS — REAL PIXEL MOTION ══\n');
console.log(`   ship art loaded: ${setup.ship}   endless=${setup.endless} chaos=${setup.chaos} campaignStage=${setup.stage}`);
console.log(`   camera ${setup.cam.x},${setup.cam.y} -> ${camDrift.x},${camDrift.y} (drift ${Math.abs(camDrift.x-setup.cam.x)},${Math.abs(camDrift.y-setup.cam.y)}px — must be 0)`);
console.log(`   ship art spans world y ${setup.artTop}..${setup.artBot}; walkable deck ${JSON.stringify(setup.deck)}\n`);
console.log('   region            canvas rect                px      avg channel delta   pixels changing');
for (const k of names) {
  const r = setup.regions[k], s = stats[k];
  console.log(`   ${k.padEnd(16)} ${String(r.x).padStart(4)},${String(r.y).padStart(3)} ${String(r.w).padStart(4)}x${String(r.h).padStart(3)}   ${String(s.px).padStart(7)}   ${s.diff.toFixed(3).padStart(10)}        ${s.changed.toFixed(2).padStart(6)}%`);
}
console.log('');
// Criterion is the PERCENTAGE OF PIXELS THAT CHANGE, not the average channel delta. A starfield
// changes a small number of pixels by a large amount, so an area average is diluted by however
// much empty space the band happens to contain — the top band and the left band would then be
// judged by how many planets drifted through during the sample. The baseline for both bands is
// exactly 0.00%, so any real motion clears this by a wide margin.
const MOVING = 0.20;    // % of pixels differing frame to frame
const ctl = stats['deck-CONTROL'];
line(setup.ship === true, 'the Act 1 spaceship map is the map actually being rendered');
line(Math.abs(camDrift.x-setup.cam.x) === 0 && Math.abs(camDrift.y-setup.cam.y) === 0,
     'camera did not move during the sample (so any motion measured is the background, not scrolling)');
line(sanity.changed > MOVING, `sampler works — the same in-deck rect on the FINISHED frame does change (${sanity.changed.toFixed(2)}% of pixels)`);
for (const k of names) {
  if (k === 'deck-CONTROL') continue;
  line(stats[k].changed > MOVING, `${k}: something out there is MOVING (${stats[k].changed.toFixed(2)}% of pixels changing, avg delta ${stats[k].diff.toFixed(3)})`);
}
line(ctl.changed < 0.02, `CONTAINMENT — nothing animates inside the walkable deck (${ctl.changed.toFixed(3)}% of pixels, avg delta ${ctl.diff.toFixed(3)})`);
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
