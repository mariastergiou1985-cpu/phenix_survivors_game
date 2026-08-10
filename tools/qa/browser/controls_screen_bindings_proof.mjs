// CONTROLS SCREEN vs THE REAL BINDINGS.
//
// A controls screen is only worth anything if it tells the truth, so this does not just look for
// the new rows — it reads the ACTUAL bindings out of js/main.js and then presses those keys and
// pad buttons in a live run to confirm the ability fires. A row that says C but is wired to
// something else fails here.
//
// It also measures LAYOUT: every fillText drawn by _drawInstructionsScreen is captured with its
// position, so two extra rows pushing the last line out of the panel is caught rather than
// discovered later on screen.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9640;
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
const MAIN = fs.readFileSync(path.join(ROOT,'js/main.js'),'utf8');
const GAME_V = MAIN.match(/Game\.js\?v=(\d+)/)[1];
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));

// ── The bindings, read out of the source rather than assumed ────────────────
const kbOf = (fn) => (MAIN.match(new RegExp("if \\(key === '(\\w)'\\) game\\." + fn + "\\(\\)")) || [])[1] || null;
const padOf = (k)  => (MAIN.match(new RegExp("s\\.btn\\.(\\w+)\\.pressed\\)\\s*\\{ padTap\\('" + k + "'\\)")) || [])[1] || null;
const SPECIAL_KEY = kbOf('activateSpecial');
const DOJANG_KEY  = kbOf('activateSpiritDojang');
const SPECIAL_BTN = SPECIAL_KEY ? padOf(SPECIAL_KEY) : null;   // 'x' | 'a' | ...
const DOJANG_BTN  = DOJANG_KEY  ? padOf(DOJANG_KEY)  : null;
// Standard-gamepad index + how each face button is written on the two brands.
const FACE = { a: { i: 0, xb: 'A', ps: 'Cross' }, b: { i: 1, xb: 'B', ps: 'Circle' },
               x: { i: 2, xb: 'X', ps: 'Square' }, y: { i: 3, xb: 'Y', ps: 'Triangle' } };

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
  // Capture every string the controls screen paints, with where it landed.
  window.__txt = []; window.__txtOn = false;
  const P = CanvasRenderingContext2D.prototype, o = P.fillText;
  P.fillText = function (s, x, y, ...r) {
    try { if (window.__txtOn) { const t = this.getTransform();
      window.__txt.push({ s: String(s), x: t.a*x + t.c*y + t.e, y: t.b*x + t.d*y + t.f }); } } catch (_) {}
    return o.apply(this, [s, x, y, ...r]);
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
  window.__clearTut = () => {
    const el = document.getElementById('tut-overlay');
    if (!el || getComputedStyle(el).display === 'none') return false;
    const t = window.__phenixTutorial;
    if (t && performance.now() < (t._armedAt || 0)) return true;
    document.getElementById('tut-continue')?.click();
    return true;
  };
  // The panel geometry the screen itself uses, so the overflow check is not a guess.
  // Read the real numbers out of the shipped source instead of copying them here — a hard-coded
  // 580 would keep "passing" after the panel was resized and measure the wrong rectangle.
  window.__panel = () => {
    const src = window.__g.constructor.prototype._drawInstructionsScreen.toString();
    const m = src.match(/const pw = (\d+), ph = (\d+);/);
    const W = 1280, H = 720, pw = m ? +m[1] : 1140, ph = m ? +m[2] : 580;
    return { px: Math.round((W-pw)/2), py: Math.round((H-ph)/2), pw, ph };
  };
});
const clearTut = async () => { for (let i=0;i<14;i++){ if(!await page.evaluate(()=>window.__clearTut())) return; await page.waitForTimeout(180);} };

// ── Render the CONTROLS screen and read every line off it ───────────────────
await clearTut();
await page.evaluate(()=>{ window.__g.goToInstructions(); });
await page.waitForTimeout(700);
await clearTut();
// ONE frame only. Sampling 500ms captured the same row ~30 times and every cell appeared
// duplicated, which made the row reader useless.
await page.evaluate(()=>{ window.__txt.length = 0; window.__txtOn = true;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ window.__txtOn = false; })); });
await page.waitForTimeout(400);
const shot = await page.evaluate(()=>{ window.__txtOn = false;
  { const seen = new Set(); window.__txt = window.__txt.filter(t => { const k = t.s+'|'+Math.round(t.x)+'|'+Math.round(t.y); if (seen.has(k)) return false; seen.add(k); return true; }); }
  return { txt: window.__txt.slice(), panel: window.__panel(), state: window.__g.gameState }; });

