// DEAD CHARACTER ABILITIES — INPUT → ACTIVATION → EFFECT → COOLDOWN → SECOND ACTIVATION.
//
// Four abilities were fully implemented and completely unreachable: activateSpecial() had no
// caller anywhere in the repo (Bone Guard Blast, Lightning Dash + Crystal Ice Field, Overdrive
// Beam) and activateSpiritDojang() was in no input path.
//
// Each ability is driven through a REAL input on both paths — a keypress and the virtual pad,
// which reaches the game through main.js's padTap()/window.dispatchEvent bridge rather than the
// same route as a keypress. Nothing calls the activate* methods directly; if the binding is not
// there, the test fails, which is exactly what the baseline run shows.
//
// Every stage is a separate assertion, so "it fired but did nothing" and "it fired twice through
// its cooldown" cannot hide inside a single pass.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9620;
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

// Each ability: who casts it, which key / pad button, and the state that proves it ran.
const ABILITIES = [
  { name: 'Bone Guard Blast',            char: 'skeleton_warrior', key: 'c', btn: 2, kind: 'special',
    probe: 'rings',  label: 'special ring spawned' },
  { name: 'Lightning Dash + Ice Field',  char: 'taekwondo_girl',   key: 'c', btn: 2, kind: 'special',
    probe: 'ice',    label: 'ice field spawned' },
  { name: 'Overdrive Beam',              char: 'cyber_arm_hero',   key: 'c', btn: 2, kind: 'special',
    probe: 'beams',  label: 'beam spawned' },
  { name: 'Spirit Dojang',               char: 'taekwondo_girl',   key: 'v', btn: 0, kind: 'mana',
    probe: 'dojang', label: 'dojang field planted' },
];

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

  window.__start = (ch) => {
    g.selectedCharacter = ch;
    g.endless = true; g._chaosMode = false; g._campaignStage = 0;
    try { g.reset(); } catch(_) {}
    g.selectedCharacter = ch;
    if (g.player) g.player.selectedCharacter = ch;
    try { g._enterEndless(); } catch(_) {}
    g.gameState='playing'; g.paused=false; g.gameOver=false; g.victory=false;
    g.upgradeUI=null; g.mutationUI=null;
    const p = g.player;
    p.hp = 1e9; p.maxHp = 1e9; p.takeDamage = () => {}; p.takeHit = () => {};
    p.mana = 100; p.specialCooldown = 0;
    // A ring of dummies inside every ability's reach: Bone Guard 210, Overdrive beam 600x28
    // forward, ice field and dojang centred on the player.
    const V = p.pos.constructor;
    g.enemies.length = 0;
    window.__dummies = [];
    for (const [dx,dy] of [[70,0],[140,0],[200,0],[300,0],[420,0],[-90,0],[0,80],[0,-80],[110,40],[-110,-40]]) {
      const e = { pos: new V(p.pos.x+dx, p.pos.y+dy), vel: new V(0,0), hp: 1e9, maxHp: 1e9,
                  radius: 18, dead: false, taken: 0, isMegaBoss: false, isElite: false,
                  isBoss: () => false,
                  takeHit(d) { this.taken += (typeof d === 'number' ? d : 0); },
                  takeDamage(d) { this.taken += (typeof d === 'number' ? d : 0); },
                  keepInBounds() {}, update() {}, draw() {} };
      g.enemies.push(e); window.__dummies.push(e);
    }
    g.spatialGrid = { getNearby: () => g.enemies, insert(){}, clear(){}, query: () => g.enemies };
    if (window.__acts) { window.__acts.rings = 0; window.__acts.ice = 0; window.__acts.beams = 0; window.__acts.dojang = 0; }
    // The cyber-arm beam aims at the last mouse position; point it along the dummy line.
    try { g.setMousePos?.({ x: 1100, y: 360 }); } catch(_) {}
    g._lastMousePos = { x: 1100, y: 360 };
    return true;
  };
  // Hold the run open: a level-up panel or a death would silently gate every ability.
  setInterval(() => {
    if (g.gameState !== 'playing') return;
    g.upgradeUI = null; g.mutationUI = null; g.paused = false; g.gameOver = false; g.victory = false;
    if (g.player) g.player.hp = 1e9;
    const refs = window.__dummies;
    if (refs) { if (g.enemies.length > 22) g.enemies.length = 22;
                for (const d of refs) if (!g.enemies.includes(d)) g.enemies.push(d); }
  }, 40);

  // ACTIVATION is counted CUMULATIVELY at the ability boundary, not by sampling the VFX lists.
  // _specialRings live 0.55s and _specialBeams 0.4s, so polling their length after an input round
  // trip reports 0 for an ability that fired perfectly — the first version of this file failed
  // Overdrive Beam while simultaneously recording 50 damage from it. Nothing here calls these
  // methods; the only route to them is still activateSpecial() from a real key or pad button, so
  // a missing binding still fails.
  window.__acts = { rings: 0, ice: 0, beams: 0, dojang: 0 };
  const proto = Object.getPrototypeOf(g);
  for (const [fn, k] of [['_activateBoneGuardBlast','rings'], ['_activateLightningDashStrike','ice'],
                         ['_activateOverdriveBeam','beams']]) {
    const o = proto[fn];
    if (typeof o === 'function') proto[fn] = function (...a) { window.__acts[k]++; return o.apply(this, a); };
  }
  {
    const o = proto.activateSpiritDojang;
    if (typeof o === 'function') proto.activateSpiritDojang = function (...a) {
      const had = !!this.spiritDojang;            // an early return (no mana / already up) is NOT a cast
      const r = o.apply(this, a);
      if (!had && this.spiritDojang) window.__acts.dojang++;
      return r;
    };
  }
  window.__snap = () => {
    const g2 = window.__g, p = g2.player;
    const A = window.__acts;
    return { rings: A.rings, ice: A.ice, beams: A.beams, dojang: A.dojang,
             liveRings: (g2._specialRings || []).length, liveIce: (g2._iceFields || []).length,
             cd: Math.round((p.specialCooldown || 0) * 100) / 100,
             cdMax: p.specialMaxCooldown || 0, mana: Math.round(p.mana),
             dmg: (window.__dummies || []).reduce((a,e)=>a+(e.taken||0), 0) };
  };
  window.__zeroDmg = () => { for (const e of (window.__dummies||[])) e.taken = 0; };
  window.__readyAgain = (kind) => {          // simulate the cooldown having elapsed / mana regained
    const p = window.__g.player;
    if (kind === 'special') p.specialCooldown = 0;
    else { window.__g.spiritDojang = null; p.mana = 100; }
  };
});

