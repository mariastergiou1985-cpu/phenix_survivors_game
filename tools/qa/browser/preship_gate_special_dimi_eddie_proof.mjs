// ════════════════════════════════════════════════════════════════════════════════
// FINAL PRE-SHIP — the four gameplay claims, each measured from the running game.
//
//   A. ENDLESS / CHAOS UNLOCK GATE. Both modes gate on meta.isEndlessUnlocked(), which is
//      `endlessUnlocked === true || allStagesCleared()`. _load() backfills endlessUnlocked from
//      _hasEndlessHistory(), and that used to count log_1997 / log_1998 — two keys that sit in the
//      random secret-skin pool campaign pays out on every FIRST stage clear. 60 fresh saves are
//      driven through the campaign ladder with the real MetaProgress, reloaded after every clear,
//      and asked the same question the main menu asks.
//
//   B. SPECIAL CONTROL TRUTH. Which characters have a working SPECIAL is measured by calling
//      activateSpecial() on all ten in a live run; what the CONTROLS screen PROMISES is read off
//      the drawn canvas. A character the screen promises but the runtime ignores is a dead binding.
//
//   C. DIMI DUPLICATE INPUT. SPACE (activateDimiAngelUltimate) and C (activateSpecial) both used to
//      call _activateCyberAngelNova off the SAME 25s cooldown. Tested with the cooldown at zero and
//      in both orders — one ability behind two buttons shows up as "the second one did nothing".
//
//   D. EDDIE — be_solo_of_the_damned. Driven through the SHIPPED level-up path (weightedSample ->
//      _injectWeaponCard -> UpgradeUI -> selectUpgrade), picking the recipe the way a player
//      building it would, and counting how many real panels it takes for the catalyst and then the
//      evolution card to appear.
//
// Run: node tools/qa/browser/preship_gate_special_dimi_eddie_proof.mjs [port]
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 9672;
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
const GAME_SRC = fs.readFileSync(path.join(ROOT,'js/game/Game.js'),'utf8');
const GAME_V   = fs.readFileSync(path.join(ROOT,'js/main.js'),'utf8').match(/Game\.js\?v=(\d+)/)[1];
const META_V   = GAME_SRC.match(/MetaProgress\.js\?v=(\d+)/)[1];
const UPG_V    = (GAME_SRC.match(/Upgrades\.js\?v=(\d+)/) || [])[1] || GAME_V;
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));

let pass=0, fail=0;
const line=(ok,msg)=>{ console.log((ok?'  PASS  ':'  FAIL  ')+msg); ok?pass++:fail++; };
const out = {};

// ── The model used in part A is not invented here: it is the campaign clear path, read out of
//    the shipped source so a future edit that moves the payout makes this proof stale loudly.
const _ccsAt = GAME_SRC.indexOf('_completeCampaignStage() {');
const CCS = _ccsAt < 0 ? '' : GAME_SRC.slice(_ccsAt, _ccsAt + 2500);
const modelOk = /clearStage\(/.test(CCS) && /unlockRandomSecretSkin/.test(CCS);

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
  // capture every string the instructions screen paints, with where it landed
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
  window.__run = (ch, opts) => {
    const o = opts || {};
    g.selectedCharacter = ch;
    g.endless = !o.campaign; g._chaosMode = false; g._campaignStage = o.campaign ? (o.stage || 1) : 0;
    try { g.reset(); } catch(_) {}
    g.selectedCharacter = ch;
    if (g.player) g.player.selectedCharacter = ch;
    if (!o.campaign) { try { g._enterEndless(); } catch(_) {} }
    g.gameState='playing'; g.paused=false; g.gameOver=false; g.victory=false;
    g.upgradeUI=null; g.mutationUI=null;
    g.player.hp = 1e9; g.player.maxHp = 1e9;
    g.player.takeDamage = () => {}; g.player.takeHit = () => {};
  };
});
const clearTut = async () => { for (let i=0;i<14;i++){ if(!await page.evaluate(()=>window.__clearTut())) return; await page.waitForTimeout(180);} };

console.log('\n══ FINAL PRE-SHIP — unlock gate · SPECIAL truth · Dimi · Eddie evolution ══\n');