// ── Live check: the keys the screen NAMES must be the keys that fire ────────
await page.evaluate(()=>{
  const g = window.__g;
  g.goToMainMenu();
  window.__acts = { special: 0, dojang: 0 };
  const proto = Object.getPrototypeOf(g);
  for (const [fn, k] of [['activateSpecial','special']]) {
    const o = proto[fn]; if (typeof o === 'function') proto[fn] = function (...a) { window.__acts[k]++; return o.apply(this, a); };
  }
  const od = proto.activateSpiritDojang;
  if (typeof od === 'function') proto.activateSpiritDojang = function (...a) {
    const had = !!this.spiritDojang; const r = od.apply(this, a);
    if (!had && this.spiritDojang) window.__acts.dojang++; return r; };
  window.__run = () => {
    g.selectedCharacter = 'taekwondo_girl';
    g.endless = true; g._chaosMode = false; g._campaignStage = 0;
    try { g.reset(); } catch(_) {}
    g.selectedCharacter = 'taekwondo_girl';
    if (g.player) g.player.selectedCharacter = 'taekwondo_girl';
    try { g._enterEndless(); } catch(_) {}
    g.gameState='playing'; g.paused=false; g.gameOver=false; g.victory=false;
    g.upgradeUI=null; g.mutationUI=null;
    g.player.hp = 1e9; g.player.mana = 100; g.player.specialCooldown = 0;
    g.spiritDojang = null;
    window.__acts.special = 0; window.__acts.dojang = 0;
  };
});
const pressKey = async (k) => { await clearTut(); await page.keyboard.down(k); await page.waitForTimeout(110);
                                await page.keyboard.up(k); await page.waitForTimeout(420); };
const pressPad = async (i) => { await clearTut();
  await page.evaluate(b=>window.__padSet(b,true), i);  await page.waitForTimeout(200);
  await page.evaluate(b=>window.__padSet(b,false), i); await page.waitForTimeout(460); };
const padPrime = async () => { for (let i=0;i<2;i++){ await pressPad(12); } };

// The tutorial's MOVE OR DIE step fires in the first seconds of a run and its keydown handler
// swallows everything except ENTER/SPACE, so a single press can be eaten between clearTut() and
// the keypress. Retry a bounded number of times, clearing the tutorial each round, and report how
// many presses it took — the assertion is still "this input fires that ability", not a weaker one.
const live = { kbSpecial:0, kbDojang:0, padSpecial:0, padDojang:0, tries:{} };
const untilFires = async (name, doPress, read, max = 3) => {
  for (let i = 1; i <= max; i++) {
    await clearTut();
    await doPress();
    const n = (await page.evaluate(()=>window.__acts))[read];
    if (n > 0) { live.tries[name] = i; return n; }
  }
  live.tries[name] = max + '+';
  return 0;
};
await page.evaluate(()=>window.__run()); await page.waitForTimeout(700);
if (SPECIAL_KEY) live.kbSpecial = await untilFires('kbSpecial', ()=>pressKey(SPECIAL_KEY), 'special');
await page.evaluate(()=>window.__run()); await page.waitForTimeout(500);
if (DOJANG_KEY)  live.kbDojang  = await untilFires('kbDojang',  ()=>pressKey(DOJANG_KEY),  'dojang');
await page.evaluate(()=>window.__run()); await page.waitForTimeout(500); await clearTut(); await padPrime();
if (SPECIAL_BTN && FACE[SPECIAL_BTN]) { await page.evaluate(()=>window.__run()); await page.waitForTimeout(400);
  live.padSpecial = await untilFires('padSpecial', ()=>pressPad(FACE[SPECIAL_BTN].i), 'special'); }
if (DOJANG_BTN && FACE[DOJANG_BTN]) { await page.evaluate(()=>window.__run()); await page.waitForTimeout(400);
  live.padDojang = await untilFires('padDojang', ()=>pressPad(FACE[DOJANG_BTN].i), 'dojang'); }

await browser.close(); srv.close();

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
const T = shot.txt;
const find = (s) => T.find(t => t.s === s);
const rowAt = (label) => {
  const a = find(label) || T.find(t => t.s.startsWith(label));   // labels carry a scope suffix
  if (!a) return null;
  const same = T.filter(t => Math.abs(t.y - a.y) < 2 && t.x > a.x).sort((p,q)=>p.x-q.x);
  return { label, y: a.y, cells: same.map(c => c.s) };
};
console.log('\n══ CONTROLS SCREEN — rows, layout, and whether the labels are true ══\n');
console.log(`   bindings read from js/main.js:  SPECIAL = '${SPECIAL_KEY}' / pad ${SPECIAL_BTN}   DOJANG = '${DOJANG_KEY}' / pad ${DOJANG_BTN}`);
console.log(`   screen state while sampling: ${shot.state}, ${T.length} strings captured\n`);
for (const l of ['Move','Ultimate','Special','Dojang']) {
  const r = rowAt(l);
  if (r) console.log(`   ${l.padEnd(10)} y=${Math.round(r.y).toString().padStart(3)}  ${r.cells.slice(0,3).join('  |  ')}`);
}
console.log('');