const clearTut = async () => { for (let i=0;i<14;i++){ if(!await page.evaluate(()=>window.__clearTut())) return; await page.waitForTimeout(180);} };
const press = async (how, a) => {
  await clearTut();
  if (how === 'keyboard') {
    await page.keyboard.down(a.key); await page.waitForTimeout(110);
    await page.keyboard.up(a.key);   await page.waitForTimeout(420);
  } else {
    await page.evaluate(b=>window.__padSet(b,true), a.btn);  await page.waitForTimeout(200);
    await page.evaluate(b=>window.__padSet(b,false), a.btn); await page.waitForTimeout(460);
  }
};
// Headless drops the odd pad edge (documented across this folder); prime once so the first real
// press of the run is not the one spent activating the pad.
const padPrime = async () => {
  for (let i = 0; i < 2; i++) {
    await page.evaluate(()=>window.__padSet(12,true)); await page.waitForTimeout(150);
    await page.evaluate(()=>window.__padSet(12,false)); await page.waitForTimeout(200);
  }
};

let pass=0, fail=0; const R={};
const line=(k,ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; if(R[k]!==false) R[k]=ok; };
console.log('\n══ DEAD CHARACTER ABILITIES — driven through real input, keyboard and controller ══\n');

for (const a of ABILITIES) {
  for (const how of ['keyboard','controller']) {
    await page.evaluate((c)=>window.__start(c), a.char);
    await page.waitForTimeout(700);
    await clearTut();
    if (how === 'controller') await padPrime();
    await page.evaluate(()=>{ window.__zeroDmg(); });
    const before = await page.evaluate(()=>window.__snap());

    // 1. INPUT -> 2. ACTIVATION
    await press(how, a);
    const afterOne = await page.evaluate(()=>window.__snap());
    const fired = afterOne[a.probe] > before[a.probe];
    line(a.name, fired, `${a.name} [${how}] INPUT '${how==='keyboard'?a.key.toUpperCase():'pad btn '+a.btn}' -> ACTIVATION: ${a.label} ${before[a.probe]} -> ${afterOne[a.probe]}`);

    // 3. EFFECT — real damage on the dummy ring (the two damage-over-time abilities need a moment)
    await page.waitForTimeout(a.probe === 'rings' || a.probe === 'beams' ? 250 : 1400);
    const eff = await page.evaluate(()=>window.__snap());
    line(a.name, eff.dmg > 0, `${a.name} [${how}] EFFECT: ${eff.dmg} damage dealt to the dummy ring`);

    // 4. COOLDOWN — armed, and a second press inside it must NOT re-activate
    const gated = await page.evaluate(()=>window.__snap());
    const cdArmed = a.kind === 'special' ? gated.cd > 0 : gated.mana < 100 && !!(await page.evaluate(()=>!!window.__g.spiritDojang));
    await press(how, a);
    const afterGated = await page.evaluate(()=>window.__snap());
    const blocked = afterGated[a.probe] === gated[a.probe];   // cumulative: no NEW cast got through
    line(a.name, cdArmed && blocked,
      `${a.name} [${how}] COOLDOWN: ${a.kind === 'special' ? `${gated.cd}s of ${gated.cdMax}s armed` : `mana ${gated.mana}/100, field live`} and a second press was refused (${gated[a.probe]} -> ${afterGated[a.probe]})`);

    // 5. SECOND ACTIVATION once the gate clears
    await page.evaluate((k)=>window.__readyAgain(k), a.kind);
    await page.waitForTimeout(200);
    const preTwo = await page.evaluate(()=>window.__snap());
    await press(how, a);
    const afterTwo = await page.evaluate(()=>window.__snap());
    line(a.name, afterTwo[a.probe] > preTwo[a.probe],
      `${a.name} [${how}] SECOND ACTIVATION after the gate cleared: ${preTwo[a.probe]} -> ${afterTwo[a.probe]}`);
  }
}

