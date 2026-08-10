// UI EXIT / RUN-FLOW PROOF — the five soft-lock and wrong-mode paths, keyboard AND controller.
//
//   RELICS EXIT    ESC and controller B leave the relics screen.
//   HANGAR EXIT    same, and the `keys.has('Escape')` vs lowercase mismatch is gone.
//   CHAOS LAW      the mid-run reroll overlay: ESC/B must NOT pause the run behind it, and must
//                  reach the overlay's own cancel — not be eaten by the pause toggle.
//   NULL ARSENAL   with the panel up, arrows/ENTER/A must not drive the menu underneath and must
//                  never start a run behind the opaque panel; BACK still closes it.
//   ENDLESS RETRY  RETRY on an Endless results screen must produce a REAL Endless run.
//
// Controller input goes through main.js's own padTap()/window.dispatchEvent bridge, which is a
// different event path from a real keypress — the NULL ARSENAL leak lived exactly in that gap, so
// every case is exercised on BOTH paths rather than assuming they are equivalent.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9600;
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
// Read from Game.js, never hard-coded: a stale ?v= here would load a SECOND module instance and
// the proof would be testing a copy of the panel the game does not use.
const NA_V = fs.readFileSync(path.join(ROOT,'js/game/Game.js'),'utf8').match(/NullArsenalUI\.js\?v=(\d+)/)[1];
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));

const BTN = { a: 0, b: 1, up: 12, down: 13, left: 14, right: 15 };
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
  const pad = { id: 'PHENIX QA Virtual Pad (STANDARD GAMEPAD)', index: 0, connected: true,
                mapping: 'standard', timestamp: 0, axes: [0,0,0,0],
                buttons: Array.from({ length: 17 }, () => ({ pressed:false, touched:false, value:0 })) };
  navigator.getGamepads = () => [pad, null, null, null];
  window.__padSet = (i, on) => { pad.buttons[i].pressed = !!on; pad.buttons[i].touched = !!on;
                                 pad.buttons[i].value = on ? 1 : 0; pad.timestamp = performance.now(); };
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
  if (!g.meta.isEndlessUnlocked()) g.meta.unlockEndless();
  const mkStub = () => new Proxy(function(){}, { get:(t,k)=> k==='then'?undefined:mkStub(), apply:()=>undefined, set:()=>true });
  g.audio = mkStub();
  // The tutorial is a modal in its own right and is not what this file measures; it is closed
  // through its own CONTINUE button whenever it appears, never disabled.
  window.__clearTut = () => {
    const el = document.getElementById('tut-overlay');
    if (!el || getComputedStyle(el).display === 'none') return false;
    const t = window.__phenixTutorial;
    if (t && performance.now() < (t._armedAt || 0)) return true;
    document.getElementById('tut-continue')?.click();
    return true;
  };
  window.__gs = () => g.gameState;
  // Diagnostics: how many Escape keydowns actually reached the window, and how many times the
  // game was sent home. A single input that produces two of either is the shape of a
  // double-consume bug, and without counting them a failure is unattributable.
  window.__esc = 0; window.__menu = 0;
  window.addEventListener('keydown', e => { if (e.key === 'Escape') window.__esc++; }, true);
  const _gm = g.goToMainMenu.bind(g);
  g.goToMainMenu = function (...a) { window.__menu++; return _gm(...a); };
  window.__diagReset = () => { window.__esc = 0; window.__menu = 0; };
  window.__diag = () => ({ esc: window.__esc, menu: window.__menu,
                           tut: !!window.__phenixTutModal, ars: !!window.__phenixArsenalModal });
});
const clearTut = async () => { for (let i=0;i<14;i++){ if(!await page.evaluate(()=>window.__clearTut())) return; await page.waitForTimeout(180);} };
const key  = async (k) => { await clearTut(); await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); await page.waitForTimeout(340); };
const padB = async (name='b') => { await clearTut();
  await page.evaluate(b=>window.__padSet(b,true), BTN[name]); await page.waitForTimeout(200);
  await page.evaluate(b=>window.__padSet(b,false), BTN[name]); await page.waitForTimeout(360); };