// ════ A. 60 FRESH SAVES THROUGH THE CAMPAIGN LADDER ════════════════════════
console.log('── A. Endless / Chaos unlock gate ──');
line(modelOk, `the drive below mirrors the shipped _completeCampaignStage (clearStage + unlockRandomSecretSkin found in source: ${modelOk})`);
const gate = await page.evaluate(async ({ v, N }) => {
  const { MetaProgress } = await import(`./js/game/MetaProgress.js?v=${v}`);
  const early = [], byStage = {};
  let stage7Unlocked = 0, persisted = 0, skinsDrawn = 0;
  for (let i = 0; i < N; i++) {
    localStorage.clear();
    let firstEarly = 0;
    for (let n = 1; n <= 7; n++) {
      // exactly what _completeCampaignStage does on a first clear
      const m = new MetaProgress();
      if (m.clearStage(n)) { if (m.unlockRandomSecretSkin()) skinsDrawn++; }
      // reload the save the way the next launch does — this is where the backfill runs
      const r = new MetaProgress();
      if (n < 7 && r.isEndlessUnlocked() && !firstEarly) {
        firstEarly = n;
        byStage[n] = (byStage[n] || 0) + 1;
      }
    }
    if (firstEarly) early.push(firstEarly);
    const after = new MetaProgress();
    if (after.isEndlessUnlocked()) stage7Unlocked++;
    // persistence: a completely fresh read of the same save still shows it open
    const again = new MetaProgress();
    if (again.isEndlessUnlocked() && again.stagesCleared === 7) persisted++;
  }
  localStorage.clear();
  return { N, early: early.length, byStage, stage7Unlocked, persisted, skinsDrawn };
}, { v: META_V, N: 60 });
console.log(`   ${gate.N} fresh saves · ${gate.skinsDrawn} secret skins drawn by campaign clears`);
console.log(`   early unlocks (before stage 7): ${gate.early}/${gate.N}  ${JSON.stringify(gate.byStage)}`);
line(gate.skinsDrawn > 0, `campaign really did pay secret skins during the drive (${gate.skinsDrawn}) — the pressure this fix is under is present`);
line(gate.early === 0, `Early mode unlocks: ${gate.early}/${gate.N}`);
line(gate.stage7Unlocked === gate.N, `stage 7 clear opens ENDLESS + CHAOS: ${gate.stage7Unlocked}/${gate.N}`);
line(gate.persisted === gate.N, `and it survives a reload: ${gate.persisted}/${gate.N}`);
out.early = gate.early; out.stage7 = (gate.stage7Unlocked === gate.N && gate.persisted === gate.N);

// The same question through the REAL game method, once, so the model above is not the only witness.
await page.evaluate(()=>window.__run('skeleton_warrior', { campaign: true, stage: 1 }));
await page.waitForTimeout(500); await clearTut();
const liveClear = await page.evaluate(async ({ v }) => {
  const { MetaProgress } = await import(`./js/game/MetaProgress.js?v=${v}`);
  const g = window.__g;
  localStorage.clear();
  g.meta = new MetaProgress();
  g._campaignStage = 1;
  const before = g.meta.isEndlessUnlocked();
  try { g._completeCampaignStage(); } catch (e) { return { err: String(e) }; }
  const skins = Object.keys(g.meta.unlocks || {});
  const reloaded = new MetaProgress();
  const r = { before, stagesCleared: reloaded.stagesCleared, skins,
              after: reloaded.isEndlessUnlocked() };
  localStorage.clear();
  g._stageCompleteBanner = null; g.paused = false;
  return r;
}, { v: META_V });
console.log(`   live _completeCampaignStage(1): stagesCleared=${liveClear.stagesCleared} unlocks=${JSON.stringify(liveClear.skins)} endlessOpen=${liveClear.after}`);
line(!liveClear.err, `the real campaign clear path ran${liveClear.err ? ' — ' + liveClear.err : ''}`);
line(liveClear.stagesCleared === 1 && liveClear.after === false,
     `one real stage clear does NOT open Endless (stagesCleared=${liveClear.stagesCleared}, open=${liveClear.after})`);

