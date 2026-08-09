// LEGACY CHARACTER ART — empirical probe, all 10 characters.
//
// Rather than read 17 effect modules and guess, this hooks CanvasRenderingContext2D.drawImage and
// records EVERY draw whose source is character-illustration art, while gameState === 'playing'.
// For each it captures the image src, the drawn size, and the FINAL on-screen position (the full
// current transform applied), so a world-space sprite at the player is distinguishable from a big
// portrait pinned to a screen corner.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9490;
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

const CHARS = ['skeleton_warrior','cyber_arm_hero','taekwondo_girl','assassin_clone','brawler_warrior',
               'euclid_vector','oni_cataclysm_protocol','japan_phasewalker','eddie','dimis_kickboxer'];

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

// The hook must exist BEFORE the game boots so nothing is missed.
await page.addInitScript(() => {
  window.__artHits = [];
  window.__artOn = false;
  const P = CanvasRenderingContext2D.prototype;
  const orig = P.drawImage;
  // Any art that depicts a PLAYABLE CHARACTER. Weapon/VFX/enemy/map art is deliberately excluded:
  // the brief is character illustrations only, and VFX must not be touched.
  // WIDE by design. The first version of this probe only matched assets/characters/ and reported
  // "nothing found" — but the legacy portraits live under assets/ui, assets/abilities, assets/nexus
  // and assets/unlocks too. Catch EVERY image and let the report filter by drawn size.
  const CHAR_ART = /.*/;
  P.drawImage = function (img, ...rest) {
    try {
      if (window.__artOn) {
        let src = img && (img.src || img.currentSrc) || '';
        // A canvas source carries no src; tag the ones the game builds FROM character art.
        if (!src && img && img.__fromCharArt) src = img.__fromCharArt;
        if (src && CHAR_ART.test(src)) {
          // Final on-screen box, with the live transform applied.
          const t = this.getTransform ? this.getTransform() : null;
          let dx, dy, dw, dh;
          if (rest.length >= 8) { dx=rest[4]; dy=rest[5]; dw=rest[6]; dh=rest[7]; }
          else if (rest.length >= 4) { dx=rest[0]; dy=rest[1]; dw=rest[2]; dh=rest[3]; }
          else { dx=rest[0]; dy=rest[1]; dw=(img.naturalWidth||img.width||0); dh=(img.naturalHeight||img.height||0); }
          const sx = t ? (t.a*dx + t.c*dy + t.e) : dx;
          const sy = t ? (t.b*dx + t.d*dy + t.f) : dy;
          const sw = t ? Math.abs(dw * t.a) : dw;
          const sh = t ? Math.abs(dh * t.d) : dh;
          if (sw < 90 && sh < 90) return orig.apply(this, [img, ...rest]);   // small = sprites/VFX cells
          window.__artHits.push({ src: String(src).split('/').slice(-3).join('/').split('?')[0],
                                  x: Math.round(sx), y: Math.round(sy),
                                  w: Math.round(sw), h: Math.round(sh) });
        }
      }
    } catch (_) {}
    return orig.apply(this, [img, ...rest]);
  };
});

await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#cgm-overlay',{timeout:20000});
await page.waitForTimeout(1300);
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
  try { g._hideCharSelectOverlay?.(); } catch(_) {}
  for (const s of ['#cgm-charselect','#cgm-collection','#cgm-chaos-law-sel']) { const n=document.querySelector(s); if(n) n.remove(); }
  // BOTH MODES. The first run only covered Endless, which is not enough to claim "no legacy art
  // in combat" — Act 1 has its own map, its own biome layer and its own draw branches.
  window.__play = (ch, mode) => {
    g.selectedCharacter = ch;
    g.gameState = 'playing'; g.gameOver=false; g.victory=false; g.paused=false;
    g.upgradeUI=null; g.mutationUI=null;
    g.endless = (mode !== 'act1'); g._chaosMode = (mode === 'chaos');
    try { g.reset(); } catch(_) {}
    g.selectedCharacter = ch;
    if (g.player) g.player.selectedCharacter = ch;
    if (mode === 'endless')    { try { g._enterEndless?.(); } catch(_) {} }
    else if (mode === 'chaos') { g.runChaosLaw = null; try { g._beginChaosRun?.(); } catch(_) {} }
    else                       { g.endless = false; g._chaosMode = false; }
    g.gameState = 'playing'; g.gameOver=false; g.victory=false; g.paused=false;
    window.__artHits.length = 0;
  };
});

const out = {};
const MODES = ['act1','endless','chaos'];
for (const ch of CHARS) {
 out[ch] = [];
 for (const mode of MODES) {
  await page.evaluate(({c,m})=>window.__play(c,m), {c:ch,m:mode});
  await page.waitForTimeout(600);                 // let the sprite load + the run settle
  await page.evaluate(()=>{ window.__artHits.length=0; window.__artOn = true; });
  await page.waitForTimeout(4000);                // 4s of real rAF gameplay
  // Fire every ultimate/ability the character has, so cinematic renderers are exercised too.
  await page.evaluate(() => {
    const g = window.__g;
    for (const fn of ['activateUltimate','activateEMPShockwave','activateGlitchDash','activateDigitalSingularity',
                      'activateOverheatedChains','activatePhantomExecution','activateSpiritDojang']) {
      try { g[fn]?.(); } catch(_) {}
    }
  });
  await page.waitForTimeout(2500);
  const got = await page.evaluate(()=>{ window.__artOn = false;
    const agg = {};
    for (const h of window.__artHits) {
      const k = h.src + ' @' + h.w + 'x' + h.h;
      if (!agg[k]) agg[k] = { src:h.src, w:h.w, h:h.h, n:0, minX:1e9, minY:1e9, maxX:-1e9, maxY:-1e9 };
      const a = agg[k]; a.n++;
      a.minX=Math.min(a.minX,h.x); a.maxX=Math.max(a.maxX,h.x);
      a.minY=Math.min(a.minY,h.y); a.maxY=Math.max(a.maxY,h.y);
    }
    return Object.values(agg);
  });
  for (const a of got) { a.mode = mode; out[ch].push(a); }
 }
}
await browser.close(); srv.close();

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
console.log('\n══ EVERY IMAGE >= 90px DRAWN DURING LIVE GAMEPLAY ══');
console.log('   A draw is BIG if either dimension >= 100 screen px.');
console.log('   A draw is PINNED if it never moves across the whole sample (min == max).\n');
let bigTotal = 0;
for (const ch of CHARS) {
  const hits = out[ch];
  console.log(`   ${ch}`);
  if (!hits.length) { console.log('      (no character art drawn at all)'); continue; }
  for (const a of hits) {
    const isCharArt = /assets\/characters\/|main.?theme|protagonist|portrait/i.test(a.src);
    const big = isCharArt && (a.w >= 100 || a.h >= 100);
    const pinned = (a.minX === a.maxX && a.minY === a.maxY);
    if (big) bigTotal++;
    console.log(`      [${(a.mode||'?').padEnd(7)}] ${a.src.padEnd(42)} ${String(a.w).padStart(4)}x${String(a.h).padStart(4)}  n=${String(a.n).padStart(4)}` +
                `  x:${a.minX}..${a.maxX} y:${a.minY}..${a.maxY}` +
                `  ${big?'*** BIG ***':''}${pinned?' [PINNED]':''}`);
  }
}
console.log('');
line(bigTotal === 0, `no BIG (>=100px) CHARACTER illustration in live gameplay, 10 chars x 3 modes (found ${bigTotal})`);
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
