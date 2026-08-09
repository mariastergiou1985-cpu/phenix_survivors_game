// LEGACY CHARACTER ART — DOM probe.
//
// The canvas probe found nothing, because the art is not drawn on the canvas at all: the main menu
// is a DOM overlay carrying a slideshow of four large character illustrations. This probe checks
// whether ANY of that DOM art is still VISIBLE while gameState === 'playing'.
//
// It deliberately does NOT call _hideMenuOverlay / remove overlay nodes — doing that is exactly
// what made the canvas probe blind. It enters play through the real code path and then measures.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9500;
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
await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#cgm-overlay',{timeout:20000});
await page.waitForTimeout(1500);
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
  // Enter a run WITHOUT hiding any overlay by hand. Whatever the shipped path leaves on screen,
  // stays on screen — that is the entire point of this probe.
  window.__play = (ch, mode) => {
    g.selectedCharacter = ch;
    g.endless = (mode !== 'act1'); g._chaosMode = (mode === 'chaos');
    try { g.reset(); } catch(_) {}
    g.selectedCharacter = ch;
    if (g.player) g.player.selectedCharacter = ch;
    if (mode === 'endless')    { try { g._enterEndless?.(); } catch(_) {} }
    else if (mode === 'chaos') { g.runChaosLaw = null; try { g._beginChaosRun?.(); } catch(_) {} }
    g.gameState = 'playing'; g.gameOver=false; g.victory=false; g.paused=false;
    g.upgradeUI=null; g.mutationUI=null;
  };
  // Every DOM image that is genuinely painted over the play field right now.
  window.__visibleDomArt = () => {
    const out = [];
    for (const el of document.querySelectorAll('img')) {
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 60) continue;                 // ignore icons
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.02) continue;
      // an ancestor may be hidden even when the img itself is not
      let hidden = false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const p = getComputedStyle(n);
        if (p.display === 'none' || p.visibility === 'hidden' || parseFloat(p.opacity || '1') < 0.02) { hidden = true; break; }
      }
      if (hidden) continue;
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;   // off-screen
      out.push({ src: decodeURIComponent(String(el.currentSrc || el.src)).split('/').slice(-2).join('/').split('?')[0],
                 x: Math.round(r.left), y: Math.round(r.top),
                 w: Math.round(r.width), h: Math.round(r.height),
                 cls: el.className || '' });
    }
    return out;
  };
});

const MODES = ['act1','endless','chaos'];
const out = {};
for (const ch of CHARS) {
  out[ch] = {};
  for (const mode of MODES) {
    await page.evaluate(({c,m})=>window.__play(c,m), {c:ch,m:mode});
    await page.waitForTimeout(1200);
    out[ch][mode] = await page.evaluate(()=>window.__visibleDomArt());
  }
}
await browser.close(); srv.close();

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
console.log('\n══ DOM IMAGES >=60px VISIBLE WHILE gameState === "playing" ══\n');
let total = 0;
for (const ch of CHARS) {
  const rows = [];
  for (const m of MODES) for (const a of out[ch][m]) rows.push({ m, ...a });
  console.log(`   ${ch}`);
  if (!rows.length) { console.log('      (clean — no DOM art over the play field)'); continue; }
  for (const r of rows) {
    total++;
    console.log(`      [${r.m.padEnd(7)}] ${r.src.padEnd(46)} ${String(r.w).padStart(4)}x${String(r.h).padStart(4)} @ ${r.x},${r.y}  ${r.cls}`);
  }
}
console.log('');
line(total === 0, `no legacy DOM character art is visible during combat, 10 chars x 3 modes (found ${total})`);
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