// ════ B. SPECIAL — what works vs what the screen promises ══════════════════
console.log('\n── B. SPECIAL control truth ──');
const ROSTER_IDS = ['skeleton_warrior','taekwondo_girl','cyber_arm_hero','brawler_warrior','assassin_clone',
                    'euclid_vector','oni_cataclysm_protocol','japan_phasewalker','dimis_kickboxer','eddie'];
// Every display name the shipped source gives each character — the roster tables disagree on case
// and on the marketing prefix ('Cyber Skeleton Warrior' vs 'SKELETON WARRIOR'), so all of them are
// collected and the screen is matched against ANY of them rather than against one arbitrary pick.
const ALLNAMES = {};
for (const s of (GAME_SRC.match(/id: '([a-z0-9_]+)',\s*\n?\s*name: '([^']+)'/g) || [])) {
  const m = /id: '([a-z0-9_]+)',\s*\n?\s*name: '([^']+)'/.exec(s);
  if (!m || !ROSTER_IDS.includes(m[1])) continue;
  (ALLNAMES[m[1]] ||= []).push(m[2]);
}
const NAMES = Object.fromEntries(ROSTER_IDS.map(id => [id, (ALLNAMES[id] || [id])[0]]));

const works = {};
for (const id of ROSTER_IDS) {
  await page.evaluate(c=>window.__run(c), id);
  await page.waitForTimeout(260); await clearTut();
  works[id] = await page.evaluate(() => {
    const g = window.__g, p = g.player;
    p.specialCooldown = 0;
    const before = { cd: p.specialCooldown, rings: (g._specialRings||[]).length, ft: (g.floatingTexts||[]).length,
                     dojang: !!g.spiritDojang, beam: !!g._overdriveBeam };
    try { g.activateSpecial(); } catch (_) {}
    const after  = { cd: p.specialCooldown, rings: (g._specialRings||[]).length, ft: (g.floatingTexts||[]).length,
                     dojang: !!g.spiritDojang, beam: !!g._overdriveBeam };
    return after.cd > 0 || after.rings > before.rings || after.ft > before.ft ||
           after.dojang !== before.dojang || after.beam !== before.beam;
  });
}
const realSpecials = ROSTER_IDS.filter(id => works[id]);
console.log(`   activateSpecial() actually fires for: ${realSpecials.map(i=>NAMES[i]||i).join(', ')}`);
console.log(`   silent for: ${ROSTER_IDS.filter(id=>!works[id]).map(i=>NAMES[i]||i).join(', ')}`);

// What the CONTROLS screen promises. Sampled over ~450ms rather than a single animation frame and
// deduped by (string, x, y): a one-frame capture came back EMPTY on one run out of two, and an
// empty capture reads as "the screen promises everyone", which would be a fabricated failure.
// The loop retries until the screen has actually painted, and the count is asserted below.
let shot = null;
for (let attempt = 1; attempt <= 4; attempt++) {
  await page.evaluate(()=>{ window.__g.goToInstructions(); });
  await page.waitForTimeout(600); await clearTut();
  await page.evaluate(()=>{ window.__txt.length = 0; window.__txtOn = true;
    setTimeout(()=>{ window.__txtOn = false; }, 450); });
  await page.waitForTimeout(700);
  shot = await page.evaluate(()=>{ window.__txtOn = false;
    const seen = new Set();
    const txt = window.__txt.filter(t => { const k=t.s+'|'+Math.round(t.x)+'|'+Math.round(t.y);
      if (seen.has(k)) return false; seen.add(k); return true; });
    const src = window.__g.constructor.prototype._drawInstructionsScreen.toString();
    const m = src.match(/const pw = (\d+), ph = (\d+);/);
    const W = 1280, H = 720, pw = m ? +m[1] : 1140, ph = m ? +m[2] : 606;
    return { txt, panel: { px: Math.round((W-pw)/2), py: Math.round((H-ph)/2), pw, ph }, state: window.__g.gameState };
  });
  if (shot.txt.length > 20 && shot.state === 'instructions') break;
  console.log(`   (capture attempt ${attempt}: state=${shot.state}, ${shot.txt.length} strings — retrying)`);
}
const T = shot.txt;
console.log(`   screen state while sampling: ${shot.state}, ${T.length} strings captured`);
line(T.length > 20 && shot.state === 'instructions',
     `the CONTROLS screen really painted while it was sampled (${T.length} strings, state=${shot.state})`);