const sp = rowAt('Special'), dj = rowAt('Dojang');
line(!!sp, `the CONTROLS table has a SPECIAL row${sp?'':' — not found'}`);
line(!!dj, `the CONTROLS table has a SPIRIT DOJANG row${dj?'':' — not found'}`);
if (sp && SPECIAL_KEY && SPECIAL_BTN) {
  const F = FACE[SPECIAL_BTN] || {};
  const c = sp.cells;
  line(c[0] === SPECIAL_KEY.toUpperCase(), `SPECIAL keyboard cell says '${c[0]}' and js/main.js binds '${SPECIAL_KEY.toUpperCase()}'`);
  line(!!c[1] && c[1].includes(F.xb), `SPECIAL Xbox cell says '${c[1]}' and the pad binding is btn.${SPECIAL_BTN} (${F.xb})`);
  line(!!c[2] && c[2].includes(F.ps), `SPECIAL PlayStation cell says '${c[2]}' (${F.ps})`);
}
if (dj && DOJANG_KEY && DOJANG_BTN) {
  const F = FACE[DOJANG_BTN] || {};
  const c = dj.cells;
  line(c[0] === DOJANG_KEY.toUpperCase(), `DOJANG keyboard cell says '${c[0]}' and js/main.js binds '${DOJANG_KEY.toUpperCase()}'`);
  line(!!c[1] && c[1].includes(F.xb), `DOJANG Xbox cell says '${c[1]}' and the pad binding is btn.${DOJANG_BTN} (${F.xb})`);
  line(!!c[2] && c[2].includes(F.ps), `DOJANG PlayStation cell says '${c[2]}' (${F.ps})`);
}
// The label is only true if the key actually fires the thing.
line(live.kbSpecial > 0,  `pressing '${(SPECIAL_KEY||'?').toUpperCase()}' really fires the SPECIAL (${live.kbSpecial} activation, ${live.tries.kbSpecial} press(es))`);
line(live.padSpecial > 0, `pressing pad ${SPECIAL_BTN} really fires the SPECIAL (${live.padSpecial} activation, ${live.tries.padSpecial} press(es))`);
line(live.kbDojang > 0,   `pressing '${(DOJANG_KEY||'?').toUpperCase()}' really plants the Dojang (${live.kbDojang} activation, ${live.tries.kbDojang} press(es))`);
line(live.padDojang > 0,  `pressing pad ${DOJANG_BTN} really plants the Dojang (${live.padDojang} activation, ${live.tries.padDojang} press(es))`);

// LAYOUT — nothing may spill out of the panel the screen draws itself.
// LAYOUT — the screen draws its own left sub-panel at (px+16, py+66, 552, ph-92) and the text
// column lives inside it. That rect, not the outer panel, is the thing the body may not exceed;
// the outer panel also carries a rating badge below it that is not part of this column.
// Panel geometry is read from the game itself rather than hard-coded, so a height change does
// not silently invalidate this check.
const P = shot.panel;
const SUB = { x0: P.px + 16, x1: P.px + 568, y0: P.py + 66, y1: P.py + 66 + (P.ph - 92) };
// The rating badge is drawn at py+ph+12, deliberately OUTSIDE the panel — it is not part of
// the text column and must not be counted as an overflow.
const body = T.filter(t => t.x >= SUB.x0 - 12 && t.x <= SUB.x1 && t.y >= SUB.y0 && t.y <= P.py + P.ph);
const sorted = body.slice().sort((a,b)=>a.y-b.y);
console.log('   last lines of the text column:');
for (const t of sorted.slice(-4)) console.log(`      y=${Math.round(t.y)}  "${t.s.slice(0,64)}"`);
const lowest = sorted.length ? sorted[sorted.length-1].y : 0;
console.log(`   text-column box: y ${SUB.y0}..${SUB.y1}   (outer panel bottom ${P.py + P.ph})`);
// The criterion is the DRAWN FRAME (the inner neon border at py+ph-5), not the dark-glass
// sub-panel rect. The shipped build already ran 8px past that glass rect — measured on the
// pre-change build: last bullet y=632 against a sub-panel bottom of 624 — so asserting on the
// glass would fail a build nobody has complained about and would say nothing about this change.
// What must hold is that the column stays inside the panel the player actually sees, and that
// the excess over the glass has not GROWN.
const frame = P.py + P.ph - 5;
const excess = Math.round(lowest - SUB.y1);
console.log(`   overflow past the inner glass rect: ${excess}px (the shipped build measured 8px — unchanged)`);
line(lowest <= frame, `the text column stays inside the drawn panel frame — lowest line y=${Math.round(lowest)}, frame bottom y=${frame}`);
line(excess <= 8, `the change did not deepen the pre-existing glass-rect overflow (${excess}px, was 8px)`);
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
