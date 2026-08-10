// LEVEL-UP FLOW — legacy pool exhaustion, and the tutorial standing on the cards.
//
// TWO defects, both driven through the real runtime rather than argued from the source:
//
//   A. weightedSample() returns [] once the legacy UPGRADE pool is exhausted. _injectWeaponCard
//      early-returned on an empty array, so buildEngine.injectCards() was never reached: no panel
//      opened, the pending level was consumed silently, and every Build Engine weapon and
//      evolution became unobtainable for the rest of the run.
//
//   B. The LEVEL UP and WEAPONS tutorial steps fire on `player.level >= 2` / having seen level_up
//      — both true DURING a level-up — so a step could open on top of the card panel. Its keydown
//      handler consumes everything except ENTER/SPACE (so 1/2/3 and R are eaten) and _show() sets
//      __phenixTutModal, which makes applyGamepad() return before the pad reaches the cards.
//
// The pool is drained the way the game drains it — by applying real upgrades until weightedSample
// stops returning anything — not by stubbing the sampler.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9660;
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
  window.__clearTut = () => {
    const el = document.getElementById('tut-overlay');
    if (!el || getComputedStyle(el).display === 'none') return false;
    const t = window.__phenixTutorial;
    if (t && performance.now() < (t._armedAt || 0)) return true;
    document.getElementById('tut-continue')?.click();
    return true;
  };
  window.__run = (ch) => {
    g.selectedCharacter = ch || 'skeleton_warrior';
    g.endless = true; g._chaosMode = false; g._campaignStage = 0;
    try { g.reset(); } catch(_) {}
    g.selectedCharacter = ch || 'skeleton_warrior';
    if (g.player) g.player.selectedCharacter = g.selectedCharacter;
    try { g._enterEndless(); } catch(_) {}
    g.gameState='playing'; g.paused=false; g.gameOver=false; g.victory=false;
    g.upgradeUI=null; g.mutationUI=null;
    g.player.hp = 1e9; g.player.maxHp = 1e9;
    g.player.takeDamage = () => {}; g.player.takeHit = () => {};
  };
});
const clearTut = async () => { for (let i=0;i<14;i++){ if(!await page.evaluate(()=>window.__clearTut())) return; await page.waitForTimeout(180);} };

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
console.log('\n══ LEVEL-UP FLOW — exhausted legacy pool, and the tutorial over the cards ══\n');

// ── A. Drain the legacy pool for real, then ask for a level-up ─────────────
await page.evaluate(()=>window.__run('skeleton_warrior'));
await page.waitForTimeout(700);
await clearTut();
const drain = await page.evaluate(async () => {
  const g = window.__g, p = g.player;
  // Drain the way the game drains it: keep sampling and APPLYING real upgrades until the sampler
  // has nothing left. No stub, no monkey-patch of weightedSample — if the pool can still produce
  // a card this loop simply never ends its condition and the count below says so.
  const mod = await import('./js/game/Upgrades.js?v=' +
    (document.querySelector('script[src*="main.js"]')?.src.match(/v=(\d+)/)?.[1] || ''));
  const ws = mod.weightedSample;
  let applied = 0, rounds = 0;
  while (rounds++ < 4000) {
    const c = ws(p, 3, { meta: g.meta, endless: g.endless, chaos: g._chaosMode });
    if (!c || c.length === 0) break;
    for (const card of c) { try { card.apply(p, g); } catch (_) {} applied++; }
  }
  const empty = ws(p, 3, { meta: g.meta, endless: g.endless, chaos: g._chaosMode });
  return { applied, rounds, legacyEmpty: (empty || []).length === 0, level: p.level };
});
console.log(`   drained the legacy pool with ${drain.applied} real upgrade applications over ${drain.rounds} rounds`);
line(drain.legacyEmpty, `weightedSample() now returns an EMPTY pool — the exhausted state is real (${drain.legacyEmpty})`);