const specialRow = T.find(t => /^Special\b/.test(t.s));
// Scope text = the SPECIAL row's own label + any line the CONTROLS block draws that starts with
// SPECIAL. An UNSCOPED row names nobody, which is exactly how it promises the whole roster.
const scopeLine = T.find(t => /^SPECIAL[: ]/.test(t.s));
const scopeText = (specialRow ? specialRow.s : '') + ' ' + (scopeLine ? scopeLine.s : '');
const SCOPE_U = scopeText.toUpperCase();
const namedIds = ROSTER_IDS.filter(id => (ALLNAMES[id] || []).some(n => {
  const u = n.toUpperCase();
  // also match the distinctive tail ("CYBER SKELETON WARRIOR" -> "SKELETON WARRIOR"), because the
  // screen has one line to name three characters and drops the marketing prefix to fit
  const short = u.split(' ').slice(-2).join(' ');
  return SCOPE_U.includes(u) || SCOPE_U.includes(short);
}));
const promised = namedIds.length ? namedIds : ROSTER_IDS.slice();   // unscoped row promises everyone
console.log(`   SPECIAL row label: "${specialRow ? specialRow.s : '(missing)'}"`);
console.log(`   scope line:        "${scopeLine ? scopeLine.s : '(none — the row names nobody, so it promises all 10)'}"`);
console.log(`   screen promises ${promised.length}: ${promised.map(i=>NAMES[i]||i).join(', ')}`);
const dead    = promised.filter(id => !works[id]);
const missing = realSpecials.filter(id => !promised.includes(id));
console.log(`   dead (promised, does nothing): ${dead.length ? dead.map(i=>NAMES[i]||i).join(', ') : 'none'}`);
line(!!specialRow, `the CONTROLS table still has a SPECIAL row`);
line(dead.length === 0, `Dead/misleading SPECIAL bindings: ${dead.length}`);
line(missing.length === 0, `no character with a real SPECIAL is left off the screen (${missing.length} missing)`);
out.dead = dead.length;

// LAYOUT — the extra line must not push the column out of the panel it is drawn in.
const P = shot.panel;
const SUB = { x0: P.px + 16, x1: P.px + 568, y0: P.py + 66, y1: P.py + 66 + (P.ph - 92) };
const body = T.filter(t => t.x >= SUB.x0 - 12 && t.x <= SUB.x1 && t.y >= SUB.y0 && t.y <= P.py + P.ph)
              .sort((a,b)=>a.y-b.y);
const lowest = body.length ? body[body.length-1].y : 0;
const frame  = P.py + P.ph - 5;
const excess = Math.round(lowest - SUB.y1);
console.log(`   panel ph=${P.ph}  lowest line y=${Math.round(lowest)}  frame bottom y=${frame}  glass overflow ${excess}px (was 8px)`);
line(lowest <= frame, `the text column stays inside the drawn panel frame`);
line(excess <= 8, `the added line did not deepen the pre-existing glass-rect overflow (${excess}px)`);
if (scopeLine) {
  // 10px Consolas ~ 6.0px/char; the note must not run past the sub-panel
  const w = await page.evaluate((s)=>{ const c=document.createElement('canvas').getContext('2d');
    c.font='10px Consolas, monospace'; return c.measureText(s).width; }, scopeLine.s);
  console.log(`   scope line width ${Math.round(w)}px in a ${SUB.x1 - scopeLine.x}px column`);
  line(scopeLine.x + w <= SUB.x1, `the scope line fits inside the text column`);
}