const gs = () => page.evaluate(()=>window.__gs());
// Headless drops the odd pad edge — documented in the other proofs in this folder, and the very
// FIRST press of a run is the usual casualty because GamepadInput only counts the pad as
// activated once it has seen one. Prime with a harmless direction (ArrowUp on the menu just moves
// the cursor) and let the exit cases press until the screen changes, reporting the count.
const padPrime = async () => { await padB('up'); await padB('up'); };
const padUntil = async (name, predicate, max = 4) => {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(predicate)) return i;
    await padB(name);
  }
  return (await page.evaluate(predicate)) ? max : -1;
};
const menu = async () => {
  // Hard reset of modal ownership between sections: a panel left open by a FAILING case would
  // otherwise swallow every later keypress and report cascade failures as new bugs.
  await page.evaluate(()=>{ try { window.__phenixArsenalModal = false; } catch(_) {}
                            document.getElementById('na-root')?.remove();
                            document.getElementById('cgm-chaos-law-sel')?.remove();
                            if (window.__g) window.__g._clsVisible = false; });
  await page.evaluate(()=>window.__g.goToMainMenu());
  await page.waitForTimeout(600);
};

let pass=0, fail=0; const R={};
const line=(k,ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; if(R[k]!==false) R[k]=ok; };

await menu();
await padPrime();

// ── 1/2. RELICS + HANGAR, keyboard then controller ──────────────────────────
for (const [label, open] of [['RELICS','goToRelicsScreen'], ['HANGAR','goToHangar']]) {
  for (const how of ['keyboard','controller']) {
    await menu();
    const opened = await page.evaluate((fn)=>{ const g=window.__g;
      if (typeof g[fn] !== 'function') return 'missing:'+fn;
      g[fn](); return g.gameState; }, open);
    await page.waitForTimeout(500);
    if (String(opened).startsWith('missing')) { line(label, false, `${label} EXIT (${how}): entry point ${opened}`); continue; }
    let presses = 0;
    if (how === 'keyboard') { await key('Escape'); }
    else { presses = await padUntil('b', () => window.__g.gameState === 'start_menu', 4); }
    await page.waitForTimeout(500);
    const after = await gs();
    const domGone = await page.evaluate((l)=>{
      const id = l === 'RELICS' ? 'cgm-relics' : 'cgm-hangar';
      const n = document.getElementById(id);
      return !n || getComputedStyle(n).display === 'none';
    }, label);
    line(label, after === 'start_menu' && domGone,
      `${label} EXIT (${how}): opened=${opened} -> ${after}${how==='controller'?` (B presses: ${presses < 0 ? '4+, never left' : presses + 1})`:''}${domGone?'':' (overlay STILL VISIBLE)'}`);
  }
}

// ── 3. CHAOS LAW overlay, opened MID-RUN ────────────────────────────────────
for (const how of ['keyboard','controller']) {
  await menu();
  const setup = await page.evaluate(()=>{
    const g = window.__g;
    g.selectedCharacter = 'skeleton_warrior';
    g.endless = true; g._chaosMode = false; g._campaignStage = 0;
    try { g.reset(); } catch(_) {}
    try { g._enterEndless(); } catch(_) {}
    g.gameState='playing'; g.paused=false; g.gameOver=false; g.victory=false;
    g.upgradeUI=null; g.mutationUI=null;
    g.runChaosLaw = 'blood_grid';
    g._clsRerollMode = true;                       // the CHAOS DOCTRINE mid-run reroll
    try { g._showChaosLawSelectionOverlay(); } catch(e) { return 'err:'+e; }
    return { cls: !!g._clsVisible, state: g.gameState, paused: !!g.paused };
  });
  await page.waitForTimeout(500);
  if (typeof setup === 'string') { line('CHAOS LAW', false, `CHAOS LAW (${how}): could not open — ${setup}`); continue; }
  await clearTut();
  await page.evaluate(()=>window.__diagReset());
  if (how === 'keyboard') await key('Escape'); else await padB('b');
  const diag = await page.evaluate(()=>window.__diag());
  await page.waitForTimeout(600);
  const after = await page.evaluate(()=>{
    const g = window.__g;
    const n = document.getElementById('cgm-chaos-law-sel');
    return { cls: !!g._clsVisible, paused: !!g.paused, state: g.gameState,
             dom: !!(n && getComputedStyle(n).display !== 'none'), law: g.runChaosLaw };
  });
  // Correct outcome: the overlay's own cancel ran (mid-run BACK keeps the current law), the run
  // is NOT paused, and nothing is left on screen.
  line('CHAOS LAW', after.cls === false && after.dom === false && after.paused === false && after.state === 'playing',
    `CHAOS LAW (${how}): overlay ${setup.cls?'opened':'DID NOT OPEN'} -> visible=${after.cls} dom=${after.dom} paused=${after.paused} state=${after.state} law=${after.law}  [escapes=${diag.esc} goToMainMenu=${diag.menu} tutModal=${diag.tut}]`);
}

