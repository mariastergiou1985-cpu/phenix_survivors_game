// TUTORIAL VISIBILITY — three saves, three outcomes, measured in a real booted game.
//
//   FRESH SAVE   — no record at all              -> tutorial shows, highlighting START GAME
//   OLD SAVE     — {seen:[],done:true}           -> the first build's auto-complete. Must be
//                                                   treated as NOT done and shown ONCE.
//   DONE SAVE    — {seen:[...],done:true}        -> a REAL completion. Must stay silent.
//   REPLAY       — Settings -> Replay Tutorial   -> always restarts at step 1.
//
// The overlay is driven by requestAnimationFrame, so every check waits on the real loop rather
// than stepping frames. window.__phenixTutorialForce is set because TutorialGuide deliberately
// goes inert under the QA harness — without it this proof would measure nothing and pass.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9480;
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
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
const browser = await chromium.launch({ executablePath: EXE,
  args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'] });
const errs=[];

const TUT_KEY = 'phenix_tutorial_v1';

// One clean browser context per scenario: localStorage must be seeded BEFORE the game boots,
// because TutorialGuide reads (and migrates) its record inside the Game constructor.
async function scenario(seed, metaSeed) {
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await ctx.newPage();
  page.on('pageerror',e=>errs.push('PAGEERROR '+e));
  page.on('console',m=>{ if(m.type()==='error'&&!/Failed to load resource/.test(m.text())) errs.push('CONSOLE '+m.text()); });
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, r=>{
    const u=r.request().url();
    if(/fonts\.googleapis/.test(u)) return r.fulfill({status:200,contentType:'text/css',body:'/*x*/'});
    return r.abort();
  });
  await page.addInitScript(({k, seed, metaSeed}) => {
    try {
      if (seed === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(seed));
      if (metaSeed) localStorage.setItem('phenix_meta', JSON.stringify(metaSeed));
    } catch (_) {}
    window.__phenixTutorialForce = true;      // TutorialGuide is inert under QA unless forced
  }, {k: TUT_KEY, seed, metaSeed});
  await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#cgm-overlay',{timeout:20000});
  await page.waitForTimeout(2500);            // let the rAF loop settle and the menu mount
  return { ctx, page };
}

const read = (page) => page.evaluate((k) => {
  const t = window.__phenixTutorial;
  const ov = document.getElementById('tut-overlay');
  const hl = document.getElementById('tut-hl');
  const btn = document.querySelector('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  const br = btn ? btn.getBoundingClientRect() : null;
  const hr = (hl && ov && ov.style.display !== 'none') ? hl.getBoundingClientRect() : null;
  let stored = null; try { stored = JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) {}
  return {
    visible: !!(t && t.visible),
    done: !!(t && t.done),
    stepId: (t && t.stepIdx >= 0) ? (t.constructor && t.stepIdx) : -1,
    title: document.getElementById('tut-title')?.textContent || '',
    overlayShown: !!(ov && ov.style.display !== 'none'),
    // Does the highlight box actually sit on the START GAME button?
    highlightsStart: !!(br && hr && Math.abs(hr.left+hr.width/2 - (br.left+br.width/2)) < 40
                                 && Math.abs(hr.top+hr.height/2 - (br.top+br.height/2)) < 40),
    stored,
  };
}, TUT_KEY);

const out = {};

// ── 1. FRESH SAVE ────────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await scenario(null, null);
  out.fresh = await read(page);
  // Walk it to completion the way a player does — Enter on every step that appears.
  await page.evaluate(() => { const t = window.__phenixTutorial; t.seen = new Set(['a','b']); t.done = true; t._save(); t._hide(); });
  out.freshAfterComplete = await read(page);
  await ctx.close();
}

// ── 2. OLD SAVE auto-completed by the first build ────────────────────────────────────────
{
  const { ctx, page } = await scenario({ seen: [], done: true },
                                       { stagesCleared: 3, endlessUnlocked: true, totalRuns: 12 });
  out.old = await read(page);
  await ctx.close();
}

// ── 3. GENUINELY COMPLETED SAVE — must stay silent ───────────────────────────────────────
{
  const { ctx, page } = await scenario({ seen: ['menu_start','movement','relics'], done: true },
                                       { stagesCleared: 3, endlessUnlocked: true, totalRuns: 12 });
  out.completed = await read(page);
  await ctx.close();
}

// ── 4. ALREADY-MIGRATED record must not be re-migrated ───────────────────────────────────
{
  const { ctx, page } = await scenario({ v: 2, seen: ['menu_start','movement','relics'], done: true }, null);
  out.migratedStaysDone = await read(page);
  await ctx.close();
}

// ── 5. REPLAY — from a completed save, must restart at step 1 on START GAME ───────────────
{
  const { ctx, page } = await scenario({ v: 2, seen: ['menu_start','movement','relics'], done: true },
                                       { stagesCleared: 3, endlessUnlocked: true, totalRuns: 12 });
  const before = await read(page);
  await page.evaluate(() => window.__phenixTutorial.replay());
  await page.waitForTimeout(2500);
  out.replayBefore = before;
  out.replay = await read(page);
  await ctx.close();
}

await browser.close(); srv.close();

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
console.log('\n══ TUTORIAL VISIBILITY ══');
console.log(JSON.stringify(out,null,1));
console.log('');
line(out.fresh.visible && out.fresh.overlayShown, 'FRESH SAVE: tutorial shows automatically at the Main Menu');
line(out.fresh.highlightsStart,                   '  ...and step 1 highlights the START GAME button');
line(!out.fresh.done,                             '  ...and is not marked done before it is finished');
line(out.freshAfterComplete.stored?.done === true && out.freshAfterComplete.stored?.v === 2,
                                                  '  ...a real completion persists {v:2, done:true}');
line(out.old.visible && out.old.overlayShown,     'OLD AUTO-COMPLETED SAVE: is shown the tutorial');
line(out.old.highlightsStart,                     '  ...starting on START GAME');
line(out.old.stored && out.old.stored.done === false && out.old.stored.v === 2,
                                                  '  ...and the stale done flag was cleared and stamped v:2');
line(!out.completed.visible && out.completed.done, 'REAL COMPLETION: stays silent (not re-shown)');
line(out.completed.stored?.done === true,          '  ...and keeps its done flag');
line(out.migratedStaysDone.done && !out.migratedStaysDone.visible,
                                                   'ALREADY MIGRATED (v:2): not re-migrated, stays silent');
line(out.replayBefore.visible === false,           'REPLAY: started from a silent, completed save');
line(out.replay.visible && out.replay.overlayShown,'  ...replay shows the tutorial again');
line(out.replay.highlightsStart,                   '  ...from step 1, on START GAME');
line(out.replay.stored?.done === false && (out.replay.stored?.seen || []).length === 0,
                                                   '  ...with progress fully reset on disk');
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