// ════ C. DIMI — one ability, two buttons? ══════════════════════════════════
console.log('\n── C. Dimi duplicate input ──');
// Full snapshots either side of every call, so a surprising reading shows its own working instead
// of collapsing into an unexplained boolean.
const dimiOrder = async (order) => {
  await page.evaluate(()=>window.__run('dimis_kickboxer')); await page.waitForTimeout(300); await clearTut();
  return page.evaluate((ord) => {
    const g = window.__g, p = g.player;
    // re-arm the run state: the instructions screen rendered in part B and the tutorial overlay both
    // move gameState, and the question here is "is C the same ability as SPACE", not "do the pause
    // guards hold" — that is the controller-gate proof's job.
    g.gameState = 'playing'; g.paused = false; g.gameOver = false; g.victory = false;
    g.upgradeUI = null; g.mutationUI = null;
    const snap = () => ({ cd: p.specialCooldown, ang: (g._dimiAngels||[]).length,
                          rings: (g._specialRings||[]).length });
    const errs = [];
    const call = (fn) => { try { g[fn](); } catch (e) { errs.push(fn + ': ' + String(e).slice(0,140)); } };
    p.specialCooldown = 0;
    const s0 = snap();
    call(ord === 'c' ? 'activateSpecial' : 'activateDimiAngelUltimate');
    const s1 = snap();
    call(ord === 'c' ? 'activateDimiAngelUltimate' : 'activateSpecial');
    const s2 = snap();
    const fired = (a, b) => b.cd > a.cd || b.ang > a.ang;
    return { s0, s1, s2, errs, first: fired(s0, s1), second: fired(s1, s2) };
  }, order);
};
const cFirst = await dimiOrder('c');       // C, then SPACE
const spaceFirst = await dimiOrder('space');   // SPACE, then C
const dimi = { cFirst:  { cDid: cFirst.first,      spaceDid: cFirst.second },
               spaceFirst: { spaceDid: spaceFirst.first, cDid: spaceFirst.second } };
console.log(`   C then SPACE: ${JSON.stringify(cFirst.s0)} -C-> ${JSON.stringify(cFirst.s1)} -SPACE-> ${JSON.stringify(cFirst.s2)}${cFirst.errs.length?' errs='+cFirst.errs.join(';'):''}`);
console.log(`   SPACE then C: ${JSON.stringify(spaceFirst.s0)} -SPACE-> ${JSON.stringify(spaceFirst.s1)} -C-> ${JSON.stringify(spaceFirst.s2)}${spaceFirst.errs.length?' errs='+spaceFirst.errs.join(';'):''}`);
console.log(`   C then SPACE: C fired=${dimi.cFirst.cDid}, SPACE then fired=${dimi.cFirst.spaceDid}`);
console.log(`   SPACE then C: SPACE fired=${dimi.spaceFirst.spaceDid}, C then fired=${dimi.spaceFirst.cDid}`);
const dupe = dimi.cFirst.cDid || dimi.spaceFirst.cDid;
line(dimi.cFirst.spaceDid && dimi.spaceFirst.spaceDid, `SPACE still fires the Cyber-Angel Nova in both orders — the ultimate is untouched`);
line(!dupe, `Dimi duplicate ability: ${dupe ? 'YES' : 'NO'} (C fires nothing for Dimi)`);
out.dimiDupe = dupe;

