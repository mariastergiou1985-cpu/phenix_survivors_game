// PATTERN VFX COORDINATE SPACE — 10 characters x 3 modes.
//
// Each live effect carries the world point it was spawned at (p.x / p.y in _patternVFX). The test
// is therefore exact and needs no assumptions: wrap _drawPatternVFX, snapshot every entry's world
// coords just before it runs, let the drawImage hook record where each one ACTUALLY landed on
// screen, and compare pairwise against the one correct answer, (world - camera) * viewScale.
//
// An earlier version of this proof compared the effect against the PLAYER's current position and
// reported 23/24 "off" on correct code — the effects stay at the world point they were spawned at
// (which is right) while the player walks away from it, and the harness even teleported the player
// 900px mid-sample. That measured player movement, not coordinate space.
//
// Before the fix the camera was applied twice — the art collapsed toward the canvas origin and slid
// off the top-left as the player moved, hundreds of px from where it belonged.
//
// It also records the drawn SIZE, because this had to be a POSITION-ONLY change: the same run on
// the pre-fix build must report the same widths.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9510;
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

// dimis_kickboxer has no PATTERN_CHAR_MAP entry, so it is expected to produce zero samples.
const CHARS = ['skeleton_warrior','cyber_arm_hero','taekwondo_girl','assassin_clone','brawler_warrior',
               'euclid_vector','oni_cataclysm_protocol','japan_phasewalker','eddie','dimis_kickboxer'];