// ── 4. NULL ARSENAL ─────────────────────────────────────────────────────────
for (const how of ['keyboard','controller']) {
  await menu();
  const opened = await page.evaluate(async (v)=>{
    const g = window.__g;
    const mod = await import(`./js/game/NullArsenalUI.js?v=${v}`).catch(()=>null);
    if (!mod || typeof mod.openNullArsenal !== 'function') return 'no entry point';
    mod.openNullArsenal(g);
    return { state: g.gameState, dom: !!document.getElementById('na-root') };
  }, NA_V);
  await page.waitForTimeout(600);
  if (typeof opened === 'string') { line('NULL ARSENAL', false, `NULL ARSENAL (${how}): ${opened}`); continue; }
  const before = await gs();
  // Drive the menu underneath as hard as the player would: move the cursor, then confirm.
  if (how === 'keyboard') {
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(160);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(160);
    await page.keyboard.press('Enter');     await page.waitForTimeout(600);
    await page.keyboard.press('Enter');     await page.waitForTimeout(600);
  } else {
    await padB('down'); await padB('down'); await padB('a'); await padB('a');
  }
  const mid = await page.evaluate(()=>({ state: window.__g.gameState,
    dom: !!document.getElementById('na-root'),
    flag: !!window.__phenixArsenalModal }));
  line('NULL ARSENAL', mid.state === before && before === 'start_menu',
    `NULL ARSENAL (${how}): menu behind the panel stayed put — ${before} -> ${mid.state}${mid.state!==before?'  *** A RUN STARTED BEHIND THE PANEL ***':''}`);
  // BACK must still close it.
  await page.evaluate(()=>window.__diagReset());
  if (how === 'keyboard') await key('Escape');
  else await padUntil('b', () => !document.getElementById('na-root'), 4);
  await page.waitForTimeout(500);
  const adiag = await page.evaluate(()=>window.__diag());
  const closed = await page.evaluate(()=>({ flag: !!window.__phenixArsenalModal,
    dom: !!document.getElementById('na-root'), state: window.__g.gameState }));
  line('NULL ARSENAL', closed.dom === false,
    `NULL ARSENAL (${how}): BACK still closes it — panel present=${closed.dom}, state=${closed.state}  [escapes=${adiag.esc} tutModal=${adiag.tut} arsFlag=${adiag.ars}]`);
}

// ── 5. ENDLESS RETRY ────────────────────────────────────────────────────────
for (const how of ['direct','keyboard']) {
  await menu();
  const pre = await page.evaluate(()=>{
    const g = window.__g;
    g.selectedCharacter = 'skeleton_warrior';
    g.endless = true; g._chaosMode = false; g._campaignStage = 0;
    try { g.reset(); } catch(_) {}
    try { g._enterEndless(); } catch(_) {}
    g.gameState='playing'; g.paused=false; g.victory=false;
    g.gameOver = true;                                  // the Endless results screen
    return { endless: !!g.endless, chunk: !!g.mapManager.chunkStreamingEnabled };
  });
  await page.waitForTimeout(400);
  if (how === 'direct') await page.evaluate(()=>window.__g.retryRun());
  else                  await key('r');                  // the R shortcut main.js binds to retryRun
  await page.waitForTimeout(900);
  const post = await page.evaluate(()=>{
    const g = window.__g;
    return { endless: !!g.endless, chaos: !!g._chaosMode, over: !!g.gameOver, victory: !!g.victory,
             chunk: !!g.mapManager.chunkStreamingEnabled, state: g.gameState,
             t: Math.round((g.timeAlive||0)*10)/10 };
  });
  line('ENDLESS RETRY', post.endless === true && post.chunk === true && post.over === false,
    `ENDLESS RETRY (${how}): before endless=${pre.endless} -> after endless=${post.endless}, chunkStreaming=${post.chunk}, gameOver=${post.over}, t=${post.t}s` +
    (post.endless ? '' : '  *** RETRY produced an ACT 1 run ***'));
}

await browser.close(); srv.close();
console.log('');
line('ERRORS', errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
const order = ['RELICS','HANGAR','CHAOS LAW','NULL ARSENAL','ENDLESS RETRY'];
console.log('\n   ' + order.map(k => `${k} ${R[k] ? 'PASS' : 'FAIL'}`).join(' | '));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