// The ultimate and the dash must be untouched by the two new bindings.
await page.evaluate(()=>window.__start('taekwondo_girl'));
await page.waitForTimeout(600);
await clearTut();
const ultBefore = await page.evaluate(()=>({ mana: window.__g.player.mana }));
await page.keyboard.down(' '); await page.waitForTimeout(110); await page.keyboard.up(' ');
await page.waitForTimeout(600);
const ultAfter = await page.evaluate(()=>({ mana: window.__g.player.mana }));
line('REGRESSION', ultAfter.mana < ultBefore.mana, `SPACE still casts the ultimate — mana ${ultBefore.mana} -> ${ultAfter.mana}`);
const dash = await page.evaluate(async ()=>{
  const g = window.__g, p = g.player;
  const before = p.dashCooldown ?? p.dashCd ?? null;
  return { has: before !== null };
});
await page.keyboard.down('Shift'); await page.waitForTimeout(160); await page.keyboard.up('Shift');
await page.waitForTimeout(400);
const dashAfter = await page.evaluate(()=>({ cd: window.__g.player.dashCooldown ?? window.__g.player.dashCd ?? -1,
                                             dashing: !!(window.__g.player.isDashing || window.__g.player.dashing) }));
line('REGRESSION', !dash.has || dashAfter.cd !== 0 || dashAfter.dashing,
  `SHIFT dash still responds — cooldown=${dashAfter.cd}, dashing=${dashAfter.dashing}`);

await browser.close(); srv.close();
console.log('');
line('ERRORS', errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));
console.log('\n   ' + ABILITIES.map(a => `${a.name} ${R[a.name] ? 'PASS' : 'FAIL'}`).join('\n   '));
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