// ════ D. EDDIE — be_solo_of_the_damned through the real level-up path ══════
console.log('\n── D. Eddie · Solo of the Damned ──');
await page.evaluate(()=>window.__run('eddie')); await page.waitForTimeout(500); await clearTut();
const eddie = await page.evaluate(async ({ v }) => {
  const g = window.__g, p = g.player;
  const mod = await import(`./js/game/Upgrades.js?v=${v}`);
  const ws  = mod.weightedSample;
  const seen = { catalystOffers: 0, firstCatalystPanel: 0, evoPanel: 0 };
  let panels = 0;
  const log = [];
  for (let i = 0; i < 140; i++) {
    // the SHIPPED level-up body, lines 12498-12503 of Game.js
    const choices = ws(p, 3, { meta: g.meta, endless: g.endless, chaos: g._chaosMode });
    g._injectWeaponCard(choices);
    if (!choices.length) break;
    panels++;
    const keys = choices.map(c => c && c.key);
    if (keys.includes('be_p_forbidden_amplifier')) {
      seen.catalystOffers++;
      if (!seen.firstCatalystPanel) seen.firstCatalystPanel = panels;
    }
    const evoIdx = keys.findIndex(k => k === 'be_evo_be_solo_of_the_damned');
    if (evoIdx >= 0 && !seen.evoPanel) seen.evoPanel = panels;
    // A player building this recipe: evolution > catalyst > the weapon's own upgrade card, and
    // otherwise a plain stat card rather than a NEW weapon — acquiring weapons dilutes the legacy
    // pool that Solo Red Thunder's own upgrade card is drawn from, which is not what someone
    // chasing this evolution does.
    let pick = evoIdx;
    if (pick < 0) pick = keys.indexOf('be_p_forbidden_amplifier');
    if (pick < 0) pick = keys.indexOf('_wupg_solo_red_thunder');
    if (pick < 0) pick = keys.findIndex(k => k && !String(k).startsWith('_wacq_'));
    if (pick < 0) pick = 0;
    log.push(panels + ':' + keys.map((k,j)=> (j===pick?'*':'')+k).join(' | '));
    try { choices[pick].apply(p, g); } catch (_) {}
    if (seen.evoPanel && g.buildEngine?.weapons?.get('solo_red_thunder')?.evolved) break;
  }
  const be = g.buildEngine;
  return { panels, ...seen,
           weaponLevel: g._weaponLevels?.get('solo_red_thunder') || 0,
           catalystLevel: be?.passives?.get('forbidden_amplifier') || 0,
           evolved: !!be?.weapons?.get('solo_red_thunder')?.evolved,
           tail: log.slice(-4) };
}, { v: UPG_V });
console.log(`   ${eddie.panels} real level-up panels driven`);
console.log(`   forbidden_amplifier offered ${eddie.catalystOffers}x (first at panel ${eddie.firstCatalystPanel || '-'})`);
console.log(`   solo_red_thunder Lv${eddie.weaponLevel}/5 · forbidden_amplifier Lv${eddie.catalystLevel}/3 · evolution card at panel ${eddie.evoPanel || '-'} · evolved=${eddie.evolved}`);
for (const l of eddie.tail) console.log(`      ${l}`);
// A REAL RUN'S CARD BUDGET, derived from the shipped pacing rule rather than guessed: one card per
// level up to 19, then every second level (Game.js `_nextCardLevel = level + (level >= 20 ? 2 : 1)`).
// The RC pass measured Endless deaths at 5.8-7.4 min with survivors reaching level 33-40, so a good
// run sees roughly 19 + (40-20)/2 = 29 panels. "Reachable" has to mean reachable inside that, which
// is why the count matters and not merely whether an unbounded loop eventually gets there.
const BUDGET = 29;
line(eddie.catalystOffers > 0, `the catalyst is reachable at all — offered ${eddie.catalystOffers}x in ${eddie.panels} panels`);
line(!!eddie.firstCatalystPanel && eddie.firstCatalystPanel <= BUDGET,
     `and reachable inside a real run's card budget — first offered at panel ${eddie.firstCatalystPanel || 'never'} of ${BUDGET}`);
line(eddie.catalystLevel >= 3, `the catalyst can be taken to its real cap (Lv${eddie.catalystLevel}/3)`);
line(eddie.weaponLevel >= 5, `the weapon half still reaches Lv5 through its own legacy card (Lv${eddie.weaponLevel}/5)`);
line(!!eddie.evoPanel, `the EVOLUTION card appears once the real requirements are met (panel ${eddie.evoPanel || 'never'})`);
line(eddie.evolved, `Solo of the Damned reachable: ${eddie.evolved ? 'PASS' : 'FAIL'}`);
// The weapon half is legacy pacing this change does not touch: _wupg_solo_red_thunder is drawn from
// the legacy pool in slot 0 like every other weapon's upgrade card. Reported, not asserted.
console.log(`   (weapon half took until panel ~${eddie.panels}; that is legacy card pacing, untouched by this fix)`);
out.eddie = eddie.evolved;

await browser.close(); srv.close();
line(errs.length === 0, `zero page/console errors (${errs.length})` + (errs.length?' :: '+errs.slice(0,2).join(' | '):''));

console.log('');
console.log(`  Early mode unlocks: ${out.early}/60`);
console.log(`  Stage 7 unlock: ${out.stage7 ? 'PASS' : 'FAIL'}`);
console.log(`  Dead/misleading SPECIAL bindings: ${out.dead}`);
console.log(`  Dimi duplicate ability: ${out.dimiDupe ? 'YES' : 'NO'}`);
console.log(`  Solo of the Damned reachable: ${out.eddie ? 'PASS' : 'FAIL'}`);
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail?1:0);