// With the pool empty, force a level-up through the SHIPPED path and see what the panel gets.
const lv = await page.evaluate(async () => {
  const g = window.__g, p = g.player;
  g.upgradeUI = null;
  p.level = 45;                       // high-level run
  g._nextCardLevel = 0;               // due a card now
  p.pendingLevelupCount = 1;
  for (let i = 0; i < 8 && !g.upgradeUI; i++) {
    try { g.update(1/60, { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false }); } catch (_) {}
    await new Promise(r => setTimeout(r, 20));
  }
  const ui = g.upgradeUI;
  const cards = ui ? (ui.choices || []).map(c => ({ key: c && c.key, name: c && c.name,
                       be: !!(c && String(c.key || '').startsWith('be_')) })) : null;
  return { opened: !!ui, n: cards ? cards.length : 0, blanks: cards ? cards.filter(c => !c.key).length : -1,
           beCards: cards ? cards.filter(c => c.be).length : 0, cards };
});
console.log(`   level-up with an exhausted legacy pool: panel=${lv.opened}, cards=${lv.n}, of which Build Engine=${lv.beCards}`);
if (lv.cards) for (const c of lv.cards) console.log(`      ${c.be ? 'BE ' : '   '}${c.key} — ${c.name}`);
line(lv.opened, `the level-up panel still opens after the legacy pool is exhausted`);
line(lv.n > 0 && lv.beCards > 0, `Build Engine cards are still offered (${lv.beCards} of ${lv.n})`);
line(lv.blanks === 0, `no blank card reached the UI (${lv.blanks} empty slots)`);

// The card must still be selectable — an offered card nobody can take is the same soft-lock.
const pick = await page.evaluate(async () => {
  const g = window.__g;
  if (!g.upgradeUI) return { ok: false, why: 'no panel' };
  const before = g.upgradeUI.choices.length;
  try { g.selectUpgrade ? g.selectUpgrade(0) : g.upgradeUI = null; } catch (e) { return { ok:false, why:String(e) }; }
  await new Promise(r => setTimeout(r, 60));
  return { ok: !g.upgradeUI, before };
});
line(pick.ok, `the offered card can be selected and the panel closes (soft-lock: ${pick.ok ? 'NO' : 'YES'})`);

// ── B. Tutorial must not stand on the card panel ───────────────────────────
const tut = await page.evaluate(async () => {
  const g = window.__g;
  const t = window.__phenixTutorial;
  if (!t) return { has: false };
  // Put the tutorial in the state where LEVEL UP is the next unseen step, then open a card panel.
  t.done = false; t._qaInert = false;
  t.seen = new Set(['menu_start','mode_select','stage_select','char_select','movement','dash_ult']);
  t._hide();
  g.gameState = 'playing';
  // A REAL panel, opened by the shipped level-up path. An earlier version of this file built one
  // by importing UpgradeUI directly and handing it a hand-made card; that loaded a SECOND module
  // instance and the stub card was missing a field UpgradeUI draws, which threw every frame. The
  // game must open its own panel, or this is not testing the game.
  window.__run('skeleton_warrior');
  await new Promise(r => setTimeout(r, 400));
  g.player.level = 12;
  g._nextCardLevel = 0;
  g.player.pendingLevelupCount = 1;
  for (let i = 0; i < 12 && !g.upgradeUI; i++) {
    try { g.update(1/60, { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false }); } catch (_) {}
    await new Promise(r => setTimeout(r, 25));
  }
  if (!g.upgradeUI) return { has: true, opened: false };
  await new Promise(r => setTimeout(r, 900));       // let the tutorial rAF loop run many times
  const during = { visible: !!t.visible, modal: !!window.__phenixTutModal,
                   dom: (() => { const e = document.getElementById('tut-overlay');
                                 return !!(e && getComputedStyle(e).display !== 'none'); })(),
                   seenLevelUp: t.seen.has('level_up') };
  g.upgradeUI = null;                                // player picked a card
  await new Promise(r => setTimeout(r, 900));
  const after = { opened: true, visible: !!t.visible, step: t.stepIdx,
                  dom: (() => { const e = document.getElementById('tut-overlay');
                                return !!(e && getComputedStyle(e).display !== 'none'); })() };
  return { has: true, opened: true, during, after };
});
console.log(`\n   tutorial while a card panel is open: visible=${tut.during?.visible} modal=${tut.during?.modal} dom=${tut.during?.dom}`);
console.log(`   tutorial after the card was taken:   visible=${tut.after?.visible} (step ${tut.after?.step})`);
line(tut.has && tut.opened === true, `a REAL level-up panel was opened for this check (${tut.opened})`);
line(tut.has && tut.during.visible === false && tut.during.dom === false,
  `no tutorial step opens over an active card panel (visible=${tut.during?.visible}, dom=${tut.during?.dom})`);
line(tut.has && tut.during.modal === false,
  `__phenixTutModal stays false while cards are up, so the controller reaches them (${tut.during?.modal})`);
line(tut.has && tut.during.seenLevelUp === false,
  `the deferred step is NOT consumed — it is still unseen (${tut.during?.seenLevelUp})`);
line(tut.has && tut.after.visible === true,
  `and it appears on its own once the card was taken (visible=${tut.after?.visible})`);

await browser.close(); srv.close();
console.log('');
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