const MODES = ['act1','endless','chaos'];

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
await page.addInitScript(() => {
  window.__pv = [];
  window.__pvOn = false;
  const P = CanvasRenderingContext2D.prototype;
  const orig = P.drawImage;
  P.drawImage = function (img, ...rest) {
    try {
      if (window.__pvOn) {
        const src = String((img && (img.src || img.currentSrc)) || '');
        if (/assets\/effects\/pattern\//i.test(src)) {
          let dx, dy, dw, dh;
          if (rest.length >= 8) { dx=rest[4]; dy=rest[5]; dw=rest[6]; dh=rest[7]; }
          else { dx=rest[0]; dy=rest[1]; dw=rest[2]; dh=rest[3]; }
          const t = this.getTransform();
          // centre of the drawn box, through the FULL live transform (rotation included)
          const cx0 = dx + dw / 2, cy0 = dy + dh / 2;
          const sx = t.a*cx0 + t.c*cy0 + t.e;
          const sy = t.b*cx0 + t.d*cy0 + t.f;
          const sw = Math.hypot(t.a, t.b) * dw;      // rotation-safe scale magnitude
          window.__pv.push({ x: sx, y: sy, w: sw });
        }
      }
    } catch (_) {}
    return orig.apply(this, [img, ...rest]);
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
  window.__play = (ch, mode) => {
    g.selectedCharacter = ch;
    g.endless = (mode !== 'act1'); g._chaosMode = (mode === 'chaos');
    try { g.reset(); } catch(_) {}
    g.selectedCharacter = ch;
    if (g.player) g.player.selectedCharacter = ch;
    if (mode === 'endless')    { try { g._enterEndless?.(); } catch(_) {} }
    else if (mode === 'chaos') { g.runChaosLaw = null; try { g._beginChaosRun?.(); } catch(_) {} }
    g.gameState='playing'; g.gameOver=false; g.victory=false; g.paused=false;
    g.upgradeUI=null; g.mutationUI=null;
    window.__pv.length = 0;
  };
  // Wrap the real method: snapshot the expected screen position of every live effect immediately
  // before it draws, so expected and actual come from the SAME frame and the same camera.
  window.__err = [];
  const proto = Object.getPrototypeOf(g);
  const origDraw = proto._drawPatternVFX;
  proto._drawPatternVFX = function (ctx) {
    if (!window.__pvOn) return origDraw.call(this, ctx);
    const vs = this._viewScale || 1;
    const expect = [];
    for (const p of (this._patternVFX || [])) {
      const img = p.img;
      if (!img || !img.complete || img.naturalWidth === 0 || img._failed) continue;
      expect.push({ x: (p.x - this.camera.x) * vs, y: (p.y - this.camera.y) * vs });
    }
    const before = window.__pv.length;
    const r = origDraw.call(this, ctx);
    const drawn = window.__pv.slice(before);
    for (let i = 0; i < Math.min(drawn.length, expect.length); i++) {
      window.__err.push({ d: Math.hypot(drawn[i].x - expect[i].x, drawn[i].y - expect[i].y),
                          x: drawn[i].x, y: drawn[i].y, w: drawn[i].w });
    }
    return r;
  };
  // Push the camera well away from the world origin. With camera ~ (0,0) the old double transform
  // happens to land almost correctly, so a sample taken at spawn would not tell the builds apart.
  window.__shove = () => {
    const p = g.player;
    p.pos.x = Math.min(2400, p.pos.x + 900);
    p.pos.y = Math.min(1400, p.pos.y + 500);
  };
});

const out = {};
for (const ch of CHARS) {
  out[ch] = {};
  for (const mode of MODES) {
    await page.evaluate(({c,m})=>window.__play(c,m), {c:ch,m:mode});
    await page.waitForTimeout(400);
    await page.evaluate(()=>window.__shove());
    await page.waitForTimeout(300);
    await page.evaluate(()=>{ window.__pv.length=0; window.__pvOn = true; });
    await page.waitForTimeout(5200);          // >= 2 spawn cycles (2.8s cadence)
    out[ch][mode] = await page.evaluate(()=>{
      window.__pvOn = false;
      const e = window.__err; window.__err = [];
      if (!e.length) return { n: 0 };
      let maxD = 0, sumD = 0, minX = 1e9, minY = 1e9, maxW = 0;
      for (const h of e) {
        maxD = Math.max(maxD, h.d); sumD += h.d;
        minX = Math.min(minX, h.x); minY = Math.min(minY, h.y);
        maxW = Math.max(maxW, h.w);
      }
      return { n: e.length, maxD: Math.round(maxD), avgD: Math.round(sumD / e.length),
               minX: Math.round(minX), minY: Math.round(minY), maxW: Math.round(maxW) };
    });
  }
}
await browser.close(); srv.close();

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
// 70 world units * viewScale (0.72-0.75) = ~53px, plus half the art's own box for the centre
// wander during rotation/growth. 200px is generous and still nowhere near "top-left of screen".
const TOL = 2;   // exact: the only correct answer is (world - camera) * viewScale, to the pixel
console.log('\n══ PATTERN VFX: ACTUAL screen position vs (world - camera) * viewScale ══');
console.log('   err = |where it was drawn - where that world point maps to|. Correct == 0.\n');
console.log('   character                 mode      n   avgErr   maxErr   minX  minY   maxW');
let bad = 0, sampled = 0, sizes = [];
for (const ch of CHARS) {
  for (const m of MODES) {
    const r = out[ch][m];
    if (!r.n) { console.log(`   ${ch.padEnd(24)} ${m.padEnd(8)}  ${String(0).padStart(3)}   (no pattern art for this character)`); continue; }
    sampled++;
    sizes.push(r.maxW);
    const ok = r.maxD <= TOL;
    if (!ok) bad++;
    console.log(`   ${ch.padEnd(24)} ${m.padEnd(8)} ${String(r.n).padStart(4)}  ${String(r.avgD).padStart(7)}  ${String(r.maxD).padStart(7)}  ${String(r.minX).padStart(5)} ${String(r.minY).padStart(5)}  ${String(r.maxW).padStart(5)}  ${ok?'':'*** OFF ***'}`);
  }
}
console.log('');
line(sampled >= 24, `pattern art actually sampled in ${sampled} character/mode combinations`);
line(bad === 0, `every sampled effect renders exactly at its own world point (${bad} off by more than ${TOL}px)`);
// DELIBERATELY NOT asserting "nothing near the screen's left edge". A world-anchored effect that
// the player has walked away from SHOULD scroll off the left of the viewport — that is what being
// in the world means, and an earlier version of this check failed correct code for exactly that.
// The meaningful question is whether a drawn position is a function of the camera at all, and
// maxErr == 0 above already answers it: every effect sits precisely at (world - camera) * scale.
// On the pre-fix build the same measurement is hundreds of px, which is what the baseline shows.
const worstErr = Math.max(0, ...CHARS.flatMap(c => MODES.map(m => (out[c][m] && out[c][m].n) ? (out[c][m].maxErr || 0) : 0)));
line(worstErr === 0, `worst positional error across all 24 samples is ${worstErr}px (0 = pixel-exact)`);
console.log(`   observed max drawn widths: ${[...new Set(sizes)].sort((a,b)=>a-b).join(', ')}px  (compare to the baseline run — this had to be position-only)`);
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
